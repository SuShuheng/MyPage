import type {
  AggregateSpec,
  DataBinding,
  DataScope,
  QueryFilter,
  SortSpec,
  TransformSpec,
} from "../persistence/settings-types";
import type { DataRecord, DataValue } from "./data-types";
import { SafeExpressionEngine } from "./SafeExpressionEngine";

const expressions = new SafeExpressionEngine();

export function executeQuery(
  records: DataRecord[],
  binding: DataBinding,
): DataRecord[] {
  let output = records
    .filter(
      (record) =>
        binding.sourceId === "core.all" || record.sourceId === binding.sourceId,
    )
    .filter((record) => matchesScope(record, binding.scope))
    .filter((record) =>
      binding.query.filters.every((filter) => matchesFilter(record, filter)),
    )
    .map((record) => applyComputedFields(record, binding.query.computedFields));

  for (const transform of binding.query.transforms) {
    output = applyTransform(output, transform);
  }
  if (binding.query.aggregate) {
    output = aggregate(output, binding.query.aggregate);
  }
  output = sortRecords(output, binding.query.sort);
  if (binding.query.limit !== undefined) {
    output = output.slice(0, Math.max(0, binding.query.limit));
  }
  return output;
}

export function matchesScope(record: DataRecord, scope: DataScope): boolean {
  const path = record.sourceRef?.path ?? String(record.fields.path ?? "");
  const normalized = normalizeVaultPath(path);
  if (
    scope.includeFolders.length > 0 &&
    !scope.includeFolders.some((folder) => pathWithin(normalized, folder))
  ) {
    return false;
  }
  if (scope.excludeFolders.some((folder) => pathWithin(normalized, folder))) {
    return false;
  }
  const extension = String(record.fields.extension ?? "").replace(/^\./u, "");
  if (scope.extensions.length > 0 && !scope.extensions.includes(extension)) {
    return false;
  }
  const tags = asArray(record.fields.tags).map(String);
  if (scope.tags.length > 0 && !scope.tags.every((tag) => tags.includes(tag))) {
    return false;
  }
  if (
    !scope.frontmatter.every((condition) =>
      compareFilterValue(
        readField(record, `frontmatter.${condition.field}`),
        condition.operator,
        condition.value,
      ),
    )
  ) {
    return false;
  }
  if (scope.timeRange) {
    const timestamp = Number(readField(record, scope.timeRange.field) ?? record.timestamp);
    if (!Number.isFinite(timestamp)) return false;
    if (scope.timeRange.from !== undefined && timestamp < scope.timeRange.from) return false;
    if (scope.timeRange.to !== undefined && timestamp > scope.timeRange.to) return false;
  }
  return true;
}

export function scopeMatchesPath(scope: DataScope, path: string): boolean {
  const normalized = normalizeVaultPath(path);
  return (
    (scope.includeFolders.length === 0 ||
      scope.includeFolders.some((folder) => pathWithin(normalized, folder))) &&
    !scope.excludeFolders.some((folder) => pathWithin(normalized, folder))
  );
}

function matchesFilter(record: DataRecord, filter: QueryFilter): boolean {
  return compareFilterValue(
    readField(record, filter.field),
    filter.operator,
    filter.value,
  );
}

function compareFilterValue(
  actual: unknown,
  operator: QueryFilter["operator"],
  expected: unknown,
): boolean {
  switch (operator) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "contains":
      return Array.isArray(actual)
        ? actual.includes(expected)
        : String(actual ?? "").includes(String(expected ?? ""));
    case "startsWith":
      return String(actual ?? "").startsWith(String(expected ?? ""));
    case "endsWith":
      return String(actual ?? "").endsWith(String(expected ?? ""));
    case "exists":
      return actual !== undefined && actual !== null;
    case "gt":
      return compareValues(actual, expected) > 0;
    case "gte":
      return compareValues(actual, expected) >= 0;
    case "lt":
      return compareValues(actual, expected) < 0;
    case "lte":
      return compareValues(actual, expected) <= 0;
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
  }
}

function applyComputedFields(
  record: DataRecord,
  computedFields: DataBinding["query"]["computedFields"],
): DataRecord {
  if (computedFields.length === 0) return record;
  const clone = structuredClone(record);
  for (const field of computedFields) {
    const value = expressions.evaluate(field.expression, clone.fields);
    clone.fields[field.name] = toDataValue(value);
  }
  return clone;
}

