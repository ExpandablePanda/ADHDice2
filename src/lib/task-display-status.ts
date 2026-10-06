import type { TaskStatus } from "@/lib/database.types";

/** UI-only active status projection; never persist `unscheduled` as TaskStatus. */
export type TaskDisplayStatus = TaskStatus | "unscheduled";
export type TaskDisplayStatusByTaskId = Record<string, TaskDisplayStatus>;

/**
 * `upcoming` remains readable for database compatibility, but is no longer a
 * current product status. Read and presentation authorities normalize it to
 * the semantic replacement before filtering, counting, or rendering.
 */
export function normalizeTaskDisplayStatus(status: TaskDisplayStatus): Exclude<TaskDisplayStatus, "upcoming">;
export function normalizeTaskDisplayStatus(status: string): string;
export function normalizeTaskDisplayStatus(status: string) {
  return status === "upcoming" ? "not_due" : status;
}
