import type { TaskHistory } from "../database.types.ts";

type TaskHistoryIdentityEntry = Pick<TaskHistory, "id" | "task_id" | "entry_date" | "created_at" | "updated_at">
  & Pick<TaskHistory, "canonical_fact_id">;

export function getTaskHistoryLogicalIdentity(entry: Pick<TaskHistory, "task_id" | "entry_date">) {
  return `${entry.task_id}:${entry.entry_date}`;
}

function compareHistoryRowFreshness(left: TaskHistoryIdentityEntry, right: TaskHistoryIdentityEntry) {
  const leftIsCanonical = Boolean(left.canonical_fact_id);
  const rightIsCanonical = Boolean(right.canonical_fact_id);
  if (leftIsCanonical !== rightIsCanonical) {
    return leftIsCanonical ? 1 : -1;
  }
  const leftTimestamp = left.updated_at || left.created_at || null;
  const rightTimestamp = right.updated_at || right.created_at || null;
  if (leftTimestamp !== rightTimestamp) {
    if (!leftTimestamp) return -1;
    if (!rightTimestamp) return 1;
    return leftTimestamp < rightTimestamp ? -1 : 1;
  }
  return left.id.localeCompare(right.id);
}

/** Keep the canonical/freshest fact for each Task and logical date. */
export function deduplicateTaskHistoryByLogicalDate<T extends TaskHistoryIdentityEntry>(history: readonly T[]) {
  const byLogicalDate = new Map<string, T>();
  for (const entry of history) {
    const identity = getTaskHistoryLogicalIdentity(entry);
    const existing = byLogicalDate.get(identity);
    if (!existing || compareHistoryRowFreshness(existing, entry) <= 0) {
      byLogicalDate.set(identity, entry);
    }
  }
  return [...byLogicalDate.values()];
}
