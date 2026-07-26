import { describe, expect, it } from "vitest";
import { executeQuery } from "../../src/data/QueryCompiler";
import type { DataRecord } from "../../src/data/data-types";
import { DEFAULT_DATA_BINDING } from "../../src/persistence/default-settings";

describe("10,000 record query performance", () => {
  it("filters, groups and sorts without a long synchronous stall", () => {
    const records: DataRecord[] = Array.from({ length: 10_000 }, (_, index) => ({
      id: `record-${index}`,
      sourceId: "core.vault-files",
      type: "file",
      timestamp: 1_700_000_000_000 + index,
      fields: {
        path: `05 博客/post-${index}.md`,
        extension: "md",
        size: index,
        folder: "05 博客",
        modified: 1_700_000_000_000 + index,
      },
      sourceRef: { path: `05 博客/post-${index}.md` },
    }));
    const binding = structuredClone(DEFAULT_DATA_BINDING);
    binding.scope.includeFolders = ["05 博客"];
    binding.query.filters = [{ field: "size", operator: "gte", value: 5_000 }];
    binding.query.limit = 100;
    const started = performance.now();
    const result = executeQuery(records, binding);
    const duration = performance.now() - started;
    expect(result).toHaveLength(100);
    expect(duration).toBeLessThan(1_000);
  });
});
