import {
  getStyleLabBuilderChildren,
  getStyleLabBuilderNode,
  normalizeStyleLabBuilderDraft,
  normalizeStyleLabBuilderGridColumnStart,
  normalizeStyleLabBuilderGridColumnSpan,
  STYLE_LAB_BUILDER_MAX_DEPTH,
  type StyleLabBuilderDraft,
  type StyleLabBuilderPlacement,
} from "./style-lab-builder-model";
import { STYLE_LAB_BUILDER_GRID_COLUMNS, type StyleLabBuilderLayout } from "./style-lab-registry";

export type StyleLabBuilderDragRect = {
  bottom: number;
  height: number;
  id: string;
  left: number;
  right: number;
  top: number;
  width: number;
};

export type StyleLabBuilderDragContainerGeometry = StyleLabBuilderDragRect & {
  depth: number;
  gridColumns: number;
  layout: StyleLabBuilderLayout;
  parentId: string | null;
};

export type StyleLabBuilderGridInputItem = {
  gridColumnStart?: number;
  gridColumnSpan?: number;
  height: number;
  id: string;
};

export type StyleLabBuilderPackedGridItem = StyleLabBuilderDragRect & {
  columnStart: number;
  columnSpan: number;
  index: number;
  rowIndex: number;
};

export type StyleLabBuilderPackedGridRow = {
  bottom: number;
  index: number;
  items: StyleLabBuilderPackedGridItem[];
  top: number;
};

export type StyleLabBuilderPackedGrid = {
  columns: number;
  contentHeight: number;
  items: StyleLabBuilderPackedGridItem[];
  rows: StyleLabBuilderPackedGridRow[];
  trackWidth: number;
};

export type StyleLabBuilderGridDropTarget = {
  blocked: boolean;
  blockedBy: string[];
  candidate: StyleLabBuilderPackedGridItem;
  columnStart: number;
  insertionIndex: number;
  occupied: StyleLabBuilderPackedGrid;
  preview: StyleLabBuilderPackedGrid;
  rowIndex: number;
};

export type StyleLabBuilderLinearDropTarget = {
  candidate: StyleLabBuilderDragRect;
  insertionIndex: number;
  insertionLine: number;
};

export type StyleLabBuilderDropBlockReason = "SELF" | "DESCENDANT" | "DEPTH" | "INVALID_TARGET";

export type StyleLabBuilderContainerTarget = {
  container: StyleLabBuilderDragContainerGeometry;
  valid: boolean;
  reason?: StyleLabBuilderDropBlockReason;
};

export type StyleLabBuilderDropPlan = {
  draft: StyleLabBuilderDraft;
  reason?: StyleLabBuilderDropBlockReason;
  valid: boolean;
};

export function normalizeStyleLabBuilderDragSpan(value: unknown, parentColumns: number): number {
  return normalizeStyleLabBuilderGridColumnSpan(value, parentColumns);
}

function safeNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function safePositive(value: number, fallback: number): number {
  return Math.max(1, safeNumber(value, fallback));
}

