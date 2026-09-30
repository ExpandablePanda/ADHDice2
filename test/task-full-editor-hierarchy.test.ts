import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { createJiti } from "jiti";

import { buildChildTaskCreationDraft } from "../src/lib/task-child-creation.ts";

const jiti = createJiti(import.meta.url, {
  alias: { "@": path.resolve(process.cwd(), "src") },
  jsx: { runtime: "automatic" },
});
const { getFullEditorChildSectionLabels, performEditorChildTitleRenameHandoff } = await jiti.import<{
  getFullEditorChildSectionLabels: (depth: number) => { action: string; heading: string };
  performEditorChildTitleRenameHandoff: (
    taskId: string,
    title: string,
    openTaskInCurrentEditor: (taskId: string) => void,
    beginInlineTaskTitleRename: (taskId: string, title: string) => void,
  ) => void;
}>(
  "../src/components/ui/task-management-table-v2.tsx",
);
const {
  getTaskTypeSelectInitialActiveOptionIndex,
  getTaskTypeSelectMenuPosition,
  moveTaskTypeSelectActiveOptionIndex,
} = await jiti.import<{
  getTaskTypeSelectInitialActiveOptionIndex: (
    options: ReadonlyArray<{ value: string }>,
    value: string,
  ) => number | null;
  getTaskTypeSelectMenuPosition: (
    triggerRect: { bottom: number; left: number; top: number; width: number },
    viewport: { height: number; width: number },
    panel?: { height?: number; width?: number },
    size?: "default" | "compact",
  ) => { left: number; top: number; width: number };
  moveTaskTypeSelectActiveOptionIndex: (
    optionCount: number,
    currentIndex: number | null,
    direction: "next" | "previous",
  ) => number | null;
}>("../src/components/task-app/task-type-identity.tsx");

const tableSource = readFileSync("src/components/ui/task-management-table-v2.tsx", "utf8");
const appSource = readFileSync("src/components/task-app.tsx", "utf8");
const listSource = readFileSync("src/components/task-app/tasks-list-adapter.tsx", "utf8");
const taskTypeSelectSource = readFileSync("src/components/task-app/task-type-identity.tsx", "utf8");
const homeSource = readFileSync("src/components/task-app/home-page.tsx", "utf8");
const subtaskActionsSource = readFileSync("src/hooks/useTaskSubtaskActions.ts", "utf8");
const editorSaveSource = readFileSync("src/hooks/useTaskEditorSaveAction.ts", "utf8");
const fullEditorStart = tableSource.indexOf("const childTaskPreviewGroup = overlayMode === \"full\"");
const fullEditorEnd = tableSource.indexOf("const shouldShowDetachedTaskNotice", fullEditorStart);
const fullEditorSource = tableSource.slice(fullEditorStart, fullEditorEnd);
const editorChildRowsStart = tableSource.indexOf("const renderEditorChildTaskRows");
const editorChildRowsEnd = tableSource.indexOf("const getStepMiniCellActionMode", editorChildRowsStart);
const editorChildRowsSource = tableSource.slice(editorChildRowsStart, editorChildRowsEnd);
const tableStepCreationComposerStart = tableSource.indexOf("function renderTableStepCreationComposer");
const tableStepCreationComposerEnd = tableSource.indexOf("function beginTableStepDraft", tableStepCreationComposerStart);
const tableStepCreationComposerSource = tableSource.slice(tableStepCreationComposerStart, tableStepCreationComposerEnd);

assert.ok(fullEditorStart >= 0, "full editor child section should be discoverable");
assert.ok(fullEditorEnd > fullEditorStart, "full editor child section boundary should be discoverable");
assert.ok(tableStepCreationComposerStart >= 0, "Table Step creation composer should be discoverable");
assert.ok(tableStepCreationComposerEnd > tableStepCreationComposerStart, "Table Step creation composer boundary should be discoverable");

test("root full editor uses Steps and Add Step", () => {
  assert.deepEqual(getFullEditorChildSectionLabels(0), { action: "Add Step", heading: "Steps" });
});

test("depth-1 Step full editor uses Substeps and Add Substep", () => {
  assert.deepEqual(getFullEditorChildSectionLabels(1), { action: "Add Substep", heading: "Substeps" });
});

test("depth-2 Substep full editor keeps the Substeps label", () => {
  assert.deepEqual(getFullEditorChildSectionLabels(2), { action: "Add Substep", heading: "Substeps" });
});

