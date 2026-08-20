import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

const repositoryRoot = process.cwd();
const psql = process.env.ADHDICE_SQL_COMPILE_PSQL_BIN ?? "psql";
const psqlDirectory = dirname(psql);
const createdb = join(psqlDirectory, "createdb");
const dropdb = join(psqlDirectory, "dropdb");
const host = process.env.ADHDICE_SQL_COMPILE_PGHOST;
const port = process.env.ADHDICE_SQL_COMPILE_PGPORT ?? "5432";
const migrationPath = join(repositoryRoot, "supabase/patch_task_reward_entitlement_permanence_7_10_5.sql");

const userId = "00000000-0000-4000-8000-000000000001";
const taskOneId = "00000000-0000-4000-8000-000000000101";
const taskTwoId = "00000000-0000-4000-8000-000000000102";
const taskThreeId = "00000000-0000-4000-8000-000000000103";
const historyOnePriorId = "00000000-0000-4000-8000-000000000201";
const historyOneCurrentId = "00000000-0000-4000-8000-000000000202";
const historyTwoPriorId = "00000000-0000-4000-8000-000000000203";
const historyTwoCurrentId = "00000000-0000-4000-8000-000000000204";
const historyThreeId = "00000000-0000-4000-8000-000000000205";
const entitlementOneId = "00000000-0000-4000-8000-000000000301";
const entitlementTwoId = "00000000-0000-4000-8000-000000000302";
const entitlementThreeId = "00000000-0000-4000-8000-000000000303";
const grantThreeId = "00000000-0000-4000-8000-000000000401";

function run(command: string, args: string[]): string {
  return execFileSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function connectionArgs(database: string): string[] {
  return ["-h", host!, "-p", port, "-d", database];
}

function utilityConnectionArgs(): string[] {
  return ["-h", host!, "-p", port];
}

function writeSql(scratch: string, name: string, sql: string): string {
  const path = join(scratch, name);
  writeFileSync(path, sql);
  return path;
}

function setupDatabase(database: string, scratch: string): void {
  const fixtureSetup = writeSql(scratch, "fixture-setup.sql", `
create schema auth;
create table auth.users (id uuid primary key);
create publication supabase_realtime;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
`);
  const schemaSource = readFileSync(join(repositoryRoot, "supabase/schema.sql"), "utf8");
  const canonicalDependentRuntimeMarker = "-- ADHDice Achievements MVP authoritative capture, evaluation, and resumable recalculation.";
  const canonicalDependentRuntimeStart = schemaSource.indexOf(canonicalDependentRuntimeMarker);
  assert.ok(canonicalDependentRuntimeStart > 0, "the disposable fixture must find the canonical-dependent schema boundary");
  const baseSchema = writeSql(scratch, "schema.sql", schemaSource.slice(0, canonicalDependentRuntimeStart));
  const canonicalSchemaSource = readFileSync(join(repositoryRoot, "supabase/add_task_state_canonical_schema.sql"), "utf8");
  const canonicalSchema = canonicalSchemaSource.replace("reward_units_snapshot integer not null,", "reward_units_snapshot integer,");
  assert.notEqual(canonicalSchema, canonicalSchemaSource, "the disposable fixture must model the pre-7.10.5 nullable snapshot column");
  const canonicalSchemaPath = writeSql(scratch, "canonical-schema.sql", canonicalSchema);
  const pendingDice = writeSql(scratch, "pending-dice.sql", readFileSync(join(repositoryRoot, "supabase/add_pending_reward_dice.sql"), "utf8"));

  run(createdb, [...utilityConnectionArgs(), database]);
  try {
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", fixtureSetup]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", baseSchema, "-f", canonicalSchemaPath, "-f", pendingDice]);
  } catch (error) {
    run(dropdb, ["--if-exists", ...utilityConnectionArgs(), database]);
    throw error;
  }
}

function runMigration(database: string): string | null {
  try {
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", migrationPath]);
    return null;
  } catch (error) {
    const details = error as { stderr?: string | Buffer };
    return typeof details.stderr === "string" ? details.stderr : details.stderr?.toString() ?? String(error);
  }
}

