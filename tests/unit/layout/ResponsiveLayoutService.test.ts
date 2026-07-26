import { describe, expect, it } from "vitest";
import { DEFAULT_GRID_OPTIONS } from "../../../src/persistence/default-settings";
import {
  deriveLayout,
  resolveBreakpoint,
} from "../../../src/layout/ResponsiveLayoutService";

describe("ResponsiveLayoutService", () => {
  it("maps width to desktop, tablet, and mobile", () => {
    expect(resolveBreakpoint(1400)).toBe("desktop");
    expect(resolveBreakpoint(800)).toBe("tablet");
    expect(resolveBreakpoint(320)).toBe("mobile");
  });

  it("derives a clamped mobile layout", () => {
    const result = deriveLayout(
      { x: 9, y: 4, w: 3, h: 2, minW: 2 },
      "mobile",
      DEFAULT_GRID_OPTIONS,
    );
    expect(result.w).toBeLessThanOrEqual(4);
    expect(result.x + result.w).toBeLessThanOrEqual(4);
    expect(result.h).toBe(2);
  });
});
