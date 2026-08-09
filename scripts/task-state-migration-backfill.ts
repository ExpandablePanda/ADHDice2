import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  CLASSIFIER_VERSION,
  MIGRATION_VERSION,
  SCHEMA_CONTRACT_VERSION,
  buildMigrationRunReport,
  fingerprintEvidence,
  loadAuthenticatedOwnerScopedEvidence,
  normalizeCurrentScheduleForMigration,
  type EntityClassification,
  type EntityMigrationDispositions,
  type LegacyRow,
  type MigrationSourceEvidence,
  OWNER_APPROVED_HISTORY_EXCLUSION,
} from "./task-state-migration-dry-run.ts";

export const BACKFILL_VERSION = "task-state-migration-backfill-v1" as const;
export const REWARD_PROGRAM_VERSION = "task-reward-v1" as const;
export const DEFAULT_BATCH_SIZE = 25;
export const MAX_BATCH_SIZE = 100;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const UUID_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME_KEY = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const HANDLED_STATUSES = new Set(["done", "did_my_best"]);
const BLOCKING_ISSUES = new Set([
  "CROSS_USER_PARENT",
  "HIERARCHY_CYCLE",
  "ORPHAN_PARENT_REFERENCE",
  "INVALID_RECURRENCE_CONFIGURATION",
  "RECURRENCE_ANCHOR_UNPROVEN",
  "IN_PROGRESS_LIFECYCLE_CONTRADICTION",
  "IN_PROGRESS_FIELDS_CONTRADICTORY",
  "IN_PROGRESS_OCCURRENCE_UNPROVEN",
  "STALE_IN_PROGRESS_NOT_DID_MY_BEST",
  "LOGICAL_DAY_UNAVAILABLE",
  "INVALID_LOGICAL_DAY_SETTINGS",
  "SOURCE_UNAVAILABLE_TASKS",
  "SOURCE_UNAVAILABLE_HISTORY",
  "PROJECTION_MISMATCH_ACTIVE_OCCURRENCE",
  "MALFORMED_LEGACY_HISTORY",
  "COMPLETE_TERMINAL_TIMESTAMP_MISSING",
  "TRASH_TIMESTAMP_MISSING",
  "SCHEDULE_BOUNDARY_UNREPRESENTABLE",
  "CANONICAL_INITIALIZATION_UNRESOLVED",
]);

export class MigrationBackfillDiagnostic extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "MigrationBackfillDiagnostic";
    this.code = code;
  }
}

export type BackfillIssuePlan = {
  category:
    | "anchor_unknown"
    | "schedule_boundary_contradiction"
    | "delay_origin_unknown"
    | "complete_contradiction"
    | "trash_prior_container_unknown"
    | "in_progress_stale"
    | "hierarchy_orphan"
    | "hierarchy_cycle"
    | "cross_user_reference"
    | "legacy_subtask_unmapped"
    | "legacy_subtask_duplicate"
    | "reward_ambiguous"
    | "malformed_repeat"
    | "orphan_history"
    | "orphan_effect"
    | "projection_contradiction";
  severity: "info" | "warning" | "blocking";
  classification: string;
  evidenceSnapshot: LegacyRow;
  evidenceFingerprint: string;
  scopeIdentity: string;
  sourceOperation: string | null;
};

export type LegacyHistoryEvidencePlan = {
  sourceHistoryId: string;
  entityId: string | null;
  legacyEntryDate: string | null;
  legacyStatus: string;
  legacyEventType: string;
  legacyOccurrenceKey: string | null;
  legacyOccurrenceDueOn: string | null;
  legacyCountedAsDueOccurrence: boolean;
  legacyWasCompleted: boolean;
  legacyCreatedAt: string | null;
  legacyUpdatedAt: string | null;
  sourceKind: "adhdice_task_history";
  classification: "automatic_missed" | "explicit_missed" | "ambiguous" | "other";
  confidence: "proven" | "high_confidence" | "medium_confidence" | "low" | "unavailable";
  sourceOperation: string | null;
  sourceSnapshot: LegacyRow;
};

export type CurrentDayHistoryFactPlan = {
  logicalDate: string;
  outcome: "done" | "did_my_best";
  sourceLegacyHistoryId: string | null;
  idempotenceIdentity: string;
};

export type ScheduleBoundaryPlan = {
  effectiveFromLogicalDate: string;
  boundarySequence: 1;
  scheduleModel: "unscheduled" | "one_time" | "rolling" | "fixed";
  repeatFrequency: string;
  repeatInterval: number;
  repeatDaysOfWeek: number[];
  repeatDayOfMonth: number | null;
  repeatMonthlyMode: string;
  repeatMonthlyOrdinal: string | null;
  repeatMonthlyWeekday: number | null;
  oneTimeDueOn: string | null;
  dueTime: string | null;
  anchorDate: string | null;
  anchorKind: "migration_prospective" | "unknown";
  anchorConfidence: "high_confidence" | "unavailable";
  historicalScopeKnown: false;
  prospectiveOnly: true;
  idempotenceIdentity: string;
  sourceTaskRevision: number | null;
  evidence: string[];
};

export type CanonicalTaskPlan = {
  entityKind: "parent" | "step" | "substep";
  terminalState: "active" | "permanently_complete";
  containerState: "active" | "archived" | "trashed";
  priorContainerState: "active" | "archived" | null;
  priorContainerStateStatus: "not_applicable" | "proven" | "unknown";
  terminalCompletedAt: string | null;
  containerTrashedAt: string | null;
  workflowState: "none" | "in_progress";
  workflowStartedAt: string | null;
  workflowLogicalDate: string | null;
  workflowOccurrenceId: string | null;
  workflowCommandId: string | null;
  workflowRevision: 1;
  canonicalRevision: 1;
  canonicalCreatedAt: string;
  canonicalUpdatedAt: string;
};

