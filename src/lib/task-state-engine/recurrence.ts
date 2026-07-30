import { daysBetween, formatDateKey, parseDateKey, shiftDateKey } from "./calendar.ts";
import type { MonthlyOrdinal, TaskRecurrence } from "./types.ts";

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
  return isUntilComplete(recurrence)
    ? new Set(["did_my_best", "complete", "missed", "delayed"] as const)
    : new Set(["done", "did_my_best", "missed", "delayed"] as const);
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

export function scheduledOccurrences(
  recurrence: TaskRecurrence,
  dueOn: string,
  from: string,
  through: string,
) {
  if (recurrence.kind === "none" || recurrence.kind === "rolling") {
    return dueOn >= from && dueOn <= through ? [dueOn] : [];
  }
  const occurrences = new Set<string>();
  if (recurrence.kind === "weekly") {
    const interval = Math.max(1, recurrence.intervalWeeks ?? 1);
    const anchor = recurrence.anchorDate ?? dueOn;
    const anchorWeek = weekStart(anchor);
    const weekdays = recurrence.weekdays.length > 0 ? recurrence.weekdays : [parseDateKey(dueOn).getUTCDay()];
    for (let cursor = shiftDateKey(from, -7); cursor <= shiftDateKey(through, 7); cursor = shiftDateKey(cursor, 1)) {
      const weeks = Math.floor(daysBetween(anchorWeek, weekStart(cursor)) / 7);
      if (weeks >= 0 && weeks % interval === 0 && weekdays.includes(parseDateKey(cursor).getUTCDay()) && cursor >= dueOn) {
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
        if (monthDistance < 0 || monthDistance % interval !== 0) continue;
        const occurrence = monthlyOccurrence(year, month, recurrence, anchor.getUTCDate());
        if (occurrence >= dueOn && occurrence >= from && occurrence <= through) occurrences.add(occurrence);
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
  const satisfied = dueOn && dueOn <= actionDate && !consumed.has(dueOn)
    ? dueOn
    : nextFixedOccurrence(recurrence, seed, actionDate, consumed);
  if (satisfied) consumed.add(satisfied);
  const nextDue = nextFixedOccurrence(recurrence, seed, satisfied ? shiftDateKey(satisfied, 1) : actionDate, consumed);
  return { anchor: satisfied ?? actionDate, nextDue, satisfied };
}

export function occurrenceIdentity(taskId: string, dueDate: string) {
  return `task:${taskId}:occurrence:${dueDate}`;
}
