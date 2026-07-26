import { parseYaml } from "obsidian";

export interface ParsedBaseConfig {
  raw: Record<string, unknown>;
  views: BaseViewConfig[];
  formulas: Record<string, string>;
}

export interface BaseViewConfig {
  name: string;
  type?: string;
  filters: unknown;
  order: unknown[];
  limit?: number;
}

export function parseBaseConfig(source: string): ParsedBaseConfig {
  const parsed = parseYaml(source) as unknown;
  if (!isRecord(parsed)) throw new Error("The .base file must contain a YAML object.");
  const formulas = isRecord(parsed.formulas)
    ? Object.fromEntries(
        Object.entries(parsed.formulas)
          .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      )
    : {};
  const rawViews = Array.isArray(parsed.views) ? parsed.views : [];
  const views = rawViews
    .filter(isRecord)
    .map((view, index): BaseViewConfig => {
      const result: BaseViewConfig = {
        name: typeof view.name === "string" ? view.name : `View ${index + 1}`,
        filters: view.filters ?? parsed.filters ?? [],
        order: Array.isArray(view.order) ? view.order : [],
      };
      if (typeof view.type === "string") result.type = view.type;
      if (typeof view.limit === "number") result.limit = view.limit;
      return result;
    });
  if (views.length === 0) {
    const defaultView: BaseViewConfig = {
      name: "Default",
      filters: parsed.filters ?? [],
      order: Array.isArray(parsed.order) ? parsed.order : [],
    };
    if (typeof parsed.limit === "number") defaultView.limit = parsed.limit;
    views.push(defaultView);
  }
  return { raw: parsed, views, formulas };
}

export const BaseConfigParser = {
  parse: parseBaseConfig,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
