export const COLUMN_WIDTH_SHRINK_JITTER_TOLERANCE_PX = 1;

export function normalizeMeasuredColumnWidth(width: number) {
  return Number.isFinite(width) ? Math.ceil(width) : width;
}

export function mergeMeasuredColumnWidths<ColumnId extends string>(
  current: Record<ColumnId, number>,
  measured: Partial<Record<ColumnId, number>>,
  visibleColumnIds: readonly ColumnId[],
): Record<ColumnId, number> {
  let changed = false;
  const next = { ...current };

  for (const columnId of visibleColumnIds) {
    const currentWidth = current[columnId];
    const measuredWidth = measured[columnId];
    if (typeof measuredWidth !== "number" || !Number.isFinite(measuredWidth)) {
      continue;
    }

    // Passive measurement should only grow widths. Auto-shrinking can create a
    // feedback loop where the table reflows, remeasures slightly smaller, and
    // keeps setting state on every frame.
    if (measuredWidth > currentWidth) {
      next[columnId] = measuredWidth;
      changed = true;
      continue;
    }

    next[columnId] = currentWidth;
  }

  return changed ? next : current;
}
