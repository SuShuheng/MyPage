import { describe, expect, it } from "vitest";
import { EditSessionManager } from "../../../src/layout/EditSessionManager";
import { createDefaultSettings } from "../../../src/persistence/default-settings";

describe("EditSessionManager groups", () => {
  it("adds a group, moves a widget, and restores it when group is removed", () => {
    const session = new EditSessionManager(createDefaultSettings(), "dashboard-home");
    const groupId = session.addGroup("创作");
    session.setWidgetGroup("widget-total-notes", groupId);
    expect(session.snapshot.widgets["widget-total-notes"]?.groupId).toBe(groupId);
    expect(session.snapshot.dashboard.groupIds).toContain(groupId);
    session.removeGroup(groupId);
    expect(session.snapshot.widgets["widget-total-notes"]?.groupId).toBeUndefined();
    expect(session.snapshot.dashboard.groupIds).not.toContain(groupId);
  });

  it("supports undo and redo across group operations", () => {
    const session = new EditSessionManager(createDefaultSettings(), "dashboard-home");
    session.addGroup("A");
    expect(Object.keys(session.snapshot.groups)).toHaveLength(1);
    session.undo();
    expect(Object.keys(session.snapshot.groups)).toHaveLength(0);
    session.redo();
    expect(Object.keys(session.snapshot.groups)).toHaveLength(1);
  });
});
