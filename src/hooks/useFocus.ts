import { useCallback, useEffect, useRef, useState } from "react";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import type { FocusCategory, ActiveFocusSession, HistoricalFocusSession, FocusCounter, FocusCounterHistoryEntry, FocusType, FocusSubtype, FocusDailyGoalAdjustment, PendingFocusDailySurplus } from "@/lib/types";
import type { FocusCategory as DbFocusCategory, FocusDailyGoalAdjustment as DbFocusDailyGoalAdjustment, FocusSession as DbFocusSession } from "@/lib/database.types";
import { buildFocusGoalPlan, getMondayWeekRange, getPromptedDailySurplusSeconds, normalizeCarryoverMode, normalizeDistributionMode, normalizePriorityLevel } from "@/lib/focus-goals";
import {
  dedupeCategoriesByName,
  isSystemCountdownCategoryId,
  resolveFocusCategory,
  isUuid,
  normalizeCategoryTitle,
  preferStoredOptionalValue,
  preferStoredValue,
  sanitizeFocusLabel,
  sanitizeOptionalFocusLabel,
} from "@/lib/focus-utils";
import { getLogicalDayKey } from "@/lib/logical-day";
import { todayISO } from "@/lib/utils";
import { createBrowserUuidV4 } from "@/lib/browser-uuid";
import {
  isNewerFocusRuntimeSnapshot,
  isCurrentFocusRuntimeSnapshotRequest,
  mapFocusRuntimeRow,
  reconcileFocusRuntimeSnapshot,
  removeFocusRuntimeFromSessions,
  type FocusRuntimeRow,
} from "@/lib/focus-runtime";
import {
  FOCUS_COUNTER_DEVICE_ID_STORAGE_KEY,
  applyAuthoritativeFocusCounterEvent,
  applyAuthoritativeFocusCounterRow,
  buildLegacyFocusCounterSnapshot,
  getFocusCounterBackupStorageKey,
  getFocusCounterMigrationBatchStorageKey,
  isCurrentFocusCounterSnapshotRequest,
  reconcileFocusCounterHistorySnapshot,
  reconcileFocusCounterSnapshot,
  type FocusCounterEventRow,
  type FocusCounterMigrationResult,
  type FocusCounterMutationResult,
  type FocusCounterRow,
} from "@/lib/focus-counter-sync";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
type SetMessage = (msg: { tone: "neutral" | "good" | "warn"; text: string } | null) => void;
type FocusRuntimeRpcResult = { runtime?: FocusRuntimeRow | null; deleted_session_id?: string; completed_session?: DbFocusSession; was_replayed?: boolean };

// ─── Storage keys ─────────────────────────────────────────────────────────────

const FOCUS_CATEGORIES_STORAGE_KEY = "adhdice_focus_categories";
const FOCUS_HISTORY_STORAGE_KEY = "adhdice_focus_history";
const FOCUS_COUNTDOWN_META_STORAGE_KEY = "adhdice_focus_countdown_meta";
const FOCUS_LOCAL_ACTIVE_SESSION_STORAGE_KEY = "adhdice_focus_local_active_session";
const FOCUS_COUNTERS_STORAGE_KEY = "adhdice_focus_counters";
const FOCUS_COUNTER_HISTORY_STORAGE_KEY = "adhdice_focus_counter_history";

type CountdownMetadata = Record<string, { mode?: "countdown" | "countup"; targetSeconds?: number | null }>;
type FocusCounterState = {
  counters: FocusCounter[];
  history: FocusCounterHistoryEntry[];
  ownerUserId: string | null;
};

function normalizeWeekdayTargetSeconds(value: unknown) {
  if (!value || typeof value !== "object") return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, number>>((targets, [key, rawValue]) => {
    if (!["mon", "tue", "wed", "thu", "fri", "sat", "sun"].includes(key)) return targets;
    const seconds = typeof rawValue === "number" ? rawValue : Number.parseInt(String(rawValue ?? ""), 10);
    targets[key] = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    return targets;
  }, {});
}

function createClientSideId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function parseStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) return fallback;
  try {
    return JSON.parse(rawValue) as T;
  } catch {
    window.localStorage.removeItem(key);
    return fallback;
  }
}

function readCountdownMetadata(): CountdownMetadata {
  return parseStoredJson<CountdownMetadata>(FOCUS_COUNTDOWN_META_STORAGE_KEY, {});
}

function writeCountdownMetadata(metadata: CountdownMetadata) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FOCUS_COUNTDOWN_META_STORAGE_KEY, JSON.stringify(metadata));
}

function getLocalActiveSessionStorageKey(userId: string) {
  return `${FOCUS_LOCAL_ACTIVE_SESSION_STORAGE_KEY}:${userId}`;
}

function getFocusCountersStorageKey(userId: string) {
  return `${FOCUS_COUNTERS_STORAGE_KEY}:${userId}`;
}

function getFocusCounterHistoryStorageKey(userId: string) {
  return `${FOCUS_COUNTER_HISTORY_STORAGE_KEY}:${userId}`;
}

function readLocalActiveSession(userId: string | null | undefined): ActiveFocusSession | null {
  if (!userId) return null;
  const session = parseStoredJson<ActiveFocusSession | null>(getLocalActiveSessionStorageKey(userId), null);
  if (!session || !isSystemCountdownCategoryId(session.categoryId)) {
    return null;
  }
  return session;
}

function writeLocalActiveSession(userId: string | null | undefined, session: ActiveFocusSession | null) {
  if (typeof window === "undefined" || !userId) return;
  const storageKey = getLocalActiveSessionStorageKey(userId);
  if (!session) {
    window.localStorage.removeItem(storageKey);
    return;
  }
  window.localStorage.setItem(storageKey, JSON.stringify(session));
}

function persistCountdownMetadata(categoryId: string, session: Pick<ActiveFocusSession, "countdownTargetSeconds" | "mode"> | null) {
  const metadata = readCountdownMetadata();
  if (!session || session.mode !== "countdown" || !session.countdownTargetSeconds) {
    delete metadata[categoryId];
  } else {
    metadata[categoryId] = {
      mode: "countdown",
      targetSeconds: session.countdownTargetSeconds,
    };
  }
  writeCountdownMetadata(metadata);
}

