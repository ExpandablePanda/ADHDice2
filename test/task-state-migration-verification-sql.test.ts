import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const verifier = readFileSync(new URL("../supabase/verify_task_state_migration.sql", import.meta.url), "utf8");
const rpc = readFileSync(new URL("../supabase/task_state_migration_backfill_rpc.sql", import.meta.url), "utf8");

function withoutSqlComments(sql: string): string { return sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, ""); }
function executableSql(sql: string): string { return withoutSqlComments(sql).replace(/'(?:''|[^'])*'/g, "''"); }

test("M2 verifier is read-only and returns explicit PASS/FAIL counts", () => {
  const executable = executableSql(verifier);
  assert.doesNotMatch(executable, /\b(insert|update|delete|alter|drop|create|grant|revoke|truncate|call|perform)\b/i);
  assert.match(verifier, /case when count\(\*\) = 0 then 'PASS' else 'FAIL' end/i);
  assert.match(executable, /violation_count/);
  for (const check of [
    "no_cross_user_canonical_relationships",
    "no_duplicate_schedule_boundary_identity",
    "no_duplicate_canonical_history_entity_date",
    "no_duplicate_occurrence_natural_key",
    "no_migration_automatic_missed_reconstruction",
    "no_migration_reward_objects",
    "no_migration_reward_operation_counts",
    "canonical_proven_tasks_have_complete_semantics",
    "canonical_proven_tasks_have_migration_provenance",
    "no_canonical_task_with_unresolved_required_state",
    "legacy_history_source_identity_preserved",
    "owner_history_exclusions_have_no_canonical_reconstruction",
    "migration_boundaries_are_prospective",
    "task_entity_identity_count_unchanged",
    "source_fingerprints_reconcile_stage_markers",
    "committed_operations_have_required_writes",
  ]) assert.match(verifier, new RegExp(check));
  assert.doesNotMatch(verifier, /adhdice_task_clean_tasks/);
  assert.match(verifier, /with target_users as[\s\S]*last_successful_stage = 'M2'[\s\S]*state in \('canonical_backfilled', 'needs_attention'\)/i);
  assert.match(verifier, /join target_users scope on scope\.user_id = history\.user_id/i);
  assert.match(verifier, /legacy_was_completed is distinct from history\.was_completed/i);
  assert.match(verifier, /source_snapshot->>'created_at'/i);
  assert.match(verifier, /task\.terminal_state <> 'permanently_complete'/i);
  assert.match(verifier, /task\.container_state not in \('archived', 'trashed'\)/i);
});

test("privileged backfill RPC is service-role-only, owner-scoped, and fixed-search-path", () => {
  assert.match(rpc, /security invoker/i);
  assert.match(rpc, /set search_path = ''/i);
  assert.match(rpc, /current_user <> 'service_role'/i);
  assert.match(rpc, /p_plan->>'userId' is distinct from p_user_id::text/);
  assert.match(rpc, /where user_id = p_user_id and id = v_entity_id/);
  assert.match(rpc, /operation_identity = p_plan->>'operationIdentity'/i);
  assert.match(rpc, /on conflict \(user_id, source_history_id\)/i);
  assert.match(rpc, /grant execute[\s\S]*to service_role/i);
  assert.match(rpc, /revoke all on function[\s\S]*?from public, anon, authenticated/i);
  assert.doesNotMatch(rpc, /security definer/i);
  assert.doesNotMatch(rpc, /NEXT_PUBLIC_/i);
  const operationLookup = rpc.indexOf("select state, input_fingerprint, result_references, id, entity_id");
  const taskGuard = rpc.indexOf("select * into v_task");
  assert.ok(operationLookup >= 0 && taskGuard >= 0 && operationLookup < taskGuard, "committed operation lookup must precede mutable Task source validation");
  assert.match(rpc, /v_existing_entity_id is distinct from v_entity_id/i);
  assert.match(rpc, /Task already has canonical facts from another M2 operation/i);
  assert.match(rpc, /legacy History evidence does not match the locked source row/i);
  for (const field of [
    "legacyEntryDate",
    "legacyStatus",
    "legacyEventType",
    "legacyOccurrenceKey",
    "legacyOccurrenceDueOn",
    "legacyCountedAsDueOccurrence",
    "legacyWasCompleted",
    "legacyCreatedAt",
    "legacyUpdatedAt",
  ]) assert.match(rpc, new RegExp(`v_evidence->>'${field}'`));
  assert.match(rpc, /v_fact->>'outcome' not in \('done', 'did_my_best'\)/i);
  assert.match(rpc, /v_fact->>'logicalDate' is distinct from p_plan->>'logicalDate'/i);
  assert.match(rpc, /history\.entry_date = \(v_fact->>'logicalDate'\)::date/i);
  assert.match(rpc, /history\.status::text = v_fact->>'outcome'/i);
  assert.match(rpc, /lease_token = p_lease_token[\s\S]*lease_owner = p_lease_owner/i);
  assert.match(rpc, /active ready M2 plan is missing its schedule boundary/i);
  assert.match(rpc, /TRASHED_SCHEDULE_REPAIR_REQUIRED_BEFORE_RESTORE/i);
  assert.match(rpc, /terminal_state <> 'permanently_complete'/i);
});

