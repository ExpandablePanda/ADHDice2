import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { Task } from "../src/lib/database.types.ts";
import type { TaskContentFolderRow } from "../src/lib/task-content-folders.ts";
import {
  buildHomeTaskRowHierarchy,
  buildHomeRoutineGroups,
  buildHomeRoutineSections,
  buildHomeTodoDaySections,
  buildHomeTodoHierarchy,
  createHomeScratchpadItem,
  createHomeScratchpadItems,
  createHomeTodoTask,
  deleteHomeRoutineSection,
  formatHomeRoutineDueLabel,
  formatHomeTodoDateLabel,
  getHomeTasksByCanonicalMembership,
  getHomeRoutineStreakMetadata,
  getHomeRoutineTaskIds,
  getHomeTodoSearchText,
  hasMeaningfulHomeTodoState,
  HOME_ROUTINE_UNSECTIONED_ID,
  isHomeTodoTaskEligible,
  mergeHomeTodoVisibleTaskIds,
  moveHomeScratchpadTextToItems,
  moveHomeRoutineTaskIdToSection,
  moveHomeTodoTaskId,
  moveHomeTodoTaskIdToEdge,
  moveHomeTodoTaskIdToVisibleEdge,
  moveHomeTodoTaskIdToUrgent,
  moveHomeUrgentTaskIdToTodo,
  normalizeHomeTodoTasksPerDay,
  normalizeHomeTodoRoutineSectionNames,
  normalizeHomeTodoState,
  normalizeHomeScratchpadItems,
  parseHomeScratchpadLines,
  reconcileHomeRoutineSectionAssignments,
  reconcileHomeRoutineTaskIds,
  reconcileHomeTodoTaskIds,
  reconcileHomeUrgentTaskIds,
  reorderHomeScratchpadItems,
  shouldPersistHomeRoutineReconciliation,
  sortHomeTodoSearchResults,
  type HomeTodoTaskMetadata,
} from "../src/lib/home-todo-state.ts";
import { getCalendarDayKey, getLogicalDayKey } from "../src/lib/logical-day.ts";
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

const homeTaskMetadata: HomeTodoTaskMetadata = {
  due_on: null,
  due_time: null,
  priority_level: 0,
  repeat_day_of_month: null,
  repeat_days_of_week: [],
  repeat_frequency: "none",
  repeat_interval: 1,
  repeat_monthly_mode: "day_of_month",
  repeat_monthly_ordinal: null,
  repeat_monthly_weekday: null,
  tags: [],
};

test("Home state V1/V4 payloads normalize to V8 with independent Routine defaults", () => {
  assert.deepEqual(normalizeHomeTodoState({
    clientUpdatedAt: "2026-07-28T12:00:00.000Z",
    schemaVersion: 1,
    taskIds: ["a", "a", "", 4, "b"],
  }), {
    clientUpdatedAt: "2026-07-28T12:00:00.000Z",
    schemaVersion: 8,
    taskIds: ["a", "b"],
    taskDayOffsets: {},
    tasksPerDay: 10,
    routineTaskIds: [],
    routineSections: [],
    routineSectionIdByTaskId: {},
    urgentTaskIds: [],
    scratchpadText: "",
    scratchpadItems: [],
  });
});

test("Home todo explicit day placement moves a task into an otherwise empty day", () => {
  const { sections, laterTaskIds } = buildHomeTodoDaySections(
    ["today", "tomorrow"],
    10,
    new Date("2026-08-23T12:00:00-04:00"),
    "America/New_York",
    { "tomorrow": 1 },
  );
  assert.deepEqual(sections[0]?.taskIds, ["today"]);
  assert.deepEqual(sections[1]?.taskIds, ["tomorrow"]);
  assert.deepEqual(laterTaskIds, []);
});

test("Home todo manual placement consumes only that day's automatic capacity", () => {
  const unassigned = Array.from({ length: 10 }, (_, index) => `automatic-${index}`);
  const { sections, laterTaskIds } = buildHomeTodoDaySections(
    ["pinned-today", ...unassigned],
    10,
    new Date("2026-08-23T12:00:00-04:00"),
    "America/New_York",
    { "pinned-today": 0 },
  );
  assert.equal(sections[0]?.taskIds.length, 10);
  assert.deepEqual(sections[0]?.taskIds, ["pinned-today", ...unassigned.slice(0, 9)]);
  assert.deepEqual(sections[1]?.taskIds, ["automatic-9"]);
  assert.deepEqual(laterTaskIds, []);
});

test("Home todo does not add automatic tasks to a full pinned day", () => {
  const pinned = Array.from({ length: 10 }, (_, index) => `pinned-${index}`);
  const { sections } = buildHomeTodoDaySections(
    [...pinned, "automatic"],
    10,
    new Date("2026-08-23T12:00:00-04:00"),
    "America/New_York",
    Object.fromEntries(pinned.map((taskId) => [taskId, 0])),
  );
  assert.deepEqual(sections[0]?.taskIds, pinned);
  assert.deepEqual(sections[1]?.taskIds, ["automatic"]);
});

test("Home todo enforces strict capacity for pinned tasks and spills them forward", () => {
  const pinned = Array.from({ length: 12 }, (_, index) => `pinned-${index}`);
  const { sections, laterTaskIds } = buildHomeTodoDaySections(
    [...pinned, "automatic-1", "automatic-2"],
    10,
    new Date("2026-08-23T12:00:00-04:00"),
    "America/New_York",
    Object.fromEntries(pinned.map((taskId) => [taskId, 0])),
  );
  assert.deepEqual(sections[0]?.taskIds, pinned.slice(0, 10));
  assert.deepEqual(sections[1]?.taskIds, [...pinned.slice(10), "automatic-1", "automatic-2"]);
  assert.deepEqual(laterTaskIds, []);
});

test("Home todo spills assigned overflow through full subsequent days and then Later", () => {
  const assigned = Array.from({ length: 7 }, (_, dayIndex) => (
    Array.from({ length: 11 }, (_, taskIndex) => `assigned-${dayIndex}-${taskIndex}`)
  )).flat();
  const taskDayOffsets = Object.fromEntries(assigned.map((taskId, index) => [taskId, Math.floor(index / 11)]));
  const sourceTaskIds = [...assigned, "explicit-later"];
  const { sections, laterTaskIds } = buildHomeTodoDaySections(sourceTaskIds, 10, new Date("2026-08-23T12:00:00-04:00"), "America/New_York", {
    ...taskDayOffsets,
    "explicit-later": 7,
  });

  assert.deepEqual(sections.map((section) => section.taskIds.length), [10, 10, 10, 10, 10, 10, 10]);
  assert.deepEqual(laterTaskIds, ["explicit-later", ...Array.from({ length: 7 }, (_, index) => `assigned-6-${index + 4}`)]);
  assert.deepEqual([...sections.flatMap((section) => section.taskIds), ...laterTaskIds].sort(), sourceTaskIds.sort());
});

test("Home todo applies pinned capacity independently across days", () => {
  const pinnedToday = ["today-pinned"];
  const pinnedTomorrow = ["tomorrow-pinned-1", "tomorrow-pinned-2", "tomorrow-pinned-3"];
  const automatic = Array.from({ length: 17 }, (_, index) => `automatic-${index}`);
  const { sections } = buildHomeTodoDaySections(
    [...pinnedToday, ...pinnedTomorrow, ...automatic],
    10,
    new Date("2026-08-23T12:00:00-04:00"),
    "America/New_York",
    Object.fromEntries([
      ...pinnedToday.map((taskId) => [taskId, 0]),
      ...pinnedTomorrow.map((taskId) => [taskId, 1]),
    ]),
  );
  assert.equal(sections[0]?.taskIds.length, 10);
  assert.equal(sections[1]?.taskIds.length, 10);
  assert.deepEqual(sections[2]?.taskIds, ["automatic-16"]);
});

test("Home todo Later pins do not consume normal-day capacity", () => {
  const automatic = Array.from({ length: 10 }, (_, index) => `automatic-${index}`);
  const { sections, laterTaskIds } = buildHomeTodoDaySections(
    ["later-pinned", ...automatic],
    10,
    new Date("2026-08-23T12:00:00-04:00"),
    "America/New_York",
    { "later-pinned": 7 },
  );
  assert.deepEqual(sections[0]?.taskIds, automatic);
  assert.deepEqual(laterTaskIds, ["later-pinned"]);
});

test("Home todo tasks-per-day accepts 10 through 15 and safely defaults invalid values", () => {
  assert.deepEqual([10, 11, 12, 13, 14, 15].map(normalizeHomeTodoTasksPerDay), [10, 11, 12, 13, 14, 15]);
  assert.equal(normalizeHomeTodoTasksPerDay(9), 10);
  assert.equal(normalizeHomeTodoTasksPerDay("12"), 10);
  assert.equal(normalizeHomeTodoTasksPerDay(null), 10);
});

test("Home todo re-projects every normal day within each selected capacity", () => {
  const taskIds = Array.from({ length: 106 }, (_, index) => `task-${index}`);
  for (const tasksPerDay of [10, 11, 12, 13, 14, 15]) {
    const { sections, laterTaskIds } = buildHomeTodoDaySections(taskIds, tasksPerDay);
    assert.ok(sections.every((section) => section.taskIds.length <= tasksPerDay));
    assert.deepEqual([...sections.flatMap((section) => section.taskIds), ...laterTaskIds].sort(), [...taskIds].sort());
  }
});

