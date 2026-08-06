import assert from "node:assert/strict";
import test from "node:test";

import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import { getTaskDisplayStatusWithHistory } from "../src/lib/task-cockpit.ts";
import { evaluateTaskActionAuthority, evaluateTaskScheduleAuthority, stripStatusFromScheduleIntent } from "../src/lib/task-state-engine/action-authority.ts";
import { resolveTaskHistoryCalendarActionStatuses, resolveTaskHistoryCalendarStates } from "../src/lib/task-state-engine/calendar-authority.ts";
import { buildManualDueDateTaskUpdate } from "../src/lib/task-state-engine/due-date-authority.ts";
import { createEngineRolloverPlan } from "../src/lib/task-state-engine/rollover-authority.ts";
import { resolveActiveTaskStatuses } from "../src/lib/task-state-engine/read-authority.ts";

function task(overrides: Partial<Task> = {}): Task {
  return {
    active_occurrence_due_on: null, active_status_logical_date: null, actual_seconds: 0,
    completed_at: null, created_at: "2026-07-01T12:00:00.000Z", due_on: "2026-07-30", due_time: null,
    energy: "medium", estimated_minutes: null, external_link_label: null, external_link_url: null,
    id: "task-1", is_important: false, is_urgent: false, notes: null, one_step_at_a_time: false,
    parent_task_id: null, pin_order: null, pinned_at: null, priority: "normal", repeat_day_of_month: null,
    repeat_days_of_week: [], repeat_frequency: "daily", repeat_interval: 1, repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null, repeat_monthly_weekday: null, revision: 1, scheduled_on: null, sort_order: 0,
    status: "pending", subtasks_auto_reset: false, tags: [], title: "Integration", trashed_at: null,
    updated_at: "2026-07-01T12:00:00.000Z", user_id: "user-1", ...overrides,
  };
}

function history(status: TaskHistory["status"], entry_date = "2026-07-30"): TaskHistory {
  return {
    counted_as_due_occurrence: true, created_at: `${entry_date}T12:00:00.000Z`, entry_date,
    event_type: "status", id: `history-${entry_date}`, occurrence_due_on: entry_date,
    occurrence_key: `occurrence:${entry_date}`, status, task_id: "task-1", updated_at: `${entry_date}T12:00:00.000Z`,
    user_id: "user-1", was_completed: status === "done" || status === "did_my_best" || status === "complete",
  };
}

const context = { logicalDayRollover: "06:00", now: "2026-07-31T14:00:00.000Z", timezone: "America/New_York" };

test("due-date-only change derives future status without promoting ambiguous old Missed History", () => {
  const originalTask = task({
    active_status_logical_date: null,
    active_occurrence_due_on: null,
    due_on: "2026-08-06",
    id: "task-1",
    repeat_frequency: "daily",
    status: "missed",
  });
  const historyRows = [
    history("missed", "2026-08-03"),
    { ...history("missed", "2026-08-04"), id: "history-2026-08-04" },
    { ...history("done", "2026-08-05"), id: "history-2026-08-05" },
  ];
  const historySnapshot = JSON.stringify(historyRows);
  const dueDateOnlyIntent = stripStatusFromScheduleIntent({ due_on: "2026-08-30", status: "missed" });
  assert.equal(Object.hasOwn(dueDateOnlyIntent, "status"), false);

  const authority = evaluateTaskScheduleAuthority({
    history: historyRows,
    logicalDayRollover: "06:00",
    now: "2026-08-05T14:00:00.000Z",
    proposedTask: { ...originalTask, ...dueDateOnlyIntent },
    task: originalTask,
    timezone: "America/New_York",
  });

  assert.equal(authority?.activeStatus, "not_due");
  assert.equal(authority?.unresolvedOccurrenceIdentity, null);
  assert.equal(authority?.unresolvedOccurrenceDueOn, null);
  assert.equal(authority?.mutationPlan.taskUpdate.due_on, "2026-08-30");
  assert.notEqual(authority?.mutationPlan.taskUpdate.status, "missed");
  assert.equal(authority?.mutationPlan.taskUpdate.status, "not_due");
  assert.deepEqual(authority?.mutationPlan.historyInserts, []);
  assert.deepEqual(authority?.proposedHistoryChanges, []);
  assert.equal(JSON.stringify(historyRows), historySnapshot);
  assert.deepEqual(historyRows.map((row) => [row.entry_date, row.status]), [
    ["2026-08-03", "missed"],
    ["2026-08-04", "missed"],
    ["2026-08-05", "done"],
  ]);
});

