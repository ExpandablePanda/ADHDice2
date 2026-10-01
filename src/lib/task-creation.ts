import type { Task } from "@/lib/database.types";
import type { TaskPriorityLevel } from "@/lib/task-priority";

export type TaskCreationMetadata = Pick<
  Task,
  | "energy"
  | "due_on"
  | "due_time"
  | "repeat_frequency"
  | "repeat_interval"
  | "repeat_days_of_week"
  | "repeat_day_of_month"
  | "repeat_monthly_mode"
  | "repeat_monthly_ordinal"
  | "repeat_monthly_weekday"
  | "repeat_quota_count"
  | "repeat_quota_balance_enabled"
  | "tags"
> & {
  priority_level: TaskPriorityLevel;
};

export type TaskCreationDraft = {
  metadata: TaskCreationMetadata;
  taskTypeSelection: string;
  title: string;
};

export type TaskChildCreationResult = {
  error: string | null;
  taskId: string | null;
};

export type TaskCreationSubmission = Task | TaskChildCreationResult | null;
