import type {
  CurrentTaskProjectionActiveOccurrenceStatus,
  CurrentTaskProjectionValidity,
  Task,
  TaskCurrentProjection,
} from "./database.types.ts";
import { getTaskHistoryLastDone } from "./task-history.ts";
import { buildTaskHistoryLastHandledSummaryMap } from "./task-history-last-handled.ts";
import {
  buildTaskHistoryStreakSummary,
  type TaskHistoryStreakSummary,
} from "./task-history-streak-summaries.ts";
import {
  buildCanonicalTaskStateEngineInput,
  taskCalendarOverrideFromCanonical,
} from "./task-state-canonical/engine-input.ts";
import { mapCanonicalTaskHistoryFacts } from "./task-state-canonical/history-projection.ts";
import type { CanonicalTaskStateReadModel } from "./task-state-canonical/read-model.ts";
import {
  latestCanonicalScheduleBoundary,
  projectTaskWithCanonicalScheduleBoundary,
} from "./task-state-canonical/schedule-projection.ts";
import type {
  CanonicalTaskOccurrence,
  CanonicalTaskStateColumns,
} from "./task-state-canonical/types.ts";
import { sha256Hex, stableSerialize } from "./task-state-canonical/digest.ts";
import {
  logicalDateForTimestamp,
} from "./task-state-engine/calendar.ts";
import { evaluateTaskState } from "./task-state-engine/engine.ts";
import type { TaskStateEngineResult } from "./task-state-engine/types.ts";
import {
  selectTaskBehaviorProjectionSemantics,
  type TaskBehaviorPolicyResolutionContext,
} from "./task-state-engine/behavior-policy.ts";
import type { TaskCalendarOverride } from "./task-state-engine/types.ts";
import { normalizeTaskType } from "./task-type-domain.ts";

export const CURRENT_TASK_PROJECTION_SCHEMA_VERSION = "task-current-projection-schema-v1" as const;
export const CURRENT_TASK_PROJECTION_ALGORITHM_VERSION = "task-current-projection-algorithm-v1" as const;

type CanonicalTask = Task & Partial<CanonicalTaskStateColumns>;

export type CurrentTaskProjectionHistoryFrontier = {
  sequence: number;
  historyFactId: string;
  logicalDate: string;
  operation: "upsert" | "delete";
  rowRevision: number | null;
};

export type CurrentTaskProjectionHistoryFence = {
  syncEpoch: string;
  sourceRevision: number;
  frontier?: CurrentTaskProjectionHistoryFrontier | null;
};

export type BuildCurrentTaskProjectionInput = {
  readModel: CanonicalTaskStateReadModel;
  behaviorContext?: TaskBehaviorPolicyResolutionContext;
  historyFence: CurrentTaskProjectionHistoryFence;
  projectedAt: string | Date;
  /** Required for a child whose exclusion is inherited from an ancestor. */
  effectiveTrackingExclusion?: boolean;
};

type ProjectionBuildDiagnostics = {
  unavailable: string[];
  repairRequired: string[];
};

const SHA256_PREFIX = /^sha256:[0-9a-f]{64}$/;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const ENTITY_KINDS = new Set(["parent", "step", "substep"]);
const CANONICALIZATION_STATUSES = new Set(["canonical_proven", "canonical_runtime"]);

function sha256Digest(value: unknown) {
  return `sha256:${sha256Hex(stableSerialize(value))}`;
}

function sortByStable<T>(values: readonly T[], key: (value: T) => unknown = (value) => value) {
  return [...values].sort((left, right) => {
    const leftKey = stableSerialize(key(left));
    const rightKey = stableSerialize(key(right));
    return leftKey.localeCompare(rightKey);
  });
}

function sortedNumbers(values: readonly number[]) {
  return [...values].sort((left, right) => left - right);
}

function normalizedProjectedAt(value: string | Date) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && DATE_KEY.test(value);
}

function isTaskKind(value: unknown): value is TaskCurrentProjection["entity_kind"] {
  return typeof value === "string" && ENTITY_KINDS.has(value);
}