test("moving a future task back to today uses Pending when no current active Missed exists", () => {
  const futureTask = task({
    due_on: "2026-08-30",
    status: "not_due",
  });
  const authority = evaluateTaskScheduleAuthority({
    history: [history("missed", "2026-08-03")],
    logicalDayRollover: "06:00",
    now: "2026-08-05T14:00:00.000Z",
    proposedTask: { ...futureTask, due_on: "2026-08-05" },
    task: futureTask,
    timezone: "America/New_York",
  });

  assert.equal(authority?.activeStatus, "pending");
  assert.equal(authority?.mutationPlan.taskUpdate.status, "pending");
  assert.equal(authority?.mutationPlan.historyInserts.length, 0);
});

test("a concrete active Missed occurrence remains Missed through a schedule edit", () => {
  const activeTask = task({
    active_occurrence_due_on: "2026-08-04",
    active_status_logical_date: "2026-08-04",
    due_on: "2026-08-04",
    status: "missed",
  });
  const authority = evaluateTaskScheduleAuthority({
    history: [{ ...history("missed", "2026-08-04"), id: "history-active-missed" }],
    logicalDayRollover: "06:00",
    now: "2026-08-05T14:00:00.000Z",
    proposedTask: { ...activeTask, due_on: "2026-08-06" },
    task: activeTask,
    timezone: "America/New_York",
  });

  assert.equal(authority?.activeStatus, "missed");
  assert.equal(authority?.mutationPlan.taskUpdate.status, "missed");
  assert.equal(authority?.mutationPlan.historyInserts.length, 0);
});

test("explicit Missed status actions still carry status intent and History", () => {
  const action = evaluateTaskActionAuthority({
    history: [],
    logicalDayRollover: "06:00",
    now: "2026-08-05T14:00:00.000Z",
    outcome: "missed",
    outcomeDate: "2026-08-05",
    task: task({ due_on: "2026-08-05", status: "pending" }),
    timezone: "America/New_York",
  });

  assert.equal(action?.mutationPlan.taskUpdate.status, "missed");
  assert.deepEqual(action?.mutationPlan.historyInserts.map((row) => [row.entry_date, row.status]), [["2026-08-05", "missed"]]);
});

test("Calendar authority gives explicit History precedence over virtual states", () => {
  const states = resolveTaskHistoryCalendarStates({ ...context, history: [history("did_my_best")], task: task() });
  assert.equal(states?.["2026-07-30"], "did_my_best");
  assert.equal(states?.["2026-07-31"], "open");
});

test("Weekdays future preview, historical due state, and Calendar Missed eligibility agree", () => {
  const weekdays = task({
    due_on: "2026-08-05",
    repeat_days_of_week: [1, 2, 3, 4, 5],
    repeat_frequency: "weekly",
    repeat_interval: 1,
    status: "upcoming",
  });
  const weekdaysContext = {
    calendarEnd: "2026-08-09",
    calendarStart: "2026-08-01",
    logicalDayRollover: "06:00",
    now: "2026-08-04T14:00:00.000Z",
    timezone: "America/New_York",
  };
  const states = resolveTaskHistoryCalendarStates({ ...weekdaysContext, history: [], task: weekdays });

  for (const dateKey of ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"]) {
    assert.equal(states?.[dateKey], "due", dateKey);
  }
  for (const dateKey of ["2026-08-01", "2026-08-02", "2026-08-08", "2026-08-09"]) {
    assert.equal(states?.[dateKey], "not_due", dateKey);
  }

  const statuses = resolveTaskHistoryCalendarActionStatuses({
    ...weekdaysContext,
    history: [],
    logicalDate: "2026-08-03",
    task: weekdays,
  });
  assert.deepEqual(statuses, ["done", "did_my_best", "delayed", "missed", "complete"]);
  assert.equal(statuses.includes("missed"), true);
  const missedAction = evaluateTaskActionAuthority({
    ...weekdaysContext,
    history: [],
    outcome: "missed",
    outcomeDate: "2026-08-03",
    task: weekdays,
  });
  assert.deepEqual(missedAction?.validationErrors, []);
  assert.deepEqual(missedAction?.mutationPlan.history.map((row) => [row.logicalDate, row.outcome]), [["2026-08-03", "missed"]]);
});

