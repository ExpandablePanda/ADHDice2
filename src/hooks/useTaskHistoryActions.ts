"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dispatch, SetStateAction } from "react";
import type { Task, TaskHistory as DbTaskHistory, TaskHistoryInsert, TaskStatus, TaskUpdate } from "@/lib/database.types";
import { buildTaskUpdateConflictMessage, type TaskRowUpdateOptions, type UpdateTaskRowResult } from "@/lib/task-db-mutations";
import { applyTaskActiveStatusTracking } from "@/lib/task-active-status";
import { buildTaskHistoryOccurrenceMetadata } from "@/lib/task-duration-evidence";
import {
  buildMissingScheduledMissedHistoryDateKeys,
  buildManualTaskHistoryOverrideOccurrenceMetadata,
  deduplicateTaskHistoryByLogicalDate,
  resolveLiveTaskStatusFromHistory,
  resolveTaskHistoryOccurrenceDueOn,
  TASK_HISTORY_COLUMNS,
} from "@/lib/task-history";
import { calcNextDueDateFromDate as calculateNextDueDateFromDate } from "@/lib/task-repeat";
import { evaluateTaskActionAuthority } from "@/lib/task-state-engine/action-authority";
import { TASK_STATE_ENGINE_INTEGRATION_ENABLED } from "@/lib/task-state-engine/read-authority";
import type { TaskHistoryLoadMap } from "@/lib/task-history";
import { classifyTaskStateRuntimeAction, type TaskStateRuntimeCanonicalIntent } from "@/lib/task-state-runtime-actions";
import { executeTaskStateRuntimeAction, type TaskStateRuntimeExecutionResult, type TaskStateRuntimeLocalTask } from "@/lib/task-state-runtime-executor";
import { TASK_STATE_CANONICAL_COMMANDS_ENABLED } from "@/lib/task-state-runtime-gate";
import { resolveCanonicalTaskOccurrence } from "@/lib/task-state-canonical/occurrence-resolution";
import { createBrowserUuidV4 } from "@/lib/browser-uuid";

const calendarReplayAttemptStores = new WeakMap<object, Map<string, string>>();

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type HistoryOutcome = Extract<TaskStatus, "done" | "did_my_best" | "delayed" | "missed" | "complete">;

type HistoryReplacement = {
  logicalDate: string;
  nextOutcome: HistoryOutcome;
  previousOutcome: HistoryOutcome;
  occurrenceDueOn: string | null;
  occurrenceIdentity: string | null;
};

type HistoryManualOverride = {
  logicalDate: string;
  nextOutcome: HistoryOutcome;
  previousOutcome: HistoryOutcome | null;
  occurrenceDueOn: string | null;
  occurrenceIdentity: string | null;
  delayUntilDate?: string | null;
};

type HistoryRemoval = {
  clearCompletedAt: boolean;
  restoreDueOn: string | null;
};

type UseTaskHistoryActionsOptions = {
  canonicalCommandsEnabled?: boolean;
  canonicalCommandExecutor?: (action: Extract<ReturnType<typeof classifyTaskStateRuntimeAction>, { kind: "canonical_action" }>, task: TaskStateRuntimeLocalTask) => Promise<TaskStateRuntimeExecutionResult>;
  calcNextDueDateFromDate?: (task: Task, referenceDateKey: string) => string | null;
  client: SupabaseClient;
  currentUserId: string;
  currentDayKey: string;
  dayStartTime: string;
  isTaskCompletedForHistory: (status: TaskStatus) => boolean;
  isTaskHistoryStatus: (status: TaskStatus) => boolean;
  mapTaskHistoryRow: (row: DbTaskHistory) => DbTaskHistory;
  now: Date;
  onHistoryMutation?: (taskId: string, taskHistory?: DbTaskHistory[]) => void | Promise<void>;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTaskHistory: Dispatch<SetStateAction<DbTaskHistory[]>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  sortTasksForUi: (tasks: Task[]) => Task[];
  taskHistory?: DbTaskHistory[];
  loadTaskHistoryForTasks?: (taskIds: string[]) => Promise<TaskHistoryLoadMap>;
  tasks: Task[];
  timezone: string;
  updateTaskRowWithLegacyEnergyFallback: (taskId: string, values: TaskUpdate, options?: TaskRowUpdateOptions) => Promise<UpdateTaskRowResult>;
};

