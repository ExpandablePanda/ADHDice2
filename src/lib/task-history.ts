import type { Task, TaskHistory as DbTaskHistory, TaskStatus } from "@/lib/database.types";
import { shiftDateKey } from "@/lib/task-grid-layout";
import { calcNextDueDateFromDate, isDailyCadenceRepeatFrequency, resolveRecurringLiveStatusFromNextDueDate } from "@/lib/task-repeat";
import { shouldExposeHistoryEventTimestamp } from "@/lib/task-history-cutover";
import { isScheduledOccurrence, scheduledOccurrences } from "@/lib/task-state-engine/recurrence";
import type { TaskCalendarOverride, TaskEffectiveTimelineDay, TaskRecurrence } from "@/lib/task-state-engine/types";

export type TaskHistoryLoadResult =
  | { status: "ready"; history: DbTaskHistory[]; error: null }
  | { status: "error"; history: null; error: string };

export type TaskHistoryLoadMap = Record<string, TaskHistoryLoadResult>;

export function isTaskCompletedForHistory(status: TaskStatus) {
  return status === "done" || status === "did_my_best" || status === "complete";
}

export function isTaskHistoryStreakSuccessStatus(status: TaskStatus) {
  return status === "done" || status === "did_my_best";
}

export function isTaskHistoryStreakMissedStatus(status: TaskStatus) {
  return status === "missed";
}

export function isTaskHistoryStatus(status: TaskStatus) {
  return status === "done" || status === "did_my_best" || status === "delayed" || status === "missed" || status === "complete";
}

const FINALIZED_TASK_HISTORY_STATES = new Set<TaskStatus>(["done", "did_my_best", "delayed", "missed", "complete"]);
type FinalizedTaskHistoryStatus = Extract<TaskStatus, "done" | "did_my_best" | "delayed" | "missed" | "complete">;

function isFinalizedTaskHistoryStatus(status: TaskStatus): status is FinalizedTaskHistoryStatus {
  return FINALIZED_TASK_HISTORY_STATES.has(status);
}

export type TaskHistoryRowProjection = {
  calendarOverride: TaskCalendarOverride | null;
  entry: DbTaskHistory | null;
  isCalculated: boolean;
  isDueOpportunity: boolean;
  logicalDate: string;
  status: FinalizedTaskHistoryStatus | "not_due";
};

/** Merge explicit History, active manual Calendar overrides, and finalized Effective Timeline days. */
export function buildTaskHistoryRowProjections(
  history: readonly DbTaskHistory[],
  effectiveDays: Readonly<Record<string, Pick<TaskEffectiveTimelineDay, "state" | "obligation">>> = {},
  dueDateKeys: ReadonlySet<string> = new Set(),
  calendarOverrides: readonly TaskCalendarOverride[] = [],
): TaskHistoryRowProjection[] {
  const normalizedHistory = deduplicateTaskHistoryByLogicalDate(history);
  const rowsByDate = new Map<string, TaskHistoryRowProjection>();

  for (const entry of normalizedHistory) {
    if (!isFinalizedTaskHistoryStatus(entry.status)) continue;
    const day = effectiveDays[entry.entry_date];
    rowsByDate.set(entry.entry_date, {
      calendarOverride: null,
      entry,
      isCalculated: false,
      isDueOpportunity: dueDateKeys.has(entry.entry_date) || day?.obligation === "due" || day?.obligation === "overdue",
      logicalDate: entry.entry_date,
      status: entry.status,
    });
  }

  for (const override of calendarOverrides) {
    if (override.overrideState !== "not_due" || rowsByDate.has(override.logicalDate)) continue;
    rowsByDate.set(override.logicalDate, {
      calendarOverride: override,
      entry: null,
      isCalculated: false,
      isDueOpportunity: false,
      logicalDate: override.logicalDate,
      status: "not_due",
    });
  }

  for (const [logicalDate, day] of Object.entries(effectiveDays)) {
    if (rowsByDate.has(logicalDate) || day.state !== "missed") continue;
    rowsByDate.set(logicalDate, {
      calendarOverride: null,
      entry: null,
      isCalculated: true,
      isDueOpportunity: true,
      logicalDate,
      status: "missed",
    });
  }

  return [...rowsByDate.values()].sort((left, right) => right.logicalDate.localeCompare(left.logicalDate));
}

export type TaskHistoryStats = {
  bestStreak: number;
  completedDays: number;
  completionRate: number;
  currentStreak: number;
  doneRate: number;
  loggedDays: number;
  missedDays: number;
  missedStreak: number;
};

export const TASK_HISTORY_WINDOW_PRESETS = ["1", "3", "7", "14", "30"] as const;
export const TASK_HISTORY_STREAK_PRESETS = ["0", "1", "3", "7", "14", "30"] as const;

export type TaskHistoryWindowPreset = typeof TASK_HISTORY_WINDOW_PRESETS[number];
export type TaskHistoryStreakPreset = typeof TASK_HISTORY_STREAK_PRESETS[number];

