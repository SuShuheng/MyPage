export interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface GithubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
  published_at: string;
  assets: GithubReleaseAsset[];
}

export interface AvailableUpdate {
  version: string;
  release: GithubRelease;
}

export interface UpdateInstallResult {
  version: string;
  requiresReload: boolean;
  backupDirectory?: string;
}
