import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("Module sandbox source", () => {
  const source = readFileSync(
    path.resolve(process.cwd(), "src/modules/ModuleSandbox.ts"),
    "utf8",
  );

  it("uses an opaque data document with a script-only sandbox bridge", () => {
    expect(source).toContain('"allow-scripts allow-same-origin"');
    expect(source).toContain("data:text/html;base64,");
    expect(source).not.toContain("allow-top-navigation");
    expect(source).not.toContain("allow-popups");
  });

  it("does not use eval or Function constructors", () => {
    expect(source).not.toMatch(/\beval\s*\(/u);
    expect(source).not.toMatch(/\bnew\s+Function\b/u);
  });

  it("locks network access in the iframe CSP", () => {
    expect(source).toContain("connect-src 'none'");
    expect(source).toContain("default-src 'none'");
  });

  it("exposes host-controlled refresh subscriptions", () => {
    expect(source).toContain("onRefresh(listener)");
    expect(source).toContain('event.data.type === "refresh"');
  });
});
