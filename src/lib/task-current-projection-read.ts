import type { CurrentTaskProjectionTimestampKind, Task, TaskCurrentProjection } from "@/lib/database.types";
import { isCurrentTaskProjectionFresh } from "@/lib/task-current-projection-freshness";
import { isCanonicalInactiveTask } from "@/lib/task-state-engine/direct-input";
import type { TaskDisplayStatus, TaskDisplayStatusByTaskId } from "@/lib/task-display-status";
import type { TaskHistoryStreakSummary, TaskHistoryStreakSummaryMap } from "@/lib/task-history-streak-summaries";
import type { CurrentTaskProjectionScopedVerificationProof } from "@/lib/task-current-projection-parity-verifier";
import { logicalDateForTimestamp } from "@/lib/task-state-engine/calendar";

export const CURRENT_TASK_PROJECTION_READ_COLUMNS = [
  "user_id",
  "entity_id",
  "entity_kind",
  "display_status",
  "next_due_on",
  "handled_current_logical_day",
  "last_handled_logical_date",
  "last_handled_at",
  "last_handled_at_kind",
  "last_done_logical_date",
  "last_done_at",
  "last_done_at_kind",
  "current_positive_streak",
  "current_missed_streak",
  "canonical_task_revision",
  "history_sync_epoch",
  "history_source_revision",
  "logical_day_settings_revision",
  "projected_logical_date",
  "projection_schema_version",
  "projection_algorithm_version",
  "validity",
  "updated_at",
].join(",");

export type CurrentTaskProjectionReadRow = Pick<
  TaskCurrentProjection,
  | "user_id"
  | "entity_id"
  | "entity_kind"
  | "display_status"
  | "next_due_on"
  | "handled_current_logical_day"
  | "last_handled_logical_date"
  | "last_handled_at"
  | "last_handled_at_kind"
  | "last_done_logical_date"
  | "last_done_at"
  | "last_done_at_kind"
  | "current_positive_streak"
  | "current_missed_streak"
  | "canonical_task_revision"
  | "history_sync_epoch"
  | "history_source_revision"
  | "logical_day_settings_revision"
  | "projected_logical_date"
  | "projection_schema_version"
  | "projection_algorithm_version"
  | "validity"
  | "updated_at"
>;

export type CurrentTaskProjectionReadMap = Record<string, CurrentTaskProjectionReadRow>;

export const CURRENT_TASK_PROJECTION_PARITY_FIELDS = [
  "displayStatus",
  "displayDueOn",
  "currentPositiveStreak",
  "currentMissedStreak",
  "lastHandledDate",
  "lastHandledAt",
  "lastDoneDate",
  "lastDoneAt",
] as const;

export type CurrentTaskProjectionParityField = (typeof CURRENT_TASK_PROJECTION_PARITY_FIELDS)[number];

export type LegacyCurrentTaskRead = {
  dueOnByTaskId?: Readonly<Record<string, string | null>>;
  statusesByTaskId?: Readonly<Record<string, TaskDisplayStatus>>;
};

export type CurrentTaskProjectionReadResolution = {
  displayStatusByTaskId: TaskDisplayStatusByTaskId;
  dueOnByTaskId: Record<string, string | null>;
  effectiveTaskHistoryStreakSummaries: TaskHistoryStreakSummaryMap;
  freshProjectionByTaskId: CurrentTaskProjectionReadMap;
  freshProjectionTaskIds: string[];
  staleProjectionTaskIds: string[];
  missingProjectionTaskIds: string[];
};

export type CurrentTaskProjectionParityMismatch = {
  field: CurrentTaskProjectionParityField;
  taskId: string;
};

export type CurrentTaskProjectionTimestampMismatchClassification =
  | "exact"
  | "same instant / different serialization"
  | "same logical date but floating-time vs timestamptz"
  | "different instant"
  | "different logical date";

export type CurrentTaskProjectionTimestampContract =
  | "actual event time"
  | "synthesized logical-day presentation time"
  | "logical date";

export type CurrentTaskProjectionParityClassification = "representation-only" | "semantic";

/**
 * Classify one already-observed parity difference without changing authority.
 * Timestamp equivalence is only representation-only when the logical dates
 * also agree; a different logical date remains a semantic mismatch.
 */
