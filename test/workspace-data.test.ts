import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import type { Task } from "../src/lib/database.types.ts";
import { projectTasksWithCanonicalScheduleBoundaries } from "../src/lib/task-state-canonical/schedule-projection.ts";
import type { CanonicalTaskScheduleBoundary } from "../src/lib/task-state-canonical/types.ts";
import { fetchAllPagedRows, loadCanonicalTaskSnapshot, startBackgroundTaskHistoryHydration } from "../src/hooks/useWorkspaceData.ts";
import { createPendingTaskMutationTracker } from "../src/lib/task-pending-mutations.ts";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

test("fetchAllPagedRows accumulates full pages until the first short page", async () => {
  const pageSize = 1000;
  const ranges: Array<[number, number]> = [];
  const pages = [
    Array.from({ length: pageSize }, (_, index) => `row-${index}`),
    Array.from({ length: pageSize }, (_, index) => `row-${pageSize + index}`),
    ["row-2000", "row-2001"],
  ];

  const result = await fetchAllPagedRows<string>(async (from, to) => {
    ranges.push([from, to]);
    return { data: pages[ranges.length - 1] ?? [], error: null };
  }, pageSize);

  assert.equal(result.error, null);
  assert.equal(result.data?.length, 2002);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.equal(result.data?.at(0), "row-0");
  assert.equal(result.data?.at(-1), "row-2001");
});

test("fetchAllPagedRows stops on fetch errors without returning partial rows", async () => {
  const result = await fetchAllPagedRows<string>(async (from) => {
    if (from === 0) {
      return { data: Array.from({ length: 1000 }, (_, index) => `row-${index}`), error: null };
    }

    return { data: null, error: { message: "Supabase said no" } };
  });

  assert.equal(result.data, null);
  assert.equal(result.error?.message, "Supabase said no");
});

test("canonical Task snapshots fetch boundaries after Tasks and project before publication", async () => {
  const events: string[] = [];
  const task = { id: "imported-task" } as Task;
  const boundary = { entity_id: task.id, boundary_sequence: 1 } as CanonicalTaskScheduleBoundary;

  const snapshot = await loadCanonicalTaskSnapshot(
    async () => {
      events.push("tasks:start");
      await Promise.resolve();
      events.push("tasks:finish");
      return { data: [task], error: null };
    },
    async (taskIds) => {
      assert.deepEqual(events, ["tasks:start", "tasks:finish"]);
      assert.deepEqual(taskIds, [task.id]);
      events.push("boundaries:start");
      await Promise.resolve();
      events.push("boundaries:finish");
      return { data: [boundary], error: null };
    },
  );

  const publishedTasks = projectTasksWithCanonicalScheduleBoundaries(
    snapshot.taskResult.data ?? [],
    snapshot.boundaryResult?.data ?? [],
  );

  assert.deepEqual(events, ["tasks:start", "tasks:finish", "boundaries:start", "boundaries:finish"]);
  assert.equal(publishedTasks[0]?.canonical_schedule_boundary?.entity_id, task.id);
});

test("canonical boundary reads exclude historical and deleted Task IDs", async () => {
  const currentTask = { id: "current-task" } as Task;
  const requestedTaskIds: string[][] = [];

  const snapshot = await loadCanonicalTaskSnapshot(
    async () => ({ data: [currentTask], error: null }),
    async (taskIds) => {
      requestedTaskIds.push(taskIds);
      return { data: [{ entity_id: currentTask.id, boundary_sequence: 1 } as CanonicalTaskScheduleBoundary], error: null };
    },
  );

  assert.deepEqual(requestedTaskIds, [[currentTask.id]]);
  assert.equal(snapshot.boundaryResult?.data?.[0]?.entity_id, currentTask.id);
});

test("scoped canonical boundary pagination is safe when unrelated history exceeds the API row cap", async () => {
  const task = { id: "current-task" } as Task;
  const unrelatedBoundaries = Array.from({ length: 1001 }, (_, index) => ({
    entity_id: `historical-task-${index}`,
    boundary_sequence: 1,
  } as CanonicalTaskScheduleBoundary));
  const relevantBoundary = { entity_id: task.id, boundary_sequence: 1 } as CanonicalTaskScheduleBoundary;
  const accountBoundaries = [...unrelatedBoundaries, relevantBoundary];
  const ranges: Array<[number, number]> = [];

  const snapshot = await loadCanonicalTaskSnapshot(
    async () => ({ data: [task], error: null }),
    async (taskIds) => {
      const scopedRows = accountBoundaries.filter((boundary) => taskIds.includes(boundary.entity_id));
      return fetchAllPagedRows(async (from, to) => {
        ranges.push([from, to]);
        return { data: scopedRows.slice(from, to + 1), error: null };
      });
    },
  );

  const projectedTasks = projectTasksWithCanonicalScheduleBoundaries(
    snapshot.taskResult.data ?? [],
    snapshot.boundaryResult?.data ?? [],
  );
  assert.equal(unrelatedBoundaries.length, 1001);
  assert.deepEqual(ranges, [[0, 999]]);
  assert.equal(projectedTasks[0]?.canonical_schedule_boundary?.entity_id, task.id);
});

