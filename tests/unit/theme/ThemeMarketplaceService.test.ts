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

  it("loads a third-party index through the injected request bridge and the HEAD ref", async () => {
    const nativeFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("Failed to fetch"));
    const settings = createDefaultSettings();
    const store = {
      snapshot: settings,
      update: vi.fn(async (mutate: (draft: typeof settings) => void) => {
        mutate(settings);
      }),
    };
    const workers = {
      run: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
    };
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(officialIndex), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const service = new ThemeMarketplaceService(
      store as unknown as SettingsStore,
      workers as unknown as WorkerCoordinator,
      request,
    );

    const sourceId = await service.addThirdParty("SuShuHeng/MyPage");

    expect(sourceId).toBe("theme:sushuheng/mypage");
    expect(request).toHaveBeenCalledOnce();
    expect(String(request.mock.calls[0]?.[0])).toBe(
      "https://raw.githubusercontent.com/SuShuHeng/MyPage/HEAD/.mypage-theme-market/index.json",
    );
    expect(nativeFetch).not.toHaveBeenCalled();
  });
});