export function packStyleLabBuilderGrid(
  items: readonly StyleLabBuilderGridInputItem[],
  columns: number,
  contentWidth: number,
  gap = 12,
  rowGap = gap,
): StyleLabBuilderPackedGrid {
  const safeColumns = Math.max(1, Math.min(STYLE_LAB_BUILDER_GRID_COLUMNS[STYLE_LAB_BUILDER_GRID_COLUMNS.length - 1], Math.round(safeNumber(columns, 1))));
  const safeWidth = Math.max(1, safeNumber(contentWidth, 1));
  const safeGap = Math.max(0, safeNumber(gap, 0));
  const safeRowGap = Math.max(0, safeNumber(rowGap, safeGap));
  const trackWidth = Math.max(1, (safeWidth - safeGap * (safeColumns - 1)) / safeColumns);
  const packedItems: StyleLabBuilderPackedGridItem[] = [];
  const rows: StyleLabBuilderPackedGridRow[] = [];
  let rowTop = 0;

  const ensureRow = () => {
    const existing = rows[rows.length - 1];
    if (existing) return existing;
    const row = { bottom: rowTop, index: rows.length, items: [], top: rowTop };
    rows.push(row);
    return row;
  };

  const beginRow = () => {
    const previous = rows[rows.length - 1];
    rowTop = previous ? previous.bottom + safeRowGap : 0;
    const row = { bottom: rowTop, index: rows.length, items: [], top: rowTop };
    rows.push(row);
    return row;
  };

  const overlaps = (start: number, span: number, item: StyleLabBuilderPackedGridItem) => start < item.columnStart + item.columnSpan && item.columnStart < start + span;

  const firstAvailableStart = (row: StyleLabBuilderPackedGridRow, span: number) => {
    const maxStart = Math.max(1, safeColumns - span + 1);
    for (let candidate = 1; candidate <= maxStart; candidate += 1) {
      if (!row.items.some((item) => overlaps(candidate, span, item))) return candidate;
    }
    return 1;
  };

  items.forEach((item, index) => {
    const columnSpan = normalizeStyleLabBuilderGridColumnSpan(item.gridColumnSpan, safeColumns);
    let row = ensureRow();
    const hasExplicitStart = item.gridColumnStart !== undefined && Number.isFinite(item.gridColumnStart);
    const requestedStart = hasExplicitStart
      ? normalizeStyleLabBuilderGridColumnStart(item.gridColumnStart, safeColumns, columnSpan)
      : firstAvailableStart(row, columnSpan);
    let columnStart = requestedStart;
    if (row.items.some((existing) => overlaps(columnStart, columnSpan, existing))) {
      row = beginRow();
      columnStart = hasExplicitStart ? requestedStart : firstAvailableStart(row, columnSpan);
    }
    const height = safePositive(item.height, 1);
    const width = trackWidth * columnSpan + safeGap * (columnSpan - 1);
    const packed = {
      bottom: rowTop + height,
      columnStart,
      columnSpan,
      height,
      id: item.id,
      index,
      left: (columnStart - 1) * (trackWidth + safeGap),
      right: (columnStart - 1) * (trackWidth + safeGap) + width,
      rowIndex: row.index,
      top: rowTop,
      width,
    };
    row.items.push(packed);
    packedItems.push(packed);
    row.bottom = Math.max(row.bottom, rowTop + height);
  });
  return {
    columns: safeColumns,
    contentHeight: rows.length > 0 ? rows[rows.length - 1]!.bottom : 0,
    items: packedItems,
    rows,
    trackWidth,
  };
}

export function getStyleLabBuilderLinearInsertionIndex(
  childRects: readonly (StyleLabBuilderDragRect & { index: number })[],
  layout: "row" | "column",
  pointerX: number,
  pointerY: number,
): number {
  const ordered = [...childRects].sort((left, right) => left.index - right.index);
  const pointer = layout === "row" ? pointerX : pointerY;
  return ordered.findIndex((rect) => pointer < (layout === "row" ? rect.left + rect.width / 2 : rect.top + rect.height / 2)) >= 0
    ? ordered.findIndex((rect) => pointer < (layout === "row" ? rect.left + rect.width / 2 : rect.top + rect.height / 2))
    : ordered.length;
}

