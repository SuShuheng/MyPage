import { describe, expect, it } from "vitest";
import {
  domainMatches,
  pathWithin,
  scopeMatches,
} from "../../../src/permissions/PermissionMatcher";

describe("PermissionMatcher", () => {
  it("matches path boundaries without prefix confusion", () => {
    expect(pathWithin("Projects/a.md", "Projects")).toBe(true);
    expect(pathWithin("Projects-private/a.md", "Projects")).toBe(false);
    expect(pathWithin("../Projects/a.md", "Projects")).toBe(false);
  });

  it("matches exact scheme, hostname, and effective port", () => {
    expect(domainMatches("https://api.example.com/a", "https://api.example.com")).toBe(true);
    expect(domainMatches("https://evil.api.example.com", "https://api.example.com")).toBe(false);
    expect(domainMatches("http://api.example.com", "https://api.example.com")).toBe(false);
    expect(domainMatches("https://api.example.com:444", "https://api.example.com")).toBe(false);
  });

  it("requires every populated request dimension to match", () => {
    expect(
      scopeMatches(
        { paths: ["Projects"], domains: ["https://example.com"] },
        { path: "Projects/a.md", domain: "https://example.com/data" },
      ),
    ).toBe(true);
    expect(
      scopeMatches(
        { paths: ["Projects"], domains: ["https://example.com"] },
        { path: "Private/a.md", domain: "https://example.com/data" },
      ),
    ).toBe(false);
  });
});
