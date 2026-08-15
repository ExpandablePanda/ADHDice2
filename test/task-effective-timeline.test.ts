import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTaskEffectiveTimeline,
  computeTaskEffectiveTimelineStreaks,
  type TaskCalendarOverride,
  type TaskHistoryOutcome,
  type TaskStateHistoryRow,
  type TaskStateSnapshot,
  type TaskWorkflowState,
} from "../src/lib/task-state-engine/index.ts";

const TASK_ID = "task-effective-timeline";

function task(overrides: Partial<TaskStateSnapshot> = {}): TaskStateSnapshot {
  return {
    id: TASK_ID,
    lifecycle: "active",
    activeStatus: "pending",
    dueOn: "2026-08-01",
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
    taskId: TASK_ID,
    logicalDate,
    outcome,
    provenance: "manual",
    occurredAt: `${logicalDate}T12:00:00.000Z`,
    ...overrides,
  };
}

function timeline(
  overrides: {
    task?: Partial<TaskStateSnapshot>;
    history?: TaskStateHistoryRow[];
    logicalDate?: string;
    calendarStart?: string;
    calendarEnd?: string;
    calendarOverrides?: TaskCalendarOverride[];
    workflow?: TaskWorkflowState;
  } = {},
) {
  return buildTaskEffectiveTimeline({
    task: task(overrides.task),
    history: overrides.history ?? [],
    logicalDate: overrides.logicalDate ?? "2026-08-10",
    calendarStart: overrides.calendarStart ?? "2026-08-01",
    calendarEnd: overrides.calendarEnd ?? "2026-08-10",
    calendarOverrides: overrides.calendarOverrides,
    workflow: overrides.workflow,
  });
}

test("Daily future recurrence projects every scheduled day without History", () => {
  const nextHistory: TaskStateHistoryRow[] = [];
  const historyBefore = structuredClone(nextHistory);
  const result = timeline({
    task: {
      dueOn: "2026-08-10",
      activeOccurrenceDueOn: "2026-08-10",
      recurrence: { kind: "rolling", intervalDays: 1 },
    },
    history: nextHistory,
    logicalDate: "2026-08-07",
    calendarStart: "2026-08-08",
    calendarEnd: "2026-08-14",
  });

  for (const date of ["2026-08-08", "2026-08-09"]) {
    assert.equal(result.days[date]?.state, "not_due", date);
  }
  for (const date of ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"]) {
    const day = result.days[date];
    assert.equal(day?.state, "scheduled", date);
    assert.equal(day?.sourceKind, "calculated", date);
    assert.equal(day?.handled, false, date);
    assert.equal(day?.historyRowId, null, date);
    assert.equal(day?.outcome, null, date);
    assert.equal(day?.obligation, "due", date);
    assert.equal(day?.occurrenceDueOn, date, date);
  }
  assert.deepEqual(nextHistory, historyBefore);
});

test("every-three-days future recurrence projects only scheduled occurrences", () => {
  const result = timeline({
    task: {
      dueOn: "2026-08-10",
      activeOccurrenceDueOn: "2026-08-10",
      recurrence: { kind: "rolling", intervalDays: 3 },
    },
    logicalDate: "2026-08-07",
    calendarStart: "2026-08-10",
    calendarEnd: "2026-08-18",
  });

  for (const date of ["2026-08-10", "2026-08-13", "2026-08-16"]) {
    assert.equal(result.days[date]?.state, "scheduled", date);
  }
  for (const date of ["2026-08-11", "2026-08-12", "2026-08-14", "2026-08-15", "2026-08-17", "2026-08-18"]) {
    assert.equal(result.days[date]?.state, "not_due", date);
  }
});

test("current schedule anchor wins over stale Done History metadata", () => {
  const done = history("2026-08-06", "done", {
    occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-10`,
    occurrenceDueOn: "2026-08-10",
  });
  const historyRows = [done];
  const historyBefore = structuredClone(historyRows);
  const result = timeline({
    task: { dueOn: "2026-08-01", activeOccurrenceDueOn: "2026-08-01" },
    history: historyRows,
    logicalDate: "2026-08-06",
    calendarStart: "2026-08-01",
    calendarEnd: "2026-08-08",
  });

  for (const date of ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05"]) {
    assert.equal(result.days[date]?.state, "missed", date);
    assert.equal(result.days[date]?.sourceKind, "calculated", date);
    assert.equal(result.days[date]?.occurrenceDueOn, "2026-08-01", date);
    assert.equal(result.days[date]?.occurrenceIdentity, `task:${TASK_ID}:occurrence:2026-08-01`, date);
    assert.equal(result.days[date]?.historyRowId, null, date);
  }
  assert.equal(result.days["2026-08-06"]?.state, "done");
  assert.equal(result.days["2026-08-06"]?.sourceKind, "history_fact");
  assert.equal(result.days["2026-08-06"]?.handled, true);
  assert.equal(result.days["2026-08-06"]?.historyRowId, done.id);
  assert.equal(result.days["2026-08-06"]?.occurrenceDueOn, "2026-08-10");
  assert.equal(result.days["2026-08-06"]?.occurrenceIdentity, done.occurrenceIdentity);
  assert.equal(result.days["2026-08-07"]?.state, "scheduled");
  for (const day of Object.values(result.days)) {
    if (day.sourceKind === "calculated") assert.equal(day.historyRowId, null, day.logicalDate);
  }
  assert.deepEqual(historyRows, historyBefore);
});

test("stable historical schedule anchor replays the current due cursor without erasing overdue history", () => {
  const historyRows = [
    history("2026-08-03", "did_my_best", { occurrenceDueOn: "2026-08-03" }),
    history("2026-08-04", "missed", { occurrenceDueOn: "2026-08-04" }),
    history("2026-08-07", "done", { occurrenceDueOn: "2026-08-07" }),
    history("2026-08-08", "done", { occurrenceDueOn: "2026-08-08" }),
    history("2026-08-13", "done", { occurrenceDueOn: "2026-08-13" }),
  ];
  const historyBefore = structuredClone(historyRows);
  const result = timeline({
    task: {
      dueOn: "2026-08-14",
      historicalScheduleAnchor: "2026-08-04",
      recurrence: { kind: "rolling", intervalDays: 1 },
    },
    history: historyRows,
    logicalDate: "2026-08-14",
    calendarStart: "2026-08-03",
    calendarEnd: "2026-08-14",
  });

  assert.equal(result.days["2026-08-03"]?.state, "did_my_best");
  assert.equal(result.days["2026-08-04"]?.state, "missed");
  for (const date of ["2026-08-05", "2026-08-06", "2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12"]) {
    assert.equal(result.days[date]?.state, "missed", date);
  }
  assert.equal(result.days["2026-08-07"]?.state, "done");
  assert.equal(result.days["2026-08-08"]?.state, "done");
  assert.equal(result.days["2026-08-13"]?.state, "done");
  assert.equal(result.days["2026-08-14"]?.state, "open");
  assert.equal(result.days["2026-08-14"]?.obligation, "due");
  assert.equal(result.nextDueOn, "2026-08-14");
  assert.equal(result.currentCompletedStreak, 1);
  assert.deepEqual(historyRows, historyBefore);
});

test("a handled overdue occurrence preserves earlier calculated Missed dates", () => {
  const done = history("2026-08-03", "done", {
    occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-01`,
    occurrenceDueOn: "2026-08-01",
  });
  const result = timeline({
    task: { dueOn: "2026-08-04", activeOccurrenceDueOn: "2026-08-04" },
    history: [done],
    logicalDate: "2026-08-07",
    calendarStart: "2026-08-01",
    calendarEnd: "2026-08-07",
  });

  for (const date of ["2026-08-01", "2026-08-02", "2026-08-04", "2026-08-05", "2026-08-06"]) {
    assert.equal(result.days[date]?.state, "missed", date);
    assert.equal(result.days[date]?.sourceKind, "calculated", date);
    assert.equal(result.days[date]?.handled, false, date);
    assert.equal(result.days[date]?.historyRowId, null, date);
    assert.equal(result.days[date]?.outcome, null, date);
  }
  assert.equal(result.days["2026-08-01"]?.occurrenceDueOn, "2026-08-01");
  assert.equal(result.days["2026-08-02"]?.occurrenceDueOn, "2026-08-01");
  assert.equal(result.days["2026-08-03"]?.state, "done");
  assert.equal(result.days["2026-08-03"]?.sourceKind, "history_fact");
  assert.equal(result.days["2026-08-03"]?.handled, true);
  assert.equal(result.days["2026-08-03"]?.historyRowId, done.id);
  assert.equal(result.days["2026-08-03"]?.outcome, done.outcome);
  assert.equal(result.days["2026-08-03"]?.occurrenceDueOn, done.occurrenceDueOn);
  assert.equal(result.days["2026-08-03"]?.occurrenceIdentity, done.occurrenceIdentity);
  assert.equal(result.days["2026-08-07"]?.state, "open");
  assert.equal(result.days["2026-08-07"]?.obligation, "overdue");
  assert.equal(result.currentMissedStreak, 3);
  assert.equal(result.unresolvedDueOn, "2026-08-04");
});

