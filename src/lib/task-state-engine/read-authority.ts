import type { Task, TaskHistory } from "@/lib/database.types";
import type { TaskDisplayStatusByTaskId } from "@/lib/task-display-status";
import { deduplicateTaskHistoryByLogicalDate } from "@/lib/task-history";
import type { CanonicalTaskStateColumns } from "../task-state-canonical/types.ts";
import { buildDirectTaskStateEngineInput, isCanonicalArchivedOrTrashed, type CanonicalProjectedTaskState } from "./direct-input.ts";
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

type ActiveStatusReadTask = Task & Partial<CanonicalTaskStateColumns> & { canonical_schedule_boundary?: CanonicalProjectedTaskState["canonical_schedule_boundary"] };

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
    if (isCanonicalArchivedOrTrashed(task)) {
      statusesByTaskId[task.id] = task.container_state === "trashed" || task.status === "trashed" ? "trashed" : "archived";
      continue;
    }
    const engineInput = buildDirectTaskStateEngineInput(task, normalizedHistory, {
      now: input.now,
      timezone: input.timezone,
      logicalDayRollover: input.logicalDayRollover,
    });
    const evaluatedStatus = evaluateTaskState(engineInput).activeStatus;
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
