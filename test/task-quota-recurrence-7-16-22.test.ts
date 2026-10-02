import assert from "node:assert/strict";
import test from "node:test";

import { STANDARD_TASK_BEHAVIOR_POLICY } from "../src/lib/task-state-engine/behavior-policy.ts";
import { evaluateTaskState } from "../src/lib/task-state-engine/engine.ts";
import { quotaDateIsMandatory, quotaNextBalance, quotaPeriodBounds, quotaPeriodEvaluation, quotaPeriodFactFor } from "../src/lib/task-state-engine/quota.ts";
import { canTaskDelay, getSelectableTaskStatusesForRepeatFrequency, getTaskHistoryCalendarActionStatuses } from "../src/lib/task-complete.ts";
import type { TaskStateEngineInput, TaskStateHistoryRow } from "../src/lib/task-state-engine/types.ts";

function input(overrides: Partial<TaskStateEngineInput> = {}): TaskStateEngineInput {
  return {
    behaviorPolicy: STANDARD_TASK_BEHAVIOR_POLICY,
    history: [],
    logicalDayRollover: "06:00",
    now: "2026-09-30T14:00:00.000Z",
    task: {
      activeStatus: "not_due",
      dueOn: "2026-09-28",
      id: "quota-task",
      lifecycle: "active",
      recurrence: {
        kind: "quota",
        period: "week",
        count: 4,
        balanceEnabled: false,
        activationDate: "2026-09-28",
      },
    },
    timezone: "America/New_York",
    ...overrides,
  };
}

function historyRow(logicalDate: string, outcome: TaskStateHistoryRow["outcome"] = "done"): TaskStateHistoryRow {
  return {
    id: `${logicalDate}-${outcome}`,
    taskId: "quota-task",
    logicalDate,
    outcome,
    provenance: "manual",
    occurredAt: `${logicalDate}T15:00:00.000Z`,
    occurrenceIdentity: `occurrence:quota-task:${logicalDate}`,
    occurrenceDueOn: logicalDate,
    countedAsDueOccurrence: true,
    wasCompleted: outcome === "done" || outcome === "did_my_best" || outcome === "complete",
    eventType: outcome === "complete" ? "completed_permanently" : "status",
  };
}

test("quota periods use Monday-Sunday weeks and natural month bounds", () => {
  assert.deepEqual(quotaPeriodBounds("2026-09-30", "week"), {
    capacity: 7,
    end: "2026-10-04",
    key: "2026-09-28",
    start: "2026-09-28",
  });
  assert.deepEqual(quotaPeriodBounds("2026-02-28", "month"), {
    capacity: 28,
    end: "2026-02-28",
    key: "2026-02",
    start: "2026-02-01",
  });
});

test("quota base is bounded by physical period capacity", () => {
  const recurrence = { kind: "quota" as const, period: "month" as const, count: 31, balanceEnabled: false };
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2026-02-01" }).baseQuota, 28);
});

test("due formula is remaining required at least remaining days including today", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 4, balanceEnabled: false };
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2026-09-28" }).dueToday, false);
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2026-10-01" }).dueToday, true);
});

test("incoming balance reduces the required quota and may make the period optional", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 4, balanceEnabled: true, incomingBalance: 4 };
  const evaluation = quotaPeriodEvaluation({ recurrence, logicalDate: "2026-09-28" });
  assert.equal(evaluation.requiredThisPeriod, 0);
  assert.equal(evaluation.dueToday, false);
  assert.equal(quotaDateIsMandatory({ recurrence, logicalDate: "2026-09-30" }), false);
});

test("only distinct successful logical dates count", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: false };
  const history = [historyRow("2026-09-28"), { ...historyRow("2026-09-28", "did_my_best"), id: "duplicate" }];
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2026-09-30", history }).successesThisPeriod, 1);
});

test("same-period successes count before activation while prior periods remain excluded", () => {
  for (const scenario of [
    {
      recurrence: { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: true, activationDate: "2026-10-02" },
      logicalDate: "2026-10-04",
      history: [historyRow("2026-09-27"), historyRow("2026-09-28"), historyRow("2026-10-02")],
    },
    {
      recurrence: { kind: "quota" as const, period: "month" as const, count: 3, balanceEnabled: true, activationDate: "2026-01-15" },
      logicalDate: "2026-01-31",
      history: [historyRow("2025-12-31"), historyRow("2026-01-05"), historyRow("2026-01-15")],
    },
  ]) {
    const evaluation = quotaPeriodEvaluation({ ...scenario });
    const close = quotaPeriodFactFor({
      recurrence: scenario.recurrence,
      periodDate: scenario.logicalDate,
      history: scenario.history,
      eventKind: "period_close",
      idempotenceIdentity: `${scenario.recurrence.period}-activation-close`,
    });
    assert.equal(evaluation.successesThisPeriod, 2, scenario.recurrence.period);
    assert.equal(evaluation.remainingRequired, 1, scenario.recurrence.period);
    assert.equal(evaluation.nextBalance, -1, scenario.recurrence.period);
    assert.equal(close.successfulDays, 2, scenario.recurrence.period);
    assert.equal(close.nextBalance, -1, scenario.recurrence.period);
  }
});

