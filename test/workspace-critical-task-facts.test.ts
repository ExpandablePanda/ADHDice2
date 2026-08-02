import assert from "node:assert/strict";
import test from "node:test";

import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import {
  chunkCriticalTaskHistoryDates,
  collectCriticalTaskHistoryDates,
  mergeTaskHistoryCache,
  selectCriticalTaskHistoryFacts,
} from "../src/lib/workspace-critical-task-facts.ts";
import { resolveActiveTaskStatuses } from "../src/lib/task-state-engine/read-authority.ts";
import { createEngineRolloverPlan } from "../src/lib/task-state-engine/rollover-authority.ts";
import { createProjectionDomainRevision } from "../src/lib/stable-task-projection.ts";

function task(overrides: Partial<Task> = {}): Task {
  return {
    active_occurrence_due_on: "2026-08-01", active_status_logical_date: "2026-08-02", actual_seconds: 0,
    completed_at: null, created_at: "2026-08-01T12:00:00Z", due_on: "2026-08-03", due_time: null,
    energy: "medium", estimated_minutes: null, external_link_label: null, external_link_url: null, id: "task-1",
    is_important: false, is_urgent: false, notes: null, one_step_at_a_time: false, parent_task_id: null,
    pin_order: null, pinned_at: null, priority: "normal", repeat_day_of_month: null, repeat_days_of_week: [],
    repeat_frequency: "daily", repeat_interval: 1, repeat_monthly_mode: "day_of_month", repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null, revision: 3, scheduled_on: null, sort_order: 0, status: "upcoming",
    subtasks_auto_reset: false, tags: [], title: "Critical", trashed_at: null, updated_at: "2026-08-02T12:00:00Z",
    user_id: "user-1", ...overrides,
  };
}

function history(id: string, entryDate: string, occurrenceDueOn: string | null): TaskHistory {
  return {
    counted_as_due_occurrence: true, created_at: `${entryDate}T12:00:00Z`, entry_date: entryDate,
    event_type: "status", id, occurrence_due_on: occurrenceDueOn, occurrence_key: occurrenceDueOn ? `occurrence:${occurrenceDueOn}` : null,
    status: "done", task_id: "task-1", updated_at: `${entryDate}T12:00:00Z`, user_id: "user-1", was_completed: true,
  };
}

test("startup dates contain the logical day and live cursor dates, not every task due date", () => {
  assert.deepEqual(collectCriticalTaskHistoryDates([task()], "2026-08-02"), ["2026-08-01", "2026-08-02"]);
  assert.deepEqual(collectCriticalTaskHistoryDates([task({ status: "archived", due_on: "2025-01-01", active_status_logical_date: null, active_occurrence_due_on: null })], "2026-08-02"), ["2026-08-02"]);
  assert.deepEqual(collectCriticalTaskHistoryDates([task({ status: "done", completed_at: "2025-01-02T12:00:00Z", due_on: "2025-01-01", repeat_frequency: "none", active_status_logical_date: null, active_occurrence_due_on: null })], "2026-08-02"), ["2026-08-02"]);
  assert.equal(chunkCriticalTaskHistoryDates(Array.from({ length: 81 }, (_, index) => `date-${index}`)).length, 3);
});

test("critical facts retain current-day and latest relevant occurrence but exclude unrelated History", () => {
  const rows = [
    history("old", "2026-07-01", "2026-07-01"),
    history("occurrence", "2026-07-31", "2026-08-01"),
    history("current", "2026-08-02", "2026-08-02"),
  ];
  assert.deepEqual(selectCriticalTaskHistoryFacts([task()], rows, "2026-08-02").map((row) => row.id), ["current", "occurrence"]);
  assert.deepEqual(mergeTaskHistoryCache([rows[0]], [rows[2]]).map((row) => row.id), ["current", "old"]);
});

test("irrelevant older History is not required for fixed-cursor active status or rollover", () => {
  const fixed = task({
    active_occurrence_due_on: null,
    active_status_logical_date: null,
    due_on: "2026-08-03",
    repeat_days_of_week: [1],
    repeat_frequency: "weekly",
    status: "upcoming",
  });
  const old = history("old-unkeyed", "2026-07-01", null);
  old.occurrence_key = null;
  const critical = selectCriticalTaskHistoryFacts([fixed], [old], "2026-08-02");
  const input = { logicalDayRollover: "06:00", now: "2026-08-02T14:00:00Z", tasks: [fixed], timezone: "America/New_York" };
  assert.deepEqual(resolveActiveTaskStatuses({ ...input, historyByTaskId: { "task-1": [old] } }), resolveActiveTaskStatuses({ ...input, historyByTaskId: {} }));
  assert.deepEqual(
    createEngineRolloverPlan({ history: [old], now: input.now, rolloverTime: input.logicalDayRollover, tasks: [fixed], timezone: input.timezone }),
    createEngineRolloverPlan({ history: critical, now: input.now, rolloverTime: input.logicalDayRollover, tasks: [fixed], timezone: input.timezone }),
  );
});

test("late detail History does not change the canonical current-state revision", () => {
  const current = history("current", "2026-08-02", "2026-08-02");
  const old = history("old", "2025-01-01", "2025-01-01");
  const before = selectCriticalTaskHistoryFacts([task()], [current], "2026-08-02");
  const after = selectCriticalTaskHistoryFacts([task()], [current, old], "2026-08-02");
  assert.equal(createProjectionDomainRevision("task-state-history", before), createProjectionDomainRevision("task-state-history", after));
});
