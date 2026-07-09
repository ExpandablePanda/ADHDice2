import test from "node:test";
import assert from "node:assert/strict";
import { createTask } from "../src/lib/task-buckets.ts";
import { getBuiltInTaskLists } from "../src/lib/task-lists.ts";
import { generateTaskReport } from "../src/lib/task-report.ts";
import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import type { FocusCategory, HistoricalFocusSession } from "../src/lib/types.ts";

function createHistoryEntry(params: Partial<TaskHistory> & Pick<TaskHistory, "entry_date" | "id" | "status" | "task_id">): TaskHistory {
  return {
    counted_as_due_occurrence: true,
    created_at: `${params.entry_date}T12:00:00.000Z`,
    entry_date: params.entry_date,
    event_type: "status",
    id: params.id,
    status: params.status,
    task_id: params.task_id,
    updated_at: `${params.entry_date}T12:00:00.000Z`,
    user_id: "test-user",
    was_completed: params.status === "done" || params.status === "did_my_best" || params.status === "complete",
    ...params,
  };
}

function createFocusCategory(overrides: Partial<FocusCategory> = {}): FocusCategory {
  return {
    color: "#6f57f6",
    dailyGoalSeconds: 1800,
    focusSubtype: null,
    focusSubtype2: null,
    focusType: "Work",
    icon: "brain",
    id: "focus-category-1",
    title: "Coding",
    weeklyGoalSeconds: 7200,
    ...overrides,
  };
}

function createFocusSession(overrides: Partial<HistoricalFocusSession> = {}): HistoricalFocusSession {
  return {
    categoryId: "focus-category-1",
    createdAt: "2026-06-30T12:00:00.000Z",
    date: "2026-06-30",
    durationSeconds: 1500,
    focusSubtype: "Deep Work",
    focusSubtype2: null,
    focusType: "Work",
    id: "focus-session-1",
    notes: "Heads-down sprint",
    title: "Morning sprint",
    ...overrides,
  };
}

