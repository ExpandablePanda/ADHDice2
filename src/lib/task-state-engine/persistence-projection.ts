import type { ProposedTaskStatePatch } from "./types.ts";
import type { TaskStatus } from "@/lib/database.types";

/**
 * The engine can describe internal recurrence facts, but the current task row
 * cannot store them. Keep this boundary explicit for future write work.
 */
export type PersistableTaskStatePatch = Omit<Pick<
  ProposedTaskStatePatch,
  "status" | "dueOn" | "completedAt" | "activeStatusLogicalDate" | "activeOccurrenceDueOn"
>, "status"> & { status?: TaskStatus };

export type PersistedTaskState = {
  status: TaskStatus;
  due_on: string | null;
  completed_at: string | null;
  active_status_logical_date: string | null;
  active_occurrence_due_on: string | null;
};

export type CanonicalPersistableTaskStateValues = Partial<Record<
  keyof PersistableTaskStatePatch,
  TaskStatus | string | null
>>;

function canonicalDate(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const datePrefix = value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/)?.[1];
  return datePrefix ?? value.trim();
}

function canonicalTimestamp(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const trimmed = value.trim();
  const timestamp = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})$/i);
  if (timestamp) {
    const [, date, time, fraction = "", offset] = timestamp;
    const secondMilliseconds = Date.parse(`${date}T${time}${offset}`);
    if (!Number.isNaN(secondMilliseconds)) {
      const paddedFraction = fraction.padEnd(7, "0");
      let epochMicroseconds = secondMilliseconds * 1_000
        + Number(paddedFraction.slice(0, 6));
      if (paddedFraction[6] >= "5") epochMicroseconds += 1;
      const epochSeconds = Math.floor(epochMicroseconds / 1_000_000);
      const microseconds = epochMicroseconds % 1_000_000;
      return `${new Date(epochSeconds * 1_000).toISOString().slice(0, 19)}.${microseconds.toString().padStart(6, "0")}Z`;
    }
  }
  const milliseconds = Date.parse(trimmed);
  return Number.isNaN(milliseconds) ? trimmed : new Date(milliseconds).toISOString().replace("Z", "000Z");
}

function canonicalStatus(value: ProposedTaskStatePatch["status"] | TaskStatus | null | undefined) {
  return value === "unscheduled" ? "pending" : value ?? null;
}

export function canonicalizePersistableTaskStatePatch(
  patch: ProposedTaskStatePatch | PersistableTaskStatePatch,
): CanonicalPersistableTaskStateValues {
  const canonical: CanonicalPersistableTaskStateValues = {};
  if (Object.hasOwn(patch, "status")) canonical.status = canonicalStatus(patch.status);
  if (Object.hasOwn(patch, "dueOn")) canonical.dueOn = canonicalDate(patch.dueOn ?? null);
  if (Object.hasOwn(patch, "completedAt")) canonical.completedAt = canonicalTimestamp(patch.completedAt ?? null);
  if (Object.hasOwn(patch, "activeStatusLogicalDate")) {
    canonical.activeStatusLogicalDate = canonicalDate(patch.activeStatusLogicalDate ?? null);
  }
  if (Object.hasOwn(patch, "activeOccurrenceDueOn")) {
    canonical.activeOccurrenceDueOn = canonicalDate(patch.activeOccurrenceDueOn ?? null);
  }
  return canonical;
}

export function canonicalizeStoredTaskStateForPatch(
  patch: ProposedTaskStatePatch | PersistableTaskStatePatch,
  stored: Partial<PersistedTaskState>,
): CanonicalPersistableTaskStateValues {
  const canonical: CanonicalPersistableTaskStateValues = {};
  if (Object.hasOwn(patch, "status")) canonical.status = canonicalStatus(stored.status);
  if (Object.hasOwn(patch, "dueOn")) canonical.dueOn = canonicalDate(stored.due_on ?? null);
  if (Object.hasOwn(patch, "completedAt")) canonical.completedAt = canonicalTimestamp(stored.completed_at ?? null);
  if (Object.hasOwn(patch, "activeStatusLogicalDate")) {
    canonical.activeStatusLogicalDate = canonicalDate(stored.active_status_logical_date ?? null);
  }
  if (Object.hasOwn(patch, "activeOccurrenceDueOn")) {
    canonical.activeOccurrenceDueOn = canonicalDate(stored.active_occurrence_due_on ?? null);
  }
  return canonical;
}

/**
 * Canonicalize engine values to their database representation and retain only
 * fields whose persisted value would actually change. Omitted engine fields
 * remain omitted; an owned null means clear the database column once.
 */
export function projectPersistableTaskStatePatch(
  patch: ProposedTaskStatePatch,
  stored?: Partial<PersistedTaskState>,
): PersistableTaskStatePatch {
  const projected: PersistableTaskStatePatch = {};
  const canonicalPatch = canonicalizePersistableTaskStatePatch(patch);
  const dateFields = [
    ["dueOn", "due_on"],
    ["activeStatusLogicalDate", "active_status_logical_date"],
    ["activeOccurrenceDueOn", "active_occurrence_due_on"],
  ] as const;
  for (const [patchKey, storedKey] of dateFields) {
    if (!Object.hasOwn(patch, patchKey)) continue;
    const target = canonicalPatch[patchKey] as string | null;
    const current = storedKey in (stored ?? {}) ? canonicalDate(stored?.[storedKey] ?? null) : undefined;
    if (current === undefined || target !== current) projected[patchKey] = target;
  }
  if (Object.hasOwn(patch, "completedAt")) {
    const target = canonicalPatch.completedAt as string | null;
    const current = "completed_at" in (stored ?? {}) ? canonicalTimestamp(stored?.completed_at ?? null) : undefined;
    if (current === undefined || target !== current) projected.completedAt = target;
  }
  const status = canonicalPatch.status as TaskStatus | null | undefined;
  if (status && status !== stored?.status) projected.status = status;
  return projected;
}
