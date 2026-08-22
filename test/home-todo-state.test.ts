import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { TaskDraft } from "../src/components/task-app/task-editor-model.ts";
import type { Task } from "../src/lib/database.types.ts";
import {
  buildHomeTodoHierarchy,
  createHomeTodoTask,
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

test("Home task creation ignores whitespace-only titles without calling canonical creation", async () => {
  let createCalls = 0;
  const appendedTaskIds: string[] = [];

  const createdTask = await createHomeTodoTask(
    " \t\n ",
    async () => {
      createCalls += 1;
      return task("should-not-exist");
    },
    (taskId) => appendedTaskIds.push(taskId),
  );

  assert.equal(createdTask, null);
  assert.equal(createCalls, 0);
  assert.deepEqual(appendedTaskIds, []);
});

test("Home task creation trims the title and creates exactly one canonical task", async () => {
  let createCalls = 0;
  let receivedDraft: TaskDraft | null = null;
  const canonicalTask = task("canonical-task", { title: "Capture this task" });

  const createdTask = await createHomeTodoTask(
    "  Capture this task  ",
    async (draft) => {
      createCalls += 1;
      receivedDraft = draft;
      return canonicalTask;
    },
    () => {},
  );

  assert.equal(createdTask, canonicalTask);
  assert.equal(createCalls, 1);
  assert.equal(receivedDraft?.title, "Capture this task");
});

test("Home task creation uses current new-task defaults and appends the returned canonical id", async () => {
  const appendedTaskIds: string[] = [];
  let receivedDraft: TaskDraft | null = null;
  const canonicalTask = task("canonical-task");

  await createHomeTodoTask(
    "New task",
    async (draft) => {
      receivedDraft = draft;
      return canonicalTask;
    },
    (taskId) => appendedTaskIds.push(taskId),
  );

  assert.equal(receivedDraft?.status, "pending");
  assert.equal(receivedDraft?.priority_level, 0);
  assert.equal(receivedDraft?.priority, "low");
  assert.equal(receivedDraft?.energy, "none");
  assert.equal(receivedDraft?.repeat_frequency, "none");
  assert.equal(receivedDraft?.repeat_interval, 1);
  assert.equal(receivedDraft?.actual_seconds, 0);
  assert.deepEqual(appendedTaskIds, [canonicalTask.id]);
});

test("Home task creation does not append a phantom id when canonical creation fails", async () => {
  const appendedTaskIds: string[] = [];

  const createdTask = await createHomeTodoTask(
    "Retry me",
    async () => null,
    (taskId) => appendedTaskIds.push(taskId),
  );

  assert.equal(createdTask, null);
  assert.deepEqual(appendedTaskIds, []);
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

test("Home todo arrow reordering preserves contiguous array order", () => {
  assert.deepEqual(moveHomeTodoTaskId(["a", "b", "c"], "b", -1), ["b", "a", "c"]);
  assert.deepEqual(moveHomeTodoTaskId(["a", "b", "c"], "b", 1), ["a", "c", "b"]);
  assert.deepEqual(moveHomeTodoTaskId(["a", "b", "c"], "a", -1), ["a", "b", "c"]);
});

test("Home todo direct edge reordering preserves the remaining order", () => {
  assert.deepEqual(moveHomeTodoTaskIdToEdge(["a", "b", "c", "d"], "c", "top"), ["c", "a", "b", "d"]);
  assert.deepEqual(moveHomeTodoTaskIdToEdge(["a", "b", "c", "d"], "b", "bottom"), ["a", "c", "d", "b"]);
  assert.deepEqual(moveHomeTodoTaskIdToEdge(["a", "b"], "missing", "top"), ["a", "b"]);
});

test("Home todo search includes Pinned and Routine membership labels", () => {
  const pinned = task("pinned", { notes: null, pinned_at: "2026-07-28T12:00:00.000Z", tags: [], title: "Pay bill" });
  assert.match(getHomeTodoSearchText(pinned, [], []), /pinned/);
  assert.match(getHomeTodoSearchText(task("routine", { notes: null, pinned_at: null, tags: [], title: "Stretch" }), [], [{ id: "routine" }]), /routine/);
});

test("Home todo search sorts full hierarchy paths together", () => {
  const results = sortHomeTodoSearchResults([
    { hierarchy: ["Project B"], task: { id: "b-child", title: "Step 1" } },
    { hierarchy: [], task: { id: "a", title: "Project A" } },
    { hierarchy: ["Project A"], task: { id: "a-child", title: "Step 2" } },
    { hierarchy: [], task: { id: "b", title: "Project B" } },
  ]);
  assert.deepEqual(results.map((entry) => entry.task.id), ["a", "a-child", "b", "b-child"]);
});

test("shared drag reorder moves Home task ids without mutating the source", () => {
  const source = ["a", "b", "c"];
  assert.deepEqual(reorderListItems(source, 0, 2), ["b", "c", "a"]);
  assert.deepEqual(source, ["a", "b", "c"]);
});

test("Home todo renders the recovered ten-item, wrapped-title, status, and picker behavior", () => {
  const source = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
  assert.match(source, /const HOME_TODO_VISIBLE_LIMIT = 10/);
  assert.match(source, /todoTasks\.slice\(0, HOME_TODO_VISIBLE_LIMIT\)/);
  assert.match(source, /Do later \(\{doLaterTasks\.length\}\)/);
  assert.match(source, /const HOME_TODO_TITLE_CLASS = "text-sm font-medium text-\[#26324f\] dark:text-white"/);
  assert.equal((source.match(/HOME_TODO_TITLE_CLASS/g) ?? []).length, 3);
  assert.match(source, /grid min-w-0 grid-cols-\[auto_auto_auto_minmax\(0,1fr\)_auto\] items-center gap-x-0/);
  assert.match(source, /const HOME_TODO_LIST_CLASS = "mt-3 space-y-2 max-sm:-mx-2"/);
  assert.match(source, /max-sm:-ml-2 sm:-ml-1 shrink-0/);
  assert.match(source, /ml-0\.5 flex h-7 w-7 shrink-0/);
  assert.match(source, /relative ml-1 flex h-8 w-8 shrink-0/);
  assert.match(source, /ml-0\.5 min-w-0/);
  assert.match(source, /<div className="flex shrink-0 items-center gap-1">/);
  assert.match(source, /renderTaskStatusCircle\(displayStatus, "sm", \{ className: "!h-7 !w-7", glyphClassName: "!h-4 !w-4 !text-sm" \}\)/);
  assert.doesNotMatch(source, /flex shrink-0 flex-col items-center/);
  assert.doesNotMatch(source, /basis-full/);
  assert.match(source, /<ArrowUpToLine aria-hidden="true" \/>/);
  assert.match(source, /<ArrowDownToLine aria-hidden="true" \/>/);
  assert.doesNotMatch(source, /<ArrowUp aria-hidden/);
  assert.doesNotMatch(source, /<ArrowDown aria-hidden/);
  assert.match(source, /\{index !== 0 \? \(/);
  assert.match(source, /\{index !== todoTasks\.length - 1 \? \(/);
  assert.match(source, /moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "top"\)/);
  assert.match(source, /moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "bottom"\)/);
  assert.match(source, /from Home To-do/);
  assert.match(source, /<Minus aria-hidden="true" \/>/);
  assert.equal((source.match(/size="sm"/g) ?? []).length, 3);
  assert.match(source, /tone="danger"/);
  assert.doesNotMatch(source, /variant="rowToolbar"/);
  assert.match(source, /-mx-\[15px\] w-auto max-w-4xl px-3 pb-32 pt-6 sm:mx-auto sm:px-4/);
  assert.doesNotMatch(source, /Search your Tasks and arrange the order you want to work through\./);
  assert.match(source, /<div className="relative mt-2" ref=\{searchRef\}>/);
  assert.match(source, /<TaskStatusCircleRail/);
  assert.match(source, /onClick=\{\(\) => onOpenTask\(task\.id\)\}/);
  assert.match(source, /onSubmit=\{handleCreateTask\}/);
  assert.match(source, /New task/);
  assert.match(source, /type="submit"/);
  assert.match(source, /Cancel/);
  assert.match(source, /setIsSearchOpen\(true\)/);
  assert.doesNotMatch(source, /setQuery\(""\)/);
  assert.doesNotMatch(source, /font-semibold leading-5/);
  assert.doesNotMatch(source, /text-\[#443d60\]/);
});

test("TaskApp passes Home creation through the shared canonical addTask seam", () => {
  const source = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  assert.match(source, /<TaskHomePage[\s\S]*onCreateTask=\{addTask\}/);
  assert.match(source, /addTask\(buildNewTaskDraft\("New Task"\)\)/);
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
