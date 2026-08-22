import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Task } from "../src/lib/database.types.ts";
import type { PathNode } from "../src/lib/paths-domain.ts";
import { buildPathsTaskNodeView, isPathsNodeComplete, isPathsTaskAvailable } from "../src/lib/paths-task-node.ts";

const taskNode: PathNode = {
  id: "node-task",
  kind: "task",
  linkedTaskIds: ["task-parent"],
  nextNodeIds: ["node-next"],
  note: null,
  pathId: "path-a",
  position: { x: 300, y: 180 },
  sortOrder: 0,
  title: "Canvas label",
};

test("Task Node presentation derives live Task metadata and nested active/completed hierarchy", () => {
  const tasks = [
    task("task-parent", "Ship PATHS", null, { due_on: "2026-07-27", priority_level: 5, status: "delayed" }),
    task("step-active", "Build Task Node", "task-parent", { status: "in_progress" }),
    task("substep-active", "Keep anchors stable", "step-active"),
    task("step-complete", "Trace editor route", "task-parent", { status: "complete" }),
    task("substep-complete", "Reuse shared overlay", "step-complete", { status: "complete" }),
  ];

  const view = buildPathsTaskNodeView(taskNode, tasks);
  assert.equal(view.kind, "task");
  if (view.kind !== "task") return;

  assert.equal(view.task.title, "Ship PATHS");
  assert.equal(view.task.status, "delayed");
  assert.equal(view.dueLabel, "2026-07-27");
  assert.equal(view.priorityLabel, "Priority 5");
  assert.equal(view.completedStepCount, 1);
  assert.equal(view.totalStepCount, 2);
  assert.deepEqual(view.activeSteps.map((step) => step.task.id), ["step-active"]);
  assert.deepEqual(view.activeSteps[0]?.substeps.map((substep) => substep.id), ["substep-active"]);
  assert.deepEqual(view.completedSteps.map((step) => step.task.id), ["step-complete"]);
  assert.deepEqual(view.completedSteps[0]?.substeps.map((substep) => substep.id), ["substep-complete"]);

  tasks[1] = task("step-active", "Build Task Node", "task-parent", { status: "complete" });
  const updated = buildPathsTaskNodeView(taskNode, tasks);
  assert.equal(updated.kind === "task" ? updated.completedStepCount : -1, 2);
});

test("Task Node missing references are safe and canonical parent completion alone controls PATHS completion", () => {
  assert.deepEqual(buildPathsTaskNodeView(taskNode, []), { kind: "missing", taskId: "task-parent" });
  assert.equal(isPathsNodeComplete({ canonicalTaskComplete: false, localPathComplete: true, nodeKind: "task" }), false);
  assert.equal(isPathsNodeComplete({ canonicalTaskComplete: true, localPathComplete: false, nodeKind: "task" }), true);
  assert.equal(isPathsNodeComplete({ canonicalTaskComplete: false, localPathComplete: true, nodeKind: "path" }), true);
});

test("PATHS task availability excludes Trash, Archive, and their descendants", () => {
  const tasks = [
    task("available", "Available", null),
    task("trashed", "Trashed", null, { status: "trashed", trashed_at: "2026-07-26T01:00:00.000Z" }),
    task("trashed-child", "Trashed child", "trashed"),
    task("archived", "Archived", null, { status: "archived" }),
    task("archived-child", "Archived child", "archived"),
  ];

  assert.equal(isPathsTaskAvailable(tasks[0]!, tasks), true);
  assert.equal(isPathsTaskAvailable(tasks[1]!, tasks), false);
  assert.equal(isPathsTaskAvailable(tasks[2]!, tasks), false);
  assert.equal(isPathsTaskAvailable(tasks[3]!, tasks), false);
  assert.equal(isPathsTaskAvailable(tasks[4]!, tasks), false);
});

