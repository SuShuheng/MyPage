import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import type { MyPageSettings } from "./settings-types";

const identifier = { type: "string", minLength: 1, maxLength: 160 };
const stringArray = { type: "array", items: { type: "string" } };
const layout = {
  type: "object",
  additionalProperties: false,
  required: ["x", "y", "w", "h"],
  properties: {
    x: { type: "number", minimum: 0 },
    y: { type: "number", minimum: 0 },
    w: { type: "number", exclusiveMinimum: 0 },
    h: { type: "number", exclusiveMinimum: 0 },
    minW: { type: "number", exclusiveMinimum: 0 },
    minH: { type: "number", exclusiveMinimum: 0 },
    maxW: { type: "number", exclusiveMinimum: 0 },
    maxH: { type: "number", exclusiveMinimum: 0 },
  },
};
const appearance = {
  type: "object",
  additionalProperties: false,
  required: ["showTitle", "showIcon", "showBackground", "showBorder"],
  properties: {
    showTitle: { type: "boolean" },
    showIcon: { type: "boolean" },
    showBackground: { type: "boolean" },
    showBorder: { type: "boolean" },
    contentScale: { type: "number", minimum: 0.5, maximum: 2 },
    iconScale: { type: "number", minimum: 0.5, maximum: 2 },
    customClass: { type: "string", maxLength: 160 },
    themeOverrides: { type: "object" },
  },
};
const gridOptions = {
  type: "object",
  additionalProperties: false,
  required: [
    "columns",
    "rowHeight",
    "gap",
    "pagePadding",
    "snap",
    "push",
    "compact",
    "placeholder",
    "collisionAnimation",
    "liveReflow",
    "crossGroupDrag",
    "layoutAnimation",
    "editGridLines",
    "undoRedo",
  ],
  properties: {
    columns: {
      type: "object",
      additionalProperties: false,
      required: ["desktop", "tablet", "mobile"],
      properties: {
        desktop: { type: "integer", minimum: 1, maximum: 24 },
        tablet: { type: "integer", minimum: 1, maximum: 24 },
        mobile: { type: "integer", minimum: 1, maximum: 12 },
      },
    },
    rowHeight: { type: "number", minimum: 20, maximum: 300 },
    gap: { type: "number", minimum: 0, maximum: 64 },
    pagePadding: { type: "number", minimum: 0, maximum: 96 },
    snap: { type: "boolean" },
    push: { type: "boolean" },
    compact: { type: "boolean" },
    placeholder: { type: "boolean" },
    collisionAnimation: { type: "boolean" },
    liveReflow: { type: "boolean" },
    crossGroupDrag: { type: "boolean" },
    layoutAnimation: { type: "boolean" },
    editGridLines: { type: "boolean" },
    undoRedo: { type: "boolean" },
  },
};
const dashboard = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "name",
    "hidden",
    "groupIds",
    "widgetIds",
    "gridOptions",
    "refreshPolicy",
  ],
  properties: {
    id: identifier,
    name: { type: "string", minLength: 1, maxLength: 120 },
    icon: { type: "string", maxLength: 120 },
    hidden: { type: "boolean" },
    themeProfileId: { type: "string" },
    groupIds: { ...stringArray, uniqueItems: true },
    widgetIds: { ...stringArray, uniqueItems: true },
    gridOptions,
    refreshPolicy: {
      type: "object",
      additionalProperties: false,
      required: ["mode", "intervalMs", "pauseWhenHidden"],
      properties: {
        mode: { enum: ["live", "interval", "manual"] },
        intervalMs: { type: "integer", minimum: 1_000 },
        pauseWhenHidden: { type: "boolean" },
      },
    },
  },
};
const moduleInstallation = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "name",
    "version",
    "sourceType",
    "enabled",
    "trustLevel",
    "installedAt",
    "platform",
  ],
  properties: {
    id: identifier,
    name: identifier,
    version: identifier,
    sourceType: { enum: ["official", "third-party", "zip", "local"] },
    sourceId: { type: "string" },
    enabled: { type: "boolean" },
    trustLevel: { enum: ["sandbox", "trusted"] },
    installedAt: { type: "number", minimum: 0 },
    lastError: { type: "string" },
    permissionsHash: { type: "string" },
    platform: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { enum: ["desktop", "mobile"] },
    },
  },
};