export function classifyCurrentTaskProjectionParityMismatch(input: {
  field: CurrentTaskProjectionParityField;
  projectedLogicalDate?: string | null;
  legacyLogicalDate?: string | null;
  timestampClassification?: CurrentTaskProjectionTimestampMismatchClassification;
}): CurrentTaskProjectionParityClassification {
  if (input.field !== "lastHandledAt" && input.field !== "lastDoneAt") return "semantic";
  if (input.projectedLogicalDate !== input.legacyLogicalDate) return "semantic";
  if (input.timestampClassification === "same instant / different serialization"
    || input.timestampClassification === "same logical date but floating-time vs timestamptz") {
    return "representation-only";
  }
  return "semantic";
}

export type CurrentTaskProjectionParityMismatchDiagnostic = CurrentTaskProjectionParityMismatch & {
  projectedRawValue: string | number | boolean | null;
  legacyRawValue: string | number | boolean | null;
  taskCanonicalRevision: number | null;
  projectionCanonicalTaskRevision: number | null;
  projectionHistorySourceRevision: number | null;
  projectionUpdatedAt: string | null;
  timestampClassification?: CurrentTaskProjectionTimestampMismatchClassification;
  timestampContract?: {
    projected: CurrentTaskProjectionTimestampContract;
    legacy: CurrentTaskProjectionTimestampContract;
  };
  projectedStoredAt?: string | null;
  projectedAtKind?: CurrentTaskProjectionTimestampKind | null;
  projectedLogicalDate?: string | null;
  projectedPresentationValue?: string | null;
  legacyValue?: string | number | boolean | null;
};

export type CurrentTaskProjectionParityResult = {
  eligibleFallbackCount: number;
  eligibleFreshCount: number;
  eligibleTaskIds: string[];
  excludedInactiveFallbackCount: number;
  excludedInactiveFreshCount: number;
  excludedInactiveTaskIds: string[];
  fallbackCount: number;
  freshCount: number;
  mismatchedFields: CurrentTaskProjectionParityMismatch[];
  mismatchedTaskIds: string[];
  mismatchDiagnostics: CurrentTaskProjectionParityMismatchDiagnostic[];
};

export type CurrentTaskProjectionParityDiagnostics = {
  mismatchedTaskIds: string[];
  mismatchedTaskCount: number;
  mismatchCounts: Record<CurrentTaskProjectionParityField, number>;
  sampleTaskIdsByField: Record<CurrentTaskProjectionParityField, string[]>;
  sampleMismatchDiagnostics: CurrentTaskProjectionParityMismatchDiagnostic[];
};

export function indexCurrentTaskProjectionRows(rows: readonly CurrentTaskProjectionReadRow[]) {
  return rows.reduce<CurrentTaskProjectionReadMap>((map, row) => {
    map[row.entity_id] = row;
    return map;
  }, {});
}

function shouldReplaceCurrentTaskProjection(
  current: CurrentTaskProjectionReadRow | undefined,
  next: CurrentTaskProjectionReadRow,
) {
  if (!current) return true;
  return next.updated_at >= current.updated_at;
}

export function mergeCurrentTaskProjectionRows(
  current: CurrentTaskProjectionReadMap,
  rows: readonly CurrentTaskProjectionReadRow[],
) {
  let changed = false;
  const next = { ...current };
  for (const row of rows) {
    if (!shouldReplaceCurrentTaskProjection(next[row.entity_id], row)) continue;
    if (next[row.entity_id] === row) continue;
    next[row.entity_id] = row;
    changed = true;
  }
  return changed ? next : current;
}

export function projectionToTaskHistoryStreakSummary(
  projection: Pick<
    CurrentTaskProjectionReadRow,
    | "current_positive_streak"
    | "current_missed_streak"
    | "last_handled_logical_date"
    | "last_handled_at"
    | "last_handled_at_kind"
    | "last_done_logical_date"
    | "last_done_at"
    | "last_done_at_kind"
  >,
): TaskHistoryStreakSummary {
  return {
    currentStreak: projection.current_positive_streak,
    missedStreak: projection.current_missed_streak,
    lastHandledDate: projection.last_handled_logical_date,
    lastHandledAt: projection.last_handled_at_kind === "logical_day_presentation"
      ? projection.last_handled_logical_date ? `${projection.last_handled_logical_date}T00:00:00` : null
      : projection.last_handled_at,
    lastDoneDate: projection.last_done_logical_date,
    lastDoneAt: projection.last_done_at_kind === "logical_day_presentation"
      ? projection.last_done_logical_date ? `${projection.last_done_logical_date}T00:00:00` : null
      : projection.last_done_at,
  };
}

