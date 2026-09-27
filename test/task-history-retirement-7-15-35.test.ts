import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspaceSource = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
const taskAppSource = await readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const settingsSource = await readFile(new URL("../src/components/task-app/settings-page.tsx", import.meta.url), "utf8");

function coreLoader() {
  return workspaceSource.slice(
    workspaceSource.indexOf("async function loadCoreWorkspaceData"),
    workspaceSource.indexOf("const requestCoreWorkspaceRefresh"),
  );
}

test("ordinary core startup does not request full History or bulk current-state summaries", () => {
  const core = coreLoader();

  assert.doesNotMatch(core, /loadTaskHistory\(\{/);
  assert.doesNotMatch(core, /startBackgroundTaskHistoryHydration\(/);
  assert.doesNotMatch(core, /loadTaskHistoryStreakSummaries\(/);
  assert.doesNotMatch(core, /loadManualActionCommandOperations\(\)/);
  assert.match(core, /currentProjectionsLoaded: projectionRows\.length/);
  assert.match(core, /fullHistoryLoaded: hasLoadedFullTaskHistoryRef\.current/);
  assert.match(core, /fullHistoryFacts: hasLoadedFullTaskHistoryRef\.current \? fullTaskHistoryRowsRef\.current\.length : 0/);
});

test("broad command-operation and bulk summary paths are explicit-full-only", () => {
  const summaryLoader = workspaceSource.slice(
    workspaceSource.indexOf("async function loadTaskHistoryStreakSummaries"),
    workspaceSource.indexOf("async function reloadTaskHistoryStreakSummaryForTask"),
  );

  assert.match(summaryLoader, /if \(!hasLoadedFullTaskHistoryRef\.current\) \{\s*return false;/);
  assert.match(summaryLoader, /loadManualActionCommandOperations\(\)/);
  assert.doesNotMatch(coreLoader(), /loadManualActionCommandOperations\(\)/);
  assert.match(workspaceSource, /if \(!taskId\) broadManualActionCommandOperationReads \+= 1/);
});

test("fresh projections are the normal boot authority and legacy evaluation is fallback-scoped", () => {
  assert.match(taskAppSource, /const isInitialTaskStateProjectionReady = isCurrentTaskProjectionReadReady && isBehaviorAuthorityReady/);
  assert.doesNotMatch(taskAppSource, /const isInitialTaskStateProjectionReady = isTaskHistoryLoaded/);
  assert.doesNotMatch(taskAppSource, /if \(!isTaskHistoryLoaded\)/);
  assert.match(taskAppSource, /currentTaskProjectionFallbackTaskIds/);
  assert.match(taskAppSource, /loadTaskHistoryForTasks\(taskIdsToLoad, \{ silent: true \}\)/);
  assert.match(taskAppSource, /refreshTaskHistoryStreakSummary\(taskId, result\.history \?\? undefined\)/);
  assert.match(taskAppSource, /tasks: tasks\.filter\(\(task\) => currentTaskProjectionFallbackTaskIds\.includes\(task\.id\)\)/);
});

test("explicit History consumers retain full and task-scoped entry points", () => {
  assert.match(workspaceSource, /loadFullTaskHistoryRef\.current = \(\) => loadTaskHistory/);
  assert.match(workspaceSource, /activePageRef\.current === "Stats"[\s\S]*loadFullTaskHistoryRef\.current\?\.\(\)/);
  assert.match(workspaceSource, /async function loadTaskHistoryForTask\(taskId/);
  assert.match(workspaceSource, /async function loadTaskHistoryForTasks\(taskIds/);
  assert.match(taskAppSource, /loadTaskHistoryDetailWindow\(taskId/);
  assert.match(taskAppSource, /fetchTaskHistoryForRollover/);
});

test("rollover uses its scoped History path and only reconciles an already loaded full snapshot", () => {
  const reconciliation = workspaceSource.slice(
    workspaceSource.indexOf("rolloverWorkspaceReconciliationRef.current = async () =>"),
    workspaceSource.indexOf("prepareTaskMutationRef.current = async () =>"),
  );
  const rollover = taskAppSource.slice(
    taskAppSource.indexOf("const runDayReset = useCallback"),
    taskAppSource.indexOf("const visibleTaskSubtasks", taskAppSource.indexOf("const runDayReset = useCallback")),
  );

  assert.match(reconciliation, /if \(hasLoadedFullTaskHistoryRef\.current\)/);
  assert.match(reconciliation, /loadTaskHistory\(\{ silent: true, source: "rollover"/);
  assert.match(rollover, /fetchTaskHistoryForRollover/);
  const runDayReset = rollover.slice(rollover.indexOf("const runDayReset = useCallback"));
  assert.doesNotMatch(runDayReset.slice(0, runDayReset.indexOf("taskRolloverCoordinator.run")), /isFullTaskHistoryLoaded/);
});

test("History realtime and ordinary resume/refresh do not recreate a full bootstrap", () => {
  const historyRealtime = workspaceSource.slice(
    workspaceSource.indexOf('table: "adhdice_task_history_facts"'),
    workspaceSource.indexOf('        .subscribe((status)', workspaceSource.indexOf('table: "adhdice_task_history_facts"')),
  );

  assert.doesNotMatch(coreLoader(), /loadTaskHistory\(\{/);
  assert.match(historyRealtime, /History notifications do not bootstrap either a complete semantic/);
  const noFullBranch = historyRealtime.slice(historyRealtime.indexOf("// History notifications do not bootstrap"));
  assert.doesNotMatch(noFullBranch, /scheduleTaskHistoryRevisionReconciliation\(\)/);
  assert.match(historyRealtime, /if \(hasLoadedFullTaskHistoryRef\.current\) \{[\s\S]*scheduleTaskHistoryRevisionReconciliation\(\)/);
  assert.match(workspaceSource, /runSoftWorkspaceRefresh\(\{[\s\S]*source: "resume"/);
  assert.match(workspaceSource, /runSoftWorkspaceRefresh\(\{[\s\S]*source: "mutation"/);
});

test("startup diagnostics distinguish projections, full History, scoped History, and broad reads", () => {
  const core = coreLoader();
  assert.match(core, /currentProjectionsLoaded/);
  assert.match(core, /fullHistoryLoaded/);
  assert.match(core, /fullHistoryFacts/);
  assert.match(core, /scopedHistoryTasks/);
  assert.match(core, /broadManualActionCommandOperationReads/);
});

test("switching workspace owners resets full-History readiness before current projections load", () => {
  const authenticatedStart = workspaceSource.slice(
    workspaceSource.indexOf("const userId = user.id"),
    workspaceSource.indexOf("setActiveProfileUserId(userId)"),
  );
  assert.match(authenticatedStart, /hasLoadedFullTaskHistoryRef\.current = false/);
  assert.match(authenticatedStart, /setFullTaskHistoryLoadedUserId\(null\)/);
  assert.match(authenticatedStart, /setIsCurrentTaskProjectionReadReady\(false\)/);
});

test("developer projection controls use the current-projection name and keep V3 in explanatory copy", () => {
  assert.match(settingsSource, /Temporary Current Task Projection operator; the current algorithm is V3/);
  assert.match(settingsSource, /Rebuild Current Projections · 10/);
  assert.match(settingsSource, /Rebuild Current Projections · 50/);
  assert.doesNotMatch(settingsSource, /Rebuild V2 Projections/);
});

test("projection freshness and fence validation remain in the normal read seam", () => {
  assert.match(workspaceSource, /isCurrentTaskProjectionReadReady/);
  assert.match(workspaceSource, /currentTaskProjectionRequest/);
  assert.match(workspaceSource, /historySyncStateRequest/);
  assert.match(taskAppSource, /resolveCurrentTaskProjectionReads\(/);
  assert.match(taskAppSource, /currentTaskProjectionReadResolution\.freshProjectionByTaskId/);
});
