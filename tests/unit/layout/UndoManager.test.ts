import { describe, expect, it } from "vitest";
import { UndoManager } from "../../../src/layout/UndoManager";

describe("UndoManager", () => {
  it("undoes and redoes immutable snapshots", () => {
    const manager = new UndoManager({ count: 0 });
    manager.push({ count: 1 });
    manager.push({ count: 2 });
    expect(manager.undo()).toEqual({ count: 1 });
    expect(manager.undo()).toEqual({ count: 0 });
    expect(manager.redo()).toEqual({ count: 1 });
  });

  it("clears redo history after a new push", () => {
    const manager = new UndoManager({ count: 0 });
    manager.push({ count: 1 });
    manager.undo();
    manager.push({ count: 7 });
    expect(manager.canRedo).toBe(false);
  });
});
