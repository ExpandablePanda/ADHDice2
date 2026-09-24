"use client";

import { Clock3, GripVertical, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AdhdChip } from "@/components/ui-system/adhd-chip";

export const TEST_IOS_TASK_DETAIL_TILE_ORDER_STORAGE_KEY = "adhdice:test-ios-task-detail-tile-order";

export const TEST_IOS_TASK_DETAIL_CANONICAL_TILE_ORDER = [
  "priority",
  "repeat",
  "estimate",
  "streak",
  "last-done",
  "steps",
  "pursuit",
  "tags",
  "history",
] as const;

export type TestIosTaskDetailTileId = typeof TEST_IOS_TASK_DETAIL_CANONICAL_TILE_ORDER[number];

const TEST_IOS_TASK_DETAIL_TILE_ID_SET = new Set<string>(TEST_IOS_TASK_DETAIL_CANONICAL_TILE_ORDER);

type TestIosTaskDetailTile = {
  detail: string;
  id: TestIosTaskDetailTileId;
  label: string;
  value: string;
  valueClassName?: string;
};

const TEST_IOS_TASK_DETAIL_TILES: readonly TestIosTaskDetailTile[] = [
  { detail: "High attention", id: "priority", label: "Priority", value: "Urgent", valueClassName: "text-[#c86635] dark:text-[#ffbf9b]" },
  { detail: "Every week", id: "repeat", label: "Repeat", value: "Weekly" },
  { detail: "Planned effort", id: "estimate", label: "Estimate", value: "15 min" },
  { detail: "Current run", id: "streak", label: "Streak", value: "4 days" },
  { detail: "Most recent", id: "last-done", label: "Last Done", value: "Sep 17" },
  { detail: "Subtasks", id: "steps", label: "Steps", value: "3 / 5" },
  { detail: "Life Admin", id: "pursuit", label: "Pursuit", value: "Life Admin" },
  { detail: "Attached labels", id: "tags", label: "Tags", value: "3" },
  { detail: "Completed events", id: "history", label: "History", value: "12 entries" },
];

const TEST_IOS_TASK_DETAIL_TILE_BY_ID = new Map(TEST_IOS_TASK_DETAIL_TILES.map((tile) => [tile.id, tile]));
const LONG_PRESS_DELAY_MS = 350;
const PRE_ACTIVATION_MOVE_THRESHOLD_PX = 8;

type TestIosTaskDetailDragState = {
  activated: boolean;
  currentOrder: TestIosTaskDetailTileId[];
  didMove: boolean;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  startingOrder: TestIosTaskDetailTileId[];
  tileElement: HTMLButtonElement;
  tileId: TestIosTaskDetailTileId;
  timer: number | null;
};

function isTestIosTaskDetailTileId(value: unknown): value is TestIosTaskDetailTileId {
  return typeof value === "string" && TEST_IOS_TASK_DETAIL_TILE_ID_SET.has(value);
}

function areTileOrdersEqual(left: readonly TestIosTaskDetailTileId[], right: readonly TestIosTaskDetailTileId[]) {
  return left.length === right.length && left.every((tileId, index) => tileId === right[index]);
}

export function normalizeTestIosTaskDetailTileOrder(value: unknown): TestIosTaskDetailTileId[] {
  const persisted = Array.isArray(value) ? value : [];
  const seen = new Set<TestIosTaskDetailTileId>();
  const known = persisted.filter((tileId): tileId is TestIosTaskDetailTileId => {
    if (!isTestIosTaskDetailTileId(tileId) || seen.has(tileId)) return false;
    seen.add(tileId);
    return true;
  });
  return [
    ...known,
    ...TEST_IOS_TASK_DETAIL_CANONICAL_TILE_ORDER.filter((tileId) => !seen.has(tileId)),
  ];
}

