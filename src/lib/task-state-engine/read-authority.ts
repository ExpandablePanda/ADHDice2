import type { Task, TaskHistory } from "@/lib/database.types";
import type { TaskDisplayStatusByTaskId } from "@/lib/task-display-status";
import { deduplicateTaskHistoryByLogicalDate } from "@/lib/task-history";
import type { CanonicalTaskStateColumns } from "../task-state-canonical/types.ts";
import { adaptLegacyTaskState } from "./legacy-adapter.ts";
import { evaluateTaskState } from "./engine.ts";

/**
 * Compatibility export retained for callers that still gate Task State
 * integration. Active Status reads themselves always use the engine below.
 */
export const TASK_STATE_ENGINE_INTEGRATION_ENABLED = true;
/** @deprecated Use TASK_STATE_ENGINE_INTEGRATION_ENABLED. */
export const TASK_STATE_ENGINE_ACTIVE_STATUS_READ_ENABLED = TASK_STATE_ENGINE_INTEGRATION_ENABLED;

export type ActiveStatusAuthority = "engine";
export type ActiveStatusReadResult = {
  authority: ActiveStatusAuthority;
  statusesByTaskId: TaskDisplayStatusByTaskId;
};

type ActiveStatusReadTask = Task & Partial<Pick<CanonicalTaskStateColumns, "workflow_state" | "workflow_logical_date">>;

export function resolveActiveTaskStatuses(input: {
  enabled?: boolean;
  historyByTaskId: Record<string, TaskHistory[]>;
  logicalDayRollover: string;
  now: string | Date;
  tasks: ActiveStatusReadTask[];
  timezone: string;
}): ActiveStatusReadResult {
  const statusesByTaskId: TaskDisplayStatusByTaskId = {};
  for (const task of input.tasks) {
    const normalizedHistory = deduplicateTaskHistoryByLogicalDate(input.historyByTaskId[task.id] ?? []);
    if (task.status === "archived" || task.status === "trashed") {
      statusesByTaskId[task.id] = task.status;
      continue;
    }
    const taskForRead = task.workflow_state === "in_progress" && task.workflow_logical_date
      ? {
        ...task,
        status: "in_progress" as const,
        active_status_logical_date: task.workflow_logical_date,
      }
      : task;
    const adapted = adaptLegacyTaskState(taskForRead, normalizedHistory, {
      now: input.now,
      timezone: input.timezone,
      logicalDayRollover: input.logicalDayRollover,
    });
    const evaluatedStatus = evaluateTaskState(adapted.engineInput).activeStatus;
    statusesByTaskId[task.id] = evaluatedStatus;
  }
  return { authority: "engine", statusesByTaskId };
}

/** Presentation-only copies; never pass these to a persistence mutation. */
export function projectTasksForActiveStatusRead(tasks: Task[], statusesByTaskId: TaskDisplayStatusByTaskId) {
  return tasks.map((task) => {
    const status = statusesByTaskId[task.id] ?? task.status;
    // The database-backed Task row remains valid when the engine-only display
    // status is unscheduled. Callers must consume the map for presentation.
    return status === task.status || status === "unscheduled" ? task : { ...task, status };
  });
}
