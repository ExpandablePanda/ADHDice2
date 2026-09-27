import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sourceFenceSql = readFileSync(new URL("../supabase/patch_task_current_projection_source_fences_7_15_15.sql", import.meta.url), "utf8");
const readModelSource = readFileSync(new URL("../src/lib/task-state-canonical/read-model.ts", import.meta.url), "utf8");
const rebuildSource = readFileSync(new URL("../src/lib/task-current-projection-rebuild.ts", import.meta.url), "utf8");
const trackingSource = readFileSync(new URL("../src/lib/task-tracking.ts", import.meta.url), "utf8");

function functionSource(source: string, name: string) {
  const start = source.indexOf(`create or replace function public.${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const end = source.indexOf("$function$;", start);
  assert.ok(end > start, `unterminated ${name}`);
  return source.slice(start, end + "$function$;".length);
}

const fenceFunction = functionSource(sourceFenceSql, "adhdice_get_task_current_projection_source_fences");
const writerFunction = functionSource(sourceFenceSql, "adhdice_upsert_task_current_projection");
const projectionLoader = readModelSource.slice(
  readModelSource.indexOf("export async function loadCanonicalTaskProjectionSource"),
  readModelSource.indexOf("export async function loadCanonicalTaskCommandOperations"),
);

test("7.15.15 source-fence function is trusted, deterministic, and not a Task State authority", () => {
  assert.match(fenceFunction, /p_user_id uuid[\s\S]*p_entity_id uuid[\s\S]*p_projected_logical_date date/);
  assert.match(fenceFunction, /returns table\([\s\S]*schedule_boundary_revision text[\s\S]*behavior_policy_revision text/i);
  assert.match(fenceFunction, /current_user <> 'service_role'/i);
  assert.match(fenceFunction, /extensions\.digest\(v_schedule_payload::text, 'sha256'/i);
  assert.match(fenceFunction, /extensions\.digest\(v_behavior_payload::text, 'sha256'/i);
  assert.match(fenceFunction, /order by boundary\.boundary_sequence, boundary\.id/i);
  assert.match(fenceFunction, /order by occurrence\.scheduled_due_on, occurrence\.id/i);
  assert.match(fenceFunction, /order by override_row\.action_logical_date, override_row\.override_sequence, override_row\.id/i);
  assert.match(fenceFunction, /order by calendar_row\.logical_date, calendar_row\.id/i);
  assert.match(fenceFunction, /effective_from_logical_date <= p_projected_logical_date/i);
  assert.match(fenceFunction, /select min\(first_profile\.effective_from_logical_date\)/i);
  assert.match(fenceFunction, /select min\(first_revision\.effective_from_logical_date\)/i);
  assert.match(fenceFunction, /adhdice_task_schedule_boundaries/);
  assert.match(fenceFunction, /adhdice_task_occurrences/);
  assert.match(fenceFunction, /adhdice_task_occurrence_effective_overrides/);
  assert.match(fenceFunction, /adhdice_task_calendar_overrides/);
  assert.match(fenceFunction, /adhdice_task_behavior_selections/);
  assert.match(fenceFunction, /adhdice_task_type_behavior_profiles/);
  assert.match(fenceFunction, /adhdice_custom_behavior_ruleset_revisions/);
  assert.doesNotMatch(fenceFunction, /evaluateTaskState|current_positive_streak|current_missed_streak|recurrence engine/i);
  assert.match(fenceFunction, /array\['created_at', 'updated_at'\]/g);
});

test("schedule and behavior source changes are scoped to this Task's fence", () => {
  assert.match(fenceFunction, /boundary\.user_id = p_user_id[\s\S]*boundary\.entity_id = p_entity_id/i);
  assert.match(fenceFunction, /occurrence\.user_id = p_user_id[\s\S]*occurrence\.entity_id = p_entity_id/i);
  assert.match(fenceFunction, /override_row\.user_id = p_user_id[\s\S]*override_row\.entity_id = p_entity_id/i);
  assert.match(fenceFunction, /calendar_row\.user_id = p_user_id[\s\S]*calendar_row\.entity_id = p_entity_id/i);
  assert.match(fenceFunction, /selection\.user_id = p_user_id[\s\S]*selection\.task_id = p_entity_id/i);
  assert.match(fenceFunction, /profile\.user_id = p_user_id[\s\S]*profile\.task_type = 'task'/i);
  assert.match(fenceFunction, /ruleset\.user_id = p_user_id[\s\S]*ruleset\.id in \(select relevant_rulesets/i);
  assert.match(fenceFunction, /revision\.ruleset_id in \(select relevant_rulesets/i);
  assert.match(fenceFunction, /'task_identity'[\s\S]*'task_type'[\s\S]*'custom_ruleset_id'/i);
  assert.match(fenceFunction, /to_jsonb\(selection\)/i);
  assert.match(fenceFunction, /to_jsonb\(profile\)/i);
  assert.match(fenceFunction, /to_jsonb\(revision\)/i);
  assert.doesNotMatch(fenceFunction, /adhdice_task_history_facts|adhdice_task_reward_grants|adhdice_task_reward_claim_consumptions/i);
});

test("writer rechecks exact schedule and behavior fences immediately before the upsert", () => {
  assert.match(writerFunction, /adhdice_get_task_current_projection_source_fences\(/i);
  assert.match(writerFunction, /v_candidate\.schedule_boundary_revision is distinct from v_source_fences\.schedule_boundary_revision/i);
  assert.match(writerFunction, /v_candidate\.behavior_policy_revision is distinct from v_source_fences\.behavior_policy_revision/i);
  assert.match(writerFunction, /source fence is stale/i);
  assert.match(writerFunction, /using errcode = '40001'/i);
  assert.ok(writerFunction.indexOf("adhdice_get_task_current_projection_source_fences")
    < writerFunction.indexOf("insert into public.adhdice_task_current_projections"));
});

test("source-fence helper is server-only with explicit execution grants", () => {
  assert.match(sourceFenceSql, /revoke all on function public\.adhdice_get_task_current_projection_source_fences\(uuid, uuid, date\)[\s\S]*from public, anon, authenticated/i);
  assert.match(sourceFenceSql, /grant execute on function public\.adhdice_get_task_current_projection_source_fences\(uuid, uuid, date\)[\s\S]*to service_role/i);
  assert.match(sourceFenceSql, /security invoker/i);
});

test("projection rebuild uses a database-issued fence snapshot and the narrow source loader", () => {
  assert.match(rebuildSource, /loadCanonicalTaskProjectionSource/);
  assert.match(rebuildSource, /adhdice_get_task_current_projection_source_fences/);
  assert.match(rebuildSource, /sourceFences/);
  assert.match(rebuildSource, /effectiveTrackingExclusion: readResult\.data\.effectiveTrackingExclusion/);
  assert.doesNotMatch(rebuildSource, /loadCanonicalTaskState/);
});

test("projection loader is entity-scoped and never reads reward grants or claims", () => {
  for (const table of [
    "adhdice_task_command_operations",
    "adhdice_task_history_facts",
  ]) {
    const tableRead = projectionLoader.match(new RegExp(`from\\(\"${table}\"\\)[\\s\\S]*?order`, "i"))?.[0] ?? "";
    assert.match(tableRead, /eq\("user_id", input\.userId\)/i);
    assert.match(tableRead, /eq\("entity_id", input\.taskId\)/i);
  }
  assert.doesNotMatch(projectionLoader, /adhdice_task_reward_grants|adhdice_task_reward_claim_consumptions/);
  assert.match(readModelSource, /resolveTaskTrackingExclusion/);
  assert.match(readModelSource, /while \(current\.parent_task_id\)/);
  assert.match(readModelSource, /Canonical Task hierarchy is missing, cross-owner, or otherwise ambiguous/);
  assert.match(trackingSource, /status: "unavailable"/);
});

test("source-only 7.15.15 patch does not cut over runtime or apply itself", () => {
  assert.match(sourceFenceSql, /Source-only contract/i);
  assert.doesNotMatch(sourceFenceSql, /adhdice_execute_task_state_command/);
  assert.doesNotMatch(sourceFenceSql, /create trigger/i);
});
