import assert from "node:assert/strict";
import test from "node:test";

import type { TaskHistory as DbTaskHistory } from "../src/lib/database.types.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import { getTaskDisplayStatusWithHistory } from "../src/lib/task-cockpit.ts";
import {
  buildTaskHistoryFacts,
  buildTaskHistoryCalendarDueDateSet,
  buildMissingScheduledMissedHistoryDateKeys,
  buildOverdueTaskMissedDateKeys,
  buildTaskDueDateSet,
  computeTaskHistoryStats,
  computeTaskSpecificHistoryStats,
  formatTaskHistoryEntryLabel,
  getTaskFocusFilterFacts,
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
    delayedUntilDateKey: null,
    hasHistoryEntry: false,
    isDue: true,
    nextDueDateKey: "2026-06-21",
    todayDateKey: "2026-06-21",
  }), "due");
  assert.equal(getTaskHistoryCalendarVirtualState({
    dateKey: "2026-06-22",
    delayedUntilDateKey: null,
    hasHistoryEntry: false,
    isDue: true,
    nextDueDateKey: "2026-06-22",
    todayDateKey: "2026-06-21",
  }), "due");
  assert.equal(getTaskHistoryCalendarVirtualState({
    dateKey: "2026-06-22",
    delayedUntilDateKey: null,
    hasHistoryEntry: false,
    isDue: false,
    nextDueDateKey: "2026-06-28",
    todayDateKey: "2026-06-21",
  }), "upcoming");
  assert.equal(getTaskHistoryCalendarVirtualState({
    dateKey: "2026-06-22",
    delayedUntilDateKey: null,
    hasHistoryEntry: true,
    isDue: true,
    nextDueDateKey: "2026-06-22",
    todayDateKey: "2026-06-21",
  }), null);
});

test("calendar missed backfill fills only missing scheduled dates through the first later completion", () => {
  const task = createTask({
    created_at: "2026-07-01T08:00:00.000Z",
    due_on: "2026-07-09",
    id: "calendar-missed-gap-daily",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 1,
    status: "missed",
    title: "Daily missed gap",
  });
  const history = [
    createHistoryEntry({ entryDate: "2026-07-09", id: "missed-anchor", status: "missed", taskId: task.id, wasCompleted: false }),
    createHistoryEntry({ entryDate: "2026-07-13", id: "done-boundary", status: "done", taskId: task.id, wasCompleted: true }),
  ];

  assert.deepEqual(buildMissingScheduledMissedHistoryDateKeys(task, history, "2026-07-09", "2026-07-13"), [
    "2026-07-10", "2026-07-11", "2026-07-12",
  ]);
  const firstBackfill = buildMissingScheduledMissedHistoryDateKeys(task, history, "2026-07-09", "2026-07-13");
  const savedBackfill = firstBackfill.map((entryDate, index) => createHistoryEntry({
    entryDate,
    id: `backfilled-${index}`,
    status: "missed",
    taskId: task.id,
    wasCompleted: false,
  }));
  assert.deepEqual(buildMissingScheduledMissedHistoryDateKeys(task, [...history, ...savedBackfill], "2026-07-09", "2026-07-13"), []);
});

test("calendar missed backfill preserves saved history, stops at Did My Best or Complete, and excludes today", () => {
  const task = createTask({
    created_at: "2026-07-01T08:00:00.000Z",
    due_on: "2026-07-09",
    id: "calendar-missed-boundaries",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 1,
    status: "missed",
    title: "Daily missed boundaries",
  });
  const existingMissed = createHistoryEntry({ entryDate: "2026-07-10", id: "existing-missed", status: "missed", taskId: task.id, wasCompleted: false });
  const best = createHistoryEntry({ entryDate: "2026-07-13", id: "best-boundary", status: "did_my_best", taskId: task.id, wasCompleted: true });
  assert.deepEqual(buildMissingScheduledMissedHistoryDateKeys(task, [existingMissed, best], "2026-07-09", "2026-07-14"), [
    "2026-07-11", "2026-07-12",
  ]);
  const complete = createHistoryEntry({ entryDate: "2026-07-12", eventType: "completed_permanently", id: "complete-boundary", status: "complete", taskId: task.id, wasCompleted: true });
  assert.deepEqual(buildMissingScheduledMissedHistoryDateKeys(task, [complete], "2026-07-09", "2026-07-14"), [
    "2026-07-10", "2026-07-11",
  ]);
  assert.deepEqual(buildMissingScheduledMissedHistoryDateKeys(task, [], "2026-07-09", "2026-07-13"), [
    "2026-07-10", "2026-07-11", "2026-07-12",
  ]);
});

