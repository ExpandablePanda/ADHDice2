import type { HealthJournalPendingEntity } from "./health-journal-pending-mutations.ts";

export type HealthJournalTombstoneEntity = Exclude<HealthJournalPendingEntity, "symptom">;

export type HealthJournalTombstoneRPCClient = {
  rpc: (
    name: "adhdice_delete_health_journal_record",
    args: {
      p_entity: HealthJournalTombstoneEntity;
      p_journal_entry_id: string | null;
      p_record_id: string;
    },
  ) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

export type HealthJournalTombstoneDeleteResult = {
  deleted: boolean;
  tombstoned: true;
};

export async function deleteHealthJournalRecordWithTombstone(input: {
  client: HealthJournalTombstoneRPCClient;
  entity: HealthJournalTombstoneEntity;
  id: string;
  journalEntryId?: string;
}): Promise<HealthJournalTombstoneDeleteResult> {
  const { data, error } = await input.client.rpc("adhdice_delete_health_journal_record", {
    p_entity: input.entity,
    p_journal_entry_id: input.journalEntryId ?? null,
    p_record_id: input.id,
  });
  if (error) throw new Error(error.message);

  const result = Array.isArray(data)
    ? data.find((candidate) => candidate && typeof candidate === "object" && "id" in candidate && candidate.id === input.id)
    : null;
  if (!result || !("tombstoned" in result) || result.tombstoned !== true || !("deleted" in result) || typeof result.deleted !== "boolean") {
    throw new Error("Could not confirm the Journal deletion tombstone.");
  }
  return { deleted: result.deleted, tombstoned: true };
}
