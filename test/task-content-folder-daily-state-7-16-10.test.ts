import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createTask } from "../src/lib/task-buckets.ts";
import { buildTaskContentFolderMemberSummary } from "../src/lib/task-content-folders.ts";
import { buildTaskTableRow, createStableTaskRowModelCache } from "../src/lib/task-table-row.ts";

const rowContext = {
  focusedTaskIdSet: new Set<string>(),
  linkedNotes: [],
  listDefinitions: [],
  listMemberships: [],
  subtasks: [],
  taskHistory: [],
  todayDateKey: "2026-09-29",
};

function row(id: string, displayStatus: "pending" | "upcoming" | "not_due", finishedTodayByTaskId?: Readonly<Record<string, boolean>>) {
  return buildTaskTableRow(createTask({ id, status: "pending", task_content_folder_id: "folder-test", title: id }), {
    ...rowContext,
    displayStatus,
    finishedTodayByTaskId,
  });
}

test("the shared row model prefers the bounded current-day fact over lazy Task History", () => {
  const taskA = row("rolled-a", "upcoming", { "rolled-a": true });
  const taskB = row("rolled-b", "not_due", { "rolled-b": true });
  const summary = buildTaskContentFolderMemberSummary([
    { id: taskA.id, task_content_folder_id: "folder-test", displayStatus: taskA.status, finishedToday: taskA.finishedToday, isPinned: false, isRoutine: false, hasAttention: false },
    { id: taskB.id, task_content_folder_id: "folder-test", displayStatus: taskB.status, finishedToday: taskB.finishedToday, isPinned: false, isRoutine: false, hasAttention: false },
  ], "folder-test");

  assert.equal(taskA.finishedToday, true);
  assert.equal(taskB.finishedToday, true);
  assert.equal(summary.dailyState, "finished");
});

test("the row cache invalidates when bounded authority changes from unavailable to false", () => {
  const cache = createStableTaskRowModelCache();
  const task = createTask({ id: "cache-task", status: "pending", title: "cache-task" });
  const first = cache.getOrCreate(task, { ...rowContext, displayStatus: "upcoming", finishedTodayByTaskId: { "cache-task": true } });
  const second = cache.getOrCreate(task, { ...rowContext, displayStatus: "upcoming", finishedTodayByTaskId: {} });
  assert.equal(first.finishedToday, true);
  assert.equal(second.finishedToday, false);
});

test("a bounded current-day success plus a genuinely pending Task remains orange", () => {
  const finished = row("finished", "upcoming", { finished: true });
  const open = row("open", "pending", { finished: true });
  const summary = buildTaskContentFolderMemberSummary([
    { id: finished.id, task_content_folder_id: "folder-test", displayStatus: finished.status, finishedToday: finished.finishedToday, isPinned: false, isRoutine: false, hasAttention: false },
    { id: open.id, task_content_folder_id: "folder-test", displayStatus: open.status, finishedToday: false, isPinned: false, isRoutine: false, hasAttention: false },
  ], "folder-test");

  assert.equal(summary.dailyState, "open");
});

test("Tasks activates one shared bounded current-day History feed and passes it to Table/List rows", () => {
  const workspaceSource = readFileSync(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const tableSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
  const rowSource = readFileSync(new URL("../src/lib/task-table-row.ts", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../src/lib/home-current-day-history-runtime.ts", import.meta.url), "utf8");
  const repositorySource = readFileSync(new URL("../src/lib/home-current-day-history-repository.ts", import.meta.url), "utf8");

  assert.match(workspaceSource, /activePage === "Home" \|\| activePage === "Tasks"/);
  assert.match(workspaceSource, /reason: "owner-ready"/);
  assert.match(workspaceSource, /reason: "logical-day"/);
  assert.match(workspaceSource, /onlyIfLoaded/);
  assert.match(appSource, /finishedTodayByTaskId/);
  assert.match(appSource, /isTaskFinishedOnDate\(rows, todayKey\)/);
  assert.match(tableSource, /finishedTodayByTaskId: tableProps\.rowContext\.finishedTodayByTaskId/);
  assert.match(tableSource, /finishedToday: row\.finishedToday/);
  assert.match(rowSource, /finishedTodayByTaskId\[task\.id\] === true/);
  assert.doesNotMatch(runtimeSource, /fullTaskHistory|loadTaskHistory/);
  assert.match(repositorySource, /\.eq\("logical_date", input\.logicalDate\)/);
  assert.match(repositorySource, /\.in\("outcome", \[\.\.\.HOME_CURRENT_DAY_SUCCESSFUL_OUTCOMES\]\)/);
});