export type TaskHistoryFacts = {
  handledToday: boolean;
  lastDone: TaskHistoryLastDone | null;
  completedToday: boolean;
  completedWithinLast: Record<TaskHistoryWindowPreset, boolean>;
  currentCompletedStreak: number;
  currentMissedStreak: number;
  hasEverCompleted: boolean;
  hasEverMissed: boolean;
  lastCompletedWithinLast: Record<TaskHistoryWindowPreset, boolean>;
  lastMissedWithinLast: Record<TaskHistoryWindowPreset, boolean>;
  missedToday: boolean;
  missedWithinLast: Record<TaskHistoryWindowPreset, boolean>;
};

export type TaskHistoryLastDone = {
  dateKey: string;
  timestamp: string | null;
};

export type TaskHistoryLastHandled = TaskHistoryLastDone;

export const TASK_HISTORY_COLUMNS = "id,task_id,user_id,entry_date,occurrence_key,occurrence_due_on,status,event_type,counted_as_due_occurrence,was_completed,created_at,updated_at";

export type TaskHistoryStreakEntry = Pick<
  DbTaskHistory,
  "id"
  | "task_id"
  | "entry_date"
  | "occurrence_key"
  | "occurrence_due_on"
  | "status"
  | "event_type"
  | "counted_as_due_occurrence"
  | "was_completed"
  | "created_at"
  | "updated_at"
  | "canonical_provenance_kind"
  | "recurrence_authoritative"
>;

type TaskHistoryIdentityEntry = Pick<DbTaskHistory, "id" | "task_id" | "entry_date" | "created_at" | "updated_at">
  & Pick<DbTaskHistory, "canonical_fact_id">;

export function getTaskHistoryLogicalIdentity(entry: Pick<DbTaskHistory, "task_id" | "entry_date">) {
  return `${entry.task_id}:${entry.entry_date}`;
}

function compareHistoryRowFreshness(left: TaskHistoryIdentityEntry, right: TaskHistoryIdentityEntry) {
  const leftIsCanonical = Boolean(left.canonical_fact_id);
  const rightIsCanonical = Boolean(right.canonical_fact_id);
  if (leftIsCanonical !== rightIsCanonical) {
    return leftIsCanonical ? 1 : -1;
  }
  const leftTimestamp = getHistoryTimestamp(left);
  const rightTimestamp = getHistoryTimestamp(right);
  if (leftTimestamp !== rightTimestamp) {
    if (!leftTimestamp) return -1;
    if (!rightTimestamp) return 1;
    return leftTimestamp < rightTimestamp ? -1 : 1;
  }
  return left.id.localeCompare(right.id);
}

export function deduplicateTaskHistoryByLogicalDate<T extends TaskHistoryIdentityEntry>(history: readonly T[]) {
  const byLogicalDate = new Map<string, T>();
  for (const entry of history) {
    const identity = getTaskHistoryLogicalIdentity(entry);
    const existing = byLogicalDate.get(identity);
    if (!existing || compareHistoryRowFreshness(existing, entry) <= 0) {
      byLogicalDate.set(identity, entry);
    }
  }
  return [...byLogicalDate.values()];
}

/**
 * Build the History read model used by active status and task surfaces.
 *
 * Once a task-scoped load exists, it is authoritative for that task. The
 * workspace-wide snapshot may still be an older critical-facts payload while
 * the scoped mutation reconciliation is already current; concatenating both
 * lets a stale row win the active-status evaluation after deduplication.
 */
export function buildTaskHistoryByTaskId(
  workspaceHistory: readonly DbTaskHistory[],
  taskScopedHistoryByTaskId: Record<string, DbTaskHistory[]>,
) {
  const taskIds = new Set([
    ...workspaceHistory.map((entry) => entry.task_id),
    ...Object.keys(taskScopedHistoryByTaskId),
  ]);
  return Object.fromEntries([...taskIds].map((taskId) => [
    taskId,
    Object.hasOwn(taskScopedHistoryByTaskId, taskId)
      ? deduplicateTaskHistoryByLogicalDate(taskScopedHistoryByTaskId[taskId] ?? [])
      : deduplicateTaskHistoryByLogicalDate(workspaceHistory.filter((entry) => entry.task_id === taskId)),
  ]));
}

export function mapTaskHistoryRow(row: DbTaskHistory) {
  return row;
}

export function buildManualTaskHistoryOverrideOccurrenceMetadata(
  task: Pick<Task, "id" | "repeat_frequency"> | null | undefined,
  entryDate: string,
  existingEntry?: Pick<DbTaskHistory, "occurrence_due_on" | "occurrence_key"> | null,
) {
  if (existingEntry) {
    return {
      occurrence_due_on: existingEntry.occurrence_due_on,
      occurrence_key: existingEntry.occurrence_key,
    };
  }

  if (!task || task.repeat_frequency === "none") {
    return {
      occurrence_due_on: null,
      occurrence_key: null,
    };
  }

  return {
    occurrence_due_on: entryDate,
    occurrence_key: `task:${task.id}:occurrence:${entryDate}`,
  };
}

export function isPermanentCompleteHistoryEntry(entry: Pick<DbTaskHistory, "event_type" | "status">) {
  return entry.status === "complete" && entry.event_type === "completed_permanently";
}

