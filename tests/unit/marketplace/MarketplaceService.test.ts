import { describe, expect, it, vi } from "vitest";
import { MarketplaceService } from "../../../src/marketplace/MarketplaceService";
import { createDefaultSettings } from "../../../src/persistence/default-settings";
import type { SettingsStore } from "../../../src/persistence/SettingsStore";
import type { GithubMarketClient } from "../../../src/marketplace/GithubMarketClient";
import type { ModuleInstaller } from "../../../src/modules/ModuleInstaller";
import manifestJson from "../../../manifest.json";

describe("MarketplaceService detection policy", () => {
  it("uses the immutable release snapshot when the official repo is added manually", async () => {
    const settings = createDefaultSettings();
    const store = {
      snapshot: settings,
      update: vi.fn(async (mutate: (draft: typeof settings) => void) => {
        mutate(settings);
      }),
    };
    const loaded = {
      manifest: {
        schemaVersion: 1 as const,
        id: "mypage-official",
        name: "Official",
        repository: "SuShuHeng/MyPage",
        index: ".mypage-market/index.json" as const,
      },
      index: {
        schemaVersion: 1 as const,
        generatedAt: "2026-01-01T00:00:00Z",
        repository: "SuShuHeng/MyPage",
        modules: [],
      },
      fetchedAt: 1,
    };
    const fetch = vi.fn();
    const fetchRelease = vi.fn().mockResolvedValue(loaded);
    const service = new MarketplaceService(
      store as unknown as SettingsStore,
      { fetch, fetchRelease } as unknown as GithubMarketClient,
      {} as ModuleInstaller,
    );

    const sourceId = await service.addThirdParty("SuShuHeng/MyPage");

    expect(sourceId).toBe("third-party:sushuheng/mypage");
    expect(fetchRelease).toHaveBeenCalledWith(
      "SuShuHeng/MyPage",
      manifestJson.version,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never auto-checks a third-party market", async () => {
    const settings = createDefaultSettings();
    settings.markets.third = {
      id: "third",
      repo: "someone/market",
      type: "third-party",
      enabled: true,
      cachedIndex: {
        fetchedAt: 1,
        index: {
          schemaVersion: 1,
          generatedAt: "2026-01-01T00:00:00Z",
          repository: "someone/market",
          modules: [],
        },
      },
    };
    const fetch = vi.fn();
    const service = new MarketplaceService(
      { snapshot: settings } as unknown as SettingsStore,
      { fetch } as unknown as GithubMarketClient,
      {} as ModuleInstaller,
    );
    const index = await service.check("third", "official-page-open");
    expect(index.repository).toBe("someone/market");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to the bundled trusted index when the official repo is unavailable", async () => {
    const settings = createDefaultSettings();
    const store = {
      snapshot: settings,
      update: vi.fn(async (mutate: (draft: typeof settings) => void) => {
        mutate(settings);
      }),
    };
    const service = new MarketplaceService(
      store as unknown as SettingsStore,
      {
        fetch: vi.fn().mockRejectedValue(new Error("HTTP 404")),
      } as unknown as GithubMarketClient,
      {} as ModuleInstaller,
    );

    const index = await service.check("official", "official-page-open");
    expect(index.repository).toBe("SuShuHeng/MyPage");
    expect(index.modules.map((module) => module.id)).toEqual(
      expect.arrayContaining([
        "calendar-widget",
        "focus-timer",
        "hexo-insights",
        "weather-widget",
      ]),
    );
    expect(index.modules.map((module) => module.id)).not.toContain(
      "hello-widget",
    );
    expect(settings.markets.official?.cachedIndex?.index).toEqual(index);
  });
});
