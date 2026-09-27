import assert from "node:assert/strict";
import test from "node:test";

import { createTask } from "../src/lib/task-buckets.ts";
import type { Task } from "../src/lib/database.types.ts";
import {
  compareCurrentTaskProjectionParity,
  summarizeCurrentTaskProjectionParity,
  type CurrentTaskProjectionReadRow,
} from "../src/lib/task-current-projection-read.ts";
import { CURRENT_TASK_PROJECTION_ALGORITHM_VERSION, CURRENT_TASK_PROJECTION_SCHEMA_VERSION } from "../src/lib/task-current-projection.ts";
import type { TaskHistoryStreakSummary } from "../src/lib/task-history-streak-summaries.ts";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const HISTORY_EPOCH = "00000000-0000-0000-0000-000000000099";

function task(id = "fixture-task", overrides: Partial<Task> = {}) {
  return {
    ...createTask({
      created_at: "2026-09-01T12:00:00.000Z",
      due_on: "2026-09-24",
      id,
      repeat_frequency: "daily",
      sort_order: 0,
      status: "pending",
      title: "Projection parity fixture",
      user_id: USER_ID,
    }),
    canonicalization_status: "canonical_runtime",
    canonical_revision: 12,
    container_state: "active",
    entity_kind: "parent",
    terminal_state: "active",
    workflow_state: "none",
    ...overrides,
  } as Task;
}

function projection(entityId = "fixture-task", overrides: Partial<CurrentTaskProjectionReadRow> = {}): CurrentTaskProjectionReadRow {
  return {
    user_id: USER_ID,
    entity_id: entityId,
    entity_kind: "parent",
    display_status: "pending",
    next_due_on: "2026-09-24",
    handled_current_logical_day: false,
    last_handled_logical_date: null,
    last_handled_at: null,
    last_handled_at_kind: null,
    last_done_logical_date: null,
    last_done_at: null,
    last_done_at_kind: null,
    current_positive_streak: 0,
    current_missed_streak: 0,
    canonical_task_revision: 12,
    history_sync_epoch: HISTORY_EPOCH,
    history_source_revision: 0,
    logical_day_settings_revision: 7,
    projected_logical_date: "2026-09-24",
    projection_schema_version: CURRENT_TASK_PROJECTION_SCHEMA_VERSION,
    projection_algorithm_version: CURRENT_TASK_PROJECTION_ALGORITHM_VERSION,
    validity: "valid",
    updated_at: "2026-09-24T12:00:00.000Z",
    ...overrides,
  };
}

function summary(overrides: Partial<TaskHistoryStreakSummary> = {}): TaskHistoryStreakSummary {
  return {
    currentStreak: 0,
    missedStreak: 0,
    lastHandledDate: null,
    lastHandledAt: null,
    lastDoneDate: null,
    lastDoneAt: null,
    ...overrides,
  };
}

function compareOne(
  currentTask: Task,
  currentProjection: CurrentTaskProjectionReadRow,
  legacySummary: TaskHistoryStreakSummary,
  legacyStatus: Task["status"] = "pending",
) {
  return compareCurrentTaskProjectionParity({
    legacyCurrentRead: {
      dueOnByTaskId: { [currentTask.id]: currentTask.due_on },
      statusesByTaskId: { [currentTask.id]: legacyStatus },
    },
    legacySummaries: { [currentTask.id]: legacySummary },
    projectionsByTaskId: { [currentTask.id]: currentProjection },
    tasks: [currentTask],
  });
}

test("V2 logical-day presentation compares equal to legacy floating midnight", () => {
  const currentTask = task();
  const result = compareOne(
    currentTask,
    projection(currentTask.id, {
      last_handled_logical_date: "2026-08-30",
      last_handled_at_kind: "logical_day_presentation",
    }),
    summary({
      lastHandledDate: "2026-08-30",
      lastHandledAt: "2026-08-30T00:00:00",
    }),
  );

  assert.deepEqual(result.mismatchedFields, []);
});

test("V2 event_instant compares equal to the same legacy instant", () => {
  const currentTask = task();
  const result = compareOne(
    currentTask,
    projection(currentTask.id, {
      last_handled_logical_date: "2026-08-30",
      last_handled_at: "2026-08-30T14:30:00.000Z",
      last_handled_at_kind: "event_instant",
    }),
    summary({
      lastHandledDate: "2026-08-30",
      lastHandledAt: "2026-08-30T10:30:00-04:00",
    }),
  );

  assert.deepEqual(result.mismatchedFields, []);
});

test("different real event instants still mismatch", () => {
  const currentTask = task();
  const result = compareOne(
    currentTask,
    projection(currentTask.id, {
      last_done_logical_date: "2026-08-30",
      last_done_at: "2026-08-30T14:30:00.000Z",
      last_done_at_kind: "event_instant",
    }),
    summary({
      lastDoneDate: "2026-08-30",
      lastDoneAt: "2026-08-30T15:30:00.000Z",
    }),
  );

  assert.deepEqual(result.mismatchedFields.map(({ field }) => field), ["lastDoneAt"]);
  assert.equal(result.mismatchDiagnostics[0]?.timestampClassification, "different instant");
});

