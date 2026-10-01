import { dateRange, daysBetween, formatDateKey, logicalDateForTimestamp, parseDateKey, shiftDateKey } from "./calendar.ts";
import type {
  RewardEligibility,
  StreakDisposition,
  TaskActiveStatus,
  TaskCalendarState,
  TaskEffectiveTimeline,
  TaskEffectiveTimelineDay,
  TaskHistoryChange,
  TaskHistoryOutcome,
  TaskStateEngineInput,
  TaskStateEngineResult,
  TaskStateHistoryRow,
  TaskQuotaPeriodFact,
} from "./types.ts";
import { occurrenceIdentity } from "./recurrence.ts";
import type { TaskBehaviorPolicy } from "./behavior-policy.ts";

export type QuotaPeriod = "week" | "month";

export type QuotaRecurrence = {
  kind: "quota";
  period: QuotaPeriod;
  count: number;
  balanceEnabled: boolean;
  activationDate?: string | null;
  scheduleBoundaryId?: string | null;
  incomingBalance?: number | null;
  incomingBalancePeriodKey?: string | null;
};

export type QuotaPeriodBounds = {
  key: string;
  start: string;
  end: string;
  capacity: number;
};

export type QuotaPeriodEvaluation = {
  baseQuota: number;
  incomingBalance: number;
  successesThisPeriod: number;
  requiredThisPeriod: number;
  remainingRequired: number;
  daysRemainingIncludingToday: number;
  dueToday: boolean;
  nextMandatoryDate: string | null;
  nextBalance: number;
};

const SUCCESSFUL_QUOTA_OUTCOMES = new Set<TaskHistoryOutcome>(["done", "did_my_best"]);
const SUCCESSFUL_OUTCOMES = new Set<TaskHistoryOutcome>(["done", "did_my_best", "complete"]);

export function isQuotaRecurrence(recurrence: { kind: string }): recurrence is QuotaRecurrence {
  return recurrence.kind === "quota";
}

export function quotaPeriodBounds(dateKey: string, period: QuotaPeriod): QuotaPeriodBounds {
  const date = parseDateKey(dateKey);
  if (period === "week") {
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    const start = shiftDateKey(dateKey, -mondayOffset);
    return { key: start, start, end: shiftDateKey(start, 6), capacity: 7 };
  }
  const start = formatDateKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
  const end = formatDateKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
  return { key: start.slice(0, 7), start, end, capacity: parseDateKey(end).getUTCDate() };
}

export function quotaBaseQuota(
  recurrence: Pick<QuotaRecurrence, "period" | "count"> & { activationDate?: string | null },
  bounds: QuotaPeriodBounds,
) {
  const activationDate = recurrence.activationDate ?? null;
  if (activationDate && activationDate > bounds.end) return 0;
  const effectiveStart = activationDate && activationDate > bounds.start ? activationDate : bounds.start;
  const effectiveCapacity = daysBetween(effectiveStart, bounds.end) + 1;
  return Math.min(Math.max(1, recurrence.count), effectiveCapacity);
}

function eligibleStart(recurrence: Pick<QuotaRecurrence, "activationDate">, bounds: QuotaPeriodBounds) {
  return recurrence.activationDate && recurrence.activationDate > bounds.start
    ? recurrence.activationDate
    : bounds.start;
}

function distinctSuccessDates(
  history: readonly TaskStateHistoryRow[],
  bounds: QuotaPeriodBounds,
  throughDate: string,
  recurrence: Pick<QuotaRecurrence, "activationDate">,
) {
  const start = eligibleStart(recurrence, bounds);
  return new Set(
    history
      .filter((row) => SUCCESSFUL_QUOTA_OUTCOMES.has(row.outcome))
      .map((row) => row.logicalDate)
      .filter((date) => date >= start && date <= bounds.end && date <= throughDate),
  );
}

function successfulDaysForPeriod(
  history: readonly TaskStateHistoryRow[],
  bounds: QuotaPeriodBounds,
  recurrence: Pick<QuotaRecurrence, "activationDate">,
) {
  return distinctSuccessDates(history, bounds, bounds.end, recurrence).size;
}

function nextPeriodDate(bounds: QuotaPeriodBounds) {
  return shiftDateKey(bounds.end, 1);
}

