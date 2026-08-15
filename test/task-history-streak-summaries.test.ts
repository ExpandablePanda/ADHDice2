import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createTask } from "../src/lib/task-buckets.ts";
import type { TaskHistory } from "../src/lib/database.types.ts";
import { TASK_STATE_HISTORY_CUTOVER_DATE } from "../src/lib/task-history-cutover.ts";
import { adaptLegacyTaskState } from "../src/lib/task-state-engine/legacy-adapter.ts";
import { buildTaskEffectiveTimeline } from "../src/lib/task-state-engine/effective-timeline.ts";
import {
  buildTaskHistoryStreakSummaryMap,
  TASK_HISTORY_STREAK_SUMMARY_COLUMNS,
  updateTaskHistoryStreakSummaryMap,
} from "../src/lib/task-history-streak-summaries.ts";
import { computeTaskSpecificHistoryStats, deduplicateTaskHistoryByLogicalDate } from "../src/lib/task-history.ts";
import { resolveTaskHistoryCalendarRead } from "../src/lib/task-state-engine/calendar-authority.ts";
import type { TaskCalendarOverride } from "../src/lib/task-state-engine/types.ts";
import { selectCriticalTaskHistoryFacts } from "../src/lib/workspace-critical-task-facts.ts";

const workspaceSource = readFileSync(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
const streakSummarySource = readFileSync(new URL("../src/lib/task-history-streak-summaries.ts", import.meta.url), "utf8");
const historyActionSource = readFileSync(new URL("../src/hooks/useTaskHistoryActions.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");

function task(id = "task-streak") {
  return createTask({
    due_on: "2026-08-03",
    id,
    repeat_frequency: "daily",
    repeat_interval: 1,
    status: "done",
    title: "Streak task",
  });
}

function history(id: string, entryDate: string, status: TaskHistory["status"], wasCompleted: boolean, taskId = "task-streak"): TaskHistory {
  return {
    counted_as_due_occurrence: true,
    created_at: `${entryDate}T12:00:00.000Z`,
    entry_date: entryDate,
    event_type: "status",
    id,
    occurrence_due_on: entryDate,
    occurrence_key: `occurrence:${entryDate}`,
    status,
    task_id: taskId,
    updated_at: `${entryDate}T12:00:00.000Z`,
    user_id: "user-1",
    was_completed: wasCompleted,
  };
}

function manualNotDue(logicalDate: string, taskId = "task-streak"): TaskCalendarOverride {
  return {
    id: `override-${taskId}-${logicalDate}`,
    logicalDate,
    overrideState: "not_due",
    provenance: "manual",
  };
}

test("narrow critical History can coexist with a three-day compact completion streak", () => {
  const currentTask = task();
  const rows = [
    history("done-1", "2026-08-01", "done", true),
    history("done-2", "2026-08-02", "done", true),
    history("done-3", "2026-08-03", "done", true),
  ];
  const critical = selectCriticalTaskHistoryFacts([currentTask], rows, "2026-08-03");
  const summaries = buildTaskHistoryStreakSummaryMap([currentTask], rows, "2026-08-03");

  assert.ok(critical.length < rows.length);
  assert.equal(summaries[currentTask.id]?.currentStreak, 3);
});

test("compact summaries count three trailing missed entries", () => {
  const currentTask = task();
  const summaries = buildTaskHistoryStreakSummaryMap([currentTask], [
    history("missed-1", "2026-08-01", "missed", false),
    history("missed-2", "2026-08-02", "missed", false),
    history("missed-3", "2026-08-03", "missed", false),
  ], "2026-08-03");

  assert.equal(summaries[currentTask.id]?.missedStreak, 3);
});

test("active manual Not Due boundaries reach the compact summary and shorten the current Missed streak", () => {
  const currentTask = { ...task("updates"), due_on: "2026-08-08", status: "pending" as const };
  const rows = [
    history("missed-8", "2026-08-08", "missed", false, currentTask.id),
    history("missed-10", "2026-08-10", "missed", false, currentTask.id),
    history("missed-11", "2026-08-11", "missed", false, currentTask.id),
    history("missed-12", "2026-08-12", "missed", false, currentTask.id),
    history("missed-13", "2026-08-13", "missed", false, currentTask.id),
  ];

  const withoutOverride = buildTaskHistoryStreakSummaryMap([currentTask], rows, "2026-08-14")[currentTask.id];
  const withOverride = buildTaskHistoryStreakSummaryMap([currentTask], rows, "2026-08-14", {
    calendarOverridesByTaskId: { [currentTask.id]: [manualNotDue("2026-08-09", currentTask.id)] },
  })[currentTask.id];

  assert.equal(withoutOverride?.missedStreak, 6);
  assert.equal(withOverride?.missedStreak, 4);
});

test("explicit Missed History remains authoritative over an active manual Not Due override", () => {
  const currentTask = { ...task("explicit-missed"), due_on: "2026-08-08", status: "pending" as const };
  const summary = buildTaskHistoryStreakSummaryMap([currentTask], [
    history("missed-8", "2026-08-08", "missed", false, currentTask.id),
    history("missed-9", "2026-08-09", "missed", false, currentTask.id),
  ], "2026-08-09", {
    calendarOverridesByTaskId: { [currentTask.id]: [manualNotDue("2026-08-09", currentTask.id)] },
  })[currentTask.id];

  assert.equal(summary?.missedStreak, 2);
});

test("task-specific active overrides are only supplied to their matching summary", () => {
  const firstTask = { ...task("first-task"), due_on: "2026-08-08", status: "pending" as const };
  const secondTask = { ...task("second-task"), due_on: "2026-08-08", status: "pending" as const };
  const rows = [
    history("first-8", "2026-08-08", "missed", false, firstTask.id),
    history("first-10", "2026-08-10", "missed", false, firstTask.id),
    history("second-8", "2026-08-08", "missed", false, secondTask.id),
    history("second-10", "2026-08-10", "missed", false, secondTask.id),
  ];
  const summaries = buildTaskHistoryStreakSummaryMap([firstTask, secondTask], rows, "2026-08-10", {
    calendarOverridesByTaskId: { [firstTask.id]: [manualNotDue("2026-08-09", firstTask.id)] },
  });

  assert.equal(summaries[firstTask.id]?.missedStreak, 1);
  assert.equal(summaries[secondTask.id]?.missedStreak, 3);
});

test("success streaks combine Done and Did My Best across calendar gaps", () => {
  const currentTask = task();
  const summaries = buildTaskHistoryStreakSummaryMap([currentTask], [
    history("done-1", "2026-07-01", "done", true),
    history("best-2", "2026-07-08", "did_my_best", true),
    history("done-3", "2026-07-15", "done", true),
    history("done-4", "2026-07-22", "done", true),
  ], "2026-07-22");

  assert.equal(summaries[currentTask.id]?.currentStreak, 4);
});

test("missed streaks combine recorded Missed outcomes across calendar gaps", () => {
  const currentTask = task();
  const summaries = buildTaskHistoryStreakSummaryMap([currentTask], [
    history("missed-1", "2026-06-01", "missed", false),
    history("missed-2", "2026-06-05", "missed", false),
    history("missed-3", "2026-06-20", "missed", false),
  ], "2026-06-20");

  assert.equal(summaries[currentTask.id]?.missedStreak, 3);
});

test("pre-cutover migration Done and Did My Best expose only their historical date", () => {
  const currentTask = task();
  for (const [index, status] of (["done", "did_my_best"] as const).entries()) {
    const row = history(`migration-success-${index}`, "2026-08-07", status, true);
    row.canonical_provenance_kind = "migration_reconstruction";
    row.recurrence_authoritative = false;
    const summary = buildTaskHistoryStreakSummaryMap([currentTask], [row], TASK_STATE_HISTORY_CUTOVER_DATE)[currentTask.id];

    assert.equal(summary?.lastDoneDate, "2026-08-07");
    assert.equal(summary?.lastDoneAt, null);
  }
});

test("Appanda uses the exact resolved Calendar sequence and does not use migration insertion time", () => {
  const currentTask = { ...task("appanda"), due_on: "2026-08-08" };
  const done = history("appanda-best", "2026-08-07", "did_my_best", true, currentTask.id);
  const missed = history("appanda-missed", "2026-08-08", "missed", false, currentTask.id);
  for (const row of [done, missed]) {
    row.canonical_provenance_kind = "migration_reconstruction";
    row.recurrence_authoritative = false;
    row.created_at = "2026-08-13T23:02:00.000Z";
    row.updated_at = "2026-08-13T23:02:00.000Z";
  }
  const historyBefore = structuredClone([done, missed]);

  const summary = buildTaskHistoryStreakSummaryMap([currentTask], [done, missed], "2026-08-13")[currentTask.id];

  assert.equal(summary?.currentStreak, 0);
  assert.equal(summary?.missedStreak, 5);
  assert.equal(summary?.lastDoneDate, "2026-08-07");
  assert.equal(summary?.lastDoneAt, null);
  assert.notEqual(summary?.lastDoneAt, done.updated_at);
  assert.deepEqual([done, missed], historyBefore);
});

test("a current Open overdue day is excluded until rollover finalizes it as Missed", () => {
  const currentTask = { ...task("open-overdue"), due_on: "2026-08-08", status: "pending" as const };
  const missed = history("open-overdue-missed", "2026-08-08", "missed", false, currentTask.id);

  const beforeRollover = buildTaskHistoryStreakSummaryMap([currentTask], [missed], "2026-08-09")[currentTask.id];
  const afterRollover = buildTaskHistoryStreakSummaryMap([currentTask], [missed], "2026-08-10")[currentTask.id];

  assert.equal(beforeRollover?.missedStreak, 1);
  assert.equal(afterRollover?.missedStreak, 2);
});

test("explicit Done and Did My Best win over a calculated Missed on the same date", () => {
  for (const outcome of ["done", "did_my_best"] as const) {
    const currentTask = { ...task(`explicit-${outcome}`), due_on: "2026-08-08", status: "pending" as const };
    const explicit = history(`explicit-${outcome}-row`, "2026-08-08", outcome, true, currentTask.id);
    const summary = buildTaskHistoryStreakSummaryMap([currentTask], [explicit], "2026-08-09")[currentTask.id];

    assert.equal(summary?.currentStreak, 1, outcome);
    assert.equal(summary?.missedStreak, 0, outcome);
  }
});

test("calculated historical Missed days count without persisted History rows", () => {
  const currentTask = { ...task("virtual-missed"), due_on: "2026-08-08", status: "pending" as const };
  const summary = buildTaskHistoryStreakSummaryMap([currentTask], [], "2026-08-13")[currentTask.id];

  assert.equal(summary?.currentStreak, 0);
  assert.equal(summary?.missedStreak, 5);
});

test("Calendar states and streak input use one resolved timeline for the same range", () => {
  const currentTask = { ...task("same-projection"), due_on: "2026-08-08", status: "pending" as const };
  const missed = history("same-projection-missed", "2026-08-08", "missed", false, currentTask.id);
  const context = {
    logicalDayRollover: "00:00",
    now: "2026-08-13T12:00:00.000Z",
    timezone: "UTC",
  } as const;
  const calendarRead = resolveTaskHistoryCalendarRead({
    ...context,
    calendarStart: "2026-08-08",
    calendarEnd: "2026-08-13",
    history: [missed],
    task: currentTask,
  });
  const summary = buildTaskHistoryStreakSummaryMap([currentTask], [missed], "2026-08-13", context)[currentTask.id];

  assert.ok(calendarRead?.timeline);
  assert.deepEqual(
    calendarRead?.states,
    Object.fromEntries(Object.entries(calendarRead?.timeline?.days ?? {}).map(([date, day]) => [date, day.state === "scheduled" ? "due" : day.state === "no_entry" ? "not_due" : day.state])),
  );
  assert.equal(summary?.currentStreak, calendarRead?.timeline?.currentCompletedStreak);
  assert.equal(summary?.missedStreak, calendarRead?.timeline?.currentMissedStreak);
});

test("summary resolution is read-only and modern post-cutover Task State remains intact", () => {
  const currentTask = { ...task("modern-read"), due_on: TASK_STATE_HISTORY_CUTOVER_DATE, status: "pending" as const };
  const modernDone = history("modern-read-done", TASK_STATE_HISTORY_CUTOVER_DATE, "done", true, currentTask.id);
  modernDone.canonical_provenance_kind = "user";
  modernDone.recurrence_authoritative = true;
  const historyBefore = structuredClone([modernDone]);
  const summary = buildTaskHistoryStreakSummaryMap([currentTask], [modernDone], TASK_STATE_HISTORY_CUTOVER_DATE)[currentTask.id];

  assert.equal(summary?.currentStreak, 1);
  assert.equal(summary?.missedStreak, 0);
  assert.deepEqual([modernDone], historyBefore);
});

test("post-cutover modern Done and Did My Best preserve legitimate event timestamps", () => {
  const currentTask = task();
  for (const [index, status] of (["done", "did_my_best"] as const).entries()) {
    const row = history(`modern-success-${index}`, TASK_STATE_HISTORY_CUTOVER_DATE, status, true, currentTask.id);
    row.canonical_provenance_kind = "user";
    const summary = buildTaskHistoryStreakSummaryMap([currentTask], [row], TASK_STATE_HISTORY_CUTOVER_DATE)[currentTask.id];

    assert.equal(summary?.lastDoneDate, TASK_STATE_HISTORY_CUTOVER_DATE);
    assert.equal(summary?.lastDoneAt, row.updated_at);
  }
});

test("Complete and Delayed outcomes break both recorded streaks", () => {
  const currentTask = task();
  const successBreak = buildTaskHistoryStreakSummaryMap([currentTask], [
    history("done-1", "2026-08-01", "done", true),
    history("done-2", "2026-08-02", "done", true),
    history("complete", "2026-08-03", "complete", true),
  ], "2026-08-03");
  const missedBreak = buildTaskHistoryStreakSummaryMap([currentTask], [
    history("missed-1", "2026-08-01", "missed", false),
    history("missed-2", "2026-08-02", "missed", false),
    history("delayed", "2026-08-03", "delayed", false),
  ], "2026-08-03");

  assert.equal(successBreak[currentTask.id]?.currentStreak, 0);
  assert.equal(successBreak[currentTask.id]?.missedStreak, 0);
  assert.equal(missedBreak[currentTask.id]?.currentStreak, 0);
  assert.equal(missedBreak[currentTask.id]?.missedStreak, 0);
});

test("non-authoritative migration reconstruction History still counts toward streaks", () => {
  const currentTask = task();
  const migrated = history("migration-missed", "2026-08-01", "missed", false);
  migrated.canonical_provenance_kind = "migration_reconstruction";
  migrated.recurrence_authoritative = false;

  const summaries = buildTaskHistoryStreakSummaryMap([currentTask], [migrated], "2026-08-03");

  assert.equal(summaries[currentTask.id]?.missedStreak, 1);
});

test("No Soda streak matches the resolved Calendar outcomes rather than a row count", () => {
  const currentTask = createTask({
    due_on: "2026-07-24",
    id: "no-soda",
    repeat_frequency: "daily",
    repeat_interval: 1,
    status: "missed",
    title: "No Soda",
  });
  const rows = Array.from({ length: 50 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 5, 18 + index)).toISOString().slice(0, 10);
    const row = history(`missed-${index}`, date, "missed", false, currentTask.id);
    row.canonical_provenance_kind = "migration_reconstruction";
    row.recurrence_authoritative = false;
    return row;
  });

  const summary = buildTaskHistoryStreakSummaryMap([currentTask], rows, "2026-08-06")[currentTask.id];
  const adapted = adaptLegacyTaskState(currentTask, rows, {
    now: "2026-08-06T12:00:00.000Z",
    timezone: "UTC",
    logicalDayRollover: "00:00",
  });
  const recurrenceTimeline = buildTaskEffectiveTimeline({
    task: adapted.engineInput.task,
    history: adapted.engineInput.history,
    logicalDate: "2026-08-06",
    calendarStart: "2026-08-06",
    calendarEnd: "2026-08-06",
  });

  assert.equal(rows.length, 50);
  assert.equal(recurrenceTimeline.currentMissedStreak, 14);
  assert.equal(summary?.missedStreak, 50);
  assert.match(streakSummarySource, /resolveTaskHistoryCalendarRead/);
  assert.doesNotMatch(streakSummarySource, /computeTaskSpecificHistoryStats/);
});