export function areCurrentTaskProjectionLastHandledValuesEqual({
  legacySummary,
  logicalDayStart,
  projectionSummary,
  projectedAtKind,
  timezone,
}: {
  legacySummary: Pick<TaskHistoryStreakSummary, "lastHandledAt" | "lastHandledDate">;
  logicalDayStart: string;
  projectionSummary: Pick<TaskHistoryStreakSummary, "lastHandledAt" | "lastHandledDate">;
  projectedAtKind: CurrentTaskProjectionTimestampKind | null;
  timezone: string;
}) {
  return projectionSummary.lastHandledDate === legacySummary.lastHandledDate
    && areCurrentTaskProjectionTimestampValuesEqual({
      legacy: legacySummary.lastHandledAt ?? null,
      logicalDayStart,
      projected: projectionSummary.lastHandledAt ?? null,
      projectedAtKind,
      projectedLogicalDate: projectionSummary.lastHandledDate ?? null,
      timezone,
    });
}

export function isCurrentTaskProjectionParityEligibleTask(task: Task) {
  return !isCanonicalInactiveTask(task);
}

export function isCurrentTaskProjectionParityReady({
  activeStatusRead,
  behaviorAuthorityLoading,
  behaviorAuthorityReady,
  comparisonTaskIds,
  isTaskHistoryLoaded,
  legacySummaries,
  projectionReadReady,
}: {
  activeStatusRead: Pick<LegacyCurrentTaskRead, "statusesByTaskId"> | null;
  behaviorAuthorityLoading: boolean;
  behaviorAuthorityReady: boolean;
  comparisonTaskIds: readonly string[];
  isTaskHistoryLoaded: boolean;
  legacySummaries: TaskHistoryStreakSummaryMap;
  projectionReadReady: boolean;
}) {
  if (!isTaskHistoryLoaded || !activeStatusRead || !behaviorAuthorityReady || behaviorAuthorityLoading || !projectionReadReady) {
    return false;
  }
  if (comparisonTaskIds.length === 0) return false;
  return comparisonTaskIds.every((taskId) => (
    hasOwn(activeStatusRead.statusesByTaskId, taskId)
    && hasCompleteTaskHistoryStreakSummary(legacySummaries[taskId])
  ));
}

function hasOwn<T extends object>(value: T | undefined, key: PropertyKey): boolean {
  return value !== undefined && Object.hasOwn(value, key);
}

function hasCompleteTaskHistoryStreakSummary(summary: TaskHistoryStreakSummary | undefined) {
  return Boolean(
    summary
    && typeof summary.currentStreak === "number"
    && typeof summary.missedStreak === "number"
    && Object.hasOwn(summary, "lastHandledDate")
    && Object.hasOwn(summary, "lastHandledAt")
    && Object.hasOwn(summary, "lastDoneDate")
    && Object.hasOwn(summary, "lastDoneAt"),
  );
}

