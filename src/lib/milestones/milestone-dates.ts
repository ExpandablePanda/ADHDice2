import type { MilestoneAuraKind, MilestoneCompletionTiming, MilestoneTier } from "@/lib/milestones/milestone-types";

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

type CalendarDateParts = {
  day: number;
  month: number;
  year: number;
};

function parseCalendarDate(dateKey: string): CalendarDateParts {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) {
    throw new Error(`Invalid calendar date: ${dateKey}`);
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: ${dateKey}`);
  }

  return { day, month, year };
}

function formatCalendarDate(parts: CalendarDateParts) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function formatMilestoneDisplayDate(dateKey: string) {
  const { day, month, year } = parseCalendarDate(dateKey);
  return `${month}-${day}-${String(year).slice(-2)}`;
}

function calendarOrdinal(dateKey: string) {
  const { day, month, year } = parseCalendarDate(dateKey);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function addMilestoneCalendarDays(dateKey: string, days: number) {
  if (!Number.isInteger(days)) {
    throw new Error("Calendar-day adjustment must be an integer.");
  }
  const { day, month, year } = parseCalendarDate(dateKey);
  const candidate = new Date(Date.UTC(year, month - 1, day + days));
  return formatCalendarDate({
    day: candidate.getUTCDate(),
    month: candidate.getUTCMonth() + 1,
    year: candidate.getUTCFullYear(),
  });
}

export function milestoneCalendarDaysBetween(startDateKey: string, endDateKey: string) {
  return calendarOrdinal(endDateKey) - calendarOrdinal(startDateKey);
}

export function compareMilestoneCalendarDates(left: string, right: string) {
  return Math.sign(calendarOrdinal(left) - calendarOrdinal(right));
}

export function getMilestoneAuraDeadline(targetDate: string) {
  return addMilestoneCalendarDays(targetDate, 3);
}

export function classifyMilestoneCompletion(
  completionDate: string,
  targetDate: string,
  auraDeadline = getMilestoneAuraDeadline(targetDate),
): MilestoneCompletionTiming {
  if (compareMilestoneCalendarDates(completionDate, targetDate) <= 0) {
    return "on_time";
  }
  if (compareMilestoneCalendarDates(completionDate, auraDeadline) <= 0) {
    return "grace_period";
  }
  return "late";
}

export function getMilestoneAuraKind(
  tier: MilestoneTier,
  timing: MilestoneCompletionTiming,
): MilestoneAuraKind {
  if (timing === "late") {
    return "none";
  }
  return tier === "platinum" ? "diamond" : "standard";
}
