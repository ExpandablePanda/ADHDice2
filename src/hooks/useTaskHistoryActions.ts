"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dispatch, SetStateAction } from "react";
import type { TaskHistory as DbTaskHistory, TaskHistoryInsert, TaskStatus } from "@/lib/database.types";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type UseTaskHistoryActionsOptions = {
  client: SupabaseClient;
  currentUserId: string;
  isTaskCompletedForHistory: (status: TaskStatus) => boolean;
  isTaskHistoryStatus: (status: TaskStatus) => boolean;
  mapTaskHistoryRow: (row: DbTaskHistory) => DbTaskHistory;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTaskHistory: Dispatch<SetStateAction<DbTaskHistory[]>>;
};

export function useTaskHistoryActions({
  client,
  currentUserId,
  isTaskCompletedForHistory,
  isTaskHistoryStatus,
  mapTaskHistoryRow,
  setMessage,
  setTaskHistory,
}: UseTaskHistoryActionsOptions) {
  async function syncTaskHistoryEntry(taskId: string, status: TaskStatus, entryDate: string) {
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

      setTaskHistory((current) => current.filter((entry) =>
        !(entry.task_id === taskId && entry.entry_date === entryDate),
      ));
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
      setTaskHistory((current) => [
        mappedEntry,
        ...current.filter((entry) =>
          !(entry.task_id === mappedEntry.task_id && entry.entry_date === mappedEntry.entry_date),
        ),
      ]);
    }

    return true;
  }

  return { syncTaskHistoryEntry };
}
