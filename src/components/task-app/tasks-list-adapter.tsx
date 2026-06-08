"use client";

import {
  TaskManagementTableV2,
  type PrototypeTaskRow,
  type TaskManagementTableColumnId,
  type RunningTaskTimer,
} from "@/components/ui/task-management-table-v2";
import type { AgentPlanColumnId } from "@/components/ui/agent-plan";
import type { TaskEditorLinkedNote } from "@/lib/task-notes";
import type { Task, TaskActualTimeEntry, TaskHistory, TaskStatus, TaskSubtask, TaskSubtaskStatus } from "@/lib/database.types";
import type { TaskListDefinition } from "@/lib/task-lists";
import { buildTaskTableRow } from "@/lib/task-table-row";
import { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { TasksListViewPanel } from "./tasks-page";

type TasksTableSourceProps = {
  allListOptions?: Array<{ id: string; label: string }>;
  allNoteOptions?: TaskEditorLinkedNote[];
  allTagOptions?: string[];
  overlayNode?: ReactNode;
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
  onSetStatus?: (taskId: string, status: TaskStatus) => void;
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
  taskTimerNow?: number;
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

type TasksListAdapterProps = {
  filterRowsNode: ReactNode;
  tableProps: TasksTableSourceProps;
  panelProps: Omit<ComponentProps<typeof TasksListViewPanel>, "agentPlanNode" | "filterRowsNode" | "onShrinkAllColumns">;
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

export function TasksListAdapter({
  filterRowsNode,
  tableProps,
  panelProps,
}: TasksListAdapterProps) {
  const [shrinkAllColumnsToken, setShrinkAllColumnsToken] = useState(0);
  const rows = useMemo(
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

  return (
    <TasksListViewPanel
      {...panelProps}
      onShrinkAllColumns={() => setShrinkAllColumnsToken((current) => current + 1)}
      agentPlanNode={
        <TaskManagementTableV2
          allowInlineInspector
          allListOptions={tableProps.allListOptions}
          allNoteOptions={noteOptions}
          allTagOptions={tableProps.allTagOptions}
          className="max-w-none p-0"
          enableInspector
          onClearSelection={tableProps.onClearSelection}
          overlayNode={tableProps.overlayNode}
          onCreateTaskList={tableProps.onCreateTaskList}
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
          onTaskStatusChange={tableProps.onSetStatus}
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
          secondaryBadgeLabel="List view"
          selectedTaskIds={tableProps.selectedTaskIds}
          showHeader={false}
          shrinkAllColumnsToken={shrinkAllColumnsToken}
          taskTimerNow={tableProps.taskTimerNow}
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
