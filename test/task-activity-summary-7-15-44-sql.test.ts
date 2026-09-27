import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

const repositoryRoot = process.cwd();
const patch = readFileSync(join(repositoryRoot, "supabase/patch_task_activity_summary_7_15_44.sql"), "utf8");
const psql = process.env.ADHDICE_SQL_COMPILE_PSQL_BIN ?? "psql";
const psqlDirectory = dirname(psql);
const createdb = join(psqlDirectory, "createdb");
const dropdb = join(psqlDirectory, "dropdb");
const host = process.env.ADHDICE_SQL_COMPILE_PGHOST;
const port = process.env.ADHDICE_SQL_COMPILE_PGPORT ?? "5432";

const userId = "00000000-0000-4000-8000-000000000001";
const secondUserId = "00000000-0000-4000-8000-000000000002";
const excludedParentId = "00000000-0000-4000-8000-000000000101";
const excludedChildId = "00000000-0000-4000-8000-000000000102";
const excludedStepId = "00000000-0000-4000-8000-000000000103";
const normalId = "00000000-0000-4000-8000-000000000104";
const normalTwoId = "00000000-0000-4000-8000-000000000105";
const missingAncestorTaskId = "00000000-0000-4000-8000-000000000106";
const cycleOneId = "00000000-0000-4000-8000-000000000107";
const cycleTwoId = "00000000-0000-4000-8000-000000000108";
const secondUserTaskId = "00000000-0000-4000-8000-000000000109";

function run(command: string, args: string[], input?: string) {
  return execFileSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    input,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
}

function connectionArgs(database: string) {
  return ["-h", host!, "-p", port, "-d", database];
}

function utilityConnectionArgs() {
  return ["-h", host!, "-p", port];
}

test("7.15.44 source patch declares the compact invoker-only contract", () => {
  assert.match(patch, /create or replace function public\.adhdice_get_task_activity_summary\(\s*p_as_of date\s*\)/i);
  assert.match(patch, /returns jsonb[\s\S]*language plpgsql[\s\S]*stable[\s\S]*security invoker/i);
  assert.match(patch, /auth\.uid\(\)/i);
  assert.match(patch, /adhdice_task_history_sync_state[\s\S]*same stable function snapshot/i);
  assert.match(patch, /revoke all on function public\.adhdice_get_task_activity_summary\(date\)\s*from public, anon, authenticated/i);
  assert.match(patch, /grant execute on function public\.adhdice_get_task_activity_summary\(date\)\s*to authenticated/i);
  assert.match(patch, /'contract_version', 'task-activity-summary-v1'/i);
  assert.match(patch, /'tracked_recent_completed_counts'/i);
  assert.match(patch, /generate_series\(0, 6\)/i);
  assert.doesNotMatch(patch, /'history'\s*,/i);
});

