import type { App } from "obsidian";
import { normalizePath } from "obsidian";
import type { CapabilityBroker } from "../permissions/CapabilityBroker";
import type { ModuleRegistry } from "./ModuleRegistry";
import { ModuleSandbox } from "./ModuleSandbox";
import type { DataEngine } from "../data/DataEngine";
import { SandboxDataSource } from "./SandboxDataSource";
import type { SettingsStore } from "../persistence/SettingsStore";

export class ModuleRuntime {
  private readonly sandboxes = new Set<ModuleSandbox>();
  private readonly dataSourceDisposers = new Map<string, () => void>();
  private dataSourceQueue: Promise<void> = Promise.resolve();
  private disposed = false;

  public constructor(
    private readonly app: App,
    private readonly registry: ModuleRegistry,
    private readonly broker: CapabilityBroker,
    private readonly settings: SettingsStore,
  ) {}

  public async mountWidget(
    moduleId: string,
    contributionId: string,
    container: HTMLElement,
    config: Record<string, unknown>,
    theme: Record<string, string | number>,
  ): Promise<ModuleSandbox> {
    const module = this.registry.get(moduleId);
    if (!module || !module.enabled) throw new Error(`模块 ${moduleId} 未启用。`);
    const contribution = module.manifest.contributions.find(
      (item) => item.id === contributionId && item.kind === "widget",
    );
    if (!contribution) throw new Error(`模块未注册 Widget：${contributionId}`);
    const [code, styles] = await Promise.all([
      this.app.vault.adapter.read(normalizePath(`${module.directory}/main.js`)),
      this.app.vault.adapter.read(normalizePath(`${module.directory}/styles.css`)),
    ]);
    let resolveReady: ((sandbox: ModuleSandbox) => void) | undefined;
    let rejectReady: ((error: Error) => void) | undefined;
    const ready = new Promise<ModuleSandbox>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const timeout = window.setTimeout(() => {
      const error = new Error(`模块组件 ${moduleId}.${contributionId} 启动超时。`);
      sandbox.dispose();
      this.sandboxes.delete(sandbox);
      rejectReady?.(error);
      void this.recordError(moduleId, error);
    }, 10_000);
    const sandbox = new ModuleSandbox({
      manifest: module.manifest,
      contributionId,
      code,
      styles,
      container,
      broker: this.broker,
      config,
      theme,
      onReady: () => {
        window.clearTimeout(timeout);
        resolveReady?.(sandbox);
      },
      onError: (error) => {
        window.clearTimeout(timeout);
        sandbox.dispose();
        this.sandboxes.delete(sandbox);
        rejectReady?.(error);
        void this.recordError(moduleId, error);
      },
    });
    this.sandboxes.add(sandbox);
    return ready;
  }

  public async mountDataSource(
    moduleId: string,
    contributionId: string,
    onRecords: (records: unknown[]) => void,
  ): Promise<ModuleSandbox> {
    const module = this.registry.get(moduleId);
    if (!module || !module.enabled) throw new Error(`模块 ${moduleId} 未启用。`);
    const contribution = module.manifest.contributions.find(
      (item) => item.id === contributionId && item.kind === "dataSource",
    );
    if (!contribution) throw new Error(`模块未注册 DataSource：${contributionId}`);
    const [code, styles] = await Promise.all([
      this.app.vault.adapter.read(normalizePath(`${module.directory}/main.js`)),
      this.app.vault.adapter.read(normalizePath(`${module.directory}/styles.css`)),
    ]);
    const container = document.body.createDiv({
      cls: "mypage-hidden-module-runtime",
    });
    let resolveReady: ((sandbox: ModuleSandbox) => void) | undefined;
    let rejectReady: ((error: Error) => void) | undefined;
    const ready = new Promise<ModuleSandbox>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const timeout = window.setTimeout(() => {
      const error = new Error(`模块数据源 ${moduleId}.${contributionId} 启动超时。`);
      sandbox.dispose();
      this.sandboxes.delete(sandbox);
      rejectReady?.(error);
      void this.recordError(moduleId, error);
    }, 10_000);
    const sandbox = new ModuleSandbox({
      manifest: module.manifest,
      contributionId,
      code,
      styles,
      container,
      broker: this.broker,
      config: this.settings.snapshot.moduleSettings[moduleId] ?? {},
      theme: {},
      onRecords,
      removeContainerOnDispose: true,
      onReady: () => {
        window.clearTimeout(timeout);
        resolveReady?.(sandbox);
      },
      onError: (error) => {
        window.clearTimeout(timeout);
        sandbox.dispose();
        this.sandboxes.delete(sandbox);
        rejectReady?.(error);
        void this.recordError(moduleId, error);
      },
    });
    this.sandboxes.add(sandbox);
    return ready;
  }

  public syncDataSources(dataEngine: DataEngine): Promise<void> {
    return this.enqueueDataSourceOperation(async () => {
      await this.syncDataSourcesNow(dataEngine);
    });
  }

  private async syncDataSourcesNow(dataEngine: DataEngine): Promise<void> {
    if (this.disposed) return;
    const expected = new Map(
      this.registry.contributions
        .list("dataSource")
        .map((entry) => [
          `${entry.moduleId}.${entry.contribution.id}`,
          entry,
        ]),
    );
    for (const [id, dispose] of [...this.dataSourceDisposers]) {
      if (!expected.has(id)) {
        dispose();
        this.dataSourceDisposers.delete(id);
      }
    }
    for (const [id, entry] of expected) {
      if (this.dataSourceDisposers.has(id)) continue;
      const source = new SandboxDataSource(
        entry.moduleId,
        entry.contribution.id,
        entry.contribution.name,
        this,
      );
      try {
        const dispose = await dataEngine.registerDataSource(source);
        if (this.disposed) dispose();
        else this.dataSourceDisposers.set(id, dispose);
      } catch (error) {
        console.error(`[MyPage] Failed to connect data source ${id}`, error);
      }
    }
  }

  public restartDataSources(dataEngine: DataEngine): Promise<void> {
    return this.enqueueDataSourceOperation(async () => {
      for (const dispose of this.dataSourceDisposers.values()) dispose();
      this.dataSourceDisposers.clear();
      await this.syncDataSourcesNow(dataEngine);
    });
  }

  public unmount(sandbox: ModuleSandbox): void {
    sandbox.dispose();
    this.sandboxes.delete(sandbox);
  }

  public dispose(): void {
    this.disposed = true;
    for (const sandbox of this.sandboxes) sandbox.dispose();
    for (const dispose of this.dataSourceDisposers.values()) dispose();
    this.dataSourceDisposers.clear();
    this.sandboxes.clear();
  }

  private async recordError(moduleId: string, error: Error): Promise<void> {
    const snapshot = this.settings.snapshot;
    const message = error.message.slice(0, 1_000);
    if (
      !snapshot.modules[moduleId] ||
      snapshot.modules[moduleId]?.lastError === message
    ) {
      return;
    }
    try {
      await this.settings.update(
        (draft) => {
          const module = draft.modules[moduleId];
          if (module) module.lastError = message;
        },
        snapshot.revision,
        "record-module-error",
      );
    } catch {
      // A newer user change wins over a diagnostic write.
    }
  }

  private enqueueDataSourceOperation(
    operation: () => Promise<void>,
  ): Promise<void> {
    const result = this.dataSourceQueue.then(operation);
    this.dataSourceQueue = result.catch(() => undefined);
    return result;
  }
}
