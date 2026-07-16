"use client";

import { BookOpen, Check, ChevronDown, Eye, EyeOff, Search, Trash2, X } from "lucide-react";
import { memo, startTransition, useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import type { MouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { AgentPlanColumnId } from "@/components/ui/agent-plan";
import {
  TASK_TABLE_CHIP_BASE_CLASS,
  TASK_TABLE_ACTIVE_LIST_CHIP_CLASS,
  TASK_TABLE_LIST_CHIP_CLASS,
} from "@/components/ui/task-table-primitives";
import { AdhdChip, AdhdDropdownPanel } from "@/components/ui-system";

import type { Task } from "@/lib/database.types";
import type { TaskRailListOption } from "@/lib/task-app-derived";
import type { TaskViewMode } from "@/lib/task-ui-state";

const SHARED_CHIP_MUTED_CLASS = TASK_TABLE_LIST_CHIP_CLASS;
const SHARED_CHIP_ACTIVE_CLASS = TASK_TABLE_ACTIVE_LIST_CHIP_CLASS;
const SHARED_CHIP_PRIMARY_CLASS = "border-[#6f57f6] bg-[#6f57f6] text-white dark:border-[#c9bbff] dark:bg-[#c9bbff] dark:text-[#1a1431]";
const SHARED_CHIP_SOFT_PURPLE_CLASS = "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]";
const TASK_SEARCH_COMMIT_DELAY_MS = 180;
const MENU_SECTION_TITLE_CLASS = "text-[11px] font-semibold uppercase tracking-[0.18em] text-[#938ab8] dark:text-white/42";
const MENU_SECTION_DETAIL_CLASS = "mt-1 text-[13px] leading-5 text-[#7d7597] dark:text-white/55";
const MENU_ROW_ACTION_CLASS = "min-w-0 text-[13px] font-medium leading-5 text-[#4b4469] dark:text-white/82";
const MENU_ROW_DETAIL_CLASS = "max-w-[11rem] text-right text-[12px] leading-5 text-[#7d7597] dark:text-white/55";

const TaskSearchBox = memo(function TaskSearchBox({
  hidden,
  onSearchChange,
  onSearchSubmit,
  search,
}: {
  hidden?: boolean;
  onSearchChange: (search: string) => void;
  onSearchSubmit?: (search: string) => void;
  search: string;
}) {
  const searchCommitTimeoutRef = useRef<number | null>(null);
  const isFocusedRef = useRef(false);
  const lastCommittedSearchRef = useRef(search);
  const [searchDraft, setSearchDraft] = useState(search);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isFocusedRef.current) {
      return;
    }
    if (search === searchDraft) {
      lastCommittedSearchRef.current = search;
      return;
    }
    if (searchCommitTimeoutRef.current !== null) {
      window.clearTimeout(searchCommitTimeoutRef.current);
      searchCommitTimeoutRef.current = null;
    }
    lastCommittedSearchRef.current = search;
    setSearchDraft(search);
  }, [search, searchDraft]);

  useEffect(() => {
    return () => {
      if (searchCommitTimeoutRef.current !== null) {
        window.clearTimeout(searchCommitTimeoutRef.current);
      }
    };
  }, []);

  const handleSearchDraftChange = (nextValue: string) => {
    setSearchDraft(nextValue);
    if (searchCommitTimeoutRef.current !== null) {
      window.clearTimeout(searchCommitTimeoutRef.current);
    }
    searchCommitTimeoutRef.current = window.setTimeout(() => {
      lastCommittedSearchRef.current = nextValue;
      onSearchChange(nextValue);
      searchCommitTimeoutRef.current = null;
    }, TASK_SEARCH_COMMIT_DELAY_MS);
  };

  const handleClearSearch = () => {
    if (searchCommitTimeoutRef.current !== null) {
      window.clearTimeout(searchCommitTimeoutRef.current);
      searchCommitTimeoutRef.current = null;
    }
    lastCommittedSearchRef.current = "";
    setSearchDraft("");
    onSearchChange("");
    searchInputRef.current?.focus();
  };

  if (hidden) {
    return null;
  }

  return (
    <label className="flex h-10 min-w-0 w-full items-center gap-2.5 rounded-[0.9rem] border border-[#efe9ff] bg-[#fbfaff] px-3.5 py-1 md:w-[24rem] md:max-w-[24rem] md:flex-none xl:w-[26rem] xl:max-w-[26rem] 2xl:w-[28rem] 2xl:max-w-[28rem] dark:border-white/10 dark:bg-white/[0.04]">
      <Search className="h-3.5 w-3.5 shrink-0 text-[#6f57f6] dark:text-[#c9bbff]" />
      <input
        className="min-w-0 flex-1 bg-transparent text-[13px] text-[#27304c] outline-none placeholder:text-[#97a0b9] dark:text-white dark:placeholder:text-white/35"
        id="task-search-input"
        onChange={(event) => {
          handleSearchDraftChange(event.target.value);
        }}
        onBlur={() => {
          isFocusedRef.current = false;
        }}
        onFocus={() => {
          isFocusedRef.current = true;
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !onSearchSubmit) {
            return;
          }
          event.preventDefault();
          if (searchCommitTimeoutRef.current !== null) {
            window.clearTimeout(searchCommitTimeoutRef.current);
            searchCommitTimeoutRef.current = null;
          }
          lastCommittedSearchRef.current = searchDraft;
          onSearchSubmit(searchDraft);
        }}
        placeholder="Search tasks, or type duplicate:title"
        ref={searchInputRef}
        value={searchDraft}
      />
      {searchDraft.trim().length > 0 ? (
        <button
          aria-label="Clear search"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#8d86ab] transition hover:bg-[#efe9ff] hover:text-[#6f57f6] dark:text-white/45 dark:hover:bg-white/10 dark:hover:text-[#cabfff]"
          onClick={handleClearSearch}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </label>
  );
});

