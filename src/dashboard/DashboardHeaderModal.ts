import { Modal, Notice, Setting, type App } from "obsidian";
import type { Dashboard, DashboardHeader } from "../persistence/settings-types";

export const DEFAULT_DASHBOARD_HEADER: Readonly<DashboardHeader> = {
  title: "主页",
  subtitle: "你的知识，一目了然",
  titleFontSize: 34,
  subtitleFontSize: 12,
  showSummary: true,
};

export function resolveDashboardHeader(dashboard: Dashboard): DashboardHeader {
  return {
    title: dashboard.header?.title ?? dashboard.name,
    subtitle: dashboard.header?.subtitle ?? DEFAULT_DASHBOARD_HEADER.subtitle,
    titleFontSize:
      dashboard.header?.titleFontSize ?? DEFAULT_DASHBOARD_HEADER.titleFontSize,
    subtitleFontSize:
      dashboard.header?.subtitleFontSize ??
      DEFAULT_DASHBOARD_HEADER.subtitleFontSize,
    showSummary:
      dashboard.header?.showSummary ?? DEFAULT_DASHBOARD_HEADER.showSummary,
  };
}

export class DashboardHeaderModal extends Modal {
  private readonly draft: DashboardHeader;

  public constructor(
    app: App,
    dashboard: Dashboard,
    private readonly onApply: (header: DashboardHeader) => void,
  ) {
    super(app);
    this.draft = resolveDashboardHeader(dashboard);
  }

  public override onOpen(): void {
    this.modalEl.addClass("mypage-dashboard-header-modal");
    this.setTitle("页头设置");
    this.contentEl.createEl("p", {
      text: "自定义当前主页的标题、副标题、字号与右侧统计信息。",
      cls: "mypage-muted",
    });

    new Setting(this.contentEl)
      .setName("标题")
      .setDesc("只影响主页页头，不会修改 TAB 名称。")
      .addText((text) =>
        text
          .setPlaceholder("主页标题")
          .setValue(this.draft.title)
          .onChange((value) => {
            this.draft.title = value;
          }),
      );
    new Setting(this.contentEl)
      .setName("标题字号")
      .setDesc("16–72 px")
      .addSlider((slider) =>
        slider
          .setLimits(16, 72, 1)
          .setDynamicTooltip()
          .setValue(this.draft.titleFontSize)
          .onChange((value) => {
            this.draft.titleFontSize = value;
          }),
      );
    new Setting(this.contentEl)
      .setName("副标题")
      .setDesc("可以留空以隐藏副标题内容。")
      .addText((text) =>
        text
          .setPlaceholder("你的知识，一目了然")
          .setValue(this.draft.subtitle)
          .onChange((value) => {
            this.draft.subtitle = value;
          }),
      );
    new Setting(this.contentEl)
      .setName("副标题字号")
      .setDesc("9–32 px")
      .addSlider((slider) =>
        slider
          .setLimits(9, 32, 1)
          .setDynamicTooltip()
          .setValue(this.draft.subtitleFontSize)
          .onChange((value) => {
            this.draft.subtitleFontSize = value;
          }),
      );
    const summarySetting = new Setting(this.contentEl)
      .setName("显示主页统计")
      .setDesc("在页头右下角显示组件数量与主页数量。");
    const summaryToggle = summarySetting.controlEl.createEl("input", {
      type: "checkbox",
      cls: "mypage-dashboard-header-summary-toggle",
      attr: { "aria-label": "显示主页统计" },
    });
    summaryToggle.checked = this.draft.showSummary;
    summaryToggle.addEventListener("change", () => {
      this.draft.showSummary = summaryToggle.checked;
    });

    new Setting(this.contentEl)
      .addButton((button) =>
        button.setButtonText("取消").onClick(() => this.close()),
      )
      .addButton((button) =>
        button
          .setButtonText("应用到编辑会话")
          .setCta()
          .onClick(() => {
            const title = this.draft.title.trim();
            if (!title) {
              new Notice("主页标题不能为空。");
              return;
            }
            this.onApply({
              ...structuredClone(this.draft),
              title,
              subtitle: this.draft.subtitle.trim(),
            });
            this.close();
          }),
      );
  }

  public override onClose(): void {
    this.contentEl.empty();
  }
}
