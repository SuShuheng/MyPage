import {
  FuzzySuggestModal,
  Notice,
  type App,
  type TFile,
} from "obsidian";
import type { DataBinding } from "../persistence/settings-types";
import { BaseConfigParser } from "./BaseConfigParser";
import { BasesAdapter } from "./BasesAdapter";

export class BasesBindingModal extends FuzzySuggestModal<TFile> {
  public constructor(
    app: App,
    private readonly onBinding: (binding: DataBinding) => void,
  ) {
    super(app);
    this.setPlaceholder("选择一个 .base 文件");
  }

  public getItems(): TFile[] {
    return this.app.vault.getFiles().filter((file) => file.extension === "base");
  }

  public getItemText(file: TFile): string {
    return file.path;
  }

  public onChooseItem(file: TFile): void {
    void this.translate(file);
  }

  private async translate(file: TFile): Promise<void> {
    try {
      const source = await this.app.vault.cachedRead(file);
      const config = BaseConfigParser.parse(source);
      const names = config.views.map((view) => view.name);
      const viewName =
        names.length === 1
          ? names[0]
          : window.prompt(`输入 Bases 视图名称：\n${names.join("\n")}`, names[0]);
      if (!viewName) return;
      const result = await new BasesAdapter(this.app).translate(file, viewName);
      if (!result.binding || !result.report.supported) {
        throw new Error(
          result.report.issues.map((issue) => issue.message).join("; ") ||
            "这个 Bases 视图暂不兼容。",
        );
      }
      this.onBinding(result.binding);
      const warnings = result.report.issues.filter(
        (issue) => issue.severity === "warning",
      );
      new Notice(
        warnings.length > 0
          ? `已导入 Bases 查询；${warnings.length} 项不兼容设置被忽略。`
          : "已导入 Bases 查询。",
      );
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error), 10_000);
    }
  }
}
