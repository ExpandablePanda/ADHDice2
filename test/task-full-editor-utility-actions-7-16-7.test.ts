import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
const fullEditorStart = tableSource.indexOf("const fullDesktopEditorContent = (");
const fullEditorEnd = tableSource.indexOf("const fullDesktopEditorNode", fullEditorStart);
const fullEditorSource = tableSource.slice(fullEditorStart, fullEditorEnd);
const titleRowStart = fullEditorSource.indexOf('<div className="mt-2 flex items-center gap-2">');
const titleRowEnd = fullEditorSource.indexOf("{detachedTaskNotice", titleRowStart);
const titleRowSource = fullEditorSource.slice(titleRowStart, titleRowEnd);

assert.ok(fullEditorStart >= 0, "shared full editor content should be discoverable");
assert.ok(fullEditorEnd > fullEditorStart, "shared full editor boundary should be discoverable");
assert.ok(titleRowStart >= 0, "shared full editor title row should be discoverable");
assert.ok(titleRowEnd > titleRowStart, "shared full editor title row boundary should be discoverable");

test("shared full Edit Task title row exposes History beside the flexible title input", () => {
  const inputIndex = titleRowSource.indexOf("<TaskTitleDraftInput");
  const historyIndex = titleRowSource.indexOf('aria-label="Open task history"');

  assert.ok(inputIndex >= 0);
  assert.ok(historyIndex > inputIndex);
  assert.match(titleRowSource, /<AdhdIconButton[\s\S]*aria-label="Open task history"[\s\S]*<CalendarDays aria-hidden="true" \/>/);
  assert.match(titleRowSource, /onOpenTaskHistory\?\.\(selectedTask\.id\)/);
  assert.match(titleRowSource, /<label className="block min-w-0 flex-1">/);
});

test("full Edit Task History and Trash actions preserve the exact selected entity ID", () => {
  assert.match(titleRowSource, /onOpenTaskHistory\?\.\(selectedTask\.id\)/);
  assert.match(titleRowSource, /onOpenDeleteTask\?\.\(selectedTask\.id\)/);
  assert.doesNotMatch(titleRowSource, /onOpenDeleteTask\?\.\(selectedTaskParentInfo/);
  assert.doesNotMatch(titleRowSource, /setTaskDisplayStatus\([^)]*trashed/);
  assert.match(tableSource, /onOpenTaskHistory\(item\.id\)/);
  assert.match(tableSource, /onOpenDeleteTask\?\.\(item\.id\)/);
});

test("full Edit Task more-actions menu preserves active and trashed wording and closes before Trash handoff", () => {
  assert.match(titleRowSource, /aria-label="More task actions"/);
  assert.match(titleRowSource, /aria-haspopup="menu"/);
  assert.match(titleRowSource, /<AdhdDropdownPanel[\s\S]*role="menu"/);
  assert.match(tableSource, /const editorDeleteActionLabel = selectedTask\.status === "trashed" \? "Delete permanently" : "Move to trash"/);
  assert.match(titleRowSource, /setOpenEditorUtilityMenuTaskId\(null\);\s*onOpenDeleteTask\?\.\(selectedTask\.id\)/);
  assert.match(titleRowSource, /role="menuitem"/);
});

test("full Edit Task utility menu dismisses on outside click, Escape, close, and entity navigation", () => {
  assert.match(tableSource, /const editorUtilityMenuRef = useRef<HTMLDivElement \| null>\(null\)/);
  assert.match(tableSource, /!editorUtilityMenuRef\.current\?\.contains\(target\)[\s\S]*setOpenEditorUtilityMenuTaskId\(null\)/);
  assert.match(tableSource, /if \(openEditorUtilityMenuTaskId\) \{\s*setOpenEditorUtilityMenuTaskId\(null\);\s*return;/);
  const closeSource = tableSource.slice(tableSource.indexOf("function closeInspector"), tableSource.indexOf("function shouldSkipRecentInlineCommit"));
  const navigationSource = tableSource.slice(tableSource.indexOf("function navigateEditorTask"), tableSource.indexOf("function getEditorNavigationNeighborId"));
  assert.match(closeSource, /setOpenEditorUtilityMenuTaskId\(null\)/);
  assert.match(navigationSource, /setOpenEditorUtilityMenuTaskId\(null\)/);
});

test("desktop and mobile full editors reuse the same utility title row while row actions remain wired", () => {
  assert.match(tableSource, /const fullDesktopEditorNode[\s\S]*\{fullDesktopEditorContent\}/);
  assert.match(tableSource, /\) : useMobileFullOverlay \? \([\s\S]*\{fullDesktopEditorContent\}/);
  assert.match(tableSource, /onOpenTaskHistory\(task\.id\)/);
  assert.match(tableSource, /onOpenDeleteTask\(task\.id\)/);
  assert.match(tableSource, /onOpenTaskHistory\(rowContextMenuTask\.id\)/);
  assert.match(tableSource, /onOpenDeleteTask\(rowContextMenuTask\.id\)/);
  assert.match(listSource, /tableProps\.onOpenTaskHistory\?\.\(task\.id\)/);
  assert.match(listSource, /onOpenDeleteTask=\{tableProps\.onOpenDeleteTask\}/);
});