test("exact current-week backdated successes drive progress arithmetic without pre-activation obligations", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: false, activationDate: "2026-10-01" };
  const history = [
    historyRow("2026-09-27"),
    historyRow("2026-09-28"),
    historyRow("2026-09-29", "did_my_best"),
    historyRow("2026-09-30"),
    historyRow("2026-10-01"),
  ];
  const evaluation = quotaPeriodEvaluation({ recurrence, logicalDate: "2026-10-01", history });

  assert.equal(evaluation.successesThisPeriod, 4);
  assert.equal(evaluation.requiredThisPeriod, 3);
  assert.equal(evaluation.remainingRequired, 0);
  assert.equal(evaluation.nextMandatoryDate, null);
  assert.equal(evaluation.nextBalance, 0);
  assert.equal(quotaDateIsMandatory({ recurrence, logicalDate: "2026-09-30", history }), false);
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2026-09-30" }).dueToday, false);
});

test("backdated same-period successes reduce remaining work and move the next mandatory date", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: false, activationDate: "2026-10-01" };
  const before = quotaPeriodEvaluation({ recurrence, logicalDate: "2026-10-01" });
  const after = quotaPeriodEvaluation({
    recurrence,
    logicalDate: "2026-10-01",
    history: [historyRow("2026-09-28"), historyRow("2026-09-29")],
  });

  assert.equal(before.remainingRequired, 3);
  assert.equal(after.successesThisPeriod, 2);
  assert.equal(after.remainingRequired, 1);
  assert.equal(after.nextMandatoryDate, "2026-10-04");
});

test("balance uses corrected current-period surplus and Clear Balance preserves success credit", () => {
  const recurrence = {
    kind: "quota" as const,
    period: "week" as const,
    count: 3,
    balanceEnabled: true,
    activationDate: "2026-10-01",
    scheduleBoundaryId: "boundary-backdated-balance",
  };
  const history = [
    historyRow("2026-09-28"),
    historyRow("2026-09-29"),
    historyRow("2026-09-30"),
    historyRow("2026-10-01"),
  ];
  const evaluation = quotaPeriodEvaluation({ recurrence, logicalDate: "2026-10-04", history });
  assert.equal(evaluation.successesThisPeriod, 4);
  assert.equal(evaluation.nextBalance, 1);

  const clear = quotaPeriodFactFor({
    recurrence,
    periodDate: "2026-10-01",
    history,
    eventKind: "clear_balance",
    idempotenceIdentity: "clear-backdated-balance",
  });
  assert.equal(clear.successfulDays, 4);
  const afterClear = quotaPeriodEvaluation({
    recurrence,
    logicalDate: "2026-10-04",
    history,
    quotaPeriodFacts: [{ ...clear, id: "clear-backdated-balance-fact", createdAt: "2026-10-02T00:00:00.000Z" }],
  });
  assert.equal(afterClear.incomingBalance, 0);
  assert.equal(afterClear.successesThisPeriod, 4);
  assert.equal(afterClear.nextBalance, 1);
});

test("balance is uncapped and carries into the next period", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 2, balanceEnabled: true, incomingBalance: 0 };
  const history = [historyRow("2026-09-28"), historyRow("2026-09-29"), historyRow("2026-09-30")];
  assert.equal(quotaNextBalance({ recurrence, periodDate: "2026-09-30", history }), 1);
});

test("period rollover proposes the next server-owned balance anchor", () => {
  const result = evaluateTaskState({
    ...input({
      now: "2026-10-05T14:00:00.000Z",
      task: {
        ...input().task,
        recurrence: { kind: "quota", period: "week", count: 3, balanceEnabled: true, activationDate: "2026-09-28", incomingBalance: 0, incomingBalancePeriodKey: "2026-09-28" },
        quotaIncomingBalance: 0,
        quotaIncomingBalancePeriodKey: "2026-09-28",
      },
    }),
    action: { type: "reconcile_rollover" },
  });
  assert.equal(result.proposedTaskPatch.repeatQuotaBalance, -3);
  assert.equal(result.proposedTaskPatch.repeatQuotaBalancePeriod, "2026-10-05");
});

