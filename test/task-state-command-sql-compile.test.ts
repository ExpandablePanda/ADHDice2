import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const repositoryRoot = process.cwd();
const psql = process.env.ADHDICE_SQL_COMPILE_PSQL_BIN ?? "psql";
const psqlDirectory = dirname(psql);
const createdb = join(psqlDirectory, "createdb");
const dropdb = join(psqlDirectory, "dropdb");
const host = process.env.ADHDICE_SQL_COMPILE_PGHOST;
const port = process.env.ADHDICE_SQL_COMPILE_PGPORT ?? "5432";

function run(command: string, args: string[], options: { input?: string } = {}): string {
  return execFileSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    input: options.input,
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
}

function connectionArgs(database: string): string[] {
  return ["-h", host!, "-p", port, "-d", database];
}

function utilityConnectionArgs(): string[] {
  return ["-h", host!, "-p", port];
}

test("7.9.20 rollover migration transforms and compiles the prior RPC", (t) => {
  if (!host) {
    t.skip("set ADHDICE_SQL_COMPILE_PGHOST to run the disposable local PostgreSQL compile regression");
    return;
  }
  assert.ok(
    host.startsWith("/") || ["localhost", "127.0.0.1", "::1"].includes(host),
    `refusing non-local SQL compile target: ${host}`,
  );

  const scratch = mkdtempSync(join(tmpdir(), "adhdice-sql-compile-"));
  const database = `adhdice_compile_${process.pid}_${Date.now()}`;
  const preRolloverRpc = join(scratch, "pre-rollover-rpc.sql");
  const preRolloverRpcWithGrants = join(scratch, "pre-rollover-rpc-with-grants.sql");
  const fixtureSetup = join(scratch, "fixture-setup.sql");
  const verification = join(scratch, "verification.sql");

  try {
    run(createdb, [...utilityConnectionArgs(), database]);

    writeFileSync(
      fixtureSetup,
      `create schema auth;
create table auth.users (id uuid primary key);
create publication supabase_realtime;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
`,
    );
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", fixtureSetup]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", join(repositoryRoot, "supabase/schema.sql"), "-f", join(repositoryRoot, "supabase/add_task_state_canonical_schema.sql")]);

    const preSource = run("git", ["show", "9cfca0c^:supabase/add_task_state_command_rpc.sql"]);
    writeFileSync(preRolloverRpc, preSource);
    writeFileSync(
      preRolloverRpcWithGrants,
      `${preSource}\nrevoke all on function public.adhdice_execute_task_state_command(uuid, jsonb) from public, anon, authenticated;\ngrant execute on function public.adhdice_execute_task_state_command(uuid, jsonb) to service_role;\n`,
    );
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", preRolloverRpcWithGrants]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", join(repositoryRoot, "supabase/patch_task_state_command_rollover_7_9_20.sql")]);

    const migration = readFileSync(join(repositoryRoot, "supabase/patch_task_state_command_rollover_7_9_20.sql"), "utf8");
    const source = readFileSync(join(repositoryRoot, "supabase/add_task_state_command_rpc.sql"), "utf8");
    assert.match(migration, /position\(v_old in v_definition\) = 0/gi);
    assert.match(source, /<> \(case when v_command_type = 'reconcile_rollover'/i);

    writeFileSync(
      verification,
      `select
  position('Automatic rollover must finalize only the stale workflow as Did My Best' in pg_get_functiondef('public.adhdice_execute_task_state_command(uuid, jsonb)'::regprocedure)) > 0,
  position('Rollover cannot persist a History fact.' in pg_get_functiondef('public.adhdice_execute_task_state_command(uuid, jsonb)'::regprocedure)) = 0,
  position(E'v_source_kind <> ''runtime''\\n     and not (v_command_type = ''reconcile_rollover'' and v_source_kind = ''authorized_automation'')' in pg_get_functiondef('public.adhdice_execute_task_state_command(uuid, jsonb)'::regprocedure)) > 0,
  has_function_privilege('service_role', 'public.adhdice_execute_task_state_command(uuid, jsonb)', 'execute'),
  not has_function_privilege('authenticated', 'public.adhdice_execute_task_state_command(uuid, jsonb)', 'execute'),
  not has_function_privilege('anon', 'public.adhdice_execute_task_state_command(uuid, jsonb)', 'execute');
`,
    );
    const result = run(psql, [...connectionArgs(database), "-At", "-v", "ON_ERROR_STOP=1", "-f", verification])
      .trim()
      .split("|");
    assert.deepEqual(result, ["t", "t", "t", "t", "t", "t"]);
  } finally {
    try {
      run(dropdb, ["--if-exists", ...utilityConnectionArgs(), database]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
});

test("7.9.31 forward patch and literal History-copy artifacts compile from the installed baseline", (t) => {
  if (!host) {
    t.skip("set ADHDICE_SQL_COMPILE_PGHOST to run the disposable local PostgreSQL compile regression");
    return;
  }
  assert.ok(host.startsWith("/") || ["localhost", "127.0.0.1", "::1"].includes(host));

  const scratch = mkdtempSync(join(tmpdir(), "adhdice-sql-compile-7-9-31-"));
  const database = `adhdice_compile_7931_${process.pid}_${Date.now()}`;
  const baselineSchema = join(scratch, "baseline-canonical-schema.sql");
  const baselineRpc = join(scratch, "baseline-command-rpc.sql");
  const fixtureSetup = join(scratch, "fixture-setup.sql");
  const copyFixture = join(scratch, "copy-fixture.sql");
  const verification = join(scratch, "verification.sql");

  try {
    run(createdb, [...utilityConnectionArgs(), database]);
    writeFileSync(fixtureSetup, `create schema auth;
create table auth.users (id uuid primary key);
create publication supabase_realtime;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
`);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", fixtureSetup]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", join(repositoryRoot, "supabase/schema.sql")]);
    writeFileSync(baselineSchema, run("git", ["show", "HEAD^:supabase/add_task_state_canonical_schema.sql"]));
    writeFileSync(baselineRpc, `${run("git", ["show", "HEAD^:supabase/add_task_state_command_rpc.sql"])}\nrevoke all on function public.adhdice_execute_task_state_command(uuid, jsonb) from public, anon, authenticated;\ngrant execute on function public.adhdice_execute_task_state_command(uuid, jsonb) to service_role;\n`);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", baselineSchema,
      "-f", join(repositoryRoot, "supabase/add_task_state_migration_support.sql"), "-f", baselineRpc]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", join(repositoryRoot, "supabase/patch_task_state_auto_missed_history_copy_7_9_31.sql")]);
    writeFileSync(copyFixture, `insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001');
insert into public.adhdice_user_profiles(user_id) values ('00000000-0000-4000-8000-000000000001');
set session_replication_role = replica;
insert into public.adhdice_clean_tasks(
  id, user_id, title, status, canonicalization_status, entity_kind,
  terminal_state, container_state, prior_container_state_status,
  workflow_state, workflow_revision, canonical_revision,
  canonical_created_at, canonical_updated_at, projection_source_canonical_revision,
  projection_source_fingerprint, projection_version
) values (
  '8416da45-0dec-49a2-8821-1780af3899a1', '00000000-0000-4000-8000-000000000001',
  'Literal copy fixture', 'missed', 'canonical_runtime', 'parent', 'active', 'active',
  'not_applicable', 'none', 1, 1, now(), now(), 1, 'fixture', 'task-state-projection-v1'
);
insert into public.adhdice_task_history(id, task_id, user_id, entry_date, occurrence_due_on, status) values
  ('00000000-0000-4000-8000-000000000101', '8416da45-0dec-49a2-8821-1780af3899a1', '00000000-0000-4000-8000-000000000001', '2026-07-16', '2026-07-15', 'done'),
  ('00000000-0000-4000-8000-000000000102', '8416da45-0dec-49a2-8821-1780af3899a1', '00000000-0000-4000-8000-000000000001', '2026-07-17', null, 'did_my_best'),
  ('00000000-0000-4000-8000-000000000103', '8416da45-0dec-49a2-8821-1780af3899a1', '00000000-0000-4000-8000-000000000001', '2026-07-18', null, 'missed'),
  ('00000000-0000-4000-8000-000000000104', '8416da45-0dec-49a2-8821-1780af3899a1', '00000000-0000-4000-8000-000000000001', '2026-07-19', null, 'delayed'),
  ('00000000-0000-4000-8000-000000000105', '8416da45-0dec-49a2-8821-1780af3899a1', '00000000-0000-4000-8000-000000000001', '2026-07-20', null, 'complete'),
  ('00000000-0000-4000-8000-000000000106', '8416da45-0dec-49a2-8821-1780af3899a1', '00000000-0000-4000-8000-000000000001', '2026-07-21', null, 'missed');
set session_replication_role = origin;
set session_replication_role = replica;
insert into public.adhdice_task_history_facts(
  user_id, entity_id, entity_kind, logical_date, outcome, event_kind,
  provenance_kind, actor_kind, actor_id, source, logical_day_settings_revision,
  timezone, day_start_time, command_id, idempotence_identity
) values (
  '00000000-0000-4000-8000-000000000001', '8416da45-0dec-49a2-8821-1780af3899a1', 'parent',
  '2026-07-21', 'done', 'explicit_outcome', 'user', 'user',
  '00000000-0000-4000-8000-000000000001', 'preexisting-canonical', 1, 'UTC', '00:00',
  '00000000-0000-4000-8000-000000000099', 'preexisting-canonical-2026-07-21'
);
set session_replication_role = origin;
`);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", copyFixture]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", join(repositoryRoot, "supabase/migrate_legacy_history_copy_7_9_31.sql")]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", join(repositoryRoot, "supabase/migrate_legacy_history_copy_7_9_31.sql")]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", join(repositoryRoot, "supabase/preview_legacy_history_copy_7_9_31.sql")]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", join(repositoryRoot, "supabase/verify_legacy_history_copy_7_9_31.sql")]);

    writeFileSync(verification, `select
  position('automatic_history_facts' in pg_get_functiondef('public.adhdice_execute_task_state_command(uuid, jsonb)'::regprocedure)) > 0,
  position('Dependent automatic History deletion is not proven safe' in pg_get_functiondef('public.adhdice_execute_task_state_command(uuid, jsonb)'::regprocedure)) > 0,
  has_function_privilege('service_role', 'public.adhdice_execute_task_state_command(uuid, jsonb)', 'execute'),
  not has_function_privilege('authenticated', 'public.adhdice_execute_task_state_command(uuid, jsonb)', 'execute'),
  not has_function_privilege('anon', 'public.adhdice_execute_task_state_command(uuid, jsonb)', 'execute');

select
  count(*) filter (where source = 'legacy_history_copy_7_9_31') = 5,
  count(*) filter (where source = 'legacy_history_copy_7_9_31' and outcome = 'done') = 1,
  count(*) filter (where source = 'legacy_history_copy_7_9_31' and outcome = 'did_my_best') = 1,
  count(*) filter (where source = 'legacy_history_copy_7_9_31' and outcome = 'missed') = 1,
  count(*) filter (where source = 'legacy_history_copy_7_9_31' and outcome = 'delayed' and effective_due_on is null) = 1,
  count(*) filter (where source = 'legacy_history_copy_7_9_31' and outcome = 'complete') = 1,
  count(*) filter (where source = 'legacy_history_copy_7_9_31' and logical_date = '2026-07-16' and scheduled_due_on = '2026-07-15') = 1,
  count(*) filter (where source = 'legacy_history_copy_7_9_31' and logical_date <> '2026-07-16' and scheduled_due_on is null) = 4,
  count(*) filter (where source = 'legacy_history_copy_7_9_31' and (occurrence_id is not null or schedule_boundary_id is not null or recurrence_source_fingerprint is not null)) = 0
from public.adhdice_task_history_facts;

select outcome = 'done' and source = 'preexisting-canonical' and source_legacy_history_id is null
from public.adhdice_task_history_facts
where entity_id = '8416da45-0dec-49a2-8821-1780af3899a1' and logical_date = '2026-07-21';

select status = 'missed' and canonical_revision = 1 and revision = 1
from public.adhdice_clean_tasks where id = '8416da45-0dec-49a2-8821-1780af3899a1';

select count(*) = 0 from public.adhdice_task_reward_entitlements
where entity_id = '8416da45-0dec-49a2-8821-1780af3899a1';

insert into public.adhdice_clean_tasks(id, user_id, title, status)
values ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000001', 'Delay constraint', 'pending');
insert into public.adhdice_task_migration_operations(
  user_id, operation_kind, operation_identity, input_fingerprint, state,
  migration_version, classifier_version, schema_contract_version
) values (
  '00000000-0000-4000-8000-000000000001', 'backfill', 'compile-delay-copy', 'md5-test', 'started',
  'legacy-history-copy-7.9.31', 'exact-task-id-copy-v1', 'task-state-schema-v1'
);
insert into public.adhdice_task_history_facts(
  user_id, entity_id, entity_kind, logical_date, outcome, event_kind,
  scheduled_due_on, effective_due_on, provenance_kind, actor_kind, source,
  logical_day_settings_revision, timezone, day_start_time, idempotence_identity,
  migration_operation_id, source_legacy_history_id
) select
  '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', 'parent',
  '2026-07-16', 'delayed', 'migration_reconstruction', null, null,
  'migration_reconstruction', 'migration', 'legacy_history_copy_7_9_31', 1, 'UTC', '00:00',
  'compile-delay-copy-fact', id, '00000000-0000-4000-8000-000000000020'
from public.adhdice_task_migration_operations where operation_identity = 'compile-delay-copy';

do $$ begin
  begin
    insert into public.adhdice_task_history_facts(
      user_id, entity_id, entity_kind, logical_date, outcome, event_kind,
      effective_due_on, provenance_kind, actor_kind, actor_id, source,
      logical_day_settings_revision, timezone, day_start_time, command_id, idempotence_identity
    ) values (
      '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', 'parent',
      '2026-07-17', 'delayed', 'delay_audit', null, 'user', 'user',
      '00000000-0000-4000-8000-000000000001', 'task_state_command', 1, 'UTC', '00:00',
      '00000000-0000-4000-8000-000000000030', 'runtime-delay-null-must-fail'
    );
    raise exception 'runtime Delay with null effective_due_on was accepted';
  exception when check_violation then null;
  end;
end $$;
`);
    const result = run(psql, [...connectionArgs(database), "-At", "-v", "ON_ERROR_STOP=1", "-f", verification])
      .trim().split("\n");
    assert.deepEqual(result[0]?.split("|"), ["t", "t", "t", "t", "t"]);
    assert.deepEqual(result[1]?.split("|"), Array(9).fill("t"));
    assert.deepEqual(result.slice(2, 5), ["t", "t", "t"]);
  } finally {
    try {
      run(dropdb, ["--if-exists", ...utilityConnectionArgs(), database]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
});
