import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import test from "node:test";

import {
  homeTodoRecoveryConflictCacheKey,
  parseHomeTodoRecoveryCache,
  shouldPreferRemoteHomeTodoState,
} from "../src/lib/home-todo-recovery.ts";
import { EMPTY_HOME_TODO_STATE, normalizeHomeTodoState } from "../src/lib/home-todo-state.ts";

const repositoryRoot = process.cwd();
const migrationPath = join(repositoryRoot, "supabase/20261014000000_home_backup_recovery_foundation_7_16_165.sql");
const migration = readFileSync(migrationPath, "utf8");
const schemaSnapshot = readFileSync(join(repositoryRoot, "supabase/schema.sql"), "utf8");
const cronActivation = readFileSync(join(repositoryRoot, "supabase/activate_home_recovery_cron.sql"), "utf8");
const rollback = readFileSync(join(repositoryRoot, "supabase/rollback_home_backup_recovery_7_16_165.sql"), "utf8");
const hookSource = readFileSync(join(repositoryRoot, "src/hooks/useHomeTodoState.ts"), "utf8");

test("legacy Home caches normalize as generation zero and server restore generations override timestamps", () => {
  const legacy = normalizeHomeTodoState({
    ...EMPTY_HOME_TODO_STATE,
    taskIds: ["first", "second"],
    clientUpdatedAt: "2099-01-01T00:00:00.000Z",
  });
  const cache = parseHomeTodoRecoveryCache(legacy);
  const restored = normalizeHomeTodoState({
    ...EMPTY_HOME_TODO_STATE,
    taskIds: ["restored"],
    clientUpdatedAt: "2026-01-01T00:00:00.000Z",
  });

  assert.equal(cache.restoreGeneration, 0);
  assert.deepEqual(cache.state.taskIds, ["first", "second"]);
  assert.equal(shouldPreferRemoteHomeTodoState(cache, { state: restored, restoreGeneration: 1 }), true);
  assert.equal(shouldPreferRemoteHomeTodoState(
    { state: legacy, restoreGeneration: 1 },
    { state: restored, restoreGeneration: 1 },
  ), false);
  assert.equal(homeTodoRecoveryConflictCacheKey("user-a", 0, 1), "adhdice-home-todo-conflict:user-a:0:1");
  assert.equal(
    homeTodoRecoveryConflictCacheKey("user-a", 1, 1, 4, 5),
    "adhdice-home-todo-conflict:user-a:1:1:revision:4:5",
  );
});