test("a nonmatching trailing status breaks the corresponding streak", () => {
  const currentTask = task();
  const summaries = buildTaskHistoryStreakSummaryMap([currentTask], [
    history("done-1", "2026-08-01", "done", true),
    history("done-2", "2026-08-02", "done", true),
    history("missed-3", "2026-08-03", "missed", false),
  ], "2026-08-03");

  assert.equal(summaries[currentTask.id]?.currentStreak, 0);
  assert.equal(summaries[currentTask.id]?.missedStreak, 1);
});

test("optimistic and persisted copies of one task date count once", () => {
  const currentTask = task();
  const rows = [
    history("done-1", "2026-07-31", "done", true),
    history("done-2", "2026-08-01", "done", true),
    history("done-3", "2026-08-02", "done", true),
    history("optimistic-aug-3", "2026-08-03", "did_my_best", true),
    history("persisted-aug-3", "2026-08-03", "did_my_best", true),
  ];

  const summary = buildTaskHistoryStreakSummaryMap([currentTask], rows, "2026-08-03");

  assert.equal(deduplicateTaskHistoryByLogicalDate(rows).length, 4);
  assert.equal(summary[currentTask.id]?.currentStreak, 4);
});

test("a genuine fifth consecutive qualifying occurrence changes the streak from four to five", () => {
  const currentTask = task();
  const rows = [
    history("done-1", "2026-07-31", "done", true),
    history("done-2", "2026-08-01", "done", true),
    history("done-3", "2026-08-02", "done", true),
    history("best-4", "2026-08-03", "did_my_best", true),
  ];

  assert.equal(buildTaskHistoryStreakSummaryMap([currentTask], rows, "2026-08-03")[currentTask.id]?.currentStreak, 4);
  assert.equal(buildTaskHistoryStreakSummaryMap([currentTask], [
    ...rows,
    history("done-5", "2026-08-04", "done", true),
  ], "2026-08-04")[currentTask.id]?.currentStreak, 5);
});

