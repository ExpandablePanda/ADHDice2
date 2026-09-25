import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createTaskEntityReconciliationCoordinator,
  loadCanonicalTaskEntities,
  mergeTaskEntitySnapshot,
} from "../src/lib/task-realtime-reconciliation.ts";

const workspaceSource = readFileSync(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const taskRealtimeSource = workspaceSource.slice(
  workspaceSource.indexOf('table: "adhdice_clean_tasks"'),
  workspaceSource.indexOf('        .subscribe((status)', workspaceSource.indexOf('table: "adhdice_clean_tasks"')),
);
const entityReconcileSource = workspaceSource.slice(
  workspaceSource.indexOf("async function loadLatestTaskScheduleBoundaries"),
  workspaceSource.indexOf("function shouldReconnectTaskChannel"),
);

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test("normal UPDATE reads only the affected Task and latest boundary, then preserves unrelated state", async () => {
  const calls: Array<{ kind: string; ids: string[] }> = [];
  const currentUnrelated = { id: "unrelated", title: "Keep identity" };
  const currentTask = { id: "task-1", title: "Old", revision: 1 };
  const authoritativeTask = {
    id: "task-1",
    title: "New",
    revision: 2,
    canonicalization_status: "canonical_runtime",
    terminal_state: "active",
    container_state: "active",
  };
  const snapshot = await loadCanonicalTaskEntities(
    ["task-1"],
    async (ids) => {
      calls.push({ kind: "tasks", ids });
      return { data: [authoritativeTask], error: null };
    },
    async (ids) => {
      calls.push({ kind: "boundaries", ids });
      return { data: [{ entity_id: "task-1" }], error: null };
    },
  );
  const merged = mergeTaskEntitySnapshot([currentUnrelated, currentTask], ["task-1"], snapshot.taskResult.data ?? []);

  assert.deepEqual(calls, [
    { kind: "tasks", ids: ["task-1"] },
    { kind: "boundaries", ids: ["task-1"] },
  ]);
  assert.equal(merged.tasks[0], currentUnrelated);
  assert.equal(merged.tasks[1], authoritativeTask);
  assert.equal(merged.outcomes.get("task-1"), "merged");
});

test("INSERT adds the authoritative Task and attaches the required boundary scope", async () => {
  const boundaryIds: string[][] = [];
  const snapshot = await loadCanonicalTaskEntities(
    ["new-task"],
    async (ids) => ({
      data: [{
        id: ids[0]!,
        canonicalization_status: "canonical_runtime",
        terminal_state: "active",
        container_state: "active",
      }],
      error: null,
    }),
    async (ids) => {
      boundaryIds.push(ids);
      return { data: [{ entity_id: "new-task" }], error: null };
    },
  );
  const merged = mergeTaskEntitySnapshot([], ["new-task"], snapshot.taskResult.data ?? []);

  assert.deepEqual(boundaryIds, [["new-task"]]);
  assert.equal(merged.tasks[0]?.id, "new-task");
  assert.equal(merged.outcomes.get("new-task"), "inserted");
});

test("metadata, status, canonical revision, and hierarchy changes use the same targeted merge", () => {
  const unchanged = { id: "other", title: "Other" };
  const current = { id: "task-1", title: "Old", status: "pending", canonical_revision: 3, parent_task_id: "parent-a" };
  const next = { ...current, title: "New", status: "in_progress", canonical_revision: 4, parent_task_id: "parent-b" };
  const result = mergeTaskEntitySnapshot([unchanged, current], ["task-1"], [next]);

  assert.equal(result.tasks[0], unchanged);
  assert.equal(result.tasks[1], next);
  assert.equal(result.outcomes.get("task-1"), "merged");
  assert.equal((result.tasks[1] as typeof next).parent_task_id, "parent-b");
});

test("permanent deletion and hard DELETE remove only the authoritative entity", () => {
  const other = { id: "other", title: "Keep" };
  const deleted = { id: "deleted", title: "Remove" };
  const result = mergeTaskEntitySnapshot([other, deleted], ["deleted"], []);

  assert.deepEqual(result.tasks, [other]);
  assert.equal(result.outcomes.get("deleted"), "removed");
});

test("absent scoped rows do not require a boundary read and never turn a read error into deletion", async () => {
  let boundaryReads = 0;
  const absent = await loadCanonicalTaskEntities(
    ["deleted"],
    async () => ({ data: [], error: null }),
    async () => {
      boundaryReads += 1;
      return { data: [], error: null };
    },
  );
  const errored = await loadCanonicalTaskEntities(
    ["task-1"],
    async () => ({ data: null, error: { code: "NETWORK", message: "temporary" } }),
    async () => ({ data: [], error: null }),
  );

  assert.equal(boundaryReads, 0);
  assert.deepEqual(absent.taskResult.data, []);
  assert.equal(errored.taskResult.data, null);
  assert.equal(errored.taskResult.error?.code, "NETWORK");
});

test("active canonical Tasks reject incomplete targeted boundary state before publication", async () => {
  const snapshot = await loadCanonicalTaskEntities(
    ["task-1"],
    async () => ({
      data: [{
        id: "task-1",
        canonicalization_status: "canonical_proven",
        terminal_state: "active",
        container_state: "active",
      }],
      error: null,
    }),
    async () => ({ data: [], error: null }),
  );

  assert.equal(snapshot.boundaryResult?.data, null);
  assert.equal(snapshot.boundaryResult?.error?.code, "CANONICAL_TASK_SNAPSHOT_INCOMPLETE");
});

test("Task entity bursts deduplicate IDs and give in-flight events a trailing pass", async () => {
  const firstBatch = deferred<void>();
  const batches: string[][] = [];
  const coordinator = createTaskEntityReconciliationCoordinator(async (ids) => {
    batches.push(ids);
    if (batches.length === 1) await firstBatch.promise;
    return new Map(ids.map((id) => [id, id]));
  });

  const first = coordinator.request(["task-1", "task-1"]);
  await flushMicrotasks();
  const trailing = coordinator.request(["task-1", "task-2"]);
  firstBatch.resolve();

  assert.deepEqual([...await first], [["task-1", "task-1"]]);
  assert.deepEqual([...await trailing].sort(), [["task-1", "task-1"], ["task-2", "task-2"]]);
  assert.deepEqual(batches, [["task-1"], ["task-1", "task-2"]]);
  coordinator.dispose();
});

test("entity reconciliation is bounded instead of turning a burst into a workspace-wide batch", async () => {
  const batches: string[][] = [];
  const coordinator = createTaskEntityReconciliationCoordinator(
    async (ids) => {
      batches.push(ids);
      return new Map(ids.map((id) => [id, id]));
    },
    { maxBatchSize: 2 },
  );

  const result = await coordinator.request(["a", "b", "c", "d", "e"]);
  assert.deepEqual([...result.keys()], ["a", "b", "c", "d", "e"]);
  assert.deepEqual(batches, [["a", "b"], ["c", "d"], ["e"]]);
  coordinator.dispose();
});

test("workspace generation and unmount checks fence stale targeted results", () => {
  assert.match(entityReconcileSource, /!isActive \|\| !canApplyCoreWorkspaceResult()/);
  assert.match(entityReconcileSource, /phase: "after_read"/);
  assert.match(entityReconcileSource, /task_entity_reconcile_stale_generation_rejection/);
  assert.match(workspaceSource, /taskEntityReconciliationCoordinator\.dispose()/);
});

test("normal Task Realtime uses authoritative entity reconciliation and keeps local echo suppression", () => {
  assert.match(taskRealtimeSource, /shouldSkipTaskReloadRef\.current\?\.\(\{ eventType: payload\.eventType, taskId \}\)/);
  assert.ok(taskRealtimeSource.indexOf("shouldSkipTaskReloadRef.current") < taskRealtimeSource.indexOf("requestTaskEntityReconciliation"));
  assert.match(taskRealtimeSource, /requestTaskEntityReconciliation\(taskId, payload\.eventType\)/);
  assert.match(taskRealtimeSource, /realtime_missing_task_id/);
  assert.match(taskRealtimeSource, /reloadTaskRows\(\{ silent: true, source: "realtime_missing_task_id" \}\)/);
});

test("targeted Task reads exclude unrelated workspace authorities", () => {
  assert.match(entityReconcileSource, /from\("adhdice_clean_tasks"\)[\s\S]*\.in\("id", requestedTaskIds\)[\s\S]*\.is\("permanently_deleted_at", null\)/);
  assert.match(entityReconcileSource, /eq\("entity_id", taskId\)[\s\S]*order\("boundary_sequence", \{ ascending: false \}\)[\s\S]*limit\(1\)[\s\S]*maybeSingle\(\)/);
  for (const unrelatedTable of [
    "adhdice_task_history_facts",
    "adhdice_task_command_operations",
    "adhdice_task_occurrences",
    "adhdice_task_calendar_overrides",
    "adhdice_user_profiles",
    "adhdice_task_current_projections",
  ]) {
    assert.doesNotMatch(entityReconcileSource, new RegExp(`from\\(\"${unrelatedTable}\"\\)`));
  }
});

test("missing event IDs use the explicit broad correctness fallback and never guess an entity", () => {
  assert.match(taskRealtimeSource, /task_entity_reconcile_missing_event_id/);
  assert.match(taskRealtimeSource, /realtime_missing_task_id/);
  assert.doesNotMatch(taskRealtimeSource, /payload\.new\?\.[a-z_]+ \|\| payload\.old\?\.[a-z_]+ \|\| tasksRef/);
});

test("missing required boundaries use a diagnostic broad fallback while read errors retain local state", () => {
  assert.match(entityReconcileSource, /missingBoundary = error\?\.code === "CANONICAL_TASK_SNAPSHOT_INCOMPLETE"/);
  assert.match(entityReconcileSource, /task_entity_reconcile_broad_fallback/);
  assert.match(entityReconcileSource, /source: "targeted_missing_boundary"/);
  assert.match(entityReconcileSource, /status: "error"/);
  assert.doesNotMatch(entityReconcileSource, /status: "removed" as const/);
});

test("intentional broad paths remain on the canonical full snapshot", () => {
  const reload = workspaceSource.slice(
    workspaceSource.indexOf("async function reloadTaskRows"),
    workspaceSource.indexOf("type TaskEntityReconcileOutcome"),
  );
  const core = workspaceSource.slice(
    workspaceSource.indexOf("async function loadCoreWorkspaceData"),
    workspaceSource.indexOf("const requestCoreWorkspaceRefresh"),
  );
  const rollover = workspaceSource.slice(
    workspaceSource.indexOf("rolloverWorkspaceReconciliationRef.current = async () =>"),
    workspaceSource.indexOf("prepareTaskMutationRef.current", workspaceSource.indexOf("rolloverWorkspaceReconciliationRef.current = async () =>")),
  );

  assert.match(reload, /loadCanonicalTaskSnapshot\([\s\S]*createTaskRowsRequest\(\)[\s\S]*loadTaskScheduleBoundaries\(taskIds\)/);
  assert.match(core, /loadCanonicalTaskSnapshot\([\s\S]*createTaskRowsRequest\(\)[\s\S]*loadTaskScheduleBoundaries\(taskIds\)/);
  assert.match(rollover, /reloadTaskRows\(\{ silent: true, source: "rollover" \}\)/);
  assert.doesNotMatch(taskRealtimeSource, /reloadTaskRows\(\{ silent: true \}\)/);
});

test("Task Realtime projection checks remain revision-aware after targeted reconciliation", () => {
  assert.match(taskRealtimeSource, /previousTaskCanonicalRevision/);
  assert.match(taskRealtimeSource, /remoteCanonicalRevision <= previousTaskCanonicalRevision/);
  assert.match(taskRealtimeSource, /task_entity_reconcile_projection_requested/);
  assert.match(taskRealtimeSource, /requestTaskProjectionReconciliation/);
  assert.match(taskRealtimeSource, /task_entity_reconcile_projection_skipped/);
});

test("Task cascade deletes are handled as independent entity events", () => {
  assert.match(schemaSource, /parent_task_id uuid references public\.adhdice_clean_tasks\(id\) on delete cascade/i);
  assert.match(taskRealtimeSource, /payload\.old as \{ id\?: string \} \| null/);
  assert.match(taskRealtimeSource, /requestTaskEntityReconciliation\(taskId, payload\.eventType\)/);
});