test("the current due date is the initial inferred occurrence", () => {
  const result = timeline({
    task: { dueOn: "2026-08-01" },
    history: [history("2026-08-06", "done", {
      occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-10`,
      occurrenceDueOn: "2026-08-10",
    })],
    logicalDate: "2026-08-06",
    calendarStart: "2026-08-01",
    calendarEnd: "2026-08-08",
  });

  assert.equal(result.days["2026-08-05"]?.state, "missed");
  assert.equal(result.days["2026-08-05"]?.occurrenceDueOn, "2026-08-01");
  assert.equal(result.days["2026-08-07"]?.state, "scheduled");
  assert.equal(result.days["2026-08-07"]?.occurrenceDueOn, "2026-08-07");
});

test("historical reconstruction cannot rewind a future cursor", () => {
  const done = history("2026-08-05", "done", {
    occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-01`,
    occurrenceDueOn: "2026-08-01",
  });
  const result = timeline({
    task: { dueOn: "2026-08-30", activeOccurrenceDueOn: "2026-08-30" },
    history: [done],
    logicalDate: "2026-08-10",
    calendarStart: "2026-08-01",
    calendarEnd: "2026-08-30",
  });

  assert.equal(result.days["2026-08-05"]?.state, "done");
  assert.equal(result.days["2026-08-05"]?.historyRowId, done.id);
  assert.equal(result.days["2026-08-05"]?.occurrenceDueOn, "2026-08-01");
  for (const date of ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04"]) {
    assert.equal(result.days[date]?.state, "missed", date);
    assert.equal(result.days[date]?.sourceKind, "calculated", date);
    assert.equal(result.days[date]?.handled, false, date);
    assert.equal(result.days[date]?.historyRowId, null, date);
    assert.equal(result.days[date]?.outcome, null, date);
  }
  for (const date of ["2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09", "2026-08-10", "2026-08-29"]) {
    assert.equal(result.days[date]?.state, "not_due", date);
  }
  assert.equal(result.currentMissedStreak, 0);
  assert.equal(result.currentObligation, "none");
  assert.equal(result.unresolvedDueOn, null);
  assert.equal(result.days["2026-08-30"]?.state, "scheduled");
});

test("early completion does not infer historical Missed dates", () => {
  const done = history("2026-08-06", "done", {
    occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-10`,
    occurrenceDueOn: "2026-08-10",
  });
  const result = timeline({
    task: { dueOn: "2026-08-10", activeOccurrenceDueOn: "2026-08-10" },
    history: [done],
    logicalDate: "2026-08-10",
    calendarStart: "2026-08-01",
    calendarEnd: "2026-08-10",
  });

  for (const date of ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-07", "2026-08-08", "2026-08-09"]) {
    assert.equal(result.days[date]?.state, "not_due", date);
    assert.equal(result.days[date]?.sourceKind, "calculated", date);
  }
  assert.equal(result.days["2026-08-06"]?.state, "done");
  assert.equal(result.days["2026-08-06"]?.sourceKind, "history_fact");
  assert.equal(result.days["2026-08-06"]?.historyRowId, done.id);
  assert.equal(result.days["2026-08-06"]?.occurrenceDueOn, done.occurrenceDueOn);
  assert.equal(result.days["2026-08-06"]?.occurrenceIdentity, done.occurrenceIdentity);
  assert.equal(result.currentMissedStreak, 0);
});

test("Done today resets the current Missed streak", () => {
  const doneBefore = history("2026-08-03", "done", {
    occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-01`,
    occurrenceDueOn: "2026-08-01",
  });
  const doneToday = history("2026-08-06", "done", {
    occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-04`,
    occurrenceDueOn: "2026-08-04",
  });
  const result = timeline({
    history: [doneBefore, doneToday],
    logicalDate: "2026-08-06",
    calendarStart: "2026-08-03",
    calendarEnd: "2026-08-06",
  });

  assert.equal(result.days["2026-08-04"]?.state, "missed");
  assert.equal(result.days["2026-08-05"]?.state, "missed");
  assert.equal(result.days["2026-08-06"]?.state, "done");
  assert.equal(result.currentMissedStreak, 0);
});

test("Did My Best today resets the current Missed streak", () => {
  const doneBefore = history("2026-08-03", "done", {
    occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-01`,
    occurrenceDueOn: "2026-08-01",
  });
  const didMyBestToday = history("2026-08-06", "did_my_best", {
    occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-04`,
    occurrenceDueOn: "2026-08-04",
  });
  const result = timeline({
    history: [doneBefore, didMyBestToday],
    logicalDate: "2026-08-06",
    calendarStart: "2026-08-03",
    calendarEnd: "2026-08-06",
  });

  assert.equal(result.days["2026-08-04"]?.state, "missed");
  assert.equal(result.days["2026-08-05"]?.state, "missed");
  assert.equal(result.days["2026-08-06"]?.state, "did_my_best");
  assert.equal(result.currentMissedStreak, 0);
});

test("overdue Open continues yesterday's current Missed streak", () => {
  const doneBefore = history("2026-08-03", "done", {
    occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-01`,
    occurrenceDueOn: "2026-08-01",
  });
  const result = timeline({
    history: [doneBefore],
    logicalDate: "2026-08-06",
    calendarStart: "2026-08-03",
    calendarEnd: "2026-08-06",
  });

  assert.equal(result.days["2026-08-04"]?.state, "missed");
  assert.equal(result.days["2026-08-05"]?.state, "missed");
  assert.equal(result.days["2026-08-06"]?.state, "open");
  assert.equal(result.days["2026-08-06"]?.obligation, "overdue");
  assert.equal(result.currentMissedStreak, 2);
});

test("Due-today Open skips itself and counts finalized historical Missed outcomes", () => {
  const result = timeline({
    task: {
      dueOn: "2026-08-06",
      activeOccurrenceDueOn: "2026-08-06",
    },
    history: [
      history("2026-08-03", "done", {
        occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-03`,
        occurrenceDueOn: "2026-08-03",
      }),
      history("2026-08-04", "missed", {
        occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-04`,
        occurrenceDueOn: "2026-08-04",
      }),
      history("2026-08-05", "missed", {
        occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-05`,
        occurrenceDueOn: "2026-08-05",
      }),
    ],
    logicalDate: "2026-08-06",
    calendarStart: "2026-08-03",
    calendarEnd: "2026-08-06",
  });

  assert.equal(result.days["2026-08-04"]?.state, "missed");
  assert.equal(result.days["2026-08-05"]?.state, "missed");
  assert.equal(result.days["2026-08-06"]?.state, "open");
  assert.equal(result.days["2026-08-06"]?.obligation, "due");
  assert.equal(result.currentMissedStreak, 2);
});

test("Test V5 counts only the current Effective Timeline completion streak", () => {
  const doneBefore = history("2026-08-03", "done", {
    occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-01`,
    occurrenceDueOn: "2026-08-01",
  });
  const doneToday = history("2026-08-06", "done", {
    occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-04`,
    occurrenceDueOn: "2026-08-04",
  });
  const result = timeline({
    history: [doneBefore, doneToday],
    logicalDate: "2026-08-06",
    calendarStart: "2026-08-03",
    calendarEnd: "2026-08-06",
  });

  for (const date of ["2026-08-04", "2026-08-05"]) {
    assert.equal(result.days[date]?.state, "missed", date);
    assert.equal(result.days[date]?.sourceKind, "calculated", date);
  }
  assert.equal(result.days["2026-08-06"]?.state, "done");
  assert.equal(result.currentCompletedStreak, 1);
  assert.equal(result.currentMissedStreak, 0);
});

test("consecutive Daily successes produce a three-day completion streak", () => {
  const result = timeline({
    task: { dueOn: "2026-08-04", activeOccurrenceDueOn: "2026-08-04" },
    history: [
      history("2026-08-04", "done", {
        occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-04`,
        occurrenceDueOn: "2026-08-04",
      }),
      history("2026-08-05", "done", {
        occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-05`,
        occurrenceDueOn: "2026-08-05",
      }),
      history("2026-08-06", "done", {
        occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-06`,
        occurrenceDueOn: "2026-08-06",
      }),
    ],
    logicalDate: "2026-08-06",
    calendarStart: "2026-08-04",
    calendarEnd: "2026-08-06",
  });

  assert.equal(result.currentCompletedStreak, 3);
  assert.equal(result.currentMissedStreak, 0);
});

test("Not Due dates do not break an interval completion streak", () => {
  const result = timeline({
    task: {
      dueOn: "2026-08-01",
      activeOccurrenceDueOn: "2026-08-01",
      recurrence: { kind: "rolling", intervalDays: 3 },
    },
    history: [
      history("2026-08-01", "done", {
        occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-01`,
        occurrenceDueOn: "2026-08-01",
      }),
      history("2026-08-04", "done", {
        occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-04`,
        occurrenceDueOn: "2026-08-04",
      }),
      history("2026-08-07", "done", {
        occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-07`,
        occurrenceDueOn: "2026-08-07",
      }),
    ],
    logicalDate: "2026-08-07",
    calendarStart: "2026-08-01",
    calendarEnd: "2026-08-07",
  });

  for (const date of ["2026-08-02", "2026-08-03", "2026-08-05", "2026-08-06"]) {
    assert.equal(result.days[date]?.state, "not_due", date);
  }
  assert.equal(result.currentCompletedStreak, 3);
});

test("a Missed interval occurrence breaks the completion streak", () => {
  const result = timeline({
    task: {
      dueOn: "2026-08-01",
      activeOccurrenceDueOn: "2026-08-01",
      recurrence: { kind: "rolling", intervalDays: 3 },
    },
    history: [
      history("2026-08-01", "done", {
        occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-01`,
        occurrenceDueOn: "2026-08-01",
      }),
      history("2026-08-04", "missed", {
        occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-04`,
        occurrenceDueOn: "2026-08-04",
      }),
      history("2026-08-07", "done", {
        occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-04`,
        occurrenceDueOn: "2026-08-04",
      }),
    ],
    logicalDate: "2026-08-07",
    calendarStart: "2026-08-01",
    calendarEnd: "2026-08-07",
  });

  assert.equal(result.days["2026-08-04"]?.state, "missed");
  assert.equal(result.days["2026-08-07"]?.state, "done");
  assert.equal(result.currentCompletedStreak, 1);
});

test("current Due Open preserves the previous positive completion streak", () => {
  const result = timeline({
    task: { dueOn: "2026-08-04", activeOccurrenceDueOn: "2026-08-04" },
    history: [
      history("2026-08-04", "done", {
        occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-04`,
        occurrenceDueOn: "2026-08-04",
      }),
      history("2026-08-05", "done", {
        occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-05`,
        occurrenceDueOn: "2026-08-05",
      }),
    ],
    logicalDate: "2026-08-06",
    calendarStart: "2026-08-04",
    calendarEnd: "2026-08-06",
  });

  assert.equal(result.days["2026-08-06"]?.state, "open");
  assert.equal(result.days["2026-08-06"]?.obligation, "due");
  assert.equal(result.currentCompletedStreak, 2);
  assert.equal(result.currentMissedStreak, 0);
});

test("overdue Open does not preserve positive streak through Missed dates", () => {
  const done = history("2026-08-03", "done", {
    occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-03`,
    occurrenceDueOn: "2026-08-03",
  });
  const result = timeline({
    task: { dueOn: "2026-08-03", activeOccurrenceDueOn: "2026-08-03" },
    history: [done],
    logicalDate: "2026-08-06",
    calendarStart: "2026-08-03",
    calendarEnd: "2026-08-06",
  });

  assert.equal(result.days["2026-08-04"]?.state, "missed");
  assert.equal(result.days["2026-08-05"]?.state, "missed");
  assert.equal(result.days["2026-08-06"]?.state, "open");
  assert.equal(result.days["2026-08-06"]?.obligation, "overdue");
  assert.equal(result.currentCompletedStreak, 0);
  assert.equal(result.currentMissedStreak, 2);
});

test("current Did My Best counts as a successful completion", () => {
  const result = timeline({
    task: { dueOn: "2026-08-04", activeOccurrenceDueOn: "2026-08-04" },
    history: [
      history("2026-08-04", "done", {
        occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-04`,
        occurrenceDueOn: "2026-08-04",
      }),
      history("2026-08-05", "done", {
        occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-05`,
        occurrenceDueOn: "2026-08-05",
      }),
      history("2026-08-06", "did_my_best", {
        occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-06`,
        occurrenceDueOn: "2026-08-06",
      }),
    ],
    logicalDate: "2026-08-06",
    calendarStart: "2026-08-04",
    calendarEnd: "2026-08-06",
  });

  assert.equal(result.currentCompletedStreak, 3);
  assert.equal(result.currentMissedStreak, 0);
});

