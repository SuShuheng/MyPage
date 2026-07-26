import { vi } from "vitest";

export class App {}
export class Component {
  public load(): void {}
  public unload(): void {}
}
export class ItemView {}
export class Notice {}
export class Modal {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class TAbstractFile {
  public path = "";
}
export class TFile extends TAbstractFile {
  public extension = "md";
}
export class WorkspaceLeaf {}

export const Platform = { isDesktopApp: true, isMobile: false };
export const MarkdownRenderer = { render: vi.fn() };
export const requestUrl = vi.fn();
export const setIcon = vi.fn();

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/+/gu, "/");
}

export function parseYaml(_source: string): unknown {
  return {};
}

export function getAllTags(): string[] {
  return [];
}
