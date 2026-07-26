import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  parseYaml: vi.fn(),
}));

import { translateBaseView } from "../../../src/bases/BaseQueryTranslator";

describe("BaseQueryTranslator", () => {
  it("translates the supported public configuration subset", () => {
    const result = translateBaseView(
      {
        raw: {},
        formulas: { score: "note.points * 2" },
        views: [{
          name: "Open",
          filters: [
            "file.path == 'Projects'",
            "note.status == 'open'",
          ],
          order: ["-file.mtime"],
          limit: 20,
        }],
      },
      "Open",
    );
    expect(result.report.supported).toBe(true);
    expect(result.binding?.query.limit).toBe(20);
    expect(result.binding?.query.sort[0]).toEqual({
      field: "modified",
      direction: "desc",
    });
    expect(result.binding?.query.computedFields[0]?.expression).toBe(
      "frontmatter.points * 2",
    );
  });

  it("reports unsupported OR groups instead of silently changing meaning", () => {
    const result = translateBaseView(
      {
        raw: {},
        formulas: {},
        views: [{ name: "OR", filters: { or: ["a == 1", "b == 2"] }, order: [] }],
      },
      "OR",
    );
    expect(result.report.supported).toBe(false);
    expect(result.report.issues[0]?.message).toMatch(/OR groups/);
  });
});
