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
