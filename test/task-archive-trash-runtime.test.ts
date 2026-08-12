import test from "node:test";
import assert from "node:assert/strict";
import { createTask, getTaskBucket, isTaskVisibleInPrimaryViews } from "../src/lib/task-buckets.ts";
import {
  buildStableCanonicalTaskIndex,
  buildTaskAppStructuralData,
  buildTaskAppWorkspaceFacts,
} from "../src/lib/task-app-derived.ts";
import { getBuiltInTaskLists, type TaskListEvaluationContext } from "../src/lib/task-lists.ts";
import { getTaskTrashTimestamp, getTrashDaysRemaining, isTaskInRecentTrash } from "../src/lib/task-trash.ts";
import { buildTaskTableRow } from "../src/lib/task-table-row.ts";

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

test("canonical Trash membership and retention prefer container state and timestamp", () => {
  const nowMs = Date.parse("2026-06-13T11:00:00.000Z");
  const canonicalTrashedAt = "2026-06-11T11:00:00.000Z";
  const canonicalTrashTask = {
    ...createTask({
      created_at: "2026-06-11T09:00:00.000Z",
      id: "canonical-trash-task",
      sort_order: 1,
      status: "trashed",
      title: "Canonical Trash",
      trashed_at: null,
    }),
    container_state: "trashed" as const,
    container_trashed_at: canonicalTrashedAt,
  };

  assert.equal(isTaskInRecentTrash(canonicalTrashTask, nowMs), true);
  assert.equal(getTaskTrashTimestamp(canonicalTrashTask), canonicalTrashedAt);

  const row = buildTaskTableRow(canonicalTrashTask, {
    focusedTaskIdSet: new Set(),
    linkedNotes: [],
    listDefinitions: [],
    listMemberships: [],
    subtasks: [],
    taskHistory: [],
    todayDateKey: "2026-06-13",
  });
  assert.equal(row.trashedAt, canonicalTrashedAt);
  assert.equal(getTrashDaysRemaining(row.trashedAt, nowMs), 28);
});

test("workspace Trash facts include a fresh canonical trashed row and increment its count", () => {
  const canonicalTrashedAt = new Date(Date.now() - (2 * 24 * 60 * 60 * 1000)).toISOString();
  const canonicalTrashTask = {
    ...createTask({
      created_at: "2026-06-11T09:00:00.000Z",
      id: "canonical-trash-workspace-task",
      sort_order: 1,
      status: "trashed",
      title: "Canonical Workspace Trash",
      trashed_at: null,
    }),
    container_state: "trashed" as const,
    container_trashed_at: canonicalTrashedAt,
  };
  const tasks = [canonicalTrashTask];
  const todayDateKey = "2026-06-13";
  const taskListEvaluationContext: TaskListEvaluationContext = {
    currentStreakByTaskId: {},
    focusedTaskIds: new Set(),
    hasStepsByTaskId: {},
    isDueToday: () => false,
    isDueTomorrow: () => false,
    isLater: () => false,
    isOpen: (task) => task.status !== "complete" && task.status !== "archived" && task.status !== "trashed",
    isOverdue: () => false,
    historyFactsByTaskId: {},
    manualMembershipsByTaskId: {},
    taskHistoryByTaskId: {},
    todayDateKey,
  };
  const structuralData = buildTaskAppStructuralData({
    focusedTaskIds: [],
    taskHistoryByTaskId: {},
    tasks,
    todayDateKey,
  });
  const stableCanonicalTaskIndex = buildStableCanonicalTaskIndex({
    availableTaskLists: getBuiltInTaskLists(),
    focusedTaskIds: [],
    taskHistoryByTaskId: {},
    taskListEvaluationContext,
    taskSubtasksByTaskId: {},
    tasks,
    todayDateKey,
    hierarchy: structuralData.hierarchy,
  });
  const workspaceFacts = buildTaskAppWorkspaceFacts({
    availableTaskNotes: [],
    bucketContext: { focusedTaskIds: new Set(), routing: {}, todayDateKey },
    focusedTaskIds: [],
    structuralData,
    stableCanonicalTaskIndex,
    tasks,
  });

  assert.deepEqual(workspaceFacts.recentlyDeletedTasks.map((task) => task.id), [canonicalTrashTask.id]);
  assert.equal(workspaceFacts.taskStatusCounts.trashed, 1);
});

test("canonical Trash state suppresses stale legacy membership, while migrated null state falls back", () => {
  const nowMs = Date.parse("2026-06-13T11:00:00.000Z");
  const legacyTrashedAt = "2026-06-11T11:00:00.000Z";
  const migratedTrashTask = {
    ...createTask({
      created_at: "2026-06-11T09:00:00.000Z",
      id: "migrated-trash-task",
      sort_order: 1,
      status: "trashed",
      title: "Migrated Trash",
      trashed_at: legacyTrashedAt,
    }),
    container_state: null,
    container_trashed_at: null,
  };
  const restoredCanonicalTask = {
    ...migratedTrashTask,
    container_state: "active" as const,
    container_trashed_at: null,
  };

  assert.equal(isTaskInRecentTrash(migratedTrashTask, nowMs), true);
  assert.equal(getTaskTrashTimestamp(migratedTrashTask), legacyTrashedAt);
  assert.equal(isTaskInRecentTrash(restoredCanonicalTask, nowMs), false);
  assert.equal(getTaskTrashTimestamp(restoredCanonicalTask), null);
});
