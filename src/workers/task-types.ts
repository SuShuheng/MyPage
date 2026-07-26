import type { DataRecord } from "../data/data-types";
import type { DataBinding } from "../persistence/settings-types";

export type WorkerTaskType =
  | "query"
  | "hash"
  | "schema"
  | "market-parse"
  | "zip-inspect";

export interface WorkerTaskPayloads {
  query: { records: DataRecord[]; binding: DataBinding };
  hash: { data: Uint8Array };
  schema: { schema: object; value: unknown };
  "market-parse": { value: unknown };
  "zip-inspect": {
    data: Uint8Array;
    limits?: {
      maxFiles?: number;
      maxFileBytes?: number;
      maxUncompressedBytes?: number;
      maxCompressionRatio?: number;
    };
  };
}

export interface WorkerTaskResults {
  query: DataRecord[];
  hash: string;
  schema: { valid: boolean; errors: string[] };
  "market-parse": { valid: boolean; errors: string[]; value: unknown };
  "zip-inspect": {
    files: Record<string, Uint8Array>;
    totalUncompressedBytes: number;
  };
}

export interface WorkerRequest<T extends WorkerTaskType = WorkerTaskType> {
  id: string;
  type: T;
  payload: WorkerTaskPayloads[T];
}

export interface WorkerResponse<T extends WorkerTaskType = WorkerTaskType> {
  id: string;
  type: T;
  ok: boolean;
  result?: WorkerTaskResults[T];
  error?: string;
}