function factAppliesToRecurrence(fact: TaskQuotaPeriodFact, recurrence: QuotaRecurrence) {
  return !recurrence.scheduleBoundaryId || fact.scheduleBoundaryId === recurrence.scheduleBoundaryId;
}

function factOrder(left: TaskQuotaPeriodFact, right: TaskQuotaPeriodFact) {
  return (left.createdAt ?? "").localeCompare(right.createdAt ?? "")
    || (left.revision ?? 0) - (right.revision ?? 0)
    || (left.id ?? "").localeCompare(right.id ?? "");
}

function incomingBalanceForPeriod(
  recurrence: QuotaRecurrence,
  target: QuotaPeriodBounds,
  history: readonly TaskStateHistoryRow[],
  facts: readonly TaskQuotaPeriodFact[] = [],
) {
  if (!recurrence.balanceEnabled) return 0;
  const relevantFacts = facts
    .filter((fact) => fact.balanceEnabled && factAppliesToRecurrence(fact, recurrence))
    .sort(factOrder);
  const periodFacts = relevantFacts.filter((fact) => fact.periodKind === recurrence.period);
  const targetFacts = periodFacts.filter((fact) => fact.periodKey === target.key);
  const latestTargetClear = targetFacts.filter((fact) => fact.eventKind === "clear_balance").at(-1);
  if (latestTargetClear) return 0;

  const priorFact = periodFacts
    .filter((fact) => fact.eventKind === "period_close" && fact.periodEnd < target.start)
    .sort((left, right) => left.periodEnd.localeCompare(right.periodEnd) || factOrder(left, right))
    .at(-1);
  const initialDate = priorFact
    ? nextPeriodDate(quotaPeriodBounds(priorFact.periodStart, recurrence.period))
    : recurrence.incomingBalancePeriodKey
      ? recurrence.period === "week"
        ? recurrence.incomingBalancePeriodKey
        : `${recurrence.incomingBalancePeriodKey}-01`
      : recurrence.activationDate ?? target.start;
  let cursor = quotaPeriodBounds(initialDate, recurrence.period);
  if (target.key < cursor.key) return 0;
  let incoming = priorFact?.nextBalance ?? recurrence.incomingBalance ?? 0;
  while (cursor.key < target.key) {
    const baseQuota = quotaBaseQuota(recurrence, cursor);
    const closeFact = periodFacts.find((fact) => fact.periodKey === cursor.key && fact.eventKind === "period_close");
    const clearFact = periodFacts.filter((fact) => fact.periodKey === cursor.key && fact.eventKind === "clear_balance").at(-1);
    const incomingForPeriod = clearFact ? 0 : incoming;
    incoming = closeFact
      ? closeFact.nextBalance
      : incomingForPeriod + successfulDaysForPeriod(history, cursor, recurrence) - baseQuota;
    cursor = quotaPeriodBounds(nextPeriodDate(cursor), recurrence.period);
  }
  return incoming;
}

export function quotaPeriodEvaluation(input: {
  recurrence: QuotaRecurrence;
  logicalDate: string;
  history?: readonly TaskStateHistoryRow[];
  quotaPeriodFacts?: readonly TaskQuotaPeriodFact[];
}): QuotaPeriodEvaluation {
  const bounds = quotaPeriodBounds(input.logicalDate, input.recurrence.period);
  const start = eligibleStart(input.recurrence, bounds);
  const daysRemainingIncludingToday = input.logicalDate < start
    ? 0
    : input.logicalDate > bounds.end
      ? 0
      : daysBetween(input.logicalDate, bounds.end) + 1;
  const history = input.history ?? [];
  const successesThisPeriod = distinctSuccessDates(history, bounds, input.logicalDate, input.recurrence).size;
  const incomingBalance = incomingBalanceForPeriod(input.recurrence, bounds, history, input.quotaPeriodFacts);
  const baseQuota = quotaBaseQuota(input.recurrence, bounds);
  const requiredThisPeriod = Math.max(0, baseQuota - incomingBalance);
  const remainingRequired = Math.max(0, requiredThisPeriod - successesThisPeriod);
  const dueToday = daysRemainingIncludingToday > 0 && remainingRequired >= daysRemainingIncludingToday;
  const nextMandatoryDate = remainingRequired > 0 && daysRemainingIncludingToday > 0
    ? dateRange(input.logicalDate, bounds.end).find((date) => {
      const daysRemaining = daysBetween(date, bounds.end) + 1;
      return remainingRequired >= daysRemaining;
    }) ?? null
    : null;
  const nextBalance = input.recurrence.balanceEnabled
    ? incomingBalance + successfulDaysForPeriod(history, bounds, input.recurrence) - baseQuota
    : 0;
  return {
    baseQuota,
    incomingBalance,
    successesThisPeriod,
    requiredThisPeriod,
    remainingRequired,
    daysRemainingIncludingToday,
    dueToday,
    nextMandatoryDate,
    nextBalance,
  };
}

