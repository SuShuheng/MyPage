import type { App} from "obsidian";
import { Modal, Notice, Setting } from "obsidian";
import type { ModuleManager } from "../modules/ModuleManager";
import type {
  CapabilityId,
  PermissionScope,
} from "../persistence/settings-types";
import { CAPABILITIES } from "./capabilities";
import type { PermissionService } from "./PermissionService";

export class ModulePermissionModal extends Modal {
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
            if (
              value === "trusted" &&
              !window.confirm(
                `确认将“${installed.manifest.name}”设为受信任模块？这不会自动授予任何能力。`,
              )
            ) {
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
              .onClick(async () => {
                const scope = promptScope(
                  request.capability,
                  request.suggestedScope ?? {},
                );
                if (!scope) return;
                await this.grant(
                  request.capability,
                  scope,
                );
              });
          }
          return button;
        });
    }
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

function promptScope(
  capability: CapabilityId,
  suggested: PermissionScope,
): PermissionScope | undefined {
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
  const current = (suggested[field] ?? []).join(", ");
  const value = window.prompt(`${label}（多个值用英文逗号分隔）`, current);
  if (value === null) return undefined;
  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) {
    new Notice("作用域不能为空。");
    return undefined;
  }
  return { [field]: items };
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