test("different logical dates still mismatch", () => {
  const currentTask = task();
  const result = compareOne(
    currentTask,
    projection(currentTask.id, {
      last_handled_logical_date: "2026-08-30",
      last_handled_at_kind: "logical_day_presentation",
    }),
    summary({
      lastHandledDate: "2026-08-31",
      lastHandledAt: "2026-08-31T00:00:00",
    }),
  );

  assert.deepEqual(result.mismatchedFields.map(({ field }) => field), ["lastHandledDate", "lastHandledAt"]);
  assert.equal(result.mismatchDiagnostics.find(({ field }) => field === "lastHandledAt")?.timestampClassification, "different logical date");
});

test("trashed, archived, and permanently complete Tasks are excluded while active Tasks remain eligible", () => {
  const trashed = task("trashed", { container_state: "trashed" });
  const archived = task("archived", { container_state: "archived" });
  const complete = task("complete", { terminal_state: "permanently_complete" });
  const active = task("active");
  const tasks = [trashed, archived, complete, active];
  const result = compareCurrentTaskProjectionParity({
    legacyCurrentRead: {
      dueOnByTaskId: Object.fromEntries(tasks.map((currentTask) => [currentTask.id, currentTask.due_on])),
      statusesByTaskId: {
        trashed: "trashed",
        archived: "archived",
        complete: "complete",
        active: "pending",
      },
    },
    legacySummaries: Object.fromEntries(tasks.map((currentTask) => [currentTask.id, summary()])),
    projectionsByTaskId: Object.fromEntries(tasks.map((currentTask) => [currentTask.id, projection(currentTask.id, {
      display_status: currentTask.id === "active" ? "pending" : "upcoming",
    })])),
    tasks,
  });

  assert.deepEqual(result.excludedInactiveTaskIds, ["trashed", "archived", "complete"]);
  assert.deepEqual(result.eligibleTaskIds, ["active"]);
  assert.equal(result.excludedInactiveFreshCount, 3);
  assert.equal(result.eligibleFreshCount, 1);
  assert.deepEqual(result.mismatchedFields, []);

  const activeMismatch = compareOne(active, projection(active.id, { display_status: "upcoming" }), summary());
  assert.deepEqual(activeMismatch.mismatchedFields.map(({ field }) => field), ["displayStatus"]);
});

test("timestamp diagnostics retain raw V2 storage and reconstructed presentation values", () => {
  const currentTask = task();
  const result = compareOne(
    currentTask,
    projection(currentTask.id, {
      last_done_logical_date: "2026-08-30",
      last_done_at: null,
      last_done_at_kind: "logical_day_presentation",
    }),
    summary({
      lastDoneDate: "2026-08-31",
      lastDoneAt: "2026-08-31T00:00:00",
    }),
  );
  const diagnostic = result.mismatchDiagnostics.find(({ field }) => field === "lastDoneAt");

  assert.equal(diagnostic?.projectedStoredAt, null);
  assert.equal(diagnostic?.projectedAtKind, "logical_day_presentation");
  assert.equal(diagnostic?.projectedLogicalDate, "2026-08-30");
  assert.equal(diagnostic?.projectedPresentationValue, "2026-08-30T00:00:00");
  assert.equal(diagnostic?.legacyValue, "2026-08-31T00:00:00");
});

test("first-10 pilot fixture has zero active semantic mismatches and reports inactive rows separately", () => {
  const inactiveIds = [
    "011ef29e-4f24-4938-83e8-9b1a1b96f316",
    "01c88b18-bac5-4588-bd28-355eacb0d5e5",
  ];
  const logicalDayTaskId = "03477549-8ab8-4d78-9589-9ba6b757eada";
  const tasks = [
    ...inactiveIds.map((id) => task(id, { container_state: "trashed" })),
    task(logicalDayTaskId),
    ...Array.from({ length: 7 }, (_, index) => task(`pilot-active-${index + 1}`)),
  ];
  const result = compareCurrentTaskProjectionParity({
    legacyCurrentRead: {
      dueOnByTaskId: Object.fromEntries(tasks.map((currentTask) => [currentTask.id, currentTask.due_on])),
      statusesByTaskId: Object.fromEntries(tasks.map((currentTask) => [currentTask.id, currentTask.container_state === "trashed" ? "trashed" : "pending"])),
    },
    legacySummaries: Object.fromEntries(tasks.map((currentTask) => [currentTask.id, currentTask.id === logicalDayTaskId
      ? summary({ lastHandledDate: "2026-08-30", lastHandledAt: "2026-08-30T00:00:00" })
      : summary()])),
    projectionsByTaskId: Object.fromEntries(tasks.map((currentTask) => [currentTask.id, projection(currentTask.id, currentTask.id === logicalDayTaskId
      ? {
        last_handled_logical_date: "2026-08-30",
        last_handled_at: null,
        last_handled_at_kind: "logical_day_presentation",
      }
      : {})])),
    tasks,
  });
  const diagnostics = summarizeCurrentTaskProjectionParity(result);

  assert.equal(result.freshCount, 10);
  assert.equal(result.eligibleFreshCount, 8);
  assert.equal(result.excludedInactiveFreshCount, 2);
  assert.deepEqual(result.excludedInactiveTaskIds, inactiveIds);
  assert.equal(diagnostics.mismatchedTaskCount, 0);
  for (const field of [
    "displayStatus",
    "displayDueOn",
    "currentPositiveStreak",
    "currentMissedStreak",
    "lastHandledDate",
    "lastDoneDate",
    "lastHandledAt",
    "lastDoneAt",
  ] as const) {
    assert.equal(diagnostics.mismatchCounts[field], 0, field);
  }
});