const FIXED_RAIL_LIST_IDS = new Set(["pinned", "routine"]);
const DESKTOP_DRAG_THRESHOLD_PX = 5;
const MOBILE_DRAG_HOLD_MS = 350;
const MOBILE_DRAG_CANCEL_DISTANCE_PX = 8;

function isRailListReorderable(list: TaskRailListOption) {
  return !FIXED_RAIL_LIST_IDS.has(list.id);
}

function reorderRailListToIndex(lists: TaskRailListOption[], sourceListId: string, insertionIndex: number) {
  const reorderableLists = lists.filter(isRailListReorderable);
  const sourceIndex = reorderableLists.findIndex((list) => list.id === sourceListId);
  if (sourceIndex < 0) {
    return null;
  }

  const nextReorderableLists = [...reorderableLists];
  const [movedList] = nextReorderableLists.splice(sourceIndex, 1);
  if (!movedList) {
    return null;
  }
  const adjustedInsertionIndex = sourceIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;
  const targetIndex = Math.max(0, Math.min(nextReorderableLists.length, adjustedInsertionIndex));
  if (targetIndex === sourceIndex) {
    return null;
  }
  nextReorderableLists.splice(targetIndex, 0, movedList);
  const reorderedById = new Map(nextReorderableLists.map((list) => [list.id, list]));
  let reorderableIndex = 0;
  return lists.map((list) => (
    isRailListReorderable(list)
      ? reorderedById.get(nextReorderableLists[reorderableIndex++]?.id ?? "") ?? list
      : list
  ));
}

