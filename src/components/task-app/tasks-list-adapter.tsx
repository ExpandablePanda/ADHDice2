"use client";
import { CalendarDays, Clock3, Ellipsis, ExternalLink, Flame, Footprints, Skull, Tag, Trash2, X } from "lucide-react";
import {
  buildTaskRowContextMenuState,
  TaskManagementTableV2,
  TaskRowContextMenu,
  type PrototypeTaskRow,
  type RowContextMenuState,
  type TaskManagementTableColumnId,
  type RunningTaskTimer,
} from "@/components/ui/task-management-table-v2";
import type { AgentPlanColumnId } from "@/components/ui/agent-plan";
import { DuplicateTaskGroupsPanel } from "./duplicate-task-groups-panel";
import { formatChildTaskPreviewDepthLabel, type ChildTaskPreview, type ChildTaskPreviewGroup, type ChildTaskPreviewLookup, type ChildTaskPreviewPriority, type DuplicateTitleGroup } from "@/lib/task-app-derived";
import type { TaskEditorLinkedNote } from "@/lib/task-notes";
import type { Task, TaskActualTimeEntry, TaskHistory, TaskStatus, TaskSubtask, TaskSubtaskStatus } from "@/lib/database.types";
import type { TaskListDefinition } from "@/lib/task-lists";
import { buildTaskTableRow } from "@/lib/task-table-row";
import { useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { TasksListViewPanel } from "./tasks-page";
import { getTaskDisplayStatus, formatDueLabel, formatDueTimeLabel } from "@/lib/task-cockpit";
import { isTaskOpen } from "@/lib/task-buckets";
import { TASK_STATUS_CHIP_STYLES, formatTaskStatusLabel, renderTaskStatusCircle } from "./task-status-ui";
import { formatRepeatSummary } from "@/lib/task-repeat";
import { formatLocalDate, todayISO } from "@/lib/utils";
import {
  TASK_TABLE_ACTIVE_LIST_CHIP_CLASS,
  TASK_TABLE_INACTIVE_CHIP_CLASS,
  TASK_TABLE_LIST_CHIP_CLASS,
  TASK_TABLE_TAG_CHIP_CLASS,
  TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS,
  TaskTableChipButton,
} from "@/components/ui/task-table-primitives";

type ListQuickPanelMode = "actual" | "due" | "energy" | "estimated" | "link" | "list" | "notes" | "priority" | "repeat" | "status" | "tags";

const QUICK_PANEL_SHELL_CLASS = "rounded-[1.15rem] border border-[#e7defc] bg-[#fcfbff] px-4 py-3 shadow-[0_14px_34px_rgba(81,61,168,0.08)] dark:border-[#41306c] dark:bg-[#18112d]";
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
const STATUS_OPTIONS: TaskStatus[] = ["pending", "in_progress", "done", "missed", "did_my_best", "upcoming", "not_due", "archived", "trashed"];

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

type TasksTableSourceProps = {
  allListOptions?: Array<{ id: string; label: string }>;
  allNoteOptions?: TaskEditorLinkedNote[];
  allTagOptions?: string[];
  allTasks?: Task[];
  childTaskCreationBlockedTaskIds?: string[];
  childTaskPreviewByParentTaskId?: ChildTaskPreviewLookup;
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
  onRestoreTask?: (taskId: string) => void;
  onOpenTaskHistory?: (taskId: string) => void;
  onOpenTaskEditor?: (taskId: string) => void;
  onOpenChildTask?: (taskId: string) => void;
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
  onSetRepeat?: (taskId: string, repeat: PrototypeTaskRow["repeat"], cadence?: Pick<PrototypeTaskRow, "repeatDayOfMonth" | "repeatDaysOfWeek" | "repeatInterval">) => void;
  onSetStatus?: (taskId: string, status: TaskStatus, expectedTask?: Task | null) => void;
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
};

type TasksTableAdapterProps = {
  filterRowsNode: ReactNode;
  tableProps: TasksTableSourceProps;
  panelProps: Omit<ComponentProps<typeof TasksListViewPanel>, "agentPlanNode" | "filterRowsNode">;
};

const TASK_TABLE_COLUMN_MAP: Record<AgentPlanColumnId, TaskManagementTableColumnId> = {
  bucket: "lists",
  date_added: "date_added",
  due: "due",
  energy: "energy",
  estimated_time: "estimated",
  actual_time: "actual",
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
          onRestoreTask={tableProps.onRestoreTask}
          onOpenTaskHistory={tableProps.onOpenTaskHistory}
          onOpenFocusTimer={tableProps.onOpenFocusTimer}
          onOpenNote={tableProps.onOpenNote}
          onOpenTaskActualTime={tableProps.onOpenTaskActualTime}
          onOpenTaskEditor={tableProps.onOpenTaskEditor}
          onOpenChildTask={tableProps.onOpenChildTask}
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
          shrinkAllColumnsToken={panelProps.shrinkAllColumnsToken}
          title="Tasks"
          visibleColumns={visibleColumns}
          activeTaskTimerIndex={tableProps.activeTaskTimerIndex}
          onRequestedOpenTaskHandled={tableProps.onRequestedOpenTaskHandled}
        />
      }
      filterRowsNode={filterRowsNode}
    />
  );
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

