import type { Task, TaskHistory } from "@/lib/database.types";
import { deduplicateTaskHistoryByLogicalDate } from "@/lib/task-history";
import { logicalDateForTimestamp, shiftDateKey } from "./calendar.ts";
import { buildCompatibilityTaskStateEngineInput, buildDirectTaskStateEngineInput, isCanonicalArchivedOrTrashed, type CanonicalProjectedTaskState } from "./direct-input.ts";
import { evaluateTaskState } from "./engine.ts";
import { TASK_STATE_ENGINE_INTEGRATION_ENABLED } from "./read-authority.ts";
import { evaluateTaskActionAuthority } from "./action-authority.ts";
import { buildTaskEffectiveTimeline } from "./effective-timeline.ts";
import type { TaskCalendarOverride, TaskHistoryOutcome } from "./types.ts";
import type { TaskEffectiveTimeline } from "./types.ts";

export type TaskHistoryCalendarActionStatus = "done" | "did_my_best" | "delayed" | "missed" | "complete";

export type TaskHistoryCalendarAuthorityState = "delayed" | "due" | "not_due" | "in_progress" | "done" | "did_my_best" | "missed" | "complete";

const CALENDAR_STATE_MAP = {
  open: "due",
  scheduled: "due",
  no_entry: "not_due",
  upcoming: "not_due",
} as const;

function mapCalendarStates(calendar: Record<string, string>) {
  return Object.fromEntries(Object.entries(calendar).map(([date, state]) => [
    date,
    state === "open" || state === "scheduled" || state === "no_entry" || state === "upcoming" ? CALENDAR_STATE_MAP[state] : state,
  ])) as Record<string, TaskHistoryCalendarAuthorityState>;
}

export type TaskHistoryCalendarReadResult = {
  authority: "effective_timeline" | "engine_fallback";
  states: Record<string, TaskHistoryCalendarAuthorityState>;
  timeline: TaskEffectiveTimeline | null;
};

/** Central Calendar read bridge. Explicit History always wins in the engine. */
export function resolveTaskHistoryCalendarRead(input: {
  compatibilityOnly?: boolean;
  enabled?: boolean;
  history: TaskHistory[];
  calendarOverrides?: TaskCalendarOverride[];
  calendarStart?: string;
  calendarEnd?: string;
  logicalDayRollover: string;
  now: Date | string;
  task: Task;
  timezone: string;
}): TaskHistoryCalendarReadResult | null {
  if (!(input.enabled ?? TASK_STATE_ENGINE_INTEGRATION_ENABLED)) return null;
  const normalizedHistory = deduplicateTaskHistoryByLogicalDate(input.history);
  const buildInput = input.compatibilityOnly ? buildCompatibilityTaskStateEngineInput : buildDirectTaskStateEngineInput;
  const engineInput = buildInput(input.task as CanonicalProjectedTaskState, normalizedHistory, input, {
    calendarOverrides: input.calendarOverrides,
    ...(input.calendarStart ? { calendarStart: input.calendarStart } : {}),
    ...(input.calendarEnd ? { calendarEnd: input.calendarEnd } : {}),
  });

  if (!isCanonicalArchivedOrTrashed(input.task as CanonicalProjectedTaskState)) {
    const logicalDate = logicalDateForTimestamp(input.now, input.timezone, input.logicalDayRollover);
    const calendarStart = input.calendarStart ?? logicalDate;
    const calendarEnd = input.calendarEnd ?? shiftDateKey(logicalDate, 40);
    const timeline = buildTaskEffectiveTimeline({
      task: engineInput.task,
      history: engineInput.history,
      calendarOverrides: input.calendarOverrides,
      logicalDate,
      calendarStart,
      calendarEnd,
    });
    return {
      authority: "effective_timeline",
      states: mapCalendarStates(Object.fromEntries(
        Object.entries(timeline.days).map(([date, day]) => [date, day.state]),
      )),
      timeline,
    };
  }

  const result = evaluateTaskState({
    ...engineInput,
  });
  return {
    authority: "engine_fallback",
    states: mapCalendarStates(result.calendar),
    timeline: null,
  };
}

export function resolveTaskHistoryCalendarStates(input: {
  compatibilityOnly?: boolean;
  enabled?: boolean;
  history: TaskHistory[];
  calendarOverrides?: TaskCalendarOverride[];
  calendarStart?: string;
  calendarEnd?: string;
  logicalDayRollover: string;
  now: Date | string;
  task: Task;
  timezone: string;
}) {
  return resolveTaskHistoryCalendarRead(input)?.states ?? null;
}

/** The Calendar asks the same evaluator whether an action can be offered. */
export function resolveTaskHistoryCalendarActionStatuses(input: {
  compatibilityOnly?: boolean;
  enabled?: boolean;
  history: TaskHistory[];
  logicalDate: string;
  logicalDayRollover: string;
  historicalOverride?: boolean;
  now: Date | string;
  task: Task;
  timezone: string;
}) {
  if (!(input.enabled ?? TASK_STATE_ENGINE_INTEGRATION_ENABLED)) return null;
  const normalizedHistory = deduplicateTaskHistoryByLogicalDate(input.history);
  const existingEntry = normalizedHistory.find((entry) => entry.entry_date === input.logicalDate) ?? null;
  const historicalOverrideOccurrenceDueOn = input.historicalOverride
    && !existingEntry
    && input.task.repeat_frequency !== "none"
    ? input.logicalDate
    : undefined;
  const candidates: TaskHistoryCalendarActionStatus[] = ["done", "did_my_best", "delayed", "missed", "complete"];
  return candidates.filter((outcome) => !evaluateTaskActionAuthority({
    ...input,
    history: normalizedHistory,
    ...(outcome === "delayed" ? { delayDays: 1 } : {}),
    ...(input.historicalOverride ? { historicalOverride: true } : {}),
    outcome,
    outcomeDate: input.logicalDate,
    ...(existingEntry ? {
      occurrenceDueOn: existingEntry.occurrence_due_on ?? input.logicalDate,
      occurrenceIdentity: existingEntry.occurrence_key ?? undefined,
      previousOutcome: existingEntry.status as TaskHistoryOutcome,
      replaceExisting: true,
    } : {
      occurrenceDueOn: historicalOverrideOccurrenceDueOn,
    }),
  })?.validationErrors.length);
}