test("explicit History overrides a reconstructed Missed date", () => {
  const done = history("2026-08-04", "done", {
    occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-01`,
    occurrenceDueOn: "2026-08-01",
  });
  const didMyBest = history("2026-08-02", "did_my_best", {
    occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-01`,
    occurrenceDueOn: "2026-08-01",
  });
  const result = timeline({
    task: { dueOn: "2026-08-30", activeOccurrenceDueOn: "2026-08-30" },
    history: [done, didMyBest],
    logicalDate: "2026-08-07",
    calendarStart: "2026-08-01",
    calendarEnd: "2026-08-07",
  });

  assert.equal(result.days["2026-08-01"]?.state, "missed");
  assert.equal(result.days["2026-08-01"]?.sourceKind, "calculated");
  assert.equal(result.days["2026-08-02"]?.state, "did_my_best");
  assert.equal(result.days["2026-08-02"]?.sourceKind, "history_fact");
  assert.equal(result.days["2026-08-02"]?.historyRowId, didMyBest.id);
  assert.equal(result.days["2026-08-02"]?.outcome, "did_my_best");
  assert.equal(result.days["2026-08-03"]?.state, "missed");
  assert.equal(result.days["2026-08-03"]?.sourceKind, "calculated");
  assert.equal(result.days["2026-08-04"]?.state, "done");
  assert.equal(result.days["2026-08-04"]?.sourceKind, "history_fact");
  assert.equal(result.days["2026-08-04"]?.historyRowId, done.id);
});

