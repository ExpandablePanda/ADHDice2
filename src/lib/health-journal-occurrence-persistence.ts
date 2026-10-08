export type HealthJournalOccurrenceTable =
  | "adhdice_health_symptom_entries"
  | "adhdice_health_journal_signal_occurrences";

export type HealthJournalOccurrenceIdentity = {
  id: string;
  journal_entry_id: string | null;
};

type QueryResult<T = unknown> = {
  data: T | null;
  error: { message: string } | null;
};

type QueryBuilder<T = unknown> = PromiseLike<QueryResult<T>> & {
  eq: (column: string, value: string) => QueryBuilder<unknown>;
  in: (column: string, values: string[]) => QueryBuilder<unknown>;
  insert: (rows: unknown[]) => QueryBuilder<unknown[]>;
  select: (columns: string) => QueryBuilder<unknown>;
  single: () => PromiseLike<QueryResult<unknown>>;
  update: (row: Record<string, unknown>) => QueryBuilder<unknown>;
};

export type HealthJournalOccurrencePersistenceClient = {
  from: (table: HealthJournalOccurrenceTable) => QueryBuilder<unknown>;
};

export function getHealthJournalOccurrenceOwnershipError(
  drafts: readonly { id?: string | null }[],
  existingOccurrences: readonly HealthJournalOccurrenceIdentity[],
  journalEntryId: string,
) {
  const seenIds = new Set<string>();
  for (const draft of drafts) {
    if (!draft.id) continue;
    if (seenIds.has(draft.id)) return "A Journal save cannot contain duplicate Feeling occurrence IDs.";
    seenIds.add(draft.id);
    const existing = existingOccurrences.find((occurrence) => occurrence.id === draft.id);
    if (existing && existing.journal_entry_id !== journalEntryId) {
      return "That Feeling occurrence belongs to another Journal Entry.";
    }
  }
  return null;
}

export function getHealthJournalEditorTargetIdentity(selectedEntryId: string | null, linkedEventId: string | null) {
  return linkedEventId ?? selectedEntryId ?? "new";
}

export function getHealthJournalSelectedEntryIdentity(selectedEntryId: string | null) {
  return selectedEntryId ?? "new";
}

export function shouldPreserveHealthJournalEditorDraft(input: {
  dirtyTargetIdentity: string | null;
  hydratedTargetIdentity: string | null;
  nextTargetIdentity: string;
}) {
  return input.dirtyTargetIdentity === input.nextTargetIdentity
    && input.hydratedTargetIdentity === input.nextTargetIdentity;
}

export async function readHealthJournalOccurrenceOwners(
  client: HealthJournalOccurrencePersistenceClient,
  table: HealthJournalOccurrenceTable,
  userId: string,
  occurrenceIds: readonly string[],
): Promise<HealthJournalOccurrenceIdentity[]> {
  const ids = [...new Set(occurrenceIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const { data, error } = await client.from(table)
    .select("id,journal_entry_id")
    .eq("user_id", userId)
    .in("id", ids);
  if (error) throw new Error(`Could not confirm Feeling occurrence ownership: ${error.message}`);
  return Array.isArray(data) ? data as HealthJournalOccurrenceIdentity[] : [];
}

export async function persistHealthJournalOccurrenceRows<TRow extends {
  id: string;
  journal_entry_id: string;
  user_id: string;
}>(input: {
  client: HealthJournalOccurrencePersistenceClient;
  journalEntryId: string;
  rows: readonly TRow[];
  table: HealthJournalOccurrenceTable;
  userId: string;
}): Promise<TRow[]> {
  if (input.rows.length === 0) return [];
  if (input.rows.some((row) => row.user_id !== input.userId || row.journal_entry_id !== input.journalEntryId)) {
    throw new Error("Feeling occurrences must retain their Journal Entry and owner identity.");
  }
  const ids = input.rows.map((row) => row.id);
  const owners = await readHealthJournalOccurrenceOwners(input.client, input.table, input.userId, ids);
  const ownershipError = getHealthJournalOccurrenceOwnershipError(input.rows, owners, input.journalEntryId);
  if (ownershipError) throw new Error(ownershipError);

  const ownerById = new Map(owners.map((owner) => [owner.id, owner]));
  const insertedRows = input.rows.filter((row) => !ownerById.has(row.id));
  const existingRows = input.rows.filter((row) => ownerById.has(row.id));
  const savedById = new Map<string, TRow>();

  for (const row of existingRows) {
    const mutableFields = Object.fromEntries(Object.entries(row).filter(([key]) =>
      key !== "id" && key !== "user_id" && key !== "journal_entry_id" && key !== "created_at"));
    const { data, error } = await input.client.from(input.table)
      .update(mutableFields)
      .eq("id", row.id)
      .eq("user_id", input.userId)
      .eq("journal_entry_id", input.journalEntryId)
      .select("*")
      .single();
    if (error) throw new Error(`Could not update Feeling occurrence: ${error.message}`);
    if (!data || typeof data !== "object") throw new Error("Could not confirm the updated Feeling occurrence.");
    savedById.set(row.id, data as TRow);
  }

  if (insertedRows.length > 0) {
    const { data, error } = await input.client.from(input.table)
      .insert(insertedRows as unknown as unknown[])
      .select("*");
    if (error) throw new Error(`Could not insert Feeling occurrence: ${error.message}`);
    if (!Array.isArray(data) || data.length !== insertedRows.length) {
      throw new Error("Could not confirm all newly inserted Feeling occurrences.");
    }
    for (const row of data as TRow[]) savedById.set(row.id, row);
  }

  return input.rows.map((row) => savedById.get(row.id) ?? row);
}