export function formatTaskHistoryEntryLabel(entry: Pick<DbTaskHistory, "event_type" | "status">) {
  if (isPermanentCompleteHistoryEntry(entry)) {
    return "Marked Complete";
  }

  if (entry.status === "did_my_best") {
    return "Did My Best";
  }

  if (entry.status === "missed") {
    return "Missed";
  }

  if (entry.status === "done") {
    return "Done";
  }

  if (entry.status === "complete") {
    return "Complete";
  }

  return entry.status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export type TaskHistoryCalendarVirtualState = "delayed" | "due" | "not_due";

export function getTaskHistoryCalendarVirtualState({
  hasHistoryEntry,
  isDue,
}: {
  dateKey: string;
  delayedUntilDateKey?: string | null;
  hasHistoryEntry: boolean;
  isDue: boolean;
  nextDueDateKey: string | null;
  projectsUndatedDelayed?: boolean;
  todayDateKey: string;
}): TaskHistoryCalendarVirtualState | null {
  if (hasHistoryEntry) {
    return null;
  }
  if (isDue) {
    return "due";
  }
  return "not_due";
}

function createHistoryWindowFlags(initialValue = false): Record<TaskHistoryWindowPreset, boolean> {
  return {
    "1": initialValue,
    "3": initialValue,
    "7": initialValue,
    "14": initialValue,
    "30": initialValue,
  };
}

export function buildEmptyTaskHistoryFacts(): TaskHistoryFacts {
  return {
    handledToday: false,
    lastDone: null,
    completedToday: false,
    completedWithinLast: createHistoryWindowFlags(),
    currentCompletedStreak: 0,
    currentMissedStreak: 0,
    hasEverCompleted: false,
    hasEverMissed: false,
    lastCompletedWithinLast: createHistoryWindowFlags(),
    lastMissedWithinLast: createHistoryWindowFlags(),
    missedToday: false,
    missedWithinLast: createHistoryWindowFlags(),
  };
}

function isLastDoneHistoryEntry(entry: Pick<DbTaskHistory, "status">) {
  return entry.status === "done" || entry.status === "did_my_best";
}

function isLastHandledHistoryEntry(entry: Pick<DbTaskHistory, "status">) {
  return entry.status === "done"
    || entry.status === "did_my_best"
    || entry.status === "delayed"
    || entry.status === "missed"
    || entry.status === "complete";
}

function isHandledTodayHistoryEntry(entry: Pick<DbTaskHistory, "status">) {
  return entry.status === "done" || entry.status === "did_my_best" || entry.status === "missed";
}

function getHistoryTimestamp(entry: Pick<DbTaskHistory, "created_at" | "entry_date" | "updated_at">) {
  return entry.updated_at || entry.created_at || null;
}

function getHistoryPresentationTimestamp(
  entry: Pick<DbTaskHistory, "created_at" | "entry_date" | "updated_at" | "canonical_provenance_kind">,
) {
  return shouldExposeHistoryEventTimestamp(entry) ? getHistoryTimestamp(entry) : null;
}

function compareLatestOutcomeEntries(left: TaskHistoryStreakEntry, right: TaskHistoryStreakEntry) {
  const dateOrder = compareDateKeys(left.entry_date, right.entry_date);
  if (dateOrder !== 0) {
    return dateOrder;
  }

  const leftTimestamp = getHistoryPresentationTimestamp(left);
  const rightTimestamp = getHistoryPresentationTimestamp(right);
  if (leftTimestamp !== rightTimestamp) {
    if (!leftTimestamp) {
      return -1;
    }
    if (!rightTimestamp) {
      return 1;
    }
    return leftTimestamp < rightTimestamp ? -1 : 1;
  }

  return left.id.localeCompare(right.id);
}

function getTimestampDateKey(timestamp: string | null) {
  return timestamp?.slice(0, 10) ?? null;
}

function getLatestOutcomePresentationTimestamp(
  entry: TaskHistoryStreakEntry,
  currentLogicalDateKey?: string,
) {
  const timestamp = getHistoryPresentationTimestamp(entry);
  if (!timestamp || !currentLogicalDateKey || entry.entry_date >= currentLogicalDateKey) {
    return timestamp;
  }

  const timestampDateKey = getTimestampDateKey(timestamp);
  return timestampDateKey === entry.entry_date
    ? timestamp
    // Keep the semantic time in the History surface's logical day rather than
    // shifting midnight through the user's local timezone from a UTC suffix.
    : `${entry.entry_date}T00:00:00`;
}

function getLatestTaskHistoryOutcome(
  history: readonly TaskHistoryStreakEntry[],
  qualifies: (entry: Pick<DbTaskHistory, "status">) => boolean,
  currentLogicalDateKey?: string,
): TaskHistoryLastDone | null {
  const latestEntry = deduplicateTaskHistoryByLogicalDate(history)
    .filter(qualifies)
    .sort(compareLatestOutcomeEntries)
    .at(-1);

  return latestEntry
    ? {
      dateKey: latestEntry.entry_date,
      timestamp: getLatestOutcomePresentationTimestamp(latestEntry, currentLogicalDateKey),
    }
    : null;
}

export function getTaskHistoryLastDone(
  history: readonly TaskHistoryStreakEntry[],
  currentLogicalDateKey?: string,
): TaskHistoryLastDone | null {
  return getLatestTaskHistoryOutcome(history, isLastDoneHistoryEntry, currentLogicalDateKey);
}

export function getTaskHistoryLastHandled(
  history: readonly TaskHistoryStreakEntry[],
  currentLogicalDateKey?: string,
): TaskHistoryLastHandled | null {
  return getLatestTaskHistoryOutcome(history, isLastHandledHistoryEntry, currentLogicalDateKey);
}

export function isTaskHandledOnDate(history: DbTaskHistory[], dateKey: string) {
  return history.some((entry) => entry.entry_date === dateKey && isHandledTodayHistoryEntry(entry));
}

export function isTaskMissedOnDate(history: DbTaskHistory[], dateKey: string) {
  return history.some((entry) => entry.entry_date === dateKey && entry.status === "missed");
}

export const FOCUS_HANDLED_HISTORY_STATUSES = ["done", "did_my_best", "missed"] as const;
export type FocusHandledHistoryStatus = typeof FOCUS_HANDLED_HISTORY_STATUSES[number];

function compareHistoryEntriesByTimestamp(left: DbTaskHistory, right: DbTaskHistory) {
  const leftTimestamp = getHistoryTimestamp(left) ?? `${left.entry_date}T00:00:00.000Z`;
  const rightTimestamp = getHistoryTimestamp(right) ?? `${right.entry_date}T00:00:00.000Z`;
  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp < rightTimestamp ? -1 : 1;
  }
  return left.id.localeCompare(right.id);
}