export type BackfillPlan = {
  backfillVersion: typeof BACKFILL_VERSION;
  migrationVersion: typeof MIGRATION_VERSION;
  classifierVersion: typeof CLASSIFIER_VERSION;
  schemaContractVersion: typeof SCHEMA_CONTRACT_VERSION;
  rewardProgramVersion: typeof REWARD_PROGRAM_VERSION;
  userId: string;
  entityId: string | null;
  inputFingerprint: string;
  operationIdentity: string;
  canonicalizationTime: string;
  logicalDate: string | null;
  sourceGuard: {
    sourceFingerprint: string;
    taskRevision: number | null;
    taskUpdatedAt: string | null;
    historyCount: number;
    historyUpdatedAtMax: string | null;
    profileSettingsRevision: number | null;
  };
  ready: boolean;
  taskSnapshot: LegacyRow | null;
  classification: EntityClassification | null;
  canonicalTask: CanonicalTaskPlan | null;
  scheduleBoundary: ScheduleBoundaryPlan | null;
  currentDayHistoryFacts: CurrentDayHistoryFactPlan[];
  legacyHistoryEvidence: LegacyHistoryEvidencePlan[];
  occurrences: never[];
  delayOverrides: never[];
  rewardObjects: never[];
  issues: BackfillIssuePlan[];
  stageCounts: {
    boundaries: number;
    currentDayHistoryFacts: number;
    legacyHistoryEvidence: number;
    occurrences: number;
    delayOverrides: number;
    historicalRewards: number;
  };
};

export type BackfillDryRunReport = {
  reportVersion: typeof BACKFILL_VERSION;
  migrationVersion: typeof MIGRATION_VERSION;
  classifierVersion: typeof CLASSIFIER_VERSION;
  schemaContractVersion: typeof SCHEMA_CONTRACT_VERSION;
  rewardProgramVersion: typeof REWARD_PROGRAM_VERSION;
  generatedAt: string;
  userId: string;
  tasksScanned: number;
  tasksReadyForCanonicalInitialization: number;
  tasksNeedingAttention: number;
  scheduleModelCounts: Record<string, number>;
  prospectiveBoundariesPlanned: number;
  currentDayHistoryFactsPlanned: number;
  legacyHistoryEvidenceRowsPlanned: number;
  occurrencesPlanned: number;
  delayOverridesPlanned: number;
  historicalRewardRecordsPlanned: 0;
  genuineBlockers: string[];
  blockerTasks: Array<{ entityId: string; issues: string[] }>;
  sourceFingerprints: { tasks: string; history: string; rewards: string; profile?: string };
  writeReadiness: {
    defaultMode: "dry-run";
    explicitExecuteRequired: true;
    sourceDataAvailable: boolean;
    contractsRequired: [typeof SCHEMA_CONTRACT_VERSION, "task-state-migration-v1"];
    canWriteBoundedOperations: boolean;
  };
};

export type BackfillPackage = { report: BackfillDryRunReport; plans: BackfillPlan[] };

function value(row: LegacyRow | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const key of keys) if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  return undefined;
}

