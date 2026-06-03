"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dispatch, SetStateAction } from "react";
import type { Task } from "@/lib/database.types";
import type { TaskRoutingBucket } from "@/lib/task-buckets";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type UseTaskCrudActionsOptions = {
  client: SupabaseClient;
  currentUserId: string;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTaskRouting: Dispatch<SetStateAction<Record<string, TaskRoutingBucket>>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  shouldRouteTaskToInbox: (task: Task) => boolean;
  sortTasksForUi: (tasks: Task[]) => Task[];
};

export function useTaskCrudActions({
  client,
  currentUserId,
  setMessage,
  setTaskRouting,
  setTasks,
  shouldRouteTaskToInbox,
  sortTasksForUi,
}: UseTaskCrudActionsOptions) {
  async function importTasks(lines: string[]) {
    if (lines.length === 0) {
      return;
    }

    const payload = lines.map((title, index) => ({
      title,
      user_id: currentUserId,
      sort_order: Date.now() + index,
    }));

    const { data, error } = await client
      .from("adhdice_clean_tasks")
      .insert(payload)
      .select("*");

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return;
    }

    if (data) {
      setTasks((current) => sortTasksForUi([...current, ...data]));
      setTaskRouting((current) => {
        const next = { ...current };
        for (const task of data) {
          if (shouldRouteTaskToInbox(task)) {
            next[task.id] = "inbox";
          }
        }
        return next;
      });
    }

    setMessage({ tone: "good", text: `${lines.length} task${lines.length === 1 ? "" : "s"} imported.` });
  }

  async function deleteTasks(taskIds: string[]) {
    const { error } = await client
      .from("adhdice_clean_tasks")
      .delete()
      .in("id", taskIds)
      .eq("user_id", currentUserId);

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    setTasks((current) => current.filter((task) => !taskIds.includes(task.id)));
    setTaskRouting((current) => {
      const next = { ...current };
      for (const taskId of taskIds) {
        delete next[taskId];
      }
      return next;
    });
    setMessage({ tone: "good", text: `Deleted ${taskIds.length} task${taskIds.length === 1 ? "" : "s"}.` });
    return true;
  }

  return {
    deleteTasks,
    importTasks,
  };
}
