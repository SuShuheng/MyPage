import { describe, expect, it, vi } from "vitest";
import type { Plugin } from "obsidian";
import { SettingsStore } from "../../src/persistence/SettingsStore";

describe("SettingsStore recovery mode", () => {
  it("preserves invalid data and starts in safe in-memory mode", async () => {
    const adapter = new RecoveryAdapter();
    const saveData = vi.fn();
    const plugin = {
      manifest: { id: "mypage", dir: ".obsidian/plugins/mypage" },
      app: {
        vault: {
          configDir: ".obsidian",
          adapter,
        },
      },
      loadData: vi.fn(async () => ({
        schemaVersion: 1,
        revision: 2,
        general: { openOnStartup: "corrupt" },
      })),
      saveData,
    } as unknown as Plugin;
    const store = new SettingsStore(plugin);
    const settings = await store.load();
    expect(settings.general.safeMode).toBe(true);
    expect(store.recoveryMode).toMatch(/校验失败/);
    expect(saveData).not.toHaveBeenCalled();
    expect(
      [...adapter.files.keys()].some((path) =>
        path.includes("/backups/") && path.endsWith("-invalid-settings.json"),
      ),
    ).toBe(true);
  });
});

class RecoveryAdapter {
  public readonly files = new Map<string, string>();
  private readonly folders = new Set<string>();

  public async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.folders.has(path);
  }

  public async mkdir(path: string): Promise<void> {
    this.folders.add(path);
  }

  public async write(path: string, value: string): Promise<void> {
    this.files.set(path, value);
  }
}
