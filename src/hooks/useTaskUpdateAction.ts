"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Task, TaskHistory, TaskHistoryInsert, TaskUpdate } from "@/lib/database.types";
import type { TaskRowUpdateOptions, UpdateTaskRowResult } from "@/lib/task-db-mutations";
import { buildTaskUpdateConflictMessage } from "@/lib/task-db-mutations";
import type { TaskRewardCandidate } from "@/lib/task-rewards";
import type { TaskRoutingBucket } from "@/lib/task-buckets";
import { shouldReconcileOverdueTaskMisses } from "@/lib/task-repeat";
import { applyTaskActiveStatusTracking } from "@/lib/task-active-status";
import { TASK_STATE_ENGINE_INTEGRATION_ENABLED } from "@/lib/task-state-engine/read-authority";
import { evaluateTaskScheduleAuthority, hasTaskScheduleChange, isOccurrenceSensitiveTaskMutation, stripStatusFromScheduleIntent } from "@/lib/task-state-engine/action-authority";
import type { TaskHistoryLoadMap } from "@/lib/task-history";
import { classifyTaskStateRuntimeAction, TASK_STATE_OWNED_UPDATE_FIELDS, type TaskStateRuntimeCanonicalIntent } from "@/lib/task-state-runtime-actions";
import {
  executeTaskStateRuntimeAction,
  type TaskStateRuntimeExecutionResult,
  type TaskStateRuntimeLocalTask,
  type TaskStateRuntimeCanonicalAction,
} from "@/lib/task-state-runtime-executor";
import { TASK_STATE_CANONICAL_COMMANDS_ENABLED } from "@/lib/task-state-runtime-gate";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type UpdateTaskActionOptions = {
  canonicalIntent?: TaskStateRuntimeCanonicalIntent;
  replayIdentity?: string;
  engineManaged?: boolean;
  expectedTask?: Task | null;
  historyEntry?: TaskHistoryInsert;
  historyEntries?: TaskHistoryInsert[];
  historyStatus?: Task["status"];
  historySnapshot?: TaskHistory[];
  rewardEligible?: boolean;
};

export type TaskHistoryFailureCompensation = (input: {
  committedTask: Task;
  previousTask: Task;
  rollbackValues: TaskUpdate;
  taskId: string;
}) => Promise<boolean>;

type UseTaskUpdateActionOptions = {
  /** Test-only override; production defaults to the disabled migration gate. */
  canonicalCommandsEnabled?: boolean;
  /** Test seam for the canonical executor; normal callers use the real executor. */
  canonicalCommandExecutor?: (action: TaskStateRuntimeCanonicalAction, task: TaskStateRuntimeLocalTask) => Promise<TaskStateRuntimeExecutionResult>;
  clearPendingTaskMutations?: (taskIds: string[]) => void;
  currentDayKey: string;
  dayStartTime: string;
  markPendingTaskMutations?: (taskIds: string[]) => void;
  onTaskHistoryFailure?: TaskHistoryFailureCompensation;
  onTaskHistoryMutation?: (taskId: string, taskHistory: TaskHistory[], nextTask?: Task) => void | Promise<void>;
  onTasksCompleted: (candidates: TaskRewardCandidate[]) => Promise<void>;
  reconcileOverdueTaskMisses: (task: Task) => Promise<boolean>;
  routeTask: (taskId: string, bucket: TaskRoutingBucket | null) => void;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  sortTasksForUi: (tasks: Task[]) => Task[];
  syncTaskHistoryEntry: (taskId: string, status: Task["status"], occurrenceTask?: Task | null, options?: { historyEntry?: TaskHistoryInsert; historySnapshot?: TaskHistory[] }) => Promise<boolean>;
  syncTaskHistoryEntries?: (taskId: string, status: Task["status"], entryDates: string[], options?: { historyEntries?: TaskHistoryInsert[]; historySnapshot?: TaskHistory[] }) => Promise<boolean>;
  taskHistory?: TaskHistory[];
  tasks: Task[];
  loadTaskHistoryForTasks?: (taskIds: string[]) => Promise<TaskHistoryLoadMap>;
  logicalDayNow?: Date | string;
  timezone: string;
  updateTaskRowWithLegacyEnergyFallback: (taskId: string, values: TaskUpdate, options?: TaskRowUpdateOptions) => Promise<UpdateTaskRowResult>;
  canonicalTaskMutationState?: TaskCanonicalMutationState;
};