function ReorderableTaskChipRail({
  lists,
  onReorderLists,
  onSelectBucket,
  selectedBucket,
}: {
  lists: TaskRailListOption[];
  onReorderLists?: (orderedListIds: string[]) => Promise<boolean>;
  onSelectBucket: (bucket: string) => void;
  selectedBucket: string;
}) {
  const [renderedLists, setRenderedLists] = useState(lists);
  const renderedListsRef = useRef(lists);
  const [draggedListId, setDraggedListId] = useState<string | null>(null);
  const [mobileInsertionMarker, setMobileInsertionMarker] = useState<{
    height: number;
    left: number;
    top: number;
  } | null>(null);
  const [mobileDragPreview, setMobileDragPreview] = useState<{
    clientX: number;
    clientY: number;
    count: number | undefined;
    height: number;
    label: string;
    offsetX: number;
    offsetY: number;
    selected: boolean;
    width: number;
  } | null>(null);
  const dragRef = useRef<{
    mode: "pending" | "reordering";
    currentX: number;
    currentY: number;
    holdTimer: number | null;
    initialOrderIds: string[];
    initialLists: TaskRailListOption[];
    pendingInsertionIndex: number | null;
    pointerId: number;
    pointerType: string;
    previewHeight: number;
    previewOffsetX: number;
    previewOffsetY: number;
    previewWidth: number;
    sourceListId: string;
    startX: number;
    startY: number;
    target: HTMLButtonElement;
    touchIdentifier: number | null;
    removeActivationListeners: (() => void) | null;
  } | null>(null);
  const pendingTouchIdentifierRef = useRef<number | null>(null);
  const pendingPersistedOrderRef = useRef<string[] | null>(null);
  const suppressClickRef = useRef(false);
  const latestListsRef = useRef(lists);
  latestListsRef.current = lists;

  useEffect(() => {
    if (dragRef.current?.mode !== "reordering") {
      const pendingOrder = pendingPersistedOrderRef.current;
      const incomingOrder = lists.filter(isRailListReorderable).map((list) => list.id);
      if (pendingOrder && pendingOrder.some((listId, index) => listId !== incomingOrder[index])) {
        return;
      }
      pendingPersistedOrderRef.current = null;
      renderedListsRef.current = lists;
      setRenderedLists(lists);
    }
  }, [lists]);

  const clearDrag = (persist: boolean, pointerId?: number) => {
    const drag = dragRef.current;
    if (!drag || (pointerId !== undefined && drag.pointerId !== pointerId)) return;
    dragRef.current = null;
    if (drag.holdTimer !== null) window.clearTimeout(drag.holdTimer);
    drag.removeActivationListeners?.();
    if (drag.target.hasPointerCapture(drag.pointerId)) {
      drag.target.releasePointerCapture(drag.pointerId);
    }
    setDraggedListId(null);
    setMobileDragPreview(null);
    setMobileInsertionMarker(null);

    if (persist && drag.mode === "reordering") {
      const finalLists = drag.pendingInsertionIndex === null
        ? drag.initialLists
        : reorderRailListToIndex(drag.initialLists, drag.sourceListId, drag.pendingInsertionIndex) ?? drag.initialLists;
      const finalOrderIds = finalLists.filter(isRailListReorderable).map((list) => list.id);
      const didReorder = finalOrderIds.some((listId, index) => listId !== drag.initialOrderIds[index]);
      renderedListsRef.current = finalLists;
      setRenderedLists(finalLists);
      if (didReorder && onReorderLists) {
        pendingPersistedOrderRef.current = finalOrderIds;
        void onReorderLists(finalOrderIds).then((saved) => {
          if (pendingPersistedOrderRef.current !== finalOrderIds) return;
          if (!saved) {
            pendingPersistedOrderRef.current = null;
            renderedListsRef.current = latestListsRef.current;
            setRenderedLists(latestListsRef.current);
          }
        });
      }
      return;
    }

    renderedListsRef.current = drag.initialLists;
    setRenderedLists(drag.initialLists);
  };

  const updateRailInsertion = (drag: NonNullable<typeof dragRef.current>, clientX: number) => {
    const rail = drag.target.closest<HTMLElement>("[data-list-reorder-rail]");
    if (!rail) return;
    const railRect = rail.getBoundingClientRect();
    const targetElements = Array.from(rail.querySelectorAll<HTMLElement>("[data-reorderable-list-id]"))
      .filter((element) => element.dataset.reorderableListId !== drag.sourceListId);
    if (targetElements.length === 0) return;

    let pendingInsertionIndex = drag.initialOrderIds.length;
    let markerClientX = targetElements[targetElements.length - 1]!.getBoundingClientRect().right;
    for (const target of targetElements) {
      const targetId = target.dataset.reorderableListId;
      if (!targetId) continue;
      const targetIndex = drag.initialOrderIds.indexOf(targetId);
      const targetRect = target.getBoundingClientRect();
      if (clientX < targetRect.left + targetRect.width / 2) {
        pendingInsertionIndex = targetIndex;
        markerClientX = targetRect.left;
        break;
      }
    }

    drag.pendingInsertionIndex = pendingInsertionIndex;
    setMobileInsertionMarker({
      height: railRect.height,
      left: markerClientX - railRect.left + rail.scrollLeft,
      top: 0,
    });
  };

  const handleActivatedPointerMove = (event: Pick<PointerEvent, "clientX" | "clientY" | "pointerId" | "preventDefault">) => {
    const drag = dragRef.current;
    if (!drag || drag.mode !== "reordering" || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    drag.currentX = event.clientX;
    drag.currentY = event.clientY;
    setMobileDragPreview((current) => current ? {
      ...current,
      clientX: event.clientX,
      clientY: event.clientY,
    } : current);

    updateRailInsertion(drag, event.clientX);
  };

  const activateDrag = (pointerId: number, sourceListId: string) => {
    const drag = dragRef.current;
    if (!drag || drag.mode !== "pending" || drag.pointerId !== pointerId || drag.sourceListId !== sourceListId) return;
    drag.mode = "reordering";
    drag.holdTimer = null;
    suppressClickRef.current = true;
    setDraggedListId(sourceListId);
    const sourceList = renderedListsRef.current.find((list) => list.id === sourceListId);
    if (sourceList) {
      setMobileDragPreview({
        clientX: drag.currentX,
        clientY: drag.currentY,
        count: sourceList.count,
        height: drag.previewHeight,
        label: sourceList.label,
        offsetX: drag.previewOffsetX,
        offsetY: drag.previewOffsetY,
        selected: sourceList.id === selectedBucket,
        width: drag.previewWidth,
      });
    }
    updateRailInsertion(drag, drag.currentX);
    if (drag.pointerType === "touch" || drag.pointerType === "pen") {
      drag.target.setPointerCapture(drag.pointerId);
      const removePreActivationListeners = drag.removeActivationListeners;
      const handleMove = (event: PointerEvent) => handleActivatedPointerMove(event);
      const handleUp = (event: PointerEvent) => {
        if (event.pointerId !== drag.pointerId) return;
        const droppedInsideRail = Boolean(document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-list-reorder-rail]"));
        clearDrag(droppedInsideRail, event.pointerId);
      };
      const handleCancel = (event: PointerEvent) => clearDrag(false, event.pointerId);
      window.addEventListener("pointermove", handleMove, { passive: false });
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleCancel);
      drag.removeActivationListeners = () => {
        removePreActivationListeners?.();
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", handleCancel);
      };
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.currentX = event.clientX;
    drag.currentY = event.clientY;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (drag.mode === "pending") {
      if (drag.pointerType === "touch" || drag.pointerType === "pen") {
        if (distance > MOBILE_DRAG_CANCEL_DISTANCE_PX) {
          clearDrag(false, event.pointerId);
        }
        return;
      }
      if (distance < DESKTOP_DRAG_THRESHOLD_PX) return;
      activateDrag(event.pointerId, drag.sourceListId);
    }
    if (drag.pointerType === "touch" || drag.pointerType === "pen") return;
    handleActivatedPointerMove(event.nativeEvent);
  };

  useEffect(() => () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && drag.holdTimer !== null) window.clearTimeout(drag.holdTimer);
    drag?.removeActivationListeners?.();
    if (drag?.target.hasPointerCapture(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId);
  }, []);

  return (
    <>
    <div className="adhdice-scrollbar relative flex gap-2 overflow-x-auto pb-0.5" data-list-reorder-rail="true">
      {renderedLists.map((list) => {
        const reorderable = isRailListReorderable(list) && Boolean(onReorderLists);
        return (
        <AdhdChip
          aria-description={reorderable ? "Press and drag horizontally to reorder this list." : undefined}
          aria-pressed={list.id === selectedBucket}
          className={`${reorderable ? "adhdice-native-interaction-suppressed cursor-grab active:cursor-grabbing" : ""} ${draggedListId === list.id ? mobileDragPreview ? "relative z-10 opacity-[0.55] ring-2 ring-[#c9bcff] dark:ring-[#6e5ab2]" : "relative z-10 scale-[1.04] shadow-lg ring-2 ring-[#c9bcff] dark:ring-[#6e5ab2]" : ""}`}
          count={list.count}
          data-reorderable-list-id={reorderable ? list.id : undefined}
          draggable={false}
          key={list.id}
          onClick={(event) => {
            if (suppressClickRef.current) {
              event.preventDefault();
              suppressClickRef.current = false;
              return;
            }
            startTransition(() => {
              onSelectBucket(list.id);
            });
          }}
          onContextMenu={reorderable ? (event) => event.preventDefault() : undefined}
          onDragStart={reorderable ? (event) => event.preventDefault() : undefined}
          onLostPointerCapture={(event) => clearDrag(false, event.pointerId)}
          onPointerCancel={(event) => clearDrag(false, event.pointerId)}
          onPointerDown={(event) => {
            if (!reorderable || event.button !== 0) return;
            clearDrag(false);
            suppressClickRef.current = false;
            const sourceRect = event.currentTarget.getBoundingClientRect();
            const drag = {
              mode: "pending" as const,
              currentX: event.clientX,
              currentY: event.clientY,
              holdTimer: null as number | null,
              initialOrderIds: renderedListsRef.current.filter(isRailListReorderable).map((currentList) => currentList.id),
              initialLists: renderedListsRef.current,
              pendingInsertionIndex: null,
              pointerId: event.pointerId,
              pointerType: event.pointerType,
              previewHeight: sourceRect.height,
              previewOffsetX: event.clientX - sourceRect.left,
              previewOffsetY: event.clientY - sourceRect.top,
              previewWidth: sourceRect.width,
              sourceListId: list.id,
              startX: event.clientX,
              startY: event.clientY,
              target: event.currentTarget,
              touchIdentifier: event.pointerType === "touch" ? pendingTouchIdentifierRef.current : null,
              removeActivationListeners: null,
            };
            pendingTouchIdentifierRef.current = null;
            dragRef.current = drag;
            if (event.pointerType === "touch" || event.pointerType === "pen") {
              if (event.pointerType === "touch") {
                const handleTouchMove = (touchEvent: TouchEvent) => {
                  const activeDrag = dragRef.current;
                  if (!activeDrag || activeDrag !== drag || activeDrag.mode !== "reordering") return;
                  if (drag.touchIdentifier === null) {
                    const activeTouch = Array.from(touchEvent.touches).sort((left, right) => (
                      Math.hypot(left.clientX - drag.currentX, left.clientY - drag.currentY)
                      - Math.hypot(right.clientX - drag.currentX, right.clientY - drag.currentY)
                    ))[0];
                    drag.touchIdentifier = activeTouch?.identifier ?? null;
                  }
                  if (drag.touchIdentifier === null || !Array.from(touchEvent.touches).some((touch) => touch.identifier === drag.touchIdentifier)) return;
                  touchEvent.preventDefault();
                };
                window.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
                drag.removeActivationListeners = () => window.removeEventListener("touchmove", handleTouchMove, true);
              }
              drag.holdTimer = window.setTimeout(() => activateDrag(event.pointerId, list.id), MOBILE_DRAG_HOLD_MS);
            } else {
              event.currentTarget.setPointerCapture(event.pointerId);
            }
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => {
            if (event.pointerType === "touch" || event.pointerType === "pen") {
              if (dragRef.current?.mode === "pending") clearDrag(false, event.pointerId);
              return;
            }
            const droppedInsideRail = Boolean(document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-list-reorder-rail]"));
            clearDrag(droppedInsideRail, event.pointerId);
          }}
          onTouchStart={reorderable ? (event) => {
            const touchIdentifier = event.changedTouches[0]?.identifier ?? null;
            pendingTouchIdentifierRef.current = touchIdentifier;
            const activeDrag = dragRef.current;
            if (activeDrag?.pointerType === "touch" && activeDrag.target === event.currentTarget) {
              activeDrag.touchIdentifier = touchIdentifier;
            }
          } : undefined}
          onTouchEnd={reorderable ? () => {
            pendingTouchIdentifierRef.current = null;
          } : undefined}
          style={reorderable ? { touchAction: "pan-x pan-y", WebkitTouchCallout: "none", WebkitUserSelect: "none" } : undefined}
          selected={list.id === selectedBucket}
          toneClassName={list.id === selectedBucket ? SHARED_CHIP_ACTIVE_CLASS : SHARED_CHIP_MUTED_CLASS}
        >
          {list.label}
        </AdhdChip>
        );
      })}
      {mobileInsertionMarker ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute z-20 w-1 -translate-x-1/2 rounded-full bg-[#6f57f6] shadow-[0_0_0_2px_rgba(201,188,255,0.45)] dark:bg-[#cabfff]"
          style={{ height: mobileInsertionMarker.height, left: mobileInsertionMarker.left, top: mobileInsertionMarker.top }}
        />
      ) : null}
    </div>
    {mobileDragPreview ? (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[100]"
        style={{
          height: mobileDragPreview.height,
          transform: `translate3d(${mobileDragPreview.clientX - mobileDragPreview.offsetX}px, ${mobileDragPreview.clientY - mobileDragPreview.offsetY}px, 0)`,
          width: mobileDragPreview.width,
        }}
      >
        <div className={`${TASK_TABLE_CHIP_BASE_CLASS} h-full w-full shadow-xl ring-2 ring-[#c9bcff] ${mobileDragPreview.selected ? SHARED_CHIP_ACTIVE_CLASS : SHARED_CHIP_MUTED_CLASS}`}>
          <span className="inline-flex items-center">
            {mobileDragPreview.label}
            {mobileDragPreview.count === undefined ? null : <span className="ml-1 opacity-70">{mobileDragPreview.count}</span>}
          </span>
        </div>
      </div>
    ) : null}
    </>
  );
}

function TaskChipButton({
  active,
  children,
  onClick,
  tone = "muted",
}: {
  active?: boolean;
  children: ReactNode;
  onClick: () => void;
  tone?: "muted" | "primary" | "purple";
}) {
  const toneClassName = active
    ? SHARED_CHIP_ACTIVE_CLASS
    : tone === "primary"
      ? SHARED_CHIP_PRIMARY_CLASS
      : tone === "purple"
        ? SHARED_CHIP_SOFT_PURPLE_CLASS
        : SHARED_CHIP_MUTED_CLASS;

  return (
    <AdhdChip aria-pressed={active} onClick={onClick} selected={active} toneClassName={toneClassName}>
      {children}
    </AdhdChip>
  );
}

function DropdownSectionHeader({
  detail,
  title,
}: {
  detail: string;
  title: string;
}) {
  return (
    <div className="border-b border-[#f0ebfb] px-3 pb-2 dark:border-white/10">
      <p className={MENU_SECTION_TITLE_CLASS}>{title}</p>
      <p className={MENU_SECTION_DETAIL_CLASS}>{detail}</p>
    </div>
  );
}

function DropdownChipRow({
  label,
  onClick,
  selected = false,
}: {
  label: string;
  onClick: () => void;
  selected?: boolean;
}) {
  return (
    <AdhdChip
      className="text-left"
      contentClassName="items-center gap-[3px]"
      count={selected ? <Check className="h-3.5 w-3.5" /> : undefined}
      countClassName="ml-[3px] inline-flex items-center justify-center opacity-100"
      onClick={onClick}
      selected={selected}
      toneClassName={selected ? SHARED_CHIP_ACTIVE_CLASS : SHARED_CHIP_MUTED_CLASS}
    >
      {label}
    </AdhdChip>
  );
}

function TaskViewsMenu({
  onViewChange,
  view,
}: {
  onViewChange: (view: TaskViewMode) => void;
  view: TaskViewMode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const viewOptions: Array<{ label: string; value: TaskViewMode }> = [
    { label: "Table View", value: "table" },
    { label: "List View", value: "list" },
    { label: "Cards", value: "cards" },
    { label: "Matrix", value: "matrix" },
    { label: "Grid", value: "grid" },
  ];

  return (
    <div className="relative">
      <AdhdChip
        aria-expanded={isOpen}
        className="gap-2"
        onClick={() => setIsOpen((current) => !current)}
        toneClassName={SHARED_CHIP_MUTED_CLASS}
      >
        Views
        <ChevronDown className={`h-4 w-4 transition ${isOpen ? "rotate-180" : ""}`} />
      </AdhdChip>
      {isOpen ? (
        <AdhdDropdownPanel className="px-[2px] py-2" widthClassName="min-w-0">
          <div className="flex flex-col items-start gap-1">
            {viewOptions.map((option) => (
              <DropdownChipRow
                key={option.value}
                onClick={() => {
                  onViewChange(option.value);
                  setIsOpen(false);
                }}
                label={option.label}
                selected={view === option.value}
              />
            ))}
          </div>
        </AdhdDropdownPanel>
      ) : null}
    </div>
  );
}

export function TaskOperationsHeader({
  actionLabel,
  activeCount,
  archiveCount,
  filterRowsNode,
  hideSearch,
  isKeyboardShortcutsMenuOpen,
  isRailHidden,
  isListColumnMenuOpen,
  keyboardShortcutsMenuRef,
  listColumnLabels,
  listColumnMenuRef,
  listColumnPickerColumns,
  listVisibleColumns,
  lists,
  metric,
  onCycleMomentum,
  onOpenArchive,
  onOpenComposer,
  onOpenFocusPlanner,
  onOpenImport,
  onOpenListSettings,
  onOpenCompletedMilestones,
  onOpenMomentumDetails,
  onOpenTrash,
  onReorderLists,
  onSelectBucket,
  onToggleRail,
  onExpandAllColumns,
  onShrinkAllColumns,
  onSearchChange,
  onSearchSubmit,
  onViewChange,
  onToggleKeyboardShortcutsMenu,
  onToggleListColumn,
  onToggleListColumnMenu,
  search,
  selectedBucket,
  shortcuts,
  trashCount,
  todayCount,
  view,
}: {
  actionLabel: string;
  activeCount: number;
  archiveCount: number;
  filterRowsNode: ReactNode;
  hideSearch?: boolean;
  isKeyboardShortcutsMenuOpen: boolean;
  isRailHidden: boolean;
  isListColumnMenuOpen: boolean;
  keyboardShortcutsMenuRef: RefObject<HTMLDivElement | null>;
  listColumnLabels: Record<AgentPlanColumnId, string>;
  listColumnMenuRef: RefObject<HTMLDivElement | null>;
  listColumnPickerColumns: AgentPlanColumnId[];
  listVisibleColumns: AgentPlanColumnId[];
  lists: TaskRailListOption[];
  metric: {
    doneTasks: Task[];
    label: string;
    percent: number;
    remainingTasks: Task[];
    summary: string;
    totalCount: number;
  };
  onCycleMomentum: () => void;
  onOpenArchive: () => void;
  onOpenComposer: () => void;
  onOpenFocusPlanner: () => void;
  onOpenImport: () => void;
  onOpenListSettings: () => void;
  onOpenCompletedMilestones?: () => void;
  onOpenMomentumDetails: () => void;
  onOpenTrash: () => void;
  onReorderLists?: (orderedListIds: string[]) => Promise<boolean>;
  onSelectBucket: (bucket: string) => void;
  onToggleRail: () => void;
  onExpandAllColumns: () => void;
  onShrinkAllColumns: () => void;
  onSearchChange: (search: string) => void;
  onSearchSubmit?: (search: string) => void;
  onViewChange: (view: TaskViewMode) => void;
  onToggleKeyboardShortcutsMenu: () => void;
  onToggleListColumn: (columnId: AgentPlanColumnId) => void;
  onToggleListColumnMenu: () => void;
  search: string;
  selectedBucket: string;
  shortcuts: Array<{ action: string; alternateKeys?: string[]; keys: string[] }>;
  trashCount: number;
  todayCount: number;
  view: TaskViewMode;
}) {
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleMomentumPressStart = () => {
    clearLongPress();
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      onOpenMomentumDetails();
    }, 450);
  };

  const handleMomentumPressEnd = () => {
    const triggered = longPressTriggeredRef.current;
    clearLongPress();
    if (!triggered) {
      onCycleMomentum();
    }
    longPressTriggeredRef.current = false;
  };

  const handleFocusChipClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenFocusPlanner();
  };

  return (
    <section className="pt-[5px]">
      <div className="flex flex-col gap-4">
        <div className="mt-1 flex justify-center">
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8e88a9] dark:text-white/40">
            Tasks
          </p>
        </div>
        <div className="flex justify-center">
          <div className="flex w-full max-w-[56rem] flex-wrap items-center gap-3">
            <TaskSearchBox
              hidden={hideSearch}
              onSearchChange={onSearchChange}
              onSearchSubmit={onSearchSubmit}
              search={search}
            />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
              <AdhdChip onClick={handleFocusChipClick} toneClassName={SHARED_CHIP_SOFT_PURPLE_CLASS}>
                {actionLabel}
              </AdhdChip>
              <span className="inline-flex items-center rounded-full bg-[#fff1f3] px-3 py-1.5 text-xs font-semibold leading-none text-[#f05566] dark:bg-[#44232f] dark:text-[#ff9eaf]">
                {metric.label}
              </span>
              <button
                className="block h-3.5 min-w-[10rem] max-w-[22rem] flex-1 overflow-hidden rounded-full bg-[#e7e3f8] dark:bg-white/10"
                onPointerCancel={clearLongPress}
                onPointerDown={handleMomentumPressStart}
                onPointerLeave={clearLongPress}
                onPointerUp={handleMomentumPressEnd}
                type="button"
              >
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#c5b4ff_0%,#7f6af7_100%)] dark:bg-[linear-gradient(90deg,#cabfff_0%,#8e79ff_100%)]"
                  style={{ width: `${Math.max(metric.percent, 8)}%` }}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
              <TaskChipButton onClick={onOpenImport}>
                Import
              </TaskChipButton>
              <TaskChipButton onClick={onOpenComposer} tone="primary">
                New Task
              </TaskChipButton>
              {selectedBucket === "milestones" && onOpenCompletedMilestones ? <TaskChipButton onClick={onOpenCompletedMilestones}>Completed Milestones</TaskChipButton> : null}
              <TaskChipButton active={selectedBucket === "archive"} onClick={() => startTransition(onOpenArchive)}>
                <span className="inline-flex items-center gap-2">
                  <BookOpen className="h-3.5 w-3.5" />
                  Archive
                  <span className="opacity-70">{archiveCount}</span>
                </span>
              </TaskChipButton>
              <TaskChipButton active={selectedBucket === "trash"} onClick={() => startTransition(onOpenTrash)}>
                <span className="inline-flex items-center gap-2">
                  <Trash2 className="h-3.5 w-3.5" />
                  Trash
                  <span className="opacity-70">{trashCount}</span>
                </span>
              </TaskChipButton>
              <TaskViewsMenu onViewChange={onViewChange} view={view} />
              {view === "table" ? (
                <TaskChipButton onClick={onToggleRail}>
                  <span className="inline-flex items-center gap-2">
                    {isRailHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {isRailHidden ? "Show Lists" : "Hide Lists"}
                  </span>
                </TaskChipButton>
              ) : null}
              <div className="relative" ref={listColumnMenuRef}>
                <AdhdChip
                  className="gap-2"
                  data-list-columns-menu
                  onClick={onToggleListColumnMenu}
                  toneClassName={SHARED_CHIP_MUTED_CLASS}
                >
                  Columns
                  <ChevronDown className={`h-4 w-4 transition ${isListColumnMenuOpen ? "rotate-180" : ""}`} />
                </AdhdChip>
                {isListColumnMenuOpen ? (
                  <AdhdDropdownPanel widthClassName="w-72">
                    <DropdownSectionHeader
                      detail="Status and Task stay pinned. Everything else can be shown or hidden here."
                      title="Visible columns"
                    />
                    <div className="mt-2 space-y-1">
                      {listColumnPickerColumns.map((columnId) => {
                        const isVisible = listVisibleColumns.includes(columnId);

                        return (
                          <DropdownChipRow
                            key={columnId}
                            onClick={() => onToggleListColumn(columnId)}
                            label={listColumnLabels[columnId]}
                            selected={isVisible}
                          />
                        );
                      })}
                    </div>
                  </AdhdDropdownPanel>
                ) : null}
              </div>
              <TaskChipButton onClick={onExpandAllColumns} tone="purple">
                Expand columns
              </TaskChipButton>
              <TaskChipButton onClick={onShrinkAllColumns} tone="purple">
                Shrink columns
              </TaskChipButton>
              <div className="relative" ref={keyboardShortcutsMenuRef}>
                <AdhdChip
                  className="gap-2"
                  data-keyboard-shortcuts-menu
                  onClick={onToggleKeyboardShortcutsMenu}
                  toneClassName={SHARED_CHIP_MUTED_CLASS}
                >
                  Shortcuts
                  <ChevronDown className={`h-4 w-4 transition ${isKeyboardShortcutsMenuOpen ? "rotate-180" : ""}`} />
                </AdhdChip>
                {isKeyboardShortcutsMenuOpen ? (
                  <AdhdDropdownPanel widthClassName="w-72">
                    <DropdownSectionHeader
                      detail="These are the interactions that are actually live on the new table."
                      title="Table controls"
                    />
                    <div className="mt-2 space-y-1 px-1">
                      {[
                        { action: "Search tasks", detail: "Use the search bar above" },
                        { action: "Open a task", detail: "Click any row" },
                        { action: "Sort a column", detail: "Click a column title" },
                        { action: "Filter a column", detail: "Use the search field or chips in that menu" },
                        { action: "Reset filters", detail: "Use Clear all filters in the table header" },
                      ].map((item) => (
                        <div className="flex items-start justify-between gap-3 rounded-[0.95rem] px-2.5 py-2" key={item.action}>
                          <span className={MENU_ROW_ACTION_CLASS}>{item.action}</span>
                          <span className={MENU_ROW_DETAIL_CLASS}>{item.detail}</span>
                        </div>
                      ))}
                    </div>
                  </AdhdDropdownPanel>
                ) : null}
              </div>
              <TaskChipButton onClick={onOpenListSettings}>
                List settings
              </TaskChipButton>
            </div>
          </div>
          {view === "table" && isRailHidden ? null : (
            <ReorderableTaskChipRail
              lists={lists}
              onReorderLists={onReorderLists}
              onSelectBucket={onSelectBucket}
              selectedBucket={selectedBucket}
            />
          )}
          {filterRowsNode}
        </div>

      </div>
    </section>
  );
}

