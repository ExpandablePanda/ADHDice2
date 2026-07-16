"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  createEmptyOnTimePlan,
  compareOnTimePlanPriority,
  getOnTimePlanSchemaVersion,
  isMeaningfulOnTimePlan,
  normalizeOnTimePlan,
  onTimePlanSignature,
  updateOnTimePlan,
  type OnTimePlanSchemaVersion,
  type OnTimePlanV3,
  type OnTimePlanUpdate,
} from "@/lib/on-time-plan-state";

const CACHE_PREFIX = "adhdice-on-time-plan";
const WRITE_DELAY_MS = 650;

function isMissingTableError(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || /adhdice_on_time_plans.*(not found|schema cache|does not exist)/i.test(error?.message ?? "");
}

function cacheKey(userId: string) { return `${CACHE_PREFIX}:${userId}`; }
function timestamp(value: string) { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : 0; }

export type OnTimePlanSyncState = "loading" | "saving" | "synced" | "offline" | "unavailable" | "update_required";

export function useOnTimePlan(userId: string | null, timezone: string, active: boolean) {
  const [plan, setPlan] = useState<OnTimePlanV3>(() => createEmptyOnTimePlan(timezone));
  const [syncState, setSyncState] = useState<OnTimePlanSyncState>(userId ? "loading" : "offline");
  const [error, setError] = useState<string | null>(null);
  const [remoteUpdateNotice, setRemoteUpdateNotice] = useState(false);
  const planRef = useRef(plan);
  const sourceSchemaVersionRef = useRef<OnTimePlanSchemaVersion>(0);
  const migratingLegacyRef = useRef(false);
  const dirtyRef = useRef(false);
  const supportedRef = useRef(true);
  const hydratedUserRef = useRef<string | null>(null);
  const writeTimerRef = useRef<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const applyRemoteRef = useRef<(value: unknown, remoteClientUpdatedAt?: string | null) => void>(() => undefined);

  useEffect(() => { planRef.current = plan; }, [plan]);

  const persistCache = useCallback((next: OnTimePlanV3, currentUserId: string) => {
    try { window.localStorage.setItem(cacheKey(currentUserId), JSON.stringify(next)); } catch { /* cache is best effort */ }
  }, []);

  const flush = useCallback(async () => {
    if (!userId || !dirtyRef.current || !isMeaningfulOnTimePlan(planRef.current) && timestamp(planRef.current.clientUpdatedAt) === 0) return;
    const client = createBrowserSupabaseClient();
    if (!client || !supportedRef.current) { setSyncState(supportedRef.current ? "offline" : "unavailable"); return; }
    const outgoing = planRef.current;
    let staleClientDetected = false;
    setSyncState("saving");
    const { data: currentRow, error: readError } = await client.from("adhdice_on_time_plans")
      .select("plan_state,client_updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (!readError && currentRow?.plan_state) {
      const remoteSourceSchemaVersion = getOnTimePlanSchemaVersion(currentRow.plan_state);
      const remote = normalizeOnTimePlan(currentRow.plan_state, timezone);
      if (currentRow.client_updated_at && timestamp(currentRow.client_updated_at) > timestamp(remote.clientUpdatedAt)) {
        remote.clientUpdatedAt = new Date(currentRow.client_updated_at).toISOString();
      }
      const priority = compareOnTimePlanPriority(
        { plan: remote, sourceSchemaVersion: remoteSourceSchemaVersion },
        { plan: outgoing, sourceSchemaVersion: sourceSchemaVersionRef.current },
      );
      if (priority > 0) {
        applyRemoteRef.current(currentRow.plan_state, currentRow.client_updated_at);
        return;
      }
      if (remoteSourceSchemaVersion > 0 && sourceSchemaVersionRef.current > remoteSourceSchemaVersion && !migratingLegacyRef.current) {
        staleClientDetected = true;
        setSyncState("update_required");
        setError("An older ADHDice client attempted to replace this On-Time plan. Update that client before editing On-Time.");
      }
    }
    const { error: writeError } = await client.from("adhdice_on_time_plans").upsert({
      user_id: userId, plan_state: outgoing, client_updated_at: outgoing.clientUpdatedAt,
    });
    if (writeError) {
      if (isMissingTableError(writeError)) { supportedRef.current = false; setSyncState("unavailable"); setError("On-Time sync unavailable"); }
      else { setSyncState("offline"); setError(writeError.message); }
      return;
    }
    if (onTimePlanSignature(planRef.current) === onTimePlanSignature(outgoing)) dirtyRef.current = false;
    sourceSchemaVersionRef.current = 3;
    migratingLegacyRef.current = false;
    if (!staleClientDetected) setError(null);
    setSyncState(staleClientDetected ? "update_required" : dirtyRef.current ? "saving" : "synced");
  }, [timezone, userId]);

  const scheduleWrite = useCallback(() => {
    if (writeTimerRef.current !== null) window.clearTimeout(writeTimerRef.current);
    writeTimerRef.current = window.setTimeout(() => { writeTimerRef.current = null; void flush(); }, WRITE_DELAY_MS);
  }, [flush]);

  const applyRemote = useCallback((value: unknown, remoteClientUpdatedAt?: string | null) => {
    if (!userId) return;
    const remoteSourceSchemaVersion = getOnTimePlanSchemaVersion(value);
    if (remoteSourceSchemaVersion === 0) return;
    const remote = normalizeOnTimePlan(value, timezone);
    if (remoteClientUpdatedAt && timestamp(remoteClientUpdatedAt) > timestamp(remote.clientUpdatedAt)) remote.clientUpdatedAt = new Date(remoteClientUpdatedAt).toISOString();
    const local = planRef.current;
    const priority = compareOnTimePlanPriority(
      { plan: remote, sourceSchemaVersion: remoteSourceSchemaVersion },
      { plan: local, sourceSchemaVersion: sourceSchemaVersionRef.current },
    );
    if (priority > 0) {
      const changed = onTimePlanSignature(remote) !== onTimePlanSignature(local);
      const requiresMigrationWrite = remoteSourceSchemaVersion < 3;
      dirtyRef.current = requiresMigrationWrite;
      migratingLegacyRef.current = requiresMigrationWrite;
      sourceSchemaVersionRef.current = requiresMigrationWrite ? 3 : remoteSourceSchemaVersion;
      planRef.current = remote;
      setPlan(remote);
      persistCache(remote, userId);
      if (changed && hydratedUserRef.current === userId) {
        setRemoteUpdateNotice(true);
        if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = window.setTimeout(() => setRemoteUpdateNotice(false), 3500);
      }
      if (requiresMigrationWrite) scheduleWrite();
    } else if (priority < 0) {
      dirtyRef.current = true;
      if (sourceSchemaVersionRef.current > remoteSourceSchemaVersion) {
        setSyncState("update_required");
        setError("An older ADHDice client attempted to replace this On-Time plan. Update that client before editing On-Time.");
      }
      scheduleWrite();
    } else {
      dirtyRef.current = false;
    }
  }, [persistCache, scheduleWrite, timezone, userId]);
  useEffect(() => { applyRemoteRef.current = applyRemote; }, [applyRemote]);

  useEffect(() => {
    const client = createBrowserSupabaseClient();
    if (!userId) return;
    supportedRef.current = true;
    dirtyRef.current = false;
    migratingLegacyRef.current = false;
    let cached = createEmptyOnTimePlan(timezone);
    let cachedSourceSchemaVersion: OnTimePlanSchemaVersion = 0;
    try {
      const cachedValue: unknown = JSON.parse(window.localStorage.getItem(cacheKey(userId)) ?? "null");
      cachedSourceSchemaVersion = getOnTimePlanSchemaVersion(cachedValue);
      cached = normalizeOnTimePlan(cachedValue, timezone);
    } catch { /* normalized empty */ }
    sourceSchemaVersionRef.current = cachedSourceSchemaVersion;
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
      else if (isMeaningfulOnTimePlan(cached)) {
        dirtyRef.current = true;
        sourceSchemaVersionRef.current = 3;
        migratingLegacyRef.current = cachedSourceSchemaVersion < 3;
        persistCache(cached, userId);
        scheduleWrite();
      }
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
  }, [applyRemote, flush, persistCache, scheduleWrite, timezone, userId]);

  useEffect(() => { if (!active && dirtyRef.current) void flush(); }, [active, flush]);

  const updatePlanFromCurrent = useCallback((updater: (currentPlan: OnTimePlanV3) => OnTimePlanV3 | null) => {
    if (!userId) return;
    const current = planRef.current;
    const proposed = updater(current);
    if (!proposed) return;
    const normalized = normalizeOnTimePlan(proposed, current.timezone);
    const comparable = normalizeOnTimePlan({ ...normalized, clientUpdatedAt: current.clientUpdatedAt }, current.timezone);
    if (onTimePlanSignature(comparable) === onTimePlanSignature(current)) return;
    const nextTimestamp = new Date(Math.max(Date.now(), timestamp(current.clientUpdatedAt) + 1));
    const next = normalizeOnTimePlan({ ...normalized, clientUpdatedAt: nextTimestamp.toISOString() }, current.timezone);
    dirtyRef.current = true;
    sourceSchemaVersionRef.current = 3;
    migratingLegacyRef.current = false;
    planRef.current = next;
    setPlan(next);
    persistCache(next, userId);
    scheduleWrite();
  }, [persistCache, scheduleWrite, userId]);

  const updatePlan = useCallback((changes: OnTimePlanUpdate) => {
    updatePlanFromCurrent((current) => updateOnTimePlan(current, changes));
  }, [updatePlanFromCurrent]);

  const resetPlan = useCallback(() => {
    if (!userId) return;
    const next = createEmptyOnTimePlan(timezone, new Date().toISOString());
    dirtyRef.current = true;
    sourceSchemaVersionRef.current = 3;
    migratingLegacyRef.current = false;
    planRef.current = next;
    setPlan(next);
    persistCache(next, userId);
    scheduleWrite();
  }, [persistCache, scheduleWrite, timezone, userId]);

  return { plan, updatePlan, updatePlanFromCurrent, resetPlan, flush, syncState, error, remoteUpdateNotice };
}
