import { describe, expect, it } from "vitest";
import { BlueprintExporter } from "../../../src/blueprint/BlueprintExporter";
import { createDefaultSettings } from "../../../src/persistence/default-settings";

describe("BlueprintExporter", () => {
  it("exports configuration without permissions or executable code", () => {
    const settings = createDefaultSettings();
    settings.permissions.push({
      moduleId: "test",
      capability: "vault.read",
      scope: { paths: ["/"] },
      vaultId: settings.general.vaultId,
      deviceId: settings.general.deviceId,
      grantedAt: 0,
      moduleVersion: "1.0.0",
    });
    const exporter = new BlueprintExporter({
      snapshot: settings,
    } as never);
    const blueprint = exporter.export("dashboard-home");
    const json = JSON.stringify(blueprint);
    expect(json).not.toContain('"permissions"');
    expect(json).not.toContain("main.js");
    expect(blueprint.widgets).toHaveProperty("widget-total-notes");
  });
});
