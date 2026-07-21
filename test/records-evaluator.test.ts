import assert from "node:assert/strict";
import test from "node:test";
import type { FocusSession, Task, TaskHistory } from "../src/lib/database.types.ts";
import { getRecordWeek } from "../src/lib/records/calendar.ts";
import { collapseTaskHistory, evaluateRecords } from "../src/lib/records/evaluator.ts";

function task(id: string, parent_task_id: string | null = null, repeat_frequency: Task["repeat_frequency"] = "daily"): Task {
  return { id, parent_task_id, repeat_frequency, title: id, user_id: "user-1" } as Task;
}

function history(id: string, task_id: string, entry_date: string, status: TaskHistory["status"], extra: Partial<TaskHistory> = {}): TaskHistory {
  return { id, task_id, user_id: "user-1", entry_date, occurrence_key: `occurrence:${entry_date}`, occurrence_due_on: entry_date, status, event_type: "status", counted_as_due_occurrence: false, was_completed: status === "done", created_at: `${entry_date}T12:00:00Z`, updated_at: `${entry_date}T12:00:00Z`, ...extra };
}

function focus(id: string, session_date: string, duration_seconds: number): FocusSession {
  return { id, user_id: "user-1", category_id: null, title_snapshot: id, focus_type_snapshot: "Focus", focus_subtype_snapshot: null, focus_subtype_2_snapshot: null, session_date, duration_seconds, notes: null, started_at: `${session_date}T10:00:00Z`, ended_at: `${session_date}T11:00:00Z`, source: "manual", runtime_session_id: null, created_at: `${session_date}T11:00:00Z` };
}

function evaluate(tasks: Task[], taskHistory: TaskHistory[], focusSessions: FocusSession[] = [], openLogicalDate = "2026-07-20") {
  return evaluateRecords({ evaluatedAt: "2026-07-20T12:00:00Z", focusSessions, logicalDayStart: "06:00", openLogicalDate, taskHistory, tasks, timezone: "America/New_York" });
}

test("logical dedupe keeps the authoritative outcome and classifies parent versus Step", () => {
  const tasks = [task("parent"), task("step", "parent")];
  const oldDone = history("row-1", "parent", "2026-07-10", "done", { occurrence_key: "same", updated_at: "2026-07-10T10:00:00Z" });
  const correctedMiss = history("row-2", "parent", "2026-07-10", "missed", { occurrence_key: "same", updated_at: "2026-07-11T10:00:00Z" });
  const stepDone = history("row-3", "step", "2026-07-10", "done");
  const collapsed = collapseTaskHistory({ taskHistory: [oldDone, correctedMiss, stepDone], tasks });
  assert.equal(collapsed.length, 2);
  assert.equal(collapsed.find((item) => item.task.id === "parent")?.history.status, "missed");
  assert.equal(collapsed.find((item) => item.task.id === "step")?.entityKind, "step");
  const result = evaluate(tasks, [oldDone, correctedMiss, stepDone]);
  assert.equal(result.currentRecords.find((record) => record.metricKey === "parent_tasks_day"), undefined);
  assert.equal(result.currentRecords.find((record) => record.metricKey === "steps_day")?.value, 1);
});

test("permanent Complete does not double-count without explicit due-occurrence permission", () => {
  const tasks = [task("parent")];
  const permanent = history("row-1", "parent", "2026-07-10", "complete", { event_type: "completed_permanently", counted_as_due_occurrence: false });
  const result = evaluate(tasks, [permanent]);
  assert.equal(result.currentRecords.find((record) => record.metricKey === "permanent_completes_day")?.value, 1);
  assert.equal(result.currentRecords.find((record) => record.metricKey === "parent_tasks_day"), undefined);
  const counted = evaluate(tasks, [{ ...permanent, counted_as_due_occurrence: true }]);
  assert.equal(counted.currentRecords.find((record) => record.metricKey === "parent_tasks_day")?.value, 1);
});

test("calendar grouping uses Monday-Sunday and open periods remain provisional", () => {
  assert.deepEqual(getRecordWeek("2026-07-19"), { start: "2026-07-13", end: "2026-07-19", key: "2026-07-13" });
  assert.deepEqual(getRecordWeek("2026-07-20"), { start: "2026-07-20", end: "2026-07-26", key: "2026-07-20" });
  const tasks = [task("a"), task("b")];
  const result = evaluate(tasks, [history("a1", "a", "2026-06-30", "done"), history("a2", "a", "2026-07-19", "done"), history("b2", "b", "2026-07-19", "done"), history("a3", "a", "2026-07-20", "done"), history("b3", "b", "2026-07-20", "done")]);
  assert.equal(result.currentRecords.find((record) => record.metricKey === "parent_tasks_week")?.periodKey, "2026-07-13");
  assert.equal(result.currentRecords.find((record) => record.metricKey === "parent_tasks_month")?.periodKey, "2026-06");
  assert.equal(result.provisionalCandidates.find((record) => record.metricKey === "parent_tasks_day")?.status, "provisional");
  assert.equal(result.events.some((event) => event.periodKey === "2026-07-20"), false);
});

