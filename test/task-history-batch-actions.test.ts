import assert from "node:assert/strict";
import test from "node:test";

import { useTaskHistoryActions } from "../src/hooks/useTaskHistoryActions.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import type { TaskHistory, TaskHistoryInsert, TaskUpdate } from "../src/lib/database.types.ts";

test("task history batch action upserts selected dates together and merges local history", async () => {
  let capturedPayloads: TaskHistoryInsert[] = [];
  let localHistory: TaskHistory[] = [];
  const client = {
    from: () => ({
      upsert: (payloads: TaskHistoryInsert[]) => {
        capturedPayloads = payloads;
        return {
          select: async () => ({
            data: payloads.map((payload, index) => ({
              counted_as_due_occurrence: false,
              created_at: `2026-06-0${index + 1}T09:00:00.000Z`,
              entry_date: payload.entry_date,
              event_type: "status" as const,
              id: `history-${index + 1}`,
              status: payload.status,
              task_id: payload.task_id,
              updated_at: `2026-06-0${index + 1}T09:00:00.000Z`,
              user_id: payload.user_id,
              was_completed: payload.was_completed ?? false,
            })),
            error: null,
          }),
        };
      },
    }),
  };
  const actions = useTaskHistoryActions({
    client: client as never,
    currentDayKey: "2026-06-21",
    currentUserId: "user-1",
    dayStartTime: "06:00",
    isTaskCompletedForHistory: () => false,
    isTaskHistoryStatus: () => true,
    mapTaskHistoryRow: (row) => row,
    now: new Date("2026-06-21T12:00:00.000Z"),
    setMessage: () => {},
    setTaskHistory: (updater) => {
      localHistory = typeof updater === "function" ? updater(localHistory) : updater;
    },
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    tasks: [],
    timezone: "America/New_York",
    updateTaskRowWithLegacyEnergyFallback: async () => ({
      conflict: null,
      data: null,
      error: null,
      reappliedOnLatestRevision: false,
      usedActualSecondsFallback: false,
      usedEnergyFallback: false,
    }),
  });

  const saved = await actions.syncTaskHistoryEntries(
    "task-1",
    "missed",
    ["2026-06-18", "2026-06-19", "2026-06-18"],
    { syncLiveTask: true },
  );

  assert.equal(saved, true);
  assert.deepEqual(capturedPayloads.map((payload) => payload.entry_date), ["2026-06-18", "2026-06-19"]);
  assert.deepEqual(localHistory.map((entry) => entry.entry_date).sort(), ["2026-06-18", "2026-06-19"]);
});