test("calendar missed backfill uses the existing interval, weekly, monthly, and custom recurrence dates", () => {
  const base = {
    created_at: "2026-07-01T08:00:00.000Z",
    due_on: "2026-07-01",
    repeat_interval: 1,
    sort_order: 1,
    status: "missed" as const,
    title: "Scheduled backfill",
  };
  assert.deepEqual(buildMissingScheduledMissedHistoryDateKeys(createTask({ ...base, id: "interval", repeat_frequency: "daily", repeat_interval: 3 }), [], "2026-07-01", "2026-07-10"), ["2026-07-04", "2026-07-07"]);
  assert.deepEqual(buildMissingScheduledMissedHistoryDateKeys(createTask({ ...base, id: "weekly", repeat_days_of_week: [1, 3], repeat_frequency: "weekly" }), [], "2026-07-01", "2026-07-10"), ["2026-07-06", "2026-07-08"]);
  assert.deepEqual(buildMissingScheduledMissedHistoryDateKeys(createTask({ ...base, id: "monthly-fixed", repeat_day_of_month: 15, repeat_frequency: "monthly" }), [], "2026-07-01", "2026-09-01"), ["2026-07-15", "2026-08-15"]);
  assert.deepEqual(buildMissingScheduledMissedHistoryDateKeys(createTask({ ...base, due_on: "2026-07-07", id: "monthly-ordinal", repeat_frequency: "monthly", repeat_monthly_mode: "ordinal_weekday", repeat_monthly_ordinal: "first", repeat_monthly_weekday: 2 }), [], "2026-07-07", "2026-09-01"), ["2026-08-04"]);
  assert.deepEqual(buildMissingScheduledMissedHistoryDateKeys(createTask({ ...base, id: "custom", repeat_frequency: "custom", repeat_interval: 4 }), [], "2026-07-01", "2026-07-12"), ["2026-07-05", "2026-07-09"]);
});

test("calendar virtual states show delayed spans for delayed future tasks until the due date", () => {
  assert.equal(getTaskHistoryCalendarVirtualState({
    dateKey: "2026-06-21",
    delayedUntilDateKey: "2026-06-25",
    hasHistoryEntry: false,
    isDue: false,
    nextDueDateKey: "2026-06-25",
    todayDateKey: "2026-06-21",
  }), "delayed");
  assert.equal(getTaskHistoryCalendarVirtualState({
    dateKey: "2026-06-24",
    delayedUntilDateKey: "2026-06-25",
    hasHistoryEntry: false,
    isDue: false,
    nextDueDateKey: "2026-06-25",
    todayDateKey: "2026-06-21",
  }), "delayed");
  assert.equal(getTaskHistoryCalendarVirtualState({
    dateKey: "2026-06-25",
    delayedUntilDateKey: "2026-06-25",
    hasHistoryEntry: false,
    isDue: true,
    nextDueDateKey: "2026-06-25",
    todayDateKey: "2026-06-21",
  }), "due");
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
  assert.equal(getTaskHistoryCalendarVirtualState({ dateKey: "2026-07-21", delayedUntilDateKey: null, hasHistoryEntry: false, isDue: true, nextDueDateKey: "2026-07-21", todayDateKey: "2026-06-21" }), "due");
  assert.equal(getTaskHistoryCalendarVirtualState({ dateKey: "2026-07-13", delayedUntilDateKey: null, hasHistoryEntry: false, isDue: false, nextDueDateKey: "2026-07-21", todayDateKey: "2026-06-21" }), "not_due");
  assert.equal(getTaskHistoryCalendarVirtualState({ dateKey: "2026-07-14", delayedUntilDateKey: null, hasHistoryEntry: false, isDue: false, nextDueDateKey: "2026-07-21", todayDateKey: "2026-06-21" }), "upcoming");
});

