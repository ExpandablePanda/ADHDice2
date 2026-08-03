import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
const modalSource = readFileSync(new URL("../src/components/task-app/task-view-adapters.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");

test("opening Task History stores the requested task ID before loading details", () => {
  const handlerStart = appSource.indexOf("function openTaskHistoryForTask");
  const handlerEnd = appSource.indexOf("\n  async function closeActualTimeEntry", handlerStart);
  const handler = appSource.slice(handlerStart, handlerEnd);
  assert.match(handler, /setTaskHistoryModalTaskId\(taskId\)/);
  assert.match(handler, /loadTaskHistoryForTask\(taskId\)/);
  assert.match(handler, /tasks\.find\(\(entry\) => entry\.id === taskId\)/);
});

test("parent, Step, Substep, and context-menu History actions preserve their row IDs", () => {
  assert.match(tableSource, /onOpenTaskHistory\(task\.id\)/);
  assert.equal((tableSource.match(/onOpenTaskHistory\(item\.id\)/g) ?? []).length, 2);
  assert.match(tableSource, /onOpenTaskHistory\(rowContextMenuTask\.id\)/);
  assert.match(listSource, /tableProps\.onOpenTaskHistory\?\.\(task\.id\)/);
  assert.match(listSource, /tableProps\.onOpenTaskHistory\?\.\(rowContextMenuTask\.id\)/);
});

test("History modal renders only the ready task cache and exposes loading retry UI", () => {
  assert.match(appSource, /taskHistory: taskHistoryModalHistoryByTaskId\[taskHistoryModalTaskId\] \?\? \[\]/);
  assert.match(appSource, /taskHistoryLoadStatus: taskHistoryLoadStateByTaskId\[taskHistoryModalTaskId\]\?\.status \?\? "loading"/);
  assert.match(appSource, /onRetryTaskHistoryLoad: \(\) => retryTaskHistoryForTask\(taskHistoryModalTaskId\)/);
  assert.match(modalSource, /if \(taskHistoryLoadStatus !== "ready"\)/);
  assert.match(modalSource, /Loading full task history/);
  assert.match(modalSource, /Retry History/);
  const readinessBoundary = modalSource.slice(modalSource.lastIndexOf("if (taskHistoryLoadStatus !== \"ready\")"), modalSource.indexOf("const calendarButton"));
  assert.doesNotMatch(readinessBoundary, /data-history-date/);
});

test("full History readiness is cached per authenticated task and mutations update the loaded cache", () => {
  assert.match(workspaceSource, /taskHistoryByTaskId/);
  assert.match(workspaceSource, /taskHistoryLoadStateByTaskId/);
  assert.match(workspaceSource, /taskHistoryTaskLoadPromisesRef/);
  assert.match(workspaceSource, /if \(!force && taskHistoryLoadStateByTaskIdRef\.current\[taskId\]\?\.status === "ready"\)/);
  assert.match(workspaceSource, /clearTaskHistoryTaskCache\(\)/);
  assert.match(workspaceSource, /updateTaskHistoryForTask/);
  assert.match(workspaceSource, /deduplicateTaskHistoryByLogicalDate/);
  assert.match(workspaceSource, /fetchAllPagedRows<DbTaskHistory>/);
  assert.match(workspaceSource, /loadTaskHistoryForTask\(taskId, \{ force: true, silent: true \}\)/);
  assert.doesNotMatch(workspaceSource, /setTaskHistoryCacheForTask\(taskId, nextTaskHistory\)/);
  assert.match(workspaceSource, /\.eq\("task_id", taskId\)/);
  assert.doesNotMatch(workspaceSource, /loadTaskHistory\(\{ silent: true, source: "secondary" \}\).*taskId/);
});