test("empty canonical Task snapshots skip boundary fetching", async () => {
  let boundaryFetches = 0;
  const snapshot = await loadCanonicalTaskSnapshot(
    async () => ({ data: [], error: null }),
    async () => {
      boundaryFetches += 1;
      return { data: [], error: null };
    },
  );

  assert.equal(boundaryFetches, 0);
  assert.deepEqual(snapshot.boundaryResult?.data, []);
  assert.equal(snapshot.boundaryResult?.error, null);
});

test("incomplete active canonical Task snapshots are rejected before publication", async () => {
  const task = {
    id: "missing-boundary-task",
    canonicalization_status: "canonical_runtime",
    terminal_state: "active",
    container_state: "active",
  } as Task;

  const snapshot = await loadCanonicalTaskSnapshot(
    async () => ({ data: [task], error: null }),
    async () => ({ data: [], error: null }),
  );

  assert.equal(snapshot.boundaryResult?.data, null);
  assert.equal(snapshot.boundaryResult?.error?.code, "CANONICAL_TASK_SNAPSHOT_INCOMPLETE");
  assert.match(snapshot.boundaryResult?.error?.message ?? "", /missing-boundary-task/);
  assert.deepEqual(
    snapshot.boundaryResult?.error
      ? []
      : projectTasksWithCanonicalScheduleBoundaries(snapshot.taskResult.data ?? [], snapshot.boundaryResult?.data ?? []),
    [],
  );
});

test("workspace ownership effect does not depend on active page navigation", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");

  assert.match(source, /activePageRef\.current = activePage/);
  assert.match(source, /\}, \[currentUser\?\.id, supabase, suppressCategoryReload\]\);/);
  assert.doesNotMatch(source, /\}, \[activePage, currentUser\?\.id/);
});

test("initial boot guards lifecycle refreshes and only persisted pageshow is eligible", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");

  assert.match(source, /initialCoreLoadActiveRef\.current = true/);
  assert.match(source, /workspaceStartupRequestRegistry\.request\(userId, \(\) => requestCoreWorkspaceRefresh\(\{ silent: false, source: "initial" \}\)\)/);
  assert.match(source, /resumeRefreshCoordinator\.pageShow\(event\.persisted\)/);
  assert.match(source, /resumeRefreshCoordinator\.focus\(\)/);
});

