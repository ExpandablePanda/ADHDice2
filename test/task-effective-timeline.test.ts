import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTaskEffectiveTimeline,
  type TaskHistoryOutcome,
  type TaskStateHistoryRow,
  type TaskStateSnapshot,
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
  } = {},
) {
  return buildTaskEffectiveTimeline({
    task: task(overrides.task),
    history: overrides.history ?? [],
    logicalDate: overrides.logicalDate ?? "2026-08-10",
    calendarStart: overrides.calendarStart ?? "2026-08-01",
    calendarEnd: overrides.calendarEnd ?? "2026-08-10",
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
    assert.equal(day?.origin, "calculated", date);
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
    assert.equal(result.days[date]?.origin, "calculated", date);
    assert.equal(result.days[date]?.occurrenceDueOn, "2026-08-01", date);
    assert.equal(result.days[date]?.occurrenceIdentity, `task:${TASK_ID}:occurrence:2026-08-01`, date);
    assert.equal(result.days[date]?.historyRowId, null, date);
  }
  assert.equal(result.days["2026-08-06"]?.state, "done");
  assert.equal(result.days["2026-08-06"]?.origin, "explicit_history");
  assert.equal(result.days["2026-08-06"]?.handled, true);
  assert.equal(result.days["2026-08-06"]?.historyRowId, done.id);
  assert.equal(result.days["2026-08-06"]?.occurrenceDueOn, "2026-08-10");
  assert.equal(result.days["2026-08-06"]?.occurrenceIdentity, done.occurrenceIdentity);
  assert.equal(result.days["2026-08-07"]?.state, "scheduled");
  for (const day of Object.values(result.days)) {
    if (day.origin === "calculated") assert.equal(day.historyRowId, null, day.logicalDate);
  }
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
    assert.equal(result.days[date]?.origin, "calculated", date);
    assert.equal(result.days[date]?.handled, false, date);
    assert.equal(result.days[date]?.historyRowId, null, date);
    assert.equal(result.days[date]?.outcome, null, date);
  }
  assert.equal(result.days["2026-08-01"]?.occurrenceDueOn, "2026-08-01");
  assert.equal(result.days["2026-08-02"]?.occurrenceDueOn, "2026-08-01");
  assert.equal(result.days["2026-08-03"]?.state, "done");
  assert.equal(result.days["2026-08-03"]?.origin, "explicit_history");
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
    assert.equal(result.days[date]?.origin, "calculated", date);
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
    assert.equal(result.days[date]?.origin, "calculated", date);
  }
  assert.equal(result.days["2026-08-06"]?.state, "done");
  assert.equal(result.days["2026-08-06"]?.origin, "explicit_history");
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
    assert.equal(result.days[date]?.origin, "calculated", date);
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
  assert.equal(result.days["2026-08-01"]?.origin, "calculated");
  assert.equal(result.days["2026-08-02"]?.state, "did_my_best");
  assert.equal(result.days["2026-08-02"]?.origin, "explicit_history");
  assert.equal(result.days["2026-08-02"]?.historyRowId, didMyBest.id);
  assert.equal(result.days["2026-08-02"]?.outcome, "did_my_best");
  assert.equal(result.days["2026-08-03"]?.state, "missed");
  assert.equal(result.days["2026-08-03"]?.origin, "calculated");
  assert.equal(result.days["2026-08-04"]?.state, "done");
  assert.equal(result.days["2026-08-04"]?.origin, "explicit_history");
  assert.equal(result.days["2026-08-04"]?.historyRowId, done.id);
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
  assert.equal(result.days["2026-08-03"]?.origin, "explicit_history");
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
    assert.equal(result.days[date]?.origin, "calculated", date);
    assert.equal(result.days[date]?.handled, false, date);
    assert.equal(result.days[date]?.historyRowId, null, date);
    assert.equal(result.days[date]?.occurrenceDueOn, "2026-08-01", date);
    assert.equal(result.days[date]?.occurrenceIdentity, `task:${TASK_ID}:occurrence:2026-08-01`, date);
  }
  assert.equal(result.days["2026-08-10"]?.state, "open");
  assert.equal(result.days["2026-08-10"]?.origin, "calculated");
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
    assert.equal(result.days[date]?.origin, "calculated", date);
  }
  assert.equal(result.days["2026-08-05"]?.state, "done");
  assert.equal(result.days["2026-08-05"]?.origin, "explicit_history");
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

test("every three days rebases from Done and leaves the next occurrence overdue", () => {
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
  for (const date of ["2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"]) {
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
    assert.equal(result.days[row.logicalDate]?.origin, "explicit_history", row.logicalDate);
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

  assert.equal(result.days["2026-08-05"]?.origin, "explicit_history");
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
  assert.equal(result.days["2026-08-05"]?.origin, "explicit_history");
  for (const date of ["2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09", "2026-08-10"]) {
    assert.equal(result.days[date]?.state, "no_entry", date);
    assert.equal(result.days[date]?.origin, "calculated", date);
  }
  assert.equal(result.currentMissedStreak, 0);
  assert.equal(result.unresolvedDueOn, null);
});
