import type { Task } from "@/lib/database.types";
import {
  getTaskBucket,
  isTaskFinished,
  isTaskOpen,
  isTaskQuickWin,
  isTaskUrgent,
  type TaskBucket,
  type TaskBucketContext,
} from "@/lib/task-buckets";
import type { TaskQuickFilter } from "@/lib/task-ui-state";
import { todayISO } from "@/lib/utils";
import { formatOptionLabel } from "@/lib/task-label-format";

export function daysUntil(date: string | null) {
  if (!date) return null;
  const start = new Date(`${todayISO()}T00:00:00`);
  const end = new Date(`${date}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
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
  });
}

export function sortTasksForCockpit(tasks: Task[], context: TaskBucketContext) {
  return [...tasks].sort((left, right) => {
    const leftScore = getTaskCockpitSortScore(left, context);
    const rightScore = getTaskCockpitSortScore(right, context);

    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    const leftDue = left.due_on ?? "9999-12-31";
    const rightDue = right.due_on ?? "9999-12-31";
    if (leftDue !== rightDue) {
      return leftDue.localeCompare(rightDue);
    }

    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order;
    }

    return right.created_at.localeCompare(left.created_at);
  });
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
    task.is_urgent ? "Urgent" : null,
  ].filter(Boolean);

  return parts.join(" · ");
}

export function getListPriorityLabel(task: Task, focusedTaskIdSet: Set<string>) {
  if (task.is_urgent) {
    return "Urgent";
  }
  if (task.is_important) {
    return "Important";
  }
  if (focusedTaskIdSet.has(task.id)) {
    return "Focus";
  }
  return "None";
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

function getTaskCockpitSortScore(task: Task, context: TaskBucketContext) {
  const bucket = getTaskBucket(task, context);
  const bucketBase: Record<TaskBucket, number> = {
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
  };

  let score = bucketBase[bucket];
  if (isTaskOpen(task) && isOverdue(task.due_on)) score -= 6;
  if (isDueToday(task.due_on)) score -= 4;
  if (context.focusedTaskIds.has(task.id)) score -= 3;
  if (isTaskUrgent(task)) score -= 2;
  if (task.priority === "high") score -= 1;
  if (isTaskQuickWin(task)) score -= 1;
  return score;
}
