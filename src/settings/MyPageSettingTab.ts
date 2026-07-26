import manifestJson from "../../manifest.json";
import {
  Notice,
  PluginSettingTab,
  Setting,
  setIcon,
  type App,
  type ButtonComponent,
} from "obsidian";
import type MyPagePlugin from "../app/MyPagePlugin";
import { ModulePermissionModal } from "../permissions/ModulePermissionModal";
import { ModuleSettingsModal } from "../modules/ModuleSettingsModal";
import { confirmDialog, promptDialog } from "../components/ThemeDialog";
import type {
  ModuleInstallation,
  ThemeProfile,
} from "../persistence/settings-types";
import type {
  MarketIndex,
  MarketModule,
  ModuleUpdateStatus,
} from "../marketplace/market-types";

export type SettingsTabId =
  | "general"
  | "advanced"
  | "appearance"
  | "theme-market"
  | "module-market"
  | "module-management"
  | "about"
  | "backup";

const SETTINGS_TABS: Array<[SettingsTabId, string, string]> = [
  ["general", "通用", "settings-2"],
  ["advanced", "高级", "sliders-horizontal"],
  ["appearance", "外观", "palette"],
  ["theme-market", "主题市场", "paintbrush"],
  ["module-market", "模块市场", "store"],
  ["module-management", "模块管理", "blocks"],
  ["about", "关于", "info"],
  ["backup", "备份与恢复", "archive-restore"],
];

export class MyPageSettingTab extends PluginSettingTab {
  private activeTab: SettingsTabId = "general";
  private marketSourceId = "official";
  private marketSearch = "";
  private marketStatus = "all";
  private marketPlatform = "all";
  private marketType = "all";
  private selectedModuleId = "";
  private marketLoading = false;
  private marketMessage = "";
  private themeSourceId = "official";
  private selectedThemeId = "";
  private themeSearch = "";
  private themeLoading = false;

  public constructor(
    app: App,
    private readonly myPagePlugin: MyPagePlugin,
  ) {
    super(app, myPagePlugin);
  }

  public show(tab: SettingsTabId): void {
    this.activeTab = tab;
    this.display();
  }

