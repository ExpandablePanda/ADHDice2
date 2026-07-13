"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  brainstormStateSignature,
  createEmptyBrainstormState,
  normalizeBrainstormState,
  serializeBrainstormState,
  updateBrainstormState,
  type BrainstormPersistedState,
} from "@/lib/brainstorm-state";

const CACHE_PREFIX = "adhdice-brainstorm-state";
const WRITE_DELAY_MS = 650;

function isMissingTableError(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || /adhdice_brainstorm_state.*(not found|schema cache|does not exist)/i.test(error?.message ?? "");
}

function cacheKey(userId: string) { return `${CACHE_PREFIX}:${userId}`; }
function timestamp(value: string) { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : 0; }

export type BrainstormSyncState = "loading" | "saving" | "synced" | "offline" | "unavailable";

export function useBrainstormState(userId: string | null, active: boolean) {
  const [state, setState] = useState<BrainstormPersistedState>(() => createEmptyBrainstormState());
  const [syncState, setSyncState] = useState<BrainstormSyncState>(userId ? "loading" : "offline");
  const [error, setError] = useState<string | null>(null);
  const [remoteUpdateNotice, setRemoteUpdateNotice] = useState(false);
  const stateRef = useRef(state);
  const dirtyRef = useRef(false);
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
    setSyncState("saving");
    const { error: writeError } = await client.from("adhdice_brainstorm_state").upsert({
      user_id: userId,
      ...serializeBrainstormState(outgoing),
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
    if (brainstormStateSignature(stateRef.current) === brainstormStateSignature(outgoing)) dirtyRef.current = false;
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
      const changed = brainstormStateSignature(remote) !== brainstormStateSignature(local);
      dirtyRef.current = false;
      stateRef.current = remote;
      setState(remote);
      persistCache(remote, userId);
      if (changed && hydratedUserRef.current === userId) {
        setRemoteUpdateNotice(true);
        if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = window.setTimeout(() => setRemoteUpdateNotice(false), 3500);
      }
    } else if (timestamp(local.clientUpdatedAt) > timestamp(remote.clientUpdatedAt)) {
      dirtyRef.current = true;
      scheduleWrite();
    }
  }, [persistCache, scheduleWrite, userId]);

  useEffect(() => {
    const client = createBrowserSupabaseClient();
    if (!userId) return;
    supportedRef.current = true;
    dirtyRef.current = false;
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
    void client.from("adhdice_brainstorm_state").select("source_markdown,answers,client_updated_at").eq("user_id", userId).maybeSingle().then(({ data, error: loadError }) => {
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
      else if (cached.sourceMarkdown || Object.keys(cached.answers).length > 0) {
        dirtyRef.current = true;
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

  const updateState = useCallback((changes: Partial<Pick<BrainstormPersistedState, "answers" | "sourceMarkdown">>) => {
    if (!userId) return;
    const next = updateBrainstormState(stateRef.current, changes);
    dirtyRef.current = true;
    stateRef.current = next;
    setState(next);
    persistCache(next, userId);
    scheduleWrite();
  }, [persistCache, scheduleWrite, userId]);

  const resetState = useCallback(() => {
    if (!userId) return;
    const next = createEmptyBrainstormState(new Date().toISOString());
    dirtyRef.current = true;
    stateRef.current = next;
    setState(next);
    persistCache(next, userId);
    scheduleWrite();
  }, [persistCache, scheduleWrite, userId]);

  return { error, flush, remoteUpdateNotice, resetState, state, syncState, updateState };
}
