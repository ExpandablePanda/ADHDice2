import assert from "node:assert/strict";
import test from "node:test";

import { useTaskHistoryActions } from "../src/hooks/useTaskHistoryActions.ts";
import type { TaskHistory, TaskHistoryInsert } from "../src/lib/database.types.ts";

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