function canonicalBoundarySemantics(boundary: CanonicalTaskStateReadModel["scheduleBoundaries"][number]) {
  return {
    id: boundary.id,
    entity_id: boundary.entity_id,
    entity_kind: boundary.entity_kind,
    effective_from_logical_date: boundary.effective_from_logical_date,
    boundary_sequence: boundary.boundary_sequence,
    boundary_type: boundary.boundary_type,
    schedule_model: boundary.schedule_model,
    repeat_frequency: boundary.repeat_frequency,
    repeat_interval: boundary.repeat_interval,
    repeat_days_of_week: sortedNumbers(boundary.repeat_days_of_week),
    repeat_day_of_month: boundary.repeat_day_of_month,
    repeat_monthly_mode: boundary.repeat_monthly_mode,
    repeat_monthly_ordinal: boundary.repeat_monthly_ordinal,
    repeat_monthly_weekday: boundary.repeat_monthly_weekday,
    one_time_due_on: boundary.one_time_due_on,
    due_time: boundary.due_time,
    anchor_date: boundary.anchor_date,
    anchor_kind: boundary.anchor_kind,
    anchor_confidence: boundary.anchor_confidence,
    historical_scope_known: boundary.historical_scope_known,
    prospective_only: boundary.prospective_only,
    prior_boundary_id: boundary.prior_boundary_id,
    affected_occurrence_id: boundary.affected_occurrence_id,
    logical_day_settings_revision: boundary.logical_day_settings_revision,
    timezone: boundary.timezone,
    day_start_time: boundary.day_start_time,
    source_task_revision: boundary.source_task_revision,
    revision: boundary.revision,
  };
}

function canonicalOccurrenceSemantics(occurrence: CanonicalTaskOccurrence) {
  return {
    id: occurrence.id,
    entity_id: occurrence.entity_id,
    entity_kind: occurrence.entity_kind,
    occurrence_key: occurrence.occurrence_key,
    scheduled_due_on: occurrence.scheduled_due_on,
    source_boundary_id: occurrence.source_boundary_id,
    recurrence_source_fingerprint: occurrence.recurrence_source_fingerprint,
    origin_kind: occurrence.origin_kind,
    origin_confidence: occurrence.origin_confidence,
    materialization_reason: occurrence.materialization_reason,
    resolution_state: occurrence.resolution_state,
    resolved_logical_date: occurrence.resolved_logical_date,
    resolved_outcome: occurrence.resolved_outcome,
    resolved_history_id: occurrence.resolved_history_id,
    revision: occurrence.revision,
  };
}

function canonicalOverrideSemantics(override: CanonicalTaskStateReadModel["occurrenceEffectiveOverrides"][number]) {
  return {
    id: override.id,
    occurrence_id: override.occurrence_id,
    scheduled_due_on: override.scheduled_due_on,
    effective_due_on: override.effective_due_on,
    action_logical_date: override.action_logical_date,
    delay_kind: override.delay_kind,
    override_sequence: override.override_sequence,
    prior_override_id: override.prior_override_id,
    prior_override_sequence: override.prior_override_sequence,
    schedule_boundary_id: override.schedule_boundary_id,
    history_id: override.history_id,
    revision: override.revision,
  };
}

function canonicalCalendarOverrideSemantics(override: CanonicalTaskStateReadModel["calendarOverrides"][number]) {
  return {
    id: override.id,
    logical_date: override.logical_date,
    override_state: override.override_state,
    is_active: override.is_active,
    revision: override.revision,
  };
}

function scheduleFence(readModel: CanonicalTaskStateReadModel) {
  return sha256Digest({
    version: "task-current-projection-schedule-fence-v1",
    boundaries: sortByStable(readModel.scheduleBoundaries, (row) => [row.boundary_sequence, row.id])
      .map(canonicalBoundarySemantics),
    occurrences: sortByStable(readModel.occurrences, (row) => [row.scheduled_due_on, row.id])
      .filter((row) => row.resolution_state !== "superseded")
      .map(canonicalOccurrenceSemantics),
    occurrence_effective_overrides: sortByStable(readModel.occurrenceEffectiveOverrides, (row) => [row.action_logical_date, row.override_sequence, row.id])
      .map(canonicalOverrideSemantics),
    calendar_overrides: sortByStable(readModel.calendarOverrides, (row) => [row.logical_date, row.id])
      .map(canonicalCalendarOverrideSemantics),
  });
}

