import assert from "node:assert/strict";
import test from "node:test";

import type { TaskHistory as DbTaskHistory } from "../src/lib/database.types.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import {
  buildTaskHistoryFacts,
  buildTaskHistoryCalendarDueDateSet,
  buildOverdueTaskMissedDateKeys,
  buildTaskDueDateSet,
  computeTaskHistoryStats,
  computeTaskSpecificHistoryStats,
  formatTaskHistoryEntryLabel,
  getTaskHistoryCalendarVirtualState,
  resolveLiveTaskStatusFromHistory,
} from "../src/lib/task-history.ts";

function createHistoryEntry({
  entryDate,
  eventType = "status",
  id,
  status,
  taskId = "task-1",
  wasCompleted,
}: {
  entryDate: string;
  eventType?: "completed_permanently" | "status";
  id: string;
  status: "complete" | "did_my_best" | "done" | "missed";
  taskId?: string;
  wasCompleted: boolean;
}): DbTaskHistory {
  return {
    counted_as_due_occurrence: false,
    created_at: `${entryDate}T09:00:00.000Z`,
    entry_date: entryDate,
    event_type: eventType,
    id,
    status,
    task_id: taskId,
    updated_at: `${entryDate}T09:00:00.000Z`,
    user_id: "test-user",
    was_completed: wasCompleted,
  };
}

test("calendar virtual states distinguish upcoming and not-due dates without overriding history", () => {
  assert.equal(getTaskHistoryCalendarVirtualState({
    dateKey: "2026-06-21",
    hasHistoryEntry: false,
    isDue: true,
    nextDueDateKey: "2026-06-21",
    todayDateKey: "2026-06-21",
  }), "due");
  assert.equal(getTaskHistoryCalendarVirtualState({
    dateKey: "2026-06-22",
    hasHistoryEntry: false,
    isDue: true,
    nextDueDateKey: "2026-06-22",
    todayDateKey: "2026-06-21",
  }), "due");
  assert.equal(getTaskHistoryCalendarVirtualState({
    dateKey: "2026-06-22",
    hasHistoryEntry: false,
    isDue: false,
    nextDueDateKey: "2026-06-28",
    todayDateKey: "2026-06-21",
  }), "upcoming");
  assert.equal(getTaskHistoryCalendarVirtualState({
    dateKey: "2026-06-22",
    hasHistoryEntry: true,
    isDue: true,
    nextDueDateKey: "2026-06-22",
    todayDateKey: "2026-06-21",
  }), null);
});

test("overdue missed backfill uses one-off and recurring due opportunities only", () => {
  const oneOff = createTask({
    created_at: "2026-06-01T08:00:00.000Z",
    due_on: "2026-06-10",
    id: "one-off-overdue",
    repeat_frequency: "none",
    sort_order: 1,
    status: "pending",
    title: "One-off overdue",
  });
  const weekly = createTask({
    created_at: "2026-06-01T08:00:00.000Z",
    due_on: "2026-06-01",
    id: "weekly-overdue",
    repeat_days_of_week: [1],
    repeat_frequency: "weekly",
    repeat_interval: 1,
    sort_order: 2,
    status: "pending",
    title: "Weekly overdue",
  });

  assert.deepEqual(buildOverdueTaskMissedDateKeys(oneOff, "2026-06-21"), [
    "2026-06-10",
    "2026-06-11",
    "2026-06-12",
    "2026-06-13",
    "2026-06-14",
    "2026-06-15",
    "2026-06-16",
    "2026-06-17",
    "2026-06-18",
    "2026-06-19",
    "2026-06-20",
  ]);
  assert.deepEqual(
    [...buildTaskHistoryCalendarDueDateSet(oneOff, "2026-06-09", "2026-06-22", "2026-06-21")],
    [
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
      "2026-06-13",
      "2026-06-14",
      "2026-06-15",
      "2026-06-16",
      "2026-06-17",
      "2026-06-18",
      "2026-06-19",
      "2026-06-20",
      "2026-06-21",
    ],
  );
  assert.deepEqual(buildOverdueTaskMissedDateKeys(weekly, "2026-06-21"), ["2026-06-01", "2026-06-08", "2026-06-15"]);
});

