import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  reconcileTableDueMutation,
  type PrototypeTaskRow,
  type TaskDueChangeHandler,
} from "../src/components/ui/task-management-table-v2.tsx";

function row(id: string, overrides: Partial<PrototypeTaskRow> = {}): PrototypeTaskRow {
  return {
    actualSeconds: 120,
    completedAt: null,
    createdAt: "2026-08-26T10:00:00.000Z",
    currentStreak: 3,
    dueOn: "2026-08-31",
    dueTime: "09:30",
    energy: "medium",
    estimatedMinutes: 25,
    id,
    lastDoneAt: "2026-08-25T10:00:00.000Z",
    lastDoneDate: "2026-08-25",
    lastHandledAt: "2026-08-25T10:00:00.000Z",
    lastHandledDate: "2026-08-25",
    linkLabel: "Reference",
    linkUrl: "https://example.com",
    linkedNotes: [{ id: `${id}-note`, title: "Keep this" }],
    lists: ["Inbox", "Today", "Project"],
    missedStreak: 1,
    notes: "Preserve this row field",
    pinOrder: 2,
    pinnedAt: "2026-08-25T10:00:00.000Z",
    priorities: ["5"],
    repeat: "weekly",
    repeatDayOfMonth: null,
    repeatDaysOfWeek: [1, 3],
    repeatInterval: 2,
    repeatMonthlyMode: "day_of_month",
    repeatMonthlyOrdinal: null,
    repeatMonthlyWeekday: null,
    status: "pending",
    subtasks: [],
    subtasksAutoReset: true,
    tags: ["important"],
    title: "Due task",
    trashedAt: null,
    updatedAt: "2026-08-26T10:00:00.000Z",
    ...overrides,
  };
}

function snapshotsFor(...entries: Array<[string, number, PrototypeTaskRow]>) {
  return entries.map(([taskId, generation, snapshot]) => ({ taskId, generation, snapshot }));
}

test("Due handlers accept synchronous and asynchronous boolean acknowledgements", () => {
  const tableDueHandler: TaskDueChangeHandler = () => true;
  const asyncDueHandler: TaskDueChangeHandler = async () => true;
  assert.equal(typeof tableDueHandler, "function");
  assert.equal(typeof asyncDueHandler, "function");

  const adapterSource = readFileSync("src/components/task-app/tasks-list-adapter.tsx", "utf8");
  assert.equal((adapterSource.match(/onSetDue\?: TaskDueChangeHandler/g) ?? []).length, 2);
});

