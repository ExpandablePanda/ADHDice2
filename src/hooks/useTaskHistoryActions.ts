"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dispatch, SetStateAction } from "react";
import type { Task, TaskHistory as DbTaskHistory, TaskHistoryActionInput, TaskStatus } from "@/lib/database.types";
import type { TaskRewardCandidate } from "@/lib/task-rewards";
import type { TaskHistoryLoadMap } from "@/lib/task-history";
import { classifyTaskStateRuntimeAction, type TaskStateRuntimeCanonicalIntent } from "@/lib/task-state-runtime-actions";
import {
  executeTaskHistoryOutcomeBatch,
  executeTaskStateRuntimeAction,
  type TaskHistoryOutcomeBatchExecutionResult,
  type TaskHistoryOutcomeBatchExecutorInput,
  type TaskStateRuntimeExecutionResult,
  type TaskStateRuntimeLocalTask,
} from "@/lib/task-state-runtime-executor";
import type { HistoryOutcomeBatchEntryInput } from "@/lib/task-history-outcome-batch-client";
import { resolveCanonicalTaskOccurrence } from "@/lib/task-state-canonical/occurrence-resolution";
import { createBrowserUuidV4 } from "@/lib/browser-uuid";

const calendarReplayAttemptStores = new WeakMap<object, Map<string, string>>();

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

export type TaskHistorySyncOptions = {
  historicalOverride?: boolean;
  historicalOverrideDelayUntilDate?: string | null;
  historyEntries?: TaskHistoryActionInput[];
  historySnapshot?: DbTaskHistory[];
  onTaskCommitted?: (task: TaskStateRuntimeLocalTask) => void;
  currentTask?: TaskStateRuntimeLocalTask | null;
  syncLiveTask?: boolean;
};

type UseTaskHistoryActionsOptions = {
  canonicalCommandExecutor?: (action: Extract<ReturnType<typeof classifyTaskStateRuntimeAction>, { kind: "canonical_action" }>, task: TaskStateRuntimeLocalTask) => Promise<TaskStateRuntimeExecutionResult>;
  historyBatchExecutor?: (input: TaskHistoryOutcomeBatchExecutorInput) => Promise<TaskHistoryOutcomeBatchExecutionResult>;
  client: SupabaseClient;
  currentUserId: string;
  currentDayKey: string;
  onHistoryMutation?: (taskId: string, taskHistory?: DbTaskHistory[]) => void | Promise<void>;
  onTasksCompleted?: (candidates: TaskRewardCandidate[]) => Promise<void>;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTaskHistory: Dispatch<SetStateAction<DbTaskHistory[]>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  sortTasksForUi: (tasks: Task[]) => Task[];
  taskHistory?: DbTaskHistory[];
  loadTaskHistoryForTasks?: (taskIds: string[]) => Promise<TaskHistoryLoadMap>;
  tasks: Task[];
  timezone: string;
};

