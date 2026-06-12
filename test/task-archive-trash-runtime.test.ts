import test from "node:test";
import assert from "node:assert/strict";
import { createTask, getTaskBucket, isTaskVisibleInPrimaryViews } from "../src/lib/task-buckets.ts";
import { getTrashDaysRemaining, isTaskInRecentTrash } from "../src/lib/task-trash.ts";

test("task buckets split archive and trash statuses", () => {
  const archiveTask = createTask({
    created_at: "2026-06-11T09:00:00.000Z",
    id: "archive-task",
    sort_order: 1,
    status: "archived",
    title: "Archive me",
  });
  const trashTask = createTask({
    created_at: "2026-06-11T09:05:00.000Z",
    id: "trash-task",
    sort_order: 2,
    status: "trashed",
    title: "Trash me",
    trashed_at: "2026-06-11T11:00:00.000Z",
  });

  assert.equal(getTaskBucket(archiveTask, { focusedTaskIds: new Set(), routing: {} }), "archive");
  assert.equal(getTaskBucket(trashTask, { focusedTaskIds: new Set(), routing: {} }), "trash");
});

test("active task views exclude archived and trashed tasks", () => {
  const activeTask = createTask({
    created_at: "2026-06-11T09:00:00.000Z",
    id: "active-task",
    sort_order: 1,
    status: "pending",
    title: "Active",
  });
  const archiveTask = createTask({
    created_at: "2026-06-11T09:05:00.000Z",
    id: "archive-task",
    sort_order: 2,
    status: "archived",
    title: "Archived",
  });
  const trashTask = createTask({
    created_at: "2026-06-11T09:10:00.000Z",
    id: "trash-task",
    sort_order: 3,
    status: "trashed",
    title: "Trashed",
    trashed_at: "2026-06-11T11:00:00.000Z",
  });

  const visibleTasks = [activeTask, archiveTask, trashTask].filter(isTaskVisibleInPrimaryViews);
  assert.deepEqual(visibleTasks.map((task) => task.id), ["active-task"]);
});

test("trash countdown source uses trashed_at instead of updated_at", () => {
  const recentlyTrashed = createTask({
    created_at: "2026-05-01T09:00:00.000Z",
    id: "recently-trashed",
    sort_order: 1,
    status: "trashed",
    title: "Recent trash",
    trashed_at: new Date(Date.now() - (2 * 24 * 60 * 60 * 1000)).toISOString(),
    updated_at: "2026-05-01T09:00:00.000Z",
  });
  const staleTrash = createTask({
    created_at: "2026-05-01T09:05:00.000Z",
    id: "stale-trash",
    sort_order: 2,
    status: "trashed",
    title: "Old trash",
    trashed_at: new Date(Date.now() - (40 * 24 * 60 * 60 * 1000)).toISOString(),
    updated_at: new Date().toISOString(),
  });

  assert.equal(isTaskInRecentTrash(recentlyTrashed), true);
  assert.equal(isTaskInRecentTrash(staleTrash), false);
  assert.equal(getTrashDaysRemaining(recentlyTrashed.trashed_at), 28);
});
