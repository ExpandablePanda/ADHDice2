"use client";

import { GripVertical } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  getSortableListDragAutoScrollTarget,
  getSortableListDragPreviewTop,
  getSortableListDropIndicatorTop,
  getSortableListReorderCommit,
  getSortableListVisibleScrollBounds,
  type SortableListReorderContext,
} from "@/lib/list-reorder";

type DragState = {
  active: boolean;
  id: string;
  label: string;
  pointerId: number;
  pointerOffsetY: number;
  pointerY: number;
  sourceIndex: number;
  targetIndex: number;
  dropZoneId: string | null;
  dropIndicator: { left: number; top: number; width: number } | null;
};

type AutoScrollCandidate = {
  bounds: { top: number; bottom: number };
  clientHeight: number;
  owner: HTMLElement;
  scrollHeight: number;
  scrollTop: number;
};

function getDropIndex(midpoints: readonly number[], pointerY: number, sourceIndex: number) {
  const remaining = midpoints.filter((_, index) => index !== sourceIndex);
  const insertionIndex = remaining.findIndex((midpoint) => pointerY < midpoint);
  return insertionIndex < 0 ? remaining.length : insertionIndex;
}

function getDropZoneIndex(rawIndex: number, itemCount: number) {
  return Math.max(0, Math.min(Math.max(0, itemCount - 1), rawIndex));
}

function isScrollableElement(element: HTMLElement) {
  if (typeof window === "undefined") return false;
  const computedStyle = window.getComputedStyle(element);
  return /^(auto|scroll|overlay)$/.test(computedStyle.overflowY) && element.scrollHeight > element.clientHeight;
}

function getScrollableContainerCandidates(root: HTMLElement) {
  const candidates: HTMLElement[] = [];
  let current: HTMLElement | null = root;
  while (current) {
    if (isScrollableElement(current)) candidates.push(current);
    current = current.parentElement;
  }

  const documentScroller = document.scrollingElement;
  if (
    documentScroller instanceof HTMLElement
    && !candidates.includes(documentScroller)
    && documentScroller.scrollHeight > documentScroller.clientHeight
  ) {
    candidates.push(documentScroller);
  }
  return candidates;
}

function getVisibleScrollBounds(owner: HTMLElement) {
  const isDocumentScroller = owner === document.scrollingElement;
  const ownerRect = owner.getBoundingClientRect();
  const scrollPortTop = isDocumentScroller ? 0 : ownerRect.top + owner.clientTop;
  const scrollPortBottom = isDocumentScroller ? window.innerHeight : scrollPortTop + owner.clientHeight;
  const clipBounds: { top: number; bottom: number }[] = [];

  if (!isDocumentScroller) {
    let ancestor = owner.parentElement;
    while (ancestor) {
      const style = window.getComputedStyle(ancestor);
      const clipsOverflow = /^(auto|scroll|hidden|clip|overlay)$/.test(style.overflowY);
      const containValues = style.contain.split(/\s+/);
      const clipsPaint = containValues.includes("paint") || containValues.includes("content") || containValues.includes("strict");
      if (clipsOverflow || clipsPaint) {
        const rect = ancestor.getBoundingClientRect();
        const top = rect.top + ancestor.clientTop;
        clipBounds.push({ bottom: top + ancestor.clientHeight, top });
      }
      ancestor = ancestor.parentElement;
    }
  }

  return getSortableListVisibleScrollBounds({
    clipBounds,
    scrollPortBottom,
    scrollPortTop,
    viewportBottom: window.innerHeight,
    viewportTop: 0,
  });
}

function getAutoScrollCandidates(root: HTMLElement): AutoScrollCandidate[] {
  return getScrollableContainerCandidates(root)
    .map((owner) => {
      const bounds = getVisibleScrollBounds(owner);
      return bounds ? {
        bounds,
        clientHeight: owner.clientHeight,
        owner,
        scrollHeight: owner.scrollHeight,
        scrollTop: owner.scrollTop,
      } : null;
    })
    .filter((candidate): candidate is AutoScrollCandidate => candidate !== null);
}

