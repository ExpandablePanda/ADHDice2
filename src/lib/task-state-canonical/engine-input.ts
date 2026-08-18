import { buildDirectTaskStateEngineInput, type CanonicalProjectedTaskState } from "../task-state-engine/direct-input.ts";
import type { TaskCalendarOverride, TaskStateEngineInput } from "../task-state-engine/types.ts";
import type { CanonicalTaskCalendarOverride, CanonicalTaskOccurrence, CanonicalTaskScheduleBoundary } from "./types.ts";
import type { CanonicalTaskStateReadModel } from "./read-model.ts";
import { mapCanonicalTaskHistoryFacts } from "./history-projection.ts";
import { latestCanonicalScheduleBoundary } from "./schedule-projection.ts";

export { recurrenceFromBoundary } from "../task-state-engine/direct-input.ts";

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

  const task = {
    ...readModel.task,
    canonical_schedule_boundary: boundary,
    active_occurrence_due_on: readModel.task.workflow_state === "in_progress"
      ? workflowOccurrence?.scheduled_due_on ?? readModel.task.active_occurrence_due_on
      : readModel.task.active_occurrence_due_on,
  } as CanonicalProjectedTaskState;
  return buildDirectTaskStateEngineInput(task, historyRows(readModel), context, {
    calendarOverrides: activeCalendarOverrides(readModel),
    workflow: {
      state: readModel.task.workflow_state ?? "none",
      logicalDate: readModel.task.workflow_logical_date ?? null,
      occurrenceId: readModel.task.workflow_occurrence_id ?? null,
      commandId: readModel.task.workflow_command_id ?? null,
      revision: readModel.task.workflow_revision ?? null,
    },
  });
}
