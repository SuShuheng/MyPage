import { describe, expect, it } from "vitest";
import { createDefaultSettings } from "../../../src/persistence/default-settings";
import {
  getSettingsValidationErrors,
  validateSettings,
} from "../../../src/persistence/settings-schema";

describe("settings schema and graph invariants", () => {
  it("rejects incomplete categorized configuration", () => {
    const settings = createDefaultSettings() as unknown as Record<string, unknown>;
    settings.general = { openOnStartup: true };
    expect(validateSettings(settings)).toBe(false);
    expect(getSettingsValidationErrors().join(" ")).toMatch(/deviceId|general/);
  });

  it("rejects dangling tab and widget references", () => {
    const settings = createDefaultSettings();
    settings.tabs.defaultTabId = "missing";
    settings.dashboards["dashboard-home"]?.widgetIds.push("missing-widget");
    expect(validateSettings(settings)).toBe(false);
    expect(getSettingsValidationErrors()).toEqual(
      expect.arrayContaining([
        expect.stringContaining("unknown tab missing"),
        expect.stringContaining("invalid missing-widget"),
      ]),
    );
  });

  it("accepts older dashboards without header settings", () => {
    const settings = createDefaultSettings();
    delete settings.dashboards["dashboard-home"]?.header;
    expect(validateSettings(settings)).toBe(true);
  });

  it("rejects header font sizes outside the supported range", () => {
    const settings = createDefaultSettings();
    const header = settings.dashboards["dashboard-home"]?.header;
    if (!header) throw new Error("Default dashboard header is missing.");
    header.titleFontSize = 100;
    expect(validateSettings(settings)).toBe(false);
  });
});
