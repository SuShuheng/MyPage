import {
  Modal,
  Notice,
  Setting,
  normalizePath,
  type App,
} from "obsidian";
import type { ModuleManager } from "./ModuleManager";
import type { SettingsStore } from "../persistence/SettingsStore";
import type { WorkerCoordinator } from "../workers/WorkerCoordinator";
import type { SecretReferenceService } from "../persistence/SecretReferenceService";
import type { CapabilityBroker } from "../permissions/CapabilityBroker";

type ModuleSettingsTab = "content" | "general" | "advanced";

interface SchemaField {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  format?: string;
}

interface ModuleSchema {
  properties?: Record<string, SchemaField>;
}

export class ModuleSettingsModal extends Modal {
  private tab: ModuleSettingsTab = "content";
  private schema: ModuleSchema = {};
  private draft: Record<string, unknown> = {};
  private body?: HTMLElement;

  public constructor(
    app: App,
    private readonly moduleId: string,
    private readonly modules: ModuleManager,
    private readonly store: SettingsStore,
    private readonly workers: WorkerCoordinator,
    private readonly secrets: SecretReferenceService,
    private readonly broker: CapabilityBroker,
    private readonly onSaved: () => Promise<void>,
  ) {
    super(app);
  }

  public override onOpen(): void {
    const installed = this.modules.registry.get(this.moduleId);
    if (!installed) {
      this.setTitle("模块不可用");
      return;
    }
    this.modalEl.addClass("mypage-module-settings-modal");
    this.setTitle(`${installed.manifest.name} · 模块设置`);
    this.draft = structuredClone(
      this.store.snapshot.moduleSettings[this.moduleId] ?? {},
    );
    const tabs = this.contentEl.createDiv("mypage-config-tabs");
    for (const [id, label] of [
      ["content", "内容设置"],
      ["general", "通用设置"],
      ["advanced", "高级设置"],
    ] as const) {
      const button = tabs.createEl("button", {
        text: label,
        attr: { type: "button", role: "tab" },
      });
      button.addEventListener("click", () => {
        this.tab = id;
        this.renderBody();
      });
    }
    this.body = this.contentEl.createDiv("mypage-module-settings-body");
    const footer = this.contentEl.createDiv("mypage-config-footer");
    footer.createEl("button", { text: "取消" }).addEventListener("click", () => {
      this.close();
    });
    const save = footer.createEl("button", {
      text: "校验并保存",
      cls: "mod-cta",
    });
    save.addEventListener("click", () => void this.save());
    void this.loadSchema();
  }

  public override onClose(): void {
    this.contentEl.empty();
  }

  private async loadSchema(): Promise<void> {
    const installed = this.modules.registry.get(this.moduleId);
    if (!installed) return;
    try {
      this.schema = JSON.parse(
        await this.app.vault.adapter.read(
          normalizePath(
            `${installed.directory}/${installed.manifest.configSchema}`,
          ),
        ),
      ) as ModuleSchema;
      for (const [key, field] of Object.entries(
        this.schema.properties ?? {},
      )) {
        if (this.draft[key] === undefined && field.default !== undefined) {
          this.draft[key] = structuredClone(field.default);
        }
      }
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
    }
    this.renderBody();
  }

  private renderBody(): void {
    if (!this.body) return;
    this.body.empty();
    const tabs = this.contentEl.querySelectorAll<HTMLElement>(
      ".mypage-config-tabs button",
    );
    tabs.forEach((button, index) => {
      button.toggleClass(
        "is-active",
        ["content", "general", "advanced"][index] === this.tab,
      );
    });
    if (this.tab === "content") this.renderContent(this.body);
    else if (this.tab === "general") this.renderGeneral(this.body);
    else this.renderAdvanced(this.body);
  }

  private renderContent(container: HTMLElement): void {
    const properties = this.schema.properties ?? {};
    if (Object.keys(properties).length === 0) {
      container.createEl("p", {
        text: "此模块没有声明面向用户的内容设置。",
        cls: "mypage-muted",
      });
      return;
    }
    for (const [key, field] of Object.entries(properties)) {
      const setting = new Setting(container)
        .setName(field.title ?? key)
        .setDesc(field.description ?? `模块配置字段：${key}`);
      const current = this.draft[key] ?? field.default;
      if (field.enum?.every((value) => typeof value === "string")) {
        setting.addDropdown((dropdown) => {
          for (const value of field.enum ?? []) {
            dropdown.addOption(String(value), String(value));
          }
          dropdown
            .setValue(String(current ?? ""))
            .onChange((value) => {
              this.draft[key] = value;
            });
        });
      } else if (field.type === "boolean") {
        setting.addToggle((toggle) =>
          toggle.setValue(Boolean(current)).onChange((value) => {
            this.draft[key] = value;
          }),
        );
      } else if (field.type === "number" || field.type === "integer") {
        setting.addText((text) => {
          text.inputEl.type = "number";
          text.setValue(String(current ?? 0)).onChange((value) => {
            this.draft[key] = Number(value);
          });
        });
      } else if (field.type === "array" || field.type === "object") {
        setting.addTextArea((area) =>
          area
            .setValue(JSON.stringify(current ?? (field.type === "array" ? [] : {}), null, 2))
            .onChange((value) => {
              try {
                this.draft[key] = JSON.parse(value);
                area.inputEl.removeClass("has-error");
              } catch {
                area.inputEl.addClass("has-error");
              }
            }),
        );
      } else {
        setting.addText((text) =>
          text.setValue(String(current ?? "")).onChange((value) => {
            this.draft[key] = value;
          }),
        );
      }
    }
  }

