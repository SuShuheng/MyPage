import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultSettings,
  DEFAULT_THEME_TOKENS,
} from "../../../src/persistence/default-settings";
import {
  resolveSandboxTokens,
  ThemeService,
} from "../../../src/theme/ThemeService";
import { OFFICIAL_THEMES } from "../../../src/theme/official-themes";

describe("ThemeService sandbox bridge", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("style");
    document.body.classList.remove("theme-dark", "theme-light");
  });

  it("resolves Obsidian CSS variables to concrete iframe-safe colors", () => {
    document.documentElement.style.setProperty("--background-primary", "#101010");
    document.documentElement.style.setProperty(
      "--background-primary-alt",
      "#202020",
    );
    document.documentElement.style.setProperty("--text-normal", "#f8f8f8");
    document.documentElement.style.setProperty("--text-muted", "#a0a0a0");
    document.documentElement.style.setProperty("--interactive-accent", "#7c3aed");
    document.documentElement.style.setProperty(
      "--background-modifier-border",
      "#454545",
    );
    document.documentElement.style.setProperty("--color-green", "#22c55e");
    document.documentElement.style.setProperty("--color-orange", "#f97316");
    document.documentElement.style.setProperty("--color-purple", "#a855f7");
    document.documentElement.style.setProperty("--color-cyan", "#06b6d4");
    document.documentElement.style.setProperty("--color-red", "#ef4444");

    const result = resolveSandboxTokens(DEFAULT_THEME_TOKENS);
    expect(result).toMatchObject({
      background: "#101010",
      cardBackground: "#202020",
      text: "#f8f8f8",
      mutedText: "#a0a0a0",
      accent: "#7c3aed",
      border: "#454545",
    });
    expect(String(result.palette)).not.toContain("var(");
  });

  it("selects the matching light and dark subtheme in real time", () => {
    const service = new ThemeService();
    const settings = createDefaultSettings();
    const theme = structuredClone(OFFICIAL_THEMES[0]!);
    settings.themeProfiles[theme.id] = theme;
    const dashboard = settings.dashboards["dashboard-home"]!;
    dashboard.themeProfileId = theme.id;
    document.body.classList.add("theme-light");
    const light = service.dashboardStyle(settings, dashboard);
    document.body.classList.replace("theme-light", "theme-dark");
    const dark = service.dashboardStyle(settings, dashboard);
    expect(light["--mypage-background"]).not.toBe(
      dark["--mypage-background"],
    );
    expect(light["--mypage-accent"]).not.toBe(dark["--mypage-accent"]);
  });
});
