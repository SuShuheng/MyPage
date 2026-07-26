import type { GithubRelease } from "./update-types";
import { fetchGithub } from "../core/github-fetch";

export class GithubReleaseClient {
  public constructor(private readonly repository = "SuShuHeng/MyPage") {}

  public async list(signal?: AbortSignal): Promise<GithubRelease[]> {
    const response = await fetchGithub(
      `https://api.github.com/repos/${this.repository}/releases?per_page=30`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: signal ?? null,
      },
    );
    if (!response.ok) throw new Error(`GitHub Release 检测失败：HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > 5 * 1024 * 1024) throw new Error("Release 响应超过 5 MiB。");
    const value = JSON.parse(text) as unknown;
    if (!Array.isArray(value)) throw new Error("GitHub Release 响应格式无效。");
    return value.filter(isRelease);
  }

  public async download(
    url: string,
    maximumBytes = 15 * 1024 * 1024,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("更新资产必须使用 HTTPS。");
    const response = await fetchGithub(parsed, {
      signal: signal ?? null,
    });
    if (!response.ok) throw new Error(`更新资产下载失败：HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) throw new Error("更新资产超过大小限制。");
    return bytes;
  }
}

function isRelease(value: unknown): value is GithubRelease {
  if (!isRecord(value)) return false;
  return (
    typeof value.tag_name === "string" &&
    (typeof value.name === "string" || value.name === null) &&
    (typeof value.body === "string" || value.body === null) &&
    typeof value.html_url === "string" &&
    typeof value.prerelease === "boolean" &&
    typeof value.draft === "boolean" &&
    typeof value.published_at === "string" &&
    Array.isArray(value.assets) &&
    value.assets.every(isAsset)
  );
}

function isAsset(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.browser_download_url === "string" &&
    typeof value.size === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
