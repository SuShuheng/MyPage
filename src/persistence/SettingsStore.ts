import type { Plugin } from "obsidian";
import { TypedEvent } from "../core/events";
import {
  SettingsValidationError,
  StaleRevisionError,
} from "../core/errors";
import { BackupManager } from "./BackupManager";
import { createDefaultSettings } from "./default-settings";
import { MigrationRunner } from "./MigrationRunner";
import {
  getSettingsValidationErrors,
  validateSettings,
} from "./settings-schema";
import type { MyPageSettings } from "./settings-types";

export interface SettingsChangeEvent {
  previous: MyPageSettings;
  current: MyPageSettings;
}

export class SettingsStore {
  private current = createDefaultSettings();
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly migrationRunner = new MigrationRunner();
  private readonly backupManager: BackupManager;
  private recoveryMessage: string | undefined;
  public readonly changed = new TypedEvent<SettingsChangeEvent>();

  public constructor(private readonly plugin: Plugin) {
    const pluginDirectory =
      plugin.manifest.dir ??
      `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`;
    this.backupManager = new BackupManager(plugin.app.vault.adapter, pluginDirectory);
  }

  public get snapshot(): MyPageSettings {
    return structuredClone(this.current);
  }

  public get recoveryMode(): string | undefined {
    return this.recoveryMessage;
  }

  public async load(): Promise<MyPageSettings> {
    const raw = (await this.plugin.loadData()) as unknown;
    if (raw === null || raw === undefined) {
      this.current = createDefaultSettings();
      await this.persistNewSettings(this.current);
      return this.snapshot;
    }

    let migrated: unknown;
    try {
      migrated = this.migrationRunner.migrate(raw);
    } catch (error) {
      await this.backupManager.create(raw, "migration-failed");
      await this.enterRecoveryMode(
        `配置迁移失败：${error instanceof Error ? error.message : String(error)}`,
      );
      return this.snapshot;
    }

    if (!validateSettings(migrated)) {
      await this.backupManager.create(raw, "invalid-settings");
      await this.enterRecoveryMode(
        `data.json 校验失败：${getSettingsValidationErrors().join("; ")}`,
      );
      return this.snapshot;
    }

    this.current = structuredClone(migrated);
    this.recoveryMessage = undefined;
    await this.ensureRuntimeDirectories();
    await this.backupManager.prune(this.current.uiState.backupRetention);
    return this.snapshot;
  }

  public async update(
    mutate: (draft: MyPageSettings) => void,
    expectedRevision = this.current.revision,
    reason = "settings-update",
  ): Promise<MyPageSettings> {
    return new Promise<MyPageSettings>((resolve, reject) => {
      this.writeQueue = this.writeQueue
        .then(async () => {
          if (expectedRevision !== this.current.revision) {
            throw new StaleRevisionError(expectedRevision, this.current.revision);
          }

          const previous = this.snapshot;
          const draft = this.snapshot;
          mutate(draft);
          draft.revision = previous.revision + 1;

          if (!validateSettings(draft)) {
            throw new SettingsValidationError(
              "MyPage refused to save invalid settings.",
              getSettingsValidationErrors(),
            );
          }

          await this.backupManager.create(previous, reason);
          await this.plugin.saveData(draft);
          this.current = structuredClone(draft);
          this.changed.emit({ previous, current: this.snapshot });
          await this.backupManager.prune(draft.uiState.backupRetention);
          resolve(this.snapshot);
        })
        .catch((error: unknown) => {
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  public async replaceFromBackup(
    backupPath: string,
    expectedRevision = this.current.revision,
  ): Promise<MyPageSettings> {
    const records = await this.backupManager.list();
    const record = records.find((candidate) => candidate.path === backupPath);
    if (!record) {
      throw new Error("The requested MyPage backup does not exist.");
    }
    const restored = await this.backupManager.read(record);
    if (!validateSettings(restored)) {
      throw new SettingsValidationError(
        "The selected backup is not a valid MyPage settings file.",
        getSettingsValidationErrors(),
      );
    }
    return this.update(
      (draft) => {
        Object.assign(draft, structuredClone(restored));
      },
      expectedRevision,
      "before-restore",
    );
  }

  public async listBackups() {
    return this.backupManager.list();
  }

  public dispose(): void {
    this.changed.clear();
  }

  private async persistNewSettings(settings: MyPageSettings): Promise<void> {
    if (!validateSettings(settings)) {
      throw new SettingsValidationError(
        "Internal default settings are invalid.",
        getSettingsValidationErrors(),
      );
    }
    await this.plugin.saveData(settings);
    await this.ensureRuntimeDirectories();
  }

  private async ensureRuntimeDirectories(): Promise<void> {
    const pluginDirectory =
      this.plugin.manifest.dir ??
      `${this.plugin.app.vault.configDir}/plugins/${this.plugin.manifest.id}`;
    const directories = ["diy-plugins", "backups", "cache", "staging"];
    for (const directory of directories) {
      const path = `${pluginDirectory}/${directory}`;
      if (!(await this.plugin.app.vault.adapter.exists(path))) {
        await this.plugin.app.vault.adapter.mkdir(path);
      }
    }
  }

  private async enterRecoveryMode(message: string): Promise<void> {
    this.current = createDefaultSettings();
    this.current.general.safeMode = true;
    this.recoveryMessage = message;
    await this.ensureRuntimeDirectories();
  }
}
