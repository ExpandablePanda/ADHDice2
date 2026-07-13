"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import type { OnTimePlanItem } from "@/lib/on-time-plan-state";
import { getOnTimeDropIndex, reorderOnTimeItems } from "@/lib/on-time-planner";

type DragState = { id: string; label: string; pointerId: number; sourceIndex: number; pointerOffsetY: number; pointerY: number; targetIndex: number; active: boolean };

export function OnTimePlannerSortableList({ children, items, onReorder }: {
  children: (item: OnTimePlanItem, index: number, handle: ReactNode) => ReactNode;
  items: OnTimePlanItem[];
  onReorder: (items: OnTimePlanItem[]) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const snapshotRef = useRef(items);
  const holdRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingYRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const updateDrag = useCallback((next: DragState | null) => { dragRef.current = next; setDrag(next); }, []);

  const cancelDrag = useCallback(() => {
    if (holdRef.current !== null) window.clearTimeout(holdRef.current);
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    holdRef.current = null; frameRef.current = null; pendingYRef.current = null;
    updateDrag(null);
  }, [updateDrag]);

  const finish = useCallback((pointerId: number, cancelled = false) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== pointerId) return;
    if (current.active && !cancelled && current.targetIndex !== current.sourceIndex) {
      onReorder(reorderOnTimeItems(snapshotRef.current, current.sourceIndex, current.targetIndex));
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    cancelDrag();
  }, [cancelDrag, onReorder]);

  useEffect(() => () => cancelDrag(), [cancelDrag]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") cancelDrag(); };
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
      const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-on-time-sort-row]"));
      const midpoints = rows.map((row) => { const rect = row.getBoundingClientRect(); return rect.top + rect.height / 2; });
      updateDrag({ ...current, pointerY: y, targetIndex: getOnTimeDropIndex(midpoints, y, current.sourceIndex) });
    });
  }, [updateDrag]);

  return <div className="mt-3 space-y-2" onClickCapture={(event) => { if (suppressClickRef.current) { event.preventDefault(); event.stopPropagation(); } }}>
    {items.map((item, index) => <div className={drag?.active && drag.id === item.id ? "rounded-[1.1rem] opacity-35 ring-2 ring-dashed ring-[#bbaeff]" : ""} data-on-time-sort-row={item.id} key={item.id}>
      {children(item, index, <button aria-label={`Drag ${item.kind === "task" ? item.titleSnapshot : item.title}`} className="touch-pan-y cursor-grab rounded-full p-2 text-[#948bac] select-none active:cursor-grabbing" onLostPointerCapture={(event) => finish(event.pointerId, true)} onPointerCancel={(event) => finish(event.pointerId, true)} onPointerDown={(event) => {
        if (event.button !== 0) return;
        const row = event.currentTarget.closest<HTMLElement>("[data-on-time-sort-row]");
        const rect = row?.getBoundingClientRect();
        snapshotRef.current = items;
        const next: DragState = { id: item.id, label: item.kind === "task" ? item.titleSnapshot : item.title, pointerId: event.pointerId, sourceIndex: index, pointerOffsetY: rect ? event.clientY - rect.top : 20, pointerY: event.clientY, targetIndex: index, active: event.pointerType === "mouse" };
        updateDrag(next);
        const handle = event.currentTarget;
        if (event.pointerType === "mouse") handle.setPointerCapture(event.pointerId);
        else holdRef.current = window.setTimeout(() => {
          if (handle.isConnected) handle.setPointerCapture(event.pointerId);
          const current = dragRef.current;
          if (current?.pointerId === event.pointerId) updateDrag({ ...current, active: true });
        }, 350);
      }} onPointerMove={(event) => {
        const current = dragRef.current;
        if (!current || current.pointerId !== event.pointerId) return;
        if (!current.active) {
          if (Math.abs(event.clientY - current.pointerY) > 8) cancelDrag();
          return;
        }
        event.preventDefault();
        queuePointerMove(event.clientY);
      }} onPointerUp={(event) => finish(event.pointerId)} style={{ touchAction: drag?.id === item.id && drag.active ? "none" : "pan-y" }} type="button"><GripVertical size={18} /></button>)}
    </div>)}
    {drag?.active ? <div className="pointer-events-none fixed left-1/2 z-50 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[1rem] border border-[#cfc3ed] bg-white px-4 py-2 text-sm font-medium text-[#5f587d] shadow-xl dark:bg-[#201a35]" style={{ top: drag.pointerY - drag.pointerOffsetY }}>{drag.label}</div> : null}
  </div>;
}
