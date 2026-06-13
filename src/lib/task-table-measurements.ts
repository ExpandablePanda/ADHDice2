export const COLUMN_WIDTH_SHRINK_JITTER_TOLERANCE_PX = 1;

export function mergeMeasuredColumnWidths<ColumnId extends string>(
  current: Record<ColumnId, number>,
  measured: Partial<Record<ColumnId, number>>,
  visibleColumnIds: readonly ColumnId[],
  shrinkJitterTolerancePx = COLUMN_WIDTH_SHRINK_JITTER_TOLERANCE_PX,
): Record<ColumnId, number> {
  let changed = false;
  const next = { ...current };

  for (const columnId of visibleColumnIds) {
    const currentWidth = current[columnId];
    const measuredWidth = measured[columnId];
    if (typeof measuredWidth !== "number" || !Number.isFinite(measuredWidth)) {
      continue;
    }

    if (measuredWidth > currentWidth || measuredWidth < currentWidth - shrinkJitterTolerancePx) {
      next[columnId] = measuredWidth;
      changed = true;
      continue;
    }

    next[columnId] = currentWidth;
  }

  return changed ? next : current;
}
