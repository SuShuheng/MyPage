import type {
  Dashboard,
  MyPageSettings,
  ThemeTokens,
  WidgetAppearance,
} from "../persistence/settings-types";
import { DEFAULT_THEME_TOKENS } from "../persistence/default-settings";
import { THEME_CSS_VARIABLES } from "./theme-tokens";

export class ThemeService {
  public dashboardStyle(
    settings: MyPageSettings,
    dashboard: Dashboard,
  ): Record<string, string | number> {
    const profile = dashboard.themeProfileId
      ? settings.themeProfiles[dashboard.themeProfileId]
      : undefined;
    return toCssProperties({
      ...DEFAULT_THEME_TOKENS,
      ...(profile?.tokens ?? {}),
    });
  }

  public widgetStyle(
    appearance: WidgetAppearance,
  ): Record<string, string | number> {
    return {
      ...toCssProperties(appearance.themeOverrides ?? {}),
      "--mypage-widget-background-visible": appearance.showBackground ? 1 : 0,
      "--mypage-widget-border-visible": appearance.showBorder ? 1 : 0,
    };
  }

  public sandboxTokens(
    settings: MyPageSettings,
    dashboard: Dashboard,
    appearance: WidgetAppearance,
  ): Record<string, string | number> {
    const profile = dashboard.themeProfileId
      ? settings.themeProfiles[dashboard.themeProfileId]
      : undefined;
    const tokens: ThemeTokens = {
      ...DEFAULT_THEME_TOKENS,
      ...(profile?.tokens ?? {}),
      ...(appearance.themeOverrides ?? {}),
    };
    return {
      ...tokens,
      mode: profile?.mode ?? "obsidian",
      palette: tokens.palette.join(","),
      widgetBackgroundVisible: appearance.showBackground ? 1 : 0,
      widgetBorderVisible: appearance.showBorder ? 1 : 0,
    };
  }
}

function toCssProperties(
  tokens: Partial<ThemeTokens>,
): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(tokens) as Array<
    [keyof ThemeTokens, ThemeTokens[keyof ThemeTokens]]
  >) {
    const variable = THEME_CSS_VARIABLES[key];
    if (key === "palette" && Array.isArray(value)) {
      result[variable] = value.join(",");
    } else if (["radius", "blur", "gap"].includes(key) && typeof value === "number") {
      result[variable] = `${value}px`;
    } else if (typeof value === "string" || typeof value === "number") {
      result[variable] = value;
    }
  }
  return result;
}
