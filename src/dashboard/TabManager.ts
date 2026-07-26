import { createId } from "../core/ids";
import {
  DEFAULT_GRID_OPTIONS,
} from "../persistence/default-settings";
import type { SettingsStore } from "../persistence/SettingsStore";
import type {
  Dashboard,
  DashboardGroup,
  TabDefinition,
  WidgetInstance,
} from "../persistence/settings-types";

export class TabManager {
  public constructor(private readonly store: SettingsStore) {}

  public async create(name = "新主页"): Promise<string> {
    const tabId = createId("tab");
    const dashboardId = createId("dashboard");
    const snapshot = this.store.snapshot;
    await this.store.update(
      (draft) => {
        const order = draft.tabs.order.length;
        draft.dashboards[dashboardId] = {
          id: dashboardId,
          name,
          hidden: false,
          groupIds: [],
          widgetIds: [],
          gridOptions: structuredClone(DEFAULT_GRID_OPTIONS),
          refreshPolicy: {
            mode: "live",
            intervalMs: 300_000,
            pauseWhenHidden: true,
          },
        };
        draft.tabs.byId[tabId] = {
          id: tabId,
          dashboardId,
          name,
          hidden: false,
          order,
        };
        draft.tabs.order.push(tabId);
        draft.uiState.lastActiveTabId = tabId;
      },
      snapshot.revision,
      "create-tab",
    );
    return tabId;
  }

  public async rename(tabId: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("主页名称不能为空。");
    const snapshot = this.store.snapshot;
    await this.store.update(
      (draft) => {
        const tab = requireTab(draft.tabs.byId, tabId);
        const dashboard = requireDashboard(draft.dashboards, tab.dashboardId);
        tab.name = trimmed;
        dashboard.name = trimmed;
      },
      snapshot.revision,
      "rename-tab",
    );
  }

  public async duplicate(tabId: string): Promise<string> {
    const newTabId = createId("tab");
    const newDashboardId = createId("dashboard");
    const snapshot = this.store.snapshot;
    await this.store.update(
      (draft) => {
        const sourceTab = requireTab(draft.tabs.byId, tabId);
        const sourceDashboard = requireDashboard(
          draft.dashboards,
          sourceTab.dashboardId,
        );
        const clonedWidgetIds: string[] = [];
        const clonedGroupIds: string[] = [];
        const groupIdMap = new Map<string, string>();

        for (const groupId of sourceDashboard.groupIds) {
          const sourceGroup = draft.groups[groupId];
          if (!sourceGroup) continue;
          const clonedGroupId = createId("group");
          groupIdMap.set(groupId, clonedGroupId);
          clonedGroupIds.push(clonedGroupId);
          draft.groups[clonedGroupId] = {
            ...structuredClone(sourceGroup),
            id: clonedGroupId,
            dashboardId: newDashboardId,
          };
        }

        for (const widgetId of sourceDashboard.widgetIds) {
          const sourceWidget = draft.widgetInstances[widgetId];
          if (!sourceWidget) continue;
          const clonedWidgetId = createId("widget");
          clonedWidgetIds.push(clonedWidgetId);
          const clonedWidget: WidgetInstance = {
            ...structuredClone(sourceWidget),
            id: clonedWidgetId,
            dashboardId: newDashboardId,
          };
          if (sourceWidget.groupId) {
            const clonedGroupId = groupIdMap.get(sourceWidget.groupId);
            if (clonedGroupId) clonedWidget.groupId = clonedGroupId;
            else delete clonedWidget.groupId;
          }
          draft.widgetInstances[clonedWidgetId] = clonedWidget;
        }

        const name = `${sourceTab.name} 副本`;
        draft.dashboards[newDashboardId] = {
          ...structuredClone(sourceDashboard),
          id: newDashboardId,
          name,
          groupIds: clonedGroupIds,
          widgetIds: clonedWidgetIds,
        };
        draft.tabs.byId[newTabId] = {
          ...structuredClone(sourceTab),
          id: newTabId,
          dashboardId: newDashboardId,
          name,
          order: draft.tabs.order.length,
        };
        draft.tabs.order.push(newTabId);
        draft.uiState.lastActiveTabId = newTabId;
      },
      snapshot.revision,
      "duplicate-tab",
    );
    return newTabId;
  }

