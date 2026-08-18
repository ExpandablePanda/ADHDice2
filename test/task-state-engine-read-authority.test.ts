import assert from "node:assert/strict";
import test from "node:test";

import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import type { CanonicalTaskStateColumns } from "../src/lib/task-state-canonical/types.ts";
import { formatTaskStatusLabel, TASK_STATUS_OPTIONS } from "../src/components/task-app/task-status-ui.tsx";
import { projectTasksForActiveStatusRead, resolveActiveTaskStatuses } from "../src/lib/task-state-engine/index.ts";
import { resolveTaskHistoryCalendarStates } from "../src/lib/task-state-engine/calendar-authority.ts";

type ReadTask = Task & Partial<Pick<CanonicalTaskStateColumns, "workflow_state" | "workflow_logical_date">>;

function task(overrides: Partial<ReadTask> = {}): ReadTask {
  return {
    active_occurrence_due_on: null, active_status_logical_date: null, actual_seconds: 0,
    completed_at: null, created_at: "2026-07-01T12:00:00.000Z", due_on: "2026-07-28", due_time: null,
    energy: "medium", estimated_minutes: null, external_link_label: null, external_link_url: null,
    id: "task-1", is_important: false, is_urgent: false, notes: null, one_step_at_a_time: false,
    parent_task_id: null, pin_order: null, pinned_at: null, priority: "normal", repeat_day_of_month: null,
    repeat_days_of_week: [], repeat_frequency: "none", repeat_interval: 1, repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null, repeat_monthly_weekday: null, revision: 1, scheduled_on: null, sort_order: 0,
    status: "pending", subtasks_auto_reset: false, tags: [], title: "Read authority", trashed_at: null,
    updated_at: "2026-07-01T12:00:00.000Z", user_id: "user-1", ...overrides,
  };
}

test("shared active-status projection supplies all read surfaces", () => {
  const source = [task({ status: "missed" })];
  const historyByTaskId: Record<string, TaskHistory[]> = { "task-1": [] };
  const engine = resolveActiveTaskStatuses({
    historyByTaskId, logicalDayRollover: "06:00", now: "2026-07-30T14:00:00.000Z", tasks: source, timezone: "America/New_York",
  });
  const projected = projectTasksForActiveStatusRead(source, engine.statusesByTaskId);
  for (const surface of ["Table", "List", "Home", "editor", "filters", "buckets", "overdue collections"]) {
    assert.equal(projected[0]?.status, engine.statusesByTaskId["task-1"], surface);
  }
  const repeated = resolveActiveTaskStatuses({
    enabled: false, historyByTaskId, logicalDayRollover: "06:00", now: "2026-07-30T14:00:00.000Z", tasks: source, timezone: "America/New_York",
  });
  assert.equal(repeated.authority, "engine");
  assert.deepEqual(repeated.statusesByTaskId, engine.statusesByTaskId);
});

test("stored Pending dormant tasks remain engine-derived Unscheduled on read", () => {
  const engine = resolveActiveTaskStatuses({
    historyByTaskId: { "task-1": [] }, logicalDayRollover: "06:00", now: "2026-07-30T14:00:00.000Z",
    tasks: [task({ due_on: null, repeat_frequency: "none", status: "pending" })], timezone: "America/New_York",
  });
  assert.equal(engine.statusesByTaskId["task-1"], "unscheduled");
});

test("Unscheduled only projects the ordinary open state", () => {
  const statuses = [
    ["pending", "pending"],
    ["pending-today", "pending"],
    ["pending-future", "pending"],
    ["in-progress", "in_progress"],
    ["delayed", "delayed"],
    ["done", "done"],
    ["did-my-best", "did_my_best"],
    ["missed", "missed"],
    ["complete", "complete"],
  ] as const;
  const tasks = statuses.map(([id, status]) => task({
    id,
    status,
    ...(id === "in-progress" ? { active_status_logical_date: "2026-07-30" } : {}),
    due_on: id === "pending-today" ? "2026-07-30" : id === "pending-future" ? "2026-08-02" : null,
  }));
  const engine = resolveActiveTaskStatuses({
    historyByTaskId: Object.fromEntries(tasks.map((source) => [source.id, []])),
    logicalDayRollover: "06:00",
    now: "2026-07-30T14:00:00.000Z",
    tasks,
    timezone: "America/New_York",
  });

  assert.equal(engine.statusesByTaskId.pending, "unscheduled");
  assert.equal(engine.statusesByTaskId["pending-today"], "pending");
  assert.equal(engine.statusesByTaskId["pending-future"], "upcoming");
  assert.equal(engine.statusesByTaskId["in-progress"], "in_progress");
  assert.equal(engine.statusesByTaskId.delayed, "unscheduled");
  assert.equal(engine.statusesByTaskId.done, "unscheduled");
  assert.equal(engine.statusesByTaskId["did-my-best"], "unscheduled");
  assert.equal(engine.statusesByTaskId.missed, "unscheduled");
  assert.equal(engine.statusesByTaskId.complete, "complete");
});

