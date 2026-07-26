import type { Plugin } from "obsidian";
import { TypedEvent, type Unsubscribe } from "../core/events";
import type { DataBinding } from "../persistence/settings-types";
import type { WorkerCoordinator } from "../workers/WorkerCoordinator";
import type { QueryResult } from "./data-types";
import { QueryCache, fingerprint } from "./QueryCache";
import { scopeMatchesPath } from "./QueryCompiler";
import { VaultIndexer, type IndexChangeEvent } from "./VaultIndexer";
import { DataSourceRegistry } from "./DataSourceRegistry";
import type { DataSource } from "./data-types";

interface DataSubscription {
  binding: DataBinding;
  listener: (result: QueryResult) => void;
  controller?: AbortController;
}

export class DataEngine {
  private readonly indexer: VaultIndexer;
  private readonly cache = new QueryCache();
  private readonly inFlight = new Map<string, Promise<QueryResult>>();
  private readonly subscriptions = new Set<DataSubscription>();
  private readonly sources = new DataSourceRegistry();
  private readonly sourceUnsubscribers = new Map<string, () => void>();
  public readonly indexChanged = new TypedEvent<IndexChangeEvent>();

  public constructor(
    plugin: Plugin,
    private readonly workers: WorkerCoordinator,
  ) {
    this.indexer = new VaultIndexer(plugin);
    this.indexer.changed.subscribe((event) => {
      for (const path of event.paths) this.cache.invalidatePath(path);
      this.indexChanged.emit(event);
      void this.refreshAffectedSubscriptions(event.paths);
    });
  }

  public async initialize(
    signal?: AbortSignal,
    onProgress?: (completed: number, total: number) => void,
  ): Promise<void> {
    await this.indexer.build(signal, onProgress);
  }

  public async query(
    binding: DataBinding,
    signal?: AbortSignal,
  ): Promise<QueryResult> {
    const key = fingerprint(binding);
    const cached = this.cache.get(key);
    if (cached) return cached;
    // Subscriber refreshes own their AbortSignal. Sharing one of those tasks
    // across widgets lets a single cancellation abort every consumer, and can
    // also hand a just-aborted promise back to the immediate re-query that
    // follows an index change. Only signal-free, one-shot queries are deduped.
    if (signal) return this.execute(key, binding, signal);
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const promise = this.execute(key, binding).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  public subscribe(
    binding: DataBinding,
    listener: (result: QueryResult) => void,
  ): Unsubscribe {
    const subscription: DataSubscription = {
      binding: structuredClone(binding),
      listener,
    };
    this.subscriptions.add(subscription);
    void this.refreshSubscription(subscription);
    return () => {
      subscription.controller?.abort();
      this.subscriptions.delete(subscription);
    };
  }

  public async rebuild(
    signal?: AbortSignal,
    onProgress?: (completed: number, total: number) => void,
  ): Promise<void> {
    this.cache.clear();
    await this.indexer.build(signal, onProgress);
  }

  public async registerDataSource(source: DataSource): Promise<() => void> {
    await source.connect();
    const unregisterRegistry = this.sources.register(source);
    const unsubscribe = source.subscribe?.(() => {
      this.cache.clear();
      void this.refreshSourceSubscriptions(source.id);
    });
    const dispose = () => {
      unsubscribe?.();
      unregisterRegistry();
      this.sourceUnsubscribers.delete(source.id);
      this.cache.clear();
    };
    this.sourceUnsubscribers.set(source.id, dispose);
    return dispose;
  }

  public get recordCount(): number {
    return this.indexer.size;
  }

  public dispose(): void {
    for (const subscription of this.subscriptions) {
      subscription.controller?.abort();
    }
    this.subscriptions.clear();
    this.indexer.dispose();
    for (const dispose of [...this.sourceUnsubscribers.values()]) dispose();
    this.sourceUnsubscribers.clear();
    void this.sources.dispose();
    this.cache.clear();
    this.indexChanged.clear();
  }

  private async execute(
    key: string,
    binding: DataBinding,
    signal?: AbortSignal,
  ): Promise<QueryResult> {
    const startedAt = performance.now();
    const options = signal
      ? { signal, timeoutMs: 30_000 }
      : { timeoutMs: 30_000 };
    const source = this.sources.get(binding.sourceId);
    const sourceRecords = source
      ? await source.snapshot({
          signal: signal ?? new AbortController().signal,
          reportProgress: () => undefined,
        })
      : this.indexer.snapshot();
    const records = await this.workers.run(
      "query",
      {
        records: sourceRecords,
        binding: structuredClone(binding),
      },
      options,
    );
    const result: QueryResult = {
      records,
      fingerprint: key,
      computedAt: Date.now(),
      durationMs: performance.now() - startedAt,
      cacheHit: false,
    };
    this.cache.set(key, binding.scope, result);
    return structuredClone(result);
  }

  private async refreshAffectedSubscriptions(paths: string[]): Promise<void> {
    await Promise.all(
      [...this.subscriptions]
        .filter((subscription) =>
          paths.some((path) => scopeMatchesPath(subscription.binding.scope, path)),
        )
        .map(async (subscription) => this.refreshSubscription(subscription)),
    );
  }

  private async refreshSubscription(subscription: DataSubscription): Promise<void> {
    subscription.controller?.abort();
    const controller = new AbortController();
    subscription.controller = controller;
    try {
      const result = await this.query(subscription.binding, controller.signal);
      if (!controller.signal.aborted) subscription.listener(result);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.error("[MyPage] Data subscription failed", error);
      }
    }
  }

  private async refreshSourceSubscriptions(sourceId: string): Promise<void> {
    await Promise.all(
      [...this.subscriptions]
        .filter((subscription) => subscription.binding.sourceId === sourceId)
        .map(async (subscription) => this.refreshSubscription(subscription)),
    );
  }
}