function behaviorFence(
  readModel: CanonicalTaskStateReadModel,
  context: TaskBehaviorPolicyResolutionContext,
  logicalDate: string,
) {
  const task = readModel.task;
  const selectionRows = readModel.behaviorSelections ?? [];
  const taskSelections = selectionRows.map((selection) => ({
    effectiveFromLogicalDate: selection.effective_from_logical_date,
    taskType: selection.task_type,
    customRulesetId: selection.custom_ruleset_id,
  }));
  const semantics = selectTaskBehaviorProjectionSemantics({
    behaviorProfiles: context.behaviorProfiles,
    behaviorPolicyRevisions: context.behaviorPolicyRevisions,
    behaviorSelectionsByTaskId: {
      ...(context.behaviorSelectionsByTaskId ?? {}),
      ...(readModel.behaviorSelections
        ? { [task.id]: taskSelections }
        : {}),
    },
    customRulesetId: task.custom_ruleset_id,
    logicalDate,
    namedCustomRulesetBehaviorPolicyRevisions: context.namedCustomRulesetBehaviorPolicyRevisions,
    taskId: task.id,
    taskType: normalizeTaskType(task.task_type),
  });
  const normalizedSemantics = {
    activeStatus: {
      profile: semantics.activeStatus.profile,
      revisions: sortByStable(semantics.activeStatus.revisions, (revision) => revision.effectiveFromLogicalDate)
        .map((revision) => ({ ...revision })),
    },
    streak: {
      profile: {
        ...semantics.streak.profile,
        successOutcomes: sortedStringsForFingerprint(semantics.streak.profile.successOutcomes),
      },
      revisions: sortByStable(semantics.streak.revisions, (revision) => revision.effectiveFromLogicalDate).map((revision) => ({
        ...revision,
        successOutcomes: sortedStringsForFingerprint(revision.successOutcomes),
      })),
    },
    rewards: {
      profile: semantics.rewards.profile,
      revisions: sortByStable(semantics.rewards.revisions, (revision) => revision.effectiveFromLogicalDate)
        .map((revision) => ({ ...revision })),
    },
  };
  return sha256Digest({
    version: "task-current-projection-behavior-fence-v1",
    task_type: task.task_type,
    custom_ruleset_id: task.custom_ruleset_id ?? null,
    selections: sortByStable(taskSelections, (row) => [row.effectiveFromLogicalDate, row.taskType, row.customRulesetId])
      .map((selection) => ({
        ...selection,
      })),
    semantics: normalizedSemantics,
  });
}

function sortedStringsForFingerprint(values: readonly string[]) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function historyFence(
  readModel: CanonicalTaskStateReadModel,
  fence: CurrentTaskProjectionHistoryFence,
) {
  return sha256Digest({
    version: "task-current-projection-history-fence-v1",
    user_id: readModel.task.user_id,
    entity_id: readModel.task.id,
    source_revision: fence.sourceRevision,
    frontier: fence.frontier ?? null,
    facts: sortByStable(readModel.historyFacts, (row) => [row.logical_date, row.id])
      .map((fact) => ({
        id: fact.id,
        logical_date: fact.logical_date,
        outcome: fact.outcome,
        event_kind: fact.event_kind,
        occurrence_id: fact.occurrence_id,
        scheduled_due_on: fact.scheduled_due_on,
        effective_due_on: fact.effective_due_on,
        schedule_boundary_id: fact.schedule_boundary_id,
        recurrence_source_fingerprint: fact.recurrence_source_fingerprint,
        provenance_kind: fact.provenance_kind,
        actor_kind: fact.actor_kind,
        command_id: fact.command_id,
        logical_day_settings_revision: fact.logical_day_settings_revision,
        timezone: fact.timezone,
        day_start_time: fact.day_start_time,
        revision: fact.revision,
      })),
  });
}

function taskSourceSemantics(task: CanonicalTask) {
  return {
    id: task.id,
    user_id: task.user_id,
    entity_kind: task.entity_kind,
    canonicalization_status: task.canonicalization_status,
    terminal_state: task.terminal_state,
    container_state: task.container_state,
    workflow_state: task.workflow_state,
    workflow_logical_date: task.workflow_logical_date,
    workflow_occurrence_id: task.workflow_occurrence_id,
    workflow_revision: task.workflow_revision,
    canonical_revision: task.canonical_revision,
    parent_task_id: task.parent_task_id,
    exclude_from_tracking: task.exclude_from_tracking ?? false,
  };
}

