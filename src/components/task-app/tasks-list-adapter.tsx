"use client";
import { ArrowDown, ArrowUp, CalendarDays, ChevronDown, ChevronRight, Clock3, Ellipsis, ExternalLink, Flame, Footprints, GripVertical, Skull, Tag, Trash2, X } from "lucide-react";
import {
  buildTaskRowContextMenuState,
  PARENT_TITLE_RENAME_INPUT_TYPOGRAPHY_STYLE,
  TaskManagementTableV2,
  TaskTitleDraftInput,
  TaskRowContextMenu,
  stopRowActionPointerEvent,
  type PrototypeTaskRow,
  type RowContextMenuState,
  type TaskManagementTableColumnId,
  type RunningTaskTimer,
} from "@/components/ui/task-management-table-v2";
import type { AgentPlanColumnId } from "@/components/ui/agent-plan";
import { DuplicateTaskGroupsPanel } from "./duplicate-task-groups-panel";
import { type ChildTaskPreview, type ChildTaskPreviewGroup, type ChildTaskPreviewLookup, type ChildTaskPreviewPriority, type DuplicateTitleGroup } from "@/lib/task-app-derived";
import type { TaskEditorLinkedNote } from "@/lib/task-notes";
import type { Task, TaskActualTimeEntry, TaskHistory, TaskRepeatMonthlyMode, TaskRepeatMonthlyOrdinal, TaskStatus, TaskSubtask, TaskSubtaskStatus } from "@/lib/database.types";
import { getSelectableTaskStatuses } from "@/lib/task-complete";
import type { TaskListDefinition } from "@/lib/task-lists";
import type { TaskTableLayoutPreferences } from "@/lib/task-table-layout-persistence";
import { buildTaskTableRow, snapshotBuildTaskTableRowDebugCount } from "@/lib/task-table-row";
import { useEffect, useMemo, useRef, useState, type ComponentProps, type DragEvent as ReactDragEvent, type ReactNode, type RefObject } from "react";
import { TasksListViewPanel } from "./tasks-page";
import { TaskDelayPicker } from "./task-delay-picker";
import { getTaskDisplayStatusWithHistory, formatDueLabel, formatDueTimeLabel } from "@/lib/task-cockpit";
import { isTaskOpen } from "@/lib/task-buckets";
import { TASK_STATUS_CHIP_STYLES, formatTaskStatusLabel, renderTaskStatusCircle } from "./task-status-ui";
import {
  formatRepeatFrequencyLabel,
  formatRepeatSummary,
  isWeekdaysRepeatSelection,
  REPEAT_MONTHLY_MODE_OPTIONS,
  REPEAT_MONTHLY_ORDINAL_OPTIONS,
  REPEAT_WEEKDAY_FULL_LABELS,
} from "@/lib/task-repeat";
import { buildChildTaskPreviewVisibility } from "@/lib/task-child-preview-collapse";
import type { TaskSiblingDropPlacement, TaskSiblingReorderInstruction } from "@/lib/task-sibling-reorder";
import { formatLocalDate, todayISO } from "@/lib/utils";
import {
  TASK_TABLE_ACTIVE_LIST_CHIP_CLASS,
  TASK_TABLE_INACTIVE_CHIP_CLASS,
  TASK_TABLE_LIST_CHIP_CLASS,
  TASK_TABLE_TAG_CHIP_CLASS,
  TASK_TABLE_TITLE_CELL_CLASS,
  TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS,
  CompactRepeatCadenceControls,
  TaskTableChipButton,
} from "@/components/ui/task-table-primitives";

type ListQuickPanelMode = "actual" | "delay" | "due" | "energy" | "estimated" | "link" | "list" | "notes" | "priority" | "repeat" | "status" | "tags";
type ChildTaskDragState = { depth: number; parentTaskId: string | null; taskId: string };
type ChildTaskDropTarget = { placement: TaskSiblingDropPlacement; taskId: string };

const QUICK_PANEL_SHELL_CLASS = "mt-2.5 rounded-[1.15rem] border border-[#e7defc] bg-[#fcfbff] px-4 py-3 shadow-[0_14px_34px_rgba(81,61,168,0.08)] dark:border-[#41306c] dark:bg-[#18112d]";
const QUICK_PANEL_TEXT_INPUT_CLASS = "h-10 rounded-[0.9rem] border border-[#ded6f2] bg-white px-3 text-sm text-[#27304c] outline-none transition focus:border-[#b39eff] dark:border-white/12 dark:bg-[#22193f] dark:text-white dark:focus:border-[#6d56d6]";
const QUICK_PANEL_PRIMARY_CHIP_CLASS = "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]";
const ACTIVE_CHIP_RING_CLASS = "ring-2 ring-[#d7cbfb] ring-offset-1 dark:ring-[#6d56d6] dark:ring-offset-[#18112d]";
const PRIORITY_OPTIONS = [
  { label: "Focus", value: "focus" as const },
  { label: "Important", value: "important" as const },
  { label: "Urgent", value: "urgent" as const },
];
const REPEAT_OPTIONS = [
  { label: "No Repeat", value: "none" as const },
  { label: "Daily", value: "daily" as const },
  { label: "Daily Until Complete", value: "daily_until_complete" as const },
  { label: "Weekly", value: "weekly" as const },
  { label: "Monthly", value: "monthly" as const },
  { label: "Custom Cadence", value: "custom" as const },
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

function getDelayAnchorDate(dueOn: string | null, todayDateKey: string) {
  if (!dueOn) {
    return todayDateKey;
  }
  return dueOn > todayDateKey ? dueOn : todayDateKey;
}
const REPEAT_MONTHLY_WEEKDAY_OPTIONS = REPEAT_WEEKDAY_FULL_LABELS.map((label, value) => ({ label, value }));
const COMPACT_REPEAT_UNITS: Array<{ label: string; value: PrototypeTaskRow["repeat"] }> = [
  { label: "Days", value: "daily" },
  { label: "Weeks", value: "weekly" },
  { label: "Months", value: "monthly" },
];
const isDevelopment = process.env.NODE_ENV !== "production";
function priorityTone(priority: "focus" | "important" | "urgent") {
  if (priority === "focus") return "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]";
  if (priority === "important") return "border-[#ffd8be] bg-[#fff1e7] text-[#dc6c1c] dark:border-[#65401d] dark:bg-[#432712] dark:text-[#ffb37e]";
  return "border-[#ffd6de] bg-[#fff1f3] text-[#d94e67] dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf]";
}

function formatPreviewPriorityLabel(priority: ChildTaskPreviewPriority) {
  if (priority === "focus") return "Focus";
  if (priority === "important") return "Important";
  return "Urgent";
}

function repeatTone(repeat: PrototypeTaskRow["repeat"]) {
  return repeat === "none" ? TASK_TABLE_INACTIVE_CHIP_CLASS : QUICK_PANEL_PRIMARY_CHIP_CLASS;
}

function energyTone(energy: PrototypeTaskRow["energy"]) {
  if (energy === "high") return "border-[#ffd8be] bg-[#fff1e7] text-[#dc6c1c] dark:border-[#65401d] dark:bg-[#432712] dark:text-[#ffb37e]";
  if (energy === "medium") return "border-[#f2df9b] bg-[#fff6df] text-[#b77900] dark:border-[#6b5317] dark:bg-[#44350d] dark:text-[#ffd56b]";
  if (energy === "low") return "border-[#c7eedc] bg-[#e8fbf2] text-[#119a69] dark:border-[#275443] dark:bg-[#16352c] dark:text-[#7de4b8]";
  return TASK_TABLE_INACTIVE_CHIP_CLASS;
}

function statusTone(status: TaskStatus) {
  return TASK_STATUS_CHIP_STYLES[status] ?? TASK_TABLE_INACTIVE_CHIP_CLASS;
}

function shouldIgnoreListOverlayOpen(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest("button, input, textarea, select, a, [data-list-action-control='true'], [contenteditable=''], [contenteditable='true'], [role='textbox'], [role='searchbox'], [role='combobox'], [role='spinbutton'], [aria-multiline='true']"));
}

function isKeyboardEventFromEditableTarget(target: EventTarget | null) {
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

  return target.matches("input, textarea, select") || Boolean(target.closest("input, textarea, select"));
}

type TasksTableSourceProps = {
  allListOptions?: Array<{ id: string; label: string }>;
  allNoteOptions?: TaskEditorLinkedNote[];
  allTagOptions?: string[];
  allTasks?: Task[];
  childTaskCreationBlockedTaskIds?: string[];
  childTaskPreviewByParentTaskId?: ChildTaskPreviewLookup;
  highlightedActiveTaskId?: string | null;
  highlightedScrollToken?: number | null;
  highlightedTaskIds?: string[];
  onVisibleSearchMatchIdsChange?: (taskIds: string[]) => void;
  searchMatchedStepParentTaskIds?: string[];
  currentListLabel?: string | null;
  getFollowTaskDestination?: (taskId: string) => { id: string; label: string } | null;
  overlayNode?: ReactNode;
  onCreateChildTask?: (parentTaskId: string, title: string) => Promise<{ error: string | null; taskId: string | null }>;
  onCreateTaskList?: (name: string) => Promise<{ id: string; persisted: boolean } | false> | { id: string; persisted: boolean } | false;
  onOpenFocusTimer?: (taskId: string) => void;
  onOpenNote?: (noteId: string) => void;
  onOpenTaskActualTime?: (taskId: string, options?: { durationSeconds?: number; title?: string }) => void;
  onOpenBatchDelete?: () => void;
  onOpenBatchEdit?: () => void;
  onOpenDeleteTask?: (taskId: string) => void;
  onDuplicateTask?: (taskId: string) => void;
  onDelayTask?: (taskId: string, days: number) => Promise<boolean> | boolean;
  onDelayTaskUntil?: (taskId: string, dueOn: string) => Promise<boolean> | boolean;
  onRestoreTask?: (taskId: string) => void;
  onOpenTaskHistory?: (taskId: string) => void;
  onOpenTaskEditor?: (taskId: string) => void;
  onOpenChildTask?: (taskId: string) => void;
  onUnlinkTask?: (taskId: string) => Promise<boolean> | boolean;
  onReorderChildTask?: (taskId: string, instruction: TaskSiblingReorderInstruction) => void;
  onFollowDetachedTask?: (taskId: string) => void;
  onDismissDetachedTask?: (taskId: string) => void;
  onNextTaskTimer?: () => void;
  onPreviousTaskTimer?: () => void;
  onClearSelection?: () => void;
  onDeleteTaskActualTimeEntry?: (entryId: string) => void;
  onSetActualSeconds?: (taskId: string, seconds: number) => void;
  onSetDue?: (taskId: string, schedule: { dueOn: string; dueTime: string }) => void;
  onSetEnergy?: (taskId: string, energy: PrototypeTaskRow["energy"]) => void;
  onSetEstimatedMinutes?: (taskId: string, minutes: number | null) => void;
  onSetLink?: (taskId: string, nextLink: { label: string; url: string }) => void;
  onSetLinkedNoteIds?: (taskId: string, linkedNoteIds: string[]) => void;
  onSetNotes?: (taskId: string, notes: string) => void;
  onSetPriority?: (taskId: string, priorities: PrototypeTaskRow["priorities"]) => void;
  onSetRepeat?: (taskId: string, repeat: PrototypeTaskRow["repeat"], cadence?: Pick<PrototypeTaskRow, "repeatDayOfMonth" | "repeatDaysOfWeek" | "repeatInterval" | "repeatMonthlyMode" | "repeatMonthlyOrdinal" | "repeatMonthlyWeekday">) => void;
  onSetStatus?: (taskId: string, status: TaskStatus, expectedTask?: Task | null, scrollAnchorTaskIds?: string[]) => void;
  onAddTaskSubtask?: (taskId: string) => string | null | Promise<string | null>;
  onAddChildTaskSubtask?: (subtaskId: string) => string | null | Promise<string | null>;
  onDeleteTaskSubtask?: (subtaskId: string) => void;
  onRenameTaskSubtask?: (subtaskId: string, title: string) => void;
  onSetTaskSubtaskStatus?: (subtaskId: string, status: TaskSubtaskStatus) => void;
  onSetTaskSubtasksAutoReset?: (taskId: string, subtasksAutoReset: boolean) => void;
  onSetTags?: (taskId: string, tags: string[]) => void;
  onSetTitle?: (taskId: string, title: string) => void;
  onSelectAllVisible?: (taskIds?: string[]) => void;
  onToggleTaskSelection?: (taskId: string, options?: { additive?: boolean; range?: boolean; visibleTaskIds?: string[] }) => void;
  onPauseTaskTimer?: (taskId: string) => void;
  onResumeTaskTimer?: (taskId: string) => void;
  onStartTaskTimer?: (timer: RunningTaskTimer) => void;
  onStopTaskTimer?: (taskId: string) => void;
  onToggleTaskList?: (taskId: string, listId: string) => void;
  selectedTaskIds?: string[];
  requestedOpenTaskId?: string | null;
  taskActualTimeEntriesByTaskId?: Record<string, TaskActualTimeEntry[]>;
  runningTaskTimers?: RunningTaskTimer[];
  activeTaskTimerIndex?: number;
  requestedOpenTask?: Task | null;
  suppressDetachedNoticeTaskId?: string | null;
  tasks: Task[];
  rowContext: {
    focusedTaskIdSet: Set<string>;
    linkedNotesByTaskId: Record<string, TaskEditorLinkedNote[]>;
    listDefinitions: TaskListDefinition[];
    listMembershipsByTaskId: Record<string, Array<{ id: string; isManual: boolean }>>;
    subtasksByTaskId: Record<string, TaskSubtask[]>;
    taskHistoryByTaskId: Record<string, TaskHistory[]>;
    todayDateKey: string;
  };
  onRequestedOpenTaskHandled?: (taskId: string) => void;
  taskTableLayoutPreferences?: TaskTableLayoutPreferences;
  onTaskTableLayoutPreferencesChange?: (nextPreferences: TaskTableLayoutPreferences) => void;
  statusChangeScrollAnchorTaskIds?: string[];
  statusChangeScrollPreviousVisibleTaskIds?: string[];
  statusChangeScrollSourceTaskId?: string | null;
  statusChangeScrollToken?: number | null;
};

type TasksTableAdapterProps = {
  filterRowsNode: ReactNode;
  tableProps: TasksTableSourceProps;
  panelProps: Omit<ComponentProps<typeof TasksListViewPanel>, "agentPlanNode" | "filterRowsNode">;
};

function isScrollableElement(element: HTMLElement) {
  const computedStyle = window.getComputedStyle(element);
  return /(auto|scroll|overlay)/.test(computedStyle.overflowY) && element.scrollHeight > element.clientHeight + 1;
}

function findNearestScrollableContainer(target: HTMLElement, fallbackContainer?: HTMLElement | null) {
  if (fallbackContainer?.contains(target)) {
    return fallbackContainer;
  }

  let current: HTMLElement | null = target.parentElement;
  while (current) {
    if (isScrollableElement(current)) {
      return current;
    }
    current = current.parentElement;
  }

  return fallbackContainer ?? null;
}