function applyTransform(
  records: DataRecord[],
  transform: TransformSpec,
): DataRecord[] {
  switch (transform.type) {
    case "pick": {
      const fields = asArray(transform.options.fields).map(String);
      return records.map((record) => ({
        ...record,
        fields: Object.fromEntries(
          fields
            .filter((field) => readField(record, field) !== undefined)
            .map((field) => [field, toDataValue(readField(record, field))]),
        ),
      }));
    }
    case "rename": {
      const from = String(transform.options.from ?? "");
      const to = String(transform.options.to ?? "");
      return records.map((record) => {
        const clone = structuredClone(record);
        if (hasOwn(clone.fields, from)) {
          clone.fields[to] = clone.fields[from] ?? null;
          delete clone.fields[from];
        }
        return clone;
      });
    }
    case "flatten": {
      const field = String(transform.options.field ?? "");
      return records.flatMap((record) => {
        const value = readField(record, field);
        if (!Array.isArray(value)) return [record];
        return value.map((item, index) => ({
          ...structuredClone(record),
          id: `${record.id}:${index}`,
          fields: { ...record.fields, [field]: toDataValue(item) },
        }));
      });
    }
    case "dateBucket": {
      const field = String(transform.options.field ?? "timestamp");
      const outputField = String(transform.options.as ?? "bucket");
      const unit = String(transform.options.unit ?? "day");
      return records.map((record) => {
        const timestamp = Number(readField(record, field) ?? record.timestamp);
        const clone = structuredClone(record);
        clone.fields[outputField] = Number.isFinite(timestamp)
          ? formatDateBucket(timestamp, unit)
          : "";
        return clone;
      });
    }
  }
}

function aggregate(records: DataRecord[], spec: AggregateSpec): DataRecord[] {
  const groups = new Map<string, DataRecord[]>();
  for (const record of records) {
    const keyValues = spec.groupBy.map((field) => readField(record, field));
    const key = JSON.stringify(keyValues);
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  if (spec.groupBy.length === 0 && groups.size === 0) groups.set("[]", []);
  return [...groups.entries()].map(([key, group]) => {
    const keyValues = JSON.parse(key) as unknown[];
    const fields: Record<string, DataValue> = {};
    spec.groupBy.forEach((field, index) => {
      fields[field] = toDataValue(keyValues[index]);
    });
    for (const metric of spec.metrics) {
      const values = metric.field
        ? group
            .map((record) => Number(readField(record, metric.field ?? "")))
            .filter(Number.isFinite)
        : [];
      fields[metric.as] =
        metric.operation === "count"
          ? group.length
          : metric.operation === "sum"
            ? values.reduce((sum, value) => sum + value, 0)
            : metric.operation === "avg"
              ? values.length === 0
                ? 0
                : values.reduce((sum, value) => sum + value, 0) / values.length
              : metric.operation === "min"
                ? values.length === 0 ? 0 : Math.min(...values)
                : values.length === 0 ? 0 : Math.max(...values);
    }
    return {
      id: `aggregate:${key}`,
      sourceId: "core.aggregate",
      type: "aggregate",
      fields,
    };
  });
}

function sortRecords(records: DataRecord[], sort: SortSpec[]): DataRecord[] {
  if (sort.length === 0) return records;
  return [...records].sort((left, right) => {
    for (const spec of sort) {
      const comparison = compareValues(
        readField(left, spec.field),
        readField(right, spec.field),
      );
      if (comparison !== 0) return spec.direction === "asc" ? comparison : -comparison;
    }
    return left.id.localeCompare(right.id);
  });
}

export function readField(record: DataRecord, field: string): unknown {
  if (field === "id") return record.id;
  if (field === "sourceId") return record.sourceId;
  if (field === "type") return record.type;
  if (field === "timestamp") return record.timestamp;
  if (hasOwn(record.fields, field)) return record.fields[field];
  const segments = field.split(".");
  let current: unknown = record.fields;
  for (const segment of segments) {
    if (
      typeof current !== "object" ||
      current === null ||
      Array.isArray(current) ||
      !hasOwn(current, segment)
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function pathWithin(path: string, folder: string): boolean {
  const normalizedFolder = normalizeVaultPath(folder).replace(/\/$/u, "");
  if (!normalizedFolder || normalizedFolder === "/") return true;
  return path === normalizedFolder || path.startsWith(`${normalizedFolder}/`);
}

function normalizeVaultPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/u, "").replace(/\/+/gu, "/");
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "boolean" && typeof right === "boolean") return Number(left) - Number(right);
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function toDataValue(value: unknown): DataValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(toDataValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toDataValue(item)]),
    );
  }
  return String(value);
}

function formatDateBucket(timestamp: number, unit: string): string {
  const date = new Date(timestamp);
  if (unit === "year") return date.toISOString().slice(0, 4);
  if (unit === "month") return date.toISOString().slice(0, 7);
  if (unit === "week") {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    return start.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}
