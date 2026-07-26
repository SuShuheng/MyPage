import type { ThemeTokens } from "../persistence/settings-types";

export const THEME_CSS_VARIABLES: Record<keyof ThemeTokens, string> = {
  background: "--mypage-background",
  cardBackground: "--mypage-card-background",
  text: "--mypage-text",
  mutedText: "--mypage-muted-text",
  accent: "--mypage-accent",
  border: "--mypage-border",
  radius: "--mypage-radius",
  shadow: "--mypage-shadow",
  opacity: "--mypage-opacity",
  blur: "--mypage-blur",
  gap: "--mypage-gap",
  palette: "--mypage-palette",
};