test("TaskApp returns persistence-aware Due acknowledgement and preserves unscheduled manual action", () => {
  const source = readFileSync("src/components/task-app.tsx", "utf8");
  const dueHandlers = [...source.matchAll(/(?:onTaskDueChange|onSetDue)(?:=|:)\s*\{?\s*\(taskId, schedule, options\) => \{([\s\S]*?)\n\s*\}\}?/g)].map((match) => match[1]);
  assert.equal(dueHandlers.length, 3);
  for (const handler of dueHandlers) {
    assert.match(handler, /let didPersist = false/);
    assert.match(handler, /onCanonicalMutationPersisted/);
    assert.doesNotMatch(handler, /void updateTask\(/);
    assert.match(handler, /manualAction/);
    assert.match(handler, /"unscheduled_status"/);
  }
  assert.equal((source.match(/return didFullyReconcile\.then\(\(didReconcile\) => didPersist \|\| didReconcile\)/g) ?? []).length, 3);
  assert.match(source, /onTaskEnergyChange=\{\(taskId, energy\) => \{ void updateTask\(/);
  assert.match(source, /onTaskNotesChange=\{\(taskId, notes\) => \{ void updateTask\(/);
});

test("successful Due acknowledgement keeps the optimistic row", async () => {
  const previous = row("success");
  const current = { ...previous, dueOn: "", dueTime: "", repeat: "none" as const, lists: ["Project"] };
  const rolledBack: string[] = [];

  await reconcileTableDueMutation({
    getCurrentGeneration: () => 1,
    onRollback: () => rolledBack.push("success"),
    onTaskDueChange: async () => true,
    schedule: { dueOn: "2026-09-04", dueTime: "11:00" },
    snapshots: snapshotsFor([previous.id, 1, previous]),
  });

  assert.equal(current.dueOn, "");
  assert.deepEqual(rolledBack, []);
});

test("failed Due acknowledgement restores the complete captured row", async () => {
  const previous = row("failed");
  let current = { ...previous, dueOn: "2026-09-04", dueTime: "11:00", repeat: "none" as const, lists: ["Project"] };

  await reconcileTableDueMutation({
    getCurrentGeneration: () => 1,
    onRollback: (_taskId, snapshot) => { current = snapshot; },
    onTaskDueChange: () => false,
    schedule: { dueOn: "2026-09-04", dueTime: "11:00" },
    snapshots: snapshotsFor([previous.id, 1, previous]),
  });

  assert.deepEqual(current, previous);
});

test("failed Due to Unscheduled restores repeat metadata and list/display fields", async () => {
  const previous = row("unscheduled", {
    lists: ["Inbox", "Today", "Planning"],
    repeat: "monthly",
    repeatDayOfMonth: 17,
    repeatInterval: 3,
    repeatMonthlyMode: "ordinal_weekday",
    repeatMonthlyOrdinal: "second",
    repeatMonthlyWeekday: 4,
  });
  let current: PrototypeTaskRow = {
    ...previous,
    dueOn: "",
    dueTime: "",
    lists: ["Planning"],
    repeat: "none",
    repeatDayOfMonth: null,
    repeatDaysOfWeek: [],
    repeatInterval: 1,
    repeatMonthlyMode: "day_of_month",
    repeatMonthlyOrdinal: null,
    repeatMonthlyWeekday: null,
  };
  let receivedOptions: { manualAction?: "unscheduled_status" } | undefined;

  await reconcileTableDueMutation({
    getCurrentGeneration: () => 1,
    onRollback: (_taskId, snapshot) => { current = snapshot; },
    onTaskDueChange: (_taskId, _schedule, options) => {
      receivedOptions = options;
      return false;
    },
    schedule: { dueOn: "", dueTime: "" },
    snapshots: snapshotsFor([previous.id, 1, previous]),
  });

  assert.deepEqual(current.repeat, previous.repeat);
  assert.deepEqual(current.repeatDaysOfWeek, previous.repeatDaysOfWeek);
  assert.deepEqual(current.lists, previous.lists);
  assert.equal(current.linkUrl, previous.linkUrl);
  assert.deepEqual(receivedOptions, { manualAction: "unscheduled_status" });
});

test("thrown Due callback rolls back", async () => {
  const previous = row("thrown");
  let current = { ...previous, dueOn: "2026-09-04" };

  await reconcileTableDueMutation({
    getCurrentGeneration: () => 1,
    onRollback: (_taskId, snapshot) => { current = snapshot; },
    onTaskDueChange: () => { throw new Error("save failed"); },
    schedule: { dueOn: "2026-09-04", dueTime: "11:00" },
    snapshots: snapshotsFor([previous.id, 1, previous]),
  });

  assert.deepEqual(current, previous);
});

test("older failed Due mutation cannot overwrite a newer mutation", async () => {
  const monday = row("stale", { dueOn: "2026-08-31" });
  const friday = { ...monday, dueOn: "2026-09-04" };
  let current = friday;
  const generation = 2;
  let releaseFirstFailure!: () => void;
  const firstFailure = new Promise<boolean>((resolve) => { releaseFirstFailure = () => resolve(false); });

  const first = reconcileTableDueMutation({
    getCurrentGeneration: () => generation,
    onRollback: (_taskId, snapshot) => { current = snapshot; },
    onTaskDueChange: () => firstFailure,
    schedule: { dueOn: "", dueTime: "" },
    snapshots: snapshotsFor([monday.id, 1, monday]),
  });
  const second = reconcileTableDueMutation({
    getCurrentGeneration: () => generation,
    onRollback: (_taskId, snapshot) => { current = snapshot; },
    onTaskDueChange: async () => true,
    schedule: { dueOn: "2026-09-04", dueTime: "09:30" },
    snapshots: snapshotsFor([friday.id, 2, friday]),
  });

  releaseFirstFailure();
  await Promise.all([first, second]);
  assert.equal(current.dueOn, "2026-09-04");
});

test("multi-target Due results roll back only failed targets", async () => {
  const first = row("target-a");
  const second = row("target-b");
  const current = new Map([
    [first.id, { ...first, dueOn: "2026-09-04" }],
    [second.id, { ...second, dueOn: "2026-09-04" }],
  ]);
  const rolledBack: string[] = [];

  await reconcileTableDueMutation({
    getCurrentGeneration: () => 1,
    onRollback: (taskId, snapshot) => {
      rolledBack.push(taskId);
      current.set(taskId, snapshot);
    },
    onTaskDueChange: async (taskId) => taskId === first.id,
    schedule: { dueOn: "2026-09-04", dueTime: "09:30" },
    snapshots: snapshotsFor([first.id, 1, first], [second.id, 1, second]),
  });

  assert.deepEqual(rolledBack, [second.id]);
  assert.equal(current.get(first.id)?.dueOn, "2026-09-04");
  assert.equal(current.get(second.id)?.dueOn, second.dueOn);
});

test("Table keeps optimistic patch and existing viewport hold wiring", () => {
  const source = readFileSync("src/components/ui/task-management-table-v2.tsx", "utf8");
  const setTaskDue = source.slice(source.indexOf("function setTaskDue"), source.indexOf("function canDelayTask"));
  assert.match(setTaskDue, /queueTableMutationScrollTopHold\(taskId\)/);
  assert.match(setTaskDue, /patchTasks\(targetTaskIds/);
  assert.match(setTaskDue, /reconcileTableDueMutation/);
  assert.doesNotMatch(setTaskDue, /scrollTop\s*=|scrollTo\(|scrollBy\(/);
});

test("List Due path retains shared callback wiring without a List snapshot path", () => {
  const source = readFileSync("src/components/task-app/tasks-list-adapter.tsx", "utf8");
  assert.match(source, /onSetDue\?: TaskDueChangeHandler/);
  assert.match(source, /onTaskDueChange=\{tableProps\.onSetDue\}/);
  assert.doesNotMatch(source, /reconcileTableDueMutation/);
});
