import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../supabase/add_task_state_command_rpc.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase/add_task_state_canonical_schema.sql", import.meta.url), "utf8");
const delayMigration = readFileSync(new URL("../supabase/patch_task_state_command_delay_occurrence_7_7_47.sql", import.meta.url), "utf8");

test("M3A command RPC is a backend-only invoker boundary", () => {
  assert.match(sql, /create or replace function public\.adhdice_execute_task_state_command\(\s*p_user_id uuid,\s*p_command jsonb\s*\)/i);
  assert.match(sql, /security invoker/i);
  assert.doesNotMatch(sql, /security definer/i);
  assert.match(sql, /set search_path = public, pg_temp/i);
  assert.match(sql, /current_user <> 'service_role'/i);
  assert.doesNotMatch(sql, /auth\.uid\(\)/i);
  assert.match(sql, /revoke all on function public\.adhdice_execute_task_state_command\(uuid, jsonb\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.adhdice_execute_task_state_command\(uuid, jsonb\) to service_role/i);
});

test("the authenticated runtime boundary rejects automation and repair provenance", () => {
  assert.match(sql, /v_source_kind <> 'runtime'/i);
  assert.match(sql, /runtime RPC accepts source_kind=runtime only/i);
  assert.doesNotMatch(sql, /v_source_kind not in \('runtime', 'authorized_automation', 'repair'\)/i);
});

test("runtime payload structure is command-specific and rejects provenance spoofing", () => {
  assert.match(sql, /jsonb_object_keys\(v_payload\)/i);
  assert.match(sql, /Lifecycle commands cannot carry History, schedule, occurrence, delay, Calendar, or reward mutations/i);
  assert.match(sql, /Outcome command must carry one explicit outcome History fact/i);
  assert.match(sql, /start_in_progress requires a compatible workflow patch/i);
  assert.match(sql, /clear_in_progress requires a compatible workflow patch/i);
  assert.match(sql, /Runtime Task State provenance is server-owned/i);
  assert.match(sql, /migration_operation_id.*null/i);
  assert.match(sql, /actor_kind.*user/i);
  assert.match(sql, /accepted_payload_digest.*sha256-/i);
});

test("canonical Delay requires a trusted occurrence, delayed History, and effective override", () => {
  const delayBranch = sql.match(/elsif v_command_type = 'delay_occurrence' then([\s\S]*?)elsif v_command_type in \('set_due_date', 'set_repeat'\) then/i)?.[1] ?? "";
  assert.match(delayBranch, /v_history = '\{\}'::jsonb/);
  assert.match(delayBranch, /v_history->>'outcome' <> 'delayed'/);
  assert.match(delayBranch, /v_history->>'event_kind' <> 'delay_audit'/);
  assert.match(delayBranch, /v_effective_override = '\{\}'::jsonb/);
  assert.match(delayBranch, /v_occurrence = '\{\}'::jsonb/);
  assert.match(delayBranch, /v_schedule <> '\{\}'::jsonb/);
  assert.match(delayBranch, /v_calendar_override <> '\{\}'::jsonb/);
  assert.match(delayBranch, /v_payload \? 'reward_program_version'/);
  assert.match(delayBranch, /where key not in \('canonicalization_status'\)/);
});

test("canonical Delay materializes occurrence before validating History ownership", () => {
  const occurrenceInsert = sql.indexOf("insert into public.adhdice_task_occurrences");
  const historyOwnershipCheck = sql.indexOf("History fact occurrence is not owned by the Task entity.");
  assert.ok(occurrenceInsert >= 0);
  assert.ok(historyOwnershipCheck >= 0);
  assert.ok(occurrenceInsert < historyOwnershipCheck);
});

test("7.7.47 migration changes only the stale Delay occurrence predicate and preserves service-role grants", () => {
  assert.match(delayMigration, /pg_get_functiondef\(p\.oid\)/i);
  assert.match(delayMigration, /or v_occurrence <> '\{\}'::jsonb/);
  assert.match(delayMigration, /or v_occurrence = '\{\}'::jsonb/);
  assert.match(delayMigration, /execute replace\(v_definition, v_old, v_new\)/i);
  assert.match(delayMigration, /revoke all on function public\.adhdice_execute_task_state_command\(uuid, jsonb\) from public, anon, authenticated/i);
  assert.match(delayMigration, /grant execute on function public\.adhdice_execute_task_state_command\(uuid, jsonb\) to service_role/i);
  assert.doesNotMatch(delayMigration, /select\s+public\.adhdice_execute_task_state_command\b/i);
});

test("command identity and revision contracts are locked before canonical writes", () => {
  assert.match(schema, /unique \(user_id, idempotence_identity\)/i);
  assert.match(schema, /unique \(user_id, command_id\)/i);
  assert.match(sql, /if v_operation\.state in \('committed', 'rejected'\)[\s\S]*was_replayed', true/i);
  assert.match(sql, /from public\.adhdice_clean_tasks[\s\S]*for update;/i);
  assert.match(sql, /v_task\.canonical_revision is distinct from v_expected_entity_revision/i);
  assert.match(sql, /v_task\.entity_kind is distinct from v_entity_kind/i);
  assert.match(sql, /'STALE_REVISION'/i);
  assert.match(sql, /'STALE_BOUNDARY_SEQUENCE'/i);
  assert.match(sql, /expected_entity_revision bigint/i);
  assert.match(sql, /History and occurrence[\s\S]*not runtime fences/i);
  assert.doesNotMatch(sql, /max\(revision\)[\s\S]*adhdice_task_history_facts/i);
  assert.doesNotMatch(sql, /max\(revision\)[\s\S]*adhdice_task_occurrences/i);
  assert.match(sql, /operation becomes committed only after every canonical write/i);
});

test("first-execution replay identity is serialized and re-read without weakening unique fences", () => {
  assert.equal((sql.match(/pg_advisory_xact_lock\(hashtextextended\(/gi) ?? []).length, 2);
  assert.match(sql, /on conflict do nothing\s+returning \* into v_operation/i);
  assert.match(sql, /a concurrent or separately authorized writer claimed a replay key/i);
  assert.match(sql, /where user_id = p_user_id[\s\S]*\(idempotence_identity = v_idempotence_identity or command_id = v_command_id\)/i);
  assert.match(sql, /using errcode = '40001'/i);
  assert.match(schema, /unique \(user_id, idempotence_identity\)/i);
  assert.match(schema, /unique \(user_id, command_id\)/i);
});

test("canonical and compatibility writes are one guarded projection, with no legacy authority", () => {
  assert.match(sql, /canonical_revision = v_next_revision/i);
  assert.match(sql, /status = v_projection_status::public\.adhdice_clean_task_status/i);
  assert.match(sql, /due_on = v_projection_due_on/i);
  assert.match(sql, /projection_source_canonical_revision = v_next_revision/i);
  assert.match(sql, /projection_source_fingerprint = v_accepted_payload_digest/i);
  assert.doesNotMatch(sql, /insert into public\.adhdice_task_history\b/i);
  assert.doesNotMatch(sql, /insert into public\.adhdice_task_reward_claim_consumptions\b/i);
  assert.doesNotMatch(sql, /insert into public\.adhdice_task_reward_claims\b/i);
  assert.match(sql, /due_on are applied only after this canonical revision check/i);
});

test("rollover cannot synthesize DMB or routine calculated Missed facts", () => {
  assert.match(sql, /v_command_type = 'reconcile_rollover'[\s\S]*v_history <> '\{\}'::jsonb/i);
  assert.match(sql, /Rollover cannot persist a History fact/i);
  assert.match(sql, /synthetic_did_my_best/i);
  assert.match(sql, /Rollover cannot synthesize Did My Best/i);
  assert.match(sql, /Explicit Missed remains a set_outcome command/i);
});

test("reward entitlement persistence uses the canonical identity fence", () => {
  assert.match(schema, /unique \(user_id, entity_id, logical_date, reward_program_version\)/i);
  assert.match(sql, /insert into public\.adhdice_task_reward_entitlements/i);
  assert.match(sql, /on conflict \(user_id, entity_id, logical_date, reward_program_version\) do nothing/i);
  assert.match(sql, /task-reward-entitlement:' \|\| v_entity_id::text/i);
  assert.match(sql, /legacy reward claims are deliberately not consulted or written/i);
});

test("server-owned timestamps are set before schema-aligned record population", () => {
  assert.match(sql, /jsonb_set\(v_schedule, '\{created_at\}', to_jsonb\(now\(\)\), true\)/i);
  assert.match(sql, /jsonb_set\(v_occurrence, '\{updated_at\}', to_jsonb\(now\(\)\), true\)/i);
  assert.match(sql, /jsonb_set\(v_effective_override, '\{created_at\}', to_jsonb\(now\(\)\), true\)/i);
  assert.match(sql, /jsonb_set\(v_history, '\{updated_at\}', to_jsonb\(now\(\)\), true\)/i);
  assert.match(sql, /jsonb_set\(v_calendar_override, '\{created_at\}', to_jsonb\(now\(\)\), true\)/i);
  assert.match(sql, /set history_id = v_history_id,[\s\S]*where user_id = p_user_id and id = v_effective_override_id/i);
});

test("RPC source is a single function body without an execution command", () => {
  assert.equal((sql.match(/\$function\$/g) ?? []).length, 2);
  assert.doesNotMatch(sql, /\bexecute\s+sql\b/i);
  assert.doesNotMatch(sql, /select\s+public\.adhdice_execute_task_state_command\b/i);
  assert.doesNotMatch(sql, /\bbegin\s*;/i);
});