export function quotaDateIsMandatory(input: {
  recurrence: QuotaRecurrence;
  logicalDate: string;
  history?: readonly TaskStateHistoryRow[];
  quotaPeriodFacts?: readonly TaskQuotaPeriodFact[];
}) {
  const bounds = quotaPeriodBounds(input.logicalDate, input.recurrence.period);
  const start = eligibleStart(input.recurrence, bounds);
  if (input.logicalDate < start || input.logicalDate > bounds.end) return false;
  return quotaPeriodEvaluation(input).dueToday;
}

export function quotaNextBalance(input: {
  recurrence: QuotaRecurrence;
  periodDate: string;
  history?: readonly TaskStateHistoryRow[];
  quotaPeriodFacts?: readonly TaskQuotaPeriodFact[];
}) {
  return quotaPeriodEvaluation({
    recurrence: input.recurrence,
    logicalDate: quotaPeriodBounds(input.periodDate, input.recurrence.period).end,
    history: input.history,
    quotaPeriodFacts: input.quotaPeriodFacts,
  }).nextBalance;
}

export type QuotaPeriodFactDraft = {
  periodKind: QuotaPeriod;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  baseQuota: number;
  incomingBalance: number;
  successfulDays: number;
  nextBalance: number;
  balanceEnabled: boolean;
  eventKind: "period_close" | "clear_balance";
  scheduleBoundaryId: string | null;
  idempotenceIdentity: string;
};

export function quotaPeriodFactFor(input: {
  recurrence: QuotaRecurrence;
  periodDate: string;
  history?: readonly TaskStateHistoryRow[];
  quotaPeriodFacts?: readonly TaskQuotaPeriodFact[];
  eventKind: "period_close" | "clear_balance";
  idempotenceIdentity: string;
}): QuotaPeriodFactDraft {
  const bounds = quotaPeriodBounds(input.periodDate, input.recurrence.period);
  const history = input.history ?? [];
  const evaluation = quotaPeriodEvaluation({
    recurrence: input.recurrence,
    logicalDate: bounds.end,
    history,
    quotaPeriodFacts: input.quotaPeriodFacts,
  });
  return {
    periodKind: input.recurrence.period,
    periodKey: bounds.key,
    periodStart: bounds.start,
    periodEnd: bounds.end,
    baseQuota: evaluation.baseQuota,
    incomingBalance: evaluation.incomingBalance,
    successfulDays: successfulDaysForPeriod(history, bounds, input.recurrence),
    nextBalance: input.eventKind === "clear_balance" ? 0 : evaluation.nextBalance,
    balanceEnabled: input.recurrence.balanceEnabled,
    eventKind: input.eventKind,
    scheduleBoundaryId: input.recurrence.scheduleBoundaryId ?? null,
    idempotenceIdentity: input.idempotenceIdentity,
  };
}

export function quotaPeriodLabel(period: QuotaPeriod) {
  return period === "week" ? "week" : "month";
}

function calendarState(outcome: TaskHistoryOutcome | null, date: string, today: string, mandatory: boolean): TaskCalendarState {
  if (outcome === "done") return "done";
  if (outcome === "did_my_best") return "did_my_best";
  if (outcome === "missed") return "missed";
  if (outcome === "complete") return "complete";
  if (!mandatory) return "not_due";
  return date === today ? "open" : date < today ? "missed" : "scheduled";
}

