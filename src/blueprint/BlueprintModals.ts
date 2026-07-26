import type {
  App,
  TFile} from "obsidian";
import {
  FuzzySuggestModal,
  Modal,
  Notice,
  Setting
} from "obsidian";
import type { BlueprintImporter } from "./BlueprintImporter";
import type {
  BlueprintPathBindings,
  DashboardBlueprint,
} from "./blueprint-types";
import type { MarketplaceService } from "../marketplace/MarketplaceService";
import type { ModuleManager } from "../modules/ModuleManager";

export class BlueprintFileSuggestModal extends FuzzySuggestModal<TFile> {
  public constructor(
    app: App,
    private readonly importer: BlueprintImporter,
    private readonly markets: MarketplaceService,
    private readonly modules: ModuleManager,
  ) {
    super(app);
    this.setPlaceholder("选择 .mypage.json 蓝图");
  }

  public getItems(): TFile[] {
    return this.app.vault
      .getFiles()
      .filter((file) => file.name.endsWith(".mypage.json"));
  }

  public getItemText(file: TFile): string {
    return file.path;
  }

  public onChooseItem(file: TFile): void {
    void this.openPreview(file);
  }

  private async openPreview(file: TFile): Promise<void> {
    try {
      const source = await this.app.vault.cachedRead(file);
      const blueprint = this.importer.parse(JSON.parse(source) as unknown);
      new BlueprintImportModal(
        this.app,
        this.importer,
        this.markets,
        this.modules,
        blueprint,
      ).open();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error), 10_000);
    }
  }
}

class BlueprintImportModal extends Modal {
  private readonly bindings: BlueprintPathBindings = {};

  public constructor(
    app: App,
    private readonly importer: BlueprintImporter,
    private readonly markets: MarketplaceService,
    private readonly modules: ModuleManager,
    private readonly blueprint: DashboardBlueprint,
  ) {
    super(app);
  }

  public override onOpen(): void {
    this.setTitle(`导入蓝图 · ${this.blueprint.name}`);
    const preview = this.importer.preview(this.blueprint);
    this.contentEl.createEl("p", {
      text: `${preview.widgetCount} 个组件 · ${preview.groupCount} 个分组 · ${preview.requiredModules.length} 个模块要求`,
    });
    if (preview.missingModules.length > 0) {
      this.contentEl.createEl("p", {
        text: `缺失模块：${preview.missingModules.map((item) => item.id).join("、")}`,
        cls: "mypage-market-error",
      });
    }
    for (const path of preview.externalPathBindings) {
      new Setting(this.contentEl)
        .setName(`重新绑定：${path}`)
        .addText((text) =>
          text.onChange((value) => {
            this.bindings[path] = value.trim();
          }),
        );
    }
    new Setting(this.contentEl)
      .setName("导入选项")
      .setDesc("可用来源明确的缺失模块会在导入前安装；权限仍需单独授权。")
      .addButton((button) =>
        button
          .setButtonText("确认导入")
          .setCta()
          .onClick(() => {
            void this.importBlueprint();
          }),
      )
      .addButton((button) =>
        button.setButtonText("取消").onClick(() => this.close()),
      );
  }

  private async importBlueprint(): Promise<void> {
    try {
      const preview = this.importer.preview(this.blueprint);
      for (const requirement of preview.missingModules) {
        if (requirement.sourceId) {
          await this.markets.install(requirement.sourceId, requirement.id);
        }
      }
      await this.modules.scan();
      await this.importer.import(this.blueprint, this.bindings);
      this.close();
      new Notice("MyPage 蓝图已导入。");
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error), 10_000);
    }
  }
}
