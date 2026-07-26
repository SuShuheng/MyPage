export type Breakpoint = "desktop" | "tablet" | "mobile";
export type DisplayMode = "compact" | "standard" | "detailed";
export type AnimationLevel = "off" | "reduced" | "full";
export type ThemeMode = "obsidian" | "light" | "dark";
export type UpdateChannel = "stable" | "preview";
export type StartupTabMode = "specific" | "last";
export type StartupOpenMode = "reuse" | "replace-empty" | "new-leaf";
export type ModuleSourceType = "official" | "third-party" | "zip" | "local";
export type ModuleTrustLevel = "sandbox" | "trusted";

export interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

export interface GridOptions {
  columns: Record<Breakpoint, number>;
  rowHeight: number;
  gap: number;
  pagePadding: number;
  snap: boolean;
  push: boolean;
  compact: boolean;
  placeholder: boolean;
  collisionAnimation: boolean;
  liveReflow: boolean;
  crossGroupDrag: boolean;
  layoutAnimation: boolean;
  editGridLines: boolean;
  undoRedo: boolean;
}

export interface DataScope {
  includeFolders: string[];
  excludeFolders: string[];
  extensions: string[];
  tags: string[];
  frontmatter: Array<{
    field: string;
    operator: "eq" | "neq" | "contains" | "exists" | "gt" | "gte" | "lt" | "lte";
    value?: string | number | boolean;
  }>;
  timeRange?: {
    field: "created" | "modified" | "timestamp";
    from?: number;
    to?: number;
  };
}

export interface DataBinding {
  sourceId: string;
  scope: DataScope;
  query: {
    filters: QueryFilter[];
    computedFields: ComputedField[];
    transforms: TransformSpec[];
    aggregate?: AggregateSpec;
    sort: SortSpec[];
    limit?: number;
  };
  fieldMapping: Record<string, string>;
}

export interface QueryFilter {
  field: string;
  operator:
    | "eq"
    | "neq"
    | "contains"
    | "startsWith"
    | "endsWith"
    | "exists"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "in";
  value?: unknown;
}

export interface ComputedField {
  name: string;
  expression: string;
}

export interface TransformSpec {
  type: "pick" | "rename" | "flatten" | "dateBucket";
  options: Record<string, unknown>;
}

export interface AggregateSpec {
  groupBy: string[];
  metrics: Array<{
    field?: string;
    operation: "count" | "sum" | "avg" | "min" | "max";
    as: string;
  }>;
}

export interface SortSpec {
  field: string;
  direction: "asc" | "desc";
}

export interface WidgetAppearance {
  showTitle: boolean;
  showIcon: boolean;
  showBackground: boolean;
  showBorder: boolean;
  customClass?: string;
  themeOverrides?: Partial<ThemeTokens>;
}

export interface InteractionBinding {
  event: "click" | "doubleClick" | "contextMenu" | "select";
  actionId: string;
  config: Record<string, unknown>;
}

export interface WidgetInstance {
  id: string;
  dashboardId: string;
  groupId?: string;
  moduleId: string;
  contributionId: string;
  title?: string;
  displayMode: DisplayMode;
  layouts: Record<Breakpoint, WidgetLayout>;
  dataBinding: DataBinding;
  appearance: WidgetAppearance;
  actions: InteractionBinding[];
  config: Record<string, unknown>;
  enabled: boolean;
}

export interface DashboardGroup {
  id: string;
  dashboardId: string;
  title: string;
  icon?: string;
  collapsed: boolean;
  parentGroupId?: string;
  allowedContributionIds: string[];
  appearance: WidgetAppearance;
}

export interface Dashboard {
  id: string;
  name: string;
  icon?: string;
  hidden: boolean;
  themeProfileId?: string;
  groupIds: string[];
  widgetIds: string[];
  gridOptions: GridOptions;
  refreshPolicy: {
    mode: "live" | "interval" | "manual";
    intervalMs: number;
    pauseWhenHidden: boolean;
  };
}

export interface TabDefinition {
  id: string;
  dashboardId: string;
  name: string;
  icon?: string;
  hidden: boolean;
  order: number;
}

