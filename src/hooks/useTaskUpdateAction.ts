"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Task, TaskUpdate } from "@/lib/database.types";
import type { TaskRowUpdateOptions, UpdateTaskRowResult } from "@/lib/task-db-mutations";
import { normalizeOpenTaskStatusForDueDate } from "@/lib/task-cockpit";
import { buildTaskUpdateConflictMessage } from "@/lib/task-db-mutations";
import type { TaskRewardCandidate } from "@/lib/task-rewards";
import type { TaskRoutingBucket } from "@/lib/task-buckets";
import { shouldReconcileOverdueTaskMisses } from "@/lib/task-repeat";
import { applyTaskActiveStatusTracking } from "@/lib/task-active-status";
import { TASK_STATE_ENGINE_INTEGRATION_ENABLED } from "@/lib/task-state-engine/read-authority";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type UpdateTaskActionOptions = {
  expectedTask?: Task | null;
  historyStatus?: Task["status"];
};

type UseTaskUpdateActionOptions = {
  clearPendingTaskMutations?: (taskIds: string[]) => void;
  currentDayKey: string;
  markPendingTaskMutations?: (taskIds: string[]) => void;
  onTasksCompleted: (candidates: TaskRewardCandidate[]) => Promise<void>;
  reconcileOverdueTaskMisses: (task: Task) => Promise<boolean>;
  routeTask: (taskId: string, bucket: TaskRoutingBucket | null) => void;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  sortTasksForUi: (tasks: Task[]) => Task[];
  syncTaskHistoryEntry: (taskId: string, status: Task["status"], occurrenceTask?: Task | null) => Promise<boolean>;
  tasks: Task[];
  updateTaskRowWithLegacyEnergyFallback: (taskId: string, values: TaskUpdate, options?: TaskRowUpdateOptions) => Promise<UpdateTaskRowResult>;
};

export function useTaskUpdateAction({
  clearPendingTaskMutations,
  currentDayKey,
  markPendingTaskMutations,
  onTasksCompleted,
  reconcileOverdueTaskMisses,
  routeTask,
  setMessage,
  setTasks,
  sortTasksForUi,
  syncTaskHistoryEntry,
  tasks,
  updateTaskRowWithLegacyEnergyFallback,
}: UseTaskUpdateActionOptions) {
  async function updateTask(taskId: string, values: TaskUpdate, options?: UpdateTaskActionOptions) {
    markPendingTaskMutations?.([taskId]);
    const previousTask = options?.expectedTask ?? tasks.find((task) => task.id === taskId) ?? null;
    const normalizedValues = previousTask && Object.prototype.hasOwnProperty.call(values, "due_on")
      ? {
        ...values,
        status: normalizeOpenTaskStatusForDueDate({
          due_on: values.due_on ?? null,
          status: (values.status ?? previousTask.status) as Task["status"],
        }, currentDayKey),
      }
      : values;
    const nextValues = previousTask
      ? applyTaskActiveStatusTracking(previousTask, normalizedValues, currentDayKey)
      : normalizedValues;
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
      if (data.status === "done" || data.status === "did_my_best" || data.status === "complete" || data.status === "archived" || data.status === "trashed") {
        routeTask(taskId, null);
      }
      if (shouldReconcileOverdueTaskMisses(nextData, currentDayKey)) {
        const historyReconciled = await reconcileOverdueTaskMisses(nextData);
        if (!historyReconciled) {
          return false;
        }
      }
      // The engine plan owns History outcome. A recurring success may project
      // an active future status, which must never replace or clear that row.
      const historySaved = await syncTaskHistoryEntry(
        taskId,
        (options?.historyStatus ?? values.status ?? data.status) as Task["status"],
        previousTask ?? nextData,
      );
      if (!historySaved) {
        return;
      }
      await onTasksCompleted([{
        // The engine action projection already rebases supported recurrence.
        // Keep legacy finalization only for the compatibility fallback.
        forceRecurringFinalization: !TASK_STATE_ENGINE_INTEGRATION_ENABLED
          && (values.status === "done" || values.status === "did_my_best"),
        previousStatus: previousTask?.status ?? null,
        task: nextData,
      }]);

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
