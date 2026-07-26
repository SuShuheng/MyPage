import type { App } from "obsidian";
import { Modal, normalizePath, Notice, Setting } from "obsidian";
import type {
  DisplayMode,
  WidgetInstance,
} from "../persistence/settings-types";
import { BasesBindingModal } from "../bases/BasesBindingModal";
import type { ModuleManager } from "../modules/ModuleManager";

type ConfigTab = "content" | "general" | "advanced";

interface JsonSchema {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
}

export class WidgetConfigurationModal extends Modal {
  private draft: WidgetInstance;
  private activeTab: ConfigTab = "content";
  private bodyEl?: HTMLElement;
  private moduleSchema?: JsonSchema;
  private moduleSchemaLoading = false;
  private moduleSchemaError = "";

  public constructor(
    app: App,
    widget: WidgetInstance,
    private readonly moduleManager: ModuleManager,
    private readonly onSave: (widget: WidgetInstance) => void,
  ) {
    super(app);
    this.draft = structuredClone(widget);
  }

  public override onOpen(): void {
    this.modalEl.addClass("mypage-widget-config-modal");
    this.setTitle(`配置 · ${this.draft.title ?? this.draft.contributionId}`);
    this.renderShell();
    if (this.draft.moduleId !== "mypage-core") {
      void this.loadModuleSchema();
    }
  }

  public override onClose(): void {
    this.contentEl.empty();
  }

  private renderShell(): void {
    this.contentEl.empty();
    const tabs = this.contentEl.createDiv({
      cls: "mypage-config-tabs",
      attr: { role: "tablist", "aria-label": "组件配置分类" },
    });
    const definitions: Array<[ConfigTab, string]> = [
      ["content", "内容设置"],
      ["general", "通用设置"],
      ["advanced", "高级设置"],
    ];
    for (const [id, label] of definitions) {
      const button = tabs.createEl("button", {
        text: label,
        cls: this.activeTab === id ? "is-active" : "",
        attr: {
          type: "button",
          role: "tab",
          "aria-selected": String(this.activeTab === id),
        },
      });
      button.addEventListener("click", () => {
        this.activeTab = id;
        this.renderShell();
      });
    }

    this.bodyEl = this.contentEl.createDiv({
      cls: "mypage-config-body",
      attr: { role: "tabpanel" },
    });
    this.renderActiveTab();

    const footer = this.contentEl.createDiv({ cls: "mypage-config-footer" });
    new Setting(footer)
      .addButton((button) =>
        button.setButtonText("取消").onClick(() => this.close()),
      )
      .addButton((button) =>
        button.setButtonText("应用到编辑会话").setCta().onClick(() => {
          if (!this.draft.dataBinding.sourceId) {
            new Notice("数据源 ID 不能为空。");
            return;
          }
          this.onSave(structuredClone(this.draft));
          this.close();
        }),
      );
  }

  private renderActiveTab(): void {
    const body = this.bodyEl;
    if (!body) return;
    body.empty();
    if (this.activeTab === "content") this.renderContentSettings(body);
    else if (this.activeTab === "general") this.renderGeneralSettings(body);
    else this.renderAdvancedSettings(body);
  }

