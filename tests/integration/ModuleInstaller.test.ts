import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { DataAdapter } from "obsidian";
import { ModuleInstaller } from "../../src/modules/ModuleInstaller";
import { createDefaultSettings } from "../../src/persistence/default-settings";
import type { MyPageSettings } from "../../src/persistence/settings-types";
import type { SettingsStore } from "../../src/persistence/SettingsStore";
import { executeWorkerTask } from "../../src/workers/tasks";
import type { WorkerCoordinator } from "../../src/workers/WorkerCoordinator";

describe("ModuleInstaller integration", () => {
  it("installs atomically and never accepts package-declared trust", async () => {
    const adapter = new MemoryAdapter();
    let settings = createDefaultSettings();
    const store = {
      get snapshot() {
        return structuredClone(settings);
      },
      async update(
        mutate: (draft: MyPageSettings) => void,
        expectedRevision = settings.revision,
      ) {
        expect(expectedRevision).toBe(settings.revision);
        const draft = structuredClone(settings);
        mutate(draft);
        draft.revision += 1;
        settings = draft;
        return structuredClone(settings);
      },
    } as unknown as SettingsStore;
    const workers = {
      run: executeWorkerTask,
    } as unknown as WorkerCoordinator;
    const installer = new ModuleInstaller(
      adapter as unknown as DataAdapter,
      ".obsidian/plugins/mypage",
      store,
      workers,
    );
    const manifest = {
      schemaVersion: 1,
      id: "trusted-request",
      name: "Trusted request",
      version: "1.0.0",
      description: "test",
      author: "test",
      license: "MIT",
      minMyPageVersion: "1.0.0",
      platforms: ["desktop"],
      entry: "main.js",
      styles: "styles.css",
      configSchema: "config.schema.json",
      trust: "trusted",
      permissions: [],
      contributions: [{ id: "widget", kind: "widget", name: "Widget" }],
    };
    const encode = (value: string) => new TextEncoder().encode(value);
    const archive = zipSync({
      "manifest.json": encode(JSON.stringify(manifest)),
      "main.js": encode("export function activate(api){api.root.textContent='ok'}"),
      "styles.css": encode(""),
      "config.schema.json": encode('{"type":"object"}'),
      "README.md": encode("# Test"),
    });
    await installer.install(archive, { sourceType: "official" });
    expect(settings.modules["trusted-request"]?.sourceType).toBe("official");
    expect(settings.modules["trusted-request"]?.trustLevel).toBe("sandbox");
    expect(
      await adapter.exists(
        ".obsidian/plugins/mypage/diy-plugins/trusted-request/main.js",
      ),
    ).toBe(true);
  });
});

class MemoryAdapter {
  private readonly folders = new Set<string>(["."]);
  private readonly files = new Map<string, ArrayBuffer>();

  public async exists(path: string): Promise<boolean> {
    return this.folders.has(path) || this.files.has(path);
  }

  public async mkdir(path: string): Promise<void> {
    this.folders.add(path);
  }

  public async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    this.files.set(path, data.slice(0));
  }

  public async rename(from: string, to: string): Promise<void> {
    for (const folder of [...this.folders]) {
      if (folder === from || folder.startsWith(`${from}/`)) {
        this.folders.delete(folder);
        this.folders.add(`${to}${folder.slice(from.length)}`);
      }
    }
    for (const [file, data] of [...this.files]) {
      if (file === from || file.startsWith(`${from}/`)) {
        this.files.delete(file);
        this.files.set(`${to}${file.slice(from.length)}`, data);
      }
    }
  }

  public async rmdir(path: string): Promise<void> {
    for (const folder of [...this.folders]) {
      if (folder === path || folder.startsWith(`${path}/`)) this.folders.delete(folder);
    }
    for (const file of [...this.files.keys()]) {
      if (file.startsWith(`${path}/`)) this.files.delete(file);
    }
  }
}
