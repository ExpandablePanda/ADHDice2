import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/add_task_current_projection_7_15_12.sql", import.meta.url),
  "utf8",
);
const canonicalSchema = readFileSync(
  new URL("../supabase/add_task_state_canonical_schema.sql", import.meta.url),
  "utf8",
);
const consolidatedSchema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const databaseTypes = readFileSync(new URL("../src/lib/database.types.ts", import.meta.url), "utf8");
const phase1e = readFileSync(
  new URL("../docs/architecture/task-state-phase-1e-current-task-read-projection-contract.md", import.meta.url),
  "utf8",
);
const currentState = readFileSync(new URL("../docs/CURRENT_STATE.md", import.meta.url), "utf8");

const projectionFields = [
  ["user_id", "uuid"],
  ["entity_id", "uuid"],
  ["entity_kind", "text"],
  ["display_status", "text"],
  ["current_effective_due_on", "date"],
  ["next_due_on", "date"],
  ["active_occurrence_id", "uuid"],
  ["active_occurrence_status", "text"],
  ["handled_current_logical_day", "boolean"],
  ["last_handled_logical_date", "date"],
  ["last_handled_at", "timestamptz"],
  ["last_done_logical_date", "date"],
  ["last_done_at", "timestamptz"],
  ["current_positive_streak", "integer"],
  ["current_missed_streak", "integer"],
  ["canonical_task_revision", "bigint"],
  ["history_sync_epoch", "uuid"],
  ["history_source_revision", "bigint"],
  ["history_source_fingerprint", "text"],
  ["schedule_boundary_revision", "text"],
  ["behavior_policy_revision", "text"],
  ["logical_day_settings_revision", "bigint"],
  ["projected_logical_date", "date"],
  ["projection_schema_version", "text"],
  ["projection_algorithm_version", "text"],
  ["source_fingerprint", "text"],
  ["validity", "text"],
  ["updated_at", "timestamptz"],
] as const;

test("7.15.12 projection SQL is additive and parity-aligned", () => {
  for (const source of [migration, canonicalSchema, consolidatedSchema]) {
    assert.match(source, /create table if not exists public\.adhdice_task_current_projections/i);
    assert.match(source, /primary key \(user_id, entity_id\)/i);
    assert.match(source, /foreign key \(user_id, entity_id\)[\s\S]*references public\.adhdice_clean_tasks \(user_id, id\)[\s\S]*on delete cascade/i);
    assert.match(source, /entity_kind text not null check \(entity_kind in \('parent', 'step', 'substep'\)\)/i);
    assert.match(source, /active_occurrence_status[\s\S]*'none'.*'open'.*'overdue'.*'delayed'.*'handled'.*'terminated'/i);
    assert.match(source, /validity[\s\S]*'valid'.*'repair_required'.*'unavailable'/i);

    for (const [field, type] of projectionFields) {
      assert.match(source, new RegExp(`\\b${field}\\s+${type}\\b`, "i"), `${field} must be present as ${type}`);
    }
  }

  assert.match(migration, /create index if not exists adhdice_task_history_changes_entity_sequence_idx[\s\S]*\(user_id, entity_id, sequence desc\)/i);
  assert.match(canonicalSchema, /create index if not exists adhdice_task_history_changes_entity_sequence_idx[\s\S]*\(user_id, entity_id, sequence desc\)/i);
  assert.doesNotMatch(migration, /create table if not exists public\.adhdice_task_history_entity/i);
  assert.match(migration, /alter table public\.adhdice_task_current_projections enable row level security/i);
  assert.match(migration, /for select to authenticated[\s\S]*using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migration, /revoke all on table public\.adhdice_task_current_projections from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.adhdice_task_current_projections to authenticated/i);
  assert.match(migration, /grant all on table public\.adhdice_task_current_projections to service_role/i);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete) on table public\.adhdice_task_current_projections to authenticated/i);
  assert.match(migration, /adhdice_task_current_projections_reconciliation_idx[\s\S]*\(user_id, validity, projected_logical_date, entity_id\)/i);

  assert.match(databaseTypes, /export type TaskCurrentProjection = \{[\s\S]*history_source_revision: number[\s\S]*validity: CurrentTaskProjectionValidity/i);
  assert.match(databaseTypes, /adhdice_task_current_projections:[\s\S]*Row: TaskCurrentProjection[\s\S]*Insert: TaskCurrentProjectionInsert[\s\S]*Update: TaskCurrentProjectionUpdate/i);
  assert.match(phase1e, /public\.adhdice_task_current_projections/);
  assert.match(phase1e, /adhdice_task_history_changes/);
  assert.match(currentState, /Current working app version: `7\.15\.21`/);
  assert.match(currentState, /7\.15\.11 entry was\s+documentation-only/);
  assert.doesNotMatch(currentState, /working app version remains `7\.15\.8`/);
});

