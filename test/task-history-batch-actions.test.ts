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

for (const [previousStatus, nextStatus] of [
  ["missed", "done"],
  ["missed", "did_my_best"],
  ["did_my_best", "done"],
  ["done", "missed"],
] as const) {
  test(`History Calendar replaces ${previousStatus} directly with ${nextStatus} on one logical row`, async () => {
    const task = createTask({
      created_at: "2026-08-01T09:00:00.000Z",
      due_on: "2026-08-02",
      id: `task-calendar-replace-${previousStatus}-${nextStatus}`,
      repeat_frequency: "daily",
      repeat_interval: 1,
      sort_order: 1,
      status: "missed",
      title: "Calendar replacement",
    });
    const existing: TaskHistory = {
      counted_as_due_occurrence: true,
      created_at: "2026-08-02T09:00:00.000Z",
      entry_date: "2026-08-02",
      event_type: "status",
      id: `history-replace-${previousStatus}-${nextStatus}`,
      occurrence_due_on: "2026-08-02",
      occurrence_key: "occurrence:2026-08-02",
      status: previousStatus,
      task_id: task.id,
      updated_at: "2026-08-02T09:00:00.000Z",
      user_id: "user-1",
      was_completed: previousStatus === "done" || previousStatus === "did_my_best",
    };
    let capturedPayload: TaskHistoryInsert | null = null;
    let capturedTaskUpdate: TaskUpdate | null = null;
    let localHistory: TaskHistory[] = [];
    let mutationSnapshot: TaskHistory[] = [];
    const client = {
      from: () => ({
        upsert: (payloads: TaskHistoryInsert[]) => {
          capturedPayload = payloads[0] ?? null;
          return {
            select: async () => ({
              data: payloads.map((payload) => ({
                ...existing,
                ...payload,
                id: existing.id,
                updated_at: "2026-08-03T12:00:00.000Z",
              })),
              error: null,
            }),
          };
        },
      }),
    };
    const actions = useTaskHistoryActions({
      client: client as never,
      currentDayKey: "2026-08-03",
      currentUserId: "user-1",
      dayStartTime: "06:00",
      isTaskCompletedForHistory: (status) => status === "done" || status === "did_my_best" || status === "complete",
      isTaskHistoryStatus: (status) => status === "done" || status === "did_my_best" || status === "missed" || status === "complete",
      mapTaskHistoryRow: (row) => row,
      now: new Date("2026-08-03T12:00:00.000Z"),
      onHistoryMutation: (_taskId, history) => { mutationSnapshot = history ?? []; },
      setMessage: () => {},
      setTaskHistory: (updater) => {
        localHistory = typeof updater === "function" ? updater(localHistory) : updater;
      },
      setTasks: () => {},
      sortTasksForUi: (tasks) => tasks,
      taskHistory: [],
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

    assert.equal(await actions.syncTaskHistoryEntries(task.id, nextStatus, [existing.entry_date], {
      historySnapshot: [existing],
      syncLiveTask: true,
    }), true);
    assert.deepEqual(capturedPayload && {
      entry_date: capturedPayload.entry_date,
      occurrence_due_on: capturedPayload.occurrence_due_on,
      occurrence_key: capturedPayload.occurrence_key,
      status: capturedPayload.status,
    }, {
      entry_date: existing.entry_date,
      occurrence_due_on: existing.occurrence_due_on,
      occurrence_key: existing.occurrence_key,
      status: nextStatus,
    });
    assert.equal(localHistory.length, 1);
    assert.equal(localHistory[0]?.status, nextStatus);
    assert.equal(new Set(mutationSnapshot.map((entry) => `${entry.task_id}:${entry.entry_date}`)).size, 1);
    assert.equal(mutationSnapshot[0]?.status, nextStatus);
    assert.equal(
      previousStatus === "done" && nextStatus === "missed"
        ? capturedTaskUpdate === null
        : Boolean(capturedTaskUpdate),
      true,
    );
  });
}

test("History Calendar manual Missed saves one deduplicated outcome without advancing recurrence", async () => {
  const task = createTask({
    created_at: "2026-07-01T09:00:00.000Z",
    due_on: "2026-07-13",
    id: "task-calendar-missed-backfill",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 1,
    status: "pending",
    title: "Daily calendar missed backfill",
  });
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
              created_at: "2026-07-13T12:00:00.000Z",
              entry_date: payload.entry_date,
              event_type: "status" as const,
              id: `calendar-missed-${index}`,
              status: payload.status,
              task_id: payload.task_id,
              updated_at: "2026-07-13T12:00:00.000Z",
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
    currentDayKey: "2026-07-13",
    currentUserId: "user-1",
    dayStartTime: "06:00",
    isTaskCompletedForHistory: (status) => status === "done" || status === "did_my_best" || status === "complete",
    isTaskHistoryStatus: (status) => status === "done" || status === "did_my_best" || status === "missed" || status === "complete",
    mapTaskHistoryRow: (row) => row,
    now: new Date("2026-07-13T12:00:00.000Z"),
    setMessage: () => {},
    setTaskHistory: (updater) => {
      localHistory = typeof updater === "function" ? updater(localHistory) : updater;
    },
    setTasks: () => {},
    sortTasksForUi: (tasks) => tasks,
    taskHistory: localHistory,
    tasks: [task],
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

  await actions.syncTaskHistoryEntries(task.id, "missed", ["2026-07-08"], { syncLiveTask: true });

  assert.deepEqual(capturedPayloads.map((payload) => payload.entry_date), ["2026-07-08"]);
  assert.deepEqual(localHistory.map((entry) => entry.entry_date).sort(), ["2026-07-08"]);
  assert.equal(localHistory.every((entry) => entry.status === "missed"), true);

  await actions.syncTaskHistoryEntries(task.id, "missed", ["2026-07-08"], { syncLiveTask: true });
  assert.equal(localHistory.length, 1);
  assert.equal(new Set(localHistory.map((entry) => entry.entry_date)).size, 1);
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
    status: "upcoming",
  });
  assert.equal(localTasks[0]?.due_on, "2026-07-01");
  assert.equal(localTasks[0]?.status, "upcoming");
});

