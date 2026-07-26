import type { LoadedMarketplace } from "./market-types";
import {
  marketValidationErrors,
  validateMarketIndex,
  validateMarketManifest,
} from "./market-schema";
import type { WorkerCoordinator } from "../workers/WorkerCoordinator";
import { fetchGithub } from "../core/github-fetch";

export class GithubMarketClient {
  public constructor(private readonly workers: WorkerCoordinator) {}

  public async fetch(
    repository: string,
    cachedEtag?: string,
    signal?: AbortSignal,
  ): Promise<LoadedMarketplace | { notModified: true }> {
    const repo = normalizeRepository(repository);
    const branch = await defaultBranch(repo, signal);
    const manifestUrl = rawUrl(repo, branch, ".mypage-market/manifest.json");
    const indexUrl = rawUrl(repo, branch, ".mypage-market/index.json");
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (cachedEtag) headers["If-None-Match"] = cachedEtag;
    const [manifestResponse, indexResponse] = await Promise.all([
      fetchGithub(manifestUrl, {
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: signal ?? null,
      }),
      fetchGithub(indexUrl, { headers, signal: signal ?? null }),
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
    const response = await fetchGithub(parsed, {
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

async function defaultBranch(
  repository: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetchGithub(
    `https://api.github.com/repos/${repository}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: signal ?? null,
    },
  );
  if (!response.ok) throw new Error(`无法读取市场仓库信息：HTTP ${response.status}`);
  const value = JSON.parse(await readLimitedText(response)) as unknown;
  if (
    typeof value !== "object" ||
    value === null ||
    !("default_branch" in value) ||
    typeof value.default_branch !== "string"
  ) {
    throw new Error("GitHub 仓库未返回 default_branch。");
  }
  return value.default_branch;
}

async function readLimitedText(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 5 * 1024 * 1024) throw new Error("市场索引超过 5 MiB。");
  const text = await response.text();
  if (text.length > 5 * 1024 * 1024) throw new Error("市场索引超过 5 MiB。");
  return text;
}