test("Home persistence is wired to the revision-guarded RPC and retains data on network errors", () => {
  const flushStart = hookSource.indexOf("const flush = useCallback");
  const flushEnd = hookSource.indexOf("const scheduleWrite = useCallback", flushStart);
  const flush = hookSource.slice(flushStart, flushEnd);
  const hydrationStart = hookSource.indexOf(".from(\"adhdice_home_todo_state\")");
  const hydrationEnd = hookSource.indexOf("const stopRealtimeChannel", hydrationStart);
  const hydration = hookSource.slice(hydrationStart, hydrationEnd);

  assert.match(flush, /rpc\(\"save_home_todo_state\"/);
  assert.match(flush, /p_expected_restore_generation: expectedRestoreGeneration/);
  assert.match(flush, /p_expected_state_revision: expectedStateRevision/);
  assert.match(flush, /result\?\.status === "restore_conflict" \|\| result\?\.status === "state_conflict"/);
  assert.doesNotMatch(flush, /\.from\(\"adhdice_home_todo_state\"\)\.upsert/);
  const errorBlockStart = flush.indexOf("if (error) {");
  const errorBlockEnd = flush.indexOf("\n    const result", errorBlockStart);
  const errorBlock = flush.slice(errorBlockStart, errorBlockEnd);
  assert.match(errorBlock, /setOwnerSyncStatus\(ownerId, \"local\"\)/);
  assert.doesNotMatch(errorBlock, /dirtyRef\.current = false/);
  assert.match(hydration, /shouldPreferRemoteHomeTodoState/);
  assert.match(hydration, /state_revision,restore_generation/);
  assert.match(hookSource, /preserveSupersededCache/);
  assert.match(hookSource, /if \(remoteRestoreGeneration !== restoreGenerationRef\.current\)/);
  assert.match(hookSource, /canSyncHomeTodoStateToRemote/);
});

test("recovery SQL keeps payloads private, verifies before rotation, and leaves Cron opt-in", () => {
  assert.match(migration, /alter table public\.adhdice_recovery_points enable row level security/);
  assert.match(migration, /revoke all on public\.adhdice_recovery_settings, public\.adhdice_recovery_points, public\.adhdice_recovery_status/);
  assert.match(migration, /grant execute on function public\.preview_home_recovery_point\(uuid\) to authenticated/);
  assert.match(migration, /owner_id uuid not null references auth\.users\(id\)/);
  assert.match(migration, /checksum_algorithm text not null default 'sha256'/);
  assert.match(migration, /verification_status = 'verified'/);
  assert.match(migration, /set verification_status = 'verified'/);
  assert.match(migration, /retention_blocked_by_protected_points/);
  assert.match(migration, /pg_total_relation_size\('public\.adhdice_recovery_points'::regclass\)/);
  assert.match(migration, /pg_database_size\(current_database\(\)\)/);
  assert.match(migration, /checkpoint_interval interval not null default interval '4 hours'/);
  assert.doesNotMatch(migration, /create extension[^;]*pg_cron/i);
  assert.doesNotMatch(migration, /cron\.schedule/i);
  assert.match(cronActivation, /cron\.schedule/);
  assert.match(cronActivation, /select public\.run_home_recovery_checkpoint_cycle\(\)/);
  assert.match(rollback, /restore_generation > 0/);
  assert.match(rollback, /fix forward/i);
  assert.match(migration, /p_expected_state_revision is distinct from v_current\.state_revision/);
  assert.match(migration, /status', 'state_conflict'/);
  assert.match(migration, /pre_restore_checkpoint_verification_failed/);
  assert.match(migration, /pre_restore_checkpoint_owner_mismatch/);
  assert.match(migration, /missing_task_references/);
  assert.match(migration, /p_confirm_restore is distinct from true/);
  assert.match(migration, /state_revision = state_revision \+ 1/);
  assert.match(migration, /restore_generation = restore_generation \+ 1/);
  const recoveryMarker = "alter table public.adhdice_home_todo_state\n  add column if not exists state_revision";
  const snapshotStart = schemaSnapshot.indexOf(recoveryMarker);
  const migrationStart = migration.indexOf(recoveryMarker);
  assert.notEqual(snapshotStart, -1);
  assert.notEqual(migrationStart, -1);
  assert.equal(
    schemaSnapshot.slice(snapshotStart, schemaSnapshot.lastIndexOf("commit;")),
    migration.slice(migrationStart, migration.lastIndexOf("commit;")),
    "schema.sql must retain the unapplied migration source exactly",
  );
});

const configuredHost = process.env.ADHDICE_HOME_RECOVERY_PGHOST ?? process.env.ADHDICE_SQL_COMPILE_PGHOST;
const pgHost = configuredHost && (
  configuredHost.startsWith("/") || ["localhost", "127.0.0.1", "::1"].includes(configuredHost)
) ? configuredHost : undefined;
const pgUser = process.env.ADHDICE_HOME_RECOVERY_PGUSER ?? process.env.ADHDICE_SQL_COMPILE_PGUSER ?? "postgres";
const pgPort = process.env.ADHDICE_HOME_RECOVERY_PGPORT ?? process.env.ADHDICE_SQL_COMPILE_PGPORT ?? "5432";
const psql = process.env.ADHDICE_HOME_RECOVERY_PSQL_BIN ?? process.env.ADHDICE_SQL_COMPILE_PSQL_BIN ?? "psql";
const pgBinDirectory = dirname(psql);
const createdb = join(pgBinDirectory, "createdb");
const dropdb = join(pgBinDirectory, "dropdb");
const connectionArgs = (database: string) => ["-h", pgHost!, "-p", pgPort, "-U", pgUser, "-d", database];
const execFileAsync = promisify(execFile);

function run(command: string, args: string[], options: { input?: string } = {}) {
  try {
    return execFileSync(command, args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      input: options.input,
      maxBuffer: 8 * 1024 * 1024,
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
  } catch (error) {
    const details = error as { stderr?: string | Buffer; message?: string };
    throw new Error(String(details.stderr ?? details.message ?? error));
  }
}

function runSql(database: string, sql: string) {
  return run(psql, [...connectionArgs(database), "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql]).trim();
}

function parseLastJson(output: string) {
  const line = output.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).at(-1);
  assert.ok(line, "expected a JSON result row");
  return JSON.parse(line) as Record<string, unknown>;
}

function userSql(ownerId: string, statement: string) {
  return "set role authenticated; select set_config('request.jwt.claim.sub', '" + ownerId + "', false); " + statement;
}

function jsonLiteral(value: unknown) {
  return "$home$" + JSON.stringify(value).replaceAll("$home$", "") + "$home$::jsonb";
}

function homeState(taskIds: string[], scratchpadText: string) {
  return {
    schemaVersion: 8,
    clientUpdatedAt: "2026-10-14T12:00:00.000Z",
    taskIds,
    taskDayOffsets: {},
    tasksPerDay: 10,
    routineTaskIds: [],
    routineSections: [],
    routineSectionIdByTaskId: {},
    urgentTaskIds: [],
    scratchpadText,
    scratchpadItems: [],
  };
}

function homeRowSnapshot(database: string, ownerId: string) {
  return parseLastJson(runSql(database,
    "select jsonb_build_object('state', state, 'client_updated_at', client_updated_at, 'state_revision', state_revision, 'restore_generation', restore_generation) " +
    "from public.adhdice_home_todo_state where user_id = '" + ownerId + "';"
  ));
}

async function runAsync(command: string, args: string[]) {
  const result = await execFileAsync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  return result.stdout.trim();
}

test("Home recovery database integration", {
  skip: !pgHost
    ? "set ADHDICE_HOME_RECOVERY_PGHOST to a disposable local PostgreSQL server"
    : undefined,
}, async (t) => {
  if (!pgHost && configuredHost) {
    t.skip("refusing a non-local PostgreSQL target");
    return;
  }
  const scratch = mkdtempSync(join(tmpdir(), "adhdice-home-recovery-test-"));
  const database = "adhdice_home_recovery_" + process.pid + "_" + Date.now();
  const setupPath = join(scratch, "setup.sql");
  const userA = "00000000-0000-0000-0000-000000000001";
  const userB = "00000000-0000-0000-0000-000000000002";
  const userC = "00000000-0000-0000-0000-000000000003";
  const taskA = "10000000-0000-0000-0000-000000000001";
  const taskB = "10000000-0000-0000-0000-000000000002";
  const taskC = "10000000-0000-0000-0000-000000000003";
  let databaseCreated = false;
  try {
    run(createdb, ["-h", pgHost!, "-p", pgPort, "-U", pgUser, database]);
    databaseCreated = true;
    const setup = [
      "create schema auth;",
      "create table auth.users (id uuid primary key);",
      "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;",
      "create table public.adhdice_clean_tasks (id uuid primary key, user_id uuid not null references auth.users(id), title text not null);",
      "create table public.adhdice_home_todo_state (user_id uuid primary key references auth.users(id) on delete cascade, state jsonb not null, client_updated_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), constraint adhdice_home_todo_state_object check (jsonb_typeof(state) = 'object'));",
      "do $$ begin create role anon; exception when duplicate_object then null; end $$;",
      "do $$ begin create role authenticated; exception when duplicate_object then null; end $$;",
      "do $$ begin create role service_role; exception when duplicate_object then null; end $$;",
      "alter table public.adhdice_home_todo_state enable row level security;",
      "create policy home_select on public.adhdice_home_todo_state for select to authenticated using (auth.uid() = user_id);",
      "create policy home_insert on public.adhdice_home_todo_state for insert to authenticated with check (auth.uid() = user_id);",
      "create policy home_update on public.adhdice_home_todo_state for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);",
      "create policy home_delete on public.adhdice_home_todo_state for delete to authenticated using (auth.uid() = user_id);",
      "grant select, insert, update, delete on public.adhdice_home_todo_state to authenticated;",
      "insert into auth.users (id) values ('" + userA + "'), ('" + userB + "'), ('" + userC + "');",
      "insert into public.adhdice_clean_tasks (id, user_id, title) values ('" + taskA + "', '" + userA + "', 'Task A'), ('" + taskB + "', '" + userB + "', 'Task B'), ('" + taskC + "', '" + userC + "', 'Task C');",
      "insert into public.adhdice_home_todo_state (user_id, state, client_updated_at) values " +
        "('" + userA + "', " + jsonLiteral(homeState([taskA], "initial-a")) + ", now()), " +
        "('" + userB + "', " + jsonLiteral(homeState([taskB], "initial-b")) + ", now()), " +
        "('" + userC + "', " + jsonLiteral(homeState([taskC], "initial-c")) + ", now());",
    ].join("\n");
    writeFileSync(setupPath, setup);
    run(psql, [...connectionArgs(database), "-X", "-v", "ON_ERROR_STOP=1", "-f", setupPath]);
    run(psql, [...connectionArgs(database), "-X", "-v", "ON_ERROR_STOP=1", "-f", migrationPath]);

    const concurrentCapture = "select public.adhdice_capture_home_recovery_point('" + userA + "', 'manual', '7.16.166')->>'status';";
    const captureArgs = [...connectionArgs(database), "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", concurrentCapture];
    const simultaneousCaptureResults = await Promise.all([
      runAsync(psql, captureArgs),
      runAsync(psql, captureArgs),
    ]);
    assert.deepEqual(simultaneousCaptureResults.sort(), ["created", "unchanged"]);

    const cycle = JSON.parse(runSql(database, "select public.run_home_recovery_checkpoint_cycle();")) as Record<string, number>;
    assert.equal(cycle.created, 2);
    assert.equal(cycle.unchanged, 1);
    assert.equal(runSql(database,
      "select public.adhdice_home_recovery_checkpoint_due('" + userA + "', (select last_scheduled_attempt_at + interval '4 hours' - interval '1 second' from public.adhdice_recovery_status where owner_id = '" + userA + "'))::text;"
    ), "false");
    assert.equal(runSql(database,
      "select public.adhdice_home_recovery_checkpoint_due('" + userA + "', (select last_scheduled_attempt_at + interval '4 hours' from public.adhdice_recovery_status where owner_id = '" + userA + "'))::text;"
    ), "true");

    assert.equal(runSql(database, "select has_table_privilege('authenticated', 'public.adhdice_recovery_points', 'select')::text;"), "false");
    const userAList = parseLastJson(runSql(database, userSql(userA, "select public.list_home_recovery_points(10);")));
    const userBCreate = parseLastJson(runSql(database, userSql(userB, "select public.create_home_recovery_point('7.16.166');")));
    const userCCreate = parseLastJson(runSql(database, userSql(userC, "select public.create_home_recovery_point('7.16.166');")));
    assert.equal(userBCreate.status, "unchanged");
    assert.equal(userCCreate.status, "unchanged");
    const userBPointId = userBCreate.recovery_point_id as string;
    const userCPointId = userCCreate.recovery_point_id as string;
    assert.ok(!JSON.stringify(userAList).includes(userBPointId));
    assert.equal(parseLastJson(runSql(database, userSql(userA, "select public.preview_home_recovery_point('" + userBPointId + "');"))).status, "not_found");
    assert.doesNotMatch(JSON.stringify(userAList), /"payload":/);
    assert.throws(() => runSql(database, userSql(userA, "select count(*) from public.adhdice_recovery_points;")), /permission denied/i);

    runSql(database, "do $$ declare i integer; begin for i in 1..10 loop update public.adhdice_home_todo_state set state = jsonb_set(state, '{scratchpadText}', to_jsonb(('history-' || i)::text), true), client_updated_at = clock_timestamp(), state_revision = state_revision + 1 where user_id = '" + userA + "'; perform public.adhdice_capture_home_recovery_point('" + userA + "', 'manual', '7.16.166'); end loop; end $$;");
    assert.equal(runSql(database, "select count(*) from public.adhdice_recovery_points where owner_id = '" + userA + "';"), "10");
    const protectedId = runSql(database, "select id::text from public.adhdice_recovery_points where owner_id = '" + userA + "' order by created_at, id limit 1;");
    runSql(database, "update public.adhdice_recovery_points set is_protected = true, protected_at = now(), protected_reason = 'retention-test' where id = '" + protectedId + "';");
    runSql(database, "update public.adhdice_home_todo_state set state = jsonb_set(state, '{scratchpadText}', to_jsonb('after-protection'::text), true), client_updated_at = clock_timestamp(), state_revision = state_revision + 1 where user_id = '" + userA + "';");
    assert.equal(parseLastJson(runSql(database, "select public.adhdice_capture_home_recovery_point('" + userA + "', 'manual', '7.16.166');")).status, "created");
    assert.equal(runSql(database, "select count(*) from public.adhdice_recovery_points where owner_id = '" + userA + "' and id = '" + protectedId + "' and is_protected;"), "1");
    runSql(database, "update public.adhdice_recovery_points set is_protected = true, protected_at = coalesce(protected_at, now()), protected_reason = coalesce(protected_reason, 'retention-test') where owner_id = '" + userA + "';");
    runSql(database, "update public.adhdice_home_todo_state set state = jsonb_set(state, '{scratchpadText}', to_jsonb('all-protected'::text), true), client_updated_at = clock_timestamp(), state_revision = state_revision + 1 where user_id = '" + userA + "';");
    const blockedRetention = parseLastJson(runSql(database, "select public.adhdice_capture_home_recovery_point('" + userA + "', 'manual', '7.16.166');"));
    assert.equal(blockedRetention.status, "failed");
    assert.match(String(blockedRetention.reason), /retention_blocked_by_protected_points/);
    assert.equal(runSql(database, "select count(*) from public.adhdice_recovery_points where owner_id = '" + userA + "';"), "10");
    const retentionRestorePreview = parseLastJson(runSql(database, userSql(userA,
      "select public.preview_home_recovery_point('" + protectedId + "');"
    )));
    const retentionRestoreBefore = homeRowSnapshot(database, userA);
    const retentionRestore = parseLastJson(runSql(database, userSql(userA,
      "select public.restore_home_recovery_point('" + protectedId + "', " + Number(retentionRestorePreview.current_state_revision) + ", " + Number(retentionRestorePreview.current_restore_generation) + ", true);"
    )));
    assert.equal(retentionRestore.status, "restore_failed");
    assert.equal(retentionRestore.reason, "pre_restore_checkpoint_failed");
    assert.match(String((retentionRestore.pre_restore_checkpoint as Record<string, unknown>).reason), /retention_blocked_by_protected_points/);
    assert.deepEqual(homeRowSnapshot(database, userA), retentionRestoreBefore);
    assert.equal(runSql(database, "select count(*) from public.adhdice_recovery_points where owner_id = '" + userA + "';"), "10");

    runSql(database, "update public.adhdice_recovery_settings set max_recovery_bytes = 1, warning_recovery_bytes = 0 where singleton;");
    runSql(database, "update public.adhdice_home_todo_state set state = jsonb_set(state, '{scratchpadText}', to_jsonb('budget-exhaustion'::text), true), client_updated_at = clock_timestamp(), state_revision = state_revision + 1 where user_id = '" + userB + "';");
    const budgetFailure = parseLastJson(runSql(database, "select public.adhdice_capture_home_recovery_point('" + userB + "', 'manual', '7.16.166');"));
    assert.equal(budgetFailure.status, "failed");
    assert.match(String(budgetFailure.reason), /recovery_storage_limit_reached/);
    assert.equal(runSql(database, "select count(*) from public.adhdice_recovery_points where owner_id = '" + userB + "';"), "1");
    assert.equal(runSql(database, "select count(*) from public.adhdice_recovery_points where owner_id = '" + userB + "' and verification_status = 'verified';"), "1");
    assert.match(runSql(database, "select last_failure_reason from public.adhdice_recovery_status where owner_id = '" + userB + "';"), /recovery_storage_limit_reached/);
    runSql(database, "update public.adhdice_recovery_settings set max_recovery_bytes = 52428800, warning_recovery_bytes = 41943040 where singleton;");

    runSql(database, "update public.adhdice_recovery_settings set max_database_bytes = pg_database_size(current_database()) where singleton;");
    runSql(database, "update public.adhdice_home_todo_state set state = jsonb_set(state, '{scratchpadText}', to_jsonb('database-capacity'::text), true), client_updated_at = clock_timestamp(), state_revision = state_revision + 1 where user_id = '" + userB + "';");
    const databaseFailure = parseLastJson(runSql(database, "select public.adhdice_capture_home_recovery_point('" + userB + "', 'manual', '7.16.166');"));
    assert.equal(databaseFailure.status, "failed");
    assert.match(String(databaseFailure.reason), /database_capacity_reached/);
    runSql(database, "update public.adhdice_recovery_settings set max_database_bytes = 419430400 where singleton;");

    const storageRestorePreview = parseLastJson(runSql(database, userSql(userB,
      "select public.preview_home_recovery_point('" + userBPointId + "');"
    )));
    const storageRestoreBefore = homeRowSnapshot(database, userB);
    runSql(database, "update public.adhdice_recovery_settings set max_recovery_bytes = 1, warning_recovery_bytes = 0 where singleton;");
    const storageBlockedRestore = parseLastJson(runSql(database, userSql(userB,
      "select public.restore_home_recovery_point('" + userBPointId + "', " + Number(storageRestorePreview.current_state_revision) + ", " + Number(storageRestorePreview.current_restore_generation) + ", true);"
    )));
    assert.equal(storageBlockedRestore.status, "restore_failed");
    assert.equal(storageBlockedRestore.reason, "pre_restore_checkpoint_failed");
    assert.match(String((storageBlockedRestore.pre_restore_checkpoint as Record<string, unknown>).reason), /recovery_storage_limit_reached/);
    assert.deepEqual(homeRowSnapshot(database, userB), storageRestoreBefore);
    assert.equal(runSql(database, "select count(*) from public.adhdice_recovery_points where owner_id = '" + userB + "';"), "1");
    runSql(database, "update public.adhdice_recovery_settings set max_recovery_bytes = 52428800, warning_recovery_bytes = 41943040 where singleton;");
    const safeRetryCheckpoint = parseLastJson(runSql(database,
      "select public.adhdice_capture_home_recovery_point('" + userB + "', 'protected', '7.16.166', 'pre_restore');"
    ));
    assert.equal(safeRetryCheckpoint.status, "created");
    const safeRetry = parseLastJson(runSql(database, userSql(userB,
      "select public.restore_home_recovery_point('" + userBPointId + "', " + Number(storageRestorePreview.current_state_revision) + ", " + Number(storageRestorePreview.current_restore_generation) + ", true);"
    )));
    assert.equal(safeRetry.status, "restored");
    assert.equal(safeRetry.restore_generation, 1);
    assert.equal((safeRetry.pre_restore_checkpoint as Record<string, unknown>).status, "unchanged");
    assert.equal(
      (safeRetry.pre_restore_checkpoint as Record<string, unknown>).recovery_point_id,
      safeRetryCheckpoint.recovery_point_id,
    );
    assert.equal(runSql(database,
      "select count(*) from public.adhdice_recovery_points where id = '" + String(safeRetryCheckpoint.recovery_point_id) + "' and owner_id = '" + userB + "' and verification_status = 'verified' and is_protected and protected_at is not null and nullif(trim(protected_reason), '') is not null;"
    ), "1");
    const safeRetryState = homeRowSnapshot(database, userB);
    const repeatedRestore = parseLastJson(runSql(database, userSql(userB,
      "select public.restore_home_recovery_point('" + userBPointId + "', " + Number(storageRestorePreview.current_state_revision) + ", " + Number(storageRestorePreview.current_restore_generation) + ", true);"
    )));
    assert.equal(repeatedRestore.status, "restore_conflict");
    assert.deepEqual(homeRowSnapshot(database, userB), safeRetryState);

    const userCPreview = parseLastJson(runSql(database, userSql(userC, "select public.preview_home_recovery_point('" + userCPointId + "');")));
    assert.equal(userCPreview.restorable, true);
    runSql(database, "delete from public.adhdice_clean_tasks where id = '" + taskC + "';");
    const missingTaskPreview = parseLastJson(runSql(database, userSql(userC, "select public.preview_home_recovery_point('" + userCPointId + "');")));
    assert.equal(missingTaskPreview.restorable, false);
    assert.deepEqual(missingTaskPreview.missing_task_ids, [taskC]);
    const userCRevision = Number(runSql(database, "select state_revision from public.adhdice_home_todo_state where user_id = '" + userC + "';"));
    const missingTaskRestore = parseLastJson(runSql(database, userSql(userC,
      "select public.restore_home_recovery_point('" + userCPointId + "', " + userCRevision + ", 0, true);"
    )));
    assert.equal(missingTaskRestore.status, "missing_task_references");

    const userBPointPreview = parseLastJson(runSql(database, userSql(userB, "select public.preview_home_recovery_point('" + userBPointId + "');")));
    const changedState = homeState([], "changed-before-restore");
    changedState.clientUpdatedAt = "2026-10-14T13:00:00.000Z";
    const savedChange = parseLastJson(runSql(database, userSql(userB,
      "select public.save_home_todo_state(" + jsonLiteral(changedState) + ", '2026-10-14T13:00:00Z', " + Number(userBPointPreview.current_restore_generation) + ", " + Number(userBPointPreview.current_state_revision) + ");"
    )));
    assert.equal(savedChange.status, "saved");
    const stalePreviewRestore = parseLastJson(runSql(database, userSql(userB,
      "select public.restore_home_recovery_point('" + userBPointId + "', " + Number(userBPointPreview.current_state_revision) + ", " + Number(userBPointPreview.current_restore_generation) + ", true);"
    )));
    assert.equal(stalePreviewRestore.status, "restore_conflict");

    const freshPreview = parseLastJson(runSql(database, userSql(userB, "select public.preview_home_recovery_point('" + userBPointId + "');")));
    const restored = parseLastJson(runSql(database, userSql(userB,
      "select public.restore_home_recovery_point('" + userBPointId + "', " + Number(freshPreview.current_state_revision) + ", " + Number(freshPreview.current_restore_generation) + ", true);"
    )));
    assert.equal(restored.status, "restored");
    assert.equal(restored.restore_generation, 2);
    assert.deepEqual((restored.state as Record<string, unknown>).taskIds, [taskB]);
    assert.throws(
      () => run(psql, [...connectionArgs(database), "-X", "-v", "ON_ERROR_STOP=1", "-f", join(repositoryRoot, "supabase/rollback_home_backup_recovery_7_16_165.sql")]),
      /fix forward: a Home restore generation exists/i,
    );
    assert.equal(runSql(database, "select has_table_privilege('authenticated', 'public.adhdice_home_todo_state', 'update')::text;"), "false");
    const preRestoreCheckpoint = restored.pre_restore_checkpoint as Record<string, unknown>;
    assert.equal(preRestoreCheckpoint.status, "created");
    const staleCache = homeState([], "stale-cache");
    staleCache.clientUpdatedAt = "2099-01-01T00:00:00.000Z";
    const staleSave = parseLastJson(runSql(database, userSql(userB,
      "select public.save_home_todo_state(" + jsonLiteral(staleCache) + ", '2099-01-01T00:00:00Z', 0, 0);"
    )));
    assert.equal(staleSave.status, "restore_conflict");
    assert.equal(staleSave.restore_generation, 2);
    assert.deepEqual((staleSave.state as Record<string, unknown>).taskIds, [taskB]);

    const preRestoreId = preRestoreCheckpoint.recovery_point_id as string;
    const freshBPreview = parseLastJson(runSql(database, userSql(userB, "select public.preview_home_recovery_point('" + preRestoreId + "');")));
    const expectedRevision = Number(freshBPreview.current_state_revision);
    const staleClientA = homeState([], "same-generation-client-a");
    staleClientA.clientUpdatedAt = "2026-10-14T14:00:00.000Z";
    const staleClientB = homeState([], "same-generation-client-b");
    staleClientB.clientUpdatedAt = "2026-10-14T14:01:00.000Z";
    const staleClientSaveSql = (state: ReturnType<typeof homeState>) => userSql(userB,
      "select public.save_home_todo_state(" + jsonLiteral(state) + ", '" + state.clientUpdatedAt + "', " + Number(freshBPreview.current_restore_generation) + ", " + expectedRevision + ");"
    );
    const staleClientSaveArgs = (sql: string) => [...connectionArgs(database), "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql];
    const [staleClientAOutput, staleClientBOutput] = await Promise.all([
      runAsync(psql, staleClientSaveArgs(staleClientSaveSql(staleClientA))),
      runAsync(psql, staleClientSaveArgs(staleClientSaveSql(staleClientB))),
    ]);
    const staleClientResults = [parseLastJson(staleClientAOutput), parseLastJson(staleClientBOutput)];
    assert.deepEqual(staleClientResults.map((result) => result.status).sort(), ["saved", "state_conflict"]);
    const winningSave = staleClientResults.find((result) => result.status === "saved")!;
    const rejectedSave = staleClientResults.find((result) => result.status === "state_conflict")!;
    assert.deepEqual(rejectedSave.state, winningSave.state);
    assert.equal(rejectedSave.state_revision, expectedRevision + 1);
    assert.equal(rejectedSave.restore_generation, Number(freshBPreview.current_restore_generation));

    const racePreview = parseLastJson(runSql(database, userSql(userB, "select public.preview_home_recovery_point('" + preRestoreId + "');")));
    const raceExpectedRevision = Number(racePreview.current_state_revision);
    const concurrentState = homeState([], "simultaneous-client-write");
    concurrentState.clientUpdatedAt = "2026-10-14T14:02:00.000Z";
    const raceSaveSql = userSql(userB,
      "select public.save_home_todo_state(" + jsonLiteral(concurrentState) + ", '2026-10-14T14:02:00Z', " + Number(racePreview.current_restore_generation) + ", " + raceExpectedRevision + ");"
    );
    const raceRestoreSql = userSql(userB,
      "select public.restore_home_recovery_point('" + preRestoreId + "', " + raceExpectedRevision + ", " + Number(racePreview.current_restore_generation) + ", true);"
    );
    const raceArgs = (sql: string) => [...connectionArgs(database), "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql];
    const [raceSaveOutput, raceRestoreOutput] = await Promise.all([
      runAsync(psql, raceArgs(raceSaveSql)),
      runAsync(psql, raceArgs(raceRestoreSql)),
    ]);
    const raceSave = parseLastJson(raceSaveOutput);
    const raceRestore = parseLastJson(raceRestoreOutput);
    assert.ok(
      (raceSave.status === "saved" && raceRestore.status === "restore_conflict")
      || (raceSave.status === "restore_conflict" && raceRestore.status === "restored"),
      "concurrent Home save and restore must serialize as a save-wins conflict or a restore-wins generation conflict",
    );

    const protectedUnchanged = parseLastJson(runSql(database,
      "select public.adhdice_capture_home_recovery_point('" + userB + "', 'protected', '7.16.166', 'pre_restore');"
    ));
    assert.equal(protectedUnchanged.status, "created");
    const unchangedRestorePreview = parseLastJson(runSql(database, userSql(userB,
      "select public.preview_home_recovery_point('" + userBPointId + "');"
    )));
    const unchangedRestore = parseLastJson(runSql(database, userSql(userB,
      "select public.restore_home_recovery_point('" + userBPointId + "', " + Number(unchangedRestorePreview.current_state_revision) + ", " + Number(unchangedRestorePreview.current_restore_generation) + ", true);"
    )));
    assert.equal(unchangedRestore.status, "restored");
    assert.equal((unchangedRestore.pre_restore_checkpoint as Record<string, unknown>).status, "unchanged");
    assert.equal(
      (unchangedRestore.pre_restore_checkpoint as Record<string, unknown>).recovery_point_id,
      protectedUnchanged.recovery_point_id,
    );
    assert.equal(runSql(database,
      "select count(*) from public.adhdice_recovery_points where id = '" + String(protectedUnchanged.recovery_point_id) + "' and owner_id = '" + userB + "' and verification_status = 'verified' and is_protected and protected_at is not null and nullif(trim(protected_reason), '') is not null;"
    ), "1");

    const atomicPreview = parseLastJson(runSql(database, userSql(userB,
      "select public.preview_home_recovery_point('" + userBPointId + "');"
    )));
    const atomicBefore = homeRowSnapshot(database, userB);
    const recoveryPointCountBeforeAtomicFailure = runSql(database,
      "select count(*) from public.adhdice_recovery_points where owner_id = '" + userB + "';"
    );
    runSql(database,
      "create function public.reject_home_recovery_restore() returns trigger language plpgsql as $$ begin raise exception 'restore_atomicity_test'; end $$; " +
      "create trigger reject_home_recovery_restore before update on public.adhdice_home_todo_state for each row execute function public.reject_home_recovery_restore();"
    );
    assert.throws(() => run(psql, [
      ...connectionArgs(database), "-X", "-v", "ON_ERROR_STOP=1", "-c",
      userSql(userB,
        "select public.restore_home_recovery_point('" + userBPointId + "', " + Number(atomicPreview.current_state_revision) + ", " + Number(atomicPreview.current_restore_generation) + ", true);"
      ),
    ]), /restore_atomicity_test/);
    runSql(database, "drop trigger reject_home_recovery_restore on public.adhdice_home_todo_state; drop function public.reject_home_recovery_restore();");
    assert.deepEqual(homeRowSnapshot(database, userB), atomicBefore);
    assert.equal(runSql(database,
      "select count(*) from public.adhdice_recovery_points where owner_id = '" + userB + "';"
    ), recoveryPointCountBeforeAtomicFailure);

    const corruptPointId = runSql(database, "select id::text from public.adhdice_recovery_points where owner_id = '" + userA + "' order by created_at desc, id desc limit 1;");
    runSql(database, "update public.adhdice_recovery_points set payload = '{\"homeTodo\":{\"state\":{\"schemaVersion\":8,\"taskIds\":[]}}}'::jsonb where id = '" + corruptPointId + "';");
    const corruptPreview = parseLastJson(runSql(database, userSql(userA, "select public.preview_home_recovery_point('" + corruptPointId + "');")));
    assert.equal(corruptPreview.integrity_valid, false);
    const userARevision = Number(runSql(database, "select state_revision from public.adhdice_home_todo_state where user_id = '" + userA + "';"));
    const corruptRestore = parseLastJson(runSql(database, userSql(userA,
      "select public.restore_home_recovery_point('" + corruptPointId + "', " + userARevision + ", 0, true);"
    )));
    assert.equal(corruptRestore.status, "invalid_recovery_point");

    const metrics = parseLastJson(runSql(database, userSql(userB, "select public.home_recovery_status();")));
    assert.ok(Number(metrics.database_bytes) > 0);
    assert.ok(Number(metrics.recovery_storage_bytes) > 0);
    assert.ok(Number(metrics.recovery_point_count) <= Number(metrics.max_recovery_points));
  } finally {
    if (databaseCreated) {
      try {
        run(dropdb, ["-h", pgHost!, "-p", pgPort, "-U", pgUser, "--if-exists", database]);
      } catch {
        // Keep the original assertion or SQL failure as the test result.
      }
    }
    rmSync(scratch, { recursive: true, force: true });
  }
});