function stringValue(row: LegacyRow | null | undefined, ...keys: string[]): string | null {
  const candidate = value(row, ...keys);
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function dateValue(row: LegacyRow | null | undefined, ...keys: string[]): string | null {
  const candidate = stringValue(row, ...keys);
  return candidate && DATE_KEY.test(candidate) ? candidate : null;
}

function numberValue(row: LegacyRow | null | undefined, ...keys: string[]): number | null {
  const candidate = value(row, ...keys);
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}

function booleanValue(row: LegacyRow, ...keys: string[]): boolean {
  const candidate = value(row, ...keys);
  return typeof candidate === "boolean" ? candidate : false;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isValidTimestamp(candidate: string | null): boolean {
  return candidate !== null && !Number.isNaN(new Date(candidate).getTime());
}

function isValidUuid(candidate: string | null): boolean {
  return candidate !== null && UUID_KEY.test(candidate);
}

function currentTask(sources: MigrationSourceEvidence, entityId: string): LegacyRow | null {
  return sources.tasks.find((row) => stringValue(row, "id") === entityId) ?? null;
}

function entitySourceFingerprint(entity: EntityClassification): string {
  return fingerprintEvidence(entity.sourceFingerprints);
}

function historySourceGuard(rows: readonly LegacyRow[]) {
  const updated = rows
    .map((row) => stringValue(row, "updated_at"))
    .filter((candidate): candidate is string => candidate !== null)
    .sort(compareStrings);
  return {
    historyCount: rows.length,
    historyUpdatedAtMax: updated.at(-1) ?? null,
  };
}

function normalizedHistoryClassification(entity: EntityClassification | null, row: LegacyRow): {
  classification: LegacyHistoryEvidencePlan["classification"];
  confidence: LegacyHistoryEvidencePlan["confidence"];
} {
  const historyId = stringValue(row, "id");
  const found = entity?.historyClassifications.find((item) => item.historyId === historyId);
  if (!found) return { classification: "other", confidence: "unavailable" };
  const classification = found.classification === "automatic_missed"
    ? "automatic_missed"
    : found.classification === "explicit" && found.status === "missed"
      ? "explicit_missed"
      : found.classification === "ambiguous"
        ? "ambiguous"
        : "other";
  const confidence = found.confidence === "proven"
    ? "proven"
    : found.confidence === "high_confidence"
      ? "high_confidence"
      : "unavailable";
  return { classification, confidence };
}

function buildLegacyHistoryEvidence(
  row: LegacyRow,
  entity: EntityClassification | null,
  canonicalizationTime: string,
): LegacyHistoryEvidencePlan {
  const classification = normalizedHistoryClassification(entity, row);
  return {
    sourceHistoryId: stringValue(row, "id") ?? "",
    entityId: stringValue(row, "task_id"),
    legacyEntryDate: dateValue(row, "entry_date"),
    legacyStatus: stringValue(row, "status") ?? "unknown",
    legacyEventType: stringValue(row, "event_type") ?? "status",
    legacyOccurrenceKey: stringValue(row, "occurrence_key"),
    legacyOccurrenceDueOn: dateValue(row, "occurrence_due_on"),
    legacyCountedAsDueOccurrence: booleanValue(row, "counted_as_due_occurrence"),
    legacyWasCompleted: booleanValue(row, "was_completed") || HANDLED_STATUSES.has(stringValue(row, "status") ?? "") || stringValue(row, "status") === "complete",
    legacyCreatedAt: stringValue(row, "created_at") ?? canonicalizationTime,
    legacyUpdatedAt: stringValue(row, "updated_at") ?? canonicalizationTime,
    sourceKind: "adhdice_task_history",
    classification: classification.classification,
    confidence: classification.confidence,
    sourceOperation: null,
    sourceSnapshot: row,
  };
}

function issueCategory(issue: string): BackfillIssuePlan["category"] {
  if (issue.includes("ORPHAN_HISTORY")) return "orphan_history";
  if (issue === "HIERARCHY_CYCLE") return "hierarchy_cycle";
  if (issue.includes("CROSS_USER")) return "cross_user_reference";
  if (issue.includes("ORPHAN")) return "hierarchy_orphan";
  if (issue.includes("RECURRENCE") || issue.includes("INVALID_RECURRENCE")) return "malformed_repeat";
  if (issue.includes("ANCHOR")) return "anchor_unknown";
  if (issue.includes("TRASH")) return "trash_prior_container_unknown";
  if (issue.includes("IN_PROGRESS") || issue.includes("STALE_IN_PROGRESS")) return "in_progress_stale";
  if (issue.includes("COMPLETE")) return "complete_contradiction";
  if (issue.includes("REWARD")) return "reward_ambiguous";
  return "projection_contradiction";
}

function issueSeverity(issue: string, task: LegacyRow | null): BackfillIssuePlan["severity"] {
  if (issue === "TRASH_PRIOR_CONTAINER_UNKNOWN" || issue === "CONTRADICTORY_TRASH_PRIOR_CONTAINER") return "warning";
  if (issue === "INVALID_RECURRENCE_CONFIGURATION" && stringValue(task, "status") === "trashed") return "warning";
  return BLOCKING_ISSUES.has(issue) ? "blocking" : "warning";
}

function makeIssue(
  issue: string,
  entityId: string | null,
  task: LegacyRow | null,
  sourceFingerprint: string,
): BackfillIssuePlan {
  const scopeIdentity = entityId ? `task:${entityId}` : "user:orphan-history";
  return {
    category: issueCategory(issue),
    severity: issueSeverity(issue, task),
    classification: issue,
    evidenceSnapshot: {
      issue,
      entityId,
      taskStatus: stringValue(task, "status"),
      taskUpdatedAt: stringValue(task, "updated_at"),
    },
    evidenceFingerprint: fingerprintEvidence({ sourceFingerprint, issue, entityId }),
    scopeIdentity,
    sourceOperation: null,
  };
}

function sourceAvailabilityAllowsCanonicalization(sources: MigrationSourceEvidence): boolean {
  return sources.availability?.tasks?.available !== false
    && sources.availability?.history?.available !== false
    && sources.availability?.profile?.available !== false;
}

export function sourceFingerprintsChanged(
  before: { tasks: string; history: string; rewards: string; profile?: string },
  after: { tasks: string; history: string; rewards: string; profile?: string },
): boolean {
  return before.tasks !== after.tasks
    || before.history !== after.history
    || before.rewards !== after.rewards
    || before.profile !== after.profile;
}

function assertOwnerScopedSources(sources: MigrationSourceEvidence, userId: string): void {
  const rows = [
    ...sources.tasks,
    ...sources.history,
    ...sources.subtasks,
    ...sources.promotions,
    ...sources.taskEvents,
    ...sources.pointLedger,
    ...sources.rewardRolls,
    ...sources.rewardClaims,
    ...sources.pendingRewardAccount,
    ...sources.pendingRewardOperations,
    ...sources.pendingRewardItems,
    ...sources.rolloverEvidence,
  ];
  if (rows.some((row) => {
    const rowUserId = stringValue(row, "user_id");
    return rowUserId === null || rowUserId !== userId;
  })) throw new MigrationBackfillDiagnostic("CROSS_USER_SCOPE_REJECTED", "source snapshot contains a row owned by another user");
  const profileUserId = stringValue(sources.profile, "user_id");
  if (sources.profile !== null && (profileUserId === null || profileUserId !== userId)) throw new MigrationBackfillDiagnostic("CROSS_USER_SCOPE_REJECTED", "profile owner does not match --user-id");
}

function currentDayFact(
  task: LegacyRow,
  entity: EntityClassification,
  history: readonly LegacyRow[],
  logicalDate: string | null,
  sourceFingerprint: string,
): CurrentDayHistoryFactPlan[] {
  const status = stringValue(task, "status");
  if (!logicalDate || !HANDLED_STATUSES.has(status ?? "") || entity.historyDisposition === "owner_approved_excluded") return [];
  const activeDate = dateValue(task, "active_status_logical_date");
  const matchingHistory = history.find((row) =>
    dateValue(row, "entry_date") === logicalDate
    && stringValue(row, "status") === status
    && stringValue(row, "user_id") === entity.userId,
  );
  if (activeDate !== logicalDate && !matchingHistory) return [];
  return [{
    logicalDate,
    outcome: status as "done" | "did_my_best",
    sourceLegacyHistoryId: matchingHistory ? stringValue(matchingHistory, "id") : null,
    idempotenceIdentity: `m2:current-day:${entity.entityId}:${logicalDate}:${sourceFingerprint}`,
  }];
}

function buildTaskPlan(
  task: LegacyRow,
  entity: EntityClassification,
  reportLogicalDate: string | null,
  sources: MigrationSourceEvidence,
  canonicalizationTime: string,
): BackfillPlan {
  const entityId = entity.entityId;
  const taskHistory = sources.history.filter((row) => stringValue(row, "task_id") === entityId);
  const sourceFingerprint = entitySourceFingerprint(entity);
  const guard = historySourceGuard(taskHistory);
  const profile = sources.profile;
  const profileSettingsRevision = numberValue(profile, "settings_revision");
  const issues = new Set<string>();
  if (!sourceAvailabilityAllowsCanonicalization(sources)) {
    if (sources.availability?.tasks?.available === false) issues.add("SOURCE_UNAVAILABLE_TASKS");
    if (sources.availability?.history?.available === false) issues.add("SOURCE_UNAVAILABLE_HISTORY");
    if (sources.availability?.profile?.available === false) issues.add("INVALID_LOGICAL_DAY_SETTINGS");
  }
  if (!reportLogicalDate) issues.add("LOGICAL_DAY_UNAVAILABLE");
  if (profileSettingsRevision === null || stringValue(profile, "timezone") === null || stringValue(profile, "day_start_time", "logical_day_start") === null) {
    issues.add("INVALID_LOGICAL_DAY_SETTINGS");
  }

  const schedule = normalizeCurrentScheduleForMigration(task);
  if (schedule.model === "ambiguous") issues.add("INVALID_RECURRENCE_CONFIGURATION");
  const taskStatus = stringValue(task, "status");
  const terminalState = taskStatus === "complete" ? "permanently_complete" : "active";
  const terminalCompletedAt = terminalState === "permanently_complete" ? stringValue(task, "completed_at") : null;
  if (terminalState === "permanently_complete" && !isValidTimestamp(terminalCompletedAt)) issues.add("COMPLETE_TERMINAL_TIMESTAMP_MISSING");

  const containerState = taskStatus === "archived" ? "archived" : taskStatus === "trashed" ? "trashed" : "active";
  const trashedAt = containerState === "trashed" ? stringValue(task, "trashed_at") : null;
  if (containerState === "trashed" && !isValidTimestamp(trashedAt)) issues.add("TRASH_TIMESTAMP_MISSING");
  const rawPrior = stringValue(task, "prior_container_state", "previous_container_state");
  const priorContainerState = containerState === "trashed" && (rawPrior === "active" || rawPrior === "archived") ? rawPrior : null;
  const priorContainerStateStatus = containerState !== "trashed" ? "not_applicable" : priorContainerState ? "proven" : "unknown";
  if (containerState === "trashed" && priorContainerStateStatus === "unknown") issues.add("TRASH_PRIOR_CONTAINER_UNKNOWN");

  const normalizedFrequency = schedule.repeatFrequency;
  const anchorRequired = schedule.model === "rolling" || (schedule.model === "fixed" && normalizedFrequency === "weekly");
  if (anchorRequired && schedule.anchorDate === null) issues.add("RECURRENCE_ANCHOR_UNPROVEN");
  if (schedule.model === "one_time" && schedule.oneTimeDueOn === null) issues.add("INVALID_RECURRENCE_CONFIGURATION");
  if (schedule.dueTime !== null && !TIME_KEY.test(schedule.dueTime)) issues.add("INVALID_RECURRENCE_CONFIGURATION");

  let workflowState: CanonicalTaskPlan["workflowState"] = "none";
  let workflowStartedAt: string | null = null;
  let workflowLogicalDate: string | null = null;
  let workflowOccurrenceId: string | null = null;
  let workflowCommandId: string | null = null;
  const ownerApprovedWorkflowReset = entity.workflowProjectionDisposition === "owner_approved_reset";
  if (taskStatus === "in_progress" && !ownerApprovedWorkflowReset) {
    const activeDate = dateValue(task, "active_status_logical_date");
    const candidateCommandId = stringValue(task, "workflow_command_id", "active_workflow_command_id");
    const candidateOccurrenceId = stringValue(task, "workflow_occurrence_id", "active_workflow_occurrence_id");
    const candidateStartedAt = stringValue(task, "workflow_started_at", "in_progress_started_at");
    if (activeDate !== reportLogicalDate) issues.add(activeDate && reportLogicalDate && activeDate < reportLogicalDate ? "STALE_IN_PROGRESS_NOT_DID_MY_BEST" : "IN_PROGRESS_FIELDS_CONTRADICTORY");
    else if (!isValidUuid(candidateCommandId) || !isValidTimestamp(candidateStartedAt)) issues.add("IN_PROGRESS_FIELDS_CONTRADICTORY");
    else {
      workflowState = "in_progress";
      workflowStartedAt = candidateStartedAt;
      workflowLogicalDate = activeDate;
      workflowOccurrenceId = isValidUuid(candidateOccurrenceId) ? candidateOccurrenceId : null;
      workflowCommandId = candidateCommandId;
    }
  }

  for (const classifierIssue of entity.blockingIssueCodes) {
    if (classifierIssue === "COMPLETE_PROJECTION_ONLY" || classifierIssue === "COMPLETE_TERMINAL_CONTRADICTION") continue;
    if (classifierIssue === "STALE_IN_PROGRESS_NOT_DID_MY_BEST" && ownerApprovedWorkflowReset) continue;
    if (classifierIssue === "CONTRADICTORY_TRASH_PRIOR_CONTAINER") continue;
    if (classifierIssue.startsWith("IN_PROGRESS") || classifierIssue === "STALE_IN_PROGRESS_NOT_DID_MY_BEST") {
      if (taskStatus !== "in_progress") continue;
    }
    if (classifierIssue === "PROJECTION_MISMATCH_ACTIVE_OCCURRENCE" && ownerApprovedWorkflowReset) continue;
    if (classifierIssue === "PROJECTION_MISMATCH_ACTIVE_OCCURRENCE" && HANDLED_STATUSES.has(taskStatus ?? "") && reportLogicalDate === dateValue(task, "active_status_logical_date")) continue;
    if (BLOCKING_ISSUES.has(classifierIssue)) issues.add(classifierIssue);
  }

  const representableScheduleModel = schedule.model === "ambiguous" ? null : schedule.model;
  const boundaryCanBeRepresented = reportLogicalDate !== null
    && representableScheduleModel !== null
    && !issues.has("INVALID_RECURRENCE_CONFIGURATION")
    && !(anchorRequired && schedule.anchorDate === null);
  const scheduleBoundary: ScheduleBoundaryPlan | null = boundaryCanBeRepresented && reportLogicalDate
    ? {
      effectiveFromLogicalDate: reportLogicalDate,
      boundarySequence: 1,
      scheduleModel: representableScheduleModel,
      repeatFrequency: schedule.repeatFrequency,
      repeatInterval: schedule.repeatInterval,
      repeatDaysOfWeek: schedule.repeatDaysOfWeek,
      repeatDayOfMonth: schedule.repeatDayOfMonth,
      repeatMonthlyMode: schedule.repeatMonthlyMode,
      repeatMonthlyOrdinal: schedule.repeatMonthlyOrdinal,
      repeatMonthlyWeekday: schedule.repeatMonthlyWeekday,
      oneTimeDueOn: schedule.oneTimeDueOn,
      dueTime: schedule.dueTime,
      anchorDate: schedule.anchorDate,
      anchorKind: schedule.anchorKind,
      anchorConfidence: schedule.anchorConfidence,
      historicalScopeKnown: false,
      prospectiveOnly: true,
      idempotenceIdentity: `m2:boundary:${entityId}:1`,
      sourceTaskRevision: numberValue(task, "revision"),
      evidence: schedule.evidence,
    }
    : null;
  if (!scheduleBoundary) issues.add("SCHEDULE_BOUNDARY_UNREPRESENTABLE");

  const canonicalTask: CanonicalTaskPlan | null = {
    entityKind: entity.entityKind,
    terminalState,
    containerState,
    priorContainerState,
    priorContainerStateStatus,
    terminalCompletedAt,
    containerTrashedAt: trashedAt,
    workflowState,
    workflowStartedAt,
    workflowLogicalDate,
    workflowOccurrenceId,
    workflowCommandId,
    workflowRevision: 1,
    canonicalRevision: 1,
    canonicalCreatedAt: canonicalizationTime,
    canonicalUpdatedAt: canonicalizationTime,
  };
  const blockingIssues = [...issues].filter((issue) => BLOCKING_ISSUES.has(issue) || issue.endsWith("_MISSING") || issue === "SCHEDULE_BOUNDARY_UNREPRESENTABLE");
  const ready = blockingIssues.length === 0 && scheduleBoundary !== null;
  const historyFacts = ready ? currentDayFact(task, entity, taskHistory, reportLogicalDate, sourceFingerprint) : [];
  const evidence = taskHistory.map((row) => buildLegacyHistoryEvidence(row, entity, canonicalizationTime));
  const issuePlans = [...new Set([...issues, ...(ready ? [] : ["CANONICAL_INITIALIZATION_UNRESOLVED"])])]
    .map((issue) => makeIssue(issue, entityId, task, sourceFingerprint));
  return {
    backfillVersion: BACKFILL_VERSION,
    migrationVersion: MIGRATION_VERSION,
    classifierVersion: CLASSIFIER_VERSION,
    schemaContractVersion: SCHEMA_CONTRACT_VERSION,
    rewardProgramVersion: REWARD_PROGRAM_VERSION,
    userId: entity.userId,
    entityId,
    inputFingerprint: sourceFingerprint,
    operationIdentity: `m2:backfill:${entityId}:${sourceFingerprint}`,
    canonicalizationTime,
    logicalDate: reportLogicalDate,
    sourceGuard: {
      sourceFingerprint,
      taskRevision: numberValue(task, "revision"),
      taskUpdatedAt: stringValue(task, "updated_at"),
      ...guard,
      profileSettingsRevision,
    },
    ready,
    taskSnapshot: task,
    classification: entity,
    canonicalTask: ready ? canonicalTask : null,
    scheduleBoundary: ready ? scheduleBoundary : null,
    currentDayHistoryFacts: historyFacts,
    legacyHistoryEvidence: evidence,
    occurrences: [],
    delayOverrides: [],
    rewardObjects: [],
    issues: issuePlans,
    stageCounts: {
      boundaries: ready && scheduleBoundary ? 1 : 0,
      currentDayHistoryFacts: historyFacts.length,
      legacyHistoryEvidence: evidence.length,
      occurrences: 0,
      delayOverrides: 0,
      historicalRewards: 0,
    },
  };
}

function buildOrphanHistoryPlan(
  userId: string,
  rows: readonly LegacyRow[],
  canonicalizationTime: string,
): BackfillPlan | null {
  if (rows.length === 0) return null;
  const sourceFingerprint = fingerprintEvidence(rows);
  const evidence = rows.map((row) => buildLegacyHistoryEvidence(row, null, canonicalizationTime));
  return {
    backfillVersion: BACKFILL_VERSION,
    migrationVersion: MIGRATION_VERSION,
    classifierVersion: CLASSIFIER_VERSION,
    schemaContractVersion: SCHEMA_CONTRACT_VERSION,
    rewardProgramVersion: REWARD_PROGRAM_VERSION,
    userId,
    entityId: null,
    inputFingerprint: sourceFingerprint,
    operationIdentity: `m2:orphan-history:${sourceFingerprint}`,
    canonicalizationTime,
    logicalDate: null,
    sourceGuard: { sourceFingerprint, taskRevision: null, taskUpdatedAt: null, historyCount: rows.length, historyUpdatedAtMax: historySourceGuard(rows).historyUpdatedAtMax, profileSettingsRevision: null },
    ready: false,
    taskSnapshot: null,
    classification: null,
    canonicalTask: null,
    scheduleBoundary: null,
    currentDayHistoryFacts: [],
    legacyHistoryEvidence: evidence,
    occurrences: [],
    delayOverrides: [],
    rewardObjects: [],
    issues: rows.map((row) => makeIssue("ORPHAN_HISTORY_REFERENCE", null, null, fingerprintEvidence(row))),
    stageCounts: { boundaries: 0, currentDayHistoryFacts: 0, legacyHistoryEvidence: evidence.length, occurrences: 0, delayOverrides: 0, historicalRewards: 0 },
  };
}

export function buildBackfillPackage(
  sources: MigrationSourceEvidence,
  userId: string,
  options: {
    logicalDate?: string;
    currentInstant?: string | Date;
    entityDispositions?: EntityMigrationDispositions;
    canonicalizationTime?: string;
  } = {},
): BackfillPackage {
  if (!userId.trim()) throw new MigrationBackfillDiagnostic("INVALID_USER_ID", "--user-id is required");
  assertOwnerScopedSources(sources, userId);
  const report = buildMigrationRunReport([{ sources, userId, logicalDate: options.logicalDate, currentInstant: options.currentInstant, entityDispositions: options.entityDispositions }], { currentInstant: options.currentInstant });
  const canonicalizationTime = options.canonicalizationTime ?? report.userReports[0]?.generatedAt ?? new Date().toISOString();
  const plans = report.entityRecords.map((entity) => {
    const task = currentTask(sources, entity.entityId);
    if (!task) throw new MigrationBackfillDiagnostic("TASK_SNAPSHOT_MISSING", `classified Task ${entity.entityId} is missing from the owner-scoped snapshot`);
    return buildTaskPlan(task, entity, report.userReports[0]?.logicalDate ?? null, sources, canonicalizationTime);
  });
  const ownerTaskIds = new Set(report.entityRecords.map((entity) => entity.entityId));
  const orphanRows = sources.history.filter((row) => {
    const taskId = stringValue(row, "task_id");
    return taskId === null || !ownerTaskIds.has(taskId);
  });
  const orphanPlan = buildOrphanHistoryPlan(userId, orphanRows, canonicalizationTime);
  if (orphanPlan) plans.push(orphanPlan);
  const taskPlans = plans.filter((plan) => plan.entityId !== null);
  const sourceDataAvailable = sourceAvailabilityAllowsCanonicalization(sources);
  const blockerTasks = taskPlans
    .filter((plan) => !plan.ready)
    .map((plan) => ({ entityId: plan.entityId as string, issues: plan.issues.filter((issue) => issue.severity === "blocking").map((issue) => issue.classification) }));
  const genuineBlockers = [...new Set(blockerTasks.flatMap((item) => item.issues))].sort(compareStrings);
  const scheduleModelCounts = report.userReports[0]?.counts.scheduleModels ?? {};
  return {
    plans,
    report: {
      reportVersion: BACKFILL_VERSION,
      migrationVersion: MIGRATION_VERSION,
      classifierVersion: CLASSIFIER_VERSION,
      schemaContractVersion: SCHEMA_CONTRACT_VERSION,
      rewardProgramVersion: REWARD_PROGRAM_VERSION,
      generatedAt: canonicalizationTime,
      userId,
      tasksScanned: taskPlans.length,
      tasksReadyForCanonicalInitialization: taskPlans.filter((plan) => plan.ready).length,
      tasksNeedingAttention: taskPlans.filter((plan) => !plan.ready).length,
      scheduleModelCounts,
      prospectiveBoundariesPlanned: plans.reduce((count, plan) => count + plan.stageCounts.boundaries, 0),
      currentDayHistoryFactsPlanned: plans.reduce((count, plan) => count + plan.stageCounts.currentDayHistoryFacts, 0),
      legacyHistoryEvidenceRowsPlanned: plans.reduce((count, plan) => count + plan.stageCounts.legacyHistoryEvidence, 0),
      occurrencesPlanned: 0,
      delayOverridesPlanned: 0,
      historicalRewardRecordsPlanned: 0,
      genuineBlockers,
      blockerTasks,
      sourceFingerprints: report.userReports[0]?.sourceFingerprints ?? { tasks: fingerprintEvidence([]), history: fingerprintEvidence([]), profile: fingerprintEvidence([]), rewards: fingerprintEvidence([]) },
      writeReadiness: {
        defaultMode: "dry-run",
        explicitExecuteRequired: true,
        sourceDataAvailable,
        contractsRequired: [SCHEMA_CONTRACT_VERSION, "task-state-migration-v1"],
        canWriteBoundedOperations: sourceDataAvailable && taskPlans.length > 0,
      },
    },
  };
}

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
};

export async function applyBackfillPlans(
  client: RpcClient,
  plans: readonly BackfillPlan[],
  options: { leaseToken: string; leaseOwner: string; leaseExpiresAt: string },
): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const plan of plans) {
    const result = await client.rpc("adhdice_migration_backfill_entity", {
      p_user_id: plan.userId,
      p_lease_token: options.leaseToken,
      p_lease_owner: options.leaseOwner,
      p_lease_expires_at: options.leaseExpiresAt,
      p_plan: plan,
      p_source_guard: plan.sourceGuard,
    });
    if (result.error) throw new MigrationBackfillDiagnostic(result.error.code ?? "BACKFILL_WRITE_FAILED", result.error.message);
    results.push(result.data);
  }
  return results;
}