function quotaTimelineDay(
  taskId: string,
  logicalDate: string,
  state: TaskCalendarState,
  today: string,
  outcome: TaskHistoryOutcome | null,
  behaviorPolicy: TaskBehaviorPolicy,
  historyRowId: string | null = null,
): TaskEffectiveTimelineDay {
  const mandatory = state === "open" || state === "scheduled" || state === "missed";
  return {
    logicalDate,
    state,
    sourceKind: historyRowId ? "history_fact" : "calculated",
    handled: outcome !== null,
    outcome,
    historyRowId,
    calendarOverrideId: null,
    workflowOccurrenceId: null,
    workflowCommandId: null,
    workflowRevision: null,
    occurrenceIdentity: mandatory ? occurrenceIdentity(taskId, logicalDate) : null,
    occurrenceDueOn: mandatory ? logicalDate : null,
    obligation: mandatory ? (logicalDate < today ? "overdue" : "due") : "none",
    behaviorPolicy,
    unhandled: outcome === null && state === "missed",
  };
}

function quotaStreaks(days: Record<string, TaskEffectiveTimelineDay>, today: string) {
  const dates = Object.keys(days).sort();
  let currentCompletedStreak = 0;
  let currentMissedStreak = 0;
  let longestMissedStreak = 0;
  let missedRun = 0;
  for (const date of dates) {
    const state = days[date]!.state;
    if (state === "done" || state === "did_my_best") currentCompletedStreak += 1;
    else if (date <= today && state !== "not_due") currentCompletedStreak = 0;
    if (state === "missed") {
      missedRun += 1;
      longestMissedStreak = Math.max(longestMissedStreak, missedRun);
    } else if (date <= today) {
      missedRun = 0;
    }
  }
  for (const date of [...dates].reverse()) {
    if (date > today) continue;
    if (days[date]!.state === "missed") currentMissedStreak += 1;
    else break;
  }
  return { currentCompletedStreak, currentMissedStreak, longestMissedStreak };
}