  private renderContentSettings(container: HTMLElement): void {
    container.createEl("p", {
      cls: "mypage-config-intro",
      text: "优先配置组件展示内容与可交互行为；这些设置只作用于当前组件。",
    });
    this.addTextSetting(container, "显示标题", "组件卡片 Header 中展示的标题。", {
      get: () => this.draft.title ?? "",
      set: (value) => {
        this.draft.title = value;
      },
    });

    if (this.draft.moduleId !== "mypage-core") {
      this.renderModuleContentSettings(container);
      return;
    }

    switch (this.draft.contributionId) {
      case "metric":
        this.addSelectSetting(container, "统计方式", "选择指标卡片的汇总方式。", {
          options: {
            count: "记录数量",
            sum: "求和",
            avg: "平均值",
            min: "最小值",
            max: "最大值",
          },
          get: () => String(this.draft.config.metric ?? "count"),
          set: (value) => {
            this.draft.config.metric = value;
          },
        });
        break;
      case "heatmap":
        this.addDateSetting(container, "开始日期", "热力图展示范围的第一天。", {
          key: "startDate",
        });
        this.addDateSetting(container, "结束日期", "热力图展示范围的最后一天。", {
          key: "endDate",
        });
        break;
      case "trend":
        this.addSelectSetting(container, "趋势样式", "选择折线或面积图。", {
          options: { line: "折线", area: "面积" },
          get: () => String(this.draft.config.mode ?? "area"),
          set: (value) => {
            this.draft.config.mode = value;
          },
        });
        this.addSelectSetting(container, "时间分桶", "控制趋势数据的聚合粒度。", {
          options: { day: "按日", week: "按周", month: "按月" },
          get: () => String(this.draft.config.bucket ?? "day"),
          set: (value) => {
            this.draft.config.bucket = value;
          },
        });
        break;
      case "distribution":
        this.addSelectSetting(container, "图表类型", "选择数据分布的呈现形式。", {
          options: { bar: "柱状图", pie: "饼图", doughnut: "环形图" },
          get: () => String(this.draft.config.mode ?? "bar"),
          set: (value) => {
            this.draft.config.mode = value;
          },
        });
        break;
      case "notes":
        this.addNumberSetting(container, "最大条目数", "笔记集合内部最多展示的记录数量。", {
          key: "limit",
          fallback: 12,
          minimum: 1,
          maximum: 100,
        });
        break;
      case "tasks":
        this.addTextSetting(container, "新任务写入位置", "不存在时会在用户确认后创建 Markdown 文件。", {
          get: () => String(this.draft.config.taskPath ?? "MyPage/TODO.md"),
          set: (value) => {
            this.draft.config.taskPath = value.trim();
          },
          placeholder: "MyPage/TODO.md",
        });
        new Setting(container)
          .setName("显示已完成任务")
          .setDesc("关闭后仅显示未完成任务。")
          .addToggle((toggle) =>
            toggle
              .setValue(Boolean(this.draft.config.showCompleted))
              .onChange((value) => {
                this.draft.config.showCompleted = value;
              }),
          );
        break;
      case "goals":
        this.addNumberSetting(container, "目标数量", "进度圆环达到 100% 所需的记录数量。", {
          key: "target",
          fallback: 30,
          minimum: 1,
          maximum: 1_000_000,
        });
        this.addDateSetting(container, "目标完成日期", "组件将展示距离该日期的剩余天数。", {
          key: "targetDate",
        });
        break;
      case "markdown-actions":
        this.addTextAreaSetting(container, "Markdown 内容", "显示在快捷操作按钮上方。", {
          key: "markdown",
          fallback: "## 欢迎使用 MyPage",
          rows: 6,
        });
        this.addTextSetting(
          container,
          "创建笔记路径模板",
          "支持 {date}/{Date}、{time}、{timestamp}；例如 MyPage/{Date}.md。",
          {
            get: () =>
              String(
                this.draft.config.pathTemplate ??
                  this.draft.config.path ??
                  "MyPage/{date}.md",
              ),
            set: (value) => {
              this.draft.config.pathTemplate = value.trim();
              delete this.draft.config.path;
            },
            placeholder: "MyPage/{date}.md",
          },
        );
        this.addTextAreaSetting(container, "新笔记初始内容", "创建成功后写入的 Markdown 内容。", {
          key: "noteContent",
          fallback: "# 新笔记\n\n",
          rows: 5,
        });
        break;
      default:
        container.createEl("p", {
          cls: "mypage-config-empty",
          text: "此组件没有额外的内容设置。",
        });
    }
  }