const settingsSchema = {
  $id: "https://github.com/SuShuHeng/MyPage/schemas/settings-v1.json",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "revision",
    "general",
    "updates",
    "tabs",
    "dashboards",
    "groups",
    "widgetInstances",
    "dataSources",
    "modules",
    "moduleSettings",
    "permissions",
    "markets",
    "themeProfiles",
    "uiState",
    "editDrafts",
  ],
  properties: {
    schemaVersion: { const: 1 },
    revision: { type: "integer", minimum: 0 },
    general: {
      type: "object",
      additionalProperties: false,
      required: [
        "deviceId",
        "vaultId",
        "onboardingCompleted",
        "openOnStartup",
        "startupTabMode",
        "startupTabId",
        "startupOpenMode",
        "restoreWorkspaceBehavior",
        "fallbackDashboardId",
        "safeMode",
      ],
      properties: {
        deviceId: identifier,
        vaultId: identifier,
        onboardingCompleted: { type: "boolean" },
        openOnStartup: { type: "boolean" },
        startupTabMode: { enum: ["specific", "last"] },
        startupTabId: identifier,
        startupOpenMode: { enum: ["reuse", "replace-empty", "new-leaf"] },
        restoreWorkspaceBehavior: { enum: ["respect", "focus-mypage"] },
        fallbackDashboardId: identifier,
        safeMode: { type: "boolean" },
      },
    },
    updates: {
      type: "object",
      additionalProperties: false,
      required: ["channel", "checkOnStartup", "ignoredVersions"],
      properties: {
        channel: { enum: ["stable", "preview"] },
        checkOnStartup: { type: "boolean" },
        ignoredVersions: stringArray,
        lastCheckedAt: { type: "number", minimum: 0 },
      },
    },
    tabs: {
      type: "object",
      additionalProperties: false,
      required: ["order", "byId", "defaultTabId"],
      properties: {
        order: { ...stringArray, minItems: 1, uniqueItems: true },
        byId: {
          type: "object",
          additionalProperties: {
            type: "object",
            additionalProperties: false,
            required: ["id", "dashboardId", "name", "hidden", "order"],
            properties: {
              id: identifier,
              dashboardId: identifier,
              name: identifier,
              icon: { type: "string" },
              hidden: { type: "boolean" },
              order: { type: "integer", minimum: 0 },
            },
          },
        },
        defaultTabId: identifier,
      },
    },
    dashboards: { type: "object", additionalProperties: dashboard },
    groups: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "dashboardId",
          "title",
          "collapsed",
          "allowedContributionIds",
          "appearance",
        ],
        properties: {
          id: identifier,
          dashboardId: identifier,
          title: identifier,
          icon: { type: "string" },
          collapsed: { type: "boolean" },
          parentGroupId: { type: "string" },
          allowedContributionIds: stringArray,
          appearance,
        },
      },
    },
    widgetInstances: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "dashboardId",
          "moduleId",
          "contributionId",
          "displayMode",
          "layouts",
          "dataBinding",
          "appearance",
          "actions",
          "config",
          "enabled",
        ],
        properties: {
          id: identifier,
          dashboardId: identifier,
          groupId: { type: "string" },
          moduleId: identifier,
          contributionId: identifier,
          title: { type: "string" },
          displayMode: { enum: ["compact", "standard", "detailed"] },
          layouts: {
            type: "object",
            additionalProperties: false,
            required: ["desktop", "tablet", "mobile"],
            properties: { desktop: layout, tablet: layout, mobile: layout },
          },
          dataBinding: {
            type: "object",
            additionalProperties: false,
            required: ["sourceId", "scope", "query", "fieldMapping"],
            properties: {
              sourceId: identifier,
              scope: { type: "object" },
              query: { type: "object" },
              fieldMapping: { type: "object" },
            },
          },
          appearance,
          actions: { type: "array" },
          config: { type: "object" },
          enabled: { type: "boolean" },
        },
      },
    },
    dataSources: { type: "object" },
    modules: { type: "object", additionalProperties: moduleInstallation },
    moduleSettings: { type: "object" },
    permissions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "moduleId",
          "capability",
          "scope",
          "vaultId",
          "deviceId",
          "grantedAt",
          "moduleVersion",
        ],
        properties: {
          moduleId: identifier,
          capability: {
            enum: [
              "vault.read",
              "vault.write",
              "network.request",
              "externalFs.read",
              "externalFs.write",
              "git.read",
              "git.write",
              "obsidian.command",
              "system.exec",
            ],
          },
          scope: { type: "object" },
          vaultId: identifier,
          deviceId: identifier,
          grantedAt: { type: "number", minimum: 0 },
          moduleVersion: identifier,
        },
      },
    },
    markets: { type: "object" },
    themeMarkets: { type: "object" },
    themeProfiles: { type: "object" },
    uiState: {
      type: "object",
      additionalProperties: false,
      required: [
        "lastActiveTabId",
        "tabBarPosition",
        "compactTabs",
        "animationLevel",
        "respectsReducedMotion",
        "draftRetentionDays",
        "backupRetention",
        "workerCount",
        "debug",
      ],
      properties: {
        lastActiveTabId: identifier,
        tabBarPosition: { enum: ["top", "left"] },
        compactTabs: { type: "boolean" },
        animationLevel: { enum: ["off", "reduced", "full"] },
        respectsReducedMotion: { type: "boolean" },
        draftRetentionDays: { type: "integer", minimum: 0, maximum: 365 },
        backupRetention: { type: "integer", minimum: 1, maximum: 100 },
        workerCount: {
          anyOf: [
            { const: "auto" },
            { type: "integer", minimum: 1, maximum: 16 },
          ],
        },
        refreshIntervalMs: {
          type: "integer",
          minimum: 15_000,
          maximum: 86_400_000,
        },
        debug: { type: "boolean" },
      },
    },
    editDrafts: { type: "object" },
  },
} as const;

