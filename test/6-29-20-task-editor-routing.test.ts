import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("shared task editor validates targets without changing the active page", async () => {
  const app = await source("../src/components/task-app.tsx");
  assert.match(app, /import \{ buildTaskOccurrenceIdentity, occurrenceIdentityMatches \} from "@\/lib\/on-time-planner"/);
  const opener = app.slice(app.indexOf("function openSharedTaskEditor"), app.indexOf("function goToActiveTimerTask"));
  assert.match(opener, /tasks\.find\(\(entry\) => entry\.id === taskId\)/);
  assert.match(opener, /task\.status === "trashed" \|\| task\.status === "archived"/);
  assert.match(opener, /occurrenceIsClearlyStale/);
  assert.match(opener, /setSharedTaskEditorOverlayTaskId\(taskId\)/);
  assert.doesNotMatch(opener, /setActivePage|setSharedTaskEditorReturnPage/);
  assert.doesNotMatch(opener, /setTaskUiState|setActiveTaskWorkspaceTab|setRequestedListOverlayTaskId|tasksSurface|view:|highlight|scroll/);
  assert.doesNotMatch(opener, /updateTask|persist|pause|resume|stop|discard|evidence/i);
});

test("shared task editor uses one page-independent full-page overlay host", async () => {
  const app = await source("../src/components/task-app.tsx");
  const globalHost = app.slice(app.indexOf("{sharedTaskEditorOverlayTaskId && requestedSharedTaskRow"), app.indexOf("{isAccountOpen ?"));
  assert.match(globalHost, /<TaskManagementTableV2/);
  assert.match(globalHost, /overlayOnly/);
  assert.match(globalHost, /requestedOpenTaskId=\{sharedTaskEditorOverlayTaskId\}/);
  assert.match(globalHost, /onInspectorClose=\{closeSharedTaskEditorOverlay\}/);
  assert.match(app, /showSharedTaskEditorOverlay=\{false\}/);
  assert.match(app, /overlayOnly: false/);
});

test("Home and Table request the shared overlay without changing the active page", async () => {
  const [app, table] = await Promise.all([
    source("../src/components/task-app.tsx"),
    source("../src/components/ui/task-management-table-v2.tsx"),
  ]);
  const homeBranch = app.slice(app.lastIndexOf('activePage === "Home"'), app.lastIndexOf('activePage === "Achievements"'));
  const tableProps = app.slice(app.indexOf("tableViewPanel={"), app.indexOf("listViewPanel={"));
  const detailsAction = table.slice(table.indexOf("function openTaskDetailsFromContextMenu"), table.indexOf("function clearPendingRowClick"));
  const rowAction = table.slice(table.indexOf("function openRowPrimaryAction"), table.indexOf("function renderFocusTimerDial"));
  const childAction = table.slice(table.indexOf("function openTaskInCurrentEditor"), table.indexOf("function openTableStepActions"));
  assert.match(homeBranch, /onOpenTask=\{openTaskEditorFromId\}/);
  assert.doesNotMatch(homeBranch, /setActivePage|TaskEditFlows/);
  assert.match(tableProps, /onOpenTaskEditor: openSharedTaskEditor/);
  for (const action of [detailsAction, rowAction, childAction]) {
    assert.match(action, /if \(onOpenTaskEditor\) \{\s*onOpenTaskEditor\(taskId\);\s*return;/);
  }
});

test("inline New Task routes the created parent to the shared full editor", async () => {
  const app = await source("../src/components/task-app.tsx");
  const composer = app.slice(app.indexOf("const openInlineNewListTaskComposer"), app.indexOf("const duplicateTaskInPlace"));
  assert.match(composer, /createTaskAndOpenSharedEditor\(buildNewTaskDraft\("New Task"\)/);
  assert.match(composer, /routeToCurrentBucket: true/);
  const helper = app.slice(app.indexOf("const createTaskAndOpenSharedEditor"), app.indexOf("const openCalendarDateTaskEditor"));
  assert.match(helper, /openExistingTaskEditor\(createdTask\)/);
  assert.doesNotMatch(composer, /setRequestedListOverlayTaskId\(createdTask\.id\)/);
  assert.match(composer, /\}, \[createTaskAndOpenSharedEditor\]\);/);
});

test("normal and explicit field opens keep task identity separate from monotonic focus identity", async () => {
  const app = await source("../src/components/task-app.tsx");
  const opener = app.slice(app.indexOf("function openSharedTaskEditor"), app.indexOf("function goToActiveTimerTask"));
  assert.match(app, /type TaskEditorFocusRequest/);
  assert.match(app, /const taskEditorFocusTokenRef = useRef\(0\)/);
  assert.match(opener, /options\?\.initialField\s*\? \{ field: options\.initialField, taskId, token: \+\+taskEditorFocusTokenRef\.current \}\s*: null/);
  assert.match(app, /openSharedTaskEditor\(taskId, \{ initialField: "estimated_time" \}\)/);
  assert.match(app, /openSharedTaskEditor\(taskId, \{ preserveActivePage: true, timer \}\)/);
});

