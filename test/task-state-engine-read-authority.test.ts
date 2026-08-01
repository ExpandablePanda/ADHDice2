import assert from "node:assert/strict";
import test from "node:test";

import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import { projectTasksForActiveStatusRead, resolveActiveTaskStatuses } from "../src/lib/task-state-engine/index.ts";

function task(overrides: Partial<Task> = {}): Task {
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
