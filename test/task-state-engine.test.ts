import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateTaskState,
  logicalDateForTimestamp,
  type TaskHistoryOutcome,
  type TaskStateEngineInput,
  type TaskStateHistoryRow,
  type TaskStateSnapshot,
} from "../src/lib/task-state-engine/index.ts";

const NOW = "2026-07-30T14:00:00.000Z"; // 10:00 America/New_York

function task(overrides: Partial<TaskStateSnapshot> = {}): TaskStateSnapshot {
  return {
    id: "task-1",
    lifecycle: "active",
    activeStatus: "pending",
    dueOn: "2026-07-30",
    recurrence: { kind: "rolling", intervalDays: 1 },
    ...overrides,
  };
}

function history(
  logicalDate: string,
  outcome: TaskHistoryOutcome,
  overrides: Partial<TaskStateHistoryRow> = {},
): TaskStateHistoryRow {
  return {
    id: `history-${logicalDate}-${outcome}`,
    taskId: "task-1",
    logicalDate,
    outcome,
    provenance: "manual",
    occurredAt: `${logicalDate}T14:00:00.000Z`,
    ...overrides,
  };
}

function input(overrides: Partial<TaskStateEngineInput> = {}): TaskStateEngineInput {
  return {
    task: task(),
    history: [],
    now: NOW,
    timezone: "America/New_York",
    logicalDayRollover: "06:00",
    ...overrides,
  };
}

test("logical day changes exactly at the configured 06:00 rollover", () => {
  assert.equal(logicalDateForTimestamp("2026-07-30T09:59:00Z", "America/New_York", "06:00"), "2026-07-29");
  assert.equal(logicalDateForTimestamp("2026-07-30T10:00:00Z", "America/New_York", "06:00"), "2026-07-30");
});

test("open scheduled tasks roll to continuous Missed without advancing due_on", () => {
  const result = evaluateTaskState(input({
    task: task({ dueOn: "2026-07-28", recurrence: { kind: "rolling", intervalDays: 5 } }),
  }));
  assert.deepEqual(result.proposedHistoryChanges.map((change) => change.type === "insert" && [change.row.logicalDate, change.row.outcome]), [
    ["2026-07-28", "missed"],
    ["2026-07-29", "missed"],
  ]);
  assert.equal(result.activeStatus, "missed");
  assert.equal(result.nextDueDate, "2026-07-28");
  assert.equal(result.calendar["2026-07-30"], "open");
  assert.equal(result.handledCurrentDay, false);
});

test("stale In Progress always rolls to Did My Best, including Unscheduled", () => {
  for (const snapshot of [
    task({ activeStatus: "in_progress", activeStatusLogicalDate: "2026-07-29" }),
    task({
      activeStatus: "in_progress",
      activeStatusLogicalDate: "2026-07-29",
      activeOccurrenceDueOn: null,
      dueOn: null,
      recurrence: { kind: "none" },
    }),
  ]) {
    const result = evaluateTaskState(input({ task: snapshot }));
    assert.equal((result.proposedHistoryChanges[0] as { row: TaskStateHistoryRow }).row.outcome, "did_my_best");
    assert.equal(result.rewardEligibility.eligible, true);
    assert.equal(result.proposedTaskPatch.activeStatusLogicalDate, null);
  }
});

test("same-logical-day In Progress remains In Progress", () => {
  const result = evaluateTaskState(input({
    task: task({ activeStatus: "in_progress", activeStatusLogicalDate: "2026-07-30" }),
  }));
  assert.equal(result.activeStatus, "in_progress");
  assert.equal(result.calendar["2026-07-30"], "in_progress");
  assert.equal(result.proposedHistoryChanges.length, 0);
});

test("Unscheduled tasks never become Missed and inactivity only breaks a positive streak", () => {
  const result = evaluateTaskState(input({
    task: task({ activeStatus: "unscheduled", dueOn: null, recurrence: { kind: "none" } }),
  }));
  assert.equal(result.activeStatus, "unscheduled");
  assert.equal(result.calendar["2026-07-30"], "open");
  assert.equal(result.streakDisposition, "break_positive");
  assert.equal(result.proposedHistoryChanges.length, 0);
});

test("Calendar Open and active Missed coexist while Missed Today remains false", () => {
  const result = evaluateTaskState(input({
    task: task({ activeStatus: "missed", dueOn: "2026-07-28" }),
    history: [history("2026-07-28", "missed"), history("2026-07-29", "missed")],
  }));
  assert.equal(result.calendar["2026-07-30"], "open");
  assert.equal(result.activeStatus, "missed");
  assert.equal(result.currentDayOutcome.missedToday, false);
});

test("manual current-day Missed handles but does not advance an active occurrence", () => {
  const result = evaluateTaskState(input({
    action: { type: "record_outcome", outcome: "missed" },
  }));
  assert.equal(result.handledCurrentDay, true);
  assert.equal(result.currentDayOutcome.missedToday, true);
  assert.equal(result.nextDueDate, "2026-07-30");
  assert.equal(result.rewardEligibility.eligible, false);
});

