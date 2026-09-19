import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

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
  assert.match(taskMenuSource, /type="submit"/);
});

test("Create Folder performs assignment and compensates a failed move", () => {
  assert.match(folderActionsSource, /\.insert\(\{ name, user_id: userId \}\)/);
  assert.match(folderActionsSource, /buildTaskContentFolderAssignmentPatch\(task, folder\.id\)/);
  assert.match(folderActionsSource, /const didPersist = await updateTaskRow/);
  assert.match(folderActionsSource, /\.from\("adhdice_task_content_folders"\)\n\s+\.delete\(\)/);
  assert.match(folderActionsSource, /setFolders\(\(current\) => current\.filter\(\(entry\) => entry\.id !== folder\.id\)\)/);
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
  assert.match(folderMenuSource, /Its Tasks will stay and become ungrouped\./);
});

test("canonical metadata reconciliation preserves the projected boundary in both result paths", () => {
  assert.match(appSource, /const latestTask = previousTask\n\s+\? mergeTaskWithCanonicalScheduleProjection\(previousTask, result\.conflict\.latestTask\)/);
  assert.match(appSource, /const reconciledNextData = previousTask\n\s+\? mergeTaskWithCanonicalScheduleProjection\(previousTask, nextData\)/);
  assert.match(appSource, /task_content_folder_id/);
});
