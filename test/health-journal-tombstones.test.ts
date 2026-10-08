import assert from "node:assert/strict";
import test from "node:test";

import { deleteHealthJournalRecordWithTombstone } from "../src/lib/health-journal-tombstones.ts";

test("tombstone delete validates the server confirmation and scopes child ownership", async () => {
  let call: { args: Record<string, unknown>; name: string } | null = null;
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      call = { args, name };
      return Promise.resolve({ data: [{ deleted: false, id: "occurrence-1", tombstoned: true }], error: null });
    },
  } as never;
  const result = await deleteHealthJournalRecordWithTombstone({
    client,
    entity: "signal_occurrence",
    id: "occurrence-1",
    journalEntryId: "entry-1",
  });
  assert.deepEqual(result, { deleted: false, tombstoned: true });
  assert.deepEqual(call, {
    name: "adhdice_delete_health_journal_record",
    args: { p_entity: "signal_occurrence", p_journal_entry_id: "entry-1", p_record_id: "occurrence-1" },
  });
});

test("tombstone delete fails closed when the RPC cannot confirm persistence", async () => {
  const failedClient = { rpc: () => Promise.resolve({ data: null, error: { message: "migration missing" } }) } as never;
  await assert.rejects(deleteHealthJournalRecordWithTombstone({ client: failedClient, entity: "checkin", id: "entry-1" }), /migration missing/);
  const malformedClient = { rpc: () => Promise.resolve({ data: [{ id: "entry-1", tombstoned: false, deleted: false }], error: null }) } as never;
  await assert.rejects(deleteHealthJournalRecordWithTombstone({ client: malformedClient, entity: "checkin", id: "entry-1" }), /Could not confirm the Journal deletion tombstone/);
});
