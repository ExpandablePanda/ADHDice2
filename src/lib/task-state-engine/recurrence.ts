import { daysBetween, formatDateKey, parseDateKey, shiftDateKey } from "./calendar.ts";
import type { MonthlyOrdinal, TaskRecurrence, TaskStateHistoryRow } from "./types.ts";

export function isUnscheduled(recurrence: TaskRecurrence, dueOn: string | null) {
  return recurrence.kind === "none" && dueOn === null;
}

export function isUntilComplete(recurrence: TaskRecurrence) {
  return recurrence.kind !== "none" && recurrence.untilComplete === true;
}

export function allowedOutcomes(recurrence: TaskRecurrence, unscheduled: boolean) {
  if (recurrence.kind === "none") {
    return unscheduled
      ? new Set(["did_my_best", "complete"] as const)
      : new Set(["did_my_best", "complete", "missed", "delayed"] as const);
  }
  return new Set(["done", "did_my_best", "complete", "missed", "delayed"] as const);
}

function ordinalIndex(ordinal: MonthlyOrdinal) {
  return { first: 0, second: 1, third: 2, fourth: 3, last: -1 }[ordinal];
}

function monthlyOccurrence(
  year: number,
  monthIndex: number,
  recurrence: Extract<TaskRecurrence, { kind: "monthly" }>,
  fallbackDay: number,
) {
  if (recurrence.mode === "ordinal_weekday" && recurrence.ordinal && recurrence.weekday !== null && recurrence.weekday !== undefined) {
    if (recurrence.ordinal === "last") {
      const last = new Date(Date.UTC(year, monthIndex + 1, 0));
      last.setUTCDate(last.getUTCDate() - ((last.getUTCDay() - recurrence.weekday + 7) % 7));
      return formatDateKey(last);
    }
    const first = new Date(Date.UTC(year, monthIndex, 1));
    first.setUTCDate(1 + ((recurrence.weekday - first.getUTCDay() + 7) % 7) + ordinalIndex(recurrence.ordinal) * 7);
    return formatDateKey(first);
  }
  const target = recurrence.dayOfMonth ?? fallbackDay;
  const max = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return formatDateKey(new Date(Date.UTC(year, monthIndex, Math.min(target, max))));
}

function weekStart(dateKey: string) {
  const date = parseDateKey(dateKey);
  return shiftDateKey(dateKey, -date.getUTCDay());
}

function isAlignedToInterval(distance: number, interval: number) {
  return ((distance % interval) + interval) % interval === 0;
}

export type ScheduledOccurrenceOptions = {
  includeBeforeDueOn?: boolean;
};

/**
 * Answers schedule membership independently from the live due_on cursor.
 * The cursor limits the next active occurrence, but it must not erase valid
 * fixed-schedule dates from a History calendar after the cursor advances.
 */
export function isScheduledOccurrence(
  recurrence: Extract<TaskRecurrence, { kind: "weekly" | "monthly" }>,
  dueOn: string,
  dateKey: string,
  options: ScheduledOccurrenceOptions = {},
) {
  if (!options.includeBeforeDueOn && dateKey < dueOn) return false;

  if (recurrence.kind === "weekly") {
    const interval = Math.max(1, recurrence.intervalWeeks ?? 1);
    const anchor = recurrence.anchorDate ?? dueOn;
    const weekdays = recurrence.weekdays.length > 0 ? recurrence.weekdays : [parseDateKey(anchor).getUTCDay()];
    if (!weekdays.includes(parseDateKey(dateKey).getUTCDay())) return false;
    const weekDistance = Math.floor(daysBetween(weekStart(anchor), weekStart(dateKey)) / 7);
    return isAlignedToInterval(weekDistance, interval);
  }

  const interval = Math.max(1, recurrence.intervalMonths ?? 1);
  const anchor = parseDateKey(recurrence.anchorDate ?? dueOn);
  const date = parseDateKey(dateKey);
  const monthDistance = (date.getUTCFullYear() - anchor.getUTCFullYear()) * 12
    + date.getUTCMonth() - anchor.getUTCMonth();
  return isAlignedToInterval(monthDistance, interval)
    && dateKey === monthlyOccurrence(date.getUTCFullYear(), date.getUTCMonth(), recurrence, anchor.getUTCDate());
}

