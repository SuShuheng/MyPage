import { Notice, Platform, type App } from "obsidian";
import type { UpdateService } from "./UpdateService";
import type { AvailableUpdate } from "./update-types";
import { confirmDialog } from "../components/ThemeDialog";

export function showUpdateNotice(
  app: App,
  update: AvailableUpdate,
  service: UpdateService,
): Notice {
  const notice = new Notice("", 0);
  const element = notice.noticeEl;
  element.addClass("mypage-update-notice");
  element.empty();
  element.createEl("strong", { text: `MyPage ${update.version} 可用` });
  const summary = update.release.body?.split(/\r?\n/u).find((line) => line.trim());
  element.createEl("p", {
    text: summary?.slice(0, 180) ?? "查看更新说明并选择是否更新。",
  });
  const actions = element.createDiv("mypage-update-actions");
  const details = actions.createEl("a", {
    text: "更新说明",
    href: update.release.html_url,
  });
  details.setAttr("target", "_blank");
  details.setAttr("rel", "noopener noreferrer");
  const ignore = actions.createEl("button", { text: "忽略此版本" });
  ignore.addEventListener("click", () => {
    void service.ignore(update.version);
    notice.hide();
  });
  const install = actions.createEl("button", {
    text: Platform.isDesktopApp ? "一键更新" : "打开 Release",
    cls: "mod-cta",
  });
  install.addEventListener("click", async () => {
    if (!Platform.isDesktopApp) {
      window.open(update.release.html_url, "_blank", "noopener");
      return;
    }
    if (!(await confirmDialog(app, {
      title: `更新到 MyPage ${update.version}`,
      message: "插件会先校验哈希并备份当前版本，校验失败时自动回滚。",
      confirmText: "校验并更新",
    }))) {
      return;
    }
    install.disabled = true;
    install.textContent = "正在校验并更新…";
    try {
      const result = await service.install(update);
      notice.hide();
      new Notice(
        result.requiresReload
          ? `MyPage ${result.version} 已安装，请重载 Obsidian。`
          : `请从 Release 安装 MyPage ${result.version}。`,
        0,
      );
    } catch (error) {
      install.disabled = false;
      install.textContent = "重试更新";
      new Notice(`更新失败，已尝试回滚：${error instanceof Error ? error.message : String(error)}`, 12_000);
    }
  });
  return notice;
}
