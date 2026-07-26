import {
  DEFAULT_DATA_BINDING,
} from "../persistence/default-settings";
import type {
  ComputedField,
  DataBinding,
  QueryFilter,
  SortSpec,
} from "../persistence/settings-types";
import { SafeExpressionEngine } from "../data/SafeExpressionEngine";
import type { BaseViewConfig, ParsedBaseConfig } from "./BaseConfigParser";
import type { BasesCompatibilityIssue, BasesCompatibilityReport } from "./compatibility";

export interface BaseTranslationResult {
  binding?: DataBinding;
  report: BasesCompatibilityReport;
}

const expressionEngine = new SafeExpressionEngine();

export function translateBaseView(
  config: ParsedBaseConfig,
  viewName: string,
): BaseTranslationResult {
  const view = config.views.find((candidate) => candidate.name === viewName);
  if (!view) {
    return {
      report: {
        supported: false,
        issues: [{ path: "/views", severity: "error", message: `View "${viewName}" was not found.` }],
      },
    };
  }
  const issues: BasesCompatibilityIssue[] = [];
  const filters = translateFilters(view.filters, issues);
  const sort = translateSort(view, issues);
  const computedFields = translateFormulas(config.formulas, issues);
  const binding = structuredClone(DEFAULT_DATA_BINDING);
  binding.query.filters = filters;
  binding.query.sort = sort;
  binding.query.computedFields = computedFields;
  if (view.limit !== undefined) binding.query.limit = Math.max(0, view.limit);
  inferScope(filters, binding);

  return {
    binding,
    report: {
      supported: !issues.some((issue) => issue.severity === "error"),
      issues,
    },
  };
}

function translateFilters(
  value: unknown,
  issues: BasesCompatibilityIssue[],
): QueryFilter[] {
  if (Array.isArray(value)) {
    return value.flatMap((filter, index) =>
      translateOneFilter(filter, `/filters/${index}`, issues),
    );
  }
  if (isRecord(value) && Array.isArray(value.and)) {
    return value.and.flatMap((filter, index) =>
      translateOneFilter(filter, `/filters/and/${index}`, issues),
    );
  }
  if (isRecord(value) && Array.isArray(value.or)) {
    issues.push({
      path: "/filters/or",
      severity: "error",
      message: "OR groups are not supported by the MyPage Bases adapter yet.",
    });
    return [];
  }
  if (typeof value === "string" && value.trim()) {
    return translateStringFilter(value, "/filters", issues);
  }
  return [];
}

function translateOneFilter(
  value: unknown,
  path: string,
  issues: BasesCompatibilityIssue[],
): QueryFilter[] {
  if (typeof value === "string") return translateStringFilter(value, path, issues);
  if (!isRecord(value)) {
    issues.push({ path, severity: "error", message: "Filter must be a string or object." });
    return [];
  }
  const field = typeof value.field === "string" ? normalizeProperty(value.field) : undefined;
  const operator = typeof value.operator === "string" ? value.operator : "eq";
  if (!field || !isFilterOperator(operator)) {
    issues.push({ path, severity: "error", message: "Unsupported filter field or operator." });
    return [];
  }
  return [{ field, operator, value: value.value }];
}

function translateStringFilter(
  source: string,
  path: string,
  issues: BasesCompatibilityIssue[],
): QueryFilter[] {
  const match = source.match(
    /^\s*([A-Za-z0-9_.-]+)\s*(==|!=|>=|<=|>|<)\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))\s*$/u,
  );
  if (!match) {
    issues.push({
      path,
      severity: "error",
      message: `Unsupported Bases filter expression: ${source}`,
    });
    return [];
  }
  const field = normalizeProperty(match[1] ?? "");
  const operatorMap: Record<string, QueryFilter["operator"]> = {
    "==": "eq",
    "!=": "neq",
    ">": "gt",
    ">=": "gte",
    "<": "lt",
    "<=": "lte",
  };
  const rawValue = match[3] ?? match[4] ?? match[5] ?? "";
  const value = /^-?\d+(?:\.\d+)?$/u.test(rawValue)
    ? Number(rawValue)
    : rawValue === "true"
      ? true
      : rawValue === "false"
        ? false
        : rawValue;
  return [{ field, operator: operatorMap[match[2] ?? "=="] ?? "eq", value }];
}

function translateSort(
  view: BaseViewConfig,
  issues: BasesCompatibilityIssue[],
): SortSpec[] {
  return view.order.flatMap((value, index): SortSpec[] => {
    if (typeof value === "string") {
      const descending = value.startsWith("-");
      return [{
        field: normalizeProperty(descending ? value.slice(1) : value),
        direction: descending ? "desc" : "asc",
      }];
    }
    if (isRecord(value) && typeof value.property === "string") {
      return [{
        field: normalizeProperty(value.property),
        direction: value.direction === "desc" ? "desc" : "asc",
      }];
    }
    issues.push({
      path: `/order/${index}`,
      severity: "warning",
      message: "Unsupported sort entry was ignored.",
    });
    return [];
  });
}

function translateFormulas(
  formulas: Record<string, string>,
  issues: BasesCompatibilityIssue[],
): ComputedField[] {
  return Object.entries(formulas).flatMap(([name, expression]): ComputedField[] => {
    const normalized = expression
      .replace(/\bfile\.name\b/gu, "name")
      .replace(/\bfile\.path\b/gu, "path")
      .replace(/\bfile\.ctime\b/gu, "created")
      .replace(/\bfile\.mtime\b/gu, "modified")
      .replace(/\bnote\.([A-Za-z0-9_-]+)\b/gu, "frontmatter.$1");
    const errors = expressionEngine.validate(normalized);
    if (errors.length > 0) {
      issues.push({
        path: `/formulas/${name}`,
        severity: "error",
        message: `Unsupported formula: ${errors.join("; ")}`,
      });
      return [];
    }
    return [{ name, expression: normalized }];
  });
}

function inferScope(filters: QueryFilter[], binding: DataBinding): void {
  const folderFilter = filters.find(
    (filter) => filter.field === "folder" && filter.operator === "eq",
  );
  if (typeof folderFilter?.value === "string") {
    binding.scope.includeFolders = [folderFilter.value];
    binding.query.filters = binding.query.filters.filter(
      (filter) => filter !== folderFilter,
    );
  }
  const extensionFilter = filters.find(
    (filter) => filter.field === "extension" && filter.operator === "eq",
  );
  if (typeof extensionFilter?.value === "string") {
    binding.scope.extensions = [extensionFilter.value.replace(/^\./u, "")];
    binding.query.filters = binding.query.filters.filter(
      (filter) => filter !== extensionFilter,
    );
  }
}

function normalizeProperty(property: string): string {
  return property
    .replace(/^file\.name$/u, "name")
    .replace(/^file\.path$/u, "path")
    .replace(/^file\.ctime$/u, "created")
    .replace(/^file\.mtime$/u, "modified")
    .replace(/^note\./u, "frontmatter.");
}

function isFilterOperator(value: string): value is QueryFilter["operator"] {
  return [
    "eq",
    "neq",
    "contains",
    "startsWith",
    "endsWith",
    "exists",
    "gt",
    "gte",
    "lt",
    "lte",
    "in",
  ].includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
