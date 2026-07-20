"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  brainstormStateSignature,
  createEmptyBrainstormState,
  normalizeBrainstormState,
  serializeBrainstormStateUpdate,
  updateBrainstormState,
  type BrainstormPersistedState,
  type BrainstormStateChanges,
  type BrainstormStateField,
} from "@/lib/brainstorm-state";

const CACHE_PREFIX = "adhdice-brainstorm-state";
const WRITE_DELAY_MS = 650;

function isMissingTableError(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.code === "42703" || error?.code === "PGRST204" || error?.code === "PGRST205" || /(adhdice_brainstorm_state|qa_state).*(not found|schema cache|does not exist)/i.test(error?.message ?? "");
}

function cacheKey(userId: string) { return `${CACHE_PREFIX}:${userId}`; }
function timestamp(value: string) { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : 0; }

export type BrainstormSyncState = "loading" | "saving" | "synced" | "offline" | "unavailable";
export type BrainstormResetScope = "all" | "questionnaire";

export function useBrainstormState(userId: string | null, active: boolean) {
  const [state, setState] = useState<BrainstormPersistedState>(() => createEmptyBrainstormState());
  const [syncState, setSyncState] = useState<BrainstormSyncState>(userId ? "loading" : "offline");
  const [error, setError] = useState<string | null>(null);
  const [remoteUpdateNotice, setRemoteUpdateNotice] = useState(false);
  const stateRef = useRef(state);
  const dirtyRef = useRef(false);
  const dirtyFieldsRef = useRef<Set<BrainstormStateField>>(new Set());
  const supportedRef = useRef(true);
  const hydratedUserRef = useRef<string | null>(null);
  const writeTimerRef = useRef<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  useEffect(() => { stateRef.current = state; }, [state]);

  const persistCache = useCallback((next: BrainstormPersistedState, currentUserId: string) => {
    try { window.localStorage.setItem(cacheKey(currentUserId), JSON.stringify(next)); } catch { /* cache is best effort */ }
  }, []);

  const flush = useCallback(async () => {
    if (!userId || !dirtyRef.current) return;
    const client = createBrowserSupabaseClient();
    if (!client || !supportedRef.current) {
      setSyncState(supportedRef.current ? "offline" : "unavailable");
      return;
    }
    const outgoing = stateRef.current;
    const fields = [...dirtyFieldsRef.current];
    if (fields.length === 0) return;
    const outgoingSignature = brainstormStateSignature(outgoing, fields);
    setSyncState("saving");
    const { error: writeError } = await client.from("adhdice_brainstorm_state").upsert({
      user_id: userId,
      ...serializeBrainstormStateUpdate(outgoing, fields),
    });
    if (writeError) {
      if (isMissingTableError(writeError)) {
        supportedRef.current = false;
        setSyncState("unavailable");
        setError("Brainstorm cloud sync is unavailable until its SQL migration is applied.");
      } else {
        setSyncState("offline");
        setError(writeError.message);
      }
      return;
    }
    if (brainstormStateSignature(stateRef.current, fields) === outgoingSignature) {
      fields.forEach((field) => dirtyFieldsRef.current.delete(field));
      dirtyRef.current = dirtyFieldsRef.current.size > 0;
    }
    setError(null);
    setSyncState(dirtyRef.current ? "saving" : "synced");
  }, [userId]);

  const scheduleWrite = useCallback(() => {
    if (writeTimerRef.current !== null) window.clearTimeout(writeTimerRef.current);
    writeTimerRef.current = window.setTimeout(() => {
      writeTimerRef.current = null;
      void flush();
    }, WRITE_DELAY_MS);
  }, [flush]);

  const applyRemote = useCallback((value: unknown) => {
    if (!userId) return;
    const remote = normalizeBrainstormState(value);
    const local = stateRef.current;
    if (timestamp(remote.clientUpdatedAt) > timestamp(local.clientUpdatedAt)) {
      const dirtyFields = [...dirtyFieldsRef.current];
      const merged = dirtyFields.length
        ? updateBrainstormState(remote, Object.fromEntries(dirtyFields.map((field) => [field, local[field]])) as BrainstormStateChanges, new Date(Math.max(Date.now(), timestamp(remote.clientUpdatedAt) + 1)).toISOString())
        : remote;
      const changed = brainstormStateSignature(merged) !== brainstormStateSignature(local);
      dirtyRef.current = dirtyFields.length > 0;
      stateRef.current = merged;
      setState(merged);
      persistCache(merged, userId);
      if (dirtyRef.current) scheduleWrite();
      if (changed && hydratedUserRef.current === userId) {
        setRemoteUpdateNotice(true);
        if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = window.setTimeout(() => setRemoteUpdateNotice(false), 3500);
      }
    } else if (timestamp(local.clientUpdatedAt) > timestamp(remote.clientUpdatedAt)) {
      if (dirtyFieldsRef.current.size === 0) dirtyFieldsRef.current = new Set(["answers", "qaState", "sourceMarkdown"]);
      dirtyRef.current = true;
      scheduleWrite();
    }
  }, [persistCache, scheduleWrite, userId]);

  useEffect(() => {
    const client = createBrowserSupabaseClient();
    if (!userId) return;
    supportedRef.current = true;
    dirtyRef.current = false;
    dirtyFieldsRef.current.clear();
    let cached = createEmptyBrainstormState();
    try { cached = normalizeBrainstormState(JSON.parse(window.localStorage.getItem(cacheKey(userId)) ?? "null")); } catch { /* normalized empty */ }
    stateRef.current = cached;
    window.queueMicrotask(() => {
      setState(cached);
      setSyncState(client ? "loading" : "offline");
    });
    hydratedUserRef.current = userId;
    if (!client) return;
    let alive = true;
    void client.from("adhdice_brainstorm_state").select("source_markdown,answers,qa_state,client_updated_at").eq("user_id", userId).maybeSingle().then(({ data, error: loadError }) => {
      if (!alive) return;
      if (loadError) {
        if (isMissingTableError(loadError)) {
          supportedRef.current = false;
          setSyncState("unavailable");
          setError("Brainstorm cloud sync is unavailable until its SQL migration is applied.");
        } else {
          setSyncState("offline");
          setError(loadError.message);
        }
        return;
      }
      if (data) applyRemote(data);
      else if (cached.sourceMarkdown || Object.keys(cached.answers).length > 0 || cached.qaState.sessions.length > 0) {
        dirtyRef.current = true;
        dirtyFieldsRef.current = new Set(["answers", "qaState", "sourceMarkdown"]);
        scheduleWrite();
      }
      setSyncState(dirtyRef.current ? "saving" : "synced");
    });
    channelRef.current = client.channel(`adhdice_brainstorm_state:${userId}`).on("postgres_changes", {
      event: "*", schema: "public", table: "adhdice_brainstorm_state", filter: `user_id=eq.${userId}`,
    }, (payload) => {
      if (payload.eventType === "DELETE") applyRemote(createEmptyBrainstormState(new Date().toISOString()));
      else applyRemote(payload.new);
    }).subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setSyncState(supportedRef.current ? "offline" : "unavailable");
    });
    return () => {
      alive = false;
      if (writeTimerRef.current !== null) window.clearTimeout(writeTimerRef.current);
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
      if (dirtyRef.current) void flush();
      if (channelRef.current) void client.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [applyRemote, flush, scheduleWrite, userId]);

  useEffect(() => { if (!active && dirtyRef.current) void flush(); }, [active, flush]);

  const updateState = useCallback((changes: BrainstormStateChanges) => {
    if (!userId) return;
    const next = updateBrainstormState(stateRef.current, changes);
    (Object.keys(changes) as BrainstormStateField[]).forEach((field) => dirtyFieldsRef.current.add(field));
    dirtyRef.current = true;
    stateRef.current = next;
    setState(next);
    persistCache(next, userId);
    scheduleWrite();
  }, [persistCache, scheduleWrite, userId]);

  const resetState = useCallback((scope: BrainstormResetScope = "all") => {
    if (!userId) return;
    const next = scope === "questionnaire"
      ? updateBrainstormState(stateRef.current, { answers: {}, sourceMarkdown: "" }, new Date().toISOString())
      : createEmptyBrainstormState(new Date().toISOString());
    dirtyRef.current = true;
    dirtyFieldsRef.current = new Set(scope === "questionnaire" ? ["answers", "sourceMarkdown"] : ["answers", "qaState", "sourceMarkdown"]);
    stateRef.current = next;
    setState(next);
    persistCache(next, userId);
    scheduleWrite();
  }, [persistCache, scheduleWrite, userId]);

  return { error, flush, remoteUpdateNotice, resetState, state, syncState, updateState };
}
