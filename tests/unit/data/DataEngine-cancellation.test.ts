import { describe, expect, it, vi } from "vitest";
import { DataEngine } from "../../../src/data/DataEngine";
import { DEFAULT_DATA_BINDING } from "../../../src/persistence/default-settings";
import type { QueryResult } from "../../../src/data/data-types";

describe("DataEngine subscription cancellation", () => {
  it("starts a fresh worker query when an index change aborts the initial query", async () => {
    const calls: Array<{
      resolve: (value: unknown[]) => void;
      reject: (error: Error) => void;
    }> = [];
    const workers = {
      run: vi.fn(
        (
          _type: string,
          _payload: unknown,
          options: { signal?: AbortSignal },
        ) =>
          new Promise<unknown[]>((resolve, reject) => {
            const call = { resolve, reject };
            calls.push(call);
            options.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Task aborted.", "AbortError")),
              { once: true },
            );
          }),
      ),
    };
    const plugin = {
      registerEvent: vi.fn(),
      app: {
        vault: {
          on: vi.fn(() => ({})),
          getMarkdownFiles: vi.fn(() => []),
        },
        metadataCache: {
          on: vi.fn(() => ({})),
        },
      },
    };
    const engine = new DataEngine(
      plugin as never,
      workers as never,
    );
    const results: QueryResult[] = [];

    const unsubscribe = engine.subscribe(
      structuredClone(DEFAULT_DATA_BINDING),
      (result) => results.push(result),
    );
    await Promise.resolve();
    expect(calls).toHaveLength(1);

    const internal = engine as unknown as {
      indexer: {
        changed: {
          emit(event: { paths: string[]; type: "build" }): void;
        };
      };
    };
    internal.indexer.changed.emit({ paths: ["欢迎.md"], type: "build" });
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toHaveLength(2);
    calls[1]?.resolve([]);
    await vi.waitFor(() => expect(results).toHaveLength(1));

    unsubscribe();
    engine.dispose();
  });
});
