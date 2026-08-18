import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { useTaskHistoryActions } from "../src/hooks/useTaskHistoryActions.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import type { TaskHistory } from "../src/lib/database.types.ts";
import type { TaskStateRuntimeExecutionResult, TaskStateRuntimeLocalTask } from "../src/lib/task-state-runtime-executor.ts";

function canonicalTask(id: string): TaskStateRuntimeLocalTask {
  return {
    ...createTask({ id, status: "pending", title: "Canonical Calendar", sort_order: 1 }),
    canonical_revision: 4,
    canonicalization_status: "canonical_proven",
    entity_kind: "parent",
  };
}

function commandResult(task: TaskStateRuntimeLocalTask, status: TaskStateRuntimeLocalTask["status"]): TaskStateRuntimeExecutionResult {
  return {
    success: true,
    task: { ...task, status, canonical_revision: (task.canonical_revision ?? 0) + 1 },
    response: {
      success: true,
      state: "committed",
      task_id: task.id,
      command_id: "command-calendar",
      expected_revision: task.canonical_revision ?? 0,
      next_revision: (task.canonical_revision ?? 0) + 1,
      was_replayed: false,
      conflict_code: null,
      canonical_task_patch: {},
      compatibility_projection: {},
      side_effect_ids: { reward_entitlement_id: "entitlement-calendar-1" },
      error: null,
    },
  };
}

test("canonical History Calendar outcome uses set_outcome and never writes legacy History", async () => {
  const task = canonicalTask("canonical-calendar");
  const existing: TaskHistory = {
    counted_as_due_occurrence: true,
    created_at: "2026-08-09T09:00:00.000Z",
    entry_date: "2026-08-09",
    event_type: "status",
    id: "canonical-history",
    occurrence_due_on: "2026-08-09",
    occurrence_key: "occurrence:2026-08-09",
    status: "missed",
    task_id: task.id,
    updated_at: "2026-08-09T09:00:00.000Z",
    user_id: "user-1",
    was_completed: false,
  };
  let actionType = "";
  let fromCalls = 0;
  let rewardCalls = 0;
  let localTask = task;
  const actions = useTaskHistoryActions({
    canonicalCommandExecutor: async (action, currentTask) => {
      actionType = action.actionType;
      return commandResult(currentTask, "done");
    },
    client: { from: () => { fromCalls += 1; throw new Error("legacy History write"); } } as never,
    currentDayKey: "2026-08-10",
    currentUserId: "user-1",
    dayStartTime: "06:00",
    isTaskCompletedForHistory: (status) => status === "done" || status === "did_my_best" || status === "complete",
    isTaskHistoryStatus: (status) => status === "done" || status === "did_my_best" || status === "missed" || status === "complete",
    mapTaskHistoryRow: (row) => row,
    now: new Date("2026-08-10T12:00:00.000Z"),
    onTasksCompleted: async (candidates) => { rewardCalls += candidates.length; },
    setMessage: () => {},
    setTaskHistory: () => {},
    setTasks: (updater) => { localTask = (typeof updater === "function" ? updater([localTask]) : updater)[0] as TaskStateRuntimeLocalTask; },
    sortTasksForUi: (tasks) => tasks,
    taskHistory: [existing],
    tasks: [task],
    timezone: "UTC",
    updateTaskRowWithLegacyEnergyFallback: async () => { throw new Error("legacy Task write"); },
  });

  assert.equal(await actions.syncTaskHistoryEntries(task.id, "done", [existing.entry_date], { historicalOverride: true }), true);
  assert.equal(actionType, "set_outcome");
  assert.equal(rewardCalls, 1);
  assert.equal(fromCalls, 0);
  assert.equal(localTask.status, "done");
});

test("History mutation production code has no direct legacy History write or legacy status derivation", () => {
  const source = readFileSync(new URL("../src/hooks/useTaskHistoryActions.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /adhdice_task_history|client\s*\.from\(|\.upsert\(/);
  assert.doesNotMatch(source, /resolveRecurringLiveStatusFromNextDueDate|calcNextDueDateFromDate/);
  assert.match(source, /classifyTaskStateRuntimeAction/);
  assert.match(source, /executeTaskStateRuntimeAction/);
});