test("canonical current-day In Progress workflow is visible when legacy date is null", () => {
  const source = task({
    active_status_logical_date: null,
    status: "pending",
    workflow_logical_date: "2026-08-11",
    workflow_state: "in_progress",
  });
  const engine = resolveActiveTaskStatuses({
    historyByTaskId: { [source.id]: [] },
    logicalDayRollover: "06:00",
    now: "2026-08-11T14:00:00.000Z",
    tasks: [source],
    timezone: "America/New_York",
  });

  assert.equal(engine.statusesByTaskId[source.id], "in_progress");
  assert.equal(source.status, "pending");
  assert.equal(source.active_status_logical_date, null);
});

test("stale canonical In Progress workflow is not visible as current In Progress", () => {
  const source = task({
    active_status_logical_date: null,
    status: "pending",
    workflow_logical_date: "2026-08-10",
    workflow_state: "in_progress",
  });
  const engine = resolveActiveTaskStatuses({
    historyByTaskId: { [source.id]: [] },
    logicalDayRollover: "06:00",
    now: "2026-08-11T14:00:00.000Z",
    tasks: [source],
    timezone: "America/New_York",
  });

  assert.notEqual(engine.statusesByTaskId[source.id], "in_progress");
});

test("active status keeps an unresolved Weekdays Missed chain through weekend gaps", () => {
  const weekdays = task({
    due_on: "2026-08-07",
    repeat_frequency: "weekly",
    repeat_days_of_week: [1, 2, 3, 4, 5],
    status: "missed",
  });
  const historyRows = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"].map((entry_date) => ({
    counted_as_due_occurrence: true,
    created_at: `${entry_date}T12:00:00.000Z`,
    entry_date,
    event_type: "status" as const,
    id: `history-${entry_date}`,
    occurrence_due_on: entry_date,
    occurrence_key: `occurrence:${entry_date}`,
    status: "missed" as const,
    task_id: weekdays.id,
    updated_at: `${entry_date}T12:00:00.000Z`,
    user_id: weekdays.user_id,
    was_completed: false,
  }));

  for (const now of ["2026-08-08T12:00:00.000Z", "2026-08-09T12:00:00.000Z", "2026-08-10T12:00:00.000Z"]) {
    const read = resolveActiveTaskStatuses({
      historyByTaskId: { [weekdays.id]: historyRows },
      logicalDayRollover: "00:00",
      now,
      tasks: [weekdays],
      timezone: "UTC",
    });
    assert.equal(read.statusesByTaskId[weekdays.id], "missed", now);
  }

  const calendar = resolveTaskHistoryCalendarStates({
    calendarStart: "2026-08-03",
    calendarEnd: "2026-08-10",
    history: historyRows,
    logicalDayRollover: "00:00",
    now: "2026-08-10T12:00:00.000Z",
    task: weekdays,
    timezone: "UTC",
  });
  assert.equal(calendar?.["2026-08-08"], "not_due");
  assert.equal(calendar?.["2026-08-09"], "not_due");
  assert.equal(calendar?.["2026-08-10"], "due");
  assert.equal(Object.values(calendar ?? {}).includes("open" as never), false);
  assert.equal(Object.values(calendar ?? {}).includes("upcoming" as never), false);
});

test("clean Due remains internally pending while the user-facing active label is Open", () => {
  const source = task({ due_on: "2026-08-10", status: "pending", repeat_frequency: "none" });
  const read = resolveActiveTaskStatuses({
    historyByTaskId: { [source.id]: [] },
    logicalDayRollover: "00:00",
    now: "2026-08-10T12:00:00.000Z",
    tasks: [source],
    timezone: "UTC",
  });
  assert.equal(read.statusesByTaskId[source.id], "pending");
  assert.equal(formatTaskStatusLabel("pending"), "Open");
  assert.equal(TASK_STATUS_OPTIONS.find((option) => option.value === "pending")?.label, "Open");
});

test("future active-status thresholds remain Upcoming and Not Due without a Missed chain", () => {
  const upcoming = task({ due_on: "2026-08-13", status: "pending" });
  const notDue = task({ id: "not-due", due_on: "2026-08-19", status: "pending" });
  const read = resolveActiveTaskStatuses({
    historyByTaskId: { [upcoming.id]: [], [notDue.id]: [] },
    logicalDayRollover: "00:00",
    now: "2026-08-10T12:00:00.000Z",
    tasks: [upcoming, notDue],
    timezone: "UTC",
  });
  assert.equal(read.statusesByTaskId[upcoming.id], "upcoming");
  assert.equal(read.statusesByTaskId[notDue.id], "not_due");
});