export function getStyleLabBuilderLinearDropTarget({
  childRects,
  container,
  layout,
  pointerX,
  pointerY,
  sourceHeight,
  sourceWidth,
}: {
  childRects: readonly (StyleLabBuilderDragRect & { index: number })[];
  container: Pick<StyleLabBuilderDragContainerGeometry, "height" | "left" | "top" | "width">;
  layout: "row" | "column";
  pointerX: number;
  pointerY: number;
  sourceHeight: number;
  sourceWidth: number;
}): StyleLabBuilderLinearDropTarget {
  const ordered = [...childRects].sort((left, right) => left.index - right.index);
  const insertionIndex = getStyleLabBuilderLinearInsertionIndex(ordered, layout, pointerX, pointerY);
  const safeWidth = Math.min(safePositive(sourceWidth, container.width), Math.max(1, container.width));
  const safeHeight = safePositive(sourceHeight, container.height);
  const gap = ordered.length > 1
    ? Math.max(0, (layout === "row" ? ordered[1]!.left - ordered[0]!.right : ordered[1]!.top - ordered[0]!.bottom))
    : 12;
  if (layout === "row") {
    const previous = ordered[insertionIndex - 1];
    const next = ordered[insertionIndex];
    const insertionLine = previous && next ? (previous.right + next.left) / 2 : previous ? previous.right + gap / 2 : next ? next.left - gap / 2 : container.left + container.width / 2;
    return {
      candidate: {
        bottom: container.top + safeHeight,
        height: safeHeight,
        id: "candidate",
        left: insertionLine - safeWidth / 2,
        right: insertionLine - safeWidth / 2 + safeWidth,
        top: container.top,
        width: safeWidth,
      },
      insertionIndex,
      insertionLine,
    };
  }
  const previous = ordered[insertionIndex - 1];
  const next = ordered[insertionIndex];
  const insertionLine = previous && next ? (previous.bottom + next.top) / 2 : previous ? previous.bottom + gap / 2 : next ? next.top - gap / 2 : container.top + container.height / 2;
  return {
    candidate: {
      bottom: insertionLine - safeHeight / 2 + safeHeight,
      height: safeHeight,
      id: "candidate",
      left: container.left,
      right: container.left + safeWidth,
      top: insertionLine - safeHeight / 2,
      width: safeWidth,
    },
    insertionIndex,
    insertionLine,
  };
}

export function getStyleLabBuilderGridDropTarget({
  children,
  columns,
  contentLeft = 0,
  contentTop = 0,
  contentWidth,
  gap = 12,
  grabOffsetX = 0,
  pointerX,
  pointerY,
  preserveSourceOrder = false,
  rowGap = gap,
  sourceIndex,
  sourceHeight,
  sourceId,
  sourceSpan = 1,
}: {
  children: readonly StyleLabBuilderGridInputItem[];
  columns: number;
  contentLeft?: number;
  contentTop?: number;
  contentWidth: number;
  gap?: number;
  grabOffsetX?: number;
  pointerX: number;
  pointerY: number;
  preserveSourceOrder?: boolean;
  rowGap?: number;
  sourceIndex?: number;
  sourceHeight: number;
  sourceId: string;
  sourceSpan?: number;
}): StyleLabBuilderGridDropTarget {
  const withoutSource = children.filter((child) => child.id !== sourceId);
  const occupied = packStyleLabBuilderGrid(withoutSource, columns, contentWidth, gap, rowGap);
  const sourceColumnSpan = normalizeStyleLabBuilderGridColumnSpan(sourceSpan, occupied.columns);
  const columnStart = getStyleLabBuilderGridStartFromPointer({ columns: occupied.columns, contentLeft, contentWidth, gap, grabOffsetX, pointerX, sourceSpan: sourceColumnSpan });
  const pointerLocalY = pointerY - contentTop;
  const rowIndex = getStyleLabBuilderGridRowIndexFromPointer(occupied, pointerLocalY, rowGap);
  const row = occupied.rows[rowIndex];
  const rowTop = row?.top ?? (occupied.rows[occupied.rows.length - 1]?.bottom ?? 0) + (occupied.rows.length > 0 ? rowGap : 0);
  const rowItems = row?.items ?? [];
  const firstRowIndex = rowItems.length > 0 ? Math.min(...rowItems.map((item) => item.index)) : withoutSource.length;
  const lastRowIndex = rowItems.length > 0 ? Math.max(...rowItems.map((item) => item.index)) + 1 : withoutSource.length;
  const insertionIndex = preserveSourceOrder && sourceIndex !== undefined
    ? Math.max(0, Math.min(withoutSource.length, sourceIndex))
    : row
      ? pointerLocalY > (row.top + row.bottom) / 2 ? lastRowIndex : firstRowIndex
      : withoutSource.length;
  const source = { gridColumnStart: columnStart, gridColumnSpan: sourceColumnSpan, height: sourceHeight, id: sourceId };
  const previewItems = [...withoutSource];
  previewItems.splice(insertionIndex, 0, source);
  const preview = packStyleLabBuilderGrid(previewItems, occupied.columns, contentWidth, gap, rowGap);
  const trackWidth = occupied.trackWidth;
  const candidateWidth = trackWidth * sourceColumnSpan + gap * (sourceColumnSpan - 1);
  const candidate: StyleLabBuilderPackedGridItem = {
    bottom: contentTop + rowTop + sourceHeight,
    columnSpan: sourceColumnSpan,
    columnStart,
    height: sourceHeight,
    id: sourceId,
    index: insertionIndex,
    left: contentLeft + (columnStart - 1) * (trackWidth + gap),
    right: contentLeft + (columnStart - 1) * (trackWidth + gap) + candidateWidth,
    rowIndex,
    top: contentTop + rowTop,
    width: candidateWidth,
  };
  const blockedBy = occupied.items
    .filter((item) => item.rowIndex === rowIndex && item.id !== sourceId && columnStart < item.columnStart + item.columnSpan && item.columnStart < columnStart + sourceColumnSpan)
    .map((item) => item.id);
  return {
    blocked: blockedBy.length > 0,
    blockedBy,
    candidate,
    columnStart,
    insertionIndex,
    occupied,
    preview,
    rowIndex,
  };
}

