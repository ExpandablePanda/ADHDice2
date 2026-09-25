import {
  getStyleLabBuilderChildren,
  getStyleLabBuilderNode,
  normalizeStyleLabBuilderDraft,
  normalizeStyleLabBuilderGridColumnSpan,
  STYLE_LAB_BUILDER_MAX_DEPTH,
  type StyleLabBuilderDraft,
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
  candidate: StyleLabBuilderPackedGridItem;
  insertionIndex: number;
  occupied: StyleLabBuilderPackedGrid;
  preview: StyleLabBuilderPackedGrid;
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

function distanceToRect(pointX: number, pointY: number, rect: Pick<StyleLabBuilderDragRect, "bottom" | "left" | "right" | "top">): number {
  const dx = pointX < rect.left ? rect.left - pointX : pointX > rect.right ? pointX - rect.right : 0;
  const dy = pointY < rect.top ? rect.top - pointY : pointY > rect.bottom ? pointY - rect.bottom : 0;
  return Math.hypot(dx, dy);
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
  let rowIndex = 0;
  let columnStart = 1;
  let rowTop = 0;
  let rowHeight = 0;

  const ensureRow = () => {
    const existing = rows[rowIndex];
    if (existing) return existing;
    const row = { bottom: rowTop, index: rowIndex, items: [], top: rowTop };
    rows.push(row);
    return row;
  };

  items.forEach((item, index) => {
    const columnSpan = normalizeStyleLabBuilderGridColumnSpan(item.gridColumnSpan, safeColumns);
    if (columnStart > 1 && columnStart + columnSpan - 1 > safeColumns) {
      const previousRow = ensureRow();
      previousRow.bottom = previousRow.top + rowHeight;
      rowTop = previousRow.bottom + safeRowGap;
      rowIndex += 1;
      columnStart = 1;
      rowHeight = 0;
    }
    const row = ensureRow();
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
      rowIndex,
      top: rowTop,
      width,
    };
    row.items.push(packed);
    packedItems.push(packed);
    rowHeight = Math.max(rowHeight, height);
    row.bottom = rowTop + rowHeight;
    columnStart += columnSpan;
  });

  if (rows.length > 0) {
    const lastRow = rows[rows.length - 1]!;
    lastRow.bottom = lastRow.top + rowHeight;
  }
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
  pointerX,
  pointerY,
  rowGap = gap,
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
  pointerX: number;
  pointerY: number;
  rowGap?: number;
  sourceHeight: number;
  sourceId: string;
  sourceSpan?: number;
}): StyleLabBuilderGridDropTarget {
  const occupied = packStyleLabBuilderGrid(children.filter((child) => child.id !== sourceId), columns, contentWidth, gap, rowGap);
  const source = { gridColumnSpan: normalizeStyleLabBuilderGridColumnSpan(sourceSpan, columns), height: sourceHeight, id: sourceId };
  const candidates = Array.from({ length: children.filter((child) => child.id !== sourceId).length + 1 }, (_, insertionIndex) => {
    const withoutSource = children.filter((child) => child.id !== sourceId);
    withoutSource.splice(insertionIndex, 0, source);
    const preview = packStyleLabBuilderGrid(withoutSource, columns, contentWidth, gap, rowGap);
    const candidate = preview.items.find((item) => item.id === sourceId)!;
    return { candidate, insertionIndex, preview, score: distanceToRect(pointerX, pointerY, { bottom: contentTop + candidate.bottom, left: contentLeft + candidate.left, right: contentLeft + candidate.right, top: contentTop + candidate.top }) };
  });
  const selected = candidates.sort((left, right) => left.score - right.score || left.insertionIndex - right.insertionIndex)[0]!;
  return {
    candidate: {
      ...selected.candidate,
      bottom: selected.candidate.bottom + contentTop,
      left: selected.candidate.left + contentLeft,
      right: selected.candidate.right + contentLeft,
      top: selected.candidate.top + contentTop,
    },
    insertionIndex: selected.insertionIndex,
    occupied,
    preview: selected.preview,
  };
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

export function planStyleLabBuilderDrop(draft: StyleLabBuilderDraft, sourceId: string, targetParentId: string, insertionIndex: number): StyleLabBuilderDropPlan {
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
    if (node.id === sourceId) return { ...node, parentId: targetParentId, order: orderById.get(node.id) ?? nextIndex };
    if (node.parentId === targetParentId || (sourceParentId !== targetParentId && node.parentId === sourceParentId)) {
      return { ...node, order: orderById.get(node.id) ?? node.order };
    }
    return node;
  });
  return { draft: normalizeStyleLabBuilderDraft({ ...normalized, nodes: nextNodes }), valid: true };
}

export function applyStyleLabBuilderDrop(draft: StyleLabBuilderDraft, sourceId: string, targetParentId: string, insertionIndex: number): StyleLabBuilderDraft {
  return planStyleLabBuilderDrop(draft, sourceId, targetParentId, insertionIndex).draft;
}
