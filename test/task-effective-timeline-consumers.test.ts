import assert from "node:assert/strict";
import test from "node:test";

import { createTask } from "../src/lib/task-buckets.ts";
import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import {
  adaptLegacyTaskState,
  evaluateTaskState,
  resolveTaskHistoryCalendarRead,
  resolveTaskHistoryCalendarStates,
} from "../src/lib/task-state-engine/index.ts";
import {
  buildTaskHistoryStreakSummary,
  TASK_HISTORY_STREAK_SUMMARY_COLUMNS,
} from "../src/lib/task-history-streak-summaries.ts";

const TASK_ID = "task-effective-timeline-consumer";
const CONTEXT = {
  logicalDayRollover: "00:00",
  now: "2026-08-10T12:00:00.000Z",
  timezone: "UTC",
} as const;

function task(overrides: Partial<Task> = {}) {
  return createTask({
    created_at: "2026-08-01T12:00:00.000Z",
    due_on: "2026-08-01",
    id: TASK_ID,
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 0,
    status: "pending",
    title: "Effective Timeline consumer",
    ...overrides,
  });
}

function history(
  entryDate: string,
  status: TaskHistory["status"],
  overrides: Partial<TaskHistory> = {},
): TaskHistory {
  return {
    counted_as_due_occurrence: true,
    created_at: `${entryDate}T12:00:00.000Z`,
    entry_date: entryDate,
    event_type: "status",
    id: `history-${entryDate}-${status}`,
    occurrence_due_on: "2026-08-01",
    occurrence_key: `task:${TASK_ID}:occurrence:2026-08-01`,
    status,
    task_id: TASK_ID,
    updated_at: `${entryDate}T12:00:00.000Z`,
    user_id: "test-user",
    was_completed: status === "done" || status === "did_my_best" || status === "complete",
    ...overrides,
  };
}

function calendarInput(nextTask: Task, nextHistory: TaskHistory[] = [], range = true) {
  return {
    ...CONTEXT,
    ...(range ? { calendarEnd: "2026-08-10", calendarStart: "2026-08-01" } : {}),
    history: nextHistory,
    task: nextTask,
  };
}

test("Daily Calendar projection preserves future Effective Timeline Due dates", () => {
  const result = resolveTaskHistoryCalendarRead({
    ...calendarInput(task({
      due_on: "2026-08-10",
      active_occurrence_due_on: "2026-08-10",
    })),
    now: "2026-08-07T12:00:00.000Z",
    calendarStart: "2026-08-10",
    calendarEnd: "2026-08-14",
  });

  assert.equal(result?.authority, "effective_timeline");
  for (const date of ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"]) {
    assert.equal(result?.states[date], "due", date);
  }
});

test("Calendar read shows calculated Missed without History mutation", () => {
  const nextTask = task();
  const nextHistory: TaskHistory[] = [];
  const historyBefore = structuredClone(nextHistory);
  const result = resolveTaskHistoryCalendarRead(calendarInput(nextTask, nextHistory));

  assert.equal(result?.authority, "effective_timeline");
  for (const date of ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"]) {
    assert.equal(result?.states[date], "missed", date);
  }
  assert.equal(result?.states["2026-08-10"], "open");
  assert.equal(result?.timeline?.currentMissedStreak, 9);
  assert.equal(result?.timeline?.unresolvedDueOn, "2026-08-01");
  assert.deepEqual(nextHistory, historyBefore);
  assert.equal(result?.timeline?.days["2026-08-01"]?.historyRowId, null);
});

test("Calendar explicit Done splits calculated Missed", () => {
  const result = resolveTaskHistoryCalendarRead(calendarInput(task(), [history("2026-08-05", "done")]));

  for (const date of ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"]) {
    assert.equal(result?.states[date], "missed", date);
  }
  assert.equal(result?.states["2026-08-05"], "done");
  assert.equal(result?.states["2026-08-10"], "open");
  assert.equal(result?.timeline?.currentMissedStreak, 4);
});

test("Calendar read preserves stale Done metadata while using the current schedule anchor", () => {
  const nextTask = task({ active_occurrence_due_on: "2026-08-01" });
  const done = history("2026-08-06", "done", {
    occurrence_due_on: "2026-08-10",
    occurrence_key: `task:${TASK_ID}:occurrence:2026-08-10`,
  });
  const nextHistory = [done];
  const historyBefore = structuredClone(nextHistory);
  const result = resolveTaskHistoryCalendarRead({
    ...calendarInput(nextTask, nextHistory),
    now: "2026-08-06T12:00:00.000Z",
    calendarEnd: "2026-08-08",
  });

  assert.equal(result?.authority, "effective_timeline");
  for (const date of ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05"]) {
    assert.equal(result?.states[date], "missed", date);
    assert.equal(result?.timeline?.days[date]?.occurrenceDueOn, "2026-08-01", date);
  }
  assert.equal(result?.states["2026-08-06"], "done");
  assert.equal(result?.states["2026-08-07"], "due");
  assert.equal(result?.timeline?.days["2026-08-06"]?.occurrenceDueOn, "2026-08-10");
  assert.equal(result?.timeline?.days["2026-08-06"]?.occurrenceIdentity, done.occurrence_key);
  assert.deepEqual(nextHistory, historyBefore);
});

test("Calendar state compatibility wrapper uses the Calendar read result", () => {
  const nextTask = task();
  const nextHistory = [history("2026-08-05", "done")];
  const input = calendarInput(nextTask, nextHistory);
  const read = resolveTaskHistoryCalendarRead(input);
  const states = resolveTaskHistoryCalendarStates(input);

  assert.deepEqual(states, read?.states);
  assert.equal(states?.["2026-08-01"], "missed");

  const futureTask = task({ due_on: "2026-08-12", id: `${TASK_ID}-future` });
  const futureRead = resolveTaskHistoryCalendarRead(calendarInput(futureTask, [], false));
  assert.equal(futureRead?.states["2026-08-12"], "due");
  assert.equal(futureRead?.states["2026-08-10"], "not_due");
});

