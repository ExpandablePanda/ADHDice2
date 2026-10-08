import type {
  HealthCheckIn,
  HealthJournalSignal,
  HealthJournalSignalOccurrence,
  HealthJournalSignalValue,
  HealthSymptom,
  HealthSymptomEntry,
} from "@/lib/database.types";

export type HealthJournalPendingEntity =
  | "checkin"
  | "signal"
  | "signal_value"
  | "signal_occurrence"
  | "symptom"
  | "symptom_entry";

export type HealthJournalPendingUpsert =
  | { entity: "checkin"; row: HealthCheckIn }
  | { entity: "signal"; row: HealthJournalSignal }
  | { entity: "signal_value"; row: HealthJournalSignalValue }
  | { entity: "signal_occurrence"; row: HealthJournalSignalOccurrence }
  | { entity: "symptom"; row: HealthSymptom }
  | { entity: "symptom_entry"; row: HealthSymptomEntry };

export type HealthJournalPendingMutation =
  | (HealthJournalPendingUpsert & { intent: "create" | "update"; operation: "upsert" })
  | (HealthJournalPendingUpsert & { intent: "unknown"; operation: "upsert" })
  | { entity: HealthJournalPendingEntity; id: string; journalEntryId?: string; operation: "delete" };

export type HealthJournalPendingMutationJournal = Record<string, HealthJournalPendingMutation>;

function entityKey(entity: HealthJournalPendingEntity, row: { id: string; journal_entry_id?: string; signal_id?: string }) {
  return entity === "signal_value" && row.journal_entry_id && row.signal_id
    ? `${row.journal_entry_id}:${row.signal_id}`
    : row.id;
}

export function getHealthJournalPendingMutationKey(
  entity: HealthJournalPendingEntity,
  rowOrId: { id: string; journal_entry_id?: string; signal_id?: string } | string,
) {
  return `${entity}:${typeof rowOrId === "string" ? rowOrId : entityKey(entity, rowOrId)}`;
}

export function recordHealthJournalPendingUpsert(
  journal: HealthJournalPendingMutationJournal,
  mutation: HealthJournalPendingUpsert & { intent: "create" | "update" },
): HealthJournalPendingMutationJournal {
  const key = getHealthJournalPendingMutationKey(mutation.entity, mutation.row);
  return { ...journal, [key]: { ...mutation, operation: "upsert" } as HealthJournalPendingMutation };
}

export function quarantineHealthJournalPendingUpsert(
  journal: HealthJournalPendingMutationJournal,
  mutation: HealthJournalPendingUpsert,
  remoteIds: ReadonlySet<string>,
): HealthJournalPendingMutationJournal {
  if (remoteIds.has(mutation.row.id)) return journal;
  const key = getHealthJournalPendingMutationKey(mutation.entity, mutation.row);
  const hasExistingIntent = Object.values(journal).some((existing) => {
    if (existing.entity !== mutation.entity) return false;
    if (existing.operation === "delete") return existing.id === mutation.row.id;
    return getHealthJournalPendingMutationKey(existing.entity, existing.row) === key;
  });
  if (hasExistingIntent) return journal;
  return {
    ...journal,
    [key]: { ...mutation, intent: "unknown", operation: "upsert" },
  };
}

export function recordHealthJournalPendingDelete(
  journal: HealthJournalPendingMutationJournal,
  entity: HealthJournalPendingEntity,
  id: string,
  journalEntryId?: string,
): HealthJournalPendingMutationJournal {
  const key = getHealthJournalPendingMutationKey(entity, id);
  return { ...journal, [key]: { entity, id, journalEntryId, operation: "delete" } };
}

export function clearHealthJournalPendingMutation(
  journal: HealthJournalPendingMutationJournal,
  entity: HealthJournalPendingEntity,
  rowOrId: { id: string; journal_entry_id?: string; signal_id?: string } | string,
): HealthJournalPendingMutationJournal {
  const key = getHealthJournalPendingMutationKey(entity, rowOrId);
  if (!journal[key]) return journal;
  const nextJournal = { ...journal };
  delete nextJournal[key];
  return nextJournal;
}

