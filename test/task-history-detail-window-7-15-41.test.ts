import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getTaskHistoryInitialDetailRange,
  getTaskHistoryOlderDetailRange,
  mergeTaskHistoryDetailRows,
  taskHistoryDetailCanLoadOlder,
} from "../src/lib/task-history-detail-window.ts";
import { buildTaskHistoryCalendarDateKeys } from "../src/lib/task-history-calendar-focus.ts";

const workspaceSource = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const modalSource = await readFile(new URL("../src/components/task-app/task-view-adapters.tsx", import.meta.url), "utf8");
const ordinaryCalendarSource = await readFile(new URL("../src/components/task-app/task-calendar-view.tsx", import.meta.url), "utf8");

function historyRow(taskId: string, entryDate: string, id = entryDate) {
  return {
    canonical_fact_id: `fact-${id}`,
    created_at: `${entryDate}T12:00:00.000Z`,
    entry_date: entryDate,
    id,
    task_id: taskId,
    updated_at: `${entryDate}T12:00:00.000Z`,
  } as never;
}

test("initial detail range preserves the existing Calendar envelope", () => {
  const range = getTaskHistoryInitialDetailRange("2026-09-24");
  const calendarDays = buildTaskHistoryCalendarDateKeys("2026-09-24");
  assert.deepEqual(range, {
    endDate: calendarDays.at(-1),
    startDate: calendarDays[0],
  });
});

test("older detail chunks are immediately preceding, bounded, and deduplicated", () => {
  const current = getTaskHistoryInitialDetailRange("2026-09-24");
  const older = getTaskHistoryOlderDetailRange(current.startDate);
  assert.equal(older.endDate, "2026-05-03");
  assert.equal(older.startDate, "2025-12-15");
  const merged = mergeTaskHistoryDetailRows(
    [historyRow("task-1", "2026-05-07", "old")],
    [historyRow("task-1", "2026-05-07", "new"), historyRow("task-1", "2026-05-06")],
  );
  assert.deepEqual(merged.map((row) => row.entry_date), ["2026-05-07", "2026-05-06"]);
  assert.equal(new Set(merged.map((row) => row.entry_date)).size, merged.length);
});

test("older existence decisions use task dates without an unbounded count", () => {
  assert.equal(taskHistoryDetailCanLoadOlder({ active_occurrence_due_on: null, created_at: "2026-01-01T00:00:00Z", due_on: null }, "2026-05-07"), true);
  assert.equal(taskHistoryDetailCanLoadOlder({ active_occurrence_due_on: null, created_at: "2026-09-01T00:00:00Z", due_on: "2026-09-01" }, "2026-05-07"), false);
});

test("normal modal open and overrides use independent bounded reads", () => {
  const openStart = appSource.indexOf("function openTaskHistoryForTask");
  const open = appSource.slice(openStart, appSource.indexOf("\n  function openBatchDeleteModal", openStart));
  assert.match(open, /loadTaskHistoryDetailWindow\(taskId, \{ range, source: "open" \}\)/);
  assert.doesNotMatch(open, /loadTaskHistoryForTask\(taskId/);
  assert.match(workspaceSource, /canonicalHistoryQuery\(taskId\)[\s\S]*\.gte\("logical_date", range\.startDate\)[\s\S]*\.lte\("logical_date", range\.endDate\)/);
  assert.match(appSource, /\.eq\("is_active", true\)[\s\S]*\.gte\("logical_date", range\.startDate\)[\s\S]*\.lte\("logical_date", range\.endDate\)/);
  assert.match(appSource, /taskCalendarOverrideLoadedRangesByTaskId/);
  assert.match(appSource, /if \(hasLoadedRange && !options\?\.force\)/);
  assert.match(workspaceSource, /taskHistoryDetailByTaskIdRef/);
  assert.match(workspaceSource, /taskHistoryDetailLoadPromisesRef/);
});

test("detail windows are independently reusable per Task and never reuse semantic readiness", () => {
  assert.match(workspaceSource, /if \(!force && current && taskHistoryDetailRangeContains\(current, range\)\)/);
  assert.match(workspaceSource, /taskHistoryDetailLoadPromisesRef\.current\.set\(taskId/);
  assert.match(workspaceSource, /taskHistoryDetailByTaskIdRef\.current\[taskId\]/);
  assert.match(workspaceSource, /loadTaskHistoryDetailWindow\(taskId, \{ force: true, range, source: "older" \}\)/);
  assert.match(appSource, /taskHistoryDetailByTaskId\[taskHistoryModalTaskId\]\?\.history/);
});

test("partial summaries are explicitly window-scoped while fresh current authority is preferred", () => {
  assert.match(modalSource, /const bestStreakLabel = hasCompleteSemanticHistory \? "Best streak" : "Window best streak"/);
  assert.match(modalSource, /const loggedDaysLabel = hasCompleteSemanticHistory \? "Logged days" : "Window logged days"/);
  assert.match(modalSource, /currentTaskProjection\?\.current_positive_streak/);
  assert.match(modalSource, /currentTaskProjection\?\.last_done_logical_date/);
});

test("mutation, Realtime, and gap recovery keep complete and detail contracts separate", () => {
  assert.match(appSource, /ensureCompleteTaskHistoryForMutation/);
  assert.match(appSource, /source: "mutation"/);
  assert.match(workspaceSource, /history_semantic_full_read_for_mutation/);
  assert.match(workspaceSource, /History notifications do not bootstrap either a complete semantic[\s\S]*cache or an unopened detail window/);
  assert.match(workspaceSource, /history_detail_realtime_refresh/);
  assert.match(workspaceSource, /history_detail_gap_refresh/);
  assert.match(workspaceSource, /source: "gap_recovery"/);
  assert.doesNotMatch(workspaceSource.slice(workspaceSource.indexOf('table: "adhdice_task_history_facts"'), workspaceSource.indexOf('        .subscribe((status', workspaceSource.indexOf('table: "adhdice_task_history_facts"'))), /fetchAllPagedRows/);
});

test("ordinary Tasks Calendar remains independent of canonical History loading", () => {
  assert.doesNotMatch(ordinaryCalendarSource, /loadTaskHistory|fetchAllPagedRows|adhdice_task_history_facts/);
  assert.match(ordinaryCalendarSource, /due_on/);
});
