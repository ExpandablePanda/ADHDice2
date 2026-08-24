import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateTaskState,
  logicalDateForTimestamp,
  type TaskHistoryOutcome,
  type TaskStateEngineInput,
  type TaskStateHistoryRow,
  type TaskStateSnapshot,
  projectPersistableTaskStatePatch,
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

test("fixed Weekdays schedule agrees for historical, current, and future dates", () => {
  const result = evaluateTaskState(input({
    calendarEnd: "2026-08-09",
    calendarStart: "2026-08-01",
    now: "2026-08-04T14:00:00.000Z",
    task: task({
      dueOn: "2026-08-05",
      recurrence: { kind: "weekly", weekdays: [1, 2, 3, 4, 5], anchorDate: "2026-08-05" },
    }),
  }));

  for (const dateKey of ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"]) {
    assert.equal(result.calendar[dateKey], "scheduled", dateKey);
  }
  for (const dateKey of ["2026-08-01", "2026-08-02", "2026-08-08", "2026-08-09"]) {
    assert.equal(result.calendar[dateKey], "no_entry", dateKey);
  }
});

test("a historical Weekdays Missed action remains canonical after due_on advances", () => {
  const result = evaluateTaskState(input({
    now: "2026-08-04T14:00:00.000Z",
    task: task({
      activeStatus: "upcoming",
      dueOn: "2026-08-05",
      recurrence: { kind: "weekly", weekdays: [1, 2, 3, 4, 5], anchorDate: "2026-08-05" },
    }),
    action: { type: "record_outcome", logicalDate: "2026-08-03", outcome: "missed" },
  }));

  assert.deepEqual(result.validationErrors, []);
  assert.deepEqual(result.proposedHistoryChanges.map((change) => change.type === "insert"
    ? [change.row.logicalDate, change.row.outcome]
    : [change.logicalDate, "rejected"]), [["2026-08-03", "missed"]]);
  assert.equal(result.nextDueDate, "2026-08-05");
});

test("normal Missed still rejects a Daily date before the live due cursor", () => {
  const result = evaluateTaskState(input({
    now: "2026-08-06T14:00:00.000Z",
    task: task({ dueOn: "2026-08-10" }),
    action: { type: "record_outcome", logicalDate: "2026-08-03", outcome: "missed" },
  }));

  assert.ok(result.validationErrors.some((error) => error.includes("Missed requires")));
  assert.equal(result.proposedHistoryChanges.length, 1);
  assert.equal(result.proposedHistoryChanges[0]?.type, "reject");
});

test("historical Missed override accepts a Daily date before the live due cursor", () => {
  const result = evaluateTaskState(input({
    now: "2026-08-06T14:00:00.000Z",
    task: task({ dueOn: "2026-08-10" }),
    action: {
      type: "record_outcome",
      historicalOverride: true,
      logicalDate: "2026-08-03",
      occurrenceDueOn: "2026-08-03",
      outcome: "missed",
    },
  }));
  const inserted = result.proposedHistoryChanges.find((change) => change.type === "insert");

  assert.deepEqual(result.validationErrors, []);
  assert.equal(result.proposedHistoryChanges.filter((change) => change.type === "insert").length, 1);
  assert.equal(inserted?.type === "insert" ? inserted.row.logicalDate : null, "2026-08-03");
  assert.equal(inserted?.type === "insert" ? inserted.row.outcome : null, "missed");
  assert.equal(inserted?.type === "insert" ? inserted.row.occurrenceDueOn : null, "2026-08-03");
});

test("No Repeat Done is allowed only in historical override mode", () => {
  const normal = evaluateTaskState(input({
    task: task({ dueOn: null, recurrence: { kind: "none" } }),
    action: { type: "record_outcome", logicalDate: "2026-08-03", outcome: "done" },
  }));
  const override = evaluateTaskState(input({
    task: task({ dueOn: null, recurrence: { kind: "none" } }),
    action: {
      type: "record_outcome",
      historicalOverride: true,
      logicalDate: "2026-08-03",
      outcome: "done",
    },
  }));

  assert.ok(normal.validationErrors.length > 0);
  assert.deepEqual(override.validationErrors, []);
  assert.equal(override.proposedHistoryChanges.filter((change) => change.type === "insert").length, 1);
});