test("the reported task shape agrees between compact summary, Table fallback, and modal statistics", () => {
  const currentTask = task("case-519329");
  const rows = [
    history("done-1", "2026-07-31", "done", true, currentTask.id),
    history("done-2", "2026-08-01", "done", true, currentTask.id),
    history("done-3", "2026-08-02", "done", true, currentTask.id),
    history("optimistic-aug-3", "2026-08-03", "did_my_best", true, currentTask.id),
    history("persisted-aug-3", "2026-08-03", "did_my_best", true, currentTask.id),
  ];
  const normalized = deduplicateTaskHistoryByLogicalDate(rows);
  const summary = buildTaskHistoryStreakSummaryMap([currentTask], rows, "2026-08-03")[currentTask.id];
  const modalStats = computeTaskSpecificHistoryStats(currentTask, normalized, "2026-08-03");

  assert.equal(summary?.currentStreak, 4);
  assert.equal(modalStats.currentStreak, 4);
});

test("an affected task summary updates without rebuilding other task summaries", () => {
  const currentTask = task();
  const otherTask = task("other-task");
  const initial = buildTaskHistoryStreakSummaryMap([currentTask, otherTask], [
    history("done-1", "2026-08-03", "done", true),
  ], "2026-08-03");
  const updated = updateTaskHistoryStreakSummaryMap(initial, currentTask, [
    history("done-1", "2026-08-03", "done", true),
    history("done-2", "2026-08-04", "done", true),
  ], "2026-08-04");

  assert.equal(updated[currentTask.id]?.currentStreak, 2);
  assert.strictEqual(updated[otherTask.id], initial[otherTask.id]);
});

