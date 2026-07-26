import { describe, expect, it } from "vitest";
import { DEFAULT_DATA_BINDING } from "../../../src/persistence/default-settings";
import { executeQuery } from "../../../src/data/QueryCompiler";
import type { DataRecord } from "../../../src/data/data-types";

const records: DataRecord[] = [
  {
    id: "a",
    sourceId: "core.vault-files",
    type: "vault-file",
    timestamp: 100,
    fields: {
      path: "Projects/a.md",
      extension: "md",
      modified: 100,
      size: 10,
      tags: ["work"],
      frontmatter: { status: "open" },
    },
    sourceRef: { path: "Projects/a.md" },
  },
  {
    id: "b",
    sourceId: "core.vault-files",
    type: "vault-file",
    timestamp: 200,
    fields: {
      path: "Journal/b.md",
      extension: "md",
      modified: 200,
      size: 20,
      tags: ["daily"],
      frontmatter: { status: "done" },
    },
    sourceRef: { path: "Journal/b.md" },
  },
];

describe("QueryCompiler", () => {
  it("applies independent scope, filters, computed fields, and sort", () => {
    const binding = structuredClone(DEFAULT_DATA_BINDING);
    binding.scope.includeFolders = ["Projects"];
    binding.query.filters = [{ field: "frontmatter.status", operator: "eq", value: "open" }];
    binding.query.computedFields = [{ name: "doubleSize", expression: "size * 2" }];
    const result = executeQuery(records, binding);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("a");
    expect(result[0]?.fields.doubleSize).toBe(20);
  });

  it("aggregates and limits results", () => {
    const binding = structuredClone(DEFAULT_DATA_BINDING);
    binding.query.sort = [];
    binding.query.aggregate = {
      groupBy: [],
      metrics: [
        { operation: "count", as: "count" },
        { operation: "sum", field: "size", as: "bytes" },
      ],
    };
    const result = executeQuery(records, binding);
    expect(result[0]?.fields).toMatchObject({ count: 2, bytes: 30 });
  });

  it("keeps task records that inherit their Markdown file scope fields", () => {
    const binding = structuredClone(DEFAULT_DATA_BINDING);
    binding.sourceId = "core.tasks";
    const task: DataRecord = {
      id: "task:Projects/a.md:3",
      sourceId: "core.tasks",
      type: "task",
      fields: {
        path: "Projects/a.md",
        extension: "md",
        folder: "Projects",
        line: 3,
        text: "Ship MyPage",
        completed: false,
      },
      sourceRef: { path: "Projects/a.md" },
    };
    expect(executeQuery([task], binding)).toEqual([task]);
  });
});
