import { cleanup, render } from "@testing-library/preact";
import { h } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalWidget } from "../../../src/widgets/goals/GoalWidget";
import {
  createDefaultSettings,
  DEFAULT_DATA_BINDING,
} from "../../../src/persistence/default-settings";
import type { QueryResult } from "../../../src/data/data-types";

describe("GoalWidget", () => {
  afterEach(() => cleanup());

  it("renders a partial progress arc based on the configured target", async () => {
    const records = Array.from({ length: 15 }, (_, index) => ({
      id: String(index),
      sourceId: "core.vault-files",
      type: "file",
      fields: {},
    }));
    const dataEngine = {
      subscribe: vi.fn(
        (_binding: unknown, listener: (result: QueryResult) => void) => {
          listener({
            records,
            fingerprint: "goal",
            computedAt: 1,
            durationMs: 1,
            cacheHit: false,
          });
          return vi.fn();
        },
      ),
    };
    const widget = createDefaultSettings().widgetInstances["widget-total-notes"]!;
    widget.contributionId = "goals";
    widget.config = { target: 30, targetDate: "2026-12-31" };

    const view = render(
      h(GoalWidget, {
        app: {} as never,
        actions: {} as never,
        dataEngine: dataEngine as never,
        widget,
        binding: structuredClone(DEFAULT_DATA_BINDING),
        editing: false,
      }),
    );

    expect(await view.findByText("50%")).toBeTruthy();
    expect(
      (
        view.container.querySelector(
          ".mypage-progress-ring .value",
        ) as SVGCircleElement
      ).style.strokeDashoffset,
    ).toBe("50");
  });
});