test("parent and child Table/List title paths consume compact summary fields", () => {
  assert.match(appSource, /taskHistoryStreakSummaryByTaskId: taskHistoryStreakSummaries/);
  assert.match(tableSource, /task\.currentStreak > 0/);
  assert.match(tableSource, /task\.missedStreak > 0/);
  assert.match(tableSource, /renderStepHistoryChips\(item\.currentStreak, item\.missedStreak\)/);
  assert.match(listSource, /currentStreak=\{taskRow\.currentStreak\}/);
  assert.match(listSource, /missedStreak=\{taskRow\.missedStreak\}/);
  assert.match(listSource, /taskHistoryStreakSummary: rowContext\.taskHistoryStreakSummaryByTaskId\[task\.id\]/);
});

test("normal Tasks startup uses a paged compact query and never starts full History", () => {
  const coreLoader = workspaceSource.slice(
    workspaceSource.indexOf("async function loadCoreWorkspaceData"),
    workspaceSource.indexOf("const requestCoreWorkspaceRefresh"),
  );

  assert.match(workspaceSource, /TASK_HISTORY_STREAK_SUMMARY_COLUMNS/);
  assert.equal(TASK_HISTORY_STREAK_SUMMARY_COLUMNS, "id,task_id,entry_date,occurrence_key,occurrence_due_on,status,event_type,counted_as_due_occurrence,was_completed,created_at,updated_at");
  assert.match(streakSummarySource, /TASK_HISTORY_STREAK_SUMMARY_COLUMNS = "id,task_id,entry_date,occurrence_key,occurrence_due_on,status,event_type,counted_as_due_occurrence,was_completed,created_at,updated_at"/);
  assert.match(workspaceSource, /fetchAllPagedRows<TaskHistoryStreakEntry>/);
  assert.match(workspaceSource, /\.range\(from, to\)/);
  assert.match(coreLoader, /void loadTaskHistoryStreakSummaries\(nextTasks\)/);
  assert.doesNotMatch(coreLoader, /loadTaskHistory\(\{ silent: true, source: "secondary" \}\)/);
  assert.doesNotMatch(workspaceSource, /from\("adhdice_task_history"\)\.select\("\*"\)/);
  assert.match(workspaceSource, /hasLoadedFullTaskHistoryRef\.current/);
});

