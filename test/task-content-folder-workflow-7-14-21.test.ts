import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { resolveTaskContentFolderMoveTaskIds, taskNeedsContentFolderMove } from "../src/lib/task-content-folders.ts";

const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
const folderHeaderSource = readFileSync(new URL("../src/components/task-app/task-content-folder-editable-header.tsx", import.meta.url), "utf8");
const folderActionsSource = readFileSync(new URL("../src/hooks/useTaskContentFolderActions.ts", import.meta.url), "utf8");
const taskMenuSource = tableSource;
const folderMenuSource = readFileSync(new URL("../src/components/task-app/task-content-folder-context-menu.tsx", import.meta.url), "utf8");
const tasksPageSource = readFileSync(new URL("../src/components/task-app/tasks-page.tsx", import.meta.url), "utf8");

test("the global Folder manager is removed from the Tasks header", () => {
  assert.equal(existsSync(new URL("../src/components/task-app/task-content-folders-manager.tsx", import.meta.url)), false);
  assert.doesNotMatch(appSource, /TaskContentFoldersManager|taskContentFoldersNode/);
  assert.doesNotMatch(tasksPageSource, /taskContentFoldersNode/);
});

test("Task context actions expose Create Folder and preserve Move to Folder", () => {
  assert.match(taskMenuSource, /<span>Create Folder<\/span>/);
  assert.match(taskMenuSource, /<span>Move to Folder<\/span>/);
  assert.match(taskMenuSource, /onCreateTaskContentFolder/);
  assert.match(taskMenuSource, /onMoveToTaskContentFolder=\{onMoveTaskToContentFolder/);
  assert.match(taskMenuSource, /getTaskContentFolderMoveOptions/);
  assert.match(taskMenuSource, /type="submit"/);
});

test("Table and List retain the exact Task to Folder callback wiring", () => {
  assert.match(appSource, /onMoveTaskToContentFolder: moveTaskToContentFolder/);
  assert.doesNotMatch(appSource, new RegExp(["onMoveTask", "ContentFolder"].join("")));
  assert.match(tableSource, /onMoveTaskToContentFolder\?:/);
  assert.match(tableSource, /onMoveToTaskContentFolder=\{onMoveTaskToContentFolder/);
  assert.match(tableSource, /onMoveTasksToContentFolder\?:/);
  assert.match(tableSource, /selectedTaskIds=\{selectedTaskIds\}/);
  assert.match(listSource, /onMoveTaskToContentFolder\?:/);
  assert.match(listSource, /onMoveToTaskContentFolder=\{tableProps\.onMoveTaskToContentFolder/);
  assert.match(listSource, /onMoveTasksToContentFolder\?:/);
  assert.match(listSource, /selectedTaskIds=\{selectedTaskIds\}/);
  assert.match(appSource, /onMoveTasksToContentFolder: moveTasksToContentFolder/);
});

test("Folder context targeting expands only an in-selection context Task and removes duplicate IDs", () => {
  assert.deepEqual(resolveTaskContentFolderMoveTaskIds("B", ["A", "B", "C"]), ["A", "B", "C"]);
  assert.deepEqual(resolveTaskContentFolderMoveTaskIds("D", ["A", "B", "C"]), ["D"]);
  assert.deepEqual(resolveTaskContentFolderMoveTaskIds("B", ["A", "B", "B", "C"]), ["A", "B", "C"]);
  assert.match(tableSource, /resolveTaskContentFolderMoveTaskIds\(task\.id, selectedTaskIds\)/);
  assert.match(appSource, /for \(const task of tasksToMove\)/);
  assert.match(appSource, /failedCount/);
});

test("Batch Folder moves persist only Tasks that need a hierarchy change", () => {
  const selectedTasks = [
    { id: "A", parent_task_id: null, task_content_folder_id: "folder-x" },
    { id: "B", parent_task_id: null, task_content_folder_id: "folder-x" },
    { id: "C", parent_task_id: null, task_content_folder_id: "folder-x" },
    { id: "D", parent_task_id: null, task_content_folder_id: "folder-y" },
    { id: "E", parent_task_id: null, task_content_folder_id: null },
  ];
  assert.deepEqual(
    selectedTasks.filter((task) => taskNeedsContentFolderMove(task, "folder-x")).map((task) => task.id),
    ["D", "E"],
  );
  assert.match(appSource, /const tasksToMove = targetTasks\.filter\(\(task\) => taskNeedsContentFolderMove\(task, folderId\)\);/);
  assert.match(appSource, /for \(const task of tasksToMove\)/);
  assert.doesNotMatch(appSource, /for \(const task of targetTasks\)/);
  assert.match(appSource, /taskContentFolderActions\.moveTaskToFolder\(task, folderId\)/);
});

test("An all-correct Folder batch performs no persistence and reports a successful no-op", () => {
  const selectedTasks = [
    { id: "A", parent_task_id: null, task_content_folder_id: "folder-x" },
    { id: "B", parent_task_id: null, task_content_folder_id: "folder-x" },
  ];
  assert.deepEqual(selectedTasks.filter((task) => taskNeedsContentFolderMove(task, "folder-x")), []);
  assert.match(appSource, /if \(tasksToMove\.length === 0\) \{[\s\S]*tone: "good"[\s\S]*Selected Tasks are already in/);
  assert.match(appSource, /if \(tasksToMove\.length === 0\) \{[\s\S]*return true;/);
});

test("Folder move filtering handles ungrouped, cross-Folder, and child Tasks", () => {
  assert.equal(taskNeedsContentFolderMove({ parent_task_id: null, task_content_folder_id: null }, "folder-x"), true);
  assert.equal(taskNeedsContentFolderMove({ parent_task_id: null, task_content_folder_id: "folder-y" }, "folder-x"), true);
  assert.equal(taskNeedsContentFolderMove({ parent_task_id: null, task_content_folder_id: "folder-x" }, "folder-x"), false);
  assert.equal(taskNeedsContentFolderMove({ parent_task_id: null, task_content_folder_id: null }, null), false);
  assert.equal(taskNeedsContentFolderMove({ parent_task_id: "parent-a", task_content_folder_id: null }, "folder-x"), true);
  assert.equal(taskNeedsContentFolderMove({ parent_task_id: "parent-a", task_content_folder_id: "folder-x" }, null), true);
});

test("Create Folder performs assignment and compensates a failed move", () => {
  assert.match(folderActionsSource, /\.insert\(\{ name, user_id: userId \}\)/);
  assert.match(folderActionsSource, /didPersist = await moveTaskHierarchy\(task, null, folder\.id\)/);
  assert.doesNotMatch(folderActionsSource, /updateTaskRow|buildTaskContentFolderAssignmentPatch/);
  assert.match(folderActionsSource, /\.from\("adhdice_task_content_folders"\)\n\s+\.delete\(\)/);
  assert.match(folderActionsSource, /setFolders\(\(current\) => current\.filter\(\(entry\) => entry\.id !== folder\.id\)\)/);
});

test("successful child Folder creation explicitly expands a collapsed parent and preserves expanded parents", () => {
  assert.match(appSource, /const addFolderToTaskContentFolder = useCallback\(\s*async \(parentFolderId: string, name: string\) => \{/);
  assert.match(appSource, /const didCreate = await taskContentFolderActions\.createFolder\(name, parentFolderId\);/);
  assert.match(appSource, /if \(didCreate\) \{\s*setCollapsedTaskContentFolderIds\(\(current\) => \{\s*if \(!current\.has\(parentFolderId\)\) return current;/);
  assert.match(appSource, /const next = new Set\(current\);\s*next\.delete\(parentFolderId\);/);
  assert.match(appSource, /return didCreate;\s*\},\s*\[taskContentFolderActions\.createFolder\],\s*\);/);
});

test("Folder collapse persistence remains owned by the existing localStorage effect", () => {
  assert.match(appSource, /adhdice:task-content-folder-collapse:\$\{userId\}/);
  assert.match(appSource, /JSON\.stringify\(\[\.\.\.collapsedTaskContentFolderIds\]\)/);
  assert.match(appSource, /\[collapsedTaskContentFolderIds, isTaskContentFolderCollapseHydrated, session\?\.user\?\.id\]/);
});

test("Folder rows are the shared rename/delete management surface in Table and List", () => {
  for (const source of [tableSource, listSource]) {
    assert.match(source, /openContentFolderContextMenu\(entry\.folder\.id/);
    assert.match(source, /TaskContentFolderContextMenu/);
    assert.match(source, /onRenameTaskContentFolder/);
    assert.match(source, /onDeleteTaskContentFolder/);
  }
  assert.match(folderHeaderSource, /data-style-role="tasks\.content-folder\.header"/);
  assert.match(folderMenuSource, /Rename Folder/);
  assert.match(folderMenuSource, /Delete Folder/);
  assert.match(folderMenuSource, /Direct Tasks will move to this Folder's parent/);
});

test("canonical metadata reconciliation preserves the projected boundary in both result paths", () => {
  assert.match(appSource, /const latestTask = previousTask\n\s+\? mergeTaskWithCanonicalScheduleProjection\(previousTask, result\.conflict\.latestTask\)/);
  assert.match(appSource, /const reconciledNextData = previousTask\n\s+\? mergeTaskWithCanonicalScheduleProjection\(previousTask, nextData\)/);
  assert.match(appSource, /newTaskContentFolderId/);
});