test("ordinal monthly due dates use the configured weekday occurrence in calendar/history helpers", () => {
  const task = createTask({
    created_at: "2026-06-01T08:00:00.000Z",
    due_on: "2026-06-02",
    id: "monthly-ordinal-history",
    repeat_day_of_month: null,
    repeat_frequency: "monthly",
    repeat_interval: 1,
    repeat_monthly_mode: "ordinal_weekday",
    repeat_monthly_ordinal: "first",
    repeat_monthly_weekday: 2,
    sort_order: 1,
    status: "pending",
    title: "First Tuesday history",
  });
  const dueDates = buildTaskDueDateSet(task, "2026-06-02", "2026-07-10");

  assert.equal(dueDates.has("2026-07-07"), true);
  assert.equal(dueDates.has("2026-07-02"), false);
  assert.equal(getTaskHistoryCalendarVirtualState({ dateKey: "2026-07-07", delayedUntilDateKey: null, hasHistoryEntry: false, isDue: true, nextDueDateKey: "2026-07-07", todayDateKey: "2026-06-21" }), "due");
  assert.equal(getTaskHistoryCalendarVirtualState({ dateKey: "2026-07-06", delayedUntilDateKey: null, hasHistoryEntry: false, isDue: false, nextDueDateKey: "2026-07-07", todayDateKey: "2026-06-21" }), "upcoming");
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

test("missed history breaks a current streak for recurring tasks", () => {
  const task = createTask({
    created_at: "2026-06-01T08:00:00.000Z",
    due_on: "2026-06-03",
    id: "missed-breaks-streak",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 1,
    status: "done",
    title: "Missed breaks streak",
  });
  const history = [
    createHistoryEntry({ entryDate: "2026-06-02", id: "mb1", status: "done", taskId: task.id, wasCompleted: true }),
    createHistoryEntry({ entryDate: "2026-06-03", id: "mb2", status: "missed", taskId: task.id, wasCompleted: false }),
  ];

  const stats = computeTaskSpecificHistoryStats(task, history, "2026-06-03");

  assert.equal(stats.currentStreak, 0);
  assert.equal(stats.missedStreak, 1);
});

test("one-off tasks show no streak without completed history and one streak with it", () => {
  const task = createTask({
    created_at: "2026-06-01T08:00:00.000Z",
    due_on: "2026-06-03",
    id: "one-off-complete-history",
    repeat_frequency: "none",
    sort_order: 1,
    status: "complete",
    title: "One-off complete history",
  });

  assert.equal(computeTaskSpecificHistoryStats(task, [], "2026-06-03").currentStreak, 0);

  const history = [
    createHistoryEntry({ entryDate: "2026-06-03", id: "oc1", status: "complete", taskId: task.id, wasCompleted: true }),
  ];

  assert.equal(computeTaskSpecificHistoryStats(task, history, "2026-06-03").currentStreak, 1);
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

test("current-day recurring history edit resolves to the next active occurrence", () => {
  const task = createTask({
    created_at: "2026-06-01T08:00:00.000Z",
    due_on: "2026-06-24",
    due_time: null,
    id: "calendar-rollover-task",
    repeat_days_of_week: [3],
    repeat_frequency: "weekly",
    repeat_interval: 1,
    sort_order: 1,
    status: "pending",
    title: "Calendar rollover task",
  });
  const history = [
    createHistoryEntry({ entryDate: "2026-06-24", id: "done-today", status: "done", taskId: task.id, wasCompleted: true }),
  ];

  const result = resolveLiveTaskStatusFromHistory(task, history, {
    currentDayKey: "2026-06-24",
    dayStartTime: "06:00",
    now: new Date("2026-06-24T12:00:00.000Z"),
    timezone: "America/New_York",
  }, {
    calcNextDueDateFromDate: (candidate, referenceDateKey) => {
      assert.equal(candidate.id, task.id);
      assert.equal(referenceDateKey, "2026-06-24");
      return "2026-07-01";
    },
  });

  assert.equal(result.dueOn, "2026-07-01");
  assert.equal(result.status, "upcoming");
  assert.equal(result.completedAt, null);
});

test("calendar rebases a missed daily recurrence from yesterday's edited completion without advancing twice", () => {
  const task = createTask({
    created_at: "2026-07-01T08:00:00.000Z",
    due_on: "2026-07-10",
    id: "calendar-rebase-daily",
    repeat_frequency: "daily",
    repeat_interval: 4,
    sort_order: 1,
    status: "missed",
    title: "TestDelayNotDue1",
  });
  const history = [
    createHistoryEntry({ entryDate: "2026-07-10", id: "old-missed", status: "missed", taskId: task.id, wasCompleted: false }),
    createHistoryEntry({ entryDate: "2026-07-12", id: "rebase-done", status: "done", taskId: task.id, wasCompleted: true }),
  ];
  const context = {
    currentDayKey: "2026-07-13",
    dayStartTime: "06:00",
    now: new Date("2026-07-13T12:00:00.000Z"),
    timezone: "America/New_York",
  };

  const result = resolveLiveTaskStatusFromHistory(task, history, context, {
    editedHistoryDateKeys: ["2026-07-12"],
  });
  assert.deepEqual(result, { completedAt: null, dueOn: "2026-07-16", status: "upcoming" });
  assert.equal(history.find((entry) => entry.entry_date === "2026-07-10")?.status, "missed");

  const repeatedSave = resolveLiveTaskStatusFromHistory({ ...task, due_on: result.dueOn, status: result.status }, history, context, {
    editedHistoryDateKeys: ["2026-07-12"],
  });
  assert.equal(repeatedSave.dueOn, "2026-07-16");
  assert.equal(repeatedSave.status, "upcoming");
});

test("calendar rebases Did My Best from its edited completion date", () => {
  const task = createTask({
    created_at: "2026-07-01T08:00:00.000Z",
    due_on: "2026-07-10",
    id: "calendar-rebase-best",
    repeat_frequency: "daily",
    repeat_interval: 4,
    sort_order: 1,
    status: "missed",
    title: "Rebase Did My Best",
  });
  const result = resolveLiveTaskStatusFromHistory(task, [
    createHistoryEntry({ entryDate: "2026-07-12", id: "anchor-best", status: "did_my_best", taskId: task.id, wasCompleted: true }),
  ], {
    currentDayKey: "2026-07-13",
    dayStartTime: "06:00",
    now: new Date("2026-07-13T12:00:00.000Z"),
    timezone: "America/New_York",
  }, { editedHistoryDateKeys: ["2026-07-12"] });

  assert.deepEqual(result, { completedAt: null, dueOn: "2026-07-16", status: "upcoming" });
});

test("daily recurring outcomes stay historical while the new occurrence is Pending", () => {
  const context = {
    currentDayKey: "2026-07-17",
    dayStartTime: "06:00",
    now: new Date("2026-07-17T12:00:00.000Z"),
    timezone: "America/New_York",
  };
  const julySixteenthBest = createHistoryEntry({
    entryDate: "2026-07-16",
    id: "july-sixteenth-best",
    status: "did_my_best",
    taskId: "daily-parent",
    wasCompleted: true,
  });
  const completedParent = createTask({
    created_at: "2026-07-01T08:00:00.000Z",
    due_on: "2026-07-16",
    id: "daily-parent",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 1,
    status: "did_my_best",
    title: "Daily parent",
  });

  const rolledForward = resolveLiveTaskStatusFromHistory(completedParent, [julySixteenthBest], context, {
    editedHistoryDateKeys: ["2026-07-16"],
  });
  assert.deepEqual(rolledForward, { completedAt: null, dueOn: "2026-07-17", status: "pending" });
  assert.equal(julySixteenthBest.status, "did_my_best");

  const activeParent = { ...completedParent, due_on: rolledForward.dueOn ?? "2026-07-17", status: rolledForward.status };
  assert.equal(getTaskDisplayStatusWithHistory(activeParent, [julySixteenthBest], context.currentDayKey), "pending");
  assert.equal(getTaskDisplayStatusWithHistory(activeParent, [{ ...julySixteenthBest, id: "july-sixteenth-done", status: "done" }], context.currentDayKey), "pending");
  assert.equal(getTaskDisplayStatusWithHistory({ ...activeParent, due_on: "2026-07-18", status: "upcoming" }, [julySixteenthBest], context.currentDayKey), "upcoming");
  assert.equal(getTaskDisplayStatusWithHistory(activeParent, [
    julySixteenthBest,
    { ...julySixteenthBest, entry_date: "2026-07-17", id: "july-seventeenth-best" },
  ], context.currentDayKey), "did_my_best");

  const activeStep = { ...activeParent, id: "daily-step", parent_task_id: activeParent.id };
  const stepHistory = [{ ...julySixteenthBest, id: "step-july-sixteenth-best", task_id: activeStep.id }];
  assert.equal(getTaskDisplayStatusWithHistory(activeStep, stepHistory, context.currentDayKey), "pending");

  const oneOff = createTask({ due_on: "2026-07-16", id: "one-off", repeat_frequency: "none", status: "done" });
  assert.equal(getTaskDisplayStatusWithHistory(oneOff, [{ ...julySixteenthBest, id: "one-off-done", status: "done", task_id: oneOff.id }], context.currentDayKey), "done");
  assert.equal(getTaskDisplayStatusWithHistory({ ...oneOff, status: "complete" }, [], context.currentDayKey), "complete");
});

test("calendar uses the latest resolving selected date once and ignores non-resolving edits", () => {
  const task = createTask({
    created_at: "2026-07-01T08:00:00.000Z",
    due_on: "2026-07-10",
    id: "calendar-consecutive-anchors",
    repeat_frequency: "daily",
    repeat_interval: 4,
    sort_order: 1,
    status: "missed",
    title: "Calendar rebase selection",
  });
  const context = {
    currentDayKey: "2026-07-13",
    dayStartTime: "06:00",
    now: new Date("2026-07-13T12:00:00.000Z"),
    timezone: "America/New_York",
  };

  const multiSelect = resolveLiveTaskStatusFromHistory(task, [
    createHistoryEntry({ entryDate: "2026-07-10", id: "earlier-done", status: "done", taskId: task.id, wasCompleted: true }),
    createHistoryEntry({ entryDate: "2026-07-12", id: "latest-best", status: "did_my_best", taskId: task.id, wasCompleted: true }),
  ], context, { editedHistoryDateKeys: ["2026-07-10", "2026-07-12"] });
  assert.deepEqual(multiSelect, { completedAt: null, dueOn: "2026-07-16", status: "upcoming" });

  const missedEdit = resolveLiveTaskStatusFromHistory(task, [
    createHistoryEntry({ entryDate: "2026-07-12", id: "later-missed", status: "missed", taskId: task.id, wasCompleted: false }),
  ], context, { editedHistoryDateKeys: ["2026-07-12"] });
  assert.equal(missedEdit.dueOn, undefined);
  assert.equal(missedEdit.status, "missed");
});

test("calendar reconciliation calculates every cadence from the edited completion date", () => {
  const context = {
    currentDayKey: "2026-07-08",
    dayStartTime: "06:00",
    now: new Date("2026-07-08T12:00:00.000Z"),
    timezone: "America/New_York",
  };
  const cases = [
    { dueOn: "2026-07-01", editedOn: "2026-07-05", expectedDueOn: "2026-07-08", name: "daily interval", overrides: { repeat_frequency: "daily" as const, repeat_interval: 3 } },
    { dueOn: "2026-07-06", editedOn: "2026-07-08", expectedDueOn: "2026-07-13", name: "weekly", overrides: { repeat_days_of_week: [1], repeat_frequency: "weekly" as const } },
    { dueOn: "2026-06-30", editedOn: "2026-07-08", expectedDueOn: "2026-08-31", name: "monthly fixed", overrides: { repeat_day_of_month: 31, repeat_frequency: "monthly" as const } },
    { dueOn: "2026-07-07", editedOn: "2026-07-08", expectedDueOn: "2026-08-04", name: "monthly ordinal", overrides: { repeat_frequency: "monthly" as const, repeat_monthly_mode: "ordinal_weekday" as const, repeat_monthly_ordinal: "first" as const, repeat_monthly_weekday: 2 } },
    { dueOn: "2026-07-01", editedOn: "2026-07-05", expectedDueOn: "2026-07-08", name: "custom interval", overrides: { repeat_frequency: "custom" as const, repeat_interval: 3 } },
  ];

  for (const cadence of cases) {
    const task = createTask({
      created_at: "2026-06-01T08:00:00.000Z",
      due_on: cadence.dueOn,
      id: `calendar-${cadence.name}`,
      sort_order: 1,
      status: "missed",
      title: cadence.name,
      ...cadence.overrides,
    });
    const result = resolveLiveTaskStatusFromHistory(task, [
      createHistoryEntry({ entryDate: cadence.editedOn, id: `done-${cadence.name}`, status: "done", taskId: task.id, wasCompleted: true }),
    ], context, { editedHistoryDateKeys: [cadence.editedOn] });
    assert.equal(result.dueOn, cadence.expectedDueOn, cadence.name);
  }
});

test("calendar reconciliation retains existing future due status classification", () => {
  const task = createTask({
    created_at: "2026-07-01T08:00:00.000Z",
    due_on: "2026-07-06",
    id: "calendar-future-status",
    repeat_frequency: "weekly",
    repeat_days_of_week: [1],
    repeat_interval: 1,
    sort_order: 1,
    status: "missed",
    title: "Future status",
  });
  const context = {
    currentDayKey: "2026-07-07",
    dayStartTime: "06:00",
    now: new Date("2026-07-07T12:00:00.000Z"),
    timezone: "America/New_York",
  };
  const upcoming = resolveLiveTaskStatusFromHistory(task, [
    createHistoryEntry({ entryDate: "2026-07-06", id: "future-upcoming", status: "done", taskId: task.id, wasCompleted: true }),
  ], context, { editedHistoryDateKeys: ["2026-07-06"] });
  assert.deepEqual(upcoming, { completedAt: null, dueOn: "2026-07-13", status: "upcoming" });

  const notDue = resolveLiveTaskStatusFromHistory({ ...task, repeat_interval: 2 }, [
    createHistoryEntry({ entryDate: "2026-07-06", id: "future-not-due", status: "done", taskId: task.id, wasCompleted: true }),
  ], context, { editedHistoryDateKeys: ["2026-07-06"] });
  assert.deepEqual(notDue, { completedAt: null, dueOn: "2026-07-20", status: "not_due" });
});

test("calendar rebase resolves due-today, overdue, and trajectory states from the edited completion", () => {
  const task = createTask({
    created_at: "2026-07-01T08:00:00.000Z",
    due_on: "2026-07-10",
    id: "calendar-rebase-statuses",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 1,
    status: "missed",
    title: "Calendar rebase statuses",
  });
  const doneOnTwelfth = [
    createHistoryEntry({ entryDate: "2026-07-10", id: "preserved-missed", status: "missed", taskId: task.id, wasCompleted: false }),
    createHistoryEntry({ entryDate: "2026-07-12", id: "rebase-status-done", status: "done", taskId: task.id, wasCompleted: true }),
  ];
  const pending = resolveLiveTaskStatusFromHistory(task, doneOnTwelfth, {
    currentDayKey: "2026-07-13",
    dayStartTime: "06:00",
    now: new Date("2026-07-13T12:00:00.000Z"),
    timezone: "America/New_York",
  }, { editedHistoryDateKeys: ["2026-07-12"] });
  assert.deepEqual(pending, { completedAt: null, dueOn: "2026-07-13", status: "pending" });

  const overdue = resolveLiveTaskStatusFromHistory(task, doneOnTwelfth, {
    currentDayKey: "2026-07-14",
    dayStartTime: "06:00",
    now: new Date("2026-07-14T12:00:00.000Z"),
    timezone: "America/New_York",
  }, { editedHistoryDateKeys: ["2026-07-12"] });
  assert.deepEqual(overdue, { completedAt: null, dueOn: "2026-07-13", status: "missed" });

  const rebasedTask = { ...task, due_on: "2026-07-16", repeat_interval: 4, status: "upcoming" as const };
  const dueDates = buildTaskHistoryCalendarDueDateSet(rebasedTask, "2026-07-10", "2026-07-16", "2026-07-13", doneOnTwelfth);
  assert.equal(dueDates.has("2026-07-13"), false);
  assert.equal(dueDates.has("2026-07-14"), false);
  assert.equal(dueDates.has("2026-07-15"), false);
  assert.equal(dueDates.has("2026-07-16"), true);
  assert.equal(getTaskHistoryCalendarVirtualState({ dateKey: "2026-07-13", hasHistoryEntry: false, isDue: false, nextDueDateKey: "2026-07-16", todayDateKey: "2026-07-13" }), "upcoming");
});

test("future-due recurring live status ignores today history facts", () => {
  const task = createTask({
    created_at: "2026-06-01T08:00:00.000Z",
    due_on: "2026-06-25",
    id: "future-due-history-task",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 1,
    status: "missed",
    title: "Future due history task",
  });
  const history = [
    createHistoryEntry({ entryDate: "2026-06-24", id: "missed-today", status: "missed", taskId: task.id, wasCompleted: false }),
  ];

  const result = resolveLiveTaskStatusFromHistory(task, history, {
    currentDayKey: "2026-06-24",
    dayStartTime: "06:00",
    now: new Date("2026-06-24T12:00:00.000Z"),
    timezone: "America/New_York",
  });

  assert.equal(result.dueOn, undefined);
  assert.equal(result.status, "upcoming");
  assert.equal(result.completedAt, null);
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

test("focus filter facts use today for one-off current occurrence and ignore stale raw missed state", () => {
  const oneOffTask = createTask({
    created_at: "2026-06-01T08:00:00.000Z",
    due_on: "2026-06-20",
    id: "focus-one-off",
    repeat_frequency: "none",
    sort_order: 1,
    status: "missed",
    title: "One-off focus task",
  });

  const staleFacts = getTaskFocusFilterFacts(oneOffTask, [
    createHistoryEntry({
      entryDate: "2026-06-20",
      id: "focus-stale-missed",
      status: "missed",
      taskId: oneOffTask.id,
      wasCompleted: false,
    }),
  ], "2026-06-25");

  assert.equal(staleFacts.currentOccurrenceDateKey, "2026-06-25");
  assert.equal(staleFacts.handledToday, false);
  assert.equal(staleFacts.missedToday, false);

  const handledTodayFacts = getTaskFocusFilterFacts(oneOffTask, [
    createHistoryEntry({
      entryDate: "2026-06-25",
      id: "focus-done-today",
      status: "done",
      taskId: oneOffTask.id,
      wasCompleted: true,
    }),
  ], "2026-06-25");

  assert.equal(handledTodayFacts.currentOccurrenceDateKey, "2026-06-25");
  assert.equal(handledTodayFacts.currentOccurrenceStatus, "done");
  assert.equal(handledTodayFacts.handledToday, true);
  assert.equal(handledTodayFacts.missedToday, false);
});
