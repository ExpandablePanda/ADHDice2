import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

const repositoryRoot = process.cwd();
const migration = readFileSync(new URL("../supabase/patch_achievement_incremental_runtime_7_16_35.sql", import.meta.url), "utf8");
const correction = readFileSync(new URL("../supabase/patch_achievement_incremental_runtime_7_16_36.sql", import.meta.url), "utf8");
const foundation = readFileSync(new URL("../supabase/patch_achievement_incremental_reconciliation_7_16_34.sql", import.meta.url), "utf8");
const rebuildPatch = readFileSync(new URL("../supabase/patch_achievement_rebuild_performance_7_16_32.sql", import.meta.url), "utf8");
const batchBoundary = readFileSync(new URL("../supabase/patch_task_state_history_batch_achievement_boundary_7_11_84.sql", import.meta.url), "utf8");
const commandRpcSource = readFileSync(new URL("../supabase/add_task_state_command_rpc.sql", import.meta.url), "utf8");
const orchestration = readFileSync(new URL("../supabase/functions/task-state-command/orchestration.ts", import.meta.url), "utf8");
const psql = process.env.ADHDICE_SQL_COMPILE_PSQL_BIN ?? "psql";
const psqlDirectory = dirname(psql);
const createdb = join(psqlDirectory, "createdb");
const dropdb = join(psqlDirectory, "dropdb");
const host = process.env.ADHDICE_SQL_COMPILE_PGHOST;
const port = process.env.ADHDICE_SQL_COMPILE_PGPORT ?? "5432";

function run(command: string, args: string[], input?: string): string {
  try {
    return execFileSync(command, args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      input,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = error as { stderr?: string };
    throw new Error(`${command} failed:\n${(detail.stderr ?? String(error)).slice(-16000)}`);
  }
}

function connectionArgs(database: string): string[] {
  return ["-h", host!, "-p", port, "-d", database];
}

function utilityConnectionArgs(): string[] {
  return ["-h", host!, "-p", port];
}

function writeOrderedBaselineSchema(outputPath: string): void {
  const schema = readFileSync(join(repositoryRoot, "supabase/schema.sql"), "utf8");
  const canonicalSchema = readFileSync(join(repositoryRoot, "supabase/add_task_state_canonical_schema.sql"), "utf8");
  const marker = "-- The legacy p_history_id name is intentional:";
  const markerIndex = schema.indexOf(marker);
  assert.ok(markerIndex > 0, "expected canonical History function marker in schema source");
  writeFileSync(outputPath, `${schema.slice(0, markerIndex)}\n${canonicalSchema}\n${schema.slice(markerIndex)}`);
}

function functionBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `missing ${signature}`);
  const end = source.indexOf("$function$;", start);
  assert.ok(end > start, `unterminated ${signature}`);
  return source.slice(start, end);
}