function activeTaskLifecycle(task: CanonicalTask) {
  if (task.terminal_state === "permanently_complete") return "complete" as const;
  if (task.container_state === "trashed") return "trashed" as const;
  if (task.container_state === "archived") return "archived" as const;
  return "active" as const;
}

function currentOccurrenceCandidates(
  readModel: CanonicalTaskStateReadModel,
  evaluated: TaskStateEngineResult,
): CanonicalTaskOccurrence[] {
  const currentLogicalDate = evaluated.logicalDate;
  const candidateDates = new Set([
    evaluated.timeline.activeOccurrenceDueOn,
    evaluated.timeline.unresolvedDueOn,
    evaluated.unresolvedOccurrenceDueOn,
    evaluated.nextDueDate,
    readModel.task.active_occurrence_due_on,
  ].filter((value): value is string => Boolean(value)));
  const candidateIdentities = new Set([
    evaluated.unresolvedOccurrenceIdentity,
    evaluated.satisfiedOccurrenceIdentity,
  ].filter((value): value is string => Boolean(value)));
  const currentHistoryOccurrenceIds = new Set(
    readModel.historyFacts
      .filter((fact) => fact.logical_date === currentLogicalDate && fact.occurrence_id)
      .map((fact) => fact.occurrence_id as string),
  );
  if (readModel.task.workflow_occurrence_id) currentHistoryOccurrenceIds.add(readModel.task.workflow_occurrence_id);
  return readModel.occurrences
    .filter((occurrence) => occurrence.resolution_state !== "superseded")
    .filter((occurrence) => (
      currentHistoryOccurrenceIds.has(occurrence.id)
      || candidateIdentities.has(occurrence.occurrence_key)
      || candidateDates.has(occurrence.scheduled_due_on)
    ))
    .filter((occurrence) => occurrence.scheduled_due_on >= currentLogicalDate
      || evaluated.activeStatus === "missed"
      || currentHistoryOccurrenceIds.has(occurrence.id)
      || candidateIdentities.has(occurrence.occurrence_key))
    .sort((left, right) => left.scheduled_due_on.localeCompare(right.scheduled_due_on) || left.id.localeCompare(right.id));
}

/**
 * Canonical current-occurrence mapping. An occurrence ID is emitted only when
 * the canonical occurrence row is materialized; date-derived engine identities
 * never become projection IDs.
 */
export function mapCurrentTaskOccurrenceStatus(input: {
  activeStatus: TaskCurrentProjection["display_status"];
  currentLogicalDate: string;
  currentEffectiveDueOn: string | null;
  lifecycle: ReturnType<typeof activeTaskLifecycle>;
  occurrence: CanonicalTaskOccurrence | null;
}): CurrentTaskProjectionActiveOccurrenceStatus {
  if (!input.occurrence) return "none";
  if (input.lifecycle !== "active" || input.activeStatus === "complete" || input.occurrence.resolved_outcome === "complete") {
    return "terminated";
  }
  if (input.activeStatus === "delayed" || input.occurrence.resolved_outcome === "delayed") return "delayed";
  if (input.activeStatus === "missed") {
    return input.currentEffectiveDueOn && input.currentEffectiveDueOn <= input.currentLogicalDate ? "overdue" : "open";
  }
  if (input.occurrence.resolution_state === "resolved"
    || input.activeStatus === "done"
    || input.activeStatus === "did_my_best") {
    return "handled";
  }
  return "open";
}

