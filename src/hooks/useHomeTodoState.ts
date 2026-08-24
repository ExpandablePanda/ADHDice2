"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import {
  EMPTY_HOME_TODO_STATE,
  normalizeHomeTodoTasksPerDay,
  normalizeHomeTodoState,
  type HomeTodoStateV2,
} from "@/lib/home-todo-state";
import { createBrowserSupabaseClient } from "@/lib/supabase";

const CACHE_PREFIX = "adhdice-home-todo";
const WRITE_DELAY_MS = 650;

export type HomeTodoSyncStatus = "loading" | "saving" | "synced" | "local";

function cacheKey(userId: string) {
  return `${CACHE_PREFIX}:${userId}`;
}

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isMissingTableError(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01"
    || error?.code === "PGRST205"
    || /adhdice_home_todo_state.*(not found|schema cache|does not exist)/i.test(error?.message ?? "");
}

export function useHomeTodoState(userId: string | null) {
  const [state, setState] = useState<HomeTodoStateV2>({ ...EMPTY_HOME_TODO_STATE });
  const [syncStatus, setSyncStatus] = useState<HomeTodoSyncStatus>(userId ? "loading" : "local");
  const stateRef = useRef(state);
  const dirtyRef = useRef(false);
  const remoteSupportedRef = useRef(true);
  const writeTimerRef = useRef<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const persistCache = useCallback((next: HomeTodoStateV2, ownerId: string) => {
    try {
      window.localStorage.setItem(cacheKey(ownerId), JSON.stringify(next));
    } catch {
      // Cache is best effort.
    }
  }, []);

  const flush = useCallback(async () => {
    if (!userId || !dirtyRef.current) return;
    const client = createBrowserSupabaseClient();
    if (!client || !remoteSupportedRef.current) {
      setSyncStatus("local");
      return;
    }
    const outgoing = stateRef.current;
    setSyncStatus("saving");
    const { error } = await client.from("adhdice_home_todo_state").upsert({
      client_updated_at: outgoing.clientUpdatedAt,
      state: outgoing,
      user_id: userId,
    });
    if (error) {
      if (isMissingTableError(error)) remoteSupportedRef.current = false;
      setSyncStatus("local");
      return;
    }
    if (stateRef.current.clientUpdatedAt === outgoing.clientUpdatedAt) {
      dirtyRef.current = false;
      setSyncStatus("synced");
    }
  }, [userId]);

  const scheduleWrite = useCallback(() => {
    if (writeTimerRef.current !== null) window.clearTimeout(writeTimerRef.current);
    writeTimerRef.current = window.setTimeout(() => {
      writeTimerRef.current = null;
      void flush();
    }, WRITE_DELAY_MS);
  }, [flush]);

  const applyRemote = useCallback((value: unknown, remoteClientUpdatedAt?: string | null) => {
    if (!userId) return;
    const remote = normalizeHomeTodoState(value);
    if (remoteClientUpdatedAt && timestamp(remoteClientUpdatedAt) > timestamp(remote.clientUpdatedAt)) {
      remote.clientUpdatedAt = new Date(remoteClientUpdatedAt).toISOString();
    }
    if (timestamp(remote.clientUpdatedAt) <= timestamp(stateRef.current.clientUpdatedAt)) return;
    dirtyRef.current = false;
    stateRef.current = remote;
    setState(remote);
    persistCache(remote, userId);
    setSyncStatus("synced");
  }, [persistCache, userId]);

  useEffect(() => {
    if (!userId) {
      stateRef.current = { ...EMPTY_HOME_TODO_STATE };
      window.queueMicrotask(() => {
        setState({ ...EMPTY_HOME_TODO_STATE });
        setSyncStatus("local");
      });
      return;
    }
    remoteSupportedRef.current = true;
    dirtyRef.current = false;
    let cached = { ...EMPTY_HOME_TODO_STATE };
    try {
      cached = normalizeHomeTodoState(JSON.parse(window.localStorage.getItem(cacheKey(userId)) ?? "null"));
    } catch {
      // Invalid cache normalizes to empty.
    }
    stateRef.current = cached;

    const client = createBrowserSupabaseClient();
    window.queueMicrotask(() => {
      setState(cached);
      setSyncStatus(client ? "loading" : "local");
    });
    if (!client) {
      return;
    }
    let alive = true;
    void client
      .from("adhdice_home_todo_state")
      .select("state,client_updated_at")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          if (isMissingTableError(error)) remoteSupportedRef.current = false;
          setSyncStatus("local");
          return;
        }
        if (data) {
          const remote = normalizeHomeTodoState(data.state);
          const remoteTimestamp = timestamp(data.client_updated_at ?? remote.clientUpdatedAt);
          if (remoteTimestamp > timestamp(cached.clientUpdatedAt)) {
            applyRemote(data.state, data.client_updated_at);
          } else if (timestamp(cached.clientUpdatedAt) > remoteTimestamp) {
            dirtyRef.current = true;
            scheduleWrite();
          } else {
            setSyncStatus("synced");
          }
        } else if (cached.taskIds.length > 0) {
          dirtyRef.current = true;
          scheduleWrite();
        } else {
          setSyncStatus("synced");
        }
      });

    channelRef.current = client
      .channel(`adhdice_home_todo_state:${userId}`)
      .on("postgres_changes", {
        event: "*",
        filter: `user_id=eq.${userId}`,
        schema: "public",
        table: "adhdice_home_todo_state",
      }, (payload) => {
        const row = payload.new as { client_updated_at?: string; state?: unknown };
        if (row.state) applyRemote(row.state, row.client_updated_at);
      })
      .subscribe();

    return () => {
      alive = false;
      if (writeTimerRef.current !== null) window.clearTimeout(writeTimerRef.current);
      if (dirtyRef.current) void flush();
      if (channelRef.current) void client.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [applyRemote, flush, scheduleWrite, userId]);

  const updateTaskIds = useCallback((updater: (taskIds: string[]) => string[]) => {
    if (!userId) return;
    const current = stateRef.current;
    const taskIds = normalizeHomeTodoState({ ...current, taskIds: updater(current.taskIds) }).taskIds;
    if (taskIds.length === current.taskIds.length && taskIds.every((taskId, index) => taskId === current.taskIds[index])) {
      return;
    }
    const nextTimestamp = new Date(Math.max(Date.now(), timestamp(current.clientUpdatedAt) + 1)).toISOString();
    const next = normalizeHomeTodoState({ ...current, clientUpdatedAt: nextTimestamp, schemaVersion: 2, taskIds });
    dirtyRef.current = true;
    stateRef.current = next;
    setState(next);
    persistCache(next, userId);
    setSyncStatus(remoteSupportedRef.current ? "saving" : "local");
    scheduleWrite();
  }, [persistCache, scheduleWrite, userId]);

  const updateTasksPerDay = useCallback((tasksPerDay: unknown) => {
    if (!userId) return;
    const current = stateRef.current;
    const nextTasksPerDay = normalizeHomeTodoTasksPerDay(tasksPerDay);
    if (nextTasksPerDay === current.tasksPerDay) return;
    const nextTimestamp = new Date(Math.max(Date.now(), timestamp(current.clientUpdatedAt) + 1)).toISOString();
    const next = normalizeHomeTodoState({
      ...current,
      clientUpdatedAt: nextTimestamp,
      schemaVersion: 2,
      tasksPerDay: nextTasksPerDay,
    });
    dirtyRef.current = true;
    stateRef.current = next;
    setState(next);
    persistCache(next, userId);
    setSyncStatus(remoteSupportedRef.current ? "saving" : "local");
    scheduleWrite();
  }, [persistCache, scheduleWrite, userId]);

  return { state, syncStatus, updateTaskIds, updateTasksPerDay };
}
