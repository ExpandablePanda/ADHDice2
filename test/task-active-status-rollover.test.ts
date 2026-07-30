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

function simulateRegularRecurringRollover({
  originalDueOn,
  status,
  writtenMissedDates,
}: {
  originalDueOn: string;
  status: Task["status"];
  writtenMissedDates: string[];
}) {
  if (status === "in_progress") {
    return {
      dueOn: calcNextDueDateFromDate(task({ due_on: originalDueOn }), writtenMissedDates[0] ?? originalDueOn),
      historyStatuses: ["did_my_best"],
      status: "pending",
    };
  }
  return {
    dueOn: originalDueOn,
    historyStatuses: writtenMissedDates.map(() => "missed"),
    status: "missed",
  };
}

function repairCandidateQualifies(candidate: {
  currentDueOn: string;
  currentStatus: Task["status"];
  hasLaterResolution: boolean;
  latestMissedDate: string;
  proposedDueOn: string;
}) {
  const nextDueOn = calcNextDueDateFromDate(task(), candidate.latestMissedDate);
  return ["pending", "missed", "upcoming", "not_due"].includes(candidate.currentStatus)
    && !candidate.hasLaterResolution
    && candidate.proposedDueOn < candidate.currentDueOn
    && candidate.currentDueOn === nextDueOn;
}

test("entering In Progress captures the logical day and scheduled occurrence", () => {
  const values = applyTaskActiveStatusTracking(task(), { status: "in_progress" }, "2026-07-11");
  assert.deepEqual(values, {
    active_occurrence_due_on: "2026-07-12",
    active_status_logical_date: "2026-07-11",
    status: "in_progress",
  });
});

