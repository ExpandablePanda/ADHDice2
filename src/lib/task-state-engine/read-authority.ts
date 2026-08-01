import type { Task, TaskHistory, TaskStatus } from "@/lib/database.types";
import { getTaskDisplayStatusWithHistory } from "@/lib/task-cockpit";
import { logicalDateForTimestamp } from "./calendar.ts";
import { adaptLegacyTaskState } from "./legacy-adapter.ts";
import { evaluateTaskState } from "./engine.ts";

/**
 * One temporary owner for production Calendar and user-action integration.
 * Keep this as the only compatibility switch until the legacy rollover path
 * can be replaced in 7.6.7.
 */
export const TASK_STATE_ENGINE_INTEGRATION_ENABLED = true;
/** @deprecated Use TASK_STATE_ENGINE_INTEGRATION_ENABLED. */
export const TASK_STATE_ENGINE_ACTIVE_STATUS_READ_ENABLED = TASK_STATE_ENGINE_INTEGRATION_ENABLED;

export type ActiveStatusAuthority = "engine" | "legacy";
export type ActiveStatusReadResult = {
  authority: ActiveStatusAuthority;
  statusesByTaskId: Record<string, TaskStatus>;
};

export function resolveActiveTaskStatuses(input: {
  enabled?: boolean;
  historyByTaskId: Record<string, TaskHistory[]>;
  logicalDayRollover: string;
  now: string | Date;
  tasks: Task[];
  timezone: string;
}): ActiveStatusReadResult {
  const enabled = input.enabled ?? TASK_STATE_ENGINE_INTEGRATION_ENABLED;
  const statusesByTaskId: Record<string, TaskStatus> = {};
  for (const task of input.tasks) {
    if (!enabled) {
      statusesByTaskId[task.id] = getTaskDisplayStatusWithHistory(
        task,
        input.historyByTaskId[task.id] ?? [],
        logicalDayKey(input.now, input.timezone, input.logicalDayRollover),
      );
      continue;
    }
    if (task.status === "archived" || task.status === "trashed") {
      statusesByTaskId[task.id] = task.status;
      continue;
    }
    const adapted = adaptLegacyTaskState(task, input.historyByTaskId[task.id] ?? [], {
      now: input.now,
      timezone: input.timezone,
      logicalDayRollover: input.logicalDayRollover,
    });
    statusesByTaskId[task.id] = evaluateTaskState(adapted.engineInput).activeStatus as TaskStatus;
  }
  return { authority: enabled ? "engine" : "legacy", statusesByTaskId };
}

function logicalDayKey(now: string | Date, timezone: string, rollover: string) {
  return logicalDateForTimestamp(now, timezone, rollover);
}

/** Presentation-only copies; never pass these to a persistence mutation. */
export function projectTasksForActiveStatusRead(tasks: Task[], statusesByTaskId: Record<string, TaskStatus>) {
  return tasks.map((task) => ({ ...task, status: statusesByTaskId[task.id] ?? task.status }));
}