test("archived Calendar reads retain the existing engine fallback", () => {
  const archivedTask = task({ status: "archived" });
  const input = calendarInput(archivedTask);
  const result = resolveTaskHistoryCalendarRead(input);
  const adapted = adaptLegacyTaskState(archivedTask, [], CONTEXT);
  const engineCalendar = evaluateTaskState({
    ...adapted.engineInput,
    calendarEnd: "2026-08-10",
    calendarStart: "2026-08-01",
  }).calendar;
  const expected = Object.fromEntries(Object.entries(engineCalendar).map(([date, state]) => [
    date,
    state === "scheduled" ? "due" : state === "no_entry" ? "not_due" : state,
  ]));

  assert.equal(result?.authority, "engine_fallback");
  assert.equal(result?.timeline, null);
  assert.deepEqual(result?.states, expected);
});

test("summary uses the Effective Timeline for a backdated daily task", () => {
  const summary = buildTaskHistoryStreakSummary(task(), [], "2026-08-10");

  assert.equal(summary.missedStreak, 9);
});

test("summary Done keeps saved-History metadata while splitting missed streak", () => {
  const done = history("2026-08-05", "done");
  const summary = buildTaskHistoryStreakSummary(task(), [done], "2026-08-10");

  assert.equal(summary.missedStreak, 4);
  assert.equal(summary.lastDoneDate, "2026-08-05");
  assert.equal(summary.lastDoneAt, done.updated_at);
  assert.equal(summary.currentStreak, 0);
});

test("summary resets the current Missed streak after Done today", () => {
  const doneBefore = history("2026-08-03", "done");
  const doneToday = history("2026-08-06", "done", {
    occurrence_due_on: "2026-08-04",
    occurrence_key: `task:${TASK_ID}:occurrence:2026-08-04`,
  });
  const summary = buildTaskHistoryStreakSummary(task(), [doneBefore, doneToday], "2026-08-06");

  assert.equal(summary.missedStreak, 0);
});

test("Test V5 shared summary uses the Effective Timeline completion streak", () => {
  const doneBefore = history("2026-08-03", "done");
  const doneToday = history("2026-08-06", "done", {
    occurrence_due_on: "2026-08-04",
    occurrence_key: `task:${TASK_ID}:occurrence:2026-08-04`,
  });
  const historyRows = [doneBefore, doneToday];
  const historyBefore = structuredClone(historyRows);
  const summary = buildTaskHistoryStreakSummary(task(), historyRows, "2026-08-06");

  assert.equal(summary.currentStreak, 1);
  assert.equal(summary.missedStreak, 0);
  assert.equal(summary.lastDoneDate, "2026-08-06");
  assert.equal(summary.lastDoneAt, doneToday.updated_at);
  assert.deepEqual(historyRows, historyBefore);
});

test("interval shared summary preserves completion streak across Not Due gaps", () => {
  const nextTask = task({
    due_on: "2026-08-01",
    active_occurrence_due_on: "2026-08-01",
    repeat_interval: 3,
  });
  const historyRows = [
    history("2026-08-01", "done"),
    history("2026-08-04", "done", {
      occurrence_due_on: "2026-08-04",
      occurrence_key: `task:${TASK_ID}:occurrence:2026-08-04`,
    }),
    history("2026-08-07", "done", {
      occurrence_due_on: "2026-08-07",
      occurrence_key: `task:${TASK_ID}:occurrence:2026-08-07`,
    }),
  ];
  const summary = buildTaskHistoryStreakSummary(nextTask, historyRows, "2026-08-07");

  assert.equal(summary.currentStreak, 3);
  assert.equal(summary.missedStreak, 0);
});

test("shared summary keeps current positive and Missed streaks mutually exclusive", () => {
  const summary = buildTaskHistoryStreakSummary(task(), [], "2026-08-06");

  assert.equal(summary.currentStreak, 0);
  assert.ok(summary.missedStreak > 0);
});

test("summary restores the saved positive streak when Effective Timeline has no misses", () => {
  const done = history("2026-08-10", "done", {
    occurrence_due_on: "2026-08-10",
    occurrence_key: `task:${TASK_ID}:occurrence:2026-08-10`,
  });
  const summary = buildTaskHistoryStreakSummary(task({ due_on: "2026-08-10" }), [done], "2026-08-10");

  assert.equal(summary.currentStreak, 1);
  assert.equal(summary.missedStreak, 0);
  assert.equal(summary.lastDoneDate, "2026-08-10");
});

test("summary uses Effective Timeline cadence for every-three-days tasks", () => {
  const nextTask = task({ repeat_interval: 3 });
  const done = history("2026-08-01", "done");
  const summary = buildTaskHistoryStreakSummary(nextTask, [done], "2026-08-10");

  assert.equal(summary.missedStreak, 6);
});

test("archived summary retains the saved-History missed streak", () => {
  const archivedTask = task({ status: "archived" });
  const summary = buildTaskHistoryStreakSummary(archivedTask, [history("2026-08-10", "missed", { occurrence_due_on: "2026-08-10" })], "2026-08-10");

  assert.equal(summary.missedStreak, 1);
});

test("compact streak query includes Effective Timeline occurrence fields", () => {
  for (const column of ["occurrence_key", "occurrence_due_on", "event_type", "counted_as_due_occurrence"]) {
    assert.ok(TASK_HISTORY_STREAK_SUMMARY_COLUMNS.split(",").includes(column), column);
  }
});
