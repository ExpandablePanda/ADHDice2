import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { TaskDraft } from "../src/components/task-app/task-editor-model.ts";
import type { Task } from "../src/lib/database.types.ts";
import {
  buildHomeTodoDaySections,
  buildHomeTodoHierarchy,
  createHomeTodoTask,
  formatHomeTodoDateLabel,
  getHomeTodoSearchText,
  isHomeTodoTaskEligible,
  moveHomeTodoTaskId,
  moveHomeTodoTaskIdToEdge,
  normalizeHomeTodoTasksPerDay,
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

test("Home todo V1 state normalizes to V2 with the default capacity", () => {
  assert.deepEqual(normalizeHomeTodoState({
    clientUpdatedAt: "2026-07-28T12:00:00.000Z",
    schemaVersion: 1,
    taskIds: ["a", "a", "", 4, "b"],
  }), {
    clientUpdatedAt: "2026-07-28T12:00:00.000Z",
    schemaVersion: 2,
    taskIds: ["a", "b"],
    tasksPerDay: 10,
  });
});

test("Home todo tasks-per-day accepts 10 through 15 and safely defaults invalid values", () => {
  assert.deepEqual([10, 11, 12, 13, 14, 15].map(normalizeHomeTodoTasksPerDay), [10, 11, 12, 13, 14, 15]);
  assert.equal(normalizeHomeTodoTasksPerDay(9), 10);
  assert.equal(normalizeHomeTodoTasksPerDay("12"), 10);
  assert.equal(normalizeHomeTodoTasksPerDay(null), 10);
});

test("Home todo generates seven local calendar sections with Today, Tomorrow, weekdays, and ordinal dates", () => {
  const { sections, laterTaskIds } = buildHomeTodoDaySections(
    Array.from({ length: 71 }, (_, index) => `task-${index}`),
    10,
    new Date("2026-08-23T12:00:00-04:00"),
  );
  assert.equal(sections.length, 7);
  assert.deepEqual(sections.map((section) => section.label), [
    "Today · August 23rd",
    "Tomorrow · August 24th",
    "Tuesday · August 25th",
    "Wednesday · August 26th",
    "Thursday · August 27th",
    "Friday · August 28th",
    "Saturday · August 29th",
  ]);
  assert.equal(formatHomeTodoDateLabel("2026-08-11", 2), "Tuesday · August 11th");
  assert.deepEqual(laterTaskIds, ["task-70"]);
});

test("Home todo preserves flat order at 10-task and 15-task chunk boundaries", () => {
  const taskIds = Array.from({ length: 106 }, (_, index) => `task-${index}`);
  const ten = buildHomeTodoDaySections(taskIds, 10, new Date("2026-08-23T12:00:00-04:00"));
  const fifteen = buildHomeTodoDaySections(taskIds, 15, new Date("2026-08-23T12:00:00-04:00"));
  assert.deepEqual(ten.sections.map((section) => section.taskIds.length), [10, 10, 10, 10, 10, 10, 10]);
  assert.deepEqual(fifteen.sections.map((section) => section.taskIds.length), [15, 15, 15, 15, 15, 15, 15]);
  assert.deepEqual(fifteen.laterTaskIds, ["task-105"]);
  assert.deepEqual([...ten.sections.flatMap((section) => section.taskIds), ...ten.laterTaskIds], taskIds);
  assert.deepEqual([...fifteen.sections.flatMap((section) => section.taskIds), ...fifteen.laterTaskIds], taskIds);
  const twelve = buildHomeTodoDaySections(taskIds, 12);
  assert.deepEqual([...twelve.sections.flatMap((section) => section.taskIds), ...twelve.laterTaskIds], taskIds);
});

test("Home todo cross-section reorder changes only the canonical global order", () => {
  const taskIds = Array.from({ length: 21 }, (_, index) => `task-${index}`);
  const moved = reorderListItems(taskIds, 10, 3);
  assert.equal(moved[3], "task-10");
  assert.equal(moved[10], "task-9");
  assert.deepEqual(buildHomeTodoDaySections(moved, 10).sections.flatMap((section) => section.taskIds), moved);
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

test("Home todo renders seven flat sortable sections, settings, and the recovered task behavior", () => {
  const source = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
  const sharedIconButton = readFileSync(new URL("../src/components/ui-system/adhd-icon-button.tsx", import.meta.url), "utf8");
  const sortableSource = readFileSync(new URL("../src/components/ui/sortable-list.tsx", import.meta.url), "utf8");
  const hookSource = readFileSync(new URL("../src/hooks/useHomeTodoState.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /HOME_TODO_VISIBLE_LIMIT/);
  assert.match(source, /buildHomeTodoDaySections/);
  assert.match(source, /const sevenDayCapacity = state\.tasksPerDay \* daySections\.length/);
  assert.match(source, /items=\{visibleTasks\}/);
  assert.match(source, /Later \(\{doLaterTasks\.length\}\)/);
  assert.match(source, /Settings2/);
  assert.match(source, /updateTasksPerDay\(tasksPerDay\)/);
  assert.match(source, /setIsSettingsOpen\(false\)/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(sortableSource, /renderBeforeItem\?:/);
  assert.match(sortableSource, /renderAfterItems\}/);
  assert.match(sortableSource, /renderBeforeItem\?\.\(item, index\)/);
  assert.match(sortableSource, /data-sortable-row=\{id\}/);
  assert.match(hookSource, /state: outgoing/);
  assert.match(hookSource, /tasksPerDay: nextTasksPerDay/);
  assert.match(hookSource, /cacheKey\(ownerId\)/);
  assert.match(source, /const HOME_TODO_TITLE_CLASS = "text-sm font-medium text-\[#26324f\] dark:text-white"/);
  assert.equal((source.match(/HOME_TODO_TITLE_CLASS/g) ?? []).length, 3);
  assert.match(source, /grid min-w-0 grid-cols-\[auto_auto_auto_minmax\(0,1fr\)_auto\] items-center gap-x-0/);
  assert.match(source, /const HOME_TODO_LIST_CLASS = "mt-3 space-y-2 max-sm:-mx-2"/);
  assert.match(source, /max-sm:-ml-3 sm:-ml-2 shrink-0/);
  assert.match(source, /<span className="ml-1 shrink-0 text-sm font-medium leading-5 text-\[#26324f\] dark:text-white">\s*\{index \+ 1\}\s*<\/span>/);
  assert.doesNotMatch(source, /h-7 w-7 shrink-0 items-center justify-center rounded-full border/);
  assert.doesNotMatch(source, /border-black bg-white text-xs font-semibold/);
  assert.match(source, /relative ml-2 flex h-8 w-8 shrink-0/);
  assert.match(source, /ml-2 min-w-0/);
  const renderTodoTask = source.slice(source.indexOf("function renderTodoTask"), source.indexOf("\n  useEffect", source.indexOf("function renderTodoTask")));
  const handleIndex = renderTodoTask.indexOf('className="max-sm:-ml-3 sm:-ml-2 shrink-0"');
  const numberIndex = renderTodoTask.indexOf('className="ml-1 shrink-0 text-sm font-medium leading-5');
  const statusIndex = renderTodoTask.indexOf('className="relative ml-2 flex h-8 w-8 shrink-0');
  const contentIndex = renderTodoTask.indexOf('className="ml-2 min-w-0"');
  const actionIndex = renderTodoTask.indexOf('<div className="flex shrink-0 items-center gap-1">');
  assert.ok(handleIndex >= 0 && handleIndex < numberIndex);
  assert.ok(numberIndex < statusIndex && statusIndex < contentIndex && contentIndex < actionIndex);
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
  assert.equal((source.match(/size="sm"/g) ?? []).length, 4);
  assert.match(source, /const HOME_TODO_ACTION_CLASS = "max-sm:!h-7 max-sm:!w-7"/);
  assert.match(source, /const HOME_TODO_ACTION_ICON_CLASS = "max-sm:!h-\[12\.25px\] max-sm:!w-\[12\.25px\]"/);
  assert.equal((source.match(/className=\{HOME_TODO_ACTION_CLASS\}/g) ?? []).length, 3);
  assert.equal((source.match(/iconClassName=\{HOME_TODO_ACTION_ICON_CLASS\}/g) ?? []).length, 3);
  assert.match(sharedIconButton, /sm: "h-8 w-8"/);
  assert.match(sharedIconButton, /sm: "h-3\.5 w-3\.5"/);
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
  assert.doesNotMatch(source, /due_on|due date|repeat_frequency/);
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