test("summary report uses the current overall-stats structure and skips detailed sections", () => {
  const activeTask = createTask({
    created_at: "2026-06-20T09:00:00.000Z",
    id: "parent-summary",
    repeat_frequency: "daily",
    sort_order: 1,
    status: "pending",
    title: "Summary task",
  });
  const trashedTask = createTask({
    created_at: "2026-06-20T09:05:00.000Z",
    id: "trash-summary",
    sort_order: 2,
    status: "trashed",
    title: "Trash task",
    trashed_at: "2026-06-29T10:00:00.000Z",
  });
  const taskHistory = [
    createHistoryEntry({
      entry_date: "2026-06-29",
      id: "summary-done",
      status: "done",
      task_id: "parent-summary",
    }),
  ];

  const report = generateTaskReport({
    appVersion: "6.17.3",
    availableTaskLists: getBuiltInTaskLists(),
    detailLevel: "summary",
    focusCategories: [],
    focusHistory: [],
    generatedAt: new Date("2026-06-30T15:00:00.000Z"),
    historySourceLabel: "Loaded workspace history fallback",
    historyWarning: null,
    rangeId: "last7",
    taskHistory,
    tasks: [activeTask, trashedTask],
    todayDateKey: "2026-06-29",
  });

  assert.match(report, /## Overall Stats/);
  assert.match(report, /History Records Analyzed: 1/);
  assert.match(report, /History Source: Loaded workspace history fallback/);
  assert.match(report, /Active vs Trashed Loaded: 1 active, 1 trashed excluded/);
  assert.match(report, /Current Status Snapshot: Done 1/);
  assert.doesNotMatch(report, /## All Current Task History/);
  assert.doesNotMatch(report, /## Day-by-Day Breakdown/);
});

test("report exports derived legacy urgent priority when priority_level is null", () => {
  const urgentLegacyTask = createTask({
    created_at: "2026-06-20T09:00:00.000Z",
    id: "legacy-urgent",
    is_urgent: true,
    priority_level: null,
    sort_order: 1,
    status: "pending",
    title: "Legacy urgent task",
  });

  const report = generateTaskReport({
    appVersion: "6.24.3",
    availableTaskLists: getBuiltInTaskLists(),
    detailLevel: "detailed",
    focusCategories: [],
    focusHistory: [],
    generatedAt: new Date("2026-06-30T15:00:00.000Z"),
    historySourceLabel: "Loaded workspace history fallback",
    historyWarning: null,
    rangeId: "last7",
    taskHistory: [
      createHistoryEntry({
        entry_date: "2026-06-29",
        id: "legacy-urgent-done",
        status: "done",
        task_id: urgentLegacyTask.id,
      }),
    ],
    tasks: [urgentLegacyTask],
    todayDateKey: "2026-06-30",
  });

  assert.match(report, /Legacy urgent task.*Priority: 5/);
});

test("detailed report uses the shipped detailed sections and current status lines", () => {
  const parentTask = createTask({
    created_at: "2026-06-01T09:00:00.000Z",
    id: "parent-1",
    is_important: true,
    priority: "high",
    repeat_frequency: "daily",
    sort_order: 1,
    status: "pending",
    title: "Morning routine",
  });
  const stepTask = createTask({
    created_at: "2026-06-01T09:05:00.000Z",
    id: "step-1",
    parent_task_id: "parent-1",
    repeat_frequency: "weekly",
    repeat_days_of_week: [1, 3, 5],
    sort_order: 2,
    status: "pending",
    title: "Brush teeth",
  });
  const substepTask = createTask({
    created_at: "2026-06-01T09:10:00.000Z",
    id: "substep-1",
    is_urgent: true,
    parent_task_id: "step-1",
    sort_order: 3,
    status: "pending",
    title: "Floss",
  });
  const repeatedMissTask = createTask({
    created_at: "2026-06-01T10:00:00.000Z",
    id: "miss-repeat",
    repeat_frequency: "daily",
    sort_order: 4,
    status: "missed",
    title: "Stretch",
  });
  const unresolvedDailyUntilComplete = createTask({
    created_at: "2026-06-02T09:00:00.000Z",
    id: "duc-1",
    repeat_frequency: "daily_until_complete",
    sort_order: 5,
    status: "missed",
    title: "Invoice filing",
  });
  const testMissTask = createTask({
    created_at: "2026-06-02T09:30:00.000Z",
    id: "test-miss",
    repeat_frequency: "daily",
    sort_order: 6,
    status: "missed",
    title: "Test inbox thing",
  });
  const trashedMissTask = createTask({
    created_at: "2026-06-02T10:00:00.000Z",
    id: "trash-miss",
    repeat_frequency: "daily",
    sort_order: 7,
    status: "trashed",
    title: "Old trashed task",
    trashed_at: "2026-06-25T12:00:00.000Z",
  });
  const extraMissTasks: Task[] = Array.from({ length: 25 }, (_, index) => createTask({
    created_at: `2026-06-02T${String(index).padStart(2, "0")}:00:00.000Z`,
    id: `miss-cap-${index + 1}`,
    sort_order: 10 + index,
    status: "missed",
    title: `Missed item ${index + 1}`,
  }));
  const tasks = [parentTask, stepTask, substepTask, repeatedMissTask, unresolvedDailyUntilComplete, testMissTask, trashedMissTask, ...extraMissTasks];
  const baseTaskHistory: TaskHistory[] = [
    createHistoryEntry({ entry_date: "2026-06-28", id: "parent-done-1", status: "done", task_id: parentTask.id }),
    createHistoryEntry({ entry_date: "2026-06-29", id: "parent-dmb-1", status: "did_my_best", task_id: parentTask.id }),
    createHistoryEntry({ entry_date: "2026-06-30", id: "parent-done-2", status: "done", task_id: parentTask.id }),
    createHistoryEntry({ entry_date: "2026-06-29", id: "step-complete-1", status: "complete", task_id: stepTask.id }),
    createHistoryEntry({ entry_date: "2026-06-28", id: "substep-done-0", status: "done", task_id: substepTask.id }),
    createHistoryEntry({ entry_date: "2026-06-29", id: "substep-done-0b", status: "done", task_id: substepTask.id }),
    createHistoryEntry({ entry_date: "2026-06-30", id: "substep-done-1", status: "done", task_id: substepTask.id }),
    createHistoryEntry({ entry_date: "2026-06-28", id: "miss-repeat-1", status: "missed", task_id: repeatedMissTask.id }),
    createHistoryEntry({ entry_date: "2026-06-29", id: "miss-repeat-2", status: "missed", task_id: repeatedMissTask.id }),
    createHistoryEntry({ entry_date: "2026-06-30", id: "miss-repeat-3", status: "missed", task_id: repeatedMissTask.id }),
    createHistoryEntry({ entry_date: "2026-06-28", id: "duc-miss-1", status: "missed", task_id: unresolvedDailyUntilComplete.id }),
    createHistoryEntry({ entry_date: "2026-06-29", id: "duc-miss-2", status: "missed", task_id: unresolvedDailyUntilComplete.id }),
    createHistoryEntry({ entry_date: "2026-06-30", id: "duc-miss-3", status: "missed", task_id: unresolvedDailyUntilComplete.id }),
    createHistoryEntry({ entry_date: "2026-06-28", id: "test-miss-1", status: "missed", task_id: testMissTask.id }),
    createHistoryEntry({ entry_date: "2026-06-29", id: "test-miss-2", status: "missed", task_id: testMissTask.id }),
    createHistoryEntry({ entry_date: "2026-06-30", id: "test-miss-3", status: "missed", task_id: testMissTask.id }),
    ...extraMissTasks.map((task, index) => createHistoryEntry({
      entry_date: "2026-06-30",
      id: `miss-cap-entry-${index + 1}`,
      status: "missed",
      task_id: task.id,
    })),
  ];
  const fillerHistory = Array.from({ length: 1000 - baseTaskHistory.length }, (_, index) => createHistoryEntry({
    entry_date: "2026-06-15",
    id: `filler-${index + 1}`,
    status: "done",
    task_id: parentTask.id,
  }));
  const taskHistory: TaskHistory[] = [...baseTaskHistory, ...fillerHistory];

  const report = generateTaskReport({
    appVersion: "6.17.3",
    availableTaskLists: getBuiltInTaskLists(),
    detailLevel: "detailed",
    focusCategories: [],
    focusHistory: [],
    generatedAt: new Date("2026-06-30T15:00:00.000Z"),
    historySourceLabel: "Loaded workspace history fallback",
    historyWarning: "this report is based on 1000 loaded history records and may be incomplete.",
    rangeId: "last90",
    taskHistory,
    tasks,
    todayDateKey: "2026-06-30",
  });

  assert.match(report, /Warning: this report is based on 1000 loaded history records and may be incomplete\./);
  assert.match(report, /## Overall Stats/);
  assert.match(report, /## All Current Task History/);
  assert.match(report, /## Day-by-Day Breakdown/);
  assert.match(report, /History Records Analyzed: 1000/);
  assert.match(report, /Path: Morning routine > Brush teeth > Floss/);
  assert.match(report, /Current Status Snapshot: Pending 2, Done 1, Missed 28/);
  assert.match(report, /Morning routine.*Current Status: Done/);
  assert.match(report, /Brush teeth.*Current Status: Pending/);
  assert.match(report, /Floss.*Current Status: Pending/);
  assert.match(report, /Invoice filing.*Current Status: Missed/);
  assert.match(report, /Showing 25 of 27/);
  assert.match(report, /### Mon, Jun 29, 2026/);
  assert.match(report, /Summary: Parents handled 1; Steps\/Substeps handled 2; Combined handled 3; Missed 2/);
  assert.match(report, /### Tue, Jun 30, 2026/);
  assert.match(report, /Summary: Parents handled 1; Steps\/Substeps handled 1; Combined handled 2; Missed 27/);
  assert.doesNotMatch(report, /Test inbox thing.*Current Status: Missed/);
  assert.doesNotMatch(report, /Old trashed task.*Current Status: Missed/);
});

test("report status snapshot and task status lines use the passed history source", () => {
  const recurringTask = createTask({
    created_at: "2026-06-20T09:00:00.000Z",
    id: "coherent-history-task",
    repeat_frequency: "daily",
    sort_order: 1,
    status: "pending",
    title: "Coherent history task",
  });
  const taskHistory = [
    createHistoryEntry({
      entry_date: "2026-06-30",
      id: "coherent-history-done",
      status: "done",
      task_id: recurringTask.id,
    }),
  ];

  const report = generateTaskReport({
    appVersion: "6.17.3",
    availableTaskLists: getBuiltInTaskLists(),
    detailLevel: "detailed",
    focusCategories: [],
    focusHistory: [],
    generatedAt: new Date("2026-06-30T15:00:00.000Z"),
    historySourceLabel: "Full selected date range fetch",
    historyWarning: null,
    rangeId: "all",
    taskHistory,
    tasks: [recurringTask],
    todayDateKey: "2026-06-30",
  });

  assert.match(report, /History Source: Full selected date range fetch/);
  assert.match(report, /Current Status Snapshot: Done 1/);
  assert.match(report, /Coherent history task.*Current Status: Done/);
});

test("report includes focus goals and selected-range focus sessions", () => {
  const recurringTask = createTask({
    created_at: "2026-06-20T09:00:00.000Z",
    id: "focus-report-task",
    repeat_frequency: "daily",
    sort_order: 1,
    status: "pending",
    title: "Focus report task",
  });
  const focusCategory = createFocusCategory();
  const focusHistory = [
    createFocusSession(),
    createFocusSession({
      createdAt: "2026-06-29T16:00:00.000Z",
      date: "2026-06-29",
      durationSeconds: 900,
      id: "focus-session-2",
      notes: "",
      title: "Afternoon reset",
    }),
    createFocusSession({
      createdAt: "2026-06-20T16:00:00.000Z",
      date: "2026-06-20",
      durationSeconds: 600,
      id: "focus-session-out-of-range",
      title: "Old session",
    }),
  ];

  const report = generateTaskReport({
    appVersion: "6.20.0",
    availableTaskLists: getBuiltInTaskLists(),
    detailLevel: "summary",
    focusCategories: [focusCategory],
    focusHistory,
    generatedAt: new Date("2026-06-30T15:00:00.000Z"),
    historySourceLabel: "Full selected date range fetch",
    historyWarning: null,
    rangeId: "last7",
    taskHistory: [],
    tasks: [recurringTask],
    todayDateKey: "2026-06-30",
  });

  assert.match(report, /## Focus Report/);
  assert.match(report, /### Focus Goals/);
  assert.match(report, /- Coding: Today 25m\/17m; Week 40m\/2h; Pace On pace/);
  assert.match(report, /#### 2026-06-29/);
  assert.match(report, /#### 2026-06-30/);
  assert.match(report, /Morning sprint — Coding — 25m — Work \/ Deep Work — Notes: Heads-down sprint/);
  assert.doesNotMatch(report, /Old session/);
});

test("all range uses the union of task history and focus session dates", () => {
  const recurringTask = createTask({
    created_at: "2026-06-20T09:00:00.000Z",
    id: "focus-all-range-task",
    repeat_frequency: "daily",
    sort_order: 1,
    status: "pending",
    title: "Focus all range task",
  });

  const report = generateTaskReport({
    appVersion: "6.20.1",
    availableTaskLists: getBuiltInTaskLists(),
    detailLevel: "summary",
    focusCategories: [createFocusCategory()],
    focusHistory: [
      createFocusSession({
        createdAt: "2026-06-10T12:00:00.000Z",
        date: "2026-06-10",
        durationSeconds: 1200,
        id: "focus-earlier-than-history",
        title: "Earlier focus session",
      }),
      createFocusSession({
        createdAt: "2026-06-30T12:00:00.000Z",
        date: "2026-06-30",
        durationSeconds: 1500,
        id: "focus-later-than-history",
        title: "Later focus session",
      }),
    ],
    generatedAt: new Date("2026-06-30T15:00:00.000Z"),
    historySourceLabel: "Full selected date range fetch",
    historyWarning: null,
    rangeId: "all",
    taskHistory: [
      createHistoryEntry({
        entry_date: "2026-06-20",
        id: "history-middle",
        status: "done",
        task_id: recurringTask.id,
      }),
    ],
    tasks: [recurringTask],
    todayDateKey: "2026-06-30",
  });

  assert.match(report, /Selected Date Range: All available \(Jun 10, 2026 to Jun 30, 2026\)/);
  assert.match(report, /Earlier focus session/);
  assert.match(report, /Later focus session/);
});

test("focus duration labels stay carry-safe near hour boundaries", () => {
  const report = generateTaskReport({
    appVersion: "6.20.1",
    availableTaskLists: getBuiltInTaskLists(),
    detailLevel: "summary",
    focusCategories: [
      createFocusCategory({
        dailyGoalSeconds: 3599,
        weeklyGoalSeconds: 7199,
      }),
    ],
    focusHistory: [
      createFocusSession({
        durationSeconds: 3599,
        id: "focus-59m-59s",
        title: "Boundary under one hour",
      }),
      createFocusSession({
        createdAt: "2026-06-30T16:00:00.000Z",
        durationSeconds: 7199,
        id: "focus-1h-59m-59s",
        title: "Boundary under two hours",
      }),
    ],
    generatedAt: new Date("2026-06-30T15:00:00.000Z"),
    historySourceLabel: "Full selected date range fetch",
    historyWarning: null,
    rangeId: "all",
    taskHistory: [],
    tasks: [],
    todayDateKey: "2026-06-30",
  });

  assert.match(report, /- Coding: Today 2h 59m\/17m; Week 2h 59m\/1h 59m; Pace Over 59m/);
  assert.match(report, /Boundary under one hour — Coding — 59m/);
  assert.match(report, /Boundary under two hours — Coding — 1h 59m/);
  assert.doesNotMatch(report, /60m/);
  assert.doesNotMatch(report, /1h 60m/);
});