test("manual future anchors project rolling, weekly, monthly, and custom cadences from the selected date", () => {
  const dailyHistory = [history("did_my_best", "2026-08-01")];
  const daily = task({ due_on: "2026-08-08", repeat_frequency: "daily", status: "upcoming" });
  const dailyStates = resolveTaskHistoryCalendarStates({
    calendarEnd: "2026-08-11",
    calendarStart: "2026-08-01",
    ...context,
    history: dailyHistory,
    now: "2026-08-05T14:00:00.000Z",
    task: daily,
  });
  assert.equal(dailyStates?.["2026-08-01"], "did_my_best");
  for (const dateKey of ["2026-08-05", "2026-08-06", "2026-08-07"]) {
    assert.equal(dailyStates?.[dateKey], "not_due", dateKey);
  }
  for (const dateKey of ["2026-08-08", "2026-08-09", "2026-08-10", "2026-08-11"]) {
    assert.equal(dailyStates?.[dateKey], "due", dateKey);
  }
  assert.equal(dailyHistory[0]?.status, "did_my_best");

  const weeklyStates = resolveTaskHistoryCalendarStates({
    calendarEnd: "2026-08-16",
    calendarStart: "2026-08-05",
    ...context,
    history: [],
    now: "2026-08-05T14:00:00.000Z",
    task: task({ due_on: "2026-08-09", repeat_days_of_week: [0], repeat_frequency: "weekly", status: "upcoming" }),
  });
  assert.equal(weeklyStates?.["2026-08-08"], "not_due");
  assert.equal(weeklyStates?.["2026-08-09"], "due");
  assert.equal(weeklyStates?.["2026-08-16"], "due");

  const monthlyStates = resolveTaskHistoryCalendarStates({
    calendarEnd: "2026-09-16",
    calendarStart: "2026-08-05",
    ...context,
    history: [],
    now: "2026-08-05T14:00:00.000Z",
    task: task({ due_on: "2026-08-15", repeat_day_of_month: 15, repeat_frequency: "monthly", status: "upcoming" }),
  });
  assert.equal(monthlyStates?.["2026-08-14"], "not_due");
  assert.equal(monthlyStates?.["2026-08-15"], "due");
  assert.equal(monthlyStates?.["2026-09-15"], "due");

  const customStates = resolveTaskHistoryCalendarStates({
    calendarEnd: "2026-08-14",
    calendarStart: "2026-08-05",
    ...context,
    history: [],
    now: "2026-08-05T14:00:00.000Z",
    task: task({ due_on: "2026-08-08", repeat_frequency: "custom", repeat_interval: 3, status: "upcoming" }),
  });
  assert.equal(customStates?.["2026-08-08"], "due");
  assert.equal(customStates?.["2026-08-09"], "not_due");
  assert.equal(customStates?.["2026-08-11"], "due");
});