export function resolveCurrentTaskProjectionReads({
  historySyncEpoch,
  legacyCurrentRead,
  logicalDaySettingsRevision,
  projectionsByTaskId,
  taskHistoryStreakSummaries,
  tasks,
  todayKey,
}: {
  historySyncEpoch: string | null;
  legacyCurrentRead?: LegacyCurrentTaskRead;
  logicalDaySettingsRevision: number | null;
  projectionsByTaskId: CurrentTaskProjectionReadMap;
  taskHistoryStreakSummaries: TaskHistoryStreakSummaryMap;
  tasks: readonly Task[];
  todayKey: string;
}): CurrentTaskProjectionReadResolution {
  const displayStatusByTaskId: TaskDisplayStatusByTaskId = {};
  const dueOnByTaskId: Record<string, string | null> = {};
  const effectiveTaskHistoryStreakSummaries: TaskHistoryStreakSummaryMap = {};
  const freshProjectionByTaskId: CurrentTaskProjectionReadMap = {};
  const freshProjectionTaskIds: string[] = [];
  const staleProjectionTaskIds: string[] = [];
  const missingProjectionTaskIds: string[] = [];

  for (const task of tasks) {
    const projection = projectionsByTaskId[task.id];
    const isFresh = Boolean(
      projection
      && typeof task.canonical_revision === "number"
      && typeof task.entity_kind === "string"
      && typeof logicalDaySettingsRevision === "number"
      && historySyncEpoch
      && isCurrentTaskProjectionFresh(projection, {
        userId: task.user_id,
        entityId: task.id,
        entityKind: task.entity_kind,
        canonicalTaskRevision: task.canonical_revision,
        historySyncEpoch,
        logicalDaySettingsRevision,
        projectedLogicalDate: todayKey,
      }),
    );

    if (isFresh && projection) {
      freshProjectionByTaskId[task.id] = projection;
      freshProjectionTaskIds.push(task.id);
      displayStatusByTaskId[task.id] = projection.display_status;
      dueOnByTaskId[task.id] = projection.next_due_on;
      effectiveTaskHistoryStreakSummaries[task.id] = projectionToTaskHistoryStreakSummary(projection);
      continue;
    }

    if (projection) staleProjectionTaskIds.push(task.id);
    else missingProjectionTaskIds.push(task.id);

    if (hasOwn(legacyCurrentRead?.statusesByTaskId, task.id)) {
      displayStatusByTaskId[task.id] = legacyCurrentRead!.statusesByTaskId![task.id]!;
    } else {
      displayStatusByTaskId[task.id] = task.status;
    }

    if (hasOwn(legacyCurrentRead?.dueOnByTaskId, task.id)) {
      dueOnByTaskId[task.id] = legacyCurrentRead!.dueOnByTaskId![task.id]!;
    }
    if (taskHistoryStreakSummaries[task.id]) {
      effectiveTaskHistoryStreakSummaries[task.id] = taskHistoryStreakSummaries[task.id]!;
    }
  }

  return {
    displayStatusByTaskId,
    dueOnByTaskId,
    effectiveTaskHistoryStreakSummaries,
    freshProjectionByTaskId,
    freshProjectionTaskIds,
    staleProjectionTaskIds,
    missingProjectionTaskIds,
  };
}

