import type { Task, TaskHistory } from "@/lib/database.types";
import type { TaskDisplayStatusByTaskId } from "@/lib/task-display-status";
import { deduplicateTaskHistoryByLogicalDate } from "@/lib/task-history";
import type { CanonicalTaskStateColumns } from "../task-state-canonical/types.ts";
import { buildCompatibilityTaskStateEngineInput, buildDirectTaskStateEngineInput, isCanonicalArchivedOrTrashed, type CanonicalProjectedTaskState } from "./direct-input.ts";
import { evaluateTaskState } from "./engine.ts";

/**
 * Compatibility export retained for callers that still gate Task State
 * integration. Active Status reads themselves always use the engine below.
 */
export const TASK_STATE_ENGINE_INTEGRATION_ENABLED = true;

export type ActiveStatusAuthority = "engine";
export type ActiveStatusReadResult = {
  authority: ActiveStatusAuthority;
  statusesByTaskId: TaskDisplayStatusByTaskId;
  dueOnByTaskId: Record<string, string | null>;
};

type ActiveStatusReadTask = Task & Partial<CanonicalTaskStateColumns> & { canonical_schedule_boundary?: CanonicalProjectedTaskState["canonical_schedule_boundary"] };
type ActiveStatusReadInput = {
  enabled?: boolean;
  historyByTaskId: Record<string, TaskHistory[]>;
  logicalDayRollover: string;
  now: string | Date;
  tasks: ActiveStatusReadTask[];
  timezone: string;
};

function resolveTaskStatuses(input: ActiveStatusReadInput, compatibilityOnly: boolean): ActiveStatusReadResult {
  const statusesByTaskId: TaskDisplayStatusByTaskId = {};
  const dueOnByTaskId: Record<string, string | null> = {};
  for (const task of input.tasks) {
    const normalizedHistory = deduplicateTaskHistoryByLogicalDate(input.historyByTaskId[task.id] ?? []);
    if (isCanonicalArchivedOrTrashed(task)) {
      statusesByTaskId[task.id] = task.container_state === "trashed" || task.status === "trashed" ? "trashed" : "archived";
      continue;
    }
    const buildInput = compatibilityOnly ? buildCompatibilityTaskStateEngineInput : buildDirectTaskStateEngineInput;
    const engineInput = buildInput(task, normalizedHistory, {
      now: input.now,
      timezone: input.timezone,
      logicalDayRollover: input.logicalDayRollover,
    });
    const evaluated = evaluateTaskState(engineInput);
    statusesByTaskId[task.id] = evaluated.activeStatus;
    dueOnByTaskId[task.id] = evaluated.nextDueDate;
  }
  return { authority: "engine", dueOnByTaskId, statusesByTaskId };
}

/** The production shared Active Status authority. */
export function resolveActiveTaskStatuses(input: ActiveStatusReadInput): ActiveStatusReadResult {
  return resolveTaskStatuses(input, false);
}

/** Compatibility-only Active Status translation for legacy/test-shaped Task fixtures. */
export function resolveCompatibilityTaskStatuses(input: ActiveStatusReadInput): ActiveStatusReadResult {
  return resolveTaskStatuses(input, true);
}

/** Presentation-only copies; never pass these to a persistence mutation. */
export function projectTasksForActiveStatusRead(
  tasks: Task[],
  statusesByTaskId: TaskDisplayStatusByTaskId,
  dueOnByTaskId: Record<string, string | null> = {},
) {
  return tasks.map((task) => {
    const hasCanonicalStatus = Object.hasOwn(statusesByTaskId, task.id);
    const hasCanonicalDueOn = Object.hasOwn(dueOnByTaskId, task.id);
    const status = hasCanonicalStatus ? statusesByTaskId[task.id]! : task.status;
    const projectedStatus = status === "unscheduled" ? task.status : status;
    const dueOn = hasCanonicalDueOn ? dueOnByTaskId[task.id] ?? null : task.due_on;
    // The database-backed Task row remains valid when the engine-only display
    // status is unscheduled. Callers must consume the map for presentation.
    if (projectedStatus === task.status && dueOn === task.due_on) return task;
    return {
      ...task,
      ...(projectedStatus !== task.status ? { status: projectedStatus } : {}),
      ...(hasCanonicalDueOn ? { due_on: dueOn } : {}),
    };
  });
}
