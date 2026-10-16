import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  HealthCheckIn,
  HealthJournalSignal,
  HealthJournalSignalOccurrence,
  HealthJournalSignalValue,
  HealthSymptom,
  HealthSymptomEntry,
} from "../src/lib/database.types.ts";
import {
  normalizeHealthJournalPendingMutations,
  quarantineHealthJournalPendingUpsert,
  quarantineUnownedHealthJournalPendingUpsert,
  recordHealthJournalPendingDelete,
  recordHealthJournalPendingUpsert,
  replayHealthJournalPendingUpsertMutation,
  replayHealthJournalPendingMutations,
  type HealthJournalPendingMutationJournal,
} from "../src/lib/health-journal-pending-mutations.ts";
import { deleteHealthJournalRecordWithTombstone } from "../src/lib/health-journal-tombstones.ts";

const hookSource = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

function checkIn(overrides: Partial<HealthCheckIn> = {}): HealthCheckIn {
  return {
    clarity_score: null,
    created_at: "2026-10-01T10:00:00.000Z",
    energy_score: null,
    entry_date: "2026-10-01",
    entry_time: "10:00:00",
    entry_type: "event",
    id: "entry-1",
    mood_score: null,
    reflection: "saved entry",
    stress_score: null,
    structured_answers: { custom_answers: [], schema_version: 1 },
    symptom_tags: [],
    updated_at: "2026-10-01T10:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

function signal(overrides: Partial<HealthJournalSignal> = {}): HealthJournalSignal {
  return {
    archived_at: null,
    color: "#7863d2",
    created_at: "2026-10-01T10:00:00.000Z",
    high_label: "High",
    id: "signal-1",
    in_template: true,
    kind: "emotion",
    low_label: "Low",
    name: "Calm",
    scale_labels: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
    symptom_id: null,
    template_sort_order: 0,
    updated_at: "2026-10-01T10:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

const feelingOccurrence: HealthJournalSignalOccurrence = {
  created_at: "2026-10-01T10:00:00.000Z",
  entry_date: "2026-10-01",
  id: "feeling-occurrence-1",
  journal_entry_id: "entry-1",
  note: null,
  occurred_at: "2026-10-01T10:00:00.000Z",
  score: 6,
  signal_id: "signal-1",
  time_is_estimated: false,
  updated_at: "2026-10-01T10:00:00.000Z",
  user_id: "user-1",
};

const symptom: HealthSymptom = {
  archived_at: null,
  color: "#7863d2",
  created_at: "2026-10-01T10:00:00.000Z",
  id: "symptom-1",
  name: "Headache",
  updated_at: "2026-10-01T10:00:00.000Z",
  user_id: "user-1",
};

const symptomOccurrence: HealthSymptomEntry = {
  created_at: "2026-10-01T10:00:00.000Z",
  entry_date: "2026-10-01",
  id: "symptom-occurrence-1",
  journal_entry_id: "entry-1",
  logged_at: "2026-10-01T10:00:00.000Z",
  note: null,
  severity: 4,
  symptom_id: "symptom-1",
  time_is_estimated: false,
  updated_at: "2026-10-01T10:00:00.000Z",
  user_id: "user-1",
};

test("delete then refresh keeps a remote-deleted Journal Entry deleted", () => {
  const staleLocalCache = [checkIn()];
  assert.deepEqual(replayHealthJournalPendingMutations("checkin", [], {}, "user-1"), []);
  assert.equal(staleLocalCache[0]?.id, "entry-1");
  assert.doesNotMatch(hookSource, /localCheckInsToRecover/);
});

test("delete remains effective after an application update reloads stale local storage", () => {
  const staleLocalCache = [checkIn({ reflection: "old cached snapshot" })];
  const afterUpdateHydration = replayHealthJournalPendingMutations("checkin", [], {}, "user-1");
  assert.deepEqual(afterUpdateHydration, []);
  assert.equal(staleLocalCache.length, 1);
});

test("device B refresh uses remote deletion authority over its stale Journal cache", () => {
  const deviceBStaleCache = [checkIn()];
  const deviceBHydrated = replayHealthJournalPendingMutations("checkin", [], {}, "user-1");
  assert.deepEqual(deviceBHydrated, []);
  assert.equal(deviceBStaleCache[0]?.id, "entry-1");
});

test("unmarked stale Journal snapshots and Feeling records are never recovered", () => {
  assert.deepEqual(replayHealthJournalPendingMutations("checkin", [], {}, "user-1"), []);
  assert.deepEqual(replayHealthJournalPendingMutations("signal", [], {}, "user-1"), []);
  assert.deepEqual(replayHealthJournalPendingMutations("signal_occurrence", [], {}, "user-1"), []);
  assert.deepEqual(replayHealthJournalPendingMutations("symptom", [], {}, "user-1"), []);
  assert.deepEqual(replayHealthJournalPendingMutations("symptom_entry", [], {}, "user-1"), []);
  assert.doesNotMatch(hookSource, /unreconciledLocalSymptoms/);
  assert.doesNotMatch(hookSource, /localOccurrencesToRecover/);
});

test("a deleted Journal Entry suppresses stale child Feeling and Symptom occurrences", () => {
  const pendingDelete = recordHealthJournalPendingDelete({}, "checkin", "entry-1");
  assert.deepEqual(replayHealthJournalPendingMutations("signal_occurrence", [feelingOccurrence], pendingDelete, "user-1"), []);
  assert.deepEqual(replayHealthJournalPendingMutations("symptom_entry", [symptomOccurrence], pendingDelete, "user-1"), []);
});

test("a pending edit to a remotely deleted row stays preserved but cannot recreate it", () => {
  const pendingUpdate = recordHealthJournalPendingUpsert({}, {
    entity: "checkin",
    intent: "update",
    row: checkIn({ reflection: "offline edit" }),
  });
  assert.deepEqual(replayHealthJournalPendingMutations("checkin", [], pendingUpdate, "user-1"), []);
  assert.equal(Object.keys(pendingUpdate).length, 1);
  assert.equal(replayHealthJournalPendingMutations("checkin", [checkIn()], pendingUpdate, "user-1")[0]?.reflection, "offline edit");
});

test("ambiguous cached records are quarantined locally without being projected or uploaded", () => {
  const ambiguous = quarantineHealthJournalPendingUpsert({}, { entity: "checkin", row: checkIn() }, new Set());
  const mutation = Object.values(ambiguous)[0];
  assert.equal(mutation?.operation, "upsert");
  assert.equal(mutation?.operation === "upsert" ? mutation.intent : null, "unknown");
  assert.deepEqual(replayHealthJournalPendingMutations("checkin", [], ambiguous, "user-1"), []);
  assert.match(hookSource, /ambiguous cached Journal[\s\S]*held locally[\s\S]*They were not restored, reassigned, or uploaded/);
});

test("owner-mismatched cached rows stay quarantined without replacing same-ID owned pending writes", async () => {
  const foreignCreate = recordHealthJournalPendingUpsert({}, {
    entity: "checkin",
    intent: "create",
    row: checkIn({ reflection: "foreign pending create", user_id: "user-2" }),
  });
  assert.deepEqual(replayHealthJournalPendingMutations("checkin", [], foreignCreate, "user-1"), []);
  const foreignCreateMutation = Object.values(foreignCreate)[0];
  assert.equal(foreignCreateMutation?.operation === "upsert" ? foreignCreateMutation.row.user_id : null, "user-2");

  const ownedCreate = recordHealthJournalPendingUpsert({}, { entity: "checkin", intent: "create", row: checkIn() });
  const foreignRow = checkIn({ reflection: "foreign cached record", user_id: "user-2" });
  const quarantined = quarantineUnownedHealthJournalPendingUpsert(ownedCreate, { entity: "checkin", row: foreignRow }, "user-1");
  const normalized = normalizeHealthJournalPendingMutations(JSON.parse(JSON.stringify(quarantined)));
  const ownerQuarantine = Object.entries(normalized).find(([, mutation]) => mutation.operation === "upsert" && mutation.intent === "unknown");

  assert.equal(normalized["checkin:entry-1"]?.operation, "upsert");
  assert.equal(normalized["checkin:entry-1"]?.operation === "upsert" ? normalized["checkin:entry-1"].intent : null, "create");
  assert.equal(ownerQuarantine?.[0].startsWith("quarantine:owner-user-1:"), true);
  assert.equal(ownerQuarantine?.[1].operation === "upsert" ? ownerQuarantine[1].row.user_id : null, "user-2");
  assert.deepEqual(replayHealthJournalPendingMutations("checkin", [], normalized, "user-1").map((row) => row.user_id), ["user-1"]);
  const secondForeignVersion = quarantineUnownedHealthJournalPendingUpsert(
    normalized,
    { entity: "checkin", row: checkIn({ reflection: "another ambiguous version", user_id: "user-2" }) },
    "user-1",
  );
  assert.equal(Object.values(secondForeignVersion).filter((candidate) => candidate.operation === "upsert" && candidate.intent === "unknown").length, 2);

  let remoteCalls = 0;
  const mutation = ownerQuarantine?.[1];
  assert.equal(mutation?.operation, "upsert");
  if (mutation?.operation !== "upsert") return;
  const replay = await replayHealthJournalPendingUpsertMutation({
    journal: normalized,
    key: ownerQuarantine[0],
    mutation,
    persist: () => true,
    remote: {
      read: async () => { remoteCalls += 1; return { data: null, error: null }; },
      insert: async () => { remoteCalls += 1; return { data: null, error: null }; },
      update: async () => { remoteCalls += 1; return { data: null, error: null }; },
    },
    userId: "user-1",
  });
  assert.equal(replay.status, "held");
  assert.equal(remoteCalls, 0);
});

test("an unknown quarantined Journal record survives a same-ID tombstone", () => {
  const quarantined = quarantineHealthJournalPendingUpsert({}, { entity: "checkin", row: checkIn({ user_id: "user-2" }) }, new Set());
  const withTombstone = recordHealthJournalPendingDelete(quarantined, "checkin", "entry-1");
  const values = Object.values(withTombstone);
  assert.equal(values.some((mutation) => mutation.operation === "delete" && mutation.id === "entry-1"), true);
  assert.equal(values.some((mutation) => mutation.operation === "upsert" && mutation.intent === "unknown" && mutation.row.user_id === "user-2"), true);
});

test("Health hydration preserves local quarantine state across navigation and split-panel reuse", () => {
  assert.match(hookSource, /journalPendingOwnerRef\.current === userId[\s\S]*?journalPendingMutationsRef\.current/);
  assert.match(hookSource, /applySnapshot\(validatedLocalSnapshot, \{ persistenceMode: "local", remoteAuthority: "preserve" \}\)/);
  assert.match(hookSource, /const journalReadsComplete = \[[\s\S]*?\]\.every\(\(result\) => !result\.error && \(result\.data \?\? \[\]\)\.every\(\(row\) => row\.user_id === userId\)\)/);
  assert.match(hookSource, /remoteAuthority: journalReadsComplete \? "update" : "invalidate"/);
  assert.match(hookSource, /applySnapshot\(cachedRemoteAuthority\.snapshot, \{ persistenceMode: "remote", remoteAuthority: "update" \}\)/);
  assert.match(hookSource, /applySnapshot\(nextSnapshot, \{ persistenceMode: options\?\.persistRemotely \? "remote" : "local" \}\)/);
  assert.match(hookSource, /function applySnapshot\([\s\S]*?remoteAuthority === "invalidate"[\s\S]*?persistenceMode === "remote"/);
  assert.match(hookSource, /consumeHealthLocalPersistenceFailureMessage\(healthLocalPersistenceFailureRef\)/);
  assert.match(hookSource, /if \(!client\)[\s\S]*?countUnresolvedHealthJournalQuarantine[\s\S]*?if \(warningParts\.length > 0\)/);
  assert.match(hookSource, /cachedRemoteAuthority\?\.client === client[\s\S]*?countUnresolvedHealthJournalQuarantine[\s\S]*?if \(cacheReuseWarningParts\.length > 0\)/);
  assert.match(hookSource, /const hydrationWarningParts: string\[\] = \[\][\s\S]*?countUnresolvedHealthJournalQuarantine[\s\S]*?if \(hydrationWarningParts\.length > 0\)/);
  assert.match(taskAppSource, /\} = useHealth\([\s\S]*?isMasterPanelPageActive\("Health"\) \|\| batchIntakeHealthActive\)/);
  assert.equal((taskAppSource.match(/\buseHealth\(/g) ?? []).length, 1);
});

test("a failed tombstone RPC cannot produce a confirmed deletion", async () => {
  const failingClient = { rpc: () => Promise.resolve({ data: null, error: { message: "tombstone unavailable" } }) } as never;
  await assert.rejects(
    deleteHealthJournalRecordWithTombstone({ client: failingClient, entity: "checkin", id: "entry-1" }),
    /tombstone unavailable/,
  );
  const idempotentClient = {
    rpc: () => Promise.resolve({ data: [{ deleted: false, id: "entry-1", tombstoned: true }], error: null }),
  } as never;
  assert.deepEqual(await deleteHealthJournalRecordWithTombstone({ client: idempotentClient, entity: "checkin", id: "entry-1" }), {
    deleted: false,
    tombstoned: true,
  });
});

test("explicitly pending new Journal records survive remote hydration", () => {
  const pending: HealthJournalPendingMutationJournal = recordHealthJournalPendingUpsert({}, { entity: "checkin", intent: "create", row: checkIn() });
  assert.deepEqual(replayHealthJournalPendingMutations("checkin", [], pending, "user-1"), [checkIn()]);

  const value: HealthJournalSignalValue = {
    created_at: "2026-10-01T10:00:00.000Z",
    id: "signal-value-1",
    journal_entry_id: "entry-1",
    score: 6,
    signal_id: "signal-1",
    updated_at: "2026-10-01T10:00:00.000Z",
    user_id: "user-1",
  };
  const withDefinitions = recordHealthJournalPendingUpsert(pending, { entity: "signal", intent: "create", row: signal() });
  const withValue = recordHealthJournalPendingUpsert(withDefinitions, { entity: "signal_value", intent: "create", row: value });
  const withFeeling = recordHealthJournalPendingUpsert(withValue, { entity: "signal_occurrence", intent: "create", row: feelingOccurrence });
  const withSymptom = recordHealthJournalPendingUpsert(withFeeling, { entity: "symptom", intent: "create", row: symptom });
  const withSymptomEntry = recordHealthJournalPendingUpsert(withSymptom, { entity: "symptom_entry", intent: "create", row: symptomOccurrence });
  assert.equal(replayHealthJournalPendingMutations<HealthJournalSignal>("signal", [], withSymptomEntry, "user-1")[0]?.id, "signal-1");
  assert.equal(replayHealthJournalPendingMutations<HealthJournalSignalValue>("signal_value", [], withSymptomEntry, "user-1")[0]?.id, "signal-value-1");
  assert.equal(replayHealthJournalPendingMutations<HealthJournalSignalOccurrence>("signal_occurrence", [], withSymptomEntry, "user-1")[0]?.id, "feeling-occurrence-1");
  assert.equal(replayHealthJournalPendingMutations<HealthSymptom>("symptom", [], withSymptomEntry, "user-1")[0]?.id, "symptom-1");
  assert.equal(replayHealthJournalPendingMutations<HealthSymptomEntry>("symptom_entry", [], withSymptomEntry, "user-1")[0]?.id, "symptom-occurrence-1");
});
