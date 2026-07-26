import { describe, expect, it } from "vitest";
import { selectUpdate } from "../../../src/updater/UpdateChannel";
import type { GithubRelease } from "../../../src/updater/update-types";

function release(version: string, prerelease = false): GithubRelease {
  return {
    tag_name: version,
    name: version,
    body: "",
    html_url: `https://example.com/${version}`,
    prerelease,
    draft: false,
    published_at: "2026-01-01T00:00:00Z",
    assets: [],
  };
}

describe("UpdateChannel", () => {
  it("keeps stable users away from prereleases", () => {
    const update = selectUpdate(
      [release("1.1.0-beta.1", true), release("1.0.1")],
      "1.0.0",
      "stable",
      [],
    );
    expect(update?.version).toBe("1.0.1");
  });

  it("allows preview users to select beta and honors ignored versions", () => {
    const update = selectUpdate(
      [release("1.1.0-beta.1", true), release("1.0.1")],
      "1.0.0",
      "preview",
      ["1.0.1"],
    );
    expect(update?.version).toBe("1.1.0-beta.1");
  });
});
