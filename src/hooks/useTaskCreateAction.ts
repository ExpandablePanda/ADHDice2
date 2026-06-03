"use client";

import type { Dispatch, SetStateAction } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task } from "@/lib/database.types";
import type { TaskDraft } from "@/components/task-app/task-editor-model";
import type { TaskRoutingBucket } from "@/lib/task-buckets";
import { isMissingTaskEnergyNoneEnumError } from "@/lib/task-db-compat";
import { insertTaskRowWithLegacyEnergyFallback } from "@/lib/task-db-mutations";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type UseTaskCreateActionOptions = {
  client: SupabaseClient;
  currentUserId: string;
  routeTask: (taskId: string, bucket: TaskRoutingBucket | null) => void;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  shouldRouteTaskToInbox: (task: Task) => boolean;
  sortTasksForUi: (tasks: Task[]) => Task[];
};

export function useTaskCreateAction({
  client,
  currentUserId,
  routeTask,
  setMessage,
  setTasks,
  shouldRouteTaskToInbox,
  sortTasksForUi,
}: UseTaskCreateActionOptions) {
  async function addTask(task: TaskDraft) {
    const payload = {
      ...task,
      user_id: currentUserId,
      sort_order: Date.now(),
    };
    const { data, error, usedEnergyFallback } = await insertTaskRowWithLegacyEnergyFallback(
      client,
      payload,
      isMissingTaskEnergyNoneEnumError,
    );

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return null;
    }

    if (data) {
      setTasks((current) => sortTasksForUi([...current, data]));
      if (shouldRouteTaskToInbox(data)) {
        routeTask(data.id, "inbox");
      }
    }

    setMessage({
      tone: usedEnergyFallback ? "warn" : "good",
      text: usedEnergyFallback
        ? "Your database is missing the newer \"none\" energy level, so this task was saved with low energy instead. Run `supabase/add_task_energy_none.sql` to enable \"none\"."
        : "Task captured.",
    });
    return data ?? null;
  }

  return { addTask };
}
