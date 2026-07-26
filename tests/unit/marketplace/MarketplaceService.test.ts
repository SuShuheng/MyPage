import { describe, expect, it, vi } from "vitest";
import { MarketplaceService } from "../../../src/marketplace/MarketplaceService";
import { createDefaultSettings } from "../../../src/persistence/default-settings";
import type { SettingsStore } from "../../../src/persistence/SettingsStore";
import type { GithubMarketClient } from "../../../src/marketplace/GithubMarketClient";
import type { ModuleInstaller } from "../../../src/modules/ModuleInstaller";

describe("MarketplaceService detection policy", () => {
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