export function compareCurrentTaskProjectionParity({
  legacyCurrentRead,
  legacySummaries,
  projectionsByTaskId,
  scopedLastHandledVerificationProofs,
  tasks,
  logicalDayStart = "00:00",
  logicalDate,
  sampleLimitPerField = 32,
  timezone = "UTC",
  workspaceGeneration,
}: {
  legacyCurrentRead: Required<LegacyCurrentTaskRead>;
  legacySummaries: TaskHistoryStreakSummaryMap;
  projectionsByTaskId: CurrentTaskProjectionReadMap;
  scopedLastHandledVerificationProofs?: Readonly<Record<string, CurrentTaskProjectionScopedVerificationProof>>;
  tasks: readonly Task[];
  logicalDayStart?: string;
  logicalDate?: string;
  sampleLimitPerField?: number;
  timezone?: string;
  workspaceGeneration?: number;
}): CurrentTaskProjectionParityResult {
  const mismatchedFields: CurrentTaskProjectionParityMismatch[] = [];
  const mismatchDiagnostics: CurrentTaskProjectionParityMismatchDiagnostic[] = [];
  const diagnosticCounts = new Map<CurrentTaskProjectionParityField, number>();
  const eligibleTaskIds: string[] = [];
  const excludedInactiveTaskIds: string[] = [];
  let eligibleFreshCount = 0;
  let excludedInactiveFreshCount = 0;
  let eligibleFallbackCount = 0;
  let excludedInactiveFallbackCount = 0;
  let freshCount = 0;

  for (const task of tasks) {
    const isEligibleTask = isCurrentTaskProjectionParityEligibleTask(task);
    if (isEligibleTask) eligibleTaskIds.push(task.id);
    else excludedInactiveTaskIds.push(task.id);
    const projection = projectionsByTaskId[task.id];
    if (!projection) {
      if (isEligibleTask) eligibleFallbackCount += 1;
      else excludedInactiveFallbackCount += 1;
      continue;
    }
    freshCount += 1;
    if (!isEligibleTask) {
      excludedInactiveFreshCount += 1;
      continue;
    }
    eligibleFreshCount += 1;
    const projectionSummary = projectionToTaskHistoryStreakSummary(projection);
    const legacySummary = legacySummaries[task.id];
    const scopedLastHandledVerificationProof = scopedLastHandledVerificationProofs?.[task.id];
    const hasExactScopedLastHandledVerificationProof = Boolean(
      scopedLastHandledVerificationProof
      && scopedLastHandledVerificationProof.resolved
      && scopedLastHandledVerificationProof.taskId === task.id
      && scopedLastHandledVerificationProof.identity.taskId === task.id
      && logicalDate !== undefined
      && scopedLastHandledVerificationProof.identity.logicalDate === logicalDate
      && workspaceGeneration !== undefined
      && scopedLastHandledVerificationProof.identity.workspaceGeneration === workspaceGeneration
      && scopedLastHandledVerificationProof.identity.projectionUpdatedAt === projection.updated_at
      && scopedLastHandledVerificationProof.identity.taskCanonicalRevision === (task.canonical_revision ?? null),
    );
    const scopedLastHandledSummary = hasExactScopedLastHandledVerificationProof
      ? scopedLastHandledVerificationProof!.authoritativeLastHandled
      : null;
    const legacyValues = {
      displayDueOn: hasOwn(legacyCurrentRead.dueOnByTaskId, task.id)
        ? legacyCurrentRead.dueOnByTaskId[task.id]
        : task.due_on,
      currentMissedStreak: legacySummary?.missedStreak ?? 0,
      currentPositiveStreak: legacySummary?.currentStreak ?? 0,
      displayStatus: hasOwn(legacyCurrentRead.statusesByTaskId, task.id)
        ? legacyCurrentRead.statusesByTaskId[task.id]
        : task.status,
      lastDoneAt: legacySummary?.lastDoneAt ?? null,
      lastDoneDate: legacySummary?.lastDoneDate ?? null,
      lastHandledAt: scopedLastHandledSummary
        ? scopedLastHandledSummary.lastHandledAt
        : legacySummary?.lastHandledAt ?? null,
      lastHandledDate: scopedLastHandledSummary
        ? scopedLastHandledSummary.lastHandledDate
        : legacySummary?.lastHandledDate ?? null,
    };
    const comparisons: Array<[CurrentTaskProjectionParityField, unknown, unknown]> = [
      ["displayStatus", projection.display_status, legacyValues.displayStatus],
      ["displayDueOn", projection.next_due_on, legacyValues.displayDueOn],
      ["currentPositiveStreak", projection.current_positive_streak, legacyValues.currentPositiveStreak],
      ["currentMissedStreak", projection.current_missed_streak, legacyValues.currentMissedStreak],
      ["lastHandledDate", projectionSummary.lastHandledDate, legacyValues.lastHandledDate],
      ["lastHandledAt", projectionSummary.lastHandledAt, legacyValues.lastHandledAt],
      ["lastDoneDate", projectionSummary.lastDoneDate, legacyValues.lastDoneDate],
      ["lastDoneAt", projectionSummary.lastDoneAt, legacyValues.lastDoneAt],
    ];
    for (const [field, projected, legacy] of comparisons) {
      const isTimestampField = field === "lastHandledAt" || field === "lastDoneAt";
      const projectedLogicalDate = field === "lastHandledAt" || field === "lastHandledDate"
        ? projectionSummary.lastHandledDate
        : projectionSummary.lastDoneDate;
      const projectedAtKind = field === "lastHandledAt"
        ? projection.last_handled_at_kind
        : field === "lastDoneAt"
          ? projection.last_done_at_kind
          : null;
      const valuesMatch = isTimestampField
        ? areCurrentTaskProjectionTimestampValuesEqual({
          legacy,
          logicalDayStart,
          projected,
          projectedAtKind,
          projectedLogicalDate,
          timezone,
        })
        : projected === legacy;
      if (!valuesMatch) {
        mismatchedFields.push({ field, taskId: task.id });
        const existingCount = diagnosticCounts.get(field) ?? 0;
        if (existingCount < sampleLimitPerField) {
          const diagnostic: CurrentTaskProjectionParityMismatchDiagnostic = {
            field,
            legacyRawValue: normalizeDiagnosticValue(legacy),
            projectionCanonicalTaskRevision: projection.canonical_task_revision,
            projectionHistorySourceRevision: projection.history_source_revision,
            projectionUpdatedAt: projection.updated_at,
            projectedRawValue: normalizeDiagnosticValue(projected),
            taskCanonicalRevision: typeof task.canonical_revision === "number" ? task.canonical_revision : null,
            taskId: task.id,
          };
          if (isTimestampField) {
            diagnostic.timestampClassification = classifyCurrentTaskProjectionTimestampMismatch(projected, legacy, {
              logicalDayStart,
              timezone,
            });
            diagnostic.projectedStoredAt = field === "lastHandledAt" ? projection.last_handled_at : projection.last_done_at;
            diagnostic.projectedAtKind = projectedAtKind;
            diagnostic.projectedLogicalDate = projectedLogicalDate;
            diagnostic.projectedPresentationValue = typeof projected === "string" ? projected : null;
            diagnostic.legacyValue = normalizeDiagnosticValue(legacy);
            diagnostic.timestampContract = {
              legacy: classifyCurrentTaskProjectionTimestampContract(field, legacy, {
                logicalDate: projectedLogicalDate,
                timezone,
                logicalDayStart,
              }),
              projected: classifyCurrentTaskProjectionTimestampContract(field, projected, {
                logicalDate: projectedLogicalDate,
                timezone,
                logicalDayStart,
              }),
            };
          } else if (field === "lastHandledDate" || field === "lastDoneDate") {
            diagnostic.timestampContract = {
              legacy: "logical date",
              projected: "logical date",
            };
          }
          mismatchDiagnostics.push(diagnostic);
          diagnosticCounts.set(field, existingCount + 1);
        }
      }
    }
  }

  return {
    eligibleFallbackCount,
    eligibleFreshCount,
    eligibleTaskIds,
    excludedInactiveFallbackCount,
    excludedInactiveFreshCount,
    excludedInactiveTaskIds,
    fallbackCount: Math.max(0, tasks.length - freshCount),
    freshCount,
    mismatchedFields,
    mismatchedTaskIds: [...new Set(mismatchedFields.map((mismatch) => mismatch.taskId))],
    mismatchDiagnostics,
  };
}

