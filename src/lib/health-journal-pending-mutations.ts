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
  | (HealthJournalPendingUpsert & { intent: "create"; operation: "upsert"; submissionState?: HealthJournalPendingCreateSubmissionState })
  | (HealthJournalPendingUpsert & { intent: "update"; operation: "upsert" })
  | (HealthJournalPendingUpsert & { intent: "unknown"; operation: "upsert" })
  | { entity: HealthJournalPendingEntity; id: string; journalEntryId?: string; operation: "delete" };

export type HealthJournalPendingMutationJournal = Record<string, HealthJournalPendingMutation>;

export type HealthJournalPendingCreateSubmissionState = "never_submitted" | "may_have_submitted" | "confirmed";

type HealthJournalPendingRowIdentity = {
  id: string;
  journal_entry_id?: string | null;
  user_id: string;
};

type HealthJournalPendingRemoteResult = {
  data: HealthJournalPendingRowIdentity[] | null;
  error: { message: string } | null;
};

export type HealthJournalPendingReplayClient = {
  read: (entity: HealthJournalPendingEntity, id: string, userId: string) => Promise<HealthJournalPendingRemoteResult>;
  insert: (entity: HealthJournalPendingEntity, row: Record<string, unknown>) => Promise<HealthJournalPendingRemoteResult>;
  update: (input: {
    entity: HealthJournalPendingEntity;
    id: string;
    journalEntryId?: string;
    row: Record<string, unknown>;
    userId: string;
  }) => Promise<HealthJournalPendingRemoteResult>;
};

export type HealthJournalPendingReplayResult = {
  alreadyPresent?: boolean;
  error?: { message: string };
  journal: HealthJournalPendingMutationJournal;
  row?: HealthJournalPendingRowIdentity;
  status: "completed" | "held";
};

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
  mutation: HealthJournalPendingUpsert & {
    intent: "create" | "update";
    submissionState?: HealthJournalPendingCreateSubmissionState;
  },
): HealthJournalPendingMutationJournal {
  const key = getHealthJournalPendingMutationKey(mutation.entity, mutation.row);
  const existing = journal[key];
  const existingSubmissionState = existing?.operation === "upsert" && existing.intent === "create"
    ? existing.submissionState
    : undefined;
  const nextMutation: HealthJournalPendingMutation = mutation.intent === "create"
    ? {
      ...mutation,
      submissionState: mutation.submissionState ?? existingSubmissionState ?? "never_submitted",
      operation: "upsert",
    }
    : { ...mutation, operation: "upsert" };
  return { ...journal, [key]: nextMutation };
}

export function markHealthJournalPendingCreateMayHaveSubmitted(
  journal: HealthJournalPendingMutationJournal,
  key: string,
): HealthJournalPendingMutationJournal {
  const mutation = journal[key];
  if (mutation?.operation !== "upsert" || mutation.intent !== "create" || mutation.submissionState !== "never_submitted") {
    return journal;
  }
  return {
    ...journal,
    [key]: { ...mutation, submissionState: "may_have_submitted" },
  };
}

function markHealthJournalPendingCreateConfirmed(
  journal: HealthJournalPendingMutationJournal,
  key: string,
): HealthJournalPendingMutationJournal {
  const mutation = journal[key];
  if (mutation?.operation !== "upsert" || mutation.intent !== "create" || mutation.submissionState === "confirmed") {
    return journal;
  }
  return {
    ...journal,
    [key]: { ...mutation, submissionState: "confirmed" },
  };
}

function requiresJournalEntryOwner(entity: HealthJournalPendingEntity) {
  return entity === "signal_value" || entity === "signal_occurrence" || entity === "symptom_entry";
}

function matchesPendingRowIdentity(
  remoteRow: HealthJournalPendingRowIdentity,
  mutation: Extract<HealthJournalPendingMutation, { operation: "upsert" }>,
  userId: string,
) {
  if (remoteRow.id !== mutation.row.id || remoteRow.user_id !== userId) return false;
  if (!requiresJournalEntryOwner(mutation.entity)) return true;
  const journalEntryId = (mutation.row as { journal_entry_id?: string | null }).journal_entry_id;
  return typeof journalEntryId === "string" && remoteRow.journal_entry_id === journalEntryId;
}

