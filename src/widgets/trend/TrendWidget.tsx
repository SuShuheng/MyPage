import { useMemo } from "preact/hooks";
import type { EChartsCoreOption } from "echarts/core";
import type { BuiltInWidgetProps } from "../registry";
import { EChart } from "../shared/EChart";
import { useWidgetData } from "../shared/useWidgetData";
import { WidgetEmpty, WidgetError, WidgetLoading } from "../WidgetStateView";

export function TrendWidget({ dataEngine, binding, widget }: BuiltInWidgetProps) {
  const state = useWidgetData(dataEngine, binding);
  const option = useMemo<EChartsCoreOption>(() => {
    if (state.status !== "ready") return {};
    const counts = new Map<string, number>();
    for (const record of state.result.records) {
      const timestamp = Number(record.fields.modified ?? record.timestamp);
      if (!Number.isFinite(timestamp)) continue;
      const key = new Date(timestamp).toISOString().slice(0, 10);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const data = [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
    return {
      color: ["var(--mypage-accent)"],
      tooltip: { trigger: "axis" },
      grid: { top: 12, right: 12, bottom: 28, left: 34 },
      xAxis: {
        type: "category",
        data: data.map(([date]) => date),
        axisLabel: {
          show: widget.config.showXAxisLabels !== false,
          color: "var(--mypage-muted-text)",
          hideOverlap: true,
          formatter: labelFormatter(widget.config),
        },
        axisLine: { lineStyle: { color: "var(--mypage-border)" } },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: { show: widget.config.showYAxisLabels !== false, color: "var(--mypage-muted-text)" },
        splitLine: { lineStyle: { color: "var(--mypage-border)" } },
      },
      dataZoom: [{ type: "inside" }],
      series: [{
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 5,
        showSymbol: false,
        areaStyle: String(widget.config.mode ?? "area") === "area" ? { opacity: 0.16 } : undefined,
        data: data.map(([, count]) => count),
      }],
    };
  }, [state, widget.config]);
  if (state.status === "loading") return <WidgetLoading />;
  if (state.status === "error") return <WidgetError message={state.message} />;
  if (state.status === "empty") return <WidgetEmpty />;
  return (
    <div class="mypage-widget-chart-layout">
      <EChart option={option} ariaLabel={`时间趋势图，共 ${state.result.records.length} 条记录`} />
      <small class="mypage-chart-summary">支持悬停详情与触控缩放。</small>
    </div>
  );
}

function labelFormatter(config: Record<string, unknown>) {
  const truncate = config.truncateAxisLabels !== false;
  const limit = Math.max(4, Number(config.axisLabelMaxLength ?? 12));
  return (value: string) =>
    truncate && value.length > limit ? `${value.slice(0, limit)}…` : value;
}