export function summarizeCurrentTaskProjectionParity(
  parity: CurrentTaskProjectionParityResult,
  sampleLimit = 3,
): CurrentTaskProjectionParityDiagnostics {
  const mismatchCounts = Object.fromEntries(
    CURRENT_TASK_PROJECTION_PARITY_FIELDS.map((field) => [field, 0]),
  ) as Record<CurrentTaskProjectionParityField, number>;
  const sampleTaskIdsByField = Object.fromEntries(
    CURRENT_TASK_PROJECTION_PARITY_FIELDS.map((field) => [field, []]),
  ) as unknown as Record<CurrentTaskProjectionParityField, string[]>;

  for (const mismatch of parity.mismatchedFields) {
    mismatchCounts[mismatch.field] += 1;
    if (sampleTaskIdsByField[mismatch.field].length < sampleLimit && !sampleTaskIdsByField[mismatch.field].includes(mismatch.taskId)) {
      sampleTaskIdsByField[mismatch.field].push(mismatch.taskId);
    }
  }

  return {
    mismatchedTaskIds: parity.mismatchedTaskIds,
    mismatchedTaskCount: parity.mismatchedTaskIds.length,
    mismatchCounts,
    sampleTaskIdsByField,
    sampleMismatchDiagnostics: parity.mismatchDiagnostics.filter((mismatch) => {
      const fieldSamples = sampleTaskIdsByField[mismatch.field];
      return fieldSamples.includes(mismatch.taskId);
    }),
  };
}

function areCurrentTaskProjectionTimestampValuesEqual({
  legacy,
  logicalDayStart,
  projected,
  projectedAtKind,
  projectedLogicalDate,
  timezone,
}: {
  legacy: unknown;
  logicalDayStart: string;
  projected: unknown;
  projectedAtKind: CurrentTaskProjectionTimestampKind | null;
  projectedLogicalDate: string | null;
  timezone: string;
}) {
  if (projected === legacy) return true;
  if (typeof projected !== "string" || typeof legacy !== "string") return false;

  if (projectedAtKind === "event_instant") {
    if (!hasExplicitTimestampZone(projected) || !hasExplicitTimestampZone(legacy)) return false;
    const projectedTimestamp = Date.parse(projected);
    const legacyTimestamp = Date.parse(legacy);
    return Number.isFinite(projectedTimestamp)
      && Number.isFinite(legacyTimestamp)
      && projectedTimestamp === legacyTimestamp;
  }

  if (projectedAtKind !== "logical_day_presentation" || !projectedLogicalDate) return false;
  if (classifyCurrentTaskProjectionTimestampContract("lastDoneAt", legacy, {
    logicalDate: projectedLogicalDate,
    logicalDayStart,
    timezone,
  }) !== "synthesized logical-day presentation time") {
    return false;
  }
  try {
    return logicalDateForTimestamp(legacy, timezone, logicalDayStart) === projectedLogicalDate;
  } catch {
    return false;
  }
}