export function reorderTestIosTaskDetailTiles(
  order: readonly TestIosTaskDetailTileId[],
  sourceId: TestIosTaskDetailTileId,
  targetId: TestIosTaskDetailTileId,
) {
  const next = normalizeTestIosTaskDetailTileOrder(order);
  const sourceIndex = next.indexOf(sourceId);
  const targetIndex = next.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return next;
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved!);
  return next;
}

export function reorderTestIosTaskDetailTilesByInsertionIndex(
  order: readonly TestIosTaskDetailTileId[],
  sourceId: TestIosTaskDetailTileId,
  insertionIndex: number,
) {
  const next = normalizeTestIosTaskDetailTileOrder(order);
  const sourceIndex = next.indexOf(sourceId);
  if (sourceIndex < 0) return next;
  const [moved] = next.splice(sourceIndex, 1);
  const boundedIndex = Math.max(0, Math.min(next.length, insertionIndex));
  next.splice(boundedIndex, 0, moved!);
  return next;
}

function readPersistedTestIosTaskDetailTileOrder(): TestIosTaskDetailTileId[] {
  if (typeof window === "undefined") return [...TEST_IOS_TASK_DETAIL_CANONICAL_TILE_ORDER];

  try {
    const raw = window.localStorage.getItem(TEST_IOS_TASK_DETAIL_TILE_ORDER_STORAGE_KEY);
    return normalizeTestIosTaskDetailTileOrder(raw ? JSON.parse(raw) : null);
  } catch {
    return [...TEST_IOS_TASK_DETAIL_CANONICAL_TILE_ORDER];
  }
}

function releasePointerCaptureSafely(drag: TestIosTaskDetailDragState) {
  try {
    if (drag.tileElement.isConnected && drag.tileElement.hasPointerCapture(drag.pointerId)) {
      drag.tileElement.releasePointerCapture(drag.pointerId);
    }
  } catch {
    // Pointer capture is an enhancement; cancellation still clears local drag state.
  }
}

