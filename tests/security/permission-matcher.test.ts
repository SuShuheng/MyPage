import { describe, expect, it } from "vitest";
import { domainMatches, pathWithin } from "../../src/permissions/PermissionMatcher";

describe("permission bypass resistance", () => {
  it("rejects domain suffix and userinfo tricks", () => {
    expect(domainMatches("https://example.com.evil.test", "https://example.com")).toBe(false);
    expect(domainMatches("https://example.com@evil.test", "https://example.com")).toBe(false);
  });

  it("rejects sibling directory prefixes", () => {
    expect(pathWithin("Allowed-Evil/file.md", "Allowed")).toBe(false);
  });

  it("rejects dot-segment traversal and handles Windows path casing", () => {
    expect(pathWithin("C:/Allowed/../secret.txt", "C:/Allowed")).toBe(false);
    expect(pathWithin("c:/allowed/post.md", "C:/Allowed")).toBe(true);
  });
});