test("one-off overdue Did My Best records an attempt but preserves the obligation", () => {
  const result = evaluateTaskState(input({
    task: task({ activeStatus: "missed", dueOn: "2026-07-28", recurrence: { kind: "none" } }),
    history: [history("2026-07-28", "missed"), history("2026-07-29", "missed")],
    action: { type: "record_outcome", outcome: "did_my_best" },
  }));
  assert.equal(result.currentDayOutcome.outcome, "did_my_best");
  assert.equal(result.lifecycle, "active");
  assert.equal(result.nextDueDate, "2026-07-28");
  assert.equal(result.activeStatus, "missed");
});

test("rolling recurrence supports every positive X and rebases from actual success date", () => {
  for (const intervalDays of [1, 2, 3, 17]) {
    const result = evaluateTaskState(input({
      task: task({ dueOn: "2026-07-31", recurrence: { kind: "rolling", intervalDays } }),
      action: { type: "record_outcome", outcome: "done", logicalDate: "2026-07-29" },
    }));
    const expected = new Date(Date.UTC(2026, 6, 29 + intervalDays)).toISOString().slice(0, 10);
    assert.equal(result.nextDueDate, expected);
  }
});

test("Every X Days Until Complete accepts Did My Best and schedules the next attempt", () => {
  const result = evaluateTaskState(input({
    task: task({ recurrence: { kind: "rolling", intervalDays: 9, untilComplete: true } }),
    action: { type: "record_outcome", outcome: "did_my_best" },
  }));
  assert.equal(result.nextDueDate, "2026-08-08");
  assert.equal(result.activeStatus, "not_due");
});

test("fixed weekly early completion preserves cadence", () => {
  const result = evaluateTaskState(input({
    task: task({
      dueOn: "2026-08-02",
      recurrence: { kind: "weekly", weekdays: [0], anchorDate: "2026-08-02" },
    }),
    action: { type: "record_outcome", outcome: "done", logicalDate: "2026-07-31" },
  }));
  assert.equal(result.satisfiedOccurrenceIdentity, "task:task-1:occurrence:2026-08-02");
  assert.equal(result.nextDueDate, "2026-08-09");
});

test("late fixed-calendar success satisfies the outstanding occurrence without cadence drift", () => {
  const result = evaluateTaskState(input({
    now: "2026-08-03T14:00:00Z",
    task: task({
      dueOn: "2026-08-02",
      recurrence: { kind: "weekly", weekdays: [0], anchorDate: "2026-08-02" },
    }),
    action: { type: "record_outcome", outcome: "done", logicalDate: "2026-08-03" },
  }));
  assert.equal(result.satisfiedOccurrenceIdentity, "task:task-1:occurrence:2026-08-02");
  assert.equal(result.nextDueDate, "2026-08-09");
});

test("fixed monthly date and ordinal schedules preserve their configured pattern", () => {
  const cases = [
    {
      recurrence: { kind: "monthly", mode: "day_of_month", dayOfMonth: 15, anchorDate: "2026-08-15" } as const,
      dueOn: "2026-08-15",
      expected: "2026-09-15",
    },
    {
      recurrence: { kind: "monthly", mode: "ordinal_weekday", ordinal: "first", weekday: 2, anchorDate: "2026-08-04" } as const,
      dueOn: "2026-08-04",
      expected: "2026-09-01",
    },
  ];
  for (const item of cases) {
    const result = evaluateTaskState(input({
      task: task({ dueOn: item.dueOn, recurrence: item.recurrence }),
      action: { type: "record_outcome", outcome: "done", logicalDate: "2026-07-30" },
    }));
    assert.equal(result.nextDueDate, item.expected);
  }
});

test("multiple weekdays consume only the nearest scheduled occurrence", () => {
  const result = evaluateTaskState(input({
    task: task({
      dueOn: "2026-08-04",
      recurrence: { kind: "weekly", weekdays: [0, 2], anchorDate: "2026-08-04" },
    }),
    action: { type: "record_outcome", outcome: "done", logicalDate: "2026-08-03" },
  }));
  assert.equal(result.satisfiedOccurrenceIdentity, "task:task-1:occurrence:2026-08-04");
  assert.equal(result.nextDueDate, "2026-08-09");
});

test("an extra Not Due outcome does not consume a second fixed occurrence", () => {
  const recurrence = { kind: "weekly", weekdays: [0, 2], anchorDate: "2026-08-04" } as const;
  const result = evaluateTaskState(input({
    now: "2026-08-05T14:00:00Z",
    task: task({ dueOn: "2026-08-04", recurrence }),
    history: [
      history("2026-08-03", "done", { occurrenceIdentity: "task:task-1:occurrence:2026-08-04" }),
    ],
    action: { type: "record_outcome", outcome: "done", logicalDate: "2026-08-05" },
  }));
  assert.equal(result.nextDueDate, "2026-08-09");
});

