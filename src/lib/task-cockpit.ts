import type { Task, TaskHistory as DbTaskHistory, TaskStatus } from "@/lib/database.types";
import { isArchiveLikeTask } from "@/lib/task-complete";
import {
  getTaskBucket,
  isTaskFinished,
  isTaskOpen,
  isTaskOpenStatus,
  isTaskUrgent,
  type TaskBucket,
  type TaskBucketContext,
} from "@/lib/task-buckets";
import type { TaskQuickFilter } from "@/lib/task-ui-state";
import { formatTaskPriorityLabel, getTaskPriorityLevel } from "@/lib/task-priority";
import { todayISO } from "@/lib/utils";
import { formatOptionLabel } from "@/lib/task-label-format";
import { getLatestTaskHistoryEntryOnDate, isTaskHistoryStatus } from "@/lib/task-history";

export type TaskDueDateBucket = "none" | "overdue" | "today" | "upcoming" | "not_due";

export function daysUntil(date: string | null) {
  if (!date) return null;
  const start = new Date(`${todayISO()}T00:00:00`);
  const end = new Date(`${date}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function daysUntilFromDate(date: string | null, todayDateKey: string) {
  if (!date) return null;
  const start = new Date(`${todayDateKey}T00:00:00`);
  const end = new Date(`${date}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function getDueDateBucketForDate(date: string | null, todayDateKey: string): TaskDueDateBucket {
  const difference = daysUntilFromDate(date, todayDateKey);

  if (difference === null) {
    return "none";
  }

  if (difference < 0) {
    return "overdue";
  }

  if (difference === 0) {
    return "today";
  }

  if (difference <= 7) {
    return "upcoming";
  }

  return "not_due";
}

export function normalizeOpenTaskStatusForDueDate(
  task: Pick<Task, "due_on" | "status">,
  todayDateKey: string = todayISO(),
): TaskStatus {
  if (task.status === "delayed") {
    if (!task.due_on) {
      return "delayed";
    }
    const dueBucket = getDueDateBucketForDate(task.due_on, todayDateKey);
    return dueBucket === "upcoming" || dueBucket === "not_due" ? "delayed" : "pending";
  }

  if (task.status !== "pending" && task.status !== "upcoming" && task.status !== "not_due") {
    return task.status;
  }

  const dueBucket = getDueDateBucketForDate(task.due_on, todayDateKey);
  if (dueBucket === "upcoming") {
    return "upcoming";
  }

  if (dueBucket === "not_due") {
    return "not_due";
  }

  return "pending";
}

export function isDueToday(date: string | null) {
  return date === todayISO();
}

export function isOverdue(date: string | null) {
  const difference = daysUntil(date);
  return difference !== null && difference < 0;
}

export function isLater(date: string | null) {
  const difference = daysUntil(date);
  return difference !== null && difference > 1;
}

export function getTaskDueDateBucket(task: Pick<Task, "due_on" | "status">): TaskDueDateBucket {
  const difference = daysUntil(task.due_on);

  if (difference === null) {
    return "none";
  }

  if (difference < 0 && isTaskOpenStatus(task.status)) {
    return "overdue";
  }

  if (difference === 0) {
    return "today";
  }

  if (difference <= 7) {
    return "upcoming";
  }

  return "not_due";
}

function getTaskDisplayStatusForDate(task: Task, todayDateKey: string) {
  if (task.status === "delayed") {
    if (!task.due_on) {
      return "delayed";
    }
    const dueBucket = getDueDateBucketForDate(task.due_on, todayDateKey);

    if (dueBucket === "upcoming" || dueBucket === "not_due") {
      return "delayed";
    }

    if (dueBucket === "overdue") {
      return "missed";
    }

    return "pending";
  }

  if (task.status !== "upcoming" && task.status !== "not_due") {
    return task.status;
  }

  const dueBucket = getDueDateBucketForDate(task.due_on, todayDateKey);
  if (dueBucket === "upcoming") {
    return "upcoming";
  }

  if (dueBucket === "not_due" || dueBucket === "none") {
    return "not_due";
  }

  if (dueBucket === "overdue") {
    return "missed";
  }

  return "pending";
}

export function getTaskDisplayStatus(task: Task) {
  return getTaskDisplayStatusForDate(task, todayISO());
}

function getTaskVisibleStatusOccurrenceDateKey(task: Task, todayDateKey: string) {
  if (task.repeat_frequency === "none") {
    return null;
  }

  if (!task.due_on) {
    return todayDateKey;
  }

  if (task.due_on > todayDateKey) {
    return null;
  }

  return task.due_on;
}

export function getTaskDisplayStatusWithHistory(
  task: Task,
  history: DbTaskHistory[],
  todayDateKey: string,
): TaskStatus {
  if (task.status === "in_progress") {
    return "in_progress";
  }

  if (task.repeat_frequency === "none" || history.length === 0) {
    return getTaskDisplayStatusForDate(task, todayDateKey);
  }

  const currentOccurrenceDateKey = getTaskVisibleStatusOccurrenceDateKey(task, todayDateKey);
  if (!currentOccurrenceDateKey) {
    return getTaskDisplayStatusForDate(task, todayDateKey);
  }

  const currentOccurrenceStatus = getLatestTaskHistoryEntryOnDate(history, currentOccurrenceDateKey)?.status;
  if (currentOccurrenceStatus && isTaskHistoryStatus(currentOccurrenceStatus)) {
    return currentOccurrenceStatus;
  }

  return getTaskDisplayStatusForDate(task, todayDateKey);
}

export function formatDueLabel(date: string | null) {
  const difference = daysUntil(date);
  if (difference === null) return "No date";
  if (difference === 0) return "Today";
  if (difference === 1) return "Tomorrow";
  if (difference < 0) return `${Math.abs(difference)}d overdue`;
  return `${difference}d`;
}

export function formatDueTimeLabel(time: string | null) {
  if (!time) {
    return null;
  }

  const [hours, minutes] = time.split(":");
  const parsedHours = Number.parseInt(hours ?? "", 10);
  const parsedMinutes = Number.parseInt(minutes ?? "", 10);
  if (!Number.isFinite(parsedHours) || !Number.isFinite(parsedMinutes)) {
    return time;
  }

  const normalizedHours = parsedHours % 24;
  const suffix = normalizedHours >= 12 ? "PM" : "AM";
  const displayHours = normalizedHours % 12 === 0 ? 12 : normalizedHours % 12;
  return `${displayHours}:${String(parsedMinutes).padStart(2, "0")} ${suffix}`;
}

export function buildTaskBucketCounts(tasks: Task[], context: TaskBucketContext) {
  return tasks.reduce<Record<TaskBucket, number>>((accumulator, task) => {
    accumulator.all += 1;
    accumulator[getTaskBucket(task, context)] += 1;
    return accumulator;
  }, {
    all: 0,
    inbox: 0,
    today: 0,
    focus: 0,
    urgent: 0,
    quick_wins: 0,
    recurring: 0,
    waiting: 0,
    later: 0,
    done: 0,
    missed: 0,
    archive: 0,
    trash: 0,
  });
}

export function sortTasksForCockpit(tasks: Task[], context: TaskBucketContext) {
  const todayKey = todayISO();
  return tasks
    .map((task) => buildTaskCockpitSortKey(task, context, todayKey))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      if (left.due !== right.due) {
        return left.due.localeCompare(right.due);
      }

      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return right.createdAt.localeCompare(left.createdAt);
    })
    .map(({ task }) => task);
}

