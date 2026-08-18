import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const preview = readFileSync(new URL("../supabase/preview_legacy_history_copy_7_9_31.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrate_legacy_history_copy_7_9_31.sql", import.meta.url), "utf8");
const verification = readFileSync(new URL("../supabase/verify_legacy_history_copy_7_9_31.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase/add_task_state_canonical_schema.sql", import.meta.url), "utf8");
const superseded = ["preview", "migrate", "verify"].map((kind) => readFileSync(
  new URL(`../supabase/${kind}_legacy_history_canonicalization_7_9_30.sql`, import.meta.url),
  "utf8",
));
const exactTaskIds = [
  "8416da45-0dec-49a2-8821-1780af3899a1", "27f7e8e5-062b-40fb-97cb-8d32ddbe8f00",
  "3dc5251e-eb70-4d11-95fe-f130fcbd3596", "89d9cdbf-be07-44e8-ace9-186a3bd6d372",
  "d9653a25-68e5-4882-8beb-855dc1d1c7eb", "b58b602d-80ad-4b7e-a17f-3fb3d5c617d2",
  "f9dbf05c-a4fa-46d2-8370-c7d6443afb0b", "f9b4ab17-7094-49bf-9bdc-262f4078907b",
  "f38746b0-c731-424c-a31a-1640252172c2", "1a5bb729-ec0e-4848-895f-0ff5af28bc15",
  "13f04487-30dd-4af6-be05-231ed3c285de", "df4ef91d-fcee-4411-970c-0c1cf9520ff5",
];

test("7.9.30 History migration artifacts are explicitly superseded", () => {
  for (const sql of superseded) assert.match(sql.split("\n").slice(0, 2).join("\n"), /SUPERSEDED - DO NOT APPLY/);
});

test("preview and migration use only the twelve exact Task IDs and never title selection or a fixed row count", () => {
  for (const sql of [preview, migration, verification]) {
    for (const id of exactTaskIds) assert.match(sql, new RegExp(id));
    assert.doesNotMatch(sql, /where\s+(?:task\.)?title\s*=|\b45\b/i);
  }
  assert.match(preview, /source_legacy_history_id/);
  assert.match(preview, /occurrence_due_on/);
  assert.match(preview, /CANONICAL_EXISTS_WINS/);
  assert.match(preview, /ELIGIBLE_COPY/);
  assert.doesNotMatch(preview, /\b(insert|update|delete|merge|truncate|call)\s+(?:into|from|public)/i);
});

test("literal copy supports all outcomes and preserves only explicit legacy metadata", () => {
  for (const outcome of ["done", "did_my_best", "missed", "delayed", "complete"]) {
    assert.match(migration, new RegExp(`'${outcome}'`));
  }
  assert.match(migration, /legacy\.entry_date as logical_date/);
  assert.match(migration, /legacy\.status::text as outcome/);
  assert.match(migration, /legacy\.occurrence_due_on as scheduled_due_on/);
  assert.match(migration, /candidate\.outcome, 'migration_reconstruction'/);
  assert.match(migration, /null, candidate\.scheduled_due_on, null, null/);
  assert.match(migration, /null, 'migration_reconstruction', 'migration', null/);
  assert.match(migration, /source_legacy_history_id/);
  assert.doesNotMatch(migration, /occurrence_key/);
  assert.doesNotMatch(migration, /adhdice_task_occurrences\s*\(/i);
  assert.doesNotMatch(migration, /adhdice_task_schedule_boundaries\s*\(/i);
  assert.doesNotMatch(migration, /adhdice_execute_task_state_command/i);
});

test("copy is fail-closed, canonical-wins, idempotent, and cannot mutate Task state or rewards", () => {
  assert.match(migration, /left join public\.adhdice_task_history_facts fact[\s\S]*where fact\.id is null/);
  assert.match(migration, /on conflict \(user_id, entity_id, logical_date\) do nothing/);
  assert.match(migration, /v_inserted_count <> v_candidate_count/);
  assert.match(migration, /canonical History conflict appeared during legacy copy/);
  assert.match(migration, /to_jsonb\(task\) is distinct from snapshot\.task_snapshot/);
  assert.doesNotMatch(migration, /update\s+public\.adhdice_clean_tasks/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.adhdice_task_history/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.adhdice_task_reward/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.adhdice_task_history\b/i);
  assert.match(verification, /remaining_eligible_legacy_only_rows/);
  assert.match(verification, /migrated_reward_violations/);
  assert.match(verification, /task_state_fingerprint_violations/);
  assert.match(verification, /duplicate_source_fact_violations/);
});

test("migration-only historical Delay may omit its target while runtime Delay remains strict", () => {
  assert.match(schema, /'correction', 'authorized_automation', 'migration_reconstruction'/);
  assert.match(schema, /outcome = 'delayed'[\s\S]*effective_due_on is not null and effective_due_on > logical_date/);
  assert.match(schema, /effective_due_on is null[\s\S]*event_kind = 'migration_reconstruction'[\s\S]*provenance_kind = 'migration_reconstruction'[\s\S]*actor_kind = 'migration'[\s\S]*migration_operation_id is not null[\s\S]*source_legacy_history_id is not null/);
  assert.match(migration, /candidate\.outcome, 'migration_reconstruction'[\s\S]*null, candidate\.scheduled_due_on, null, null/);
  assert.match(verification, /migrated_delayed_effective_date_violations/);
});
