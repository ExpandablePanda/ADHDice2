import assert from "node:assert/strict";
import test from "node:test";

import { createTask, getTaskBucket, isTaskVisibleInPrimaryViews } from "../src/lib/task-buckets.ts";
import { buildChildTaskPreviewLookup } from "../src/lib/task-app-derived.ts";
import {
  CHILD_COMPLETE_CONFIRMATION_MESSAGE,
  buildCompleteHistoryPayload,
  canTaskBeMarkedComplete,
  getTaskCompleteConfirmationCopy,
  getTaskHistoryCalendarActionStatuses,
  getSelectableTaskStatusesForRepeatFrequency,
  isArchiveLikeTask,
  shouldOptimisticallyPatchTaskStatus,
} from "../src/lib/task-complete.ts";
import { isNewRewardCompletion } from "../src/lib/task-rewards.ts";

test("one-off status options include missed and complete but exclude occurrence-success statuses", () => {
  assert.deepEqual(getSelectableTaskStatusesForRepeatFrequency("none"), [
    "pending",
    "in_progress",
    "delayed",
    "missed",
    "complete",
    "upcoming",
    "not_due",
    "archived",
  ]);
});

test("recurring status options keep occurrence statuses and add complete", () => {
  assert.deepEqual(getSelectableTaskStatusesForRepeatFrequency("daily"), [
    "pending",
    "in_progress",
    "delayed",
    "done",
    "did_my_best",
    "missed",
    "complete",
    "upcoming",
    "not_due",
    "archived",
  ]);
});

test("calendar action statuses give one-off tasks missed and complete only", () => {
  assert.deepEqual(getTaskHistoryCalendarActionStatuses({ repeat_frequency: "none" }), [
    "missed",
    "complete",
  ]);
});

test("calendar action statuses keep occurrence actions and separate complete for recurring tasks", () => {
  assert.deepEqual(getTaskHistoryCalendarActionStatuses({ repeat_frequency: "daily" }), [
    "done",
    "did_my_best",
    "missed",
    "complete",
  ]);
  assert.deepEqual(getTaskHistoryCalendarActionStatuses({ repeat_frequency: "daily_until_complete" }), [
    "done",
    "did_my_best",
    "missed",
    "complete",
  ]);
});

test("complete eligibility blocks parents until all descendants recursively are complete", () => {
  const parent = createTask({
    created_at: "2026-06-20T09:00:00.000Z",
    id: "parent",
    sort_order: 1,
    status: "pending",
    title: "Parent",
  });
  const child = createTask({
    created_at: "2026-06-20T09:01:00.000Z",
    id: "child",
    parent_task_id: parent.id,
    sort_order: 1,
    status: "complete",
    title: "Child",
  });
  const grandchild = createTask({
    created_at: "2026-06-20T09:02:00.000Z",
    id: "grandchild",
    parent_task_id: child.id,
    sort_order: 1,
    status: "pending",
    title: "Grandchild",
  });

  const result = canTaskBeMarkedComplete(parent.id, [parent, child, grandchild]);

  assert.equal(result.canComplete, false);
  assert.deepEqual(result.blockingDescendants.map((task) => task.id), ["grandchild"]);
});

test("complete eligibility allows parents when all descendants are already complete", () => {
  const parent = createTask({
    created_at: "2026-06-20T09:00:00.000Z",
    id: "parent",
    sort_order: 1,
    status: "pending",
    title: "Parent",
  });
  const child = createTask({
    created_at: "2026-06-20T09:01:00.000Z",
    id: "child",
    parent_task_id: parent.id,
    sort_order: 1,
    status: "complete",
    title: "Child",
  });
  const grandchild = createTask({
    created_at: "2026-06-20T09:02:00.000Z",
    id: "grandchild",
    parent_task_id: child.id,
    sort_order: 1,
    status: "complete",
    title: "Grandchild",
  });

  const result = canTaskBeMarkedComplete(parent.id, [parent, child, grandchild]);

  assert.equal(result.canComplete, true);
  assert.deepEqual(result.blockingDescendants, []);
});

