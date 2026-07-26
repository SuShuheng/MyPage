import { describe, expect, it } from "vitest";
import {
  compactLayouts,
  layoutsOverlap,
  resolvePlacement,
} from "../../../src/layout/CollisionPolicy";

describe("CollisionPolicy", () => {
  it("detects overlapping rectangles", () => {
    expect(
      layoutsOverlap(
        { x: 0, y: 0, w: 2, h: 2 },
        { x: 1, y: 1, w: 2, h: 2 },
      ),
    ).toBe(true);
    expect(
      layoutsOverlap(
        { x: 0, y: 0, w: 2, h: 2 },
        { x: 2, y: 0, w: 2, h: 2 },
      ),
    ).toBe(false);
  });

  it("rejects conflicts when push is disabled", () => {
    const result = resolvePlacement(
      "a",
      { x: 1, y: 0, w: 2, h: 2 },
      { b: { x: 2, y: 0, w: 2, h: 2 } },
      12,
      false,
    );
    expect(result.accepted).toBe(false);
    expect(result.conflictIds).toEqual(["b"]);
  });

  it("pushes chained conflicts downward", () => {
    const result = resolvePlacement(
      "a",
      { x: 0, y: 0, w: 2, h: 2 },
      {
        b: { x: 0, y: 1, w: 2, h: 2 },
        c: { x: 0, y: 3, w: 2, h: 2 },
      },
      12,
      true,
    );
    expect(result.accepted).toBe(true);
    expect(result.moved.b?.y).toBe(2);
    expect(result.moved.c?.y).toBe(4);
  });

  it("compacts widgets without introducing collisions", () => {
    const result = compactLayouts({
      a: { x: 0, y: 5, w: 2, h: 2 },
      b: { x: 0, y: 8, w: 2, h: 2 },
    });
    expect(result.a?.y).toBe(0);
    expect(result.b?.y).toBe(2);
  });
});