export function evaluateQuotaTaskState(input: TaskStateEngineInput): TaskStateEngineResult {
  const recurrence = input.task.recurrence as QuotaRecurrence;
  const logicalDate = logicalDateForTimestamp(input.now, input.timezone, input.logicalDayRollover);
  const behaviorPolicy = input.behaviorPolicy!;
  const rows = input.history.filter((row) => row.taskId === input.task.id).map((row) => ({ ...row }));
  const quotaPeriodFacts = input.quotaPeriodFacts ?? [];
  const byDate = new Map(rows.map((row) => [row.logicalDate, row]));
  const changes: TaskHistoryChange[] = [];
  const action = input.action?.type === "record_outcome" ? input.action : null;
  const actionDate = action?.logicalDate ?? logicalDate;
  const existing = byDate.get(actionDate);
  let isComplete = input.task.lifecycle === "complete" || rows.some((row) => row.outcome === "complete");

  if (input.action?.type === "reconcile_rollover" && !isComplete && input.task.lifecycle === "active") {
    const scheduleStart = recurrence.activationDate ?? input.task.dueOn ?? logicalDate;
    const latestHistoryDate = rows.map((row) => row.logicalDate).sort().at(-1);
    let cursor = latestHistoryDate && latestHistoryDate >= scheduleStart
      ? shiftDateKey(latestHistoryDate, 1)
      : scheduleStart;
    const end = shiftDateKey(logicalDate, -1);
    while (cursor <= end) {
      if (!byDate.has(cursor) && quotaDateIsMandatory({ recurrence, logicalDate: cursor, history: rows, quotaPeriodFacts })) {
        const row: TaskStateHistoryRow = {
          id: `task-state:${input.task.id}:${cursor}:missed:rollover`,
          taskId: input.task.id,
          logicalDate: cursor,
          outcome: "missed",
          provenance: "rollover",
          occurredAt: new Date().toISOString(),
          occurrenceIdentity: occurrenceIdentity(input.task.id, cursor),
          occurrenceDueOn: cursor,
          countedAsDueOccurrence: true,
          wasCompleted: false,
          eventType: "status",
        };
        rows.push(row);
        byDate.set(cursor, row);
        changes.push({ type: "insert", row });
      }
      cursor = shiftDateKey(cursor, 1);
    }
  }

  if (action && !isComplete) {
    let reason: string | null = null;
    if (input.task.lifecycle !== "active") reason = `Cannot record outcomes for ${input.task.lifecycle} tasks.`;
    else if (existing && !action.replaceExisting) reason = "Only one outcome is allowed per task per logical day.";
    else if (action.outcome === "delayed") reason = "Delay is unavailable for quota recurrence.";
    else if (action.outcome === "missed" && !quotaDateIsMandatory({ recurrence, logicalDate: actionDate, history: rows })) {
      reason = "Missed requires a mathematically mandatory quota day.";
    }
    if (reason) {
      changes.push({ type: "reject", logicalDate: actionDate, outcome: action.outcome, reason });
    } else {
      const evaluation = quotaPeriodEvaluation({ recurrence, logicalDate: actionDate, history: rows, quotaPeriodFacts });
      const extraWithoutBalance = SUCCESSFUL_QUOTA_OUTCOMES.has(action.outcome)
        && !recurrence.balanceEnabled
        && evaluation.remainingRequired === 0;
      const row: TaskStateHistoryRow = {
        id: `task-state:${input.task.id}:${actionDate}:${action.outcome}:${action.provenance ?? "manual"}`,
        taskId: input.task.id,
        logicalDate: actionDate,
        outcome: action.outcome,
        provenance: action.provenance ?? "manual",
        occurredAt: action.occurredAt ?? new Date().toISOString(),
        occurrenceIdentity: action.outcome === "complete" || extraWithoutBalance ? null : occurrenceIdentity(input.task.id, actionDate),
        occurrenceDueOn: action.outcome === "complete" || extraWithoutBalance ? null : actionDate,
        countedAsDueOccurrence: !extraWithoutBalance,
        wasCompleted: SUCCESSFUL_OUTCOMES.has(action.outcome),
        eventType: action.outcome === "complete" ? "completed_permanently" : "status",
      };
      if (action.replaceExisting) {
        const index = rows.findIndex((candidate) => candidate.logicalDate === actionDate);
        if (index >= 0) rows.splice(index, 1);
      }
      rows.push(row);
      byDate.set(actionDate, row);
      changes.push({ type: "insert", row });
      if (action.outcome === "complete") isComplete = true;
    }
  }

  const bounds = quotaPeriodBounds(logicalDate, recurrence.period);
  const rangeStart = input.calendarStart ?? shiftDateKey(logicalDate, -40);
  const rangeEnd = input.calendarEnd ?? shiftDateKey(logicalDate, 40);
  const days: Record<string, TaskEffectiveTimelineDay> = {};
  const calendar: Record<string, TaskCalendarState> = {};
  for (const date of dateRange(rangeStart, rangeEnd)) {
    const row = byDate.get(date) ?? null;
    const dateEvaluation = quotaPeriodEvaluation({ recurrence, logicalDate: date, history: rows, quotaPeriodFacts });
    const state = row
      ? calendarState(row.outcome, date, logicalDate, true)
      : isComplete
        ? "no_entry"
        : calendarState(null, date, logicalDate, dateEvaluation.dueToday);
    const day = quotaTimelineDay(input.task.id, date, state, logicalDate, row?.outcome ?? null, behaviorPolicy, row?.id ?? null);
    days[date] = day;
    calendar[date] = state;
  }
  const currentEvaluation = quotaPeriodEvaluation({ recurrence, logicalDate, history: rows, quotaPeriodFacts });
  const currentPeriodKey = bounds.key;
  const currentRow = byDate.get(logicalDate) ?? null;
  const latestMissedCandidate = [...rows].filter((row) => row.outcome === "missed").sort((left, right) => left.logicalDate.localeCompare(right.logicalDate)).at(-1) ?? null;
  const latestSuccessDate = [...rows]
    .filter((row) => SUCCESSFUL_QUOTA_OUTCOMES.has(row.outcome))
    .sort((left, right) => left.logicalDate.localeCompare(right.logicalDate))
    .at(-1)?.logicalDate ?? null;
  const latestMissedRow = latestMissedCandidate && (!latestSuccessDate || latestSuccessDate <= latestMissedCandidate.logicalDate)
    ? latestMissedCandidate
    : null;
  const currentDue = !isComplete && currentEvaluation.dueToday;
  const nextDueDate = isComplete
    ? null
    : currentDue
      ? logicalDate
      : currentEvaluation.nextMandatoryDate
        ?? (() => {
          const nextPeriodDate = shiftDateKey(bounds.end, 1);
          const nextEvaluation = quotaPeriodEvaluation({ recurrence, logicalDate: nextPeriodDate, history: rows, quotaPeriodFacts });
          return nextEvaluation.nextMandatoryDate;
        })();
  const activeStatus: TaskActiveStatus = isComplete
    ? "complete"
    : currentRow?.outcome === "missed"
      ? "missed"
      : currentRow?.outcome === "done"
        ? "done"
        : currentRow?.outcome === "did_my_best"
          ? "did_my_best"
          : currentDue
            ? "pending"
            : latestMissedRow ? "missed" : "not_due";
  const timelineStreaks = quotaStreaks(days, logicalDate);
  const timeline: TaskEffectiveTimeline = {
    days,
    activeStatus,
    activeOccurrenceDueOn: currentDue ? logicalDate : null,
    ...timelineStreaks,
    currentObligation: currentDue ? "due" : "none",
    nextDueOn: nextDueDate,
    recurrenceAnchor: recurrence.activationDate ?? null,
    replayCheckpoint: null,
    unresolvedDueOn: currentRow?.outcome === "missed" ? logicalDate : null,
  };
  const rewardRow = changes.findLast((change) => change.type === "insert" && SUCCESSFUL_OUTCOMES.has(change.row.outcome)) as Extract<TaskHistoryChange, { type: "insert" }> | undefined;
  const rewardEligibility: RewardEligibility = rewardRow && rewardRow.row.countedAsDueOccurrence !== false && behaviorPolicy.rewards === "enabled"
    ? { eligible: !rewardRow.row.rewardClaimed, identity: `task-reward:${input.task.id}:${rewardRow.row.logicalDate}:${rewardRow.row.outcome}`, logicalDate: rewardRow.row.logicalDate, outcome: rewardRow.row.outcome, reason: rewardRow.row.rewardClaimed ? "already_claimed" : "eligible" }
    : { eligible: false, identity: null, logicalDate: rewardRow?.row.logicalDate ?? null, outcome: rewardRow?.row.outcome ?? null, reason: behaviorPolicy.rewards === "disabled" ? "disabled" : rewardRow ? "ineligible_outcome" : "no_outcome" };
  const proposedTaskPatch = {
    ...(input.task.activeStatus !== activeStatus ? { status: activeStatus } : {}),
    ...(input.task.dueOn !== nextDueDate ? { dueOn: nextDueDate } : {}),
    ...(isComplete ? { completedAt: currentRow?.occurredAt ?? new Date().toISOString(), dueOn: null } : {}),
    ...((input.task.quotaIncomingBalance ?? 0) !== (recurrence.balanceEnabled ? currentEvaluation.incomingBalance : 0)
      || (input.task.quotaIncomingBalancePeriodKey ?? null) !== (recurrence.balanceEnabled ? currentPeriodKey : null)
      ? {
        repeatQuotaBalance: recurrence.balanceEnabled ? currentEvaluation.incomingBalance : 0,
        repeatQuotaBalancePeriod: recurrence.balanceEnabled ? currentPeriodKey : null,
      }
      : {}),
  };
  return {
    behaviorPolicy,
    logicalDate,
    lifecycle: input.task.lifecycle,
    activeStatus,
    calendar,
    handledCurrentDay: currentRow !== null,
    currentDayOutcome: {
      outcome: currentRow?.outcome ?? null,
      missedToday: currentRow?.outcome === "missed",
      successful: currentRow ? SUCCESSFUL_OUTCOMES.has(currentRow.outcome) : false,
      delayed: currentRow?.outcome === "delayed",
    },
    continuousOverdue: { active: currentRow?.outcome === "missed", frozenDueOn: currentRow?.outcome === "missed" ? logicalDate : null, firstMissedDate: currentRow?.outcome === "missed" ? logicalDate : null },
    recurrenceAnchor: recurrence.activationDate ?? null,
    nextDueDate,
    satisfiedOccurrenceIdentity: currentRow?.occurrenceIdentity ?? null,
    unresolvedOccurrenceIdentity: currentRow?.outcome === "missed" ? currentRow.occurrenceIdentity ?? null : null,
    unresolvedOccurrenceDueOn: currentRow?.outcome === "missed" ? logicalDate : null,
    proposedHistoryChanges: changes,
    proposedTaskPatch,
    streakDisposition: currentRow?.outcome === "missed" ? "increment_missed" : currentRow && SUCCESSFUL_OUTCOMES.has(currentRow.outcome) ? "increment_positive" : "none" as StreakDisposition,
    rewardEligibility,
    timeline,
    validationErrors: changes.flatMap((change) => change.type === "reject" ? [change.reason] : []),
  };
}