test("monthly calendar dates distinguish scheduled upcoming dates from non-due dates", () => {
  const task = createTask({
    created_at: "2026-06-01T08:00:00.000Z",
    due_on: "2026-06-21",
    id: "monthly-virtual-states",
    repeat_day_of_month: 21,
    repeat_frequency: "monthly",
    repeat_interval: 1,
    sort_order: 1,
    status: "pending",
    title: "Monthly virtual states",
  });
  const dueDates = buildTaskDueDateSet(task, "2026-06-21", "2026-07-22");

  assert.equal(dueDates.has("2026-07-21"), true);
  assert.equal(dueDates.has("2026-07-20"), false);
  assert.equal(getTaskHistoryCalendarVirtualState({ dateKey: "2026-07-21", hasHistoryEntry: false, isDue: true, nextDueDateKey: "2026-07-21", todayDateKey: "2026-06-21" }), "due");
  assert.equal(getTaskHistoryCalendarVirtualState({ dateKey: "2026-07-13", hasHistoryEntry: false, isDue: false, nextDueDateKey: "2026-07-21", todayDateKey: "2026-06-21" }), "not_due");
  assert.equal(getTaskHistoryCalendarVirtualState({ dateKey: "2026-07-14", hasHistoryEntry: false, isDue: false, nextDueDateKey: "2026-07-21", todayDateKey: "2026-06-21" }), "upcoming");
});

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

test("one-off task missed streak counts trailing batch-edited missed history", () => {
  const task = createTask({
    created_at: "2026-06-01T08:00:00.000Z",
    due_on: "2026-06-15",
    id: "one-off-batch-missed",
    repeat_frequency: "none",
    sort_order: 1,
    status: "missed",
    title: "One-off batch missed",
  });
  const history = Array.from({ length: 7 }, (_, index) => createHistoryEntry({
    entryDate: `2026-06-${String(index + 15).padStart(2, "0")}`,
    id: `one-off-missed-${index}`,
    status: "missed",
    taskId: task.id,
    wasCompleted: false,
  }));

  assert.equal(computeTaskSpecificHistoryStats(task, history, "2026-06-21").missedStreak, 7);
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

test("daily until complete due dates stay anchored while overdue and include each missed day", () => {
  const task = createTask({
    created_at: "2026-06-01T08:00:00.000Z",
    due_on: "2026-06-10",
    id: "daily-until-complete-overdue",
    repeat_frequency: "daily_until_complete",
    repeat_interval: 1,
    sort_order: 1,
    status: "missed",
    title: "Daily until complete overdue",
  });
  const history = [
    createHistoryEntry({ entryDate: "2026-06-10", id: "duc1", status: "missed", taskId: task.id, wasCompleted: false }),
    createHistoryEntry({ entryDate: "2026-06-11", id: "duc2", status: "missed", taskId: task.id, wasCompleted: false }),
    createHistoryEntry({ entryDate: "2026-06-12", id: "duc3", status: "missed", taskId: task.id, wasCompleted: false }),
  ];

  const dueDates = buildTaskDueDateSet(task, "2026-06-10", "2026-06-13", history);
  const stats = computeTaskSpecificHistoryStats(task, history, "2026-06-13");

  assert.equal(dueDates.has("2026-06-10"), true);
  assert.equal(dueDates.has("2026-06-11"), true);
  assert.equal(dueDates.has("2026-06-12"), true);
  assert.equal(dueDates.has("2026-06-13"), true);
  assert.equal(stats.missedStreak, 3);
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

test("permanent complete history rows render as marked complete", () => {
  const completeEntry = createHistoryEntry({
    entryDate: "2026-06-20",
    eventType: "completed_permanently",
    id: "complete-1",
    status: "complete",
    wasCompleted: true,
  });
  const doneEntry = createHistoryEntry({
    entryDate: "2026-06-20",
    id: "done-1",
    status: "done",
    wasCompleted: true,
  });

  assert.equal(formatTaskHistoryEntryLabel(completeEntry), "Marked Complete");
  assert.equal(formatTaskHistoryEntryLabel(doneEntry), "Done");
  assert.equal(completeEntry.counted_as_due_occurrence, false);
});
