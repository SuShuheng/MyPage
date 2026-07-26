import { describe, expect, it } from "vitest";
import { createDefaultSettings } from "../../../src/persistence/default-settings";
import { validateSettings } from "../../../src/persistence/settings-schema";

describe("default settings", () => {
  it("are valid, categorized, and include the official market", () => {
    const settings = createDefaultSettings();
    expect(validateSettings(settings)).toBe(true);
    expect(settings.schemaVersion).toBe(1);
    expect(settings.markets.official?.repo).toBe("SuShuHeng/MyPage");
    expect(settings.tabs.order).toEqual(["tab-home"]);
  });

  it("creates responsive layouts and independent widget scopes", () => {
    const settings = createDefaultSettings();
    const widget = settings.widgetInstances["widget-total-notes"];
    expect(widget?.layouts.desktop.w).toBe(3);
    expect(widget?.layouts.mobile.w).toBe(4);
    expect(widget?.dataBinding.scope.includeFolders).toEqual(["/"]);
  });

  it("returns a fresh graph on every call", () => {
    const first = createDefaultSettings();
    const second = createDefaultSettings();
    first.tabs.order.push("mutated");
    expect(second.tabs.order).toEqual(["tab-home"]);
  });
});
