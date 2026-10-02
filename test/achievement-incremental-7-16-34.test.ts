import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

const repositoryRoot = process.cwd();
const migration = readFileSync(new URL("../supabase/patch_achievement_incremental_reconciliation_7_16_34.sql", import.meta.url), "utf8");
const rebuildPatch = readFileSync(new URL("../supabase/patch_achievement_rebuild_performance_7_16_32.sql", import.meta.url), "utf8");
const psql = process.env.ADHDICE_SQL_COMPILE_PSQL_BIN ?? "psql";
const psqlDirectory = dirname(psql);
const createdb = join(psqlDirectory, "createdb");
const dropdb = join(psqlDirectory, "dropdb");
const host = process.env.ADHDICE_SQL_COMPILE_PGHOST;
const port = process.env.ADHDICE_SQL_COMPILE_PGPORT ?? "5432";
const targetUser = "00000000-0000-4000-8000-000000000001";
const referenceUser = "00000000-0000-4000-8000-000000000002";

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
    throw new Error(`${command} failed:\n${(detail.stderr ?? String(error)).slice(-12000)}`);
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

test("7.16.34 exposes one dependency authority and keeps the incremental path bounded", () => {
  assert.match(migration, /create or replace function public\.adhdice_achievement_track_dependencies\(\)/);
  assert.match(migration, /public\.adhdice_track_dependencies|public\.adhdice_achievement_track_dependencies/);
  assert.match(migration, /create or replace function public\.adhdice_sync_achievement_occurrence_matches\(\s*p_occurrence_ids uuid\[\]/);
  assert.match(migration, /where occurrence_match\.occurrence_id = any\(p_occurrence_ids\)/);
  assert.doesNotMatch(
    migration.slice(migration.indexOf("create or replace function public.adhdice_sync_achievement_occurrence_matches"), migration.indexOf("create or replace function public.adhdice_rebuild_achievement_progress_for_tracks")),
    /delete from public\.adhdice_achievement_occurrence_matches where user_id\s*=/,
  );
  assert.match(migration, /create or replace function public\.adhdice_rebuild_achievement_progress_for_tracks\(/);
  assert.match(migration, /threshold\.track_id = any\(v_track_ids\)/);
  assert.match(migration, /with inserted as \(\s*insert into public\.adhdice_achievement_tier_awards/);
  assert.match(migration, /from inserted\s*\n  on conflict \(user_id, dedupe_key\) do nothing/);
  assert.match(migration, /required\.track_id = any\(v_track_ids\)/);
  assert.match(migration, /from inserted\s*\n  on conflict \(user_id, dedupe_key\) do nothing/);
  assert.match(migration, /v_before constant text/);
  assert.match(migration, /join public\.adhdice_achievement_track_dependencies\(\) track/);
  assert.match(rebuildPatch, /delete from public\.adhdice_achievement_occurrence_matches where user_id = p_user_id/);
});

test("7.16.34 targeted reconciliation matches the full rebuild across source families and awards", (t) => {
  if (!host) {
    t.skip("set ADHDICE_SQL_COMPILE_PGHOST to run the disposable local PostgreSQL Achievement parity regression");
    return;
  }
  assert.ok(host.startsWith("/") || ["localhost", "127.0.0.1", "::1"].includes(host));

  const scratch = mkdtempSync(join(tmpdir(), "adhdice-sql-achievement-incremental-7-16-34-"));
  const database = `adhdice_incremental_71634_${process.pid}_${Date.now()}`;
  const fixtureSetup = join(scratch, "fixture-setup.sql");
  const baselineSchema = join(scratch, "baseline-schema.sql");
  const rebuildPath = join(scratch, "rebuild-7-16-32.sql");
  const migrationPath = join(scratch, "incremental-7-16-34.sql");
  const fixtureData = join(scratch, "fixture-data.sql");
  const verificationPath = join(scratch, "verification.sql");

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
  writeFileSync(rebuildPath, rebuildPatch);
  writeFileSync(migrationPath, migration);

  writeFileSync(fixtureData, `
insert into auth.users(id) values
  ('${targetUser}'), ('${referenceUser}')
on conflict (id) do nothing;
insert into public.adhdice_achievement_profiles(
  user_id, activation_operation_id, activated_at, catalog_version, rules_version,
  launch_mastery_version, timezone, logical_day_start
) values
  ('${targetUser}', '00000000-0000-4000-8000-000000000011', '2025-01-01 00:00:00+00', 'achievement-catalog-v1', 'achievement-rules-v1', 'achievement-launch-v1', 'UTC', time '00:00'),
  ('${referenceUser}', '00000000-0000-4000-8000-000000000012', '2025-01-01 00:00:00+00', 'achievement-catalog-v1', 'achievement-rules-v1', 'achievement-launch-v1', 'UTC', time '00:00')
on conflict (user_id) do nothing;

create or replace function pg_temp.upsert_occurrence(
  p_user_id uuid, p_id uuid, p_entity_kind text, p_logical_date date,
  p_qualifying boolean, p_duration bigint default null
) returns void
language plpgsql
as $function$
declare
  v_source_kind text := case when p_entity_kind = 'focus_session' then 'focus_session' when p_entity_kind = 'parent_step_set' then 'step_set' else 'task_history' end;
  v_outcome text := case when p_entity_kind = 'focus_session' then null else 'done' end;
  v_week_start date := p_logical_date - extract(isodow from p_logical_date)::integer + 1;
  v_occurrence_id uuid := case when p_user_id = '${referenceUser}' then md5('reference:' || p_id::text)::uuid else p_id end;
begin
  insert into public.adhdice_achievement_occurrences(
    id, user_id, source_kind, source_id, source_occurrence_key, dedupe_key,
    source_created_at, first_qualified_at, logical_date, week_key, week_start_date,
    week_end_date, month_key, month_start_date, month_end_date, timezone,
    logical_day_start, entity_kind, entity_id, root_parent_id, title_snapshot,
    outcome_snapshot, active_duration_seconds, evaluator_version, catalog_version,
    is_currently_qualifying, source_snapshot
  ) values (
    v_occurrence_id, p_user_id, v_source_kind, p_id::text, 'test-occurrence:' || p_id::text,
    'test-dedupe:' || p_id::text, p_logical_date::timestamptz + interval '12 hours',
    p_logical_date::timestamptz + interval '12 hours', p_logical_date, v_week_start,
    v_week_start, v_week_start + 6, to_char(p_logical_date, 'YYYY-MM'),
    date_trunc('month', p_logical_date)::date,
    (date_trunc('month', p_logical_date) + interval '1 month - 1 day')::date,
    'UTC', time '00:00', p_entity_kind, v_occurrence_id, null, 'Parity fixture', v_outcome,
    case when p_entity_kind = 'focus_session' then greatest(coalesce(p_duration, 1), 1) else null end,
    'achievements-evaluator-v1', 'achievement-catalog-v1', p_qualifying,
    jsonb_build_object('fixture', true, 'id', p_id)
  )
  on conflict (user_id, dedupe_key) do update set
    source_created_at = excluded.source_created_at,
    first_qualified_at = excluded.first_qualified_at,
    logical_date = excluded.logical_date,
    week_key = excluded.week_key,
    week_start_date = excluded.week_start_date,
    week_end_date = excluded.week_end_date,
    month_key = excluded.month_key,
    month_start_date = excluded.month_start_date,
    month_end_date = excluded.month_end_date,
    entity_kind = excluded.entity_kind,
    entity_id = excluded.entity_id,
    outcome_snapshot = excluded.outcome_snapshot,
    active_duration_seconds = excluded.active_duration_seconds,
    is_currently_qualifying = excluded.is_currently_qualifying,
    source_snapshot = excluded.source_snapshot,
    catalog_version = excluded.catalog_version;
end;
$function$;

create temp table parity_results(
  ordinal integer generated always as identity, case_name text not null,
  progress_equal boolean not null, matches_equal boolean not null,
  awards_equal boolean not null, notifications_equal boolean not null
);

create or replace function pg_temp.assert_case(
  p_case_name text, p_track_ids text[], p_occurrence_ids uuid[]
) returns void
language plpgsql
as $function$
declare
  v_target_run uuid := md5('target:' || p_case_name)::uuid;
  v_reference_run uuid := md5('reference:' || p_case_name)::uuid;
  v_target_progress jsonb;
  v_reference_progress jsonb;
  v_target_matches jsonb;
  v_reference_matches jsonb;
  v_target_awards jsonb;
  v_reference_awards jsonb;
  v_target_notifications jsonb;
  v_reference_notifications jsonb;
  v_reference_occurrence_ids uuid[];
begin
  select coalesce(array_agg(md5('reference:' || occurrence_id::text)::uuid), '{}'::uuid[])
    into v_reference_occurrence_ids
  from unnest(p_occurrence_ids) changed(occurrence_id);
  insert into public.adhdice_achievement_evaluation_runs(
    id, operation_id, user_id, mode, status, catalog_version, rules_version, completed_at
  ) values
    (v_target_run, v_target_run, '${targetUser}', 'immediate', 'completed', 'achievement-catalog-v1', 'achievement-rules-v1', clock_timestamp()),
    (v_reference_run, v_reference_run, '${referenceUser}', 'immediate', 'completed', 'achievement-catalog-v1', 'achievement-rules-v1', clock_timestamp())
  on conflict (user_id, operation_id) do nothing;

  perform public.adhdice_sync_achievement_occurrence_matches(p_occurrence_ids);
  perform public.adhdice_rebuild_achievement_progress_for_tracks('${targetUser}', p_track_ids, v_target_run, clock_timestamp());
  perform public.adhdice_rebuild_achievement_progress_for_tracks('${targetUser}', p_track_ids, v_target_run, clock_timestamp());
  perform public.adhdice_rebuild_achievement_progress('${referenceUser}', v_reference_run, clock_timestamp());
  perform public.adhdice_rebuild_achievement_progress('${referenceUser}', v_reference_run, clock_timestamp());

  select coalesce(jsonb_agg(jsonb_build_object(
    'track_id', progress.track_id, 'current_value', progress.current_value,
    'current_streak', progress.current_streak, 'best_streak', progress.best_streak,
    'current_streak_start', progress.current_streak_start,
    'current_streak_end', progress.current_streak_end,
    'best_streak_start', progress.best_streak_start,
    'best_streak_end', progress.best_streak_end,
    'evaluator_version', progress.evaluator_version,
    'catalog_version', progress.catalog_version
  ) order by progress.track_id), '[]'::jsonb)
  into v_target_progress
  from public.adhdice_achievement_progress progress
  where progress.user_id = '${targetUser}' and progress.track_id = any(p_track_ids);
  select coalesce(jsonb_agg(jsonb_build_object(
    'track_id', progress.track_id, 'current_value', progress.current_value,
    'current_streak', progress.current_streak, 'best_streak', progress.best_streak,
    'current_streak_start', progress.current_streak_start,
    'current_streak_end', progress.current_streak_end,
    'best_streak_start', progress.best_streak_start,
    'best_streak_end', progress.best_streak_end,
    'evaluator_version', progress.evaluator_version,
    'catalog_version', progress.catalog_version
  ) order by progress.track_id), '[]'::jsonb)
  into v_reference_progress
  from public.adhdice_achievement_progress progress
  where progress.user_id = '${referenceUser}' and progress.track_id = any(p_track_ids);

  select coalesce(jsonb_agg(jsonb_build_object(
    'track_id', occurrence_match.track_id,
    'catalog_version', occurrence_match.catalog_version
  ) order by occurrence_match.track_id), '[]'::jsonb)
  into v_target_matches
  from public.adhdice_achievement_occurrence_matches occurrence_match
  where occurrence_match.user_id = '${targetUser}' and occurrence_match.occurrence_id = any(p_occurrence_ids);
  select coalesce(jsonb_agg(jsonb_build_object(
    'track_id', occurrence_match.track_id,
    'catalog_version', occurrence_match.catalog_version
  ) order by occurrence_match.track_id), '[]'::jsonb)
  into v_reference_matches
  from public.adhdice_achievement_occurrence_matches occurrence_match
  where occurrence_match.user_id = '${referenceUser}' and occurrence_match.occurrence_id = any(v_reference_occurrence_ids);

  select coalesce(jsonb_agg(jsonb_build_object('track_id', award.track_id, 'tier', award.tier, 'award_key', award.award_key) order by award.track_id, award.tier), '[]'::jsonb)
  into v_target_awards
  from public.adhdice_achievement_tier_awards award
  where award.user_id = '${targetUser}' and award.track_id = any(p_track_ids);
  select coalesce(jsonb_agg(jsonb_build_object('track_id', award.track_id, 'tier', award.tier, 'award_key', award.award_key) order by award.track_id, award.tier), '[]'::jsonb)
  into v_reference_awards
  from public.adhdice_achievement_tier_awards award
  where award.user_id = '${referenceUser}' and award.track_id = any(p_track_ids);

  select coalesce(jsonb_agg(jsonb_build_object('dedupe_key', notification.dedupe_key) order by notification.dedupe_key), '[]'::jsonb)
  into v_target_notifications
  from public.adhdice_achievement_notifications notification
  left join public.adhdice_achievement_tier_awards award on award.id = notification.tier_award_id
  where notification.user_id = '${targetUser}'
    and (award.track_id = any(p_track_ids) or notification.award_kind = 'collection');
  select coalesce(jsonb_agg(jsonb_build_object('dedupe_key', notification.dedupe_key) order by notification.dedupe_key), '[]'::jsonb)
  into v_reference_notifications
  from public.adhdice_achievement_notifications notification
  left join public.adhdice_achievement_tier_awards award on award.id = notification.tier_award_id
  where notification.user_id = '${referenceUser}'
    and (award.track_id = any(p_track_ids) or notification.award_kind = 'collection');

  insert into parity_results(case_name, progress_equal, matches_equal, awards_equal, notifications_equal)
  values (p_case_name, v_target_progress = v_reference_progress, v_target_matches = v_reference_matches,
    v_target_awards = v_reference_awards, v_target_notifications = v_reference_notifications);
end;
$function$;

-- 1. Parent task becomes qualifying.
select pg_temp.upsert_occurrence('${targetUser}', '10000000-0000-4000-8000-000000000001', 'parent_task', '2026-01-01', true);
select pg_temp.upsert_occurrence('${referenceUser}', '10000000-0000-4000-8000-000000000001', 'parent_task', '2026-01-01', true);
select pg_temp.assert_case('parent task becomes qualifying', array['count_on_me','i_can_count_to_ten','fifty_two_each_year','twelve_each_year','do_something','this_week_on_the_streak','keep_it_moving'], array['10000000-0000-4000-8000-000000000001']::uuid[]);

-- Unrelated focus progress is deliberately not rewritten by the parent target.
insert into public.adhdice_achievement_progress(user_id, track_id, current_value, current_streak, best_streak, source_watermark, recalculation_metadata, evaluator_version, catalog_version, last_recalculated_at)
values ('${targetUser}', 'locked_in', 777, 0, 0, '{}'::jsonb, '{"sentinel":true}'::jsonb, 'sentinel', 'sentinel-catalog', '2000-01-01 00:00:00+00');
select pg_temp.assert_case('parent target leaves unrelated focus row untouched', array['count_on_me'], array['10000000-0000-4000-8000-000000000001']::uuid[]);
do $check$
declare v_unchanged boolean;
begin
  select last_recalculated_at = '2000-01-01 00:00:00+00' and current_value = 777 and evaluator_version = 'sentinel'
    into v_unchanged from public.adhdice_achievement_progress where user_id = '${targetUser}' and track_id = 'locked_in';
  update parity_results set progress_equal = progress_equal and v_unchanged where case_name = 'parent target leaves unrelated focus row untouched';
end;
$check$;

-- 2-4. Parent dequalification, historical date correction, and multiple dates.
select pg_temp.upsert_occurrence('${targetUser}', '10000000-0000-4000-8000-000000000001', 'parent_task', '2026-01-01', false);
select pg_temp.upsert_occurrence('${referenceUser}', '10000000-0000-4000-8000-000000000001', 'parent_task', '2026-01-01', false);
select pg_temp.assert_case('parent task becomes non-qualifying', array['count_on_me','do_something','keep_it_moving'], array['10000000-0000-4000-8000-000000000001']::uuid[]);
select pg_temp.upsert_occurrence('${targetUser}', '10000000-0000-4000-8000-000000000001', 'parent_task', '2026-01-03', true);
select pg_temp.upsert_occurrence('${referenceUser}', '10000000-0000-4000-8000-000000000001', 'parent_task', '2026-01-03', true);
select pg_temp.assert_case('historical parent date changes', array['count_on_me','fifty_two_each_year','twelve_each_year','do_something','keep_it_moving'], array['10000000-0000-4000-8000-000000000001']::uuid[]);
select pg_temp.upsert_occurrence('${targetUser}', '10000000-0000-4000-8000-000000000002', 'parent_task', '2026-01-04', true);
select pg_temp.upsert_occurrence('${referenceUser}', '10000000-0000-4000-8000-000000000002', 'parent_task', '2026-01-04', true);
select pg_temp.upsert_occurrence('${targetUser}', '10000000-0000-4000-8000-000000000003', 'parent_task', '2026-01-05', true);
select pg_temp.upsert_occurrence('${referenceUser}', '10000000-0000-4000-8000-000000000003', 'parent_task', '2026-01-05', true);
select pg_temp.assert_case('multiple parent dates change', array['count_on_me','fifty_two_each_year','twelve_each_year','do_something','keep_it_moving'], array['10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003']::uuid[]);

-- 5-8. Step and Step-set qualification boundaries.
select pg_temp.upsert_occurrence('${targetUser}', '20000000-0000-4000-8000-000000000001', 'step', '2026-01-06', true);
select pg_temp.upsert_occurrence('${referenceUser}', '20000000-0000-4000-8000-000000000001', 'step', '2026-01-06', true);
select pg_temp.assert_case('step becomes qualifying', array['first_step','second_step','third_step','keep_it_moving'], array['20000000-0000-4000-8000-000000000001']::uuid[]);
select pg_temp.upsert_occurrence('${targetUser}', '20000000-0000-4000-8000-000000000001', 'step', '2026-01-06', false);
select pg_temp.upsert_occurrence('${referenceUser}', '20000000-0000-4000-8000-000000000001', 'step', '2026-01-06', false);
select pg_temp.assert_case('step becomes non-qualifying', array['first_step','second_step','third_step','keep_it_moving'], array['20000000-0000-4000-8000-000000000001']::uuid[]);
select pg_temp.upsert_occurrence('${targetUser}', '30000000-0000-4000-8000-000000000001', 'parent_step_set', '2026-01-07', true);
select pg_temp.upsert_occurrence('${referenceUser}', '30000000-0000-4000-8000-000000000001', 'parent_step_set', '2026-01-07', true);
select pg_temp.assert_case('step-set becomes qualified', array['last_step'], array['30000000-0000-4000-8000-000000000001']::uuid[]);
select pg_temp.upsert_occurrence('${targetUser}', '30000000-0000-4000-8000-000000000001', 'parent_step_set', '2026-01-07', false);
select pg_temp.upsert_occurrence('${referenceUser}', '30000000-0000-4000-8000-000000000001', 'parent_step_set', '2026-01-07', false);
select pg_temp.assert_case('step-set becomes invalidated', array['last_step'], array['30000000-0000-4000-8000-000000000001']::uuid[]);

-- 9-11. Focus insert, duration correction, and deactivation.
select pg_temp.upsert_occurrence('${targetUser}', '40000000-0000-4000-8000-000000000001', 'focus_session', '2026-01-08', true, 900);
select pg_temp.upsert_occurrence('${referenceUser}', '40000000-0000-4000-8000-000000000001', 'focus_session', '2026-01-08', true, 900);
select pg_temp.assert_case('focus session inserted', array['broken_clock','overtime','february_challenge','locked_in','staring_contest','session_possible','dont_get_distracted'], array['40000000-0000-4000-8000-000000000001']::uuid[]);
select pg_temp.upsert_occurrence('${targetUser}', '40000000-0000-4000-8000-000000000001', 'focus_session', '2026-01-08', true, 7200);
select pg_temp.upsert_occurrence('${referenceUser}', '40000000-0000-4000-8000-000000000001', 'focus_session', '2026-01-08', true, 7200);
select pg_temp.assert_case('focus duration changes', array['broken_clock','locked_in','staring_contest','session_possible'], array['40000000-0000-4000-8000-000000000001']::uuid[]);
select pg_temp.upsert_occurrence('${targetUser}', '40000000-0000-4000-8000-000000000001', 'focus_session', '2026-01-08', false, 7200);
select pg_temp.upsert_occurrence('${referenceUser}', '40000000-0000-4000-8000-000000000001', 'focus_session', '2026-01-08', false, 7200);
select pg_temp.assert_case('focus session removed or deactivated', array['broken_clock','overtime','february_challenge','locked_in','staring_contest','session_possible','dont_get_distracted'], array['40000000-0000-4000-8000-000000000001']::uuid[]);

-- 12-16. Daily, weekly, monthly, lifetime, and duration metrics.
do $seed$
declare i integer; v_id uuid;
begin
  for i in 1..10 loop
    v_id := md5('daily-parent-' || i::text)::uuid;
    perform pg_temp.upsert_occurrence('${targetUser}', v_id, 'parent_task', '2026-02-01', true);
    perform pg_temp.upsert_occurrence('${referenceUser}', v_id, 'parent_task', '2026-02-01', true);
  end loop;
end;
$seed$;
select pg_temp.assert_case('daily-count achievement', array['i_can_count_to_ten'], '{}'::uuid[]);
do $seed$
declare i integer; v_id uuid;
begin
  for i in 1..12 loop
    v_id := md5('weekly-parent-' || i::text)::uuid;
    perform pg_temp.upsert_occurrence('${targetUser}', v_id, 'parent_task', '2026-02-02', true);
    perform pg_temp.upsert_occurrence('${referenceUser}', v_id, 'parent_task', '2026-02-02', true);
  end loop;
end;
$seed$;
select pg_temp.assert_case('weekly-max achievement', array['fifty_two_each_year'], '{}'::uuid[]);
do $seed$
declare i integer; v_id uuid;
begin
  for i in 1..14 loop
    v_id := md5('monthly-parent-' || i::text)::uuid;
    perform pg_temp.upsert_occurrence('${targetUser}', v_id, 'parent_task', '2026-02-03', true);
    perform pg_temp.upsert_occurrence('${referenceUser}', v_id, 'parent_task', '2026-02-03', true);
  end loop;
end;
$seed$;
select pg_temp.assert_case('monthly-max achievement', array['twelve_each_year'], '{}'::uuid[]);
select pg_temp.assert_case('lifetime count achievement', array['count_on_me'], '{}'::uuid[]);
select pg_temp.upsert_occurrence('${targetUser}', '40000000-0000-4000-8000-000000000002', 'focus_session', '2026-02-04', true, 18000);
select pg_temp.upsert_occurrence('${referenceUser}', '40000000-0000-4000-8000-000000000002', 'focus_session', '2026-02-04', true, 18000);
select pg_temp.assert_case('longest-duration focus achievement', array['staring_contest'], array['40000000-0000-4000-8000-000000000002']::uuid[]);

-- 17-19. Parent, Focus, and moving streaks.
do $seed$
declare i integer; v_id uuid; v_date date;
begin
  for i in 1..5 loop
    v_id := md5('parent-streak-' || i::text)::uuid; v_date := date '2026-03-01' + i;
    perform pg_temp.upsert_occurrence('${targetUser}', v_id, 'parent_task', v_date, true);
    perform pg_temp.upsert_occurrence('${referenceUser}', v_id, 'parent_task', v_date, true);
  end loop;
end;
$seed$;
select pg_temp.assert_case('parent streak', array['do_something'], '{}'::uuid[]);
do $seed$
declare i integer; v_id uuid; v_date date;
begin
  for i in 1..5 loop
    v_id := md5('focus-streak-' || i::text)::uuid; v_date := date '2026-04-01' + i;
    perform pg_temp.upsert_occurrence('${targetUser}', v_id, 'focus_session', v_date, true, 1800);
    perform pg_temp.upsert_occurrence('${referenceUser}', v_id, 'focus_session', v_date, true, 1800);
  end loop;
end;
$seed$;
select pg_temp.assert_case('focus streak', array['dont_get_distracted'], '{}'::uuid[]);
do $seed$
declare i integer; v_id uuid; v_date date;
begin
  for i in 1..5 loop
    v_date := date '2026-05-01' + i;
    v_id := md5('moving-parent-' || i::text)::uuid;
    perform pg_temp.upsert_occurrence('${targetUser}', v_id, 'parent_task', v_date, true);
    perform pg_temp.upsert_occurrence('${referenceUser}', v_id, 'parent_task', v_date, true);
    v_id := md5('moving-step-' || i::text)::uuid;
    perform pg_temp.upsert_occurrence('${targetUser}', v_id, 'step', v_date, true);
    perform pg_temp.upsert_occurrence('${referenceUser}', v_id, 'step', v_date, true);
  end loop;
end;
$seed$;
select pg_temp.assert_case('moving streak spanning parent and Step evidence', array['keep_it_moving'], '{}'::uuid[]);

-- 20. Seed an already-earned permanent tier and all platinum collection
-- constituents, then lower progress. Neither path may revoke them.
do $seed$
declare v_target_run uuid := md5('permanent-target')::uuid; v_reference_run uuid := md5('permanent-reference')::uuid; v_track text;
begin
  insert into public.adhdice_achievement_evaluation_runs(id, operation_id, user_id, mode, status, catalog_version, rules_version, completed_at)
  values (v_target_run, v_target_run, '${targetUser}', 'immediate', 'completed', 'achievement-catalog-v1', 'achievement-rules-v1', clock_timestamp()),
    (v_reference_run, v_reference_run, '${referenceUser}', 'immediate', 'completed', 'achievement-catalog-v1', 'achievement-rules-v1', clock_timestamp())
  on conflict (user_id, operation_id) do nothing;
  foreach v_track in array array['i_can_count_to_ten','fifty_two_each_year','twelve_each_year','count_on_me'] loop
    insert into public.adhdice_achievement_tier_awards(user_id, track_id, tier, award_key, earned_at, evaluation_run_id, evaluator_version, catalog_version)
    values ('${targetUser}', v_track, 'platinum', 'tier-award:v1:' || v_track || ':platinum', '2026-06-01', v_target_run, 'achievements-evaluator-v1', 'achievement-catalog-v1'),
      ('${referenceUser}', v_track, 'platinum', 'tier-award:v1:' || v_track || ':platinum', '2026-06-01', v_reference_run, 'achievements-evaluator-v1', 'achievement-catalog-v1')
    on conflict (user_id, track_id, tier) do nothing;
  end loop;
  insert into public.adhdice_achievement_notifications(user_id, award_kind, tier_award_id, dedupe_key)
  select award.user_id, 'tier', award.id, 'notification:v1:' || award.award_key
  from public.adhdice_achievement_tier_awards award
  where award.user_id in ('${targetUser}', '${referenceUser}')
    and award.tier = 'platinum'
  on conflict (user_id, dedupe_key) do nothing;
end;
$seed$;
do $dequalify$
declare v_ids uuid[];
begin
  select array_agg(id) into v_ids from public.adhdice_achievement_occurrences where user_id = '${targetUser}' and entity_kind = 'parent_task';
  update public.adhdice_achievement_occurrences set is_currently_qualifying = false where user_id in ('${targetUser}','${referenceUser}') and entity_kind = 'parent_task';
  perform pg_temp.assert_case('previously earned tier remains permanent after progress decreases', array['count_on_me'], v_ids);
end;
$dequalify$;

-- 21-22. Repeated targeted/full calls create no duplicate awards or notices.
do $dedupe$
declare v_before_target_awards integer; v_before_reference_awards integer; v_before_target_notifications integer; v_before_reference_notifications integer; v_target_run uuid := md5('dedupe-target')::uuid; v_reference_run uuid := md5('dedupe-reference')::uuid; v_ok boolean;
begin
  insert into public.adhdice_achievement_evaluation_runs(id, operation_id, user_id, mode, status, catalog_version, rules_version, completed_at)
  values (v_target_run, v_target_run, '${targetUser}', 'immediate', 'completed', 'achievement-catalog-v1', 'achievement-rules-v1', clock_timestamp()), (v_reference_run, v_reference_run, '${referenceUser}', 'immediate', 'completed', 'achievement-catalog-v1', 'achievement-rules-v1', clock_timestamp())
  on conflict (user_id, operation_id) do nothing;
  select count(*) into v_before_target_awards from public.adhdice_achievement_tier_awards where user_id = '${targetUser}';
  select count(*) into v_before_reference_awards from public.adhdice_achievement_tier_awards where user_id = '${referenceUser}';
  select count(*) into v_before_target_notifications from public.adhdice_achievement_notifications where user_id = '${targetUser}';
  select count(*) into v_before_reference_notifications from public.adhdice_achievement_notifications where user_id = '${referenceUser}';
  perform public.adhdice_rebuild_achievement_progress_for_tracks('${targetUser}', array['count_on_me'], v_target_run, clock_timestamp());
  perform public.adhdice_rebuild_achievement_progress_for_tracks('${targetUser}', array['count_on_me'], v_target_run, clock_timestamp());
  perform public.adhdice_rebuild_achievement_progress('${referenceUser}', v_reference_run, clock_timestamp());
  perform public.adhdice_rebuild_achievement_progress('${referenceUser}', v_reference_run, clock_timestamp());
  select (select count(*) from public.adhdice_achievement_tier_awards where user_id = '${targetUser}') = v_before_target_awards
    and (select count(*) from public.adhdice_achievement_tier_awards where user_id = '${referenceUser}') = v_before_reference_awards
    into v_ok;
  insert into parity_results(case_name, progress_equal, matches_equal, awards_equal, notifications_equal)
  values ('no duplicate awards', v_ok, true, v_ok, true);
  select (select count(*) from public.adhdice_achievement_notifications where user_id = '${targetUser}') = v_before_target_notifications
    and (select count(*) from public.adhdice_achievement_notifications where user_id = '${referenceUser}') = v_before_reference_notifications
    into v_ok;
  insert into parity_results(case_name, progress_equal, matches_equal, awards_equal, notifications_equal)
  values ('no duplicate notifications', v_ok, true, true, v_ok);
end;
$dedupe$;

-- 23. The same occurrence IDs can be synchronized repeatedly without duplicate matches.
do $matches$
declare v_id uuid := '10000000-0000-4000-8000-000000000002'; v_count integer; v_distinct integer;
begin
  perform public.adhdice_sync_achievement_occurrence_matches(array[v_id]);
  perform public.adhdice_sync_achievement_occurrence_matches(array[v_id]);
  select count(*), count(distinct occurrence_id || ':' || track_id) into v_count, v_distinct
  from public.adhdice_achievement_occurrence_matches where user_id = '${targetUser}' and occurrence_id = v_id;
  insert into parity_results(case_name, progress_equal, matches_equal, awards_equal, notifications_equal)
  values ('no duplicate occurrence matches', v_count = v_distinct, v_count = v_distinct, true, true);
end;
$matches$;

-- 24. The case comparisons include evaluator/catalog metadata and exact match
-- catalog versions, proving metadata parity without comparing timestamps.
select pg_temp.assert_case('catalog and evaluator metadata parity', array['count_on_me'], array['10000000-0000-4000-8000-000000000002']::uuid[]);
`);

  writeFileSync(verificationPath, `select ordinal, case_name, progress_equal, matches_equal, awards_equal, notifications_equal from parity_results order by ordinal;`);

  try {
    run(createdb, [...utilityConnectionArgs(), database]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", fixtureSetup]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", baselineSchema, "-f", rebuildPath, "-f", migrationPath]);
    const output = run(psql, [...connectionArgs(database), "-qAt", "-v", "ON_ERROR_STOP=1", "-f", fixtureData, "-f", verificationPath]);
    const rows = output.trim().split("\n").filter(Boolean).map((row) => row.split("|"));
    const expected = [
      "parent task becomes qualifying",
      "parent target leaves unrelated focus row untouched",
      "parent task becomes non-qualifying",
      "historical parent date changes",
      "multiple parent dates change",
      "step becomes qualifying",
      "step becomes non-qualifying",
      "step-set becomes qualified",
      "step-set becomes invalidated",
      "focus session inserted",
      "focus duration changes",
      "focus session removed or deactivated",
      "daily-count achievement",
      "weekly-max achievement",
      "monthly-max achievement",
      "lifetime count achievement",
      "longest-duration focus achievement",
      "parent streak",
      "focus streak",
      "moving streak spanning parent and Step evidence",
      "previously earned tier remains permanent after progress decreases",
      "no duplicate awards",
      "no duplicate notifications",
      "no duplicate occurrence matches",
      "catalog and evaluator metadata parity",
    ];
    assert.deepEqual(rows.map((row) => row[1]), expected);
    for (const row of rows) {
      assert.deepEqual(row.slice(2), ["t", "t", "t", "t"], `${row[1]} parity failed`);
    }
  } finally {
    try {
      run(dropdb, ["--if-exists", ...utilityConnectionArgs(), database]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
});
