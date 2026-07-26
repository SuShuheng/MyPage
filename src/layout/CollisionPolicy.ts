import type { WidgetLayout } from "../persistence/settings-types";
import type { CollisionResult } from "./layout-types";

export function layoutsOverlap(left: WidgetLayout, right: WidgetLayout): boolean {
  return (
    left.x < right.x + right.w &&
    left.x + left.w > right.x &&
    left.y < right.y + right.h &&
    left.y + left.h > right.y
  );
}

export function resolvePlacement(
  widgetId: string,
  requested: WidgetLayout,
  existing: Record<string, WidgetLayout>,
  columns: number,
  push: boolean,
): CollisionResult {
  const layout = clampLayout(requested, columns);
  const moved: Record<string, WidgetLayout> = {};
  const conflicts = Object.entries(existing)
    .filter(([id, candidate]) => id !== widgetId && layoutsOverlap(layout, candidate))
    .map(([id]) => id);

  if (conflicts.length === 0) {
    return { accepted: true, layout, moved, conflictIds: [] };
  }
  if (!push) {
    return { accepted: false, layout, moved, conflictIds: conflicts };
  }

  const queue = [...conflicts];
  const working = Object.fromEntries(
    Object.entries(existing).map(([id, value]) => [id, structuredClone(value)]),
  );
  working[widgetId] = layout;

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) continue;
    const current = working[currentId];
    if (!current) continue;
    const blockers = Object.entries(working).filter(
      ([id, candidate]) =>
        id !== currentId &&
        (id === widgetId || moved[id] !== undefined) &&
        layoutsOverlap(current, candidate),
    );
    if (blockers.length === 0) continue;
    const nextY = Math.max(...blockers.map(([, blocker]) => blocker.y + blocker.h));
    current.y = nextY;
    moved[currentId] = structuredClone(current);

    for (const [candidateId, candidate] of Object.entries(working)) {
      if (
        candidateId !== currentId &&
        candidateId !== widgetId &&
        layoutsOverlap(current, candidate) &&
        !queue.includes(candidateId)
      ) {
        queue.push(candidateId);
      }
    }
  }

  return { accepted: true, layout, moved, conflictIds: conflicts };
}

export function compactLayouts(
  layouts: Record<string, WidgetLayout>,
): Record<string, WidgetLayout> {
  const ordered = Object.entries(layouts).sort(
    ([, left], [, right]) => left.y - right.y || left.x - right.x,
  );
  const result: Record<string, WidgetLayout> = {};
  for (const [id, original] of ordered) {
    const current = structuredClone(original);
    while (current.y > 0) {
      const candidate = { ...current, y: current.y - 1 };
      if (Object.values(result).some((layout) => layoutsOverlap(candidate, layout))) {
        break;
      }
      current.y -= 1;
    }
    result[id] = current;
  }
  return result;
}

function clampLayout(layout: WidgetLayout, columns: number): WidgetLayout {
  const minW = Math.min(layout.minW ?? 1, columns);
  const maxW = Math.min(layout.maxW ?? columns, columns);
  const w = Math.max(minW, Math.min(layout.w, maxW));
  const minH = layout.minH ?? 1;
  const maxH = layout.maxH ?? Number.POSITIVE_INFINITY;
  const h = Math.max(minH, Math.min(layout.h, maxH));
  return {
    ...structuredClone(layout),
    x: Math.max(0, Math.min(layout.x, columns - w)),
    y: Math.max(0, layout.y),
    w,
    h,
  };
}