test("task history batch action rolls current recurring occurrence to the next live due date", async () => {
  const task = createTask({
    created_at: "2026-06-01T09:00:00.000Z",
    due_on: "2026-06-24",
    id: "task-recurring-calendar-rollover",
    repeat_days_of_week: [3],
    repeat_frequency: "weekly",
    repeat_interval: 1,
    sort_order: 1,
    status: "pending",
    title: "Recurring calendar rollover",
  });
  let localHistory: TaskHistory[] = [];
  let localTasks = [task];
  let capturedTaskUpdate: TaskUpdate | null = null;
  const client = {
    from: () => ({
      upsert: (payloads: TaskHistoryInsert[]) => ({
        select: async () => ({
          data: payloads.map((payload, index) => ({
            counted_as_due_occurrence: false,
            created_at: `2026-06-24T09:0${index}:00.000Z`,
            entry_date: payload.entry_date,
            event_type: "status" as const,
            id: `history-rollover-${index}`,
            status: payload.status,
            task_id: payload.task_id,
            updated_at: `2026-06-24T09:0${index}:00.000Z`,
            user_id: payload.user_id,
            was_completed: payload.was_completed ?? false,
          })),
          error: null,
        }),
      }),
    }),
  };
  const actions = useTaskHistoryActions({
    calcNextDueDateFromDate: () => "2026-07-01",
    client: client as never,
    currentDayKey: "2026-06-24",
    currentUserId: "user-1",
    dayStartTime: "06:00",
    isTaskCompletedForHistory: (status) => status === "done" || status === "did_my_best" || status === "complete",
    isTaskHistoryStatus: (status) => status === "done" || status === "did_my_best" || status === "missed" || status === "complete",
    mapTaskHistoryRow: (row) => row,
    now: new Date("2026-06-24T12:00:00.000Z"),
    setMessage: () => {},
    setTaskHistory: (updater) => {
      localHistory = typeof updater === "function" ? updater(localHistory) : updater;
    },
    setTasks: (updater) => {
      localTasks = typeof updater === "function" ? updater(localTasks) : updater;
    },
    sortTasksForUi: (tasks) => tasks,
    tasks: localTasks,
    timezone: "America/New_York",
    updateTaskRowWithLegacyEnergyFallback: async (_taskId, values) => {
      capturedTaskUpdate = values;
      return {
        conflict: null,
        data: { ...task, ...values, updated_at: "2026-06-24T12:00:00.000Z" },
        error: null,
        reappliedOnLatestRevision: false,
        usedActualSecondsFallback: false,
        usedEnergyFallback: false,
      };
    },
  });

  const saved = await actions.syncTaskHistoryEntries(
    task.id,
    "done",
    ["2026-06-24"],
    { syncLiveTask: true },
  );

  assert.equal(saved, true);
  assert.equal(localHistory[0]?.status, "done");
  assert.deepEqual(capturedTaskUpdate, {
    completed_at: null,
    due_on: "2026-07-01",
    status: "not_due",
  });
  assert.equal(localTasks[0]?.due_on, "2026-07-01");
  assert.equal(localTasks[0]?.status, "not_due");
});

test("older recurring history edits do not roll the active task forward", async () => {
  const task = createTask({
    created_at: "2026-06-01T09:00:00.000Z",
    due_on: "2026-06-24",
    id: "task-recurring-old-history",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 1,
    status: "pending",
    title: "Recurring old history",
  });
  let capturedTaskUpdate: TaskUpdate | null = null;
  const client = {
    from: () => ({
      upsert: (payloads: TaskHistoryInsert[]) => ({
        select: async () => ({
          data: payloads.map((payload, index) => ({
            counted_as_due_occurrence: false,
            created_at: `2026-06-23T09:0${index}:00.000Z`,
            entry_date: payload.entry_date,
            event_type: "status" as const,
            id: `history-old-${index}`,
            status: payload.status,
            task_id: payload.task_id,
            updated_at: `2026-06-23T09:0${index}:00.000Z`,
            user_id: payload.user_id,
            was_completed: payload.was_completed ?? false,
          })),
          error: null,
        }),
      }),
    }),
  };
  const actions = useTaskHistoryActions({
    calcNextDueDateFromDate: () => {
      throw new Error("old history edits must not calculate recurrence rollover");
    },
    client: client as never,
    currentDayKey: "2026-06-24",
    currentUserId: "user-1",
    dayStartTime: "06:00",
    isTaskCompletedForHistory: (status) => status === "done" || status === "did_my_best" || status === "complete",
    isTaskHistoryStatus: (status) => status === "done" || status === "did_my_best" || status === "missed" || status === "complete",
    mapTaskHistoryRow: (row) => row,
    now: new Date("2026-06-24T12:00:00.000Z"),
    setMessage: () => {},
    setTaskHistory: () => {},
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    tasks: [task],
    timezone: "America/New_York",
    updateTaskRowWithLegacyEnergyFallback: async (_taskId, values) => {
      capturedTaskUpdate = values;
      return {
        conflict: null,
        data: { ...task, ...values },
        error: null,
        reappliedOnLatestRevision: false,
        usedActualSecondsFallback: false,
        usedEnergyFallback: false,
      };
    },
  });

  const saved = await actions.syncTaskHistoryEntries(
    task.id,
    "done",
    ["2026-06-23"],
    { syncLiveTask: true },
  );

  assert.equal(saved, true);
  assert.equal(capturedTaskUpdate, null);
});