type TaskCockpitSortKey = {
  createdAt: string;
  due: string;
  score: number;
  sortOrder: number;
  task: Task;
};

const TASK_BUCKET_BASE_SCORE: Record<TaskBucket, number> = {
  all: 5,
  missed: 0,
  today: 10,
  focus: 20,
  urgent: 30,
  quick_wins: 40,
  recurring: 50,
  waiting: 60,
  later: 70,
  inbox: 80,
  done: 90,
  archive: 95,
  trash: 100,
};

function buildTaskCockpitSortKey(task: Task, context: TaskBucketContext, todayKey: string): TaskCockpitSortKey {
  const isOpen = isTaskOpen(task);
  const isFinished = isTaskFinished(task);
  const isFocused = context.focusedTaskIds.has(task.id);
  const isDueTodayTask = task.due_on === todayKey;
  const isOverdueTask = task.due_on !== null && task.due_on < todayKey;
  const priorityLevel = getTaskPriorityLevel(task);
  const isUrgentTask = isOpen && priorityLevel === 5;
  const isQuickWinTask = isOpen
    && task.energy === "low"
    && (task.estimated_minutes === null || task.estimated_minutes <= 20);
  const bucket = getTaskCockpitBucket(task, context, todayKey, {
    isDueTodayTask,
    isFinished,
    isFocused,
    isOpen,
    isOverdueTask,
    isQuickWinTask,
    isUrgentTask,
  });

  let score = TASK_BUCKET_BASE_SCORE[bucket];
  if (isOpen && isOverdueTask) score -= 6;
  if (isDueTodayTask) score -= 4;
  if (isFocused) score -= 3;
  if (isUrgentTask) score -= 2;
  if (priorityLevel >= 4) score -= 1;
  if (isQuickWinTask) score -= 1;

  return {
    createdAt: task.created_at,
    due: task.due_on ?? "9999-12-31",
    score,
    sortOrder: task.sort_order,
    task,
  };
}

