import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { Task, TaskHistory, TaskStatus } from "../src/lib/database.types.ts";
import {
  buildDerivedMissedOccurrenceKey,
  deriveTaskStatusAuthority,
  isDerivedMissedHistoryEntry,
  reconcileChronologicalTaskHistory,
} from "../src/lib/task-active-status.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import { getTaskDisplayStatusWithHistory } from "../src/lib/task-cockpit.ts";
import {
  getTaskFocusFilterFacts,
  getTaskHistoryCalendarVirtualState,
} from "../src/lib/task-history.ts";
import { getLogicalDayKey } from "../src/lib/logical-day.ts";

function history(taskId: string, entryDate: string, status: TaskStatus, id = `${taskId}:${entryDate}:${status}`): TaskHistory {
  return {
    counted_as_due_occurrence: false,
    created_at: `${entryDate}T12:00:00.000Z`,
    entry_date: entryDate,
    event_type: status === "complete" ? "completed_permanently" : "status",
    id,
    occurrence_due_on: null,
    occurrence_key: null,
    status,
    task_id: taskId,
    updated_at: `${entryDate}T12:00:00.000Z`,
    user_id: "test-user",
    was_completed: status === "done" || status === "did_my_best" || status === "complete",
  };
}

function overdueTask(overrides: Partial<Task> = {}) {
  return createTask({
    created_at: "2026-07-01T09:00:00.000Z",
    due_on: "2026-07-28",
    id: "continuous-overdue",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 1,
    status: "missed",
    title: "Continuous overdue",
    ...overrides,
  });
}

test("July 28-30 continuous overdue freezes active status and due date while Calendar stays Pending", () => {
  const task = overdueTask();
  const july29 = deriveTaskStatusAuthority(task, [], "2026-07-29");
  assert.equal(july29.activeStatus, "missed");
  assert.equal(july29.calendarOccurrenceStatus, "pending");
  assert.equal(july29.handledCurrentDay, false);
  assert.equal(july29.continuousOverdue, true);
  assert.equal(july29.dueOn, "2026-07-28");
  assert.deepEqual(july29.generatedMissedDateKeys, ["2026-07-28"]);

  const july28Missed = history(task.id, "2026-07-28", "missed");
  const july30 = deriveTaskStatusAuthority(task, [july28Missed], "2026-07-30");
  assert.equal(july30.activeStatus, "missed");
  assert.equal(july30.calendarOccurrenceStatus, "pending");
  assert.equal(july30.dueOn, "2026-07-28");
  assert.deepEqual(july30.generatedMissedDateKeys, ["2026-07-29"]);

  const staleRolledRow = { ...task, due_on: "2026-07-29", status: "pending" as const };
  const recovered = deriveTaskStatusAuthority(staleRolledRow, [july28Missed], "2026-07-29");
  assert.equal(recovered.activeStatus, "missed");
  assert.equal(recovered.dueOn, "2026-07-28");
});

test("manual current-day Missed is handled, overrides virtual Pending, and never changes due_on", () => {
  const task = overdueTask();
  const authority = deriveTaskStatusAuthority(task, [history(task.id, "2026-07-29", "missed")], "2026-07-29");
  assert.equal(authority.activeStatus, "missed");
  assert.equal(authority.calendarOccurrenceStatus, "missed");
  assert.equal(authority.handledCurrentDay, true);
  assert.equal(authority.dueOn, "2026-07-28");
});

test("one-off and every supported recurrence cadence become daily once overdue", () => {
  const variants = [
    overdueTask({ id: "one-off", repeat_frequency: "none" }),
    overdueTask({ id: "every-three", repeat_frequency: "daily", repeat_interval: 3 }),
    overdueTask({ id: "weekdays", repeat_frequency: "weekdays" }),
    overdueTask({ id: "weekly", repeat_days_of_week: [2], repeat_frequency: "weekly" }),
    overdueTask({ id: "monthly-fixed", repeat_day_of_month: 28, repeat_frequency: "monthly" }),
    overdueTask({
      id: "monthly-ordinal",
      repeat_frequency: "monthly",
      repeat_monthly_mode: "ordinal_weekday",
      repeat_monthly_ordinal: "fourth",
      repeat_monthly_weekday: 2,
    }),
    overdueTask({ id: "custom", repeat_frequency: "custom", repeat_interval: 5 }),
  ];

  for (const task of variants) {
    const authority = deriveTaskStatusAuthority(task, [], "2026-07-31");
    assert.deepEqual(authority.generatedMissedDateKeys, [
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
    ], task.id);
    assert.equal(authority.dueOn, "2026-07-28", task.id);
    assert.equal(authority.activeStatus, "missed", task.id);
  }
});

