import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { Milestone, TaskHistory } from "../src/lib/database.types.ts";
import { computeTaskAppDerivedData } from "../src/lib/task-app-derived.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import { getBuiltInTaskLists } from "../src/lib/task-lists.ts";
import {
  buildMilestoneLookups,
  formatMilestoneDisplayDate,
  shouldReverseCompletedMilestoneForStatusChange,
} from "../src/lib/milestones/index.ts";
import { DEFAULT_TASK_UI_STATE } from "../src/lib/task-ui-state.ts";

const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");

function milestone(taskId: string | null, status: Milestone["status"], tier: Milestone["current_tier"] = "gold", trashedAt: string | null = null) {
  return { id: `m-${taskId ?? "deleted"}`, task_id: taskId, status, current_tier: tier, task_trashed_at: trashedAt, revision: 1, updated_at: "2026-07-16T12:00:00Z" } as Milestone;
}

function qaTask(input: Parameters<typeof createTask>[0]) {
  return createTask({ created_at: "2026-07-16T12:00:00Z", sort_order: 0, ...input });
}

function derive(tasks: ReturnType<typeof createTask>[], milestones: Milestone[], query = "") {
  const lookups = buildMilestoneLookups(milestones);
  const history: Record<string, TaskHistory[]> = {};
  return computeTaskAppDerivedData({
    activePage: "Tasks",
    availableTaskLists: getBuiltInTaskLists(),
    availableTaskNotes: [],
    bucketContext: { focusedTaskIds: new Set(), routing: {} },
    deferredSearchQuery: query,
    focusedTaskIds: [],
    listColumnPickerOrder: [],
    listVisibleColumns: [],
    milestoneSearchTokensByTaskId: lookups.milestoneSearchTokensByTaskId,
    milestoneTaskIds: lookups.milestoneTaskIds,
    taskGridLayout: [],
    taskGridWidgetTypes: [],
    taskHistoryByTaskId: history,
    taskListEvaluationContext: {
      activeMilestoneTaskIds: lookups.activeMilestoneTaskIds,
      milestoneTaskIds: lookups.milestoneTaskIds,
      currentStreakByTaskId: {},
      focusedTaskIds: new Set(),
      hasStepsByTaskId: {},
      historyFactsByTaskId: {},
      isDueToday: () => false,
      isDueTomorrow: () => false,
      isLater: () => false,
      isOpen: (task) => task.status !== "complete" && task.status !== "archived" && task.status !== "trashed",
      isOverdue: () => false,
      manualMembershipsByTaskId: {},
      taskHistoryByTaskId: history,
      todayDateKey: "2026-07-16",
    },
    taskSubtasksByTaskId: {},
    taskUiState: DEFAULT_TASK_UI_STATE,
    todayDateKey: "2026-07-16",
    tasks,
  });
}

test("Milestone visible dates use M-D-YY without shifting date-only values", () => {
  assert.equal(formatMilestoneDisplayDate("2026-07-16"), "7-16-26");
  assert.equal(formatMilestoneDisplayDate("2026-12-03"), "12-3-26");
  assert.equal(formatMilestoneDisplayDate("2026-01-01"), "1-1-26");
});

test("Milestone lookups drive active/completed indicators and exclude abandoned, trashed, and deleted identities", () => {
  const lookups = buildMilestoneLookups([
    milestone("active", "active", "gold"),
    milestone("completed", "completed", "silver"),
    milestone("abandoned", "abandoned", "platinum"),
    milestone("trashed", "active", "bronze", "2026-07-16T12:00:00Z"),
    milestone(null, "completed", "gold"),
  ]);
  assert.deepEqual([...lookups.milestoneTaskIds], ["active", "completed"]);
  assert.deepEqual(lookups.milestoneSearchTokensByTaskId.get("completed"), ["milestone", "milestones", "silver"]);
});

test("Milestone search tokens and Smart List include active/completed task rows only", () => {
  const tasks = [
    qaTask({ id: "active", title: "Alpha", status: "pending" }),
    qaTask({ id: "completed", title: "Beta", status: "complete" }),
    qaTask({ id: "abandoned", title: "Gamma", status: "pending" }),
    qaTask({ id: "ordinary-complete", title: "Delta", status: "complete" }),
    qaTask({ id: "trashed", title: "Epsilon", status: "trashed", trashed_at: "2026-07-16T12:00:00Z" }),
  ];
  const milestones = [milestone("active", "active", "gold"), milestone("completed", "completed", "silver"), milestone("abandoned", "abandoned"), milestone("trashed", "active", "bronze", "2026-07-16T12:00:00Z")];
  assert.deepEqual(derive(tasks, milestones, "milestone").milestoneFilteredTasksSorted.map((task) => task.id), ["active", "completed"]);
  assert.deepEqual(derive(tasks, milestones, "milestones").milestoneFilteredTasksSorted.map((task) => task.id), ["active", "completed"]);
  assert.deepEqual(derive(tasks, milestones, "silver").milestoneFilteredTasksSorted.map((task) => task.id), ["completed"]);
  assert.deepEqual(derive(tasks, milestones).filteredTasksSorted.map((task) => task.id).includes("ordinary-complete"), false);
});

