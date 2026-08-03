import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { fetchAllPagedRows } from "../src/hooks/useWorkspaceData.ts";

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

test("normal startup loads critical Task History facts without starting a full History scan", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const coreLoader = source.slice(source.indexOf("async function loadCoreWorkspaceData"), source.indexOf("const requestCoreWorkspaceRefresh"));

  assert.match(coreLoader, /loadCriticalTaskHistoryFacts\(nextTasks\)/);
  assert.doesNotMatch(coreLoader, /loadTaskHistory\(\{ silent: true, source: "secondary" \}\)/);
  assert.doesNotMatch(coreLoader, /loadActualTime\(|loadNotes\(/);
  assert.match(source, /loadFullTaskHistoryRef\.current = \(\) => loadTaskHistory/);
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

test("rollover reconciliation never promotes critical startup facts into a full History load", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const reconciliation = source.slice(
    source.indexOf("rolloverWorkspaceReconciliationRef.current = async () =>"),
    source.indexOf("prepareTaskMutationRef.current", source.indexOf("rolloverWorkspaceReconciliationRef.current = async () =>")),
  );

  assert.match(reconciliation, /if \(!hasLoadedFullTaskHistoryRef\.current\)/);
  assert.match(reconciliation, /only critical facts are cached/);
  assert.match(reconciliation, /Rollover history reconciliation requested after already-loaded history/);
  assert.match(reconciliation, /await loadTaskHistory\(\{ silent: true, source: "rollover" \}\)/);
});

test("canonical paginated history reload joins an active scan instead of duplicating it", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const historyLoader = source.slice(source.indexOf("async function loadTaskHistory"), source.indexOf("async function loadCriticalTaskHistoryFacts"));

  assert.match(historyLoader, /if \(taskHistoryLoadInFlightRef\.current\)[\s\S]*queuedTaskHistoryReloadRef\.current = true/);
  assert.match(historyLoader, /Rollover history reconciliation joined an in-flight history load/);
  assert.match(historyLoader, /fetchAllPagedRows<DbTaskHistory>/);
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
  assert.match(summaryLoader, /await fetchAllPagedRows<TaskHistoryStreakEntry>/);
  assert.match(summaryLoader, /if \(!isActive \|\| !canApplyCoreWorkspaceResult\(\)\)[\s\S]*buildTaskHistoryStreakSummaryMap/);
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

  assert.match(summaryLoader, /await fullHistoryLoad\.promise;\s*\}\s*if \(!isActive \|\| !canApplyCoreWorkspaceResult\(\)\)/);
});

test("opening Task History does not widen the shared bounded History cache", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const modalLoader = source.slice(source.indexOf("async function loadTaskHistoryForTask"), source.indexOf("async function loadTaskHistoryStreakSummaries"));

  assert.match(modalLoader, /setTaskHistoryCacheForTask\(taskId, rows\)/);
  assert.doesNotMatch(modalLoader, /setTaskHistory\s*\(/);
  assert.doesNotMatch(modalLoader, /mergeTaskHistoryCache/);
  assert.match(modalLoader, /fetchAllPagedRows<DbTaskHistory>/);
  assert.match(modalLoader, /\.range\(from, to\)/);
});

test("a ready modal History cache remains available when the modal reopens", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const modalLoader = source.slice(source.indexOf("async function loadTaskHistoryForTask"), source.indexOf("async function loadTaskHistoryStreakSummaries"));

  assert.match(modalLoader, /if \(!force && taskHistoryLoadStateByTaskIdRef\.current\[taskId\]\?\.status === "ready"\) \{\s*return true;/);
  assert.match(source, /taskHistoryByTaskId,/);
});

test("modal retry resets loading state and preserves error handling without touching shared History", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const modalLoader = source.slice(source.indexOf("async function loadTaskHistoryForTask"), source.indexOf("async function loadTaskHistoryStreakSummaries"));

  assert.match(source, /retryTaskHistoryForTaskRef\.current = \(taskId\) => loadTaskHistoryForTask\(taskId, \{ force: true \}\)/);
  assert.match(modalLoader, /setTaskHistoryTaskLoadState\(taskId, \{ error: null, status: "loading" \}\)/);
  assert.match(modalLoader, /setTaskHistoryTaskLoadState\(taskId, \{ error: result\.error\.message/);
  assert.doesNotMatch(modalLoader, /setTaskHistory\s*\(/);
});

test("History mutations update the isolated modal cache and summary ownership", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");

  assert.match(source, /const updateTaskHistoryForTask = useCallback/);
  assert.match(source, /refreshTaskHistoryStreakSummaryRef\.current = reloadTaskHistoryStreakSummaryForTask/);
  assert.match(source, /const hasPrivateTaskHistory = Object\.hasOwn\(taskHistoryByTaskIdRef\.current, taskId\)/);
  assert.match(source, /await loadTaskHistoryForTask\(taskId, \{ force: true, silent: true \}\)/);
  assert.doesNotMatch(source, /setTaskHistoryCacheForTask\(taskId, nextTaskHistory\)/);
});

test("History query pages have a stable logical row order and compact summaries deduplicate task dates", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const summarySource = await readFile(new URL("../src/lib/task-history-streak-summaries.ts", import.meta.url), "utf8");

  assert.match(source, /\.order\("updated_at", \{ ascending: false \}\)\s*\.order\("created_at", \{ ascending: false \}\)\s*\.order\("id", \{ ascending: true \}\)\s*\.range\(from, to\)/);
  assert.match(summarySource, /deduplicateTaskHistoryByLogicalDate\(history\)/);
});

test("modal loading does not feed non-modal status, search, or hierarchy derivations", async () => {
  const appSource = await readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const modalAlias = appSource.slice(appSource.indexOf("taskHistoryByTaskId: taskHistoryModalHistoryByTaskId"), appSource.indexOf("taskHistoryStreakSummaries,") + "taskHistoryStreakSummaries,".length);
  const statusRead = appSource.slice(appSource.indexOf("const activeStatusRead"), appSource.indexOf("const taskDisplayStatusByTaskId"));

  assert.match(modalAlias, /taskHistoryByTaskId: taskHistoryModalHistoryByTaskId/);
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
