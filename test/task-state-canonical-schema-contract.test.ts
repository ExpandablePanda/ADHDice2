import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const canonicalSchema = readFileSync(
  new URL("../supabase/add_task_state_canonical_schema.sql", import.meta.url),
  "utf8",
);
const legacySchema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

const canonicalFields = [
  "canonicalization_status",
  "entity_kind",
  "terminal_state",
  "container_state",
  "prior_container_state",
  "prior_container_state_status",
  "terminal_completed_at",
  "container_trashed_at",
  "workflow_state",
  "workflow_started_at",
  "workflow_logical_date",
  "workflow_occurrence_id",
  "workflow_command_id",
  "workflow_revision",
  "canonical_revision",
  "canonical_created_at",
  "canonical_updated_at",
  "projection_source_canonical_revision",
  "projection_source_fingerprint",
  "projection_version",
] as const;

const standaloneCanonicalTables = [
  "adhdice_task_command_operations",
  "adhdice_task_schedule_boundaries",
  "adhdice_task_occurrences",
  "adhdice_task_occurrence_effective_overrides",
  "adhdice_task_history_facts",
  "adhdice_task_calendar_overrides",
  "adhdice_task_reward_entitlements",
  "adhdice_task_reward_grants",
  "adhdice_task_reward_claim_consumptions",
] as const;

test("canonical Task columns are guarded without revoking legacy Task CRUD", () => {
  const guard = canonicalSchema.match(
    /create or replace function public\.adhdice_clean_tasks_guard_canonical_writes\(\)[\s\S]*?create trigger adhdice_clean_tasks_guard_canonical_writes/,
  )?.[0];

  assert.ok(guard, "M1 must install the canonical Task write guard");
  assert.match(guard, /current_user in \('postgres', 'service_role', 'supabase_admin'\)/);
  assert.match(guard, /if tg_op = 'INSERT'/i);
  assert.match(guard, /new\.canonicalization_status is distinct from 'legacy_uninitialized'/i);
  assert.match(guard, /elsif tg_op = 'UPDATE'/i);
  assert.match(guard, /Canonical Task fields may only be written by an authorized database path/);
  assert.match(guard, /errcode = '42501'/i);
  assert.doesNotMatch(guard, /current_setting|set_config/i);
  assert.match(canonicalSchema, /before insert or update on public\.adhdice_clean_tasks/i);
  assert.match(canonicalSchema, /canonicalization_status text not null default 'legacy_uninitialized'/i);

  for (const field of canonicalFields) {
    assert.match(guard, new RegExp(`\\b(?:new|old)\\.${field}\\b`), `${field} must be guarded`);
  }

  assert.doesNotMatch(canonicalSchema, /revoke all on table public\.adhdice_clean_tasks/i);
  assert.match(legacySchema, /alter table public\.adhdice_clean_tasks enable row level security/i);
  assert.match(legacySchema, /create policy "Users can create their own clean tasks"[\s\S]*?with check \(auth\.uid\(\) = user_id\)/i);
  assert.match(legacySchema, /create policy "Users can update their own clean tasks"[\s\S]*?using \(auth\.uid\(\) = user_id\)[\s\S]*?with check \(auth\.uid\(\) = user_id\)/i);
});

test("M1 keeps canonical checks, read-only standalone tables, and rerun guards", () => {
  for (const constraint of [
    "adhdice_clean_tasks_canonicalization_status_check",
    "adhdice_clean_tasks_entity_kind_check",
    "adhdice_clean_tasks_terminal_state_check",
    "adhdice_clean_tasks_container_state_check",
    "adhdice_clean_tasks_prior_container_state_check",
    "adhdice_clean_tasks_prior_container_state_status_check",
    "adhdice_clean_tasks_workflow_state_check",
    "adhdice_clean_tasks_workflow_revision_check",
    "adhdice_clean_tasks_canonical_revision_check",
    "adhdice_clean_tasks_projection_source_revision_check",
    "adhdice_clean_tasks_projection_source_fields_check",
    "adhdice_clean_tasks_canonical_semantics_check",
  ]) {
    assert.match(canonicalSchema, new RegExp(`conname = '${constraint}'`), `${constraint} must remain present`);
  }

  for (const table of standaloneCanonicalTables) {
    assert.match(canonicalSchema, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(canonicalSchema, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"));
    assert.match(canonicalSchema, new RegExp(`grant select on table public\\.${table} to authenticated`, "i"));
    assert.doesNotMatch(canonicalSchema, new RegExp(`grant (?:insert|update|delete|all) on table public\\.${table} to authenticated`, "i"));
  }

  assert.match(canonicalSchema, /create table if not exists public\.adhdice_task_state_schema_contract/i);
  assert.match(canonicalSchema, /create or replace function public\.adhdice_clean_tasks_guard_canonical_writes/i);
  assert.match(canonicalSchema, /drop trigger if exists adhdice_clean_tasks_guard_canonical_writes/i);
  assert.match(canonicalSchema, /create trigger adhdice_clean_tasks_guard_canonical_writes/i);
});