test("future status boundary is Upcoming for 1-7 days and Not Due for 8+", () => {
  for (const [dueOn, expected] of [["2026-08-06", "upcoming"], ["2026-08-07", "not_due"]] as const) {
    assert.equal(evaluateTaskState(input({ task: task({ dueOn }) })).activeStatus, expected);
  }
});

test("Delay anchors from the action date, exits overdue, and preserves streak", () => {
  const result = evaluateTaskState(input({
    task: task({ activeStatus: "missed", dueOn: "2026-07-20" }),
    history: [history("2026-07-20", "missed")],
    action: { type: "record_outcome", outcome: "delayed", delayDays: 5, logicalDate: "2026-07-31" },
    now: "2026-07-31T14:00:00Z",
  }));
  assert.equal(result.nextDueDate, "2026-08-05");
  assert.equal(result.continuousOverdue.active, false);
  assert.equal(result.streakDisposition, "preserve_positive");
});

test("Complete terminates recurrence", () => {
  const result = evaluateTaskState(input({
    task: task({ recurrence: { kind: "rolling", intervalDays: 1, untilComplete: true } }),
    action: { type: "record_outcome", outcome: "complete" },
  }));
  assert.equal(result.activeStatus, "complete");
  assert.equal(result.nextDueDate, null);
  assert.ok(result.proposedTaskPatch.completedAt);
});

test("backdated success seeds cadence when due_on is null", () => {
  const result = evaluateTaskState(input({
    task: task({ activeStatus: "unscheduled", dueOn: null, recurrence: { kind: "rolling", intervalDays: 4 } }),
    action: { type: "record_outcome", outcome: "done", logicalDate: "2026-07-20" },
  }));
  assert.equal(result.recurrenceAnchor, "2026-07-20");
  assert.equal(result.nextDueDate, "2026-07-24");
});

test("backdated Missed without an occurrence is rejected", () => {
  const result = evaluateTaskState(input({
    task: task({ activeStatus: "unscheduled", dueOn: null, recurrence: { kind: "none" } }),
    action: { type: "record_outcome", outcome: "missed", logicalDate: "2026-07-20" },
  }));
  assert.equal(result.proposedHistoryChanges[0]?.type, "reject");
  assert.match(result.validationErrors[0], /active due occurrence/);
});

test("one outcome and one reward identity are allowed per task/logical day", () => {
  const existing = history("2026-07-30", "done");
  const result = evaluateTaskState(input({
    history: [existing],
    action: { type: "record_outcome", outcome: "did_my_best" },
  }));
  assert.equal(result.proposedHistoryChanges[0]?.type, "reject");
  assert.equal(result.rewardEligibility.identity, "task-reward:task-1:2026-07-30:done");
});

test("repeated engine evaluation is idempotent", () => {
  const value = input({
    task: task({
      dueOn: "2026-08-02",
      recurrence: { kind: "weekly", weekdays: [0], anchorDate: "2026-08-02" },
    }),
    history: [history("2026-07-31", "done")],
  });
  const before = structuredClone(value);
  assert.deepEqual(evaluateTaskState(value), evaluateTaskState(value));
  assert.deepEqual(value, before);
});

test("explicit History overrides virtual Calendar state", () => {
  const result = evaluateTaskState(input({
    task: task({ dueOn: "2026-07-28" }),
    history: [history("2026-07-29", "delayed")],
  }));
  assert.equal(result.calendar["2026-07-29"], "delayed");
});

test("restricted engine patches can never propose archive, trash, delete, or unrelated fields", () => {
  const scenarios = [
    input({ task: task({ dueOn: "2026-07-28" }) }),
    input({ action: { type: "record_outcome", outcome: "done" } }),
    input({ action: { type: "record_outcome", outcome: "delayed", delayDays: 3 } }),
    input({ action: { type: "record_outcome", outcome: "complete" }, task: task({ recurrence: { kind: "rolling", intervalDays: 1, untilComplete: true } }) }),
  ];
  const forbidden = ["lifecycle", "archived", "archivedAt", "trashed", "trashedAt", "deleted", "deletedAt", "title", "description", "listId", "folderId"];
  for (const scenario of scenarios) {
    const patch = evaluateTaskState(scenario).proposedTaskPatch;
    assert.equal(forbidden.some((field) => Object.hasOwn(patch, field)), false);
  }
});

test("archived and trashed snapshots are read-only lifecycle facts with no rollover plans", () => {
  for (const lifecycle of ["archived", "trashed"] as const) {
    const result = evaluateTaskState(input({
      task: task({
        lifecycle,
        activeStatus: "in_progress",
        activeStatusLogicalDate: "2026-07-20",
        dueOn: "2026-07-20",
      }),
    }));
    assert.equal(result.lifecycle, lifecycle);
    assert.deepEqual(result.proposedHistoryChanges, []);
    assert.deepEqual(result.proposedTaskPatch, {});
  }
});
