import { createId } from "../core/ids";
import type { CapabilityBroker } from "../permissions/CapabilityBroker";
import type {
  ModuleManifest,
  ModuleRpcRequest,
  ModuleRpcResponse,
} from "./module-types";
import { CAPABILITIES } from "../permissions/capabilities";

export interface ModuleSandboxOptions {
  manifest: ModuleManifest;
  contributionId: string;
  code: string;
  styles: string;
  container: HTMLElement;
  broker: CapabilityBroker;
  config: Record<string, unknown>;
  theme: Record<string, string | number>;
  onReady?: () => void;
  onError?: (error: Error) => void;
  onRecords?: (records: unknown[]) => void;
  removeContainerOnDispose?: boolean;
}

export class ModuleSandbox {
  private readonly iframe: HTMLIFrameElement;
  private readonly session = createId("sandbox");
  private disposed = false;

  public constructor(private readonly options: ModuleSandboxOptions) {
    this.iframe = document.createElement("iframe");
    this.iframe.className = "mypage-module-sandbox";
    this.iframe.title = `${options.manifest.name} · ${options.contributionId}`;
    this.iframe.setAttribute("sandbox", "allow-scripts");
    this.iframe.setAttribute(
      "aria-label",
      `${options.manifest.name} 自定义组件`,
    );
    window.addEventListener("message", this.handleMessage);
    this.iframe.srcdoc = createSandboxDocument(
      this.session,
      options.manifest.id,
      options.contributionId,
      options.code,
      options.styles,
      options.config,
      options.theme,
    );
    options.container.appendChild(this.iframe);
  }

  public updateData(data: unknown): void {
    this.post({ type: "data", data });
  }

  public updateTheme(theme: Record<string, string | number>): void {
    this.post({ type: "theme", theme });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener("message", this.handleMessage);
    this.iframe.remove();
    if (this.options.removeContainerOnDispose) this.options.container.remove();
  }

  private readonly handleMessage = (event: MessageEvent<unknown>): void => {
    if (
      this.disposed ||
      event.source !== this.iframe.contentWindow ||
      !isSandboxMessage(event.data) ||
      event.data.session !== this.session
    ) {
      return;
    }
    if (event.data.type === "ready") {
      this.options.onReady?.();
      return;
    }
    if (event.data.type === "error") {
      this.options.onError?.(new Error(event.data.message));
      return;
    }
    if (event.data.type === "log") {
      console.info(`[MyPage:${this.options.manifest.id}]`, event.data.message);
      return;
    }
    if (event.data.type === "records") {
      this.options.onRecords?.(event.data.records);
      return;
    }
    if (event.data.type === "rpc") {
      void this.handleRpc(event.data);
    }
  };