test("parent, Step, combined, and Focus active-day streaks are independent", () => {
  const tasks = [task("parent"), task("step", "parent")];
  const result = evaluate(tasks, [history("p1", "parent", "2026-07-10", "done"), history("s1", "step", "2026-07-11", "done"), history("p2", "parent", "2026-07-12", "done")], [focus("f1", "2026-07-10", 60), focus("f2", "2026-07-11", 90)]);
  assert.equal(result.currentRecords.find((record) => record.metricKey === "parent_completion_day_streak")?.value, 1);
  assert.equal(result.currentRecords.find((record) => record.metricKey === "step_completion_day_streak")?.value, 1);
  assert.equal(result.currentRecords.find((record) => record.metricKey === "combined_completion_day_streak")?.value, 3);
  assert.equal(result.currentRecords.find((record) => record.metricKey === "focus_active_day_streak")?.value, 2);
});

test("Focus uses stored durations for session and closed period records", () => {
  const sessions = [focus("short", "2026-07-10", 1200), focus("long", "2026-07-10", 5400), focus("manual", "2026-07-11", 1800)];
  const result = evaluate([], [], sessions);
  assert.equal(result.currentRecords.find((record) => record.metricKey === "longest_focus_session")?.value, 5400);
  assert.equal(result.currentRecords.find((record) => record.metricKey === "focus_duration_day")?.value, 6600);
  assert.equal(result.currentRecords.find((record) => record.metricKey === "focus_sessions_day")?.value, 2);
  assert.equal(result.currentRecords.find((record) => record.metricKey === "focus_duration_week")?.value, 8400);
});

test("per-task streaks cap one-offs at one and Biggest Comeback requires an immediate success endpoint", () => {
  const recurring = task("recurring");
  const oneOff = task("one-off", null, "none");
  const rows = [
    history("r1", "recurring", "2026-07-01", "done"), history("r2", "recurring", "2026-07-02", "done"),
    history("r3", "recurring", "2026-07-03", "missed"), history("r4", "recurring", "2026-07-04", "missed"), history("r5", "recurring", "2026-07-05", "delayed"), history("r6", "recurring", "2026-07-06", "done"),
    history("r7", "recurring", "2026-07-07", "missed"), history("r8", "recurring", "2026-07-08", "missed"), history("r9", "recurring", "2026-07-09", "did_my_best"), history("r10", "recurring", "2026-07-10", "missed"),
    history("o1", "one-off", "2026-07-01", "done", { occurrence_key: null }), history("o2", "one-off", "2026-07-02", "done", { occurrence_key: null }),
  ];
  const result = evaluate([recurring, oneOff], rows);
  const taskRecords = result.currentRecords.filter((record) => record.scopeId === "recurring");
  assert.equal(taskRecords.find((record) => record.metricKey === "task_occurrence_streak")?.value, 2);
  assert.equal(taskRecords.find((record) => record.metricKey === "task_biggest_comeback")?.value, 2);
  assert.equal(result.currentRecords.find((record) => record.scopeId === "one-off" && record.metricKey === "task_occurrence_streak")?.value, 1);
  assert.equal(result.currentRecords.some((record) => record.scopeId === "one-off" && record.metricKey === "task_biggest_comeback"), false);
});

test("distinct ties preserve first achievement while identical replay creates no duplicate", () => {
  const tasks = [task("a"), task("b")];
  const rows = [history("a1", "a", "2026-07-10", "done"), history("b1", "b", "2026-07-11", "done")];
  const result = evaluate(tasks, [...rows, rows[1]]);
  const events = result.events.filter((event) => event.metricKey === "parent_tasks_day");
  assert.equal(events.length, 2);
  assert.equal(events[0].eventKind, "break");
  assert.equal(events[1].eventKind, "tie");
  assert.equal(events[1].firstAchievedAt, events[0].firstAchievedAt);
  assert.notEqual(events[0].eventIdentity, events[1].eventIdentity);
});