function StepsCardPreview({
  activeQuickPanel,
  allTagOptions,
  childTasksById,
  closeQuickPanel,
  currentListLabel,
  group,
  listDefinitions,
  listMembershipsByTaskId,
  onCreateChildTask,
  onDeleteStep,
  onOpenHistory,
  onOpenStep,
  onOpenQuickPanel,
  onRenameStep,
  onOpenActualTime,
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
  selectedBucket,
  showAllSteps = false,
}: {
  activeQuickPanel: { mode: ListQuickPanelMode; taskId: string } | null;
  allTagOptions: string[];
  childTasksById: Map<string, Task>;
  closeQuickPanel: () => void;
  currentListLabel?: string | null;
  group: ChildTaskPreviewGroup;
  listDefinitions: TaskListDefinition[];
  listMembershipsByTaskId: Record<string, Array<{ id: string; isManual: boolean }>>;
  onCreateChildTask?: (parentTaskId: string, title: string) => Promise<{ error: string | null; taskId: string | null }>;
  onDeleteStep?: (taskId: string) => void;
  onOpenHistory?: (taskId: string) => void;
  onOpenStep: (taskId: string) => void;
  onOpenQuickPanel: (taskId: string, mode: ListQuickPanelMode) => void;
  onRenameStep?: (taskId: string, title: string) => void;
  onOpenActualTime?: (taskId: string) => void;
  onSetActualSeconds?: (taskId: string, seconds: number) => void;
  onSetDue?: (taskId: string, schedule: { dueOn: string; dueTime: string }) => void;
  onSetEnergy?: (taskId: string, energy: PrototypeTaskRow["energy"]) => void;
  onSetEstimatedMinutes?: (taskId: string, minutes: number | null) => void;
  onSetLink?: (taskId: string, nextLink: { label: string; url: string }) => void;
  onSetNotes?: (taskId: string, notes: string) => void;
  onSetPriority?: (taskId: string, priorities: PrototypeTaskRow["priorities"]) => void;
  onSetRepeat?: (taskId: string, repeat: PrototypeTaskRow["repeat"], cadence?: Pick<PrototypeTaskRow, "repeatDayOfMonth" | "repeatDaysOfWeek" | "repeatInterval">) => void;
  onSetStatus?: (taskId: string, status: TaskStatus, expectedTask?: Task | null) => void;
  onSetTags?: (taskId: string, tags: string[]) => void;
  onToggleTaskList?: (taskId: string, listId: string) => void;
  selectedBucket: string;
  showAllSteps?: boolean;
}) {
  const [editingStepTitleId, setEditingStepTitleId] = useState<string | null>(null);
  const [stepTitleDrafts, setStepTitleDrafts] = useState<Record<string, string>>({});
  const [substepDraftParentId, setSubstepDraftParentId] = useState<string | null>(null);
  const [substepTitleDrafts, setSubstepTitleDrafts] = useState<Record<string, string>>({});
  const [substepCreationErrors, setSubstepCreationErrors] = useState<Record<string, string | null>>({});
  const visibleItems = showAllSteps ? group.items : group.items.slice(0, 4);
  const hiddenItemCount = Math.max(0, group.items.length - visibleItems.length);

  if (visibleItems.length === 0 && !group.summary.hasInvalidDescendants) {
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

  return (
    <section className="mt-3 border-t border-[#f0ebfb] pt-3 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#938ab8] dark:text-white/45">Steps</p>
      </div>
      {group.summary.hasInvalidDescendants ? (
        <p className="mt-2 text-xs text-[#9a7a24] dark:text-[#f3d38a]">
          {group.summary.invalidChildLinkCount === 1 ? "1 invalid step link" : `${group.summary.invalidChildLinkCount} invalid step links`}
        </p>
      ) : null}
      {visibleItems.length > 0 ? (
        <ul className="mt-2">
          {visibleItems.map((item) => {
            const childTask = childTasksById.get(item.id) ?? null;
            const scheduleLabel = formatStepPreviewSchedule(item);
            const depthIndent = Math.min(Math.max(item.depth - 1, 0), 3) * 0.75;
            const activePanelMode = activeQuickPanel?.taskId === item.id ? activeQuickPanel.mode : null;
            const displayStatus = childTask ? getTaskDisplayStatus(childTask) : item.status;
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
                ? item.repeatInterval > 1 ? `${item.repeat} · ${item.repeatInterval}` : item.repeat
                : "";
            const visibleTags = item.tags.slice(0, 3);
            const extraTagCount = Math.max(0, item.tags.length - visibleTags.length);
            const isRenaming = editingStepTitleId === item.id;
            const titleDraft = stepTitleDrafts[item.id] ?? item.title;
            const commitTitle = () => {
              const nextTitle = titleDraft.trim();
              if (nextTitle && nextTitle !== item.title) {
                onRenameStep?.(item.id, nextTitle);
              }
              setEditingStepTitleId((current) => (current === item.id ? null : current));
            };

            return (
              <li
                className="cursor-pointer rounded-[0.95rem] border border-transparent bg-transparent px-1.5 py-2.5 transition hover:bg-[#fbfaff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:hover:bg-white/[0.05] dark:focus-visible:ring-[#3b2f68]/90"
                data-same-table-step-row={item.id}
                key={item.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenStep(item.id);
                }}
                onKeyDown={(event) => {
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
                  <span className="mt-0.5 flex-none">{renderTaskStatusCircle(item.status, "sm")}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-1.5">
                        {isRenaming ? (
                          <input
                            autoFocus
                            className={`${TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS} min-w-0 rounded-[0.45rem] border border-[#ddd2ff] bg-white px-1 py-0 outline-none transition focus:border-[#b7a7ff] dark:border-[#42306f] dark:bg-[#22193f] dark:focus:border-[#6d56d6]`}
                            onBlur={commitTitle}
                            onChange={(event) => setStepTitleDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => {
                              event.stopPropagation();
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitTitle();
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                setStepTitleDrafts((current) => ({ ...current, [item.id]: item.title }));
                                setEditingStepTitleId(null);
                              }
                            }}
                            value={titleDraft}
                          />
                        ) : (
                          <button
                            className="block min-w-0 appearance-none border-0 bg-transparent p-0 text-left shadow-none outline-none transition hover:opacity-85 focus-visible:rounded-[0.5rem] focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:focus-visible:ring-[#3b2f68]/90"
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditingStepTitleId(item.id);
                              setStepTitleDrafts((current) => ({ ...current, [item.id]: item.title }));
                            }}
                            type="button"
                          >
                            <p className={`${TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS} min-w-0 truncate`}>
                              {item.title || (item.depth > 1 ? "Untitled substep" : "Untitled step")}
                            </p>
                          </button>
                        )}
                      </div>
                      <div className="flex flex-none items-center gap-1">
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
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9b92be] dark:text-white/35">
                      {formatChildTaskPreviewDepthLabel(item.depth)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
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
                      {item.currentStreak > 0 ? (
                        <span className={`${TASK_TABLE_LIST_CHIP_CLASS} inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium text-[#dc6c1c]`}>
                          <Flame className="h-3 w-3" />
                          {item.currentStreak}
                        </span>
                      ) : null}
                      {item.missedStreak > 0 ? (
                        <span className={`${TASK_TABLE_LIST_CHIP_CLASS} inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium text-[#d94e67]`}>
                          <Skull className="h-3 w-3" />
                          {item.missedStreak}
                        </span>
                      ) : null}
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
                    <div className="mt-2 flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
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
                      {STATUS_OPTIONS.map((status) => (
                        <TaskTableChipButton
                          className="gap-2"
                          key={status}
                          onClick={() => {
                            closeQuickPanel();
                            onSetStatus?.(item.id, status, childTask);
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
      {hiddenItemCount > 0 ? (
        <p className="mt-2 text-xs text-[#8d87a7] dark:text-white/45">{`${hiddenItemCount} more ${hiddenItemCount === 1 ? "step" : "steps"} shown in the inspector.`}</p>
      ) : null}
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
}: {
  onClose: () => void;
  onSave: (repeat: PrototypeTaskRow["repeat"], cadence?: Pick<PrototypeTaskRow, "repeatDayOfMonth" | "repeatDaysOfWeek" | "repeatInterval">) => void;
  repeatDayOfMonth: number | null;
  repeatDaysOfWeek: number[];
  repeatFrequency: PrototypeTaskRow["repeat"];
  repeatInterval: number;
}) {
  const [intervalDraft, setIntervalDraft] = useState(String(Math.max(1, repeatInterval)));
  const [dayOfMonthDraft, setDayOfMonthDraft] = useState(repeatDayOfMonth ? String(repeatDayOfMonth) : "");

  const applyCadence = (nextRepeat: PrototypeTaskRow["repeat"], nextDays = repeatDaysOfWeek, nextDayOfMonth = repeatDayOfMonth) => {
    const parsedInterval = Number.parseInt(intervalDraft, 10);
    const parsedDayOfMonth = Number.parseInt(dayOfMonthDraft, 10);
    onSave(nextRepeat, {
      repeatDayOfMonth: Number.isFinite(parsedDayOfMonth) && parsedDayOfMonth >= 1 && parsedDayOfMonth <= 31 ? parsedDayOfMonth : nextDayOfMonth ?? null,
      repeatDaysOfWeek: nextRepeat === "weekly" || nextRepeat === "custom" ? nextDays : [],
      repeatInterval: Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval : 1,
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
      </div>
      {repeatFrequency !== "none" ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#938ab8] dark:text-white/45">Interval</span>
            <input
              className={`${QUICK_PANEL_TEXT_INPUT_CLASS} w-20`}
              min={1}
              onChange={(event) => setIntervalDraft(event.target.value)}
              type="number"
              value={intervalDraft}
            />
            <TaskTableChipButton onClick={() => applyCadence(repeatFrequency)} toneClassName={QUICK_PANEL_PRIMARY_CHIP_CLASS}>Save interval</TaskTableChipButton>
          </div>
          {repeatFrequency === "weekly" || repeatFrequency === "custom" ? (
            <div className="flex flex-wrap gap-2">
              {REPEAT_WEEKDAY_OPTIONS.map((option) => {
                const isActive = repeatDaysOfWeek.includes(option.value);
                const nextDays = isActive
                  ? repeatDaysOfWeek.filter((entry) => entry !== option.value)
                  : [...repeatDaysOfWeek, option.value].sort((left, right) => left - right);
                return (
                  <QuickChipOption
                    active={isActive}
                    activeToneClassName={QUICK_PANEL_PRIMARY_CHIP_CLASS}
                    key={option.value}
                    onClick={() => applyCadence(repeatFrequency, nextDays)}
                  >
                    {option.label}
                  </QuickChipOption>
                );
              })}
            </div>
          ) : null}
          {repeatFrequency === "monthly" ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#938ab8] dark:text-white/45">Day</span>
              <input
                className={`${QUICK_PANEL_TEXT_INPUT_CLASS} w-20`}
                max={31}
                min={1}
                onChange={(event) => setDayOfMonthDraft(event.target.value)}
                type="number"
                value={dayOfMonthDraft}
              />
              <TaskTableChipButton onClick={() => applyCadence(repeatFrequency, repeatDaysOfWeek, null)} toneClassName={QUICK_PANEL_PRIMARY_CHIP_CLASS}>Save day</TaskTableChipButton>
            </div>
          ) : null}
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
  const [inlineInspectorTaskId, setInlineInspectorTaskId] = useState<string | null>(null);
  const [editingTaskTitleId, setEditingTaskTitleId] = useState<string | null>(null);
  const [taskTitleDrafts, setTaskTitleDrafts] = useState<Record<string, string>>({});
  const listShellRef = useRef<HTMLDivElement | null>(null);
  const tasks = tableProps.tasks;
  const rowContext = tableProps.rowContext;
  const visibleTaskIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
  const selectedTaskIdSet = useMemo(() => new Set(tableProps.selectedTaskIds), [tableProps.selectedTaskIds]);
  const searchMatchedStepParentTaskIdSet = useMemo(
    () => new Set(tableProps.searchMatchedStepParentTaskIds ?? []),
    [tableProps.searchMatchedStepParentTaskIds],
  );
  const taskById = useMemo(
    () => new Map([...(tableProps.allTasks ?? tasks), ...tasks].map((task) => [task.id, task])),
    [tableProps.allTasks, tasks],
  );
  const noteOptions = useMemo(
    () => tableProps.allNoteOptions?.map((note) => ({ id: note.id, title: note.title })) ?? [],
    [tableProps.allNoteOptions],
  );
  const inspectorRows = useMemo(
    () => tableProps.tasks.map((task) => buildTaskTableRow(task, {
      focusedTaskIdSet: tableProps.rowContext.focusedTaskIdSet,
      linkedNotes: tableProps.rowContext.linkedNotesByTaskId[task.id] ?? [],
      listDefinitions: tableProps.rowContext.listDefinitions,
      listMemberships: tableProps.rowContext.listMembershipsByTaskId[task.id] ?? [],
      subtasks: tableProps.rowContext.subtasksByTaskId[task.id] ?? [],
      taskHistory: tableProps.rowContext.taskHistoryByTaskId[task.id] ?? [],
      todayDateKey: tableProps.rowContext.todayDateKey,
    })),
    [tableProps.rowContext, tableProps.tasks],
  );
  const requestedInspectorTask = inlineInspectorTaskId
    ? tableProps.tasks.find((task) => task.id === inlineInspectorTaskId)
      ?? tableProps.allTasks?.find((task) => task.id === inlineInspectorTaskId)
      ?? null
    : null;
  const requestedInspectorTaskRow = useMemo(
    () => requestedInspectorTask
      ? buildTaskTableRow(requestedInspectorTask, {
        focusedTaskIdSet: tableProps.rowContext.focusedTaskIdSet,
        linkedNotes: tableProps.rowContext.linkedNotesByTaskId[requestedInspectorTask.id] ?? [],
        listDefinitions: tableProps.rowContext.listDefinitions,
        listMemberships: tableProps.rowContext.listMembershipsByTaskId[requestedInspectorTask.id] ?? [],
        subtasks: tableProps.rowContext.subtasksByTaskId[requestedInspectorTask.id] ?? [],
        taskHistory: tableProps.rowContext.taskHistoryByTaskId[requestedInspectorTask.id] ?? [],
        todayDateKey: tableProps.rowContext.todayDateKey,
      })
      : null,
    [requestedInspectorTask, tableProps.rowContext],
  );
  const closeQuickPanel = () => setActiveQuickPanel(null);
  const openQuickPanel = (taskId: string, mode: ListQuickPanelMode) => {
    setRowContextMenu(null);
    setInlineInspectorTaskId(null);
    setActiveQuickPanel((current) => current?.taskId === taskId && current.mode === mode ? null : { mode, taskId });
  };
  const rowContextMenuTask = useMemo(
    () => rowContextMenu ? tasks.find((task) => task.id === rowContextMenu.taskId) ?? null : null,
    [rowContextMenu, tasks],
  );

  function openRowContextMenu(taskId: string, clientX: number, clientY: number) {
    const nextMenu = buildTaskRowContextMenuState(listShellRef.current, taskId, clientX, clientY);
    if (!nextMenu) {
      return false;
    }

    setRowContextMenu(nextMenu);
    return true;
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
          {tasks.map((task) => {
        const displayStatus = getTaskDisplayStatus(task);
        const dueLabel = formatDueLabel(task.due_on);
        const dueTimeLabel = formatDueTimeLabel(task.due_time);
        const dueMeta = dueTimeLabel ? `${dueLabel} · ${dueTimeLabel}` : dueLabel;
        const repeatSummary = formatRepeatSummary(task);
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
        const isInspectorOpen = inlineInspectorTaskId === task.id;
        const activePanelMode = activeQuickPanel?.taskId === task.id ? activeQuickPanel.mode : null;
        const isQuickPanelOpen = activePanelMode !== null;
        const panelTitle = task.title;
        const listMemberships = rowContext.listMembershipsByTaskId[task.id] ?? [];
        const stepPreviewGroup = tableProps.childTaskPreviewByParentTaskId?.[task.id];
        const hasStepPreview = Boolean(stepPreviewGroup && (stepPreviewGroup.items.length > 0 || stepPreviewGroup.summary.hasInvalidDescendants));

        return (
          <div className="space-y-3" key={task.id}>
            <article
              className={`rounded-[1.35rem] border bg-white/92 p-4 shadow-[0_16px_38px_rgba(81,61,168,0.06)] transition dark:bg-white/[0.05] ${
                isInspectorOpen || isQuickPanelOpen
                  ? "border-[#cfc2ff] bg-[#fcfbff] dark:border-[#4f3d86] dark:bg-[#18112d]"
                  : "border-[#ece8f8] hover:border-[#ddd2fb] hover:bg-white dark:border-white/10 dark:hover:border-white/15"
              }`}
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
                onClick={() => {
                  setRowContextMenu(null);
                  closeQuickPanel();
                  setInlineInspectorTaskId(task.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setRowContextMenu(null);
                    closeQuickPanel();
                    setInlineInspectorTaskId(task.id);
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
                      <MetadataChipButton active={activePanelMode === "priority"} onClick={() => openQuickPanel(task.id, "priority")}>
                        {formatPriorityChipLabel(task, rowContext.focusedTaskIdSet)}
                      </MetadataChipButton>
                      {repeatSummary ? (
                        <MetadataChipButton active={activePanelMode === "repeat"} onClick={() => openQuickPanel(task.id, "repeat")}>
                          {repeatSummary}
                        </MetadataChipButton>
                      ) : null}
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

                  <div className="relative shrink-0">
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
            {hasStepPreview && stepPreviewGroup ? (
              <StepsCardPreview
                activeQuickPanel={activeQuickPanel}
                allTagOptions={tableProps.allTagOptions ?? []}
                childTasksById={taskById}
                closeQuickPanel={closeQuickPanel}
                currentListLabel={currentListLabel}
                group={stepPreviewGroup}
                listDefinitions={rowContext.listDefinitions}
                listMembershipsByTaskId={rowContext.listMembershipsByTaskId}
                onCreateChildTask={tableProps.onCreateChildTask}
                onDeleteStep={tableProps.onOpenDeleteTask}
                onOpenHistory={tableProps.onOpenTaskHistory}
                onOpenActualTime={tableProps.onOpenTaskActualTime}
                onOpenStep={(taskId) => {
                  setRowContextMenu(null);
                  closeQuickPanel();
                  setInlineInspectorTaskId(taskId);
                }}
                onOpenQuickPanel={openQuickPanel}
                onRenameStep={tableProps.onSetTitle}
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
                selectedBucket={selectedBucket}
                showAllSteps={searchMatchedStepParentTaskIdSet.has(task.id)}
              />
            ) : null}
            </article>
            {activePanelMode === "status" ? (
              <QuickPanelShell onClose={closeQuickPanel} title={`Status · ${panelTitle}`}>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((status) => (
                    <TaskTableChipButton
                      className="gap-2"
                      key={status}
                      onClick={() => {
                        closeQuickPanel();
                        tableProps.onSetStatus?.(task.id, status, task);
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
            {isInspectorOpen ? (
              <TaskManagementTableV2
                allowInlineInspector
                allListOptions={tableProps.allListOptions}
                allNoteOptions={noteOptions}
                allTagOptions={tableProps.allTagOptions}
                childTaskCreationBlockedTaskIds={tableProps.childTaskCreationBlockedTaskIds}
                childTaskPreviewByParentTaskId={tableProps.childTaskPreviewByParentTaskId}
                searchMatchedStepParentTaskIds={tableProps.searchMatchedStepParentTaskIds}
                className="mt-0 max-w-none"
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
                onRestoreTask={tableProps.onRestoreTask}
                onOpenTaskHistory={tableProps.onOpenTaskHistory}
                onOpenFocusTimer={tableProps.onOpenFocusTimer}
                onOpenNote={tableProps.onOpenNote}
                onOpenTaskActualTime={tableProps.onOpenTaskActualTime}
                onOpenTaskEditor={tableProps.onOpenTaskEditor}
                onOpenChildTask={(taskId) => setInlineInspectorTaskId(taskId)}
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
                  const expectedTask = tableProps.tasks.find((entry) => entry.id === taskId) ?? null;
                  tableProps.onSetStatus?.(taskId, status, expectedTask);
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
                onInspectorClose={() => setInlineInspectorTaskId(null)}
                primaryBadgeLabel="Live task table"
                requestedOpenTaskId={inlineInspectorTaskId}
                requestedOpenTask={requestedInspectorTaskRow}
                rows={inspectorRows}
                runningTaskTimers={tableProps.runningTaskTimers}
                secondaryBadgeLabel="List view"
                selectedTaskIds={tableProps.selectedTaskIds}
                shellClassName="[&_.sticky]:hidden [&_[data-task-table-row]]:hidden [&_[data-task-table-inline-editor]]:hidden"
                showHeader={false}
                suppressDetachedNoticeTaskId={tableProps.suppressDetachedNoticeTaskId}
                title="Tasks"
                visibleColumns={["status_icon", "title"]}
                activeTaskTimerIndex={tableProps.activeTaskTimerIndex}
              />
            ) : null}
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
                setInlineInspectorTaskId(rowContextMenuTask.id);
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
                setInlineInspectorTaskId(rowContextMenuTask.id);
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
