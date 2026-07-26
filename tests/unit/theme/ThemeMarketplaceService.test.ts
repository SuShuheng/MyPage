import { describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../../../src/persistence/default-settings";
import type { SettingsStore } from "../../../src/persistence/SettingsStore";
import { ThemeMarketplaceService } from "../../../src/theme/ThemeMarketplaceService";
import type { WorkerCoordinator } from "../../../src/workers/WorkerCoordinator";
import officialIndex from "../../../.mypage-theme-market/index.json";

describe("ThemeMarketplaceService", () => {
  it("ships multiple official themes and installs one into categorized settings", async () => {
    const settings = createDefaultSettings();
    const store = {
      snapshot: settings,
      update: vi.fn(async (mutate: (draft: typeof settings) => void) => {
        mutate(settings);
      }),
    };
    const service = new ThemeMarketplaceService(
      store as unknown as SettingsStore,
      {} as WorkerCoordinator,
    );
    const themes = service.officialThemes();
    expect(themes.length).toBeGreaterThanOrEqual(4);
    expect(themes.map((theme) => theme.id)).toEqual(
      officialIndex.themes.map((theme) => theme.id),
    );

    await service.install(themes[0]!, "official");
    expect(settings.themeProfiles[themes[0]!.id]).toMatchObject({
      sourceType: "official",
      sourceId: "official",
    });
  });
});
