import type { Task, TaskEnergy, TaskRepeatFrequency, TaskStatus } from "@/lib/database.types";
import { todayISO } from "@/lib/utils";

export type TaskBucket =
  | "all"
  | "inbox"
  | "today"
  | "focus"
  | "urgent"
  | "quick_wins"
  | "recurring"
  | "waiting"
  | "later"
  | "done"
  | "missed"
  | "trash";

export type TaskRoutingBucket = "inbox" | "today" | "quick_wins" | "waiting" | "later";

export type TaskBucketContext = {
  focusedTaskIds: Set<string>;
  routing: Record<string, TaskRoutingBucket>;
};

const OPEN_TASK_STATUSES: TaskStatus[] = ["pending", "in_progress", "upcoming", "not_due", "missed"];
const FINISHED_TASK_STATUSES: TaskStatus[] = ["done", "did_my_best"];

export function isTaskOpenStatus(status: TaskStatus) {
  return OPEN_TASK_STATUSES.includes(status);
}

export function isTaskFinishedStatusValue(status: TaskStatus) {
  return FINISHED_TASK_STATUSES.includes(status);
}

export function isTaskOpen(task: Task) {
  return isTaskOpenStatus(task.status);
}

export function isTaskFinished(task: Task) {
  return isTaskFinishedStatusValue(task.status);
}

export function isTaskUrgent(task: Task) {
  return isTaskOpen(task) && task.is_urgent;
}

export function isTaskImportant(task: Task) {
  return isTaskOpen(task) && (task.is_important || task.priority === "high");
}

export function shouldRouteTaskToInbox(task: Task) {
  return isTaskOpen(task)
    && !task.due_on
    && !task.is_urgent
    && !task.is_important
    && task.repeat_frequency === "none"
    && task.status === "pending";
}

export function isTaskQuickWin(task: Task) {
  return isTaskOpen(task)
    && task.energy === "low"
    && (task.estimated_minutes === null || task.estimated_minutes <= 20);
}

export function getTaskBucket(task: Task, context: TaskBucketContext): TaskBucket {
  const todayKey = todayISO();

  if (task.status === "archived") {
    return "trash";
  }

  if (isTaskFinished(task)) {
    return "done";
  }

  if (task.status === "missed" || (isTaskOpen(task) && task.due_on !== null && task.due_on < todayKey)) {
    return "missed";
  }

  const routedBucket = context.routing[task.id];
  if (routedBucket === "today" && isTaskOpen(task) && task.due_on === todayKey) {
    return "today";
  }
  if (routedBucket === "inbox") return "inbox";
  if (routedBucket === "waiting") return "waiting";
  if (routedBucket === "later") return "later";
  if (routedBucket === "quick_wins") return "quick_wins";

  if (shouldRouteTaskToInbox(task)) {
    return "inbox";
  }

  if (isTaskOpen(task) && context.focusedTaskIds.has(task.id)) {
    return "focus";
  }

  if (isTaskUrgent(task)) {
    return "urgent";
  }

  if (isTaskOpen(task) && task.due_on === todayKey) {
    return "today";
  }

  if (isTaskQuickWin(task)) {
    return "quick_wins";
  }

  if (isTaskOpen(task) && task.repeat_frequency !== "none") {
    return "recurring";
  }

  if (isTaskOpen(task) && (task.status === "upcoming" || task.status === "not_due" || (task.due_on !== null && task.due_on > todayKey))) {
    return "later";
  }

  return "today";
}

export function createTask(params: Partial<Task> & Pick<Task, "id" | "title" | "status" | "created_at" | "sort_order">): Task {
  return {
    user_id: "test-user",
    notes: null,
    priority: "normal",
    energy: "medium" as TaskEnergy,
    is_urgent: false,
    is_important: false,
    due_on: null,
    due_time: null,
    estimated_minutes: null,
    tags: [],
    external_link_label: null,
    external_link_url: null,
    one_step_at_a_time: false,
    repeat_frequency: "none" as TaskRepeatFrequency,
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    subtasks_auto_reset: false,
    completed_at: null,
    updated_at: params.created_at,
    actual_seconds: 0,
    ...params,
  };
}