test("schedule changes preserve an unresolved identity-bearing Missed occurrence", () => {
  const missed = history("2026-08-03", "missed", {
    countedAsDueOccurrence: false,
    occurrenceIdentity: "task:task-1:occurrence:2026-08-03",
    occurrenceDueOn: "2026-08-03",
  });
  const first = evaluateTaskState(input({
    now: "2026-08-04T14:00:00.000Z",
    task: task({ activeStatus: "pending", dueOn: "2026-08-05" }),
    history: [missed],
    action: { type: "change_schedule" },
  }));
  assert.equal(first.activeStatus, "upcoming");
  assert.equal(first.unresolvedOccurrenceIdentity, "task:task-1:occurrence:2026-08-03");
  assert.equal(first.proposedHistoryChanges.length, 0);

  const second = evaluateTaskState(input({
    now: "2026-08-04T14:00:00.000Z",
    task: task({ activeStatus: "missed", dueOn: "2026-08-04" }),
    history: [missed],
    action: { type: "change_schedule" },
  }));
  assert.equal(second.activeStatus, "missed");
  assert.equal(second.nextDueDate, "2026-08-04");
  assert.equal(second.proposedTaskPatch.activeOccurrenceDueOn, undefined);
  assert.equal(second.proposedTaskPatch.activeStatusLogicalDate, undefined);
});

test("a schedule change without unresolved Missed derives the new Pending or Upcoming state", () => {
  const pending = evaluateTaskState(input({
    now: "2026-08-04T14:00:00.000Z",
    task: task({ activeStatus: "upcoming", dueOn: "2026-08-05" }),
    action: { type: "change_schedule" },
  }));
  assert.equal(pending.activeStatus, "upcoming");

  const today = evaluateTaskState(input({
    now: "2026-08-04T14:00:00.000Z",
    task: task({ activeStatus: "pending", dueOn: "2026-08-04" }),
    action: { type: "change_schedule" },
  }));
  assert.equal(today.activeStatus, "pending");
});

test("identity-less fixed-schedule Missed History still preserves the unresolved chain", () => {
  const result = evaluateTaskState(input({
    now: "2026-08-05T14:00:00.000Z",
    task: task({
      activeStatus: "pending",
      dueOn: "2026-08-05",
      recurrence: { kind: "weekly", weekdays: [1, 2, 3, 4, 5], anchorDate: "2026-08-05" },
    }),
    history: [history("2026-08-03", "missed"), history("2026-08-04", "missed")],
    action: { type: "change_schedule" },
  }));
  assert.equal(result.activeStatus, "missed");
  assert.equal(result.unresolvedOccurrenceIdentity, null);
  assert.equal(result.unresolvedOccurrenceDueOn, null);
  assert.deepEqual(result.proposedHistoryChanges, []);
});

test("Done and Did My Best consume the unresolved Missed occurrence exactly once", () => {
  const missed = history("2026-08-03", "missed", {
    occurrenceIdentity: "task:task-1:occurrence:2026-08-03",
    occurrenceDueOn: "2026-08-03",
  });
  for (const outcome of ["done", "did_my_best"] as const) {
    const result = evaluateTaskState(input({
      now: "2026-08-04T14:00:00.000Z",
      task: task({ activeStatus: "missed", dueOn: "2026-08-04" }),
      history: [missed],
      action: { type: "record_outcome", logicalDate: "2026-08-04", outcome },
    }));
    const inserted = result.proposedHistoryChanges.find((change) => change.type === "insert");
    assert.equal(result.unresolvedOccurrenceIdentity, null);
    assert.equal(inserted?.type === "insert" ? inserted.row.occurrenceIdentity : null, "task:task-1:occurrence:2026-08-04");
    assert.equal(result.proposedHistoryChanges.filter((change) => change.type === "insert").length, 1);
  }
});

