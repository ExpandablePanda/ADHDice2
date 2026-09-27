import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

const repositoryRoot = process.cwd();
const patch = readFileSync(join(repositoryRoot, "supabase/patch_task_schedule_boundaries_latest_7_15_54.sql"), "utf8");
const psql = process.env.ADHDICE_SQL_COMPILE_PSQL_BIN ?? "psql";
const psqlDirectory = dirname(psql);
const createdb = join(psqlDirectory, "createdb");
const dropdb = join(psqlDirectory, "dropdb");
const host = process.env.ADHDICE_SQL_COMPILE_PGHOST;
const port = process.env.ADHDICE_SQL_COMPILE_PGPORT ?? "5432";

const userId = "00000000-0000-4000-8000-000000000001";
const secondUserId = "00000000-0000-4000-8000-000000000002";
const taskOneId = "00000000-0000-4000-8000-000000000101";
const taskTwoId = "00000000-0000-4000-8000-000000000102";
const secondUserTaskId = "00000000-0000-4000-8000-000000000201";
const oldestBoundaryId = "00000000-0000-4000-8000-000000000301";
const latestBoundaryId = "00000000-0000-4000-8000-000000000302";
const tiedBoundaryId = "00000000-0000-4000-8000-000000000303";
const taskTwoBoundaryId = "00000000-0000-4000-8000-000000000304";
const secondUserBoundaryId = "00000000-0000-4000-8000-000000000305";

function runCommand(command: string, args: string[], input?: string) {
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

test("7.15.54 source patch declares the bulk invoker-only latest-boundary contract", () => {
  assert.match(patch, /create or replace function public\.adhdice_get_latest_task_schedule_boundaries\(\s*p_entity_ids uuid\[\]\s*\)/i);
  assert.match(patch, /returns setof public\.adhdice_task_schedule_boundaries[\s\S]*language plpgsql[\s\S]*stable[\s\S]*security invoker/i);
  assert.match(patch, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(patch, /boundary\.user_id = v_user_id/i);
  assert.match(patch, /select distinct on \(boundary\.entity_id\)/i);
  assert.match(patch, /order by boundary\.entity_id, boundary\.boundary_sequence desc, boundary\.id asc/i);
  assert.match(patch, /revoke all on function public\.adhdice_get_latest_task_schedule_boundaries\(uuid\[\]\)\s*from public, anon, authenticated/i);
  assert.match(patch, /grant execute on function public\.adhdice_get_latest_task_schedule_boundaries\(uuid\[\]\)\s*to authenticated/i);
});

test("7.15.54 RPC returns one newest boundary per requested entity and enforces owner scope", (t) => {
  if (!host) {
    t.skip("set ADHDICE_SQL_COMPILE_PGHOST to run the disposable local PostgreSQL latest-boundary integration regression");
    return;
  }
  assert.ok(host.startsWith("/") || ["localhost", "127.0.0.1", "::1"].includes(host));

  const scratch = mkdtempSync(join(tmpdir(), "adhdice-task-schedule-boundaries-"));
  const database = `adhdice_task_schedule_boundaries_${process.pid}_${Date.now()}`;
  const setupPath = join(scratch, "setup.sql");
  const fixturePath = join(scratch, "fixture.sql");
  const verificationPath = join(scratch, "verification.sql");
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

create table public.adhdice_task_schedule_boundaries (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  entity_id uuid not null,
  boundary_sequence bigint not null,
  payload text not null
);
create index adhdice_task_schedule_boundaries_latest_idx
  on public.adhdice_task_schedule_boundaries (user_id, entity_id, boundary_sequence desc);
alter table public.adhdice_task_schedule_boundaries enable row level security;
create policy "latest boundary owner read"
  on public.adhdice_task_schedule_boundaries
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.adhdice_task_schedule_boundaries to authenticated;

insert into auth.users(id) values ('${userId}'), ('${secondUserId}');
`;
  const fixture = `
insert into public.adhdice_task_schedule_boundaries(id, user_id, entity_id, boundary_sequence, payload)
values
  ('${oldestBoundaryId}', '${userId}', '${taskOneId}', 1, 'oldest'),
  ('${latestBoundaryId}', '${userId}', '${taskOneId}', 7, 'latest'),
  ('${tiedBoundaryId}', '${userId}', '${taskOneId}', 7, 'tie'),
  ('${taskTwoBoundaryId}', '${userId}', '${taskTwoId}', 2, 'task-two'),
  ('${secondUserBoundaryId}', '${secondUserId}', '${secondUserTaskId}', 99, 'other-user');
`;
  const verification = `
select set_config('request.jwt.claim.sub', '${userId}', false);
set role authenticated;
with rows as (
  select *
    from public.adhdice_get_latest_task_schedule_boundaries(
      array['${taskOneId}', '${taskTwoId}', '${secondUserTaskId}']::uuid[]
    )
)
select
  count(*) = 2
  and count(distinct entity_id) = 2
  and bool_or(id = '${latestBoundaryId}'::uuid and boundary_sequence = 7 and payload = 'latest')
  and not bool_or(id = '${oldestBoundaryId}'::uuid)
  and not bool_or(id = '${tiedBoundaryId}'::uuid)
from rows;

select
  has_function_privilege('anon', 'public.adhdice_get_latest_task_schedule_boundaries(uuid[])', 'execute') = false;

select set_config('request.jwt.claim.sub', '${secondUserId}', false);
with rows as (
  select *
    from public.adhdice_get_latest_task_schedule_boundaries(
      array['${taskOneId}', '${secondUserTaskId}']::uuid[]
    )
)
select
  count(*) = 1
  and bool_or(id = '${secondUserBoundaryId}'::uuid and boundary_sequence = 99)
from rows;
`;

  try {
    runCommand(createdb, [...utilityConnectionArgs(), database]);
    writeFileSync(setupPath, setup);
    writeFileSync(fixturePath, fixture);
    writeFileSync(verificationPath, verification);
    runCommand(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", setupPath]);
    runCommand(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", join(repositoryRoot, "supabase/patch_task_schedule_boundaries_latest_7_15_54.sql")]);
    runCommand(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", fixturePath]);
    const result = runCommand(psql, [...connectionArgs(database), "-At", "-v", "ON_ERROR_STOP=1", "-f", verificationPath])
      .trim()
      .split("\n")
      .filter(Boolean);
    assert.deepEqual(result, [
      userId,
      "SET",
      "t",
      "t",
      secondUserId,
      "t",
    ]);
  } finally {
    try {
      runCommand(dropdb, ["--if-exists", "--force", ...utilityConnectionArgs(), database]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
});
