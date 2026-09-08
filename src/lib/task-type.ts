export type TaskType = "task" | "pursuit" | "goal" | "custom";

export const TASK_TYPE_OPTIONS: ReadonlyArray<{ label: string; value: TaskType }> = [
  { label: "Task", value: "task" },
  { label: "Pursuit", value: "pursuit" },
  { label: "Goal", value: "goal" },
  { label: "Custom", value: "custom" },
];

export function isTaskType(value: unknown): value is TaskType {
  return value === "task" || value === "pursuit" || value === "goal" || value === "custom";
}

export function normalizeTaskType(value: unknown): TaskType {
  return isTaskType(value) ? value : "task";
}

export function formatTaskTypeLabel(value: unknown): string {
  return TASK_TYPE_OPTIONS.find((option) => option.value === normalizeTaskType(value))?.label ?? "Task";
}
