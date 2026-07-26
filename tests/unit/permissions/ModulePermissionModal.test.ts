import { describe, expect, it } from "vitest";
import { validateScopeEntries } from "../../../src/permissions/ModulePermissionModal";

describe("module permission scope validation", () => {
  it("requires absolute paths for external filesystem and Git capabilities", () => {
    expect(validateScopeEntries("externalFs.read", ["05 博客"])).toMatch(
      /绝对路径/,
    );
    expect(
      validateScopeEntries("git.read", ["H:\\GitHub\\myblog"]),
    ).toBeUndefined();
  });

  it("rejects empty and malformed network scopes", () => {
    expect(validateScopeEntries("network.request", [])).toMatch(/不能为空/);
    expect(validateScopeEntries("network.request", ["https://"])).toMatch(
      /格式无效/,
    );
    expect(
      validateScopeEntries("network.request", ["api.example.com"]),
    ).toBeUndefined();
  });
});
