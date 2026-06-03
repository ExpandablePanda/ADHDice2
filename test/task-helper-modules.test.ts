import test from "node:test";
import assert from "node:assert/strict";
import { createTask } from "../src/lib/task-buckets.ts";
import { hasActiveTaskFilters, resetTaskFiltersPreservingView } from "../src/lib/task-filter-state.ts";
import {
  formatDueTimeLabel,
  getListPriorityLabel,
  matchesTaskQuickFilter,
} from "../src/lib/task-cockpit.ts";
import {
  getMomentumMetric,
  getNextMomentumView,
  updateFocusedTaskIdsByDate,
} from "../src/lib/task-momentum.ts";
import {
  buildTaskGridWidget,
  formatDateKey,
  getMissingTaskGridWidgetTypes,
  getSpanFromDisplayRows,
  moveTaskGridItem,
  normalizeTaskGridLayout,
  reorderTaskGridItems,
  shiftDateKey,
} from "../src/lib/task-grid-layout.ts";
import { buildTaskCollections } from "../src/lib/task-selectors.ts";
import { DEFAULT_TASK_UI_STATE } from "../src/lib/task-ui-state.ts";
import { buildTaskListCounts, getBuiltInTaskLists } from "../src/lib/task-lists.ts";

test("filter state helpers detect active filters and preserve key UI state on reset", () => {
  const activeState = {
    ...DEFAULT_TASK_UI_STATE,
    search: "invoice",
    selectedBucket: "later",
    view: "matrix" as const,
  };

  assert.equal(hasActiveTaskFilters(DEFAULT_TASK_UI_STATE), false);
  assert.equal(hasActiveTaskFilters(activeState), true);

  const reset = resetTaskFiltersPreservingView(activeState);
  assert.equal(reset.search, "");
  assert.equal(reset.selectedBucket, "later");
  assert.equal(reset.view, "matrix");
});

test("task selectors build expected filtered collections and list memberships", () => {
  const today = formatDateKey(new Date());
  const openTask = createTask({
    created_at: `${today}T09:00:00.000Z`,
    due_on: today,
    energy: "low",
    id: "task-open",
    sort_order: 1,
    status: "pending",
    title: "Open",
  });
  const doneTask = createTask({
    created_at: `${today}T10:00:00.000Z`,
    id: "task-done",
    sort_order: 2,
    status: "done",
    title: "Done",
  });

  const collections = buildTaskCollections(
    [openTask, doneTask],
    {
      "task-open": [{ id: "inbox" }, { id: "quick_wins" }],
      "task-done": [{ id: "completed" }],
    },
    ["task-open"],
  );

  assert.equal(collections.filteredActiveTasks.length, 1);
  assert.equal(collections.filteredDoneTasks.length, 1);
  assert.equal(collections.filteredFocusTasks.length, 1);
  assert.equal(collections.filteredLowEnergyTasks.length, 1);
  assert.equal(collections.inboxTasks.length, 1);
  assert.equal(collections.quickWinTasks.length, 1);
});

test("momentum helpers cycle view, update day buckets, and compute metrics", () => {
  const today = formatDateKey(new Date());
  const doneFocused = createTask({
    created_at: `${today}T08:00:00.000Z`,
    due_on: today,
    id: "task-focus-done",
    sort_order: 1,
    status: "done",
    title: "Focused done",
  });
  const openFocused = createTask({
    created_at: `${today}T09:00:00.000Z`,
    due_on: today,
    id: "task-focus-open",
    sort_order: 2,
    status: "pending",
    title: "Focused open",
  });

  assert.equal(getNextMomentumView("urgent"), "today");
  assert.equal(getNextMomentumView("today"), "focus");
  assert.equal(getNextMomentumView("focus"), "urgent");

  const updated = updateFocusedTaskIdsByDate({}, today, ["task-focus-open"]);
  assert.deepEqual(updated[today], ["task-focus-open"]);

  const metric = getMomentumMetric({
    doneTasks: [doneFocused],
    focusedTaskIds: ["task-focus-done", "task-focus-open"],
    tasks: [doneFocused, openFocused],
    todayTasks: [openFocused],
    urgentTasks: [],
  }, "focus");

  assert.equal(metric.totalCount, 2);
  assert.equal(metric.doneTasks.length, 1);
});

test("cockpit helpers format metadata and evaluate quick filters", () => {
  const today = formatDateKey(new Date());
  const task = createTask({
    created_at: `${today}T07:00:00.000Z`,
    due_on: today,
    id: "task-cockpit",
    is_urgent: true,
    sort_order: 1,
    status: "pending",
    title: "Cockpit",
  });

  assert.equal(formatDueTimeLabel("13:05"), "1:05 PM");
  assert.equal(matchesTaskQuickFilter(task, "today", []), true);
  assert.equal(matchesTaskQuickFilter(task, "urgent", []), true);
  assert.equal(getListPriorityLabel(task, new Set<string>()), "Urgent");
});

test("grid layout helpers normalize, reorder, move, and date utilities behave consistently", () => {
  const isWidgetType = (value: string): value is "urgent" | "import" => value === "urgent" || value === "import";
  const layout = normalizeTaskGridLayout([
    { h: 7, id: "a", type: "urgent", w: 2, x: 0, y: 0 },
    { h: 6, id: "b", type: "import", w: 2, x: 0, y: 0 },
  ], isWidgetType, 4, 24);
  assert.equal(layout.length, 2);
  assert.equal(layout[0]?.x, 0);
  assert.equal(layout[1]?.x, 2);

  const reordered = reorderTaskGridItems(layout, "a", "b", isWidgetType, 4, 24);
  assert.equal(reordered[0]?.id, "b");

  const moved = moveTaskGridItem(reordered, "a", "up", isWidgetType, 4, 24);
  assert.equal(moved[0]?.id, "a");

  const nextWidget = buildTaskGridWidget("urgent", "grid-urgent-id");
  assert.equal(nextWidget.w, 2);
  assert.equal(nextWidget.id, "grid-urgent-id");

  const missing = getMissingTaskGridWidgetTypes(layout, ["urgent", "import"]);
  assert.deepEqual(missing, []);

  assert.equal(getSpanFromDisplayRows(2, 24), 4);
  assert.equal(shiftDateKey("2026-05-20", 1), "2026-05-21");
});

test("task list counts preserve built-in bucket memberships", () => {
  const today = formatDateKey(new Date());
  const inboxTask = createTask({
    created_at: `${today}T08:00:00.000Z`,
    id: "task-inbox",
    sort_order: 1,
    status: "pending",
    title: "Inbox task",
  });
  const todayTask = createTask({
    created_at: `${today}T09:00:00.000Z`,
    due_on: today,
    id: "task-today",
    sort_order: 2,
    status: "pending",
    title: "Today task",
  });

  const counts = buildTaskListCounts([inboxTask, todayTask], getBuiltInTaskLists(), {
    focusedTaskIds: new Set<string>(),
    isDueToday: (date) => date === today,
    isLater: () => false,
    isOpen: (task) => task.status === "pending" || task.status === "in_progress",
    isOverdue: () => false,
    manualMembershipsByTaskId: {},
  });

  assert.equal(counts.inbox, 1);
  assert.equal(counts.today, 1);
});