export function scheduledOccurrences(
  recurrence: TaskRecurrence,
  dueOn: string,
  from: string,
  through: string,
  options: ScheduledOccurrenceOptions = {},
) {
  if (recurrence.kind === "none") {
    return dueOn >= from && dueOn <= through ? [dueOn] : [];
  }
  const occurrences = new Set<string>();
  if (recurrence.kind === "rolling") {
    const interval = Math.max(1, recurrence.intervalDays);
    let cursor = options.includeBeforeDueOn ? from : (from > dueOn ? from : dueOn);
    while (cursor <= through) {
      const distance = daysBetween(dueOn, cursor);
      if (options.includeBeforeDueOn || distance >= 0) {
        if (isAlignedToInterval(distance, interval)) occurrences.add(cursor);
      }
      cursor = shiftDateKey(cursor, 1);
    }
  } else if (recurrence.kind === "weekly") {
    const interval = Math.max(1, recurrence.intervalWeeks ?? 1);
    const anchor = recurrence.anchorDate ?? dueOn;
    const anchorWeek = weekStart(anchor);
    const weekdays = recurrence.weekdays.length > 0 ? recurrence.weekdays : [parseDateKey(dueOn).getUTCDay()];
    for (let cursor = shiftDateKey(from, -7); cursor <= shiftDateKey(through, 7); cursor = shiftDateKey(cursor, 1)) {
      const weeks = Math.floor(daysBetween(anchorWeek, weekStart(cursor)) / 7);
      if (isAlignedToInterval(weeks, interval)
        && weekdays.includes(parseDateKey(cursor).getUTCDay())
        && (options.includeBeforeDueOn || cursor >= dueOn)
        && cursor >= from
        && cursor <= through) {
        occurrences.add(cursor);
      }
    }
  } else {
    const interval = Math.max(1, recurrence.intervalMonths ?? 1);
    const anchor = parseDateKey(recurrence.anchorDate ?? dueOn);
    const fromDate = parseDateKey(from);
    const throughDate = parseDateKey(through);
    for (let year = fromDate.getUTCFullYear(); year <= throughDate.getUTCFullYear() + 1; year += 1) {
      for (let month = 0; month < 12; month += 1) {
        const monthDistance = (year - anchor.getUTCFullYear()) * 12 + month - anchor.getUTCMonth();
        if (!isAlignedToInterval(monthDistance, interval)) continue;
        const occurrence = monthlyOccurrence(year, month, recurrence, anchor.getUTCDate());
        if ((options.includeBeforeDueOn || occurrence >= dueOn) && occurrence >= from && occurrence <= through) occurrences.add(occurrence);
      }
    }
  }
  return [...occurrences].sort();
}

export function nextFixedOccurrence(
  recurrence: Extract<TaskRecurrence, { kind: "weekly" | "monthly" }>,
  dueOn: string,
  onOrAfter: string,
  consumed: Set<string>,
) {
  const candidates = scheduledOccurrences(recurrence, dueOn, onOrAfter, shiftDateKey(onOrAfter, 800));
  return candidates.find((date) => !consumed.has(date)) ?? null;
}

/** Finds the next fixed-calendar occurrence on or after an action date. */
export function nextFixedOccurrenceOnOrAfter(
  recurrence: Extract<TaskRecurrence, { kind: "weekly" | "monthly" }>,
  dueOn: string,
  onOrAfter: string,
  consumed: Set<string>,
) {
  const candidates = scheduledOccurrences(
    recurrence,
    dueOn,
    onOrAfter,
    shiftDateKey(onOrAfter, 800),
    { includeBeforeDueOn: true },
  );
  return candidates.find((date) => !consumed.has(date)) ?? null;
}

export function recurrenceAfterSuccess(
  recurrence: TaskRecurrence,
  dueOn: string | null,
  actionDate: string,
  consumed: Set<string>,
) {
  if (recurrence.kind === "none") {
    return { anchor: null, nextDue: dueOn, satisfied: null };
  }
  if (recurrence.kind === "rolling") {
    return {
      anchor: actionDate,
      nextDue: shiftDateKey(actionDate, Math.max(1, recurrence.intervalDays)),
      satisfied: dueOn,
    };
  }
  const seed = dueOn ?? actionDate;
  const satisfied = dueOn && actionDate <= dueOn && !consumed.has(dueOn)
    ? dueOn
    : nextFixedOccurrenceOnOrAfter(recurrence, seed, actionDate, consumed);
  if (satisfied) consumed.add(satisfied);
  const nextDue = nextFixedOccurrence(recurrence, seed, satisfied ? shiftDateKey(satisfied, 1) : actionDate, consumed);
  return { anchor: satisfied ?? actionDate, nextDue, satisfied };
}

