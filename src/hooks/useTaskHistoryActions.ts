"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dispatch, SetStateAction } from "react";
import type { Task, TaskHistory as DbTaskHistory, TaskHistoryInsert, TaskStatus, TaskUpdate } from "@/lib/database.types";
import { buildTaskUpdateConflictMessage, type TaskRowUpdateOptions, type UpdateTaskRowResult } from "@/lib/task-db-mutations";
import { resolveLiveTaskStatusFromHistory } from "@/lib/task-history";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type UseTaskHistoryActionsOptions = {
  client: SupabaseClient;
  currentUserId: string;
  currentDayKey: string;
  dayStartTime: string;
  isTaskCompletedForHistory: (status: TaskStatus) => boolean;
  isTaskHistoryStatus: (status: TaskStatus) => boolean;
  mapTaskHistoryRow: (row: DbTaskHistory) => DbTaskHistory;
  now: Date;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTaskHistory: Dispatch<SetStateAction<DbTaskHistory[]>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  sortTasksForUi: (tasks: Task[]) => Task[];
  tasks: Task[];
  timezone: string;
  updateTaskRowWithLegacyEnergyFallback: (taskId: string, values: TaskUpdate, options?: TaskRowUpdateOptions) => Promise<UpdateTaskRowResult>;
};

export function useTaskHistoryActions({
  client,
  currentUserId,
  currentDayKey,
  dayStartTime,
  isTaskCompletedForHistory,
  isTaskHistoryStatus,
  mapTaskHistoryRow,
  now,
  setMessage,
  setTaskHistory,
  setTasks,
  sortTasksForUi,
  tasks,
  timezone,
  updateTaskRowWithLegacyEnergyFallback,
}: UseTaskHistoryActionsOptions) {
  async function syncLiveTaskStatus(taskId: string, nextHistory: DbTaskHistory[]) {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      return true;
    }

    const nextTaskState = resolveLiveTaskStatusFromHistory(task, nextHistory, {
      currentDayKey,
      dayStartTime,
      now,
      timezone,
    });

    if (task.status === nextTaskState.status && task.completed_at === nextTaskState.completedAt) {
      return true;
    }

    const { conflict, data, error } = await updateTaskRowWithLegacyEnergyFallback(
      taskId,
      {
        completed_at: nextTaskState.completedAt,
        status: nextTaskState.status,
      },
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
    options?: { syncLiveTask?: boolean },
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

      const nextHistory: DbTaskHistory[] = [];
      setTaskHistory((current) => {
        const filtered = current.filter((entry) =>
          !(entry.task_id === taskId && entry.entry_date === entryDate),
        );
        nextHistory.push(...filtered.filter((entry) => entry.task_id === taskId));
        return filtered;
      });

      if (options?.syncLiveTask) {
        return syncLiveTaskStatus(taskId, nextHistory);
      }

      return true;
    }

    const payload: TaskHistoryInsert = {
      entry_date: entryDate,
      status,
      task_id: taskId,
      user_id: currentUserId,
      was_completed: isTaskCompletedForHistory(status),
    };
    const { data, error } = await client
      .from("adhdice_task_history")
      .upsert(payload, { onConflict: "user_id,task_id,entry_date" })
      .select("*")
      .single();

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    if (data) {
      const mappedEntry = mapTaskHistoryRow(data);
      const nextHistory: DbTaskHistory[] = [];
      setTaskHistory((current) => {
        const merged = [
          mappedEntry,
          ...current.filter((entry) =>
            !(entry.task_id === mappedEntry.task_id && entry.entry_date === mappedEntry.entry_date),
          ),
        ];
        nextHistory.push(...merged.filter((entry) => entry.task_id === taskId));
        return merged;
      });

      if (options?.syncLiveTask) {
        return syncLiveTaskStatus(taskId, nextHistory);
      }
    }

    return true;
  }

  return { syncTaskHistoryEntry };
}