function validateInputs(
  input: BuildCurrentTaskProjectionInput,
  projectedAt: string,
): ProjectionBuildDiagnostics {
  const { readModel, historyFence: fence } = input;
  const task = readModel.task as CanonicalTask;
  const diagnostics: ProjectionBuildDiagnostics = { unavailable: [], repairRequired: [] };
  if (!task.user_id || !task.id) diagnostics.unavailable.push("canonical Task identity is unavailable");
  if (!isTaskKind(task.entity_kind)) diagnostics.unavailable.push("canonical entity kind is unavailable");
  if (!CANONICALIZATION_STATUSES.has(task.canonicalization_status ?? "")) {
    diagnostics.unavailable.push("canonical Task lifecycle authority is unavailable");
  }
  if (task.terminal_state == null || task.container_state == null || task.workflow_state == null) {
    diagnostics.unavailable.push("canonical lifecycle or workflow state is unavailable");
  }
  if (!isInteger(task.canonical_revision)) diagnostics.unavailable.push("canonical Task revision is malformed");
  if (!readModel.logicalDayProfile
    || typeof readModel.logicalDayProfile.timezone !== "string"
    || typeof readModel.logicalDayProfile.day_start_time !== "string"
    || !isInteger(readModel.logicalDayProfile.settings_revision)) {
    diagnostics.unavailable.push("logical-day settings authority is unavailable");
  }
  if (!projectedAt) diagnostics.unavailable.push("projection timestamp is unavailable");
  if (typeof fence.syncEpoch !== "string" || fence.syncEpoch.trim() === "") {
    diagnostics.unavailable.push("History sync epoch is malformed");
  }
  if (!isInteger(fence.sourceRevision)) diagnostics.unavailable.push("History source revision is malformed");
  if (fence.sourceRevision === 0 && fence.frontier) diagnostics.repairRequired.push("zero History frontier has a non-empty ledger tuple");
  if (fence.sourceRevision > 0 && !fence.frontier) diagnostics.unavailable.push("entity History frontier is unavailable");
  if (fence.frontier) {
    if (fence.frontier.sequence !== fence.sourceRevision) diagnostics.repairRequired.push("History frontier sequence does not match its revision");
    if (!fence.frontier.historyFactId || !isDateKey(fence.frontier.logicalDate) || !isInteger(fence.frontier.rowRevision ?? 0)) {
      diagnostics.repairRequired.push("History frontier tuple is malformed");
    }
    if (fence.frontier.rowRevision !== null && !isInteger(fence.frontier.rowRevision)) {
      diagnostics.repairRequired.push("History frontier row revision is malformed");
    }
  }
  // The 7.15.6 ledger intentionally starts at revision zero without
  // backfilling pre-ledger History. Old canonical facts therefore form a
  // valid sync-epoch baseline even when this entity has no ledger frontier.
  // Once this entity has a ledger event, the positive revision must carry its
  // matching frontier above.
  const scopedRows = [
    ...readModel.scheduleBoundaries,
    ...readModel.occurrences,
    ...readModel.occurrenceEffectiveOverrides,
    ...readModel.historyFacts,
    ...readModel.calendarOverrides,
    ...readModel.commandOperations,
  ];
  for (const row of scopedRows) {
    if (row.user_id !== task.user_id || row.entity_id !== task.id) {
      diagnostics.repairRequired.push("canonical read-model rows are not entity scoped");
      break;
    }
  }
  if (!latestCanonicalScheduleBoundary(readModel.scheduleBoundaries)) {
    diagnostics.unavailable.push("canonical schedule authority is unavailable");
  }
  const activeOccurrencesByKey = new Map<string, CanonicalTaskOccurrence[]>();
  for (const occurrence of readModel.occurrences) {
    const rows = activeOccurrencesByKey.get(occurrence.occurrence_key) ?? [];
    if (occurrence.resolution_state !== "superseded") rows.push(occurrence);
    activeOccurrencesByKey.set(occurrence.occurrence_key, rows);
    if (occurrence.resolution_state === "resolved" && occurrence.resolved_outcome === null) {
      diagnostics.repairRequired.push("resolved canonical occurrence has no outcome");
    }
    if (occurrence.resolution_state === "unresolved" && occurrence.resolved_outcome !== null) {
      diagnostics.repairRequired.push("unresolved canonical occurrence has a resolved outcome");
    }
  }
  for (const rows of activeOccurrencesByKey.values()) {
    if (rows.length > 1) diagnostics.repairRequired.push("canonical occurrence identity is ambiguous");
  }
  if (task.workflow_occurrence_id && !readModel.occurrences.some((row) => row.id === task.workflow_occurrence_id)) {
    diagnostics.repairRequired.push("workflow occurrence reference is unavailable");
  }
  if (task.parent_task_id && input.effectiveTrackingExclusion === undefined) {
    diagnostics.repairRequired.push("effective tracking exclusion is not proven for a child entity");
  }
  return diagnostics;
}

