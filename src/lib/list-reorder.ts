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
  if (maxScrollTop <= 0) return 0;
  if (pointerY < viewportTop + SORTABLE_LIST_DRAG_AUTO_SCROLL_EDGE_PX && scrollTop > 0) {
    const strength = Math.min(1, Math.max(0, (viewportTop + SORTABLE_LIST_DRAG_AUTO_SCROLL_EDGE_PX - pointerY) / SORTABLE_LIST_DRAG_AUTO_SCROLL_EDGE_PX));
    return -Math.min(scrollTop, Math.max(1, Math.round(strength * SORTABLE_LIST_DRAG_AUTO_SCROLL_MAX_PX)));
  }
  if (pointerY > viewportBottom - SORTABLE_LIST_DRAG_AUTO_SCROLL_EDGE_PX && scrollTop < maxScrollTop) {
    const strength = Math.min(1, Math.max(0, (pointerY - (viewportBottom - SORTABLE_LIST_DRAG_AUTO_SCROLL_EDGE_PX)) / SORTABLE_LIST_DRAG_AUTO_SCROLL_EDGE_PX));
    return Math.min(maxScrollTop - scrollTop, Math.max(1, Math.round(strength * SORTABLE_LIST_DRAG_AUTO_SCROLL_MAX_PX)));
  }
  return 0;
}
