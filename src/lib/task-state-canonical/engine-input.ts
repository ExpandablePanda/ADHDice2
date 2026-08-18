import { adaptLegacyTaskState } from "../task-state-engine/legacy-adapter.ts";
import type { TaskCalendarOverride, TaskRecurrence, TaskStateEngineInput } from "../task-state-engine/types.ts";
import type { CanonicalTaskCalendarOverride, CanonicalTaskOccurrence, CanonicalTaskScheduleBoundary } from "./types.ts";
import type { CanonicalTaskStateReadModel } from "./read-model.ts";
import { mapCanonicalTaskHistoryFacts } from "./history-projection.ts";
import { latestCanonicalScheduleBoundary } from "./schedule-projection.ts";

export class CanonicalWorkflowOccurrenceReferenceError extends Error {
  readonly code = "WORKFLOW_OCCURRENCE_REFERENCE_INVALID";

  constructor(occurrenceId: string) {
    super(`Canonical workflow occurrence ${occurrenceId} is unavailable.`);
    this.name = "CanonicalWorkflowOccurrenceReferenceError";
  }
}

/** Resolve the server-owned workflow occurrence without deriving a fallback identity. */
export function resolveCanonicalWorkflowOccurrence(
  readModel: CanonicalTaskStateReadModel,
): CanonicalTaskOccurrence | null {
  const occurrenceId = readModel.task.workflow_occurrence_id;
  if (!occurrenceId) return null;
  const occurrence = readModel.occurrences.find((candidate) => candidate.id === occurrenceId);
  if (!occurrence) throw new CanonicalWorkflowOccurrenceReferenceError(occurrenceId);
  return occurrence;
}

export function recurrenceFromBoundary(boundary: CanonicalTaskScheduleBoundary): TaskRecurrence {
  if (boundary.schedule_model === "unscheduled" || boundary.schedule_model === "one_time") return { kind: "none" };
  if (boundary.schedule_model === "rolling") {
    return {
      kind: "rolling",
      intervalDays: boundary.repeat_interval,
      ...(boundary.repeat_frequency === "daily_until_complete" ? { untilComplete: true } : {}),
    };
  }
  if (boundary.repeat_frequency === "weekly") {
    return {
      kind: "weekly",
      intervalWeeks: boundary.repeat_interval,
      weekdays: boundary.repeat_days_of_week,
      anchorDate: boundary.anchor_date,
    };
  }
  if (boundary.repeat_frequency === "monthly") {
    return {
      kind: "monthly",
      intervalMonths: boundary.repeat_interval,
      mode: boundary.repeat_monthly_mode,
      dayOfMonth: boundary.repeat_day_of_month,
      ordinal: boundary.repeat_monthly_ordinal,
      weekday: boundary.repeat_monthly_weekday,
      anchorDate: boundary.anchor_date,
    };
  }
  return {
    kind: "rolling",
    intervalDays: boundary.repeat_interval,
    ...(boundary.repeat_frequency === "daily_until_complete" ? { untilComplete: true } : {}),
  };
}

function historyRows(readModel: CanonicalTaskStateReadModel) {
  const occurrences = new Map(readModel.occurrences.map((occurrence) => [occurrence.id, occurrence]));
  return readModel.historyFacts.map((fact) => {
    const projected = mapCanonicalTaskHistoryFacts([fact])[0]!;
    const occurrence = fact.occurrence_id ? occurrences.get(fact.occurrence_id) : null;
    return {
      ...projected,
      // A scheduled_due_on is historical metadata, not proof that a
      // canonical occurrence row was materialized for this fact.
      occurrence_key: occurrence?.occurrence_key ?? null,
      occurrence_due_on: fact.scheduled_due_on ?? occurrence?.scheduled_due_on ?? null,
    };
  });
}

function canonicalCompatibilityStatus(readModel: CanonicalTaskStateReadModel) {
  const { task } = readModel;
  if (task.terminal_state === "permanently_complete") return "complete" as const;
  if (task.container_state === "trashed") return "trashed" as const;
  if (task.container_state === "archived") return "archived" as const;
  if (task.workflow_state === "in_progress") return "in_progress" as const;
  return task.status;
}

