import { normalizePath, Platform, type DataAdapter } from "obsidian";
import { satisfies } from "semver";
import manifestJson from "../../manifest.json";
import type { SettingsStore } from "../persistence/SettingsStore";
import type {
  ModuleInstallation,
  ModuleSourceType,
} from "../persistence/settings-types";
import type { WorkerCoordinator } from "../workers/WorkerCoordinator";
import { moduleManifestErrors, moduleManifestSchema, validateModuleManifest } from "./module-schema";
import type { ModuleManifest } from "./module-types";

const REQUIRED_FILES = [
  "manifest.json",
  "main.js",
  "styles.css",
  "config.schema.json",
  "README.md",
] as const;

export interface InstallModuleOptions {
  sourceType: ModuleSourceType;
  sourceId?: string;
  expectedSha256?: string;
}

export class ModuleInstaller {
  private readonly diyRoot: string;
  private readonly stagingRoot: string;

  public constructor(
    private readonly adapter: DataAdapter,
    pluginDirectory: string,
    private readonly settingsStore: SettingsStore,
    private readonly workers: WorkerCoordinator,
  ) {
    this.diyRoot = normalizePath(`${pluginDirectory}/diy-plugins`);
    this.stagingRoot = normalizePath(`${pluginDirectory}/staging`);
  }

  public async install(
    archive: Uint8Array,
    options: InstallModuleOptions,
  ): Promise<ModuleManifest> {
    if (options.expectedSha256) {
      const actual = await this.workers.run("hash", { data: archive });
      if (actual.toLocaleLowerCase() !== options.expectedSha256.toLocaleLowerCase()) {
        throw new Error("模块安装包 SHA-256 不匹配。");
      }
    }
    const inspected = await this.workers.run("zip-inspect", { data: archive });
    const root = detectArchiveRoot(Object.keys(inspected.files));
    const file = (name: string) => inspected.files[`${root}${name}`];
    for (const required of REQUIRED_FILES) {
      if (!file(required)) throw new Error(`模块安装包缺少 ${required}。`);
    }
    validatePackageFileList(Object.keys(inspected.files), root);
    const manifest = JSON.parse(
      new TextDecoder().decode(file("manifest.json")),
    ) as unknown;
    const schemaResult = await this.workers.run("schema", {
      schema: moduleManifestSchema,
      value: manifest,
    });
    if (!schemaResult.valid || !validateModuleManifest(manifest)) {
      throw new Error(
        `模块 manifest 无效：${[...schemaResult.errors, ...moduleManifestErrors()].join("; ")}`,
      );
    }
    if (!satisfies(manifestJson.version, `>=${manifest.minMyPageVersion}`)) {
      throw new Error(`模块需要 MyPage ${manifest.minMyPageVersion} 或更高版本。`);
    }
    if (
      manifest.maxMyPageVersion &&
      !satisfies(manifestJson.version, `<=${manifest.maxMyPageVersion}`)
    ) {
      throw new Error(`模块不兼容 MyPage ${manifestJson.version}。`);
    }
    const currentPlatform = Platform.isMobile ? "mobile" : "desktop";
    if (!manifest.platforms.includes(currentPlatform)) {
      throw new Error(`模块不支持当前 ${currentPlatform} 平台。`);
    }
    const mainCode = new TextDecoder().decode(file("main.js"));
    if (hasExternalImports(mainCode)) {
      throw new Error("首版模块必须自包含，main.js 不能保留外部 import。");
    }

    await ensureDirectory(this.adapter, this.diyRoot);
    await ensureDirectory(this.adapter, this.stagingRoot);
    const token = `${manifest.id}-${Date.now()}`;
    const stage = normalizePath(`${this.stagingRoot}/${token}`);
    const target = normalizePath(`${this.diyRoot}/${manifest.id}`);
    const backup = normalizePath(`${this.stagingRoot}/${token}-backup`);
    await ensureDirectory(this.adapter, stage);
    try {
      for (const [archivePath, bytes] of Object.entries(inspected.files)) {
        if (!archivePath.startsWith(root)) continue;
        const relative = archivePath.slice(root.length);
        if (!relative || relative.endsWith("/")) continue;
        const destination = normalizePath(`${stage}/${relative}`);
        await ensureDirectory(this.adapter, destination.split("/").slice(0, -1).join("/"));
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        await this.adapter.writeBinary(destination, copy.buffer);
      }
      const hadExisting = await this.adapter.exists(target);
      if (hadExisting) await this.adapter.rename(target, backup);
      try {
        await this.adapter.rename(stage, target);
      } catch (error) {
        if (hadExisting && await this.adapter.exists(backup)) {
          await this.adapter.rename(backup, target);
        }
        throw error;
      }
      if (await this.adapter.exists(backup)) await this.adapter.rmdir(backup, true);
      await this.persistInstallation(manifest, options);
      return manifest;
    } catch (error) {
      if (await this.adapter.exists(stage)) await this.adapter.rmdir(stage, true);
      throw error;
    }
  }

