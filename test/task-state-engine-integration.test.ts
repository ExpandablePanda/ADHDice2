import assert from "node:assert/strict";
import test from "node:test";

import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import { evaluateTaskActionAuthority } from "../src/lib/task-state-engine/action-authority.ts";
import { resolveTaskHistoryCalendarActionStatuses, resolveTaskHistoryCalendarStates } from "../src/lib/task-state-engine/calendar-authority.ts";

function task(overrides: Partial<Task> = {}): Task {
  return {
    active_occurrence_due_on: null, active_status_logical_date: null, actual_seconds: 0,
    completed_at: null, created_at: "2026-07-01T12:00:00.000Z", due_on: "2026-07-30", due_time: null,
    energy: "medium", estimated_minutes: null, external_link_label: null, external_link_url: null,
    id: "task-1", is_important: false, is_urgent: false, notes: null, one_step_at_a_time: false,
    parent_task_id: null, pin_order: null, pinned_at: null, priority: "normal", repeat_day_of_month: null,
    repeat_days_of_week: [], repeat_frequency: "daily", repeat_interval: 1, repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null, repeat_monthly_weekday: null, revision: 1, scheduled_on: null, sort_order: 0,
    status: "pending", subtasks_auto_reset: false, tags: [], title: "Integration", trashed_at: null,
    updated_at: "2026-07-01T12:00:00.000Z", user_id: "user-1", ...overrides,
  };
}

function history(status: TaskHistory["status"], entry_date = "2026-07-30"): TaskHistory {
  return {
    counted_as_due_occurrence: true, created_at: `${entry_date}T12:00:00.000Z`, entry_date,
    event_type: "status", id: `history-${entry_date}`, occurrence_due_on: entry_date,
    occurrence_key: `occurrence:${entry_date}`, status, task_id: "task-1", updated_at: `${entry_date}T12:00:00.000Z`,
    user_id: "user-1", was_completed: status === "done" || status === "did_my_best" || status === "complete",
  };
}

const context = { logicalDayRollover: "06:00", now: "2026-07-31T14:00:00.000Z", timezone: "America/New_York" };

test("Calendar authority gives explicit History precedence over virtual states", () => {
  const states = resolveTaskHistoryCalendarStates({ ...context, history: [history("did_my_best")], task: task() });
  assert.equal(states?.["2026-07-30"], "did_my_best");
  assert.equal(states?.["2026-07-31"], "open");
});

test("action authority projects only supported fields and preserves legacy fallback", () => {
  const rolling = evaluateTaskActionAuthority({ ...context, history: [], outcome: "done", task: task() });
  assert.equal(rolling?.persistableTaskPatch.dueOn, "2026-08-01");
  assert.equal(Object.hasOwn(rolling?.persistableTaskPatch ?? {}, "recurrenceCursor"), false);
  assert.equal(Object.hasOwn(rolling?.persistableTaskPatch ?? {}, "satisfiedOccurrenceIdentity"), false);
  assert.equal(evaluateTaskActionAuthority({ ...context, enabled: false, history: [], outcome: "done", task: task() }), null);
  assert.equal(resolveTaskHistoryCalendarStates({ ...context, enabled: false, history: [], task: task() }), null);
  assert.deepEqual(resolveTaskHistoryCalendarActionStatuses({ ...context, history: [], logicalDate: "2026-07-31", task: task() }), ["done", "did_my_best", "delayed", "missed", "complete"]);
});
