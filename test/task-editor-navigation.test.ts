import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getTaskEditorNavigationNeighbor,
  getTaskEditorNavigationPosition,
} from "../src/lib/task-editor-navigation.ts";
import { sortListParentTasks } from "../src/lib/task-list-sort.ts";

const tableSource = readFileSync("src/components/ui/task-management-table-v2.tsx", "utf8");
const listSource = readFileSync("src/components/task-app/tasks-list-adapter.tsx", "utf8");
const appSource = readFileSync("src/components/task-app.tsx", "utf8");

function neighbor(taskIds: readonly string[], currentTaskId: string, direction: "next" | "previous", available: Iterable<string> = taskIds) {
  const availableIds = new Set(available);
  return getTaskEditorNavigationNeighbor({
    currentTaskId,
    direction,
    isTaskAvailable: (taskId) => availableIds.has(taskId),
    taskIds,
  });
}

test("Table navigation follows the captured displayed order without wraparound", () => {
  const tableOrder = ["C", "A", "B"];

  assert.equal(neighbor(tableOrder, "A", "previous"), "C");
  assert.equal(neighbor(tableOrder, "A", "next"), "B");
  assert.equal(neighbor(tableOrder, "C", "previous"), null);
  assert.equal(neighbor(tableOrder, "B", "next"), null);
  assert.deepEqual(getTaskEditorNavigationPosition(tableOrder, "A"), { count: 3, index: 2 });
});

test("List navigation uses its sorted sequence rather than its source order", () => {
  const sourceTasks = ["B", "A", "C"].map((id) => ({
    created_at: "2026-09-12T12:00:00.000Z",
    id,
    is_important: false,
    is_urgent: false,
    priority: "normal",
    priority_level: 3,
    status: "pending",
    title: id,
    updated_at: "2026-09-12T12:00:00.000Z",
  })) as unknown as Parameters<typeof sortListParentTasks>[0];
  const sortedListOrder = sortListParentTasks(sourceTasks, { field: "title", direction: "asc" }).map((task) => task.id);

  assert.equal(neighbor(sortedListOrder, "B", "previous"), "A");
  assert.equal(neighbor(sortedListOrder, "B", "next"), "C");
  assert.notEqual(neighbor(sourceTasks.map((task) => task.id), "B", "previous"), neighbor(sortedListOrder, "B", "previous"));
});

test("The editor keeps the captured ID order stable while resolving live task availability", () => {
  const capturedOrder = ["A", "B", "C"];
  const underlyingOrderAfterEdit = ["C", "A"];
  const liveTasks = new Map([
    ["A", { title: "Updated A" }],
    ["C", { title: "Current C" }],
  ]);

  assert.equal(neighbor(capturedOrder, "B", "next", liveTasks.keys()), "C");
  assert.equal(liveTasks.get("C")?.title, "Current C");
  assert.deepEqual(underlyingOrderAfterEdit, ["C", "A"]);
  assert.deepEqual(capturedOrder, ["A", "B", "C"]);
});

test("Unavailable captured IDs are skipped safely", () => {
  const capturedOrder = ["A", "missing", "C"];

  assert.equal(neighbor(capturedOrder, "A", "next", ["A", "C"]), "C");
  assert.equal(neighbor(capturedOrder, "C", "previous", ["A", "C"]), "A");
});

test("Table and List capture their actual presentation sequences and keep full-editor continuity", () => {
  assert.match(tableSource, /onOpenTaskEditor\(taskId, effectiveDisplayedTasks\.map\(\(task\) => task\.id\)\)/);
  assert.match(listSource, /sortListParentTasks\(presentationTasks/);
  assert.match(listSource, /onOpenTaskEditor\?\.\(task\.id, visibleTaskIds\)/);
  assert.match(appSource, /setTaskEditorNavigationTaskIds\(normalizeTaskEditorNavigationTaskIds\(navigationTaskIds/);
  assert.match(appSource, /onTaskEditorNavigate: \(taskId\) => setRequestedListOverlayTaskId\(taskId\)/);
  assert.match(tableSource, /if \(overlayMode !== "full"\)[\s\S]*return;/);
  assert.match(tableSource, /aria-label="Previous task"/);
  assert.match(tableSource, /aria-label="Next task"/);
  assert.match(tableSource, /disabled=\{!previousTaskId\}/);
  assert.match(tableSource, /disabled=\{!nextTaskId\}/);
});

test("Navigation commits the current editor drafts before retargeting and clears target-local draft state", () => {
  const navigationSource = tableSource.slice(
    tableSource.indexOf("function navigateEditorTask"),
    tableSource.indexOf("function getEditorNavigationNeighborId"),
  );

  assert.match(navigationSource, /commitOpenEditorDrafts\(\)/);
  assert.match(navigationSource, /setEditingTaskTitleId\(null\)/);
  assert.match(navigationSource, /setMetadataTargetTaskId\(null\)/);
  assert.match(navigationSource, /openInspector\(nextTaskId, "full"\)/);
  assert.match(navigationSource, /onTaskEditorNavigate\?\.\(nextTaskId\)/);
});
