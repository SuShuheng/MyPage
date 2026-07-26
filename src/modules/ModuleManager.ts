import { normalizePath, type App } from "obsidian";
import type { SettingsStore } from "../persistence/SettingsStore";
import type { ModuleInstallation } from "../persistence/settings-types";
import { moduleManifestErrors, validateModuleManifest } from "./module-schema";
import { ModuleRegistry } from "./ModuleRegistry";
import type { InstalledModule } from "./module-types";
import { TypedEvent } from "../core/events";

export class ModuleManager {
  public readonly registry = new ModuleRegistry();
  public readonly changed = new TypedEvent<void>();
  private readonly root: string;

  public constructor(
    private readonly app: App,
    pluginDirectory: string,
    private readonly store: SettingsStore,
  ) {
    this.root = normalizePath(`${pluginDirectory}/diy-plugins`);
  }

  public async scan(): Promise<void> {
    this.registry.dispose();
    if (!(await this.app.vault.adapter.exists(this.root))) {
      await this.app.vault.adapter.mkdir(this.root);
      this.changed.emit();
      return;
    }
    const listing = await this.app.vault.adapter.list(this.root);
    const discovered: ModuleInstallation[] = [];
    const changedVersions: ModuleInstallation[] = [];
    for (const directory of listing.folders) {
      const manifestPath = normalizePath(`${directory}/manifest.json`);
      try {
        const manifest = JSON.parse(
          await this.app.vault.adapter.read(manifestPath),
        ) as unknown;
        if (!validateModuleManifest(manifest)) {
          throw new Error(moduleManifestErrors().join("; "));
        }
        const configured = this.store.snapshot.modules[manifest.id];
        if (!configured) {
          discovered.push({
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            sourceType: "local",
            enabled: true,
            trustLevel: "sandbox",
            installedAt: Date.now(),
            platform: structuredClone(manifest.platforms),
          });
        } else if (configured.version !== manifest.version) {
          const changed: ModuleInstallation = {
            ...structuredClone(configured),
            name: manifest.name,
            version: manifest.version,
            installedAt: Date.now(),
            platform: structuredClone(manifest.platforms),
          };
          delete changed.permissionsHash;
          changedVersions.push(changed);
        }
        const installed: InstalledModule = {
          manifest,
          directory,
          sourceType: configured?.sourceType ?? "local",
          enabled: configured?.enabled ?? true,
        };
        if (configured?.sourceId !== undefined) {
          installed.sourceId = configured.sourceId;
        }
        this.registry.register(installed);
      } catch (error) {
        console.error(`[MyPage] Failed to load module at ${directory}`, error);
      }
    }
    if (discovered.length > 0 || changedVersions.length > 0) {
      const snapshot = this.store.snapshot;
      await this.store.update(
        (draft) => {
          for (const module of discovered) {
            if (!draft.modules[module.id]) draft.modules[module.id] = module;
          }
          for (const module of changedVersions) {
            draft.modules[module.id] = module;
            draft.permissions = draft.permissions.filter(
              (grant) => grant.moduleId !== module.id,
            );
          }
        },
        snapshot.revision,
        "discover-local-modules",
      );
    }
    this.changed.emit();
  }

  public async setEnabled(moduleId: string, enabled: boolean): Promise<void> {
    const snapshot = this.store.snapshot;
    if (!snapshot.modules[moduleId]) throw new Error(`模块 ${moduleId} 尚未安装。`);
    await this.store.update(
      (draft) => {
        const module = draft.modules[moduleId];
        if (module) module.enabled = enabled;
      },
      snapshot.revision,
      enabled ? "enable-module" : "disable-module",
    );
    this.registry.setEnabled(moduleId, enabled);
    this.changed.emit();
  }

  public unregister(moduleId: string): void {
    this.registry.unregister(moduleId);
    this.changed.emit();
  }

  public dispose(): void {
    this.registry.dispose();
    this.changed.clear();
  }
}