type ReadWriteClient = RpcClient & {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): Promise<{ data: LegacyRow[] | null; error: { code?: string; message: string } | null }>;
    };
    upsert(row: LegacyRow, options?: { onConflict?: string }): Promise<{ error: { code?: string; message: string } | null }>;
  };
};

async function assertSchemaContracts(client: ReadWriteClient): Promise<void> {
  for (const [table, key, expected] of [
    ["adhdice_task_state_schema_contract", "canonical_task_state", SCHEMA_CONTRACT_VERSION],
    ["adhdice_task_state_migration_schema_contract", "migration_support", SCHEMA_CONTRACT_VERSION],
  ] as const) {
    const result = await client.from(table).select("*").eq("contract_key", key);
    if (result.error) throw new MigrationBackfillDiagnostic(result.error.code ?? "SCHEMA_CONTRACT_QUERY_FAILED", result.error.message);
    const row = result.data?.[0];
    if (!row || stringValue(row, "schema_contract_version") !== expected) throw new MigrationBackfillDiagnostic("SCHEMA_CONTRACT_MISMATCH", `${table} does not expose ${expected}`);
  }
}

export async function finalizeBackfillUser(
  client: RpcClient,
  args: {
    userId: string;
    leaseToken: string;
    leaseOwner: string;
    sourceFingerprint: string;
    state: "canonical_backfilled" | "needs_attention";
    counts: LegacyRow;
    diagnosticSummary: LegacyRow;
  },
): Promise<unknown> {
  const result = await client.rpc("adhdice_migration_finalize_user", {
    p_user_id: args.userId,
    p_lease_token: args.leaseToken,
    p_lease_owner: args.leaseOwner,
    p_source_fingerprint: args.sourceFingerprint,
    p_state: args.state,
    p_counts: args.counts,
    p_diagnostic_summary: args.diagnosticSummary,
  });
  if (result.error) throw new MigrationBackfillDiagnostic(result.error.code ?? "BACKFILL_FINALIZE_FAILED", result.error.message);
  return result.data;
}

