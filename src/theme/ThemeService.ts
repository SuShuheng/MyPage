import type {
  Dashboard,
  MyPageSettings,
  ThemeTokens,
  WidgetAppearance,
  ThemeProfile,
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
    const tokens = this.resolveProfileTokens(profile);
    const style = toCssProperties({
      ...DEFAULT_THEME_TOKENS,
      ...tokens,
    });
    if (profile?.fontFamily) {
      style["--mypage-font-family"] = profile.fontFamily;
    }
    const motionScale = profile?.motionScale ?? 1;
    style["--mypage-motion-scale"] = motionScale;
    style["--mypage-transition"] = `${Math.max(0, Math.round(180 * motionScale))}ms ease-out`;
    if (profile?.backgroundImage) {
      style.backgroundImage = normalizeBackgroundImage(profile.backgroundImage);
      style.backgroundSize =
        profile.backgroundFit === "stretch"
          ? "100% 100%"
          : profile.backgroundFit ?? "cover";
      style.backgroundPosition = profile.backgroundPosition ?? "center";
      style.backgroundRepeat = profile.backgroundRepeat ?? "no-repeat";
      style.backgroundAttachment = profile.backgroundAttachment ?? "fixed";
    }
    style["--mypage-page-padding"] = `${profile?.pagePadding ?? 18}px`;
    style["--mypage-content-max-width"] =
      profile?.maxContentWidth && profile.maxContentWidth > 0
        ? `${profile.maxContentWidth}px`
        : "none";
    style["--mypage-font-scale"] = profile?.fontScale ?? 1;
    style["--mypage-background-overlay"] = profile?.backgroundOverlay ?? "transparent";
    style["--mypage-background-overlay-opacity"] =
      profile?.backgroundOverlayOpacity ?? 0;
    return style;
  }

  public widgetStyle(
    appearance: WidgetAppearance,
  ): Record<string, string | number> {
    return {
      ...toCssProperties(appearance.themeOverrides ?? {}),
      "--mypage-widget-background-visible": appearance.showBackground ? 1 : 0,
      "--mypage-widget-border-visible": appearance.showBorder ? 1 : 0,
      "--mypage-content-scale": appearance.contentScale ?? 1,
      "--mypage-icon-scale": appearance.iconScale ?? 1,
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
      ...this.resolveProfileTokens(profile),
      ...(appearance.themeOverrides ?? {}),
    };
    return {
      ...resolveSandboxTokens(tokens),
      mode: this.baseMode(),
      widgetBackgroundVisible: appearance.showBackground ? 1 : 0,
      widgetBorderVisible: appearance.showBorder ? 1 : 0,
    };
  }

  public baseMode(): "light" | "dark" {
    return document.body.classList.contains("theme-dark") ? "dark" : "light";
  }

  private resolveProfileTokens(profile?: ThemeProfile): Partial<ThemeTokens> {
    if (!profile) return {};
    const variant = profile.variants?.[this.baseMode()] ?? {};
    return { ...profile.tokens, ...variant };
  }
}

function normalizeBackgroundImage(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.startsWith("linear-gradient(") ||
    trimmed.startsWith("radial-gradient(") ||
    trimmed.startsWith("url(")
  ) {
    return trimmed;
  }
  return `url("${trimmed.replaceAll('"', '\\"')}")`;
}

export function resolveSandboxTokens(
  tokens: ThemeTokens,
  root: Element = document.documentElement,
): Record<string, string | number> {
  const style = getComputedStyle(root);
  const resolve = (value: string, fallback: string): string => {
    let current = value;
    for (let pass = 0; pass < 5 && current.includes("var("); pass += 1) {
      current = current.replace(
        /var\(\s*(--[\w-]+)(?:\s*,\s*([^)]+))?\)/gu,
        (_match, name: string, inlineFallback: string | undefined) =>
          style.getPropertyValue(name).trim() ||
          inlineFallback?.trim() ||
          fallback,
      );
    }
    return current.trim() || fallback;
  };
  return {
    background: resolve(tokens.background, "#ffffff"),
    cardBackground: resolve(tokens.cardBackground, "#f6f7f9"),
    text: resolve(tokens.text, "#1f2328"),
    mutedText: resolve(tokens.mutedText, "#667085"),
    accent: resolve(tokens.accent, "#7c3aed"),
    border: resolve(tokens.border, "rgba(127,127,127,.28)"),
    radius: tokens.radius,
    shadow: resolve(tokens.shadow, "0 10px 30px rgba(0,0,0,.08)"),
    opacity: tokens.opacity,
    blur: tokens.blur,
    gap: tokens.gap,
    palette: tokens.palette
      .map((color) => resolve(color, "#7c3aed"))
      .join(","),
  };
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
