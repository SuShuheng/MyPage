import { Platform } from "obsidian";
import manifestJson from "../../manifest.json";
import type { SettingsStore } from "../persistence/SettingsStore";
import type { GithubReleaseClient } from "./GithubReleaseClient";
import { selectUpdate } from "./UpdateChannel";
import type { UpdateInstaller } from "./UpdateInstaller";
import type {
  AvailableUpdate,
  UpdateInstallResult,
} from "./update-types";

export class UpdateService {
  private checkedThisSession = false;

  public constructor(
    private readonly store: SettingsStore,
    private readonly client: GithubReleaseClient,
    private readonly installer: UpdateInstaller,
  ) {}

  public async check(
    manual = false,
    signal?: AbortSignal,
  ): Promise<AvailableUpdate | undefined> {
    if (!manual && this.checkedThisSession) return undefined;
    if (!manual) this.checkedThisSession = true;
    const settings = this.store.snapshot;
    const releases = await this.client.list(signal);
    const update = selectUpdate(
      releases,
      manifestJson.version,
      settings.updates.channel,
      settings.updates.ignoredVersions,
    );
    const latest = this.store.snapshot;
    await this.store.update(
      (draft) => {
        draft.updates.lastCheckedAt = Date.now();
      },
      latest.revision,
      manual ? "manual-core-update-check" : "startup-core-update-check",
    );
    return update;
  }

  public async install(
    update: AvailableUpdate,
    signal?: AbortSignal,
  ): Promise<UpdateInstallResult> {
    if (!Platform.isDesktopApp) {
      return {
        version: update.version,
        requiresReload: false,
      };
    }
    return this.installer.install(update, signal);
  }

  public async ignore(version: string): Promise<void> {
    const snapshot = this.store.snapshot;
    await this.store.update(
      (draft) => {
        if (!draft.updates.ignoredVersions.includes(version)) {
          draft.updates.ignoredVersions.push(version);
        }
      },
      snapshot.revision,
      "ignore-core-update",
    );
  }
}