test("every full-editor descendant row exposes Add Substep", () => {
  for (const depth of [1, 2, 5]) {
    assert.deepEqual(getFullEditorChildSectionLabels(depth), { action: "Add Substep", heading: "Substeps" });
  }
  assert.match(editorChildRowsSource, /data-same-table-step-add=\{item\.id\}/);
  assert.match(editorChildRowsSource, /aria-label=\{`Add substep to \$\{item\.title \|\| "Untitled step"\}`\}/);
  assert.match(editorChildRowsSource, /beginTableStepDraft\(item\.id, "Substep"\)/);
});

test("Step and Substep title activation targets metadata and starts inline rename", () => {
  const titleButtonStart = editorChildRowsSource.indexOf("<button\n                          data-step-title-edit={item.id}");
  const titleButtonEnd = editorChildRowsSource.indexOf("<p className=", titleButtonStart);
  const titleButtonSource = editorChildRowsSource.slice(titleButtonStart, titleButtonEnd);
  const childRoutingSource = tableSource.slice(
    tableSource.indexOf("function revealChildTaskInParentEditor"),
    tableSource.indexOf("function toggleInlineActionRow"),
  );

  assert.ok(titleButtonStart >= 0, "Step/Substep title button should be discoverable");
  assert.match(titleButtonSource, /onClick=\{\(event\) => \{[\s\S]*event\.stopPropagation\(\);[\s\S]*handoffEditorChildTitleRename\(item\.id, item\.title\);/);
  assert.doesNotMatch(titleButtonSource, /openTaskInCurrentEditor\(item\.id\)/);
  assert.match(tableSource, /function handoffEditorChildTitleRename\(taskId: string, title: string\)[\s\S]*performEditorChildTitleRenameHandoff\(taskId, title, openTaskInCurrentEditor, beginInlineTaskTitleRename\)/);
  assert.match(editorChildRowsSource, /displayedItems\.map\(\(item, itemIndex\) =>/);
  assert.match(editorChildRowsSource, /item\.depth > 1 \? "Untitled substep" : "Untitled step"/);
  assert.match(childRoutingSource, /openInspector\(parentTask\.id, "full"\)/);
  assert.match(childRoutingSource, /setMetadataTargetTaskId\(taskId\)/);
  assert.match(editorChildRowsSource, /aria-label=\{`Change status for \$\{item\.title[\s\S]*event\.stopPropagation\(\);[\s\S]*setActiveMetadataPanelByTaskId/);
  assert.match(editorChildRowsSource, /aria-label=\{`\$\{isCollapsed \? "Expand" : "Collapse"[\s\S]*event\.stopPropagation\(\);[\s\S]*setCollapsedChildTaskIds/);
});

test("Step and Substep title handoff remains atomic when the prior rename blurs", () => {
  const events: string[] = [];
  const handoff = (taskId: string, title: string) => performEditorChildTitleRenameHandoff(
    taskId,
    title,
    (targetTaskId) => events.push(`target:${targetTaskId}`),
    (targetTaskId, targetTitle) => events.push(`rename:${targetTaskId}:${targetTitle}`),
  );

  handoff("step-a", "Step A");
  assert.deepEqual(events, ["target:step-a", "rename:step-a:Step A"]);

  events.length = 0;
  let pendingRename: { taskId: string; title: string } | null = { taskId: "step-b", title: "Step B" };
  const finishPriorRename = (currentTaskId: string) => {
    if (pendingRename && pendingRename.taskId !== currentTaskId) {
      const nextRename = pendingRename;
      pendingRename = null;
      handoff(nextRename.taskId, nextRename.title);
    }
  };
  finishPriorRename("step-a");
  assert.deepEqual(events, ["target:step-b", "rename:step-b:Step B"]);

  events.length = 0;
  pendingRename = { taskId: "substep-b", title: "Substep B" };
  finishPriorRename("substep-a");
  assert.deepEqual(events, ["target:substep-b", "rename:substep-b:Substep B"]);
  assert.match(tableSource, /openInspector\(parentTask\.id, "full"\)/);
  assert.match(tableSource, /setMetadataTargetTaskId\(taskId\)/);
});

test("row child creation uses the clicked row ID and renders the shared rich composer beneath that row", () => {
  assert.match(tableStepCreationComposerSource, /<TaskChildCreationComposer/);
  assert.match(tableStepCreationComposerSource, /parentTaskId=\{parentTaskId\}/);
  assert.match(tableStepCreationComposerSource, /childLabel=\{childLabel\}/);
  assert.match(tableStepCreationComposerSource, /allTags=\{allTagOptions\}/);
  assert.match(tableStepCreationComposerSource, /taskTypeOptions=\{taskTypeFilterOptions\}/);
  assert.match(tableStepCreationComposerSource, /min-w-0 w-full max-w-\[52rem\]/);
  assert.match(tableSource, /beginTableStepComposer\(task\.id\)/);
  assert.match(tableSource, /beginTableStepComposer\(item\.id, "Substep"\)/);
  assert.match(editorChildRowsSource, /data-full-editor-child-draft-row=\{item\.id\}/);
  assert.ok(editorChildRowsSource.indexOf("data-same-table-step-row={item.id}") < editorChildRowsSource.indexOf("data-full-editor-child-draft-row={item.id}"));
  assert.match(editorChildRowsSource, /placeholder="Substep title\.\.\."/);
  assert.match(editorChildRowsSource, /Add Substep\s*<\/TaskTableChipButton>/);
});

test("Table Step and Substep creation expose the shared rich metadata fields", () => {
  assert.match(tableStepCreationComposerSource, /TaskChildCreationComposer/);
  assert.match(tableSource, /TaskCreationMetadata/);
  assert.match(listSource, /TaskCreationMetadata/);
});

test("legacy full-editor child drafts remain separate from the row rich composer", () => {
  assert.match(editorChildRowsSource, /beginTableStepDraft\(item\.id, "Substep"\)/);
  assert.match(editorChildRowsSource, /setTableStepDraftTaskTypeValues/);
  assert.match(tableSource, /function cancelTableStepDraft\(parentTaskId: string\)/);
  assert.match(tableSource, /function commitTableStepDraft\(parentTaskId: string\)/);
});

test("Task Type selectors keep full-size defaults and use compact portaled controls for dense child creation", () => {
  assert.match(taskTypeSelectSource, /export type TaskTypeSelectSize = "default" \| "compact"/);
  assert.match(taskTypeSelectSource, /size = "default"/);
  assert.match(taskTypeSelectSource, /min-h-10 w-full/);
  assert.match(taskTypeSelectSource, /min-h-7 min-w-\[7rem\] max-w-\[13rem\] w-auto/);
  assert.match(taskTypeSelectSource, /createPortal\(panel, document\.body\)/);
  assert.match(taskTypeSelectSource, /position: "fixed"/);
  assert.match(taskTypeSelectSource, /getBoundingClientRect\(\)/);
  assert.match(taskTypeSelectSource, /document\.addEventListener\("pointerdown"/);
  assert.match(taskTypeSelectSource, /event\.key !== "Escape"/);
  assert.match(taskTypeSelectSource, /data-task-type-select-menu="true"/);
  assert.match(taskTypeSelectSource, /role="listbox"/);
  assert.match(taskTypeSelectSource, /role="option"/);
  assert.match(homeSource, /<TaskCreationComposer/);
  assert.match(tableStepCreationComposerSource, /<TaskChildCreationComposer/);
  assert.match(editorChildRowsSource, /<TaskTypeSelect[\s\S]*className="mt-0"[\s\S]*size="compact"/);
  assert.match(listSource, /<TaskChildCreationComposer[\s\S]*taskTypeOptions=\{taskTypeOptions\}/);
  assert.doesNotMatch(tableStepCreationComposerSource, /min-w-\[10rem\]|flex-\[1_1_10rem\]/);
});

test("Task Type selection exposes an early pointer interaction lifecycle while preserving the portal", () => {
  assert.match(taskTypeSelectSource, /onInteractionEnd\?: \(\) => void/);
  assert.match(taskTypeSelectSource, /onInteractionStart\?: \(\) => void/);
  assert.match(taskTypeSelectSource, /const handleInteractionPointerDown = \(\) => \{[\s\S]*onInteractionStart\?\.\(\);[\s\S]*scheduleInteractionEnd\(\);/);
  assert.match(taskTypeSelectSource, /onPointerDown=\{handleInteractionPointerDown\}/);
  assert.match(taskTypeSelectSource, /onPointerDown=\{\(event\) => \{[\s\S]*event\.stopPropagation\(\);[\s\S]*handleInteractionPointerDown\(\);/);
  assert.match(taskTypeSelectSource, /requestAnimationFrame\(/);
  assert.match(taskTypeSelectSource, /cancelAnimationFrame\(/);
  assert.match(taskTypeSelectSource, /onClick=\{\(\) => selectOption\(option\)\}/);
  assert.match(taskTypeSelectSource, /createPortal\(panel, document\.body\)/);
  assert.match(taskTypeSelectSource, /position: "fixed"/);
});

test("Task Type keyboard navigation keeps focus on the trigger and never commits while moving", () => {
  const options = [{ value: "task" }, { value: "practice" }, { value: "routine" }];
  assert.equal(getTaskTypeSelectInitialActiveOptionIndex(options, "practice"), 1);
  assert.equal(getTaskTypeSelectInitialActiveOptionIndex(options, "stale"), 0);
  assert.equal(moveTaskTypeSelectActiveOptionIndex(options.length, 1, "next"), 2);
  assert.equal(moveTaskTypeSelectActiveOptionIndex(options.length, 1, "previous"), 0);
  assert.equal(moveTaskTypeSelectActiveOptionIndex(options.length, 2, "next"), 2);
  assert.equal(moveTaskTypeSelectActiveOptionIndex(options.length, 0, "previous"), 0);
  assert.equal(moveTaskTypeSelectActiveOptionIndex(0, null, "next"), null);

  assert.match(taskTypeSelectSource, /onKeyDown=\{\(event\) => \{/);
  assert.match(taskTypeSelectSource, /event\.key === "ArrowDown" \|\| event\.key === "ArrowUp"[\s\S]*event\.preventDefault\(\)/);
  assert.match(taskTypeSelectSource, /if \(!isOpen\) \{\s*openMenu\(\);\s*return;\s*\}/);
  assert.match(taskTypeSelectSource, /event\.key === "Home" \? 0 : Math\.max\(0, options\.length - 1\)/);
  assert.match(taskTypeSelectSource, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(taskTypeSelectSource, /selectActiveOption\(\)/);
  assert.match(taskTypeSelectSource, /onChange\(option\.value\);[\s\S]*closeMenu\(true\)/);
  assert.match(taskTypeSelectSource, /data-task-type-select-option-index=\{optionIndex\}/);
  assert.match(taskTypeSelectSource, /revealDropdownOptionWithinPanel\(activeOption, menuRef\.current\)/);
  assert.match(taskTypeSelectSource, /aria-activedescendant=\{isOpen && activeOptionIndex !== null/);
  assert.match(taskTypeSelectSource, /aria-controls=\{menuId\}/);
  assert.match(taskTypeSelectSource, /role="combobox"/);
  assert.doesNotMatch(taskTypeSelectSource, /ArrowDown[\s\S]*onChange\(option\.value\)/);
});

test("Task Type keyboard close semantics preserve normal Tab movement and child draft safety", () => {
  const tabHandlerStart = taskTypeSelectSource.indexOf('if (event.key === "Tab")');
  const tabHandlerEnd = taskTypeSelectSource.indexOf('if (event.key === "Escape")', tabHandlerStart);
  const tabHandlerSource = taskTypeSelectSource.slice(tabHandlerStart, tabHandlerEnd);
  assert.match(tabHandlerSource, /if \(isOpen\) closeMenu\(\);/);
  assert.doesNotMatch(tabHandlerSource, /preventDefault/);
  assert.match(taskTypeSelectSource, /event\.key === "Escape"[\s\S]*event\.stopPropagation\(\)[\s\S]*closeMenu\(true\)/);
  assert.match(taskTypeSelectSource, /id=\{menuId\}/);
  assert.doesNotMatch(taskTypeSelectSource, /selectActiveOption\(\)[\s\S]*commitTableStepDraft|selectActiveOption\(\)[\s\S]*onCreateChildTask/);
  assert.match(editorChildRowsSource, /value=\{tableStepDraftTaskTypeValues\[item\.id\] \?\? "task"\}/);
});

test("Task Type menu placement stays viewport-safe and flips above when needed", () => {
  assert.deepEqual(
    getTaskTypeSelectMenuPosition(
      { bottom: 120, left: 300, top: 92, width: 112 },
      { height: 800, width: 320 },
      { height: 140 },
      "compact",
    ),
    { left: 152, maxHeight: 140, top: 126, width: 160 },
  );
  assert.deepEqual(
    getTaskTypeSelectMenuPosition(
      { bottom: 470, left: 20, top: 440, width: 200 },
      { height: 500, width: 500 },
      { height: 120 },
      "compact",
    ),
    { left: 20, maxHeight: 120, top: 314, width: 200 },
  );
});

test("Task Type menu placement clamps its panel when neither side has the preferred height", () => {
  assert.deepEqual(
    getTaskTypeSelectMenuPosition(
      { bottom: 112, left: 20, top: 82, width: 180 },
      { height: 160, width: 320 },
      { height: 288 },
      "default",
    ),
    { left: 20, maxHeight: 68, top: 8, width: 180 },
  );
});

test("blocked hierarchy rows cannot open row child creation", () => {
  assert.match(editorChildRowsSource, /onCreateChildTask && !childTaskCreationBlockedTaskIds\.includes\(item\.id\)/);
  assert.match(tableSource, /if \(!onCreateChildTask \|\| childTaskCreationBlockedTaskIds\.includes\(parentTaskId\)\)/);
  assert.match(editorChildRowsSource, /Substep creation is blocked until the hierarchy issue is fixed\./);
});

test("deep descendants keep child creation enabled without a depth cutoff", () => {
  for (const depth of [3, 20]) {
    assert.deepEqual(getFullEditorChildSectionLabels(depth), { action: "Add Substep", heading: "Substeps" });
  }
  assert.match(fullEditorSource, /const showNestedStepsEditor = overlayMode === "full";/);
  assert.doesNotMatch(fullEditorSource, /showNestedStepsEditor = overlayMode === "full"[^\n]*selectedTaskParentInfo/);
  assert.doesNotMatch(fullEditorSource, /depth\s*[<>]=?\s*(?:2|3|4|5)/);
});

test("full editor child creation preserves the selected Task as the canonical parent", () => {
  assert.match(fullEditorSource, /onCreateChildTask=\{onCreateChildTask\}/);
  assert.match(fullEditorSource, /parentTaskId=\{selectedTask\.id\}/);
  const result = buildChildTaskCreationDraft({ parentTaskId: "depth-20-substep", title: "Another substep" });
  assert.equal(result.ok, true);
  assert.equal(result.draft?.parent_task_id, "depth-20-substep");
});

test("section-level parent creation remains Add Step while row creation is Add Substep", () => {
  assert.match(fullEditorSource, /childLabel=\{fullEditorChildSectionLabels\.action === "Add Step" \? "Step" : "Substep"\}/);
  assert.match(fullEditorSource, /parentTaskId=\{selectedTask\.id\}/);
  assert.match(editorChildRowsSource, /beginTableStepDraft\(item\.id, "Substep"\)/);
});

test("recursive child display and editor save remain wired", () => {
  assert.match(fullEditorSource, /renderEditorChildTaskRows\(selectedTask\.id, childTaskPreviewGroup\)/);
  assert.match(fullEditorSource, /<InlineSubtaskEditor/);
  assert.match(editorSaveSource, /replaceTaskSubtasks\(taskId, subtasks\)/);
  assert.match(editorSaveSource, /replaceTaskSubtasks\(data\.id, subtasks\)/);
  assert.match(subtaskActionsSource, /saveDrafts\(item\.children, result\.data\.id\)/);
});

test("Table and List child creation still use the shared callback", () => {
  assert.match(tableSource, /<TaskChildCreationComposer/);
  assert.match(listSource, /<TaskChildCreationComposer/);
  assert.match(tableSource, /onCreateChildTask=\{onCreateChildTask/);
  assert.match(listSource, /onCreateChildTask=\{onCreateChildTask/);
  assert.match(appSource, /const childTaskCreationBlockedTaskIds = taskHierarchyDiagnostics\.cycleTaskIds;/);
  assert.match(appSource, /buildChildTaskCreationDraft\([\s\S]*blockedParentTaskIds: childTaskCreationBlockedTaskIds/);
});

test("existing recursive preview rendering caps only visual indentation", () => {
  assert.match(tableSource, /const depthIndent = Math\.min\(Math\.max\(item\.depth - 1, 0\), 3\)/);
  assert.match(listSource, /const depthIndent = Math\.min\(Math\.max\(item\.depth - 1, 0\), 3\)/);
});
