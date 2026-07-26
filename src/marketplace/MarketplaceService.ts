import { gt, rcompare, satisfies } from "semver";
import { Platform } from "obsidian";
import manifestJson from "../../manifest.json";
import type { ModuleInstaller } from "../modules/ModuleInstaller";
import type { SettingsStore } from "../persistence/SettingsStore";
import type { MarketplaceSource } from "../persistence/settings-types";
import type {
  MarketIndex,
  MarketModule,
  MarketModuleVersion,
  ModuleUpdateStatus,
} from "./market-types";
import type { GithubMarketClient} from "./GithubMarketClient";
import { normalizeRepository } from "./GithubMarketClient";
import { validateMarketIndex } from "./market-schema";

export type MarketCheckReason = "official-page-open" | "manual";

export class MarketplaceService {
  public constructor(
    private readonly store: SettingsStore,
    private readonly client: GithubMarketClient,
    private readonly installer: ModuleInstaller,
  ) {}

  public async addThirdParty(repository: string): Promise<string> {
    const repo = normalizeRepository(repository);
    const loaded = await this.client.fetch(repo);
    if ("notModified" in loaded) throw new Error("新市场不能返回未修改状态。");
    const id = `third-party:${repo.toLocaleLowerCase()}`;
    const snapshot = this.store.snapshot;
    await this.store.update(
      (draft) => {
        const cachedIndex: {
          etag?: string;
          fetchedAt: number;
          index: MarketIndex;
        } = {
          fetchedAt: loaded.fetchedAt,
          index: loaded.index,
        };
        if (loaded.etag !== undefined) cachedIndex.etag = loaded.etag;
        draft.markets[id] = {
          id,
          repo,
          type: "third-party",
          enabled: true,
          cachedIndex,
          lastManualCheckAt: Date.now(),
        };
      },
      snapshot.revision,
      "add-third-party-market",
    );
    return id;
  }

  public async check(
    sourceId: string,
    reason: MarketCheckReason,
    signal?: AbortSignal,
  ): Promise<MarketIndex> {
    const source = this.requireSource(sourceId);
    if (source.type === "third-party" && reason !== "manual") {
      return this.cachedIndex(source);
    }
    const loaded = await this.client.fetch(
      source.repo,
      source.cachedIndex?.etag,
      signal,
    );
    if ("notModified" in loaded) {
      const index = this.cachedIndex(source);
      if (reason === "manual" && source.type === "third-party") {
        await this.touchManualCheck(sourceId);
      }
      return index;
    }
    const snapshot = this.store.snapshot;
    await this.store.update(
      (draft) => {
        const target = draft.markets[sourceId];
        if (!target) return;
        const cachedIndex: {
          etag?: string;
          fetchedAt: number;
          index: MarketIndex;
        } = {
          fetchedAt: loaded.fetchedAt,
          index: loaded.index,
        };
        if (loaded.etag !== undefined) cachedIndex.etag = loaded.etag;
        target.cachedIndex = cachedIndex;
        if (reason === "manual" && target.type === "third-party") {
          target.lastManualCheckAt = Date.now();
        }
      },
      snapshot.revision,
      "refresh-market-index",
    );
    return loaded.index;
  }

  public getCached(sourceId: string): MarketIndex | undefined {
    const source = this.store.snapshot.markets[sourceId];
    if (!source?.cachedIndex || !validateMarketIndex(source.cachedIndex.index)) {
      return undefined;
    }
    return structuredClone(source.cachedIndex.index);
  }

  public listSources(): MarketplaceSource[] {
    return Object.values(this.store.snapshot.markets);
  }

  public updateStatuses(index: MarketIndex): ModuleUpdateStatus[] {
    const installed = this.store.snapshot.modules;
    return index.modules.map((module) => {
      const current = installed[module.id];
      const latest = selectLatestCompatible(module);
      const status: ModuleUpdateStatus = {
        moduleId: module.id,
        updateAvailable: Boolean(
          current && latest && gt(latest.version, current.version),
        ),
      };
      if (current) status.installedVersion = current.version;
      if (latest) status.latestVersion = latest;
      return status;
    });
  }

  public async install(
    sourceId: string,
    moduleId: string,
    version?: string,
    signal?: AbortSignal,
  ) {
    const source = this.requireSource(sourceId);
    const index = this.cachedIndex(source);
    const module = index.modules.find((candidate) => candidate.id === moduleId);
    if (!module) throw new Error(`市场中找不到模块 ${moduleId}。`);
    const selected = version
      ? module.versions.find((candidate) => candidate.version === version)
      : selectLatestCompatible(module);
    if (!selected) throw new Error("没有与当前 MyPage 和平台兼容的模块版本。");
    const archive = await this.client.download(selected.downloadUrl, signal);
    return this.installer.install(archive, {
      sourceType: source.type === "official" ? "official" : "third-party",
      sourceId,
      expectedSha256: selected.sha256,
    });
  }

  private requireSource(sourceId: string): MarketplaceSource {
    const source = this.store.snapshot.markets[sourceId];
    if (!source || !source.enabled) throw new Error(`市场 ${sourceId} 未启用。`);
    return source;
  }

  private cachedIndex(source: MarketplaceSource): MarketIndex {
    const index = source.cachedIndex?.index;
    if (!validateMarketIndex(index)) throw new Error("市场没有可用的缓存索引。");
    return structuredClone(index);
  }

  private async touchManualCheck(sourceId: string): Promise<void> {
    const snapshot = this.store.snapshot;
    await this.store.update(
      (draft) => {
        const source = draft.markets[sourceId];
        if (source) source.lastManualCheckAt = Date.now();
      },
      snapshot.revision,
      "touch-third-party-market",
    );
  }
}

function selectLatestCompatible(module: MarketModule): MarketModuleVersion | undefined {
  return [...module.versions]
    .filter(
      (version) =>
        satisfies(manifestJson.version, `>=${version.minMyPageVersion}`) &&
        (!version.maxMyPageVersion ||
          satisfies(manifestJson.version, `<=${version.maxMyPageVersion}`)) &&
        version.platforms.includes(Platform.isMobile ? "mobile" : "desktop"),
    )
    .sort((left, right) => rcompare(left.version, right.version))[0];
}