test("manual due-date reconciliation preserves History while aligning live, visible, and Calendar state", () => {
  const missed = history("missed", "2026-08-03");
  const originalTask = task({ due_on: "2026-08-08", status: "upcoming" });
  const historySnapshot = JSON.stringify([missed]);
  const dueEdit = buildManualDueDateTaskUpdate(originalTask, "2026-08-04", [missed], "2026-08-08");
  const savedTask = { ...originalTask, ...dueEdit };

  assert.equal(dueEdit.due_on, "2026-08-04");
  assert.equal(dueEdit.status, "missed");
  assert.equal(dueEdit.active_occurrence_due_on, undefined);
  assert.equal(dueEdit.active_status_logical_date, undefined);
  assert.equal(JSON.stringify([missed]), historySnapshot);

  const activeRead = resolveActiveTaskStatuses({
    historyByTaskId: { [savedTask.id]: [missed] },
    logicalDayRollover: "06:00",
    now: "2026-08-08T14:00:00.000Z",
    tasks: [savedTask],
    timezone: "America/New_York",
  });
  assert.equal(activeRead.statusesByTaskId[savedTask.id], "missed");
  assert.equal(getTaskDisplayStatusWithHistory(savedTask, [missed], "2026-08-08"), "missed");

  const calendarStates = resolveTaskHistoryCalendarStates({
    calendarEnd: "2026-08-08",
    calendarStart: "2026-08-03",
    logicalDayRollover: "06:00",
    history: [missed],
    now: "2026-08-08T14:00:00.000Z",
    task: savedTask,
    timezone: "America/New_York",
  });
  assert.equal(calendarStates?.["2026-08-03"], "missed");

  const noUnresolvedHistory = buildManualDueDateTaskUpdate(
    { ...originalTask, due_on: "2026-08-08", status: "upcoming" },
    "2026-08-08",
    [],
    "2026-08-08",
  );
  assert.equal(noUnresolvedHistory.status, "pending");
  assert.equal(noUnresolvedHistory.active_occurrence_due_on ?? null, null);

  const futureAnchor = buildManualDueDateTaskUpdate(
    { ...originalTask, due_on: "2026-08-04", status: "pending" },
    "2026-08-08",
    [],
    "2026-08-05",
  );
  assert.equal(futureAnchor.status, "upcoming");
  const futureCalendarStates = resolveTaskHistoryCalendarStates({
    calendarEnd: "2026-08-08",
    calendarStart: "2026-08-04",
    logicalDayRollover: "06:00",
    history: [],
    now: "2026-08-05T14:00:00.000Z",
    task: { ...originalTask, ...futureAnchor },
    timezone: "America/New_York",
  });
  for (const dateKey of ["2026-08-05", "2026-08-06", "2026-08-07"]) {
    assert.equal(futureCalendarStates?.[dateKey], "not_due", dateKey);
  }
  assert.equal(futureCalendarStates?.["2026-08-08"], "due");
});

test("custom weekday arrays reject non-due dates while retaining manual History actions", () => {
  const taskWithCustomWeekdays = task({
    due_on: "2026-08-05",
    repeat_days_of_week: [1, 3, 5],
    repeat_frequency: "weekly",
    repeat_interval: 1,
    status: "upcoming",
  });
  const customContext = {
    logicalDayRollover: "06:00",
    now: "2026-08-10T14:00:00.000Z",
    timezone: "America/New_York",
  };
  const statuses = resolveTaskHistoryCalendarActionStatuses({
    ...customContext,
    history: [],
    logicalDate: "2026-08-08",
    task: taskWithCustomWeekdays,
  });

  assert.equal(statuses.includes("done"), true);
  assert.equal(statuses.includes("did_my_best"), true);
  assert.equal(statuses.includes("missed"), false);
});

test("configured logical-day rollover remains the Calendar authority boundary", () => {
  const beforeBoundary = evaluateTaskActionAuthority({
    history: [],
    logicalDayRollover: "18:00",
    now: "2026-08-04T21:59:00.000Z",
    outcome: "missed",
    task: task({ due_on: "2026-08-03" }),
    timezone: "America/New_York",
  });
  const afterBoundary = evaluateTaskActionAuthority({
    history: [],
    logicalDayRollover: "18:00",
    now: "2026-08-04T22:00:00.000Z",
    outcome: "missed",
    task: task({ due_on: "2026-08-03" }),
    timezone: "America/New_York",
  });

  assert.equal(beforeBoundary?.logicalDate, "2026-08-03");
  assert.equal(afterBoundary?.logicalDate, "2026-08-04");
});

