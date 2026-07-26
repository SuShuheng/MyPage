import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DataAdapter } from "obsidian";
import { UpdateInstaller } from "../../src/updater/UpdateInstaller";
import type { GithubReleaseClient } from "../../src/updater/GithubReleaseClient";
import type { AvailableUpdate } from "../../src/updater/update-types";
import { executeWorkerTask } from "../../src/workers/tasks";
import type { WorkerCoordinator } from "../../src/workers/WorkerCoordinator";

describe("UpdateInstaller rollback", () => {
  it("restores all current files if atomic replacement fails", async () => {
    const adapter = new UpdateMemoryAdapter();
    const pluginRoot = ".obsidian/plugins/mypage";
    const original = {
      "main.js": encode("old-main"),
      "manifest.json": encode('{"id":"mypage","version":"1.0.0"}'),
      "styles.css": encode("old-style"),
    };
    for (const [name, bytes] of Object.entries(original)) {
      await adapter.writeBinary(`${pluginRoot}/${name}`, toBuffer(bytes));
    }
    const next = {
      "main.js": encode("new-main"),
      "manifest.json": encode('{"id":"mypage","version":"1.1.0"}'),
      "styles.css": encode("new-style"),
    };
    const sums = Object.entries(next)
      .map(([name, bytes]) => `${hash(bytes)}  ${name}`)
      .join("\n");
    const assets = {
      sums: encode(sums),
      main: next["main.js"],
      manifest: next["manifest.json"],
      styles: next["styles.css"],
    };
    const client = {
      async download(url: string) {
        if (url.endsWith("SHA256SUMS")) return assets.sums;
        if (url.endsWith("main.js")) return assets.main;
        if (url.endsWith("manifest.json")) return assets.manifest;
        return assets.styles;
      },
    } as unknown as GithubReleaseClient;
    const installer = new UpdateInstaller(
      adapter as unknown as DataAdapter,
      pluginRoot,
      { run: executeWorkerTask } as unknown as WorkerCoordinator,
      client,
    );
    adapter.failRenameSuffix = "/styles.css";
    await expect(installer.install(updateFixture())).rejects.toThrow(/simulated/);
    for (const [name, bytes] of Object.entries(original)) {
      expect(decode(adapter.readBytes(`${pluginRoot}/${name}`))).toBe(decode(bytes));
    }
  });
});

function updateFixture(): AvailableUpdate {
  const names = ["SHA256SUMS", "main.js", "manifest.json", "styles.css"];
  return {
    version: "1.1.0",
    release: {
      tag_name: "1.1.0",
      name: "1.1.0",
      body: "",
      html_url: "https://github.com/SuShuHeng/MyPage/releases/tag/1.1.0",
      prerelease: false,
      draft: false,
      published_at: "2026-01-01T00:00:00Z",
      assets: names.map((name) => ({
        name,
        browser_download_url: `https://github.com/${name}`,
        size: 1,
      })),
    },
  };
}

class UpdateMemoryAdapter {
  public failRenameSuffix = "";
  private readonly folders = new Set<string>();
  private readonly files = new Map<string, Uint8Array>();

  public async exists(path: string): Promise<boolean> {
    return this.folders.has(path) || this.files.has(path);
  }

  public async mkdir(path: string): Promise<void> {
    this.folders.add(path);
  }

  public async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    this.files.set(path, new Uint8Array(data.slice(0)));
  }

  public async copy(from: string, to: string): Promise<void> {
    const bytes = this.files.get(from);
    if (!bytes) throw new Error(`missing ${from}`);
    this.files.set(to, bytes.slice());
  }

  public async remove(path: string): Promise<void> {
    this.files.delete(path);
  }

  public async rename(from: string, to: string): Promise<void> {
    if (this.failRenameSuffix && from.endsWith(this.failRenameSuffix)) {
      throw new Error("simulated replacement failure");
    }
    const bytes = this.files.get(from);
    if (!bytes) throw new Error(`missing ${from}`);
    this.files.delete(from);
    this.files.set(to, bytes);
  }

  public async rmdir(path: string): Promise<void> {
    this.folders.delete(path);
    for (const file of [...this.files.keys()]) {
      if (file.startsWith(`${path}/`)) this.files.delete(file);
    }
  }

  public readBytes(path: string): Uint8Array {
    const value = this.files.get(path);
    if (!value) throw new Error(`missing ${path}`);
    return value;
  }
}

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decode(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

function toBuffer(value: Uint8Array): ArrayBuffer {
  return value.slice().buffer;
}

function hash(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
