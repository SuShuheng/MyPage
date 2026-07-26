import type { App, WorkspaceLeaf } from "obsidian";
import { addIcon, Notice, Plugin } from "obsidian";
import {
  MY_PAGE_ICON,
  MY_PAGE_ICON_SVG,
  MY_PAGE_VIEW_TYPE,
  PLUGIN_DIRECTORIES,
} from "./constants";
import { MyPageView } from "../dashboard/MyPageView";
import { SettingsStore } from "../persistence/SettingsStore";
import { MyPageSettingTab } from "../settings/MyPageSettingTab";
import { WorkerCoordinator } from "../workers/WorkerCoordinator";
import { DataEngine } from "../data/DataEngine";
import { ActionExecutor } from "../actions/ActionExecutor";
import { PermissionService } from "../permissions/PermissionService";
import { CapabilityBroker } from "../permissions/CapabilityBroker";
import { ModuleInstaller } from "../modules/ModuleInstaller";
import { ModuleManager } from "../modules/ModuleManager";
import { ModuleRuntime } from "../modules/ModuleRuntime";
import { GithubMarketClient } from "../marketplace/GithubMarketClient";
import { MarketplaceService } from "../marketplace/MarketplaceService";
import { GithubReleaseClient } from "../updater/GithubReleaseClient";
import { UpdateInstaller } from "../updater/UpdateInstaller";
import { UpdateService } from "../updater/UpdateService";
import { showUpdateNotice } from "../updater/UpdateNotice";
import { BlueprintExporter } from "../blueprint/BlueprintExporter";
import { BlueprintImporter } from "../blueprint/BlueprintImporter";
import { BlueprintFileSuggestModal } from "../blueprint/BlueprintModals";
import { ThemeService } from "../theme/ThemeService";
import { normalizePath } from "obsidian";
import { SecretReferenceService } from "../persistence/SecretReferenceService";
import { PerformanceMonitor } from "../diagnostics/PerformanceMonitor";
import { DiagnosticsService } from "../diagnostics/DiagnosticsService";
import { ThemeMarketplaceService } from "../theme/ThemeMarketplaceService";

interface AppWithSettings extends App {
  setting?: {
    open(): void;
    openTabById(id: string): void;
  };
}

export default class MyPagePlugin extends Plugin {
  public settingsStore!: SettingsStore;
  public workers!: WorkerCoordinator;
  public dataEngine!: DataEngine;
  public actions!: ActionExecutor;
  public permissions!: PermissionService;
  public capabilityBroker!: CapabilityBroker;
  public moduleInstaller!: ModuleInstaller;
  public moduleManager!: ModuleManager;
  public moduleRuntime!: ModuleRuntime;
  public marketplace!: MarketplaceService;
  public updateService!: UpdateService;
  public blueprintExporter!: BlueprintExporter;
  public blueprintImporter!: BlueprintImporter;
  public themeService!: ThemeService;
  public secrets!: SecretReferenceService;
  public performanceMonitor!: PerformanceMonitor;
  public diagnostics!: DiagnosticsService;
  public themeMarketplace!: ThemeMarketplaceService;
  private settingTab!: MyPageSettingTab;
  private refreshTimer?: number;
  private refreshInFlight: Promise<void> | undefined;