  private renderGeneral(container: HTMLElement): void {
    const installed = this.modules.registry.get(this.moduleId);
    if (!installed) return;
    new Setting(container)
      .setName("启用模块")
      .setDesc("关闭后停止注册此模块的组件和数据源。")
      .addToggle((toggle) =>
        toggle.setValue(installed.enabled).onChange((value) => {
          void this.modules.setEnabled(this.moduleId, value);
        }),
      );
    new Setting(container)
      .setName("运行信任")
      .setDesc("来源可信不等于自动授权；每项能力仍需在权限页单独授予。")
      .addText((text) => {
        text.setValue(
          installed.manifest.trust === "trusted" ? "受信任模块" : "沙箱模块",
        );
        text.setDisabled(true);
      });
    new Setting(container)
      .setName("贡献")
      .setDesc(
        installed.manifest.contributions
          .map((item) => `${item.kind}：${item.name}`)
          .join("；"),
      );
  }

  private renderAdvanced(container: HTMLElement): void {
    container.createEl("p", {
      text: "高级设置提供完整 JSON，适合开发者诊断。普通配置请优先使用“内容设置”。",
      cls: "mypage-config-intro",
    });
    const editor = container.createEl("textarea", {
      cls: "mypage-json-editor",
    });
    editor.rows = 16;
    editor.value = JSON.stringify(this.draft, null, 2);
    editor.addEventListener("input", () => {
      try {
        const value = JSON.parse(editor.value) as unknown;
        if (isRecord(value)) this.draft = value;
        editor.removeClass("has-error");
      } catch {
        editor.addClass("has-error");
      }
    });
  }

  private async save(): Promise<void> {
    try {
      for (const [key, field] of Object.entries(
        this.schema.properties ?? {},
      )) {
        const value = this.draft[key];
        if (typeof value !== "string" || !value) continue;
        if (
          field.format === "field-name" &&
          !/^[\p{L}_][\p{L}\p{N}_.-]*$/u.test(value)
        ) {
          throw new Error(`${field.title ?? key}不是有效字段名。`);
        }
        if (field.format === "vault-folder") {
          const normalized = normalizePath(value).replace(/^\/+/u, "");
          if (
            /^[A-Za-z]:/u.test(normalized) ||
            normalized.split("/").includes("..")
          ) {
            throw new Error(
              `${field.title ?? key}必须是 Vault 内的相对文件夹路径。`,
            );
          }
        }
        if (
          field.format === "directory-path" ||
          field.format === "git-repository"
        ) {
          await this.broker.validateConfiguredTarget(
            this.moduleId,
            field.format,
            value,
          );
        }
      }
      const value = protectSecrets(this.draft, this.moduleId, this.secrets);
      const validation = await this.workers.run("schema", {
        schema: this.schema,
        value,
      });
      if (!validation.valid) throw new Error(validation.errors.join("; "));
      const snapshot = this.store.snapshot;
      await this.store.update(
        (draft) => {
          draft.moduleSettings[this.moduleId] = structuredClone(
            value,
          ) as Record<string, unknown>;
        },
        snapshot.revision,
        "save-module-settings",
      );
      await this.onSaved();
      new Notice("模块设置已保存，数据源已重新连接。");
      this.close();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error), 10_000);
    }
  }
}

function protectSecrets(
  value: unknown,
  moduleId: string,
  secrets: SecretReferenceService,
  path = "setting",
): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      protectSecrets(item, moduleId, secrets, `${path}-${index}`),
    );
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (
        /token|secret|password|api[-_]?key/iu.test(key) &&
        typeof item === "string" &&
        item.length > 0 &&
        !item.startsWith("secret:mypage-")
      ) {
        return [key, secrets.set(moduleId, `${path}-${key}`, item)];
      }
      return [key, protectSecrets(item, moduleId, secrets, `${path}-${key}`)];
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
