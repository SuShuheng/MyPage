import { requestUrl } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { requestGithubWithObsidian } from "../../../src/app/ObsidianGithubRequest";

describe("requestGithubWithObsidian", () => {
  it("uses Obsidian requestUrl instead of renderer fetch", async () => {
    const nativeFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("Failed to fetch"));
    vi.mocked(requestUrl).mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/octet-stream" },
      arrayBuffer: new TextEncoder().encode("module archive").buffer,
      json: null,
      text: "module archive",
    });

    const response = await requestGithubWithObsidian(
      "https://github.com/SuShuHeng/MyPage/releases/download/1.0.0/module.zip",
      { headers: { Accept: "application/zip" } },
    );

    expect(requestUrl).toHaveBeenCalledWith({
      url: "https://github.com/SuShuHeng/MyPage/releases/download/1.0.0/module.zip",
      method: "GET",
      headers: { Accept: "application/zip" },
      throw: false,
    });
    expect(await response.text()).toBe("module archive");
    expect(nativeFetch).not.toHaveBeenCalled();
  });

  it("keeps the GitHub host allowlist in front of the Obsidian bridge", async () => {
    await expect(
      requestGithubWithObsidian("https://example.com/module.zip"),
    ).rejects.toThrow("不允许的 GitHub 资源地址");
    expect(requestUrl).not.toHaveBeenCalled();
  });
});
