"use client";

import { useCallback, useEffect, useState } from "react";

import type { VoiceMemo, VoiceMemoOriginKind } from "@/lib/database.types";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import { createBrowserUuidV4 } from "@/lib/browser-uuid";
import { transcribeScratchAudio } from "@/lib/scratch-paper-transcription";
import {
  buildVoiceMemoInsert,
  deleteVoiceMemoStorageThenRow,
  getVoiceMemoStoragePath,
  MAX_VOICE_MEMO_FILE_BYTES,
  persistVoiceMemo,
  VOICE_MEMO_BUCKET,
  VOICE_MEMO_SIGNED_URL_SECONDS,
} from "@/lib/voice-memo-persistence";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;

export type VoiceMemoCreateInput = {
  audio: Blob;
  durationSeconds: number;
  originKind: VoiceMemoOriginKind;
  scratchNoteId?: string | null;
  title?: string | null;
};

export type VoiceMemoSaveResult = {
  error: string | null;
  memo: VoiceMemo | null;
};

export type VoiceMemoData = {
  createMemo: (input: VoiceMemoCreateInput) => Promise<VoiceMemoSaveResult>;
  deleteMemo: (memo: VoiceMemo) => Promise<boolean>;
  error: string | null;
  getPlaybackUrl: (memo: VoiceMemo) => Promise<string | null>;
  isLoading: boolean;
  memos: VoiceMemo[];
  refresh: () => Promise<void>;
  renameMemo: (memo: VoiceMemo, title: string) => Promise<boolean>;
  transcribeMemo: (memo: VoiceMemo) => Promise<boolean>;
  userId: string | null;
};

function userVisibleError() {
  return "Voice Memo could not be saved. Try again.";
}

function messageFromError() {
  return "Voice Memos could not sync. Try again.";
}

function normalizedDuration(seconds: number) {
  return Math.max(0, Math.min(120, Math.round(Number.isFinite(seconds) ? seconds : 0)));
}

