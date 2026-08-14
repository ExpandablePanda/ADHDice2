import {
  authoritativeRowsByDate,
  calendarStateForOutcome,
  dateRange,
  shiftDateKey,
} from "./calendar.ts";
import {
  occurrenceIdentity,
  recurrenceAfterSuccess,
  scheduledOccurrences,
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

export type TaskEffectiveTimelineStreaks = {
  currentCompletedStreak: number;
  currentMissedStreak: number;
};

function classifyFinalizedCalendarState(state: string | undefined): "success" | "missed" | "break" | null {
  if (state === "done" || state === "did_my_best") return "success";
  if (state === "missed") return "missed";
  if (state === "complete" || state === "delayed") return "break";
  if (state === "open" || state === "in_progress" || state === "due" || state === "upcoming"
    || state === "scheduled" || state === "not_due" || state === "no_entry") return null;
  return "break";
}

/**
 * Calculate streaks from the resolved Calendar states, not from persisted rows.
 * Non-final Calendar states are intentionally skipped; finalized break states
 * terminate both streaks.
 */
export function computeTaskEffectiveTimelineStreaks(
  states: Record<string, string>,
  logicalDate: string,
): TaskEffectiveTimelineStreaks {
  let cursor: string | null = logicalDate;
  let streakKind: "success" | "missed" | null = null;
  let streakLength = 0;

  while (cursor && Object.hasOwn(states, cursor)) {
    const finalizedKind = classifyFinalizedCalendarState(states[cursor]);
    if (!finalizedKind) {
      cursor = shiftDateKey(cursor, -1);
      continue;
    }
    if (finalizedKind === "break") break;
    streakKind ??= finalizedKind;
    if (streakKind !== finalizedKind) break;
    streakLength += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  return {
    currentCompletedStreak: streakKind === "success" ? streakLength : 0,
    currentMissedStreak: streakKind === "missed" ? streakLength : 0,
  };
}

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
  return task.dueOn
    ?? task.activeOccurrenceDueOn
    ?? earliestDate(explicitRows.map((row) => row.occurrenceDueOn))
    ?? earliestDate(explicitRows.map((row) => occurrenceDateFromIdentity(row.occurrenceIdentity)))
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
  const recurrenceRows = rows.filter((row) => row.recurrenceAuthoritative !== false);
  const recurrenceByDate = authoritativeRowsByDate(recurrenceRows);
  const recurrenceExplicitRows = [...recurrenceByDate.values()];
  const initialDueOn = initialOccurrenceDueOn(input.task, recurrenceExplicitRows);
  const simulationStart = earliestDate([
    input.calendarStart,
    input.logicalDate,
    initialDueOn,
    ...recurrenceExplicitRows.flatMap((row) => [
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
  const historicalMissedDueOnByDate = new Map<string, string>();
  for (const row of recurrenceExplicitRows) {
    if (!SUCCESSFUL_OUTCOMES.has(row.outcome)) continue;
    const historicalOccurrenceDueOn = row.occurrenceDueOn
      ?? occurrenceDateFromIdentity(row.occurrenceIdentity);
    if (!historicalOccurrenceDueOn || historicalOccurrenceDueOn >= row.logicalDate) continue;
    for (const date of dateRange(historicalOccurrenceDueOn, shiftDateKey(row.logicalDate, -1))) {
      const existingDueOn = historicalMissedDueOnByDate.get(date);
      if (!existingDueOn || historicalOccurrenceDueOn < existingDueOn) {
        historicalMissedDueOnByDate.set(date, historicalOccurrenceDueOn);
      }
    }
  }

  let activeDueOn: string | null = initialDueOn;
  let unresolvedDueOn: string | null = null;
  let completed = input.task.lifecycle === "complete";
  const consumed = new Set<string>();

  const advanceAfterSuccess = (row: TaskStateHistoryRow) => {
    if (completed) return;
    const successDueOn = activeDueOn
      ?? row.occurrenceDueOn
      ?? occurrenceDateFromIdentity(row.occurrenceIdentity)
      ?? row.logicalDate;
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
    const predatesActiveCursor = Boolean(
      activeDueOn
      && row.logicalDate < activeDueOn,
    );
    if (predatesActiveCursor) return;
    if (row.outcome === "done" || row.outcome === "did_my_best") {
      advanceAfterSuccess(row);
      return;
    }
    if (row.outcome === "missed") {
      const missedDueOn = activeDueOn
        ?? row.occurrenceDueOn
        ?? occurrenceDateFromIdentity(row.occurrenceIdentity)
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

  const isProjectedFutureOccurrence = (date: string) => {
    if (!activeDueOn || date <= input.logicalDate) {
      return false;
    }

    return scheduledOccurrences(
      input.task.recurrence,
      activeDueOn,
      date,
      date,
    ).includes(date);
  };

  let currentUnresolvedDueOn: string | null = null;
  for (const date of simulationDates) {
    const row = explicitByDate.get(date);
    const recurrenceRow = recurrenceByDate.get(date);
    let day: TaskEffectiveTimelineDay;

    if (row) {
      day = explicitDay(row);
      if (recurrenceRow) applyExplicitRow(recurrenceRow);
    } else if (historicalMissedDueOnByDate.has(date)) {
      day = calculatedDay(
        input.task.id,
        date,
        "missed",
        "overdue",
        historicalMissedDueOnByDate.get(date) ?? null,
      );
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
    } else if (date === activeDueOn || isProjectedFutureOccurrence(date)) {
      day = calculatedDay(
        input.task.id,
        date,
        "scheduled",
        "due",
        date,
      );
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
  const streaks = computeTaskEffectiveTimelineStreaks(
    Object.fromEntries(Object.entries(effectiveDays).map(([date, day]) => [date, day.state])),
    input.logicalDate,
  );

  return {
    days,
    currentCompletedStreak: streaks.currentCompletedStreak,
    currentMissedStreak: streaks.currentMissedStreak,
    currentObligation,
    unresolvedDueOn: currentUnresolvedDueOn,
  };
}
