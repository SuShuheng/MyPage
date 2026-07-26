import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => {
  class TFile {}
  return {
    App: class App {},
    Modal: class Modal {},
    Setting: class Setting {},
    TFile,
    normalizePath: (path: string) => path.replaceAll("\\", "/"),
  };
});

import { ActionExecutor } from "../../../src/actions/ActionExecutor";
import { TFile } from "obsidian";

describe("ActionExecutor path safety", () => {
  it("rejects absolute and traversal paths before writing", async () => {
    const app = {
      vault: { getAbstractFileByPath: vi.fn() },
      workspace: { openLinkText: vi.fn() },
    };
    const executor = new ActionExecutor(app as never);
    await expect(
      executor.execute({
        id: "create-note",
        input: { path: "../escape.md", content: "" },
      }),
    ).rejects.toThrow(/无效/);
    await expect(
      executor.execute({
        id: "open-file",
        input: { path: "C:/escape.md" },
      }),
    ).rejects.toThrow(/无效/);
  });

  it("creates the configured task file when it does not exist", async () => {
    const createFolder = vi.fn();
    const create = vi.fn().mockResolvedValue({ path: "Tasks/Inbox.md" });
    const app = {
      vault: {
        create,
        createFolder,
        getAbstractFileByPath: vi
          .fn()
          .mockReturnValueOnce(undefined)
          .mockReturnValueOnce(undefined),
        trash: vi.fn(),
      },
      workspace: {},
    };
    const confirm = vi.fn(async () => true);
    const executor = new ActionExecutor(app as never, confirm);

    await executor.execute({
      id: "create-task",
      input: { path: "Tasks/Inbox.md", text: "新任务" },
    });

    expect(confirm).toHaveBeenCalled();
    expect(createFolder).toHaveBeenCalledWith("Tasks");
    expect(create).toHaveBeenCalledWith("Tasks/Inbox.md", "- [ ] 新任务\n");
  });

  it("records and removes the completion timestamp when toggling a task", async () => {
    const file = new TFile();
    let content = "- [ ] 编写测试";
    const process = vi.fn(async (_file, mutate: (value: string) => string) => {
      content = mutate(content);
    });
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => file),
        process,
      },
    };
    const executor = new ActionExecutor(app as never, vi.fn(async () => true));

    await executor.execute({
      id: "toggle-task",
      input: { path: "TODO.md", line: 0, expectedText: "编写测试" },
    });
    expect(content).toMatch(
      /^- \[x\] 编写测试 <!-- mypage:completed=\d{4}-\d{2}-\d{2}T/u,
    );

    await executor.execute({
      id: "toggle-task",
      input: { path: "TODO.md", line: 0, expectedText: "编写测试" },
    });
    expect(content).toBe("- [ ] 编写测试");
  });

  it("only deletes completed task records after confirmation", async () => {
    const file = new TFile();
    let content =
      "- [x] 已完成 <!-- mypage:completed=2026-07-26T10:00:00.000Z -->\n- [ ] 未完成";
    const process = vi.fn(async (_file, mutate: (value: string) => string) => {
      content = mutate(content);
    });
    const confirm = vi.fn(async () => true);
    const executor = new ActionExecutor(
      {
        vault: {
          getAbstractFileByPath: vi.fn(() => file),
          process,
        },
      } as never,
      confirm,
    );
    await executor.execute({
      id: "delete-task",
      input: { path: "TODO.md", line: 0, expectedText: "已完成" },
    });
    expect(content).toBe("- [ ] 未完成");
    expect(confirm).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ destructive: true }),
    );
  });
});