  public override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("mypage-settings");
    this.renderHeader(containerEl);
    this.renderTabs(containerEl);
    const panel = containerEl.createDiv({
      cls: "mypage-settings-panel",
      attr: {
        role: "tabpanel",
        "aria-label": SETTINGS_TABS.find(([id]) => id === this.activeTab)?.[1] ?? "",
      },
    });
    switch (this.activeTab) {
      case "general":
        this.renderGeneral(panel);
        break;
      case "advanced":
        this.renderAdvanced(panel);
        break;
      case "appearance":
        this.renderAppearance(panel);
        break;
      case "theme-market":
        this.renderThemeMarket(panel);
        break;
      case "module-market":
        this.renderModuleMarket(panel);
        break;
      case "module-management":
        this.renderModuleManagement(panel);
        break;
      case "about":
        this.renderAbout(panel);
        break;
      case "backup":
        this.renderBackup(panel);
        break;
    }
  }

  public override update(): void;
  public override update(
    mutate: Parameters<MyPagePlugin["settingsStore"]["update"]>[0],
  ): Promise<void>;
  public override update(
    mutate?: Parameters<MyPagePlugin["settingsStore"]["update"]>[0],
  ): void | Promise<void> {
    if (!mutate) {
      this.display();
      return;
    }
    return this.persistUpdate(mutate);
  }

  private renderHeader(container: HTMLElement): void {
    const header = container.createDiv("mypage-settings-header");
    const brand = header.createDiv("mypage-settings-brand");
    const mark = brand.createDiv("mypage-settings-logo");
    setIcon(mark, "layout-dashboard");
    const copy = brand.createDiv();
    copy.createEl("h2", { text: "MyPage 设置中心" });
    copy.createEl("p", {
      text: "主页、市场、主题、模块权限与恢复工具集中管理。",
    });
    new Setting(header).addButton((button: ButtonComponent) =>
      button.setButtonText("打开 MyPage").setCta().onClick(() => {
        void this.myPagePlugin.openMyPage();
      }),
    );
    if (this.myPagePlugin.settingsStore.recoveryMode) {
      const recovery = container.createDiv("mypage-recovery-banner");
      recovery.createEl("strong", { text: "配置恢复模式" });
      recovery.createEl("p", {
        text: "原 data.json 未被覆盖，损坏副本已保存到 backups/。请从“备份与恢复”处理。",
      });
    }
  }

  private renderTabs(container: HTMLElement): void {
    const tabs = container.createDiv({
      cls: "mypage-settings-tabs",
      attr: { role: "tablist", "aria-label": "MyPage 设置分类" },
    });
    for (const [id, label, icon] of SETTINGS_TABS) {
      const button = tabs.createEl("button", {
        cls: this.activeTab === id ? "is-active" : "",
        attr: {
          type: "button",
          role: "tab",
          "aria-selected": String(this.activeTab === id),
        },
      });
      const iconEl = button.createSpan();
      setIcon(iconEl, icon);
      button.createSpan({ text: label });
      button.addEventListener("click", () => {
        this.activeTab = id;
        this.display();
      });
    }
  }

  private renderGeneral(container: HTMLElement): void {
    const settings = this.myPagePlugin.settingsStore.snapshot;
    sectionIntro(
      container,
      "通用",
      "控制 Obsidian 启动、主页打开位置、TAB 导航与编辑网格的默认行为。",
    );
    heading(container, "启动与主页");
    new Setting(container)
      .setName("Obsidian 启动后打开")
      .setDesc("首次启动会先询问；关闭后仍可通过功能区或命令打开。")
      .addToggle((toggle) =>
        toggle.setValue(settings.general.openOnStartup).onChange(async (value) => {
          await this.update((draft) => {
            draft.general.openOnStartup = value;
          });
        }),
      );
    new Setting(container)
      .setName("启动主页")
      .setDesc("展示上次使用的主页，或始终展示指定主页。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("specific", "指定主页")
          .addOption("last", "上次打开")
          .setValue(settings.general.startupTabMode)
          .onChange(async (value) => {
            await this.update((draft) => {
              draft.general.startupTabMode = value === "last" ? "last" : "specific";
            });
            this.display();
          }),
      );
    if (settings.general.startupTabMode === "specific") {
      new Setting(container)
        .setName("指定主页")
        .setDesc("作为启动时优先展示的 MyPage TAB。")
        .addDropdown((dropdown) => {
          for (const id of settings.tabs.order) {
            const tab = settings.tabs.byId[id];
            if (tab) dropdown.addOption(tab.id, tab.name);
          }
          return dropdown
            .setValue(settings.general.startupTabId)
            .onChange(async (value) => {
              await this.update((draft) => {
                draft.general.startupTabId = value;
                draft.tabs.defaultTabId = value;
              });
            });
        });
    }
    new Setting(container)
      .setName("打开位置")
      .setDesc("决定启动和命令打开 MyPage 时使用哪个叶子视图。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("reuse", "复用已有 MyPage")
          .addOption("replace-empty", "替换空白页")
          .addOption("new-leaf", "新标签页")
          .setValue(settings.general.startupOpenMode)
          .onChange(async (value) => {
            await this.update((draft) => {
              draft.general.startupOpenMode =
                value === "replace-empty" || value === "new-leaf"
                  ? value
                  : "reuse";
            });
          }),
      );
    new Setting(container)
      .setName("工作区恢复策略")
      .setDesc("默认尊重 Obsidian 已恢复的工作区；也可在启动时聚焦 MyPage。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("respect", "尊重工作区")
          .addOption("focus-mypage", "聚焦 MyPage")
          .setValue(settings.general.restoreWorkspaceBehavior)
          .onChange(async (value) => {
            await this.update((draft) => {
              draft.general.restoreWorkspaceBehavior =
                value === "focus-mypage" ? "focus-mypage" : "respect";
            });
          }),
      );

    heading(container, "标签与导航");
    new Setting(container)
      .setName("标签栏位置")
      .setDesc("移动端始终回退为顶部横向标签栏。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("top", "顶部")
          .addOption("left", "左侧")
          .setValue(settings.uiState.tabBarPosition)
          .onChange(async (value) => {
            await this.update((draft) => {
              draft.uiState.tabBarPosition = value === "left" ? "left" : "top";
            });
          }),
      );
    new Setting(container)
      .setName("紧凑标签")
      .setDesc("缩小标签间距，适合主页较多的用户。")
      .addToggle((toggle) =>
        toggle.setValue(settings.uiState.compactTabs).onChange(async (value) => {
          await this.update((draft) => {
            draft.uiState.compactTabs = value;
          });
        }),
      );

    heading(container, "编辑与网格");
    const activeDashboard =
      settings.dashboards[
        settings.tabs.byId[settings.tabs.defaultTabId]?.dashboardId ?? ""
      ];
    for (const [key, name, description] of GRID_TOGGLES) {
      new Setting(container)
        .setName(name)
        .setDesc(`${description}（应用到全部主页）`)
        .addToggle((toggle) =>
          toggle
            .setValue(activeDashboard?.gridOptions[key] ?? true)
            .onChange(async (value) => {
              await this.update((draft) => {
                for (const item of Object.values(draft.dashboards)) {
                  item.gridOptions[key] = value;
                }
              });
            }),
        );
    }
    new Setting(container)
      .setName("网格间距")
      .setDesc("组件之间的像素间距，范围 4–32。")
      .addSlider((slider) =>
        slider
          .setLimits(4, 32, 1)
          .setDynamicTooltip()
          .setValue(activeDashboard?.gridOptions.gap ?? 14)
          .onChange(async (value) => {
            await this.update((draft) => {
              for (const dashboard of Object.values(draft.dashboards)) {
                dashboard.gridOptions.gap = value;
              }
            });
          }),
      );
  }

  private renderAdvanced(container: HTMLElement): void {
    const settings = this.myPagePlugin.settingsStore.snapshot;
    sectionIntro(
      container,
      "高级",
      "性能、Worker、诊断与安全模式。普通使用无需修改这些选项。",
    );
    heading(container, "数据与性能");
    new Setting(container)
      .setName("后台 Worker 数量")
      .setDesc("检测、哈希、Schema 与查询使用异步 Worker，不堵塞 Obsidian 主线程。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("auto", "自动")
          .addOption("1", "1")
          .addOption("2", "2")
          .addOption("4", "4")
          .setValue(String(settings.uiState.workerCount))
          .onChange(async (value) => {
            await this.update((draft) => {
              draft.uiState.workerCount =
                value === "auto" ? "auto" : Math.max(1, Number(value));
            });
            new Notice("Worker 数量将在重新加载插件后生效。");
          }),
      );
    new Setting(container)
      .setName("调试诊断")
      .setDesc("在控制台输出查询、模块和性能诊断，不包含笔记正文。")
      .addToggle((toggle) =>
        toggle.setValue(settings.uiState.debug).onChange(async (value) => {
          await this.update((draft) => {
            draft.uiState.debug = value;
          });
        }),
      );
    new Setting(container)
      .setName("导出诊断报告")
      .setDesc("导出设置摘要、模块状态和性能数据，不包含笔记正文。")
      .addButton((button) =>
        button.setButtonText("导出报告").onClick(async () => {
          const path = await this.myPagePlugin.diagnostics.export();
          new Notice(`诊断报告已导出到 ${path}`);
        }),
      );
    heading(container, "安全");
    new Setting(container)
      .setName("安全模式")
      .setDesc("不运行任何 DIY 模块，但保留主页、组件实例和已安装模块。")
      .addToggle((toggle) =>
        toggle.setValue(settings.general.safeMode).onChange(async (value) => {
          await this.update((draft) => {
            draft.general.safeMode = value;
          });
        }),
      );
  }

  private renderAppearance(container: HTMLElement): void {
    const settings = this.myPagePlugin.settingsStore.snapshot;
    const dashboard =
      settings.dashboards[
        settings.tabs.byId[settings.tabs.defaultTabId]?.dashboardId ?? ""
      ];
    const themeId = dashboard?.themeProfileId ?? "theme-default";
    const theme = settings.themeProfiles[themeId];
    sectionIntro(
      container,
      "外观",
      "选择已安装主题，并在主题之上覆盖背景、颜色、圆角与动效。",
    );
    const preview = container.createDiv("mypage-active-theme-card");
    const swatch = preview.createDiv("mypage-theme-preview");
    swatch.style.background =
      theme?.preview ??
      String(theme?.tokens.background ?? "var(--background-primary)");
    const copy = preview.createDiv();
    copy.createEl("strong", { text: theme?.name ?? "跟随 Obsidian" });
    copy.createEl("small", {
      text: theme?.description ?? "使用当前 Obsidian 主题变量。",
    });
    new Setting(container)
      .setName("已安装主题")
      .setDesc("切换后应用到全部主页；可在“主题市场”安装更多主题。")
      .addDropdown((dropdown) => {
        for (const profile of Object.values(settings.themeProfiles)) {
          dropdown.addOption(profile.id, profile.name);
        }
        return dropdown.setValue(themeId).onChange(async (value) => {
          await this.update((draft) => {
            for (const item of Object.values(draft.dashboards)) {
              item.themeProfileId = value;
            }
          });
          this.display();
        });
      });
    new Setting(container)
      .setName("主页主题模式")
      .setDesc("跟随 Obsidian，或强制使用浅色/深色主题档案。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("obsidian", "跟随 Obsidian")
          .addOption("light", "浅色")
          .addOption("dark", "深色")
          .setValue(theme?.mode ?? "obsidian")
          .onChange(async (value) => {
            await this.update((draft) => {
              const profile = draft.themeProfiles[themeId];
              if (profile) {
                profile.mode =
                  value === "light" || value === "dark" ? value : "obsidian";
              }
            });
          }),
      );
    new Setting(container)
      .setName("自定义背景")
      .setDesc("支持 HTTPS 图片地址、data URL 或 CSS 渐变；留空使用主题背景。")
      .addText((text) =>
        text
          .setPlaceholder("https://… 或 linear-gradient(…)")
          .setValue(theme?.backgroundImage ?? "")
          .onChange(async (value) => {
            await this.update((draft) => {
              const profile = draft.themeProfiles[themeId];
              if (profile) profile.backgroundImage = value.trim();
            });
          }),
      )
      .addButton((button) =>
        button.setButtonText("选择图片").onClick(() => {
          this.pickBackgroundImage(themeId);
        }),
      )
      .addButton((button) =>
        button.setButtonText("清除").onClick(async () => {
          await this.update((draft) => {
            const profile = draft.themeProfiles[themeId];
            if (profile) delete profile.backgroundImage;
          });
          this.display();
        }),
      );
    new Setting(container)
      .setName("主题强调色")
      .setDesc("十六进制颜色或 CSS 颜色；留空恢复主题默认值。")
      .addColorPicker((picker) =>
        picker
          .setValue(normalizeColor(String(theme?.tokens.accent ?? "#7c3aed")))
          .onChange(async (value) => {
            await this.update((draft) => {
              const profile = draft.themeProfiles[themeId];
              if (profile) profile.tokens.accent = value;
            });
          }),
      );
    new Setting(container)
      .setName("组件圆角")
      .setDesc("主题级圆角；单个组件仍可在自身外观中覆盖。")
      .addSlider((slider) =>
        slider
          .setLimits(0, 32, 1)
          .setDynamicTooltip()
          .setValue(Number(theme?.tokens.radius ?? 16))
          .onChange(async (value) => {
            await this.update((draft) => {
              const profile = draft.themeProfiles[themeId];
              if (profile) profile.tokens.radius = value;
            });
          }),
      );
    new Setting(container)
      .setName("动效级别")
      .setDesc("额外服从操作系统的减少动态效果偏好。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("full", "完整")
          .addOption("reduced", "精简")
          .addOption("off", "关闭")
          .setValue(settings.uiState.animationLevel)
          .onChange(async (value) => {
            await this.update((draft) => {
              draft.uiState.animationLevel =
                value === "off" || value === "reduced" ? value : "full";
            });
          }),
      );
  }

  private renderThemeMarket(container: HTMLElement): void {
    sectionIntro(
      container,
      "主题市场",
      "官方主题来自 MyPage 内置可信目录；第三方主题市场仅在用户手动检测时访问。",
    );
    const toolbar = container.createDiv("mypage-market-toolbar");
    const source = toolbar.createEl("select", {
      attr: { "aria-label": "主题市场来源" },
    });
    source.createEl("option", { text: "官方主题市场", value: "official" });
    for (const item of this.myPagePlugin.themeMarketplace.listThirdPartySources()) {
      source.createEl("option", {
        text: `第三方 · ${item.repo}`,
        value: item.id,
      });
    }
    source.value = this.themeSourceId;
    source.addEventListener("change", () => {
      this.themeSourceId = source.value;
      this.selectedThemeId = "";
      this.display();
    });
    const search = toolbar.createEl("input", {
      type: "search",
      placeholder: "搜索主题名称、作者或风格",
      attr: { "aria-label": "搜索主题" },
    });
    search.value = this.themeSearch;
    search.addEventListener("input", () => {
      this.themeSearch = search.value;
      window.setTimeout(() => this.display(), 120);
    });
    if (this.themeSourceId !== "official") {
      const check = toolbar.createEl("button", {
        text: this.themeLoading ? "检测中…" : "手动检测更新",
        cls: "mod-cta",
      });
      check.disabled = this.themeLoading;
      check.addEventListener("click", () => void this.refreshThemeMarket());
    }
    new Setting(container)
      .setName("添加第三方主题市场")
      .setDesc("输入公开 GitHub owner/repo；仓库必须包含 .mypage-theme-market/index.json。")
      .addText((text) => {
        text.setPlaceholder("owner/repo");
        text.inputEl.addClass("mypage-theme-repo-input");
        text.inputEl.title = "示例：owner/repository。第三方市场不会主动联网检查。";
      })
      .addButton((button) =>
        button.setButtonText("添加并检测").onClick(async () => {
          const input = container.querySelector<HTMLInputElement>(
            ".mypage-theme-repo-input",
          );
          if (!input?.value.trim()) {
            new Notice("请输入 GitHub owner/repo。");
            return;
          }
          try {
            this.themeLoading = true;
            this.themeSourceId =
              await this.myPagePlugin.themeMarketplace.addThirdParty(
                input.value,
              );
            this.display();
          } catch (error) {
            new Notice(error instanceof Error ? error.message : String(error), 10_000);
          } finally {
            this.themeLoading = false;
          }
        }),
      );
    const themes =
      this.themeSourceId === "official"
        ? this.myPagePlugin.themeMarketplace.officialThemes()
        : this.myPagePlugin.themeMarketplace.getCached(this.themeSourceId)?.themes ?? [];
    const query = this.themeSearch.trim().toLocaleLowerCase();
    const filtered = themes.filter((theme) =>
      !query ||
      [theme.name, theme.description, theme.author]
        .some((value) => value?.toLocaleLowerCase().includes(query)),
    );
    const layout = container.createDiv("mypage-market-layout");
    const grid = layout.createDiv("mypage-theme-grid");
    for (const theme of filtered) {
      const installed =
        this.myPagePlugin.settingsStore.snapshot.themeProfiles[theme.id];
      const card = grid.createEl("button", {
        cls: `mypage-theme-card ${this.selectedThemeId === theme.id ? "is-selected" : ""}`,
        attr: { type: "button" },
      });
      const preview = card.createDiv("mypage-theme-preview");
      preview.style.background =
        theme.preview ?? String(theme.tokens.background ?? "var(--background-secondary)");
      card.createEl("strong", { text: theme.name });
      card.createEl("span", { text: theme.description ?? "MyPage 主题" });
      card.createEl("small", {
        text: `${theme.author ?? "未知作者"} · ${installed ? "已安装" : "未安装"}`,
      });
      card.addEventListener("click", () => {
        this.selectedThemeId = theme.id;
        this.display();
      });
    }
    const selected = themes.find((theme) => theme.id === this.selectedThemeId);
    const details = layout.createDiv("mypage-market-detail");
    if (!selected) {
      details.createEl("p", {
        text: filtered.length
          ? "选择一个主题查看颜色、字体、布局和安装选项。"
          : "没有符合筛选条件的主题。",
        cls: "mypage-muted",
      });
      return;
    }
    this.renderThemeDetails(details, selected);
  }

  private renderModuleMarket(container: HTMLElement): void {
    sectionIntro(
      container,
      "模块市场",
      "官方与第三方市场分离；官方进入页面时可检查，第三方仅响应手动检测。",
    );
    const sources = this.myPagePlugin.marketplace.listSources();
    if (!sources.some((source) => source.id === this.marketSourceId)) {
      this.marketSourceId = sources[0]?.id ?? "official";
    }
    const source = sources.find((item) => item.id === this.marketSourceId);
    const toolbar = container.createDiv("mypage-market-toolbar");
    const sourceSelect = toolbar.createEl("select", {
      attr: { "aria-label": "模块市场来源" },
    });
    for (const item of sources) {
      sourceSelect.createEl("option", {
        text: `${item.type === "official" ? "官方" : "第三方"} · ${item.repo}`,
        value: item.id,
      });
    }
    sourceSelect.value = this.marketSourceId;
    sourceSelect.addEventListener("change", () => {
      this.marketSourceId = sourceSelect.value;
      this.selectedModuleId = "";
      this.marketMessage = "";
      this.display();
    });
    const search = toolbar.createEl("input", {
      type: "search",
      placeholder: "搜索 DIY 模块",
      attr: { "aria-label": "搜索 DIY 模块" },
    });
    search.value = this.marketSearch;
    search.addEventListener("input", () => {
      this.marketSearch = search.value;
      window.setTimeout(() => this.display(), 120);
    });
    const status = toolbar.createEl("select", {
      attr: { "aria-label": "安装状态筛选" },
    });
    for (const [value, label] of [
      ["all", "全部状态"],
      ["installed", "已安装"],
      ["update", "可更新"],
      ["uninstalled", "未安装"],
    ] as const) status.createEl("option", { value, text: label });
    status.value = this.marketStatus;
    status.addEventListener("change", () => {
      this.marketStatus = status.value;
      this.display();
    });
    const platform = toolbar.createEl("select", {
      attr: { "aria-label": "平台筛选" },
    });
    for (const [value, label] of [
      ["all", "全部平台"],
      ["desktop", "桌面端"],
      ["mobile", "移动端"],
    ] as const) platform.createEl("option", { value, text: label });
    platform.value = this.marketPlatform;
    platform.addEventListener("change", () => {
      this.marketPlatform = platform.value;
      this.display();
    });
    const type = toolbar.createEl("select", {
      attr: { "aria-label": "模块类型筛选" },
    });
    for (const [value, label] of [
      ["all", "全部类型"],
      ["visualization", "可视化组件"],
      ["data", "数据与转换"],
      ["actions", "快捷操作"],
      ["templates", "主页模板"],
      ["settings", "设置扩展"],
    ] as const) type.createEl("option", { value, text: label });
    type.value = this.marketType;
    type.addEventListener("change", () => {
      this.marketType = type.value;
      this.display();
    });
    const check = toolbar.createEl("button", {
      text:
        this.marketLoading
          ? "检测中…"
          : source?.type === "official"
            ? "检查官方更新"
            : "手动检测",
      cls: "mod-cta",
    });
    check.disabled = this.marketLoading;
    check.addEventListener("click", () => void this.refreshModuleMarket());

    new Setting(container)
      .setName("添加第三方模块市场")
      .setDesc("输入公开 GitHub owner/repo；第三方市场不会主动检查更新。")
      .addText((text) => {
        text.setPlaceholder("owner/repo");
        text.inputEl.addClass("mypage-module-repo-input");
      })
      .addButton((button) =>
        button.setButtonText("添加并检测").onClick(async () => {
          const input = container.querySelector<HTMLInputElement>(
            ".mypage-module-repo-input",
          );
          if (!input?.value.trim()) {
            new Notice("请输入 GitHub owner/repo。");
            return;
          }
          try {
            this.marketLoading = true;
            this.marketSourceId =
              await this.myPagePlugin.marketplace.addThirdParty(input.value);
            this.display();
          } catch (error) {
            new Notice(error instanceof Error ? error.message : String(error), 10_000);
          } finally {
            this.marketLoading = false;
          }
        }),
      );
    if (this.marketMessage) {
      container.createDiv({
        text: this.marketMessage,
        cls: "mypage-market-status",
        attr: { role: "status", "aria-live": "polite" },
      });
    }
    const index = this.myPagePlugin.marketplace.getCached(this.marketSourceId);
    if (!index) {
      container.createEl("p", {
        text: "此市场尚无缓存索引，请点击检测。",
        cls: "mypage-market-empty",
      });
      return;
    }
    this.renderModuleIndex(container, index);
  }

  private renderModuleManagement(container: HTMLElement): void {
    const settings = this.myPagePlugin.settingsStore.snapshot;
    sectionIntro(
      container,
      "模块管理",
      "管理已安装模块、启用状态、细粒度权限、模块级配置与本地导入。",
    );
    new Setting(container)
      .setName("导入与扫描")
      .setDesc("ZIP 模块默认在沙箱中运行；重新扫描不会删除已安装模块。")
      .addButton((button) =>
        button.setButtonText("导入 ZIP").setCta().onClick(() => {
          this.myPagePlugin.pickModuleArchive();
        }),
      )
      .addButton((button) =>
        button.setButtonText("重新扫描").onClick(async () => {
          await this.myPagePlugin.moduleManager.scan();
          new Notice("已重新扫描 diy-plugins/。");
          this.display();
        }),
      );
    const modules = Object.values(settings.modules);
    if (modules.length === 0) {
      container.createEl("p", {
        text: "尚未安装 DIY 模块。可前往“模块市场”或导入 ZIP。",
        cls: "mypage-market-empty",
      });
      return;
    }
    const list = container.createDiv("mypage-module-management-list");
    for (const module of modules) {
      const row = list.createDiv("mypage-module-management-card");
      const summary = row.createDiv();
      summary.createEl("strong", { text: module.name });
      summary.createEl("small", {
        text: `${module.version} · ${sourceName(module.sourceType)} · ${
          module.trustLevel === "trusted" ? "受信任（仍需授权）" : "沙箱"
        }`,
      });
      if (module.lastError) {
        summary.createEl("p", {
          text: module.lastError,
          cls: "mypage-market-error",
        });
      }
      const actions = row.createDiv("mypage-module-management-actions");
      const toggle = actions.createEl("input", {
        type: "checkbox",
        attr: { "aria-label": `启用 ${module.name}` },
      });
      toggle.checked = module.enabled;
      toggle.addEventListener("change", () => {
        void this.myPagePlugin.moduleManager.setEnabled(module.id, toggle.checked);
      });
      button(actions, "权限与信任", () => {
        new ModulePermissionModal(
          this.app,
          module.id,
          this.myPagePlugin.moduleManager,
          this.myPagePlugin.permissions,
        ).open();
      });
      button(actions, "模块配置", () => {
        new ModuleSettingsModal(
          this.app,
          module.id,
          this.myPagePlugin.moduleManager,
          this.myPagePlugin.settingsStore,
          this.myPagePlugin.workers,
          this.myPagePlugin.secrets,
          async () => {
            await this.myPagePlugin.moduleRuntime.restartDataSources(
              this.myPagePlugin.dataEngine,
            );
          },
        ).open();
      });
      button(actions, "卸载", () => void this.uninstallModule(module), true);
    }
  }

  private renderAbout(container: HTMLElement): void {
    const settings = this.myPagePlugin.settingsStore.snapshot;
    sectionIntro(
      container,
      "关于 MyPage",
      "版本、许可、仓库和插件本身的更新策略。",
    );
    const hero = container.createDiv("mypage-about-hero");
    const logo = hero.createDiv("mypage-about-logo");
    setIcon(logo, "layout-dashboard");
    const copy = hero.createDiv();
    copy.createEl("h2", { text: `MyPage ${manifestJson.version}` });
    copy.createEl("p", {
      text: manifestJson.description,
    });
    const links = hero.createDiv("mypage-about-links");
    const github = links.createEl("a", {
      href: "https://github.com/SuShuHeng/MyPage",
      attr: { target: "_blank", rel: "noopener noreferrer" },
    });
    const githubIcon = github.createSpan();
    setIcon(githubIcon, "github");
    github.createSpan({ text: "GitHub 仓库" });
    const license = links.createEl("a", {
      href: "https://www.apache.org/licenses/LICENSE-2.0",
      attr: { target: "_blank", rel: "noopener noreferrer" },
    });
    const licenseIcon = license.createSpan();
    setIcon(licenseIcon, "badge-check");
    license.createSpan({ text: "Apache License 2.0" });
    const facts = container.createDiv("mypage-about-facts");
    fact(facts, "作者", "SuShuHeng / MyPage Contributors");
    fact(facts, "仓库", "SuShuHeng/MyPage");
    fact(facts, "插件 ID", manifestJson.id);
    fact(facts, "当前版本", manifestJson.version);
    heading(container, "更新");
    new Setting(container)
      .setName("更新通道")
      .setDesc("稳定版为默认；预览版包含 beta 与 rc。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("stable", "稳定版")
          .addOption("preview", "预览版")
          .setValue(settings.updates.channel)
          .onChange(async (value) => {
            await this.update((draft) => {
              draft.updates.channel = value === "preview" ? "preview" : "stable";
            });
          }),
      );
    new Setting(container)
      .setName("启动时检查更新")
      .setDesc("每个 Obsidian 会话最多异步检查一次。")
      .addToggle((toggle) =>
        toggle.setValue(settings.updates.checkOnStartup).onChange(async (value) => {
          await this.update((draft) => {
            draft.updates.checkOnStartup = value;
          });
        }),
      )
      .addButton((button) =>
        button.setButtonText("立即检查").setCta().onClick(async () => {
          await this.myPagePlugin.checkForUpdates(true);
        }),
      );
    if (settings.updates.lastCheckedAt) {
      container.createEl("small", {
        text: `上次检查：${new Date(settings.updates.lastCheckedAt).toLocaleString()}`,
        cls: "mypage-muted",
      });
    }
  }

  private renderBackup(container: HTMLElement): void {
    const settings = this.myPagePlugin.settingsStore.snapshot;
    sectionIntro(
      container,
      "备份与恢复",
      "正式写入 data.json 前自动备份；恢复前也会先保存当前配置。",
    );
    new Setting(container)
      .setName("备份保留数量")
      .setDesc("范围 3–30 份，超出后删除最旧备份。")
      .addSlider((slider) =>
        slider
          .setLimits(3, 30, 1)
          .setDynamicTooltip()
          .setValue(settings.uiState.backupRetention)
          .onChange(async (value) => {
            await this.update((draft) => {
              draft.uiState.backupRetention = value;
            });
          }),
      );
    new Setting(container)
      .setName("从备份恢复")
      .setDesc("选择一份有效备份恢复；当前 data.json 会先创建新备份。")
      .addButton((button) =>
        button.setButtonText("选择备份").setCta().onClick(async () => {
          await this.restoreBackup();
        }),
      );
  }

  private renderModuleIndex(container: HTMLElement, index: MarketIndex): void {
    const statuses = new Map(
      this.myPagePlugin.marketplace
        .updateStatuses(index)
        .map((status) => [status.moduleId, status]),
    );
    const query = this.marketSearch.trim().toLocaleLowerCase();
    const filtered = index.modules.filter((module) => {
      const status = statuses.get(module.id);
      const matchesSearch =
        !query ||
        [module.name, module.description, module.author, module.id].some(
          (value) => value.toLocaleLowerCase().includes(query),
        );
      const matchesStatus =
        this.marketStatus === "all" ||
        (this.marketStatus === "installed" && Boolean(status?.installedVersion)) ||
        (this.marketStatus === "update" && Boolean(status?.updateAvailable)) ||
        (this.marketStatus === "uninstalled" && !status?.installedVersion);
      const platforms = status?.latestVersion?.platforms ?? [];
      const matchesPlatform =
        this.marketPlatform === "all" ||
        platforms.includes(this.marketPlatform as "desktop" | "mobile");
      const matchesType =
        this.marketType === "all" ||
        (module.categories ?? []).includes(this.marketType);
      return matchesSearch && matchesStatus && matchesPlatform && matchesType;
    });
    const layout = container.createDiv("mypage-market-layout");
    const grid = layout.createDiv("mypage-module-market-grid");
    for (const module of filtered) {
      const status = statuses.get(module.id);
      const card = grid.createEl("button", {
        cls: `mypage-module-market-card ${
          this.selectedModuleId === module.id ? "is-selected" : ""
        }`,
        attr: { type: "button" },
      });
      const icon = card.createDiv("mypage-market-module-icon");
      setIcon(icon, module.id === "hexo-insights" ? "milestone" : "blocks");
      const copy = card.createDiv();
      copy.createEl("strong", { text: module.name });
      copy.createEl("p", { text: module.description });
      copy.createEl("small", {
        text: `${module.author} · ${
          status?.updateAvailable
            ? `可更新至 ${status.latestVersion?.version}`
            : status?.installedVersion
              ? `已安装 ${status.installedVersion}`
              : `最新 ${status?.latestVersion?.version ?? "未知"}`
        }`,
      });
      card.addEventListener("click", () => {
        this.selectedModuleId = module.id;
        this.display();
      });
    }
    const details = layout.createDiv("mypage-market-detail");
    const selected = index.modules.find(
      (module) => module.id === this.selectedModuleId,
    );
    if (!selected) {
      details.createEl("p", {
        text: filtered.length
          ? "选择一个模块查看详情、权限和安装选项。"
          : "没有符合筛选条件的模块。",
        cls: "mypage-muted",
      });
      return;
    }
    this.renderModuleDetails(details, selected, statuses.get(selected.id));
  }

  private renderModuleDetails(
    container: HTMLElement,
    module: MarketModule,
    status: ModuleUpdateStatus | undefined,
  ): void {
    container.createEl("h3", { text: module.name });
    container.createEl("p", { text: module.description });
    const meta = container.createDiv("mypage-market-detail-meta");
    meta.createEl("span", { text: `作者：${module.author}` });
    meta.createEl("span", { text: `许可证：${module.license}` });
    meta.createEl("span", { text: `仓库：${module.repository}` });
    meta.createEl("span", {
      text: `类型：${(module.categories ?? ["其他"]).join(" / ")}`,
    });
    const latest = status?.latestVersion;
    if (latest) {
      meta.createEl("span", {
        text: `平台：${latest.platforms.join(" / ")}`,
      });
      if (latest.permissions.length > 0) {
        container.createEl("h4", { text: "声明能力" });
        const permissions = container.createEl("ul");
        for (const permission of latest.permissions) {
          permissions.createEl("li", { text: permission.capability });
        }
      }
    }
    const actions = container.createDiv("mypage-market-detail-actions");
    if (!status?.installedVersion) {
      button(actions, "安装", () => void this.installMarketModule(module.id), false, true);
      return;
    }
    if (status.updateAvailable) {
      button(actions, "更新", () => void this.installMarketModule(module.id), false, true);
    }
    button(
      actions,
      "删除",
      () => {
        const installed = this.myPagePlugin.settingsStore.snapshot.modules[module.id];
        if (installed) void this.uninstallModule(installed);
      },
      true,
    );
  }

  private renderThemeDetails(container: HTMLElement, theme: ThemeProfile): void {
    container.createEl("h3", { text: theme.name });
    container.createEl("p", { text: theme.description ?? "MyPage 主题" });
    const meta = container.createDiv("mypage-market-detail-meta");
    meta.createEl("span", { text: `作者：${theme.author ?? "未知"}` });
    meta.createEl("span", { text: `版本：${theme.version ?? "1.0.0"}` });
    meta.createEl("span", { text: `模式：${theme.mode}` });
    meta.createEl("span", {
      text: `字体：${theme.fontFamily ?? "跟随 Obsidian"}`,
    });
    const palette = container.createDiv("mypage-theme-palette");
    for (const color of theme.tokens.palette ?? []) {
      const swatch = palette.createSpan({
        attr: { title: color, "aria-label": color },
      });
      swatch.style.background = color;
    }
    const installed =
      this.myPagePlugin.settingsStore.snapshot.themeProfiles[theme.id];
    const actions = container.createDiv("mypage-market-detail-actions");
    if (!installed) {
      button(actions, "安装主题", async () => {
        await this.myPagePlugin.themeMarketplace.install(
          theme,
          this.themeSourceId,
        );
        new Notice(`主题“${theme.name}”已安装。`);
        this.display();
      }, false, true);
    } else {
      button(actions, "应用主题", async () => {
        await this.update((draft) => {
          for (const dashboard of Object.values(draft.dashboards)) {
            dashboard.themeProfileId = theme.id;
            if (typeof theme.tokens.gap === "number") {
              dashboard.gridOptions.gap = theme.tokens.gap;
            }
          }
        });
        new Notice(`已应用主题“${theme.name}”。`);
        this.activeTab = "appearance";
        this.display();
      }, false, true);
      button(actions, "卸载", async () => {
        try {
          await this.myPagePlugin.themeMarketplace.uninstall(theme.id);
          new Notice(`主题“${theme.name}”已卸载。`);
          this.selectedThemeId = "";
          this.display();
        } catch (error) {
          new Notice(error instanceof Error ? error.message : String(error));
        }
      }, true);
    }
  }

  private async refreshModuleMarket(): Promise<void> {
    if (this.marketLoading) return;
    this.marketLoading = true;
    this.marketMessage = "正在异步检测市场索引…";
    this.display();
    try {
      const source = this.myPagePlugin.marketplace
        .listSources()
        .find((item) => item.id === this.marketSourceId);
      await this.myPagePlugin.marketplace.check(
        this.marketSourceId,
        source?.type === "official" ? "official-page-open" : "manual",
      );
      this.marketMessage =
        source?.type === "official"
          ? "官方市场索引已更新；网络不可用时会使用内置可信索引。"
          : "第三方市场已完成手动检测。";
    } catch (error) {
      this.marketMessage =
        error instanceof Error ? error.message : String(error);
    } finally {
      this.marketLoading = false;
      this.display();
    }
  }

  private async refreshThemeMarket(): Promise<void> {
    if (this.themeLoading || this.themeSourceId === "official") return;
    this.themeLoading = true;
    this.display();
    try {
      await this.myPagePlugin.themeMarketplace.check(this.themeSourceId);
      new Notice("第三方主题市场已完成手动检测。");
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error), 10_000);
    } finally {
      this.themeLoading = false;
      this.display();
    }
  }

  private async installMarketModule(moduleId: string): Promise<void> {
    try {
      this.marketLoading = true;
      this.display();
      await this.myPagePlugin.marketplace.install(this.marketSourceId, moduleId);
      await this.myPagePlugin.moduleManager.scan();
      new Notice(`模块 ${moduleId} 已安装。`);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error), 10_000);
    } finally {
      this.marketLoading = false;
      this.display();
    }
  }

  private async uninstallModule(module: ModuleInstallation): Promise<void> {
    if (!(await confirmDialog(this.app, {
      title: "卸载 DIY 模块",
      message: `确认卸载“${module.name}”？主页中的组件实例会保留为缺失状态。`,
      confirmText: "卸载模块",
      destructive: true,
    }))) return;
    await this.myPagePlugin.moduleInstaller.uninstall(module.id);
    this.myPagePlugin.moduleManager.unregister(module.id);
    new Notice(`模块“${module.name}”已卸载。`);
    this.display();
  }

  private pickBackgroundImage(themeId: string): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        new Notice("背景图片不能超过 5 MiB。");
        return;
      }
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        if (typeof reader.result !== "string") return;
        void this.update((draft) => {
          const profile = draft.themeProfiles[themeId];
          if (profile) profile.backgroundImage = reader.result as string;
        }).then(() => this.display());
      });
      reader.readAsDataURL(file);
    });
    input.click();
  }

  private async restoreBackup(): Promise<void> {
    const backups = await this.myPagePlugin.settingsStore.listBackups();
    if (backups.length === 0) {
      new Notice("当前没有可恢复的备份。");
      return;
    }
    const candidates = backups.slice(0, 10);
    const answer = await promptDialog(this.app, {
      title: "从备份恢复",
      message: candidates
        .map(
          (backup, index) =>
            `${index + 1}. ${new Date(backup.createdAt).toLocaleString()}`,
        )
        .join("\n"),
      value: "1",
      confirmText: "恢复备份",
      validate: (value) => {
        const selected = candidates[Number.parseInt(value, 10) - 1];
        return selected ? undefined : "请输入列表中的有效备份编号。";
      },
    });
    if (!answer) return;
    const selected = candidates[Number.parseInt(answer, 10) - 1];
    if (!selected) return;
    if (!(await confirmDialog(this.app, {
      title: "确认恢复配置",
      message: `将恢复 ${new Date(selected.createdAt).toLocaleString()} 的配置；当前配置会先自动备份。`,
      confirmText: "恢复",
    }))) return;
    await this.myPagePlugin.settingsStore.replaceFromBackup(selected.path);
    new Notice("配置已从备份恢复。");
    this.display();
  }

  private async persistUpdate(
    mutate: Parameters<MyPagePlugin["settingsStore"]["update"]>[0],
  ): Promise<void> {
    try {
      await this.myPagePlugin.settingsStore.update(mutate);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error), 10_000);
    }
  }
}