test("recorded outcomes are limited to one row per logical day", () => {
  const first = evaluateTaskState({ ...input(), action: { type: "record_outcome", outcome: "done", logicalDate: "2026-09-30" } });
  assert.equal(first.proposedHistoryChanges.filter((change) => change.type === "insert").length, 1);
  const second = evaluateTaskState({ ...input({ history: [historyRow("2026-09-30")] }), action: { type: "record_outcome", outcome: "did_my_best", logicalDate: "2026-09-30" } });
  assert.equal(second.validationErrors.length, 1);
});

test("Missed is rejected until the quota mathematically requires today", () => {
  const optional = evaluateTaskState({ ...input(), action: { type: "record_outcome", outcome: "missed", logicalDate: "2026-09-28" } });
  assert.equal(optional.validationErrors[0], "Missed requires a mathematically mandatory quota day.");
  const mandatory = evaluateTaskState({ ...input({ now: "2026-10-01T14:00:00.000Z" }), action: { type: "record_outcome", outcome: "missed", logicalDate: "2026-10-01" } });
  assert.equal(mandatory.proposedHistoryChanges.some((change) => change.type === "insert" && change.row.outcome === "missed"), true);
});

test("Delay is unavailable for quota recurrence", () => {
  const result = evaluateTaskState({ ...input(), action: { type: "record_outcome", outcome: "delayed", logicalDate: "2026-09-30" } });
  assert.equal(result.validationErrors[0], "Delay is unavailable for quota recurrence.");
});

test("Complete is terminal and removes the next due date", () => {
  const result = evaluateTaskState({ ...input(), action: { type: "record_outcome", outcome: "complete", logicalDate: "2026-09-30" } });
  assert.equal(result.activeStatus, "complete");
  assert.equal(result.nextDueDate, null);
  assert.equal(result.proposedTaskPatch.completedAt !== undefined, true);
});

test("rollover materializes only mandatory individual misses", () => {
  const result = evaluateTaskState({ ...input({ now: "2026-10-03T14:00:00.000Z" }), action: { type: "reconcile_rollover" } });
  const automaticMisses = result.proposedHistoryChanges.filter((change) => change.type === "insert" && change.row.outcome === "missed");
  assert.deepEqual(automaticMisses.map((change) => change.type === "insert" ? change.row.logicalDate : null), ["2026-10-01", "2026-10-02"]);
});

test("3 per week projects only Friday through Sunday as mandatory initially", () => {
  const result = evaluateTaskState({
    ...input({
      now: "2026-09-28T14:00:00.000Z",
      task: { ...input().task, dueOn: "2026-09-28", recurrence: { kind: "quota", period: "week", count: 3, balanceEnabled: false, activationDate: "2026-09-28" } },
    }),
    calendarStart: "2026-09-28",
    calendarEnd: "2026-10-04",
  });
  assert.deepEqual(
    ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"].map((date) => result.calendar[date]),
    ["not_due", "not_due", "not_due", "not_due"],
  );
  assert.deepEqual(["2026-10-02", "2026-10-03", "2026-10-04"].map((date) => result.calendar[date]), ["scheduled", "scheduled", "scheduled"]);
});

test("a Monday success moves the next mandatory quota date to Saturday", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: false };
  const evaluation = quotaPeriodEvaluation({ recurrence, logicalDate: "2026-09-28", history: [historyRow("2026-09-28")] });
  assert.equal(evaluation.nextMandatoryDate, "2026-10-03");
});

test("Monday and Wednesday successes move the next mandatory date to Sunday", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: false };
  const evaluation = quotaPeriodEvaluation({ recurrence, logicalDate: "2026-09-30", history: [historyRow("2026-09-28"), historyRow("2026-09-30")] });
  assert.equal(evaluation.nextMandatoryDate, "2026-10-04");
});

test("three early weekly successes remove the remaining mandatory date", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: false };
  const evaluation = quotaPeriodEvaluation({ recurrence, logicalDate: "2026-10-01", history: [historyRow("2026-09-28"), historyRow("2026-09-29"), historyRow("2026-10-01")] });
  assert.equal(evaluation.remainingRequired, 0);
  assert.equal(evaluation.nextMandatoryDate, null);
});

test("a Friday miss leaves Saturday mandatory without reducing the requirement", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: false };
  const history = [historyRow("2026-10-02", "missed")];
  const evaluation = quotaPeriodEvaluation({ recurrence, logicalDate: "2026-10-03", history });
  assert.equal(evaluation.remainingRequired, 3);
  assert.equal(evaluation.dueToday, true);
});

