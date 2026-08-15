import assert from "node:assert/strict";
import test from "node:test";

import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import type { CanonicalTaskStateColumns } from "../src/lib/task-state-canonical/types.ts";
import { projectTasksForActiveStatusRead, resolveActiveTaskStatuses } from "../src/lib/task-state-engine/index.ts";

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

test("shared active-status projection supplies all read surfaces and compatibility can fall back", () => {
  const source = [task({ status: "missed" })];
  const historyByTaskId: Record<string, TaskHistory[]> = { "task-1": [] };
  const engine = resolveActiveTaskStatuses({
    historyByTaskId, logicalDayRollover: "06:00", now: "2026-07-30T14:00:00.000Z", tasks: source, timezone: "America/New_York",
  });
  const projected = projectTasksForActiveStatusRead(source, engine.statusesByTaskId);
  for (const surface of ["Table", "List", "Home", "editor", "filters", "buckets", "overdue collections"]) {
    assert.equal(projected[0]?.status, engine.statusesByTaskId["task-1"], surface);
  }
  const legacy = resolveActiveTaskStatuses({
    enabled: false, historyByTaskId, logicalDayRollover: "06:00", now: "2026-07-30T14:00:00.000Z", tasks: source, timezone: "America/New_York",
  });
  assert.equal(legacy.authority, "legacy");
  assert.equal(legacy.statusesByTaskId["task-1"], "missed");
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
  assert.equal(engine.statusesByTaskId.delayed, "delayed");
  assert.equal(engine.statusesByTaskId.done, "done");
  assert.equal(engine.statusesByTaskId["did-my-best"], "did_my_best");
  assert.equal(engine.statusesByTaskId.missed, "missed");
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