test("Calendar authority allows direct replacement of an existing recurring outcome", () => {
  const existingMissed = history("missed");
  const statuses = resolveTaskHistoryCalendarActionStatuses({
    ...context,
    history: [existingMissed],
    logicalDate: existingMissed.entry_date,
    task: task({ status: "missed" }),
  });

  assert.deepEqual(statuses, ["done", "did_my_best", "delayed", "missed", "complete"]);

  const replacement = evaluateTaskActionAuthority({
    ...context,
    history: [existingMissed],
    occurrenceDueOn: existingMissed.occurrence_due_on,
    occurrenceIdentity: existingMissed.occurrence_key,
    outcome: "done",
    outcomeDate: existingMissed.entry_date,
    previousOutcome: "missed",
    replaceExisting: true,
    task: task({ status: "missed" }),
  });
  assert.deepEqual(replacement?.validationErrors, []);
  assert.equal(replacement?.mutationPlan.history.filter((row) => row.logicalDate === existingMissed.entry_date).length, 1);
});

test("Calendar action availability uses one normalized logical-date History result", () => {
  const olderMissed = history("missed");
  const newerDone = {
    ...history("done"),
    id: "history-newer",
    updated_at: "2026-07-30T13:00:00.000Z",
  };
  const expected = resolveTaskHistoryCalendarActionStatuses({
    ...context,
    history: [newerDone],
    logicalDate: "2026-07-30",
    task: task({ status: "pending" }),
  });
  const actual = resolveTaskHistoryCalendarActionStatuses({
    ...context,
    history: [olderMissed, newerDone],
    logicalDate: "2026-07-30",
    task: task({ status: "pending" }),
  });

  assert.deepEqual(actual, expected);
});

test("action authority projects only supported fields and preserves legacy fallback", () => {
  const rolling = evaluateTaskActionAuthority({ ...context, history: [], outcome: "done", task: task() });
  assert.equal(rolling?.persistableTaskPatch.dueOn, "2026-08-01");
  assert.equal(Object.hasOwn(rolling?.persistableTaskPatch ?? {}, "recurrenceCursor"), false);
  assert.equal(Object.hasOwn(rolling?.persistableTaskPatch ?? {}, "satisfiedOccurrenceIdentity"), false);
  assert.equal(evaluateTaskActionAuthority({ ...context, enabled: false, history: [], outcome: "done", task: task() }), null);
  assert.equal(resolveTaskHistoryCalendarStates({ ...context, enabled: false, history: [], task: task() }), null);
  assert.deepEqual(resolveTaskHistoryCalendarActionStatuses({ ...context, history: [], logicalDate: "2026-07-31", task: task() }), ["done", "did_my_best", "delayed", "missed", "complete"]);
});

test("weekly Vera Reports fixture advances the canonical August 3 cursor once", () => {
  const vera = task({
    due_on: "2026-08-03",
    id: "81b64697-4291-4d3d-913a-c9d0e2f8d804",
    repeat_days_of_week: [1],
    repeat_frequency: "weekly",
    repeat_interval: 1,
    status: "pending",
  });
  const actionContext = {
    logicalDayRollover: "06:00",
    now: "2026-08-03T14:00:00.000Z",
    timezone: "America/New_York",
  };

  const canonicalAction = evaluateTaskActionAuthority({ ...actionContext, history: [], outcome: "done", task: vera });
  const projectedAction = evaluateTaskActionAuthority({
    ...actionContext,
    history: [],
    outcome: "done",
    task: { ...vera, due_on: "2026-08-10" },
  });
  const duplicateAction = evaluateTaskActionAuthority({
    ...actionContext,
    history: [{ ...history("done", "2026-08-03"), task_id: vera.id }],
    outcome: "done",
    task: vera,
  });

  assert.equal(canonicalAction?.nextDueDate, "2026-08-10");
  assert.equal(canonicalAction?.mutationPlan.taskUpdate.due_on, "2026-08-10");
  assert.equal(projectedAction?.nextDueDate, "2026-08-17");
  assert.equal(projectedAction?.mutationPlan.taskUpdate.due_on, "2026-08-17");
  assert.ok(duplicateAction?.validationErrors.length);
});