test("M2 backfill RPC parenthesizes CASE operands in DISTINCT FROM comparisons", () => {
  assert.doesNotMatch(rpc, /\bis\s+(?:not\s+)?distinct\s+from\s+case\b/i);

  const normalized = rpc.replace(/\s+/g, " ").toLowerCase();
  for (const comparison of [
    "p_plan->'canonicalTask'->>'terminalState' is distinct from (case",
    "nullif(p_plan->'canonicalTask'->>'terminalCompletedAt', '')::timestamptz is distinct from (case",
    "p_plan->'canonicalTask'->>'containerState' is distinct from (case",
    "nullif(p_plan->'canonicalTask'->>'containerTrashedAt', '')::timestamptz is distinct from (case",
    "nullif(p_plan->'canonicalTask'->>'priorContainerState', '') is distinct from (case",
    "p_plan->'canonicalTask'->>'priorContainerStateStatus' is distinct from (case",
    "p_plan->'scheduleBoundary'->>'scheduleModel' is distinct from (case",
    "p_plan->'scheduleBoundary'->>'repeatFrequency' is distinct from (case",
    "nullif(p_plan->'scheduleBoundary'->>'oneTimeDueOn', '')::date is distinct from (case",
    "nullif(p_plan->'scheduleBoundary'->>'anchorDate', '')::date is distinct from (case",
  ]) {
    assert.ok(normalized.includes(comparison.toLowerCase()), `missing parenthesized CASE operand: ${comparison}`);
  }
});

test("M2 backfill RPC normalizes all legacy enum comparisons to text", () => {
  const normalized = rpc.replace(/\s+/g, " ").toLowerCase();
  for (const comparison of [
    "p_plan->'tasksnapshot'->>'status' is distinct from v_task.status::text",
    "v_evidence->>'legacystatus' is distinct from v_source_history.status::text",
    "v_evidence->'sourcesnapshot'->>'status' is distinct from v_source_history.status::text",
    "p_plan->'scheduleboundary'->>'repeatfrequency' is distinct from (case when v_task.repeat_frequency in ('none') then 'none'::text else v_task.repeat_frequency::text end)",
    "v_task.status::text is distinct from v_fact->>'outcome'",
    "history.status::text = v_fact->>'outcome'",
  ]) {
    assert.ok(normalized.includes(comparison), `missing enum-to-text normalization: ${comparison}`);
  }

  for (const unsafeComparison of [
    /p_plan->'tasksnapshot'->>'status' is distinct from v_task\.status(?!::text)/i,
    /v_evidence->>'legacystatus' is distinct from v_source_history\.status(?!::text)/i,
    /v_evidence->'sourcesnapshot'->>'status' is distinct from v_source_history\.status(?!::text)/i,
    /p_plan->'scheduleboundary'->>'repeatfrequency' is distinct from \(case when v_task\.repeat_frequency in \('none'\) then 'none' else v_task\.repeat_frequency end\)/i,
    /v_task\.status(?!::text) is distinct from v_fact->>'outcome'/i,
    /history\.status(?!::text) = v_fact->>'outcome'/i,
  ]) {
    assert.doesNotMatch(normalized, unsafeComparison, `unsafe enum/text comparison remains: ${unsafeComparison}`);
  }

  assert.doesNotMatch(normalized, /repeatfrequency' is distinct from \(case[\s\S]*else v_task\.repeat_frequency end\)/i);
});
