import { MY_PAGE_SCHEMA_VERSION } from "../app/constants";
import { MyPageError } from "../core/errors";
import { createDefaultSettings } from "./default-settings";

export type Migration = (settings: Record<string, unknown>) => Record<string, unknown>;

export class MigrationRunner {
  private readonly migrations = new Map<number, Migration>();

  public constructor() {
    this.register(0, (legacy) => {
      const migrated = mergeKnown(
        createDefaultSettings() as unknown as Record<string, unknown>,
        legacy,
      );
      migrated.schemaVersion = 1;
      return migrated;
    });
  }

  public register(fromVersion: number, migration: Migration): void {
    if (this.migrations.has(fromVersion)) {
      throw new MyPageError(
        `Migration from schema ${fromVersion} is already registered.`,
        "DUPLICATE_MIGRATION",
      );
    }
    this.migrations.set(fromVersion, migration);
  }

  public migrate(input: unknown): unknown {
    if (!isRecord(input)) {
      return input;
    }
    let current = structuredClone(input);
    let version = readVersion(current);
    if (version > MY_PAGE_SCHEMA_VERSION) {
      throw new MyPageError(
        `Settings schema ${version} is newer than supported schema ${MY_PAGE_SCHEMA_VERSION}.`,
        "UNSUPPORTED_FUTURE_SCHEMA",
      );
    }
    while (version < MY_PAGE_SCHEMA_VERSION) {
      const migration = this.migrations.get(version);
      if (!migration) {
        throw new MyPageError(
          `No migration is registered from schema ${version}.`,
          "MISSING_MIGRATION",
        );
      }
      current = migration(current);
      const nextVersion = readVersion(current);
      if (nextVersion !== version + 1) {
        throw new MyPageError(
          `Migration from ${version} must produce schema ${version + 1}.`,
          "INVALID_MIGRATION_RESULT",
        );
      }
      version = nextVersion;
    }
    return current;
  }
}

function mergeKnown(
  defaults: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = structuredClone(defaults);
  for (const key of Object.keys(defaults)) {
    const defaultValue = defaults[key];
    const sourceValue = source[key];
    if (
      isRecord(defaultValue) &&
      isRecord(sourceValue)
    ) {
      result[key] = mergeKnown(defaultValue, sourceValue);
    } else if (sourceValue !== undefined) {
      result[key] = structuredClone(sourceValue);
    }
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readVersion(value: Record<string, unknown>): number {
  const version = value.schemaVersion;
  return typeof version === "number" && Number.isInteger(version) ? version : 0;
}
