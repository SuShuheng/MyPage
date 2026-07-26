import { describe, expect, it } from "vitest";
import { DEFAULT_DATA_BINDING } from "../../../src/persistence/default-settings";
import { fingerprint, QueryCache } from "../../../src/data/QueryCache";

describe("QueryCache", () => {
  it("creates stable fingerprints independent of object key order", () => {
    expect(fingerprint({ b: 2, a: 1 })).toBe(fingerprint({ a: 1, b: 2 }));
  });

  it("invalidates only scopes affected by a changed path", () => {
    const cache = new QueryCache();
    const projects = structuredClone(DEFAULT_DATA_BINDING.scope);
    projects.includeFolders = ["Projects"];
    const journal = structuredClone(DEFAULT_DATA_BINDING.scope);
    journal.includeFolders = ["Journal"];
    cache.set("projects", projects, {
      records: [],
      fingerprint: "projects",
      computedAt: 0,
      durationMs: 0,
      cacheHit: false,
    });
    cache.set("journal", journal, {
      records: [],
      fingerprint: "journal",
      computedAt: 0,
      durationMs: 0,
      cacheHit: false,
    });
    expect(cache.invalidatePath("Projects/a.md")).toEqual(["projects"]);
    expect(cache.get("journal")).toBeDefined();
  });
});
