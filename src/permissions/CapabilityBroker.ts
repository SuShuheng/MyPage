import type * as NodeChildProcess from "node:child_process";
import type * as NodeFsPromises from "node:fs/promises";
import type * as NodePath from "node:path";
import type { App } from "obsidian";
import { Platform, TFile, normalizePath } from "obsidian";
import type { ActionExecutor } from "../actions/ActionExecutor";
import type { CapabilityId } from "../persistence/settings-types";
import type { SettingsStore } from "../persistence/SettingsStore";
import type { PermissionService } from "./PermissionService";

interface CapabilityInputMap {
  "vault.read": { path: string };
  "vault.write": {
    action: "toggle-task" | "create-task" | "update-frontmatter";
    path: string;
    line?: number;
    text?: string;
    field?: string;
    value?: unknown;
  };
  "network.request": {
    url: string;
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    secretHeaders?: Record<string, string>;
    body?: string;
  };
  "externalFs.read": {
    path: string;
    operation?: "read" | "list";
    recursive?: boolean;
    encoding?: "utf8" | "binary";
  };
  "externalFs.write": { path: string; data: string | Uint8Array };
  "git.read": { repository: string; operation: "status" | "log" | "diff" | "rev-parse"; args?: string[] };
  "git.write": { repository: string; operation: "add" | "commit" | "tag" | "push"; args?: string[] };
  "obsidian.command": { command: string };
  "system.exec": { executable: string; args?: string[]; cwd?: string };
}

export class CapabilityBroker {
  public constructor(
    private readonly app: App,
    private readonly settingsStore: SettingsStore,
    private readonly permissions: PermissionService,
    private readonly actions: ActionExecutor,
  ) {}

  public async request<T extends CapabilityId>(
    moduleId: string,
    capability: T,
    input: CapabilityInputMap[T],
  ): Promise<unknown> {
    const context = requestContext(capability, input);
    if (!this.permissions.isGranted(moduleId, capability, context)) {
      throw new Error(`模块 ${moduleId} 未获授权：${capability}`);
    }
    switch (capability) {
      case "vault.read":
        return this.readVault(input as CapabilityInputMap["vault.read"]);
      case "vault.write":
        return this.writeVault(input as CapabilityInputMap["vault.write"]);
      case "network.request":
        return this.networkRequest(
          moduleId,
          input as CapabilityInputMap["network.request"],
        );
      case "externalFs.read":
        return this.readExternal(moduleId, input as CapabilityInputMap["externalFs.read"]);
      case "externalFs.write":
        return this.writeExternal(moduleId, input as CapabilityInputMap["externalFs.write"]);
      case "git.read":
        return this.git(moduleId, input as CapabilityInputMap["git.read"], false);
      case "git.write":
        return this.git(moduleId, input as CapabilityInputMap["git.write"], true);
      case "obsidian.command":
        return this.runObsidianCommand(input as CapabilityInputMap["obsidian.command"]);
      case "system.exec":
        return this.exec(input as CapabilityInputMap["system.exec"]);
    }
  }

  public async validateConfiguredTarget(
    moduleId: string,
    format: "directory-path" | "git-repository",
    value: string,
  ): Promise<void> {
    ensureDesktop();
    const fs = desktopRequire<typeof NodeFsPromises>("fs/promises");
    const path = await resolveRealPath(value, false);
    const capability: CapabilityId =
      format === "git-repository" ? "git.read" : "externalFs.read";
    const context =
      format === "git-repository" ? { repository: path } : { path };
    const requestedContext =
      format === "git-repository"
        ? { repository: value }
        : { path: value };
    if (!this.permissions.isGranted(moduleId, capability, requestedContext)) {
      throw new Error(
        `此路径尚未授权 ${capability}。请先在“权限”页授予该模块访问范围。`,
      );
    }
    if (!this.permissions.isGranted(moduleId, capability, context)) {
      throw new Error(
        `此路径解析后的真实位置超出已授权范围：${path}`,
      );
    }
    const stat = await fs.stat(path);
    if (!stat.isDirectory()) throw new Error("此路径不是文件夹。");
    if (format === "git-repository") {
      const nodePath = desktopRequire<typeof NodePath>("path");
      const gitEntry = nodePath.join(path, ".git");
      const bareHead = nodePath.join(path, "HEAD");
      const bareObjects = nodePath.join(path, "objects");
      const workTree = await fs.stat(gitEntry).then(
        (entry) => entry.isDirectory() || entry.isFile(),
        () => false,
      );
      const bareRepository =
        (await fs.stat(bareHead).then((entry) => entry.isFile(), () => false)) &&
        (await fs
          .stat(bareObjects)
          .then((entry) => entry.isDirectory(), () => false));
      if (!workTree && !bareRepository) {
        throw new Error("此文件夹不是 Git 工作树或裸仓库。");
      }
    }
  }