export type SuccessfulOccurrenceTarget = {
  occurrenceDueOn: string | null;
  occurrenceIdentity: string | null;
};

function occurrenceDateFromIdentity(identity: string | null | undefined) {
  const date = identity?.split(":").at(-1) ?? null;
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function historyOccurrenceDate(row: TaskStateHistoryRow) {
  return row.occurrenceDueOn ?? occurrenceDateFromIdentity(row.occurrenceIdentity);
}

function consumedOccurrenceDates(history: readonly TaskStateHistoryRow[]) {
  return new Set(
    history
      .map(historyOccurrenceDate)
      .filter((date): date is string => Boolean(date)),
  );
}

/**
 * Resolves the occurrence a successful outcome satisfies. Explicit metadata
 * always wins. Implicit legacy inference is deliberately limited to a prior
 * Missed fact so an old identity-less success cannot consume an arbitrary
 * current or future occurrence.
 */
export function resolveSuccessfulOccurrenceTarget(input: {
  taskId: string;
  recurrence: TaskRecurrence;
  dueOn: string | null;
  historicalScheduleAnchor?: string | null;
  logicalDate: string;
  occurrenceIdentity?: string | null;
  occurrenceDueOn?: string | null;
  history?: readonly TaskStateHistoryRow[];
  allowImplicitTarget?: boolean;
  requirePriorMissed?: boolean;
}): SuccessfulOccurrenceTarget {
  const explicitDueOn = input.occurrenceDueOn ?? occurrenceDateFromIdentity(input.occurrenceIdentity);
  if (input.occurrenceIdentity || explicitDueOn) {
    return {
      occurrenceDueOn: explicitDueOn,
      occurrenceIdentity: input.occurrenceIdentity ?? (explicitDueOn ? occurrenceIdentity(input.taskId, explicitDueOn) : null),
    };
  }

  if (!input.allowImplicitTarget) return { occurrenceDueOn: null, occurrenceIdentity: null };

  const history = input.history ?? [];
  const priorMissed = history.some((row) => row.outcome === "missed" && row.logicalDate < input.logicalDate);
  if (input.requirePriorMissed && (
    !priorMissed
    || input.recurrence.kind === "rolling"
      && !history.some((row) => row.outcome === "missed" && historyOccurrenceDate(row) === input.dueOn)
  )) return { occurrenceDueOn: null, occurrenceIdentity: null };

  if (input.recurrence.kind === "rolling") {
    if (input.recurrence.intervalDays === 1) {
      return { occurrenceDueOn: null, occurrenceIdentity: null };
    }
    if (!input.dueOn) {
      return { occurrenceDueOn: null, occurrenceIdentity: null };
    }
    return {
      occurrenceDueOn: input.dueOn,
      occurrenceIdentity: occurrenceIdentity(input.taskId, input.dueOn),
    };
  }

  if (input.recurrence.kind !== "weekly" && input.recurrence.kind !== "monthly") {
    return { occurrenceDueOn: null, occurrenceIdentity: null };
  }

  // Once the current fixed cursor has already been satisfied, an additional
  // action before the next scheduled date is a Not Due entry, not a second
  // early completion. A still-unresolved Missed cursor remains actionable.
  if (input.dueOn && input.dueOn < input.logicalDate && history.some((row) => (
    (row.outcome === "done" || row.outcome === "did_my_best" || row.outcome === "complete")
    && historyOccurrenceDate(row) === input.dueOn
  ))) {
    return { occurrenceDueOn: null, occurrenceIdentity: null };
  }

  const seed = input.dueOn ?? input.historicalScheduleAnchor ?? input.logicalDate;
  const satisfied = nextFixedOccurrenceOnOrAfter(
    input.recurrence,
    seed,
    input.logicalDate,
    consumedOccurrenceDates(history),
  );
  return satisfied
    ? { occurrenceDueOn: satisfied, occurrenceIdentity: occurrenceIdentity(input.taskId, satisfied) }
    : { occurrenceDueOn: null, occurrenceIdentity: null };
}

export function occurrenceIdentity(taskId: string, dueDate: string) {
  return `task:${taskId}:occurrence:${dueDate}`;
}
