import assert from "node:assert/strict";
import test from "node:test";

import {
  getHealthJournalEditorTargetIdentity,
  getHealthJournalOccurrenceOwnershipError,
  getHealthJournalSelectedEntryIdentity,
  persistHealthJournalOccurrenceRows,
  shouldPreserveHealthJournalEditorDraft,
  type HealthJournalOccurrencePersistenceClient,
  type HealthJournalOccurrenceTable,
} from "../src/lib/health-journal-occurrence-persistence.ts";
import { normalizeHealthJournalStructuredAnswers } from "../src/lib/health-journal-checkins.ts";
import { replaceHealthJournalReflectionTag } from "../src/lib/health-journal.ts";
import { replaceHealthJournalTriggerAssociations } from "../src/lib/health-journal-triggers.ts";

type OccurrenceRow = {
  created_at: string;
  entry_date: string;
  id: string;
  journal_entry_id: string;
  note: string | null;
  score?: number;
  severity?: number;
  symptom_id?: string;
  signal_id?: string;
  user_id: string;
  updated_at: string;
};

function occurrence(id: string, journalEntryId = "entry-new", overrides: Partial<OccurrenceRow> = {}): OccurrenceRow {
  return {
    created_at: "2026-10-08T10:00:00.000Z",
    entry_date: "2026-10-08",
    id,
    journal_entry_id: journalEntryId,
    note: null,
    severity: 3,
    symptom_id: "symptom-headache",
    updated_at: "2026-10-08T10:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

function createRemoteOccurrenceClient(seed: Partial<Record<HealthJournalOccurrenceTable, OccurrenceRow[]>> = {}) {
  const rows = new Map<HealthJournalOccurrenceTable, OccurrenceRow[]>([
    ["adhdice_health_symptom_entries", [...(seed.adhdice_health_symptom_entries ?? [])]],
    ["adhdice_health_journal_signal_occurrences", [...(seed.adhdice_health_journal_signal_occurrences ?? [])]],
  ]);
  const calls: Array<{ table: HealthJournalOccurrenceTable; operation: string; filters: Record<string, string | string[]> }> = [];

  const client = {
    from(table: HealthJournalOccurrenceTable) {
      let operation = "select";
      let payload: Partial<OccurrenceRow>[] = [];
      const filters: Record<string, string | string[]> = {};
      const execute = (single = false) => {
        calls.push({ table, operation, filters: { ...filters } });
        const tableRows = rows.get(table)!;
        const matches = (row: OccurrenceRow) => Object.entries(filters).every(([key, value]) => {
          const actual = row[key as keyof OccurrenceRow];
          return Array.isArray(value) ? value.includes(String(actual)) : actual === value;
        });
        if (operation === "select") {
          const data = tableRows.filter(matches);
          return Promise.resolve({ data: single ? data[0] ?? null : data, error: null });
        }
        if (operation === "insert") {
          if (payload.some((candidate) => tableRows.some((row) => row.id === candidate.id))) {
            return Promise.resolve({ data: null, error: { message: "duplicate occurrence id" } });
          }
          const inserted = payload.map((candidate) => candidate as OccurrenceRow);
          tableRows.push(...inserted);
          return Promise.resolve({ data: inserted, error: null });
        }
        const index = tableRows.findIndex(matches);
        if (index < 0) return Promise.resolve({ data: null, error: { message: "no matching owned occurrence" } });
        tableRows[index] = { ...tableRows[index]!, ...payload[0] } as OccurrenceRow;
        return Promise.resolve({ data: single ? tableRows[index] : [tableRows[index]], error: null });
      };
      const builder: Record<string, unknown> = {
        eq(column: string, value: string) { filters[column] = value; return builder; },
        in(column: string, values: string[]) { filters[column] = values; return builder; },
        insert(input: Partial<OccurrenceRow>[]) { operation = "insert"; payload = input; return builder; },
        select() { return builder; },
        single() { return execute(true); },
        update(input: Partial<OccurrenceRow>) { operation = "update"; payload = [input]; return builder; },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          return execute().then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return {
    client: client as unknown as HealthJournalOccurrencePersistenceClient,
    calls,
    rows,
  };
}

const symptomTable = "adhdice_health_symptom_entries" as const;
const signalTable = "adhdice_health_journal_signal_occurrences" as const;

test("scenario 1: a new Event inserts one new symptom occurrence", async () => {
  const remote = createRemoteOccurrenceClient();
  const [saved] = await persistHealthJournalOccurrenceRows({ client: remote.client, journalEntryId: "entry-new", rows: [occurrence("symptom-one")], table: symptomTable, userId: "user-1" });
  assert.equal(saved?.id, "symptom-one");
  assert.equal(remote.rows.get(symptomTable)?.length, 1);
  assert.deepEqual(remote.calls.map((call) => call.operation), ["select", "insert"]);
});

test("scenario 2: a new Event inserts two symptom occurrences without collapsing identities", async () => {
  const remote = createRemoteOccurrenceClient();
  const input = [occurrence("symptom-one"), occurrence("symptom-two", "entry-new", { severity: 4 })];
  const saved = await persistHealthJournalOccurrenceRows({ client: remote.client, journalEntryId: "entry-new", rows: input, table: symptomTable, userId: "user-1" });
  assert.deepEqual(saved.map((row) => row.id), ["symptom-one", "symptom-two"]);
  assert.deepEqual(remote.rows.get(symptomTable)?.map((row) => row.id), ["symptom-one", "symptom-two"]);
});

test("scenario 3: a new Event inserts an Emotion occurrence", async () => {
  const remote = createRemoteOccurrenceClient();
  const emotion = occurrence("emotion-one", "entry-new", { score: 8, signal_id: "signal-anxiety", symptom_id: undefined, severity: undefined });
  const [saved] = await persistHealthJournalOccurrenceRows({ client: remote.client, journalEntryId: "entry-new", rows: [emotion], table: signalTable, userId: "user-1" });
  assert.equal(saved?.signal_id, "signal-anxiety");
  assert.equal(remote.rows.get(signalTable)?.length, 1);
});

test("scenario 4: one saved occurrence accepts multiple Trigger links", async () => {
  const replacements: unknown[] = [];
  const client = {
    rpc(_name: string, args: { p_replacements: unknown[] }) {
      replacements.push(...args.p_replacements);
      return Promise.resolve({ data: { saved: true, target_count: args.p_replacements.length, links: [] }, error: null });
    },
  } as never;
  const result = await replaceHealthJournalTriggerAssociations("user-1", "entry-new", [{
    occurrence_id: "symptom-one",
    occurrence_kind: "symptom",
    expected_associations: [],
    associations: [
      { trigger_id: "trigger-music", effect: "improved", previous_score: 2 },
      { trigger_id: "trigger-work", effect: "worsened", previous_score: 4 },
    ],
  }], client);
  assert.equal((result as { saved: boolean }).saved, true);
  assert.equal((replacements[0] as { associations: unknown[] }).associations.length, 2);
});

test("scenario 5: editing an existing Event preserves and updates its occurrence ID", async () => {
  const existing = occurrence("symptom-existing", "entry-existing", { note: "before", created_at: "2026-10-01T09:00:00.000Z" });
  const remote = createRemoteOccurrenceClient({ [symptomTable]: [existing] });
  const [saved] = await persistHealthJournalOccurrenceRows({
    client: remote.client,
    journalEntryId: "entry-existing",
    rows: [{ ...existing, note: "after" }],
    table: symptomTable,
    userId: "user-1",
  });
  assert.equal(saved?.id, "symptom-existing");
  assert.equal(saved?.created_at, existing.created_at);
  assert.equal(saved?.note, "after");
  assert.equal(remote.rows.get(symptomTable)?.length, 1);
  assert.deepEqual(remote.calls.map((call) => call.operation), ["select", "update"]);
  assert.equal(remote.calls[1]?.filters.id, "symptom-existing");
  assert.equal(remote.calls[1]?.filters.user_id, "user-1");
  assert.equal(remote.calls[1]?.filters.journal_entry_id, "entry-existing");
});

test("scenario 6: an unpersisted client UUID is classified as new and safely inserted", async () => {
  const id = "1c8f8f35-97dc-4a5f-97a0-354499b72ea1";
  assert.equal(getHealthJournalOccurrenceOwnershipError([{ id }], [], "entry-new"), null);
  const remote = createRemoteOccurrenceClient();
  await persistHealthJournalOccurrenceRows({ client: remote.client, journalEntryId: "entry-new", rows: [occurrence(id)], table: symptomTable, userId: "user-1" });
  assert.equal(remote.rows.get(symptomTable)?.[0]?.id, id);
});

test("scenario 7: a real cross-entry ID reuse is rejected without mutation", async () => {
  const foreign = occurrence("symptom-foreign", "entry-other");
  assert.match(getHealthJournalOccurrenceOwnershipError([{ id: foreign.id }], [foreign], "entry-new") ?? "", /belongs to another Journal Entry/);
  const remote = createRemoteOccurrenceClient({ [symptomTable]: [foreign] });
  await assert.rejects(persistHealthJournalOccurrenceRows({ client: remote.client, journalEntryId: "entry-new", rows: [occurrence(foreign.id)], table: symptomTable, userId: "user-1" }), /belongs to another Journal Entry/);
  assert.deepEqual(remote.rows.get(symptomTable), [foreign]);
  assert.deepEqual(remote.calls.map((call) => call.operation), ["select"]);
  assert.equal(remote.calls[0]?.filters.user_id, "user-1");
  assert.deepEqual(remote.calls[0]?.filters.id, [foreign.id]);
});

test("scenario 8: retry after a later remote failure keeps the same IDs and does not duplicate the inserted occurrence", async () => {
  const remote = createRemoteOccurrenceClient();
  const stableDraft = [occurrence("symptom-retry")];
  await persistHealthJournalOccurrenceRows({ client: remote.client, journalEntryId: "entry-new", rows: stableDraft, table: symptomTable, userId: "user-1" });
  const failingTriggerClient = { rpc: () => Promise.resolve({ data: null, error: { message: "temporary Trigger RPC failure" } }) } as never;
  await assert.rejects(replaceHealthJournalTriggerAssociations("user-1", "entry-new", [{
    occurrence_id: "symptom-retry",
    occurrence_kind: "symptom",
    expected_associations: [],
    associations: [{ trigger_id: "trigger-music", effect: "associated", previous_score: null }],
  }], failingTriggerClient), /temporary Trigger RPC failure/);
  const retried = await persistHealthJournalOccurrenceRows({ client: remote.client, journalEntryId: "entry-new", rows: stableDraft, table: symptomTable, userId: "user-1" });
  assert.deepEqual(retried.map((row) => row.id), ["symptom-retry"]);
  assert.equal(remote.rows.get(symptomTable)?.length, 1);
  assert.deepEqual(remote.calls.map((call) => call.operation), ["select", "insert", "select", "update"]);
});

test("scenario 9: repeated retries update the same occurrence and never create duplicates", async () => {
  const remote = createRemoteOccurrenceClient();
  const stableDraft = [occurrence("symptom-repeat")];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await persistHealthJournalOccurrenceRows({ client: remote.client, journalEntryId: "entry-new", rows: stableDraft, table: symptomTable, userId: "user-1" });
  }
  assert.equal(remote.rows.get(symptomTable)?.length, 1);
  assert.equal(remote.calls.filter((call) => call.operation === "insert").length, 1);
  assert.equal(remote.calls.filter((call) => call.operation === "update").length, 2);
});

test("scenario 10: switching an existing Event to New Entry clears selected identity despite a stale draft ID", () => {
  const oldEventDraftId = "event-old-draft-id";
  const selectedIdentity = getHealthJournalSelectedEntryIdentity(null);
  assert.equal(selectedIdentity, "new");
  assert.notEqual(selectedIdentity, oldEventDraftId);
  assert.equal(shouldPreserveHealthJournalEditorDraft({ dirtyTargetIdentity: "entry-old", hydratedTargetIdentity: "entry-old", nextTargetIdentity: selectedIdentity }), false);
});

test("scenario 11: New Entry to an existing Event targets the selected record", () => {
  assert.equal(getHealthJournalSelectedEntryIdentity("entry-existing"), "entry-existing");
  assert.equal(getHealthJournalEditorTargetIdentity("entry-existing", null), "entry-existing");
});

test("scenario 12: same-entry Trigger edits survive async loading and do not block a different selection", () => {
  assert.equal(shouldPreserveHealthJournalEditorDraft({ dirtyTargetIdentity: "entry-one", hydratedTargetIdentity: "entry-one", nextTargetIdentity: "entry-one" }), true);
  assert.equal(shouldPreserveHealthJournalEditorDraft({ dirtyTargetIdentity: "entry-one", hydratedTargetIdentity: "entry-one", nextTargetIdentity: "entry-two" }), false);
});

test("scenario 13: Start and End of Day entries retain their linked Event identity", () => {
  for (const entryType of ["start_of_day", "end_of_day"] as const) {
    const answers = normalizeHealthJournalStructuredAnswers({ entry_type: entryType, linked_event_ids: ["event-linked"] });
    const linkedEventId = answers.linked_event_ids?.[0] ?? null;
    assert.equal(getHealthJournalEditorTargetIdentity("checkin-1", linkedEventId), "event-linked");
    assert.deepEqual(answers.linked_event_ids, ["event-linked"]);
  }
});

test("scenario 14: editing nearby reflection text leaves saved scored hashtags unchanged", () => {
  const scoredHashtag = "#Back Pain (4/5)";
  const reflection = `${scoredHashtag} before appointment`;
  const next = replaceHealthJournalReflectionTag(reflection, reflection.indexOf("appointment"), reflection.length, "follow-up");
  assert.equal(next, `${scoredHashtag} before follow-up`);
});

test("scenario 15: a legacy Journal check-in with no occurrences stays a no-op on occurrence persistence", async () => {
  const remote = createRemoteOccurrenceClient();
  assert.deepEqual(await persistHealthJournalOccurrenceRows({ client: remote.client, journalEntryId: "checkin-legacy", rows: [], table: signalTable, userId: "user-1" }), []);
  assert.deepEqual(remote.calls, []);
  assert.equal("linked_event_ids" in normalizeHealthJournalStructuredAnswers({ reflection: "legacy reflection" }), false);
});
