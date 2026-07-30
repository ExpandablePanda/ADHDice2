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
  | "legacy value unavailable"
  | "adapter warning"
  | "possible engine defect"
  | "legacy-data anomaly";

export type TaskStateShadowOptions = {
  taskIds?: string[];
  startDate?: string;
  endDate?: string;
  includeMatches?: boolean;
  includeTitles?: boolean;
};

export type TaskStateShadowMismatch = {
  taskId: string;
  taskTitle?: string;
  field: string;
  currentSystemValue: unknown;
  engineValue: unknown;
  classification: ShadowClassification;
  reason: string;
};

export type TaskStateShadowTaskDetail = {
  taskId: string;
  taskTitle?: string;
  taskType: string;
  durationMs: number;
  adapterWarnings: LegacyAdapterIssue[];
  unsupportedLegacy: LegacyAdapterIssue[];
  comparisons: TaskStateShadowMismatch[];
  engine: {
    activeStatus: TaskStateEngineResult["activeStatus"];
    calendar: Record<string, TaskCalendarState>;
    continuousOverdue: TaskStateEngineResult["continuousOverdue"];
    handledCurrentDay: boolean;
    nextDueDate: string | null;
    proposedHistoryCount: number;
    proposedTaskPatchKeys: string[];
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
  mismatchCountByField: Record<string, number>;
  mismatchCountByTaskType: Record<string, number>;
  approvedSemanticDifferences: TaskStateShadowMismatch[];
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

function classifyDifference({
  adapterIssues,
  anomaly,
  engineValue,
  field,
  legacyValue,
  task,
  today,
}: {
  adapterIssues: LegacyAdapterIssue[];
  anomaly: boolean;
  engineValue: unknown;
  field: string;
  legacyValue: unknown;
  task: Task;
  today: string;
}): { classification: ShadowClassification; reason: string } {
  void adapterIssues;
  if (legacyValue === LEGACY_UNAVAILABLE) {
    return { classification: "legacy value unavailable", reason: "No current read-only derivation helper exposes this value." };
  }
  if (anomaly) {
    return { classification: "legacy-data anomaly", reason: "Multiple conflicting legacy outcomes exist for one logical date." };
  }
  if ((field === "currentCalendarState" || field.startsWith("calendar."))
    && legacyValue === "due" && engineValue === "open") {
    return {
      classification: "approved semantic difference",
      reason: "The 7.6 specification names the current virtual unresolved Calendar state Open; production uses Due.",
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
  if (field === "proposedHistoryChanges" && task.repeat_frequency !== "none") {
    return {
      classification: "approved semantic difference",
      reason: "The engine returns continuous-overdue logical-day proposals; production only derives scheduled missed dates.",
    };
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
  },
): TaskStateShadowMismatch {
  if (legacyValue !== LEGACY_UNAVAILABLE && equal(legacyValue, engineValue)) {
    return {
      taskId: task.id,
      ...(taskTitle ? { taskTitle } : {}),
      field,
      currentSystemValue: legacyValue,
      engineValue,
      classification: "match",
      reason: "Current derivation and Task State Engine agree.",
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
  });
  return {
    taskId: task.id,
    ...(taskTitle ? { taskTitle } : {}),
    field,
    currentSystemValue: legacyValue === LEGACY_UNAVAILABLE ? null : legacyValue,
    engineValue,
    ...classified,
  };
}

function proposedHistorySummary(rows: TaskStateEngineResult["proposedHistoryChanges"], startDate: string, endDate: string) {
  return rows
    .filter((change): change is Extract<typeof change, { type: "insert" }> => change.type === "insert")
    .filter((change) => change.row.logicalDate >= startDate && change.row.logicalDate <= endDate)
    .map((change) => `${change.row.logicalDate}:${change.row.outcome}`)
    .sort();
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
  const historyByTaskId = new Map<string, TaskHistory[]>();
  for (const row of input.history) {
    const rows = historyByTaskId.get(row.task_id) ?? [];
    rows.push(row);
    historyByTaskId.set(row.task_id, rows);
  }

  const mismatchCountByField: Record<string, number> = {};
  const mismatchCountByTaskType: Record<string, number> = {};
  const approvedSemanticDifferences: TaskStateShadowMismatch[] = [];
  const unexpectedDifferences: TaskStateShadowMismatch[] = [];
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
    enginePatchKeys.forEach((key) => patchKeys.add(key));
    safetyViolations.push(...inspectProposedTaskPatch(task.id, result.proposedTaskPatch, result.lifecycle));
    const includeTitle = input.options?.includeTitles === true ? task.title : undefined;
    const context = {
      adapterIssues: [...adapted.warnings, ...adapted.unsupported],
      anomaly: hasLegacyAnomaly(taskHistory),
      today: logicalDate,
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
      ...boundedDates.map((date) => comparison(
        task,
        includeTitle,
        `calendar.${date}`,
        legacyCalendarState(task, taskHistory, date, logicalDate, dueDates),
        result.calendar[date] ?? "no_entry",
        context,
      )),
      ...adapted.warnings.map((warning) => ({
        taskId: task.id,
        ...(includeTitle ? { taskTitle: includeTitle } : {}),
        field: `adapter.${warning.path}`,
        currentSystemValue: warning.value ?? null,
        engineValue: null,
        classification: "adapter warning" as const,
        reason: warning.message,
      })),
      ...adapted.unsupported.map((warning) => ({
        taskId: task.id,
        ...(includeTitle ? { taskTitle: includeTitle } : {}),
        field: `adapter.${warning.path}`,
        currentSystemValue: warning.value ?? null,
        engineValue: null,
        classification: "adapter warning" as const,
        reason: warning.message,
      })),
    ];
    for (const item of comparisons) {
      if (item.classification === "match") {
        matchCount += 1;
        continue;
      }
      if (item.classification === "approved semantic difference") approvedSemanticDifferences.push(item);
      if (item.classification === "possible engine defect" || item.classification === "legacy-data anomaly") {
        unexpectedDifferences.push(item);
      }
      if (item.classification !== "legacy value unavailable" && item.classification !== "adapter warning") {
        increment(mismatchCountByField, item.field);
        increment(mismatchCountByTaskType, taskType(task));
      }
    }
    perTask.push({
      taskId: task.id,
      ...(includeTitle ? { taskTitle: includeTitle } : {}),
      taskType: taskType(task),
      durationMs: Number((nowMs() - taskStartedAt).toFixed(3)),
      adapterWarnings: adapted.warnings,
      unsupportedLegacy: adapted.unsupported,
      comparisons: input.options?.includeMatches ? comparisons : comparisons.filter((item) => item.classification !== "match"),
      engine: {
        activeStatus: result.activeStatus,
        calendar: boundedCalendar,
        continuousOverdue: result.continuousOverdue,
        handledCurrentDay: result.handledCurrentDay,
        nextDueDate: result.nextDueDate,
        proposedHistoryCount: engineProposedHistory.length,
        proposedTaskPatchKeys: enginePatchKeys,
        recurrenceAnchor: result.recurrenceAnchor,
        rewardEligibility: result.rewardEligibility,
        satisfiedOccurrenceIdentity: result.satisfiedOccurrenceIdentity,
        streakDisposition: result.streakDisposition,
      },
    });
  }

  const totalExecutionTimeMs = Number((nowMs() - startedAt).toFixed(3));
  return {
    timestamp,
    logicalDate,
    timezone: input.timezone,
    rolloverTime: input.rolloverTime,
    dateRange: { startDate, endDate },
    taskCountEvaluated: selectedTasks.length,
    taskCountSkipped: input.tasks.length - selectedTasks.length,
    adapterWarningCount,
    matchCount,
    mismatchCountByField,
    mismatchCountByTaskType,
    approvedSemanticDifferences,
    unexpectedDifferences,
    perTask,
    proposedHistoryRowCount,
    proposedTaskPatchKeys: [...patchKeys].sort(),
    totalExecutionTimeMs,
    slowestTaskTimeMs: Math.max(0, ...perTask.map((detail) => detail.durationMs)),
    safetyViolations,
  };
}