function calendarOverride(
  logicalDate: string,
  overrideState: TaskCalendarOverride["overrideState"],
): TaskCalendarOverride {
  return {
    id: `calendar-override-${logicalDate}-${overrideState}`,
    logicalDate,
    overrideState,
    revision: 1,
    source: "test",
    provenance: "manual",
  };
}

test("Calendar overrides resolve calculated days without creating History", () => {
  const result = timeline({
    task: { dueOn: "2026-08-11", activeOccurrenceDueOn: "2026-08-11" },
    logicalDate: "2026-08-11",
    calendarStart: "2026-08-11",
    calendarEnd: "2026-08-11",
  });
  const overridden = buildTaskEffectiveTimeline({
    task: task({ dueOn: "2026-08-11", activeOccurrenceDueOn: "2026-08-11" }),
    history: [],
    logicalDate: "2026-08-11",
    calendarStart: "2026-08-11",
    calendarEnd: "2026-08-11",
    calendarOverrides: [calendarOverride("2026-08-11", "not_due")],
  });

  assert.equal(result.days["2026-08-11"]?.state, "open");
  assert.equal(overridden.days["2026-08-11"]?.state, "not_due");
  assert.equal(overridden.days["2026-08-11"]?.sourceKind, "calendar_override");
  assert.equal(overridden.days["2026-08-11"]?.calendarOverrideId, "calendar-override-2026-08-11-not_due");
  assert.equal(overridden.days["2026-08-11"]?.obligation, "none");
  assert.equal(overridden.currentMissedStreak, 0);
});

test("Calendar override states preserve due/open rollover semantics", () => {
  const future = timeline({
    logicalDate: "2026-08-10",
    calendarStart: "2026-08-11",
    calendarEnd: "2026-08-11",
  });
  const futureOverride = buildTaskEffectiveTimeline({
    task: task({ dueOn: "2026-08-01" }),
    history: [],
    logicalDate: "2026-08-10",
    calendarStart: "2026-08-11",
    calendarEnd: "2026-08-11",
    calendarOverrides: [calendarOverride("2026-08-11", "due_open")],
  });
  const currentOverride = buildTaskEffectiveTimeline({
    task: task({ dueOn: "2026-08-10" }),
    history: [],
    logicalDate: "2026-08-10",
    calendarStart: "2026-08-10",
    calendarEnd: "2026-08-10",
    calendarOverrides: [calendarOverride("2026-08-10", "due_open")],
  });
  const historicalOverride = buildTaskEffectiveTimeline({
    task: task({ dueOn: "2026-08-01" }),
    history: [],
    logicalDate: "2026-08-10",
    calendarStart: "2026-08-09",
    calendarEnd: "2026-08-10",
    calendarOverrides: [calendarOverride("2026-08-09", "due_open")],
  });

  assert.equal(future.days["2026-08-11"]?.state, "scheduled");
  assert.equal(futureOverride.days["2026-08-11"]?.state, "scheduled");
  assert.equal(futureOverride.days["2026-08-11"]?.obligation, "due");
  assert.equal(currentOverride.days["2026-08-10"]?.state, "open");
  assert.equal(currentOverride.days["2026-08-10"]?.obligation, "due");
  assert.equal(historicalOverride.days["2026-08-09"]?.state, "missed");
  assert.equal(historicalOverride.days["2026-08-09"]?.obligation, "overdue");
});

test("longest Missed streak uses calculated timeline days and skips neutral states", () => {
  const result = timeline({
    task: { dueOn: "2026-08-01", activeOccurrenceDueOn: "2026-08-01" },
    history: [
      history("2026-08-04", "done"),
      history("2026-08-08", "did_my_best"),
    ],
    logicalDate: "2026-08-10",
    calendarStart: "2026-08-01",
    calendarEnd: "2026-08-10",
    calendarOverrides: [calendarOverride("2026-08-06", "not_due")],
  });

  assert.equal(result.days["2026-08-01"]?.state, "missed");
  assert.equal(result.days["2026-08-06"]?.state, "not_due");
  assert.equal(result.days["2026-08-04"]?.state, "done");
  assert.equal(result.days["2026-08-08"]?.state, "did_my_best");
  assert.equal(result.longestMissedStreak, 3);
  assert.equal(result.currentMissedStreak, 1);
});

test("longest Missed streak resets at Done, Did My Best, Delayed, and Complete", () => {
  const result = computeTaskEffectiveTimelineStreaks({
    "2026-08-01": { calendarOverrideId: null, state: "missed" },
    "2026-08-02": { calendarOverrideId: null, state: "missed" },
    "2026-08-03": { calendarOverrideId: null, state: "done" },
    "2026-08-04": { calendarOverrideId: null, state: "missed" },
    "2026-08-05": { calendarOverrideId: null, state: "did_my_best" },
    "2026-08-06": { calendarOverrideId: null, state: "missed" },
    "2026-08-07": { calendarOverrideId: null, state: "delayed" },
    "2026-08-08": { calendarOverrideId: null, state: "missed" },
    "2026-08-09": { calendarOverrideId: null, state: "complete" },
    "2026-08-10": { calendarOverrideId: null, state: "open" },
  }, "2026-08-10");

  assert.equal(result.longestMissedStreak, 2);
  assert.equal(result.currentMissedStreak, 0);
});

test("manual Not Due breaks missed streaks while calculated Not Due stays neutral", () => {
  const manualBoundary = timeline({
    task: { dueOn: "2026-08-09", activeOccurrenceDueOn: "2026-08-09" },
    logicalDate: "2026-08-14",
    calendarStart: "2026-08-09",
    calendarEnd: "2026-08-14",
    calendarOverrides: [calendarOverride("2026-08-09", "not_due")],
  });
  assert.equal(manualBoundary.days["2026-08-09"]?.state, "not_due");
  assert.equal(manualBoundary.days["2026-08-09"]?.calendarOverrideId, "calendar-override-2026-08-09-not_due");
  assert.equal(manualBoundary.currentMissedStreak, 4);
  assert.equal(manualBoundary.longestMissedStreak, 4);

  const calculatedNeutral = computeTaskEffectiveTimelineStreaks({
    "2026-08-01": { calendarOverrideId: null, state: "missed" },
    "2026-08-02": { calendarOverrideId: null, state: "not_due" },
    "2026-08-03": { calendarOverrideId: null, state: "not_due" },
    "2026-08-04": { calendarOverrideId: null, state: "missed" },
    "2026-08-05": { calendarOverrideId: null, state: "open" },
  }, "2026-08-05");
  assert.equal(calculatedNeutral.currentMissedStreak, 2);
  assert.equal(calculatedNeutral.longestMissedStreak, 2);
});

test("explicit Missed History remains a Missed streak day over a manual Not Due override", () => {
  const result = timeline({
    task: { dueOn: "2026-08-09", activeOccurrenceDueOn: "2026-08-09" },
    history: [history("2026-08-09", "missed")],
    logicalDate: "2026-08-10",
    calendarStart: "2026-08-09",
    calendarEnd: "2026-08-10",
    calendarOverrides: [calendarOverride("2026-08-09", "not_due")],
  });
  const streaks = computeTaskEffectiveTimelineStreaks(result.days, "2026-08-10");

  assert.equal(result.days["2026-08-09"]?.state, "missed");
  assert.equal(result.days["2026-08-09"]?.calendarOverrideId, null);
  assert.equal(streaks.currentMissedStreak, 1);
  assert.equal(streaks.longestMissedStreak, 1);
});