test("rollover SQL defers missed processing until the configured logical day starts", () => {
  const sql = readFileSync("supabase/patch_daily_until_complete_rollover_rpc.sql", "utf8");
  assert.match(sql, /v_day_start_time := coalesce\(nullif\(v_profile\.day_start_time, ''\), '06:00'\)/);
  assert.match(sql, /v_effective_date := public\.adhdice_effective_logical_date\(p_now, v_timezone, v_day_start_time\)/);
  assert.match(sql, /v_rollover_date := v_effective_date - 1/);
  assert.match(sql, /due_on is not null and due_on <= v_rollover_date/);
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

test("regular Daily rollover writes missed history while freezing the overdue boundary", () => {
  assert.deepEqual(simulateRegularRecurringRollover({
    originalDueOn: "2026-07-11",
    status: "pending",
    writtenMissedDates: ["2026-07-11"],
  }), {
    dueOn: "2026-07-11",
    historyStatuses: ["missed"],
    status: "missed",
  });

  assert.deepEqual(simulateRegularRecurringRollover({
    originalDueOn: "2026-07-10",
    status: "missed",
    writtenMissedDates: ["2026-07-10", "2026-07-11", "2026-07-12"],
  }), {
    dueOn: "2026-07-10",
    historyStatuses: ["missed", "missed", "missed"],
    status: "missed",
  });
});

test("repeat cadence does not space Missed days after overdue mode begins", () => {
  const originalDueOn = "2026-07-11";
  assert.equal(calcNextDueDateFromDate(task(), originalDueOn), "2026-07-12");
  assert.equal(calcNextDueDateFromDate(task({ repeat_interval: 3 }), originalDueOn), "2026-07-14");

  for (const writtenMissedDates of [[originalDueOn], [originalDueOn, "2026-07-12", "2026-07-13"]]) {
    const result = simulateRegularRecurringRollover({ originalDueOn, status: "pending", writtenMissedDates });
    assert.equal(result.status, "missed");
    assert.equal(result.dueOn, originalDueOn);
  }
});

test("rollover SQL anchors unresolved regular recurrences and preserves In Progress advancement", () => {
  const sql = readFileSync("supabase/patch_daily_until_complete_rollover_rpc.sql", "utf8");
  assert.match(sql, /due_on is not null and due_on <= v_rollover_date/);
  assert.match(sql, /active_status_logical_date is not null\s+and active_status_logical_date <= v_rollover_date/);
  assert.match(sql, /v_task\.active_status_logical_date,\s+'did_my_best'/);
  assert.match(sql, /coalesce\(v_task\.active_occurrence_due_on, v_task\.due_on, v_task\.active_status_logical_date\)/);
  assert.doesNotMatch(sql, /repeat_frequency = 'none' or v_task\.active_occurrence_due_on is null/);
  assert.match(sql, /v_task\.active_status_logical_date,\s+v_task\.repeat_monthly_mode,\s+v_task\.repeat_monthly_ordinal,\s+v_task\.repeat_monthly_weekday\s+\);/);
  assert.doesNotMatch(sql, /or \(\s*status = 'in_progress'\s*and active_status_logical_date is null/);
  assert.match(sql, /where id = v_task\.id\s+and user_id = p_user_id/);

  const regularBranch = sql.slice(sql.lastIndexOf("if v_task.status not in ('pending'"), sql.lastIndexOf("get diagnostics v_row_count = row_count;"));
  assert.match(regularBranch, /on conflict \(user_id, task_id, entry_date\) do nothing/);
  assert.match(regularBranch, /get diagnostics v_row_count = row_count;\s+v_inserted_history_count := v_inserted_history_count \+ v_row_count/);
  assert.doesNotMatch(regularBranch, /on conflict \(user_id, task_id, entry_date\) do update/);
  assert.match(regularBranch, /v_history_date := v_task\.due_on/);
  assert.match(regularBranch, /v_history_date := v_history_date \+ 1/);
  assert.match(regularBranch, /status = 'missed'/);
  assert.doesNotMatch(regularBranch, /adhdice_task_next_due_date/);
  assert.doesNotMatch(regularBranch, /(^|\n)\s*due_on\s*=/);

  const inProgress = simulateRegularRecurringRollover({
    originalDueOn: "2026-07-11",
    status: "in_progress",
    writtenMissedDates: ["2026-07-11"],
  });
  assert.deepEqual(inProgress.historyStatuses, ["did_my_best"]);
  assert.equal(inProgress.dueOn, "2026-07-12");
});

test("explicit successful handling still advances recurrence through finalization", () => {
  const source = readFileSync("src/hooks/useTaskRewardController.ts", "utf8");
  const finalization = source.slice(source.indexOf("async function finalizeRecurringTasks"), source.indexOf("const updatedTasks", source.indexOf("async function finalizeRecurringTasks")));
  assert.match(finalization, /const nextDue = reconciliation\.nextDueOn/);
  assert.match(finalization, /\{ completed_at: null, due_on: nextDue, status: nextStatus \}/);
  assert.equal(calcNextDueDateFromDate(task({ status: "done" }), "2026-07-12"), "2026-07-13");
  assert.equal(calcNextDueDateFromDate(task({ status: "did_my_best" }), "2026-07-12"), "2026-07-13");
});

test("forced recurring finalization bypasses reward eligibility without duplicating rewards", () => {
  const source = readFileSync("src/hooks/useTaskRewardController.ts", "utf8");
  const queue = source.slice(
    source.indexOf("async function queueTaskRewards"),
    source.indexOf("async function claimPendingRewardBank"),
  );
  assert.ok(queue.indexOf("getRecurringFinalizationCandidates(candidates)") < queue.indexOf("const newlyCompleted"));
  assert.match(queue, /const newlyCompleted = candidates\.filter[\s\S]*isNewRewardCompletion/);
  assert.match(queue, /if \(newlyCompleted\.length === 0\) \{\s+await finalizeRecurringTasks\(recurringTasksToFinalize\)/);
});

test("weekly cadence helper advances from the supplied actual completion date", () => {
  const sundayOnly = task({ due_on: "2026-07-26", repeat_days_of_week: [0], repeat_frequency: "weekly", status: "done" });
  const mondayWednesdayFriday = task({ due_on: "2026-07-20", repeat_days_of_week: [1, 3, 5], repeat_frequency: "weekly", status: "done" });

  assert.equal(calcNextDueDateFromDate(sundayOnly, sundayOnly.due_on!), "2026-08-02");
  assert.equal(calcNextDueDateFromDate(mondayWednesdayFriday, mondayWednesdayFriday.due_on!), "2026-07-22");
  assert.equal(calcNextDueDateFromDate(mondayWednesdayFriday, "2026-07-22"), "2026-07-24");
});

test("rollover resolves successful canonical occurrences from the actual History entry date", () => {
  const sql = readFileSync("supabase/patch_daily_until_complete_rollover_rpc.sql", "utf8");
  const canonicalResolution = sql.slice(
    sql.indexOf("-- A success may be recorded before its scheduled weekly occurrence."),
    sql.indexOf("if v_task.status not in ('pending'", sql.indexOf("-- A success may be recorded before its scheduled weekly occurrence.")),
  );

  assert.match(canonicalResolution, /history\.status in \('done', 'did_my_best'\)/);
  assert.match(canonicalResolution, /history\.occurrence_key = 'occurrence:' \|\| v_task\.due_on::text/);
  assert.match(canonicalResolution, /history\.occurrence_due_on = v_task\.due_on/);
  assert.match(canonicalResolution, /max\(history\.entry_date\)/);
  assert.match(canonicalResolution, /v_latest_history_date/);
  assert.match(canonicalResolution, /due_on = v_due_on/);
  assert.doesNotMatch(canonicalResolution, /insert into public\.adhdice_task_history/);
});

test("history saves build the merged occurrence snapshot before syncing the live task", () => {
  const source = readFileSync("src/hooks/useTaskHistoryActions.ts", "utf8");
  const singleEntrySync = source.slice(source.indexOf("async function syncTaskHistoryEntry"), source.indexOf("async function syncTaskHistoryEntries"));
  const multipleEntrySync = source.slice(source.indexOf("async function syncTaskHistoryEntries"), source.indexOf("return { syncTaskHistoryEntries"));
  assert.match(singleEntrySync, /const nextHistory = \[\s*mappedEntry,[\s\S]*taskHistory\.filter/);
  assert.match(singleEntrySync, /syncLiveTaskStatus\(taskId, nextHistory, \[entryDate\]\)/);
  assert.match(multipleEntrySync, /let nextTaskHistory = \[\s*\.\.\.explicitEntries,[\s\S]*taskHistory\.filter/);
  assert.match(multipleEntrySync, /syncLiveTaskStatus\(taskId, nextTaskHistory/);
});

test("repair excludes later resolutions and is idempotent after restoring the anchor", () => {
  const repairSql = readFileSync("supabase/repair_regular_recurring_missed_anchors.sql", "utf8");
  assert.ok(repairSql.indexOf("-- READ-ONLY PREVIEW") < repairSql.indexOf("-- MUTATING REPAIR"));
  assert.match(repairSql, /later_resolution\.status <> 'missed'/);
  assert.match(repairSql, /task\.repeat_frequency not in \('none', 'daily_until_complete'\)/);
  assert.match(repairSql, /status = 'missed',\s+due_on = qualified\.proposed_due_on/);

  const candidate = {
    currentDueOn: "2026-07-13",
    currentStatus: "upcoming" as const,
    hasLaterResolution: false,
    latestMissedDate: "2026-07-12",
    proposedDueOn: "2026-07-10",
  };
  assert.equal(repairCandidateQualifies({ ...candidate, hasLaterResolution: true }), false);
  assert.equal(repairCandidateQualifies(candidate), true);
  assert.equal(repairCandidateQualifies({
    ...candidate,
    currentDueOn: candidate.proposedDueOn,
    currentStatus: "missed",
  }), false);
});

test("client rollover uses targeted reconciliation only after owned success", () => {
  const source = readFileSync("src/components/task-app.tsx", "utf8");
  const coordinatorIndex = source.indexOf("taskRolloverCoordinator.run");
  const rpcIndex = source.indexOf('rpc("adhdice_reconcile_task_rollover"', coordinatorIndex);
  const ownedSettlementIndex = source.indexOf("onOwnedSettled", rpcIndex);
  const reconciliationIndex = source.indexOf("await reconcileRolloverWorkspace();", ownedSettlementIndex);
  assert.ok(coordinatorIndex >= 0 && rpcIndex > coordinatorIndex && ownedSettlementIndex > rpcIndex && reconciliationIndex > ownedSettlementIndex);
  assert.match(source.slice(ownedSettlementIndex, reconciliationIndex), /if \(error\)[\s\S]*return;/);
  assert.doesNotMatch(source.slice(ownedSettlementIndex, reconciliationIndex + 40), /softRefreshWorkspace/);
  assert.doesNotMatch(source, /lastResetDateRef/);
});

test("rollover retains startup, cadence, visibility, and persisted-page resume triggers", () => {
  const source = readFileSync("src/components/task-app.tsx", "utf8");
  const start = source.indexOf("async function runDayReset");
  const end = source.indexOf("const visibleTaskSubtasks", start);
  const lifecycle = source.slice(start, end);
  assert.match(lifecycle, /void runDayReset\(\);/);
  assert.match(lifecycle, /setInterval\(\(\) => \{ void runDayReset\(\); \}, 60_000\)/);
  assert.match(lifecycle, /document\.visibilityState === "visible"[\s\S]*void runDayReset\(\)/);
  assert.match(lifecycle, /event\.persisted[\s\S]*void runDayReset\(\)/);
});