export type BackfillCliOptions = {
  userId: string;
  batchSize: number;
  accessToken: string | null;
  privilegedKey: string | null;
  execute: boolean;
  classifierVersion: string;
  schemaContractVersion: string;
  outputPath: string | null;
  format: "json" | "jsonl";
  logicalDate: string | null;
  historyExclusionEntityIds: string[];
  completeProjectionEntityIds: string[];
  staleWorkflowResetEntityIds: string[];
  staleCompleteProjectionResetEntityIds: string[];
};

export function parseBackfillCliArgs(argv: readonly string[]): BackfillCliOptions {
  const values = new Map<string, string>();
  const historyExclusionEntityIds: string[] = [];
  const completeProjectionEntityIds: string[] = [];
  const staleWorkflowResetEntityIds: string[] = [];
  const staleCompleteProjectionResetEntityIds: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--execute") {
      values.set("--execute", "true");
      continue;
    }
    if (["--write", "--allow-writes", "--repair", "--backfill"].includes(argument)) throw new MigrationBackfillDiagnostic("WRITE_MODE_REJECTED", "write mode requires the explicit --execute flag");
    if (!argument.startsWith("--")) throw new MigrationBackfillDiagnostic("INVALID_ARGUMENT", `unexpected argument ${argument}`);
    const [key, inlineValue] = argument.split("=", 2);
    const dispositionKey = key === "--exclude-history-entity-id" || key === "--preserve-complete-projection-entity-id" || key === "--reset-stale-workflow-entity-id" || key === "--reset-stale-complete-projection-entity-id";
    const next = inlineValue ?? (dispositionKey || ["--user-id", "--batch-size", "--access-token", "--privileged-key", "--classifier-version", "--schema-contract-version", "--output", "--output-path", "--format", "--logical-date"].includes(key) ? argv[++index] : undefined);
    if (!next || next.startsWith("--")) throw new MigrationBackfillDiagnostic("MISSING_ARGUMENT_VALUE", `${key} requires a value`);
    if (key === "--exclude-history-entity-id") historyExclusionEntityIds.push(next);
    else if (key === "--preserve-complete-projection-entity-id") completeProjectionEntityIds.push(next);
    else if (key === "--reset-stale-workflow-entity-id") staleWorkflowResetEntityIds.push(next);
    else if (key === "--reset-stale-complete-projection-entity-id") staleCompleteProjectionResetEntityIds.push(next);
    else values.set(key, next);
  }
  const userId = values.get("--user-id");
  if (!userId?.trim() || !UUID_KEY.test(userId.trim())) throw new MigrationBackfillDiagnostic("INVALID_USER_ID", "--user-id must be a UUID");
  const batchSize = Number(values.get("--batch-size") ?? DEFAULT_BATCH_SIZE);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) throw new MigrationBackfillDiagnostic("INVALID_BATCH_SIZE", `batch size must be between 1 and ${MAX_BATCH_SIZE}`);
  const classifierVersion = values.get("--classifier-version") ?? CLASSIFIER_VERSION;
  const schemaContractVersion = values.get("--schema-contract-version") ?? SCHEMA_CONTRACT_VERSION;
  if (classifierVersion !== CLASSIFIER_VERSION) throw new MigrationBackfillDiagnostic("UNSUPPORTED_CLASSIFIER_VERSION", `expected ${CLASSIFIER_VERSION}`);
  if (schemaContractVersion !== SCHEMA_CONTRACT_VERSION) throw new MigrationBackfillDiagnostic("UNSUPPORTED_SCHEMA_CONTRACT_VERSION", `expected ${SCHEMA_CONTRACT_VERSION}`);
  const format = values.get("--format") ?? "json";
  if (format !== "json" && format !== "jsonl") throw new MigrationBackfillDiagnostic("INVALID_FORMAT", "format must be json or jsonl");
  const logicalDate = values.get("--logical-date") ?? null;
  if (logicalDate !== null && !DATE_KEY.test(logicalDate)) throw new MigrationBackfillDiagnostic("INVALID_LOGICAL_DATE", "logical date must be YYYY-MM-DD");
  return {
    userId,
    batchSize,
    accessToken: values.get("--access-token") ?? null,
    privilegedKey: values.get("--privileged-key") ?? null,
    execute: values.get("--execute") === "true",
    classifierVersion,
    schemaContractVersion,
    outputPath: values.get("--output") ?? values.get("--output-path") ?? null,
    format: format as "json" | "jsonl",
    logicalDate,
    historyExclusionEntityIds: [...new Set(historyExclusionEntityIds)],
    completeProjectionEntityIds: [...new Set(completeProjectionEntityIds)],
    staleWorkflowResetEntityIds: [...new Set(staleWorkflowResetEntityIds)],
    staleCompleteProjectionResetEntityIds: [...new Set(staleCompleteProjectionResetEntityIds)],
  };
}

