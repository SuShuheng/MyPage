import { GridStack, type GridStackNode } from "gridstack";
import type { ComponentChildren, JSX } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import type {
  Breakpoint,
  GridOptions,
  WidgetInstance,
  WidgetLayout,
} from "../persistence/settings-types";

interface GridStackAdapterProps {
  breakpoint: Breakpoint;
  editing: boolean;
  gridOptions: GridOptions;
  widgets: WidgetInstance[];
  onLayoutChange: (layouts: Record<string, WidgetLayout>) => void;
  children: ComponentChildren;
  resetKey?: number;
}

export function GridStackAdapter({
  breakpoint,
  editing,
  gridOptions,
  widgets,
  onLayoutChange,
  children,
  resetKey = 0,
}: GridStackAdapterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onLayoutChangeRef = useRef(onLayoutChange);
  const columnCount = gridOptions.columns[breakpoint];
  const widgetIdentityKey = widgets.map((widget) => widget.id).join("\u0000");
  onLayoutChangeRef.current = onLayoutChange;

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const grid = GridStack.init(
      {
        animate:
          gridOptions.layoutAnimation && gridOptions.collisionAnimation,
        cellHeight: gridOptions.rowHeight,
        column: columnCount,
        disableDrag: !editing,
        disableResize: !editing,
        draggable: {
          cancel:
            "input,textarea,select,option,a,button:not(.mypage-drag-handle),[contenteditable='true'],.mypage-no-drag",
          handle: ".mypage-drag-handle",
          scroll: true,
        },
        float: !gridOptions.compact || !gridOptions.push,
        margin: gridOptions.gap,
        resizable: { handles: "se" },
        staticGrid: !editing,
      },
      element,
    );
    if (!grid) return;

    grid.on("change", (_event, nodes) => {
      if (!editing) return;
      const layouts: Record<string, WidgetLayout> = {};
      for (const node of nodes) {
        const layout = nodeToLayout(node);
        const widgetId = node.el?.getAttribute("data-widget-id");
        if (layout && widgetId) layouts[widgetId] = layout;
      }
      if (Object.keys(layouts).length > 0) {
        onLayoutChangeRef.current(layouts);
      }
    });

    return () => {
      grid.destroy(false);
    };
  }, [
    breakpoint,
    columnCount,
    editing,
    gridOptions.collisionAnimation,
    gridOptions.compact,
    gridOptions.gap,
    gridOptions.layoutAnimation,
    gridOptions.push,
    gridOptions.rowHeight,
    widgetIdentityKey,
    resetKey,
  ]);

  return (
    <div
      ref={containerRef}
      class={`mypage-grid grid-stack${editing ? " is-editing" : ""}`}
      data-snap={String(gridOptions.snap)}
      data-placeholder={String(gridOptions.placeholder)}
      data-live-reflow={String(gridOptions.liveReflow)}
      aria-label="Dashboard 组件网格"
    >
      {children}
    </div>
  );
}

interface GridStackItemProps {
  widget: WidgetInstance;
  breakpoint: Breakpoint;
  children: ComponentChildren;
  contentStyle?: JSX.CSSProperties;
}

export function GridStackItem({
  widget,
  breakpoint,
  children,
  contentStyle,
}: GridStackItemProps) {
  const itemRef = useRef<HTMLDivElement>(null);
  const layout = widget.layouts[breakpoint];

  useLayoutEffect(() => {
    const element = itemRef.current;
    if (!element) return;
    const attributes: Record<string, number | undefined> = {
      "gs-x": layout.x,
      "gs-y": layout.y,
      "gs-w": layout.w,
      "gs-h": layout.h,
      "gs-min-w": layout.minW,
      "gs-min-h": layout.minH,
      "gs-max-w": layout.maxW,
      "gs-max-h": layout.maxH,
    };
    for (const [name, value] of Object.entries(attributes)) {
      if (value === undefined) element.removeAttribute(name);
      else element.setAttribute(name, String(value));
    }
  }, [
    layout.h,
    layout.maxH,
    layout.maxW,
    layout.minH,
    layout.minW,
    layout.w,
    layout.x,
    layout.y,
  ]);

  return (
    <div
      ref={itemRef}
      class="grid-stack-item"
      data-widget-id={widget.id}
    >
      <div
        class={`grid-stack-item-content mypage-widget${
          widget.appearance.customClass
            ? ` ${widget.appearance.customClass.replace(/[^\w -]/gu, "")}`
            : ""
        }`}
        style={contentStyle}
      >
        {children}
      </div>
    </div>
  );
}

function nodeToLayout(node: GridStackNode): WidgetLayout | undefined {
  if (
    node.x === undefined ||
    node.y === undefined ||
    node.w === undefined ||
    node.h === undefined
  ) {
    return undefined;
  }
  const layout: WidgetLayout = {
    x: node.x,
    y: node.y,
    w: node.w,
    h: node.h,
  };
  if (node.minW !== undefined) layout.minW = node.minW;
  if (node.minH !== undefined) layout.minH = node.minH;
  if (node.maxW !== undefined) layout.maxW = node.maxW;
  if (node.maxH !== undefined) layout.maxH = node.maxH;
  return layout;
}
