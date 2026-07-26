import type { SettingsStore } from "../persistence/SettingsStore";
import type {
  CapabilityId,
  ModuleTrustLevel,
  PermissionGrant,
  PermissionScope,
} from "../persistence/settings-types";
import { isHighRiskCapability } from "./capabilities";
import {
  grantMatches,
  type CapabilityRequestContext,
} from "./PermissionMatcher";

export class PermissionService {
  public constructor(private readonly store: SettingsStore) {}

  public isGranted(
    moduleId: string,
    capability: CapabilityId,
    request: CapabilityRequestContext,
  ): boolean {
    const settings = this.store.snapshot;
    const module = settings.modules[moduleId];
    if (!module || !module.enabled) return false;
    if (isHighRiskCapability(capability) && module.trustLevel !== "trusted") {
      return false;
    }
    return settings.permissions.some((grant) =>
      grantMatches(
        grant,
        moduleId,
        module.version,
        capability,
        settings.general.vaultId,
        settings.general.deviceId,
        request,
      ),
    );
  }

  public async grant(
    moduleId: string,
    capability: CapabilityId,
    scope: PermissionScope,
  ): Promise<void> {
    const snapshot = this.store.snapshot;
    const module = snapshot.modules[moduleId];
    if (!module) throw new Error(`模块 ${moduleId} 尚未安装。`);
    if (isHighRiskCapability(capability) && module.trustLevel !== "trusted") {
      throw new Error("沙箱模块不能申请高风险能力；请先显式设为受信任模块。");
    }
    const grant: PermissionGrant = {
      moduleId,
      capability,
      scope: structuredClone(scope),
      vaultId: snapshot.general.vaultId,
      deviceId: snapshot.general.deviceId,
      grantedAt: Date.now(),
      moduleVersion: module.version,
    };
    await this.store.update(
      (draft) => {
        draft.permissions = draft.permissions.filter(
          (existing) =>
            !(
              existing.moduleId === moduleId &&
              existing.capability === capability &&
              existing.vaultId === grant.vaultId &&
              existing.deviceId === grant.deviceId
            ),
        );
        draft.permissions.push(grant);
      },
      snapshot.revision,
      "grant-module-permission",
    );
  }

  public async revoke(
    moduleId: string,
    capability?: CapabilityId,
  ): Promise<void> {
    const snapshot = this.store.snapshot;
    await this.store.update(
      (draft) => {
        draft.permissions = draft.permissions.filter(
          (grant) =>
            grant.moduleId !== moduleId ||
            (capability !== undefined && grant.capability !== capability),
        );
      },
      snapshot.revision,
      "revoke-module-permission",
    );
  }

  public list(moduleId?: string): PermissionGrant[] {
    return this.store.snapshot.permissions.filter(
      (grant) => moduleId === undefined || grant.moduleId === moduleId,
    );
  }

  public trustLevel(moduleId: string): ModuleTrustLevel | undefined {
    return this.store.snapshot.modules[moduleId]?.trustLevel;
  }

  public async setTrustLevel(
    moduleId: string,
    trustLevel: ModuleTrustLevel,
  ): Promise<void> {
    const snapshot = this.store.snapshot;
    if (!snapshot.modules[moduleId]) throw new Error(`模块 ${moduleId} 尚未安装。`);
    await this.store.update(
      (draft) => {
        const module = draft.modules[moduleId];
        if (!module) return;
        module.trustLevel = trustLevel;
        // Downgrading must revoke high-risk grants. Re-promoting a module
        // therefore always requires a fresh, explicit authorization.
        if (trustLevel === "sandbox") {
          draft.permissions = draft.permissions.filter(
            (grant) =>
              grant.moduleId !== moduleId ||
              !isHighRiskCapability(grant.capability),
          );
        }
      },
      snapshot.revision,
      "set-module-trust",
    );
  }
}
