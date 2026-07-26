import {
  getAllTags,
  TFile,
  type CachedMetadata,
  type Plugin,
  type TAbstractFile,
} from "obsidian";
import { TypedEvent } from "../core/events";
import type { DataRecord, DataValue } from "./data-types";

export interface IndexChangeEvent {
  paths: string[];
  type: "build" | "upsert" | "delete" | "rename";
}

export class VaultIndexer {
  private readonly records = new Map<string, DataRecord>();
  private building: Promise<void> | undefined;
  public readonly changed = new TypedEvent<IndexChangeEvent>();

  public constructor(private readonly plugin: Plugin) {
    this.plugin.registerEvent(
      this.plugin.app.vault.on("create", (file) => {
        if (isMarkdownFile(file)) void this.upsert(file, "upsert");
      }),
    );
    this.plugin.registerEvent(
      this.plugin.app.vault.on("modify", (file) => {
        if (isMarkdownFile(file)) void this.upsert(file, "upsert");
      }),
    );
    this.plugin.registerEvent(
      this.plugin.app.vault.on("delete", (file) => {
        const removed = this.removePath(file.path);
        if (removed) {
          this.changed.emit({ paths: [file.path], type: "delete" });
        }
      }),
    );
    this.plugin.registerEvent(
      this.plugin.app.vault.on("rename", (file, oldPath) => {
        this.removePath(oldPath);
        if (isMarkdownFile(file)) {
          void this.upsert(file, "rename", oldPath);
        }
      }),
    );
    this.plugin.registerEvent(
      this.plugin.app.metadataCache.on("changed", (file) => {
        if (isMarkdownFile(file)) void this.upsert(file, "upsert");
      }),
    );
  }

  public async build(
    signal?: AbortSignal,
    onProgress?: (completed: number, total: number) => void,
  ): Promise<void> {
    if (this.building) return this.building;
    this.building = this.buildInternal(signal, onProgress).finally(() => {
      this.building = undefined;
    });
    return this.building;
  }

  public snapshot(): DataRecord[] {
    return [...this.records.values()].map((record) => structuredClone(record));
  }

  public get size(): number {
    return this.records.size;
  }

  public dispose(): void {
    this.records.clear();
    this.changed.clear();
  }

  private async buildInternal(
    signal?: AbortSignal,
    onProgress?: (completed: number, total: number) => void,
  ): Promise<void> {
    const files = this.plugin.app.vault.getMarkdownFiles();
    const next = new Map<string, DataRecord>();
    const batchSize = 100;
    for (let start = 0; start < files.length; start += batchSize) {
      if (signal?.aborted) throw new DOMException("Index build aborted.", "AbortError");
      const batch = files.slice(start, start + batchSize);
      for (const file of batch) {
        const records = await this.createRecords(file);
        for (const record of records) next.set(record.id, record);
      }
      onProgress?.(Math.min(start + batch.length, files.length), files.length);
      await yieldToMainThread();
    }
    this.records.clear();
    for (const [path, record] of next) this.records.set(path, record);
    this.changed.emit({ paths: [...next.keys()], type: "build" });
  }

  private async upsert(
    file: TFile,
    type: "upsert" | "rename",
    oldPath?: string,
  ): Promise<void> {
    await yieldToMainThread();
    this.removePath(file.path);
    const records = await this.createRecords(file);
    for (const record of records) this.records.set(record.id, record);
    this.changed.emit({
      paths: oldPath ? [oldPath, file.path] : [file.path],
      type,
    });
  }

  private async createRecords(file: TFile): Promise<DataRecord[]> {
    const cache = this.plugin.app.metadataCache.getFileCache(file);
    const frontmatter = sanitizeFrontmatter(cache?.frontmatter);
    const tags = cache ? getAllTags(cache) ?? [] : [];
    const links = [
      ...Object.keys(cache?.links ?? {}),
      ...Object.keys(cache?.embeds ?? {}),
    ];
    const taskCount =
      cache?.listItems?.filter((item) => item.task !== undefined).length ?? 0;
    const fileRecord: DataRecord = {
      id: `vault:${file.path}`,
      sourceId: "core.vault-files",
      type: "vault-file",
      timestamp: file.stat.mtime,
      fields: {
        path: file.path,
        name: file.name,
        basename: file.basename,
        extension: file.extension,
        folder: file.parent?.path ?? "/",
        created: file.stat.ctime,
        modified: file.stat.mtime,
        size: file.stat.size,
        frontmatter,
        tags,
        links,
        linkCount: links.length,
        taskCount,
      },
      sourceRef: { path: file.path },
    };
    if (taskCount === 0) return [fileRecord];

    const content = await this.plugin.app.vault.cachedRead(file);
    const lines = content.split(/\r?\n/u);
    const taskRecords = (cache?.listItems ?? []).flatMap((item): DataRecord[] => {
      if (item.task === undefined) return [];
      const line = item.position.start.line;
      const source = lines[line] ?? "";
      const match = source.match(/^\s*[-*+]\s+\[([ xX-])\]\s+(.*)$/u);
      if (!match) return [];
      const marker = (match[1] ?? " ").toLocaleLowerCase();
      const text = match[2]?.trim() ?? "";
      return [{
        id: `task:${file.path}:${line}`,
        sourceId: "core.tasks",
        type: "task",
        timestamp: file.stat.mtime,
        fields: {
          path: file.path,
          filePath: file.path,
          basename: file.basename,
          extension: file.extension,
          folder: file.parent?.path ?? "/",
          line,
          marker,
          completed: marker === "x",
          status: marker === "x" ? "completed" : marker === "-" ? "cancelled" : "open",
          text,
          modified: file.stat.mtime,
          tags,
        },
        sourceRef: { path: file.path, blockId: `line-${line}` },
      }];
    });
    return [fileRecord, ...taskRecords];
  }

  private removePath(path: string): boolean {
    let removed = false;
    for (const [id, record] of this.records) {
      if (record.sourceRef?.path === path) {
        this.records.delete(id);
        removed = true;
      }
    }
    return removed;
  }
}

function sanitizeFrontmatter(
  frontmatter: CachedMetadata["frontmatter"] | undefined,
): Record<string, DataValue> {
  if (!frontmatter) return {};
  return Object.fromEntries(
    Object.entries(frontmatter)
      .filter(([key]) => key !== "position")
      .map(([key, value]) => [key, toDataValue(value)]),
  );
}

function toDataValue(value: unknown): DataValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) return value;
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(toDataValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toDataValue(item)]),
    );
  }
  return String(value);
}

function isMarkdownFile(file: TAbstractFile): file is TFile {
  return file instanceof TFile && file.extension.toLocaleLowerCase() === "md";
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}
