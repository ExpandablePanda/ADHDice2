import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtime = readFileSync("supabase/add_achievement_mvp_runtime.sql", "utf8");
const schema = readFileSync("supabase/schema.sql", "utf8");
const rollover = readFileSync("supabase/patch_daily_until_complete_rollover_rpc.sql", "utf8");
const forward = readFileSync("supabase/defer_rollover_achievement_evaluation_7_1_0.sql", "utf8");

function extractFunction(sql: string, name: string) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  const end = sql.indexOf("$function$;", start) + "$function$;".length;
  return sql.slice(start, end);
}

function shouldDefer(marker: string | null, userId: string) {
  return marker === userId;
}

function simulateRolloverBatch(rowCount: number) {
  let captures = 0;
  let evaluations = 0;
  for (let index = 0; index < rowCount; index += 1) captures += 1;
  evaluations += 1;
  return { captures, evaluations };
}

test("forward trigger replacement exactly matches runtime and consolidated schema", () => {
  const name = "adhdice_capture_and_evaluate_achievement_source";
  const canonicalFunction = extractFunction(runtime, name);
  assert.equal(extractFunction(forward, name), canonicalFunction);
  assert.equal(schema.includes(runtime.trim()), true);
  assert.equal(schema.includes(canonicalFunction), true);
});

test("ordinary, malformed, absent, and other-user markers evaluate immediately", () => {
  assert.equal(shouldDefer(null, "user-a"), false);
  assert.equal(shouldDefer("", "user-a"), false);
  assert.equal(shouldDefer("malformed", "user-a"), false);
  assert.equal(shouldDefer("user-b", "user-a"), false);
  assert.equal(shouldDefer("user-a", "user-a"), true);

  const triggerFunction = extractFunction(runtime, "adhdice_capture_and_evaluate_achievement_source");
  assert.match(triggerFunction, /current_setting\('adhdice\.achievement_deferred_user_id', true\)/);
  assert.match(triggerFunction, /coalesce\(v_deferred_user_id = v_user_id::text, false\)/);
  assert.match(triggerFunction, /if not v_is_deferred then\s+perform public\.adhdice_evaluate_achievements/);
});

test("deferred rows retain capture and Step-set work while full evaluation runs once", () => {
  const triggerFunction = extractFunction(runtime, "adhdice_capture_and_evaluate_achievement_source");
  const captureFunction = extractFunction(runtime, "adhdice_capture_task_achievement_occurrence");
  const captureIndex = triggerFunction.indexOf("adhdice_capture_task_achievement_occurrence");
  const stepSetIndex = triggerFunction.indexOf("adhdice_refresh_achievement_step_set");
  const deferIndex = triggerFunction.indexOf("if not v_is_deferred then");
  assert.ok(captureIndex >= 0 && stepSetIndex > captureIndex && deferIndex > stepSetIndex);
  assert.match(captureFunction, /v_qualified := v_history\.outcome in \('done', 'complete', 'did_my_best'\)/);
  assert.match(captureFunction, /is_currently_qualifying = v_qualified/);
  assert.deepEqual(simulateRolloverBatch(2_452), { captures: 2_452, evaluations: 1 });
  assert.equal([...rollover.matchAll(/public\.adhdice_evaluate_achievements\(/g)].length, 1);
  assert.equal(triggerFunction.includes("public.adhdice_evaluate_achievements"), true);
});

test("rollover marker and final evaluation are user-scoped, transaction-local, strict, and before ledger", () => {
  const ownershipIndex = rollover.indexOf("if auth.uid() <> p_user_id");
  const markerIndex = rollover.indexOf("set_config('adhdice.achievement_deferred_user_id', p_user_id::text, true)");
  const clearIndex = rollover.indexOf("set_config('adhdice.achievement_deferred_user_id', '', true)");
  const evaluationIndex = rollover.indexOf("public.adhdice_evaluate_achievements", clearIndex);
  const statusIndex = rollover.indexOf("not in ('completed', 'inactive')", evaluationIndex);
  const raiseIndex = rollover.indexOf("raise exception 'Final Achievement evaluation failed", statusIndex);
  const ledgerIndex = rollover.indexOf("insert into public.adhdice_task_rollover_ledger", raiseIndex);
  assert.ok(ownershipIndex >= 0 && markerIndex > ownershipIndex);
  assert.ok(clearIndex > markerIndex && evaluationIndex > clearIndex && statusIndex > evaluationIndex);
  assert.ok(raiseIndex > statusIndex && ledgerIndex > raiseIndex);
  assert.match(rollover, /md5\('task-rollover:' \|\| p_user_id::text \|\| ':' \|\| v_effective_date::text\)::uuid/);
  assert.match(extractFunction(runtime, "adhdice_capture_and_evaluate_achievement_source"), /if v_is_deferred then\s+raise;/);
  assert.ok(rollover.indexOf("from public.adhdice_task_rollover_ledger") < rollover.indexOf("for v_task in"));
});

test("forward migration requires missing-only history and patches both functions atomically", () => {
  assert.match(forward, /^begin;/m);
  assert.match(forward, /Apply fix_recurring_rollover_history_replay_7_1_0\.sql before this migration/);
  assert.match(forward, /position\('on conflict \(user_id, task_id, entry_date\) do nothing;'/);
  assert.match(forward, /pg_get_functiondef\(v_target\)/);
  assert.match(forward, /execute v_rewritten;/);
  assert.match(forward, /notify pgrst, 'reload schema';\s+commit;/);
  assert.doesNotMatch(forward, /create table|alter table|statement_timeout|retry/i);
});

test("award and notification idempotency remains canonical", () => {
  assert.match(runtime, /on conflict \(user_id, track_id, tier\) do nothing/);
  assert.match(runtime, /on conflict \(user_id, collection_id, mastery_version\) do nothing/);
  assert.match(runtime, /on conflict \(user_id, dedupe_key\) do nothing/g);
});