function fallbackStatus(task: CanonicalTask): TaskCurrentProjection["display_status"] {
  if (task.container_state === "trashed") return "trashed";
  if (task.container_state === "archived") return "archived";
  if (task.terminal_state === "permanently_complete") return "complete";
  return "pending";
}

function invalidProjection(
  input: BuildCurrentTaskProjectionInput,
  projectedAt: string,
  validity: CurrentTaskProjectionValidity,
  diagnostics: ProjectionBuildDiagnostics,
): TaskCurrentProjection {
  const task = input.readModel.task as CanonicalTask;
  const scheduleBoundaryRevision = scheduleFence(input.readModel);
  const behaviorPolicyRevision = sha256Digest({ unavailable: "behavior-policy-fence" });
  const historySourceFingerprint = historyFence(input.readModel, input.historyFence);
  const safeIdentity = isTaskKind(task.entity_kind) ? task.entity_kind : "parent";
  const sourceFingerprint = sha256Digest({
    diagnostics,
    entity_id: task.id ?? null,
    history_source_fingerprint: historySourceFingerprint,
    schedule_boundary_revision: scheduleBoundaryRevision,
    validity,
  });
  return {
    user_id: task.user_id ?? "",
    entity_id: task.id ?? "",
    entity_kind: safeIdentity,
    display_status: fallbackStatus(task),
    current_effective_due_on: null,
    next_due_on: null,
    active_occurrence_id: null,
    active_occurrence_status: "none",
    handled_current_logical_day: false,
    last_handled_logical_date: null,
    last_handled_at: null,
    last_done_logical_date: null,
    last_done_at: null,
    current_positive_streak: 0,
    current_missed_streak: 0,
    canonical_task_revision: isInteger(task.canonical_revision) ? task.canonical_revision as number : 0,
    history_sync_epoch: typeof input.historyFence.syncEpoch === "string" ? input.historyFence.syncEpoch : "",
    history_source_revision: isInteger(input.historyFence.sourceRevision) ? input.historyFence.sourceRevision : 0,
    history_source_fingerprint: historySourceFingerprint,
    schedule_boundary_revision: scheduleBoundaryRevision,
    behavior_policy_revision: behaviorPolicyRevision,
    logical_day_settings_revision: isInteger(input.readModel.logicalDayProfile?.settings_revision)
      ? input.readModel.logicalDayProfile.settings_revision
      : 0,
    projected_logical_date: "1970-01-01",
    projection_schema_version: CURRENT_TASK_PROJECTION_SCHEMA_VERSION,
    projection_algorithm_version: CURRENT_TASK_PROJECTION_ALGORITHM_VERSION,
    source_fingerprint: sourceFingerprint,
    validity,
    created_at: projectedAt,
    updated_at: projectedAt,
  };
}

function taskContext(
  readModel: CanonicalTaskStateReadModel,
  behaviorContext: TaskBehaviorPolicyResolutionContext,
) {
  if (!readModel.behaviorSelections) return behaviorContext;
  return {
    ...behaviorContext,
    behaviorSelectionsByTaskId: {
      ...(behaviorContext.behaviorSelectionsByTaskId ?? {}),
      [readModel.task.id]: readModel.behaviorSelections.map((selection) => ({
        effectiveFromLogicalDate: selection.effective_from_logical_date,
        taskType: selection.task_type,
        customRulesetId: selection.custom_ruleset_id,
      })),
    },
  };
}

function activeCalendarOverrides(readModel: CanonicalTaskStateReadModel): TaskCalendarOverride[] {
  return readModel.calendarOverrides
    .filter((override) => override.is_active)
    .map(taskCalendarOverrideFromCanonical);
}

