import type { SettingsStore } from "../persistence/SettingsStore";
import type {
  ThemeMarketplaceSource,
  ThemeProfile,
} from "../persistence/settings-types";
import type { WorkerCoordinator } from "../workers/WorkerCoordinator";
import {
  fetchGithub,
  type GithubRequest,
} from "../core/github-fetch";
import { normalizeRepository } from "../marketplace/GithubMarketClient";
import { OFFICIAL_THEMES } from "./official-themes";

export interface ThemeMarketIndex {
  schemaVersion: 1;
  repository: string;
  generatedAt: string;
  themes: ThemeProfile[];
}

export class ThemeMarketplaceService {
  public constructor(
    private readonly store: SettingsStore,
    private readonly workers: WorkerCoordinator,
    private readonly request: GithubRequest = fetchGithub,
  ) {}

  public officialThemes(): ThemeProfile[] {
    return structuredClone(OFFICIAL_THEMES);
  }

  public async syncInstalledOfficialThemes(): Promise<void> {
    const snapshot = this.store.snapshot;
    const installed = OFFICIAL_THEMES.filter(
      (theme) => snapshot.themeProfiles[theme.id]?.sourceType === "official",
    );
    if (installed.length === 0) return;
    await this.store.update(
      (draft) => {
        for (const theme of installed) {
          draft.themeProfiles[theme.id] = {
            ...structuredClone(theme),
            sourceType: "official",
            sourceId: "official",
          };
        }
      },
      snapshot.revision,
      "sync-official-themes",
    );
  }

  public listThirdPartySources(): ThemeMarketplaceSource[] {
    return Object.values(this.store.snapshot.themeMarkets ?? {});
  }

  public getCached(sourceId: string): ThemeMarketIndex | undefined {
    const cached = this.store.snapshot.themeMarkets?.[sourceId]?.cachedIndex?.index;
    return validateThemeMarketIndex(cached) ? structuredClone(cached) : undefined;
  }

  public async addThirdParty(repository: string): Promise<string> {
    const repo = normalizeRepository(repository);
    const index = await this.fetch(repo);
    const id = `theme:${repo.toLocaleLowerCase()}`;
    const snapshot = this.store.snapshot;
    await this.store.update(
      (draft) => {
        draft.themeMarkets ??= {};
        draft.themeMarkets[id] = {
          id,
          repo,
          type: "third-party",
          enabled: true,
          lastManualCheckAt: Date.now(),
          cachedIndex: {
            fetchedAt: Date.now(),
            index,
          },
        };
      },
      snapshot.revision,
      "add-third-party-theme-market",
    );
    return id;
  }

  public async check(sourceId: string): Promise<ThemeMarketIndex> {
    const source = this.store.snapshot.themeMarkets?.[sourceId];
    if (!source?.enabled) throw new Error("第三方主题市场不存在或未启用。");
    const index = await this.fetch(source.repo);
    const snapshot = this.store.snapshot;
    await this.store.update(
      (draft) => {
        const target = draft.themeMarkets?.[sourceId];
        if (!target) return;
        target.cachedIndex = { fetchedAt: Date.now(), index };
        target.lastManualCheckAt = Date.now();
      },
      snapshot.revision,
      "refresh-third-party-theme-market",
    );
    return index;
  }

  public async install(theme: ThemeProfile, sourceId = "official"): Promise<void> {
    const snapshot = this.store.snapshot;
    await this.store.update(
      (draft) => {
        draft.themeProfiles[theme.id] = {
          ...structuredClone(theme),
          sourceType: sourceId === "official" ? "official" : "third-party",
          sourceId,
        };
      },
      snapshot.revision,
      "install-theme",
    );
  }

  public async uninstall(themeId: string): Promise<void> {
    if (themeId === "theme-default") throw new Error("不能卸载默认主题。");
    const snapshot = this.store.snapshot;
    const used = Object.values(snapshot.dashboards).some(
      (dashboard) => dashboard.themeProfileId === themeId,
    );
    if (used) throw new Error("此主题正被主页使用，请先在“外观”中切换主题。");
    await this.store.update(
      (draft) => {
        delete draft.themeProfiles[themeId];
      },
      snapshot.revision,
      "uninstall-theme",
    );
  }

  private async fetch(repository: string): Promise<ThemeMarketIndex> {
    const repo = normalizeRepository(repository);
    const response = await this.request(
      `https://raw.githubusercontent.com/${repo}/HEAD/.mypage-theme-market/index.json`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) {
      throw new Error(`无法读取主题市场强制索引：HTTP ${response.status}`);
    }
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > 2 * 1024 * 1024) throw new Error("主题市场索引超过 2 MiB。");
    const value = await response.json() as unknown;
    const validation = await this.workers.run("schema", {
      schema: THEME_MARKET_SCHEMA,
      value,
    });
    if (
      !validation.valid ||
      !validateThemeMarketIndex(value) ||
      value.repository !== repo
    ) {
      throw new Error(
        `主题市场索引无效：${validation.errors.join("; ") || "repository 或主题字段错误"}`,
      );
    }
    return structuredClone(value);
  }
}

export function validateThemeMarketIndex(
  value: unknown,
): value is ThemeMarketIndex {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  if (
    typeof value.repository !== "string" ||
    typeof value.generatedAt !== "string" ||
    !Array.isArray(value.themes)
  ) {
    return false;
  }
  return value.themes.every(
    (theme) =>
      isRecord(theme) &&
      typeof theme.id === "string" &&
      typeof theme.name === "string" &&
      ["obsidian", "light", "dark"].includes(String(theme.mode)) &&
      isRecord(theme.tokens),
  );
}

const THEME_MARKET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "repository", "generatedAt", "themes"],
  properties: {
    schemaVersion: { const: 1 },
    repository: { type: "string" },
    generatedAt: { type: "string" },
    themes: {
      type: "array",
      maxItems: 500,
      items: {
        type: "object",
        required: ["id", "name", "mode", "tokens"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          mode: { enum: ["obsidian", "light", "dark"] },
          tokens: { type: "object" },
        },
      },
    },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
