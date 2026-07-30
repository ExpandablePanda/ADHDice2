import type { Task, TaskHistory, TaskStatus, TaskUpdate } from "@/lib/database.types";
import { shiftDateKey } from "@/lib/task-grid-layout";
import { calcNextDueDateFromDate } from "@/lib/task-repeat";

const DERIVED_MISSED_OCCURRENCE_PREFIX = "derived-missed:";

export function buildDerivedMissedOccurrenceKey(anchorDateKey: string) {
  return `${DERIVED_MISSED_OCCURRENCE_PREFIX}${anchorDateKey}`;
}

export function isDerivedMissedHistoryEntry(entry: Pick<TaskHistory, "occurrence_key" | "status">) {
  return entry.status === "missed"
    && entry.occurrence_key?.startsWith(DERIVED_MISSED_OCCURRENCE_PREFIX) === true;
}

export type ChronologicalTaskHistoryReconciliation = {
  generatedMissedDateKeys: string[];
  nextDueOn: string | null;
  terminalCompleteEntry: TaskHistory | null;
};

export type TaskRolloverResolution = {
  dateKey: string;
  nextDueOn: string | null;
  status: "did_my_best";
};

export type TaskStatusAuthority = {
  activeStatus: TaskStatus;
  calendarOccurrenceStatus: TaskStatus | "not_due" | "upcoming";
  continuousOverdue: boolean;
  currentDayHistoryEntry: TaskHistory | null;
  dueOn: string | null;
  finished: boolean;
  generatedMissedDateKeys: string[];
  handledCurrentDay: boolean;
  nextDueAfterSuccess: string | null;
  open: boolean;
  overdue: boolean;
  recurrenceAnchor: string | null;
  reconciliation: ChronologicalTaskHistoryReconciliation;
  rolloverResolution: TaskRolloverResolution | null;
};