  private async readVault({ path }: CapabilityInputMap["vault.read"]) {
    const normalized = normalizeVaultPath(path);
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (!(file instanceof TFile)) throw new Error(`找不到文件：${normalized}`);
    const content = await this.app.vault.cachedRead(file);
    if (content.length > 5 * 1024 * 1024) throw new Error("文件超过 5 MiB 读取限制。");
    return { path: normalized, content };
  }

  private async writeVault(input: CapabilityInputMap["vault.write"]) {
    if (input.action === "toggle-task") {
      if (input.line === undefined) throw new Error("toggle-task requires line.");
      const actionInput: {
        path: string;
        line: number;
        expectedText?: string;
      } = { path: input.path, line: input.line };
      if (input.text !== undefined) actionInput.expectedText = input.text;
      return this.actions.execute({
        id: "toggle-task",
        input: actionInput,
      });
    }
    if (input.action === "create-task") {
      if (!input.text) throw new Error("create-task requires text.");
      return this.actions.execute({
        id: "create-task",
        input: { path: input.path, text: input.text },
      });
    }
    if (!input.field) throw new Error("update-frontmatter requires field.");
    return this.actions.execute({
      id: "update-frontmatter",
      input: { path: input.path, field: input.field, value: input.value },
    });
  }

  private async networkRequest(
    moduleId: string,
    input: CapabilityInputMap["network.request"],
  ) {
    const url = new URL(input.url);
    if (!["https:", "http:"].includes(url.protocol)) {
      throw new Error("Only HTTP(S) requests are supported.");
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const request: RequestInit = {
        method: input.method ?? "GET",
        redirect: "error",
        signal: controller.signal,
      };
      const headers = new Headers(input.headers);
      for (const [name, reference] of Object.entries(input.secretHeaders ?? {})) {
        const secretId = reference.replace(/^secret:/u, "");
        if (!secretId.startsWith(`${moduleSecretPrefix(moduleId)}-`)) {
          throw new Error("模块不能读取其他模块的 SecretStorage 引用。");
        }
        const secret = this.app.secretStorage.getSecret(secretId);
        if (secret === null) throw new Error(`找不到 SecretStorage 引用：${secretId}`);
        headers.set(name, secret);
      }
      if ([...headers].length > 0) request.headers = headers;
      if (input.body !== undefined) request.body = input.body;
      const response = await fetch(url, request);
      const size = Number(response.headers.get("content-length") ?? 0);
      if (size > 5 * 1024 * 1024) throw new Error("Response exceeds 5 MiB.");
      const body = await response.text();
      if (body.length > 5 * 1024 * 1024) throw new Error("Response exceeds 5 MiB.");
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body,
      };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  private async readExternal(
    moduleId: string,
    input: CapabilityInputMap["externalFs.read"],
  ) {
    ensureDesktop();
    const fs = desktopRequire<typeof NodeFsPromises>("fs/promises");
    const path = await resolveRealPath(input.path, false);
    this.assertResolvedScope(moduleId, "externalFs.read", { path });
    const stat = await fs.stat(path);
    if (input.operation === "list") {
      if (!stat.isDirectory()) throw new Error("External list path must be a directory.");
      return {
        path,
        entries: await listExternalDirectory(path, Boolean(input.recursive)),
      };
    }
    if (!stat.isFile()) throw new Error("External path must be a file.");
    if (stat.size > 10 * 1024 * 1024) throw new Error("External file exceeds 10 MiB.");
    return input.encoding === "binary"
      ? new Uint8Array(await fs.readFile(path))
      : fs.readFile(path, "utf8");
  }

  private async writeExternal(
    moduleId: string,
    input: CapabilityInputMap["externalFs.write"],
  ) {
    ensureDesktop();
    const fs = desktopRequire<typeof NodeFsPromises>("fs/promises");
    const path = await resolveRealPath(input.path, true);
    this.assertResolvedScope(moduleId, "externalFs.write", { path });
    await fs.writeFile(path, input.data);
    return { path };
  }

  private async git(
    moduleId: string,
    input: CapabilityInputMap["git.read"] | CapabilityInputMap["git.write"],
    write: boolean,
  ) {
    ensureDesktop();
    const allowed = write
      ? ["add", "commit", "tag", "push"]
      : ["status", "log", "diff", "rev-parse"];
    if (!allowed.includes(input.operation)) throw new Error("Git operation is not allowed.");
    const repository = await resolveRealPath(input.repository, false);
    this.assertResolvedScope(moduleId, write ? "git.write" : "git.read", {
      repository,
    });
    return runProcess("git", [input.operation, ...(input.args ?? [])], repository);
  }

  private async runObsidianCommand({ command }: CapabilityInputMap["obsidian.command"]) {
    const commands = (this.app as App & {
      commands?: { executeCommandById(id: string): boolean };
    }).commands;
    if (!commands) throw new Error("Obsidian command API is unavailable.");
    return { executed: commands.executeCommandById(command) };
  }

  private async exec({ executable, args = [], cwd }: CapabilityInputMap["system.exec"]) {
    ensureDesktop();
    return runProcess(executable, args, cwd);
  }

  private assertResolvedScope(
    moduleId: string,
    capability: CapabilityId,
    context: { path?: string; repository?: string },
  ): void {
    if (!this.permissions.isGranted(moduleId, capability, context)) {
      throw new Error(`模块 ${moduleId} 的真实路径超出授权作用域：${capability}`);
    }
  }
}

function moduleSecretPrefix(moduleId: string): string {
  return `mypage-${moduleId
    .toLocaleLowerCase()
    .replace(/[^a-z0-9-]/gu, "-")
    .replace(/-+/gu, "-")}`;
}

function requestContext<T extends CapabilityId>(
  capability: T,
  input: CapabilityInputMap[T],
) {
  const value = input as Record<string, unknown>;
  if (capability === "network.request") {
    return { domain: String(value.url ?? "") };
  }
  if (capability === "git.read" || capability === "git.write") {
    return { repository: String(value.repository ?? "") };
  }
  if (capability === "obsidian.command") {
    return { command: String(value.command ?? "") };
  }
  if (capability === "system.exec") {
    return { executable: String(value.executable ?? "") };
  }
  return { path: String(value.path ?? "") };
}

function normalizeVaultPath(path: string): string {
  const normalized = normalizePath(path).replace(/^\/+/u, "");
  if (!normalized || normalized.split("/").includes("..") || /^[A-Za-z]:/u.test(normalized)) {
    throw new Error("Invalid Vault path.");
  }
  return normalized;
}

function ensureDesktop(): void {
  if (!Platform.isDesktopApp) throw new Error("This capability is desktop-only.");
}

async function resolveRealPath(path: string, allowMissing: boolean): Promise<string> {
  const fs = desktopRequire<typeof NodeFsPromises>("fs/promises");
  const nodePath = desktopRequire<typeof NodePath>("path");
  const resolved = nodePath.resolve(path);
  if (allowMissing) {
    const parent = await fs.realpath(nodePath.dirname(resolved));
    return nodePath.join(parent, nodePath.basename(resolved));
  }
  return fs.realpath(resolved);
}

async function runProcess(
  executable: string,
  args: string[],
  cwd?: string,
): Promise<{ stdout: string; stderr: string }> {
  if (args.length > 64 || args.some((arg) => arg.length > 4_096 || arg.includes("\0"))) {
    throw new Error("Process arguments exceed safety limits.");
  }
  const { execFile } =
    desktopRequire<typeof NodeChildProcess>("child_process");
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      args,
      {
        cwd,
        encoding: "utf8",
        maxBuffer: 2 * 1024 * 1024,
        timeout: 30_000,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) reject(error instanceof Error ? error : new Error(String(error)));
        else resolve({ stdout, stderr });
      },
    );
  });
}

async function listExternalDirectory(
  root: string,
  recursive: boolean,
): Promise<Array<{ path: string; type: "file" | "directory"; size: number }>> {
  const fs = desktopRequire<typeof NodeFsPromises>("fs/promises");
  const nodePath = desktopRequire<typeof NodePath>("path");
  const results: Array<{
    path: string;
    type: "file" | "directory";
    size: number;
  }> = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.shift();
    if (!directory) break;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= 5_000) {
        throw new Error("External directory exceeds 5,000 entry limit.");
      }
      const absolute = nodePath.join(directory, entry.name);
      const relative = nodePath.relative(root, absolute).replaceAll("\\", "/");
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        results.push({ path: relative, type: "directory", size: 0 });
        if (recursive) pending.push(absolute);
      } else if (entry.isFile()) {
        const stat = await fs.stat(absolute);
        results.push({ path: relative, type: "file", size: stat.size });
      }
    }
  }
  return results;
}

function desktopRequire<T>(moduleId: string): T {
  const runtime = globalThis as typeof globalThis & {
    require?: (id: string) => unknown;
  };
  if (typeof runtime.require !== "function") {
    throw new Error("Obsidian desktop Node.js bridge is unavailable.");
  }
  return runtime.require(moduleId) as T;
}
