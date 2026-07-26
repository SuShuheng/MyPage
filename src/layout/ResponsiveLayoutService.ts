import type {
  Breakpoint,
  GridOptions,
  WidgetLayout,
} from "../persistence/settings-types";

export const BREAKPOINT_WIDTHS = {
  mobile: 0,
  tablet: 680,
  desktop: 1080,
} as const;

export function resolveBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINT_WIDTHS.desktop) return "desktop";
  if (width >= BREAKPOINT_WIDTHS.tablet) return "tablet";
  return "mobile";
}

export function deriveLayout(
  desktop: WidgetLayout,
  breakpoint: Breakpoint,
  grid: GridOptions,
): WidgetLayout {
  if (breakpoint === "desktop") return structuredClone(desktop);
  const sourceColumns = grid.columns.desktop;
  const targetColumns = grid.columns[breakpoint];
  const ratio = targetColumns / sourceColumns;
  const w = Math.max(
    Math.min(targetColumns, Math.round(desktop.w * ratio)),
    Math.min(desktop.minW ?? 1, targetColumns),
  );
  const x = Math.max(0, Math.min(targetColumns - w, Math.round(desktop.x * ratio)));
  const result: WidgetLayout = {
    ...structuredClone(desktop),
    x,
    y: desktop.y,
    w,
    h: desktop.h,
    minW: Math.min(desktop.minW ?? 1, targetColumns),
  };
  if (desktop.maxW !== undefined) {
    result.maxW = Math.min(desktop.maxW, targetColumns);
  } else {
    delete result.maxW;
  }
  return result;
}