test("7.15.44 RPC enforces owner isolation, orphan inclusion, exclusions, fence, and seven-date output", (t) => {
  if (!host) {
    t.skip("set ADHDICE_SQL_COMPILE_PGHOST to run the disposable local PostgreSQL Task activity summary integration regression");
    return;
  }
  assert.ok(host.startsWith("/") || ["localhost", "127.0.0.1", "::1"].includes(host));

  const scratch = mkdtempSync(join(tmpdir(), "adhdice-task-activity-summary-"));
  const database = `adhdice_task_activity_summary_${process.pid}_${Date.now()}`;
  const setupPath = join(scratch, "setup.sql");
  const fixturePath = join(scratch, "fixture.sql");
  const verificationPath = join(scratch, "verification.sql");
  const benchmarkPath = join(scratch, "benchmark.sql");
  const setup = `
create schema auth;
create table auth.users (id uuid primary key);
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create function auth.uid() returns uuid language sql stable as $fn$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$fn$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to authenticated;

create table public.adhdice_clean_tasks (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  parent_task_id uuid,
  exclude_from_tracking boolean not null default false,
  permanently_deleted_at timestamptz
);
alter table public.adhdice_clean_tasks enable row level security;
create policy "activity summary task owner read" on public.adhdice_clean_tasks
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.adhdice_clean_tasks to authenticated;

create table public.adhdice_task_history_facts (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  entity_id uuid not null,
  logical_date date not null,
  outcome text not null
);
alter table public.adhdice_task_history_facts enable row level security;
create policy "activity summary history owner read" on public.adhdice_task_history_facts
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.adhdice_task_history_facts to authenticated;

create table public.adhdice_task_history_sync_state (
  user_id uuid primary key references auth.users(id),
  current_revision bigint not null,
  sync_epoch uuid not null,
  protocol_version text not null
);
alter table public.adhdice_task_history_sync_state enable row level security;
create policy "activity summary sync owner read" on public.adhdice_task_history_sync_state
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.adhdice_task_history_sync_state to authenticated;

insert into auth.users(id) values ('${userId}'), ('${secondUserId}');
insert into public.adhdice_task_history_sync_state(user_id, current_revision, sync_epoch, protocol_version) values
  ('${userId}', 700, '00000000-0000-4000-8000-000000000701', 'task-history-sync-v1'),
  ('${secondUserId}', 17, '00000000-0000-4000-8000-000000000702', 'task-history-sync-v1');
`;
  const fixture = `
insert into public.adhdice_clean_tasks(id, user_id, parent_task_id, exclude_from_tracking)
values
  ('${excludedParentId}', '${userId}', null, true),
  ('${excludedChildId}', '${userId}', '${excludedParentId}', false),
  ('${excludedStepId}', '${userId}', null, true),
  ('${normalId}', '${userId}', null, false),
  ('${normalTwoId}', '${userId}', null, false),
  ('${missingAncestorTaskId}', '${userId}', '00000000-0000-4000-8000-000000000199', false),
  ('${cycleOneId}', '${userId}', '${cycleTwoId}', false),
  ('${cycleTwoId}', '${userId}', '${cycleOneId}', false),
  ('${secondUserTaskId}', '${secondUserId}', null, false);

insert into public.adhdice_task_history_facts(id, user_id, entity_id, logical_date, outcome)
values
  ('00000000-0000-4000-8000-000000000201', '${userId}', '${excludedParentId}', '2026-09-14', 'done'),
  ('00000000-0000-4000-8000-000000000202', '${userId}', '${excludedChildId}', '2026-09-15', 'done'),
  ('00000000-0000-4000-8000-000000000203', '${userId}', '${excludedStepId}', '2026-09-16', 'complete'),
  ('00000000-0000-4000-8000-000000000204', '${userId}', '00000000-0000-4000-8000-000000000299', '2026-09-13', 'done'),
  ('00000000-0000-4000-8000-000000000205', '${userId}', '${missingAncestorTaskId}', '2026-09-14', 'done'),
  ('00000000-0000-4000-8000-000000000206', '${userId}', '${normalId}', '2026-09-14', 'done'),
  ('00000000-0000-4000-8000-000000000207', '${userId}', '${normalId}', '2026-09-15', 'missed'),
  ('00000000-0000-4000-8000-000000000208', '${userId}', '${normalId}', '2026-09-16', 'done'),
  ('00000000-0000-4000-8000-000000000209', '${userId}', '${normalTwoId}', '2026-09-16', 'missed'),
  ('00000000-0000-4000-8000-000000000210', '${userId}', '${normalId}', '2026-09-17', 'did_my_best'),
  ('00000000-0000-4000-8000-000000000211', '${userId}', '${normalId}', '2026-09-18', 'complete'),
  ('00000000-0000-4000-8000-000000000212', '${userId}', '${normalId}', '2026-09-19', 'done'),
  ('00000000-0000-4000-8000-000000000213', '${userId}', '${excludedParentId}', '2026-09-20', 'done'),
  ('00000000-0000-4000-8000-000000000214', '${userId}', '${excludedStepId}', '2026-09-20', 'complete'),
  ('00000000-0000-4000-8000-000000000215', '${secondUserId}', '${secondUserTaskId}', '2026-09-20', 'done');
`;
  const benchmark = `
insert into public.adhdice_task_history_facts(id, user_id, entity_id, logical_date, outcome)
select
  md5('benchmark-row-' || series)::uuid,
  '${userId}',
  md5('benchmark-entity-' || series)::uuid,
  date '2030-01-01' + (series % 180),
  case series % 4
    when 0 then 'done'
    when 1 then 'did_my_best'
    when 2 then 'missed'
    else 'delayed'
  end
from generate_series(1, 17800) as generated(series);

select set_config('request.jwt.claim.sub', '${userId}', false);
set role authenticated;
explain (analyze, format text)
select public.adhdice_get_task_activity_summary('2030-06-30');
`;
  const verification = `
select set_config('request.jwt.claim.sub', '${userId}', false);
set role authenticated;
with summary as (select public.adhdice_get_task_activity_summary('2026-09-20') as value)
select
  value->>'history_current_revision' = '700',
  value->>'history_sync_epoch' = '00000000-0000-4000-8000-000000000701',
  value->>'history_protocol_version' = 'task-history-sync-v1',
  (value->'tracked'->>'logged_days')::integer = 7,
  (value->'tracked'->>'completed_days')::integer = 6,
  (value->'tracked'->>'missed_days')::integer = 1,
  (value->'tracked'->>'done_rate')::integer = 86,
  (value->'tracked'->>'current_streak')::integer = 4,
  (value->'tracked'->>'best_streak')::integer = 4,
  jsonb_array_length(value->'tracked_recent_completed_counts') = 7,
  (value->'tracked_recent_completed_counts'->0->>'logical_date') = '2026-09-14',
  (value->'tracked_recent_completed_counts'->0->>'completed_count')::integer = 2,
  (value->'tracked_recent_completed_counts'->6->>'logical_date') = '2026-09-20',
  (value->'tracked_recent_completed_counts'->6->>'completed_count')::integer = 0,
  (value->>'unfiltered_today_completed_count')::integer = 2,
  not (value ? 'history'),
  has_function_privilege('anon', 'public.adhdice_get_task_activity_summary(date)', 'execute') = false
from summary;

select set_config('request.jwt.claim.sub', '${secondUserId}', false);
select
  (summary->'tracked'->>'logged_days')::integer = 1
  and (summary->'tracked'->>'completed_days')::integer = 1
  and (summary->>'unfiltered_today_completed_count')::integer = 1
from (select public.adhdice_get_task_activity_summary('2026-09-20') as summary) owner_summary;
`;

  try {
    run(createdb, [...utilityConnectionArgs(), database]);
    writeFileSync(setupPath, setup);
    writeFileSync(fixturePath, fixture);
    writeFileSync(verificationPath, verification);
    writeFileSync(benchmarkPath, benchmark);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", setupPath]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", join(repositoryRoot, "supabase/patch_task_activity_summary_7_15_44.sql")]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", fixturePath]);
    const benchmarkOutput = run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", benchmarkPath]);
    const executionLine = benchmarkOutput.split("\n").find((line) => line.includes("Execution Time:"));
    assert.ok(executionLine, "EXPLAIN ANALYZE should report execution time");
    console.info(`[task-activity-summary] local live-shaped EXPLAIN ANALYZE ${executionLine.trim()} rows=17800`);
    const result = run(psql, [...connectionArgs(database), "-At", "-v", "ON_ERROR_STOP=1", "-f", verificationPath])
      .trim()
      .split("\n")
      .filter(Boolean);
    assert.deepEqual(result, [
      userId,
      "SET",
      "t|t|t|t|t|t|t|t|t|t|t|t|t|t|t|t|t",
      secondUserId,
      "t",
    ]);
  } finally {
    try {
      run(dropdb, ["--if-exists", "--force", ...utilityConnectionArgs(), database]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
});
