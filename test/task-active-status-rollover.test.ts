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

test("weekly early completion advances from the scheduled occurrence, not the action date", () => {
  const sundayOnly = task({ due_on: "2026-07-26", repeat_days_of_week: [0], repeat_frequency: "weekly", status: "done" });
  const mondayWednesdayFriday = task({ due_on: "2026-07-20", repeat_days_of_week: [1, 3, 5], repeat_frequency: "weekly", status: "done" });

  assert.equal(calcNextDueDateFromDate(sundayOnly, sundayOnly.due_on!), "2026-08-02");
  assert.equal(calcNextDueDateFromDate(mondayWednesdayFriday, mondayWednesdayFriday.due_on!), "2026-07-22");
  assert.equal(calcNextDueDateFromDate(mondayWednesdayFriday, "2026-07-22"), "2026-07-24");
});

test("client rollover uses the coordinator and targeted reconciliation only after owned success", () => {
  const source = readFileSync("src/components/task-app.tsx", "utf8");
  const coordinatorIndex = source.indexOf("taskRolloverCoordinator.run");
  const ownedSettlementIndex = source.indexOf("onOwnedSettled", coordinatorIndex);
  const reconciliationIndex = source.indexOf("await reconcileRolloverWorkspace();", ownedSettlementIndex);
  assert.ok(coordinatorIndex >= 0 && ownedSettlementIndex > coordinatorIndex && reconciliationIndex > ownedSettlementIndex);
  assert.match(source.slice(ownedSettlementIndex, reconciliationIndex), /if \(error\)[\s\S]*if \(!didMutate\) return/);
  assert.doesNotMatch(source, /adhdice_reconcile_task_rollover|adhdice_apply_task_state_engine_rollover/);
  assert.doesNotMatch(source, /lastResetDateRef/);
});

test("rollover retains startup, cadence, visibility, and persisted-page resume triggers", () => {
  const source = readFileSync("src/components/task-app.tsx", "utf8");
  const start = source.indexOf("const runDayReset = useCallback");
  const end = source.indexOf("const visibleTaskSubtasks", start);
  const lifecycle = source.slice(start, end);
  assert.match(lifecycle, /void runDayReset\("initial_load"\);/);
  assert.match(lifecycle, /setInterval\(\(\) => \{ void runDayReset\("timer"\); \}, 60_000\)/);
  assert.match(lifecycle, /const wasVisible = wasDocumentVisibleRef\.current[\s\S]*if \(!wasVisible && isVisible\)[\s\S]*void runDayReset\("visibility"\)/);
  assert.match(lifecycle, /event\.persisted[\s\S]*void runDayReset\("pageshow"\)/);
  assert.doesNotMatch(lifecycle, /adhdice_apply_task_state_engine_rollover|TASK_STATE_CANONICAL_COMMANDS_ENABLED/);
});

test("engine rollover waits for loaded Tasks and History, then reads current inputs for every trigger", () => {
  const source = readFileSync("src/components/task-app.tsx", "utf8");
  const start = source.indexOf('const runDayReset = useCallback');
  const end = source.indexOf('const visibleTaskSubtasks', start);
  const lifecycle = source.slice(start, end);
  assert.match(lifecycle, /const inputs = rolloverInputsRef\.current/);
  assert.match(lifecycle, /if \(!inputs\.isTasksReady \|\| !inputs\.isTaskHistoryLoaded\) return/);
  assert.match(lifecycle, /history: rolloverHistory[\s\S]*tasks: rolloverTasks/);
  assert.match(lifecycle, /\}, \[isTaskHistoryLoaded, runDayReset, session\?\.user\?\.id, supabase\]\);/);
  assert.match(lifecycle, /plannedTaskPatches = mutationCandidates\.length/);
  assert.match(lifecycle, /committedTaskPatches: error && settledTaskIds\.length === 0 \? 0 : committedTaskPatches/);
});

test("canonical rollover commands are mutation-scoped and use plan-specific replay identities", () => {
  const source = readFileSync("src/components/task-app.tsx", "utf8");
  const canonicalStart = source.indexOf("const plan = createEngineRolloverPlan");
  const canonicalEnd = source.indexOf("onOwnedSettled", canonicalStart);
  const canonical = source.slice(canonicalStart, canonicalEnd);
  assert.match(canonical, /createEngineRolloverPlan\(/);
  assert.match(canonical, /allowCanonicalAutomaticMissed: true/);
  assert.match(canonical, /engineRolloverPlanTaskMutationCandidates\(plan, rolloverTasks\)/);
  assert.match(canonical, /for \(const candidate of mutationCandidates\)/);
  assert.match(canonical, /createTaskRolloverReplayIdentity\(/);
  assert.doesNotMatch(canonical, /for \(const task of rolloverTasks\)/);
  assert.doesNotMatch(source, /TASK_STATE_CANONICAL_COMMANDS_ENABLED/);
});

test("production rollover has one canonical authority and no legacy runtime branch", () => {
  const source = readFileSync("src/components/task-app.tsx", "utf8");
  assert.match(source, /const authority = "canonical" as const/);
  assert.doesNotMatch(source, /authority\s*=\s*"(?:engine|legacy)"/);
  assert.doesNotMatch(source, /adhdice_reconcile_task_rollover|adhdice_apply_task_state_engine_rollover/);
});
