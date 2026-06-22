"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ScratchNote, ScratchNoteStatus, ScratchNoteTaskLink } from "@/lib/database.types";
import type { createBrowserSupabaseClient } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;

export type ScratchNoteDraft = {
  body: string;
  linkedTaskIds: string[];
  title: string;
};

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "Scratch Paper could not sync.";
}

export function useScratchNotes(client: SupabaseClient, userId: string | null) {
  const [notes, setNotes] = useState<ScratchNote[]>([]);
  const [links, setLinks] = useState<ScratchNoteTaskLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createInFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!client || !userId) {
      setNotes([]);
      setLinks([]);
      return;
    }

    setIsLoading(true);
    const [noteResult, linkResult] = await Promise.all([
      client.from("adhdice_scratch_notes").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
      client.from("adhdice_scratch_note_task_links").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
    ]);
    const loadError = noteResult.error ?? linkResult.error;
    if (loadError) {
      setError(loadError.message);
    } else {
      setNotes(noteResult.data ?? []);
      setLinks(linkResult.data ?? []);
      setError(null);
    }
    setIsLoading(false);
  }, [client, userId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [refresh]);

  const replaceLinks = useCallback(async (noteId: string, taskIds: string[]) => {
    if (!client || !userId) return false;
    const { error: deleteError } = await client
      .from("adhdice_scratch_note_task_links")
      .delete()
      .eq("note_id", noteId)
      .eq("user_id", userId);
    if (deleteError) throw deleteError;

    const uniqueTaskIds = [...new Set(taskIds)];
    if (uniqueTaskIds.length > 0) {
      const { error: insertError } = await client.from("adhdice_scratch_note_task_links").insert(
        uniqueTaskIds.map((taskId) => ({ note_id: noteId, task_id: taskId, user_id: userId })),
      );
      if (insertError) throw insertError;
    }
    return true;
  }, [client, userId]);

  const createNote = useCallback(async (draft: ScratchNoteDraft) => {
    if (createInFlightRef.current || !client || !userId || (!draft.body.trim() && !draft.title.trim() && draft.linkedTaskIds.length === 0)) return null;
    createInFlightRef.current = true;
    try {
      const { data, error: insertError } = await client
        .from("adhdice_scratch_notes")
        .insert({ body: draft.body.trim(), title: draft.title.trim() || null, user_id: userId })
        .select("*")
        .single();
      if (insertError) throw insertError;
      await replaceLinks(data.id, draft.linkedTaskIds);
      await refresh();
      return data.id;
    } catch (caught) {
      setError(messageFromError(caught));
      return null;
    } finally {
      createInFlightRef.current = false;
    }
  }, [client, refresh, replaceLinks, userId]);

  const updateNote = useCallback(async (noteId: string, draft: ScratchNoteDraft) => {
    if (!client || !userId) return false;
    try {
      const { error: updateError } = await client
        .from("adhdice_scratch_notes")
        .update({ body: draft.body.trim(), title: draft.title.trim() || null, updated_at: new Date().toISOString() })
        .eq("id", noteId)
        .eq("user_id", userId);
      if (updateError) throw updateError;
      await replaceLinks(noteId, draft.linkedTaskIds);
      await refresh();
      return true;
    } catch (caught) {
      setError(messageFromError(caught));
      return false;
    }
  }, [client, refresh, replaceLinks, userId]);

  const setNoteStatus = useCallback(async (noteId: string, status: ScratchNoteStatus) => {
    if (!client || !userId) return false;
    const now = new Date().toISOString();
    const { error: updateError } = await client
      .from("adhdice_scratch_notes")
      .update({
        resolved_at: status === "resolved" ? now : null,
        status,
        trashed_at: status === "trashed" ? now : null,
        updated_at: now,
      })
      .eq("id", noteId)
      .eq("user_id", userId);
    if (updateError) {
      setError(updateError.message);
      return false;
    }
    await refresh();
    return true;
  }, [client, refresh, userId]);

  return { createNote, error, isLoading, links, notes, refresh, setNoteStatus, updateNote };
}
