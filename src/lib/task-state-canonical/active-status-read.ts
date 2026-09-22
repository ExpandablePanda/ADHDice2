import type { Task, TaskHistory, TaskStatus } from "../database.types.ts";
import { sha256Digest } from "./digest.ts";
import { deduplicateTaskHistoryByLogicalDate } from "./history-deduplication.ts";
import type { CanonicalTaskStateColumns } from "./types.ts";
import { buildCompatibilityTaskStateEngineInput, buildDirectTaskStateEngineInput, isCanonicalArchivedOrTrashed, type CanonicalProjectedTaskState } from "../task-state-engine/direct-input.ts";
import { evaluateTaskState } from "../task-state-engine/engine.ts";
import type { TaskBehaviorPolicyResolutionContext } from "../task-state-engine/behavior-policy.ts";
import { logicalDateForTimestamp } from "../task-state-engine/calendar.ts";

export const ACTIVE_STATUS_READ_PROJECTION_VERSION = "active-status-read-v1" as const;
/** Compatibility export retained for callers that gate Task State integration. */
export const TASK_STATE_ENGINE_INTEGRATION_ENABLED = true;

export type ActiveStatusAuthority = "engine";
export type CanonicalActiveStatus = TaskStatus | "unscheduled";
export type CanonicalActiveStatusByTaskId = Record<string, CanonicalActiveStatus>;

export type ActiveStatusReadResult = {
  authority: ActiveStatusAuthority;
  statusesByTaskId: CanonicalActiveStatusByTaskId;
  dueOnByTaskId: Record<string, string | null>;
};

export type ActiveStatusReadTask = Task & Partial<CanonicalTaskStateColumns> & {
  canonical_schedule_anchor_date?: string | null;
  canonical_schedule_boundary?: CanonicalProjectedTaskState["canonical_schedule_boundary"];
};

export type ActiveStatusReadInput = TaskBehaviorPolicyResolutionContext & {
  enabled?: boolean;
  historyByTaskId: Record<string, TaskHistory[]>;
  logicalDayRollover: string;
  now: string | Date;
  tasks: ActiveStatusReadTask[];
  timezone: string;
};

export type ActiveStatusTaskReadInput = Omit<ActiveStatusReadInput, "historyByTaskId" | "tasks"> & {
  history: TaskHistory[];
  task: ActiveStatusReadTask;
};

function resolveTaskStatuses(input: ActiveStatusReadInput, compatibilityOnly: boolean): ActiveStatusReadResult {
  const statusesByTaskId: CanonicalActiveStatusByTaskId = {};
  const dueOnByTaskId: Record<string, string | null> = {};
  for (const task of input.tasks) {
    const normalizedHistory = deduplicateTaskHistoryByLogicalDate(input.historyByTaskId[task.id] ?? []);
    if (isCanonicalArchivedOrTrashed(task)) {
      statusesByTaskId[task.id] = task.container_state === "trashed" || task.status === "trashed" ? "trashed" : "archived";
      continue;
    }
    const buildInput = compatibilityOnly ? buildCompatibilityTaskStateEngineInput : buildDirectTaskStateEngineInput;
    const engineInput = buildInput(task, normalizedHistory, {
      behaviorProfiles: input.behaviorProfiles,
      behaviorPolicyRevisions: input.behaviorPolicyRevisions,
      namedCustomRulesetBehaviorPolicyRevisions: input.namedCustomRulesetBehaviorPolicyRevisions,
      behaviorSelectionsByTaskId: input.behaviorSelectionsByTaskId,
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

/** Resolve one Task through the same production engine boundary as the collection read. */
export function resolveActiveTaskStatus(input: ActiveStatusTaskReadInput) {
  const normalizedHistory = deduplicateTaskHistoryByLogicalDate(input.history);
  if (isCanonicalArchivedOrTrashed(input.task)) {
    return {
      status: input.task.container_state === "trashed" || input.task.status === "trashed" ? "trashed" : "archived",
      // The full collection read omits archived/trashed due dates.
      dueOn: undefined,
    } as const;
  }
  const engineInput = buildDirectTaskStateEngineInput(input.task, normalizedHistory, input);
  const evaluated = evaluateTaskState(engineInput);
  return { dueOn: evaluated.nextDueDate, status: evaluated.activeStatus } as const;
}

/** Compatibility-only Active Status translation for legacy/test-shaped Task fixtures. */
export function resolveCompatibilityTaskStatuses(input: ActiveStatusReadInput): ActiveStatusReadResult {
  return resolveTaskStatuses(input, true);
}

export type ActiveStatusReadProjectionInput = ActiveStatusReadInput & {
  /** Optional caller-provided source revision; it is metadata, never authority. */
  sourceRevision?: string | null;
};

export type ActiveStatusReadProjectionRecord = {
  taskId: string;
  activeStatus: CanonicalActiveStatus;
  dueOn: string | null;
};

export type ActiveStatusReadProjectionContext = {
  logicalDate: string;
  timezone: string;
  logicalDayRollover: string;
  inputFingerprint: string;
};

export type CompactActiveStatusReadProjection = {
  projectionVersion: typeof ACTIVE_STATUS_READ_PROJECTION_VERSION;
  context: ActiveStatusReadProjectionContext;
  tasks: ActiveStatusReadProjectionRecord[];
};

function normalizedNow(now: string | Date) {
  return now instanceof Date ? now.toISOString() : now;
}

/** Deterministic identity for every input that can change the Active Status read. */
export function createActiveStatusReadInputFingerprint(input: ActiveStatusReadProjectionInput) {
  const logicalDate = logicalDateForTimestamp(input.now, input.timezone, input.logicalDayRollover);
  return sha256Digest({
    behaviorPolicyRevisions: input.behaviorPolicyRevisions ?? null,
    behaviorProfiles: input.behaviorProfiles ?? null,
    behaviorSelectionsByTaskId: input.behaviorSelectionsByTaskId ?? null,
    historyByTaskId: input.historyByTaskId,
    logicalDate,
    logicalDayRollover: input.logicalDayRollover,
    namedCustomRulesetBehaviorPolicyRevisions: input.namedCustomRulesetBehaviorPolicyRevisions ?? null,
    now: normalizedNow(input.now),
    sourceRevision: input.sourceRevision ?? null,
    tasks: input.tasks,
    timezone: input.timezone,
  });
}

/**
 * Small, serializable startup-read contract. It contains one record per input
 * Task and no History arrays; History remains an engine input, not transport.
 * Occurrence identity is intentionally omitted because this read is not a
 * mutation or Calendar/History authority.
 */
export function buildCompactActiveStatusReadProjection(
  input: ActiveStatusReadProjectionInput,
): CompactActiveStatusReadProjection {
  const reference = resolveActiveTaskStatuses(input);
  const logicalDate = logicalDateForTimestamp(input.now, input.timezone, input.logicalDayRollover);
  return {
    context: {
      inputFingerprint: createActiveStatusReadInputFingerprint(input),
      logicalDate,
      logicalDayRollover: input.logicalDayRollover,
      timezone: input.timezone,
    },
    projectionVersion: ACTIVE_STATUS_READ_PROJECTION_VERSION,
    tasks: input.tasks.map((task) => ({
      activeStatus: reference.statusesByTaskId[task.id]!,
      dueOn: Object.hasOwn(reference.dueOnByTaskId, task.id) ? reference.dueOnByTaskId[task.id]! : null,
      taskId: task.id,
    })),
  };
}
