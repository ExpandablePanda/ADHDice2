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
  normalizeTaskBehaviorProfile,
  STANDARD_TASK_BEHAVIOR_POLICY,
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

test("recompute replays the current rolling cadence, preserves Done, and materializes only the still-due Missed date", () => {
  const replayInput = input({
    now: "2026-09-10T14:00:00.000Z",
    calendarStart: "2026-09-01",
    calendarEnd: "2026-09-10",
    task: task({
      dueOn: "2026-09-02",
      recurrence: { kind: "rolling", intervalDays: 5 },
      activeStatus: "missed",
    }),
    history: [
      history("2026-09-02", "done", { occurrenceDueOn: "2026-09-02", occurrenceIdentity: "task-state:task-1:2026-09-02" }),
      ...["2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07"].map((logicalDate) => history(logicalDate, "missed")),
    ],
    action: { type: "recompute", fromLogicalDate: "2026-09-01" },
  });
  const result = evaluateTaskState(replayInput);
  const refreshedResult = evaluateTaskState(replayInput);

  assert.deepEqual(result.validationErrors, []);
  assert.equal(result.calendar["2026-09-02"], "done");
  for (const logicalDate of ["2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"]) {
    assert.equal(result.calendar[logicalDate], "not_due", logicalDate);
  }
  assert.equal(result.calendar["2026-09-07"], "missed");
  assert.equal(result.nextDueDate, "2026-09-07");
  assert.equal(result.activeStatus, "missed");
  assert.deepEqual(result.timeline.automaticHistoryRows?.map((row) => row.logicalDate), ["2026-09-07"]);
  assert.deepEqual(result.proposedHistoryChanges.filter((change) => change.type === "insert").map((change) => change.row.logicalDate), ["2026-09-07"]);
  assert.deepEqual(refreshedResult.calendar, result.calendar, "refresh/read reconstruction remains deterministic");
  assert.equal(refreshedResult.nextDueDate, result.nextDueDate);
  assert.deepEqual(refreshedResult.timeline.automaticHistoryRows?.map((row) => row.logicalDate), ["2026-09-07"]);
});

test("unresolved Missed stays continuous across calculated rolling and fixed recurrence gaps", () => {
  const scenarios = [
    {
      label: "Every 4 Days",
      dueOn: "2026-09-22",
      missedOn: "2026-09-26",
      successOn: "2026-09-28",
      recurrence: { kind: "rolling", intervalDays: 4 } as const,
      dates: ["2026-09-27"],
      notDueDates: ["2026-09-23", "2026-09-24", "2026-09-25"],
    },
    {
      label: "Every 5 Days",
      dueOn: "2026-09-02",
      missedOn: "2026-09-07",
      successOn: "2026-09-10",
      recurrence: { kind: "rolling", intervalDays: 5 } as const,
      dates: ["2026-09-08", "2026-09-09"],
      notDueDates: ["2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"],
    },
    {
      label: "fixed weekly gap",
      dueOn: "2026-08-31",
      missedOn: "2026-09-07",
      successOn: "2026-09-14",
      recurrence: { kind: "weekly", weekdays: [1], anchorDate: "2026-08-31" } as const,
      dates: ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"],
      notDueDates: ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"],
    },
  ];

  for (const scenario of scenarios) {
    const rows = [
      history(scenario.dueOn, "done", {
        occurrenceDueOn: scenario.dueOn,
        occurrenceIdentity: `task-state:task-1:${scenario.dueOn}`,
      }),
      history(scenario.missedOn, "missed", {
        occurrenceDueOn: scenario.missedOn,
        occurrenceIdentity: `task-state:task-1:${scenario.missedOn}`,
      }),
      history(scenario.successOn, "done", {
        occurrenceDueOn: scenario.missedOn,
        occurrenceIdentity: `task-state:task-1:${scenario.missedOn}`,
      }),
    ];
    const base = {
      now: `${scenario.successOn}T14:00:00.000Z`,
      calendarStart: scenario.dueOn,
      calendarEnd: scenario.successOn,
      task: task({ dueOn: scenario.dueOn, recurrence: scenario.recurrence }),
      history: rows,
    };
    const recalculated = evaluateTaskState(input({
      ...base,
      action: { type: "recompute", fromLogicalDate: scenario.dueOn },
    }));
    const refreshed = evaluateTaskState(input(base));

    for (const date of scenario.notDueDates) {
      assert.equal(recalculated.calendar[date], "not_due", `${scenario.label}:${date} before Missed`);
    }
    for (const date of scenario.dates) {
      const day = recalculated.timeline.days[date];
      assert.equal(recalculated.calendar[date], "missed", `${scenario.label}:${date}`);
      assert.equal(day?.sourceKind, "calculated", `${scenario.label}:${date}`);
      assert.equal(day?.historyRowId, null, `${scenario.label}:${date}`);
      assert.equal(day?.occurrenceDueOn, scenario.missedOn, `${scenario.label}:${date}`);
      assert.equal(day?.occurrenceIdentity, `task:task-1:occurrence:${scenario.missedOn}`, `${scenario.label}:${date}`);
      assert.equal(recalculated.proposedHistoryChanges.some((change) => (
        change.type === "insert" && change.row.logicalDate === date
      )), false, `${scenario.label}:${date} must remain calculated`);
      assert.equal(refreshed.timeline.days[date]?.state, "missed", `${scenario.label}:refresh:${date}`);
      assert.equal(refreshed.timeline.days[date]?.occurrenceDueOn, scenario.missedOn);
    }
    assert.equal(recalculated.calendar[scenario.successOn], "done", scenario.label);
    assert.equal(refreshed.calendar[scenario.successOn], "done", `${scenario.label}:refresh`);
    assert.equal(recalculated.timeline.currentMissedStreak, 0, scenario.label);
    assert.deepEqual(
      Object.fromEntries(Object.entries(refreshed.timeline.days).map(([date, day]) => [date, day.state])),
      Object.fromEntries(Object.entries(recalculated.timeline.days).map(([date, day]) => [date, day.state])),
      `${scenario.label}:repeat calculation`,
    );
    assert.equal(
      (recalculated.timeline.automaticHistoryRows ?? []).some((row) => scenario.dates.includes(row.logicalDate)),
      false,
      `${scenario.label}: no Missed History is materialized solely for a non-due continuation day`,
    );
  }
});

