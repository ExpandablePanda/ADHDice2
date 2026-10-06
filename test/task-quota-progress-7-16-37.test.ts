import assert from "node:assert/strict";
import test from "node:test";

import type { TaskHistory } from "../src/lib/database.types.ts";
import { formatRepeatCompactLabel, formatRepeatSummary } from "../src/lib/task-repeat.ts";
import { buildTaskTableRow } from "../src/lib/task-table-row.ts";
import {
  quotaProgressForCurrentPeriod,
  quotaProgressForTask,
  type QuotaProgressHistoryRow,
} from "../src/lib/task-state-engine/quota.ts";
import { createTask } from "../src/lib/task-buckets.ts";

function historyRow(logicalDate: string, outcome: QuotaProgressHistoryRow["outcome"] = "done"): QuotaProgressHistoryRow {
  return { logicalDate, outcome };
}

function progress(
  period: "week" | "month",
  count: number,
  logicalDate: string,
  history: readonly QuotaProgressHistoryRow[] = [],
  activationDate: string | null = null,
) {
  return quotaProgressForCurrentPeriod({
    recurrence: { activationDate, count, period },
    logicalDate,
    history,
  });
}

function databaseHistory(taskId: string, logicalDate: string, status: TaskHistory["status"] = "done"): TaskHistory {
  return {
    counted_as_due_occurrence: true,
    created_at: `${logicalDate}T12:00:00.000Z`,
    entry_date: logicalDate,
    event_type: status === "complete" ? "completed_permanently" : "status",
    id: `${taskId}:${logicalDate}:${status}`,
    occurrence_due_on: logicalDate,
    occurrence_key: `occurrence:${taskId}:${logicalDate}`,
    status,
    task_id: taskId,
    updated_at: `${logicalDate}T12:00:00.000Z`,
    user_id: "user-1",
    was_completed: status === "done" || status === "did_my_best" || status === "complete",
  };
}

test("quota progress reports 0/5, 1/5, and 5/5 with Done/Did My Best date dedupe", () => {
  assert.deepEqual(progress("week", 5, "2026-09-30"), {
    denominator: 5,
    numerator: 0,
    period: "week",
    periodKey: "2026-09-28",
  });
  assert.equal(progress("week", 5, "2026-09-30", [historyRow("2026-09-28")]).numerator, 1);
  assert.equal(progress("week", 5, "2026-10-02", [
    historyRow("2026-09-28"),
    historyRow("2026-09-28", "did_my_best"),
    historyRow("2026-09-29"),
    historyRow("2026-09-30", "did_my_best"),
    historyRow("2026-09-30", "missed"),
    historyRow("2026-10-01"),
    historyRow("2026-10-02"),
  ]).numerator, 5);
});

test("quota progress follows outcome edits and date edits without retaining stale success", () => {
  const original = [historyRow("2026-09-28")];
  const outcomeEdited = [historyRow("2026-09-28", "missed")];
  const dateEdited = [historyRow("2026-09-29")];

  assert.equal(progress("week", 5, "2026-09-30", original).numerator, 1);
  assert.equal(progress("week", 5, "2026-09-30", outcomeEdited).numerator, 0);
  assert.equal(progress("week", 5, "2026-09-30", dateEdited).numerator, 1);
});

test("quota progress uses period boundaries while activation remains irrelevant to success credit", () => {
  assert.equal(progress("week", 5, "2026-09-30", [
    historyRow("2026-09-27"),
    historyRow("2026-09-29"),
    historyRow("2026-09-30"),
  ], "2026-09-30").numerator, 2);
  assert.equal(progress("week", 5, "2026-10-05", [historyRow("2026-10-04")]).numerator, 0);
  assert.equal(progress("month", 4, "2026-10-01", [
    historyRow("2026-09-30"),
    historyRow("2026-10-01"),
  ]).numerator, 1);
});

test("exact QA case counts same-week backdated successes and renders 4/3", () => {
  const task = {
    canonical_schedule_boundary: {
      effective_from_logical_date: "2026-10-01",
      repeat_frequency: "per_week",
    },
    due_on: "2026-10-01",
    repeat_frequency: "per_week",
    repeat_quota_count: 3,
    status: "pending",
  } as const;
  const history = [
    historyRow("2026-09-27"),
    historyRow("2026-09-28"),
    historyRow("2026-09-29", "did_my_best"),
    historyRow("2026-09-30"),
    historyRow("2026-10-01"),
  ];
  const result = quotaProgressForTask({ task, logicalDate: "2026-10-01", history });

  assert.deepEqual(result, {
    denominator: 3,
    numerator: 4,
    period: "week",
    periodKey: "2026-09-28",
  });
  assert.equal(formatRepeatCompactLabel(
    task.repeat_frequency,
    1,
    [],
    "day_of_month",
    null,
    null,
    null,
    task.repeat_quota_count,
    false,
    0,
    result,
  ), "3 Per Week · 4/3");
});

test("monthly progress counts earlier same-month success but excludes prior-month History", () => {
  assert.equal(progress("month", 4, "2026-10-15", [
    historyRow("2026-09-30"),
    historyRow("2026-10-02"),
    historyRow("2026-10-05", "did_my_best"),
    historyRow("2026-10-12"),
  ], "2026-10-10").numerator, 3);
});

