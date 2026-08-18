"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dispatch, SetStateAction } from "react";
import type { Task, TaskHistory as DbTaskHistory, TaskHistoryInsert, TaskStatus } from "@/lib/database.types";
import type { TaskRewardCandidate } from "@/lib/task-rewards";
import type { TaskHistoryLoadMap } from "@/lib/task-history";
import { classifyTaskStateRuntimeAction, type TaskStateRuntimeCanonicalIntent } from "@/lib/task-state-runtime-actions";
import { executeTaskStateRuntimeAction, type TaskStateRuntimeExecutionResult, type TaskStateRuntimeLocalTask } from "@/lib/task-state-runtime-executor";
import { resolveCanonicalTaskOccurrence } from "@/lib/task-state-canonical/occurrence-resolution";
import { createBrowserUuidV4 } from "@/lib/browser-uuid";

const calendarReplayAttemptStores = new WeakMap<object, Map<string, string>>();

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type UseTaskHistoryActionsOptions = {
  canonicalCommandExecutor?: (action: Extract<ReturnType<typeof classifyTaskStateRuntimeAction>, { kind: "canonical_action" }>, task: TaskStateRuntimeLocalTask) => Promise<TaskStateRuntimeExecutionResult>;
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
  canonicalCommandExecutor = (action, task) => executeTaskStateRuntimeAction(action, task),
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

  async function syncTaskHistoryEntries(
    taskId: string,
    status: TaskStatus,
    entryDates: string[],
    options?: {
      historicalOverride?: boolean;
      historicalOverrideDelayUntilDate?: string | null;
      historyEntries?: TaskHistoryInsert[];
      historySnapshot?: DbTaskHistory[];
      syncLiveTask?: boolean;
    },
  ) {
    const uniqueEntryDates = Array.from(new Set(entryDates)).sort();
    if (uniqueEntryDates.length === 0) return true;

    const canonicalTask = tasks.find((candidate) => candidate.id === taskId) ?? null;
    if (!canonicalTask) {
      setMessage({ tone: "warn", text: "The canonical Calendar action could not find the current Task." });
      return false;
    }
    if (status !== "pending" && status !== "done" && status !== "did_my_best" && status !== "missed" && status !== "delayed" && status !== "complete") {
      setMessage({ tone: "warn", text: "This History status has no supported canonical command." });
      return false;
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
    options?: { historyEntry?: TaskHistoryInsert; historySnapshot?: DbTaskHistory[] },
  ) {
    const entryDate = options?.historyEntry?.entry_date ?? currentDayKey;
    return syncTaskHistoryEntries(taskId, status, [entryDate], {
      historyEntries: options?.historyEntry ? [options.historyEntry] : undefined,
      historySnapshot: options?.historySnapshot,
    });
  }

  return { syncTaskHistoryEntries, syncTaskHistoryEntry };
}
