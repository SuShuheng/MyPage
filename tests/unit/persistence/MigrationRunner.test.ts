import { describe, expect, it } from "vitest";
import { MigrationRunner } from "../../../src/persistence/MigrationRunner";

describe("MigrationRunner", () => {
  it("returns current settings without changing the input", () => {
    const runner = new MigrationRunner();
    const input = { schemaVersion: 1, nested: { value: 1 } };
    const output = runner.migrate(input);
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
  });

  it("rejects unsupported future schemas", () => {
    const runner = new MigrationRunner();
    expect(() => runner.migrate({ schemaVersion: 99 })).toThrow(
      /newer than supported/,
    );
  });

  it("migrates schema-less legacy settings through version 0", () => {
    const runner = new MigrationRunner();
    const migrated = runner.migrate({
      revision: 7,
      general: { openOnStartup: true },
    }) as Record<string, unknown>;
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.revision).toBe(7);
    expect(migrated.general).toMatchObject({ openOnStartup: true });
  });
});