test("quota progress preserves uncapped numerators above the denominator", () => {
  const history = [
    historyRow("2026-09-28"),
    historyRow("2026-09-29"),
    historyRow("2026-09-30"),
    historyRow("2026-10-01"),
    historyRow("2026-10-02"),
    historyRow("2026-10-03"),
  ];
  const fivePerWeek = progress("week", 5, "2026-10-03", history);
  assert.equal(fivePerWeek.numerator, 6);
  assert.equal(formatRepeatCompactLabel("per_week", 1, [], "day_of_month", null, null, null, 5, false, 0, fivePerWeek), "5 Per Week · 6/5");
});

test("balance and Clear Balance inputs do not change quota success progress", () => {
  const history = [historyRow("2026-09-28"), historyRow("2026-09-29")];
  const task = {
    due_on: "2026-09-28",
    repeat_frequency: "per_week",
    repeat_quota_balance_enabled: true,
    repeat_quota_count: 5,
    status: "pending",
  } as const;
  const negative = quotaProgressForTask({ task: { ...task, repeat_quota_balance: -2 }, logicalDate: "2026-09-30", history });
  const positive = quotaProgressForTask({ task: { ...task, repeat_quota_balance: 2 }, logicalDate: "2026-09-30", history });
  const cleared = quotaProgressForTask({ task: { ...task, repeat_quota_balance: 0 }, logicalDate: "2026-09-30", history });

  assert.deepEqual(negative, positive);
  assert.deepEqual(positive, cleared);
  assert.equal(positive?.numerator, 2);
  assert.equal(positive?.denominator, 5);
});

test("quota progress uses the configured current denominator and canonical activation boundary", () => {
  const task = {
    canonical_schedule_boundary: {
      effective_from_logical_date: "2026-09-30",
      repeat_frequency: "per_week",
    },
    due_on: "2026-09-01",
    repeat_frequency: "per_week",
    repeat_quota_count: 5,
    status: "pending",
  } as const;
  const current = quotaProgressForTask({
    task,
    logicalDate: "2026-09-30",
    history: [historyRow("2026-09-29"), historyRow("2026-09-30")],
  });
  const changedCount = quotaProgressForTask({
    task: { ...task, repeat_quota_count: 4 },
    logicalDate: "2026-09-30",
    history: [historyRow("2026-09-29"), historyRow("2026-09-30")],
  });

  assert.equal(current?.numerator, 2);
  assert.equal(current?.denominator, 5);
  assert.equal(changedCount?.numerator, 2);
  assert.equal(changedCount?.denominator, 4);
});

test("quota progress is absent for ordinary recurrence and terminal quota Tasks", () => {
  assert.equal(quotaProgressForTask({ task: { repeat_frequency: "daily", status: "pending" }, logicalDate: "2026-09-30" }), null);
  assert.equal(quotaProgressForTask({ task: { repeat_frequency: "per_week", status: "complete" }, logicalDate: "2026-09-30" }), null);
});

test("Repeat formatters render quota progress while ordinary labels stay unchanged", () => {
  const weekProgress = { denominator: 5, numerator: 1, period: "week" as const, periodKey: "2026-09-28" };
  const monthProgress = { denominator: 4, numerator: 1, period: "month" as const, periodKey: "2026-10" };
  assert.equal(formatRepeatCompactLabel("per_week", 1, [], "day_of_month", null, null, null, 5, false, 0, weekProgress), "5 Per Week · 1/5");
  assert.equal(formatRepeatCompactLabel("per_month", 1, [], "day_of_month", null, null, null, 4, false, 0, monthProgress), "4 Per Month · 1/4");
  assert.equal(formatRepeatSummary({
    repeat_day_of_month: null,
    repeat_days_of_week: [],
    repeat_frequency: "per_week",
    repeat_interval: 1,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    repeat_quota_count: 5,
    repeat_quota_progress: weekProgress,
  }), "5 Per Week · 1/5");
  assert.equal(formatRepeatCompactLabel("daily", 1), "Daily");
  assert.equal(formatRepeatCompactLabel("weekly", 1, [1]), "Weekly (Mon)");
  assert.equal(formatRepeatCompactLabel("monthly", 1), "Monthly");
});

test("Task table row derives quota progress from canonical History for the shared Repeat chip", () => {
  const task = Object.assign(createTask({
    due_on: "2026-09-01",
    id: "quota-row",
    repeat_frequency: "per_week",
    repeat_quota_count: 5,
    status: "pending",
    title: "Quota row",
  }), {
    canonical_schedule_boundary: {
      effective_from_logical_date: "2026-09-28",
      repeat_frequency: "per_week",
    },
  });
  const row = buildTaskTableRow(task, {
    focusedTaskIdSet: new Set(),
    linkedNotes: [],
    listDefinitions: [],
    listMemberships: [],
    subtasks: [],
    taskHistory: [databaseHistory(task.id, "2026-09-28", "done")],
    quotaCurrentPeriodHistory: [databaseHistory(task.id, "2026-09-28", "done")],
    isQuotaCurrentPeriodHistoryReady: true,
    todayDateKey: "2026-09-30",
  });

  assert.deepEqual(row.repeatQuotaProgress, {
    denominator: 5,
    numerator: 1,
    period: "week",
    periodKey: "2026-09-28",
  });
  assert.equal(formatRepeatCompactLabel(
    row.repeat,
    row.repeatInterval,
    row.repeatDaysOfWeek,
    row.repeatMonthlyMode,
    row.repeatMonthlyOrdinal,
    row.repeatMonthlyWeekday,
    row.repeatDayOfMonth,
    row.repeatQuotaCount,
    row.repeatQuotaBalanceEnabled,
    row.repeatQuotaBalance,
    row.repeatQuotaProgress,
  ), "5 Per Week · 1/5");
});
