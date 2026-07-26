import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("Module sandbox source", () => {
  const source = readFileSync(
    path.resolve(process.cwd(), "src/modules/ModuleSandbox.ts"),
    "utf8",
  );

  it("uses allow-scripts without allow-same-origin", () => {
    expect(source).toContain('setAttribute("sandbox", "allow-scripts")');
    expect(source).not.toMatch(/allow-same-origin/u);
  });

  it("does not use eval or Function constructors", () => {
    expect(source).not.toMatch(/\beval\s*\(/u);
    expect(source).not.toMatch(/\bnew\s+Function\b/u);
  });

  it("locks network access in the iframe CSP", () => {
    expect(source).toContain("connect-src 'none'");
    expect(source).toContain("default-src 'none'");
  });
});
