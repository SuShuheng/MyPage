import { Platform } from "obsidian";

export type MyPagePlatform = "desktop" | "mobile";

export interface PlatformCapabilities {
  platform: MyPagePlatform;
  externalFileSystem: boolean;
  git: boolean;
  systemExec: boolean;
  selfUpdate: boolean;
  workers: boolean;
}

export function getPlatformCapabilities(): PlatformCapabilities {
  const desktop = Platform.isDesktopApp;
  return {
    platform: desktop ? "desktop" : "mobile",
    externalFileSystem: desktop,
    git: desktop,
    systemExec: desktop,
    selfUpdate: desktop,
    workers: typeof Worker !== "undefined",
  };
}