function revealTargetInScrollableContainer(target: HTMLElement, fallbackContainer?: HTMLElement | null) {
  const scrollContainer = findNearestScrollableContainer(target, fallbackContainer);
  if (!scrollContainer) {
    return;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const visibleTop = containerRect.top + 14;
  const visibleBottom = containerRect.bottom - 16;

  let scrollDelta = 0;
  if (targetRect.bottom > visibleBottom) {
    scrollDelta = targetRect.bottom - visibleBottom;
  } else if (targetRect.top < visibleTop) {
    scrollDelta = targetRect.top - visibleTop;
  }

  if (Math.abs(scrollDelta) < 2) {
    return;
  }

  scrollContainer.scrollBy({ top: scrollDelta, behavior: "smooth" });
}

type MeasuredStatusScrollAnchor = {
  anchorOffsetTop: number;
  candidateTaskIds: string[];
  sourceTaskId: string;
};

const TASK_TABLE_COLUMN_MAP: Record<AgentPlanColumnId, TaskManagementTableColumnId> = {
  bucket: "lists",
  date_added: "date_added",
  date_completed: "date_completed",
  last_done: "last_done",
  due: "due",
  energy: "energy",
  estimated_time: "estimated",
  actual_time: "actual",
  streak: "streak",
  tags: "tags",
  link: "link",
  notes: "notes",
  priority: "priority",
  repeat: "repeat",
  signal: "status",
};

export function TasksTableAdapter({
  filterRowsNode,
  tableProps,
  panelProps,
}: TasksTableAdapterProps) {
  function buildStatusScrollAnchorTaskIds(taskId: string) {
    const visibleTaskIds = tableProps.tasks.map((task) => task.id);
    const taskIndex = visibleTaskIds.indexOf(taskId);
    if (taskIndex < 0) {
      return [taskId];
    }
    return [
      ...visibleTaskIds.slice(taskIndex + 1),
      ...visibleTaskIds.slice(0, taskIndex).reverse(),
      taskId,
    ];
  }

  const rows = useMemo(
    () => {
      const startedAt = process.env.NODE_ENV !== "production" ? performance.now() : 0;
      const nextRows = tableProps.tasks.map((task) => buildTaskTableRow(task, {
        focusedTaskIdSet: tableProps.rowContext.focusedTaskIdSet,
        linkedNotes: tableProps.rowContext.linkedNotesByTaskId[task.id] ?? [],
        listDefinitions: tableProps.rowContext.listDefinitions,
        listMemberships: tableProps.rowContext.listMembershipsByTaskId[task.id] ?? [],
        subtasks: tableProps.rowContext.subtasksByTaskId[task.id] ?? [],
        taskHistory: tableProps.rowContext.taskHistoryByTaskId[task.id] ?? [],
        todayDateKey: tableProps.rowContext.todayDateKey,
      }));

      if (process.env.NODE_ENV !== "production") {
        const message = `[tasks:list-switch] rows mapped in ${Math.round(performance.now() - startedAt)}ms for ${tableProps.tasks.length} tasks`;
        console.info(message);
        if (typeof window !== "undefined") {
          window.__ADHDICE_TASK_LIST_SWITCH_LOGS__ ??= [];
          window.__ADHDICE_TASK_LIST_SWITCH_LOGS__.push(message);
        }
      }

      return nextRows;
    },
    [tableProps.rowContext, tableProps.tasks],
  );
  const visibleColumns = useMemo<TaskManagementTableColumnId[]>(
    () => [
      "status_icon",
      "title",
      ...panelProps.listVisibleColumns
        .map((columnId) => TASK_TABLE_COLUMN_MAP[columnId])
        .filter((columnId) => columnId !== "status"),
    ],
    [panelProps.listVisibleColumns],
  );
  const noteOptions = useMemo(
    () => tableProps.allNoteOptions?.map((note) => ({ id: note.id, title: note.title })) ?? [],
    [tableProps.allNoteOptions],
  );
  const requestedOpenTaskRow = useMemo(
    () => tableProps.requestedOpenTask
      ? buildTaskTableRow(tableProps.requestedOpenTask, {
        focusedTaskIdSet: tableProps.rowContext.focusedTaskIdSet,
        linkedNotes: tableProps.rowContext.linkedNotesByTaskId[tableProps.requestedOpenTask.id] ?? [],
        listDefinitions: tableProps.rowContext.listDefinitions,
        listMemberships: tableProps.rowContext.listMembershipsByTaskId[tableProps.requestedOpenTask.id] ?? [],
        subtasks: tableProps.rowContext.subtasksByTaskId[tableProps.requestedOpenTask.id] ?? [],
        taskHistory: tableProps.rowContext.taskHistoryByTaskId[tableProps.requestedOpenTask.id] ?? [],
        todayDateKey: tableProps.rowContext.todayDateKey,
      })
      : null,
    [tableProps.requestedOpenTask, tableProps.rowContext],
  );

  return (
    <TasksListViewPanel
      {...panelProps}
      agentPlanNode={
        <TaskManagementTableV2
          allowInlineInspector
          allListOptions={tableProps.allListOptions}
          allNoteOptions={noteOptions}
          allTagOptions={tableProps.allTagOptions}
          childTaskCreationBlockedTaskIds={tableProps.childTaskCreationBlockedTaskIds}
          childTaskPreviewByParentTaskId={tableProps.childTaskPreviewByParentTaskId}
          highlightedActiveTaskId={tableProps.highlightedActiveTaskId}
          highlightedScrollToken={tableProps.highlightedScrollToken}
          highlightedTaskIds={tableProps.highlightedTaskIds}
          onVisibleSearchMatchIdsChange={tableProps.onVisibleSearchMatchIdsChange}
          searchMatchedStepParentTaskIds={tableProps.searchMatchedStepParentTaskIds}
          className="max-w-none p-0"
          currentListLabel={tableProps.currentListLabel}
          enableInspector
          getFollowTaskDestination={tableProps.getFollowTaskDestination}
          onClearSelection={tableProps.onClearSelection}
          overlayNode={tableProps.overlayNode}
          onCreateTaskList={tableProps.onCreateTaskList}
          onCreateChildTask={tableProps.onCreateChildTask}
          onOpenBatchDelete={tableProps.onOpenBatchDelete}
          onOpenBatchEdit={tableProps.onOpenBatchEdit}
          onOpenDeleteTask={tableProps.onOpenDeleteTask}
          onDuplicateTask={tableProps.onDuplicateTask}
          onDelayTask={tableProps.onDelayTask}
          onDelayTaskUntil={tableProps.onDelayTaskUntil}
          onRestoreTask={tableProps.onRestoreTask}
          onOpenTaskHistory={tableProps.onOpenTaskHistory}
          onOpenFocusTimer={tableProps.onOpenFocusTimer}
          onOpenNote={tableProps.onOpenNote}
          onOpenTaskActualTime={tableProps.onOpenTaskActualTime}
          onOpenTaskEditor={tableProps.onOpenTaskEditor}
          onOpenChildTask={tableProps.onOpenChildTask}
          onUnlinkTask={tableProps.onUnlinkTask}
          onReorderChildTask={tableProps.onReorderChildTask}
          onFollowDetachedTask={tableProps.onFollowDetachedTask}
          onDismissDetachedTask={tableProps.onDismissDetachedTask}
          onNextTaskTimer={tableProps.onNextTaskTimer}
          onPreviousTaskTimer={tableProps.onPreviousTaskTimer}
          onDeleteTaskActualTimeEntry={tableProps.onDeleteTaskActualTimeEntry}
          onPauseTaskTimer={tableProps.onPauseTaskTimer}
          onResumeTaskTimer={tableProps.onResumeTaskTimer}
          onStartTaskTimer={tableProps.onStartTaskTimer}
          onStopTaskTimer={tableProps.onStopTaskTimer}
          onTaskActualSecondsChange={tableProps.onSetActualSeconds}
          taskActualTimeEntriesByTaskId={tableProps.taskActualTimeEntriesByTaskId}
          onTaskDueChange={tableProps.onSetDue}
          onTaskEnergyChange={tableProps.onSetEnergy}
          onTaskEstimatedMinutesChange={tableProps.onSetEstimatedMinutes}
          onTaskLinkChange={tableProps.onSetLink}
          onTaskLinkedNoteIdsChange={tableProps.onSetLinkedNoteIds}
          onTaskNotesChange={tableProps.onSetNotes}
          onTaskPriorityChange={tableProps.onSetPriority}
          onTaskRepeatChange={tableProps.onSetRepeat}
          onTaskStatusChange={(taskId, status) => {
            const expectedTask = tableProps.tasks.find((task) => task.id === taskId) ?? null;
            tableProps.onSetStatus?.(
              taskId,
              status,
              expectedTask,
              buildStatusScrollAnchorTaskIds(taskId),
            );
          }}
          onTaskSubtaskAdd={tableProps.onAddTaskSubtask}
          onTaskSubtaskAddChild={tableProps.onAddChildTaskSubtask}
          onTaskSubtasksAutoResetChange={tableProps.onSetTaskSubtasksAutoReset}
          onTaskSubtaskDelete={tableProps.onDeleteTaskSubtask}
          onTaskSubtaskRename={tableProps.onRenameTaskSubtask}
          onTaskSubtaskStatusChange={tableProps.onSetTaskSubtaskStatus}
          onTaskTagsChange={tableProps.onSetTags}
          onTaskTitleChange={tableProps.onSetTitle}
          onSelectAllVisible={tableProps.onSelectAllVisible}
          onToggleTaskSelection={tableProps.onToggleTaskSelection}
          onToggleTaskList={tableProps.onToggleTaskList}
          primaryBadgeLabel="Live task table"
          rows={rows}
          runningTaskTimers={tableProps.runningTaskTimers}
          requestedOpenTaskId={tableProps.requestedOpenTaskId}
          requestedOpenTask={requestedOpenTaskRow}
          suppressDetachedNoticeTaskId={tableProps.suppressDetachedNoticeTaskId}
          secondaryBadgeLabel="Table view"
          selectedTaskIds={tableProps.selectedTaskIds}
          showHeader={false}
          expandAllColumnsToken={panelProps.expandAllColumnsToken}
          shrinkAllColumnsToken={panelProps.shrinkAllColumnsToken}
          statusChangeScrollAnchorTaskIds={tableProps.statusChangeScrollAnchorTaskIds}
          statusChangeScrollPreviousVisibleTaskIds={tableProps.statusChangeScrollPreviousVisibleTaskIds}
          statusChangeScrollSourceTaskId={tableProps.statusChangeScrollSourceTaskId}
          statusChangeScrollToken={tableProps.statusChangeScrollToken}
          title="Tasks"
          visibleColumns={visibleColumns}
          activeTaskTimerIndex={tableProps.activeTaskTimerIndex}
          onRequestedOpenTaskHandled={tableProps.onRequestedOpenTaskHandled}
          persistedLayoutPreferences={tableProps.taskTableLayoutPreferences}
          onPersistedLayoutPreferencesChange={tableProps.onTaskTableLayoutPreferencesChange}
        />
      }
      filterRowsNode={filterRowsNode}
    />
  );
}

function isStepTitleEditTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("[data-step-title-edit]"));
}

type TasksListAdapterProps = {
  currentListLabel: string;
  filterRowsNode: ReactNode;
  panelProps: Omit<ComponentProps<typeof TasksListViewPanel>, "agentPlanNode" | "filterRowsNode">;
  selectedBucket: string;
  tableProps: TasksTableSourceProps;
};

const SIMPLE_STATUS_STYLES: Record<TaskStatus, string> = {
  archived: "border-[#d8ddea] bg-white text-[#68738c] dark:border-white/15 dark:bg-white/[0.04] dark:text-white/55",
  complete: "border-[#5d9b76] bg-[#eef8f1] text-[#256947] dark:border-[#2d5847] dark:bg-[#163429] dark:text-[#87ddb7]",
  delayed: "border-[#d8c0ff] bg-[#f6efff] text-[#7d54d1] dark:border-[#4d377f] dark:bg-[#27193f] dark:text-[#d5c2ff]",
  did_my_best: "border-[#f2d36f] bg-[#fff9e7] text-[#9f7200] dark:border-[#65511a] dark:bg-[#3a2d10] dark:text-[#ffd56b]",
  done: "border-[#97dfc1] bg-[#ecfbf4] text-[#119a69] dark:border-[#245441] dark:bg-[#14362c] dark:text-[#7de4b8]",
  in_progress: "border-[#a9c2ff] bg-[#eef3ff] text-[#4473df] dark:border-[#29437c] dark:bg-[#17253f] dark:text-[#a9c2ff]",
  missed: "border-[#f4afbc] bg-[#fff2f5] text-[#d94e67] dark:border-[#60313d] dark:bg-[#44232f] dark:text-[#ff9eaf]",
  not_due: "border-[#a9daf7] bg-[#eef8ff] text-[#3388c9] dark:border-[#27516b] dark:bg-[#162434] dark:text-[#8bc4ff]",
  pending: "border-[#f6be96] bg-[#fff4eb] text-[#d96b1c] dark:border-[#6b4522] dark:bg-[#392818] dark:text-[#ffcb99]",
  trashed: "border-[#f4afbc] bg-[#fff2f5] text-[#d94e67] dark:border-[#60313d] dark:bg-[#44232f] dark:text-[#ff9eaf]",
  upcoming: "border-[#d9def0] bg-[#f8f9fd] text-[#68738c] dark:border-white/15 dark:bg-white/[0.04] dark:text-white/60",
};

function resolveTaskCategoryLabel({
  currentListLabel,
  listDefinitions,
  listMemberships,
  selectedBucket,
}: {
  currentListLabel: string;
  listDefinitions: TaskListDefinition[];
  listMemberships: Array<{ id: string; isManual: boolean }>;
  selectedBucket: string;
}) {
  if (selectedBucket !== "all") {
    return currentListLabel;
  }

  const listDefinitionsById = new Map(listDefinitions.map((definition) => [definition.id, definition.name]));
  const sortedMemberships = [...listMemberships].sort((left, right) => {
    if (left.isManual !== right.isManual) {
      return left.isManual ? -1 : 1;
    }
    return (listDefinitions.findIndex((definition) => definition.id === left.id))
      - (listDefinitions.findIndex((definition) => definition.id === right.id));
  });
  return sortedMemberships.map((membership) => listDefinitionsById.get(membership.id)).find(Boolean) ?? "All tasks";
}

function shiftIsoDate(date: string, days: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  return formatLocalDate(next);
}

function buildTaskPrioritySelection(task: Task, focusedTaskIdSet: Set<string>) {
  const priorities: Array<"focus" | "important" | "urgent"> = [];
  if (focusedTaskIdSet.has(task.id)) priorities.push("focus");
  if (task.is_important) priorities.push("important");
  if (task.is_urgent) priorities.push("urgent");
  return priorities;
}

function formatPriorityChipLabel(task: Task, focusedTaskIdSet: Set<string>) {
  const activePriorities = buildTaskPrioritySelection(task, focusedTaskIdSet);
  if (activePriorities.includes("urgent")) return "Urgent";
  if (activePriorities.includes("important")) return "Important";
  if (activePriorities.includes("focus")) return "Focus";
  return `${task.priority.charAt(0).toUpperCase()}${task.priority.slice(1)} priority`;
}

function formatStepPreviewSchedule(item: ChildTaskPreview) {
  if (item.dueOn || item.dueTime) {
    const dueLabel = formatDueLabel(item.dueOn);
    const dueTimeLabel = formatDueTimeLabel(item.dueTime);
    return dueTimeLabel ? `${dueLabel} · ${dueTimeLabel}` : dueLabel;
  }
  if (item.scheduledOn) {
    return `Scheduled ${formatDueLabel(item.scheduledOn)}`;
  }
  return "";
}

function StepLayerChip({ depth }: { depth: number }) {
  return (
    <span className={`${TASK_TABLE_LIST_CHIP_CLASS} inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1 py-0 text-[10px] font-medium text-[#7a7592]`}>
      <span>{Math.max(1, depth)}</span>
      <Footprints className="h-2.5 w-2.5" />
    </span>
  );
}

function StepHistoryChips({ currentStreak, missedStreak }: { currentStreak: number; missedStreak: number }) {
  if (currentStreak <= 0 && missedStreak <= 0) {
    return null;
  }

  return (
    <>
      {currentStreak > 0 ? (
        <span className={`${TASK_TABLE_LIST_CHIP_CLASS} inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium text-[#dc6c1c]`}>
          <Flame className="h-3 w-3" />
          {currentStreak}
        </span>
      ) : null}
      {missedStreak > 0 ? (
        <span className={`${TASK_TABLE_LIST_CHIP_CLASS} inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium text-[#d94e67]`}>
          <Skull className="h-3 w-3" />
          {missedStreak}
        </span>
      ) : null}
    </>
  );
}