function successfulFixture(): string {
  return `
insert into auth.users(id) values ('${userId}');
insert into public.adhdice_clean_tasks(id, user_id, title, repeat_frequency) values
  ('${taskOneId}', '${userId}', 'Did My Best edit', 'daily'),
  ('${taskTwoId}', '${userId}', 'Done edit', 'daily'),
  ('${taskThreeId}', '${userId}', 'Fulfilled legacy entitlement', 'none');
insert into public.adhdice_task_history_facts(
  id, user_id, entity_id, entity_kind, logical_date, outcome, event_kind,
  provenance_kind, actor_kind, actor_id, source, logical_day_settings_revision,
  timezone, day_start_time, idempotence_identity, migration_operation_id
) values
  ('${historyOnePriorId}', '${userId}', '${taskOneId}', 'parent', '2026-08-15', 'done', 'explicit_outcome', 'migration_reconstruction', 'migration', null, 'fixture-one-prior', 1, 'UTC', '00:00', 'fixture-one-prior', '${historyOnePriorId}'),
  ('${historyOneCurrentId}', '${userId}', '${taskOneId}', 'parent', '2026-08-16', 'done', 'explicit_outcome', 'migration_reconstruction', 'migration', null, 'fixture-one-current', 1, 'UTC', '00:00', 'fixture-one-current', '${historyOneCurrentId}'),
  ('${historyTwoPriorId}', '${userId}', '${taskTwoId}', 'parent', '2026-08-15', 'done', 'explicit_outcome', 'migration_reconstruction', 'migration', null, 'fixture-two-prior', 1, 'UTC', '00:00', 'fixture-two-prior', '${historyTwoPriorId}'),
  ('${historyTwoCurrentId}', '${userId}', '${taskTwoId}', 'parent', '2026-08-16', 'did_my_best', 'explicit_outcome', 'migration_reconstruction', 'migration', null, 'fixture-two-current', 1, 'UTC', '00:00', 'fixture-two-current', '${historyTwoCurrentId}'),
  ('${historyThreeId}', '${userId}', '${taskThreeId}', 'parent', '2026-08-16', 'complete', 'terminal_complete', 'migration_reconstruction', 'migration', null, 'fixture-three-current', 1, 'UTC', '00:00', 'fixture-three-current', '${historyThreeId}');
insert into public.adhdice_task_reward_entitlements(
  id, user_id, entity_id, entity_kind, logical_date, reward_program_version,
  canonical_history_id, canonical_event_identity, outcome_snapshot,
  eligibility_kind, entitlement_source_kind, state, migration_operation_id, fulfilled_at
) values
  ('${entitlementOneId}', '${userId}', '${taskOneId}', 'parent', '2026-08-16', 'reward-v1', '${historyOneCurrentId}', 'fixture-entitlement-one', 'did_my_best', 'handled_success', 'migration_bootstrap', 'pending', '${entitlementOneId}', null),
  ('${entitlementTwoId}', '${userId}', '${taskTwoId}', 'parent', '2026-08-16', 'reward-v1', '${historyTwoCurrentId}', 'fixture-entitlement-two', 'done', 'handled_success', 'migration_bootstrap', 'pending', '${entitlementTwoId}', null),
  ('${entitlementThreeId}', '${userId}', '${taskThreeId}', 'parent', '2026-08-16', 'reward-v1', '${historyThreeId}', 'fixture-entitlement-three', 'complete', 'handled_success', 'migration_bootstrap', 'fulfilled', '${entitlementThreeId}', now());
insert into public.adhdice_task_reward_grants(
  id, user_id, entitlement_id, grant_operation_identity, grant_kind, units,
  grant_payload, state, applied_at
) values ('${grantThreeId}', '${userId}', '${entitlementThreeId}', 'fixture-grant-three', 'banked_roll', 5, '{}'::jsonb, 'applied', now());
`;
}