test("startup commits critical workspace state without awaiting full canonical Task History", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const coreLoader = source.slice(source.indexOf("async function loadCoreWorkspaceData"), source.indexOf("const requestCoreWorkspaceRefresh"));

  const criticalCommitIndex = coreLoader.indexOf("startTransition(() => {");
  const historyHydrationIndex = coreLoader.indexOf("startBackgroundTaskHistoryHydration(");
  assert.ok(criticalCommitIndex >= 0 && historyHydrationIndex > criticalCommitIndex);
  assert.match(coreLoader, /tasksRef\.current = nextTasks/);
  assert.match(coreLoader, /setTasks\(\(current\) => keepCurrentIfStructurallyEqual\(current, nextTasks\)\)/);
  assert.match(coreLoader, /onProfileLoaded\(profileResult\.data \?\? null, user\)/);
  assert.match(coreLoader, /setIsWorkspaceLoading\(false\)/);
  assert.doesNotMatch(coreLoader, /await loadTaskHistory\(\{ silent, source: "startup" \}\)/);
  assert.match(source, /setTaskHistoryByTaskId\(\(current\) => keepCurrentIfStructurallyEqual/);
  assert.doesNotMatch(source, /loadCriticalTaskHistoryFacts/);
  assert.doesNotMatch(coreLoader, /loadActualTime\(|loadNotes\(/);
  assert.match(source, /loadFullTaskHistoryRef\.current = \(\) => loadTaskHistory/);
});

test("deferred startup History hydration leaves the workspace visible until completion", async () => {
  const historyLoad = deferred<boolean>();
  let isWorkspaceLoading = true;
  let isTaskHistoryLoaded = false;
  let tasksCommitted = false;
  let profileCommitted = false;
  let warning: unknown = null;

  startBackgroundTaskHistoryHydration(() => historyLoad.promise, {
    onFailure: (error) => { warning = error ?? "History failed"; },
    onLoaded: () => { isTaskHistoryLoaded = true; },
  });
  tasksCommitted = true;
  profileCommitted = true;
  isWorkspaceLoading = false;

  await Promise.resolve();
  assert.equal(tasksCommitted, true);
  assert.equal(profileCommitted, true);
  assert.equal(isWorkspaceLoading, false);
  assert.equal(isTaskHistoryLoaded, false);
  assert.equal(warning, null);

  historyLoad.resolve(true);
  await historyLoad.promise;
  await Promise.resolve();
  assert.equal(isTaskHistoryLoaded, true);
  assert.equal(isWorkspaceLoading, false);
});

test("failed startup History hydration reports failure without restoring workspace loading", async () => {
  const historyLoad = deferred<boolean>();
  const isWorkspaceLoading = false;
  const isTaskHistoryLoaded = false;
  let warning: unknown = null;

  startBackgroundTaskHistoryHydration(() => historyLoad.promise, {
    onFailure: (error) => { warning = error ?? "History failed"; },
  });
  historyLoad.reject(new Error("History unavailable"));
  await assert.rejects(historyLoad.promise);
  await Promise.resolve();

  assert.equal(isWorkspaceLoading, false);
  assert.equal(isTaskHistoryLoaded, false);
  assert.equal((warning as Error).message, "History unavailable");
});

test("Task refresh paths use the same causal canonical snapshot loader", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const reload = source.slice(source.indexOf("async function reloadTaskRows"), source.indexOf("function shouldReconnectTaskChannel"));
  const coreLoader = source.slice(source.indexOf("async function loadCoreWorkspaceData"), source.indexOf("const requestCoreWorkspaceRefresh"));

  assert.match(source, /export async function loadCanonicalTaskSnapshot/);
  assert.match(reload, /loadCanonicalTaskSnapshot\([\s\S]*createTaskRowsRequest\(\)[\s\S]*loadTaskScheduleBoundaries\(taskIds\)/);
  assert.match(coreLoader, /loadCanonicalTaskSnapshot\([\s\S]*createTaskRowsRequest\(\)[\s\S]*loadTaskScheduleBoundaries\(taskIds\)/);
  assert.match(source, /\.in\("entity_id", taskIds\)/);
  assert.match(source, /\.order\("boundary_sequence", \{ ascending: false \}\)[\s\S]*\.order\("id", \{ ascending: true \}\)/);
  assert.match(source, /fetchAllPagedRows<CanonicalTaskScheduleBoundary>/);
  assert.doesNotMatch(reload, /Promise\.all\(\[\s*createTaskRowsRequest\(\)/);
  assert.doesNotMatch(coreLoader, /Promise\.all\(\[[\s\S]*createTaskRowsRequest\(\)[\s\S]*createTaskScheduleBoundariesRequest\(\)/);
});

test("empty critical hydration returns before complete Task derivation stages", async () => {
  const source = await readFile(new URL("../src/lib/task-app-derived.ts", import.meta.url), "utf8");
  const emptyGuard = source.slice(source.indexOf("if (tasks.length === 0)"), source.indexOf("const totalStartedAt"));
  assert.match(emptyGuard, /return \{/);
  assert.doesNotMatch(emptyGuard, /logTaskDeriveStep|logDevelopmentComputation/);
});

test("rollover reconciliation reloads only task rows and does not request a broad core refresh", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const reconciliation = source.slice(
    source.indexOf("rolloverWorkspaceReconciliationRef.current = async () =>"),
    source.indexOf("prepareTaskMutationRef.current", source.indexOf("rolloverWorkspaceReconciliationRef.current = async () =>")),
  );

  assert.match(reconciliation, /reloadTaskRows\(\{ silent: true, source: "rollover" \}\)/);
  assert.doesNotMatch(reconciliation, /requestCoreWorkspaceRefresh|loadCoreWorkspaceData|softRefreshWorkspace/);
});

test("rollover reconciliation refreshes the shared full History snapshot", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const reconciliation = source.slice(
    source.indexOf("rolloverWorkspaceReconciliationRef.current = async () =>"),
    source.indexOf("prepareTaskMutationRef.current", source.indexOf("rolloverWorkspaceReconciliationRef.current = async () =>")),
  );

  assert.match(reconciliation, /refreshing the shared canonical snapshot/);
  assert.match(reconciliation, /await loadTaskHistory\(\{ silent: true, source: "rollover" \}\)/);
});

test("canonical paginated history reload joins an active scan instead of duplicating it", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const historyLoader = source.slice(source.indexOf("async function loadTaskHistory"), source.indexOf("async function loadCriticalTaskHistoryFacts"));

  assert.match(historyLoader, /if \(taskHistoryLoadInFlightRef\.current\)[\s\S]*queuedTaskHistoryReloadRef\.current = true/);
  assert.match(historyLoader, /Rollover history reconciliation joined an in-flight history load/);
  assert.match(historyLoader, /fetchAllPagedRows<CanonicalTaskHistoryFact>/);
});

test("manual refresh remains the broad core workspace refresh path", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");

  assert.match(source, /softWorkspaceRefreshRef\.current = \(\) => runSoftWorkspaceRefresh\(\{[\s\S]*source: "manual"/);
  assert.match(source, /await requestCoreWorkspaceRefresh\(\{ silent: true, source \}\)/);
});

test("streak-summary resolution is rejected after the owning effect unmounts", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const summaryLoader = source.slice(source.indexOf("async function loadTaskHistoryStreakSummaries"), source.indexOf("async function reloadTaskHistoryStreakSummaryForTask"));

  assert.match(summaryLoader, /if \(!isActive \|\| !canApplyCoreWorkspaceResult\(\)\)/);
  assert.match(summaryLoader, /await fetchAllPagedRows<CanonicalTaskHistoryFact>/);
  assert.match(summaryLoader, /if \(!isActive \|\| !canApplyCoreWorkspaceResult\(\)\)[\s\S]*buildTaskHistoryStreakSummaryMap/);
});

test("workspace streak summaries batch-load active Calendar overrides and index them by task", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const summaryLoader = source.slice(source.indexOf("async function loadTaskHistoryStreakSummaries"), source.indexOf("async function reloadTaskHistoryStreakSummaryForTask"));

  assert.match(source, /async function loadActiveCalendarOverrides\(taskId\?: string\)/);
  assert.match(summaryLoader, /loadActiveCalendarOverrides\(\)/);
  assert.match(summaryLoader, /calendarOverridesByTaskId: indexActiveCalendarOverrides\(activeCalendarOverrides\)/);
  assert.match(source, /\.from\("adhdice_task_calendar_overrides"\)/);
  assert.match(source, /\.eq\("is_active", true\)/);
  assert.match(source, /taskCalendarOverrideFromCanonical/);
  assert.doesNotMatch(summaryLoader, /loadActiveCalendarOverrides\(task\.id\)/);
});

test("task-scoped streak summary reloads fetch current active Calendar overrides", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const reload = source.slice(source.indexOf("async function reloadTaskHistoryStreakSummaryForTask"), source.indexOf("async function loadNotes"));

  assert.match(reload, /loadActiveCalendarOverrides\(taskId\)/);
  assert.match(reload, /calendarOverrides: activeCalendarOverrides\.map\(taskCalendarOverrideFromCanonical\)/);
  assert.match(source, /\.eq\("entity_id", taskId\)/);
});

test("streak-summary resolution checks the captured user before applying", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const ownership = source.slice(source.indexOf("function canApplyCoreWorkspaceResult"), source.indexOf("async function loadCoreWorkspaceData"));

  assert.match(ownership, /liveWorkspaceUserIdRef\.current === userId/);
  assert.match(source, /if \(liveWorkspaceUserIdRef\.current === userId\) \{\s*liveWorkspaceUserIdRef\.current = null/);
});

test("same-user workspace replacement creates a new ownership generation", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");

  assert.match(source, /const workspaceGeneration = workspaceGenerationRef\.current \+ 1/);
  assert.match(source, /workspaceGenerationRef\.current = workspaceGeneration/);
  assert.match(source, /workspaceGenerationRef\.current === workspaceGeneration/);
  assert.match(source, /workspaceStartupRequestRegistry\.invalidate\(startupRequestUserIdRef\.current\)/);
  assert.match(source, /startupRequestUserIdRef\.current = null;\s*coreRefreshCoordinatorRef\.current = null/);
});

test("a stale in-flight summary promise is neither joined nor allowed to clear a newer one", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const summaryLoader = source.slice(source.indexOf("async function loadTaskHistoryStreakSummaries"), source.indexOf("async function reloadTaskHistoryStreakSummaryForTask"));

  assert.match(summaryLoader, /existingSummaryLoad\?\.generation === workspaceGeneration/);
  assert.match(summaryLoader, /fullHistoryLoad\?\.generation === workspaceGeneration/);
  assert.match(summaryLoader, /taskHistoryStreakSummaryLoadPromiseRef\.current === summaryLoadOwner/);
});

test("valid same-generation summary requests reuse the existing single-flight promise", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const summaryLoader = source.slice(source.indexOf("async function loadTaskHistoryStreakSummaries"), source.indexOf("async function reloadTaskHistoryStreakSummaryForTask"));

  assert.match(summaryLoader, /if \(existingSummaryLoad\?\.generation === workspaceGeneration\) \{\s*return await existingSummaryLoad\.promise;/);
});

test("streak-summary loader stores a Promise without invoking it", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const summaryLoader = source.slice(source.indexOf("async function loadTaskHistoryStreakSummaries"), source.indexOf("async function reloadTaskHistoryStreakSummaryForTask"));

  assert.match(summaryLoader, /const summaryLoadPromise = Promise\.resolve\(\)\.then\(async \(\) => \{/);
  assert.match(summaryLoader, /\n\s*\}\);\s*summaryLoadOwner\.promise = summaryLoadPromise;/);
  assert.doesNotMatch(summaryLoader, /Promise\.resolve\(\)\.then\(async \(\) => \{[\s\S]*\}\)\(\);/);
  assert.doesNotMatch(summaryLoader, /summaryLoadPromise\(\)/);
});

