import type { App } from "obsidian";
import type { ActionExecutor } from "../actions/ActionExecutor";
import type { DataEngine } from "../data/DataEngine";
import type { WidgetInstance } from "../persistence/settings-types";
import { WidgetErrorBoundary } from "./WidgetErrorBoundary";
import {
  BUILT_IN_WIDGET_RENDERERS,
  type BuiltInWidgetProps,
} from "./registry";
import { WidgetError } from "./WidgetStateView";
import type { ModuleRuntime } from "../modules/ModuleRuntime";
import { ModuleWidget } from "./ModuleWidget";

interface WidgetHostProps {
  app: App;
  actions: ActionExecutor;
  dataEngine: DataEngine;
  widget: WidgetInstance;
  editing: boolean;
  moduleRuntime: ModuleRuntime;
  theme: Record<string, string | number>;
  safeMode: boolean;
  runtimeVersion: number;
}

export function WidgetHost(props: WidgetHostProps) {
  if (props.widget.moduleId !== "mypage-core") {
    if (props.safeMode) {
      return (
        <WidgetError message="安全模式已启用；此 DIY 模块未运行。" />
      );
    }
    return (
      <ModuleWidget
        runtime={props.moduleRuntime}
        dataEngine={props.dataEngine}
        widget={props.widget}
        binding={props.widget.dataBinding}
        theme={props.theme}
        runtimeVersion={props.runtimeVersion}
      />
    );
  }
  const Renderer = BUILT_IN_WIDGET_RENDERERS[
    props.widget.contributionId as keyof typeof BUILT_IN_WIDGET_RENDERERS
  ] as ((props: BuiltInWidgetProps) => preact.JSX.Element) | undefined;
  if (!Renderer) {
    return <WidgetError message={`未知组件：${props.widget.contributionId}`} />;
  }
  const binding = structuredClone(props.widget.dataBinding);
  if (props.widget.contributionId === "tasks") binding.sourceId = "core.tasks";
  if (
    ["metric", "heatmap", "trend", "distribution", "goals"].includes(
      props.widget.contributionId,
    )
  ) {
    delete binding.query.limit;
  }
  return (
    <WidgetErrorBoundary>
      <Renderer {...props} binding={binding} />
    </WidgetErrorBoundary>
  );
}