test("independent Daily keeps older Missed History but derives Upcoming after a later success", () => {
  for (const outcome of ["done", "did_my_best"] as const) {
    const missedRows = [
      history("2026-08-20", "missed", {
        occurrenceIdentity: "task:task-1:occurrence:2026-08-20",
        occurrenceDueOn: "2026-08-20",
      }),
      history("2026-08-21", "missed", {
        occurrenceIdentity: "task:task-1:occurrence:2026-08-21",
        occurrenceDueOn: "2026-08-21",
      }),
    ];
    const result = evaluateTaskState(input({
      now: "2026-08-23T14:00:00.000Z",
      task: task({ activeStatus: "missed", dueOn: "2026-08-24" }),
      history: [
        ...missedRows,
        history("2026-08-23", outcome, {
          occurrenceIdentity: "task:task-1:occurrence:2026-08-23",
          occurrenceDueOn: "2026-08-23",
        }),
      ],
    }));

    assert.equal(result.activeStatus, "upcoming", outcome);
    assert.equal(result.nextDueDate, "2026-08-24", outcome);
    assert.equal(result.unresolvedOccurrenceIdentity, null, outcome);
    assert.equal(result.proposedHistoryChanges.length, 0, outcome);
  }
});

test("independent Daily success gets its own action-day identity when old Missed rows are ambiguous", () => {
  for (const outcome of ["done", "did_my_best"] as const) {
    const result = evaluateTaskState(input({
      now: "2026-08-23T14:00:00.000Z",
      task: task({ activeStatus: "missed", dueOn: "2026-08-23" }),
      history: [
        history("2026-08-20", "missed", { occurrenceIdentity: "task:task-1:occurrence:2026-08-20", occurrenceDueOn: "2026-08-20" }),
        history("2026-08-21", "missed", { occurrenceIdentity: "task:task-1:occurrence:2026-08-21", occurrenceDueOn: "2026-08-21" }),
      ],
      action: { type: "record_outcome", logicalDate: "2026-08-23", outcome },
    }));
    const inserted = result.proposedHistoryChanges.find((change) => change.type === "insert");

    assert.equal(inserted?.type === "insert" ? inserted.row.occurrenceIdentity : null, "task:task-1:occurrence:2026-08-23", outcome);
    assert.equal(inserted?.type === "insert" ? inserted.row.occurrenceDueOn : null, "2026-08-23", outcome);
    assert.equal(result.nextDueDate, "2026-08-24", outcome);
    assert.equal(result.activeStatus, "upcoming", outcome);
  }
});

test("Daily Until Complete keeps its existing unresolved Missed semantics", () => {
  const result = evaluateTaskState(input({
    now: "2026-08-23T14:00:00.000Z",
    task: task({ activeStatus: "missed", dueOn: "2026-08-24", recurrence: { kind: "rolling", intervalDays: 1, untilComplete: true } }),
    history: [
      history("2026-08-20", "missed", { occurrenceIdentity: "task:task-1:occurrence:2026-08-20", occurrenceDueOn: "2026-08-20" }),
      history("2026-08-21", "missed", { occurrenceIdentity: "task:task-1:occurrence:2026-08-21", occurrenceDueOn: "2026-08-21" }),
      history("2026-08-23", "done", { occurrenceIdentity: "task:task-1:occurrence:2026-08-23", occurrenceDueOn: "2026-08-23" }),
    ],
  }));

  assert.equal(result.activeStatus, "missed");
});

test("Delayed resolves the occurrence through one coherent engine plan", () => {
  const missed = history("2026-08-03", "missed", {
    occurrenceIdentity: "task:task-1:occurrence:2026-08-03",
    occurrenceDueOn: "2026-08-03",
  });
  const result = evaluateTaskState(input({
    now: "2026-08-04T14:00:00.000Z",
    task: task({ activeStatus: "missed", dueOn: "2026-08-04" }),
    history: [missed],
    action: { type: "record_outcome", logicalDate: "2026-08-04", outcome: "delayed", delayUntilDate: "2026-08-06" },
  }));
  const inserted = result.proposedHistoryChanges.find((change) => change.type === "insert");
  assert.equal(result.unresolvedOccurrenceIdentity, null);
  assert.equal(result.nextDueDate, "2026-08-06");
  assert.equal(inserted?.type === "insert" ? inserted.row.occurrenceIdentity : null, missed.occurrenceIdentity);
});

test("open scheduled tasks derive continuous Missed without advancing due_on or writing History", () => {
  const result = evaluateTaskState(input({
    task: task({ dueOn: "2026-07-28", recurrence: { kind: "rolling", intervalDays: 5 } }),
  }));
  assert.deepEqual(result.proposedHistoryChanges, []);
  assert.equal(result.activeStatus, "missed");
  assert.equal(result.nextDueDate, "2026-07-28");
  assert.equal(result.calendar["2026-07-30"], "open");
  assert.equal(result.handledCurrentDay, false);
});