export interface ThemeTokens {
  background: string;
  cardBackground: string;
  text: string;
  mutedText: string;
  accent: string;
  border: string;
  radius: number;
  shadow: string;
  opacity: number;
  blur: number;
  gap: number;
  palette: string[];
}

export interface ThemeProfile {
  id: string;
  name: string;
  mode: ThemeMode;
  tokens: Partial<ThemeTokens>;
  description?: string;
  author?: string;
  version?: string;
  sourceType?: "official" | "third-party" | "custom";
  sourceId?: string;
  fontFamily?: string;
  backgroundImage?: string;
  motionScale?: number;
  preview?: string;
}

export interface ModuleInstallation {
  id: string;
  name: string;
  version: string;
  sourceType: ModuleSourceType;
  sourceId?: string;
  enabled: boolean;
  trustLevel: ModuleTrustLevel;
  installedAt: number;
  lastError?: string;
  permissionsHash?: string;
  platform: Array<"desktop" | "mobile">;
}

export type CapabilityId =
  | "vault.read"
  | "vault.write"
  | "network.request"
  | "externalFs.read"
  | "externalFs.write"
  | "git.read"
  | "git.write"
  | "obsidian.command"
  | "system.exec";

export interface PermissionScope {
  paths?: string[];
  domains?: string[];
  repositories?: string[];
  commands?: string[];
  executables?: string[];
}

export interface PermissionGrant {
  moduleId: string;
  capability: CapabilityId;
  scope: PermissionScope;
  vaultId: string;
  deviceId: string;
  grantedAt: number;
  moduleVersion: string;
}

export interface MarketplaceIndexCache {
  etag?: string;
  fetchedAt: number;
  index: unknown;
}

export interface MarketplaceSource {
  id: string;
  repo: string;
  type: "official" | "third-party";
  enabled: boolean;
  cachedIndex?: MarketplaceIndexCache;
  lastManualCheckAt?: number;
}

export interface ThemeMarketplaceSource {
  id: string;
  repo: string;
  type: "third-party";
  enabled: boolean;
  cachedIndex?: MarketplaceIndexCache;
  lastManualCheckAt?: number;
}

export interface EditDraft {
  dashboardId: string;
  baseRevision: number;
  savedAt: number;
  dashboard: Dashboard;
  groups: Record<string, DashboardGroup>;
  widgets: Record<string, WidgetInstance>;
}

export interface MyPageSettingsV1 {
  schemaVersion: 1;
  revision: number;
  general: {
    deviceId: string;
    vaultId: string;
    onboardingCompleted: boolean;
    openOnStartup: boolean;
    startupTabMode: StartupTabMode;
    startupTabId: string;
    startupOpenMode: StartupOpenMode;
    restoreWorkspaceBehavior: "respect" | "focus-mypage";
    fallbackDashboardId: string;
    safeMode: boolean;
  };
  updates: {
    channel: UpdateChannel;
    checkOnStartup: boolean;
    ignoredVersions: string[];
    lastCheckedAt?: number;
  };
  tabs: {
    order: string[];
    byId: Record<string, TabDefinition>;
    defaultTabId: string;
  };
  dashboards: Record<string, Dashboard>;
  groups: Record<string, DashboardGroup>;
  widgetInstances: Record<string, WidgetInstance>;
  dataSources: Record<string, Record<string, unknown>>;
  modules: Record<string, ModuleInstallation>;
  moduleSettings: Record<string, Record<string, unknown>>;
  permissions: PermissionGrant[];
  markets: Record<string, MarketplaceSource>;
  themeMarkets?: Record<string, ThemeMarketplaceSource>;
  themeProfiles: Record<string, ThemeProfile>;
  uiState: {
    lastActiveTabId: string;
    tabBarPosition: "top" | "left";
    compactTabs: boolean;
    animationLevel: AnimationLevel;
    respectsReducedMotion: boolean;
    draftRetentionDays: number;
    backupRetention: number;
    workerCount: number | "auto";
    debug: boolean;
  };
  editDrafts: Record<string, EditDraft>;
}

export type MyPageSettings = MyPageSettingsV1;
