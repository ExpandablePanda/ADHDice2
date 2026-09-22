import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspaceSource = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const updateActionSource = await readFile(new URL("../src/hooks/useTaskUpdateAction.ts", import.meta.url), "utf8");
const historyActionsSource = await readFile(new URL("../src/hooks/useTaskHistoryActions.ts", import.meta.url), "utf8");

const fullHistoryLoader = workspaceSource.slice(
  workspaceSource.indexOf("async function loadTaskHistory({"),
  workspaceSource.indexOf("async function fetchTaskHistoryForRollover"),
);
const taskLoader = workspaceSource.slice(
  workspaceSource.indexOf("async function loadTaskHistoryForTask"),
  workspaceSource.indexOf("async function loadTaskHistoryStreakSummaries"),
);
const batchLoader = workspaceSource.slice(
  workspaceSource.indexOf("async function loadTaskHistoryForTasks"),
  workspaceSource.indexOf("async function loadTaskHistoryStreakSummaries"),
);
const summaryReload = workspaceSource.slice(
  workspaceSource.indexOf("async function reloadTaskHistoryStreakSummaryForTask"),
  workspaceSource.indexOf("async function loadNotes"),
);

test("A: completed full History publishes canonical task cache and readiness", () => {
  assert.match(fullHistoryLoader, /fullTaskHistoryRowsRef\.current = nextTaskHistory/);
  assert.match(fullHistoryLoader, /taskHistoryByTaskIdRef\.current = nextByTaskId/);
  assert.match(fullHistoryLoader, /const nextTaskHistoryLoadStateByTaskId = Object\.fromEntries\([\s\S]*Object\.keys\(nextByTaskId\)/);
  assert.match(fullHistoryLoader, /taskHistoryLoadStateByTaskIdRef\.current = nextTaskHistoryLoadStateByTaskId/);
  assert.match(fullHistoryLoader, /setTaskHistoryLoadStateByTaskId\(\(current\) => keepCurrentIfStructurallyEqual\(/);
});

test("B: full History represents zero-row Tasks as authoritative-ready", () => {
  assert.match(fullHistoryLoader, /new Set\(\[\.\.\.tasksRef\.current\.map\(\(task\) => task\.id\), \.\.\.nextTaskHistory\.map/);
  assert.match(fullHistoryLoader, /Object\.keys\(nextByTaskId\)/);
  assert.match(fullHistoryLoader, /status: "ready"/);
});

test("C: default batch History loading is cache-first", () => {
  assert.match(batchLoader, /async function loadTaskHistoryForTasks\(taskIds: string\[], options: TaskHistoryLoadOptions = \{\}\)/);
  assert.match(batchLoader, /loadTaskHistoryForTask\(taskId, \{ \.\.\.options, silent: true \}\)/);
  assert.doesNotMatch(batchLoader, /force: true/);
  assert.match(taskLoader, /if \(!force && taskHistoryLoadStateByTaskIdRef\.current\[taskId\]\?\.status === "ready"\)/);
});

test("D: opening Task History uses the cache-first loader", () => {
  const openHandler = appSource.slice(
    appSource.indexOf("function openTaskHistoryForTask"),
    appSource.indexOf("\n  function openBatchDeleteModal", appSource.indexOf("function openTaskHistoryForTask")),
  );
  assert.match(openHandler, /loadTaskHistoryForTask\(taskId\)/);
  assert.doesNotMatch(openHandler, /force: true/);
  assert.match(taskLoader, /history: \[\.\.\.\(taskHistoryByTaskIdRef\.current\[taskId\] \?\? \[\]\)\]/);
});

test("E: a task cache miss still performs the canonical read and stores the result", () => {
  assert.match(taskLoader, /fetchAllPagedRows<CanonicalTaskHistoryFact>\([\s\S]*canonicalHistoryQuery\(taskId\)/);
  assert.match(taskLoader, /setTaskHistoryCacheForTask\(taskId, rows\)/);
  assert.match(taskLoader, /setTaskHistoryTaskLoadState\(taskId, \{ error: null, status: "ready" \}\)/);
  assert.match(taskLoader, /taskHistoryTaskLoadPromisesRef\.current\.set\(taskId/);
});

test("F: explicit Retry remains a forced fresh History read", () => {
  assert.match(workspaceSource, /retryTaskHistoryForTaskRef\.current = \(taskId\) => loadTaskHistoryForTask\(taskId, \{ force: true \}\)/);
});

test("G: mutation reconciliation retains explicit forced refreshes", () => {
  assert.match(updateActionSource, /loadTaskHistoryForTasks\(\[taskId\], \{ force: true, silent: true \}\)/);
  assert.match(historyActionsSource, /loadTaskHistoryForTasks\(\[taskId\], \{ force: true, silent: true \}\)/);
  assert.match(appSource, /loadTaskHistoryForTasks\(\[task\.id\], \{ force: true, silent: true \}\)/);
  assert.match(appSource, /loadTaskHistoryForTasks\(\[taskId\], \{ force: true, silent: true \}\)/);
});

test("H: streak-summary reload reuses authoritative History before its safe fallback", () => {
  assert.match(summaryReload, /const hasAuthoritativeTaskHistory = taskHistoryLoadStateByTaskIdRef\.current\[taskId\]\?\.status === "ready"/);
  assert.match(summaryReload, /taskHistory = \[\.\.\.\(taskHistoryByTaskIdRef\.current\[taskId\] \?\? \[\]\)\]/);
  assert.match(summaryReload, /const historyLoad = await loadTaskHistoryForTask\(taskId, \{ silent: true \}\)/);
  assert.doesNotMatch(summaryReload, /canonicalHistoryQuery\(taskId\)/);
});
