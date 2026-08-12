import type { Task } from "@/lib/database.types";
import type { CanonicalTaskStateColumns } from "@/lib/task-state-canonical/types";

export const TRASH_RETENTION_DAYS = 30;
const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export type TaskTrashRead = Pick<Task, "status" | "trashed_at"> & Partial<Pick<
  CanonicalTaskStateColumns,
  "container_state" | "container_trashed_at"
>>;

/**
 * Canonical container state owns current Trash membership and its retention
 * timestamp. Null/absent container state is retained as a compatibility seam
 * for legacy or incompletely migrated rows.
 */
export function getTaskTrashTimestamp(task: TaskTrashRead): string | null {
  if (task.container_state === "trashed") {
    return task.container_trashed_at ?? null;
  }
  if (task.container_state === "active" || task.container_state === "archived") {
    return null;
  }
  return task.status === "trashed" ? task.trashed_at : null;
}

export function getTrashDaysRemaining(trashedAt: string | null, nowMs = Date.now()) {
  if (!trashedAt) {
    return null;
  }

  const trashedAtMs = Date.parse(trashedAt);
  if (Number.isNaN(trashedAtMs)) {
    return null;
  }

  const expiresAtMs = trashedAtMs + TRASH_RETENTION_MS;
  const remainingMs = expiresAtMs - nowMs;
  if (remainingMs <= 0) {
    return 0;
  }

  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
}

export function isTaskInRecentTrash(task: TaskTrashRead, nowMs = Date.now()) {
  const trashedAt = getTaskTrashTimestamp(task);
  if (!trashedAt) {
    return false;
  }

  const trashedAtMs = Date.parse(trashedAt);
  return Number.isFinite(trashedAtMs) && trashedAtMs >= nowMs - TRASH_RETENTION_MS;
}
