import { normalizePath, type App } from "obsidian";
import manifest from "../../manifest.json";
import type { DataEngine } from "../data/DataEngine";
import type { ModuleManager } from "../modules/ModuleManager";
import type { SettingsStore } from "../persistence/SettingsStore";
import type { PerformanceMonitor } from "./PerformanceMonitor";

export class DiagnosticsService {
  public constructor(
    private readonly app: App,
    private readonly settings: SettingsStore,
    private readonly modules: ModuleManager,
    private readonly data: DataEngine,
    private readonly performance: PerformanceMonitor,
  ) {}

  public async export(): Promise<string> {
    const snapshot = this.settings.snapshot;
    const path = normalizePath(
      `MyPage Diagnostics/mypage-${new Date().toISOString().replace(/[:.]/gu, "-")}.json`,
    );
    if (!this.app.vault.getAbstractFileByPath("MyPage Diagnostics")) {
      await this.app.vault.createFolder("MyPage Diagnostics");
    }
    const report = {
      generatedAt: new Date().toISOString(),
      myPageVersion: manifest.version,
      schemaVersion: snapshot.schemaVersion,
      revision: snapshot.revision,
      safeMode: snapshot.general.safeMode,
      updateChannel: snapshot.updates.channel,
      dashboardCount: Object.keys(snapshot.dashboards).length,
      widgetCount: Object.keys(snapshot.widgetInstances).length,
      indexedRecordCount: this.data.recordCount,
      modules: this.modules.registry.list().map((module) => ({
        id: module.manifest.id,
        version: module.manifest.version,
        enabled: module.enabled,
        sourceType: module.sourceType,
      })),
      performance: this.performance.snapshot(),
    };
    await this.app.vault.create(path, JSON.stringify(report, null, 2));
    return path;
  }
}
