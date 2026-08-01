import type { Task, TaskHistory, TaskStatus } from "@/lib/database.types";
import { getTaskDisplayStatusWithHistory } from "@/lib/task-cockpit";
import {
  buildOverdueTaskMissedDateKeys,
  buildTaskHistoryCalendarDueDateSet,
  getLatestTaskHistoryEntryOnDate,
  getTaskHistoryCalendarVirtualState,
  isTaskHandledOnDate,
  isTaskMissedOnDate,
  resolveLiveTaskStatusFromHistory,
} from "@/lib/task-history";
import { evaluateTaskState } from "./engine.ts";
import { dateRange, logicalDateForTimestamp, shiftDateKey } from "./calendar.ts";
import { adaptLegacyTaskState, type LegacyAdapterIssue } from "./legacy-adapter.ts";
import { occurrenceIdentity } from "./recurrence.ts";
import type {
  ProposedTaskStatePatch,
  TaskCalendarState,
  TaskStateEngineResult,
} from "./types.ts";

export type ShadowClassification =
  | "match"
  | "approved semantic difference"
  | "representation-only difference"
  | "adapter limitation"
  | "adapter warning"
  | "unsupported legacy data"
  | "possible engine defect"
  | "legacy-data anomaly";

export type ShadowSemanticGroup =
  | "active-status differences"
  | "current-day Calendar differences"
  | "overdue-classification differences"
  | "recurrence differences"
  | "proposed History differences"
  | "proposed task-patch differences"
  | "sparse Calendar representation differences"
  | "adapter warnings"
  | "unsupported legacy data";

export type TaskStateShadowOptions = {
  taskIds?: string[];
  startDate?: string;
  endDate?: string;
  includeMatches?: boolean;
  includeTitles?: boolean;
  includeFullDefectDetails?: boolean;
};

export type TaskStateShadowMismatch = {
  taskId: string;
  taskTitle?: string;
  field: string;
  semanticGroup: ShadowSemanticGroup;
  currentSystemValue: unknown;
  engineValue: unknown;
  classification: ShadowClassification;
  reason: string;
  calendarFacts?: {
    date: string;
    dateRelation: "past" | "current" | "future";
    engineHasEntry: boolean;
    explicitHistory: boolean;
    scheduled: boolean;
    unscheduled: boolean;
  };
};

export type TaskStateShadowGroupSummary = {
  comparisonCount: number;
  evaluatedTaskCount: number;
  differingTaskCount: number;
  possibleDefectTaskCount: number;
  approvedDifferenceTaskCount: number;
  representationOnlyTaskCount: number;
  adapterLimitedTaskCount: number;
  countsByClassification: Partial<Record<ShadowClassification, number>>;
};

export type TaskStateShadowTaskSample = {
  taskId: string;
  taskTitle?: string;
  taskType: string;
};

export type TaskStateShadowPossibleDefect = TaskStateShadowTaskSample & {
  semanticGroup: ShadowSemanticGroup;
  affectedFields: string[];
  currentValues: Record<string, unknown[]>;
  engineValues: Record<string, unknown[]>;
  calendarSummary?: {
    dateCount: number;
    sampleDates: string[];
    firstAffectedDate: string;
    lastAffectedDate: string;
    normalizedPattern: string;
    fullDetails?: Array<{ date: string; currentSystemValue: unknown; engineValue: unknown }>;
  };
  reason: string;
  adapterWarnings: LegacyAdapterIssue[];
  sanitizedProposedTaskPatch: ProposedTaskStatePatch;
  proposedHistorySummary: { count: number; samples: string[] };
};

export type TaskStateShadowDefectPatternSummary = {
  pattern: string;
  comparisonCount: number;
  affectedTaskCount: number;
  taskTypeCounts: Record<string, number>;
  samples: TaskStateShadowTaskSample[];
};

export type TaskStateShadowSkipReasonSummary = {
  support: "fully skipped" | "partially unsupported";
  count: number;
  lifecycleCounts: Record<string, number>;
  taskTypeCounts: Record<string, number>;
  samples: TaskStateShadowTaskSample[];
};

export type TaskStateShadowSkipSummary = {
  excludedLifecycleTaskCount: number;
  fullySkippedUnsupportedTaskCount: number;
  fullySkippedTaskCount: number;
  partiallyUnsupportedTaskCount: number;
  fullySkippedByLifecycleAndTaskType: Record<string, number>;
  byReason: Record<string, TaskStateShadowSkipReasonSummary>;
};

export type TaskStateShadowTaskDetail = {
  taskId: string;
  taskTitle?: string;
  taskType: string;
  durationMs: number;
  adapterWarnings: LegacyAdapterIssue[];
  unsupportedLegacy: LegacyAdapterIssue[];
  comparisons: TaskStateShadowMismatch[];
  summary: {
    countsByClassification: Partial<Record<ShadowClassification, number>>;
    possibleEngineDefectGroupCount: number;
    semanticGroups: Partial<Record<ShadowSemanticGroup, number>>;
  };
  engine: {
    activeStatus: TaskStateEngineResult["activeStatus"];
    calendar: Record<string, TaskCalendarState>;
    continuousOverdue: TaskStateEngineResult["continuousOverdue"];
    handledCurrentDay: boolean;
    nextDueDate: string | null;
    proposedHistoryCount: number;
    proposedHistorySummary: string[];
    proposedTaskPatchKeys: string[];
    proposedTaskPatch: ProposedTaskStatePatch;
    recurrenceAnchor: string | null;
    rewardEligibility: TaskStateEngineResult["rewardEligibility"];
    satisfiedOccurrenceIdentity: string | null;
    streakDisposition: TaskStateEngineResult["streakDisposition"];
  };
};

export type TaskStateShadowSafetyViolation = {
  taskId: string;
  field: string;
  reason: string;
};

export type TaskStateShadowReport = {
  timestamp: string;
  logicalDate: string;
  timezone: string;
  rolloverTime: string;
  dateRange: { startDate: string; endDate: string };
  taskCountEvaluated: number;
  taskCountSkipped: number;
  adapterWarningCount: number;
  matchCount: number;
  classificationCounts: Partial<Record<ShadowClassification, number>>;
  semanticGroupSummaries: Partial<Record<ShadowSemanticGroup, TaskStateShadowGroupSummary>>;
  possibleEngineDefectCount: number;
  possibleEngineDefects: TaskStateShadowPossibleDefect[];
  possibleDefectPatterns: TaskStateShadowDefectPatternSummary[];
  skippedTasks: TaskStateShadowSkipSummary;
  mismatchCountByField: Record<string, number>;
  mismatchCountByTaskType: Record<string, number>;
  approvedSemanticDifferences: TaskStateShadowMismatch[];
  representationOnlyDifferences: TaskStateShadowMismatch[];
  adapterLimitations: TaskStateShadowMismatch[];
  legacyDataAnomalies: TaskStateShadowMismatch[];
  unexpectedDifferences: TaskStateShadowMismatch[];
  perTask: TaskStateShadowTaskDetail[];
  proposedHistoryRowCount: number;
  proposedTaskPatchKeys: string[];
  totalExecutionTimeMs: number;
  slowestTaskTimeMs: number;
  safetyViolations: TaskStateShadowSafetyViolation[];
};

