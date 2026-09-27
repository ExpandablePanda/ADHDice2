import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { Task } from "../src/lib/database.types.ts";
import {
  mergeCurrentTaskProjectionRows,
  resolveCurrentTaskProjectionReads,
  type CurrentTaskProjectionReadRow,
} from "../src/lib/task-current-projection-read.ts";
import {
  CURRENT_TASK_PROJECTION_ALGORITHM_VERSION,
  CURRENT_TASK_PROJECTION_SCHEMA_VERSION,
} from "../src/lib/task-current-projection.ts";
import { projectTasksForActiveStatusRead } from "../src/lib/task-state-engine/read-authority.ts";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const HISTORY_EPOCH = "00000000-0000-0000-0000-000000000099";
const TODAY = "2026-09-23";

function task(canonicalRevision: number): Task {
  return {
    id: "task-1",
    user_id: USER_ID,
    status: "pending",
    due_on: "2026-09-24",
    canonical_revision: canonicalRevision,
    entity_kind: "parent",
  } as Task;
}

function projection(overrides: Partial<CurrentTaskProjectionReadRow> = {}): CurrentTaskProjectionReadRow {
  return {
    user_id: USER_ID,
    entity_id: "task-1",
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
    history_source_revision: 24,
    logical_day_settings_revision: 7,
    projected_logical_date: TODAY,
    projection_schema_version: CURRENT_TASK_PROJECTION_SCHEMA_VERSION,
    projection_algorithm_version: CURRENT_TASK_PROJECTION_ALGORITHM_VERSION,
    validity: "valid",
    updated_at: "2026-09-23T12:00:00.000Z",
    ...overrides,
  };
}

function read(taskRow: Task, row: CurrentTaskProjectionReadRow, legacyStreak = 0) {
  return resolveCurrentTaskProjectionReads({
    historySyncEpoch: HISTORY_EPOCH,
    legacyCurrentRead: {
      dueOnByTaskId: { [taskRow.id]: "2026-09-24" },
      statusesByTaskId: { [taskRow.id]: "pending" },
    },
    logicalDaySettingsRevision: 7,
    projectionsByTaskId: { [taskRow.id]: row },
    taskHistoryStreakSummaries: {
      [taskRow.id]: {
        currentStreak: legacyStreak,
        missedStreak: 0,
        lastHandledDate: null,
        lastHandledAt: null,
        lastDoneDate: null,
        lastDoneAt: null,
      },
    },
    tasks: [taskRow],
    todayKey: TODAY,
  });
}

function visibleCurrentStreak(taskRow: Task, row: CurrentTaskProjectionReadRow) {
  const resolution = read(taskRow, row);
  return resolution.effectiveTaskHistoryStreakSummaries[taskRow.id]?.currentStreak ?? 0;
}

test("Task revision change rejects the old projection, repair_required preserves fallback, and rebuilt streak restores authority", () => {
  const initialTask = task(12);
  const initialProjection = projection();
  assert.equal(read(initialTask, initialProjection).effectiveTaskHistoryStreakSummaries[initialTask.id]?.currentStreak, 0);

  const nextTask = task(13);
  const afterTaskRealtime = read(nextTask, initialProjection, 0);
  assert.deepEqual(afterTaskRealtime.freshProjectionTaskIds, []);
  assert.equal(afterTaskRealtime.effectiveTaskHistoryStreakSummaries[nextTask.id]?.currentStreak, 0);

  const repairEvent = projection({
    canonical_task_revision: 12,
    validity: "repair_required",
    updated_at: "2026-09-23T12:01:00.000Z",
  });
  const afterRepair = mergeCurrentTaskProjectionRows({ [initialTask.id]: initialProjection }, [repairEvent]);
  assert.equal(afterRepair[initialTask.id]?.validity, "repair_required");
  assert.deepEqual(read(nextTask, afterRepair[nextTask.id]!, 0).freshProjectionTaskIds, []);

  const rebuiltProjection = projection({
    canonical_task_revision: 13,
    current_positive_streak: 1,
    updated_at: "2026-09-23T12:02:00.000Z",
  });
  const afterRebuild = mergeCurrentTaskProjectionRows(afterRepair, [rebuiltProjection]);
  const resolved = read(nextTask, afterRebuild[nextTask.id]!, 0);
  assert.deepEqual(resolved.freshProjectionTaskIds, [nextTask.id]);
  assert.equal(resolved.effectiveTaskHistoryStreakSummaries[nextTask.id]?.currentStreak, 1);
  assert.equal(visibleCurrentStreak(nextTask, afterRebuild[nextTask.id]!), 1);
});

test("repair and Task Realtime event ordering remains safe before the valid rebuild event", () => {
  const initialTask = task(12);
  const initialProjection = projection();
  const nextTask = task(13);
  const repairEvent = projection({
    canonical_task_revision: 12,
    validity: "repair_required",
    updated_at: "2026-09-23T12:01:00.000Z",
  });
  const rebuiltProjection = projection({
    canonical_task_revision: 13,
    current_positive_streak: 1,
    updated_at: "2026-09-23T12:02:00.000Z",
  });

  for (const order of ["repair-before-task", "task-before-repair"] as const) {
    let projectionMap = { [initialTask.id]: initialProjection };
    if (order === "repair-before-task") {
      projectionMap = mergeCurrentTaskProjectionRows(projectionMap, [repairEvent]);
      assert.deepEqual(read(initialTask, projectionMap[initialTask.id]!, 0).freshProjectionTaskIds, []);
      assert.deepEqual(read(nextTask, projectionMap[nextTask.id]!, 0).freshProjectionTaskIds, []);
    } else {
      assert.deepEqual(read(nextTask, projectionMap[nextTask.id]!, 0).freshProjectionTaskIds, []);
      projectionMap = mergeCurrentTaskProjectionRows(projectionMap, [repairEvent]);
      assert.deepEqual(read(nextTask, projectionMap[nextTask.id]!, 0).freshProjectionTaskIds, []);
    }

    projectionMap = mergeCurrentTaskProjectionRows(projectionMap, [rebuiltProjection]);
    const resolved = read(nextTask, projectionMap[nextTask.id]!, 0);
    assert.deepEqual(resolved.freshProjectionTaskIds, [nextTask.id], order);
    assert.equal(resolved.effectiveTaskHistoryStreakSummaries[nextTask.id]?.currentStreak, 1, order);
  }
});

test("Calendar receives the same projection-preferred current streak summary as Table/List", () => {
  const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const calendarMap = taskAppSource.slice(
    taskAppSource.indexOf("const calendarCurrentStreakByTaskId"),
    taskAppSource.indexOf("const currentTaskProjectionParityReady"),
  );
  assert.match(calendarMap, /effectiveTaskHistoryStreakSummaries\[task\.id\]\?\.currentStreak/);
  assert.doesNotMatch(calendarMap, /taskHistoryStreakSummaries\[task\.id\]\?\.currentStreak/);
  assert.match(taskAppSource, /currentStreakByTaskId=\{calendarCurrentStreakByTaskId\}/);
});

test("projectTasksForActiveStatusRead preserves the projection display due", () => {
  const sourceTask = { ...task(13), due_on: "2026-09-23" } as Task;
  const resolved = read(sourceTask, projection({ canonical_task_revision: 13, next_due_on: "2026-09-24" }));
  const projected = projectTasksForActiveStatusRead(
    [sourceTask],
    resolved.displayStatusByTaskId,
    resolved.dueOnByTaskId,
  );

  assert.equal(projected[0]?.due_on, "2026-09-24");
});