export function useVoiceMemos(client: SupabaseClient, userId: string | null, enabled: boolean): VoiceMemoData {
  const [memos, setMemos] = useState<VoiceMemo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !client || !userId) {
      return;
    }
    setIsLoading(true);
    const { data, error: loadError } = await client
      .from("adhdice_voice_memos")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (loadError) {
      setError(messageFromError());
    } else {
      setMemos(data ?? []);
      setError(null);
    }
    setIsLoading(false);
  }, [client, enabled, userId]);

  useEffect(() => {
    if (!enabled) return;
    const timeoutId = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [enabled, refresh]);

  const createMemo = useCallback(async (input: VoiceMemoCreateInput): Promise<VoiceMemoSaveResult> => {
    if (!client || !userId) return { error: "Voice Memos are unavailable until you are signed in.", memo: null };
    if (input.audio.size <= 0) return { error: "The recording is empty. Try again.", memo: null };
    if (input.audio.size > MAX_VOICE_MEMO_FILE_BYTES) return { error: "The recording is too large. Try a shorter memo.", memo: null };
    if (input.originKind === "scratch_note" && !input.scratchNoteId) return { error: "Save the Scratch Paper note before recording a memo.", memo: null };

    const memoId = createBrowserUuidV4();
    const mimeType = input.audio.type || "audio/webm";
    const storagePath = getVoiceMemoStoragePath(userId, memoId, mimeType);
    const metadata = buildVoiceMemoInsert({
      duration_seconds: normalizedDuration(input.durationSeconds),
      id: memoId,
      mime_type: mimeType,
      origin_kind: input.originKind,
      scratch_note_id: input.originKind === "scratch_note" ? input.scratchNoteId ?? null : null,
      size_bytes: input.audio.size,
      storage_path: storagePath,
      title: input.title?.trim() || null,
      user_id: userId,
    });
    const storage = client.storage.from(VOICE_MEMO_BUCKET);

    try {
      const memo = await persistVoiceMemo({
        insert: async () => {
          const { data, error: insertError } = await client
            .from("adhdice_voice_memos")
            .insert(metadata)
            .select("*")
            .single();
          if (insertError || !data) throw insertError ?? new Error(userVisibleError());
          return data;
        },
        removeUploadedObject: async () => {
          const { error: removeError } = await storage.remove([storagePath]);
          if (removeError) throw removeError;
        },
        upload: async () => {
          const { error: uploadError } = await storage.upload(storagePath, input.audio, { contentType: mimeType, upsert: false });
          if (uploadError) throw uploadError;
        },
      });
      setMemos((current) => [memo, ...current.filter((entry) => entry.id !== memo.id)]);
      setError(null);
      return { error: null, memo };
    } catch {
      setError(userVisibleError());
      return { error: userVisibleError(), memo: null };
    }
  }, [client, userId]);

  const renameMemo = useCallback(async (memo: VoiceMemo, title: string) => {
    if (!client || !userId) return false;
    const nextTitle = title.trim() || null;
    const { data, error: updateError } = await client
      .from("adhdice_voice_memos")
      .update({ title: nextTitle, updated_at: new Date().toISOString() })
      .eq("id", memo.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (updateError || !data) {
      setError("Voice Memo title could not be updated.");
      return false;
    }
    setMemos((current) => current.map((entry) => entry.id === memo.id ? data : entry));
    return true;
  }, [client, userId]);

  const getPlaybackUrl = useCallback(async (memo: VoiceMemo) => {
    if (!client || !userId || memo.user_id !== userId) return null;
    const { data, error: urlError } = await client.storage.from(VOICE_MEMO_BUCKET).createSignedUrl(memo.storage_path, VOICE_MEMO_SIGNED_URL_SECONDS);
    if (urlError || !data?.signedUrl) {
      setError("Voice Memo playback is unavailable. Try again.");
      return null;
    }
    return data.signedUrl;
  }, [client, userId]);

  const transcribeMemo = useCallback(async (memo: VoiceMemo) => {
    if (!client || !userId || memo.user_id !== userId) return false;
    try {
      const { data: audio, error: downloadError } = await client.storage.from(VOICE_MEMO_BUCKET).download(memo.storage_path);
      if (downloadError || !audio) throw downloadError ?? new Error("Voice Memo audio is unavailable.");
      const transcript = await transcribeScratchAudio(client, audio);
      const { data, error: updateError } = await client
        .from("adhdice_voice_memos")
        .update({ transcript, transcribed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", memo.id)
        .eq("user_id", userId)
        .select("*")
        .single();
      if (updateError || !data) throw updateError ?? new Error("Voice Memo transcript could not be saved.");
      setMemos((current) => current.map((entry) => entry.id === memo.id ? data : entry));
      setError(null);
      return true;
    } catch {
      setError("Voice Memo transcription failed. The saved audio is unchanged.");
      return false;
    }
  }, [client, userId]);

  const deleteMemo = useCallback(async (memo: VoiceMemo) => {
    if (!client || !userId || memo.user_id !== userId) return false;
    try {
      await deleteVoiceMemoStorageThenRow({
        deleteRow: async () => {
          const { error: deleteError } = await client
            .from("adhdice_voice_memos")
            .delete()
            .eq("id", memo.id)
            .eq("user_id", userId);
          if (deleteError) throw deleteError;
        },
        removeStorageObject: async () => {
          const { error: removeError } = await client.storage.from(VOICE_MEMO_BUCKET).remove([memo.storage_path]);
          if (removeError) throw removeError;
        },
      });
      setMemos((current) => current.filter((entry) => entry.id !== memo.id));
      setError(null);
      return true;
    } catch {
      setError("Voice Memo could not be deleted. The saved memo is still available to retry.");
      return false;
    }
  }, [client, userId]);

  return { createMemo, deleteMemo, error, getPlaybackUrl, isLoading, memos, refresh, renameMemo, transcribeMemo, userId };
}
