import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isTaskTypeIconKey, searchTaskTypeIcons } from "../src/lib/task-type-presentation.ts";

const headerSource = readFileSync(new URL("../src/components/task-app/task-content-folder-editable-header.tsx", import.meta.url), "utf8");
const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const actionSource = readFileSync(new URL("../src/hooks/useTaskContentFolderActions.ts", import.meta.url), "utf8");
const typesSource = readFileSync(new URL("../src/lib/database.types.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const patchSource = readFileSync(new URL("../supabase/patch_task_content_folder_icons_7_14_23.sql", import.meta.url), "utf8");

test("Folder title editing has the required commit, cancel, and duplicate-submit guards", () => {
  assert.match(headerSource, /onBlur=\{\(\) =>/);
  assert.match(headerSource, /event\.key === "Enter"/);
  assert.match(headerSource, /event\.key === "Escape"/);
  assert.match(headerSource, /submittingRenameRef/);
  assert.match(headerSource, /onRename\(folder\.id, draftName\)/);
  assert.match(headerSource, /onSurfaceChange\(null\)/);
  assert.match(headerSource, /autoFocus/);
  assert.match(headerSource, /w-\[20rem\]/);
  assert.match(headerSource, /max-w-\[min\(20rem,calc\(100vw-10rem\)\)\]/);
  assert.doesNotMatch(headerSource, /TASK_TABLE_INLINE_RENAME_EDITOR_CLASS[^\n]*flex-1/);
});

test("Folder quick actions remain bulk member actions and preserve neutral row collapse", () => {
  assert.match(headerSource, /onToggleMemberPinned/);
  assert.match(headerSource, /onToggleMemberRoutine/);
  assert.match(headerSource, /onAddTaskToFolder/);
  assert.match(headerSource, /data-folder-action-control/);
  assert.match(headerSource, /aria-label=\{`Add Task to \$\{folder\.name\}`\}/);
  assert.match(headerSource, /summary\.allPinned\s*\?\s*summary\.pinnedTaskIds/);
  assert.match(headerSource, /getTaskContentFolderRoutineToggleTaskIds\(summary\)/);
  assert.match(headerSource, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(tableSource, /onAddTaskToContentFolder/);
  assert.match(listSource, /onAddTaskToContentFolder/);
  assert.match(appSource, /const addTaskToContentFolder = useCallback/);
  assert.match(appSource, /resolveTaskTypeSelection\(taskTypeSelectionValue, customBehaviorRulesets\)/);
  assert.match(appSource, /custom_ruleset_id: selection\.customRulesetId/);
  assert.match(appSource, /task_type: selection\.taskType/);
  assert.match(appSource, /addTask\(\{[\s\S]*buildNewTaskDraft\(title\)/);
  assert.match(appSource, /taskContentFolderActions\.moveTaskToFolder\(createdTask, folderId\)/);
});

test("Folder Add Task is compact, typed, shared by Table/List, and resets its local selection", () => {
  assert.match(headerSource, /taskTypeSelectionValue/);
  assert.match(headerSource, /buildTaskTypeSelectionOptions\(customBehaviorRulesets\)/);
  assert.match(headerSource, /<TaskTypeSelect[\s\S]*options=\{taskTypeOptions\}[\s\S]*size="compact"/);
  assert.match(headerSource, /w-\[24rem\] max-w-\[min\(24rem,calc\(100vw-5rem\)\)\]/);
  assert.match(headerSource, /onAddTaskToFolder\(folder\.id, title, taskTypeSelectionValue\)/);
  assert.match(headerSource, /setTaskTypeSelectionValue\("task"\)/);
  assert.match(headerSource, /event\.key === "Escape"/);
  assert.match(tableSource, /customBehaviorRulesets=\{customBehaviorRulesets\}/);
  assert.match(listSource, /customBehaviorRulesets=\{tableProps\.customBehaviorRulesets\}/);
  assert.match(tableSource, /onAddTaskToContentFolder\?: \(folderId: string, title: string, taskTypeSelectionValue: string\)/);
  assert.match(listSource, /onAddTaskToContentFolder\?: \(folderId: string, title: string, taskTypeSelectionValue: string\)/);
});

test("Folder title, actions, and count use left-aligned content sizing", () => {
  assert.match(headerSource, /className="flex min-w-0 w-full flex-wrap items-center gap-2"/);
  assert.match(headerSource, /className="flex min-w-0 max-w-\[22rem\] flex-none items-center gap-2"/);
  assert.doesNotMatch(headerSource, /className="flex min-w-0 flex-1 items-center gap-2"/);
  assert.ok(headerSource.indexOf('data-style-role="tasks.content-folder.title"') < headerSource.indexOf('data-folder-action-control'));
  assert.ok(headerSource.indexOf('data-folder-action-control') < headerSource.indexOf('data-style-role="tasks.content-folder.count"'));
  assert.match(headerSource, /w-\[20rem\] max-w-\[min\(20rem,calc\(100vw-10rem\)\)\]/);
  assert.match(headerSource, /className="relative flex w-full flex-col/);
});

test("Table and List use one shared Folder header with separate icon, title, and collapse paths", () => {
  for (const source of [tableSource, listSource]) {
    assert.match(source, /<TaskContentFolderEditableHeader/);
    assert.match(source, /onToggle=\{\(\) =>/);
    assert.match(source, /onRename=/);
    assert.match(source, /onUpdateIcon=/);
    assert.match(source, /openContentFolderContextMenu\(entry\.folder\.id/);
  }
  assert.match(headerSource, /aria-label=\{`Change icon for \$\{folder\.name\}`\}/);
  assert.match(headerSource, /data-style-role="tasks\.content-folder\.icon-chooser"/);
  assert.match(headerSource, /data-style-part="icon"/);
  assert.match(headerSource, /data-style-part="title"/);
});

test("Folder icon selection reuses the existing searchable catalog and validates persistence", () => {
  assert.equal(isTaskTypeIconKey("folder"), true);
  assert.equal(isTaskTypeIconKey("not-a-real-icon"), false);
  assert.ok(searchTaskTypeIcons("music").some((option) => option.key === "guitar"));
  assert.match(headerSource, /searchTaskTypeIcons\(iconQuery\)/);
  assert.match(headerSource, /isTaskTypeIconKey\(iconKey\)/);
  assert.match(actionSource, /\.update\(\{ icon_key: iconKey \}\)/);
  assert.match(actionSource, /isTaskTypeIconKey\(iconKey\)/);
  assert.match(headerSource, /currentIconKey = isTaskTypeIconKey\(folder\.icon_key\) \? folder\.icon_key : "folder"/);
});

test("Folder icon schema is additive, non-null, defaulted, and keeps existing ownership policy surfaces", () => {
  assert.match(schemaSource, /icon_key text not null default 'folder'/);
  assert.match(patchSource, /add column if not exists icon_key text not null default 'folder'/i);
  assert.match(patchSource, /alter column icon_key set default 'folder'/i);
  assert.match(patchSource, /alter column icon_key set not null/i);
  assert.doesNotMatch(patchSource, /drop table|create table/i);
  assert.match(typesSource, /export type TaskContentFolder = \{[\s\S]*icon_key: string;/);
  assert.match(typesSource, /TaskContentFolderUpdate = Partial<Pick<TaskContentFolder, "icon_key" \| "name">>/);
  assert.match(actionSource, /\.eq\("user_id", userId\)/);
});

test("Context-menu and editor coordination closes competing Folder surfaces", () => {
  assert.match(headerSource, /onContextMenu=\{\(event\) => \{/);
  assert.match(headerSource, /onSurfaceChange\(null\);\n\s+onContextMenu\(event\)/);
  assert.match(tableSource, /setActiveTaskContentFolderEdit\(null\);\n\s+setContentFolderContextMenu/);
  assert.match(listSource, /setActiveTaskContentFolderEdit\(null\);\n\s+setContentFolderContextMenu/);
});
