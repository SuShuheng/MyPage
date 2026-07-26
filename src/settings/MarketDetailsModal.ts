import { Component, MarkdownRenderer, Modal, Notice, type App } from "obsidian";

export interface MarketDetailAction {
  label: string;
  cta?: boolean;
  destructive?: boolean;
  run: () => void | Promise<void>;
}

export interface MarketDetailOptions {
  title: string;
  description: string;
  installed: boolean;
  metadata: Array<[string, string]>;
  readme?: string | Promise<string | undefined>;
  actions: MarketDetailAction[];
}

export class MarketDetailsModal extends Modal {
  private readonly markdownComponent = new Component();
  public constructor(
    app: App,
    private readonly options: MarketDetailOptions,
  ) {
    super(app);
  }

  public override onOpen(): void {
    this.markdownComponent.load();
    this.modalEl.addClass("mypage-market-details-modal");
    this.setTitle(this.options.title);
    const status = this.contentEl.createDiv("mypage-market-dialog-status");
    status.createSpan({
      text: this.options.installed ? "已安装" : "未安装",
      cls: this.options.installed ? "is-installed" : "",
    });
    this.contentEl.createEl("p", {
      text: this.options.description,
      cls: "mypage-market-dialog-description",
    });
    const meta = this.contentEl.createEl("dl", {
      cls: "mypage-market-dialog-meta",
    });
    for (const [name, value] of this.options.metadata) {
      meta.createEl("dt", { text: name });
      meta.createEl("dd", { text: value });
    }
    const readme = this.contentEl.createDiv("mypage-market-dialog-readme");
    readme.createEl("h3", { text: "说明文档" });
    readme.createEl("p", { text: "正在读取 README…", cls: "mypage-muted" });
    void Promise.resolve(this.options.readme)
      .then(async (markdown) => {
        readme.empty();
        readme.createEl("h3", { text: "说明文档" });
        if (!markdown) {
          readme.createEl("p", {
            text: "当前来源未提供可读取的 README；以上元数据来自市场强制索引。",
            cls: "mypage-muted",
          });
          return;
        }
        await MarkdownRenderer.render(
          this.app,
          markdown,
          readme,
          "",
          this.markdownComponent,
        );
      })
      .catch((error: unknown) => {
        readme.empty();
        readme.createEl("p", {
          text: error instanceof Error ? error.message : String(error),
          cls: "mypage-market-error",
        });
      });
    const actions = this.contentEl.createDiv("mypage-market-detail-actions");
    for (const action of this.options.actions) {
      const control = actions.createEl("button", {
        text: action.label,
        cls: action.cta ? "mod-cta" : action.destructive ? "mod-warning" : "",
      });
      control.addEventListener("click", () => {
        control.disabled = true;
        void Promise.resolve(action.run())
          .then(() => this.close())
          .catch((error: unknown) => {
            new Notice(error instanceof Error ? error.message : String(error), 10_000);
          })
          .finally(() => {
            control.disabled = false;
          });
      });
    }
  }

  public override onClose(): void {
    this.markdownComponent.unload();
    this.contentEl.empty();
  }
}