test("7.16.35 resolves bounded source changes through the canonical dependency authority", () => {
  assert.match(migration, /create or replace function public\.adhdice_resolve_achievement_affected_occurrence_ids\(/);
  assert.match(migration, /superseded_by_history_fact_id/);
  assert.match(migration, /source_snapshot->>'history_fact_id'/);
  assert.match(migration, /source_kind = 'step_set'/);
  assert.match(migration, /create or replace function public\.adhdice_evaluate_achievements_incremental\(/);
  assert.match(migration, /join public\.adhdice_achievement_track_dependencies\(\) dependency/);
  assert.match(migration, /perform public\.adhdice_sync_achievement_occurrence_matches\(v_occurrence_ids\)/);
  assert.match(migration, /adhdice_rebuild_achievement_progress_for_tracks\(/);
  assert.doesNotMatch(
    functionBody(migration, "create or replace function public.adhdice_evaluate_achievements_incremental("),
    /adhdice_rebuild_achievement_progress\s*\(/,
  );
  assert.doesNotMatch(
    functionBody(migration, "create or replace function public.adhdice_finalize_task_history_batch_achievements(\n  p_user_id uuid,\n  p_operation_id uuid,\n  p_history_fact_ids uuid[]"),
    /adhdice_evaluate_achievements\s*\(/,
  );
});

test("7.16.35 source triggers cover sibling, Step-set, focus, and deleted occurrence boundaries", () => {
  const trigger = functionBody(migration, "create or replace function public.adhdice_capture_and_evaluate_achievement_source()");
  const deleted = functionBody(migration, "create or replace function public.adhdice_deactivate_deleted_achievement_source()");
  assert.ok(trigger.indexOf("adhdice_capture_task_achievement_occurrence") < trigger.indexOf("adhdice_refresh_achievement_step_set"));
  assert.ok(trigger.indexOf("adhdice_refresh_achievement_step_set") < trigger.indexOf("adhdice_evaluate_achievements_incremental"));
  assert.match(trigger, /v_before_ids/);
  assert.match(trigger, /v_after_ids/);
  assert.match(trigger, /new\.entity_kind <> 'parent'/);
  assert.match(trigger, /adhdice_capture_focus_achievement_occurrence/);
  assert.match(deleted, /occurrence\.source_id = old\.id::text/);
  assert.match(deleted, /array\[v_occurrence\.id\]/);
  assert.match(deleted, /adhdice_refresh_achievement_step_set/);
  assert.match(deleted, /adhdice_evaluate_achievements_incremental/);
  assert.doesNotMatch(trigger, /adhdice_evaluate_achievements\s*\(/);
  assert.doesNotMatch(deleted, /adhdice_evaluate_achievements\s*\(/);
});

test("7.16.36 applies the same deferred contract to deleted sources", () => {
  const deleted = functionBody(correction, "create or replace function public.adhdice_deactivate_deleted_achievement_source()");
  assert.match(correction, /7\.16\.35 incremental Achievement runtime is not installed/);
  assert.match(deleted, /v_deferred_user_id := current_setting\('adhdice\.achievement_deferred_user_id', true\)/);
  assert.match(deleted, /v_is_deferred := coalesce\(v_deferred_user_id = old\.user_id::text, false\)/);
  assert.match(deleted, /adhdice_refresh_achievement_step_set/);
  assert.ok(deleted.indexOf("adhdice_refresh_achievement_step_set") < deleted.indexOf("if not v_is_deferred then"));
  assert.match(deleted, /if not v_is_deferred then[\s\S]*adhdice_evaluate_achievements_incremental/);
  assert.match(deleted, /exception when others then\s+if v_is_deferred then\s+raise;/);
  assert.doesNotMatch(deleted, /adhdice_evaluate_achievements\s*\(/);
});

test("canonical committed History children always carry a primary fact ID", () => {
  assert.match(commandRpcSource, /v_command_type = 'set_outcome'[\s\S]*insert into public\.adhdice_task_history_facts[\s\S]*returning \* into v_history_row/);
  assert.match(commandRpcSource, /v_history_id := v_history_row\.id/);
  assert.match(commandRpcSource, /'history_fact_id', v_history_id/);
  const finalizer = functionBody(migration, "create or replace function public.adhdice_finalize_task_history_batch_achievements(\n  p_user_id uuid,\n  p_operation_id uuid,\n  p_history_fact_ids uuid[]");
  assert.match(finalizer, /cardinality\(coalesce\(p_history_fact_ids, '\{\}'::uuid\[\]\)\) = 0/);
  assert.match(orchestration, /canonical set_outcome RPC always returns its committed primary/);
});

test("7.16.35 keeps the global rebuild out of runtime finalization and fails stale finalizer callers closed", () => {
  const oldFinalizer = functionBody(migration, "create or replace function public.adhdice_finalize_task_history_batch_achievements(\n  p_user_id uuid,\n  p_operation_id uuid\n)");
  const finalizer = functionBody(migration, "create or replace function public.adhdice_finalize_task_history_batch_achievements(\n  p_user_id uuid,\n  p_operation_id uuid,\n  p_history_fact_ids uuid[]");
  assert.match(oldFinalizer, /Bounded committed History fact IDs are required/);
  assert.match(finalizer, /adhdice_evaluate_achievements_incremental_for_history_facts/);
  assert.match(migration, /v_history_id is null then/);
  assert.match(migration, /v_automatic_history_ids/);
  assert.match(migration, /history_fact_delete_ids/);
  assert.doesNotMatch(finalizer, /adhdice_rebuild_achievement_progress\s*\(/);
  assert.match(orchestration, /historyFactIds: string\[\]/);
  assert.match(orchestration, /p_history_fact_ids: historyFactIds/);
  assert.match(orchestration, /new Set\(ids\)/);
  assert.match(orchestration, /finalization.*historyFactIds/s);
});

test("7.16.35 source assertions retain the explicit full-rebuild reference path", () => {
  assert.match(migration, /7\.16\.34 incremental Achievement foundation is not installed/);
  assert.match(migration, /Required production order:/);
  assert.match(migration, /do not apply automatically, deploy an Edge Function/);
  assert.match(migration, /adhdice_rebuild_achievement_progress_for_tracks/);
  assert.doesNotMatch(migration, /delete from public\.adhdice_achievement_occurrence_matches\s+where\s+user_id\s*=\s*p_user_id/);
});

test("7.16.35 installs and executes bounded resolver/evaluator wiring in disposable PostgreSQL", (t) => {
  if (!host) {
    t.skip("set ADHDICE_SQL_COMPILE_PGHOST to run the disposable local PostgreSQL runtime regression");
    return;
  }
  assert.ok(host.startsWith("/") || ["localhost", "127.0.0.1", "::1"].includes(host));

  const scratch = mkdtempSync(join(tmpdir(), "adhdice-sql-achievement-runtime-7-16-35-"));
  const database = `adhdice_runtime_71635_${process.pid}_${Date.now()}`;
  const fixtureSetup = join(scratch, "fixture-setup.sql");
  const baselineSchema = join(scratch, "baseline-schema.sql");
  const commandRpc = join(scratch, "command-rpc.sql");
  const foundationPath = join(scratch, "foundation.sql");
  const rebuildPath = join(scratch, "rebuild.sql");
  const batchBoundaryPath = join(scratch, "batch-boundary.sql");
  const runtimePath = join(scratch, "runtime.sql");
  const correctionPath = join(scratch, "correction.sql");
  const fixtureData = join(scratch, "fixture-data.sql");
  const verification = join(scratch, "verification.sql");
  const userId = "00000000-0000-4000-8000-000000000101";
  const rootTaskId = "10000000-0000-4000-8000-000000000101";
  const parentOccurrenceId = "20000000-0000-4000-8000-000000000101";
  const siblingOccurrenceId = "20000000-0000-4000-8000-000000000102";
  const stepOccurrenceId = "30000000-0000-4000-8000-000000000101";
  const stepSetOccurrenceId = "40000000-0000-4000-8000-000000000101";
  const stepTaskId = "80000000-0000-4000-8000-000000000101";
  const focusSessionId = "60000000-0000-4000-8000-000000000101";
  const focusOccurrenceId = "60000000-0000-4000-8000-000000000102";
  const historyFactId = "50000000-0000-4000-8000-000000000101";
  const deferredHistoryFactId = "50000000-0000-4000-8000-000000000102";

  writeFileSync(fixtureSetup, `create schema auth;
create schema extensions;
create extension pgcrypto schema extensions;
create table auth.users (id uuid primary key);
create publication supabase_realtime;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
`);
  writeOrderedBaselineSchema(baselineSchema);
  writeFileSync(commandRpc, readFileSync(join(repositoryRoot, "supabase/add_task_state_command_rpc.sql"), "utf8"));
  writeFileSync(foundationPath, foundation);
  writeFileSync(rebuildPath, rebuildPatch);
  writeFileSync(batchBoundaryPath, batchBoundary);
  writeFileSync(runtimePath, migration);
  writeFileSync(correctionPath, correction);
  writeFileSync(fixtureData, `
insert into auth.users(id) values ('${userId}') on conflict (id) do nothing;
insert into public.adhdice_achievement_profiles(
  user_id, activation_operation_id, activated_at, catalog_version, rules_version,
  launch_mastery_version, timezone, logical_day_start
) values (
  '${userId}', '70000000-0000-4000-8000-000000000101', '2025-01-01 00:00:00+00',
  'achievement-catalog-v1', 'achievement-rules-v1', 'achievement-launch-v1', 'UTC', time '00:00'
);
set session_replication_role = replica;
insert into public.adhdice_clean_tasks(id, user_id, title, parent_task_id)
values
  ('${rootTaskId}', '${userId}', 'Runtime parent', null),
  ('${stepTaskId}', '${userId}', 'Runtime step', '${rootTaskId}');
insert into public.adhdice_task_history_facts(
  id, user_id, entity_id, entity_kind, logical_date, outcome, event_kind,
  provenance_kind, actor_kind, actor_id, source, logical_day_settings_revision,
  timezone, day_start_time, command_id, idempotence_identity
) values (
  '${historyFactId}', '${userId}', '${rootTaskId}', 'parent', '2026-06-01', 'done', 'explicit_outcome',
  'user', 'user', '${userId}', 'task_state_command', 1, 'UTC', time '00:00', '70000000-0000-4000-8000-000000000101', 'runtime-test-history'
);
insert into public.adhdice_task_history_facts(
  id, user_id, entity_id, entity_kind, logical_date, outcome, event_kind,
  provenance_kind, actor_kind, actor_id, source, logical_day_settings_revision,
  timezone, day_start_time, command_id, idempotence_identity
) values (
  '${deferredHistoryFactId}', '${userId}', '${stepTaskId}', 'step', '2026-06-02', 'done', 'explicit_outcome',
  'user', 'user', '${userId}', 'task_state_command', 1, 'UTC', time '00:00', '70000000-0000-4000-8000-000000000102', 'runtime-test-deferred-history'
);
create or replace function pg_temp.add_occurrence(
  p_id uuid, p_source_kind text, p_entity_kind text, p_entity_id uuid,
  p_source_id text, p_logical_date date, p_qualifying boolean, p_root_parent_id uuid default null
) returns void language plpgsql as $function$
declare
  v_week_start date := p_logical_date - extract(isodow from p_logical_date)::integer + 1;
begin
  insert into public.adhdice_achievement_occurrences(
    id, user_id, source_kind, source_id, source_occurrence_key, dedupe_key,
    source_created_at, first_qualified_at, logical_date, week_key, week_start_date,
    week_end_date, month_key, month_start_date, month_end_date, timezone,
    logical_day_start, entity_kind, entity_id, root_parent_id, title_snapshot,
    outcome_snapshot, active_duration_seconds, evaluator_version, catalog_version,
    is_currently_qualifying, source_snapshot
  ) values (
    p_id, '${userId}', p_source_kind, p_source_id, 'runtime-key:' || p_id::text,
    'runtime-dedupe:' || p_id::text, p_logical_date::timestamptz, p_logical_date::timestamptz,
    p_logical_date, v_week_start, v_week_start, v_week_start + 6, to_char(p_logical_date, 'YYYY-MM'),
    date_trunc('month', p_logical_date)::date, (date_trunc('month', p_logical_date) + interval '1 month - 1 day')::date,
    'UTC', time '00:00', p_entity_kind, p_entity_id, p_root_parent_id, 'Runtime fixture',
    case when p_entity_kind = 'focus_session' then null else 'done' end,
    case when p_entity_kind = 'focus_session' then 900 else null end,
    'achievements-evaluator-v1', 'achievement-catalog-v1', p_qualifying,
    case when p_source_kind = 'task_history' then jsonb_build_object('history_fact_id', p_source_id) else '{}'::jsonb end
  );
end;
$function$;
select pg_temp.add_occurrence('${parentOccurrenceId}', 'task_history', 'parent_task', '${rootTaskId}', '${historyFactId}', '2026-06-01', true);
select pg_temp.add_occurrence('${siblingOccurrenceId}', 'task_history', 'parent_task', '${rootTaskId}', 'legacy-sibling', '2026-06-01', false);
select pg_temp.add_occurrence('${stepOccurrenceId}', 'task_history', 'step', '${stepTaskId}', '${deferredHistoryFactId}', '2026-06-02', true, '${rootTaskId}');
select pg_temp.add_occurrence('${stepSetOccurrenceId}', 'step_set', 'parent_step_set', '${rootTaskId}', 'step-set-old', '2026-06-02', true, '${rootTaskId}');
update public.adhdice_achievement_occurrences
set source_snapshot = jsonb_build_object('step_occurrence_ids', jsonb_build_array('${stepOccurrenceId}'::uuid))
where id = '${stepSetOccurrenceId}';
insert into public.adhdice_focus_sessions(
  id, user_id, title_snapshot, focus_type_snapshot, session_date, duration_seconds,
  source, created_at
) values (
  '${focusSessionId}', '${userId}', 'Runtime focus', 'deep_work', '2026-06-03', 1800,
  'timer', '2026-06-03 12:00:00+00'
);
select pg_temp.add_occurrence('${focusOccurrenceId}', 'focus_session', 'focus_session', '${focusSessionId}', '${focusSessionId}', '2026-06-03', true);
insert into public.adhdice_achievement_progress(
  user_id, track_id, current_value, current_streak, best_streak,
  source_watermark, recalculation_metadata, evaluator_version, catalog_version, last_recalculated_at
) values ('${userId}', 'locked_in', 777, 0, 0, '{}'::jsonb, '{"sentinel":true}'::jsonb,
  'sentinel', 'sentinel-catalog', '2000-01-01 00:00:00+00');
set session_replication_role = origin;
`);
  writeFileSync(verification, `
create temp table runtime_eval(result jsonb);
insert into runtime_eval(result)
select public.adhdice_evaluate_achievements_incremental(
  '${userId}', array['${parentOccurrenceId}', '${siblingOccurrenceId}']::uuid[],
  '90000000-0000-4000-8000-000000000101'::uuid, 'immediate'
);
create temp table focus_eval(result jsonb);
create temp table focus_sentinel as
select current_value, last_recalculated_at
from public.adhdice_achievement_progress
where user_id = '${userId}' and track_id = 'locked_in';
insert into focus_eval(result)
select public.adhdice_evaluate_achievements_incremental(
  '${userId}', array['${focusOccurrenceId}']::uuid[],
  '90000000-0000-4000-8000-000000000102'::uuid, 'immediate'
);
create temp table focus_before as
select occurrence.is_currently_qualifying,
  (select count(*) from public.adhdice_achievement_occurrence_matches occurrence_match
   where occurrence_match.occurrence_id = occurrence.id) as match_count
from public.adhdice_achievement_occurrences occurrence
where occurrence.id = '${focusOccurrenceId}';
delete from public.adhdice_focus_sessions where id = '${focusSessionId}'::uuid;
create temp table step_eval(result jsonb);
insert into step_eval(result)
select public.adhdice_evaluate_achievements_incremental(
  '${userId}', array['${stepOccurrenceId}', '${stepSetOccurrenceId}']::uuid[],
  '90000000-0000-4000-8000-000000000103'::uuid, 'immediate'
);
create temp table step_progress_before as
select current_value
from public.adhdice_achievement_progress
where user_id = '${userId}' and track_id = 'first_step';
create temp table evaluation_count_before_delete as
select count(*)::integer as value
from public.adhdice_achievement_evaluation_runs
where user_id = '${userId}';
begin;
select set_config('adhdice.achievement_deferred_user_id', '${userId}', true) as deferred_marker \\gset
delete from public.adhdice_task_history_facts where id = '${deferredHistoryFactId}'::uuid;
select set_config('adhdice.achievement_deferred_user_id', '', true) as deferred_marker \\gset
commit;
create temp table evaluation_count_after_delete as
select count(*)::integer as value
from public.adhdice_achievement_evaluation_runs
where user_id = '${userId}';
create temp table deferred_delete_state as
select
  not exists (select 1 from public.adhdice_task_history_facts where id = '${deferredHistoryFactId}'::uuid) as history_deleted,
  not occurrence.is_currently_qualifying as occurrence_deactivated,
  not step_set.is_currently_qualifying as step_set_refreshed,
  occurrence_match_count.value > 0 as baseline_step_matches,
  progress_before.current_value = 1 as baseline_step_progress,
  count_after.value = count_before.value as no_incremental_delete_evaluation
from public.adhdice_achievement_occurrences occurrence
join public.adhdice_achievement_occurrences step_set
  on step_set.id = '${stepSetOccurrenceId}'::uuid
cross join step_progress_before progress_before
cross join evaluation_count_before_delete count_before
cross join evaluation_count_after_delete count_after
cross join lateral (
  select count(*)::integer as value
  from public.adhdice_achievement_occurrence_matches occurrence_match
  where occurrence_match.occurrence_id = '${stepOccurrenceId}'::uuid
) occurrence_match_count
where occurrence.id = '${stepOccurrenceId}'::uuid;
create temp table deferred_finalizer(result jsonb);
insert into deferred_finalizer(result)
select public.adhdice_finalize_task_history_batch_achievements(
  '${userId}', '90000000-0000-4000-8000-000000000104'::uuid,
  array['${deferredHistoryFactId}']::uuid[]
);
create temp table evaluation_count_after_finalizer as
select count(*)::integer as value
from public.adhdice_achievement_evaluation_runs
where user_id = '${userId}';
with resolved as (
  select public.adhdice_resolve_achievement_affected_occurrence_ids(
    '${userId}', array['${historyFactId}']::uuid[], '{}'::uuid[], '{}'::uuid[], '{}'::uuid[]
  ) ids
), step_resolved as (
  select public.adhdice_resolve_achievement_affected_occurrence_ids(
    '${userId}', '{}'::uuid[], '{}'::uuid[], array['${stepOccurrenceId}']::uuid[], array['${rootTaskId}']::uuid[]
  ) ids
), evaluation as (
  select result from runtime_eval
), finalizer as (
  select result from deferred_finalizer
), finalizer_progress as (
  select current_value
  from public.adhdice_achievement_progress
  where user_id = '${userId}' and track_id = 'first_step'
), finalizer_counts as (
  select before_delete.value as before_delete,
    after_delete.value as after_delete,
    after_finalizer.value as after_finalizer
  from evaluation_count_before_delete before_delete
  cross join evaluation_count_after_delete after_delete
  cross join evaluation_count_after_finalizer after_finalizer
)
select
  (select ids = array['${parentOccurrenceId}', '${siblingOccurrenceId}']::uuid[] from resolved),
  (select ids = array['${stepOccurrenceId}', '${stepSetOccurrenceId}']::uuid[] from step_resolved),
  (select result->>'status' = 'completed' from evaluation),
  (select result->'track_ids' = to_jsonb(array['count_on_me','do_something','fifty_two_each_year','i_can_count_to_ten','keep_it_moving','this_week_on_the_streak','twelve_each_year']::text[]) from evaluation),
  (select count(*)::text from public.adhdice_achievement_occurrence_matches where user_id = '${userId}' and occurrence_id = '${parentOccurrenceId}'),
  (select current_value = 777 and last_recalculated_at = '2000-01-01 00:00:00+00' from focus_sentinel),
  (select result->>'status' = 'completed' from focus_eval),
  (select is_currently_qualifying::text from focus_before),
  (select match_count::text from focus_before),
  (select not occurrence.is_currently_qualifying
    from public.adhdice_achievement_occurrences occurrence
    where occurrence.id = '${focusOccurrenceId}'),
  (select count(*) = 0
    from public.adhdice_achievement_occurrence_matches occurrence_match
    where occurrence_match.occurrence_id = '${focusOccurrenceId}'),
  position('adhdice_evaluate_achievements_incremental_for_history_facts' in pg_get_functiondef('public.adhdice_execute_task_state_command(uuid,jsonb)'::regprocedure)) > 0,
  position('adhdice_rebuild_achievement_progress(' in pg_get_functiondef('public.adhdice_execute_task_state_command(uuid,jsonb)'::regprocedure)) = 0,
  to_regprocedure('public.adhdice_finalize_task_history_batch_achievements(uuid,uuid,uuid[])') is not null,
  (select history_deleted and occurrence_deactivated and step_set_refreshed
    and no_incremental_delete_evaluation and baseline_step_matches and baseline_step_progress
    from deferred_delete_state),
  (select result->>'status' = 'completed' from finalizer),
  (select after_delete = before_delete and after_finalizer = before_delete + 1 from finalizer_counts),
  (select count(*) = 0 from public.adhdice_achievement_occurrence_matches where occurrence_id = '${stepOccurrenceId}'::uuid),
  (select count(*) = 0 from public.adhdice_achievement_occurrence_matches where occurrence_id = '${stepSetOccurrenceId}'::uuid),
  (select current_value = 0 from finalizer_progress),
  (select current_value = 777 and last_recalculated_at = '2000-01-01 00:00:00+00' from focus_sentinel),
  position('adhdice_rebuild_achievement_progress(' in pg_get_functiondef('public.adhdice_finalize_task_history_batch_achievements(uuid,uuid,uuid[])'::regprocedure)) = 0;
`);

  try {
    run(createdb, [...utilityConnectionArgs(), database]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", fixtureSetup]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", baselineSchema, "-f", commandRpc, "-f", rebuildPath, "-f", foundationPath, "-f", batchBoundaryPath, "-f", runtimePath, "-f", correctionPath]);
    const output = run(psql, [...connectionArgs(database), "-qAt", "-v", "ON_ERROR_STOP=1", "-f", fixtureData, "-f", verification]);
    const values = output.trim().split("|");
    assert.deepEqual(values.slice(0, 4), ["t", "t", "t", "t"]);
    assert.equal(values[4], "7", `unexpected parent match count: ${values.join("|")}`);
    assert.deepEqual(values.slice(5), ["t", "t", "true", "7", "t", "t", "t", "t", "t", "t", "t", "t", "t", "t", "t", "t", "t"]);
  } finally {
    try {
      run(dropdb, ["--if-exists", ...utilityConnectionArgs(), database]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
});