test("Home todo generates seven local calendar sections with Today, Tomorrow, weekdays, and ordinal dates", () => {
  const { sections, laterTaskIds } = buildHomeTodoDaySections(
    Array.from({ length: 71 }, (_, index) => `task-${index}`),
    10,
    new Date("2026-08-23T12:00:00-04:00"),
    "America/New_York",
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

test("Home todo uses calendar midnight instead of the logical-day cutoff", () => {
  const now = new Date("2026-08-24T02:00:00-04:00");
  const { sections } = buildHomeTodoDaySections([], 10, now, "America/New_York");
  assert.equal(getCalendarDayKey(now, "America/New_York"), "2026-08-24");
  assert.equal(getLogicalDayKey(now, { dayStartTime: "06:00", timezone: "America/New_York" }), "2026-08-23");
  assert.equal(sections[0]?.label, "Today · August 24th");
  assert.equal(sections[1]?.label, "Tomorrow · August 25th");
  assert.deepEqual(sections.map((section) => section.dateKey), [
    "2026-08-24",
    "2026-08-25",
    "2026-08-26",
    "2026-08-27",
    "2026-08-28",
    "2026-08-29",
    "2026-08-30",
  ]);
});

test("Home todo respects configured timezone at calendar boundaries", () => {
  const now = new Date("2026-08-24T01:00:00.000Z");
  assert.equal(getCalendarDayKey(now, "America/Los_Angeles"), "2026-08-23");
  assert.equal(getCalendarDayKey(now, "Asia/Tokyo"), "2026-08-24");
  assert.equal(buildHomeTodoDaySections([], 10, now, "America/Los_Angeles").sections[0]?.label, "Today · August 23rd");
  assert.equal(buildHomeTodoDaySections([], 10, now, "Asia/Tokyo").sections[0]?.label, "Today · August 24th");
});

test("Home todo date sections handle month, year, leap-day, and ordinal boundaries", () => {
  const labelsAt = (date: string) => buildHomeTodoDaySections([], 10, new Date(`${date}T12:00:00Z`), "UTC").sections.map((section) => section.label);
  assert.deepEqual(labelsAt("2026-12-31").slice(0, 3), [
    "Today · December 31st",
    "Tomorrow · January 1st",
    "Saturday · January 2nd",
  ]);
  assert.deepEqual(labelsAt("2028-02-28").slice(0, 3), [
    "Today · February 28th",
    "Tomorrow · February 29th",
    "Wednesday · March 1st",
  ]);
  assert.equal(labelsAt("2026-01-09")[2], "Sunday · January 11th");
  assert.equal(labelsAt("2026-01-20")[2], "Thursday · January 22nd");
  assert.equal(labelsAt("2026-01-21")[2], "Friday · January 23rd");
  assert.deepEqual(
    ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-11", "2026-01-12", "2026-01-13", "2026-01-21", "2026-01-22", "2026-01-23", "2026-01-31"]
      .map((date) => labelsAt(date)[0]?.split(" · ")[1]),
    ["January 1st", "January 2nd", "January 3rd", "January 11th", "January 12th", "January 13th", "January 21st", "January 22nd", "January 23rd", "January 31st"],
  );
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
    "task",
    async () => {
      createCalls += 1;
      return task("should-not-exist");
    },
    (taskId) => appendedTaskIds.push(taskId),
    homeTaskMetadata,
  );

  assert.equal(createdTask, null);
  assert.equal(createCalls, 0);
  assert.deepEqual(appendedTaskIds, []);
});

test("Home task creation trims the title and creates exactly one canonical task", async () => {
  let createCalls = 0;
  let receivedTitle = "";
  let receivedTaskTypeSelection = "";
  const canonicalTask = task("canonical-task", { title: "Capture this task" });

  const createdTask = await createHomeTodoTask(
    "  Capture this task  ",
    "practice",
    async (title, taskTypeSelectionValue) => {
      createCalls += 1;
      receivedTitle = title;
      receivedTaskTypeSelection = taskTypeSelectionValue;
      return canonicalTask;
    },
    () => {},
    homeTaskMetadata,
  );

  assert.equal(createdTask, canonicalTask);
  assert.equal(createCalls, 1);
  assert.equal(receivedTitle, "Capture this task");
  assert.equal(receivedTaskTypeSelection, "practice");
});

test("Home task creation forwards the Task selection and appends the returned canonical id", async () => {
  const appendedTaskIds: string[] = [];
  let receivedTitle = "";
  let receivedTaskTypeSelection = "";
  const canonicalTask = task("canonical-task");

  await createHomeTodoTask(
    "New task",
    "task",
    async (title, taskTypeSelectionValue) => {
      receivedTitle = title;
      receivedTaskTypeSelection = taskTypeSelectionValue;
      return canonicalTask;
    },
    (taskId) => appendedTaskIds.push(taskId),
    homeTaskMetadata,
  );

  assert.equal(receivedTitle, "New task");
  assert.equal(receivedTaskTypeSelection, "task");
  assert.deepEqual(appendedTaskIds, [canonicalTask.id]);
});

test("Home task creation does not append a phantom id when canonical creation fails", async () => {
  const appendedTaskIds: string[] = [];

  const createdTask = await createHomeTodoTask(
    "Retry me",
    "task",
    async () => null,
    (taskId) => appendedTaskIds.push(taskId),
    homeTaskMetadata,
  );

  assert.equal(createdTask, null);
  assert.deepEqual(appendedTaskIds, []);
});

test("Home task creation forwards all selected metadata to canonical creation", async () => {
  const appendedTaskIds: string[] = [];
  let receivedMetadata: HomeTodoTaskMetadata | null = null;
  const canonicalTask = task("canonical-task");
  const metadata: HomeTodoTaskMetadata = {
    due_on: "2026-09-22",
    due_time: "09:30",
    priority_level: 5,
    repeat_day_of_month: null,
    repeat_days_of_week: [1, 3, 5],
    repeat_frequency: "weekly",
    repeat_interval: 2,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    tags: ["planning", "morning"],
  };

  await createHomeTodoTask(
    "Metadata task",
    "custom:ruleset-1",
    async (_title, _selection, nextMetadata) => {
      receivedMetadata = nextMetadata;
      return canonicalTask;
    },
    (taskId) => appendedTaskIds.push(taskId),
    metadata,
  );

  assert.deepEqual(receivedMetadata, metadata);
  assert.deepEqual(appendedTaskIds, [canonicalTask.id]);
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

test("Home Routine projection uses Routine membership, Home eligibility, and source order", () => {
  const parent = task("routine-parent");
  const routineChild = task("routine-child", { parent_task_id: parent.id });
  const archivedParent = task("routine-archived-parent", { status: "archived" });
  const archivedChild = task("routine-archived-child", { parent_task_id: archivedParent.id });
  const trashedParent = task("routine-trashed-parent", { status: "trashed" });
  const trashedChild = task("routine-trashed-child", { parent_task_id: trashedParent.id });
  const routineStandalone = task("routine-standalone");
  const both = task("both");
  const complete = task("routine-complete", { status: "complete" });
  const archived = task("routine-archived", { status: "archived" });
  const trashed = task("routine-trashed", { status: "trashed" });
  const tasks = [parent, routineChild, archivedParent, archivedChild, trashedParent, trashedChild, routineStandalone, both, complete, archived, trashed];
  const memberships = {
    [parent.id]: [{ id: "routine" as const }],
    [routineChild.id]: [{ id: "routine" as const }],
    [archivedChild.id]: [{ id: "routine" as const }],
    [trashedChild.id]: [{ id: "routine" as const }],
    [routineStandalone.id]: [{ id: "routine" as const }],
    [both.id]: [{ id: "routine" as const }, { id: "home" as const }],
    [complete.id]: [{ id: "routine" as const }],
    [archived.id]: [{ id: "routine" as const }],
    [trashed.id]: [{ id: "routine" as const }],
  };

  assert.deepEqual(getHomeRoutineTaskIds(tasks, memberships), [
    "routine-parent",
    "routine-standalone",
    "both",
  ]);
});

test("Home Routine groups inherit nested descendants without duplicating direct child membership", () => {
  const parent = task("parent");
  const step = task("step", { parent_task_id: parent.id });
  const substep = task("substep", { parent_task_id: step.id });
  const standaloneChild = task("standalone-child", { parent_task_id: "missing-parent" });
  const tasks = [parent, step, substep, standaloneChild];
  const memberships = {
    [parent.id]: [{ id: "routine" as const }],
    [step.id]: [{ id: "routine" as const }],
    [standaloneChild.id]: [{ id: "routine" as const }],
  };
  const anchors = getHomeRoutineTaskIds(tasks, memberships);
  const groups = buildHomeRoutineGroups(anchors, tasks);

  assert.deepEqual(anchors, [parent, standaloneChild].map((entry) => entry.id));
  assert.deepEqual(groups[0]?.taskIds, [parent.id, step.id, substep.id]);
  assert.deepEqual(groups[0]?.tasks.map((entry) => [entry.task.id, entry.depth, entry.isAnchor]), [
    [parent.id, 0, true],
    [step.id, 1, false],
    [substep.id, 2, false],
  ]);
  assert.deepEqual(groups[1]?.taskIds, [standaloneChild.id]);
});

test("Home Routine uses direct membership as the anchor authority", () => {
  const parent = task("parent");
  const child = task("child", { parent_task_id: parent.id });
  const tasks = [parent, child];

  assert.deepEqual(
    getHomeRoutineTaskIds(tasks, {
      [child.id]: [{ id: "routine" as const }],
    }, {
      [child.id]: ["routine"],
    }),
    [child.id],
  );
  assert.deepEqual(
    getHomeRoutineTaskIds(tasks, {
      [parent.id]: [{ id: "routine" as const }],
      [child.id]: [{ id: "routine" as const }],
    }, {
      [parent.id]: ["routine"],
    }),
    [parent.id],
  );
});

test("Home Routine search representation includes inherited descendants", () => {
  const parent = task("parent");
  const step = task("step", { parent_task_id: parent.id });
  const tasks = [parent, step];
  const memberships = { [parent.id]: [{ id: "routine" as const }] };
  const anchors = getHomeRoutineTaskIds(tasks, memberships);
  const representedIds = buildHomeRoutineGroups(anchors, tasks).flatMap((group) => group.taskIds);

  assert.deepEqual(representedIds, [parent.id, step.id]);
  assert.equal(representedIds.includes(step.id), true);
});

test("Home Routine order reconciliation preserves, removes, deduplicates, and appends anchors", () => {
  assert.deepEqual(
    reconcileHomeRoutineTaskIds(["b", "missing", "b", "a"], ["a", "b", "c"]),
    ["b", "a", "c"],
  );
});

test("Home Routine persistence reconciliation uses the saved order and does not reset it to source order", () => {
  const savedOrder = ["anchor-b", "anchor-a"];
  const sourceOrder = ["anchor-a", "anchor-b", "anchor-c"];

  assert.deepEqual(reconcileHomeRoutineTaskIds(savedOrder, sourceOrder), ["anchor-b", "anchor-a", "anchor-c"]);
  assert.deepEqual(reconcileHomeRoutineTaskIds(["anchor-b", "stale"], sourceOrder), ["anchor-b", "anchor-a", "anchor-c"]);
  assert.deepEqual(reconcileHomeRoutineTaskIds(["anchor-b", "anchor-a", "anchor-c"], sourceOrder), ["anchor-b", "anchor-a", "anchor-c"]);
});

test("Home Routine persistence reconciliation waits for Home hydration", () => {
  assert.equal(shouldPersistHomeRoutineReconciliation("loading"), false);
  assert.equal(shouldPersistHomeRoutineReconciliation("local"), true);
  assert.equal(shouldPersistHomeRoutineReconciliation("synced"), true);
  assert.equal(shouldPersistHomeRoutineReconciliation("saving"), true);
});

test("Home V8 bootstrap recognizes meaningful state outside To-do taskIds", () => {
  const empty = normalizeHomeTodoState(null);
  assert.equal(hasMeaningfulHomeTodoState(empty), false);
  assert.equal(hasMeaningfulHomeTodoState({ ...empty, taskIds: ["todo"] }), true);
  assert.equal(hasMeaningfulHomeTodoState({ ...empty, taskDayOffsets: { todo: 2 }, taskIds: ["todo"] }), true);
  assert.equal(hasMeaningfulHomeTodoState({ ...empty, tasksPerDay: 15 }), true);
  assert.equal(hasMeaningfulHomeTodoState({ ...empty, routineTaskIds: ["routine"] }), true);
  assert.equal(hasMeaningfulHomeTodoState({ ...empty, routineSections: [{ id: "section-1", name: "Morning" }] }), true);
  assert.equal(hasMeaningfulHomeTodoState({ ...empty, routineSectionIdByTaskId: { routine: "section-1" } }), true);
  assert.equal(hasMeaningfulHomeTodoState({ ...empty, urgentTaskIds: ["urgent"] }), true);
  assert.equal(hasMeaningfulHomeTodoState({ ...empty, scratchpadText: "Call dentist\nPick up prescription" }), true);
  assert.equal(hasMeaningfulHomeTodoState({ ...empty, scratchpadItems: [{ id: "note", text: "Capture", createdAt: "2026-10-03T12:00:00.000Z" }] }), true);
});

test("Home V7 to V8 migration preserves existing state and initializes the notepad", () => {
  const migrated = normalizeHomeTodoState({
    clientUpdatedAt: "2026-10-02T12:00:00.000Z",
    schemaVersion: 7,
    taskIds: ["todo-b", "todo-a"],
    taskDayOffsets: { "todo-a": 2 },
    tasksPerDay: 15,
    routineTaskIds: ["routine"],
    routineSections: [{ id: "morning", name: "Morning" }],
    routineSectionIdByTaskId: { routine: "morning" },
    scratchpadItems: [{ id: "note", text: "Legacy capture", createdAt: "2026-10-03T12:00:00.000Z" }],
  });
  assert.deepEqual(migrated, {
    clientUpdatedAt: "2026-10-02T12:00:00.000Z",
    schemaVersion: 8,
    taskIds: ["todo-b", "todo-a"],
    taskDayOffsets: { "todo-a": 2 },
    tasksPerDay: 15,
    routineTaskIds: ["routine"],
    routineSections: [{ id: "morning", name: "Morning" }],
    routineSectionIdByTaskId: { routine: "morning" },
    urgentTaskIds: [],
    scratchpadText: "",
    scratchpadItems: [{ id: "note", text: "Legacy capture", createdAt: "2026-10-03T12:00:00.000Z" }],
  });
});

test("Home V1 through V6 migration defaults Urgent and Scratchpad without dropping legacy data", () => {
  for (const schemaVersion of [1, 2, 3, 4, 5, 6]) {
    const normalized = normalizeHomeTodoState({
      schemaVersion,
      taskIds: ["todo"],
      routineTaskIds: ["routine"],
      routinesPerSection: 3,
      routineSectionNames: { "0": "Morning" },
    });
    assert.deepEqual(normalized.urgentTaskIds, []);
    assert.deepEqual(normalized.scratchpadItems, []);
    assert.deepEqual(normalized.taskIds, ["todo"]);
    assert.deepEqual(normalized.routineTaskIds, ["routine"]);
  }
});

test("Home V8 round trip preserves Urgent order, multiline text, and Scratchpad order/content", () => {
  const state = normalizeHomeTodoState({
    schemaVersion: 8,
    urgentTaskIds: ["urgent-b", "urgent-a"],
    scratchpadText: "Call dentist\n\nFix billing page",
    scratchpadItems: [
      { id: "note-b", text: "Second note", createdAt: "2026-10-03T12:01:00.000Z" },
      { id: "note-a", text: "First note", createdAt: "2026-10-03T12:00:00.000Z" },
    ],
  });
  assert.deepEqual(normalizeHomeTodoState(state).urgentTaskIds, ["urgent-b", "urgent-a"]);
  assert.equal(normalizeHomeTodoState(state).scratchpadText, "Call dentist\n\nFix billing page");
  assert.deepEqual(normalizeHomeTodoState(state).scratchpadItems, state.scratchpadItems);
});

test("Home V8 normalization repairs Urgent/To-do overlap with Urgent precedence", () => {
  assert.deepEqual(normalizeHomeTodoState({
    schemaVersion: 8,
    taskIds: ["a", "b", "a", "d"],
    taskDayOffsets: { a: 0, b: 3, d: 7, stale: 2 },
    urgentTaskIds: ["b", "c", "b"],
  }), {
    clientUpdatedAt: "1970-01-01T00:00:00.000Z",
    schemaVersion: 8,
    taskIds: ["a", "d"],
    taskDayOffsets: { a: 0, d: 7 },
    tasksPerDay: 10,
    routineTaskIds: [],
    routineSections: [],
    routineSectionIdByTaskId: {},
    urgentTaskIds: ["b", "c"],
    scratchpadText: "",
    scratchpadItems: [],
  });
  const stable = normalizeHomeTodoState({
    schemaVersion: 8,
    taskIds: ["a", "b"],
    taskDayOffsets: { a: 0, b: 1 },
    urgentTaskIds: ["c", "d"],
  });
  assert.deepEqual(normalizeHomeTodoState(stable), stable);
});

test("Home Urgent membership stays independent from To-do and uses shared eligibility", () => {
  const tasks = [task("active"), task("done", { status: "complete" }), task("trashed", { trashed_at: "2026-10-03T12:00:00.000Z" })];
  assert.deepEqual(reconcileHomeUrgentTaskIds(["active", "done", "active", "missing", "trashed"], tasks), ["active"]);
  const state = normalizeHomeTodoState({ taskIds: ["today", "future", "later"], taskDayOffsets: { today: 0, future: 3, later: 7 }, urgentTaskIds: ["urgent"] });
  assert.deepEqual(moveHomeTodoTaskIdToUrgent(state, "today"), {
    taskIds: ["future", "later"],
    taskDayOffsets: { future: 3, later: 7 },
    urgentTaskIds: ["urgent", "today"],
  });
  assert.deepEqual(moveHomeTodoTaskIdToUrgent(state, "future"), {
    taskIds: ["today", "later"],
    taskDayOffsets: { today: 0, later: 7 },
    urgentTaskIds: ["urgent", "future"],
  });
  assert.deepEqual(moveHomeTodoTaskIdToUrgent(state, "later"), {
    taskIds: ["today", "future"],
    taskDayOffsets: { today: 0, future: 3 },
    urgentTaskIds: ["urgent", "later"],
  });
  assert.deepEqual(moveHomeTodoTaskIdToUrgent(state, "new"), {
    taskIds: ["today", "future", "later"],
    taskDayOffsets: { today: 0, future: 3, later: 7 },
    urgentTaskIds: ["urgent", "new"],
  });
  assert.deepEqual(moveHomeTodoTaskIdToUrgent({ ...state, urgentTaskIds: ["urgent", "today"] }, "today"), {
    taskIds: ["future", "later"],
    taskDayOffsets: { future: 3, later: 7 },
    urgentTaskIds: ["urgent", "today"],
  });
  assert.deepEqual(moveHomeUrgentTaskIdToTodo(state, "urgent", 1), {
    taskIds: ["today", "future", "later", "urgent"],
    taskDayOffsets: { today: 0, future: 3, later: 7, urgent: 1 },
    urgentTaskIds: [],
  });
  assert.deepEqual(moveHomeUrgentTaskIdToTodo(state, "urgent", 7), {
    taskIds: ["today", "future", "later", "urgent"],
    taskDayOffsets: { today: 0, future: 3, later: 7, urgent: 7 },
    urgentTaskIds: [],
  });
});

test("Home Scratchpad helpers trim, reject malformed entries, create unique IDs, and reorder stably", () => {
  assert.deepEqual(normalizeHomeScratchpadItems([
    { id: " note ", text: "  Keep this  ", createdAt: "2026-10-03T12:00:00.000Z" },
    { id: "note", text: "duplicate", createdAt: "2026-10-03T12:00:00.000Z" },
    { id: "blank", text: " ", createdAt: "2026-10-03T12:00:00.000Z" },
    { id: "bad-date", text: "Bad", createdAt: "not-a-date" },
  ]), [{ id: "note", text: "Keep this", createdAt: "2026-10-03T12:00:00.000Z" }]);
  const item = createHomeScratchpadItem("  Capture  ", new Date("2026-10-03T12:02:00.000Z"), ["scratchpad-fixed"]);
  assert.equal(item?.text, "Capture");
  assert.equal(item?.createdAt, "2026-10-03T12:02:00.000Z");
  assert.deepEqual(reorderHomeScratchpadItems([
    { id: "a", text: "A", createdAt: "2026-10-03T12:00:00.000Z" },
    { id: "b", text: "B", createdAt: "2026-10-03T12:01:00.000Z" },
  ], ["b", "missing"] as string[]).map((entry) => entry.id), ["b", "a"]);
});

test("Home Scratchpad line staging trims, skips blanks, preserves order, and keeps duplicate text", () => {
  assert.deepEqual(parseHomeScratchpadLines(" Call dentist \n\n Pick up prescription\r\nFix billing page \n"), [
    "Call dentist",
    "Pick up prescription",
    "Fix billing page",
  ]);
  const items = createHomeScratchpadItems(
    " Same line \n\nSame line",
    new Date("2026-10-03T12:03:00.000Z"),
    ["scratchpad-existing"],
  );
  assert.deepEqual(items.map((item) => item.text), ["Same line", "Same line"]);
  assert.equal(new Set(items.map((item) => item.id)).size, 2);
  const moved = moveHomeScratchpadTextToItems({
    scratchpadText: "old draft",
    scratchpadItems: [{ id: "existing", text: "Existing", createdAt: "2026-10-03T12:00:00.000Z" }],
  }, " First \n\nSecond ", new Date("2026-10-03T12:04:00.000Z"));
  assert.equal(moved?.scratchpadText, "");
  assert.deepEqual(moved?.scratchpadItems.map((item) => item.text), ["Existing", "First", "Second"]);
  assert.equal(new Set(moved?.scratchpadItems.map((item) => item.id)).size, 3);
  assert.ok(moved?.scratchpadItems.slice(1).every((item) => item.createdAt === "2026-10-03T12:04:00.000Z"));
  assert.equal(moveHomeScratchpadTextToItems({ scratchpadText: "", scratchpadItems: [] }, " \n\t"), null);
});

test("Home V5 Routine chunks migrate to stable explicit V8 sections", () => {
  const migrated = normalizeHomeTodoState({
    clientUpdatedAt: "2026-07-28T12:00:00.000Z",
    schemaVersion: 5,
    routineTaskIds: ["a", "b", "c", "d"],
    routinesPerSection: 3,
    routineSectionNames: { "0": "  Morning ", "1": "Evening" },
  });
  assert.equal(migrated.schemaVersion, 8);
  assert.deepEqual(migrated.routineSections, [
    { id: "routine-section-0", name: "Morning" },
    { id: "routine-section-1", name: "Evening" },
  ]);
  assert.deepEqual(migrated.routineTaskIds, ["a", "b", "c", "d"]);
  assert.deepEqual(migrated.routineSectionIdByTaskId, {
    a: "routine-section-0",
    b: "routine-section-0",
    c: "routine-section-0",
    d: "routine-section-1",
  });
  assert.deepEqual(buildHomeRoutineSections(migrated.routineTaskIds, migrated.routineSections, migrated.routineSectionIdByTaskId).map((section) => section.groupIds), [["a", "b", "c"], ["d"]]);
});

test("Home V4 Routine capacity migrates to V8 without losing order", () => {
  const migrated = normalizeHomeTodoState({
    schemaVersion: 4,
    taskIds: [],
    routineTaskIds: ["routine-b", "routine-a"],
    routinesPerPhase: 4,
  });
  assert.equal(migrated.schemaVersion, 8);
  assert.deepEqual(migrated.routineSections, [{ id: "routine-section-0", name: "Section 1" }]);
  assert.deepEqual(migrated.routineTaskIds, ["routine-b", "routine-a"]);
  assert.deepEqual(migrated.routineSectionIdByTaskId, { "routine-b": "routine-section-0", "routine-a": "routine-section-0" });
  assert.equal(normalizeHomeTodoState({ routinesPerSection: 2, routinesPerPhase: 6 }).routineSections.length, 0);
});

test("Home Routine section names trim valid ordinal keys and discard malformed values", () => {
  assert.deepEqual(normalizeHomeTodoRoutineSectionNames({
    "0": "  Morning  ",
    "1": " ",
    "01": "Leading zero",
    "-1": "Negative",
    invalid: "Malformed",
    "2": 3,
  }), { "0": "Morning" });
});

test("Home V6 normalization preserves stable IDs and explicit empty sections", () => {
  const normalized = normalizeHomeTodoState({
    schemaVersion: 6,
    routineTaskIds: ["a"],
    routineSections: [
      { id: "morning", name: "Morning" },
      { id: "empty", name: "Empty" },
    ],
    routineSectionIdByTaskId: { a: "morning" },
  });
  const normalizedAgain = normalizeHomeTodoState(normalized);
  assert.deepEqual(normalizedAgain.routineSections, normalized.routineSections);
  assert.deepEqual(normalizedAgain.routineSectionIdByTaskId, normalized.routineSectionIdByTaskId);
  assert.deepEqual(buildHomeRoutineSections(normalized.routineTaskIds, normalized.routineSections, normalized.routineSectionIdByTaskId).map((section) => section.groupIds), [["a"], []]);
});

test("Home V6 preserves Routine assignments outside Home To-do membership", () => {
  const sections = [{ id: "breakfast", name: "Breakfast" }, { id: "test-3", name: "Test Section 3" }];
  for (const taskIds of [[], ["unrelated-todo"]]) {
    const normalized = normalizeHomeTodoState({
      schemaVersion: 6,
      taskIds,
      routineTaskIds: ["vacuum"],
      routineSections: sections,
      routineSectionIdByTaskId: { vacuum: "test-3" },
    });
    assert.deepEqual(normalized.routineSectionIdByTaskId, { vacuum: "test-3" });
  }
});

test("Home V6 assignments have one section per Routine and safe stale fallback", () => {
  const state = normalizeHomeTodoState({
    schemaVersion: 8,
    routineTaskIds: ["a", "b"],
    routineSections: [{ id: "morning", name: "Morning" }, { id: "evening", name: "Evening" }],
    routineSectionIdByTaskId: { a: "morning", b: "unknown", stale: "evening" },
  });
  assert.deepEqual(state.routineSectionIdByTaskId, { a: "morning", b: "morning" });
  assert.equal(Object.keys(state.routineSectionIdByTaskId).filter((taskId) => taskId === "a").length, 1);
});

test("Home Routine section moves append to the destination and no-op in the current section", () => {
  const routineTaskIds = ["a", "b", "c", "d"];
  const assignments = { a: "morning", b: "morning", c: "evening", d: "evening" };
  const moved = moveHomeRoutineTaskIdToSection(routineTaskIds, assignments, "b", "evening");
  assert.deepEqual(moved.routineTaskIds, ["a", "c", "d", "b"]);
  assert.equal(moved.routineSectionIdByTaskId.b, "evening");
  assert.deepEqual(moveHomeRoutineTaskIdToSection(routineTaskIds, assignments, "b", "morning"), {
    routineTaskIds,
    routineSectionIdByTaskId: assignments,
  });
});

test("Home Routine section deletion preserves Home state and moves only its groups to persistent Unsectioned", () => {
  const base = normalizeHomeTodoState({
    schemaVersion: 8,
    taskIds: ["todo"],
    taskDayOffsets: { todo: 2 },
    routineTaskIds: ["a", "b", "c", "d"],
    routineSections: [
      { id: "first", name: "First" },
      { id: "middle", name: "Middle" },
      { id: "last", name: "Last" },
    ],
    routineSectionIdByTaskId: { a: "first", b: "middle", c: "middle", d: "last" },
    urgentTaskIds: ["urgent"],
    scratchpadText: "keep this",
    scratchpadItems: [{ id: "note", text: "keep this too" }],
  });

  const deleted = deleteHomeRoutineSection(base.routineSections, base.routineSectionIdByTaskId, base.routineTaskIds, "middle");
  assert.ok(deleted);
  const next = normalizeHomeTodoState({ ...base, ...deleted });
  assert.deepEqual(next.routineSections, [{ id: "first", name: "First" }, { id: "last", name: "Last" }]);
  assert.deepEqual(next.routineTaskIds, ["a", "b", "c", "d"]);
  assert.deepEqual(next.routineSectionIdByTaskId, { a: "first", b: HOME_ROUTINE_UNSECTIONED_ID, c: HOME_ROUTINE_UNSECTIONED_ID, d: "last" });
  assert.deepEqual(next.taskIds, base.taskIds);
  assert.deepEqual(next.taskDayOffsets, base.taskDayOffsets);
  assert.deepEqual(next.urgentTaskIds, base.urgentTaskIds);
  assert.equal(next.scratchpadText, base.scratchpadText);
  assert.deepEqual(next.scratchpadItems, base.scratchpadItems);
  assert.deepEqual(buildHomeRoutineSections(next.routineTaskIds, next.routineSections, next.routineSectionIdByTaskId).map((section) => [section.id, section.groupIds]), [
    ["first", ["a"]], ["last", ["d"]], [HOME_ROUTINE_UNSECTIONED_ID, ["b", "c"]],
  ]);
  assert.equal(deleteHomeRoutineSection(next.routineSections, next.routineSectionIdByTaskId, next.routineTaskIds, "middle"), null);
});

test("Home Routine deletion handles empty, first, last, and only sections without renumbering", () => {
  const emptySections = [{ id: "empty", name: "Empty" }, { id: "kept", name: "Kept" }];
  const emptyDelete = deleteHomeRoutineSection(emptySections, { routine: "kept" }, ["routine"], "empty");
  assert.deepEqual(emptyDelete, { routineSections: [{ id: "kept", name: "Kept" }], routineSectionIdByTaskId: { routine: "kept" } });

  const firstDelete = deleteHomeRoutineSection(emptySections, { routine: "kept" }, ["routine"], "kept");
  assert.deepEqual(firstDelete?.routineSections, [{ id: "empty", name: "Empty" }]);
  assert.deepEqual(firstDelete?.routineSectionIdByTaskId, { routine: HOME_ROUTINE_UNSECTIONED_ID });

  const onlyDelete = deleteHomeRoutineSection([{ id: "only", name: "Only" }], { a: "only", b: "only" }, ["a", "b"], "only");
  const persisted = normalizeHomeTodoState({ schemaVersion: 8, routineTaskIds: ["a", "b"], ...onlyDelete });
  assert.deepEqual(persisted.routineSections, []);
  assert.deepEqual(persisted.routineSectionIdByTaskId, { a: HOME_ROUTINE_UNSECTIONED_ID, b: HOME_ROUTINE_UNSECTIONED_ID });
  assert.deepEqual(buildHomeRoutineSections(persisted.routineTaskIds, persisted.routineSections, persisted.routineSectionIdByTaskId).map((section) => section.groupIds), [["a", "b"]]);
  const withNewSection = normalizeHomeTodoState({
    ...persisted,
    routineSections: [...persisted.routineSections, { id: "new-id", name: "New Section" }],
  });
  assert.deepEqual(withNewSection.routineSectionIdByTaskId, persisted.routineSectionIdByTaskId);
  assert.equal(buildHomeRoutineSections(withNewSection.routineTaskIds, withNewSection.routineSections, withNewSection.routineSectionIdByTaskId).at(-1)?.label, "Unsectioned");
});

test("Home Routine Unsectioned assignments survive moves, sorting, normalization, and remote-state reconstruction", () => {
  const state = normalizeHomeTodoState({
    schemaVersion: 8,
    routineTaskIds: ["named", "unsectioned-a", "other", "unsectioned-b"],
    routineSections: [{ id: "named-section", name: "Named" }, { id: "other-section", name: "Other" }],
    routineSectionIdByTaskId: {
      named: "named-section", "unsectioned-a": HOME_ROUTINE_UNSECTIONED_ID,
      other: "other-section", "unsectioned-b": HOME_ROUTINE_UNSECTIONED_ID,
    },
  });
  const restored = normalizeHomeTodoState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored, state);

  const movedToNamed = moveHomeRoutineTaskIdToSection(restored.routineTaskIds, restored.routineSectionIdByTaskId, "unsectioned-a", "named-section");
  const movedBack = moveHomeRoutineTaskIdToSection(movedToNamed.routineTaskIds, movedToNamed.routineSectionIdByTaskId, "unsectioned-a", HOME_ROUTINE_UNSECTIONED_ID);
  assert.deepEqual(movedBack.routineSectionIdByTaskId, restored.routineSectionIdByTaskId);
  assert.deepEqual(movedBack.routineTaskIds, ["named", "other", "unsectioned-b", "unsectioned-a"]);
  const unsectioned = buildHomeRoutineSections(movedBack.routineTaskIds, restored.routineSections, movedBack.routineSectionIdByTaskId).at(-1)!;
  assert.deepEqual(unsectioned.groupIds, ["unsectioned-b", "unsectioned-a"]);
  const reordered = mergeHomeTodoVisibleTaskIds(movedBack.routineTaskIds, unsectioned.groupIds, ["unsectioned-a", "unsectioned-b"]);
  assert.deepEqual(reordered, ["named", "other", "unsectioned-a", "unsectioned-b"]);
  assert.deepEqual(new Set(reordered), new Set(["named", "other", "unsectioned-a", "unsectioned-b"]));
});

test("Home Routine section moves survive V6 normalization", () => {
  const state = normalizeHomeTodoState({
    schemaVersion: 6,
    taskIds: [],
    routineTaskIds: ["a", "b", "c"],
    routineSections: [{ id: "breakfast", name: "Breakfast" }, { id: "test-3", name: "Test Section 3" }],
    routineSectionIdByTaskId: { a: "breakfast", b: "breakfast", c: "test-3" },
  });
  const moved = moveHomeRoutineTaskIdToSection(state.routineTaskIds, state.routineSectionIdByTaskId, "a", "test-3");
  const normalized = normalizeHomeTodoState({ ...state, ...moved });
  const rendered = buildHomeRoutineSections(normalized.routineTaskIds, normalized.routineSections, normalized.routineSectionIdByTaskId);

  assert.equal(normalized.routineSectionIdByTaskId.a, "test-3");
  assert.deepEqual(rendered.map((section) => section.groupIds), [["b"], ["c", "a"]]);
});

test("Home Routine membership reconciliation removes stale assignments and gives new members the last section", () => {
  const reconciled = reconcileHomeRoutineSectionAssignments(
    [{ id: "morning", name: "Morning" }, { id: "evening", name: "Evening" }],
    { removed: "morning", existing: "morning" },
    ["existing", "new"],
  );
  assert.deepEqual(reconciled.routineSectionIdByTaskId, { existing: "morning", new: "evening" });
  assert.deepEqual(reconcileHomeRoutineSectionAssignments(reconciled.routineSections, reconciled.routineSectionIdByTaskId, ["existing"]).routineSectionIdByTaskId, { existing: "morning" });
});

test("Home Routine due metadata formats each task's own date and omits missing dates", () => {
  assert.equal(formatHomeRoutineDueLabel({ due_on: "2026-09-19", due_time: null }), "9/19/26");
  assert.equal(formatHomeRoutineDueLabel({ due_on: "2026-09-19", due_time: "08:30" }), "9/19/26 · 8:30 AM");
  assert.equal(formatHomeRoutineDueLabel({ due_on: null, due_time: "08:30" }), null);
  const parent = task("parent", { due_on: "2026-09-19", due_time: null });
  const child = task("child", { due_on: "2026-09-20", due_time: null, parent_task_id: parent.id });
  assert.equal(formatHomeRoutineDueLabel(child), "9/20/26");
});

test("Home Routine streak metadata uses missed precedence and omits zero values", () => {
  assert.deepEqual(getHomeRoutineStreakMetadata({ currentStreak: 4, missedStreak: 2 }), { count: 2, kind: "missed" });
  assert.deepEqual(getHomeRoutineStreakMetadata({ currentStreak: 4, missedStreak: 0 }), { count: 4, kind: "current" });
  assert.equal(getHomeRoutineStreakMetadata({ currentStreak: 0, missedStreak: 0 }), null);
  assert.equal(getHomeRoutineStreakMetadata(undefined), null);
});

test("Home Routine drag order moves whole groups and leaves To-do state independent", () => {
  const parent = task("parent");
  const child = task("child", { parent_task_id: parent.id });
  const other = task("other");
  const todoTaskIds = ["todo-a", "todo-b"];
  const groups = buildHomeRoutineGroups([parent.id, other.id], [parent, child, other]);
  const reorderedGroups = reorderListItems(groups, 0, 1);

  assert.deepEqual(reorderedGroups.map((group) => group.anchorId), [other.id, parent.id]);
  assert.deepEqual(reorderedGroups[1]?.taskIds, [parent.id, child.id]);
  assert.deepEqual(todoTaskIds, ["todo-a", "todo-b"]);
});

test("Home Routine edge actions move anchors, preserve descendants, and keep explicit sections", () => {
  const parent = task("parent");
  const child = task("child", { parent_task_id: parent.id });
  const middle = task("middle");
  const last = task("last");
  const routineTaskIds = [parent.id, middle.id, last.id];
  const routineSections = [{ id: "morning", name: "Morning" }, { id: "work", name: "Work" }, { id: "later", name: "Later" }];
  const assignments = { [parent.id]: "morning", [middle.id]: "work", [last.id]: "later" };

  const movedToTop = moveHomeTodoTaskIdToEdge(routineTaskIds, middle.id, "top");
  const movedToBottom = moveHomeTodoTaskIdToEdge(routineTaskIds, middle.id, "bottom");

  assert.deepEqual(movedToTop, [middle.id, parent.id, last.id]);
  assert.deepEqual(movedToBottom, [parent.id, last.id, middle.id]);
  assert.deepEqual(moveHomeTodoTaskIdToEdge(routineTaskIds, parent.id, "top"), routineTaskIds);
  assert.deepEqual(moveHomeTodoTaskIdToEdge(routineTaskIds, last.id, "bottom"), routineTaskIds);

  const movedGroups = buildHomeRoutineGroups(movedToTop, [parent, child, middle, last]);
  assert.deepEqual(movedGroups.map((group) => group.anchorId), [middle.id, parent.id, last.id]);
  assert.deepEqual(movedGroups[1]?.taskIds, [parent.id, child.id]);
  assert.deepEqual(buildHomeRoutineSections(routineTaskIds, routineSections, assignments).map((section) => section.label), ["Morning", "Work", "Later"]);
  assert.deepEqual(buildHomeRoutineSections(movedToTop, routineSections, assignments).map((section) => section.label), ["Morning", "Work", "Later"]);
  assert.deepEqual(buildHomeRoutineSections(movedToBottom, routineSections, assignments).map((section) => section.label), ["Morning", "Work", "Later"]);
  assert.deepEqual(routineTaskIds, [parent.id, middle.id, last.id]);
});

test("Home state rejects malformed Routine order, capacity, and names while preserving To-do fields", () => {
  assert.deepEqual(normalizeHomeTodoState({
    clientUpdatedAt: "not-a-date",
    schemaVersion: 3,
    taskIds: ["todo-a", "todo-a"],
    taskDayOffsets: { "todo-a": 2 },
    tasksPerDay: 15,
    routineTaskIds: ["routine-a", "routine-a", "", 4],
    routinesPerSection: 0,
    routineSectionNames: { "0": "  Morning  ", "1": " ", "-1": "Invalid", bad: "Invalid", "2": 3 },
  }), {
    clientUpdatedAt: new Date(0).toISOString(),
    schemaVersion: 8,
    taskIds: ["todo-a"],
    taskDayOffsets: { "todo-a": 2 },
    tasksPerDay: 15,
    routineTaskIds: ["routine-a"],
    routineSections: [{ id: "routine-section-0", name: "Morning" }],
    routineSectionIdByTaskId: { "routine-a": "routine-section-0" },
    urgentTaskIds: [],
    scratchpadText: "",
    scratchpadItems: [],
  });
});

test("Home Routine projection is unlimited and independent of To-do capacity", () => {
  const tasks = Array.from({ length: 25 }, (_, index) => task(`routine-${index}`));
  const memberships = Object.fromEntries(tasks.map((entry) => [entry.id, [{ id: "routine" as const }]]));

  assert.equal(getHomeRoutineTaskIds(tasks, memberships).length, 25);
});

test("Home todo reconciliation prunes duplicates, missing rows, and unavailable tasks", () => {
  const tasks = [task("a"), task("b"), task("done", { status: "complete" })];
  assert.deepEqual(reconcileHomeTodoTaskIds(["b", "missing", "a", "b", "done"], tasks), ["b", "a"]);
});

test("Home todo reconciliation is presentation-only and preserves durable membership", () => {
  const persistedTaskIds = ["a", "b", "c", "d"];
  assert.deepEqual(reconcileHomeTodoTaskIds(persistedTaskIds, [task("a"), task("d")]), ["a", "d"]);
  assert.deepEqual(persistedTaskIds, ["a", "b", "c", "d"]);
});

test("Home todo temporarily missing IDs reappear in their original positions", () => {
  const persistedTaskIds = ["a", "b", "c", "d"];
  assert.deepEqual(reconcileHomeTodoTaskIds(persistedTaskIds, [task("a"), task("d")]), ["a", "d"]);
  assert.deepEqual(reconcileHomeTodoTaskIds(persistedTaskIds, [task("a"), task("b"), task("c"), task("d")]), ["a", "b", "c", "d"]);
});

test("Home todo empty or partial runtime reads do not erase durable membership", () => {
  const persistedTaskIds = ["a", "b", "c", "d"];
  assert.deepEqual(reconcileHomeTodoTaskIds(persistedTaskIds, []), []);
  assert.deepEqual(reconcileHomeTodoTaskIds(persistedTaskIds, [task("a")]), ["a"]);
  assert.deepEqual(persistedTaskIds, ["a", "b", "c", "d"]);
});

test("Home todo visible reorder preserves unresolved IDs", () => {
  assert.deepEqual(
    mergeHomeTodoVisibleTaskIds(["a", "b", "c", "d"], ["a", "d"], ["d", "a"]),
    ["d", "b", "c", "a"],
  );
});

test("Home todo repeated visible reorders preserve unresolved IDs", () => {
  const visibleTaskIds = ["a", "d"];
  const once = mergeHomeTodoVisibleTaskIds(["a", "b", "c", "d"], visibleTaskIds, ["d", "a"]);
  assert.deepEqual(mergeHomeTodoVisibleTaskIds(once, visibleTaskIds, ["a", "d"]), ["a", "b", "c", "d"]);
  assert.deepEqual(mergeHomeTodoVisibleTaskIds(once, visibleTaskIds, ["d", "a"]), ["d", "b", "c", "a"]);
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

test("Home todo edge actions preserve unresolved IDs and explicit removal deletes exactly one ID", () => {
  assert.deepEqual(moveHomeTodoTaskIdToEdge(["a", "b", "c", "d"], "d", "top"), ["d", "a", "b", "c"]);
  assert.deepEqual(moveHomeTodoTaskIdToEdge(["a", "b", "c", "d"], "a", "bottom"), ["b", "c", "d", "a"]);
  assert.deepEqual(["a", "b", "c", "d"].filter((taskId) => taskId !== "c"), ["a", "b", "d"]);
});

test("Home todo arrows move the task globally and assign the matching edge day", () => {
  const state = {
    taskDayOffsets: { a: 0, b: 0, c: 1, d: 1, e: 7, f: 7 },
    taskIds: ["a", "b", "c", "d", "e", "f"],
  };
  const movedUpIds = moveHomeTodoTaskIdToEdge(state.taskIds, "d", "top");
  const movedUpOffsets = { ...state.taskDayOffsets, d: 0 };
  assert.deepEqual(movedUpIds, ["d", "a", "b", "c", "e", "f"]);
  assert.equal(movedUpOffsets.d, 0);

  const movedDownIds = moveHomeTodoTaskIdToEdge(state.taskIds, "b", "bottom");
  const movedDownOffsets = { ...state.taskDayOffsets, b: 7 };
  assert.deepEqual(movedDownIds, ["a", "c", "d", "e", "f", "b"]);
  assert.equal(movedDownOffsets.b, 7);
  assert.deepEqual(state.taskIds, ["a", "b", "c", "d", "e", "f"]);
});

test("Home todo edge actions move within the visible section and preserve other-day order", () => {
  const durableTaskIds = ["hidden-a", "a", "b", "c", "hidden-b", "d"];
  const visibleTaskIds = ["a", "b", "c"];

  assert.deepEqual(
    moveHomeTodoTaskIdToVisibleEdge(durableTaskIds, visibleTaskIds, "c", "top"),
    ["hidden-a", "c", "a", "b", "hidden-b", "d"],
  );
  assert.deepEqual(
    moveHomeTodoTaskIdToVisibleEdge(durableTaskIds, visibleTaskIds, "a", "bottom"),
    ["hidden-a", "b", "c", "a", "hidden-b", "d"],
  );
});

test("Home todo changing tasksPerDay does not change durable taskIds", () => {
  const state = normalizeHomeTodoState({ taskIds: ["a", "b", "c", "d"], tasksPerDay: 10 });
  const changed = normalizeHomeTodoState({ ...state, tasksPerDay: 15 });
  assert.deepEqual(changed.taskIds, state.taskIds);
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

test("Home Attention and Missed projections use canonical memberships without mutating Home state", () => {
  const attention = task("attention", { status: "missed" });
  const missed = task("missed");
  const statusOnlyMissed = task("status-only-missed", { status: "missed" });
  const completeAttention = task("complete-attention", { status: "complete" });
  const tasks = [attention, missed, statusOnlyMissed, completeAttention];
  const memberships = {
    attention: [{ id: "attention" }],
    missed: [{ id: "missed" }],
    "status-only-missed": [],
    "complete-attention": [{ id: "attention" }],
  };
  const state = normalizeHomeTodoState({ taskIds: ["missed"], urgentTaskIds: ["attention"], routineTaskIds: ["routine"] });

  assert.deepEqual(getHomeTasksByCanonicalMembership(tasks, memberships, "attention").map((entry) => entry.id), ["attention"]);
  assert.deepEqual(getHomeTasksByCanonicalMembership(tasks, memberships, "missed").map((entry) => entry.id), ["missed"]);
  assert.deepEqual(state.taskIds, ["missed"]);
  assert.deepEqual(state.urgentTaskIds, ["attention"]);
  assert.deepEqual(state.routineTaskIds, ["routine"]);

  const refreshedMemberships = { ...memberships, missed: [{ id: "missed" }, { id: "attention" }] };
  assert.deepEqual(getHomeTasksByCanonicalMembership(tasks, refreshedMemberships, "attention").map((entry) => entry.id), ["attention", "missed"]);
  assert.deepEqual(getHomeTasksByCanonicalMembership(tasks, { ...refreshedMemberships, missed: [] }, "missed").map((entry) => entry.id), []);
});

test("Home Task rows combine canonical root Folder paths with parent Task ancestry", () => {
  const folders = [
    { id: "projects", name: "Projects", parent_folder_id: null },
    { id: "games", name: "Games", parent_folder_id: "projects" },
  ] as TaskContentFolderRow[];
  const root = task("root", { title: "Madden Franchise", task_content_folder_id: "games" });
  const step = task("step", { title: "Weekly Tasks", parent_task_id: root.id });
  const substep = task("substep", { title: "Review Stats", parent_task_id: step.id });
  const parentOnly = task("parent-only", { title: "Parent Task" });
  const childWithoutFolder = task("child-without-folder", { title: "Child Task", parent_task_id: parentOnly.id });
  const tasks = [root, step, substep, parentOnly, childWithoutFolder];

  assert.deepEqual(buildHomeTaskRowHierarchy(root, tasks, folders), ["Projects", "Games"]);
  assert.deepEqual(buildHomeTaskRowHierarchy(step, tasks, folders), ["Projects", "Games", "Madden Franchise"]);
  assert.deepEqual(buildHomeTaskRowHierarchy(substep, tasks, folders), ["Projects", "Games", "Madden Franchise", "Weekly Tasks"]);
  assert.deepEqual(buildHomeTaskRowHierarchy(childWithoutFolder, tasks, folders), ["Parent Task"]);
  assert.deepEqual(buildHomeTaskRowHierarchy(task("plain", { title: "Plain Task" }), [task("plain", { title: "Plain Task" })], folders), []);
  assert.equal(buildHomeTaskRowHierarchy(step, tasks, folders).includes("Weekly Tasks"), false);
});

test("Home To-do search includes existing members and guards duplicate adds", () => {
  const source = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
  assert.match(source, /const todoTaskIdSet = new Set\(reconciledTaskIds\)/);
  assert.match(source, /const urgentTaskIdSet = new Set\(reconciledUrgentTaskIds\)/);
  assert.match(source, /isInTodo = todoTaskIdSet\.has\(task\.id\)/);
  assert.match(source, /isInUrgent = urgentTaskIdSet\.has\(task\.id\)/);
  assert.match(source, /activeHomeTab === "urgent" \? isInUrgent : activeHomeTab === "todo" \? isInTodo \|\| isInUrgent : false/);
  assert.match(source, /promoteHomeSearchResultToUrgent/);
  assert.match(source, /taskIds\.includes\(taskId\) \? taskIds : \[\.\.\.taskIds, taskId\]/);
  assert.match(source, /buildHomeTodoHierarchy\(task, tasks, taskById\)/);
  assert.match(source, /sortHomeTodoSearchResults\(tasks/);
  assert.match(source, /membershipLabel.*"In Urgent"/);
  assert.match(source, /In To-do/);
});

test("Home derived tabs use canonical membership, retain task controls, and avoid Home-local actions", () => {
  const source = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
  const homeStateSource = readFileSync(new URL("../src/lib/home-todo-state.ts", import.meta.url), "utf8");
  const renderSource = source.slice(source.indexOf("function renderHomeTask"), source.indexOf("\n  useEffect", source.indexOf("function renderHomeTask")));
  const derivedViewStart = source.lastIndexOf(') : activeHomeTab === "attention" ?');
  const derivedViewEnd = source.indexOf(') : (', derivedViewStart);
  const derivedViewSource = source.slice(derivedViewStart, derivedViewEnd);

  assert.match(source, /export type HomePanelTab = "urgent" \| "todo" \| "attention" \| "missed" \| "routine" \| "scratchpad"/);
  assert.match(source, /getHomeTasksByCanonicalMembership\(tasks, listMembershipsByTaskId, "attention", taskById\)/);
  assert.match(source, /getHomeTasksByCanonicalMembership\(tasks, listMembershipsByTaskId, "missed", taskById\)/);
  assert.match(homeStateSource, /export function getHomeTasksByCanonicalMembership[\s\S]*isHomeTodoTaskEligible\(task, tasks, taskById\)/);
  assert.match(source, /activeHomeTab === "attention" \|\| activeHomeTab === "missed" \? null/);
  assert.match(source, /if \(creationTab === "attention" \|\| creationTab === "missed"\) return null/);
  assert.match(source, /if \(activeHomeTab === "attention" \|\| activeHomeTab === "missed"\) return;/);
  assert.match(source, /activeHomeTab === "todo" \? "To-do list"[\s\S]*activeHomeTab === "attention" \? "Attention"[\s\S]*activeHomeTab === "missed" \? "Missed"[\s\S]*activeHomeTab === "routine" \? "Routine"[\s\S]*"Scratchpad"/);
  assert.match(source, /<AdhdChip[\s\S]*>\s*Urgent\s*<\/AdhdChip>[\s\S]*<AdhdChip[\s\S]*>\s*To-do\s*<\/AdhdChip>[\s\S]*<AdhdChip[\s\S]*>\s*Attention\s*<\/AdhdChip>[\s\S]*<AdhdChip[\s\S]*>\s*Missed\s*<\/AdhdChip>[\s\S]*<AdhdChip[\s\S]*>\s*Routine\s*<\/AdhdChip>[\s\S]*<AdhdChip[\s\S]*>\s*Scratchpad\s*<\/AdhdChip>/);
  assert.match(source, /No tasks need Attention right now\./);
  assert.match(source, /No missed tasks right now\./);
  assert.match(source, /const isDerived = mode === "attention" \|\| mode === "missed"/);
  assert.match(renderSource, /const hierarchy = buildHomeTaskRowHierarchy\(task, tasks, taskContentFolders, taskById, taskHierarchy\)/);
  assert.doesNotMatch(renderSource, /buildHomeTodoHierarchy\(task, tasks, taskById\)/);
  assert.match(source, /renderHomeTask\(task, index, handle, "urgent"\)/);
  assert.match(source, /renderHomeTask\(task, index, handle, "todo"\)/);
  assert.match(source, /renderHomeTask\([\s\S]*"routine"[\s\S]*\)/);
  assert.match(derivedViewSource, /attentionTasks\.map\(\(task, index\) => renderHomeTask\(task, index, null, "attention"\)\)/);
  assert.match(derivedViewSource, /missedTasks\.map\(\(task, index\) => renderHomeTask\(task, index, null, "missed"\)\)/);
  assert.match(renderSource, /!isRoutineChild && !isDerived \? <span className="max-sm:-ml-3 sm:-ml-2 shrink-0">\{handle\}<\/span>/);
  assert.match(renderSource, /!isRoutineChild && !isDerived \? \(/);
  assert.match(renderSource, /renderTaskStatusCircle\(displayStatus, "sm"\)/);
  assert.match(renderSource, /onClick=\{\(\) => onOpenTask\(task\.id\)\}/);
  assert.match(renderSource, /attentionReason=\{taskAttentionReasonByTaskId\[task\.id\]\}/);
  assert.doesNotMatch(homeStateSource, /taskAttentionReasonByTaskId/);
  assert.doesNotMatch(derivedViewSource, /SortableList|updateTaskIds|updateUrgentTaskIds|updateRoutineTaskIds|onSetRoutineMembership|Move to Top|Move to Bottom|Remove from Home To-do|Remove from Attention|Remove from Missed/);
});

test("Home derived task rows use canonical Task-ID keys and preserve Routine row keys", () => {
  const source = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
  const renderStart = source.indexOf("function renderHomeTask");
  const renderEnd = source.indexOf("\n  useEffect", renderStart);
  const renderSource = source.slice(renderStart, renderEnd);
  const derivedViewStart = source.lastIndexOf(') : activeHomeTab === "attention" ?');
  const derivedViewEnd = source.indexOf(') : (', derivedViewStart);
  const derivedViewSource = source.slice(derivedViewStart, derivedViewEnd);

  assert.match(renderSource, /key=\{rowKey \?\? task\.id\}/);
  assert.doesNotMatch(renderSource, /key=\{index\}/);
  assert.match(derivedViewSource, /attentionTasks\.map\(\(task, index\) => renderHomeTask\(task, index, null, "attention"\)\)/);
  assert.match(derivedViewSource, /missedTasks\.map\(\(task, index\) => renderHomeTask\(task, index, null, "missed"\)\)/);
  assert.match(source, /renderHomeTask\(\s*task,\s*reconciledRoutineTaskIds\.indexOf\(group\.anchorId\),\s*isAnchor \? handle : null,\s*"routine",\s*`\$\{group\.anchorId\}-\$\{task\.id\}`,/);
});

test("Home Urgent search uses guarded Priority 5 promotion before the shared exclusive move", () => {
  const source = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
  const urgentSearchSource = readFileSync(new URL("../src/lib/home-urgent-search.ts", import.meta.url), "utf8");
  const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const searchAddStart = source.indexOf("async function addSearchResult");
  const searchAddEnd = source.indexOf("\n  function saveScratchpadDraft", searchAddStart);
  const searchAddSource = source.slice(searchAddStart, searchAddEnd);
  const priorityIndex = urgentSearchSource.indexOf('await onSetTaskPriority(taskId, "5")');
  const failureGuardIndex = urgentSearchSource.indexOf("if (!promoted) return false;");
  const moveIndex = urgentSearchSource.indexOf("moveTodoTaskToUrgent(taskId)");
  assert.match(source, /reconcileHomeUrgentTaskIds\(state\.urgentTaskIds, tasks\)/);
  assert.match(searchAddSource, /promoteHomeSearchResultToUrgent/);
  assert.match(urgentSearchSource, /await onSetTaskPriority\(taskId, "5"\)/);
  assert.match(urgentSearchSource, /moveTodoTaskToUrgent\(taskId\)/);
  assert.ok(priorityIndex >= 0 && priorityIndex < failureGuardIndex && failureGuardIndex < moveIndex);
  assert.match(source, /priority_level: 5 as const/);
  assert.match(source, /moveUrgentTaskToTodo\(task\.id, destination\.dayOffset\)/);
  assert.match(source, /moveTodoTaskToUrgent\(task\.id\)/);
  assert.match(source, /Move to Urgent/);
  assert.match(source, /Move to To-do/);
  assert.match(source, /Remove from Urgent/);
  assert.match(source, /onReorder=\{\(nextTasks\) => updateUrgentTaskIds\(\(\) => nextTasks\.map\(\(task\) => task\.id\)\)\}/);
  assert.match(taskAppSource, /onSetTaskPriority=\{\(taskId, priority\) => setTaskPriority\(taskId, priority\)\}/);
  assert.doesNotMatch(searchAddSource, /task\.is_urgent|is_urgent|task\.status|task\.due_on|task\.repeat/);
});

test("Home shared Task search stays in shell flow for Urgent, To-do, and Routine while Scratchpad remains separate", () => {
  const source = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
  const panelStart = source.indexOf('{isSearchOpen && query.trim() ? (');
  const panelEnd = source.indexOf("\n          ) : null}", panelStart);
  const panelSource = source.slice(panelStart, panelEnd);
  assert.match(panelSource, /max-h-\[min\(55vh,26rem\)\] overflow-y-auto/);
  assert.doesNotMatch(panelSource, /absolute|inset-x-0|top-full/);
  assert.match(source, /activeHomeTab === "scratchpad"/);
  assert.match(source, /activeHomeTab === "urgent"/);
  assert.match(source, /activeHomeTab === "todo"/);
  assert.match(source, /activeHomeTab === "routine"/);
  assert.match(source, /<textarea/);
  assert.match(source, /placeholder="Write freely…"/);
  assert.match(source, /Move lines to items/);
});

test("Home Scratchpad is non-Task state and conversion preserves source until canonical creation succeeds", () => {
  const source = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
  const hookSource = readFileSync(new URL("../src/hooks/useHomeTodoState.ts", import.meta.url), "utf8");
  const composerSource = readFileSync(new URL("../src/components/task-app/task-creation-composer.tsx", import.meta.url), "utf8");
  assert.match(source, /placeholder="Write freely…"/);
  assert.match(source, /saveScratchpadText\(scratchpadDraft\)/);
  assert.match(source, /moveScratchpadTextToItems\(scratchpadDraft\)/);
  assert.match(source, /setScratchpadDraft\(""\)/);
  assert.match(source, /onKeyDown=\{\(event\) => \{[\s\S]*event\.key === "Escape"/);
  assert.match(source, /updateScratchpadItem\(itemId, scratchpadEditDraft\)/);
  assert.match(source, /Convert to Task/);
  assert.match(source, /initialTitle=\{state\.scratchpadItems\.find/);
  assert.match(source, /updateTaskDayOffset\(createdTask\.id, 0\)/);
  assert.match(source, /deleteScratchpadItem\(conversionItemId\)/);
  assert.match(hookSource, /moveHomeScratchpadTextToItems/);
  assert.match(hookSource, /scratchpadText: text/);
  assert.match(hookSource, /reorderHomeScratchpadItems/);
  assert.match(composerSource, /initialTitle\?: string/);
  assert.match(composerSource, /const \[title, setTitle\] = useState\(initialTitle\)/);
});

test("shared drag reorder moves Home task ids without mutating the source", () => {
  const source = ["a", "b", "c"];
  assert.deepEqual(reorderListItems(source, 0, 2), ["b", "c", "a"]);
  assert.deepEqual(source, ["a", "b", "c"]);
});

test("Home todo renders explicit Routine sections, settings, and the recovered task behavior", () => {
  const source = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
  const creationComposerSource = readFileSync(new URL("../src/components/task-app/task-creation-composer.tsx", import.meta.url), "utf8");
  const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const sharedIconButton = readFileSync(new URL("../src/components/ui-system/adhd-icon-button.tsx", import.meta.url), "utf8");
  const sortableSource = readFileSync(new URL("../src/components/ui/sortable-list.tsx", import.meta.url), "utf8");
  const hookSource = readFileSync(new URL("../src/hooks/useHomeTodoState.ts", import.meta.url), "utf8");
  const logicalDaySource = readFileSync(new URL("../src/lib/logical-day.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /HOME_TODO_VISIBLE_LIMIT/);
  assert.match(source, /buildHomeTodoDaySections/);
  assert.match(source, /buildHomeTodoDaySections\(todoTasks\.map\(\(task\) => task\.id\), state\.tasksPerDay, new Date\(calendarNowMs\), calendarTimeZone, state\.taskDayOffsets\)/);
  assert.match(source, /const sevenDayCapacity = dayTaskIds\.length/);
  assert.match(source, /items=\{visibleTasks\}/);
  assert.match(source, /mergeHomeTodoVisibleTaskIds\(\s*taskIds,\s*visibleTasks\.map\(\(task\) => task\.id\),\s*nextTasks\.map\(\(task\) => task\.id\),\s*\)/);
  assert.doesNotMatch(source, /updateTaskIds\(\(\) => reconciledTaskIds\)/);
  assert.match(source, /const durableTaskIndex = isUrgent \? state\.urgentTaskIds\.indexOf\(task\.id\) : state\.taskIds\.indexOf\(task\.id\)/);
  assert.match(source, /const renderedDayOffset = isUrgent \? null : daySections\.find\(\(section\) => section\.taskIds\.includes\(task\.id\)\)/);
  assert.match(source, /const isAtAbsoluteTop = !isRoutine && durableTaskIndex === 0 && \(isUrgent \|\| renderedDayOffset === 0\)/);
  assert.match(source, /const isAtAbsoluteBottom = !isRoutine && durableTaskIndex === \(isUrgent \? state\.urgentTaskIds\.length : state\.taskIds\.length\) - 1/);
  assert.match(source, /const routineSectionIndex = isRoutine && routineSectionGroupIds \? routineSectionGroupIds\.indexOf\(task\.id\) : index/);
  assert.match(source, /const isAtRoutineTop = isRoutine && routineSectionIndex === 0/);
  assert.match(source, /const isAtRoutineBottom = isRoutine && routineSectionIndex === routineSectionLength - 1/);
  assert.match(source, /moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "top"\)/);
  assert.match(source, /moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "bottom"\)/);
  assert.match(source, /updateTaskDayOffset\(task\.id, 0\)/);
  assert.match(source, /updateTaskDayOffset\(task\.id, 7\)/);
  assert.match(source, /Later \(\{doLaterTasks\.length\}\)/);
  assert.match(source, /Settings2/);
  assert.match(source, /updateTasksPerDay\(capacity\)/);
  assert.match(source, /buildHomeRoutineSections/);
  assert.match(source, /routineSections/);
  assert.match(source, /routineSectionIdByTaskId/);
  assert.match(source, /items=\{sectionRoutineGroups\}/);
  assert.match(source, /mergeHomeTodoVisibleTaskIds\([\s\S]*section\.groupIds[\s\S]*nextGroups\.map/);
  assert.match(source, /shouldPersistHomeRoutineReconciliation\(syncStatus\)/);
  assert.match(source, /updateRoutineTaskIds\(\(currentRoutineTaskIds\) => reconcileHomeRoutineTaskIds\(currentRoutineTaskIds, routineTaskIds\)/);
  assert.match(source, /createRoutineSection/);
  assert.match(source, /New section/);
  assert.match(source, /updateRoutineSectionName/);
  assert.match(source, /Delete \$\{section\.label\}/);
  assert.match(source, /routineSectionDeleteConfirmation/);
  assert.match(source, /Delete Section/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /groupCount > 0/);
  assert.match(source, /HOME_ROUTINE_UNSECTIONED_ID/);
  assert.match(source, /section\.groupIds/);
  assert.match(source, /updateRoutineTaskSection/);
  assert.match(source, /Move to section/);
  assert.doesNotMatch(source, /updateRoutinesPerSection|state\.routinesPerSection|state\.routineSectionNames/);
  assert.match(source, /TaskCurrentStreakChip/);
  assert.match(source, /streak\?\.kind === "missed"/);
  assert.match(source, /formatHomeRoutineDueLabel/);
  assert.doesNotMatch(source, /Phase/);
  assert.doesNotMatch(source, /Saving…|Loading…|Synced|Saved locally/);
  assert.match(source, /setIsSettingsOpen\(false\)/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(sortableSource, /renderBeforeItem\?:/);
  assert.match(sortableSource, /renderAfterItems\}/);
  assert.match(sortableSource, /renderBeforeItem\?\.\(item, index\)/);
  assert.match(sortableSource, /data-sortable-row=\{id\}/);
  assert.match(source, /daySections\s*\.filter\(\(section\) => section\.startIndex === index\)\s*\.map\(renderDaySectionHeader\)/);
  assert.match(sortableSource, /data-sortable-drop-index/);
  assert.match(sortableSource, /getDropZoneIndex\(rawIndex: number, itemCount: number\)/);
  assert.match(sortableSource, /dropZoneId: string \| null/);
  assert.match(sortableSource, /data-sortable-placeholder/);
  assert.match(sortableSource, /Drop “\{drag\.label\}” here/);
  assert.match(sortableSource, /processPointerMove\(event\.clientY\)/);
  assert.match(hookSource, /state: outgoing/);
  assert.match(hookSource, /tasksPerDay: nextTasksPerDay/);
  assert.match(hookSource, /schemaVersion: 8/);
  assert.match(hookSource, /routineSections/);
  assert.match(hookSource, /routineSectionIdByTaskId/);
  assert.match(hookSource, /createRoutineSection/);
  assert.match(hookSource, /updateRoutineTaskSection/);
  assert.match(hookSource, /const deleteRoutineSection = useCallback/);
  assert.match(hookSource, /deleteHomeRoutineSection\(/);
  assert.match(hookSource, /commitState\(\{ \.\.\.current, \.\.\.nextRoutineState \}\)/);
  assert.match(hookSource, /hasMeaningfulHomeTodoState\(cached\)/);
  assert.match(hookSource, /cacheKey\(ownerId\)/);
  assert.match(hookSource, /persistCache\(next, userId\)/);
  assert.match(hookSource, /state: outgoing,\s*user_id: userId/);
  assert.match(logicalDaySource, /export function getCalendarDayKey/);
  assert.match(logicalDaySource, /export function getLogicalDayKey/);
  assert.match(taskAppSource, /calendarNowMs=\{logicalDayNow\}/);
  assert.match(taskAppSource, /calendarTimeZone=\{userTimeZone\}/);
  assert.match(taskAppSource, /taskHistoryStreakSummaries=\{effectiveTaskHistoryStreakSummaries\}/);
  assert.match(taskAppSource, /manualMembershipsByTaskId=\{manualMembershipsByTaskId\}/);
  assert.match(source, /const HOME_TODO_TITLE_CLASS = "text-sm font-medium text-\[#26324f\] dark:text-white"/);
  assert.equal((source.match(/HOME_TODO_TITLE_CLASS/g) ?? []).length, 5);
  assert.match(source, /grid min-w-0 grid-cols-\[auto_auto_auto_minmax\(0,1fr\)_auto\] items-center gap-x-0/);
  assert.match(source, /const HOME_TODO_LIST_CLASS = "mt-3 space-y-2 max-sm:-mx-2"/);
  assert.match(source, /max-sm:-ml-3 sm:-ml-2 shrink-0/);
  assert.match(source, /<span className="ml-1 shrink-0 text-sm font-medium leading-5 text-\[#26324f\] dark:text-white">\s*\{index \+ 1\}\s*<\/span>/);
  assert.doesNotMatch(source, /h-7 w-7 shrink-0 items-center justify-center rounded-full border/);
  assert.doesNotMatch(source, /border-black bg-white text-xs font-semibold/);
  assert.match(source, /relative ml-2 flex h-8 w-8 shrink-0/);
  assert.match(source, /ml-2 min-w-0/);
  const renderHomeTask = source.slice(source.indexOf("function renderHomeTask"), source.indexOf("\n  useEffect", source.indexOf("function renderHomeTask")));
  const handleIndex = renderHomeTask.indexOf('className="max-sm:-ml-3 sm:-ml-2 shrink-0"');
  const numberIndex = renderHomeTask.indexOf('className="ml-1 shrink-0 text-sm font-medium leading-5');
  const statusIndex = renderHomeTask.indexOf('className="relative ml-2 flex h-8 w-8 shrink-0');
  const contentIndex = renderHomeTask.indexOf('className="ml-2 min-w-0"');
  const actionIndex = renderHomeTask.indexOf('className="relative flex shrink-0 items-center gap-1"');
  assert.ok(handleIndex >= 0 && handleIndex < numberIndex);
  assert.ok(numberIndex < statusIndex && statusIndex < contentIndex && contentIndex < actionIndex);
  assert.match(source, /<Settings2 aria-hidden="true" \/>/);
  assert.match(source, /aria-haspopup="menu"/);
  assert.match(source, /role="menu"/);
  assert.match(source, /renderTaskStatusCircle\(displayStatus, "sm"\)/);
  assert.doesNotMatch(source, /renderTaskStatusCircle\(displayStatus, "sm", \{ className: "!h-7 !w-7"/);
  assert.doesNotMatch(source, /flex shrink-0 flex-col items-center/);
  assert.doesNotMatch(source, /basis-full/);
  assert.match(source, /<ArrowUpToLine aria-hidden="true"/);
  assert.match(source, /<ArrowDownToLine aria-hidden="true"/);
  assert.match(source, /updateRoutineTaskIds\(\(taskIds\) => moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "top"\)\)/);
  assert.match(source, /updateRoutineTaskIds\(\(taskIds\) => moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "bottom"\)\)/);
  assert.match(source, /const isRoutineChild = isRoutine && !isRoutineGroupAnchor/);
  assert.match(source, /!isRoutineChild && !isDerived \? \(/);
  assert.doesNotMatch(source, /<ArrowUp aria-hidden/);
  assert.doesNotMatch(source, /<ArrowDown aria-hidden/);
  assert.match(source, /const durableTaskIndex = isUrgent \? state\.urgentTaskIds\.indexOf\(task\.id\) : state\.taskIds\.indexOf\(task\.id\)/);
  assert.match(source, /const renderedDayOffset = isUrgent \? null : daySections\.find\(\(section\) => section\.taskIds\.includes\(task\.id\)\)/);
  assert.match(source, /const isAtAbsoluteTop = !isRoutine && durableTaskIndex === 0 && \(isUrgent \|\| renderedDayOffset === 0\)/);
  assert.match(source, /const isAtAbsoluteBottom = !isRoutine && durableTaskIndex === \(isUrgent \? state\.urgentTaskIds\.length : state\.taskIds\.length\) - 1/);
  assert.match(source, /moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "top"\)/);
  assert.match(source, /moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "bottom"\)/);
  assert.match(source, /updateTaskDayOffset\(task\.id, 0\)/);
  assert.match(source, /updateTaskDayOffset\(task\.id, 7\)/);
  assert.match(source, /from Home To-do/);
  assert.match(source, /<Minus aria-hidden="true"/);
  assert.match(source, /const HOME_TODO_ACTION_CLASS = "max-sm:!h-7 max-sm:!w-7"/);
  assert.match(source, /const HOME_TODO_ACTION_ICON_CLASS = "max-sm:!h-\[12\.25px\] max-sm:!w-\[12\.25px\]"/);
  assert.equal((renderHomeTask.match(/<Settings2 aria-hidden="true" \/>/g) ?? []).length, 1);
  assert.match(renderHomeTask, /onPointerDown=\{beginGearLongPress\}/);
  assert.match(sharedIconButton, /sm: "h-8 w-8"/);
  assert.match(sharedIconButton, /sm: "h-3\.5 w-3\.5"/);
  assert.match(source, /text-\[#d65775\]/);
  assert.match(source, /aria-label=\{`Delete \$\{section\.label\}`\}[\s\S]*?className="h-6 w-6"[\s\S]*?iconClassName="h-3 w-3"[\s\S]*?tone="danger"[\s\S]*?variant="rowToolbar"/);
  assert.match(source, /-mx-\[15px\] w-auto px-3 pb-32 pt-6 sm:mx-auto sm:px-4/);
  assert.doesNotMatch(source, /Search your Tasks and arrange the order you want to work through\./);
  assert.match(source, /<div className="relative mt-2" ref=\{searchRef\}>/);
  assert.match(source, /<TaskStatusCircleRail/);
  assert.match(source, /onClick=\{\(\) => onOpenTask\(task\.id\)\}/);
  assert.match(source, /useState<HomePanelTab>\("urgent"\)/);
  assert.match(source, /<AdhdChip[\s\S]*>\s*Urgent\s*<\/AdhdChip>[\s\S]*<AdhdChip[\s\S]*>\s*To-do\s*<\/AdhdChip>[\s\S]*<AdhdChip[\s\S]*>\s*Attention\s*<\/AdhdChip>[\s\S]*<AdhdChip[\s\S]*>\s*Missed\s*<\/AdhdChip>[\s\S]*<AdhdChip[\s\S]*>\s*Routine\s*<\/AdhdChip>[\s\S]*<AdhdChip[\s\S]*>\s*Scratchpad\s*<\/AdhdChip>/);
  assert.match(source, /getHomeRoutineTaskIds/);
  assert.match(source, /manualMembershipsByTaskId/);
  assert.match(source, /routineTaskIds/);
  assert.match(source, /routineGroups\.flatMap/);
  assert.match(source, /onSetRoutineMembership/);
  assert.match(source, /routineTasks\.map/);
  assert.match(source, /No Routine tasks yet\./);
  assert.match(source, /activeHomeTab === "routine"/);
  assert.match(source, /const isRoutineSearch = activeHomeTab === "routine"/);
  assert.match(source, /const todoTaskIdSet = new Set\(reconciledTaskIds\)/);
  assert.match(source, /const urgentTaskIdSet = new Set\(reconciledUrgentTaskIds\)/);
  assert.match(source, /isInTodo = todoTaskIdSet\.has\(task\.id\)/);
  assert.match(source, /isInUrgent = urgentTaskIdSet\.has\(task\.id\)/);
  assert.match(source, /async function addSearchResult\(taskId: string\)/);
  assert.match(source, /taskIds\.includes\(taskId\) \? taskIds : \[\.\.\.taskIds, taskId\]/);
  assert.match(source, /In To-do/);
  assert.match(source, /onSetRoutineMembership\(taskId, true\)/);
  assert.match(source, /onSetRoutineMembership\(task\.id, false\)/);
  assert.match(source, /creationTab === "todo" \|\| creationTab === "scratchpad"/);
  assert.match(source, /<TaskCreationComposer[\s\S]*onCreate=\{handleCreateTask\}/);
  assert.match(creationComposerSource, /const \[taskTypeSelection, setTaskTypeSelection\] = useState\(initialTaskTypeSelection\)/);
  assert.match(creationComposerSource, /<TaskTypeSelect[\s\S]*ariaLabel="Task Type"[\s\S]*options=\{taskTypeOptions\}[\s\S]*value=\{taskTypeSelection\}/);
  assert.doesNotMatch(source, /EditorCollapsibleSection/);
  assert.doesNotMatch(source, /CompactDateTimeField/);
  assert.doesNotMatch(source, /CompactSelectField/);
  assert.doesNotMatch(source, /TagChipInput/);
  assert.doesNotMatch(source, /Task details|TASK DETAILS/);
  assert.match(creationComposerSource, /aria-label="Due date"[\s\S]*TASK_TABLE_INPUT_CLASS/);
  assert.match(creationComposerSource, /aria-label="Due time"[\s\S]*TASK_TABLE_INPUT_CLASS/);
  assert.match(creationComposerSource, /<TaskTableChipButton[\s\S]*setPriority/);
  assert.match(creationComposerSource, /getSelectedTaskPriorityToneClass/);
  assert.match(creationComposerSource, /TASK_PRIORITY_LEVEL_OPTIONS/);
  assert.match(creationComposerSource, /<TaskRepeatEditor/);
  assert.match(creationComposerSource, /Search or add a tag/);
  assert.match(creationComposerSource, /TASK_TABLE_ACTIVE_LIST_CHIP_CLASS/);
  assert.match(creationComposerSource, /dedupeTaskTagLabels/);
  assert.match(creationComposerSource, /buildMetadata\(\)/);
  assert.match(creationComposerSource, /initialTaskTypeSelection = "task"/);
  assert.match(creationComposerSource, /type="submit"/);
  assert.match(creationComposerSource, /Cancel/);
  assert.match(source, /setIsSearchOpen\(true\)/);
  assert.match(source, /setQuery\(""\)/);
  assert.doesNotMatch(source, /font-semibold leading-5/);
  assert.doesNotMatch(source, /text-\[#443d60\]/);
  assert.doesNotMatch(readFileSync(new URL("../src/lib/home-todo-state.ts", import.meta.url), "utf8"), /getLogicalDayKey/);
});

test("Home Routine section updates use canonical Routine ordering", () => {
  const hookSource = readFileSync(new URL("../src/hooks/useHomeTodoState.ts", import.meta.url), "utf8");
  const updateStart = hookSource.indexOf("const updateRoutineTaskSection");
  const updateEnd = hookSource.indexOf("\n  return {", updateStart);
  const updateSource = hookSource.slice(updateStart, updateEnd);

  assert.match(updateSource, /moveHomeRoutineTaskIdToSection\(\s*current\.routineTaskIds,\s*currentRoutineState\.routineSectionIdByTaskId,/);
  assert.doesNotMatch(updateSource, /currentRoutineState\.routineTaskIds/);
  assert.match(updateSource, /nextRoutineState\.routineTaskIds\) === JSON\.stringify\(current\.routineTaskIds\)/);
});

test("Home Routine deletion and movement stay within Home assignment persistence", () => {
  const hookSource = readFileSync(new URL("../src/hooks/useHomeTodoState.ts", import.meta.url), "utf8");
  const deleteStart = hookSource.indexOf("const deleteRoutineSection");
  const deleteEnd = hookSource.indexOf("const updateRoutineSectionName", deleteStart);
  const deleteSource = hookSource.slice(deleteStart, deleteEnd);
  assert.match(deleteSource, /stateRef\.current/);
  assert.match(deleteSource, /deleteHomeRoutineSection\(/);
  assert.match(deleteSource, /commitState\(\{ \.\.\.current, \.\.\.nextRoutineState \}\)/);
  assert.doesNotMatch(deleteSource, /updateTask|parent_task_id|history|archive|trash/i);

  const homeSource = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
  assert.match(homeSource, /routineSections\.filter\(\(section\) => section\.id !== HOME_ROUTINE_UNSECTIONED_ID\)/);
  assert.match(homeSource, /\{ id: HOME_ROUTINE_UNSECTIONED_ID, label: "Unsectioned" \}/);
  assert.match(homeSource, /group\.tasks\.map\(\(\{ depth, isAnchor, task \}\)/);
  assert.match(homeSource, /setRoutineSectionDeleteConfirmation\(null\)/);
});

test("useHomeTodoState exposes V8 Urgent and Scratchpad mutations through shared persistence", () => {
  const hookSource = readFileSync(new URL("../src/hooks/useHomeTodoState.ts", import.meta.url), "utf8");
  assert.match(hookSource, /const commitState = useCallback/);
  assert.match(hookSource, /const updateUrgentTaskIds = useCallback/);
  assert.match(hookSource, /const moveUrgentTaskToTodo = useCallback/);
  assert.match(hookSource, /const moveTodoTaskToUrgent = useCallback/);
  assert.match(hookSource, /const saveScratchpadText = useCallback/);
  assert.match(hookSource, /const moveScratchpadTextToItems = useCallback/);
  assert.match(hookSource, /const updateScratchpadItem = useCallback/);
  assert.match(hookSource, /const deleteScratchpadItem = useCallback/);
  assert.match(hookSource, /const reorderScratchpadItems = useCallback/);
  assert.match(hookSource, /schemaVersion: 8/);
  assert.match(hookSource, /persistCache\(next, userId\)/);
  assert.match(hookSource, /scheduleWrite\(\)/);
});

test("TaskApp passes Home creation through the shared canonical addTask seam", () => {
  const source = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  assert.match(source, /<TaskHomePage[\s\S]*onCreateTaskWithType=\{createHomeTodoTaskWithType\}/);
  assert.match(source, /<TaskHomePage[\s\S]*onSetTaskPriority=\{\(taskId, priority\) => setTaskPriority\(taskId, priority\)\}/);
  assert.match(source, /<TaskHomePage[\s\S]*taskTypeOptions=\{taskTypeOptions\}/);
  assert.doesNotMatch(source, /const createTaskFromComposer = useCallback/);
  assert.doesNotMatch(source, /createTaskAndOpenSharedEditor\([\s\S]*draft\.metadata/);
  const homeCreationStart = source.indexOf("const createHomeTodoTaskWithType");
  const homeCreationEnd = source.indexOf("const taskTypeOptions", homeCreationStart);
  const homeCreation = source.slice(homeCreationStart, homeCreationEnd);
  assert.match(homeCreation, /resolveTaskTypeSelection\(selectionValue, customBehaviorRulesets\)/);
  assert.match(homeCreation, /custom_ruleset_id: selection\.customRulesetId/);
  assert.match(homeCreation, /task_type: selection\.taskType/);
  assert.match(homeCreation, /addTask\([\s\S]*buildNewTaskDraft\(title, \{ dueOn: todayKey \}\)/);
  assert.match(homeCreation, /\.\.\.metadata/);
  assert.match(homeCreation, /buildTaskPriorityUpdate\(metadata\.priority_level\)/);
  assert.match(homeCreation, /if \(!selection\) \{[\s\S]*setMessage\(\{ tone: "warn", text: "That Task Type is no longer available\." \}\);[\s\S]*return null;/);
  assert.doesNotMatch(homeCreation, /selection \?\?/);
  assert.doesNotMatch(homeCreation, /updateTask\(/);
  const homeStart = source.indexOf("<TaskHomePage");
  const homeSource = source.slice(homeStart, source.indexOf("/>", homeStart) + 2);
  assert.match(homeSource, /tasks=\{tasks\}/);
  assert.match(homeSource, /allTags=\{allTaskTags\}/);
  assert.match(homeSource, /onSetRoutineMembership=\{\(taskId, included\) => setTaskManualListMembership\(taskId, "routine", included\)\}/);
  assert.match(homeSource, /taskDisplayStatusByTaskId=\{taskDisplayStatusByTaskId\}/);
  assert.match(homeSource, /taskHistoryStreakSummaries=\{effectiveTaskHistoryStreakSummaries\}/);
  assert.doesNotMatch(homeSource, /tasks=\{tasksForActiveStatusRead\}/);
});

test("Home Routine child drag reuses TaskApp sibling reorder without changing Home state", () => {
  const homeSource = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
  const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const childDropStart = homeSource.indexOf("function dropRoutineChildOnTask");
  const childDropEnd = homeSource.indexOf("\n  function getRoutineChildDropIndicatorClassName", childDropStart);
  const childDropSource = homeSource.slice(childDropStart, childDropEnd);

  assert.match(homeSource, /onReorderChildTask: \(taskId: string, instruction: TaskSiblingReorderInstruction\) => void/);
  assert.match(homeSource, /type HomeRoutineChildDragState = \{[\s\S]*depth: number;[\s\S]*parentTaskId: string;[\s\S]*taskId: string;/);
  assert.match(homeSource, /event\.dataTransfer\.setData\("text\/plain", task\.id\)/);
  assert.match(homeSource, /parentTaskId: task\.parent_task_id/);
  assert.match(homeSource, /dragState\.taskId !== task\.id/);
  assert.match(homeSource, /dragState\.parentTaskId === task\.parent_task_id/);
  assert.match(homeSource, /dragState\.depth === depth/);
  assert.match(homeSource, /event\.clientY - rect\.top < rect\.height \/ 2 \? "before" : "after"/);
  assert.match(childDropSource, /onReorderChildTask\(dragState\.taskId, \{[\s\S]*placement: getRoutineChildDropPlacement\(event\),[\s\S]*targetTaskId: task\.id/);
  assert.doesNotMatch(childDropSource, /sort_order|routineTaskIds|updateRoutineTaskIds|updateRoutineSectionName|updateRoutinesPerSection/);
  assert.match(homeSource, /<GripVertical aria-hidden="true" className="h-3\.5 w-3\.5" \/>/);
  assert.match(homeSource, /onDragEnd=\{clearRoutineChildDragState\}/);
  assert.match(homeSource, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(homeSource, /shadow-\[inset_0_2px_0_0_rgba\(111,87,246,0\.95\)\]/);
  assert.match(homeSource, /shadow-\[inset_0_-2px_0_0_rgba\(111,87,246,0\.95\)\]/);
  assert.match(taskAppSource, /<TaskHomePage[\s\S]*onReorderChildTask=\{\(taskId, instruction\) => \{ void reorderChildTask\(taskId, instruction\); \}\}/);
  assert.match(homeSource, /items=\{sectionRoutineGroups\}/);
  assert.match(homeSource, /mergeHomeTodoVisibleTaskIds\([\s\S]*section\.groupIds[\s\S]*nextGroups\.map/);
  assert.match(homeSource, /!isRoutineChild && !isDerived \? <span className="max-sm:-ml-3 sm:-ml-2 shrink-0">\{handle\}<\/span>/);
});

test("Home row gear menus and long-press fast actions preserve Home behavior", () => {
  const source = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
  const renderStart = source.indexOf("function renderHomeTask");
  const renderEnd = source.indexOf("\n  useEffect", renderStart);
  const renderSource = source.slice(renderStart, renderEnd);
  const fastActionStart = renderSource.indexOf("{fastActionOpen ? (");
  const fastActionEnd = renderSource.indexOf("            ) : (", fastActionStart);
  const fastActionSource = renderSource.slice(fastActionStart, fastActionEnd);
  const panelStart = renderSource.indexOf("aria-label={rowActionMenuView ===");
  const routineDestinationStart = renderSource.indexOf("move-routine-section", panelStart);
  const destinationStart = renderSource.indexOf("move-day", routineDestinationStart);
  const actionsBranchStart = renderSource.indexOf(") : (", destinationStart);
  const routineDestinationSource = renderSource.slice(routineDestinationStart, destinationStart);
  const destinationSource = renderSource.slice(destinationStart, actionsBranchStart);
  const actionsStart = renderSource.indexOf("<div className=\"grid gap-1\">", actionsBranchStart);
  const actionsSource = renderSource.slice(actionsStart, renderSource.indexOf("</AdhdDropdownPanel>", actionsStart));
  const gestureSource = source.slice(source.indexOf("function clearGearLongPressTimer"), source.indexOf("function selectNewTaskRepeatFrequency"));

  assert.match(source, /type HomeRowActionMenuView = "actions" \| "move-day" \| "move-routine-section"/);
  assert.match(source, /const \[rowActionMenu, setRowActionMenu\] = useState<HomeRowActionMenuState \| null>\(null\)/);
  assert.match(source, /const \[isFastActionMode, setIsFastActionMode\] = useState\(false\)/);
  assert.doesNotMatch(source, /fastActionTaskId|setFastActionTaskId/);
  assert.match(source, /const HOME_GEAR_LONG_PRESS_MS = 475/);
  assert.match(source, /const HOME_GEAR_LONG_PRESS_MOVE_PX = 8/);
  assert.match(gestureSource, /function beginGearLongPress/);
  assert.match(gestureSource, /setTimeout\(\(\) =>/);
  assert.match(gestureSource, /setIsFastActionMode\(true\)/);
  assert.match(gestureSource, /setRowActionMenu\(null\)/);
  assert.match(gestureSource, /suppressGearClickRef\.current = true/);
  assert.match(gestureSource, /function handleGearLongPressMove/);
  assert.match(gestureSource, /Math\.hypot\(movedX, movedY\) > HOME_GEAR_LONG_PRESS_MOVE_PX/);
  assert.match(gestureSource, /function handleGearClick/);
  assert.match(gestureSource, /function handleFastActionClickCapture/);
  assert.match(gestureSource, /event\.preventDefault\(\)/);
  assert.match(renderSource, /onClick=\{\(event\) => handleGearClick\(task\.id, event\)\}/);
  assert.match(renderSource, /const fastActionOpen = isFastActionMode/);
  assert.match(renderSource, /onPointerCancel=\{\(event\) => cancelGearLongPress\(event\)\}/);
  assert.match(renderSource, /onPointerMove=\{handleGearLongPressMove\}/);
  assert.match(renderSource, /onPointerUp=\{\(event\) => cancelGearLongPress\(event, true\)\}/);
  assert.match(renderSource, /<Settings2 aria-hidden="true" \/>/);
  assert.match(renderSource, /selected=\{rowActionMenuOpen\}/);
  assert.match(gestureSource, /setRowActionMenu\(\(current\) => current\?\.taskId === taskId \? null : \{ taskId, view: "actions" \}\)/);
  assert.match(fastActionSource, /<CalendarDays aria-hidden="true" \/>/);
  assert.match(fastActionSource, /<ArrowUpToLine aria-hidden="true" \/>/);
  assert.match(fastActionSource, /<ArrowDownToLine aria-hidden="true" \/>/);
  assert.match(fastActionSource, /<Minus aria-hidden="true" \/>/);
  assert.match(fastActionSource, /onClickCapture=\{handleFastActionClickCapture\}/);
  assert.match(fastActionSource, /aria-label=\{`Collapse actions for \$\{task\.title \|\| "Untitled task"\}`\}/);
  assert.match(fastActionSource, /setIsFastActionMode\(false\)/);
  assert.match(fastActionSource, /onClick=\{\(\) => setRowActionMenu\(\{ taskId: task\.id, view: "move-day" \}\)\}/);
  assert.match(fastActionSource, /updateTaskIds\(\(taskIds\) => moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "top"\)\)/);
  assert.match(fastActionSource, /updateTaskIds\(\(taskIds\) => moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "bottom"\)\)/);
  assert.match(fastActionSource, /updateRoutineTaskIds\(\(taskIds\) => moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "top"\)\)/);
  assert.match(fastActionSource, /updateRoutineTaskIds\(\(taskIds\) => moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "bottom"\)\)/);
  assert.match(fastActionSource, /!isRoutine \?[\s\S]*CalendarDays/);
  const fastActionControlsSource = fastActionSource.slice(0, fastActionSource.indexOf("aria-label={`Collapse actions"));
  assert.doesNotMatch(fastActionControlsSource, /setIsFastActionMode\(false\)/);
  assert.match(actionsSource, /Move to day/);
  assert.match(actionsSource, /\{isRoutine && isRoutineGroupAnchor \?[\s\S]*Move to section/);
  assert.doesNotMatch(actionsSource, /\{isRoutine \?[\s\S]*Move to section/);
  assert.match(source, /const isRoutineChild = isRoutine && !isRoutineGroupAnchor/);
  assert.match(actionsSource, /Move to Top/);
  assert.match(actionsSource, /Move to Bottom/);
  assert.match(actionsSource, /Remove from Home To-do/);
  assert.match(actionsSource, /Remove from Routine/);
  assert.match(actionsSource, /\{!isRoutine \?/);
  assert.match(actionsSource, /\{isRoutine && !isAtRoutineTop \?/);
  assert.match(actionsSource, /\{isRoutine && !isAtRoutineBottom \?/);
  assert.match(renderSource, /dayOffset: section\.dayIndex/);
  assert.match(renderSource, /label: section\.label/);
  assert.match(renderSource, /\{ dayOffset: 7, isFull: false, label: "Later" \}/);
  assert.match(destinationSource, /updateTaskDayOffset\(task\.id, destination\.dayOffset\)/);
  assert.match(destinationSource, /disabled=\{disabled\}/);
  assert.match(destinationSource, /const disabled = isCurrentDestination \|\| destination\.isFull/);
  assert.match(destinationSource, /setRowActionMenu\(null\)/);
  assert.match(destinationSource, /Back to task actions/);
  assert.match(routineDestinationSource, /routineSectionDestinations\.map/);
  assert.match(source, /label: "Unsectioned"/);
  assert.match(routineDestinationSource, /updateRoutineTaskSection\(task\.id, section\.id\)/);
  assert.match(routineDestinationSource, /disabled=\{isCurrentSection\}/);
  assert.match(routineDestinationSource, /Move \$\{task\.title \|\| "Untitled task"\} to section/);
  assert.match(actionsSource, /moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "top"\)/);
  assert.match(actionsSource, /moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "bottom"\)/);
  assert.match(actionsSource, /updateTaskDayOffset\(task\.id, 0\)/);
  assert.match(actionsSource, /updateTaskDayOffset\(task\.id, 7\)/);
  assert.match(actionsSource, /updateRoutineTaskIds\(\(taskIds\) => moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "top"\)\)/);
  assert.match(actionsSource, /updateRoutineTaskIds\(\(taskIds\) => moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "bottom"\)\)/);
  assert.match(actionsSource, /onSetRoutineMembership\(task\.id, false\)/);
  assert.match(fastActionSource, /setRowActionMenu\(null\)/);
  assert.match(fastActionSource, /updateTaskDayOffset\(task\.id, 0\)[\s\S]*setRowActionMenu\(null\)/);
  assert.match(fastActionSource, /updateTaskDayOffset\(task\.id, 7\)[\s\S]*setRowActionMenu\(null\)/);
  assert.doesNotMatch(actionsSource, /updateTask\(|due_on\s*[:=]|due_time\s*[:=]|repeat_frequency\s*[:=]|TaskHistory|rewards|Records|Achievements/);
  assert.match(source, /if \(!rowActionMenu\) return/);
  assert.match(source, /if \(event\.key === "Escape"\)/);
  assert.match(source, /if \(!rowActionMenuRef\.current\?\.contains\(event\.target as Node\)\) setRowActionMenu\(null\)/);
  assert.match(source, /setActiveHomeTab\(nextTab\);[\s\S]*setRowActionMenu\(null\);[\s\S]*setIsFastActionMode\(false\)/);
  assert.doesNotMatch(source, /moveDayMenuTaskId|moveDayMenuRef/);
  assert.match(source, /!isRoutineChild && !isDerived \? \(/);
});

test("Home To-do consumes canonical streak and Attention projections without changing Routine metadata", () => {
  const source = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
  const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const renderStart = source.indexOf("function renderHomeTask");
  const renderEnd = source.indexOf("\n  useEffect", renderStart);
  const renderSource = source.slice(renderStart, renderEnd);
  const routineTitleStart = renderSource.indexOf("{isRoutine ? (");
  const normalTitleStart = renderSource.indexOf("          ) : (", routineTitleStart);
  const normalTitleEnd = renderSource.indexOf("          )}", normalTitleStart);
  const routineTitleSource = renderSource.slice(routineTitleStart, normalTitleStart);
  const normalTitleSource = renderSource.slice(normalTitleStart, normalTitleEnd);

  assert.match(source, /function HomeTodoTaskSignals/);
  assert.match(source, /taskAttentionReasonByTaskId: Readonly<Record<string, TaskAttentionReason>>/);
  assert.match(source, /attentionReason=\{taskAttentionReasonByTaskId\[task\.id\]\}/);
  assert.match(source, /streakSummary=\{taskHistoryStreakSummaries\[task\.id\]\}/);
  assert.match(source, /missedStreak > 0/);
  assert.match(source, /<Skull aria-hidden="true" className="h-3 w-3" \/>[\s\S]*\{missedStreak\}/);
  assert.match(source, /<TaskCurrentStreakChip className="px-1\.5 py-0 text-\[11px\]" currentStreak=\{currentStreak\} \/>/);
  assert.match(source, /<TaskAttentionChip dueOn=\{task\.due_on\} reason=\{attentionReason\} taskId=\{task\.id\} \/>/);
  assert.match(taskAppSource, /<TaskHomePage[\s\S]*taskAttentionReasonByTaskId=\{taskAttentionReasonByTaskId\}/);
  assert.match(normalTitleSource, /HomeTodoTaskSignals/);
  assert.doesNotMatch(routineTitleSource, /HomeTodoTaskSignals|TaskAttentionChip|taskAttentionReasonByTaskId/);
  assert.doesNotMatch(source, /buildTaskAttentionReasonMap|evaluateTaskListMemberships|matchesTaskListRules|resolveEffectiveTaskListRules/);
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
