import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createBoundedTaskProjectionReconciler,
  type ProjectionReconciliationAttempt,
} from "../src/lib/task-current-projection-reconciliation.ts";

const workspaceSource = readFileSync(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
const projectionChannelSource = workspaceSource.slice(
  workspaceSource.indexOf("const nextProjectionChannel"),
  workspaceSource.indexOf("const workspaceChannel = client.channel"),
);

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

test("7.15.28 creates one owner-filtered projection channel with independent lifecycle recovery", () => {
  assert.match(projectionChannelSource, /client\.channel\(`adhdice_task_current_projections:\$\{userId\}`\)/);
  assert.equal((projectionChannelSource.match(/client\.channel\(`adhdice_task_current_projections:/g) ?? []).length, 1);
  assert.equal((projectionChannelSource.match(/table: "adhdice_task_current_projections"/g) ?? []).length, 2);
  assert.equal((projectionChannelSource.match(/event: "(?:INSERT|UPDATE)"/g) ?? []).length, 2);
  assert.equal((projectionChannelSource.match(/filter: `user_id=eq\.\$\{userId\}`/g) ?? []).length, 2);
  for (const marker of [
    "projectionChannelRef",
    "projectionChannelStatusRef",
    "projectionChannelRemovalPromiseRef",
    "projectionChannelSubscriptionCountRef",
    "projectionChannelCleanupCountRef",
    "projectionChannelDebugIdsRef",
    "existingSubscription",
    "status === \"SUBSCRIBED\"",
    "status === \"CHANNEL_ERROR\" || status === \"TIMED_OUT\"",
    "projectionChannelStatusRef.current === \"CLOSED\"",
    "ensureProjectionChannelSubscribed",
  ]) {
    assert.match(workspaceSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(
    workspaceSource.slice(
      workspaceSource.indexOf("const workspaceChannel = client.channel"),
      workspaceSource.indexOf("return () => {", workspaceSource.indexOf("const workspaceChannel = client.channel")),
    ),
    /table: "adhdice_task_current_projections"/,
  );
});

test("one-entity reconciliation uses the named read columns and preserves local Task suppression", () => {
  assert.match(
    workspaceSource,
    /loadCurrentTaskProjectionForTask[\s\S]*?from\("adhdice_task_current_projections"\)[\s\S]*?select\(CURRENT_TASK_PROJECTION_READ_COLUMNS\)[\s\S]*?eq\("user_id", userId\)[\s\S]*?eq\("entity_id", entityId\)[\s\S]*?maybeSingle\(\)/,
  );
  assert.doesNotMatch(workspaceSource.slice(workspaceSource.indexOf("loadCurrentTaskProjectionForTask"), workspaceSource.indexOf("const projectionReconciler")), /select\("\*"\)/);
  assert.match(workspaceSource, /requestTaskEntityReconciliationAfterGap\(taskId, payload\.eventType\)\.then\([\s\S]*requestTaskProjectionReconciliation/);
  assert.match(workspaceSource, /if \(shouldSkip\) \{\s*return;\s*\}/);
  assert.doesNotMatch(projectionChannelSource, /shouldSkipTaskReload/);
  for (const marker of [
    "projection_reconcile_requested",
    "projection_reconcile_started",
    "projection_reconcile_result",
    "projection_reconcile_retry_scheduled",
    "projection_reconcile_completed",
    "projection_reconcile_cancelled",
    "retryDelayMs: 4500",
    "projectionReconciler.request(entityId, workspaceGeneration)",
  ]) {
    assert.match(workspaceSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("fresh immediate reconciliation merges once and completes without a retry", async () => {
  let loadCount = 0;
  const attempts: ProjectionReconciliationAttempt[] = [];
  const scheduled: Array<() => void> = [];
  let completed = 0;
  const reconciler = createBoundedTaskProjectionReconciler({
    isCurrentGeneration: () => true,
    isFresh: (projection) => projection?.fresh === true,
    load: async () => {
      loadCount += 1;
      return { fresh: true };
    },
    onCompleted: () => { completed += 1; },
    onResult: ({ attempt }) => { attempts.push(attempt); },
    schedule: (callback) => {
      scheduled.push(callback);
      return callback;
    },
    cancel: () => {},
  });

  await reconciler.request("task-1", 1);
  assert.equal(loadCount, 1);
  assert.deepEqual(attempts, ["immediate"]);
  assert.equal(scheduled.length, 0);
  assert.equal(completed, 1);
});

test("stale immediate reconciliation schedules exactly one retry and never polls a third time", async () => {
  let loadCount = 0;
  let rebuilt = false;
  const attempts: ProjectionReconciliationAttempt[] = [];
  const scheduled: Array<() => void> = [];
  const reconciler = createBoundedTaskProjectionReconciler({
    isCurrentGeneration: () => true,
    isFresh: (projection) => projection?.fresh === true,
    load: async () => {
      loadCount += 1;
      return { fresh: rebuilt };
    },
    onResult: ({ attempt }) => { attempts.push(attempt); },
    schedule: (callback) => {
      scheduled.push(callback);
      return callback;
    },
    cancel: () => {},
  });

  const pending = reconciler.request("task-1", 1);
  await flushMicrotasks();
  assert.equal(loadCount, 1);
  assert.equal(scheduled.length, 1);
  rebuilt = true;
  scheduled.shift()?.();
  await pending;
  assert.equal(loadCount, 2);
  assert.deepEqual(attempts, ["immediate", "retry"]);
  assert.equal(scheduled.length, 0);
});

test("duplicate requests coalesce and obsolete generations cancel before applying a result", async () => {
  let loadCount = 0;
  let activeGeneration = true;
  let resolveLoad!: (value: { fresh: boolean } | null) => void;
  const cancelled: string[] = [];
  const reconciler = createBoundedTaskProjectionReconciler({
    isCurrentGeneration: () => activeGeneration,
    isFresh: (projection) => projection?.fresh === true,
    load: () => {
      loadCount += 1;
      return new Promise((resolve) => { resolveLoad = resolve; });
    },
    onCancelled: (entityId) => { cancelled.push(entityId); },
    schedule: () => {
      throw new Error("retry should not be scheduled after cancellation");
    },
    cancel: () => {},
  });

  const first = reconciler.request("task-1", 1);
  const duplicate = reconciler.request("task-1", 1);
  assert.equal(first, duplicate);
  await flushMicrotasks();
  assert.equal(loadCount, 1);
  activeGeneration = false;
  resolveLoad(null);
  await first;
  assert.deepEqual(cancelled, ["task-1"]);
});
