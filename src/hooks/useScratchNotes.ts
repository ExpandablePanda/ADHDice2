"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ScratchNote, ScratchNoteStatus, ScratchNoteTaskLink } from "@/lib/database.types";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import { createScratchPaperRecordId, type ScratchPaperDraftValues } from "@/lib/scratch-paper-draft";
import { persistScratchPaperNoteInStages, replaceScratchPaperTaskLinksSafely } from "@/lib/scratch-paper-save";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;

export type ScratchNoteDraft = ScratchPaperDraftValues;

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

  const persistDraft = useCallback(async (
    noteId: string,
    draft: ScratchNoteDraft,
    writeNote: () => Promise<ScratchNote | null>,
  ) => {
    if (!client || !userId) return { corePersisted: false, error: "Scratch Paper is unavailable.", ok: false };
    try {
      const result = await persistScratchPaperNoteInStages({
        draft,
        noteId,
        readNote: async () => {
          const { data, error: readError } = await client
            .from("adhdice_scratch_notes")
            .select("*")
            .eq("id", noteId)
            .eq("user_id", userId)
            .maybeSingle();
          if (readError) throw readError;
          return data;
        },
        replaceLinks: () => replaceScratchPaperTaskLinksSafely(noteId, userId, draft.linkedTaskIds, {
          async listTaskIds(targetNoteId, targetUserId) {
            const { data, error: listError } = await client
              .from("adhdice_scratch_note_task_links")
              .select("task_id")
              .eq("note_id", targetNoteId)
              .eq("user_id", targetUserId)
              .order("created_at", { ascending: true });
            if (listError) throw listError;
            return (data ?? []).map((link) => link.task_id);
          },
          async insertTaskIds(targetNoteId, targetUserId, taskIds) {
            const { error: insertError } = await client.from("adhdice_scratch_note_task_links").insert(
              taskIds.map((taskId) => ({ note_id: targetNoteId, task_id: taskId, user_id: targetUserId })),
            );
            if (insertError) throw insertError;
          },
          async deleteTaskIds(targetNoteId, targetUserId, taskIds) {
            const { error: deleteError } = await client
              .from("adhdice_scratch_note_task_links")
              .delete()
              .eq("note_id", targetNoteId)
              .eq("user_id", targetUserId)
              .in("task_id", [...taskIds]);
            if (deleteError) throw deleteError;
          },
        }),
        userId,
        writeNote,
      });
      if (!result.ok) {
        if (result.corePersisted) await refresh();
        setError(result.error);
        return result;
      }
      await refresh();
      return result;
    } catch (caught) {
      const errorMessage = messageFromError(caught);
      setError(errorMessage);
      return { corePersisted: false, error: errorMessage, ok: false };
    }
  }, [client, refresh, userId]);

  const createNote = useCallback(async (draft: ScratchNoteDraft, requestedNoteId?: string) => {
    if (createInFlightRef.current || !client || !userId || (!draft.body.trim() && !draft.title.trim() && draft.linkedTaskIds.length === 0)) return null;
    createInFlightRef.current = true;
    const noteId = requestedNoteId ?? createScratchPaperRecordId();
    try {
      const result = await persistDraft(noteId, draft, async () => {
          const { data, error: insertError } = await client
            .from("adhdice_scratch_notes")
            .insert({ body: draft.body.trim(), id: noteId, title: draft.title.trim() || null, user_id: userId })
            .select("*")
            .single();
          if (insertError) throw insertError;
          return data;
      });
      return result.ok ? noteId : null;
    } catch (caught) {
      setError(messageFromError(caught));
      return null;
    } finally {
      createInFlightRef.current = false;
    }
  }, [client, persistDraft, userId]);

  const updateNote = useCallback(async (noteId: string, draft: ScratchNoteDraft) => {
    if (!client || !userId) return false;
    try {
      const result = await persistDraft(noteId, draft, async () => {
          const { data, error: updateError } = await client
            .from("adhdice_scratch_notes")
            .update({ body: draft.body.trim(), title: draft.title.trim() || null, updated_at: new Date().toISOString() })
            .eq("id", noteId)
            .eq("user_id", userId)
            .select("*")
            .maybeSingle();
          if (updateError) throw updateError;
          return data;
      });
      return result.ok;
    } catch (caught) {
      setError(messageFromError(caught));
      return false;
    }
  }, [client, persistDraft, userId]);

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