test("Did My Best and Complete end an unresolved Missed span", () => {
  for (const outcome of ["did_my_best", "complete"] as const) {
    const result = evaluateTaskState(input({
      now: "2026-09-06T14:00:00.000Z",
      calendarStart: "2026-09-01",
      calendarEnd: "2026-09-06",
      task: task({ dueOn: "2026-09-01", recurrence: { kind: "rolling", intervalDays: 4 } }),
      history: [
        history("2026-09-01", "missed", {
          occurrenceDueOn: "2026-09-01",
          occurrenceIdentity: "task-state:task-1:2026-09-01",
        }),
        history("2026-09-05", outcome, {
          occurrenceDueOn: "2026-09-01",
          occurrenceIdentity: "task-state:task-1:2026-09-01",
          ...(outcome === "complete" ? { eventType: "completed_permanently" } : {}),
        }),
      ],
    }));

    for (const date of ["2026-09-02", "2026-09-03", "2026-09-04"]) {
      assert.equal(result.timeline.days[date]?.state, "missed", `${outcome}:${date}`);
    }
    assert.equal(result.timeline.days["2026-09-05"]?.state, outcome);
    assert.notEqual(result.timeline.days["2026-09-06"]?.state, "missed");
  }
});

test("recompute derives Active Status from the replayed current state in both directions", () => {
  const replayedFuture = evaluateTaskState(input({
    now: "2026-09-05T14:00:00.000Z",
    calendarStart: "2026-09-01",
    calendarEnd: "2026-09-08",
    task: task({
      dueOn: "2026-09-02",
      recurrence: { kind: "rolling", intervalDays: 5 },
      activeStatus: "missed",
    }),
    history: [history("2026-09-02", "done", {
      occurrenceDueOn: "2026-09-02",
      occurrenceIdentity: "task-state:task-1:2026-09-02",
    })],
    action: { type: "recompute", fromLogicalDate: "2026-09-02" },
  }));

  assert.equal(replayedFuture.nextDueDate, "2026-09-07");
  assert.equal(replayedFuture.activeStatus, "not_due");
  assert.equal(replayedFuture.timeline.activeStatus, "not_due");

  const replayedOverdue = evaluateTaskState(input({
    now: "2026-09-10T14:00:00.000Z",
    calendarStart: "2026-09-01",
    calendarEnd: "2026-09-10",
    task: task({
      dueOn: "2026-09-12",
      recurrence: { kind: "rolling", intervalDays: 5 },
      activeStatus: "not_due",
    }),
    history: [history("2026-09-02", "done", {
      occurrenceDueOn: "2026-09-02",
      occurrenceIdentity: "task-state:task-1:2026-09-02",
    })],
    action: { type: "recompute", fromLogicalDate: "2026-09-02" },
  }));

  assert.equal(replayedOverdue.nextDueDate, "2026-09-07");
  assert.equal(replayedOverdue.activeStatus, "missed");
  assert.equal(replayedOverdue.timeline.activeStatus, "missed");
});