function getPendingCreateConfirmationError(
  data: HealthJournalPendingRowIdentity[] | null,
  mutation: Extract<HealthJournalPendingMutation, { operation: "upsert" }>,
  userId: string,
) {
  const row = data?.find((candidate) => candidate.id === mutation.row.id);
  if (!row) return null;
  if (row.user_id !== userId) return "The pending Journal ID is owned by another user.";
  const journalEntryId = (mutation.row as { journal_entry_id?: string | null }).journal_entry_id;
  if (requiresJournalEntryOwner(mutation.entity)
    && (typeof journalEntryId !== "string" || row.journal_entry_id !== journalEntryId)) {
    return "The pending Feeling record belongs to a different Journal Entry.";
  }
  return null;
}

/**
 * Replays one explicit pending upsert. A create is attempted only after its
 * never-submitted state has been durably replaced with may-have-submitted.
 */
export async function replayHealthJournalPendingUpsertMutation(input: {
  blockedParentEntryIds?: ReadonlySet<string>;
  confirmedParentEntryIds?: ReadonlySet<string>;
  journal: HealthJournalPendingMutationJournal;
  key: string;
  mutation: Extract<HealthJournalPendingMutation, { operation: "upsert" }>;
  persist: (journal: HealthJournalPendingMutationJournal) => boolean;
  remote: HealthJournalPendingReplayClient;
  userId: string;
}): Promise<HealthJournalPendingReplayResult> {
  const { mutation, userId } = input;
  let journal = input.journal;
  const parentId = "journal_entry_id" in mutation.row ? mutation.row.journal_entry_id : null;
  if (mutation.row.user_id !== userId) {
    return { journal, status: "held", error: { message: "The pending Journal record owner could not be confirmed." } };
  }
  if (requiresJournalEntryOwner(mutation.entity) && typeof parentId !== "string") {
    return { journal, status: "held", error: { message: "The pending Feeling record has no Journal Entry owner." } };
  }
  if (typeof parentId === "string") {
    if (input.blockedParentEntryIds?.has(parentId)) {
      return { journal, status: "held", error: { message: "A pending Journal Entry deletion suppresses this Feeling write." } };
    }
    if (input.confirmedParentEntryIds && !input.confirmedParentEntryIds.has(parentId)) {
      return { journal, status: "held", error: { message: "The parent Journal Entry is not confirmed remotely; this Feeling write was held." } };
    }
  }

  if (mutation.intent === "unknown") {
    return { journal, status: "held", error: { message: "The pending Journal record has an unknown submission history and was held locally." } };
  }

  if (mutation.intent === "update") {
    const updateRow = { ...mutation.row } as Record<string, unknown>;
    delete updateRow.id;
    delete updateRow.user_id;
    delete updateRow.created_at;
    const result = await input.remote.update({
      entity: mutation.entity,
      id: mutation.row.id,
      ...(typeof parentId === "string" ? { journalEntryId: parentId } : {}),
      row: updateRow,
      userId,
    });
    if (result.error) return { journal, status: "held", error: result.error };
    const savedRow = result.data?.find((row) => matchesPendingRowIdentity(row, mutation, userId));
    return savedRow
      ? { journal, row: savedRow, status: "completed" }
      : {
        journal,
        status: "held",
        error: { message: `The pending Journal ${mutation.entity.replaceAll("_", " ")} ${mutation.row.id} no longer has the same remote owner; the edit was not recreated.` },
      };
  }

  const existing = await input.remote.read(mutation.entity, mutation.row.id, userId);
  if (existing.error) return { journal, status: "held", error: existing.error };
  const identityError = getPendingCreateConfirmationError(existing.data, mutation, userId);
  if (identityError) return { journal, status: "held", error: { message: identityError } };
  const confirmedExisting = existing.data?.find((row) => matchesPendingRowIdentity(row, mutation, userId));
  if (confirmedExisting) {
    const confirmedJournal = markHealthJournalPendingCreateConfirmed(journal, input.key);
    if (confirmedJournal !== journal) {
      journal = confirmedJournal;
      if (!input.persist(journal)) {
        return {
          alreadyPresent: true,
          journal,
          row: confirmedExisting,
          status: "held",
          error: { message: "The remote Journal creation was found, but its confirmation could not be saved locally." },
        };
      }
    }
    return { alreadyPresent: true, journal, row: confirmedExisting, status: "completed" };
  }

  if (mutation.submissionState !== "never_submitted") {
    return {
      journal,
      status: "held",
      error: { message: "This pending Journal creation may already have reached Supabase. It remains local and will not be retried without a remote row." },
    };
  }

  const markedJournal = markHealthJournalPendingCreateMayHaveSubmitted(journal, input.key);
  if (markedJournal === journal) {
    return { journal, status: "held", error: { message: "The pending Journal creation could not be marked before upload." } };
  }
  journal = markedJournal;
  if (!input.persist(journal)) {
    return {
      journal,
      status: "held",
      error: { message: "The pending Journal submission state could not be saved locally, so no upload was attempted." },
    };
  }

  const uploaded = await input.remote.insert(mutation.entity, {
    ...mutation.row,
    user_id: userId,
  } as Record<string, unknown>);
  let confirmedRow = uploaded.error
    ? undefined
    : uploaded.data?.find((row) => matchesPendingRowIdentity(row, mutation, userId));

  // A failed response may still follow a committed INSERT. Confirm identity
  // once, then keep the may-have-submitted marker if it remains uncertain.
  let confirmationError: string | null = null;
  let confirmationResultError: { message: string } | null = null;
  if (!confirmedRow) {
    const confirmation = await input.remote.read(mutation.entity, mutation.row.id, userId);
    confirmationResultError = confirmation.error;
    if (!confirmation.error) {
      confirmationError = getPendingCreateConfirmationError(confirmation.data, mutation, userId);
      confirmedRow = confirmation.data?.find((row) => matchesPendingRowIdentity(row, mutation, userId));
    }
  }
  if (confirmationError) return { journal, status: "held", error: { message: confirmationError } };
  if (confirmedRow) {
    const confirmedJournal = markHealthJournalPendingCreateConfirmed(journal, input.key);
    if (confirmedJournal !== journal) {
      journal = confirmedJournal;
      if (!input.persist(journal)) {
        return {
          journal,
          row: confirmedRow,
          status: "held",
          error: { message: "The remote Journal creation was confirmed, but its confirmation could not be saved locally." },
        };
      }
    }
    return { journal, row: confirmedRow, status: "completed" };
  }
  return {
    journal,
    status: "held",
    error: uploaded.error ?? confirmationResultError ?? { message: "The Journal creation response could not be confirmed. It remains local and will not be retried." },
  };
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
  const nextJournal = { ...journal };
  for (const [existingKey, mutation] of Object.entries(nextJournal)) {
    if (mutation.entity === entity && mutation.operation === "upsert" && mutation.row.id === id) {
      delete nextJournal[existingKey];
    }
  }
  return { ...nextJournal, [key]: { entity, id, journalEntryId, operation: "delete" } };
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
    const normalized = {
      ...mutation,
      intent,
      ...(intent === "create" && (mutation as { submissionState?: unknown }).submissionState === "never_submitted"
        ? { submissionState: "never_submitted" }
        : intent === "create" && (mutation as { submissionState?: unknown }).submissionState === "may_have_submitted"
          ? { submissionState: "may_have_submitted" }
          : intent === "create" && (mutation as { submissionState?: unknown }).submissionState === "confirmed"
            ? { submissionState: "confirmed" }
            : {}),
    } as HealthJournalPendingMutation;
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
  const deletedIds = new Set(Object.values(journal)
    .filter((mutation) => mutation.entity === entity && mutation.operation === "delete")
    .map((mutation) => mutation.operation === "delete" ? mutation.id : ""));
  const rows = new Map(remoteRows
    .filter((row) => !deletedIds.has(row.id))
    .filter((row) => !row.journal_entry_id || !deletedEntryIds.has(row.journal_entry_id))
    .map((row) => [row.id, row] as const));

  for (const mutation of Object.values(journal)) {
    if (mutation.entity !== entity) continue;
    if (mutation.operation === "delete") {
      rows.delete(mutation.id);
      continue;
    }
    const row = mutation.row as unknown as T & { user_id?: string };
    if (deletedIds.has(row.id)) continue;
    if (row.journal_entry_id && deletedEntryIds.has(row.journal_entry_id)) continue;
    if (mutation.intent === "create" && mutation.submissionState === "never_submitted") {
      rows.set(row.id, userId ? { ...row, user_id: userId } as T : row);
    } else if (mutation.intent === "update" && rows.has(row.id)) {
      const current = rows.get(row.id) as (T & { user_id?: string }) | undefined;
      if (current?.user_id && userId && current.user_id !== userId) continue;
      if (requiresJournalEntryOwner(mutation.entity) && current?.journal_entry_id !== row.journal_entry_id) continue;
      rows.set(row.id, userId ? { ...row, user_id: userId } as T : row);
    }
  }
  return [...rows.values()];
}

export function didHealthJournalDeleteAffectRow(rows: readonly { id: string }[] | null | undefined, id: string) {
  return rows?.some((row) => row.id === id) ?? false;
}
