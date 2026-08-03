import assert from "node:assert/strict";
import test from "node:test";

import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import { evaluateTaskActionAuthority } from "../src/lib/task-state-engine/action-authority.ts";
import { resolveTaskHistoryCalendarActionStatuses, resolveTaskHistoryCalendarStates } from "../src/lib/task-state-engine/calendar-authority.ts";
import { createEngineRolloverPlan } from "../src/lib/task-state-engine/rollover-authority.ts";

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

test("saved Daily Until Complete Done History advances one occurrence without completing recurrence", () => {
  const dailyUntilCompleteTask = task({
    due_on: "2026-07-31",
    repeat_frequency: "daily_until_complete",
  });
  const doneHistory = history("done", "2026-08-01");
  doneHistory.occurrence_due_on = "2026-07-31";
  doneHistory.occurrence_key = "occurrence:2026-07-31";

  const result = evaluateTaskActionAuthority({
    ...context,
    history: [doneHistory],
    now: "2026-08-01T14:00:00.000Z",
    task: dailyUntilCompleteTask,
  });

  assert.equal(result?.lifecycle, "active");
  assert.equal(result?.nextDueDate, "2026-08-02");
  assert.equal(result?.persistableTaskPatch.dueOn, "2026-08-02");
  assert.notEqual(result?.persistableTaskPatch.status, "complete");
});

test("Daily Until Complete accepts Done through the shared action authority", () => {
  const result = evaluateTaskActionAuthority({
    ...context,
    history: [],
    outcome: "done",
    task: task({ due_on: "2026-07-31", repeat_frequency: "daily_until_complete" }),
  });

  assert.deepEqual(result?.validationErrors, []);
  assert.equal(result?.lifecycle, "active");
  assert.equal(result?.nextDueDate, "2026-08-01");
  assert.equal(result?.mutationPlan.taskUpdate.status, "upcoming");
  assert.notEqual(result?.mutationPlan.taskUpdate.status, "done");
  assert.equal(result?.mutationPlan.historyOutcome, "done");
});

test("engine action plans keep Did My Best History separate from the projected next status", () => {
  const result = evaluateTaskActionAuthority({
    ...context,
    history: [],
    outcome: "did_my_best",
    task: task({ due_on: "2026-07-31", repeat_frequency: "daily" }),
  });

  assert.equal(result?.mutationPlan.historyOutcome, "did_my_best");
  assert.notEqual(result?.mutationPlan.taskUpdate.status, "did_my_best");
  assert.equal(result?.mutationPlan.taskUpdate.due_on, "2026-08-01");
});

test("all engine-managed History outcomes remain explicit in the mutation plan", () => {
  for (const [outcome, options] of [
    ["complete", {}],
    ["delayed", { delayDays: 1 }],
    ["missed", {}],
  ] as const) {
    const result = evaluateTaskActionAuthority({
      ...context,
      ...options,
      history: [],
      outcome,
      task: task({ due_on: "2026-07-31", repeat_frequency: "daily" }),
    });
    assert.equal(result?.mutationPlan.historyOutcome, outcome);
  }
});

test("successful Daily Until Complete Done action leaves zero rollover repair patches", () => {
  const original = task({ due_on: "2026-07-31", repeat_frequency: "daily_until_complete", status: "upcoming" });
  const action = evaluateTaskActionAuthority({
    ...context,
    history: [],
    outcome: "done",
    task: original,
  });
  assert.ok(action);
  assert.equal(action.mutationPlan.taskUpdate.status, "upcoming");

  const savedTask: Task = {
    ...original,
    ...action.mutationPlan.taskUpdate,
    revision: original.revision + 1,
  };
  const savedHistory = action.mutationPlan.history.map((row): TaskHistory => ({
    counted_as_due_occurrence: true,
    created_at: row.occurredAt,
    entry_date: row.logicalDate,
    event_type: "status",
    id: row.id,
    occurrence_due_on: row.occurrenceIdentity?.split(":").at(-1) ?? null,
    occurrence_key: row.occurrenceIdentity ? `occurrence:${row.occurrenceIdentity.split(":").at(-1)}` : null,
    status: row.outcome,
    task_id: row.taskId,
    updated_at: row.occurredAt,
    user_id: original.user_id,
    was_completed: row.outcome === "done" || row.outcome === "did_my_best" || row.outcome === "complete",
  }));
  const rollover = createEngineRolloverPlan({
    history: savedHistory,
    now: context.now,
    rolloverTime: context.logicalDayRollover,
    tasks: [savedTask],
    timezone: context.timezone,
  });

  assert.deepEqual(rollover.remainingPatchSummaries, []);
  assert.deepEqual(rollover.tasks, []);
});

test("shared status action applies the engine Task and History plan optimistically together", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(
    new URL("../src/components/task-app.tsx", import.meta.url),
    "utf8",
  ));
  const actionPath = source.slice(source.indexOf("async function updateTaskStatus"), source.indexOf("async function toggleTaskPinned"));

  assert.match(actionPath, /const values: TaskUpdate = action[\s\S]*?action\.mutationPlan\.taskUpdate/);
  assert.match(actionPath, /historyStatus: actionHistoryStatus/);
  assert.match(actionPath, /actionHistoryStatus = action\?\.mutationPlan\.historyOutcome/);
  assert.match(actionPath, /if \(action\) \{[\s\S]*?setTasks\([\s\S]*?setTaskHistory\(/);
  assert.doesNotMatch(actionPath, /\.\.\.buildTaskStatusUpdate\(task, status\)[\s\S]*?action\.persistableTaskPatch/);
});