function buildCliEntityDispositions(options: BackfillCliOptions): EntityMigrationDispositions {
  const dispositions: Record<string, import("./task-state-migration-dry-run.ts").MigrationEntityDisposition> = {};
  const add = (ids: readonly string[], repair: Partial<import("./task-state-migration-dry-run.ts").MigrationEntityDisposition>) => {
    for (const id of ids) dispositions[id] = { ...(dispositions[id] ?? OWNER_APPROVED_HISTORY_EXCLUSION), ...repair };
  };
  add(options.historyExclusionEntityIds, {});
  add(options.completeProjectionEntityIds, { preserveCurrentCompleteProjection: true });
  add(options.staleWorkflowResetEntityIds, { resetStaleLegacyWorkflowProjection: true });
  add(options.staleCompleteProjectionResetEntityIds, { resetStaleLegacyCompleteProjection: true });
  return dispositions;
}

async function main(argv: readonly string[]) {
  const options = parseBackfillCliArgs(argv);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new MigrationBackfillDiagnostic("SUPABASE_CONFIG_MISSING", "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required");
  const accessToken = options.accessToken ?? process.env.ADHDICE_SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_USER_ACCESS_TOKEN;
  if (!accessToken?.trim()) throw new MigrationBackfillDiagnostic("AUTHENTICATION_REQUIRED", "an authenticated owner access token is required");
  const ownerClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${accessToken}` } } });
  const sources = await loadAuthenticatedOwnerScopedEvidence(ownerClient as never, options.userId, accessToken, options.batchSize);
  const packageResult = buildBackfillPackage(sources, options.userId, {
    logicalDate: options.logicalDate ?? undefined,
    currentInstant: new Date(),
    entityDispositions: buildCliEntityDispositions(options),
  });
  if (!options.execute) {
    const serialized = options.format === "json" ? `${JSON.stringify(packageResult.report, null, 2)}\n` : `${JSON.stringify({ scope: "summary", ...packageResult.report })}\n`;
    if (options.outputPath) await writeFile(resolve(options.outputPath), serialized, "utf8");
    else process.stdout.write(serialized);
    return;
  }
  const privilegedKey = options.privilegedKey ?? process.env.ADHDICE_SUPABASE_MIGRATION_SERVICE_ROLE_KEY;
  if (!privilegedKey?.trim()) throw new MigrationBackfillDiagnostic("PRIVILEGED_CREDENTIAL_REQUIRED", "--execute requires --privileged-key or ADHDICE_SUPABASE_MIGRATION_SERVICE_ROLE_KEY");
  const privilegedClient = createClient(url, privilegedKey, { auth: { autoRefreshToken: false, persistSession: false } }) as unknown as ReadWriteClient;
  await assertSchemaContracts(privilegedClient);
  const leaseToken = randomUUID();
  const leaseOwner = `adhdice-migration-backfill:${process.pid}`;
  const leaseExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  let activePackage = packageResult;
  let afterReport = buildMigrationRunReport([{ sources, userId: options.userId, logicalDate: options.logicalDate ?? undefined, currentInstant: new Date(), entityDispositions: buildCliEntityDispositions(options) }]);
  for (let pass = 0; pass < 2; pass += 1) {
    for (let offset = 0; offset < activePackage.plans.length; offset += options.batchSize) {
      await applyBackfillPlans(privilegedClient, activePackage.plans.slice(offset, offset + options.batchSize), { leaseToken, leaseOwner, leaseExpiresAt });
    }
    const afterSources = await loadAuthenticatedOwnerScopedEvidence(ownerClient as never, options.userId, accessToken, options.batchSize);
    afterReport = buildMigrationRunReport([{ sources: afterSources, userId: options.userId, logicalDate: options.logicalDate ?? undefined, currentInstant: new Date(), entityDispositions: buildCliEntityDispositions(options) }]);
    const refreshedPackage = buildBackfillPackage(afterSources, options.userId, {
      logicalDate: options.logicalDate ?? undefined,
      currentInstant: new Date(),
      entityDispositions: buildCliEntityDispositions(options),
      canonicalizationTime: activePackage.report.generatedAt,
    });
    const oldPlans = new Map(activePackage.plans.map((plan) => [plan.entityId ?? "__orphan__", plan.inputFingerprint]));
    const changedPlans = refreshedPackage.plans.filter((plan) => oldPlans.get(plan.entityId ?? "__orphan__") !== plan.inputFingerprint);
    const sourceDrifted = sourceFingerprintsChanged(activePackage.report.sourceFingerprints, afterReport.userReports[0]?.sourceFingerprints ?? activePackage.report.sourceFingerprints);
    if (!sourceDrifted) break;
    if (pass === 0 && changedPlans.length > 0) {
      activePackage = { report: refreshedPackage.report, plans: changedPlans };
      continue;
    }
    throw new MigrationBackfillDiagnostic("SOURCE_DRIFT_BLOCKS_FINALIZATION", "legacy source fingerprints changed during backfill; affected deterministic operations did not reach a stable final pass");
  }
  const finalState = activePackage.report.tasksNeedingAttention === 0 ? "canonical_backfilled" : "needs_attention";
  await finalizeBackfillUser(privilegedClient, {
    userId: options.userId,
    leaseToken,
    leaseOwner,
    sourceFingerprint: fingerprintEvidence(afterReport.userReports[0]?.sourceFingerprints ?? activePackage.report.sourceFingerprints),
    state: finalState,
    counts: activePackage.report,
    diagnosticSummary: { blockerTasks: activePackage.report.blockerTasks, sourceDrifted: false },
  });
  const serialized = options.format === "json" ? `${JSON.stringify({ ...activePackage.report, executed: true, finalState }, null, 2)}\n` : `${JSON.stringify({ scope: "summary", ...activePackage.report, executed: true, finalState })}\n`;
  if (options.outputPath) await writeFile(resolve(options.outputPath), serialized, "utf8");
  else process.stdout.write(serialized);
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const diagnostic = error instanceof MigrationBackfillDiagnostic
      ? error
      : new MigrationBackfillDiagnostic("BACKFILL_FAILED", String(error));
    process.stderr.write(`${diagnostic.message}\n`);
    process.exitCode = 1;
  });
}