test("daily overdue preserves the last satisfied occurrence and proposes exactly one missed day", () => {
  const satisfiedIdentity = "task:task-1:occurrence:2026-07-29";
  const result = evaluateTaskState(input({
    now: "2026-07-31T14:00:00.000Z",
    task: task({
      activeStatus: "pending",
      dueOn: "2026-07-30",
      recurrence: { kind: "rolling", intervalDays: 1 },
      recurrenceCursor: "2026-07-29",
      satisfiedOccurrenceIdentity: satisfiedIdentity,
    }),
    history: [history("2026-07-29", "done", { occurrenceIdentity: satisfiedIdentity })],
  }));

  assert.equal(result.calendar["2026-07-29"], "done");
  assert.equal(result.calendar["2026-07-30"], "missed");
  assert.equal(result.calendar["2026-07-31"], "open");
  assert.equal(result.activeStatus, "missed");
  assert.equal(result.nextDueDate, "2026-07-30");
  assert.equal(result.recurrenceAnchor, "2026-07-29");
  assert.equal(result.satisfiedOccurrenceIdentity, satisfiedIdentity);
  assert.deepEqual(result.proposedHistoryChanges, []);
  assert.equal(result.rewardEligibility.eligible, false);
  assert.equal(Object.hasOwn(result.proposedTaskPatch, "recurrenceCursor"), false);
  assert.equal(Object.hasOwn(result.proposedTaskPatch, "satisfiedOccurrenceIdentity"), false);
  assert.equal(["archive", "trash", "archived", "trashed"].some((key) => Object.hasOwn(result.proposedTaskPatch, key)), false);
});

