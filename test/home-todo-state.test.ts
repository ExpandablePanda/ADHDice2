import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { Task } from "../src/lib/database.types.ts";
import {
  buildHomeTodoHierarchy,
  getHomeTodoSearchText,
  isHomeTodoTaskEligible,
  moveHomeTodoTaskId,
  moveHomeTodoTaskIdToEdge,
  normalizeHomeTodoState,
  reconcileHomeTodoTaskIds,
  sortHomeTodoSearchResults,
} from "../src/lib/home-todo-state.ts";
import { reorderListItems } from "../src/lib/list-reorder.ts";

function task(id: string, overrides: Partial<Task> = {}) {
  return {
    id,
    parent_task_id: null,
    status: "pending",
    title: id,
    trashed_at: null,
    ...overrides,
  } as Task;
}

test("Home todo state normalizes to ordered unique task ids", () => {
  assert.deepEqual(normalizeHomeTodoState({
    clientUpdatedAt: "2026-07-28T12:00:00.000Z",
    schemaVersion: 99,
    taskIds: ["a", "a", "", 4, "b"],
  }), {
    clientUpdatedAt: "2026-07-28T12:00:00.000Z",
    schemaVersion: 1,
    taskIds: ["a", "b"],
  });
});

test("Home todo eligibility follows active task ancestry", () => {
  const tasks = [
    task("parent"),
    task("step", { parent_task_id: "parent" }),
    task("archived", { status: "archived" }),
    task("hidden-child", { parent_task_id: "archived" }),
    task("complete", { status: "complete" }),
    task("trashed-parent", { status: "trashed", trashed_at: "2026-07-28T12:00:00.000Z" }),
    task("trashed-child", { parent_task_id: "trashed-parent" }),
  ];
  assert.equal(isHomeTodoTaskEligible(tasks[1]!, tasks), true);
  assert.equal(isHomeTodoTaskEligible(tasks[3]!, tasks), false);
  assert.equal(isHomeTodoTaskEligible(tasks[4]!, tasks), false);
  assert.equal(isHomeTodoTaskEligible(tasks[6]!, tasks), false);
  assert.deepEqual(buildHomeTodoHierarchy(tasks[1]!, tasks), ["parent"]);
});

test("Home todo reconciliation prunes duplicates, missing rows, and unavailable tasks", () => {
  const tasks = [task("a"), task("b"), task("done", { status: "complete" })];
  assert.deepEqual(reconcileHomeTodoTaskIds(["b", "missing", "a", "b", "done"], tasks), ["b", "a"]);
});

test("Home todo search includes Pinned and Routine membership labels", () => {
  assert.match(getHomeTodoSearchText(task("pinned", { pinned_at: "2026-07-28T12:00:00.000Z" }), [], []), /pinned/);
  assert.match(getHomeTodoSearchText(task("routine"), [], [{ id: "routine" }]), /routine/);
});

test("Home todo arrow reordering preserves contiguous array order", () => {
  assert.deepEqual(moveHomeTodoTaskId(["a", "b", "c"], "b", -1), ["b", "a", "c"]);
  assert.deepEqual(moveHomeTodoTaskId(["a", "b", "c"], "b", 1), ["a", "c", "b"]);
  assert.deepEqual(moveHomeTodoTaskId(["a", "b", "c"], "a", -1), ["a", "b", "c"]);
});

test("Home todo edge reordering moves directly to the top or bottom", () => {
  assert.deepEqual(moveHomeTodoTaskIdToEdge(["a", "b", "c", "d"], "c", "top"), ["c", "a", "b", "d"]);
  assert.deepEqual(moveHomeTodoTaskIdToEdge(["a", "b", "c", "d"], "b", "bottom"), ["a", "c", "d", "b"]);
  assert.deepEqual(moveHomeTodoTaskIdToEdge(["a", "b"], "missing", "top"), ["a", "b"]);
});

test("Home todo search keeps parents, Steps, and Substeps together", () => {
  const results = sortHomeTodoSearchResults([
    { hierarchy: ["Z parent"], task: task("z-step", { title: "Step" }) },
    { hierarchy: [], task: task("a-parent", { title: "A parent" }) },
    { hierarchy: ["A parent"], task: task("a-step", { title: "Step" }) },
    { hierarchy: ["A parent", "Step"], task: task("a-substep", { title: "Substep" }) },
    { hierarchy: [], task: task("z-parent", { title: "Z parent" }) },
  ]);
  assert.deepEqual(results.map((result) => result.task.id), [
    "a-parent",
    "a-step",
    "a-substep",
    "z-parent",
    "z-step",
  ]);
});

test("shared drag reorder moves Home task ids without mutating the source", () => {
  const source = ["a", "b", "c"];
  assert.deepEqual(reorderListItems(source, 0, 2), ["b", "c", "a"]);
  assert.deepEqual(source, ["a", "b", "c"]);
});

test("Home todo migration and schema provide owner-scoped realtime state", () => {
  const migration = readFileSync(new URL("../supabase/add_home_todo_state_7_5_39.sql", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  for (const source of [migration, schema]) {
    assert.match(source, /adhdice_home_todo_state/);
    assert.match(source, /enable row level security/);
    assert.match(source, /client_updated_at/);
    assert.match(source, /supabase_realtime add table public\.adhdice_home_todo_state/);
  }
});
