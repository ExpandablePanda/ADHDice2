import type { Task, TaskHistory } from "@/lib/database.types";
import { adaptLegacyTaskState } from "./legacy-adapter.ts";
import { evaluateTaskState } from "./engine.ts";
import { TASK_STATE_ENGINE_INTEGRATION_ENABLED } from "./read-authority.ts";
import { evaluateTaskActionAuthority } from "./action-authority.ts";

export type TaskHistoryCalendarActionStatus = "done" | "did_my_best" | "delayed" | "missed" | "complete";

export type TaskHistoryCalendarAuthorityState = "delayed" | "due" | "not_due" | "upcoming" | "open" | "in_progress" | "done" | "did_my_best" | "missed" | "complete";

const CALENDAR_STATE_MAP = {
  scheduled: "due",
  no_entry: "not_due",
} as const;

/** Central Calendar read bridge. Explicit History always wins in the engine. */
export function resolveTaskHistoryCalendarStates(input: {
  enabled?: boolean;
  history: TaskHistory[];
  logicalDayRollover: string;
  now: Date | string;
  task: Task;
  timezone: string;
}) {
  if (!(input.enabled ?? TASK_STATE_ENGINE_INTEGRATION_ENABLED)) return null;
  const adapted = adaptLegacyTaskState(input.task, input.history, input);
  const result = evaluateTaskState(adapted.engineInput);
  return Object.fromEntries(Object.entries(result.calendar).map(([date, state]) => [
    date,
    state === "scheduled" || state === "no_entry" ? CALENDAR_STATE_MAP[state] : state,
  ])) as Record<string, TaskHistoryCalendarAuthorityState>;
}

/** The Calendar asks the same evaluator whether an action can be offered. */
export function resolveTaskHistoryCalendarActionStatuses(input: {
  enabled?: boolean;
  history: TaskHistory[];
  logicalDate: string;
  logicalDayRollover: string;
  now: Date | string;
  task: Task;
  timezone: string;
}) {
  if (!(input.enabled ?? TASK_STATE_ENGINE_INTEGRATION_ENABLED)) return null;
  const candidates: TaskHistoryCalendarActionStatus[] = ["done", "did_my_best", "delayed", "missed", "complete"];
  return candidates.filter((outcome) => !evaluateTaskActionAuthority({
    ...input,
    ...(outcome === "delayed" ? { delayDays: 1 } : {}),
    outcome,
    outcomeDate: input.logicalDate,
  })?.validationErrors.length);
}
