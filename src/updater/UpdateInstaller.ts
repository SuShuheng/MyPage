import { normalizePath, type DataAdapter } from "obsidian";
import type { WorkerCoordinator } from "../workers/WorkerCoordinator";
import type { GithubReleaseClient } from "./GithubReleaseClient";
import type {
  AvailableUpdate,
  UpdateInstallResult,
} from "./update-types";

const UPDATE_FILES = ["main.js", "manifest.json", "styles.css"] as const;

export class UpdateInstaller {
  private readonly stagingRoot: string;

  public constructor(
    private readonly adapter: DataAdapter,
    private readonly pluginDirectory: string,
    private readonly workers: WorkerCoordinator,
    private readonly client: GithubReleaseClient,
  ) {
    this.stagingRoot = normalizePath(`${pluginDirectory}/staging`);
  }

  public async install(
    update: AvailableUpdate,
    signal?: AbortSignal,
  ): Promise<UpdateInstallResult> {
    const assetByName = new Map(
      update.release.assets.map((asset) => [asset.name, asset]),
    );
    const sumsAsset = assetByName.get("SHA256SUMS");
    if (!sumsAsset) throw new Error("Release 缺少 SHA256SUMS。");
    for (const file of UPDATE_FILES) {
      if (!assetByName.has(file)) throw new Error(`Release 缺少 ${file}。`);
    }
    const downloads = await Promise.all([
      this.client.download(sumsAsset.browser_download_url, 1024 * 1024, signal),
      ...UPDATE_FILES.map(async (name) =>
        this.client.download(
          assetByName.get(name)?.browser_download_url ?? "",
          15 * 1024 * 1024,
          signal,
        ),
      ),
    ]);
    const [sumsBytes, ...fileBytes] = downloads;
    if (!sumsBytes) throw new Error("未下载到 SHA256SUMS。");
    const sums = parseSums(new TextDecoder().decode(sumsBytes));
    const hashes = await Promise.all(
      fileBytes.map(async (bytes) =>
        this.workers.run("hash", { data: bytes ?? new Uint8Array() }),
      ),
    );
    UPDATE_FILES.forEach((name, index) => {
      const expected = sums.get(name);
      const actual = hashes[index];
      if (!expected || expected.toLocaleLowerCase() !== actual?.toLocaleLowerCase()) {
        throw new Error(`${name} SHA-256 校验失败。`);
      }
    });
    const manifestBytes = fileBytes[1];
    if (!manifestBytes) throw new Error("未下载到 manifest.json。");
    const nextManifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as {
      id?: string;
      version?: string;
    };
    if (nextManifest.id !== "mypage" || nextManifest.version !== update.version) {
      throw new Error("Release manifest 与目标版本不一致。");
    }

    await ensureDirectory(this.adapter, this.stagingRoot);
    const token = `core-update-${update.version}-${Date.now()}`;
    const stage = normalizePath(`${this.stagingRoot}/${token}`);
    const backup = normalizePath(`${this.stagingRoot}/${token}-backup`);
    await ensureDirectory(this.adapter, stage);
    await ensureDirectory(this.adapter, backup);
    for (const [index, name] of UPDATE_FILES.entries()) {
      const bytes = fileBytes[index];
      if (!bytes) throw new Error(`未下载到 ${name}。`);
      await this.adapter.writeBinary(
        normalizePath(`${stage}/${name}`),
        copyBuffer(bytes),
      );
      const current = normalizePath(`${this.pluginDirectory}/${name}`);
      if (await this.adapter.exists(current)) {
        await this.adapter.copy(
          current,
          normalizePath(`${backup}/${name}`),
        );
      }
    }
    try {
      for (const name of UPDATE_FILES) {
        const current = normalizePath(`${this.pluginDirectory}/${name}`);
        const staged = normalizePath(`${stage}/${name}`);
        if (await this.adapter.exists(current)) await this.adapter.remove(current);
        await this.adapter.rename(staged, current);
      }
      await this.adapter.rmdir(stage, true);
      return {
        version: update.version,
        requiresReload: true,
        backupDirectory: backup,
      };
    } catch (error) {
      await this.rollback(backup);
      throw error;
    }
  }

  public async rollback(backupDirectory: string): Promise<void> {
    for (const name of UPDATE_FILES) {
      const backup = normalizePath(`${backupDirectory}/${name}`);
      const current = normalizePath(`${this.pluginDirectory}/${name}`);
      if (await this.adapter.exists(backup)) {
        if (await this.adapter.exists(current)) await this.adapter.remove(current);
        await this.adapter.copy(backup, current);
      }
    }
  }
}

function parseSums(source: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of source.split(/\r?\n/u)) {
    const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/u);
    if (match?.[1] && match[2]) result.set(match[2].trim(), match[1]);
  }
  return result;
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function ensureDirectory(adapter: DataAdapter, path: string): Promise<void> {
  if (await adapter.exists(path)) return;
  await adapter.mkdir(path);
}
