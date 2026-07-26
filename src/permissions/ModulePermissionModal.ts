import type { App} from "obsidian";
import { Modal, Notice, Setting } from "obsidian";
import type { ModuleManager } from "../modules/ModuleManager";
import type {
  CapabilityId,
  PermissionScope,
} from "../persistence/settings-types";
import { CAPABILITIES } from "./capabilities";
import type { PermissionService } from "./PermissionService";
import { confirmDialog } from "../components/ThemeDialog";

export class ModulePermissionModal extends Modal {
  private editingCapability: CapabilityId | undefined;
  private scopeDraft = "";
  private scopeError = "";

  public constructor(
    app: App,
    private readonly moduleId: string,
    private readonly modules: ModuleManager,
    private readonly permissions: PermissionService,
  ) {
    super(app);
  }

  public override onOpen(): void {
    this.modalEl.addClass("mypage-permission-modal");
    this.render();
  }

  public override onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    this.contentEl.empty();
    const installed = this.modules.registry.get(this.moduleId);
    if (!installed) {
      this.setTitle("模块不可用");
      this.contentEl.createEl("p", { text: "找不到模块清单，请重新扫描模块。" });
      return;
    }
    const configuration = this.permissions
      .list(this.moduleId);
    const trust = this.permissions.trustLevel(this.moduleId) ?? "sandbox";

    this.setTitle(`${installed.manifest.name} · 权限`);
    this.contentEl.createEl("p", {
      text: "模块来源与权限相互独立。官方来源不会自动授权；每项能力都只在当前设备、当前 Vault 和当前模块版本生效。",
      cls: "mypage-permission-intro",
    });

    new Setting(this.contentEl)
      .setName("运行信任层级")
      .setDesc(
        trust === "trusted"
          ? "受信任：仍通过能力代理，并且仍需逐项授权。"
          : "沙箱：只允许低风险能力；高风险能力不可授权。",
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("sandbox", "始终隔离（推荐）")
          .addOption("trusted", "受信任模块")
          .setValue(trust)
          .onChange(async (value) => {
            if (value === "trusted" && !(await confirmDialog(this.app, {
              title: "提升模块信任层级",
              message: `确认将“${installed.manifest.name}”设为受信任模块？这不会自动授予任何能力。`,
              confirmText: "设为受信任",
            }))) {
              this.render();
              return;
            }
            await this.permissions.setTrustLevel(
              this.moduleId,
              value === "trusted" ? "trusted" : "sandbox",
            );
            new Notice(
              value === "trusted"
                ? "已提升信任层级；请继续逐项授权所需能力。"
                : "已降级为沙箱并撤销全部高风险授权。",
            );
            this.render();
          }),
      );

    if (installed.manifest.permissions.length === 0) {
      this.contentEl.createEl("p", {
        text: "此模块没有声明额外能力。",
        cls: "mypage-muted",
      });
      return;
    }