type CanonicalMutationInFlight = {
  fingerprint: string;
  promise: Promise<boolean>;
};

export type TaskCanonicalMutationState = {
  taskSnapshots: Map<string, TaskStateRuntimeLocalTask>;
  mutationsInFlight: Map<string, CanonicalMutationInFlight>;
};

function canonicalMutationFingerprint(
  action: TaskStateRuntimeCanonicalAction,
  options?: UpdateTaskActionOptions,
) {
  const intent = action.intent
    ? Object.fromEntries(
      Object.entries(action.intent)
        .filter(([key]) => !["expected_revision", "replay_identity", "task_id"].includes(key))
        .sort(([left], [right]) => left.localeCompare(right)),
    )
    : null;
  const explicitReplayIdentity = options?.replayIdentity
    ?? options?.canonicalIntent?.replay_identity
    ?? null;
  return JSON.stringify({
    actionType: action.actionType,
    changedFields: [...action.changedFields].sort(),
    explicitReplayIdentity,
    intent,
    scheduleChanges: action.scheduleChanges ?? null,
  });
}

export function useTaskUpdateAction({
  canonicalCommandsEnabled = TASK_STATE_CANONICAL_COMMANDS_ENABLED,
  canonicalCommandExecutor = (action, task) => executeTaskStateRuntimeAction(action, task),
  canonicalTaskMutationState,
  clearPendingTaskMutations,
  currentDayKey,
  dayStartTime = "00:00",
  markPendingTaskMutations,
  onTaskHistoryFailure,
  onTaskHistoryMutation,
  onTasksCompleted,
  reconcileOverdueTaskMisses,
  routeTask,
  setMessage,
  setTasks,
  sortTasksForUi,
  syncTaskHistoryEntry,
  syncTaskHistoryEntries,
  taskHistory = [],
  tasks,
  loadTaskHistoryForTasks,
  logicalDayNow = `${currentDayKey}T12:00:00.000Z`,
  timezone = "UTC",
  updateTaskRowWithLegacyEnergyFallback,
}: UseTaskUpdateActionOptions) {
  const mutationState: TaskCanonicalMutationState = canonicalTaskMutationState ?? {
    taskSnapshots: new Map<string, TaskStateRuntimeLocalTask>(),
    mutationsInFlight: new Map<string, CanonicalMutationInFlight>(),
  };

  function getCanonicalTaskSnapshot(taskId: string, fallback: Task | null) {
    if (!fallback) return null;
    const tracked = mutationState.taskSnapshots.get(taskId);
    const fallbackRevision = fallback?.canonical_revision;
    const trackedRevision = tracked?.canonical_revision;
    if (!tracked || (typeof fallbackRevision === "number" && (typeof trackedRevision !== "number" || fallbackRevision >= trackedRevision))) {
      mutationState.taskSnapshots.set(taskId, fallback as TaskStateRuntimeLocalTask);
      return fallback as TaskStateRuntimeLocalTask | null;
    }
    return tracked;
  }

  async function updateTask(taskId: string, values: TaskUpdate, options?: UpdateTaskActionOptions) {
    markPendingTaskMutations?.([taskId]);
    const previousTask = options?.expectedTask ?? tasks.find((task) => task.id === taskId) ?? null;
    const statusChanged = Boolean(
      previousTask
      && values.status !== undefined
      && values.status !== previousTask.status,
    );

    const hasTaskStateOwnedValues = Object.keys(values).some((field) => (
      (TASK_STATE_OWNED_UPDATE_FIELDS as readonly string[]).includes(field)
      && values[field as keyof TaskUpdate] !== undefined
    ));
    if (canonicalCommandsEnabled && (hasTaskStateOwnedValues || options?.canonicalIntent)) {
      const initialCanonicalTask = getCanonicalTaskSnapshot(taskId, previousTask);
      if (!initialCanonicalTask) {
        clearPendingTaskMutations?.([taskId]);
        setMessage({ tone: "warn", text: "The canonical Task State action could not find the current Task; no legacy fallback was used." });
        return false;
      }
      const initialRuntimeAction = classifyTaskStateRuntimeAction({
        task: initialCanonicalTask,
        values,
        canonicalIntent: options?.canonicalIntent,
        ...(options?.replayIdentity ? { replayIdentity: options.replayIdentity } : {}),
      });
      if (initialRuntimeAction.kind !== "canonical_action") {
        clearPendingTaskMutations?.([taskId]);
        if (initialRuntimeAction.kind === "metadata_only" && initialRuntimeAction.changedFields.length === 0) {
          return true;
        }
        setMessage({ tone: "warn", text: initialRuntimeAction.kind === "unsupported_state_mutation"
          ? initialRuntimeAction.reason
          : "The canonical Task State action could not be classified." });
        return false;
      }

      const fingerprint = canonicalMutationFingerprint(initialRuntimeAction, options);
      const existingMutation = mutationState.mutationsInFlight.get(taskId);
      if (existingMutation?.fingerprint === fingerprint) {
        return existingMutation.promise;
      }

      const canonicalPromise = (existingMutation?.promise ?? Promise.resolve(true)).then(async () => {
        const currentCanonicalTask = getCanonicalTaskSnapshot(taskId, previousTask);
        if (!currentCanonicalTask) {
          clearPendingTaskMutations?.([taskId]);
          setMessage({ tone: "warn", text: "The canonical Task State action could not find the current Task; no legacy fallback was used." });
          return false;
        }
        const runtimeAction = classifyTaskStateRuntimeAction({
          task: currentCanonicalTask,
          values,
          canonicalIntent: options?.canonicalIntent,
          ...(options?.replayIdentity ? { replayIdentity: options.replayIdentity } : {}),
        });
        if (runtimeAction.kind !== "canonical_action") {
          clearPendingTaskMutations?.([taskId]);
          if (runtimeAction.kind === "metadata_only" && runtimeAction.changedFields.length === 0) {
            return true;
          }
          setMessage({ tone: "warn", text: runtimeAction.kind === "unsupported_state_mutation"
            ? runtimeAction.reason
            : "The canonical Task State action could not be classified." });
          return false;
        }

        let canonicalResult: TaskStateRuntimeExecutionResult;
        try {
          canonicalResult = await canonicalCommandExecutor(runtimeAction, currentCanonicalTask);
        } catch (error) {
          clearPendingTaskMutations?.([taskId]);
          setMessage({ tone: "warn", text: error instanceof Error ? error.message : "The canonical Task State command could not be invoked." });
          return false;
        }
        clearPendingTaskMutations?.([taskId]);
        if (!canonicalResult.success) {
          setMessage({ tone: "warn", text: canonicalResult.error.message });
          return false;
        }

        mutationState.taskSnapshots.set(taskId, canonicalResult.task);
        setTasks((current) => sortTasksForUi(current.map((task) => task.id === taskId ? canonicalResult.task as Task : task)));
        if (runtimeAction.actionType === "archive_task" || runtimeAction.actionType === "trash_task") {
          routeTask(taskId, null);
        } else if (runtimeAction.actionType === "restore_task") {
          routeTask(taskId, canonicalResult.task.status === "archived" || canonicalResult.task.status === "trashed"
            ? null
            : "inbox");
        } else if (["complete_task", "set_outcome"].includes(runtimeAction.actionType)
          && ["complete", "done", "did_my_best", "missed"].includes(canonicalResult.task.status)) {
          routeTask(taskId, null);
        }

        // A canonical command may commit its History fact or Calendar/schedule
        // side effect before the browser read cache is refreshed. Refresh only
        // the read state; never recreate a legacy History fact here.
        if (canonicalResult.response.side_effect_ids.history_fact_id && loadTaskHistoryForTasks) {
          const refresh = await loadTaskHistoryForTasks([taskId]);
          const refreshed = refresh[taskId];
          if (!refreshed || refreshed.status !== "ready") {
            setMessage({ tone: "warn", text: refreshed?.error ?? "Task State committed, but History could not be refreshed." });
          } else {
            await onTaskHistoryMutation?.(taskId, refreshed.history, canonicalResult.task as Task);
          }
        }
        const canonicalRewardEntitlementId = canonicalResult.response.side_effect_ids.reward_entitlement_id;
        if (canonicalRewardEntitlementId && ["complete_task", "set_outcome"].includes(runtimeAction.actionType)) {
          await onTasksCompleted([{
            canonicalRewardEntitlementId,
            previousStatus: currentCanonicalTask.status,
            task: canonicalResult.task as Task,
          }]);
        }
        return true;
      });
      const mutationEntry = { fingerprint, promise: canonicalPromise };
      mutationState.mutationsInFlight.set(taskId, mutationEntry);
      try {
        return await canonicalPromise;
      } finally {
        if (mutationState.mutationsInFlight.get(taskId)?.promise === canonicalPromise) {
          mutationState.mutationsInFlight.delete(taskId);
        }
      }
    }

    const scheduleChanged = Boolean(previousTask && hasTaskScheduleChange(previousTask, values));
    const scheduleOnlyEdit = scheduleChanged && !statusChanged && options?.historyStatus === undefined;
    const scheduleIntentValues = scheduleOnlyEdit ? stripStatusFromScheduleIntent(values) : values;
    const occurrenceSensitive = isOccurrenceSensitiveTaskMutation({
      engineManaged: options?.engineManaged,
      historyEntries: options?.historyEntries,
      historyEntry: options?.historyEntry,
      historyStatus: options?.historyStatus,
      task: previousTask,
      values,
    });
    let scopedHistory = options?.historySnapshot
      ?? taskHistory.filter((entry) => entry.task_id === taskId);
    if (occurrenceSensitive && !options?.historySnapshot && loadTaskHistoryForTasks) {
      const historyLoad = (await loadTaskHistoryForTasks([taskId]))[taskId];
      if (!historyLoad || historyLoad.status !== "ready") {
        clearPendingTaskMutations?.([taskId]);
        setMessage({ tone: "warn", text: historyLoad?.error ?? "Could not load task history. The task was not saved." });
        return false;
      }
      scopedHistory = historyLoad.history;
    }
    const scheduleAuthority = previousTask && scheduleOnlyEdit
      ? evaluateTaskScheduleAuthority({
        history: scopedHistory,
        logicalDayRollover: dayStartTime,
        now: logicalDayNow,
        proposedTask: { ...previousTask, ...scheduleIntentValues } as Task,
        task: previousTask,
        timezone,
      })
      : null;
    if (scheduleAuthority?.validationErrors.length) {
      clearPendingTaskMutations?.([taskId]);
      setMessage({ tone: "warn", text: scheduleAuthority.validationErrors[0] ?? "This task schedule is not valid." });
      return false;
    }
    const normalizedValues = scheduleAuthority
      ? { ...scheduleIntentValues, ...scheduleAuthority.mutationPlan.taskUpdate }
      : scheduleIntentValues;
    const nextValues = previousTask
      ? scheduleOnlyEdit ? normalizedValues : applyTaskActiveStatusTracking(previousTask, normalizedValues, currentDayKey)
      : normalizedValues;
    const compensateHistoryFailure = async (committedTask: Task) => {
      clearPendingTaskMutations?.([taskId]);
      if (onTaskHistoryFailure && previousTask) {
        const rollbackFields = [
          "active_occurrence_due_on",
          "active_status_logical_date",
          "completed_at",
          "due_on",
          "status",
          "trashed_at",
        ] as const;
        const rollbackValues = rollbackFields.reduce<TaskUpdate>((valuesToRestore, field) => {
          if (Object.prototype.hasOwnProperty.call(nextValues, field)) {
            valuesToRestore[field] = previousTask[field] as never;
          }
          return valuesToRestore;
        }, {});
        await onTaskHistoryFailure({
          committedTask,
          previousTask,
          rollbackValues,
          taskId,
        });
      }
      return false;
    };
    const {
      conflict,
      data,
      error,
      usedEnergyFallback,
      usedActualSecondsFallback,
    } = await updateTaskRowWithLegacyEnergyFallback(taskId, nextValues, {
      expectedTask: previousTask,
    });

    if (error) {
      clearPendingTaskMutations?.([taskId]);
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    if (conflict) {
      clearPendingTaskMutations?.([taskId]);
      if (conflict.latestTask) {
        setTasks((current) => sortTasksForUi(current.map((task) => task.id === taskId ? conflict.latestTask ?? task : task)));
        if (conflict.latestTask.status === "done" || conflict.latestTask.status === "did_my_best" || conflict.latestTask.status === "complete" || conflict.latestTask.status === "archived" || conflict.latestTask.status === "trashed") {
          routeTask(taskId, null);
        }
      }
      setMessage({ tone: "warn", text: buildTaskUpdateConflictMessage(conflict) });
      return false;
    }

    if (data) {
      const nextData = usedActualSecondsFallback && typeof values.actual_seconds === "number"
        ? { ...data, actual_seconds: values.actual_seconds }
        : data;

      setTasks((current) => sortTasksForUi(current.map((task) => task.id === taskId ? nextData : task)));
      if (scheduleOnlyEdit) {
        void onTaskHistoryMutation?.(taskId, scopedHistory, nextData);
      }
      if (data.status === "done" || data.status === "did_my_best" || data.status === "complete" || data.status === "archived" || data.status === "trashed") {
        routeTask(taskId, null);
      }
      if (!scheduleOnlyEdit && !scheduleAuthority && !options?.historyEntry && shouldReconcileOverdueTaskMisses(nextData, currentDayKey)) {
        const historyReconciled = await reconcileOverdueTaskMisses(nextData);
        if (!historyReconciled) {
          return await compensateHistoryFailure(nextData);
        }
      }
      // Only an explicit status mutation owns a History outcome. Due-date and
      // metadata edits must leave credited History untouched.
      if (!scheduleOnlyEdit && (options?.historyStatus !== undefined || statusChanged || Object.hasOwn(values, "status"))) {
        const historyStatus = (options?.historyStatus ?? values.status ?? data.status) as Task["status"];
        const historySaved = options?.historyEntries?.length && syncTaskHistoryEntries
          ? await syncTaskHistoryEntries(
            taskId,
            historyStatus,
            options.historyEntries.map((entry) => entry.entry_date),
            { historyEntries: options.historyEntries, historySnapshot: scopedHistory },
          )
          : await syncTaskHistoryEntry(
            taskId,
            historyStatus,
            previousTask ?? nextData,
            { ...(options?.historyEntry ? { historyEntry: options.historyEntry } : {}), historySnapshot: scopedHistory },
          );
        if (!historySaved) {
          return await compensateHistoryFailure(nextData);
        }
      }
      if (!scheduleOnlyEdit) {
        await onTasksCompleted([{
          // The engine action projection already rebases supported recurrence.
          // Keep legacy finalization only for the compatibility fallback.
          engineManaged: options?.engineManaged,
          forceRecurringFinalization: !TASK_STATE_ENGINE_INTEGRATION_ENABLED
            && (values.status === "done" || values.status === "did_my_best"),
          previousStatus: previousTask?.status ?? null,
          rewardEligible: options?.rewardEligible,
          task: nextData,
        }]);
      }

      if (usedEnergyFallback) {
        setMessage({
          tone: "warn",
          text: "Your database is missing the newer \"none\" energy level, so this task was saved with low energy instead. Run `supabase/add_task_energy_none.sql` to enable \"none\".",
        });
      } else if (usedActualSecondsFallback) {
        setMessage({
          tone: "warn",
          text: "Manual time was saved, but your database is missing the task actual-time column. Run `supabase/add_task_actual_seconds.sql` to persist Actual Time on tasks.",
        });
      }
    }

    return true;
  }

  return { updateTask };
}
