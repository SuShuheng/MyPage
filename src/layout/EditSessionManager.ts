import { createId } from "../core/ids";
import {
  DEFAULT_DATA_BINDING,
  DEFAULT_WIDGET_APPEARANCE,
} from "../persistence/default-settings";
import type { SettingsStore } from "../persistence/SettingsStore";
import type {
  Breakpoint,
  DashboardGroup,
  MyPageSettings,
  WidgetInstance,
  WidgetLayout,
} from "../persistence/settings-types";
import type { DashboardDraft } from "./layout-types";
import { UndoManager } from "./UndoManager";

export class EditSessionManager {
  private readonly history: UndoManager<DashboardDraft>;
  private committed = false;
  public readonly baseRevision: number;
  public readonly dashboardId: string;

  public constructor(settings: MyPageSettings, dashboardId: string) {
    const dashboard = settings.dashboards[dashboardId];
    if (!dashboard) throw new Error(`找不到 Dashboard：${dashboardId}`);
    this.dashboardId = dashboardId;
    this.baseRevision = settings.revision;
    this.history = new UndoManager<DashboardDraft>(
      {
        dashboard: structuredClone(dashboard),
        groups: Object.fromEntries(
          dashboard.groupIds
            .map((id) => settings.groups[id])
            .filter((group) => group !== undefined)
            .map((group) => [group.id, structuredClone(group)]),
        ),
        widgets: Object.fromEntries(
          dashboard.widgetIds
            .map((id) => settings.widgetInstances[id])
            .filter((widget) => widget !== undefined)
            .map((widget) => [widget.id, structuredClone(widget)]),
        ),
      },
      (value) => structuredClone(value),
      settings.uiState.debug ? 100 : 50,
    );
  }

  public get snapshot(): DashboardDraft {
    return this.history.value;
  }

  public get canUndo(): boolean {
    return this.history.canUndo;
  }

  public get canRedo(): boolean {
    return this.history.canRedo;
  }

  public mutate(mutator: (draft: DashboardDraft) => void): DashboardDraft {
    this.ensureOpen();
    const next = this.snapshot;
    mutator(next);
    return this.history.push(next);
  }

  public updateLayouts(
    breakpoint: Breakpoint,
    layouts: Record<string, WidgetLayout>,
  ): DashboardDraft {
    return this.mutate((draft) => {
      for (const [widgetId, layout] of Object.entries(layouts)) {
        const widget = draft.widgets[widgetId];
        if (widget) widget.layouts[breakpoint] = structuredClone(layout);
      }
    });
  }

  public addWidget(
    contributionId: string,
    title: string,
    config: Record<string, unknown> = {},
    moduleId = "mypage-core",
  ): string {
    const widgetId = createId("widget");
    this.mutate((draft) => {
      const y = Math.max(
        0,
        ...Object.values(draft.widgets).map(
          (widget) => widget.layouts.desktop.y + widget.layouts.desktop.h,
        ),
      );
      const widget: WidgetInstance = {
        id: widgetId,
        dashboardId: this.dashboardId,
        moduleId,
        contributionId,
        title,
        displayMode: "standard",
        layouts: {
          desktop: { x: 0, y, w: 4, h: 3, minW: 2, minH: 2 },
          tablet: { x: 0, y, w: 4, h: 3, minW: 2, minH: 2 },
          mobile: { x: 0, y, w: 4, h: 3, minW: 2, minH: 2 },
        },
        dataBinding: structuredClone(DEFAULT_DATA_BINDING),
        appearance: structuredClone(DEFAULT_WIDGET_APPEARANCE),
        actions: [],
        config: structuredClone(config),
        enabled: true,
      };
      draft.widgets[widgetId] = widget;
      draft.dashboard.widgetIds.push(widgetId);
    });
    return widgetId;
  }

  public removeWidget(widgetId: string): void {
    this.mutate((draft) => {
      delete draft.widgets[widgetId];
      draft.dashboard.widgetIds = draft.dashboard.widgetIds.filter(
        (id) => id !== widgetId,
      );
    });
  }