  public override async onload(): Promise<void> {
    addIcon(MY_PAGE_ICON, MY_PAGE_ICON_SVG);
    this.settingsStore = new SettingsStore(this);

    await this.settingsStore.load();
    if (this.settingsStore.recoveryMode) {
      console.error("[MyPage] Recovery mode:", this.settingsStore.recoveryMode);
      new Notice(
        "MyPage 检测到配置损坏，已保留原文件和备份，并以内存安全模式启动。请从设置页恢复。",
        0,
      );
    }

    this.workers = new WorkerCoordinator(this.settingsStore.snapshot.uiState.workerCount);
    this.dataEngine = new DataEngine(this, this.workers);
    this.actions = new ActionExecutor(this.app);
    this.permissions = new PermissionService(this.settingsStore);
    this.capabilityBroker = new CapabilityBroker(
      this.app,
      this.settingsStore,
      this.permissions,
      this.actions,
    );
    const pluginDirectory =
      this.manifest.dir ??
      normalizePath(`${this.app.vault.configDir}/plugins/${this.manifest.id}`);
    this.moduleInstaller = new ModuleInstaller(
      this.app.vault.adapter,
      pluginDirectory,
      this.settingsStore,
      this.workers,
    );
    this.moduleManager = new ModuleManager(
      this.app,
      pluginDirectory,
      this.settingsStore,
    );
    this.moduleRuntime = new ModuleRuntime(
      this.app,
      this.moduleManager.registry,
      this.capabilityBroker,
      this.settingsStore,
    );
    // Obsidian may restore a MyPage view before onLayoutReady. Complete the
    // initial module scan first so persisted DIY widgets can mount immediately.
    await this.moduleManager.scan();
    void this.moduleRuntime.syncDataSources(this.dataEngine);
    const unsubscribeModuleSources = this.moduleManager.changed.subscribe(() => {
      void this.moduleRuntime.syncDataSources(this.dataEngine);
    });
    this.register(unsubscribeModuleSources);
    const marketClient = new GithubMarketClient(this.workers);
    this.marketplace = new MarketplaceService(
      this.settingsStore,
      marketClient,
      this.moduleInstaller,
    );
    const releaseClient = new GithubReleaseClient();
    const updateInstaller = new UpdateInstaller(
      this.app.vault.adapter,
      pluginDirectory,
      this.workers,
      releaseClient,
    );
    this.updateService = new UpdateService(
      this.settingsStore,
      releaseClient,
      updateInstaller,
    );
    this.blueprintExporter = new BlueprintExporter(this.settingsStore);
    this.blueprintImporter = new BlueprintImporter(this.settingsStore);
    this.themeService = new ThemeService();
    this.themeMarketplace = new ThemeMarketplaceService(
      this.settingsStore,
      this.workers,
    );
    await this.themeMarketplace.syncInstalledOfficialThemes();
    this.secrets = new SecretReferenceService(this.app);
    this.performanceMonitor = new PerformanceMonitor();
    this.performanceMonitor.start();
    this.diagnostics = new DiagnosticsService(
      this.app,
      this.settingsStore,
      this.moduleManager,
      this.dataEngine,
      this.performanceMonitor,
    );

    this.registerView(
      MY_PAGE_VIEW_TYPE,
      (leaf: WorkspaceLeaf) =>
        new MyPageView(
          leaf,
          this.settingsStore,
          this.dataEngine,
          this.actions,
          this.moduleRuntime,
          this.themeService,
          this.moduleManager,
          this.capabilityBroker,
          () => this.refreshAllData(true),
          () => this.openMarketplace(),
          () => this.pickModuleArchive(),
        ),
    );

    this.addRibbonIcon(MY_PAGE_ICON, "打开 MyPage", () => {
      void this.openMyPage();
    });

    this.addCommand({
      id: "open-mypage",
      name: "打开 MyPage",
      callback: () => {
        void this.openMyPage();
      },
    });

    this.addCommand({
      id: "export-mypage-diagnostics",
      name: "导出 MyPage 诊断报告",
      callback: () => {
        void this.diagnostics
          .export()
          .then((path) => new Notice(`诊断报告已导出到 ${path}`))
          .catch((error: unknown) => {
            new Notice(error instanceof Error ? error.message : String(error));
          });
      },
    });

    this.addCommand({
      id: "open-mypage-marketplace",
      name: "打开模块市场",
      callback: () => {
        this.openMarketplace();
      },
    });

    this.addCommand({
      id: "check-mypage-updates",
      name: "检查 MyPage 更新",
      callback: () => {
        void this.checkForUpdates(true);
      },
    });

    this.addCommand({
      id: "export-current-dashboard-blueprint",
      name: "导出当前主页蓝图",
      callback: () => {
        void this.exportCurrentBlueprint();
      },
    });

    this.addCommand({
      id: "import-dashboard-blueprint",
      name: "导入主页蓝图",
      callback: () => {
        new BlueprintFileSuggestModal(
          this.app,
          this.blueprintImporter,
          this.marketplace,
          this.moduleManager,
        ).open();
      },
    });

    this.addCommand({
      id: "open-mypage-safe-mode",
      name: "以安全模式打开 MyPage",
      callback: () => {
        void this.enableSafeModeAndOpen();
      },
    });

    this.settingTab = new MyPageSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);
    const unsubscribeRefreshPolicy = this.settingsStore.changed.subscribe(
      ({ previous, current }) => {
        if (
          previous.uiState.refreshIntervalMs !==
          current.uiState.refreshIntervalMs
        ) {
          this.configureRefreshTimer();
        }
      },
    );
    this.register(unsubscribeRefreshPolicy);
    this.configureRefreshTimer();

