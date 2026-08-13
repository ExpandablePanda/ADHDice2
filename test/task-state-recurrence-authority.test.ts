import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTaskEffectiveTimeline,
  evaluateTaskState,
  type TaskHistoryOutcome,
  type TaskStateHistoryRow,
  type TaskStateSnapshot,
} from "../src/lib/task-state-engine/index.ts";

const TASK_ID = "task-recurrence-authority";

function task(overrides: Partial<TaskStateSnapshot> = {}): TaskStateSnapshot {
  return {
    id: TASK_ID,
    lifecycle: "active",
    activeStatus: "pending",
    dueOn: "2026-08-10",
    recurrence: { kind: "rolling", intervalDays: 1 },
    ...overrides,
  };
}

function history(
  outcome: TaskHistoryOutcome,
  overrides: Partial<TaskStateHistoryRow> = {},
): TaskStateHistoryRow {
  const logicalDate = overrides.logicalDate ?? "2026-08-10";
  return {
    id: `history-${outcome}`,
    taskId: TASK_ID,
    logicalDate,
    outcome,
    provenance: "import",
    occurredAt: `${logicalDate}T12:00:00.000Z`,
    ...overrides,
  };
}

function timeline(historyRows: TaskStateHistoryRow[], taskOverrides: Partial<TaskStateSnapshot> = {}) {
  return buildTaskEffectiveTimeline({
    task: task(taskOverrides),
    history: historyRows,
    logicalDate: "2026-08-12",
    calendarStart: "2026-08-10",
    calendarEnd: "2026-08-12",
  });
}

function engine(historyRows: TaskStateHistoryRow[], taskOverrides: Partial<TaskStateSnapshot> = {}) {
  return evaluateTaskState({
    task: task(taskOverrides),
    history: historyRows,
    now: "2026-08-12T12:00:00.000Z",
    timezone: "UTC",
    logicalDayRollover: "00:00",
  });
}

test("normal and explicitly authoritative History remain recurrence-authoritative", () => {
  const normal = engine([history("done", { occurrenceDueOn: "2026-08-10", occurrenceIdentity: "task:task-recurrence-authority:occurrence:2026-08-10" })]);
  const explicit = engine([history("done", { recurrenceAuthoritative: true, occurrenceDueOn: "2026-08-10", occurrenceIdentity: "task:task-recurrence-authority:occurrence:2026-08-10" })]);
  assert.equal(normal.nextDueDate, "2026-08-11");
  assert.equal(explicit.nextDueDate, normal.nextDueDate);
});

test("non-authoritative migration Done remains visible without advancing recurrence", () => {
  const result = engine([history("done", { recurrenceAuthoritative: false, occurrenceDueOn: "2026-08-10" })]);
  const displayed = timeline([history("done", { recurrenceAuthoritative: false, occurrenceDueOn: "2026-08-10" })]);
  assert.equal(result.nextDueDate, "2026-08-10");
  assert.equal(result.recurrenceAnchor, null);
  assert.equal(displayed.days["2026-08-10"]?.outcome, "done");
  assert.equal(displayed.days["2026-08-10"]?.handled, true);
});

test("non-authoritative migration Did My Best remains visible without advancing recurrence", () => {
  const result = engine([history("did_my_best", { recurrenceAuthoritative: false, occurrenceDueOn: "2026-08-10" })]);
  const displayed = timeline([history("did_my_best", { recurrenceAuthoritative: false, occurrenceDueOn: "2026-08-10" })]);
  assert.equal(result.nextDueDate, "2026-08-10");
  assert.equal(displayed.days["2026-08-10"]?.outcome, "did_my_best");
});

test("non-authoritative migration Missed remains visible without freezing unresolved recurrence", () => {
  const result = engine([history("missed", { recurrenceAuthoritative: false, occurrenceDueOn: "2026-08-10" })]);
  const displayed = timeline([history("missed", { recurrenceAuthoritative: false, occurrenceDueOn: "2026-08-10" })]);
  const empty = engine([]);
  const emptyTimeline = timeline([]);
  assert.equal(result.unresolvedOccurrenceDueOn, null);
  assert.equal(result.unresolvedOccurrenceDueOn, empty.unresolvedOccurrenceDueOn);
  assert.equal(displayed.days["2026-08-10"]?.outcome, "missed");
  assert.equal(displayed.unresolvedDueOn, emptyTimeline.unresolvedDueOn);
});

test("non-authoritative migration Complete remains historical and does not complete the task", () => {
  const result = engine([history("complete", { recurrenceAuthoritative: false, occurrenceDueOn: "2026-08-10" })]);
  const displayed = timeline([history("complete", { recurrenceAuthoritative: false, occurrenceDueOn: "2026-08-10" })]);
  assert.notEqual(result.activeStatus, "complete");
  assert.equal(result.nextDueDate, "2026-08-10");
  assert.equal(displayed.days["2026-08-10"]?.outcome, "complete");
  assert.equal(displayed.days["2026-08-12"]?.state, "open");
});

test("migration reconstruction with a real canonical occurrence remains recurrence-authoritative", () => {
  const result = engine([history("done", {
    recurrenceAuthoritative: true,
    occurrenceDueOn: "2026-08-10",
    occurrenceIdentity: "task:task-recurrence-authority:occurrence:2026-08-10",
  })]);
  assert.equal(result.nextDueDate, "2026-08-11");
});

test("compatibility occurrence dates do not establish an initial recurrence anchor or overdue spans", () => {
  const displayed = buildTaskEffectiveTimeline({
    task: task({ dueOn: null }),
    history: [history("done", {
      recurrenceAuthoritative: false,
      logicalDate: "2026-08-05",
      occurrenceDueOn: "2026-08-01",
    })],
    logicalDate: "2026-08-05",
    calendarStart: "2026-08-01",
    calendarEnd: "2026-08-05",
  });
  assert.equal(displayed.days["2026-08-05"]?.outcome, "done");
  assert.equal(displayed.days["2026-08-01"]?.state, "no_entry");
  assert.notEqual(displayed.days["2026-08-02"]?.state, "missed");
});
