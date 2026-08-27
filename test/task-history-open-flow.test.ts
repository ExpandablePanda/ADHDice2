import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
const modalSource = readFileSync(new URL("../src/components/task-app/task-view-adapters.tsx", import.meta.url), "utf8");
const taskHistoryModalSource = modalSource.slice(
  modalSource.indexOf("export function TaskHistoryModal"),
  modalSource.indexOf("\nexport function BottomDockAdapter"),
);
const calendarAuthoritySource = readFileSync(new URL("../src/lib/task-state-engine/calendar-authority.ts", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");

test("rollover History reads use an isolated lifecycle instead of claiming the modal cache", () => {
  const rollover = appSource.slice(appSource.indexOf("const runDayReset"), appSource.indexOf("useEffect(() =>", appSource.indexOf("const runDayReset")));
  const rolloverReader = workspaceSource.slice(workspaceSource.indexOf("async function fetchTaskHistoryForRollover"), workspaceSource.indexOf("async function loadTaskHistoryForTask"));
  assert.match(rollover, /fetchTaskHistoryForRollover\(rolloverTaskIds\)/);
  assert.match(rolloverReader, /fetchTaskHistoryForTaskIdsInBatches/);
  assert.match(rolloverReader, /\.in\("entity_id", batchTaskIds\)/);
  assert.doesNotMatch(rolloverReader, /setTaskHistoryCacheForTask|setTaskHistoryTaskLoadState|taskHistoryLoadStateByTaskIdRef|taskHistoryByTaskIdRef/);
});

test("opening Task History stores the requested task ID before loading details", () => {
  const handlerStart = appSource.indexOf("function openTaskHistoryForTask");
  const handlerEnd = appSource.indexOf("\n  async function closeActualTimeEntry", handlerStart);
  const handler = appSource.slice(handlerStart, handlerEnd);
  assert.match(handler, /setTaskHistoryModalTaskId\(taskId\)/);
  assert.match(handler, /loadTaskHistoryForTask\(taskId, \{ force: true \}\)/);
  assert.match(handler, /tasks\.find\(\(entry\) => entry\.id === taskId\)/);
  assert.match(handler, /loadTaskCalendarOverridesForTask\(taskId\)/);
});

test("Task History Calendar overrides use the canonical calendar_override intent and refresh the task-scoped read", () => {
  const flowStart = appSource.indexOf("const taskHistoryFlow");
  const flowEnd = appSource.indexOf("\n  function togglePinnedFilter", flowStart);
  const flow = appSource.slice(flowStart, flowEnd);
  assert.match(flow, /type: "calendar_override"/);
  assert.match(flow, /override_state: overrideState/);
  assert.match(flow, /await loadTaskCalendarOverridesForTask\(taskHistoryModalTaskId\)/);
  assert.match(flow, /if \(refreshed\) \{\s*await refreshTaskHistoryStreakSummary\(taskHistoryModalTaskId\)/);
  assert.doesNotMatch(flow, /syncTaskHistoryEntries\(taskHistoryModalTaskId,.*overrideState/s);
  assert.match(flow, /replayIdentity: createTaskStateReplayIdentity\(\)/);
  assert.doesNotMatch(flow, /calendar-override:/);
});

test("Task History Not Due replaces handled outcomes through clear then override and verifies reconciliation", () => {
  const notDueStart = appSource.indexOf("async function setTaskHistoryNotDue");
  const notDueEnd = appSource.indexOf("\n\n  const taskHistoryFlow", notDueStart);
  const notDue = appSource.slice(notDueStart, notDueEnd);
  assert.match(notDue, /clearTaskHistoryCalendarDate\(taskId, logicalDate, "Not Due", \{ clearReplaceableOutcome: true \}\)/);
  assert.ok(notDue.indexOf("clearTaskHistoryCalendarDate") < notDue.indexOf('type: "calendar_override"'));
  assert.match(notDue, /loadTaskHistoryForTasks\(\[taskId\]\)/g);
  assert.match(notDue, /activeNotDue/);
  assert.match(notDue, /conflictingEntry/);
  assert.match(notDue, /Task was saved, but the requested History change to Not Due/);
});

test("Task History outcome edits use one set_outcome replacement without pre-clearing History", () => {
  const flowStart = appSource.indexOf('onSetStatuses: async');
  const flowEnd = appSource.indexOf('    onSetDelayedStatus:', flowStart);
  const flow = appSource.slice(flowStart, flowEnd);
  assert.doesNotMatch(flow, /clearTaskHistoryCalendarDate/);
  assert.match(flow, /syncTaskHistoryEntries\(/);
  assert.match(flow, /status !== "clear"/);
  assert.match(flow, /historySnapshot: taskHistoryByTaskId\[taskHistoryModalTaskId\] \?\? \[\]/);
  assert.match(flow, /for \(const entryDate of entryDates\)/);
});

test("Task History Not Due carries the committed canonical Task from clear into its Calendar override", () => {
  const clearStart = appSource.indexOf("async function clearTaskHistoryCalendarDate");
  const clearEnd = appSource.indexOf("\n\n  async function setTaskHistoryNotDue", clearStart);
  const clear = appSource.slice(clearStart, clearEnd);
  const flowStart = appSource.indexOf("const taskHistoryFlow");
  const flowEnd = appSource.indexOf("\n  function togglePinnedFilter", flowStart);
  const flow = appSource.slice(flowStart, flowEnd);

  assert.match(clear, /onCanonicalTaskCommitted: \(nextTask\) => \{\s*committedTask = nextTask;/);
  assert.match(clear, /return \{ history: refreshedHistory\.history, task: committedTask \};/);
  assert.doesNotMatch(flow, /clearReplaceableOutcome/);
  assert.match(flow, /historySnapshot: taskHistoryByTaskId\[taskHistoryModalTaskId\] \?\? \[\]/);
  assert.match(flow, /currentTask,\s*onTaskCommitted: \(nextTask\) => \{\s*currentTask = nextTask;/);
});

test("Task History modal passes active Calendar overrides into the Calendar read bridge", () => {
  assert.match(appSource, /calendarOverrides: taskCalendarOverridesByTaskId\[taskHistoryModalTaskId\] \?\? \[\]/);
  assert.match(modalSource, /calendarOverrides,/);
  assert.match(calendarAuthoritySource, /calendarOverrides: input\.calendarOverrides/);
});

test("Task Status History uses the supplied timeline and neutral entry count copy", () => {
  assert.match(modalSource, /buildTaskHistoryRowProjections/);
  assert.match(modalSource, /\{historyRows\.length\} entries/);
  assert.match(modalSource, /Calculated from task timeline/);
  assert.doesNotMatch(modalSource, /\{sortedHistory\.length\} logged/);
});

test("Task Status History merges active Calendar overrides and presents manual Not Due metadata", () => {
  assert.match(modalSource, /buildTaskHistoryRowProjections\(\s*normalizedTaskHistory,[\s\S]*calendarOverrides/);
  assert.match(modalSource, /Manual schedule override/);
  assert.match(modalSource, /Changed to Not Due/);
  assert.match(modalSource, /formatTaskCalendarOverrideChangedLine/);
  assert.match(modalSource, /createdAt/);
  assert.match(modalSource, /key=\{row\.logicalDate\} onClick=\{\(\) => selectDate\(row\.logicalDate\)\}/);
  assert.doesNotMatch(modalSource, /syncTaskHistoryEntries\([^)]*not_due/);
});

test("Task History stats expose current and longest Missed streaks from the effective timeline", () => {
  assert.match(modalSource, /label: "Current Missed Streak"/);
  assert.match(modalSource, /label: "Longest Missed Streak"/);
  assert.match(modalSource, /longestMissedStreak: resolvedStreaks\.longestMissedStreak/);
  assert.match(modalSource, /const resolvedTimelineDays = calendarRead\?\.timeline\?\.days/);
  assert.match(modalSource, /computeTaskEffectiveTimelineStreaks\(resolvedTimelineDays, today\)/);
});

test("parent, Step, Substep, and context-menu History actions preserve their row IDs", () => {
  assert.match(tableSource, /onOpenTaskHistory\(task\.id\)/);
  assert.equal((tableSource.match(/onOpenTaskHistory\(item\.id\)/g) ?? []).length, 2);
  assert.match(tableSource, /onOpenTaskHistory\(rowContextMenuTask\.id\)/);
  assert.match(listSource, /tableProps\.onOpenTaskHistory\?\.\(task\.id\)/);
  assert.match(listSource, /tableProps\.onOpenTaskHistory\?\.\(rowContextMenuTask\.id\)/);
});

test("History modal keeps one full-size shell and overlays loading, saving, and errors", () => {
  assert.match(appSource, /taskHistory: taskHistoryByTaskId\[taskHistoryModalTaskId\] \?\? \[\]/);
  assert.match(appSource, /taskHistoryLoadStatus: taskHistoryLoadStateByTaskId\[taskHistoryModalTaskId\]\?\.status \?\? "loading"/);
  assert.match(appSource, /onRetryTaskHistoryLoad: \(\) => retryTaskHistoryForTask\(taskHistoryModalTaskId\)/);
  assert.equal((taskHistoryModalSource.match(/<ModalShell/g) ?? []).length, 1);
  assert.match(taskHistoryModalSource, /className="flex h-\[100dvh\] w-full max-w-6xl/);
  assert.doesNotMatch(taskHistoryModalSource, /max-w-xl/);
  assert.doesNotMatch(taskHistoryModalSource, /if \(taskHistoryLoadStatus !== "ready"\) \{\s*const isLoadError/);
  assert.match(taskHistoryModalSource, /const isHistoryLoading = taskHistoryLoadStatus === "loading"/);
  assert.match(taskHistoryModalSource, /\(isHistoryLoading \|\| isSaving\)/);
  assert.match(taskHistoryModalSource, /pointer-events-auto absolute inset-0 z-40/);
  assert.match(taskHistoryModalSource, /aria-busy="true"/);
  assert.match(taskHistoryModalSource, /isSaving \? "Saving History…" : "Loading History…"/);
  assert.match(taskHistoryModalSource, /const historyLoadErrorPanel = isHistoryLoadError/);
  assert.match(taskHistoryModalSource, /Retry History/);
  assert.match(taskHistoryModalSource, /for \(const dateKey of targetDates\)/);
});

test("full History readiness is cached per authenticated task and mutations update the loaded cache", () => {
  assert.match(workspaceSource, /taskHistoryByTaskId/);
  assert.match(workspaceSource, /taskHistoryLoadStateByTaskId/);
  assert.match(workspaceSource, /taskHistoryTaskLoadPromisesRef/);
  assert.match(workspaceSource, /if \(!force && taskHistoryLoadStateByTaskIdRef\.current\[taskId\]\?\.status === "ready"\)/);
  assert.match(workspaceSource, /clearTaskHistoryTaskCache\(\)/);
  assert.match(workspaceSource, /updateTaskHistoryForTask/);
  assert.match(workspaceSource, /deduplicateTaskHistoryByLogicalDate/);
  assert.match(workspaceSource, /fetchAllPagedRows<CanonicalTaskHistoryFact>/);
  assert.match(workspaceSource, /loadTaskHistoryForTask\(taskId, \{ force: true, silent: true \}\)/);
  assert.doesNotMatch(workspaceSource, /setTaskHistoryCacheForTask\(taskId, nextTaskHistory\)/);
  assert.match(workspaceSource, /\.eq\("entity_id", taskId\)/);
  assert.doesNotMatch(workspaceSource, /loadTaskHistory\(\{ silent: true, source: "secondary" \}\).*taskId/);
});