function resultSummary(
  readModel: CanonicalTaskStateReadModel,
  engineResult: TaskStateEngineResult,
  context: TaskBehaviorPolicyResolutionContext,
  effectiveTrackingExclusion: boolean,
  projectedAt: string,
): { summary: TaskHistoryStreakSummary; lastHandled: ReturnType<typeof buildTaskHistoryLastHandledSummaryMap>[string] | undefined } {
  const history = mapCanonicalTaskHistoryFacts(readModel.historyFacts);
  const lastHandledMap = buildTaskHistoryLastHandledSummaryMap(
    [readModel.task],
    history,
    readModel.calendarOverrides,
    readModel.commandOperations,
    engineResult.logicalDate,
  );
  const boundary = latestCanonicalScheduleBoundary(readModel.scheduleBoundaries);
  const workflowOccurrence = readModel.task.workflow_occurrence_id
    ? readModel.occurrences.find((occurrence) => occurrence.id === readModel.task.workflow_occurrence_id)
    : null;
  const projectedTask = boundary
    ? {
      ...projectTaskWithCanonicalScheduleBoundary(readModel.task, boundary),
      active_occurrence_due_on: readModel.task.workflow_state === "in_progress"
        ? workflowOccurrence?.scheduled_due_on ?? readModel.task.active_occurrence_due_on
        : readModel.task.active_occurrence_due_on,
    }
    : readModel.task;
  const summary = buildTaskHistoryStreakSummary(projectedTask, history, engineResult.logicalDate, {
    ...context,
    calendarOverrides: activeCalendarOverrides(readModel),
    effectiveTrackingExclusion,
    manualActionSummaryByTaskId: lastHandledMap,
    logicalDayRollover: readModel.logicalDayProfile.day_start_time,
    now: projectedAt,
    timezone: readModel.logicalDayProfile.timezone,
  });
  return { lastHandled: lastHandledMap[readModel.task.id], summary };
}