  private renderModuleContentSettings(container: HTMLElement): void {
    if (this.moduleSchemaLoading) {
      container.createEl("p", {
        cls: "mypage-config-empty",
        text: "正在读取模块内容设置…",
      });
      return;
    }
    if (this.moduleSchemaError) {
      container.createEl("p", {
        cls: "mypage-config-error",
        text: this.moduleSchemaError,
      });
      return;
    }
    const properties = this.moduleSchema?.properties;
    if (!properties || Object.keys(properties).length === 0) {
      container.createEl("p", {
        cls: "mypage-config-empty",
        text: "模块未声明内容设置字段；可在“高级设置”中编辑配置 JSON。",
      });
      return;
    }
    for (const [key, schema] of Object.entries(properties)) {
      this.addSchemaSetting(container, key, schema);
    }
  }

  private renderGeneralSettings(container: HTMLElement): void {
    this.addSelectSetting(container, "信息简繁", "组件可据此选择精简、标准或详细呈现。", {
      options: {
        compact: "精简",
        standard: "标准",
        detailed: "详细",
      },
      get: () => this.draft.displayMode,
      set: (value) => {
        this.draft.displayMode = value as DisplayMode;
      },
    });
    new Setting(container)
      .setName("卡片外观")
      .setDesc("控制标题、背景和边框。")
      .addToggle((toggle) =>
        toggle
          .setTooltip("显示标题")
          .setValue(this.draft.appearance.showTitle)
          .onChange((value) => {
            this.draft.appearance.showTitle = value;
          }),
      )
      .addToggle((toggle) =>
        toggle
          .setTooltip("显示背景")
          .setValue(this.draft.appearance.showBackground)
          .onChange((value) => {
            this.draft.appearance.showBackground = value;
          }),
      )
      .addToggle((toggle) =>
        toggle
          .setTooltip("显示边框")
          .setValue(this.draft.appearance.showBorder)
          .onChange((value) => {
            this.draft.appearance.showBorder = value;
          }),
      );
  }

  private renderAdvancedSettings(container: HTMLElement): void {
    container.createEl("p", {
      cls: "mypage-config-intro",
      text: "高级设置面向熟悉数据源、查询范围与 JSON 的用户。",
    });
    this.addTextSetting(container, "数据源 ID", "内置：core.vault-files、core.tasks；模块可注册自己的数据源。", {
      get: () => this.draft.dataBinding.sourceId,
      set: (value) => {
        this.draft.dataBinding.sourceId = value.trim();
      },
    });
    new Setting(container)
      .setName("Obsidian Bases 适配")
      .setDesc("从 .base 文件选择视图并翻译支持的筛选、公式、排序和数量限制。")
      .addButton((button) =>
        button.setButtonText("从 Bases 导入").onClick(() => {
          new BasesBindingModal(this.app, (binding) => {
            this.draft.dataBinding = binding;
            new Notice("Bases 查询已应用到当前编辑表单。");
          }).open();
        }),
      );
    this.addTextAreaListSetting(container, "包含文件夹", "多个路径用英文逗号分隔，Vault 根目录使用 /。", {
      get: () => this.draft.dataBinding.scope.includeFolders,
      set: (value) => {
        this.draft.dataBinding.scope.includeFolders = value;
      },
    });
    this.addTextAreaListSetting(container, "排除文件夹", "多个路径用英文逗号分隔。", {
      get: () => this.draft.dataBinding.scope.excludeFolders,
      set: (value) => {
        this.draft.dataBinding.scope.excludeFolders = value;
      },
    });
    this.addTextSetting(container, "扩展名", "例如 md, canvas。", {
      get: () => this.draft.dataBinding.scope.extensions.join(", "),
      set: (value) => {
        this.draft.dataBinding.scope.extensions = parseList(value).map((item) =>
          item.replace(/^\./u, ""),
        );
      },
    });
    this.addJsonSetting(container, "配置 JSON", "内容设置的原始 JSON；适合高级开发与诊断。", {
      get: () => this.draft.config,
      set: (value) => {
        if (isRecord(value)) this.draft.config = value;
      },
      rows: 12,
      objectOnly: true,
    });
    this.addTextSetting(container, "组件自定义 class", "仅作用于当前组件外框。", {
      get: () => this.draft.appearance.customClass ?? "",
      set: (value) => {
        const clean = value.replace(/[^\w -]/gu, "").trim();
        if (clean) this.draft.appearance.customClass = clean;
        else delete this.draft.appearance.customClass;
      },
    });
    this.addTextSetting(container, "组件强调色覆盖", "留空使用 Dashboard 主题。", {
      get: () => String(this.draft.appearance.themeOverrides?.accent ?? ""),
      set: (value) => {
        this.draft.appearance.themeOverrides ??= {};
        if (value.trim()) this.draft.appearance.themeOverrides.accent = value.trim();
        else delete this.draft.appearance.themeOverrides.accent;
      },
    });
  }

