import type { Dispatch, SetStateAction } from "react";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import type { Task } from "@/lib/database.types";
import { normalizeTaskFocusIds } from "@/lib/task-focus-days";
import { updateFocusedTaskIdsByDate } from "@/lib/task-momentum";

type Message = {
  tone: "neutral" | "good" | "warn";
  text: string;
};

type UseFocusSelectionPersistenceInput = {
  currentUserId: string | null;
  defaultValidTaskIds: Set<string> | Task[];
  setFocusedTaskIdsByDate: Dispatch<SetStateAction<Record<string, string[]>>>;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  supabase: ReturnType<typeof createBrowserSupabaseClient>;
  todayKey: string;
};

export function useFocusSelectionPersistence({
  currentUserId,
  defaultValidTaskIds,
  setFocusedTaskIdsByDate,
  setMessage,
  supabase,
  todayKey,
}: UseFocusSelectionPersistenceInput) {
  async function saveFocusSelection(nextTaskIds: string[], validTaskIds: Set<string> | Task[] = defaultValidTaskIds) {
    if (!supabase || !currentUserId) {
      return;
    }

    const normalizedTaskIds = normalizeTaskFocusIds(nextTaskIds, validTaskIds);

    setFocusedTaskIdsByDate((prev) => updateFocusedTaskIdsByDate(prev, todayKey, normalizedTaskIds));

    if (normalizedTaskIds.length === 0) {
      const { error } = await supabase
        .from("adhdice_task_focus_days")
        .delete()
        .eq("user_id", currentUserId)
        .eq("focus_date", todayKey);

      if (error) {
        setMessage({ tone: "warn", text: error.message });
      }

      return;
    }

    const { error } = await supabase
      .from("adhdice_task_focus_days")
      .upsert(
        {
          user_id: currentUserId,
          focus_date: todayKey,
          task_ids: normalizedTaskIds,
        },
        { onConflict: "user_id,focus_date" },
      );

    if (error) {
      setMessage({ tone: "warn", text: error.message });
    }
  }

  return {
    saveFocusSelection,
  };
}
