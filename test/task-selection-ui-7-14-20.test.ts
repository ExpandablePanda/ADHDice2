import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const primitivesSource = readFileSync(new URL("../src/components/ui/task-table-primitives.tsx", import.meta.url), "utf8");
const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
const folderSource = readFileSync(new URL("../src/lib/task-content-folders.ts", import.meta.url), "utf8");

test("selected Task surface is one shared purple authority", () => {
  assert.match(primitivesSource, /TASK_TABLE_SELECTED_TASK_SURFACE_CLASS = .*!border-\[#9a84ff\].*!bg-\[#f3eeff\].*ring-2/);
  assert.match(primitivesSource, /dark:!border-\[#9c88ff\].*dark:!bg-\[#2a2148\]/);
});

test("selected Task surface has a stronger purple edge", () => {
  assert.match(primitivesSource, /TASK_TABLE_SELECTED_TASK_SURFACE_CLASS = .*ring-\[#6f57f6\]\/45/);
});

test("Table parent rows consume the shared selected surface", () => {
  assert.match(tableSource, /\$\{taskSurface\}[\s\S]*selectedTaskIdSet\.has\(task\.id\)[\s\S]*TASK_TABLE_SELECTED_TASK_SURFACE_CLASS/);
  assert.match(tableSource, /data-task-table-parent-grid=\{task\.id\}/);
});

test("List Task cards consume the same selected surface", () => {
  assert.match(listSource, /\$\{taskSurface\}[\s\S]*selectedTaskIdSet\.has\(task\.id\)[\s\S]*TASK_TABLE_SELECTED_TASK_SURFACE_CLASS/);
  assert.match(listSource, /data-task-list-row=\{task\.id\}/);
});

test("selected surface overrides Task Type surface branches", () => {
  assert.doesNotMatch(tableSource, /selectedTaskIdSet\.has\(task\.id\)\s*\?\s*taskTypeOption\.accentKey ===/);
  assert.doesNotMatch(listSource, /selectedTaskIdSet\.has\(task\.id\)[\s\S]{0,180}ring-2 ring-\[#6f57f6\]\/35/);
});

test("selection toolbar is a shared component", () => {
  assert.match(primitivesSource, /export function TaskSelectionToolbar/);
  assert.match(tableSource, /<TaskSelectionToolbar/);
  assert.match(listSource, /<TaskSelectionToolbar/);
});

test("selection toolbar actions use the shared chip button", () => {
  const toolbarStart = primitivesSource.indexOf("export function TaskSelectionToolbar");
  const toolbarSource = primitivesSource.slice(toolbarStart);
  assert.match(toolbarSource, /<TaskTableChipButton[\s\S]*Select all visible/);
  assert.match(toolbarSource, /<TaskTableChipButton[\s\S]*Clear selection/);
  assert.match(toolbarSource, /<TaskTableChipButton[\s\S]*Edit selected/);
  assert.match(toolbarSource, /<TaskTableChipButton[\s\S]*Delete selected/);
});

test("selected count uses the compact chip geometry", () => {
  const toolbarStart = primitivesSource.indexOf("export function TaskSelectionToolbar");
  const toolbarSource = primitivesSource.slice(toolbarStart);
  assert.match(toolbarSource, /TASK_TABLE_CHIP_BASE_CLASS[\s\S]*TASK_TABLE_ACTIVE_LIST_CHIP_CLASS/);
});

test("selected count is sentence case", () => {
  assert.match(primitivesSource, /\{selectedCount\} selected/);
});

test("selected count avoids legacy all-caps badge typography", () => {
  const toolbarStart = primitivesSource.indexOf("export function TaskSelectionToolbar");
  const toolbarSource = primitivesSource.slice(toolbarStart);
  assert.doesNotMatch(toolbarSource, /font-black|uppercase|tracking-\[0\.18em\]/);
});

test("Table renders the shared toolbar with its sticky placement", () => {
  assert.match(tableSource, /<TaskSelectionToolbar[\s\S]*selectedCount=\{selectedTaskIds\.length\}[\s\S]*sticky/);
});

test("List renders the shared toolbar for the visible result surface", () => {
  assert.match(listSource, /<TaskSelectionToolbar[\s\S]*selectedCount=\{selectedTaskIds\.length\}/);
  assert.match(listSource, /onSelectAllVisible=\{tableProps\.onSelectAllVisible/);
});

test("long press uses the shared 500ms and 9px constants", () => {
  assert.match(primitivesSource, /TASK_ROW_LONG_PRESS_MS = 500/);
  assert.match(primitivesSource, /TASK_ROW_LONG_PRESS_MOVE_THRESHOLD_PX = 9/);
  assert.match(primitivesSource, /window\.setTimeout\([\s\S]*TASK_ROW_LONG_PRESS_MS/);
});

test("long press owns the complete pointer lifecycle", () => {
  assert.match(primitivesSource, /setPointerCapture\(event\.pointerId\)/);
  assert.match(primitivesSource, /onPointerMove:/);
  assert.match(primitivesSource, /onPointerUp:/);
  assert.match(primitivesSource, /onPointerCancel:/);
  assert.match(primitivesSource, /onLostPointerCapture:/);
});

test("pointer movement cancels a pending long press", () => {
  assert.match(primitivesSource, /Math\.hypot\(event\.clientX - session\.startX, event\.clientY - session\.startY\) > TASK_ROW_LONG_PRESS_MOVE_THRESHOLD_PX/);
  assert.match(primitivesSource, /cancelLongPress\(event\.pointerId\)/);
});

test("successful long press suppresses follow-up click and context menu", () => {
  assert.match(primitivesSource, /suppressClickRef\.current = true/);
  assert.match(primitivesSource, /suppressContextMenuRef\.current = true/);
  assert.match(primitivesSource, /onClickCapture:[\s\S]*event\.preventDefault\(\)[\s\S]*event\.stopPropagation\(\)/);
  assert.match(primitivesSource, /onContextMenuCapture:[\s\S]*event\.preventDefault\(\)[\s\S]*event\.stopPropagation\(\)/);
});

test("long press ignores interactive child targets in both views", () => {
  assert.match(tableSource, /isInteractiveTarget: \(target\) => isTaskTableChildRowInteractiveTarget/);
  assert.match(listSource, /isInteractiveTarget: shouldIgnoreListOverlayOpen/);
});

test("List active selection mode toggles instead of opening the editor", () => {
  assert.match(listSource, /const selectedTaskIds = tableProps\.selectedTaskIds \?\? \[\]/);
  assert.match(listSource, /selectedTaskIds\.length > 0 && tableProps\.onToggleTaskSelection[\s\S]*tableProps\.onToggleTaskSelection\(task\.id, \{[\s\S]*additive: true[\s\S]*visibleTaskIds/);
  assert.match(listSource, /tableProps\.onOpenTaskEditor\?\.\(task\.id, visibleTaskIds\)/);
});

test("existing Table selection inputs remain wired", () => {
  assert.match(tableSource, /onDoubleClick=\{\(event\) => \{[\s\S]*startTaskSelection\(task\.id, \{ additive: true \}\)/);
  assert.match(tableSource, /onContextMenu=\{\(event\) => \{[\s\S]*openRowContextMenu\(task\.id/);
});

test("Task Content Folder projection remains independent of selection presentation", () => {
  assert.match(tableSource, /taskContentFolderPresentation/);
  assert.match(listSource, /taskContentFolderPresentation/);
  assert.match(folderSource, /buildTaskContentFolderPresentation/);
  assert.doesNotMatch(folderSource, /selectedTask|longPress|toolbar/);
});