  private async loadModuleSchema(): Promise<void> {
    this.moduleSchemaLoading = true;
    this.renderActiveTab();
    try {
      const installed = this.moduleManager.registry.get(this.draft.moduleId);
      if (!installed) throw new Error(`找不到模块 ${this.draft.moduleId}。`);
      const contribution = installed.manifest.contributions.find(
        (item) =>
          item.id === this.draft.contributionId && item.kind === "widget",
      );
      const relative = contribution?.configSchema ?? installed.manifest.configSchema;
      if (
        !relative ||
        relative.startsWith("/") ||
        relative.includes("..") ||
        /^[A-Za-z]:/u.test(relative)
      ) {
        throw new Error("模块配置 Schema 路径无效。");
      }
      const directory = normalizePath(installed.directory);
      const path = normalizePath(`${directory}/${relative}`);
      if (!path.startsWith(`${directory}/`)) {
        throw new Error("模块配置 Schema 超出模块目录。");
      }
      this.moduleSchema = JSON.parse(
        await this.app.vault.adapter.read(path),
      ) as JsonSchema;
      applySchemaDefaults(this.draft.config, this.moduleSchema);
    } catch (error) {
      this.moduleSchemaError =
        error instanceof Error ? error.message : String(error);
    } finally {
      this.moduleSchemaLoading = false;
      if (this.activeTab === "content") this.renderActiveTab();
    }
  }

  private addSchemaSetting(
    container: HTMLElement,
    key: string,
    schema: JsonSchema,
  ): void {
    const name = schema.title ?? key;
    const description = schema.description ?? `模块配置字段：${key}`;
    const current = this.draft.config[key];
    if (schema.enum && schema.enum.every((value) => typeof value === "string")) {
      this.addSelectSetting(container, name, description, {
        options: Object.fromEntries(
          schema.enum.map((value) => [String(value), String(value)]),
        ),
        get: () => String(current ?? schema.default ?? schema.enum?.[0] ?? ""),
        set: (value) => {
          this.draft.config[key] = value;
        },
      });
      return;
    }
    if (schema.type === "boolean") {
      new Setting(container)
        .setName(name)
        .setDesc(description)
        .addToggle((toggle) =>
          toggle
            .setValue(Boolean(current ?? schema.default))
            .onChange((value) => {
              this.draft.config[key] = value;
            }),
        );
      return;
    }
    if (schema.type === "number" || schema.type === "integer") {
      this.addNumberSetting(container, name, description, {
        key,
        fallback: Number(schema.default ?? 0),
      });
      return;
    }
    if (schema.type === "array" || schema.type === "object") {
      this.addJsonSetting(container, name, description, {
        get: () =>
          current ??
          schema.default ??
          (schema.type === "array" ? [] : {}),
        set: (value) => {
          this.draft.config[key] = value;
        },
        rows: 6,
      });
      return;
    }
    this.addTextSetting(container, name, description, {
      get: () => String(current ?? schema.default ?? ""),
      set: (value) => {
        this.draft.config[key] = value;
      },
    });
  }