test("saved Daily Until Complete Done History advances one occurrence without completing recurrence", () => {
  const dailyUntilCompleteTask = task({
    due_on: "2026-07-31",
    repeat_frequency: "daily_until_complete",
  });
  const doneHistory = history("done", "2026-08-01");
  doneHistory.occurrence_due_on = "2026-07-31";
  doneHistory.occurrence_key = "occurrence:2026-07-31";

  const result = evaluateTaskActionAuthority({
    ...context,
    history: [doneHistory],
    now: "2026-08-01T14:00:00.000Z",
    task: dailyUntilCompleteTask,
  });

  assert.equal(result?.lifecycle, "active");
  assert.equal(result?.nextDueDate, "2026-08-02");
  assert.equal(result?.persistableTaskPatch.dueOn, "2026-08-02");
  assert.notEqual(result?.persistableTaskPatch.status, "complete");
});

test("Daily Until Complete accepts Done through the shared action authority", () => {
  const result = evaluateTaskActionAuthority({
    ...context,
    history: [],
    outcome: "done",
    task: task({ due_on: "2026-07-31", repeat_frequency: "daily_until_complete" }),
  });

  assert.deepEqual(result?.validationErrors, []);
  assert.equal(result?.lifecycle, "active");
  assert.equal(result?.nextDueDate, "2026-08-01");
  assert.equal(result?.mutationPlan.taskUpdate.status, "upcoming");
  assert.notEqual(result?.mutationPlan.taskUpdate.status, "done");
  assert.equal(result?.mutationPlan.historyOutcome, "done");
});

test("engine action plans keep Did My Best History separate from the projected next status", () => {
  const result = evaluateTaskActionAuthority({
    ...context,
    history: [],
    outcome: "did_my_best",
    task: task({ due_on: "2026-07-31", repeat_frequency: "daily" }),
  });

  assert.equal(result?.mutationPlan.historyOutcome, "did_my_best");
  assert.notEqual(result?.mutationPlan.taskUpdate.status, "did_my_best");
  assert.equal(result?.mutationPlan.taskUpdate.due_on, "2026-08-01");
});

test("all engine-managed History outcomes remain explicit in the mutation plan", () => {
  for (const [outcome, options] of [
    ["complete", {}],
    ["delayed", { delayDays: 1 }],
    ["missed", {}],
  ] as const) {
    const result = evaluateTaskActionAuthority({
      ...context,
      ...options,
      history: [],
      outcome,
      task: task({ due_on: "2026-07-31", repeat_frequency: "daily" }),
    });
    assert.equal(result?.mutationPlan.historyOutcome, outcome);
  }
});

test("successful Daily Until Complete Done action leaves zero rollover repair patches", () => {
  const original = task({ due_on: "2026-07-31", repeat_frequency: "daily_until_complete", status: "upcoming" });
  const action = evaluateTaskActionAuthority({
    ...context,
    history: [],
    outcome: "done",
    task: original,
  });
  assert.ok(action);
  assert.equal(action.mutationPlan.taskUpdate.status, "upcoming");

  const savedTask: Task = {
    ...original,
    ...action.mutationPlan.taskUpdate,
    revision: original.revision + 1,
  };
  const savedHistory = action.mutationPlan.history.map((row): TaskHistory => ({
    counted_as_due_occurrence: true,
    created_at: row.occurredAt,
    entry_date: row.logicalDate,
    event_type: "status",
    id: row.id,
    occurrence_due_on: row.occurrenceIdentity?.split(":").at(-1) ?? null,
    occurrence_key: row.occurrenceIdentity ? `occurrence:${row.occurrenceIdentity.split(":").at(-1)}` : null,
    status: row.outcome,
    task_id: row.taskId,
    updated_at: row.occurredAt,
    user_id: original.user_id,
    was_completed: row.outcome === "done" || row.outcome === "did_my_best" || row.outcome === "complete",
  }));
  const rollover = createEngineRolloverPlan({
    history: savedHistory,
    now: context.now,
    rolloverTime: context.logicalDayRollover,
    tasks: [savedTask],
    timezone: context.timezone,
  });

  assert.deepEqual(rollover.remainingPatchSummaries, []);
  assert.deepEqual(rollover.tasks, []);
});

