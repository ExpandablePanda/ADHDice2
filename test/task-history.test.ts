import assert from "node:assert/strict";
import test from "node:test";

import type { TaskHistory as DbTaskHistory } from "../src/lib/database.types.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import {
  buildTaskHistoryFacts,
  buildTaskDueDateSet,
  computeTaskHistoryStats,
  computeTaskSpecificHistoryStats,
  resolveLiveTaskStatusFromHistory,
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

test("aggregate current streak uses latest contiguous completed logged days when today is empty", () => {
  const stats = computeTaskHistoryStats([
    createHistoryEntry({ entryDate: "2026-06-09", id: "s1", status: "done", wasCompleted: true }),
    createHistoryEntry({ entryDate: "2026-06-10", id: "s2", status: "done", wasCompleted: true }),
    createHistoryEntry({ entryDate: "2026-06-11", id: "s3", status: "done", wasCompleted: true }),
  ], "2026-06-12");

  assert.equal(stats.currentStreak, 3);
});

test("aggregate missed streak excludes today when today has no saved missed row", () => {
  const stats = computeTaskHistoryStats([
    createHistoryEntry({ entryDate: "2026-06-11", id: "m1", status: "missed", wasCompleted: false }),
  ], "2026-06-12");

  assert.equal(stats.missedStreak, 1);
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

test("daily recurring due dates still leave today as a due opportunity when yesterday was missed", () => {
  const task = createTask({
    created_at: "2026-06-01T08:00:00.000Z",
    due_on: "2026-06-12",
    id: "daily-due-today",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 1,
    status: "missed",
    title: "Daily recurring due today",
  });
  const history = [
    createHistoryEntry({ entryDate: "2026-06-11", id: "c1", status: "missed", taskId: task.id, wasCompleted: false }),
  ];

  const dueDates = buildTaskDueDateSet(task, "2026-06-11", "2026-06-12", history);

  assert.equal(dueDates.has("2026-06-12"), true);
  assert.equal(history.some((entry) => entry.entry_date === "2026-06-12"), false);
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

test("history facts use saved rows for completed and missed windows", () => {
  const facts = buildTaskHistoryFacts([
    createHistoryEntry({ entryDate: "2026-06-08", id: "f1", status: "done", wasCompleted: true }),
    createHistoryEntry({ entryDate: "2026-06-10", id: "f2", status: "did_my_best", wasCompleted: true }),
    createHistoryEntry({ entryDate: "2026-06-11", id: "f3", status: "missed", wasCompleted: false }),
  ], "2026-06-12");

  assert.equal(facts.completedToday, false);
  assert.equal(facts.missedToday, false);
  assert.equal(facts.completedWithinLast["3"], true);
  assert.equal(facts.lastCompletedWithinLast["3"], true);
  assert.equal(facts.missedWithinLast["1"], false);
  assert.equal(facts.missedWithinLast["3"], true);
  assert.equal(facts.lastMissedWithinLast["3"], true);
  assert.equal(facts.hasEverCompleted, true);
  assert.equal(facts.hasEverMissed, true);
});

test("history facts count only actual today rows for today flags and current streaks", () => {
  const facts = buildTaskHistoryFacts([
    createHistoryEntry({ entryDate: "2026-06-10", id: "t1", status: "done", wasCompleted: true }),
    createHistoryEntry({ entryDate: "2026-06-11", id: "t2", status: "done", wasCompleted: true }),
  ], "2026-06-12");

  assert.equal(facts.completedToday, false);
  assert.equal(facts.missedToday, false);
  assert.equal(facts.completedWithinLast["1"], false);
  assert.equal(facts.currentCompletedStreak, 2);
  assert.equal(facts.currentMissedStreak, 0);
});

test("recurring live status may remain missed while today still has no saved history row", () => {
  const task = createTask({
    created_at: "2026-06-01T08:00:00.000Z",
    due_on: "2026-06-12",
    id: "active-missed-task",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 1,
    status: "missed",
    title: "Active missed recurring task",
  });
  const history = [
    createHistoryEntry({ entryDate: "2026-06-11", id: "l1", status: "missed", taskId: task.id, wasCompleted: false }),
  ];

  const result = resolveLiveTaskStatusFromHistory(task, history, {
    currentDayKey: "2026-06-12",
    dayStartTime: "06:00",
    now: new Date("2026-06-12T12:00:00.000Z"),
    timezone: "America/New_York",
  });

  assert.equal(result.status, "missed");
  assert.equal(history.some((entry) => entry.entry_date === "2026-06-12"), false);
});
