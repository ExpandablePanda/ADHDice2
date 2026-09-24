import assert from "node:assert/strict";
import test from "node:test";

import type { Task } from "../src/lib/database.types.ts";
import {
  CURRENT_TASK_PROJECTION_READ_COLUMNS,
  compareCurrentTaskProjectionParity,
  createCurrentTaskProjectionEventBuffer,
  mergeCurrentTaskProjectionRows,
  projectionToTaskHistoryStreakSummary,
  resolveCurrentTaskProjectionReads,
  type CurrentTaskProjectionReadRow,
} from "../src/lib/task-current-projection-read.ts";
import {
  CURRENT_TASK_PROJECTION_ALGORITHM_VERSION,
  CURRENT_TASK_PROJECTION_SCHEMA_VERSION,
} from "../src/lib/task-current-projection.ts";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const TODAY = "2026-09-23";
const HISTORY_EPOCH = "00000000-0000-0000-0000-000000000099";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    user_id: USER_ID,
    status: "pending",
    due_on: "2026-09-22",
    canonical_revision: 12,
    entity_kind: "parent",
    ...overrides,
  } as Task;
}

function projection(overrides: Partial<CurrentTaskProjectionReadRow> = {}): CurrentTaskProjectionReadRow {
  return {
    user_id: USER_ID,
    entity_id: "task-1",
    entity_kind: "parent",
    display_status: "in_progress",
    current_effective_due_on: "2026-09-24",
    handled_current_logical_day: true,
    last_handled_logical_date: "2026-09-22",
    last_handled_at: "2026-09-22T15:00:00.000Z",
    last_done_logical_date: "2026-09-21",
    last_done_at: "2026-09-21T16:00:00.000Z",
    current_positive_streak: 4,
    current_missed_streak: 0,
    canonical_task_revision: 12,
    history_sync_epoch: HISTORY_EPOCH,
    logical_day_settings_revision: 7,
    projected_logical_date: TODAY,
    projection_schema_version: CURRENT_TASK_PROJECTION_SCHEMA_VERSION,
    projection_algorithm_version: CURRENT_TASK_PROJECTION_ALGORITHM_VERSION,
    validity: "valid",
    updated_at: "2026-09-23T12:00:00.000Z",
    ...overrides,
  };
}

function resolve(overrides: Partial<CurrentTaskProjectionReadRow> = {}, options: {
  historySyncEpoch?: string | null;
  logicalDaySettingsRevision?: number | null;
  legacyCurrentRead?: {
    dueOnByTaskId?: Record<string, string | null>;
    statusesByTaskId?: Record<string, "pending" | "in_progress" | "done" | "did_my_best" | "complete" | "missed" | "upcoming" | "not_due" | "delayed" | "archived" | "trashed" | "unscheduled">;
  };
} = {}) {
  const currentTask = task();
  return resolveCurrentTaskProjectionReads({
    historySyncEpoch: options.historySyncEpoch === undefined ? HISTORY_EPOCH : options.historySyncEpoch,
    legacyCurrentRead: options.legacyCurrentRead,
    logicalDaySettingsRevision: options.logicalDaySettingsRevision === undefined ? 7 : options.logicalDaySettingsRevision,
    projectionsByTaskId: { [currentTask.id]: projection(overrides) },
    taskHistoryStreakSummaries: {
      [currentTask.id]: {
        currentStreak: 2,
        missedStreak: 3,
        lastHandledDate: "2026-09-20",
        lastHandledAt: "2026-09-20T10:00:00.000Z",
        lastDoneDate: "2026-09-19",
        lastDoneAt: "2026-09-19T11:00:00.000Z",
      },
    },
    tasks: [currentTask],
    todayKey: TODAY,
  });
}

test("the read contract selects only the narrow current projection columns", () => {
  assert.deepEqual(CURRENT_TASK_PROJECTION_READ_COLUMNS.split(","), [
    "user_id",
    "entity_id",
    "entity_kind",
    "display_status",
    "current_effective_due_on",
    "handled_current_logical_day",
    "last_handled_logical_date",
    "last_handled_at",
    "last_done_logical_date",
    "last_done_at",
    "current_positive_streak",
    "current_missed_streak",
    "canonical_task_revision",
    "history_sync_epoch",
    "logical_day_settings_revision",
    "projected_logical_date",
    "projection_schema_version",
    "projection_algorithm_version",
    "validity",
    "updated_at",
  ]);
  assert.equal(CURRENT_TASK_PROJECTION_READ_COLUMNS.includes("*"), false);
});