function normalizeDiagnosticValue(value: unknown): string | number | boolean | null {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return value === undefined ? null : String(value);
}

function hasExplicitTimestampZone(value: string) {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim());
}

export function classifyCurrentTaskProjectionTimestampContract(
  field: CurrentTaskProjectionParityField,
  rawValue: unknown,
  settings: { logicalDate: string | null; logicalDayStart: string; timezone: string },
): CurrentTaskProjectionTimestampContract {
  if (field === "lastHandledDate" || field === "lastDoneDate") return "logical date";
  if (typeof rawValue !== "string") return "actual event time";

  const trimmedValue = rawValue.trim();
  const rawCalendarDate = trimmedValue.slice(0, 10);
  const isMidnight = /T00:00(?::00(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?$/i.test(trimmedValue);
  if (settings.logicalDate && rawCalendarDate === settings.logicalDate && isMidnight) {
    return "synthesized logical-day presentation time";
  }

  try {
    logicalDateForTimestamp(trimmedValue, settings.timezone, settings.logicalDayStart);
  } catch {
    // Preserve a malformed timestamp as an event-time diagnostic rather than throwing from parity reporting.
  }
  return "actual event time";
}

export function classifyCurrentTaskProjectionTimestampMismatch(
  projectedRawValue: unknown,
  legacyRawValue: unknown,
  settings: { logicalDayStart: string; timezone: string },
): CurrentTaskProjectionTimestampMismatchClassification {
  if (projectedRawValue === legacyRawValue) return "exact";
  if (typeof projectedRawValue !== "string" || typeof legacyRawValue !== "string") return "different logical date";

  const projectedTimestamp = Date.parse(projectedRawValue);
  const legacyTimestamp = Date.parse(legacyRawValue);
  if (Number.isFinite(projectedTimestamp) && Number.isFinite(legacyTimestamp) && projectedTimestamp === legacyTimestamp) {
    return "same instant / different serialization";
  }

  let projectedLogicalDate: string | null = null;
  let legacyLogicalDate: string | null = null;
  try {
    projectedLogicalDate = logicalDateForTimestamp(projectedRawValue, settings.timezone, settings.logicalDayStart);
    legacyLogicalDate = logicalDateForTimestamp(legacyRawValue, settings.timezone, settings.logicalDayStart);
  } catch {
    // Keep malformed or unsupported timezone values in the generic instant bucket.
  }

  if (
    projectedLogicalDate
    && projectedLogicalDate === legacyLogicalDate
    && hasExplicitTimestampZone(projectedRawValue) !== hasExplicitTimestampZone(legacyRawValue)
  ) {
    return "same logical date but floating-time vs timestamptz";
  }
  if (projectedLogicalDate !== legacyLogicalDate) return "different logical date";
  return "different instant";
}

export function createCurrentTaskProjectionEventBuffer(
  onFlush: (rows: readonly CurrentTaskProjectionReadRow[]) => void,
  options: {
    flushWindowMs?: number;
    schedule?: (callback: () => void, delayMs: number) => unknown;
    cancel?: (handle: unknown) => void;
  } = {},
) {
  const pendingRows = new Map<string, CurrentTaskProjectionReadRow>();
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const flushWindowMs = options.flushWindowMs ?? 50;
  let timer: unknown = null;

  const flush = () => {
    timer = null;
    if (pendingRows.size === 0) return;
    const rows = [...pendingRows.values()];
    pendingRows.clear();
    onFlush(rows);
  };

  return {
    enqueue(row: CurrentTaskProjectionReadRow) {
      pendingRows.set(row.entity_id, row);
      if (timer === null) timer = schedule(flush, flushWindowMs);
    },
    flush,
    dispose() {
      if (timer !== null) cancel(timer);
      timer = null;
      pendingRows.clear();
    },
  };
}