export type RunTaskStateShadowInput = {
  tasks: readonly Task[];
  history: readonly TaskHistory[];
  now: string | Date;
  timezone: string;
  rolloverTime: string;
  options?: TaskStateShadowOptions;
};

export type TaskStateShadowReviewOptions = {
  maxSamplesPerPattern?: number;
  includeTitles?: boolean;
  semanticGroup?: ShadowSemanticGroup;
  taskType?: string;
};

export const ALLOWED_TASK_STATE_PATCH_FIELDS = new Set<keyof ProposedTaskStatePatch>([
  "status",
  "dueOn",
  "activeStatusLogicalDate",
  "activeOccurrenceDueOn",
  "recurrenceCursor",
  "satisfiedOccurrenceIdentity",
  "completedAt",
]);

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const SUCCESS = new Set<TaskStatus>(["done", "did_my_best", "complete"]);
const HISTORY_OUTCOMES = new Set<TaskStatus>(["done", "did_my_best", "missed", "delayed", "complete"]);
const REPORT_SAMPLE_LIMIT = 5;

function nowMs() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function equal(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function increment(target: Record<string, number>, key: string) {
  target[key] = (target[key] ?? 0) + 1;
}

function taskType(task: Task) {
  if (task.repeat_frequency === "none") return task.due_on ? "one-off" : "unscheduled";
  if (task.repeat_frequency === "daily_until_complete") return "daily-until-complete";
  if (task.repeat_frequency === "daily" || task.repeat_frequency === "custom") {
    return task.repeat_interval > 1 ? "every-x-days" : "daily";
  }
  if (task.repeat_frequency === "weekly") return "fixed-weekly";
  if (task.repeat_frequency === "monthly") {
    return task.repeat_monthly_mode === "ordinal_weekday" ? "fixed-monthly-ordinal" : "fixed-monthly";
  }
  return "unknown";
}

function taskLifecycle(task: Task) {
  return task.status === "complete" || task.status === "archived" || task.status === "trashed"
    ? task.status
    : "active";
}

function isRollingTask(task: Task) {
  return task.repeat_frequency === "daily"
    || task.repeat_frequency === "custom"
    || task.repeat_frequency === "daily_until_complete";
}

function normalizedOccurrenceIdentity(taskId: string, value: unknown) {
  if (typeof value !== "string") return null;
  const short = /^occurrence:(\d{4}-\d{2}-\d{2})$/.exec(value);
  if (short) return { taskId, date: short[1] };
  const full = /^task:(.*):occurrence:(\d{4}-\d{2}-\d{2})$/.exec(value);
  return full ? { taskId: full[1], date: full[2] } : null;
}

function equalComparisonValue(task: Task, field: string, left: unknown, right: unknown) {
  if (field === "currentOccurrenceIdentity") {
    const normalizedLeft = normalizedOccurrenceIdentity(task.id, left);
    const normalizedRight = normalizedOccurrenceIdentity(task.id, right);
    if (normalizedLeft && normalizedRight) {
      return normalizedLeft.taskId === normalizedRight.taskId && normalizedLeft.date === normalizedRight.date;
    }
  }
  return equal(left, right);
}

function taskSample(task: Task, includeTitles: boolean): TaskStateShadowTaskSample {
  return {
    taskId: task.id,
    ...(includeTitles ? { taskTitle: task.title } : {}),
    taskType: taskType(task),
  };
}

function addSkipReason(
  summary: TaskStateShadowSkipSummary,
  reason: string,
  support: TaskStateShadowSkipReasonSummary["support"],
  task: Task,
  includeTitles: boolean,
) {
  const entry = summary.byReason[reason] ?? {
    support,
    count: 0,
    lifecycleCounts: {},
    taskTypeCounts: {},
    samples: [],
  };
  entry.count += 1;
  increment(entry.lifecycleCounts, taskLifecycle(task));
  increment(entry.taskTypeCounts, taskType(task));
  if (entry.samples.length < REPORT_SAMPLE_LIMIT) entry.samples.push(taskSample(task, includeTitles));
  summary.byReason[reason] = entry;
}

export function inspectProposedTaskPatch(
  taskId: string,
  patch: Record<string, unknown>,
  lifecycle: string,
): TaskStateShadowSafetyViolation[] {
  const violations = Object.keys(patch)
    .filter((key) => !ALLOWED_TASK_STATE_PATCH_FIELDS.has(key as keyof ProposedTaskStatePatch))
    .map((field) => ({
      taskId,
      field,
      reason: "Proposed task patch field is outside the Task State Engine allowlist.",
    }));
  if (lifecycle === "archived" || lifecycle === "trashed") {
    violations.push(...Object.keys(patch).map((field) => ({
      taskId,
      field,
      reason: `${lifecycle} tasks are read-only in shadow evaluation.`,
    })));
  }
  return violations;
}

export function assertSafeProposedTaskPatch(patch: Record<string, unknown>) {
  const violations = inspectProposedTaskPatch("assertion", patch, "active");
  if (violations.length > 0) {
    throw new Error(violations.map((violation) => violation.field).join(", "));
  }
}

function latestOutcomeOnDate(history: readonly TaskHistory[], date: string) {
  const row = getLatestTaskHistoryEntryOnDate(history as TaskHistory[], date);
  return row && HISTORY_OUTCOMES.has(row.status) ? row.status : null;
}

function legacyCalendarState(
  task: Task,
  history: readonly TaskHistory[],
  date: string,
  today: string,
  dueDates: Set<string>,
) {
  const outcome = latestOutcomeOnDate(history, date);
  if (outcome) return outcome;
  return getTaskHistoryCalendarVirtualState({
    dateKey: date,
    delayedUntilDateKey: task.status === "delayed" ? task.due_on : null,
    hasHistoryEntry: false,
    isDue: dueDates.has(date),
    nextDueDateKey: task.due_on,
    projectsUndatedDelayed: task.status === "delayed" && !task.due_on,
    todayDateKey: today,
  }) ?? "no_entry";
}

function currentPatchKeys(
  task: Task,
  history: readonly TaskHistory[],
  currentDayKey: string,
  now: Date,
  timezone: string,
  rolloverTime: string,
) {
  if (task.status === "archived" || task.status === "trashed") return [] as string[];
  const derived = resolveLiveTaskStatusFromHistory(task, history as TaskHistory[], {
    currentDayKey,
    dayStartTime: rolloverTime,
    now,
    timezone,
  });
  const keys: string[] = [];
  if (derived.status !== task.status) keys.push("status");
  if ("dueOn" in derived && derived.dueOn !== task.due_on) keys.push("dueOn");
  if (derived.completedAt !== task.completed_at) keys.push("completedAt");
  return keys.sort();
}

function legacyRecurrenceAnchor(history: readonly TaskHistory[], today: string) {
  return [...history]
    .filter((row) => row.entry_date <= today && SUCCESS.has(row.status))
    .sort((left, right) => left.entry_date.localeCompare(right.entry_date)
      || left.updated_at.localeCompare(right.updated_at)
      || left.id.localeCompare(right.id))
    .at(-1)?.occurrence_due_on
    ?? [...history]
      .filter((row) => row.entry_date <= today && SUCCESS.has(row.status))
      .sort((left, right) => left.entry_date.localeCompare(right.entry_date))
      .at(-1)?.entry_date
    ?? null;
}

function legacyOccurrenceIdentity(task: Task, history: readonly TaskHistory[], today: string) {
  const explicit = [...history]
    .filter((row) => row.entry_date <= today && SUCCESS.has(row.status))
    .sort((left, right) => left.entry_date.localeCompare(right.entry_date)
      || left.updated_at.localeCompare(right.updated_at))
    .at(-1);
  return explicit?.occurrence_key
    ?? (explicit?.occurrence_due_on ? occurrenceIdentity(task.id, explicit.occurrence_due_on) : null)
    ?? (task.active_occurrence_due_on ? occurrenceIdentity(task.id, task.active_occurrence_due_on) : null);
}

function hasLegacyAnomaly(history: readonly TaskHistory[]) {
  const outcomes = new Map<string, Set<TaskStatus>>();
  for (const row of history) {
    const statuses = outcomes.get(row.entry_date) ?? new Set<TaskStatus>();
    statuses.add(row.status);
    outcomes.set(row.entry_date, statuses);
  }
  return [...outcomes.values()].some((statuses) => statuses.size > 1);
}

function semanticGroupForField(field: string, today: string): ShadowSemanticGroup {
  if (field === "activeStatus" || field === "handledCurrentDay" || field.endsWith("Today")) {
    return "active-status differences";
  }
  if (field === "currentCalendarState" || field === `calendar.${today}`) {
    return "current-day Calendar differences";
  }
  if (field.startsWith("calendar.")) return "sparse Calendar representation differences";
  if (field === "continuousOverdue" || field === "overdueClassification") {
    return "overdue-classification differences";
  }
  if (field === "proposedHistoryChanges") return "proposed History differences";
  if (field.startsWith("proposedTaskPatch")) return "proposed task-patch differences";
  if (field.startsWith("adapter.")) return "adapter warnings";
  return "recurrence differences";
}

type CalendarComparisonFacts = NonNullable<TaskStateShadowMismatch["calendarFacts"]>;

function classifyCalendarDifference(
  legacyValue: unknown,
  engineValue: unknown,
  facts: CalendarComparisonFacts,
  continuousOverdue: boolean,
  rolling: boolean,
  nextDueDate: string | null,
) {
  if (facts.explicitHistory) {
    return {
      classification: "possible engine defect" as const,
      reason: "Explicit History is authoritative, so a Calendar disagreement remains visible as a possible defect.",
    };
  }
  if (facts.dateRelation === "current" && legacyValue === "due" && engineValue === "open" && facts.scheduled) {
    return {
      classification: "approved semantic difference" as const,
      reason: "A scheduled unresolved current day is Open in the 7.6 model; production labels the same obligation Due.",
    };
  }
  if (
    facts.dateRelation === "current"
    && continuousOverdue
    && engineValue === "open"
    && (legacyValue === "due" || legacyValue === "not_due" || legacyValue === "no_entry")
  ) {
    return {
      classification: "approved semantic difference" as const,
      reason: "Continuous overdue keeps the current logical day Open while prior unresolved dates become Missed.",
    };
  }
  if (
    facts.dateRelation === "current"
    && facts.unscheduled
    && (legacyValue === "not_due" || legacyValue === "no_entry")
    && engineValue === "open"
  ) {
    return {
      classification: "approved semantic difference" as const,
      reason: "The specified Unscheduled model keeps today virtually Open without creating History or a schedule obligation.",
    };
  }
  if (
    facts.dateRelation === "past"
    && continuousOverdue
    && engineValue === "missed"
    && (legacyValue === "due" || legacyValue === "not_due" || legacyValue === "no_entry")
  ) {
    return {
      classification: "approved semantic difference" as const,
      reason: "Continuous overdue marks each unresolved completed logical day Missed while keeping the live due date frozen.",
    };
  }
  if (facts.dateRelation === "future" && facts.scheduled && legacyValue === "due" && engineValue === "scheduled") {
    return {
      classification: "approved semantic difference" as const,
      reason: "The 7.6 Calendar names a real future occurrence Scheduled; production labels it Due.",
    };
  }
  if (
    facts.dateRelation === "future"
    && rolling
    && legacyValue === "due"
    && engineValue === "no_entry"
    && (continuousOverdue || (nextDueDate !== null && facts.date > nextDueDate))
  ) {
    return {
      classification: "representation-only difference" as const,
      reason: "Rolling recurrence schedules only its calculated next occurrence; later legacy Due cells depend on a future success or are blocked by continuous overdue.",
    };
  }
  if (
    !facts.scheduled
    && (legacyValue === "no_entry" || engineValue === "no_entry")
    && ["no_entry", "not_due", "upcoming"].includes(String(legacyValue))
    && ["no_entry", "not_due", "upcoming"].includes(String(engineValue))
  ) {
    return {
      classification: "representation-only difference" as const,
      reason: "No occurrence or History exists on this date; the engine intentionally omits sparse Calendar cells.",
    };
  }
  if (facts.scheduled && engineValue === "no_entry") {
    return {
      classification: "possible engine defect" as const,
      reason: "A genuinely scheduled occurrence is missing from the engine Calendar and is not normalized away.",
    };
  }
  return {
    classification: "possible engine defect" as const,
    reason: "The Calendar difference is not covered by a date-, schedule-, History-, or sparse-representation rule.",
  };
}

function classifyDifference({
  adapterIssues,
  anomaly,
  engineValue,
  field,
  legacyValue,
  task,
  today,
  calendarFacts,
  continuousOverdue,
  nextDueDate,
}: {
  adapterIssues: LegacyAdapterIssue[];
  anomaly: boolean;
  engineValue: unknown;
  field: string;
  legacyValue: unknown;
  task: Task;
  today: string;
  calendarFacts?: CalendarComparisonFacts;
  continuousOverdue: boolean;
  nextDueDate: string | null;
}): { classification: ShadowClassification; reason: string } {
  if (legacyValue === LEGACY_UNAVAILABLE) {
    return { classification: "adapter limitation", reason: "No current read-only derivation helper exposes this comparison value." };
  }
  if (anomaly) {
    return { classification: "legacy-data anomaly", reason: "Multiple conflicting legacy outcomes exist for one logical date." };
  }
  if (calendarFacts) {
    return classifyCalendarDifference(
      legacyValue,
      engineValue,
      calendarFacts,
      continuousOverdue,
      isRollingTask(task),
      nextDueDate,
    );
  }
  if (
    field === "activeStatus"
    && legacyValue === "pending"
    && engineValue === "unscheduled"
    && task.due_on === null
    && task.repeat_frequency === "none"
  ) {
    return {
      classification: "approved semantic difference",
      reason: "A legacy Pending task with no due date or recurrence obligation is Unscheduled in the approved 7.6 model.",
    };
  }
  if (field === "activeStatus" && legacyValue === "pending" && engineValue === "missed" && task.due_on !== null && task.due_on < today) {
    return {
      classification: "approved semantic difference",
      reason: "An unresolved overdue scheduled task remains actively Missed while its current logical day stays Open.",
    };
  }
  if (field === "activeStatus" && legacyValue === "upcoming" && engineValue === "missed" && task.due_on !== null && task.due_on < today) {
    return {
      classification: "approved semantic difference",
      reason: "An Upcoming occurrence that has passed unresolved becomes Missed in the approved 7.6 model.",
    };
  }
  if (
    field === "activeStatus"
    && legacyValue === "pending"
    && (engineValue === "upcoming" || engineValue === "not_due")
    && task.due_on !== null
    && task.due_on > today
  ) {
    return {
      classification: "approved semantic difference",
      reason: "A future Pending task is classified from its logical due-date distance in the approved 7.6 model.",
    };
  }
  if (
    field === "activeStatus"
    && legacyValue === "delayed"
    && (engineValue === "upcoming" || engineValue === "not_due")
    && task.due_on !== null
    && task.due_on > today
  ) {
    return {
      classification: "approved semantic difference",
      reason: "A delayed task returns to its calculated future active status after its delay date is resolved.",
    };
  }
  if (
    field === "activeStatus"
    && (legacyValue === "done" || legacyValue === "did_my_best")
    && engineValue === "unscheduled"
    && task.due_on === null
  ) {
    return {
      classification: "approved semantic difference",
      reason: "A completed unscheduled attempt returns to Unscheduled on a later logical day.",
    };
  }
  if (field === "handledCurrentDay" && engineValue === true && legacyValue === false) {
    return {
      classification: "approved semantic difference",
      reason: "The engine treats every explicit outcome, including Delay and Complete, as handled.",
    };
  }
  if (
    (field === "nextDueDate" || field === "recurrenceAnchor" || field === "currentOccurrenceIdentity")
    && (task.repeat_frequency === "weekly" || task.repeat_frequency === "monthly")
    && task.due_on !== null
    && task.due_on > today
  ) {
    return {
      classification: "approved semantic difference",
      reason: "The engine consumes only the nearest fixed-schedule occurrence after an early success.",
    };
  }
  if (field === "proposedHistoryChanges" && continuousOverdue && Array.isArray(legacyValue) && Array.isArray(engineValue)) {
    const legacyRows = legacyValue.map(String);
    const engineRows = engineValue.map(String);
    if (
      legacyRows.every((row) => engineRows.includes(row))
      && engineRows.filter((row) => !legacyRows.includes(row)).every((row) => row.endsWith(":missed"))
    ) {
      return {
        classification: "approved semantic difference",
        reason: "The engine adds only continuous-overdue Missed logical-day proposals beyond the legacy scheduled-date helper.",
      };
    }
  }
  if (
    field === "proposedTaskPatchKeys"
    && task.due_on === null
    && task.repeat_frequency === "none"
    && Array.isArray(engineValue)
    && engineValue.length === 1
    && engineValue[0] === "status"
  ) {
    return {
      classification: "approved semantic difference",
      reason: "The only proposed patch aligns a dormant legacy Pending row with the approved Unscheduled active model.",
    };
  }
  if (field === "proposedTaskPatchKeys" && adapterIssues.some((item) =>
    item.code === "recurrence_cursor_unavailable" || item.code === "satisfied_occurrence_identity_unavailable")) {
    const legacyKeys = Array.isArray(legacyValue) ? legacyValue : [];
    const engineKeys = Array.isArray(engineValue) ? engineValue : [];
    const addedKeys = engineKeys.filter((key) => !legacyKeys.includes(key));
    const removedKeys = legacyKeys.filter((key) => !engineKeys.includes(key));
    const metadataOnly = addedKeys.length > 0
      && removedKeys.length === 0
      && addedKeys.every((key) => key === "recurrenceCursor" || key === "satisfiedOccurrenceIdentity");
    if (metadataOnly) {
      return {
        classification: "adapter limitation",
        reason: "The task model cannot expose current task-level recurrence metadata, so metadata-only patch proposals cannot be judged as defects.",
      };
    }
  }
  return { classification: "possible engine defect", reason: "The difference is not covered by an approved semantic rule." };
}

const LEGACY_UNAVAILABLE = Symbol("legacy-value-unavailable");

function comparison(
  task: Task,
  taskTitle: string | undefined,
  field: string,
  legacyValue: unknown,
  engineValue: unknown,
  context: {
    adapterIssues: LegacyAdapterIssue[];
    anomaly: boolean;
    today: string;
    continuousOverdue: boolean;
    nextDueDate: string | null;
  },
  calendarFacts?: CalendarComparisonFacts,
): TaskStateShadowMismatch {
  if (legacyValue !== LEGACY_UNAVAILABLE && equalComparisonValue(task, field, legacyValue, engineValue)) {
    return {
      taskId: task.id,
      ...(taskTitle ? { taskTitle } : {}),
      field,
      semanticGroup: semanticGroupForField(field, context.today),
      currentSystemValue: legacyValue,
      engineValue,
      classification: "match",
      reason: "Current derivation and Task State Engine agree.",
      ...(calendarFacts ? { calendarFacts } : {}),
    };
  }
  const classified = classifyDifference({
    adapterIssues: context.adapterIssues,
    anomaly: context.anomaly,
    engineValue,
    field,
    legacyValue,
    task,
    today: context.today,
    calendarFacts,
    continuousOverdue: context.continuousOverdue,
    nextDueDate: context.nextDueDate,
  });
  return {
    taskId: task.id,
    ...(taskTitle ? { taskTitle } : {}),
    field,
    semanticGroup: semanticGroupForField(field, context.today),
    currentSystemValue: legacyValue === LEGACY_UNAVAILABLE ? null : legacyValue,
    engineValue,
    ...classified,
    ...(calendarFacts ? { calendarFacts } : {}),
  };
}

function proposedHistorySummary(rows: TaskStateEngineResult["proposedHistoryChanges"], startDate: string, endDate: string) {
  return rows
    .filter((change): change is Extract<typeof change, { type: "insert" }> => change.type === "insert")
    .filter((change) => change.row.logicalDate >= startDate && change.row.logicalDate <= endDate)
    .map((change) => `${change.row.logicalDate}:${change.row.outcome}`)
    .sort();
}

function sanitizeProposedTaskPatch(patch: ProposedTaskStatePatch): ProposedTaskStatePatch {
  return Object.fromEntries(
    Object.entries(patch).filter(([key]) => ALLOWED_TASK_STATE_PATCH_FIELDS.has(key as keyof ProposedTaskStatePatch)),
  ) as ProposedTaskStatePatch;
}

function summarizeComparisons(comparisons: readonly TaskStateShadowMismatch[]) {
  const countsByClassification: Partial<Record<ShadowClassification, number>> = {};
  const semanticGroups: Partial<Record<ShadowSemanticGroup, number>> = {};
  const defectGroups = new Set<ShadowSemanticGroup>();
  for (const item of comparisons) {
    countsByClassification[item.classification] = (countsByClassification[item.classification] ?? 0) + 1;
    if (item.classification !== "match") {
      semanticGroups[item.semanticGroup] = (semanticGroups[item.semanticGroup] ?? 0) + 1;
    }
    if (item.classification === "possible engine defect") defectGroups.add(item.semanticGroup);
  }
  return {
    countsByClassification,
    possibleEngineDefectGroupCount: defectGroups.size,
    semanticGroups,
  };
}

function appendValue(target: Record<string, unknown[]>, field: string, value: unknown) {
  const values = target[field] ?? [];
  if (!values.some((existing) => equal(existing, value))) values.push(value);
  target[field] = values;
}

function buildPossibleEngineDefects(perTask: readonly TaskStateShadowTaskDetail[], includeFullDefectDetails = false) {
  const defects: TaskStateShadowPossibleDefect[] = [];
  for (const detail of perTask) {
    const byGroup = new Map<ShadowSemanticGroup, TaskStateShadowMismatch[]>();
    for (const item of detail.comparisons) {
      if (item.classification !== "possible engine defect") continue;
      const items = byGroup.get(item.semanticGroup) ?? [];
      items.push(item);
      byGroup.set(item.semanticGroup, items);
    }
    for (const [semanticGroup, items] of byGroup) {
      const currentValues: Record<string, unknown[]> = {};
      const engineValues: Record<string, unknown[]> = {};
      const calendarItems = items.filter((item) => item.calendarFacts);
      for (const item of items.filter((candidate) => !candidate.calendarFacts)) {
        appendValue(currentValues, item.field, item.currentSystemValue);
        appendValue(engineValues, item.field, item.engineValue);
      }
      const calendarDates = calendarItems.map((item) => item.calendarFacts?.date as string).sort();
      defects.push({
        taskId: detail.taskId,
        ...(detail.taskTitle ? { taskTitle: detail.taskTitle } : {}),
        taskType: detail.taskType,
        semanticGroup,
        affectedFields: [...new Set(items.filter((item) => !item.calendarFacts).map((item) => item.field))]
          .concat(calendarItems.length > 0 ? ["calendar"] : [])
          .sort(),
        currentValues,
        engineValues,
        ...(calendarItems.length > 0 ? {
          calendarSummary: {
            dateCount: calendarItems.length,
            sampleDates: calendarDates.slice(0, REPORT_SAMPLE_LIMIT),
            firstAffectedDate: calendarDates[0],
            lastAffectedDate: calendarDates.at(-1) as string,
            normalizedPattern: normalizedDefectPattern(calendarItems[0]),
            ...(includeFullDefectDetails ? {
              fullDetails: calendarItems.map((item) => ({
                date: item.calendarFacts?.date as string,
                currentSystemValue: item.currentSystemValue,
                engineValue: item.engineValue,
              })),
            } : {}),
          },
        } : {}),
        reason: [...new Set(items.map((item) => item.reason))].join(" "),
        adapterWarnings: [...detail.adapterWarnings, ...detail.unsupportedLegacy],
        sanitizedProposedTaskPatch: detail.engine.proposedTaskPatch,
        proposedHistorySummary: {
          count: detail.engine.proposedHistorySummary.length,
          samples: detail.engine.proposedHistorySummary.slice(0, REPORT_SAMPLE_LIMIT),
        },
      });
    }
  }
  return defects;
}

function titleCaseState(value: unknown) {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizedDefectPattern(item: TaskStateShadowMismatch) {
  if (item.calendarFacts?.explicitHistory) return "explicit History disagreement";
  if (item.calendarFacts?.scheduled && item.engineValue === "no_entry") {
    return "genuinely missing scheduled Calendar occurrence";
  }
  if (item.field === "activeStatus") {
    return `${titleCaseState(item.currentSystemValue)} to ${titleCaseState(item.engineValue)}`;
  }
  if (item.field === "recurrenceAnchor" || item.field === "nextDueDate") return "recurrence anchor mismatch";
  if (item.field === "currentOccurrenceIdentity") return "occurrence identity mismatch";
  if (item.semanticGroup === "overdue-classification differences") return "overdue classification mismatch";
  if (item.semanticGroup === "current-day Calendar differences") return "current-day Calendar mismatch";
  if (item.semanticGroup === "proposed task-patch differences") return "proposed patch mismatch";
  if (item.semanticGroup === "proposed History differences") return "proposed History mismatch";
  if (item.field.startsWith("calendar.")) return "Calendar occurrence mismatch";
  return item.semanticGroup;
}

function buildPossibleDefectPatterns(
  comparisons: readonly TaskStateShadowMismatch[],
  perTask: readonly TaskStateShadowTaskDetail[],
) {
  const details = new Map(perTask.map((detail) => [detail.taskId, detail]));
  const patternKeys = new Map<string, Set<string>>();
  for (const item of comparisons) {
    const pattern = normalizedDefectPattern(item);
    const keys = patternKeys.get(pattern) ?? new Set<string>();
    // A run of Calendar dates for one task/group is one review comparison, not dozens.
    keys.add(`${item.taskId}\u0000${item.semanticGroup}`);
    patternKeys.set(pattern, keys);
  }
  return [...patternKeys]
    .map(([pattern, keys]) => {
      const taskIds = [...new Set([...keys].map((key) => key.split("\u0000", 1)[0]))];
      const taskTypeCounts: Record<string, number> = {};
      const samples = taskIds.slice(0, REPORT_SAMPLE_LIMIT).flatMap((taskId) => {
        const detail = details.get(taskId);
        if (!detail) return [];
        increment(taskTypeCounts, detail.taskType);
        return [{
          taskId,
          ...(detail.taskTitle ? { taskTitle: detail.taskTitle } : {}),
          taskType: detail.taskType,
        }];
      });
      for (const taskId of taskIds.slice(REPORT_SAMPLE_LIMIT)) {
        const detail = details.get(taskId);
        if (detail) increment(taskTypeCounts, detail.taskType);
      }
      return {
        pattern,
        comparisonCount: keys.size,
        affectedTaskCount: taskIds.length,
        taskTypeCounts,
        samples,
      };
    })
    .sort((left, right) => right.comparisonCount - left.comparisonCount || left.pattern.localeCompare(right.pattern));
}

function reviewSample(sample: TaskStateShadowTaskSample, includeTitles: boolean): TaskStateShadowTaskSample {
  return {
    taskId: sample.taskId,
    ...(includeTitles && sample.taskTitle ? { taskTitle: sample.taskTitle } : {}),
    taskType: sample.taskType,
  };
}

export function summarizeTaskStateShadowReport(
  report: TaskStateShadowReport,
  options: TaskStateShadowReviewOptions = {},
) {
  const sampleLimit = Math.max(0, Math.min(25, Math.floor(options.maxSamplesPerPattern ?? REPORT_SAMPLE_LIMIT)));
  const includeTitles = options.includeTitles === true;
  const details = report.perTask.filter((detail) =>
    (!options.taskType || detail.taskType === options.taskType));
  const allowedTaskIds = new Set(details.map((detail) => detail.taskId));
  const comparisons = report.unexpectedDifferences.filter((item) =>
    allowedTaskIds.has(item.taskId)
    && (!options.semanticGroup || item.semanticGroup === options.semanticGroup));
  const defects = buildPossibleEngineDefects(details)
    .filter((defect) => !options.semanticGroup || defect.semanticGroup === options.semanticGroup)
    .map((defect) => {
      const { taskTitle, ...sanitized } = defect;
      return {
        ...sanitized,
        ...(includeTitles && taskTitle ? { taskTitle } : {}),
      };
    });
  const patterns = buildPossibleDefectPatterns(comparisons, details).map((pattern) => ({
    ...pattern,
    samples: pattern.samples.slice(0, sampleLimit).map((sample) => reviewSample(sample, includeTitles)),
  }));
  const skippedReasons = Object.fromEntries(Object.entries(report.skippedTasks.byReason).map(([reason, summary]) => [
    reason,
    {
      ...summary,
      samples: summary.samples.slice(0, sampleLimit).map((sample) => reviewSample(sample, includeTitles)),
    },
  ]));
  return {
    headline: {
      timestamp: report.timestamp,
      logicalDate: report.logicalDate,
      evaluatedTasks: report.taskCountEvaluated,
      excludedLifecycleTasks: report.skippedTasks.excludedLifecycleTaskCount,
      fullySkippedUnsupportedTasks: report.skippedTasks.fullySkippedUnsupportedTaskCount,
      fullySkippedTasks: report.skippedTasks.fullySkippedTaskCount,
      partiallyUnsupportedTasks: report.skippedTasks.partiallyUnsupportedTaskCount,
      possibleEngineDefects: defects.length,
      possibleDefectComparisons: comparisons.length,
      safetyViolations: report.safetyViolations.length,
      totalExecutionTimeMs: report.totalExecutionTimeMs,
    },
    skippedReasons,
    possibleDefectPatterns: patterns,
    possibleEngineDefects: defects,
    safetyViolations: report.safetyViolations,
    slowestTasks: [...details]
      .sort((left, right) => right.durationMs - left.durationMs)
      .slice(0, sampleLimit)
      .map((detail) => ({
        ...reviewSample(detail, includeTitles),
        durationMs: detail.durationMs,
      })),
  };
}

export function formatTaskStateShadowReportJson(
  report: TaskStateShadowReport,
  options: Pick<TaskStateShadowReviewOptions, "includeTitles"> = {},
) {
  return JSON.stringify(report, (key, value) => key === "taskTitle" && options.includeTitles !== true ? undefined : value, 2);
}

export function runTaskStateShadow(input: RunTaskStateShadowInput): TaskStateShadowReport {
  const startedAt = nowMs();
  const now = input.now instanceof Date ? new Date(input.now) : new Date(input.now);
  const timestamp = now.toISOString();
  const logicalDate = logicalDateForTimestamp(now, input.timezone, input.rolloverTime);
  const startDate = input.options?.startDate && DATE_KEY.test(input.options.startDate)
    ? input.options.startDate
    : shiftDateKey(logicalDate, -30);
  const endDate = input.options?.endDate && DATE_KEY.test(input.options.endDate)
    ? input.options.endDate
    : shiftDateKey(logicalDate, 40);
  const requestedIds = input.options?.taskIds ? new Set(input.options.taskIds) : null;
  const selectedTasks = input.tasks.filter((task) => requestedIds
    ? requestedIds.has(task.id)
    : task.status !== "complete" && task.status !== "archived" && task.status !== "trashed");
  const selectedTaskIds = new Set(selectedTasks.map((task) => task.id));
  const skippedTasks: TaskStateShadowSkipSummary = {
    excludedLifecycleTaskCount: 0,
    fullySkippedUnsupportedTaskCount: 0,
    fullySkippedTaskCount: input.tasks.length - selectedTasks.length,
    partiallyUnsupportedTaskCount: 0,
    fullySkippedByLifecycleAndTaskType: {},
    byReason: {},
  };
  for (const task of input.tasks) {
    if (selectedTaskIds.has(task.id)) continue;
    const reason = requestedIds && !requestedIds.has(task.id)
      ? "not selected by taskIds filter"
      : `excluded ${taskLifecycle(task)} lifecycle`;
    if (!requestedIds && taskLifecycle(task) !== "active") skippedTasks.excludedLifecycleTaskCount += 1;
    addSkipReason(skippedTasks, reason, "fully skipped", task, input.options?.includeTitles === true);
    increment(skippedTasks.fullySkippedByLifecycleAndTaskType, `${taskLifecycle(task)}:${taskType(task)}`);
  }
  const historyByTaskId = new Map<string, TaskHistory[]>();
  for (const row of input.history) {
    const rows = historyByTaskId.get(row.task_id) ?? [];
    rows.push(row);
    historyByTaskId.set(row.task_id, rows);
  }

  const mismatchCountByField: Record<string, number> = {};
  const mismatchCountByTaskType: Record<string, number> = {};
  const approvedSemanticDifferences: TaskStateShadowMismatch[] = [];
  const representationOnlyDifferences: TaskStateShadowMismatch[] = [];
  const adapterLimitations: TaskStateShadowMismatch[] = [];
  const legacyDataAnomalies: TaskStateShadowMismatch[] = [];
  const unexpectedDifferences: TaskStateShadowMismatch[] = [];
  const classificationCounts: Partial<Record<ShadowClassification, number>> = {};
  const groupComparisonCounts = new Map<ShadowSemanticGroup, Partial<Record<ShadowClassification, number>>>();
  const groupEvaluatedTaskIds = new Map<ShadowSemanticGroup, Set<string>>();
  const groupDifferingTaskIds = new Map<ShadowSemanticGroup, Set<string>>();
  const groupClassificationTaskIds = new Map<ShadowSemanticGroup, Map<ShadowClassification, Set<string>>>();
  const safetyViolations: TaskStateShadowSafetyViolation[] = [];
  const patchKeys = new Set<string>();
  const perTask: TaskStateShadowTaskDetail[] = [];
  let adapterWarningCount = 0;
  let matchCount = 0;
  let proposedHistoryRowCount = 0;

  for (const task of selectedTasks) {
    const taskStartedAt = nowMs();
    const taskHistory = historyByTaskId.get(task.id) ?? [];
    const adapted = adaptLegacyTaskState(task, taskHistory, {
      now,
      timezone: input.timezone,
      logicalDayRollover: input.rolloverTime,
    });
    adapterWarningCount += adapted.warnings.length + adapted.unsupported.length;
    if (adapted.unsupported.length > 0) {
      skippedTasks.partiallyUnsupportedTaskCount += 1;
      for (const reason of new Set(adapted.unsupported.map((issue) => issue.code))) {
        addSkipReason(
          skippedTasks,
          reason,
          "partially unsupported",
          task,
          input.options?.includeTitles === true,
        );
      }
    }
    const result = evaluateTaskState({
      ...adapted.engineInput,
      action: { type: "recompute", fromLogicalDate: startDate },
    });
    const boundedDates = dateRange(startDate, endDate);
    const boundedCalendar = Object.fromEntries(
      boundedDates
        .filter((date) => result.calendar[date] !== undefined)
        .map((date) => [date, result.calendar[date]]),
    );
    const dueDates = buildTaskHistoryCalendarDueDateSet(task, startDate, endDate, logicalDate, taskHistory);
    const facts = {
      doneToday: latestOutcomeOnDate(taskHistory, logicalDate) === "done",
      didMyBestToday: latestOutcomeOnDate(taskHistory, logicalDate) === "did_my_best",
      missedToday: isTaskMissedOnDate(taskHistory, logicalDate),
    };
    const legacyContinuousOverdue = {
      active: Boolean(task.due_on && task.due_on < logicalDate
        && ["pending", "in_progress", "delayed", "missed", "upcoming", "not_due"].includes(task.status)),
      frozenDueOn: task.due_on && task.due_on < logicalDate ? task.due_on : null,
      firstMissedDate: task.due_on && task.due_on < logicalDate ? task.due_on : null,
    };
    const legacyProposedHistory = buildOverdueTaskMissedDateKeys(task, logicalDate)
      .filter((date) => date >= startDate && date <= endDate)
      .filter((date) => !taskHistory.some((row) => row.entry_date === date))
      .map((date) => `${date}:missed`)
      .sort();
    const engineProposedHistory = proposedHistorySummary(result.proposedHistoryChanges, startDate, endDate);
    proposedHistoryRowCount += engineProposedHistory.length;
    const enginePatchKeys = Object.keys(result.proposedTaskPatch).sort();
    const proposedTaskPatch = sanitizeProposedTaskPatch(result.proposedTaskPatch);
    enginePatchKeys.forEach((key) => patchKeys.add(key));
    safetyViolations.push(...inspectProposedTaskPatch(task.id, result.proposedTaskPatch, result.lifecycle));
    const includeTitle = input.options?.includeTitles === true ? task.title : undefined;
    const context = {
      adapterIssues: [...adapted.warnings, ...adapted.unsupported],
      anomaly: hasLegacyAnomaly(taskHistory),
      today: logicalDate,
      continuousOverdue: result.continuousOverdue.active,
      nextDueDate: result.nextDueDate,
    };
    const comparisons: TaskStateShadowMismatch[] = [
      comparison(task, includeTitle, "activeStatus", getTaskDisplayStatusWithHistory(task, taskHistory, logicalDate), result.activeStatus, context),
      comparison(
        task,
        includeTitle,
        "currentCalendarState",
        legacyCalendarState(task, taskHistory, logicalDate, logicalDate, dueDates),
        result.calendar[logicalDate] ?? "no_entry",
        context,
        {
          date: logicalDate,
          dateRelation: "current",
          engineHasEntry: result.calendar[logicalDate] !== undefined,
          explicitHistory: latestOutcomeOnDate(taskHistory, logicalDate) !== null,
          scheduled: dueDates.has(logicalDate),
          unscheduled: task.due_on === null && task.repeat_frequency === "none",
        },
      ),
      comparison(task, includeTitle, "handledCurrentDay", isTaskHandledOnDate(taskHistory, logicalDate), result.handledCurrentDay, context),
      comparison(task, includeTitle, "doneToday", facts.doneToday, result.currentDayOutcome.outcome === "done", context),
      comparison(task, includeTitle, "didMyBestToday", facts.didMyBestToday, result.currentDayOutcome.outcome === "did_my_best", context),
      comparison(task, includeTitle, "missedToday", facts.missedToday, result.currentDayOutcome.missedToday, context),
      comparison(task, includeTitle, "continuousOverdue", legacyContinuousOverdue, result.continuousOverdue, context),
      comparison(task, includeTitle, "overdueClassification", getTaskDisplayStatusWithHistory(task, taskHistory, logicalDate) === "missed", result.activeStatus === "missed", context),
      comparison(task, includeTitle, "recurrenceAnchor", legacyRecurrenceAnchor(taskHistory, logicalDate), result.recurrenceAnchor, context),
      comparison(task, includeTitle, "nextDueDate", task.due_on, result.nextDueDate, context),
      comparison(task, includeTitle, "currentOccurrenceIdentity", legacyOccurrenceIdentity(task, taskHistory, logicalDate), result.satisfiedOccurrenceIdentity, context),
      comparison(task, includeTitle, "proposedHistoryChanges", legacyProposedHistory, engineProposedHistory, context),
      comparison(
        task,
        includeTitle,
        "proposedTaskPatchKeys",
        currentPatchKeys(task, taskHistory, logicalDate, now, input.timezone, input.rolloverTime),
        enginePatchKeys,
        context,
      ),
      comparison(task, includeTitle, "streakDisposition", LEGACY_UNAVAILABLE, result.streakDisposition, context),
      comparison(task, includeTitle, "rewardEligibility", LEGACY_UNAVAILABLE, result.rewardEligibility, context),
      ...boundedDates.map((date) => {
        const explicitHistory = latestOutcomeOnDate(taskHistory, date) !== null;
        const calendarFacts: CalendarComparisonFacts = {
          date,
          dateRelation: date < logicalDate ? "past" : date > logicalDate ? "future" : "current",
          engineHasEntry: result.calendar[date] !== undefined,
          explicitHistory,
          scheduled: dueDates.has(date),
          unscheduled: task.due_on === null && task.repeat_frequency === "none",
        };
        return comparison(
          task,
          includeTitle,
          `calendar.${date}`,
          legacyCalendarState(task, taskHistory, date, logicalDate, dueDates),
          result.calendar[date] ?? "no_entry",
          context,
          calendarFacts,
        );
      }),
      ...adapted.warnings.map((warning) => ({
        taskId: task.id,
        ...(includeTitle ? { taskTitle: includeTitle } : {}),
        field: `adapter.${warning.path}`,
        semanticGroup: "adapter warnings" as const,
        currentSystemValue: warning.value ?? null,
        engineValue: null,
        classification: "adapter warning" as const,
        reason: warning.message,
      })),
      ...adapted.unsupported.map((warning) => ({
        taskId: task.id,
        ...(includeTitle ? { taskTitle: includeTitle } : {}),
        field: `adapter.${warning.path}`,
        semanticGroup: "unsupported legacy data" as const,
        currentSystemValue: warning.value ?? null,
        engineValue: null,
        classification: "unsupported legacy data" as const,
        reason: warning.message,
      })),
    ];
    for (const item of comparisons) {
      classificationCounts[item.classification] = (classificationCounts[item.classification] ?? 0) + 1;
      const groupCounts = groupComparisonCounts.get(item.semanticGroup) ?? {};
      groupCounts[item.classification] = (groupCounts[item.classification] ?? 0) + 1;
      groupComparisonCounts.set(item.semanticGroup, groupCounts);
      const evaluatedTaskIds = groupEvaluatedTaskIds.get(item.semanticGroup) ?? new Set<string>();
      evaluatedTaskIds.add(task.id);
      groupEvaluatedTaskIds.set(item.semanticGroup, evaluatedTaskIds);
      const classificationTaskIds = groupClassificationTaskIds.get(item.semanticGroup) ?? new Map();
      const taskIdsForClassification = classificationTaskIds.get(item.classification) ?? new Set<string>();
      taskIdsForClassification.add(task.id);
      classificationTaskIds.set(item.classification, taskIdsForClassification);
      groupClassificationTaskIds.set(item.semanticGroup, classificationTaskIds);
      if (item.classification !== "match") {
        const taskIds = groupDifferingTaskIds.get(item.semanticGroup) ?? new Set<string>();
        taskIds.add(task.id);
        groupDifferingTaskIds.set(item.semanticGroup, taskIds);
      }
      if (item.classification === "match") {
        matchCount += 1;
        continue;
      }
      if (item.classification === "approved semantic difference") approvedSemanticDifferences.push(item);
      if (item.classification === "representation-only difference") representationOnlyDifferences.push(item);
      if (item.classification === "adapter limitation") adapterLimitations.push(item);
      if (item.classification === "legacy-data anomaly") legacyDataAnomalies.push(item);
      if (item.classification === "possible engine defect") {
        unexpectedDifferences.push(item);
      }
      if (item.classification === "possible engine defect") {
        increment(mismatchCountByField, item.field);
        increment(mismatchCountByTaskType, taskType(task));
      }
    }
    const taskSummary = summarizeComparisons(comparisons);
    perTask.push({
      taskId: task.id,
      ...(includeTitle ? { taskTitle: includeTitle } : {}),
      taskType: taskType(task),
      durationMs: Number((nowMs() - taskStartedAt).toFixed(3)),
      adapterWarnings: adapted.warnings,
      unsupportedLegacy: adapted.unsupported,
      comparisons: input.options?.includeMatches ? comparisons : comparisons.filter((item) => item.classification !== "match"),
      summary: taskSummary,
      engine: {
        activeStatus: result.activeStatus,
        calendar: boundedCalendar,
        continuousOverdue: result.continuousOverdue,
        handledCurrentDay: result.handledCurrentDay,
        nextDueDate: result.nextDueDate,
        proposedHistoryCount: engineProposedHistory.length,
        proposedHistorySummary: engineProposedHistory,
        proposedTaskPatchKeys: enginePatchKeys,
        proposedTaskPatch,
        recurrenceAnchor: result.recurrenceAnchor,
        rewardEligibility: result.rewardEligibility,
        satisfiedOccurrenceIdentity: result.satisfiedOccurrenceIdentity,
        streakDisposition: result.streakDisposition,
      },
    });
  }

  const totalExecutionTimeMs = Number((nowMs() - startedAt).toFixed(3));
  const semanticGroupSummaries = Object.fromEntries(
    [...groupComparisonCounts].map(([group, countsByClassification]) => {
      const classificationTaskIds = groupClassificationTaskIds.get(group);
      return [group, {
        comparisonCount: Object.values(countsByClassification).reduce((sum, count) => sum + (count ?? 0), 0),
        evaluatedTaskCount: groupEvaluatedTaskIds.get(group)?.size ?? 0,
        differingTaskCount: groupDifferingTaskIds.get(group)?.size ?? 0,
        possibleDefectTaskCount: classificationTaskIds?.get("possible engine defect")?.size ?? 0,
        approvedDifferenceTaskCount: classificationTaskIds?.get("approved semantic difference")?.size ?? 0,
        representationOnlyTaskCount: classificationTaskIds?.get("representation-only difference")?.size ?? 0,
        adapterLimitedTaskCount: classificationTaskIds?.get("adapter limitation")?.size ?? 0,
        countsByClassification,
      }];
    }),
  ) as Partial<Record<ShadowSemanticGroup, TaskStateShadowGroupSummary>>;
  const possibleEngineDefects = buildPossibleEngineDefects(perTask, input.options?.includeFullDefectDetails === true);
  const possibleDefectPatterns = buildPossibleDefectPatterns(unexpectedDifferences, perTask);
  return {
    timestamp,
    logicalDate,
    timezone: input.timezone,
    rolloverTime: input.rolloverTime,
    dateRange: { startDate, endDate },
    taskCountEvaluated: selectedTasks.length,
    taskCountSkipped: skippedTasks.fullySkippedTaskCount,
    adapterWarningCount,
    matchCount,
    classificationCounts,
    semanticGroupSummaries,
    possibleEngineDefectCount: possibleEngineDefects.length,
    possibleEngineDefects,
    possibleDefectPatterns,
    skippedTasks,
    mismatchCountByField,
    mismatchCountByTaskType,
    approvedSemanticDifferences,
    representationOnlyDifferences,
    adapterLimitations,
    legacyDataAnomalies,
    unexpectedDifferences,
    perTask,
    proposedHistoryRowCount,
    proposedTaskPatchKeys: [...patchKeys].sort(),
    totalExecutionTimeMs,
    slowestTaskTimeMs: Math.max(0, ...perTask.map((detail) => detail.durationMs)),
    safetyViolations,
  };
}