export function getLatestTaskHistoryEntryOnDate(history: DbTaskHistory[], dateKey: string) {
  return history
    .filter((entry) => entry.entry_date === dateKey)
    .sort(compareHistoryEntriesByTimestamp)
    .at(-1) ?? null;
}

export function getTaskHandledHistoryStatusOnDate(history: DbTaskHistory[], dateKey: string): FocusHandledHistoryStatus | null {
  const latestEntry = getLatestTaskHistoryEntryOnDate(history, dateKey);
  if (!latestEntry) {
    return null;
  }
  return FOCUS_HANDLED_HISTORY_STATUSES.includes(latestEntry.status as FocusHandledHistoryStatus)
    ? latestEntry.status as FocusHandledHistoryStatus
    : null;
}

export function getTaskCurrentFocusOccurrenceDateKey(
  task: Pick<Task, "due_on" | "repeat_frequency">,
  todayDateKey: string,
) {
  if (!task.due_on || task.due_on > todayDateKey) {
    return todayDateKey;
  }
  if (task.repeat_frequency === "none") {
    return todayDateKey;
  }
  return task.due_on;
}

export function getTaskFocusFilterFacts(task: Pick<Task, "due_on" | "repeat_frequency">, history: DbTaskHistory[], todayDateKey: string) {
  const currentOccurrenceDateKey = getTaskCurrentFocusOccurrenceDateKey(task, todayDateKey);
  const currentOccurrenceStatus = getTaskHandledHistoryStatusOnDate(history, currentOccurrenceDateKey);
  const todayStatus = currentOccurrenceDateKey === todayDateKey
    ? currentOccurrenceStatus
    : getTaskHandledHistoryStatusOnDate(history, todayDateKey);
  const isCurrentOccurrenceToday = currentOccurrenceDateKey === todayDateKey;

  return {
    currentOccurrenceDateKey,
    currentOccurrenceStatus,
    handledToday: isCurrentOccurrenceToday ? currentOccurrenceStatus !== null : todayStatus !== null,
    missedToday: currentOccurrenceStatus === "missed" || todayStatus === "missed",
    todayStatus,
  };
}

type TaskHistoryLiveStatusContext = {
  currentDayKey: string;
  dayStartTime: string;
  now: Date;
  timezone: string;
};

type TaskHistoryLiveStatusOptions = {
  calcNextDueDateFromDate?: (task: Task, referenceDateKey: string) => string | null;
  editedHistoryDateKeys?: string[];
};

function getSortedHistoryThroughDay(history: DbTaskHistory[], currentDayKey: string) {
  return history
    .filter((entry) => entry.entry_date <= currentDayKey)
    .sort((left, right) => compareDateKeys(left.entry_date, right.entry_date));
}

function isResolvingRecurringHistoryStatus(status: TaskStatus | undefined) {
  return status === "done" || status === "did_my_best";
}

