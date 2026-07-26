import { Modal, Notice, Setting, normalizePath, type App } from "obsidian";
import type { ModuleManager } from "./ModuleManager";
import type { SettingsStore } from "../persistence/SettingsStore";
import type { WorkerCoordinator } from "../workers/WorkerCoordinator";
import type { SecretReferenceService } from "../persistence/SecretReferenceService";

export class ModuleSettingsModal extends Modal {
  public constructor(
    app: App,
    private readonly moduleId: string,
    private readonly modules: ModuleManager,
    private readonly store: SettingsStore,
    private readonly workers: WorkerCoordinator,
    private readonly secrets: SecretReferenceService,
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
    this.setTitle(`${installed.manifest.name} · 模块设置`);
    this.contentEl.createEl("p", {
      text: "这里保存模块级数据源与通用设置。单个 Widget 的配置仍在主页编辑会话中独立设置。",
      cls: "setting-item-description",
    });
    const editor = this.contentEl.createEl("textarea", {
      cls: "mypage-json-editor",
    });
    editor.rows = 16;
    editor.value = JSON.stringify(
      this.store.snapshot.moduleSettings[this.moduleId] ?? {},
      null,
      2,
    );
    new Setting(this.contentEl)
      .addButton((button) =>
        button.setButtonText("取消").onClick(() => this.close()),
      )
      .addButton((button) =>
        button.setButtonText("校验并保存").setCta().onClick(async () => {
          try {
            const parsed = JSON.parse(editor.value) as unknown;
            const value = protectSecrets(
              parsed,
              this.moduleId,
              this.secrets,
            );
            const schema = JSON.parse(
              await this.app.vault.adapter.read(
                normalizePath(`${installed.directory}/config.schema.json`),
              ),
            ) as object;
            const validation = await this.workers.run("schema", {
              schema,
              value,
            });
            if (!validation.valid) {
              throw new Error(validation.errors.join("; "));
            }
            const snapshot = this.store.snapshot;
            await this.store.update(
              (draft) => {
                draft.moduleSettings[this.moduleId] =
                  structuredClone(value) as Record<string, unknown>;
              },
              snapshot.revision,
              "save-module-settings",
            );
            await this.onSaved();
            new Notice("模块设置已保存，数据源已重新连接。");
            this.close();
          } catch (error) {
            editor.addClass("has-error");
            new Notice(error instanceof Error ? error.message : String(error), 10_000);
          }
        }),
      );
  }

  public override onClose(): void {
    this.contentEl.empty();
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
  if (typeof value !== "object" || value === null) return value;
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
      return [
        key,
        protectSecrets(item, moduleId, secrets, `${path}-${key}`),
      ];
    }),
  );
}
