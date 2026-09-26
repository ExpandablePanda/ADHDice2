import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { Task } from "../src/lib/database.types.ts";
import {
  mergeCurrentTaskProjectionRows,
  resolveCurrentTaskProjectionReads,
  type CurrentTaskProjectionReadRow,
} from "../src/lib/task-current-projection-read.ts";
import {
  CURRENT_TASK_PROJECTION_ALGORITHM_VERSION,
  CURRENT_TASK_PROJECTION_SCHEMA_VERSION,
} from "../src/lib/task-current-projection.ts";
import {
  CURRENT_PROJECTION_LOGICAL_DAY_REFRESH_MAX_BATCHES,
  runCurrentProjectionLogicalDayRefresh,
  type ProjectionBackfillOperatorClient,
} from "../src/lib/task-current-projection-backfill-operator.ts";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const HISTORY_EPOCH = "00000000-0000-4000-8000-000000000099";
const TODAY = "2026-09-25";

const workspaceSource = readFileSync(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const backfillDomainSource = readFileSync(new URL("../supabase/functions/task-current-projection-backfill/domain.ts", import.meta.url), "utf8");
const refreshSql = readFileSync(new URL("../supabase/patch_task_current_projection_logical_day_refresh_7_15_46.sql", import.meta.url), "utf8");

function task(id: string): Task {
  return {
    id,
    user_id: USER_ID,
    status: "pending",
    due_on: TODAY,
    canonical_revision: 12,
    entity_kind: "parent",
  } as Task;
}

function projection(taskId: string, overrides: Partial<CurrentTaskProjectionReadRow> = {}): CurrentTaskProjectionReadRow {
  return {
    user_id: USER_ID,
    entity_id: taskId,
    entity_kind: "parent",
    display_status: "pending",
    next_due_on: TODAY,
    handled_current_logical_day: false,
    last_handled_logical_date: null,
    last_handled_at: null,
    last_handled_at_kind: null,
    last_done_logical_date: null,
    last_done_at: null,
    last_done_at_kind: null,
    current_positive_streak: 0,
    current_missed_streak: 0,
    canonical_task_revision: 12,
    history_sync_epoch: HISTORY_EPOCH,
    history_source_revision: 1,
    logical_day_settings_revision: 1,
    projected_logical_date: TODAY,
    projection_schema_version: CURRENT_TASK_PROJECTION_SCHEMA_VERSION,
    projection_algorithm_version: CURRENT_TASK_PROJECTION_ALGORITHM_VERSION,
    validity: "valid",
    updated_at: `${TODAY}T12:00:00.000Z`,
    ...overrides,
  };
}

function resolve(tasks: Task[], projectionsByTaskId: Record<string, CurrentTaskProjectionReadRow>) {
  return resolveCurrentTaskProjectionReads({
    historySyncEpoch: HISTORY_EPOCH,
    logicalDaySettingsRevision: 1,
    projectionsByTaskId,
    taskHistoryStreakSummaries: {},
    tasks,
    todayKey: TODAY,
  });
}

test("a valid previous-logical-day row is stale while a fresh current-day row is read authority", () => {
  const oldTask = task("old-task");
  const freshTask = task("fresh-task");
  const result = resolve(
    [oldTask, freshTask],
    {
      [oldTask.id]: projection(oldTask.id, { projected_logical_date: "2026-09-24" }),
      [freshTask.id]: projection(freshTask.id),
    },
  );

  assert.deepEqual(result.staleProjectionTaskIds, [oldTask.id]);
  assert.deepEqual(result.missingProjectionTaskIds, []);
  assert.deepEqual(result.freshProjectionTaskIds, [freshTask.id]);
});

test("repair-required and missing projections remain in the bounded refresh population", () => {
  const repairTask = task("repair-task");
  const missingTask = task("missing-task");
  const result = resolve([repairTask, missingTask], {
    [repairTask.id]: projection(repairTask.id, { validity: "repair_required" }),
  });

  assert.deepEqual(result.staleProjectionTaskIds, [repairTask.id]);
  assert.deepEqual(result.missingProjectionTaskIds, [missingTask.id]);
});

test("a refreshed current-day row becomes normal projection authority without changing the Task row", () => {
  const taskRow = task("task-1");
  const stale = projection(taskRow.id, { projected_logical_date: "2026-09-24", current_positive_streak: 1 });
  const refreshed = projection(taskRow.id, { current_positive_streak: 7, updated_at: `${TODAY}T12:01:00.000Z` });
  const merged = mergeCurrentTaskProjectionRows({ [taskRow.id]: stale }, [refreshed]);
  const result = resolve([taskRow], merged);

  assert.equal(result.freshProjectionTaskIds[0], taskRow.id);
  assert.equal(result.effectiveTaskHistoryStreakSummaries[taskRow.id]?.currentStreak, 7);
  assert.equal(taskRow.status, "pending");
  assert.equal(taskRow.due_on, TODAY);
});

test("logical-day refresh calls the existing trusted rebuild boundary in serial bounded batches", async () => {
  let active = 0;
  let maximumInFlight = 0;
  let calls = 0;
  const client = {
    functions: {
      invoke: async () => {
        calls += 1;
        active += 1;
        maximumInFlight = Math.max(maximumInFlight, active);
        await Promise.resolve();
        active -= 1;
        return {
          data: calls <= 43
            ? { candidateCount: 10, writtenCount: 10, failedCount: 0, remainingCount: Math.max(0, 430 - calls * 10) }
            : { candidateCount: 0, writtenCount: 0, failedCount: 0, remainingCount: 0 },
          error: null,
        };
      },
    },
  } as unknown as ProjectionBackfillOperatorClient;

  const result = await runCurrentProjectionLogicalDayRefresh({ client, maxBatches: CURRENT_PROJECTION_LOGICAL_DAY_REFRESH_MAX_BATCHES });

  assert.equal(result.writtenCount, 430);
  assert.equal(result.failedCount, 0);
  assert.equal(maximumInFlight, 1);
  assert.equal(calls, 44);
  assert.ok(calls <= CURRENT_PROJECTION_LOGICAL_DAY_REFRESH_MAX_BATCHES + 1);
});

test("the logical-day refresh stops after a trusted rebuild failure and retains per-batch failure counts", async () => {
  let calls = 0;
  const client = {
    functions: {
      invoke: async () => {
        calls += 1;
        return {
          data: { candidateCount: 10, writtenCount: 9, failedCount: 1, remainingCount: 20 },
          error: null,
        };
      },
    },
  } as unknown as ProjectionBackfillOperatorClient;

  const result = await runCurrentProjectionLogicalDayRefresh({ client, maxBatches: CURRENT_PROJECTION_LOGICAL_DAY_REFRESH_MAX_BATCHES });

  assert.equal(calls, 1);
  assert.equal(result.writtenCount, 9);
  assert.equal(result.failedCount, 1);
  assert.equal(result.stoppedReason, "failed_count");
});

test("the backend candidate predicate includes missing, repair, and non-current logical dates but excludes fresh rows", () => {
  assert.match(refreshSql, /not exists\s*\([\s\S]*adhdice_task_current_projections/i);
  assert.match(refreshSql, /projection\.validity <> 'valid'/i);
  assert.match(refreshSql, /projection\.projected_logical_date is distinct from v_current_logical_date/i);
  assert.match(refreshSql, /adhdice_effective_logical_date/i);
  assert.match(refreshSql, /task\.user_id = p_user_id/i);
  assert.match(refreshSql, /task\.canonicalization_status = 'canonical_runtime'/i);
  assert.match(refreshSql, /task\.entity_kind in \('parent', 'step', 'substep'\)/i);
});

test("the trusted backfill still reuses rebuildCurrentTaskProjection and does not mutate canonical rows", () => {
  assert.match(backfillDomainSource, /rebuildCurrentTaskProjection/);
  assert.doesNotMatch(backfillDomainSource, /adhdice_task_history_facts|adhdice_execute_task_state_command/);
  assert.doesNotMatch(backfillDomainSource, /\.insert\(|\.update\(|\.delete\(/);
});

test("refresh results are fenced by owner generation and logical day before projection rows are consumed", () => {
  assert.match(workspaceSource, /canApplyCoreWorkspaceResult\(\)\s*&& todayKeyRef\.current === logicalDate/);
  assert.match(workspaceSource, /currentTaskProjectionLogicalDayRefreshPromiseRef/);
  assert.match(workspaceSource, /workspaceGeneration/);
  assert.match(workspaceSource, /loadCurrentTaskProjectionSnapshot\(\)/);
});

test("startup and rollover invoke projection refresh without blocking the app shell", () => {
  assert.match(workspaceSource, /void requestCurrentTaskProjectionLogicalDayRefresh\(source === "initial" \? "startup" : "core-refresh"\)/);
  assert.match(workspaceSource, /currentTaskProjectionLogicalDayRefreshRef\.current\?\.\("logical-day", true\)/);
  assert.match(workspaceSource, /await requestCurrentTaskProjectionLogicalDayRefresh\("rollover", true\)/);
  assert.match(workspaceSource, /setIsWorkspaceLoading\(false\)/);
  assert.match(workspaceSource, /setIsCurrentTaskProjectionLogicalDayRefreshPending\(true\)/);
  assert.match(taskAppSource, /isCurrentTaskProjectionLogicalDayRefreshPending/);
  assert.match(taskAppSource, /if \(!isCurrentTaskProjectionReadReady \|\| isCurrentTaskProjectionLogicalDayRefreshPending/);
});

test("multi-Task fallback reads use bounded batched canonical History while one-Task reads retain the existing path", () => {
  const loader = workspaceSource.slice(workspaceSource.indexOf("async function loadTaskHistoryForTasks"), workspaceSource.indexOf("async function loadTaskHistoryStreakSummaries"));
  assert.match(loader, /if \(uniqueTaskIds\.length === 1\)/);
  assert.match(loader, /fetchTaskHistoryForTaskIdsInBatches/);
  assert.match(loader, /\.in\("entity_id", batchTaskIds\)/);
  assert.match(loader, /TASK_HISTORY_ROLLOVER_BATCH_SIZE/);
  assert.match(taskAppSource, /loadTaskHistoryForTasks\(taskIdsToLoad, \{ silent: true, source: "fallback" \}\)/);
  assert.doesNotMatch(loader, /Promise\.all\(uniqueTaskIds\.map\(async \(taskId\) => \[[\s\S]*loadTaskHistoryForTask/);
});

test("fallback diagnostics expose counts rather than Task ID dumps", () => {
  assert.match(workspaceSource, /history_semantic_fallback_batch_requested/);
  assert.match(workspaceSource, /requestBatchCount/);
  assert.match(workspaceSource, /taskCount/);
  assert.match(workspaceSource, /current-projection-rollover/);
  assert.match(workspaceSource, /projectionRowsLoaded/);
});

test("7.15.45 summary-backed surfaces remain outside automatic full History hydration", () => {
  assert.doesNotMatch(taskAppSource, /activePageRef\.current === "Stats"[\s\S]*loadFullTaskHistory/);
  assert.match(taskAppSource, /taskActivitySummary\?\.tracked\.current_streak/);
  assert.match(taskAppSource, /todayCompletedCount=\{taskActivitySummary\?\.unfiltered_today_completed_count/);
});
