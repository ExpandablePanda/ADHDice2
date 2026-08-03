"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dispatch, SetStateAction } from "react";
import type { Task, TaskHistory as DbTaskHistory, TaskHistoryInsert, TaskStatus, TaskUpdate } from "@/lib/database.types";
import { buildTaskUpdateConflictMessage, type TaskRowUpdateOptions, type UpdateTaskRowResult } from "@/lib/task-db-mutations";
import { applyTaskActiveStatusTracking } from "@/lib/task-active-status";
import { buildTaskHistoryOccurrenceMetadata } from "@/lib/task-duration-evidence";
import { buildMissingScheduledMissedHistoryDateKeys, resolveLiveTaskStatusFromHistory, TASK_HISTORY_COLUMNS } from "@/lib/task-history";
import { evaluateTaskActionAuthority } from "@/lib/task-state-engine/action-authority";
import { TASK_STATE_ENGINE_INTEGRATION_ENABLED } from "@/lib/task-state-engine/read-authority";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type UseTaskHistoryActionsOptions = {
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
  tasks: Task[];
  timezone: string;
  updateTaskRowWithLegacyEnergyFallback: (taskId: string, values: TaskUpdate, options?: TaskRowUpdateOptions) => Promise<UpdateTaskRowResult>;
};

export function useTaskHistoryActions({
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
  tasks,
  timezone,
  updateTaskRowWithLegacyEnergyFallback,
}: UseTaskHistoryActionsOptions) {
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
      ?? (task.due_on && task.due_on >= entryDate ? task.due_on : null);

    return occurrenceDueOn
      ? { ...task, active_occurrence_due_on: occurrenceDueOn }
      : task;
  }

  async function syncLiveTaskStatus(taskId: string, nextHistory: DbTaskHistory[], editedHistoryDateKeys?: string[]) {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      return true;
    }

    const engineState = evaluateTaskActionAuthority({
      history: nextHistory,
      logicalDayRollover: dayStartTime,
      now,
      task,
      timezone,
    });
    const nextTaskState = engineState
      ? {
        completedAt: engineState.persistableTaskPatch.completedAt ?? task.completed_at,
        dueOn: Object.hasOwn(engineState.persistableTaskPatch, "dueOn") ? engineState.persistableTaskPatch.dueOn : undefined,
        // `activeStatus` may be the engine-only derived `unscheduled` state.
        // Writes must retain the stored canonical status when no safe patch exists.
        status: engineState.persistableTaskPatch.status ?? task.status,
      }
      : resolveLiveTaskStatusFromHistory(task, nextHistory, {
      currentDayKey,
      dayStartTime,
      now,
      timezone,
    }, { calcNextDueDateFromDate, editedHistoryDateKeys });

    if (
      task.status === nextTaskState.status
      && task.completed_at === nextTaskState.completedAt
      && (nextTaskState.dueOn === undefined || task.due_on === nextTaskState.dueOn)
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
    options?: { occurrenceTask?: Task | null; syncLiveTask?: boolean },
  ) {
    const shouldKeepEntry = isTaskHistoryStatus(status);

    if (!shouldKeepEntry) {
      const { error } = await client
        .from("adhdice_task_history")
        .delete()
        .eq("task_id", taskId)
        .eq("user_id", currentUserId)
        .eq("entry_date", entryDate);

      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }

      const nextHistory = taskHistory.filter((entry) =>
        entry.task_id === taskId && entry.entry_date !== entryDate,
      );
      setTaskHistory((current) => {
        const filtered = current.filter((entry) =>
          !(entry.task_id === taskId && entry.entry_date === entryDate),
        );
        return filtered;
      });

      if (options?.syncLiveTask) {
        const result = await syncLiveTaskStatus(taskId, nextHistory, [entryDate]);
        notifyHistoryMutation(taskId, nextHistory);
        return result;
      }

      notifyHistoryMutation(taskId, nextHistory);
      return true;
    }

    const payload: TaskHistoryInsert = {
      entry_date: entryDate,
      ...buildTaskHistoryOccurrenceMetadata(
        options?.occurrenceTask ?? tasks.find((task) => task.id === taskId),
        status,
      ),
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

    let nextHistory = taskHistory.filter((entry) => entry.task_id === taskId);
    if (data) {
      const mappedEntry = mapTaskHistoryRow(data);
      nextHistory = [
        mappedEntry,
        ...taskHistory.filter((entry) =>
          !(entry.task_id === mappedEntry.task_id && entry.entry_date === mappedEntry.entry_date),
        ),
      ].filter((entry) => entry.task_id === taskId);
      setTaskHistory((current) => {
        const merged = [
          mappedEntry,
          ...current.filter((entry) =>
            !(entry.task_id === mappedEntry.task_id && entry.entry_date === mappedEntry.entry_date),
          ),
        ];
        return merged;
      });

      if (options?.syncLiveTask) {
        const result = await syncLiveTaskStatus(taskId, nextHistory, [entryDate]);
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
    options?: { syncLiveTask?: boolean },
  ) {
    const uniqueEntryDates = Array.from(new Set(entryDates)).sort();
    if (uniqueEntryDates.length === 0) {
      return true;
    }

    const shouldKeepEntries = isTaskHistoryStatus(status);
    if (!shouldKeepEntries) {
      const { error } = await client
        .from("adhdice_task_history")
        .delete()
        .eq("task_id", taskId)
        .eq("user_id", currentUserId)
        .in("entry_date", uniqueEntryDates);

      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }

      const selectedDateSet = new Set(uniqueEntryDates);
      const nextTaskHistory = taskHistory.filter((entry) => (
        entry.task_id === taskId && !selectedDateSet.has(entry.entry_date)
      ));
      setTaskHistory((current) => {
        const filtered = current.filter((entry) => (
          entry.task_id !== taskId || !selectedDateSet.has(entry.entry_date)
        ));
        return filtered;
      });

      const result = options?.syncLiveTask
        ? await syncLiveTaskStatus(taskId, nextTaskHistory, uniqueEntryDates)
        : true;
      notifyHistoryMutation(taskId, nextTaskHistory);
      return result;
    }

    const task = tasks.find((candidate) => candidate.id === taskId);
    const existingTaskHistory = taskHistory.filter((entry) => entry.task_id === taskId);
    const missingMissedDates = !TASK_STATE_ENGINE_INTEGRATION_ENABLED && status === "missed" && task
      ? uniqueEntryDates.flatMap((entryDate) => buildMissingScheduledMissedHistoryDateKeys(
        task,
        existingTaskHistory,
        entryDate,
        currentDayKey,
      ))
      : [];
    const entryDatesToUpsert = Array.from(new Set([...uniqueEntryDates, ...missingMissedDates])).sort();
    const payloads: TaskHistoryInsert[] = entryDatesToUpsert.map((entryDate) => ({
      entry_date: entryDate,
      ...buildTaskHistoryOccurrenceMetadata(
        getCalendarOccurrenceTask(task, status, entryDate, existingTaskHistory),
        status,
      ),
      status,
      task_id: taskId,
      user_id: currentUserId,
      was_completed: isTaskCompletedForHistory(status),
    }));
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
      ...taskHistory.filter((entry) => (
        entry.task_id !== taskId || !updatedDateSet.has(entry.entry_date)
      )),
    ].filter((entry) => entry.task_id === taskId);
    setTaskHistory((current) => {
      const merged = [
        ...mappedEntries,
        ...current.filter((entry) => (
          entry.task_id !== taskId || !updatedDateSet.has(entry.entry_date)
        )),
      ];
      return merged;
    });

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
      ])
      : true;
    notifyHistoryMutation(taskId, nextTaskHistory);
    return result;
  }

  return { syncTaskHistoryEntries, syncTaskHistoryEntry };
}
