"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dispatch, SetStateAction } from "react";
import type { TaskEditorLinkedNote } from "@/lib/task-notes";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type UseTaskNoteLinkActionsOptions = {
  client: SupabaseClient;
  currentUserId: string;
  setAvailableTaskNotes: Dispatch<SetStateAction<TaskEditorLinkedNote[]>>;
  setMessage: Dispatch<SetStateAction<Message | null>>;
};

export function useTaskNoteLinkActions({
  client,
  currentUserId,
  setAvailableTaskNotes,
  setMessage,
}: UseTaskNoteLinkActionsOptions) {
  async function syncTaskNoteLinks(taskId: string, linkedNoteIds: string[]) {
    const { data, error } = await client
      .from("adhdice_notes")
      .select("id,title,body,linked_task_ids,updated_at")
      .eq("user_id", currentUserId);

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    const notes = (data ?? []) as TaskEditorLinkedNote[];
    const targetIds = new Set(linkedNoteIds);
    const affectedNotes = notes.filter((note) => note.linked_task_ids.includes(taskId) || targetIds.has(note.id));

    for (const note of affectedNotes) {
      const nextLinkedTaskIds = targetIds.has(note.id)
        ? Array.from(new Set([...note.linked_task_ids, taskId]))
        : note.linked_task_ids.filter((linkedTaskId) => linkedTaskId !== taskId);

      const { error: updateError } = await client
        .from("adhdice_notes")
        .update({ linked_task_ids: nextLinkedTaskIds })
        .eq("id", note.id)
        .eq("user_id", currentUserId);

      if (updateError) {
        setMessage({ tone: "warn", text: updateError.message });
        return false;
      }
    }

    setAvailableTaskNotes((current) => {
      const byId = new Map(current.map((note) => [note.id, note]));
      for (const note of notes) {
        const nextLinkedTaskIds = targetIds.has(note.id)
          ? Array.from(new Set([...note.linked_task_ids, taskId]))
          : note.linked_task_ids.filter((linkedTaskId) => linkedTaskId !== taskId);
        byId.set(note.id, {
          ...note,
          linked_task_ids: nextLinkedTaskIds,
        });
      }
      return Array.from(byId.values()).sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    });

    return true;
  }

  return { syncTaskNoteLinks };
}
