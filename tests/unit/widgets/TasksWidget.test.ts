import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import { h } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TasksWidget } from "../../../src/widgets/tasks/TasksWidget";
import {
  createDefaultSettings,
  DEFAULT_DATA_BINDING,
} from "../../../src/persistence/default-settings";
import type { QueryResult } from "../../../src/data/data-types";

describe("TasksWidget", () => {
  afterEach(() => cleanup());

  it("allows creating a task even when the current query is empty", async () => {
    const execute = vi.fn().mockResolvedValue({ message: "created" });
    const dataEngine = {
      subscribe: vi.fn(
        (_binding: unknown, listener: (result: QueryResult) => void) => {
        listener({
          records: [],
          fingerprint: "empty",
          computedAt: 1,
          durationMs: 1,
          cacheHit: false,
        });
        return vi.fn();
        },
      ),
    };
    const widget = createDefaultSettings().widgetInstances["widget-tasks"]!;
    widget.config.taskPath = "MyPage/TODO.md";

    const view = render(
      h(TasksWidget, {
        app: {} as never,
        actions: { execute } as never,
        dataEngine: dataEngine as never,
        widget,
        binding: structuredClone(DEFAULT_DATA_BINDING),
        editing: false,
      }),
    );

    const input = await view.findByRole("textbox", { name: "新任务内容" });
    fireEvent.input(input, { target: { value: "完成 MyPage 测试" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith({
        id: "create-task",
        input: {
          path: "MyPage/TODO.md",
          text: "完成 MyPage 测试",
        },
      }),
    );
  });
});
