"use client";

import { Archive, Bed, BookOpen, Briefcase, Car, Check, ChevronDown, ChevronUp, CircleAlert, Copy, Footprints, GripVertical, Home, Link2, Minus, Moon, Plus, RotateCcw, Search, ShowerHead, Sparkles, Target, Trash2, Unlink, Utensils, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Task, TaskStatus } from "@/lib/database.types";
import { formatTaskStatusLabel, renderTaskStatusCircle } from "@/components/task-app/task-status-ui";
import {
  createLocalStoragePathsStorageAdapter,
  convertPathNodeToTaskNode,
  convertTaskNodeToPathNode,
  duplicatePathNode,
  getLocalPathDateKey,
  LOCAL_PATHS_PROTOTYPE_USER_ID,
  PATH_TYPES,
  type PathNode,
  type PathProgress,
  type PathRecord,
  type PathType,
} from "@/lib/paths-domain";
import { buildPathsTaskNodeView, isPathsNodeComplete, isPathsTaskAvailable, type PathsTaskNodeStep, type PathsTaskNodeView } from "@/lib/paths-task-node";
import { matchesLinkableTaskSearch } from "@/lib/scratch-paper-task-links";
import {
  TASK_TABLE_ACTIVE_LIST_CHIP_CLASS,
  TASK_TABLE_CHIP_BASE_CLASS,
  TASK_TABLE_ICON_LABEL_GAP_CLASS,
  TASK_TABLE_INPUT_CLASS,
  TASK_TABLE_INACTIVE_CHIP_CLASS,
  TaskTableChipButton,
} from "@/components/ui/task-table-primitives";
import { AdhdChip, AdhdDropdownPanel, AdhdIconButton } from "@/components/ui-system";
import { getSelectableTaskStatuses } from "@/lib/task-complete";
import type { TaskListDefinition, TaskListId, TaskListMembership } from "@/lib/task-lists";

type LinkedTaskOption = Task;
type PathEndpointIconId = keyof typeof PATH_ENDPOINT_ICON_MAP;
type PathConnectionSource = { kind: "endpoint" } | { kind: "node"; nodeId: string };
type PathNodeHandleSide = "bottom" | "left" | "right" | "top";
type InspectorSectionId = "actions" | "endpoint" | "path" | "selectedChip";

type PathsWorkspaceProps = {
  availableTaskLists?: TaskListDefinition[];
  listMembershipsByTaskId?: Record<string, TaskListMembership[]>;
  onOpenTask?: (taskId: string) => void;
  onSetTaskStatus?: (taskId: string, status: Task["status"]) => void;
  taskDisplayStatusByTaskId?: Record<string, TaskStatus>;
  tasks?: LinkedTaskOption[];
  userId?: string | null;
};

const PATH_TYPE_LABELS: Record<PathType, string> = {
  daily_reset: "Daily reset",
  one_time: "One time",
  reset_flow: "Reset flow",
};

const EMPTY_PROGRESS: PathProgress = {
  completedNodeIds: [],
  dateKey: null,
  pathId: "",
  updatedAt: "",
  userId: LOCAL_PATHS_PROTOTYPE_USER_ID,
};

const CANVAS_WIDTH = 1180;
const CANVAS_HEIGHT = 720;
const NODE_CARD_WIDTH = 252;
const NODE_CARD_HEIGHT = 116;
const TASK_NODE_CHIP_ROW_HEIGHT = 26;
const TASK_NODE_HIERARCHY_GAP = 8;
const CANVAS_ZOOM_MIN = 0.5;
const CANVAS_ZOOM_MAX = 1.5;
const CANVAS_ZOOM_STEP = 0.1;
const NODE_LONG_PRESS_DURATION_MS = 550;
const NODE_LONG_PRESS_MOVE_TOLERANCE = 8;
const CANVAS_NODE_PADDING = 24;
const LINKED_TASK_MENU_PANEL_CLASS = "adhdice-scrollbar max-h-64 overflow-y-auto";
const LINKED_TASK_LIST_PANEL_CLASS = `${LINKED_TASK_MENU_PANEL_CLASS} flex flex-col gap-2`;
const LINKED_TASK_CHIP_CLASS = `${TASK_TABLE_CHIP_BASE_CLASS} ${TASK_TABLE_INACTIVE_CHIP_CLASS} max-w-full gap-1.5 overflow-hidden`;
const LINKED_TASK_UNAVAILABLE_CHIP_CLASS = `${TASK_TABLE_CHIP_BASE_CLASS} ${TASK_TABLE_INACTIVE_CHIP_CLASS} max-w-full`;
const NODE_HANDLE_CLASS = "absolute h-8 w-8 cursor-crosshair border-0 bg-transparent p-0 opacity-0 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7f67ff]";
const INSPECTOR_SECTION_LABEL_CLASS = "text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8e88a9] dark:text-white/40";
const PATH_PROGRESS_MARKER_COLOR = "#9b8bf0";
const ENDPOINT_MARKER_RADIUS = 34;
const PATH_ENDPOINT_ICON_MAP = {
  bed: Bed,
  "book-open": BookOpen,
  briefcase: Briefcase,
  car: Car,
  home: Home,
  moon: Moon,
  shower: ShowerHead,
  sparkles: Sparkles,
  target: Target,
  utensils: Utensils,
} as const;
const PATH_ENDPOINT_ICON_OPTIONS: Array<{ id: PathEndpointIconId; label: string }> = [
  { id: "target", label: "Target" },
  { id: "bed", label: "Bed" },
  { id: "shower", label: "Shower" },
  { id: "briefcase", label: "Work" },
  { id: "home", label: "Home" },
  { id: "sparkles", label: "Clean Room" },
  { id: "utensils", label: "Kitchen" },
  { id: "book-open", label: "Study" },
  { id: "car", label: "Leave Home" },
  { id: "moon", label: "Sleep" },
];
const NODE_HANDLE_SIDES: PathNodeHandleSide[] = ["top", "right", "bottom", "left"];

function cubicBezierPoint(start: number, controlA: number, controlB: number, end: number, t: number) {
  const inverse = 1 - t;
  return (inverse ** 3 * start) + (3 * inverse ** 2 * t * controlA) + (3 * inverse * t ** 2 * controlB) + (t ** 3 * end);
}

function cubicBezierTangent(start: number, controlA: number, controlB: number, end: number, t: number) {
  const inverse = 1 - t;
  return (3 * inverse ** 2 * (controlA - start))
    + (6 * inverse * t * (controlB - controlA))
    + (3 * t ** 2 * (end - controlB));
}

function getConnectionMarkerOffsets(startX: number, startY: number, endX: number, endY: number) {
  const distance = Math.hypot(endX - startX, endY - startY);
  if (distance < 220) {
    return [0.38, 0.68];
  }
  if (distance < 360) {
    return [0.28, 0.5, 0.72];
  }
  return [0.22, 0.42, 0.62, 0.8];
}

function buildConnectionSegment({
  endX,
  endY,
  id,
  sourceCompleted,
  startSide,
  startX,
  startY,
  endSide,
}: {
  endSide?: PathNodeHandleSide;
  endX: number;
  endY: number;
  id: string;
  sourceCompleted: boolean;
  startSide: PathNodeHandleSide;
  startX: number;
  startY: number;
}) {
  const controlOffset = Math.max(48, Math.min(140, Math.hypot(endX - startX, endY - startY) * 0.34));
  const startControl = getBezierControlPoint(startX, startY, startSide, controlOffset);
  const endControl = endSide ? getBezierControlPoint(endX, endY, endSide, controlOffset) : { x: endX, y: endY };

  return {
    controlAX: startControl.x,
    controlAY: startControl.y,
    controlBX: endControl.x,
    controlBY: endControl.y,
    endX,
    endY,
    id,
    sourceCompleted,
    startX,
    startY,
  };
}

function getBezierControlPoint(x: number, y: number, side: PathNodeHandleSide, offset: number) {
  switch (side) {
    case "bottom":
      return { x, y: y + offset };
    case "left":
      return { x: x - offset, y };
    case "right":
      return { x: x + offset, y };
    case "top":
      return { x, y: y - offset };
  }
}

function getTaskNodeRenderHeight(view: PathsTaskNodeView | null) {
  if (!view || view.kind === "missing") {
    return TASK_NODE_CHIP_ROW_HEIGHT;
  }

  const visibleSteps = [...view.activeSteps, ...view.completedSteps];
  if (visibleSteps.length === 0) {
    return TASK_NODE_CHIP_ROW_HEIGHT;
  }

  const stepBlocksHeight = visibleSteps.reduce((height, step) => {
    const substepsHeight = step.substeps.length > 0
      ? TASK_NODE_HIERARCHY_GAP
        + (step.substeps.length * TASK_NODE_CHIP_ROW_HEIGHT)
        + (Math.max(0, step.substeps.length - 1) * TASK_NODE_HIERARCHY_GAP)
      : 0;
    return height + TASK_NODE_CHIP_ROW_HEIGHT + substepsHeight;
  }, 0);

  return TASK_NODE_CHIP_ROW_HEIGHT
    + TASK_NODE_HIERARCHY_GAP
    + stepBlocksHeight
    + (Math.max(0, visibleSteps.length - 1) * TASK_NODE_HIERARCHY_GAP);
}

function getNodeHandleAnchor(
  node: Pick<PathNode, "position">,
  target: { x: number; y: number },
  options: { bottomOnly?: boolean; height?: number } = {},
) {
  const nodeHeight = options.height ?? NODE_CARD_HEIGHT;
  const centerX = node.position.x + NODE_CARD_WIDTH / 2;
  const centerY = node.position.y + nodeHeight / 2;
  if (options.bottomOnly) {
    return { side: "bottom" as const, x: centerX, y: node.position.y + nodeHeight };
  }
  const deltaX = target.x - centerX;
  const deltaY = target.y - centerY;
  const side: PathNodeHandleSide = Math.abs(deltaX) >= Math.abs(deltaY)
    ? deltaX >= 0 ? "right" : "left"
    : deltaY >= 0 ? "bottom" : "top";

  switch (side) {
    case "bottom":
      return { side, x: centerX, y: node.position.y + nodeHeight };
    case "left":
      return { side, x: node.position.x, y: centerY };
    case "right":
      return { side, x: node.position.x + NODE_CARD_WIDTH, y: centerY };
    case "top":
      return { side, x: centerX, y: node.position.y };
  }
}

function getNodeHandleClassName(side: PathNodeHandleSide) {
  switch (side) {
    case "bottom":
      return `${NODE_HANDLE_CLASS} left-1/2 top-full -translate-x-1/2 -translate-y-1/2`;
    case "left":
      return `${NODE_HANDLE_CLASS} left-0 top-1/2 -translate-x-1/2 -translate-y-1/2`;
    case "right":
      return `${NODE_HANDLE_CLASS} right-0 top-1/2 -translate-y-1/2 translate-x-1/2`;
    case "top":
      return `${NODE_HANDLE_CLASS} left-1/2 top-0 -translate-x-1/2 -translate-y-1/2`;
  }
}

