import {
  authoritativeRowsByDate,
  calendarStateForOutcome,
  dateRange,
  daysBetween,
  logicalDateForTimestamp,
  shiftDateKey,
} from "./calendar.ts";
import {
  allowedOutcomes,
  isUnscheduled,
  isScheduledOccurrence,
  nextFixedOccurrence,
  occurrenceIdentity,
  recurrenceAfterSuccess,
  scheduledOccurrences,
} from "./recurrence.ts";
import type {
  ProposedTaskStatePatch,
  RewardEligibility,
  StreakDisposition,
  TaskActiveStatus,
  TaskHistoryChange,
  TaskHistoryOutcome,
  TaskRecurrence,
  TaskStateEngineInput,
  TaskStateHistoryRow,
} from "./types.ts";

const HANDLED = new Set<TaskHistoryOutcome>(["done", "did_my_best", "missed", "delayed", "complete"]);
const SUCCESS = new Set<TaskHistoryOutcome>(["done", "did_my_best", "complete"]);

export function isSuccessfulTaskHistoryOutcome(outcome: TaskHistoryOutcome) {
  return SUCCESS.has(outcome);
}

function historyIdentity(taskId: string, date: string, outcome: TaskHistoryOutcome, provenance: string) {
  return `task-state:${taskId}:${date}:${outcome}:${provenance}`;
}

function rewardIdentity(taskId: string, date: string, outcome: TaskHistoryOutcome) {
  return `task-reward:${taskId}:${date}:${outcome}`;
}

function statusForFutureDate(today: string, dueOn: string): TaskActiveStatus {
  return daysBetween(today, dueOn) <= 7 ? "upcoming" : "not_due";
}

function streakFor(outcome: TaskHistoryOutcome | null, unscheduledInactive: boolean): StreakDisposition {
  if (outcome && SUCCESS.has(outcome)) return "increment_positive";
  if (outcome === "delayed") return "preserve_positive";
  if (outcome === "missed") return "increment_missed";
  if (unscheduledInactive) return "break_positive";
  return "none";
}

function rewardFor(taskId: string, row: TaskStateHistoryRow | null): RewardEligibility {
  if (!row) return { eligible: false, identity: null, logicalDate: null, outcome: null, reason: "no_outcome" };
  if (!SUCCESS.has(row.outcome)) {
    return { eligible: false, identity: null, logicalDate: row.logicalDate, outcome: row.outcome, reason: "ineligible_outcome" };
  }
  return {
    eligible: !row.rewardClaimed,
    identity: rewardIdentity(taskId, row.logicalDate, row.outcome),
    logicalDate: row.logicalDate,
    outcome: row.outcome,
    reason: row.rewardClaimed ? "already_claimed" : "eligible",
  };
}

