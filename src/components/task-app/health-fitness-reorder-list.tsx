"use client";

import { GripVertical } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { moveFitnessOption } from "@/lib/health-workout-options";

type HealthFitnessReorderListProps<T> = {
  disabled?: boolean;
  getItemId: (item: T) => string;
  getItemLabel: (item: T) => string;
  label: string;
  onSave: (orderedItemIds: string[]) => Promise<boolean>;
  items: readonly T[];
  renderItem: (item: T, index: number) => ReactNode;
};

type HealthFitnessDragState<T> = {
  currentIndex: number;
  handle: HTMLButtonElement;
  pointerId: number;
  startingItems: T[];
};

type HealthFitnessRowGeometry = {
  midpoint: number;
};

function areItemOrdersEqual<T>(left: readonly T[], right: readonly T[], getItemId: (item: T) => string) {
  return left.length === right.length && left.every((item, index) => getItemId(item) === getItemId(right[index]!));
}

export function HealthFitnessReorderList<T>({
  disabled = false,
  getItemId,
  getItemLabel,
  label,
  onSave,
  items,
  renderItem,
}: HealthFitnessReorderListProps<T>) {
  const [previewItems, setPreviewItems] = useState<T[] | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const dragRef = useRef<HealthFitnessDragState<T> | null>(null);
  const itemsRef = useRef<T[]>([...items]);
  const previewRef = useRef<T[] | null>(null);
  const committedPreviewRef = useRef<T[] | null>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const rowGeometryRef = useRef<Array<HealthFitnessRowGeometry | null>>([]);
  const pendingPointerYRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const visibleItems = previewItems ?? items;

  useEffect(() => {
    itemsRef.current = [...items];
    const committedItems = committedPreviewRef.current;
    if (committedItems && !dragRef.current && areItemOrdersEqual(items, committedItems, getItemId)) {
      committedPreviewRef.current = null;
      previewRef.current = null;
      setPreviewItems(null);
    }
  }, [getItemId, items]);

  function clearCommittedPreview(committedItems: T[]) {
    if (committedPreviewRef.current !== committedItems) {
      return;
    }
    committedPreviewRef.current = null;
    if (previewRef.current === committedItems) {
      previewRef.current = null;
      setPreviewItems(null);
    }
  }

  async function persistCommittedPreview(committedItems: T[]) {
    let saved = false;
    try {
      saved = await onSave(committedItems.map(getItemId));
    } catch {
      saved = false;
    }
    if (!saved) {
      clearCommittedPreview(committedItems);
    }
  }

  function cancelScheduledPointerMove() {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    pendingPointerYRef.current = null;
  }

  function clearDragState(pointerId?: number) {
    const drag = dragRef.current;
    if (!drag || (pointerId !== undefined && drag.pointerId !== pointerId)) {
      return;
    }

    cancelScheduledPointerMove();
    dragRef.current = null;
    setDraggingIndex(null);
    const nextItems = previewRef.current;
    rowGeometryRef.current = [];
    if (drag.handle.hasPointerCapture(drag.pointerId)) {
      drag.handle.releasePointerCapture(drag.pointerId);
    }
    if (!nextItems || areItemOrdersEqual(nextItems, drag.startingItems, getItemId)) {
      const committedItems = committedPreviewRef.current;
      if (!committedItems) {
        previewRef.current = null;
        setPreviewItems(null);
      } else if (areItemOrdersEqual(itemsRef.current, committedItems, getItemId)) {
        clearCommittedPreview(committedItems);
      }
      return;
    }
    const committedItems = [...nextItems];
    committedPreviewRef.current = committedItems;
    previewRef.current = committedItems;
    void persistCommittedPreview(committedItems);
  }

  function getTargetIndex(clientY: number, currentIndex: number) {
    let targetIndex = currentIndex;
    for (let index = 0; index < rowGeometryRef.current.length; index += 1) {
      const geometry = rowGeometryRef.current[index];
      if (!geometry) {
        continue;
      }
      if (clientY < geometry.midpoint) {
        return index;
      }
      targetIndex = index;
    }
    return targetIndex;
  }

  function cacheRowGeometry(itemCount: number) {
    rowGeometryRef.current = rowRefs.current.slice(0, itemCount).map((row) => {
      if (!row) {
        return null;
      }
      const bounds = row.getBoundingClientRect();
      return { midpoint: bounds.top + bounds.height / 2 };
    });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>, index: number) {
    if (disabled || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const startingItems = [...(previewRef.current ?? itemsRef.current)];
    cacheRowGeometry(startingItems.length);
    dragRef.current = {
      currentIndex: index,
      handle: event.currentTarget,
      pointerId: event.pointerId,
      startingItems,
    };
    previewRef.current = startingItems;
    setPreviewItems(startingItems);
    setDraggingIndex(index);
  }

  function processPointerMove(clientY: number) {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    const currentItems = previewRef.current ?? itemsRef.current;
    const targetIndex = getTargetIndex(clientY, drag.currentIndex);
    if (targetIndex === drag.currentIndex) {
      return;
    }
    const nextItems = moveFitnessOption(currentItems, drag.currentIndex, targetIndex);
    drag.currentIndex = targetIndex;
    previewRef.current = nextItems;
    setPreviewItems(nextItems);
    setDraggingIndex(targetIndex);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    pendingPointerYRef.current = event.clientY;
    if (animationFrameRef.current !== null) {
      return;
    }
    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const pointerY = pendingPointerYRef.current;
      pendingPointerYRef.current = null;
      if (pointerY !== null) {
        processPointerMove(pointerY);
      }
    });
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "pointerup" && pendingPointerYRef.current !== null) {
      const pointerY = pendingPointerYRef.current;
      cancelScheduledPointerMove();
      processPointerMove(pointerY);
    }
    clearDragState(event.pointerId);
  }

  useEffect(() => () => {
    cancelScheduledPointerMove();
    dragRef.current = null;
    previewRef.current = null;
    committedPreviewRef.current = null;
    rowGeometryRef.current = [];
  }, []);

  return (
    <div className="grid gap-1.5" data-fitness-option-list={label} data-fitness-reorder-list={label}>
      {visibleItems.map((item, index) => {
        const itemId = getItemId(item);
        const itemLabel = getItemLabel(item);
        return (
          <div
            className={`flex min-w-0 items-center gap-1.5 rounded-[0.9rem] ${draggingIndex === index ? "bg-[#f7f3ff] dark:bg-white/[0.06]" : ""}`}
            key={itemId}
            ref={(element) => {
              rowRefs.current[index] = element;
            }}
          >
            <button
              aria-grabbed={draggingIndex === index}
              aria-label={`Reorder ${label} ${itemLabel}`}
              className="touch-none inline-flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-full text-[#8d87a7] hover:bg-[#f1ecff] hover:text-[#6f57f6] active:cursor-grabbing dark:text-white/45 dark:hover:bg-white/[0.08] dark:hover:text-[#cabfff]"
              disabled={disabled}
              draggable={false}
              onLostPointerCapture={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              onPointerDown={(event) => handlePointerDown(event, index)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              type="button"
            >
              <GripVertical aria-hidden="true" className="h-4 w-4" />
            </button>
            {renderItem(item, index)}
          </div>
        );
      })}
    </div>
  );
}