function formatListDuration(minutes: number | null) {
  if (!minutes || minutes <= 0) return "No est";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function formatListActual(seconds: number) {
  if (!seconds || seconds <= 0) return "0m";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function formatDateAddedChip(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatEnergyChipLabel(energy: PrototypeTaskRow["energy"]) {
  return energy === "none" ? "No energy" : `${energy.charAt(0).toUpperCase()}${energy.slice(1)} energy`;
}

function getHighlightedListRowClassName(
  taskId: string,
  highlightedActiveTaskId: string | null | undefined,
  highlightedTaskIdSet: Set<string>,
) {
  if (highlightedActiveTaskId === taskId) {
    return "border-[#ddd2ff] bg-[#efe6ff] dark:border-[#5a458f] dark:bg-[#2b1d46]";
  }
  return "";
}

function findPreviewAncestorIdsForTask(group: ChildTaskPreviewGroup, taskId: string) {
  const previewById = new Map(group.items.map((item) => [item.id, item] as const));
  if (!previewById.has(taskId)) {
    return null;
  }

  const ancestorIds: string[] = [];
  let currentPreview = previewById.get(taskId) ?? null;
  while (currentPreview?.parentTaskId && previewById.has(currentPreview.parentTaskId)) {
    ancestorIds.push(currentPreview.parentTaskId);
    currentPreview = previewById.get(currentPreview.parentTaskId) ?? null;
  }

  return ancestorIds;
}

function StepsCardPreview({
  activeQuickPanel,
  allTagOptions,
  childTasksById,
  closeQuickPanel,
  currentListLabel,
  group,
  isExpanded = true,
  listDefinitions,
  listMembershipsByTaskId,
  onCreateChildTask,
  onDeleteStep,
  onOpenHistory,
  onOpenStep,
  onOpenQuickPanel,
  onRenameStep,
  onReorderStep,
  onOpenActualTime,
  onDelayTaskUntil,
  onSetActualSeconds,
  onSetDue,
  onSetEnergy,
  onSetEstimatedMinutes,
  onSetLink,
  onSetNotes,
  onSetPriority,
  onSetRepeat,
  onSetStatus,
  onSetTags,
  onToggleTaskList,
  onToggleExpanded,
  parentStepCreationError,
  parentStepDraftInputRef,
  parentStepDraftValue,
  selectedBucket,
  showParentStepDraft,
  taskHistoryByTaskId,
  todayDateKey,
  onCancelParentStepDraft,
  onCommitParentStepDraft,
  onParentStepDraftChange,
  highlightedActiveTaskId,
  highlightedTaskIds,
}: {
  activeQuickPanel: { mode: ListQuickPanelMode; taskId: string } | null;
  allTagOptions: string[];
  childTasksById: Map<string, Task>;
  closeQuickPanel: () => void;
  currentListLabel?: string | null;
  group: ChildTaskPreviewGroup;
  isExpanded?: boolean;
  listDefinitions: TaskListDefinition[];
  listMembershipsByTaskId: Record<string, Array<{ id: string; isManual: boolean }>>;
  onCreateChildTask?: (parentTaskId: string, title: string) => Promise<{ error: string | null; taskId: string | null }>;
  onDeleteStep?: (taskId: string) => void;
  onOpenHistory?: (taskId: string) => void;
  onOpenStep: (taskId: string) => void;
  onOpenQuickPanel: (taskId: string, mode: ListQuickPanelMode) => void;
  onRenameStep?: (taskId: string, title: string) => void;
  onReorderStep?: (taskId: string, instruction: TaskSiblingReorderInstruction) => void;
  onOpenActualTime?: (taskId: string) => void;
  onDelayTaskUntil?: (taskId: string, dueOn: string) => Promise<boolean> | boolean;
  onSetActualSeconds?: (taskId: string, seconds: number) => void;
  onSetDue?: (taskId: string, schedule: { dueOn: string; dueTime: string }) => void;
  onSetEnergy?: (taskId: string, energy: PrototypeTaskRow["energy"]) => void;
  onSetEstimatedMinutes?: (taskId: string, minutes: number | null) => void;
  onSetLink?: (taskId: string, nextLink: { label: string; url: string }) => void;
  onSetNotes?: (taskId: string, notes: string) => void;
  onSetPriority?: (taskId: string, priorities: PrototypeTaskRow["priorities"]) => void;
  onSetRepeat?: (taskId: string, repeat: PrototypeTaskRow["repeat"], cadence?: Pick<PrototypeTaskRow, "repeatDayOfMonth" | "repeatDaysOfWeek" | "repeatInterval" | "repeatMonthlyMode" | "repeatMonthlyOrdinal" | "repeatMonthlyWeekday">) => void;
  onSetStatus?: (taskId: string, status: TaskStatus, expectedTask?: Task | null, scrollAnchorTaskIds?: string[]) => void;
  onSetTags?: (taskId: string, tags: string[]) => void;
  onToggleTaskList?: (taskId: string, listId: string) => void;
  onToggleExpanded?: () => void;
  parentStepCreationError?: string | null;
  parentStepDraftInputRef?: RefObject<HTMLInputElement | null>;
  parentStepDraftValue: string;
  selectedBucket: string;
  showParentStepDraft: boolean;
  taskHistoryByTaskId: Record<string, TaskHistory[]>;
  todayDateKey: string;
  onCancelParentStepDraft?: () => void;
  onCommitParentStepDraft?: () => void;
  onParentStepDraftChange?: (value: string) => void;
  highlightedActiveTaskId?: string | null;
  highlightedTaskIds?: string[];
}) {
  const [editingStepTitleId, setEditingStepTitleId] = useState<string | null>(null);
  const [collapsedStepIds, setCollapsedStepIds] = useState<Record<string, boolean>>({});
  const [childTaskDragState, setChildTaskDragState] = useState<ChildTaskDragState | null>(null);
  const [childTaskDropTarget, setChildTaskDropTarget] = useState<ChildTaskDropTarget | null>(null);
  const childTaskDragStateRef = useRef<ChildTaskDragState | null>(null);
  const childTaskDropTargetRef = useRef<ChildTaskDropTarget | null>(null);
  const stepTitleDraftsRef = useRef<Record<string, string>>({});
  const [stepTitleDrafts, setStepTitleDrafts] = useState<Record<string, string>>({});
  const [substepDraftParentId, setSubstepDraftParentId] = useState<string | null>(null);
  const [substepTitleDrafts, setSubstepTitleDrafts] = useState<Record<string, string>>({});
  const [substepCreationErrors, setSubstepCreationErrors] = useState<Record<string, string | null>>({});
  const highlightedTaskIdSet = useMemo(() => new Set(highlightedTaskIds ?? []), [highlightedTaskIds]);
  const collapsedStepIdSet = useMemo(
    () => new Set(Object.entries(collapsedStepIds).flatMap(([taskId, isCollapsed]) => (isCollapsed ? [taskId] : []))),
    [collapsedStepIds],
  );
  const { collapsibleTaskIds, visibleItems: expandedItems } = useMemo(
    () => buildChildTaskPreviewVisibility(group.items, collapsedStepIdSet),
    [collapsedStepIdSet, group.items],
  );

  useEffect(() => {
    if (!highlightedActiveTaskId) {
      return;
    }

    const ancestorIds = findPreviewAncestorIdsForTask(group, highlightedActiveTaskId);
    if (!ancestorIds || ancestorIds.length === 0) {
      return;
    }

    setCollapsedStepIds((current) => {
      let changed = false;
      const next = { ...current };
      for (const ancestorId of ancestorIds) {
        if (next[ancestorId]) {
          delete next[ancestorId];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [group, highlightedActiveTaskId]);

  if (expandedItems.length === 0 && !group.summary.hasInvalidDescendants && !showParentStepDraft) {
    return null;
  }

  const commitSubstepDraft = async (parentTaskId: string) => {
    const title = (substepTitleDrafts[parentTaskId] ?? "").trim();
    if (!title) {
      setSubstepDraftParentId(null);
      return;
    }

    const result = await onCreateChildTask?.(parentTaskId, title);
    if (result?.error) {
      setSubstepCreationErrors((current) => ({ ...current, [parentTaskId]: result.error }));
      return;
    }
    setSubstepTitleDrafts((current) => ({ ...current, [parentTaskId]: "" }));
    setSubstepCreationErrors((current) => ({ ...current, [parentTaskId]: null }));
    setSubstepDraftParentId(null);
  };

  const clearChildTaskDragState = () => {
    childTaskDragStateRef.current = null;
    childTaskDropTargetRef.current = null;
    setChildTaskDragState(null);
    setChildTaskDropTarget(null);
  };

  const setStepTitleDraft = (taskId: string, draft: string) => {
    stepTitleDraftsRef.current[taskId] = draft;
    setStepTitleDrafts((current) => ({ ...current, [taskId]: draft }));
  };

  const beginChildTaskDrag = (event: ReactDragEvent<HTMLElement>, item: ChildTaskPreview) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
    const nextDragState = {
      depth: item.depth,
      parentTaskId: item.parentTaskId,
      taskId: item.id,
    };
    childTaskDragStateRef.current = nextDragState;
    childTaskDropTargetRef.current = null;
    setChildTaskDragState(nextDragState);
    setChildTaskDropTarget(null);
  };

  const getChildTaskDropPlacement = (event: ReactDragEvent<HTMLElement>): TaskSiblingDropPlacement => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY - rect.top < rect.height / 2 ? "before" : "after";
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
    const placement = getChildTaskDropPlacement(event);
    const currentDropTarget = childTaskDropTargetRef.current;
    if (currentDropTarget?.taskId !== item.id || currentDropTarget.placement !== placement) {
      const nextDropTarget = { placement, taskId: item.id };
      childTaskDropTargetRef.current = nextDropTarget;
      setChildTaskDropTarget(nextDropTarget);
    }
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
    onReorderStep?.(dragState.taskId, { placement, targetTaskId: item.id });
    clearChildTaskDragState();
  };

  const getChildTaskDropIndicatorClassName = (itemId: string) => {
    if (childTaskDropTarget?.taskId !== itemId) {
      return "";
    }
    return childTaskDropTarget.placement === "before"
      ? "shadow-[inset_0_2px_0_0_rgba(111,87,246,0.95)]"
      : "shadow-[inset_0_-2px_0_0_rgba(111,87,246,0.95)]";
  };

  return (
    <section className="mt-3 border-t border-[#f0ebfb] pt-3 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5">
          <span className={TASK_TABLE_TITLE_CELL_CLASS}>Steps</span>
          <button
            aria-expanded={isExpanded}
            className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border border-transparent text-[#9b92be] transition hover:border-[#ddd2ff] hover:bg-[#f3efff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:text-white/35 dark:hover:border-[#42306f] dark:hover:bg-[#22193f] dark:focus-visible:ring-[#3b2f68]/90"
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpanded?.();
            }}
            type="button"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>
      {!isExpanded ? null : (
        <>
      {showParentStepDraft ? (
        <div className="mt-2 rounded-[0.95rem] border border-[#e7defc] bg-[#fcfbff] px-3 py-3 dark:border-[#41306c] dark:bg-[#18112d]">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className={`${QUICK_PANEL_TEXT_INPUT_CLASS} min-w-[14rem] flex-1`}
              onChange={(event) => onParentStepDraftChange?.(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  onCommitParentStepDraft?.();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  onCancelParentStepDraft?.();
                }
              }}
              placeholder="Step title..."
              ref={parentStepDraftInputRef}
              value={parentStepDraftValue}
            />
            <TaskTableChipButton onClick={() => onCommitParentStepDraft?.()} toneClassName={QUICK_PANEL_PRIMARY_CHIP_CLASS}>Add Step</TaskTableChipButton>
            <TaskTableChipButton onClick={() => onCancelParentStepDraft?.()} toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}>Cancel</TaskTableChipButton>
          </div>
          {parentStepCreationError ? (
            <p className="mt-2 text-xs text-[#9a7a24] dark:text-[#f3d38a]">{parentStepCreationError}</p>
          ) : null}
        </div>
      ) : null}
      {group.summary.hasInvalidDescendants ? (
        <p className="mt-2 text-xs text-[#9a7a24] dark:text-[#f3d38a]">
          {group.summary.invalidChildLinkCount === 1 ? "1 invalid step link" : `${group.summary.invalidChildLinkCount} invalid step links`}
        </p>
      ) : null}
      {expandedItems.length > 0 ? (
        <ul className="mt-2">
          {expandedItems.map((item) => {
            const siblingItems = group.items.filter((candidate) => candidate.parentTaskId === item.parentTaskId && candidate.depth === item.depth);
            const siblingIndex = siblingItems.findIndex((candidate) => candidate.id === item.id);
            const childTask = childTasksById.get(item.id) ?? null;
            const scheduleLabel = formatStepPreviewSchedule(item);
            const depthIndent = Math.min(Math.max(item.depth - 1, 0), 3) * 0.75;
            const activePanelMode = activeQuickPanel?.taskId === item.id ? activeQuickPanel.mode : null;
            const displayStatus = childTask
              ? getTaskDisplayStatusWithHistory(
                childTask,
                taskHistoryByTaskId[childTask.id] ?? [],
                todayDateKey,
              )
              : item.status;
            const activePriorities = childTask ? buildTaskPrioritySelection(childTask, new Set(item.priorityFlags.includes("focus") ? [item.id] : [])) : item.priorityFlags;
            const categoryLabel = resolveTaskCategoryLabel({
              currentListLabel,
              listDefinitions,
              listMemberships: listMembershipsByTaskId[item.id] ?? [],
              selectedBucket,
            });
            const repeatSummary = childTask
              ? formatRepeatSummary(childTask)
              : item.repeat !== "none"
                ? formatRepeatFrequencyLabel(
                  item.repeat,
                  item.repeatInterval,
                  item.repeatDaysOfWeek,
                  item.repeatMonthlyMode,
                  item.repeatMonthlyOrdinal,
                  item.repeatMonthlyWeekday,
                )
                : "";
            const visibleTags = item.tags.slice(0, 3);
            const extraTagCount = Math.max(0, item.tags.length - visibleTags.length);
            const isRenaming = editingStepTitleId === item.id;
            const titleDraft = stepTitleDrafts[item.id] ?? item.title;
            const canCollapse = collapsibleTaskIds.has(item.id);
            const isCollapsed = canCollapse && collapsedStepIds[item.id] === true;
            const commitTitle = (taskId: string) => {
              const nextTitle = (stepTitleDraftsRef.current[taskId] ?? item.title).trim();
              if (nextTitle && nextTitle !== item.title) {
                onRenameStep?.(taskId, nextTitle);
              }
              setEditingStepTitleId((current) => (current === item.id ? null : current));
            };

            return (
              <li
                className={`cursor-pointer rounded-[0.95rem] border px-1.5 py-2.5 transition hover:bg-[#fbfaff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:hover:bg-white/[0.05] dark:focus-visible:ring-[#3b2f68]/90 ${getHighlightedListRowClassName(item.id, highlightedActiveTaskId, highlightedTaskIdSet) || "border-transparent bg-transparent"} ${childTaskDragState?.taskId === item.id ? "opacity-60" : ""} ${getChildTaskDropIndicatorClassName(item.id)}`}
                data-same-table-step-row={item.id}
                key={item.id}
                onDragOver={(event) => updateChildTaskDropTarget(event, item)}
                onDrop={(event) => dropChildTaskOnItem(event, item)}
                onClick={(event) => {
                  if (isStepTitleEditTarget(event.target)) {
                    return;
                  }
                  event.stopPropagation();
                  onOpenStep(item.id);
                }}
                onKeyDown={(event) => {
                  if (isStepTitleEditTarget(event.target)) {
                    return;
                  }
                  if (isKeyboardEventFromEditableTarget(event.target)) {
                    return;
                  }
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpenStep(item.id);
                  }
                }}
                role="button"
                style={{ marginLeft: `${depthIndent}rem` }}
                tabIndex={0}
              >
                <div className="flex min-w-0 items-start gap-2">
                  <button
                    aria-expanded={activePanelMode === "status"}
                    aria-label={`Change status for ${item.title || (item.depth > 1 ? "substep" : "step")}`}
                    className="mt-0.5 inline-flex h-7 w-7 flex-none items-center justify-center rounded-full text-[#8d97b0] transition hover:bg-[#f7f3ff] hover:text-[#6f57f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f57f6]/30 dark:text-white/45 dark:hover:bg-white/[0.06] dark:hover:text-[#cabfff]"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenQuickPanel(item.id, "status");
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    type="button"
                  >
                    {renderTaskStatusCircle(displayStatus, "sm")}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-1.5">
                        {isRenaming ? (
                          <span data-step-title-edit={item.id} onClick={(event) => event.stopPropagation()} onPointerDown={stopRowActionPointerEvent}>
                            <TaskTitleDraftInput
                              autoFocus
                              className={`${TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS} min-w-0 rounded-[0.45rem] border border-[#ddd2ff] bg-white px-1 py-0 outline-none transition focus:border-[#b7a7ff] dark:border-[#42306f] dark:bg-[#22193f] dark:focus:border-[#6d56d6]`}
                              initialValue={titleDraft}
                              onCommit={commitTitle}
                              onDone={() => setEditingStepTitleId((current) => (current === item.id ? null : current))}
                              onDraftChange={setStepTitleDraft}
                              style={PARENT_TITLE_RENAME_INPUT_TYPOGRAPHY_STYLE}
                              taskId={item.id}
                            />
                          </span>
                        ) : (
                          <div className="flex min-w-0 items-center gap-1.5">
                            <button
                              data-step-title-edit={item.id}
                              className="block min-w-0 appearance-none border-0 bg-transparent p-0 text-left shadow-none outline-none transition hover:opacity-85 focus-visible:rounded-[0.5rem] focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:focus-visible:ring-[#3b2f68]/90"
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditingStepTitleId(item.id);
                                setStepTitleDraft(item.id, item.title);
                              }}
                              onPointerDown={(event) => event.stopPropagation()}
                              type="button"
                            >
                              <p className={`${TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS} min-w-0 truncate`}>
                                {item.title || (item.depth > 1 ? "Untitled substep" : "Untitled step")}
                              </p>
                            </button>
                            <StepLayerChip depth={item.depth} />
                            <StepHistoryChips currentStreak={item.currentStreak} missedStreak={item.missedStreak} />
                            {canCollapse ? (
                              <button
                                aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${item.depth > 1 ? "substep" : "step"} ${item.title || "Untitled"}`}
                                className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border border-transparent text-[#8a79d6] transition hover:border-[#ddd2ff] hover:bg-[#f3efff] dark:text-[#b6a9ec] dark:hover:border-[#42306f] dark:hover:bg-[#22193f]"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setCollapsedStepIds((current) => ({ ...current, [item.id]: !isCollapsed }));
                                }}
                                onPointerDown={(event) => event.stopPropagation()}
                                type="button"
                              >
                                {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-none items-center gap-1">
                        {onReorderStep ? (
                          <>
                            <button
                              aria-label={`Drag to reorder ${item.depth > 1 ? "substep" : "step"} ${item.title || "Untitled"}`}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#8a79d6] opacity-70 transition hover:bg-[#f3efff] hover:text-[#6f57f6] hover:opacity-100 dark:text-[#b6a9ec] dark:hover:bg-[#22193f] dark:hover:text-[#cabfff]"
                              draggable
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              onDragEnd={clearChildTaskDragState}
                              onDragStart={(event) => beginChildTaskDrag(event, item)}
                              onPointerDown={(event) => event.stopPropagation()}
                              type="button"
                            >
                              <GripVertical className="h-3.5 w-3.5" />
                            </button>
                            <button aria-label={`Move ${item.depth > 1 ? "substep" : "step"} ${item.title || "Untitled"} up`} className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#6f57f6] transition hover:bg-[#f3efff] disabled:cursor-not-allowed disabled:opacity-25 dark:text-[#cabfff] dark:hover:bg-[#22193f]" disabled={siblingIndex <= 0} onClick={(event) => { event.stopPropagation(); onReorderStep(item.id, "up"); }} onPointerDown={(event) => event.stopPropagation()} type="button"><ArrowUp className="h-3.5 w-3.5" /></button>
                            <button aria-label={`Move ${item.depth > 1 ? "substep" : "step"} ${item.title || "Untitled"} down`} className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#6f57f6] transition hover:bg-[#f3efff] disabled:cursor-not-allowed disabled:opacity-25 dark:text-[#cabfff] dark:hover:bg-[#22193f]" disabled={siblingIndex < 0 || siblingIndex >= siblingItems.length - 1} onClick={(event) => { event.stopPropagation(); onReorderStep(item.id, "down"); }} onPointerDown={(event) => event.stopPropagation()} type="button"><ArrowDown className="h-3.5 w-3.5" /></button>
                          </>
                        ) : null}
                        {onCreateChildTask ? (
                          <button
                            aria-label={`Add substep to ${item.title || "Untitled step"}`}
                            className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full border border-transparent bg-transparent text-[#6f57f6] opacity-78 transition hover:border-[#ddd2ff] hover:bg-[#f3efff] hover:opacity-100 dark:text-[#cabfff] dark:hover:border-[#42306f] dark:hover:bg-[#22193f]"
                            data-same-table-step-add={item.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSubstepCreationErrors((current) => ({ ...current, [item.id]: null }));
                              setSubstepDraftParentId(item.id);
                            }}
                            onPointerDown={(event) => event.stopPropagation()}
                            type="button"
                          >
                            <Footprints className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                        {onOpenHistory ? (
                          <button
                            aria-label={`Open history for step ${item.title || "Untitled step"}`}
                            className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full border border-transparent text-[#6f57f6] opacity-75 transition hover:border-[#ddd2ff] hover:bg-[#f3efff] hover:opacity-100 dark:text-[#cabfff] dark:hover:border-[#42306f] dark:hover:bg-[#22193f]"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenHistory(item.id);
                            }}
                            onPointerDown={(event) => event.stopPropagation()}
                            type="button"
                          >
                            <CalendarDays className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      {onDeleteStep ? (
                        <button
                          aria-label={`Move step ${item.title || "Untitled step"} to trash`}
                          className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full border border-transparent text-[#d94e67] opacity-70 transition hover:border-[#ffd6de] hover:bg-[#fff1f3] hover:opacity-100 dark:text-[#ff9eaf] dark:hover:border-[#5b2e3b] dark:hover:bg-[#44232f]"
                          data-same-table-step-delete={item.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteStep(item.id);
                          }}
                          onPointerDown={(event) => event.stopPropagation()}
                          type="button"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2" data-list-action-control="true">
                      <MetadataChipButton
                        active={activePanelMode === "status"}
                        onClick={() => onOpenQuickPanel(item.id, "status")}
                        toneClassName={SIMPLE_STATUS_STYLES[displayStatus]}
                      >
                        {formatTaskStatusLabel(displayStatus)}
                      </MetadataChipButton>
                      <MetadataChipButton active={activePanelMode === "due"} onClick={() => onOpenQuickPanel(item.id, "due")}>
                        {scheduleLabel || "No date"}
                      </MetadataChipButton>
                      <MetadataChipButton active={activePanelMode === "priority"} onClick={() => onOpenQuickPanel(item.id, "priority")}>
                        {childTask ? formatPriorityChipLabel(childTask, new Set(activePriorities.includes("focus") ? [item.id] : [])) : activePriorities[0] ? formatPreviewPriorityLabel(activePriorities[0]) : "Normal priority"}
                      </MetadataChipButton>
                      {repeatSummary ? (
                        <MetadataChipButton active={activePanelMode === "repeat"} onClick={() => onOpenQuickPanel(item.id, "repeat")}>
                          {repeatSummary}
                        </MetadataChipButton>
                      ) : null}
                      <MetadataChipButton active={activePanelMode === "list"} onClick={() => onOpenQuickPanel(item.id, "list")}>
                        {categoryLabel}
                      </MetadataChipButton>
                      {visibleTags.map((tag) => (
                        <MetadataChipButton active={activePanelMode === "tags"} key={tag} onClick={() => onOpenQuickPanel(item.id, "tags")} tone="tag">
                          #{tag}
                        </MetadataChipButton>
                      ))}
                      {extraTagCount > 0 ? (
                        <MetadataChipButton active={activePanelMode === "tags"} onClick={() => onOpenQuickPanel(item.id, "tags")} tone="tag">
                          +{extraTagCount} tag{extraTagCount === 1 ? "" : "s"}
                        </MetadataChipButton>
                      ) : null}
                      {item.tags.length === 0 ? (
                        <MetadataChipButton active={activePanelMode === "tags"} onClick={() => onOpenQuickPanel(item.id, "tags")} tone="tag">
                          <span className="inline-flex items-center gap-1">
                            <Tag className="h-3 w-3" />
                            Add tags
                          </span>
                        </MetadataChipButton>
                      ) : null}
                    </div>
                    <div className="mt-2 flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" data-list-action-control="true">
                      <span className={`${TASK_TABLE_INACTIVE_CHIP_CLASS} inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[12px] font-medium`}>
                        Added {formatDateAddedChip(item.createdAt)}
                      </span>
                      <MetadataChipButton active={activePanelMode === "estimated"} onClick={() => onOpenQuickPanel(item.id, "estimated")}>
                        <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{formatListDuration(item.estimatedMinutes)}</span>
                      </MetadataChipButton>
                      <MetadataChipButton active={activePanelMode === "actual"} onClick={() => onOpenQuickPanel(item.id, "actual")}>
                        <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{formatListActual(item.actualSeconds)}</span>
                      </MetadataChipButton>
                      <MetadataChipButton active={activePanelMode === "energy"} onClick={() => onOpenQuickPanel(item.id, "energy")} toneClassName={energyTone(item.energy)}>
                        {formatEnergyChipLabel(item.energy)}
                      </MetadataChipButton>
                      <MetadataChipButton active={activePanelMode === "link"} onClick={() => onOpenQuickPanel(item.id, "link")}>
                        {item.linkLabel || item.linkUrl ? item.linkLabel || "Link" : "No link"}
                      </MetadataChipButton>
                      <MetadataChipButton active={activePanelMode === "notes"} onClick={() => onOpenQuickPanel(item.id, "notes")}>
                        {item.notes.trim() ? "Notes" : "No notes"}
                      </MetadataChipButton>
                    </div>
                  </div>
                </div>
                {substepDraftParentId === item.id ? (
                  <form
                    className="mt-2 flex flex-col gap-2 pl-8 sm:flex-row"
                    onClick={(event) => event.stopPropagation()}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void commitSubstepDraft(item.id);
                    }}
                  >
                    <input
                      autoFocus
                      className={`${QUICK_PANEL_TEXT_INPUT_CLASS} flex-1`}
                      onBlur={() => {
                        if ((substepTitleDrafts[item.id] ?? "").trim()) {
                          void commitSubstepDraft(item.id);
                          return;
                        }
                        setSubstepDraftParentId(null);
                      }}
                      onChange={(event) => {
                        setSubstepTitleDrafts((current) => ({ ...current, [item.id]: event.target.value }));
                        setSubstepCreationErrors((current) => ({ ...current, [item.id]: null }));
                      }}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setSubstepDraftParentId(null);
                        }
                      }}
                      placeholder="Substep title..."
                      value={substepTitleDrafts[item.id] ?? ""}
                    />
                    <TaskTableChipButton toneClassName={QUICK_PANEL_PRIMARY_CHIP_CLASS} type="submit">Add</TaskTableChipButton>
                    {substepCreationErrors[item.id] ? <p className="text-xs font-medium text-[#d94e67] dark:text-[#ff9eaf]">{substepCreationErrors[item.id]}</p> : null}
                  </form>
                ) : null}
                {activePanelMode === "status" ? (
                  <QuickPanelShell onClose={closeQuickPanel} title={`Status · ${item.title || "Step"}`}>
                    <div className="flex flex-wrap gap-2">
                      {getSelectableTaskStatuses(childTask ?? { repeat_frequency: item.repeat }).map((status) => (
                        <TaskTableChipButton
                          className="gap-2"
                          key={status}
                          onClick={() => {
                            if (status === "delayed" && item.dueOn && onDelayTaskUntil) {
                              openQuickPanel(item.id, "delay");
                              return;
                            }
                            closeQuickPanel();
                            onSetStatus?.(item.id, status, childTask, [
                              ...buildListStatusScrollAnchorTaskIds(task.id),
                              item.id,
                            ]);
                          }}
                          toneClassName={`${statusTone(status)}${status === displayStatus ? ` ${ACTIVE_CHIP_RING_CLASS}` : " opacity-78 hover:opacity-100"}`}
                        >
                          {renderTaskStatusCircle(status, "sm")}
                          <span>{formatTaskStatusLabel(status)}</span>
                        </TaskTableChipButton>
                      ))}
                    </div>
                  </QuickPanelShell>
                ) : null}
                {activePanelMode === "delay" ? (
                  <DelayQuickPanel
                    dueOn={item.dueOn}
                    onClose={closeQuickPanel}
                    onSave={(nextDueOn) => onDelayTaskUntil?.(item.id, nextDueOn) ?? false}
                    todayDateKey={todayDateKey}
                  />
                ) : null}
                {activePanelMode === "tags" ? (
                  <TagsQuickPanel
                    allTagOptions={allTagOptions}
                    onClose={closeQuickPanel}
                    onSave={(tags) => onSetTags?.(item.id, tags)}
                    tags={item.tags}
                  />
                ) : null}
                {activePanelMode === "due" ? (
                  <DueQuickPanel
                    dueOn={item.dueOn}
                    dueTime={item.dueTime}
                    onClose={closeQuickPanel}
                    onSave={(schedule) => {
                      onSetDue?.(item.id, schedule);
                      closeQuickPanel();
                    }}
                  />
                ) : null}
                {activePanelMode === "priority" ? (
                  <PriorityQuickPanel
                    activePriorities={activePriorities}
                    onClose={closeQuickPanel}
                    onSave={(priorities) => onSetPriority?.(item.id, priorities)}
                  />
                ) : null}
                {activePanelMode === "repeat" ? (
                  <RepeatQuickPanel
                    onClose={closeQuickPanel}
                    onSave={(repeat, cadence) => onSetRepeat?.(item.id, repeat, cadence)}
                    repeatDayOfMonth={item.repeatDayOfMonth}
                    repeatDaysOfWeek={item.repeatDaysOfWeek}
                    repeatFrequency={item.repeat}
                    repeatInterval={Math.max(1, item.repeatInterval)}
                  />
                ) : null}
                {activePanelMode === "list" ? (
                  <ListQuickPanel
                    listDefinitions={listDefinitions}
                    listMemberships={listMembershipsByTaskId[item.id] ?? []}
                    onClose={closeQuickPanel}
                    onToggleList={(listId) => onToggleTaskList?.(item.id, listId)}
                  />
                ) : null}
                {activePanelMode === "estimated" ? (
                  <EstimatedQuickPanel
                    minutes={item.estimatedMinutes}
                    onClose={closeQuickPanel}
                    onSave={(minutes) => onSetEstimatedMinutes?.(item.id, minutes)}
                  />
                ) : null}
                {activePanelMode === "actual" ? (
                  <ActualQuickPanel
                    onClose={closeQuickPanel}
                    onOpenManual={onOpenActualTime ? () => onOpenActualTime(item.id) : undefined}
                    onSave={(seconds) => onSetActualSeconds?.(item.id, seconds)}
                    seconds={item.actualSeconds}
                  />
                ) : null}
                {activePanelMode === "energy" ? (
                  <EnergyQuickPanel
                    energy={item.energy}
                    onClose={closeQuickPanel}
                    onSave={(energy) => onSetEnergy?.(item.id, energy)}
                  />
                ) : null}
                {activePanelMode === "link" ? (
                  <LinkQuickPanel
                    label={item.linkLabel}
                    onClose={closeQuickPanel}
                    onSave={(nextLink) => onSetLink?.(item.id, nextLink)}
                    url={item.linkUrl}
                  />
                ) : null}
                {activePanelMode === "notes" ? (
                  <NotesQuickPanel
                    notes={item.notes}
                    onClose={closeQuickPanel}
                    onSave={(notes) => onSetNotes?.(item.id, notes)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
        </>
      )}
    </section>
  );
}

function MetadataChipButton({
  active = false,
  children,
  onClick,
  tone = "default",
  toneClassName,
}: {
  active?: boolean;
  children: ReactNode;
  onClick: () => void;
  tone?: "default" | "tag";
  toneClassName?: string;
}) {
  const resolvedToneClassName = toneClassName ?? (tone === "tag" ? TASK_TABLE_TAG_CHIP_CLASS : TASK_TABLE_LIST_CHIP_CLASS);

  return (
    <TaskTableChipButton
      aria-pressed={active}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={active ? ACTIVE_CHIP_RING_CLASS : undefined}
      toneClassName={resolvedToneClassName}
    >
      {children}
    </TaskTableChipButton>
  );
}

function QuickPanelShell({
  children,
  onClose,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className={QUICK_PANEL_SHELL_CLASS} onClick={(event) => event.stopPropagation()}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d82b6] dark:text-white/45">
          {title}
        </p>
        <TaskTableChipButton onClick={onClose}>Close</TaskTableChipButton>
      </div>
      {children}
    </div>
  );
}

function QuickChipOption({
  active = false,
  activeToneClassName = TASK_TABLE_ACTIVE_LIST_CHIP_CLASS,
  children,
  onClick,
}: {
  active?: boolean;
  activeToneClassName?: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <TaskTableChipButton
      onClick={onClick}
      toneClassName={active ? activeToneClassName : TASK_TABLE_INACTIVE_CHIP_CLASS}
    >
      {children}
    </TaskTableChipButton>
  );
}

function TagsQuickPanel({
  allTagOptions,
  onClose,
  onSave,
  tags,
}: {
  allTagOptions: string[];
  onClose: () => void;
  onSave: (tags: string[]) => void;
  tags: string[];
}) {
  const [tagDraft, setTagDraft] = useState("");
  const normalizedSelectedTags = new Set(tags.map((tag) => tag.toLocaleLowerCase()));
  const availableTagPool = allTagOptions
    .filter((tag) => !normalizedSelectedTags.has(tag.toLocaleLowerCase()))
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));

  const addTag = () => {
    const normalized = tagDraft.trim().replace(/^#+/, "");
    if (!normalized) {
      return;
    }
    if (tags.some((tag) => tag.localeCompare(normalized, undefined, { sensitivity: "base" }) === 0)) {
      setTagDraft("");
      return;
    }
    onSave([...tags, normalized]);
    setTagDraft("");
  };

  return (
    <QuickPanelShell onClose={onClose} title="Tags">
      <div className="space-y-3">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#938ab8] dark:text-white/45">
            On this task
          </p>
          <div className="flex flex-wrap gap-2">
            {tags.length > 0 ? tags.map((tag) => (
              <TaskTableChipButton
                key={tag}
                onClick={() => onSave(tags.filter((entry) => entry !== tag))}
                toneClassName={TASK_TABLE_TAG_CHIP_CLASS}
              >
                #{tag}
                <X className="ml-1 h-3.5 w-3.5" />
              </TaskTableChipButton>
            )) : (
              <span className="text-sm text-[#7d7597] dark:text-white/55">No tags on this task yet.</span>
            )}
          </div>
        </div>
        {availableTagPool.length > 0 ? (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#938ab8] dark:text-white/45">
              Saved tags
            </p>
            <div className="flex flex-wrap gap-2">
              {availableTagPool.map((tag) => (
                <TaskTableChipButton
                  key={`pool-${tag}`}
                  onClick={() => onSave([...tags, tag])}
                  toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}
                >
                  #{tag}
                </TaskTableChipButton>
              ))}
            </div>
          </div>
        ) : null}
        {tags.length === 0 && availableTagPool.length === 0 ? (
          <span className="text-sm text-[#7d7597] dark:text-white/55">No saved tags yet.</span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          className={`${QUICK_PANEL_TEXT_INPUT_CLASS} flex-1`}
          onChange={(event) => setTagDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTag();
            }
          }}
          placeholder="Add a tag"
          value={tagDraft}
        />
        <TaskTableChipButton onClick={addTag} toneClassName={QUICK_PANEL_PRIMARY_CHIP_CLASS}>Add tag</TaskTableChipButton>
      </div>
    </QuickPanelShell>
  );
}

function DueQuickPanel({
  dueOn,
  dueTime,
  onClose,
  onSave,
}: {
  dueOn: string | null;
  dueTime: string | null;
  onClose: () => void;
  onSave: (next: { dueOn: string; dueTime: string }) => void;
}) {
  const [dateDraft, setDateDraft] = useState(dueOn ?? "");
  const [timeDraft, setTimeDraft] = useState(dueTime ?? "");
  const today = todayISO();

  return (
    <QuickPanelShell onClose={onClose} title="Due Date">
      <div className="flex flex-wrap gap-2">
        <QuickChipOption active={dateDraft === ""} onClick={() => { setDateDraft(""); setTimeDraft(""); }}>
          No date
        </QuickChipOption>
        <QuickChipOption active={dateDraft === today} onClick={() => setDateDraft(today)}>
          Today
        </QuickChipOption>
        <QuickChipOption active={dateDraft === shiftIsoDate(today, 1)} onClick={() => setDateDraft(shiftIsoDate(today, 1))}>
          Tomorrow
        </QuickChipOption>
        <QuickChipOption active={dateDraft === shiftIsoDate(today, 7)} onClick={() => setDateDraft(shiftIsoDate(today, 7))}>
          In 7 days
        </QuickChipOption>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
        <input
          className={QUICK_PANEL_TEXT_INPUT_CLASS}
          onChange={(event) => setDateDraft(event.target.value)}
          type="date"
          value={dateDraft}
        />
        <input
          className={QUICK_PANEL_TEXT_INPUT_CLASS}
          onChange={(event) => setTimeDraft(event.target.value)}
          type="time"
          value={timeDraft}
        />
        <TaskTableChipButton onClick={() => onSave({ dueOn: dateDraft, dueTime: timeDraft })} toneClassName={QUICK_PANEL_PRIMARY_CHIP_CLASS}>Apply</TaskTableChipButton>
      </div>
    </QuickPanelShell>
  );
}

function DelayQuickPanel({
  dueOn,
  onClose,
  onSave,
  todayDateKey,
}: {
  dueOn: string | null;
  onClose: () => void;
  onSave: (nextDueOn: string) => Promise<boolean> | boolean;
  todayDateKey: string;
}) {
  const anchorDateKey = getDelayAnchorDate(dueOn, todayDateKey);

  return (
    <QuickPanelShell onClose={onClose} title="Delay Task">
      <TaskDelayPicker
        anchorDateKey={anchorDateKey}
        description="Move this due date forward and keep the task visibly Delayed until that new date arrives."
        inputClassName={QUICK_PANEL_TEXT_INPUT_CLASS}
        onCancel={onClose}
        onSave={async (nextDueOn) => {
          const didSave = await onSave(nextDueOn);
          if (didSave !== false) {
            onClose();
          }
          return didSave;
        }}
        primaryToneClassName={QUICK_PANEL_PRIMARY_CHIP_CLASS}
        saveLabel="Apply delay"
      />
    </QuickPanelShell>
  );
}

function PriorityQuickPanel({
  activePriorities,
  onClose,
  onSave,
}: {
  activePriorities: Array<"focus" | "important" | "urgent">;
  onClose: () => void;
  onSave: (priorities: Array<"focus" | "important" | "urgent">) => void;
}) {
  const togglePriority = (value: "focus" | "important" | "urgent") => {
    const nextPriorities = activePriorities.includes(value)
      ? activePriorities.filter((entry) => entry !== value)
      : [...activePriorities, value];
    onSave(nextPriorities);
  };

  return (
    <QuickPanelShell onClose={onClose} title="Priority">
      <div className="flex flex-wrap gap-2">
        {PRIORITY_OPTIONS.map((option) => (
          <TaskTableChipButton
            key={option.value}
            onClick={() => togglePriority(option.value)}
            toneClassName={`${priorityTone(option.value)}${activePriorities.includes(option.value) ? ` ${ACTIVE_CHIP_RING_CLASS}` : ""}`}
          >
            {option.label}
          </TaskTableChipButton>
        ))}
        <TaskTableChipButton
          onClick={() => onSave([])}
          toneClassName={activePriorities.length === 0 ? TASK_TABLE_ACTIVE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}
        >
          Clear all
        </TaskTableChipButton>
      </div>
    </QuickPanelShell>
  );
}

function RepeatQuickPanel({
  onClose,
  onSave,
  repeatDayOfMonth,
  repeatDaysOfWeek,
  repeatFrequency,
  repeatInterval,
  repeatMonthlyMode,
  repeatMonthlyOrdinal,
  repeatMonthlyWeekday,
}: {
  onClose: () => void;
  onSave: (repeat: PrototypeTaskRow["repeat"], cadence?: Pick<PrototypeTaskRow, "repeatDayOfMonth" | "repeatDaysOfWeek" | "repeatInterval" | "repeatMonthlyMode" | "repeatMonthlyOrdinal" | "repeatMonthlyWeekday">) => void;
  repeatDayOfMonth: number | null;
  repeatDaysOfWeek: number[];
  repeatFrequency: PrototypeTaskRow["repeat"];
  repeatInterval: number;
  repeatMonthlyMode: TaskRepeatMonthlyMode;
  repeatMonthlyOrdinal: TaskRepeatMonthlyOrdinal | null;
  repeatMonthlyWeekday: number | null;
}) {
  const [intervalDraft, setIntervalDraft] = useState(String(Math.max(1, repeatInterval)));
  const [dayOfMonthDraft, setDayOfMonthDraft] = useState(repeatDayOfMonth ? String(repeatDayOfMonth) : "");
  const [monthlyMode, setMonthlyMode] = useState<TaskRepeatMonthlyMode>(repeatMonthlyMode);
  const [monthlyOrdinal, setMonthlyOrdinal] = useState<TaskRepeatMonthlyOrdinal | null>(repeatMonthlyOrdinal);
  const [monthlyWeekday, setMonthlyWeekday] = useState<number | null>(repeatMonthlyWeekday);
  const isWeekdaysPresetSelected = isWeekdaysRepeatSelection(repeatFrequency, repeatDaysOfWeek, Math.max(1, repeatInterval));

  useEffect(() => {
    setIntervalDraft(String(Math.max(1, repeatInterval)));
    setDayOfMonthDraft(repeatDayOfMonth ? String(repeatDayOfMonth) : "");
    setMonthlyMode(repeatMonthlyMode);
    setMonthlyOrdinal(repeatMonthlyOrdinal);
    setMonthlyWeekday(repeatMonthlyWeekday);
  }, [repeatDayOfMonth, repeatInterval, repeatMonthlyMode, repeatMonthlyOrdinal, repeatMonthlyWeekday]);

  const applyCadence = (
    nextRepeat: PrototypeTaskRow["repeat"],
    nextDays = repeatDaysOfWeek,
    nextDayOfMonth = repeatDayOfMonth,
    nextMonthlyMode = monthlyMode,
    nextMonthlyOrdinal = monthlyOrdinal,
    nextMonthlyWeekday = monthlyWeekday,
  ) => {
    const parsedInterval = Number.parseInt(intervalDraft, 10);
    const parsedDayOfMonth = Number.parseInt(dayOfMonthDraft, 10);
    const resolvedMonthlyMode = nextRepeat === "monthly" ? nextMonthlyMode : "day_of_month";
    const resolvedMonthlyOrdinal = nextRepeat === "monthly" && resolvedMonthlyMode === "ordinal_weekday"
      ? nextMonthlyOrdinal ?? "first"
      : null;
    const resolvedMonthlyWeekday = nextRepeat === "monthly" && resolvedMonthlyMode === "ordinal_weekday"
      ? nextMonthlyWeekday ?? 1
      : null;
    onSave(nextRepeat, {
      repeatDayOfMonth: nextRepeat === "monthly" && resolvedMonthlyMode === "day_of_month"
        ? (Number.isFinite(parsedDayOfMonth) && parsedDayOfMonth >= 1 && parsedDayOfMonth <= 31 ? parsedDayOfMonth : nextDayOfMonth ?? null)
        : null,
      repeatDaysOfWeek: nextRepeat === "weekly" || nextRepeat === "custom" ? nextDays : [],
      repeatInterval: Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval : 1,
      repeatMonthlyMode: resolvedMonthlyMode,
      repeatMonthlyOrdinal: resolvedMonthlyOrdinal,
      repeatMonthlyWeekday: resolvedMonthlyWeekday,
    });
  };

  const applyWeekdaysPreset = () => {
    setIntervalDraft("1");
    onSave("weekly", {
      repeatDayOfMonth: repeatDayOfMonth ?? null,
      repeatDaysOfWeek: [...WEEKDAYS_REPEAT_DAYS],
      repeatInterval: 1,
      repeatMonthlyMode: "day_of_month",
      repeatMonthlyOrdinal: null,
      repeatMonthlyWeekday: null,
    });
  };

  return (
    <QuickPanelShell onClose={onClose} title="Repeat">
      <div className="flex flex-wrap gap-2">
        {REPEAT_OPTIONS.map((option) => (
          <QuickChipOption
            active={repeatFrequency === option.value}
            activeToneClassName={repeatTone(option.value)}
            key={option.value}
            onClick={() => applyCadence(option.value)}
          >
            {option.label}
          </QuickChipOption>
        ))}
        <QuickChipOption
          active={isWeekdaysPresetSelected}
          activeToneClassName={repeatTone("weekly")}
          onClick={applyWeekdaysPreset}
        >
          Weekdays
        </QuickChipOption>
      </div>
      {repeatFrequency !== "none" ? (
        <div className="mt-3 space-y-2">
          <CompactRepeatCadenceControls
            activeToneClassName={QUICK_PANEL_PRIMARY_CHIP_CLASS}
            dayInputProps={{
              inputMode: "numeric",
              max: 31,
              min: 1,
              onBlur: () => applyCadence(repeatFrequency, repeatDaysOfWeek, null),
              onChange: (event) => setDayOfMonthDraft(event.target.value.replace(/[^\d]/g, "").slice(0, 2)),
              type: "text",
              value: dayOfMonthDraft,
            }}
            inactiveToneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}
            intervalInputProps={{
              inputMode: "numeric",
              min: 1,
              onBlur: () => applyCadence(repeatFrequency),
              onChange: (event) => setIntervalDraft(event.target.value.replace(/[^\d]/g, "")),
              type: "text",
              value: intervalDraft,
            }}
            monthlyMode={monthlyMode}
            monthlyModeOptions={REPEAT_MONTHLY_MODE_OPTIONS}
            monthlyOrdinal={monthlyOrdinal}
            monthlyOrdinalOptions={REPEAT_MONTHLY_ORDINAL_OPTIONS}
            monthlyWeekday={monthlyWeekday}
            onMonthlyModeClick={(value) => {
              const nextOrdinal = value === "ordinal_weekday" ? (monthlyOrdinal ?? "first") : null;
              const nextWeekday = value === "ordinal_weekday" ? (monthlyWeekday ?? 1) : null;
              setMonthlyMode(value);
              setMonthlyOrdinal(nextOrdinal);
              setMonthlyWeekday(nextWeekday);
              applyCadence(repeatFrequency, repeatDaysOfWeek, repeatDayOfMonth, value, nextOrdinal, nextWeekday);
            }}
            onMonthlyOrdinalClick={(value) => {
              const nextWeekday = monthlyWeekday ?? 1;
              setMonthlyMode("ordinal_weekday");
              setMonthlyOrdinal(value);
              setMonthlyWeekday(nextWeekday);
              applyCadence(repeatFrequency, repeatDaysOfWeek, repeatDayOfMonth, "ordinal_weekday", value, nextWeekday);
            }}
            onMonthlyWeekdayClick={(value) => {
              const nextOrdinal = monthlyOrdinal ?? "first";
              setMonthlyMode("ordinal_weekday");
              setMonthlyOrdinal(nextOrdinal);
              setMonthlyWeekday(value);
              applyCadence(repeatFrequency, repeatDaysOfWeek, repeatDayOfMonth, "ordinal_weekday", nextOrdinal, value);
            }}
            onRepeatUnitClick={(repeatUnit) => applyCadence(repeatUnit)}
            onWeekdayClick={(weekday) => {
              const nextDays = repeatDaysOfWeek.includes(weekday)
                ? repeatDaysOfWeek.filter((entry) => entry !== weekday)
                : [...repeatDaysOfWeek, weekday].sort((left, right) => left - right);
              applyCadence(repeatFrequency, nextDays);
            }}
            repeat={repeatFrequency}
            repeatDaysOfWeek={repeatDaysOfWeek}
            repeatUnits={COMPACT_REPEAT_UNITS}
            showInterval
            showMonthDay={repeatFrequency === "monthly" && monthlyMode !== "ordinal_weekday"}
            showMonthlyMode={repeatFrequency === "monthly"}
            showMonthlyOrdinals={repeatFrequency === "monthly" && monthlyMode === "ordinal_weekday"}
            showMonthlyWeekdays={repeatFrequency === "monthly" && monthlyMode === "ordinal_weekday"}
            showWeekdays={repeatFrequency === "weekly" || repeatFrequency === "custom"}
            weekdayOptions={repeatFrequency === "monthly" && monthlyMode === "ordinal_weekday" ? REPEAT_MONTHLY_WEEKDAY_OPTIONS : REPEAT_WEEKDAY_OPTIONS}
          />
        </div>
      ) : null}
    </QuickPanelShell>
  );
}

function ListQuickPanel({
  listDefinitions,
  listMemberships,
  onClose,
  onToggleList,
}: {
  listDefinitions: TaskListDefinition[];
  listMemberships: Array<{ id: string; isManual: boolean }>;
  onClose: () => void;
  onToggleList: (listId: string) => void;
}) {
  const activeListIds = new Set(listMemberships.map((membership) => membership.id));

  return (
    <QuickPanelShell onClose={onClose} title="Lists">
      <div className="flex flex-wrap gap-2">
        {listDefinitions.map((definition) => (
          <QuickChipOption
            active={activeListIds.has(definition.id)}
            activeToneClassName={TASK_TABLE_LIST_CHIP_CLASS}
            key={definition.id}
            onClick={() => onToggleList(definition.id)}
          >
            {definition.name}
          </QuickChipOption>
        ))}
      </div>
    </QuickPanelShell>
  );
}

function EstimatedQuickPanel({
  minutes,
  onClose,
  onSave,
}: {
  minutes: number | null;
  onClose: () => void;
  onSave: (minutes: number | null) => void;
}) {
  const [draft, setDraft] = useState(minutes ? String(minutes) : "");

  const saveDraft = () => {
    const parsed = Number.parseInt(draft, 10);
    onSave(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
  };

  return (
    <QuickPanelShell onClose={onClose} title="Estimated Time">
      <div className="flex flex-wrap gap-2">
        {[5, 10, 15, 20, 30, 45, 60].map((option) => (
          <QuickChipOption active={minutes === option} key={option} onClick={() => onSave(option)}>
            {formatListDuration(option)}
          </QuickChipOption>
        ))}
        <QuickChipOption active={!minutes} onClick={() => onSave(null)}>
          Clear
        </QuickChipOption>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          className={`${QUICK_PANEL_TEXT_INPUT_CLASS} flex-1`}
          min={0}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              saveDraft();
            }
          }}
          placeholder="Minutes"
          type="number"
          value={draft}
        />
        <TaskTableChipButton onClick={saveDraft} toneClassName={QUICK_PANEL_PRIMARY_CHIP_CLASS}>Save</TaskTableChipButton>
      </div>
    </QuickPanelShell>
  );
}

function ActualQuickPanel({
  seconds,
  onClose,
  onOpenManual,
  onSave,
}: {
  seconds: number;
  onClose: () => void;
  onOpenManual?: () => void;
  onSave?: (seconds: number) => void;
}) {
  const [draft, setDraft] = useState(seconds > 0 ? String(Math.round(seconds / 60)) : "");

  const saveDraft = () => {
    const parsed = Number.parseInt(draft, 10);
    onSave?.(Number.isFinite(parsed) && parsed > 0 ? parsed * 60 : 0);
  };

  return (
    <QuickPanelShell onClose={onClose} title="Actual Time">
      <p className="mb-3 text-sm text-[#7d7597] dark:text-white/55">Current time: {formatListActual(seconds)}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className={`${QUICK_PANEL_TEXT_INPUT_CLASS} flex-1`}
          min={0}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              saveDraft();
            }
          }}
          placeholder="Minutes"
          type="number"
          value={draft}
        />
        <TaskTableChipButton onClick={saveDraft} toneClassName={QUICK_PANEL_PRIMARY_CHIP_CLASS}>Save</TaskTableChipButton>
        {onOpenManual ? <TaskTableChipButton onClick={onOpenManual} toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}>Manual entry</TaskTableChipButton> : null}
      </div>
    </QuickPanelShell>
  );
}

function EnergyQuickPanel({
  energy,
  onClose,
  onSave,
}: {
  energy: PrototypeTaskRow["energy"];
  onClose: () => void;
  onSave: (energy: PrototypeTaskRow["energy"]) => void;
}) {
  const options: PrototypeTaskRow["energy"][] = ["none", "low", "medium", "high"];
  return (
    <QuickPanelShell onClose={onClose} title="Energy">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <QuickChipOption active={energy === option} activeToneClassName={energyTone(option)} key={option} onClick={() => onSave(option)}>
            {formatEnergyChipLabel(option)}
          </QuickChipOption>
        ))}
      </div>
    </QuickPanelShell>
  );
}

function LinkQuickPanel({
  label,
  onClose,
  onSave,
  url,
}: {
  label: string;
  onClose: () => void;
  onSave: (nextLink: { label: string; url: string }) => void;
  url: string;
}) {
  const [labelDraft, setLabelDraft] = useState(label);
  const [urlDraft, setUrlDraft] = useState(url);

  return (
    <QuickPanelShell onClose={onClose} title="Link">
      <div className="grid gap-2">
        <input className={QUICK_PANEL_TEXT_INPUT_CLASS} onChange={(event) => setLabelDraft(event.target.value)} placeholder="Label" value={labelDraft} />
        <input className={QUICK_PANEL_TEXT_INPUT_CLASS} onChange={(event) => setUrlDraft(event.target.value)} placeholder="https://..." value={urlDraft} />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <TaskTableChipButton onClick={() => onSave({ label: "", url: "" })} toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}>Clear link</TaskTableChipButton>
        <TaskTableChipButton onClick={() => onSave({ label: labelDraft.trim(), url: urlDraft.trim() })} toneClassName={QUICK_PANEL_PRIMARY_CHIP_CLASS}>Save link</TaskTableChipButton>
      </div>
    </QuickPanelShell>
  );
}

function NotesQuickPanel({
  notes,
  onClose,
  onSave,
}: {
  notes: string;
  onClose: () => void;
  onSave: (notes: string) => void;
}) {
  const [draft, setDraft] = useState(notes);
  return (
    <QuickPanelShell onClose={onClose} title="Notes">
      <textarea
        className={`${QUICK_PANEL_TEXT_INPUT_CLASS} min-h-[7rem] w-full resize-none py-3`}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Add notes"
        value={draft}
      />
      <div className="mt-3 flex justify-end gap-2">
        <TaskTableChipButton onClick={() => onSave("")} toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}>Clear notes</TaskTableChipButton>
        <TaskTableChipButton onClick={() => onSave(draft)} toneClassName={QUICK_PANEL_PRIMARY_CHIP_CLASS}>Save notes</TaskTableChipButton>
      </div>
    </QuickPanelShell>
  );
}

function TasksSimpleList({
  currentListLabel,
  filterRowsNode,
  panelProps,
  selectedBucket,
  tableProps,
}: TasksListAdapterProps) {
  const [rowContextMenu, setRowContextMenu] = useState<RowContextMenuState | null>(null);
  const [activeQuickPanel, setActiveQuickPanel] = useState<{ mode: ListQuickPanelMode; taskId: string } | null>(null);
  const [editingTaskTitleId, setEditingTaskTitleId] = useState<string | null>(null);
  const [collapsedStepSectionsByTaskId, setCollapsedStepSectionsByTaskId] = useState<Record<string, boolean>>({});
  const [parentStepDraftTaskId, setParentStepDraftTaskId] = useState<string | null>(null);
  const [parentStepTitleDrafts, setParentStepTitleDrafts] = useState<Record<string, string>>({});
  const [parentStepCreationErrors, setParentStepCreationErrors] = useState<Record<string, string | null>>({});
  const [taskTitleDrafts, setTaskTitleDrafts] = useState<Record<string, string>>({});
  const listShellRef = useRef<HTMLDivElement | null>(null);
  const pendingMeasuredStatusScrollAnchorRef = useRef<MeasuredStatusScrollAnchor | null>(null);
  const parentStepDraftInputRef = useRef<HTMLInputElement | null>(null);
  const lastBuildTaskTableRowCountRef = useRef(snapshotBuildTaskTableRowDebugCount());
  const tasks = tableProps.tasks;
  const rowContext = tableProps.rowContext;
  const visibleTaskIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
  const buildListStatusScrollAnchorTaskIds = (taskId: string) => {
    const taskIndex = visibleTaskIds.indexOf(taskId);
    if (taskIndex < 0) {
      return [taskId];
    }

    return [
      ...visibleTaskIds.slice(taskIndex + 1),
      ...visibleTaskIds.slice(0, taskIndex).reverse(),
      taskId,
    ];
  };
  const queueMeasuredListStatusScrollAnchor = (taskId: string) => {
    const shellElement = listShellRef.current;
    const candidateTaskIds = buildListStatusScrollAnchorTaskIds(taskId);
    if (!shellElement) {
      pendingMeasuredStatusScrollAnchorRef.current = null;
      return candidateTaskIds;
    }

    for (const candidateTaskId of candidateTaskIds) {
      const target = shellElement.querySelector<HTMLElement>(`[data-task-list-row="${candidateTaskId}"], [data-same-table-step-row="${candidateTaskId}"]`);
      if (!target) {
        continue;
      }
      const scrollContainer = findNearestScrollableContainer(target, shellElement);
      if (!scrollContainer) {
        continue;
      }
      const containerRect = scrollContainer.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      pendingMeasuredStatusScrollAnchorRef.current = {
        anchorOffsetTop: targetRect.top - containerRect.top,
        candidateTaskIds,
        sourceTaskId: taskId,
      };
      return candidateTaskIds;
    }

    pendingMeasuredStatusScrollAnchorRef.current = null;
    return candidateTaskIds;
  };
  const selectedTaskIdSet = useMemo(() => new Set(tableProps.selectedTaskIds), [tableProps.selectedTaskIds]);
  const highlightedTaskIdSet = useMemo(() => new Set(tableProps.highlightedTaskIds ?? []), [tableProps.highlightedTaskIds]);
  const searchMatchedStepParentTaskIdSet = useMemo(
    () => new Set(tableProps.searchMatchedStepParentTaskIds ?? []),
    [tableProps.searchMatchedStepParentTaskIds],
  );
  const taskById = useMemo(
    () => new Map([...(tableProps.allTasks ?? tasks), ...tasks].map((task) => [task.id, task])),
    [tableProps.allTasks, tasks],
  );
  const overlayRows = useMemo(
    () => tasks.map((task) => buildTaskTableRow(task, {
      focusedTaskIdSet: tableProps.rowContext.focusedTaskIdSet,
      linkedNotes: tableProps.rowContext.linkedNotesByTaskId[task.id] ?? [],
      listDefinitions: tableProps.rowContext.listDefinitions,
      listMemberships: tableProps.rowContext.listMembershipsByTaskId[task.id] ?? [],
      subtasks: tableProps.rowContext.subtasksByTaskId[task.id] ?? [],
      taskHistory: tableProps.rowContext.taskHistoryByTaskId[task.id] ?? [],
      todayDateKey: tableProps.rowContext.todayDateKey,
    })),
    [tableProps.rowContext, tasks],
  );
  const requestedOpenTaskRow = useMemo(
    () => tableProps.requestedOpenTask
      ? buildTaskTableRow(tableProps.requestedOpenTask, {
        focusedTaskIdSet: tableProps.rowContext.focusedTaskIdSet,
        linkedNotes: tableProps.rowContext.linkedNotesByTaskId[tableProps.requestedOpenTask.id] ?? [],
        listDefinitions: tableProps.rowContext.listDefinitions,
        listMemberships: tableProps.rowContext.listMembershipsByTaskId[tableProps.requestedOpenTask.id] ?? [],
        subtasks: tableProps.rowContext.subtasksByTaskId[tableProps.requestedOpenTask.id] ?? [],
        taskHistory: tableProps.rowContext.taskHistoryByTaskId[tableProps.requestedOpenTask.id] ?? [],
        todayDateKey: tableProps.rowContext.todayDateKey,
      })
      : null,
    [tableProps.requestedOpenTask, tableProps.rowContext],
  );
  useEffect(() => {
    if (!isDevelopment) {
      return;
    }

    const nextCount = snapshotBuildTaskTableRowDebugCount();
    const delta = nextCount - lastBuildTaskTableRowCountRef.current;
    lastBuildTaskTableRowCountRef.current = nextCount;
    const message = `[tasks:list-switch] list row builds committed count=${delta} tasks=${tasks.length} overlayRows=${overlayRows.length} requestedOpenTask=${requestedOpenTaskRow ? 1 : 0}`;
    console.info(message);
    if (typeof window !== "undefined") {
      window.__ADHDICE_TASK_LIST_SWITCH_LOGS__ ??= [];
      window.__ADHDICE_TASK_LIST_SWITCH_LOGS__.push(message);
    }
  });
  const closeQuickPanel = () => setActiveQuickPanel(null);
  const openQuickPanel = (taskId: string, mode: ListQuickPanelMode) => {
    setRowContextMenu(null);
    setActiveQuickPanel((current) => current?.taskId === taskId && current.mode === mode ? null : { mode, taskId });
  };
  const rowContextMenuTask = useMemo(
    () => rowContextMenu ? tasks.find((task) => task.id === rowContextMenu.taskId) ?? null : null,
    [rowContextMenu, tasks],
  );
  useEffect(() => {
    if (parentStepDraftTaskId) {
      parentStepDraftInputRef.current?.focus();
    }
  }, [parentStepDraftTaskId]);

  useEffect(() => {
    if (!tableProps.statusChangeScrollAnchorTaskIds?.length || tableProps.statusChangeScrollToken == null) {
      return;
    }

    const shellElement = listShellRef.current;
    if (!shellElement) {
      return;
    }

    const pendingAnchor = pendingMeasuredStatusScrollAnchorRef.current;
    const matchesPendingAnchor = pendingAnchor
      && pendingAnchor.sourceTaskId === tableProps.statusChangeScrollSourceTaskId
      && pendingAnchor.candidateTaskIds.length === tableProps.statusChangeScrollAnchorTaskIds.length
      && pendingAnchor.candidateTaskIds.every((taskId, index) => taskId === tableProps.statusChangeScrollAnchorTaskIds?.[index]);
    if (!matchesPendingAnchor) {
      return;
    }
    const confirmedPendingAnchor = pendingAnchor;

    const previousVisibleTaskIds = tableProps.statusChangeScrollPreviousVisibleTaskIds ?? [];
    const sourceTaskId = tableProps.statusChangeScrollSourceTaskId;
    const hasRowsSettled = previousVisibleTaskIds.join("|") !== visibleTaskIds.join("|")
      || (sourceTaskId ? !visibleTaskIds.includes(sourceTaskId) : false);

    let frameId = 0;
    let attemptCount = 0;
    const revealTarget = () => {
      attemptCount += 1;
      if (!hasRowsSettled && attemptCount < 6) {
        frameId = window.requestAnimationFrame(revealTarget);
        return;
      }

      for (const candidateTaskId of confirmedPendingAnchor.candidateTaskIds) {
        const target = shellElement.querySelector<HTMLElement>(`[data-task-list-row="${candidateTaskId}"], [data-same-table-step-row="${candidateTaskId}"]`);
        if (!target) {
          continue;
        }
        const scrollContainer = findNearestScrollableContainer(target, shellElement);
        if (!scrollContainer) {
          continue;
        }
        const containerRect = scrollContainer.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        scrollContainer.scrollTop += (targetRect.top - containerRect.top) - confirmedPendingAnchor.anchorOffsetTop;
        pendingMeasuredStatusScrollAnchorRef.current = null;
        return;
      }

      pendingMeasuredStatusScrollAnchorRef.current = null;
    };

    frameId = window.requestAnimationFrame(revealTarget);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [
    tableProps.statusChangeScrollAnchorTaskIds,
    tableProps.statusChangeScrollPreviousVisibleTaskIds,
    tableProps.statusChangeScrollSourceTaskId,
    tableProps.statusChangeScrollToken,
    visibleTaskIds,
  ]);

  useEffect(() => {
    if (!tableProps.highlightedActiveTaskId || tableProps.highlightedScrollToken == null) {
      return;
    }

    const parentTaskWithMatch = tasks.find((task) => {
      const group = tableProps.childTaskPreviewByParentTaskId?.[task.id];
      return group ? Boolean(findPreviewAncestorIdsForTask(group, tableProps.highlightedActiveTaskId ?? "")) : false;
    });
    if (!parentTaskWithMatch) {
      return;
    }

    setCollapsedStepSectionsByTaskId((current) => (
      current[parentTaskWithMatch.id] === false
        ? current
        : { ...current, [parentTaskWithMatch.id]: false }
    ));
  }, [tableProps.childTaskPreviewByParentTaskId, tableProps.highlightedActiveTaskId, tableProps.highlightedScrollToken, tasks]);

  useEffect(() => {
    if (!tableProps.highlightedActiveTaskId || tableProps.highlightedScrollToken == null) {
      return;
    }

    const shellElement = listShellRef.current;
    if (!shellElement) {
      return;
    }

    const selector = `[data-task-list-row="${tableProps.highlightedActiveTaskId}"], [data-same-table-step-row="${tableProps.highlightedActiveTaskId}"]`;
    let secondFrameId = 0;
    const revealTarget = () => {
      const target = shellElement.querySelector<HTMLElement>(selector);
      target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };

    const firstFrameId = window.requestAnimationFrame(() => {
      revealTarget();
      secondFrameId = window.requestAnimationFrame(revealTarget);
    });

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      window.cancelAnimationFrame(secondFrameId);
    };
  }, [tableProps.highlightedActiveTaskId, tableProps.highlightedScrollToken]);

  function openRowContextMenu(taskId: string, clientX: number, clientY: number) {
    const nextMenu = buildTaskRowContextMenuState(listShellRef.current, taskId, clientX, clientY);
    if (!nextMenu) {
      return false;
    }

    setRowContextMenu(nextMenu);
    return true;
  }

  async function commitParentStepDraft(parentTaskId: string) {
    const nextTitle = parentStepTitleDrafts[parentTaskId]?.trim() ?? "";
    if (!nextTitle) {
      setParentStepCreationErrors((current) => ({
        ...current,
        [parentTaskId]: "Step title can't be empty.",
      }));
      parentStepDraftInputRef.current?.focus();
      return;
    }
    if (!tableProps.onCreateChildTask) {
      setParentStepCreationErrors((current) => ({
        ...current,
        [parentTaskId]: "Step creation is unavailable for this task.",
      }));
      return;
    }
    const result = await tableProps.onCreateChildTask(parentTaskId, nextTitle);
    if (result?.error) {
      setParentStepCreationErrors((current) => ({
        ...current,
        [parentTaskId]: result.error,
      }));
      parentStepDraftInputRef.current?.focus();
      return;
    }
    setParentStepTitleDrafts((current) => ({ ...current, [parentTaskId]: "" }));
    setParentStepCreationErrors((current) => ({ ...current, [parentTaskId]: null }));
    setParentStepDraftTaskId((current) => (current === parentTaskId ? null : current));
  }

  if (tasks.length === 0) {
    return (
      <TasksListViewPanel
        {...panelProps}
        filterRowsNode={filterRowsNode}
        agentPlanNode={(
          <div className="rounded-[1.4rem] border border-dashed border-[#ddd6f9] bg-[#faf8ff] px-4 py-10 text-center text-sm text-[#7b84a0] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55">
            No tasks match this view right now.
          </div>
        )}
      />
    );
  }

  return (
    <TasksListViewPanel
      {...panelProps}
      filterRowsNode={filterRowsNode}
      agentPlanNode={(
        <div className="relative space-y-3" ref={listShellRef}>
          {tableProps.requestedOpenTaskId ? (
            <TaskManagementTableV2
              allowInlineInspector
              allListOptions={tableProps.allListOptions}
              allNoteOptions={tableProps.allNoteOptions?.map((note) => ({ id: note.id, title: note.title })) ?? []}
              allTagOptions={tableProps.allTagOptions}
              childTaskCreationBlockedTaskIds={tableProps.childTaskCreationBlockedTaskIds}
              childTaskPreviewByParentTaskId={tableProps.childTaskPreviewByParentTaskId}
              highlightedActiveTaskId={tableProps.highlightedActiveTaskId}
              highlightedScrollToken={tableProps.highlightedScrollToken}
              highlightedTaskIds={tableProps.highlightedTaskIds}
              className="m-0 max-w-none p-0"
              currentListLabel={tableProps.currentListLabel}
              enableInspector
              getFollowTaskDestination={tableProps.getFollowTaskDestination}
              onClearSelection={tableProps.onClearSelection}
              onCreateChildTask={tableProps.onCreateChildTask}
              onCreateTaskList={tableProps.onCreateTaskList}
              onDeleteTaskActualTimeEntry={tableProps.onDeleteTaskActualTimeEntry}
              onDismissDetachedTask={tableProps.onDismissDetachedTask}
              onDuplicateTask={tableProps.onDuplicateTask}
              onFollowDetachedTask={tableProps.onFollowDetachedTask}
              onNextTaskTimer={tableProps.onNextTaskTimer}
              onOpenBatchDelete={tableProps.onOpenBatchDelete}
              onOpenBatchEdit={tableProps.onOpenBatchEdit}
              onOpenDeleteTask={tableProps.onOpenDeleteTask}
              onOpenFocusTimer={tableProps.onOpenFocusTimer}
              onOpenNote={tableProps.onOpenNote}
              onOpenTaskActualTime={tableProps.onOpenTaskActualTime}
              onOpenTaskEditor={tableProps.onOpenTaskEditor}
              onOpenTaskHistory={tableProps.onOpenTaskHistory}
              onPauseTaskTimer={tableProps.onPauseTaskTimer}
              onPreviousTaskTimer={tableProps.onPreviousTaskTimer}
              onReorderChildTask={tableProps.onReorderChildTask}
              onInspectorClose={() => tableProps.onRequestedOpenTaskHandled?.(tableProps.requestedOpenTaskId ?? "")}
              onRestoreTask={tableProps.onRestoreTask}
              onResumeTaskTimer={tableProps.onResumeTaskTimer}
              onSelectAllVisible={tableProps.onSelectAllVisible}
              onStartTaskTimer={tableProps.onStartTaskTimer}
              onStopTaskTimer={tableProps.onStopTaskTimer}
              onTaskActualSecondsChange={tableProps.onSetActualSeconds}
              onTaskDueChange={tableProps.onSetDue}
              onTaskEnergyChange={tableProps.onSetEnergy}
              onTaskEstimatedMinutesChange={tableProps.onSetEstimatedMinutes}
              onTaskLinkChange={tableProps.onSetLink}
              onTaskLinkedNoteIdsChange={tableProps.onSetLinkedNoteIds}
              onTaskNotesChange={tableProps.onSetNotes}
              onTaskPriorityChange={tableProps.onSetPriority}
              onTaskRepeatChange={tableProps.onSetRepeat}
              onTaskStatusChange={(taskId, status) => {
                const expectedTask = tableProps.tasks.find((task) => task.id === taskId) ?? null;
                tableProps.onSetStatus?.(taskId, status, expectedTask, queueMeasuredListStatusScrollAnchor(taskId));
              }}
              onTaskSubtaskAdd={tableProps.onAddTaskSubtask}
              onTaskSubtaskAddChild={tableProps.onAddChildTaskSubtask}
              onTaskSubtaskDelete={tableProps.onDeleteTaskSubtask}
              onTaskSubtaskRename={tableProps.onRenameTaskSubtask}
              onTaskSubtasksAutoResetChange={tableProps.onSetTaskSubtasksAutoReset}
              onTaskSubtaskStatusChange={tableProps.onSetTaskSubtaskStatus}
              onTaskTagsChange={tableProps.onSetTags}
              onTaskTitleChange={tableProps.onSetTitle}
              onToggleTaskList={tableProps.onToggleTaskList}
              onToggleTaskSelection={tableProps.onToggleTaskSelection}
              overlayOnly
              requestedOpenTask={requestedOpenTaskRow}
              requestedOpenTaskId={tableProps.requestedOpenTaskId}
              rows={overlayRows}
              runningTaskTimers={tableProps.runningTaskTimers}
              selectedTaskIds={tableProps.selectedTaskIds}
              suppressDetachedNoticeTaskId={tableProps.suppressDetachedNoticeTaskId}
              taskActualTimeEntriesByTaskId={tableProps.taskActualTimeEntriesByTaskId}
              expandAllColumnsToken={panelProps.expandAllColumnsToken}
              shrinkAllColumnsToken={panelProps.shrinkAllColumnsToken}
              statusChangeScrollAnchorTaskIds={tableProps.statusChangeScrollAnchorTaskIds}
              statusChangeScrollPreviousVisibleTaskIds={tableProps.statusChangeScrollPreviousVisibleTaskIds}
              statusChangeScrollSourceTaskId={tableProps.statusChangeScrollSourceTaskId}
              statusChangeScrollToken={tableProps.statusChangeScrollToken}
              visibleColumns={["status_icon", "title"]}
            />
          ) : null}
          {tasks.map((task) => {
        const displayStatus = getTaskDisplayStatusWithHistory(
          task,
          rowContext.taskHistoryByTaskId[task.id] ?? [],
          rowContext.todayDateKey,
        );
        const dueLabel = formatDueLabel(task.due_on);
        const dueTimeLabel = formatDueTimeLabel(task.due_time);
        const dueMeta = dueTimeLabel ? `${dueLabel} · ${dueTimeLabel}` : dueLabel;
        const repeatSummary = formatRepeatSummary(task);
        const taskRow = buildTaskTableRow(task, {
          focusedTaskIdSet: rowContext.focusedTaskIdSet,
          linkedNotes: rowContext.linkedNotesByTaskId[task.id] ?? [],
          listDefinitions: rowContext.listDefinitions,
          listMemberships: rowContext.listMembershipsByTaskId[task.id] ?? [],
          subtasks: rowContext.subtasksByTaskId[task.id] ?? [],
          taskHistory: rowContext.taskHistoryByTaskId[task.id] ?? [],
          todayDateKey: rowContext.todayDateKey,
        });
        const categoryLabel = resolveTaskCategoryLabel({
          currentListLabel,
          listDefinitions: rowContext.listDefinitions,
          listMemberships: rowContext.listMembershipsByTaskId[task.id] ?? [],
          selectedBucket,
        });
        const activePriorities = buildTaskPrioritySelection(task, rowContext.focusedTaskIdSet);
        const visibleTags = (task.tags ?? []).slice(0, 3);
        const extraTagCount = Math.max(0, (task.tags ?? []).length - visibleTags.length);
        const isRenamingTaskTitle = editingTaskTitleId === task.id;
        const taskTitleDraft = taskTitleDrafts[task.id] ?? task.title;
        const commitTaskTitle = () => {
          const nextTitle = taskTitleDraft.trim();
          if (nextTitle && nextTitle !== task.title) {
            tableProps.onSetTitle?.(task.id, nextTitle);
          }
          setEditingTaskTitleId((current) => (current === task.id ? null : current));
        };
        const isOpenTask = isTaskOpen(task);
        const activePanelMode = activeQuickPanel?.taskId === task.id ? activeQuickPanel.mode : null;
        const isQuickPanelOpen = activePanelMode !== null;
        const panelTitle = task.title;
        const listMemberships = rowContext.listMembershipsByTaskId[task.id] ?? [];
        const stepPreviewGroup = tableProps.childTaskPreviewByParentTaskId?.[task.id];
        const effectiveStepPreviewGroup = stepPreviewGroup ?? (parentStepDraftTaskId === task.id
          ? {
            items: [],
            summary: {
              descendantCount: 0,
              directChildCount: 0,
              hasInvalidDescendants: false,
              invalidChildLinkCount: 0,
            },
          }
          : null);
        return (
          <div className="space-y-3" key={task.id}>
            <article
              className={`rounded-[1.35rem] border p-4 shadow-[0_16px_38px_rgba(81,61,168,0.06)] transition ${
                tableProps.highlightedActiveTaskId === task.id
                  ? "border-[#ddd2ff] bg-[#efe6ff] dark:border-[#5a458f] dark:bg-[#2b1d46]"
                  : "border-[#ece8f8] bg-white/92 dark:border-white/10 dark:bg-white/[0.05]"
              } ${
                isQuickPanelOpen
                  ? "border-[#cfc2ff] dark:border-[#4f3d86]"
                  : tableProps.highlightedActiveTaskId !== task.id
                    ? "hover:border-[#ddd2fb] hover:bg-white dark:hover:border-white/15"
                    : ""
              }`}
              data-task-list-row={task.id}
              onClick={(event) => {
                if (shouldIgnoreListOverlayOpen(event.target)) {
                  return;
                }
                setRowContextMenu(null);
                closeQuickPanel();
                tableProps.onOpenTaskEditor?.(task.id);
              }}
              onContextMenu={(event) => {
                if (openRowContextMenu(task.id, event.clientX, event.clientY)) {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
            >
            <div className="flex items-start gap-3">
              <div className="shrink-0">
                <button
                  aria-expanded={activePanelMode === "status"}
                  aria-label={`Change status for ${task.title}`}
                  className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] text-[#8d97b0] transition hover:bg-[#f7f3ff] hover:text-[#6f57f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f57f6]/30 dark:text-white/45 dark:hover:bg-white/[0.06] dark:hover:text-[#cabfff]"
                  onClick={(event) => {
                    event.stopPropagation();
                    setRowContextMenu(null);
                    openQuickPanel(task.id, "status");
                  }}
                  type="button"
                >
                  {renderTaskStatusCircle(displayStatus, "md")}
                </button>
              </div>

              <div
                className="min-w-0 flex-1 cursor-pointer"
                onKeyDown={(event) => {
                  if (isKeyboardEventFromEditableTarget(event.target)) {
                    return;
                  }
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setRowContextMenu(null);
                    closeQuickPanel();
                    tableProps.onOpenTaskEditor?.(task.id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {isRenamingTaskTitle ? (
                        <input
                          autoFocus
                          className={`${TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS} min-w-0 rounded-[0.45rem] border border-[#ddd2ff] bg-white px-1 py-0 outline-none transition focus:border-[#b7a7ff] dark:border-[#42306f] dark:bg-[#22193f] dark:focus:border-[#6d56d6]`}
                          onBlur={commitTaskTitle}
                          onChange={(event) => setTaskTitleDrafts((current) => ({ ...current, [task.id]: event.target.value }))}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitTaskTitle();
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setTaskTitleDrafts((current) => ({ ...current, [task.id]: task.title }));
                              setEditingTaskTitleId(null);
                            }
                          }}
                          value={taskTitleDraft}
                        />
                      ) : (
                        <button
                          className="block min-w-0 appearance-none border-0 bg-transparent p-0 text-left shadow-none outline-none transition hover:opacity-85 focus-visible:rounded-[0.5rem] focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:focus-visible:ring-[#3b2f68]/90"
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditingTaskTitleId(task.id);
                            setTaskTitleDrafts((current) => ({ ...current, [task.id]: task.title }));
                          }}
                          type="button"
                        >
                          <p className={`${TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS} leading-6 ${!isOpenTask ? "line-through text-[#8d97b0] dark:text-white/45" : ""}`}>
                            {task.title}
                          </p>
                        </button>
                      )}
                      {task.is_urgent ? (
                        <span className="rounded-full bg-[#fff1f3] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#d94e67] dark:bg-[#44232f] dark:text-[#ff9eaf]">
                          Urgent
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <MetadataChipButton
                        active={activePanelMode === "status"}
                        onClick={() => openQuickPanel(task.id, "status")}
                        toneClassName={SIMPLE_STATUS_STYLES[displayStatus]}
                      >
                        {formatTaskStatusLabel(displayStatus)}
                      </MetadataChipButton>
                      <MetadataChipButton active={activePanelMode === "due"} onClick={() => openQuickPanel(task.id, "due")}>
                        {dueMeta}
                      </MetadataChipButton>
                      {taskRow.currentStreak > 0 ? (
                        <span className={`${TASK_TABLE_LIST_CHIP_CLASS} inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium text-[#dc6c1c]`}>
                          <Flame className="h-3 w-3" />
                          {taskRow.currentStreak}
                        </span>
                      ) : null}
                      {taskRow.missedStreak > 0 ? (
                        <span className={`${TASK_TABLE_LIST_CHIP_CLASS} inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium text-[#d94e67]`}>
                          <Skull className="h-3 w-3" />
                          {taskRow.missedStreak}
                        </span>
                      ) : null}
                      <MetadataChipButton active={activePanelMode === "priority"} onClick={() => openQuickPanel(task.id, "priority")}>
                        {formatPriorityChipLabel(task, rowContext.focusedTaskIdSet)}
                      </MetadataChipButton>
                      <MetadataChipButton
                        active={activePanelMode === "repeat"}
                        onClick={() => openQuickPanel(task.id, "repeat")}
                        toneClassName={repeatTone(task.repeat_frequency)}
                      >
                        {repeatSummary ?? "No Repeat"}
                      </MetadataChipButton>
                      <MetadataChipButton active={activePanelMode === "list"} onClick={() => openQuickPanel(task.id, "list")}>
                        {categoryLabel}
                      </MetadataChipButton>
                      {visibleTags.map((tag) => (
                        <MetadataChipButton
                          active={activePanelMode === "tags"}
                          key={tag}
                          onClick={() => openQuickPanel(task.id, "tags")}
                          tone="tag"
                        >
                          #{tag}
                        </MetadataChipButton>
                      ))}
                      {extraTagCount > 0 ? (
                        <MetadataChipButton active={activePanelMode === "tags"} onClick={() => openQuickPanel(task.id, "tags")} tone="tag">
                          +{extraTagCount} tag{extraTagCount === 1 ? "" : "s"}
                        </MetadataChipButton>
                      ) : null}
                      {(task.tags ?? []).length === 0 ? (
                        <MetadataChipButton active={activePanelMode === "tags"} onClick={() => openQuickPanel(task.id, "tags")} tone="tag">
                          <span className="inline-flex items-center gap-1">
                            <Tag className="h-3 w-3" />
                            Add tags
                          </span>
                        </MetadataChipButton>
                      ) : null}
                    </div>
                    <div className="mt-2 flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                      <span className={`${TASK_TABLE_INACTIVE_CHIP_CLASS} inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[12px] font-medium`}>
                        Added {formatDateAddedChip(task.created_at)}
                      </span>
                      <MetadataChipButton active={activePanelMode === "estimated"} onClick={() => openQuickPanel(task.id, "estimated")}>
                        <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{formatListDuration(task.estimated_minutes)}</span>
                      </MetadataChipButton>
                      <MetadataChipButton active={activePanelMode === "actual"} onClick={() => openQuickPanel(task.id, "actual")}>
                        <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{formatListActual(task.actual_seconds)}</span>
                      </MetadataChipButton>
                      <MetadataChipButton active={activePanelMode === "energy"} onClick={() => openQuickPanel(task.id, "energy")} toneClassName={energyTone(task.energy)}>
                        {formatEnergyChipLabel(task.energy)}
                      </MetadataChipButton>
                      <MetadataChipButton active={activePanelMode === "link"} onClick={() => openQuickPanel(task.id, "link")}>
                        {task.external_link_label || task.external_link_url ? task.external_link_label || "Link" : "No link"}
                      </MetadataChipButton>
                      {task.external_link_url ? (
                        <TaskTableChipButton
                          onClick={(event) => {
                            event.stopPropagation();
                            window.open(task.external_link_url ?? "", "_blank", "noopener,noreferrer");
                          }}
                          toneClassName={TASK_TABLE_LIST_CHIP_CLASS}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </TaskTableChipButton>
                      ) : null}
                      <MetadataChipButton active={activePanelMode === "notes"} onClick={() => openQuickPanel(task.id, "notes")}>
                        {task.notes?.trim() ? "Notes" : "No notes"}
                      </MetadataChipButton>
                    </div>
                  </div>

                  <div className="relative flex shrink-0 items-center gap-1" data-list-action-control="true">
                    {tableProps.onCreateChildTask ? (
                      <button
                        aria-label={`Add step to ${task.title}`}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#ece8f8] bg-white text-[#66718c] transition hover:border-[#d9cffb] hover:bg-[#f7f3ff] hover:text-[#6f57f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f57f6]/30 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60 dark:hover:border-white/20 dark:hover:bg-white/[0.08] dark:hover:text-[#cabfff]"
                        onClick={(event) => {
                          event.stopPropagation();
                          closeQuickPanel();
                          setRowContextMenu(null);
                          setCollapsedStepSectionsByTaskId((current) => ({
                            ...current,
                            [task.id]: false,
                          }));
                          setParentStepCreationErrors((current) => ({ ...current, [task.id]: null }));
                          setParentStepTitleDrafts((current) => ({ ...current, [task.id]: current[task.id] ?? "" }));
                          setParentStepDraftTaskId(task.id);
                        }}
                        type="button"
                      >
                        <Footprints className="h-4 w-4" />
                      </button>
                    ) : null}
                    {tableProps.onOpenTaskHistory ? (
                      <button
                        aria-label={`Open history for ${task.title}`}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#ece8f8] bg-white text-[#66718c] transition hover:border-[#d9cffb] hover:bg-[#f7f3ff] hover:text-[#6f57f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f57f6]/30 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60 dark:hover:border-white/20 dark:hover:bg-white/[0.08] dark:hover:text-[#cabfff]"
                        onClick={(event) => {
                          event.stopPropagation();
                          closeQuickPanel();
                          setRowContextMenu(null);
                          tableProps.onOpenTaskHistory?.(task.id);
                        }}
                        type="button"
                      >
                        <CalendarDays className="h-4 w-4" />
                      </button>
                    ) : null}
                    <button
                      aria-expanded={rowContextMenu?.taskId === task.id}
                      aria-label={`More actions for ${task.title}`}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#ece8f8] bg-white text-[#66718c] transition hover:border-[#d9cffb] hover:bg-[#f7f3ff] hover:text-[#6f57f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f57f6]/30 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60 dark:hover:border-white/20 dark:hover:bg-white/[0.08] dark:hover:text-[#cabfff]"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (rowContextMenu?.taskId === task.id) {
                          setRowContextMenu(null);
                          return;
                        }
                        closeQuickPanel();
                        openRowContextMenu(task.id, event.clientX, event.clientY);
                      }}
                      type="button"
                    >
                      <Ellipsis className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            {activePanelMode === "status" ? (
              <QuickPanelShell onClose={closeQuickPanel} title={`Status · ${panelTitle}`}>
                <div className="flex flex-wrap gap-2">
                  {getSelectableTaskStatuses(task).map((status) => (
                    <TaskTableChipButton
                      className="gap-2"
                      key={status}
                      onClick={() => {
                        if (status === "delayed" && task.due_on && tableProps.onDelayTaskUntil) {
                          openQuickPanel(task.id, "delay");
                          return;
                        }
                        closeQuickPanel();
                        tableProps.onSetStatus?.(task.id, status, task, queueMeasuredListStatusScrollAnchor(task.id));
                      }}
                      toneClassName={`${statusTone(status)}${status === displayStatus ? ` ${ACTIVE_CHIP_RING_CLASS}` : " opacity-78 hover:opacity-100"}`}
                    >
                      {renderTaskStatusCircle(status, "sm")}
                      <span>{formatTaskStatusLabel(status)}</span>
                    </TaskTableChipButton>
                  ))}
                </div>
              </QuickPanelShell>
            ) : null}
            {activePanelMode === "delay" ? (
              <DelayQuickPanel
                dueOn={task.due_on}
                onClose={closeQuickPanel}
                onSave={(nextDueOn) => tableProps.onDelayTaskUntil?.(task.id, nextDueOn) ?? false}
                todayDateKey={rowContext.todayDateKey}
              />
            ) : null}
            {activePanelMode === "tags" ? (
              <TagsQuickPanel
                allTagOptions={tableProps.allTagOptions ?? []}
                onClose={closeQuickPanel}
                onSave={(tags) => tableProps.onSetTags?.(task.id, tags)}
                tags={task.tags ?? []}
              />
            ) : null}
            {activePanelMode === "due" ? (
              <DueQuickPanel
                dueOn={task.due_on}
                dueTime={task.due_time}
                onClose={closeQuickPanel}
                onSave={(schedule) => {
                  tableProps.onSetDue?.(task.id, schedule);
                  closeQuickPanel();
                }}
              />
            ) : null}
            {activePanelMode === "priority" ? (
              <PriorityQuickPanel
                activePriorities={activePriorities}
                onClose={closeQuickPanel}
                onSave={(priorities) => tableProps.onSetPriority?.(task.id, priorities)}
              />
            ) : null}
            {activePanelMode === "repeat" ? (
              <RepeatQuickPanel
                onClose={closeQuickPanel}
                onSave={(repeat, cadence) => tableProps.onSetRepeat?.(task.id, repeat, cadence)}
                repeatDayOfMonth={task.repeat_day_of_month}
                repeatDaysOfWeek={task.repeat_days_of_week ?? []}
                repeatFrequency={task.repeat_frequency}
                repeatInterval={Math.max(1, task.repeat_interval ?? 1)}
                repeatMonthlyMode={task.repeat_monthly_mode}
                repeatMonthlyOrdinal={task.repeat_monthly_ordinal}
                repeatMonthlyWeekday={task.repeat_monthly_weekday}
              />
            ) : null}
            {activePanelMode === "list" ? (
              <ListQuickPanel
                listDefinitions={rowContext.listDefinitions}
                listMemberships={listMemberships}
                onClose={closeQuickPanel}
                onToggleList={(listId) => tableProps.onToggleTaskList?.(task.id, listId)}
              />
            ) : null}
            {activePanelMode === "estimated" ? (
              <EstimatedQuickPanel
                minutes={task.estimated_minutes}
                onClose={closeQuickPanel}
                onSave={(minutes) => tableProps.onSetEstimatedMinutes?.(task.id, minutes)}
              />
            ) : null}
            {activePanelMode === "actual" ? (
              <ActualQuickPanel
                onClose={closeQuickPanel}
                onOpenManual={tableProps.onOpenTaskActualTime ? () => tableProps.onOpenTaskActualTime?.(task.id) : undefined}
                onSave={(seconds) => tableProps.onSetActualSeconds?.(task.id, seconds)}
                seconds={task.actual_seconds}
              />
            ) : null}
            {activePanelMode === "energy" ? (
              <EnergyQuickPanel
                energy={task.energy}
                onClose={closeQuickPanel}
                onSave={(energy) => tableProps.onSetEnergy?.(task.id, energy)}
              />
            ) : null}
            {activePanelMode === "link" ? (
              <LinkQuickPanel
                label={task.external_link_label ?? ""}
                onClose={closeQuickPanel}
                onSave={(nextLink) => tableProps.onSetLink?.(task.id, nextLink)}
                url={task.external_link_url ?? ""}
              />
            ) : null}
            {activePanelMode === "notes" ? (
              <NotesQuickPanel
                notes={task.notes ?? ""}
                onClose={closeQuickPanel}
                onSave={(notes) => tableProps.onSetNotes?.(task.id, notes)}
              />
            ) : null}
            {effectiveStepPreviewGroup ? (
              <StepsCardPreview
                activeQuickPanel={activeQuickPanel}
                allTagOptions={tableProps.allTagOptions ?? []}
                childTasksById={taskById}
                closeQuickPanel={closeQuickPanel}
                currentListLabel={currentListLabel}
                group={effectiveStepPreviewGroup}
                isExpanded={searchMatchedStepParentTaskIdSet.has(task.id) || parentStepDraftTaskId === task.id || collapsedStepSectionsByTaskId[task.id] === false}
                listDefinitions={rowContext.listDefinitions}
                listMembershipsByTaskId={rowContext.listMembershipsByTaskId}
                onCreateChildTask={tableProps.onCreateChildTask}
                onDeleteStep={tableProps.onOpenDeleteTask}
                onOpenHistory={tableProps.onOpenTaskHistory}
                onOpenActualTime={tableProps.onOpenTaskActualTime}
                onDelayTaskUntil={tableProps.onDelayTaskUntil}
                onOpenStep={(taskId) => {
                  setRowContextMenu(null);
                  closeQuickPanel();
                  if (tableProps.onOpenChildTask) {
                    tableProps.onOpenChildTask(taskId);
                    return;
                  }
                  tableProps.onOpenTaskEditor?.(taskId);
                }}
                onOpenQuickPanel={openQuickPanel}
                onRenameStep={tableProps.onSetTitle}
                onReorderStep={tableProps.onReorderChildTask}
                onSetActualSeconds={tableProps.onSetActualSeconds}
                onSetDue={tableProps.onSetDue}
                onSetEnergy={tableProps.onSetEnergy}
                onSetEstimatedMinutes={tableProps.onSetEstimatedMinutes}
                onSetLink={tableProps.onSetLink}
                onSetNotes={tableProps.onSetNotes}
                onSetPriority={tableProps.onSetPriority}
                onSetRepeat={tableProps.onSetRepeat}
                onSetStatus={tableProps.onSetStatus}
                onSetTags={tableProps.onSetTags}
                onToggleTaskList={tableProps.onToggleTaskList}
                onToggleExpanded={() => {
                  if (searchMatchedStepParentTaskIdSet.has(task.id)) {
                    return;
                  }
                  setCollapsedStepSectionsByTaskId((current) => ({
                    ...current,
                    [task.id]: current[task.id] === false,
                  }));
                }}
                parentStepCreationError={parentStepCreationErrors[task.id] ?? null}
                parentStepDraftInputRef={parentStepDraftTaskId === task.id ? parentStepDraftInputRef : undefined}
                parentStepDraftValue={parentStepTitleDrafts[task.id] ?? ""}
                selectedBucket={selectedBucket}
                showParentStepDraft={parentStepDraftTaskId === task.id}
                taskHistoryByTaskId={rowContext.taskHistoryByTaskId}
                todayDateKey={rowContext.todayDateKey}
                onCancelParentStepDraft={() => {
                  setParentStepDraftTaskId((current) => (current === task.id ? null : current));
                  setParentStepCreationErrors((current) => ({ ...current, [task.id]: null }));
                }}
                onCommitParentStepDraft={() => {
                  void commitParentStepDraft(task.id);
                }}
                onParentStepDraftChange={(value) => {
                  setParentStepTitleDrafts((current) => ({ ...current, [task.id]: value }));
                  setParentStepCreationErrors((current) => ({ ...current, [task.id]: null }));
                }}
                highlightedActiveTaskId={tableProps.highlightedActiveTaskId}
                highlightedTaskIds={tableProps.highlightedTaskIds}
              />
            ) : null}
            </article>
          </div>
        );
      })}
          {rowContextMenu && rowContextMenuTask ? (
            <TaskRowContextMenu
              allowInlineInspector
              enableInspector
              hasBatchQuickEdit={selectedTaskIdSet.has(rowContextMenuTask.id) && tableProps.selectedTaskIds.length > 1}
              isTaskSelected={selectedTaskIdSet.has(rowContextMenuTask.id)}
              menu={rowContextMenu}
              onClearSelection={tableProps.onClearSelection ? () => {
                tableProps.onClearSelection();
                setRowContextMenu(null);
              } : undefined}
              onDeleteTask={tableProps.onOpenDeleteTask ? () => {
                tableProps.onOpenDeleteTask?.(rowContextMenuTask.id);
                setRowContextMenu(null);
              } : undefined}
              onDismiss={() => setRowContextMenu(null)}
              onDuplicateTask={tableProps.onDuplicateTask ? () => {
                tableProps.onDuplicateTask?.(rowContextMenuTask.id);
                setRowContextMenu(null);
              } : undefined}
              onEditTask={tableProps.onOpenTaskEditor ? () => {
                tableProps.onOpenTaskEditor?.(rowContextMenuTask.id);
                setRowContextMenu(null);
              } : undefined}
              onOpenDetails={() => {
                setRowContextMenu(null);
                closeQuickPanel();
                tableProps.onOpenTaskEditor?.(rowContextMenuTask.id);
              }}
              onOpenHistory={tableProps.onOpenTaskHistory ? () => {
                tableProps.onOpenTaskHistory?.(rowContextMenuTask.id);
                setRowContextMenu(null);
              } : undefined}
              onOpenQuickEdit={(mode) => {
                const listModeMap: Partial<Record<"actual" | "due" | "energy" | "estimated" | "link" | "lists" | "notes" | "priority" | "repeat" | "status" | "tags", ListQuickPanelMode>> = {
                  actual: "actual",
                  due: "due",
                  energy: "energy",
                  estimated: "estimated",
                  link: "link",
                  lists: "list",
                  notes: "notes",
                  priority: "priority",
                  repeat: "repeat",
                  status: "status",
                  tags: "tags",
                };
                const mappedMode = listModeMap[mode];
                setRowContextMenu(null);
                if (mappedMode) {
                  openQuickPanel(rowContextMenuTask.id, mappedMode);
                  return;
                }
                tableProps.onOpenTaskEditor?.(rowContextMenuTask.id);
              }}
              onOpenTimeLog={tableProps.onOpenTaskActualTime ? () => {
                tableProps.onOpenTaskActualTime?.(rowContextMenuTask.id);
                setRowContextMenu(null);
              } : undefined}
              onRestoreTask={tableProps.onRestoreTask ? () => {
                tableProps.onRestoreTask?.(rowContextMenuTask.id);
                setRowContextMenu(null);
              } : undefined}
              onSelectAllVisible={tableProps.onSelectAllVisible ? () => {
                tableProps.onSelectAllVisible?.(visibleTaskIds);
                setRowContextMenu(null);
              } : undefined}
              onToggleTaskSelection={tableProps.onToggleTaskSelection ? () => {
                tableProps.onToggleTaskSelection?.(rowContextMenuTask.id, {
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
                { label: "Energy", mode: "energy" },
                { label: "Priority", mode: "priority" },
                { label: "Repeat", mode: "repeat" },
                { label: "Lists", mode: "lists" },
                { label: "Tags", mode: "tags" },
                { label: "Link", mode: "link" },
                { label: "Notes", mode: "notes" },
              ]}
              quickEditTitle={selectedTaskIdSet.has(rowContextMenuTask.id) && tableProps.selectedTaskIds.length > 1 ? `Quick edit ${tableProps.selectedTaskIds.length} selected tasks` : "Quick edit"}
              selectedTaskCount={tableProps.selectedTaskIds.length}
              task={rowContextMenuTask}
            />
          ) : null}
        </div>
      )}
    />
  );
}

export function TasksListAdapter(props: TasksListAdapterProps) {
  return <TasksSimpleList {...props} />;
}

type DuplicateTaskGroupsAdapterProps = {
  duplicateGroups: DuplicateTitleGroup[];
  filterRowsNode: ReactNode;
  listDefinitions: TaskListDefinition[];
  listMembershipsByTaskId: Record<string, Array<{ id: string; isManual: boolean }>>;
  onClearSelection: () => void;
  onOpenBatchDelete?: () => void;
  onOpenBatchEdit?: () => void;
  onOpenDeleteTask?: (taskId: string) => void;
  onOpenTaskEditor?: (taskId: string) => void;
  onSelectTaskIds: (taskIds: string[]) => void;
  onToggleTaskSelection?: (taskId: string, options?: { additive?: boolean; range?: boolean; visibleTaskIds?: string[] }) => void;
  panelProps: Omit<ComponentProps<typeof TasksListViewPanel>, "agentPlanNode" | "filterRowsNode" | "lists">;
  selectedTaskIds: string[];
};

export function DuplicateTaskGroupsAdapter({
  duplicateGroups,
  filterRowsNode,
  listDefinitions,
  listMembershipsByTaskId,
  onClearSelection,
  onOpenBatchDelete,
  onOpenBatchEdit,
  onOpenDeleteTask,
  onOpenTaskEditor,
  onSelectTaskIds,
  onToggleTaskSelection,
  panelProps,
  selectedTaskIds,
}: DuplicateTaskGroupsAdapterProps) {
  return (
    <TasksListViewPanel
      {...panelProps}
      filterRowsNode={filterRowsNode}
      lists={[]}
      agentPlanNode={(
        <DuplicateTaskGroupsPanel
          groups={duplicateGroups}
          listDefinitions={listDefinitions}
          listMembershipsByTaskId={listMembershipsByTaskId}
          onClearSelection={onClearSelection}
          onOpenBatchDelete={onOpenBatchDelete}
          onOpenBatchEdit={onOpenBatchEdit}
          onOpenDeleteTask={onOpenDeleteTask}
          onOpenTaskEditor={onOpenTaskEditor}
          onSelectTaskIds={onSelectTaskIds}
          onToggleTaskSelection={onToggleTaskSelection}
          selectedTaskIds={selectedTaskIds}
        />
      )}
    />
  );
}