function occurrenceDateFromIdentity(identity: string | null | undefined) {
  const date = identity?.split(":").at(-1) ?? null;
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

type UnresolvedMissedOccurrence = {
  ambiguous: boolean;
  dueOn: string | null;
  hasUnresolved: boolean;
  identity: string | null;
  row: TaskStateHistoryRow | null;
};

/**
 * History, rather than the mutable task cursor, owns whether a Missed
 * occurrence is still open. Legacy rows are deliberately inferred only when
 * their logical date is the current persisted cursor; an older identity-less
 * row is not promoted to the live occurrence by recency alone.
 */
export function findUnresolvedMissedOccurrence(
  task: TaskStateEngineInput["task"],
  history: readonly TaskStateHistoryRow[],
): UnresolvedMissedOccurrence {
  const rows = history.filter((row) => row.taskId === task.id);
  const resolvedKeys = new Set(
    rows
      .filter((row) => row.outcome !== "missed")
      .flatMap((row) => {
        const date = occurrenceDateFromIdentity(row.occurrenceIdentity) ?? row.occurrenceDueOn;
        return date ? [row.occurrenceIdentity ?? date] : [row.logicalDate];
      }),
  );
  const laterNonMissedDates = new Set(
    rows
      .filter((row) => row.outcome !== "missed")
      .map((row) => row.logicalDate),
  );
  const candidates = rows
    .filter((row) => row.outcome === "missed")
    .map((row) => {
      const identityDueOn = occurrenceDateFromIdentity(row.occurrenceIdentity) ?? row.occurrenceDueOn;
      const scheduleValidLegacyDate = !identityDueOn
        && task.dueOn
        && row.logicalDate <= task.dueOn
        && (row.logicalDate === task.dueOn
          || task.recurrence.kind === "rolling"
          || ((task.recurrence.kind === "weekly" || task.recurrence.kind === "monthly")
            && isScheduledOccurrence(task.recurrence, task.dueOn, row.logicalDate, { includeBeforeDueOn: true })));
      const dueOn = identityDueOn ?? (scheduleValidLegacyDate ? row.logicalDate : null);
      const identity = row.occurrenceIdentity ?? (dueOn ? occurrenceIdentity(task.id, dueOn) : null);
      return { dueOn, identity, inferred: !identityDueOn, row };
    })
    .filter(({ dueOn, identity, inferred, row }) => (
      dueOn !== null
      && identity !== null
      && !resolvedKeys.has(identity)
      && !resolvedKeys.has(dueOn)
      && (!inferred || ![...laterNonMissedDates].some((date) => date > row.logicalDate))
    ));
  const distinct = [...new Map(candidates.map((candidate) => [candidate.identity, candidate])).values()];
  if (distinct.length !== 1) {
    return { ambiguous: distinct.length > 1, dueOn: null, hasUnresolved: distinct.length > 0, identity: null, row: null };
  }
  const candidate = distinct[0]!;
  return { ambiguous: false, dueOn: candidate.dueOn, hasUnresolved: true, identity: candidate.identity, row: candidate.row };
}

function nextDueAfterFinalizedOccurrence(recurrence: TaskRecurrence, occurrenceDate: string) {
  if (recurrence.kind === "none") return null;
  if (recurrence.kind === "rolling") {
    return recurrenceAfterSuccess(recurrence, occurrenceDate, occurrenceDate, new Set()).nextDue;
  }
  return nextFixedOccurrence(
    recurrence,
    occurrenceDate,
    shiftDateKey(occurrenceDate, 1),
    new Set(),
  );
}

export function evaluateTaskState(input: TaskStateEngineInput) {
  const { task } = input;
  const today = logicalDateForTimestamp(input.now, input.timezone, input.logicalDayRollover);
  const nowIso = (input.now instanceof Date ? input.now : new Date(input.now)).toISOString();
  const changes: TaskHistoryChange[] = [];
  const errors: string[] = [];
  const rows = input.history
    .filter((row) => row.taskId === task.id)
    .map((row) => ({ ...row }));
  const byDate = authoritativeRowsByDate(rows);
  const unscheduled = isUnscheduled(task.recurrence, task.dueOn);
  const scheduleChange = input.action?.type === "change_schedule";
  const action = input.action?.type === "record_outcome" ? input.action : null;
  const actionDate = action?.logicalDate ?? today;
  const existingActionRow = action ? byDate.get(actionDate) ?? null : null;
  const activeActionOccurrenceDueOn = action
    && task.activeStatusLogicalDate === actionDate
    ? task.activeOccurrenceDueOn ?? null
    : null;
  const unresolvedMissedBeforeAction = findUnresolvedMissedOccurrence(task, rows);
  const actionOccurrenceIdentity = action?.occurrenceIdentity
    ?? (action?.occurrenceDueOn ? occurrenceIdentity(task.id, action.occurrenceDueOn) : null)
    ?? existingActionRow?.occurrenceIdentity
    ?? (activeActionOccurrenceDueOn ? occurrenceIdentity(task.id, activeActionOccurrenceDueOn) : null)
    ?? unresolvedMissedBeforeAction.identity
    ?? (action
      && (action.outcome === "missed" || action.outcome === "delayed" || action.outcome === "complete")
      && task.dueOn
      && task.dueOn <= actionDate
      ? occurrenceIdentity(task.id, task.dueOn)
      : null);
  const isActionRow = (row: TaskStateHistoryRow) => Boolean(action && row.logicalDate === actionDate);

  if (action) {
    const allowed = allowedOutcomes(task.recurrence, unscheduled);
    let reason: string | null = null;
    if (task.lifecycle !== "active") reason = `Cannot record outcomes for ${task.lifecycle} tasks.`;
    else if (existingActionRow && !action.replaceExisting) reason = "Only one outcome is allowed per task per logical day.";
    else if (SUCCESS.has(action.outcome) && actionOccurrenceIdentity && rows.some((row) => (
      row.outcome !== "missed"
      && SUCCESS.has(row.outcome)
      && row.occurrenceIdentity === actionOccurrenceIdentity
      && row.logicalDate !== actionDate
    ))) reason = "This recurring occurrence already has a successful resolution.";
    else if (action.outcome === "missed") {
      const activeOccurrence = task.dueOn !== null && task.dueOn <= actionDate;
      const fixedOccurrence = task.dueOn !== null
        && (task.recurrence.kind === "weekly" || task.recurrence.kind === "monthly")
        && isScheduledOccurrence(task.recurrence, task.dueOn, actionDate, { includeBeforeDueOn: true });
      if (unscheduled || (task.recurrence.kind === "weekly" || task.recurrence.kind === "monthly"
        ? !fixedOccurrence
        : !activeOccurrence)) {
        reason = "Missed requires an active due occurrence or scheduled continuation.";
      }
    }
    else if (!allowed.has(action.outcome as never)) reason = `${action.outcome} is not allowed for this task type.`;
    if (action.outcome === "delayed" && action.delayUntilDate === undefined
      && (!Number.isInteger(action.delayDays) || (action.delayDays ?? 0) <= 0)) {
      reason = "Delay requires a positive whole number of days.";
    }
    if (reason) {
      errors.push(reason);
      changes.push({ type: "reject", logicalDate: actionDate, outcome: action.outcome, reason });
    } else {
      if (action.replaceExisting) byDate.delete(actionDate);
      const row: TaskStateHistoryRow = {
        id: historyIdentity(task.id, actionDate, action.outcome, action.provenance ?? "manual"),
        taskId: task.id,
        logicalDate: actionDate,
        outcome: action.outcome,
        provenance: action.provenance ?? "manual",
        occurredAt: action.occurredAt ?? nowIso,
        occurrenceIdentity: actionOccurrenceIdentity,
        occurrenceDueOn: occurrenceDateFromIdentity(actionOccurrenceIdentity) ?? action.occurrenceDueOn ?? null,
        countedAsDueOccurrence: task.recurrence.kind === "none"
          ? true
          : Boolean(
            (occurrenceDateFromIdentity(actionOccurrenceIdentity) ?? action.occurrenceDueOn)
            && (occurrenceDateFromIdentity(actionOccurrenceIdentity) ?? action.occurrenceDueOn)! <= actionDate,
          ),
        wasCompleted: SUCCESS.has(action.outcome),
        eventType: action.outcome === "complete" ? "completed_permanently" : "status",
      };
      rows.push(row);
      byDate.set(actionDate, row);
      changes.push({ type: "insert", row });
    }
  }

  const unresolvedMissed = findUnresolvedMissedOccurrence(task, rows);

  const consumed = new Set(
    rows.map((row) => row.occurrenceIdentity).filter((value): value is string => Boolean(value))
      .map((identity) => identity.split(":").at(-1) as string),
  );
  let recurrenceAnchor: string | null = null;
  let nextDue = task.dueOn;
  let satisfied: string | null = null;
  let completedAt: string | null = null;
  let protectedFixedOccurrence: string | null = null;
  const successfulRows = [...byDate.values()]
    .filter((row) => SUCCESS.has(row.outcome))
    .filter(() => !scheduleChange)
    .sort((a, b) => a.logicalDate.localeCompare(b.logicalDate) || a.occurredAt.localeCompare(b.occurredAt));

  for (const row of successfulRows) {
    if (row.outcome === "complete") {
      nextDue = null;
      completedAt = row.occurredAt;
      recurrenceAnchor = row.logicalDate;
      satisfied = null;
      continue;
    }
    if (task.recurrence.kind === "rolling" && row.occurrenceIdentity) {
      const recordedOccurrence = occurrenceDateFromIdentity(row.occurrenceIdentity) ?? row.logicalDate;
      if (task.dueOn && recordedOccurrence < task.dueOn) {
        const expectedNextDue = nextDueAfterFinalizedOccurrence(task.recurrence, recordedOccurrence);
        recurrenceAnchor = recordedOccurrence;
        satisfied = recordedOccurrence;
        nextDue = isActionRow(row) && expectedNextDue && task.dueOn === expectedNextDue
          ? expectedNextDue
          : task.dueOn;
        protectedFixedOccurrence = task.dueOn;
        continue;
      }
      const result = recurrenceAfterSuccess(task.recurrence, nextDue, row.logicalDate, consumed);
      recurrenceAnchor = result.anchor;
      satisfied = recordedOccurrence;
      nextDue = result.nextDue;
      continue;
    }
    const isFixedRecurrence = task.recurrence.kind === "weekly" || task.recurrence.kind === "monthly";
    const recordedOccurrence = isFixedRecurrence && row.occurrenceIdentity
      ? occurrenceDateFromIdentity(row.occurrenceIdentity)
      : null;
    const hasRecordedFixedOccurrence = recordedOccurrence !== null && /^\d{4}-\d{2}-\d{2}$/.test(recordedOccurrence);
    if (
      (task.recurrence.kind === "weekly" || task.recurrence.kind === "monthly")
      && hasRecordedFixedOccurrence
    ) {
      // The persisted due date is the current fixed-schedule cursor. A History
      // occurrence strictly before it has already advanced that cursor and
      // must not be replayed against the advanced anchor on later evaluations.
      // Equality remains actionable so a newly edited task can reconcile the
      // occurrence it was moved back onto during the same logical day.
      if (task.dueOn && recordedOccurrence < task.dueOn) {
        if (isActionRow(row)) {
          const expectedNextDue = nextDueAfterFinalizedOccurrence(task.recurrence, recordedOccurrence);
          nextDue = expectedNextDue && task.dueOn === expectedNextDue ? expectedNextDue : task.dueOn;
        }
        recurrenceAnchor = recordedOccurrence;
        satisfied = recordedOccurrence;
        protectedFixedOccurrence = task.dueOn;
        continue;
      }
      recurrenceAnchor = recordedOccurrence;
      satisfied = recordedOccurrence;
      nextDue = nextFixedOccurrence(
        task.recurrence,
        task.dueOn ?? recordedOccurrence,
        shiftDateKey(recordedOccurrence, 1),
        consumed,
      );
      protectedFixedOccurrence = nextDue;
      continue;
    }
    const validFutureFixedCursor = isFixedRecurrence
      && task.dueOn !== null
      && task.dueOn > today
      && scheduledOccurrences(task.recurrence, task.dueOn, task.dueOn, task.dueOn).includes(task.dueOn)
      ? task.dueOn
      : null;
    if (
      validFutureFixedCursor
      && !hasRecordedFixedOccurrence
      && row.logicalDate < validFutureFixedCursor
      && !isActionRow(row)
    ) {
      // Older rows may lack occurrence identity. A persisted future cursor plus
      // fixed-schedule and temporal evidence proves that this success predates
      // the protected occurrence. Display status may be stale without making
      // the cursor replayable. Overdue/equal-date edits do not satisfy this gate.
      recurrenceAnchor = row.logicalDate;
      protectedFixedOccurrence = validFutureFixedCursor;
      continue;
    }
    if (
      (task.recurrence.kind === "weekly" || task.recurrence.kind === "monthly")
      && protectedFixedOccurrence
      && row.logicalDate < protectedFixedOccurrence
    ) {
      continue;
    }
    const result = recurrenceAfterSuccess(task.recurrence, nextDue, row.logicalDate, consumed);
    recurrenceAnchor = result.anchor;
    nextDue = result.nextDue;
    satisfied = result.satisfied;
    if (result.satisfied && !row.occurrenceIdentity) {
      row.occurrenceIdentity = occurrenceIdentity(task.id, result.satisfied);
    }
    if (
      (task.recurrence.kind === "weekly" || task.recurrence.kind === "monthly")
      && result.satisfied
      && result.satisfied > row.logicalDate
    ) {
      protectedFixedOccurrence = result.nextDue;
    }
  }

  const replacedSuccessfulOutcome = action?.replaceExisting
    && action.previousOutcome
    && SUCCESS.has(action.previousOutcome)
    && action.outcome === "missed";
  const replacedOccurrenceDate = action?.occurrenceDueOn
    ?? occurrenceDateFromIdentity(actionOccurrenceIdentity)
    ?? actionDate;
  const automaticNextDueAfterReplacement = replacedSuccessfulOutcome
    ? nextDueAfterFinalizedOccurrence(task.recurrence, replacedOccurrenceDate)
    : null;
  const rolledBackAutomaticAdvance = Boolean(
    replacedSuccessfulOutcome
    && automaticNextDueAfterReplacement
    && task.dueOn === automaticNextDueAfterReplacement,
  );
  if (rolledBackAutomaticAdvance) {
    nextDue = replacedOccurrenceDate;
    recurrenceAnchor = null;
    satisfied = null;
  }

  // A persisted active Missed is an unresolved obligation. Fixed recurrence may
  // expose a new Calendar occurrence, but that must not replace the frozen
  // overdue occurrence until an explicit handled outcome resolves it.
  const activeMissedDueOn = !unresolvedMissed.identity && task.lifecycle === "active"
    && task.activeStatus === "missed"
    && task.dueOn
    && task.dueOn < today
    && ![...byDate.values()].some((row) => {
      if (row.outcome === "missed") return false;
      const recordedOccurrence = occurrenceDateFromIdentity(row.occurrenceIdentity);
      return row.logicalDate >= task.dueOn || recordedOccurrence === task.dueOn;
    })
    ? task.dueOn
    : null;
  if (activeMissedDueOn && !scheduleChange) {
    nextDue = activeMissedDueOn;
    recurrenceAnchor = null;
    satisfied = null;
  }

  const staleInProgress = task.lifecycle === "active"
    && task.activeStatus === "in_progress"
    && task.activeStatusLogicalDate
    && task.activeStatusLogicalDate < today
    && !byDate.has(task.activeStatusLogicalDate);
  if (staleInProgress) {
    const date = task.activeStatusLogicalDate as string;
    const row: TaskStateHistoryRow = {
      id: historyIdentity(task.id, date, "did_my_best", "rollover"),
      taskId: task.id,
      logicalDate: date,
      outcome: "did_my_best",
      provenance: "rollover",
      occurredAt: nowIso,
      occurrenceIdentity: task.activeOccurrenceDueOn
        ? occurrenceIdentity(task.id, task.activeOccurrenceDueOn)
        : null,
      occurrenceDueOn: task.activeOccurrenceDueOn,
      countedAsDueOccurrence: Boolean(task.activeOccurrenceDueOn),
      wasCompleted: true,
      eventType: "status",
    };
    byDate.set(date, row);
    rows.push(row);
    changes.push({ type: "insert", row });
    const result = recurrenceAfterSuccess(task.recurrence, nextDue, date, consumed);
    recurrenceAnchor = result.anchor;
    nextDue = result.nextDue;
    satisfied = result.satisfied;
  }

  if (action?.outcome === "delayed" && !errors.length) {
    nextDue = action.delayUntilDate !== undefined
      ? action.delayUntilDate
      : shiftDateKey(actionDate, action.delayDays as number);
    recurrenceAnchor = actionDate;
  }

  const completed = task.lifecycle === "complete" || [...byDate.values()].some((row) => row.outcome === "complete");
  const latestHandledRow = [...byDate.values()]
    .filter((row) => row.outcome !== "missed")
    .sort((left, right) => right.logicalDate.localeCompare(left.logicalDate) || right.occurredAt.localeCompare(left.occurredAt))[0] ?? null;
  const oneOffHandled = task.recurrence.kind === "none"
    && latestHandledRow
    && (latestHandledRow.outcome === "done" || latestHandledRow.outcome === "complete");
  const overdueAnchor = !unresolvedMissed.hasUnresolved
    && task.lifecycle === "active" && !completed && !oneOffHandled && !unscheduled && nextDue && nextDue < today ? nextDue : null;
  if (overdueAnchor) {
    const continuousStart = latestHandledRow && latestHandledRow.logicalDate >= overdueAnchor
      ? shiftDateKey(latestHandledRow.logicalDate, 1)
      : overdueAnchor;
    const from = input.action?.type === "recompute" && input.action.fromLogicalDate > continuousStart
      ? input.action.fromLogicalDate
      : continuousStart;
    for (const date of dateRange(from, shiftDateKey(today, -1))) {
      if (byDate.has(date)) continue;
      const row: TaskStateHistoryRow = {
        id: historyIdentity(task.id, date, "missed", "rollover"),
        taskId: task.id,
        logicalDate: date,
        outcome: "missed",
        provenance: "rollover",
        occurredAt: nowIso,
        occurrenceIdentity: occurrenceIdentity(task.id, overdueAnchor),
        occurrenceDueOn: overdueAnchor,
        // Automatic continuous-overdue rows are evidence of a missed logical
        // day, not a second counted due-occurrence charge.
        countedAsDueOccurrence: false,
        wasCompleted: false,
        eventType: "status",
      };
      byDate.set(date, row);
      changes.push({ type: "insert", row });
    }
  }

  const currentRow = byDate.get(today) ?? null;
  const currentOutcome = currentRow?.outcome ?? null;
  const delayedRow = [...byDate.values()]
    .filter((row) => row.outcome === "delayed")
    .sort((a, b) => b.logicalDate.localeCompare(a.logicalDate))[0] ?? null;
  let activeStatus: TaskActiveStatus;
  if (task.lifecycle === "archived" || task.lifecycle === "trashed") activeStatus = task.activeStatus;
  else if (completed) activeStatus = "complete";
  else if (task.activeStatus === "in_progress" && task.activeStatusLogicalDate === today && !currentRow) activeStatus = "in_progress";
  else if (currentOutcome === "missed" || unresolvedMissed.hasUnresolved || overdueAnchor) activeStatus = "missed";
  else if (scheduleChange && (task.activeStatus === "done" || task.activeStatus === "did_my_best")) activeStatus = task.activeStatus;
  else if (currentOutcome === "delayed" || (delayedRow && nextDue && nextDue > today)) activeStatus = nextDue ? statusForFutureDate(today, nextDue) : "delayed";
  else if (unscheduled) activeStatus = "unscheduled";
  else if (nextDue && nextDue > today) activeStatus = statusForFutureDate(today, nextDue);
  else if (oneOffHandled || currentOutcome === "done") activeStatus = "done";
  else if (currentOutcome === "did_my_best") activeStatus = "did_my_best";
  else activeStatus = "pending";

  const calendar: Record<string, ReturnType<typeof calendarStateForOutcome>> = {};
  for (const [date, row] of byDate) calendar[date] = calendarStateForOutcome(row.outcome);
  const calendarStart = input.calendarStart ?? (task.dueOn && task.dueOn < today ? task.dueOn : today);
  const calendarEnd = input.calendarEnd ?? shiftDateKey(today, 40);
  if (!completed) {
    for (const date of dateRange(calendarStart, today)) {
      if (calendar[date]) continue;
      if (date === today && (unscheduled || !nextDue || nextDue <= today || overdueAnchor)) calendar[date] = "open";
      else if (date < today && overdueAnchor) calendar[date] = "missed";
      else calendar[date] = "no_entry";
    }
    if (nextDue && nextDue > today) {
      for (const date of dateRange(shiftDateKey(today, 1), nextDue)) {
        calendar[date] = date === nextDue ? "scheduled" : "not_due";
      }
    }
    if (input.calendarStart && input.calendarEnd) {
      for (const date of dateRange(input.calendarStart, input.calendarEnd)) {
        if (!calendar[date]) calendar[date] = "no_entry";
      }
    }
    if (task.recurrence.kind !== "none") {
      for (const date of scheduledOccurrences(
        task.recurrence,
        task.dueOn ?? today,
        input.calendarStart ?? today,
        calendarEnd,
        {
          // A manual future cursor is the first rolling occurrence. Keep the
          // historical fixed-calendar projection for already advanced weekday
          // and monthly cursors, but never synthesize rolling dates before the
          // manually selected anchor.
          includeBeforeDueOn: input.calendarStart !== undefined
            && (task.recurrence.kind === "weekly" || task.recurrence.kind === "monthly"),
        },
      )) {
        if (!calendar[date] || calendar[date] === "no_entry") calendar[date] = "scheduled";
      }
    }
  }
  if (task.activeStatus === "in_progress" && task.activeStatusLogicalDate === today && !currentRow) calendar[today] = "in_progress";

  const patch: ProposedTaskStatePatch = {};
  if (activeStatus !== task.activeStatus) patch.status = activeStatus;
  if (nextDue !== task.dueOn) patch.dueOn = nextDue;
  const finalizedActiveOccurrence = Boolean(
    action
    && task.activeStatus === "in_progress"
    && task.activeStatusLogicalDate === actionDate,
  );
  if (finalizedActiveOccurrence) {
    patch.activeStatusLogicalDate = null;
    patch.activeOccurrenceDueOn = null;
  } else if (staleInProgress) {
    patch.activeStatusLogicalDate = null;
    patch.activeOccurrenceDueOn = null;
  }
  if (recurrenceAnchor && task.recurrenceCursor !== recurrenceAnchor) patch.recurrenceCursor = recurrenceAnchor;
  if (satisfied) {
    const identity = occurrenceIdentity(task.id, satisfied);
    if (task.satisfiedOccurrenceIdentity !== identity) patch.satisfiedOccurrenceIdentity = identity;
  }
  if (completedAt) {
    patch.completedAt = completedAt;
    patch.dueOn = null;
  }

  const rewardRow = changes
    .filter((change): change is Extract<TaskHistoryChange, { type: "insert" }> => change.type === "insert")
    .map((change) => change.row)
    .findLast((row) => SUCCESS.has(row.outcome))
    ?? currentRow;
  const unscheduledInactive = task.lifecycle === "active" && unscheduled && !currentRow && !staleInProgress;
  const generatedMissed = changes.some((change) => change.type === "insert" && change.row.outcome === "missed");

  return {
    logicalDate: today,
    lifecycle: task.lifecycle,
    activeStatus,
    calendar,
    handledCurrentDay: currentOutcome !== null && HANDLED.has(currentOutcome),
    currentDayOutcome: {
      outcome: currentOutcome,
      missedToday: currentOutcome === "missed",
      successful: currentOutcome !== null && SUCCESS.has(currentOutcome),
      delayed: currentOutcome === "delayed",
    },
    continuousOverdue: {
      active: Boolean(overdueAnchor),
      frozenDueOn: overdueAnchor,
      firstMissedDate: overdueAnchor,
    },
    recurrenceAnchor,
    nextDueDate: completed ? null : nextDue,
    satisfiedOccurrenceIdentity: satisfied ? occurrenceIdentity(task.id, satisfied) : null,
    unresolvedOccurrenceIdentity: unresolvedMissed.identity,
    unresolvedOccurrenceDueOn: unresolvedMissed.dueOn,
    proposedHistoryChanges: changes,
    proposedTaskPatch: patch,
    streakDisposition: streakFor(
      currentOutcome ?? (staleInProgress ? "did_my_best" : generatedMissed ? "missed" : null),
      unscheduledInactive,
    ),
    rewardEligibility: rewardFor(task.id, rewardRow ?? null),
    validationErrors: errors,
  };
}