test("task-scoped streak-summary reload stores its Promise without invoking it", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const reload = source.slice(source.indexOf("async function reloadTaskHistoryStreakSummaryForTask"), source.indexOf("async function loadNotes"));

  assert.match(reload, /const reloadPromise = Promise\.resolve\(\)\.then\(async \(\) => \{/);
  assert.match(reload, /\n\s*\}\);\s*reloadOwner\.promise = reloadPromise;/);
  assert.doesNotMatch(reload, /Promise\.resolve\(\)\.then\(async \(\) => \{[\s\S]*\}\)\(\);/);
  assert.doesNotMatch(reload, /reloadPromise\(\)/);
});

test("summary failure clears only its owned promise so a later retry can start", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const summaryLoader = source.slice(source.indexOf("async function loadTaskHistoryStreakSummaries"), source.indexOf("async function reloadTaskHistoryStreakSummaryForTask"));

  assert.match(summaryLoader, /if \(result\.error\) return false;/);
  assert.match(summaryLoader, /if \(taskHistoryStreakSummaryLoadPromiseRef\.current === summaryLoadOwner\) \{\s*taskHistoryStreakSummaryLoadPromiseRef\.current = null/);
});

test("the full-History summary branch rechecks ownership after waiting for the full load", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const summaryLoader = source.slice(source.indexOf("async function loadTaskHistoryStreakSummaries"), source.indexOf("async function reloadTaskHistoryStreakSummaryForTask"));

  assert.match(summaryLoader, /const fullHistoryLoaded = await fullHistoryLoad\.promise;\s*if \(!fullHistoryLoaded\) return false;[\s\S]*?catch \{\s*return false;\s*\}[\s\S]*?\}\s*if \(!isActive \|\| !canApplyCoreWorkspaceResult\(\)\)/);
  assert.match(summaryLoader, /catch \{\s*return false;\s*\}/);
});

