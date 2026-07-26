import { vi } from "vitest";

Object.defineProperty(globalThis, "crypto", {
  configurable: true,
  value: {
    getRandomValues: <T extends ArrayBufferView>(array: T): T => {
      const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      view.forEach((_, index) => {
        view[index] = (index * 37 + 11) % 256;
      });
      return array;
    },
    subtle: globalThis.crypto?.subtle,
  },
});

vi.mock("obsidian", () => ({
  App: class App {},
  ItemView: class ItemView {},
  Notice: class Notice {},
  Platform: { isDesktopApp: true },
  Plugin: class Plugin {},
  PluginSettingTab: class PluginSettingTab {},
  Setting: class Setting {},
  WorkspaceLeaf: class WorkspaceLeaf {},
  normalizePath: (path: string) => path.replaceAll("\\", "/").replace(/\/+/g, "/"),
  setIcon: vi.fn(),
}));
