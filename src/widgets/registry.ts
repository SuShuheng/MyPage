import type { App } from "obsidian";
import type { ActionExecutor } from "../actions/ActionExecutor";
import type { DataEngine } from "../data/DataEngine";
import type {
  DataBinding,
  WidgetInstance,
} from "../persistence/settings-types";
import { DistributionWidget } from "./distribution/DistributionWidget";
import { GoalWidget } from "./goals/GoalWidget";
import { HeatmapWidget } from "./heatmap/HeatmapWidget";
import { MarkdownActionsWidget } from "./markdown-actions/MarkdownActionsWidget";
import { MetricWidget } from "./metric/MetricWidget";
import { NotesWidget } from "./notes/NotesWidget";
import { TasksWidget } from "./tasks/TasksWidget";
import { TrendWidget } from "./trend/TrendWidget";

export interface BuiltInWidgetProps {
  app: App;
  actions: ActionExecutor;
  dataEngine: DataEngine;
  widget: WidgetInstance;
  binding: DataBinding;
  editing: boolean;
}

export const BUILT_IN_WIDGET_RENDERERS = {
  metric: MetricWidget,
  heatmap: HeatmapWidget,
  trend: TrendWidget,
  distribution: DistributionWidget,
  notes: NotesWidget,
  tasks: TasksWidget,
  goals: GoalWidget,
  "markdown-actions": MarkdownActionsWidget,
} as const;
