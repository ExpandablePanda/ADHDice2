import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  rebuildCurrentTaskProjection,
  type CurrentTaskProjectionRebuildDependencies,
  type TrustedCurrentTaskProjectionClient,
} from "../src/lib/task-current-projection-rebuild.ts";
import type { TaskCurrentProjection } from "../src/lib/database.types.ts";

const commandSql = readFileSync(new URL("../supabase/add_task_state_command_rpc.sql", import.meta.url), "utf8");
const persistenceSql = readFileSync(new URL("../supabase/patch_task_current_projection_persistence_7_15_14.sql", import.meta.url), "utf8");
const readModelSource = readFileSync(new URL("../src/lib/task-state-canonical/read-model.ts", import.meta.url), "utf8");
const rebuildSource = readFileSync(new URL("../src/lib/task-current-projection-rebuild.ts", import.meta.url), "utf8");

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

test("canonical command invalidates only an existing affected projection", () => {
  assert.match(commandSql, /v_projection_inputs_changed\s+boolean/i);
  assert.match(commandSql, /update public\.adhdice_task_current_projections[\s\S]*set validity = 'repair_required'[\s\S]*where user_id = p_user_id[\s\S]*entity_id = v_entity_id/i);
  assert.doesNotMatch(commandSql, /insert into public\.adhdice_task_current_projections/i);
  assert.match(commandSql, /v_command_type <> 'reconcile_rollover'/i);
  assert.match(commandSql, /patch_key\.key <> 'canonicalization_status'/i);
  assert.ok(commandSql.indexOf("return v_operation.result_references || jsonb_build_object('was_replayed', true)")
    < commandSql.indexOf("update public.adhdice_task_current_projections"));
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
  assert.match(persistenceSql, /position\(v_marker in v_definition\) > 0/i);
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