function compareDateKeys(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareHistoryEntries(left: TaskHistory, right: TaskHistory) {
  const dateOrder = compareDateKeys(left.entry_date, right.entry_date);
  if (dateOrder !== 0) return dateOrder;
  const leftTimestamp = left.updated_at || left.created_at;
  const rightTimestamp = right.updated_at || right.created_at;
  if (leftTimestamp === rightTimestamp) return left.id.localeCompare(right.id);
  return leftTimestamp < rightTimestamp ? -1 : 1;
}

function getLatestHistoryEntryOnDate(history: TaskHistory[], dateKey: string) {
  return history
    .filter((entry) => entry.entry_date === dateKey)
    .sort(compareHistoryEntries)
    .at(-1) ?? null;
}

function isSuccessfulStatus(status: TaskStatus | undefined) {
  return status === "done" || status === "did_my_best";
}

function isUnresolvedStatus(status: TaskStatus) {
  return status === "pending"
    || status === "in_progress"
    || status === "delayed"
    || status === "missed"
    || status === "upcoming"
    || status === "not_due";
}

function isHistoryEntryForOccurrence(entry: TaskHistory, occurrenceDateKey: string) {
  return entry.occurrence_due_on === occurrenceDateKey
    || entry.occurrence_key === `occurrence:${occurrenceDateKey}`;
}

function createExpectedInProgressRolloverEntry(task: Task, dateKey: string): TaskHistory {
  return {
    counted_as_due_occurrence: true,
    created_at: `${dateKey}T23:59:59.999Z`,
    entry_date: dateKey,
    event_type: "status",
    id: `virtual-in-progress-rollover:${task.id}:${dateKey}`,
    occurrence_due_on: task.active_occurrence_due_on ?? task.due_on,
    occurrence_key: `occurrence:${task.active_occurrence_due_on ?? task.due_on ?? dateKey}`,
    status: "did_my_best",
    task_id: task.id,
    updated_at: `${dateKey}T23:59:59.999Z`,
    user_id: task.user_id,
    was_completed: true,
  };
}

function withExpectedInProgressRollover(
  task: Task,
  history: TaskHistory[],
  currentDayKey: string,
) {
  const rolloverDateKey = task.status === "in_progress"
    && task.active_status_logical_date
    && task.active_status_logical_date < currentDayKey
    ? task.active_status_logical_date
    : null;
  const savedRolloverEntry = rolloverDateKey
    ? getLatestHistoryEntryOnDate(history, rolloverDateKey)
    : null;
  if (
    !rolloverDateKey
    || savedRolloverEntry?.status === "done"
    || savedRolloverEntry?.status === "did_my_best"
    || savedRolloverEntry?.status === "complete"
  ) {
    return { history, rolloverDateKey };
  }
  return {
    history: [...history, createExpectedInProgressRolloverEntry(task, rolloverDateKey)],
    rolloverDateKey,
  };
}

/**
 * Replays one authoritative task timeline. Explicit History wins. After an
 * unresolved due boundary passes, every completed logical day is Missed until
 * success; success rebases recurrence from its actual logical action date.
 */
export function reconcileChronologicalTaskHistory(
  task: Task,
  history: TaskHistory[],
  currentDayKey: string,
  options: {
    anchorDateKey?: string | null;
    calcNextDueDateFromDate?: (task: Task, referenceDateKey: string) => string | null;
  } = {},
): ChronologicalTaskHistoryReconciliation {
  const storedAnchorDateKey = task.active_occurrence_due_on ?? task.due_on;
  const latestSuccessDateKey = history
    .filter((entry) => entry.entry_date <= currentDayKey && (
      isSuccessfulStatus(entry.status) || entry.status === "complete"
    ))
    .map((entry) => entry.entry_date)
    .sort()
    .at(-1) ?? null;
  const inferredMissedAnchor = isUnresolvedStatus(task.status)
    && (!storedAnchorDateKey || storedAnchorDateKey <= currentDayKey)
    ? history
      .filter((entry) => (
        entry.status === "missed"
        && entry.entry_date <= currentDayKey
        && (!latestSuccessDateKey || entry.entry_date > latestSuccessDateKey)
      ))
      .map((entry) => entry.entry_date)
      .sort()
      .at(0) ?? null
    : null;
  const anchorDateKey = options.anchorDateKey
    ?? (
      storedAnchorDateKey && inferredMissedAnchor
        ? (storedAnchorDateKey < inferredMissedAnchor ? storedAnchorDateKey : inferredMissedAnchor)
        : storedAnchorDateKey ?? inferredMissedAnchor
    );
  if (!anchorDateKey) {
    return { generatedMissedDateKeys: [], nextDueOn: task.due_on, terminalCompleteEntry: null };
  }

  const calculateNextDueDate = options.calcNextDueDateFromDate ?? calcNextDueDateFromDate;
  const relevantHistory = history
    .filter((entry) => entry.entry_date <= currentDayKey)
    .sort(compareHistoryEntries);
  const historyByDate = new Map<string, TaskHistory>();
  for (const entry of relevantHistory) {
    historyByDate.set(entry.entry_date, entry);
  }
  const boundaries = relevantHistory.filter((entry) => (
    entry.status === "complete" || isSuccessfulStatus(entry.status)
  ) && (
    entry.entry_date >= anchorDateKey || isHistoryEntryForOccurrence(entry, anchorDateKey)
  ));
  const generatedMissedDateKeys: string[] = [];
  let cursor: string | null = anchorDateKey;

  const fillContinuousOverdueBefore = (endExclusive: string) => {
    let historyDateKey = cursor;
    while (historyDateKey && historyDateKey < endExclusive && historyDateKey < currentDayKey) {
      const savedEntry = historyByDate.get(historyDateKey);
      if (savedEntry?.status === "complete") return savedEntry;
      if (!savedEntry) generatedMissedDateKeys.push(historyDateKey);
      historyDateKey = shiftDateKey(historyDateKey, 1);
    }
    return null;
  };

  for (const boundary of boundaries) {
    if (!cursor) break;
    const terminalEntry = fillContinuousOverdueBefore(boundary.entry_date);
    if (terminalEntry) {
      return { generatedMissedDateKeys, nextDueOn: null, terminalCompleteEntry: terminalEntry };
    }
    if (boundary.status === "complete") {
      return { generatedMissedDateKeys, nextDueOn: null, terminalCompleteEntry: boundary };
    }
    cursor = task.repeat_frequency === "none"
      ? null
      : calculateNextDueDate(task, boundary.entry_date);
  }

  const terminalEntry = cursor ? fillContinuousOverdueBefore(currentDayKey) : null;
  return terminalEntry
    ? { generatedMissedDateKeys, nextDueOn: null, terminalCompleteEntry: terminalEntry }
    : { generatedMissedDateKeys, nextDueOn: cursor, terminalCompleteEntry: null };
}

function isHandledStatus(status: TaskStatus | undefined) {
  return status === "done"
    || status === "did_my_best"
    || status === "missed"
    || status === "complete";
}

function daysBetween(startDateKey: string, endDateKey: string) {
  const start = new Date(`${startDateKey}T12:00:00`).getTime();
  const end = new Date(`${endDateKey}T12:00:00`).getTime();
  return Math.round((end - start) / 86_400_000);
}

function getDateRelativeOpenStatus(dateKey: string, currentDayKey: string): TaskStatus {
  if (dateKey <= currentDayKey) return "pending";
  return daysBetween(currentDayKey, dateKey) <= 7 ? "upcoming" : "not_due";
}

export function deriveTaskStatusAuthority(
  task: Task,
  history: TaskHistory[],
  currentDayKey: string,
  options: {
    anchorDateKey?: string | null;
    calcNextDueDateFromDate?: (task: Task, referenceDateKey: string) => string | null;
  } = {},
): TaskStatusAuthority {
  const expectedRollover = withExpectedInProgressRollover(task, history, currentDayKey);
  const authorityHistory = expectedRollover.history;
  const requestedAnchor = options.anchorDateKey ?? task.active_occurrence_due_on ?? task.due_on;
  const reconciliation = reconcileChronologicalTaskHistory(task, authorityHistory, currentDayKey, options);
  const recurrenceAnchor = reconciliation.nextDueOn ?? requestedAnchor;
  const currentDayHistoryEntry = getLatestHistoryEntryOnDate(authorityHistory, currentDayKey);
  const latestSuccess = authorityHistory
    .filter((entry) => entry.entry_date <= currentDayKey && isSuccessfulStatus(entry.status))
    .sort(compareHistoryEntries)
    .at(-1) ?? null;
  const nextDueAfterSuccess = latestSuccess && task.repeat_frequency !== "none"
    ? (options.calcNextDueDateFromDate ?? calcNextDueDateFromDate)(task, latestSuccess.entry_date)
    : null;
  const storedComplete = task.status === "complete";
  const dueOn = reconciliation.terminalCompleteEntry || storedComplete ? null : reconciliation.nextDueOn;
  const continuousOverdue = Boolean(
    dueOn
    && (
      dueOn < currentDayKey
      || (task.status === "missed" && dueOn <= currentDayKey && !latestSuccess)
    )
    && !reconciliation.terminalCompleteEntry,
  );
  const validInProgress = task.status === "in_progress"
    && (!task.active_status_logical_date || task.active_status_logical_date >= currentDayKey);

  let activeStatus: TaskStatus;
  if (task.status === "archived" || task.status === "trashed") {
    activeStatus = task.status;
  } else if (reconciliation.terminalCompleteEntry || storedComplete) {
    activeStatus = "complete";
  } else if (validInProgress) {
    activeStatus = "in_progress";
  } else if (currentDayHistoryEntry?.status === "missed" || continuousOverdue) {
    activeStatus = "missed";
  } else if (task.repeat_frequency === "none" && latestSuccess) {
    activeStatus = latestSuccess.status;
  } else if (task.status === "delayed" && (!task.due_on || task.due_on > currentDayKey)) {
    activeStatus = "delayed";
  } else if (dueOn) {
    activeStatus = getDateRelativeOpenStatus(dueOn, currentDayKey);
  } else if (expectedRollover.rolloverDateKey) {
    activeStatus = "did_my_best";
  } else {
    activeStatus = task.status;
  }

  const handledCurrentDay = isHandledStatus(currentDayHistoryEntry?.status);
  const calendarOccurrenceStatus = currentDayHistoryEntry?.status
    ?? (continuousOverdue || dueOn === currentDayKey
      ? "pending"
      : dueOn
        ? getDateRelativeOpenStatus(dueOn, currentDayKey)
        : "not_due");
  const finished = activeStatus === "done" || activeStatus === "did_my_best" || activeStatus === "complete";
  const open = activeStatus === "pending"
    || activeStatus === "in_progress"
    || activeStatus === "delayed"
    || activeStatus === "missed"
    || activeStatus === "upcoming"
    || activeStatus === "not_due";
  const rolloverResolution = expectedRollover.rolloverDateKey
    ? {
      dateKey: expectedRollover.rolloverDateKey,
      nextDueOn: task.repeat_frequency === "none"
        ? null
        : (options.calcNextDueDateFromDate ?? calcNextDueDateFromDate)(task, expectedRollover.rolloverDateKey),
      status: "did_my_best" as const,
    }
    : null;

  return {
    activeStatus,
    calendarOccurrenceStatus,
    continuousOverdue,
    currentDayHistoryEntry,
    dueOn,
    finished,
    generatedMissedDateKeys: reconciliation.generatedMissedDateKeys,
    handledCurrentDay,
    nextDueAfterSuccess,
    open,
    overdue: continuousOverdue,
    recurrenceAnchor,
    reconciliation,
    rolloverResolution,
  };
}

export function applyTaskActiveStatusTracking(
  task: Pick<Task, "active_occurrence_due_on" | "active_status_logical_date" | "due_on" | "status">,
  values: TaskUpdate,
  currentDayKey: string,
): TaskUpdate {
  const nextStatus = values.status ?? task.status;

  if (task.status !== "in_progress" && nextStatus === "in_progress") {
    return {
      ...values,
      active_occurrence_due_on: values.due_on !== undefined ? values.due_on : task.due_on,
      active_status_logical_date: currentDayKey,
    };
  }

  if (task.status === "in_progress" && nextStatus !== "in_progress") {
    return {
      ...values,
      active_occurrence_due_on: null,
      active_status_logical_date: null,
    };
  }

  return values;
}
