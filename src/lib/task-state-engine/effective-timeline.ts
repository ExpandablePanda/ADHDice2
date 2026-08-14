import {
  authoritativeRowsByDate,
  calendarStateForOutcome,
  dateRange,
  daysBetween,
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
  TaskCalendarOverride,
  TaskHistoryOutcome,
  TaskStateHistoryRow,
  TaskStateSnapshot,
  TaskWorkflowState,
  TaskTimelineCheckpoint,
  TaskTimelineReplayRequest,
} from "./types.ts";

export type BuildTaskEffectiveTimelineInput = {
  task: TaskStateSnapshot;
  history: TaskStateHistoryRow[];
  logicalDate: string;
  calendarStart: string;
  calendarEnd: string;
  calendarOverrides?: TaskCalendarOverride[];
  workflow?: TaskWorkflowState;
  replay?: TaskTimelineReplayRequest;
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

function checkpointForReplay(
  rows: TaskStateHistoryRow[],
  replay: TaskTimelineReplayRequest | undefined,
): TaskTimelineCheckpoint | null {
  if (!replay) return null;
  const includeChangedDate = replay.kind !== "outcome";
  const checkpoint = rows
    .filter((row) => SUCCESSFUL_OUTCOMES.has(row.outcome))
    .filter((row) => includeChangedDate
      ? row.logicalDate <= replay.changedLogicalDate
      : row.logicalDate < replay.changedLogicalDate)
    .sort((left, right) => left.logicalDate.localeCompare(right.logicalDate) || left.occurredAt.localeCompare(right.occurredAt))
    .at(-1);
  if (checkpoint) {
    return {
      kind: "success",
      logicalDate: checkpoint.logicalDate,
      occurrenceDueOn: checkpoint.occurrenceDueOn
        ?? occurrenceDateFromIdentity(checkpoint.occurrenceIdentity)
        ?? checkpoint.logicalDate,
    };
  }
  if (replay.manualDueOn !== undefined) {
    return { kind: "schedule_boundary", logicalDate: replay.changedLogicalDate, occurrenceDueOn: replay.manualDueOn };
  }
  return { kind: "task_snapshot", logicalDate: null, occurrenceDueOn: null };
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
    sourceKind: "calculated",
    handled: false,
    outcome: null,
    historyRowId: null,
    calendarOverrideId: null,
    workflowOccurrenceId: null,
    workflowCommandId: null,
    workflowRevision: null,
    occurrenceIdentity: hasOccurrence ? occurrenceIdentity(taskId, occurrenceDueOn as string) : null,
    occurrenceDueOn: hasOccurrence ? occurrenceDueOn : null,
    obligation,
  };
}

function explicitDay(row: TaskStateHistoryRow): TaskEffectiveTimelineDay {
  return {
    logicalDate: row.logicalDate,
    state: calendarStateForOutcome(row.outcome),
    sourceKind: "history_fact",
    handled: true,
    outcome: row.outcome,
    historyRowId: row.id,
    calendarOverrideId: null,
    workflowOccurrenceId: null,
    workflowCommandId: null,
    workflowRevision: null,
    occurrenceIdentity: row.occurrenceIdentity ?? null,
    occurrenceDueOn: row.occurrenceDueOn ?? null,
    obligation: "none",
  };
}

function workflowDay(
  logicalDate: string,
  baseDay: TaskEffectiveTimelineDay,
  workflow: TaskWorkflowState,
): TaskEffectiveTimelineDay {
  return {
    ...baseDay,
    logicalDate,
    state: "in_progress",
    sourceKind: "workflow",
    handled: false,
    outcome: null,
    historyRowId: null,
    calendarOverrideId: null,
    workflowOccurrenceId: workflow.occurrenceId ?? null,
    workflowCommandId: workflow.commandId ?? null,
    workflowRevision: workflow.revision ?? null,
  };
}

function calendarOverrideDay(
  taskId: string,
  logicalDate: string,
  override: TaskCalendarOverride,
  currentLogicalDate: string,
): TaskEffectiveTimelineDay {
  if (override.overrideState === "unscheduled") {
    return {
      ...calculatedDay(taskId, logicalDate, "no_entry", "none"),
      sourceKind: "calendar_override",
      calendarOverrideId: override.id,
    };
  }
  if (override.overrideState === "not_due") {
    return {
      ...calculatedDay(taskId, logicalDate, "not_due", "none"),
      sourceKind: "calendar_override",
      calendarOverrideId: override.id,
    };
  }
  const state = logicalDate < currentLogicalDate
    ? "missed"
    : logicalDate === currentLogicalDate
      ? "open"
      : "scheduled";
  return {
    ...calculatedDay(taskId, logicalDate, state, logicalDate < currentLogicalDate ? "overdue" : "due", logicalDate),
    sourceKind: "calendar_override",
    calendarOverrideId: override.id,
  };
}

