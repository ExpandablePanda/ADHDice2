import {
  authoritativeRowsByDate,
  calendarStateForOutcome,
  dateRange,
  shiftDateKey,
} from "./calendar.ts";
import {
  isScheduledOccurrence,
  occurrenceIdentity,
  recurrenceAfterSuccess,
} from "./recurrence.ts";
import type {
  TaskEffectiveTimeline,
  TaskEffectiveTimelineDay,
  TaskEffectiveTimelineObligation,
  TaskHistoryOutcome,
  TaskStateHistoryRow,
  TaskStateSnapshot,
} from "./types.ts";

export type BuildTaskEffectiveTimelineInput = {
  task: TaskStateSnapshot;
  history: TaskStateHistoryRow[];
  logicalDate: string;
  calendarStart: string;
  calendarEnd: string;
};

const SUCCESSFUL_OUTCOMES = new Set<TaskHistoryOutcome>(["done", "did_my_best", "complete"]);

function occurrenceDateFromIdentity(identity: string | null | undefined) {
  const date = identity?.match(/(\d{4}-\d{2}-\d{2})$/)?.[1] ?? null;
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function earliestDate(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;
}

function calculatedDay(
  taskId: string,
  logicalDate: string,
  state: TaskEffectiveTimelineDay["state"],
  obligation: TaskEffectiveTimelineObligation,
  occurrenceDueOn: string | null = null,
): TaskEffectiveTimelineDay {
  const hasOccurrence = Boolean(occurrenceDueOn)
    && (state === "missed" || state === "open" || state === "scheduled");
  return {
    logicalDate,
    state,
    origin: "calculated",
    handled: false,
    outcome: null,
    historyRowId: null,
    occurrenceIdentity: hasOccurrence ? occurrenceIdentity(taskId, occurrenceDueOn as string) : null,
    occurrenceDueOn: hasOccurrence ? occurrenceDueOn : null,
    obligation,
  };
}

function explicitDay(row: TaskStateHistoryRow): TaskEffectiveTimelineDay {
  return {
    logicalDate: row.logicalDate,
    state: calendarStateForOutcome(row.outcome),
    origin: "explicit_history",
    handled: true,
    outcome: row.outcome,
    historyRowId: row.id,
    occurrenceIdentity: row.occurrenceIdentity ?? null,
    occurrenceDueOn: row.occurrenceDueOn ?? null,
    obligation: "none",
  };
}

function initialOccurrenceDueOn(
  task: TaskStateSnapshot,
  explicitRows: TaskStateHistoryRow[],
) {
  return earliestDate(explicitRows.map((row) => row.occurrenceDueOn))
    ?? earliestDate(explicitRows.map((row) => occurrenceDateFromIdentity(row.occurrenceIdentity)))
    ?? task.dueOn
    ?? (task.recurrence.kind !== "none"
      ? earliestDate(explicitRows
        .filter((row) => SUCCESSFUL_OUTCOMES.has(row.outcome))
        .map((row) => row.logicalDate))
      : null);
}

export function buildTaskEffectiveTimeline(
  input: BuildTaskEffectiveTimelineInput,
): TaskEffectiveTimeline {
  const rows = input.history
    .filter((row) => row.taskId === input.task.id)
    .map((row) => ({ ...row }));
  const explicitByDate = authoritativeRowsByDate(rows);
  const explicitRows = [...explicitByDate.values()];
  const initialDueOn = initialOccurrenceDueOn(input.task, explicitRows);
  const simulationStart = earliestDate([
    input.calendarStart,
    input.logicalDate,
    initialDueOn,
    ...explicitRows.flatMap((row) => [
      row.logicalDate,
      row.occurrenceDueOn,
      occurrenceDateFromIdentity(row.occurrenceIdentity),
    ]),
  ]) ?? input.calendarStart;
  const simulationEnd = input.calendarEnd >= input.logicalDate
    ? input.calendarEnd
    : input.logicalDate;
  const simulationDates = dateRange(simulationStart, simulationEnd);
  const days: Record<string, TaskEffectiveTimelineDay> = {};
  const effectiveDays: Record<string, TaskEffectiveTimelineDay> = {};

  let activeDueOn = initialDueOn;
  let unresolvedDueOn: string | null = null;
  let completed = input.task.lifecycle === "complete";
  const consumed = new Set<string>();

  const advanceAfterSuccess = (row: TaskStateHistoryRow) => {
    if (completed) return;
    const successDueOn = row.occurrenceDueOn
      ?? occurrenceDateFromIdentity(row.occurrenceIdentity)
      ?? activeDueOn;
    const result = recurrenceAfterSuccess(input.task.recurrence, successDueOn, row.logicalDate, consumed);
    unresolvedDueOn = null;
    if (input.task.recurrence.kind === "none") {
      activeDueOn = null;
    } else {
      activeDueOn = result.nextDue;
    }
    if (successDueOn) consumed.add(successDueOn);
    if (result.satisfied) consumed.add(result.satisfied);
  };

  const applyExplicitRow = (row: TaskStateHistoryRow) => {
    if (row.outcome === "complete") {
      completed = true;
      activeDueOn = null;
      unresolvedDueOn = null;
      return;
    }
    if (row.outcome === "done" || row.outcome === "did_my_best") {
      advanceAfterSuccess(row);
      return;
    }
    if (row.outcome === "missed") {
      const missedDueOn = row.occurrenceDueOn
        ?? occurrenceDateFromIdentity(row.occurrenceIdentity)
        ?? activeDueOn
        ?? row.logicalDate;
      unresolvedDueOn = missedDueOn;
      activeDueOn = missedDueOn;
      return;
    }
    if (row.outcome === "delayed") {
      if (input.task.dueOn && input.task.dueOn > row.logicalDate
        && (!activeDueOn || activeDueOn <= row.logicalDate)) {
        activeDueOn = input.task.dueOn;
      }
    }
  };

  const fixedFutureOccurrence = (date: string) => (
    activeDueOn
    && date > input.logicalDate
    && (input.task.recurrence.kind === "weekly" || input.task.recurrence.kind === "monthly")
    && isScheduledOccurrence(input.task.recurrence, activeDueOn, date)
  );

  let currentUnresolvedDueOn: string | null = null;
  for (const date of simulationDates) {
    const row = explicitByDate.get(date);
    let day: TaskEffectiveTimelineDay;

    if (row) {
      day = explicitDay(row);
      applyExplicitRow(row);
    } else if (completed) {
      day = calculatedDay(input.task.id, date, "no_entry", "none");
    } else if (!activeDueOn) {
      day = calculatedDay(input.task.id, date, "no_entry", "none");
    } else if (date < activeDueOn) {
      day = calculatedDay(input.task.id, date, "not_due", "none");
    } else if (date < input.logicalDate) {
      unresolvedDueOn ??= activeDueOn;
      day = calculatedDay(input.task.id, date, "missed", "overdue", unresolvedDueOn);
    } else if (date === input.logicalDate) {
      if (activeDueOn < input.logicalDate) {
        unresolvedDueOn ??= activeDueOn;
        day = calculatedDay(input.task.id, date, "open", "overdue", unresolvedDueOn);
      } else if (activeDueOn === input.logicalDate) {
        day = calculatedDay(input.task.id, date, "open", "due", activeDueOn);
      } else {
        day = calculatedDay(input.task.id, date, "not_due", "none");
      }
    } else if (date === activeDueOn || fixedFutureOccurrence(date)) {
      day = calculatedDay(input.task.id, date, "scheduled", "due", date);
    } else {
      day = calculatedDay(input.task.id, date, "not_due", "none");
    }

    effectiveDays[date] = day;
    if (date === input.logicalDate) currentUnresolvedDueOn = unresolvedDueOn;
  }

  for (const date of dateRange(input.calendarStart, input.calendarEnd)) {
    const day = effectiveDays[date];
    if (day) days[date] = day;
  }

  const currentDay = effectiveDays[input.logicalDate];
  const currentObligation = currentDay?.state === "open" ? currentDay.obligation : "none";
  let streakStart = currentDay?.state === "missed"
    ? input.logicalDate
    : shiftDateKey(input.logicalDate, -1);
  let currentMissedStreak = 0;
  while (effectiveDays[streakStart]?.state === "missed") {
    currentMissedStreak += 1;
    streakStart = shiftDateKey(streakStart, -1);
  }

  return {
    days,
    currentMissedStreak,
    currentObligation,
    unresolvedDueOn: currentUnresolvedDueOn,
  };
}