const GRID_TOGGLES = [
  ["snap", "自动吸附", "拖动后对齐网格"],
  ["push", "自动让位", "组件碰撞时让出空间"],
  ["compact", "自动补位", "释放空隙后自动紧凑排列"],
  ["placeholder", "占位预览", "拖动时显示目标位置"],
  ["collisionAnimation", "碰撞动效", "让位时使用平滑动效"],
  ["liveReflow", "实时重排", "拖动中持续重新排版"],
  ["crossGroupDrag", "跨分组拖动", "允许组件在分组间移动"],
  ["layoutAnimation", "布局动效", "保存与断点切换时使用动效"],
  ["editGridLines", "编辑网格线", "编辑模式显示网格参考线"],
  ["undoRedo", "撤销与重做", "记录当前编辑会话的布局操作"],
] as const;

function heading(container: HTMLElement, title: string): void {
  new Setting(container).setName(title).setHeading();
}

function sectionIntro(
  container: HTMLElement,
  title: string,
  description: string,
): void {
  const header = container.createDiv("mypage-settings-section-intro");
  header.createEl("h2", { text: title });
  header.createEl("p", { text: description });
}

function sourceName(source: string): string {
  if (source === "official") return "官方市场";
  if (source === "third-party") return "第三方市场";
  if (source === "zip") return "手动 ZIP";
  return "本地开发";
}

function normalizeColor(value: string): string {
  return /^#[0-9a-f]{6}$/iu.test(value) ? value : "#7c3aed";
}

function button(
  container: HTMLElement,
  label: string,
  onClick: () => void | Promise<void>,
  warning = false,
  cta = false,
): HTMLButtonElement {
  const element = container.createEl("button", {
    text: label,
    cls: warning ? "mod-warning" : cta ? "mod-cta" : "",
  });
  element.addEventListener("click", () => void onClick());
  return element;
}

function fact(container: HTMLElement, label: string, value: string): void {
  const item = container.createDiv();
  item.createEl("small", { text: label });
  item.createEl("strong", { text: value });
}
