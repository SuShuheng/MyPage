import { describe, expect, it } from "vitest";
import { PermissionService } from "../../../src/permissions/PermissionService";
import { createDefaultSettings } from "../../../src/persistence/default-settings";
import type { MyPageSettings } from "../../../src/persistence/settings-types";
import type { SettingsStore } from "../../../src/persistence/SettingsStore";

describe("PermissionService dual trust", () => {
  it("requires explicit trust and capability grants even for official modules", async () => {
    const settings = createDefaultSettings();
    settings.modules.sample = {
      id: "sample",
      name: "Official sample",
      version: "1.0.0",
      sourceType: "official",
      enabled: true,
      trustLevel: "sandbox",
      installedAt: 1,
      platform: ["desktop"],
    };
    const service = new PermissionService(mockStore(settings));

    await expect(
      service.grant("sample", "externalFs.read", { paths: ["C:/allowed"] }),
    ).rejects.toThrow(/显式设为受信任/);
    expect(
      service.isGranted("sample", "externalFs.read", { path: "C:/allowed/a.md" }),
    ).toBe(false);

    await service.setTrustLevel("sample", "trusted");
    expect(
      service.isGranted("sample", "externalFs.read", { path: "C:/allowed/a.md" }),
    ).toBe(false);
    await service.grant("sample", "externalFs.read", { paths: ["C:/allowed"] });
    expect(
      service.isGranted("sample", "externalFs.read", { path: "C:/allowed/a.md" }),
    ).toBe(true);

    await service.setTrustLevel("sample", "sandbox");
    expect(service.list("sample")).toHaveLength(0);
  });
});

function mockStore(initial: MyPageSettings): SettingsStore {
  let current = structuredClone(initial);
  return {
    get snapshot() {
      return structuredClone(current);
    },
    async update(
      mutate: (draft: MyPageSettings) => void,
      expectedRevision = current.revision,
    ) {
      if (expectedRevision !== current.revision) throw new Error("stale");
      const draft = structuredClone(current);
      mutate(draft);
      draft.revision += 1;
      current = draft;
      return structuredClone(current);
    },
  } as unknown as SettingsStore;
}
