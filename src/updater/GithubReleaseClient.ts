import { prerelease } from "semver";
import type { GithubRelease } from "./update-types";
import {
  assertGithubUrl,
  fetchGithub,
  type GithubRequest,
} from "../core/github-fetch";

export class GithubReleaseClient {
  public constructor(
    private readonly repository = "SuShuHeng/MyPage",
    private readonly request: GithubRequest = fetchGithub,
  ) {}

  public async list(signal?: AbortSignal): Promise<GithubRelease[]> {
    const response = await this.request(
      `https://api.github.com/repos/${this.repository}/releases?per_page=30`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: signal ?? null,
      },
    );
    if ([403, 429].includes(response.status)) {
      return this.listFromPublicFeed(signal);
    }
    if (!response.ok) throw new Error(`GitHub Release 检测失败：HTTP ${response.status}`);
    const text = await readLimitedText(response);
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
    const response = await this.request(parsed, {
      signal: signal ?? null,
    });
    if (!response.ok) throw new Error(`更新资产下载失败：HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) throw new Error("更新资产超过大小限制。");
    return bytes;
  }

  private async listFromPublicFeed(
    signal?: AbortSignal,
  ): Promise<GithubRelease[]> {
    const response = await this.request(
      `https://github.com/${this.repository}/releases.atom`,
      {
        headers: { Accept: "application/atom+xml" },
        signal: signal ?? null,
      },
    );
    if (!response.ok) {
      throw new Error(`GitHub Release 公共源检测失败：HTTP ${response.status}`);
    }
    return parseReleaseFeed(await readLimitedText(response), this.repository);
  }
}

export function parseReleaseFeed(
  source: string,
  repository: string,
): GithubRelease[] {
  const document = new DOMParser().parseFromString(source, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("GitHub Release 公共源格式无效。");
  }
  const expectedPath = `/${repository}/releases/tag/`;
  return Array.from(document.getElementsByTagName("entry")).flatMap(
    (entry): GithubRelease[] => {
      const link = Array.from(entry.getElementsByTagName("link")).find(
        (candidate) =>
          (candidate.getAttribute("rel") ?? "alternate") === "alternate" &&
          candidate.hasAttribute("href"),
      );
      if (!link) return [];
      const releaseUrl = assertGithubUrl(link.getAttribute("href") ?? "");
      if (
        releaseUrl.hostname !== "github.com" ||
        !releaseUrl.pathname
          .toLocaleLowerCase()
          .startsWith(expectedPath.toLocaleLowerCase())
      ) {
        return [];
      }
      const encodedTag = releaseUrl.pathname.slice(expectedPath.length);
      if (!encodedTag || encodedTag.includes("/")) return [];
      let tag: string;
      try {
        tag = decodeURIComponent(encodedTag);
      } catch {
        return [];
      }
      const title = elementText(entry, "title");
      const publishedAt =
        elementText(entry, "published") ??
        elementText(entry, "updated") ??
        new Date(0).toISOString();
      const body = elementText(entry, "content");
      return [{
        tag_name: tag,
        name: title,
        body,
        html_url: releaseUrl.href,
        prerelease: prerelease(tag) !== null,
        draft: false,
        published_at: publishedAt,
        assets: releaseAssets(repository, tag),
      }];
    },
  );
}

function elementText(parent: Element, name: string): string | null {
  return parent.getElementsByTagName(name)[0]?.textContent?.trim() || null;
}

function releaseAssets(
  repository: string,
  tag: string,
): GithubRelease["assets"] {
  const base =
    `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}`;
  return ["SHA256SUMS", "main.js", "manifest.json", "styles.css"].map(
    (name) => ({
      name,
      browser_download_url: `${base}/${name}`,
      size: 0,
    }),
  );
}

async function readLimitedText(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 5 * 1024 * 1024) throw new Error("Release 响应超过 5 MiB。");
  const text = await response.text();
  if (text.length > 5 * 1024 * 1024) throw new Error("Release 响应超过 5 MiB。");
  return text;
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
