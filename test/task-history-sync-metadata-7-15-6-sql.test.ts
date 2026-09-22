import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/add_task_history_sync_metadata_7_15_6.sql", import.meta.url),
  "utf8",
);
const canonicalSchema = readFileSync(
  new URL("../supabase/add_task_state_canonical_schema.sql", import.meta.url),
  "utf8",
);
const databaseTypes = readFileSync(new URL("../src/lib/database.types.ts", import.meta.url), "utf8");
const commandRpc = readFileSync(new URL("../supabase/add_task_state_command_rpc.sql", import.meta.url), "utf8");
const automaticMissedPatch = readFileSync(
  new URL("../supabase/patch_task_state_auto_missed_history_copy_7_9_31.sql", import.meta.url),
  "utf8",
);
const scheduleAutoMissedPatch = readFileSync(
  new URL("../supabase/patch_task_state_schedule_auto_missed_7_11_73.sql", import.meta.url),
  "utf8",
);
const historyCopyMigration = readFileSync(
  new URL("../supabase/migrate_legacy_history_copy_7_9_31.sql", import.meta.url),
  "utf8",
);
const resetSql = readFileSync(new URL("../supabase/operator_fresh_start_reset_7_9_50.sql", import.meta.url), "utf8");
const retirementSql = readFileSync(new URL("../supabase/retire_goal_task_type_7_13_61.sql", import.meta.url), "utf8");

const triggerFunction = migration.match(
  /create or replace function public\.adhdice_capture_task_history_sync_change\(\)[\s\S]*?as \$function\$[\s\S]*?\$function\$;/i,
)?.[0] ?? "";

test("7.15.6 Task History sync metadata has the database-owned schema contract", () => {
  for (const source of [migration, canonicalSchema]) {
    assert.match(source, /create table if not exists public\.adhdice_task_history_sync_state/i);
    assert.match(source, /user_id uuid primary key references auth\.users\(id\) on delete cascade/i);
    assert.match(source, /current_revision bigint not null default 0/i);
    assert.match(source, /check \(current_revision >= 0\)/i);
    assert.match(source, /sync_epoch uuid not null default gen_random_uuid\(\)/i);
    assert.match(source, /protocol_version text not null default 'task-history-sync-v1'/i);
    assert.match(source, /check \(protocol_version = 'task-history-sync-v1'\)/i);
    assert.match(source, /create table if not exists public\.adhdice_task_history_changes/i);
    assert.match(source, /sequence bigint not null check \(sequence >= 1\)/i);
    assert.match(source, /history_fact_id uuid not null/i);
    assert.match(source, /entity_id uuid not null/i);
    assert.match(source, /logical_date date not null/i);
    assert.match(source, /operation text not null check \(operation in \('upsert', 'delete'\)\)/i);
    assert.match(source, /row_revision bigint/i);
    assert.match(source, /primary key \(user_id, sequence\)/i);
    assert.match(source, /create index if not exists adhdice_task_history_changes_history_fact_sequence_idx[\s\S]*\(user_id, history_fact_id, sequence\)/i);
    assert.match(source, /from auth\.users users[\s\S]*on conflict \(user_id\) do nothing/i);
    assert.match(source, /select users\.id, 0, gen_random_uuid\(\), 'task-history-sync-v1'/i);
  }

  assert.doesNotMatch(migration, /protocol_version[^\n]*7\.15\.6/i);
  assert.match(databaseTypes, /export type TaskHistorySyncState[\s\S]*protocol_version: "task-history-sync-v1"/i);
  assert.match(databaseTypes, /export type TaskHistoryChange[\s\S]*operation: "upsert" \| "delete"/i);
  assert.match(databaseTypes, /adhdice_task_history_sync_state:[\s\S]*Row: TaskHistorySyncState/i);
  assert.match(databaseTypes, /adhdice_task_history_changes:[\s\S]*Row: TaskHistoryChange/i);
});

test("the trigger is the direct INSERT/UPDATE/DELETE coverage authority", () => {
  assert.match(triggerFunction, /returns trigger[\s\S]*language plpgsql[\s\S]*security definer/i);
  assert.match(triggerFunction, /set search_path = ''/i);
  assert.match(triggerFunction, /tg_op = 'INSERT'|tg_op = 'DELETE'/i);
  assert.match(triggerFunction, /tg_op = 'UPDATE'/i);
  assert.match(migration, /create trigger adhdice_capture_task_history_sync_change[\s\S]*after insert or update or delete[\s\S]*on public\.adhdice_task_history_facts/i);
  assert.match(canonicalSchema, /create trigger adhdice_capture_task_history_sync_change[\s\S]*after insert or update or delete[\s\S]*on public\.adhdice_task_history_facts/i);
  assert.match(migration, /revoke all on function public\.adhdice_capture_task_history_sync_change\(\) from public, anon, authenticated/i);
});

