import { createId } from "../core/ids";
import { satisfies } from "semver";
import type { SettingsStore } from "../persistence/SettingsStore";
import {
  blueprintErrors,
  validateBlueprint,
} from "./blueprint-schema";
import type {
  BlueprintPathBindings,
  BlueprintPreview,
  DashboardBlueprint,
} from "./blueprint-types";

export class BlueprintImporter {
  public constructor(private readonly store: SettingsStore) {}

  public parse(value: unknown): DashboardBlueprint {
    if (!validateBlueprint(value)) {
      throw new Error(`蓝图无效：${blueprintErrors().join("; ")}`);
    }
    return structuredClone(value);
  }

  public preview(blueprint: DashboardBlueprint): BlueprintPreview {
    const installed = this.store.snapshot.modules;
    const externalPathBindings = collectBindings(blueprint);
    return {
      name: blueprint.name,
      widgetCount: Object.keys(blueprint.widgets).length,
      groupCount: Object.keys(blueprint.groups).length,
      requiredModules: structuredClone(blueprint.requiredModules),
      missingModules: blueprint.requiredModules.filter(
        (requirement) => {
          const module = installed[requirement.id];
          return (
            !module ||
            !satisfies(module.version, requirement.versionRange)
          );
        },
      ),
      externalPathBindings,
      warnings: externalPathBindings.length > 0
        ? ["蓝图包含设备路径占位符，导入前必须重新绑定。"]
        : [],
    };
  }

  public async import(
    blueprint: DashboardBlueprint,
    bindings: BlueprintPathBindings = {},
  ): Promise<string> {
    const preview = this.preview(blueprint);
    const unresolved = preview.externalPathBindings.filter((path) => !bindings[path]);
    if (unresolved.length > 0) {
      throw new Error(`尚未绑定设备路径：${unresolved.join(", ")}`);
    }
    const dashboardId = createId("dashboard");
    const tabId = createId("tab");
    const widgetMap = new Map<string, string>();
    const groupMap = new Map<string, string>();
    Object.keys(blueprint.widgets).forEach((id) => widgetMap.set(id, createId("widget")));
    Object.keys(blueprint.groups).forEach((id) => groupMap.set(id, createId("group")));
    const snapshot = this.store.snapshot;
    await this.store.update(
      (draft) => {
        const dashboard = replaceBindings(blueprint.dashboard, bindings);
        dashboard.id = dashboardId;
        dashboard.name = blueprint.name;
        dashboard.widgetIds = dashboard.widgetIds.flatMap((id) => {
          const mapped = widgetMap.get(id);
          return mapped ? [mapped] : [];
        });
        dashboard.groupIds = dashboard.groupIds.flatMap((id) => {
          const mapped = groupMap.get(id);
          return mapped ? [mapped] : [];
        });
        if (blueprint.themeProfile) {
          const themeId = createId("theme");
          const theme = replaceBindings(blueprint.themeProfile, bindings);
          theme.id = themeId;
          draft.themeProfiles[themeId] = theme;
          dashboard.themeProfileId = themeId;
        }
        draft.dashboards[dashboardId] = dashboard;
        for (const [oldId, widget] of Object.entries(blueprint.widgets)) {
          const id = widgetMap.get(oldId);
          if (!id) continue;
          const clone = replaceBindings(widget, bindings);
          clone.id = id;
          clone.dashboardId = dashboardId;
          if (clone.groupId) {
            const mappedGroupId = groupMap.get(clone.groupId);
            if (mappedGroupId) clone.groupId = mappedGroupId;
            else delete clone.groupId;
          }
          draft.widgetInstances[id] = clone;
        }
        for (const [oldId, group] of Object.entries(blueprint.groups)) {
          const id = groupMap.get(oldId);
          if (!id) continue;
          const clone = replaceBindings(group, bindings);
          clone.id = id;
          clone.dashboardId = dashboardId;
          if (clone.parentGroupId) {
            const mappedParentId = groupMap.get(clone.parentGroupId);
            if (mappedParentId) clone.parentGroupId = mappedParentId;
            else delete clone.parentGroupId;
          }
          draft.groups[id] = clone;
        }
        draft.tabs.byId[tabId] = {
          id: tabId,
          dashboardId,
          name: blueprint.name,
          hidden: false,
          order: draft.tabs.order.length,
        };
        draft.tabs.order.push(tabId);
        draft.uiState.lastActiveTabId = tabId;
      },
      snapshot.revision,
      "import-blueprint",
    );
    return dashboardId;
  }
}

function collectBindings(value: unknown): string[] {
  const json = JSON.stringify(value);
  const matches = [...json.matchAll(/\$\{BIND:([^}]+)\}/gu)].map((match) => match[1] ?? "");
  return [...new Set(matches.filter(Boolean))];
}

function replaceBindings<T>(value: T, bindings: BlueprintPathBindings): T {
  return replaceValue(value, bindings) as T;
}

function replaceValue(
  value: unknown,
  bindings: BlueprintPathBindings,
): unknown {
  if (typeof value === "string") {
    return value.replace(
      /\$\{BIND:([^}]+)\}/gu,
      (_match, path: string) => bindings[path] ?? `\${BIND:${path}}`,
    );
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceValue(item, bindings));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceValue(item, bindings),
      ]),
    );
  }
  return value;
}