test("full inspector bounds sticky columns before the full-width extension", () => {
  assert.match(tableSource, /data-full-inspector-columns="true"[\s\S]*<div className=\{fullEditorCardClass\}>[\s\S]*<section className=\{fullMetadataCardClass\}>/);
  assert.match(tableSource, /<\/section>\s*<\/div>\s*\{renderFullInspectorExtension[\s\S]*data-full-inspector-extension-region="true"/);
  assert.doesNotMatch(tableSource, /data-full-inspector-extension-region="true"[^>]*lg:col-span-2|lg:col-span-2[^>]*data-full-inspector-extension-region="true"/);
  assert.match(tableSource, /lg:grid-cols-\[minmax\(0,1\.05fr\)_minmax\(0,0\.95fr\)\]/);
  assert.match(tableSource, /: "min-w-0 max-w-full rounded-\[1\.25rem\][^"]+";[\s\S]*: "min-w-0 max-w-full rounded-\[1\.25rem\][^"]+lg:sticky/);
  assert.match(tableSource, /overflow-x-hidden overflow-y-auto px-5/);
  assert.match(tableSource, /useMobileFullOverlay\s*\? "grid min-w-0 gap-3"/);
});

test("desktop full inspector uses wider responsive bounds and viewport-safe scrolling", () => {
  assert.match(tableSource, /const fullDesktopEditorNode = \(\s*<div className="min-w-0 w-full max-w-\[80rem\] min-h-\[calc\(100dvh-4rem\)\] max-h-\[calc\(100dvh-2rem\)\] overflow-y-auto overscroll-contain rounded-\[2rem\] bg-transparent"/);
  assert.match(tableSource, /fullDesktopEditorNode = \(\s*<div[\s\S]*<div className="p-4">\s*\{fullDesktopEditorContent\}/);
  assert.match(tableSource, /overlayMode === "full" \? "left-1\/2 max-w-\[80rem\] -translate-x-1\/2"/);
  assert.match(tableSource, /: "grid min-w-0 min-h-\[70vh\] gap-3 lg:grid-cols-\[minmax\(0,1\.05fr\)_minmax\(0,0\.95fr\)\]"/);
  assert.match(tableSource, /fullMetadataCardClass[\s\S]*lg:self-start/);
  assert.match(tableSource, /className="w-full max-w-\[60rem\]"/);
});

test("desktop full inspector uses a continuous glossy overlay without card shadows", () => {
  assert.match(tableSource, /bg-\[linear-gradient\(135deg,rgba\(255,255,255,0\.9\),rgba\(245,240,255,0\.76\)_48%,rgba\(255,255,255,0\.9\)\)\] backdrop-blur-\[18px\]/);
  const desktopEditorCardClasses = tableSource.match(/const fullEditorCardClass = ([\s\S]*?)const fullMetadataCardClass/)?.[1] ?? "";
  const desktopMetadataCardClasses = tableSource.match(/const fullMetadataCardClass = ([\s\S]*?)const titleInputClass/)?.[1] ?? "";
  assert.doesNotMatch(desktopEditorCardClasses, /: "min-w-0 max-w-full[^"\n]*shadow-/);
  assert.doesNotMatch(desktopMetadataCardClasses, /: "min-w-0 max-w-full[^"\n]*shadow-/);
});

test("row renderers expose a compact accessible Milestone trophy indicator", () => {
  for (const source of [tableSource, listSource]) {
    assert.match(source, /aria-label="Milestone"/);
    assert.match(source, /<Trophy aria-hidden="true"/);
  }
});

test("completed Milestone Pending routes to reversal while ordinary status behavior stays generic", () => {
  assert.equal(shouldReverseCompletedMilestoneForStatusChange({ status: "complete" }, { status: "completed" }, "pending"), true);
  assert.equal(shouldReverseCompletedMilestoneForStatusChange({ status: "complete" }, null, "pending"), false);
  assert.equal(shouldReverseCompletedMilestoneForStatusChange({ status: "pending" }, { status: "active" }, "in_progress"), false);
  assert.match(taskAppSource, /shouldReverseCompletedMilestoneForStatusChange[\s\S]*setPendingMilestoneLifecycle\(\{ action: "reverse"/);
  assert.match(taskAppSource, /reverseMilestoneCompletion\(buildMilestoneLifecycleArgs\(task, milestone, operationId\)\)/);
});