function canonicalEngineActiveStatus(readModel: CanonicalTaskStateReadModel): TaskStateEngineInput["task"]["activeStatus"] {
  const status = canonicalCompatibilityStatus(readModel);
  return status === "archived" || status === "trashed" ? "pending" : status;
}

export function taskCalendarOverrideFromCanonical(
  override: CanonicalTaskCalendarOverride,
): TaskCalendarOverride {
  return {
    id: override.id,
    logicalDate: override.logical_date,
    overrideState: override.override_state,
    revision: override.revision,
    source: override.source,
    provenance: override.provenance_kind,
  };
}

function activeCalendarOverrides(readModel: CanonicalTaskStateReadModel): TaskCalendarOverride[] {
  const active = (readModel.calendarOverrides ?? []).filter((override) => override.is_active);
  const seenDates = new Set<string>();
  for (const override of active) {
    if (seenDates.has(override.logical_date)) {
      throw new Error(`Canonical Calendar override state is ambiguous for ${override.logical_date}.`);
    }
    seenDates.add(override.logical_date);
  }
  return active.map(taskCalendarOverrideFromCanonical);
}

/**
 * Maps canonical facts into the existing pure engine input. This is a read
 * adapter only; recurrence and transition semantics remain in the engine.
 */
export function buildCanonicalTaskStateEngineInput(
  readModel: CanonicalTaskStateReadModel,
  context: { now: string; timezone: string; logicalDayRollover: string },
): TaskStateEngineInput {
  const boundary = latestCanonicalScheduleBoundary(readModel.scheduleBoundaries);
  if (!boundary) throw new Error("Canonical schedule state is unavailable.");
  const workflowOccurrence = resolveCanonicalWorkflowOccurrence(readModel);

  const adapted = adaptLegacyTaskState(
    {
      ...readModel.task,
      status: canonicalCompatibilityStatus(readModel),
      due_on: boundary.schedule_model === "one_time" ? boundary.one_time_due_on : readModel.task.due_on,
      repeat_frequency: boundary.repeat_frequency,
      repeat_interval: boundary.repeat_interval,
      repeat_days_of_week: boundary.repeat_days_of_week,
      repeat_day_of_month: boundary.repeat_day_of_month,
      repeat_monthly_mode: boundary.repeat_monthly_mode,
      repeat_monthly_ordinal: boundary.repeat_monthly_ordinal,
      repeat_monthly_weekday: boundary.repeat_monthly_weekday,
      due_time: boundary.due_time,
    },
    historyRows(readModel),
    context,
  );
  const lifecycle = readModel.task.terminal_state === "permanently_complete"
    ? "complete"
    : readModel.task.container_state === "trashed"
      ? "trashed"
      : readModel.task.container_state === "archived"
        ? "archived"
        : "active";
  const dueOn = boundary.schedule_model === "unscheduled"
    ? null
    : boundary.schedule_model === "one_time"
      ? boundary.one_time_due_on
      : readModel.task.due_on;

  return {
    ...adapted.engineInput,
    task: {
      ...adapted.engineInput.task,
      lifecycle,
      activeStatus: canonicalEngineActiveStatus(readModel),
      dueOn,
      activeOccurrenceDueOn: readModel.task.workflow_state === "in_progress"
        ? workflowOccurrence?.scheduled_due_on ?? adapted.engineInput.task.activeOccurrenceDueOn ?? null
        : adapted.engineInput.task.activeOccurrenceDueOn ?? null,
      activeStatusLogicalDate: readModel.task.workflow_logical_date ?? adapted.engineInput.task.activeStatusLogicalDate,
      historicalScheduleAnchor: boundary.schedule_model === "one_time"
        ? boundary.one_time_due_on
        : boundary.schedule_model === "unscheduled"
          ? null
          : boundary.anchor_date,
      historicalScheduleAnchorProven: boundary.anchor_confidence === "proven"
        || boundary.anchor_confidence === "high_confidence",
      recurrence: recurrenceFromBoundary(boundary),
    },
    calendarOverrides: activeCalendarOverrides(readModel),
    workflow: {
      state: readModel.task.workflow_state ?? "none",
      logicalDate: readModel.task.workflow_logical_date ?? null,
      occurrenceId: readModel.task.workflow_occurrence_id ?? null,
      commandId: readModel.task.workflow_command_id ?? null,
      revision: readModel.task.workflow_revision ?? null,
    },
  };
}