export function getStyleLabBuilderGridStartFromPointer({
  columns,
  contentLeft = 0,
  contentWidth,
  gap = 12,
  grabOffsetX = 0,
  pointerX,
  sourceSpan = 1,
}: {
  columns: number;
  contentLeft?: number;
  contentWidth: number;
  gap?: number;
  grabOffsetX?: number;
  pointerX: number;
  sourceSpan?: number;
}): number {
  const safeColumns = Math.max(1, Math.min(12, Math.round(safeNumber(columns, 1))));
  const safeGap = Math.max(0, safeNumber(gap, 0));
  const trackWidth = (Math.max(1, safeNumber(contentWidth, 1)) - safeGap * (safeColumns - 1)) / safeColumns;
  if (trackWidth <= 0) return 1;
  const intendedLeft = safeNumber(pointerX, contentLeft) - safeNumber(grabOffsetX, 0);
  return normalizeStyleLabBuilderGridColumnStart(Math.round((intendedLeft - contentLeft) / (trackWidth + safeGap)) + 1, safeColumns, sourceSpan);
}

function getStyleLabBuilderGridRowIndexFromPointer(grid: StyleLabBuilderPackedGrid, pointerY: number, rowGap: number): number {
  if (grid.rows.length === 0) return 0;
  for (let index = 0; index < grid.rows.length; index += 1) {
    const row = grid.rows[index]!;
    const next = grid.rows[index + 1];
    const boundary = next ? (row.bottom + next.top) / 2 : row.bottom + rowGap / 2;
    if (pointerY <= boundary) return index;
  }
  return grid.rows.length;
}

function containsPoint(container: StyleLabBuilderDragContainerGeometry, pointerX: number, pointerY: number): boolean {
  return pointerX >= container.left && pointerX <= container.right && pointerY >= container.top && pointerY <= container.bottom;
}

export function getStyleLabBuilderDropContainer(
  containers: readonly StyleLabBuilderDragContainerGeometry[],
  pointerX: number,
  pointerY: number,
  sourceId: string,
  descendantIds: ReadonlySet<string>,
): StyleLabBuilderContainerTarget | null {
  const target = containers
    .filter((container) => containsPoint(container, pointerX, pointerY))
    .sort((left, right) => right.depth - left.depth || left.width * left.height - right.width * right.height)[0];
  if (!target) return null;
  if (target.id === sourceId) return { container: target, reason: "SELF", valid: false };
  if (descendantIds.has(target.id)) return { container: target, reason: "DESCENDANT", valid: false };
  return { container: target, valid: true };
}

export function getStyleLabBuilderDescendantIds(draft: StyleLabBuilderDraft, sourceId: string): Set<string> {
  const descendants = new Set<string>();
  const queue = [sourceId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    for (const child of getStyleLabBuilderChildren(draft, parentId)) {
      if (descendants.has(child.id)) continue;
      descendants.add(child.id);
      if (child.type === "container") queue.push(child.id);
    }
  }
  return descendants;
}

