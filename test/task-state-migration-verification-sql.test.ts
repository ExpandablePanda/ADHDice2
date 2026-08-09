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
});