test("Friday, Saturday, and Sunday unresolved days become three individual misses", () => {
  let history: TaskStateHistoryRow[] = [];
  for (const date of ["2026-10-02", "2026-10-03", "2026-10-04"]) {
    const result = evaluateTaskState({
      ...input({
        now: `${date}T14:00:00.000Z`,
        history,
        task: { ...input().task, recurrence: { kind: "quota", period: "week", count: 3, balanceEnabled: false, activationDate: "2026-09-28" } },
      }),
      action: { type: "record_outcome", outcome: "missed", logicalDate: date },
    });
    const inserted = result.proposedHistoryChanges.find((change) => change.type === "insert");
    assert.equal(result.validationErrors.length, 0);
    assert.equal(inserted?.type, "insert");
    if (inserted?.type === "insert") history = [...history, inserted.row];
  }
  assert.deepEqual(history.map((row) => row.logicalDate), ["2026-10-02", "2026-10-03", "2026-10-04"]);
});

test("an optional Thursday remains without a rollover miss", () => {
  const result = evaluateTaskState({
    ...input({
      now: "2026-10-03T14:00:00.000Z",
      task: { ...input().task, recurrence: { kind: "quota", period: "week", count: 3, balanceEnabled: false, activationDate: "2026-09-28" } },
    }),
    action: { type: "reconcile_rollover" },
  });
  assert.equal(result.proposedHistoryChanges.some((change) => change.type === "insert" && change.row.logicalDate === "2026-10-01"), false);
});

test("a zero-balance 3 per week period closes at negative three", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: true, incomingBalance: 0 };
  assert.equal(quotaNextBalance({ recurrence, periodDate: "2026-10-04" }), -3);
});

test("negative three balance requires six successes", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: true, incomingBalance: -3 };
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2026-09-28" }).requiredThisPeriod, 6);
});

test("negative three plus seven successes closes at positive one", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: true, incomingBalance: -3 };
  const history = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"].map((date) => historyRow(date));
  assert.equal(quotaNextBalance({ recurrence, periodDate: "2026-10-04", history }), 1);
});

test("positive one balance requires only two successes", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: true, incomingBalance: 1 };
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2026-09-28" }).requiredThisPeriod, 2);
});

test("positive three balance makes the period optional", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: true, incomingBalance: 3 };
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2026-09-28" }).dueToday, false);
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2026-10-04" }).nextMandatoryDate, null);
});

test("negative eight debt makes every physical weekly day mandatory", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: true, incomingBalance: -8 };
  for (const date of ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]) {
    assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: date }).dueToday, true);
  }
});

test("negative eight debt plus seven successes remains negative four", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: true, incomingBalance: -8 };
  const history = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"].map((date) => historyRow(date));
  assert.equal(quotaNextBalance({ recurrence, periodDate: "2026-10-04", history }), -4);
});

test("overflow debt creates no synthetic misses beyond seven physical days", () => {
  const result = evaluateTaskState({
    ...input({
      now: "2026-09-29T14:00:00.000Z",
      task: { ...input().task, recurrence: { kind: "quota", period: "week", count: 3, balanceEnabled: true, incomingBalance: -8, activationDate: "2026-09-28" } },
    }),
    action: { type: "reconcile_rollover" },
  });
  const misses = result.proposedHistoryChanges.filter((change) => change.type === "insert" && change.row.outcome === "missed");
  assert.deepEqual(misses.map((change) => change.type === "insert" ? change.row.logicalDate : null), ["2026-09-28"]);
});

test("disabled balance always resets the next period to zero", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: false, incomingBalance: -8 };
  const history = [historyRow("2026-09-28"), historyRow("2026-09-29"), historyRow("2026-09-30")];
  assert.equal(quotaNextBalance({ recurrence, periodDate: "2026-10-04", history }), 0);
});

test("repeating the same period calculation is transition-idempotent", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: true, incomingBalance: -3 };
  const history = [historyRow("2026-09-28"), historyRow("2026-09-29")];
  const first = quotaNextBalance({ recurrence, periodDate: "2026-10-04", history });
  const retry = quotaNextBalance({ recurrence, periodDate: "2026-10-04", history });
  assert.equal(retry, first);
});

test("3 per month initially makes the last three days mandatory", () => {
  const recurrence = { kind: "quota" as const, period: "month" as const, count: 3, balanceEnabled: false };
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2026-01-28" }).dueToday, false);
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2026-01-29" }).dueToday, true);
});

test("one monthly success on the tenth moves the threshold to the thirtieth", () => {
  const recurrence = { kind: "quota" as const, period: "month" as const, count: 3, balanceEnabled: false };
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2026-01-10", history: [historyRow("2026-01-10")] }).nextMandatoryDate, "2026-01-30");
});

test("two monthly successes on the tenth and twentieth move the threshold to the thirty-first", () => {
  const recurrence = { kind: "quota" as const, period: "month" as const, count: 3, balanceEnabled: false };
  const history = [historyRow("2026-01-10"), historyRow("2026-01-20")];
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2026-01-20", history }).nextMandatoryDate, "2026-01-31");
});

