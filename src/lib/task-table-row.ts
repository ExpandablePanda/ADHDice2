import type { PrototypeTaskRow, PrototypeTaskSubtask } from "@/components/ui/task-management-table-v2";
import type {
  Task,
  TaskHistory,
  TaskSubtask,
} from "@/lib/database.types";
import { getTaskDisplayStatus } from "@/lib/task-cockpit";
import { computeTaskSpecificHistoryStats } from "@/lib/task-history";
import type { TaskListDefinition } from "@/lib/task-lists";
import type { TaskEditorLinkedNote } from "@/lib/task-notes";

type TaskTableRowContext = {
  focusedTaskIdSet: Set<string>;
  linkedNotes: TaskEditorLinkedNote[];
  listDefinitions: TaskListDefinition[];
  listMemberships: Array<{ id: string; isManual: boolean }>;
  subtasks: TaskSubtask[];
  taskHistory: TaskHistory[];
  todayDateKey: string;
};

function buildTaskTableSubtasks(subtasks: TaskSubtask[], parentId: string | null = null): PrototypeTaskSubtask[] {
  return subtasks
    .filter((subtask) => (subtask.parent_subtask_id ?? null) === parentId)
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((subtask) => ({
      children: buildTaskTableSubtasks(subtasks, subtask.id),
      id: subtask.id,
      status: subtask.status,
      title: subtask.title,
    }));
}

export function buildTaskTableRow(task: Task, context: TaskTableRowContext): PrototypeTaskRow {
  const historyStats = computeTaskSpecificHistoryStats(task, context.taskHistory, context.todayDateKey);
  const priorities: PrototypeTaskRow["priorities"] = [];

  if (context.focusedTaskIdSet.has(task.id)) priorities.push("focus");
  if (task.is_important) priorities.push("important");
  if (task.is_urgent) priorities.push("urgent");

  const listLabels = context.listDefinitions.flatMap((listDefinition) =>
    context.listMemberships.some((membership) => membership.id === listDefinition.id)
      ? [listDefinition.name]
      : [],
  );

  return {
    actualSeconds: task.actual_seconds ?? 0,
    createdAt: task.created_at,
    trashedAt: task.trashed_at,
    updatedAt: task.updated_at,
    dueOn: task.due_on ?? "",
    dueTime: task.due_time ?? "",
    energy: task.energy,
    estimatedMinutes: task.estimated_minutes ?? null,
    id: task.id,
    linkLabel: task.external_link_label ?? "",
    linkUrl: task.external_link_url ?? "",
    lists: listLabels,
    linkedNotes: context.linkedNotes.map((note) => ({ id: note.id, title: note.title })),
    notes: task.notes ?? "",
    priorities,
    currentStreak: historyStats.currentStreak,
    missedStreak: historyStats.missedStreak,
    repeat: task.repeat_frequency,
    repeatInterval: Math.max(1, task.repeat_interval ?? 1),
    repeatDaysOfWeek: task.repeat_days_of_week ?? [],
    repeatDayOfMonth: task.repeat_day_of_month ?? null,
    subtasksAutoReset: task.subtasks_auto_reset ?? false,
    status: getTaskDisplayStatus(task),
    subtasks: buildTaskTableSubtasks(context.subtasks),
    tags: task.tags ?? [],
    title: task.title,
  };
}