/** Reconciles a History Calendar completion from its edited canonical occurrence. */
function resolveCalendarRecurringActiveOccurrence(
  task: Task,
  history: DbTaskHistory[],
  context: TaskHistoryLiveStatusContext,
  options: TaskHistoryLiveStatusOptions,
): { completedAt: null; dueOn: string; status: TaskStatus } | null {
  if (task.repeat_frequency === "none") {
    return null;
  }

  const editedHistoryDateKeys = options.editedHistoryDateKeys ?? [context.currentDayKey];
  const historyByDate = new Map(history.map((entry) => [entry.entry_date, entry]));
  const completionEntry = editedHistoryDateKeys
    .filter((dateKey) => dateKey <= context.currentDayKey && isResolvingRecurringHistoryStatus(historyByDate.get(dateKey)?.status))
    .sort()
    .map((dateKey) => historyByDate.get(dateKey)!)
    .at(-1);
  if (!completionEntry) {
    return null;
  }

  const canonicalOccurrenceDueOn = completionEntry.occurrence_due_on ?? completionEntry.entry_date;
  const currentCursor = task.active_occurrence_due_on ?? task.due_on;
  const occurrenceAlreadyResolved = Boolean(completionEntry.occurrence_key) && history.some((entry) => (
    entry.id !== completionEntry.id
    && entry.occurrence_key === completionEntry.occurrence_key
    && isResolvingRecurringHistoryStatus(entry.status)
  ));
  // Calendar edits may be backdated. A successful edit may amend historical
  // facts, but it must never re-finalize a canonical occurrence that the live
  // recurrence cursor has already passed.
  if (occurrenceAlreadyResolved || (currentCursor && canonicalOccurrenceDueOn < currentCursor)) {
    return null;
  }

  const calculateNextDueDate = options.calcNextDueDateFromDate ?? calcNextDueDateFromDate;
  const nextDueDate = calculateNextDueDate(task, canonicalOccurrenceDueOn);
  if (!nextDueDate || (currentCursor && nextDueDate <= currentCursor)) {
    return null;
  }

  return {
    completedAt: null,
    dueOn: nextDueDate,
    status: nextDueDate < context.currentDayKey
      ? "missed"
      : resolveRecurringLiveStatusFromNextDueDate(task, {
        currentDayKey: context.currentDayKey,
        dayStartTime: context.dayStartTime,
        nextDueDate,
        now: context.now,
        timezone: context.timezone,
      }),
  };
}

export function resolveLiveTaskStatusFromHistory(
  task: Task,
  history: DbTaskHistory[],
  {
    currentDayKey,
    dayStartTime,
    now,
    timezone,
  }: TaskHistoryLiveStatusContext,
  options: TaskHistoryLiveStatusOptions = {},
): { completedAt: string | null; dueOn?: string | null; status: TaskStatus } {
  const calendarReconciliation = resolveCalendarRecurringActiveOccurrence(task, history, {
    currentDayKey,
    dayStartTime,
    now,
    timezone,
  }, options);
  if (calendarReconciliation) {
    return calendarReconciliation;
  }

  if (task.status === "delayed" && task.due_on && task.due_on > currentDayKey) {
    return {
      completedAt: null,
      status: "delayed",
    };
  }

  const sortedHistory = getSortedHistoryThroughDay(history, currentDayKey);
  const latestEntry = sortedHistory.at(-1) ?? null;

  if (task.repeat_frequency !== "none" && task.due_on && task.due_on > currentDayKey) {
    return {
      completedAt: null,
      status: resolveRecurringLiveStatusFromNextDueDate(task, {
        currentDayKey,
        dayStartTime,
        nextDueDate: task.due_on,
        now,
        timezone,
      }),
    };
  }

  if (latestEntry?.status === "missed") {
    return {
      completedAt: null,
      status: "missed",
    };
  }

  if (latestEntry?.status === "complete") {
    return {
      completedAt: task.completed_at ?? now.toISOString(),
      status: "complete",
    };
  }

  if (task.repeat_frequency === "none") {
    if (latestEntry?.status === "done" || latestEntry?.status === "did_my_best") {
      return {
        completedAt: task.completed_at ?? now.toISOString(),
        status: latestEntry.status,
      };
    }

    return {
      completedAt: null,
      status: "pending",
    };
  }

  if (!task.due_on) {
    return {
      completedAt: null,
      status: "pending",
    };
  }

  return {
    completedAt: null,
    status: resolveRecurringLiveStatusFromNextDueDate(task, {
      currentDayKey,
      dayStartTime,
      nextDueDate: task.due_on,
      now,
      timezone,
    }),
  };
}