test("a configured 31 per month quota adapts February base capacity to 28", () => {
  const recurrence = { kind: "quota" as const, period: "month" as const, count: 31, balanceEnabled: false };
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2027-02-01" }).baseQuota, 28);
});

test("a short February with no incoming debt creates no artificial deficit", () => {
  const recurrence = { kind: "quota" as const, period: "month" as const, count: 31, balanceEnabled: true, incomingBalance: 0 };
  const history = Array.from({ length: 28 }, (_, index) => historyRow(`2027-02-${String(index + 1).padStart(2, "0")}`));
  assert.equal(quotaNextBalance({ recurrence, periodDate: "2027-02-28", history }), 0);
});

test("incoming negative four remains negative four after a perfect February", () => {
  const recurrence = { kind: "quota" as const, period: "month" as const, count: 31, balanceEnabled: true, incomingBalance: -4 };
  const history = Array.from({ length: 28 }, (_, index) => historyRow(`2027-02-${String(index + 1).padStart(2, "0")}`));
  assert.equal(quotaNextBalance({ recurrence, periodDate: "2027-02-28", history }), -4);
});

test("historical optional quota dates remain factual Not Due", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: false };
  const result = evaluateTaskState({
    ...input({ now: "2026-09-30T14:00:00.000Z", task: { ...input().task, recurrence } }),
    calendarStart: "2026-09-28",
    calendarEnd: "2026-10-04",
  });
  assert.equal(result.calendar["2026-09-29"], "not_due");
});

test("future quota projections shift after an early success", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: false };
  const before = evaluateTaskState({ ...input({ now: "2026-09-28T14:00:00.000Z", task: { ...input().task, recurrence } }), calendarStart: "2026-09-28", calendarEnd: "2026-10-04" });
  const after = evaluateTaskState({ ...input({ now: "2026-09-29T14:00:00.000Z", history: [historyRow("2026-09-28")], task: { ...input().task, recurrence } }), calendarStart: "2026-09-28", calendarEnd: "2026-10-04" });
  assert.equal(before.calendar["2026-10-02"], "scheduled");
  assert.equal(after.calendar["2026-10-02"], "not_due");
  assert.equal(after.calendar["2026-10-03"], "scheduled");
});

test("quota Active Status is Not Due before the mandatory date while Calendar stays scheduled", () => {
  const weeklyRecurrence = { kind: "quota" as const, period: "week" as const, count: 2, balanceEnabled: false, activationDate: "2026-10-01" };
  const weeklyFuture = evaluateTaskState({
    ...input({
      now: "2026-10-01T14:00:00.000Z",
      task: { ...input().task, dueOn: "2026-09-28", recurrence: weeklyRecurrence },
    }),
    calendarStart: "2026-10-01",
    calendarEnd: "2026-10-03",
  });
  assert.equal(weeklyFuture.nextDueDate, "2026-10-03");
  assert.equal(weeklyFuture.activeStatus, "not_due");
  assert.equal(weeklyFuture.calendar["2026-10-03"], "scheduled");

  const weeklyToday = evaluateTaskState({
    ...input({
      now: "2026-10-03T14:00:00.000Z",
      task: { ...input().task, dueOn: "2026-09-28", recurrence: weeklyRecurrence },
    }),
  });
  assert.equal(weeklyToday.activeStatus, "pending");

  const monthlyRecurrence = { kind: "quota" as const, period: "month" as const, count: 4, balanceEnabled: false, activationDate: "2026-10-01" };
  const monthlyFuture = evaluateTaskState({
    ...input({
      now: "2026-10-01T14:00:00.000Z",
      task: { ...input().task, dueOn: "2026-10-01", recurrence: monthlyRecurrence },
    }),
  });
  assert.equal(monthlyFuture.nextDueDate, "2026-10-28");
  assert.equal(monthlyFuture.activeStatus, "not_due");
});

test("quota activation does not retroactively miss dates before its boundary", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: false, activationDate: "2026-10-01" };
  const result = evaluateTaskState({
    ...input({ now: "2026-10-03T14:00:00.000Z", task: { ...input().task, dueOn: "2026-10-01", recurrence } }),
    action: { type: "reconcile_rollover" },
  });
  assert.equal(result.proposedHistoryChanges.some((change) => change.type === "insert" && change.row.logicalDate < "2026-10-01"), false);
});

test("first partial weekly quota uses only physical capacity since activation", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: true, activationDate: "2026-10-03" };
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2026-10-03" }).baseQuota, 2);
  assert.equal(quotaPeriodEvaluation({
    recurrence: { ...recurrence, activationDate: "2026-10-04" },
    logicalDate: "2026-10-04",
  }).baseQuota, 1);
});

