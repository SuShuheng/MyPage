import { describe, expect, it } from "vitest";
import {
  DEFAULT_DASHBOARD_HEADER,
  resolveDashboardHeader,
} from "../../../src/dashboard/DashboardHeaderModal";
import { createDefaultSettings } from "../../../src/persistence/default-settings";

describe("dashboard header configuration", () => {
  it("resolves the persisted header configuration", () => {
    const dashboard = createDefaultSettings().dashboards["dashboard-home"]!;
    dashboard.header = {
      title: "博客主页",
      subtitle: "持续创作",
      titleFontSize: 44,
      subtitleFontSize: 15,
      showSummary: false,
    };
    expect(resolveDashboardHeader(dashboard)).toEqual(dashboard.header);
  });

  it("keeps older dashboards compatible through display defaults", () => {
    const dashboard = createDefaultSettings().dashboards["dashboard-home"]!;
    delete dashboard.header;
    dashboard.name = "旧主页";
    expect(resolveDashboardHeader(dashboard)).toEqual({
      ...DEFAULT_DASHBOARD_HEADER,
      title: "旧主页",
    });
  });
});
