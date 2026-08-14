import assert from "node:assert/strict";
import test from "node:test";
import type { Task } from "../src/lib/database.types.ts";
import { buildCanonicalTaskStateEngineInput } from "../src/lib/task-state-canonical/engine-input.ts";
import { buildTaskEffectiveTimeline } from "../src/lib/task-state-engine/effective-timeline.ts";
import type { CanonicalTaskStateReadModel } from "../src/lib/task-state-canonical/read-model.ts";
import { projectTaskWithCanonicalScheduleBoundary } from "../src/lib/task-state-canonical/schedule-projection.ts";
import type { CanonicalTaskScheduleBoundary } from "../src/lib/task-state-canonical/types.ts";

test("latest canonical schedule boundary drives the visible repeat projection", () => {
  const task = {
    id: "task-1",
    due_on: "2026-08-11",
    due_time: null,
    repeat_frequency: "daily",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
  } as unknown as Task;
  const boundary = {
    schedule_model: "fixed",
    repeat_frequency: "weekly",
    repeat_interval: 1,
    repeat_days_of_week: [2, 4],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    due_time: "09:30",
  } as unknown as CanonicalTaskScheduleBoundary;
  const projected = projectTaskWithCanonicalScheduleBoundary(task, boundary);
  assert.equal(projected.repeat_frequency, "weekly");
  assert.deepEqual(projected.repeat_days_of_week, [2, 4]);
  assert.equal(projected.due_time, "09:30");
});

test("canonical projection preserves the schedule anchor for read-only timeline replay", () => {
  const task = {
    id: "task-1",
    due_on: "2026-08-14",
  } as unknown as Task;
  const boundary = {
    schedule_model: "rolling",
    anchor_date: "2026-08-04",
  } as unknown as CanonicalTaskScheduleBoundary;

  const projected = projectTaskWithCanonicalScheduleBoundary(task, boundary);

  assert.equal(projected.due_on, "2026-08-14");
  assert.equal(projected.canonical_schedule_anchor_date, "2026-08-04");
});

test("canonical engine input separates the boundary anchor from the current due output", () => {
  const readModel = {
    task: {
      id: "task-1",
      status: "pending",
      due_on: "2026-08-14",
      terminal_state: "active",
      container_state: "active",
      workflow_state: "none",
      active_status_logical_date: null,
      active_occurrence_due_on: null,
    },
    scheduleBoundaries: [{
      schedule_model: "rolling",
      repeat_frequency: "daily",
      repeat_interval: 1,
      repeat_days_of_week: [],
      repeat_day_of_month: null,
      repeat_monthly_mode: "day_of_month",
      repeat_monthly_ordinal: null,
      repeat_monthly_weekday: null,
      anchor_date: "2026-08-04",
    }],
    occurrences: [],
    historyFacts: [],
  } as unknown as CanonicalTaskStateReadModel;

  const input = buildCanonicalTaskStateEngineInput(readModel, {
    logicalDayRollover: "00:00",
    now: "2026-08-14T12:00:00.000Z",
    timezone: "UTC",
  });

  assert.equal(input.task.dueOn, "2026-08-14");
  assert.equal(input.task.historicalScheduleAnchor, "2026-08-04");
});

test("canonical engine input keeps only active Calendar overrides and workflow provenance", () => {
  const readModel = {
    task: {
      id: "task-1",
      status: "in_progress",
      due_on: "2026-08-10",
      terminal_state: "active",
      container_state: "active",
      workflow_state: "in_progress",
      workflow_logical_date: "2026-08-10",
      workflow_occurrence_id: "workflow-occurrence",
      workflow_command_id: "workflow-command",
      workflow_revision: 7,
      active_status_logical_date: "2026-08-10",
      active_occurrence_due_on: null,
    },
    scheduleBoundaries: [{
      schedule_model: "one_time",
      repeat_frequency: "none",
      repeat_interval: 1,
      repeat_days_of_week: [],
      repeat_day_of_month: null,
      repeat_monthly_mode: "day_of_month",
      repeat_monthly_ordinal: null,
      repeat_monthly_weekday: null,
      one_time_due_on: "2026-08-10",
    }],
    occurrences: [],
    historyFacts: [],
    calendarOverrides: [
      { id: "inactive", logical_date: "2026-08-09", override_state: "due_open", is_active: false },
      { id: "active", logical_date: "2026-08-09", override_state: "not_due", is_active: true, revision: 2, source: "test", provenance_kind: "manual" },
    ],
  } as unknown as CanonicalTaskStateReadModel;

  const input = buildCanonicalTaskStateEngineInput(readModel, {
    logicalDayRollover: "00:00",
    now: "2026-08-10T12:00:00.000Z",
    timezone: "UTC",
  });
  const timeline = buildTaskEffectiveTimeline({
    ...input,
    logicalDate: "2026-08-10",
    calendarStart: "2026-08-09",
    calendarEnd: "2026-08-10",
  });

  assert.deepEqual(input.calendarOverrides?.map((override) => override.id), ["active"]);
  assert.equal(input.workflow?.logicalDate, "2026-08-10");
  assert.equal(timeline.days["2026-08-09"]?.state, "not_due");
  assert.equal(timeline.days["2026-08-09"]?.calendarOverrideId, "active");
  assert.equal(timeline.days["2026-08-10"]?.state, "in_progress");
  assert.equal(timeline.days["2026-08-10"]?.workflowRevision, 7);
});
