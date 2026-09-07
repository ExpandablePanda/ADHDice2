import assert from "node:assert/strict";
import test from "node:test";
import type { Task } from "../src/lib/database.types.ts";
import { buildCanonicalTaskStateEngineInput } from "../src/lib/task-state-canonical/engine-input.ts";
import { buildTaskEffectiveTimeline } from "../src/lib/task-state-engine/effective-timeline.ts";
import { evaluateTaskState } from "../src/lib/task-state-engine/engine.ts";
import type { CanonicalTaskStateReadModel } from "../src/lib/task-state-canonical/read-model.ts";
import { mergeTaskWithCanonicalScheduleProjection, projectTaskWithCanonicalScheduleBoundary } from "../src/lib/task-state-canonical/schedule-projection.ts";
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

test("metadata and sort-order Task rows merge into projected Tasks without dropping authority", () => {
  const boundary = { id: "boundary-1", schedule_model: "unscheduled" } as unknown as CanonicalTaskScheduleBoundary;
  const projected = { id: "task-1", title: "Before", sort_order: 1, canonical_schedule_boundary: boundary, canonical_schedule_anchor_date: null } as unknown as Task;
  const persisted = { id: "task-1", title: "After", sort_order: 0 } as unknown as Task;

  const merged = mergeTaskWithCanonicalScheduleProjection(projected, persisted);

  assert.equal(merged.title, "After");
  assert.equal(merged.sort_order, 0);
  assert.equal(merged.canonical_schedule_boundary?.id, boundary.id);
});

test("multiple sibling and conflict/latest rows retain each current canonical projection", () => {
  const boundaries = ["step-a", "step-b", "step-c"].map((id) => ({ id: `boundary-${id}`, schedule_model: "unscheduled" } as unknown as CanonicalTaskScheduleBoundary));
  const projected = boundaries.map((boundary, index) => ({
    id: boundary.entity_id ?? `step-${String.fromCharCode(97 + index)}`,
    sort_order: index,
    canonical_schedule_boundary: boundary,
    canonical_schedule_anchor_date: null,
  } as unknown as Task));
  const persisted = projected.map((task) => ({ ...task, sort_order: task.sort_order + 1 } as Task));

  const reconciled = persisted.map((row) => {
    const current = projected.find((task) => task.id === row.id)!;
    return mergeTaskWithCanonicalScheduleProjection(current, row);
  });

  assert.deepEqual(reconciled.map((task) => task.sort_order), [1, 2, 3]);
  assert.deepEqual(reconciled.map((task) => task.canonical_schedule_boundary?.id), boundaries.map((boundary) => boundary.id));
});

test("canonical engine input separates the boundary anchor from the current due output", () => {
  const readModel = {
    task: {
      id: "task-1",
      status: "pending",
      due_on: "2026-08-14",
      canonicalization_status: "canonical_runtime",
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

test("canonical read projection self-heals an identity-less fixed success after Missed", () => {
  const fact = (id: string, logicalDate: string, outcome: "done" | "missed", scheduledDueOn: string | null) => ({
    id,
    user_id: "user-1",
    entity_id: "task-1",
    logical_date: logicalDate,
    outcome,
    event_kind: "explicit_outcome",
    occurrence_id: null,
    scheduled_due_on: scheduledDueOn,
    effective_due_on: null,
    provenance_kind: "user",
    created_at: `${logicalDate}T12:00:00.000Z`,
    updated_at: `${logicalDate}T12:00:00.000Z`,
  });
  const readModel = {
    task: {
      id: "task-1",
      status: "missed",
      due_on: "2026-09-06",
      active_status_logical_date: null,
      active_occurrence_due_on: null,
      canonicalization_status: "canonical_runtime",
      terminal_state: "active",
      container_state: "active",
      workflow_state: "none",
    },
    scheduleBoundaries: [{
      id: "boundary-fixed",
      schedule_model: "fixed",
      repeat_frequency: "weekly",
      repeat_interval: 1,
      repeat_days_of_week: [0],
      repeat_day_of_month: null,
      repeat_monthly_mode: "day_of_month",
      repeat_monthly_ordinal: null,
      repeat_monthly_weekday: null,
      one_time_due_on: null,
      anchor_date: "2026-08-30",
      anchor_confidence: "proven",
      boundary_sequence: 1,
    }],
    occurrences: [],
    historyFacts: [fact("missed-8-30", "2026-08-30", "missed", "2026-08-30"), fact("done-8-31", "2026-08-31", "done", null)],
  } as unknown as CanonicalTaskStateReadModel;
  const input = buildCanonicalTaskStateEngineInput(readModel, {
    logicalDayRollover: "00:00",
    now: "2026-09-01T12:00:00.000Z",
    timezone: "UTC",
  });
  const result = evaluateTaskState(input);

  assert.equal(result.activeStatus === "missed", false);
  assert.equal(result.nextDueDate, "2026-09-13");
  assert.equal(input.history.find((row) => row.logicalDate === "2026-08-31")?.occurrenceDueOn, null);
  assert.equal(readModel.historyFacts[1]?.scheduled_due_on, null);
});

test("zero-History recovery accepts only proven historical anchors", () => {
  const model = (anchorConfidence: "proven" | "high_confidence") => ({
    task: {
      id: "task-1",
      status: "pending",
      due_on: null,
      canonicalization_status: "canonical_runtime",
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
      anchor_date: "2026-08-14",
      anchor_confidence: anchorConfidence,
    }],
    occurrences: [],
    historyFacts: [],
  }) as unknown as CanonicalTaskStateReadModel;
  const context = { logicalDayRollover: "00:00", now: "2026-08-17T12:00:00.000Z", timezone: "UTC" };
  const missedDates = (confidence: "proven" | "high_confidence") => evaluateTaskState({
    ...buildCanonicalTaskStateEngineInput(model(confidence), context),
    action: { type: "reconcile_rollover" },
  }).proposedHistoryChanges.flatMap((change) => change.type === "insert" && change.row.outcome === "missed" ? [change.row.logicalDate] : []);

  assert.deepEqual(missedDates("proven"), ["2026-08-14", "2026-08-15", "2026-08-16"]);
  assert.deepEqual(missedDates("high_confidence"), []);
});

test("canonical engine input hydrates the active workflow occurrence from canonical storage", () => {
  const readModel = {
    task: {
      id: "task-1",
      status: "in_progress",
      due_on: "2026-08-10",
      canonicalization_status: "canonical_runtime",
      terminal_state: "active",
      container_state: "active",
      workflow_state: "in_progress",
      workflow_logical_date: "2026-08-10",
      workflow_occurrence_id: "occurrence-A",
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
    occurrences: [{
      id: "occurrence-A",
      scheduled_due_on: "2026-08-10",
      occurrence_key: "task:task-1:occurrence:2026-08-10",
    }],
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
  assert.equal(input.task.activeOccurrenceDueOn, "2026-08-10");
  assert.equal(timeline.days["2026-08-09"]?.state, "not_due");
  assert.equal(timeline.days["2026-08-09"]?.calendarOverrideId, "active");
  assert.equal(timeline.days["2026-08-10"]?.state, "in_progress");
  assert.equal(timeline.days["2026-08-10"]?.workflowRevision, 7);
});
