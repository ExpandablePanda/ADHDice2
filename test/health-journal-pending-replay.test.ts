import assert from "node:assert/strict";
import test from "node:test";

import type { HealthCheckIn, HealthJournalSignalOccurrence, HealthJournalSignalValue } from "../src/lib/database.types.ts";
import {
  normalizeHealthJournalPendingMutations,
  recordHealthJournalPendingDelete,
  recordHealthJournalPendingUpsert,
  replayHealthJournalPendingMutations,
  replayHealthJournalPendingUpsertMutation,
  type HealthJournalPendingEntity,
  type HealthJournalPendingMutationJournal,
  type HealthJournalPendingReplayClient,
} from "../src/lib/health-journal-pending-mutations.ts";
import { replaceHealthJournalTriggerAssociations } from "../src/lib/health-journal-triggers.ts";

type RemoteRow = {
  id: string;
  journal_entry_id?: string | null;
  user_id: string;
  [key: string]: unknown;
};

function entry(overrides: Partial<HealthCheckIn> = {}): HealthCheckIn {
  return {
    clarity_score: null,
    created_at: "2026-10-08T10:00:00.000Z",
    energy_score: null,
    entry_date: "2026-10-08",
    entry_time: "10:00:00",
    entry_type: "event",
    id: "entry-1",
    mood_score: null,
    reflection: "original",
    stress_score: null,
    structured_answers: { custom_answers: [], schema_version: 1 },
    symptom_tags: [],
    updated_at: "2026-10-08T10:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

function occurrence(overrides: Partial<HealthJournalSignalOccurrence> = {}): HealthJournalSignalOccurrence {
  return {
    created_at: "2026-10-08T10:00:00.000Z",
    entry_date: "2026-10-08",
    id: "occurrence-1",
    journal_entry_id: "entry-1",
    note: null,
    occurred_at: "2026-10-08T10:00:00.000Z",
    score: 5,
    signal_id: "signal-1",
    time_is_estimated: false,
    updated_at: "2026-10-08T10:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

function signalValue(overrides: Partial<HealthJournalSignalValue> = {}): HealthJournalSignalValue {
  return {
    created_at: "2026-10-08T10:00:00.000Z",
    id: "value-1",
    journal_entry_id: "entry-1",
    score: 5,
    signal_id: "signal-1",
    updated_at: "2026-10-08T10:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

function createRemote(seed: RemoteRow[] = []) {
  const rows = new Map(seed.map((row) => [row.id, { ...row }]));
  const calls: Array<{ operation: string; entity: HealthJournalPendingEntity; filters?: Record<string, string>; row?: RemoteRow }> = [];
  let loseNextInsertResponse = false;
  let failNextRead = false;
  let failReadAfterInsert = false;
  const remote: HealthJournalPendingReplayClient = {
    async read(entity, id, userId) {
      calls.push({ operation: "read", entity, filters: { id, user_id: userId } });
      if (failNextRead) {
        failNextRead = false;
        return { data: null, error: { message: "read response lost" } };
      }
      const row = rows.get(id);
      return { data: row?.user_id === userId ? [row] : [], error: null };
    },
    async insert(entity, input) {
      const row = input as RemoteRow;
      calls.push({ operation: "insert", entity, row });
      if (rows.has(row.id)) return { data: null, error: { message: "duplicate ID" } };
      rows.set(row.id, { ...row });
      if (loseNextInsertResponse) {
        loseNextInsertResponse = false;
        if (failReadAfterInsert) {
          failReadAfterInsert = false;
          failNextRead = true;
        }
        return { data: null, error: { message: "insert response lost after commit" } };
      }
      return { data: [rows.get(row.id)!], error: null };
    },
    async update(input) {
      calls.push({ operation: "update", entity: input.entity, filters: { id: input.id, user_id: input.userId, ...(input.journalEntryId ? { journal_entry_id: input.journalEntryId } : {}) } });
      const current = rows.get(input.id);
      const matches = current?.user_id === input.userId
        && (!input.journalEntryId || current.journal_entry_id === input.journalEntryId);
      if (!matches) return { data: [], error: null };
      const updated = { ...current, ...input.row };
      rows.set(input.id, updated);
      return { data: [updated], error: null };
    },
  };
  return {
    calls,
    remote,
    rows,
    loseNextInsertResponse() { loseNextInsertResponse = true; },
    failNextRead() { failNextRead = true; },
    failReadAfterNextInsert() { failReadAfterInsert = true; },
    deleteRemote(id: string) { rows.delete(id); },
  };
}

function persistTo(memory: { journal: HealthJournalPendingMutationJournal; states: string[] }, succeed = true) {
  return (journal: HealthJournalPendingMutationJournal) => {
    memory.journal = journal;
    const pending = Object.values(journal).find((item) => item.operation === "upsert" && item.intent === "create");
    if (pending?.operation === "upsert" && pending.intent === "create") memory.states.push(pending.submissionState ?? "legacy-unknown");
    return succeed;
  };
}

function createMutation(row = entry()) {
  return recordHealthJournalPendingUpsert({}, { entity: "checkin", intent: "create", row });
}

async function replay(
  journal: HealthJournalPendingMutationJournal,
  remote: HealthJournalPendingReplayClient,
  persist: (journal: HealthJournalPendingMutationJournal) => boolean,
  key = "checkin:entry-1",
  mutation = journal[key] as Extract<HealthJournalPendingMutationJournal[string], { operation: "upsert" }>,
) {
  return replayHealthJournalPendingUpsertMutation({ journal, key, mutation, persist, remote, userId: "user-1" });
}

test("a committed create with a lost response is confirmed without a second insert", async () => {
  const remote = createRemote();
  remote.loseNextInsertResponse();
  const memory = { journal: createMutation(), states: [] as string[] };
  const result = await replay(memory.journal, remote.remote, persistTo(memory));
  assert.equal(result.status, "completed");
  assert.equal(remote.calls.filter((call) => call.operation === "insert").length, 1);
  assert.deepEqual(memory.states, ["may_have_submitted", "confirmed"]);
});

test("an ambiguous committed create deleted on another device is never inserted again", async () => {
  const remote = createRemote();
  remote.loseNextInsertResponse();
  remote.failReadAfterNextInsert();
  const memory = { journal: createMutation(), states: [] as string[] };
  const first = await replay(memory.journal, remote.remote, persistTo(memory));
  assert.equal(first.status, "held");
  assert.equal(first.journal["checkin:entry-1"]?.operation === "upsert" ? first.journal["checkin:entry-1"].submissionState : null, "may_have_submitted");
  remote.deleteRemote("entry-1");
  const second = await replay(first.journal, remote.remote, persistTo(memory));
  assert.equal(second.status, "held");
  assert.equal(remote.calls.filter((call) => call.operation === "insert").length, 1);
  assert.equal(remote.rows.has("entry-1"), false);
});

test("a never-submitted local create is safely uploaded once", async () => {
  const remote = createRemote();
  const journal = createMutation();
  const result = await replay(journal, remote.remote, () => true);
  assert.equal(result.status, "completed");
  assert.equal(remote.rows.get("entry-1")?.reflection, "original");
  assert.equal(remote.calls.filter((call) => call.operation === "insert").length, 1);
});

test("legacy create records with unknown submission history remain held", async () => {
  const journal = normalizeHealthJournalPendingMutations({
    old: { entity: "checkin", intent: "create", operation: "upsert", row: entry() },
  });
  const remote = createRemote();
  const result = await replay(journal, remote.remote, () => true);
  assert.equal(result.status, "held");
  assert.equal(remote.calls.filter((call) => call.operation === "insert").length, 0);
  assert.equal(remote.rows.size, 0);
});

test("an edit targeting a remotely deleted row stays queued and never turns into an insert", async () => {
  const journal = recordHealthJournalPendingUpsert({}, { entity: "checkin", intent: "update", row: entry({ reflection: "offline edit" }) });
  const remote = createRemote();
  const result = await replay(journal, remote.remote, () => true);
  assert.equal(result.status, "held");
  assert.equal(remote.calls.filter((call) => call.operation === "update").length, 1);
  assert.equal(remote.calls.filter((call) => call.operation === "insert").length, 0);
  assert.equal(Object.keys(result.journal).length, 1);
});

test("child update requires the exact ID, user, and parent Journal Entry", async () => {
  const child = occurrence();
  const journal = recordHealthJournalPendingUpsert({}, { entity: "signal_occurrence", intent: "update", row: child });
  const otherParent = createRemote([{ ...child, journal_entry_id: "entry-other" }]);
  const result = await replay(journal, otherParent.remote, () => true, "signal_occurrence:occurrence-1", journal["signal_occurrence:occurrence-1"] as Extract<HealthJournalPendingMutationJournal[string], { operation: "upsert" }>);
  assert.equal(result.status, "held");
  assert.deepEqual(otherParent.calls.find((call) => call.operation === "update")?.filters, {
    id: "occurrence-1",
    user_id: "user-1",
    journal_entry_id: "entry-1",
  });
  assert.equal(otherParent.rows.get("occurrence-1")?.journal_entry_id, "entry-other");
  assert.equal(otherParent.calls.some((call) => call.operation === "insert"), false);
});

test("a pending parent deletion suppresses child writes", async () => {
  const child = occurrence();
  const journal = recordHealthJournalPendingUpsert({}, { entity: "signal_occurrence", intent: "create", row: child });
  const remote = createRemote();
  const key = "signal_occurrence:occurrence-1";
  const result = await replayHealthJournalPendingUpsertMutation({
    blockedParentEntryIds: new Set(["entry-1"]),
    confirmedParentEntryIds: new Set(["entry-1"]),
    journal,
    key,
    mutation: journal[key] as Extract<HealthJournalPendingMutationJournal[string], { operation: "upsert" }>,
    persist: () => true,
    remote: remote.remote,
    userId: "user-1",
  });
  assert.equal(result.status, "held");
  assert.equal(remote.calls.length, 0);
});

test("repeated hydration of an ambiguous missing create cannot resurrect it", async () => {
  const ambiguous = normalizeHealthJournalPendingMutations({
    one: { entity: "checkin", intent: "create", operation: "upsert", submissionState: "may_have_submitted", row: entry() },
  });
  const remote = createRemote();
  const first = await replay(ambiguous, remote.remote, () => true);
  const second = await replay(first.journal, remote.remote, () => true);
  assert.equal(first.status, "held");
  assert.equal(second.status, "held");
  assert.equal(remote.calls.filter((call) => call.operation === "insert").length, 0);
  assert.equal(remote.rows.size, 0);
});

test("failed persistence of the pre-submit marker prevents a remote create", async () => {
  const remote = createRemote();
  const result = await replay(createMutation(), remote.remote, () => false);
  assert.equal(result.status, "held");
  assert.equal(remote.calls.filter((call) => call.operation === "insert").length, 0);
  assert.equal(remote.rows.size, 0);
});

test("normal create and subsequent edit use insert then scoped update", async () => {
  const remote = createRemote();
  const created = await replay(createMutation(), remote.remote, () => true);
  assert.equal(created.status, "completed");
  const editedRow = entry({ reflection: "edited" });
  const updates = recordHealthJournalPendingUpsert({}, { entity: "checkin", intent: "update", row: editedRow });
  const edited = await replay(updates, remote.remote, () => true);
  assert.equal(edited.status, "completed");
  assert.equal(remote.rows.get("entry-1")?.reflection, "edited");
  assert.deepEqual(remote.calls.filter((call) => call.operation === "insert" || call.operation === "update").map((call) => call.operation), ["insert", "update"]);
});

test("a parent deletion suppresses related Feeling values and occurrence creates", () => {
  const child = occurrence();
  let journal = recordHealthJournalPendingUpsert({}, { entity: "signal_occurrence", intent: "create", row: child });
  journal = recordHealthJournalPendingUpsert(journal, { entity: "signal_value", intent: "create", row: signalValue() });
  const deleted = recordHealthJournalPendingDelete(journal, "checkin", "entry-1");
  assert.deepEqual(Object.keys(deleted).sort(), ["checkin:entry-1", "signal_occurrence:occurrence-1", "signal_value:entry-1:signal-1"]);
  assert.deepEqual(replayHealthJournalPendingMutations("signal_value", [signalValue()], deleted, "user-1"), []);
  assert.deepEqual(replayHealthJournalPendingMutations("signal_occurrence", [], deleted, "user-1"), []);
  assert.equal(Object.values(deleted).some((mutation) => mutation.entity === "signal_occurrence" && mutation.operation === "delete"), false);
});

test("Trigger association replacement still sends every occurrence association", async () => {
  let sent: unknown[] = [];
  const client = {
    rpc(_name: string, args: { p_replacements: unknown[] }) {
      sent = args.p_replacements;
      return Promise.resolve({ data: { saved: true, target_count: sent.length, links: [] }, error: null });
    },
  } as never;
  const result = await replaceHealthJournalTriggerAssociations("user-1", "entry-1", [{
    occurrence_id: "occurrence-1",
    occurrence_kind: "journal_signal",
    expected_associations: [],
    associations: [
      { trigger_id: "trigger-1", effect: "improved", previous_score: 3 },
      { trigger_id: "trigger-2", effect: "worsened", previous_score: 7 },
    ],
  }], client);
  assert.equal((result as { saved: boolean }).saved, true);
  assert.equal((sent[0] as { associations: unknown[] }).associations.length, 2);
});