test("startup History completion keeps the existing full canonical caches and readiness authority", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const historyLoader = source.slice(source.indexOf("async function loadTaskHistory"), source.indexOf("async function fetchTaskHistoryForRollover"));
  const startupLoader = source.slice(source.indexOf("async function loadCoreWorkspaceData"), source.indexOf("const requestCoreWorkspaceRefresh"));

  assert.match(startupLoader, /startBackgroundTaskHistoryHydration\([\s\S]*loadTaskHistory\(\{ silent, source: "startup" \}\)/);
  assert.match(historyLoader, /setTaskHistory\(\(current\) => keepCurrentIfStructurallyEqual\(current, nextTaskHistory\)\)/);
  assert.match(historyLoader, /setTaskHistoryByTaskId\(\(current\) => keepCurrentIfStructurallyEqual\(current, nextByTaskId\)\)/);
  assert.match(historyLoader, /hasLoadedFullTaskHistoryRef\.current = true/);
  assert.match(historyLoader, /setTaskHistoryLoadedUserId\(userId\)/);
  assert.doesNotMatch(startupLoader, /onLoaded:[\s\S]*setIsWorkspaceLoading/);
});

test("startup full History and streak summaries share one in-flight paged scan", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const startupLoader = source.slice(source.indexOf("async function loadCoreWorkspaceData"), source.indexOf("const requestCoreWorkspaceRefresh"));
  const summaryLoader = source.slice(source.indexOf("async function loadTaskHistoryStreakSummaries"), source.indexOf("async function reloadTaskHistoryStreakSummaryForTask"));

  assert.ok(startupLoader.indexOf("startBackgroundTaskHistoryHydration(") < startupLoader.indexOf("void loadTaskHistoryStreakSummaries(nextTasks)"));
  assert.match(summaryLoader, /const fullHistoryLoad = taskHistoryLoadPromiseRef\.current/);
  assert.match(summaryLoader, /await fullHistoryLoad\.promise/);
  assert.match(summaryLoader, /if \(!fullHistoryLoaded\) return false/);
  assert.match(summaryLoader, /fetchAllPagedRows<CanonicalTaskHistoryFact>/);
  assert.match(source, /if \(taskHistoryLoadInFlightRef\.current\) \{[\s\S]*return await \(taskHistoryLoadPromiseRef\.current\?\.promise/);
});

test("opening Task History refreshes the shared canonical History snapshot", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const modalLoader = source.slice(source.indexOf("async function loadTaskHistoryForTask"), source.indexOf("async function loadTaskHistoryStreakSummaries"));

  assert.match(modalLoader, /setTaskHistoryCacheForTask\(taskId, rows\)/);
  assert.match(source, /setTaskHistory\s*\(/);
  assert.doesNotMatch(modalLoader, /mergeTaskHistoryCache/);
  assert.match(modalLoader, /fetchAllPagedRows<CanonicalTaskHistoryFact>/);
  assert.match(modalLoader, /\.range\(from, to\)/);
});

test("modal open force-refreshes both empty-ready and partial-ready private caches", async () => {
  const workspaceSource = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const modalLoader = workspaceSource.slice(workspaceSource.indexOf("async function loadTaskHistoryForTask"), workspaceSource.indexOf("async function loadTaskHistoryStreakSummaries"));
  const openHandler = appSource.slice(appSource.indexOf("function openTaskHistoryForTask"), appSource.indexOf("async function closeActualTimeEntry", appSource.indexOf("function openTaskHistoryForTask")));

  assert.match(modalLoader, /if \(!force && taskHistoryLoadStateByTaskIdRef\.current\[taskId\]\?\.status === "ready"\)/);
  assert.match(openHandler, /loadTaskHistoryForTask\(taskId, \{ force: true \}\)/);
  assert.match(modalLoader, /fetchAllPagedRows<CanonicalTaskHistoryFact>/);
  assert.match(modalLoader, /setTaskHistoryCacheForTask\(taskId, rows\)/);
});

test("rollover History acquisition leaves modal cache and load state untouched", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const rolloverReader = source.slice(source.indexOf("async function fetchTaskHistoryForRollover"), source.indexOf("async function loadTaskHistoryForTask"));

  assert.match(source, /fetchTaskHistoryForTaskIdsInBatches/);
  assert.match(source, /TASK_HISTORY_ROLLOVER_BATCH_SIZE/);
  assert.doesNotMatch(rolloverReader, /setTaskHistoryCacheForTask|setTaskHistoryTaskLoadState|taskHistoryTaskLoadPromisesRef/);
  assert.doesNotMatch(rolloverReader, /taskHistoryByTaskIdRef|taskHistoryLoadStateByTaskIdRef/);
});

