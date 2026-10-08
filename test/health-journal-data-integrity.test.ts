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
  didHealthJournalDeleteAffectRow,
  quarantineHealthJournalPendingUpsert,
  recordHealthJournalPendingDelete,
  recordHealthJournalPendingUpsert,
  replayHealthJournalPendingMutations,
  type HealthJournalPendingMutationJournal,
} from "../src/lib/health-journal-pending-mutations.ts";

const hookSource = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");

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
  assert.match(hookSource, /\.delete\(\)[\s\S]*?\.eq\("id", entryId\)[\s\S]*?\.select\("id"\)/);
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
  assert.match(hookSource, /mutation\.intent === "update"[\s\S]*?\.update\(row\)/);
});

test("ambiguous cached records are quarantined locally without being projected or uploaded", () => {
  const ambiguous = quarantineHealthJournalPendingUpsert({}, { entity: "checkin", row: checkIn() }, new Set());
  const mutation = Object.values(ambiguous)[0];
  assert.equal(mutation?.operation, "upsert");
  assert.equal(mutation?.operation === "upsert" ? mutation.intent : null, "unknown");
  assert.deepEqual(replayHealthJournalPendingMutations("checkin", [], ambiguous, "user-1"), []);
  assert.match(hookSource, /held locally[\s\S]*They were not restored or uploaded/);
});

test("a failed remote deletion cannot produce a delete success", () => {
  assert.equal(didHealthJournalDeleteAffectRow([], "entry-1"), false);
  assert.equal(didHealthJournalDeleteAffectRow([{ id: "other-entry" }], "entry-1"), false);
  assert.equal(didHealthJournalDeleteAffectRow([{ id: "entry-1" }], "entry-1"), true);
  const deletePath = hookSource.slice(hookSource.indexOf("async function deleteJournalEntry"), hookSource.indexOf("async function updateSymptomDefinition"));
  assert.match(deletePath, /if \(!deletedRemotely && !hasPendingNewEntry\)[\s\S]*?return false/);
  assert.match(deletePath, /setHealthSuccessMessage\(\{[\s\S]*?deletedRemotely \? "Journal Entry deleted\."/);
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

test("normal Journal edits and Trigger persistence retain their active save paths", () => {
  assert.match(hookSource, /async function saveJournalEntry/);
  assert.match(hookSource, /\.from\("adhdice_health_checkins"\)\.update\(remoteCheckInFields\)/);
  assert.match(hookSource, /replaceHealthJournalTriggerAssociations\(userId, nextRow\.id, triggerReplacements, client\)/);
  assert.match(hookSource, /recordJournalPendingMutation\(\{ entity: "signal", operation: "upsert", intent: "update", row: nextRow \}\)/);
  assert.match(hookSource, /recordJournalPendingMutation\(\{ entity: "symptom_entry", operation: "upsert", intent: "update", row: nextRow \}\)/);
});
