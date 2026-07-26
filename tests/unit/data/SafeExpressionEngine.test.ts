import { describe, expect, it } from "vitest";
import { SafeExpressionEngine } from "../../../src/data/SafeExpressionEngine";

describe("SafeExpressionEngine", () => {
  const engine = new SafeExpressionEngine();

  it("evaluates arithmetic, comparisons, paths, and approved functions", () => {
    expect(engine.evaluate("round(frontmatter.words / 3, 1)", {
      frontmatter: { words: 10 },
    })).toBe(3.3);
    expect(engine.evaluate("lower(name) == 'hello'", { name: "HELLO" })).toBe(true);
  });

  it("does not expose JavaScript syntax or arbitrary functions", () => {
    expect(() => engine.evaluate("globalThis.fetch('x')", {})).toThrow();
    expect(() => engine.evaluate("constructor.constructor('return 1')()", {})).toThrow();
    expect(() => engine.evaluate("unknownFn(1)", {})).toThrow(/not allowed/);
  });

  it("limits expression length and rejects division by zero", () => {
    expect(() => engine.evaluate("1 / 0", {})).toThrow(/Division by zero/);
    expect(() => engine.evaluate("1".repeat(1_001), {})).toThrow(/1,000/);
  });
});