test("a fresh projection supplies current status, due, streak, Last Handled, and Last Done before History", () => {
  const result = resolve({});

  assert.deepEqual(result.freshProjectionTaskIds, ["task-1"]);
  assert.equal(result.displayStatusByTaskId["task-1"], "in_progress");
  assert.equal(result.dueOnByTaskId["task-1"], "2026-09-24");
  assert.deepEqual(result.effectiveTaskHistoryStreakSummaries["task-1"], {
    currentStreak: 4,
    missedStreak: 0,
    lastHandledDate: "2026-09-22",
    lastHandledAt: "2026-09-22T15:00:00.000Z",
    lastDoneDate: "2026-09-21",
    lastDoneAt: "2026-09-21T16:00:00.000Z",
  });
});

test("repair, unavailable, stale, and missing projections use legacy or persisted fallback per Task", () => {
  for (const validity of ["repair_required", "unavailable"] as const) {
    const result = resolve({ validity }, {
      legacyCurrentRead: {
        dueOnByTaskId: { "task-1": "2026-09-25" },
        statusesByTaskId: { "task-1": "done" },
      },
    });
    assert.deepEqual(result.freshProjectionTaskIds, []);
    assert.deepEqual(result.staleProjectionTaskIds, ["task-1"]);
    assert.equal(result.displayStatusByTaskId["task-1"], "done");
    assert.equal(result.dueOnByTaskId["task-1"], "2026-09-25");
    assert.equal(result.effectiveTaskHistoryStreakSummaries["task-1"]?.currentStreak, 2);
  }

  const missing = resolve({}, { historySyncEpoch: null, logicalDaySettingsRevision: null });
  assert.deepEqual(missing.missingProjectionTaskIds, []);
  assert.deepEqual(missing.staleProjectionTaskIds, ["task-1"]);
  assert.equal(missing.displayStatusByTaskId["task-1"], "pending");
  assert.equal(missing.dueOnByTaskId["task-1"], undefined);

  const noProjection = resolveCurrentTaskProjectionReads({
    historySyncEpoch: HISTORY_EPOCH,
    logicalDaySettingsRevision: 7,
    projectionsByTaskId: {},
    taskHistoryStreakSummaries: {},
    tasks: [task()],
    todayKey: TODAY,
  });
  assert.deepEqual(noProjection.missingProjectionTaskIds, ["task-1"]);
  assert.equal(noProjection.displayStatusByTaskId["task-1"], "pending");
  assert.equal(noProjection.dueOnByTaskId["task-1"], undefined);

  const queryFailureFallback = resolveCurrentTaskProjectionReads({
    historySyncEpoch: HISTORY_EPOCH,
    legacyCurrentRead: {
      dueOnByTaskId: { "task-1": "2026-09-25" },
      statusesByTaskId: { "task-1": "done" },
    },
    logicalDaySettingsRevision: 7,
    projectionsByTaskId: {},
    taskHistoryStreakSummaries: {},
    tasks: [task()],
    todayKey: TODAY,
  });
  assert.equal(queryFailureFallback.displayStatusByTaskId["task-1"], "done");
  assert.equal(queryFailureFallback.dueOnByTaskId["task-1"], "2026-09-25");
});

test("every existing freshness fence rejects a projection independently", () => {
  const invalidCases: Array<Partial<CurrentTaskProjectionReadRow>> = [
    { canonical_task_revision: 13 },
    { history_sync_epoch: "other-epoch" },
    { logical_day_settings_revision: 8 },
    { projected_logical_date: "2026-09-24" },
    { projection_schema_version: "unsupported-schema" as never },
    { projection_algorithm_version: "unsupported-algorithm" as never },
    { user_id: "other-user" },
    { entity_id: "other-task" },
    { entity_kind: "step" },
  ];

  for (const invalidCase of invalidCases) {
    const result = resolve(invalidCase, {
      legacyCurrentRead: {
        dueOnByTaskId: { "task-1": "2026-09-25" },
        statusesByTaskId: { "task-1": "done" },
      },
    });
    assert.deepEqual(result.freshProjectionTaskIds, [], JSON.stringify(invalidCase));
    assert.equal(result.displayStatusByTaskId["task-1"], "done");
    assert.equal(result.dueOnByTaskId["task-1"], "2026-09-25");
  }
});