test("first partial monthly quota uses only physical capacity since activation", () => {
  const recurrence = { kind: "quota" as const, period: "month" as const, count: 10, balanceEnabled: true, activationDate: "2026-01-28" };
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2026-01-28" }).baseQuota, 4);
  assert.equal(quotaPeriodEvaluation({
    recurrence: { ...recurrence, count: 31, activationDate: "2026-02-20" },
    logicalDate: "2026-02-20",
  }).baseQuota, 9);
});

test("a later complete period returns to configured quota capacity", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: true, activationDate: "2026-10-03" };
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2026-10-03" }).baseQuota, 2);
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2026-10-05" }).baseQuota, 3);
});

test("canonical quota facts override a stale Task-row incoming balance", () => {
  const recurrence = {
    kind: "quota" as const,
    period: "week" as const,
    count: 3,
    balanceEnabled: true,
    activationDate: "2026-09-28",
    scheduleBoundaryId: "boundary-a",
    incomingBalance: -99,
  };
  const fact = quotaPeriodFactFor({
    recurrence: { ...recurrence, incomingBalance: 0 },
    periodDate: "2026-10-04",
    history: [historyRow("2026-10-03"), historyRow("2026-10-04")],
    eventKind: "period_close",
    idempotenceIdentity: "close-a",
  });
  assert.equal(fact.nextBalance, -1);
  const next = quotaPeriodEvaluation({ recurrence, logicalDate: "2026-10-05", quotaPeriodFacts: [{
    ...fact,
    scheduleBoundaryId: "boundary-a",
    id: "fact-a",
    createdAt: "2026-10-05T00:00:00.000Z",
  }] });
  assert.equal(next.incomingBalance, -1);
});

test("a canonical clear fact reconstructs zero without deleting History", () => {
  const recurrence = {
    kind: "quota" as const,
    period: "week" as const,
    count: 3,
    balanceEnabled: true,
    activationDate: "2026-09-28",
    scheduleBoundaryId: "boundary-a",
  };
  const clear = quotaPeriodFactFor({
    recurrence,
    periodDate: "2026-10-05",
    history: [historyRow("2026-10-05")],
    eventKind: "clear_balance",
    idempotenceIdentity: "clear-a",
  });
  assert.equal(quotaPeriodEvaluation({
    recurrence,
    logicalDate: "2026-10-05",
    history: [historyRow("2026-10-05")],
    quotaPeriodFacts: [{ ...clear, id: "clear-fact", createdAt: "2026-10-05T01:00:00.000Z" }],
  }).incomingBalance, 0);
});

