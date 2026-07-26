import type {
  Breakpoint,
  Dashboard,
  DashboardGroup,
  WidgetInstance,
  WidgetLayout,
} from "../persistence/settings-types";

export interface DashboardDraft {
  dashboard: Dashboard;
  groups: Record<string, DashboardGroup>;
  widgets: Record<string, WidgetInstance>;
}

export interface LayoutChange {
  widgetId: string;
  breakpoint: Breakpoint;
  layout: WidgetLayout;
}

export interface CollisionResult {
  accepted: boolean;
  layout: WidgetLayout;
  moved: Record<string, WidgetLayout>;
  conflictIds: string[];
}
