import type {
  Task,
  TaskInsert,
  TaskStatus,
} from "@/lib/database.types";
import { buildTaskPriorityUpdate } from "@/lib/task-priority";

export type TaskDraft = Omit<TaskInsert, "user_id">;

export function buildNewTaskDraft(title: string): TaskDraft {
  return {
    actual_seconds: 0,
    completed_at: null,
    due_on: null,
    due_time: null,
    energy: "none",
    estimated_minutes: null,
    external_link_label: null,
    external_link_url: null,
    notes: null,
    one_step_at_a_time: false,
    ...buildTaskPriorityUpdate(0),
    repeat_day_of_month: null,
    repeat_days_of_week: [],
    repeat_frequency: "none",
    repeat_interval: 1,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    status: "pending",
    subtasks_auto_reset: false,
    tags: [],
    title,
  };
}

export type TaskSubtaskDraft = {
  id: string;
  title: string;
  status: TaskStatus;
  children: TaskSubtaskDraft[];
};

export function createTaskSubtaskDrafts(taskId: string | null, subtasks: Task[]): TaskSubtaskDraft[] {
  function buildTree(parentId: string | null): TaskSubtaskDraft[] {
    return subtasks
      .filter((subtask) => (subtask.parent_task_id ?? null) === parentId)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((subtask) => ({
        children: buildTree(subtask.id),
        id: subtask.id,
        status: subtask.status,
        title: subtask.title,
      }));
  }

  return buildTree(taskId);
}

export function parsePositiveInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseDayOfMonth(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 31 ? parsed : null;
}
