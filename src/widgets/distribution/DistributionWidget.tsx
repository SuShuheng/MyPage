import { useMemo } from "preact/hooks";
import type { EChartsCoreOption } from "echarts/core";
import type { BuiltInWidgetProps } from "../registry";
import { EChart } from "../shared/EChart";
import { useWidgetData } from "../shared/useWidgetData";
import { WidgetEmpty, WidgetError, WidgetLoading } from "../WidgetStateView";

export function DistributionWidget({ dataEngine, binding, widget }: BuiltInWidgetProps) {
  const state = useWidgetData(dataEngine, binding);
  const option = useMemo<EChartsCoreOption>(() => {
    if (state.status !== "ready") return {};
    const field = String(widget.config.field ?? "folder");
    const counts = new Map<string, number>();
    for (const record of state.result.records) {
      const raw = record.fields[field] ?? "未分类";
      const values = Array.isArray(raw) ? raw : [raw];
      for (const value of values) {
        const label = String(value || "未分类");
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
    }
    const data = [...counts.entries()]
      .sort(([, left], [, right]) => right - left)
      .slice(0, 12);
    const pie = ["pie", "donut"].includes(String(widget.config.mode));
    return pie
      ? {
          color: chartPalette(),
          tooltip: { trigger: "item" },
          legend: {
            show: widget.config.showXAxisLabels !== false,
            bottom: 0,
            type: "scroll",
            formatter: labelFormatter(widget.config),
            textStyle: { color: "var(--mypage-muted-text)" },
          },
          series: [{
            type: "pie",
            radius: String(widget.config.mode) === "donut" ? ["38%", "68%"] : "68%",
            center: ["50%", "44%"],
            label: { show: false },
            emphasis: { label: { show: true } },
            data: data.map(([name, value]) => ({ name, value })),
          }],
        }
      : {
          color: ["var(--mypage-accent)"],
          tooltip: { trigger: "axis" },
          grid: { top: 8, right: 10, bottom: 30, left: 34 },
          xAxis: {
            type: "category",
            data: data.map(([name]) => name),
            axisLabel: {
              show: widget.config.showXAxisLabels !== false,
              color: "var(--mypage-muted-text)",
              interval: 0,
              rotate: data.length > 6 ? 28 : 0,
              formatter: labelFormatter(widget.config),
            },
          },
          yAxis: {
            type: "value",
            minInterval: 1,
            axisLabel: { show: widget.config.showYAxisLabels !== false, color: "var(--mypage-muted-text)" },
            splitLine: { lineStyle: { color: "var(--mypage-border)" } },
          },
          series: [{ type: "bar", data: data.map(([, value]) => value), barMaxWidth: 36 }],
        };
  }, [state, widget.config]);
  if (state.status === "loading") return <WidgetLoading />;
  if (state.status === "error") return <WidgetError message={state.message} />;
  if (state.status === "empty") return <WidgetEmpty />;
  return (
    <div class="mypage-widget-chart-layout">
      <EChart option={option} ariaLabel={`分布图，共 ${state.result.records.length} 条记录`} />
      <small class="mypage-chart-summary">显示数量最高的 12 个分类。</small>
    </div>
  );
}

function chartPalette(): string[] {
  return [
    "var(--mypage-accent)",
    "color-mix(in srgb, var(--mypage-accent) 70%, #22c55e)",
    "color-mix(in srgb, var(--mypage-accent) 45%, #f59e0b)",
    "color-mix(in srgb, var(--mypage-accent) 60%, #ec4899)",
    "color-mix(in srgb, var(--mypage-accent) 55%, #06b6d4)",
    "color-mix(in srgb, var(--mypage-accent) 45%, #ef4444)",
  ];
}

function labelFormatter(config: Record<string, unknown>) {
  const truncate = config.truncateAxisLabels !== false;
  const limit = Math.max(4, Number(config.axisLabelMaxLength ?? 12));
  return (value: string) =>
    truncate && value.length > limit ? `${value.slice(0, limit)}…` : value;
}