test("historical Due/Open remains continuously overdue through the current day", () => {
  const result = timeline({
    task: { dueOn: "2026-08-11", activeOccurrenceDueOn: "2026-08-11" },
    logicalDate: "2026-08-14",
    calendarStart: "2026-08-11",
    calendarEnd: "2026-08-14",
    calendarOverrides: [calendarOverride("2026-08-11", "due_open")],
  });

  assert.deepEqual(
    ["2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"].map((date) => result.days[date]?.state),
    ["missed", "missed", "missed", "open"],
  );
  assert.deepEqual(
    ["2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"].map((date) => result.days[date]?.obligation),
    ["overdue", "overdue", "overdue", "overdue"],
  );
  assert.equal(result.nextDueOn, "2026-08-11");
  assert.equal(result.unresolvedDueOn, "2026-08-11");
  assert.equal(result.currentMissedStreak, 3);
});

test("Due/Open becomes handled and recurrence advances from the explicit success", () => {
  const result = timeline({
    task: {
      dueOn: "2026-08-11",
      activeOccurrenceDueOn: "2026-08-11",
      recurrence: { kind: "rolling", intervalDays: 5 },
    },
    history: [history("2026-08-13", "done")],
    logicalDate: "2026-08-13",
    calendarStart: "2026-08-11",
    calendarEnd: "2026-08-18",
    calendarOverrides: [calendarOverride("2026-08-11", "due_open")],
  });

  assert.equal(result.days["2026-08-11"]?.state, "missed");
  assert.equal(result.days["2026-08-12"]?.state, "missed");
  assert.equal(result.days["2026-08-13"]?.state, "done");
  assert.equal(result.days["2026-08-13"]?.sourceKind, "history_fact");
  assert.equal(result.days["2026-08-18"]?.state, "scheduled");
  assert.equal(result.nextDueOn, "2026-08-18");
  assert.equal(result.unresolvedDueOn, null);
});

test("Daily Not Due cancels the active occurrence and advances to the next day", () => {
  const result = timeline({
    task: {
      dueOn: "2026-08-11",
      activeOccurrenceDueOn: "2026-08-11",
      recurrence: { kind: "rolling", intervalDays: 1 },
    },
    logicalDate: "2026-08-11",
    calendarStart: "2026-08-11",
    calendarEnd: "2026-08-12",
    calendarOverrides: [calendarOverride("2026-08-11", "not_due")],
  });

  assert.equal(result.days["2026-08-11"]?.state, "not_due");
  assert.equal(result.days["2026-08-11"]?.obligation, "none");
  assert.equal(result.days["2026-08-12"]?.state, "scheduled");
  assert.equal(result.nextDueOn, "2026-08-12");
  assert.equal(result.unresolvedDueOn, null);
});

test("Every-five-days Not Due cancels the active occurrence and advances by five days", () => {
  const result = timeline({
    task: {
      dueOn: "2026-08-13",
      activeOccurrenceDueOn: "2026-08-13",
      recurrence: { kind: "rolling", intervalDays: 5 },
    },
    logicalDate: "2026-08-13",
    calendarStart: "2026-08-13",
    calendarEnd: "2026-08-18",
    calendarOverrides: [calendarOverride("2026-08-13", "not_due")],
  });

  assert.equal(result.days["2026-08-13"]?.state, "not_due");
  assert.equal(result.days["2026-08-18"]?.state, "scheduled");
  assert.equal(result.nextDueOn, "2026-08-18");
  assert.equal(result.unresolvedDueOn, null);
});

test("Not Due does not leave the canceled occurrence as a hidden overdue obligation", () => {
  const result = timeline({
    task: {
      dueOn: "2026-08-11",
      activeOccurrenceDueOn: "2026-08-11",
      recurrence: { kind: "rolling", intervalDays: 1 },
    },
    logicalDate: "2026-08-14",
    calendarStart: "2026-08-11",
    calendarEnd: "2026-08-14",
    calendarOverrides: [calendarOverride("2026-08-11", "not_due")],
  });

  assert.equal(result.days["2026-08-11"]?.state, "not_due");
  assert.equal(result.days["2026-08-12"]?.state, "missed");
  assert.equal(result.days["2026-08-13"]?.state, "missed");
  assert.equal(result.days["2026-08-14"]?.state, "open");
  assert.equal(result.days["2026-08-14"]?.obligation, "overdue");
  assert.equal(result.nextDueOn, "2026-08-12");
  assert.equal(result.unresolvedDueOn, "2026-08-12");
});

test("Unscheduled cancels the active occurrence without leaving a hidden obligation", () => {
  const result = timeline({
    task: {
      dueOn: "2026-08-11",
      activeOccurrenceDueOn: "2026-08-11",
      recurrence: { kind: "rolling", intervalDays: 1 },
    },
    logicalDate: "2026-08-14",
    calendarStart: "2026-08-11",
    calendarEnd: "2026-08-14",
    calendarOverrides: [calendarOverride("2026-08-11", "unscheduled")],
  });

  assert.equal(result.days["2026-08-11"]?.state, "no_entry");
  assert.equal(result.days["2026-08-12"]?.state, "missed");
  assert.equal(result.days["2026-08-13"]?.state, "missed");
  assert.equal(result.days["2026-08-14"]?.state, "open");
  assert.equal(result.nextDueOn, "2026-08-12");
  assert.equal(result.unresolvedDueOn, "2026-08-12");
});

test("Due/Open remains causal beneath current In Progress workflow", () => {
  const override = calendarOverride("2026-08-14", "due_open");
  const result = timeline({
    task: {
      dueOn: "2026-08-15",
      activeOccurrenceDueOn: "2026-08-15",
      activeStatus: "in_progress",
      activeStatusLogicalDate: "2026-08-14",
    },
    logicalDate: "2026-08-14",
    calendarStart: "2026-08-14",
    calendarEnd: "2026-08-15",
    calendarOverrides: [override],
    workflow: {
      state: "in_progress",
      logicalDate: "2026-08-14",
      occurrenceId: "workflow-occurrence",
      commandId: "workflow-command",
      revision: 2,
    },
  });

  const day = result.days["2026-08-14"];
  assert.equal(day?.state, "in_progress");
  assert.equal(day?.sourceKind, "workflow");
  assert.equal(day?.obligation, "due");
  assert.equal(day?.calendarOverrideId, override.id);
  assert.equal(day?.occurrenceDueOn, "2026-08-14");
  assert.equal(result.activeOccurrenceDueOn, "2026-08-14");
  assert.equal(result.nextDueOn, "2026-08-14");
});

test("Not Due cancels the occurrence beneath current In Progress workflow", () => {
  const override = calendarOverride("2026-08-14", "not_due");
  const result = timeline({
    task: {
      dueOn: "2026-08-14",
      activeOccurrenceDueOn: "2026-08-14",
      activeStatus: "in_progress",
      activeStatusLogicalDate: "2026-08-14",
      recurrence: { kind: "rolling", intervalDays: 1 },
    },
    logicalDate: "2026-08-14",
    calendarStart: "2026-08-14",
    calendarEnd: "2026-08-15",
    calendarOverrides: [override],
    workflow: { state: "in_progress", logicalDate: "2026-08-14" },
  });

  const day = result.days["2026-08-14"];
  assert.equal(day?.state, "in_progress");
  assert.equal(day?.sourceKind, "workflow");
  assert.equal(day?.obligation, "none");
  assert.equal(day?.calendarOverrideId, override.id);
  assert.equal(result.days["2026-08-15"]?.state, "scheduled");
  assert.equal(result.nextDueOn, "2026-08-15");
  assert.equal(result.unresolvedDueOn, null);
});

