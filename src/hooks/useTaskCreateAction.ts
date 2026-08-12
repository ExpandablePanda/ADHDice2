"use client";

import type { Dispatch, SetStateAction } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task, TaskInsert } from "@/lib/database.types";
import type { TaskDraft } from "@/components/task-app/task-editor-model";
import type { TaskRoutingBucket } from "@/lib/task-buckets";
import { isMissingTaskEnergyNoneEnumError } from "@/lib/task-db-compat";
import {
  insertTaskRowWithCanonicalCreation,
  insertTaskRowWithLegacyEnergyFallback,
  type CanonicalTaskCreator,
} from "@/lib/task-db-mutations";
import { TASK_STATE_CANONICAL_COMMANDS_ENABLED } from "@/lib/task-state-runtime-gate";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type UseTaskCreateActionOptions = {
  canonicalCommandsEnabled?: boolean;
  canonicalTaskCreator?: CanonicalTaskCreator;
  client: SupabaseClient;
  currentUserId: string;
  routeTask: (taskId: string, bucket: TaskRoutingBucket | null) => void;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  shouldRouteTaskToInbox: (task: Task) => boolean;
  sortTasksForUi: (tasks: Task[]) => Task[];
};

export function useTaskCreateAction({
  canonicalCommandsEnabled = TASK_STATE_CANONICAL_COMMANDS_ENABLED,
  canonicalTaskCreator,
  client,
  currentUserId,
  routeTask,
  setMessage,
  setTasks,
  shouldRouteTaskToInbox,
  sortTasksForUi,
}: UseTaskCreateActionOptions) {
  async function addTask(task: TaskDraft) {
    const payload: TaskInsert = {
      ...task,
      user_id: currentUserId,
      sort_order: Date.now(),
    };
    const result = canonicalCommandsEnabled
      ? await (canonicalTaskCreator ?? ((nextPayload, source) => insertTaskRowWithCanonicalCreation(client, nextPayload, source)))(payload, "task_creation")
      : await insertTaskRowWithLegacyEnergyFallback(client, payload, isMissingTaskEnergyNoneEnumError);
    const { data, error, usedEnergyFallback } = result;

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