test("History mutation callbacks refresh one task summary", () => {
  assert.match(historyActionSource, /onHistoryMutation\?:/);
  assert.match(historyActionSource, /notifyHistoryMutation\(taskId, nextTaskHistory\)/);
  assert.match(appSource, /onHistoryMutation: reconcileTaskHistoryMutation/);
  assert.match(appSource, /updateTaskHistoryForTask\(taskId, nextTaskHistory\)/);
  assert.match(workspaceSource, /refreshTaskHistoryStreakSummaryRef\.current = reloadTaskHistoryStreakSummaryForTask/);
  assert.doesNotMatch(historyActionSource, /loadTaskHistoryStreakSummaries/);
});

test("modal calendar and statistics normalize saved Done, Did My Best, and Missed rows", () => {
  const modalSource = readFileSync(new URL("../src/components/task-app/task-view-adapters.tsx", import.meta.url), "utf8");

  assert.match(modalSource, /const normalizedTaskHistory = deduplicateTaskHistoryByLogicalDate\(taskHistory\)/);
  assert.match(modalSource, /const historyByDate = new Map\(normalizedTaskHistory\.map/);
  assert.match(modalSource, /computeTaskSpecificHistoryStats\(task, normalizedTaskHistory/);
  assert.match(modalSource, /resolveTaskHistoryCalendarActionStatuses\(\{\s*\.\.\.stateEngineContext, history: normalizedTaskHistory/);
  assert.match(modalSource, /selectedEntry\?\.status === status/);
  assert.doesNotMatch(modalSource, /<span>Clear<\/span>/);
  assert.match(modalSource, /entry\.status === "missed"/);
  assert.match(modalSource, /entry\.status === "did_my_best"/);
  assert.doesNotMatch(modalSource, /effectiveMissedStreak|effectiveCompletedStreak/);
});
