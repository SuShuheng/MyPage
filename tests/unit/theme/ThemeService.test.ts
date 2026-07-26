import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_THEME_TOKENS } from "../../../src/persistence/default-settings";
import { resolveSandboxTokens } from "../../../src/theme/ThemeService";

describe("ThemeService sandbox bridge", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("style");
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
});