test("insert, replacement update, delete, identity moves, ordering, and rollback are encoded in the trigger", () => {
  assert.match(triggerFunction, /insert into public\.adhdice_task_history_sync_state[\s\S]*on conflict \(user_id\) do nothing/i);
  assert.match(triggerFunction, /current_revision \+ 1[\s\S]*for update/i);
  assert.match(triggerFunction, /set current_revision = v_sequence/i);
  assert.match(triggerFunction, /insert into public\.adhdice_task_history_changes/i);
  assert.match(triggerFunction, /'upsert', new\.revision/i);
  assert.match(triggerFunction, /'delete', old\.revision/i);
  assert.match(triggerFunction, /old\.user_id[\s\S]*old\.id[\s\S]*old\.entity_id[\s\S]*old\.logical_date/i);
  assert.match(triggerFunction, /new\.user_id[\s\S]*new\.id[\s\S]*new\.entity_id[\s\S]*new\.logical_date/i);
  assert.match(triggerFunction, /old\.user_id is distinct from new\.user_id/);
  assert.match(triggerFunction, /old\.id is distinct from new\.id/);
  assert.match(triggerFunction, /old\.entity_id is distinct from new\.entity_id/);
  assert.match(triggerFunction, /old\.logical_date is distinct from new\.logical_date/);
  assert.match(triggerFunction, /pg_catalog\.to_jsonb\(old\) - 'updated_at'[\s\S]*pg_catalog\.to_jsonb\(new\) - 'updated_at'/i);
  assert.match(triggerFunction, /auth\.users users where users\.id = old\.user_id/i);
  assert.match(triggerFunction, /auth\.users users where users\.id = old\.user_id/i);
});

test("all known History mutation paths remain covered without writer-specific instrumentation", () => {
  assert.match(commandRpc, /delete from public\.adhdice_task_history_facts[\s\S]*clear_outcome/i);
  assert.match(commandRpc, /insert into public\.adhdice_task_history_facts/i);
  assert.match(commandRpc, /reconcile_rollover/);
  assert.match(automaticMissedPatch, /delete from public\.adhdice_task_history_facts/i);
  assert.match(automaticMissedPatch, /insert into public\.adhdice_task_history_facts/i);
  assert.match(scheduleAutoMissedPatch, /automatic History facts/i);
  assert.match(historyCopyMigration, /insert into public\.adhdice_task_history_facts/i);
  assert.match(resetSql, /delete from public\.adhdice_task_history_facts/i);
  assert.match(retirementSql, /delete from public\.adhdice_task_history_facts/i);
  assert.doesNotMatch(commandRpc, /adhdice_capture_task_history_sync_change/i);
  assert.doesNotMatch(automaticMissedPatch, /adhdice_capture_task_history_sync_change/i);
  assert.doesNotMatch(historyCopyMigration, /adhdice_capture_task_history_sync_change/i);
});

test("sync metadata is read-only to authenticated users and disappears with auth users", () => {
  for (const table of ["adhdice_task_history_sync_state", "adhdice_task_history_changes"]) {
    const tablePattern = new RegExp(`alter table public\\.${table} enable row level security`, "i");
    assert.match(migration, tablePattern);
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"));
    assert.match(migration, new RegExp(`grant select on table public\\.${table} to authenticated`, "i"));
    assert.match(migration, new RegExp(`on public\\.${table}[\\s\\S]*for select to authenticated[\\s\\S]*auth\\.uid\\(\\)[\\s\\S]*user_id`, "i"));
    assert.doesNotMatch(migration, new RegExp(`grant (?:insert|update|delete|all) on table public\\.${table} to authenticated`, "i"));
    assert.match(migration, new RegExp(`${table}[\\s\\S]*references auth\\.users\\(id\\) on delete cascade`, "i"));
  }
});

test("the forward migration is rerunnable and does not manufacture pre-ledger History events", () => {
  assert.match(migration, /begin;[\s\S]*commit;/i);
  assert.match(migration, /create table if not exists public\.adhdice_task_history_sync_state/i);
  assert.match(migration, /create table if not exists public\.adhdice_task_history_changes/i);
  assert.match(migration, /create index if not exists/i);
  assert.match(migration, /create or replace function/i);
  assert.match(migration, /drop trigger if exists/i);
  assert.match(migration, /on conflict \(user_id\) do nothing/i);
  assert.doesNotMatch(migration, /insert into public\.adhdice_task_history_changes[\s\S]*from public\.adhdice_task_history_facts/i);
});

const repositoryRoot = process.cwd();
const psql = process.env.ADHDICE_SQL_COMPILE_PSQL_BIN ?? "psql";
const psqlDirectory = dirname(psql);
const createdb = join(psqlDirectory, "createdb");
const dropdb = join(psqlDirectory, "dropdb");
const host = process.env.ADHDICE_SQL_COMPILE_PGHOST;
const port = process.env.ADHDICE_SQL_COMPILE_PGPORT ?? "5432";