  public async remove(tabId: string): Promise<void> {
    const snapshot = this.store.snapshot;
    if (snapshot.tabs.order.length <= 1) {
      throw new Error("MyPage 至少需要保留一个主页。");
    }
    await this.store.update(
      (draft) => {
        const tab = requireTab(draft.tabs.byId, tabId);
        const dashboard = requireDashboard(draft.dashboards, tab.dashboardId);
        for (const widgetId of dashboard.widgetIds) {
          delete draft.widgetInstances[widgetId];
        }
        for (const groupId of dashboard.groupIds) {
          delete draft.groups[groupId];
        }
        delete draft.dashboards[dashboard.id];
        delete draft.tabs.byId[tabId];
        draft.tabs.order = draft.tabs.order.filter((id) => id !== tabId);
        normalizeTabOrder(draft.tabs.order, draft.tabs.byId);

        const fallbackId = draft.tabs.order[0];
        if (!fallbackId) throw new Error("No fallback tab remains.");
        if (draft.tabs.defaultTabId === tabId) {
          draft.tabs.defaultTabId = fallbackId;
        }
        if (draft.general.startupTabId === tabId) {
          draft.general.startupTabId = fallbackId;
        }
        if (draft.uiState.lastActiveTabId === tabId) {
          draft.uiState.lastActiveTabId = fallbackId;
        }
      },
      snapshot.revision,
      "delete-tab",
    );
  }

  public async setHidden(tabId: string, hidden: boolean): Promise<void> {
    const snapshot = this.store.snapshot;
    await this.store.update(
      (draft) => {
        const tab = requireTab(draft.tabs.byId, tabId);
        tab.hidden = hidden;
        const dashboard = requireDashboard(draft.dashboards, tab.dashboardId);
        dashboard.hidden = hidden;
        if (hidden && draft.uiState.lastActiveTabId === tabId) {
          const fallback = draft.tabs.order.find(
            (id) => id !== tabId && !draft.tabs.byId[id]?.hidden,
          );
          if (!fallback) throw new Error("至少需要保留一个可见主页。");
          draft.uiState.lastActiveTabId = fallback;
        }
      },
      snapshot.revision,
      hidden ? "hide-tab" : "show-tab",
    );
  }

  public async setDefault(tabId: string): Promise<void> {
    const snapshot = this.store.snapshot;
    await this.store.update(
      (draft) => {
        requireTab(draft.tabs.byId, tabId);
        draft.tabs.defaultTabId = tabId;
        draft.general.startupTabId = tabId;
      },
      snapshot.revision,
      "set-default-tab",
    );
  }

  public async reorder(tabId: string, targetIndex: number): Promise<void> {
    const snapshot = this.store.snapshot;
    await this.store.update(
      (draft) => {
        const currentIndex = draft.tabs.order.indexOf(tabId);
        if (currentIndex < 0) throw new Error("找不到要排序的主页。");
        const nextIndex = Math.max(
          0,
          Math.min(targetIndex, draft.tabs.order.length - 1),
        );
        draft.tabs.order.splice(currentIndex, 1);
        draft.tabs.order.splice(nextIndex, 0, tabId);
        normalizeTabOrder(draft.tabs.order, draft.tabs.byId);
      },
      snapshot.revision,
      "reorder-tabs",
    );
  }
}

function normalizeTabOrder(
  order: string[],
  byId: Record<string, TabDefinition>,
): void {
  order.forEach((id, index) => {
    const tab = byId[id];
    if (tab) tab.order = index;
  });
}

function requireTab(
  tabs: Record<string, TabDefinition>,
  id: string,
): TabDefinition {
  const tab = tabs[id];
  if (!tab) throw new Error(`找不到主页标签：${id}`);
  return tab;
}

function requireDashboard(
  dashboards: Record<string, Dashboard>,
  id: string,
): Dashboard {
  const dashboard = dashboards[id];
  if (!dashboard) throw new Error(`找不到 Dashboard：${id}`);
  return dashboard;
}

export type TabDuplicateBundle = {
  dashboard: Dashboard;
  widgets: Record<string, WidgetInstance>;
  groups: Record<string, DashboardGroup>;
};