test("Unscheduled cancels the occurrence beneath current In Progress workflow", () => {
  const override = calendarOverride("2026-08-14", "unscheduled");
  const result = timeline({
    task: {
      dueOn: "2026-08-14",
      activeOccurrenceDueOn: "2026-08-14",
      activeStatus: "in_progress",
      activeStatusLogicalDate: "2026-08-14",
      recurrence: { kind: "rolling", intervalDays: 1 },
    },
    logicalDate: "2026-08-14",
    calendarStart: "2026-08-14",
    calendarEnd: "2026-08-15",
    calendarOverrides: [override],
    workflow: { state: "in_progress", logicalDate: "2026-08-14" },
  });

  const day = result.days["2026-08-14"];
  assert.equal(day?.state, "in_progress");
  assert.equal(day?.sourceKind, "workflow");
  assert.equal(day?.obligation, "none");
  assert.equal(day?.calendarOverrideId, override.id);
  assert.equal(result.days["2026-08-15"]?.state, "scheduled");
  assert.equal(result.nextDueOn, "2026-08-15");
  assert.equal(result.unresolvedDueOn, null);
});

test("History and current workflow take precedence over Calendar overrides", () => {
  const historyRow = history("2026-08-10", "done");
  const result = buildTaskEffectiveTimeline({
    task: task({ dueOn: "2026-08-10", activeStatus: "in_progress", activeStatusLogicalDate: "2026-08-10" }),
    history: [historyRow],
    logicalDate: "2026-08-10",
    calendarStart: "2026-08-10",
    calendarEnd: "2026-08-10",
    calendarOverrides: [calendarOverride("2026-08-10", "not_due")],
    workflow: {
      state: "in_progress",
      logicalDate: "2026-08-10",
      occurrenceId: "workflow-occurrence",
      commandId: "workflow-command",
      revision: 4,
    },
  });
  const workflowResult = buildTaskEffectiveTimeline({
    task: task({ dueOn: "2026-08-10", activeStatus: "in_progress", activeStatusLogicalDate: "2026-08-10" }),
    history: [],
    logicalDate: "2026-08-10",
    calendarStart: "2026-08-10",
    calendarEnd: "2026-08-10",
    calendarOverrides: [calendarOverride("2026-08-10", "not_due")],
    workflow: {
      state: "in_progress",
      logicalDate: "2026-08-10",
      occurrenceId: "workflow-occurrence",
      commandId: "workflow-command",
      revision: 4,
    },
  });

  assert.equal(result.days["2026-08-10"]?.state, "done");
  assert.equal(result.days["2026-08-10"]?.sourceKind, "history_fact");
  assert.equal(result.days["2026-08-10"]?.historyRowId, historyRow.id);
  assert.equal(result.days["2026-08-10"]?.calendarOverrideId, null);
  assert.equal(result.days["2026-08-10"]?.workflowCommandId, null);
  assert.equal(result.nextDueOn, "2026-08-11");
  assert.equal(workflowResult.days["2026-08-10"]?.state, "in_progress");
  assert.equal(workflowResult.days["2026-08-10"]?.sourceKind, "workflow");
  assert.equal(workflowResult.days["2026-08-10"]?.workflowCommandId, "workflow-command");
  assert.equal(workflowResult.activeStatus, "in_progress");
});

test("replay selects the last success checkpoint for a recurrence edit", () => {
  const result = timeline({
    task: { dueOn: "2026-08-13", recurrence: { kind: "rolling", intervalDays: 6 } },
    history: [history("2026-08-08", "done", { occurrenceDueOn: "2026-08-08" })],
    logicalDate: "2026-08-14",
    calendarStart: "2026-08-08",
    calendarEnd: "2026-08-14",
  });
  const replayed = buildTaskEffectiveTimeline({
    task: task({ dueOn: "2026-08-13", recurrence: { kind: "rolling", intervalDays: 6 } }),
    history: [history("2026-08-08", "done", { occurrenceDueOn: "2026-08-08" })],
    logicalDate: "2026-08-14",
    calendarStart: "2026-08-08",
    calendarEnd: "2026-08-14",
    replay: { changedLogicalDate: "2026-08-13", kind: "recurrence" },
  });
  assert.equal(result.days["2026-08-08"]?.state, "done");
  for (const date of ["2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13"]) {
    assert.equal(replayed.days[date]?.state, "not_due", date);
  }
  assert.equal(replayed.days["2026-08-14"]?.state, "open");
  assert.equal(replayed.nextDueOn, "2026-08-14");
  assert.deepEqual(replayed.replayCheckpoint, { kind: "success", logicalDate: "2026-08-08", occurrenceDueOn: "2026-08-08" });
});

test("manual due-date replay preserves earlier History and derives the future obligation", () => {
  const historyRows = [history("2026-08-08", "done", { occurrenceDueOn: "2026-08-08" })];
  const before = structuredClone(historyRows);
  const result = buildTaskEffectiveTimeline({
    task: task({ dueOn: "2026-08-20", recurrence: { kind: "rolling", intervalDays: 5 } }),
    history: historyRows,
    logicalDate: "2026-08-20",
    calendarStart: "2026-08-08",
    calendarEnd: "2026-08-20",
    replay: { changedLogicalDate: "2026-08-13", kind: "due_date", manualDueOn: "2026-08-20" },
  });
  for (const date of ["2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16", "2026-08-17", "2026-08-18", "2026-08-19"]) {
    assert.equal(result.days[date]?.state, "not_due", date);
  }
  assert.equal(result.days["2026-08-20"]?.state, "open");
  assert.equal(result.nextDueOn, "2026-08-20");
  assert.deepEqual(historyRows, before);
});

test("rolling historical replay advances through a later authoritative success", () => {
  const historyRows = [
    history("2026-08-12", "did_my_best"),
    history("2026-08-13", "did_my_best", { occurrenceDueOn: "2026-08-13" }),
  ];
  const before = structuredClone(historyRows);
  const result = buildTaskEffectiveTimeline({
    task: task({ dueOn: "2026-08-15", recurrence: { kind: "rolling", intervalDays: 2 } }),
    history: historyRows,
    logicalDate: "2026-08-15",
    calendarStart: "2026-08-12",
    calendarEnd: "2026-08-15",
    replay: { changedLogicalDate: "2026-08-12", kind: "outcome" },
  });

  assert.equal(result.nextDueOn, "2026-08-15");
  assert.equal(result.activeStatus, "pending");
  assert.equal(result.days["2026-08-14"]?.state, "not_due");
  assert.equal(result.days["2026-08-13"]?.state, "did_my_best");
  assert.deepEqual(historyRows, before);
});

test("rolling replay is independent of History entry order", () => {
  const rows = [
    history("2026-08-12", "did_my_best"),
    history("2026-08-13", "did_my_best", { occurrenceDueOn: "2026-08-13" }),
  ];
  const build = (historyRows: TaskStateHistoryRow[]) => buildTaskEffectiveTimeline({
    task: task({ dueOn: "2026-08-15", recurrence: { kind: "rolling", intervalDays: 2 } }),
    history: historyRows,
    logicalDate: "2026-08-15",
    calendarStart: "2026-08-12",
    calendarEnd: "2026-08-15",
    replay: { changedLogicalDate: "2026-08-12", kind: "outcome" },
  });

  const chronological = build(rows);
  const reverseOrder = build([...rows].reverse());
  assert.equal(chronological.nextDueOn, "2026-08-15");
  assert.deepEqual(reverseOrder, chronological);
});

