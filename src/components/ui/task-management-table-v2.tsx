"use client";

import { Children, Fragment, startTransition, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import {
  ArrowUp,
  ArrowDown,
  CalendarDays,
  ChevronDown,
  Clock3,
  CirclePause,
  CirclePlay,
  Copy,
  Flame,
  Footprints,
  Flag,
  GripVertical,
  Link2,
  ExternalLink,
  MoveLeft,
  Plus,
  Repeat2,
  Skull,
  Sparkles,
  StickyNote,
  Tag,
  TimerReset,
  Trash2,
  X,
} from "lucide-react";
import type { TaskActualTimeEntry, TaskStatus, TaskSubtaskStatus } from "@/lib/database.types";
import { formatChildTaskPreviewDepthLabel, type ChildTaskPreview, type ChildTaskPreviewGroup, type ChildTaskPreviewLookup } from "@/lib/task-app-derived";
import { buildChildTaskPreviewVisibility, type ChildTaskPreviewVisibility } from "@/lib/task-child-preview-collapse";
import type { TaskSiblingDropPlacement, TaskSiblingReorderInstruction } from "@/lib/task-sibling-reorder";
import { TASK_STATUS_CHIP_STYLES, formatTaskStatusLabel, renderTaskStatusChip, renderTaskStatusCircle, renderTaskStatusGlyph } from "@/components/task-app/task-status-ui";
import { getSelectableTaskStatusesForRepeatFrequency } from "@/lib/task-complete";
import { shouldOptimisticallyPatchTaskStatus } from "@/lib/task-complete";
import { getTrashDaysRemaining } from "@/lib/task-trash";
import {
  TASK_TABLE_BODY_MUTED_VALUE_CLASS as BODY_MUTED_VALUE_CLASS,
  TASK_TABLE_BODY_VALUE_CLASS as BODY_VALUE_CLASS,
  TASK_TABLE_CHIP_BASE_CLASS as CHIP_BASE,
  TASK_TABLE_CONTROL_FONT_CLASS as CONTROL_FONT_CLASS,
  TASK_TABLE_HEADER_TEXT_CLASS as HEADER_TEXT_CLASS,
  TASK_TABLE_INACTIVE_CHIP_CLASS as INACTIVE_CHIP_CLASS,
  TASK_TABLE_INPUT_CLASS as OVERLAY_INPUT_CLASS,
  TASK_TABLE_ACTIVE_LIST_CHIP_CLASS as ACTIVE_LIST_CHIP_CLASS,
  TASK_TABLE_LIST_CHIP_CLASS as LIST_CHIP_CLASS,
  TASK_TABLE_TAG_CHIP_CLASS as TAG_CHIP_CLASS,
  TASK_TABLE_TEXT_CLASS as UNIFIED_TABLE_TEXT_CLASS,
  TASK_TABLE_TITLE_CELL_CLASS as TITLE_CELL_CLASS,
  TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS as VISIBLE_TITLE_TEXT_CLASS,
  ScrollUpButton,
  TaskTableChipButton,
} from "@/components/ui/task-table-primitives";
import { mergeMeasuredColumnWidths } from "@/lib/task-table-measurements";

type TaskEnergy = "high" | "low" | "medium" | "none";
type TaskPriority = "focus" | "important" | "urgent";
type TaskRepeat = "custom" | "daily" | "daily_until_complete" | "monthly" | "none" | "weekly";
type SortOptionId =
  | "status_asc"
  | "status_desc"
  | "priority_asc"
  | "priority_desc"
  | "energy_asc"
  | "energy_desc"
  | "repeat_asc"
  | "repeat_desc"
  | "text_asc"
  | "text_desc"
  | "due_asc"
  | "due_desc"
  | "active_first"
  | "date_asc"
  | "date_desc"
  | "number_asc"
  | "number_desc";
type SortColumnId =
  | "status_icon"
  | "title"
  | "lists"
  | "date_added"
  | "date_completed"
  | "due"
  | "estimated"
  | "actual"
  | "tags"
  | "link"
  | "notes"
  | "priority"
  | "energy"
  | "repeat"
  | "status";
export type TaskManagementTableColumnId = SortColumnId;
type HeaderColumn = {
  filterPlaceholder?: string;
  id: SortColumnId;
  label: string;
  menuLabel: string;
  options: Array<{ id: SortOptionId; label: string }>;
};
type TextFilterColumnId = "title" | "lists" | "tags" | "link" | "notes";
type StructuredFilterColumnId = "status" | "priority" | "energy" | "repeat";
type StructuredFilters = {
  energy: TaskEnergy[];
  priority: TaskPriority[];
  repeat: TaskRepeat[];
  status: TaskStatus[];
};
type OverlayMode = "actual" | "due" | "energy" | "estimated" | "full" | "link" | "lists" | "notes" | "priority" | "repeat" | "status" | "tags";
type OverlaySectionId = "actual" | "due" | "energyStatus" | "estimated" | "link" | "lists" | "notes" | "priority" | "repeat" | "tags";
type MetadataPanelId = "actual" | "due" | "energy" | "estimated" | "link" | "lists" | "notes" | "priority" | "repeat" | "status" | "tags";
type ColumnAlignment = "center" | "left" | "right";
export type RowContextMenuState = { left: number; taskId: string; top: number };
type ColumnMenuPosition = { left: number; maxHeight: number; placement: "down" | "up"; top: number };
export type RunningTaskTimer = { baseSeconds: number; pausedAt?: number | null; startedActualSeconds: number; startedAt: number; taskId: string; title: string };
export type TaskRowContextMenuQuickEditMode = "actual" | "due" | "energy" | "estimated" | "link" | "lists" | "notes" | "priority" | "repeat" | "status" | "tags";
type ChildTaskDragState = { depth: number; parentTaskId: string | null; taskId: string };
type ChildTaskDropTarget = { placement: TaskSiblingDropPlacement; taskId: string };
export type TaskRowContextMenuQuickEditItem = {
  label: string;
  mode: TaskRowContextMenuQuickEditMode;
};
export type PrototypeTaskSubtask = {
  children: PrototypeTaskSubtask[];
  id: string;
  status: TaskStatus;
  title: string;
};
type PrototypeSubtaskMiniRow = {
  depth: number;
  subtask: PrototypeTaskSubtask;
};

declare global {
  interface Window {
    copyAdhdiceStepTypographyDebug?: () => Promise<StepTypographyDebugPayload | null>;
  }
}

const INLINE_ACCORDION_MODES: OverlayMode[] = ["actual", "due", "energy", "estimated", "link", "lists", "notes", "priority", "repeat", "status", "tags"];
const BATCH_QUICK_EDIT_MODES: OverlayMode[] = ["due", "energy", "estimated", "lists", "priority", "repeat", "status", "tags"];

function isInlineAccordionMode(mode: OverlayMode) {
  return INLINE_ACCORDION_MODES.includes(mode);
}

function buildPrototypeSubtaskSignature(subtasks: PrototypeTaskSubtask[]): string {
  return JSON.stringify(subtasks.map((subtask) => ({
    children: buildPrototypeSubtaskSignature(subtask.children),
    id: subtask.id,
    status: subtask.status,
    title: subtask.title,
  })));
}

function buildPrototypeRowsSignature(rows: PrototypeTaskRow[]): string {
  return JSON.stringify(rows.map((row) => ({
    actualSeconds: row.actualSeconds,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    dueOn: row.dueOn,
    dueTime: row.dueTime,
    energy: row.energy,
    estimatedMinutes: row.estimatedMinutes,
    id: row.id,
    linkLabel: row.linkLabel,
    linkUrl: row.linkUrl,
    lists: row.lists,
    linkedNotes: row.linkedNotes,
    notes: row.notes,
    priorities: row.priorities,
    currentStreak: row.currentStreak,
    missedStreak: row.missedStreak,
    repeat: row.repeat,
    repeatInterval: row.repeatInterval,
    repeatDaysOfWeek: row.repeatDaysOfWeek,
    repeatDayOfMonth: row.repeatDayOfMonth,
    status: row.status,
    subtasks: buildPrototypeSubtaskSignature(row.subtasks),
    tags: row.tags,
    title: row.title,
  })));
}

function clonePrototypeTaskRow(task: PrototypeTaskRow): PrototypeTaskRow {
  return {
    ...task,
    linkedNotes: task.linkedNotes.map((note) => ({ ...note })),
    lists: [...task.lists],
    priorities: [...task.priorities],
    repeatDaysOfWeek: [...task.repeatDaysOfWeek],
    subtasks: task.subtasks.map(clonePrototypeSubtask),
    tags: [...task.tags],
  };
}

function clonePrototypeSubtask(subtask: PrototypeTaskSubtask): PrototypeTaskSubtask {
  return {
    ...subtask,
    children: subtask.children.map(clonePrototypeSubtask),
  };
}

function getPrototypeTaskRowKey(task: PrototypeTaskRow) {
  if (task.id) {
    return task.id;
  }
  return `draft-task-${task.createdAt || "undated"}-${task.title || "untitled"}`;
}

export function buildTaskRowContextMenuState(
  containerElement: HTMLElement | null,
  taskId: string,
  clientX: number,
  clientY: number,
): RowContextMenuState | null {
  if (!containerElement) {
    return null;
  }

  const shellRect = containerElement.getBoundingClientRect();
  const estimatedMenuWidth = 272;
  const estimatedMenuHeight = 360;
  const gutter = 18;
  const left = Math.min(
    Math.max(gutter, clientX - shellRect.left),
    Math.max(gutter, shellRect.width - estimatedMenuWidth - gutter),
  );
  const top = Math.min(
    Math.max(gutter, clientY - shellRect.top),
    Math.max(gutter, shellRect.height - estimatedMenuHeight - gutter),
  );

  return { left, taskId, top };
}

type TaskRowContextMenuProps = {
  allowInlineInspector?: boolean;
  enableInspector?: boolean;
  hasBatchQuickEdit?: boolean;
  isTaskSelected?: boolean;
  menu: RowContextMenuState;
  onClearSelection?: () => void;
  onDeleteTask?: () => void;
  onDismiss: () => void;
  onDuplicateTask?: () => void;
  onEditTask?: () => void;
  onOpenDetails?: (sourceElement?: HTMLElement | null) => void;
  onOpenHistory?: () => void;
  onOpenQuickEdit?: (mode: TaskRowContextMenuQuickEditMode, sourceElement?: HTMLElement | null) => void;
  onOpenTimeLog?: () => void;
  onRestoreTask?: () => void;
  onSelectAllVisible?: () => void;
  onToggleTaskSelection?: () => void;
  quickEditItems?: TaskRowContextMenuQuickEditItem[];
  quickEditTitle?: string;
  selectedTaskCount: number;
  task: Pick<PrototypeTaskRow, "id" | "status" | "title">;
};

export function TaskRowContextMenu({
  allowInlineInspector,
  enableInspector,
  hasBatchQuickEdit = false,
  isTaskSelected = false,
  menu,
  onClearSelection,
  onDeleteTask,
  onDismiss,
  onDuplicateTask,
  onEditTask,
  onOpenDetails,
  onOpenHistory,
  onOpenQuickEdit,
  onOpenTimeLog,
  onRestoreTask,
  onSelectAllVisible,
  onToggleTaskSelection,
  quickEditItems = [],
  quickEditTitle = "Quick edit",
  selectedTaskCount,
  task,
}: TaskRowContextMenuProps) {
  return (
    <div
      className="absolute inset-0 z-40"
      onClick={onDismiss}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        className="absolute w-[17rem] rounded-[1.35rem] border border-[#ede6ff] bg-white/95 p-2 text-left shadow-[0_24px_70px_rgba(111,87,246,0.18)] backdrop-blur dark:border-white/10 dark:bg-[#1b1530]/95"
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
        style={{ left: menu.left, top: menu.top }}
      >
        <div className="border-b border-[#f0ebfb] px-2 pb-2 dark:border-white/10">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#9b92be] dark:text-white/35">
            Task actions
          </p>
          <p className={`${UNIFIED_TABLE_TEXT_CLASS} mt-1 truncate text-[#2f294a] dark:text-white`}>
            {task.title}
          </p>
        </div>

        <div className="space-y-1 px-1 py-2">
          {(enableInspector || onOpenDetails) ? (
            <TaskTableChipButton
              className="w-full justify-between gap-2"
              onClick={(event) => onOpenDetails?.(event.currentTarget)}
            >
              <span>Open details</span>
            </TaskTableChipButton>
          ) : null}
          {onEditTask ? (
            <TaskTableChipButton
              className="w-full justify-between gap-2"
              onClick={() => onEditTask()}
            >
              <span>Edit task</span>
            </TaskTableChipButton>
          ) : null}
          {onDuplicateTask ? (
            <TaskTableChipButton
              className="w-full justify-between gap-2"
              onClick={() => onDuplicateTask()}
            >
              <span>Duplicate task</span>
              <Copy className="h-3.5 w-3.5" />
            </TaskTableChipButton>
          ) : null}
          {onOpenHistory ? (
            <TaskTableChipButton
              className="w-full justify-between gap-2"
              onClick={() => onOpenHistory()}
            >
              <span>Open history</span>
              <CalendarDays className="h-3.5 w-3.5" />
            </TaskTableChipButton>
          ) : null}
          {onOpenTimeLog ? (
            <TaskTableChipButton
              className="w-full justify-between gap-2"
              onClick={() => onOpenTimeLog()}
            >
              <span>Open time log</span>
              <Clock3 className="h-3.5 w-3.5" />
            </TaskTableChipButton>
          ) : null}
          {onToggleTaskSelection ? (
            <TaskTableChipButton
              className="w-full justify-between gap-2"
              onClick={() => onToggleTaskSelection()}
            >
              <span>{isTaskSelected ? "Deselect task" : "Select task"}</span>
            </TaskTableChipButton>
          ) : null}
          {onSelectAllVisible ? (
            <TaskTableChipButton
              className="w-full justify-between gap-2"
              onClick={() => onSelectAllVisible()}
            >
              <span>Select all visible</span>
            </TaskTableChipButton>
          ) : null}
          {selectedTaskCount > 0 && onClearSelection ? (
            <TaskTableChipButton
              className="w-full justify-between gap-2"
              onClick={() => onClearSelection()}
            >
              <span>Clear selection</span>
            </TaskTableChipButton>
          ) : null}
          {onDeleteTask ? (
            <>
              {(task.status === "archived" || task.status === "trashed") && onRestoreTask ? (
                <TaskTableChipButton
                  className="w-full justify-between gap-2"
                  onClick={() => onRestoreTask()}
                >
                  <span>Restore to inbox</span>
                  <MoveLeft className="h-3.5 w-3.5" />
                </TaskTableChipButton>
              ) : null}
              <TaskTableChipButton
                className="w-full justify-between gap-2"
                toneClassName="border-[#ffd6de] bg-[#fff1f3] text-[#d94e67] dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf]"
                onClick={() => onDeleteTask()}
              >
                <span>{task.status === "trashed" ? "Delete permanently" : "Move to trash"}</span>
                <Trash2 className="h-3.5 w-3.5" />
              </TaskTableChipButton>
            </>
          ) : null}
        </div>

        {(enableInspector || allowInlineInspector) && onOpenQuickEdit && quickEditItems.length > 0 ? (
          <div className="border-t border-[#f0ebfb] px-1 pt-2 dark:border-white/10">
            <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-[0.22em] text-[#9b92be] dark:text-white/35">
              {quickEditTitle}
            </p>
            {hasBatchQuickEdit ? (
              <p className="px-2 pb-2 text-[11px] leading-5 text-[#8d87a7] dark:text-white/45">
                Status, due, estimate, priority, energy, repeat, lists, and tags apply to all selected. Actual, link, and notes stay single-task.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 px-1 pb-1">
              {quickEditItems.map((item) => (
                <TaskTableChipButton
                  key={item.mode}
                  onClick={(event) => onOpenQuickEdit(item.mode, event.currentTarget)}
                >
                  {item.label}
                </TaskTableChipButton>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function filterPrototypeSubtasks(
  subtasks: PrototypeTaskSubtask[],
  hiddenSubtaskIds: Record<string, boolean>,
): PrototypeTaskSubtask[] {
  return subtasks
    .filter((subtask) => !hiddenSubtaskIds[subtask.id])
    .map((subtask) => ({
      ...subtask,
      children: filterPrototypeSubtasks(subtask.children, hiddenSubtaskIds),
    }));
}

function flattenPrototypeSubtasksForMiniRows(subtasks: PrototypeTaskSubtask[], depth = 1): PrototypeSubtaskMiniRow[] {
  return subtasks.flatMap((subtask) => [
    { depth, subtask },
    ...flattenPrototypeSubtasksForMiniRows(subtask.children, depth + 1),
  ]);
}

function collectPrototypeSubtaskIds(subtasks: PrototypeTaskSubtask[], rootId: string): string[] {
  for (const subtask of subtasks) {
    if (subtask.id === rootId) {
      return [subtask.id, ...collectAllPrototypeSubtaskIds(subtask.children)];
    }

    const nestedMatch = collectPrototypeSubtaskIds(subtask.children, rootId);
    if (nestedMatch.length > 0) {
      return nestedMatch;
    }
  }

  return [];
}

function collectAllPrototypeSubtaskIds(subtasks: PrototypeTaskSubtask[]): string[] {
  return subtasks.flatMap((subtask) => [subtask.id, ...collectAllPrototypeSubtaskIds(subtask.children)]);
}

const SUBTASK_RENAME_INPUT_TEXT_CLASS = `[font-family:inherit] min-w-0 flex-1 appearance-none bg-transparent p-0 text-[13px] font-medium leading-none tracking-normal text-left text-[#7a7592] outline-none placeholder:text-[#9b92be] dark:text-white/58 dark:placeholder:text-white/35`;
const SUBTASK_RENAME_INPUT_TYPOGRAPHY_STYLE: CSSProperties = {
  color: "rgb(122, 117, 146)",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 500,
  letterSpacing: "normal",
  lineHeight: "13px",
};
const PARENT_TITLE_RENAME_INPUT_TYPOGRAPHY_STYLE: CSSProperties = {
  color: "rgb(122, 117, 146)",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 500,
  letterSpacing: "normal",
  lineHeight: "13px",
};
const STEP_TYPOGRAPHY_DEBUG_ACTIVE_INPUT_ATTR = "data-adhdice-step-typography-active-input";
const STEP_TYPOGRAPHY_DEBUG_VISIBLE_TITLE_ATTR = "data-adhdice-step-typography-visible-title";
type StepTypographyDebugEntry = {
  appearance: string;
  borderBottomWidth: string;
  borderTopWidth: string;
  boundingBox: {
    height: number;
    left: number;
    top: number;
    width: number;
  };
  className: string;
  color: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  height: string;
  letterSpacing: string;
  lineHeight: string;
  paddingBottom: string;
  paddingLeft: string;
  paddingRight: string;
  paddingTop: string;
  tagName: string;
  transform: string;
  webkitAppearance: string;
  zoom: string;
};
type StepTypographyDebugPayload = {
  activeInput: StepTypographyDebugEntry | null;
  activeInputSelector: string;
  generatedAt: string;
  nearestVisibleTitle: StepTypographyDebugEntry | null;
  visibleTitleSelector: string;
};

function getStepTypographyDebugEntry(element: Element | null): StepTypographyDebugEntry | null {
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  const styles = window.getComputedStyle(element);
  const bounds = element.getBoundingClientRect();

  return {
    appearance: styles.getPropertyValue("appearance"),
    borderBottomWidth: styles.borderBottomWidth,
    borderTopWidth: styles.borderTopWidth,
    boundingBox: {
      height: bounds.height,
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
    },
    className: element.className,
    color: styles.color,
    fontFamily: styles.fontFamily,
    fontSize: styles.fontSize,
    fontWeight: styles.fontWeight,
    height: styles.height,
    letterSpacing: styles.letterSpacing,
    lineHeight: styles.lineHeight,
    paddingBottom: styles.paddingBottom,
    paddingLeft: styles.paddingLeft,
    paddingRight: styles.paddingRight,
    paddingTop: styles.paddingTop,
    tagName: element.tagName,
    transform: styles.transform,
    webkitAppearance: styles.getPropertyValue("-webkit-appearance"),
    zoom: styles.getPropertyValue("zoom"),
  };
}

function findNearestVisibleStepTitle(activeInput: HTMLElement): HTMLElement | null {
  const visibleTitles = Array.from(document.querySelectorAll<HTMLElement>(`[${STEP_TYPOGRAPHY_DEBUG_VISIBLE_TITLE_ATTR}]`));
  const inputBounds = activeInput.getBoundingClientRect();
  const inputCenterX = inputBounds.left + inputBounds.width / 2;
  const inputCenterY = inputBounds.top + inputBounds.height / 2;

  return visibleTitles.reduce<{ distance: number; title: HTMLElement | null }>((nearest, title) => {
    const titleBounds = title.getBoundingClientRect();
    const titleCenterX = titleBounds.left + titleBounds.width / 2;
    const titleCenterY = titleBounds.top + titleBounds.height / 2;
    const distance = Math.hypot(titleCenterX - inputCenterX, titleCenterY - inputCenterY);

    return distance < nearest.distance ? { distance, title } : nearest;
  }, { distance: Number.POSITIVE_INFINITY, title: null }).title;
}

function installStepTypographyDebugHelper() {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") {
    return;
  }

  window.copyAdhdiceStepTypographyDebug = async () => {
    const activeInput = document.querySelector<HTMLElement>(`[${STEP_TYPOGRAPHY_DEBUG_ACTIVE_INPUT_ATTR}]:focus`)
      ?? document.querySelector<HTMLElement>(`[${STEP_TYPOGRAPHY_DEBUG_ACTIVE_INPUT_ATTR}]`);
    const nearestVisibleTitle = activeInput ? findNearestVisibleStepTitle(activeInput) : null;
    const payload: StepTypographyDebugPayload = {
      activeInput: getStepTypographyDebugEntry(activeInput),
      activeInputSelector: `[${STEP_TYPOGRAPHY_DEBUG_ACTIVE_INPUT_ATTR}]`,
      generatedAt: new Date().toISOString(),
      nearestVisibleTitle: getStepTypographyDebugEntry(nearestVisibleTitle),
      visibleTitleSelector: `[${STEP_TYPOGRAPHY_DEBUG_VISIBLE_TITLE_ATTR}]`,
    };
    const text = JSON.stringify(payload, null, 2);

    console.log("ADHDice step typography debug", payload);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      console.log("ADHDice step typography debug copied to clipboard.");
    }

    return payload;
  };
}

function normalizeTaskListLabel(value: string) {
  return value.trim().toLowerCase();
}

function taskHasList(task: PrototypeTaskRow, listLabel: string) {
  const targetLabel = normalizeTaskListLabel(listLabel);
  if (!targetLabel) {
    return false;
  }

  return task.lists.some((entry) => normalizeTaskListLabel(entry) === targetLabel);
}

function CollapsibleOverlayCard({
  children,
  collapsed,
  collapsible = true,
  onToggle,
  title,
}: {
  children: ReactNode;
  collapsed: boolean;
  collapsible?: boolean;
  onToggle?: () => void;
  title: ReactNode;
}) {
  const HeaderTag = collapsible ? "button" : "div";

  return (
    <section className="rounded-[1.25rem] border border-[#ede7f7] bg-white/88 p-3 dark:border-white/10 dark:bg-white/[0.04]">
      <HeaderTag
        {...(collapsible ? { type: "button" as const } : {})}
        aria-expanded={collapsible ? !collapsed : undefined}
        className={`flex w-full items-center justify-between gap-3 text-left ${collapsible ? "transition hover:opacity-90" : ""}`}
        onClick={collapsible ? onToggle : undefined}
      >
        <div className="min-w-0 flex-1">{title}</div>
        {collapsible ? (
          <ChevronDown
            className={`h-4 w-4 flex-none text-[#9b92be] transition-transform dark:text-white/35 ${collapsed ? "" : "rotate-180"}`}
          />
        ) : null}
      </HeaderTag>
      {collapsed ? null : <div className="mt-3">{children}</div>}
    </section>
  );
}

function InlineSubtaskEditor({
  autofocusSubtaskId,
  drafts,
  onAddChild,
  onAutofocusHandled,
  onCommitTitle,
  onDelete,
  onDraftChange,
  onSetStatus,
  subtasks,
}: {
  autofocusSubtaskId?: string | null;
  drafts: Record<string, string>;
  onAddChild?: (subtaskId: string) => void;
  onAutofocusHandled?: () => void;
  onCommitTitle?: (subtaskId: string) => void;
  onDelete?: (subtaskId: string) => void;
  onDraftChange: (subtaskId: string, value: string) => void;
  onSetStatus?: (subtaskId: string, nextStatus: TaskSubtaskStatus) => void;
  subtasks: PrototypeTaskSubtask[];
}) {
  useEffect(() => {
    installStepTypographyDebugHelper();
  }, []);

  return (
    <div className="space-y-2">
      {subtasks.map((subtask) => (
        <div className="space-y-2" key={subtask.id}>
          <div className="rounded-[1rem] border border-[#efe9ff] bg-[#fbfaff] px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-start gap-2">
              <div className="mt-1 flex h-6 w-6 flex-none items-center justify-center">
                {renderTaskStatusCircle(subtask.status, "sm")}
              </div>
              <input
                autoFocus={autofocusSubtaskId === subtask.id}
                className={`${SUBTASK_RENAME_INPUT_TEXT_CLASS} ${subtask.status === "done" ? "line-through opacity-60" : ""}`}
                data-adhdice-step-typography-active-input={process.env.NODE_ENV === "development" ? "true" : undefined}
                onBlur={() => onCommitTitle?.(subtask.id)}
                onChange={(event) => onDraftChange(subtask.id, event.target.value)}
                onFocus={() => {
                  if (autofocusSubtaskId === subtask.id) {
                    onAutofocusHandled?.();
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onCommitTitle?.(subtask.id);
                  }
                }}
                placeholder="Step title..."
                style={SUBTASK_RENAME_INPUT_TYPOGRAPHY_STYLE}
                type="text"
                value={drafts[subtask.id] ?? subtask.title}
              />
              <div className="flex flex-none items-center gap-1">
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#ddd2ff] bg-white text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]"
                  onClick={() => onAddChild?.(subtask.id)}
                  type="button"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#ffd6de] bg-[#fff1f3] text-[#d94e67] dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf]"
                  onClick={() => onDelete?.(subtask.id)}
                  type="button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 pl-8">
              {STATUS_OPTIONS.map((option) => (
                <button
                  aria-label={`Set step status to ${option.label}`}
                  className={`inline-flex items-center justify-center rounded-full p-0.5 transition ${
                    subtask.status === option.value
                      ? "shadow-[0_0_0_1px_rgba(111,87,246,0.18)]"
                      : "opacity-78 hover:opacity-100"
                  }`}
                  key={option.value}
                  onClick={() => onSetStatus?.(subtask.id, option.value)}
                  type="button"
                >
                  {renderTaskStatusCircle(option.value, "sm")}
                </button>
              ))}
            </div>
          </div>
          {subtask.children.length > 0 ? (
            <div className="ml-5 border-l border-[#ede7f7] pl-3 dark:border-white/10">
              <InlineSubtaskEditor
                autofocusSubtaskId={autofocusSubtaskId}
                drafts={drafts}
                onAddChild={onAddChild}
                onAutofocusHandled={onAutofocusHandled}
                onCommitTitle={onCommitTitle}
                onDelete={onDelete}
                onDraftChange={onDraftChange}
                onSetStatus={onSetStatus}
                subtasks={subtask.children}
              />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export type PrototypeTaskRow = {
  actualSeconds: number;
  completedAt: string | null;
  createdAt: string;
  trashedAt: string | null;
  updatedAt: string;
  dueOn: string;
  dueTime: string;
  energy: TaskEnergy;
  estimatedMinutes: number | null;
  id: string;
  linkLabel: string;
  linkUrl: string;
  lists: string[];
  linkedNotes: Array<{ id: string; title: string }>;
  notes: string;
  priorities: TaskPriority[];
  currentStreak: number;
  missedStreak: number;
  repeat: TaskRepeat;
  repeatInterval: number;
  repeatDaysOfWeek: number[];
  repeatDayOfMonth: number | null;
  subtasksAutoReset: boolean;
  status: TaskStatus;
  subtasks: PrototypeTaskSubtask[];
  tags: string[];
  title: string;
};

type TaskFollowDestination = {
  id: string;
  label: string;
};

function isKeyboardEventFromEditableTarget(
  target: EventTarget | null,
  options?: { isTextEditingActive?: boolean },
) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable || target.closest('[contenteditable=""], [contenteditable="true"]')) {
    return true;
  }

  const editableRoleSelector = '[role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"], [aria-multiline="true"]';
  if (target.matches(editableRoleSelector) || target.closest(editableRoleSelector)) {
    return true;
  }

  const formFieldSelector = "input, textarea, select";
  if (target.matches(formFieldSelector) || target.closest(formFieldSelector)) {
    return true;
  }

  if (options?.isTextEditingActive && (target.tagName === "BUTTON" || Boolean(target.closest("button")))) {
    return true;
  }

  return false;
}

type TaskManagementTableV2Props = {
  allowInlineInspector?: boolean;
  allListOptions?: Array<{ id: string; label: string }>;
  allNoteOptions?: Array<{ id: string; title: string }>;
  allTagOptions?: string[];
  childTaskCreationBlockedTaskIds?: string[];
  childTaskPreviewByParentTaskId?: ChildTaskPreviewLookup;
  searchMatchedStepParentTaskIds?: string[];
  className?: string;
  currentListLabel?: string | null;
  enableInspector?: boolean;
  overlayNode?: ReactNode;
  onInspectorClose?: () => void;
  shellClassName?: string;
  showHeader?: boolean;
  onClearSelection?: () => void;
  onCreateChildTask?: (parentTaskId: string, title: string) => Promise<{ error: string | null; taskId: string | null }>;
  onCreateTaskList?: (name: string) => Promise<{ id: string; persisted: boolean } | false> | { id: string; persisted: boolean } | false;
  onOpenBatchDelete?: () => void;
  onOpenBatchEdit?: () => void;
  onOpenDeleteTask?: (taskId: string) => void;
  onDuplicateTask?: (taskId: string) => void;
  onRestoreTask?: (taskId: string) => void;
  onOpenTaskHistory?: (taskId: string) => void;
  onOpenFocusTimer?: (taskId: string) => void;
  onOpenNote?: (noteId: string) => void;
  onOpenTaskActualTime?: (taskId: string, options?: { durationSeconds?: number; title?: string }) => void;
  onOpenTaskEditor?: (taskId: string) => void;
  onOpenChildTask?: (taskId: string) => void;
  onReorderChildTask?: (taskId: string, instruction: TaskSiblingReorderInstruction) => void;
  onLoadMoreRows?: () => void;
  onRequestedOpenTaskHandled?: (taskId: string) => void;
  onFollowDetachedTask?: (taskId: string) => void;
  onDismissDetachedTask?: (taskId: string) => void;
  onPreviousTaskTimer?: () => void;
  onNextTaskTimer?: () => void;
  onDeleteTaskActualTimeEntry?: (entryId: string) => void;
  onPauseTaskTimer?: (taskId: string) => void;
  onResumeTaskTimer?: (taskId: string) => void;
  onStartTaskTimer?: (timer: RunningTaskTimer) => void;
  onStopTaskTimer?: (taskId: string) => void;
  onTaskActualSecondsChange?: (taskId: string, seconds: number) => void;
  taskActualTimeEntriesByTaskId?: Record<string, TaskActualTimeEntry[]>;
  onTaskDueChange?: (taskId: string, schedule: { dueOn: string; dueTime: string }) => void;
  onTaskEnergyChange?: (taskId: string, energy: TaskEnergy) => void;
  onTaskEstimatedMinutesChange?: (taskId: string, minutes: number | null) => void;
  onTaskLinkChange?: (taskId: string, nextLink: { label: string; url: string }) => void;
  onTaskLinkedNoteIdsChange?: (taskId: string, linkedNoteIds: string[]) => void;
  onTaskNotesChange?: (taskId: string, notes: string) => void;
  onTaskPriorityChange?: (taskId: string, priorities: TaskPriority[]) => void;
  onRowClick?: (taskId: string) => void;
  onSelectAllVisible?: (taskIds?: string[]) => void;
  onTaskRepeatChange?: (taskId: string, repeat: TaskRepeat, cadence?: Pick<PrototypeTaskRow, "repeatDayOfMonth" | "repeatDaysOfWeek" | "repeatInterval">) => void;
  onTaskStatusChange?: (taskId: string, status: TaskStatus) => void;
  onTaskSubtaskAdd?: (taskId: string) => string | null | Promise<string | null>;
  onTaskSubtaskAddChild?: (subtaskId: string) => string | null | Promise<string | null>;
  onTaskSubtaskDelete?: (subtaskId: string) => void;
  onTaskSubtaskRename?: (subtaskId: string, title: string) => void;
  onTaskSubtaskStatusChange?: (subtaskId: string, status: TaskSubtaskStatus) => void;
  onTaskSubtasksAutoResetChange?: (taskId: string, subtasksAutoReset: boolean) => void;
  onTaskTagsChange?: (taskId: string, tags: string[]) => void;
  onTaskTitleChange?: (taskId: string, title: string) => void;
  onToggleTaskSelection?: (taskId: string, options?: { additive?: boolean; range?: boolean; visibleTaskIds?: string[] }) => void;
  onToggleTaskList?: (taskId: string, listId: string) => void;
  primaryBadgeLabel?: string;
  rows?: PrototypeTaskRow[];
  runningTaskTimers?: RunningTaskTimer[];
  requestedOpenTaskId?: string | null;
  requestedOpenTask?: PrototypeTaskRow | null;
  suppressDetachedNoticeTaskId?: string | null;
  selectedTaskIds?: string[];
  secondaryBadgeLabel?: string;
  taskTimerNow?: number;
  title?: string;
  visibleColumns?: TaskManagementTableColumnId[];
  activeTaskTimerIndex?: number;
  getFollowTaskDestination?: (taskId: string) => TaskFollowDestination | null;
  hasMoreRows?: boolean;
  shrinkAllColumnsToken?: number;
};

const DEFAULT_ROWS: PrototypeTaskRow[] = [
  {
    actualSeconds: 1200,
    completedAt: null,
    createdAt: new Date().toISOString(),
    trashedAt: null,
    updatedAt: new Date().toISOString(),
    dueOn: "",
    dueTime: "",
    energy: "low",
    estimatedMinutes: 20,
    id: "task-v2-1",
    linkLabel: "Brief",
    linkUrl: "https://example.com/brief",
    lists: ["Inbox", "Quick Wins"],
    linkedNotes: [{ id: "note-1", title: "Morning brief" }],
    notes: "Needs a lighter first pass before turning into a bigger work block.",
    priorities: ["focus"],
    currentStreak: 1,
    missedStreak: 0,
    repeat: "daily",
    repeatInterval: 1,
    repeatDaysOfWeek: [],
    repeatDayOfMonth: null,
    subtasksAutoReset: false,
    status: "pending",
    subtasks: [
      {
        children: [],
        id: "subtask-v2-1",
        status: "pending",
        title: "Open the brief",
      },
    ],
    tags: ["planning", "morning"],
    title: "Morning reset block",
  },
  {
    actualSeconds: 300,
    completedAt: null,
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    trashedAt: null,
    updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
    dueOn: offsetDate(1),
    dueTime: "09:00",
    energy: "medium",
    estimatedMinutes: 45,
    id: "task-v2-2",
    linkLabel: "Client doc",
    linkUrl: "https://example.com/client",
    lists: ["Today"],
    linkedNotes: [{ id: "note-2", title: "Client sync notes" }],
    notes: "Follow up with the client and tighten the timeline assumptions.",
    priorities: ["important", "urgent"],
    currentStreak: 2,
    missedStreak: 0,
    repeat: "weekly",
    repeatInterval: 1,
    repeatDaysOfWeek: [1],
    repeatDayOfMonth: null,
    subtasksAutoReset: false,
    status: "in_progress",
    subtasks: [
      {
        children: [
          {
            children: [],
            id: "subtask-v2-2a",
            status: "pending",
            title: "Share next draft",
          },
        ],
        id: "subtask-v2-2",
        status: "done",
        title: "Collect client notes",
      },
    ],
    tags: ["client", "follow-up"],
    title: "Client follow-up sweep",
  },
  {
    actualSeconds: 0,
    completedAt: null,
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    trashedAt: null,
    updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
    dueOn: offsetDate(7),
    dueTime: "",
    energy: "none",
    estimatedMinutes: 90,
    id: "task-v2-3",
    linkLabel: "",
    linkUrl: "",
    lists: ["Later"],
    linkedNotes: [],
    notes: "Custom cadence draft for a longer-term maintenance loop.",
    priorities: ["important"],
    currentStreak: 0,
    missedStreak: 1,
    repeat: "custom",
    repeatInterval: 2,
    repeatDaysOfWeek: [1, 3, 5],
    repeatDayOfMonth: null,
    subtasksAutoReset: false,
    status: "pending",
    subtasks: [],
    tags: ["ops", "maintenance"],
    title: "Maintenance cadence prototype",
  },
];

const INITIAL_RENDERED_TASK_COUNT = 24;
const RENDERED_TASK_BATCH_SIZE = 36;

const TASK_TABLE_PREFERENCES_STORAGE_KEY = "adhdice-task-table-v2-preferences-v2";

type TaskTablePreferences = {
  columnAlignments?: Partial<Record<TaskManagementTableColumnId, ColumnAlignment>>;
  columnOrder?: TaskManagementTableColumnId[];
  columnWidths?: Partial<Record<TaskManagementTableColumnId, number>>;
  sortState?: { columnId: SortColumnId; optionId: SortOptionId } | null;
  statusDisplayMode?: "chip" | "circle";
};

function readTaskTablePreferences(): TaskTablePreferences | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(TASK_TABLE_PREFERENCES_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }
    const parsed = JSON.parse(rawValue) as TaskTablePreferences | null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function getInitialSortState() {
  const preferences = readTaskTablePreferences();
  const nextSortState = preferences?.sortState;
  if (!nextSortState) {
    return null;
  }

  const hasValidColumn = HEADER_COLUMNS.some((column) => column.id === nextSortState.columnId);
  const matchingColumn = HEADER_COLUMNS.find((column) => column.id === nextSortState.columnId);
  const hasValidOption = matchingColumn?.options.some((option) => option.id === nextSortState.optionId) ?? false;
  return hasValidColumn && hasValidOption ? nextSortState : null;
}

function getInitialColumnWidths() {
  const preferences = readTaskTablePreferences();
  const storedWidths = preferences?.columnWidths ?? {};
  return HEADER_COLUMNS.reduce<Record<TaskManagementTableColumnId, number>>((accumulator, column) => {
    const storedWidth = storedWidths[column.id];
    accumulator[column.id] = typeof storedWidth === "number" && Number.isFinite(storedWidth)
      ? Math.max(MIN_COLUMN_WIDTHS[column.id], storedWidth)
      : DEFAULT_COLUMN_WIDTHS[column.id];
    return accumulator;
  }, { ...DEFAULT_COLUMN_WIDTHS });
}

function getInitialColumnOrder() {
  const preferences = readTaskTablePreferences();
  const storedOrder = preferences?.columnOrder ?? [];
  const validStoredOrder = storedOrder.filter((columnId) => HEADER_COLUMNS.some((column) => column.id === columnId));
  const missingColumns = HEADER_COLUMNS.map((column) => column.id).filter((columnId) => !validStoredOrder.includes(columnId));
  return [...validStoredOrder, ...missingColumns];
}

function getInitialColumnAlignments() {
  const preferences = readTaskTablePreferences();
  const storedAlignments = preferences?.columnAlignments ?? {};
  return Object.fromEntries(
    Object.entries(storedAlignments).filter((entry): entry is [TaskManagementTableColumnId, ColumnAlignment] => (
      HEADER_COLUMNS.some((column) => column.id === entry[0])
      && (entry[1] === "left" || entry[1] === "center" || entry[1] === "right")
    )),
  ) as Partial<Record<TaskManagementTableColumnId, ColumnAlignment>>;
}

function getInitialStatusDisplayMode() {
  const preferences = readTaskTablePreferences();
  return preferences?.statusDisplayMode === "chip" ? "chip" : "circle";
}

const PRIORITY_OPTIONS: Array<{ label: string; value: TaskPriority }> = [
  { label: "Focus", value: "focus" },
  { label: "Important", value: "important" },
  { label: "Urgent", value: "urgent" },
];

const ENERGY_OPTIONS: Array<{ label: string; value: TaskEnergy }> = [
  { label: "None", value: "none" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];

const REPEAT_OPTIONS: Array<{ label: string; value: TaskRepeat }> = [
  { label: "No Repeat", value: "none" },
  { label: "Daily", value: "daily" },
  { label: "Daily Until Complete", value: "daily_until_complete" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Custom Cadence", value: "custom" },
];

const REPEAT_WEEKDAY_OPTIONS = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
];

const STATUS_OPTIONS: Array<{ label: string; value: TaskStatus }> = [
  { label: "Pending", value: "pending" },
  { label: "In Progress", value: "in_progress" },
  { label: "Done", value: "done" },
  { label: "Did My Best", value: "did_my_best" },
  { label: "Missed", value: "missed" },
  { label: "Complete", value: "complete" },
  { label: "Upcoming", value: "upcoming" },
  { label: "Not Due", value: "not_due" },
  { label: "Archived", value: "archived" },
  { label: "Trash", value: "trashed" },
];

const DUE_PRESETS = [
  { label: "No Date", value: "" },
  { label: "Today", value: offsetDate(0) },
  { label: "Tomorrow", value: offsetDate(1) },
  { label: "Next Monday", value: nextWeekdayIso(1) },
];
const ESTIMATED_TIME_PRESETS = [5, 10, 15, 20, 30, 45, 60];

const DEFAULT_COLUMN_WIDTHS: Record<TaskManagementTableColumnId, number> = {
  status_icon: 30,
  title: 220,
  lists: 92,
  date_added: 116,
  date_completed: 132,
  due: 92,
  estimated: 76,
  actual: 76,
  tags: 82,
  link: 80,
  notes: 92,
  priority: 92,
  energy: 80,
  repeat: 92,
  status: 92,
};
const MIN_COLUMN_WIDTHS: Record<TaskManagementTableColumnId, number> = {
  status_icon: 24,
  title: 156,
  lists: 62,
  date_added: 92,
  date_completed: 104,
  due: 64,
  estimated: 60,
  actual: 60,
  tags: 58,
  link: 58,
  notes: 70,
  priority: 70,
  energy: 64,
  repeat: 72,
  status: 70,
};
const COLUMN_WIDTH_BUFFER: Record<TaskManagementTableColumnId, number> = {
  status_icon: 2,
  title: 4,
  lists: 4,
  date_added: 8,
  date_completed: 8,
  due: 4,
  estimated: 4,
  actual: 4,
  tags: 2,
  link: 2,
  notes: 4,
  priority: 4,
  energy: 4,
  repeat: 6,
  status: 4,
};
const TABLE_FONT_STYLE = {
  fontFamily: "\"Avenir Next\", Manrope, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
} as const;
const HEADER_COLUMNS: HeaderColumn[] = [
  { id: "status_icon", label: "Status", menuLabel: "Status", options: [{ id: "status_asc", label: "Status A-Z" }, { id: "status_desc", label: "Status Z-A" }] },
  { id: "title", label: "Task", menuLabel: "Task", options: [{ id: "text_asc", label: "Sort A-Z" }, { id: "text_desc", label: "Sort Z-A" }], filterPlaceholder: "Search tasks" },
  { id: "lists", label: "Lists", menuLabel: "Lists", options: [{ id: "text_asc", label: "Sort A-Z" }, { id: "text_desc", label: "Sort Z-A" }], filterPlaceholder: "Search lists" },
  { id: "date_added", label: "Date Added", menuLabel: "Date Added", options: [{ id: "date_desc", label: "Newest first" }, { id: "date_asc", label: "Oldest first" }] },
  { id: "date_completed", label: "Date Completed", menuLabel: "Date Completed", options: [{ id: "date_desc", label: "Newest first" }, { id: "date_asc", label: "Oldest first" }] },
  { id: "due", label: "Due", menuLabel: "Due", options: [{ id: "due_asc", label: "Sort earliest first" }, { id: "due_desc", label: "Sort latest first" }] },
  { id: "estimated", label: "Est.", menuLabel: "Estimated time", options: [{ id: "number_asc", label: "Sort low-high" }, { id: "number_desc", label: "Sort high-low" }] },
  { id: "actual", label: "Actual", menuLabel: "Actual time", options: [{ id: "active_first", label: "Sort active timers first" }, { id: "number_asc", label: "Sort low-high" }, { id: "number_desc", label: "Sort high-low" }] },
  { id: "tags", label: "Tags", menuLabel: "Tags", options: [{ id: "text_asc", label: "Sort A-Z" }, { id: "text_desc", label: "Sort Z-A" }], filterPlaceholder: "Search tags" },
  { id: "link", label: "Link", menuLabel: "Link", options: [{ id: "text_asc", label: "Sort A-Z" }, { id: "text_desc", label: "Sort Z-A" }], filterPlaceholder: "Search links" },
  { id: "notes", label: "Notes", menuLabel: "Notes", options: [{ id: "text_asc", label: "Sort A-Z" }, { id: "text_desc", label: "Sort Z-A" }], filterPlaceholder: "Search notes" },
  { id: "priority", label: "Priority", menuLabel: "Priority", options: [{ id: "priority_desc", label: "Sort urgent first" }, { id: "priority_asc", label: "Sort focus first" }] },
  { id: "energy", label: "Energy", menuLabel: "Energy", options: [{ id: "energy_desc", label: "Sort high first" }, { id: "energy_asc", label: "Sort none first" }] },
  { id: "repeat", label: "Repeat", menuLabel: "Repeat", options: [{ id: "repeat_desc", label: "Sort repeating first" }, { id: "repeat_asc", label: "Sort no repeat first" }] },
];
const DEFAULT_STRUCTURED_FILTERS: StructuredFilters = {
  energy: [],
  priority: [],
  repeat: [],
  status: [],
};

function summarizeInlineItems<T>(items: T[], maxVisible = 1) {
  return {
    extraCount: Math.max(0, items.length - maxVisible),
    visibleItems: items.slice(0, maxVisible),
  };
}
const PRIORITY_SORT_ORDER: TaskPriority[] = ["focus", "important", "urgent"];
const ENERGY_SORT_ORDER: TaskEnergy[] = ["none", "low", "medium", "high"];
const REPEAT_SORT_ORDER: TaskRepeat[] = ["none", "daily", "weekly", "monthly", "custom"];
const STATUS_SORT_ORDER: TaskStatus[] = [
  "pending",
  "in_progress",
  "done",
  "did_my_best",
  "missed",
  "upcoming",
  "not_due",
  "archived",
  "trashed",
];

function offsetDate(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function nextWeekdayIso(targetDay: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const currentDay = date.getDay();
  let distance = (targetDay - currentDay + 7) % 7;
  if (distance === 0) {
    distance = 7;
  }
  date.setDate(date.getDate() + distance);
  return date.toISOString().slice(0, 10);
}

function formatDuration(minutes: number | null) {
  if (!minutes || minutes <= 0) {
    return "No est";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function formatActual(seconds: number) {
  if (!seconds || seconds <= 0) {
    return "0m";
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function getTimerDisplaySeconds(timer: RunningTaskTimer, now: number) {
  const endTime = timer.pausedAt ?? now;
  return timer.baseSeconds + Math.max(0, Math.floor((endTime - timer.startedAt) / 1000));
}

function formatMinutesChip(minutes: number | null) {
  return formatDuration(minutes);
}

function formatCalendarDate(value: string) {
  const [year, month, day] = value.split("-").map((segment) => Number.parseInt(segment, 10));
  if (!year || !month || !day) {
    return value;
  }
  return `${month}-${day}-${year}`;
}

function formatClockTime(value: string) {
  const [hourText, minuteText] = value.split(":");
  const hour = Number.parseInt(hourText ?? "", 10);
  const minute = Number.parseInt(minuteText ?? "", 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return value;
  }
  const suffix = hour >= 12 ? "pm" : "am";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")}${suffix}`;
}

function formatEntryTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString([], {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDue(dueOn: string, dueTime: string) {
  const dateLabel = !dueOn
    ? "No date"
    : dueOn === offsetDate(0)
      ? "Today"
      : dueOn === offsetDate(1)
        ? "Tomorrow"
        : formatCalendarDate(dueOn);

  return dueTime ? `${dateLabel} · ${formatClockTime(dueTime)}` : dateLabel;
}

const CHILD_TASK_PREVIEW_ITEM_LIMIT = 12;

function formatChildTaskPreviewSchedule(item: ChildTaskPreview) {
  if (item.dueOn || item.dueTime) {
    return formatDue(item.dueOn ?? "", item.dueTime ?? "");
  }
  if (item.scheduledOn) {
    return `Scheduled ${formatDue(item.scheduledOn, "")}`;
  }
  return "";
}

function formatChildTaskPreviewEstimate(minutes: number | null) {
  if (!minutes || minutes <= 0) {
    return "";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatChildTaskPreviewRepeat(item: ChildTaskPreview) {
  const repeatLabel = REPEAT_OPTIONS.find((option) => option.value === item.repeat)?.label ?? item.repeat;
  if (item.repeat === "none") {
    return repeatLabel;
  }
  return item.repeatInterval > 1 ? `${repeatLabel} · ${item.repeatInterval}` : repeatLabel;
}

function formatInvalidChildLinkCount(count: number) {
  return count === 1 ? "1 invalid step link" : `${count} invalid step links`;
}

function SameTableStepCreationControl({
  creationBlocked,
  iconOnly = false,
  onCreateChildTask,
  parentTaskId,
}: {
  creationBlocked?: boolean;
  iconOnly?: boolean;
  onCreateChildTask?: (parentTaskId: string, title: string) => Promise<{ error: string | null; taskId: string | null }>;
  parentTaskId: string;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [creationError, setCreationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const showCreationBlockedMessage = Boolean(onCreateChildTask) && creationBlocked;

  useEffect(() => {
    if (isCreating) {
      inputRef.current?.focus();
    }
  }, [isCreating]);

  async function handleCreateChildTask() {
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setCreationError("Enter a step title.");
      return;
    }
    if (!onCreateChildTask || creationBlocked) {
      setCreationError("Step creation is blocked for this task.");
      return;
    }

    setIsSubmitting(true);
    setCreationError(null);
    const result = await onCreateChildTask(parentTaskId, nextTitle);
    setIsSubmitting(false);

    if (result.error || !result.taskId) {
      setCreationError(result.error ?? "Step was not created.");
      return;
    }

    setTitleDraft("");
    setIsCreating(false);
  }

  function cancelCreateChildTask() {
    setTitleDraft("");
    setCreationError(null);
    setIsCreating(false);
  }

  if (!onCreateChildTask) {
    return null;
  }

  if (showCreationBlockedMessage) {
    return (
      <p className="text-xs text-[#9a7a24] dark:text-[#f3d38a]">Step creation is blocked until the hierarchy issue is fixed.</p>
    );
  }

  if (!isCreating) {
    if (iconOnly) {
      return (
        <button
          aria-label="Add Step"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#ddd2ff] bg-white text-[#6f57f6] transition hover:bg-[#f7f3ff] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]"
          data-step-row-add={parentTaskId}
          onClick={() => {
            setCreationError(null);
            setIsCreating(true);
          }}
          type="button"
        >
          <Footprints className="h-3.5 w-3.5" />
        </button>
      );
    }

    return (
      <TaskTableChipButton
        onClick={() => {
          setCreationError(null);
          setIsCreating(true);
        }}
        toneClassName="border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]"
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#ddd2ff] bg-white text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]" aria-hidden="true">
          <Footprints className="h-3 w-3" />
        </span>
        Add Step
      </TaskTableChipButton>
    );
  }

  return (
    <div className="w-full">
      {showCreationBlockedMessage ? (
        <p className="mt-2 text-xs text-[#9a7a24] dark:text-[#f3d38a]">Step creation is blocked until the hierarchy issue is fixed.</p>
      ) : null}
      <form
        className="rounded-[0.85rem] border border-[#e5dcfb] bg-white p-2 dark:border-white/10 dark:bg-[#1b1530]/80"
        onSubmit={(event) => {
          event.preventDefault();
          void handleCreateChildTask();
        }}
      >
        <label className="block">
          <span className="sr-only">Step title</span>
          <input
            className={`${OVERLAY_INPUT_CLASS} h-10 rounded-[0.8rem] text-sm`}
            disabled={isSubmitting}
            onChange={(event) => {
              setTitleDraft(event.target.value);
              if (creationError) {
                setCreationError(null);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelCreateChildTask();
              }
            }}
            placeholder="Step title"
            ref={inputRef}
            value={titleDraft}
          />
        </label>
        {creationError ? <p className="mt-2 text-xs text-[#d94e67] dark:text-[#ff9eaf]">{creationError}</p> : null}
        <div className="mt-2 flex flex-wrap justify-end gap-1.5">
          <TaskTableChipButton onClick={cancelCreateChildTask} toneClassName={INACTIVE_CHIP_CLASS}>Cancel</TaskTableChipButton>
          <TaskTableChipButton
            disabled={isSubmitting}
            type="submit"
            toneClassName="border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]"
          >
            {isSubmitting ? "Adding..." : "Add"}
          </TaskTableChipButton>
        </div>
      </form>
    </div>
  );
}

function statusTone(status: TaskStatus) {
  return TASK_STATUS_CHIP_STYLES[status] ?? "bg-[#f4f5f8] border border-[#e4deef] text-[#6b7285] dark:bg-white/8 dark:border-white/10 dark:text-white/60";
}

function energyTone(energy: TaskEnergy) {
  if (energy === "high") return "border-[#ffd6de] bg-[#fff1f3] text-[#d94e67] dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf]";
  if (energy === "medium") return "border-[#f2df9b] bg-[#fff6df] text-[#b77900] dark:border-[#6b5317] dark:bg-[#44350d] dark:text-[#ffd56b]";
  if (energy === "low") return "border-[#c7eedc] bg-[#e8fbf2] text-[#119a69] dark:border-[#275443] dark:bg-[#16352c] dark:text-[#7de4b8]";
  return "border-[#e4deef] bg-[#f4f5f8] text-[#68738c] dark:border-white/10 dark:bg-white/8 dark:text-white/60";
}

function priorityTone(priority: TaskPriority) {
  if (priority === "focus") return "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]";
  if (priority === "important") return "border-[#ffd8be] bg-[#fff1e7] text-[#dc6c1c] dark:border-[#65401d] dark:bg-[#432712] dark:text-[#ffb37e]";
  return "border-[#ffd6de] bg-[#fff1f3] text-[#d94e67] dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf]";
}

function repeatTone(repeat: TaskRepeat) {
  return repeat === "none"
    ? "border-[#e4deef] bg-[#f4f5f8] text-[#68738c] dark:border-white/10 dark:bg-white/8 dark:text-white/60"
    : "border-[#ddd2ff] bg-[#efe9ff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]";
}

function inlineAccordionButtonClass() {
  return `${CONTROL_FONT_CLASS} shrink-0 appearance-none bg-transparent p-0 border-0 shadow-none`;
}

function inlineAccordionChipContentClass(tone: string) {
  return `${CHIP_BASE} ${tone}`;
}

const ROW_ACTION_ICON_BUTTON_CLASS = "inline-flex h-7 w-7 flex-none items-center justify-center rounded-full border border-transparent bg-transparent text-[#6f57f6] opacity-78 transition hover:border-[#ddd2ff] hover:bg-[#f3efff] hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:text-[#cabfff] dark:hover:border-[#42306f] dark:hover:bg-[#22193f] dark:focus-visible:ring-[#3b2f68]/90";
const ROW_ACTION_DANGER_ICON_BUTTON_CLASS = "inline-flex h-7 w-7 flex-none items-center justify-center rounded-full border border-transparent bg-transparent text-[#d94e67] opacity-72 transition hover:border-[#ffd6de] hover:bg-[#fff1f3] hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd6de]/80 dark:text-[#ff9eaf] dark:hover:border-[#5b2e3b] dark:hover:bg-[#44232f] dark:focus-visible:ring-[#5b2e3b]/90";

function inlineAccordionInputCardClass(widthClass = "w-[15rem]") {
  return `shrink-0 rounded-[1rem] border border-[#ece7f5] bg-[#fbfaff] p-2.5 dark:border-white/10 dark:bg-white/[0.04] ${widthClass}`;
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function formatStatusLabel(status: TaskStatus) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function formatPriorityLabel(priority: TaskPriority) {
  return PRIORITY_OPTIONS.find((option) => option.value === priority)?.label ?? priority;
}

function formatEnergyLabel(energy: TaskEnergy) {
  return ENERGY_OPTIONS.find((option) => option.value === energy)?.label ?? energy;
}

function statusSortValue(status: TaskStatus) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function dueSortValue(task: PrototypeTaskRow) {
  if (!task.dueOn) {
    return Number.POSITIVE_INFINITY;
  }

  const timestamp = Date.parse(`${task.dueOn}T${task.dueTime || "23:59"}:00`);
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function dateAddedSortValue(task: PrototypeTaskRow) {
  const timestamp = Date.parse(task.createdAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function dateCompletedSortValue(task: PrototypeTaskRow) {
  if (!task.completedAt) {
    return Number.POSITIVE_INFINITY;
  }
  const timestamp = Date.parse(task.completedAt);
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function stopRowActionPointerEvent(event: ReactPointerEvent<HTMLElement>) {
  event.stopPropagation();
}

function TaskTitleDraftInput({
  autoFocus = false,
  className,
  initialValue,
  onCommit,
  onDraftChange,
  onDone,
  style,
  taskId,
}: {
  autoFocus?: boolean;
  className: string;
  initialValue: string;
  onCommit: (taskId: string) => void;
  onDraftChange: (taskId: string, draft: string) => void;
  onDone?: () => void;
  style?: CSSProperties;
  taskId: string;
}) {
  const [draft, setDraft] = useState(initialValue);

  useEffect(() => {
    setDraft(initialValue);
  }, [initialValue, taskId]);

  return (
    <input
      autoFocus={autoFocus}
      className={className}
      onBlur={() => {
        onDraftChange(taskId, draft);
        onCommit(taskId);
        onDone?.();
      }}
      onChange={(event) => {
        const nextValue = event.target.value;
        setDraft(nextValue);
        onDraftChange(taskId, nextValue);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onDraftChange(taskId, draft);
          onCommit(taskId);
          onDone?.();
        }
      }}
      placeholder="Rename task"
      style={style}
      type="text"
      value={draft}
    />
  );
}

function textSortValue(task: PrototypeTaskRow, columnId: SortColumnId) {
  switch (columnId) {
    case "title":
      return task.title;
    case "lists":
      return task.lists.join(", ");
    case "tags":
      return task.tags.join(", ");
    case "link":
      return task.linkLabel || "No link";
    case "notes":
      return task.notes;
    case "priority":
      return task.priorities.join(", ");
    case "energy":
      return task.energy;
    case "repeat":
      return REPEAT_OPTIONS.find((option) => option.value === task.repeat)?.label ?? task.repeat;
    default:
      return "";
  }
}

function textFilterValue(task: PrototypeTaskRow, columnId: TextFilterColumnId) {
  if (columnId === "link") {
    return [task.linkLabel, task.linkUrl].filter(Boolean).join(" ");
  }

  return textSortValue(task, columnId);
}

function isTextFilterColumn(columnId: SortColumnId): columnId is TextFilterColumnId {
  return columnId === "title" || columnId === "lists" || columnId === "tags" || columnId === "link" || columnId === "notes";
}

function isStructuredFilterColumn(columnId: SortColumnId): columnId is StructuredFilterColumnId {
  return columnId === "status" || columnId === "priority" || columnId === "energy" || columnId === "repeat";
}

function prioritySortValue(task: PrototypeTaskRow) {
  if (task.priorities.length === 0) {
    return -1;
  }

  return Math.max(...task.priorities.map((priority) => PRIORITY_SORT_ORDER.indexOf(priority)));
}

function energySortValue(task: PrototypeTaskRow) {
  return ENERGY_SORT_ORDER.indexOf(task.energy);
}

function repeatSortValue(task: PrototypeTaskRow) {
  return REPEAT_SORT_ORDER.indexOf(task.repeat);
}

function statusOrderValue(task: PrototypeTaskRow) {
  return STATUS_SORT_ORDER.indexOf(task.status);
}

function hasActiveTimer(task: PrototypeTaskRow, activeTaskTimerIds: Set<string>) {
  return activeTaskTimerIds.has(task.id);
}

function numberSortValue(
  task: PrototypeTaskRow,
  columnId: SortColumnId,
  options?: { activeTaskTimerIds?: Set<string>; liveActualSecondsByTaskId?: Map<string, number> },
) {
  if (columnId === "estimated") {
    return task.estimatedMinutes ?? Number.POSITIVE_INFINITY;
  }

  if (columnId === "actual") {
    return options?.liveActualSecondsByTaskId?.get(task.id) ?? task.actualSeconds;
  }

  return task.actualSeconds;
}

function sortRows(
  rows: PrototypeTaskRow[],
  columnId: SortColumnId,
  optionId: SortOptionId,
  options?: { activeTaskTimerIds?: Set<string>; liveActualSecondsByTaskId?: Map<string, number> },
) {
  const sorted = [...rows];

  sorted.sort((left, right) => {
    if (columnId === "date_completed" && Boolean(left.completedAt) !== Boolean(right.completedAt)) {
      return left.completedAt ? -1 : 1;
    }

    let comparison = 0;

    if (optionId === "text_asc" || optionId === "text_desc") {
      comparison = compareText(textSortValue(left, columnId), textSortValue(right, columnId));
    } else if (optionId === "active_first") {
      comparison = Number(hasActiveTimer(right, options?.activeTaskTimerIds ?? new Set<string>()))
        - Number(hasActiveTimer(left, options?.activeTaskTimerIds ?? new Set<string>()));
      if (comparison === 0) {
        comparison = numberSortValue(right, "actual", options) - numberSortValue(left, "actual", options);
      }
    } else if (optionId === "number_asc" || optionId === "number_desc") {
      comparison = numberSortValue(left, columnId, options) - numberSortValue(right, columnId, options);
    } else if (optionId === "date_asc" || optionId === "date_desc") {
      const leftDate = columnId === "date_completed" ? dateCompletedSortValue(left) : dateAddedSortValue(left);
      const rightDate = columnId === "date_completed" ? dateCompletedSortValue(right) : dateAddedSortValue(right);
      comparison = leftDate - rightDate;
    } else if (optionId === "due_asc" || optionId === "due_desc") {
      comparison = dueSortValue(left) - dueSortValue(right);
    } else if (optionId === "priority_asc" || optionId === "priority_desc") {
      comparison = prioritySortValue(left) - prioritySortValue(right);
    } else if (optionId === "energy_asc" || optionId === "energy_desc") {
      comparison = energySortValue(left) - energySortValue(right);
    } else if (optionId === "repeat_asc" || optionId === "repeat_desc") {
      comparison = repeatSortValue(left) - repeatSortValue(right);
    } else {
      comparison = statusOrderValue(left) - statusOrderValue(right);
    }

    if (comparison !== 0) {
      return optionId.endsWith("desc") ? -comparison : comparison;
    }

    return compareText(left.title, right.title);
  });

  return sorted;
}

export function TaskManagementTableV2({
  allowInlineInspector = false,
  allListOptions = [],
  allNoteOptions = [],
  allTagOptions = [],
  childTaskCreationBlockedTaskIds = [],
  childTaskPreviewByParentTaskId = {},
  className = "",
  currentListLabel = null,
  enableInspector = true,
  overlayNode,
  onInspectorClose,
  onClearSelection,
  onCreateChildTask,
  onCreateTaskList,
  onOpenBatchDelete,
  onOpenBatchEdit,
  onOpenDeleteTask,
  onDuplicateTask,
  onRestoreTask,
  onOpenTaskHistory,
  onOpenNote,
  onOpenTaskActualTime,
  onOpenTaskEditor,
  onOpenChildTask,
  onReorderChildTask,
  onLoadMoreRows,
  onRequestedOpenTaskHandled,
  onFollowDetachedTask,
  onDismissDetachedTask,
  onPreviousTaskTimer,
  onNextTaskTimer,
  onDeleteTaskActualTimeEntry,
  onPauseTaskTimer,
  onResumeTaskTimer,
  onStartTaskTimer,
  onStopTaskTimer,
  onTaskActualSecondsChange,
  taskActualTimeEntriesByTaskId,
  onTaskDueChange,
  onTaskEnergyChange,
  onTaskEstimatedMinutesChange,
  onTaskLinkChange,
  onTaskLinkedNoteIdsChange,
  onTaskNotesChange,
  onTaskPriorityChange,
  onRowClick,
  onSelectAllVisible,
  onTaskRepeatChange,
  onTaskStatusChange,
  onTaskSubtaskAdd,
  onTaskSubtaskAddChild,
  onTaskSubtasksAutoResetChange,
  onTaskSubtaskDelete,
  onTaskSubtaskRename,
  onTaskSubtaskStatusChange,
  onTaskTagsChange,
  onTaskTitleChange,
  onToggleTaskSelection,
  onToggleTaskList,
  shellClassName = "",
  primaryBadgeLabel = "Inspired by server table UI",
  rows = DEFAULT_ROWS,
  runningTaskTimers,
  searchMatchedStepParentTaskIds = [],
  requestedOpenTaskId = null,
  requestedOpenTask = null,
  suppressDetachedNoticeTaskId = null,
  selectedTaskIds = [],
  secondaryBadgeLabel = "Test page only",
  showHeader = true,
  shrinkAllColumnsToken = 0,
  taskTimerNow,
  title = "Table #2 Prototype",
  visibleColumns,
  activeTaskTimerIndex,
  getFollowTaskDestination,
  hasMoreRows = false,
}: TaskManagementTableV2Props) {
  const shouldReduceMotion = useReducedMotion();
  const [tasks, setTasks] = useState<PrototypeTaskRow[]>(rows);
  const [renderedTaskCount, setRenderedTaskCount] = useState(INITIAL_RENDERED_TASK_COUNT);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [retainedSelectedTask, setRetainedSelectedTask] = useState<PrototypeTaskRow | null>(null);
  const [metadataTargetTaskId, setMetadataTargetTaskId] = useState<string | null>(null);
  const [retainedMetadataTargetTask, setRetainedMetadataTargetTask] = useState<PrototypeTaskRow | null>(null);
  const [selectedTaskLeftCurrentList, setSelectedTaskLeftCurrentList] = useState(false);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>("full");
  const [overlayAnchor, setOverlayAnchor] = useState<{ left: number; top: number } | null>(null);
  const [editingTaskTitleId, setEditingTaskTitleId] = useState<string | null>(null);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [autofocusSubtaskId, setAutofocusSubtaskId] = useState<string | null>(null);
  const [dueDrafts, setDueDrafts] = useState<Record<string, { dueOn: string; dueTime: string }>>({});
  const [estimatedMinutesDrafts, setEstimatedMinutesDrafts] = useState<Record<string, string>>({});
  const titleDraftsRef = useRef<Record<string, string>>({});
  const [subtaskTitleDrafts, setSubtaskTitleDrafts] = useState<Record<string, string>>({});
  const [linkDrafts, setLinkDrafts] = useState<Record<string, { label: string; url: string }>>({});
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});
  const [linkedNoteDrafts, setLinkedNoteDrafts] = useState<Record<string, string[]>>({});
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [listDrafts, setListDrafts] = useState<Record<string, string>>({});
  const [repeatIntervalDrafts, setRepeatIntervalDrafts] = useState<Record<string, string>>({});
  const [repeatDayOfMonthDrafts, setRepeatDayOfMonthDrafts] = useState<Record<string, string>>({});
  const [collapsedOverlaySectionsByTaskId, setCollapsedOverlaySectionsByTaskId] = useState<Record<string, Partial<Record<OverlaySectionId, boolean>>>>({});
  const [activeMetadataPanelByTaskId, setActiveMetadataPanelByTaskId] = useState<Record<string, MetadataPanelId>>({});
  const [notePickerOpenByTaskId, setNotePickerOpenByTaskId] = useState<Record<string, boolean>>({});
  const [expandedSubtasksByTaskId, setExpandedSubtasksByTaskId] = useState<Record<string, boolean>>({});
  const [expandedStepsByTaskId, setExpandedStepsByTaskId] = useState<Record<string, boolean>>({});
  const [collapsedChildTaskIds, setCollapsedChildTaskIds] = useState<Record<string, boolean>>({});
  const [childTaskDragState, setChildTaskDragState] = useState<ChildTaskDragState | null>(null);
  const [childTaskDropTarget, setChildTaskDropTarget] = useState<ChildTaskDropTarget | null>(null);
  const childTaskDragStateRef = useRef<ChildTaskDragState | null>(null);
  const childTaskDropTargetRef = useRef<ChildTaskDropTarget | null>(null);
  const [tableStepDraftParentId, setTableStepDraftParentId] = useState<string | null>(null);
  const [tableStepTitleDrafts, setTableStepTitleDrafts] = useState<Record<string, string>>({});
  const [tableStepCreationErrorByParentId, setTableStepCreationErrorByParentId] = useState<Record<string, string | null>>({});
  const tableStepDraftInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingSubtaskAutoExpandByTaskId, setPendingSubtaskAutoExpandByTaskId] = useState<Record<string, boolean>>({});
  const [hiddenSubtaskIds, setHiddenSubtaskIds] = useState<Record<string, boolean>>({});
  const [openColumnMenuId, setOpenColumnMenuId] = useState<SortColumnId | null>(null);
  const [columnMenuPosition, setColumnMenuPosition] = useState<ColumnMenuPosition | null>(null);
  const [rowContextMenu, setRowContextMenu] = useState<RowContextMenuState | null>(null);
  const [sortState, setSortState] = useState<{ columnId: SortColumnId; optionId: SortOptionId } | null>(() => getInitialSortState());
  const [textFilters, setTextFilters] = useState<Partial<Record<TextFilterColumnId, string>>>({});
  const [structuredFilters, setStructuredFilters] = useState<StructuredFilters>(DEFAULT_STRUCTURED_FILTERS);
  const [columnWidths, setColumnWidths] = useState<Record<TaskManagementTableColumnId, number>>(() => getInitialColumnWidths());
  const [requiredColumnWidths, setRequiredColumnWidths] = useState<Record<TaskManagementTableColumnId, number>>(DEFAULT_COLUMN_WIDTHS);
  const [columnOrder, setColumnOrder] = useState<TaskManagementTableColumnId[]>(() => getInitialColumnOrder());
  const [columnAlignments, setColumnAlignments] = useState<Partial<Record<TaskManagementTableColumnId, ColumnAlignment>>>(() => getInitialColumnAlignments());
  const [statusDisplayMode, setStatusDisplayMode] = useState<"chip" | "circle">(() => getInitialStatusDisplayMode());

  useEffect(() => {
    if (tableStepDraftParentId) {
      tableStepDraftInputRef.current?.focus();
    }
  }, [tableStepDraftParentId]);
  const [localRunningTimers, setLocalRunningTimers] = useState<RunningTaskTimer[]>([]);
  const [localActiveTimerIndex, setLocalActiveTimerIndex] = useState(0);
  const [localTimerNow, setLocalTimerNow] = useState(() => Date.now());
  const draggedHeaderColumnIdRef = useRef<TaskManagementTableColumnId | null>(null);
  const columnMenuRef = useRef<HTMLDivElement | null>(null);
  const rowContextMenuRef = useRef<HTMLDivElement | null>(null);
  const loadMoreTasksRef = useRef<HTMLDivElement | null>(null);
  const resizeStateRef = useRef<{ columnId: TaskManagementTableColumnId; startWidth: number; startX: number } | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const inspectorPanelRef = useRef<HTMLDivElement | null>(null);
  const tableScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [showTableScrollUp, setShowTableScrollUp] = useState(false);
  const [quickEditTargetTaskIds, setQuickEditTargetTaskIds] = useState<string[] | null>(null);
  const hasSeenSelectedTaskInCurrentListRef = useRef(false);
  const lastShrinkAllColumnsTokenRef = useRef(0);
  const lastRowsSignatureRef = useRef(buildPrototypeRowsSignature(rows));
  const pendingRowClickTimeoutRef = useRef<number | null>(null);
  const pendingMetadataTargetTaskIdRef = useRef<string | null>(null);
  const recentInlineCommitRef = useRef<Map<string, { expiresAt: number; value: string }>>(new Map());
  const effectiveRunningTimers = runningTaskTimers ?? localRunningTimers;
  const effectiveActiveTimerIndex = activeTaskTimerIndex ?? localActiveTimerIndex;
  const effectiveTimerNow = taskTimerNow ?? localTimerNow;
  const activeTaskTimerIds = useMemo(
    () => new Set(effectiveRunningTimers.map((timer) => timer.taskId)),
    [effectiveRunningTimers],
  );
  const liveActualSecondsByTaskId = useMemo(
    () => new Map(effectiveRunningTimers.map((timer) => [timer.taskId, getTimerDisplaySeconds(timer, effectiveTimerNow)])),
    [effectiveRunningTimers, effectiveTimerNow],
  );

  const statusSummary = useMemo(() => {
    const active = tasks.filter((task) => task.status !== "done").length;
    const done = tasks.filter((task) => task.status === "done").length;
    return { active, done };
  }, [tasks]);

  const selectedTaskFromRows = useMemo(
    () => (selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) ?? null : null),
    [selectedTaskId, tasks],
  );
  const selectedTask = useMemo(
    () => selectedTaskFromRows ?? (selectedTaskId && retainedSelectedTask?.id === selectedTaskId ? retainedSelectedTask : null),
    [retainedSelectedTask, selectedTaskFromRows, selectedTaskId],
  );
  const metadataTargetTaskFromRows = useMemo(
    () => (metadataTargetTaskId ? tasks.find((task) => task.id === metadataTargetTaskId) ?? null : null),
    [metadataTargetTaskId, tasks],
  );
  const metadataTargetTask = useMemo(
    () => metadataTargetTaskFromRows
      ?? (metadataTargetTaskId && retainedMetadataTargetTask?.id === metadataTargetTaskId ? retainedMetadataTargetTask : null),
    [metadataTargetTaskFromRows, metadataTargetTaskId, retainedMetadataTargetTask],
  );
  const childTaskParentInfoByTaskId = useMemo(() => {
    const taskTitleById = new Map(tasks.map((task) => [task.id, task.title]));
    if (retainedSelectedTask) {
      taskTitleById.set(retainedSelectedTask.id, retainedSelectedTask.title);
    }

    const parentInfo = new Map<string, { depth: number; parentTaskId: string; parentTitle: string }>();
    for (const [groupParentTaskId, group] of Object.entries(childTaskPreviewByParentTaskId)) {
      for (const item of group.items) {
        const parentTaskId = item.parentTaskId ?? groupParentTaskId;
        parentInfo.set(item.id, {
          depth: item.depth,
          parentTaskId,
          parentTitle: taskTitleById.get(parentTaskId) ?? "Parent task",
        });
      }
    }
    return parentInfo;
  }, [childTaskPreviewByParentTaskId, retainedSelectedTask, tasks]);
  const selectedTaskParentInfo = selectedTaskId ? childTaskParentInfoByTaskId.get(selectedTaskId) ?? null : null;
  const selectedTaskIsDetached = Boolean(selectedTaskId && selectedTask && !selectedTaskFromRows && selectedTaskLeftCurrentList);
  const selectedTaskFollowDestination = useMemo(
    () => (selectedTaskIsDetached && selectedTaskId ? getFollowTaskDestination?.(selectedTaskId) ?? null : null),
    [getFollowTaskDestination, selectedTaskId, selectedTaskIsDetached],
  );
  const rowContextMenuTask = useMemo(
    () => (rowContextMenu ? tasks.find((task) => task.id === rowContextMenu.taskId) ?? null : null),
    [rowContextMenu, tasks],
  );
  const selectedTaskActualTimeEntries = useMemo(
    () => (selectedTask ? taskActualTimeEntriesByTaskId?.[selectedTask.id] ?? [] : []),
    [selectedTask, taskActualTimeEntriesByTaskId],
  );
  const visibleHeaderColumns = useMemo(() => {
    const nextVisible = !visibleColumns || visibleColumns.length === 0
      ? HEADER_COLUMNS.map((column) => column.id)
      : ["status_icon", "title", ...visibleColumns.filter((columnId) => columnId !== "status_icon" && columnId !== "title")];

    return columnOrder
      .filter((columnId) => nextVisible.includes(columnId))
      .map((columnId) => HEADER_COLUMNS.find((column) => column.id === columnId))
      .filter((column): column is HeaderColumn => Boolean(column));
  }, [columnOrder, visibleColumns]);
  const openColumnMenuColumn = useMemo(
    () => (openColumnMenuId ? visibleHeaderColumns.find((column) => column.id === openColumnMenuId) ?? null : null),
    [openColumnMenuId, visibleHeaderColumns],
  );
  const effectiveColumnWidths = useMemo(
    () => visibleHeaderColumns.reduce<Record<TaskManagementTableColumnId, number>>((accumulator, column) => {
      accumulator[column.id] = Math.max(columnWidths[column.id], requiredColumnWidths[column.id] ?? MIN_COLUMN_WIDTHS[column.id]);
      return accumulator;
    }, { ...columnWidths }),
    [columnWidths, requiredColumnWidths, visibleHeaderColumns],
  );
  const gridTemplateColumns = useMemo(
    () => visibleHeaderColumns.map((column) => `${effectiveColumnWidths[column.id]}px`).join(" "),
    [effectiveColumnWidths, visibleHeaderColumns],
  );
  const displayedTasks = useMemo(() => {
    const startedAt = process.env.NODE_ENV !== "production" ? performance.now() : 0;
    const filtered = tasks.filter((task) =>
      Object.entries(textFilters).every(([columnId, query]) => {
        const normalizedQuery = query?.trim().toLowerCase();
        if (!normalizedQuery) {
          return true;
        }

        return textFilterValue(task, columnId as TextFilterColumnId).toLowerCase().includes(normalizedQuery);
      })
      && (structuredFilters.status.length === 0 || structuredFilters.status.includes(task.status))
      && (structuredFilters.priority.length === 0 || task.priorities.some((priority) => structuredFilters.priority.includes(priority)))
      && (structuredFilters.energy.length === 0 || structuredFilters.energy.includes(task.energy))
      && (structuredFilters.repeat.length === 0 || structuredFilters.repeat.includes(task.repeat)));

    const nextDisplayedTasks = sortState
      ? sortRows(filtered, sortState.columnId, sortState.optionId, {
        activeTaskTimerIds,
        liveActualSecondsByTaskId,
      })
      : filtered;

    if (process.env.NODE_ENV !== "production") {
      const message = `[tasks:list-switch] table filtered/sorted in ${Math.round(performance.now() - startedAt)}ms for ${nextDisplayedTasks.length} rows`;
      console.info(message);
      if (typeof window !== "undefined") {
        window.__ADHDICE_TASK_LIST_SWITCH_LOGS__ ??= [];
        window.__ADHDICE_TASK_LIST_SWITCH_LOGS__.push(message);
      }
    }

    return nextDisplayedTasks;
  }, [activeTaskTimerIds, liveActualSecondsByTaskId, sortState, structuredFilters, tasks, textFilters]);
  const tableFilterSignature = useMemo(
    () => JSON.stringify({ sortState, structuredFilters, textFilters }),
    [sortState, structuredFilters, textFilters],
  );
  const sourceRowsKey = useMemo(
    () => rows.map((row) => row.id).join("\u001f"),
    [rows],
  );
  const visibleTaskIds = useMemo(
    () => displayedTasks.map((task) => task.id),
    [displayedTasks],
  );
  const searchMatchedStepParentTaskIdSet = useMemo(
    () => new Set(searchMatchedStepParentTaskIds),
    [searchMatchedStepParentTaskIds],
  );
  const collapsedChildTaskIdSet = useMemo(
    () => new Set(Object.entries(collapsedChildTaskIds).flatMap(([taskId, isCollapsed]) => (isCollapsed ? [taskId] : []))),
    [collapsedChildTaskIds],
  );

  const clearChildTaskDragState = () => {
    childTaskDragStateRef.current = null;
    childTaskDropTargetRef.current = null;
    setChildTaskDragState(null);
    setChildTaskDropTarget(null);
  };

  const beginChildTaskDrag = (event: ReactPointerEvent<HTMLButtonElement> | ReactDragEvent<HTMLButtonElement>, item: ChildTaskPreview) => {
    event.stopPropagation();
    const nextDragState = {
      depth: item.depth,
      parentTaskId: item.parentTaskId,
      taskId: item.id,
    };
    childTaskDragStateRef.current = nextDragState;
    childTaskDropTargetRef.current = null;
    setChildTaskDragState(nextDragState);
    setChildTaskDropTarget(null);
    if ("dataTransfer" in event) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", item.id);
    }
  };

  const getChildTaskDropPlacement = (event: ReactDragEvent<HTMLElement>): TaskSiblingDropPlacement => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
  };

  const canDropChildTaskOnItem = (item: ChildTaskPreview) => {
    const dragState = childTaskDragStateRef.current;
    return Boolean(
      dragState
      && dragState.taskId !== item.id
      && dragState.parentTaskId === item.parentTaskId
      && dragState.depth === item.depth,
    );
  };

  const updateChildTaskDropTarget = (event: ReactDragEvent<HTMLElement>, item: ChildTaskPreview) => {
    if (!canDropChildTaskOnItem(item)) {
      if (childTaskDropTargetRef.current) {
        childTaskDropTargetRef.current = null;
        setChildTaskDropTarget(null);
      }
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const nextDropTarget = { placement: getChildTaskDropPlacement(event), taskId: item.id };
    const currentDropTarget = childTaskDropTargetRef.current;
    if (currentDropTarget?.taskId === nextDropTarget.taskId && currentDropTarget.placement === nextDropTarget.placement) {
      return;
    }
    childTaskDropTargetRef.current = nextDropTarget;
    setChildTaskDropTarget(nextDropTarget);
  };

  const dropChildTaskOnItem = (event: ReactDragEvent<HTMLElement>, item: ChildTaskPreview) => {
    const dragState = childTaskDragStateRef.current;
    if (!dragState || !canDropChildTaskOnItem(item)) {
      clearChildTaskDragState();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const placement = getChildTaskDropPlacement(event);
    onReorderChildTask?.(dragState.taskId, { placement, targetTaskId: item.id });
    clearChildTaskDragState();
  };

  const getChildTaskDropIndicatorClassName = (itemId: string) => {
    if (childTaskDropTarget?.taskId !== itemId) {
      return "";
    }

    return childTaskDropTarget.placement === "before"
      ? "shadow-[inset_0_2px_0_rgba(111,87,246,0.75)]"
      : "shadow-[inset_0_-2px_0_rgba(111,87,246,0.75)]";
  };
  const renderedTasks = useMemo(
    () => displayedTasks.slice(0, renderedTaskCount),
    [displayedTasks, renderedTaskCount],
  );
  const remainingRenderedTaskCount = Math.max(0, displayedTasks.length - renderedTasks.length);
  const hasActiveFilters = useMemo(
    () => Object.values(textFilters).some((value) => Boolean(value?.trim()))
      || structuredFilters.status.length > 0
      || structuredFilters.priority.length > 0
      || structuredFilters.energy.length > 0
      || structuredFilters.repeat.length > 0,
    [structuredFilters, textFilters],
  );
  const selectedTaskIdSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
  const rowContextMenuQuickEditTargetIds = useMemo(
    () => rowContextMenu?.taskId && selectedTaskIdSet.has(rowContextMenu.taskId) && selectedTaskIds.length > 1
      ? Array.from(new Set(selectedTaskIds))
      : rowContextMenu?.taskId
        ? [rowContextMenu.taskId]
        : [],
    [rowContextMenu, selectedTaskIdSet, selectedTaskIds],
  );
  const rowContextMenuHasBatchQuickEdit = rowContextMenuQuickEditTargetIds.length > 1;
  const shouldAnimateRows = !shouldReduceMotion && displayedTasks.length <= 80;
  const tableRowVariants: Variants | undefined = shouldAnimateRows
    ? {
        hidden: {
          opacity: 0,
          x: -8,
          scale: 0.995,
        },
        visible: {
          opacity: 1,
          x: 0,
          scale: 1,
          transition: {
            type: "spring",
            stiffness: 320,
            damping: 30,
            mass: 0.72,
          },
        },
      }
    : undefined;
  const measurementSignature = useMemo(
    () => buildPrototypeRowsSignature(displayedTasks.slice(0, 12)),
    [displayedTasks],
  );

  useEffect(() => {
    setRenderedTaskCount(Math.min(INITIAL_RENDERED_TASK_COUNT, displayedTasks.length));
  }, [displayedTasks.length, sourceRowsKey, tableFilterSignature]);

  useEffect(() => {
    if (remainingRenderedTaskCount <= 0 && !hasMoreRows) {
      return;
    }

    const sentinel = loadMoreTasksRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") {
      return;
    }

    const loadNextBatch = () => {
      if (remainingRenderedTaskCount > 0) {
        startTransition(() => {
          setRenderedTaskCount((current) => Math.min(current + RENDERED_TASK_BATCH_SIZE, displayedTasks.length));
        });
        return;
      }

      onLoadMoreRows?.();
    };
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadNextBatch();
      }
    }, { rootMargin: "720px 0px" });

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [displayedTasks.length, hasMoreRows, onLoadMoreRows, remainingRenderedTaskCount]);

  useEffect(() => {
    if (!requestedOpenTaskId) {
      return;
    }

    const requestedVisibleTask = tasks.find((task) => task.id === requestedOpenTaskId) ?? null;
    const requestedRetainedTask = requestedOpenTask?.id === requestedOpenTaskId ? requestedOpenTask : null;
    const requestedTask = requestedVisibleTask ?? requestedRetainedTask;

    if (!requestedTask) {
      return;
    }

    if (pendingMetadataTargetTaskIdRef.current === requestedOpenTaskId && selectedTaskId && selectedTaskId !== requestedOpenTaskId) {
      setRetainedMetadataTargetTask(clonePrototypeTaskRow(requestedTask));
      setMetadataTargetTaskId(requestedOpenTaskId);
      pendingMetadataTargetTaskIdRef.current = null;
      onRequestedOpenTaskHandled?.(requestedOpenTaskId);
      return;
    }

    if (selectedTaskId === requestedOpenTaskId && selectedTask?.id === requestedOpenTaskId) {
      onRequestedOpenTaskHandled?.(requestedOpenTaskId);
      return;
    }

    if (requestedVisibleTask) {
      openInspector(requestedOpenTaskId, "full");
      onRequestedOpenTaskHandled?.(requestedOpenTaskId);
      return;
    }

    setEditingTaskTitleId(null);
    setEditingSubtaskId(null);
    hasSeenSelectedTaskInCurrentListRef.current = false;
    setRetainedSelectedTask(clonePrototypeTaskRow(requestedTask));
    setSelectedTaskLeftCurrentList(true);
    setQuickEditTargetTaskIds(null);
    setSelectedTaskId(requestedOpenTaskId);
    setOverlayMode("full");
    setOpenColumnMenuId(null);
    setOverlayAnchor(null);
    onRequestedOpenTaskHandled?.(requestedOpenTaskId);
  }, [onRequestedOpenTaskHandled, requestedOpenTask, requestedOpenTaskId, selectedTask, selectedTaskId, tasks]);
  const mergedListOptions = useMemo(() => {
    const byLabel = new Map<string, { id: string; label: string }>();
    for (const option of allListOptions) {
      byLabel.set(option.label, option);
    }
    for (const label of ["Quick Wins", "Waiting", "Later"]) {
      if (!byLabel.has(label)) {
        byLabel.set(label, { id: label.toLowerCase().replace(/\s+/g, "_"), label });
      }
    }
    for (const task of tasks) {
      for (const list of task.lists) {
        if (!byLabel.has(list)) {
          byLabel.set(list, { id: list.toLowerCase().replace(/\s+/g, "_"), label: list });
        }
      }
    }
    return Array.from(byLabel.values());
  }, [allListOptions, tasks]);
  const mergedTagOptions = useMemo(() => {
    const tagSet = new Set(allTagOptions);
    for (const task of tasks) {
      for (const tag of task.tags) {
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort((left, right) => left.localeCompare(right));
  }, [allTagOptions, tasks]);
  const activeTimer = effectiveRunningTimers.length > 0 ? effectiveRunningTimers[Math.min(effectiveActiveTimerIndex, effectiveRunningTimers.length - 1)] ?? null : null;
  const activeTimerTask = activeTimer ? tasks.find((task) => task.id === activeTimer.taskId) ?? null : null;

  useEffect(() => {
    const nextRows = rows.map((row) => ({
      ...row,
      subtasks: filterPrototypeSubtasks(row.subtasks, hiddenSubtaskIds),
    }));
    const nextSignature = buildPrototypeRowsSignature(nextRows);
    if (lastRowsSignatureRef.current === nextSignature) {
      return;
    }

    lastRowsSignatureRef.current = nextSignature;
    setTasks(nextRows);
  }, [hiddenSubtaskIds, rows]);

  useEffect(() => {
    const readyTaskIds = Object.entries(pendingSubtaskAutoExpandByTaskId)
      .filter(([taskId, shouldAutoExpand]) => shouldAutoExpand && (tasks.find((candidate) => candidate.id === taskId)?.subtasks.length ?? 0) > 0)
      .map(([taskId]) => taskId);

    if (readyTaskIds.length === 0) {
      return;
    }

    setExpandedSubtasksByTaskId((current) => {
      const next = { ...current };
      let changed = false;

      for (const taskId of readyTaskIds) {
        if (!next[taskId]) {
          next[taskId] = true;
          changed = true;
        }
      }

      return changed ? next : current;
    });

    setPendingSubtaskAutoExpandByTaskId((current) => {
      const next = { ...current };
      let changed = false;

      for (const taskId of readyTaskIds) {
        if (next[taskId]) {
          delete next[taskId];
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [pendingSubtaskAutoExpandByTaskId, tasks]);

  useEffect(() => {
    setExpandedSubtasksByTaskId((current) => {
      let changed = false;
      const next = { ...current };

      for (const [taskId, isExpanded] of Object.entries(current)) {
        if (!isExpanded) {
          continue;
        }

        const task = tasks.find((candidate) => candidate.id === taskId);
        if ((!task || task.subtasks.length === 0) && !pendingSubtaskAutoExpandByTaskId[taskId]) {
          delete next[taskId];
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [pendingSubtaskAutoExpandByTaskId, tasks]);

  useEffect(() => {
    if (!selectedTaskId || !(enableInspector || allowInlineInspector) || (allowInlineInspector && isInlineAccordionMode(overlayMode))) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!inspectorPanelRef.current?.contains(target)) {
        closeInspector();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [allowInlineInspector, enableInspector, overlayMode, selectedTaskId, dueDrafts, estimatedMinutesDrafts, notesDrafts, linkDrafts]);

  useEffect(() => {
    if (!shellRef.current) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const startedAt = process.env.NODE_ENV !== "production" ? performance.now() : 0;
      setRequiredColumnWidths((current) => {
        const nextMeasuredWidths = visibleHeaderColumns.reduce<Partial<Record<TaskManagementTableColumnId, number>>>((accumulator, column) => {
          const headerWidths = getMeasuredColumnWidths(`[data-column-header-measure="${column.id}"]`);
          const rowContentWidths = getMeasuredColumnWidths(`[data-column-content-measure="${column.id}"]`, 12);
          const widestHeader = headerWidths.length > 0 ? Math.max(...headerWidths) : 0;
          const widestRowContent = rowContentWidths.length > 0 ? Math.max(...rowContentWidths) : 0;
          accumulator[column.id] = Math.max(MIN_COLUMN_WIDTHS[column.id], widestHeader, widestRowContent) + COLUMN_WIDTH_BUFFER[column.id];
          return accumulator;
        }, {});
        return mergeMeasuredColumnWidths(
          current,
          nextMeasuredWidths,
          visibleHeaderColumns.map((column) => column.id),
        );
      });

      if (process.env.NODE_ENV !== "production") {
        const message = `[tasks:list-switch] column measurement ran in ${Math.round(performance.now() - startedAt)}ms for ${visibleHeaderColumns.length} columns`;
        console.info(message);
        if (typeof window !== "undefined") {
          window.__ADHDICE_TASK_LIST_SWITCH_LOGS__ ??= [];
          window.__ADHDICE_TASK_LIST_SWITCH_LOGS__.push(message);
        }
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [measurementSignature, visibleHeaderColumns]);

  useEffect(() => {
    if (effectiveRunningTimers.length === 0 || taskTimerNow !== undefined) {
      return;
    }
    const interval = window.setInterval(() => {
      setLocalTimerNow(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [effectiveRunningTimers.length, taskTimerNow]);

  useEffect(() => {
    setColumnOrder((current) => {
      const nextVisible: SortColumnId[] = visibleColumns && visibleColumns.length > 0
        ? ["status_icon", "title", ...visibleColumns.filter((columnId) => columnId !== "status_icon" && columnId !== "title")]
        : HEADER_COLUMNS.map((column) => column.id);
      const deduped = Array.from(new Set(nextVisible));
      const preserved = current.filter((columnId) => deduped.includes(columnId));
      const missing = deduped.filter((columnId) => !preserved.includes(columnId));
      const nextOrder = [...preserved, ...missing];
      return nextOrder.length === current.length && nextOrder.every((columnId, index) => columnId === current[index])
        ? current
        : nextOrder;
    });
  }, [visibleColumns]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const preferences: TaskTablePreferences = {
      columnAlignments,
      columnOrder,
      columnWidths,
      sortState,
      statusDisplayMode,
    };
    window.localStorage.setItem(TASK_TABLE_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  }, [columnAlignments, columnOrder, columnWidths, sortState, statusDisplayMode]);

  useEffect(() => {
    if (!selectedTask) {
      return;
    }

    if (titleDraftsRef.current[selectedTask.id] === undefined) {
      titleDraftsRef.current[selectedTask.id] = selectedTask.title;
    }
    setLinkDrafts((current) => current[selectedTask.id] === undefined
      ? { ...current, [selectedTask.id]: { label: selectedTask.linkLabel, url: selectedTask.linkUrl } }
      : current);
    setNotesDrafts((current) => current[selectedTask.id] === undefined
      ? { ...current, [selectedTask.id]: selectedTask.notes }
      : current);
    setLinkedNoteDrafts((current) => current[selectedTask.id] === undefined
      ? { ...current, [selectedTask.id]: selectedTask.linkedNotes.map((note) => note.id) }
      : current);
    setEstimatedMinutesDrafts((current) => current[selectedTask.id] === undefined
      ? { ...current, [selectedTask.id]: selectedTask.estimatedMinutes ? String(selectedTask.estimatedMinutes) : "" }
      : current);
  }, [selectedTask]);

  useEffect(() => {
    if (!selectedTaskId) {
      hasSeenSelectedTaskInCurrentListRef.current = false;
      setRetainedSelectedTask(null);
      setSelectedTaskLeftCurrentList(false);
      return;
    }

    if (selectedTaskFromRows) {
      hasSeenSelectedTaskInCurrentListRef.current = true;
      setRetainedSelectedTask(clonePrototypeTaskRow(selectedTaskFromRows));
      setSelectedTaskLeftCurrentList(false);
      return;
    }

    if (hasSeenSelectedTaskInCurrentListRef.current) {
      setSelectedTaskLeftCurrentList(true);
    }
  }, [selectedTaskFromRows, selectedTaskId]);

  useEffect(() => {
    const scrollContainer = tableScrollContainerRef.current;
    if (!scrollContainer) {
      return;
    }

    const updateTableScrollButton = () => {
      const availableScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      const hasMeaningfulTableScroll = availableScroll > Math.max(180, scrollContainer.clientHeight * 0.75);
      setShowTableScrollUp(hasMeaningfulTableScroll && scrollContainer.scrollTop > scrollContainer.clientHeight * 2);
    };

    updateTableScrollButton();
    scrollContainer.addEventListener("scroll", updateTableScrollButton, { passive: true });
    window.addEventListener("resize", updateTableScrollButton);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        updateTableScrollButton();
      });
      resizeObserver.observe(scrollContainer);
      const scrollContent = scrollContainer.firstElementChild;
      if (scrollContent instanceof HTMLElement) {
        resizeObserver.observe(scrollContent);
      }
    }

    return () => {
      scrollContainer.removeEventListener("scroll", updateTableScrollButton);
      window.removeEventListener("resize", updateTableScrollButton);
      resizeObserver?.disconnect();
    };
  }, [displayedTasks.length, renderedTaskCount, showHeader, sourceRowsKey, tableFilterSignature, visibleHeaderColumns.length]);

  useEffect(() => {
    setLocalActiveTimerIndex((current) => {
      if (effectiveRunningTimers.length === 0 || activeTaskTimerIndex !== undefined) {
        return 0;
      }
      return Math.max(0, Math.min(current, effectiveRunningTimers.length - 1));
    });
  }, [activeTaskTimerIndex, effectiveRunningTimers.length]);

  useEffect(() => {
    if (!openColumnMenuId) {
      setColumnMenuPosition(null);
    }
  }, [openColumnMenuId]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!columnMenuRef.current?.contains(target)) {
        setOpenColumnMenuId(null);
      }

      if (!rowContextMenuRef.current?.contains(target)) {
        setRowContextMenu(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (selectedTaskId && (enableInspector || allowInlineInspector)) {
          closeInspector();
        }
        setOpenColumnMenuId(null);
        setRowContextMenu(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allowInlineInspector, enableInspector, selectedTaskId, dueDrafts, estimatedMinutesDrafts, notesDrafts, linkDrafts]);

  useEffect(() => {
    if (!selectedTaskId || !allowInlineInspector || !isInlineAccordionMode(overlayMode)) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const inlineEditor = target.closest("[data-task-table-inline-editor]");
      if (inlineEditor?.getAttribute("data-task-table-inline-editor") === selectedTaskId) {
        return;
      }

      const activeRow = target.closest("[data-task-table-row]");
      if (activeRow?.getAttribute("data-task-table-row") === selectedTaskId) {
        return;
      }

      closeInspector();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [allowInlineInspector, selectedTaskId, overlayMode, dueDrafts, estimatedMinutesDrafts, notesDrafts, linkDrafts]);

  useEffect(() => () => {
    if (pendingRowClickTimeoutRef.current !== null) {
      window.clearTimeout(pendingRowClickTimeoutRef.current);
      pendingRowClickTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (rowContextMenu && !tasks.some((task) => task.id === rowContextMenu.taskId)) {
      setRowContextMenu(null);
    }
  }, [rowContextMenu, tasks]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const nextWidth = Math.max(
        MIN_COLUMN_WIDTHS[resizeState.columnId],
        resizeState.startWidth + (event.clientX - resizeState.startX),
      );
      setColumnWidths((current) => ({
        ...current,
        [resizeState.columnId]: nextWidth,
      }));
    };

    const handlePointerUp = () => {
      resizeStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  function patchTask(taskId: string, updater: (task: PrototypeTaskRow) => PrototypeTaskRow) {
    setTasks((current) => current.map((task) => (task.id === taskId ? updater(task) : task)));
    setRetainedSelectedTask((current) => {
      if (!current || current.id !== taskId) {
        return current;
      }
      return clonePrototypeTaskRow(updater(current));
    });
    setRetainedMetadataTargetTask((current) => {
      if (!current || current.id !== taskId) {
        return current;
      }
      return clonePrototypeTaskRow(updater(current));
    });
  }

  function patchTasks(taskIds: string[], updater: (task: PrototypeTaskRow) => PrototypeTaskRow) {
    const uniqueTaskIds = Array.from(new Set(taskIds));
    if (uniqueTaskIds.length === 0) {
      return;
    }

    const taskIdSet = new Set(uniqueTaskIds);
    setTasks((current) => current.map((task) => (taskIdSet.has(task.id) ? updater(task) : task)));
    setRetainedSelectedTask((current) => {
      if (!current || !taskIdSet.has(current.id)) {
        return current;
      }
      return clonePrototypeTaskRow(updater(current));
    });
    setRetainedMetadataTargetTask((current) => {
      if (!current || !taskIdSet.has(current.id)) {
        return current;
      }
      return clonePrototypeTaskRow(updater(current));
    });
  }

  function getTaskById(taskId: string) {
    return tasks.find((task) => task.id === taskId)
      ?? (retainedSelectedTask?.id === taskId ? retainedSelectedTask : null)
      ?? (retainedMetadataTargetTask?.id === taskId ? retainedMetadataTargetTask : null);
  }

  function modeSupportsBatchQuickEdit(mode: OverlayMode) {
    return BATCH_QUICK_EDIT_MODES.includes(mode);
  }

  function getQuickEditTargetTaskIds(taskId: string) {
    const candidateIds = quickEditTargetTaskIds?.length ? quickEditTargetTaskIds : [taskId];
    return Array.from(new Set(candidateIds.filter((candidateId): candidateId is string => Boolean(candidateId))));
  }

  function getContextMenuQuickEditTargetTaskIds(taskId: string) {
    if (selectedTaskIdSet.has(taskId) && selectedTaskIds.length > 1) {
      return Array.from(new Set(selectedTaskIds));
    }
    return [taskId];
  }

  function removeSubtaskFromTree(subtasks: PrototypeTaskSubtask[], subtaskId: string): PrototypeTaskSubtask[] {
    return subtasks
      .filter((subtask) => subtask.id !== subtaskId)
      .map((subtask) => ({
        ...subtask,
        children: removeSubtaskFromTree(subtask.children, subtaskId),
      }));
  }

  function containsSubtaskId(subtasks: PrototypeTaskSubtask[], subtaskId: string): boolean {
    return subtasks.some((subtask) => subtask.id === subtaskId || containsSubtaskId(subtask.children, subtaskId));
  }

  function deleteSubtaskLocally(subtaskId: string) {
    setTasks((current) => current.map((task) => ({
      ...task,
      subtasks: removeSubtaskFromTree(task.subtasks, subtaskId),
    })));
    setRetainedSelectedTask((current) => current ? {
      ...current,
      subtasks: removeSubtaskFromTree(current.subtasks, subtaskId),
    } : current);
  }

  function handleTaskSubtaskDelete(subtaskId: string) {
    const owningTask = tasks.find((task) => containsSubtaskId(task.subtasks, subtaskId));
    const deletedSubtaskIds = owningTask ? collectPrototypeSubtaskIds(owningTask.subtasks, subtaskId) : [subtaskId];

    setHiddenSubtaskIds((current) => {
      const next = { ...current };
      let changed = false;

      for (const deletedId of deletedSubtaskIds) {
        if (!next[deletedId]) {
          next[deletedId] = true;
          changed = true;
        }
      }

      return changed ? next : current;
    });

    // Force-close expanded step shells immediately so row height snaps back live.
    setExpandedSubtasksByTaskId({});
    setPendingSubtaskAutoExpandByTaskId({});

    deleteSubtaskLocally(subtaskId);
    onTaskSubtaskDelete?.(subtaskId);
  }

  async function handleTaskSubtaskAdd(taskId: string) {
    setPendingSubtaskAutoExpandByTaskId((current) => ({
      ...current,
      [taskId]: true,
    }));
    const newSubtaskId = await onTaskSubtaskAdd?.(taskId);
    if (newSubtaskId) {
      setEditingSubtaskId(newSubtaskId);
      setAutofocusSubtaskId(newSubtaskId);
    }
  }

  async function handleTaskSubtaskAddChild(subtaskId: string) {
    const newSubtaskId = await onTaskSubtaskAddChild?.(subtaskId);
    if (newSubtaskId) {
      setEditingSubtaskId(newSubtaskId);
      setAutofocusSubtaskId(newSubtaskId);
    }
  }

  function closeInspector(options?: {
    skipLinkCommit?: boolean;
    skipNotesCommit?: boolean;
    skipTitleCommit?: boolean;
  }) {
    if (selectedTaskId) {
      if (!options?.skipTitleCommit) {
        commitTaskTitle(selectedTaskId);
      }
      if (!options?.skipNotesCommit) {
        commitTaskNotes(selectedTaskId);
      }
      if (!options?.skipLinkCommit) {
        commitTaskLink(selectedTaskId);
      }
      const currentTask = getTaskById(selectedTaskId);
      const dueDraft = dueDrafts[selectedTaskId];
      if (dueDraft && currentTask && (dueDraft.dueOn !== currentTask.dueOn || dueDraft.dueTime !== currentTask.dueTime)) {
        setTaskDue(selectedTaskId, dueDraft.dueOn, dueDraft.dueTime);
      }
      const estimatedDraft = estimatedMinutesDrafts[selectedTaskId];
      if (estimatedDraft && currentTask) {
        const estimatedMinutes = Number.parseInt(estimatedDraft, 10);
        if (Number.isFinite(estimatedMinutes) && estimatedMinutes !== currentTask.estimatedMinutes) {
          setTaskEstimatedMinutes(selectedTaskId, estimatedMinutes);
        }
      }
    }
    if (metadataTargetTaskId && metadataTargetTaskId !== selectedTaskId) {
      if (!options?.skipNotesCommit) {
        commitTaskNotes(metadataTargetTaskId);
      }
      if (!options?.skipLinkCommit) {
        commitTaskLink(metadataTargetTaskId);
      }
      const currentTask = getTaskById(metadataTargetTaskId);
      const dueDraft = dueDrafts[metadataTargetTaskId];
      if (dueDraft && currentTask && (dueDraft.dueOn !== currentTask.dueOn || dueDraft.dueTime !== currentTask.dueTime)) {
        setTaskDue(metadataTargetTaskId, dueDraft.dueOn, dueDraft.dueTime);
      }
      const estimatedDraft = estimatedMinutesDrafts[metadataTargetTaskId];
      if (estimatedDraft && currentTask) {
        const estimatedMinutes = Number.parseInt(estimatedDraft, 10);
        if (Number.isFinite(estimatedMinutes) && estimatedMinutes !== currentTask.estimatedMinutes) {
          setTaskEstimatedMinutes(metadataTargetTaskId, estimatedMinutes);
        }
      }
    }
    setEditingTaskTitleId(null);
    setEditingSubtaskId(null);
    hasSeenSelectedTaskInCurrentListRef.current = false;
    setSelectedTaskId(null);
    setRetainedSelectedTask(null);
    setMetadataTargetTaskId(null);
    setRetainedMetadataTargetTask(null);
    pendingMetadataTargetTaskIdRef.current = null;
    setSelectedTaskLeftCurrentList(false);
    setQuickEditTargetTaskIds(null);
    setOverlayMode("full");
    setOverlayAnchor(null);
    onInspectorClose?.();
  }

  function shouldSkipRecentInlineCommit(taskId: string, field: "link" | "notes" | "title", value: string) {
    const key = `${taskId}:${field}`;
    const existing = recentInlineCommitRef.current.get(key);
    const now = Date.now();
    if (existing && existing.expiresAt >= now && existing.value === value) {
      return true;
    }
    recentInlineCommitRef.current.set(key, {
      expiresAt: now + 500,
      value,
    });
    return false;
  }

  function commitTaskTitle(taskId: string) {
    const draft = titleDraftsRef.current[taskId];
    if (typeof draft !== "string") {
      return;
    }

    const nextTitle = draft.trim();
    if (!nextTitle) {
      return;
    }

    const currentTask = getTaskById(taskId);
    if (currentTask && nextTitle === currentTask.title) {
      return;
    }
    if (shouldSkipRecentInlineCommit(taskId, "title", nextTitle)) {
      return;
    }

    titleDraftsRef.current[taskId] = nextTitle;
    patchTask(taskId, (task) => ({ ...task, title: nextTitle }));
    onTaskTitleChange?.(taskId, nextTitle);
  }

  function setTitleDraft(taskId: string, draft: string) {
    titleDraftsRef.current[taskId] = draft;
  }

  function setTaskSubtasksAutoReset(taskId: string, subtasksAutoReset: boolean) {
    patchTask(taskId, (task) => ({ ...task, subtasksAutoReset }));
    onTaskSubtasksAutoResetChange?.(taskId, subtasksAutoReset);
  }

  function commitTaskLink(taskId: string, options?: { closeAfterSave?: boolean }) {
    const draft = linkDrafts[taskId];
    if (!draft) {
      return;
    }

    const nextLink = {
      label: draft.label.trim(),
      url: draft.url.trim(),
    };
    const currentTask = getTaskById(taskId);
    if (currentTask && nextLink.label === currentTask.linkLabel && nextLink.url === currentTask.linkUrl) {
      if (options?.closeAfterSave) {
        closeInspector({ skipLinkCommit: true });
      }
      return;
    }
    const nextLinkFingerprint = `${nextLink.label}\u0000${nextLink.url}`;
    if (shouldSkipRecentInlineCommit(taskId, "link", nextLinkFingerprint)) {
      if (options?.closeAfterSave) {
        closeInspector({ skipLinkCommit: true });
      }
      return;
    }

    patchTask(taskId, (task) => ({
      ...task,
      linkLabel: nextLink.label,
      linkUrl: nextLink.url,
    }));
    onTaskLinkChange?.(taskId, nextLink);
    if (options?.closeAfterSave) {
      closeInspector({ skipLinkCommit: true });
    }
  }

  function commitTaskNotes(taskId: string, options?: { closeAfterSave?: boolean }) {
    const draft = notesDrafts[taskId];
    if (typeof draft !== "string") {
      return;
    }

    const nextNotes = draft.trim();
    const currentTask = getTaskById(taskId);
    if (currentTask && nextNotes === currentTask.notes) {
      if (options?.closeAfterSave) {
        closeInspector({ skipNotesCommit: true });
      }
      return;
    }
    if (shouldSkipRecentInlineCommit(taskId, "notes", nextNotes)) {
      if (options?.closeAfterSave) {
        closeInspector({ skipNotesCommit: true });
      }
      return;
    }

    patchTask(taskId, (task) => ({
      ...task,
      notes: nextNotes,
    }));
    onTaskNotesChange?.(taskId, nextNotes);
    if (options?.closeAfterSave) {
      closeInspector({ skipNotesCommit: true });
    }
  }

  function setTaskDue(taskId: string, dueOn: string, dueTime: string) {
    const targetTaskIds = getQuickEditTargetTaskIds(taskId);
    patchTasks(targetTaskIds, (task) => ({
      ...task,
      dueOn,
      dueTime,
      lists: dueOn === offsetDate(0)
        ? Array.from(new Set(task.lists.filter((list) => list !== "Inbox").concat("Today")))
        : task.lists.filter((list) => list !== "Today"),
    }));
    for (const targetTaskId of targetTaskIds) {
      onTaskDueChange?.(targetTaskId, { dueOn, dueTime });
    }
  }

  function setTaskStatus(taskId: string, status: TaskStatus) {
    const targetTaskIds = getQuickEditTargetTaskIds(taskId);
    if (shouldOptimisticallyPatchTaskStatus(status)) {
      patchTasks(targetTaskIds, (task) => ({ ...task, status }));
    }
    for (const targetTaskId of targetTaskIds) {
      onTaskStatusChange?.(targetTaskId, status);
    }
  }

  function setTaskEstimatedMinutes(taskId: string, minutes: number | null) {
    const targetTaskIds = getQuickEditTargetTaskIds(taskId);
    patchTasks(targetTaskIds, (task) => ({ ...task, estimatedMinutes: minutes }));
    for (const targetTaskId of targetTaskIds) {
      onTaskEstimatedMinutesChange?.(targetTaskId, minutes);
    }
  }

  function setTaskEnergy(taskId: string, energy: TaskEnergy) {
    const targetTaskIds = getQuickEditTargetTaskIds(taskId);
    patchTasks(targetTaskIds, (task) => ({ ...task, energy }));
    for (const targetTaskId of targetTaskIds) {
      onTaskEnergyChange?.(targetTaskId, energy);
    }
  }

  function parsePositiveDraft(value: string, fallback: number) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function parseDayOfMonthDraft(value: string) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 31) {
      return null;
    }
    return parsed;
  }

  function setTaskRepeat(
    taskId: string,
    repeat: TaskRepeat,
    cadencePatch: Partial<Pick<PrototypeTaskRow, "repeatDayOfMonth" | "repeatDaysOfWeek" | "repeatInterval">> = {},
  ) {
    const currentTask = getTaskById(taskId);
    if (!currentTask) {
      return;
    }
    const targetTaskIds = getQuickEditTargetTaskIds(taskId);
    const nextCadence = {
      repeatDayOfMonth: repeat === "daily_until_complete"
        ? null
        : cadencePatch.repeatDayOfMonth ?? currentTask.repeatDayOfMonth,
      repeatDaysOfWeek: repeat === "daily_until_complete"
        ? []
        : cadencePatch.repeatDaysOfWeek ?? currentTask.repeatDaysOfWeek,
      repeatInterval: repeat === "daily_until_complete"
        ? 1
        : cadencePatch.repeatInterval ?? currentTask.repeatInterval,
    };
    patchTasks(targetTaskIds, (task) => {
      return {
        ...task,
        repeat,
        ...nextCadence,
      };
    });
    for (const targetTaskId of targetTaskIds) {
      onTaskRepeatChange?.(targetTaskId, repeat, nextCadence);
    }
  }

  function setTaskRepeatInterval(task: PrototypeTaskRow, value: string) {
    const repeatInterval = parsePositiveDraft(value, task.repeatInterval);
    setRepeatIntervalDrafts((current) => ({ ...current, [task.id]: String(repeatInterval) }));
    setTaskRepeat(task.id, task.repeat, { repeatInterval });
  }

  function setTaskRepeatDayOfMonth(task: PrototypeTaskRow, value: string) {
    const repeatDayOfMonth = parseDayOfMonthDraft(value);
    setRepeatDayOfMonthDrafts((current) => ({ ...current, [task.id]: repeatDayOfMonth ? String(repeatDayOfMonth) : "" }));
    setTaskRepeat(task.id, task.repeat, { repeatDayOfMonth });
  }

  function toggleTaskRepeatWeekday(task: PrototypeTaskRow, weekday: number) {
    const selected = task.repeatDaysOfWeek.includes(weekday);
    const repeatDaysOfWeek = selected
      ? task.repeatDaysOfWeek.filter((value) => value !== weekday)
      : [...task.repeatDaysOfWeek, weekday].sort((left, right) => left - right);
    setTaskRepeat(task.id, task.repeat, { repeatDaysOfWeek });
  }

  function getRunningTimer(taskId: string) {
    return effectiveRunningTimers.find((entry) => entry.taskId === taskId) ?? null;
  }

  function getDisplayedActualSeconds(task: PrototypeTaskRow) {
    const runningTimer = getRunningTimer(task.id);
    if (!runningTimer) {
      return task.actualSeconds;
    }
    return getTimerDisplaySeconds(runningTimer, effectiveTimerNow);
  }

  function startTaskTimer(taskId: string) {
    const task = getTaskById(taskId);
    if (!task) {
      return;
    }
    const existingIndex = effectiveRunningTimers.findIndex((entry) => entry.taskId === taskId);
    if (existingIndex >= 0) {
      if (activeTaskTimerIndex === undefined) {
        setLocalActiveTimerIndex(existingIndex);
      }
      closeInspector();
      return;
    }
    const nextTimer = {
      baseSeconds: getDisplayedActualSeconds(task),
      pausedAt: null,
      startedActualSeconds: getDisplayedActualSeconds(task),
      startedAt: Date.now(),
      taskId,
      title: task.title,
    };
    if (onStartTaskTimer) {
      onStartTaskTimer(nextTimer);
    } else {
      setLocalRunningTimers((current) => [...current, nextTimer]);
      setLocalActiveTimerIndex(effectiveRunningTimers.length);
    }
    closeInspector();
  }

  function stopTaskTimer(taskId: string) {
    const task = getTaskById(taskId);
    const runningTimer = getRunningTimer(taskId);
    if (!task || !runningTimer) {
      return;
    }
    if (onStopTaskTimer) {
      onStopTaskTimer(taskId);
    } else {
      const nextSeconds = getDisplayedActualSeconds(task);
      const elapsedSeconds = Math.max(0, nextSeconds - task.actualSeconds);
      setLocalRunningTimers((current) => {
        const next = current.filter((entry) => entry.taskId !== taskId);
        setLocalActiveTimerIndex((previous) => Math.max(0, Math.min(previous, next.length - 1)));
        return next;
      });
      setLocalTimerNow(Date.now());
      onOpenTaskActualTime?.(taskId, {
        durationSeconds: elapsedSeconds,
        title: task.title,
      });
    }
    closeInspector();
  }

  function clearTaskTimer(taskId: string) {
    const runningTimer = getRunningTimer(taskId);
    if (!runningTimer) {
      return;
    }

    if (onStopTaskTimer) {
      onStopTaskTimer(taskId);
    } else {
      setLocalRunningTimers((current) => {
        const next = current.filter((entry) => entry.taskId !== taskId);
        setLocalActiveTimerIndex((previous) => Math.max(0, Math.min(previous, next.length - 1)));
        return next;
      });
      setLocalTimerNow(Date.now());
    }
    closeInspector();
  }

  function pauseTaskTimer(taskId: string) {
    const runningTimer = getRunningTimer(taskId);
    if (!runningTimer || runningTimer.pausedAt) {
      return;
    }
    if (onPauseTaskTimer) {
      onPauseTaskTimer(taskId);
    } else {
      const now = Date.now();
      setLocalRunningTimers((current) => current.map((entry) => (
        entry.taskId === taskId ? { ...entry, pausedAt: now } : entry
      )));
      setLocalTimerNow(now);
    }
  }

  function resumeTaskTimer(taskId: string) {
    const runningTimer = getRunningTimer(taskId);
    if (!runningTimer || !runningTimer.pausedAt) {
      return;
    }
    if (onResumeTaskTimer) {
      onResumeTaskTimer(taskId);
    } else {
      const now = Date.now();
      setLocalRunningTimers((current) => current.map((entry) => {
        if (entry.taskId !== taskId) {
          return entry;
        }
        return {
          ...entry,
          baseSeconds: getTimerDisplaySeconds(entry, now),
          pausedAt: null,
          startedAt: now,
        };
      }));
      setLocalTimerNow(now);
    }
  }

  function openLinkedNote(noteId: string) {
    onOpenNote?.(noteId);
  }

  function openExternalLink(url: string) {
    if (!url) {
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function setTaskPriorities(taskId: string, priorities: TaskPriority[]) {
    const targetTaskIds = getQuickEditTargetTaskIds(taskId);
    patchTasks(targetTaskIds, (task) => ({ ...task, priorities }));
    for (const targetTaskId of targetTaskIds) {
      onTaskPriorityChange?.(targetTaskId, priorities);
    }
  }

  function setTaskTags(taskId: string, tags: string[]) {
    const targetTaskIds = getQuickEditTargetTaskIds(taskId);
    patchTasks(targetTaskIds, (task) => ({ ...task, tags }));
    for (const targetTaskId of targetTaskIds) {
      onTaskTagsChange?.(targetTaskId, tags);
    }
  }

  function setTaskLinkedNoteIds(taskId: string, linkedNoteIds: string[]) {
    patchTask(taskId, (task) => ({
      ...task,
      linkedNotes: linkedNoteIds
        .map((noteId) => allNoteOptions.find((note) => note.id === noteId))
        .filter((note): note is { id: string; title: string } => Boolean(note))
        .map((note) => ({ id: note.id, title: note.title })),
    }));
    onTaskLinkedNoteIdsChange?.(taskId, linkedNoteIds);
  }

  function clearTaskLink(taskId: string) {
    setLinkDrafts((current) => ({
      ...current,
      [taskId]: { label: "", url: "" },
    }));
    patchTask(taskId, (task) => ({ ...task, linkLabel: "", linkUrl: "" }));
    onTaskLinkChange?.(taskId, { label: "", url: "" });
  }

  function clearTaskNotes(taskId: string) {
    setNotesDrafts((current) => ({
      ...current,
      [taskId]: "",
    }));
    patchTask(taskId, (task) => ({ ...task, notes: "" }));
    onTaskNotesChange?.(taskId, "");
  }

  function commitSubtaskTitle(subtaskId: string) {
    const draft = subtaskTitleDrafts[subtaskId];
    setEditingSubtaskId((current) => current === subtaskId ? null : current);
    if (draft === undefined) {
      return;
    }
    const trimmed = draft.trim();
    if (!trimmed) {
      setSubtaskTitleDrafts((current) => {
        const next = { ...current };
        delete next[subtaskId];
        return next;
      });
      return;
    }
    onTaskSubtaskRename?.(subtaskId, trimmed);
  }

  function isOverlaySectionCollapsed(taskId: string, sectionId: OverlaySectionId) {
    return collapsedOverlaySectionsByTaskId[taskId]?.[sectionId] ?? true;
  }

  function toggleOverlaySection(taskId: string, sectionId: OverlaySectionId) {
    setCollapsedOverlaySectionsByTaskId((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? {}),
        [sectionId]: !(current[taskId]?.[sectionId] ?? true),
      },
    }));
  }

  function addTaskTag(taskId: string, rawTag: string) {
    const nextTag = rawTag.trim();
    if (!nextTag) {
      return;
    }
    const targetTasks = getQuickEditTargetTaskIds(taskId)
      .map((targetTaskId) => getTaskById(targetTaskId))
      .filter((task): task is PrototypeTaskRow => Boolean(task));
    if (targetTasks.length === 0) {
      return;
    }

    const nextTagsByTaskId = new Map(
      targetTasks.map((task) => [task.id, Array.from(new Set([...task.tags, nextTag]))] as const),
    );
    patchTasks(targetTasks.map((task) => task.id), (task) => ({
      ...task,
      tags: nextTagsByTaskId.get(task.id) ?? task.tags,
    }));
    for (const task of targetTasks) {
      onTaskTagsChange?.(task.id, nextTagsByTaskId.get(task.id) ?? task.tags);
    }
    setTagDrafts((current) => ({ ...current, [taskId]: "" }));
  }

  function toggleTaskTag(taskId: string, tag: string) {
    const task = getTaskById(taskId);
    if (!task) return;

    const shouldRemove = task.tags.includes(tag);
    const targetTasks = getQuickEditTargetTaskIds(taskId)
      .map((targetTaskId) => getTaskById(targetTaskId))
      .filter((candidate): candidate is PrototypeTaskRow => Boolean(candidate));
    const nextTagsByTaskId = new Map(
      targetTasks.map((candidate) => [candidate.id, shouldRemove
        ? candidate.tags.filter((entry) => entry !== tag)
        : Array.from(new Set([...candidate.tags, tag]))] as const),
    );
    patchTasks(targetTasks.map((candidate) => candidate.id), (candidate) => ({
      ...candidate,
      tags: nextTagsByTaskId.get(candidate.id) ?? candidate.tags,
    }));
    for (const candidate of targetTasks) {
      onTaskTagsChange?.(candidate.id, nextTagsByTaskId.get(candidate.id) ?? candidate.tags);
    }
  }

  function toggleTaskList(taskId: string, listLabel: string) {
    const task = getTaskById(taskId);
    if (!task) return;
    const shouldRemove = taskHasList(task, listLabel);
    const targetTasks = getQuickEditTargetTaskIds(taskId)
      .map((targetTaskId) => getTaskById(targetTaskId))
      .filter((candidate): candidate is PrototypeTaskRow => Boolean(candidate));
    const changedTasks = targetTasks.filter((candidate) => shouldRemove
      ? taskHasList(candidate, listLabel)
      : !taskHasList(candidate, listLabel));
    const nextListsByTaskId = new Map(
      changedTasks.map((candidate) => [candidate.id, shouldRemove
        ? candidate.lists.filter((entry) => normalizeTaskListLabel(entry) !== normalizeTaskListLabel(listLabel))
        : [...candidate.lists, listLabel]] as const),
    );
    patchTasks(changedTasks.map((candidate) => candidate.id), (candidate) => ({
      ...candidate,
      lists: nextListsByTaskId.get(candidate.id) ?? candidate.lists,
    }));
    const listId = allListOptions.find((option) => normalizeTaskListLabel(option.label) === normalizeTaskListLabel(listLabel))?.id;
    if (listId) {
      for (const candidate of changedTasks) {
        onToggleTaskList?.(candidate.id, listId);
      }
    }
  }

  async function createTaskListForRow(taskId: string) {
    const draft = listDrafts[taskId]?.trim();
    if (!draft) return;
    const created = await onCreateTaskList?.(draft);
    if (created !== false) {
      const targetTasks = getQuickEditTargetTaskIds(taskId)
        .map((targetTaskId) => getTaskById(targetTaskId))
        .filter((candidate): candidate is PrototypeTaskRow => Boolean(candidate));
      const changedTasks = targetTasks.filter((candidate) => !taskHasList(candidate, draft));
      patchTasks(changedTasks.map((candidate) => candidate.id), (candidate) => ({
        ...candidate,
        lists: [...candidate.lists, draft],
      }));
      const createdListId = typeof created === "object" && created ? created.id : null;
      const existingListId = createdListId ?? allListOptions.find((option) => normalizeTaskListLabel(option.label) === normalizeTaskListLabel(draft))?.id;
      if (existingListId) {
        for (const candidate of changedTasks) {
          onToggleTaskList?.(candidate.id, existingListId);
        }
      }
      setListDrafts((current) => ({ ...current, [taskId]: "" }));
    }
  }

  function toggleStructuredFilter<TValue extends string>(columnId: StructuredFilterColumnId, value: TValue) {
    setStructuredFilters((current) => {
      const existing = current[columnId] as TValue[];
      const nextValues = existing.includes(value)
        ? existing.filter((entry) => entry !== value)
        : [...existing, value];

      return {
        ...current,
        [columnId]: nextValues,
      };
    });
  }

  function clearAllFilters() {
    setTextFilters({});
    setStructuredFilters(DEFAULT_STRUCTURED_FILTERS);
  }

  function openInspector(taskId: string, mode: OverlayMode = "full", sourceElement?: HTMLElement | null, nextQuickEditTargetTaskIds: string[] | null = null) {
    if (allowInlineInspector && isInlineAccordionMode(mode) && selectedTaskId === taskId && overlayMode === mode) {
      closeInspector();
      return;
    }

    setEditingTaskTitleId(null);
    setMetadataTargetTaskId(null);
    setRetainedMetadataTargetTask(null);
    pendingMetadataTargetTaskIdRef.current = null;
    hasSeenSelectedTaskInCurrentListRef.current = tasks.some((task) => task.id === taskId);
    setSelectedTaskLeftCurrentList(false);
    setRetainedSelectedTask((current) => current?.id === taskId ? current : null);
    setQuickEditTargetTaskIds(nextQuickEditTargetTaskIds);
    setSelectedTaskId(taskId);
    setOverlayMode(mode);
    setOpenColumnMenuId(null);
    if (mode === "full") {
      setOverlayAnchor(null);
      return;
    }
    if (allowInlineInspector && isInlineAccordionMode(mode)) {
      setOverlayAnchor(null);
      return;
    }

    if (!sourceElement || !shellRef.current) {
      setOverlayAnchor(null);
      return;
    }

    const shellRect = shellRef.current.getBoundingClientRect();
    const sourceRect = sourceElement.getBoundingClientRect();
    const estimatedCardWidth = mode === "full" ? 960 : 520;
    const estimatedCardHeight = mode === "full" ? 720 : 280;
    const gutter = 18;
    const centeredLeft = sourceRect.left - shellRect.left + (sourceRect.width / 2) - (estimatedCardWidth / 2);
    const nextLeft = mode === "full"
      ? 24
      : Math.min(Math.max(24, centeredLeft), Math.max(24, shellRect.width - estimatedCardWidth - 24));
    const nextTop = Math.min(
      Math.max(24, sourceRect.top - shellRect.top + (sourceRect.height / 2) - (estimatedCardHeight / 2)),
      Math.max(24, shellRect.height - estimatedCardHeight - 24),
    );
    setOverlayAnchor({ left: nextLeft, top: nextTop });
  }

  function toggleInlineActionRow(taskId: string, mode: OverlayMode, sourceElement?: HTMLElement | null, nextQuickEditTargetTaskIds: string[] | null = null) {
    if (allowInlineInspector && isInlineAccordionMode(mode) && selectedTaskId === taskId && overlayMode === mode) {
      closeInspector();
      return;
    }

    openInspector(taskId, mode, sourceElement, nextQuickEditTargetTaskIds);
  }

  function openTaskInCurrentEditor(taskId: string) {
    if (getTaskById(taskId)) {
      openInspector(taskId, "full");
      return;
    }

    onOpenChildTask?.(taskId);
  }

  function openTableStepActions(taskId: string, mode: OverlayMode = "status") {
    if (allowInlineInspector && isInlineAccordionMode(mode)) {
      toggleInlineActionRow(taskId, mode);
      return;
    }

    openTaskInCurrentEditor(taskId);
  }

  function childPreviewToPrototypeTaskRow(item: ChildTaskPreview): PrototypeTaskRow {
    const retainedTask = getTaskById(item.id);
    if (retainedTask) {
      return retainedTask;
    }

    return {
      actualSeconds: item.actualSeconds,
      completedAt: null,
      createdAt: item.createdAt,
      dueOn: item.dueOn ?? item.scheduledOn ?? "",
      dueTime: item.dueTime ?? "",
      energy: item.energy,
      estimatedMinutes: item.estimatedMinutes,
      id: item.id,
      linkLabel: item.linkLabel,
      linkUrl: item.linkUrl,
      linkedNotes: [],
      lists: [],
      currentStreak: item.currentStreak,
      missedStreak: item.missedStreak,
      notes: item.notes,
      priorities: [...item.priorityFlags],
      repeat: item.repeat,
      repeatDayOfMonth: item.repeatDayOfMonth,
      repeatDaysOfWeek: [...item.repeatDaysOfWeek],
      repeatInterval: item.repeatInterval,
      status: item.status,
      subtasks: [],
      subtasksAutoReset: false,
      tags: [...item.tags],
      title: item.title,
      trashedAt: null,
      updatedAt: item.updatedAt,
    };
  }

  function beginTableStepDraft(parentTaskId: string) {
    if (!onCreateChildTask || childTaskCreationBlockedTaskIds.includes(parentTaskId)) {
      return;
    }

    setExpandedStepsByTaskId((current) => ({
      ...current,
      [parentTaskId]: true,
    }));
    setTableStepCreationErrorByParentId((current) => ({
      ...current,
      [parentTaskId]: null,
    }));
    setTableStepTitleDrafts((current) => (
      current[parentTaskId] === undefined ? { ...current, [parentTaskId]: "" } : current
    ));
    setTableStepDraftParentId(parentTaskId);
  }

  function cancelTableStepDraft(parentTaskId: string) {
    setTableStepDraftParentId((current) => (current === parentTaskId ? null : current));
    setTableStepCreationErrorByParentId((current) => ({
      ...current,
      [parentTaskId]: null,
    }));
    setTableStepTitleDrafts((current) => {
      const next = { ...current };
      delete next[parentTaskId];
      return next;
    });
  }

  async function commitTableStepDraft(parentTaskId: string) {
    const nextTitle = tableStepTitleDrafts[parentTaskId]?.trim() ?? "";
    if (!nextTitle) {
      setTableStepCreationErrorByParentId((current) => ({
        ...current,
        [parentTaskId]: "Enter a step title.",
      }));
      tableStepDraftInputRef.current?.focus();
      return;
    }
    if (!onCreateChildTask || childTaskCreationBlockedTaskIds.includes(parentTaskId)) {
      setTableStepCreationErrorByParentId((current) => ({
        ...current,
        [parentTaskId]: "Step creation is blocked for this task.",
      }));
      return;
    }

    const result = await onCreateChildTask(parentTaskId, nextTitle);
    if (result.error || !result.taskId) {
      setTableStepCreationErrorByParentId((current) => ({
        ...current,
        [parentTaskId]: result.error ?? "Step was not created.",
      }));
      tableStepDraftInputRef.current?.focus();
      return;
    }

    cancelTableStepDraft(parentTaskId);
    setExpandedStepsByTaskId((current) => ({
      ...current,
      [parentTaskId]: true,
    }));
  }

  function selectEditorMetadataTask(taskId: string) {
    const visibleOrRetainedTask = getTaskById(taskId);
    setEditingTaskTitleId(null);
    setEditingSubtaskId(null);
    if (visibleOrRetainedTask) {
      pendingMetadataTargetTaskIdRef.current = null;
      setRetainedMetadataTargetTask(clonePrototypeTaskRow(visibleOrRetainedTask));
      setMetadataTargetTaskId(taskId);
      return;
    }

    pendingMetadataTargetTaskIdRef.current = taskId;
    setMetadataTargetTaskId(taskId);
    onOpenChildTask?.(taskId);
  }

  function selectParentMetadataTask() {
    pendingMetadataTargetTaskIdRef.current = null;
    setMetadataTargetTaskId(null);
    setRetainedMetadataTargetTask(null);
  }

  function renderInlineAccordionContent(task: PrototypeTaskRow) {
    if (!isInlineAccordionMode(overlayMode)) {
      return null;
    }

    if (overlayMode === "status") {
      return getSelectableTaskStatusesForRepeatFrequency(task.repeat).map((status, optionIndex) => (
        <button
          className={inlineAccordionButtonClass()}
          key={`${status || "status-option"}-${optionIndex}`}
          onClick={() => {
            setTaskStatus(task.id, status);
            closeInspector();
          }}
          type="button"
        >
          <span className={`${inlineAccordionChipContentClass(selectedTaskId === task.id && task.status === status ? statusTone(status) : `${statusTone(status)} opacity-78 hover:opacity-100`)} inline-flex items-center gap-2 whitespace-nowrap`}>
            {renderTaskStatusCircle(status, "sm")}
            <span>{formatTaskStatusLabel(status)}</span>
          </span>
        </button>
      ));
    }

    if (overlayMode === "due") {
      const dueDraft = dueDrafts[task.id] ?? { dueOn: task.dueOn, dueTime: task.dueTime };
      return [
        ...DUE_PRESETS.map((preset, presetIndex) => (
          <button
            className={inlineAccordionButtonClass()}
            key={`${preset.label || "due-preset"}-${preset.value || "blank"}-${presetIndex}`}
            onClick={() => {
              setTaskDue(task.id, preset.value, preset.value ? task.dueTime : "");
              closeInspector();
            }}
            type="button"
          >
            <span className={inlineAccordionChipContentClass(task.dueOn === preset.value ? "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]" : INACTIVE_CHIP_CLASS)}>{preset.label}</span>
          </button>
        )),
        (
          <button
            className={inlineAccordionButtonClass()}
            key="due-clear"
            onClick={() => {
              setTaskDue(task.id, "", "");
              closeInspector();
            }}
            type="button"
          >
            <span className={inlineAccordionChipContentClass(INACTIVE_CHIP_CLASS)}>Clear</span>
          </button>
        ),
        (
          <div className={inlineAccordionInputCardClass("w-[18rem]")} key="due-inputs">
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className={OVERLAY_INPUT_CLASS}
                onChange={(event) => setDueDrafts((current) => ({
                  ...current,
                  [task.id]: {
                    dueOn: event.target.value,
                    dueTime: current[task.id]?.dueTime ?? task.dueTime,
                  },
                }))}
                type="date"
                value={dueDraft.dueOn || ""}
              />
              <input
                className={OVERLAY_INPUT_CLASS}
                onChange={(event) => setDueDrafts((current) => ({
                  ...current,
                  [task.id]: {
                    dueOn: current[task.id]?.dueOn ?? task.dueOn,
                    dueTime: event.target.value,
                  },
                }))}
                type="time"
                value={dueDraft.dueTime || ""}
              />
            </div>
            <div className="mt-2 flex justify-end">
              <button
                className={inlineAccordionButtonClass()}
                onClick={() => {
                  const draft = dueDrafts[task.id] ?? { dueOn: task.dueOn, dueTime: task.dueTime };
                  setTaskDue(task.id, draft.dueOn, draft.dueTime);
                  closeInspector();
                }}
                type="button"
              >
                <span className={inlineAccordionChipContentClass("border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]")}>Apply date + time</span>
              </button>
            </div>
          </div>
        ),
      ];
    }

    if (overlayMode === "estimated") {
      const totalDraftMinutes = estimatedMinutesDrafts[task.id] ?? (task.estimatedMinutes !== null ? String(task.estimatedMinutes) : "");
      const parsedTotalDraft = Number.parseInt(totalDraftMinutes || "0", 10);
      const draftHours = totalDraftMinutes ? String(Math.floor((Number.isFinite(parsedTotalDraft) ? parsedTotalDraft : 0) / 60)) : "";
      const draftMinutes = totalDraftMinutes ? String((Number.isFinite(parsedTotalDraft) ? parsedTotalDraft : 0) % 60) : "";
      const updateEstimatedDurationDraft = (field: "hours" | "minutes", value: string) => {
        const clean = value.replace(/[^\d]/g, "");
        const hoursValue = field === "hours" ? clean : draftHours;
        const minutesValue = field === "minutes" ? clean : draftMinutes;
        const nextHours = Number.parseInt(hoursValue || "0", 10);
        const nextMinutes = Number.parseInt(minutesValue || "0", 10);
        const safeHours = Number.isFinite(nextHours) ? nextHours : 0;
        const safeMinutes = Number.isFinite(nextMinutes) ? nextMinutes : 0;
        const nextTotal = safeHours * 60 + safeMinutes;
        setEstimatedMinutesDrafts((current) => ({
          ...current,
          [task.id]: (hoursValue || minutesValue) ? String(nextTotal) : "",
        }));
      };
      return [
        ...ESTIMATED_TIME_PRESETS.map((minutes, minutesIndex) => (
          <button
            className={inlineAccordionButtonClass()}
            key={`${minutes}-${minutesIndex}`}
            onClick={() => {
              setTaskEstimatedMinutes(task.id, task.estimatedMinutes === minutes ? null : minutes);
              closeInspector();
            }}
            type="button"
          >
            <span className={inlineAccordionChipContentClass(task.estimatedMinutes === minutes ? "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]" : INACTIVE_CHIP_CLASS)}>{minutes === 60 ? "1h" : `${minutes}m`}</span>
          </button>
        )),
        (
          <button
            className={inlineAccordionButtonClass()}
            key="estimated-clear"
            onClick={() => {
              setTaskEstimatedMinutes(task.id, null);
              closeInspector();
            }}
            type="button"
          >
            <span className={inlineAccordionChipContentClass(INACTIVE_CHIP_CLASS)}>Clear</span>
          </button>
        ),
        (
          <div className={inlineAccordionInputCardClass("w-[18rem]")} key="estimated-inputs">
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className={OVERLAY_INPUT_CLASS}
                inputMode="numeric"
                onChange={(event) => updateEstimatedDurationDraft("hours", event.target.value)}
                placeholder="Hours"
                type="text"
                value={draftHours}
              />
              <input
                className={OVERLAY_INPUT_CLASS}
                inputMode="numeric"
                onChange={(event) => updateEstimatedDurationDraft("minutes", event.target.value)}
                placeholder="Minutes"
                type="text"
                value={draftMinutes}
              />
            </div>
            <div className="mt-2 flex justify-end">
              <button
                className={inlineAccordionButtonClass()}
                onClick={() => {
                  setTaskEstimatedMinutes(task.id, totalDraftMinutes ? Number.parseInt(totalDraftMinutes, 10) : null);
                  closeInspector();
                }}
                type="button"
              >
                <span className={inlineAccordionChipContentClass("border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]")}>Apply custom time</span>
              </button>
            </div>
          </div>
        ),
      ];
    }

    if (overlayMode === "priority") {
      return [
        ...PRIORITY_OPTIONS.map((option, optionIndex) => {
          const selected = task.priorities.includes(option.value);
          return (
            <button
              className={inlineAccordionButtonClass()}
              key={`${option.value || "priority-option"}-${optionIndex}`}
              onClick={() => {
                const nextPriorities = selected
                  ? task.priorities.filter((value) => value !== option.value)
                  : [...task.priorities, option.value];
                setTaskPriorities(task.id, nextPriorities);
                closeInspector();
              }}
              type="button"
            >
              <span className={inlineAccordionChipContentClass(selected ? priorityTone(option.value) : INACTIVE_CHIP_CLASS)}>{option.label}</span>
            </button>
          );
        }),
        (
          <button
            className={inlineAccordionButtonClass()}
            key="priority-clear"
            onClick={() => {
              setTaskPriorities(task.id, []);
              closeInspector();
            }}
            type="button"
          >
            <span className={inlineAccordionChipContentClass(INACTIVE_CHIP_CLASS)}>Clear all</span>
          </button>
        ),
      ];
    }

    if (overlayMode === "energy") {
      return ENERGY_OPTIONS.map((option, optionIndex) => (
        <button
          className={inlineAccordionButtonClass()}
          key={`${option.value || "energy-option"}-${optionIndex}`}
          onClick={() => {
            setTaskEnergy(task.id, option.value);
            closeInspector();
          }}
          type="button"
        >
          <span className={inlineAccordionChipContentClass(task.energy === option.value ? energyTone(option.value) : INACTIVE_CHIP_CLASS)}>{option.label}</span>
        </button>
      ));
    }

    if (overlayMode === "repeat") {
      return [
        ...REPEAT_OPTIONS.map((option, optionIndex) => (
          <button
            className={inlineAccordionButtonClass()}
            key={`${option.value || "repeat-option"}-${optionIndex}`}
            onClick={() => {
              setTaskRepeat(task.id, option.value);
              closeInspector();
            }}
            type="button"
          >
            <span className={inlineAccordionChipContentClass(task.repeat === option.value ? repeatTone(option.value) : INACTIVE_CHIP_CLASS)}>{option.label}</span>
          </button>
        )),
        ...(task.repeat !== "none"
          ? [(
            <div className={inlineAccordionInputCardClass("w-[30rem]")} key="repeat-cadence">
              {task.repeat !== "daily_until_complete" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-[#7d7597] dark:text-white/55">Every</span>
                  <input
                    className={`${OVERLAY_INPUT_CLASS} w-20`}
                    inputMode="numeric"
                    onBlur={(event) => setTaskRepeatInterval(task, event.target.value)}
                    onChange={(event) => setRepeatIntervalDrafts((current) => ({ ...current, [task.id]: event.target.value.replace(/[^\d]/g, "") }))}
                    placeholder="1"
                    type="text"
                    value={repeatIntervalDrafts[task.id] ?? String(task.repeatInterval)}
                  />
                  {(["daily", "weekly", "monthly"] as TaskRepeat[]).map((repeatUnit) => (
                    <button
                      className={inlineAccordionButtonClass()}
                      key={`${task.id}-inline-repeat-unit-${repeatUnit}`}
                      onClick={() => setTaskRepeat(task.id, repeatUnit)}
                      type="button"
                    >
                      <span className={inlineAccordionChipContentClass(task.repeat === repeatUnit ? repeatTone(repeatUnit) : INACTIVE_CHIP_CLASS)}>
                        {repeatUnit === "daily" ? "Days" : repeatUnit === "weekly" ? "Weeks" : "Months"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {task.repeat === "weekly" || task.repeat === "custom" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {REPEAT_WEEKDAY_OPTIONS.map((option) => (
                    <button
                      className={inlineAccordionButtonClass()}
                      key={`${task.id}-inline-weekday-${option.value}`}
                      onClick={() => toggleTaskRepeatWeekday(task, option.value)}
                      type="button"
                    >
                      <span className={inlineAccordionChipContentClass(task.repeatDaysOfWeek.includes(option.value) ? "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]" : INACTIVE_CHIP_CLASS)}>{option.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {task.repeat === "monthly" || task.repeat === "custom" ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-[#7d7597] dark:text-white/55">Day</span>
                  <input
                    className={`${OVERLAY_INPUT_CLASS} w-20`}
                    inputMode="numeric"
                    onBlur={(event) => setTaskRepeatDayOfMonth(task, event.target.value)}
                    onChange={(event) => setRepeatDayOfMonthDrafts((current) => ({ ...current, [task.id]: event.target.value.replace(/[^\d]/g, "").slice(0, 2) }))}
                    placeholder="15"
                    type="text"
                    value={repeatDayOfMonthDrafts[task.id] ?? (task.repeatDayOfMonth ? String(task.repeatDayOfMonth) : "")}
                  />
                </div>
              ) : null}
            </div>
          )]
          : []),
      ];
    }

    if (overlayMode === "tags") {
      const tagDraft = tagDrafts[task.id] ?? "";
      return [
        ...mergedTagOptions.map((tag, tagIndex) => (
          <button
            className={inlineAccordionButtonClass()}
            key={`${task.id || "task"}-tag-choice-${tag || "blank"}-${tagIndex}`}
            onClick={() => toggleTaskTag(task.id, tag)}
            type="button"
          >
            <span className={inlineAccordionChipContentClass(task.tags.includes(tag) ? TAG_CHIP_CLASS : INACTIVE_CHIP_CLASS)}>#{tag}</span>
          </button>
        )),
        (
          <div className={inlineAccordionInputCardClass("w-[16rem]")} key="tag-inputs">
            <div className="flex gap-2">
              <input
                className={OVERLAY_INPUT_CLASS}
                onChange={(event) => setTagDrafts((current) => ({ ...current, [task.id]: event.target.value.toLowerCase().replace(/\s+/g, "-") }))}
                placeholder="new-tag"
                type="text"
                value={tagDraft}
              />
              <button className={inlineAccordionButtonClass()} onClick={() => addTaskTag(task.id, tagDraft)} type="button">
                <span className={inlineAccordionChipContentClass("border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]")}>Add tag</span>
              </button>
            </div>
          </div>
        ),
      ];
    }

    if (overlayMode === "lists") {
      return mergedListOptions.map((option, optionIndex) => (
        <button
          className={inlineAccordionButtonClass()}
          key={`${option.id || option.label || "list-option"}-${optionIndex}`}
          onClick={() => toggleTaskList(task.id, option.label)}
          type="button"
        >
          <span className={inlineAccordionChipContentClass(taskHasList(task, option.label) ? ACTIVE_LIST_CHIP_CLASS : INACTIVE_CHIP_CLASS)}>{option.label}</span>
        </button>
      ));
    }

    if (overlayMode === "actual") {
      const runningTimer = getRunningTimer(task.id);
      return runningTimer ? (
        <>
          <button
            className={inlineAccordionButtonClass()}
            onClick={() => {
              if (runningTimer.pausedAt) {
                resumeTaskTimer(task.id);
              } else {
                pauseTaskTimer(task.id);
              }
              closeInspector();
            }}
            type="button"
          >
            <span className={inlineAccordionChipContentClass("border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff] inline-flex items-center gap-2")}>
              {runningTimer.pausedAt ? <CirclePlay className="h-3.5 w-3.5" /> : <CirclePause className="h-3.5 w-3.5" />}
              {runningTimer.pausedAt ? "Continue timer" : "Pause timer"}
            </span>
          </button>
          <button
            className={inlineAccordionButtonClass()}
            onClick={() => stopTaskTimer(task.id)}
            type="button"
          >
            <span className={inlineAccordionChipContentClass("border-[#ffd8be] bg-[#fff1e7] text-[#dc6c1c] dark:border-[#65401d] dark:bg-[#432712] dark:text-[#ffb37e] inline-flex items-center gap-2")}>
              <TimerReset className="h-3.5 w-3.5" />
              Stop focus timer
            </span>
          </button>
          <button
            className={inlineAccordionButtonClass()}
            onClick={() => clearTaskTimer(task.id)}
            type="button"
          >
            <span className={inlineAccordionChipContentClass(INACTIVE_CHIP_CLASS)}>Clear focus timer</span>
          </button>
        </>
      ) : (
        <>
          <button
            className={inlineAccordionButtonClass()}
            onClick={() => openFocusTimerForTask(task.id)}
            type="button"
          >
            <span className={inlineAccordionChipContentClass("border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff] inline-flex items-center gap-2")}>
              <CirclePlay className="h-3.5 w-3.5" />
              Start focus timer
            </span>
          </button>
          <button
            className={inlineAccordionButtonClass()}
            onClick={() => openActualTimeEntryForTask(task.id)}
            type="button"
          >
            <span className={inlineAccordionChipContentClass(INACTIVE_CHIP_CLASS)}>Log actual time</span>
          </button>
        </>
      );
    }

    if (overlayMode === "link") {
      const linkDraft = linkDrafts[task.id] ?? { label: task.linkLabel, url: task.linkUrl };
      return (
        <div className={inlineAccordionInputCardClass("w-[24rem]")}>
          <div className="space-y-2">
            <input
              className={OVERLAY_INPUT_CLASS}
              onChange={(event) => setLinkDrafts((current) => ({ ...current, [task.id]: { ...(current[task.id] ?? linkDraft), label: event.target.value } }))}
              placeholder="Link label"
              type="text"
              value={linkDraft.label}
            />
            <input
              className={OVERLAY_INPUT_CLASS}
              onChange={(event) => setLinkDrafts((current) => ({ ...current, [task.id]: { ...(current[task.id] ?? linkDraft), url: event.target.value } }))}
              placeholder="https://example.com"
              type="url"
              value={linkDraft.url}
            />
            <div className="flex justify-end gap-2">
              <button className={inlineAccordionButtonClass()} onClick={() => clearTaskLink(task.id)} type="button">
                <span className={inlineAccordionChipContentClass(INACTIVE_CHIP_CLASS)}>Clear link</span>
              </button>
              <button className={inlineAccordionButtonClass()} onClick={() => commitTaskLink(task.id, { closeAfterSave: true })} type="button">
                <span className={inlineAccordionChipContentClass("border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]")}>Save link</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (overlayMode === "notes") {
      const notesDraft = notesDrafts[task.id] ?? task.notes;
      const linkedNoteDraft = linkedNoteDrafts[task.id] ?? task.linkedNotes.map((note) => note.id);
      return (
        <div className={inlineAccordionInputCardClass("w-[28rem]")}>
          <button className={inlineAccordionButtonClass()} onClick={() => setNotePickerOpenByTaskId((current) => ({ ...current, [task.id]: !current[task.id] }))} type="button">
            <span className={inlineAccordionChipContentClass(INACTIVE_CHIP_CLASS)}>{notePickerOpenByTaskId[task.id] ? "Hide saved notes" : "Connect existing note"}</span>
          </button>
          {notePickerOpenByTaskId[task.id] ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {allNoteOptions.map((note, noteIndex) => (
                <button
                  className={inlineAccordionButtonClass()}
                  key={`${note.id || "note-option"}-${noteIndex}`}
                  onClick={() => {
                    const nextLinked = linkedNoteDraft.includes(note.id) ? linkedNoteDraft.filter((id) => id !== note.id) : [...linkedNoteDraft, note.id];
                    setLinkedNoteDrafts((current) => ({ ...current, [task.id]: nextLinked }));
                    setTaskLinkedNoteIds(task.id, nextLinked);
                  }}
                  type="button"
                >
                  <span className={inlineAccordionChipContentClass(linkedNoteDraft.includes(note.id) ? LIST_CHIP_CLASS : INACTIVE_CHIP_CLASS)}>{note.title}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-2 space-y-2">
            <textarea
              className={`${OVERLAY_INPUT_CLASS} min-h-[120px] resize-none py-3`}
              onChange={(event) => setNotesDrafts((current) => ({ ...current, [task.id]: event.target.value }))}
              placeholder="Add notes"
              value={notesDraft}
            />
            <div className="flex justify-end gap-2">
              <button className={inlineAccordionButtonClass()} onClick={() => clearTaskNotes(task.id)} type="button">
                <span className={inlineAccordionChipContentClass(INACTIVE_CHIP_CLASS)}>Clear notes</span>
              </button>
              <button className={inlineAccordionButtonClass()} onClick={() => commitTaskNotes(task.id, { closeAfterSave: true })} type="button">
                <span className={inlineAccordionChipContentClass("border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]")}>Save notes</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  }

  function renderInlineActionRow(task: PrototypeTaskRow) {
    const inlineAccordionContent = renderInlineAccordionContent(task);
    const hasInlineAccordionContent = Children.count(inlineAccordionContent) > 0;

    if (!allowInlineInspector || selectedTaskId !== task.id || !isInlineAccordionMode(overlayMode) || !hasInlineAccordionContent) {
      return null;
    }

    return (
      <motion.div
        animate={{ height: "auto", opacity: 1, y: 0 }}
        className="ml-[10px] mt-2 w-max min-w-full overflow-hidden rounded-[1.25rem] border border-[#ede7f7] bg-white px-4 py-2.5 shadow-[0_18px_45px_rgba(81,61,168,0.12)] dark:border-white/10 dark:bg-[#1b1530]"
        data-task-table-inline-editor={task.id}
        exit={{ height: 0, opacity: 0, y: -6 }}
        initial={{ height: 0, opacity: 0, y: -6 }}
        onClick={(event) => event.stopPropagation()}
        transition={{ duration: 0.18 }}
      >
        <div className="mb-1 flex items-center gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#9b92be] dark:text-white/35">
            {overlayMode === "status"
              ? "Status actions"
              : overlayMode === "due"
                ? "Due actions"
                : overlayMode === "estimated"
                  ? "Estimated time"
                  : overlayMode === "actual"
                    ? "Actual time"
                    : overlayMode === "priority"
                      ? "Priority actions"
                      : overlayMode === "energy"
                        ? "Energy actions"
                        : overlayMode === "repeat"
                          ? "Repeat actions"
                          : overlayMode === "tags"
                            ? "Tag actions"
                            : overlayMode === "link"
                              ? "Link actions"
                              : overlayMode === "notes"
                                ? "Notes actions"
                                : "List actions"}
          </p>
          <button
            aria-label="Close actions"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#e4deef] bg-[#f4f5f8] text-[#8a82a7] transition hover:text-[#6f57f6] dark:border-white/10 dark:bg-white/8 dark:text-white/55 dark:hover:text-[#cabfff]"
            onClick={() => closeInspector()}
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <div className="flex min-w-max items-start gap-1.5">
            {inlineAccordionContent}
          </div>
        </div>
      </motion.div>
    );
  }

  function beginColumnResize(event: ReactPointerEvent<HTMLSpanElement>, columnId: TaskManagementTableColumnId) {
    event.preventDefault();
    event.stopPropagation();
    resizeStateRef.current = {
      columnId,
      startWidth: effectiveColumnWidths[columnId],
      startX: event.clientX,
    };
  }

  function getMeasuredColumnWidths(selector: string, maxCount?: number) {
    const measuredNodes = Array.from(
      shellRef.current?.querySelectorAll<HTMLElement>(selector) ?? [],
    );
    const nodes = typeof maxCount === "number"
      ? measuredNodes.slice(0, maxCount)
      : measuredNodes;

    return nodes.map((node) => {
      const intrinsicWidth = Math.max(node.scrollWidth, node.offsetWidth, node.getBoundingClientRect().width);
      return Math.ceil(intrinsicWidth);
    });
  }

  function getAutoShrinkWidth(columnId: TaskManagementTableColumnId) {
    const headerWidths = getMeasuredColumnWidths(`[data-column-header-measure="${columnId}"]`);
    const rowContentWidths = getMeasuredColumnWidths(`[data-column-content-measure="${columnId}"]`);
    const widestHeader = headerWidths.length > 0 ? Math.max(...headerWidths) : 0;
    const widestRowContent = rowContentWidths.length > 0 ? Math.max(...rowContentWidths) : 0;
    return Math.max(MIN_COLUMN_WIDTHS[columnId], Math.max(widestHeader, widestRowContent) + COLUMN_WIDTH_BUFFER[columnId]);
  }

  function autoShrinkColumn(columnId: TaskManagementTableColumnId) {
    if (!shellRef.current) {
      return;
    }

    setColumnWidths((current) => ({
      ...current,
      [columnId]: getAutoShrinkWidth(columnId),
    }));
  }

  function autoShrinkAllColumns() {
    if (!shellRef.current) {
      return;
    }

    setColumnWidths((current) => visibleHeaderColumns.reduce<Record<TaskManagementTableColumnId, number>>((next, column) => {
      next[column.id] = getAutoShrinkWidth(column.id);
      return next;
    }, { ...current }));
  }

  useEffect(() => {
    if (shrinkAllColumnsToken === 0 || shrinkAllColumnsToken === lastShrinkAllColumnsTokenRef.current) {
      return;
    }

    lastShrinkAllColumnsTokenRef.current = shrinkAllColumnsToken;
    autoShrinkAllColumns();
  }, [shrinkAllColumnsToken, visibleHeaderColumns]);

  function moveColumnToFront(columnId: TaskManagementTableColumnId) {
    setColumnOrder((current) => [columnId, ...current.filter((entry) => entry !== columnId)]);
  }

  function setColumnAlignment(columnId: TaskManagementTableColumnId, alignment: ColumnAlignment) {
    setColumnAlignments((current) => ({
      ...current,
      [columnId]: alignment,
    }));
  }

  function getColumnAlignmentClass(columnId: TaskManagementTableColumnId) {
    const alignment = columnAlignments[columnId] ?? (columnId === "status_icon" ? "left" : "center");
    if (alignment === "left") return "items-start text-left justify-start";
    if (alignment === "right") return "items-end text-right justify-end";
    return "items-center text-center justify-center";
  }

  function getInlineClusterClass(columnId: TaskManagementTableColumnId) {
    const alignment = columnAlignments[columnId] ?? "center";
    if (alignment === "left") return "justify-start";
    if (alignment === "right") return "justify-end";
    return "justify-center";
  }

  function getColumnBoundaryClass(columnIndex: number, totalColumns: number) {
    if (columnIndex >= totalColumns - 1) {
      return "";
    }

    return "relative after:absolute after:right-0 after:top-0 after:bottom-0 after:w-[2px] after:bg-[#d8cffd] after:content-[''] dark:after:bg-white/18";
  }

  function openFocusTimerForTask(taskId: string) {
    startTaskTimer(taskId);
  }

  function openActualTimeEntryForTask(taskId: string) {
    closeInspector();
    onOpenTaskActualTime?.(taskId);
  }

  function openRowContextMenu(taskId: string, clientX: number, clientY: number) {
    const nextMenu = buildTaskRowContextMenuState(shellRef.current, taskId, clientX, clientY);
    if (!nextMenu) {
      return;
    }
    setOpenColumnMenuId(null);
    setRowContextMenu(nextMenu);
  }

  function toggleColumnMenu(columnId: SortColumnId, triggerElement: HTMLElement) {
    if (!shellRef.current) {
      return;
    }

    if (openColumnMenuId === columnId) {
      setOpenColumnMenuId(null);
      return;
    }

    const shellRect = shellRef.current.getBoundingClientRect();
    const triggerRect = triggerElement.getBoundingClientRect();
    const gutter = 16;
    const estimatedMenuWidth = 224;
    const minMenuHeight = 180;
    const preferredMenuHeight = 420;
    const availableBelow = Math.max(0, window.innerHeight - triggerRect.bottom - gutter);
    const availableAbove = Math.max(0, triggerRect.top - gutter);
    const placement = availableBelow < minMenuHeight && availableAbove > availableBelow ? "up" : "down";
    const maxHeight = Math.min(
      preferredMenuHeight,
      Math.max(minMenuHeight, placement === "down" ? availableBelow : availableAbove),
      Math.max(minMenuHeight, window.innerHeight - gutter * 2),
    );
    const centeredLeft = triggerRect.left + (triggerRect.width / 2) - shellRect.left - (estimatedMenuWidth / 2);
    const leftAligned = triggerRect.left - shellRect.left;
    const desiredLeft = columnId === "status_icon" ? leftAligned : centeredLeft;
    const maxLeft = Math.max(gutter, shellRect.width - estimatedMenuWidth - gutter);
    const left = Math.min(Math.max(gutter, desiredLeft), maxLeft);
    const top = placement === "down"
      ? triggerRect.bottom - shellRect.top + 8
      : triggerRect.top - shellRect.top - 8;

    setRowContextMenu(null);
    setColumnMenuPosition({ left, maxHeight, placement, top });
    setOpenColumnMenuId(columnId);
  }

  function renderColumnMenuContent(column: HeaderColumn) {
    return (
      <>
        <p className={`px-2 pb-1 ${HEADER_TEXT_CLASS}`}>
          {column.menuLabel}
        </p>
        {isTextFilterColumn(column.id) ? (
          <div className="mb-2 space-y-2 px-1">
            <input
              className={`${CONTROL_FONT_CLASS} ${UNIFIED_TABLE_TEXT_CLASS} w-full rounded-[0.9rem] border border-[#e5e0f5] bg-[#fbfaff] px-3 py-2 text-[#2f294a] outline-none placeholder:text-[#9b92be] dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:placeholder:text-white/35`}
              onChange={(event) => setTextFilters((current) => ({ ...current, [column.id]: event.target.value }))}
              placeholder={column.filterPlaceholder}
              type="text"
              value={textFilters[column.id] ?? ""}
            />
          </div>
        ) : null}
        {column.id === "status_icon" || column.id === "status" ? (
          <div className="mb-2 flex flex-wrap gap-2 px-1">
            {STATUS_OPTIONS.map((option, optionIndex) => {
              const selected = structuredFilters.status.includes(option.value);
              return (
                <button
                  className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} gap-2 ${selected ? statusTone(option.value) : LIST_CHIP_CLASS}`}
                  key={`${option.value || "status-filter"}-${optionIndex}`}
                  onClick={() => toggleStructuredFilter("status", option.value)}
                  type="button"
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current/20 text-current">
                    {renderTaskStatusGlyph(option.value, "sm")}
                  </span>
                  <span>{formatTaskStatusLabel(option.value)}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        {column.id === "priority" ? (
          <div className="mb-2 flex flex-wrap gap-2 px-1">
            {PRIORITY_OPTIONS.map((option, optionIndex) => {
              const selected = structuredFilters.priority.includes(option.value);
              return (
                <button
                  className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${selected ? priorityTone(option.value) : LIST_CHIP_CLASS}`}
                  key={`${option.value || "priority-filter"}-${optionIndex}`}
                  onClick={() => toggleStructuredFilter("priority", option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : null}
        {column.id === "energy" ? (
          <div className="mb-2 flex flex-wrap gap-2 px-1">
            {ENERGY_OPTIONS.map((option, optionIndex) => {
              const selected = structuredFilters.energy.includes(option.value);
              return (
                <button
                  className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${selected ? energyTone(option.value) : LIST_CHIP_CLASS}`}
                  key={`${option.value || "energy-filter"}-${optionIndex}`}
                  onClick={() => toggleStructuredFilter("energy", option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : null}
        {column.id === "repeat" ? (
          <div className="mb-2 flex flex-wrap gap-2 px-1">
            {REPEAT_OPTIONS.map((option, optionIndex) => {
              const selected = structuredFilters.repeat.includes(option.value);
              return (
                <button
                  className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${selected ? repeatTone(option.value) : LIST_CHIP_CLASS}`}
                  key={`${option.value || "repeat-filter"}-${optionIndex}`}
                  onClick={() => toggleStructuredFilter("repeat", option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="mb-2 mt-1 border-t border-[#f0ebfb] px-1 pt-2 dark:border-white/10">
          <p className={`px-2 pb-2 ${HEADER_TEXT_CLASS}`}>Column layout</p>
          <div className="flex flex-wrap gap-2">
            {column.id === "status_icon" ? (
              <>
                {(["circle", "chip"] as const).map((mode, modeIndex) => (
                  <button
                    className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${statusDisplayMode === mode ? "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]" : INACTIVE_CHIP_CLASS}`}
                    key={`${mode || "status-display"}-${modeIndex}`}
                    onClick={() => {
                      setStatusDisplayMode(mode);
                      if (mode === "chip") {
                        setColumnWidths((current) => ({
                          ...current,
                          status_icon: Math.max(current.status_icon, 150),
                        }));
                      }
                    }}
                    type="button"
                  >
                    {mode === "circle" ? "Circle view" : "Chip view"}
                  </button>
                ))}
              </>
            ) : null}
            {(["left", "center", "right"] as ColumnAlignment[]).map((alignment, alignmentIndex) => (
              <button
                className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${(columnAlignments[column.id] ?? "center") === alignment ? "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]" : INACTIVE_CHIP_CLASS}`}
                key={`${alignment || "alignment"}-${alignmentIndex}`}
                onClick={() => setColumnAlignment(column.id, alignment)}
                type="button"
              >
                {alignment === "center" ? "Middle" : alignment === "left" ? "Left" : "Right"}
              </button>
            ))}
            <button
              className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${INACTIVE_CHIP_CLASS} gap-2`}
              onClick={() => {
                autoShrinkColumn(column.id);
                setOpenColumnMenuId(null);
              }}
              type="button"
            >
              Auto shrink
            </button>
            <button
              className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${INACTIVE_CHIP_CLASS} gap-2`}
              onClick={() => moveColumnToFront(column.id)}
              type="button"
            >
              <MoveLeft className="h-3.5 w-3.5" />
              Move to front
            </button>
          </div>
        </div>
        <div className="space-y-1">
          {column.options.map((option, optionIndex) => {
            const isActive = sortState?.columnId === column.id && sortState.optionId === option.id;

            return (
              <button
                className={`${CONTROL_FONT_CLASS} ${UNIFIED_TABLE_TEXT_CLASS} flex w-full items-center justify-between rounded-[0.9rem] px-3 py-2 transition ${isActive ? "bg-[#f1ecff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]" : "text-[#5f6983] hover:bg-[#f7f3ff] hover:text-[#6f57f6] dark:text-white/70 dark:hover:bg-white/8 dark:hover:text-[#cabfff]"}`}
                key={`${option.id || "column-option"}-${optionIndex}`}
                onClick={() => {
                  setSortState({ columnId: column.id, optionId: option.id });
                  setOpenColumnMenuId(null);
                }}
                type="button"
              >
                <span>{option.label}</span>
                {isActive ? <span>On</span> : null}
              </button>
            );
          })}
          <button
            className={`${CONTROL_FONT_CLASS} ${UNIFIED_TABLE_TEXT_CLASS} flex w-full items-center justify-between rounded-[0.9rem] px-3 py-2 text-[#5f6983] transition hover:bg-[#f7f3ff] hover:text-[#6f57f6] dark:text-white/70 dark:hover:bg-white/8 dark:hover:text-[#cabfff]`}
            onClick={() => {
              if (sortState?.columnId === column.id) {
                setSortState(null);
              }
              if (isTextFilterColumn(column.id)) {
                setTextFilters((current) => ({ ...current, [column.id]: "" }));
              }
              if (isStructuredFilterColumn(column.id)) {
                setStructuredFilters((current) => ({ ...current, [column.id]: [] }));
              }
              setOpenColumnMenuId(null);
            }}
            type="button"
          >
            <span>{isTextFilterColumn(column.id) || isStructuredFilterColumn(column.id) ? "Clear column" : "Clear sort"}</span>
          </button>
        </div>
      </>
    );
  }

  function openTaskOverlayFromContextMenu(taskId: string, mode: OverlayMode, sourceElement?: HTMLElement | null) {
    setRowContextMenu(null);
    openInspector(taskId, mode, sourceElement, modeSupportsBatchQuickEdit(mode) ? getContextMenuQuickEditTargetTaskIds(taskId) : null);
  }

  function openTaskDetailsFromContextMenu(taskId: string, sourceElement?: HTMLElement | null) {
    setRowContextMenu(null);

    if (enableInspector) {
      openInspector(taskId, "full", sourceElement);
      return;
    }

    onRowClick?.(taskId);
  }

  function clearPendingRowClick() {
    if (pendingRowClickTimeoutRef.current !== null) {
      window.clearTimeout(pendingRowClickTimeoutRef.current);
      pendingRowClickTimeoutRef.current = null;
    }
  }

  function startTaskSelection(taskId: string, options?: { additive?: boolean; range?: boolean }) {
    setRowContextMenu(null);
    onToggleTaskSelection?.(taskId, {
      additive: options?.additive ?? true,
      range: options?.range,
      visibleTaskIds,
    });
  }

  function openRowPrimaryAction(taskId: string, sourceElement: HTMLElement) {
    if (enableInspector) {
      openInspector(taskId, "full", sourceElement);
      return;
    }

    onRowClick?.(taskId);
  }

  function renderFocusTimerDial(seconds: number, options?: { compact?: boolean; title?: string; showAccentLine?: boolean }) {
    const compact = options?.compact ?? false;
    const wrapperClass = compact ? "h-[4.4rem] w-[4.4rem]" : "h-[6.25rem] w-[6.25rem]";
    const outerSvgViewBox = 272;
    const center = 136;
    const radius = 128;
    const circumference = 2 * Math.PI * radius;
    const progress = ((seconds % 60) / 60) * 360;
    const strokeOffset = circumference * (1 - (progress / 360));

    return (
      <div className={`relative flex items-center justify-center ${wrapperClass}`}>
        <svg
          className="absolute inset-0 h-full w-full -rotate-90 scale-[1.01] transition-all duration-1000"
          viewBox={`0 0 ${outerSvgViewBox} ${outerSvgViewBox}`}
        >
          <circle
            className="text-[#f0ecfc] dark:text-white/[0.03]"
            cx={center}
            cy={center}
            fill="transparent"
            r={radius}
            stroke="currentColor"
            strokeWidth="7"
          />
          <circle
            cx={center}
            cy={center}
            fill="transparent"
            r={radius}
            stroke="#6f57f6"
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
            strokeLinecap="round"
            strokeWidth="7"
            style={{
              transition: "stroke-dashoffset 1s linear",
            }}
          />
        </svg>

        <div className={`relative z-10 flex ${compact ? "h-[3.85rem] w-[3.85rem]" : "h-[5.45rem] w-[5.45rem]"} flex-col items-center justify-center rounded-full border border-[#ece6fa] bg-white px-2 text-center shadow-[0_8px_24px_rgba(31,38,135,0.06)] ${compact ? "" : "backdrop-blur-[6px]"} dark:border-white/5 dark:bg-[#181226] dark:shadow-[0_24px_48px_rgba(0,0,0,0.2)] dark:backdrop-blur-[12px]`}>
          <div className="mb-1 text-[#6f57f6] dark:text-[#cabfff]">
            <Clock3 className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
          </div>
          <p className={`${compact ? "text-[0.95rem]" : "text-[1.45rem]"} font-black leading-none tracking-tight text-[#1f2746] dark:text-white`}>
            {formatActual(seconds)}
          </p>
          {options?.title ? (
            <>
              <p className={`${compact ? "mt-0.5 max-w-[2.8rem] text-[0.58rem]" : "mt-1 max-w-[4.2rem] text-[0.72rem]"} truncate font-black uppercase leading-tight tracking-[0.12em] text-[#8d87a7] dark:text-white/35`}>
                {options.title}
              </p>
            </>
          ) : null}
          {!compact && options?.showAccentLine ? <div className="mt-1 h-1 w-10 rounded-full bg-[#6f57f6]" /> : null}
        </div>
      </div>
    );
  }

  function renderRowCell(task: PrototypeTaskRow, columnId: TaskManagementTableColumnId) {
    const summarizedLists = summarizeInlineItems(task.lists);
    const summarizedTags = summarizeInlineItems(task.tags);
    const summarizedLinkedNotes = summarizeInlineItems(task.linkedNotes);
    const summarizedPriorities = summarizeInlineItems(task.priorities);
    const visibleSubtasks = filterPrototypeSubtasks(task.subtasks, hiddenSubtaskIds);

    const wrapMeasuredContent = (content: ReactNode, className = "") => (
      <div
        className={`inline-flex w-max max-w-none items-center justify-start ${className}`}
        data-column-content-measure={columnId}
      >
        {content}
      </div>
    );

    const canOpenInlineInspector = allowInlineInspector
      && (columnId === "lists"
        || columnId === "due"
        || columnId === "estimated"
        || columnId === "actual"
        || columnId === "tags"
        || columnId === "link"
        || columnId === "notes"
        || columnId === "priority"
        || columnId === "energy"
        || columnId === "repeat"
        || columnId === "status");

    const wrapInteractiveCell = (content: ReactNode, mode: OverlayMode) => {
      if (!canOpenInlineInspector) {
        return content;
      }

      return (
        <button
          className={`${CONTROL_FONT_CLASS} inline-flex min-w-0 max-w-full items-center justify-center overflow-hidden rounded-[0.95rem] py-1 transition`}
          onClick={(event) => {
            event.stopPropagation();
            toggleInlineActionRow(task.id, mode, event.currentTarget);
          }}
          type="button"
        >
          {content}
        </button>
      );
    };

    if (columnId === "status_icon") {
      if (!allowInlineInspector) {
        return wrapMeasuredContent(
          <div className="flex items-center justify-center self-center">
            {statusDisplayMode === "chip" ? renderTaskStatusChip(task.status, { size: "sm" }) : renderTaskStatusCircle(task.status, "md")}
          </div>,
          "justify-center"
        );
      }

      return (
        <div className="flex items-center justify-center self-center">
          <button
            className={`${CONTROL_FONT_CLASS} rounded-full p-0 transition`}
            onClick={(event) => {
              event.stopPropagation();
              toggleInlineActionRow(task.id, "status", event.currentTarget);
            }}
            type="button"
          >
            <span className="inline-flex w-max items-center justify-center" data-column-content-measure={columnId}>
              {statusDisplayMode === "chip" ? renderTaskStatusChip(task.status, { size: "sm" }) : renderTaskStatusCircle(task.status, "md")}
            </span>
          </button>
        </div>
      );
    }

    if (columnId === "title") {
      const hasDescription = task.notes.trim().length > 0;
      const hasSubtasks = visibleSubtasks.length > 0;
      const stepPreviewGroup = childTaskPreviewByParentTaskId[task.id];
      const hasStepPreview = Boolean(stepPreviewGroup && (stepPreviewGroup.items.length > 0 || stepPreviewGroup.summary.hasInvalidDescendants));
      const stepsExpanded = (expandedStepsByTaskId[task.id] ?? false) || searchMatchedStepParentTaskIdSet.has(task.id);
      const subtasksExpanded = expandedSubtasksByTaskId[task.id] ?? false;
      const hasUnifiedSteps = hasStepPreview || hasSubtasks;
      const unifiedStepsExpanded = hasStepPreview ? stepsExpanded : subtasksExpanded;
      const hasSecondaryContent = hasDescription || hasStepPreview || hasSubtasks;
      const isRenamingTitle = editingTaskTitleId === task.id;
      const titleDraft = titleDraftsRef.current[task.id] ?? task.title;
      return (
        <div className="relative min-w-0 w-full pl-[5px]">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 inline-flex w-full max-w-[40ch] items-start justify-start opacity-0"
            data-column-content-measure={columnId}
            style={{ maxWidth: "min(100%, 40ch)" }}
          >
            <span className={`flex min-w-0 items-start ${hasSecondaryContent ? "flex-col" : "min-h-[2.25rem] justify-center"}`}>
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className={`${VISIBLE_TITLE_TEXT_CLASS} whitespace-normal break-words`}>{task.title}</span>
                {task.status === "trashed" ? (
                  <span className="inline-flex items-center rounded-full border border-[#ddd2ff] bg-[#f6f2ff] px-2 py-1 text-[11px] font-medium leading-none text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]">
                    {`${getTrashDaysRemaining(task.trashedAt) ?? 30}d until auto delete`}
                  </span>
                ) : null}
              </span>
              {hasDescription ? (
                <span className="mt-1 max-w-full truncate text-[12px] font-medium text-[#8d87a7] dark:text-white/40">
                  {task.notes.trim()}
                </span>
              ) : null}
            </span>
          </span>
          <div className={`min-w-0 max-w-[40ch] ${hasSecondaryContent ? "space-y-1" : "flex min-h-[2.25rem] items-center"}`} style={{ maxWidth: "min(100%, 40ch)" }}>
            <div className="flex min-w-0 items-center gap-1.5">
              {isRenamingTitle ? (
                <TaskTitleDraftInput
                  autoFocus
                  className={`${VISIBLE_TITLE_TEXT_CLASS} h-[15px] min-h-0 min-w-0 flex-1 rounded-[0.45rem] border border-[#ddd2ff] bg-white px-1 py-0 outline-none transition focus:border-[#b7a7ff] dark:border-[#42306f] dark:bg-[#22193f] dark:focus:border-[#6d56d6]`}
                  initialValue={titleDraft}
                  onCommit={commitTaskTitle}
                  onDone={() => setEditingTaskTitleId((current) => (current === task.id ? null : current))}
                  onDraftChange={setTitleDraft}
                  style={PARENT_TITLE_RENAME_INPUT_TYPOGRAPHY_STYLE}
                  taskId={task.id}
                />
              ) : (
                <button
                  className="min-w-0 appearance-none border-0 bg-transparent p-0 text-left shadow-none outline-none transition hover:opacity-85 focus-visible:rounded-[0.5rem] focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:focus-visible:ring-[#3b2f68]/90"
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditingTaskTitleId(task.id);
                    setTitleDraft(task.id, task.title);
                  }}
                  type="button"
                >
                  <p className={`${VISIBLE_TITLE_TEXT_CLASS} min-w-0 whitespace-normal break-words`}>
                    {task.title}
                  </p>
                </button>
              )}
              {task.status === "trashed" ? (
                <span className="inline-flex items-center rounded-full border border-[#ddd2ff] bg-[#f6f2ff] px-2 py-1 text-[11px] font-medium leading-none text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]">
                  {`${getTrashDaysRemaining(task.trashedAt) ?? 30}d until auto delete`}
                </span>
              ) : null}
              {(task.status === "archived" || task.status === "trashed") && onRestoreTask ? (
                <button
                  aria-label="Restore task to inbox"
                  className={ROW_ACTION_ICON_BUTTON_CLASS}
                  onPointerDown={stopRowActionPointerEvent}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRestoreTask(task.id);
                  }}
                  type="button"
                >
                  <MoveLeft className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {onCreateChildTask ? (
                <button
                  aria-label="Add Step"
                  className={ROW_ACTION_ICON_BUTTON_CLASS}
                  onPointerDown={stopRowActionPointerEvent}
                  onClick={(event) => {
                    event.stopPropagation();
                    beginTableStepDraft(task.id);
                  }}
                  type="button"
                >
                  <Footprints className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {onOpenTaskHistory ? (
                <button
                  aria-label="Open task history"
                  className={ROW_ACTION_ICON_BUTTON_CLASS}
                  onPointerDown={stopRowActionPointerEvent}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenTaskHistory(task.id);
                  }}
                  type="button"
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {onOpenDeleteTask ? (
                <button
                  aria-label={task.status === "trashed" ? "Delete permanently" : "Move to trash"}
                  className={ROW_ACTION_DANGER_ICON_BUTTON_CLASS}
                  onPointerDown={stopRowActionPointerEvent}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenDeleteTask(task.id);
                  }}
                  type="button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {task.currentStreak > 0 ? (
                <span className={`${CHIP_BASE} border-[#ffd8be] bg-[#fff1e7] text-[#dc6c1c] dark:border-[#65401d] dark:bg-[#432712] dark:text-[#ffb37e] gap-1 px-2`}>
                  <Flame className="h-3 w-3" />
                  {task.currentStreak}
                </span>
              ) : null}
              {task.missedStreak > 0 ? (
                <span className={`${CHIP_BASE} border-[#ffd6de] bg-[#fff1f3] text-[#d94e67] dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf] gap-1 px-2`}>
                  <Skull className="h-3 w-3" />
                  {task.missedStreak}
                </span>
              ) : null}
            </div>
            {hasDescription ? (
              <p className="truncate text-left text-[12px] font-medium text-[#8d87a7] dark:text-white/40">
                {task.notes.trim()}
              </p>
            ) : null}
            {hasUnifiedSteps ? (
              <div className="w-full min-w-0">
                <div className="inline-flex items-center gap-1.5">
                  <span className={TITLE_CELL_CLASS}>Steps</span>
                  <button
                    aria-expanded={unifiedStepsExpanded}
                    className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border border-transparent text-[#9b92be] transition hover:border-[#ddd2ff] hover:bg-[#f3efff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:text-white/35 dark:hover:border-[#42306f] dark:hover:bg-[#22193f] dark:focus-visible:ring-[#3b2f68]/90"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (hasStepPreview) {
                        setExpandedStepsByTaskId((current) => ({
                          ...current,
                          [task.id]: !stepsExpanded,
                        }));
                      }
                      if (hasSubtasks) {
                        setExpandedSubtasksByTaskId((current) => ({
                          ...current,
                          [task.id]: !unifiedStepsExpanded,
                        }));
                      }
                    }}
                    type="button"
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${unifiedStepsExpanded ? "rotate-180" : ""}`} />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    if (columnId === "lists") {
      return wrapInteractiveCell(
        wrapMeasuredContent(
          <div className={`flex min-w-0 flex-nowrap gap-2 ${getInlineClusterClass(columnId)}`}>
            {summarizedLists.visibleItems.map((list, listIndex) => (
              <span className={`${CHIP_BASE} ${ACTIVE_LIST_CHIP_CLASS}`} key={`${task.id || "task"}-list-${list || "blank"}-${listIndex}`}>
                {list}
              </span>
            ))}
            {summarizedLists.extraCount > 0 ? (
              <span className={`${CHIP_BASE} ${INACTIVE_CHIP_CLASS}`}>+{summarizedLists.extraCount}</span>
            ) : null}
          </div>
        ),
        "lists"
      );
    }

    if (columnId === "due") {
      return wrapInteractiveCell(
        wrapMeasuredContent(
          <div>
            <span className={`${CHIP_BASE} ${task.dueOn ? "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]" : INACTIVE_CHIP_CLASS}`}>
              {formatDue(task.dueOn, task.dueTime)}
            </span>
          </div>
        ),
        "due"
      );
    }

    if (columnId === "date_added") {
      return wrapMeasuredContent(
        <div>
          <span className={`${CHIP_BASE} ${LIST_CHIP_CLASS}`}>
            {formatEntryTimestamp(task.createdAt)}
          </span>
        </div>
      );
    }

    if (columnId === "date_completed") {
      return wrapMeasuredContent(
        <div>
          <span className={`${CHIP_BASE} ${task.completedAt ? LIST_CHIP_CLASS : INACTIVE_CHIP_CLASS}`}>
            {task.completedAt ? formatEntryTimestamp(task.completedAt) : "Not completed"}
          </span>
        </div>
      );
    }

    if (columnId === "estimated") {
      return wrapInteractiveCell(
        wrapMeasuredContent(
          <div>
            <span className={`${CHIP_BASE} ${task.estimatedMinutes ? "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]" : INACTIVE_CHIP_CLASS} gap-1.5`}>
              <Clock3 className="h-3.25 w-3.25" />
              {formatMinutesChip(task.estimatedMinutes)}
            </span>
          </div>
        ),
        "estimated"
      );
    }

    if (columnId === "actual") {
      return wrapInteractiveCell(
        wrapMeasuredContent(
          <div>
            {getRunningTimer(task.id)
              ? renderFocusTimerDial(getDisplayedActualSeconds(task), { compact: true })
              : (
                <span className={`${CHIP_BASE} ${getDisplayedActualSeconds(task) > 0 ? "border-[#ece7f5] bg-white text-[#6f57f6] dark:border-white/10 dark:bg-[#181226] dark:text-[#cabfff]" : INACTIVE_CHIP_CLASS} gap-1.5`}>
                  <Clock3 className="h-3.25 w-3.25" />
                  {formatActual(getDisplayedActualSeconds(task))}
                </span>
              )}
          </div>
        ),
        "actual"
      );
    }

    if (columnId === "tags") {
      return wrapInteractiveCell(
        wrapMeasuredContent(
          <div className={`flex min-w-0 flex-nowrap gap-2 ${getInlineClusterClass(columnId)}`}>
            {task.tags.length > 0 ? summarizedTags.visibleItems.map((tag, tagIndex) => (
              <span className={`${CHIP_BASE} ${TAG_CHIP_CLASS}`} key={`${task.id || "task"}-tag-${tag || "blank"}-${tagIndex}`}>
                #{tag}
              </span>
            )) : (
              <span className={`${CHIP_BASE} ${INACTIVE_CHIP_CLASS}`}># Tag</span>
            )}
            {summarizedTags.extraCount > 0 ? (
              <span className={`${CHIP_BASE} ${INACTIVE_CHIP_CLASS}`}>+{summarizedTags.extraCount}</span>
            ) : null}
          </div>
        ),
        "tags"
      );
    }

    if (columnId === "link") {
      if (!canOpenInlineInspector) {
        return wrapMeasuredContent(
          <div className={`flex items-center gap-2 ${getInlineClusterClass(columnId)}`}>
            <span className={`${CHIP_BASE} ${task.linkLabel ? LIST_CHIP_CLASS : INACTIVE_CHIP_CLASS}`}>{task.linkLabel || "No link"}</span>
            {task.linkUrl ? (
              <button
                className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${LIST_CHIP_CLASS} px-2`}
                onClick={() => openExternalLink(task.linkUrl)}
                type="button"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        );
      }

      return (
        <div
          className={`inline-flex w-max max-w-none items-center gap-2 ${getInlineClusterClass(columnId)}`}
          data-column-content-measure={columnId}
        >
          <button
            className={`${CONTROL_FONT_CLASS} rounded-[0.95rem] px-2 py-1 transition`}
            onClick={(event) => {
              event.stopPropagation();
              toggleInlineActionRow(task.id, "link", event.currentTarget);
            }}
            type="button"
          >
            <span className={`${CHIP_BASE} ${task.linkLabel ? LIST_CHIP_CLASS : INACTIVE_CHIP_CLASS}`}>{task.linkLabel || "No link"}</span>
          </button>
          {task.linkUrl ? (
            <button
              className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${LIST_CHIP_CLASS} px-2`}
              onClick={(event) => {
                event.stopPropagation();
                openExternalLink(task.linkUrl);
              }}
              type="button"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      );
    }

    if (columnId === "notes") {
      if (!canOpenInlineInspector) {
        return wrapMeasuredContent(
          <div className={`flex min-w-0 flex-nowrap gap-2 ${getInlineClusterClass(columnId)}`}>
            {task.linkedNotes.length > 0 ? task.linkedNotes.map((note, noteIndex) => (
              <button className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${LIST_CHIP_CLASS}`} key={`${note.id || "linked-note"}-${noteIndex}`} onClick={() => openLinkedNote(note.id)} type="button">
                {note.title}
              </button>
            )) : (
              <span className={`${CHIP_BASE} ${task.notes ? LIST_CHIP_CLASS : INACTIVE_CHIP_CLASS}`}>{task.notes ? "Notes" : "No notes"}</span>
            )}
          </div>
        );
      }

      return (
        <div
          className={`inline-flex min-w-0 w-max max-w-none flex-nowrap gap-2 ${getInlineClusterClass(columnId)}`}
          data-column-content-measure={columnId}
        >
          {task.linkedNotes.length > 0 ? summarizedLinkedNotes.visibleItems.map((note, noteIndex) => (
            <button className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${LIST_CHIP_CLASS}`} key={`${note.id || "linked-note"}-${noteIndex}`} onClick={(event) => { event.stopPropagation(); openLinkedNote(note.id); }} type="button">
              {note.title}
            </button>
          )) : (
            <button
              className={`${CONTROL_FONT_CLASS} rounded-[0.95rem] px-2 py-1 transition`}
              onClick={(event) => {
                event.stopPropagation();
                toggleInlineActionRow(task.id, "notes", event.currentTarget);
              }}
              type="button"
            >
              <span className={`${CHIP_BASE} ${task.notes ? LIST_CHIP_CLASS : INACTIVE_CHIP_CLASS}`}>{task.notes ? "Notes" : "No notes"}</span>
            </button>
          )}
          {summarizedLinkedNotes.extraCount > 0 ? (
            <span className={`${CHIP_BASE} ${INACTIVE_CHIP_CLASS}`}>+{summarizedLinkedNotes.extraCount}</span>
          ) : null}
        </div>
      );
    }

    if (columnId === "priority") {
      return wrapInteractiveCell(
        wrapMeasuredContent(
          <div className={`flex min-w-0 flex-nowrap gap-2 ${getInlineClusterClass(columnId)}`}>
            {task.priorities.length === 0 ? (
              <span className={`${CHIP_BASE} ${LIST_CHIP_CLASS}`}>None</span>
            ) : (
              summarizedPriorities.visibleItems.map((priority, priorityIndex) => (
                <span className={`${CHIP_BASE} ${priorityTone(priority)}`} key={`${task.id || "task"}-priority-${priority || "blank"}-${priorityIndex}`}>
                  {formatPriorityLabel(priority)}
                </span>
              ))
            )}
            {summarizedPriorities.extraCount > 0 ? (
              <span className={`${CHIP_BASE} ${INACTIVE_CHIP_CLASS}`}>+{summarizedPriorities.extraCount}</span>
            ) : null}
          </div>
        ),
        "priority"
      );
    }

    if (columnId === "energy") {
      return wrapInteractiveCell(
        wrapMeasuredContent(
          <div>
            <span className={`${CHIP_BASE} ${energyTone(task.energy)}`}>{formatEnergyLabel(task.energy)}</span>
          </div>
        ),
        "energy"
      );
    }

    if (columnId === "repeat") {
      return wrapInteractiveCell(
        wrapMeasuredContent(
          <div>
            <span className={`${CHIP_BASE} ${repeatTone(task.repeat)}`}>
              {REPEAT_OPTIONS.find((option) => option.value === task.repeat)?.label ?? task.repeat}
            </span>
          </div>
        ),
        "repeat"
      );
    }

    return wrapInteractiveCell(
      wrapMeasuredContent(
        <div>
          <span className={`${CHIP_BASE} ${statusTone(task.status)}`}>
            {formatStatusLabel(task.status)}
          </span>
        </div>
      ),
      "status"
    );
  }

  const renderEditorChildTaskRows = (group: ChildTaskPreviewGroup | undefined) => {
    const { collapsibleTaskIds, visibleItems: expandedItems } = buildChildTaskPreviewVisibility(group?.items ?? [], collapsedChildTaskIdSet);
    const canSelectChildTask = Boolean(onOpenChildTask);
    const canDeleteChildTask = Boolean(onOpenDeleteTask);

    if (expandedItems.length === 0 && !group?.summary.hasInvalidDescendants) {
      return null;
    }

    return (
      <div className="space-y-2">
        {group?.summary.hasInvalidDescendants ? (
          <p className="text-xs text-[#9a7a24] dark:text-[#f3d38a]">{formatInvalidChildLinkCount(group.summary.invalidChildLinkCount)}</p>
        ) : null}
        {expandedItems.map((item) => {
          const siblingItems = group?.items.filter((candidate) => candidate.parentTaskId === item.parentTaskId && candidate.depth === item.depth) ?? [];
          const siblingIndex = siblingItems.findIndex((candidate) => candidate.id === item.id);
          const depthIndent = Math.min(Math.max(item.depth - 1, 0), 3) * 0.85;
          const scheduleLabel = formatChildTaskPreviewSchedule(item);
          const estimateLabel = formatChildTaskPreviewEstimate(item.estimatedMinutes);
          const visibleTags = item.tags.slice(0, 2);
          const extraTagCount = Math.max(0, item.tags.length - visibleTags.length);
          const hasNotes = item.notes.trim().length > 0;
          const isMetadataTarget = metadataTargetTaskId === item.id;
          const isRenamingStepTitle = editingTaskTitleId === item.id;
          const canCollapse = collapsibleTaskIds.has(item.id);
          const isCollapsed = canCollapse && collapsedChildTaskIds[item.id] === true;

          return (
            <div
              className={`group flex min-w-0 items-start gap-2 rounded-[0.95rem] border border-transparent px-1.5 py-2.5 text-left transition ${isMetadataTarget ? "bg-[#fbfaff] dark:bg-white/[0.05]" : "bg-transparent"} ${canSelectChildTask ? "cursor-pointer hover:bg-[#fbfaff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:hover:bg-white/[0.05] dark:focus-visible:ring-[#3b2f68]/90" : ""} ${childTaskDragState?.taskId === item.id ? "opacity-60" : ""} ${getChildTaskDropIndicatorClassName(item.id)}`}
              data-same-table-step-row={item.id}
              key={item.id}
              onDragOver={(event) => updateChildTaskDropTarget(event, item)}
              onDrop={(event) => dropChildTaskOnItem(event, item)}
              onClick={canSelectChildTask ? (event) => {
                event.stopPropagation();
                selectEditorMetadataTask(item.id);
              } : undefined}
              onKeyDown={canSelectChildTask ? (event) => {
                if (isKeyboardEventFromEditableTarget(event.target, { isTextEditingActive: Boolean(editingTaskTitleId || editingSubtaskId) })) {
                  return;
                }
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  selectEditorMetadataTask(item.id);
                }
              } : undefined}
              role={canSelectChildTask ? "button" : undefined}
              style={{ marginLeft: `${depthIndent}rem` }}
              tabIndex={canSelectChildTask ? 0 : undefined}
            >
              <span className="mt-1 flex-none">{renderTaskStatusCircle(item.status, "sm")}</span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    {isRenamingStepTitle ? (
                      <span onClick={(event) => event.stopPropagation()} onPointerDown={stopRowActionPointerEvent}>
                        <TaskTitleDraftInput
                          autoFocus
                          className="min-w-0 rounded-[0.45rem] border border-[#ddd2ff] bg-white px-1.5 py-1 text-sm font-semibold text-[#27304c] outline-none transition focus:border-[#b7a7ff] dark:border-[#42306f] dark:bg-[#22193f] dark:text-white dark:focus:border-[#6d56d6]"
                          initialValue={item.title}
                          onCommit={commitTaskTitle}
                          onDone={() => setEditingTaskTitleId((current) => (current === item.id ? null : current))}
                          onDraftChange={setTitleDraft}
                          taskId={item.id}
                        />
                      </span>
                    ) : (
                      <div className="flex min-w-0 items-center gap-1">
                        <button
                          className="block min-w-0 appearance-none border-0 bg-transparent p-0 text-left shadow-none outline-none transition hover:opacity-85 focus-visible:rounded-[0.5rem] focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:focus-visible:ring-[#3b2f68]/90"
                          onClick={(event) => {
                            event.stopPropagation();
                            selectEditorMetadataTask(item.id);
                            setEditingTaskTitleId(item.id);
                            setTitleDraft(item.id, item.title);
                          }}
                          onPointerDown={stopRowActionPointerEvent}
                          type="button"
                        >
                          <p className={`${VISIBLE_TITLE_TEXT_CLASS} min-w-0 truncate`}>
                            {item.title || (item.depth > 1 ? "Untitled substep" : "Untitled step")}
                          </p>
                        </button>
                        {canCollapse ? (
                          <button
                            aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${item.depth > 1 ? "substep" : "step"} ${item.title || "Untitled"}`}
                            className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border border-transparent text-[#8a79d6] transition hover:border-[#ddd2ff] hover:bg-[#f3efff] dark:text-[#b6a9ec] dark:hover:border-[#42306f] dark:hover:bg-[#22193f]"
                            onClick={(event) => {
                              event.stopPropagation();
                              setCollapsedChildTaskIds((current) => ({ ...current, [item.id]: !isCollapsed }));
                            }}
                            onPointerDown={stopRowActionPointerEvent}
                            type="button"
                          >
                            {isCollapsed ? <ChevronDown className="h-3.5 w-3.5 rotate-[-90deg]" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        ) : null}
                      </div>
                    )}
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9b92be] dark:text-white/35">
                      {formatChildTaskPreviewDepthLabel(item.depth)}
                    </p>
                  </div>
                  <div className="flex flex-none items-center gap-1">
                    {onReorderChildTask ? (
                      <button
                        aria-label={`Drag to reorder ${item.depth > 1 ? "substep" : "step"} ${item.title || "Untitled"}`}
                        className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full border border-transparent text-[#8a79d6] opacity-70 transition hover:border-[#ddd2ff] hover:bg-[#f3efff] hover:opacity-100 dark:text-[#b6a9ec] dark:hover:border-[#42306f] dark:hover:bg-[#22193f]"
                        draggable
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onDragEnd={clearChildTaskDragState}
                        onDragStart={(event) => beginChildTaskDrag(event, item)}
                        onPointerDown={stopRowActionPointerEvent}
                        type="button"
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    {onReorderChildTask ? (
                      <>
                        <button
                          aria-label={`Move ${item.depth > 1 ? "substep" : "step"} ${item.title || "Untitled"} up`}
                          className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full border border-transparent text-[#6f57f6] transition hover:border-[#ddd2ff] hover:bg-[#f3efff] disabled:cursor-not-allowed disabled:opacity-25 dark:text-[#cabfff] dark:hover:border-[#42306f] dark:hover:bg-[#22193f]"
                          disabled={siblingIndex <= 0}
                          onClick={(event) => { event.stopPropagation(); onReorderChildTask(item.id, "up"); }}
                          onPointerDown={stopRowActionPointerEvent}
                          type="button"
                        ><ArrowUp className="h-3.5 w-3.5" /></button>
                        <button
                          aria-label={`Move ${item.depth > 1 ? "substep" : "step"} ${item.title || "Untitled"} down`}
                          className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full border border-transparent text-[#6f57f6] transition hover:border-[#ddd2ff] hover:bg-[#f3efff] disabled:cursor-not-allowed disabled:opacity-25 dark:text-[#cabfff] dark:hover:border-[#42306f] dark:hover:bg-[#22193f]"
                          disabled={siblingIndex < 0 || siblingIndex >= siblingItems.length - 1}
                          onClick={(event) => { event.stopPropagation(); onReorderChildTask(item.id, "down"); }}
                          onPointerDown={stopRowActionPointerEvent}
                          type="button"
                        ><ArrowDown className="h-3.5 w-3.5" /></button>
                      </>
                    ) : null}
                    {onOpenTaskHistory ? (
                      <button
                        aria-label={`Open history for step ${item.title || "Untitled step"}`}
                        className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full border border-transparent text-[#6f57f6] opacity-75 transition hover:border-[#ddd2ff] hover:bg-[#f3efff] hover:opacity-100 dark:text-[#cabfff] dark:hover:border-[#42306f] dark:hover:bg-[#22193f]"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenTaskHistory(item.id);
                        }}
                        onPointerDown={stopRowActionPointerEvent}
                        type="button"
                      >
                        <CalendarDays className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    {canDeleteChildTask && !isMetadataTarget ? (
                      <button
                        aria-label={`Move step ${item.title || "Untitled step"} to trash`}
                        className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full border border-transparent text-[#d94e67] opacity-70 transition hover:border-[#ffd6de] hover:bg-[#fff1f3] hover:opacity-100 dark:text-[#ff9eaf] dark:hover:border-[#5b2e3b] dark:hover:bg-[#44232f]"
                        data-same-table-step-delete={item.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenDeleteTask?.(item.id);
                        }}
                        onPointerDown={stopRowActionPointerEvent}
                        type="button"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 flex max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
                  {scheduleLabel ? <span className={`${CHIP_BASE} border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]`}>{scheduleLabel}</span> : null}
                  {estimateLabel ? (
                    <span className={`${CHIP_BASE} border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff] gap-1.5`}>
                      <Clock3 className="h-3.25 w-3.25" />
                      {estimateLabel}
                    </span>
                  ) : null}
                  {item.actualSeconds > 0 ? (
                    <span className={`${CHIP_BASE} border-[#ece7f5] bg-white text-[#6f57f6] dark:border-white/10 dark:bg-[#181226] dark:text-[#cabfff] gap-1.5`}>
                      <Clock3 className="h-3.25 w-3.25" />
                      {formatActual(item.actualSeconds)}
                    </span>
                  ) : null}
                  {item.priorityFlags.map((priority) => (
                    <span className={`${CHIP_BASE} ${priorityTone(priority)}`} key={`${item.id}-editor-priority-${priority}`}>
                      {formatPriorityLabel(priority)}
                    </span>
                  ))}
                  {item.energy !== "none" ? <span className={`${CHIP_BASE} ${energyTone(item.energy)}`}>{formatEnergyLabel(item.energy)}</span> : null}
                  {item.repeat !== "none" ? <span className={`${CHIP_BASE} ${repeatTone(item.repeat)}`}>{formatChildTaskPreviewRepeat(item)}</span> : null}
                  {item.currentStreak > 0 ? (
                    <span className={`${CHIP_BASE} border-[#ffd8be] bg-[#fff1e7] text-[#dc6c1c] dark:border-[#65401d] dark:bg-[#432712] dark:text-[#ffb37e] gap-1 px-2`}>
                      <Flame className="h-3 w-3" />
                      {item.currentStreak}
                    </span>
                  ) : null}
                  {item.missedStreak > 0 ? (
                    <span className={`${CHIP_BASE} border-[#ffd6de] bg-[#fff1f3] text-[#d94e67] dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf] gap-1 px-2`}>
                      <Skull className="h-3 w-3" />
                      {item.missedStreak}
                    </span>
                  ) : null}
                  {visibleTags.map((tag) => (
                    <span className={`${CHIP_BASE} ${TAG_CHIP_CLASS}`} key={`${item.id}-editor-tag-${tag}`}>
                      #{tag}
                    </span>
                  ))}
                  {extraTagCount > 0 ? <span className={`${CHIP_BASE} ${INACTIVE_CHIP_CLASS}`}>+{extraTagCount}</span> : null}
                  {item.linkLabel || item.linkUrl ? (
                    <span className={`${CHIP_BASE} ${LIST_CHIP_CLASS}`}>{item.linkLabel || "Link"}</span>
                  ) : null}
                  {hasNotes ? <span className={`${CHIP_BASE} ${LIST_CHIP_CLASS}`}>Notes</span> : null}
                </div>
                {isMetadataTarget ? (
                  <div
                    className="mt-2 flex flex-wrap items-center justify-between gap-2 pl-8"
                    data-step-row-controls={item.id}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={stopRowActionPointerEvent}
                  >
                    <div className="flex flex-wrap gap-1.5" data-step-row-status-icons={item.id}>
                      {getSelectableTaskStatusesForRepeatFrequency(item.repeat).map((status) => (
                        <button
                          aria-label={`Set step status to ${formatTaskStatusLabel(status)}`}
                          className={`inline-flex items-center justify-center rounded-full p-0.5 transition ${
                            item.status === status
                              ? "shadow-[0_0_0_1px_rgba(111,87,246,0.18)]"
                              : "opacity-78 hover:opacity-100"
                          }`}
                          key={status}
                          onClick={() => setTaskStatus(item.id, status)}
                          type="button"
                        >
                          {renderTaskStatusCircle(status, "sm")}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SameTableStepCreationControl
                        creationBlocked={childTaskCreationBlockedTaskIds.includes(item.id)}
                        iconOnly
                        onCreateChildTask={onCreateChildTask}
                        parentTaskId={item.id}
                      />
                      {canDeleteChildTask ? (
                        <button
                          aria-label={`Move step ${item.title || "Untitled step"} to trash`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#ffd6de] bg-[#fff1f3] text-[#d94e67] transition hover:bg-[#ffe8ed] dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf]"
                          data-step-row-delete={item.id}
                          onClick={() => onOpenDeleteTask?.(item.id)}
                          type="button"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const getStepMiniCellActionMode = (columnId: TaskManagementTableColumnId): OverlayMode | null => {
    if (columnId === "status_icon" || columnId === "status") return "status";
    if (columnId === "due") return "due";
    if (columnId === "estimated") return "estimated";
    if (columnId === "actual") return "actual";
    if (columnId === "tags") return "tags";
    if (columnId === "link") return "link";
    if (columnId === "notes") return "notes";
    if (columnId === "priority") return "priority";
    if (columnId === "energy") return "energy";
    if (columnId === "repeat") return "repeat";
    return null;
  };

  const wrapStepMiniCellAction = (item: ChildTaskPreview, columnId: TaskManagementTableColumnId, content: ReactNode) => {
    const mode = getStepMiniCellActionMode(columnId);
    if (!allowInlineInspector || !mode) {
      return content;
    }

    return (
      <button
        className={`${CONTROL_FONT_CLASS} inline-flex min-w-0 max-w-full items-center justify-center overflow-hidden rounded-[0.95rem] py-1 transition`}
        onClick={(event) => {
          event.stopPropagation();
          openTableStepActions(item.id, mode);
        }}
        type="button"
      >
        {content}
      </button>
    );
  };

  const renderChildTaskMiniCell = (item: ChildTaskPreview, columnId: TaskManagementTableColumnId, childTaskPreviewVisibility?: ChildTaskPreviewVisibility) => {
    const depthIndent = Math.min(Math.max(item.depth - 1, 0), 3) * 0.55;
    const scheduleLabel = formatChildTaskPreviewSchedule(item) || "No date";
    const estimateLabel = formatChildTaskPreviewEstimate(item.estimatedMinutes) || "No est";
    const visibleTags = item.tags.slice(0, 1);
    const extraTagCount = Math.max(0, item.tags.length - visibleTags.length);
    const hasNotes = item.notes.trim().length > 0;

    if (columnId === "status_icon") {
      return wrapStepMiniCellAction(item, columnId, <div className="flex items-center justify-center self-center">{renderTaskStatusCircle(item.status, "sm")}</div>);
    }

    if (columnId === "title") {
      const isRenamingStepTitle = editingTaskTitleId === item.id;
      const canCollapse = childTaskPreviewVisibility?.collapsibleTaskIds.has(item.id) ?? false;
      const isCollapsed = canCollapse && collapsedChildTaskIds[item.id] === true;
      return (
        <div className="flex w-full min-w-0 items-center gap-1.5 text-left" style={{ paddingLeft: `${0.2 + depthIndent}rem` }}>
          <span className="h-4 w-px flex-none rounded-full bg-[#e8e0f8] dark:bg-white/10" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            {isRenamingStepTitle ? (
              <span onClick={(event) => event.stopPropagation()}>
                <TaskTitleDraftInput
                  autoFocus
                  className="h-[24px] min-h-0 w-full min-w-0 rounded-[0.45rem] border border-[#ddd2ff] bg-white px-1 py-0 text-[13px] font-medium text-[#27304c] outline-none transition focus:border-[#b7a7ff] dark:border-[#42306f] dark:bg-[#22193f] dark:text-white dark:focus:border-[#6d56d6]"
                  initialValue={item.title}
                  onCommit={commitTaskTitle}
                  onDone={() => setEditingTaskTitleId((current) => (current === item.id ? null : current))}
                  onDraftChange={setTitleDraft}
                  taskId={item.id}
                />
              </span>
            ) : (
              <div className="flex min-w-0 items-center gap-1">
                <button
                  className="block min-w-0 appearance-none border-0 bg-transparent p-0 text-left shadow-none outline-none transition hover:opacity-85 focus-visible:rounded-[0.5rem] focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:focus-visible:ring-[#3b2f68]/90"
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditingTaskTitleId(item.id);
                    setTitleDraft(item.id, item.title);
                  }}
                  type="button"
                >
                  <p className={`${VISIBLE_TITLE_TEXT_CLASS} min-w-0 truncate`}>
                    {item.title || (item.depth > 1 ? "Untitled substep" : "Untitled step")}
                  </p>
                </button>
                {canCollapse ? (
                  <button
                    aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${item.depth > 1 ? "substep" : "step"} ${item.title || "Untitled"}`}
                    className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border border-transparent text-[#8a79d6] transition hover:border-[#ddd2ff] hover:bg-[#f3efff] dark:text-[#b6a9ec] dark:hover:border-[#42306f] dark:hover:bg-[#22193f]"
                    onClick={(event) => {
                      event.stopPropagation();
                      setCollapsedChildTaskIds((current) => ({ ...current, [item.id]: !isCollapsed }));
                    }}
                    onPointerDown={stopRowActionPointerEvent}
                    type="button"
                  >
                    {isCollapsed ? <ChevronDown className="h-3.5 w-3.5 rotate-[-90deg]" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                ) : null}
              </div>
            )}
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9b92be] dark:text-white/35">
              {formatChildTaskPreviewDepthLabel(item.depth)}
            </p>
          </div>
          {onCreateChildTask ? (
            <button
              aria-label={`Add substep to ${item.title || "Untitled step"}`}
              className={ROW_ACTION_ICON_BUTTON_CLASS}
              data-same-table-step-add={item.id}
              onClick={(event) => {
                event.stopPropagation();
                beginTableStepDraft(item.id);
              }}
              onPointerDown={stopRowActionPointerEvent}
              type="button"
            >
              <Footprints className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {onOpenTaskHistory ? (
            <button
              aria-label={`Open history for step ${item.title || "Untitled step"}`}
              className={ROW_ACTION_ICON_BUTTON_CLASS}
              onClick={(event) => {
                event.stopPropagation();
                onOpenTaskHistory(item.id);
              }}
              onPointerDown={stopRowActionPointerEvent}
              type="button"
            >
              <CalendarDays className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {onOpenDeleteTask ? (
            <button
              aria-label={`Move step ${item.title || "Untitled step"} to trash`}
              className={ROW_ACTION_DANGER_ICON_BUTTON_CLASS}
              data-same-table-step-delete={item.id}
              onClick={(event) => {
                event.stopPropagation();
                onOpenDeleteTask(item.id);
              }}
              onPointerDown={stopRowActionPointerEvent}
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      );
    }

    if (columnId === "due") {
      return wrapStepMiniCellAction(item, columnId, (
        <div>
          <span className={`${CHIP_BASE} ${item.dueOn || item.dueTime || item.scheduledOn ? "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]" : INACTIVE_CHIP_CLASS}`}>
            {scheduleLabel}
          </span>
        </div>
      ));
    }

    if (columnId === "date_added") {
      return (
        <div>
          <span className={`${CHIP_BASE} ${LIST_CHIP_CLASS}`}>
            {formatEntryTimestamp(item.createdAt)}
          </span>
        </div>
      );
    }

    if (columnId === "estimated") {
      return wrapStepMiniCellAction(item, columnId, (
        <div>
          <span className={`${CHIP_BASE} ${item.estimatedMinutes ? "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]" : INACTIVE_CHIP_CLASS} gap-1.5`}>
            <Clock3 className="h-3.25 w-3.25" />
            {estimateLabel}
          </span>
        </div>
      ));
    }

    if (columnId === "actual") {
      return wrapStepMiniCellAction(item, columnId, (
        <div>
          <span className={`${CHIP_BASE} ${item.actualSeconds > 0 ? "border-[#ece7f5] bg-white text-[#6f57f6] dark:border-white/10 dark:bg-[#181226] dark:text-[#cabfff]" : INACTIVE_CHIP_CLASS} gap-1.5`}>
            <Clock3 className="h-3.25 w-3.25" />
            {formatActual(item.actualSeconds)}
          </span>
        </div>
      ));
    }

    if (columnId === "tags") {
      return wrapStepMiniCellAction(item, columnId, (
        <div className="flex min-w-0 flex-nowrap gap-2">
          {visibleTags.length > 0 ? visibleTags.map((tag) => (
            <span className={`${CHIP_BASE} ${TAG_CHIP_CLASS}`} key={`${item.id}-mini-tag-${tag}`}>
              #{tag}
            </span>
          )) : (
            <span className={`${CHIP_BASE} ${INACTIVE_CHIP_CLASS}`}># Tag</span>
          )}
          {extraTagCount > 0 ? <span className={`${CHIP_BASE} ${INACTIVE_CHIP_CLASS}`}>+{extraTagCount}</span> : null}
        </div>
      ));
    }

    if (columnId === "link") {
      if (item.linkUrl) {
        return (
          <div className="flex min-w-0 flex-nowrap items-center gap-2">
            <button
              className={`${CONTROL_FONT_CLASS} inline-flex min-w-0 max-w-full items-center justify-center overflow-hidden rounded-[0.95rem] py-1 transition`}
              onClick={(event) => {
                event.stopPropagation();
                openTableStepActions(item.id, "link");
              }}
              type="button"
            >
              <span className={`${CHIP_BASE} ${item.linkLabel ? LIST_CHIP_CLASS : INACTIVE_CHIP_CLASS}`}>{item.linkLabel || "Link"}</span>
            </button>
            <button
              className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${LIST_CHIP_CLASS} px-2`}
              onClick={(event) => {
                event.stopPropagation();
                openExternalLink(item.linkUrl);
              }}
              type="button"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      }

      return wrapStepMiniCellAction(item, columnId, (
        <div className="flex min-w-0 flex-nowrap items-center gap-2">
          <span className={`${CHIP_BASE} ${INACTIVE_CHIP_CLASS}`}>No link</span>
        </div>
      ));
    }

    if (columnId === "notes") {
      return wrapStepMiniCellAction(item, columnId, (
        <div>
          <span className={`${CHIP_BASE} ${hasNotes ? LIST_CHIP_CLASS : INACTIVE_CHIP_CLASS}`}>{hasNotes ? "Notes" : "No notes"}</span>
        </div>
      ));
    }

    if (columnId === "priority") {
      return wrapStepMiniCellAction(item, columnId, (
        <div className="flex min-w-0 flex-nowrap gap-2">
          {item.priorityFlags.length > 0 ? item.priorityFlags.slice(0, 1).map((priority) => (
            <span className={`${CHIP_BASE} ${priorityTone(priority)}`} key={`${item.id}-mini-priority-${priority}`}>
              {formatPriorityLabel(priority)}
            </span>
          )) : (
            <span className={`${CHIP_BASE} ${LIST_CHIP_CLASS}`}>None</span>
          )}
          {item.priorityFlags.length > 1 ? <span className={`${CHIP_BASE} ${INACTIVE_CHIP_CLASS}`}>+{item.priorityFlags.length - 1}</span> : null}
        </div>
      ));
    }

    if (columnId === "energy") {
      return wrapStepMiniCellAction(item, columnId, (
        <div>
          <span className={`${CHIP_BASE} ${energyTone(item.energy)}`}>{formatEnergyLabel(item.energy)}</span>
        </div>
      ));
    }

    if (columnId === "repeat") {
      return wrapStepMiniCellAction(item, columnId, (
        <div>
          <span className={`${CHIP_BASE} ${repeatTone(item.repeat)}`}>{formatChildTaskPreviewRepeat(item)}</span>
        </div>
      ));
    }

    if (columnId === "status") {
      return wrapStepMiniCellAction(item, columnId, (
        <div className="flex min-w-0 flex-nowrap items-center gap-2">
          <span className={`${CHIP_BASE} ${statusTone(item.status)}`}>{formatStatusLabel(item.status)}</span>
          {item.currentStreak > 0 ? (
            <span className={`${CHIP_BASE} border-[#ffd8be] bg-[#fff1e7] text-[#dc6c1c] dark:border-[#65401d] dark:bg-[#432712] dark:text-[#ffb37e] gap-1 px-2`}>
              <Flame className="h-3 w-3" />
              {item.currentStreak}
            </span>
          ) : null}
          {item.missedStreak > 0 ? (
            <span className={`${CHIP_BASE} border-[#ffd6de] bg-[#fff1f3] text-[#d94e67] dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf] gap-1 px-2`}>
              <Skull className="h-3 w-3" />
              {item.missedStreak}
            </span>
          ) : null}
        </div>
      ));
    }

    return (
      <div>
        <span className={`${CHIP_BASE} ${INACTIVE_CHIP_CLASS}`}>-</span>
      </div>
    );
  };

  const renderTableStepDraftCell = (parentTaskId: string, columnId: TaskManagementTableColumnId) => {
    const draft = tableStepTitleDrafts[parentTaskId] ?? "";
    const creationError = tableStepCreationErrorByParentId[parentTaskId];

    if (columnId === "status_icon") {
      return <div className="flex items-center justify-center self-center">{renderTaskStatusCircle("pending", "sm")}</div>;
    }

    if (columnId === "title") {
      return (
        <div className="flex w-full min-w-0 items-center gap-1.5 text-left" style={{ paddingLeft: "0.2rem" }}>
          <span className="h-4 w-px flex-none rounded-full bg-[#e8e0f8] dark:bg-white/10" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <input
              aria-label="New step title"
              className="w-full min-w-0 rounded-[0.45rem] border border-[#ddd2ff] bg-white px-1.5 py-1 text-[13px] font-medium text-[#27304c] outline-none transition placeholder:text-[#aaa2c8] focus:border-[#b7a7ff] dark:border-[#42306f] dark:bg-[#22193f] dark:text-white dark:focus:border-[#6d56d6]"
              onBlur={() => {
                if (draft.trim()) {
                  void commitTableStepDraft(parentTaskId);
                  return;
                }
                cancelTableStepDraft(parentTaskId);
              }}
              onChange={(event) => {
                setTableStepTitleDrafts((current) => ({
                  ...current,
                  [parentTaskId]: event.target.value,
                }));
                if (creationError) {
                  setTableStepCreationErrorByParentId((current) => ({
                    ...current,
                    [parentTaskId]: null,
                  }));
                }
              }}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitTableStepDraft(parentTaskId);
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelTableStepDraft(parentTaskId);
                }
              }}
              placeholder="Step title..."
              ref={tableStepDraftParentId === parentTaskId ? tableStepDraftInputRef : undefined}
              type="text"
              value={draft}
            />
            {creationError ? (
              <p className="mt-1 text-[11px] font-medium text-[#d94e67] dark:text-[#ff9eaf]">{creationError}</p>
            ) : (
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9b92be] dark:text-white/35">Step</p>
            )}
          </div>
        </div>
      );
    }

    if (columnId === "status") {
      return (
        <div>
          <span className={`${CHIP_BASE} ${statusTone("pending")}`}>Pending</span>
        </div>
      );
    }

    if (columnId === "due") {
      return <span className={`${CHIP_BASE} ${INACTIVE_CHIP_CLASS}`}>No date</span>;
    }

    if (columnId === "estimated") {
      return <span className={`${CHIP_BASE} ${INACTIVE_CHIP_CLASS} gap-1.5`}><Clock3 className="h-3.25 w-3.25" />No est</span>;
    }

    if (columnId === "actual") {
      return <span className={`${CHIP_BASE} ${INACTIVE_CHIP_CLASS} gap-1.5`}><Clock3 className="h-3.25 w-3.25" />0m</span>;
    }

    if (columnId === "tags") {
      return <span className={`${CHIP_BASE} ${INACTIVE_CHIP_CLASS}`}># Tag</span>;
    }

    if (columnId === "link") {
      return <span className={`${CHIP_BASE} ${INACTIVE_CHIP_CLASS}`}>No link</span>;
    }

    if (columnId === "notes") {
      return <span className={`${CHIP_BASE} ${INACTIVE_CHIP_CLASS}`}>No notes</span>;
    }

    if (columnId === "priority" || columnId === "energy") {
      return <span className={`${CHIP_BASE} ${INACTIVE_CHIP_CLASS}`}>None</span>;
    }

    if (columnId === "repeat") {
      return <span className={`${CHIP_BASE} ${INACTIVE_CHIP_CLASS}`}>No Repeat</span>;
    }

    return <span className={`${CHIP_BASE} ${INACTIVE_CHIP_CLASS}`}>-</span>;
  };

  const renderChildTaskMiniRows = (task: PrototypeTaskRow, group: ChildTaskPreviewGroup | undefined) => {
    const showAllStepItems = searchMatchedStepParentTaskIdSet.has(task.id);
    const childTaskPreviewVisibility = buildChildTaskPreviewVisibility(group?.items ?? [], collapsedChildTaskIdSet);
    const previewItems = childTaskPreviewVisibility.visibleItems;
    const visibleItems = showAllStepItems ? previewItems : previewItems.slice(0, CHILD_TASK_PREVIEW_ITEM_LIMIT);
    const hiddenItemCount = Math.max(0, previewItems.length - visibleItems.length);
    const canOpenStepActions = allowInlineInspector || Boolean(onOpenChildTask);
    const isDraftingStepForTask = tableStepDraftParentId === task.id;
    const isDraftingSubstepForVisibleItem = Boolean(tableStepDraftParentId && visibleItems.some((item) => item.id === tableStepDraftParentId));

    if (visibleItems.length === 0 && !group?.summary.hasInvalidDescendants && !isDraftingStepForTask && !isDraftingSubstepForVisibleItem) {
      return null;
    }

    return (
      <div className="-mt-1 ml-[10px] w-max min-w-full" data-task-table-step-rows={task.id}>
        {group?.summary.hasInvalidDescendants ? (
          <div className="rounded-[0.95rem] border border-[#f1dfaa] bg-[#fff9e8] px-3 py-2 text-left text-xs font-medium text-[#9a7a24] dark:border-[#6b5317] dark:bg-[#44350d]/55 dark:text-[#f3d38a]">
            {formatInvalidChildLinkCount(group?.summary.invalidChildLinkCount ?? 0)}
          </div>
        ) : null}
        {isDraftingStepForTask ? (
          <form
            className="grid w-max min-w-full items-center gap-0 rounded-[1.15rem] border border-transparent bg-white py-2 pl-[3px] pr-0 text-center transition dark:bg-[#181226]"
            data-table-step-draft-row={task.id}
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void commitTableStepDraft(task.id);
            }}
            style={{ gridTemplateColumns }}
          >
            {visibleHeaderColumns.map((column) => (
              <div className={`flex min-h-full min-w-0 overflow-hidden ${getColumnAlignmentClass(column.id)}`} key={`${task.id}-draft-${column.id}`}>
                {renderTableStepDraftCell(task.id, column.id)}
              </div>
            ))}
          </form>
        ) : null}
        {visibleItems.map((item) => {
          const inlineStepTask = childPreviewToPrototypeTaskRow(item);
          const siblingItems = group?.items.filter((candidate) => candidate.parentTaskId === item.parentTaskId && candidate.depth === item.depth) ?? [];
          const siblingIndex = siblingItems.findIndex((candidate) => candidate.id === item.id);

          return (
            <Fragment key={item.id}>
              <div
                className={`grid w-max min-w-full items-center gap-0 rounded-[1.15rem] border border-transparent bg-white py-2 pl-[3px] pr-0 text-center transition dark:bg-[#181226] ${canOpenStepActions ? "cursor-pointer hover:shadow-[0_18px_40px_rgba(109,61,208,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:hover:bg-white/[0.045] dark:focus-visible:ring-[#3b2f68]/90" : ""} ${childTaskDragState?.taskId === item.id ? "opacity-60" : ""} ${getChildTaskDropIndicatorClassName(item.id)}`}
                data-same-table-step-row={item.id}
                onDragOver={(event) => updateChildTaskDropTarget(event, item)}
                onDrop={(event) => dropChildTaskOnItem(event, item)}
                onClick={canOpenStepActions ? (event) => {
                  event.stopPropagation();
                  openTableStepActions(item.id, "status");
                } : undefined}
                onKeyDown={canOpenStepActions ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    openTableStepActions(item.id, "status");
                  }
                } : undefined}
                role={canOpenStepActions ? "button" : undefined}
                style={{ gridTemplateColumns }}
                tabIndex={canOpenStepActions ? 0 : undefined}
              >
                {visibleHeaderColumns.map((column) => (
                  <div className={`flex min-h-full min-w-0 overflow-hidden ${getColumnAlignmentClass(column.id)}`} key={`${item.id}-${column.id}`}>
                    {column.id === "title" ? (
                      <div className="flex min-w-0 flex-1 items-center gap-1">
                        {renderChildTaskMiniCell(item, column.id, childTaskPreviewVisibility)}
                        {onReorderChildTask ? (
                          <span className="ml-auto flex shrink-0 items-center" onClick={(event) => event.stopPropagation()} onPointerDown={stopRowActionPointerEvent}>
                            <button
                              aria-label={`Drag to reorder ${item.depth > 1 ? "substep" : "step"} ${item.title || "Untitled"}`}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-transparent text-[#8a79d6] opacity-70 transition hover:border-[#ddd2ff] hover:bg-[#f3efff] hover:opacity-100 dark:text-[#b6a9ec] dark:hover:border-[#42306f] dark:hover:bg-[#22193f]"
                              draggable
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              onDragEnd={clearChildTaskDragState}
                              onDragStart={(event) => beginChildTaskDrag(event, item)}
                              type="button"
                            ><GripVertical className="h-3.5 w-3.5" /></button>
                            <button aria-label={`Move ${item.depth > 1 ? "substep" : "step"} ${item.title || "Untitled"} up`} className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#6f57f6] hover:bg-[#f3efff] disabled:cursor-not-allowed disabled:opacity-25 dark:text-[#cabfff] dark:hover:bg-[#22193f]" disabled={siblingIndex <= 0} onClick={() => onReorderChildTask(item.id, "up")} type="button"><ArrowUp className="h-3.5 w-3.5" /></button>
                            <button aria-label={`Move ${item.depth > 1 ? "substep" : "step"} ${item.title || "Untitled"} down`} className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#6f57f6] hover:bg-[#f3efff] disabled:cursor-not-allowed disabled:opacity-25 dark:text-[#cabfff] dark:hover:bg-[#22193f]" disabled={siblingIndex < 0 || siblingIndex >= siblingItems.length - 1} onClick={() => onReorderChildTask(item.id, "down")} type="button"><ArrowDown className="h-3.5 w-3.5" /></button>
                          </span>
                        ) : null}
                      </div>
                    ) : renderChildTaskMiniCell(item, column.id, childTaskPreviewVisibility)}
                  </div>
                ))}
              </div>
              {renderInlineActionRow(inlineStepTask)}
              {tableStepDraftParentId === item.id ? (
                <form
                  className="grid w-max min-w-full items-center gap-0 rounded-[1.15rem] border border-transparent bg-white py-2 pl-[3px] pr-0 text-center transition dark:bg-[#181226]"
                  data-table-step-draft-row={item.id}
                  onClick={(event) => event.stopPropagation()}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void commitTableStepDraft(item.id);
                  }}
                  style={{ gridTemplateColumns }}
                >
                  {visibleHeaderColumns.map((column) => (
                    <div className={`flex min-h-full min-w-0 overflow-hidden ${getColumnAlignmentClass(column.id)}`} key={`${item.id}-draft-${column.id}`}>
                      {renderTableStepDraftCell(item.id, column.id)}
                    </div>
                  ))}
                </form>
              ) : null}
            </Fragment>
          );
        })}
        {hiddenItemCount > 0 ? (
          <p className="px-3 text-left text-xs text-[#8d87a7] dark:text-white/45">{`${hiddenItemCount} more ${hiddenItemCount === 1 ? "step" : "steps"} hidden in preview.`}</p>
        ) : null}
      </div>
    );
  };

  const renderSourceStepMiniCell = (row: PrototypeSubtaskMiniRow, columnId: TaskManagementTableColumnId) => {
    const { depth, subtask } = row;
    const depthIndent = Math.min(Math.max(depth - 1, 0), 3) * 0.55;

    if (columnId === "status_icon") {
      return <div className="flex items-center justify-center self-center">{renderTaskStatusCircle(subtask.status, "sm")}</div>;
    }

    if (columnId === "title") {
      return (
        <div className="flex w-full min-w-0 items-center gap-1.5 text-left" style={{ paddingLeft: `${0.2 + depthIndent}rem` }}>
          <span className="h-4 w-px flex-none rounded-full bg-[#e8e0f8] dark:bg-white/10" aria-hidden="true" />
          <div className="min-w-0">
            <p className="min-w-0 truncate text-[13px] font-medium text-[#27304c] dark:text-white">
              {subtask.title || (depth > 1 ? "Untitled substep" : "Untitled step")}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9b92be] dark:text-white/35">
              {formatChildTaskPreviewDepthLabel(depth)}
            </p>
          </div>
        </div>
      );
    }

    if (columnId === "status") {
      return (
        <div>
          <span className={`${CHIP_BASE} ${statusTone(subtask.status)}`}>{formatStatusLabel(subtask.status)}</span>
        </div>
      );
    }

    return <div aria-hidden="true" />;
  };

  const renderSourceStepMiniRows = (task: PrototypeTaskRow, subtasks: PrototypeTaskSubtask[]) => {
    const rows = flattenPrototypeSubtasksForMiniRows(subtasks);

    if (rows.length === 0) {
      return null;
    }

    return (
      <div className="ml-[10px] w-max min-w-full" data-task-table-source-step-rows={task.id}>
        {rows.map((row) => (
          <div
            className="grid w-max min-w-full items-center gap-0 rounded-[1.15rem] border border-transparent bg-white py-3 pl-[3px] pr-0 text-center transition dark:bg-[#181226]"
            key={row.subtask.id}
            onClick={(event) => event.stopPropagation()}
            style={{ gridTemplateColumns }}
          >
            {visibleHeaderColumns.map((column) => (
              <div className={`flex min-h-full min-w-0 overflow-hidden ${getColumnAlignmentClass(column.id)}`} key={`${row.subtask.id}-${column.id}`}>
                {renderSourceStepMiniCell(row, column.id)}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={`mx-auto mt-3 h-fit w-full max-w-[88rem] ${className}`} style={TABLE_FONT_STYLE}>
      <div className={`relative overflow-visible rounded-[2rem] border border-[#ece7f8] bg-white px-0 pt-1 pb-6 shadow-[0_26px_80px_rgba(90,67,171,0.10)] dark:border-white/10 dark:bg-[#140f26] ${shellClassName}`} ref={shellRef}>
        {showHeader ? (
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#f0ebfb] pb-5 dark:border-white/10">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#6f57f6]" />
                <h2 className={`${UNIFIED_TABLE_TEXT_CLASS} text-[#2f294a] dark:text-white`}>{title}</h2>
              </div>
              <div className={`${UNIFIED_TABLE_TEXT_CLASS} text-[#7b7596] dark:text-white/55`}>
                {statusSummary.active} active tasks • {statusSummary.done} done
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${CHIP_BASE} bg-[#f1ecff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`}>
                {primaryBadgeLabel}
              </span>
              <span className={`${CHIP_BASE} bg-[#f4f5f8] text-[#68738c] dark:bg-white/8 dark:text-white/60`}>
                {secondaryBadgeLabel}
              </span>
              {hasActiveFilters ? (
                <button
                  className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} border border-[#ddd6fb] bg-white text-[#5f6983] transition hover:border-[#c9bcff] hover:text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70 dark:hover:text-[#cabfff]`}
                  onClick={clearAllFilters}
                  type="button"
                >
                  Clear all filters
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className={`${showHeader ? "mt-1" : ""} overflow-hidden rounded-[1.7rem]`}>
          <motion.div
            animate="visible"
            className="adhdice-scrollbar relative min-h-[min(28rem,65vh)] max-h-[65vh] overflow-x-auto overflow-y-auto"
            initial="hidden"
            ref={tableScrollContainerRef}
            onScroll={() => {
              if (rowContextMenu) {
                setRowContextMenu(null);
              }
            }}
            variants={{
              visible: {
                transition: {
                  staggerChildren: 0.05,
                  delayChildren: 0.08,
                },
              },
            }}
          >
            <div className="min-w-max space-y-1.5 pb-2">
            <div className={`sticky top-0 z-20 ml-[10px] grid w-max min-w-full gap-0 bg-white/95 pl-[3px] pr-0 py-1 text-center shadow-[0_10px_24px_rgba(111,87,246,0.06)] backdrop-blur ${HEADER_TEXT_CLASS} dark:bg-[#140f26]/95 dark:shadow-[0_10px_24px_rgba(0,0,0,0.24)]`} style={{ gridTemplateColumns }}>
              {visibleHeaderColumns.map((column, columnIndex) => {
                const isOpen = openColumnMenuId === column.id;
                const isFiltered = isTextFilterColumn(column.id) && Boolean(textFilters[column.id]?.trim());
                const activeStructuredCount = column.id === "status_icon"
                  ? structuredFilters.status.length
                  : isStructuredFilterColumn(column.id)
                    ? structuredFilters[column.id].length
                    : 0;
                const isSorted = sortState?.columnId === column.id;

                return (
                  <div
                    className={`relative ${getColumnBoundaryClass(columnIndex, visibleHeaderColumns.length)}`}
                    draggable
                    key={column.id}
                    onDragOver={(event) => {
                      event.preventDefault();
                    }}
                    onDragStart={() => {
                      draggedHeaderColumnIdRef.current = column.id;
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const draggedId = draggedHeaderColumnIdRef.current;
                      if (!draggedId || draggedId === column.id) {
                        return;
                      }
                      setColumnOrder((current) => {
                        const next = current.filter((entry) => entry !== draggedId);
                        const targetIndex = next.indexOf(column.id);
                        next.splice(targetIndex, 0, draggedId);
                        return next;
                      });
                    }}
                    ref={isOpen ? columnMenuRef : undefined}
                  >
                    <button
                      aria-expanded={isOpen}
                      className={`${CONTROL_FONT_CLASS} inline-flex min-w-0 ${getColumnAlignmentClass(column.id)} gap-0 rounded-full px-1 py-0.5 ${column.id === "status_icon" ? "px-0.5 py-0.5" : "pr-1"} ${HEADER_TEXT_CLASS} transition ${isSorted || isFiltered || activeStructuredCount > 0 ? "bg-[#f1ecff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]" : "hover:bg-[#f7f3ff] hover:text-[#6f57f6] dark:hover:bg-white/8 dark:hover:text-[#cabfff]"}`}
                      onClick={(event) => toggleColumnMenu(column.id, event.currentTarget)}
                      type="button"
                    >
                      {column.id === "status_icon" ? (
                        <span className="-ml-px inline-flex w-max max-w-none items-center gap-0" data-column-header-measure={column.id}>
                          <ChevronDown className={`h-3.5 w-3.5 transition ${isOpen ? "rotate-180" : ""}`} />
                        </span>
                      ) : (
                        <span className="inline-flex w-max max-w-none items-center gap-0" data-column-header-measure={column.id}>
                          <span>{column.label}</span>
                          {isFiltered ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
                          {activeStructuredCount > 0 ? <span className="rounded-full bg-current/12 px-1.5 py-0.5 leading-none">{activeStructuredCount}</span> : null}
                          <ChevronDown className={`h-3.5 w-3.5 transition ${isOpen ? "rotate-180" : ""}`} />
                        </span>
                      )}
                    </button>
                    <span
                      aria-label={`Resize ${column.label} column`}
                      className="group absolute right-0 top-1/2 flex h-10 w-4 -translate-y-1/2 translate-x-1/2 cursor-col-resize items-center justify-center"
                      data-resize-handle
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setColumnWidths((current) => ({
                          ...current,
                          [column.id]: DEFAULT_COLUMN_WIDTHS[column.id],
                        }));
                      }}
                      onPointerDown={(event) => beginColumnResize(event, column.id)}
                      role="separator"
                    >
                      <span className="h-8 w-[3px] rounded-full bg-transparent opacity-0" />
                    </span>
                  </div>
                );
              })}
            </div>

            {selectedTaskIds.length > 0 ? (
              <div className="sticky top-[3rem] z-30 mb-4 flex flex-wrap items-center gap-3 rounded-[1.25rem] border border-[#ddd6fb] bg-[#faf8ff]/95 px-4 py-3 text-left shadow-[0_16px_40px_rgba(81,61,168,0.10)] backdrop-blur-md dark:border-white/10 dark:bg-[#1f1836]/95">
                <span className="rounded-full bg-[#ede8ff] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#6f57f6] dark:bg-[#2a2148] dark:text-[#cabfff]">
                  {selectedTaskIds.length} selected
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {onSelectAllVisible ? (
                    <button
                      className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${INACTIVE_CHIP_CLASS} transition hover:border-[#c9bcff] hover:text-[#6f57f6]`}
                      onClick={() => onSelectAllVisible(visibleTaskIds)}
                      type="button"
                    >
                      Select all visible
                    </button>
                  ) : null}
                  {onClearSelection ? (
                    <button
                      className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${INACTIVE_CHIP_CLASS} transition hover:border-[#c9bcff] hover:text-[#6f57f6]`}
                      onClick={onClearSelection}
                      type="button"
                    >
                      Clear selection
                    </button>
                  ) : null}
                  {selectedTaskIds.length === 1 && onOpenTaskEditor ? (
                    <button
                      className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] transition hover:bg-[#e9e1ff] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff] dark:hover:bg-[#2a204c]`}
                      onClick={() => onOpenTaskEditor(selectedTaskIds[0])}
                      type="button"
                    >
                      Edit task
                    </button>
                  ) : selectedTaskIds.length > 1 && onOpenBatchEdit ? (
                    <button
                      className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] transition hover:bg-[#e9e1ff] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff] dark:hover:bg-[#2a204c]`}
                      onClick={onOpenBatchEdit}
                      type="button"
                    >
                      Edit selected
                    </button>
                  ) : null}
                  {selectedTaskIds.length > 1 && onOpenBatchDelete ? (
                    <button
                      className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} border-[#ffd6de] bg-[#fff1f3] text-[#d94e67] transition hover:bg-[#ffe4e9] dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf] dark:hover:bg-[#56303c]`}
                      onClick={onOpenBatchDelete}
                      type="button"
                    >
                      Delete selected
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {displayedTasks.length === 0 ? (
              <div className={`ml-[10px] rounded-[1.25rem] border border-dashed border-[#ddd6fb] bg-[#fbfaff] px-6 py-10 text-center ${BODY_MUTED_VALUE_CLASS}`}>
                No rows match the current table filters.
              </div>
            ) : renderedTasks.map((task) => {
              const visibleSubtasks = filterPrototypeSubtasks(task.subtasks, hiddenSubtaskIds);
              const hasSourceStepRows = visibleSubtasks.length > 0;
              const stepPreviewGroup = childTaskPreviewByParentTaskId[task.id];
              const hasStepPreview = Boolean(stepPreviewGroup && (stepPreviewGroup.items.length > 0 || stepPreviewGroup.summary.hasInvalidDescendants));
              const stepsExpanded = (expandedStepsByTaskId[task.id] ?? false) || searchMatchedStepParentTaskIdSet.has(task.id);
              const hasTableStepDraft = tableStepDraftParentId === task.id;
              const sourceStepsExpanded = hasStepPreview ? stepsExpanded : (expandedSubtasksByTaskId[task.id] ?? false);
              const showInlineAccordion = allowInlineInspector
                && selectedTaskId === task.id
                && isInlineAccordionMode(overlayMode);

              return (
                <Fragment key={getPrototypeTaskRowKey(task)}>
                  <motion.div
                    className={`${CONTROL_FONT_CLASS} block w-max min-w-full text-center focus:outline-none`}
                    data-task-table-row={task.id}
                    initial={shouldAnimateRows ? undefined : false}
                    onClick={(event) => {
                      if (selectedTaskIds.length > 0 && onToggleTaskSelection) {
                        clearPendingRowClick();
                        startTaskSelection(task.id, {
                          additive: true,
                          range: event.shiftKey,
                        });
                        return;
                      }

                      clearPendingRowClick();
                      pendingRowClickTimeoutRef.current = window.setTimeout(() => {
                        pendingRowClickTimeoutRef.current = null;
                        openRowPrimaryAction(task.id, event.currentTarget);
                      }, 180);
                    }}
                    onDoubleClick={(event) => {
                      if (!onToggleTaskSelection) {
                        return;
                      }

                      event.preventDefault();
                      clearPendingRowClick();
                      startTaskSelection(task.id, { additive: true });
                    }}
                    onContextMenu={(event) => {
                      clearPendingRowClick();
                      event.preventDefault();
                      event.stopPropagation();
                      openRowContextMenu(task.id, event.clientX, event.clientY);
                    }}
                    onKeyDown={(event) => {
                      if (isKeyboardEventFromEditableTarget(event.target, { isTextEditingActive: Boolean(editingTaskTitleId || editingSubtaskId) })) {
                        return;
                      }

                      if (event.key !== "Enter" && event.key !== " ") {
                        return;
                      }

                      event.preventDefault();
                      if (selectedTaskIds.length > 0 && onToggleTaskSelection) {
                        startTaskSelection(task.id, {
                          additive: true,
                          range: event.shiftKey,
                        });
                        return;
                      }

                      openRowPrimaryAction(task.id, event.currentTarget);
                    }}
                    role="button"
                    tabIndex={0}
                    style={{
                      containIntrinsicSize: "72px",
                      contentVisibility: "auto",
                    }}
                    variants={tableRowVariants}
                    whileHover={shouldAnimateRows ? { y: -0.5 } : undefined}
                  >
                    <div className={`ml-[10px] grid w-max min-w-full items-center gap-0 rounded-[1.15rem] border pl-[3px] pr-0 py-3 text-center transition hover:shadow-[0_18px_40px_rgba(109,61,208,0.10)] ${
                      selectedTaskIdSet.has(task.id)
                        ? "border-[#ddd2ff] bg-[#f7f2ff] ring-2 ring-[#6f57f6]/15 dark:border-[#42306f] dark:bg-[#201733] dark:ring-[#cabfff]/12"
                        : showInlineAccordion || rowContextMenu?.taskId === task.id
                          ? "border-transparent bg-white dark:bg-[#181226]"
                          : "border-transparent bg-white dark:bg-white/[0.04]"
                    }`} style={{ gridTemplateColumns }}>
                      {visibleHeaderColumns.map((column) => (
                        <div className={`flex min-h-full min-w-0 overflow-hidden ${getColumnAlignmentClass(column.id)}`} data-column-measure={column.id} key={`${task.id || "task"}-${column.id || "column"}`}>
                          {renderRowCell(task, column.id)}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                  {renderInlineActionRow(task)}
                  {(hasTableStepDraft || (hasStepPreview && stepsExpanded)) ? (
                    <motion.div
                      animate={{ opacity: 1, y: 0 }}
                      data-task-table-step-mini-rows={task.id}
                      initial={shouldAnimateRows ? { opacity: 0, y: -4 } : false}
                      transition={{ duration: 0.16 }}
                    >
                      {renderChildTaskMiniRows(task, stepPreviewGroup)}
                    </motion.div>
                  ) : null}
                  {hasSourceStepRows && sourceStepsExpanded ? (
                    <motion.div
                      animate={{ opacity: 1, y: 0 }}
                      data-task-table-source-step-mini-rows={task.id}
                      initial={shouldAnimateRows ? { opacity: 0, y: -4 } : false}
                      transition={{ duration: 0.16 }}
                    >
                      {renderSourceStepMiniRows(task, visibleSubtasks)}
                    </motion.div>
                  ) : null}
                </Fragment>
              );
            })}
            {remainingRenderedTaskCount > 0 || hasMoreRows ? (
              <div
                aria-hidden="true"
                className="pointer-events-none ml-[10px] h-px w-max min-w-full"
                ref={loadMoreTasksRef}
              />
            ) : null}
            </div>
          </motion.div>
        </div>
        {showTableScrollUp ? (
          <ScrollUpButton
            aria-label="Scroll table to top"
            className="absolute right-4 bottom-4 z-20"
            onClick={() => {
              tableScrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
              setRowContextMenu(null);
            }}
          >
            <ArrowUp className="h-4 w-4" />
          </ScrollUpButton>
        ) : null}

        {openColumnMenuColumn && columnMenuPosition ? (
          <div className="pointer-events-none absolute inset-0 z-40">
            <div
              className={`adhdice-scrollbar pointer-events-auto absolute w-56 overflow-y-auto rounded-[1.25rem] border border-[#ede6ff] bg-white/95 p-2 text-left shadow-[0_20px_60px_rgba(111,87,246,0.16)] backdrop-blur dark:border-white/10 dark:bg-[#1b1530]/95 ${columnMenuPosition.placement === "up" ? "-translate-y-full" : ""}`}
              ref={columnMenuRef}
              style={{
                left: columnMenuPosition.left,
                maxHeight: columnMenuPosition.maxHeight,
                top: columnMenuPosition.top,
              }}
            >
              {renderColumnMenuContent(openColumnMenuColumn)}
            </div>
          </div>
        ) : null}

        {rowContextMenu && rowContextMenuTask ? (
          <div ref={rowContextMenuRef}>
            <TaskRowContextMenu
              allowInlineInspector={allowInlineInspector}
              enableInspector={enableInspector}
              hasBatchQuickEdit={rowContextMenuHasBatchQuickEdit}
              isTaskSelected={selectedTaskIdSet.has(rowContextMenuTask.id)}
              menu={rowContextMenu}
              onClearSelection={onClearSelection ? () => {
                onClearSelection();
                setRowContextMenu(null);
              } : undefined}
              onDeleteTask={onOpenDeleteTask ? () => {
                setRowContextMenu(null);
                onOpenDeleteTask(rowContextMenuTask.id);
              } : undefined}
              onDismiss={() => setRowContextMenu(null)}
              onDuplicateTask={onDuplicateTask ? () => {
                setRowContextMenu(null);
                onDuplicateTask(rowContextMenuTask.id);
              } : undefined}
              onEditTask={onOpenTaskEditor ? () => {
                setRowContextMenu(null);
                onOpenTaskEditor(rowContextMenuTask.id);
              } : undefined}
              onOpenDetails={(sourceElement) => openTaskDetailsFromContextMenu(rowContextMenuTask.id, sourceElement)}
              onOpenHistory={onOpenTaskHistory ? () => {
                setRowContextMenu(null);
                onOpenTaskHistory(rowContextMenuTask.id);
              } : undefined}
              onOpenQuickEdit={(mode, sourceElement) => openTaskOverlayFromContextMenu(rowContextMenuTask.id, mode as OverlayMode, sourceElement)}
              onOpenTimeLog={onOpenTaskActualTime ? () => {
                setRowContextMenu(null);
                openActualTimeEntryForTask(rowContextMenuTask.id);
              } : undefined}
              onRestoreTask={onRestoreTask ? () => {
                setRowContextMenu(null);
                onRestoreTask(rowContextMenuTask.id);
              } : undefined}
              onSelectAllVisible={onSelectAllVisible ? () => {
                onSelectAllVisible(visibleTaskIds);
                setRowContextMenu(null);
              } : undefined}
              onToggleTaskSelection={onToggleTaskSelection ? () => {
                onToggleTaskSelection(rowContextMenuTask.id, {
                  additive: true,
                  visibleTaskIds,
                });
                setRowContextMenu(null);
              } : undefined}
              quickEditItems={[
                { label: "Status", mode: "status" },
                { label: "Due", mode: "due" },
                { label: "Estimate", mode: "estimated" },
                { label: "Actual", mode: "actual" },
                { label: "Priority", mode: "priority" },
                { label: "Energy", mode: "energy" },
                { label: "Repeat", mode: "repeat" },
                { label: "Lists", mode: "lists" },
                { label: "Tags", mode: "tags" },
                { label: "Link", mode: "link" },
                { label: "Notes", mode: "notes" },
              ]}
              quickEditTitle={rowContextMenuHasBatchQuickEdit ? `Quick edit ${rowContextMenuQuickEditTargetIds.length} selected tasks` : "Quick edit"}
              selectedTaskCount={selectedTaskIds.length}
              task={rowContextMenuTask}
            />
          </div>
        ) : null}

        <AnimatePresence>
          {overlayNode ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-30"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key="task-table-overlay-node"
              transition={{ duration: 0.18 }}
            >
              {overlayNode}
            </motion.div>
          ) : null}
          {(enableInspector || allowInlineInspector) && selectedTask && !(allowInlineInspector && isInlineAccordionMode(overlayMode)) ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-20 flex flex-col rounded-[2rem] bg-white/78 backdrop-blur-sm dark:bg-[#140f26]/92"
              onClick={() => closeInspector()}
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key={`task-table-inspector-${selectedTask.id || "blank"}-${overlayMode}`}
              transition={{ duration: 0.18 }}
            >
              {(() => {
                const overlayTitle = overlayMode === "full"
                  ? "Edit Task"
                  : overlayMode === "status"
                    ? "Status actions"
                    : overlayMode === "due"
                      ? "Due actions"
                      : overlayMode === "estimated"
                        ? "Estimated time"
                        : overlayMode === "actual"
                          ? "Actual time"
                      : overlayMode === "priority"
                        ? "Priority actions"
                        : overlayMode === "energy"
                          ? "Energy actions"
                          : overlayMode === "repeat"
                            ? "Repeat actions"
                            : overlayMode === "tags"
                              ? "Tag actions"
                              : overlayMode === "lists"
                                ? "List actions"
                              : overlayMode === "link"
                                ? "Link actions"
                                : "Notes actions";
                const showDueSection = overlayMode === "full" || overlayMode === "due";
                const showEstimatedSection = overlayMode === "full" || overlayMode === "estimated";
                const showActualSection = overlayMode === "full" || overlayMode === "actual";
                const showPrioritySection = overlayMode === "full" || overlayMode === "priority";
                const showRepeatSection = overlayMode === "full" || overlayMode === "repeat";
                const showEnergyCard = overlayMode === "full" || overlayMode === "energy" || overlayMode === "status";
                const showMetricsCard = overlayMode === "full";
                const showListsBlock = overlayMode === "full" || overlayMode === "lists";
                const showTagsBlock = overlayMode === "full" || overlayMode === "tags";
                const showLinkBlock = overlayMode === "full" || overlayMode === "link";
                const showNotesBlock = overlayMode === "full" || overlayMode === "notes";
                const isFocusedOverlay = overlayMode !== "full" || overlayAnchor !== null;
                const batchQuickEditCount = quickEditTargetTaskIds?.length ?? 0;
                const batchQuickEditLabel = batchQuickEditCount > 1 ? `Applying to ${batchQuickEditCount} selected tasks` : null;
                const metadataTask = overlayMode === "full" ? metadataTargetTask ?? selectedTask : selectedTask;
                const isEditingStepMetadata = overlayMode === "full" && metadataTargetTask?.id === metadataTask.id;
                const metadataContextLabel = `${metadataTask.title || "Untitled task"} | ${isEditingStepMetadata ? formatChildTaskPreviewDepthLabel(childTaskParentInfoByTaskId.get(metadataTask.id)?.depth ?? 1) : "Parent"}`;
                const titleDraft = titleDraftsRef.current[selectedTask.id] ?? selectedTask.title;
                const selectedTaskNotesDraft = notesDrafts[selectedTask.id] ?? selectedTask.notes;
                const metadataLinkDraft = linkDrafts[metadataTask.id] ?? { label: metadataTask.linkLabel, url: metadataTask.linkUrl };
                const metadataNotesDraft = notesDrafts[metadataTask.id] ?? metadataTask.notes;
                const metadataLinkedNoteDraft = linkedNoteDrafts[metadataTask.id] ?? metadataTask.linkedNotes.map((note) => note.id);
                const metadataEstimatedMinutesDraft = estimatedMinutesDrafts[metadataTask.id] ?? (metadataTask.estimatedMinutes ? String(metadataTask.estimatedMinutes) : "");
                const metadataTagDraft = tagDrafts[metadataTask.id] ?? "";
                const metadataListDraft = listDrafts[metadataTask.id] ?? "";
                const metadataTaskActualTimeEntries = taskActualTimeEntriesByTaskId?.[metadataTask.id] ?? [];
                const linkDraft = metadataLinkDraft;
                const notesDraft = selectedTaskNotesDraft;
                const linkedNoteDraft = metadataLinkedNoteDraft;
                const estimatedMinutesDraft = metadataEstimatedMinutesDraft;
                const tagDraft = metadataTagDraft;
                const listDraft = metadataListDraft;
                const selectedTaskVisibleSubtasks = filterPrototypeSubtasks(selectedTask.subtasks, hiddenSubtaskIds);
                const activeMetadataPanel = activeMetadataPanelByTaskId[metadataTask.id] ?? "due";
                const metadataPanelId: MetadataPanelId = overlayMode === "full"
                  ? activeMetadataPanel
                  : overlayMode;
                const metadataPanelOptions: Array<{ id: MetadataPanelId; label: string }> = [
                  { id: "due", label: "Due" },
                  { id: "estimated", label: "Estimated Time" },
                  { id: "actual", label: "Actual Time" },
                  { id: "priority", label: "Priority" },
                  { id: "repeat", label: "Repeat" },
                  { id: "energy", label: "Energy" },
                  { id: "lists", label: "Lists" },
                  { id: "tags", label: "Tags" },
                  { id: "link", label: "Link" },
                  { id: "notes", label: "Notes" },
                ];
                function metadataFieldHasValue(id: MetadataPanelId) {
                  switch (id) {
                    case "due":
                      return Boolean(metadataTask.dueOn || metadataTask.dueTime);
                    case "estimated":
                      return metadataTask.estimatedMinutes !== null;
                    case "actual":
                      return getDisplayedActualSeconds(metadataTask) > 0 || metadataTaskActualTimeEntries.length > 0;
                    case "priority":
                      return metadataTask.priorities.length > 0;
                    case "repeat":
                      return metadataTask.repeat !== "none";
                    case "energy":
                      return metadataTask.energy !== "none";
                    case "status":
                      return metadataTask.status !== "pending";
                    case "lists":
                      return metadataTask.lists.length > 0;
                    case "tags":
                      return metadataTask.tags.length > 0;
                    case "link":
                      return Boolean(metadataTask.linkLabel || metadataTask.linkUrl);
                    case "notes":
                      return Boolean(metadataTask.notes.trim() || metadataTask.linkedNotes.length > 0);
                    default:
                      return false;
                  }
                }
                const activeMetadataPanelLabel = metadataPanelId === "status"
                  ? "Status"
                  : metadataPanelOptions.find((option) => option.id === activeMetadataPanel)?.label ?? "Meta Data";
                function renderInlineTextChoices<T extends string>(
                  options: Array<{ label: string; value: T }>,
                  selectedValues: T[],
                  onSelect: (value: T) => void,
                  toneForOption?: (value: T, selected: boolean) => string,
                ) {
                  return (
                    <div className="flex flex-wrap gap-2">
                      {options.map((option, index) => {
                        const isSelected = selectedValues.includes(option.value);
                        return (
                          <TaskTableChipButton
                            key={`${option.label || "inline-option"}-${option.value || "blank"}-${index}`}
                            onClick={() => onSelect(option.value)}
                            toneClassName={toneForOption ? toneForOption(option.value, isSelected) : isSelected ? "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]" : INACTIVE_CHIP_CLASS}
                          >
                            {option.label}
                          </TaskTableChipButton>
                        );
                      })}
                    </div>
                  );
                }
                let metadataPanelContent: ReactNode = null;
                if (metadataPanelId === "due") {
                  metadataPanelContent = (
                    <>
                      {renderInlineTextChoices(
                        DUE_PRESETS.map((preset) => ({ label: preset.label, value: preset.value })),
                        metadataTask.dueOn ? [metadataTask.dueOn] : [],
                        (value) => setTaskDue(metadataTask.id, value, value ? metadataTask.dueTime : ""),
                      )}
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <input
                          className={OVERLAY_INPUT_CLASS}
                          onChange={(event) => setDueDrafts((current) => ({
                            ...current,
                            [metadataTask.id]: {
                              dueOn: event.target.value,
                              dueTime: current[metadataTask.id]?.dueTime ?? metadataTask.dueTime,
                            },
                          }))}
                          type="date"
                          value={(dueDrafts[metadataTask.id]?.dueOn ?? metadataTask.dueOn) || ""}
                        />
                        <input
                          className={OVERLAY_INPUT_CLASS}
                          onChange={(event) => setDueDrafts((current) => ({
                            ...current,
                            [metadataTask.id]: {
                              dueOn: current[metadataTask.id]?.dueOn ?? metadataTask.dueOn,
                              dueTime: event.target.value,
                            },
                          }))}
                          type="time"
                          value={(dueDrafts[metadataTask.id]?.dueTime ?? metadataTask.dueTime) || ""}
                        />
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <TaskTableChipButton onClick={() => setTaskDue(metadataTask.id, "", "")} toneClassName={INACTIVE_CHIP_CLASS}>Clear</TaskTableChipButton>
                        <TaskTableChipButton onClick={() => {
                          const draft = dueDrafts[metadataTask.id];
                          if (!draft) return;
                          setTaskDue(metadataTask.id, draft.dueOn, draft.dueTime);
                        }} toneClassName="border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]">Save date + time</TaskTableChipButton>
                      </div>
                    </>
                  );
                } else if (metadataPanelId === "estimated") {
                  metadataPanelContent = (
                    <>
                      {renderInlineTextChoices(
                        ESTIMATED_TIME_PRESETS.map((minutes) => ({ label: minutes === 60 ? "1h" : `${minutes}m`, value: String(minutes) })),
                        metadataTask.estimatedMinutes !== null ? [String(metadataTask.estimatedMinutes)] : [],
                        (value) => {
                          const minutes = Number.parseInt(value, 10);
                          setTaskEstimatedMinutes(metadataTask.id, metadataTask.estimatedMinutes === minutes ? null : minutes);
                        },
                      )}
                      <div className="mt-3 flex gap-2">
                        <input className={OVERLAY_INPUT_CLASS} inputMode="numeric" onChange={(event) => setEstimatedMinutesDrafts((current) => ({ ...current, [metadataTask.id]: event.target.value.replace(/[^\d]/g, "") }))} placeholder="Custom minutes" type="text" value={metadataEstimatedMinutesDraft} />
                        <TaskTableChipButton onClick={() => setTaskEstimatedMinutes(metadataTask.id, metadataEstimatedMinutesDraft ? Number.parseInt(metadataEstimatedMinutesDraft, 10) : null)} toneClassName="border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]">Apply</TaskTableChipButton>
                      </div>
                    </>
                  );
                } else if (metadataPanelId === "actual") {
                  metadataPanelContent = (
                    <>
                      <div className="mb-3 text-sm text-[#7d7597] dark:text-white/55">Current time: {formatActual(getDisplayedActualSeconds(metadataTask))}</div>
                      <div className="flex flex-wrap gap-2">
                        {getRunningTimer(metadataTask.id) ? (
                          <>
                            <TaskTableChipButton className="gap-2" onClick={() => {
                              const timer = getRunningTimer(metadataTask.id);
                              if (timer?.pausedAt) {
                                resumeTaskTimer(metadataTask.id);
                              } else {
                                pauseTaskTimer(metadataTask.id);
                              }
                            }} toneClassName="border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]">{getRunningTimer(metadataTask.id)?.pausedAt ? <CirclePlay className="h-3.5 w-3.5" /> : <CirclePause className="h-3.5 w-3.5" />}{getRunningTimer(metadataTask.id)?.pausedAt ? "Continue timer" : "Pause timer"}</TaskTableChipButton>
                            <TaskTableChipButton className="gap-2" onClick={() => stopTaskTimer(metadataTask.id)} toneClassName="border-[#ffd8be] bg-[#fff1e7] text-[#dc6c1c] dark:border-[#65401d] dark:bg-[#432712] dark:text-[#ffb37e]"><TimerReset className="h-3.5 w-3.5" />Stop focus timer</TaskTableChipButton>
                          </>
                        ) : (
                          <TaskTableChipButton className="gap-2" onClick={() => openFocusTimerForTask(metadataTask.id)} toneClassName="border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]"><CirclePlay className="h-3.5 w-3.5" />Start focus timer</TaskTableChipButton>
                        )}
                        <TaskTableChipButton className="gap-2" onClick={() => openActualTimeEntryForTask(metadataTask.id)} toneClassName={INACTIVE_CHIP_CLASS}><Clock3 className="h-3.5 w-3.5" />Manual time entry</TaskTableChipButton>
                        <TaskTableChipButton className="gap-2" onClick={() => { onTaskActualSecondsChange?.(metadataTask.id, 0); patchTask(metadataTask.id, (task) => ({ ...task, actualSeconds: 0 })); }} toneClassName="border-[#ffd6de] bg-[#fff1f3] text-[#d94e67] dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf]"><TimerReset className="h-3.5 w-3.5" />Clear actual time</TaskTableChipButton>
                      </div>
                    </>
                  );
                } else if (metadataPanelId === "priority") {
                  metadataPanelContent = (
                    <div className="flex flex-wrap gap-2">
                      {PRIORITY_OPTIONS.map((option, optionIndex) => {
                        const selected = metadataTask.priorities.includes(option.value);
                        const nextPriorities = selected ? metadataTask.priorities.filter((value) => value !== option.value) : [...metadataTask.priorities, option.value];
                        return <TaskTableChipButton key={`${option.value || "priority-option"}-${optionIndex}`} onClick={() => setTaskPriorities(metadataTask.id, nextPriorities)} toneClassName={selected ? priorityTone(option.value) : INACTIVE_CHIP_CLASS}>{option.label}</TaskTableChipButton>;
                      })}
                      <TaskTableChipButton onClick={() => setTaskPriorities(metadataTask.id, [])} toneClassName={INACTIVE_CHIP_CLASS}>Clear all</TaskTableChipButton>
                    </div>
                  );
                } else if (metadataPanelId === "repeat") {
                  metadataPanelContent = (
                    <>
                      {renderInlineTextChoices(
                        REPEAT_OPTIONS,
                        [metadataTask.repeat],
                        (value) => setTaskRepeat(metadataTask.id, value),
                        (value, selected) => selected ? repeatTone(value) : INACTIVE_CHIP_CLASS,
                      )}
                      {metadataTask.repeat !== "none" ? (
                        <div className="mt-3 rounded-[1rem] border border-[#ece7f5] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.04]">
                          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-[#9b92be] dark:text-white/35">Custom cadence</p>
                          {metadataTask.repeat !== "daily_until_complete" ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-[#7d7597] dark:text-white/55">Every</span>
                              <input
                                className={`${OVERLAY_INPUT_CLASS} w-24`}
                                inputMode="numeric"
                                onBlur={(event) => setTaskRepeatInterval(metadataTask, event.target.value)}
                                onChange={(event) => setRepeatIntervalDrafts((current) => ({ ...current, [metadataTask.id]: event.target.value.replace(/[^\d]/g, "") }))}
                                placeholder="1"
                                type="text"
                                value={repeatIntervalDrafts[metadataTask.id] ?? String(metadataTask.repeatInterval)}
                              />
                              {(["daily", "weekly", "monthly"] as TaskRepeat[]).map((repeatUnit) => (
                                <TaskTableChipButton
                                  key={`${metadataTask.id}-repeat-unit-${repeatUnit}`}
                                  onClick={() => setTaskRepeat(metadataTask.id, repeatUnit)}
                                  toneClassName={metadataTask.repeat === repeatUnit ? repeatTone(repeatUnit) : INACTIVE_CHIP_CLASS}
                                >
                                  {repeatUnit === "daily" ? "Days" : repeatUnit === "weekly" ? "Weeks" : "Months"}
                                </TaskTableChipButton>
                              ))}
                              <TaskTableChipButton onClick={() => setTaskRepeatInterval(metadataTask, repeatIntervalDrafts[metadataTask.id] ?? String(metadataTask.repeatInterval))} toneClassName="border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]">Apply</TaskTableChipButton>
                            </div>
                          ) : null}
                          {metadataTask.repeat === "weekly" || metadataTask.repeat === "custom" ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {REPEAT_WEEKDAY_OPTIONS.map((option) => {
                                const selected = metadataTask.repeatDaysOfWeek.includes(option.value);
                                return (
                                  <TaskTableChipButton key={`${metadataTask.id}-weekday-${option.value}`} onClick={() => toggleTaskRepeatWeekday(metadataTask, option.value)} toneClassName={selected ? "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]" : INACTIVE_CHIP_CLASS}>
                                    {option.label}
                                  </TaskTableChipButton>
                                );
                              })}
                            </div>
                          ) : null}
                          {metadataTask.repeat === "monthly" || metadataTask.repeat === "custom" ? (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-[#7d7597] dark:text-white/55">Day of month</span>
                              <input
                                className={`${OVERLAY_INPUT_CLASS} w-24`}
                                inputMode="numeric"
                                onBlur={(event) => setTaskRepeatDayOfMonth(metadataTask, event.target.value)}
                                onChange={(event) => setRepeatDayOfMonthDrafts((current) => ({ ...current, [metadataTask.id]: event.target.value.replace(/[^\d]/g, "").slice(0, 2) }))}
                                placeholder="15"
                                type="text"
                                value={repeatDayOfMonthDrafts[metadataTask.id] ?? (metadataTask.repeatDayOfMonth ? String(metadataTask.repeatDayOfMonth) : "")}
                              />
                              <TaskTableChipButton onClick={() => setTaskRepeatDayOfMonth(metadataTask, repeatDayOfMonthDrafts[metadataTask.id] ?? (metadataTask.repeatDayOfMonth ? String(metadataTask.repeatDayOfMonth) : ""))} toneClassName="border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]">Apply day</TaskTableChipButton>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  );
                } else if (metadataPanelId === "energy") {
                  metadataPanelContent = (
                    <div className="flex flex-wrap gap-2">
                      {ENERGY_OPTIONS.map((option, optionIndex) => (
                        <TaskTableChipButton key={`${option.value || "energy-option"}-${optionIndex}`} onClick={() => setTaskEnergy(metadataTask.id, option.value)} toneClassName={metadataTask.energy === option.value ? energyTone(option.value) : INACTIVE_CHIP_CLASS}>{option.label}</TaskTableChipButton>
                      ))}
                    </div>
                  );
                } else if (metadataPanelId === "status") {
                  metadataPanelContent = (
                    <div className="flex flex-wrap gap-2">
                      {getSelectableTaskStatusesForRepeatFrequency(metadataTask.repeat).map((status, optionIndex) => (
                        <button className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} gap-2 ${metadataTask.status === status ? statusTone(status) : `${statusTone(status)} opacity-78 hover:opacity-100`}`} key={`${status || "status-option"}-${optionIndex}`} onClick={() => setTaskStatus(metadataTask.id, status)} type="button">{renderTaskStatusCircle(status, "sm")}<span>{formatTaskStatusLabel(status)}</span></button>
                      ))}
                    </div>
                  );
                } else if (metadataPanelId === "lists") {
                  metadataPanelContent = (
                    <>
                      {renderInlineTextChoices(
                        mergedListOptions.map((list) => ({ label: list.label, value: list.label })),
                        metadataTask.lists,
                        (value) => toggleTaskList(metadataTask.id, value),
                        (_value, selected) => selected ? LIST_CHIP_CLASS : INACTIVE_CHIP_CLASS,
                      )}
                      <div className="mt-3 flex gap-2"><input className={OVERLAY_INPUT_CLASS} onChange={(event) => setListDrafts((current) => ({ ...current, [metadataTask.id]: event.target.value }))} placeholder="Add custom list" type="text" value={metadataListDraft} /><TaskTableChipButton onClick={() => { void createTaskListForRow(metadataTask.id); }} toneClassName="border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]">Add</TaskTableChipButton></div>
                    </>
                  );
                } else if (metadataPanelId === "tags") {
                  metadataPanelContent = (
                    <>
                      <div className="flex flex-wrap gap-2">{mergedTagOptions.map((tag, tagIndex) => <TaskTableChipButton key={`${metadataTask.id || "task"}-tag-choice-${tag || "blank"}-${tagIndex}`} onClick={() => toggleTaskTag(metadataTask.id, tag)} toneClassName={metadataTask.tags.includes(tag) ? TAG_CHIP_CLASS : INACTIVE_CHIP_CLASS}>#{tag}</TaskTableChipButton>)}</div>
                      <div className="mt-3 flex gap-2"><input className={OVERLAY_INPUT_CLASS} onChange={(event) => setTagDrafts((current) => ({ ...current, [metadataTask.id]: event.target.value.toLowerCase().replace(/\s+/g, "-") }))} placeholder="new-tag" type="text" value={metadataTagDraft} /><TaskTableChipButton onClick={() => addTaskTag(metadataTask.id, metadataTagDraft)} toneClassName="border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]">Add tag</TaskTableChipButton></div>
                    </>
                  );
                } else if (metadataPanelId === "link") {
                  metadataPanelContent = (
                    <div className="space-y-2">
                      <input className={OVERLAY_INPUT_CLASS} onBlur={() => commitTaskLink(metadataTask.id)} onChange={(event) => setLinkDrafts((current) => ({ ...current, [metadataTask.id]: { ...(current[metadataTask.id] ?? metadataLinkDraft), label: event.target.value } }))} placeholder="Link label" type="text" value={metadataLinkDraft.label} />
                      <input className={OVERLAY_INPUT_CLASS} onBlur={() => commitTaskLink(metadataTask.id)} onChange={(event) => setLinkDrafts((current) => ({ ...current, [metadataTask.id]: { ...(current[metadataTask.id] ?? metadataLinkDraft), url: event.target.value } }))} placeholder="https://example.com" type="url" value={metadataLinkDraft.url} />
                      <div className="flex justify-end gap-2"><TaskTableChipButton onClick={() => clearTaskLink(metadataTask.id)} toneClassName={INACTIVE_CHIP_CLASS}>Clear link</TaskTableChipButton><TaskTableChipButton onClick={() => commitTaskLink(metadataTask.id)} toneClassName="border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]">Save link</TaskTableChipButton></div>
                    </div>
                  );
                } else if (metadataPanelId === "notes") {
                  metadataPanelContent = (
                    <>
                      {metadataTask.linkedNotes.length > 0 ? <div className="mb-3 flex flex-wrap gap-2">{metadataTask.linkedNotes.map((note, noteIndex) => <button className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${LIST_CHIP_CLASS}`} key={`${note.id || "linked-note"}-${noteIndex}`} onClick={() => openLinkedNote(note.id)} type="button">{note.title}</button>)}</div> : null}
                      <TaskTableChipButton className="mb-3" onClick={() => setNotePickerOpenByTaskId((current) => ({ ...current, [metadataTask.id]: !current[metadataTask.id] }))} toneClassName={INACTIVE_CHIP_CLASS}>{notePickerOpenByTaskId[metadataTask.id] ? "Hide saved notes" : "Connect existing note"}</TaskTableChipButton>
                      {notePickerOpenByTaskId[metadataTask.id] ? <div className="mb-3 flex flex-wrap gap-2">{allNoteOptions.map((note, noteIndex) => <button className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${metadataLinkedNoteDraft.includes(note.id) ? LIST_CHIP_CLASS : INACTIVE_CHIP_CLASS}`} key={`${note.id || "note-option"}-${noteIndex}`} onClick={() => { const nextLinked = metadataLinkedNoteDraft.includes(note.id) ? metadataLinkedNoteDraft.filter((id) => id !== note.id) : [...metadataLinkedNoteDraft, note.id]; setLinkedNoteDrafts((current) => ({ ...current, [metadataTask.id]: nextLinked })); setTaskLinkedNoteIds(metadataTask.id, nextLinked); }} type="button">{note.title}</button>)}</div> : null}
                      <div className="space-y-2"><textarea className={`${OVERLAY_INPUT_CLASS} min-h-[120px] resize-none py-3`} onBlur={() => commitTaskNotes(metadataTask.id)} onChange={(event) => setNotesDrafts((current) => ({ ...current, [metadataTask.id]: event.target.value }))} placeholder="Add notes" value={metadataNotesDraft} /><div className="flex justify-end gap-2"><TaskTableChipButton onClick={() => clearTaskNotes(metadataTask.id)} toneClassName={INACTIVE_CHIP_CLASS}>Clear notes</TaskTableChipButton><TaskTableChipButton onClick={() => commitTaskNotes(metadataTask.id)} toneClassName="border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]">Save notes</TaskTableChipButton></div></div>
                    </>
                  );
                }
                const childTaskPreviewGroup = overlayMode === "full" ? childTaskPreviewByParentTaskId[selectedTask.id] : undefined;
                const hasSameTableStepRows = Boolean(childTaskPreviewGroup && (childTaskPreviewGroup.items.length > 0 || childTaskPreviewGroup.summary.hasInvalidDescendants));
                const sameTableStepRowsNode = overlayMode === "full" ? renderEditorChildTaskRows(childTaskPreviewGroup) : null;
                const hasUnifiedStepRows = hasSameTableStepRows || selectedTaskVisibleSubtasks.length > 0;
                const stepsEditorNode = overlayMode === "full" ? (
                  <div className="mt-3 rounded-[1rem] border border-[#ede7f7] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#9b92be] dark:text-white/35">Steps</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <TaskTableChipButton
                          onClick={() => setTaskSubtasksAutoReset(selectedTask.id, !selectedTask.subtasksAutoReset)}
                          toneClassName={selectedTask.subtasksAutoReset ? "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]" : INACTIVE_CHIP_CLASS}
                        >
                          {selectedTask.subtasksAutoReset ? "Reset step status on new due date" : "Keep step status on new due date"}
                        </TaskTableChipButton>
                        <SameTableStepCreationControl
                          creationBlocked={childTaskCreationBlockedTaskIds.includes(selectedTask.id)}
                          onCreateChildTask={onCreateChildTask}
                          parentTaskId={selectedTask.id}
                        />
                      </div>
                    </div>
                    {hasUnifiedStepRows ? (
                      <div className="mt-3 space-y-3">
                        {sameTableStepRowsNode}
                        {selectedTaskVisibleSubtasks.length > 0 ? (
                          <InlineSubtaskEditor
                            autofocusSubtaskId={autofocusSubtaskId}
                            drafts={subtaskTitleDrafts}
                            onAddChild={(subtaskId) => { void handleTaskSubtaskAddChild(subtaskId); }}
                            onAutofocusHandled={() => setAutofocusSubtaskId(null)}
                            onCommitTitle={commitSubtaskTitle}
                            onDelete={handleTaskSubtaskDelete}
                            onDraftChange={(subtaskId, value) => {
                              setSubtaskTitleDrafts((current) => ({
                                ...current,
                                [subtaskId]: value,
                              }));
                            }}
                            onSetStatus={(subtaskId, nextStatus) => onTaskSubtaskStatusChange?.(subtaskId, nextStatus)}
                            subtasks={selectedTaskVisibleSubtasks}
                          />
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-[#8d87a7] dark:text-white/45">No steps yet.</p>
                    )}
                  </div>
                ) : null;
                const shouldShowDetachedTaskNotice = selectedTaskIsDetached && suppressDetachedNoticeTaskId !== selectedTask.id;
                const detachedTaskNotice = shouldShowDetachedTaskNotice ? (
                  <div className="rounded-[1rem] border border-[#ffe2af] bg-[#fff8ea] px-4 py-3 text-[#7b5b12] dark:border-[#5c4920] dark:bg-[#362814] dark:text-[#f3d38a]">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em]">Left current list</p>
                    <p className="mt-1 text-sm leading-6">
                      {`This task no longer belongs to ${currentListLabel?.trim() ? currentListLabel : "this list"}. The row already left the list, but you can keep editing here.`}
                    </p>
                    {selectedTaskFollowDestination ? (
                      <p className="mt-1 text-sm leading-6">
                        {`Follow task to ${selectedTaskFollowDestination.label} when you are ready.`}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm leading-6">
                        It does not have another visible list to follow right now.
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedTaskFollowDestination ? (
                        <TaskTableChipButton
                          onClick={() => onFollowDetachedTask?.(selectedTask.id)}
                          toneClassName="border-[#e4c77b] bg-[#fff2cb] text-[#8d6817] dark:border-[#6e5824] dark:bg-[#4a381a] dark:text-[#f3d38a]"
                        >
                          Follow task
                        </TaskTableChipButton>
                      ) : null}
                      <TaskTableChipButton
                        onClick={() => {
                          if (!selectedTaskFollowDestination) {
                            onDismissDetachedTask?.(selectedTask.id);
                          }
                          closeInspector();
                        }}
                        toneClassName="border-[#f0d79a] bg-white/80 text-[#7b5b12] dark:border-[#5c4920] dark:bg-[#241a0c] dark:text-[#f3d38a]"
                      >
                        {selectedTaskFollowDestination ? "Dismiss" : "Close"}
                      </TaskTableChipButton>
                    </div>
                  </div>
                ) : null;
                const fullDesktopEditorContent = (
                  <div className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
                    <div className="rounded-[1.25rem] border border-[#ede7f7] bg-white px-5 py-4 shadow-[0_18px_45px_rgba(81,61,168,0.16)] dark:border-white/10 dark:bg-[#1b1530]">
                      {selectedTaskParentInfo ? (
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <TaskTableChipButton
                            className="gap-2"
                            onClick={() => openTaskInCurrentEditor(selectedTaskParentInfo.parentTaskId)}
                            toneClassName={INACTIVE_CHIP_CLASS}
                          >
                            <MoveLeft className="h-3.5 w-3.5" />
                            <span>{`Parent: ${selectedTaskParentInfo.parentTitle}`}</span>
                          </TaskTableChipButton>
                          <span className="text-xs font-medium text-[#8d87a7] dark:text-white/45">
                            {formatChildTaskPreviewDepthLabel(selectedTaskParentInfo.depth)}
                          </span>
                        </div>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#9b92be] dark:text-white/35">{overlayTitle}</p>
                        {batchQuickEditLabel ? (
                          <p className="mt-1 text-[11px] leading-5 text-[#7f6af7] dark:text-[#cabfff]">{batchQuickEditLabel}</p>
                        ) : null}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          aria-label="Edit status"
                          className="inline-flex flex-none items-center justify-center rounded-full p-0.5 transition hover:scale-105"
                          onClick={() => setActiveMetadataPanelByTaskId((current) => ({ ...current, [selectedTask.id]: "status" }))}
                          type="button"
                        >
                          {renderTaskStatusCircle(selectedTask.status, "md")}
                        </button>
                        <label className="block min-w-0 flex-1">
                          <span className="sr-only">Rename task</span>
                          <TaskTitleDraftInput
                            className={`${OVERLAY_INPUT_CLASS} h-11 rounded-[1rem] text-[18px]`}
                            initialValue={titleDraft}
                            onCommit={commitTaskTitle}
                            onDraftChange={setTitleDraft}
                            taskId={selectedTask.id}
                          />
                        </label>
                      </div>
                      <label className="mt-2 block">
                        <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[#9b92be] dark:text-white/35">
                          Description
                        </span>
                        <textarea
                          className={`${OVERLAY_INPUT_CLASS} min-h-[88px] resize-none py-3 text-sm leading-6`}
                          onBlur={() => commitTaskNotes(selectedTask.id)}
                          onChange={(event) => setNotesDrafts((current) => ({
                            ...current,
                            [selectedTask.id]: event.target.value,
                          }))}
                          placeholder="Add a short description"
                          value={notesDraft}
                        />
                      </label>
                      {detachedTaskNotice ? <div className="mt-3">{detachedTaskNotice}</div> : null}
                      {stepsEditorNode}
                    </div>
                    <section className="rounded-[1.25rem] border border-[#ede7f7] bg-white px-5 py-4 shadow-[0_18px_45px_rgba(81,61,168,0.16)] dark:border-white/10 dark:bg-[#1b1530] lg:sticky lg:top-4 lg:self-start">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#9b92be] dark:text-white/35">Meta Data</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <p className="text-sm text-[#7d7597] dark:text-white/50">{metadataContextLabel}</p>
                          {isEditingStepMetadata ? (
                            <TaskTableChipButton onClick={selectParentMetadataTask} toneClassName={INACTIVE_CHIP_CLASS}>
                              Parent metadata
                            </TaskTableChipButton>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-y-1.5 text-sm">
                        {metadataPanelOptions.map((option, index) => (
                          <div className="flex items-center" key={`${option.id || "metadata-panel"}-${index}`}>
                            {index > 0 ? <span className="px-2 text-[#c9c0e2] dark:text-white/18">|</span> : null}
                            <button
                              className={`inline-flex items-center gap-1.5 transition ${
                                activeMetadataPanel === option.id
                                  ? "text-[#6f57f6] dark:text-[#cabfff]"
                                  : "text-[#8d87a7] hover:text-[#6f57f6] dark:text-white/45 dark:hover:text-[#cabfff]"
                              }`}
                              onClick={() => setActiveMetadataPanelByTaskId((current) => ({ ...current, [metadataTask.id]: option.id }))}
                              type="button"
                            >
                              <span>{option.label}</span>
                              {metadataFieldHasValue(option.id) ? (
                                <span className={`h-1.5 w-1.5 rounded-full ${activeMetadataPanel === option.id ? "bg-[#6f57f6] dark:bg-[#cabfff]" : "bg-[#a99de4] dark:bg-white/45"}`} />
                              ) : null}
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 rounded-[1rem] border border-[#efe9ff] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.04]">
                        <div className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-[#9b92be] dark:text-white/35">
                          {activeMetadataPanelLabel}
                        </div>
                        {metadataPanelContent}
                      </div>
                    </section>
                  </div>
                );

                const fullDesktopEditorNode = (
                  <div className="w-full max-w-[60rem]" ref={isFocusedOverlay ? undefined : inspectorPanelRef}>
                    {fullDesktopEditorContent}
                  </div>
                );
                const overlayContentClass = isFocusedOverlay
                  ? "relative flex-1 px-5 py-5"
                  : overlayMode === "full"
                    ? "flex flex-1 items-start justify-center overflow-y-auto px-5 pt-4 pb-[calc(8.5rem+env(safe-area-inset-bottom))]"
                    : "grid flex-1 gap-3 overflow-y-auto px-5 pt-4 pb-[calc(8.5rem+env(safe-area-inset-bottom))] lg:grid-cols-[1.1fr_0.9fr]";

                return (
                  <>
              {isFocusedOverlay || overlayMode === "full" ? null : (
              <div className="border-b border-[#ede7f7] bg-white px-5 py-4 dark:border-white/10 dark:bg-[#1b1530]" onClick={(event) => event.stopPropagation()}>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#9b92be] dark:text-white/35">{overlayTitle}</p>
                  {batchQuickEditLabel ? (
                    <p className="mt-1 text-[11px] leading-5 text-[#7f6af7] dark:text-[#cabfff]">{batchQuickEditLabel}</p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      aria-label="Edit status"
                      className="inline-flex flex-none items-center justify-center rounded-full p-0.5 transition hover:scale-105"
                      onClick={() => setActiveMetadataPanelByTaskId((current) => ({ ...current, [selectedTask.id]: "status" }))}
                      type="button"
                    >
                      {renderTaskStatusCircle(selectedTask.status, "md")}
                    </button>
                    <label className="block min-w-0 flex-1">
                      <span className="sr-only">Rename task</span>
                      <TaskTitleDraftInput
                        className={`${OVERLAY_INPUT_CLASS} h-11 rounded-[1rem] text-[18px]`}
                        initialValue={titleDraft}
                        onCommit={commitTaskTitle}
                        onDraftChange={setTitleDraft}
                        taskId={selectedTask.id}
                      />
                    </label>
                  </div>
                  <label className="mt-2 block">
                    <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-[#9b92be] dark:text-white/35">
                      Description
                    </span>
                    <textarea
                      className={`${OVERLAY_INPUT_CLASS} min-h-[88px] resize-none py-3 text-sm leading-6`}
                      onBlur={() => commitTaskNotes(selectedTask.id)}
                      onChange={(event) => setNotesDrafts((current) => ({
                        ...current,
                        [selectedTask.id]: event.target.value,
                      }))}
                      placeholder="Add a short description"
                      value={notesDraft}
                    />
                  </label>
                  {detachedTaskNotice ? <div className="mt-3">{detachedTaskNotice}</div> : null}
                  {stepsEditorNode}
                </div>
              </div>
              )}

              <div
                className={overlayContentClass}
                onClick={isFocusedOverlay ? undefined : (event) => event.stopPropagation()}
              >
                {isFocusedOverlay ? (
                  <div
                    className={`absolute w-full ${overlayMode === "full" ? "left-1/2 max-w-[60rem] -translate-x-1/2" : "max-w-[32rem]"}`}
                    onClick={(event) => event.stopPropagation()}
                    ref={inspectorPanelRef}
                    style={
                      overlayMode === "full"
                        ? {
                            top: overlayAnchor?.top ?? 24,
                          }
                        : {
                            left: overlayAnchor?.left ?? 24,
                            top: overlayAnchor?.top ?? 24,
                          }
                    }
                    >
                    <div className="grid gap-3">
                      {overlayMode === "full" ? null : detachedTaskNotice}
                      {overlayMode === "full" ? (
                        fullDesktopEditorNode
                      ) : (
                        <section className="rounded-[1.25rem] border border-[#ede7f7] bg-white px-5 py-4 shadow-[0_18px_45px_rgba(81,61,168,0.16)] dark:border-white/10 dark:bg-[#1b1530]">
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#9b92be] dark:text-white/35">{overlayTitle}</p>
                            {batchQuickEditLabel ? (
                              <p className="mt-1 text-[11px] leading-5 text-[#7f6af7] dark:text-[#cabfff]">{batchQuickEditLabel}</p>
                            ) : null}
                          </div>
                          <div className="mt-4">{metadataPanelContent}</div>
                        </section>
                      )}
                    </div>
                  </div>
                ) : overlayMode === "full" ? (
                  fullDesktopEditorNode
                ) : (
                <>
                <div className="space-y-3">
                  {showDueSection ? (
                  <section className="rounded-[1.25rem] border border-[#ede7f7] bg-white/88 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[#4e476f] dark:text-white/70">
                      <CalendarDays className="h-4 w-4" />
                      Due
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {DUE_PRESETS.map((preset, presetIndex) => (
                        <button
                          className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${selectedTask.dueOn === preset.value ? "bg-[#f1ecff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]" : INACTIVE_CHIP_CLASS}`}
                          key={`${preset.label || "due-preset"}-${preset.value || "blank"}-${presetIndex}`}
                          onClick={() => setTaskDue(selectedTask.id, preset.value, preset.value ? selectedTask.dueTime : "")}
                          type="button"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input
                        className={OVERLAY_INPUT_CLASS}
                        onChange={(event) => setDueDrafts((current) => ({
                          ...current,
                          [selectedTask.id]: {
                            dueOn: event.target.value,
                            dueTime: current[selectedTask.id]?.dueTime ?? selectedTask.dueTime,
                          },
                        }))}
                        type="date"
                        value={(dueDrafts[selectedTask.id]?.dueOn ?? selectedTask.dueOn) || ""}
                      />
                      <input
                        className={OVERLAY_INPUT_CLASS}
                        onChange={(event) => setDueDrafts((current) => ({
                          ...current,
                          [selectedTask.id]: {
                            dueOn: current[selectedTask.id]?.dueOn ?? selectedTask.dueOn,
                            dueTime: event.target.value,
                          },
                        }))}
                        type="time"
                        value={(dueDrafts[selectedTask.id]?.dueTime ?? selectedTask.dueTime) || ""}
                      />
                    </div>
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${INACTIVE_CHIP_CLASS}`}
                        onClick={() => setTaskDue(selectedTask.id, "", "")}
                        type="button"
                      >
                        Clear
                      </button>
                      <button
                        className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]`}
                        onClick={() => {
                          const draft = dueDrafts[selectedTask.id];
                          if (!draft) {
                            return;
                          }
                          setTaskDue(selectedTask.id, draft.dueOn, draft.dueTime);
                          if (overlayMode === "due") {
                            closeInspector();
                          }
                        }}
                        type="button"
                      >
                        Save date + time
                      </button>
                    </div>
                    {selectedTaskActualTimeEntries.length > 0 ? (
                      <div className="mt-3 rounded-[1rem] border border-[#efe9ff] bg-[#fbfaff] p-2.5 dark:border-white/10 dark:bg-white/[0.04]">
                        <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-[#9b92be] dark:text-white/35">Saved entries</div>
                        <div className="space-y-2">
                          {selectedTaskActualTimeEntries.slice(0, 6).map((entry, entryIndex) => (
                            <div className="rounded-[0.95rem] border border-[#ece7f8] bg-white/88 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]" key={`${entry.id || "actual-entry"}-${entryIndex}`}>
                              <div className="flex items-center justify-between gap-3 text-sm">
                                <div className="min-w-0">
                                  <div className="font-medium text-[#3a335c] dark:text-white/80">{formatActual(entry.duration_seconds)}</div>
                                  <div className="truncate text-[11px] text-[#8d87a7] dark:text-white/40">{entry.title_snapshot}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[#8d87a7] dark:text-white/40">{formatEntryTimestamp(entry.created_at)}</span>
                                  {onDeleteTaskActualTimeEntry ? (
                                    <button
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#ffd6de] bg-[#fff1f3] text-[#d94e67] transition hover:bg-[#ffe7eb] dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf]"
                                      onClick={() => onDeleteTaskActualTimeEntry(entry.id)}
                                      type="button"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                              {entry.notes ? (
                                <p className="mt-1 text-xs leading-5 text-[#7d7597] dark:text-white/55">{entry.notes}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </section>
                  ) : null}
                  {showEstimatedSection ? (
                  <section className="rounded-[1.25rem] border border-[#ede7f7] bg-white/88 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[#4e476f] dark:text-white/70">
                      <Clock3 className="h-4 w-4" />
                      Estimated time
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {ESTIMATED_TIME_PRESETS.map((minutes, minutesIndex) => (
                        <button
                          className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${selectedTask.estimatedMinutes === minutes ? "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]" : INACTIVE_CHIP_CLASS}`}
                          key={`${minutes}-${minutesIndex}`}
                          onClick={() => setTaskEstimatedMinutes(selectedTask.id, selectedTask.estimatedMinutes === minutes ? null : minutes)}
                          type="button"
                        >
                          {minutes === 60 ? "1h" : `${minutes}m`}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        className={OVERLAY_INPUT_CLASS}
                        inputMode="numeric"
                        onChange={(event) => setEstimatedMinutesDrafts((current) => ({
                          ...current,
                          [selectedTask.id]: event.target.value.replace(/[^\d]/g, ""),
                        }))}
                        placeholder="Custom minutes"
                        type="text"
                        value={estimatedMinutesDraft}
                      />
                      <button
                        className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]`}
                        onClick={() => {
                          setTaskEstimatedMinutes(selectedTask.id, estimatedMinutesDraft ? Number.parseInt(estimatedMinutesDraft, 10) : null);
                          if (overlayMode === "estimated") {
                            closeInspector();
                          }
                        }}
                        type="button"
                      >
                        Apply
                      </button>
                    </div>
                  </section>
                  ) : null}

                  {showPrioritySection ? (
                  <section className="rounded-[1.25rem] border border-[#ede7f7] bg-white/88 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#4e476f] dark:text-white/70">
                      <Flag className="h-4 w-4" />
                      Priority
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {PRIORITY_OPTIONS.map((option, optionIndex) => {
                        const selected = selectedTask.priorities.includes(option.value);
                        return (
                          <button
                            className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${selected ? priorityTone(option.value) : INACTIVE_CHIP_CLASS}`}
                            key={`${option.value || "priority-option"}-${optionIndex}`}
                            onClick={() => {
                              const nextPriorities = selected
                                ? selectedTask.priorities.filter((value) => value !== option.value)
                                : [...selectedTask.priorities, option.value];
                              setTaskPriorities(selectedTask.id, nextPriorities);
                            }}
                            type="button"
                          >
                            {option.label}
                          </button>
                        );
                      })}
                      <button
                        className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${INACTIVE_CHIP_CLASS}`}
                        onClick={() => setTaskPriorities(selectedTask.id, [])}
                        type="button"
                      >
                        Clear all
                      </button>
                    </div>
                  </section>
                  ) : null}

                  {showRepeatSection ? (
                  <section className="rounded-[1.25rem] border border-[#ede7f7] bg-white/88 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#4e476f] dark:text-white/70">
                      <Repeat2 className="h-4 w-4" />
                      Repeat
                    </div>
	                    <div className="flex flex-wrap gap-2">
	                      {REPEAT_OPTIONS.map((option, optionIndex) => (
	                        <TaskTableChipButton
	                          key={`${option.value || "repeat-option"}-${optionIndex}`}
	                          onClick={() => setTaskRepeat(selectedTask.id, option.value)}
	                          toneClassName={selectedTask.repeat === option.value ? repeatTone(option.value) : INACTIVE_CHIP_CLASS}
	                        >
	                          {option.label}
	                        </TaskTableChipButton>
	                      ))}
	                    </div>
	                    {selectedTask.repeat !== "none" ? (
	                      <div className="mt-3 rounded-[1rem] border border-[#ece7f5] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.04]">
	                        {selectedTask.repeat !== "daily_until_complete" ? (
	                          <div className="flex flex-wrap items-center gap-2">
	                            <span className="text-sm font-medium text-[#7d7597] dark:text-white/55">Every</span>
	                            <input className={`${OVERLAY_INPUT_CLASS} w-24`} inputMode="numeric" onBlur={(event) => setTaskRepeatInterval(selectedTask, event.target.value)} onChange={(event) => setRepeatIntervalDrafts((current) => ({ ...current, [selectedTask.id]: event.target.value.replace(/[^\d]/g, "") }))} placeholder="1" type="text" value={repeatIntervalDrafts[selectedTask.id] ?? String(selectedTask.repeatInterval)} />
	                            {(["daily", "weekly", "monthly"] as TaskRepeat[]).map((repeatUnit) => (
	                              <TaskTableChipButton key={`${selectedTask.id}-full-repeat-unit-${repeatUnit}`} onClick={() => setTaskRepeat(selectedTask.id, repeatUnit)} toneClassName={selectedTask.repeat === repeatUnit ? repeatTone(repeatUnit) : INACTIVE_CHIP_CLASS}>
	                                {repeatUnit === "daily" ? "Days" : repeatUnit === "weekly" ? "Weeks" : "Months"}
	                              </TaskTableChipButton>
	                            ))}
	                          </div>
	                        ) : null}
	                        {selectedTask.repeat === "weekly" || selectedTask.repeat === "custom" ? (
	                          <div className="mt-3 flex flex-wrap gap-2">
	                            {REPEAT_WEEKDAY_OPTIONS.map((option) => (
	                              <TaskTableChipButton key={`${selectedTask.id}-full-weekday-${option.value}`} onClick={() => toggleTaskRepeatWeekday(selectedTask, option.value)} toneClassName={selectedTask.repeatDaysOfWeek.includes(option.value) ? "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]" : INACTIVE_CHIP_CLASS}>
	                                {option.label}
	                              </TaskTableChipButton>
	                            ))}
	                          </div>
	                        ) : null}
	                        {selectedTask.repeat === "monthly" || selectedTask.repeat === "custom" ? (
	                          <div className="mt-3 flex flex-wrap items-center gap-2">
	                            <span className="text-sm font-medium text-[#7d7597] dark:text-white/55">Day of month</span>
	                            <input className={`${OVERLAY_INPUT_CLASS} w-24`} inputMode="numeric" onBlur={(event) => setTaskRepeatDayOfMonth(selectedTask, event.target.value)} onChange={(event) => setRepeatDayOfMonthDrafts((current) => ({ ...current, [selectedTask.id]: event.target.value.replace(/[^\d]/g, "").slice(0, 2) }))} placeholder="15" type="text" value={repeatDayOfMonthDrafts[selectedTask.id] ?? (selectedTask.repeatDayOfMonth ? String(selectedTask.repeatDayOfMonth) : "")} />
	                          </div>
	                        ) : null}
	                      </div>
	                    ) : null}
                  </section>
                  ) : null}
                </div>

                <div className="space-y-4">
                  {showEnergyCard ? (
                  <section className="rounded-[1.25rem] border border-[#ede7f7] bg-white/88 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#4e476f] dark:text-white/70">
                      <Sparkles className="h-4 w-4" />
                      {overlayMode === "status" ? "Status" : overlayMode === "energy" ? "Energy" : "Energy + status"}
                    </div>
                    {overlayMode !== "status" ? (
                    <div className="flex flex-wrap gap-2">
                      {ENERGY_OPTIONS.map((option, optionIndex) => (
                        <button
                          className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${selectedTask.energy === option.value ? energyTone(option.value) : INACTIVE_CHIP_CLASS}`}
                          key={`${option.value || "energy-option"}-${optionIndex}`}
                          onClick={() => setTaskEnergy(selectedTask.id, option.value)}
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    ) : null}
                    {overlayMode !== "energy" ? (
                    <div className={`${overlayMode === "status" ? "" : "mt-4"} flex flex-wrap gap-2`}>
                      {getSelectableTaskStatusesForRepeatFrequency(selectedTask.repeat).map((status, optionIndex) => (
                        <button
                          className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} gap-2 ${selectedTask.status === status ? statusTone(status) : `${statusTone(status)} opacity-78 hover:opacity-100`}`}
                          key={`${status || "status-option"}-${optionIndex}`}
                          onClick={() => {
                            setTaskStatus(selectedTask.id, status);
                            if (overlayMode === "status") {
                              closeInspector();
                            }
                          }}
                          type="button"
                        >
                          {renderTaskStatusCircle(status, "sm")}
                          <span>{formatTaskStatusLabel(status)}</span>
                        </button>
                      ))}
                    </div>
                    ) : null}
                  </section>
                  ) : null}
                  {showActualSection ? (
                  <section className="rounded-[1.25rem] border border-[#ede7f7] bg-white/88 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#4e476f] dark:text-white/70">
                      <Clock3 className="h-4 w-4" />
                      Actual time
                    </div>
                    <div className="mb-3 text-sm text-[#7d7597] dark:text-white/55">Current time: {formatActual(getDisplayedActualSeconds(selectedTask))}</div>
                    <div className="flex flex-wrap gap-2">
                      {getRunningTimer(selectedTask.id) ? (
                        <>
                          <button
                            className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff] gap-2`}
                            onClick={() => {
                              const timer = getRunningTimer(selectedTask.id);
                              if (timer?.pausedAt) {
                                resumeTaskTimer(selectedTask.id);
                              } else {
                                pauseTaskTimer(selectedTask.id);
                              }
                            }}
                            type="button"
                          >
                            {getRunningTimer(selectedTask.id)?.pausedAt ? <CirclePlay className="h-3.5 w-3.5" /> : <CirclePause className="h-3.5 w-3.5" />}
                            {getRunningTimer(selectedTask.id)?.pausedAt ? "Continue timer" : "Pause timer"}
                          </button>
                          <button
                            className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} border-[#ffd8be] bg-[#fff1e7] text-[#dc6c1c] dark:border-[#65401d] dark:bg-[#432712] dark:text-[#ffb37e] gap-2`}
                            onClick={() => stopTaskTimer(selectedTask.id)}
                            type="button"
                          >
                            <TimerReset className="h-3.5 w-3.5" />
                            Stop focus timer
                          </button>
                        </>
                      ) : (
                        <button
                          className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff] gap-2`}
                          onClick={() => openFocusTimerForTask(selectedTask.id)}
                          type="button"
                        >
                          <CirclePlay className="h-3.5 w-3.5" />
                          Start focus timer
                        </button>
                      )}
                      <button
                        className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${INACTIVE_CHIP_CLASS} gap-2`}
                        onClick={() => openActualTimeEntryForTask(selectedTask.id)}
                        type="button"
                      >
                        <Clock3 className="h-3.5 w-3.5" />
                        Manual time entry
                      </button>
                      <button
                        className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} border-[#ffd6de] bg-[#fff1f3] text-[#d94e67] dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf] gap-2`}
                        onClick={() => {
                          onTaskActualSecondsChange?.(selectedTask.id, 0);
                          patchTask(selectedTask.id, (task) => ({ ...task, actualSeconds: 0 }));
                        }}
                        type="button"
                      >
                        <TimerReset className="h-3.5 w-3.5" />
                        Clear actual time
                      </button>
                    </div>
                  </section>
                  ) : null}

                  {showMetricsCard || showListsBlock || showTagsBlock || showLinkBlock || showNotesBlock ? (
                  <section className="rounded-[1.25rem] border border-[#ede7f7] bg-white/88 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                    {showMetricsCard ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[1rem] border border-[#efe9ff] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.04]">
                        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-[#9b92be] dark:text-white/35">
                          <TimerReset className="h-3.5 w-3.5" />
                          Estimated
                        </div>
                        <p className="text-lg font-medium text-[#2f294a] dark:text-white">{formatDuration(selectedTask.estimatedMinutes)}</p>
                      </div>
                      <div className="rounded-[1rem] border border-[#efe9ff] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.04]">
                        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-[#9b92be] dark:text-white/35">
                          <Clock3 className="h-3.5 w-3.5" />
                          Actual
                        </div>
                        <p className="text-lg font-medium text-[#2f294a] dark:text-white">{formatActual(getDisplayedActualSeconds(selectedTask))}</p>
                      </div>
                    </div>
                    ) : null}
                    <div className="mt-4 space-y-3">
                      {showListsBlock ? (
                      <div>
                        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-[#9b92be] dark:text-white/35">
                          <Tag className="h-3.5 w-3.5" />
                          Lists
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {mergedListOptions.map((list, listIndex) => (
                            <button className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${taskHasList(selectedTask, list.label) ? ACTIVE_LIST_CHIP_CLASS : INACTIVE_CHIP_CLASS}`} key={`${selectedTask.id || "task"}-list-choice-${list.id || list.label || "blank"}-${listIndex}`} onClick={() => toggleTaskList(selectedTask.id, list.label)} type="button">
                              {list.label}
                            </button>
                          ))}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <input className={OVERLAY_INPUT_CLASS} onChange={(event) => setListDrafts((current) => ({ ...current, [selectedTask.id]: event.target.value }))} placeholder="Add custom list" type="text" value={listDraft} />
                          <button className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]`} onClick={() => { void createTaskListForRow(selectedTask.id); }} type="button">Add</button>
                        </div>
                      </div>
                      ) : null}
                      {showTagsBlock ? (
                      <div>
                        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-[#9b92be] dark:text-white/35">
                          <Tag className="h-3.5 w-3.5" />
                          Tags
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {mergedTagOptions.map((tag, tagIndex) => (
                            <button className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${selectedTask.tags.includes(tag) ? TAG_CHIP_CLASS : INACTIVE_CHIP_CLASS}`} key={`${selectedTask.id || "task"}-tag-choice-${tag || "blank"}-${tagIndex}`} onClick={() => toggleTaskTag(selectedTask.id, tag)} type="button">
                              #{tag}
                            </button>
                          ))}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <input className={OVERLAY_INPUT_CLASS} onChange={(event) => setTagDrafts((current) => ({ ...current, [selectedTask.id]: event.target.value.toLowerCase().replace(/\s+/g, "-") }))} placeholder="new-tag" type="text" value={tagDraft} />
                            <button className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]`} onClick={() => addTaskTag(selectedTask.id, tagDraft)} type="button">Add tag</button>
                        </div>
                      </div>
                      ) : null}
                      {showLinkBlock ? (
                      <div>
                        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-[#9b92be] dark:text-white/35">
                          <Link2 className="h-3.5 w-3.5" />
                          Link
                        </div>
                        <div className="space-y-2">
                          <input
                            className={OVERLAY_INPUT_CLASS}
                            onBlur={() => commitTaskLink(selectedTask.id)}
                            onChange={(event) => setLinkDrafts((current) => ({
                              ...current,
                              [selectedTask.id]: {
                                ...(current[selectedTask.id] ?? linkDraft),
                                label: event.target.value,
                              },
                            }))}
                            placeholder="Link label"
                            type="text"
                            value={linkDraft.label}
                          />
                          <input
                            className={OVERLAY_INPUT_CLASS}
                            onBlur={() => commitTaskLink(selectedTask.id)}
                            onChange={(event) => setLinkDrafts((current) => ({
                              ...current,
                              [selectedTask.id]: {
                                ...(current[selectedTask.id] ?? linkDraft),
                                url: event.target.value,
                              },
                            }))}
                            placeholder="https://example.com"
                            type="url"
                            value={linkDraft.url}
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${INACTIVE_CHIP_CLASS}`}
                              onClick={() => {
                                clearTaskLink(selectedTask.id);
                              }}
                              type="button"
                            >
                              Clear link
                            </button>
                            <button
                              className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]`}
                              onClick={() => commitTaskLink(selectedTask.id, { closeAfterSave: overlayMode === "link" })}
                              type="button"
                            >
                              Save link
                            </button>
                          </div>
                        </div>
                      </div>
                      ) : null}
                      {showNotesBlock ? (
                      <div>
                        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-[#9b92be] dark:text-white/35">
                          <StickyNote className="h-3.5 w-3.5" />
                          Notes
                        </div>
                        {selectedTask.linkedNotes.length > 0 ? (
                          <div className="mb-3 flex flex-wrap gap-2">
                            {selectedTask.linkedNotes.map((note, noteIndex) => (
                              <button className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${LIST_CHIP_CLASS}`} key={`${note.id || "linked-note"}-${noteIndex}`} onClick={() => openLinkedNote(note.id)} type="button">{note.title}</button>
                            ))}
                          </div>
                        ) : null}
                        <button
                          className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${INACTIVE_CHIP_CLASS} mb-3`}
                          onClick={() => setNotePickerOpenByTaskId((current) => ({
                            ...current,
                            [selectedTask.id]: !current[selectedTask.id],
                          }))}
                          type="button"
                        >
                          {notePickerOpenByTaskId[selectedTask.id] ? "Hide saved notes" : "Connect existing note"}
                        </button>
                        {notePickerOpenByTaskId[selectedTask.id] ? (
                          <div className="mb-3 flex flex-wrap gap-2">
                            {allNoteOptions.map((note, noteIndex) => (
                              <button className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${linkedNoteDraft.includes(note.id) ? LIST_CHIP_CLASS : INACTIVE_CHIP_CLASS}`} key={`${note.id || "note-option"}-${noteIndex}`} onClick={() => { const nextLinked = linkedNoteDraft.includes(note.id) ? linkedNoteDraft.filter((id) => id !== note.id) : [...linkedNoteDraft, note.id]; setLinkedNoteDrafts((current) => ({ ...current, [selectedTask.id]: nextLinked })); setTaskLinkedNoteIds(selectedTask.id, nextLinked); }} type="button">{note.title}</button>
                            ))}
                          </div>
                        ) : null}
                        <div className="space-y-2">
                          <textarea
                            className={`${OVERLAY_INPUT_CLASS} min-h-[120px] resize-none py-3`}
                            onBlur={() => commitTaskNotes(selectedTask.id)}
                            onChange={(event) => setNotesDrafts((current) => ({
                              ...current,
                              [selectedTask.id]: event.target.value,
                            }))}
                            placeholder="Add notes"
                            value={notesDraft}
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} ${INACTIVE_CHIP_CLASS}`}
                              onClick={() => {
                                clearTaskNotes(selectedTask.id);
                              }}
                              type="button"
                            >
                              Clear notes
                            </button>
                            <button
                              className={`${CHIP_BASE} ${CONTROL_FONT_CLASS} border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]`}
                              onClick={() => commitTaskNotes(selectedTask.id, { closeAfterSave: overlayMode === "notes" })}
                              type="button"
                            >
                              Save notes
                            </button>
                          </div>
                        </div>
                      </div>
                      ) : null}
                    </div>
                  </section>
                  ) : null}
                </div>
                </>
                )}
              </div>
                  </>
                );
              })()}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {activeTimer && activeTimerTask && runningTaskTimers === undefined ? (
        <div className="pointer-events-none fixed right-4 top-4 z-40 sm:right-8 sm:top-5">
          <div className="pointer-events-auto flex items-center gap-3 rounded-[1.6rem] border border-[#ece5ff] bg-white/96 px-3 py-3 shadow-[0_22px_56px_rgba(95,74,189,0.16)] backdrop-blur dark:border-white/10 dark:bg-[#171328]/96">
            {effectiveRunningTimers.length > 1 ? (
              <button
                className={`${CONTROL_FONT_CLASS} flex h-10 w-10 items-center justify-center rounded-full border border-[#e2daf8] bg-[#f8f5ff] text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.06] dark:text-[#cabfff]`}
                onClick={() => {
                  if (onPreviousTaskTimer) {
                    onPreviousTaskTimer();
                    return;
                  }
                  setLocalActiveTimerIndex((current) => (current - 1 + effectiveRunningTimers.length) % effectiveRunningTimers.length);
                }}
                type="button"
              >
                <ChevronDown className="h-4 w-4 rotate-90" />
              </button>
            ) : null}
            <div className="flex min-w-[11rem] flex-1 flex-col items-center justify-center text-center">
              {renderFocusTimerDial(
                getTimerDisplaySeconds(activeTimer, effectiveTimerNow),
                { showAccentLine: true },
              )}
              <div className="mt-2 min-w-0">
                <p className="max-w-[10rem] truncate text-sm font-medium text-[#2f294a] dark:text-white">
                  {activeTimerTask.title}
                </p>
                {effectiveRunningTimers.length > 1 ? (
                  <p className="mt-1 text-xs text-[#7d7597] dark:text-white/55">
                    {effectiveActiveTimerIndex + 1} of {effectiveRunningTimers.length}
                  </p>
                ) : null}
              </div>
            </div>
            <button
              className={`${CONTROL_FONT_CLASS} flex h-10 w-10 items-center justify-center rounded-full border border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]`}
              onClick={() => {
                if (activeTimer.pausedAt) {
                  resumeTaskTimer(activeTimer.taskId);
                } else {
                  pauseTaskTimer(activeTimer.taskId);
                }
              }}
              type="button"
            >
              {activeTimer.pausedAt ? <CirclePlay className="h-4 w-4" /> : <CirclePause className="h-4 w-4" />}
            </button>
            <button
              className={`${CONTROL_FONT_CLASS} flex h-10 w-10 items-center justify-center rounded-full border border-[#ffd8be] bg-[#fff1e7] text-[#dc6c1c] dark:border-[#65401d] dark:bg-[#432712] dark:text-[#ffb37e]`}
              onClick={() => stopTaskTimer(activeTimer.taskId)}
              type="button"
            >
              <TimerReset className="h-4 w-4" />
            </button>
            {effectiveRunningTimers.length > 1 ? (
              <button
                className={`${CONTROL_FONT_CLASS} flex h-10 w-10 items-center justify-center rounded-full border border-[#e2daf8] bg-[#f8f5ff] text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.06] dark:text-[#cabfff]`}
                onClick={() => {
                  if (onNextTaskTimer) {
                    onNextTaskTimer();
                    return;
                  }
                  setLocalActiveTimerIndex((current) => (current + 1) % effectiveRunningTimers.length);
                }}
                type="button"
              >
                <ChevronDown className="h-4 w-4 -rotate-90" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
