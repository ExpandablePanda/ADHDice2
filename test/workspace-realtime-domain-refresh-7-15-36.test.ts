import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createSingleFlightRefreshCoordinator } from "../src/lib/workspace-refresh-coordinator.ts";

const workspaceSource = readFileSync(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");

function sliceFunction(name: string, nextName: string) {
  const start = workspaceSource.indexOf(name);
  const end = workspaceSource.indexOf(nextName, start);
  assert.ok(start >= 0, `missing ${name}`);
  assert.ok(end > start, `missing end for ${name}`);
  return workspaceSource.slice(start, end);
}

function sliceRealtimeHandler(table: string) {
  const realtimeStart = workspaceSource.indexOf("const workspaceChannel = client.channel");
  const tableStart = workspaceSource.indexOf(`table: "${table}"`, realtimeStart);
  const nextHandler = workspaceSource.indexOf("      .on(", tableStart);
  assert.ok(tableStart >= 0, `missing Realtime handler for ${table}`);
  return workspaceSource.slice(tableStart, nextHandler >= 0 ? nextHandler : undefined);
}

const taskListDomain = sliceFunction("async function refreshTaskListDomain", "function requestTaskListDomainRefresh");
const contentFolderDomain = sliceFunction("async function refreshTaskContentFolderDomain", "function requestTaskContentFolderDomainRefresh");
const focusDomain = sliceFunction("async function refreshFocusDomain", "function requestFocusDomainRefresh");
const taskListFoldersSource = readFileSync(new URL("../src/lib/task-list-folders.ts", import.meta.url), "utf8");

test("all eight non-Task workspace Realtime handlers avoid the broad core refresh", () => {
  const expectedScopedCalls: Record<string, string> = {
    adhdice_task_list_folders: "requestTaskListDomainRefresh",
    adhdice_task_content_folders: "requestTaskContentFolderDomainRefresh",
    adhdice_task_list_containers: "requestTaskListDomainRefresh",
    adhdice_task_list_rail_items: "requestTaskListDomainRefresh",
    adhdice_focus_categories: "requestFocusDomainRefresh",
    adhdice_task_focus_days: "requestFocusDomainRefresh",
    adhdice_task_lists: "requestTaskListDomainRefresh",
    adhdice_task_list_manual_memberships: "requestTaskListDomainRefresh",
  };

  for (const [table, scopedCall] of Object.entries(expectedScopedCalls)) {
    const handler = sliceRealtimeHandler(table);
    assert.doesNotMatch(handler, /requestCoreWorkspaceRefresh/);
    assert.match(handler, new RegExp(`${scopedCall}\\("${table}"\\)`));
  }
});

test("Task List Realtime uses one grouped authoritative snapshot and no unrelated reads", () => {
  for (const table of [
    "adhdice_task_lists",
    "adhdice_task_list_manual_memberships",
  ]) {
    assert.match(taskListDomain, new RegExp(`from\\("${table}"\\)`));
  }
  assert.match(taskListDomain, /loadTaskListFolders\(client, userId\)/);
  for (const table of [
    "adhdice_task_list_folders",
    "adhdice_task_list_containers",
    "adhdice_task_list_rail_items",
  ]) {
    assert.match(taskListFoldersSource, new RegExp(`from\\("${table}"\\)`));
  }
  assert.match(taskListDomain, /reconcileTaskListRows\(taskListsResult\.data \?\? \[\], mapTaskListRow\)/);
  assert.match(taskListDomain, /mapTaskListManualMembershipRow/);
  assert.match(taskListDomain, /taskListDataGeneration\.current/);
  for (const unrelatedTable of [
    "adhdice_clean_tasks",
    "adhdice_task_schedule_boundaries",
    "adhdice_task_current_projections",
    "adhdice_user_profiles",
    "adhdice_task_history_facts",
    "adhdice_task_command_operations",
    "adhdice_focus_categories",
    "adhdice_task_focus_days",
    "adhdice_task_content_folders",
  ]) {
    assert.doesNotMatch(taskListDomain, new RegExp(`from\\("${unrelatedTable}"\\)`));
  }
});

test("Task Content Folder Realtime reads only normalized content-folder state", () => {
  assert.match(contentFolderDomain, /from\("adhdice_task_content_folders"\)/);
  assert.match(contentFolderDomain, /normalizeTaskContentFolderRow/);
  assert.match(contentFolderDomain, /taskContentFolderDataGenerationRef\.current/);
  for (const unrelatedTable of [
    "adhdice_clean_tasks",
    "adhdice_task_current_projections",
    "adhdice_task_lists",
    "adhdice_focus_categories",
    "adhdice_task_focus_days",
  ]) {
    assert.doesNotMatch(contentFolderDomain, new RegExp(`from\\("${unrelatedTable}"\\)`));
  }
});

test("Focus Realtime reads categories and Focus days against current Tasks only", () => {
  assert.match(focusDomain, /from\("adhdice_focus_categories"\)/);
  assert.match(focusDomain, /from\("adhdice_task_focus_days"\)/);
  assert.match(focusDomain, /mergeStoredFocusCategories/);
  assert.match(focusDomain, /mapFocusCategoryRow/);
  assert.match(focusDomain, /mapTaskFocusDayRows\(focusDayResult\.data \?\? \[\], currentTasks\)/);
  assert.match(focusDomain, /saveFocusCategories\(nextCategories\)/);
  assert.match(focusDomain, /focusDataGenerationRef\.current/);
  for (const unrelatedTable of [
    "adhdice_clean_tasks",
    "adhdice_task_schedule_boundaries",
    "adhdice_task_current_projections",
    "adhdice_user_profiles",
    "adhdice_task_lists",
    "adhdice_task_content_folders",
  ]) {
    assert.doesNotMatch(focusDomain, new RegExp(`from\\("${unrelatedTable}"\\)`));
  }
});

test("Focus category suppression remains a scoped no-op during local category persistence", () => {
  const handler = sliceRealtimeHandler("adhdice_focus_categories");
  assert.match(handler, /if \(!suppressCategoryReload\.current\) \{\s*requestFocusDomainRefresh\("adhdice_focus_categories"\)/);
  assert.doesNotMatch(handler, /requestCoreWorkspaceRefresh/);
});

test("domain refresh bursts share one active read and one latest trailing read", async () => {
  const coordinator = createSingleFlightRefreshCoordinator<number>();
  let releaseActive!: () => void;
  const active = new Promise<void>((resolve) => { releaseActive = resolve; });
  const runs: number[] = [];

  const first = coordinator.request(async () => {
    runs.push(1);
    await active;
    return 1;
  });
  const joined = coordinator.request(async () => {
    runs.push(2);
    return 2;
  }, { refreshAfterCurrent: true });
  const latest = coordinator.request(async () => {
    runs.push(3);
    return 3;
  }, { refreshAfterCurrent: true });

  releaseActive();
  assert.deepEqual(await Promise.all([first, joined, latest]), [3, 3, 3]);
  assert.deepEqual(runs, [1, 3]);
});

test("domain results are fenced by active owner and domain generation", () => {
  assert.match(workspaceSource, /function canApplyCoreWorkspaceResult\(\) \{[\s\S]*isActive[\s\S]*liveWorkspaceUserIdRef\.current === userId[\s\S]*workspaceGenerationRef\.current === workspaceGeneration/);
  assert.match(taskListDomain, /!canApplyCoreWorkspaceResult\(\) \|\| generation !== taskListDataGeneration\.current/);
  assert.match(contentFolderDomain, /!canApplyCoreWorkspaceResult\(\) \|\| generation !== taskContentFolderDataGenerationRef\.current/);
  assert.match(focusDomain, /!canApplyCoreWorkspaceResult\(\) \|\| generation !== focusDataGenerationRef\.current/);
  assert.match(workspaceSource, /taskContentFolderLoadGeneration === taskContentFolderDataGenerationRef\.current/);
  assert.match(workspaceSource, /focusLoadGeneration === focusDataGenerationRef\.current/);
});

test("missing list tables retain compatibility and membership readiness", () => {
  assert.match(taskListDomain, /isMissingTaskListsTableError\(taskListsResult\.error\.message\)/);
  assert.match(taskListDomain, /isMissingTaskListManualMembershipsTableError\(manualMembershipResult\.error\.message\)/);
  assert.match(taskListDomain, /\? \[\]$/m);
  assert.match(taskListDomain, /setTaskListMembershipDataReadyUserId\(userId\)/);
});

test("Notes, History, and Current Projection Realtime paths remain scoped", () => {
  const notes = sliceRealtimeHandler("adhdice_notes");
  const history = sliceRealtimeHandler("adhdice_task_history_facts");
  const projection = workspaceSource.slice(
    workspaceSource.indexOf('table: "adhdice_task_current_projections"'),
    workspaceSource.indexOf("const workspaceChannel = client.channel"),
  );
  assert.match(notes, /loadNotes\(\{ silent: true \}\)/);
  assert.match(history, /loadTaskHistoryForTask\(taskId, \{ force: true, silent: true \}\)/);
  assert.match(history, /scheduleTaskHistoryRevisionReconciliation/);
  assert.match(projection, /enqueueProjectionRealtimePayload/);
  assert.doesNotMatch(`${notes}\n${history}\n${projection}`, /requestCoreWorkspaceRefresh/);
});

test("ordinary startup and Current Projection fallback contracts remain intact", () => {
  const coreLoader = workspaceSource.slice(
    workspaceSource.indexOf("async function loadCoreWorkspaceData"),
    workspaceSource.indexOf("const requestCoreWorkspaceRefresh"),
  );
  assert.doesNotMatch(coreLoader, /startBackgroundTaskHistoryHydration\(|loadTaskHistory\(\{/);
  assert.match(coreLoader, /adhdice_task_current_projections/);
  assert.match(coreLoader, /mergeCurrentTaskProjectionRows/);
  assert.match(coreLoader, /projectTasksWithCanonicalScheduleBoundaries/);
});