test("Done and Did My Best rebase from the actual action date; early completion remains occurrence-aware", () => {
  for (const status of ["done", "did_my_best"] as const) {
    const task = overdueTask({ id: `success-${status}`, repeat_interval: 3 });
    const authority = deriveTaskStatusAuthority(task, [history(task.id, "2026-07-30", status)], "2026-07-30");
    assert.equal(authority.nextDueAfterSuccess, "2026-08-02");
    assert.equal(authority.dueOn, "2026-08-02");
    assert.equal(authority.continuousOverdue, false);
  }

  const earlyTask = overdueTask({
    active_occurrence_due_on: "2026-08-04",
    due_on: "2026-08-04",
    id: "early-success",
    repeat_interval: 3,
    status: "done",
  });
  const early = {
    ...history(earlyTask.id, "2026-08-03", "done"),
    occurrence_due_on: "2026-08-04",
    occurrence_key: "occurrence:2026-08-04",
  };
  assert.equal(deriveTaskStatusAuthority(earlyTask, [early], "2026-08-03").dueOn, "2026-08-06");
});

test("Complete terminates recurrence and counts as handled; Pending does not", () => {
  const task = overdueTask();
  const pending = deriveTaskStatusAuthority(task, [], "2026-07-29");
  assert.equal(pending.handledCurrentDay, false);
  const complete = deriveTaskStatusAuthority(task, [history(task.id, "2026-07-29", "complete")], "2026-07-29");
  assert.equal(complete.activeStatus, "complete");
  assert.equal(complete.calendarOccurrenceStatus, "complete");
  assert.equal(complete.handledCurrentDay, true);
  assert.equal(complete.dueOn, null);
  assert.equal(complete.finished, true);
});

test("today smart-list facts use only the actual current logical-day History row", () => {
  const task = overdueTask();
  const stale = getTaskFocusFilterFacts(task, [history(task.id, "2026-07-28", "missed")], "2026-07-29");
  assert.equal(stale.missedToday, false);
  assert.equal(stale.handledToday, false);
  const today = getTaskFocusFilterFacts(task, [history(task.id, "2026-07-29", "missed")], "2026-07-29");
  assert.equal(today.missedToday, true);
  assert.equal(today.handledToday, true);
  const complete = getTaskFocusFilterFacts(task, [history(task.id, "2026-07-29", "complete")], "2026-07-29");
  assert.equal(complete.handledToday, true);
});

test("explicit History overrides virtual Calendar state and current virtual due is Pending", () => {
  assert.equal(getTaskHistoryCalendarVirtualState({
    dateKey: "2026-07-29",
    hasHistoryEntry: false,
    isDue: true,
    nextDueDateKey: "2026-07-29",
    todayDateKey: "2026-07-29",
  }), "pending");
  assert.equal(getTaskHistoryCalendarVirtualState({
    dateKey: "2026-07-29",
    hasHistoryEntry: true,
    isDue: true,
    nextDueDateKey: "2026-07-29",
    todayDateKey: "2026-07-29",
  }), null);
});

test("derived Missed rows are identifiable for stale timeline cleanup without treating manual Missed as derived", () => {
  const generated = {
    ...history("derived-task", "2026-07-28", "missed"),
    occurrence_key: buildDerivedMissedOccurrenceKey("2026-07-28"),
  };
  assert.equal(isDerivedMissedHistoryEntry(generated), true);
  assert.equal(isDerivedMissedHistoryEntry(history("manual-task", "2026-07-28", "missed")), false);

  const rewardSource = readFileSync("src/hooks/useTaskRewardController.ts", "utf8");
  const historySource = readFileSync("src/hooks/useTaskHistoryActions.ts", "utf8");
  assert.match(rewardSource, /staleDerivedIds[\s\S]*\.delete\(\)[\s\S]*\.in\("id", staleDerivedIds\)/);
  assert.match(historySource, /staleDerivedIds[\s\S]*\.delete\(\)[\s\S]*\.in\("id", staleDerivedIds\)/);
});