test("stale In Progress clears workflow state without synthesizing Did My Best", () => {
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
    assert.deepEqual(result.proposedHistoryChanges, []);
    assert.equal(result.rewardEligibility.eligible, false);
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

test("active Missed remains Missed when fixed recurrence exposes today or a future occurrence", () => {
  for (const dueOn of ["2026-07-26", "2026-07-20"]) {
    const result = evaluateTaskState(input({
      task: task({
        activeStatus: "missed",
        dueOn,
        recurrence: { kind: "weekly", weekdays: [0], anchorDate: "2026-07-20" },
      }),
    }));
    assert.equal(result.activeStatus, "missed");
    assert.equal(result.nextDueDate, dueOn);
    assert.equal(result.calendar["2026-07-30"], "open");
  }
});

test("explicit Done History prevents one-off Done-to-Missed conversion and later generated misses", () => {
  const result = evaluateTaskState(input({
    task: task({ activeStatus: "done", dueOn: "2026-07-28", recurrence: { kind: "none" } }),
    history: [history("2026-07-28", "done")],
  }));
  assert.equal(result.activeStatus, "done");
  assert.equal(result.proposedHistoryChanges.length, 0);
  assert.equal(result.continuousOverdue.active, false);
});

test("handled History exposes continuous overdue without persisted calculated Missed rows", () => {
  const result = evaluateTaskState(input({
    task: task({ dueOn: "2026-07-20", recurrence: { kind: "none" } }),
    history: [history("2026-07-27", "did_my_best")],
  }));
  assert.deepEqual(result.proposedHistoryChanges, []);
  assert.equal(result.calendar["2026-07-28"], "missed");
  assert.equal(result.calendar["2026-07-29"], "missed");
});

test("calculated Missed never advances recurrence or persists History", () => {
  const result = evaluateTaskState(input({ task: task({ dueOn: "2026-07-28" }) }));
  assert.equal(result.nextDueDate, "2026-07-28");
  assert.deepEqual(result.proposedHistoryChanges, []);
  const projected = projectPersistableTaskStatePatch({
    status: "missed",
    dueOn: "2026-07-28",
    recurrenceCursor: "2026-07-27",
    satisfiedOccurrenceIdentity: "task:task-1:occurrence:2026-07-27",
  });
  assert.deepEqual(projected, { dueOn: "2026-07-28", status: "missed" });
});

test("persistence projection never emits engine-only Unscheduled", () => {
  assert.deepEqual(projectPersistableTaskStatePatch({ status: "unscheduled" }), { status: "pending" });
  assert.deepEqual(projectPersistableTaskStatePatch({ status: "unscheduled" }, { status: "pending" }), {});
  assert.deepEqual(projectPersistableTaskStatePatch({ status: "unscheduled", activeStatusLogicalDate: null }, { status: "in_progress" }), {
    activeStatusLogicalDate: null,
    status: "pending",
  });
});

test("persistence projection removes canonical date, timestamp, and cleared-field no-ops", () => {
  assert.deepEqual(projectPersistableTaskStatePatch({
    dueOn: "2026-07-30T00:00:00.000Z",
    completedAt: "2026-07-30T14:00:00Z",
    activeStatusLogicalDate: null,
    activeOccurrenceDueOn: null,
  }, {
    status: "complete",
    due_on: "2026-07-30",
    completed_at: "2026-07-30T10:00:00-04:00",
    active_status_logical_date: null,
    active_occurrence_due_on: null,
  }), {});
});

test("persistence projection compares timestamps at PostgreSQL microsecond precision", () => {
  assert.deepEqual(projectPersistableTaskStatePatch({
    completedAt: "2026-07-30T14:00:00.123456Z",
  }, {
    completed_at: "2026-07-30T10:00:00.123456-04:00",
  }), {});
  assert.deepEqual(projectPersistableTaskStatePatch({
    completedAt: "2026-07-30T14:00:00.123457Z",
  }, {
    completed_at: "2026-07-30T14:00:00.123456Z",
  }), { completedAt: "2026-07-30T14:00:00.123457Z" });
  assert.deepEqual(projectPersistableTaskStatePatch({
    completedAt: "2026-07-30T14:00:00.1234565Z",
  }, {
    completed_at: "2026-07-30T14:00:00.123457Z",
  }), {});
});

test("persistence projection distinguishes omitted storage from null and normalizes empty values", () => {
  assert.deepEqual(projectPersistableTaskStatePatch({ activeOccurrenceDueOn: null }, {}), {
    activeOccurrenceDueOn: null,
  });
  assert.deepEqual(projectPersistableTaskStatePatch({ activeOccurrenceDueOn: null }, {
    active_occurrence_due_on: null,
  }), {});
  assert.deepEqual(projectPersistableTaskStatePatch({ dueOn: "" }, {
    due_on: null,
  }), {});
});

test("persistence projection retains genuine canonical database changes", () => {
  assert.deepEqual(projectPersistableTaskStatePatch({
    dueOn: "2026-08-02",
    completedAt: "2026-08-01T16:00:00Z",
    activeStatusLogicalDate: null,
    activeOccurrenceDueOn: "2026-08-02",
  }, {
    status: "in_progress",
    due_on: "2026-08-01",
    completed_at: null,
    active_status_logical_date: "2026-08-01",
    active_occurrence_due_on: "2026-08-01",
  }), {
    dueOn: "2026-08-02",
    completedAt: "2026-08-01T16:00:00.000000Z",
    activeStatusLogicalDate: null,
    activeOccurrenceDueOn: "2026-08-02",
  });
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

test("an active occurrence finalizes in place and advances the weekly cursor once", () => {
  const result = evaluateTaskState(input({
    now: "2026-08-04T14:00:00Z",
    task: task({
      activeStatus: "in_progress",
      activeStatusLogicalDate: "2026-08-04",
      activeOccurrenceDueOn: "2026-08-04",
      dueOn: "2026-08-11",
      recurrence: { kind: "weekly", weekdays: [2], anchorDate: "2026-08-11" },
    }),
    action: { type: "record_outcome", outcome: "done" },
  }));

  assert.deepEqual(result.validationErrors, []);
  assert.equal(result.proposedHistoryChanges[0]?.type, "insert");
  assert.equal(result.proposedHistoryChanges[0]?.type === "insert" ? result.proposedHistoryChanges[0].row.occurrenceIdentity : null, "task:task-1:occurrence:2026-08-04");
  assert.equal(result.nextDueDate, "2026-08-11");
  assert.equal(result.activeStatus, "upcoming");
  assert.equal(result.proposedTaskPatch.activeStatusLogicalDate, null);
  assert.equal(result.proposedTaskPatch.activeOccurrenceDueOn, null);
});

test("replacing an existing successful occurrence does not advance the fixed cursor twice", () => {
  const result = evaluateTaskState(input({
    now: "2026-08-04T14:00:00Z",
    task: task({
      activeStatus: "upcoming",
      dueOn: "2026-08-11",
      recurrence: { kind: "weekly", weekdays: [2], anchorDate: "2026-08-11" },
    }),
    history: [history("2026-08-04", "done", { occurrenceIdentity: "task:task-1:occurrence:2026-08-04" })],
    action: {
      type: "record_outcome",
      outcome: "done",
      logicalDate: "2026-08-04",
      occurrenceDueOn: "2026-08-04",
      previousOutcome: "done",
      replaceExisting: true,
    },
  }));

  assert.deepEqual(result.validationErrors, []);
  assert.equal(result.nextDueDate, "2026-08-11");
  assert.equal(result.proposedHistoryChanges.filter((change) => change.type === "insert").length, 1);
});

test("Missed to Done advances from the replaced occurrence and Done to Missed restores automatic state", () => {
  const recurrence = { kind: "weekly", weekdays: [1, 2, 3, 4, 5], anchorDate: "2026-08-04" } as const;
  const completed = evaluateTaskState(input({
    now: "2026-08-04T14:00:00Z",
    task: task({ activeStatus: "missed", dueOn: "2026-08-03", recurrence }),
    history: [history("2026-08-03", "missed", { occurrenceIdentity: "task:task-1:occurrence:2026-08-03" })],
    action: {
      type: "record_outcome", outcome: "done", logicalDate: "2026-08-03",
      occurrenceDueOn: "2026-08-03", previousOutcome: "missed", replaceExisting: true,
    },
  }));
  assert.equal(completed.nextDueDate, "2026-08-04");
  assert.equal(completed.activeStatus, "pending");

  const restored = evaluateTaskState(input({
    now: "2026-08-04T14:00:00Z",
    task: task({ activeStatus: "pending", dueOn: "2026-08-04", recurrence }),
    history: [history("2026-08-03", "done", { occurrenceIdentity: "task:task-1:occurrence:2026-08-03" })],
    action: {
      type: "record_outcome", outcome: "missed", logicalDate: "2026-08-03",
      occurrenceDueOn: "2026-08-03", previousOutcome: "done", replaceExisting: true,
    },
  }));
  assert.equal(restored.nextDueDate, "2026-08-03");
  assert.equal(restored.activeStatus, "missed");
  assert.equal(restored.proposedTaskPatch.activeOccurrenceDueOn, undefined);
  assert.equal(restored.proposedTaskPatch.activeStatusLogicalDate, undefined);
});

test("every handled History transition replaces the one effective logical-date outcome", () => {
  const logicalDate = "2026-08-03";
  const outcomes: TaskHistoryOutcome[] = ["missed", "did_my_best", "done"];

  for (const previousOutcome of outcomes) {
    for (const outcome of outcomes) {
      if (previousOutcome === outcome) continue;
      const previous = history(logicalDate, previousOutcome, {
        occurrenceIdentity: `task:task-1:occurrence:${logicalDate}`,
        occurrenceDueOn: logicalDate,
      });
      const result = evaluateTaskState(input({
        task: task({ activeStatus: previousOutcome === "missed" ? "missed" : "pending", dueOn: logicalDate }),
        history: [previous],
        action: {
          type: "record_outcome",
          historicalOverride: true,
          logicalDate,
          occurrenceDueOn: logicalDate,
          outcome,
          previousOutcome,
          replaceExisting: true,
        },
      }));
      const inserted = result.proposedHistoryChanges.filter((change) => change.type === "insert");

      assert.deepEqual(result.validationErrors, [], `${previousOutcome} -> ${outcome}`);
      assert.equal(inserted.length, 1, `${previousOutcome} -> ${outcome}`);
      const replacementRow = inserted[0]?.type === "insert" ? inserted[0].row : null;
      assert.equal(replacementRow?.outcome ?? null, outcome);
      const effectiveHistory = [replacementRow].filter((row): row is TaskStateHistoryRow => Boolean(row));
      assert.deepEqual(effectiveHistory.map((row) => row.outcome), [outcome], `${previousOutcome} -> ${outcome}`);
    }
  }
});

test("Done to Missed preserves a manual future cursor instead of rewinding it", () => {
  const result = evaluateTaskState(input({
    now: "2026-08-04T14:00:00Z",
    task: task({
      activeStatus: "upcoming",
      dueOn: "2026-08-10",
      recurrence: { kind: "weekly", weekdays: [1, 2, 3, 4, 5], anchorDate: "2026-08-10" },
    }),
    history: [history("2026-08-03", "done", { occurrenceIdentity: "task:task-1:occurrence:2026-08-03" })],
    action: {
      type: "record_outcome", outcome: "missed", logicalDate: "2026-08-03",
      occurrenceDueOn: "2026-08-03", previousOutcome: "done", replaceExisting: true,
    },
  }));

  assert.equal(result.nextDueDate, "2026-08-10");
  assert.equal(result.proposedTaskPatch.dueOn, undefined);
  assert.equal(result.activeStatus, "missed");
});

test("fixed weekly success after the occurrence window belongs to the next occurrence", () => {
  const result = evaluateTaskState(input({
    now: "2026-08-03T14:00:00Z",
    task: task({
      dueOn: "2026-08-02",
      recurrence: { kind: "weekly", weekdays: [0], anchorDate: "2026-08-02" },
    }),
    action: { type: "record_outcome", outcome: "done", logicalDate: "2026-08-03" },
  }));
  assert.equal(result.satisfiedOccurrenceIdentity, "task:task-1:occurrence:2026-08-09");
  assert.equal(result.nextDueDate, "2026-08-16");
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

test("reloaded fixed schedules do not replay already-consumed History occurrences", () => {
  const cases = [
    {
      dueOn: "2026-08-09",
      occurrence: "2026-08-02",
      recurrence: { kind: "weekly", weekdays: [0], anchorDate: "2026-08-09" } as const,
    },
    {
      dueOn: "2026-08-05",
      occurrence: "2026-08-04",
      recurrence: { kind: "weekly", weekdays: [0, 2], anchorDate: "2026-08-05" } as const,
    },
    {
      dueOn: "2026-09-15",
      occurrence: "2026-08-15",
      recurrence: { kind: "monthly", mode: "day_of_month", dayOfMonth: 15, anchorDate: "2026-09-15" } as const,
    },
    {
      dueOn: "2026-12-01",
      occurrence: "2026-08-04",
      recurrence: { kind: "monthly", intervalMonths: 4, mode: "ordinal_weekday", ordinal: "first", weekday: 2, anchorDate: "2026-12-01" } as const,
    },
  ];
  for (const item of cases) {
    const result = evaluateTaskState(input({
      now: "2026-08-01T14:00:00Z",
      task: task({ dueOn: item.dueOn, recurrence: item.recurrence }),
      history: [history("2026-07-31", "done", {
        occurrenceIdentity: `task:task-1:occurrence:${item.occurrence}`,
      })],
    }));
    assert.equal(result.nextDueDate, item.dueOn);
    assert.equal(Object.hasOwn(result.proposedTaskPatch, "dueOn"), false);
  }
});

test("valid future fixed cursors ignore stale display status when legacy History has no occurrence identity", () => {
  const cases = [
    {
      activeStatus: "not_due" as const,
      dueOn: "2026-08-03",
      recurrence: { kind: "weekly", weekdays: [1], anchorDate: "2026-08-03" } as const,
    },
    {
      activeStatus: "upcoming" as const,
      dueOn: "2026-09-01",
      recurrence: { kind: "monthly", mode: "day_of_month", dayOfMonth: 1, anchorDate: "2026-09-01" } as const,
    },
  ];
  for (const item of cases) {
    const result = evaluateTaskState(input({
      now: "2026-08-01T14:00:00Z",
      task: task({ activeStatus: item.activeStatus, dueOn: item.dueOn, recurrence: item.recurrence }),
      history: [history("2026-07-31", "done", { occurrenceIdentity: null })],
    }));
    assert.equal(result.nextDueDate, item.dueOn);
    assert.equal(Object.hasOwn(result.proposedTaskPatch, "dueOn"), false);
  }
});

test("explicit identity can consume the protected future cursor exactly once", () => {
  const occurrence = history("2026-07-31", "done", {
    occurrenceIdentity: "task:task-1:occurrence:2026-08-03",
  });
  const first = evaluateTaskState(input({
    now: "2026-08-01T14:00:00Z",
    task: task({
      activeStatus: "not_due",
      dueOn: "2026-08-03",
      recurrence: { kind: "weekly", weekdays: [1], anchorDate: "2026-08-03" },
    }),
    history: [occurrence],
  }));
  assert.equal(first.nextDueDate, "2026-08-10");

  const replay = evaluateTaskState(input({
    now: "2026-08-01T14:00:00Z",
    task: task({
      activeStatus: "not_due",
      dueOn: "2026-08-10",
      recurrence: { kind: "weekly", weekdays: [1], anchorDate: "2026-08-10" },
    }),
    history: [occurrence],
  }));
  assert.equal(replay.nextDueDate, "2026-08-10");
  assert.equal(Object.hasOwn(replay.proposedTaskPatch, "dueOn"), false);
});

test("older Missed and Delayed History cannot move a valid future fixed cursor", () => {
  const result = evaluateTaskState(input({
    now: "2026-08-01T14:00:00Z",
    task: task({
      activeStatus: "not_due",
      dueOn: "2026-08-03",
      recurrence: { kind: "weekly", weekdays: [1], anchorDate: "2026-08-03" },
    }),
    history: [history("2026-07-29", "missed"), history("2026-07-30", "delayed")],
  }));
  assert.equal(result.nextDueDate, "2026-08-03");
  assert.equal(Object.hasOwn(result.proposedTaskPatch, "dueOn"), false);
});

test("fixed occurrence equality still reconciles a same-day task edit", () => {
  const result = evaluateTaskState(input({
    now: "2026-08-03T14:00:00Z",
    task: task({
      dueOn: "2026-08-02",
      recurrence: { kind: "weekly", weekdays: [0], anchorDate: "2026-08-02" },
    }),
    history: [history("2026-08-02", "done", {
      occurrenceIdentity: "task:task-1:occurrence:2026-08-02",
    })],
  }));
  assert.equal(result.nextDueDate, "2026-08-09");
  assert.equal(result.proposedTaskPatch.dueOn, "2026-08-09");
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

test("historical Missed to Did My Best produces one stable reward identity", () => {
  const base = input({
    now: "2026-08-13T14:00:00.000Z",
    task: task({ dueOn: "2026-08-08", recurrence: { kind: "rolling", intervalDays: 5 } }),
    history: [history("2026-08-08", "missed", { occurrenceDueOn: "2026-08-08" })],
    action: {
      type: "record_outcome",
      historicalOverride: true,
      replaceExisting: true,
      logicalDate: "2026-08-08",
      outcome: "did_my_best",
      previousOutcome: "missed",
      occurrenceDueOn: "2026-08-08",
    },
  });
  const first = evaluateTaskState(base);
  const second = evaluateTaskState(base);
  assert.equal(first.validationErrors.length, 0);
  assert.equal(first.rewardEligibility.eligible, true);
  assert.equal(first.rewardEligibility.outcome, "did_my_best");
  assert.equal(first.rewardEligibility.identity, "task-reward:task-1:2026-08-08:did_my_best");
  assert.deepEqual(second.rewardEligibility, first.rewardEligibility);
  assert.equal(first.timeline.days["2026-08-08"]?.state, "did_my_best");
});

test("a recurring occurrence rejects a second successful resolution", () => {
  const occurrenceIdentity = "task:task-1:occurrence:2026-07-30";
  const result = evaluateTaskState(input({
    task: task({ dueOn: "2026-07-30", recurrence: { kind: "rolling", intervalDays: 1 } }),
    history: [history("2026-07-30", "done", { occurrenceIdentity, occurrenceDueOn: "2026-07-30" })],
    action: { type: "record_outcome", outcome: "done", logicalDate: "2026-07-31", occurrenceIdentity },
  }));
  assert.match(result.validationErrors[0] ?? "", /already has a successful resolution/);
  assert.equal(result.proposedHistoryChanges[0]?.type, "reject");
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

test("matching recurrence metadata does not produce redundant patch values", () => {
  const identity = "task:task-1:occurrence:2026-07-29";
  const result = evaluateTaskState(input({
    now: "2026-07-31T14:00:00.000Z",
    task: task({
      dueOn: "2026-07-30",
      recurrenceCursor: "2026-07-29",
      satisfiedOccurrenceIdentity: identity,
    }),
    history: [history("2026-07-29", "done", { occurrenceIdentity: identity })],
  }));
  assert.equal(Object.hasOwn(result.proposedTaskPatch, "recurrenceCursor"), false);
  assert.equal(Object.hasOwn(result.proposedTaskPatch, "satisfiedOccurrenceIdentity"), false);
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
