import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const tabBarSource = readFileSync(new URL("../src/components/task-app/master-workspace-tab-bar.tsx", import.meta.url), "utf8");
const splitPanelSource = readFileSync(new URL("../src/components/task-app/tasks-split-right-panel.tsx", import.meta.url), "utf8");
const controllerSource = readFileSync(new URL("../src/hooks/useMasterWorkspaceController.ts", import.meta.url), "utf8");
const taskListAdapterSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
const taskTableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");

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
  assert.match(taskAppSource, /onDraftEditingChange=\{reportLeftWorkspaceDraft\}/);
  assert.match(taskAppSource, /onDraftEditingChange=\{reportLeftTableDraft\}/);
  assert.match(taskAppSource, /onDraftEditingChange=\{reportLeftListDraft\}/);
  assert.match(taskAppSource, /onDraftEditingChange: reportRightWorkspaceDraft/);
  assert.match(taskAppSource, /onDraftEditingChange=\{reportRightTableDraft\}/);
  assert.match(taskAppSource, /onDraftEditingChange: reportRightListDraft/);
  assert.match(taskAppSource, /onOpenBatchDelete: \(\) => openBatchDeleteModal\(splitRightSelectedTaskIds\)/);
  assert.match(taskAppSource, /onOpenBatchEdit: \(\) => openBatchEditModal\(splitRightSelectedTaskIds\)/);
  assert.match(taskAppSource, /collapsedTaskContentFolderIds: splitRightCollapsedTaskContentFolderIds/);
  assert.match(taskAppSource, /collapsedTaskContentFolderIds: Array\.from\(collapsedIds\)/);
  assert.match(taskAppSource, /selectedTasks: batchModalTasks/);
  assert.match(taskAppSource, /deleteTasks\(batchActionTaskIdsOverride\)/);
  assert.match(taskAppSource, /tabs:\s*splitRightTaskWorkspaceTabsState\.tabs/);
  assert.match(taskAppSource, /onOpenTaskEditor:\s*\(taskId: string, navigationTaskIds\?: string\[\]\) => openSharedTaskEditor\(taskId, \{ owner: rightOwner/);
  assert.match(taskAppSource, /function getTaskEditorOpenBlockMessage\([\s\S]*?hasTaskPanelDraftOutsideOwner\(draftOwnerKeys, ownerKey\)[\s\S]*?other Tasks panel/);
  assert.match(taskAppSource, /updateRightPanelTasksUiState\(splitPanels\.right\.id, splitPanels\.rightTab\.id/);
  assert.match(taskAppSource, /masterWorkspace\.isEnabled\s*\?/);
  assert.match(splitPanelSource, /aria-label="Left Tasks panel"[\s\S]*?overflow-y-auto/);
  assert.match(splitPanelSource, /aria-label="Right Tasks panel"[\s\S]*?overflow-y-auto/);
  assert.doesNotMatch(taskAppSource, /ReadOnlyTasksPanel/);
  assert.doesNotMatch(splitPanelSource, /read.only|ReadOnlyTasksPanel/);
  assert.doesNotMatch(splitPanelSource, /TaskApp|useWorkspaceData|useTaskUiState/);
});

test("Task draft reporters stay stable across rerenders and clear on state changes or unmount", () => {
  assert.match(taskAppSource, /const reportTaskPanelDraft = useCallback\(/);
  assert.match(taskAppSource, /const reportLeftTableDraft = useCallback\(/);
  assert.match(taskAppSource, /const reportRightTableDraft = useCallback\(/);
  assert.match(taskAppSource, /getTaskPanelDraftSourceKey\(ownerKey, source\)/);
  assert.match(taskListAdapterSource, /onDraftEditingChangeRef\.current = onDraftEditingChange/);
  assert.match(taskListAdapterSource, /useEffect\(\(\) => \(\) => onDraftEditingChangeRef\.current\?\.\(false\), \[\]\)/);
  assert.doesNotMatch(taskListAdapterSource, /useEffect\(\(\) => \(\) => onDraftEditingChange\?\.\(false\), \[onDraftEditingChange\]\)/);
  const listDraftEffectDependencies = taskListAdapterSource.match(/useEffect\(\(\) => \{\s*onDraftEditingChangeRef\.current\?\.\(Boolean\([\s\S]*?\n  \}, \[([^\]]*)\]\);/)?.[1];
  assert.ok(listDraftEffectDependencies);
  assert.doesNotMatch(listDraftEffectDependencies, /onDraftEditingChange/);
  assert.match(taskTableSource, /onUnsafeDraftChangeRef\.current = onUnsafeDraftChange/);
  assert.match(taskTableSource, /useEffect\(\(\) => \(\) => onUnsafeDraftChangeRef\.current\?\.\(false\), \[\]\)/);
  assert.doesNotMatch(taskTableSource, /useEffect\(\(\) => \(\) => onUnsafeDraftChange\?\.\(false\), \[onUnsafeDraftChange\]\)/);
  const tableDraftEffectDependencies = taskTableSource.match(/useEffect\(\(\) => \{\s*onUnsafeDraftChangeRef\.current\?\.\(Boolean\([\s\S]*?\n  \}, \[([^\]]*)\]\);/)?.[1];
  assert.ok(tableDraftEffectDependencies);
  assert.doesNotMatch(tableDraftEffectDependencies, /onUnsafeDraftChange/);
});

test("Master Workspace exposes Split Right only for a focused Tasks destination and closes saved splits", () => {
  assert.match(tabBarSource, /Split Right/);
  assert.match(tabBarSource, /Close Split/);
  assert.match(controllerSource, /activeTab\.destination\.page === "Tasks"/);
  assert.match(controllerSource, /duplicateFocusedPageIntoRightPanel\(withLiveTasksSnapshot/);
  assert.match(controllerSource, /return activateMasterPanel\(split, panel\.id\)/);
  assert.match(controllerSource, /closeMasterSplitSafely\(withLiveTasksSnapshot, rightPanel\.id, hasUnsafeTasksDraft\)/);
  assert.match(controllerSource, /canCloseMasterSplitSafely\(before, hasUnsafeTasksDraft\)/);
  assert.match(controllerSource, /updateMasterTabTasksWorkspace\([\s\S]*?liveTaskWorkspaceTabsState/);
  assert.match(controllerSource, /const updateTasksWorkspace = useCallback/);
});
