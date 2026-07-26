import { Component, MarkdownRenderer, Notice } from "obsidian";
import { useEffect, useRef } from "preact/hooks";
import { Icon } from "../../components/Icon";
import type { BuiltInWidgetProps } from "../registry";
import { resolvePathTemplate } from "../content-config";

export function MarkdownActionsWidget({
  app,
  actions,
  widget,
  editing,
}: BuiltInWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const markdown = String(widget.config.markdown ?? "## 欢迎使用 MyPage");
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    element.empty();
    const component = new Component();
    component.load();
    void MarkdownRenderer.render(app, markdown, element, "", component);
    return () => component.unload();
  }, [app, markdown]);
  return (
    <div class="mypage-markdown-actions">
      <div ref={containerRef} class="mypage-markdown-content" />
      <button
        type="button"
        disabled={editing}
        onClick={async () => {
          const template = String(
            widget.config.pathTemplate ??
              widget.config.path ??
              "MyPage/{date}.md",
          );
          const path = resolvePathTemplate(template);
          const content = String(widget.config.noteContent ?? "# 新笔记\n\n");
          try {
            await actions.execute({
              id: "create-note",
              input: { path, content },
            });
          } catch (error) {
            new Notice(error instanceof Error ? error.message : String(error));
          }
        }}
      >
        <Icon name="file-plus-2" />创建笔记
      </button>
    </div>
  );
}
