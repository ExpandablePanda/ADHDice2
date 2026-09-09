import {
  authoritativeRowsByDate,
  calendarStateForOutcome,
  dateRange,
  daysBetween,
  shiftDateKey,
} from "./calendar.ts";
import {
  isScheduledOccurrence,
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
import {
  resolveTaskBehaviorPolicy,
  resolveTaskBehaviorPolicyForLogicalDate,
  STANDARD_TASK_BEHAVIOR_POLICY,
  type TaskBehaviorPolicy,
  type TaskBehaviorPolicyRevision,
} from "./behavior-policy.ts";

export type BuildTaskEffectiveTimelineInput = {
  behaviorPolicy?: TaskBehaviorPolicy;
  behaviorPolicyRevisions?: TaskBehaviorPolicyRevision[];
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
  longestMissedStreak: number;
};

export type TaskEffectiveTimelineStreakDay = {
  calendarOverrideId: string | null;
  state: TaskEffectiveTimelineDay["state"] | "due" | "upcoming";
  behaviorPolicy?: TaskBehaviorPolicy;
  unhandled?: boolean;
};

export function taskEffectiveTimelineDaysFromStates(
  states: Readonly<Record<string, string>>,
): Record<string, TaskEffectiveTimelineStreakDay> {
  return Object.fromEntries(Object.entries(states).map(([logicalDate, state]) => [logicalDate, {
    calendarOverrideId: null,
    state: state as TaskEffectiveTimelineStreakDay["state"],
    behaviorPolicy: STANDARD_TASK_BEHAVIOR_POLICY,
    unhandled: false,
  }]));
}

function isIgnoredUnhandled(day: TaskEffectiveTimelineStreakDay) {
  return day.unhandled === true && day.behaviorPolicy?.missedStreakOnUnhandled === "ignore";
}

function isPreservedPositiveUnhandled(day: TaskEffectiveTimelineStreakDay) {
  return day.unhandled === true && day.behaviorPolicy?.positiveStreakOnUnhandled === "preserve";
}

function classifyFinalizedCalendarDay(day: TaskEffectiveTimelineStreakDay | undefined): "success" | "missed" | "break" | "neutral" | null {
  if (!day) return null;
  const { state } = day;
  if (state === "done" || state === "did_my_best") return "success";
  if (state === "missed" || state === "unhandled_blank") return "missed";
  if (state === "complete") return "break";
  if (state === "open" || state === "in_progress" || state === "due" || state === "upcoming"
    || state === "scheduled" || state === "not_due" || state === "delayed") return "neutral";
  return "break";
}

/**
 * Calculate streaks from resolved Effective Timeline days, not persisted rows.
 * Positive and missed streaks are independent. Automatically unresolved days
 * consult the policy effective on that logical date, while explicit History
 * remains factual and keeps its existing semantics.
 */
export function computeTaskEffectiveTimelineStreaks(
  days: Readonly<Record<string, TaskEffectiveTimelineStreakDay>>,
  logicalDate: string,
): TaskEffectiveTimelineStreaks {
  let cursor: string | null = logicalDate;
  let currentCompletedStreak = 0;
  while (cursor && Object.hasOwn(days, cursor)) {
    const day = days[cursor];
    const finalizedKind = classifyFinalizedCalendarDay(day);
    if (!day || !finalizedKind || finalizedKind === "neutral" || isPreservedPositiveUnhandled(day)) {
      cursor = shiftDateKey(cursor, -1);
      continue;
    }
    if (finalizedKind === "success") {
      currentCompletedStreak += 1;
      cursor = shiftDateKey(cursor, -1);
      continue;
    }
    break;
  }

  cursor = logicalDate;
  let currentMissedStreak = 0;
  while (cursor && Object.hasOwn(days, cursor)) {
    const day = days[cursor];
    const finalizedKind = classifyFinalizedCalendarDay(day);
    if (!day || !finalizedKind || finalizedKind === "neutral" || isIgnoredUnhandled(day)) {
      cursor = shiftDateKey(cursor, -1);
      continue;
    }
    if (finalizedKind === "missed") {
      currentMissedStreak += 1;
      cursor = shiftDateKey(cursor, -1);
      continue;
    }
    break;
  }

  let longestMissedStreak = 0;
  let runningMissedStreak = 0;
  for (const date of Object.keys(days).sort()) {
    const day = days[date];
    const finalizedKind = classifyFinalizedCalendarDay(day);
    if (!finalizedKind || finalizedKind === "neutral") continue;
    if (finalizedKind === "missed") {
      if (isIgnoredUnhandled(day!)) continue;
      runningMissedStreak += 1;
      longestMissedStreak = Math.max(longestMissedStreak, runningMissedStreak);
    } else {
      runningMissedStreak = 0;
    }
  }

  return {
    currentCompletedStreak,
    currentMissedStreak,
    longestMissedStreak,
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

function latestDate(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}

function currentCanonicalDelayEffectiveDueOn(
  task: TaskStateSnapshot,
  rows: TaskStateHistoryRow[],
) {
  if (task.activeStatus !== "delayed" || !task.dueOn) return null;
  return rows
    .filter((row) => row.outcome === "delayed")
    .filter((row) => row.recurrenceAuthoritative === true)
    .filter((row) => row.effectiveDueOn === task.dueOn)
    .sort((left, right) => left.logicalDate.localeCompare(right.logicalDate)
      || left.occurredAt.localeCompare(right.occurredAt)
      || left.id.localeCompare(right.id))
    .at(-1)?.effectiveDueOn ?? null;
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
  behaviorPolicy: TaskBehaviorPolicy = STANDARD_TASK_BEHAVIOR_POLICY,
  unhandled = false,
): TaskEffectiveTimelineDay {
  const hasOccurrence = Boolean(occurrenceDueOn)
    && (state === "missed" || state === "unhandled_blank" || state === "open" || state === "scheduled");
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
    behaviorPolicy,
    unhandled,
  };
}

function explicitDay(row: TaskStateHistoryRow, behaviorPolicy: TaskBehaviorPolicy): TaskEffectiveTimelineDay {
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
    behaviorPolicy,
    unhandled: row.outcome === "missed" && (row.provenance === "rollover" || row.provenance === "reconciliation"),
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
    calendarOverrideId: baseDay.calendarOverrideId,
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
  currentDelayEffectiveDueOn: string | null,
) {
  if (replay && replay.effectiveDueOn !== undefined) return replay.effectiveDueOn;
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
  if (currentDelayEffectiveDueOn) return currentDelayEffectiveDueOn;
  return task.historicalScheduleAnchor
    ?? task.dueOn
    ?? task.activeOccurrenceDueOn
    ?? earliestDate(explicitRows.map((row) => row.occurrenceDueOn))
    ?? earliestDate(explicitRows.map((row) => occurrenceDateFromIdentity(row.occurrenceIdentity)))
    ?? (task.recurrence.kind !== "none"
      ? latestDate(explicitRows
        .filter((row) => SUCCESSFUL_OUTCOMES.has(row.outcome))
        .map((row) => row.logicalDate))
      : null);
}

export function buildTaskEffectiveTimeline(
  input: BuildTaskEffectiveTimelineInput,
): TaskEffectiveTimeline {
  const behaviorPolicy = resolveTaskBehaviorPolicy(input.behaviorPolicy);
  const policyForDate = (logicalDate: string) => input.behaviorPolicyRevisions?.length
    ? resolveTaskBehaviorPolicyForLogicalDate({ revisions: input.behaviorPolicyRevisions, logicalDate })
    : behaviorPolicy;
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
  const currentDelayEffectiveDueOn = currentCanonicalDelayEffectiveDueOn(input.task, recurrenceExplicitRows);
  const initialDueOn = initialOccurrenceDueOn(
    input.task,
    recurrenceExplicitRows,
    input.replay,
    replayCheckpoint,
    currentDelayEffectiveDueOn,
  );
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
  let activeDueOn: string | null = initialDueOn;
  let unresolvedDueOn: string | null = null;
  let delayedUntilDate: string | null = input.task.activeStatus === "delayed" && activeDueOn && activeDueOn > input.logicalDate
    ? activeDueOn
    : null;
  let completed = input.task.lifecycle === "complete";
  const consumed = new Set<string>();
  const automaticHistoryRows: TaskStateHistoryRow[] = [];

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
      && row.logicalDate === replayCheckpoint.logicalDate
      && row.logicalDate < (input.replay.manualDueOn ?? row.logicalDate)) {
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
    // Fixed-calendar rows, ordinary reads, and non-outcome replays that predate
    // the cursor have already been consumed by that cursor. A rolling
    // historical outcome replay is different: every authoritative row must be
    // replayed in logical-date order, so an older edit cannot hide a later
    // success.
    const replaysRollingHistoricalOutcome = input.task.recurrence.kind === "rolling"
      && input.replay?.kind === "outcome";
    const predatesActiveCursor = Boolean(
      !replaysRollingHistoricalOutcome
      && activeDueOn
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
      // Only a canonical Delay may move the ordinary read cursor. Scheduled
      // due-date/recurrence replay retains the established effective-date
      // behavior for translated rows, while legacy identity-less rows must
      // not be treated as canonical during ordinary projection.
      const hasCanonicalEffectiveCursor = row.recurrenceAuthoritative === true
        && row.effectiveDueOn !== undefined
        && row.effectiveDueOn !== null;
      const hasScheduleReplayEffectiveCursor = Boolean(
        input.replay
        && (input.replay.kind === "due_date" || input.replay.kind === "recurrence")
        && row.effectiveDueOn !== undefined
        && row.effectiveDueOn !== null,
      );
      if (hasCanonicalEffectiveCursor || hasScheduleReplayEffectiveCursor) {
        const effectiveDueOn = row.effectiveDueOn ?? null;
        activeDueOn = effectiveDueOn;
        unresolvedDueOn = null;
        delayedUntilDate = effectiveDueOn && effectiveDueOn > input.logicalDate ? effectiveDueOn : null;
        return;
      }
      // Legacy History has no persisted effective cursor. Preserve its prior
      // compatibility fallback only when the Task itself is currently Delayed;
      // canonical rows always carry effectiveDueOn (including null) and must
      // satisfy the active-target agreement above instead.
      if (input.task.activeStatus === "delayed"
        && row.effectiveDueOn === undefined
        && input.task.dueOn
        && input.task.dueOn > row.logicalDate
        && (!activeDueOn || activeDueOn <= row.logicalDate)) {
        activeDueOn = input.task.dueOn;
      }
      if (activeDueOn && activeDueOn > row.logicalDate) delayedUntilDate = activeDueOn;
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
    if (!row && override) {
      applyCalendarOverrideToCursor(date, override);
    }
    let day: TaskEffectiveTimelineDay;

    if (row) {
      day = explicitDay(row, policyForDate(date));
      if (recurrenceRow) applyExplicitRow(recurrenceRow);
    } else {
      let calculated: TaskEffectiveTimelineDay;
      const isFixedRecurrence = input.task.recurrence.kind === "weekly" || input.task.recurrence.kind === "monthly";
      const isFixedScheduledDate = Boolean(
        activeDueOn
        && isFixedRecurrence
        && isScheduledOccurrence(input.task.recurrence as Extract<TaskStateSnapshot["recurrence"], { kind: "weekly" | "monthly" }>, activeDueOn, date),
      );
      if (completed || !activeDueOn) {
        calculated = calculatedDay(input.task.id, date, "no_entry", "none");
      } else if (date < activeDueOn) {
        calculated = calculatedDay(input.task.id, date, "not_due", "none");
      } else if (isFixedRecurrence && !isFixedScheduledDate) {
        calculated = calculatedDay(input.task.id, date, "not_due", "none");
      } else if (date < input.logicalDate) {
        // Policy is prospective: explicit History remains a fact, while only
        // unhandled/calculated occurrences use the current profile. Standard
        // Tasks remain neutral until trusted reconciliation materializes
        // Missed; a future profile may keep the scheduled-but-blank obligation
        // visibly distinct.
        const datePolicy = policyForDate(date);
        calculated = datePolicy.unresolvedOccurrence === "missed"
          ? calculatedDay(input.task.id, date, "not_due", "none")
          : calculatedDay(input.task.id, date, "unhandled_blank", "overdue", date, datePolicy, true);
      } else if (date === input.logicalDate) {
        if (activeDueOn < input.logicalDate) {
          if (isFixedRecurrence) {
            calculated = calculatedDay(input.task.id, date, "open", "due", date);
          } else {
            unresolvedDueOn ??= activeDueOn;
            calculated = calculatedDay(input.task.id, date, "open", "overdue", unresolvedDueOn);
          }
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
      const datePolicy = policyForDate(date);
      if (datePolicy.unresolvedOccurrence === "missed"
        && input.replay?.materializeAutomaticMissed
        && date < input.logicalDate
        && !completed
        && !override
        && activeDueOn
        && (
          (input.task.recurrence.kind === "rolling"
            && (unresolvedDueOn !== null || scheduledOccurrences(input.task.recurrence, activeDueOn, date, date).includes(date)))
          || (input.task.recurrence.kind === "none" && date === activeDueOn)
          || (isFixedRecurrence && isFixedScheduledDate)
        )) {
        const independent = input.task.recurrence.kind !== "rolling" || input.task.recurrence.intervalDays === 1;
        const occurrenceDueOn = independent ? date : unresolvedDueOn ?? activeDueOn;
        const automaticRow: TaskStateHistoryRow = {
          id: `task-state:${input.task.id}:${date}:missed:reconciliation`,
          taskId: input.task.id,
          logicalDate: date,
          outcome: "missed",
          provenance: "reconciliation",
          occurredAt: `${date}T00:00:00.000Z`,
          occurrenceIdentity: occurrenceIdentity(input.task.id, occurrenceDueOn),
          occurrenceDueOn,
          countedAsDueOccurrence: true,
          wasCompleted: false,
          eventType: "status",
        };
        automaticHistoryRows.push(automaticRow);
        unresolvedDueOn ??= activeDueOn;
        calculated = calculatedDay(input.task.id, date, "missed", "overdue", occurrenceDueOn, datePolicy, true);
      }
      const baseDay = override
        ? calendarOverrideDay(input.task.id, date, override, input.logicalDate)
        : calculated;
      day = workflowApplies
        ? workflowDay(date, baseDay, workflow)
        : baseDay;
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
    effectiveDays,
    input.logicalDate,
  );

  const activeStatus = (() => {
    if (input.task.lifecycle !== "active") return input.task.activeStatus;
    if (currentDay?.state === "done" || currentDay?.state === "did_my_best" || currentDay?.state === "complete") return currentDay.state;
    if (currentDay?.state === "in_progress") return "in_progress" as const;
    if (currentDay?.state === "delayed" || (delayedUntilDate && delayedUntilDate > input.logicalDate)) return "delayed" as const;
    if (streaks.currentMissedStreak > 0 || currentDay?.state === "missed" || currentDay?.obligation === "overdue") return "missed" as const;
    if (currentDay?.state === "scheduled") return daysBetween(input.logicalDate, currentDay.logicalDate) <= 7 ? "upcoming" as const : "not_due" as const;
    if (currentDay?.state === "not_due" || currentDay?.state === "no_entry") {
      if (!activeDueOn && input.task.recurrence.kind === "none") return "unscheduled" as const;
      const nextScheduledDueOn = input.task.recurrence.kind === "weekly" || input.task.recurrence.kind === "monthly"
        ? scheduledOccurrences(input.task.recurrence, activeDueOn ?? input.logicalDate, input.logicalDate, shiftDateKey(input.logicalDate, 800)).at(0) ?? null
        : activeDueOn;
      return nextScheduledDueOn && nextScheduledDueOn > input.logicalDate && daysBetween(input.logicalDate, nextScheduledDueOn) <= 7
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
    longestMissedStreak: streaks.longestMissedStreak,
    currentObligation,
    nextDueOn: completed ? null : activeDueOn,
    recurrenceAnchor: replayCheckpoint?.kind === "success" ? replayCheckpoint.logicalDate : null,
    replayCheckpoint,
    unresolvedDueOn: currentUnresolvedDueOn,
    ...(input.replay?.materializeAutomaticMissed ? { automaticHistoryRows } : {}),
  };
}
