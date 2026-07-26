import { cleanup, render, waitFor } from "@testing-library/preact";
import { h } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModuleWidget } from "../../../src/widgets/ModuleWidget";
import { DEFAULT_DATA_BINDING } from "../../../src/persistence/default-settings";

describe("ModuleWidget data delivery", () => {
  afterEach(() => cleanup());

  it("replays data that arrives before the sandbox is ready", async () => {
    const result = {
      records: [{ id: "one", sourceId: "core.vault-files", type: "file", fields: {} }],
      fingerprint: "test",
      computedAt: 1,
      durationMs: 1,
      cacheHit: false,
    };
    let resolveSandbox: ((sandbox: { updateData: (value: unknown) => void }) => void) | undefined;
    const updateData = vi.fn();
    const runtime = {
      mountWidget: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveSandbox = resolve;
          }),
      ),
      unmount: vi.fn(),
    };
    const dataEngine = {
      subscribe: vi.fn((_binding, listener: (value: typeof result) => void) => {
        listener(result);
        return vi.fn();
      }),
    };

    render(
      h(ModuleWidget, {
        runtime: runtime as never,
        dataEngine: dataEngine as never,
        widget: {
          id: "widget-module",
          dashboardId: "dashboard-home",
          moduleId: "example",
          contributionId: "summary",
          displayMode: "standard",
          layouts: {
            desktop: { x: 0, y: 0, w: 4, h: 3 },
            tablet: { x: 0, y: 0, w: 4, h: 3 },
            mobile: { x: 0, y: 0, w: 4, h: 3 },
          },
          dataBinding: structuredClone(DEFAULT_DATA_BINDING),
          appearance: {
            showTitle: true,
            showIcon: true,
            showBackground: true,
            showBorder: true,
          },
          actions: [],
          config: {},
          enabled: true,
        },
        binding: structuredClone(DEFAULT_DATA_BINDING),
        theme: {},
        runtimeVersion: 0,
      }),
    );

    await waitFor(() => expect(runtime.mountWidget).toHaveBeenCalledOnce());
    resolveSandbox?.({ updateData });
    await waitFor(() => expect(updateData).toHaveBeenCalledWith(result));
  });
});