test("replacing an older success with Missed still replays a later success", () => {
  const result = buildTaskEffectiveTimeline({
    task: task({ dueOn: "2026-08-15", recurrence: { kind: "rolling", intervalDays: 2 } }),
    history: [
      history("2026-08-12", "missed"),
      history("2026-08-13", "did_my_best", { occurrenceDueOn: "2026-08-13" }),
    ],
    logicalDate: "2026-08-15",
    calendarStart: "2026-08-12",
    calendarEnd: "2026-08-15",
    replay: { changedLogicalDate: "2026-08-12", kind: "outcome" },
  });

  assert.equal(result.nextDueOn, "2026-08-15");
  assert.equal(result.days["2026-08-13"]?.state, "did_my_best");
});

test("clearing an older outcome leaves the later rolling success as the cursor", () => {
  const result = buildTaskEffectiveTimeline({
    task: task({ dueOn: "2026-08-15", recurrence: { kind: "rolling", intervalDays: 2 } }),
    history: [history("2026-08-13", "did_my_best", { occurrenceDueOn: "2026-08-13" })],
    logicalDate: "2026-08-15",
    calendarStart: "2026-08-12",
    calendarEnd: "2026-08-15",
    replay: { changedLogicalDate: "2026-08-12", kind: "outcome" },
  });

  assert.equal(result.nextDueOn, "2026-08-15");
  assert.notEqual(result.days["2026-08-14"]?.state, "missed");
});

test("a real later rolling Missed outcome still holds the overdue cursor", () => {
  const result = buildTaskEffectiveTimeline({
    task: task({ dueOn: "2026-08-15", recurrence: { kind: "rolling", intervalDays: 2 } }),
    history: [
      history("2026-08-12", "did_my_best"),
      history("2026-08-13", "missed", { occurrenceDueOn: "2026-08-13" }),
    ],
    logicalDate: "2026-08-15",
    calendarStart: "2026-08-12",
    calendarEnd: "2026-08-15",
    replay: { changedLogicalDate: "2026-08-12", kind: "outcome" },
  });

  assert.equal(result.nextDueOn, "2026-08-14");
  assert.equal(result.activeStatus, "missed");
  assert.equal(result.days["2026-08-13"]?.state, "missed");
});

test("fixed weekly replay retains its existing calendar cursor guard", () => {
  const result = buildTaskEffectiveTimeline({
    task: task({
      dueOn: "2026-08-24",
      recurrence: { kind: "weekly", intervalWeeks: 1, weekdays: [1], anchorDate: "2026-08-03" },
    }),
    history: [
      history("2026-08-10", "did_my_best", { occurrenceDueOn: "2026-08-10" }),
      history("2026-08-17", "did_my_best", { occurrenceDueOn: "2026-08-17" }),
    ],
    logicalDate: "2026-08-24",
    calendarStart: "2026-08-10",
    calendarEnd: "2026-08-24",
    replay: { changedLogicalDate: "2026-08-10", kind: "outcome" },
  });

  assert.equal(result.nextDueOn, "2026-08-24");
  assert.equal(result.days["2026-08-17"]?.state, "did_my_best");
});

test("ordinary chronological rolling completions retain their interval", () => {
  const result = timeline({
    task: { dueOn: "2026-08-12", recurrence: { kind: "rolling", intervalDays: 2 } },
    history: [
      history("2026-08-12", "did_my_best", { occurrenceDueOn: "2026-08-12" }),
      history("2026-08-14", "did_my_best", { occurrenceDueOn: "2026-08-14" }),
    ],
    logicalDate: "2026-08-15",
    calendarStart: "2026-08-12",
    calendarEnd: "2026-08-15",
  });

  assert.equal(result.nextDueOn, "2026-08-16");
  assert.equal(result.activeStatus, "upcoming");
});

test("removing a later success replays from the prior success checkpoint", () => {
  const result = buildTaskEffectiveTimeline({
    task: task({ dueOn: "2026-08-18", recurrence: { kind: "rolling", intervalDays: 5 } }),
    history: [
      history("2026-08-08", "done", { occurrenceDueOn: "2026-08-08" }),
      history("2026-08-13", "missed", { occurrenceDueOn: "2026-08-13" }),
    ],
    logicalDate: "2026-08-18",
    calendarStart: "2026-08-08",
    calendarEnd: "2026-08-18",
    replay: { changedLogicalDate: "2026-08-13", kind: "outcome" },
  });
  assert.equal(result.replayCheckpoint?.logicalDate, "2026-08-08");
  assert.equal(result.days["2026-08-13"]?.state, "missed");
  assert.equal(result.currentMissedStreak, 5);
  assert.equal(result.nextDueOn, "2026-08-13");
});

test("replay is deterministic and does not mutate explicit History", () => {
  const historyRows = [history("2026-08-08", "done", { occurrenceDueOn: "2026-08-08" })];
  const before = structuredClone(historyRows);
  const input = {
    task: task({ dueOn: "2026-08-14", recurrence: { kind: "rolling", intervalDays: 6 } }),
    history: historyRows,
    logicalDate: "2026-08-14",
    calendarStart: "2026-08-08",
    calendarEnd: "2026-08-14",
    replay: { changedLogicalDate: "2026-08-14", kind: "recurrence" as const },
  };
  assert.deepEqual(buildTaskEffectiveTimeline(input), buildTaskEffectiveTimeline(input));
  assert.deepEqual(historyRows, before);
});

test("an old explicit Missed row does not rewind a future cursor", () => {
  const missed = history("2026-08-03", "missed", {
    occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-03`,
    occurrenceDueOn: "2026-08-03",
  });
  const result = timeline({
    task: { dueOn: "2026-08-30", activeOccurrenceDueOn: "2026-08-30" },
    history: [missed],
    logicalDate: "2026-08-10",
    calendarStart: "2026-08-01",
    calendarEnd: "2026-08-30",
  });

  assert.equal(result.days["2026-08-03"]?.state, "missed");
  assert.equal(result.days["2026-08-03"]?.sourceKind, "history_fact");
  assert.equal(result.days["2026-08-03"]?.historyRowId, missed.id);
  for (const date of ["2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09", "2026-08-10"]) {
    assert.equal(result.days[date]?.state, "not_due", date);
  }
  assert.equal(result.unresolvedDueOn, null);
  assert.equal(result.currentMissedStreak, 1);
});

test("an active cursor after prior success is not advanced twice", () => {
  const done = history("2026-08-06", "done", {
    occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-10`,
    occurrenceDueOn: "2026-08-10",
  });
  const result = timeline({
    task: { dueOn: "2026-08-07", activeOccurrenceDueOn: "2026-08-07" },
    history: [done],
    logicalDate: "2026-08-06",
    calendarStart: "2026-08-06",
    calendarEnd: "2026-08-07",
  });

  assert.equal(result.days["2026-08-06"]?.state, "done");
  assert.equal(result.days["2026-08-06"]?.occurrenceDueOn, "2026-08-10");
  assert.equal(result.days["2026-08-06"]?.occurrenceIdentity, done.occurrenceIdentity);
  assert.equal(result.days["2026-08-07"]?.state, "scheduled");
});

test("backdated daily task calculates Missed through yesterday and overdue Open today", () => {
  const result = timeline();

  for (const date of ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"]) {
    assert.equal(result.days[date]?.state, "missed", date);
    assert.equal(result.days[date]?.sourceKind, "calculated", date);
    assert.equal(result.days[date]?.handled, false, date);
    assert.equal(result.days[date]?.historyRowId, null, date);
    assert.equal(result.days[date]?.occurrenceDueOn, "2026-08-01", date);
    assert.equal(result.days[date]?.occurrenceIdentity, `task:${TASK_ID}:occurrence:2026-08-01`, date);
  }
  assert.equal(result.days["2026-08-10"]?.state, "open");
  assert.equal(result.days["2026-08-10"]?.sourceKind, "calculated");
  assert.equal(result.days["2026-08-10"]?.obligation, "overdue");
  assert.equal(result.currentMissedStreak, 9);
  assert.equal(result.unresolvedDueOn, "2026-08-01");
});

