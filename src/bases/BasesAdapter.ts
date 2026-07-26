import type { App, TFile } from "obsidian";
import { parseBaseConfig } from "./BaseConfigParser";
import { translateBaseView, type BaseTranslationResult } from "./BaseQueryTranslator";

export class BasesAdapter {
  public constructor(private readonly app: App) {}

  public async translate(
    file: TFile,
    viewName: string,
  ): Promise<BaseTranslationResult> {
    if (file.extension !== "base") {
      throw new Error("BasesAdapter only accepts .base files.");
    }
    const source = await this.app.vault.cachedRead(file);
    const config = parseBaseConfig(source);
    return translateBaseView(config, viewName);
  }
}