function runFile(database: string, file: string): string {
  return execFileSync(psql, ["-U", "postgres", "-h", host!, "-p", port, "-d", database, "-v", "ON_ERROR_STOP=1", "-f", file], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

test("the installed trigger preserves state/ledger atomicity and account-cascade behavior", (t) => {
  if (!host) {
    t.skip("set ADHDICE_SQL_COMPILE_PGHOST to run the disposable local PostgreSQL History sync integration regression");
    return;
  }
  assert.ok(host.startsWith("/") || ["localhost", "127.0.0.1", "::1"].includes(host));

  const scratch = mkdtempSync(join(tmpdir(), "adhdice-history-sync-"));
  const database = `adhdice_history_sync_${process.pid}_${Date.now()}`;
  const fixture = join(scratch, "fixture.sql");
  const verification = join(scratch, "verification.sql");

  try {
    execFileSync(createdb, ["-U", "postgres", "-h", host, "-p", port, database], { cwd: repositoryRoot, stdio: "ignore" });
    writeFileSync(fixture, `create schema auth;
create extension if not exists pgcrypto;
create table auth.users (id uuid primary key);
create publication supabase_realtime;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create table public.adhdice_task_history_facts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null,
  logical_date date not null,
  revision bigint not null default 1,
  source text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, entity_id, logical_date)
);
create function public.adhdice_test_set_history_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = clock_timestamp(); return new; end $$;
create trigger adhdice_task_state_set_updated_at
  before update on public.adhdice_task_history_facts
  for each row execute function public.adhdice_test_set_history_updated_at();
insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');
`);
    execFileSync(psql, ["-U", "postgres", "-h", host, "-p", port, "-d", database, "-v", "ON_ERROR_STOP=1", "-f", fixture], { cwd: repositoryRoot, stdio: "ignore" });
    const migrationFile = join(scratch, "migration.sql");
    writeFileSync(migrationFile, migration);
    runFile(database, migrationFile);
    runFile(database, migrationFile);

    writeFileSync(fixture, `insert into public.adhdice_task_history_facts(
  id, user_id, entity_id, logical_date, source
) values (
  '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000010', '2026-09-20', 'fixture');
update public.adhdice_task_history_facts
   set source = 'fixture-updated', revision = revision + 1
 where id = '00000000-0000-4000-8000-000000000011';
update public.adhdice_task_history_facts set source = source
 where id = '00000000-0000-4000-8000-000000000011';
insert into public.adhdice_task_history_facts(id, user_id, entity_id, logical_date, source, revision)
values ('00000000-0000-4000-8000-000000000099', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', '2026-09-20', 'fixture-upsert', 3)
on conflict (user_id, entity_id, logical_date) do update
set source = excluded.source, revision = excluded.revision;
delete from public.adhdice_task_history_facts
 where id = '00000000-0000-4000-8000-000000000011';
begin;
insert into public.adhdice_task_history_facts(id, user_id, entity_id, logical_date, source)
values
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', '2026-09-21', 'fixture'),
  ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', '2026-09-22', 'fixture');
commit;
do $$ begin
  begin
    insert into public.adhdice_task_history_facts(id, user_id, entity_id, logical_date, source)
    values (
      '00000000-0000-4000-8000-000000000017', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', '2026-09-23', 'fixture');
    raise exception 'rollback sentinel';
  exception when others then null;
  end;
end $$;
`);
    runFile(database, fixture);

    writeFileSync(verification, `select current_revision = 6 from public.adhdice_task_history_sync_state where user_id = '00000000-0000-4000-8000-000000000001';
select count(*) = 6 from public.adhdice_task_history_changes where user_id = '00000000-0000-4000-8000-000000000001';
select array_agg(sequence order by sequence) = array[1, 2, 3, 4, 5, 6]::bigint[] from public.adhdice_task_history_changes where user_id = '00000000-0000-4000-8000-000000000001';
select array_agg(operation order by sequence) = array['upsert', 'upsert', 'upsert', 'delete', 'upsert', 'upsert']::text[] from public.adhdice_task_history_changes where user_id = '00000000-0000-4000-8000-000000000001';
select count(*) = 2 from public.adhdice_task_history_facts where user_id = '00000000-0000-4000-8000-000000000001';
select not has_table_privilege('anon', 'public.adhdice_task_history_sync_state', 'select,insert,update,delete');
select not has_table_privilege('authenticated', 'public.adhdice_task_history_sync_state', 'insert,update,delete');
select not has_function_privilege('authenticated', 'public.adhdice_capture_task_history_sync_change()', 'execute');
delete from auth.users where id = '00000000-0000-4000-8000-000000000001';
select count(*) = 0 from public.adhdice_task_history_sync_state where user_id = '00000000-0000-4000-8000-000000000001';
select count(*) = 0 from public.adhdice_task_history_changes where user_id = '00000000-0000-4000-8000-000000000001';
select current_revision = 0 from public.adhdice_task_history_sync_state where user_id = '00000000-0000-4000-8000-000000000002';
`);
    const result = execFileSync(psql, ["-U", "postgres", "-h", host, "-p", port, "-d", database, "-At", "-v", "ON_ERROR_STOP=1", "-f", verification], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim().split("\n");
    assert.deepEqual(result, ["t", "t", "t", "t", "t", "t", "t", "t", "DELETE 1", "t", "t", "t"]);
  } finally {
    try {
      execFileSync(dropdb, ["--if-exists", "--force", "-U", "postgres", "-h", host, "-p", port, database], { cwd: repositoryRoot, stdio: "ignore" });
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
});
