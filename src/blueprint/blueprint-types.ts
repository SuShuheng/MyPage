import type {
  Dashboard,
  DashboardGroup,
  ThemeProfile,
  WidgetInstance,
} from "../persistence/settings-types";

export interface BlueprintModuleRequirement {
  id: string;
  versionRange: string;
  sourceId?: string;
}

export interface DashboardBlueprint {
  schemaVersion: 1;
  kind: "mypage-blueprint";
  name: string;
  description?: string;
  exportedAt: string;
  dashboard: Dashboard;
  groups: Record<string, DashboardGroup>;
  widgets: Record<string, WidgetInstance>;
  themeProfile?: ThemeProfile;
  requiredModules: BlueprintModuleRequirement[];
}

export interface BlueprintPreview {
  name: string;
  widgetCount: number;
  groupCount: number;
  requiredModules: BlueprintModuleRequirement[];
  missingModules: BlueprintModuleRequirement[];
  externalPathBindings: string[];
  warnings: string[];
}

export interface BlueprintPathBindings {
  [originalPath: string]: string;
}
