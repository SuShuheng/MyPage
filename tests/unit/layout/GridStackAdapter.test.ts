import { cleanup, render } from "@testing-library/preact";
import { h } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GridStackAdapter } from "../../../src/layout/GridStackAdapter";
import {
  createDefaultSettings,
  DEFAULT_GRID_OPTIONS,
} from "../../../src/persistence/default-settings";

const gridMocks = vi.hoisted(() => ({
  destroy: vi.fn(),
  init: vi.fn(),
  on: vi.fn(),
}));

vi.mock("gridstack", () => ({
  GridStack: {
    init: gridMocks.init,
  },
}));

describe("GridStackAdapter edit lifecycle", () => {
  beforeEach(() => {
    gridMocks.destroy.mockReset();
    gridMocks.init.mockReset();
    gridMocks.on.mockReset();
    gridMocks.init.mockReturnValue({
      destroy: gridMocks.destroy,
      on: gridMocks.on,
    });
  });

  afterEach(() => cleanup());

  it("allows the dedicated button handle to start dragging", () => {
    renderAdapter();
    const options = gridMocks.init.mock.calls[0]?.[0] as {
      draggable?: { cancel?: string; handle?: string };
    };
    expect(options.draggable?.handle).toBe(".mypage-drag-handle");
    expect(options.draggable?.cancel).toContain(
      "button:not(.mypage-drag-handle)",
    );
  });

  it("does not rebuild GridStack for an equivalent cloned edit snapshot", () => {
    const widgets = defaultWidgets();
    const view = render(
      h(
        GridStackAdapter,
        {
          breakpoint: "desktop",
          editing: true,
          gridOptions: structuredClone(DEFAULT_GRID_OPTIONS),
          widgets,
          onLayoutChange: () => undefined,
          children: h("div", null),
        },
      ),
    );
    view.rerender(
      h(
        GridStackAdapter,
        {
          breakpoint: "desktop",
          editing: true,
          gridOptions: structuredClone(DEFAULT_GRID_OPTIONS),
          widgets: structuredClone(widgets),
          onLayoutChange: () => undefined,
          children: h("div", null),
        },
      ),
    );
    expect(gridMocks.init).toHaveBeenCalledTimes(1);
    expect(gridMocks.destroy).not.toHaveBeenCalled();
  });
});

function renderAdapter() {
  return render(
    h(
      GridStackAdapter,
      {
        breakpoint: "desktop",
        editing: true,
        gridOptions: structuredClone(DEFAULT_GRID_OPTIONS),
        widgets: defaultWidgets(),
        onLayoutChange: () => undefined,
        children: h("div", null),
      },
    ),
  );
}

function defaultWidgets() {
  const settings = createDefaultSettings();
  return settings.dashboards["dashboard-home"]!.widgetIds.map(
    (id) => settings.widgetInstances[id]!,
  );
}
