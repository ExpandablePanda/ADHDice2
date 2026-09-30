import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const primitivesSource = readFileSync(new URL("../src/components/ui/task-table-primitives.tsx", import.meta.url), "utf8");
const selectionHookSource = readFileSync(new URL("../src/hooks/useTaskListSelection.ts", import.meta.url), "utf8");
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

test("parent Task long press still enters shared selection", () => {
  assert.match(tableSource, /const taskRowLongPressHandlers = useTaskRowLongPress\([\s\S]*dataset\.taskTableRow[\s\S]*startTaskSelection\(taskId, \{ additive: true \}\)/);
  assert.match(listSource, /const taskRowLongPressHandlers = useTaskRowLongPress\([\s\S]*dataset\.taskListRow[\s\S]*onToggleTaskSelection\?\.\(taskId, \{[\s\S]*additive: true/);
});

test("canonical selection validity remains owned by the Task universe", () => {
  assert.match(selectionHookSource, /new Set\(tasks\.map\(\(task\) => task\.id\)\)/);
  assert.match(selectionHookSource, /selectedListTaskIds\.filter\(\(taskId\) => validTaskIds\.has\(taskId\)\)/);
});

test("explicit Select All Visible IDs are accepted by the shared selection hook", () => {
  assert.match(selectionHookSource, /function selectAllVisibleListTasks\(taskIds: string\[\] = visibleListTaskIds\)/);
  assert.match(selectionHookSource, /selectedListTaskIds: taskIds\.filter\(\(taskId\) => validTaskIds\.has\(taskId\)\)/);
});

test("Table visible selection uses the hierarchical rendered preview sequence", () => {
  assert.match(tableSource, /const visibleTaskIds = useMemo\([\s\S]*groupChildTaskPreviewItemsByStoredCompletion\([\s\S]*renderedItems\.map\(\(item\) => item\.id\)/);
  assert.match(tableSource, /flattenPrototypeSubtasksForMiniRows\(visibleSubtasks\)\.map\(\(row\) => row\.subtask\.id\)/);
});

test("Table collapsed descendants are excluded from its visible selection sequence", () => {
  assert.match(tableSource, /buildChildTaskPreviewVisibility\([\s\S]*collapsedChildTaskIdSet/);
  assert.match(tableSource, /expandedCompletedStepsByTaskId\[task\.id\]/);
});

test("Table Select All Visible passes hierarchical IDs from the toolbar", () => {
  assert.match(tableSource, /onSelectAllVisible=\{onSelectAllVisible \? \(\) => onSelectAllVisible\(visibleTaskIds\) : undefined\}/);
});

test("Table context-menu Select All Visible uses the same hierarchical IDs", () => {
  assert.match(tableSource, /onSelectAllVisible=\{onSelectAllVisible \? \(\) => \{[\s\S]*onSelectAllVisible\(visibleTaskIds\)/);
});

test("List selection reads ordered IDs from rendered parent and child rows", () => {
  assert.match(listSource, /querySelectorAll<HTMLElement>\("\[data-task-list-row\], \[data-same-table-step-row\]"\)/);
  assert.match(listSource, /seenTaskIds\.has\(taskId\)/);
});

test("List Select All Visible passes the rendered hierarchical sequence", () => {
  assert.match(listSource, /onSelectAllVisible=\{tableProps\.onSelectAllVisible \? \(\) => tableProps\.onSelectAllVisible\?\.\(getRenderedListTaskIds\(\)\)/);
});

test("Table child long press selects the exact rendered child ID", () => {
  assert.match(tableSource, /const childTaskRowLongPressHandlers = useTaskRowLongPress\(/);
  assert.match(tableSource, /const taskId = target\.dataset\.sameTableStepRow/);
  assert.match(tableSource, /data-same-table-step-row=\{item\.id\}[\s\S]*\.\.\.childTaskRowLongPressHandlers/);
});

test("List child long press selects the exact rendered child ID", () => {
  assert.match(listSource, /const childTaskRowLongPressHandlers = useTaskRowLongPress\(/);
  assert.match(listSource, /const taskId = target\.dataset\.sameTableStepRow/);
  assert.match(listSource, /data-same-table-step-row=\{item\.id\}[\s\S]*\.\.\.childTaskRowLongPressHandlers/);
});

test("child long press reuses interactive-target cancellation", () => {
  assert.match(tableSource, /childTaskRowLongPressHandlers = useTaskRowLongPress\([\s\S]*isTaskTableChildRowInteractiveTarget/);
  assert.match(listSource, /childTaskRowLongPressHandlers = useTaskRowLongPress\([\s\S]*isInteractiveTarget: shouldIgnoreListOverlayOpen/);
});

test("selected child rows use the shared selected surface in Table and List", () => {
  assert.match(tableSource, /selectedTaskIdSet\.has\(item\.id\) \? TASK_TABLE_SELECTED_TASK_SURFACE_CLASS/);
  assert.match(tableSource, /selectedTaskIdSet\.has\(row\.subtask\.id\) \? TASK_TABLE_SELECTED_TASK_SURFACE_CLASS/);
  assert.match(listSource, /selectedTaskIdSet\.has\(item\.id\) \? TASK_TABLE_SELECTED_TASK_SURFACE_CLASS/);
});

test("selection count uses the unified canonical selection length", () => {
  assert.match(tableSource, /selectedCount=\{selectedTaskIds\.length\}/);
  assert.match(listSource, /selectedCount=\{selectedTaskIds\.length\}/);
});

test("active List child clicks toggle selection instead of opening", () => {
  assert.match(listSource, /const toggleChildTaskSelection = \(taskId: string, range = false\)[\s\S]*onToggleTaskSelection\(taskId, \{[\s\S]*additive: true[\s\S]*visibleTaskIds/);
  assert.match(listSource, /toggleChildTaskSelection\(item\.id, event\.shiftKey\)/);
});

test("Table child title clicks prioritize active selection over rename", () => {
  assert.match(tableSource, /function toggleChildTaskSelection\(taskId: string, range = false\)[\s\S]*startTaskSelection\(taskId, \{ additive: true, range \}\)/);
  assert.match(tableSource, /data-step-title-edit=\{item\.id\}[\s\S]*toggleChildTaskSelection\(item\.id, event\.shiftKey\)[\s\S]*setEditingTaskTitleId\(item\.id\)/);
  assert.match(tableSource, /pendingEditorChildTitleRenameRef\.current = \{ taskId: item\.id, title: item\.title \}/);
});

test("List child title clicks prioritize active selection over rename", () => {
  assert.match(listSource, /data-step-title-edit=\{item\.id\}[\s\S]*toggleChildTaskSelection\(item\.id, event\.shiftKey\)[\s\S]*setEditingStepTitleId\(item\.id\)/);
  assert.match(listSource, /if \(toggleChildTaskSelection\(item\.id, event\.shiftKey\)\) \{[\s\S]*return;\n\s+\}/);
});

test("child selection toggles selected IDs and preserves shared range semantics", () => {
  assert.match(selectionHookSource, /else if \(baseSelectedTaskIds\.includes\(taskId\)\)[\s\S]*filter\(\(currentTaskId\) => currentTaskId !== taskId\)/);
  assert.match(tableSource, /toggleChildTaskSelection\(item\.id, event\.shiftKey\)/);
  assert.match(listSource, /toggleChildTaskSelection\(item\.id, event\.shiftKey\)/);
});

test("Andrew QA sequence adds Step then Substep without another long press", () => {
  assert.match(tableSource, /childTaskRowLongPressHandlers[\s\S]*toggleChildTaskSelection\(item\.id, event\.shiftKey\)/);
  assert.match(listSource, /childTaskRowLongPressHandlers[\s\S]*toggleChildTaskSelection\(item\.id, event\.shiftKey\)/);
  assert.match(selectionHookSource, /baseSelectedTaskIds\.includes\(taskId\)/);
});

test("child action controls remain outside title selection handling", () => {
  assert.match(tableSource, /aria-label=\{`Change status for[\s\S]*event\.stopPropagation\(\);[\s\S]*setActiveMetadataPanelByTaskId/);
  assert.match(tableSource, /aria-label=\{`\$\{isCollapsed \? "Expand" : "Collapse"\}[\s\S]*setCollapsedChildTaskIds/);
  assert.match(listSource, /data-step-title-edit=\{item\.id\}[\s\S]*TaskTitleDraftInput/);
});

test("hierarchical range selection uses the same visible sequence", () => {
  assert.match(tableSource, /toggleChildTaskSelection\(item\.id, event\.shiftKey\)/);
  assert.match(listSource, /visibleTaskIds: getRenderedListTaskIds\(\)/);
  assert.match(selectionHookSource, /const rangeIds = visibleTaskIds\.slice\(from, to \+ 1\)/);
});

test("selected children remain valid independently of later visibility changes", () => {
  assert.match(selectionHookSource, /selectedListTaskIds = useMemo\(\s*\(\) => \(isSelectionStale \? \[\] : selectionState\.selectedListTaskIds\.filter\(\(taskId\) => validTaskIds\.has\(taskId\)\)/);
  assert.doesNotMatch(selectionHookSource, /selectedListTaskIds = useMemo\([\s\S]{0,260}visibleListTaskIds/);
});

test("batch targets use known canonical rows instead of visible-row filtering", () => {
  assert.match(tableSource, /function getKnownTaskIds\(\)[\s\S]*childTaskPreviewByParentTaskId/);
  assert.match(tableSource, /function getValidSelectedTaskIds\(\)[\s\S]*selectedTaskIds\.filter\(\(taskId\) => knownTaskIds\.has\(taskId\)\)/);
  assert.doesNotMatch(tableSource, /const visibleSelectedTaskIds = selectedTaskIds\.filter/);
});

test("Priority, Due, and Tags edits use resolved batch targets", () => {
  assert.match(tableSource, /function setTaskPriorities\(taskId: string, priorities: TaskPriority\[\]\)[\s\S]*resolveTableMetadataTargetTaskIds\(taskId\)/);
  assert.match(tableSource, /function setTaskDue\(taskId: string, dueOn: string, dueTime: string\)[\s\S]*resolveTableMetadataTargetTaskIds\(taskId\)/);
  assert.match(tableSource, /function setTaskTags\(taskId: string, tags: string\[\]\)[\s\S]*resolveTableMetadataTargetTaskIds\(taskId\)/);
});

test("Status and Repeat edits use action targets and per-Task authorities", () => {
  assert.match(tableSource, /function setTaskStatus\(taskId: string, status: TaskStatus\)[\s\S]*resolveTableActionTargetTaskIds\(taskId\)[\s\S]*onTaskStatusChange\?\./);
  assert.match(tableSource, /function setTaskRepeat\([\s\S]*resolveTableActionTargetTaskIds\(taskId\)[\s\S]*onTaskRepeatChange\?\./);
});

test("stale selected IDs are excluded before mutation callbacks", () => {
  assert.match(tableSource, /getQuickEditTargetTaskIds\(taskId: string\)[\s\S]*knownTaskIds\.has\(candidateId\)/);
  assert.match(tableSource, /getValidSelectedTaskIds\(\)[\s\S]*knownTaskIds\.has\(taskId\)/);
});

test("single-target boundaries remain outside the batch-capable mode list", () => {
  assert.match(tableSource, /const BATCH_QUICK_EDIT_MODES: OverlayMode\[\] = \["due", "energy", "estimated", "lists", "priority", "repeat", "status", "tags"\]/);
  assert.match(tableSource, /function commitTaskNotes\(taskId: string/);
  assert.match(tableSource, /function startTaskTimer\(taskId: string/);
  assert.match(tableSource, /function openTaskInCurrentEditor\(taskId: string/);
});

test("child selection does not introduce synthetic hierarchy IDs", () => {
  assert.doesNotMatch(tableSource, /parentTaskId.*sameTableStepRow|sameTableStepRow.*parentTaskId/);
  assert.doesNotMatch(listSource, /parentTaskId.*sameTableStepRow|sameTableStepRow.*parentTaskId/);
  assert.match(tableSource, /target\.dataset\.sameTableStepRow/);
  assert.match(listSource, /target\.dataset\.sameTableStepRow/);
});

test("Task Content Folder projection remains independent of selection presentation", () => {
  assert.match(tableSource, /taskContentFolderPresentation/);
  assert.match(listSource, /taskContentFolderPresentation/);
  assert.match(folderSource, /buildTaskContentFolderPresentation/);
  assert.doesNotMatch(folderSource, /selectedTask|longPress|toolbar/);
});
