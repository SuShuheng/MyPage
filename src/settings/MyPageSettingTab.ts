import type {
  App} from "obsidian";
import {
  Notice,
  PluginSettingTab,
  Setting,
  type ButtonComponent,
} from "obsidian";
import type MyPagePlugin from "../app/MyPagePlugin";
import { ModulePermissionModal } from "../permissions/ModulePermissionModal";
import { ModuleSettingsModal } from "../modules/ModuleSettingsModal";

export class MyPageSettingTab extends PluginSettingTab {
  public constructor(
    app: App,
    private readonly myPagePlugin: MyPagePlugin,
  ) {
    super(app, myPagePlugin);
  }

  public override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("mypage-settings");
    const settings = this.myPagePlugin.settingsStore.snapshot;

    new Setting(containerEl).setName("MyPage").setHeading();
    if (this.myPagePlugin.settingsStore.recoveryMode) {
      const recovery = containerEl.createDiv("mypage-recovery-banner");
      recovery.createEl("strong", { text: "配置恢复模式" });
      recovery.createEl("p", {
        text: "原 data.json 未被覆盖，损坏副本已保存到 backups/。请选择有效备份恢复，或修改任一设置以明确采用新的安全默认配置。",
      });
      recovery.createEl("small", {
        text: this.myPagePlugin.settingsStore.recoveryMode,
      });
    }
    containerEl.createEl("p", {
      text: "可视化主页、数据组件与 DIY 模块平台。正式配置统一保存在插件 data.json；模块代码单独位于 diy-plugins/。",
      cls: "setting-item-description",
    });
    new Setting(containerEl)
      .setName("打开 MyPage")
      .setDesc("在当前工作区打开可视化主页。")
      .addButton((button: ButtonComponent) =>
        button.setButtonText("打开").setCta().onClick(() => {
          void this.myPagePlugin.openMyPage();
        }),
      );

