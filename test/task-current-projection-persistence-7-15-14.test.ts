import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  rebuildCurrentTaskProjection,
  type CurrentTaskProjectionRebuildDependencies,
  type TrustedCurrentTaskProjectionClient,
} from "../src/lib/task-current-projection-rebuild.ts";
import type { BuildCurrentTaskProjectionInput } from "../src/lib/task-current-projection.ts";
import type { TaskCurrentProjection } from "../src/lib/database.types.ts";

const commandSql = readFileSync(new URL("../supabase/add_task_state_command_rpc.sql", import.meta.url), "utf8");
const persistenceSql = readFileSync(new URL("../supabase/patch_task_current_projection_persistence_7_15_14.sql", import.meta.url), "utf8");
const verificationSql = readFileSync(new URL("../supabase/verify_task_current_projection_7_15_16.sql", import.meta.url), "utf8");
const readModelSource = readFileSync(new URL("../src/lib/task-state-canonical/read-model.ts", import.meta.url), "utf8");
const rebuildSource = readFileSync(new URL("../src/lib/task-current-projection-rebuild.ts", import.meta.url), "utf8");

function functionSource(source: string, name: string) {
  const start = source.indexOf(`create or replace function public.${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const end = source.indexOf("$function$;", start);
  assert.ok(end > start, `unterminated ${name}`);
  return source.slice(start, end + "$function$;".length);
}

const invalidationFunction = functionSource(
  persistenceSql,
  "adhdice_invalidate_task_current_projection_on_canonical_revision",
);
const repositoryRoot = process.cwd();
const psql = process.env.ADHDICE_SQL_COMPILE_PSQL_BIN ?? "psql";
const psqlDirectory = dirname(psql);
const createdb = join(psqlDirectory, "createdb");
const dropdb = join(psqlDirectory, "dropdb");
const sqlCompileHost = process.env.ADHDICE_SQL_COMPILE_PGHOST;
const sqlCompilePort = process.env.ADHDICE_SQL_COMPILE_PGPORT ?? "5432";

const projection = {
  user_id: "owner-1",
  entity_id: "task-1",
  entity_kind: "parent",
  display_status: "pending",
  current_effective_due_on: null,
  next_due_on: null,
  active_occurrence_id: null,
  active_occurrence_status: "none",
  handled_current_logical_day: false,
  last_handled_logical_date: null,
  last_handled_at: null,
  last_done_logical_date: null,
  last_done_at: null,
  current_positive_streak: 0,
  current_missed_streak: 0,
  canonical_task_revision: 4,
  history_sync_epoch: "00000000-0000-4000-8000-000000000001",
  history_source_revision: 0,
  history_source_fingerprint: "sha256:" + "a".repeat(64),
  schedule_boundary_revision: "sha256:" + "b".repeat(64),
  behavior_policy_revision: "sha256:" + "c".repeat(64),
  logical_day_settings_revision: 1,
  projected_logical_date: "2026-09-23",
  projection_schema_version: "task-current-projection-schema-v1",
  projection_algorithm_version: "task-current-projection-algorithm-v1",
  source_fingerprint: "sha256:" + "d".repeat(64),
  validity: "valid",
  created_at: "2026-09-23T12:00:00.000Z",
  updated_at: "2026-09-23T12:00:00.000Z",
} as unknown as TaskCurrentProjection;

const dependencies = (writeProjection: CurrentTaskProjectionRebuildDependencies["writeProjection"]): Partial<CurrentTaskProjectionRebuildDependencies> => ({
  loadCanonicalState: async () => ({ data: {} as never, error: null }),
  loadHistoryFence: async () => ({
    syncEpoch: projection.history_sync_epoch,
    sourceRevision: projection.history_source_revision,
    frontier: null,
  }),
  loadBehaviorContext: async () => ({ context: {}, error: null }),
  loadSourceFences: async () => ({
    scheduleBoundaryRevision: projection.schedule_boundary_revision,
    behaviorPolicyRevision: projection.behavior_policy_revision,
  }),
  buildProjection: () => projection,
  writeProjection,
});

const adminClient = {} as TrustedCurrentTaskProjectionClient;

test("7.15.14 accepts the pre-ledger revision-zero History baseline", () => {
  assert.match(rebuildSource, /sourceRevision: 0/);
  assert.match(rebuildSource, /frontier: null/);
  assert.match(readModelSource, /\.eq\("entity_id", input\.taskId\)[\s\S]*adhdice_task_history_facts/);
  assert.match(rebuildSource, /adhdice_task_history_changes[\s\S]*\.eq\("entity_id", taskId\)[\s\S]*\.limit\(1\)/);
});

test("canonical revision change invalidates only an existing affected projection", () => {
  assert.match(commandSql, /canonical_revision = v_next_revision/i);
  assert.match(persistenceSql, /create or replace function public\.adhdice_invalidate_task_current_projection_on_canonical_revision\(\)/i);
  assert.match(invalidationFunction, /update public\.adhdice_task_current_projections[\s\S]*set validity = 'repair_required'[\s\S]*updated_at = now\(\)[\s\S]*where user_id = new\.user_id[\s\S]*entity_id = new\.id/i);
  assert.match(persistenceSql, /after update of canonical_revision[\s\S]*for each row[\s\S]*when \(old\.canonical_revision is distinct from new\.canonical_revision\)/i);
  assert.match(persistenceSql, /old\.canonical_revision is distinct from new\.canonical_revision/i);
  assert.doesNotMatch(invalidationFunction, /insert into public\.adhdice_task_current_projections/i);
});

test("canonical command RPC is projection-agnostic and no dynamic source patch remains", () => {
  assert.doesNotMatch(commandSql, /adhdice_task_current_projections/i);
  assert.doesNotMatch(commandSql, /v_projection_inputs_changed|projection invalidation/i);
  assert.doesNotMatch(persistenceSql, /pg_get_functiondef|execute\s+replace/i);
  assert.doesNotMatch(persistenceSql, /adhdice_execute_task_state_command/i);
});

test("canonical revision trigger invalidates, preserves no-op updates, and does not fabricate rows", (t) => {
  if (!sqlCompileHost) {
    t.skip("set ADHDICE_SQL_COMPILE_PGHOST to run the disposable local PostgreSQL trigger regression");
    return;
  }
  assert.ok(sqlCompileHost.startsWith("/") || ["localhost", "127.0.0.1", "::1"].includes(sqlCompileHost));

  const scratch = mkdtempSync(join(tmpdir(), "adhdice-current-projection-trigger-"));
  const database = `adhdice_projection_trigger_${process.pid}_${Date.now()}`;
  const setupFile = join(scratch, "setup.sql");
  const triggerFile = join(scratch, "trigger.sql");
  const verificationFile = join(scratch, "verification.sql");
  const triggerStart = persistenceSql.indexOf("-- Canonical revision advancement is the atomic projection invalidation event.");
  const triggerEnd = persistenceSql.lastIndexOf("\ncommit;");
  assert.ok(triggerStart >= 0 && triggerEnd > triggerStart);

  const run = (file: string, output = false) => execFileSync(
    psql,
    ["-U", "postgres", "-h", sqlCompileHost, "-p", sqlCompilePort, "-d", database, "-v", "ON_ERROR_STOP=1", ...(output ? ["-At"] : []), "-f", file],
    { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  try {
    execFileSync(createdb, ["-U", "postgres", "-h", sqlCompileHost, "-p", sqlCompilePort, database], {
      cwd: repositoryRoot,
      stdio: "ignore",
    });
    writeFileSync(setupFile, `do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table public.adhdice_clean_tasks (
  id uuid primary key,
  user_id uuid not null,
  canonical_revision bigint
);
create table public.adhdice_task_current_projections (
  user_id uuid not null,
  entity_id uuid not null,
  validity text not null,
  updated_at timestamptz not null,
  primary key (user_id, entity_id)
);
`);
    run(setupFile);
    writeFileSync(triggerFile, persistenceSql.slice(triggerStart, triggerEnd));
    run(triggerFile);
    writeFileSync(verificationFile, `insert into public.adhdice_clean_tasks(id, user_id, canonical_revision)
values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 1);
insert into public.adhdice_task_current_projections(user_id, entity_id, validity, updated_at)
values ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'valid', '2000-01-01T00:00:00Z');
update public.adhdice_clean_tasks set canonical_revision = 2;
select validity = 'repair_required' and updated_at > '2000-01-01T00:00:00Z'
from public.adhdice_task_current_projections;
update public.adhdice_task_current_projections set validity = 'valid', updated_at = '2000-01-01T00:00:00Z';
update public.adhdice_clean_tasks set canonical_revision = 2;
select validity = 'valid' and updated_at = '2000-01-01T00:00:00Z'
from public.adhdice_task_current_projections;
delete from public.adhdice_task_current_projections;
update public.adhdice_clean_tasks set canonical_revision = 3;
select count(*) = 0 from public.adhdice_task_current_projections;
`);
    assert.deepEqual(run(verificationFile, true).trim().split("\n"), ["t", "t", "t"]);
  } finally {
    try {
      execFileSync(dropdb, ["--if-exists", "--force", "-U", "postgres", "-h", sqlCompileHost, "-p", sqlCompilePort, database], {
        cwd: repositoryRoot,
        stdio: "ignore",
      });
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
});

test("trusted projection writer is valid-only, fenced, monotonic, and browser-inaccessible", () => {
  assert.match(persistenceSql, /create or replace function public\.adhdice_upsert_task_current_projection\(\s*p_user_id uuid,\s*p_projection jsonb\s*\)/i);
  assert.match(persistenceSql, /security invoker/i);
  assert.doesNotMatch(persistenceSql, /adhdice_upsert_task_current_projection[\s\S]*security definer/i);
  assert.match(persistenceSql, /current_user <> 'service_role'/i);
  assert.match(persistenceSql, /p_projection->>'validity' is distinct from 'valid'/i);
  assert.match(persistenceSql, /v_candidate\.user_id is distinct from p_user_id/i);
  assert.match(persistenceSql, /v_candidate\.entity_kind is distinct from v_task\.entity_kind/i);
  assert.match(persistenceSql, /v_candidate\.canonical_task_revision is distinct from v_task\.canonical_revision/i);
  assert.match(persistenceSql, /v_candidate\.history_sync_epoch is distinct from v_sync_epoch/i);
  assert.match(persistenceSql, /max\(changes\.sequence\)[\s\S]*changes\.entity_id = v_candidate\.entity_id/i);
  assert.match(persistenceSql, /v_candidate\.logical_day_settings_revision is distinct from v_profile_settings_revision/i);
  assert.match(persistenceSql, /v_candidate\.projected_logical_date is distinct from public\.adhdice_effective_logical_date/i);
  assert.match(persistenceSql, /projection_schema_version is distinct from 'task-current-projection-schema-v1'/i);
  assert.match(persistenceSql, /history_source_fingerprint !~ '\^sha256:\[0-9a-f\]\{64\}\$'/i);
  assert.match(persistenceSql, /where projection\.updated_at <= excluded\.updated_at/i);
  assert.match(persistenceSql, /older than the stored projection/i);
  assert.match(persistenceSql, /revoke all on function public\.adhdice_upsert_task_current_projection\(uuid, jsonb\)\s+from public, anon, authenticated/i);
  assert.match(persistenceSql, /grant execute on function public\.adhdice_upsert_task_current_projection\(uuid, jsonb\)\s+to service_role/i);
  assert.match(persistenceSql, /revoke all on function public\.adhdice_invalidate_task_current_projection_on_canonical_revision\(\)\s+from public, anon, authenticated/i);
  assert.match(persistenceSql, /grant execute on function public\.adhdice_invalidate_task_current_projection_on_canonical_revision\(\)\s+to service_role/i);
});

test("deployment verification is read-only and covers the 7.15.16 install contract", () => {
  assert.match(verificationSql, /to_regclass\('public\.adhdice_task_current_projections'\)/i);
  assert.match(verificationSql, /projection_rows_before_backfill/i);
  assert.match(verificationSql, /canonical_revision_invalidation_trigger_exists/i);
  assert.match(verificationSql, /command_rpc_is_projection_agnostic/i);
  assert.match(verificationSql, /adhdice_upsert_task_current_projection\(uuid, jsonb\)/i);
  assert.match(verificationSql, /adhdice_get_task_current_projection_source_fences\(uuid, uuid, date\)/i);
  assert.match(verificationSql, /authenticated_cannot_insert_projection/i);
  assert.match(verificationSql, /history_entity_frontier_index_exists/i);
  assert.match(verificationSql, /task-current-projection-schema-v1/i);
  assert.match(verificationSql, /task-history-sync-v1/i);
  assert.doesNotMatch(verificationSql, /\b(insert|update|delete|truncate)\s+(into\s+)?public\./i);
});

test("rebuild writes one valid entity projection", async () => {
  const calls: Array<{ userId: string; projection: TaskCurrentProjection }> = [];
  const result = await rebuildCurrentTaskProjection({
    adminClient,
    userId: "owner-1",
    taskId: "task-1",
    projectedAt: "2026-09-23T12:00:00.000Z",
    dependencies: dependencies(async (_client, userId, candidate) => {
      calls.push({ userId, projection: candidate });
      return { data: { state: "written" }, error: null };
    }),
  });
  assert.equal(result.status, "written");
  assert.deepEqual(calls, [{ userId: "owner-1", projection }]);
});

test("stale writer fences are retryable and do not become a canonical failure", async () => {
  const result = await rebuildCurrentTaskProjection({
    adminClient,
    userId: "owner-1",
    taskId: "task-1",
    dependencies: dependencies(async () => ({
      data: null,
      error: { code: "40001", message: "Current Task projection entity History frontier is stale." },
    })),
  });
  assert.deepEqual(result, {
    status: "retryable",
    reason: "stale_projection_fence",
    message: "Current Task projection entity History frontier is stale.",
  });
});

test("schedule and behavior source-fence races reject the old calculated candidate", async () => {
  for (const field of ["schedule_boundary_revision", "behavior_policy_revision"] as const) {
    const calculatedFences = {
      scheduleBoundaryRevision: projection.schedule_boundary_revision,
      behaviorPolicyRevision: projection.behavior_policy_revision,
    };
    const currentFences = {
      ...calculatedFences,
      ...(field === "schedule_boundary_revision"
        ? { scheduleBoundaryRevision: "sha256:" + "e".repeat(64) }
        : { behaviorPolicyRevision: "sha256:" + "f".repeat(64) }),
    };
    const expectedCurrentFence = field === "schedule_boundary_revision"
      ? currentFences.scheduleBoundaryRevision
      : currentFences.behaviorPolicyRevision;
    const result = await rebuildCurrentTaskProjection({
      adminClient,
      userId: "owner-1",
      taskId: "task-1",
      dependencies: {
        ...dependencies(async (_client, _userId, candidate) => candidate[field] === expectedCurrentFence
          ? { data: { state: "written" }, error: null }
          : { data: null, error: { code: "40001", message: `${field} source fence is stale.` } }),
        loadSourceFences: async () => calculatedFences,
        buildProjection: (input: BuildCurrentTaskProjectionInput) => ({
          ...projection,
          schedule_boundary_revision: input.sourceFences!.scheduleBoundaryRevision,
          behavior_policy_revision: input.sourceFences!.behaviorPolicyRevision,
        }),
      },
    });
    assert.deepEqual(result, {
      status: "retryable",
      reason: "stale_projection_fence",
      message: `${field} source fence is stale.`,
    });
  }
});

test("a post-commit rebuild failure leaves the canonical command boundary untouched", async () => {
  let writerCalled = false;
  const result = await rebuildCurrentTaskProjection({
    adminClient,
    userId: "owner-1",
    taskId: "task-1",
    dependencies: dependencies(async () => {
      writerCalled = true;
      return { data: null, error: { code: "XX000", message: "writer unavailable" } };
    }),
  });
  assert.equal(writerCalled, true);
  assert.deepEqual(result, { status: "failed", reason: "projection_write_failed", message: "writer unavailable" });
  assert.match(commandSql, /update public\.adhdice_task_command_operations[\s\S]*set state = 'committed'/i);
  assert.doesNotMatch(rebuildSource, /adhdice_execute_task_state_command/);
});

test("an invalid calculator result never reaches the trusted writer", async () => {
  let writerCalled = false;
  const result = await rebuildCurrentTaskProjection({
    adminClient,
    userId: "owner-1",
    taskId: "task-1",
    dependencies: {
      ...dependencies(async () => {
        writerCalled = true;
        return { data: null, error: null };
      }),
      buildProjection: () => ({ ...projection, validity: "repair_required" }),
    },
  });
  assert.equal(writerCalled, false);
  assert.equal(result.status, "repair_required");
});

test("projection rebuild command-operation reads remain entity-scoped", () => {
  const commandRead = readModelSource.match(/client\.from\("adhdice_task_command_operations"\)[\s\S]*?\.order\("created_at"/i)?.[0] ?? "";
  assert.match(commandRead, /\.eq\("user_id", input\.userId\)/i);
  assert.match(commandRead, /\.eq\("entity_id", input\.taskId\)/i);
  assert.doesNotMatch(rebuildSource, /from\("adhdice_task_command_operations"\)/i);
  assert.doesNotMatch(rebuildSource, /from\("adhdice_task_history_facts"\)/i);
});
