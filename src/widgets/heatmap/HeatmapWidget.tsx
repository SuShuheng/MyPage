import { useMemo } from "preact/hooks";
import type { EChartsCoreOption } from "echarts/core";
import type { BuiltInWidgetProps } from "../registry";
import { EChart } from "../shared/EChart";
import { useWidgetData } from "../shared/useWidgetData";
import { WidgetEmpty, WidgetError, WidgetLoading } from "../WidgetStateView";
import { dateRangeTimestamps } from "../content-config";

export function HeatmapWidget({ dataEngine, binding, widget }: BuiltInWidgetProps) {
  const state = useWidgetData(dataEngine, binding);
  const configuredStart = widget.config.startDate;
  const configuredEnd = widget.config.endDate;
  const range = dateRangeTimestamps(configuredStart, configuredEnd);
  const option = useMemo<EChartsCoreOption>(() => {
    if (state.status !== "ready") return {};
    const counts = new Map<string, number>();
    for (const record of state.result.records) {
      const timestamp = Number(record.fields.modified ?? record.timestamp);
      if (
        !Number.isFinite(timestamp) ||
        timestamp < range.from ||
        timestamp > range.to
      ) {
        continue;
      }
      const day = new Date(timestamp).toISOString().slice(0, 10);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    const values = [...counts.values()];
    return {
      tooltip: {
        formatter: (params: { data?: [string, number] }) =>
          params.data ? `${params.data[0]} · ${params.data[1]} 条记录` : "",
      },
      visualMap: {
        min: 1,
        max: Math.max(1, ...values),
        show: false,
        inRange: {
          color: [
            "color-mix(in srgb, var(--mypage-accent) 28%, var(--mypage-card-background))",
            "color-mix(in srgb, var(--mypage-accent) 62%, var(--mypage-card-background))",
            "var(--mypage-accent)",
          ],
        },
      },
      calendar: {
        top: 18,
        left: 24,
        right: 10,
        bottom: 12,
        range: [range.startDate, range.endDate],
        cellSize: ["auto", 12],
        splitLine: { show: false },
        itemStyle: {
          borderColor: "var(--mypage-card-background)",
          borderWidth: 1,
        },
        dayLabel: {
          show: widget.config.showYAxisLabels !== false,
          color: "var(--mypage-muted-text)",
          firstDay: 1,
          fontSize: 9,
          nameMap: "ZH",
        },
        monthLabel: {
          show: widget.config.showXAxisLabels !== false,
          color: "var(--mypage-muted-text)",
          fontSize: 9,
          nameMap: "ZH",
        },
        yearLabel: { show: false },
      },
      series: [{
        type: "heatmap",
        coordinateSystem: "calendar",
        data: [...counts.entries()],
      }],
      media: [
        {
          query: { maxWidth: 420 },
          option: {
            calendar: {
              left: 8,
              right: 8,
              top: 8,
              bottom: 8,
              range: [range.startDate, range.endDate],
              dayLabel: { show: false },
              monthLabel: { show: false },
            },
          },
        },
      ],
    };
  }, [range.endDate, range.from, range.startDate, range.to, state, widget.config]);

  if (state.status === "loading") return <WidgetLoading />;
  if (state.status === "error") return <WidgetError message={state.message} />;
  if (state.status === "empty") return <WidgetEmpty />;
  const activityCount = state.result.records.filter((record) => {
    const timestamp = Number(record.fields.modified ?? record.timestamp);
    return timestamp >= range.from && timestamp <= range.to;
  }).length;
  return (
    <div class="mypage-widget-chart-layout">
      <EChart option={option} ariaLabel={`贡献热力图，共 ${activityCount} 条记录`} />
      <small class="mypage-chart-summary">
        {range.startDate} 至 {range.endDate} · {activityCount} 次活动
      </small>
    </div>
  );
}