    this.app.workspace.onLayoutReady(() => {
      void this.handleWorkspaceReady();
    });
  }

  public override onunload(): void {
    if (this.refreshTimer !== undefined) window.clearInterval(this.refreshTimer);
    this.moduleRuntime.dispose();
    this.moduleManager.dispose();
    this.dataEngine.dispose();
    this.workers.dispose();
    this.performanceMonitor.dispose();
    this.settingsStore.dispose();
    this.app.workspace.detachLeavesOfType(MY_PAGE_VIEW_TYPE);
  }

  public async refreshAllData(notify = false): Promise<void> {
    if (
      this.settingsStore.snapshot.dashboards[
        this.settingsStore.snapshot.tabs.byId[
          this.settingsStore.snapshot.uiState.lastActiveTabId
        ]?.dashboardId ?? ""
      ]?.refreshPolicy.pauseWhenHidden &&
      document.hidden &&
      !notify
    ) {
      return;
    }
    this.refreshInFlight ??= Promise.all([
      this.dataEngine.refreshAll(),
      Promise.resolve().then(() => this.moduleRuntime.refreshAll()),
    ])
      .then(() => undefined)
      .finally(() => {
        this.refreshInFlight = undefined;
      });
    await this.refreshInFlight;
    if (notify) new Notice("MyPage 数据已刷新。", 2_000);
  }

  private configureRefreshTimer(): void {
    if (this.refreshTimer !== undefined) window.clearInterval(this.refreshTimer);
    const interval = Math.max(
      15_000,
      this.settingsStore.snapshot.uiState.refreshIntervalMs ?? 300_000,
    );
    this.refreshTimer = window.setInterval(() => {
      void this.refreshAllData(false);
    }, interval);
  }

  public async openMyPage(): Promise<void> {
    const existing =
      this.settingsStore.snapshot.general.startupOpenMode === "reuse"
        ? this.app.workspace.getLeavesOfType(MY_PAGE_VIEW_TYPE)[0]
        : undefined;
    const leaf = existing ?? this.resolveLeafForOpen();
    await leaf.setViewState({
      type: MY_PAGE_VIEW_TYPE,
      active: true,
    });
    await this.app.workspace.revealLeaf(leaf);
  }

  private resolveLeafForOpen(): WorkspaceLeaf {
    const { startupOpenMode } = this.settingsStore.snapshot.general;
    if (startupOpenMode === "replace-empty") {
      return this.app.workspace.getLeaf(false);
    }
    return this.app.workspace.getLeaf("tab");
  }

  private async handleWorkspaceReady(): Promise<void> {
    await this.ensurePluginDirectories();
    await this.moduleManager.scan();
    void this.dataEngine.initialize().catch((error: unknown) => {
      console.error("[MyPage] Vault indexing failed", error);
      new Notice("MyPage 无法完成 Vault 索引，请查看控制台诊断。");
    });
    const settings = this.settingsStore.snapshot;
    const startupTabId =
      settings.general.startupTabMode === "last"
        ? settings.uiState.lastActiveTabId
        : settings.general.startupTabId;
    if (
      startupTabId !== settings.uiState.lastActiveTabId &&
      settings.tabs.byId[startupTabId]
    ) {
      await this.settingsStore.update(
        (draft) => {
          draft.uiState.lastActiveTabId = startupTabId;
        },
        settings.revision,
        "select-startup-tab",
      );
    }
    if (settings.general.openOnStartup) {
      await this.openMyPage();
    }
    if (!settings.general.onboardingCompleted) {
      await this.openMyPage();
      new Notice("欢迎使用 MyPage。请完成首次启动设置。", 8_000);
    }
    if (settings.updates.checkOnStartup) {
      void this.checkForUpdates(false);
    }
  }

  public openMarketplace(): void {
    this.settingTab.show("module-market");
    const settingsApi = (this.app as AppWithSettings).setting;
    settingsApi?.open();
    settingsApi?.openTabById(this.manifest.id);
  }

  public pickModuleArchive(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,application/zip";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      void (async () => {
        try {
          await this.moduleInstaller.install(
            new Uint8Array(await file.arrayBuffer()),
            { sourceType: "zip" },
          );
          await this.moduleManager.scan();
          new Notice(`已导入 ${file.name}。模块默认在沙箱中运行。`);
        } catch (error) {
          new Notice(error instanceof Error ? error.message : String(error), 12_000);
        }
      })();
    });
    input.click();
  }

  public async checkForUpdates(manual: boolean): Promise<void> {
    try {
      const update = await this.updateService.check(manual);
      if (update) {
        showUpdateNotice(this.app, update, this.updateService);
      } else if (manual) {
        new Notice("MyPage 已是当前通道的最新版本。");
      }
    } catch (error) {
      if (manual) {
        new Notice(error instanceof Error ? error.message : String(error), 10_000);
      } else {
        console.warn("[MyPage] Startup update check failed", error);
      }
    }
  }

  private async exportCurrentBlueprint(): Promise<void> {
    const settings = this.settingsStore.snapshot;
    const tab =
      settings.tabs.byId[settings.uiState.lastActiveTabId] ??
      settings.tabs.byId[settings.tabs.defaultTabId];
    if (!tab) throw new Error("没有可导出的主页。");
    const blueprint = this.blueprintExporter.export(tab.dashboardId);
    const folder = "MyPage Blueprints";
    if (!this.app.vault.getAbstractFileByPath(folder)) {
      await this.app.vault.createFolder(folder);
    }
    const filename = `${blueprint.name.replace(/[\\/:*?"<>|]/gu, "-")}.mypage.json`;
    const path = normalizePath(`${folder}/${filename}`);
    const content = JSON.stringify(blueprint, null, 2);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing && "extension" in existing) {
      await this.app.vault.modify(existing as never, content);
    } else {
      await this.app.vault.create(path, content);
    }
    new Notice(`蓝图已导出到 ${path}`);
  }

  private async enableSafeModeAndOpen(): Promise<void> {
    await this.settingsStore.update((draft) => {
      draft.general.safeMode = true;
    });
    await this.openMyPage();
    new Notice("MyPage 已进入安全模式，DIY 模块不会加载。");
  }

  private async ensurePluginDirectories(): Promise<void> {
    const root =
      this.manifest.dir ??
      `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
    for (const directory of Object.values(PLUGIN_DIRECTORIES)) {
      const path = `${root}/${directory}`;
      if (!(await this.app.vault.adapter.exists(path))) {
        await this.app.vault.adapter.mkdir(path);
      }
    }
  }
}
