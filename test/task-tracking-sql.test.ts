import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL("../supabase/patch_task_tracking_exclusion_7_13_85.sql", import.meta.url);
const sql = readFileSync(migrationPath, "utf8");
const oldMigrationPath = new URL("../supabase/patch_task_tracking_exclusion_7_13_84.sql", import.meta.url);

function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`create or replace function public.${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const end = source.indexOf("$function$;", start);
  assert.ok(end > start, `unterminated ${name}`);
  return source.slice(start, end + "$function$;".length);
}

const guard = extractFunction(sql, "adhdice_guard_tracking_excluded_achievement_occurrence");
const exclusionRpc = extractFunction(sql, "adhdice_set_task_tracking_exclusion");

test("7.13.85 replaces the unpublished unsafe migration", () => {
  assert.equal(existsSync(migrationPath), true);
  assert.equal(existsSync(oldMigrationPath), false);
  assert.match(sql, /^-- ADHDice 7\.13\.85/m);
});

test("tracking SQL remains additive, inherited, cycle-safe, and authenticated", () => {
  assert.match(sql, /add column if not exists exclude_from_tracking boolean not null default false/i);
  assert.match(sql, /with recursive ancestry as/i);
  assert.match(sql, /where not parent\.id = any\(ancestry\.path\)/i);
  assert.match(sql, /p_user_id uuid[\s\S]*p_task_id uuid/);
  assert.match(sql, /adhdice_set_task_tracking_exclusion/);
  assert.match(sql, /permanently_deleted_at is null/);
  assert.match(sql, /state = 'blocked'/);
  assert.match(sql, /before insert on public\.adhdice_task_reward_entitlements/);
  assert.match(sql, /before update of state on public\.adhdice_task_reward_entitlements/);
  assert.match(sql, /set search_path = ''/g);
  assert.doesNotMatch(sql, /grant execute on function public\.adhdice_task_effectively_excluded_from_tracking\(uuid, uuid\) to authenticated/i);
  assert.doesNotMatch(sql, /delete from public\.adhdice_task_reward_entitlements/i);
  assert.doesNotMatch(sql, /delete from public\.adhdice_task_reward_grants/i);
});

test("Achievement qualification is guarded before occurrence visibility", () => {
  assert.match(sql, /before insert or update[\s\S]*on public\.adhdice_achievement_occurrences/);
  assert.doesNotMatch(sql, /create trigger adhdice_deactivate_excluded_task_achievement_source/i);
  assert.doesNotMatch(sql, /create or replace function public\.adhdice_capture_task_achievement_occurrence/i);
  assert.doesNotMatch(sql, /after [\s\S]*on public\.adhdice_task_history_facts[\s\S]*adhdice_deactivate_excluded_task_achievement_source/i);
  assert.match(guard, /new\.is_currently_qualifying is not true/);
  assert.match(guard, /new\.source_kind = 'task_history'/);
  assert.match(guard, /new\.is_currently_qualifying := false/);
  assert.match(guard, /new\.source_kind = 'step_set'/);
  assert.match(guard, /root_parent_id/);
  assert.match(guard, /step_occurrence_ids/);
  assert.doesNotMatch(guard, /focus_session/);
});

test("exclusion dequalifies source and Step-set evidence before evaluation", () => {
  const flagIndex = exclusionRpc.indexOf("set exclude_from_tracking = v_excluded");
  const pendingIndex = exclusionRpc.indexOf("update public.adhdice_task_reward_entitlements");
  const taskOccurrenceIndex = exclusionRpc.indexOf("update public.adhdice_achievement_occurrences occurrence");
  const stepSetIndex = exclusionRpc.indexOf("update public.adhdice_achievement_occurrences step_set");
  const evaluateIndex = exclusionRpc.indexOf("v_evaluation := public.adhdice_evaluate_achievements");
  assert.ok(flagIndex >= 0 && pendingIndex > flagIndex);
  assert.ok(taskOccurrenceIndex > pendingIndex);
  assert.ok(stepSetIndex > taskOccurrenceIndex);
  assert.ok(evaluateIndex > stepSetIndex);
  assert.match(exclusionRpc, /source_kind = 'task_history'[\s\S]*is_currently_qualifying = false/);
  assert.match(exclusionRpc, /source_kind = 'step_set'[\s\S]*step_occurrence_ids/);
  assert.match(exclusionRpc, /adhdice_evaluate_achievements\([\s\S]*'immediate'/);
  assert.doesNotMatch(exclusionRpc.slice(flagIndex, evaluateIndex), /adhdice_recalculate_achievements/);
  assert.doesNotMatch(sql, /delete from public\.adhdice_achievement_(?:tier_awards|collection_awards)/i);
});

test("re-inclusion drains canonical recalculation cursors and handles failure", () => {
  assert.match(exclusionRpc, /adhdice_recalculate_achievements\([\s\S]*2000/);
  assert.match(exclusionRpc, /v_recalculation->>'status' = 'failed'/);
  assert.match(exclusionRpc, /v_recalculation->>'status' = 'completed'/);
  assert.match(exclusionRpc, /v_recalculation->>'status' <> 'running'/);
  assert.match(exclusionRpc, /next_cursor/);
  assert.match(exclusionRpc, /v_next_cursor = v_cursor/);
  assert.match(exclusionRpc, /v_cursor := v_next_cursor/);
  assert.match(exclusionRpc, /adhdice_evaluate_achievements\([\s\S]*'recalculation'/);
});

test("reward protection remains server-authoritative and fail-closed", () => {
  assert.match(sql, /create trigger adhdice_block_excluded_task_reward_entitlement[\s\S]*before insert/);
  assert.match(sql, /create trigger adhdice_guard_excluded_task_reward_fulfillment[\s\S]*before update of state/);
  assert.match(sql, /new\.state = 'fulfilled'[\s\S]*raise exception/);
  assert.match(sql, /state = 'blocked'[\s\S]*where entitlement\.user_id/);
  assert.match(sql, /fulfilled entitlements, grants, dice, XP, points, and tokens/);
});
