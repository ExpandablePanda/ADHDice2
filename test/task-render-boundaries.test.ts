import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/components/task-app/tasks-page-orchestrator.tsx", import.meta.url), "utf8");
const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/task-app/tasks-page.tsx", import.meta.url), "utf8");

test("Table interaction state stays in the direct windowed hierarchy render", () => {
  assert.doesNotMatch(tableSource, /TaskTableRow|uiRevision|areTaskRowPropsEqual|render=\{\(\) => \(/);
  assert.match(tableSource, /renderedTasks\.map\(\(task\) =>/);
  assert.match(tableSource, /hasRenderedDescendants/);
  assert.match(tableSource, /hasTableStepDraft/);
  assert.match(tableSource, /setOverlayMode\(mode\)/);
  assert.match(tableSource, /TaskStatusCircleRail/);
  assert.match(tableSource, /getRunningTimer\(task\.id\)/);
  assert.match(tableSource, /style=\{\{ gridTemplateColumns \}\}/);
  assert.match(tableSource, /loadMoreTasksRef/);
});

test("List interaction state stays in the direct windowed hierarchy render", () => {
  assert.doesNotMatch(listSource, /TaskListRow|uiRevision|areTaskRowPropsEqual|render=\{\(\) => \(/);
  assert.match(listSource, /windowedTasks\.map\(\(task\) =>/);
  assert.match(listSource, /isQuickPanelOpen/);
  assert.match(listSource, /tableProps\.onOpenTaskEditor\?\.\(task\.id\)/);
  assert.match(listSource, /tableProps\.onOpenTaskHistory\?\.\(task\.id\)/);
  assert.match(listSource, /TaskStatusCircleRail/);
  assert.match(listSource, /runningTimerByTaskId\.get\(task\.id\)/);
});

test("Tasks shell renders all current props and keeps the external flow layer", () => {
  assert.match(workspaceSource, /export function TasksWorkspace\(/);
  assert.doesNotMatch(workspaceSource, /renderRevision|memo\(/);
  assert.match(workspaceSource, /onRenameTab\(tabId, nextLabel\)/);
  assert.match(workspaceSource, /onReorderTab\(sourceTabId, index\)/);
  assert.match(appSource, /const taskWorkspaceFlowLayer =/);
  assert.match(appSource, /\{taskWorkspaceFlowLayer\}\s*<TasksWorkspace/);
  assert.doesNotMatch(appSource, /<TasksWorkspace[\s\S]*?renderRevision=/);
});

test("Tasks shell controls and folder navigation remain wired to live handlers", () => {
  for (const handler of [
    "onToggleListColumnMenu",
    "onToggleKeyboardShortcutsMenu",
    "onExpandAllColumns",
    "onShrinkAllColumns",
    "onNavigateFolder",
    "onToggleRail",
  ]) {
    assert.match(shellSource, new RegExp(handler));
  }
  assert.match(shellSource, /onNavigateFolder\?\.\(currentFolderId === folderId/);
});

test("Stable row caches and bounded windowing remain the performance controls", () => {
  assert.match(listSource, /ROW_MODEL_WINDOW_SIZE = 24/);
  assert.match(listSource, /ROW_MODEL_OVERSCAN = 8/);
  assert.match(listSource, /createStableTaskRowModelCache/);
  assert.match(listSource, /tasks\.slice\(0, rowWindowCount\)/);
  assert.match(listSource, /rowModelCache\.getOrCreate/);
  assert.match(tableSource, /const renderedTasks = useMemo\(/);
  assert.match(tableSource, /loadMoreTasksRef/);
  assert.match(tableSource, /remainingRenderedTaskCount/);
});

test("Complete confirmation is app-global while Tasks retains only its other flows", () => {
  const completeFlowStart = appSource.indexOf("const completeFlow");
  const taskWorkspaceFlowStart = appSource.indexOf("const taskWorkspaceFlowLayer");
  const returnStart = appSource.indexOf("\n  return (\n    <main");
  const homeBranchStart = appSource.indexOf(') : activePage === "Home" ?', returnStart);
  const achievementsBranchStart = appSource.indexOf(') : activePage === "Achievements" ?', homeBranchStart);
  const tasksBranchStart = appSource.indexOf(') : activePage === "Tasks" ?', achievementsBranchStart);
  const focusBranchStart = appSource.indexOf(') : activePage === "Focus" ?', tasksBranchStart);
  const completeFlow = appSource.slice(completeFlowStart, taskWorkspaceFlowStart);
  const appGlobalRender = appSource.slice(returnStart, homeBranchStart);
  const taskWorkspaceFlowLayer = appSource.slice(taskWorkspaceFlowStart, tasksBranchStart);
  const homeBranch = appSource.slice(homeBranchStart, achievementsBranchStart);

  assert.ok(completeFlowStart >= 0 && completeFlowStart < taskWorkspaceFlowStart);
  assert.ok(returnStart >= 0 && homeBranchStart > returnStart);
  assert.ok(focusBranchStart > tasksBranchStart);
  assert.equal((appSource.match(/<TaskEditFlows/g) ?? []).length, 2);
  assert.match(completeFlow, /pendingCompleteAction/);
  assert.match(completeFlow, /getTaskCompleteConfirmationDescription\(completeFlowTask\)/);
  assert.match(completeFlow, /Complete Milestone and award trophy\?/);
  assert.match(completeFlow, /onClose: \(\) => setPendingCompleteAction\(null\)/);
  assert.match(completeFlow, /onConfirm: \(\) => \{ void confirmPendingTaskComplete\(\); \}/);
  assert.match(appGlobalRender, /<TaskEditFlows[\s\S]*batchDeleteFlow=\{null\}[\s\S]*batchEditFlow=\{null\}[\s\S]*completeFlow=\{completeFlow\}[\s\S]*focusPlannerFlow=\{null\}[\s\S]*momentumFlow=\{null\}[\s\S]*taskHistoryFlow=\{null\}/);
  assert.match(taskWorkspaceFlowLayer, /completeFlow=\{null\}/);
  assert.doesNotMatch(taskWorkspaceFlowLayer, /pendingCompleteAction|confirmPendingTaskComplete|Complete Milestone and award trophy/);
  assert.match(homeBranch, /onSetStatus=\{\(task, status\) => \{ void updateTaskStatus\(task, status\); \}\}/);
  assert.doesNotMatch(homeBranch, /setActivePage\(\"Tasks\"\)/);

  const updateTaskStatusStart = appSource.indexOf("async function updateTaskStatus");
  const updateTaskStatusEnd = appSource.indexOf("async function toggleTaskPinned", updateTaskStatusStart);
  const updateTaskStatus = appSource.slice(updateTaskStatusStart, updateTaskStatusEnd);
  assert.match(updateTaskStatus, /if \(status === "complete"\) \{[\s\S]*requestTaskComplete\(task/);
});
