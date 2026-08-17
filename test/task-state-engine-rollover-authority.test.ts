import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Task, TaskHistory } from "@/lib/database.types";
import { createEngineRolloverPlan, engineRolloverPlanHasMutations, engineRolloverPlanTaskMutationCandidates } from "@/lib/task-state-engine/rollover-authority";

function task(overrides: Partial<Task> = {}): Task {
  return { id: "task-1", user_id: "user-1", title: "Rollover", status: "pending", due_on: "2026-07-30", revision: 1,
    active_status_logical_date: null, active_occurrence_due_on: null, completed_at: null, repeat_frequency: "daily", repeat_interval: 1,
    repeat_days_of_week: [], repeat_day_of_month: null, repeat_monthly_mode: "day_of_month", repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null, due_time: null, created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-07-01T00:00:00.000Z", ...overrides } as Task;
}
function history(status: TaskHistory["status"], entry_date: string): TaskHistory {
  return { id: `h-${entry_date}`, task_id: "task-1", user_id: "user-1", entry_date, status, was_completed: status !== "missed",
    event_type: "status", counted_as_due_occurrence: true, occurrence_key: null, occurrence_due_on: null,
    created_at: `${entry_date}T12:00:00.000Z`, updated_at: `${entry_date}T12:00:00.000Z` };
}
const context = { rolloverTime: "06:00", timezone: "America/New_York" };

test("rollover planner observes the 6 AM boundary and creates no needless plan", () => {
  const before = createEngineRolloverPlan({ ...context, history: [], now: "2026-07-31T09:59:00.000Z", tasks: [task({ due_on: "2026-07-30" })] });
  const after = createEngineRolloverPlan({ ...context, history: [], now: "2026-07-31T10:01:00.000Z", tasks: [task({ due_on: "2026-07-30" })] });
  assert.equal(before.logicalDate, "2026-07-30");
  assert.equal(after.logicalDate, "2026-07-31");
  assert.deepEqual(after.tasks[0]?.history, []);
  assert.equal(engineRolloverPlanHasMutations(createEngineRolloverPlan({ ...context, history: [history("missed", "2026-07-30")], now: "2026-07-31T10:01:00.000Z", tasks: [task({ due_on: "2026-07-30", status: "missed" })] })), false);
});

test("custom timezone and stale In Progress finalize exactly once as Did My Best", () => {
  const plan = createEngineRolloverPlan({ rolloverTime: "04:30", timezone: "America/Los_Angeles", history: [], now: "2026-11-01T12:31:00.000Z",
    tasks: [task({ status: "in_progress", active_status_logical_date: "2026-10-31", active_occurrence_due_on: "2026-10-31" })] });
  assert.equal(plan.logicalDate, "2026-11-01");
  assert.deepEqual(plan.tasks[0]?.history, [{
    logicalDate: "2026-10-31",
    occurrenceIdentity: "task:task-1:occurrence:2026-10-31",
    outcome: "did_my_best",
    taskId: "task-1",
  }]);
  assert.equal(plan.tasks[0]?.rewardEligible, true);
  assert.equal(Object.hasOwn(plan.tasks[0]?.patch ?? {}, "recurrenceCursor"), false);
  assert.equal(Object.hasOwn(plan.tasks[0]?.patch ?? {}, "satisfiedOccurrenceIdentity"), false);
});

test("stale unscheduled In Progress finalizes as Did My Best and clears workflow", () => {
  const plan = createEngineRolloverPlan({ ...context, history: [], now: "2026-07-31T12:00:00.000Z", tasks: [task({
    active_occurrence_due_on: null,
    active_status_logical_date: "2026-07-30",
    due_on: null,
    repeat_frequency: "none",
    status: "in_progress",
  })] });
  assert.deepEqual(plan.tasks[0]?.history, [{
    logicalDate: "2026-07-30",
    occurrenceIdentity: null,
    outcome: "did_my_best",
    taskId: "task-1",
  }]);
  assert.equal(plan.tasks[0]?.patch.status, "pending");
  assert.equal(JSON.stringify(plan).includes('"status":"unscheduled"'), false);
});

test("the non-midnight boundary leaves same-day In Progress alone and finalizes it after 06:00", () => {
  const inProgress = task({
    status: "in_progress",
    active_status_logical_date: "2026-07-30",
    active_occurrence_due_on: "2026-07-30",
  });
  const before = createEngineRolloverPlan({ ...context, history: [], now: "2026-07-31T09:59:00.000Z", tasks: [inProgress] });
  const after = createEngineRolloverPlan({ ...context, history: [], now: "2026-07-31T10:01:00.000Z", tasks: [inProgress] });

  assert.equal(before.logicalDate, "2026-07-30");
  assert.equal(before.tasks.length, 0);
  assert.equal(after.logicalDate, "2026-07-31");
  assert.equal(after.tasks[0]?.history[0]?.outcome, "did_my_best");
  assert.equal(after.tasks[0]?.history[0]?.logicalDate, "2026-07-30");
});

test("fixed weekly rollover preserves the fixed schedule instead of forcing tomorrow", () => {
  const plan = createEngineRolloverPlan({
    ...context,
    history: [],
    now: "2026-08-03T12:00:00.000Z",
    tasks: [task({
      due_on: "2026-08-02",
      repeat_frequency: "weekly",
      repeat_days_of_week: [0],
      status: "in_progress",
      active_status_logical_date: "2026-08-02",
      active_occurrence_due_on: "2026-08-02",
    })],
  });

  assert.equal(plan.tasks[0]?.history[0]?.outcome, "did_my_best");
  assert.equal(plan.tasks[0]?.patch.dueOn, "2026-08-09");
});

test("late catch-up finalizes only the stale workflow date", () => {
  const plan = createEngineRolloverPlan({
    ...context,
    history: [],
    now: "2026-08-03T12:00:00.000Z",
    tasks: [task({
      due_on: "2026-07-30",
      status: "in_progress",
      active_status_logical_date: "2026-07-30",
      active_occurrence_due_on: "2026-07-30",
    })],
  });

  assert.deepEqual(plan.tasks[0]?.history.map((row) => row.logicalDate), ["2026-07-30"]);
  assert.equal(plan.tasks[0]?.history.length, 1);
});

test("existing explicit stale-date History wins over automatic rollover DMB", () => {
  const plan = createEngineRolloverPlan({
    ...context,
    history: [history("done", "2026-07-30")],
    now: "2026-07-31T12:00:00.000Z",
    tasks: [task({ status: "in_progress", active_status_logical_date: "2026-07-30", active_occurrence_due_on: "2026-07-30" })],
  });

  assert.deepEqual(plan.tasks[0]?.history, []);
  assert.equal(plan.tasks[0]?.patch.activeStatusLogicalDate, null);
  assert.equal(plan.tasks[0]?.patch.activeOccurrenceDueOn, null);
});

test("reloaded automatic rollover does not create a second DMB or reward candidate", () => {
  const first = createEngineRolloverPlan({
    ...context,
    history: [],
    now: "2026-07-31T12:00:00.000Z",
    tasks: [task({ status: "in_progress", active_status_logical_date: "2026-07-30", active_occurrence_due_on: "2026-07-30" })],
  });
  const persisted = task({
    status: first.tasks[0]?.patch.status ?? "pending",
    due_on: first.tasks[0]?.patch.dueOn ?? "2026-07-30",
    active_status_logical_date: null,
    active_occurrence_due_on: null,
    revision: 2,
  });
  const second = createEngineRolloverPlan({
    ...context,
    history: [history("did_my_best", "2026-07-30")],
    now: "2026-07-31T12:00:00.000Z",
    tasks: [persisted],
  });

  assert.equal(first.tasks[0]?.rewardEligible, true);
  assert.equal(second.tasks.length, 0);
});

test("automatic DMB resolves an unresolved Missed chain through the same timeline", () => {
  const missed = history("missed", "2026-08-08");
  missed.occurrence_due_on = "2026-08-08";
  missed.occurrence_key = "task:task-1:occurrence:2026-08-08";
  const plan = createEngineRolloverPlan({
    ...context,
    history: [missed],
    now: "2026-08-10T12:00:00.000Z",
    tasks: [task({
      due_on: "2026-08-08",
      status: "in_progress",
      active_status_logical_date: "2026-08-09",
      active_occurrence_due_on: "2026-08-08",
    })],
  });

  assert.equal(plan.tasks[0]?.history[0]?.outcome, "did_my_best");
});

test("explicit handled History and unscheduled tasks prevent automatic Missed", () => {
  const handled = createEngineRolloverPlan({ ...context, history: [history("done", "2026-07-30")], now: "2026-07-31T12:00:00.000Z", tasks: [task()] });
  const unscheduled = createEngineRolloverPlan({ ...context, history: [], now: "2026-07-31T12:00:00.000Z", tasks: [task({ due_on: null, repeat_frequency: "none" })] });
  assert.equal(handled.tasks.some((entry) => entry.history.some((row) => row.outcome === "missed")), false);
  assert.equal(unscheduled.tasks.some((entry) => entry.history.some((row) => row.outcome === "missed")), false);
  assert.equal(unscheduled.tasks.length, 0);
});

test("calculated overdue rollover persists no History and remains replay-safe", () => {
  const original = task({ due_on: "2026-07-30", status: "pending" });
  const first = createEngineRolloverPlan({ ...context, history: [], now: "2026-07-31T12:00:00.000Z", tasks: [original] });
  assert.equal(first.tasks.filter((entry) => Object.keys(entry.patch).length > 0).length, 1);
  assert.deepEqual(first.tasks.flatMap((entry) => entry.history.map((row) => row.outcome)), []);

  const persisted = task({
    ...original,
    revision: 2,
    status: first.tasks[0]?.patch.status ?? original.status,
  });
  const persistedHistory = [];
  const replay = createEngineRolloverPlan({ ...context, history: persistedHistory, now: "2026-07-31T12:00:00.000Z", tasks: [persisted] });
  assert.equal(replay.tasks.filter((entry) => Object.keys(entry.patch).length > 0).length, 0);
  assert.equal(replay.tasks.reduce((count, entry) => count + entry.history.length, 0), 0);
  assert.equal(replay.tasks.filter((entry) => entry.rewardEligible).length, 0);
});

test("canonical rollover candidates include only Tasks with persistable patches", () => {
  const first = createEngineRolloverPlan({ ...context, history: [], now: "2026-07-31T12:00:00.000Z", tasks: [task({ due_on: "2026-07-30" })] });
  const persisted = task({ due_on: first.tasks[0]?.patch.dueOn ?? "2026-07-30", revision: 2, status: first.tasks[0]?.patch.status ?? "pending" });
  const replay = createEngineRolloverPlan({ ...context, history: [], now: "2026-07-31T12:00:00.000Z", tasks: [persisted] });
  assert.equal(engineRolloverPlanTaskMutationCandidates(first).length, 1);
  assert.equal(engineRolloverPlanTaskMutationCandidates(replay).length, 0);
});

test("first fixed-schedule run advances once and reloaded persistence produces an empty plan", () => {
  const original = task({
    due_on: "2026-08-02",
    repeat_days_of_week: [0],
    repeat_frequency: "weekly",
    status: "done",
  });
  const completedOccurrence = history("done", "2026-08-02");
  completedOccurrence.occurrence_due_on = "2026-08-02";
  completedOccurrence.occurrence_key = "occurrence:2026-08-02";
  const first = createEngineRolloverPlan({
    ...context,
    history: [completedOccurrence],
    now: "2026-08-03T12:00:00.000Z",
    tasks: [original],
  });
  assert.equal(first.tasks[0]?.patch.dueOn, "2026-08-09");

  const replay = createEngineRolloverPlan({
    ...context,
    history: [completedOccurrence],
    now: "2026-08-03T12:00:00.000Z",
    tasks: [task({ ...original, due_on: "2026-08-09", revision: 2, status: first.tasks[0]?.patch.status ?? original.status })],
  });
  assert.equal(replay.tasks.length, 0);
  assert.equal(replay.remainingPatchSummaries.length, 0);
});

test("reloaded fixed schedule with unkeyed legacy History produces an empty rollover plan", () => {
  const unkeyed = history("done", "2026-07-31");
  unkeyed.counted_as_due_occurrence = false;
  unkeyed.occurrence_due_on = null;
  unkeyed.occurrence_key = null;
  const plan = createEngineRolloverPlan({
    ...context,
    history: [unkeyed],
    now: "2026-08-01T12:00:00.000Z",
    tasks: [task({
      due_on: "2026-09-15",
      repeat_day_of_month: 15,
      repeat_frequency: "monthly",
      status: "not_due",
    })],
  });
  assert.equal(plan.tasks.length, 0);
  assert.equal(plan.remainingPatchSummaries.length, 0);
});

test("future fixed cursor rollover is idempotent across stale status mismatch and repeated runs", () => {
  const unkeyed = history("done", "2026-07-31");
  unkeyed.counted_as_due_occurrence = false;
  unkeyed.occurrence_due_on = null;
  unkeyed.occurrence_key = null;
  const fixed = task({
    due_on: "2026-08-03",
    repeat_days_of_week: [1],
    repeat_frequency: "weekly",
    status: "upcoming",
  });
  const first = createEngineRolloverPlan({ ...context, history: [unkeyed], now: "2026-08-01T12:00:00.000Z", tasks: [fixed] });
  const second = createEngineRolloverPlan({ ...context, history: [unkeyed], now: "2026-08-01T12:00:00.000Z", tasks: [fixed] });
  for (const plan of [first, second]) {
    assert.equal(plan.tasks.filter((entry) => Object.keys(entry.patch).length > 0).length, 0);
    assert.equal(plan.remainingPatchSummaries.length, 0);
    assert.equal(JSON.stringify(plan).includes("archive"), false);
    assert.equal(JSON.stringify(plan).includes("trash"), false);
  }
});

test("reloaded Complete tasks do not repeat completion or due-date cleanup patches", () => {
  const completed = task({
    completed_at: "2026-07-30T12:00:00.000Z",
    due_on: null,
    repeat_frequency: "none",
    status: "complete",
  });
  const plan = createEngineRolloverPlan({
    ...context,
    history: [history("complete", "2026-07-30")],
    now: "2026-07-31T12:00:00.000Z",
    tasks: [completed],
  });
  assert.equal(plan.tasks.length, 0);
});

test("remaining rollover patch diagnostics are bounded and contain no task content", () => {
  const plan = createEngineRolloverPlan({
    ...context,
    history: [],
    now: "2026-07-31T12:00:00.000Z",
    tasks: Array.from({ length: 60 }, (_, index) => task({ id: `task-${index}`, title: `Private ${index}` })),
  });
  assert.equal(plan.remainingPatchSummaries.length, 50);
  assert.deepEqual(plan.remainingPatchSummaries[0], {
    patchKeys: ["status"],
    projectedNormalizedValues: { status: "missed" },
    storedNormalizedValues: { status: "pending" },
    taskId: "task-0",
  });
  assert.equal(JSON.stringify(plan.remainingPatchSummaries).includes("Private"), false);
});

test("large rollover plans retain no calculated History payload", () => {
  const plan = createEngineRolloverPlan({
    ...context,
    history: [],
    now: "2026-07-31T12:00:00.000Z",
    tasks: Array.from({ length: 900 }, (_, index) => task({
      due_on: index < 205 ? "2026-07-30" : "2026-08-20",
      id: `task-${index}`,
    })),
  });
  assert.equal(plan.tasksEvaluated, 900);
  assert.equal(plan.tasks.reduce((count, entry) => count + entry.history.length, 0), 0);
});

test("7.6.10 rollover RPC stages once and uses bulk conflict-safe History/task writes", () => {
  const sql = readFileSync("supabase/patch_task_state_engine_rollover_7_6_10.sql", "utf8");
  assert.match(sql, /jsonb_to_recordset\(p_plan\)/);
  assert.match(sql, /cross join lateral jsonb_to_recordset\(task\.history\)/);
  assert.match(sql, /insert into public\.adhdice_task_history[\s\S]*select proposed\.task_id[\s\S]*on conflict \(user_id, task_id, entry_date\) do nothing/);
  assert.match(sql, /update public\.adhdice_clean_tasks task[\s\S]*from pg_temp\.adhdice_rollover_eligible_tasks/);
  assert.match(sql, /for update of task/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.doesNotMatch(sql, /for v_item in select/);
  assert.doesNotMatch(sql, /for v_history in select/);
});

test("7.6.10 conflict detection is indexed, set-based, and preserves replay deduplication", () => {
  const sql = readFileSync("supabase/patch_task_state_engine_rollover_7_6_10.sql", "utf8");
  const schema = readFileSync("supabase/schema.sql", "utf8");
  assert.match(sql, /existing\.user_id = p_user_id[\s\S]*existing\.task_id = proposed\.task_id[\s\S]*existing\.entry_date = proposed\.logical_date/);
  assert.match(sql, /existing\.status is distinct from proposed\.outcome::public\.adhdice_clean_task_status/);
  assert.match(sql, /select count\(\*\) - v_inserted into v_deduplicated/);
  assert.match(schema, /unique \(user_id, task_id, entry_date\)/);
});

test("7.6.10 validates supported values before enum casts and excludes Archive/Trash writes", () => {
  const sql = readFileSync("supabase/patch_task_state_engine_rollover_7_6_10.sql", "utf8");
  assert.match(sql, /\(patch->>'status'\) not in \('unscheduled', 'pending', 'in_progress', 'done', 'missed', 'did_my_best', 'upcoming', 'not_due', 'delayed', 'complete'\)/);
  assert.match(sql, /outcome not in \('done', 'did_my_best', 'missed', 'delayed', 'complete'\)/);
  assert.ok(sql.indexOf("Unsupported task status") < sql.indexOf("::public.adhdice_clean_task_status"));
  assert.match(sql, /task\.status not in \('archived', 'trashed'\)/);
  assert.doesNotMatch(sql, /archived', 'trashed'.*::public\.adhdice_clean_task_status/);
});

test("rollover diagnostics distinguish planned from committed writes and clear committed counts on RPC failure", () => {
  const source = readFileSync("src/components/task-app.tsx", "utf8");
  const start = source.indexOf("let plannedTaskPatches = 0;");
  const end = source.indexOf("await reconcileRolloverWorkspace();", start);
  const lifecycle = source.slice(start, end);
  assert.match(lifecycle, /plannedHistoryRows/);
  assert.match(lifecycle, /committedHistoryRows = committed\?\.inserted_history_count \?\? 0/);
  assert.match(lifecycle, /committedTaskPatches = committed\?\.changed_task_count \?\? 0/);
  assert.match(lifecycle, /committedHistoryRows: error \? 0 : committedHistoryRows/);
  assert.match(lifecycle, /committedTaskPatches: error \? 0 : committedTaskPatches/);
  assert.match(lifecycle, /deduplicatedOutcomes: error \? 0 : deduplicatedOutcomes/);
  assert.doesNotMatch(lifecycle, /historyRowsInserted: plannedHistoryRows/);
});

test("7.6.11 defers per-row achievement evaluation but retains capture and one strict final evaluation", () => {
  const sql = readFileSync("supabase/patch_task_state_engine_rollover_7_6_11.sql", "utf8");
  const runtime = readFileSync("supabase/add_achievement_mvp_runtime.sql", "utf8");
  const deferredIndex = sql.indexOf("set_config('adhdice.achievement_deferred_user_id', p_user_id::text, true)");
  const historyInsertIndex = sql.indexOf("insert into public.adhdice_task_history", deferredIndex);
  const clearIndex = sql.indexOf("set_config('adhdice.achievement_deferred_user_id', '', true)");
  const evaluationIndex = sql.indexOf("public.adhdice_evaluate_achievements", clearIndex);
  const statusIndex = sql.indexOf("not in ('completed', 'inactive')", evaluationIndex);
  const failureIndex = sql.indexOf("raise exception 'Final Achievement evaluation failed", statusIndex);
  assert.ok(deferredIndex >= 0 && historyInsertIndex > deferredIndex);
  assert.ok(clearIndex > historyInsertIndex && evaluationIndex > clearIndex && statusIndex > evaluationIndex && failureIndex > statusIndex);
  assert.equal([...sql.matchAll(/public\.adhdice_evaluate_achievements\(/g)].length, 1);
  assert.match(sql, /md5\('task-state-engine-rollover:' \|\| p_user_id::text \|\| ':' \|\| v_operation_logical_date::text\)::uuid/);
  assert.match(runtime, /adhdice_capture_task_achievement_occurrence[\s\S]*adhdice_refresh_achievement_step_set[\s\S]*if not v_is_deferred then\s+perform public\.adhdice_evaluate_achievements/);
});

test("7.6.11 achievement failure is inside the rollover transaction and preserves idempotent History writes", () => {
  const sql = readFileSync("supabase/patch_task_state_engine_rollover_7_6_11.sql", "utf8");
  const historyInsertIndex = sql.indexOf("insert into public.adhdice_task_history");
  const taskUpdateIndex = sql.indexOf("update public.adhdice_clean_tasks task", historyInsertIndex);
  const evaluationIndex = sql.indexOf("public.adhdice_evaluate_achievements", taskUpdateIndex);
  const failureIndex = sql.indexOf("raise exception 'Final Achievement evaluation failed", evaluationIndex);
  const returnIndex = sql.indexOf("return query select", failureIndex);
  assert.ok(historyInsertIndex >= 0 && taskUpdateIndex > historyInsertIndex && evaluationIndex > taskUpdateIndex);
  assert.ok(failureIndex > evaluationIndex && returnIndex > failureIndex);
  assert.match(sql, /on conflict \(user_id, task_id, entry_date\) do nothing/);
  assert.match(sql, /set_config\('adhdice\.achievement_deferred_user_id', '', true\)/);
});

test("7.6.12 RPC updates only normalized values that are distinct from stored task fields", () => {
  const sql = readFileSync("supabase/patch_task_state_engine_rollover_7_6_12.sql", "utf8");
  const update = sql.slice(sql.indexOf("update public.adhdice_clean_tasks task"), sql.indexOf("get diagnostics v_changed"));
  assert.match(update, /task\.status is distinct from[\s\S]*'unscheduled'[\s\S]*'pending'/);
  assert.match(update, /task\.due_on is distinct from nullif\(eligible\.patch->>'dueOn', ''\)::date/);
  assert.match(update, /task\.completed_at is distinct from nullif\(eligible\.patch->>'completedAt', ''\)::timestamptz/);
  assert.match(update, /task\.active_status_logical_date is distinct from nullif\(eligible\.patch->>'activeStatusLogicalDate', ''\)::date/);
  assert.match(update, /task\.active_occurrence_due_on is distinct from nullif\(eligible\.patch->>'activeOccurrenceDueOn', ''\)::date/);
  assert.doesNotMatch(update, /eligible\.patch <> '\{\}'::jsonb/);
  assert.match(sql, /task\.revision = plan\.expected_revision[\s\S]*for update of task/);
  assert.match(sql, /task\.status not in \('archived', 'trashed'\)/);
});

test("7.6.12 effective no-ops cannot reach revision or updated-at assignments", () => {
  const sql = readFileSync("supabase/patch_task_state_engine_rollover_7_6_12.sql", "utf8");
  const schema = readFileSync("supabase/schema.sql", "utf8");
  const update = sql.slice(sql.indexOf("update public.adhdice_clean_tasks task"), sql.indexOf("get diagnostics v_changed"));
  assert.match(update, /revision = task\.revision \+ 1/);
  assert.match(update, /updated_at = p_now/);
  assert.match(update, /and \([\s\S]*is distinct from[\s\S]*\);\s*$/);
  assert.match(schema, /adhdice_clean_tasks_bump_revision[\s\S]*row\(new\.\*\) is distinct from row\(old\.\*\)/);
  assert.match(schema, /create trigger adhdice_clean_tasks_set_updated_at[\s\S]*before update on public\.adhdice_clean_tasks/);
  assert.match(sql, /get diagnostics v_changed = row_count/);
});

test("7.6.13 RPC normalizes typed targets once and retains per-field no-op guards", () => {
  const sql = readFileSync("supabase/patch_task_state_engine_rollover_7_6_13.sql", "utf8");
  const update = sql.slice(sql.indexOf("update public.adhdice_clean_tasks task"), sql.indexOf("get diagnostics v_changed"));
  assert.match(sql, /status_target public\.adhdice_clean_task_status/);
  assert.match(sql, /due_on_target date/);
  assert.match(sql, /completed_at_target timestamptz/);
  assert.match(sql, /nullif\(btrim\(plan\.patch->>'dueOn'\), ''\)::date/);
  assert.match(sql, /nullif\(btrim\(plan\.patch->>'completedAt'\), ''\)::timestamptz/);
  assert.match(update, /task\.status is distinct from eligible\.status_target/);
  assert.match(update, /task\.due_on is distinct from eligible\.due_on_target/);
  assert.match(update, /task\.completed_at is distinct from eligible\.completed_at_target/);
  assert.match(update, /task\.active_status_logical_date is distinct from eligible\.active_status_logical_date_target/);
  assert.match(update, /task\.active_occurrence_due_on is distinct from eligible\.active_occurrence_due_on_target/);
  assert.match(update, /revision = task\.revision \+ 1/);
  assert.match(update, /updated_at = p_now/);
});

test("7.6.12 runs one final Achievement evaluation only when History was inserted", () => {
  const sql = readFileSync("supabase/patch_task_state_engine_rollover_7_6_12.sql", "utf8");
  const clearIndex = sql.indexOf("set_config('adhdice.achievement_deferred_user_id', '', true)");
  const insertedGuardIndex = sql.indexOf("if v_inserted > 0 then", clearIndex);
  const evaluationIndex = sql.indexOf("public.adhdice_evaluate_achievements", insertedGuardIndex);
  const guardEndIndex = sql.indexOf("end if;", sql.indexOf("raise exception 'Final Achievement evaluation failed", evaluationIndex));
  assert.ok(clearIndex >= 0 && insertedGuardIndex > clearIndex && evaluationIndex > insertedGuardIndex && guardEndIndex > evaluationIndex);
  assert.equal([...sql.matchAll(/public\.adhdice_evaluate_achievements\(/g)].length, 1);
  assert.match(sql, /on conflict \(user_id, task_id, entry_date\) do nothing/);
});

test("zero-commit engine response skips targeted workspace reconciliation", () => {
  const source = readFileSync("src/components/task-app.tsx", "utf8");
  const start = source.indexOf("const runDayReset = useCallback");
  const end = source.indexOf("await reconcileRolloverWorkspace();", start);
  const lifecycle = source.slice(start, end);
  assert.match(lifecycle, /didMutate = committedTaskPatches > 0 \|\| committedHistoryRows > 0/);
  assert.match(lifecycle, /if \(!didMutate\) return/);
  assert.equal((source.match(/await reconcileRolloverWorkspace\(\);/g) ?? []).length, 1);
});