export function TasksListViewPanel(props: {
  agentPlanNode: ReactNode;
  draggedListColumnId: AgentPlanColumnId | null;
  filterRowsNode: ReactNode;
  archiveCount: number;
  isKeyboardShortcutsMenuOpen: boolean;
  isListColumnMenuOpen: boolean;
  keyboardShortcutsMenuRef: RefObject<HTMLDivElement | null>;
  listColumnLabels: Record<AgentPlanColumnId, string>;
  listColumnMenuRef: RefObject<HTMLDivElement | null>;
  listColumnPickerColumns: AgentPlanColumnId[];
  lists: TaskRailListOption[];
  listVisibleColumns: AgentPlanColumnId[];
  onOpenListSettings: () => void;
  onOpenArchive: () => void;
  onOpenComposer: () => void;
  onOpenImport: () => void;
  onReorderLists?: (orderedListIds: string[]) => Promise<boolean>;
  onSelectBucket: (bucket: string) => void;
  onReorderListColumns: (columnId: AgentPlanColumnId, targetColumnId: AgentPlanColumnId) => void;
  onSetDraggedListColumnId: (columnId: AgentPlanColumnId | null) => void;
  onSetView: (view: TaskViewMode) => void;
  onToggleKeyboardShortcutsMenu: () => void;
  onToggleListColumn: (columnId: AgentPlanColumnId) => void;
  onToggleListColumnMenu: () => void;
  onOpenTrash: () => void;
  onUpdateSearch: (search: string) => void;
  search: string;
  selectedBucket: string;
  expandAllColumnsToken: number;
  shrinkAllColumnsToken: number;
  shortcuts: Array<{ action: string; alternateKeys?: string[]; keys: string[] }>;
  trashCount: number;
  view: TaskViewMode;
}) {
  const { agentPlanNode } = props;

  return (
    <section className="mt-4">
      {agentPlanNode}
    </section>
  );
}