test("05:59 keeps the prior logical day; 06:00 rolls it to completed-day Missed", () => {
  const settings = { dayStartTime: "06:00", timezone: "America/New_York" };
  const before = getLogicalDayKey(new Date("2026-07-30T09:59:00.000Z"), settings);
  const after = getLogicalDayKey(new Date("2026-07-30T10:00:00.000Z"), settings);
  assert.equal(before, "2026-07-29");
  assert.equal(after, "2026-07-30");
  assert.deepEqual(deriveTaskStatusAuthority(overdueTask(), [], before).generatedMissedDateKeys, ["2026-07-28"]);
  assert.deepEqual(deriveTaskStatusAuthority(overdueTask(), [], after).generatedMissedDateKeys, ["2026-07-28", "2026-07-29"]);
});

test("replay is idempotent and same-logical-day In Progress remains valid", () => {
  const task = overdueTask();
  const first = reconcileChronologicalTaskHistory(task, [], "2026-07-30");
  const saved = first.generatedMissedDateKeys.map((dateKey) => history(task.id, dateKey, "missed"));
  assert.deepEqual(reconcileChronologicalTaskHistory(task, saved, "2026-07-30").generatedMissedDateKeys, []);

  const inProgress = overdueTask({
    active_status_logical_date: "2026-07-30",
    id: "overdue-in-progress",
    status: "in_progress",
  });
  assert.equal(deriveTaskStatusAuthority(inProgress, [], "2026-07-30").activeStatus, "in_progress");
});

test("stale prior-logical-day In Progress derives Did My Best and recurrence rebase, never Missed", () => {
  const recurring = overdueTask({
    active_occurrence_due_on: "2026-07-28",
    active_status_logical_date: "2026-07-29",
    id: "stale-recurring-in-progress",
    repeat_interval: 3,
    status: "in_progress",
  });
  const recurringAuthority = deriveTaskStatusAuthority(recurring, [], "2026-07-30");
  assert.equal(recurringAuthority.activeStatus, "upcoming");
  assert.equal(recurringAuthority.dueOn, "2026-08-01");
  assert.deepEqual(recurringAuthority.generatedMissedDateKeys, ["2026-07-28"]);
  assert.deepEqual(recurringAuthority.rolloverResolution, {
    dateKey: "2026-07-29",
    nextDueOn: "2026-08-01",
    status: "did_my_best",
  });
  const conflictingMissed = deriveTaskStatusAuthority(
    recurring,
    [history(recurring.id, "2026-07-29", "missed")],
    "2026-07-30",
  );
  assert.equal(conflictingMissed.activeStatus, "upcoming");
  assert.equal(conflictingMissed.activeStatus === "missed", false);

  const oneOff = overdueTask({
    active_status_logical_date: "2026-07-29",
    id: "stale-one-off-in-progress",
    repeat_frequency: "none",
    status: "in_progress",
  });
  const oneOffAuthority = deriveTaskStatusAuthority(oneOff, [], "2026-07-30");
  assert.equal(oneOffAuthority.activeStatus, "did_my_best");
  assert.equal(oneOffAuthority.dueOn, null);
  assert.equal(oneOffAuthority.activeStatus === "missed", false);
});

test("Table, List, Home, editor, buckets, and overdue filters share the authority projection", () => {
  const task = overdueTask({ status: "pending" });
  assert.equal(getTaskDisplayStatusWithHistory(task, [], "2026-07-30"), "missed");
  const derivedSource = readFileSync("src/lib/task-app-derived.ts", "utf8");
  const appSource = readFileSync("src/components/task-app.tsx", "utf8");
  assert.match(derivedSource, /const tasks = sourceTasks\.map[\s\S]*getTaskDisplayStatusWithHistory/);
  assert.match(derivedSource, /filteredTasksSorted[\s\S]*selectedTaskForEditor/);
  assert.match(appSource, /const taskSurfaceTasks = useMemo[\s\S]*taskDisplayStatusByTaskId/);
  assert.match(appSource, /<TaskHomePage[\s\S]*tasks=\{taskSurfaceTasks\}/);
});
