import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createTask } from "../src/lib/task-buckets.ts";
import { getBuiltInTaskLists, type TaskListMembership } from "../src/lib/task-lists.ts";
import { generateTaskReport } from "../src/lib/task-report.ts";
import type { Milestone, MilestoneEvent, Task, TaskHistory } from "../src/lib/database.types.ts";
import type { FocusCategory, FocusDailyGoalAdjustment, HistoricalFocusSession } from "../src/lib/types.ts";
import type { AchievementProgressModel } from "../src/lib/achievement-progress.ts";
import type { PersistedRecordCurrent, PersistedRecordEvent } from "../src/lib/records/types.ts";
import { copyReportMarkdown, formatReportDate, formatReportRecordValue } from "../src/lib/report-presentation.ts";

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

function createFocusAdjustment(overrides: Partial<FocusDailyGoalAdjustment> = {}): FocusDailyGoalAdjustment {
  return {
    adjustmentDate: "2026-06-30",
    createdAt: "2026-06-30T12:30:00.000Z",
    id: "focus-adjustment-1",
    reason: "manual_reallocation",
    reductionSeconds: 900,
    sourceCategoryId: "focus-category-1",
    sourceSessionId: null,
    targetCategoryId: "focus-category-1",
    updatedAt: "2026-06-30T12:30:00.000Z",
    userId: "test-user",
    ...overrides,
  };
}