for (const status of ["done", "did_my_best"] as const) {
  test(`History Calendar backdated ${status} reuses the resolved occurrence and preserves the live cursor`, async () => {
    const task = createTask({
      created_at: "2026-07-01T09:00:00.000Z",
      due_on: "2026-08-02",
      id: `calendar-canonical-${status}`,
      repeat_days_of_week: [0],
      repeat_frequency: "weekly",
      repeat_interval: 1,
      sort_order: 1,
      status: "not_due",
      title: "Sunday task",
    });
    let capturedPayload: TaskHistoryInsert | null = null;
    let liveUpdates = 0;
    const originalSuccess: TaskHistory = {
      counted_as_due_occurrence: false, created_at: "2026-07-24T09:00:00.000Z", entry_date: "2026-07-24", event_type: "status", id: "original-success", occurrence_due_on: "2026-07-26", occurrence_key: "occurrence:2026-07-26", status: "done", task_id: task.id, updated_at: "2026-07-24T09:00:00.000Z", user_id: "user-1", was_completed: true,
    };
    const client = { from: () => ({ upsert: (payloads: TaskHistoryInsert[]) => {
      capturedPayload = payloads[0] ?? null;
      return { select: async () => ({ data: payloads.map((payload) => ({ ...originalSuccess, ...payload, id: "backdated-success", updated_at: "2026-07-24T12:00:00.000Z" })), error: null }) };
    } }) };
    const actions = useTaskHistoryActions({
      client: client as never, currentDayKey: "2026-07-24", currentUserId: "user-1", dayStartTime: "06:00",
      isTaskCompletedForHistory: (candidate) => candidate === "done" || candidate === "did_my_best" || candidate === "complete",
      isTaskHistoryStatus: (candidate) => candidate === "done" || candidate === "did_my_best" || candidate === "missed" || candidate === "complete",
      mapTaskHistoryRow: (row) => row, now: new Date("2026-07-24T12:00:00.000Z"), setMessage: () => {}, setTaskHistory: () => {}, setTasks: () => {}, sortTasksForUi: (tasks) => tasks,
      taskHistory: [originalSuccess], tasks: [task], timezone: "America/New_York",
      updateTaskRowWithLegacyEnergyFallback: async () => { liveUpdates += 1; return { conflict: null, data: null, error: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false }; },
    });

    assert.equal(await actions.syncTaskHistoryEntries(task.id, status, ["2026-07-23"], { syncLiveTask: true }), true);
    assert.deepEqual(capturedPayload && { occurrence_due_on: capturedPayload.occurrence_due_on, occurrence_key: capturedPayload.occurrence_key }, { occurrence_due_on: "2026-07-26", occurrence_key: "occurrence:2026-07-26" });
    assert.equal(liveUpdates, 0);
  });
}

test("task history batch action rebases a prior-day calendar completion without reward or completion effects", async () => {
  const task = createTask({
    created_at: "2026-07-01T09:00:00.000Z",
    due_on: "2026-07-10",
    id: "task-recurring-calendar-rebase",
    repeat_frequency: "daily",
    repeat_interval: 4,
    sort_order: 1,
    status: "missed",
    title: "TestDelayNotDue1",
  });
  let localHistory: TaskHistory[] = [
    {
      counted_as_due_occurrence: false,
      created_at: "2026-07-10T09:00:00.000Z",
      entry_date: "2026-07-10",
      event_type: "status",
      id: "old-missed",
      status: "missed",
      task_id: task.id,
      updated_at: "2026-07-10T09:00:00.000Z",
      user_id: "user-1",
      was_completed: false,
    },
  ];
  let capturedTaskUpdate: TaskUpdate | null = null;
  let upsertCount = 0;
  const client = {
    from: () => ({
      upsert: (payloads: TaskHistoryInsert[]) => {
        upsertCount += 1;
        return {
          select: async () => ({
            data: payloads.map((payload) => ({
              counted_as_due_occurrence: false,
              created_at: "2026-07-13T09:00:00.000Z",
              entry_date: payload.entry_date,
              event_type: "status" as const,
              id: "prior-day-done",
              status: payload.status,
              task_id: payload.task_id,
              updated_at: "2026-07-13T09:00:00.000Z",
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
    currentDayKey: "2026-07-13",
    currentUserId: "user-1",
    dayStartTime: "06:00",
    isTaskCompletedForHistory: (status) => status === "done" || status === "did_my_best" || status === "complete",
    isTaskHistoryStatus: (status) => status === "done" || status === "did_my_best" || status === "missed" || status === "complete",
    mapTaskHistoryRow: (row) => row,
    now: new Date("2026-07-13T12:00:00.000Z"),
    setMessage: () => {},
    setTaskHistory: (updater) => {
      localHistory = typeof updater === "function" ? updater(localHistory) : updater;
    },
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

  const saved = await actions.syncTaskHistoryEntries(task.id, "done", ["2026-07-12"], { syncLiveTask: true });

  assert.equal(saved, true);
  assert.equal(upsertCount, 1);
  assert.equal(localHistory.filter((entry) => entry.entry_date === "2026-07-12").length, 1);
  assert.deepEqual(capturedTaskUpdate, {
    completed_at: null,
    due_on: "2026-07-16",
    status: "upcoming",
  });
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
