import type {
  CapabilityId,
  ModuleSourceType,
  ModuleTrustLevel,
  PermissionScope,
} from "../persistence/settings-types";

export type ContributionKind =
  | "widget"
  | "dataSource"
  | "transform"
  | "action"
  | "dashboardTemplate"
  | "settings";

export interface ModuleContribution {
  id: string;
  kind: ContributionKind;
  name: string;
  description?: string;
  icon?: string;
  entry?: string;
  defaultSize?: { w: number; h: number };
  configSchema?: string;
}

export interface ModulePermissionRequest {
  capability: CapabilityId;
  reason: string;
  suggestedScope?: PermissionScope;
}

export interface ModuleManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  minMyPageVersion: string;
  maxMyPageVersion?: string;
  platforms: Array<"desktop" | "mobile">;
  entry: "main.js";
  styles: "styles.css";
  configSchema: "config.schema.json";
  trust: ModuleTrustLevel;
  permissions: ModulePermissionRequest[];
  contributions: ModuleContribution[];
}

export interface InstalledModule {
  manifest: ModuleManifest;
  directory: string;
  sourceType: ModuleSourceType;
  sourceId?: string;
  enabled: boolean;
}

export interface ModuleRpcRequest {
  type: "rpc";
  session: string;
  id: string;
  capability: CapabilityId;
  input: unknown;
}

export interface ModuleRpcResponse {
  type: "rpc-result";
  session: string;
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}