test("recompute preserves a live current-day workflow from the replayed timeline", () => {
  const result = evaluateTaskState(input({
    now: "2026-09-10T14:00:00.000Z",
    calendarStart: "2026-09-01",
    calendarEnd: "2026-09-10",
    task: task({
      dueOn: "2026-09-07",
      recurrence: { kind: "rolling", intervalDays: 5 },
      activeStatus: "missed",
      activeStatusLogicalDate: "2026-09-10",
      activeOccurrenceDueOn: "2026-09-10",
    }),
    history: [history("2026-09-02", "done", {
      occurrenceDueOn: "2026-09-02",
      occurrenceIdentity: "task-state:task-1:2026-09-02",
    })],
    workflow: {
      state: "in_progress",
      logicalDate: "2026-09-10",
      occurrenceId: "workflow-occurrence",
      commandId: "workflow-command",
      revision: 2,
    },
    action: { type: "recompute", fromLogicalDate: "2026-09-02" },
  }));

  assert.equal(result.activeStatus, "in_progress");
  assert.equal(result.timeline.activeStatus, "in_progress");
  assert.equal(result.timeline.days["2026-09-10"]?.state, "in_progress");
});

test("recompute is range-bounded and preserves every protected factual outcome", () => {
  const result = evaluateTaskState(input({
    now: "2026-09-10T14:00:00.000Z",
    calendarStart: "2026-08-30",
    calendarEnd: "2026-09-10",
    task: task({
      dueOn: "2026-09-01",
      recurrence: { kind: "rolling", intervalDays: 1 },
      activeStatus: "complete",
    }),
    history: [
      history("2026-08-31", "missed"),
      history("2026-09-01", "done"),
      history("2026-09-02", "did_my_best"),
      history("2026-09-03", "delayed", { occurrenceDueOn: "2026-09-03", effectiveDueOn: "2026-09-05" }),
      history("2026-09-05", "complete", { eventType: "completed_permanently" }),
    ],
    action: { type: "recompute", fromLogicalDate: "2026-09-01" },
  }));

  assert.deepEqual(result.validationErrors, []);
  assert.equal(result.calendar["2026-08-31"], "missed", "pre-range facts remain untouched");
  assert.equal(result.calendar["2026-09-01"], "done");
  assert.equal(result.calendar["2026-09-02"], "did_my_best");
  assert.equal(result.calendar["2026-09-03"], "delayed");
  assert.equal(result.calendar["2026-09-05"], "complete");
  assert.equal(result.nextDueDate, null, "Complete remains terminal after replay");
  assert.equal(result.activeStatus, "complete");
  assert.deepEqual(result.proposedHistoryChanges.filter((change) => change.type === "delete"), []);
});

test("recompute materializes current weekly and monthly obligations through canonical replay", () => {
  const cases = [
    {
      label: "weekly",
      task: task({
        dueOn: "2026-09-07",
        recurrence: { kind: "weekly", weekdays: [1], anchorDate: "2026-09-07" },
      }),
      dates: ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"],
    },
    {
      label: "monthly",
      task: task({
        dueOn: "2026-09-15",
        recurrence: { kind: "monthly", mode: "day_of_month", dayOfMonth: 15, anchorDate: "2026-09-15" },
      }),
      dates: ["2026-09-15", "2026-10-15"],
    },
  ] as const;

  for (const candidate of cases) {
    const result = evaluateTaskState(input({
      now: "2026-10-20T14:00:00.000Z",
      calendarStart: "2026-09-01",
      calendarEnd: "2026-10-20",
      task: candidate.task,
      history: [history(candidate.dates[0]!, "missed")],
      action: { type: "recompute", fromLogicalDate: "2026-09-01" },
    }));

    assert.deepEqual(result.validationErrors, [], candidate.label);
    assert.deepEqual(result.timeline.automaticHistoryRows?.map((row) => row.logicalDate), candidate.dates, candidate.label);
    assert.equal(result.calendar[candidate.dates[0]!], "missed", candidate.label);
  }
});

