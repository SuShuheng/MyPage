import type { DataScope } from "../persistence/settings-types";
import type { QueryResult } from "./data-types";
import { scopeMatchesPath } from "./QueryCompiler";

interface CacheEntry {
  result: QueryResult;
  scope: DataScope;
}

export class QueryCache {
  private readonly entries = new Map<string, CacheEntry>();

  public get(fingerprint: string): QueryResult | undefined {
    const entry = this.entries.get(fingerprint);
    if (!entry) return undefined;
    return { ...structuredClone(entry.result), cacheHit: true };
  }

  public set(fingerprint: string, scope: DataScope, result: QueryResult): void {
    this.entries.set(fingerprint, {
      result: structuredClone(result),
      scope: structuredClone(scope),
    });
  }

  public invalidatePath(path: string): string[] {
    const invalidated: string[] = [];
    for (const [fingerprint, entry] of this.entries) {
      if (scopeMatchesPath(entry.scope, path)) {
        this.entries.delete(fingerprint);
        invalidated.push(fingerprint);
      }
    }
    return invalidated;
  }

  public clear(): void {
    this.entries.clear();
  }

  public get size(): number {
    return this.entries.size;
  }
}

export function fingerprint(value: unknown): string {
  const json = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}
