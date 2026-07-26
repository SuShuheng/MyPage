import type {
  DataRecord,
  DataSource,
  DataSourceChange,
  DataSourceContext,
  DataValue,
} from "../data/data-types";
import type { ModuleRuntime } from "./ModuleRuntime";
import type { ModuleSandbox } from "./ModuleSandbox";

export class SandboxDataSource implements DataSource {
  public readonly id: string;
  public readonly name: string;
  private records: DataRecord[] = [];
  private readonly listeners = new Set<(changes: DataSourceChange[]) => void>();
  private sandbox: ModuleSandbox | undefined;

  public constructor(
    private readonly moduleId: string,
    private readonly contributionId: string,
    name: string,
    private readonly runtime: ModuleRuntime,
  ) {
    this.id = `${moduleId}.${contributionId}`;
    this.name = name;
  }

  public async connect(): Promise<void> {
    if (this.sandbox) return;
    this.sandbox = await this.runtime.mountDataSource(
      this.moduleId,
      this.contributionId,
      (records) => {
        this.records = normalizeRecords(records, this.id);
        for (const listener of this.listeners) listener([{ type: "reset" }]);
      },
    );
  }

  public snapshot(_context: DataSourceContext): Promise<DataRecord[]> {
    return Promise.resolve(structuredClone(this.records));
  }

  public subscribe(listener: (changes: DataSourceChange[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public dispose(): void {
    if (this.sandbox) this.runtime.unmount(this.sandbox);
    this.sandbox = undefined;
    this.records = [];
    this.listeners.clear();
  }
}

function normalizeRecords(records: unknown[], sourceId: string): DataRecord[] {
  return records.slice(0, 20_000).flatMap((value, index): DataRecord[] => {
    if (!isRecord(value) || !isRecord(value.fields)) return [];
    const fields = Object.fromEntries(
      Object.entries(value.fields).map(([key, item]) => [key, toDataValue(item)]),
    );
    const record: DataRecord = {
      id:
        typeof value.id === "string" && value.id.length <= 500
          ? value.id
          : `${sourceId}:${index}`,
      sourceId,
      type:
        typeof value.type === "string" && value.type.length <= 120
          ? value.type
          : "external",
      fields,
    };
    if (typeof value.timestamp === "number" && Number.isFinite(value.timestamp)) {
      record.timestamp = value.timestamp;
    }
    return [record];
  });
}

function toDataValue(value: unknown): DataValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.slice(0, 10_000).map(toDataValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 1_000)
        .map(([key, item]) => [key, toDataValue(item)]),
    );
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
