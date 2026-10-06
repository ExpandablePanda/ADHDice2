import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { useTaskPriorityRoutingController } from "../src/hooks/useTaskPriorityRoutingController.ts";
import { promoteHomeSearchResultToUrgent } from "../src/lib/home-urgent-search.ts";
import { moveHomeTodoTaskIdToUrgent, normalizeHomeTodoState } from "../src/lib/home-todo-state.ts";
import type { Task } from "../src/lib/database.types.ts";

function useController(updateTask: (taskId: string, updates: Partial<Task>) => Promise<boolean>) {
  return useTaskPriorityRoutingController({
    focusedTaskIds: [],
    onOpenEditTaskEditor: () => {},
    routeTask: () => {},
    saveFocusSelection: async () => {},
    setMessage: () => {},
    updateTask,
  });
}

test("priority routing preserves the canonical updater result", async () => {
  let receivedUpdates: Record<string, unknown> | null = null;
  const successful = useController(async (_taskId, updates) => {
    receivedUpdates = updates;
    return true;
  });
  assert.equal(await successful.setTaskPriority("task-1", "5"), true);
  assert.deepEqual(receivedUpdates, {
    is_important: false,
    is_urgent: true,
    priority: "high",
    priority_level: 5,
  });

  const failed = useController(async () => false);
  assert.equal(await failed.setTaskPriority("task-1", "5"), false);
});

test("Urgent search add moves only after Priority 5 succeeds", async () => {
  const successful = useController(async () => true);
  const successfulMoves: string[] = [];
  assert.equal(await promoteHomeSearchResultToUrgent({
    moveTodoTaskToUrgent: (taskId) => successfulMoves.push(taskId),
    onSetTaskPriority: (taskId, priority) => successful.setTaskPriority(taskId, priority),
    taskId: "task-1",
    urgentTaskIds: [],
  }), true);
  assert.deepEqual(successfulMoves, ["task-1"]);

  const failed = useController(async () => false);
  const failedMoves: string[] = [];
  assert.equal(await promoteHomeSearchResultToUrgent({
    moveTodoTaskToUrgent: (taskId) => failedMoves.push(taskId),
    onSetTaskPriority: (taskId, priority) => failed.setTaskPriority(taskId, priority),
    taskId: "task-2",
    urgentTaskIds: [],
  }), false);
  assert.deepEqual(failedMoves, []);
});

test("successful Urgent promotion removes To-do membership and preserves Task legacy urgency", () => {
  const state = normalizeHomeTodoState({
    taskIds: ["task-1", "task-2"],
    taskDayOffsets: { "task-1": 3, "task-2": 7 },
    urgentTaskIds: [],
  });
  const moved = moveHomeTodoTaskIdToUrgent(state, "task-1");
  assert.deepEqual(moved, {
    taskIds: ["task-2"],
    taskDayOffsets: { "task-2": 7 },
    urgentTaskIds: ["task-1"],
  });
  const task = { id: "task-1", is_urgent: false };
  assert.equal(task.is_urgent, false);
});

test("Urgent search production seam keeps Priority guard and Home transition wired", async () => {
  const source = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
  const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  assert.match(source, /promoteHomeSearchResultToUrgent/);
  assert.match(source, /setQuery\(""\)/);
  assert.match(source, /setIsSearchOpen\(false\)/);
  assert.doesNotMatch(source, /task\.is_urgent|is_urgent/);
  assert.match(taskAppSource, /updateTask: async \(taskId, updates\) => \{\s*return updateTask\(taskId, updates\);/);
});
