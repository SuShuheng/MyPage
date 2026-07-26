import type { WorkspaceLeaf } from "obsidian";
import { ItemView } from "obsidian";
import { render } from "preact";
import { MY_PAGE_ICON, MY_PAGE_VIEW_TYPE } from "../app/constants";
import type { SettingsStore } from "../persistence/SettingsStore";
import { DashboardShell } from "./DashboardShell";
import type { DataEngine } from "../data/DataEngine";
import type { ActionExecutor } from "../actions/ActionExecutor";
import type { ModuleRuntime } from "../modules/ModuleRuntime";
import type { ThemeService } from "../theme/ThemeService";
import type { ModuleManager } from "../modules/ModuleManager";

export class MyPageView extends ItemView {
  public constructor(
    leaf: WorkspaceLeaf,
    private readonly settingsStore: SettingsStore,
    private readonly dataEngine: DataEngine,
    private readonly actions: ActionExecutor,
    private readonly moduleRuntime: ModuleRuntime,
    private readonly themeService: ThemeService,
    private readonly moduleManager: ModuleManager,
    private readonly onOpenMarketplace: () => void,
    private readonly onImportModuleZip: () => void,
  ) {
    super(leaf);
  }

  public override getViewType(): string {
    return MY_PAGE_VIEW_TYPE;
  }

  public override getDisplayText(): string {
    return "MyPage";
  }

  public override getIcon(): string {
    return MY_PAGE_ICON;
  }

  public override async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("mypage-view");
    render(
      <DashboardShell
        settingsStore={this.settingsStore}
        dataEngine={this.dataEngine}
        actions={this.actions}
        app={this.app}
        moduleRuntime={this.moduleRuntime}
        themeService={this.themeService}
        moduleManager={this.moduleManager}
        onOpenMarketplace={this.onOpenMarketplace}
        onImportModuleZip={this.onImportModuleZip}
      />,
      this.contentEl,
    );
  }

  public override async onClose(): Promise<void> {
    render(null, this.contentEl);
    this.contentEl.empty();
  }
}
