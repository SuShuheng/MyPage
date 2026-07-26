import { describe, expect, it, vi } from "vitest";
import { GithubReleaseClient } from "../../../src/updater/GithubReleaseClient";

const RELEASE_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>MyPage 1.1.0</title>
    <link rel="alternate" type="text/html"
      href="https://github.com/SuShuHeng/MyPage/releases/tag/1.1.0"/>
    <id>tag:github.com,2008:Repository/1/1.1.0</id>
    <updated>2026-07-26T12:00:00Z</updated>
    <content type="html">修复市场网络请求。</content>
  </entry>
</feed>`;

describe("GithubReleaseClient", () => {
  it("falls back to the public release feed when the REST API is rate limited", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 403 }))
      .mockResolvedValueOnce(
        new Response(RELEASE_FEED, {
          status: 200,
          headers: { "Content-Type": "application/atom+xml" },
        }),
      );
    const client = new GithubReleaseClient("SuShuHeng/MyPage", request);

    const releases = await client.list();

    expect(request.mock.calls.map(([input]) => String(input))).toEqual([
      "https://api.github.com/repos/SuShuHeng/MyPage/releases?per_page=30",
      "https://github.com/SuShuHeng/MyPage/releases.atom",
    ]);
    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({
      tag_name: "1.1.0",
      prerelease: false,
      draft: false,
      html_url: "https://github.com/SuShuHeng/MyPage/releases/tag/1.1.0",
    });
    expect(releases[0]?.assets.map((asset) => asset.name)).toEqual([
      "SHA256SUMS",
      "main.js",
      "manifest.json",
      "styles.css",
    ]);
  });
});