    heading(containerEl, "启动与主页");
    new Setting(containerEl)
      .setName("Obsidian 启动后打开")
      .setDesc("首次启动会先询问；关闭后仍可通过功能区或命令打开。")
      .addToggle((toggle) =>
        toggle.setValue(settings.general.openOnStartup).onChange(async (value) => {
          await this.update((draft) => {
            draft.general.openOnStartup = value;
          });
        }),
      );
    new Setting(containerEl)
      .setName("启动主页")
      .setDesc("展示上次使用的主页，或始终展示指定主页。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("specific", "指定主页")
          .addOption("last", "上次打开")
          .setValue(settings.general.startupTabMode)
          .onChange(async (value) => {
            await this.update((draft) => {
              draft.general.startupTabMode =
                value === "last" ? "last" : "specific";
            });
            this.display();
          }),
      );
    if (settings.general.startupTabMode === "specific") {
      new Setting(containerEl)
        .setName("指定主页")
        .setDesc("也可在主页标签菜单中设为默认。")
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
    new Setting(containerEl)
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
    new Setting(containerEl)
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

    heading(containerEl, "标签与导航");
    new Setting(containerEl)
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
    new Setting(containerEl)
      .setName("紧凑标签")
      .setDesc("缩小标签间距，适合主页较多的用户。")
      .addToggle((toggle) =>
        toggle.setValue(settings.uiState.compactTabs).onChange(async (value) => {
          await this.update((draft) => {
            draft.uiState.compactTabs = value;
          });
        }),
      );

    heading(containerEl, "编辑与网格");
    for (const [key, name, description] of GRID_TOGGLES) {
      const dashboard =
        settings.dashboards[
          settings.tabs.byId[settings.tabs.defaultTabId]?.dashboardId ?? ""
        ];
      new Setting(containerEl)
        .setName(name)
        .setDesc(`${description}（应用到全部主页）`)
        .addToggle((toggle) =>
          toggle
            .setValue(dashboard?.gridOptions[key] ?? true)
            .onChange(async (value) => {
              await this.update((draft) => {
                for (const item of Object.values(draft.dashboards)) {
                  item.gridOptions[key] = value;
                }
              });
            }),
        );
    }
    new Setting(containerEl)
      .setName("网格间距")
      .setDesc("组件之间的像素间距，范围 4–32。")
      .addSlider((slider) =>
        slider
          .setLimits(4, 32, 1)
          .setDynamicTooltip()
          .setValue(
            settings.dashboards[
              settings.tabs.byId[settings.tabs.defaultTabId]?.dashboardId ?? ""
            ]?.gridOptions.gap ?? 14,
          )
          .onChange(async (value) => {
            await this.update((draft) => {
              for (const dashboard of Object.values(draft.dashboards)) {
                dashboard.gridOptions.gap = value;
              }
            });
          }),
      );

    heading(containerEl, "外观与动效");
    const defaultDashboard =
      settings.dashboards[
        settings.tabs.byId[settings.tabs.defaultTabId]?.dashboardId ?? ""
      ];
    const themeId = defaultDashboard?.themeProfileId ?? "theme-default";
    const theme = settings.themeProfiles[themeId];
    new Setting(containerEl)
      .setName("主页主题模式")
      .setDesc("第一级始终继承 Obsidian 变量；第二级可为当前主题档案选择模式和令牌。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("obsidian", "跟随 Obsidian")
          .addOption("light", "浅色档案")
          .addOption("dark", "深色档案")
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
    new Setting(containerEl)
      .setName("主题强调色")
      .setDesc("可填写十六进制颜色或 Obsidian CSS 变量；留空恢复继承。")
      .addText((text) =>
        text
          .setPlaceholder("var(--interactive-accent)")
          .setValue(String(theme?.tokens.accent ?? ""))
          .onChange(async (value) => {
            await this.update((draft) => {
              const profile = draft.themeProfiles[themeId];
              if (!profile) return;
              if (value.trim()) profile.tokens.accent = value.trim();
              else delete profile.tokens.accent;
            });
          }),
      );
    new Setting(containerEl)
      .setName("组件圆角")
      .setDesc("Dashboard 级令牌；单个组件仍可在自身外观中覆盖。")
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
    new Setting(containerEl)
      .setName("动效级别")
      .setDesc("会额外服从操作系统的减少动态效果偏好。")
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
    new Setting(containerEl)
      .setName("跟随系统减少动态效果")
      .setDesc("检测 prefers-reduced-motion 并关闭拖动和图表动画。")
      .addToggle((toggle) =>
        toggle
          .setValue(settings.uiState.respectsReducedMotion)
          .onChange(async (value) => {
            await this.update((draft) => {
              draft.uiState.respectsReducedMotion = value;
            });
          }),
      );

    heading(containerEl, "数据与性能");
    new Setting(containerEl)
      .setName("后台 Worker 数量")
      .setDesc("自动模式根据设备能力分配；所有检测、哈希、Schema 与查询都不会堵塞主线程。")
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
    new Setting(containerEl)
      .setName("调试诊断")
      .setDesc("在控制台输出查询、模块和性能诊断，不包含笔记正文。")
      .addToggle((toggle) =>
        toggle.setValue(settings.uiState.debug).onChange(async (value) => {
          await this.update((draft) => {
            draft.uiState.debug = value;
          });
        }),
      );

    heading(containerEl, "MyPage 更新");
    new Setting(containerEl)
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
    new Setting(containerEl)
      .setName("启动时检查更新")
      .setDesc("每个 Obsidian 会话最多检查一次。")
      .addToggle((toggle) =>
        toggle.setValue(settings.updates.checkOnStartup).onChange(async (value) => {
          await this.update((draft) => {
            draft.updates.checkOnStartup = value;
          });
        }),
      )
      .addButton((button) =>
        button.setButtonText("立即检查").onClick(async () => {
          await this.myPagePlugin.checkForUpdates(true);
        }),
      );

    heading(containerEl, "DIY 模块与市场");
    new Setting(containerEl)
      .setName("模块市场")
      .setDesc("官方市场进入页面时自动检测；第三方市场只在手动操作时检测。")
      .addButton((button) =>
        button.setButtonText("打开市场").setCta().onClick(() => {
          this.myPagePlugin.openMarketplace();
        }),
      )
      .addButton((button) =>
        button.setButtonText("导入 ZIP").onClick(() => {
          this.myPagePlugin.pickModuleArchive();
        }),
      )
      .addButton((button) =>
        button.setButtonText("重新扫描本地模块").onClick(async () => {
          await this.myPagePlugin.moduleManager.scan();
          new Notice("已重新扫描 diy-plugins/。");
          this.display();
        }),
      );
    for (const module of Object.values(settings.modules)) {
      new Setting(containerEl)
        .setName(`${module.name} · ${module.version}`)
        .setDesc(
          `${sourceName(module.sourceType)} · ${
            module.trustLevel === "trusted" ? "受信任（仍需逐项授权）" : "沙箱"
          }`,
        )
        .addToggle((toggle) =>
          toggle.setValue(module.enabled).onChange(async (value) => {
            await this.myPagePlugin.moduleManager.setEnabled(module.id, value);
          }),
        )
        .addButton((button) =>
          button.setButtonText("权限与信任").onClick(() => {
            new ModulePermissionModal(
              this.app,
              module.id,
              this.myPagePlugin.moduleManager,
              this.myPagePlugin.permissions,
            ).open();
          }),
        )
        .addButton((button) =>
          button.setButtonText("模块配置").onClick(() => {
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
          }),
        )
        .addButton((button) =>
          button.setButtonText("卸载").setWarning().onClick(async () => {
            if (!window.confirm(`确认卸载“${module.name}”？主页中的组件实例会保留为缺失状态。`)) {
              return;
            }
            await this.myPagePlugin.moduleInstaller.uninstall(module.id);
            this.myPagePlugin.moduleManager.unregister(module.id);
            this.display();
          }),
        );
    }

    heading(containerEl, "备份、恢复与安全");
    new Setting(containerEl)
      .setName("备份保留数量")
      .setDesc("每次正式配置写入前自动备份 data.json。")
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
    new Setting(containerEl)
      .setName("从备份恢复")
      .setDesc("选择时间最新的一份有效备份并恢复，恢复前仍会创建当前配置备份。")
      .addButton((button) =>
        button.setButtonText("选择备份").onClick(async () => {
          await this.restoreBackup();
        }),
      );
    new Setting(containerEl)
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

  private async persistUpdate(
    mutate: Parameters<MyPagePlugin["settingsStore"]["update"]>[0],
  ): Promise<void> {
    try {
      await this.myPagePlugin.settingsStore.update(mutate);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error), 10_000);
    }
  }

  private async restoreBackup(): Promise<void> {
    const backups = await this.myPagePlugin.settingsStore.listBackups();
    if (backups.length === 0) {
      new Notice("当前没有可恢复的备份。");
      return;
    }
    const summary = backups
      .slice(0, 10)
      .map((backup, index) => `${index + 1}. ${new Date(backup.createdAt).toLocaleString()}`)
      .join("\n");
    const answer = window.prompt(`输入要恢复的备份编号：\n${summary}`, "1");
    if (!answer) return;
    const selected = backups[Number.parseInt(answer, 10) - 1];
    if (!selected) {
      new Notice("备份编号无效。");
      return;
    }
    await this.myPagePlugin.settingsStore.replaceFromBackup(selected.path);
    new Notice("配置已从备份恢复。");
    this.display();
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

function sourceName(source: string): string {
  if (source === "official") return "官方市场";
  if (source === "third-party") return "第三方市场";
  if (source === "zip") return "手动 ZIP";
  return "本地开发";
}
