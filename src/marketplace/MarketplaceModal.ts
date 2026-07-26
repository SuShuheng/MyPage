import type {
  App} from "obsidian";
import {
  Modal,
  Notice,
  Setting,
} from "obsidian";
import type { MarketplaceService } from "./MarketplaceService";
import type { MarketIndex } from "./market-types";
import type { ModuleManager } from "../modules/ModuleManager";

export class MarketplaceModal extends Modal {
  private sourceId = "official";
  private loading = false;

  public constructor(
    app: App,
    private readonly service: MarketplaceService,
    private readonly modules: ModuleManager,
  ) {
    super(app);
  }

  public override onOpen(): void {
    this.modalEl.addClass("mypage-market-modal");
    void this.render(true);
  }

  public override onClose(): void {
    this.contentEl.empty();
  }

  private async render(autoCheckOfficial = false): Promise<void> {
    this.contentEl.empty();
    this.setTitle("MyPage 模块市场");
    const sources = this.service.listSources();
    const source = sources.find((candidate) => candidate.id === this.sourceId)
      ?? sources[0];
    if (!source) {
      this.contentEl.createEl("p", { text: "没有已配置的模块市场。" });
      return;
    }
    this.sourceId = source.id;

    const controls = this.contentEl.createDiv("mypage-market-controls");
    const select = controls.createEl("select");
    for (const item of sources) {
      select.createEl("option", {
        text: `${item.type === "official" ? "官方" : "第三方"} · ${item.repo}`,
        value: item.id,
      });
    }
    select.value = source.id;
    select.addEventListener("change", () => {
      this.sourceId = select.value;
      void this.render(this.sourceId === "official");
    });
    const checkButton = controls.createEl("button", {
      text: source.type === "official" ? "检查更新" : "手动检测",
      cls: "mod-cta",
    });
    checkButton.disabled = this.loading;
    checkButton.addEventListener("click", () => {
      void this.checkAndRender("manual");
    });

    new Setting(this.contentEl)
      .setName("添加第三方市场")
      .setDesc("仅支持公开 GitHub owner/repo；第三方市场不会主动检测更新。")
      .addText((text) => text.setPlaceholder("owner/repo"))
      .addButton((button) =>
        button.setButtonText("添加并校验").onClick(async () => {
          const input = this.contentEl.querySelector<HTMLInputElement>(
            ".setting-item input[type='text']",
          );
          if (!input?.value) return;
          try {
            this.sourceId = await this.service.addThirdParty(input.value);
            await this.render(false);
          } catch (error) {
            new Notice(error instanceof Error ? error.message : String(error));
          }
        }),
      );

    let index = this.service.getCached(source.id);
    let offline = false;
    if (autoCheckOfficial && source.type === "official") {
      try {
        this.loading = true;
        index = await this.service.check(source.id, "official-page-open");
      } catch (error) {
        offline = true;
        this.contentEl.createEl("p", {
          text: `官方市场暂时不可用：${error instanceof Error ? error.message : String(error)}`,
          cls: "mypage-market-error",
        });
      } finally {
        this.loading = false;
      }
    }
    const refreshedSource = this.service
      .listSources()
      .find((candidate) => candidate.id === source.id);
    this.renderIndex(
      index,
      refreshedSource?.cachedIndex?.fetchedAt,
      offline,
    );
  }

  private async checkAndRender(reason: "manual"): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      await this.service.check(this.sourceId, reason);
      await this.render(false);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
      await this.render(false);
    } finally {
      this.loading = false;
    }
  }

  private renderIndex(
    index: MarketIndex | undefined,
    fetchedAt?: number,
    offline = false,
  ): void {
    if (!index) {
      this.contentEl.createEl("div", {
        text: "尚无缓存索引。点击检测以获取这个市场的模块。",
        cls: "mypage-market-empty",
      });
      return;
    }
    if (fetchedAt !== undefined) {
      this.contentEl.createEl("small", {
        text: `${offline ? "正在使用离线缓存" : "索引缓存"} · ${new Date(fetchedAt).toLocaleString()}`,
        cls: "mypage-market-cache-status",
      });
    }
    const statuses = new Map(
      this.service.updateStatuses(index).map((status) => [status.moduleId, status]),
    );
    const list = this.contentEl.createDiv("mypage-market-list");
    if (index.modules.length === 0) {
      list.createEl("p", { text: "这个市场目前没有模块。" });
    }
    for (const module of index.modules) {
      const status = statuses.get(module.id);
      const card = list.createDiv("mypage-market-card");
      const content = card.createDiv();
      content.createEl("h3", { text: module.name });
      content.createEl("p", { text: module.description });
      content.createEl("small", {
        text: status?.installedVersion
          ? `已安装 ${status.installedVersion}${status.updateAvailable ? " · 有更新" : ""}`
          : `最新 ${status?.latestVersion?.version ?? "未知"}`,
      });
      const install = card.createEl("button", {
        text: status?.updateAvailable
          ? "更新"
          : status?.installedVersion
            ? "已安装"
            : "安装",
        cls: status?.installedVersion && !status.updateAvailable ? "" : "mod-cta",
      });
      install.disabled = Boolean(status?.installedVersion && !status.updateAvailable);
      install.addEventListener("click", () => {
        void this.installModule(module.id);
      });
    }
  }

  private async installModule(moduleId: string): Promise<void> {
    try {
      await this.service.install(this.sourceId, moduleId);
      await this.modules.scan();
      new Notice(`模块 ${moduleId} 已安装。`);
      await this.render(false);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error), 10_000);
    }
  }
}