test("full inspector routes parent, Step, and Substep metadata before one-time Estimated Time focus", async () => {
  const table = await source("../src/components/ui/task-management-table-v2.tsx");
  const childRouting = table.slice(table.indexOf("function revealChildTaskInParentEditor"), table.indexOf("function toggleInlineActionRow"));
  const requestedOpenEffect = table.slice(table.indexOf("const acknowledgeNormalOpen"), table.indexOf("const resolvedMetadataTask"));
  const focusEffect = table.slice(table.indexOf("const resolvedMetadataTask"), table.indexOf("const mergedListOptions"));
  assert.match(childRouting, /ancestorChildTaskIds/);
  assert.match(childRouting, /openInspector\(parentTask\.id, "full"\)/);
  assert.match(childRouting, /setMetadataTargetTaskId\(taskId\)/);
  assert.match(requestedOpenEffect, /requestedEditorFocus\?\.field === "estimated_time"/);
  assert.match(requestedOpenEffect, /requestedEditorFocus\.taskId === requestedOpenTaskId/);
  assert.match(requestedOpenEffect, /isTaskEditorChildRouteSettled\(\{ metadataTargetTaskId, requestedOpenTaskId, selectedTaskId \}\)[\s\S]*acknowledgeNormalOpen\(\);[\s\S]*return;/);
  assert.match(requestedOpenEffect, /isTaskEditorChildRouteSettled[\s\S]*revealChildTaskInParentEditor/);
  assert.doesNotMatch(requestedOpenEffect, /selectMetadataPanel|\[requestedOpenTaskId\]: "estimated"/);
  assert.match(focusEffect, /const resolvedMetadataTask = metadataTargetTask \?\? selectedTask/);
  assert.match(focusEffect, /resolveTaskEditorFocusPhase/);
  assert.match(focusEffect, /selectMetadataPanel\(resolvedMetadataTask\.id, "estimated"\)/);
  assert.match(focusEffect, /handledEditorFocusTokensRef\.current\.has/);
  assert.match(focusEffect, /requestAnimationFrame/);
  assert.match(focusEffect, /input\.focus\(\{ preventScroll: true \}\)/);
  assert.match(focusEffect, /document\.activeElement !== input/);
  assert.match(focusEffect, /scrollIntoView\(\{ block: "nearest", inline: "nearest" \}\)/);
  assert.match(focusEffect, /onRequestedOpenTaskHandled\?\.\(requestedEditorFocus\.taskId\)/);
  assert.match(focusEffect, /onRequestedEditorFocusHandled\?\.\(token\)/);
  assert.doesNotMatch(focusEffect, /setTimeout/);
});

test("manual and automatic metadata selection share the render-resolved selector", async () => {
  const table = await source("../src/components/ui/task-management-table-v2.tsx");
  assert.match(table, /const selectMetadataPanel = useCallback/);
  assert.match(table, /selectMetadataPanel\(resolvedMetadataTask\.id, "estimated"\)/);
  assert.match(table, /onClick=\{\(\) => selectMetadataPanel\(metadataTask\.id, row\.panelId as MetadataPanelId\)\}/);
});

test("desktop and mobile share one semantic Estimated Time input and unchanged Apply mutation", async () => {
  const table = await source("../src/components/ui/task-management-table-v2.tsx");
  assert.match(table, /ref=\{estimatedTimeInputRef\} aria-label="Estimated Time"/);
  assert.match(table, /name="estimated_time"/);
  assert.match(table, /const useMobileFullOverlay = overlayMode === "full" && isCompactViewport/);
  assert.equal((table.match(/ref=\{estimatedTimeInputRef\}/g) ?? []).length, 1);
  assert.match(table, /onClick=\{applyMetadataEstimatedMinutes\}/);
});

test("overlay close clears unhandled focus without creating task writes", async () => {
  const app = await source("../src/components/task-app.tsx");
  const close = app.slice(app.indexOf("const closeSharedTaskEditorOverlay"), app.indexOf("const scratchPaperData"));
  assert.match(close, /setSharedTaskEditorOverlayTaskId\(null\)/);
  assert.match(close, /setTaskEditorFocusRequest\(null\)/);
  assert.doesNotMatch(close, /setActivePage|setSharedTaskEditorReturnPage/);
  assert.doesNotMatch(close, /updateTask|updatePlan|save|insert|upsert/);
});
