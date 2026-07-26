import { useEffect, useRef, useState } from "preact/hooks";
import type { DataEngine } from "../data/DataEngine";
import type { ModuleRuntime } from "../modules/ModuleRuntime";
import type { DataBinding, WidgetInstance } from "../persistence/settings-types";
import type { ModuleSandbox } from "../modules/ModuleSandbox";
import { WidgetError, WidgetLoading } from "./WidgetStateView";

interface ModuleWidgetProps {
  runtime: ModuleRuntime;
  dataEngine: DataEngine;
  widget: WidgetInstance;
  binding: DataBinding;
  theme: Record<string, string | number>;
  runtimeVersion: number;
}

export function ModuleWidget({
  runtime,
  dataEngine,
  widget,
  binding,
  theme,
  runtimeVersion,
}: ModuleWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sandboxRef = useRef<ModuleSandbox>();
  const latestDataRef = useRef<unknown>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const configKey = JSON.stringify(widget.config);
  const themeKey = JSON.stringify(theme);
  const bindingKey = JSON.stringify(binding);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    void runtime
      .mountWidget(
        widget.moduleId,
        widget.contributionId,
        container,
        widget.config,
        theme,
      )
      .then((sandbox) => {
        if (disposed) {
          runtime.unmount(sandbox);
          return;
        }
        sandboxRef.current = sandbox;
        if (latestDataRef.current !== undefined) {
          sandbox.updateData(latestDataRef.current);
        }
        setState("ready");
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : String(error));
        setState("error");
      });
    return () => {
      disposed = true;
      const sandbox = sandboxRef.current;
      if (sandbox) runtime.unmount(sandbox);
      sandboxRef.current = undefined;
    };
  }, [
    configKey,
    runtime,
    runtimeVersion,
    widget.contributionId,
    widget.moduleId,
  ]);

  useEffect(
    () => {
      latestDataRef.current = undefined;
      return dataEngine.subscribe(binding, (result) => {
        latestDataRef.current = result;
        sandboxRef.current?.updateData(result);
      });
    },
    [bindingKey, dataEngine],
  );

  useEffect(() => {
    sandboxRef.current?.updateTheme(theme);
  }, [themeKey]);

  return (
    <div class="mypage-module-widget">
      {state === "loading" ? <WidgetLoading /> : null}
      {state === "error" ? <WidgetError message={message} /> : null}
      <div
        ref={containerRef}
        class="mypage-module-widget-container"
        hidden={state === "error"}
      />
    </div>
  );
}
