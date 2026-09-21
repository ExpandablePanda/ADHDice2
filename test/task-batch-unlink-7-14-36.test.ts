import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Task } from "../src/lib/database.types.ts";
import { buildTaskHierarchyUnlinkPlan } from "../src/lib/task-hierarchy-mutation.ts";

const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const adapterSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");

function task(
  id: string,
  parentTaskId: string | null = null,
  taskContentFolderId: string | null = null,
): Task {
  return {
    id,
    parent_task_id: parentTaskId,
    task_content_folder_id: taskContentFolderId,
    user_id: "user-1",
    revision: 1,
    title: id,
  } as Task;
}

test("batch unlink plans sibling Steps as top-level moves", () => {
  const plan = buildTaskHierarchyUnlinkPlan([
    task("root"),
    task("step-a", "root"),
    task("step-b", "root"),
  ], ["step-a", "step-b"]);

  assert.deepEqual(plan.map((entry) => entry.task.id), ["step-a", "step-b"]);
  assert.deepEqual(plan.map((entry) => entry.inheritedFolderId), [null, null]);
});

test("batch unlink processes a selected Step before its selected Substep parent", () => {
  const plan = buildTaskHierarchyUnlinkPlan([
    task("root"),
    task("step", "root"),
    task("substep", "step"),
  ], ["step", "substep"]);

  assert.deepEqual(plan.map((entry) => entry.task.id), ["substep", "step"]);
});

test("batch unlink is deepest-first with stable ordering at equal depth", () => {
  const plan = buildTaskHierarchyUnlinkPlan([
    task("root"),
    task("step", "root"),
    task("substep", "step"),
    task("deep", "substep"),
    task("sibling", "root"),
  ], ["sibling", "step", "deep", "substep"]);

  assert.deepEqual(plan.map((entry) => entry.task.id), ["deep", "substep", "step", "sibling"]);
});

test("batch unlink preserves each selected Task's original root Folder", () => {
  const plan = buildTaskHierarchyUnlinkPlan([
    task("games-root", null, "games"),
    task("games-step", "games-root"),
    task("music-root", null, "music"),
    task("music-step", "music-root"),
  ], ["music-step", "games-step"]);

  assert.deepEqual(
    new Map(plan.map((entry) => [entry.task.id, entry.inheritedFolderId])),
    new Map([["games-step", "games"], ["music-step", "music"]]),
  );
});

test("batch unlink inherits no Folder from an ungrouped root", () => {
  const plan = buildTaskHierarchyUnlinkPlan([
    task("root"),
    task("step", "root"),
  ], ["step"]);

  assert.equal(plan[0]?.inheritedFolderId, null);
});

test("batch unlink ignores already top-level selected Tasks and handles a leaf", () => {
  const plan = buildTaskHierarchyUnlinkPlan([
    task("root"),
    task("leaf", "root"),
  ], ["root", "leaf"]);

  assert.deepEqual(plan.map((entry) => entry.task.id), ["leaf"]);
  assert.equal(buildTaskHierarchyUnlinkPlan([task("leaf", "root")], ["leaf"]).length, 1);
});

test("right-clicking a selected row uses the selected target set, while an unselected row stays single-target", () => {
  assert.match(tableSource, /rowContextMenuQuickEditTargetIds = useMemo\(\s*\(\) => rowContextMenu\?\.taskId && selectedTaskIdSet\.has\(rowContextMenu\.taskId\) && selectedTaskIds\.length > 1/);
  assert.match(tableSource, /rowContextMenuBatchUnlinkTaskIds = useMemo/);
  assert.match(tableSource, /<span>Unlink \{batchUnlinkTaskIds\.length\} selected<\/span>/);
  assert.match(tableSource, /rowContextMenu\?\.taskId\s*\? \[rowContextMenu\.taskId\]/);
});

test("batch unlink is wired through the shared Table and List context-menu path", () => {
  assert.match(appSource, /const unlinkSameTableTasks = useCallback/);
  assert.match(appSource, /persistTaskHierarchyRow\([\s\S]*\{ quiet: true \}/);
  assert.match(appSource, /Unlinked \$\{successCount\} selected tasks\./);
  assert.match(appSource, /onUnlinkTasks: unlinkSameTableTasks/);
  assert.match(adapterSource, /onUnlinkTasks\?:/);
  assert.match(adapterSource, /onUnlinkTasks=\{tableProps\.onUnlinkTasks\}/);
  assert.match(tableSource, /onUnlinkTasks=\{onUnlinkTasks \? async \(taskIds\)/);
});

test("single-task Unlink remains available and batch code does not use generic hierarchy updates", () => {
  assert.match(appSource, /const unlinkSameTableTask = useCallback/);
  assert.match(appSource, /onUnlinkTask: \(taskId\) => unlinkSameTableTask\(taskId\)/);
  assert.doesNotMatch(appSource, /unlinkSameTableTasks[\s\S]{0,120}applyTaskMutationWithoutHistory/);
  assert.doesNotMatch(appSource, /unlinkSameTableTasks[\s\S]{0,120}updateTaskRow/);
});
