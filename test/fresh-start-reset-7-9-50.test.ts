import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const reset = read("supabase/operator_fresh_start_reset_7_9_50.sql");
const ddl = read("supabase/retire_task_migration_provenance_7_9_50.sql");

test("fresh-start operator SQL is transactional, explicit, and fails closed", () => {
  assert.match(reset, /begin;/i);
  assert.match(reset, /commit;/i);
  assert.match(reset, /TARGET_USER_ID sentinel was not replaced/i);
  assert.match(reset, /adhdice_user_profiles profile[\s\S]*for update/i);
  assert.doesNotMatch(reset, /\btruncate\b|\bcascade\b/i);
  assert.doesNotMatch(reset, /delete\s+from\s+public\.(?:adhdice_focus_|adhdice_health_)/i);
  assert.doesNotMatch(reset, /update\s+public\.(?:adhdice_focus_|adhdice_health_)/i);
  assert.doesNotMatch(reset, /delete\s+from\s+public\.adhdice_task_lists\b|delete\s+from\s+public\.adhdice_task_list_(?:folders|containers|rail_items)\b/i);
  assert.doesNotMatch(reset, /delete\s+from\s+public\.adhdice_notes\b|delete\s+from\s+public\.adhdice_scratch_notes\b/i);
  for (const table of [
    "adhdice_clean_tasks",
    "adhdice_task_history_facts",
    "adhdice_task_command_operations",
    "adhdice_task_schedule_boundaries",
    "adhdice_task_occurrences",
    "adhdice_task_occurrence_effective_overrides",
    "adhdice_task_calendar_overrides",
    "adhdice_task_reward_entitlements",
    "adhdice_task_reward_grants",
    "adhdice_task_reward_claim_consumptions",
    "adhdice_achievement_occurrences",
    "adhdice_record_current",
    "adhdice_record_events",
    "adhdice_point_ledger",
  ]) {
    assert.match(reset, new RegExp(`delete\\s+from\\s+public\\.${table}[\\s\\S]*?where[\\s\\S]*?user_id\\s*=`, "i"), table);
  }
  assert.match(reset, /pending_dice\s*=\s*0[\s\S]*revision\s*=\s*0/i);
  assert.match(reset, /activation_operation_id\s*=\s*gen_random_uuid\(\)[\s\S]*activated_at\s*=\s*\(select reset_at/i);
  assert.match(reset, /level\s*=\s*1[\s\S]*xp\s*=\s*0[\s\S]*points\s*=\s*0[\s\S]*tokens\s*=\s*0[\s\S]*free_roll_bank\s*=\s*0/i);
});

test("7.9.50 DDL retires only completed migration provenance", () => {
  assert.match(ddl, /drop table(?: if exists)? public\.adhdice_task_migration_operations;/i);
  assert.match(ddl, /drop column if exists migration_operation_id/i);
  assert.match(ddl, /drop column if exists migration_version/i);
  assert.match(ddl, /drop column if exists classifier_version/i);
  assert.match(ddl, /drop constraint if exists adhdice_task_schedule_boundaries_migration_provenance_check/i);
  assert.match(ddl, /drop constraint if exists adhdice_task_history_facts_effective_date_check/i);
  assert.match(ddl, /drop constraint if exists adhdice_task_history_facts_runtime_provenance_check/i);
  assert.doesNotMatch(ddl, /drop table(?: if exists)? public\.adhdice_task_state_schema_contract/i);
  assert.doesNotMatch(ddl, /\bcascade\b/i);
  assert.doesNotMatch(read("supabase/add_task_state_command_rpc.sql"), /migration_operation_id|migration_version|classifier_version/i);
  assert.doesNotMatch(read("supabase/functions/task-state-command/domain.ts"), /migration_operation_id|migration_version|classifier_version/i);
});

test("modern Task, hierarchy, reward, and protected workspace seams remain present", () => {
  const creation = read("supabase/add_task_canonical_creation.sql");
  assert.match(creation, /insert into public\.adhdice_clean_tasks/i);
  assert.match(creation, /parent_task_id/i);
  assert.match(read("supabase/add_task_state_canonical_schema.sql"), /adhdice_task_state_schema_contract/i);
  assert.match(read("supabase/add_canonical_reward_entitlement_bridge.sql"), /adhdice_task_reward_entitlements/i);
  assert.match(read("supabase/add_pending_reward_dice.sql"), /adhdice_task_reward_claims/i);
  assert.match(read("src/hooks/useTaskSubtaskActions.ts"), /buildChildTaskCreationDraft/);
  assert.doesNotMatch(read("src/hooks/useWorkspaceData.ts"), /adhdice_(?:task_subtasks|legacy_subtask_promotions)/);
  assert.match(read("src/hooks/useTaskRewardController.ts"), /adhdice_claim_pending_reward_dice/);
  assert.doesNotMatch(read("src/hooks/useEconomy.ts"), /adhdice_task_reward_claims|commitTaskReward/);
  assert.match(read("src/hooks/useWorkspaceData.ts"), /adhdice_task_lists/);
});
