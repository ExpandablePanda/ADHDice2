import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyTaskActiveStatusTracking } from "@/lib/task-active-status";
import { calcNextDueDateFromDate } from "@/lib/task-repeat";
import type { Task } from "@/lib/database.types";

function task(overrides: Partial<Task> = {}): Task {
  return {
    active_occurrence_due_on: null,
    active_status_logical_date: null,
    due_on: "2026-07-12",
    repeat_day_of_month: null,
    repeat_days_of_week: [],
    repeat_frequency: "daily",
    repeat_interval: 1,
    status: "pending",
    ...overrides,
  } as Task;
}

test("entering In Progress captures the logical day and scheduled occurrence", () => {
  const values = applyTaskActiveStatusTracking(task(), { status: "in_progress" }, "2026-07-11");
  assert.deepEqual(values, {
    active_occurrence_due_on: "2026-07-12",
    active_status_logical_date: "2026-07-11",
    status: "in_progress",
  });
});

test("already-In-Progress edits preserve tracking and leaving clears it", () => {
  const active = task({
    active_occurrence_due_on: "2026-07-12",
    active_status_logical_date: "2026-07-11",
    status: "in_progress",
  });
  assert.deepEqual(applyTaskActiveStatusTracking(active, { title: "Shop" }, "2026-07-12"), { title: "Shop" });
  assert.deepEqual(applyTaskActiveStatusTracking(active, { status: "pending" }, "2026-07-12"), {
    active_occurrence_due_on: null,
    active_status_logical_date: null,
    status: "pending",
  });
});

test("captured recurrence anchors produce Shop, Soda, and Salami next occurrences", () => {
  assert.equal(calcNextDueDateFromDate(task({ repeat_interval: 2 }), "2026-07-12"), "2026-07-14");
  assert.equal(calcNextDueDateFromDate(task({ repeat_interval: 3 }), "2026-07-12"), "2026-07-15");
  assert.equal(calcNextDueDateFromDate(task({ due_on: "2026-07-14", repeat_interval: 4 }), "2026-07-14"), "2026-07-18");
});

test("rollover SQL preserves legacy eligibility and independently resolves captured rows", () => {
  const sql = readFileSync("supabase/patch_daily_until_complete_rollover_rpc.sql", "utf8");
  assert.match(sql, /due_on is not null and due_on <= v_rollover_date/);
  assert.match(sql, /active_status_logical_date is not null\s+and active_status_logical_date <= v_rollover_date/);
  assert.match(sql, /v_task\.active_status_logical_date,\s+'did_my_best'/);
  assert.match(sql, /v_task\.active_occurrence_due_on\s+\);/);
  assert.match(sql, /v_next_status := public\.adhdice_resolve_recurring_due_status/);
  assert.doesNotMatch(sql, /or \(\s*status = 'in_progress'\s*and active_status_logical_date is null/);
  assert.match(sql, /where id = v_task\.id\s+and user_id = p_user_id/);
});

test("client refreshes after success and does not complete rollover after RPC failure", () => {
  const source = readFileSync("src/components/task-app.tsx", "utf8");
  const errorIndex = source.indexOf("if (error)", source.indexOf('rpc("adhdice_reconcile_task_rollover"'));
  const refreshIndex = source.indexOf("await softRefreshWorkspace();", errorIndex);
  const completeIndex = source.indexOf("lastResetDateRef.current = todayKey;", refreshIndex);
  assert.ok(errorIndex >= 0 && refreshIndex > errorIndex && completeIndex > refreshIndex);
  assert.match(source.slice(errorIndex, refreshIndex), /if \(error\)[\s\S]*return;/);
});