function rejectedFixture(currentOutcome: "missed" | "missing"): string {
  const taskId = "00000000-0000-4000-8000-000000000501";
  const historyId = "00000000-0000-4000-8000-000000000502";
  const entitlementId = "00000000-0000-4000-8000-000000000503";
  const history = currentOutcome === "missing"
    ? ""
    : `insert into public.adhdice_task_history_facts(
  id, user_id, entity_id, entity_kind, logical_date, outcome, event_kind,
  provenance_kind, actor_kind, actor_id, source, logical_day_settings_revision,
  timezone, day_start_time, idempotence_identity, migration_operation_id
) values ('${historyId}', '${userId}', '${taskId}', 'parent', '2026-08-16', 'missed', 'explicit_outcome', 'migration_reconstruction', 'migration', null, 'fixture-rejected-${currentOutcome}', 1, 'UTC', '00:00', 'fixture-rejected-${currentOutcome}', '${historyId}');`;
  const historyIdValue = currentOutcome === "missing" ? "null" : `'${historyId}'`;
  return `
insert into auth.users(id) values ('${userId}');
insert into public.adhdice_clean_tasks(id, user_id, title, repeat_frequency)
values ('${taskId}', '${userId}', 'Rejected entitlement', 'daily');
${history}
insert into public.adhdice_task_reward_entitlements(
  id, user_id, entity_id, entity_kind, logical_date, reward_program_version,
  canonical_history_id, canonical_event_identity, outcome_snapshot,
  eligibility_kind, entitlement_source_kind, state, migration_operation_id
) values ('${entitlementId}', '${userId}', '${taskId}', 'parent', '2026-08-16', 'reward-v1', ${historyIdValue}, 'fixture-rejected-entitlement', 'done', 'handled_success', 'migration_bootstrap', 'pending', '${entitlementId}');
`;
}

test("7.10.5 migration allows success-label edits and rejects unsafe pending backfills", (t) => {
  if (!host) {
    t.skip("set ADHDICE_SQL_COMPILE_PGHOST to run the disposable local PostgreSQL migration regression");
    return;
  }
  assert.ok(host.startsWith("/") || ["localhost", "127.0.0.1", "::1"].includes(host));

  const scenarios = [
    { name: "success", fixture: successfulFixture(), shouldFail: false },
    { name: "missed", fixture: rejectedFixture("missed"), shouldFail: true },
    { name: "missing-history", fixture: rejectedFixture("missing"), shouldFail: true },
  ];

  for (const scenario of scenarios) {
    const scratch = mkdtempSync(join(tmpdir(), `adhdice-reward-7-10-5-${scenario.name}-`));
    const database = `adhdice_reward_7105_${scenario.name.replaceAll("-", "_")}_${process.pid}_${Date.now()}`;
    const fixturePath = writeSql(scratch, "data.sql", scenario.fixture);
    try {
      setupDatabase(database, scratch);
      run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", fixturePath]);
      const error = runMigration(database);
      if (scenario.shouldFail) {
        assert.ok(error, `${scenario.name} pending entitlement must fail closed`);
        assert.match(error, /cannot backfill pending entitlement/);
        continue;
      }
      assert.equal(error, null);
      const result = run(psql, [...connectionArgs(database), "-At", "-v", "ON_ERROR_STOP=1", "-c", `
select entity_id::text || ':' || outcome_snapshot || ':' || reward_units_snapshot || ':' || state
from public.adhdice_task_reward_entitlements
where user_id = '${userId}'
order by entity_id;
select count(*) from pg_constraint where conname = 'adhdice_task_reward_entitlements_identity_key';
select to_regprocedure('public.adhdice_execute_task_state_command(uuid, jsonb)') is not null;
select to_regprocedure('public.adhdice_fulfill_canonical_reward_entitlement(uuid)') is not null;
`]).trim().split("\n");
      assert.deepEqual(result.slice(0, 3), [
        `${taskOneId}:did_my_best:2:pending`,
        `${taskTwoId}:done:2:pending`,
        `${taskThreeId}:complete:5:fulfilled`,
      ]);
      assert.equal(result[3], "1", "Task/day uniqueness must remain installed");
      assert.equal(result[4], "t", "Task State command definition must compile from the migration");
      assert.equal(result[5], "t", "reward fulfillment definition must compile from the migration");
    } finally {
      try {
        run(dropdb, ["--if-exists", ...utilityConnectionArgs(), database]);
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    }
  }
});
