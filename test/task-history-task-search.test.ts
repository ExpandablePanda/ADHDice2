import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { filterTaskHistorySearchTasks } from "../src/components/task-app/task-view-adapters.tsx";
import { createTask } from "../src/lib/task-buckets.ts";

const modalSource = readFileSync(new URL("../src/components/task-app/task-view-adapters.tsx", import.meta.url), "utf8");
const modal = modalSource.slice(modalSource.indexOf("export function TaskHistoryModal"), modalSource.indexOf("\nexport function BottomDockAdapter"));
const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const openHandler = appSource.slice(appSource.indexOf("function openTaskHistoryForTask"), appSource.indexOf("\n  function openBatchDeleteModal", appSource.indexOf("function openTaskHistoryForTask")));
const flowStart = appSource.indexOf("const taskHistoryFlow");
const flow = appSource.slice(flowStart, appSource.indexOf("\n  function togglePinnedFilter", flowStart));
const editFlowsSource = readFileSync(new URL("../src/components/task-app/task-edit-flows.tsx", import.meta.url), "utf8");

function task(id: string, title: string, extra: Parameters<typeof createTask>[0] = {}) {
  return createTask({
    created_at: "2026-10-04T12:00:00.000Z",
    id,
    sort_order: 0,
    status: "pending",
    title,
    ...extra,
  });
}

test("Task History exposes a compact local Task search and preserves the editable title", () => {
  assert.match(modal, /placeholder="Search another task…"/);
  assert.match(modal, /<EditableEntityHeaderTitle aria-label="Task title"/);
  assert.match(modal, /taskCandidates\?: readonly Task\[\]/);
  assert.match(modal, /onSelectTask\?: \(taskId: string\) => void/);
});

test("Task History search filters loaded Task titles case-insensitively and excludes permanently deleted rows", () => {
  const results = filterTaskHistorySearchTasks({
    currentTaskId: "current",
    query: "  PLAN  ",
    tasks: [
      task("current", "Current Plan"),
      task("one", "Weekly Planning"),
      task("two", "weekly planning"),
      task("deleted", "Deleted Plan", { permanently_deleted_at: "2026-10-04T12:00:00.000Z" }),
    ],
  });

  assert.deepEqual(results.map(({ task: resultTask }) => resultTask.id), ["one", "two"]);
  assert.equal(results[0]?.task.title, "Weekly Planning");
  assert.match(results[0]?.context ?? "", /Open/);
});

test("duplicate Task titles retain distinct IDs and selection calls the explicit ID callback", () => {
  const duplicateResults = filterTaskHistorySearchTasks({
    currentTaskId: "current",
    query: "same",
    tasks: [task("current", "Current"), task("first", "Same title"), task("second", "Same title")],
  });

  assert.deepEqual(duplicateResults.map(({ task: resultTask }) => resultTask.id), ["first", "second"]);
  assert.match(modal, /onClick=\{\(\) => selectTask\(resultTask\.id\)\}/);
  assert.match(modal, /setTaskSearchQuery\(""\)/);
  assert.match(modal, /onSelectTask\(taskId\)/);
});

test("selecting a Task starts the existing bounded History and Calendar reads without changing the page", () => {
  assert.match(openHandler, /setTaskHistoryModalTaskId\(taskId\)/);
  assert.match(openHandler, /setTaskHistoryModalLoadingTaskId\(taskId\)/);
  assert.match(openHandler, /Promise\.allSettled\(\[/);
  assert.match(openHandler, /loadTaskHistoryDetailWindow\(taskId, \{ range, source: "open" \}\)/);
  assert.match(openHandler, /loadTaskCalendarOverridesForTask\(taskId, range\)/);
  assert.doesNotMatch(openHandler, /setActivePage/);
  assert.match(flow, /onSelectTask: openTaskHistoryForTask/);
  assert.match(flow, /taskCandidates: tasks/);
  assert.match(flow, /taskHistoryModalLoadingTaskId === taskHistoryModalTaskId/);
});

test("Task identity remount resets Task-local modal state and loading masks stale Calendar content", () => {
  assert.match(editFlowsSource, /<TaskHistoryModal key=\{taskHistoryFlow\.task\.id\}/);
  assert.match(modal, /const \[selectedDate, setSelectedDate\] = useState\(initialSelectedDate\)/);
  assert.match(modal, /const \[selectedDates, setSelectedDates\] = useState<string\[\]>\(\[initialSelectedDate\]\)/);
  assert.match(modal, /const \[displayedMonth, setDisplayedMonth\] = useState<TaskCalendarMonth>\(\(\) => getTaskCalendarMonth/);
  assert.match(modal, /const \[taskTitleDraft, setTaskTitleDraft\] = useState\(taskTitle\)/);
  assert.match(modal, /const \[isMultiSelect, setIsMultiSelect\] = useState\(false\)/);
  assert.match(modal, /const \[showDelayEditor, setShowDelayEditor\] = useState\(false\)/);
  assert.match(modal, /const \[isSaving, setIsSaving\] = useState\(false\)/);
  assert.match(modal, /\(isHistoryLoading \|\| isSaving\)/);
  assert.match(modal, /taskHistoryModalIsLoading/);
  assert.match(modal, /aria-busy="true"/);
});

test("global Calendar remains one shared TaskHistoryModal host for Home and Tasks", () => {
  assert.equal((editFlowsSource.match(/<TaskHistoryModal\b/g) ?? []).length, 1);
  assert.match(appSource, /taskHistoryFlow=\{taskHistoryFlow\}/);
  assert.match(appSource, /taskHistoryFlow=\{null\}/);
  assert.doesNotMatch(flow, /setSharedTaskEditorOverlayTaskId|setActivePage/);
});
