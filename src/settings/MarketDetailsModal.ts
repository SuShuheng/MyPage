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

export interface MarketDetailRenderOptions {
  actionsBeforeReadme?: boolean;
  onActionComplete?: () => void;
}

export function renderMarketDetailContent(
  app: App,
  container: HTMLElement,
  options: MarketDetailOptions,
  markdownComponent: Component,
  renderOptions: MarketDetailRenderOptions = {},
): void {
  const status = container.createDiv("mypage-market-dialog-status");
  status.createSpan({
    text: options.installed ? "已安装" : "未安装",
    cls: options.installed ? "is-installed" : "",
  });
  container.createEl("p", {
    text: options.description,
    cls: "mypage-market-dialog-description",
  });
  const meta = container.createEl("dl", {
    cls: "mypage-market-dialog-meta",
  });
  for (const [name, value] of options.metadata) {
    meta.createEl("dt", { text: name });
    meta.createEl("dd", { text: value });
  }
  const readme = container.createDiv("mypage-market-dialog-readme");
  readme.createEl("h3", { text: "说明文档" });
  readme.createEl("p", { text: "正在读取 README…", cls: "mypage-muted" });
  const actions = container.createDiv("mypage-market-detail-actions");
  if (renderOptions.actionsBeforeReadme) {
    container.insertBefore(actions, readme);
  }
  for (const action of options.actions) {
    const control = actions.createEl("button", {
      text: action.label,
      cls: action.cta ? "mod-cta" : action.destructive ? "mod-warning" : "",
    });
    control.addEventListener("click", () => {
      control.disabled = true;
      void Promise.resolve(action.run())
        .then(() => renderOptions.onActionComplete?.())
        .catch((error: unknown) => {
          new Notice(error instanceof Error ? error.message : String(error), 10_000);
        })
        .finally(() => {
          control.disabled = false;
        });
    });
  }
  void Promise.resolve(options.readme)
    .then(async (markdown) => {
      if (!readme.isConnected) return;
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
        app,
        markdown,
        readme,
        "",
        markdownComponent,
      );
    })
    .catch((error: unknown) => {
      if (!readme.isConnected) return;
      readme.empty();
      readme.createEl("p", {
        text: error instanceof Error ? error.message : String(error),
        cls: "mypage-market-error",
      });
    });
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
    renderMarketDetailContent(
      this.app,
      this.contentEl,
      this.options,
      this.markdownComponent,
      { onActionComplete: () => this.close() },
    );
  }

  public override onClose(): void {
    this.markdownComponent.unload();
    this.contentEl.empty();
  }
}
