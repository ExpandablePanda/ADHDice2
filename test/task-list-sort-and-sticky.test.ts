import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { getTableHierarchyTitleGeometry, TaskManagementTableV2, type PrototypeTaskRow } from "../src/components/ui/task-management-table-v2.tsx";
import { buildChildTaskPreviewLookup } from "../src/lib/task-app-derived.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import type { Task, TaskHistory, TaskStatus } from "../src/lib/database.types.ts";
import {
  DEFAULT_LIST_SORT_PREFERENCE,
  getListSortSurfaceId,
  normalizeListSortBySurface,
  normalizeListSortPreference,
  sortListParentTasks,
  type ListSortField,
} from "../src/lib/task-list-sort.ts";
import { migrateLegacyTaskUiState } from "../src/lib/task-ui-state.ts";
import { shouldExpandAllTaskHierarchies } from "../src/lib/task-hierarchy-expansion.ts";

function task(id: string, overrides: Partial<Task> = {}) {
  return createTask({
    created_at: "2026-07-19T12:00:00.000Z",
    id,
    sort_order: 0,
    status: "pending",
    title: id,
    ...overrides,
  });
}

function history(taskId: string, entryDate: string, status: TaskStatus = "done"): TaskHistory {
  return {
    counted_as_due_occurrence: true,
    created_at: `${entryDate}T12:00:00.000Z`,
    entry_date: entryDate,
    event_type: "status",
    id: `${taskId}-${entryDate}`,
    occurrence_due_on: entryDate,
    occurrence_key: entryDate,
    status,
    task_id: taskId,
    updated_at: `${entryDate}T12:00:00.000Z`,
    user_id: "test-user",
    was_completed: status === "done",
  };
}

test("List sort preference and versioned per-surface state normalize safely", () => {
  assert.deepEqual(normalizeListSortPreference(null), DEFAULT_LIST_SORT_PREFERENCE);
  assert.deepEqual(normalizeListSortPreference({ field: "obsolete", direction: "sideways" }), DEFAULT_LIST_SORT_PREFERENCE);
  assert.deepEqual(normalizeListSortPreference({ field: "manual", direction: "desc" }), DEFAULT_LIST_SORT_PREFERENCE);

  const listId = getListSortSurfaceId("tasks", "custom-list");
  const smartListId = getListSortSurfaceId("tasks", "today");
  const normalized = normalizeListSortBySurface({
    [listId]: { field: "title", direction: "desc" },
    [smartListId]: { field: "due_date", direction: "asc" },
    broken: { field: "old", direction: "desc" },
  });
  assert.deepEqual(normalized[listId], { field: "title", direction: "desc" });
  assert.deepEqual(normalized[smartListId], { field: "due_date", direction: "asc" });
  assert.deepEqual(normalized.broken, DEFAULT_LIST_SORT_PREFERENCE);
  assert.deepEqual(migrateLegacyTaskUiState({ listSortBySurface: normalized }).listSortBySurface, normalized);
});

test("List sorting preserves Manual order and sorts the filtered parent projection by every approved field", () => {
  const tasks = [
    task("beta", { created_at: "2026-07-19T13:00:00.000Z", due_on: "2026-07-22", estimated_minutes: 30, priority_level: 4, repeat_frequency: "daily", status: "delayed", title: "Beta", updated_at: "2026-07-19T13:00:00.000Z" }),
    task("alpha", { created_at: "2026-07-19T11:00:00.000Z", due_on: "2026-07-20", estimated_minutes: 10, priority_level: 1, status: "pending", title: "Alpha", updated_at: "2026-07-19T11:00:00.000Z" }),
    task("gamma", { created_at: "2026-07-19T12:00:00.000Z", due_on: "2026-07-21", estimated_minutes: 20, priority_level: 3, status: "missed", title: "Gamma", updated_at: "2026-07-19T12:00:00.000Z" }),
  ];
  const taskHistoryByTaskId = {
    alpha: [history("alpha", "2026-07-18")],
    beta: [history("beta", "2026-07-17"), history("beta", "2026-07-18")],
    gamma: [],
  };
  const ids = (field: ListSortField, direction: "asc" | "desc" = "asc") => sortListParentTasks(tasks, { field, direction }, {
    taskHistoryByTaskId,
    taskHistoryStreakSummaryByTaskId: {
      alpha: { currentStreak: 1, lastDoneAt: "2026-07-18T12:00:00.000Z", lastDoneDate: "2026-07-18", lastHandledAt: null, lastHandledDate: null, missedStreak: 0 },
      beta: { currentStreak: 2, lastDoneAt: "2026-07-18T12:00:00.000Z", lastDoneDate: "2026-07-18", lastHandledAt: null, lastHandledDate: null, missedStreak: 0 },
      gamma: { currentStreak: 0, lastDoneAt: null, lastDoneDate: null, lastHandledAt: null, lastHandledDate: null, missedStreak: 0 },
    },
    todayDateKey: "2026-07-19",
  }).map((entry) => entry.id);

  assert.deepEqual(ids("manual", "desc"), ["beta", "alpha", "gamma"]);
  assert.deepEqual(ids("due_date"), ["alpha", "gamma", "beta"]);
  assert.deepEqual(ids("due_date", "desc"), ["beta", "gamma", "alpha"]);
  assert.deepEqual(ids("status"), ["alpha", "gamma", "beta"]);
  assert.deepEqual(ids("priority"), ["alpha", "gamma", "beta"]);
  assert.deepEqual(ids("title"), ["alpha", "beta", "gamma"]);
  assert.deepEqual(ids("recently_added"), ["alpha", "gamma", "beta"]);
  assert.deepEqual(ids("recently_added", "desc"), ["beta", "gamma", "alpha"]);
  assert.deepEqual(ids("recently_updated"), ["alpha", "gamma", "beta"]);
  assert.deepEqual(ids("streak"), ["gamma", "alpha", "beta"]);
  assert.deepEqual(ids("estimated_duration"), ["alpha", "gamma", "beta"]);

  const noDate = task("no-date");
  assert.deepEqual(sortListParentTasks([noDate, ...tasks], { field: "due_date", direction: "desc" }).at(-1)?.id, "no-date");

  const filteredBeforeSort = tasks.filter((entry) => entry.id !== "alpha");
  assert.deepEqual(sortListParentTasks(filteredBeforeSort, { field: "title", direction: "asc" }).map((entry) => entry.id), ["beta", "gamma"]);
});