  public async uninstall(moduleId: string): Promise<void> {
    if (!/^[a-z0-9][a-z0-9._-]*$/u.test(moduleId)) throw new Error("Invalid module ID.");
    const target = normalizePath(`${this.diyRoot}/${moduleId}`);
    if (await this.adapter.exists(target)) await this.adapter.rmdir(target, true);
    const snapshot = this.settingsStore.snapshot;
    await this.settingsStore.update(
      (draft) => {
        delete draft.modules[moduleId];
        delete draft.moduleSettings[moduleId];
        draft.permissions = draft.permissions.filter((grant) => grant.moduleId !== moduleId);
      },
      snapshot.revision,
      "uninstall-module",
    );
  }

  private async persistInstallation(
    manifest: ModuleManifest,
    options: InstallModuleOptions,
  ): Promise<void> {
    const snapshot = this.settingsStore.snapshot;
    const previous = snapshot.modules[manifest.id];
    const permissionHash = await this.workers.run("hash", {
      data: new TextEncoder().encode(JSON.stringify(manifest.permissions)),
    });
    await this.settingsStore.update(
      (draft) => {
        const installation: ModuleInstallation = {
          id: manifest.id,
          name: manifest.name,
          version: manifest.version,
          sourceType: options.sourceType,
          enabled: true,
          // A package may declare that it needs trusted capabilities, but the
          // package itself can never grant that trust. Every installation
          // starts sandboxed until the user explicitly promotes it.
          trustLevel: "sandbox",
          installedAt: Date.now(),
          permissionsHash: permissionHash,
          platform: structuredClone(manifest.platforms),
        };
        if (options.sourceId !== undefined) {
          installation.sourceId = options.sourceId;
        }
        draft.modules[manifest.id] = installation;
        if (previous && previous.permissionsHash !== permissionHash) {
          draft.permissions = draft.permissions.filter(
            (grant) => grant.moduleId !== manifest.id,
          );
        }
      },
      snapshot.revision,
      previous ? "upgrade-module" : "install-module",
    );
  }
}

function detectArchiveRoot(paths: string[]): string {
  const manifestPaths = paths.filter((path) => path.endsWith("manifest.json"));
  if (manifestPaths.length !== 1) throw new Error("模块包必须且只能包含一个 manifest.json。");
  const path = manifestPaths[0] ?? "";
  const root = path.slice(0, -"manifest.json".length);
  if (root.split("/").filter(Boolean).length > 1) {
    throw new Error("模块文件只能位于 ZIP 根目录或单个顶层目录。");
  }
  return root;
}

function validatePackageFileList(paths: string[], root: string): void {
  for (const path of paths) {
    if (!path.startsWith(root)) throw new Error("ZIP 包含模块根目录之外的文件。");
    const relative = path.slice(root.length);
    if (!relative || relative.endsWith("/")) continue;
    if (
      !REQUIRED_FILES.includes(relative as (typeof REQUIRED_FILES)[number]) &&
      !relative.startsWith("assets/")
    ) {
      throw new Error(`模块包包含未允许的文件：${relative}`);
    }
    if (
      relative.startsWith("assets/") &&
      /\.(?:js|mjs|cjs|html?|exe|dll|node|cmd|bat|ps1|sh)$/iu.test(relative)
    ) {
      throw new Error(`assets/ 不能包含可执行文件：${relative}`);
    }
  }
}

function hasExternalImports(code: string): boolean {
  return (
    /(?:^|[;\n])\s*import\s+(?:[^("'`]|from\s*)/mu.test(code) ||
    /\bimport\s*\(/mu.test(code)
  );
}

async function ensureDirectory(adapter: DataAdapter, path: string): Promise<void> {
  if (!path || await adapter.exists(path)) return;
  const parent = path.split("/").slice(0, -1).join("/");
  if (parent && !(await adapter.exists(parent))) await ensureDirectory(adapter, parent);
  await adapter.mkdir(path);
}