export function TasksNonListViewPanel({
  contentNode,
  dailyPlanningNode,
  filterRowsNode,
  lists,
  onReorderLists,
  onSelectBucket,
  selectedBucket,
}: {
  contentNode: ReactNode;
  dailyPlanningNode: ReactNode;
  filterRowsNode: ReactNode;
  lists: TaskRailListOption[];
  onReorderLists?: (orderedListIds: string[]) => Promise<boolean>;
  onSelectBucket: (bucket: string) => void;
  selectedBucket: string;
}) {
  return (
    <section className="mt-4 grid gap-4 xl:grid-cols-[15.5rem_minmax(0,1fr)]">
      <TaskBucketRail
        lists={lists}
        onReorderLists={onReorderLists}
        onSelectBucket={onSelectBucket}
        selectedBucket={selectedBucket}
      />
      <div className="min-w-0">
        {filterRowsNode}
        {dailyPlanningNode}
        {contentNode}
      </div>
    </section>
  );
}

function TaskBucketRail({
  lists,
  onReorderLists,
  onSelectBucket,
  selectedBucket,
}: {
  lists: TaskRailListOption[];
  onReorderLists?: (orderedListIds: string[]) => Promise<boolean>;
  onSelectBucket: (bucket: string) => void;
  selectedBucket: string;
}) {
  return (
    <>
      <aside className="hidden h-fit rounded-[1.5rem] border border-[#ece8f8] bg-white/90 p-3 shadow-[0_16px_40px_rgba(81,61,168,0.06)] xl:block dark:border-white/10 dark:bg-white/6">
        <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8e88a9] dark:text-white/35">Lists</p>
        <div className="space-y-1.5">
          {lists.map((list) => {
            const active = list.id === selectedBucket;
            return (
              <button
                aria-pressed={active}
                className={`flex w-full items-center justify-between rounded-[1rem] px-3 py-3 text-left transition ${
                  active
                    ? "bg-[#f3efff] text-[#6f57f6] shadow-[0_10px_24px_rgba(81,61,168,0.08)] dark:bg-[#261e49] dark:text-[#cabfff]"
                    : "text-[#58637f] hover:bg-[#faf8ff] dark:text-white/65 dark:hover:bg-white/[0.04]"
                }`}
                key={list.id}
                onClick={() => {
                  startTransition(() => {
                    onSelectBucket(list.id);
                  });
                }}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{list.label}</span>
                  <span className="mt-0.5 block text-xs opacity-70">{list.description}</span>
                </span>
                <span className="ml-3 shrink-0 rounded-full bg-white px-2 py-1 text-xs font-bold text-[#6f57f6] dark:bg-white/10 dark:text-[#cabfff]">
                  {list.count}
                </span>
              </button>
            );
          })}
        </div>
      </aside>
      <div className="xl:hidden">
        <ReorderableTaskChipRail
          lists={lists}
          onReorderLists={onReorderLists}
          onSelectBucket={onSelectBucket}
          selectedBucket={selectedBucket}
        />
      </div>
    </>
  );
}

function HeroMetaCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <article className="rounded-[1rem] border border-[#e7e0fb] bg-white/85 p-3 text-left dark:border-white/10 dark:bg-white/[0.06]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9ca4bf] dark:text-white/35">{label}</p>
      <p className="mt-1 text-xl font-black text-[#1f2744] dark:text-white">{value}</p>
    </article>
  );
}