export function saveFocusCategories(categories: FocusCategory[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FOCUS_CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
}

export function saveFocusHistory(history: HistoricalFocusSession[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FOCUS_HISTORY_STORAGE_KEY, JSON.stringify(history));
}

function saveFocusCounters(userId: string | null | undefined, counters: FocusCounter[]) {
  if (typeof window === "undefined" || !userId) return;
  window.localStorage.setItem(getFocusCountersStorageKey(userId), JSON.stringify(counters));
}

function saveFocusCounterHistory(userId: string | null | undefined, history: FocusCounterHistoryEntry[]) {
  if (typeof window === "undefined" || !userId) return;
  window.localStorage.setItem(getFocusCounterHistoryStorageKey(userId), JSON.stringify(history));
}

function readFocusCounters(userId: string | null | undefined) {
  if (!userId) {
    return [];
  }
  return parseStoredJson<FocusCounter[]>(getFocusCountersStorageKey(userId), []).map((counter, index) => ({
    ...counter,
    sortOrder: Number.isFinite(counter.sortOrder) ? counter.sortOrder : index,
    revision: Number.isFinite(counter.revision) ? counter.revision : 0,
  }));
}

function readFocusCounterHistory(userId: string | null | undefined) {
  if (!userId) {
    return [];
  }
  return parseStoredJson<FocusCounterHistoryEntry[]>(getFocusCounterHistoryStorageKey(userId), []);
}

export function mapFocusCategoryRow(row: DbFocusCategory): FocusCategory {
  return {
    id: row.id,
    title: row.title,
    focusType: row.focus_type,
    focusSubtype: row.focus_subtype,
    focusSubtype2: row.focus_subtype_2,
    color: row.color,
    icon: row.icon,
    dailyGoalSeconds: row.daily_goal_seconds,
    weeklyGoalSeconds: row.weekly_goal_seconds,
    priorityLevel: normalizePriorityLevel(row.priority_level),
    targetDistributionMode: normalizeDistributionMode(row.target_distribution_mode),
    weekdayTargetSeconds: normalizeWeekdayTargetSeconds(row.weekday_target_seconds),
    countTowardProductiveGoal: row.count_toward_productive_goal,
    allowDailySurplusReduction: row.allow_daily_surplus_reduction,
    weeklySurplusCarryoverMode: normalizeCarryoverMode(row.weekly_surplus_carryover_mode),
  };
}

export function mapFocusDailyGoalAdjustmentRow(row: DbFocusDailyGoalAdjustment): FocusDailyGoalAdjustment {
  return {
    id: row.id,
    userId: row.user_id,
    adjustmentDate: row.adjustment_date,
    sourceCategoryId: row.source_category_id,
    targetCategoryId: row.target_category_id,
    sourceSessionId: row.source_session_id,
    reductionSeconds: row.reduction_seconds,
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapActiveSessions(
  rows: FocusRuntimeRow[],
  _userId?: string | null,
): Record<string, ActiveFocusSession> {
  return reconcileFocusRuntimeSnapshot(rows);
}

export function mapFocusSessionRow(row: DbFocusSession): HistoricalFocusSession {
  return {
    id: row.id,
    categoryId: row.category_id,
    title: row.title_snapshot,
    date: row.session_date,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    focusType: row.focus_type_snapshot as FocusType,
    focusSubtype: row.focus_subtype_snapshot ? row.focus_subtype_snapshot as FocusSubtype : undefined,
    focusSubtype2: row.focus_subtype_2_snapshot ? row.focus_subtype_2_snapshot as FocusSubtype : undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

function completionIsoFromDateTime(date: string, time?: string | null) {
  const safeTime = time?.trim() || "12:00";
  const parsed = new Date(`${date}T${safeTime}:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

export function mergeStoredFocusHistory(history: HistoricalFocusSession[]): HistoricalFocusSession[] {
  const storedHistory = parseStoredJson<HistoricalFocusSession[]>(FOCUS_HISTORY_STORAGE_KEY, []);
  if (storedHistory.length === 0) return history;

  const storedById = new Map(storedHistory.map((entry) => [entry.id, entry]));

  return history.map((entry) => {
    const storedEntry = storedById.get(entry.id);
    if (!storedEntry) return entry;
    return {
      ...entry,
      title: preferStoredValue(storedEntry.title, entry.title),
      focusType: preferStoredValue(storedEntry.focusType, entry.focusType),
      focusSubtype: preferStoredOptionalValue(storedEntry.focusSubtype, entry.focusSubtype) ?? undefined,
      focusSubtype2: preferStoredOptionalValue(storedEntry.focusSubtype2, entry.focusSubtype2) ?? undefined,
    };
  });
}

export function mergeStoredFocusCategories(categories: FocusCategory[]): FocusCategory[] {
  const storedCategories = parseStoredJson<FocusCategory[]>(FOCUS_CATEGORIES_STORAGE_KEY, []);
  if (storedCategories.length === 0) return categories;

  const storedById = new Map(storedCategories.map((c) => [c.id, c]));
  const storedByTitle = new Map(storedCategories.map((c) => [normalizeCategoryTitle(c.title), c]));

  return categories.map((category) => {
    const stored = storedById.get(category.id) ?? storedByTitle.get(normalizeCategoryTitle(category.title));
    if (!stored) return category;
    return {
      ...category,
      title: preferStoredValue(stored.title, category.title),
      focusType: preferStoredValue(stored.focusType, category.focusType),
      focusSubtype: preferStoredOptionalValue(stored.focusSubtype, category.focusSubtype),
      focusSubtype2: preferStoredOptionalValue(stored.focusSubtype2, category.focusSubtype2),
      priorityLevel: stored.priorityLevel ?? category.priorityLevel,
      targetDistributionMode: stored.targetDistributionMode ?? category.targetDistributionMode,
      weekdayTargetSeconds: stored.weekdayTargetSeconds ?? category.weekdayTargetSeconds,
      countTowardProductiveGoal: stored.countTowardProductiveGoal ?? category.countTowardProductiveGoal,
      allowDailySurplusReduction: stored.allowDailySurplusReduction ?? category.allowDailySurplusReduction,
      weeklySurplusCarryoverMode: stored.weeklySurplusCarryoverMode ?? category.weeklySurplusCarryoverMode,
    };
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFocus(
  client: SupabaseClient,
  userId: string | null,
  setMessage: SetMessage,
) {
  const [focusCategories, setFocusCategories] = useState<FocusCategory[]>([]);
  const [activeSessions, setActiveSessions] = useState<Record<string, ActiveFocusSession>>({});
  const [focusHistory, setFocusHistory] = useState<HistoricalFocusSession[]>([]);
  const [focusDailyGoalAdjustments, setFocusDailyGoalAdjustments] = useState<FocusDailyGoalAdjustment[]>([]);
  const [pendingDailyGoalSurplus, setPendingDailyGoalSurplus] = useState<PendingFocusDailySurplus | null>(null);
  const [focusCounterState, setFocusCounterState] = useState<FocusCounterState>({ counters: [], history: [], ownerUserId: null });
  const suppressCategoryReload = useRef(false);
  const activeSessionsRef = useRef(activeSessions);
  const runtimeRequestGenerationRef = useRef(0);
  const counterRequestGenerationRef = useRef(0);
  const focusCounterStateRef = useRef(focusCounterState);
  const runtimeOperationIdsRef = useRef(new Map<string, string>());
  const runtimeCreateSessionIdsRef = useRef(new Map<string, string>());
  const completingRuntimeIdsRef = useRef(new Set<string>());
  const migratedRuntimeUserRef = useRef<string | null>(null);
  const focusCounters = focusCounterState.ownerUserId === userId ? focusCounterState.counters : [];
  const focusCounterHistory = focusCounterState.ownerUserId === userId ? focusCounterState.history : [];

  useEffect(() => {
    activeSessionsRef.current = activeSessions;
  }, [activeSessions]);

  useEffect(() => {
    focusCounterStateRef.current = focusCounterState;
  }, [focusCounterState]);

  useEffect(() => {
    counterRequestGenerationRef.current += 1;
    const nextState = { counters: [], history: [], ownerUserId: userId };
    focusCounterStateRef.current = nextState;
  }, [userId]);

  useEffect(() => {
    if (!client || !userId) {
      const timeoutId = window.setTimeout(() => {
        setFocusDailyGoalAdjustments([]);
        setPendingDailyGoalSurplus(null);
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }

    const todayRange = getMondayWeekRange(todayISO());
    client
      .from("adhdice_focus_daily_goal_adjustments")
      .select("*")
      .eq("user_id", userId)
      .gte("adjustment_date", todayRange.startDate)
      .lte("adjustment_date", todayRange.endDate)
      .order("adjustment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          if (!/does not exist|schema cache/i.test(error.message)) {
            setMessage({ tone: "warn", text: error.message });
          }
          return;
        }
        setFocusDailyGoalAdjustments((data ?? []).map(mapFocusDailyGoalAdjustmentRow));
      });
  }, [client, setMessage, userId]);

  const applyRuntimeRow = useCallback((row: FocusRuntimeRow) => {
    const session = mapFocusRuntimeRow(row);
    if (!session) return;
    runtimeRequestGenerationRef.current += 1;
    setActiveSessions((current) => {
      if (!isNewerFocusRuntimeSnapshot(session, current[session.categoryId])) return current;
      const next = { ...current, [session.categoryId]: session };
      activeSessionsRef.current = next;
      return next;
    });
  }, []);

  const hydrateFocusRuntimes = useCallback(async () => {
    if (!client || !userId) return;
    const generation = ++runtimeRequestGenerationRef.current;
    const { data, error } = await client
      .from("adhdice_focus_active_sessions")
      .select("session_id,user_id,runtime_kind,category_id,mode,mode_authoritative,countdown_target_seconds,state,current_run_started_at,accumulated_seconds,revision,created_at,updated_at")
      .eq("user_id", userId);
    if (error) {
      if (!/does not exist|schema cache/i.test(error.message)) setMessage({ tone: "warn", text: `Focus timer sync failed: ${error.message}` });
      return;
    }
    if (!isCurrentFocusRuntimeSnapshotRequest(generation, runtimeRequestGenerationRef.current)) return;
    const rows = (data ?? []) as Array<FocusRuntimeRow & { mode_authoritative?: boolean }>;
    setActiveSessions(() => {
      const next = reconcileFocusRuntimeSnapshot(rows);
      activeSessionsRef.current = next;
      return next;
    });

    if (migratedRuntimeUserRef.current === userId) return;
    migratedRuntimeUserRef.current = userId;
    const legacyMetadata = readCountdownMetadata();
    const legacyStandalone = readLocalActiveSession(userId);
    const migrationKeyPrefix = `adhdice_focus_runtime_migration_op:${userId}:`;
    const getMigrationOperationId = (slot: string) => {
      const key = `${migrationKeyPrefix}${slot}`;
      const stored = window.localStorage.getItem(key);
      if (stored) return stored;
      const operationId = createBrowserUuidV4();
      window.localStorage.setItem(key, operationId);
      return operationId;
    };

    for (const row of rows) {
      if (row.runtime_kind !== "category" || !row.category_id) continue;
      const metadata = legacyMetadata[row.category_id];
      if (metadata?.mode !== "countdown" || !metadata.targetSeconds) continue;
      if (row.mode_authoritative) {
        delete legacyMetadata[row.category_id];
        writeCountdownMetadata(legacyMetadata);
        continue;
      }
      const { data: migrated, error: migrationError } = await client.rpc("adhdice_migrate_focus_runtime", {
        p_operation_id: getMigrationOperationId(row.category_id),
        p_runtime_kind: "category",
        p_category_id: row.category_id,
        p_session_id: row.session_id,
        p_expected_revision: row.revision,
        p_mode: "countdown",
        p_countdown_target_seconds: metadata.targetSeconds,
      });
      if (!migrationError && migrated) {
        const result = migrated as FocusRuntimeRpcResult;
        if (result.runtime) applyRuntimeRow(result.runtime);
        delete legacyMetadata[row.category_id];
        writeCountdownMetadata(legacyMetadata);
        window.localStorage.removeItem(`${migrationKeyPrefix}${row.category_id}`);
      }
    }

    if (legacyStandalone) {
      const { data: migrated, error: migrationError } = await client.rpc("adhdice_migrate_focus_runtime", {
        p_operation_id: getMigrationOperationId("standalone"),
        p_runtime_kind: "standalone_countdown",
        p_session_id: legacyStandalone.sessionId && isUuid(legacyStandalone.sessionId) ? legacyStandalone.sessionId : createBrowserUuidV4(),
        p_mode: "countdown",
        p_countdown_target_seconds: legacyStandalone.countdownTargetSeconds ?? 60,
        p_legacy_started_at: legacyStandalone.startTime ? new Date(legacyStandalone.startTime).toISOString() : null,
        p_legacy_accumulated_seconds: legacyStandalone.accumulatedSeconds,
        p_legacy_is_running: legacyStandalone.isRunning,
      });
      if (!migrationError && migrated) {
        const result = migrated as FocusRuntimeRpcResult;
        if (result.runtime) applyRuntimeRow(result.runtime);
        writeLocalActiveSession(userId, null);
        delete legacyMetadata[legacyStandalone.categoryId];
        writeCountdownMetadata(legacyMetadata);
        window.localStorage.removeItem(`${migrationKeyPrefix}standalone`);
      }
    }
  }, [applyRuntimeRow, client, setMessage, userId]);

  useEffect(() => {
    if (!client || !userId) {
      migratedRuntimeUserRef.current = null;
      return;
    }
    void hydrateFocusRuntimes();
    const channel = client
      .channel(`focus-runtime:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "adhdice_focus_active_sessions", filter: `user_id=eq.${userId}` }, (payload) => {
        if (payload.eventType === "DELETE") {
          const deleted = payload.old as Partial<FocusRuntimeRow>;
          runtimeRequestGenerationRef.current += 1;
          setActiveSessions((current) => {
            const next = removeFocusRuntimeFromSessions(current, deleted);
            activeSessionsRef.current = next;
            return next;
          });
          return;
        }
        if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
          applyRuntimeRow(payload.new as FocusRuntimeRow);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "adhdice_focus_sessions", filter: `user_id=eq.${userId}` }, (payload) => {
        const entry = mapFocusSessionRow(payload.new as DbFocusSession);
        setFocusHistory((current) => {
          const next = [entry, ...current.filter((candidate) => candidate.id !== entry.id)];
          saveFocusHistory(next);
          return next;
        });
      })
      .subscribe((status) => {
        if (["SUBSCRIBED", "TIMED_OUT", "CLOSED", "CHANNEL_ERROR"].includes(status)) void hydrateFocusRuntimes();
      });
    const refetchWhenVisible = () => { if (document.visibilityState === "visible") void hydrateFocusRuntimes(); };
    const refetch = () => { void hydrateFocusRuntimes(); };
    document.addEventListener("visibilitychange", refetchWhenVisible);
    window.addEventListener("pageshow", refetch);
    window.addEventListener("online", refetch);
    const broadcast = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("adhdice_focus_sync") : null;
    if (broadcast) broadcast.onmessage = refetch;
    return () => {
      document.removeEventListener("visibilitychange", refetchWhenVisible);
      window.removeEventListener("pageshow", refetch);
      window.removeEventListener("online", refetch);
      broadcast?.close();
      void client.removeChannel(channel);
    };
  }, [applyRuntimeRow, client, hydrateFocusRuntimes, userId]);

  const replaceFocusCounterState = useCallback((ownerUserId: string, counters: FocusCounter[], history: FocusCounterHistoryEntry[]) => {
    const nextState = { counters, history, ownerUserId };
    focusCounterStateRef.current = nextState;
    saveFocusCounters(ownerUserId, counters);
    saveFocusCounterHistory(ownerUserId, history);
    setFocusCounterState(nextState);
  }, []);

  const hydrateFocusCounters = useCallback(async () => {
    if (!client || !userId) return;
    const generation = ++counterRequestGenerationRef.current;
    const [counterResponse, eventResponse] = await Promise.all([
      client
        .from("adhdice_focus_counters")
        .select("*")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true }),
      client
        .from("adhdice_focus_counter_events")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);
    const error = counterResponse.error ?? eventResponse.error;
    if (error) {
      if (!/does not exist|schema cache/i.test(error.message)) {
        setMessage({ tone: "warn", text: `Focus counter sync failed: ${error.message}` });
      }
      return;
    }
    if (!isCurrentFocusCounterSnapshotRequest(generation, counterRequestGenerationRef.current)) return;
    replaceFocusCounterState(
      userId,
      reconcileFocusCounterSnapshot((counterResponse.data ?? []) as FocusCounterRow[]),
      reconcileFocusCounterHistorySnapshot((eventResponse.data ?? []) as FocusCounterEventRow[]),
    );
  }, [client, replaceFocusCounterState, setMessage, userId]);

  const applyFocusCounterMutationResult = useCallback((result: FocusCounterMutationResult) => {
    if (!userId) return;
    if (focusCounterStateRef.current.ownerUserId !== userId) return;
    counterRequestGenerationRef.current += 1;
    setFocusCounterState((current) => {
      if (current.ownerUserId !== userId) return current;
      const counters = result.counter ? applyAuthoritativeFocusCounterRow(current.counters, result.counter) : current.counters;
      const history = result.event ? applyAuthoritativeFocusCounterEvent(current.history, result.event) : current.history;
      const next = { counters, history, ownerUserId: userId };
      focusCounterStateRef.current = next;
      saveFocusCounters(userId, counters);
      saveFocusCounterHistory(userId, history);
      return next;
    });
  }, [userId]);

  useEffect(() => {
    if (!client || !userId) return;
    let cancelled = false;
    const legacyCounters = readFocusCounters(userId);
    const legacyHistory = readFocusCounterHistory(userId);

    const migrateThenHydrate = async () => {
      let deviceId = window.localStorage.getItem(FOCUS_COUNTER_DEVICE_ID_STORAGE_KEY);
      if (!deviceId) {
        deviceId = createBrowserUuidV4();
        window.localStorage.setItem(FOCUS_COUNTER_DEVICE_ID_STORAGE_KEY, deviceId);
      }
      const batchKey = getFocusCounterMigrationBatchStorageKey(userId, deviceId);
      let migrationBatchId = window.localStorage.getItem(batchKey);
      if (!migrationBatchId) {
        migrationBatchId = createBrowserUuidV4();
        window.localStorage.setItem(batchKey, migrationBatchId);
      }
      const submittedSnapshot = buildLegacyFocusCounterSnapshot(legacyCounters, legacyHistory);
      const { data, error } = await client.rpc("adhdice_migrate_focus_counters", {
        p_device_installation_id: deviceId,
        p_migration_batch_id: migrationBatchId,
        p_submitted_snapshot: submittedSnapshot,
      });
      if (cancelled) return;
      if (error) {
        if (!/does not exist|schema cache/i.test(error.message)) {
          setMessage({ tone: "warn", text: `Focus counter migration failed: ${error.message}` });
        }
        return;
      }
      const result = data as FocusCounterMigrationResult;
      if (result.local_differed) {
        window.localStorage.setItem(
          getFocusCounterBackupStorageKey(userId, migrationBatchId),
          JSON.stringify({ backedUpAt: new Date().toISOString(), snapshot: submittedSnapshot }),
        );
        setMessage({ tone: "warn", text: "This device’s local Focus counters differed from the synced counters. A local backup was saved and the server version was adopted." });
      }
      replaceFocusCounterState(
        userId,
        reconcileFocusCounterSnapshot(result.counters ?? []),
        reconcileFocusCounterHistorySnapshot(result.events ?? []),
      );
      await hydrateFocusCounters();
    };
    void migrateThenHydrate();

    const channel = client
      .channel(`focus-counters:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "adhdice_focus_counters", filter: `user_id=eq.${userId}` }, (payload) => {
        if (payload.eventType !== "INSERT" && payload.eventType !== "UPDATE") return;
        if (focusCounterStateRef.current.ownerUserId !== userId) return;
        counterRequestGenerationRef.current += 1;
        const row = payload.new as FocusCounterRow;
        setFocusCounterState((current) => {
          if (current.ownerUserId !== userId) return current;
          const counters = applyAuthoritativeFocusCounterRow(current.counters, row);
          const next = { ...current, counters };
          focusCounterStateRef.current = next;
          saveFocusCounters(userId, counters);
          return next;
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "adhdice_focus_counter_events", filter: `user_id=eq.${userId}` }, (payload) => {
        if (focusCounterStateRef.current.ownerUserId !== userId) return;
        counterRequestGenerationRef.current += 1;
        const row = payload.new as FocusCounterEventRow;
        setFocusCounterState((current) => {
          if (current.ownerUserId !== userId) return current;
          const history = applyAuthoritativeFocusCounterEvent(current.history, row);
          const next = { ...current, history };
          focusCounterStateRef.current = next;
          saveFocusCounterHistory(userId, history);
          return next;
        });
      })
      .subscribe((status) => {
        if (["SUBSCRIBED", "TIMED_OUT", "CLOSED", "CHANNEL_ERROR"].includes(status)) void hydrateFocusCounters();
      });
    const refetchWhenVisible = () => { if (document.visibilityState === "visible") void hydrateFocusCounters(); };
    const refetch = () => { void hydrateFocusCounters(); };
    document.addEventListener("visibilitychange", refetchWhenVisible);
    window.addEventListener("pageshow", refetch);
    window.addEventListener("online", refetch);
    const broadcast = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("adhdice_focus_counter_sync") : null;
    if (broadcast) broadcast.onmessage = refetch;
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", refetchWhenVisible);
      window.removeEventListener("pageshow", refetch);
      window.removeEventListener("online", refetch);
      broadcast?.close();
      void client.removeChannel(channel);
    };
  }, [client, hydrateFocusCounters, replaceFocusCounterState, setMessage, userId]);

  async function transitionFocusRuntime(categoryId: string, action: string, args: Record<string, unknown> = {}) {
    if (!client || !userId) return null;
    const current = activeSessionsRef.current[categoryId];
    const lifecycleKey = `${categoryId}:${current?.sessionId ?? "new"}:${current?.revision ?? 0}:${action}:${JSON.stringify(args)}`;
    let operationId = runtimeOperationIdsRef.current.get(lifecycleKey);
    if (!operationId) {
      operationId = createBrowserUuidV4();
      runtimeOperationIdsRef.current.set(lifecycleKey, operationId);
    }
    runtimeRequestGenerationRef.current += 1;
    const { data, error } = await client.rpc("adhdice_transition_focus_runtime", {
      p_operation_id: operationId,
      p_action: action,
      p_session_id: current?.sessionId ?? null,
      p_expected_revision: current?.revision ?? null,
      ...args,
    });
    if (error) {
      setMessage({ tone: "warn", text: `Focus timer update failed: ${error.message}` });
      if (/stale|revision|no longer exists/i.test(`${error.message} ${error.details ?? ""}`)) await hydrateFocusRuntimes();
      return null;
    }
    runtimeOperationIdsRef.current.delete(lifecycleKey);
    const result = data as FocusRuntimeRpcResult;
    if (result.runtime) applyRuntimeRow(result.runtime);
    if (result.deleted_session_id) {
      setActiveSessions((sessions) => {
        const next = removeFocusRuntimeFromSessions(sessions, { session_id: result.deleted_session_id });
        activeSessionsRef.current = next;
        return next;
      });
    }
    if (typeof BroadcastChannel !== "undefined") {
      const broadcast = new BroadcastChannel("adhdice_focus_sync");
      broadcast.postMessage("transition");
      broadcast.close();
    }
    return result;
  }

  function queueDailySurplusPrompt(previousHistory: HistoricalFocusSession[], nextHistory: HistoricalFocusSession[], entry: HistoricalFocusSession) {
    if (!entry.categoryId) return;
    const category = focusCategories.find((candidate) => candidate.id === entry.categoryId);
    if (!category) return;
    const plan = buildFocusGoalPlan({
      adjustments: focusDailyGoalAdjustments,
      categories: focusCategories,
      history: nextHistory,
      todayDate: entry.date,
    });
    const summary = plan.summaries.find((candidate) => candidate.category.id === entry.categoryId);
    if (!summary) return;
    const surplusSeconds = getPromptedDailySurplusSeconds({
      adjustments: focusDailyGoalAdjustments,
      afterHistory: nextHistory,
      beforeHistory: previousHistory,
      categoryId: entry.categoryId,
      sourceSessionId: entry.id,
      targetSeconds: summary.adjustedTodayTargetSeconds,
      todayDate: entry.date,
    });
    if (surplusSeconds <= 0) return;
    setPendingDailyGoalSurplus({
      sourceCategoryId: entry.categoryId,
      sourceCategoryTitle: category.title,
      sourceSessionId: entry.id,
      adjustmentDate: entry.date,
      surplusSeconds,
    });
  }

  async function handleSaveDailyGoalAdjustment(input: {
    adjustmentDate: string;
    sourceCategoryId: string;
    targetCategoryId: string;
    sourceSessionId?: string | null;
    reductionSeconds: number;
    reason?: string;
  }) {
    if (!client || !userId) return false;
    const payload = {
      user_id: userId,
      adjustment_date: input.adjustmentDate,
      source_category_id: input.sourceCategoryId,
      target_category_id: input.targetCategoryId,
      source_session_id: input.sourceSessionId ?? null,
      reduction_seconds: Math.max(1, Math.floor(input.reductionSeconds)),
      reason: input.reason ?? "daily_surplus_reallocation",
    };
    await client
      .from("adhdice_focus_daily_goal_adjustments")
      .delete()
      .eq("user_id", userId)
      .eq("adjustment_date", input.adjustmentDate)
      .eq("source_category_id", input.sourceCategoryId)
      .eq("target_category_id", input.targetCategoryId);
    const { data, error } = await client
      .from("adhdice_focus_daily_goal_adjustments")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }
    if (data) {
      const nextAdjustment = mapFocusDailyGoalAdjustmentRow(data);
      setFocusDailyGoalAdjustments((current) => [
        nextAdjustment,
        ...current.filter((adjustment) =>
          adjustment.adjustmentDate !== nextAdjustment.adjustmentDate ||
          adjustment.sourceCategoryId !== nextAdjustment.sourceCategoryId ||
          adjustment.targetCategoryId !== nextAdjustment.targetCategoryId
        ),
      ]);
    }
    setPendingDailyGoalSurplus(null);
    setMessage({ tone: "good", text: "Today’s Focus Goal plan updated." });
    return true;
  }

  async function handleToggleTimer(categoryId: string, options?: { countdownTargetSeconds?: number | null; mode?: "countdown" | "countup" }) {
    if (!client || !userId) return;
    const current = activeSessionsRef.current[categoryId];
    if (!current) {
      const isStandalone = isSystemCountdownCategoryId(categoryId);
      let sessionId = runtimeCreateSessionIdsRef.current.get(categoryId);
      if (!sessionId) {
        sessionId = createBrowserUuidV4();
        runtimeCreateSessionIdsRef.current.set(categoryId, sessionId);
      }
      const result = await transitionFocusRuntime(categoryId, "create", {
        p_session_id: sessionId,
        p_runtime_kind: isStandalone ? "standalone_countdown" : "category",
        p_category_id: isStandalone ? null : categoryId,
        p_mode: options?.mode === "countdown" || isStandalone ? "countdown" : "count_up",
        p_countdown_target_seconds: options?.countdownTargetSeconds ?? null,
        p_start: options?.mode !== "countdown",
      });
      if (result) runtimeCreateSessionIdsRef.current.delete(categoryId);
      return;
    }
    await transitionFocusRuntime(categoryId, current.isRunning ? "pause" : "resume");
  }

  async function handleSetCountdownTarget(categoryId: string, targetSeconds: number, options?: { start?: boolean }) {
    if (!client || !userId) return;

    const current = activeSessionsRef.current[categoryId];
    if (!current) return;
    const result = await transitionFocusRuntime(categoryId, "configure", {
      p_countdown_target_seconds: Math.max(60, targetSeconds),
      p_start: options?.start === true,
    });
    if (result) {
      setMessage({ tone: "good", text: "Countdown updated." });
    }
  }

  async function handleFinishTimer(
    categoryId: string,
    data?: { title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; notes: string; date: string; completionTime?: string },
  ) {
    if (!client || !userId) return;
    const activeSession = activeSessionsRef.current[categoryId];
    if (!activeSession?.sessionId || activeSession.revision === undefined) return;

    const category = resolveFocusCategory(categoryId, focusCategories);
    if (!category) return;

    if (completingRuntimeIdsRef.current.has(activeSession.sessionId)) return;
    completingRuntimeIdsRef.current.add(activeSession.sessionId);
    const sessionDate = data?.date ?? (activeSession.startTime ? getLogicalDayKey(new Date(activeSession.startTime)) : todayISO());
    const lifecycleKey = `complete:${activeSession.sessionId}`;
    let operationId = runtimeOperationIdsRef.current.get(lifecycleKey);
    if (!operationId) {
      operationId = createBrowserUuidV4();
      runtimeOperationIdsRef.current.set(lifecycleKey, operationId);
    }
    runtimeRequestGenerationRef.current += 1;
    const { data: completedResult, error } = await client.rpc("adhdice_complete_focus_runtime", {
      p_operation_id: operationId,
      p_session_id: activeSession.sessionId,
      p_expected_revision: activeSession.revision,
      p_title: sanitizeFocusLabel(data?.title ?? category.title, "Untitled Session"),
      p_focus_type: sanitizeFocusLabel(data?.focusType ?? category.focusType, "Work"),
      p_focus_subtype: sanitizeOptionalFocusLabel(data?.focusSubtype ?? category.focusSubtype),
      p_focus_subtype_2: sanitizeOptionalFocusLabel(data?.focusSubtype2 ?? category.focusSubtype2),
      p_notes: data?.notes || null,
      p_session_date: sessionDate,
    });
    completingRuntimeIdsRef.current.delete(activeSession.sessionId);
    if (error) {
      setMessage({ tone: "warn", text: `Focus completion failed: ${error.message}` });
      if (/stale|revision|no longer exists/i.test(`${error.message} ${error.details ?? ""}`)) await hydrateFocusRuntimes();
      return;
    }
    runtimeOperationIdsRef.current.delete(lifecycleKey);
    const inserted = (completedResult as FocusRuntimeRpcResult)?.completed_session;
    if (!inserted) { setMessage({ tone: "warn", text: "Focus session saved, but the response was empty." }); return; }

    const nextEntry = mergeStoredFocusHistory([
      {
        ...mapFocusSessionRow(inserted),
        title: data?.title ?? category.title,
        focusType: data?.focusType ?? category.focusType,
        focusSubtype: data?.focusSubtype ?? category.focusSubtype,
        focusSubtype2: data?.focusSubtype2 ?? category.focusSubtype2,
      },
    ])[0];

    const previousHistorySnapshot = focusHistory;
    const nextHistorySnapshot = [nextEntry, ...focusHistory.filter((entry) => entry.id !== nextEntry.id)];
    setFocusHistory((prev) => {
      const nextHistory = [nextEntry, ...prev.filter((entry) => entry.id !== nextEntry.id)];
      saveFocusHistory(nextHistory);
      return nextHistory;
    });
    if (!isSystemCountdownCategoryId(categoryId)) queueDailySurplusPrompt(previousHistorySnapshot, nextHistorySnapshot, nextEntry);
    setActiveSessions((prev) => {
      if (prev[categoryId]?.sessionId !== activeSession.sessionId) return prev;
      const next = { ...prev };
      delete next[categoryId];
      activeSessionsRef.current = next;
      return next;
    });
    setMessage({ tone: "good", text: "Focus session saved." });

    if (typeof BroadcastChannel !== "undefined") {
      const broadcast = new BroadcastChannel("adhdice_focus_sync");
      broadcast.postMessage("finish");
      broadcast.close();
    }
  }

  async function handleAdjustTimer(categoryId: string, deltaSeconds: number) {
    if (!client || !userId) return;

    if (!activeSessionsRef.current[categoryId]) return;
    const result = await transitionFocusRuntime(categoryId, "adjust", { p_delta_seconds: deltaSeconds });
    if (result) setMessage({ tone: "good", text: "Timer adjusted." });
  }

  async function handleResetTimer(categoryId: string) {
    if (!client || !userId) return;

    const result = await transitionFocusRuntime(categoryId, isSystemCountdownCategoryId(categoryId) ? "reset" : "delete");
    if (result) setMessage({ tone: "good", text: "Timer reset." });
  }

  async function handleDeleteTimer(categoryId: string) {
    if (!client || !userId) return;

    if (!activeSessionsRef.current[categoryId]) return;
    const result = await transitionFocusRuntime(categoryId, "delete");
    if (result) setMessage({ tone: "good", text: "Timer deleted." });
  }

  async function handleManualFocusEntry(data: {
    categoryId: string | null;
    title: string;
    focusType: FocusType;
    focusSubtype?: FocusSubtype | null;
    focusSubtype2?: FocusSubtype | null;
    durationSeconds: number;
    date: string;
    notes: string;
    completionTime?: string;
  }) {
    if (!client || !userId) return false;

    const completedAt = completionIsoFromDateTime(data.date, data.completionTime);
    const payload = {
      user_id: userId,
      category_id: data.categoryId,
      title_snapshot: sanitizeFocusLabel(data.title, "Untitled Session"),
      focus_type_snapshot: sanitizeFocusLabel(data.focusType, "Work"),
      focus_subtype_snapshot: sanitizeOptionalFocusLabel(data.focusSubtype),
      focus_subtype_2_snapshot: sanitizeOptionalFocusLabel(data.focusSubtype2),
      session_date: data.date,
      duration_seconds: data.durationSeconds,
      notes: data.notes || null,
      ended_at: completedAt,
      source: "manual" as const,
    };

    const { data: inserted, error } = await client
      .from("adhdice_focus_sessions")
      .insert(payload)
      .select("*")
      .single();

    if (error) { setMessage({ tone: "warn", text: error.message }); return false; }
    if (!inserted) { setMessage({ tone: "warn", text: "Focus entry saved, but the response was empty." }); return false; }

    const nextEntry = mergeStoredFocusHistory([
      {
        ...mapFocusSessionRow(inserted),
        title: data.title,
        focusType: data.focusType,
        focusSubtype: data.focusSubtype,
        focusSubtype2: data.focusSubtype2,
      },
    ])[0];
    const previousHistorySnapshot = focusHistory;
    const nextHistorySnapshot = [nextEntry, ...focusHistory];
    setFocusHistory((prev) => {
      const nextHistory = [nextEntry, ...prev];
      saveFocusHistory(nextHistory);
      return nextHistory;
    });
    queueDailySurplusPrompt(previousHistorySnapshot, nextHistorySnapshot, nextEntry);
    setMessage({ tone: "good", text: "Focus entry saved." });
    return true;
  }

  async function handleSaveCategories(categories: FocusCategory[]) {
    if (!client || !userId) return false;

    const uniqueCategories = dedupeCategoriesByName(categories).map((category) => ({
      ...category,
      id: isUuid(category.id) ? category.id : createClientSideId("focus-category"),
    }));

    if (uniqueCategories.length === 0) {
      setFocusCategories([]);
      saveFocusCategories([]);
      setMessage({ tone: "good", text: "Focus categories updated." });
      return true;
    }

    setFocusCategories(uniqueCategories);
    saveFocusCategories(uniqueCategories);
    suppressCategoryReload.current = true;

    const payload = uniqueCategories.map((category, index) => ({
      id: category.id,
      user_id: userId,
      title: sanitizeFocusLabel(category.title, "Untitled Category"),
      focus_type: sanitizeFocusLabel(category.focusType, "Work"),
      focus_subtype: sanitizeOptionalFocusLabel(category.focusSubtype),
      focus_subtype_2: sanitizeOptionalFocusLabel(category.focusSubtype2),
      color: category.color,
      icon: category.icon,
      daily_goal_seconds: category.dailyGoalSeconds ?? null,
      weekly_goal_seconds: category.weeklyGoalSeconds ?? null,
      priority_level: normalizePriorityLevel(category.priorityLevel),
      target_distribution_mode: normalizeDistributionMode(category.targetDistributionMode),
      weekday_target_seconds: category.weekdayTargetSeconds ?? {},
      count_toward_productive_goal: category.countTowardProductiveGoal ?? null,
      allow_daily_surplus_reduction: category.allowDailySurplusReduction ?? null,
      weekly_surplus_carryover_mode: normalizeCarryoverMode(category.weeklySurplusCarryoverMode),
      sort_order: index,
    }));

    let savedCategories, error;
    try {
      ({ data: savedCategories, error } = await client
        .from("adhdice_focus_categories")
        .upsert(payload, { onConflict: "id" })
        .select("*"));
    } finally {
      suppressCategoryReload.current = false;
    }

    if (error) { setMessage({ tone: "warn", text: error.message }); return false; }

    const optimisticById = new Map(uniqueCategories.map((category) => [category.id, category]));
    const nextCategories = savedCategories && savedCategories.length > 0
      ? savedCategories
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((row) => {
          const optimistic = optimisticById.get(row.id);
          return {
            ...(optimistic ?? {}),
            ...mapFocusCategoryRow(row),
            dailyGoalSeconds: row.daily_goal_seconds ?? optimistic?.dailyGoalSeconds ?? null,
            weeklyGoalSeconds: row.weekly_goal_seconds ?? optimistic?.weeklyGoalSeconds ?? null,
            priorityLevel: normalizePriorityLevel(row.priority_level ?? optimistic?.priorityLevel),
            targetDistributionMode: normalizeDistributionMode(row.target_distribution_mode ?? optimistic?.targetDistributionMode),
            weekdayTargetSeconds: normalizeWeekdayTargetSeconds(row.weekday_target_seconds ?? optimistic?.weekdayTargetSeconds),
            countTowardProductiveGoal: row.count_toward_productive_goal ?? optimistic?.countTowardProductiveGoal ?? null,
            allowDailySurplusReduction: row.allow_daily_surplus_reduction ?? optimistic?.allowDailySurplusReduction ?? null,
            weeklySurplusCarryoverMode: normalizeCarryoverMode(row.weekly_surplus_carryover_mode ?? optimistic?.weeklySurplusCarryoverMode),
          };
        })
      : uniqueCategories;

    setFocusCategories(nextCategories);
    saveFocusCategories(nextCategories);
    setMessage({ tone: "good", text: "Focus categories updated." });
    return true;
  }

  async function handleDeleteFocusCategory(category: FocusCategory) {
    if (!client || !userId) return false;

    const confirmed = window.confirm(
      `Delete "${category.title}"? Saved focus history will stay in place as one-off historical records, but active timers for this category will be cleared. This cannot be undone.`,
    );
    if (!confirmed) return false;

    const { error } = await client
      .from("adhdice_focus_categories")
      .delete()
      .eq("id", category.id)
      .eq("user_id", userId);

    if (error) { setMessage({ tone: "warn", text: error.message }); return false; }

    setFocusCategories((prev) => {
      const nextCategories = prev.filter((entry) => entry.id !== category.id);
      saveFocusCategories(nextCategories);
      return nextCategories;
    });
    setFocusHistory((prev) => {
      const nextHistory = prev.map((entry) =>
        entry.categoryId === category.id ? { ...entry, categoryId: null } : entry,
      );
      saveFocusHistory(nextHistory);
      return nextHistory;
    });
    setActiveSessions((prev) => {
      const next = { ...prev };
      delete next[category.id];
      return next;
    });
    persistCountdownMetadata(category.id, null);
    setMessage({ tone: "good", text: "Focus category deleted." });
    return true;
  }

  async function handleUpdateFocusHistoryEntry(
    entryId: string,
    data: {
      categoryId: string | null;
      title: string;
      focusType: FocusType;
      focusSubtype?: FocusSubtype | null;
      focusSubtype2?: FocusSubtype | null;
      durationSeconds: number;
      date: string;
      completionTime?: string;
      notes: string;
    },
  ) {
    if (!client || !userId) return;

    const completedAt = completionIsoFromDateTime(data.date, data.completionTime);
    const payload = {
      category_id: data.categoryId,
      title_snapshot: sanitizeFocusLabel(data.title, "Untitled Session"),
      focus_type_snapshot: sanitizeFocusLabel(data.focusType, "Work"),
      focus_subtype_snapshot: sanitizeOptionalFocusLabel(data.focusSubtype),
      focus_subtype_2_snapshot: sanitizeOptionalFocusLabel(data.focusSubtype2),
      session_date: data.date,
      duration_seconds: data.durationSeconds,
      ended_at: completedAt,
      notes: data.notes || null,
    };

    const { data: updated, error } = await client
      .from("adhdice_focus_sessions")
      .update(payload)
      .eq("id", entryId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) { setMessage({ tone: "warn", text: error.message }); return; }
    if (!updated) { setMessage({ tone: "warn", text: "Focus entry updated, but the response was empty." }); return; }

    const nextEntry = mergeStoredFocusHistory([
      {
        ...mapFocusSessionRow(updated),
        title: data.title,
        focusType: data.focusType,
        focusSubtype: data.focusSubtype,
        focusSubtype2: data.focusSubtype2,
      },
    ])[0];
    let nextHistorySnapshot: HistoricalFocusSession[] = [];
    setFocusHistory((prev) => {
      const nextHistory = prev.map((entry) => (entry.id === entryId ? nextEntry : entry));
      nextHistorySnapshot = nextHistory;
      saveFocusHistory(nextHistory);
      return nextHistory;
    });
    queueDailySurplusPrompt(focusHistory, nextHistorySnapshot, nextEntry);
    setMessage({ tone: "good", text: "Focus entry updated." });
  }

  async function handleDeleteFocusHistoryEntry(entryId: string) {
    if (!client || !userId) return;
    if (!window.confirm("Delete this focus entry? This cannot be undone.")) return;

    const { error } = await client
      .from("adhdice_focus_sessions")
      .delete()
      .eq("id", entryId)
      .eq("user_id", userId);

    if (error) { setMessage({ tone: "warn", text: error.message }); return; }

    setFocusHistory((prev) => {
      const nextHistory = prev.filter((entry) => entry.id !== entryId);
      saveFocusHistory(nextHistory);
      return nextHistory;
    });
    setMessage({ tone: "good", text: "Focus entry deleted." });
  }

  async function mutateFocusCounter(
    counterId: string,
    action: "create" | "adjust" | "set_value" | "update" | "delete",
    expectedRevision: number | null,
    payload: Record<string, unknown>,
  ) {
    if (!client || !userId) return null;
    const operationId = createBrowserUuidV4();
    counterRequestGenerationRef.current += 1;
    const { data, error } = await client.rpc("adhdice_mutate_focus_counter", {
      p_operation_id: operationId,
      p_counter_id: counterId,
      p_expected_revision: expectedRevision,
      p_action: action,
      p_action_payload: { ...payload, client_created_at: new Date().toISOString() },
    });
    if (focusCounterStateRef.current.ownerUserId !== userId) return null;
    if (error) {
      setMessage({ tone: "warn", text: `Focus counter update failed: ${error.message}` });
      await hydrateFocusCounters();
      return null;
    }
    const result = data as FocusCounterMutationResult;
    applyFocusCounterMutationResult(result);
    if (!result.ok || result.conflict) {
      setMessage({ tone: "warn", text: "That counter changed on another device. The current server value has been restored." });
      await hydrateFocusCounters();
      return null;
    }
    if (typeof BroadcastChannel !== "undefined") {
      const broadcast = new BroadcastChannel("adhdice_focus_counter_sync");
      broadcast.postMessage("mutation");
      broadcast.close();
    }
    return result;
  }

  async function handleCreateFocusCounter(input: {
    color: string;
    goal: number;
    icon: string;
    initialValue: number;
    step: number;
    title: string;
  }) {
    const result = await mutateFocusCounter(createBrowserUuidV4(), "create", null, {
      color: input.color,
      goal: Math.max(1, Math.floor(input.goal)),
      icon: input.icon.trim() || "Hash",
      step: Math.max(1, Math.floor(input.step)),
      title: input.title.trim() || "Counter",
      value: Math.floor(input.initialValue),
    });
    if (result) setMessage({ tone: "good", text: "Counter created." });
  }

  async function handleUpdateFocusCounter(counterId: string, updates: Partial<Pick<FocusCounter, "color" | "goal" | "icon" | "step" | "title" | "value">>) {
    const target = focusCounterStateRef.current.ownerUserId === userId
      ? focusCounterStateRef.current.counters.find((counter) => counter.id === counterId)
      : undefined;
    if (!target) return;
    const valueChanged = updates.value !== undefined && Math.floor(updates.value) !== target.value;
    const sanitizedUpdates: Partial<Pick<FocusCounter, "color" | "goal" | "icon" | "step" | "title" | "value">> = {
      ...updates,
      ...(updates.goal !== undefined ? { goal: Math.max(1, Math.floor(updates.goal)) } : {}),
      ...(updates.step !== undefined ? { step: Math.max(1, Math.floor(updates.step)) } : {}),
      ...(updates.title !== undefined ? { title: updates.title.trim() || target.title } : {}),
      ...(updates.value !== undefined ? { value: Math.floor(updates.value) } : {}),
    };
    if (!valueChanged) delete sanitizedUpdates.value;
    const result = await mutateFocusCounter(counterId, valueChanged ? "set_value" : "update", target.revision, sanitizedUpdates);
    if (result) setMessage({ tone: "good", text: "Counter updated." });
  }

  async function handleDeleteFocusCounter(counterId: string) {
    const targetCounter = focusCounterStateRef.current.ownerUserId === userId
      ? focusCounterStateRef.current.counters.find((counter) => counter.id === counterId)
      : undefined;
    if (!targetCounter) {
      return;
    }
    if (!window.confirm(`Delete "${targetCounter.title}"? This cannot be undone.`)) {
      return;
    }
    const result = await mutateFocusCounter(counterId, "delete", targetCounter.revision, {});
    if (result) setMessage({ tone: "good", text: "Counter deleted." });
  }

  async function handleAdjustFocusCounter(counterId: string, direction: 1 | -1) {
    const target = focusCounterStateRef.current.ownerUserId === userId
      ? focusCounterStateRef.current.counters.find((counter) => counter.id === counterId)
      : undefined;
    if (!target) return;
    await mutateFocusCounter(counterId, "adjust", target.revision, { direction });
  }

  return {
    focusCategories,
    focusCounters,
    focusCounterHistory,
    setFocusCategories,
    activeSessions,
    setActiveSessions,
    refreshFocusRuntimes: hydrateFocusRuntimes,
    refreshFocusCounters: hydrateFocusCounters,
    focusHistory,
    focusDailyGoalAdjustments,
    pendingDailyGoalSurplus,
    setPendingDailyGoalSurplus,
    setFocusHistory,
    suppressCategoryReload,
    handleToggleTimer,
    handleSetCountdownTarget,
    handleFinishTimer,
    handleAdjustTimer,
    handleResetTimer,
    handleDeleteTimer,
    handleManualFocusEntry,
    handleSaveDailyGoalAdjustment,
    handleSaveCategories,
    handleDeleteFocusCategory,
    handleUpdateFocusHistoryEntry,
    handleDeleteFocusHistoryEntry,
    handleAdjustFocusCounter,
    handleCreateFocusCounter,
    handleDeleteFocusCounter,
    handleUpdateFocusCounter,
  };
}
