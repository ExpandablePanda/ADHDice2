import test from "node:test";
import assert from "node:assert/strict";
import { createTask } from "../src/lib/task-buckets.ts";
import { getRecurringFinalizationTasksForRewardClaims } from "../src/lib/task-rewards.ts";

test("subtask reward claims do not finalize recurring parent tasks, but parent claims still do", () => {
  const parentTask = createTask({
    created_at: "2026-06-11T08:00:00.000Z",
    due_on: "2026-06-11",
    id: "task-parent",
    repeat_frequency: "daily",
    sort_order: 1,
    status: "did_my_best",
    subtasks_auto_reset: true,
    title: "Recurring parent",
  });

  const subtaskFinalizationTasks = getRecurringFinalizationTasksForRewardClaims(
    [parentTask],
    [{ subtaskId: "subtask-1", taskId: parentTask.id }],
  );
  assert.deepEqual(subtaskFinalizationTasks, []);

  const parentFinalizationTasks = getRecurringFinalizationTasksForRewardClaims(
    [parentTask],
    [{ subtaskId: null, taskId: parentTask.id }],
  );
  assert.deepEqual(parentFinalizationTasks, [parentTask]);
});