test("complete history payload uses the permanent event type and due-occurrence metadata", () => {
  assert.deepEqual(
    buildCompleteHistoryPayload(
      {
        due_on: "2026-06-20",
        id: "task-due-today",
        repeat_frequency: "daily_until_complete",
      },
      "2026-06-20",
      "user-1",
    ),
    {
      counted_as_due_occurrence: true,
      entry_date: "2026-06-20",
      event_type: "completed_permanently",
      status: "complete",
      task_id: "task-due-today",
      user_id: "user-1",
      was_completed: true,
    },
  );
});

test("complete history payload does not count a future recurring task as today's due occurrence", () => {
  assert.deepEqual(
    buildCompleteHistoryPayload(
      {
        due_on: "2026-06-22",
        id: "task-future",
        repeat_frequency: "weekly",
      },
      "2026-06-20",
      "user-1",
    ),
    {
      counted_as_due_occurrence: false,
      entry_date: "2026-06-20",
      event_type: "completed_permanently",
      status: "complete",
      task_id: "task-future",
      user_id: "user-1",
      was_completed: false,
    },
  );
});

test("complete reward logic only treats the first transition into a rewarded completion state as new", () => {
  assert.equal(isNewRewardCompletion("pending", "complete"), true);
  assert.equal(isNewRewardCompletion("done", "complete"), false);
  assert.equal(isNewRewardCompletion("did_my_best", "complete"), false);
});

test("complete does not optimistically patch local status state before validation", () => {
  assert.equal(shouldOptimisticallyPatchTaskStatus("complete"), false);
  assert.equal(shouldOptimisticallyPatchTaskStatus("done"), true);
});

test("step complete uses child-safe confirmation copy", () => {
  const parent = createTask({
    created_at: "2026-06-20T09:00:00.000Z",
    id: "parent",
    sort_order: 1,
    status: "pending",
    title: "Parent",
  });
  const child = createTask({
    created_at: "2026-06-20T09:01:00.000Z",
    id: "child",
    parent_task_id: parent.id,
    sort_order: 1,
    status: "pending",
    title: "Child",
  });

  assert.equal(getTaskCompleteConfirmationCopy(child), CHILD_COMPLETE_CONFIRMATION_MESSAGE);
});

test("complete tasks route to archive and stay hidden from active task views", () => {
  const task = createTask({
    created_at: "2026-06-20T09:00:00.000Z",
    id: "complete-task",
    sort_order: 1,
    status: "complete",
    title: "Complete task",
  });

  assert.equal(getTaskBucket(task, { focusedTaskIds: new Set(), routing: {} }), "archive");
  assert.equal(isTaskVisibleInPrimaryViews(task), false);
});

test("completed child steps stay visible under an active parent instead of becoming archive-like immediately", () => {
  const parent = createTask({
    created_at: "2026-06-20T09:00:00.000Z",
    id: "parent",
    sort_order: 1,
    status: "pending",
    title: "Parent",
  });
  const child = createTask({
    created_at: "2026-06-20T09:01:00.000Z",
    id: "child",
    parent_task_id: parent.id,
    sort_order: 1,
    status: "complete",
    title: "Child",
  });

  const preview = buildChildTaskPreviewLookup([parent, child]);

  assert.equal(isArchiveLikeTask(child), false);
  assert.equal(isTaskVisibleInPrimaryViews(child), true);
  assert.deepEqual(preview[parent.id]?.items.map((item) => item.id), ["child"]);
  assert.equal(preview[parent.id]?.items[0]?.status, "complete");
});

test("completed descendants hide with a completed parent through derived top-level visibility", () => {
  const parent = createTask({
    created_at: "2026-06-20T09:00:00.000Z",
    id: "parent",
    sort_order: 1,
    status: "complete",
    title: "Parent",
  });
  const child = createTask({
    created_at: "2026-06-20T09:01:00.000Z",
    id: "child",
    parent_task_id: parent.id,
    sort_order: 1,
    status: "complete",
    title: "Child",
  });

  assert.equal(isArchiveLikeTask(parent), true);
  assert.equal(isArchiveLikeTask(child), false);
  assert.equal(isTaskVisibleInPrimaryViews(parent), false);
  assert.equal(getTaskBucket(parent, { focusedTaskIds: new Set(), routing: {} }), "archive");
});