export function useTaskHistoryActions({
  canonicalCommandExecutor: suppliedCanonicalCommandExecutor,
  historyBatchExecutor,
  client,
  currentUserId,
  currentDayKey,
  onHistoryMutation,
  onTasksCompleted,
  setMessage,
  setTaskHistory,
  setTasks,
  sortTasksForUi,
  taskHistory = [],
  loadTaskHistoryForTasks,
  tasks,
}: UseTaskHistoryActionsOptions) {
  const canonicalCommandExecutor = suppliedCanonicalCommandExecutor ?? ((action: Extract<ReturnType<typeof classifyTaskStateRuntimeAction>, { kind: "canonical_action" }>, task: TaskStateRuntimeLocalTask) => executeTaskStateRuntimeAction(action, task));
  const calendarReplayAttempts = calendarReplayAttemptStores.get(setTasks as object)
    ?? new Map<string, string>();
  calendarReplayAttemptStores.set(setTasks as object, calendarReplayAttempts);

  function calendarReplayIdentity(taskId: string, entryDate: string, status: TaskStatus) {
    const key = `${taskId}:${entryDate}:${status}`;
    const existing = calendarReplayAttempts.get(key);
    if (existing) return { key, identity: existing };
    const identity = `calendar:${createBrowserUuidV4()}`;
    calendarReplayAttempts.set(key, identity);
    return { key, identity };
  }

  function retireCalendarReplayIdentity(key: string) {
    calendarReplayAttempts.delete(key);
  }

  function notifyHistoryMutation(taskId: string, nextHistory?: DbTaskHistory[]) {
    void onHistoryMutation?.(taskId, nextHistory);
  }

  async function finishHistoryBatchMutation(
    taskId: string,
    replayKey: string,
    batchResult: TaskHistoryOutcomeBatchExecutionResult,
    options?: TaskHistorySyncOptions,
  ) {
    if (batchResult.completedChildren.length > 0) {
      const finalTask = batchResult.task ?? batchResult.completedChildren.at(-1)?.task ?? null;
      if (finalTask) {
        setTasks((current) => sortTasksForUi(current.map((candidate) => candidate.id === taskId ? finalTask : candidate)));
        options?.onTaskCommitted?.(finalTask);
      }
      const rewardCandidates = batchResult.completedChildren.flatMap((child) => {
        const rewardEntitlementId = child.response.side_effect_ids.reward_entitlement_id;
        return rewardEntitlementId
          ? [{
              canonicalRewardEntitlementId: rewardEntitlementId,
              previousStatus: child.previousTask.status,
              task: child.task,
            }]
          : [];
      });
      if (rewardCandidates.length > 0) await onTasksCompleted?.(rewardCandidates);
    }

    if (!batchResult.success) {
      if (batchResult.completedChildren.length > 0 && loadTaskHistoryForTasks) {
        const refreshed = (await loadTaskHistoryForTasks([taskId]))[taskId];
        if (refreshed?.status === "ready") {
          setTaskHistory((current) => [
            ...refreshed.history,
            ...current.filter((entry) => entry.task_id !== taskId),
          ]);
          notifyHistoryMutation(taskId, refreshed.history);
        }
      }
      setMessage({ tone: "warn", text: batchResult.error.message });
      return false;
    }

    if (batchResult.response.achievement_warning) {
      setMessage({ tone: "warn", text: batchResult.response.achievement_warning });
    }
    if (batchResult.response.achievement.status === "completed" || batchResult.response.achievement.status === "inactive") {
      calendarReplayAttempts.delete(replayKey);
    }
    const refreshed = loadTaskHistoryForTasks ? (await loadTaskHistoryForTasks([taskId]))[taskId] : null;
    if (refreshed?.status === "ready") {
      setTaskHistory((current) => [
        ...refreshed.history,
        ...current.filter((entry) => entry.task_id !== taskId),
      ]);
      notifyHistoryMutation(taskId, refreshed.history);
    } else {
      setMessage({ tone: "warn", text: "Calendar state committed, but History could not be refreshed." });
    }
    return true;
  }

  async function syncTaskHistoryEntries(
    taskId: string,
    status: TaskStatus,
    entryDates: string[],
    options?: TaskHistorySyncOptions,
  ) {
    const uniqueEntryDates = Array.from(new Set(entryDates)).sort();
    if (uniqueEntryDates.length === 0) return true;

    const canonicalTask = options?.currentTask
      ?? tasks.find((candidate) => candidate.id === taskId) as TaskStateRuntimeLocalTask | undefined
      ?? null;
    if (!canonicalTask) {
      setMessage({ tone: "warn", text: "The canonical Calendar action could not find the current Task." });
      return false;
    }
    if (status !== "pending" && status !== "done" && status !== "did_my_best" && status !== "missed" && status !== "delayed" && status !== "complete") {
      setMessage({ tone: "warn", text: "This History status has no supported canonical command." });
      return false;
    }

    if (uniqueEntryDates.length > 1
      && (status === "done" || status === "did_my_best" || status === "missed")
      && !suppliedCanonicalCommandExecutor) {
      const batchKey = `history-batch:${taskId}:${status}:${uniqueEntryDates.join(",")}`;
      const replayIdentity = calendarReplayAttempts.get(batchKey) ?? `calendar-batch:${createBrowserUuidV4()}`;
      calendarReplayAttempts.set(batchKey, replayIdentity);
      const entries: HistoryOutcomeBatchEntryInput[] = uniqueEntryDates.map((entryDate) => {
        const existingEntry = taskHistory.find((entry) => entry.task_id === taskId && entry.entry_date === entryDate)
          ?? options?.historySnapshot?.find((entry) => entry.task_id === taskId && entry.entry_date === entryDate)
          ?? null;
        return {
          logical_date: entryDate,
          ...(existingEntry?.canonical_occurrence_id && existingEntry.occurrence_key ? { occurrence_key: existingEntry.occurrence_key } : {}),
          ...(existingEntry?.canonical_occurrence_id && existingEntry.occurrence_due_on ? { scheduled_due_on: existingEntry.occurrence_due_on } : {}),
        };
      });
      let batchResult: TaskHistoryOutcomeBatchExecutionResult;
      try {
        batchResult = await (historyBatchExecutor ?? executeTaskHistoryOutcomeBatch)({
          task: canonicalTask,
          replayIdentity,
          outcome: status,
          entries,
        });
      } catch (error) {
        setMessage({ tone: "warn", text: error instanceof Error ? error.message : "The canonical History batch could not be invoked." });
        return false;
      }
      return finishHistoryBatchMutation(taskId, batchKey, batchResult, options);
    }

    let currentTask = canonicalTask as TaskStateRuntimeLocalTask;
    for (const entryDate of uniqueEntryDates) {
      const existingEntry = taskHistory.find((entry) => entry.task_id === taskId && entry.entry_date === entryDate)
        ?? options?.historySnapshot?.find((entry) => entry.task_id === taskId && entry.entry_date === entryDate)
        ?? null;
      const trustedOccurrenceFields = existingEntry?.canonical_occurrence_id
        ? {
            ...(existingEntry.occurrence_key ? { occurrence_key: existingEntry.occurrence_key } : {}),
            ...(existingEntry.occurrence_due_on ? { scheduled_due_on: existingEntry.occurrence_due_on } : {}),
          }
        : {};
      let canonicalIntent: TaskStateRuntimeCanonicalIntent;
      if (status === "pending") {
        canonicalIntent = { type: "clear_outcome", logical_date: entryDate, ...trustedOccurrenceFields };
      } else if (status === "delayed") {
        const occurrenceResolution = await resolveCanonicalTaskOccurrence(client, currentUserId, taskId, {
          logicalDate: entryDate,
          occurrenceId: existingEntry?.canonical_occurrence_id ?? null,
          occurrenceKey: existingEntry?.occurrence_key,
          scheduledDueOn: existingEntry?.occurrence_due_on,
        });
        if (!occurrenceResolution.occurrence) {
          setMessage({ tone: "warn", text: occurrenceResolution.error ?? "Historical Delay requires a valid canonical occurrence." });
          return false;
        }
        const effectiveDueOn = options?.historicalOverrideDelayUntilDate ?? null;
        if (!effectiveDueOn) {
          setMessage({ tone: "warn", text: "Historical Delay requires a future effective date." });
          return false;
        }
        canonicalIntent = {
          type: "delay_occurrence",
          logical_date: entryDate,
          occurrence_key: occurrenceResolution.occurrence.occurrence_key,
          effective_due_on: effectiveDueOn,
        };
      } else {
        canonicalIntent = status === "complete"
          ? { type: "complete_task", logical_date: entryDate, ...trustedOccurrenceFields }
          : { type: "set_outcome", logical_date: entryDate, outcome: status, ...trustedOccurrenceFields };
      }

      const replayAttempt = calendarReplayIdentity(taskId, entryDate, status);
      const action = classifyTaskStateRuntimeAction({
        canonicalIntent,
        replayIdentity: replayAttempt.identity,
        task: currentTask,
      });
      if (action.kind !== "canonical_action") {
        setMessage({ tone: "warn", text: action.kind === "unsupported_state_mutation" ? action.reason : "The canonical Calendar action could not be classified." });
        return false;
      }

      let canonicalResult: TaskStateRuntimeExecutionResult;
      try {
        canonicalResult = await canonicalCommandExecutor(action, currentTask);
      } catch (error) {
        setMessage({ tone: "warn", text: error instanceof Error ? error.message : "The canonical Calendar command could not be invoked." });
        return false;
      }
      if (!canonicalResult.success) {
        setMessage({ tone: "warn", text: canonicalResult.error.message });
        return false;
      }

      retireCalendarReplayIdentity(replayAttempt.key);
      const canonicalRewardEntitlementId = canonicalResult.response.side_effect_ids.reward_entitlement_id;
      if (canonicalRewardEntitlementId && ["complete_task", "set_outcome"].includes(action.actionType)) {
        await onTasksCompleted?.([{
          canonicalRewardEntitlementId,
          previousStatus: currentTask.status,
          task: canonicalResult.task,
        }]);
      }
      currentTask = canonicalResult.task;
      options?.onTaskCommitted?.(currentTask);
    }

    setTasks((current) => sortTasksForUi(current.map((candidate) => candidate.id === taskId ? currentTask : candidate)));
    const refreshed = loadTaskHistoryForTasks ? (await loadTaskHistoryForTasks([taskId]))[taskId] : null;
    if (refreshed?.status === "ready") {
      setTaskHistory((current) => [
        ...refreshed.history,
        ...current.filter((entry) => entry.task_id !== taskId),
      ]);
      notifyHistoryMutation(taskId, refreshed.history);
    } else {
      setMessage({ tone: "warn", text: "Calendar state committed, but History could not be refreshed." });
    }
    return true;
  }

  async function syncTaskHistoryEntry(
    taskId: string,
    status: TaskStatus,
    _occurrenceTask?: Task | null,
    options?: { historyEntry?: TaskHistoryActionInput; historySnapshot?: DbTaskHistory[] },
  ) {
    const entryDate = options?.historyEntry?.entry_date ?? currentDayKey;
    return syncTaskHistoryEntries(taskId, status, [entryDate], {
      historyEntries: options?.historyEntry ? [options.historyEntry] : undefined,
      historySnapshot: options?.historySnapshot,
    });
  }

  return { syncTaskHistoryEntries, syncTaskHistoryEntry };
}
