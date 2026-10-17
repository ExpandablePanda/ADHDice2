export function reorderListItems<T>(items: readonly T[], from: number, to: number) {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

export const SORTABLE_LIST_DRAG_AUTO_SCROLL_EDGE_PX = 80;
export const SORTABLE_LIST_DRAG_AUTO_SCROLL_MAX_PX = 18;

export type SortableListScrollBounds = {
  top: number;
  bottom: number;
};

export function getSortableListVisibleScrollBounds({
  scrollPortTop,
  scrollPortBottom,
  viewportTop,
  viewportBottom,
  clipBounds = [],
}: {
  scrollPortTop: number;
  scrollPortBottom: number;
  viewportTop: number;
  viewportBottom: number;
  clipBounds?: readonly SortableListScrollBounds[];
}): SortableListScrollBounds | null {
  const values = [scrollPortTop, scrollPortBottom, viewportTop, viewportBottom];
  if (!values.every(Number.isFinite) || !clipBounds.every(({ top, bottom }) => Number.isFinite(top) && Number.isFinite(bottom))) {
    return null;
  }

  const top = Math.max(scrollPortTop, viewportTop, ...clipBounds.map((bounds) => bounds.top));
  const bottom = Math.min(scrollPortBottom, viewportBottom, ...clipBounds.map((bounds) => bounds.bottom));
  return bottom > top ? { bottom, top } : null;
}

export function getSortableListDragAutoScrollDelta({
  pointerY,
  viewportTop,
  viewportBottom,
  scrollTop,
  clientHeight,
  scrollHeight,
}: {
  pointerY: number;
  viewportTop: number;
  viewportBottom: number;
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}) {
  if (![pointerY, viewportTop, viewportBottom, scrollTop, clientHeight, scrollHeight].every(Number.isFinite)) return 0;
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
  const visibleHeight = viewportBottom - viewportTop;
  if (maxScrollTop <= 0 || visibleHeight <= 0) return 0;

  const edgeSize = Math.min(SORTABLE_LIST_DRAG_AUTO_SCROLL_EDGE_PX, visibleHeight / 2);
  if (pointerY < viewportTop - edgeSize || pointerY > viewportBottom + edgeSize) return 0;

  if (pointerY < viewportTop + edgeSize && scrollTop > 0) {
    const strength = Math.min(1, Math.max(0, (viewportTop + edgeSize - pointerY) / edgeSize));
    return -Math.min(scrollTop, Math.max(1, Math.round(strength * SORTABLE_LIST_DRAG_AUTO_SCROLL_MAX_PX)));
  }
  if (pointerY > viewportBottom - edgeSize && scrollTop < maxScrollTop) {
    const strength = Math.min(1, Math.max(0, (pointerY - (viewportBottom - edgeSize)) / edgeSize));
    return Math.min(maxScrollTop - scrollTop, Math.max(1, Math.round(strength * SORTABLE_LIST_DRAG_AUTO_SCROLL_MAX_PX)));
  }
  return 0;
}

export type SortableListAutoScrollCandidate = {
  bounds: SortableListScrollBounds;
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
};

export function getSortableListDragAutoScrollTarget(
  candidates: readonly SortableListAutoScrollCandidate[],
  pointerY: number,
) {
  for (const [index, candidate] of candidates.entries()) {
    const delta = getSortableListDragAutoScrollDelta({
      clientHeight: candidate.clientHeight,
      pointerY,
      scrollHeight: candidate.scrollHeight,
      scrollTop: candidate.scrollTop,
      viewportBottom: candidate.bounds.bottom,
      viewportTop: candidate.bounds.top,
    });
    if (delta !== 0) return { delta, index };
  }
  return null;
}

export function getSortableListDragPreviewTop(pointerY: number, pointerOffsetY: number) {
  return pointerY - pointerOffsetY;
}

export function getSortableListDropIndicatorTop({
  rows,
  sourceIndex,
  targetIndex,
  gap = 8,
}: {
  rows: readonly SortableListScrollBounds[];
  sourceIndex: number;
  targetIndex: number;
  gap?: number;
}) {
  if (!Number.isFinite(gap) || gap < 0) return null;
  const remainingRows = rows.filter((_, index) => index !== sourceIndex);
  if (targetIndex < 0 || targetIndex > remainingRows.length) return null;
  const nextRow = remainingRows[targetIndex];
  if (nextRow) return nextRow.top - gap / 2;
  const previousRow = remainingRows.at(-1);
  return previousRow ? previousRow.bottom + gap / 2 : null;
}

export type SortableListReorderContext = {
  dropZoneId: string | null;
  sourceIndex: number;
  targetIndex: number;
};

export function getSortableListReorderCommit<T>({
  items,
  active,
  cancelled,
  sourceIndex,
  targetIndex,
  dropZoneId,
}: {
  items: readonly T[];
  active: boolean;
  cancelled: boolean;
} & SortableListReorderContext) {
  if (!active || cancelled || (sourceIndex === targetIndex && dropZoneId === null)) return null;
  return {
    context: { dropZoneId, sourceIndex, targetIndex },
    items: reorderListItems(items, sourceIndex, targetIndex),
  };
}
