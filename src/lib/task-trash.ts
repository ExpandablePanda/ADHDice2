import type { Task } from "@/lib/database.types";

export const TRASH_RETENTION_DAYS = 30;
const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

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

export function isTaskInRecentTrash(task: Pick<Task, "status" | "trashed_at">, nowMs = Date.now()) {
  if (task.status !== "trashed" || !task.trashed_at) {
    return false;
  }

  const trashedAtMs = Date.parse(task.trashed_at);
  return Number.isFinite(trashedAtMs) && trashedAtMs >= nowMs - TRASH_RETENTION_MS;
}