function getTaskCockpitBucket(
  task: Task,
  context: TaskBucketContext,
  todayKey: string,
  state: {
    isDueTodayTask: boolean;
    isFinished: boolean;
    isFocused: boolean;
    isOpen: boolean;
    isOverdueTask: boolean;
    isQuickWinTask: boolean;
    isUrgentTask: boolean;
  },
): TaskBucket {
  if (isArchiveLikeTask(task)) {
    return "archive";
  }

  if (task.status === "trashed") {
    return "trash";
  }

  if (state.isFinished) {
    return "done";
  }

  if (task.status === "missed" || (state.isOpen && state.isOverdueTask)) {
    return "missed";
  }

  const routedBucket = context.routing[task.id];
  if (routedBucket === "today" && state.isOpen && state.isDueTodayTask) {
    return "today";
  }
  if (routedBucket === "inbox") {
    return "inbox";
  }
  if (routedBucket === "waiting") {
    return "waiting";
  }
  if (routedBucket === "later") {
    return "later";
  }
  if (routedBucket === "quick_wins") {
    return "quick_wins";
  }

  if (state.isOpen
    && !task.due_on
    && getTaskPriorityLevel(task) < 4
    && task.repeat_frequency === "none"
    && task.status === "pending") {
    return "inbox";
  }

  if (state.isOpen && state.isFocused) {
    return "focus";
  }

  if (state.isUrgentTask) {
    return "urgent";
  }

  if (state.isOpen && state.isDueTodayTask) {
    return "today";
  }

  if (state.isQuickWinTask) {
    return "quick_wins";
  }

  if (state.isOpen && task.repeat_frequency !== "none") {
    return "recurring";
  }

  if (state.isOpen && (task.status === "upcoming" || task.status === "not_due" || (task.due_on !== null && task.due_on > todayKey))) {
    return "later";
  }

  return "today";
}

export function formatTaskDueLabel(task: Task) {
  if (!task.due_on) {
    return "No date";
  }

  if (isOverdue(task.due_on) && isTaskOpen(task)) {
    return `Overdue ${task.due_on}`;
  }

  if (isDueToday(task.due_on)) {
    return "Today";
  }

  if (daysUntil(task.due_on) === 1) {
    return "Tomorrow";
  }

  return task.due_on;
}

export function formatRolloverLabel(task: Task) {
  if (task.status === "missed") {
    return "Missed";
  }

  if (isTaskOpen(task) && isOverdue(task.due_on)) {
    const days = Math.abs(daysUntil(task.due_on) ?? 0);
    return days <= 1 ? "1 day" : `${days} days`;
  }

  if (task.repeat_frequency !== "none") {
    return "Repeats";
  }

  return "Fresh";
}

export function describePlanningCandidate(task: Task) {
  const parts = [
    formatTaskDueLabel(task),
    formatOptionLabel(task.energy),
    task.repeat_frequency !== "none" ? formatOptionLabel(task.repeat_frequency) : null,
    getTaskPriorityLevel(task) === 5 ? "Priority 5" : null,
  ].filter(Boolean);

  return parts.join(" · ");
}

export function getListPriorityLabel(task: Task, focusedTaskIdSet: Set<string>) {
  if (focusedTaskIdSet.has(task.id)) {
    return "Focus";
  }
  return formatTaskPriorityLabel(getTaskPriorityLevel(task));
}

export function matchesTaskQuickFilter(task: Task, filter: TaskQuickFilter, focusedTaskIds: string[]) {
  switch (filter) {
    case "active":
      return isTaskOpen(task);
    case "done":
      return isTaskFinished(task);
    case "urgent":
      return isTaskUrgent(task);
    case "today":
      return isTaskOpen(task) && isDueToday(task.due_on);
    case "focused":
      return isTaskOpen(task) && focusedTaskIds.includes(task.id);
    default:
      return true;
  }
}
