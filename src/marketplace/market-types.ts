import type {
  CapabilityId,
  PermissionScope,
} from "../persistence/settings-types";

export interface MarketManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  repository: string;
  index: ".mypage-market/index.json";
}

export interface MarketPermissionSummary {
  capability: CapabilityId;
  scope?: PermissionScope;
}

export interface MarketModuleVersion {
  version: string;
  releaseTag: string;
  downloadUrl: string;
  sha256: string;
  minMyPageVersion: string;
  maxMyPageVersion?: string;
  platforms: Array<"desktop" | "mobile">;
  permissions: MarketPermissionSummary[];
  prerelease: boolean;
}

export interface MarketModule {
  id: string;
  name: string;
  description: string;
  author: string;
  license: string;
  path: string;
  repository: string;
  categories?: string[];
  versions: MarketModuleVersion[];
}

export interface MarketIndex {
  schemaVersion: 1;
  generatedAt: string;
  repository: string;
  modules: MarketModule[];
}

export interface LoadedMarketplace {
  manifest: MarketManifest;
  index: MarketIndex;
  etag?: string;
  fetchedAt: number;
}

export interface ModuleUpdateStatus {
  moduleId: string;
  installedVersion?: string;
  latestVersion?: MarketModuleVersion;
  updateAvailable: boolean;
}