  private async handleRpc(request: ModuleRpcRequest): Promise<void> {
    let response: ModuleRpcResponse;
    try {
      const result = await this.options.broker.request(
        this.options.manifest.id,
        request.capability,
        request.input as never,
      );
      response = {
        type: "rpc-result",
        session: this.session,
        id: request.id,
        ok: true,
        result,
      };
    } catch (error) {
      response = {
        type: "rpc-result",
        session: this.session,
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    this.post(response);
  }

  private post(message: object): void {
    this.iframe.contentWindow?.postMessage(
      { ...message, session: this.session },
      "*",
    );
  }
}

type SandboxMessage =
  | ModuleRpcRequest
  | { type: "ready"; session: string }
  | { type: "error"; session: string; message: string }
  | { type: "log"; session: string; message: string }
  | { type: "records"; session: string; records: unknown[] };

function isSandboxMessage(value: unknown): value is SandboxMessage {
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.session !== "string") {
    return false;
  }
  if (value.session.length > 200) return false;
  if (value.type === "rpc") {
    if (
      typeof value.id !== "string" ||
      value.id.length > 200 ||
      typeof value.capability !== "string" ||
      !(value.capability in CAPABILITIES)
    ) {
      return false;
    }
    try {
      return JSON.stringify(value.input).length <= 1024 * 1024;
    } catch {
      return false;
    }
  }
  if (value.type === "error" || value.type === "log") {
    const field = value.type === "error" ? value.message : value.message;
    return typeof field === "string" && field.length <= 10_000;
  }
  if (value.type === "records") {
    if (!Array.isArray(value.records) || value.records.length > 20_000) return false;
    try {
      return JSON.stringify(value.records).length <= 5 * 1024 * 1024;
    } catch {
      return false;
    }
  }
  return value.type === "ready";
}

function createSandboxDocument(
  session: string,
  moduleId: string,
  contributionId: string,
  code: string,
  styles: string,
  config: Record<string, unknown>,
  theme: Record<string, string | number>,
): string {
  const nonce = createId("nonce");
  const payload = safeJson({
    session,
    moduleId,
    contributionId,
    code: toBase64(code),
    styles: toBase64(styles),
    config,
    theme,
  });
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none';">
  <style>html,body,#mypage-root{width:100%;height:100%;margin:0;overflow:hidden;color:var(--mypage-text,#222);background:transparent;font:inherit;box-sizing:border-box}*,*::before,*::after{box-sizing:inherit}</style>
</head>
<body>
  <div id="mypage-root"></div>
  <script id="mypage-payload" type="application/json">${payload}</script>
  <script nonce="${nonce}">
  (() => {
    "use strict";
    const payload = JSON.parse(document.getElementById("mypage-payload").textContent);
    const decode = value => new TextDecoder().decode(Uint8Array.from(atob(value), c => c.charCodeAt(0)));
    const applyTheme = theme => Object.entries(theme || {}).forEach(([key, value]) => document.documentElement.style.setProperty("--mypage-" + key, String(value)));
    applyTheme(payload.theme);
    const style = document.createElement("style");
    style.textContent = decode(payload.styles);
    document.head.appendChild(style);
    let sequence = 0;
    const pending = new Map();
    const listeners = { data: new Set(), theme: new Set() };
    let hasData = false;
    let latestData;
    const api = Object.freeze({
      root: document.getElementById("mypage-root"),
      moduleId: payload.moduleId,
      contributionId: payload.contributionId,
      config: Object.freeze(payload.config || {}),
      request(capability, input) {
        const id = "rpc-" + (++sequence);
        parent.postMessage({ type: "rpc", session: payload.session, id, capability, input }, "*");
        return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      },
      onData(listener) {
        listeners.data.add(listener);
        if (hasData) queueMicrotask(() => listener(latestData));
        return () => listeners.data.delete(listener);
      },
      onTheme(listener) { listeners.theme.add(listener); return () => listeners.theme.delete(listener); },
      publishRecords(records) {
        if (!Array.isArray(records)) throw new Error("publishRecords expects an array.");
        parent.postMessage({ type: "records", session: payload.session, records }, "*");
      },
      log(message) { parent.postMessage({ type: "log", session: payload.session, message: String(message) }, "*"); }
    });
    addEventListener("message", event => {
      if (event.source !== parent || !event.data || event.data.session !== payload.session) return;
      if (event.data.type === "rpc-result") {
        const item = pending.get(event.data.id);
        if (!item) return;
        pending.delete(event.data.id);
        event.data.ok ? item.resolve(event.data.result) : item.reject(new Error(event.data.error));
      } else if (event.data.type === "data") {
        hasData = true;
        latestData = event.data.data;
        listeners.data.forEach(listener => listener(latestData));
      } else if (event.data.type === "theme") {
        applyTheme(event.data.theme);
        listeners.theme.forEach(listener => listener(event.data.theme));
      }
    });
    const source = decode(payload.code);
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    import(url).then(module => {
      URL.revokeObjectURL(url);
      const activate = module.activate || module.default;
      if (typeof activate !== "function") throw new Error("Module must export activate() or a default function.");
      return activate(api);
    }).then(() => {
      parent.postMessage({ type: "ready", session: payload.session }, "*");
    }).catch(error => {
      parent.postMessage({ type: "error", session: payload.session, message: error && error.message ? error.message : String(error) }, "*");
    });
  })();
  </script>
</body>
</html>`;
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
