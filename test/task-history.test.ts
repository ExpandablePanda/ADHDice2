import assert from "node:assert/strict";
import test from "node:test";

import type { TaskHistory as DbTaskHistory } from "../src/lib/database.types.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import {
  buildTaskDueDateSet,
  computeTaskHistoryStats,
  computeTaskSpecificHistoryStats,
} from "../src/lib/task-history.ts";

function createHistoryEntry({
  entryDate,
  id,
  status,
  taskId = "task-1",
  wasCompleted,
}: {
  entryDate: string;
  id: string;
  status: "did_my_best" | "done" | "missed";
  taskId?: string;
  wasCompleted: boolean;
}): DbTaskHistory {
  return {
    created_at: `${entryDate}T09:00:00.000Z`,
    entry_date: entryDate,
    id,
    status,
    task_id: taskId,
    updated_at: `${entryDate}T09:00:00.000Z`,
    user_id: "test-user",
    was_completed: wasCompleted,
  };
}

test("aggregate missed streak stays active when today has not been logged yet", () => {
  const stats = computeTaskHistoryStats([
    createHistoryEntry({ entryDate: "2026-06-01", id: "h1", status: "done", wasCompleted: true }),
    createHistoryEntry({ entryDate: "2026-06-02", id: "h2", status: "missed", wasCompleted: false }),
    createHistoryEntry({ entryDate: "2026-06-03", id: "h3", status: "missed", wasCompleted: false }),
  ], "2026-06-04");

  assert.equal(stats.missedStreak, 2);
});

test("daily recurring history keeps older missed dates classified as due opportunities after due_on advances", () => {
  const task = createTask({
    created_at: "2026-06-01T08:00:00.000Z",
    due_on: "2026-06-04",
    id: "daily-task",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 1,
    status: "missed",
    title: "Daily recurring task",
  });
  const history = [
    createHistoryEntry({ entryDate: "2026-06-02", id: "d1", status: "missed", taskId: task.id, wasCompleted: false }),
    createHistoryEntry({ entryDate: "2026-06-03", id: "d2", status: "missed", taskId: task.id, wasCompleted: false }),
  ];

  const dueDates = buildTaskDueDateSet(task, "2026-06-01", "2026-06-04", history);
  const stats = computeTaskSpecificHistoryStats(task, history, "2026-06-04");

  assert.equal(dueDates.has("2026-06-02"), true);
  assert.equal(dueDates.has("2026-06-03"), true);
  assert.equal(stats.missedStreak, 2);
});

test("weekly recurring history only marks scheduled prior occurrences as due opportunities", () => {
  const task = createTask({
    created_at: "2026-06-01T08:00:00.000Z",
    due_on: "2026-06-15",
    id: "weekly-task",
    repeat_days_of_week: [1],
    repeat_frequency: "weekly",
    repeat_interval: 1,
    sort_order: 1,
    status: "missed",
    title: "Weekly recurring task",
  });
  const history = [
    createHistoryEntry({ entryDate: "2026-06-08", id: "w1", status: "missed", taskId: task.id, wasCompleted: false }),
  ];

  const dueDates = buildTaskDueDateSet(task, "2026-06-08", "2026-06-12", history);
  const stats = computeTaskSpecificHistoryStats(task, history, "2026-06-12");

  assert.equal(dueDates.has("2026-06-08"), true);
  assert.equal(dueDates.has("2026-06-09"), false);
  assert.equal(dueDates.has("2026-06-10"), false);
  assert.equal(dueDates.has("2026-06-11"), false);
  assert.equal(stats.missedStreak, 1);
});

test("did_my_best still counts as completed for streak calculations", () => {
  const task = createTask({
    created_at: "2026-06-01T08:00:00.000Z",
    due_on: "2026-06-03",
    id: "best-task",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 1,
    status: "did_my_best",
    title: "Do my best task",
  });
  const history = [
    createHistoryEntry({ entryDate: "2026-06-02", id: "b1", status: "done", taskId: task.id, wasCompleted: true }),
    createHistoryEntry({ entryDate: "2026-06-03", id: "b2", status: "did_my_best", taskId: task.id, wasCompleted: true }),
  ];

  const stats = computeTaskSpecificHistoryStats(task, history, "2026-06-03");

  assert.equal(stats.currentStreak, 2);
  assert.equal(stats.bestStreak, 2);
  assert.equal(stats.missedStreak, 0);
});