test("PATHS map picker and connected Task Chips keep canonical interaction boundaries and shared editor routing", () => {
  const workspaceSource = readFileSync(new URL("../src/components/task-app/paths-workspace.tsx", import.meta.url), "utf8");
  const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const taskPageSource = readFileSync(new URL("../src/components/task-app/task-page.tsx", import.meta.url), "utf8");
  const openerStart = taskAppSource.indexOf("const openTaskInSharedTasksEditorFromPaths");
  const openerEnd = taskAppSource.indexOf("const openTaskInSharedTasksEditorFromOnTime", openerStart);
  const pathsOpener = taskAppSource.slice(openerStart, openerEnd);

  assert.match(workspaceSource, /const \[canvasTaskPicker, setCanvasTaskPicker\]/);
  assert.match(workspaceSource, /Search Task Chips/);
  assert.match(workspaceSource, /const hasDiscoveryScope = normalizedQuery\.length > 0 \|\| selectedListId !== null/);
  assert.match(workspaceSource, /availableTaskLists\.filter\(\(list\) => list\.isVisible\)/);
  assert.match(workspaceSource, /listMembershipsByTaskId\[task\.id\]/);
  assert.match(workspaceSource, /linkedTasks\.filter\(\(task\) => !task\.parent_task_id\)/);
  assert.match(workspaceSource, /isPathsTaskAvailable\(task, allLinkedTasks\)/);
  assert.match(workspaceSource, /<AdhdChip/);
  assert.match(workspaceSource, /border-l-2 border-\[#cfc3f8\]/);
  assert.match(workspaceSource, /h-0\.5 w-5 bg-\[#cfc3f8\]/);
  assert.match(workspaceSource, /onSetTaskStatus\?\.\(task\.id, status\)/);
  assert.match(workspaceSource, /void addTaskNodeAt\(taskId, canvasTaskPicker\.nodePosition\)/);
  assert.match(workspaceSource, /data-path-node-drag-surface/);
  assert.match(workspaceSource, /closest\("\[data-path-node-drag-surface\]"\)/);
  assert.match(workspaceSource, /setPointerCapture\(event\.pointerId\)/);
  assert.match(workspaceSource, /persistNodePosition\(node\.id, nextPosition\)/);
  assert.match(workspaceSource, /getTaskNodeRenderHeight/);
  assert.match(workspaceSource, /bottomOnly: node\.kind === "task"/);
  assert.match(workspaceSource, /aria-label=\{`Connect after/);
  assert.match(workspaceSource, /top-full h-8 w-12 .* opacity-0/);
  assert.match(workspaceSource, /isConnectSource && !isTaskNode/);
  assert.match(workspaceSource, /aria-label="Zoom out"/);
  assert.match(workspaceSource, /aria-label="Reset map zoom"/);
  assert.match(workspaceSource, /aria-label="Zoom in"/);
  assert.match(workspaceSource, /absolute right-4 top-4 z-50/);
  assert.match(workspaceSource, /zoom: canvasZoom/);
  assert.match(workspaceSource, /compactTrigger/);
  assert.match(workspaceSource, /onAddPathsNode=\{\(\) => \{/);
  assert.match(workspaceSource, /void addNodeAt\(position\)/);
  assert.match(workspaceSource, /data-path-node-drag-surface/);
  assert.match(workspaceSource, /touch-none/);
  assert.doesNotMatch(workspaceSource, /NODE_LONG_PRESS|beginNodeLongPress|onPointerDownCapture/);
  assert.match(workspaceSource, /data-paths-node-menu/);
  assert.match(workspaceSource, /placeholder="Rename PATHS Node"/);
  assert.match(workspaceSource, />\s*Connect\s*<\/AdhdChip>/);
  assert.match(workspaceSource, />\s*Delete\s*<\/AdhdChip>/);
  assert.match(workspaceSource, /bg-\[#b7a8f8\]/);
  assert.match(workspaceSource, /pb-\[calc\(100vh-10rem\)\]/);
  assert.match(workspaceSource, /NODE_HANDLE_CLASS = "absolute h-8 w-8 .* opacity-0/);
  assert.doesNotMatch(workspaceSource, /TaskEditorModal/);
  assert.match(pathsOpener, /openSharedTaskEditor\(taskId, \{ preserveActivePage: true \}\)/);
  assert.doesNotMatch(pathsOpener, /tasksSurface/);
  assert.doesNotMatch(pathsOpener, /setRequestedListOverlayTaskId/);
  assert.match(taskAppSource, /availableTaskLists=\{availableTaskLists\}/);
  assert.match(taskAppSource, /listMembershipsByTaskId=\{taskListMembershipsByTaskId\}/);
  assert.match(taskPageSource, /surface === "paths" \? \(\s*pathsWorkspacePanel/);
  assert.match(taskPageSource, /showSharedTaskEditorOverlay.*tableViewPanel/);
});

function task(
  id: string,
  title: string,
  parentTaskId: string | null,
  overrides: Partial<Task> = {},
): Task {
  return {
    active_occurrence_due_on: null,
    active_status_logical_date: null,
    actual_seconds: 0,
    completed_at: null,
    created_at: "2026-07-26T00:00:00.000Z",
    due_on: null,
    due_time: null,
    energy: "none",
    estimated_minutes: null,
    external_link_label: null,
    external_link_url: null,
    id,
    is_important: false,
    is_urgent: false,
    notes: null,
    one_step_at_a_time: false,
    parent_task_id: parentTaskId,
    pin_order: null,
    pinned_at: null,
    priority: "normal",
    priority_level: 0,
    repeat_day_of_month: null,
    repeat_days_of_week: [],
    repeat_frequency: "none",
    repeat_interval: 1,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    revision: 1,
    scheduled_on: null,
    sort_order: 0,
    status: "pending",
    subtasks_auto_reset: false,
    tags: [],
    title,
    trashed_at: null,
    updated_at: "2026-07-26T00:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}
