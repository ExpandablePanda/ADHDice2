import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const preview = readFileSync(new URL("../supabase/preview_legacy_history_canonicalization_7_9_30.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrate_legacy_history_canonicalization_7_9_30.sql", import.meta.url), "utf8");
const verification = readFileSync(new URL("../supabase/verify_legacy_history_canonicalization_7_9_30.sql", import.meta.url), "utf8");
const exactTaskIds = [
  "8416da45-0dec-49a2-8821-1780af3899a1", "27f7e8e5-062b-40fb-97cb-8d32ddbe8f00",
  "3dc5251e-eb70-4d11-95fe-f130fcbd3596", "89d9cdbf-be07-44e8-ace9-186a3bd6d372",
  "d9653a25-68e5-4882-8beb-855dc1d1c7eb", "b58b602d-80ad-4b7e-a17f-3fb3d5c617d2",
  "f9dbf05c-a4fa-46d2-8370-c7d6443afb0b", "f9b4ab17-7094-49bf-9bdc-262f4078907b",
  "f38746b0-c731-424c-a31a-1640252172c2", "1a5bb729-ec0e-4848-895f-0ff5af28bc15",
  "13f04487-30dd-4af6-be05-231ed3c285de", "df4ef91d-fcee-4411-970c-0c1cf9520ff5",
];

test("preview and migration scope use only the twelve exact confirmed Task IDs", () => {
  for (const sql of [preview, migration, verification]) {
    for (const id of exactTaskIds) assert.match(sql, new RegExp(id));
    assert.doesNotMatch(sql, /another Voids|another Chicken Legs|where\s+title\s*=|\b45\b/i);
  }
});

test("preview is read-only and reports candidates plus canonical conflicts", () => {
  assert.match(preview, /CANONICAL_CONFLICT_PRESERVED/);
  assert.match(preview, /CANDIDATE/);
  assert.doesNotMatch(preview, /\b(insert|update|delete|merge|truncate|call)\b/i);
});

test("forward migration preserves legacy identity, never fabricates occurrence identity, and fails closed on races", () => {
  assert.match(migration, /source_legacy_history_id/);
  assert.match(migration, /migration_reconstruction/);
  assert.match(migration, /'migration'/);
  assert.match(migration, /null, null, null, null, null, 'migration_reconstruction'/);
  assert.match(migration, /on conflict \(user_id, entity_id, logical_date\) do nothing/);
  assert.match(migration, /canonical History conflict appeared during migration/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.adhdice_task_history/i);
  assert.doesNotMatch(migration, /update\s+public\.adhdice_task_history_facts/i);
});

test("migration rerun is a no-op and verification detects missing coverage or unintended replacements", () => {
  assert.match(migration, /where fact\.id is null/);
  assert.match(migration, /candidate_count/);
  assert.match(verification, /remaining_candidates/);
  assert.match(verification, /malformed_migration_facts/);
  assert.match(verification, /unintended_migration_facts/);
  assert.match(verification, /preexisting_canonical_facts_preserved/);
});
