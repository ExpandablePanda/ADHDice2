import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const tabBarSource = readFileSync(new URL("../src/components/task-app/master-workspace-tab-bar.tsx", import.meta.url), "utf8");
const splitPanelSource = readFileSync(new URL("../src/components/task-app/tasks-split-right-panel.tsx", import.meta.url), "utf8");
const controllerSource = readFileSync(new URL("../src/hooks/useMasterWorkspaceController.ts", import.meta.url), "utf8");

test("Split Right reuses the Tasks workspace with panel-scoped presentation and selection", () => {
  assert.equal((taskAppSource.match(/useWorkspaceData\(/g) ?? []).length, 1);
  assert.equal((taskAppSource.match(/useTaskUiState\(/g) ?? []).length, 1);
  assert.equal((taskAppSource.match(/useTaskListSelection\(/g) ?? []).length, 2);
  assert.match(taskAppSource, /prepareTaskAppDerivedPresentation\(splitRightTasksUiState/);
  assert.match(taskAppSource, /buildTaskSearchPresentationScope\(stableCanonicalTaskIndex, splitRightTasksUiState/);
  assert.match(taskAppSource, /selectTaskSearchPresentation\([\s\S]*?presentation:\s*splitRightTasksUiState/);
  assert.match(taskAppSource, /buildTaskAppViewReadModel\([\s\S]*?searchSelection:\s*splitRightSearchSelection/);
  assert.match(taskAppSource, /cloneElement\(tasksWorkspace,\s*\{[\s\S]*?tableViewPanel:\s*rightTableViewPanel/);
  assert.match(taskAppSource, /<TasksTableAdapter[\s\S]*?tableProps=\{rightTaskTableProps\}/);
  assert.match(taskAppSource, /<TasksListAdapter/);
  assert.match(taskAppSource, /onOpenBatchDelete: \(\) => openBatchDeleteModal\(splitRightSelectedTaskIds\)/);
  assert.match(taskAppSource, /onOpenBatchEdit: \(\) => openBatchEditModal\(splitRightSelectedTaskIds\)/);
  assert.match(taskAppSource, /collapsedTaskContentFolderIds: splitRightCollapsedTaskContentFolderIds/);
  assert.match(taskAppSource, /collapsedTaskContentFolderIds: Array\.from\(collapsedIds\)/);
  assert.match(taskAppSource, /selectedTasks: batchModalTasks/);
  assert.match(taskAppSource, /deleteTasks\(batchActionTaskIdsOverride\)/);
  assert.match(taskAppSource, /tabs:\s*splitRightTaskWorkspaceTabsState\.tabs/);
  assert.match(taskAppSource, /onOpenTaskEditor:\s*\(taskId: string, navigationTaskIds\?: string\[\]\) => openSharedTaskEditor\(taskId, \{ owner: rightOwner/);
  assert.match(taskAppSource, /function getTaskEditorOpenBlockMessage\([\s\S]*?draftOwnerKeys\.some\([\s\S]*?other Tasks panel/);
  assert.match(taskAppSource, /updateRightPanelTasksUiState\(splitPanels\.right\.id, splitPanels\.rightTab\.id/);
  assert.match(taskAppSource, /masterWorkspace\.isEnabled\s*\?/);
  assert.match(splitPanelSource, /aria-label="Left Tasks panel"[\s\S]*?overflow-y-auto/);
  assert.match(splitPanelSource, /aria-label="Right Tasks panel"[\s\S]*?overflow-y-auto/);
  assert.doesNotMatch(taskAppSource, /ReadOnlyTasksPanel/);
  assert.doesNotMatch(splitPanelSource, /read.only|ReadOnlyTasksPanel/);
  assert.doesNotMatch(splitPanelSource, /TaskApp|useWorkspaceData|useTaskUiState/);
});

test("Master Workspace exposes Split Right only for a focused Tasks destination and closes saved splits", () => {
  assert.match(tabBarSource, /Split Right/);
  assert.match(tabBarSource, /Close Split/);
  assert.match(controllerSource, /activeTab\.destination\.page === "Tasks"/);
  assert.match(controllerSource, /duplicateFocusedPageIntoRightPanel\(withLiveTasksSnapshot/);
  assert.match(controllerSource, /return activateMasterPanel\(split, panel\.id\)/);
  assert.match(controllerSource, /closeMasterSplit\(withLiveTasksSnapshot, rightPanel\.id\)/);
  assert.match(controllerSource, /updateMasterTabTasksWorkspace\([\s\S]*?liveTaskWorkspaceTabsState/);
  assert.match(controllerSource, /const updateTasksWorkspace = useCallback/);
});