export function getStyleLabBuilderNodeDepth(draft: StyleLabBuilderDraft, nodeId: string): number {
  let depth = 0;
  let current = getStyleLabBuilderNode(draft, nodeId);
  const visited = new Set<string>();
  while (current?.parentId && !visited.has(current.id)) {
    visited.add(current.id);
    depth += 1;
    current = getStyleLabBuilderNode(draft, current.parentId);
  }
  return depth;
}

function subtreeDepth(draft: StyleLabBuilderDraft, sourceId: string): number {
  const source = getStyleLabBuilderNode(draft, sourceId);
  if (!source || source.type !== "container") return 0;
  const descendants = getStyleLabBuilderDescendantIds(draft, sourceId);
  return Math.max(0, ...Array.from(descendants, (id) => getStyleLabBuilderNodeDepth(draft, id) - getStyleLabBuilderNodeDepth(draft, sourceId)));
}

export function canStyleLabBuilderMoveNode(draft: StyleLabBuilderDraft, sourceId: string, targetParentId: string): { reason?: StyleLabBuilderDropBlockReason; valid: boolean } {
  const normalized = normalizeStyleLabBuilderDraft(draft);
  const source = getStyleLabBuilderNode(normalized, sourceId);
  const target = getStyleLabBuilderNode(normalized, targetParentId);
  if (!source || source.id === "root" || !target || target.type !== "container") return { reason: "INVALID_TARGET", valid: false };
  const descendants = getStyleLabBuilderDescendantIds(normalized, sourceId);
  if (sourceId === targetParentId) return { reason: "SELF", valid: false };
  if (descendants.has(targetParentId)) return { reason: "DESCENDANT", valid: false };
  if (getStyleLabBuilderNodeDepth(normalized, targetParentId) + 1 + subtreeDepth(normalized, sourceId) > STYLE_LAB_BUILDER_MAX_DEPTH) return { reason: "DEPTH", valid: false };
  return { valid: true };
}

export function planStyleLabBuilderDrop(draft: StyleLabBuilderDraft, sourceId: string, targetParentId: string, insertionIndex: number, placement?: Partial<StyleLabBuilderPlacement>): StyleLabBuilderDropPlan {
  const normalized = normalizeStyleLabBuilderDraft(draft);
  const validation = canStyleLabBuilderMoveNode(normalized, sourceId, targetParentId);
  if (!validation.valid) return { draft: normalized, reason: validation.reason, valid: false };
  const source = getStyleLabBuilderNode(normalized, sourceId)!;
  const sourceParentId = source.parentId ?? "root";
  const targetChildren = getStyleLabBuilderChildren(normalized, targetParentId).filter((node) => node.id !== sourceId).map((node) => node.id);
  const nextIndex = Math.max(0, Math.min(targetChildren.length, Math.round(safeNumber(insertionIndex, targetChildren.length))));
  targetChildren.splice(nextIndex, 0, sourceId);
  const sourceChildren = sourceParentId === targetParentId
    ? targetChildren
    : getStyleLabBuilderChildren(normalized, sourceParentId).filter((node) => node.id !== sourceId).map((node) => node.id);
  const orderById = new Map<string, number>();
  targetChildren.forEach((id, index) => orderById.set(id, index));
  sourceChildren.forEach((id, index) => orderById.set(id, index));
  const nextNodes = normalized.nodes.map((node) => {
    if (node.id === sourceId) return { ...node, parentId: targetParentId, order: orderById.get(node.id) ?? nextIndex, placement: placement ? { ...node.placement, ...placement } : node.placement };
    if (node.parentId === targetParentId || (sourceParentId !== targetParentId && node.parentId === sourceParentId)) {
      return { ...node, order: orderById.get(node.id) ?? node.order };
    }
    return node;
  });
  return { draft: normalizeStyleLabBuilderDraft({ ...normalized, nodes: nextNodes }), valid: true };
}

export function applyStyleLabBuilderDrop(draft: StyleLabBuilderDraft, sourceId: string, targetParentId: string, insertionIndex: number, placement?: Partial<StyleLabBuilderPlacement>): StyleLabBuilderDraft {
  return planStyleLabBuilderDrop(draft, sourceId, targetParentId, insertionIndex, placement).draft;
}
