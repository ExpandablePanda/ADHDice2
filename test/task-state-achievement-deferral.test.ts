import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const commandSource = readFileSync(new URL("../supabase/add_task_state_command_rpc.sql", import.meta.url), "utf8");
const embeddedCommandSource = readFileSync(new URL("../supabase/patch_task_reward_entitlement_permanence_7_10_5.sql", import.meta.url), "utf8");
const achievementRuntime = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const deferralPatch = readFileSync(new URL("../supabase/patch_task_state_achievement_deferral_7_15_21.sql", import.meta.url), "utf8");
const orchestrationSource = readFileSync(new URL("../supabase/functions/task-state-command/orchestration.ts", import.meta.url), "utf8");
const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

function extractCommand(source: string) {
  const start = source.indexOf("create or replace function public.adhdice_execute_task_state_command(");
  const end = source.indexOf("\nrevoke all on function public.adhdice_execute_task_state_command", start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end).trim();
}

function automaticHistorySection() {
  const start = commandSource.indexOf("  for v_automatic_history in");
  const end = commandSource.indexOf("  if v_calendar_override <> '{}'::jsonb then", start);
  assert.ok(start >= 0 && end > start);
  return commandSource.slice(start, end);
}

function finalEvaluationSection() {
  const start = commandSource.lastIndexOf("  if jsonb_array_length(v_automatic_history_facts) > 0");
  const end = commandSource.indexOf("  if v_calendar_override <> '{}'::jsonb then", start);
  assert.ok(start >= 0 && end > start);
  return commandSource.slice(start, end);
}

test("command entry records only a same-user outer deferral", () => {
  assert.match(commandSource, /v_achievement_deferred_user_id text;/);
  assert.match(commandSource, /v_achievement_deferred_for_command boolean := false;/);
  assert.match(commandSource, /current_setting\('adhdice\.achievement_deferred_user_id', true\)/);
  assert.match(commandSource, /v_achievement_deferred_user_id = p_user_id::text/);
  assert.match(commandSource, /coalesce\(v_achievement_deferred_user_id = p_user_id::text, false\)/);
});

test("standalone automatic History still performs exactly one final evaluation", () => {
  const loop = automaticHistorySection();
  const finalization = finalEvaluationSection();

  assert.match(loop, /insert into public\.adhdice_task_history_facts/);
  assert.match(loop, /v_automatic_history_ids := v_automatic_history_ids \|\| to_jsonb\(v_history_row\.id\)/);
  assert.match(commandSource, /jsonb_array_length\(v_automatic_history_facts\) > 0\s+and not v_achievement_deferred_for_command/);
  assert.equal((commandSource.match(/public\.adhdice_evaluate_achievements\(/g) ?? []).length, 1);
  assert.match(finalization, /v_achievement_operation_id := md5\('task-state-command-achievement-evaluation:/);
  assert.match(finalization, /public\.adhdice_evaluate_achievements\(/);
  assert.match(finalization, /raise exception 'Final Achievement evaluation failed/);
});

test("externally deferred automatic History captures source and Step-set evidence but skips command evaluation", () => {
  const loop = automaticHistorySection();
  const triggerStart = achievementRuntime.indexOf("create or replace function public.adhdice_capture_and_evaluate_achievement_source()");
  const triggerEnd = achievementRuntime.indexOf("$function$;", triggerStart);
  assert.ok(triggerStart >= 0 && triggerEnd > triggerStart);
  const trigger = achievementRuntime.slice(triggerStart, triggerEnd);

  assert.match(commandSource, /if jsonb_array_length\(v_automatic_history_facts\) > 0\s+and not v_achievement_deferred_for_command then/);
  assert.match(loop, /insert into public\.adhdice_task_history_facts/);
  assert.match(trigger, /adhdice_capture_task_achievement_occurrence\(new\.id\)/);
  assert.match(trigger, /adhdice_refresh_achievement_step_set\(v_user_id,v_root_id\)/);
  assert.match(trigger, /if not v_is_deferred then\s+perform public\.adhdice_evaluate_achievements/);
  assert.match(trigger, /v_deferred_user_id = v_user_id::text/);
  assert.match(finalEvaluationSection(), /and not v_achievement_deferred_for_command/);
});

test("an outer same-user deferral is restored, while a different-user marker is never honored", () => {
  const finalization = finalEvaluationSection();
  assert.match(finalization, /set_config\('adhdice\.achievement_deferred_user_id', coalesce\(v_achievement_deferred_user_id, ''\), true\)/);
  assert.doesNotMatch(finalization, /set_config\('adhdice\.achievement_deferred_user_id', '', true\)/);
  assert.match(commandSource, /coalesce\(v_achievement_deferred_user_id = p_user_id::text, false\)/);
  assert.match(deferralPatch, /v_achievement_deferred_user_id = p_user_id::text/);
});

test("rollover sweep defers every child and finalizes once with a deterministic operation", () => {
  const sweepStart = orchestrationSource.indexOf("export async function executeRolloverSweep");
  const sweepEnd = orchestrationSource.indexOf("async function partialBatchResponse", sweepStart);
  assert.ok(sweepStart >= 0 && sweepEnd > sweepStart);
  const sweep = orchestrationSource.slice(sweepStart, sweepEnd);

  assert.match(sweep, /deferAchievements: true/);
  assert.match(sweep, /deterministicUuid\(`task-rollover-achievement:/);
  assert.equal((sweep.match(/finalizeBatchAchievements\(/g) ?? []).length, 1);
  assert.match(sweep, /input\.intent\.commands\.length === 0/);
  assert.match(sweep, /rolloverFinalizationFailure/);
  assert.match(sweep, /state = error[\s\S]*partial.*failed/);
  assert.match(taskAppSource, /if \(!error && typeof window !== "undefined"\)/);
  assert.match(taskAppSource, /achievementFinalizationPending/);
});

test("the deployable embedded command mirrors the canonical corrected RPC source", () => {
  const normalizeSql = (value: string) => value.replace(/\s+/g, " ").trim();
  assert.equal(normalizeSql(extractCommand(embeddedCommandSource)), normalizeSql(extractCommand(commandSource)));
});

test("the reviewed forward patch is fail-closed and does not add timeout or retry behavior", () => {
  assert.match(deferralPatch, /pg_get_functiondef\(p\.oid\)/i);
  assert.match(deferralPatch, /v_match_count integer/);
  assert.match(deferralPatch, /regexp_matches\(v_definition, v_old, 'gi'\)/i);
  assert.match(deferralPatch, /regexp_replace\(v_definition, v_old, v_new, 'gi'\)/i);
  assert.match(deferralPatch, /execute v_definition/);
  assert.match(deferralPatch, /revoke all on function public\.adhdice_execute_task_state_command\(uuid, jsonb\) from public, anon, authenticated/i);
  assert.match(deferralPatch, /grant execute on function public\.adhdice_execute_task_state_command\(uuid, jsonb\) to service_role/i);
  assert.doesNotMatch(deferralPatch, /statement_timeout|pg_sleep|retry/i);
});
