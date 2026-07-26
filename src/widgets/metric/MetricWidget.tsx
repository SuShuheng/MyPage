import type { BuiltInWidgetProps } from "../registry";
import { WidgetError, WidgetLoading } from "../WidgetStateView";
import { useWidgetData } from "../shared/useWidgetData";

export function MetricWidget({ dataEngine, binding, widget }: BuiltInWidgetProps) {
  const state = useWidgetData(dataEngine, binding);
  if (state.status === "loading") return <WidgetLoading />;
  if (state.status === "error") return <WidgetError message={state.message} />;
  const records = state.result.records;
  const metric = String(widget.config.metric ?? "count");
  const field = String(widget.config.field ?? "size");
  const values = records
    .map((record) => Number(record.fields[field]))
    .filter(Number.isFinite);
  const value =
    metric === "sum"
      ? values.reduce((sum, item) => sum + item, 0)
      : metric === "avg"
        ? values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : 0
        : metric === "max"
          ? values.length ? Math.max(...values) : 0
          : metric === "min"
            ? values.length ? Math.min(...values) : 0
            : records.length;
  const formatted = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    notation: value >= 100_000 ? "compact" : "standard",
  }).format(value);
  return (
    <div class="mypage-metric">
      <strong>{formatted}</strong>
      <span>{metric === "count" ? "条匹配记录" : `${metric} · ${field}`}</span>
      <div class="mypage-mini-bars" aria-hidden="true">
        {[24, 38, 30, 52, 46, 68, 61, 78, 70, 86].map((height, index) => (
          <i key={index} style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  );
}