export function clearHealthJournalPendingMutationsForEntry(
  journal: HealthJournalPendingMutationJournal,
  journalEntryId: string,
): HealthJournalPendingMutationJournal {
  const nextJournal = { ...journal };
  for (const [key, mutation] of Object.entries(nextJournal)) {
    if (mutation.entity === "checkin" && (mutation.operation === "delete" ? mutation.id : mutation.row.id) === journalEntryId) {
      delete nextJournal[key];
    } else if (mutation.operation === "delete" && mutation.journalEntryId === journalEntryId) {
      delete nextJournal[key];
    } else if (mutation.operation === "upsert" && "journal_entry_id" in mutation.row && mutation.row.journal_entry_id === journalEntryId) {
      delete nextJournal[key];
    }
  }
  return nextJournal;
}

export function clearCompletedHealthJournalPendingMutations(
  journal: HealthJournalPendingMutationJournal,
  completed: readonly { key: string; mutation: HealthJournalPendingMutation }[],
): HealthJournalPendingMutationJournal {
  let nextJournal = journal;
  for (const { key, mutation } of completed) {
    if (nextJournal[key] !== mutation) continue;
    const updated = { ...nextJournal };
    delete updated[key];
    nextJournal = updated;
  }
  return nextJournal;
}

export function normalizeHealthJournalPendingMutations(value: unknown): HealthJournalPendingMutationJournal {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const validEntities: HealthJournalPendingEntity[] = ["checkin", "signal", "signal_value", "signal_occurrence", "symptom", "symptom_entry"];
  const journal: HealthJournalPendingMutationJournal = {};
  for (const candidate of Object.values(value)) {
    if (!candidate || typeof candidate !== "object") continue;
    const mutation = candidate as Partial<HealthJournalPendingMutation>;
    if (!mutation.entity || !validEntities.includes(mutation.entity)) continue;
    if (mutation.operation === "delete" && typeof mutation.id === "string") {
      const normalized: HealthJournalPendingMutation = {
        entity: mutation.entity,
        id: mutation.id,
        ...(typeof mutation.journalEntryId === "string" ? { journalEntryId: mutation.journalEntryId } : {}),
        operation: "delete",
      };
      journal[getHealthJournalPendingMutationKey(normalized.entity, normalized.id)] = normalized;
      continue;
    }
    if (mutation.operation !== "upsert" || !mutation.row || typeof mutation.row !== "object") continue;
    const row = mutation.row as { id?: unknown; journal_entry_id?: unknown; signal_id?: unknown };
    if (typeof row.id !== "string") continue;
    const intent = mutation.intent === "create" || mutation.intent === "update" ? mutation.intent : "unknown";
    const normalized = { ...mutation, intent } as HealthJournalPendingMutation;
    journal[getHealthJournalPendingMutationKey(normalized.entity, row as { id: string; journal_entry_id?: string; signal_id?: string })] = normalized;
  }
  return journal;
}

export function replayHealthJournalPendingMutations<T extends { id: string; journal_entry_id?: string }>(
  entity: HealthJournalPendingEntity,
  remoteRows: readonly T[],
  journal: HealthJournalPendingMutationJournal,
  userId?: string,
): T[] {
  const deletedEntryIds = new Set(Object.values(journal)
    .filter((mutation) => mutation.entity === "checkin" && mutation.operation === "delete")
    .map((mutation) => mutation.operation === "delete" ? mutation.id : ""));
  const rows = new Map(remoteRows
    .filter((row) => !row.journal_entry_id || !deletedEntryIds.has(row.journal_entry_id))
    .map((row) => [row.id, row] as const));

  for (const mutation of Object.values(journal)) {
    if (mutation.entity !== entity) continue;
    if (mutation.operation === "delete") {
      rows.delete(mutation.id);
      continue;
    }
    const row = mutation.row as unknown as T & { user_id?: string };
    if (row.journal_entry_id && deletedEntryIds.has(row.journal_entry_id)) continue;
    if (mutation.intent === "create" || (mutation.intent === "update" && rows.has(row.id))) {
      rows.set(row.id, userId ? { ...row, user_id: userId } as T : row);
    }
  }
  return [...rows.values()];
}

export function didHealthJournalDeleteAffectRow(rows: readonly { id: string }[] | null | undefined, id: string) {
  return rows?.some((row) => row.id === id) ?? false;
}
