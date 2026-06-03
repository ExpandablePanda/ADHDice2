"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Task, TaskUpdate } from "@/lib/database.types";
import type { TaskRewardCandidate } from "@/lib/task-rewards";
import type { TaskRoutingBucket } from "@/lib/task-buckets";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type UpdateTaskRowResult = {
  data: Task | null;
  error: { message: string } | null;
  usedActualSecondsFallback: boolean;
  usedEnergyFallback: boolean;
};

type UseTaskUpdateActionOptions = {
  onTasksCompleted: (candidates: TaskRewardCandidate[]) => Promise<void>;
  routeTask: (taskId: string, bucket: TaskRoutingBucket | null) => void;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  sortTasksForUi: (tasks: Task[]) => Task[];
  syncTaskHistoryEntry: (taskId: string, status: Task["status"]) => Promise<boolean>;
  tasks: Task[];
  updateTaskRowWithLegacyEnergyFallback: (taskId: string, values: TaskUpdate) => Promise<UpdateTaskRowResult>;
};

export function useTaskUpdateAction({
  onTasksCompleted,
  routeTask,
  setMessage,
  setTasks,
  sortTasksForUi,
  syncTaskHistoryEntry,
  tasks,
  updateTaskRowWithLegacyEnergyFallback,
}: UseTaskUpdateActionOptions) {
  async function updateTask(taskId: string, values: TaskUpdate) {
    const previousTask = tasks.find((task) => task.id === taskId) ?? null;
    const { data, error, usedEnergyFallback, usedActualSecondsFallback } = await updateTaskRowWithLegacyEnergyFallback(taskId, values);

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return;
    }

    if (data) {
      const nextData = usedActualSecondsFallback && typeof values.actual_seconds === "number"
        ? { ...data, actual_seconds: values.actual_seconds }
        : data;

      setTasks((current) => sortTasksForUi(current.map((task) => task.id === taskId ? nextData : task)));
      if (data.status === "done" || data.status === "did_my_best" || data.status === "archived") {
        routeTask(taskId, null);
      }
      const historySaved = await syncTaskHistoryEntry(taskId, data.status);
      if (!historySaved) {
        return;
      }
      await onTasksCompleted([{ previousStatus: previousTask?.status ?? null, task: nextData }]);

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
  }

  return { updateTask };
}
