import { useState } from "preact/hooks";
import { Notice } from "obsidian";
import { Icon } from "../../components/Icon";
import type { BuiltInWidgetProps } from "../registry";
import { useWidgetData } from "../shared/useWidgetData";
import { WidgetError, WidgetLoading } from "../WidgetStateView";

export function TasksWidget({ actions, dataEngine, binding, editing, widget }: BuiltInWidgetProps) {
  const state = useWidgetData(dataEngine, binding);
  const [pending, setPending] = useState<string>();
  const [taskDraft, setTaskDraft] = useState("");
  if (state.status === "loading") return <WidgetLoading />;
  if (state.status === "error") return <WidgetError message={state.message} />;
  const showCompleted = Boolean(widget.config.showCompleted);
  const taskPath = String(widget.config.taskPath ?? "MyPage/TODO.md");
  const records = state.result.records.filter(
    (record) => showCompleted || record.fields.completed !== true,
  );
  return (
    <div class="mypage-tasks">
      <div class="mypage-tasks-list">
        {records.length === 0 ? (
          <div class="mypage-tasks-empty">
            <Icon name="inbox" />
            <span>当前范围没有待办任务</span>
          </div>
        ) : null}
        {records.slice(0, 12).map((record) => {
          const path = String(record.fields.path ?? "");
          const line = Number(record.fields.line);
          const text = String(record.fields.text ?? "");
          const completed = record.fields.completed === true;
          return (
            <label key={record.id}>
              <input
                type="checkbox"
                checked={completed}
                disabled={editing || pending === record.id}
                onChange={async () => {
                  setPending(record.id);
                  try {
                    const result = await actions.execute({
                      id: "toggle-task",
                      input: { path, line, expectedText: text },
                    });
                    new Notice(result.message);
                  } catch (error) {
                    new Notice(error instanceof Error ? error.message : String(error));
                  } finally {
                    setPending(undefined);
                  }
                }}
              />
              <span>
                <strong>{text}</strong>
                <small>{path} · 第 {line + 1} 行</small>
              </span>
            </label>
          );
        })}
      </div>
      <form
        class="mypage-task-create"
        onSubmit={async (event) => {
          event.preventDefault();
          const text = taskDraft.trim();
          if (!text || pending) return;
          setPending("create");
          try {
            const result = await actions.execute({
              id: "create-task",
              input: { path: taskPath, text },
            });
            setTaskDraft("");
            new Notice(result.message);
          } catch (error) {
            new Notice(error instanceof Error ? error.message : String(error));
          } finally {
            setPending(undefined);
          }
        }}
      >
        <input
          type="text"
          aria-label="新任务内容"
          placeholder={editing ? "完成编辑后可创建任务" : "输入新任务…"}
          value={taskDraft}
          disabled={editing || pending === "create"}
          onInput={(event) => setTaskDraft(event.currentTarget.value)}
        />
        <button
          type="submit"
          aria-label="创建任务"
          disabled={editing || pending === "create" || !taskDraft.trim()}
        >
          <Icon name="plus" />
        </button>
      </form>
    </div>
  );
}
