import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  groupHealthSymptomEntriesByDate,
  HEALTH_MOOD_OPTIONS,
  HEALTH_SCALE_OPTIONS,
  HEALTH_SEVERITY_OPTIONS,
  normalizeHealthSymptomName,
  normalizeHealthSymptomNote,
} from "../src/lib/health-utils.ts";

const schemaSource = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const migrationSource = readFileSync(
  new URL("../supabase/add_health_journal_symptom_tracking_7_12_7.sql", import.meta.url),
  "utf8",
);
const healthHookSource = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
const healthPageSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");

function symptomEntry(
  id: string,
  entryDate: string,
  loggedAt: string,
  severity: number,
  symptomId = "symptom-1",
) {
  return {
    created_at: loggedAt,
    entry_date: entryDate,
    id,
    logged_at: loggedAt,
    note: null,
    severity,
    symptom_id: symptomId,
    updated_at: loggedAt,
    user_id: "user-1",
  };
}

test("Journal scales use 1 through 10 and normalize symptom input", () => {
  assert.deepEqual([...HEALTH_SCALE_OPTIONS], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual([...HEALTH_MOOD_OPTIONS], [...HEALTH_SCALE_OPTIONS]);
  assert.deepEqual([...HEALTH_SEVERITY_OPTIONS], [...HEALTH_SCALE_OPTIONS]);
  assert.equal(normalizeHealthSymptomName("  Back   Pain  "), "Back Pain");
  assert.equal(normalizeHealthSymptomNote("  after walking  "), "after walking");
  assert.equal(normalizeHealthSymptomNote("   "), null);
});

test("same symptom entries coexist and remain individually grouped by day and time", () => {
  const groups = groupHealthSymptomEntriesByDate([
    symptomEntry("morning", "2026-08-29", "2026-08-29T09:00:00.000Z", 3),
    symptomEntry("afternoon", "2026-08-29", "2026-08-29T13:30:00.000Z", 6),
    symptomEntry("prior-day", "2026-08-28", "2026-08-28T19:30:00.000Z", 4),
  ]);

  assert.deepEqual(groups.map((group) => group.date), ["2026-08-29", "2026-08-28"]);
  assert.deepEqual(groups[0]?.entries.map((entry) => [entry.id, entry.severity]), [
    ["afternoon", 6],
    ["morning", 3],
  ]);
  assert.equal(groups[0]?.entries.length, 2);
});

test("the migration expands daily scores without rewriting existing values", () => {
  assert.match(migrationSource, /mood_score_range_check[\s\S]*?mood_score >= 1 and mood_score <= 10/i);
  assert.match(migrationSource, /energy_score_range_check[\s\S]*?energy_score >= 1 and energy_score <= 10/i);
  assert.match(schemaSource, /mood_score_range_check[\s\S]*?mood_score >= 1 and mood_score <= 10/i);
  assert.match(schemaSource, /energy_score_range_check[\s\S]*?energy_score >= 1 and energy_score <= 10/i);
  assert.match(schemaSource, /symptom_tags text\[\] not null default '\{\}'/);
  assert.match(schemaSource, /unique \(user_id, entry_date\)/);
});

test("symptom storage is normalized, unlimited per day, and preserves history on archive", () => {
  for (const source of [schemaSource, migrationSource]) {
    assert.match(source, /create table[^;]+adhdice_health_symptoms/i);
    assert.match(source, /create table[^;]+adhdice_health_symptom_entries/i);
    assert.match(source, /archived_at timestamptz/i);
    assert.match(source, /severity integer not null check \(severity >= 1 and severity <= 10\)/i);
    assert.match(source, /foreign key \(user_id, symptom_id\)[\s\S]*?on delete restrict/i);
    assert.match(source, /unique index[^;]+lower\(regexp_replace\(trim\(name\)/i);
    assert.doesNotMatch(source, /unique\s*\(\s*user_id\s*,\s*symptom_id\s*,\s*entry_date\s*\)/i);
  }
});

test("new symptom tables use authenticated owner-scoped Data API access", () => {
  for (const source of [schemaSource, migrationSource]) {
    assert.match(source, /enable row level security[\s\S]*adhdice_health_symptoms/i);
    assert.match(source, /enable row level security[\s\S]*adhdice_health_symptom_entries/i);
    assert.match(source, /revoke all on table public\.adhdice_health_symptoms from anon, authenticated/i);
    assert.match(source, /revoke all on table public\.adhdice_health_symptom_entries from anon, authenticated/i);
    assert.match(source, /grant select, insert, update on table public\.adhdice_health_symptoms to authenticated/i);
    assert.match(source, /grant select, insert, update, delete on table public\.adhdice_health_symptom_entries to authenticated/i);
    assert.match(source, /for update[\s\S]*?to authenticated[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id\)[\s\S]*?with check \(\(select auth\.uid\(\)\) = user_id\)/i);
  }
});

test("symptom persistence has its own optional fallback and CRUD paths", () => {
  assert.match(healthHookSource, /symptomsResult\.error, symptomEntriesResult\.error/);
  assert.match(healthHookSource, /const symptomPersistenceErrors = \[symptomsResult\.error, symptomEntriesResult\.error\]/);
  assert.match(healthHookSource, /function isMissingHealthSymptomPersistence/);
  assert.match(healthHookSource, /symptomDefinitionsRemoteEnabledRef/);
  assert.match(healthHookSource, /symptomEntriesRemoteEnabledRef/);
  assert.match(healthHookSource, /storageKey\(userId, "symptoms"\)/);
  assert.match(healthHookSource, /storageKey\(userId, "symptom-entries"\)/);
  assert.match(healthHookSource, /async function createSymptom/);
  assert.match(healthHookSource, /async function renameSymptom/);
  assert.match(healthHookSource, /async function archiveSymptom/);
  assert.match(healthHookSource, /async function addSymptomEntry/);
  assert.match(healthHookSource, /async function updateSymptomEntry/);
  assert.match(healthHookSource, /async function deleteSymptomEntry/);
  assert.match(healthHookSource, /\.eq\("id", entryId\)\n\s+\.eq\("user_id", userId\)/);
  assert.match(healthPageSource, /HEALTH_SEVERITY_OPTIONS\.map/);
  assert.match(healthPageSource, /title="Recent symptoms"/);
  assert.match(healthPageSource, /entry\.severity}\/10/);
  assert.match(healthPageSource, /Save Symptom/);
  assert.match(healthPageSource, /deleteSymptomEntry\(entry\.id\)/);
});
