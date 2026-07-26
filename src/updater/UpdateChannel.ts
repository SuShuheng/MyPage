import { gt, prerelease, rcompare, valid } from "semver";
import type { UpdateChannel } from "../persistence/settings-types";
import type { AvailableUpdate, GithubRelease } from "./update-types";

export function selectUpdate(
  releases: GithubRelease[],
  currentVersion: string,
  channel: UpdateChannel,
  ignoredVersions: string[],
): AvailableUpdate | undefined {
  const candidates = releases
    .filter((release) => !release.draft)
    .flatMap((release): AvailableUpdate[] => {
      const version = valid(release.tag_name);
      if (!version || ignoredVersions.includes(version) || !gt(version, currentVersion)) {
        return [];
      }
      const isPrerelease = release.prerelease || prerelease(version) !== null;
      if (channel === "stable" && isPrerelease) return [];
      return [{ version, release }];
    })
    .sort((left, right) => rcompare(left.version, right.version));
  return candidates[0];
}
