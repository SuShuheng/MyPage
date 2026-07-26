import { describe, expect, it, vi } from "vitest";
import marketIndex from "../../../.mypage-market/index.json";
import marketManifest from "../../../.mypage-market/manifest.json";
import { GithubMarketClient } from "../../../src/marketplace/GithubMarketClient";
import type { WorkerCoordinator } from "../../../src/workers/WorkerCoordinator";

describe("GithubMarketClient", () => {
  it("loads the forced indexes through the injected request bridge and the HEAD ref", async () => {
    const nativeFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("Failed to fetch"));
    const request = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/.mypage-market/manifest.json")) {
        return jsonResponse(marketManifest);
      }
      if (url.endsWith("/.mypage-market/index.json")) {
        return jsonResponse(marketIndex, { ETag: "\"market-v1\"" });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    const workers = {
      run: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
    } as unknown as WorkerCoordinator;
    const client = new GithubMarketClient(workers, request);

    const loaded = await client.fetch("SuShuHeng/MyPage");

    expect(loaded).toMatchObject({
      index: { repository: "SuShuHeng/MyPage" },
      etag: "\"market-v1\"",
    });
    expect(request.mock.calls.map(([input]) => String(input))).toEqual([
      "https://raw.githubusercontent.com/SuShuHeng/MyPage/HEAD/.mypage-market/manifest.json",
      "https://raw.githubusercontent.com/SuShuHeng/MyPage/HEAD/.mypage-market/index.json",
    ]);
    expect(nativeFetch).not.toHaveBeenCalled();
  });

  it("loads an official immutable index from the matching release", async () => {
    const request = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/module-market-manifest.json")) {
        return jsonResponse(marketManifest);
      }
      if (url.endsWith("/module-market-index.json")) {
        return jsonResponse(marketIndex);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    const workers = {
      run: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
    } as unknown as WorkerCoordinator;
    const client = new GithubMarketClient(workers, request);

    await client.fetchRelease("SuShuHeng/MyPage", "1.0.0");

    expect(request.mock.calls.map(([input]) => String(input))).toEqual([
      "https://github.com/SuShuHeng/MyPage/releases/download/1.0.0/module-market-manifest.json",
      "https://github.com/SuShuHeng/MyPage/releases/download/1.0.0/module-market-index.json",
    ]);
  });
});

function jsonResponse(
  value: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
