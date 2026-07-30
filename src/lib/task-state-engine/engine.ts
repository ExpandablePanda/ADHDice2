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
  TaskStateEngineInput,
  TaskStateHistoryRow,
} from "./types.ts";

const HANDLED = new Set<TaskHistoryOutcome>(["done", "did_my_best", "missed", "delayed", "complete"]);
const SUCCESS = new Set<TaskHistoryOutcome>(["done", "did_my_best", "complete"]);

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
  const action = input.action?.type === "record_outcome" ? input.action : null;
  const actionDate = action?.logicalDate ?? today;

  if (action) {
    const allowed = allowedOutcomes(task.recurrence, unscheduled);
    let reason: string | null = null;
    if (task.lifecycle !== "active") reason = `Cannot record outcomes for ${task.lifecycle} tasks.`;
    else if (byDate.has(actionDate)) reason = "Only one outcome is allowed per task per logical day.";
    else if (action.outcome === "missed") {
      const activeOccurrence = task.dueOn !== null && task.dueOn <= actionDate;
      if (unscheduled || !activeOccurrence) reason = "Missed requires an active due occurrence or scheduled continuation.";
    }
    else if (!allowed.has(action.outcome as never)) reason = `${action.outcome} is not allowed for this task type.`;
    if (action.outcome === "delayed" && (!Number.isInteger(action.delayDays) || (action.delayDays ?? 0) <= 0)) {
      reason = "Delay requires a positive whole number of days.";
    }
    if (reason) {
      errors.push(reason);
      changes.push({ type: "reject", logicalDate: actionDate, outcome: action.outcome, reason });
    } else {
      const row: TaskStateHistoryRow = {
        id: historyIdentity(task.id, actionDate, action.outcome, action.provenance ?? "manual"),
        taskId: task.id,
        logicalDate: actionDate,
        outcome: action.outcome,
        provenance: action.provenance ?? "manual",
        occurredAt: action.occurredAt ?? nowIso,
        occurrenceIdentity: null,
      };
      rows.push(row);
      byDate.set(actionDate, row);
      changes.push({ type: "insert", row });
    }
  }

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
    .sort((a, b) => a.logicalDate.localeCompare(b.logicalDate) || a.occurredAt.localeCompare(b.occurredAt));

  for (const row of successfulRows) {
    if (row.outcome === "complete") {
      nextDue = null;
      completedAt = row.occurredAt;
      recurrenceAnchor = row.logicalDate;
      satisfied = null;
      continue;
    }
    if ((task.recurrence.kind === "weekly" || task.recurrence.kind === "monthly") && row.occurrenceIdentity) {
      const recordedOccurrence = row.occurrenceIdentity.split(":").at(-1) as string;
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
    nextDue = shiftDateKey(actionDate, action.delayDays as number);
    recurrenceAnchor = actionDate;
  }

  const completed = task.lifecycle === "complete" || [...byDate.values()].some((row) => row.outcome === "complete");
  const overdueAnchor = task.lifecycle === "active" && !completed && !unscheduled && nextDue && nextDue < today ? nextDue : null;
  if (overdueAnchor) {
    const from = input.action?.type === "recompute" && input.action.fromLogicalDate > overdueAnchor
      ? input.action.fromLogicalDate
      : overdueAnchor;
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
  else if (task.activeStatus === "in_progress" && task.activeStatusLogicalDate === today) activeStatus = "in_progress";
  else if (currentOutcome === "missed" || overdueAnchor) activeStatus = "missed";
  else if (currentOutcome === "delayed" || (delayedRow && nextDue && nextDue > today)) activeStatus = nextDue ? statusForFutureDate(today, nextDue) : "delayed";
  else if (unscheduled) activeStatus = "unscheduled";
  else if (nextDue && nextDue > today) activeStatus = statusForFutureDate(today, nextDue);
  else if (currentOutcome === "done") activeStatus = "done";
  else if (currentOutcome === "did_my_best") activeStatus = "did_my_best";
  else activeStatus = "pending";

  const calendar: Record<string, ReturnType<typeof calendarStateForOutcome>> = {};
  for (const [date, row] of byDate) calendar[date] = calendarStateForOutcome(row.outcome);
  const calendarStart = task.dueOn && task.dueOn < today ? task.dueOn : today;
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
    if (task.recurrence.kind === "weekly" || task.recurrence.kind === "monthly") {
      for (const date of scheduledOccurrences(task.recurrence, task.dueOn ?? today, today, shiftDateKey(today, 40))) {
        if (!calendar[date]) calendar[date] = "scheduled";
      }
    }
  }
  if (task.activeStatus === "in_progress" && task.activeStatusLogicalDate === today && !currentRow) calendar[today] = "in_progress";

  const patch: ProposedTaskStatePatch = {};
  if (activeStatus !== task.activeStatus) patch.status = activeStatus;
  if (nextDue !== task.dueOn) patch.dueOn = nextDue;
  if (staleInProgress) {
    patch.activeStatusLogicalDate = null;
    patch.activeOccurrenceDueOn = null;
  }
  if (recurrenceAnchor) patch.recurrenceCursor = recurrenceAnchor;
  if (satisfied) patch.satisfiedOccurrenceIdentity = occurrenceIdentity(task.id, satisfied);
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
