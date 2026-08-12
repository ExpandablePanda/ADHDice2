import type { PrototypeTaskRow, PrototypeTaskSubtask } from "@/components/ui/task-management-table-v2";
import type {
  Task,
  TaskHistory,
  TaskSubtask,
} from "@/lib/database.types";
import { computeTaskSpecificHistoryStats, getTaskHistoryLastDone } from "@/lib/task-history";
import type { TaskHistoryStreakSummary } from "@/lib/task-history-streak-summaries";
import type { TaskListDefinition } from "@/lib/task-lists";
import type { TaskEditorLinkedNote } from "@/lib/task-notes";
import { formatTaskPriorityLevel, getTaskPriorityLevel } from "@/lib/task-priority";
import { createProjectionDomainRevision } from "@/lib/stable-task-projection";
import { getTaskTrashTimestamp } from "@/lib/task-trash";

const isDevelopment = process.env.NODE_ENV !== "production";
let buildTaskTableRowDebugCount = 0;

export type TaskTableRowContext = {
  displayStatus?: Task["status"];
  focusedTaskIdSet: Set<string>;
  linkedNotes: TaskEditorLinkedNote[];
  listDefinitions: TaskListDefinition[];
  listMemberships: Array<{ id: string; isManual: boolean }>;
  subtasks: TaskSubtask[];
  taskHistory: TaskHistory[];
  taskHistoryStreakSummary?: TaskHistoryStreakSummary;
  todayDateKey: string;
};

export function createStableTaskRowModelCache() {
  const rowsByTaskId = new Map<string, { revision: string; row: PrototypeTaskRow }>();
  return {
    getOrCreate(task: Task, context: TaskTableRowContext) {
      const revision = createProjectionDomainRevision(`task-row:${task.id}`, {
        displayStatus: context.displayStatus,
        focused: context.focusedTaskIdSet.has(task.id),
        history: context.taskHistory,
        linkedNotes: context.linkedNotes,
        listDefinitions: context.listDefinitions,
        listMemberships: context.listMemberships,
        subtasks: context.subtasks,
        task,
        taskHistoryStreakSummary: context.taskHistoryStreakSummary,
        todayDateKey: context.todayDateKey,
      });
      const cached = rowsByTaskId.get(task.id);
      if (cached?.revision === revision) return cached.row;
      const row = buildTaskTableRow(task, context);
      rowsByTaskId.set(task.id, { revision, row });
      return row;
    },
    retain(taskIds: readonly string[]) {
      const retained = new Set(taskIds);
      for (const taskId of rowsByTaskId.keys()) {
        if (!retained.has(taskId)) rowsByTaskId.delete(taskId);
      }
    },
  };
}

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

export function snapshotBuildTaskTableRowDebugCount() {
  return buildTaskTableRowDebugCount;
}

export function buildTaskTableRow(task: Task, context: TaskTableRowContext): PrototypeTaskRow {
  if (isDevelopment) {
    buildTaskTableRowDebugCount += 1;
  }
  const historyStats = context.taskHistoryStreakSummary
    ?? computeTaskSpecificHistoryStats(task, context.taskHistory, context.todayDateKey);
  const missedStreak = historyStats.missedStreak;
  const currentStreak = missedStreak > 0 ? 0 : historyStats.currentStreak;
  const lastDone = context.taskHistoryStreakSummary
    ? {
      dateKey: context.taskHistoryStreakSummary.lastDoneDate,
      timestamp: context.taskHistoryStreakSummary.lastDoneAt,
    }
    : getTaskHistoryLastDone(context.taskHistory);
  const priorities: PrototypeTaskRow["priorities"] = [formatTaskPriorityLevel(getTaskPriorityLevel(task))];

  const listLabels = context.listDefinitions.flatMap((listDefinition) =>
    context.listMemberships.some((membership) => membership.id === listDefinition.id)
      ? [listDefinition.name]
      : [],
  );

  return {
    actualSeconds: task.actual_seconds ?? 0,
    completedAt: task.completed_at,
    createdAt: task.created_at,
    trashedAt: getTaskTrashTimestamp(task),
    updatedAt: task.updated_at,
    dueOn: task.due_on ?? "",
    dueTime: task.due_time ?? "",
    energy: task.energy,
    estimatedMinutes: task.estimated_minutes ?? null,
    id: task.id,
    linkLabel: task.external_link_label ?? "",
    linkUrl: task.external_link_url ?? "",
    lastDoneAt: lastDone?.timestamp ?? null,
    lastDoneDate: lastDone?.dateKey ?? null,
    lists: listLabels,
    linkedNotes: context.linkedNotes.map((note) => ({ id: note.id, title: note.title })),
    notes: task.notes ?? "",
    pinOrder: task.pin_order ?? null,
    pinnedAt: task.pinned_at,
    priorities,
    currentStreak,
    missedStreak,
    repeat: task.repeat_frequency,
    repeatInterval: Math.max(1, task.repeat_interval ?? 1),
    repeatDaysOfWeek: task.repeat_days_of_week ?? [],
    repeatDayOfMonth: task.repeat_day_of_month ?? null,
    repeatMonthlyMode: task.repeat_monthly_mode,
    repeatMonthlyOrdinal: task.repeat_monthly_ordinal,
    repeatMonthlyWeekday: task.repeat_monthly_weekday,
    subtasksAutoReset: task.subtasks_auto_reset ?? false,
    status: context.displayStatus ?? task.status,
    subtasks: buildTaskTableSubtasks(context.subtasks),
    tags: task.tags ?? [],
    title: task.title,
  };
}