test("projection summary adapter maps all six current summary fields", () => {
  assert.deepEqual(projectionToTaskHistoryStreakSummary(projection()), {
    currentStreak: 4,
    missedStreak: 0,
    lastHandledDate: "2026-09-22",
    lastHandledAt: "2026-09-22T15:00:00.000Z",
    lastDoneDate: "2026-09-21",
    lastDoneAt: "2026-09-21T16:00:00.000Z",
  });
});

test("projection realtime merge removes repair authority and restores it with a later valid update", () => {
  const initial = { "task-1": projection() };
  const repair = projection({ validity: "repair_required", updated_at: "2026-09-23T12:01:00.000Z" });
  const valid = projection({ current_positive_streak: 5, updated_at: "2026-09-23T12:02:00.000Z" });

  const afterRepair = mergeCurrentTaskProjectionRows(initial, [repair]);
  assert.equal(afterRepair["task-1"]?.validity, "repair_required");
  assert.equal(resolve({ validity: "repair_required", updated_at: repair.updated_at }).freshProjectionTaskIds.length, 0);

  const afterValid = mergeCurrentTaskProjectionRows(afterRepair, [valid]);
  assert.equal(afterValid["task-1"]?.current_positive_streak, 5);
  assert.deepEqual(resolve({ current_positive_streak: 5, updated_at: valid.updated_at }).freshProjectionTaskIds, ["task-1"]);
  assert.equal(mergeCurrentTaskProjectionRows(afterValid, [projection({ updated_at: "2026-09-23T11:00:00.000Z" })]), afterValid);
});

test("projection INSERTs are added and event bursts are coalesced into one flush", () => {
  const inserted = projection({ entity_id: "task-2", updated_at: "2026-09-23T12:03:00.000Z" });
  const flushed: CurrentTaskProjectionReadRow[][] = [];
  let scheduled: (() => void) | null = null;
  const buffer = createCurrentTaskProjectionEventBuffer((rows) => {
    flushed.push(rows);
  }, {
    schedule: (callback) => {
      scheduled = callback;
      return callback;
    },
    cancel: () => undefined,
  });

  buffer.enqueue(projection({ current_positive_streak: 4 }));
  buffer.enqueue(projection({ current_positive_streak: 5, updated_at: "2026-09-23T12:04:00.000Z" }));
  buffer.enqueue(inserted);
  assert.equal(flushed.length, 0);
  scheduled?.();
  assert.equal(flushed.length, 1);
  assert.deepEqual(flushed[0]?.map((row) => row.entity_id), ["task-1", "task-2"]);
  buffer.dispose();
});

test("matching parity is clean and field mismatches identify the Task and field", () => {
  const currentTask = task();
  const matching = compareCurrentTaskProjectionParity({
    legacyCurrentRead: {
      dueOnByTaskId: { "task-1": "2026-09-24" },
      statusesByTaskId: { "task-1": "in_progress" },
    },
    legacySummaries: {
      "task-1": {
        currentStreak: 4,
        missedStreak: 0,
        lastHandledDate: "2026-09-22",
        lastHandledAt: "2026-09-22T15:00:00.000Z",
        lastDoneDate: "2026-09-21",
        lastDoneAt: "2026-09-21T16:00:00.000Z",
      },
    },
    projectionsByTaskId: { "task-1": projection() },
    tasks: [currentTask],
  });
  assert.equal(matching.freshCount, 1);
  assert.equal(matching.mismatchedFields.length, 0);

  const mismatch = compareCurrentTaskProjectionParity({
    legacyCurrentRead: {
      dueOnByTaskId: { "task-1": "2026-09-24" },
      statusesByTaskId: { "task-1": "in_progress" },
    },
    legacySummaries: {
      "task-1": {
        currentStreak: 3,
        missedStreak: 0,
        lastHandledDate: "2026-09-22",
        lastHandledAt: "2026-09-22T15:00:00.000Z",
        lastDoneDate: "2026-09-21",
        lastDoneAt: "2026-09-21T16:00:00.000Z",
      },
    },
    projectionsByTaskId: { "task-1": projection() },
    tasks: [currentTask],
  });
  assert.deepEqual(mismatch.mismatchedTaskIds, ["task-1"]);
  assert.deepEqual(mismatch.mismatchedFields.map(({ field }) => field), ["currentPositiveStreak"]);
});