  public addGroup(title = "新分组"): string {
    const groupId = createId("group");
    this.mutate((draft) => {
      const group: DashboardGroup = {
        id: groupId,
        dashboardId: this.dashboardId,
        title,
        collapsed: false,
        allowedContributionIds: [],
        appearance: structuredClone(DEFAULT_WIDGET_APPEARANCE),
      };
      draft.groups[groupId] = group;
      draft.dashboard.groupIds.push(groupId);
    });
    return groupId;
  }

  public setWidgetGroup(widgetId: string, groupId?: string): void {
    this.mutate((draft) => {
      const widget = draft.widgets[widgetId];
      if (!widget) throw new Error("找不到要移动的组件。");
      if (groupId && !draft.groups[groupId]) {
        throw new Error("找不到目标分组。");
      }
      for (const breakpoint of ["desktop", "tablet", "mobile"] as const) {
        const peers = Object.values(draft.widgets).filter(
          (candidate) =>
            candidate.id !== widgetId &&
            (candidate.groupId ?? "") === (groupId ?? ""),
        );
        const y = Math.max(
          0,
          ...peers.map(
            (candidate) =>
              candidate.layouts[breakpoint].y +
              candidate.layouts[breakpoint].h,
          ),
        );
        widget.layouts[breakpoint].x = 0;
        widget.layouts[breakpoint].y = y;
      }
      if (groupId) widget.groupId = groupId;
      else delete widget.groupId;
    });
  }

  public removeGroup(groupId: string): void {
    this.mutate((draft) => {
      if (!draft.groups[groupId]) return;
      for (const widget of Object.values(draft.widgets)) {
        if (widget.groupId === groupId) delete widget.groupId;
      }
      delete draft.groups[groupId];
      draft.dashboard.groupIds = draft.dashboard.groupIds.filter(
        (id) => id !== groupId,
      );
    });
  }

  public setGroupCollapsed(groupId: string, collapsed: boolean): void {
    this.mutate((draft) => {
      const group = draft.groups[groupId];
      if (group) group.collapsed = collapsed;
    });
  }

  public duplicateWidget(widgetId: string): string {
    const newWidgetId = createId("widget");
    this.mutate((draft) => {
      const source = draft.widgets[widgetId];
      if (!source) throw new Error("找不到要复制的组件。");
      const clone = structuredClone(source);
      clone.id = newWidgetId;
      for (const layout of Object.values(clone.layouts)) {
        layout.x += 1;
        layout.y += 1;
      }
      draft.widgets[newWidgetId] = clone;
      draft.dashboard.widgetIds.push(newWidgetId);
    });
    return newWidgetId;
  }

  public replaceWidget(widgetId: string, widget: WidgetInstance): void {
    this.mutate((draft) => {
      if (!draft.widgets[widgetId]) throw new Error("找不到要配置的组件。");
      const clone = structuredClone(widget);
      clone.id = widgetId;
      clone.dashboardId = this.dashboardId;
      draft.widgets[widgetId] = clone;
    });
  }

  public undo(): DashboardDraft {
    this.ensureOpen();
    return this.history.undo();
  }

  public redo(): DashboardDraft {
    this.ensureOpen();
    return this.history.redo();
  }

  public async commit(store: SettingsStore): Promise<void> {
    this.ensureOpen();
    const snapshot = this.snapshot;
    await store.update(
      (settings) => {
        const previous = settings.dashboards[this.dashboardId];
        if (!previous) throw new Error("Dashboard was removed during editing.");
        for (const widgetId of previous.widgetIds) {
          if (!snapshot.widgets[widgetId]) {
            delete settings.widgetInstances[widgetId];
          }
        }
        for (const groupId of previous.groupIds) {
          if (!snapshot.groups[groupId]) {
            delete settings.groups[groupId];
          }
        }
        settings.dashboards[this.dashboardId] = structuredClone(snapshot.dashboard);
        Object.assign(settings.widgetInstances, structuredClone(snapshot.widgets));
        Object.assign(settings.groups, structuredClone(snapshot.groups));
        delete settings.editDrafts[this.dashboardId];
      },
      this.baseRevision,
      "commit-edit-session",
    );
    this.committed = true;
  }

  public cancel(): DashboardDraft {
    this.ensureOpen();
    this.committed = true;
    return this.snapshot;
  }

  private ensureOpen(): void {
    if (this.committed) throw new Error("This edit session is already closed.");
  }
}