const repositoryRoot = process.cwd();
const psql = process.env.ADHDICE_SQL_COMPILE_PSQL_BIN ?? "psql";
const psqlDirectory = dirname(psql);
const createdb = join(psqlDirectory, "createdb");
const dropdb = join(psqlDirectory, "dropdb");
const host = process.env.ADHDICE_SQL_COMPILE_PGHOST;
const port = process.env.ADHDICE_SQL_COMPILE_PGPORT ?? "5432";

function runFile(database: string, file: string): string {
  return execFileSync(
    psql,
    ["-U", "postgres", "-h", host!, "-p", port, "-d", database, "-v", "ON_ERROR_STOP=1", "-f", file],
    { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

test("the projection migration compiles, reruns, and preserves read-only browser grants", (t) => {
  if (!host) {
    t.skip("set ADHDICE_SQL_COMPILE_PGHOST to run the disposable local PostgreSQL projection integration regression");
    return;
  }
  assert.ok(host.startsWith("/") || ["localhost", "127.0.0.1", "::1"].includes(host));

  const scratch = mkdtempSync(join(tmpdir(), "adhdice-current-projection-"));
  const database = `adhdice_current_projection_${process.pid}_${Date.now()}`;
  const fixture = join(scratch, "fixture.sql");
  const verification = join(scratch, "verification.sql");
  let databaseCreated = false;

  try {
    execFileSync(createdb, ["-U", "postgres", "-h", host, "-p", port, database], { cwd: repositoryRoot, stdio: "ignore" });
    databaseCreated = true;
    writeFileSync(fixture, `create schema auth;
create extension if not exists pgcrypto;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create table auth.users (id uuid primary key);
create table public.adhdice_clean_tasks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_kind text,
  unique (user_id, id)
);
create table public.adhdice_task_history_changes (
  user_id uuid not null,
  sequence bigint primary key,
  history_fact_id uuid not null,
  entity_id uuid not null,
  logical_date date not null,
  operation text not null,
  row_revision bigint,
  changed_at timestamptz not null default now()
);
`);
    runFile(database, fixture);
    const migrationFile = join(scratch, "migration.sql");
    writeFileSync(migrationFile, migration);
    runFile(database, migrationFile);
    runFile(database, migrationFile);

    writeFileSync(verification, `select to_regclass('public.adhdice_task_current_projections') is not null;
select relrowsecurity from pg_class where oid = 'public.adhdice_task_current_projections'::regclass;
select count(*) = 1 from pg_constraint where conname = 'adhdice_task_current_projections_identity_key';
select count(*) = 1 from pg_constraint where conname = 'adhdice_task_current_projections_entity_fkey';
select has_table_privilege('authenticated', 'public.adhdice_task_current_projections', 'select');
select not has_table_privilege('authenticated', 'public.adhdice_task_current_projections', 'insert,update,delete');
select has_table_privilege('service_role', 'public.adhdice_task_current_projections', 'insert,update,delete');
select count(*) = 1 from pg_indexes where indexname = 'adhdice_task_history_changes_entity_sequence_idx';
`);
    const result = execFileSync(
      psql,
      ["-U", "postgres", "-h", host, "-p", port, "-d", database, "-At", "-v", "ON_ERROR_STOP=1", "-f", verification],
      { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim().split("\n");
    assert.deepEqual(result, ["t", "t", "t", "t", "t", "t", "t", "t"]);
  } finally {
    try {
      if (databaseCreated) {
        execFileSync(dropdb, ["--if-exists", "--force", "-U", "postgres", "-h", host, "-p", port, database], { cwd: repositoryRoot, stdio: "ignore" });
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
});
