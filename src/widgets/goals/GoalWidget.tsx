import type { BuiltInWidgetProps } from "../registry";
import { useWidgetData } from "../shared/useWidgetData";
import { WidgetError, WidgetLoading } from "../WidgetStateView";

export function GoalWidget({ dataEngine, binding, widget }: BuiltInWidgetProps) {
  const state = useWidgetData(dataEngine, binding);
  if (state.status === "loading") return <WidgetLoading />;
  if (state.status === "error") return <WidgetError message={state.message} />;
  const count = state.result.records.length;
  const target = Math.max(1, Number(widget.config.target ?? 30));
  const progress = Math.min(1, count / target);
  const percentage = Math.round(progress * 100);
  const targetDate =
    typeof widget.config.targetDate === "string"
      ? widget.config.targetDate
      : "";
  const radius = 44;
  return (
    <div class="mypage-goal">
      <div class="mypage-progress-ring">
        <svg viewBox="0 0 108 108" role="img" aria-label={`目标进度 ${percentage}%`}>
          <circle class="track" cx="54" cy="54" r={radius} />
          <circle
            class="value"
            cx="54"
            cy="54"
            r={radius}
            pathLength="100"
            style={{
              strokeDasharray: "100",
              strokeDashoffset: String(100 - percentage),
            }}
          />
        </svg>
        <strong>{percentage}%</strong>
      </div>
      <div>
        <strong>{count} / {target}</strong>
        <span>当前目标进度</span>
        <small>{count >= target ? "目标已完成" : `还差 ${target - count} 条记录`}</small>
        <small>{formatTargetDate(targetDate)}</small>
      </div>
    </div>
  );
}

function formatTargetDate(value: string): string {
  const timestamp = Date.parse(`${value}T23:59:59`);
  if (!value || !Number.isFinite(timestamp)) return "未设置完成日期";
  const days = Math.ceil((timestamp - Date.now()) / 86_400_000);
  if (days < 0) return `完成日期 ${value} · 已到期`;
  if (days === 0) return `完成日期 ${value} · 今天`;
  return `完成日期 ${value} · 剩余 ${days} 天`;
}