test("parent sorting leaves descendant hierarchy and sibling order attached to its parent", () => {
  const parentA = task("parent-a", { created_at: "2026-07-19T13:00:00.000Z", sort_order: 2, title: "Zulu" });
  const parentB = task("parent-b", { created_at: "2026-07-19T11:00:00.000Z", sort_order: 1, title: "Alpha" });
  const step2 = task("step-2", { parent_task_id: parentA.id, sort_order: 2 });
  const step1 = task("step-1", { parent_task_id: parentA.id, sort_order: 1 });
  const substep = task("substep", { parent_task_id: step1.id, sort_order: 1 });
  const preview = buildChildTaskPreviewLookup([parentA, parentB, step2, step1, substep]);

  assert.deepEqual(sortListParentTasks([parentA, parentB], { field: "title", direction: "asc" }).map((entry) => entry.id), ["parent-b", "parent-a"]);
  assert.deepEqual(sortListParentTasks([parentA, parentB], { field: "recently_added", direction: "desc" }).map((entry) => entry.id), ["parent-a", "parent-b"]);
  assert.deepEqual(preview[parentA.id].items.map((entry) => entry.id), ["step-1", "substep", "step-2"]);
  assert.equal(preview[parentA.id].items.every((entry) => entry.parentTaskId !== null), true);
});

