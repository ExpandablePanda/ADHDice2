"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  createEmptyOnTimePlan,
  isMeaningfulOnTimePlan,
  normalizeOnTimePlan,
  onTimePlanSignature,
  updateOnTimePlan,
  type OnTimePlanV1,
} from "@/lib/on-time-plan-state";

const CACHE_PREFIX = "adhdice-on-time-plan";
const WRITE_DELAY_MS = 650;

function isMissingTableError(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || /adhdice_on_time_plans.*(not found|schema cache|does not exist)/i.test(error?.message ?? "");
}

function cacheKey(userId: string) { return `${CACHE_PREFIX}:${userId}`; }
function timestamp(value: string) { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : 0; }

export type OnTimePlanSyncState = "loading" | "saving" | "synced" | "offline" | "unavailable";

export function useOnTimePlan(userId: string | null, timezone: string, active: boolean) {
  const [plan, setPlan] = useState<OnTimePlanV1>(() => createEmptyOnTimePlan(timezone));
  const [syncState, setSyncState] = useState<OnTimePlanSyncState>(userId ? "loading" : "offline");
  const [error, setError] = useState<string | null>(null);
  const [remoteUpdateNotice, setRemoteUpdateNotice] = useState(false);
  const planRef = useRef(plan);
  const dirtyRef = useRef(false);
  const supportedRef = useRef(true);
  const hydratedUserRef = useRef<string | null>(null);
  const writeTimerRef = useRef<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  useEffect(() => { planRef.current = plan; }, [plan]);

  const persistCache = useCallback((next: OnTimePlanV1, currentUserId: string) => {
    try { window.localStorage.setItem(cacheKey(currentUserId), JSON.stringify(next)); } catch { /* cache is best effort */ }
  }, []);

  const flush = useCallback(async () => {
    if (!userId || !dirtyRef.current || !isMeaningfulOnTimePlan(planRef.current) && timestamp(planRef.current.clientUpdatedAt) === 0) return;
    const client = createBrowserSupabaseClient();
    if (!client || !supportedRef.current) { setSyncState(supportedRef.current ? "offline" : "unavailable"); return; }
    const outgoing = planRef.current;
    setSyncState("saving");
    const { error: writeError } = await client.from("adhdice_on_time_plans").upsert({
      user_id: userId, plan_state: outgoing, client_updated_at: outgoing.clientUpdatedAt,
    });
    if (writeError) {
      if (isMissingTableError(writeError)) { supportedRef.current = false; setSyncState("unavailable"); setError("On-Time sync unavailable"); }
      else { setSyncState("offline"); setError(writeError.message); }
      return;
    }
    if (onTimePlanSignature(planRef.current) === onTimePlanSignature(outgoing)) dirtyRef.current = false;
    setError(null);
    setSyncState(dirtyRef.current ? "saving" : "synced");
  }, [userId]);

  const scheduleWrite = useCallback(() => {
    if (writeTimerRef.current !== null) window.clearTimeout(writeTimerRef.current);
    writeTimerRef.current = window.setTimeout(() => { writeTimerRef.current = null; void flush(); }, WRITE_DELAY_MS);
  }, [flush]);

  const applyRemote = useCallback((value: unknown, remoteClientUpdatedAt?: string | null) => {
    if (!userId) return;
    const remote = normalizeOnTimePlan(value, timezone);
    if (remoteClientUpdatedAt && timestamp(remoteClientUpdatedAt) > timestamp(remote.clientUpdatedAt)) remote.clientUpdatedAt = new Date(remoteClientUpdatedAt).toISOString();
    const local = planRef.current;
    if (timestamp(remote.clientUpdatedAt) > timestamp(local.clientUpdatedAt)) {
      const changed = onTimePlanSignature(remote) !== onTimePlanSignature(local);
      dirtyRef.current = false;
      planRef.current = remote;
      setPlan(remote);
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
  }, [persistCache, scheduleWrite, timezone, userId]);

  useEffect(() => {
    const client = createBrowserSupabaseClient();
    if (!userId) return;
    supportedRef.current = true;
    dirtyRef.current = false;
    let cached = createEmptyOnTimePlan(timezone);
    try { cached = normalizeOnTimePlan(JSON.parse(window.localStorage.getItem(cacheKey(userId)) ?? "null"), timezone); } catch { /* normalized empty */ }
    planRef.current = cached;
    window.queueMicrotask(() => {
      setPlan(cached);
      setSyncState(client ? "loading" : "offline");
    });
    hydratedUserRef.current = userId;
    if (!client) return;
    let alive = true;
    void client.from("adhdice_on_time_plans").select("plan_state,client_updated_at").eq("user_id", userId).maybeSingle().then(({ data, error: loadError }) => {
      if (!alive) return;
      if (loadError) {
        if (isMissingTableError(loadError)) { supportedRef.current = false; setSyncState("unavailable"); setError("On-Time sync unavailable"); }
        else { setSyncState("offline"); setError(loadError.message); }
        return;
      }
      if (data) applyRemote(data.plan_state, data.client_updated_at);
      else if (isMeaningfulOnTimePlan(cached)) { dirtyRef.current = true; scheduleWrite(); }
      setSyncState(dirtyRef.current ? "saving" : "synced");
    });
    channelRef.current = client.channel(`adhdice_on_time_plans:${userId}`).on("postgres_changes", {
      event: "*", schema: "public", table: "adhdice_on_time_plans", filter: `user_id=eq.${userId}`,
    }, (payload) => {
      const row = payload.new as { plan_state?: unknown; client_updated_at?: string };
      if (row.plan_state) applyRemote(row.plan_state, row.client_updated_at);
    }).subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setSyncState(supportedRef.current ? "offline" : "unavailable");
    });
    return () => {
      alive = false;
      if (writeTimerRef.current !== null) window.clearTimeout(writeTimerRef.current);
      if (dirtyRef.current) void flush();
      if (channelRef.current) void client.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [applyRemote, flush, scheduleWrite, timezone, userId]);

  useEffect(() => { if (!active && dirtyRef.current) void flush(); }, [active, flush]);

  const updatePlan = useCallback((changes: Partial<Omit<OnTimePlanV1, "schemaVersion" | "clientUpdatedAt">>) => {
    if (!userId) return;
    const next = updateOnTimePlan(planRef.current, changes);
    dirtyRef.current = true;
    planRef.current = next;
    setPlan(next);
    persistCache(next, userId);
    scheduleWrite();
  }, [persistCache, scheduleWrite, userId]);

  const resetPlan = useCallback(() => {
    if (!userId) return;
    const next = createEmptyOnTimePlan(timezone, new Date().toISOString());
    dirtyRef.current = true;
    planRef.current = next;
    setPlan(next);
    persistCache(next, userId);
    scheduleWrite();
  }, [persistCache, scheduleWrite, timezone, userId]);

  return { plan, updatePlan, resetPlan, flush, syncState, error, remoteUpdateNotice };
}
