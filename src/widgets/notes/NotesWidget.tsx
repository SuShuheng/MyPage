import { Icon } from "../../components/Icon";
import type { BuiltInWidgetProps } from "../registry";
import { useWidgetData } from "../shared/useWidgetData";
import { WidgetEmpty, WidgetError, WidgetLoading } from "../WidgetStateView";

export function NotesWidget({ actions, dataEngine, binding, editing, widget }: BuiltInWidgetProps) {
  const state = useWidgetData(dataEngine, binding);
  if (state.status === "loading") return <WidgetLoading />;
  if (state.status === "error") return <WidgetError message={state.message} />;
  if (state.status === "empty") return <WidgetEmpty />;
  const limit = Math.max(1, Number(widget.config.limit ?? 12));
  return (
    <div class="mypage-notes-list">
      {state.result.records.slice(0, limit).map((record) => {
        const path = String(record.fields.path ?? record.sourceRef?.path ?? "");
        return (
          <button
            type="button"
            key={record.id}
            disabled={editing}
            onClick={() => void actions.execute({ id: "open-file", input: { path } })}
          >
            <span class="mypage-note-icon"><Icon name="file-text" /></span>
            <span>
              <strong>{String(record.fields.basename ?? record.fields.name ?? path)}</strong>
              <small>{String(record.fields.folder ?? "/")}</small>
            </span>
            <time>{formatRelative(Number(record.fields.modified))}</time>
          </button>
        );
      })}
    </div>
  );
}

function formatRelative(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "";
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 30) return `${days} 天前`;
  return new Date(timestamp).toLocaleDateString();
}
