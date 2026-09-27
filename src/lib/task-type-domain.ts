export type TaskType = "task" | "custom";

export function isTaskType(value: unknown): value is TaskType {
  return value === "task" || value === "custom";
}

/** Parse the persisted Task Type without importing presentation metadata. */
export function normalizeTaskType(value: unknown): TaskType {
  if (value === "pursuit" || value === "goal") {
    throw new Error(`Task Type '${value}' is retired and cannot be normalized.`);
  }
  return isTaskType(value) ? value : "task";
}
