import assert from "node:assert/strict";
import test from "node:test";

import { createTask } from "../src/lib/task-buckets.ts";
import type { Task } from "../src/lib/database.types.ts";
import {
  buildStableCanonicalTaskIndex,
  queryCanonicalTaskEntityProjection,
} from "../src/lib/task-app-derived.ts";
import { getBuiltInTaskLists, type TaskListEvaluationContext } from "../src/lib/task-lists.ts";
import { buildStableTaskSearchScope, queryTaskSearch } from "../src/lib/task-search-selector.ts";
import { DEFAULT_TASK_UI_STATE } from "../src/lib/task-ui-state.ts";
import { formatRepeatFrequencyLabel, getTaskRepeatCategory } from "../src/lib/task-repeat.ts";

const taskListEvaluationContext: TaskListEvaluationContext = {
  currentStreakByTaskId: {},
  focusedTaskIds: new Set(),
  hasStepsByTaskId: {},
  isDueToday: () => false,
  isDueTomorrow: () => false,
  isLater: () => false,
  isOpen: (task) => task.status !== "complete" && task.status !== "archived" && task.status !== "trashed",
  isOverdue: () => false,
  historyFactsByTaskId: {},
  manualMembershipsByTaskId: {},
  taskHistoryByTaskId: {},
  todayDateKey: "2026-08-03",
};

function queryWithRepeatFilter(tasks: ReturnType<typeof createTask>[], repeat: "custom" | "daily" | "daily_until_complete" | "monthly" | "none" | "weekdays" | "weekly") {
  const index = buildStableCanonicalTaskIndex({
    availableTaskLists: getBuiltInTaskLists(),
    focusedTaskIds: [],
    taskHistoryByTaskId: {},
    taskListEvaluationContext,
    taskSubtasksByTaskId: {},
    tasks,
    todayDateKey: "2026-08-03",
  });

  return queryCanonicalTaskEntityProjection({
    index,
    normalizedSearchQuery: "",
    taskUiState: {
      ...DEFAULT_TASK_UI_STATE,
      includeStepsByView: { ...DEFAULT_TASK_UI_STATE.includeStepsByView, table: true },
      selectedBucket: "all",
      tableColumnFilters: { ...DEFAULT_TASK_UI_STATE.tableColumnFilters, repeat: [repeat] },
      view: "table",
    },
  });
}

function task(id: string, overrides: Partial<Task> = {}) {
  return createTask({
    created_at: "2026-08-03T08:00:00.000Z",
    id,
    sort_order: 1,
    status: "pending",
    title: id,
    ...overrides,
  });
}

function querySearchWithRepeatFilter(tasks: ReturnType<typeof createTask>[], repeat: "weekdays" | "weekly") {
  const entities = tasks.map((entry) => ({
    ancestorIds: [],
    displayStatus: entry.status,
    id: entry.id,
    listIds: [],
    rootParentId: entry.id,
    searchDocument: entry.title.toLowerCase(),
    task: entry,
  }));
  const scope = buildStableTaskSearchScope(entities, {
    energyFilters: [],
    focusedTaskIds: [],
    matchAny: true,
    quickFilters: [],
    selectedBucket: "all",
    statusFilters: [],
    tableColumnFilters: { ...DEFAULT_TASK_UI_STATE.tableColumnFilters, repeat: [repeat] },
  });
  return queryTaskSearch("", scope, false);
}

test("canonical Repeat filtering matches the visible Repeat frequency", () => {
  const weekdays = task("weekdays", {
    repeat_frequency: "weekly",
    repeat_days_of_week: [1, 2, 3, 4, 5],
    repeat_interval: 1,
  });
  const weekly = task("weekly", {
    repeat_frequency: "weekly",
    repeat_days_of_week: [1, 3],
    repeat_interval: 1,
  });
  const daily = task("daily", { repeat_frequency: "daily" });
  const dailyUntilComplete = task("daily-until-complete", { repeat_frequency: "daily_until_complete" });
  const monthly = task("monthly", { repeat_frequency: "monthly" });
  const custom = task("custom", { repeat_frequency: "custom" });
  const noRepeat = task("none", { repeat_frequency: "none" });
  const tasks = [weekdays, weekly, daily, dailyUntilComplete, monthly, custom, noRepeat];

  assert.equal(formatRepeatFrequencyLabel(weekdays.repeat_frequency, weekdays.repeat_interval, weekdays.repeat_days_of_week), "Weekdays");
  assert.equal(getTaskRepeatCategory(weekdays.repeat_frequency, weekdays.repeat_days_of_week, weekdays.repeat_interval), "weekdays");
  assert.deepEqual([...queryWithRepeatFilter(tasks, "weekdays").postStatusMatchedEntityIds], [weekdays.id]);
  assert.deepEqual([...queryWithRepeatFilter(tasks, "weekly").postStatusMatchedEntityIds], [weekly.id]);
  assert.deepEqual([...querySearchWithRepeatFilter(tasks, "weekdays").matchingEntityIds], [weekdays.id]);
  assert.deepEqual([...querySearchWithRepeatFilter(tasks, "weekly").matchingEntityIds], [weekly.id]);
  assert.deepEqual([...queryWithRepeatFilter(tasks, "daily").postStatusMatchedEntityIds], [daily.id]);
  assert.deepEqual([...queryWithRepeatFilter(tasks, "daily_until_complete").postStatusMatchedEntityIds], [dailyUntilComplete.id]);
  assert.deepEqual([...queryWithRepeatFilter(tasks, "monthly").postStatusMatchedEntityIds], [monthly.id]);
  assert.deepEqual([...queryWithRepeatFilter(tasks, "custom").postStatusMatchedEntityIds], [custom.id]);
  assert.deepEqual([...queryWithRepeatFilter(tasks, "none").postStatusMatchedEntityIds], [noRepeat.id]);
});

test("ordinary Weekly tasks are not classified as Weekdays", () => {
  assert.equal(getTaskRepeatCategory("weekly", [1, 2, 3, 4, 5, 6], 1), "weekly");
  assert.equal(getTaskRepeatCategory("weekly", [1, 2, 3, 4, 5], 2), "weekly");
  assert.equal(formatRepeatFrequencyLabel("weekly", 1, [1, 3]), "Weekly");
});