export function computeTaskHistoryStats(history: DbTaskHistory[], todayDateKey: string): TaskHistoryStats {
  const boundedHistory = history.filter((entry) => entry.entry_date <= todayDateKey);
  const byDate = boundedHistory.reduce<Map<string, { completed: boolean }>>((accumulator, entry) => {
    const existing = accumulator.get(entry.entry_date);
    accumulator.set(entry.entry_date, {
      completed: (existing?.completed ?? false) || entry.was_completed,
    });
    return accumulator;
  }, new Map());

  const loggedDates = [...byDate.keys()].sort();
  const loggedDateSet = new Set(loggedDates);
  const completedDates = loggedDates.filter((date) => byDate.get(date)?.completed);
  const loggedDays = loggedDates.length;
  const completedDays = completedDates.length;
  const missedDays = loggedDays - completedDays;
  const completionRate = loggedDays === 0 ? 0 : Math.round((completedDays / loggedDays) * 100);
  const doneRate = completionRate;
  const latestLoggedDate = loggedDates.at(-1) ?? null;
  const currentStreakStart = byDate.has(todayDateKey) ? todayDateKey : latestLoggedDate;

  let currentStreak = 0;
  let cursor = currentStreakStart;
  while (cursor && loggedDateSet.has(cursor) && byDate.get(cursor)?.completed) {
    currentStreak += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  let bestStreak = 0;
  let runningStreak = 0;
  let previousDate: string | null = null;
  for (const date of completedDates) {
    if (!previousDate) {
      runningStreak = 1;
    } else {
      runningStreak = shiftDateKey(previousDate, 1) === date ? runningStreak + 1 : 1;
    }
    bestStreak = Math.max(bestStreak, runningStreak);
    previousDate = date;
  }

  let missedStreak = 0;
  let missedCursor = byDate.has(todayDateKey)
    ? todayDateKey
    : latestLoggedDate;
  while (missedCursor && loggedDateSet.has(missedCursor) && !byDate.get(missedCursor)?.completed) {
    missedStreak += 1;
    missedCursor = shiftDateKey(missedCursor, -1);
  }

  return {
    bestStreak,
    completedDays,
    completionRate,
    currentStreak,
    doneRate,
    loggedDays,
    missedDays,
    missedStreak,
  };
}

export function buildTaskHistoryFacts(history: DbTaskHistory[], todayDateKey: string): TaskHistoryFacts {
  const boundedHistory = history
    .filter((entry) => entry.entry_date <= todayDateKey)
    .sort((left, right) => {
      const dateOrder = compareDateKeys(left.entry_date, right.entry_date);
      if (dateOrder !== 0) {
        return dateOrder;
      }
      const leftTimestamp = left.updated_at || left.created_at;
      const rightTimestamp = right.updated_at || right.created_at;
      if (leftTimestamp === rightTimestamp) {
        return left.id.localeCompare(right.id);
      }
      return leftTimestamp < rightTimestamp ? -1 : 1;
    });
  if (boundedHistory.length === 0) {
    return buildEmptyTaskHistoryFacts();
  }

  const byDate = boundedHistory.reduce<Map<string, {
    completed: boolean;
    latestStatus: "completed" | "missed";
    latestTimestamp: string;
    missed: boolean;
  }>>((accumulator, entry) => {
    const existing = accumulator.get(entry.entry_date);
    const entryStatus = entry.status === "missed" ? "missed" : "completed";
    const entryTimestamp = entry.updated_at || entry.created_at;
    accumulator.set(entry.entry_date, {
      completed: (existing?.completed ?? false) || entry.was_completed,
      latestStatus: !existing || entryTimestamp >= existing.latestTimestamp ? entryStatus : existing.latestStatus,
      latestTimestamp: !existing || entryTimestamp >= existing.latestTimestamp ? entryTimestamp : existing.latestTimestamp,
      missed: (existing?.missed ?? false) || entry.status === "missed",
    });
    return accumulator;
  }, new Map());

  const loggedDates = [...byDate.keys()].sort();
  const latestLoggedDate = loggedDates.at(-1) ?? null;
  const completedDates = loggedDates.filter((date) => byDate.get(date)?.completed);
  const missedDates = loggedDates.filter((date) => byDate.get(date)?.missed);
  const lastCompletedDate = completedDates.at(-1) ?? null;
  const lastMissedDate = missedDates.at(-1) ?? null;
  const currentCompletedStreakStart = byDate.has(todayDateKey) ? todayDateKey : latestLoggedDate;
  const currentMissedStreakStart = byDate.has(todayDateKey) ? todayDateKey : latestLoggedDate;

  let currentCompletedStreak = 0;
  let completedCursor = currentCompletedStreakStart;
  while (completedCursor && byDate.get(completedCursor)?.latestStatus === "completed") {
    currentCompletedStreak += 1;
    completedCursor = shiftDateKey(completedCursor, -1);
  }

  let currentMissedStreak = 0;
  let missedCursor = currentMissedStreakStart;
  while (missedCursor && byDate.get(missedCursor)?.latestStatus === "missed") {
    currentMissedStreak += 1;
    missedCursor = shiftDateKey(missedCursor, -1);
  }

  const completedWithinLast = createHistoryWindowFlags();
  const missedWithinLast = createHistoryWindowFlags();
  const lastCompletedWithinLast = createHistoryWindowFlags();
  const lastMissedWithinLast = createHistoryWindowFlags();

  for (const preset of TASK_HISTORY_WINDOW_PRESETS) {
    const dayCount = Number.parseInt(preset, 10);
    completedWithinLast[preset] = completedDates.some((date) => isWithinLastWindow(date, todayDateKey, dayCount));
    missedWithinLast[preset] = missedDates.some((date) => isWithinLastWindow(date, todayDateKey, dayCount));
    lastCompletedWithinLast[preset] = lastCompletedDate ? isWithinLastWindow(lastCompletedDate, todayDateKey, dayCount) : false;
    lastMissedWithinLast[preset] = lastMissedDate ? isWithinLastWindow(lastMissedDate, todayDateKey, dayCount) : false;
  }

  return {
    handledToday: byDate.get(todayDateKey)?.completed === true || byDate.get(todayDateKey)?.missed === true,
    lastDone: getTaskHistoryLastDone(history, todayDateKey),
    completedToday: byDate.get(todayDateKey)?.completed ?? false,
    completedWithinLast,
    currentCompletedStreak,
    currentMissedStreak,
    hasEverCompleted: completedDates.length > 0,
    hasEverMissed: missedDates.length > 0,
    lastCompletedWithinLast,
    lastMissedWithinLast,
    missedToday: byDate.get(todayDateKey)?.missed ?? false,
    missedWithinLast,
  };
}

function compareDateKeys(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function toDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`);
}

function daysBetween(startDateKey: string, endDateKey: string) {
  const diff = toDate(endDateKey).getTime() - toDate(startDateKey).getTime();
  return Math.round(diff / 86_400_000);
}

function isWithinLastWindow(dateKey: string, todayDateKey: string, dayCount: number) {
  const distance = daysBetween(dateKey, todayDateKey);
  return distance >= 0 && distance < dayCount;
}

function fixedRecurrenceForTask(task: Task): Extract<TaskRecurrence, { kind: "weekly" | "monthly" }> | null {
  const interval = Math.max(1, task.repeat_interval ?? 1);
  if (task.repeat_frequency === "weekly") {
    return {
      kind: "weekly",
      intervalWeeks: interval,
      weekdays: task.repeat_days_of_week ?? [],
      anchorDate: task.due_on,
    };
  }
  if (task.repeat_frequency === "monthly") {
    return {
      kind: "monthly",
      intervalMonths: interval,
      mode: task.repeat_monthly_mode === "ordinal_weekday" ? "ordinal_weekday" : "day_of_month",
      dayOfMonth: task.repeat_day_of_month,
      ordinal: task.repeat_monthly_ordinal,
      weekday: task.repeat_monthly_weekday,
      anchorDate: task.due_on,
    };
  }
  return null;
}

function isFixedTaskDueOnDate(task: Task, dateKey: string, includeBeforeDueOn: boolean) {
  if (!task.due_on) return false;
  const recurrence = fixedRecurrenceForTask(task);
  return recurrence
    ? isScheduledOccurrence(recurrence, task.due_on, dateKey, { includeBeforeDueOn })
    : false;
}

/** Resolves a History action to the fixed or rolling occurrence it can satisfy. */
export function resolveTaskHistoryOccurrenceDueOn(task: Task, dateKey: string) {
  if (!task.due_on || task.repeat_frequency === "none") {
    return null;
  }

  const recurrence = fixedRecurrenceForTask(task);
  if (!recurrence) {
    return task.due_on;
  }

  return scheduledOccurrences(
    recurrence,
    task.due_on,
    dateKey,
    shiftDateKey(dateKey, 800),
    { includeBeforeDueOn: true },
  ).find((candidate) => candidate >= dateKey) ?? null;
}

export function isTaskDueOnDate(task: Task, dateKey: string) {
  const anchorDateKey = task.due_on;
  if (!anchorDateKey) {
    return false;
  }

  if (compareDateKeys(dateKey, anchorDateKey) < 0) {
    return false;
  }

  if (task.repeat_frequency === "none") {
    return dateKey === anchorDateKey;
  }

  const interval = Math.max(1, task.repeat_interval ?? 1);

  if (isDailyCadenceRepeatFrequency(task.repeat_frequency)) {
    const distance = daysBetween(anchorDateKey, dateKey);
    return ((distance % interval) + interval) % interval === 0;
  }

  if (task.repeat_frequency === "weekly") {
    return isFixedTaskDueOnDate(task, dateKey, false);
  }

  if (task.repeat_frequency === "monthly") {
    return isFixedTaskDueOnDate(task, dateKey, false);
  }

  return false;
}

function isHistoricalRecurringDueDate(task: Task, dateKey: string) {
  const anchorDateKey = task.due_on;
  if (!anchorDateKey || task.repeat_frequency === "none") {
    return false;
  }

  const interval = Math.max(1, task.repeat_interval ?? 1);

  if (isDailyCadenceRepeatFrequency(task.repeat_frequency)) {
    const distance = daysBetween(anchorDateKey, dateKey);
    return ((distance % interval) + interval) % interval === 0;
  }

  return isFixedTaskDueOnDate(task, dateKey, true);
}

function isResolvingRecurringHistoryEntry(entry: DbTaskHistory | undefined) {
  return entry?.status === "done" || entry?.status === "did_my_best" || entry?.status === "complete";
}

/**
 * Returns only missing scheduled occurrences after a manually saved Missed
 * entry. Existing history is preserved, and the first later completion is the
 * exclusive boundary so recurrence can rebase from that completion.
 */
export function buildMissingScheduledMissedHistoryDateKeys(
  task: Task,
  history: DbTaskHistory[],
  missedDateKey: string,
  currentDayKey: string,
) {
  if (task.repeat_frequency === "none" || missedDateKey >= currentDayKey) {
    return [] as string[];
  }

  const historyByDate = new Map(history.map((entry) => [entry.entry_date, entry]));
  const resolvingBoundary = history
    .filter((entry) => entry.entry_date > missedDateKey && isResolvingRecurringHistoryEntry(entry))
    .map((entry) => entry.entry_date)
    .sort()
    .at(0);
  const endExclusive = resolvingBoundary ?? currentDayKey;
  const missingDates: string[] = [];
  let cursor = shiftDateKey(missedDateKey, 1);
  while (cursor < endExclusive) {
    if (isHistoricalRecurringDueDate(task, cursor) && !historyByDate.has(cursor)) {
      missingDates.push(cursor);
    }
    cursor = shiftDateKey(cursor, 1);
  }
  return missingDates;
}

export function buildTaskDueDateSet(task: Task, startDateKey: string, endDateKey: string, history: DbTaskHistory[] = []) {
  const dueDates = new Set<string>();
  if (!task.due_on) {
    return dueDates;
  }

  let cursor = startDateKey;
  while (compareDateKeys(cursor, endDateKey) <= 0) {
    const isHistoricalFixedDueDate = (task.repeat_frequency === "weekly" || task.repeat_frequency === "monthly")
      && isHistoricalRecurringDueDate(task, cursor);
    if (isTaskDueOnDate(task, cursor) || isHistoricalFixedDueDate) {
      dueDates.add(cursor);
    }
    cursor = shiftDateKey(cursor, 1);
  }

  if (task.repeat_frequency !== "none") {
    for (const entry of history) {
      if (compareDateKeys(entry.entry_date, startDateKey) < 0 || compareDateKeys(entry.entry_date, endDateKey) > 0) {
        continue;
      }
      if (isHistoricalRecurringDueDate(task, entry.entry_date)) {
        dueDates.add(entry.entry_date);
      }
    }
  }

  return dueDates;
}

function isUnresolvedTaskStatus(status: TaskStatus) {
  return status === "pending"
    || status === "in_progress"
    || status === "delayed"
    || status === "missed"
    || status === "upcoming"
    || status === "not_due";
}

export function buildTaskHistoryCalendarDueDateSet(
  task: Task,
  startDateKey: string,
  endDateKey: string,
  todayDateKey: string,
  history: DbTaskHistory[] = [],
) {
  const dueDates = buildTaskDueDateSet(task, startDateKey, endDateKey, history);
  if (
    task.repeat_frequency !== "none"
    || !task.due_on
    || task.due_on > todayDateKey
    || !isUnresolvedTaskStatus(task.status)
  ) {
    return dueDates;
  }

  let cursor = compareDateKeys(task.due_on, startDateKey) > 0 ? task.due_on : startDateKey;
  const lastOpportunityDate = compareDateKeys(todayDateKey, endDateKey) < 0 ? todayDateKey : endDateKey;
  while (compareDateKeys(cursor, lastOpportunityDate) <= 0) {
    dueDates.add(cursor);
    cursor = shiftDateKey(cursor, 1);
  }
  return dueDates;
}

export function buildOverdueTaskMissedDateKeys(task: Task, currentDayKey: string) {
  if (!task.due_on || task.due_on >= currentDayKey || !isUnresolvedTaskStatus(task.status)) {
    return [] as string[];
  }

  if (task.repeat_frequency === "none") {
    const missedDates: string[] = [];
    let cursor = task.due_on;
    const lastMissedDate = shiftDateKey(currentDayKey, -1);
    while (compareDateKeys(cursor, lastMissedDate) <= 0) {
      missedDates.push(cursor);
      cursor = shiftDateKey(cursor, 1);
    }
    return missedDates;
  }

  return [...buildTaskDueDateSet(task, task.due_on, shiftDateKey(currentDayKey, -1))].sort();
}

export function computeTaskSpecificHistoryStats(
  task: Task,
  history: readonly TaskHistoryStreakEntry[],
  todayDateKey: string,
  startDateKey = shiftDateKey(todayDateKey, -139),
): TaskHistoryStats & { dueDays: number } {
  void task;
  void todayDateKey;
  void startDateKey;

  const sortedHistory = deduplicateTaskHistoryByLogicalDate(history)
    .sort((left, right) => compareDateKeys(left.entry_date, right.entry_date));
  const completedDays = sortedHistory.filter((entry) => entry.was_completed).length;
  const missedDays = sortedHistory.filter((entry) => !entry.was_completed).length;
  const loggedDays = sortedHistory.length;
  let missedStreak = 0;
  for (let index = sortedHistory.length - 1; index >= 0; index -= 1) {
    if (!sortedHistory[index] || !isTaskHistoryStreakMissedStatus(sortedHistory[index].status)) {
      break;
    }
    missedStreak += 1;
  }

  let currentStreak = 0;
  for (let index = sortedHistory.length - 1; index >= 0; index -= 1) {
    if (!sortedHistory[index] || !isTaskHistoryStreakSuccessStatus(sortedHistory[index].status)) {
      break;
    }
    currentStreak += 1;
  }

  let bestStreak = 0;
  let runningCompleted = 0;
  for (const entry of sortedHistory) {
    if (isTaskHistoryStreakSuccessStatus(entry.status)) {
      runningCompleted += 1;
      bestStreak = Math.max(bestStreak, runningCompleted);
    } else {
      runningCompleted = 0;
    }
  }

  const dueDays = loggedDays;
  const completionRate = dueDays === 0 ? 0 : Math.round((completedDays / dueDays) * 100);
  return {
    bestStreak,
    completedDays,
    completionRate,
    currentStreak,
    doneRate: completionRate,
    dueDays,
    loggedDays,
    missedDays,
    missedStreak,
  };
}