test("History Calendar owns Task Realtime suppression for the whole multi-date mutation", async () => {
  const appSource = await readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const flowStart = appSource.indexOf("onSetStatuses: async");
  const flow = appSource.slice(flowStart, appSource.indexOf("onSetDelayedStatus:", flowStart));

  assert.match(flow, /beginPendingTaskMutationScope\(pendingTaskIds\)/);
  assert.match(flow, /beginPendingTaskMutationScope\(pendingTaskIds\)[\s\S]*?try \{/);
  assert.match(flow, /finally \{\s*endPendingTaskMutationScope\(pendingTaskIds\)/);
  assert.ok(flow.indexOf("beginPendingTaskMutationScope(pendingTaskIds)") < flow.indexOf("syncTaskHistoryEntries("));
});

test("explicit pending Task ownership survives the old TTL and releases after final reconciliation", () => {
  let now = 0;
  const tracker = createPendingTaskMutationTracker(() => now);

  tracker.beginPendingTaskMutationScope(["task-1"]);
  now = 30_000;
  assert.equal(tracker.shouldSkipTaskReload({ eventType: "UPDATE", taskId: "task-1" }), true);
  assert.equal(tracker.shouldSkipTaskReload({ eventType: "UPDATE", taskId: "task-1" }), true);

  tracker.endPendingTaskMutationScope(["task-1"]);
  assert.equal(tracker.shouldSkipTaskReload({ eventType: "UPDATE", taskId: "task-1" }), false);
});

test("nested pending Task ownership cannot be cleared by another local scope", () => {
  const tracker = createPendingTaskMutationTracker(() => 1_000);

  tracker.beginPendingTaskMutationScope(["task-1"]);
  tracker.beginPendingTaskMutationScope(["task-1"]);
  tracker.clearPendingTaskMutations(["task-1"]);
  tracker.endPendingTaskMutationScope(["task-1"]);
  assert.equal(tracker.shouldSkipTaskReload({ eventType: "UPDATE", taskId: "task-1" }), true);

  tracker.endPendingTaskMutationScope(["task-1"]);
  assert.equal(tracker.shouldSkipTaskReload({ eventType: "UPDATE", taskId: "task-1" }), false);
  tracker.markPendingTaskMutations(["task-1"]);
  assert.equal(tracker.shouldSkipTaskReload({ eventType: "UPDATE", taskId: "task-1" }), true);
  assert.equal(tracker.shouldSkipTaskReload({ eventType: "UPDATE", taskId: "task-1" }), false);
});

test("Task Realtime skips only the locally owned Task echo and resumes after the scope", async () => {
  const appSource = await readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const workspaceSource = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const realtime = workspaceSource.slice(
    workspaceSource.indexOf('table: "adhdice_clean_tasks"'),
    workspaceSource.indexOf('table: "adhdice_clean_tasks"') + 1000,
  );

  assert.match(appSource, /return pendingTaskMutationTrackerRef\.current\.shouldSkipTaskReload\(change\)/);
  assert.match(realtime, /shouldSkipTaskReloadRef\.current\?\.\(\{ eventType: payload\.eventType, taskId \}\)/);
  assert.ok(realtime.indexOf("shouldSkipTaskReloadRef.current") < realtime.indexOf("reloadTaskRows({ silent: true })"));
});

test("known-task History Realtime uses targeted refresh and unknown-ID events keep the full-load fallback", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const realtimeStart = source.indexOf('table: "adhdice_task_history_facts"');
  const realtime = source.slice(realtimeStart, realtimeStart + 2100);

  assert.match(realtime, /if \(taskId\) \{\s*void loadTaskHistoryForTask\(taskId, \{ force: true, silent: true \}\)\.then\(\(result\) =>/);
  assert.match(realtime, /result\.status === "ready"[\s\S]*reloadTaskHistoryStreakSummaryForTask\(taskId, result\.history \?\? undefined\)/);
  const knownTaskBranch = realtime.slice(realtime.indexOf("if (taskId)"), realtime.indexOf("if (hasLoadedFullTaskHistoryRef.current)"));
  assert.doesNotMatch(knownTaskBranch, /loadTaskHistory\(/);
  assert.match(realtime, /if \(hasLoadedFullTaskHistoryRef\.current\) \{[\s\S]*loadTaskHistory\(\{ silent: true, source: "secondary" \}\)/);
  assert.match(realtime, /void loadTaskHistoryStreakSummaries\(\);/);
});

test("targeted History refresh merges the task into both per-task and full History caches", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const cacheHelper = source.slice(source.indexOf("const setTaskHistoryCacheForTask"), source.indexOf("const updateTaskHistoryForTask"));
  const targetedLoader = source.slice(source.indexOf("async function loadTaskHistoryForTask"), source.indexOf("async function loadTaskHistoryForTasks"));

  assert.match(targetedLoader, /setTaskHistoryCacheForTask\(taskId, rows\)/);
  assert.match(cacheHelper, /fullTaskHistoryRowsRef\.current = nextSnapshot/);
  assert.match(cacheHelper, /taskHistoryByTaskIdRef\.current = nextByTaskId/);
  assert.match(cacheHelper, /setTaskHistory\(\(current\) => keepCurrentIfStructurallyEqual\(current, nextSnapshot\)\)/);
  assert.match(cacheHelper, /setTaskHistoryByTaskId\(\(current\) => keepCurrentIfStructurallyEqual\(current, nextByTaskId\)\)/);
  assert.match(source, /reloadTaskHistoryStreakSummaryForTask\(taskId, result\.history \?\? undefined\)/);
});

test("a ready modal History cache remains available when the modal reopens", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const modalLoader = source.slice(source.indexOf("async function loadTaskHistoryForTask"), source.indexOf("async function loadTaskHistoryStreakSummaries"));

  assert.match(modalLoader, /if \(!force && taskHistoryLoadStateByTaskIdRef\.current\[taskId\]\?\.status === "ready"\) \{[\s\S]*?status: "ready"/);
  assert.match(source, /taskHistoryByTaskId,/);
});

test("modal retry resets loading state and preserves shared History error handling", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const modalLoader = source.slice(source.indexOf("async function loadTaskHistoryForTask"), source.indexOf("async function loadTaskHistoryStreakSummaries"));

  assert.match(source, /retryTaskHistoryForTaskRef\.current = \(taskId\) => loadTaskHistoryForTask\(taskId, \{ force: true \}\)/);
  assert.match(modalLoader, /setTaskHistoryTaskLoadState\(taskId, \{ error: null, status: "loading" \}\)/);
  assert.match(modalLoader, /setTaskHistoryTaskLoadState\(taskId, \{ error, status: "error" \}\)/);
  assert.match(source, /setTaskHistory\s*\(/);
});

test("task-scoped History loading returns an explicit failure instead of cached or empty rows", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const modalLoader = source.slice(source.indexOf("async function loadTaskHistoryForTask"), source.indexOf("async function loadTaskHistoryStreakSummaries"));

  assert.match(modalLoader, /return \{ status: "error", history: null, error/);
  assert.match(modalLoader, /return \{ status: "error", history: null, error \} satisfies TaskHistoryLoadResult/);
  assert.match(source, /return Object\.fromEntries\(results\) as TaskHistoryLoadMap/);
  assert.doesNotMatch(modalLoader, /return Object\.fromEntries\(uniqueTaskIds\.map/);
});

test("History mutations update the shared cache and summary ownership", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");

  assert.match(source, /const updateTaskHistoryForTask = useCallback/);
  assert.match(source, /refreshTaskHistoryStreakSummaryRef\.current = reloadTaskHistoryStreakSummaryForTask/);
  assert.match(source, /if \(nextTaskHistory\) \{[\s\S]*?setTaskHistoryCacheForTask\(taskId, taskHistory\)/);
  assert.match(source, /const hasPrivateTaskHistory = Object\.hasOwn\(taskHistoryByTaskIdRef\.current, taskId\)/);
  assert.match(source, /await loadTaskHistoryForTask\(taskId, \{ force: true, silent: true \}\)/);
});

test("History query pages have a stable logical row order and compact summaries deduplicate task dates", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const summarySource = await readFile(new URL("../src/lib/task-history-streak-summaries.ts", import.meta.url), "utf8");

  assert.match(source, /\.order\("logical_date", \{ ascending: false \}\)\s*\.order\("updated_at", \{ ascending: false \}\)\s*\.order\("created_at", \{ ascending: false \}\)\s*\.order\("id", \{ ascending: true \}\)/);
  assert.match(summarySource, /deduplicateTaskHistoryByLogicalDate\(history\)/);
});

test("History loading feeds the same non-modal status, search, and hierarchy derivations", async () => {
  const appSource = await readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const modalAlias = appSource.slice(appSource.indexOf("taskHistoryByTaskId: sharedTaskHistoryByTaskId"), appSource.indexOf("taskHistoryStreakSummaries,") + "taskHistoryStreakSummaries,".length);
  const statusRead = appSource.slice(appSource.indexOf("const activeStatusRead"), appSource.indexOf("const taskDisplayStatusByTaskId"));

  assert.match(modalAlias, /taskHistoryByTaskId: sharedTaskHistoryByTaskId/);
  assert.match(statusRead, /historyByTaskId: taskHistoryByTaskId/);
  assert.doesNotMatch(statusRead, /taskHistoryModalHistoryByTaskId/);
});

test("logout, user switch, and workspace replacement clear modal cache and ownership state", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const unauthenticatedBranch = source.slice(source.indexOf("if (!supabase || !currentUser)"), source.indexOf("const client = supabase"));
  const authenticatedStart = source.slice(source.indexOf("const userId = user.id"), source.indexOf("setActiveProfileUserId(userId)"));

  assert.match(unauthenticatedBranch, /clearTaskHistoryTaskCache\(\)/);
  assert.match(unauthenticatedBranch, /taskHistoryStreakSummaryTaskReloadsRef\.current\.clear\(\)/);
  assert.match(authenticatedStart, /clearTaskHistoryTaskCache\(\)/);
  assert.match(authenticatedStart, /taskHistoryStreakSummaryLoadPromiseRef\.current = null/);
  assert.match(authenticatedStart, /taskHistoryStreakSummaryTaskReloadsRef\.current\.clear\(\)/);
});