export function TestIosTaskDetail() {
  const [tileOrder, setTileOrder] = useState<TestIosTaskDetailTileId[]>(readPersistedTestIosTaskDetailTileOrder);
  const [arrangeMode, setArrangeMode] = useState(false);
  const [draggingTileId, setDraggingTileId] = useState<TestIosTaskDetailTileId | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<TestIosTaskDetailDragState | null>(null);
  const tileOrderRef = useRef(tileOrder);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(TEST_IOS_TASK_DETAIL_TILE_ORDER_STORAGE_KEY, JSON.stringify(tileOrder));
    } catch {
      // This is a visual prototype; the concept remains usable if storage is unavailable.
    }
  }, [tileOrder]);

  const clearDragState = useCallback((restoreOrder: boolean) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.timer !== null) window.clearTimeout(drag.timer);
    dragRef.current = null;
    if (restoreOrder && drag.activated) {
      tileOrderRef.current = drag.startingOrder;
      setTileOrder([...drag.startingOrder]);
    }
    setDraggingTileId(null);
    releasePointerCaptureSafely(drag);
  }, []);

  const activateDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag || drag.activated) return;
    drag.activated = true;
    setArrangeMode(true);
    setDraggingTileId(drag.tileId);
    try {
      drag.tileElement.setPointerCapture(drag.pointerId);
    } catch {
      // The pointer may have ended while the long-press timer was resolving.
    }
  }, []);

  const resolveTargetInsertionIndex = useCallback((clientX: number, clientY: number, activeTileId: TestIosTaskDetailTileId) => {
    const grid = gridRef.current;
    if (!grid) return null;

    const tiles = Array.from(grid.querySelectorAll<HTMLElement>("[data-ios-task-detail-tile-id]"))
      .map((tileElement) => ({
        rect: tileElement.getBoundingClientRect(),
        tileId: tileElement.dataset.iosTaskDetailTileId,
      }))
      .filter((tile): tile is { rect: DOMRect; tileId: TestIosTaskDetailTileId } => isTestIosTaskDetailTileId(tile.tileId) && tile.tileId !== activeTileId);
    if (tiles.length === 0) return null;

    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    tiles.forEach(({ rect }, index) => {
      const distance = ((rect.left + rect.width / 2) - clientX) ** 2 + ((rect.top + rect.height / 2) - clientY) ** 2;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    const nearest = tiles[nearestIndex]!;
    const isAfterNearest = clientY > nearest.rect.top + nearest.rect.height / 2
      || (clientY >= nearest.rect.top && clientY <= nearest.rect.bottom && clientX > nearest.rect.left + nearest.rect.width / 2);
    return nearestIndex + (isAfterNearest ? 1 : 0);
  }, []);

  const processPointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (!drag.activated) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > PRE_ACTIVATION_MOVE_THRESHOLD_PX) {
        clearDragState(false);
      }
      return;
    }

    event.preventDefault();
    const insertionIndex = resolveTargetInsertionIndex(event.clientX, event.clientY, drag.tileId);
    if (insertionIndex === null) return;
    const nextOrder = reorderTestIosTaskDetailTilesByInsertionIndex(drag.currentOrder, drag.tileId, insertionIndex);
    if (areTileOrdersEqual(nextOrder, drag.currentOrder)) return;
    drag.currentOrder = nextOrder;
    drag.didMove = true;
    tileOrderRef.current = nextOrder;
    setTileOrder(nextOrder);
  }, [clearDragState, resolveTargetInsertionIndex]);

  const finishPointer = useCallback((event: PointerEvent, cancelled = false) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.activated) {
      clearDragState(false);
      return;
    }
    const didMove = drag.didMove;
    clearDragState(cancelled);
    if (didMove && !cancelled) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  }, [clearDragState]);

  const exitArrangeMode = useCallback(() => {
    clearDragState(false);
    setArrangeMode(false);
  }, [clearDragState]);

  const resetLayout = useCallback(() => {
    clearDragState(false);
    const nextOrder = [...TEST_IOS_TASK_DETAIL_CANONICAL_TILE_ORDER];
    tileOrderRef.current = nextOrder;
    setTileOrder(nextOrder);
  }, [clearDragState]);

  const handleEscape = useCallback((event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    if (dragRef.current) clearDragState(true);
    else if (arrangeMode) setArrangeMode(false);
  }, [arrangeMode, clearDragState]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => processPointerMove(event);
    const handlePointerUp = (event: PointerEvent) => finishPointer(event);
    const handlePointerCancel = (event: PointerEvent) => finishPointer(event, true);
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("keydown", handleEscape);
      clearDragState(true);
    };
  }, [clearDragState, finishPointer, handleEscape, processPointerMove]);

  function beginPointerDrag(event: ReactPointerEvent<HTMLButtonElement>, tileId: TestIosTaskDetailTileId) {
    if ((event.pointerType === "mouse" && event.button !== 0) || (event.pointerType === "mouse" && !arrangeMode)) return;
    clearDragState(false);
    const startingOrder = [...tileOrderRef.current];
    const drag: TestIosTaskDetailDragState = {
      activated: arrangeMode,
      currentOrder: startingOrder,
      didMove: false,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      startingOrder,
      tileElement: event.currentTarget,
      tileId,
      timer: null,
    };
    dragRef.current = drag;
    if (arrangeMode) {
      setDraggingTileId(tileId);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture may be unavailable in a constrained preview surface.
      }
    } else {
      drag.timer = window.setTimeout(activateDrag, LONG_PRESS_DELAY_MS);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[25rem] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="rounded-[2rem] bg-[#f5f2ff] p-2 dark:bg-[#171225]">
        <section className="rounded-[1.7rem] bg-[#ebe7ff] px-5 py-5 dark:bg-[#2a2146]" aria-labelledby="test-ios-task-detail-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#7669ac] dark:text-white/55">Today</p>
              <h2 className="mt-2 text-[clamp(1.75rem,8vw,2.35rem)] font-black tracking-[-0.05em] text-[#302752] dark:text-white" id="test-ios-task-detail-title">Call UGI</h2>
              <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-[#71668f] dark:text-white/65"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />Today · 2:00 PM</p>
            </div>
            <AdhdChip onClick={arrangeMode ? exitArrangeMode : () => setArrangeMode(true)} selected={arrangeMode} type="button">
              {arrangeMode ? "Done" : "Arrange"}
            </AdhdChip>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-[#796da1] dark:text-white/55">Task detail concept</p>
            <AdhdChip tone="progress" type="button">In Progress</AdhdChip>
          </div>
        </section>

        <section className="mt-2 rounded-[1.7rem] bg-white px-3.5 py-4 shadow-[0_16px_36px_rgba(92,70,172,0.08)] dark:bg-[#1d1830]" aria-label="Task metadata">
          <div className="flex items-start justify-between gap-3 px-1">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9b92be] dark:text-white/40">Details</p>
              <p className="mt-1 text-xs text-[#847b9c] dark:text-white/55">{arrangeMode ? "Hold and move tiles to shape your view." : "A compact view of the task context."}</p>
            </div>
            {arrangeMode ? (
              <AdhdChip icon={<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />} onClick={resetLayout} tone="purple" type="button">
                Reset Layout
              </AdhdChip>
            ) : null}
          </div>

          <div
            aria-label={arrangeMode ? "Arrange task metadata" : "Task metadata tiles"}
            className={`mt-4 grid grid-cols-3 gap-2 ${arrangeMode ? "rounded-[1.25rem] bg-[#f7f3ff] p-1.5 dark:bg-white/[0.04]" : ""}`}
            data-ios-task-detail-arrange-mode={arrangeMode ? "true" : "false"}
            onClickCapture={(event) => {
              if (suppressClickRef.current) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            ref={gridRef}
            role="list"
          >
            {tileOrder.map((tileId) => {
              const tile = TEST_IOS_TASK_DETAIL_TILE_BY_ID.get(tileId);
              if (!tile) return null;
              const isDragging = draggingTileId === tile.id;
              return (
                <button
                  aria-grabbed={isDragging}
                  aria-label={`${tile.label}: ${tile.value}${arrangeMode ? ". Hold and move to reorder." : ""}`}
                  className={`group relative flex min-h-[5.8rem] min-w-0 flex-col justify-between rounded-[1.05rem] bg-[#f8f7fb] p-2.5 text-left transition duration-150 dark:bg-[#27223a] ${arrangeMode ? "ring-1 ring-dashed ring-[#d8cff7] dark:ring-white/15" : ""} ${isDragging ? "-translate-y-0.5 scale-[1.02] shadow-[0_12px_24px_rgba(99,74,188,0.18)] ring-2 ring-[#a894f5] dark:ring-[#9c8be7]" : ""}`}
                  data-ios-task-detail-tile-id={tile.id}
                  key={tile.id}
                  onLostPointerCapture={() => {
                    if (dragRef.current?.tileId === tile.id) clearDragState(true);
                  }}
                  onPointerCancel={(event) => finishPointer(event.nativeEvent, true)}
                  onPointerDown={(event) => beginPointerDrag(event, tile.id)}
                  style={{ touchAction: isDragging ? "none" : "pan-y" }}
                  type="button"
                >
                  <span className="flex min-w-0 items-start justify-between gap-1.5">
                    <span className="truncate text-[9px] font-semibold uppercase tracking-[0.11em] text-[#9188a9] dark:text-white/45">{tile.label}</span>
                    {arrangeMode ? <GripVertical aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[#a49abf] dark:text-white/40" /> : null}
                  </span>
                  <span className={`mt-2 block break-words text-sm font-bold leading-tight text-[#3f385c] dark:text-white/90 ${tile.valueClassName ?? ""}`}>{tile.value}</span>
                  <span className="mt-1 block text-[10px] leading-tight text-[#938aa8] dark:text-white/45">{tile.detail}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
