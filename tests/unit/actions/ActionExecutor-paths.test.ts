import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => {
  class TFile {}
  return {
    App: class App {},
    TFile,
    normalizePath: (path: string) => path.replaceAll("\\", "/"),
  };
});

import { ActionExecutor } from "../../../src/actions/ActionExecutor";

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
    const confirm = vi.fn(() => true);
    Object.defineProperty(window, "confirm", {
      configurable: true,
      value: confirm,
    });
    const executor = new ActionExecutor(app as never);

    await executor.execute({
      id: "create-task",
      input: { path: "Tasks/Inbox.md", text: "新任务" },
    });

    expect(confirm).toHaveBeenCalled();
    expect(createFolder).toHaveBeenCalledWith("Tasks");
    expect(create).toHaveBeenCalledWith("Tasks/Inbox.md", "- [ ] 新任务\n");
  });
});
