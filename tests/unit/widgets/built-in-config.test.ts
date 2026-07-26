import { describe, expect, it } from "vitest";
import { BUILT_IN_WIDGETS } from "../../../src/dashboard/ComponentGallery";

describe("built-in widget content defaults", () => {
  it("provides editable write and visualization settings", () => {
    const byId = Object.fromEntries(
      BUILT_IN_WIDGETS.map((definition) => [definition.id, definition]),
    );
    expect(byId["markdown-actions"]?.defaultConfig.pathTemplate).toBe(
      "MyPage/{date}.md",
    );
    expect(byId.tasks?.defaultConfig.taskPath).toBe("MyPage/TODO.md");
    expect(byId.heatmap?.defaultConfig.startDate).toEqual(expect.any(String));
    expect(byId.heatmap?.defaultConfig.endDate).toEqual(expect.any(String));
    expect(byId.goals?.defaultConfig.target).toBeGreaterThan(0);
    expect(byId.goals?.defaultConfig.targetDate).toEqual(expect.any(String));
  });
});
