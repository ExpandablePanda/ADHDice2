import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../supabase/add_task_state_command_rpc.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase/add_task_state_canonical_schema.sql", import.meta.url), "utf8");
const delayMigration = readFileSync(new URL("../supabase/patch_task_state_command_delay_occurrence_7_7_47.sql", import.meta.url), "utf8");
const rolloverMigration = readFileSync(new URL("../supabase/patch_task_state_command_rollover_7_9_20.sql", import.meta.url), "utf8");
const autoMissedMigration = readFileSync(new URL("../supabase/patch_task_state_auto_missed_history_copy_7_9_31.sql", import.meta.url), "utf8");

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

test("the backend runtime boundary allows automation provenance only for trusted rollover", () => {
  assert.match(sql, /v_source_kind <> 'runtime'[\s\S]*v_command_type = 'reconcile_rollover'[\s\S]*authorized_automation/i);
  assert.match(sql, /runtime RPC accepts source_kind=runtime, except for the trusted automatic rollover provenance/i);
  assert.doesNotMatch(sql, /v_source_kind not in \('runtime', 'authorized_automation', 'repair'\)/i);
});

test("runtime payload structure is command-specific and rejects provenance spoofing", () => {
  assert.match(sql, /jsonb_object_keys\(v_payload\)/i);
  assert.match(sql, /Lifecycle commands cannot carry History, schedule, occurrence, delay, Calendar, or reward mutations/i);
  assert.match(sql, /Outcome command must carry one explicit outcome History fact/i);
  assert.match(sql, /start_in_progress requires a compatible workflow patch/i);
  assert.match(sql, /clear_in_progress requires a compatible workflow patch/i);
  assert.match(sql, /Runtime Task State provenance is server-owned/i);
  assert.doesNotMatch(sql, /migration_operation_id|migration_version|classifier_version/i);
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

test("Calendar override commands replace the active row without deleting audit history", () => {
  const overrideBranchStart = sql.indexOf("if v_calendar_override <> '{}'::jsonb then");
  const entitlementStart = sql.indexOf("-- The entitlement is canonical", overrideBranchStart);
  const overrideBranch = sql.slice(overrideBranchStart, entitlementStart);
  const retireIndex = overrideBranch.indexOf("update public.adhdice_task_calendar_overrides existing_override");
  const insertIndex = overrideBranch.indexOf("insert into public.adhdice_task_calendar_overrides");

  assert.ok(retireIndex >= 0);
  assert.ok(insertIndex > retireIndex);
  assert.match(overrideBranch, /existing_override\.user_id = p_user_id/);
  assert.match(overrideBranch, /existing_override\.entity_id = v_entity_id/);
  assert.match(overrideBranch, /existing_override\.logical_date = nullif\(v_calendar_override->>'logical_date', ''\)::date/);
  assert.match(overrideBranch, /existing_override\.is_active/);
  assert.match(overrideBranch, /is_active = false/);
  assert.match(overrideBranch, /cleared_at = now\(\)/);
  assert.match(overrideBranch, /cleared_by_command_id = v_command_id/);
  assert.match(overrideBranch, /revision = existing_override\.revision \+ 1/);
  assert.doesNotMatch(overrideBranch, /delete\s+from\s+public\.adhdice_task_calendar_overrides/i);
  assert.match(schema, /create unique index if not exists adhdice_task_calendar_overrides_active_key[\s\S]*where is_active/i);
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

test("rollover accepts only the trusted automatic DMB artifact set", () => {
  const branch = sql.match(/if v_command_type = 'reconcile_rollover' then([\s\S]*?)end if;\n\n  if v_projection->>'status'/i)?.[1] ?? "";
  assert.match(branch, /v_history = '\{\}'::jsonb/);
  assert.match(branch, /v_history->>'outcome' <> 'did_my_best'/i);
  assert.match(branch, /v_history->>'event_kind' <> 'authorized_automation'/i);
  assert.match(branch, /logical_date.*v_task\.workflow_logical_date/i);
  assert.match(branch, /workflow_occurrence_id/i);
  assert.match(branch, /without a workflow occurrence cannot carry a scheduled due date/i);
  assert.match(branch, /task-reward-v1/i);
  assert.match(branch, /effective_logical_date/i);
  assert.doesNotMatch(branch, /v_history->>'outcome' <> 'done'/i);
  assert.match(sql, /synthetic_did_my_best/i);
  assert.match(rolloverMigration, /pg_get_functiondef\(p\.oid\)/i);
  assert.match(rolloverMigration, /execute v_definition/i);
  assert.match(rolloverMigration, /Automatic rollover must finalize only the stale workflow as Did My Best/i);
  assert.doesNotMatch(rolloverMigration, /select\s+public\.adhdice_execute_task_state_command\b/i);
});

test("trusted rollover persists idempotent Auto Missed without rewards and fences dependent cleanup", () => {
  assert.match(sql, /automatic_history_facts/);
  assert.match(sql, /value->>'outcome' <> 'missed'/);
  assert.match(sql, /\(value->>'logical_date'\)::date >= public\.adhdice_effective_logical_date/);
  assert.match(sql, /boundary\.boundary_sequence = v_current_boundary_sequence/);
  assert.match(sql, /boundary\.schedule_model <> 'unscheduled'/);
  assert.match(sql, /on conflict \(user_id, entity_id, logical_date\) do nothing/);
  assert.match(sql, /Automatic Missed conflicts with an existing canonical History fact/);
  assert.match(sql, /v_history_row\.outcome in \('done', 'did_my_best', 'complete'\)/);
  assert.doesNotMatch(sql, /v_history_row\.outcome in \([^)]*missed/);

  assert.match(sql, /automatic_history_delete_ids/);
  assert.match(sql, /fact\.provenance_kind <> 'authorized_automation'/);
  assert.match(sql, /fact\.actor_kind <> 'authorized_automation'/);
  assert.match(sql, /boundary\.schedule_model = 'rolling'/);
  assert.match(sql, /boundary\.repeat_interval > 1/);
  assert.match(sql, /canonical_history_id = fact\.id/);
});

test("7.9.31 forward patch targets the installed RPC and migration-only Delay allowance", () => {
  assert.match(autoMissedMigration, /pg_get_functiondef\(p\.oid\)/i);
  assert.match(autoMissedMigration, /automatic_history_facts/);
  assert.match(autoMissedMigration, /Automatic Missed conflicts with an existing canonical History fact/);
  assert.match(autoMissedMigration, /Dependent automatic History deletion is not proven safe/);
  assert.match(autoMissedMigration, /event_kind = 'migration_reconstruction'[\s\S]*provenance_kind = 'migration_reconstruction'[\s\S]*actor_kind = 'migration'/);
  assert.match(autoMissedMigration, /revoke all on function public\.adhdice_execute_task_state_command\(uuid, jsonb\) from public, anon, authenticated/i);
  assert.match(autoMissedMigration, /grant execute on function public\.adhdice_execute_task_state_command\(uuid, jsonb\) to service_role/i);
  assert.doesNotMatch(autoMissedMigration, /select\s+public\.adhdice_execute_task_state_command\b/i);
  assert.doesNotMatch(autoMissedMigration, /insert\s+into\s+public\.adhdice_clean_tasks/i);
  assert.doesNotMatch(autoMissedMigration, /insert\s+into\s+public\.adhdice_task_reward_entitlements/i);
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
