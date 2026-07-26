import { normalizePath, type DataAdapter } from "obsidian";
import { PLUGIN_DIRECTORIES } from "../app/constants";

export interface BackupRecord {
  path: string;
  createdAt: number;
}

export class BackupManager {
  private readonly backupsDirectory: string;

  public constructor(
    private readonly adapter: DataAdapter,
    pluginDirectory: string,
  ) {
    this.backupsDirectory = normalizePath(
      `${pluginDirectory}/${PLUGIN_DIRECTORIES.backups}`,
    );
  }

  public async ensureDirectory(): Promise<void> {
    if (!(await this.adapter.exists(this.backupsDirectory))) {
      await this.adapter.mkdir(this.backupsDirectory);
    }
  }

  public async create(payload: unknown, reason: string): Promise<BackupRecord> {
    await this.ensureDirectory();
    const createdAt = Date.now();
    const safeReason = reason.replace(/[^a-z0-9_-]/gi, "-").slice(0, 32);
    const path = normalizePath(
      `${this.backupsDirectory}/${createdAt}-${safeReason}.json`,
    );
    await this.adapter.write(path, JSON.stringify(payload, null, 2));
    return { path, createdAt };
  }

  public async list(): Promise<BackupRecord[]> {
    await this.ensureDirectory();
    const entries = await this.adapter.list(this.backupsDirectory);
    return entries.files
      .filter((path) => path.endsWith(".json"))
      .map((path) => ({
        path,
        createdAt: Number.parseInt(path.split("/").pop() ?? "0", 10) || 0,
      }))
      .sort((left, right) => right.createdAt - left.createdAt);
  }

  public async read(record: BackupRecord): Promise<unknown> {
    return JSON.parse(await this.adapter.read(record.path)) as unknown;
  }

  public async prune(retain: number): Promise<void> {
    const backups = await this.list();
    const obsolete = backups.slice(Math.max(0, retain));
    await Promise.all(obsolete.map(async (backup) => this.adapter.remove(backup.path)));
  }
}
