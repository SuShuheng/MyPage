import { describe, expect, it } from "vitest";
import { createId, isSafeId, normalizeId } from "../../../src/core/ids";

describe("IDs", () => {
  it("normalizes user-facing labels into safe IDs", () => {
    expect(normalizeId("  My Page / 主页  ")).toBe("my-page");
    expect(normalizeId("...")).toBe("...");
  });

  it("recognizes safe module and contribution IDs", () => {
    expect(isSafeId("com.example.module-1")).toBe(true);
    expect(isSafeId("../escape")).toBe(false);
    expect(isSafeId("UpperCase")).toBe(false);
  });

  it("creates prefixed unique-looking IDs", () => {
    const id = createId("Dashboard");
    expect(id).toMatch(/^dashboard-[a-z0-9]+-[a-z0-9]+$/);
  });
});
