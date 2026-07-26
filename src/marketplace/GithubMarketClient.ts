import type { LoadedMarketplace } from "./market-types";
import {
  marketValidationErrors,
  validateMarketIndex,
  validateMarketManifest,
} from "./market-schema";
import type { WorkerCoordinator } from "../workers/WorkerCoordinator";
import {
  fetchGithub,
  type GithubRequest,
} from "../core/github-fetch";

export class GithubMarketClient {
  public constructor(
    private readonly workers: WorkerCoordinator,
    private readonly request: GithubRequest = fetchGithub,
  ) {}

  public async fetch(
    repository: string,
    cachedEtag?: string,
    signal?: AbortSignal,
  ): Promise<LoadedMarketplace | { notModified: true }> {
    const repo = normalizeRepository(repository);
    return this.fetchFromUrls(
      repo,
      rawUrl(repo, "HEAD", ".mypage-market/manifest.json"),
      rawUrl(repo, "HEAD", ".mypage-market/index.json"),
      cachedEtag,
      signal,
    );
  }

  public async fetchRelease(
    repository: string,
    releaseTag: string,
    cachedEtag?: string,
    signal?: AbortSignal,
  ): Promise<LoadedMarketplace | { notModified: true }> {
    const repo = normalizeRepository(repository);
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(releaseTag)) {
      throw new Error("官方市场 Release Tag 不是 SemVer。");
    }
    const releaseRoot =
      `https://github.com/${repo}/releases/download/${encodeURIComponent(releaseTag)}`;
    return this.fetchFromUrls(
      repo,
      `${releaseRoot}/module-market-manifest.json`,
      `${releaseRoot}/module-market-index.json`,
      cachedEtag,
      signal,
    );
  }

  private async fetchFromUrls(
    repo: string,
    manifestUrl: string,
    indexUrl: string,
    cachedEtag?: string,
    signal?: AbortSignal,
  ): Promise<LoadedMarketplace | { notModified: true }> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (cachedEtag) headers["If-None-Match"] = cachedEtag;
    const [manifestResponse, indexResponse] = await Promise.all([
      this.request(manifestUrl, {
        headers: { Accept: "application/json" },
        signal: signal ?? null,
      }),
      this.request(indexUrl, { headers, signal: signal ?? null }),
    ]);
    if (indexResponse.status === 304) return { notModified: true };
    if (!manifestResponse.ok) {
      throw new Error(`无法读取市场 manifest：HTTP ${manifestResponse.status}`);
    }
    if (!indexResponse.ok) {
      throw new Error(`无法读取强制市场索引：HTTP ${indexResponse.status}`);
    }
    const [manifestText, indexText] = await Promise.all([
      readLimitedText(manifestResponse),
      readLimitedText(indexResponse),
    ]);
    const manifest = JSON.parse(manifestText) as unknown;
    const index = JSON.parse(indexText) as unknown;
    const workerValidation = await this.workers.run("market-parse", { value: index });
    if (
      !validateMarketManifest(manifest) ||
      !validateMarketIndex(index) ||
      !workerValidation.valid
    ) {
      throw new Error(
        `市场索引无效：${[...marketValidationErrors(), ...workerValidation.errors].join("; ")}`,
      );
    }
    if (manifest.repository !== repo || index.repository !== repo) {
      throw new Error("市场声明的 repository 与用户添加的仓库不一致。");
    }
    const result: LoadedMarketplace = {
      manifest,
      index,
      fetchedAt: Date.now(),
    };
    const etag = indexResponse.headers.get("etag");
    if (etag) result.etag = etag;
    return result;
  }

  public async download(
    url: string,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("模块下载必须使用 HTTPS。");
    const response = await this.request(parsed, {
      signal: signal ?? null,
    });
    if (!response.ok) throw new Error(`模块下载失败：HTTP ${response.status}`);
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > 30 * 1024 * 1024) throw new Error("模块包超过 30 MiB。");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 30 * 1024 * 1024) throw new Error("模块包超过 30 MiB。");
    return bytes;
  }
}

export function normalizeRepository(repository: string): string {
  const match = repository
    .trim()
    .replace(/^https:\/\/github\.com\//u, "")
    .replace(/\.git$/u, "")
    .match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/u);
  if (!match) throw new Error("GitHub 市场地址必须使用公开的 owner/repo 格式。");
  return `${match[1]}/${match[2]}`;
}

function rawUrl(repository: string, branch: string, path: string): string {
  return `https://raw.githubusercontent.com/${repository}/${encodeURIComponent(branch)}/${path}`;
}

async function readLimitedText(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 5 * 1024 * 1024) throw new Error("市场索引超过 5 MiB。");
  const text = await response.text();
  if (text.length > 5 * 1024 * 1024) throw new Error("市场索引超过 5 MiB。");
  return text;
}
