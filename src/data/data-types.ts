import type {
  AggregateSpec,
  ComputedField,
  DataBinding,
  DataScope,
  QueryFilter,
  SortSpec,
  TransformSpec,
} from "../persistence/settings-types";

export type DataValue =
  | string
  | number
  | boolean
  | null
  | DataValue[]
  | { [key: string]: DataValue };

export interface DataRecord {
  id: string;
  sourceId: string;
  type: string;
  timestamp?: number;
  fields: Record<string, DataValue>;
  sourceRef?: {
    path?: string;
    blockId?: string;
    externalId?: string;
  };
}

export interface DataSourceContext {
  signal: AbortSignal;
  reportProgress: (completed: number, total?: number) => void;
}

export interface DataSource {
  id: string;
  name: string;
  connect(): Promise<void>;
  snapshot(context: DataSourceContext): Promise<DataRecord[]>;
  subscribe?(
    listener: (changes: DataSourceChange[]) => void,
  ): () => void;
  dispose(): Promise<void> | void;
}

export interface DataSourceChange {
  type: "upsert" | "delete" | "reset";
  record?: DataRecord;
  id?: string;
  path?: string;
}

export interface QueryPlan {
  scope: DataScope;
  filters: QueryFilter[];
  computedFields: ComputedField[];
  transforms: TransformSpec[];
  aggregate?: AggregateSpec;
  sort: SortSpec[];
  limit?: number;
}

export interface QueryRequest {
  records: DataRecord[];
  binding: DataBinding;
}

export interface QueryResult {
  records: DataRecord[];
  fingerprint: string;
  computedAt: number;
  durationMs: number;
  cacheHit: boolean;
}