export function useTaskHistoryActions({
  canonicalCommandsEnabled = TASK_STATE_CANONICAL_COMMANDS_ENABLED,
  canonicalCommandExecutor = (action, task) => executeTaskStateRuntimeAction(action, task),
  calcNextDueDateFromDate,
  client,
  currentUserId,
  currentDayKey,
  dayStartTime,
  isTaskCompletedForHistory,
  isTaskHistoryStatus,
  mapTaskHistoryRow,
  now,
  onHistoryMutation,
  setMessage,
  setTaskHistory,
  setTasks,
  sortTasksForUi,
  taskHistory = [],
  loadTaskHistoryForTasks,
  tasks,
  timezone,
  updateTaskRowWithLegacyEnergyFallback,
}: UseTaskHistoryActionsOptions) {
  // React dispatch identities are stable across renders and keep this store
  // scoped to one hook owner without making direct hook tests require a DOM.
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

  function getCalendarOccurrenceTask(task: Task | undefined, status: TaskStatus, entryDate: string, history: DbTaskHistory[]) {
    if (!task || (status !== "done" && status !== "did_my_best") || task.repeat_frequency === "none") {
      return task;
    }

    const currentCursor = task.active_occurrence_due_on ?? task.due_on;
    const resolvedOccurrenceDueOn = history
      .filter((entry) => (
        isTaskCompletedForHistory(entry.status)
        && entry.occurrence_due_on
        && entry.occurrence_due_on >= entryDate
        && (!currentCursor || entry.occurrence_due_on < currentCursor)
      ))
      .map((entry) => entry.occurrence_due_on!)
      .sort()
      .at(0);
    const occurrenceDueOn = resolvedOccurrenceDueOn
      ?? resolveTaskHistoryOccurrenceDueOn(task, entryDate);

    return occurrenceDueOn
      ? { ...task, active_occurrence_due_on: occurrenceDueOn }
      : task;
  }

  function getOccurrenceDate(entry: Pick<DbTaskHistory, "occurrence_due_on" | "occurrence_key">) {
    if (entry.occurrence_due_on) {
      return entry.occurrence_due_on;
    }
    const match = entry.occurrence_key?.match(/(\d{4}-\d{2}-\d{2})$/);
    return match?.[1] ?? null;
  }

  function getWeeklyAutomaticMissedDateKeys(task: Task | undefined, history: DbTaskHistory[], entryDates: string[], status: TaskStatus) {
    if (!task || task.repeat_frequency !== "weekly" || (status !== "done" && status !== "did_my_best")) {
      return [] as string[];
    }

    const selectedDateSet = new Set(entryDates);
    const datesToClear = new Set<string>();
    for (const entryDate of entryDates) {
      const occurrenceDueOn = resolveTaskHistoryOccurrenceDueOn(task, entryDate);
      if (!occurrenceDueOn) continue;
      for (const entry of history) {
        if (
          entry.status === "missed"
          && entry.counted_as_due_occurrence
          && !selectedDateSet.has(entry.entry_date)
          && getOccurrenceDate(entry) === occurrenceDueOn
        ) {
          datesToClear.add(entry.entry_date);
        }
      }
    }
    return [...datesToClear].sort();
  }

  function buildHistoryRemoval(task: Task | undefined, removedEntries: DbTaskHistory[]): HistoryRemoval {
    const hasSuccessfulEntry = removedEntries.some((entry) => (
      entry.status === "done" || entry.status === "did_my_best" || entry.status === "complete"
    ));
    if (!task || !hasSuccessfulEntry) {
      return { clearCompletedAt: hasSuccessfulEntry, restoreDueOn: null };
    }

    const occurrenceDate = removedEntries
      .map((entry) => getOccurrenceDate(entry))
      .find((date): date is string => Boolean(date));
    const nextDue = occurrenceDate && task.repeat_frequency !== "none"
      ? (calcNextDueDateFromDate ?? calculateNextDueDateFromDate)(task, occurrenceDate)
      : null;
    const restoreDueOn = occurrenceDate
      && task.due_on
      && nextDue === task.due_on
      && occurrenceDate < task.due_on
      ? occurrenceDate
      : null;
    return { clearCompletedAt: hasSuccessfulEntry, restoreDueOn };
  }

  async function deleteHistoryDates(taskId: string, dates: string[]) {
    if (dates.length === 0) return true;
    const { error } = await client
      .from("adhdice_task_history")
      .delete()
      .eq("task_id", taskId)
      .eq("user_id", currentUserId)
      .in("entry_date", dates);
    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }
    return true;
  }

  async function syncLiveTaskStatus(
    taskId: string,
    nextHistory: DbTaskHistory[],
    editedHistoryDateKeys?: string[],
    options?: { historicalOverride?: HistoryManualOverride; historyRemoval?: HistoryRemoval; historyReplacement?: HistoryReplacement },
  ) {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      return true;
    }

    const historyReplacement = options?.historyReplacement;
    const historicalOverride = options?.historicalOverride;
    const historyRemoval = options?.historyRemoval;
    const taskForEvaluation = historyRemoval?.restoreDueOn
      ? {
        ...task,
        active_occurrence_due_on: null,
        active_status_logical_date: null,
        due_on: historyRemoval.restoreDueOn,
        status: "pending" as const,
      }
      : task;
    const historyForAuthority = historicalOverride
      ? nextHistory.filter((entry) => entry.entry_date !== historicalOverride.logicalDate)
      : nextHistory;
    const engineState = evaluateTaskActionAuthority({
      history: historyForAuthority,
      logicalDayRollover: dayStartTime,
      now,
      ...(historicalOverride
        ? {
          historicalOverride: true,
          outcome: historicalOverride.nextOutcome,
          outcomeDate: historicalOverride.logicalDate,
          occurrenceDueOn: historicalOverride.occurrenceDueOn,
          occurrenceIdentity: historicalOverride.occurrenceIdentity,
          previousOutcome: historicalOverride.previousOutcome,
          ...(historicalOverride.nextOutcome === "delayed"
            ? { delayUntilDate: historicalOverride.delayUntilDate }
            : {}),
        }
        : historyReplacement
          ? {
            outcome: historyReplacement.nextOutcome,
            outcomeDate: historyReplacement.logicalDate,
            occurrenceDueOn: historyReplacement.occurrenceDueOn,
            occurrenceIdentity: historyReplacement.occurrenceIdentity,
            previousOutcome: historyReplacement.previousOutcome,
            replaceExisting: true,
          }
          : {}),
      task: taskForEvaluation,
      timezone,
    });
    const nextTaskState = engineState
      ? {
        completedAt: historyRemoval?.clearCompletedAt
          ? null
          : engineState.persistableTaskPatch.completedAt ?? task.completed_at,
        dueOn: historyRemoval?.restoreDueOn
          ?? (Object.hasOwn(engineState.persistableTaskPatch, "dueOn") ? engineState.persistableTaskPatch.dueOn : undefined),
        activeOccurrenceDueOn: Object.hasOwn(engineState.persistableTaskPatch, "activeOccurrenceDueOn")
          ? engineState.persistableTaskPatch.activeOccurrenceDueOn
          : historyRemoval?.restoreDueOn ? null : undefined,
        activeStatusLogicalDate: Object.hasOwn(engineState.persistableTaskPatch, "activeStatusLogicalDate")
          ? engineState.persistableTaskPatch.activeStatusLogicalDate
          : historyRemoval?.restoreDueOn ? null : undefined,
        // `activeStatus` may be the engine-only derived `unscheduled` state.
        // Writes must retain the stored canonical status when no safe patch exists.
        status: engineState.persistableTaskPatch.status ?? taskForEvaluation.status,
      }
      : {
        ...resolveLiveTaskStatusFromHistory(task, nextHistory, {
          currentDayKey,
          dayStartTime,
          now,
          timezone,
        }, { calcNextDueDateFromDate, editedHistoryDateKeys }),
        activeOccurrenceDueOn: undefined,
        activeStatusLogicalDate: undefined,
      };

    if (
      task.status === nextTaskState.status
      && task.completed_at === nextTaskState.completedAt
      && (nextTaskState.dueOn === undefined || task.due_on === nextTaskState.dueOn)
      && (nextTaskState.activeOccurrenceDueOn === undefined || task.active_occurrence_due_on === nextTaskState.activeOccurrenceDueOn)
      && (nextTaskState.activeStatusLogicalDate === undefined || task.active_status_logical_date === nextTaskState.activeStatusLogicalDate)
    ) {
      return true;
    }

    const updateValues: TaskUpdate = {
      completed_at: nextTaskState.completedAt,
      status: nextTaskState.status,
    };
    if (nextTaskState.dueOn !== undefined) {
      updateValues.due_on = nextTaskState.dueOn;
    }
    if (nextTaskState.activeOccurrenceDueOn !== undefined) {
      updateValues.active_occurrence_due_on = nextTaskState.activeOccurrenceDueOn;
    }
    if (nextTaskState.activeStatusLogicalDate !== undefined) {
      updateValues.active_status_logical_date = nextTaskState.activeStatusLogicalDate;
    }

    const { conflict, data, error } = await updateTaskRowWithLegacyEnergyFallback(
      taskId,
      applyTaskActiveStatusTracking(task, updateValues, currentDayKey),
      { expectedTask: task },
    );

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    if (conflict) {
      if (conflict.latestTask) {
        setTasks((current) => sortTasksForUi(current.map((currentTask) => currentTask.id === taskId ? conflict.latestTask ?? currentTask : currentTask)));
      } else {
        setTasks((current) => current.filter((currentTask) => currentTask.id !== taskId));
      }
      setMessage({
        tone: "warn",
        text: `Task history saved, but the live task changed in the cloud first. ${buildTaskUpdateConflictMessage(conflict)}`,
      });
      return false;
    }

    if (data) {
      setTasks((current) => sortTasksForUi(current.map((currentTask) => currentTask.id === taskId ? data : currentTask)));
    }

    return true;
  }

  async function syncTaskHistoryEntry(
    taskId: string,
    status: TaskStatus,
    entryDate: string,
    options?: { occurrenceTask?: Task | null; syncLiveTask?: boolean; historyEntry?: TaskHistoryInsert; historySnapshot?: DbTaskHistory[] },
  ) {
    const shouldKeepEntry = isTaskHistoryStatus(status);
    const task = tasks.find((candidate) => candidate.id === taskId);
    let scopedHistory = options?.historySnapshot ?? taskHistory.filter((entry) => entry.task_id === taskId);
    if (!options?.historySnapshot && loadTaskHistoryForTasks) {
      const historyLoad = (await loadTaskHistoryForTasks([taskId]))[taskId];
      if (!historyLoad || historyLoad.status !== "ready") {
        setMessage({ tone: "warn", text: historyLoad?.error ?? "Could not load task history." });
        return false;
      }
      scopedHistory = historyLoad.history;
    }
    const historyForSync = deduplicateTaskHistoryByLogicalDate(scopedHistory);
    const existingEntry = historyForSync.find((entry) => entry.entry_date === entryDate);
    const historyReplacement = existingEntry && shouldKeepEntry && isTaskHistoryStatus(existingEntry.status)
      ? {
        logicalDate: entryDate,
        nextOutcome: status as HistoryOutcome,
        previousOutcome: existingEntry.status as HistoryOutcome,
        occurrenceDueOn: existingEntry.occurrence_due_on ?? entryDate,
        occurrenceIdentity: existingEntry.occurrence_key,
      } satisfies HistoryReplacement
      : undefined;

    if (!shouldKeepEntry) {
      const removedEntries = existingEntry ? [existingEntry] : [];
      if (!await deleteHistoryDates(taskId, [entryDate])) return false;
      const historyRemoval = buildHistoryRemoval(task, removedEntries);

      const nextHistory = historyForSync.filter((entry) => entry.entry_date !== entryDate);
      setTaskHistory((current) => {
        const filtered = current.filter((entry) =>
          !(entry.task_id === taskId && entry.entry_date === entryDate),
        );
        return filtered;
      });

      if (options?.syncLiveTask) {
        const result = await syncLiveTaskStatus(taskId, nextHistory, [entryDate], { historyRemoval });
        notifyHistoryMutation(taskId, nextHistory);
        return result;
      }

      notifyHistoryMutation(taskId, nextHistory);
      return true;
    }

    const automaticMissedDatesToClear = getWeeklyAutomaticMissedDateKeys(task, historyForSync, [entryDate], status);
    if (!await deleteHistoryDates(taskId, automaticMissedDatesToClear)) return false;
    const automaticMissedDateSet = new Set(automaticMissedDatesToClear);
    const historyAfterWeeklyReconciliation = historyForSync.filter((entry) => !automaticMissedDateSet.has(entry.entry_date));

    const replacementOccurrenceMetadata = existingEntry && (existingEntry.occurrence_due_on || existingEntry.occurrence_key)
      ? {
        occurrence_due_on: existingEntry.occurrence_due_on,
        occurrence_key: existingEntry.occurrence_key,
      }
      : null;
    const payload: TaskHistoryInsert = options?.historyEntry
      ? {
        ...options.historyEntry,
        entry_date: entryDate,
        status,
        task_id: taskId,
        user_id: currentUserId,
      }
      : {
        entry_date: entryDate,
        ...(replacementOccurrenceMetadata ?? buildTaskHistoryOccurrenceMetadata(
          options?.occurrenceTask ?? getCalendarOccurrenceTask(task, status, entryDate, historyAfterWeeklyReconciliation),
          status,
        )),
        status,
        task_id: taskId,
        user_id: currentUserId,
        was_completed: isTaskCompletedForHistory(status),
      };
    const { data, error } = await client
      .from("adhdice_task_history")
      .upsert(payload, { onConflict: "user_id,task_id,entry_date" })
      .select(TASK_HISTORY_COLUMNS)
      .single();

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    let nextHistory = historyAfterWeeklyReconciliation;
    if (data) {
      const mappedEntry = mapTaskHistoryRow(data);
      nextHistory = [
        mappedEntry,
        ...historyAfterWeeklyReconciliation.filter((entry) =>
          !(entry.task_id === mappedEntry.task_id && entry.entry_date === mappedEntry.entry_date),
        ),
      ].filter((entry) => entry.task_id === taskId);
      setTaskHistory((current) => {
        const merged = [
          mappedEntry,
          ...current.filter((entry) =>
            !(entry.task_id === mappedEntry.task_id
              && (entry.entry_date === mappedEntry.entry_date || automaticMissedDateSet.has(entry.entry_date))),
          ),
        ];
        return merged;
      });

      if (options?.syncLiveTask) {
        const result = await syncLiveTaskStatus(taskId, nextHistory, [entryDate], { historyReplacement });
        notifyHistoryMutation(taskId, nextHistory);
        return result;
      }
    }

    notifyHistoryMutation(taskId, nextHistory);
    return true;
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
    if (uniqueEntryDates.length === 0) {
      return true;
    }

    const canonicalTask = tasks.find((candidate) => candidate.id === taskId) ?? null;
    if (canonicalCommandsEnabled) {
      if (!canonicalTask) {
        setMessage({ tone: "warn", text: "The canonical Calendar action could not find the current Task; no legacy History fallback was used." });
        return false;
      }
      if (status !== "pending" && status !== "done" && status !== "did_my_best" && status !== "missed" && status !== "delayed" && status !== "complete") {
        setMessage({ tone: "warn", text: "This History status has no supported canonical command; no legacy History fallback was used." });
        return false;
      }

      let currentTask = canonicalTask as TaskStateRuntimeLocalTask;
      for (const entryDate of uniqueEntryDates) {
        const existingEntry = taskHistory.find((entry) => entry.task_id === taskId && entry.entry_date === entryDate)
          ?? options?.historySnapshot?.find((entry) => entry.task_id === taskId && entry.entry_date === entryDate)
          ?? null;
        const existingOccurrence = existingEntry?.canonical_occurrence_id ?? null;
        let canonicalIntent: TaskStateRuntimeCanonicalIntent;
        if (status === "pending") {
          canonicalIntent = {
            type: "clear_outcome",
            logical_date: entryDate,
            ...(existingEntry?.occurrence_key ? { occurrence_key: existingEntry.occurrence_key } : {}),
            ...(existingEntry?.occurrence_due_on ? { scheduled_due_on: existingEntry.occurrence_due_on } : {}),
          };
        } else if (status === "delayed") {
          const occurrenceResolution = await resolveCanonicalTaskOccurrence(client, currentUserId, taskId, {
            logicalDate: entryDate,
            occurrenceId: existingOccurrence,
            occurrenceKey: existingEntry?.occurrence_key,
            scheduledDueOn: existingEntry?.occurrence_due_on,
          });
          if (!occurrenceResolution.occurrence) {
            setMessage({ tone: "warn", text: occurrenceResolution.error ?? "Historical Delay requires a valid canonical occurrence; no legacy History fallback was used." });
            return false;
          }
          const effectiveDueOn = options?.historicalOverrideDelayUntilDate ?? null;
          if (!effectiveDueOn) {
            setMessage({ tone: "warn", text: "Historical Delay requires a future effective date; no legacy History fallback was used." });
            return false;
          }
          canonicalIntent = {
            type: "delay_occurrence",
            logical_date: entryDate,
            occurrence_key: occurrenceResolution.occurrence.occurrence_key,
            effective_due_on: effectiveDueOn,
          };
        } else canonicalIntent = status === "complete"
          ? {
            type: "complete_task",
            logical_date: entryDate,
            ...(existingEntry?.occurrence_key ? { occurrence_key: existingEntry.occurrence_key } : {}),
            ...(existingEntry?.occurrence_due_on ? { scheduled_due_on: existingEntry.occurrence_due_on } : {}),
          }
          : {
            type: "set_outcome",
            logical_date: entryDate,
            outcome: status,
            ...(existingEntry?.occurrence_key ? { occurrence_key: existingEntry.occurrence_key } : {}),
            ...(existingEntry?.occurrence_due_on ? { scheduled_due_on: existingEntry.occurrence_due_on } : {}),
          };
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

    let scopedHistory = options?.historySnapshot ?? taskHistory;
    if (!options?.historySnapshot && loadTaskHistoryForTasks) {
      const historyLoad = (await loadTaskHistoryForTasks([taskId]))[taskId];
      if (!historyLoad || historyLoad.status !== "ready") {
        setMessage({ tone: "warn", text: historyLoad?.error ?? "Could not load task history." });
        return false;
      }
      scopedHistory = historyLoad.history;
    }
    const historyForSync = deduplicateTaskHistoryByLogicalDate(scopedHistory.filter((entry) => entry.task_id === taskId));

    const shouldKeepEntries = isTaskHistoryStatus(status);
    if (!shouldKeepEntries) {
      const selectedDateSet = new Set(uniqueEntryDates);
      const removedEntries = historyForSync.filter((entry) => selectedDateSet.has(entry.entry_date));
      const historyRemoval = buildHistoryRemoval(tasks.find((candidate) => candidate.id === taskId), removedEntries);
      if (!await deleteHistoryDates(taskId, uniqueEntryDates)) return false;
      const nextTaskHistory = historyForSync.filter((entry) => !selectedDateSet.has(entry.entry_date));
      setTaskHistory((current) => {
        const filtered = current.filter((entry) => (
          entry.task_id !== taskId || !selectedDateSet.has(entry.entry_date)
        ));
        return filtered;
      });

      const result = options?.syncLiveTask
        ? await syncLiveTaskStatus(taskId, nextTaskHistory, uniqueEntryDates, { historyRemoval })
        : true;
      notifyHistoryMutation(taskId, nextTaskHistory);
      return result;
    }

    const task = tasks.find((candidate) => candidate.id === taskId);
    const existingTaskHistory = historyForSync;
    const automaticMissedDatesToClear = getWeeklyAutomaticMissedDateKeys(task, existingTaskHistory, uniqueEntryDates, status);
    if (!await deleteHistoryDates(taskId, automaticMissedDatesToClear)) return false;
    const automaticMissedDateSet = new Set(automaticMissedDatesToClear);
    const historyAfterWeeklyReconciliation = existingTaskHistory.filter((entry) => !automaticMissedDateSet.has(entry.entry_date));
    const missingMissedDates = !options?.historicalOverride
      && !options?.historyEntries
      && !TASK_STATE_ENGINE_INTEGRATION_ENABLED && status === "missed" && task
      ? uniqueEntryDates.flatMap((entryDate) => buildMissingScheduledMissedHistoryDateKeys(
        task,
        historyAfterWeeklyReconciliation,
        entryDate,
        currentDayKey,
      ))
      : [];
    const entryDatesToUpsert = Array.from(new Set([...uniqueEntryDates, ...missingMissedDates])).sort();
    const existingHistoryByDate = new Map(historyAfterWeeklyReconciliation.map((entry) => [entry.entry_date, entry]));
    const historyReplacement = uniqueEntryDates.length === 1
      ? (() => {
        const existingEntry = existingHistoryByDate.get(uniqueEntryDates[0]!);
        return existingEntry && isTaskHistoryStatus(existingEntry.status)
          ? {
            logicalDate: uniqueEntryDates[0]!,
            nextOutcome: status as HistoryOutcome,
            previousOutcome: existingEntry.status as HistoryOutcome,
            occurrenceDueOn: existingEntry.occurrence_due_on ?? uniqueEntryDates[0]!,
            occurrenceIdentity: existingEntry.occurrence_key,
          } satisfies HistoryReplacement
          : undefined;
      })()
      : undefined;
    const payloads: TaskHistoryInsert[] = options?.historyEntries
      ? options.historyEntries.map((entry) => ({
        ...entry,
        task_id: taskId,
        user_id: currentUserId,
      }))
      : entryDatesToUpsert.map((entryDate) => {
      const existingEntry = existingHistoryByDate.get(entryDate);
      const occurrenceMetadata = options?.historicalOverride
        ? buildManualTaskHistoryOverrideOccurrenceMetadata(task, entryDate, existingEntry ?? null)
        : existingEntry && (existingEntry.occurrence_due_on || existingEntry.occurrence_key)
          ? {
            occurrence_due_on: existingEntry.occurrence_due_on,
            occurrence_key: existingEntry.occurrence_key,
          }
          : buildTaskHistoryOccurrenceMetadata(
            getCalendarOccurrenceTask(task, status, entryDate, existingTaskHistory),
            status,
          );
      return {
        entry_date: entryDate,
        ...occurrenceMetadata,
        status,
        task_id: taskId,
        user_id: currentUserId,
        was_completed: isTaskCompletedForHistory(status),
      };
      });
    const { data, error } = await client
      .from("adhdice_task_history")
      .upsert(payloads, { onConflict: "user_id,task_id,entry_date" })
      .select(TASK_HISTORY_COLUMNS);

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    const mappedEntries = (data ?? []).map(mapTaskHistoryRow);
    const updatedDateSet = new Set(mappedEntries.map((entry) => entry.entry_date));
    const nextTaskHistory = [
      ...mappedEntries,
      ...historyAfterWeeklyReconciliation.filter((entry) => !updatedDateSet.has(entry.entry_date)),
    ].filter((entry) => entry.task_id === taskId);
    setTaskHistory((current) => {
      const merged = [
        ...mappedEntries,
        ...current.filter((entry) => (
          entry.task_id !== taskId || (!updatedDateSet.has(entry.entry_date) && !automaticMissedDateSet.has(entry.entry_date))
        )),
      ];
      return merged;
    });

    const overrideEntry = options?.historicalOverride && uniqueEntryDates.length === 1
      ? mappedEntries.find((entry) => entry.entry_date === uniqueEntryDates[0]) ?? null
      : null;
    const historicalOverride = overrideEntry
      ? {
        logicalDate: overrideEntry.entry_date,
        nextOutcome: overrideEntry.status as HistoryOutcome,
        previousOutcome: existingHistoryByDate.get(overrideEntry.entry_date)?.status as HistoryOutcome | undefined ?? null,
        occurrenceDueOn: overrideEntry.occurrence_due_on,
        occurrenceIdentity: overrideEntry.occurrence_key,
        ...(overrideEntry.status === "delayed"
          ? { delayUntilDate: options?.historicalOverrideDelayUntilDate }
          : {}),
      } satisfies HistoryManualOverride
      : undefined;

    const laterCompletionDateKey = status === "missed"
      ? nextTaskHistory
        .filter((entry) => (
          (entry.status === "done" || entry.status === "did_my_best")
          && uniqueEntryDates.some((entryDate) => entry.entry_date > entryDate)
        ))
        .map((entry) => entry.entry_date)
        .sort()
        .at(0)
      : null;

    const result = options?.syncLiveTask
      ? await syncLiveTaskStatus(taskId, nextTaskHistory, [
        ...uniqueEntryDates,
        ...(laterCompletionDateKey ? [laterCompletionDateKey] : []),
      ], { historicalOverride, historyReplacement })
      : true;
    notifyHistoryMutation(taskId, nextTaskHistory);
    return result;
  }

  return { syncTaskHistoryEntries, syncTaskHistoryEntry };
}