/** Build one deterministic, write-free current Task projection from canonical facts. */
export function buildCurrentTaskProjection(input: BuildCurrentTaskProjectionInput): TaskCurrentProjection {
  const projectedAt = normalizedProjectedAt(input.projectedAt);
  const safeProjectedAt = projectedAt ?? "1970-01-01T00:00:00.000Z";
  if (!projectedAt) {
    return invalidProjection(input, safeProjectedAt, "unavailable", {
      unavailable: ["projection timestamp is malformed"],
      repairRequired: [],
    });
  }

  const diagnostics = validateInputs(input, projectedAt);
  const validity: CurrentTaskProjectionValidity = diagnostics.unavailable.length > 0
    ? "unavailable"
    : diagnostics.repairRequired.length > 0
      ? "repair_required"
      : "valid";
  if (validity === "unavailable") return invalidProjection(input, projectedAt, validity, diagnostics);

  const readModel = input.readModel;
  const task = readModel.task as CanonicalTask;
  const context = taskContext(readModel, input.behaviorContext ?? {});
  const logicalDate = logicalDateForTimestamp(
    projectedAt,
    readModel.logicalDayProfile.timezone,
    readModel.logicalDayProfile.day_start_time,
  );
  let engineInput: ReturnType<typeof buildCanonicalTaskStateEngineInput>;
  let evaluated: TaskStateEngineResult;
  try {
    engineInput = buildCanonicalTaskStateEngineInput(readModel, {
      ...context,
      logicalDayRollover: readModel.logicalDayProfile.day_start_time,
      now: projectedAt,
      timezone: readModel.logicalDayProfile.timezone,
    });
    evaluated = evaluateTaskState(engineInput);
  } catch (error) {
    return invalidProjection(input, projectedAt, "repair_required", {
      unavailable: [],
      repairRequired: [error instanceof Error ? error.message : "canonical evaluator failed safely"],
    });
  }

  const effectiveTrackingExclusion = input.effectiveTrackingExclusion
    ?? task.exclude_from_tracking === true;
  const { summary, lastHandled } = resultSummary(readModel, evaluated, context, effectiveTrackingExclusion, projectedAt);
  const currentEffectiveDueOn = evaluated.timeline.unresolvedDueOn
    ?? evaluated.unresolvedOccurrenceDueOn
    ?? evaluated.timeline.activeOccurrenceDueOn
    ?? null;
  const nextDueOn = evaluated.nextDueDate;
  const occurrenceCandidates = currentOccurrenceCandidates(readModel, evaluated);
  const activeOccurrence = occurrenceCandidates[0] ?? null;
  const activeOccurrenceStatus = mapCurrentTaskOccurrenceStatus({
    activeStatus: activeTaskLifecycle(task) === "active" ? evaluated.activeStatus : fallbackStatus(task),
    currentEffectiveDueOn,
    currentLogicalDate: logicalDate,
    lifecycle: activeTaskLifecycle(task),
    occurrence: activeOccurrence,
  });
  const finalValidity: CurrentTaskProjectionValidity = evaluated.validationErrors.length > 0
    ? "repair_required"
    : validity;
  const historySourceFingerprint = historyFence(readModel, input.historyFence);
  const scheduleBoundaryRevision = scheduleFence(readModel);
  const behaviorPolicyRevision = behaviorFence(readModel, context, logicalDate);
  const lastDone = getTaskHistoryLastDone(
    mapCanonicalTaskHistoryFacts(readModel.historyFacts),
    logicalDate,
  );
  const sourceFingerprint = sha256Digest({
    version: CURRENT_TASK_PROJECTION_ALGORITHM_VERSION,
    task: taskSourceSemantics(task),
    history_sync_epoch: input.historyFence.syncEpoch,
    history_source_revision: input.historyFence.sourceRevision,
    history_source_fingerprint: historySourceFingerprint,
    schedule_boundary_revision: scheduleBoundaryRevision,
    behavior_policy_revision: behaviorPolicyRevision,
    logical_day_settings_revision: readModel.logicalDayProfile.settings_revision,
    projected_logical_date: logicalDate,
    result: {
      display_status: activeTaskLifecycle(task) === "active" ? evaluated.activeStatus : fallbackStatus(task),
      current_effective_due_on: currentEffectiveDueOn,
      next_due_on: nextDueOn,
      active_occurrence_id: activeOccurrence?.id ?? null,
      active_occurrence_status: activeOccurrenceStatus,
      handled_current_logical_day: evaluated.handledCurrentDay,
      last_handled_logical_date: lastHandled?.dateKey ?? null,
      last_handled_at: lastHandled?.timestamp ?? null,
      last_done_logical_date: lastDone?.dateKey ?? summary.lastDoneDate,
      last_done_at: lastDone?.timestamp ?? summary.lastDoneAt,
      current_positive_streak: summary.currentStreak,
      current_missed_streak: summary.missedStreak,
    },
  });

  return {
    user_id: task.user_id,
    entity_id: task.id,
    entity_kind: task.entity_kind as TaskCurrentProjection["entity_kind"],
    display_status: activeTaskLifecycle(task) === "active" ? evaluated.activeStatus : fallbackStatus(task),
    current_effective_due_on: currentEffectiveDueOn,
    next_due_on: nextDueOn,
    active_occurrence_id: activeOccurrence?.id ?? null,
    active_occurrence_status: activeOccurrenceStatus,
    handled_current_logical_day: evaluated.handledCurrentDay,
    last_handled_logical_date: lastHandled?.dateKey ?? null,
    last_handled_at: lastHandled?.timestamp ?? null,
    last_done_logical_date: lastDone?.dateKey ?? summary.lastDoneDate,
    last_done_at: lastDone?.timestamp ?? summary.lastDoneAt,
    current_positive_streak: summary.currentStreak,
    current_missed_streak: summary.missedStreak,
    canonical_task_revision: task.canonical_revision as number,
    history_sync_epoch: input.historyFence.syncEpoch,
    history_source_revision: input.historyFence.sourceRevision,
    history_source_fingerprint: historySourceFingerprint,
    schedule_boundary_revision: scheduleBoundaryRevision,
    behavior_policy_revision: behaviorPolicyRevision,
    logical_day_settings_revision: readModel.logicalDayProfile.settings_revision,
    projected_logical_date: logicalDate,
    projection_schema_version: CURRENT_TASK_PROJECTION_SCHEMA_VERSION,
    projection_algorithm_version: CURRENT_TASK_PROJECTION_ALGORITHM_VERSION,
    source_fingerprint: sourceFingerprint,
    validity: finalValidity,
    created_at: projectedAt,
    updated_at: projectedAt,
  };
}

/** Source-level contract helper for tests and future trusted writers. */
export function isCurrentTaskProjectionFingerprint(value: string) {
  return SHA256_PREFIX.test(value);
}
