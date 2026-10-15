import test from "node:test";
import assert from "node:assert/strict";
import type { Dispatch, SetStateAction } from "react";
import type { TaskRoutingBucket } from "../src/lib/task-buckets.ts";
import { DEFAULT_TASK_UI_STATE, type TaskUiState } from "../src/lib/task-ui-state.ts";
import { useTaskPlannerActions } from "../src/hooks/useTaskPlannerActions.ts";

test("planner actions can route the initiating panel without changing the other panel", async () => {
  let taskUiState: TaskUiState = { ...DEFAULT_TASK_UI_STATE };
  let taskRouting: Record<string, TaskRoutingBucket> = {};
  let focusDraftIds: string[] = [];
  let selectedPanelBucket = "inbox";
  const routedTasks: Array<{ taskId: string; bucket: TaskRoutingBucket | null }> = [];
  let savedFocusIds: string[] = [];

  const actions = useTaskPlannerActions({
    focusedTaskIds: ["already-focused"],
    routeTask: (taskId, bucket) => { routedTasks.push({ taskId, bucket }); },
    saveFocusSelection: async (ids) => { savedFocusIds = ids; },
    setFocusDraftIds: ((next) => {
      focusDraftIds = typeof next === "function" ? next(focusDraftIds) : next;
    }) as Dispatch<SetStateAction<string[]>>,
    setFocusPlannerStep: () => {},
    setMessage: () => {},
    setShowFocusPlanner: () => {},
    setTaskRouting: ((next) => {
      taskRouting = typeof next === "function" ? next(taskRouting) : next;
    }) as Dispatch<SetStateAction<Record<string, TaskRoutingBucket>>>,
    setTaskUiState: ((next) => {
      taskUiState = typeof next === "function" ? next(taskUiState) : next;
    }) as Dispatch<SetStateAction<TaskUiState>>,
  });

  actions.planTasksForToday(["right-task"], (bucket) => { selectedPanelBucket = bucket; });
  assert.equal(selectedPanelBucket, "today");
  assert.equal(taskUiState.selectedBucket, DEFAULT_TASK_UI_STATE.selectedBucket);
  assert.deepEqual(taskRouting, { "right-task": "today" });

  actions.focusTask("right-focus-task", (bucket) => { selectedPanelBucket = bucket; });
  await Promise.resolve();
  assert.equal(selectedPanelBucket, "focus");
  assert.equal(taskUiState.selectedBucket, DEFAULT_TASK_UI_STATE.selectedBucket);
  assert.deepEqual(savedFocusIds, ["already-focused", "right-focus-task"]);
  assert.deepEqual(routedTasks, [{ taskId: "right-focus-task", bucket: "today" }]);

  actions.planTasksForToday(["legacy-task"]);
  assert.equal(taskUiState.selectedBucket, "today");
  assert.deepEqual(taskRouting, { "right-task": "today", "legacy-task": "today" });

  actions.openFocusPlanner(["right-focus-task"]);
  assert.deepEqual(focusDraftIds, ["right-focus-task"]);
});