function PathLinkedTaskPill({
  onOpenTask,
  onSetTaskStatus,
  task,
}: {
  onOpenTask?: (taskId: string) => void;
  onSetTaskStatus?: (taskId: string, status: Task["status"]) => void;
  task: LinkedTaskOption;
}) {
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const statusMenuRef = useRef<HTMLSpanElement | null>(null);
  const statusOptions = useMemo(() => getSelectableTaskStatuses(task), [task]);

  useEffect(() => {
    if (!isStatusMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (statusMenuRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsStatusMenuOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isStatusMenuOpen]);

  return (
    <span className="relative inline-flex max-w-full" data-path-node-control ref={statusMenuRef}>
      <span className={LINKED_TASK_CHIP_CLASS}>
        <button
          className="min-w-0 max-w-[190px] truncate text-left text-[13px] font-medium leading-none"
          disabled={!onOpenTask}
          onClick={(event) => {
            event.stopPropagation();
            onOpenTask?.(task.id);
          }}
          title={task.title}
          type="button"
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Link2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{task.title}</span>
          </span>
        </button>
        <button
          aria-label={`Change task status from ${formatTaskStatusLabel(task.status)}`}
          className="flex h-4 w-4 shrink-0 items-center justify-center [&>span]:h-4 [&>span]:w-4"
          onClick={(event) => {
            event.stopPropagation();
            setIsStatusMenuOpen((current) => !current);
          }}
          type="button"
        >
          {renderTaskStatusCircle(task.status, "sm")}
        </button>
      </span>
      {isStatusMenuOpen ? (
        <AdhdDropdownPanel className={`top-[calc(100%+6px)] ${LINKED_TASK_MENU_PANEL_CLASS}`} widthClassName="min-w-[190px]">
          {statusOptions.map((status) => (
            <button
              className={`flex items-center gap-2 rounded-[0.85rem] px-2.5 py-2 text-left text-[13px] font-medium transition ${
                status === task.status
                  ? "bg-[#f3efff] text-[#6f57f6] dark:bg-[#241b42] dark:text-[#cabfff]"
                  : "text-[#5f5878] hover:bg-[#f7f3ff] dark:text-white/72 dark:hover:bg-white/8"
              }`}
              key={status}
              onClick={(event) => {
                event.stopPropagation();
                onSetTaskStatus?.(task.id, status);
                setIsStatusMenuOpen(false);
              }}
              type="button"
            >
              {renderTaskStatusCircle(status, "sm")}
              <span>{formatTaskStatusLabel(status)}</span>
            </button>
          ))}
        </AdhdDropdownPanel>
      ) : null}
    </span>
  );
}

function PathTaskStatusControl({
  onSetTaskStatus,
  task,
}: {
  onSetTaskStatus?: (taskId: string, status: Task["status"]) => void;
  task: Task;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLSpanElement | null>(null);
  const statusOptions = useMemo(() => getSelectableTaskStatuses(task), [task]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  return (
    <span className="relative inline-flex shrink-0" data-path-node-control ref={menuRef}>
      <button
        aria-label={`Change task status from ${formatTaskStatusLabel(task.status)}`}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border-0 bg-transparent p-0 [&>span]:h-5 [&>span]:w-5"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((current) => !current);
        }}
        type="button"
      >
        {renderTaskStatusCircle(task.status, "sm")}
      </button>
      {isOpen ? (
        <AdhdDropdownPanel className={`right-0 top-[calc(100%+6px)] z-50 ${LINKED_TASK_MENU_PANEL_CLASS}`} widthClassName="min-w-[190px]">
          {statusOptions.map((status) => (
            <button
              className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition ${
                status === task.status
                  ? "bg-[#f3efff] text-[#6f57f6] dark:bg-[#241b42] dark:text-[#cabfff]"
                  : "text-[#5f5878] hover:bg-[#f7f3ff] dark:text-white/72 dark:hover:bg-white/8"
              }`}
              key={status}
              onClick={(event) => {
                event.stopPropagation();
                onSetTaskStatus?.(task.id, status);
                setIsOpen(false);
              }}
              type="button"
            >
              {renderTaskStatusCircle(status, "sm")}
              <span>{formatTaskStatusLabel(status)}</span>
            </button>
          ))}
        </AdhdDropdownPanel>
      ) : null}
    </span>
  );
}

function PathTaskHierarchyChip({
  onOpenTask,
  onSetTaskStatus,
  task,
}: {
  onOpenTask?: (taskId: string) => void;
  onSetTaskStatus?: (taskId: string, status: Task["status"]) => void;
  task: Task;
}) {
  return (
    <div className="inline-flex max-w-[250px] items-center gap-0" data-path-node-control>
      <AdhdChip
        className={task.status === "complete" ? "max-w-[210px] line-through opacity-70" : "max-w-[210px]"}
        onClick={(event) => {
          event.stopPropagation();
          onOpenTask?.(task.id);
        }}
      >
        <span className="truncate">{task.title}</span>
      </AdhdChip>
      <span aria-hidden="true" className="h-0.5 w-4 shrink-0 bg-[#b7a8f8] dark:bg-[#7f67ff]" />
      <PathTaskStatusControl onSetTaskStatus={onSetTaskStatus} task={task} />
    </div>
  );
}

function PathTaskNodeStepList({
  onOpenTask,
  onSetTaskStatus,
  steps,
}: {
  onOpenTask?: (taskId: string) => void;
  onSetTaskStatus?: (taskId: string, status: Task["status"]) => void;
  steps: PathsTaskNodeStep[];
}) {
  return (
    <div className="relative ml-4 mt-2 space-y-2 border-l-2 border-[#cfc3f8] pl-5 dark:border-[#5d48ab]">
      {steps.map((step) => (
        <div className="relative" key={step.task.id}>
          <span className="absolute -left-5 top-[13px] h-0.5 w-5 bg-[#cfc3f8] dark:bg-[#5d48ab]" />
          <PathTaskHierarchyChip onOpenTask={onOpenTask} onSetTaskStatus={onSetTaskStatus} task={step.task} />
          {step.substeps.length > 0 ? (
            <div className="relative ml-4 mt-2 space-y-2 border-l-2 border-[#ddd5ef] pl-5 dark:border-white/15">
              {step.substeps.map((substep) => (
                <div className="relative" key={substep.id}>
                  <span className="absolute -left-5 top-[13px] h-0.5 w-5 bg-[#ddd5ef] dark:bg-white/15" />
                  <PathTaskHierarchyChip onOpenTask={onOpenTask} onSetTaskStatus={onSetTaskStatus} task={substep} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function PathTaskNodeCard({
  onOpenTask,
  onSetTaskStatus,
  onUnlink,
  view,
}: {
  onOpenTask?: (taskId: string) => void;
  onSetTaskStatus?: (taskId: string, status: Task["status"]) => void;
  onUnlink: () => void;
  view: PathsTaskNodeView;
}) {
  if (view.kind === "missing") {
    return (
      <div className="inline-flex items-center gap-1.5">
        <span className="cursor-grab text-[#8d86a4] active:cursor-grabbing" data-path-node-drag-surface>
          <GripVertical className="h-4 w-4" />
        </span>
        <AdhdChip icon={<CircleAlert className="h-3.5 w-3.5" />} onClick={onUnlink} tone="danger">
          Task unavailable — relink
        </AdhdChip>
      </div>
    );
  }

  const visibleSteps = [...view.activeSteps, ...view.completedSteps];

  return (
    <div className="relative">
      <div className="inline-flex items-center gap-1.5">
        <span className="cursor-grab text-[#8d86a4] active:cursor-grabbing" data-path-node-drag-surface>
          <GripVertical className="h-4 w-4" />
        </span>
        <PathTaskHierarchyChip onOpenTask={onOpenTask} onSetTaskStatus={onSetTaskStatus} task={view.task} />
      </div>
      {visibleSteps.length > 0 ? (
        <PathTaskNodeStepList onOpenTask={onOpenTask} onSetTaskStatus={onSetTaskStatus} steps={visibleSteps} />
      ) : null}
    </div>
  );
}

function LinkedTaskPicker({
  linkedTaskIds,
  linkedTasks,
  onSelectTask,
}: {
  linkedTaskIds: string[];
  linkedTasks: LinkedTaskOption[];
  onSelectTask: (taskId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const filteredTasks = useMemo(() => {
    return linkedTasks.filter((task) => {
      if (linkedTaskIds.includes(task.id)) {
        return false;
      }
      return matchesLinkableTaskSearch(task, query);
    });
  }, [linkedTaskIds, linkedTasks, query]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (pickerRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  return (
    <div className="relative" ref={pickerRef}>
      <button
        aria-expanded={isOpen}
        className={`${TASK_TABLE_INPUT_CLASS} flex items-center justify-between gap-2 text-left`}
        onClick={() => {
          setQuery("");
          setIsOpen((current) => !current);
        }}
        type="button"
      >
        <span className="min-w-0 truncate">
          {linkedTaskIds.length > 0 ? "Add another linked task" : "Add linked task"}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#8c84aa] transition dark:text-white/50 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen ? (
        <AdhdDropdownPanel className="right-0" widthClassName="left-0 right-0">
          <label className="flex items-center gap-2 rounded-[0.95rem] border border-[#efe9ff] bg-[#fbfaff] px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
            <Search className="h-3.5 w-3.5 shrink-0 text-[#6f57f6] dark:text-[#c9bbff]" />
            <input
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[#27304c] outline-none placeholder:text-[#97a0b9] dark:text-white dark:placeholder:text-white/35"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tasks"
              value={query}
            />
          </label>
          <div className={`mt-2 flex flex-col gap-1 ${LINKED_TASK_MENU_PANEL_CLASS}`}>
            {filteredTasks.length > 0 ? filteredTasks.map((task) => (
              <button
                className={`${TASK_TABLE_CHIP_BASE_CLASS} ${TASK_TABLE_INACTIVE_CHIP_CLASS} w-full justify-between gap-2 text-left transition hover:bg-white dark:hover:bg-white/12`}
                key={task.id}
                onClick={() => {
                  onSelectTask(task.id);
                }}
                type="button"
              >
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  {renderTaskStatusCircle(task.status, "sm")}
                  <span className="truncate">{task.title}</span>
                </span>
                <Plus className="h-3 w-3 shrink-0" />
              </button>
            )) : (
              <div className="rounded-[0.9rem] border border-dashed border-[#e6e0f5] px-3 py-3 text-[13px] text-[#8a84a3] dark:border-white/10 dark:text-white/45">
                No tasks match that search.
              </div>
            )}
          </div>
        </AdhdDropdownPanel>
      ) : null}
    </div>
  );
}

function CanvasTaskPicker({
  availableTaskLists,
  listMembershipsByTaskId,
  onAddPathsNode,
  onSelectTask,
  position,
  tasks,
}: {
  availableTaskLists: TaskListDefinition[];
  listMembershipsByTaskId: Record<string, TaskListMembership[]>;
  onAddPathsNode: () => void;
  onSelectTask: (taskId: string) => void;
  position: { x: number; y: number };
  tasks: LinkedTaskOption[];
}) {
  const [query, setQuery] = useState("");
  const [selectedListId, setSelectedListId] = useState<TaskListId | null>(null);
  const visibleTaskLists = useMemo(
    () => availableTaskLists.filter((list) => list.isVisible),
    [availableTaskLists],
  );
  const normalizedQuery = query.trim();
  const hasDiscoveryScope = normalizedQuery.length > 0 || selectedListId !== null;
  const filteredTasks = useMemo(
    () => hasDiscoveryScope
      ? tasks.filter((task) => {
          if (
            selectedListId
            && !(listMembershipsByTaskId[task.id] ?? []).some((membership) => membership.id === selectedListId)
          ) {
            return false;
          }
          return normalizedQuery.length === 0 || matchesLinkableTaskSearch(task, normalizedQuery);
        })
      : [],
    [hasDiscoveryScope, listMembershipsByTaskId, normalizedQuery, selectedListId, tasks],
  );

  return (
    <AdhdDropdownPanel
      className="top-0 z-50"
      data-paths-task-picker
      style={{ left: position.x, top: position.y }}
      widthClassName="w-[320px]"
    >
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-[0.95rem] border border-[#efe9ff] bg-[#fbfaff] px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
          <Search className="h-3.5 w-3.5 shrink-0 text-[#6f57f6] dark:text-[#c9bbff]" />
          <input
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[#27304c] outline-none placeholder:text-[#97a0b9] dark:text-white dark:placeholder:text-white/35"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Task Chips"
            value={query}
          />
        </label>
        <TaskTableChipButton
          className={TASK_TABLE_ICON_LABEL_GAP_CLASS}
          onClick={onAddPathsNode}
          toneClassName={TASK_TABLE_ACTIVE_LIST_CHIP_CLASS}
        >
          <Plus className="h-3.5 w-3.5" />
          Add PATHS Node
        </TaskTableChipButton>
      </div>
      <div className="adhdice-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-1">
        {visibleTaskLists.map((list) => (
          <AdhdChip
            key={list.id}
            onClick={() => setSelectedListId((current) => current === list.id ? null : list.id)}
            selected={selectedListId === list.id}
          >
            {list.name}
          </AdhdChip>
        ))}
      </div>
      {hasDiscoveryScope ? (
        <div className={`mt-2 flex flex-col gap-1 ${LINKED_TASK_MENU_PANEL_CLASS}`}>
          {filteredTasks.length > 0 ? filteredTasks.map((task) => (
          <AdhdChip
            className="w-full justify-between"
            contentClassName="min-w-0 gap-1.5"
            icon={renderTaskStatusCircle(task.status, "sm")}
            key={task.id}
            onClick={() => onSelectTask(task.id)}
          >
            <span className="truncate">{task.title}</span>
          </AdhdChip>
          )) : (
            <div className="rounded-[0.9rem] border border-dashed border-[#e6e0f5] px-3 py-3 text-[13px] text-[#8a84a3] dark:border-white/10 dark:text-white/45">
              {normalizedQuery ? "No Task Chips match that search." : "No Task Chips are available in this list."}
            </div>
          )}
        </div>
      ) : null}
    </AdhdDropdownPanel>
  );
}

function PathUnavailableLinkedTaskChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <span className={LINKED_TASK_UNAVAILABLE_CHIP_CLASS}>
        {label}
      </span>
      {onRemove ? (
        <button
          aria-label={`Remove ${label.toLowerCase()}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e2daf8] bg-white text-[#6f57f6] transition hover:border-[#cbbcff] dark:border-white/10 dark:bg-white/[0.05] dark:text-[#cabfff]"
          data-path-node-control
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          type="button"
        >
          <Unlink className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </span>
  );
}

function DropdownField({
  compactTrigger = false,
  options,
  placeholder,
  value,
  onSelect,
}: {
  compactTrigger?: boolean;
  onSelect: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  placeholder: string;
  value: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? placeholder;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      {compactTrigger ? (
        <TaskTableChipButton
          aria-expanded={isOpen}
          className="max-w-full gap-1.5"
          onClick={() => setIsOpen((current) => !current)}
          toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}
        >
          <span className="min-w-0 truncate">{selectedLabel}</span>
          <ChevronDown className={`h-3 w-3 shrink-0 text-[#8c84aa] transition dark:text-white/50 ${isOpen ? "rotate-180" : ""}`} />
        </TaskTableChipButton>
      ) : (
        <button
          aria-expanded={isOpen}
          className={`${TASK_TABLE_INPUT_CLASS} flex items-center justify-between gap-2 text-left`}
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <span className="min-w-0 truncate">{selectedLabel}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[#8c84aa] transition dark:text-white/50 ${isOpen ? "rotate-180" : ""}`} />
        </button>
      )}
      {isOpen ? (
        <AdhdDropdownPanel
          className={LINKED_TASK_MENU_PANEL_CLASS}
          widthClassName={compactTrigger ? "left-0 min-w-[280px]" : "left-0 right-0"}
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                className={`flex w-full items-center justify-between gap-2 rounded-[0.9rem] px-3 py-2 text-left text-[13px] font-medium transition ${
                  selected
                    ? "bg-[#f3efff] text-[#6f57f6] dark:bg-[#241b42] dark:text-[#cabfff]"
                    : "text-[#5f5878] hover:bg-[#f7f3ff] dark:text-white/72 dark:hover:bg-white/8"
                }`}
                key={option.value}
                onClick={() => {
                  onSelect(option.value);
                  setIsOpen(false);
                }}
                type="button"
              >
                <span className="truncate">{option.label}</span>
                {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
              </button>
            );
          })}
        </AdhdDropdownPanel>
      ) : null}
    </div>
  );
}

function InspectorSection({
  children,
  isCollapsed,
  onToggle,
  title,
}: {
  children: ReactNode;
  isCollapsed: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <section className="rounded-[1rem] border border-[#ece8f8] bg-white p-3 dark:border-white/10 dark:bg-white/[0.05]">
      <button
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={onToggle}
        type="button"
      >
        <p className={INSPECTOR_SECTION_LABEL_CLASS}>{title}</p>
        {isCollapsed ? <ChevronDown className="h-4 w-4 text-[#8e88a9] dark:text-white/40" /> : <ChevronUp className="h-4 w-4 text-[#8e88a9] dark:text-white/40" />}
      </button>
      {isCollapsed ? null : <div className="mt-3 space-y-3">{children}</div>}
    </section>
  );
}

export function PathsWorkspace({
  availableTaskLists = [],
  listMembershipsByTaskId = {},
  onOpenTask,
  onSetTaskStatus,
  taskDisplayStatusByTaskId = {},
  tasks = [],
  userId,
}: PathsWorkspaceProps) {
  const workspaceUserId = userId ?? LOCAL_PATHS_PROTOTYPE_USER_ID;
  const adapter = useMemo(() => createLocalStoragePathsStorageAdapter({ userId: workspaceUserId }), [workspaceUserId]);
  const [pathRecords, setPathRecords] = useState<PathRecord[]>([]);
  const [progressByPathId, setProgressByPathId] = useState<Record<string, PathProgress>>({});
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectSource, setConnectSource] = useState<PathConnectionSource | null>(null);
  const [isEndpointPlacementMode, setIsEndpointPlacementMode] = useState(false);
  const [expandedNodeIds, setExpandedNodeIds] = useState<string[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Record<InspectorSectionId, boolean>>({
    actions: false,
    endpoint: false,
    path: false,
    selectedChip: false,
  });
  const [canvasContextMenu, setCanvasContextMenu] = useState<{
    canvasX: number;
    canvasY: number;
    viewportX: number;
    viewportY: number;
  } | null>(null);
  const [canvasTaskPicker, setCanvasTaskPicker] = useState<{
    nodePosition: { x: number; y: number };
    panelPosition: { x: number; y: number };
  } | null>(null);
  const [nodeActionMenu, setNodeActionMenu] = useState<{
    nodeId: string;
    position: { x: number; y: number };
  } | null>(null);
  const [nodeRenameDraft, setNodeRenameDraft] = useState("");
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    nodeId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const endpointDragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const nodeLongPressRef = useRef<{
    nodeId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const nodeClickSuppressionRef = useRef<{ nodeId: string; until: number } | null>(null);

  const todayKey = getLocalPathDateKey();
  const allLinkedTasks = useMemo(
    () => Array.from(tasks.reduce<Map<string, LinkedTaskOption>>((taskById, task) => {
      taskById.set(task.id, {
        ...task,
        status: taskDisplayStatusByTaskId[task.id] ?? task.status,
      });
      return taskById;
    }, new Map()).values())
      .sort((left, right) => left.title.localeCompare(right.title)),
    [taskDisplayStatusByTaskId, tasks],
  );
  const linkedTasks = useMemo(
    () => allLinkedTasks.filter((task) => isPathsTaskAvailable(task, allLinkedTasks)),
    [allLinkedTasks],
  );
  const canvasTaskCandidates = useMemo(
    () => linkedTasks.filter((task) => !task.parent_task_id),
    [linkedTasks],
  );
  const linkedTaskById = useMemo(
    () => new Map(allLinkedTasks.map((task) => [task.id, task])),
    [allLinkedTasks],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPaths() {
      const records = await adapter.listPaths({ userId: workspaceUserId });
      if (cancelled) {
        return;
      }

      const progressEntries = await Promise.all(records.map((record) => adapter.getPathProgress({
        dateKey: getProgressDateKey(record.path.pathType, todayKey),
        pathId: record.path.id,
        userId: workspaceUserId,
      })));

      if (cancelled) {
        return;
      }

      setPathRecords(records);
      setProgressByPathId(Object.fromEntries(progressEntries.map((progress) => [progress.pathId, progress])));
      setSelectedPathId((current) => current && records.some((record) => record.path.id === current)
        ? current
        : records.find((record) => !record.path.archivedAt)?.path.id ?? records[0]?.path.id ?? null);
    }

    void loadPaths();

    return () => {
      cancelled = true;
    };
  }, [adapter, todayKey, workspaceUserId]);

  useEffect(() => {
    if (!canvasContextMenu && !canvasTaskPicker && !nodeActionMenu) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if ((event.target as HTMLElement).closest("[data-paths-context-menu], [data-paths-task-picker], [data-paths-node-menu]")) {
        return;
      }
      setCanvasContextMenu(null);
      setCanvasTaskPicker(null);
      setNodeActionMenu(null);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [canvasContextMenu, canvasTaskPicker, nodeActionMenu]);

  useEffect(() => {
    return () => {
      const current = nodeLongPressRef.current;
      if (current) {
        clearTimeout(current.timer);
      }
    };
  }, []);

  const selectedRecord = pathRecords.find((record) => record.path.id === selectedPathId) ?? null;
  const selectedRecordRef = useRef<PathRecord | null>(null);
  const selectedProgress = selectedRecord ? progressByPathId[selectedRecord.path.id] ?? EMPTY_PROGRESS : EMPTY_PROGRESS;
  const completedNodeIds = useMemo(() => new Set(selectedProgress.completedNodeIds), [selectedProgress.completedNodeIds]);
  const selectedNode = selectedRecord?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const nodeActionMenuNode = selectedRecord?.nodes.find((node) => node.id === nodeActionMenu?.nodeId) ?? null;
  const nodeById = useMemo(
    () => new Map((selectedRecord?.nodes ?? []).map((node) => [node.id, node])),
    [selectedRecord?.nodes],
  );
  const taskNodeViewByNodeId = useMemo(
    () => new Map((selectedRecord?.nodes ?? [])
      .filter((node) => node.kind === "task")
      .map((node) => [node.id, buildPathsTaskNodeView(node, allLinkedTasks)])),
    [allLinkedTasks, selectedRecord?.nodes],
  );
  const effectiveCompletedNodeIds = useMemo(
    () => new Set((selectedRecord?.nodes ?? [])
      .filter((node) => {
        const taskNodeView = taskNodeViewByNodeId.get(node.id);
        return isPathsNodeComplete({
          canonicalTaskComplete: taskNodeView?.kind === "task" && taskNodeView.isComplete,
          localPathComplete: completedNodeIds.has(node.id),
          nodeKind: node.kind,
        });
      })
      .map((node) => node.id)),
    [completedNodeIds, selectedRecord?.nodes, taskNodeViewByNodeId],
  );
  const selectedEndpointPosition = selectedRecord ? getPathEndpointRenderPosition(selectedRecord) : null;
  const connectionSegments = useMemo(() => {
    if (!selectedRecord) {
      return [];
    }

    const nodeSegments = selectedRecord.nodes.flatMap((node) => node.nextNodeIds.flatMap((nextNodeId) => {
      const targetNode = nodeById.get(nextNodeId);
      if (!targetNode) {
        return [];
      }

      const sourceHeight = node.kind === "task"
        ? getTaskNodeRenderHeight(taskNodeViewByNodeId.get(node.id) ?? null)
        : NODE_CARD_HEIGHT;
      const targetHeight = targetNode.kind === "task"
        ? getTaskNodeRenderHeight(taskNodeViewByNodeId.get(targetNode.id) ?? null)
        : NODE_CARD_HEIGHT;
      const sourceAnchor = getNodeHandleAnchor(node, {
        x: targetNode.position.x + NODE_CARD_WIDTH / 2,
        y: targetNode.position.y + targetHeight / 2,
      }, { bottomOnly: node.kind === "task", height: sourceHeight });
      const targetAnchor = getNodeHandleAnchor(targetNode, {
        x: node.position.x + NODE_CARD_WIDTH / 2,
        y: node.position.y + sourceHeight / 2,
      }, { bottomOnly: targetNode.kind === "task", height: targetHeight });

      return [buildConnectionSegment({
        endSide: targetAnchor.side,
        endX: targetAnchor.x,
        endY: targetAnchor.y,
        id: `${node.id}-${nextNodeId}`,
        sourceCompleted: effectiveCompletedNodeIds.has(node.id),
        startSide: sourceAnchor.side,
        startX: sourceAnchor.x,
        startY: sourceAnchor.y,
      })];
    }));

    const endpointSegments = selectedEndpointPosition
      ? selectedRecord.path.endpointConnectedNodeIds.flatMap((nodeId) => {
          const node = nodeById.get(nodeId);
          if (!node) {
            return [];
          }

          const nodeHeight = node.kind === "task"
            ? getTaskNodeRenderHeight(taskNodeViewByNodeId.get(node.id) ?? null)
            : NODE_CARD_HEIGHT;
          const sourceAnchor = getNodeHandleAnchor(
            node,
            selectedEndpointPosition,
            { bottomOnly: node.kind === "task", height: nodeHeight },
          );

          return [buildConnectionSegment({
            endX: selectedEndpointPosition.x,
            endY: selectedEndpointPosition.y,
            id: `${node.id}-endpoint`,
            sourceCompleted: effectiveCompletedNodeIds.has(node.id),
            startSide: sourceAnchor.side,
            startX: sourceAnchor.x,
            startY: sourceAnchor.y,
          })];
        })
      : [];

    return [...nodeSegments, ...endpointSegments];
  }, [effectiveCompletedNodeIds, nodeById, selectedEndpointPosition, selectedRecord, taskNodeViewByNodeId]);
  const activePathRecords = pathRecords.filter((record) => !record.path.archivedAt);
  const archivedPathRecords = pathRecords.filter((record) => record.path.archivedAt);

  useEffect(() => {
    selectedRecordRef.current = selectedRecord;
  }, [selectedRecord]);

  async function saveRecord(nextRecord: PathRecord) {
    const saved = await adapter.savePath({ nodes: nextRecord.nodes, path: nextRecord.path });
    if (selectedPathId === saved.path.id) {
      selectedRecordRef.current = saved;
    }
    setPathRecords((current) => [
      ...current.filter((record) => record.path.id !== saved.path.id),
      saved,
    ].sort((left, right) => left.path.sortOrder - right.path.sortOrder || left.path.title.localeCompare(right.path.title)));
    return saved;
  }

  async function createPath() {
    const now = new Date().toISOString();
    const id = createPathId("path");
    const saved = await saveRecord({
      nodes: [],
      path: {
        archivedAt: null,
        createdAt: now,
        description: null,
        endpointConnectedNodeIds: [],
        endpointIcon: null,
        endpointLabel: null,
        endpointPosition: null,
        id,
        pathType: "reset_flow",
        sortOrder: pathRecords.length,
        title: "Untitled path",
        updatedAt: now,
        userId: workspaceUserId,
      },
    });
    setSelectedPathId(saved.path.id);
    setSelectedNodeId(null);
    setConnectSource(null);
    setStatusMessage("Path created.");
  }

  async function updateSelectedPath(patch: Partial<Pick<PathRecord["path"], "description" | "endpointConnectedNodeIds" | "endpointIcon" | "endpointLabel" | "endpointPosition" | "pathType" | "title">>) {
    const currentRecord = selectedRecordRef.current;
    if (!currentRecord) {
      return;
    }

    const saved = await saveRecord({
      ...currentRecord,
      path: {
        ...currentRecord.path,
        ...patch,
        description: patch.description === undefined ? currentRecord.path.description : patch.description?.trim() || null,
        endpointConnectedNodeIds: patch.endpointConnectedNodeIds === undefined
          ? currentRecord.path.endpointConnectedNodeIds
          : [...new Set(patch.endpointConnectedNodeIds)],
        endpointIcon: patch.endpointLabel === undefined
          ? (patch.endpointIcon === undefined ? currentRecord.path.endpointIcon : patch.endpointIcon)
          : (patch.endpointLabel?.trim() ? (patch.endpointIcon ?? currentRecord.path.endpointIcon ?? "target") : null),
        endpointLabel: patch.endpointLabel === undefined ? currentRecord.path.endpointLabel : patch.endpointLabel?.trim() || null,
        endpointPosition: patch.endpointPosition === undefined
          ? currentRecord.path.endpointPosition
          : patch.endpointPosition === null
            ? null
            : clampEndpointPosition(patch.endpointPosition),
        title: patch.title === undefined ? currentRecord.path.title : patch.title.trim() || "Untitled path",
        updatedAt: new Date().toISOString(),
      },
    });
    if (patch.pathType) {
      const progress = await adapter.getPathProgress({
        dateKey: getProgressDateKey(saved.path.pathType, todayKey),
        pathId: saved.path.id,
        userId: workspaceUserId,
      });
      setProgressByPathId((current) => ({ ...current, [saved.path.id]: progress }));
    }
  }

  async function archiveSelectedPath() {
    if (!selectedRecord) {
      return;
    }

    const archived = await adapter.archivePath({
      archivedAt: selectedRecord.path.archivedAt ? null : new Date().toISOString(),
      pathId: selectedRecord.path.id,
      userId: workspaceUserId,
    });
    if (!archived) {
      return;
    }

    setPathRecords((current) => current.map((record) => record.path.id === archived.path.id ? archived : record));
    setStatusMessage(archived.path.archivedAt ? "Path archived." : "Path restored.");
  }

  async function deleteSelectedPath() {
    if (!selectedRecord) {
      return;
    }

    const confirmed = window.confirm(`Delete "${selectedRecord.path.title}"? PATHS progress for this path will also be removed.`);
    if (!confirmed) {
      return;
    }

    const deleted = await adapter.deletePath({ pathId: selectedRecord.path.id, userId: workspaceUserId });
    if (!deleted) {
      return;
    }

    setPathRecords((current) => current.filter((record) => record.path.id !== selectedRecord.path.id));
    setProgressByPathId((current) => {
      const next = { ...current };
      delete next[selectedRecord.path.id];
      return next;
    });
    setSelectedPathId(activePathRecords.find((record) => record.path.id !== selectedRecord.path.id)?.path.id ?? null);
    setStatusMessage("Path deleted.");
  }

  async function addNodeAt(position: { x: number; y: number }) {
    if (!selectedRecord) {
      return;
    }

    const node: PathNode = {
      id: createPathId(`${selectedRecord.path.id}-node`),
      kind: "path",
      linkedTaskIds: [],
      nextNodeIds: [],
      note: null,
      pathId: selectedRecord.path.id,
      position: clampCanvasPosition(position),
      sortOrder: selectedRecord.nodes.length,
      title: "New PATHS Node",
    };
    await saveRecord({
      ...selectedRecord,
      nodes: normalizeNodeOrder([...selectedRecord.nodes, node]),
      path: { ...selectedRecord.path, updatedAt: new Date().toISOString() },
    });
    setSelectedNodeId(node.id);
    setStatusMessage("PATHS Node added.");
  }

  async function addTaskNodeAt(taskId: string, position: { x: number; y: number }) {
    if (!selectedRecord) {
      return;
    }

    const task = linkedTaskById.get(taskId);
    if (!task || !isPathsTaskAvailable(task, allLinkedTasks)) {
      setCanvasTaskPicker(null);
      setStatusMessage("That task is no longer available.");
      return;
    }

    const node = convertPathNodeToTaskNode({
      id: createPathId(`${selectedRecord.path.id}-node`),
      kind: "path",
      linkedTaskIds: [],
      nextNodeIds: [],
      note: null,
      pathId: selectedRecord.path.id,
      position: clampCanvasPosition(position),
      sortOrder: selectedRecord.nodes.length,
      title: task.title,
    }, task.id);
    await saveRecord({
      ...selectedRecord,
      nodes: normalizeNodeOrder([...selectedRecord.nodes, node]),
      path: { ...selectedRecord.path, updatedAt: new Date().toISOString() },
    });
    setCanvasTaskPicker(null);
    setSelectedNodeId(node.id);
    setStatusMessage("Task Chip added.");
  }

  async function updateNode(nodeId: string, patch: Partial<Pick<PathNode, "kind" | "linkedTaskIds" | "nextNodeIds" | "note" | "position" | "title">>) {
    if (!selectedRecord) {
      return;
    }

    await saveRecord({
      ...selectedRecord,
      nodes: selectedRecord.nodes.map((node) => node.id === nodeId
        ? {
            ...node,
            ...patch,
            linkedTaskIds: patch.linkedTaskIds === undefined ? node.linkedTaskIds : [...new Set(patch.linkedTaskIds)],
            nextNodeIds: patch.nextNodeIds === undefined ? node.nextNodeIds : patch.nextNodeIds,
            note: patch.note === undefined ? node.note : patch.note === null ? null : patch.note.trim() || null,
            position: patch.position === undefined ? node.position : clampCanvasPosition(patch.position),
            title: patch.title === undefined ? node.title : patch.title.trim() || "Untitled node",
          }
        : node),
      path: { ...selectedRecord.path, updatedAt: new Date().toISOString() },
    });
  }

  async function deleteNode(nodeId: string) {
    if (!selectedRecord) {
      return;
    }

    setNodeActionMenu(null);
    const nextNodes = normalizeNodeOrder(selectedRecord.nodes.filter((node) => node.id !== nodeId));
    await saveRecord({
      ...selectedRecord,
      nodes: nextNodes.map((node) => ({
        ...node,
        nextNodeIds: node.nextNodeIds.filter((nextNodeId) => nextNodeId !== nodeId),
      })),
      path: { ...selectedRecord.path, updatedAt: new Date().toISOString() },
    });
    setSelectedNodeId((current) => current === nodeId ? null : current);
    setConnectSource((current) => current?.kind === "node" && current.nodeId === nodeId ? null : current);
    if (completedNodeIds.has(nodeId)) {
      await saveProgress([...completedNodeIds].filter((id) => id !== nodeId));
    }
    if (selectedRecord.path.endpointConnectedNodeIds.includes(nodeId)) {
      await updateSelectedPath({
        endpointConnectedNodeIds: selectedRecord.path.endpointConnectedNodeIds.filter((id) => id !== nodeId),
      });
    }
  }

  async function duplicateNode(nodeId: string) {
    if (!selectedRecord) {
      return;
    }

    const source = selectedRecord.nodes.find((node) => node.id === nodeId);
    if (!source) {
      return;
    }

    const duplicate = duplicatePathNode(source, {
      id: createPathId(`${selectedRecord.path.id}-node`),
      position: clampCanvasPosition({ x: source.position.x + 36, y: source.position.y + 36 }),
      sortOrder: selectedRecord.nodes.length,
      title: `${source.title} copy`,
    });
    await saveRecord({
      ...selectedRecord,
      nodes: normalizeNodeOrder([...selectedRecord.nodes, duplicate]),
      path: { ...selectedRecord.path, updatedAt: new Date().toISOString() },
    });
    setSelectedNodeId(duplicate.id);
    setExpandedNodeIds((current) => current.filter((id) => id !== duplicate.id));
    setStatusMessage(source.kind === "task" ? "Task Chip duplicated." : "PATHS Node duplicated.");
  }

  async function connectNodes(sourceNodeId: string, targetNodeId: string) {
    if (!selectedRecord || sourceNodeId === targetNodeId) {
      return;
    }

    const sourceNode = selectedRecord.nodes.find((node) => node.id === sourceNodeId);
    const targetNode = selectedRecord.nodes.find((node) => node.id === targetNodeId);
    if (!sourceNode || !targetNode || sourceNode.nextNodeIds.includes(targetNodeId)) {
      setConnectSource(null);
      return;
    }

    await updateNode(sourceNodeId, { nextNodeIds: [...sourceNode.nextNodeIds, targetNodeId] });
    setConnectSource(null);
    setSelectedNodeId(targetNodeId);
    setStatusMessage("Nodes connected.");
  }

  async function connectEndpointToNode(nodeId: string) {
    const currentRecord = selectedRecordRef.current;
    if (!currentRecord) {
      return;
    }

    if (currentRecord.path.endpointConnectedNodeIds.includes(nodeId)) {
      setSelectedNodeId(nodeId);
      setStatusMessage("That node is already connected to the Endpoint.");
      return;
    }

    await updateSelectedPath({
      endpointConnectedNodeIds: [...currentRecord.path.endpointConnectedNodeIds, nodeId],
    });
    setSelectedNodeId(nodeId);
    setConnectSource({ kind: "endpoint" });
    setStatusMessage("Endpoint connected. Click another node to keep linking, or tap Connect Endpoint again to stop.");
  }

  async function removeConnection(sourceNodeId: string, targetNodeId: string) {
    const sourceNode = selectedRecord?.nodes.find((node) => node.id === sourceNodeId);
    if (!sourceNode) {
      return;
    }

    await updateNode(sourceNodeId, {
      nextNodeIds: sourceNode.nextNodeIds.filter((nextNodeId) => nextNodeId !== targetNodeId),
    });
    setStatusMessage("Connection removed.");
  }

  async function removeEndpointConnection(nodeId: string) {
    if (!selectedRecord) {
      return;
    }

    await updateSelectedPath({
      endpointConnectedNodeIds: selectedRecord.path.endpointConnectedNodeIds.filter((connectedNodeId) => connectedNodeId !== nodeId),
    });
    setStatusMessage("Endpoint connection removed.");
  }

  function updateNodePositionLocally(nodeId: string, position: { x: number; y: number }) {
    if (!selectedRecord) {
      return;
    }

    const nextPosition = clampCanvasPosition(position);
    setPathRecords((current) => current.map((record) => record.path.id === selectedRecord.path.id
      ? {
          ...record,
          nodes: record.nodes.map((node) => node.id === nodeId ? { ...node, position: nextPosition } : node),
        }
      : record));
  }

  async function persistNodePosition(nodeId: string, position: { x: number; y: number }) {
    await updateNode(nodeId, { position });
  }

  async function toggleNodeComplete(nodeId: string) {
    const nextCompleted = completedNodeIds.has(nodeId)
      ? [...completedNodeIds].filter((id) => id !== nodeId)
      : [...completedNodeIds, nodeId];
    await saveProgress(nextCompleted);
  }

  async function saveProgress(completedNodeIdsInput: string[]) {
    if (!selectedRecord) {
      return;
    }

    const progress = await adapter.savePathProgress({
      completedNodeIds: completedNodeIdsInput,
      dateKey: getProgressDateKey(selectedRecord.path.pathType, todayKey),
      pathId: selectedRecord.path.id,
      userId: workspaceUserId,
    });
    setProgressByPathId((current) => ({ ...current, [selectedRecord.path.id]: progress }));
  }

  const completedCount = selectedRecord?.nodes.filter((node) => effectiveCompletedNodeIds.has(node.id)).length ?? 0;
  const totalCount = selectedRecord?.nodes.length ?? 0;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  function toggleNodeTaskExpansion(nodeId: string) {
    setExpandedNodeIds((current) => current.includes(nodeId)
      ? current.filter((id) => id !== nodeId)
      : [...current, nodeId]);
  }

  function toggleInspectorSection(sectionId: InspectorSectionId) {
    setCollapsedSections((current) => ({ ...current, [sectionId]: !current[sectionId] }));
  }

  function updateEndpointPositionLocally(position: { x: number; y: number }) {
    if (!selectedRecord) {
      return;
    }

    const nextPosition = clampEndpointPosition(position);
    setPathRecords((current) => current.map((record) => record.path.id === selectedRecord.path.id
      ? {
          ...record,
          path: {
            ...record.path,
            endpointPosition: nextPosition,
          },
        }
      : record));
  }

  async function placeEndpointAt(position: { x: number; y: number }) {
    if (!selectedRecord) {
      return;
    }

    setCanvasContextMenu(null);
    setIsEndpointPlacementMode(false);
    const normalizedPosition = clampEndpointPosition(position);
    updateEndpointPositionLocally(normalizedPosition);
    await updateSelectedPath({
      endpointIcon: selectedRecord.path.endpointIcon ?? "target",
      endpointLabel: selectedRecord.path.endpointLabel ?? "Destination",
      endpointPosition: normalizedPosition,
    });
    setStatusMessage(selectedRecord.path.endpointPosition ? "Endpoint moved." : "Endpoint placed.");
  }

  function beginEndpointPlacement() {
    if (!selectedRecord) {
      return;
    }

    setCanvasContextMenu(null);
    setConnectSource(null);
    setSelectedNodeId(null);
    setIsEndpointPlacementMode(true);
    setStatusMessage(selectedRecord.path.endpointPosition ? "Tap blank canvas space to move the Endpoint." : "Tap blank canvas space to place the Endpoint.");
  }

  function openNodeActionMenu(node: PathNode, clientX: number, clientY: number) {
    const canvasPoint = getCanvasCoordinatePoint(clientX, clientY, canvasRef.current, canvasZoom);
    setCanvasContextMenu(null);
    setCanvasTaskPicker(null);
    setSelectedNodeId(node.id);
    setNodeRenameDraft(node.title);
    setNodeActionMenu({
      nodeId: node.id,
      position: {
        x: clampNumber(canvasPoint.x, 12, CANVAS_WIDTH - 252),
        y: clampNumber(canvasPoint.y, 12, CANVAS_HEIGHT - (node.kind === "path" ? 150 : 96)),
      },
    });
  }

  function beginNodeLongPress(node: PathNode, pointerId: number, clientX: number, clientY: number) {
    const current = nodeLongPressRef.current;
    if (current) {
      clearTimeout(current.timer);
    }
    const timer = setTimeout(() => {
      nodeLongPressRef.current = null;
      dragRef.current = null;
      nodeClickSuppressionRef.current = { nodeId: node.id, until: Date.now() + 1_000 };
      openNodeActionMenu(node, clientX, clientY);
    }, NODE_LONG_PRESS_DURATION_MS);
    nodeLongPressRef.current = {
      nodeId: node.id,
      pointerId,
      startClientX: clientX,
      startClientY: clientY,
      timer,
    };
  }

  function updateNodeLongPress(pointerId: number, clientX: number, clientY: number) {
    const current = nodeLongPressRef.current;
    if (!current || current.pointerId !== pointerId) {
      return;
    }
    if (
      Math.abs(clientX - current.startClientX) <= NODE_LONG_PRESS_MOVE_TOLERANCE
      && Math.abs(clientY - current.startClientY) <= NODE_LONG_PRESS_MOVE_TOLERANCE
    ) {
      return;
    }
    clearTimeout(current.timer);
    nodeLongPressRef.current = null;
  }

  function endNodeLongPress(pointerId: number) {
    const current = nodeLongPressRef.current;
    if (!current || current.pointerId !== pointerId) {
      return;
    }
    clearTimeout(current.timer);
    nodeLongPressRef.current = null;
  }

  return (
    <section className="mt-4">
      <div className="mx-auto max-w-[1480px] space-y-3">
        <div className="rounded-[1.35rem] border border-[#ece8f8] bg-white/92 shadow-[0_18px_48px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0ecfa] px-4 py-3 dark:border-white/10">
            <div className="flex min-w-[260px] flex-1 flex-wrap items-center gap-2">
              <div className="max-w-[320px]">
                <DropdownField
                  compactTrigger
                  onSelect={(value) => {
                    setSelectedPathId(value || null);
                    setSelectedNodeId(null);
                    setConnectSource(null);
                    setNodeActionMenu(null);
                  }}
                  options={[...activePathRecords, ...archivedPathRecords].map((record) => ({
                    label: `${record.path.title}${record.path.endpointLabel ? ` -> ${record.path.endpointLabel}` : ""}${record.path.archivedAt ? " (archived)" : ""}`,
                    value: record.path.id,
                  }))}
                  placeholder="Select a path"
                  value={selectedPathId}
                />
              </div>
              <span className="rounded-full border border-[#dff0e5] bg-[#f2fbf5] px-2 py-1 text-[13px] font-medium leading-none text-[#4b7f5b] dark:border-[#2d5a3c] dark:bg-[#102516] dark:text-[#9dd9ad]">
                Saved locally
              </span>
              {selectedRecord ? (
                <span className="rounded-full border border-[#e4deef] bg-[#f4f5f8] px-2 py-1 text-[13px] font-medium leading-none text-[#68738c] dark:border-white/10 dark:bg-white/8 dark:text-white/60">
                  {completedCount}/{totalCount} Steps · {progressPercent}%
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <TaskTableChipButton onClick={() => { void createPath(); }} toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}>
                Create new path
              </TaskTableChipButton>
              <TaskTableChipButton
                disabled={!selectedNode}
                onClick={() => {
                  if (!selectedNode) {
                    return;
                  }
                  setConnectSource({ kind: "node", nodeId: selectedNode.id });
                  setStatusMessage("Click a target node or Endpoint to connect.");
                }}
                toneClassName={connectSource?.kind === "node" ? TASK_TABLE_ACTIVE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}
              >
                <Link2 className="mr-1 h-3.5 w-3.5" />
                Connect
              </TaskTableChipButton>
              <TaskTableChipButton disabled={!selectedRecord} onClick={() => { void saveProgress([]); }} toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Reset
              </TaskTableChipButton>
            </div>
          </div>

          <div className="grid h-[720px] min-h-0 gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="relative min-w-0">
              {selectedRecord ? (
                <>
                  <div className="absolute right-4 top-4 z-50 flex items-center gap-1 rounded-full border border-[#e5ddf8] bg-white/95 p-1 shadow-[0_12px_30px_rgba(81,61,168,0.12)] backdrop-blur dark:border-white/12 dark:bg-[#1b1530]/95">
                    <AdhdIconButton
                      aria-label="Zoom out"
                      disabled={canvasZoom <= CANVAS_ZOOM_MIN}
                      onClick={() => setCanvasZoom((current) => Math.max(CANVAS_ZOOM_MIN, Number((current - CANVAS_ZOOM_STEP).toFixed(1))))}
                      size="sm"
                    >
                      <Minus />
                    </AdhdIconButton>
                    <AdhdChip
                      aria-label="Reset map zoom"
                      className="min-w-[54px]"
                      onClick={() => setCanvasZoom(1)}
                    >
                      {Math.round(canvasZoom * 100)}%
                    </AdhdChip>
                    <AdhdIconButton
                      aria-label="Zoom in"
                      disabled={canvasZoom >= CANVAS_ZOOM_MAX}
                      onClick={() => setCanvasZoom((current) => Math.min(CANVAS_ZOOM_MAX, Number((current + CANVAS_ZOOM_STEP).toFixed(1))))}
                      size="sm"
                    >
                      <Plus />
                    </AdhdIconButton>
                  </div>
                  <div className="adhdice-scrollbar relative h-full overflow-auto bg-[#fdfcff] dark:bg-[#100d1b]" ref={canvasViewportRef}>
                  <div
                    className="relative min-h-[720px] min-w-[1180px] cursor-crosshair overflow-visible"
                    onClick={(event) => {
                      if (event.target !== event.currentTarget) {
                        return;
                      }
                      setCanvasContextMenu(null);
                      if (isEndpointPlacementMode) {
                        void placeEndpointAt(getCanvasCoordinatePoint(event.clientX, event.clientY, canvasRef.current, canvasZoom));
                        return;
                      }
                      const canvasPoint = getCanvasCoordinatePoint(event.clientX, event.clientY, canvasRef.current, canvasZoom);
                      setCanvasTaskPicker({
                        nodePosition: getCanvasPoint(event.clientX, event.clientY, canvasRef.current, canvasZoom),
                        panelPosition: {
                          x: clampNumber(canvasPoint.x, 12, CANVAS_WIDTH - 332),
                          y: clampNumber(canvasPoint.y, 12, CANVAS_HEIGHT - 340),
                        },
                      });
                    }}
                    onContextMenu={(event) => {
                      if (event.target !== event.currentTarget) {
                        return;
                      }

                      event.preventDefault();
                      setCanvasTaskPicker(null);
                      const viewportRect = canvasViewportRef.current?.getBoundingClientRect();
                      const scrollLeft = canvasViewportRef.current?.scrollLeft ?? 0;
                      const scrollTop = canvasViewportRef.current?.scrollTop ?? 0;
                      setCanvasContextMenu({
                        canvasX: getCanvasCoordinatePoint(event.clientX, event.clientY, canvasRef.current, canvasZoom).x,
                        canvasY: getCanvasCoordinatePoint(event.clientX, event.clientY, canvasRef.current, canvasZoom).y,
                        viewportX: viewportRect ? (event.clientX - viewportRect.left + scrollLeft) / canvasZoom : 0,
                        viewportY: viewportRect ? (event.clientY - viewportRect.top + scrollTop) / canvasZoom : 0,
                      });
                    }}
                    ref={canvasRef}
                    style={{
                      backgroundImage: "radial-gradient(circle, rgba(111,87,246,0.18) 1px, transparent 1.5px)",
                      backgroundSize: "28px 28px",
                      zoom: canvasZoom,
                    }}
                  >
                    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
                      {connectionSegments.map((segment) => (
                        <path
                          className="drop-shadow-[0_1px_1px_rgba(111,87,246,0.14)]"
                          d={`M ${segment.startX} ${segment.startY} C ${segment.controlAX} ${segment.controlAY}, ${segment.controlBX} ${segment.controlBY}, ${segment.endX} ${segment.endY}`}
                          fill="none"
                          key={segment.id}
                          stroke="#b7a8f8"
                          strokeLinecap="round"
                          strokeWidth="2"
                        />
                      ))}
                    </svg>
                    {connectionSegments.flatMap((segment) => {
                      if (!segment.sourceCompleted) {
                        return [];
                      }

                      return getConnectionMarkerOffsets(segment.startX, segment.startY, segment.endX, segment.endY).map((offset, index) => {
                        const x = cubicBezierPoint(segment.startX, segment.controlAX, segment.controlBX, segment.endX, offset);
                        const y = cubicBezierPoint(segment.startY, segment.controlAY, segment.controlBY, segment.endY, offset);
                        const tangentX = cubicBezierTangent(segment.startX, segment.controlAX, segment.controlBX, segment.endX, offset);
                        const tangentY = cubicBezierTangent(segment.startY, segment.controlAY, segment.controlBY, segment.endY, offset);
                        const rotation = Math.atan2(tangentY, tangentX) * (180 / Math.PI);

                        return (
                          <span
                            className="pointer-events-none absolute z-[1] opacity-80"
                            key={`${segment.id}-marker-${offset}`}
                            style={{
                              left: x,
                              top: y,
                              transform: `translate(-50%, -50%) rotate(${rotation + (index % 2 === 0 ? 0 : 10)}deg)`,
                            }}
                          >
                            <Footprints className="h-3.5 w-3.5" style={{ color: PATH_PROGRESS_MARKER_COLOR }} />
                          </span>
                        );
                      });
                    })}

                    {selectedRecord.nodes.length === 0 ? (
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                        <AdhdChip
                          className="gap-1.5 border-dashed px-4 py-3 text-sm shadow-[0_16px_40px_rgba(111,87,246,0.12)]"
                          icon={<Plus className="h-4 w-4" />}
                          onClick={(event) => {
                            event.stopPropagation();
                            setCanvasTaskPicker({
                              nodePosition: { x: 464, y: 282 },
                              panelPosition: { x: 430, y: 238 },
                            });
                          }}
                          tone="purple"
                        >
                          Click canvas to choose a task.
                        </AdhdChip>
                      </div>
                    ) : null}

                    {selectedEndpointPosition && (selectedRecord.path.endpointLabel || selectedRecord.path.endpointIcon) ? (
                      <div
                        className="absolute z-10"
                        style={{ left: selectedEndpointPosition.x, top: selectedEndpointPosition.y, transform: "translate(-50%, -50%)" }}
                      >
                        <button
                          className={`group flex flex-col items-center gap-2 ${connectSource?.kind === "endpoint" ? "outline outline-2 outline-offset-4 outline-[#6f57f6]" : ""}`}
                          data-path-node-control
                          onClick={(event) => {
                            event.stopPropagation();
                            if (connectSource?.kind === "node") {
                              void connectEndpointToNode(connectSource.nodeId);
                              return;
                            }
                            if (connectSource?.kind === "endpoint") {
                              setStatusMessage("Endpoint connection mode is active. Click nodes to connect them.");
                              return;
                            }
                            setSelectedNodeId(null);
                          }}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            endpointDragRef.current = {
                              pointerId: event.pointerId,
                              startClientX: event.clientX,
                              startClientY: event.clientY,
                              startX: selectedEndpointPosition.x,
                              startY: selectedEndpointPosition.y,
                            };
                            event.currentTarget.setPointerCapture(event.pointerId);
                          }}
                          onPointerMove={(event) => {
                            const drag = endpointDragRef.current;
                            if (!drag || drag.pointerId !== event.pointerId) {
                              return;
                            }
                            updateEndpointPositionLocally({
                              x: drag.startX + (event.clientX - drag.startClientX) / canvasZoom,
                              y: drag.startY + (event.clientY - drag.startClientY) / canvasZoom,
                            });
                          }}
                          onPointerUp={(event) => {
                            const drag = endpointDragRef.current;
                            if (!drag || drag.pointerId !== event.pointerId) {
                              return;
                            }
                            const nextPosition = clampEndpointPosition({
                              x: drag.startX + (event.clientX - drag.startClientX) / canvasZoom,
                              y: drag.startY + (event.clientY - drag.startClientY) / canvasZoom,
                            });
                            endpointDragRef.current = null;
                            event.currentTarget.releasePointerCapture(event.pointerId);
                            updateEndpointPositionLocally(nextPosition);
                            void updateSelectedPath({ endpointPosition: nextPosition });
                          }}
                          onPointerCancel={() => {
                            endpointDragRef.current = null;
                          }}
                          type="button"
                        >
                          <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full border border-[#d8ccff] bg-white shadow-[0_22px_40px_rgba(81,61,168,0.16)] transition group-hover:-translate-y-0.5 dark:border-[#5d48ab] dark:bg-[#1a1330]">
                            {renderPathEndpointIcon(selectedRecord.path.endpointIcon, "h-7 w-7 text-[#6f57f6] dark:text-[#cabfff]")}
                          </span>
                          <span className="max-w-[180px] rounded-full border border-[#ece4ff] bg-white/96 px-3 py-1.5 text-center text-[12px] font-semibold text-[#4c4567] shadow-[0_10px_22px_rgba(34,24,74,0.10)] dark:border-white/10 dark:bg-[#1d1731]/96 dark:text-white/80">
                            {selectedRecord.path.endpointLabel ?? "Destination"}
                          </span>
                        </button>
                      </div>
                    ) : null}

                    {selectedRecord.nodes.map((node) => {
                      const linkedTasksForNode = node.linkedTaskIds.map((taskId) => linkedTaskById.get(taskId) ?? null);
                      const linkedTaskCount = node.linkedTaskIds.length;
                      const expandedLinkedTasks = expandedNodeIds.includes(node.id);
                      const taskNodeView = taskNodeViewByNodeId.get(node.id) ?? null;
                      const isTaskNode = node.kind === "task";
                      const taskNodeHeight = isTaskNode ? getTaskNodeRenderHeight(taskNodeView) : NODE_CARD_HEIGHT;
                      const isComplete = effectiveCompletedNodeIds.has(node.id);
                      const isSelected = node.id === selectedNodeId;
                      const isConnectSource = connectSource?.kind === "node" && node.id === connectSource.nodeId;

                      return (
                        <div
                          className={`absolute select-none transition ${isTaskNode ? "border-transparent bg-transparent shadow-none" : "rounded-[1rem] border bg-white/95 p-3 shadow-[0_18px_42px_rgba(81,61,168,0.10)] dark:bg-[#1b152d]/95"} ${isSelected && !isTaskNode ? "border-[#7f67ff] ring-4 ring-[#ddd4ff]" : !isTaskNode ? "border-[#ece8f8]" : ""} ${isComplete ? "opacity-75" : ""} ${isConnectSource && !isTaskNode ? "outline outline-2 outline-offset-2 outline-[#6f57f6]" : ""}`}
                          key={node.id}
                          onClickCapture={(event) => {
                            const suppression = nodeClickSuppressionRef.current;
                            if (!suppression || suppression.nodeId !== node.id) {
                              return;
                            }
                            if (Date.now() > suppression.until) {
                              nodeClickSuppressionRef.current = null;
                              return;
                            }
                            nodeClickSuppressionRef.current = null;
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            openNodeActionMenu(node, event.clientX, event.clientY);
                          }}
                          onClick={() => {
                            if (connectSource?.kind === "node") {
                              void connectNodes(connectSource.nodeId, node.id);
                              return;
                            }
                            if (connectSource?.kind === "endpoint") {
                              void connectEndpointToNode(node.id);
                              return;
                            }
                            setSelectedNodeId(node.id);
                          }}
                          onPointerCancelCapture={(event) => endNodeLongPress(event.pointerId)}
                          onPointerDownCapture={(event) => {
                            if (event.button !== 0) {
                              return;
                            }
                            beginNodeLongPress(node, event.pointerId, event.clientX, event.clientY);
                          }}
                          onPointerMoveCapture={(event) => updateNodeLongPress(event.pointerId, event.clientX, event.clientY)}
                          onPointerUpCapture={(event) => endNodeLongPress(event.pointerId)}
                          onPointerDown={(event) => {
                            if ((event.target as HTMLElement).closest("[data-path-node-control]")) {
                              return;
                            }
                            if (isTaskNode && !(event.target as HTMLElement).closest("[data-path-node-drag-surface]")) {
                              return;
                            }
                            setSelectedNodeId(node.id);
                            dragRef.current = {
                              nodeId: node.id,
                              pointerId: event.pointerId,
                              startClientX: event.clientX,
                              startClientY: event.clientY,
                              startX: node.position.x,
                              startY: node.position.y,
                            };
                            event.currentTarget.setPointerCapture(event.pointerId);
                          }}
                          onPointerMove={(event) => {
                            const drag = dragRef.current;
                            if (!drag || drag.nodeId !== node.id || drag.pointerId !== event.pointerId) {
                              return;
                            }
                            updateNodePositionLocally(node.id, {
                              x: drag.startX + (event.clientX - drag.startClientX) / canvasZoom,
                              y: drag.startY + (event.clientY - drag.startClientY) / canvasZoom,
                            });
                          }}
                          onPointerUp={(event) => {
                            const drag = dragRef.current;
                            if (!drag || drag.nodeId !== node.id || drag.pointerId !== event.pointerId) {
                              return;
                            }
                            const nextPosition = clampCanvasPosition({
                              x: drag.startX + (event.clientX - drag.startClientX) / canvasZoom,
                              y: drag.startY + (event.clientY - drag.startClientY) / canvasZoom,
                            });
                            dragRef.current = null;
                            event.currentTarget.releasePointerCapture(event.pointerId);
                            updateNodePositionLocally(node.id, nextPosition);
                            void persistNodePosition(node.id, nextPosition);
                          }}
                          onPointerCancel={(event) => {
                            const drag = dragRef.current;
                            if (!drag || drag.nodeId !== node.id || drag.pointerId !== event.pointerId) {
                              return;
                            }
                            dragRef.current = null;
                          }}
                          style={{ height: taskNodeHeight, left: node.position.x, top: node.position.y, width: NODE_CARD_WIDTH }}
                        >
                          {isTaskNode && taskNodeView ? (
                            <PathTaskNodeCard
                              onOpenTask={onOpenTask}
                              onSetTaskStatus={onSetTaskStatus}
                              onUnlink={() => {
                                const pathNode = convertTaskNodeToPathNode(node);
                                void updateNode(node.id, { kind: pathNode.kind, linkedTaskIds: pathNode.linkedTaskIds });
                              }}
                              view={taskNodeView}
                            />
                          ) : (
                          <>
                            <div className="flex items-start gap-2">
                            <button
                              aria-label={isComplete ? "Mark PATHS Node incomplete" : "Mark PATHS Node complete"}
                              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${isComplete ? "border-[#6f57f6] bg-[#6f57f6] text-white" : "border-[#ddd2ff] bg-[#f7f3ff] text-[#6f57f6]"} dark:border-white/15 dark:bg-white/8`}
                              data-path-node-control
                              onClick={(event) => {
                                event.stopPropagation();
                                void toggleNodeComplete(node.id);
                              }}
                              type="button"
                            >
                              {isComplete ? <Check className="h-4 w-4" /> : <Footprints className="h-3.5 w-3.5" />}
                            </button>
                            <div className="min-w-0 flex-1">
                              <p className={`truncate text-[13px] font-bold leading-5 ${isComplete ? "text-[#8a84a3] line-through" : "text-[#2f294a]"} dark:text-white`}>
                                {node.title}
                              </p>
                              {node.note ? (
                                <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-[#7a7592] dark:text-white/55">{node.note}</p>
                              ) : null}
                              {linkedTaskCount > 0 ? (
                                <TaskTableChipButton
                                  className="mt-2 gap-1"
                                  data-path-node-control
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleNodeTaskExpansion(node.id);
                                  }}
                                  toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}
                                >
                                  <Link2 className="h-3 w-3" />
                                  <span>{linkedTaskCount} linked task{linkedTaskCount === 1 ? "" : "s"}</span>
                                  {expandedLinkedTasks ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </TaskTableChipButton>
                              ) : null}
                            </div>
                            </div>
                            {expandedLinkedTasks && linkedTaskCount > 0 ? (
                              <AdhdDropdownPanel className={`left-3 right-3 top-[calc(100%+8px)] ${LINKED_TASK_LIST_PANEL_CLASS}`} widthClassName="">
                                {linkedTasksForNode.map((task, index) => {
                                  const taskId = node.linkedTaskIds[index] ?? "";
                                  return task && !task.trashed_at ? (
                                    <PathLinkedTaskPill key={taskId} onOpenTask={onOpenTask} onSetTaskStatus={onSetTaskStatus} task={task} />
                                  ) : (
                                    <PathUnavailableLinkedTaskChip
                                      key={taskId}
                                      label={task?.trashed_at ? "Linked task trashed" : "Linked task unavailable"}
                                      onRemove={() => { void updateNode(node.id, { linkedTaskIds: node.linkedTaskIds.filter((id) => id !== taskId) }); }}
                                    />
                                  );
                                })}
                              </AdhdDropdownPanel>
                            ) : null}
                          </>
                          )}
                          {isTaskNode ? (
                            <button
                              aria-label={`Connect after ${taskNodeView?.kind === "task" ? taskNodeView.task.title : node.title}`}
                              className="absolute left-1/2 top-full h-8 w-12 -translate-x-1/2 -translate-y-1/2 cursor-crosshair border-0 bg-transparent p-0 opacity-0 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7f67ff]"
                              data-path-node-control
                              onClick={(event) => {
                                event.stopPropagation();
                                if (connectSource?.kind === "node") {
                                  void connectNodes(connectSource.nodeId, node.id);
                                  return;
                                }
                                if (connectSource?.kind === "endpoint") {
                                  void connectEndpointToNode(node.id);
                                  return;
                                }
                                setSelectedNodeId(node.id);
                                setConnectSource({ kind: "node", nodeId: node.id });
                                setStatusMessage("Click a target node or Endpoint to connect.");
                              }}
                              type="button"
                            />
                          ) : NODE_HANDLE_SIDES.map((side) => (
                            <button
                              aria-label={`Connect ${side} side of ${node.title}`}
                              className={getNodeHandleClassName(side)}
                              data-path-node-control
                              key={side}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (connectSource?.kind === "node") {
                                  void connectNodes(connectSource.nodeId, node.id);
                                  return;
                                }
                                if (connectSource?.kind === "endpoint") {
                                  void connectEndpointToNode(node.id);
                                  return;
                                }
                                setSelectedNodeId(node.id);
                                setConnectSource({ kind: "node", nodeId: node.id });
                                setStatusMessage("Click a target node or Endpoint to connect.");
                              }}
                              type="button"
                            />
                          ))}
                        </div>
                      );
                    })}

                    {nodeActionMenu && nodeActionMenuNode ? (
                      <AdhdDropdownPanel
                        className="absolute z-50"
                        data-paths-node-menu
                        style={{
                          left: nodeActionMenu.position.x,
                          top: nodeActionMenu.position.y,
                        }}
                        widthClassName="w-[280px]"
                      >
                        {nodeActionMenuNode.kind === "path" ? (
                          <div className="flex items-center gap-2">
                            <input
                              autoFocus
                              className={TASK_TABLE_INPUT_CLASS}
                              onChange={(event) => setNodeRenameDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter") {
                                  return;
                                }
                                event.preventDefault();
                                void updateNode(nodeActionMenuNode.id, { title: nodeRenameDraft });
                                setNodeActionMenu(null);
                              }}
                              placeholder="Rename PATHS Node"
                              value={nodeRenameDraft}
                            />
                            <AdhdChip
                              disabled={!nodeRenameDraft.trim()}
                              onClick={() => {
                                void updateNode(nodeActionMenuNode.id, { title: nodeRenameDraft });
                                setNodeActionMenu(null);
                              }}
                              tone="purple"
                            >
                              Save
                            </AdhdChip>
                          </div>
                        ) : null}
                        <div className={nodeActionMenuNode.kind === "path" ? "mt-2 flex flex-wrap gap-2" : "flex flex-wrap gap-2"}>
                          <AdhdChip
                            contentClassName={TASK_TABLE_ICON_LABEL_GAP_CLASS}
                            icon={<Link2 className="h-3 w-3" />}
                            onClick={() => {
                              setSelectedNodeId(nodeActionMenuNode.id);
                              setConnectSource({ kind: "node", nodeId: nodeActionMenuNode.id });
                              setNodeActionMenu(null);
                              setStatusMessage("Click a target node or Endpoint to connect.");
                            }}
                            tone="purple"
                          >
                            Connect
                          </AdhdChip>
                          <AdhdChip
                            contentClassName={TASK_TABLE_ICON_LABEL_GAP_CLASS}
                            icon={<Trash2 className="h-3 w-3" />}
                            onClick={() => {
                              setNodeActionMenu(null);
                              void deleteNode(nodeActionMenuNode.id);
                            }}
                            tone="danger"
                          >
                            Delete
                          </AdhdChip>
                        </div>
                      </AdhdDropdownPanel>
                    ) : null}

                    {canvasContextMenu ? (
                      <AdhdDropdownPanel
                        className={`${LINKED_TASK_MENU_PANEL_CLASS} absolute z-30 w-[220px]`}
                        data-paths-context-menu
                        style={{
                          left: Math.max(12, Math.min(canvasContextMenu.viewportX, (canvasViewportRef.current?.scrollLeft ?? 0) + (canvasViewportRef.current?.clientWidth ?? 240) - 232)),
                          top: Math.max(12, Math.min(canvasContextMenu.viewportY, (canvasViewportRef.current?.scrollTop ?? 0) + (canvasViewportRef.current?.clientHeight ?? 120) - 88)),
                        }}
                      >
                        <button
                          className="flex w-full items-center gap-2 rounded-[0.9rem] px-3 py-2 text-left text-[13px] font-medium text-[#5f5878] transition hover:bg-[#f7f3ff] dark:text-white/72 dark:hover:bg-white/8"
                          onClick={() => { void placeEndpointAt({ x: canvasContextMenu.canvasX, y: canvasContextMenu.canvasY }); }}
                          type="button"
                        >
                          {renderPathEndpointIcon(selectedRecord.path.endpointIcon ?? "target", "h-4 w-4 shrink-0 text-[#6f57f6] dark:text-[#cabfff]")}
                          <span>{selectedRecord.path.endpointPosition ? "Move Endpoint here" : "Place Endpoint here"}</span>
                        </button>
                      </AdhdDropdownPanel>
                    ) : null}
                    {canvasTaskPicker ? (
                      <CanvasTaskPicker
                        availableTaskLists={availableTaskLists}
                        listMembershipsByTaskId={listMembershipsByTaskId}
                        onAddPathsNode={() => {
                          const position = canvasTaskPicker.nodePosition;
                          setCanvasTaskPicker(null);
                          void addNodeAt(position);
                        }}
                        onSelectTask={(taskId) => {
                          void addTaskNodeAt(taskId, canvasTaskPicker.nodePosition);
                        }}
                        position={canvasTaskPicker.panelPosition}
                        tasks={canvasTaskCandidates}
                      />
                    ) : null}
                  </div>
                  </div>
                </>
              ) : (
                <div className="flex h-[720px] items-center justify-center bg-[#fdfcff] p-6 dark:bg-[#100d1b]">
                  <div className="rounded-[1rem] border border-dashed border-[#d8d1ea] bg-white/88 p-6 text-sm text-[#6c6685] dark:border-white/15 dark:bg-white/[0.03] dark:text-white/60">
                    Create or select a Path to open the canvas.
                  </div>
                </div>
              )}
            </div>

            <aside className="adhdice-scrollbar min-h-0 overflow-y-auto border-l border-[#f0ecfa] bg-white p-4 dark:border-white/10 dark:bg-[#171328]">
              {selectedRecord ? (
                <div className="space-y-4 pb-[calc(100vh-10rem)]">
                  <InspectorSection
                    isCollapsed={collapsedSections.path}
                    onToggle={() => toggleInspectorSection("path")}
                    title="PATH"
                  >
                    <input
                      className={TASK_TABLE_INPUT_CLASS}
                      onBlur={(event) => { void updateSelectedPath({ title: event.target.value }); }}
                      onChange={(event) => {
                        const value = event.target.value;
                        setPathRecords((current) => current.map((record) => record.path.id === selectedRecord.path.id ? { ...record, path: { ...record.path, title: value } } : record));
                      }}
                      value={selectedRecord.path.title}
                    />
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <DropdownField
                        onSelect={(value) => { void updateSelectedPath({ pathType: value as PathType }); }}
                        options={PATH_TYPES.map((pathType) => ({ label: PATH_TYPE_LABELS[pathType], value: pathType }))}
                        placeholder="Select path type"
                        value={selectedRecord.path.pathType}
                      />
                      <TaskTableChipButton onClick={() => { void archiveSelectedPath(); }} toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}>
                        <Archive className="mr-1 h-3.5 w-3.5" />
                        {selectedRecord.path.archivedAt ? "Restore" : "Archive"}
                      </TaskTableChipButton>
                    </div>
                    <textarea
                      className={`${TASK_TABLE_INPUT_CLASS} min-h-[76px] resize-y leading-5`}
                      onBlur={(event) => { void updateSelectedPath({ description: event.target.value }); }}
                      onChange={(event) => {
                        const value = event.target.value;
                        setPathRecords((current) => current.map((record) => record.path.id === selectedRecord.path.id ? { ...record, path: { ...record.path, description: value } } : record));
                      }}
                      placeholder="Path description"
                      value={selectedRecord.path.description ?? ""}
                    />
                    <div className="h-2 overflow-hidden rounded-full bg-[#ece8f8] dark:bg-white/10">
                      <div className="h-full rounded-full bg-[#6f57f6]" style={{ width: `${progressPercent}%` }} />
                    </div>
                  </InspectorSection>

                  <InspectorSection
                    isCollapsed={collapsedSections.endpoint}
                    onToggle={() => toggleInspectorSection("endpoint")}
                    title="ENDPOINT LANDMARK"
                  >
                    <div className="flex items-center justify-between gap-2">
                      {selectedEndpointPosition ? (
                        <span className="rounded-full border border-[#ece4ff] bg-[#fbfaff] px-2 py-1 text-[11px] font-semibold text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.04] dark:text-[#cabfff]">
                          On map
                        </span>
                      ) : (
                      <span className="rounded-full border border-dashed border-[#d8d1ea] bg-white/70 px-2 py-1 text-[11px] font-semibold text-[#8e88a9] dark:border-white/15 dark:bg-white/[0.03] dark:text-white/50">
                          Not placed
                        </span>
                      )}
                      {isEndpointPlacementMode ? (
                        <span className="rounded-full border border-[#d8ccff] bg-[#f6f2ff] px-2 py-1 text-[11px] font-semibold text-[#6f57f6] dark:border-[#5d48ab] dark:bg-[#1f1836] dark:text-[#cabfff]">
                          Tap canvas to place
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-[#7a7592] dark:text-white/55">
                      Right-click blank canvas space to place or move the destination landmark, or use the button below and tap blank canvas space.
                    </p>
                    <TaskTableChipButton onClick={beginEndpointPlacement} toneClassName={isEndpointPlacementMode ? TASK_TABLE_ACTIVE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}>
                      {selectedEndpointPosition ? "Move Endpoint on map" : "Place Endpoint on map"}
                    </TaskTableChipButton>
                    <div className="grid grid-cols-[1fr_120px] gap-2">
                      <input
                        className={TASK_TABLE_INPUT_CLASS}
                        onBlur={(event) => { void updateSelectedPath({ endpointLabel: event.target.value }); }}
                        onChange={(event) => {
                          const value = event.target.value;
                          setPathRecords((current) => current.map((record) => record.path.id === selectedRecord.path.id ? { ...record, path: { ...record.path, endpointLabel: value } } : record));
                        }}
                        placeholder="Destination label"
                        value={selectedRecord.path.endpointLabel ?? ""}
                      />
                      <DropdownField
                        onSelect={(value) => { void updateSelectedPath({ endpointIcon: value, endpointLabel: selectedRecord.path.endpointLabel ?? "" }); }}
                        options={PATH_ENDPOINT_ICON_OPTIONS.map((option) => ({ label: option.label, value: option.id }))}
                        placeholder="Select icon"
                        value={selectedRecord.path.endpointIcon ?? "target"}
                      />
                    </div>
                    <TaskTableChipButton
                      disabled={!selectedEndpointPosition}
                      onClick={() => {
                        if (connectSource?.kind === "endpoint") {
                          setConnectSource(null);
                          setStatusMessage("Endpoint connection mode stopped.");
                          return;
                        }
                        setSelectedNodeId(null);
                        setConnectSource({ kind: "endpoint" });
                        setStatusMessage("Click one or more nodes to connect the Endpoint.");
                      }}
                      toneClassName={connectSource?.kind === "endpoint" ? TASK_TABLE_ACTIVE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}
                    >
                      <Link2 className="mr-1 h-3.5 w-3.5" />
                      {connectSource?.kind === "endpoint" ? "Done connecting" : "Connect Endpoint"}
                    </TaskTableChipButton>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-[#7a7592] dark:text-white/55">Connected nodes</p>
                      {selectedRecord.path.endpointConnectedNodeIds.length > 0 ? selectedRecord.path.endpointConnectedNodeIds.map((nodeId) => {
                        const node = nodeById.get(nodeId);
                        return (
                          <div className="flex items-center justify-between gap-2 rounded-[0.85rem] border border-[#ece8f8] bg-[#fbfaff] px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.04]" key={nodeId}>
                            <span className="truncate text-[13px] font-medium text-[#68738c] dark:text-white/60">{node?.title ?? "Missing node"}</span>
                            <IconButton ariaLabel="Remove Endpoint connection" onClick={() => { void removeEndpointConnection(nodeId); }}>
                              <X className="h-3.5 w-3.5" />
                            </IconButton>
                          </div>
                        );
                      }) : (
                        <p className="text-xs text-[#8a84a3] dark:text-white/45">No Endpoint connections yet.</p>
                      )}
                    </div>
                  </InspectorSection>

                  <InspectorSection
                    isCollapsed={collapsedSections.selectedChip}
                    onToggle={() => toggleInspectorSection("selectedChip")}
                    title="SELECTED NODE"
                  >
                    {selectedNode ? (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            aria-label="Clear selected node"
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e2daf8] bg-white text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.05] dark:text-[#cabfff]"
                            onClick={() => setSelectedNodeId(null)}
                            type="button"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {selectedNode.kind === "path" ? (
                          <>
                            <input
                              className={TASK_TABLE_INPUT_CLASS}
                              onBlur={(event) => { void updateNode(selectedNode.id, { title: event.target.value }); }}
                              onChange={(event) => {
                                const value = event.target.value;
                                setPathRecords((current) => current.map((record) => record.path.id === selectedRecord.path.id
                                  ? { ...record, nodes: record.nodes.map((node) => node.id === selectedNode.id ? { ...node, title: value } : node) }
                                  : record));
                              }}
                              value={selectedNode.title}
                            />
                            <textarea
                              className={`${TASK_TABLE_INPUT_CLASS} min-h-[90px] resize-y leading-5`}
                              onBlur={(event) => { void updateNode(selectedNode.id, { note: event.target.value }); }}
                              onChange={(event) => {
                                const value = event.target.value;
                                setPathRecords((current) => current.map((record) => record.path.id === selectedRecord.path.id
                                  ? { ...record, nodes: record.nodes.map((node) => node.id === selectedNode.id ? { ...node, note: value } : node) }
                                  : record));
                              }}
                              placeholder="Note"
                              value={selectedNode.note ?? ""}
                            />
                          </>
                        ) : (
                          <div className="rounded-lg border border-[#e6def8] bg-[#faf8ff] px-3 py-2 text-xs text-[#6f6984] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/58">
                            Task title, hierarchy, status, due date, and priority stay live from the canonical Task.
                          </div>
                        )}
                        <LinkedTaskPicker
                          linkedTaskIds={selectedNode.linkedTaskIds}
                          linkedTasks={linkedTasks}
                          onSelectTask={(taskId) => {
                            if (selectedNode.kind === "task" || selectedNode.linkedTaskIds.length === 0) {
                              const taskNode = convertPathNodeToTaskNode(selectedNode, taskId);
                              void updateNode(selectedNode.id, { kind: taskNode.kind, linkedTaskIds: taskNode.linkedTaskIds });
                              return;
                            }
                            void updateNode(selectedNode.id, { linkedTaskIds: [...selectedNode.linkedTaskIds, taskId] });
                          }}
                        />
                        {selectedNode.linkedTaskIds.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {selectedNode.linkedTaskIds.map((taskId) => {
                              const linkedTask = linkedTaskById.get(taskId);
                              return linkedTask && !linkedTask.trashed_at ? (
                              <div className="flex max-w-full items-center gap-1" key={taskId}>
                                <div className="max-w-full">
                                  <PathLinkedTaskPill
                                    onOpenTask={onOpenTask}
                                    onSetTaskStatus={onSetTaskStatus}
                                    task={linkedTask}
                                  />
                                </div>
                                <IconButton ariaLabel="Remove linked task" onClick={() => { void updateNode(selectedNode.id, { linkedTaskIds: selectedNode.linkedTaskIds.filter((id) => id !== taskId) }); }}>
                                  <Unlink className="h-3.5 w-3.5" />
                                </IconButton>
                              </div>
                              ) : (
                                <PathUnavailableLinkedTaskChip
                                  key={taskId}
                                  label={linkedTask?.trashed_at ? "Linked task trashed" : "Linked task unavailable"}
                                  onRemove={() => { void updateNode(selectedNode.id, { linkedTaskIds: selectedNode.linkedTaskIds.filter((id) => id !== taskId) }); }}
                                />
                              );
                            })}
                          </div>
                        ) : null}
                        {selectedNode.kind === "path" && selectedNode.linkedTaskIds.length === 1 ? (
                          <TaskTableChipButton
                            onClick={() => {
                              const taskId = selectedNode.linkedTaskIds[0];
                              if (taskId) {
                                const taskNode = convertPathNodeToTaskNode(selectedNode, taskId);
                                void updateNode(selectedNode.id, { kind: taskNode.kind, linkedTaskIds: taskNode.linkedTaskIds });
                              }
                            }}
                            toneClassName={TASK_TABLE_ACTIVE_LIST_CHIP_CLASS}
                          >
                            Convert linked Task to Task Chip
                          </TaskTableChipButton>
                        ) : null}
                        {selectedNode.kind === "task" ? (
                          <TaskTableChipButton
                            onClick={() => {
                              const pathNode = convertTaskNodeToPathNode(selectedNode);
                              void updateNode(selectedNode.id, { kind: pathNode.kind, linkedTaskIds: pathNode.linkedTaskIds });
                            }}
                            toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}
                          >
                            <Unlink className="mr-1 h-3.5 w-3.5" />
                            Convert to PATHS Node
                          </TaskTableChipButton>
                        ) : null}
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-[#7a7592] dark:text-white/55">Outgoing connections</p>
                          {selectedNode.nextNodeIds.length > 0 ? selectedNode.nextNodeIds.map((nextNodeId) => {
                            const target = nodeById.get(nextNodeId);
                            return (
                              <div className="flex items-center justify-between gap-2 rounded-[0.85rem] border border-[#ece8f8] bg-[#fbfaff] px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.04]" key={nextNodeId}>
                                <span className="truncate text-[13px] font-medium text-[#68738c] dark:text-white/60">{target?.title ?? "Missing node"}</span>
                                <IconButton ariaLabel="Remove connection" onClick={() => { void removeConnection(selectedNode.id, nextNodeId); }}>
                                  <X className="h-3.5 w-3.5" />
                                </IconButton>
                              </div>
                            );
                          }) : (
                            <p className="text-xs text-[#8a84a3] dark:text-white/45">No outgoing connections.</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {selectedNode.kind === "path" ? (
                            <TaskTableChipButton onClick={() => { void toggleNodeComplete(selectedNode.id); }} toneClassName={completedNodeIds.has(selectedNode.id) ? TASK_TABLE_ACTIVE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}>
                              <Check className="mr-1 h-3.5 w-3.5" />
                              {completedNodeIds.has(selectedNode.id) ? "Complete" : "Incomplete"}
                            </TaskTableChipButton>
                          ) : null}
                          <TaskTableChipButton onClick={() => { void duplicateNode(selectedNode.id); }} toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}>
                            <Copy className="mr-1 h-3.5 w-3.5" />
                            Duplicate
                          </TaskTableChipButton>
                          <TaskTableChipButton onClick={() => { void deleteNode(selectedNode.id); }} toneClassName="border-[#f4c7c7] bg-[#fff5f5] text-[#b42318] dark:border-[#6b2a2a] dark:bg-[#331616] dark:text-[#ffb4ad]">
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Delete
                          </TaskTableChipButton>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-[1rem] border border-dashed border-[#d8d1ea] bg-white/70 p-4 text-sm text-[#6c6685] dark:border-white/15 dark:bg-white/[0.03] dark:text-white/60">
                        Select a PATHS Node or Task Chip to edit its available details and connections.
                      </div>
                    )}
                  </InspectorSection>

                  <InspectorSection
                    isCollapsed={collapsedSections.actions}
                    onToggle={() => toggleInspectorSection("actions")}
                    title="PATH ACTIONS"
                  >
                    <TaskTableChipButton onClick={() => { void deleteSelectedPath(); }} toneClassName="border-[#f4c7c7] bg-[#fff5f5] text-[#b42318] dark:border-[#6b2a2a] dark:bg-[#331616] dark:text-[#ffb4ad]">
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete path
                    </TaskTableChipButton>
                  </InspectorSection>

                  {statusMessage ? (
                    <p className="text-xs font-semibold text-[#6f57f6] dark:text-[#cabfff]">{statusMessage}</p>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-2">
                  <TaskTableChipButton onClick={() => { void createPath(); }} toneClassName={TASK_TABLE_ACTIVE_LIST_CHIP_CLASS}>
                    Create new path
                  </TaskTableChipButton>
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}

function IconButton({
  ariaLabel,
  children,
  disabled = false,
  onClick,
  tone = "neutral",
}: {
  ariaLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  tone?: "danger" | "neutral";
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={`flex h-8 w-8 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-40 ${tone === "danger" ? "border-[#f4c7c7] bg-[#fff5f5] text-[#b42318] dark:border-[#6b2a2a] dark:bg-[#331616] dark:text-[#ffb4ad]" : "border-[#e2daf8] bg-white text-[#6f57f6] hover:border-[#cbbcff] dark:border-white/10 dark:bg-white/[0.05] dark:text-[#cabfff]"}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function getProgressDateKey(pathType: PathType, todayKey: string) {
  return pathType === "daily_reset" ? todayKey : null;
}

function normalizeNodeOrder(nodes: PathNode[]) {
  return nodes.map((node, index) => ({
    ...node,
    sortOrder: index,
  }));
}

function getCanvasPoint(clientX: number, clientY: number, canvasElement: HTMLDivElement | null, zoom = 1) {
  const coordinatePoint = getCanvasCoordinatePoint(clientX, clientY, canvasElement, zoom);
  return clampCanvasPosition({
    x: coordinatePoint.x - NODE_CARD_WIDTH / 2,
    y: coordinatePoint.y - NODE_CARD_HEIGHT / 2,
  });
}

function getCanvasCoordinatePoint(clientX: number, clientY: number, canvasElement: HTMLDivElement | null, zoom = 1) {
  if (!canvasElement) {
    return getFallbackEndpointPosition(0);
  }

  const rect = canvasElement.getBoundingClientRect();
  return clampEndpointPosition({
    x: (clientX - rect.left) / zoom,
    y: (clientY - rect.top) / zoom,
  });
}

function getFallbackEndpointPosition(nodeCount: number) {
  return clampEndpointPosition({
    x: 960,
    y: Math.max(140, 200 + Math.floor(nodeCount / 4) * 24),
  });
}

function clampCanvasPosition(position: { x: number; y: number }) {
  return {
    x: clampNumber(position.x, CANVAS_NODE_PADDING, CANVAS_WIDTH - NODE_CARD_WIDTH - CANVAS_NODE_PADDING),
    y: clampNumber(position.y, CANVAS_NODE_PADDING, CANVAS_HEIGHT - NODE_CARD_HEIGHT - CANVAS_NODE_PADDING),
  };
}

function clampEndpointPosition(position: { x: number; y: number }) {
  return {
    x: clampNumber(position.x, CANVAS_NODE_PADDING + ENDPOINT_MARKER_RADIUS, CANVAS_WIDTH - CANVAS_NODE_PADDING - ENDPOINT_MARKER_RADIUS),
    y: clampNumber(position.y, CANVAS_NODE_PADDING + ENDPOINT_MARKER_RADIUS, CANVAS_HEIGHT - CANVAS_NODE_PADDING - ENDPOINT_MARKER_RADIUS),
  };
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function createPathId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getPathEndpointIcon(iconId: string | null) {
  if (!iconId) {
    return null;
  }
  return PATH_ENDPOINT_ICON_MAP[iconId as PathEndpointIconId] ?? Target;
}

function renderPathEndpointIcon(iconId: string | null, className: string) {
  const Icon = getPathEndpointIcon(iconId);
  return Icon ? <Icon className={className} /> : null;
}

function getPathEndpointRenderPosition(record: PathRecord) {
  if (!record.path.endpointLabel && !record.path.endpointIcon) {
    return null;
  }

  return record.path.endpointPosition ?? getFallbackEndpointPosition(record.nodes.length);
}
