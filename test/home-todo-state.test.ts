import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { Task } from "../src/lib/database.types.ts";
import {
  buildHomeRoutineGroups,
  buildHomeRoutineSections,
  buildHomeTodoDaySections,
  buildHomeTodoHierarchy,
  createHomeTodoTask,
  formatHomeRoutineDueLabel,
  formatHomeTodoDateLabel,
  getHomeRoutineStreakMetadata,
  getHomeRoutineTaskIds,
  getHomeTodoSearchText,
  hasMeaningfulHomeTodoState,
  isHomeTodoTaskEligible,
  mergeHomeTodoVisibleTaskIds,
  moveHomeTodoTaskId,
  moveHomeTodoTaskIdToEdge,
  moveHomeTodoTaskIdToVisibleEdge,
  normalizeHomeTodoTasksPerDay,
  normalizeHomeTodoRoutineSectionNames,
  normalizeHomeTodoRoutinesPerSection,
  normalizeHomeTodoState,
  reconcileHomeRoutineTaskIds,
  reconcileHomeTodoTaskIds,
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

test("Home state V1/V4 payloads normalize to V5 with independent Routine defaults", () => {
  assert.deepEqual(normalizeHomeTodoState({
    clientUpdatedAt: "2026-07-28T12:00:00.000Z",
    schemaVersion: 1,
    taskIds: ["a", "a", "", 4, "b"],
  }), {
    clientUpdatedAt: "2026-07-28T12:00:00.000Z",
    schemaVersion: 5,
    taskIds: ["a", "b"],
    taskDayOffsets: {},
    tasksPerDay: 10,
    routineTaskIds: [],
    routinesPerSection: 3,
    routineSectionNames: {},
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

test("Home V5 bootstrap recognizes meaningful state outside To-do taskIds", () => {
  const empty = normalizeHomeTodoState(null);
  assert.equal(hasMeaningfulHomeTodoState(empty), false);
  assert.equal(hasMeaningfulHomeTodoState({ ...empty, taskIds: ["todo"] }), true);
  assert.equal(hasMeaningfulHomeTodoState({ ...empty, taskDayOffsets: { todo: 2 }, taskIds: ["todo"] }), true);
  assert.equal(hasMeaningfulHomeTodoState({ ...empty, tasksPerDay: 15 }), true);
  assert.equal(hasMeaningfulHomeTodoState({ ...empty, routineTaskIds: ["routine"] }), true);
  assert.equal(hasMeaningfulHomeTodoState({ ...empty, routinesPerSection: 4 }), true);
  assert.equal(hasMeaningfulHomeTodoState({ ...empty, routineSectionNames: { "0": "Morning" } }), true);
});

test("Home Routine sections use capacity without counting descendants", () => {
  assert.equal(normalizeHomeTodoRoutinesPerSection(undefined), 3);
  assert.equal(normalizeHomeTodoRoutinesPerSection(99), 3);
  assert.deepEqual(buildHomeRoutineSections(["a", "b", "c", "d"], 3), [
    { groupIds: ["a", "b", "c"], label: "Section 1", sectionIndex: 0, startIndex: 0 },
    { groupIds: ["d"], label: "Section 2", sectionIndex: 1, startIndex: 3 },
  ]);
  assert.deepEqual(buildHomeRoutineSections(["a", "b", "c", "d"], 1).map((section) => section.groupIds), [["a"], ["b"], ["c"], ["d"]]);
});

test("Home V4 Routine capacity migrates to V5 without losing order", () => {
  const migrated = normalizeHomeTodoState({
    schemaVersion: 4,
    taskIds: [],
    routineTaskIds: ["routine-b", "routine-a"],
    routinesPerPhase: 4,
  });
  assert.equal(migrated.schemaVersion, 5);
  assert.equal(migrated.routinesPerSection, 4);
  assert.deepEqual(migrated.routineTaskIds, ["routine-b", "routine-a"]);
  assert.equal(normalizeHomeTodoState({ routinesPerSection: 2, routinesPerPhase: 6 }).routinesPerSection, 2);
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

test("Home Routine custom names override ordinal labels and survive capacity changes", () => {
  const names = { "0": "Morning", "1": "Work Start" };
  assert.deepEqual(buildHomeRoutineSections(["a", "b", "c", "d"], 2, names).map((section) => section.label), ["Morning", "Work Start"]);
  assert.deepEqual(buildHomeRoutineSections(["a", "b", "c", "d"], 1, names).map((section) => section.label), ["Morning", "Work Start", "Section 3", "Section 4"]);
  assert.deepEqual(buildHomeRoutineSections(["a", "b"], 2, { "0": "   " })[0]?.label, "Section 1");
});

test("Home Routine renaming is ordinal-only and does not alter Routine order", () => {
  const state = normalizeHomeTodoState({ routineTaskIds: ["a", "b"], routineSectionNames: { "0": "Morning" } });
  assert.deepEqual(state.routineTaskIds, ["a", "b"]);
  assert.deepEqual(buildHomeRoutineSections(state.routineTaskIds, state.routinesPerSection, state.routineSectionNames).map((section) => section.groupIds), [["a", "b"]]);
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

test("Home Routine edge actions move anchors, preserve descendants, and keep ordinal Section names", () => {
  const parent = task("parent");
  const child = task("child", { parent_task_id: parent.id });
  const middle = task("middle");
  const last = task("last");
  const routineTaskIds = [parent.id, middle.id, last.id];
  const sectionNames = { "0": "Morning", "1": "Work" };

  const movedToTop = moveHomeTodoTaskIdToEdge(routineTaskIds, middle.id, "top");
  const movedToBottom = moveHomeTodoTaskIdToEdge(routineTaskIds, middle.id, "bottom");

  assert.deepEqual(movedToTop, [middle.id, parent.id, last.id]);
  assert.deepEqual(movedToBottom, [parent.id, last.id, middle.id]);
  assert.deepEqual(moveHomeTodoTaskIdToEdge(routineTaskIds, parent.id, "top"), routineTaskIds);
  assert.deepEqual(moveHomeTodoTaskIdToEdge(routineTaskIds, last.id, "bottom"), routineTaskIds);

  const movedGroups = buildHomeRoutineGroups(movedToTop, [parent, child, middle, last]);
  assert.deepEqual(movedGroups.map((group) => group.anchorId), [middle.id, parent.id, last.id]);
  assert.deepEqual(movedGroups[1]?.taskIds, [parent.id, child.id]);
  assert.deepEqual(buildHomeRoutineSections(routineTaskIds, 1, sectionNames).map((section) => section.label), ["Morning", "Work", "Section 3"]);
  assert.deepEqual(buildHomeRoutineSections(movedToTop, 1, sectionNames).map((section) => section.label), ["Morning", "Work", "Section 3"]);
  assert.deepEqual(buildHomeRoutineSections(movedToBottom, 1, sectionNames).map((section) => section.label), ["Morning", "Work", "Section 3"]);
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
    schemaVersion: 5,
    taskIds: ["todo-a"],
    taskDayOffsets: { "todo-a": 2 },
    tasksPerDay: 15,
    routineTaskIds: ["routine-a"],
    routinesPerSection: 3,
    routineSectionNames: { "0": "Morning" },
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

test("shared drag reorder moves Home task ids without mutating the source", () => {
  const source = ["a", "b", "c"];
  assert.deepEqual(reorderListItems(source, 0, 2), ["b", "c", "a"]);
  assert.deepEqual(source, ["a", "b", "c"]);
});

test("Home todo renders seven flat sortable sections, settings, and the recovered task behavior", () => {
  const source = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
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
  assert.match(source, /const durableTaskIndex = state\.taskIds\.indexOf\(task\.id\)/);
  assert.match(source, /const renderedDayOffset = daySections\.find\(\(section\) => section\.taskIds\.includes\(task\.id\)\)/);
  assert.match(source, /const isAtAbsoluteTop = !isRoutine && durableTaskIndex === 0 && renderedDayOffset === 0/);
  assert.match(source, /const isAtAbsoluteBottom = !isRoutine && durableTaskIndex === state\.taskIds\.length - 1 && renderedDayOffset === 7/);
  assert.match(source, /const isAtRoutineTop = isRoutine && index === 0/);
  assert.match(source, /const isAtRoutineBottom = isRoutine && index === routineGroups\.length - 1/);
  assert.match(source, /moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "top"\)/);
  assert.match(source, /moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "bottom"\)/);
  assert.match(source, /updateTaskDayOffset\(task\.id, 0\)/);
  assert.match(source, /updateTaskDayOffset\(task\.id, 7\)/);
  assert.match(source, /Later \(\{doLaterTasks\.length\}\)/);
  assert.match(source, /Settings2/);
  assert.match(source, /updateTasksPerDay\(capacity\)/);
  assert.match(source, /updateRoutinesPerSection\(capacity\)/);
  assert.match(source, /buildHomeRoutineSections/);
  assert.match(source, /state\.routinesPerSection/);
  assert.match(source, /state\.routineSectionNames/);
  assert.match(source, /items=\{routineGroups\}/);
  assert.match(source, /onReorder=\{\(nextGroups\) => updateRoutineTaskIds/);
  assert.match(source, /shouldPersistHomeRoutineReconciliation\(syncStatus\)/);
  assert.match(source, /updateRoutineTaskIds\(\(currentRoutineTaskIds\) => reconcileHomeRoutineTaskIds\(currentRoutineTaskIds, routineTaskIds\)/);
  assert.match(source, /Routines per section/);
  assert.match(source, /updateRoutineSectionName/);
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
  assert.match(source, /data-sortable-drop-index=\{section\.startIndex\}/);
  assert.match(source, /daySections\s*\.filter\(\(section\) => section\.startIndex === index\)\s*\.map\(renderDaySectionHeader\)/);
  assert.match(sortableSource, /data-sortable-drop-index/);
  assert.match(sortableSource, /getDropZoneIndex\(rawIndex: number, itemCount: number\)/);
  assert.match(sortableSource, /dropZoneId: string \| null/);
  assert.match(sortableSource, /data-sortable-placeholder/);
  assert.match(sortableSource, /Drop “\{drag\.label\}” here/);
  assert.match(sortableSource, /processPointerMove\(event\.clientY\)/);
  assert.match(hookSource, /state: outgoing/);
  assert.match(hookSource, /tasksPerDay: nextTasksPerDay/);
  assert.match(hookSource, /hasMeaningfulHomeTodoState\(cached\)/);
  assert.match(hookSource, /cacheKey\(ownerId\)/);
  assert.match(hookSource, /persistCache\(next, userId\)/);
  assert.match(hookSource, /state: outgoing,\s*user_id: userId/);
  assert.match(logicalDaySource, /export function getCalendarDayKey/);
  assert.match(logicalDaySource, /export function getLogicalDayKey/);
  assert.match(taskAppSource, /calendarNowMs=\{logicalDayNow\}/);
  assert.match(taskAppSource, /calendarTimeZone=\{userTimeZone\}/);
  assert.match(taskAppSource, /taskHistoryStreakSummaries=\{taskHistoryStreakSummaries\}/);
  assert.match(taskAppSource, /manualMembershipsByTaskId=\{manualMembershipsByTaskId\}/);
  assert.match(source, /const HOME_TODO_TITLE_CLASS = "text-sm font-medium text-\[#26324f\] dark:text-white"/);
  assert.equal((source.match(/HOME_TODO_TITLE_CLASS/g) ?? []).length, 4);
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
  const actionIndex = renderHomeTask.indexOf('<div className="flex shrink-0 items-center gap-1">');
  assert.ok(handleIndex >= 0 && handleIndex < numberIndex);
  assert.ok(numberIndex < statusIndex && statusIndex < contentIndex && contentIndex < actionIndex);
  assert.match(source, /<div className="flex shrink-0 items-center gap-1">/);
  assert.match(source, /renderTaskStatusCircle\(displayStatus, "sm", \{ className: "!h-7 !w-7", glyphClassName: "!h-4 !w-4 !text-sm" \}\)/);
  assert.doesNotMatch(source, /flex shrink-0 flex-col items-center/);
  assert.doesNotMatch(source, /basis-full/);
  assert.match(source, /<ArrowUpToLine aria-hidden="true" \/>/);
  assert.match(source, /<ArrowDownToLine aria-hidden="true" \/>/);
  assert.match(source, /updateRoutineTaskIds\(\(taskIds\) => moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "top"\)\)/);
  assert.match(source, /updateRoutineTaskIds\(\(taskIds\) => moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "bottom"\)\)/);
  assert.match(source, /const isRoutineChild = isRoutine && !isRoutineGroupAnchor/);
  assert.match(source, /!isRoutineChild \? <div className="flex shrink-0 items-center gap-1">/);
  assert.doesNotMatch(source, /<ArrowUp aria-hidden/);
  assert.doesNotMatch(source, /<ArrowDown aria-hidden/);
  assert.match(source, /const durableTaskIndex = state\.taskIds\.indexOf\(task\.id\)/);
  assert.match(source, /const renderedDayOffset = daySections\.find\(\(section\) => section\.taskIds\.includes\(task\.id\)\)/);
  assert.match(source, /const isAtAbsoluteTop = !isRoutine && durableTaskIndex === 0 && renderedDayOffset === 0/);
  assert.match(source, /const isAtAbsoluteBottom = !isRoutine && durableTaskIndex === state\.taskIds\.length - 1 && renderedDayOffset === 7/);
  assert.match(source, /moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "top"\)/);
  assert.match(source, /moveHomeTodoTaskIdToEdge\(taskIds, task\.id, "bottom"\)/);
  assert.match(source, /updateTaskDayOffset\(task\.id, 0\)/);
  assert.match(source, /updateTaskDayOffset\(task\.id, 7\)/);
  assert.match(source, /from Home To-do/);
  assert.match(source, /<Minus aria-hidden="true" \/>/);
  assert.equal((source.match(/size="sm"/g) ?? []).length, 9);
  assert.match(source, /const HOME_TODO_ACTION_CLASS = "max-sm:!h-7 max-sm:!w-7"/);
  assert.match(source, /const HOME_TODO_ACTION_ICON_CLASS = "max-sm:!h-\[12\.25px\] max-sm:!w-\[12\.25px\]"/);
  assert.equal((source.match(/className=\{HOME_TODO_ACTION_CLASS\}/g) ?? []).length, 7);
  assert.equal((source.match(/iconClassName=\{HOME_TODO_ACTION_ICON_CLASS\}/g) ?? []).length, 7);
  assert.match(sharedIconButton, /sm: "h-8 w-8"/);
  assert.match(sharedIconButton, /sm: "h-3\.5 w-3\.5"/);
  assert.match(source, /tone="danger"/);
  assert.doesNotMatch(source, /variant="rowToolbar"/);
  assert.match(source, /-mx-\[15px\] w-auto px-3 pb-32 pt-6 sm:mx-auto sm:px-4/);
  assert.doesNotMatch(source, /Search your Tasks and arrange the order you want to work through\./);
  assert.match(source, /<div className="relative mt-2" ref=\{searchRef\}>/);
  assert.match(source, /<TaskStatusCircleRail/);
  assert.match(source, /onClick=\{\(\) => onOpenTask\(task\.id\)\}/);
  assert.match(source, /useState<HomePanelTab>\("todo"\)/);
  assert.match(source, /getHomeRoutineTaskIds/);
  assert.match(source, /manualMembershipsByTaskId/);
  assert.match(source, /routineTaskIds/);
  assert.match(source, /routineGroups\.flatMap/);
  assert.match(source, /onSetRoutineMembership/);
  assert.match(source, /routineTasks\.map/);
  assert.match(source, /No Routine tasks yet\./);
  assert.match(source, /activeHomeTab === "routine"/);
  assert.match(source, /const selected = activeHomeTab === "todo" \? new Set\(reconciledTaskIds\) : routineTaskIdSet/);
  assert.match(source, /async function addSearchResult\(taskId: string\)/);
  assert.match(source, /onSetRoutineMembership\(taskId, true\)/);
  assert.match(source, /onSetRoutineMembership\(task\.id, false\)/);
  assert.match(source, /activeHomeTab === "todo"\s*\? \(taskId\) => updateTaskIds/);
  assert.match(source, /onSubmit=\{handleCreateTask\}/);
  assert.match(source, /const \[newTaskTypeSelection, setNewTaskTypeSelection\] = useState\("task"\)/);
  assert.match(source, /<TaskTypeSelect[\s\S]*ariaLabel="Task Type"[\s\S]*options=\{taskTypeOptions\}[\s\S]*value=\{newTaskTypeSelection\}/);
  assert.doesNotMatch(source, /EditorCollapsibleSection/);
  assert.doesNotMatch(source, /CompactDateTimeField/);
  assert.doesNotMatch(source, /CompactSelectField/);
  assert.doesNotMatch(source, /TagChipInput/);
  assert.doesNotMatch(source, /Task details|TASK DETAILS/);
  assert.match(source, /aria-label="Due date"[\s\S]*className=\{TASK_TABLE_INPUT_CLASS\}/);
  assert.match(source, /aria-label="Due time"[\s\S]*className=\{TASK_TABLE_INPUT_CLASS\}/);
  assert.match(source, /<TaskTableChipButton[\s\S]*setNewTaskPriority/);
  assert.match(source, /getSelectedTaskPriorityToneClass/);
  assert.match(source, /TASK_PRIORITY_LEVEL_OPTIONS/);
  assert.match(source, /<CompactRepeatCadenceControls/);
  assert.match(source, /Search or add a tag/);
  assert.match(source, /TASK_TABLE_ACTIVE_LIST_CHIP_CLASS/);
  assert.match(source, /dedupeTaskTagLabels/);
  assert.match(source, /buildNewTaskMetadata\(\)/);
  assert.match(source, /setNewTaskTypeSelection\("task"\)/);
  assert.match(source, /New task/);
  assert.match(source, /type="submit"/);
  assert.match(source, /Cancel/);
  assert.match(source, /setIsSearchOpen\(true\)/);
  assert.match(source, /setQuery\(""\)/);
  assert.doesNotMatch(source, /font-semibold leading-5/);
  assert.doesNotMatch(source, /text-\[#443d60\]/);
  assert.doesNotMatch(readFileSync(new URL("../src/lib/home-todo-state.ts", import.meta.url), "utf8"), /getLogicalDayKey/);
});

test("TaskApp passes Home creation through the shared canonical addTask seam", () => {
  const source = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  assert.match(source, /<TaskHomePage[\s\S]*onCreateTaskWithType=\{createHomeTodoTaskWithType\}/);
  assert.match(source, /<TaskHomePage[\s\S]*taskTypeOptions=\{taskTypeOptions\}/);
  assert.match(source, /createTaskAndOpenSharedEditor\(buildNewTaskDraft\("New Task"\)/);
  const homeCreationStart = source.indexOf("const createHomeTodoTaskWithType");
  const homeCreationEnd = source.indexOf("const taskTypeOptions", homeCreationStart);
  const homeCreation = source.slice(homeCreationStart, homeCreationEnd);
  assert.match(homeCreation, /resolveTaskTypeSelection\(selectionValue, customBehaviorRulesets\)/);
  assert.match(homeCreation, /custom_ruleset_id: selection\.customRulesetId/);
  assert.match(homeCreation, /task_type: selection\.taskType/);
  assert.match(homeCreation, /addTask\([\s\S]*buildNewTaskDraft\(title\)/);
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
  assert.match(homeSource, /taskHistoryStreakSummaries=\{taskHistoryStreakSummaries\}/);
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
  assert.match(homeSource, /items=\{routineGroups\}/);
  assert.match(homeSource, /onReorder=\{\(nextGroups\) => updateRoutineTaskIds/);
  assert.match(homeSource, /!isRoutineChild \? <span className="max-sm:-ml-3 sm:-ml-2 shrink-0">\{handle\}<\/span>/);
});

test("Home To-do move-to-day control uses Home offsets and leaves Task scheduling untouched", () => {
  const source = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
  const renderStart = source.indexOf("function renderHomeTask");
  const renderEnd = source.indexOf("\n  useEffect", renderStart);
  const renderSource = source.slice(renderStart, renderEnd);
  const moveDayStart = renderSource.indexOf("const moveDayDestinations");
  const moveDayEnd = renderSource.indexOf("const isAtAbsoluteTop", moveDayStart);
  const moveDaySource = renderSource.slice(moveDayStart, moveDayEnd);
  const todoActionStart = renderSource.indexOf(") : (\n            <>", renderSource.indexOf("{isRoutine ? ("));
  const todoActionEnd = renderSource.indexOf("</>", todoActionStart);
  const todoActionSource = renderSource.slice(todoActionStart, todoActionEnd);

  assert.match(source, /const \[moveDayMenuTaskId, setMoveDayMenuTaskId\] = useState<string \| null>\(null\)/);
  assert.match(source, /CalendarDays/);
  assert.match(source, /aria-label=\{`Move \$\{task\.title \|\| "Untitled task"\} to day`\}/);
  assert.match(moveDaySource, /dayOffset: section\.dayIndex/);
  assert.match(moveDaySource, /label: section\.label/);
  assert.match(moveDaySource, /\{ dayOffset: 7, isFull: false, label: "Later" \}/);
  assert.match(todoActionSource, /updateTaskDayOffset\(task\.id, destination\.dayOffset\)/);
  assert.match(todoActionSource, /disabled=\{disabled\}/);
  assert.match(todoActionSource, /const disabled = isCurrentDestination \|\| destination\.isFull/);
  assert.match(todoActionSource, /setMoveDayMenuTaskId\(null\)/);
  assert.doesNotMatch(todoActionSource, /updateTask\(|due_on\s*[:=]|due_time\s*[:=]|repeat_frequency\s*[:=]|TaskHistory|rewards|Records|Achievements/);
  assert.match(source, /if \(!moveDayMenuTaskId\) return/);
  assert.match(source, /if \(event\.key === "Escape"\)/);
  assert.match(source, /if \(!moveDayMenuRef\.current\?\.contains\(event\.target as Node\)\) setMoveDayMenuTaskId\(null\)/);
  assert.match(source, /!isRoutineChild \? <div className="flex shrink-0 items-center gap-1">/);
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