test("Clear Balance resets incoming debt without erasing current-period quota arithmetic", () => {
  const recurrence = {
    kind: "quota" as const,
    period: "week" as const,
    count: 3,
    balanceEnabled: true,
    activationDate: "2026-10-05",
    incomingBalance: -3,
    scheduleBoundaryId: "boundary-clear",
  };
  for (const [label, successDates, expectedNextBalance] of [
    ["zero successes", [], -3],
    ["partial successes", ["2026-10-06"], -2],
    ["full quota", ["2026-10-06", "2026-10-07", "2026-10-08"], 0],
    ["extra successes", ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"], 1],
  ] as const) {
    const history = successDates.map((date) => historyRow(date));
    const clear = quotaPeriodFactFor({
      recurrence,
      periodDate: "2026-10-05",
      history,
      eventKind: "clear_balance",
      idempotenceIdentity: `clear-${label}`,
    });
    const evaluation = quotaPeriodEvaluation({
      recurrence,
      logicalDate: "2026-10-11",
      history,
      quotaPeriodFacts: [{ ...clear, id: `fact-${label}`, createdAt: "2026-10-05T01:00:00.000Z" }],
    });
    assert.equal(evaluation.incomingBalance, 0, label);
    assert.equal(evaluation.nextBalance, expectedNextBalance, label);
  }
});

test("future quota Calendar projection carries a cleared period's outgoing balance before and after close", () => {
  const recurrence = {
    kind: "quota" as const,
    period: "week" as const,
    count: 3,
    balanceEnabled: true,
    activationDate: "2026-10-05",
    scheduleBoundaryId: "boundary-clear-calendar",
  };
  const history = [historyRow("2026-10-06")];
  const clear = quotaPeriodFactFor({
    recurrence,
    periodDate: "2026-10-05",
    history,
    eventKind: "clear_balance",
    idempotenceIdentity: "clear-calendar",
  });
  const clearFact = { ...clear, id: "clear-calendar-fact", createdAt: "2026-10-07T01:00:00.000Z" };
  const beforeClose = quotaPeriodEvaluation({
    recurrence,
    logicalDate: "2026-10-14",
    history,
    quotaPeriodFacts: [clearFact],
  });
  assert.equal(beforeClose.incomingBalance, -2);
  assert.equal(beforeClose.nextMandatoryDate, "2026-10-14");

  const projected = evaluateTaskState({
    ...input({
      now: "2026-10-07T14:00:00.000Z",
      history,
      task: { ...input().task, dueOn: "2026-10-05", recurrence },
      quotaPeriodFacts: [clearFact],
    }),
    calendarStart: "2026-10-05",
    calendarEnd: "2026-10-18",
  });
  assert.equal(projected.calendar["2026-10-14"], "scheduled");

  const close = quotaPeriodFactFor({
    recurrence,
    periodDate: "2026-10-05",
    history,
    quotaPeriodFacts: [clearFact],
    eventKind: "period_close",
    idempotenceIdentity: "close-calendar",
  });
  const afterClose = quotaPeriodEvaluation({
    recurrence,
    logicalDate: "2026-10-14",
    history: [...history, historyRow("2026-10-07"), historyRow("2026-10-08")],
    quotaPeriodFacts: [clearFact, { ...close, id: "close-calendar-fact", createdAt: "2026-10-12T01:00:00.000Z" }],
  });
  assert.equal(close.incomingBalance, 0);
  assert.equal(close.nextBalance, -2);
  assert.equal(afterClose.incomingBalance, -2, "the stored period_close next balance remains authoritative");
});

test("weekly quota rollover catches up multiple periods without synthetic debt compensation", () => {
  const recurrence = {
    kind: "quota" as const,
    period: "week" as const,
    count: 3,
    balanceEnabled: true,
    activationDate: "2026-09-28",
    incomingBalance: 0,
  };
  const result = evaluateTaskState({
    ...input({ now: "2026-10-13T14:00:00.000Z", task: { ...input().task, dueOn: "2026-09-28", recurrence } }),
    action: { type: "reconcile_rollover" },
  });
  const history = result.proposedHistoryChanges
    .filter((change): change is Extract<typeof change, { type: "insert" }> => change.type === "insert")
    .map((change) => change.row);
  assert.deepEqual(history.map((row) => row.logicalDate), [
    "2026-10-02", "2026-10-03", "2026-10-04",
    "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11",
    "2026-10-12",
  ]);
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2026-10-13", history }).incomingBalance, -6);

  const retry = evaluateTaskState({
    ...input({ now: "2026-10-13T14:00:00.000Z", history, task: { ...input().task, dueOn: "2026-09-28", recurrence } }),
    action: { type: "reconcile_rollover" },
  });
  assert.deepEqual(retry.proposedHistoryChanges, []);
});

test("monthly quota rollover uses natural month capacity across skipped periods", () => {
  const recurrence = {
    kind: "quota" as const,
    period: "month" as const,
    count: 3,
    balanceEnabled: true,
    activationDate: "2027-01-01",
    incomingBalance: 0,
  };
  const result = evaluateTaskState({
    ...input({ now: "2027-03-05T14:00:00.000Z", task: { ...input().task, dueOn: "2027-01-01", recurrence } }),
    action: { type: "reconcile_rollover" },
  });
  const history = result.proposedHistoryChanges
    .filter((change): change is Extract<typeof change, { type: "insert" }> => change.type === "insert")
    .map((change) => change.row);
  assert.deepEqual(history.map((row) => row.logicalDate), [
    "2027-01-29", "2027-01-30", "2027-01-31",
    "2027-02-23", "2027-02-24", "2027-02-25", "2027-02-26", "2027-02-27", "2027-02-28",
  ]);
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2027-03-05", history }).incomingBalance, -6);
  const retry = evaluateTaskState({
    ...input({ now: "2027-03-05T14:00:00.000Z", history, task: { ...input().task, dueOn: "2027-01-01", recurrence } }),
    action: { type: "reconcile_rollover" },
  });
  assert.deepEqual(retry.proposedHistoryChanges, []);
});

test("an earlier Clear Balance fact participates in skipped-period rollover reconstruction", () => {
  const recurrence = {
    kind: "quota" as const,
    period: "week" as const,
    count: 3,
    balanceEnabled: true,
    activationDate: "2026-09-28",
    incomingBalance: 3,
    scheduleBoundaryId: "boundary-clear-rollover",
  };
  const clear = quotaPeriodFactFor({
    recurrence,
    periodDate: "2026-09-28",
    eventKind: "clear_balance",
    idempotenceIdentity: "clear-skipped-week",
  });
  const clearFact = { ...clear, id: "clear-skipped-week-fact", createdAt: "2026-09-29T01:00:00.000Z" };
  const result = evaluateTaskState({
    ...input({
      now: "2026-10-13T14:00:00.000Z",
      quotaPeriodFacts: [clearFact],
      task: { ...input().task, dueOn: "2026-09-28", recurrence },
    }),
    action: { type: "reconcile_rollover" },
  });
  const history = result.proposedHistoryChanges
    .filter((change): change is Extract<typeof change, { type: "insert" }> => change.type === "insert")
    .map((change) => change.row);
  assert.deepEqual(history.map((row) => row.logicalDate), [
    "2026-10-02", "2026-10-03", "2026-10-04",
    "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11",
    "2026-10-12",
  ]);
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2026-10-13", history, quotaPeriodFacts: [clearFact] }).incomingBalance, -6);
});

test("canonical balance reconstruction follows period chronology across out-of-order facts", () => {
  const recurrence = {
    kind: "quota" as const,
    period: "week" as const,
    count: 3,
    balanceEnabled: true,
    activationDate: "2026-09-28",
    scheduleBoundaryId: "boundary-quota",
  };
  const evaluation = quotaPeriodEvaluation({
    recurrence,
    logicalDate: "2026-10-12",
    quotaPeriodFacts: [
      {
        id: "close-later-period-written-first",
        scheduleBoundaryId: "boundary-quota",
        periodKind: "week",
        periodKey: "2026-10-05",
        periodStart: "2026-10-05",
        periodEnd: "2026-10-11",
        baseQuota: 3,
        incomingBalance: -1,
        successfulDays: 4,
        nextBalance: 0,
        balanceEnabled: true,
        eventKind: "period_close",
        createdAt: "2026-10-12T00:00:00.000Z",
      },
      {
        id: "close-earlier-period-written-later",
        scheduleBoundaryId: "boundary-quota",
        periodKind: "week",
        periodKey: "2026-09-28",
        periodStart: "2026-09-28",
        periodEnd: "2026-10-04",
        baseQuota: 3,
        incomingBalance: 0,
        successfulDays: 5,
        nextBalance: 2,
        balanceEnabled: true,
        eventKind: "period_close",
        createdAt: "2026-10-13T00:00:00.000Z",
      },
    ],
  });
  assert.equal(evaluation.incomingBalance, 0);
});

test("one successful quota action is reward eligible once", () => {
  const result = evaluateTaskState({
    ...input({ now: "2026-10-02T14:00:00.000Z", task: { ...input().task, recurrence: { kind: "quota", period: "week", count: 1, balanceEnabled: false } } }),
    action: { type: "record_outcome", outcome: "done", logicalDate: "2026-10-02" },
  });
  assert.equal(result.rewardEligibility.eligible, true);
});

test("an untouched optional quota date creates no reward or miss", () => {
  const result = evaluateTaskState({ ...input({ now: "2026-09-28T14:00:00.000Z", task: { ...input().task, recurrence: { kind: "quota", period: "week", count: 1, balanceEnabled: false } } }) });
  assert.equal(result.rewardEligibility.eligible, false);
  assert.equal(result.proposedHistoryChanges.length, 0);
});

test("non-balance extra success is non-counting and non-rewardable", () => {
  const result = evaluateTaskState({
    ...input({ history: [historyRow("2026-09-28")], now: "2026-09-29T14:00:00.000Z", task: { ...input().task, recurrence: { kind: "quota", period: "week", count: 1, balanceEnabled: false } } }),
    action: { type: "record_outcome", outcome: "done", logicalDate: "2026-09-29" },
  });
  const row = result.proposedHistoryChanges.find((change) => change.type === "insert");
  assert.equal(result.rewardEligibility.eligible, false);
  assert.equal(row?.type === "insert" ? row.row.countedAsDueOccurrence : true, false);
});

test("balance-enabled extra success remains a normal rewardable occurrence", () => {
  const result = evaluateTaskState({
    ...input({ history: [historyRow("2026-09-28")], now: "2026-09-29T14:00:00.000Z", task: { ...input().task, recurrence: { kind: "quota", period: "week", count: 1, balanceEnabled: true } } }),
    action: { type: "record_outcome", outcome: "done", logicalDate: "2026-09-29" },
  });
  assert.equal(result.rewardEligibility.eligible, true);
  assert.equal(result.proposedHistoryChanges.some((change) => change.type === "insert" && change.row.countedAsDueOccurrence), true);
});

test("Delay is filtered out of selectable quota actions", () => {
  assert.equal(canTaskDelay({ dueOn: "2026-10-02", repeatFrequency: "per_week", status: "pending" }), false);
  assert.equal(canTaskDelay({ dueOn: "2026-10-02", repeatFrequency: "daily", status: "pending" }), true);
  assert.equal(getSelectableTaskStatusesForRepeatFrequency("per_week").includes("delayed"), false);
  assert.equal(getTaskHistoryCalendarActionStatuses({ repeat_frequency: "per_week" }).includes("delayed"), false);
});