    for (const request of installed.manifest.permissions) {
      const definition = CAPABILITIES[request.capability];
      const grant = configuration.find(
        (candidate) => candidate.capability === request.capability,
      );
      new Setting(this.contentEl)
        .setName(`${definition.name} · ${definition.risk === "high" ? "高风险" : "低风险"}`)
        .setDesc(
          `${request.reason} ${formatScope(grant?.scope ?? request.suggestedScope)}`,
        )
        .addButton((button) => {
          if (grant) {
            button
              .setButtonText("撤销")
              .setWarning()
              .onClick(async () => {
                await this.permissions.revoke(
                  this.moduleId,
                  request.capability,
                );
                this.render();
              });
          } else {
            button
              .setButtonText("设置并授权")
              .setCta()
              .onClick(() => {
                const [field] = scopeField(request.capability);
                this.editingCapability = request.capability;
                this.scopeDraft = (
                  request.suggestedScope?.[field] ?? []
                ).join(", ");
                this.scopeError = "";
                this.render();
              });
          }
          return button;
        });
      if (this.editingCapability === request.capability && !grant) {
        this.renderScopeEditor(
          request.capability,
          request.suggestedScope ?? {},
        );
      }
    }
  }

  private renderScopeEditor(
    capability: CapabilityId,
    suggested: PermissionScope,
  ): void {
    const [field, label] = scopeField(capability);
    const panel = this.contentEl.createDiv("mypage-permission-scope-editor");
    panel.createEl("label", {
      text: label,
      attr: { for: `mypage-scope-${capability}` },
    });
    const input = panel.createEl("textarea", {
      cls: this.scopeError ? "has-error" : "",
      attr: {
        id: `mypage-scope-${capability}`,
        rows: "3",
        title: scopeHint(capability),
        "aria-invalid": String(Boolean(this.scopeError)),
      },
    });
    input.value =
      this.scopeDraft ||
      (suggested[field] ?? []).join(", ");
    input.placeholder = scopePlaceholder(capability);
    const hint = panel.createEl("small", {
      text: scopeHint(capability),
      cls: "mypage-field-help",
    });
    hint.setAttr("aria-live", "polite");
    const error = panel.createDiv({
      text: this.scopeError,
      cls: "mypage-field-error",
      attr: { role: "alert", "aria-live": "polite" },
    });
    input.addEventListener("input", () => {
      this.scopeDraft = input.value;
      this.scopeError = "";
      input.removeClass("has-error");
      input.setAttr("aria-invalid", "false");
      error.setText("");
    });
    const actions = panel.createDiv("mypage-permission-scope-actions");
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => {
      this.editingCapability = undefined;
      this.render();
    });
    const save = actions.createEl("button", {
      text: "授权此作用域",
      cls: "mod-cta",
    });
    save.addEventListener("click", async () => {
      const items = parseScopeItems(input.value);
      const validation = validateScopeEntries(capability, items);
      if (validation) {
        this.scopeDraft = input.value;
        this.scopeError = validation;
        input.addClass("has-error");
        input.setAttr("aria-invalid", "true");
        error.setText(validation);
        return;
      }
      save.disabled = true;
      await this.grant(capability, { [field]: items });
      this.editingCapability = undefined;
    });
  }

  private async grant(
    capability: CapabilityId,
    scope: PermissionScope,
  ): Promise<void> {
    try {
      await this.permissions.grant(this.moduleId, capability, scope);
      new Notice(`已授权 ${CAPABILITIES[capability].name}。`);
      this.render();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error), 10_000);
    }
  }
}

function scopeField(
  capability: CapabilityId,
): readonly [keyof PermissionScope, string] {
  const [field, label] =
    capability === "network.request"
      ? (["domains", "允许的协议、域名与端口"] as const)
      : capability === "git.read" || capability === "git.write"
        ? (["repositories", "允许的 Git 仓库绝对路径"] as const)
        : capability === "obsidian.command"
          ? (["commands", "允许的 Obsidian 命令 ID"] as const)
          : capability === "system.exec"
            ? (["executables", "允许的可执行文件绝对路径"] as const)
            : (["paths", "允许的路径"] as const);
  return [field, label];
}

function parseScopeItems(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function validateScopeEntries(
  capability: CapabilityId,
  items: string[],
): string | undefined {
  if (items.length === 0) return "作用域不能为空。";
  if (
    capability === "externalFs.read" ||
    capability === "externalFs.write" ||
    capability === "git.read" ||
    capability === "git.write" ||
    capability === "system.exec"
  ) {
    const invalid = items.find(
      (item) => !/^(?:[A-Za-z]:[\\/]|\/)/u.test(item),
    );
    if (invalid) return `需要绝对路径：${invalid}`;
  }
  if (capability === "network.request") {
    const invalid = items.find((item) => {
      try {
        const url = new URL(item.includes("://") ? item : `https://${item}`);
        return !url.hostname;
      } catch {
        return true;
      }
    });
    if (invalid) return `域名格式无效：${invalid}`;
  }
  return undefined;
}

function scopeHint(capability: CapabilityId): string {
  if (capability === "network.request") {
    return "填写允许访问的域名或 HTTPS 地址，多个值使用英文逗号分隔。";
  }
  if (capability === "obsidian.command") {
    return "填写 Obsidian 命令 ID，多个值使用英文逗号分隔。";
  }
  return "填写绝对路径，多个值使用英文逗号分隔。授权仅作用于当前模块、设备和 Vault。";
}

function scopePlaceholder(capability: CapabilityId): string {
  if (capability === "network.request") return "api.example.com";
  if (capability === "obsidian.command") return "app:open-settings";
  return "H:\\GitHub\\project";
}

function formatScope(scope: PermissionScope | undefined): string {
  if (!scope) return "作用域：未声明，授权前需由模块设置提供。";
  const values = [
    ...(scope.paths ?? []),
    ...(scope.domains ?? []),
    ...(scope.repositories ?? []),
    ...(scope.commands ?? []),
    ...(scope.executables ?? []),
  ];
  return values.length > 0
    ? `作用域：${values.join("、")}`
    : "作用域：无额外范围。";
}