test("recompute continues Daily Until Complete recurrence until a protected Complete anchor", () => {
  const result = evaluateTaskState(input({
    now: "2026-09-10T14:00:00.000Z",
    calendarStart: "2026-09-01",
    calendarEnd: "2026-09-10",
    task: task({
      dueOn: "2026-09-01",
      recurrence: { kind: "rolling", intervalDays: 1, untilComplete: true },
    }),
    history: [history("2026-09-01", "missed"), history("2026-09-05", "complete", { eventType: "completed_permanently" })],
    action: { type: "recompute", fromLogicalDate: "2026-09-01" },
  }));

  assert.deepEqual(result.validationErrors, []);
  assert.equal(result.calendar["2026-09-01"], "missed");
  assert.equal(result.calendar["2026-09-05"], "complete");
  assert.equal(result.calendar["2026-09-06"], "no_entry");
  assert.equal(result.nextDueDate, null);
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
  assert.equal(first.activeStatus, "not_due");
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

test("a schedule change without unresolved Missed derives the new Pending or Not Due state", () => {
  const pending = evaluateTaskState(input({
    now: "2026-08-04T14:00:00.000Z",
    task: task({ activeStatus: "upcoming", dueOn: "2026-08-05" }),
    action: { type: "change_schedule" },
  }));
  assert.equal(pending.activeStatus, "not_due");

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

test("independent Daily keeps older Missed History but derives Not Due after a later success", () => {
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

    assert.equal(result.activeStatus, "not_due", outcome);
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
    assert.equal(result.activeStatus, "not_due", outcome);
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

test("canonical Delayed remains Delayed before effective due, then follows the existing Open and post-due behavior", () => {
  const delayed = history("2026-08-30", "delayed", {
    effectiveDueOn: "2026-09-02",
    occurrenceDueOn: "2026-08-30",
    occurrenceIdentity: "task:task-1:occurrence:2026-08-30",
  });
  const sourceTask = task({ activeStatus: "delayed", dueOn: "2026-09-02" });

  assert.equal(evaluateTaskState(input({
    now: "2026-09-01T12:00:00.000Z",
    task: sourceTask,
    history: [delayed],
  })).activeStatus, "delayed");
  assert.equal(evaluateTaskState(input({
    now: "2026-09-02T12:00:00.000Z",
    task: sourceTask,
    history: [delayed],
  })).activeStatus, "pending", "pending is the internal Open projection on the effective due date");
  assert.equal(evaluateTaskState(input({
    now: "2026-09-03T12:00:00.000Z",
    task: sourceTask,
    history: [delayed],
  })).activeStatus, "missed", "post-due unresolved behavior remains Missed");
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

test("Success Outcomes control only positive streak advancement, not handled outcome or reward semantics", () => {
  for (const outcome of ["done", "did_my_best", "complete"] as const) {
    const excludedPolicy = normalizeTaskBehaviorProfile({
      ...STANDARD_TASK_BEHAVIOR_POLICY,
      id: `excluded-${outcome}`,
      successOutcomes: [],
    });
    const excluded = evaluateTaskState(input({
      behaviorPolicy: excludedPolicy,
      action: { type: "record_outcome", outcome },
    }));
    assert.equal(excluded.streakDisposition, "break_positive", outcome);
    assert.equal(excluded.rewardEligibility.eligible, true, outcome);
    assert.equal(excluded.proposedHistoryChanges.some((change) => change.type === "insert" && change.row.outcome === outcome), true, outcome);

    const configured = evaluateTaskState(input({
      behaviorPolicy: normalizeTaskBehaviorProfile({
        ...excludedPolicy,
        id: `configured-${outcome}`,
        successOutcomes: [outcome],
      }),
      action: { type: "record_outcome", outcome },
    }));
    assert.equal(configured.streakDisposition, "increment_positive", outcome);
    assert.equal(excluded.nextDueDate, configured.nextDueDate, outcome);
  }
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

test("fixed weekly success after a Missed occurrence targets the nearest upcoming occurrence", () => {
  const result = evaluateTaskState(input({
    now: "2026-09-01T14:00:00.000Z",
    task: task({
      activeStatus: "missed",
      dueOn: "2026-09-06",
      recurrence: { kind: "weekly", weekdays: [0], anchorDate: "2026-08-30" },
    }),
    history: [history("2026-08-30", "missed", {
      occurrenceIdentity: "task:task-1:occurrence:2026-08-30",
      occurrenceDueOn: "2026-08-30",
    })],
    action: { type: "record_outcome", outcome: "done", logicalDate: "2026-08-31" },
  }));
  const inserted = result.proposedHistoryChanges.find((change) => change.type === "insert");

  assert.equal(inserted?.type === "insert" ? inserted.row.occurrenceIdentity : null, "task:task-1:occurrence:2026-09-06");
  assert.equal(inserted?.type === "insert" ? inserted.row.occurrenceDueOn : null, "2026-09-06");
  assert.equal(result.nextDueDate, "2026-09-13");
  assert.notEqual(result.activeStatus, "missed");
  assert.equal(result.calendar["2026-08-30"], "missed");
  assert.equal(result.calendar["2026-08-31"], "done");
});

test("fixed multi-weekday success after an older Missed consumes only the nearest scheduled weekday", () => {
  const result = evaluateTaskState(input({
    now: "2026-09-01T14:00:00.000Z",
    task: task({
      activeStatus: "missed",
      dueOn: "2026-09-01",
      recurrence: { kind: "weekly", weekdays: [0, 2], anchorDate: "2026-08-30" },
    }),
    history: [history("2026-08-30", "missed", {
      occurrenceIdentity: "task:task-1:occurrence:2026-08-30",
      occurrenceDueOn: "2026-08-30",
    })],
    action: { type: "record_outcome", outcome: "done", logicalDate: "2026-08-31" },
  }));
  const inserted = result.proposedHistoryChanges.find((change) => change.type === "insert");

  assert.equal(inserted?.type === "insert" ? inserted.row.occurrenceDueOn : null, "2026-09-01");
  assert.equal(result.nextDueDate, "2026-09-06");
  assert.equal(result.calendar["2026-08-30"], "missed");
});

test("rolling interval three success after a Missed streak resolves the current obligation", () => {
  const result = evaluateTaskState(input({
    now: "2026-09-01T14:00:00.000Z",
    task: task({
      activeStatus: "missed",
      dueOn: "2026-08-29",
      recurrence: { kind: "rolling", intervalDays: 3 },
    }),
    history: [history("2026-08-29", "missed", {
      occurrenceIdentity: "task:task-1:occurrence:2026-08-29",
      occurrenceDueOn: "2026-08-29",
    }), history("2026-08-30", "missed", {
      occurrenceIdentity: "task:task-1:occurrence:2026-08-29",
      occurrenceDueOn: "2026-08-29",
    })],
    action: { type: "record_outcome", outcome: "done", logicalDate: "2026-09-01" },
  }));
  const inserted = result.proposedHistoryChanges.find((change) => change.type === "insert");

  assert.equal(inserted?.type === "insert" ? inserted.row.occurrenceIdentity : null, "task:task-1:occurrence:2026-08-29");
  assert.equal(inserted?.type === "insert" ? inserted.row.occurrenceDueOn : null, "2026-08-29");
  assert.equal(result.nextDueDate, "2026-09-04");
  assert.notEqual(result.activeStatus, "missed");
  assert.equal(result.calendar["2026-08-29"], "missed");
});

test("legacy fixed success self-heals against a prior Missed occurrence without changing History facts", () => {
  const legacyDone = history("2026-08-31", "done");
  const result = evaluateTaskState(input({
    now: "2026-09-01T14:00:00.000Z",
    task: task({
      activeStatus: "missed",
      dueOn: "2026-09-06",
      recurrence: { kind: "weekly", weekdays: [0], anchorDate: "2026-08-30" },
    }),
    history: [history("2026-08-30", "missed", {
      occurrenceIdentity: "task:task-1:occurrence:2026-08-30",
      occurrenceDueOn: "2026-08-30",
    }), legacyDone],
  }));

  assert.equal(result.nextDueDate, "2026-09-13");
  assert.notEqual(result.activeStatus, "missed");
  assert.equal(legacyDone.occurrenceIdentity, undefined);
  assert.equal(legacyDone.occurrenceDueOn, undefined);
});

test("legacy rolling interval three success self-heals without changing History facts", () => {
  const legacyDone = history("2026-09-01", "done");
  const result = evaluateTaskState(input({
    now: "2026-09-01T14:00:00.000Z",
    task: task({
      activeStatus: "missed",
      dueOn: "2026-08-29",
      recurrence: { kind: "rolling", intervalDays: 3 },
    }),
    history: [history("2026-08-29", "missed", {
      occurrenceIdentity: "task:task-1:occurrence:2026-08-29",
      occurrenceDueOn: "2026-08-29",
    }), legacyDone],
  }));

  assert.equal(result.nextDueDate, "2026-09-04");
  assert.notEqual(result.activeStatus, "missed");
  assert.equal(legacyDone.occurrenceIdentity, undefined);
  assert.equal(legacyDone.occurrenceDueOn, undefined);
});

test("legacy rolling success closes an advanced-cursor missed streak", () => {
  const historyRows = [
    history("2026-08-17", "missed", {
      occurrenceIdentity: "task:task-1:occurrence:2026-08-17",
      occurrenceDueOn: "2026-08-17",
    }),
    history("2026-08-20", "missed", {
      occurrenceIdentity: "task:task-1:occurrence:2026-08-20",
      occurrenceDueOn: "2026-08-20",
    }),
    history("2026-09-01", "done", { occurrenceIdentity: null, occurrenceDueOn: null }),
  ];
  const result = evaluateTaskState(input({
    now: "2026-09-01T14:00:00.000Z",
    task: task({ activeStatus: "pending", dueOn: "2026-09-04", recurrence: { kind: "rolling", intervalDays: 3 } }),
    history: historyRows,
  }));

  assert.equal(result.activeStatus, "not_due");
  assert.equal(result.nextDueDate, "2026-09-04");
  assert.equal(result.unresolvedOccurrenceIdentity, null);
  assert.deepEqual(historyRows.map((row) => [row.occurrenceIdentity, row.occurrenceDueOn]), [
    ["task:task-1:occurrence:2026-08-17", "2026-08-17"],
    ["task:task-1:occurrence:2026-08-20", "2026-08-20"],
    [null, null],
  ]);
  assert.equal(result.proposedHistoryChanges.filter((change) => change.type === "insert").length, 0);
});

test("a rolling Missed occurrence after a legacy success remains active", () => {
  const result = evaluateTaskState(input({
    now: "2026-09-02T14:00:00.000Z",
    task: task({ activeStatus: "pending", dueOn: "2026-09-04", recurrence: { kind: "rolling", intervalDays: 3 } }),
    history: [
      history("2026-09-01", "done", { occurrenceIdentity: null, occurrenceDueOn: null }),
      history("2026-09-02", "missed", {
        occurrenceIdentity: "task:task-1:occurrence:2026-09-04",
        occurrenceDueOn: "2026-09-04",
      }),
    ],
  }));

  assert.equal(result.activeStatus, "missed");
  assert.equal(result.nextDueDate, "2026-09-04");
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
  assert.equal(result.activeStatus, "not_due");
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

test("all strictly future dates are Not Due, including tomorrow, seven days, and eight days away", () => {
  for (const dueOn of ["2026-07-31", "2026-08-05", "2026-08-06", "2026-08-07"]) {
    assert.equal(evaluateTaskState(input({ task: task({ dueOn }) })).activeStatus, "not_due", dueOn);
  }
});

test("one-time obligations are Open today and Not Due on every future date", () => {
  const recurrence = { kind: "none" as const };
  assert.equal(evaluateTaskState(input({ task: task({ dueOn: "2026-07-31", recurrence }) })).activeStatus, "not_due");
  assert.equal(evaluateTaskState(input({ task: task({ dueOn: "2026-07-30", recurrence }) })).activeStatus, "pending");
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
