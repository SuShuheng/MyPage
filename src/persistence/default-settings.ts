import type {
  DataBinding,
  GridOptions,
  MyPageSettings,
  ThemeTokens,
  WidgetAppearance,
  WidgetInstance,
} from "./settings-types";
import { createId } from "../core/ids";
import { createDateRange } from "../widgets/content-config";

export const DEFAULT_GRID_OPTIONS: GridOptions = {
  columns: {
    desktop: 12,
    tablet: 8,
    mobile: 4,
  },
  rowHeight: 76,
  gap: 14,
  pagePadding: 18,
  snap: true,
  push: true,
  compact: true,
  placeholder: true,
  collisionAnimation: true,
  liveReflow: true,
  crossGroupDrag: true,
  layoutAnimation: true,
  editGridLines: true,
  undoRedo: true,
};

export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  background: "var(--background-primary)",
  cardBackground: "var(--background-primary-alt)",
  text: "var(--text-normal)",
  mutedText: "var(--text-muted)",
  accent: "var(--interactive-accent)",
  border: "var(--background-modifier-border)",
  radius: 16,
  shadow: "0 10px 30px rgba(0, 0, 0, 0.08)",
  opacity: 0.96,
  blur: 12,
  gap: 14,
  palette: [
    "var(--interactive-accent)",
    "var(--color-green)",
    "var(--color-orange)",
    "var(--color-purple)",
    "var(--color-cyan)",
    "var(--color-red)",
  ],
};

export const DEFAULT_DATA_BINDING: DataBinding = {
  sourceId: "core.vault-files",
  scope: {
    includeFolders: ["/"],
    excludeFolders: [".obsidian"],
    extensions: ["md"],
    tags: [],
    frontmatter: [],
  },
  query: {
    filters: [],
    computedFields: [],
    transforms: [],
    sort: [{ field: "modified", direction: "desc" }],
    limit: 25,
  },
  fieldMapping: {},
};

export const DEFAULT_WIDGET_APPEARANCE: WidgetAppearance = {
  showTitle: true,
  showIcon: true,
  showBackground: true,
  showBorder: true,
  contentScale: 1,
  iconScale: 1,
};

function createWidget(
  id: string,
  contributionId: string,
  title: string,
  x: number,
  y: number,
  w: number,
  h: number,
  config: Record<string, unknown> = {},
): WidgetInstance {
  return {
    id,
    dashboardId: "dashboard-home",
    moduleId: "mypage-core",
    contributionId,
    title,
    displayMode: "standard",
    layouts: {
      desktop: { x, y, w, h, minW: 2, minH: 2 },
      tablet: { x: Math.min(x, 4), y, w: Math.min(w, 4), h, minW: 2, minH: 2 },
      mobile: { x: 0, y: y * 2, w: 4, h, minW: 2, minH: 2 },
    },
    dataBinding: structuredClone(DEFAULT_DATA_BINDING),
    appearance: { ...DEFAULT_WIDGET_APPEARANCE },
    actions: [],
    config,
    enabled: true,
  };
}

export function createDefaultSettings(): MyPageSettings {
  const heatmapRange = createDateRange(180);
  const widgets = [
    createWidget("widget-total-notes", "metric", "笔记总览", 0, 0, 3, 2, {
      metric: "count",
      icon: "files",
    }),
    createWidget("widget-activity", "heatmap", "创作热力图", 3, 0, 6, 3, {
      startDate: heatmapRange.startDate,
      endDate: heatmapRange.endDate,
    }),
    createWidget("widget-tasks", "tasks", "待办任务", 9, 0, 3, 3, {
      showCompleted: true,
      taskPath: "MyPage/TODO.md",
    }),
    createWidget("widget-trend", "trend", "写作趋势", 0, 3, 6, 4),
    createWidget("widget-notes", "notes", "最近笔记", 6, 3, 6, 4),
  ];

  return {
    schemaVersion: 1,
    revision: 0,
    general: {
      deviceId: createId("device"),
      vaultId: createId("vault"),
      onboardingCompleted: false,
      openOnStartup: false,
      startupTabMode: "specific",
      startupTabId: "tab-home",
      startupOpenMode: "reuse",
      restoreWorkspaceBehavior: "respect",
      fallbackDashboardId: "dashboard-home",
      safeMode: false,
    },
    updates: {
      channel: "stable",
      checkOnStartup: true,
      ignoredVersions: [],
    },
    tabs: {
      order: ["tab-home"],
      byId: {
        "tab-home": {
          id: "tab-home",
          dashboardId: "dashboard-home",
          name: "主页",
          icon: "layout-dashboard",
          hidden: false,
          order: 0,
        },
      },
      defaultTabId: "tab-home",
    },
    dashboards: {
      "dashboard-home": {
        id: "dashboard-home",
        name: "主页",
        icon: "layout-dashboard",
        hidden: false,
        themeProfileId: "theme-default",
        header: {
          title: "主页",
          subtitle: "你的知识，一目了然",
          titleFontSize: 34,
          subtitleFontSize: 12,
          showSummary: true,
        },
        groupIds: [],
        widgetIds: widgets.map((widget) => widget.id),
        gridOptions: structuredClone(DEFAULT_GRID_OPTIONS),
        refreshPolicy: {
          mode: "live",
          intervalMs: 300_000,
          pauseWhenHidden: true,
        },
      },
    },
    groups: {},
    widgetInstances: Object.fromEntries(widgets.map((widget) => [widget.id, widget])),
    dataSources: {},
    modules: {},
    moduleSettings: {},
    permissions: [],
    markets: {
      official: {
        id: "official",
        repo: "SuShuHeng/MyPage",
        type: "official",
        enabled: true,
      },
    },
    themeMarkets: {},
    themeProfiles: {
      "theme-default": {
        id: "theme-default",
        name: "跟随 Obsidian",
        mode: "obsidian",
        tokens: {},
      },
    },
    uiState: {
      lastActiveTabId: "tab-home",
      tabBarPosition: "top",
      compactTabs: false,
      animationLevel: "full",
      respectsReducedMotion: true,
      draftRetentionDays: 7,
      backupRetention: 10,
      workerCount: "auto",
      refreshIntervalMs: 300_000,
      debug: false,
    },
    editDrafts: {},
  };
}
