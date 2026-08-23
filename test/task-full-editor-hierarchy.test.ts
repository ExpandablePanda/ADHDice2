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
const { getFullEditorChildSectionLabels } = await jiti.import<{ getFullEditorChildSectionLabels: (depth: number) => { action: string; heading: string } }>(
  "../src/components/ui/task-management-table-v2.tsx",
);

const tableSource = readFileSync("src/components/ui/task-management-table-v2.tsx", "utf8");
const appSource = readFileSync("src/components/task-app.tsx", "utf8");
const listSource = readFileSync("src/components/task-app/tasks-list-adapter.tsx", "utf8");
const subtaskActionsSource = readFileSync("src/hooks/useTaskSubtaskActions.ts", "utf8");
const editorSaveSource = readFileSync("src/hooks/useTaskEditorSaveAction.ts", "utf8");
const fullEditorStart = tableSource.indexOf("const childTaskPreviewGroup = overlayMode === \"full\"");
const fullEditorEnd = tableSource.indexOf("const shouldShowDetachedTaskNotice", fullEditorStart);
const fullEditorSource = tableSource.slice(fullEditorStart, fullEditorEnd);

assert.ok(fullEditorStart >= 0, "full editor child section should be discoverable");
assert.ok(fullEditorEnd > fullEditorStart, "full editor child section boundary should be discoverable");

test("root full editor uses Steps and Add Step", () => {
  assert.deepEqual(getFullEditorChildSectionLabels(0), { action: "Add Step", heading: "Steps" });
});

test("depth-1 Step full editor uses Substeps and Add Substep", () => {
  assert.deepEqual(getFullEditorChildSectionLabels(1), { action: "Add Substep", heading: "Substeps" });
});

test("depth-2 Substep full editor keeps the Substeps label", () => {
  assert.deepEqual(getFullEditorChildSectionLabels(2), { action: "Add Substep", heading: "Substeps" });
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

test("recursive child display and editor save remain wired", () => {
  assert.match(fullEditorSource, /renderEditorChildTaskRows\(selectedTask\.id, childTaskPreviewGroup\)/);
  assert.match(fullEditorSource, /<InlineSubtaskEditor/);
  assert.match(editorSaveSource, /replaceTaskSubtasks\(taskId, subtasks\)/);
  assert.match(editorSaveSource, /replaceTaskSubtasks\(data\.id, subtasks\)/);
  assert.match(subtaskActionsSource, /saveDrafts\(item\.children, result\.data\.id\)/);
});

test("Table and List child creation still use the shared callback", () => {
  assert.match(tableSource, /onCreateChildTask\(parentTaskId, nextTitle\)/);
  assert.match(listSource, /onCreateChildTask\?\.\(parentTaskId, title\)/);
  assert.match(appSource, /const childTaskCreationBlockedTaskIds = taskHierarchyDiagnostics\.cycleTaskIds;/);
  assert.match(appSource, /buildChildTaskCreationDraft\([\s\S]*blockedParentTaskIds: childTaskCreationBlockedTaskIds/);
});

test("existing recursive preview rendering caps only visual indentation", () => {
  assert.match(tableSource, /const depthIndent = Math\.min\(Math\.max\(item\.depth - 1, 0\), 3\)/);
  assert.match(listSource, /const depthIndent = Math\.min\(Math\.max\(item\.depth - 1, 0\), 3\)/);
});
