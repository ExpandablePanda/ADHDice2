import test from "node:test";
import assert from "node:assert/strict";
import { createTask } from "../src/lib/task-buckets.ts";
import { getBuiltInTaskLists, type TaskListEvaluationContext } from "../src/lib/task-lists.ts";
import { generateTaskReport } from "../src/lib/task-report.ts";
import type { Task, TaskHistory } from "../src/lib/database.types.ts";

function createTaskListEvaluationContext(
  taskHistory: TaskHistory[],
  todayDateKey: string,
): TaskListEvaluationContext {
  const taskHistoryByTaskId = taskHistory.reduce<Record<string, TaskHistory[]>>((accumulator, entry) => {
    const entries = accumulator[entry.task_id] ?? [];
    entries.push(entry);
    accumulator[entry.task_id] = entries;
    return accumulator;
  }, {});

  return {
    currentStreakByTaskId: {},
    focusedTaskIds: new Set<string>(),
    hasStepsByTaskId: {},
    historyFactsByTaskId: {},
    isDueToday: (date) => date === todayDateKey,
    isDueTomorrow: (date) => Boolean(date && date === "2026-06-30"),
    isLater: (date) => Boolean(date && date > todayDateKey),
    isOpen: (task) => !["done", "did_my_best", "complete", "archived", "trashed"].includes(task.status),
    isOverdue: (date) => Boolean(date && date < todayDateKey),
    manualMembershipsByTaskId: {},
    taskHistoryByTaskId,
    todayDateKey,
  };
}

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

test("summary report includes cleanup metadata and excludes detailed sections", () => {
  const activeTask = createTask({
    created_at: "2026-06-20T09:00:00.000Z",
    id: "parent-summary",
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
    generatedAt: new Date("2026-06-30T15:00:00.000Z"),
    rangeId: "last7",
    taskHistory,
    taskListEvaluationContext: createTaskListEvaluationContext(taskHistory, "2026-06-29"),
    tasks: [activeTask, trashedTask],
    todayDateKey: "2026-06-29",
  });

  assert.match(report, /Detail Level: Summary/);
  assert.match(report, /Active tasks loaded: 1/);
  assert.match(report, /Trashed tasks loaded: 1/);
  assert.match(report, /## Excluded \/ Non-active Snapshot/);
  assert.match(report, /Trashed tasks excluded from workload analysis: 1/);
  assert.match(report, /### Priority and Flag Counts/);
  assert.match(report, /### List \/ Bucket Memberships/);
  assert.doesNotMatch(report, /## Detailed History Export/);
});

test("detailed report adds warning, path context, and cleaned repeated sections", () => {
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
    generatedAt: new Date("2026-06-30T15:00:00.000Z"),
    rangeId: "last90",
    taskHistory,
    taskListEvaluationContext: createTaskListEvaluationContext(taskHistory, "2026-06-30"),
    tasks,
    todayDateKey: "2026-06-30",
  });

  assert.match(report, /Warning: this report is based on 1000 loaded history records and may be incomplete\./);
  assert.match(report, /Path: Morning routine > Brush teeth > Floss/);
  assert.match(report, /### Analysis-Ready Highlights/);
  assert.match(report, /#### Daily Until Complete Tasks Still Unresolved/);
  assert.match(report, /Invoice filing/);
  assert.match(report, /Showing 25 of 28/);
  assert.match(report, /#### High-signal repeated misses/);
  assert.match(report, /Stretch · Missed: 3/);
  assert.doesNotMatch(report, /Test inbox thing · Missed: 3/);
  assert.doesNotMatch(report, /Old trashed task · Missed: 3/);
  assert.match(report, /#### Parent-task wins/);
  assert.match(report, /Morning routine · Handled\/Completed: 4/);
  assert.match(report, /#### Step\/Substep wins/);
  assert.match(report, /Floss · Handled\/Completed: 3/);
  assert.match(report, /### Task-Level History Patterns/);
  assert.match(report, /Current Status: Missed/);
});