function createManualListMembership(id: TaskListMembership["id"]): TaskListMembership {
  return {
    id,
    isManual: true,
    source: "manual",
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

  assert.match(report, /## Overview/);
  assert.match(report, /History Records Analyzed: 1/);
  assert.match(report, /History Source: Loaded workspace history fallback/);
  assert.match(report, /Active vs Trashed Loaded: 1 active, 1 trashed excluded/);
  assert.match(report, /Current Status Snapshot: Open 1/);
  assert.doesNotMatch(report, /### All Current Task History/);
  assert.doesNotMatch(report, /### Day-by-Day Breakdown/);
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

test("report includes compact pinned, routine, and priority summaries", () => {
  const pinnedTask = createTask({
    created_at: "2026-06-20T09:00:00.000Z",
    id: "pinned-task",
    pinned_at: "2026-06-29T08:00:00.000Z",
    priority_level: 5,
    sort_order: 1,
    status: "done",
    title: "Pinned task",
  });
  const routineLegacyUrgentTask = createTask({
    created_at: "2026-06-20T09:05:00.000Z",
    id: "routine-legacy-urgent-task",
    is_urgent: true,
    priority_level: null,
    sort_order: 2,
    status: "missed",
    title: "Routine legacy urgent task",
  });
  const routineImportantTask = createTask({
    created_at: "2026-06-20T09:10:00.000Z",
    id: "routine-important-task",
    is_important: true,
    priority_level: null,
    sort_order: 3,
    status: "did_my_best",
    title: "Routine important task",
  });
  const normalTask = createTask({
    created_at: "2026-06-20T09:15:00.000Z",
    id: "normal-task",
    priority_level: 0,
    sort_order: 4,
    status: "pending",
    title: "Normal task",
  });

  const report = generateTaskReport({
    appVersion: "6.24.4",
    availableTaskLists: getBuiltInTaskLists(),
    detailLevel: "summary",
    focusCategories: [],
    focusHistory: [],
    generatedAt: new Date("2026-06-30T15:00:00.000Z"),
    historySourceLabel: "Full selected date range fetch",
    historyWarning: null,
    listMembershipsByTaskId: {
      [routineLegacyUrgentTask.id]: [createManualListMembership("routine")],
      [routineImportantTask.id]: [createManualListMembership("routine")],
    },
    rangeId: "last7",
    taskHistory: [
      createHistoryEntry({
        entry_date: "2026-06-29",
        id: "pinned-task-done",
        status: "done",
        task_id: pinnedTask.id,
      }),
      createHistoryEntry({
        entry_date: "2026-06-29",
        id: "routine-legacy-urgent-task-missed",
        status: "missed",
        task_id: routineLegacyUrgentTask.id,
      }),
      createHistoryEntry({
        entry_date: "2026-06-29",
        id: "routine-important-task-dmb",
        status: "did_my_best",
        task_id: routineImportantTask.id,
      }),
    ],
    tasks: [pinnedTask, routineLegacyUrgentTask, routineImportantTask, normalTask],
    todayDateKey: "2026-06-30",
  });

  assert.match(report, /Pinned Tasks: 1 total \(Done 1\)/);
  assert.match(report, /Parent Tasks: Done 0; Did My Best 1; Missed 1; Handled 1/);
  assert.match(report, /Priority 5: Done 1, Missed 1/);
  assert.match(report, /Priority 4: Did My Best 1/);
  assert.match(report, /Priority 0: Open 1/);
  assert.doesNotMatch(report, /Pinned Tasks: 0 total/);
  assert.doesNotMatch(report, /Range outcomes for Tasks currently in Routine.*Current Status/s);
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
  assert.match(report, /## Overview/);
  assert.match(report, /### All Current Task History/);
  assert.match(report, /### Day-by-Day Breakdown/);
  assert.match(report, /History Records Analyzed: 1000/);
  assert.match(report, /Path: Morning routine > Brush teeth > Floss/);
  assert.match(report, /Current Status Snapshot: Open 3, Missed 28/);
  assert.match(report, /Morning routine.*Current Status: Open/);
  assert.match(report, /Brush teeth.*Current Status: Open/);
  assert.match(report, /Floss.*Current Status: Open/);
  assert.match(report, /Invoice filing.*Current Status: Missed/);
  assert.match(report, /Showing 25 of 27/);
  assert.match(report, /### Mon, Jun 29, 2026/);
  assert.match(report, /Summary: Parents handled 1; Steps\/Substeps handled 2; Combined handled 3; Missed 2/);
  assert.match(report, /### Tue, Jun 30, 2026/);
  assert.match(report, /Summary: Parents handled 1; Steps\/Substeps handled 1; Combined handled 2; Missed 27/);
  assert.doesNotMatch(report, /Test inbox thing.*Current Status: Missed/);
  assert.doesNotMatch(report, /Old trashed task.*Current Status: Missed/);
});

test("report distinguishes credited history day from the real logged timestamp", () => {
  const overnightTask = createTask({
    created_at: "2026-07-08T08:00:00.000Z",
    id: "overnight-task",
    sort_order: 1,
    status: "pending",
    title: "Overnight log task",
  });

  const report = generateTaskReport({
    appVersion: "6.24.4",
    availableTaskLists: getBuiltInTaskLists(),
    detailLevel: "detailed",
    focusCategories: [],
    focusHistory: [],
    generatedAt: new Date("2026-07-09T15:00:00.000Z"),
    historySourceLabel: "Full selected date range fetch",
    historyWarning: null,
    rangeId: "last7",
    taskHistory: [
      createHistoryEntry({
        created_at: "2026-07-09T13:30:00.000Z",
        entry_date: "2026-07-08",
        id: "overnight-task-done",
        status: "done",
        task_id: overnightTask.id,
        updated_at: "2026-07-09T13:30:00.000Z",
      }),
    ],
    tasks: [overnightTask],
    todayDateKey: "2026-07-09",
  });

  assert.match(report, /History: Done: Jul 8 \(logged /);
  assert.doesNotMatch(report, /Edited /);
});

test("report labels edited history timestamps separately from logged timestamps", () => {
  const editedTask = createTask({
    created_at: "2026-07-08T08:00:00.000Z",
    id: "edited-history-task",
    sort_order: 1,
    status: "pending",
    title: "Edited history task",
  });

  const report = generateTaskReport({
    appVersion: "6.25.2",
    availableTaskLists: getBuiltInTaskLists(),
    detailLevel: "detailed",
    focusCategories: [],
    focusHistory: [],
    generatedAt: new Date("2026-07-09T15:00:00.000Z"),
    historySourceLabel: "Full selected date range fetch",
    historyWarning: null,
    rangeId: "last7",
    taskHistory: [
      createHistoryEntry({
        created_at: "2026-07-09T01:15:00.000Z",
        entry_date: "2026-07-08",
        id: "edited-history-task-done",
        status: "done",
        task_id: editedTask.id,
        updated_at: "2026-07-09T13:30:00.000Z",
      }),
    ],
    tasks: [editedTask],
    todayDateKey: "2026-07-09",
  });

  assert.match(report, /History: Done: Jul 8 \(logged /);
  assert.match(report, /Edited /);
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
  assert.match(report, /Current Status Snapshot: Open 1/);
  assert.match(report, /Coherent history task.*Current Status: Open/);
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
  assert.match(report, /#### Jun 29, 2026/);
  assert.match(report, /#### Jun 30, 2026/);
  assert.match(report, /Morning sprint — Coding — 25m — Work \/ Deep Work — Notes: Heads-down sprint/);
  assert.doesNotMatch(report, /Old session/);
});

test("all range uses the union of task history, focus session, and adjustment dates", () => {
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
    focusDailyGoalAdjustments: [
      createFocusAdjustment({
        adjustmentDate: "2026-06-05",
        id: "focus-adjustment-earliest",
        sourceCategoryId: "focus-category-1",
        targetCategoryId: "focus-category-1",
      }),
    ],
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

  assert.match(report, /Selected Date Range: All available \(Jun 5, 2026 to Jun 30, 2026\)/);
  assert.match(report, /Earlier focus session/);
  assert.match(report, /Later focus session/);
  assert.match(report, /#### Jun 5, 2026/);
});

test("custom range filters task and focus report data through the selected dates", () => {
  const task = createTask({
    created_at: "2026-06-20T09:00:00.000Z",
    id: "custom-range-task",
    sort_order: 1,
    status: "pending",
    title: "Custom range task",
  });

  const report = generateTaskReport({
    appVersion: "6.25.3",
    availableTaskLists: getBuiltInTaskLists(),
    customRange: {
      endDateKey: "2026-06-20",
      startDateKey: "2026-06-10",
    },
    detailLevel: "summary",
    focusCategories: [createFocusCategory()],
    focusDailyGoalAdjustments: [],
    focusHistory: [
      createFocusSession({ date: "2026-06-15", id: "focus-in-custom-range", title: "Inside focus" }),
      createFocusSession({ date: "2026-06-22", id: "focus-out-custom-range", title: "Outside focus" }),
    ],
    generatedAt: new Date("2026-06-30T15:00:00.000Z"),
    historySourceLabel: "Full selected date range fetch",
    historyWarning: null,
    rangeId: "custom",
    taskHistory: [
      createHistoryEntry({ entry_date: "2026-06-15", id: "history-in-custom-range", status: "done", task_id: task.id }),
      createHistoryEntry({ entry_date: "2026-06-22", id: "history-out-custom-range", status: "missed", task_id: task.id }),
    ],
    tasks: [task],
    todayDateKey: "2026-06-30",
  });

  assert.match(report, /Selected Date Range: Custom range \(Jun 10, 2026 to Jun 20, 2026\)/);
  assert.match(report, /Inside focus/);
  assert.doesNotMatch(report, /Outside focus/);
  assert.match(report, /Done: 1 Parents, 0 Steps\/Substeps, 1 Total/);
  assert.doesNotMatch(report, /Missed: 1 Parents/);
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

test("Routine Performance counts canonical selected-range occurrences by parent and Step outcomes", () => {
  const parent = createTask({
    id: "routine-parent",
    repeat_frequency: "daily",
    status: "pending",
    title: "Appanda",
  });
  const step = createTask({
    id: "routine-step",
    parent_task_id: parent.id,
    repeat_frequency: "daily",
    status: "pending",
    title: "ADHDice",
  });
  const substep = createTask({
    id: "routine-substep",
    parent_task_id: step.id,
    repeat_frequency: "daily",
    status: "pending",
    title: "Nested Routine check",
  });
  const history = [
    ...Array.from({ length: 6 }, (_, index) => createHistoryEntry({
      counted_as_due_occurrence: false,
      entry_date: "2026-07-24",
      id: `parent-best-${index + 1}`,
      occurrence_key: `parent-best-${index + 1}`,
      status: "did_my_best",
      task_id: parent.id,
    })),
    ...Array.from({ length: 6 }, (_, index) => createHistoryEntry({
      counted_as_due_occurrence: false,
      entry_date: "2026-07-24",
      id: `step-best-${index + 1}`,
      occurrence_key: `step-best-${index + 1}`,
      status: "did_my_best",
      task_id: step.id,
    })),
    createHistoryEntry({ counted_as_due_occurrence: false, entry_date: "2026-07-24", id: "parent-done-original", occurrence_key: "parent-1", status: "done", task_id: parent.id }),
    createHistoryEntry({ created_at: "2026-07-24T13:00:00.000Z", entry_date: "2026-07-24", id: "parent-done-duplicate", occurrence_key: "parent-1", status: "done", task_id: parent.id }),
    createHistoryEntry({ counted_as_due_occurrence: false, entry_date: "2026-07-24", id: "parent-missed-due", occurrence_due_on: "2026-07-23", status: "missed", task_id: parent.id }),
    createHistoryEntry({ created_at: "2026-07-24T14:00:00.000Z", entry_date: "2026-07-24", id: "parent-missed-due-duplicate", occurrence_due_on: "2026-07-23", status: "missed", task_id: parent.id }),
    createHistoryEntry({ entry_date: "2026-07-24", id: "parent-open", occurrence_key: "parent-open", status: "pending", task_id: parent.id }),
    createHistoryEntry({ counted_as_due_occurrence: false, entry_date: "2026-07-24", id: "step-done", occurrence_key: "step-1", status: "done", task_id: step.id }),
    createHistoryEntry({ entry_date: "2026-07-24", id: "step-done-same-day", occurrence_key: "step-2", status: "done", task_id: step.id }),
    createHistoryEntry({ counted_as_due_occurrence: false, entry_date: "2026-07-24", id: "step-missed", occurrence_key: "step-3", status: "missed", task_id: step.id }),
    createHistoryEntry({ counted_as_due_occurrence: false, entry_date: "2026-07-24", id: "substep-missed", occurrence_key: "substep-1", status: "missed", task_id: substep.id }),
  ];

  const report = generateTaskReport({
    appVersion: "7.4.8",
    availableTaskLists: getBuiltInTaskLists(),
    detailLevel: "summary",
    focusCategories: [],
    focusHistory: [],
    generatedAt: new Date("2026-07-25T12:00:00.000Z"),
    historySourceLabel: "Full selected date range fetch",
    historyWarning: null,
    listMembershipsByTaskId: {
      [parent.id]: [createManualListMembership("routine")],
      [step.id]: [createManualListMembership("routine")],
    },
    rangeId: "last7",
    taskHistory: history,
    tasks: [parent, step, substep],
    todayDateKey: "2026-07-25",
  });

  assert.match(report, /Range outcomes for Tasks currently in Routine/);
  assert.match(report, /Parent Tasks: Done 1; Did My Best 6; Missed 1; Handled 7/);
  assert.match(report, /Steps\/Substeps: Done 2; Did My Best 6; Missed 2; Handled 8/);
  assert.match(report, /historical membership is unavailable/);
});

test("reports exclude descendants of trashed parents before snapshots, Routine, and details", () => {
  const trashedParent = createTask({ id: "trashed-parent", status: "trashed", title: "Trashed parent" });
  const descendant = createTask({ id: "trashed-descendant", parent_task_id: trashedParent.id, status: "done", title: "Hidden descendant" });
  const report = generateTaskReport({
    appVersion: "7.4.9",
    availableTaskLists: getBuiltInTaskLists(),
    detailLevel: "detailed",
    focusCategories: [],
    focusHistory: [],
    generatedAt: new Date("2026-07-25T12:00:00.000Z"),
    historySourceLabel: "Full selected date range fetch",
    historyWarning: null,
    listMembershipsByTaskId: {
      [trashedParent.id]: [createManualListMembership("routine")],
      [descendant.id]: [createManualListMembership("routine")],
    },
    rangeId: "last7",
    taskHistory: [
      createHistoryEntry({
        counted_as_due_occurrence: false,
        entry_date: "2026-07-24",
        id: "trashed-descendant-done",
        occurrence_key: "trashed-descendant-1",
        status: "done",
        task_id: descendant.id,
      }),
    ],
    tasks: [trashedParent, descendant],
    todayDateKey: "2026-07-25",
  });

  assert.match(report, /Active vs Trashed Loaded: 0 active, 2 trashed excluded/);
  assert.match(report, /History Records Analyzed: 0/);
  assert.match(report, /Steps\/Substeps: Done 0; Did My Best 0; Missed 0; Handled 0/);
  assert.doesNotMatch(report, /Hidden descendant/);
});

test("Achievements include permanent range awards and the loaded current progress snapshot", () => {
  const achievementModel = {
    collections: [{
      description: "Collection description",
      earnedTiers: 1,
      id: "clocked_in",
      isMastered: true,
      masteredAt: "2026-07-24T18:00:00.000Z",
      title: "Clocked In",
      totalTiers: 4,
      tracks: [{
        currentValue: 7200,
        description: "Track description",
        id: "locked_in",
        isComplete: false,
        nextThreshold: 10800,
        nextTier: "silver",
        progressPercent: 66,
        tiers: [
          { earnedAt: "2026-07-24T16:00:00.000Z", id: "bronze", isEarned: true, threshold: 3600 },
          { earnedAt: null, id: "silver", isEarned: false, threshold: 10800 },
        ],
        title: "Locked In",
        unit: "seconds",
      }],
    }],
    summary: {
      completedCollections: 1,
      earnedTiers: 1,
      mostRecentUnlock: { earnedAt: "2026-07-24T18:00:00.000Z", label: "Clocked In · Collection mastered" },
      overallCompletionPercent: 25,
      totalTiers: 4,
    },
  } as AchievementProgressModel;

  const report = generateTaskReport({
    achievementModel,
    appVersion: "7.4.8",
    availableTaskLists: getBuiltInTaskLists(),
    detailLevel: "summary",
    focusCategories: [],
    focusHistory: [],
    generatedAt: new Date("2026-07-25T12:00:00.000Z"),
    historySourceLabel: "Full selected date range fetch",
    historyWarning: null,
    rangeId: "last7",
    taskHistory: [],
    tasks: [],
    todayDateKey: "2026-07-25",
  });

  assert.match(report, /Locked In — Collection: Clocked In — Tier: Bronze — Permanently earned: Jul 24, 2026/);
  assert.match(report, /Clocked In — Collection mastery aura earned: Jul 24, 2026/);
  assert.match(report, /Clocked In: 1 of 4 tiers — Mastered Jul 24, 2026/);
  assert.match(report, /Locked In — Current progress: 2 hrs — Earned tiers: Bronze — Next: Silver at 3 hrs/);
});

test("Milestone lifecycle, trophy, and aura output remains range-based", () => {
  const milestoneEvent = {
    event_type: "completed_on_time",
    id: "milestone-event-1",
    occurred_at: "2026-07-24T15:00:00.000Z",
  } as MilestoneEvent;
  const milestone = {
    aura_kind: "diamond",
    aura_revoked_at: null,
    completion_date_key: "2026-07-24",
    completion_timing: "on_time",
    current_tier: "gold",
    status: "completed",
    task_title_snapshot: "Ship report clarity",
    trophy_awarded_at: "2026-07-24T15:00:00.000Z",
    trophy_revoked_at: null,
    updated_at: "2026-07-24T15:00:00.000Z",
  } as Milestone;
  const report = generateTaskReport({
    appVersion: "7.4.8",
    availableTaskLists: getBuiltInTaskLists(),
    detailLevel: "detailed",
    focusCategories: [],
    focusHistory: [],
    generatedAt: new Date("2026-07-25T12:00:00.000Z"),
    historySourceLabel: "Full selected date range fetch",
    historyWarning: null,
    milestoneEvents: [milestoneEvent],
    milestones: [milestone],
    rangeId: "last7",
    taskHistory: [],
    tasks: [],
    todayDateKey: "2026-07-25",
  });
  assert.match(report, /Completed lifecycle events: 1 total; 1 on time; 0 grace period; 0 late/);
  assert.match(report, /Trophies earned in range: Bronze 0; Silver 0; Gold 1; Platinum 0/);
  assert.match(report, /Trophy auras in range: Standard 0; Diamond 1; Completed without Aura 0/);
  assert.match(report, /Ship report clarity — gold — Jul 24, 2026 — On time — Diamond Aura/);
});

test("Records report uses persisted current rows and selected-range events", () => {
  const priorEvent = {
    credited_date: "2026-07-01",
    event_kind: "break",
    first_achieved_at: "2026-07-01T12:00:00.000Z",
    id: "record-prior",
    metric_key: "parent_tasks_day",
    scope_id: null,
    scope_kind: "global",
    title_snapshot: null,
    unit: "tasks",
    validity_state: "valid",
    value: 5,
  } as PersistedRecordEvent;
  const breakEvent = {
    ...priorEvent,
    credited_date: "2026-07-24",
    first_achieved_at: "2026-07-24T12:00:00.000Z",
    id: "record-break",
    value: 10,
  } as PersistedRecordEvent;
  const tieEvent = {
    ...breakEvent,
    credited_date: "2026-07-25",
    event_kind: "tie",
    first_achieved_at: "2026-07-25T12:00:00.000Z",
    id: "record-tie",
  } as PersistedRecordEvent;
  const currentRecord = {
    ...breakEvent,
    first_achieved_at: "2026-07-24T12:00:00.000Z",
  } as unknown as PersistedRecordCurrent;
  const report = generateTaskReport({
    appVersion: "7.4.8",
    availableTaskLists: getBuiltInTaskLists(),
    detailLevel: "summary",
    focusCategories: [],
    focusHistory: [],
    generatedAt: new Date("2026-07-25T12:00:00.000Z"),
    historySourceLabel: "Full selected date range fetch",
    historyWarning: null,
    rangeId: "last7",
    records: { currentRecords: [currentRecord], events: [priorEvent, breakEvent, tieEvent] },
    taskHistory: [],
    tasks: [],
    todayDateKey: "2026-07-25",
  });
  assert.match(report, /Most parent Tasks completed in one day — Current: 10 tasks — Achieved: Jul 24, 2026 — Previous: 5 tasks — Category: Global Tasks — Scope: Global/);
  assert.match(report, /Broken: Most parent Tasks completed in one day — Jul 24, 2026 — Current: 10 tasks — Previous: 5 tasks/);
  assert.match(report, /Tied: Most parent Tasks completed in one day — Jul 25, 2026 — Current: 10 tasks — Previous: 10 tasks/);
  assert.doesNotMatch(report, /Jul 1, 2026 — Current: 5 tasks/);
});

test("Records report summarizes per-task rows, caps deterministic highlights, and preserves complete range events", () => {
  const hierarchyRoot = createTask({ id: "answer-messages", title: "Answer Messages" });
  const hierarchyStep = createTask({ id: "email", parent_task_id: hierarchyRoot.id, title: "Email" });
  const hierarchySubstep = createTask({ id: "burners-task-scope", parent_task_id: hierarchyStep.id, title: "Burners" });
  const globalRecord = {
    first_achieved_at: "2026-07-20T12:00:00.000Z",
    id: "global-current",
    metric_key: "parent_tasks_day",
    scope_id: null,
    scope_kind: "global",
    title_snapshot: null,
    unit: "tasks",
    value: 1,
  } as PersistedRecordCurrent;
  const perTaskRecords = Array.from({ length: 15 }, (_, index) => {
    const number = index + 1;
    return {
      first_achieved_at: `2026-07-${String(number).padStart(2, "0")}T12:00:00.000Z`,
      id: `per-task-current-${number}`,
      metric_key: "task_occurrence_streak",
      scope_id: number === 15 ? hierarchySubstep.id : `duplicate-task-scope-${number}`,
      scope_kind: "task",
      title_snapshot: number === 15 ? "Burners" : "Duplicate title",
      unit: "occurrences",
      value: number,
    } as PersistedRecordCurrent;
  });
  const rangedEvents = [
    {
      credited_date: "2026-07-20",
      event_kind: "break",
      first_achieved_at: "2026-07-20T09:00:00.000Z",
      id: "range-set",
      metric_key: "task_occurrence_streak",
      scope_id: hierarchySubstep.id,
      scope_kind: "task",
      title_snapshot: "Burners",
      unit: "occurrences",
      validity_state: "valid",
      value: 1,
    },
    {
      credited_date: "2026-07-21",
      event_kind: "break",
      first_achieved_at: "2026-07-21T09:00:00.000Z",
      id: "range-broken",
      metric_key: "task_occurrence_streak",
      scope_id: hierarchySubstep.id,
      scope_kind: "task",
      title_snapshot: "Burners",
      unit: "occurrences",
      validity_state: "valid",
      value: 2,
    },
    {
      credited_date: "2026-07-22",
      event_kind: "tie",
      first_achieved_at: "2026-07-22T09:00:00.000Z",
      id: "range-tied",
      metric_key: "task_occurrence_streak",
      scope_id: hierarchySubstep.id,
      scope_kind: "task",
      title_snapshot: "Burners",
      unit: "occurrences",
      validity_state: "valid",
      value: 2,
    },
  ] as PersistedRecordEvent[];
  const report = generateTaskReport({
    appVersion: "7.4.9",
    availableTaskLists: getBuiltInTaskLists(),
    detailLevel: "summary",
    focusCategories: [],
    focusHistory: [],
    generatedAt: new Date("2026-07-25T12:00:00.000Z"),
    historySourceLabel: "Full selected date range fetch",
    historyWarning: null,
    rangeId: "last7",
    records: { currentRecords: [globalRecord, ...perTaskRecords], events: rangedEvents },
    taskHistory: [],
    tasks: [hierarchyRoot, hierarchyStep, hierarchySubstep],
    todayDateKey: "2026-07-25",
  });

  assert.match(report, /### Current global Records[\s\S]*Current: 1 task/);
  assert.match(report, /Total persisted per-task Record rows: 15/);
  assert.match(report, /Distinct Tasks represented: 15/);
  assert.match(report, /Longest successful occurrence streak: 15/);
  assert.equal((report.match(/Longest successful occurrence streak — Current:/g) ?? []).length, 12);
  assert.match(report, /3 additional current per-task Records were omitted/);
  assert.match(report, /Answer Messages > Email > Burners/);
  assert.match(report, /Duplicate title \[duplicat\]/);
  assert.match(report, /Set: Longest successful occurrence streak — Jul 20, 2026/);
  assert.match(report, /Broken: Longest successful occurrence streak — Jul 21, 2026/);
  assert.match(report, /Tied: Longest successful occurrence streak — Jul 22, 2026/);
  assert.ok(report.indexOf("Jul 20, 2026") < report.indexOf("Jul 21, 2026"));
  assert.ok(report.indexOf("Jul 21, 2026") < report.indexOf("Jul 22, 2026"));
  assert.doesNotMatch(report, /per-task-current-1/);
});

test("Record value formatting centralizes singular and plural units", () => {
  assert.equal(formatReportRecordValue(1, "occurrences"), "1 occurrence");
  assert.equal(formatReportRecordValue(2, "occurrences"), "2 occurrences");
  assert.equal(formatReportRecordValue(1, "tasks"), "1 task");
  assert.equal(formatReportRecordValue(2, "tasks"), "2 tasks");
  assert.equal(formatReportRecordValue(1, "steps"), "1 step");
  assert.equal(formatReportRecordValue(2, "steps"), "2 steps");
  assert.equal(formatReportRecordValue(1, "sessions"), "1 session");
  assert.equal(formatReportRecordValue(2, "sessions"), "2 sessions");
  assert.equal(formatReportRecordValue(1, "days"), "1 day");
  assert.equal(formatReportRecordValue(2, "days"), "2 days");
});

test("Milestone empty output separates lifecycle activity from the current trophy snapshot", () => {
  const report = generateTaskReport({
    appVersion: "7.4.9",
    availableTaskLists: getBuiltInTaskLists(),
    detailLevel: "summary",
    focusCategories: [],
    focusHistory: [],
    generatedAt: new Date("2026-07-25T12:00:00.000Z"),
    historySourceLabel: "Full selected date range fetch",
    historyWarning: null,
    rangeId: "last7",
    taskHistory: [],
    tasks: [],
    todayDateKey: "2026-07-25",
  });
  assert.match(report, /No Milestone lifecycle events occurred during the selected range\./);
  assert.match(report, /Current trophy\/aura snapshot for Milestones completed in this range: none\./);
  assert.doesNotMatch(report, /No Milestone activity or currently earned trophies/);
});

test("report wiring neither reconciles Records nor diverges preview and clipboard Markdown", async () => {
  const workspaceSource = readFileSync(new URL("../src/components/task-app/task-report-workspace.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(workspaceSource, /runRecordsPipeline|runRecordsPipelineSingleFlight|records RPC/i);
  assert.match(workspaceSource, /isMembershipProjectionReady \? generateTaskReport/);
  assert.match(workspaceSource, /isReportLoading = isLoadingHistory \|\| !isMembershipProjectionReady/);
  assert.match(workspaceSource, /copyReportMarkdown\(reportMarkdown, navigator\.clipboard\)/);
  assert.match(workspaceSource, /: reportMarkdown\}/);

  let copied = "";
  const markdown = "# Exact generated Markdown\n\nSame preview and clipboard.";
  await copyReportMarkdown(markdown, { writeText: async (value) => { copied = value; } });
  assert.equal(copied, markdown);
});

test("report date-only formatting preserves the logical calendar day", () => {
  assert.equal(formatReportDate("2026-07-25"), "Jul 25, 2026");
});

test("detailed report keeps the required reporting-clarity section order", () => {
  const report = generateTaskReport({
    appVersion: "7.4.8",
    availableTaskLists: getBuiltInTaskLists(),
    detailLevel: "detailed",
    focusCategories: [],
    focusHistory: [],
    generatedAt: new Date("2026-07-25T12:00:00.000Z"),
    historySourceLabel: "Full selected date range fetch",
    historyWarning: null,
    rangeId: "last7",
    taskHistory: [],
    tasks: [],
    todayDateKey: "2026-07-25",
  });
  const headings = [
    "## Overview",
    "## Routine Performance",
    "## Achievements",
    "## Milestones",
    "## Records",
    "## Focus Report",
    "## Task History / details",
    "## Analysis Request",
  ];
  const indexes = headings.map((heading) => report.indexOf(heading));
  assert.ok(indexes.every((index) => index >= 0));
  assert.deepEqual(indexes, [...indexes].sort((left, right) => left - right));
});
