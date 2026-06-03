"use client";

import {
  TaskManagementTableV2,
  type PrototypeTaskRow,
  type PrototypeTaskSubtask,
  type TaskManagementTableColumnId,
  type RunningTaskTimer,
} from "@/components/ui/task-management-table-v2";
import type { AgentPlanTaskItem } from "@/components/ui/agent-plan";
import type { AgentPlanColumnId, AgentPlanSubtaskItem } from "@/components/ui/agent-plan";
import type { TaskEditorLinkedNote } from "@/lib/task-notes";
import type { TaskActualTimeEntry, TaskStatus } from "@/lib/database.types";
import { useState, type ComponentProps, type ReactNode } from "react";
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
  onSetRepeat?: (taskId: string, repeat: PrototypeTaskRow["repeat"]) => void;
  onSetStatus?: (taskId: string, status: TaskStatus) => void;
  onAddTaskSubtask?: (taskId: string) => void;
  onAddChildTaskSubtask?: (subtaskId: string) => void;
  onDeleteTaskSubtask?: (subtaskId: string) => void;
  onRenameTaskSubtask?: (subtaskId: string, title: string) => void;
  onSetTaskSubtaskStatus?: (subtaskId: string, status: TaskStatus) => void;
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
  tasks: AgentPlanTaskItem[];
  onRequestedOpenTaskHandled?: (taskId: string) => void;
};

type TasksListAdapterProps = {
  filterRowsNode: ReactNode;
  tableProps: TasksTableSourceProps;
  panelProps: Omit<ComponentProps<typeof TasksListViewPanel>, "agentPlanNode" | "filterRowsNode">;
};

function toPrototypeStatus(status: AgentPlanTaskItem["status"]): PrototypeTaskRow["status"] {
  return status;
}

function toPrototypeEnergy(task: AgentPlanTaskItem): PrototypeTaskRow["energy"] {
  const energyValue = task.metadata.find((item) => item.label === "Energy")?.value.toLowerCase() ?? "none";
  if (energyValue === "high" || energyValue === "medium" || energyValue === "low") {
    return energyValue;
  }

  return "none";
}

function toPrototypePriorities(task: AgentPlanTaskItem): PrototypeTaskRow["priorities"] {
  const priorities: PrototypeTaskRow["priorities"] = [];
  if (task.isFocused) priorities.push("focus");
  if (task.isImportant) priorities.push("important");
  if (task.isUrgent) priorities.push("urgent");
  return priorities;
}

function toPrototypeSubtasks(subtasks: AgentPlanSubtaskItem[]): PrototypeTaskSubtask[] {
  return subtasks.map((subtask) => ({
    children: toPrototypeSubtasks(subtask.children),
    id: subtask.id,
    status: subtask.status,
    title: subtask.title,
  }));
}

function toPrototypeRows(tasks: AgentPlanTaskItem[]): PrototypeTaskRow[] {
  return tasks.map((task) => ({
    actualSeconds: task.actualSeconds,
    dueOn: task.dueOn ?? "",
    dueTime: task.dueTime ?? "",
    energy: toPrototypeEnergy(task),
    estimatedMinutes: task.estimatedMinutes,
    createdAt: task.createdAt,
    id: task.id,
    linkLabel: task.externalLinkLabel ?? "",
    linkUrl: task.externalLinkUrl ?? "",
    lists: task.lists.map((list) => list.label),
    linkedNotes: task.linkedNotes.map((note) => ({ id: note.id, title: note.title })),
    notes: task.notes,
    priorities: toPrototypePriorities(task),
    repeat: task.repeatFrequency,
    status: toPrototypeStatus(task.status),
    subtasks: toPrototypeSubtasks(task.subtasks),
    tags: task.tags,
    title: task.title,
  }));
}

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
  const rows = toPrototypeRows(tableProps.tasks);
  const visibleColumns: TaskManagementTableColumnId[] = [
    "status_icon",
    "title",
    ...panelProps.listVisibleColumns
      .map((columnId) => TASK_TABLE_COLUMN_MAP[columnId])
      .filter((columnId) => columnId !== "status"),
  ];

  return (
    <TasksListViewPanel
      {...panelProps}
      onShrinkAllColumns={() => setShrinkAllColumnsToken((current) => current + 1)}
      agentPlanNode={
        <TaskManagementTableV2
          allowInlineInspector
          allListOptions={tableProps.allListOptions}
          allNoteOptions={tableProps.allNoteOptions?.map((note) => ({ id: note.id, title: note.title })) ?? []}
          allTagOptions={tableProps.allTagOptions}
          className="max-w-none p-0"
          enableInspector
          onClearSelection={tableProps.onClearSelection}
          overlayNode={tableProps.overlayNode}
          onCreateTaskList={tableProps.onCreateTaskList}
          onOpenBatchDelete={tableProps.onOpenBatchDelete}
          onOpenBatchEdit={tableProps.onOpenBatchEdit}
          onOpenDeleteTask={tableProps.onOpenDeleteTask}
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