test("shared status action applies the engine Task and History plan optimistically together", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(
    new URL("../src/components/task-app.tsx", import.meta.url),
    "utf8",
  ));
  const actionPath = source.slice(source.indexOf("async function updateTaskStatus"), source.indexOf("async function toggleTaskPinned"));

  assert.match(actionPath, /const values: TaskUpdate = action[\s\S]*?action\.mutationPlan\.taskUpdate/);
  assert.match(actionPath, /historyStatus: actionHistoryStatus/);
  assert.match(actionPath, /actionHistoryStatus = action\?\.mutationPlan\.historyOutcome/);
  assert.match(actionPath, /if \(action\) \{[\s\S]*?setTasks\([\s\S]*?setTaskHistory\(/);
  assert.doesNotMatch(actionPath, /\.\.\.buildTaskStatusUpdate\(task, status\)[\s\S]*?action\.persistableTaskPatch/);
});

test("status actions resolve canonical task state and single-flight the complete mutation", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(
    new URL("../src/components/task-app.tsx", import.meta.url),
    "utf8",
  ));
  const actionPath = source.slice(source.indexOf("async function updateTaskStatus"), source.indexOf("async function toggleTaskPinned"));

  assert.match(actionPath, /canonicalTasksRef\.current\.find\(\(candidate\) => candidate\.id === task\.id\)/);
  assert.match(actionPath, /task\.revision !== canonicalTask\.revision/);
  assert.match(actionPath, /taskStatusMutationInFlightRef\.current\.get\(canonicalTask\.id\)/);
  assert.match(actionPath, /taskStatusMutationInFlightRef\.current\.delete\(canonicalTask\.id\)/);
  assert.match(actionPath, /runTaskStatusMutation\(\s*canonicalTask/);
  assert.match(actionPath, /loadTaskHistoryForTasks\(\[task\.id\]\)/);
});

test("History failure uses revision-aware compensation and refreshes on rollback conflict", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(
    new URL("../src/components/task-app.tsx", import.meta.url),
    "utf8",
  ));
  const compensationStart = source.indexOf("onTaskHistoryFailure: async");
  const compensationPath = source.slice(compensationStart, source.indexOf("onTasksCompleted: queueTaskRewards", compensationStart));

  assert.match(compensationPath, /updateTaskRowWithLegacyEnergyFallback\(\s*taskId,\s*rollbackValues,\s*\{ expectedTask: committedTask \}/);
  assert.match(compensationPath, /await softRefreshWorkspace\(\)/);
  assert.match(compensationPath, /History could not be saved and the task could not be safely rolled back/);
  assert.doesNotMatch(compensationPath, /runGuardedTaskRowUpdate/);
});

test("Table and List status adapters enter the canonical-by-ID action boundary", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(
    new URL("../src/components/task-app.tsx", import.meta.url),
    "utf8",
  ));
  const tableCallback = source.slice(source.indexOf("onSetStatus: (taskId, status, expectedTask"), source.indexOf("onSetStatus: (taskId, status, expectedTask", source.indexOf("onSetStatus: (taskId, status, expectedTask") + 1));

  assert.match(tableCallback, /const task = expectedTask \?\? tasks\.find\(\(entry\) => entry\.id === taskId\)/);
  assert.match(tableCallback, /void updateTaskStatus\(task, status\)/);
  assert.match(source, /allTasks: tasksForActiveStatusRead/);
  assert.match(source, /tasks: selectedBucketTasks/);
});
