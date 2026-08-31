import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  HealthJournalSignal,
  HealthJournalSignalValue,
  HealthSymptom,
} from "../src/lib/database.types.ts";
import {
  buildHealthJournalDraftValues,
  DEFAULT_HEALTH_JOURNAL_HIGH_LABEL,
  DEFAULT_HEALTH_JOURNAL_LOW_LABEL,
  getHealthJournalSignalDisplayName,
  getHealthJournalTemplateSignals,
  HEALTH_JOURNAL_SCORE_OPTIONS,
  normalizeHealthJournalScore,
  normalizeHealthJournalSignal,
} from "../src/lib/health-journal.ts";

const migrationSource = readFileSync(
  new URL("../supabase/add_health_journal_daily_log_7_12_34.sql", import.meta.url),
  "utf8",
);
const healthHookSource = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
const healthPageSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");

function signal(id: string, overrides: Partial<HealthJournalSignal> = {}): HealthJournalSignal {
  return {
    archived_at: null,
    created_at: `${id}-created`,
    high_label: DEFAULT_HEALTH_JOURNAL_HIGH_LABEL,
    id,
    in_template: false,
    kind: "other",
    low_label: DEFAULT_HEALTH_JOURNAL_LOW_LABEL,
    name: id,
    symptom_id: null,
    template_sort_order: null,
    updated_at: `${id}-updated`,
    user_id: "user-1",
    ...overrides,
  };
}

function value(signalId: string, entryId: string, score: number): HealthJournalSignalValue {
  return {
    created_at: "2026-08-30T09:00:00.000Z",
    id: `${entryId}-${signalId}`,
    journal_entry_id: entryId,
    score,
    signal_id: signalId,
    updated_at: "2026-08-30T09:00:00.000Z",
    user_id: "user-1",
  };
}

test("Daily Log scores support explicit none, blank Not logged, and only integer values from 0 to 10", () => {
  assert.deepEqual([...HEALTH_JOURNAL_SCORE_OPTIONS], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(normalizeHealthJournalScore(0), 0);
  assert.equal(normalizeHealthJournalScore("10"), 10);
  assert.equal(normalizeHealthJournalScore(""), null);
  assert.equal(normalizeHealthJournalScore(11), null);
  assert.equal(normalizeHealthJournalScore(2.5), null);
});

test("Journal Entry loads active template signals plus saved day-only and archived history", () => {
  const signals = [
    signal("day-only", { in_template: false }),
    signal("archived", { archived_at: "2026-08-29T12:00:00.000Z", in_template: false }),
    signal("template-late", { in_template: true, template_sort_order: 2 }),
    signal("template-first", { in_template: true, template_sort_order: 1 }),
  ];
  const draft = buildHealthJournalDraftValues({
    journalEntryId: "entry-1",
    signals,
    values: [value("day-only", "entry-1", 0), value("archived", "entry-1", 7)],
  });

  assert.deepEqual(draft.map((item) => [item.signal_id, item.score]), [
    ["template-first", null],
    ["template-late", null],
    ["day-only", 0],
    ["archived", 7],
  ]);
  assert.deepEqual(getHealthJournalTemplateSignals(signals).map((item) => item.id), ["template-first", "template-late"]);
});

test("symptom Journal signals resolve their current canonical Health symptom name", () => {
  const symptom: HealthSymptom = {
    archived_at: null,
    color: "#6f57f6",
    created_at: "2026-08-30T09:00:00.000Z",
    id: "symptom-1",
    name: "Renamed symptom",
    updated_at: "2026-08-30T09:00:00.000Z",
    user_id: "user-1",
  };
  const journalSignal = normalizeHealthJournalSignal(signal("journal-1", {
    kind: "symptom",
    name: "stale duplicate",
    symptom_id: symptom.id,
  }));

  assert.equal(getHealthJournalSignalDisplayName(journalSignal, [symptom]), "Renamed symptom");
  assert.equal(journalSignal.name, null);
});

test("7.12.34 source contract covers daily-log constraints, ownership, RLS, and ordered save behavior", () => {
  assert.match(migrationSource, /add column if not exists stress_score integer/);
  assert.match(migrationSource, /add column if not exists clarity_score integer/);
  assert.match(migrationSource, /stress_score is null or \(stress_score >= 1 and stress_score <= 10\)/);
  assert.match(migrationSource, /create table if not exists public\.adhdice_health_journal_signals/);
  assert.match(migrationSource, /kind in \('emotion', 'other'\)[\s\S]*name is not null[\s\S]*char_length\(trim\(name\)\) > 0/);
  assert.match(migrationSource, /create table if not exists public\.adhdice_health_journal_signal_values/);
  assert.match(migrationSource, /unique \(user_id, journal_entry_id, signal_id\)/);
  assert.match(migrationSource, /references public\.adhdice_health_checkins \(user_id, id\)\s+on delete cascade/);
  assert.match(migrationSource, /references public\.adhdice_health_journal_signals \(user_id, id\)\s+on delete restrict/);
  assert.match(migrationSource, /alter table public\.adhdice_health_symptom_entries\s+add column if not exists journal_entry_id uuid/);
  assert.match(migrationSource, /alter table public\.adhdice_health_journal_signals enable row level security/);
  assert.match(migrationSource, /grant select, insert, update, delete on table public\.adhdice_health_journal_signal_values to authenticated/);
  assert.match(migrationSource, /notify pgrst, 'reload schema'/);

  assert.match(healthHookSource, /\.from\("adhdice_health_checkins"\)[\s\S]*\.upsert\(remoteCheckInPayload/);
  assert.match(healthHookSource, /\.from\("adhdice_health_journal_signal_values"\)[\s\S]*\.upsert\(scoredValues/);
  assert.match(healthHookSource, /\.from\("adhdice_health_symptom_entries"\)[\s\S]*\.upsert\(occurrenceRows/);
  assert.match(healthHookSource, /journal_entry_id: nextRow\.id/);
  assert.match(healthPageSource, /Save Journal Entry/);
  assert.match(healthPageSource, /Manage Journal Library/);
  assert.match(healthPageSource, /Not logged/);
  assert.doesNotMatch(healthPageSource, /Save Check-In/);
  assert.doesNotMatch(healthPageSource, />Log a symptom</);
});