export function SortableList<T>({
  children,
  className = "mt-3 space-y-2",
  getId,
  getLabel,
  items,
  onReorder,
  renderAfterItems,
  renderBeforeItem,
}: {
  children: (item: T, index: number, handle: ReactNode) => ReactNode;
  className?: string;
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  items: readonly T[];
  onReorder: (items: T[], context: SortableListReorderContext) => void;
  renderAfterItems?: ReactNode;
  renderBeforeItem?: (item: T, index: number) => ReactNode;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const snapshotRef = useRef<readonly T[]>(items);
  const holdRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const capturedPointerRef = useRef<{ element: HTMLButtonElement; pointerId: number } | null>(null);
  const pendingYRef = useRef<number | null>(null);
  const pointerYRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const updateDrag = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const getDropState = useCallback((current: DragState, pointerY: number) => {
    const root = rootRef.current;
    const rows = Array.from(root?.querySelectorAll<HTMLElement>("[data-sortable-row]") ?? []);
    const rowBounds = rows.map((row) => {
      const rect = row.getBoundingClientRect();
      return { bottom: rect.bottom, top: rect.top };
    });
    const midpoints = rowBounds.map(({ bottom, top }) => top + (bottom - top) / 2);
    const dropZone = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-sortable-drop-index]") ?? [])
      .map((element) => {
        const rawIndex = Number.parseInt(element.dataset.sortableDropIndex ?? "", 10);
        const rect = element.getBoundingClientRect();
        return Number.isFinite(rawIndex)
          ? { bottom: rect.bottom, id: element.dataset.sortableDropId ?? null, rawIndex, top: rect.top }
          : null;
      })
      .find((candidate) => candidate && pointerY >= candidate.top && pointerY <= candidate.bottom);
    const targetIndex = dropZone
      ? getDropZoneIndex(dropZone.rawIndex, snapshotRef.current.length)
      : getDropIndex(midpoints, pointerY, current.sourceIndex);
    const rootRect = root?.getBoundingClientRect();
    const indicatorTop = getSortableListDropIndicatorTop({
      rows: rowBounds,
      sourceIndex: current.sourceIndex,
      targetIndex,
    });
    return {
      dropZoneId: dropZone?.id ?? null,
      dropIndicator: indicatorTop === null || !rootRect
        ? null
        : { left: rootRect.left, top: indicatorTop, width: rootRect.width },
      pointerY,
      targetIndex,
    };
  }, []);

  const processPointerMove = useCallback((pointerY: number) => {
    const current = dragRef.current;
    if (!current?.active) return;
    pointerYRef.current = pointerY;
    updateDrag({ ...current, ...getDropState(current, pointerY) });
  }, [getDropState, updateDrag]);

  const cancelAutoScroll = useCallback(() => {
    if (autoScrollFrameRef.current !== null) window.cancelAnimationFrame(autoScrollFrameRef.current);
    autoScrollFrameRef.current = null;
  }, []);

  const releaseCapturedPointer = useCallback(() => {
    const captured = capturedPointerRef.current;
    capturedPointerRef.current = null;
    if (!captured?.element.isConnected || !captured.element.hasPointerCapture(captured.pointerId)) return;
    try {
      captured.element.releasePointerCapture(captured.pointerId);
    } catch {
      // The browser may already have released capture while dispatching cancellation.
    }
  }, []);

  const cancelDrag = useCallback(() => {
    if (holdRef.current !== null) window.clearTimeout(holdRef.current);
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    cancelAutoScroll();
    holdRef.current = null;
    frameRef.current = null;
    pendingYRef.current = null;
    pointerYRef.current = null;
    updateDrag(null);
    releaseCapturedPointer();
  }, [cancelAutoScroll, releaseCapturedPointer, updateDrag]);

  const finish = useCallback((pointerId: number, cancelled = false) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const commit = getSortableListReorderCommit({
      active: current.active,
      cancelled,
      dropZoneId: current.dropZoneId,
      items: snapshotRef.current,
      sourceIndex: current.sourceIndex,
      targetIndex: current.targetIndex,
    });
    if (commit) {
      onReorder(commit.items, commit.context);
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    cancelDrag();
  }, [cancelDrag, onReorder]);

  useEffect(() => () => cancelDrag(), [cancelDrag]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelDrag();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelDrag]);

  const runAutoScroll = () => {
    autoScrollFrameRef.current = null;
    const current = dragRef.current;
    const root = rootRef.current;
    const pointerY = pointerYRef.current;
    if (!current?.active || !root?.isConnected || pointerY === null) return;

    const candidates = getAutoScrollCandidates(root);
    let remainingCandidates = candidates;
    let didScroll = false;
    while (remainingCandidates.length) {
      const target = getSortableListDragAutoScrollTarget(remainingCandidates, pointerY);
      if (!target) break;
      const candidate = remainingCandidates[target.index]!;
      const owner = candidate.owner;
      const previousScrollTop = owner.scrollTop;
      const maxScrollTop = Math.max(0, owner.scrollHeight - owner.clientHeight);
      owner.scrollTop = Math.max(0, Math.min(maxScrollTop, previousScrollTop + target.delta));
      if (owner.scrollTop !== previousScrollTop) {
        didScroll = true;
        break;
      }
      remainingCandidates = remainingCandidates.slice(target.index + 1);
    }

    if (!didScroll) return;
    processPointerMove(pointerY);
    if (dragRef.current?.active && getSortableListDragAutoScrollTarget(getAutoScrollCandidates(root), pointerY)) {
      autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll);
    }
  };

  const scheduleAutoScroll = () => {
    const current = dragRef.current;
    const root = rootRef.current;
    const pointerY = pointerYRef.current;
    if (!current?.active || !root || pointerY === null) return;
    if (!getSortableListDragAutoScrollTarget(getAutoScrollCandidates(root), pointerY)) {
      cancelAutoScroll();
      return;
    }
    if (autoScrollFrameRef.current === null) autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll);
  };

  const queuePointerMove = useCallback((pointerY: number) => {
    pendingYRef.current = pointerY;
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const y = pendingYRef.current;
      if (y === null) return;
      processPointerMove(y);
    });
  }, [processPointerMove]);

  return (
    <div
      className={className}
      onClickCapture={(event) => {
        if (suppressClickRef.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      ref={rootRef}
    >
      {items.map((item, index) => {
        const id = getId(item);
        const label = getLabel(item);
        return (
          <Fragment key={id}>
            {renderBeforeItem?.(item, index)}
            <div
              className={drag?.active && drag.id === id ? "rounded-[1.1rem] opacity-35 ring-2 ring-dashed ring-[#bbaeff]" : ""}
              data-sortable-row={id}
            >
              {children(item, index, (
                <button
                  aria-label={`Drag ${label}`}
                  className="touch-pan-y cursor-grab rounded-full p-2 text-[#948bac] select-none active:cursor-grabbing"
                  onLostPointerCapture={(event) => finish(event.pointerId, true)}
                  onPointerCancel={(event) => finish(event.pointerId, true)}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    const row = event.currentTarget.closest<HTMLElement>("[data-sortable-row]");
                    const rect = row?.getBoundingClientRect();
                    snapshotRef.current = items;
                    const next: DragState = {
                      active: event.pointerType === "mouse",
                      id,
                      label,
                      pointerId: event.pointerId,
                      pointerOffsetY: rect ? event.clientY - rect.top : 20,
                      pointerY: event.clientY,
                      sourceIndex: index,
                      targetIndex: index,
                      dropZoneId: null,
                      dropIndicator: null,
                    };
                    pointerYRef.current = event.clientY;
                    updateDrag(next);
                    const handle = event.currentTarget;
                    if (event.pointerType === "mouse") {
                      event.preventDefault();
                      try {
                        handle.setPointerCapture(event.pointerId);
                        if (handle.hasPointerCapture(event.pointerId)) {
                          capturedPointerRef.current = { element: handle, pointerId: event.pointerId };
                        }
                      } catch {
                        // Keep the drag usable if a browser declines pointer capture.
                      }
                    } else {
                      holdRef.current = window.setTimeout(() => {
                        holdRef.current = null;
                        if (!handle.isConnected) return;
                        try {
                          handle.setPointerCapture(event.pointerId);
                        } catch {
                          return;
                        }
                        if (!handle.hasPointerCapture(event.pointerId)) return;
                        capturedPointerRef.current = { element: handle, pointerId: event.pointerId };
                        const current = dragRef.current;
                        if (current?.pointerId === event.pointerId) {
                          updateDrag({ ...current, active: true });
                        }
                      }, 350);
                    }
                  }}
                  onPointerMove={(event) => {
                    const current = dragRef.current;
                    if (!current || current.pointerId !== event.pointerId) return;
                    if (!current.active) {
                      if (Math.abs(event.clientY - current.pointerY) > 8) cancelDrag();
                      return;
                    }
                    event.preventDefault();
                    queuePointerMove(event.clientY);
                    pointerYRef.current = event.clientY;
                    scheduleAutoScroll();
                  }}
                  onPointerUp={(event) => {
                    processPointerMove(event.clientY);
                    finish(event.pointerId);
                  }}
                  style={{ touchAction: drag?.id === id && drag.active ? "none" : "pan-y" }}
                  type="button"
                >
                  <GripVertical size={18} />
                </button>
              ))}
            </div>
          </Fragment>
        );
      })}
      {drag?.active
      && (drag.targetIndex !== drag.sourceIndex || drag.dropZoneId !== null)
      && drag.dropIndicator
      && typeof document !== "undefined"
        ? createPortal(
          <div
            aria-hidden="true"
            className="pointer-events-none fixed z-40 border-t-2 border-dashed border-[#9d88fa] dark:border-[#b4a2ff]"
            data-sortable-placeholder
            style={drag.dropIndicator}
          />,
          document.body,
        )
        : null}
      {renderAfterItems}
      {drag?.active ? (
        typeof document === "undefined"
          ? null
          : createPortal(
            <div
              className="pointer-events-none fixed left-1/2 z-50 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[1rem] border border-[#cfc3ed] bg-white px-4 py-2 text-sm font-medium text-[#5f587d] shadow-xl dark:bg-[#201a35]"
              style={{ top: getSortableListDragPreviewTop(drag.pointerY, drag.pointerOffsetY) }}
            >
              {drag.label}
            </div>,
            document.body,
          )
      ) : null}
    </div>
  );
}
