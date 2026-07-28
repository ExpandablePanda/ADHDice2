"use client";

import { GripVertical } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { reorderListItems } from "@/lib/list-reorder";

type DragState = {
  active: boolean;
  id: string;
  label: string;
  pointerId: number;
  pointerOffsetY: number;
  pointerY: number;
  sourceIndex: number;
  targetIndex: number;
};

function getDropIndex(midpoints: readonly number[], pointerY: number, sourceIndex: number) {
  const remaining = midpoints.filter((_, index) => index !== sourceIndex);
  const insertionIndex = remaining.findIndex((midpoint) => pointerY < midpoint);
  return insertionIndex < 0 ? remaining.length : insertionIndex;
}

export function SortableList<T>({
  children,
  className = "mt-3 space-y-2",
  getId,
  getLabel,
  items,
  onReorder,
}: {
  children: (item: T, index: number, handle: ReactNode) => ReactNode;
  className?: string;
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  items: readonly T[];
  onReorder: (items: T[]) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const snapshotRef = useRef<readonly T[]>(items);
  const holdRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingYRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const updateDrag = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const cancelDrag = useCallback(() => {
    if (holdRef.current !== null) window.clearTimeout(holdRef.current);
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    holdRef.current = null;
    frameRef.current = null;
    pendingYRef.current = null;
    updateDrag(null);
  }, [updateDrag]);

  const finish = useCallback((pointerId: number, cancelled = false) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== pointerId) return;
    if (current.active && !cancelled && current.targetIndex !== current.sourceIndex) {
      onReorder(reorderListItems(snapshotRef.current, current.sourceIndex, current.targetIndex));
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

  const queuePointerMove = useCallback((pointerY: number) => {
    pendingYRef.current = pointerY;
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const current = dragRef.current;
      const y = pendingYRef.current;
      if (!current?.active || y === null) return;
      const rows = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-sortable-row]") ?? []);
      const midpoints = rows.map((row) => {
        const rect = row.getBoundingClientRect();
        return rect.top + rect.height / 2;
      });
      updateDrag({
        ...current,
        pointerY: y,
        targetIndex: getDropIndex(midpoints, y, current.sourceIndex),
      });
    });
  }, [updateDrag]);

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
          <div
            className={drag?.active && drag.id === id ? "rounded-[1.1rem] opacity-35 ring-2 ring-dashed ring-[#bbaeff]" : ""}
            data-sortable-row={id}
            key={id}
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
                  };
                  updateDrag(next);
                  const handle = event.currentTarget;
                  if (event.pointerType === "mouse") {
                    handle.setPointerCapture(event.pointerId);
                  } else {
                    holdRef.current = window.setTimeout(() => {
                      if (handle.isConnected) handle.setPointerCapture(event.pointerId);
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
                }}
                onPointerUp={(event) => finish(event.pointerId)}
                style={{ touchAction: drag?.id === id && drag.active ? "none" : "pan-y" }}
                type="button"
              >
                <GripVertical size={18} />
              </button>
            ))}
          </div>
        );
      })}
      {drag?.active ? (
        <div
          className="pointer-events-none fixed left-1/2 z-50 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[1rem] border border-[#cfc3ed] bg-white px-4 py-2 text-sm font-medium text-[#5f587d] shadow-xl dark:bg-[#201a35]"
          style={{ top: drag.pointerY - drag.pointerOffsetY }}
        >
          {drag.label}
        </div>
      ) : null}
    </div>
  );
}
