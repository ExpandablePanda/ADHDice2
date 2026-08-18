import assert from "node:assert/strict";
import test from "node:test";

import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import { getTaskRecoveryEarliestDate } from "../src/lib/task-history.ts";
import { buildTaskHistoryStreakSummary } from "../src/lib/task-history-streak-summaries.ts";
import { resolveTaskHistoryCalendarStates as resolveCompatibilityCalendarStates } from "../src/lib/task-state-engine/calendar-authority.ts";
import { resolveCompatibilityTaskStatuses as resolveActiveTaskStatuses } from "../src/lib/task-state-engine/read-authority.ts";

const TODAY = "2026-08-17";

function task(overrides: Partial<Task> = {}): Task {
  return {
    active_occurrence_due_on: null,
    active_status_logical_date: null,
    actual_seconds: 0,
    completed_at: null,
    created_at: "2026-08-01T12:00:00.000Z",
    due_on: TODAY,
    due_time: null,
    energy: "medium",
    estimated_minutes: null,
    external_link_label: null,
    external_link_url: null,
    id: "task-7-9-27",
    is_important: false,
    is_urgent: false,
    notes: null,
    one_step_at_a_time: false,
    parent_task_id: null,
    pin_order: null,
    pinned_at: null,
    priority: "normal",
    repeat_day_of_month: null,
    repeat_days_of_week: [],
    repeat_frequency: "none",
    repeat_interval: 1,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    revision: 1,
    scheduled_on: null,
    sort_order: 0,
    status: "pending",
    subtasks_auto_reset: false,
    tags: [],
    title: "7.9.27 regression",
    trashed_at: null,
    updated_at: "2026-08-01T12:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

function history(
  taskId: string,
  entryDate: string,
  status: TaskHistory["status"],
  overrides: Partial<TaskHistory> = {},
): TaskHistory {
  return {
    counted_as_due_occurrence: true,
    created_at: `${entryDate}T12:00:00.000Z`,
    entry_date: entryDate,
    event_type: status === "complete" ? "completed_permanently" : "status",
    id: `${taskId}:${entryDate}:${status}`,
    occurrence_due_on: null,
    occurrence_key: null,
    status,
    task_id: taskId,
    updated_at: `${entryDate}T12:00:00.000Z`,
    user_id: "user-1",
    was_completed: status === "done" || status === "did_my_best" || status === "complete",
    ...overrides,
  };
}

function activeStatus(sourceTask: Task, rows: TaskHistory[]) {
  return resolveActiveTaskStatuses({
    historyByTaskId: { [sourceTask.id]: rows },
    logicalDayRollover: "00:00",
    now: `${TODAY}T12:00:00.000Z`,
    tasks: [sourceTask],
    timezone: "UTC",
  }).statusesByTaskId[sourceTask.id];
}

function calendar(sourceTask: Task, rows: TaskHistory[], start: string, end: string) {
  return resolveCompatibilityCalendarStates({
    compatibilityOnly: true,
    calendarStart: start,
    calendarEnd: end,
    history: rows,
    logicalDayRollover: "00:00",
    now: `${TODAY}T12:00:00.000Z`,
    task: sourceTask,
    timezone: "UTC",
  });
}

test("Vera Reports and Roth Reports old identity-less Monday History stays Open", () => {
  for (const id of ["vera-reports", "roth-reports"]) {
    const sourceTask = task({
      id,
      due_on: TODAY,
      repeat_days_of_week: [1],
      repeat_frequency: "weekly",
      title: id,
    });
    assert.equal(activeStatus(sourceTask, [history(id, "2026-08-10", "done")]), "pending", id);
  }
});

test("FedEx child recurrence uses the shared active status read", () => {
  const child = task({
    id: "fedex-child",
    parent_task_id: "fedex-parent",
    repeat_frequency: "daily",
    title: "FedEx child",
  });
  assert.equal(activeStatus(child, []), "pending");
  assert.equal(activeStatus(child, [history(child.id, TODAY, "done")]), "upcoming");
});

test("Address Corrections moved cursor makes the old date Not Due and the cursor Due", () => {
  const sourceTask = task({
    id: "address-corrections",
    due_on: "2026-08-18",
    repeat_days_of_week: [2],
    repeat_frequency: "weekly",
    title: "Address Corrections",
  });
  const states = calendar(sourceTask, [], "2026-08-17", "2026-08-18");
  assert.equal(states?.["2026-08-17"], "not_due");
  assert.equal(states?.["2026-08-18"], "due");
});

test("bounded and full History produce the same current read", () => {
  const sourceTask = task({ id: "bounded-full", repeat_frequency: "daily", status: "missed" });
  const full = [history(sourceTask.id, "2026-08-01", "missed"), history(sourceTask.id, "2026-08-16", "done")];
  const bounded = [full[1]!];
  assert.equal(activeStatus(sourceTask, full), activeStatus(sourceTask, bounded));
  assert.equal(calendar(sourceTask, full, "2026-08-16", TODAY)?.[TODAY], calendar(sourceTask, bounded, "2026-08-16", TODAY)?.[TODAY]);
});

test("daily unresolved Missed keeps Active Missed while today remains Due", () => {
  const sourceTask = task({ id: "daily-missed", due_on: "2026-08-16", repeat_frequency: "daily", status: "missed" });
  const rows = [history(sourceTask.id, "2026-08-16", "missed", { occurrence_due_on: "2026-08-16" })];
  assert.equal(activeStatus(sourceTask, rows), "missed");
  assert.equal(calendar(sourceTask, rows, "2026-08-16", TODAY)?.[TODAY], "due");
});

test("rolling Every 3 Days correction advances from the corrected occurrence", () => {
  const sourceTask = task({ id: "rolling-correction", due_on: "2026-08-16", repeat_frequency: "custom", repeat_interval: 3, status: "missed" });
  const rows = [history(sourceTask.id, "2026-08-16", "missed", { occurrence_due_on: "2026-08-16", occurrence_key: `task:${sourceTask.id}:occurrence:2026-08-16` })];
  assert.equal(activeStatus(sourceTask, rows), "missed");
  assert.equal(calendar({ ...sourceTask, due_on: "2026-08-19" }, [history(sourceTask.id, "2026-08-16", "done", { occurrence_due_on: "2026-08-16", occurrence_key: `task:${sourceTask.id}:occurrence:2026-08-16` })], "2026-08-16", "2026-08-19")?.["2026-08-19"], "due");
});

test("Unscheduled positive streaks never create a missed streak and blanks break continuity", () => {
  const sourceTask = task({ id: "unscheduled-streak", due_on: null, repeat_frequency: "none" });
  const consecutive = [history(sourceTask.id, "2026-08-16", "done"), history(sourceTask.id, TODAY, "did_my_best")];
  const broken = [history(sourceTask.id, "2026-08-15", "done"), history(sourceTask.id, TODAY, "done")];
  assert.deepEqual(buildTaskHistoryStreakSummary(sourceTask, consecutive, TODAY, { compatibilityOnly: true, now: `${TODAY}T12:00:00.000Z`, timezone: "UTC" }), {
    currentStreak: 2,
    lastHandledAt: null,
    lastHandledDate: null,
    lastDoneAt: `${TODAY}T12:00:00.000Z`,
    lastDoneDate: TODAY,
    missedStreak: 0,
  });
  assert.equal(buildTaskHistoryStreakSummary(sourceTask, broken, TODAY, { compatibilityOnly: true, now: `${TODAY}T12:00:00.000Z`, timezone: "UTC" }).currentStreak, 1);
});

test("old rolling History does not consume an unrelated future occurrence", () => {
  const sourceTask = task({ id: "rolling-cursor", due_on: "2026-08-18", repeat_frequency: "custom", repeat_interval: 3 });
  assert.equal(activeStatus(sourceTask, [history(sourceTask.id, "2026-08-10", "done")]), "upcoming");
  assert.equal(calendar(sourceTask, [history(sourceTask.id, "2026-08-10", "done")], "2026-08-17", "2026-08-18")?.["2026-08-18"], "due");
});

test("recovery cannot cross the latest saved fact and invents no zero-History anchor", () => {
  const sourceTask = task({ due_on: "2026-08-17" });
  assert.equal(getTaskRecoveryEarliestDate(sourceTask, [history(sourceTask.id, "2026-08-16", "done")]), "2026-08-17");
  assert.equal(getTaskRecoveryEarliestDate(sourceTask, []), "2026-08-17");
  assert.equal(getTaskRecoveryEarliestDate({ due_on: null }, []), null);
  assert.equal(getTaskRecoveryEarliestDate({ due_on: null }, [], "2026-08-18"), "2026-08-18");
});
