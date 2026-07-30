import type { Task, TaskHistory } from "../src/lib/database.types.ts";

export const SHADOW_NOW = "2026-07-30T14:00:00.000Z";

export function legacyTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-default",
    user_id: "user-1",
    parent_task_id: null,
    revision: 1,
    title: "Shadow fixture",
    notes: null,
    status: "pending",
    priority: "normal",
    priority_level: 0,
    energy: "none",
    is_urgent: false,
    is_important: false,
    due_on: "2026-07-30",
    active_status_logical_date: null,
    active_occurrence_due_on: null,
    scheduled_on: null,
    due_time: null,
    estimated_minutes: null,
    actual_seconds: 0,
    tags: [],
    external_link_label: null,
    external_link_url: null,
    one_step_at_a_time: false,
    subtasks_auto_reset: false,
    repeat_frequency: "none",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    pinned_at: null,
    pin_order: null,
    sort_order: 0,
    completed_at: null,
    trashed_at: null,
    created_at: "2026-06-01T12:00:00.000Z",
    updated_at: "2026-07-30T12:00:00.000Z",
    ...overrides,
  };
}

export function legacyHistory(
  taskId: string,
  entryDate: string,
  status: TaskHistory["status"],
  overrides: Partial<TaskHistory> = {},
): TaskHistory {
  return {
    id: `history-${taskId}-${entryDate}-${status}`,
    task_id: taskId,
    user_id: "user-1",
    entry_date: entryDate,
    occurrence_key: null,
    occurrence_due_on: null,
    status,
    event_type: status === "complete" ? "completed_permanently" : "status",
    counted_as_due_occurrence: false,
    was_completed: status === "done" || status === "did_my_best" || status === "complete",
    created_at: `${entryDate}T14:00:00.000Z`,
    updated_at: `${entryDate}T14:00:00.000Z`,
    ...overrides,
  };
}

const tasks: Task[] = [
  legacyTask({ id: "one-off-overdue", title: "One-off June 1", due_on: "2026-06-01" }),
  legacyTask({ id: "daily-overdue", title: "Daily June 1", due_on: "2026-06-01", repeat_frequency: "daily" }),
  legacyTask({ id: "every-x-early", title: "Every X early", due_on: "2026-08-01", repeat_frequency: "custom", repeat_interval: 5 }),
  legacyTask({ id: "every-x-undated", title: "Every X undated", due_on: null, repeat_frequency: "custom", repeat_interval: 3 }),
  legacyTask({ id: "continuous-overdue", title: "Continuous overdue", status: "missed", due_on: "2026-07-28", repeat_frequency: "daily" }),
  legacyTask({ id: "dormant-unscheduled", title: "Dormant Unscheduled", status: "pending", due_on: null }),
  legacyTask({ id: "unscheduled-best", title: "Unscheduled best then inactive", status: "pending", due_on: null }),
  legacyTask({
    id: "unscheduled-progress",
    title: "Unscheduled In Progress",
    status: "in_progress",
    due_on: null,
    active_status_logical_date: "2026-07-29",
  }),
  legacyTask({
    id: "weekly-early",
    title: "Weekly early",
    due_on: "2026-08-02",
    repeat_frequency: "weekly",
    repeat_days_of_week: [0],
  }),
  legacyTask({
    id: "monthly-fixed-early",
    title: "Monthly fixed early",
    due_on: "2026-08-15",
    repeat_frequency: "monthly",
    repeat_day_of_month: 15,
  }),
  legacyTask({
    id: "monthly-ordinal-early",
    title: "Monthly ordinal early",
    due_on: "2026-08-04",
    repeat_frequency: "monthly",
    repeat_monthly_mode: "ordinal_weekday",
    repeat_monthly_ordinal: "first",
    repeat_monthly_weekday: 2,
  }),
  legacyTask({
    id: "multiple-weekdays",
    title: "Multiple weekdays",
    due_on: "2026-07-31",
    repeat_frequency: "weekly",
    repeat_days_of_week: [1, 3, 5],
  }),
  legacyTask({ id: "delay-anchor", title: "Delay anchor", status: "delayed", due_on: "2026-08-04", repeat_frequency: "daily" }),
  legacyTask({ id: "upcoming-seven", title: "Upcoming", status: "upcoming", due_on: "2026-08-06" }),
  legacyTask({ id: "not-due-eight", title: "Not Due", status: "not_due", due_on: "2026-08-07" }),
  legacyTask({ id: "manual-missed", title: "Manual Missed", status: "missed", due_on: "2026-07-30", repeat_frequency: "daily" }),
  legacyTask({ id: "complete", title: "Complete", status: "complete", due_on: null, completed_at: "2026-07-29T14:00:00.000Z" }),
  legacyTask({ id: "archived", title: "Archived", status: "archived", due_on: null }),
  legacyTask({ id: "trashed", title: "Trashed", status: "trashed", due_on: null, trashed_at: "2026-07-29T14:00:00.000Z" }),
];

const history: TaskHistory[] = [
  legacyHistory("every-x-early", "2026-07-29", "done"),
  legacyHistory("every-x-undated", "2026-07-20", "done"),
  legacyHistory("continuous-overdue", "2026-07-28", "missed"),
  legacyHistory("continuous-overdue", "2026-07-29", "missed"),
  legacyHistory("unscheduled-best", "2026-07-28", "did_my_best"),
  legacyHistory("weekly-early", "2026-07-30", "done", {
    occurrence_due_on: "2026-08-02",
    occurrence_key: "task:weekly-early:occurrence:2026-08-02",
    counted_as_due_occurrence: true,
  }),
  legacyHistory("monthly-fixed-early", "2026-07-30", "done", {
    occurrence_due_on: "2026-08-15",
    occurrence_key: "task:monthly-fixed-early:occurrence:2026-08-15",
    counted_as_due_occurrence: true,
  }),
  legacyHistory("monthly-ordinal-early", "2026-07-30", "done", {
    occurrence_due_on: "2026-08-04",
    occurrence_key: "task:monthly-ordinal-early:occurrence:2026-08-04",
    counted_as_due_occurrence: true,
  }),
  legacyHistory("multiple-weekdays", "2026-07-30", "done", {
    occurrence_due_on: "2026-07-31",
    occurrence_key: "task:multiple-weekdays:occurrence:2026-07-31",
    counted_as_due_occurrence: true,
  }),
  legacyHistory("delay-anchor", "2026-07-30", "delayed"),
  legacyHistory("manual-missed", "2026-07-30", "missed", {
    occurrence_due_on: "2026-07-30",
    occurrence_key: "task:manual-missed:occurrence:2026-07-30",
    counted_as_due_occurrence: true,
  }),
  legacyHistory("complete", "2026-07-29", "complete"),
];

export const KNOWN_SHADOW_SCENARIOS = { tasks, history };