test("List and Table sticky hierarchy source contracts preserve real rows and scroll/grid behavior", () => {
  const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
  const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
  const globalStyles = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

  assert.match(listSource, /data-task-list-hierarchy-group=\{task\.id\}/);
  assert.match(listSource, /<article[\s\S]*data-task-list-row=\{task\.id\}/);
  assert.match(listSource, /hasVisibleRenderedDescendants \? "sticky top-\[4\.75rem\] z-10 bg-white dark:bg-\[#181226\]"/);
  assert.match(listSource, /isExpanded=\{isStepSectionExpanded\}/);
  const listHierarchySource = listSource.slice(listSource.indexOf("data-task-list-hierarchy-group={task.id}"));
  assert.ok(listHierarchySource.indexOf("</article>") < listHierarchySource.indexOf("<StepsCardPreview"));
  assert.doesNotMatch(listSource, /data-task-list-row=\{task\.id\}[\s\S]{0,300}draggable/);
  assert.match(globalStyles, /body \{\s*overflow-x: clip;/);

  assert.match(tableSource, /data-task-table-hierarchy-group=\{task\.id\}/);
  assert.match(tableSource, /hasRenderedDescendants \? "sticky top-8 z-10 bg-white/);
  assert.match(tableSource, /style=\{\{ gridTemplateColumns \}\}/);
  assert.match(tableSource, /adhdice-scrollbar relative min-h-\[min\(28rem,65vh\)\] max-h-\[65vh\] overflow-x-auto overflow-y-auto/);
  assert.match(tableSource, /<div className="min-w-max space-y-1\.5 pb-2">/);
  assert.equal((tableSource.match(/data-task-table-row=\{task\.id\}/g) ?? []).length, 1);
  assert.match(tableSource, /onToggleTaskSelection/);
  assert.match(tableSource, /openRowContextMenu/);
  assert.match(tableSource, /renderInlineActionRow\(task\)/);
});

test("an open parent editor keeps normal Step clicks in the same metadata target", () => {
  const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
  const openTaskSource = tableSource.slice(
    tableSource.indexOf("function openTaskInCurrentEditor"),
    tableSource.indexOf("function openTableStepActions"),
  );

  assert.match(openTaskSource, /selectedTaskId && overlayMode === "full" && childTaskParentInfoByTaskId\.has\(taskId\)/);
  assert.match(openTaskSource, /revealChildTaskInParentEditor\(taskId\)/);
  assert.ok(openTaskSource.indexOf("revealChildTaskInParentEditor(taskId)") < openTaskSource.indexOf("onOpenTaskEditor(taskId)"));
  assert.match(tableSource, /data-same-table-step-row=\{item\.id\}[\s\S]*?onClick=\{canSelectChildTask/);
  assert.match(tableSource, /if \(isStepTitleEditTarget\(event\.target\)\) \{\s*return;/);
});

test("Table renders the active same-table QA hierarchy on a plain descendant plane with depth-only title geometry", () => {
  const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
  const parentTask = task("qa-parent", { title: "Prepare the Task Views QA release" });
  const stepTask = task("qa-step", { parent_task_id: parentTask.id, title: "Check sticky parent geometry" });
  const substepTask = task("qa-substep", { parent_task_id: stepTask.id, title: "Scroll through the final descendant" });
  const childTaskPreviewByParentTaskId = buildChildTaskPreviewLookup([parentTask, stepTask, substepTask]);
  const parentRow: PrototypeTaskRow = {
    actualSeconds: 0, completedAt: null, createdAt: parentTask.created_at, currentStreak: 0, dueOn: "", dueTime: "", energy: "medium",
    estimatedMinutes: 20, id: parentTask.id, lastDoneAt: null, lastDoneDate: null, lastHandledAt: null, lastHandledDate: null, linkLabel: "", linkUrl: "", linkedNotes: [], lists: [],
    missedStreak: 0, notes: "", pinOrder: null, pinnedAt: null, priorities: ["3"], repeat: "none", repeatDayOfMonth: null,
    repeatDaysOfWeek: [], repeatInterval: 1, repeatMonthlyMode: "day_of_month", repeatMonthlyOrdinal: null, repeatMonthlyWeekday: null,
    status: "pending", subtasks: [], subtasksAutoReset: false, tags: [], title: parentTask.title, trashedAt: null, updatedAt: parentTask.updated_at,
  };
  const renderHierarchy = (selectedTaskIds: string[] = []) => renderToStaticMarkup(createElement(TaskManagementTableV2, {
    allowInlineInspector: true,
    childTaskPreviewByParentTaskId,
    rows: [parentRow],
    searchMatchedStepParentTaskIds: [parentTask.id],
    searchMatchedChildTaskIds: [stepTask.id, substepTask.id],
    selectedTaskIds,
    showHeader: false,
    visibleColumns: ["due"],
  }));
  const markup = renderHierarchy();
  const selectedMarkup = renderHierarchy([stepTask.id]);
  const groupTag = markup.match(/<div class="([^"]*)" data-task-table-hierarchy-group="qa-parent"/)?.[1] ?? "";
  const continuationTag = markup.match(/<div class="([^"]*)" data-task-table-step-mini-rows="qa-parent"/)?.[1] ?? "";
  const childGridTag = markup.match(/class="([^"]*)" data-task-table-child-grid="qa-step"/)?.[1] ?? "";
  const selectedChildGridTag = selectedMarkup.match(/class="([^"]*)" data-task-table-child-grid="qa-step"/)?.[1] ?? "";
  const parentRowTag = markup.match(/class="([^"]*)" data-task-table-row="qa-parent"/)?.[1] ?? "";
  const parentGridStyle = markup.match(/data-task-table-parent-grid="qa-parent" style="([^"]*)"/)?.[1] ?? "";
  const childGridStyles = [...markup.matchAll(/data-task-table-child-grid="qa-(?:step|substep)"[^>]*style="([^"]*)"/g)].map((match) => match[1]);
  const stepGeometry = getTableHierarchyTitleGeometry(1);
  const substepGeometry = getTableHierarchyTitleGeometry(2);

  assert.match(markup, /data-task-table-step-mini-rows="qa-parent"/);
  assert.match(markup, /data-same-table-step-row="qa-step"/);
  assert.match(markup, /data-same-table-step-row="qa-substep"/);
  assert.match(groupTag, /bg-white dark:bg-\[#181226\]/);
  assert.match(continuationTag, /bg-white dark:bg-\[#181226\]/);
  assert.doesNotMatch(`${groupTag} ${continuationTag}`, /dark:bg-\[#140f26\]|gradient/);
  assert.match(markup, /data-task-table-row="qa-parent"/);
  assert.doesNotMatch(tableSource, /sticky top-8 z-10 bg-white shadow-\[0_8px_18px/);
  assert.match(childGridTag, /border-transparent bg-transparent dark:bg-transparent/);
  assert.match(childGridTag, /hover:(?:bg-\[#fbfaff\]|shadow-\[)/);
  assert.doesNotMatch(childGridTag, /bg-gradient|linear-gradient/);
  assert.ok(stepGeometry.titleContentOffsetPx > stepGeometry.parentTitleContentOffsetPx);
  assert.ok(substepGeometry.titleContentOffsetPx > stepGeometry.titleContentOffsetPx);
  assert.match(markup, new RegExp(`data-task-title-content-offset="${stepGeometry.titleContentOffsetPx}"`));
  assert.match(markup, new RegExp(`data-task-title-content-offset="${substepGeometry.titleContentOffsetPx}"`));
  assert.equal(childGridStyles.length, 2);
  assert.equal(childGridStyles.every((style) => style === parentGridStyle), true);
  assert.match(markup, /data-task-table-child-cell="qa-step:due"/);
  assert.match(selectedChildGridTag, /bg-\[#f7f2ff\] dark:bg-\[#201733\]/);
  assert.match(markup, /data-step-title-edit="qa-step"/);
  assert.match(tableSource, /TaskTitleDraftInput[\s\S]*bg-white[\s\S]*dark:bg-\[#22193f\]/);
  assert.match(parentRowTag, /sticky top-8 z-10/);
});

test("List Sort uses the approved dropdown in the filter rail after Duplicates", () => {
  const filterSource = readFileSync(new URL("../src/components/task-app/task-filter-rows.tsx", import.meta.url), "utf8");
  const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
  const compactRail = filterSource.slice(filterSource.indexOf("{compact ? ("), filterSource.indexOf(") : (", filterSource.indexOf("{compact ? (")));
  assert.doesNotMatch(listSource, /aria-label="Sort List View"/);
  assert.match(filterSource, /<AdhdDropdownPanel/);
  assert.match(filterSource, /createPortal/);
  assert.doesNotMatch(filterSource, /\bCheck\b/);
  assert.doesNotMatch(filterSource, /inline-flex h-3\.5 w-3\.5 items-center justify-center/);
  assert.match(filterSource, /className="w-full justify-start text-left"/);
  assert.match(filterSource, /toneClassName=\{preference\.field === option\.value \? FILTER_ACTIVE_CHIP_CLASS : FILTER_LABEL_CHIP_CLASS\}/);
  assert.ok(compactRail.indexOf("Duplicates") < compactRail.indexOf("<ListSortFilterControls"));
  assert.ok(compactRail.indexOf("<ListSortFilterControls") < compactRail.indexOf("TASK_FILTER_STATUS_OPTIONS.map"));
  for (const field of ["manual", "due_date", "status", "priority", "title", "recently_updated", "streak", "estimated_duration"]) {
    assert.match(filterSource, new RegExp(`value: "${field}"`));
  }
  for (const label of ["Manual", "Due date", "Status", "Priority", "Title", "Recently updated", "Streak", "Estimated duration"]) {
    assert.match(filterSource, new RegExp(`label: "${label}"`));
  }
  assert.match(filterSource, /preference\.direction === "asc" \? "desc" : "asc"/);
  assert.match(filterSource, /event\.key === "Escape"/);
  assert.match(filterSource, /document\.addEventListener\("pointerdown"/);
});

test("shared hierarchy hold intent expands when any rendered parent is collapsed and collapses when all are expanded", () => {
  assert.equal(shouldExpandAllTaskHierarchies([{ expanded: true, taskId: "a" }, { expanded: false, taskId: "b" }]), true);
  assert.equal(shouldExpandAllTaskHierarchies([{ expanded: true, taskId: "a" }, { expanded: true, taskId: "b" }]), false);
  const buttonSource = readFileSync(new URL("../src/components/task-app/task-hierarchy-chevron-button.tsx", import.meta.url), "utf8");
  const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
  const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
  assert.match(buttonSource, /Click to toggle this Task\. Hold to toggle all Steps in this view\./);
  assert.match(buttonSource, /suppressClickRef\.current = true/);
  assert.match(buttonSource, /Math\.hypot/);
  assert.match(buttonSource, /onPointerCancel/);
  assert.match(listSource, /onToggleAllExpanded=\{toggleAllRenderedStepSections\}/);
  assert.match(tableSource, /onToggleAll=\{toggleAllRenderedTaskHierarchies\}/);
});
