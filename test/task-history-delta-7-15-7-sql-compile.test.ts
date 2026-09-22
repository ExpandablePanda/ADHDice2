import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

const repositoryRoot = process.cwd();
const migration = readFileSync(join(repositoryRoot, "supabase/add_task_history_delta_sync_7_15_7.sql"), "utf8");
const metadataMigration = readFileSync(join(repositoryRoot, "supabase/add_task_history_sync_metadata_7_15_6.sql"), "utf8");
const psql = process.env.ADHDICE_SQL_COMPILE_PSQL_BIN ?? "psql";
const psqlDirectory = dirname(psql);
const createdb = join(psqlDirectory, "createdb");
const dropdb = join(psqlDirectory, "dropdb");
const host = process.env.ADHDICE_SQL_COMPILE_PGHOST;
const port = process.env.ADHDICE_SQL_COMPILE_PGPORT ?? "5432";

function run(database: string, file: string, extraArgs: string[] = []) {
  return execFileSync(psql, ["-U", "postgres", "-h", host!, "-p", port, "-d", database, "-v", "ON_ERROR_STOP=1", ...extraArgs, "-f", file], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

test("7.15.7 delta RPC compiles and returns final canonical state under a revision fence", (t) => {
  if (!host) {
    t.skip("set ADHDICE_SQL_COMPILE_PGHOST to run the disposable local PostgreSQL delta RPC integration regression");
    return;
  }
  assert.ok(host.startsWith("/") || ["localhost", "127.0.0.1", "::1"].includes(host));
  const scratch = mkdtempSync(join(tmpdir(), "adhdice-history-delta-"));
  const database = `adhdice_history_delta_${process.pid}_${Date.now()}`;
  const setup = join(scratch, "setup.sql");
  const changes = join(scratch, "changes.sql");
  const verify = join(scratch, "verify.sql");
  try {
    execFileSync(createdb, ["-U", "postgres", "-h", host, "-p", port, database], { cwd: repositoryRoot, stdio: "ignore" });
    writeFileSync(setup, `create schema auth;
create extension if not exists pgcrypto;
create table auth.users (id uuid primary key);
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create function auth.uid() returns uuid language sql stable as $fn$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$fn$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create table public.adhdice_task_history_facts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null,
  logical_date date not null,
  revision bigint not null default 1,
  source text not null,
  updated_at timestamptz not null default now()
);
alter table public.adhdice_task_history_facts enable row level security;
create policy "test owner can read facts" on public.adhdice_task_history_facts
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.adhdice_task_history_facts to authenticated;
insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');
`);
    execFileSync(psql, ["-U", "postgres", "-h", host, "-p", port, "-d", database, "-v", "ON_ERROR_STOP=1", "-f", setup], { cwd: repositoryRoot, stdio: "ignore" });
    const metadataPath = join(scratch, "metadata.sql");
    const migrationPath = join(scratch, "delta.sql");
    writeFileSync(metadataPath, metadataMigration);
    writeFileSync(migrationPath, migration);
    run(database, metadataPath);
    run(database, migrationPath);

    writeFileSync(changes, `insert into public.adhdice_task_history_facts(id, user_id, entity_id, logical_date, source)
values ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', '2026-09-20', 'a');
update public.adhdice_task_history_facts set source = 'a-updated', revision = 2 where id = '00000000-0000-4000-8000-000000000011';
insert into public.adhdice_task_history_facts(id, user_id, entity_id, logical_date, source)
values ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', '2026-09-21', 'b');
update public.adhdice_task_history_facts set source = 'b-updated', revision = 2 where id = '00000000-0000-4000-8000-000000000012';
delete from public.adhdice_task_history_facts where id = '00000000-0000-4000-8000-000000000011';
`);
    run(database, changes);

    writeFileSync(verify, `select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
set role authenticated;
select (public.adhdice_get_task_history_delta(
  'task-history-sync-v1',
  (select sync_epoch from public.adhdice_task_history_sync_state where user_id = auth.uid()),
  0
)->>'toRevision')::bigint = 5;
select jsonb_array_length((public.adhdice_get_task_history_delta(
  'task-history-sync-v1',
  (select sync_epoch from public.adhdice_task_history_sync_state where user_id = auth.uid()),
  0
))->'changes') = 2;
select (public.adhdice_get_task_history_delta(
  'task-history-sync-v1',
  (select sync_epoch from public.adhdice_task_history_sync_state where user_id = auth.uid()),
  0
)->'changes'->0->'fact'->>'source') = 'b-updated';
select has_function_privilege('authenticated', 'public.adhdice_get_task_history_delta(text,uuid,bigint)', 'execute');
select not has_table_privilege('authenticated', 'public.adhdice_task_history_changes', 'insert,update,delete');
`);
    const result = run(database, verify, ["-At"]).trim().split("\n");
    assert.deepEqual(result, ["00000000-0000-4000-8000-000000000001", "SET", "t", "t", "t", "t", "t"]);
  } finally {
    try {
      execFileSync(dropdb, ["--if-exists", "--force", "-U", "postgres", "-h", host, "-p", port, database], { cwd: repositoryRoot, stdio: "ignore" });
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
});
