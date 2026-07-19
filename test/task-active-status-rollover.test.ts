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
  const nextDueOn = writtenMissedDates.reduce(
    (dueOn) => calcNextDueDateFromDate(task({ due_on: dueOn }), dueOn) ?? dueOn,
    originalDueOn,
  );
  return status === "in_progress"
    ? { dueOn: nextDueOn, historyStatuses: ["did_my_best", ...writtenMissedDates.slice(1).map(() => "missed")], status: "pending" }
    : { dueOn: originalDueOn, historyStatuses: writtenMissedDates.map(() => "missed"), status: "missed" };
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

test("regular Daily rollover writes missed history while retaining the unresolved active anchor", () => {
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

test("regular interval recurrences stay Missed whether their calculated next date is today or future", () => {
  const originalDueOn = "2026-07-11";
  assert.equal(calcNextDueDateFromDate(task(), originalDueOn), "2026-07-12");
  assert.equal(calcNextDueDateFromDate(task({ repeat_interval: 3 }), originalDueOn), "2026-07-14");

  for (const writtenMissedDates of [[originalDueOn], [originalDueOn, "2026-07-14"]]) {
    const result = simulateRegularRecurringRollover({ originalDueOn, status: "pending", writtenMissedDates });
    assert.equal(result.dueOn, originalDueOn);
    assert.equal(result.status, "missed");
  }
});

test("rollover SQL anchors unresolved regular recurrences and preserves In Progress advancement", () => {
  const sql = readFileSync("supabase/patch_daily_until_complete_rollover_rpc.sql", "utf8");
  assert.match(sql, /due_on is not null and due_on <= v_rollover_date/);
  assert.match(sql, /active_status_logical_date is not null\s+and active_status_logical_date <= v_rollover_date/);
  assert.match(sql, /v_task\.active_status_logical_date,\s+'did_my_best'/);
  assert.match(sql, /v_task\.active_occurrence_due_on\s+\);/);
  assert.doesNotMatch(sql, /or \(\s*status = 'in_progress'\s*and active_status_logical_date is null/);
  assert.match(sql, /where id = v_task\.id\s+and user_id = p_user_id/);

  const regularBranch = sql.slice(sql.lastIndexOf("if v_task.status not in ('pending'"), sql.lastIndexOf("get diagnostics v_row_count = row_count;"));
  const inProgressBranch = regularBranch.slice(regularBranch.indexOf("if v_task.status = 'in_progress' then"), regularBranch.indexOf("else", regularBranch.indexOf("if v_task.status = 'in_progress' then")));
  const missedBranch = regularBranch.slice(regularBranch.indexOf("else", regularBranch.indexOf("if v_task.status = 'in_progress' then")));
  assert.match(regularBranch, /on conflict \(user_id, task_id, entry_date\) do nothing/);
  assert.match(regularBranch, /get diagnostics v_row_count = row_count;\s+v_inserted_history_count := v_inserted_history_count \+ v_row_count/);
  assert.doesNotMatch(regularBranch, /on conflict \(user_id, task_id, entry_date\) do update/);
  assert.match(inProgressBranch, /v_next_status := public\.adhdice_resolve_recurring_due_status/);
  assert.match(inProgressBranch, /due_on = v_due_on/);
  assert.match(missedBranch, /status = 'missed'/);
  assert.doesNotMatch(missedBranch, /due_on = v_due_on/);

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
  assert.match(finalization, /const nextDue = calcNextDueDateFromDate\(task, currentDayKey\)/);
  assert.match(finalization, /\{ completed_at: null, due_on: nextDue, status: nextStatus \}/);
  assert.equal(calcNextDueDateFromDate(task({ status: "done" }), "2026-07-12"), "2026-07-13");
  assert.equal(calcNextDueDateFromDate(task({ status: "did_my_best" }), "2026-07-12"), "2026-07-13");
});

test("history saves build the merged occurrence snapshot before syncing the live task", () => {
  const source = readFileSync("src/hooks/useTaskHistoryActions.ts", "utf8");
  const singleEntrySync = source.slice(source.indexOf("async function syncTaskHistoryEntry"), source.indexOf("async function syncTaskHistoryEntries"));
  const multipleEntrySync = source.slice(source.indexOf("async function syncTaskHistoryEntries"), source.indexOf("return { syncTaskHistoryEntries"));
  assert.match(singleEntrySync, /const nextHistory = \[\s*mappedEntry,[\s\S]*taskHistory\.filter/);
  assert.match(singleEntrySync, /syncLiveTaskStatus\(taskId, nextHistory, \[entryDate\]\)/);
  assert.match(multipleEntrySync, /const nextTaskHistory = \[\s*\.\.\.mappedEntries,[\s\S]*taskHistory\.filter/);
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

test("client rollover uses the shared coordinator and refreshes only after owned success", () => {
  const source = readFileSync("src/components/task-app.tsx", "utf8");
  const coordinatorIndex = source.indexOf("taskRolloverCoordinator.run");
  const rpcIndex = source.indexOf('rpc("adhdice_reconcile_task_rollover"', coordinatorIndex);
  const ownedSettlementIndex = source.indexOf("onOwnedSettled", rpcIndex);
  const refreshIndex = source.indexOf("await softRefreshWorkspace();", ownedSettlementIndex);
  assert.ok(coordinatorIndex >= 0 && rpcIndex > coordinatorIndex && ownedSettlementIndex > rpcIndex && refreshIndex > ownedSettlementIndex);
  assert.match(source.slice(ownedSettlementIndex, refreshIndex), /if \(error\)[\s\S]*return;/);
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