test("current facts ignore a window-truncated missed streak", () => {
  const result = timeline({
    calendarStart: "2026-08-07",
    calendarEnd: "2026-08-10",
  });

  assert.deepEqual(Object.keys(result.days), [
    "2026-08-07",
    "2026-08-08",
    "2026-08-09",
    "2026-08-10",
  ]);
  for (const date of ["2026-08-07", "2026-08-08", "2026-08-09"]) {
    assert.equal(result.days[date]?.state, "missed", date);
  }
  assert.equal(result.days["2026-08-10"]?.state, "open");
  assert.equal(result.days["2026-08-10"]?.obligation, "overdue");
  assert.equal(result.currentMissedStreak, 9);
  assert.equal(result.unresolvedDueOn, "2026-08-01");
  assert.equal(result.currentObligation, "overdue");
});

test("current facts remain available when the window excludes the logical date", () => {
  const result = timeline({
    calendarStart: "2026-08-11",
    calendarEnd: "2026-08-15",
  });

  assert.deepEqual(Object.keys(result.days), [
    "2026-08-11",
    "2026-08-12",
    "2026-08-13",
    "2026-08-14",
    "2026-08-15",
  ]);
  assert.equal(result.currentMissedStreak, 9);
  assert.equal(result.unresolvedDueOn, "2026-08-01");
  assert.equal(result.currentObligation, "overdue");
});

test("Done splits the calculated missed streak and keeps explicit metadata", () => {
  const done = history("2026-08-05", "done", {
    occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-01`,
    occurrenceDueOn: "2026-08-01",
  });
  const result = timeline({ history: [done] });

  for (const date of ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"]) {
    assert.equal(result.days[date]?.state, "missed", date);
    assert.equal(result.days[date]?.sourceKind, "calculated", date);
  }
  assert.equal(result.days["2026-08-05"]?.state, "done");
  assert.equal(result.days["2026-08-05"]?.sourceKind, "history_fact");
  assert.equal(result.days["2026-08-05"]?.handled, true);
  assert.equal(result.days["2026-08-05"]?.historyRowId, done.id);
  assert.equal(result.days["2026-08-05"]?.occurrenceIdentity, done.occurrenceIdentity);
  assert.equal(result.days["2026-08-05"]?.occurrenceDueOn, done.occurrenceDueOn);
  assert.equal(result.days["2026-08-10"]?.state, "open");
  assert.equal(result.days["2026-08-10"]?.obligation, "overdue");
  assert.equal(result.currentMissedStreak, 4);
  assert.equal(result.unresolvedDueOn, "2026-08-06");
});

test("History Done before the visible window rebases current facts", () => {
  const done = history("2026-08-05", "done", {
    occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-01`,
    occurrenceDueOn: "2026-08-01",
  });
  const result = timeline({
    history: [done],
    calendarStart: "2026-08-08",
    calendarEnd: "2026-08-10",
  });

  assert.deepEqual(Object.keys(result.days), [
    "2026-08-08",
    "2026-08-09",
    "2026-08-10",
  ]);
  for (const date of ["2026-08-08", "2026-08-09"]) {
    assert.equal(result.days[date]?.state, "missed", date);
  }
  assert.equal(result.days["2026-08-10"]?.state, "open");
  assert.equal(result.days["2026-08-10"]?.obligation, "overdue");
  assert.equal(result.currentMissedStreak, 4);
  assert.equal(result.unresolvedDueOn, "2026-08-06");
  assert.equal(result.currentObligation, "overdue");
});

test("every three days rebases from Done and keeps an unresolved overdue span continuously Missed", () => {
  const done = history("2026-08-01", "done", {
    occurrenceIdentity: `task:${TASK_ID}:occurrence:2026-08-01`,
    occurrenceDueOn: "2026-08-01",
  });
  const result = timeline({
    task: { recurrence: { kind: "rolling", intervalDays: 3 } },
    history: [done],
  });

  assert.equal(result.days["2026-08-01"]?.state, "done");
  for (const date of ["2026-08-02", "2026-08-03"]) assert.equal(result.days[date]?.state, "not_due", date);
  assert.equal(result.days["2026-08-04"]?.state, "missed");
  for (const date of ["2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"]) {
    assert.equal(result.days[date]?.state, "missed", date);
  }
  assert.equal(result.days["2026-08-10"]?.state, "open");
  assert.equal(result.days["2026-08-10"]?.obligation, "overdue");
  assert.equal(result.currentMissedStreak, 6);
  assert.equal(result.unresolvedDueOn, "2026-08-04");
});

test("explicit History survives cadence interpretation and input remains unchanged", () => {
  const historyRows = [
    history("2026-08-01", "missed"),
    history("2026-08-02", "missed"),
    history("2026-08-03", "missed"),
    history("2026-08-04", "did_my_best"),
    history("2026-08-05", "missed"),
    history("2026-08-06", "missed"),
    history("2026-08-07", "missed"),
    history("2026-08-08", "missed"),
    history("2026-08-09", "missed"),
  ];
  const before = structuredClone(historyRows);
  const result = timeline({
    task: { recurrence: { kind: "rolling", intervalDays: 3 }, dueOn: null },
    history: historyRows,
  });

  for (const row of historyRows) {
    assert.equal(result.days[row.logicalDate]?.sourceKind, "history_fact", row.logicalDate);
    assert.equal(result.days[row.logicalDate]?.historyRowId, row.id, row.logicalDate);
    assert.equal(result.days[row.logicalDate]?.outcome, row.outcome, row.logicalDate);
  }
  assert.equal(result.days["2026-08-04"]?.outcome, "did_my_best");
  for (const date of ["2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"]) {
    assert.equal(result.days[date]?.outcome, "missed", date);
  }
  assert.equal(result.days["2026-08-10"]?.state, "open");
  assert.equal(result.days["2026-08-10"]?.obligation, "overdue");
  assert.equal(result.currentMissedStreak, 5);
  assert.deepEqual(historyRows, before);
});

test("manual History overrides a calculated Missed date", () => {
  const result = timeline({ history: [history("2026-08-05", "done")] });

  assert.equal(result.days["2026-08-05"]?.sourceKind, "history_fact");
  assert.equal(result.days["2026-08-05"]?.state, "done");
  assert.notEqual(result.days["2026-08-05"]?.state, "missed");
});

test("the current missed streak stops at a calculated Not Due gap", () => {
  const result = timeline({
    task: { dueOn: "2026-08-08" },
    calendarStart: "2026-08-07",
  });

  assert.equal(result.days["2026-08-07"]?.state, "not_due");
  assert.equal(result.days["2026-08-08"]?.state, "missed");
  assert.equal(result.days["2026-08-09"]?.state, "missed");
  assert.equal(result.currentMissedStreak, 2);
});

test("explicit Complete stops later dates at calculated no-entry", () => {
  const result = timeline({ history: [history("2026-08-05", "complete")] });

  assert.equal(result.days["2026-08-05"]?.state, "complete");
  assert.equal(result.days["2026-08-05"]?.sourceKind, "history_fact");
  for (const date of ["2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09", "2026-08-10"]) {
    assert.equal(result.days[date]?.state, "no_entry", date);
    assert.equal(result.days[date]?.sourceKind, "calculated", date);
  }
  assert.equal(result.currentMissedStreak, 0);
  assert.equal(result.unresolvedDueOn, null);
});
