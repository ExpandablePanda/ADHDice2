"use client";

import { BookOpen, Check, ChevronDown, Eye, EyeOff, Folder, Search, Trash2, X } from "lucide-react";
import { memo, startTransition, useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import type { MouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { AgentPlanColumnId } from "@/components/ui/agent-plan";
import {
  TASK_TABLE_CHIP_BASE_CLASS,
  TASK_TABLE_ACTIVE_LIST_CHIP_CLASS,
  TASK_TABLE_CONTROL_FONT_CLASS,
  TASK_TABLE_LIST_CHIP_CLASS,
} from "@/components/ui/task-table-primitives";
import { AdhdChip, AdhdDropdownPanel } from "@/components/ui-system";

import type { Task } from "@/lib/database.types";
import type { TaskRailListOption } from "@/lib/task-app-derived";
import { getTaskListContainerKey } from "@/lib/task-list-folders";
import type { AllTaskListDirectoryEntry } from "@/lib/task-list-folders";
import {
  getTaskListRailIndicatorLeft,
  reorderTaskListRailItemsByStructuralKeys,
  resolveTaskListRailCrossContainerMove,
  resolveTaskListRailSiblingMove,
  type TaskListRailSiblingMove,
  type TaskListRailMutationGeneration,
  type TaskListRailSiblingDropIntent,
} from "@/lib/task-list-rail-order";
import type { TaskViewMode } from "@/lib/task-ui-state";
import { createTaskSearchCommitController } from "@/lib/task-search-controller";

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
  const isFocusedRef = useRef(false);
  const [searchDraft, setSearchDraft] = useState(search);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [searchController] = useState(() => createTaskSearchCommitController(onSearchChange, {
      clearTimeout: (handle) => window.clearTimeout(handle as number),
      setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    }, TASK_SEARCH_COMMIT_DELAY_MS));

  useEffect(() => {
    if (isFocusedRef.current) {
      return;
    }
    if (search === searchDraft) {
      return;
    }
    searchController.dispose();
    // Restored workspace-tab search is an external controlled-value update.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchDraft(search);
  }, [search, searchController, searchDraft]);

  useEffect(() => {
    return () => searchController.dispose();
  }, [searchController]);

  const handleSearchDraftChange = (nextValue: string) => {
    setSearchDraft(nextValue);
    searchController.schedule(nextValue);
  };

  const handleClearSearch = () => {
    setSearchDraft("");
    searchController.publish("");
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
          searchController.publish(searchDraft);
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

const DESKTOP_DRAG_THRESHOLD_PX = 5;
const MOBILE_DRAG_HOLD_MS = 350;
const MOBILE_DRAG_CANCEL_DISTANCE_PX = 8;
export const TASK_RAIL_RELEASE_TOLERANCE_PX = 14;
const TASK_RAIL_CHIP_BUTTON_CLASS = `${TASK_TABLE_CONTROL_FONT_CLASS} inline-flex shrink-0 items-center appearance-none border-0 bg-transparent p-0 shadow-none`;

type StructuredRailListOption = TaskRailListOption & {
  containerId?: string | null;
  containerKey?: string;
  containerIndex?: number;
  draggableEligible?: boolean;
  entityId?: string;
  entityType?: "folder" | "list";
  expectedContainerRevision?: number | null;
  destinationAppendIndex?: number;
  listSubtype?: string | null;
  persistedParentValue?: string | null;
  sortOrder?: number;
  structuralKey?: string;
};

type OpenFolderRail = {
  folderId: string;
  lists: StructuredRailListOption[];
};

export function getStructuralMetadataBlockedReason(
  metadata: Pick<StructuredRailListOption, "entityId" | "entityType" | "structuralKey"> | null | undefined,
) {
  if (!metadata?.structuralKey) return "missing-structural-key";
  if (!metadata.entityType) return "missing-entity-type";
  return null;
}

function isRailListReorderable(list: StructuredRailListOption) {
  return Boolean(list.structureKind)
    && getStructuralMetadataBlockedReason(list) === null
    && list.entityType === list.structureKind
    && list.draggableEligible !== false;
}

export type TaskRailDropIntent = "after" | "before" | "inside-folder";

type TaskRailBounds = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

type TaskRailLatchedDestination = {
  crossRailMove: boolean;
  destinationContainer: string | null;
  destinationContainerKey: string;
  destinationIndex: number;
  destinationRailKey: string;
  destinationStructuralKeys: string[];
  dropIntent: TaskRailDropIntent;
  generationId: number;
  rootEndAppendUsed: boolean;
  siblingMove: TaskListRailSiblingMove | null;
  targetBounds: TaskRailBounds;
  targetEntityType: "folder" | "list";
  targetStructuralKey: string | null;
};

type TaskRailRegistration = {
  containerId: string | null;
  getLists: () => StructuredRailListOption[];
  getRail: () => HTMLElement | null;
  setLists: (lists: StructuredRailListOption[]) => void;
};

export type TaskRailDragSession = {
  activeCleanup: (() => void) | null;
  activeGenerationId: number | null;
  generationSequence: number;
  rails: Map<string, TaskRailRegistration>;
};

export function createTaskRailDragSession(): TaskRailDragSession {
  return {
    activeCleanup: null,
    activeGenerationId: null,
    generationSequence: 0,
    rails: new Map(),
  };
}

export function resolveTaskRailDropIntent(
  entityType: "folder" | "list",
  pointerX: number,
  targetLeft: number,
  targetWidth: number,
): TaskRailDropIntent {
  const relativeX = pointerX - targetLeft;
  if (entityType === "list") return relativeX < targetWidth / 2 ? "before" : "after";
  if (relativeX < targetWidth * 0.25) return "before";
  if (relativeX >= targetWidth * 0.75) return "after";
  return "inside-folder";
}

function reorderRailListsToStructuralKeys(lists: StructuredRailListOption[], finalStructuralKeys: readonly string[]) {
  return reorderTaskListRailItemsByStructuralKeys(
    lists,
    finalStructuralKeys,
    (list) => isRailListReorderable(list) ? list.structuralKey ?? null : null,
  );
}

function removeRailListByStructuralKey(
  lists: StructuredRailListOption[],
  structuralKey: string,
) {
  return lists.filter((list) => list.structuralKey !== structuralKey);
}

function insertRailListAtStructuralIndex(
  lists: StructuredRailListOption[],
  sourceList: StructuredRailListOption,
  destinationIndex: number,
) {
  const withoutSource = removeRailListByStructuralKey(lists, sourceList.structuralKey!);
  const structuralCount = withoutSource.filter(isRailListReorderable).length;
  const boundedIndex = Math.max(0, Math.min(structuralCount, destinationIndex));
  const next: StructuredRailListOption[] = [];
  let structuralIndex = 0;
  let inserted = false;
  for (const list of withoutSource) {
    if (!inserted && isRailListReorderable(list) && structuralIndex === boundedIndex) {
      next.push(sourceList);
      inserted = true;
    }
    next.push(list);
    if (isRailListReorderable(list)) structuralIndex += 1;
  }
  if (!inserted) next.push(sourceList);
  return next;
}

function toTaskRailBounds(rect: DOMRect): TaskRailBounds {
  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
  };
}

function isPointWithinBounds(clientX: number, clientY: number, rect: TaskRailBounds) {
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function getTaskRailInteractionCorridor(
  railRect: DOMRect,
  targetElements: readonly HTMLElement[],
): TaskRailBounds {
  const targetRects = targetElements.map((element) => element.getBoundingClientRect());
  const top = Math.min(railRect.top, ...targetRects.map((rect) => rect.top)) - TASK_RAIL_RELEASE_TOLERANCE_PX;
  const bottom = Math.max(railRect.bottom, ...targetRects.map((rect) => rect.bottom)) + TASK_RAIL_RELEASE_TOLERANCE_PX;
  return {
    bottom,
    height: bottom - top,
    left: railRect.left,
    right: railRect.right,
    top,
    width: railRect.width,
  };
}

export function ReorderableTaskChipRail({
  activeFolderId,
  canMoveStructureInto,
  currentFolderId,
  lists,
  onMoveStructure,
  onOpenFolder,
  onSelectBucket,
  dragSession,
  selectedBucket,
}: {
  activeFolderId?: string | null;
  canMoveStructureInto?: (sourceEntityId: string, sourceEntityType: "folder" | "list", destinationFolderId: string) => boolean;
  currentFolderId?: string | null;
  lists: StructuredRailListOption[];
  onMoveStructure?: (
    sourceEntityId: string,
    sourceEntityType: "folder" | "list",
    destinationFolderId: string | null,
    targetIndex: number,
    generation: TaskListRailMutationGeneration,
  ) => Promise<boolean>;
  onOpenFolder?: (folderId: string) => void;
  onSelectBucket: (bucket: string) => void;
  dragSession?: TaskRailDragSession;
  selectedBucket: string;
}) {
  const [renderedLists, setRenderedLists] = useState(lists);
  const renderedListsRef = useRef(lists);
  const [draggedListId, setDraggedListId] = useState<string | null>(null);
  const [mobileInsertionMarker, setMobileInsertionMarker] = useState<{
    fixed: boolean;
    height: number;
    left: number;
    top: number;
  } | null>(null);
  const [outlinedFolderStructuralKey, setOutlinedFolderStructuralKey] = useState<string | null>(null);
  const [crossRailFolderOutline, setCrossRailFolderOutline] = useState<TaskRailBounds | null>(null);
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
    containerKey: string | null;
    frozenRailStructuralKeys: Map<string, string[]>;
    generationId: number;
    holdTimer: number | null;
    initialOrderIds: string[];
    initialLists: StructuredRailListOption[];
    latchedDestination: TaskRailLatchedDestination | null;
    pendingBlockedReason: string | null;
    pendingSiblingMove: TaskListRailSiblingMove | null;
    pointerId: number;
    pointerType: string;
    previewHeight: number;
    previewOffsetX: number;
    previewOffsetY: number;
    previewWidth: number;
    sourceStructuralKey: string;
    startX: number;
    startY: number;
    target: HTMLButtonElement;
    touchIdentifier: number | null;
    removeActivationListeners: (() => void) | null;
  } | null>(null);
  const railElementRef = useRef<HTMLDivElement | null>(null);
  const localDragSessionRef = useRef<TaskRailDragSession>(createTaskRailDragSession());
  const sharedDragSession = dragSession ?? localDragSessionRef.current;
  const pendingTouchIdentifierRef = useRef<number | null>(null);
  const pendingPersistedOrderRef = useRef<string[] | null>(null);
  const suppressClickRef = useRef(false);
  const latestListsRef = useRef(lists);
  const railContainerKey = getTaskListContainerKey(currentFolderId);

  useEffect(() => {
    const registration: TaskRailRegistration = {
      containerId: currentFolderId ?? null,
      getLists: () => renderedListsRef.current,
      getRail: () => railElementRef.current,
      setLists: (nextLists) => {
        renderedListsRef.current = nextLists;
        setRenderedLists(nextLists);
      },
    };
    sharedDragSession.rails.set(railContainerKey, registration);
    return () => {
      if (sharedDragSession.rails.get(railContainerKey) === registration) {
        sharedDragSession.rails.delete(railContainerKey);
      }
    };
  }, [currentFolderId, railContainerKey, sharedDragSession]);

  useEffect(() => {
    latestListsRef.current = lists;
    if (dragRef.current?.mode !== "reordering") {
      const pendingOrder = pendingPersistedOrderRef.current;
      const incomingOrder = lists.filter(isRailListReorderable).map((list) => list.structuralKey!);
      if (pendingOrder && pendingOrder.some((listId, index) => listId !== incomingOrder[index])) {
        return;
      }
      pendingPersistedOrderRef.current = null;
      renderedListsRef.current = lists;
      setRenderedLists(lists);
    }
  }, [lists]);

  const clearDrag = (persist: boolean, pointerId?: number, resetReason = persist ? "pointerup-inside-rail" : "drag-cleared") => {
    const drag = dragRef.current;
    if (!drag) return;
    if (pointerId !== undefined && drag.pointerId !== pointerId) return;
    dragRef.current = null;
    if (sharedDragSession.activeGenerationId === drag.generationId) {
      sharedDragSession.activeCleanup = null;
    }
    if (drag.holdTimer !== null) window.clearTimeout(drag.holdTimer);
    drag.removeActivationListeners?.();
    if (drag.target.hasPointerCapture(drag.pointerId)) {
      drag.target.releasePointerCapture(drag.pointerId);
    }
    setDraggedListId(null);
    setMobileDragPreview(null);
    setMobileInsertionMarker(null);
    setOutlinedFolderStructuralKey(null);
    setCrossRailFolderOutline(null);

    if (persist && drag.mode === "reordering") {
      const siblingMove = drag.latchedDestination?.siblingMove ?? drag.pendingSiblingMove;
      const finalLists = siblingMove === null
        ? drag.initialLists
        : reorderRailListsToStructuralKeys(drag.initialLists, siblingMove.finalStructuralKeys);
      const finalOrderIds = finalLists.filter(isRailListReorderable).map((list) => list.structuralKey!);
      const didReorder = Boolean(siblingMove && !siblingMove.invalidReason && !siblingMove.samePosition);
      renderedListsRef.current = finalLists;
      setRenderedLists(finalLists);
      if (didReorder && onMoveStructure) {
        pendingPersistedOrderRef.current = finalOrderIds;
        const targetIndex = siblingMove?.destinationIndex ?? null;
        const sourceList = drag.initialLists.find((list) => list.structuralKey === drag.sourceStructuralKey);
        const sourceBlockedReason = getStructuralMetadataBlockedReason(sourceList);
        if (sourceBlockedReason || targetIndex === null) {
          pendingPersistedOrderRef.current = null;
          renderedListsRef.current = latestListsRef.current;
          setRenderedLists(latestListsRef.current);
          return;
        }
        void onMoveStructure(
          sourceList!.structuralKey!,
          sourceList!.entityType!,
          currentFolderId ?? null,
          targetIndex,
          {
            generationId: drag.generationId,
            isCurrent: () => sharedDragSession.activeGenerationId === drag.generationId,
          },
        ).then((saved) => {
          if (sharedDragSession.activeGenerationId !== drag.generationId) {
            return;
          }
          if (!saved) {
            pendingPersistedOrderRef.current = null;
            renderedListsRef.current = latestListsRef.current;
            setRenderedLists(latestListsRef.current);
          }
        });
      }
      return;
    }

    if (resetReason.startsWith("cross-rail")) return;
    renderedListsRef.current = drag.initialLists;
    setRenderedLists(drag.initialLists);
  };

  const clearLatchedDestination = (
    drag: NonNullable<typeof dragRef.current>,
    reason: string,
    blockedReason: string | null = reason,
  ) => {
    drag.latchedDestination = null;
    drag.pendingSiblingMove = null;
    drag.pendingBlockedReason = blockedReason;
    setMobileInsertionMarker(null);
    setOutlinedFolderStructuralKey(null);
    setCrossRailFolderOutline(null);
  };

  const showLatchedDestination = (
    destination: TaskRailLatchedDestination,
    railRect: DOMRect,
    rail: HTMLElement,
  ) => {
    const sourceRail = dragRef.current?.target.closest<HTMLElement>("[data-list-reorder-rail]") ?? null;
    const crossRailMove = sourceRail !== rail;
    setOutlinedFolderStructuralKey(
      !crossRailMove && destination.dropIntent === "inside-folder" ? destination.targetStructuralKey : null,
    );
    setCrossRailFolderOutline(
      crossRailMove && destination.dropIntent === "inside-folder" ? destination.targetBounds : null,
    );
    if (destination.dropIntent === "inside-folder") {
      setMobileInsertionMarker(null);
      return;
    }
    setMobileInsertionMarker({
      fixed: crossRailMove,
      height: destination.targetBounds.height,
      left: crossRailMove
        ? destination.dropIntent === "after" ? destination.targetBounds.right : destination.targetBounds.left
        : getTaskListRailIndicatorLeft(
            destination.dropIntent === "after" ? destination.targetBounds.right : destination.targetBounds.left,
            railRect.left,
            rail.scrollLeft,
          ),
      top: crossRailMove
        ? destination.targetBounds.top
        : destination.targetBounds.top - railRect.top + rail.scrollTop,
    });
  };

  const updateRailInsertion = (
    drag: NonNullable<typeof dragRef.current>,
    clientX: number,
    clientY = drag.currentY,
    isRelease = false,
  ): { destination: TaskRailLatchedDestination | null; releaseWithinTolerance: boolean; usedLatch: boolean } => {
    const sourceRail = drag.target.closest<HTMLElement>("[data-list-reorder-rail]");
    if (!sourceRail) {
      clearLatchedDestination(drag, "missing-rail");
      return { destination: null, releaseWithinTolerance: false, usedLatch: false };
    }
    const sourceList = drag.initialLists.find((list) => list.structuralKey === drag.sourceStructuralKey);
    const sourceBlockedReason = getStructuralMetadataBlockedReason(sourceList);
    const elementAtPointer = document.elementFromPoint(clientX, clientY);
    const pointerRail = elementAtPointer?.closest<HTMLElement>("[data-list-reorder-rail]") ?? null;
    const rootContainerKey = getTaskListContainerKey(null);
    const pointerRailContainerKey = pointerRail?.dataset?.railContainerKey ?? null;
    const requestedCrossRail = Boolean(pointerRail && pointerRail !== sourceRail);
    if (
      requestedCrossRail
      && (
        sourceList?.entityType !== "list"
        || pointerRailContainerKey !== rootContainerKey
      )
    ) {
      clearLatchedDestination(drag, "invalid-cross-rail-destination");
      return { destination: null, releaseWithinTolerance: false, usedLatch: false };
    }
    const latchedRail = drag.latchedDestination
      ? sharedDragSession.rails.get(drag.latchedDestination.destinationRailKey)?.getRail() ?? null
      : null;
    const rail = pointerRail ?? latchedRail ?? sourceRail;
    const railContainerKey = rail.dataset?.railContainerKey ?? drag.containerKey ?? rootContainerKey;
    const crossRailMove = rail !== sourceRail;
    const railRect = rail.getBoundingClientRect();
    const structuralRegistry = Array.from(rail.querySelectorAll<HTMLElement>("[data-rail-drag-id]"));
    const structuralRegistryStructuralKeys = structuralRegistry.flatMap((element) => (
      element.dataset.railDragId ? [element.dataset.railDragId] : []
    ));
    const elementByStructuralKey = new Map(structuralRegistry.flatMap((element) => (
      element.dataset.railDragId ? [[element.dataset.railDragId, element] as const] : []
    )));
    const destinationStructuralKeys = crossRailMove
      ? (drag.frozenRailStructuralKeys.get(railContainerKey) ?? structuralRegistryStructuralKeys)
          .filter((key) => key !== drag.sourceStructuralKey)
      : drag.initialOrderIds;
    const targetElements = destinationStructuralKeys
      .filter((key) => key !== drag.sourceStructuralKey)
      .flatMap((key) => {
        const element = elementByStructuralKey.get(key);
        return element && element.dataset.railContainerKey === railContainerKey ? [element] : [];
      });
    const railCorridorBounds = getTaskRailInteractionCorridor(railRect, targetElements);
    const releaseWithinTolerance = isPointWithinBounds(clientX, clientY, railCorridorBounds);
    if (!releaseWithinTolerance) {
      clearLatchedDestination(drag, "left-rail-corridor", "no-drop-zone");
      return { destination: null, releaseWithinTolerance: false, usedLatch: false };
    }
    if (
      drag.latchedDestination
      && (
        drag.latchedDestination.generationId !== drag.generationId
        || drag.latchedDestination.destinationRailKey !== railContainerKey
        || (
          drag.latchedDestination.targetStructuralKey !== null
          && !elementByStructuralKey.has(drag.latchedDestination.targetStructuralKey)
        )
      )
    ) {
      clearLatchedDestination(
        drag,
        drag.latchedDestination.generationId !== drag.generationId ? "drag-generation-mismatch" : "target-disappeared",
      );
    }
    const withinRailBounds = clientY >= railRect.top && clientY <= railRect.bottom;
    const rootEndAppendUsed = (
      railContainerKey === rootContainerKey
      && withinRailBounds
      && (crossRailMove || targetElements.length > 0)
      && (
        targetElements.length === 0
        || clientX > targetElements.at(-1)!.getBoundingClientRect().right
      )
    );
    if (targetElements.length === 0 && !rootEndAppendUsed) {
      const reason = structuralRegistry.length > 1 ? "container-key-mismatch" : "zero-candidate-targets";
      clearLatchedDestination(drag, reason);
      return { destination: null, releaseWithinTolerance, usedLatch: false };
    }

    if (!withinRailBounds) {
      const destination = drag.latchedDestination?.generationId === drag.generationId
        && drag.latchedDestination.destinationRailKey === railContainerKey
        && (
          drag.latchedDestination.targetStructuralKey === null
          || elementByStructuralKey.has(drag.latchedDestination.targetStructuralKey)
        )
        ? drag.latchedDestination
        : null;
      if (destination) showLatchedDestination(destination, railRect, rail);
      return { destination, releaseWithinTolerance, usedLatch: Boolean(destination) };
    }

    const directTarget = rootEndAppendUsed ? null : targetElements.find((target) => {
      const rect = target.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    });
    const hoveredTarget = rootEndAppendUsed
      ? targetElements.at(-1) ?? null
      : directTarget
        ?? targetElements.find((target) => clientX < target.getBoundingClientRect().left + target.getBoundingClientRect().width / 2)
        ?? targetElements.at(-1)
        ?? null;
    const rawTargetRect = hoveredTarget?.getBoundingClientRect() ?? railRect;
    const targetBounds = rootEndAppendUsed && !hoveredTarget
      ? {
          bottom: railRect.bottom,
          height: railRect.height,
          left: railRect.left,
          right: railRect.left,
          top: railRect.top,
          width: 0,
        }
      : toTaskRailBounds(rawTargetRect);
    const hoveredTargetStructuralKey = hoveredTarget?.dataset.railDragId ?? null;
    const hoveredTargetEntityId = hoveredTarget?.dataset.railEntityId ?? null;
    const hoveredTargetEntityType = hoveredTarget?.dataset.railEntityType === "folder"
      ? "folder"
      : hoveredTarget?.dataset.railEntityType === "list"
        ? "list"
        : rootEndAppendUsed
          ? "list"
          : null;
    const dropIntent = rootEndAppendUsed
      ? "after"
      : directTarget && hoveredTargetEntityType
      ? resolveTaskRailDropIntent(hoveredTargetEntityType, clientX, targetBounds.left, targetBounds.width)
      : hoveredTarget === targetElements.at(-1) && clientX >= targetBounds.left + targetBounds.width / 2
        ? "after"
        : "before";
    const siblingMove = dropIntent !== "inside-folder" && (hoveredTargetStructuralKey || rootEndAppendUsed)
      ? crossRailMove
        ? resolveTaskListRailCrossContainerMove(
            destinationStructuralKeys,
            drag.sourceStructuralKey,
            rootEndAppendUsed ? null : hoveredTargetStructuralKey,
            dropIntent as TaskListRailSiblingDropIntent,
          )
        : resolveTaskListRailSiblingMove(
            drag.initialOrderIds,
            drag.sourceStructuralKey,
            hoveredTargetStructuralKey!,
            dropIntent as TaskListRailSiblingDropIntent,
          )
      : null;
    const validSiblingMove = siblingMove?.invalidReason === null ? siblingMove : null;
    const rawFolderDestinationIndex = Number(hoveredTarget?.dataset.railAppendIndex ?? 0);
    const folderDestinationIndex = Number.isSafeInteger(rawFolderDestinationIndex) && rawFolderDestinationIndex >= 0
      ? rawFolderDestinationIndex
      : 0;
    const validFolderDestination = (
      dropIntent === "inside-folder"
      && hoveredTargetEntityType === "folder"
      && hoveredTargetEntityId
      && hoveredTargetStructuralKey !== drag.sourceStructuralKey
      && sourceList
      && sourceBlockedReason === null
      && onMoveStructure
      && (!canMoveStructureInto || canMoveStructureInto(
        sourceList.structuralKey!,
        sourceList.entityType!,
        hoveredTargetEntityId,
      ))
    );
    const destination = (hoveredTargetStructuralKey || rootEndAppendUsed) && hoveredTargetEntityType && (
      validFolderDestination || (
        dropIntent !== "inside-folder"
        && validSiblingMove
        && !validSiblingMove.samePosition
        && validSiblingMove.destinationIndex !== null
      )
    )
      ? {
          crossRailMove,
          destinationContainer: validFolderDestination
            ? hoveredTargetEntityId
            : railContainerKey === rootContainerKey ? null : rail.dataset?.railContainerId || null,
          destinationContainerKey: validFolderDestination
            ? getTaskListContainerKey(hoveredTargetEntityId)
            : railContainerKey,
          destinationIndex: validFolderDestination ? folderDestinationIndex : validSiblingMove!.destinationIndex!,
          destinationRailKey: railContainerKey,
          destinationStructuralKeys,
          dropIntent,
          generationId: drag.generationId,
          rootEndAppendUsed,
          siblingMove: validFolderDestination ? null : validSiblingMove,
          targetBounds,
          targetEntityType: hoveredTargetEntityType,
          targetStructuralKey: hoveredTargetStructuralKey,
        } satisfies TaskRailLatchedDestination
      : null;
    if (destination) {
      drag.latchedDestination = destination;
      drag.pendingSiblingMove = destination.siblingMove;
      drag.pendingBlockedReason = null;
      showLatchedDestination(destination, railRect, rail);
    } else {
      const invalidReason = sourceBlockedReason
        ?? siblingMove?.invalidReason
        ?? (siblingMove?.samePosition ? "same-position" : "invalid-destination");
      clearLatchedDestination(drag, invalidReason, invalidReason);
    }
    return { destination, releaseWithinTolerance, usedLatch: false };
  };

  const finishDrop = (drag: NonNullable<typeof dragRef.current>, clientX: number, clientY: number, pointerId: number) => {
    const release = updateRailInsertion(drag, clientX, clientY, true);
    const destination = release.destination;
    if (!destination) {
      clearDrag(false, pointerId, drag.pendingBlockedReason ?? "no-drop-zone");
      return;
    }
    const sourceList = drag.initialLists.find((list) => list.structuralKey === drag.sourceStructuralKey);
    const sourceBlockedReason = getStructuralMetadataBlockedReason(sourceList);
    if (!sourceList || sourceBlockedReason || destination.generationId !== drag.generationId) {
      const blockedReason = sourceBlockedReason ?? "drag-generation-mismatch";
      clearDrag(false, pointerId, blockedReason);
      return;
    }
    const crossRailMove = destination.crossRailMove;
    if (crossRailMove) {
      if (sourceList.entityType !== "list" || !onMoveStructure) {
        const blockedReason = sourceList.entityType !== "list" ? "cross-rail-source-not-list" : "missing-mutation-handler";
        clearDrag(false, pointerId, blockedReason);
        return;
      }
      const sourceRegistration = sharedDragSession.rails.get(drag.containerKey ?? "");
      const destinationRegistration = sharedDragSession.rails.get(destination.destinationContainerKey);
      const sourceInitialLists = sourceRegistration?.getLists() ?? drag.initialLists;
      const destinationInitialLists = destinationRegistration?.getLists() ?? [];
      const rootRail = sharedDragSession.rails.get(getTaskListContainerKey(null))?.getRail() ?? null;
      const rootScrollLeft = rootRail?.scrollLeft ?? null;
      const optimisticSourceLists = removeRailListByStructuralKey(sourceInitialLists, drag.sourceStructuralKey);
      const optimisticDestinationLists = insertRailListAtStructuralIndex(
        destinationInitialLists,
        {
          ...sourceList,
          containerId: destination.destinationContainer,
          containerKey: destination.destinationContainerKey,
          persistedParentValue: destination.destinationContainer,
        },
        destination.destinationIndex,
      );
      if (sourceRegistration) sourceRegistration.setLists(optimisticSourceLists);
      else {
        renderedListsRef.current = optimisticSourceLists;
        setRenderedLists(optimisticSourceLists);
      }
      destinationRegistration?.setLists(optimisticDestinationLists);
      if (rootRail && rootScrollLeft !== null) rootRail.scrollLeft = rootScrollLeft;
      clearDrag(false, pointerId, release.usedLatch ? "cross-rail-latched-drop" : "cross-rail-live-drop");
      let mutationResult: "ordinary-error" | "stale-conflict" | "success" = "ordinary-error";
      void onMoveStructure(
        sourceList.structuralKey!,
        "list",
        destination.destinationContainer,
        destination.destinationIndex,
        {
          generationId: drag.generationId,
          isCurrent: () => sharedDragSession.activeGenerationId === drag.generationId,
          onResult: (result) => {
            mutationResult = result;
          },
        },
      ).then((saved) => {
        if (sharedDragSession.activeGenerationId !== drag.generationId) {
          return;
        }
        if (!saved && mutationResult !== "stale-conflict") {
          sourceRegistration?.setLists(sourceInitialLists);
          destinationRegistration?.setLists(destinationInitialLists);
        }
        if (rootRail && rootScrollLeft !== null) rootRail.scrollLeft = rootScrollLeft;
      });
      return;
    }
    if (destination.dropIntent !== "inside-folder") {
      drag.pendingSiblingMove = destination.siblingMove;
      clearDrag(true, pointerId, release.usedLatch ? "pointerup-latched-destination" : "pointerup-live-destination");
      return;
    }
    if (!onMoveStructure) {
      clearDrag(false, pointerId, "missing-mutation-handler");
      return;
    }
    clearDrag(false, pointerId, release.usedLatch ? "folder-center-latched-drop" : "folder-center-drop");
    void onMoveStructure(
      sourceList.structuralKey!,
      sourceList.entityType!,
      destination.destinationContainer,
      destination.destinationIndex,
      {
        generationId: drag.generationId,
        isCurrent: () => sharedDragSession.activeGenerationId === drag.generationId,
      },
    );
  };

  const handleActivatedPointerMove = (
    event: Pick<PointerEvent, "clientX" | "clientY" | "pointerId" | "preventDefault">,
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.mode !== "reordering") return;
    event.preventDefault();
    drag.currentX = event.clientX;
    drag.currentY = event.clientY;
    setMobileDragPreview((current) => current ? {
      ...current,
      clientX: event.clientX,
      clientY: event.clientY,
    } : current);

    updateRailInsertion(drag, event.clientX, event.clientY);
  };

  const activateDrag = (pointerId: number, sourceStructuralKey: string) => {
    const drag = dragRef.current;
    if (!drag || drag.mode !== "pending" || drag.pointerId !== pointerId || drag.sourceStructuralKey !== sourceStructuralKey) return;
    drag.mode = "reordering";
    drag.holdTimer = null;
    suppressClickRef.current = true;
    setDraggedListId(sourceStructuralKey);
    const sourceList = renderedListsRef.current.find((list) => list.structuralKey === sourceStructuralKey);
    if (sourceList) {
      setMobileDragPreview({
        clientX: drag.currentX,
        clientY: drag.currentY,
        count: sourceList.structureKind === "folder" ? undefined : sourceList.count,
        height: drag.previewHeight,
        label: sourceList.label,
        offsetX: drag.previewOffsetX,
        offsetY: drag.previewOffsetY,
        selected: sourceList.id === selectedBucket,
        width: drag.previewWidth,
      });
    }
    updateRailInsertion(drag, drag.currentX, drag.currentY);
    if (drag.pointerType === "touch" || drag.pointerType === "pen") {
      drag.target.setPointerCapture(drag.pointerId);
      const removePreActivationListeners = drag.removeActivationListeners;
      const handleMove = (event: PointerEvent) => handleActivatedPointerMove(event);
      const handleUp = (event: PointerEvent) => {
        if (event.pointerId !== drag.pointerId) return;
        finishDrop(drag, event.clientX, event.clientY, event.pointerId);
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
          clearDrag(false, event.pointerId, "touch-movement-cancelled");
        }
        return;
      }
      if (distance < DESKTOP_DRAG_THRESHOLD_PX) return;
      activateDrag(event.pointerId, drag.sourceStructuralKey);
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
    <div
      className="adhdice-scrollbar relative flex gap-2 overflow-x-auto pb-0.5"
      data-list-reorder-rail="true"
      data-rail-container-id={currentFolderId ?? ""}
      data-rail-container-key={railContainerKey}
      ref={railElementRef}
    >
      {renderedLists.map((list) => {
        const reorderable = isRailListReorderable(list) && Boolean(onMoveStructure);
        const listRailContainerKey = list.containerKey ?? railContainerKey;
        const folderSelected = list.structureKind === "folder" && list.id === activeFolderId;
        const selected = folderSelected || (list.structureKind !== "folder" && list.id === selectedBucket);
        const folderCountLabel = list.folderCounts
          ? String(list.folderCounts.containedListCount)
          : null;
        const accessibleFolderSummary = list.folderCounts
          ? `${list.folderCounts.containedListCount} contained lists. ${list.folderCounts.visibleTaskCount} Tasks, ${list.folderCounts.dueTodayCount} due today, ${list.folderCounts.overdueCount} overdue.`
          : undefined;
        return (
        <button
          aria-label={accessibleFolderSummary ? `${list.label}. ${accessibleFolderSummary}` : undefined}
          aria-pressed={selected}
          className={`${TASK_RAIL_CHIP_BUTTON_CLASS} ${reorderable ? "cursor-grab" : ""} ${draggedListId === list.structuralKey ? "adhdice-native-interaction-suppressed cursor-grabbing relative z-10 opacity-[0.55]" : ""}`}
          data-folder-drop-id={list.structureKind === "folder" ? list.entityId : undefined}
          data-rail-chip-surface
          data-rail-container-key={reorderable ? listRailContainerKey : undefined}
          data-rail-drag-id={reorderable ? list.structuralKey : undefined}
          data-rail-entity-id={reorderable ? list.entityId : undefined}
          data-rail-entity-type={reorderable ? list.entityType : undefined}
          data-rail-append-index={list.destinationAppendIndex}
          draggable={false}
          key={list.id}
          onClick={(event) => {
            if (suppressClickRef.current) {
              event.preventDefault();
              suppressClickRef.current = false;
              return;
            }
            startTransition(() => {
              if (list.structureKind === "folder") {
                onOpenFolder?.(list.id);
              } else {
                onSelectBucket(list.id);
              }
            });
          }}
          onContextMenu={reorderable ? (event) => event.preventDefault() : undefined}
          onDragStart={reorderable ? (event) => event.preventDefault() : undefined}
          onLostPointerCapture={(event) => clearDrag(false, event.pointerId, "lost-pointer-capture")}
          onPointerCancel={(event) => clearDrag(false, event.pointerId, "pointercancel")}
          onPointerDown={(event) => {
            const generationId = reorderable && event.button === 0
              ? sharedDragSession.generationSequence + 1
              : null;
            if (generationId !== null) {
              sharedDragSession.generationSequence = generationId;
              sharedDragSession.activeGenerationId = generationId;
            }
            const renderedSiblingStructuralKeys = renderedLists
              .filter(isRailListReorderable)
              .map((currentList) => currentList.structuralKey!);
            if (!reorderable) return;
            if (event.button !== 0) return;
            sharedDragSession.activeCleanup?.();
            clearDrag(false, undefined, "replaced-by-pointerdown");
            suppressClickRef.current = false;
            const sourceRect = event.currentTarget.getBoundingClientRect();
            const drag = {
              mode: "pending" as const,
              currentX: event.clientX,
              currentY: event.clientY,
              containerKey: listRailContainerKey,
              frozenRailStructuralKeys: new Map(Array.from(sharedDragSession.rails, ([containerKey, registration]) => [
                containerKey,
                registration.getLists().filter(isRailListReorderable).map((item) => item.structuralKey!),
              ])),
              generationId: generationId!,
              holdTimer: null as number | null,
              initialOrderIds: renderedSiblingStructuralKeys,
              initialLists: renderedLists,
              latchedDestination: null,
              pendingBlockedReason: null,
              pendingSiblingMove: null,
              pointerId: event.pointerId,
              pointerType: event.pointerType,
              previewHeight: sourceRect.height,
              previewOffsetX: event.clientX - sourceRect.left,
              previewOffsetY: event.clientY - sourceRect.top,
              previewWidth: sourceRect.width,
              sourceStructuralKey: list.structuralKey!,
              startX: event.clientX,
              startY: event.clientY,
              target: event.currentTarget,
              touchIdentifier: event.pointerType === "touch" ? pendingTouchIdentifierRef.current : null,
              removeActivationListeners: null,
            };
            pendingTouchIdentifierRef.current = null;
            dragRef.current = drag;
            sharedDragSession.activeCleanup = () => clearDrag(false, undefined, "new-drag-generation");
            event.currentTarget.setPointerCapture(event.pointerId);
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
              drag.holdTimer = window.setTimeout(() => activateDrag(event.pointerId, list.structuralKey!), MOBILE_DRAG_HOLD_MS);
            }
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => {
            if (event.pointerType === "touch" || event.pointerType === "pen") {
              if (dragRef.current?.mode === "pending") {
                clearDrag(false, event.pointerId, "pointerup-before-activation");
              }
              return;
            }
            const activeDrag = dragRef.current;
            if (!activeDrag) return;
            finishDrop(activeDrag, event.clientX, event.clientY, event.pointerId);
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
          style={reorderable ? {
            touchAction: "pan-x pan-y",
            WebkitTouchCallout: "none",
            WebkitUserSelect: draggedListId === list.structuralKey ? "none" : undefined,
            userSelect: draggedListId === list.structuralKey ? "none" : undefined,
          } : undefined}
          title={accessibleFolderSummary}
          type="button"
        >
          <span className={`pointer-events-none cursor-inherit ${TASK_TABLE_CHIP_BASE_CLASS} ${selected ? SHARED_CHIP_ACTIVE_CLASS : SHARED_CHIP_MUTED_CLASS} ${draggedListId === list.structuralKey ? "shadow-lg ring-2 ring-[#c9bcff] dark:ring-[#6e5ab2]" : ""} ${outlinedFolderStructuralKey === list.structuralKey ? "ring-2 ring-inset ring-[#6f57f6] dark:ring-[#cabfff]" : ""}`}>
            <span className="inline-flex items-center">
              {list.structureKind === "folder" ? <Folder className="mr-1.5 h-3.5 w-3.5 shrink-0" /> : null}
              {list.label}
              {folderCountLabel ? <span className="ml-1 opacity-70">{folderCountLabel}</span> : null}
              {list.structureKind === "folder" ? null : <span className="ml-1 opacity-70">{list.count}</span>}
            </span>
          </span>
        </button>
        );
      })}
      {mobileInsertionMarker ? (
        <span
          aria-hidden="true"
          className={`pointer-events-none z-20 w-1 -translate-x-1/2 rounded-full bg-[#6f57f6] shadow-[0_0_0_2px_rgba(201,188,255,0.45)] dark:bg-[#cabfff] ${mobileInsertionMarker.fixed ? "fixed" : "absolute"}`}
          style={{ height: mobileInsertionMarker.height, left: mobileInsertionMarker.left, top: mobileInsertionMarker.top }}
        />
      ) : null}
    </div>
    {crossRailFolderOutline ? (
      <span
        aria-hidden="true"
        className="pointer-events-none fixed z-20 rounded-full ring-2 ring-inset ring-[#6f57f6] dark:ring-[#cabfff]"
        style={{
          height: crossRailFolderOutline.height,
          left: crossRailFolderOutline.left,
          top: crossRailFolderOutline.top,
          width: crossRailFolderOutline.width,
        }}
      />
    ) : null}
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
  autoFocus,
  children,
  onClick,
  tone = "muted",
}: {
  active?: boolean;
  autoFocus?: boolean;
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
    <AdhdChip aria-pressed={active} autoFocus={autoFocus} onClick={onClick} selected={active} toneClassName={toneClassName}>
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

export function TaskListRailHierarchy({
  canMoveStructureInto,
  currentFolderBreadcrumbs,
  currentFolderId,
  lists,
  onMoveStructure,
  onNavigateFolder,
  onSelectBucket,
  openFolderRails,
  selectedBucket,
}: {
  canMoveStructureInto?: (sourceEntityId: string, sourceEntityType: "folder" | "list", destinationFolderId: string) => boolean;
  currentFolderBreadcrumbs: Array<{ id: string; name: string }>;
  currentFolderId: string | null;
  lists: StructuredRailListOption[];
  onMoveStructure?: (
    sourceEntityId: string,
    sourceEntityType: "folder" | "list",
    destinationFolderId: string | null,
    targetIndex: number,
    generation: TaskListRailMutationGeneration,
  ) => Promise<boolean>;
  onNavigateFolder?: (folderId: string | null) => void;
  onSelectBucket: (bucket: string) => void;
  openFolderRails: OpenFolderRail[];
  selectedBucket: string;
}) {
  const dragSessionRef = useRef<TaskRailDragSession>(createTaskRailDragSession());

  const toggleFolder = (folderId: string, collapseToFolderId: string | null) => {
    onNavigateFolder?.(currentFolderId === folderId ? collapseToFolderId : folderId);
  };

  return (
    <div className="flex flex-col gap-1" data-list-rail-hierarchy data-rail-spacing="compact">
      <div data-primary-list-rail>
        <ReorderableTaskChipRail
          activeFolderId={currentFolderBreadcrumbs[0]?.id ?? null}
          canMoveStructureInto={canMoveStructureInto}
          currentFolderId={null}
          lists={lists}
          onMoveStructure={onMoveStructure}
          onOpenFolder={(folderId) => toggleFolder(folderId, null)}
          onSelectBucket={onSelectBucket}
          dragSession={dragSessionRef.current}
          selectedBucket={selectedBucket}
        />
      </div>
      {openFolderRails.map((rail, index) => (
        <div data-folder-content-rail={rail.folderId} key={rail.folderId}>
          <ReorderableTaskChipRail
            activeFolderId={currentFolderBreadcrumbs[index + 1]?.id ?? null}
            canMoveStructureInto={canMoveStructureInto}
            currentFolderId={rail.folderId}
            lists={rail.lists}
            onMoveStructure={onMoveStructure}
            onOpenFolder={(folderId) => toggleFolder(folderId, rail.folderId)}
            onSelectBucket={onSelectBucket}
            dragSession={dragSessionRef.current}
            selectedBucket={selectedBucket}
          />
        </div>
      ))}
    </div>
  );
}

export function TaskOperationsHeader({
  actionLabel,
  activeCount,
  allListDirectoryEntries = [],
  appVersion,
  archiveCount,
  canMoveStructureInto,
  currentFolderBreadcrumbs = [],
  currentFolderId = null,
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
  onMoveStructure,
  onNavigateFolder,
  openFolderRails = [],
  onSelectBucket,
  onSelectDirectoryEntry,
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
  allListDirectoryEntries?: AllTaskListDirectoryEntry[];
  appVersion: string;
  archiveCount: number;
  canMoveStructureInto?: (sourceEntityId: string, sourceEntityType: "folder" | "list", destinationFolderId: string) => boolean;
  currentFolderBreadcrumbs?: Array<{ id: string; name: string }>;
  currentFolderId?: string | null;
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
  onMoveStructure?: (
    sourceEntityId: string,
    sourceEntityType: "folder" | "list",
    destinationFolderId: string | null,
    targetIndex: number,
    generation: TaskListRailMutationGeneration,
  ) => Promise<boolean>;
  onNavigateFolder?: (folderId: string | null) => void;
  openFolderRails?: OpenFolderRail[];
  onSelectBucket: (bucket: string) => void;
  onSelectDirectoryEntry?: (entry: AllTaskListDirectoryEntry) => void;
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
  const [isAllListsOpen, setIsAllListsOpen] = useState(false);
  const [allListsSearch, setAllListsSearch] = useState("");
  const matchingDirectoryEntries = allListDirectoryEntries.filter((entry) => {
    const query = allListsSearch.trim().toLocaleLowerCase();
    return !query || `${entry.label} ${entry.path}`.toLocaleLowerCase().includes(query);
  });
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
              <div className="relative">
                <TaskChipButton onClick={() => setIsAllListsOpen((current) => !current)}>
                  All Lists
                </TaskChipButton>
                {isAllListsOpen ? (
                  <AdhdDropdownPanel className="p-3" widthClassName="w-[22rem]">
                    <label className="flex items-center gap-2 rounded-xl border border-[#e8e1fb] bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
                      <Search className="h-3.5 w-3.5 text-[#6f57f6]" />
                      <input
                        autoFocus
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        onChange={(event) => setAllListsSearch(event.target.value)}
                        placeholder="Search lists and paths"
                        value={allListsSearch}
                      />
                    </label>
                    <div className="adhdice-scrollbar mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
                      {matchingDirectoryEntries.map((entry) => (
                        <AdhdChip
                          className="w-full justify-start text-left"
                          key={`${entry.kind}:${entry.id}`}
                          onClick={() => {
                            onSelectDirectoryEntry?.(entry);
                            setIsAllListsOpen(false);
                            setAllListsSearch("");
                          }}
                          toneClassName={SHARED_CHIP_MUTED_CLASS}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            {entry.kind === "folder" ? <Folder className="h-3.5 w-3.5 shrink-0" /> : null}
                            <span className="min-w-0">
                              <span className="block truncate">{entry.label}</span>
                              <span className="block truncate text-[10px] font-medium opacity-60">{entry.kind} · {entry.path}</span>
                            </span>
                          </span>
                        </AdhdChip>
                      ))}
                    </div>
                  </AdhdDropdownPanel>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1" data-task-rail-filter-stack>
            {view === "table" && isRailHidden ? null : (
              <TaskListRailHierarchy
                canMoveStructureInto={canMoveStructureInto}
                currentFolderBreadcrumbs={currentFolderBreadcrumbs}
                currentFolderId={currentFolderId}
                lists={lists}
                onMoveStructure={onMoveStructure}
                onNavigateFolder={onNavigateFolder}
                onSelectBucket={onSelectBucket}
                openFolderRails={openFolderRails}
                selectedBucket={selectedBucket}
              />
            )}
            {filterRowsNode}
          </div>
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
}: {
  contentNode: ReactNode;
  dailyPlanningNode: ReactNode;
  filterRowsNode: ReactNode;
}) {
  return (
    <section className="mt-4 min-w-0">
      {filterRowsNode}
      {dailyPlanningNode}
      {contentNode}
    </section>
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