const ajv = new Ajv({
  allErrors: true,
  allowUnionTypes: true,
  strict: false,
});
const validator: ValidateFunction<MyPageSettings> = ajv.compile(settingsSchema);
let invariantErrors: string[] = [];

export function validateSettings(value: unknown): value is MyPageSettings {
  invariantErrors = [];
  if (!validator(value)) return false;
  invariantErrors = checkReferences(value);
  return invariantErrors.length === 0;
}

export function getSettingsValidationErrors(): string[] {
  return [
    ...formatValidationErrors(validator.errors),
    ...invariantErrors,
  ];
}

function checkReferences(settings: MyPageSettings): string[] {
  const errors: string[] = [];
  const requireTab = (id: string, path: string) => {
    if (!settings.tabs.byId[id]) errors.push(`${path}: unknown tab ${id}`);
  };
  requireTab(settings.tabs.defaultTabId, "/tabs/defaultTabId");
  requireTab(settings.general.startupTabId, "/general/startupTabId");
  requireTab(settings.uiState.lastActiveTabId, "/uiState/lastActiveTabId");
  for (const [index, tabId] of settings.tabs.order.entries()) {
    const tab = settings.tabs.byId[tabId];
    if (!tab) {
      errors.push(`/tabs/order/${index}: unknown tab ${tabId}`);
      continue;
    }
    if (!settings.dashboards[tab.dashboardId]) {
      errors.push(`/tabs/byId/${tabId}: unknown dashboard ${tab.dashboardId}`);
    }
  }
  for (const [dashboardId, item] of Object.entries(settings.dashboards)) {
    if (item.id !== dashboardId) {
      errors.push(`/dashboards/${dashboardId}/id: key and id differ`);
    }
    for (const widgetId of item.widgetIds) {
      const widget = settings.widgetInstances[widgetId];
      if (!widget || widget.dashboardId !== dashboardId) {
        errors.push(`/dashboards/${dashboardId}/widgetIds: invalid ${widgetId}`);
      }
    }
    for (const groupId of item.groupIds) {
      const group = settings.groups[groupId];
      if (!group || group.dashboardId !== dashboardId) {
        errors.push(`/dashboards/${dashboardId}/groupIds: invalid ${groupId}`);
      }
    }
  }
  return errors;
}

export function formatValidationErrors(
  errors: ErrorObject[] | null | undefined,
): string[] {
  return (errors ?? []).map((error) => {
    const path = error.instancePath || "/";
    return `${path}: ${error.message ?? error.keyword}`;
  });
}

export { settingsSchema };