function nextDueAfterCalendarCancellation(
  recurrence: TaskStateSnapshot["recurrence"],
  cancelledDueOn: string,
  consumed: Set<string>,
) {
  if (recurrence.kind === "none") return null;
  if (recurrence.kind === "rolling") {
    return shiftDateKey(cancelledDueOn, Math.max(1, recurrence.intervalDays));
  }
  return scheduledOccurrences(
    recurrence,
    cancelledDueOn,
    shiftDateKey(cancelledDueOn, 1),
    shiftDateKey(cancelledDueOn, 800),
  ).find((date) => !consumed.has(date)) ?? null;
}

function initialOccurrenceDueOn(
  task: TaskStateSnapshot,
  explicitRows: TaskStateHistoryRow[],
  replay: TaskTimelineReplayRequest | undefined,
  checkpoint: TaskTimelineCheckpoint | null,
) {
  if (replay && checkpoint?.kind === "success") return checkpoint.occurrenceDueOn;
  if (replay && replay.manualDueOn !== undefined) return replay.manualDueOn;
  if (replay?.kind === "outcome") {
    const changedSuccess = explicitRows.find((row) => (
      row.logicalDate === replay.changedLogicalDate && SUCCESSFUL_OUTCOMES.has(row.outcome)
    ));
    if (changedSuccess) {
      return changedSuccess.occurrenceDueOn
        ?? occurrenceDateFromIdentity(changedSuccess.occurrenceIdentity)
        ?? changedSuccess.logicalDate;
    }
  }
  return task.historicalScheduleAnchor
    ?? task.dueOn
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
  const overrideByDate = new Map(
    (input.calendarOverrides ?? []).map((override) => [override.logicalDate, override]),
  );
  const workflow = input.workflow
    ?? (input.task.activeStatus === "in_progress"
      ? { state: "in_progress" as const, logicalDate: input.task.activeStatusLogicalDate ?? null }
      : { state: "none" as const, logicalDate: null });
  const recurrenceRows = rows.filter((row) => row.recurrenceAuthoritative !== false);
  const recurrenceByDate = authoritativeRowsByDate(recurrenceRows);
  const recurrenceExplicitRows = [...recurrenceByDate.values()];
  const replayCheckpoint = checkpointForReplay(recurrenceExplicitRows, input.replay);
  const initialDueOn = initialOccurrenceDueOn(input.task, recurrenceExplicitRows, input.replay, replayCheckpoint);
  const simulationStart = earliestDate([
    input.calendarStart,
    input.logicalDate,
    initialDueOn,
    ...(input.calendarOverrides ?? []).map((override) => override.logicalDate),
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
    if (input.replay?.kind === "due_date"
      && input.replay.manualDueOn !== undefined
      && replayCheckpoint?.kind === "success"
      && row.logicalDate === replayCheckpoint.logicalDate) {
      activeDueOn = input.replay.manualDueOn;
    } else if (input.task.recurrence.kind === "none") {
      activeDueOn = null;
    } else {
      activeDueOn = result.nextDue;
    }
    if (successDueOn) consumed.add(successDueOn);
    if (result.satisfied) consumed.add(result.satisfied);
  };

  const applyCalendarOverrideToCursor = (date: string, override: TaskCalendarOverride) => {
    if (completed) return;
    if (override.overrideState === "due_open") {
      // An override cannot skip an already-active earlier obligation. When the
      // date is the next causal opportunity, it becomes the active occurrence
      // rather than a display-only Calendar fact.
      if (!activeDueOn || activeDueOn >= date) {
        activeDueOn = date;
        if (date < input.logicalDate) unresolvedDueOn ??= date;
      }
      return;
    }
    if (activeDueOn !== date) return;

    consumed.add(date);
    unresolvedDueOn = null;
    activeDueOn = nextDueAfterCalendarCancellation(input.task.recurrence, date, consumed);
  };

  const applyExplicitRow = (row: TaskStateHistoryRow) => {
    if (row.outcome === "complete") {
      completed = true;
      activeDueOn = null;
      unresolvedDueOn = null;
      return;
    }
    // Keep this guard for rows that predate the replay seed; normal reads now
    // seed from historicalScheduleAnchor, so a later current due cursor cannot
    // hide legitimate History that must advance the reconstructed timeline.
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
    const override = overrideByDate.get(date);
    const workflowApplies = workflow.state === "in_progress"
      && workflow.logicalDate === input.logicalDate
      && date === input.logicalDate;
    if (!row && !workflowApplies && override) {
      applyCalendarOverrideToCursor(date, override);
    }
    let day: TaskEffectiveTimelineDay;

    if (row) {
      day = explicitDay(row);
      if (recurrenceRow) applyExplicitRow(recurrenceRow);
    } else {
      let calculated: TaskEffectiveTimelineDay;
      if (historicalMissedDueOnByDate.has(date)) {
        calculated = calculatedDay(
          input.task.id,
          date,
          "missed",
          "overdue",
          historicalMissedDueOnByDate.get(date) ?? null,
        );
      } else if (completed || !activeDueOn) {
        calculated = calculatedDay(input.task.id, date, "no_entry", "none");
      } else if (date < activeDueOn) {
        calculated = calculatedDay(input.task.id, date, "not_due", "none");
      } else if (date < input.logicalDate) {
        unresolvedDueOn ??= activeDueOn;
        calculated = calculatedDay(input.task.id, date, "missed", "overdue", unresolvedDueOn);
      } else if (date === input.logicalDate) {
        if (activeDueOn < input.logicalDate) {
          unresolvedDueOn ??= activeDueOn;
          calculated = calculatedDay(input.task.id, date, "open", "overdue", unresolvedDueOn);
        } else if (activeDueOn === input.logicalDate) {
          calculated = calculatedDay(input.task.id, date, "open", "due", activeDueOn);
        } else {
          calculated = calculatedDay(input.task.id, date, "not_due", "none");
        }
      } else if (date === activeDueOn || isProjectedFutureOccurrence(date)) {
        calculated = calculatedDay(input.task.id, date, "scheduled", "due", date);
      } else {
        calculated = calculatedDay(input.task.id, date, "not_due", "none");
      }
      day = workflowApplies
        ? workflowDay(date, calculated, workflow)
        : override
          ? calendarOverrideDay(input.task.id, date, override, input.logicalDate)
          : calculated;
    }

    effectiveDays[date] = day;
    if (date === input.logicalDate) {
      currentUnresolvedDueOn = day.obligation === "overdue" ? unresolvedDueOn : null;
    }
  }

  for (const date of dateRange(input.calendarStart, input.calendarEnd)) {
    const day = effectiveDays[date];
    if (day) days[date] = day;
  }

  const currentDay = effectiveDays[input.logicalDate];
  const currentObligation = currentDay?.state === "open" || currentDay?.state === "in_progress"
    ? currentDay.obligation
    : "none";
  const streaks = computeTaskEffectiveTimelineStreaks(
    Object.fromEntries(Object.entries(effectiveDays).map(([date, day]) => [date, day.state])),
    input.logicalDate,
  );

  const activeStatus = (() => {
    if (input.task.lifecycle !== "active") return input.task.activeStatus;
    if (currentDay?.state === "done" || currentDay?.state === "did_my_best" || currentDay?.state === "complete") return currentDay.state;
    if (currentDay?.state === "in_progress") return "in_progress" as const;
    if (currentDay?.state === "missed" || currentDay?.obligation === "overdue") return "missed" as const;
    if (currentDay?.state === "delayed") return "delayed" as const;
    if (currentDay?.state === "scheduled") return daysBetween(input.logicalDate, currentDay.logicalDate) <= 7 ? "upcoming" as const : "not_due" as const;
    if (currentDay?.state === "not_due" || currentDay?.state === "no_entry") {
      if (!activeDueOn && input.task.recurrence.kind === "none") return "unscheduled" as const;
      return activeDueOn && activeDueOn > input.logicalDate && daysBetween(input.logicalDate, activeDueOn) <= 7
        ? "upcoming" as const
        : "not_due" as const;
    }
    return "pending" as const;
  })();

  return {
    days,
    activeStatus,
    activeOccurrenceDueOn: currentDay?.occurrenceDueOn ?? activeDueOn,
    currentCompletedStreak: streaks.currentCompletedStreak,
    currentMissedStreak: streaks.currentMissedStreak,
    currentObligation,
    nextDueOn: completed ? null : activeDueOn,
    recurrenceAnchor: replayCheckpoint?.kind === "success" ? replayCheckpoint.logicalDate : null,
    replayCheckpoint,
    unresolvedDueOn: currentUnresolvedDueOn,
  };
}