  private addTextSetting(
    container: HTMLElement,
    name: string,
    description: string,
    options: {
      get: () => string;
      set: (value: string) => void;
      placeholder?: string;
    },
  ): void {
    new Setting(container)
      .setName(name)
      .setDesc(description)
      .addText((text) => {
        text.setValue(options.get()).onChange(options.set);
        if (options.placeholder) text.setPlaceholder(options.placeholder);
      });
  }

  private addTextAreaSetting(
    container: HTMLElement,
    name: string,
    description: string,
    options: {
      key: string;
      fallback: string;
      rows: number;
    },
  ): void {
    new Setting(container)
      .setName(name)
      .setDesc(description)
      .addTextArea((text) => {
        text.inputEl.rows = options.rows;
        text
          .setValue(String(this.draft.config[options.key] ?? options.fallback))
          .onChange((value) => {
            this.draft.config[options.key] = value;
          });
      });
  }

  private addDateSetting(
    container: HTMLElement,
    name: string,
    description: string,
    options: { key: string },
  ): void {
    new Setting(container)
      .setName(name)
      .setDesc(description)
      .addText((text) => {
        text.inputEl.type = "date";
        text
          .setValue(String(this.draft.config[options.key] ?? ""))
          .onChange((value) => {
            this.draft.config[options.key] = value;
          });
      });
  }

  private addNumberSetting(
    container: HTMLElement,
    name: string,
    description: string,
    options: {
      key: string;
      fallback: number;
      minimum?: number;
      maximum?: number;
    },
  ): void {
    new Setting(container)
      .setName(name)
      .setDesc(description)
      .addText((text) => {
        text.inputEl.type = "number";
        if (options.minimum !== undefined) text.inputEl.min = String(options.minimum);
        if (options.maximum !== undefined) text.inputEl.max = String(options.maximum);
        text
          .setValue(String(this.draft.config[options.key] ?? options.fallback))
          .onChange((value) => {
            const number = Number(value);
            if (Number.isFinite(number)) {
              this.draft.config[options.key] = number;
            }
          });
      });
  }

  private addSelectSetting(
    container: HTMLElement,
    name: string,
    description: string,
    options: {
      options: Record<string, string>;
      get: () => string;
      set: (value: string) => void;
    },
  ): void {
    new Setting(container)
      .setName(name)
      .setDesc(description)
      .addDropdown((dropdown) => {
        for (const [value, label] of Object.entries(options.options)) {
          dropdown.addOption(value, label);
        }
        dropdown.setValue(options.get()).onChange(options.set);
      });
  }

  private addTextAreaListSetting(
    container: HTMLElement,
    name: string,
    description: string,
    options: {
      get: () => string[];
      set: (value: string[]) => void;
    },
  ): void {
    new Setting(container)
      .setName(name)
      .setDesc(description)
      .addTextArea((text) =>
        text
          .setValue(options.get().join(", "))
          .onChange((value) => options.set(parseList(value))),
      );
  }

  private addJsonSetting(
    container: HTMLElement,
    name: string,
    description: string,
    options: {
      get: () => unknown;
      set: (value: unknown) => void;
      rows: number;
      objectOnly?: boolean;
    },
  ): void {
    new Setting(container)
      .setName(name)
      .setDesc(description)
      .addTextArea((text) => {
        text.inputEl.rows = options.rows;
        text.inputEl.addClass("mypage-json-editor");
        text.setValue(JSON.stringify(options.get(), null, 2));
        text.onChange((value) => {
          try {
            const parsed = JSON.parse(value) as unknown;
            if (typeof parsed !== "object" || parsed === null) {
              throw new Error("需要 JSON 对象或数组。");
            }
            if (options.objectOnly && Array.isArray(parsed)) {
              throw new Error("需要 JSON 对象。");
            }
            options.set(parsed);
            text.inputEl.removeClass("has-error");
          } catch {
            text.inputEl.addClass("has-error");
          }
        });
      });
  }
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function applySchemaDefaults(
  config: Record<string, unknown>,
  schema: JsonSchema,
): void {
  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    if (config[key] === undefined && property.default !== undefined) {
      config[key] = structuredClone(property.default);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
