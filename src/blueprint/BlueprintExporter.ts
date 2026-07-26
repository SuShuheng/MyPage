import type { SettingsStore } from "../persistence/SettingsStore";
import type { DashboardBlueprint } from "./blueprint-types";

export class BlueprintExporter {
  public constructor(private readonly store: SettingsStore) {}

  public export(dashboardId: string): DashboardBlueprint {
    const settings = this.store.snapshot;
    const dashboard = settings.dashboards[dashboardId];
    if (!dashboard) throw new Error(`找不到 Dashboard：${dashboardId}`);
    const groups = Object.fromEntries(
      dashboard.groupIds
        .map((id) => settings.groups[id])
        .filter((group) => group !== undefined)
        .map((group) => [group.id, structuredClone(group)]),
    );
    const widgets = Object.fromEntries(
      dashboard.widgetIds
        .map((id) => settings.widgetInstances[id])
        .filter((widget) => widget !== undefined)
        .map((widget) => [widget.id, sanitizeWidget(widget)]),
    );
    const moduleIds = new Set(
      Object.values(widgets)
        .map((widget) => widget.moduleId)
        .filter((id) => id !== "mypage-core"),
    );
    const requiredModules = [...moduleIds].map((id) => {
      const installed = settings.modules[id];
      const requirement: {
        id: string;
        versionRange: string;
        sourceId?: string;
      } = {
        id,
        versionRange: installed ? `^${installed.version}` : "*",
      };
      if (installed?.sourceId !== undefined) {
        requirement.sourceId = installed.sourceId;
      }
      return requirement;
    });
    const result: DashboardBlueprint = {
      schemaVersion: 1,
      kind: "mypage-blueprint",
      name: dashboard.name,
      exportedAt: new Date().toISOString(),
      dashboard: structuredClone(dashboard),
      groups,
      widgets,
      requiredModules,
    };
    const theme = dashboard.themeProfileId
      ? settings.themeProfiles[dashboard.themeProfileId]
      : undefined;
    if (theme) result.themeProfile = structuredClone(theme);
    return result;
  }
}

function sanitizeWidget<T extends { dataBinding: { scope: {
  includeFolders: string[];
  excludeFolders: string[];
} }; config: Record<string, unknown> }>(widget: T): T {
  const clone = structuredClone(widget);
  clone.dataBinding.scope.includeFolders = clone.dataBinding.scope.includeFolders.map(
    sanitizePath,
  );
  clone.dataBinding.scope.excludeFolders = clone.dataBinding.scope.excludeFolders.map(
    sanitizePath,
  );
  clone.config = sanitizeObject(clone.config) as Record<string, unknown>;
  return clone;
}

function sanitizePath(path: string): string {
  // Vault paths are portable and may legitimately begin with "/". Only
  // operating-system absolute paths need a device-local binding.
  return /^[A-Za-z]:[\\/]/u.test(path) || /^\\\\[^\\]/u.test(path)
    ? `\${BIND:${path}}`
    : path;
}

function sanitizeObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeObject);
  if (typeof value !== "object" || value === null) {
    if (typeof value === "string") {
      if (/token|secret|password|api[-_]?key/iu.test(value)) return "[REDACTED]";
      return sanitizePath(value);
    }
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/token|secret|password|api[-_]?key|permission/iu.test(key))
      .map(([key, item]) => [key, sanitizeObject(item)]),
  );
}
