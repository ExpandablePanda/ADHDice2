import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

const repositoryRoot = process.cwd();
const psql = process.env.ADHDICE_SQL_COMPILE_PSQL_BIN ?? "psql";
const psqlDirectory = dirname(psql);
const createdb = join(psqlDirectory, "createdb");
const dropdb = join(psqlDirectory, "dropdb");
const host = process.env.ADHDICE_SQL_COMPILE_PGHOST;
const port = process.env.ADHDICE_SQL_COMPILE_PGPORT ?? "5432";

const userId = "00000000-0000-4000-8000-000000000001";
const parentId = "00000000-0000-4000-8000-000000000101";
const childId = "00000000-0000-4000-8000-000000000102";
const childHistoryId = "00000000-0000-4000-8000-000000000201";
const parentHistoryId = "00000000-0000-4000-8000-000000000202";
const entitlementId = "00000000-0000-4000-8000-000000000301";
const focusId = "00000000-0000-4000-8000-000000000401";

function run(command: string, args: string[], input?: string): string {
  return execFileSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    input,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
}

function connectionArgs(database: string): string[] {
  return ["-h", host!, "-p", port, "-d", database];
}

function utilityConnectionArgs(): string[] {
  return ["-h", host!, "-p", port];
}

test("7.13.85 SQL compiles and enforces the occurrence boundary", (t) => {
  if (!host) {
    t.skip("set ADHDICE_SQL_COMPILE_PGHOST to run the disposable local PostgreSQL tracking regression");
    return;
  }
  assert.ok(host.startsWith("/") || ["localhost", "127.0.0.1", "::1"].includes(host));

  const scratch = mkdtempSync(join(tmpdir(), "adhdice-tracking-71385-"));
  const database = `adhdice_tracking_71385_${process.pid}_${Date.now()}`;
  const fixturePath = join(scratch, "fixture.sql");
  const verificationPath = join(scratch, "verification.sql");
  const fixtureSetup = `
create schema auth;
create table auth.users (id uuid primary key);
create publication supabase_realtime;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`;
const fixture = `
create table public.tracking_test_assertions (sequence_no integer primary key, label text not null, ok boolean not null);
insert into auth.users(id) values ('${userId}');
insert into public.adhdice_achievement_profiles(
  user_id, activation_operation_id, activated_at, catalog_version, rules_version,
  launch_mastery_version, timezone, logical_day_start
) values (
  '${userId}', '00000000-0000-4000-8000-000000000011', now() - interval '1 day',
  'catalog-test', 'rules-test', 'mastery-test', 'UTC', '00:00'
);
insert into public.adhdice_clean_tasks(id, user_id, title, status, parent_task_id)
values
  ('${parentId}', '${userId}', 'Parent', 'pending', null),
  ('${childId}', '${userId}', 'Child', 'pending', '${parentId}');
set_config('request.jwt.claim.sub', '${userId}', false);

insert into public.adhdice_task_history_facts(
  id, user_id, entity_id, entity_kind, logical_date, outcome, event_kind,
  provenance_kind, actor_kind, actor_id, source, logical_day_settings_revision,
  timezone, day_start_time, command_id, idempotence_identity
) values (
  '${childHistoryId}', '${userId}', '${childId}', 'step', current_date,
  'done', 'explicit_outcome', 'user', 'user', '${userId}', 'compile-test', 1,
  'UTC', '00:00', '00000000-0000-4000-8000-000000000211', 'tracking-child'
);
insert into public.tracking_test_assertions(sequence_no, label, ok)
select 1, 'included child history qualifies before exclusion', is_currently_qualifying
from public.adhdice_achievement_occurrences
where source_kind = 'task_history' and source_id = '${childHistoryId}';

insert into public.adhdice_task_reward_entitlements(
  id, user_id, entity_id, entity_kind, logical_date, reward_program_version,
  canonical_history_id, reward_units_snapshot, canonical_command_id,
  canonical_event_identity, outcome_snapshot, eligibility_kind,
  entitlement_source_kind, state
) values (
  '${entitlementId}', '${userId}', '${parentId}', 'parent', current_date,
  'reward-v1', null, 2, '00000000-0000-4000-8000-000000000311',
  'tracking-entitlement', 'done', 'handled_success', 'runtime_command', 'pending'
);

select public.adhdice_set_task_tracking_exclusion('${parentId}', true);
insert into public.tracking_test_assertions(sequence_no, label, ok)
select 2, 'excluded ancestor dequalifies existing child evidence', not is_currently_qualifying
from public.adhdice_achievement_occurrences
where source_kind = 'task_history' and source_id = '${childHistoryId}';
insert into public.tracking_test_assertions(sequence_no, label, ok)
select 3, 'excluded ancestor dequalifies Step-set evidence', bool_and(not is_currently_qualifying)
from public.adhdice_achievement_occurrences
where source_kind = 'step_set' and root_parent_id = '${parentId}';
insert into public.tracking_test_assertions(sequence_no, label, ok)
select 4, 'excluded ancestor blocks pending reward', state = 'blocked'
from public.adhdice_task_reward_entitlements where id = '${entitlementId}';
insert into public.tracking_test_assertions(sequence_no, label, ok)
select 5, 'progress excludes dequalified child evidence', current_value = 0
from public.adhdice_achievement_progress
where user_id = '${userId}' and track_id = 'first_step';

insert into public.adhdice_task_history_facts(
  id, user_id, entity_id, entity_kind, logical_date, outcome, event_kind,
  provenance_kind, actor_kind, actor_id, source, logical_day_settings_revision,
  timezone, day_start_time, command_id, idempotence_identity
) values (
  '${parentHistoryId}', '${userId}', '${parentId}', 'parent', current_date + 1,
  'done', 'explicit_outcome', 'user', 'user', '${userId}', 'compile-test', 1,
  'UTC', '00:00', '00000000-0000-4000-8000-000000000212', 'tracking-parent'
);

insert into public.adhdice_focus_sessions(
  id, user_id, title_snapshot, focus_type_snapshot, session_date, duration_seconds
) values ('${focusId}', '${userId}', 'Focus', 'focus', current_date, 600);
insert into public.tracking_test_assertions(sequence_no, label, ok)
select 6, 'excluded parent history is never qualifying', not is_currently_qualifying
from public.adhdice_achievement_occurrences
where source_kind = 'task_history' and source_id = '${parentHistoryId}';
insert into public.tracking_test_assertions(sequence_no, label, ok)
select 7, 'focus occurrence remains qualifying', is_currently_qualifying
from public.adhdice_achievement_occurrences
where source_kind = 'focus_session' and source_id = '${focusId}';

select public.adhdice_set_task_tracking_exclusion('${parentId}', false);
insert into public.tracking_test_assertions(sequence_no, label, ok)
select 8, 're-inclusion restores canonical child history', is_currently_qualifying
from public.adhdice_achievement_occurrences
where source_kind = 'task_history' and source_id = '${childHistoryId}';
insert into public.tracking_test_assertions(sequence_no, label, ok)
select 9, 're-inclusion restores Step-set qualification', bool_and(is_currently_qualifying)
from public.adhdice_achievement_occurrences
where source_kind = 'step_set' and root_parent_id = '${parentId}';
select public.adhdice_set_task_tracking_exclusion('${parentId}', true);
select public.adhdice_set_task_tracking_exclusion('${childId}', false);
insert into public.tracking_test_assertions(sequence_no, label, ok)
select 10, 'excluded ancestor prevents child requalification', not is_currently_qualifying
from public.adhdice_achievement_occurrences
where source_kind = 'task_history' and source_id = '${childHistoryId}';
insert into public.tracking_test_assertions(sequence_no, label, ok)
select 11, 'excluded ancestor prevents Step-set requalification', bool_and(not is_currently_qualifying)
from public.adhdice_achievement_occurrences
where source_kind = 'step_set' and root_parent_id = '${parentId}';
`;
  const verification = `
select label || ':' || ok from public.tracking_test_assertions order by sequence_no;
select
  not has_function_privilege('authenticated', 'public.adhdice_task_effectively_excluded_from_tracking(uuid, uuid)', 'execute'),
  exists (select 1 from pg_trigger where tgname = 'adhdice_guard_tracking_excluded_achievement_occurrence' and not tgenabled = 'D'),
  exists (select 1 from pg_trigger where tgname = 'adhdice_guard_tracking_excluded_achievement_occurrence' and pg_get_triggerdef(oid) ilike '%BEFORE%');
`;

  try {
    run(createdb, [...utilityConnectionArgs(), database]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1"], fixtureSetup);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", join(repositoryRoot, "supabase/schema.sql")]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", join(repositoryRoot, "supabase/patch_task_permanent_tombstones_7_9_54.sql")]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", join(repositoryRoot, "supabase/add_task_state_canonical_schema.sql")]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", join(repositoryRoot, "supabase/add_pending_reward_dice.sql")]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", join(repositoryRoot, "supabase/add_canonical_reward_entitlement_bridge.sql")]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", join(repositoryRoot, "supabase/patch_task_tracking_exclusion_7_13_85.sql")]);
    writeFileSync(fixturePath, fixture);
    writeFileSync(verificationPath, verification);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", fixturePath]);
    const result = run(psql, [...connectionArgs(database), "-At", "-v", "ON_ERROR_STOP=1", "-f", verificationPath])
      .trim()
      .split("|");
    assert.deepEqual(result, [
      "included child history qualifies before exclusion:t",
      "excluded ancestor dequalifies existing child evidence:t",
      "excluded ancestor dequalifies Step-set evidence:t",
      "excluded ancestor blocks pending reward:t",
      "progress excludes dequalified child evidence:t",
      "excluded parent history is never qualifying:t",
      "focus occurrence remains qualifying:t",
      "re-inclusion restores canonical child history:t",
      "re-inclusion restores Step-set qualification:t",
      "excluded ancestor prevents child requalification:t",
      "excluded ancestor prevents Step-set requalification:t",
      "t|t|t",
    ]);
  } finally {
    try {
      run(dropdb, ["--if-exists", ...utilityConnectionArgs(), database]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
});
