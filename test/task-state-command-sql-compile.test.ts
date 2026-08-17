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
