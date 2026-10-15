import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { subscribeToBrowserAuth } from "@/lib/supabase";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import type { FocusCategory, ActiveFocusSession, HistoricalFocusSession, FocusCounter, FocusCounterHistoryEntry, FocusType, FocusSubtype, FocusDailyGoalAdjustment, FocusReallocationMode, PendingFocusDailySurplus, FocusManualEntryInput } from "@/lib/types";
import type { FocusCategory as DbFocusCategory, FocusDailyGoalAdjustment as DbFocusDailyGoalAdjustment, FocusSession as DbFocusSession } from "@/lib/database.types";
import type { WorkspaceDomainMutationBarrier } from "@/lib/workspace-refresh-coordinator";
import { createRealtimeSnapshotLifecycle } from "@/lib/realtime-snapshot-lifecycle";
import { buildFocusGoalPlan, getMondayWeekRange, getPromptedDailySurplusSeconds, normalizeCarryoverMode, normalizeDistributionMode, normalizePriorityLevel } from "@/lib/focus-goals";
import {
  dedupeCategoriesByName,
  isSystemCountdownCategoryId,
  resolveFocusCategory,
  isUuid,
  normalizeCategoryTitle,
  normalizeFocusCategoriesForPersistence,
  preferStoredOptionalValue,
  preferStoredValue,
  sanitizeFocusLabel,
  sanitizeOptionalFocusLabel,
} from "@/lib/focus-utils";
import { getLogicalDayKey } from "@/lib/logical-day";
import { todayISO } from "@/lib/utils";
import { createBrowserUuidV4 } from "@/lib/browser-uuid";
import { upsertFocusHistoryEntry } from "@/lib/focus-activity";
import {
  applyFocusRuntimeRealtimeRow,
  isCurrentFocusRuntimeSnapshotRequest,
  reconcileFocusRuntimeSnapshot,
  removeFocusRuntimeFromSessions,
  type FocusRuntimeRow,
} from "@/lib/focus-runtime";
import {
  applyAuthoritativeFocusCounterEvent,
  applyAuthoritativeFocusCounterRow,
  isCurrentFocusCounterSnapshotRequest,
  reconcileFocusCounterHistorySnapshot,
  reconcileFocusCounterSnapshot,
  type FocusCounterEventRow,
  type FocusCounterMutationResult,
  type FocusCounterRow,
} from "@/lib/focus-counter-sync";
import { normalizeFocusReallocationMode, readFocusReallocationMode, writeFocusReallocationMode } from "@/lib/focus-reallocation";
import { fetchAllPagedRows, SUPABASE_READ_PAGE_SIZE, type PaginatedReadResult } from "@/lib/paginated-read";
import { isWorkspacePerformanceDiagnosticsEnabled } from "@/lib/workspace-performance-diagnostics";
import {
  getSafeLocalStorage,
  readLocalStorageValue,
  removeLocalStorageItem,
  writeLocalStorageEntries,
} from "@/lib/health-local-storage";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
type SetMessage = (msg: { tone: "neutral" | "good" | "warn"; text: string } | null) => void;
type FocusRuntimeRpcResult = { runtime?: FocusRuntimeRow | null; deleted_session_id?: string; completed_session?: DbFocusSession; was_replayed?: boolean };
type FocusHistoryLoad = {
  client: SupabaseClient;
  getPageCount: () => number;
  promise: Promise<PaginatedReadResult<DbFocusSession>>;
  userId: string;
};

export function isFocusAuthReady(confirmedUserId: string | null, userId: string | null) {
  return Boolean(confirmedUserId && userId && confirmedUserId === userId);
}

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

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function parseStoredJson<T>(key: string, fallback: T): T {
  const storage = getSafeLocalStorage();
  if (!storage) return fallback;
  const rawValue = readLocalStorageValue(storage, key);
  if (!rawValue) return fallback;
  try {
    return JSON.parse(rawValue) as T;
  } catch {
    removeLocalStorageItem(storage, key);
    return fallback;
  }
}

function writeFocusStorageValue(key: string, value: unknown) {
  const storage = getSafeLocalStorage();
  if (!storage) return;
  try {
    writeLocalStorageEntries(storage, [[key, JSON.stringify(value)]]);
  } catch {
    // Focus local persistence is a best-effort cache and never a mutation authority.
  }
}

function removeFocusStorageValue(key: string) {
  const storage = getSafeLocalStorage();
  if (!storage) return;
  removeLocalStorageItem(storage, key);
}

function readCountdownMetadata(): CountdownMetadata {
  return parseStoredJson<CountdownMetadata>(FOCUS_COUNTDOWN_META_STORAGE_KEY, {});
}

function writeCountdownMetadata(metadata: CountdownMetadata) {
  writeFocusStorageValue(FOCUS_COUNTDOWN_META_STORAGE_KEY, metadata);
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
  if (!userId) return;
  const storageKey = getLocalActiveSessionStorageKey(userId);
  if (!session) {
    removeFocusStorageValue(storageKey);
    return;
  }
  writeFocusStorageValue(storageKey, session);
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
  writeFocusStorageValue(FOCUS_CATEGORIES_STORAGE_KEY, categories);
}

/**
 * Focus History is fully persisted in Supabase and held in React state at runtime.
 * Keep this compatibility export as a no-op so old callers cannot recreate the
 * unbounded browser mirror.
 */
export function saveFocusHistory(history: HistoricalFocusSession[]) {
  void history;
}

function saveFocusCounters(userId: string | null | undefined, counters: FocusCounter[]) {
  if (!userId) return;
  writeFocusStorageValue(getFocusCountersStorageKey(userId), counters);
}

function saveFocusCounterHistory(userId: string | null | undefined, history: FocusCounterHistoryEntry[]) {
  if (!userId) return;
  writeFocusStorageValue(getFocusCounterHistoryStorageKey(userId), history);
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
    startedAt: row.started_at,
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
  if (!Array.isArray(storedHistory) || storedHistory.length === 0) return history;

  const storedById = new Map(storedHistory.map((entry) => [entry.id, entry]));
  const remoteIds = new Set(history.map((entry) => entry.id));
  if (storedHistory.every((entry) => remoteIds.has(entry.id))) {
    removeFocusStorageValue(FOCUS_HISTORY_STORAGE_KEY);
  }

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
  historyActive = true,
  invalidateFocusDomainGeneration: WorkspaceDomainMutationBarrier = () => {},
) {
  const [focusCategories, setFocusCategories] = useState<FocusCategory[]>([]);
  const [activeSessions, setActiveSessions] = useState<Record<string, ActiveFocusSession>>({});
  const [focusHistory, setFocusHistory] = useState<HistoricalFocusSession[]>([]);
  const [focusDailyGoalAdjustments, setFocusDailyGoalAdjustments] = useState<FocusDailyGoalAdjustment[]>([]);
  const [pendingDailyGoalSurplusState, setPendingDailyGoalSurplusState] = useState<{ pending: PendingFocusDailySurplus | null; ownerUserId: string | null }>({ pending: null, ownerUserId: null });
  const [focusReallocationModeState, setFocusReallocationModeState] = useState<{ mode: FocusReallocationMode; ownerUserId: string | null }>(() => ({
    mode: readFocusReallocationMode(userId),
    ownerUserId: userId,
  }));
  const [focusCounterState, setFocusCounterState] = useState<FocusCounterState>({ counters: [], history: [], ownerUserId: null });
  const [confirmedAuthUserId, setConfirmedAuthUserId] = useState<string | null>(null);
  const suppressCategoryReload = useRef(false);
  const activeSessionsRef = useRef(activeSessions);
  const runtimeRequestGenerationRef = useRef(0);
  const runtimeHydrationGenerationRef = useRef(0);
  const runtimeClosedRevisionsRef = useRef(new Map<string, number>());
  const counterRequestGenerationRef = useRef(0);
  const focusCounterStateRef = useRef(focusCounterState);
  const confirmedAuthUserIdRef = useRef<string | null>(null);
  const currentUserIdRef = useRef(userId);
  const runtimeOperationIdsRef = useRef(new Map<string, string>());
  const runtimeCreateSessionIdsRef = useRef(new Map<string, string>());
  const completingRuntimeIdsRef = useRef(new Set<string>());
  const loadedFocusHistoryUserIdRef = useRef<string | null>(null);
  const focusHistoryLoadInFlightRef = useRef<FocusHistoryLoad | null>(null);
  const focusHistoryRef = useRef(focusHistory);
  const focusHistoryMutationGenerationRef = useRef(0);
  const migratedRuntimeUserRef = useRef<string | null>(null);
  const runtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const runtimeChannelRemovalPromiseRef = useRef<Promise<void> | null>(null);
  const runtimeHydrationInFlightRef = useRef<{ client: SupabaseClient; promise: Promise<void>; userId: string } | null>(null);
  const counterChannelRef = useRef<RealtimeChannel | null>(null);
  const counterChannelRemovalPromiseRef = useRef<Promise<void> | null>(null);
  const counterHydrationInFlightRef = useRef<{ client: SupabaseClient; promise: Promise<void>; userId: string } | null>(null);
  const isFocusAuthReadyForUser = isFocusAuthReady(confirmedAuthUserId, userId);
  const focusCounters = isFocusAuthReadyForUser && focusCounterState.ownerUserId === userId ? focusCounterState.counters : [];
  const focusCounterHistory = isFocusAuthReadyForUser && focusCounterState.ownerUserId === userId ? focusCounterState.history : [];
  const pendingDailyGoalSurplus = pendingDailyGoalSurplusState.ownerUserId === userId
    ? pendingDailyGoalSurplusState.pending
    : null;
  const focusReallocationMode = focusReallocationModeState.ownerUserId === userId
    ? focusReallocationModeState.mode
    : readFocusReallocationMode(userId);

  useEffect(() => {
    activeSessionsRef.current = activeSessions;
  }, [activeSessions]);

  useEffect(() => {
    focusHistoryRef.current = focusHistory;
  }, [focusHistory]);

  useEffect(() => {
    focusCounterStateRef.current = focusCounterState;
  }, [focusCounterState]);

  useEffect(() => {
    if (!client) {
      confirmedAuthUserIdRef.current = null;
      return;
    }

    return subscribeToBrowserAuth((_event, session) => {
      const previousUserId = confirmedAuthUserIdRef.current;
      const nextUserId = session?.user?.id ?? null;
      confirmedAuthUserIdRef.current = nextUserId;
      if (previousUserId !== nextUserId) {
        migratedRuntimeUserRef.current = null;
        counterRequestGenerationRef.current += 1;
        runtimeRequestGenerationRef.current += 1;
        runtimeHydrationGenerationRef.current += 1;
      }
      setConfirmedAuthUserId(nextUserId);
    });
  }, [client]);

  useEffect(() => {
    currentUserIdRef.current = userId;
    focusHistoryMutationGenerationRef.current += 1;
    loadedFocusHistoryUserIdRef.current = null;
    counterRequestGenerationRef.current += 1;
    const nextState = { counters: [], history: [], ownerUserId: userId };
    focusCounterStateRef.current = nextState;
  }, [userId]);

  useEffect(() => {
    focusHistoryMutationGenerationRef.current += 1;
  }, [historyActive]);

  useEffect(() => {
    runtimeRequestGenerationRef.current += 1;
    runtimeHydrationGenerationRef.current += 1;
    runtimeClosedRevisionsRef.current.clear();
  }, [userId]);

  const setFocusReallocationMode = useCallback((mode: FocusReallocationMode) => {
    const normalizedMode = normalizeFocusReallocationMode(mode);
    setFocusReallocationModeState({ mode: normalizedMode, ownerUserId: userId });
    writeFocusReallocationMode(userId, normalizedMode);
  }, [userId]);

  const setPendingDailyGoalSurplus = useCallback((pending: PendingFocusDailySurplus | null) => {
    setPendingDailyGoalSurplusState({ pending, ownerUserId: pending ? userId : null });
  }, [userId]);

  useEffect(() => {
    if (!client || !userId || !historyActive) {
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
  }, [client, historyActive, setMessage, setPendingDailyGoalSurplus, userId]);

  useEffect(() => {
    if (!client || !userId || !historyActive || loadedFocusHistoryUserIdRef.current === userId) return;
    const existingLoad = focusHistoryLoadInFlightRef.current;
    let load = existingLoad && existingLoad.client === client && existingLoad.userId === userId
      ? existingLoad
      : null;
    if (!load) {
      let pageCount = 0;
      const promise = fetchAllPagedRows(
        (from, to) => client
          .from("adhdice_focus_sessions")
          .select("id,user_id,category_id,title_snapshot,focus_type_snapshot,focus_subtype_snapshot,focus_subtype_2_snapshot,session_date,duration_seconds,notes,started_at,ended_at,source,runtime_session_id,created_at")
          .eq("user_id", userId)
          .order("session_date", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
        SUPABASE_READ_PAGE_SIZE,
        () => {
          pageCount += 1;
        },
      );
      load = {
        client,
        getPageCount: () => pageCount,
        promise,
        userId,
      };
      focusHistoryLoadInFlightRef.current = load;
      const clearInFlightLoad = () => {
        if (focusHistoryLoadInFlightRef.current === load) {
          focusHistoryLoadInFlightRef.current = null;
        }
      };
      void promise.then(clearInFlightLoad, clearInFlightLoad);
    }

    let disposed = false;
    void load.promise.then(({ data, error }) => {
      if (disposed || currentUserIdRef.current !== userId || error) return;
      const next = mergeStoredFocusHistory(((data ?? []) as DbFocusSession[]).map((row) => mapFocusSessionRow(row)));
      loadedFocusHistoryUserIdRef.current = userId;
      setFocusHistory(next);
      if (isWorkspacePerformanceDiagnosticsEnabled()) {
        console.info(`[focus] history hydrated pages=${load?.getPageCount() ?? 0} rows=${data?.length ?? 0}`);
      }
    });
    return () => { disposed = true; };
  }, [client, historyActive, userId]);

  const applyRuntimeRow = useCallback((row: FocusRuntimeRow) => {
    runtimeRequestGenerationRef.current += 1;
    setActiveSessions((current) => {
      const next = applyFocusRuntimeRealtimeRow(current, row, runtimeClosedRevisionsRef.current);
      activeSessionsRef.current = next;
      return next;
    });
  }, []);

  const removeRealtimeChannel = useCallback(async (channel: RealtimeChannel) => {
    try {
      await client?.removeChannel(channel);
    } catch {
      // Ignore cleanup races when auth, Fast Refresh, or Strict Mode recreates channels quickly.
    }
  }, [client]);

  const hydrateFocusRuntimes = useCallback(() => {
    if (!client || !userId || !isFocusAuthReady(confirmedAuthUserIdRef.current, userId)) return;
    const inFlight = runtimeHydrationInFlightRef.current;
    if (inFlight?.client === client && inFlight.userId === userId) return inFlight.promise;

    const promise = (async () => {
      const hydrationGeneration = ++runtimeHydrationGenerationRef.current;
      const generation = ++runtimeRequestGenerationRef.current;
      const { data, error } = await client
        .from("adhdice_focus_active_sessions")
        .select("session_id,user_id,runtime_kind,category_id,mode,mode_authoritative,countdown_target_seconds,state,current_run_started_at,accumulated_seconds,revision,closed_at,close_reason,created_at,updated_at")
        .eq("user_id", userId)
        .is("closed_at", null);
      const isCurrentRuntimeHydration = () =>
        currentUserIdRef.current === userId &&
        isFocusAuthReady(confirmedAuthUserIdRef.current, userId) &&
        isCurrentFocusRuntimeSnapshotRequest(hydrationGeneration, runtimeHydrationGenerationRef.current);
      if (
        !isCurrentRuntimeHydration() ||
        !isCurrentFocusRuntimeSnapshotRequest(generation, runtimeRequestGenerationRef.current)
      ) return;
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
        const storage = getSafeLocalStorage();
        const stored = storage ? readLocalStorageValue(storage, key) : null;
        if (stored) return stored;
        const operationId = createBrowserUuidV4();
        if (storage) writeLocalStorageEntries(storage, [[key, operationId]]);
        return operationId;
      };

      for (const row of rows) {
        if (!isCurrentRuntimeHydration()) return;
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
        if (!isCurrentRuntimeHydration()) return;
        if (!migrationError && migrated) {
          const result = migrated as FocusRuntimeRpcResult;
          if (result.runtime) applyRuntimeRow(result.runtime);
          delete legacyMetadata[row.category_id];
          writeCountdownMetadata(legacyMetadata);
          removeFocusStorageValue(`${migrationKeyPrefix}${row.category_id}`);
        }
      }

      if (legacyStandalone) {
        if (!isCurrentRuntimeHydration()) return;
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
        if (!isCurrentRuntimeHydration()) return;
        if (!migrationError && migrated) {
          const result = migrated as FocusRuntimeRpcResult;
          if (result.runtime) applyRuntimeRow(result.runtime);
          writeLocalActiveSession(userId, null);
          delete legacyMetadata[legacyStandalone.categoryId];
          writeCountdownMetadata(legacyMetadata);
          removeFocusStorageValue(`${migrationKeyPrefix}standalone`);
        }
      }
    })();
    runtimeHydrationInFlightRef.current = { client, promise, userId };
    void promise.then(
      () => { if (runtimeHydrationInFlightRef.current?.promise === promise) runtimeHydrationInFlightRef.current = null; },
      () => { if (runtimeHydrationInFlightRef.current?.promise === promise) runtimeHydrationInFlightRef.current = null; },
    );
    return promise;
  }, [applyRuntimeRow, client, setMessage, userId]);

  useEffect(() => {
    if (!client || !userId || !isFocusAuthReadyForUser) {
      migratedRuntimeUserRef.current = null;
      return;
    }
    const currentClient = client;
    let active = true;
    const snapshotLifecycle = createRealtimeSnapshotLifecycle();
    const requestRuntimeSnapshot = (shouldRequest: boolean) => {
      if (!shouldRequest) return;
      const promise = hydrateFocusRuntimes();
      if (!promise) {
        snapshotLifecycle.completeHydration(false);
        return;
      }
      void promise.then(
        () => snapshotLifecycle.completeHydration(true),
        () => snapshotLifecycle.completeHydration(false),
      );
    };
    async function subscribeToRuntimeChannel() {
      const previousChannel = runtimeChannelRef.current;
      runtimeChannelRef.current = null;
      const removalPromise = previousChannel
        ? removeRealtimeChannel(previousChannel)
        : (runtimeChannelRemovalPromiseRef.current ?? Promise.resolve());
      runtimeChannelRemovalPromiseRef.current = removalPromise;

      await removalPromise;

      if (!active || currentUserIdRef.current !== userId || !isFocusAuthReady(confirmedAuthUserIdRef.current, userId)) return;

      const channel = currentClient
        .channel(`focus-runtime:${userId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "adhdice_focus_active_sessions", filter: `user_id=eq.${userId}` }, (payload) => {
          if (!active || currentUserIdRef.current !== userId || !isFocusAuthReady(confirmedAuthUserIdRef.current, userId)) return;
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
          if (!active || currentUserIdRef.current !== userId || !isFocusAuthReady(confirmedAuthUserIdRef.current, userId)) return;
          const entry = mapFocusSessionRow(payload.new as DbFocusSession);
          setFocusHistory((current) => {
            const next = upsertFocusHistoryEntry(current, entry);
            return next;
          });
        })
        .subscribe((status) => {
          if (!active) return;
          if (status !== "SUBSCRIBED") {
            snapshotLifecycle.handleStatus(status);
            return;
          }
          if (!isFocusAuthReady(confirmedAuthUserIdRef.current, userId)) return;
          requestRuntimeSnapshot(snapshotLifecycle.handleStatus(status));
        });
      runtimeChannelRef.current = channel;
      runtimeChannelRemovalPromiseRef.current = null;
    }

    void subscribeToRuntimeChannel();
    const refetchWhenVisible = () => requestRuntimeSnapshot(snapshotLifecycle.handleVisibilityChange(document.visibilityState));
    const refetch = (event: PageTransitionEvent) => requestRuntimeSnapshot(snapshotLifecycle.handlePageShow(event.persisted));
    const refetchWhenOnline = () => requestRuntimeSnapshot(snapshotLifecycle.handleOnline());
    const refetchWhenOffline = () => { snapshotLifecycle.handleOffline(); };
    document.addEventListener("visibilitychange", refetchWhenVisible);
    window.addEventListener("pageshow", refetch);
    window.addEventListener("online", refetchWhenOnline);
    window.addEventListener("offline", refetchWhenOffline);
    const broadcast = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("adhdice_focus_sync") : null;
    if (broadcast) broadcast.onmessage = () => requestRuntimeSnapshot(snapshotLifecycle.handleBroadcast());
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", refetchWhenVisible);
      window.removeEventListener("pageshow", refetch);
      window.removeEventListener("online", refetchWhenOnline);
      window.removeEventListener("offline", refetchWhenOffline);
      broadcast?.close();
      snapshotLifecycle.dispose();
      const channel = runtimeChannelRef.current;
      runtimeChannelRef.current = null;
      if (channel) {
        runtimeChannelRemovalPromiseRef.current = removeRealtimeChannel(channel);
      }
    };
  }, [applyRuntimeRow, client, hydrateFocusRuntimes, isFocusAuthReadyForUser, removeRealtimeChannel, userId]);

  const replaceFocusCounterState = useCallback((ownerUserId: string, counters: FocusCounter[], history: FocusCounterHistoryEntry[]) => {
    const nextState = { counters, history, ownerUserId };
    focusCounterStateRef.current = nextState;
    saveFocusCounters(ownerUserId, counters);
    saveFocusCounterHistory(ownerUserId, history);
    setFocusCounterState(nextState);
  }, []);

  const hydrateFocusCounters = useCallback(() => {
    if (!client || !userId || !isFocusAuthReady(confirmedAuthUserIdRef.current, userId)) return;
    const inFlight = counterHydrationInFlightRef.current;
    if (inFlight?.client === client && inFlight.userId === userId) return inFlight.promise;

    const promise = (async () => {
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
      if (
        currentUserIdRef.current !== userId ||
        !isFocusAuthReady(confirmedAuthUserIdRef.current, userId) ||
        !isCurrentFocusCounterSnapshotRequest(generation, counterRequestGenerationRef.current)
      ) return;
      const error = counterResponse.error ?? eventResponse.error;
      if (error) {
        if (!/does not exist|schema cache/i.test(error.message)) {
          setMessage({ tone: "warn", text: `Focus counter sync failed: ${error.message}` });
        }
        return;
      }
      replaceFocusCounterState(
        userId,
        reconcileFocusCounterSnapshot((counterResponse.data ?? []) as FocusCounterRow[]),
        reconcileFocusCounterHistorySnapshot((eventResponse.data ?? []) as FocusCounterEventRow[]),
      );
    })();
    counterHydrationInFlightRef.current = { client, promise, userId };
    void promise.then(
      () => { if (counterHydrationInFlightRef.current?.promise === promise) counterHydrationInFlightRef.current = null; },
      () => { if (counterHydrationInFlightRef.current?.promise === promise) counterHydrationInFlightRef.current = null; },
    );
    return promise;
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
    if (!client || !userId || !isFocusAuthReadyForUser) return;
    const currentClient = client;
    let cancelled = false;
    const snapshotLifecycle = createRealtimeSnapshotLifecycle();
    const requestCounterSnapshot = (shouldRequest: boolean) => {
      if (!shouldRequest) return;
      const promise = hydrateFocusCounters();
      if (!promise) {
        snapshotLifecycle.completeHydration(false);
        return;
      }
      void promise.then(
        () => snapshotLifecycle.completeHydration(true),
        () => snapshotLifecycle.completeHydration(false),
      );
    };
    async function subscribeToCounterChannel() {
      const previousChannel = counterChannelRef.current;
      counterChannelRef.current = null;
      const removalPromise = previousChannel
        ? removeRealtimeChannel(previousChannel)
        : (counterChannelRemovalPromiseRef.current ?? Promise.resolve());
      counterChannelRemovalPromiseRef.current = removalPromise;

      await removalPromise;

      if (cancelled || currentUserIdRef.current !== userId || !isFocusAuthReady(confirmedAuthUserIdRef.current, userId)) return;

      const channel = currentClient
        .channel(`focus-counters:${userId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "adhdice_focus_counters", filter: `user_id=eq.${userId}` }, (payload) => {
          if (cancelled) return;
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
          if (cancelled) return;
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
          if (cancelled) return;
          if (status !== "SUBSCRIBED") {
            snapshotLifecycle.handleStatus(status);
            return;
          }
          if (!isFocusAuthReady(confirmedAuthUserIdRef.current, userId)) return;
          requestCounterSnapshot(snapshotLifecycle.handleStatus(status));
        });
      counterChannelRef.current = channel;
      counterChannelRemovalPromiseRef.current = null;
    }

    void subscribeToCounterChannel();
    const refetchWhenVisible = () => requestCounterSnapshot(snapshotLifecycle.handleVisibilityChange(document.visibilityState));
    const refetch = (event: PageTransitionEvent) => requestCounterSnapshot(snapshotLifecycle.handlePageShow(event.persisted));
    const refetchWhenOnline = () => requestCounterSnapshot(snapshotLifecycle.handleOnline());
    const refetchWhenOffline = () => { snapshotLifecycle.handleOffline(); };
    document.addEventListener("visibilitychange", refetchWhenVisible);
    window.addEventListener("pageshow", refetch);
    window.addEventListener("online", refetchWhenOnline);
    window.addEventListener("offline", refetchWhenOffline);
    const broadcast = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("adhdice_focus_counter_sync") : null;
    if (broadcast) broadcast.onmessage = () => requestCounterSnapshot(snapshotLifecycle.handleBroadcast());
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", refetchWhenVisible);
      window.removeEventListener("pageshow", refetch);
      window.removeEventListener("online", refetchWhenOnline);
      window.removeEventListener("offline", refetchWhenOffline);
      broadcast?.close();
      snapshotLifecycle.dispose();
      const channel = counterChannelRef.current;
      counterChannelRef.current = null;
      if (channel) {
        counterChannelRemovalPromiseRef.current = removeRealtimeChannel(channel);
      }
    };
  }, [client, hydrateFocusCounters, isFocusAuthReadyForUser, removeRealtimeChannel, replaceFocusCounterState, setMessage, userId]);

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
    const completionResult = completedResult as FocusRuntimeRpcResult;
    if (completionResult.runtime) applyRuntimeRow(completionResult.runtime);
    const inserted = completionResult.completed_session;
    if (!inserted) { setMessage({ tone: "warn", text: "Focus session saved, but the response was empty." }); return; }

    const nextEntry = {
      ...mapFocusSessionRow(inserted),
      title: data?.title ?? category.title,
      focusType: data?.focusType ?? category.focusType,
      focusSubtype: data?.focusSubtype ?? category.focusSubtype,
      focusSubtype2: data?.focusSubtype2 ?? category.focusSubtype2,
    };

    const previousHistorySnapshot = focusHistory;
    const nextHistorySnapshot = upsertFocusHistoryEntry(focusHistory, nextEntry);
    focusHistoryRef.current = nextHistorySnapshot;
    setFocusHistory((prev) => {
      const nextHistory = upsertFocusHistoryEntry(prev, nextEntry);
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
    if (!client || !userId) return false;

    if (!activeSessionsRef.current[categoryId]) return false;
    const result = await transitionFocusRuntime(categoryId, "adjust", { p_delta_seconds: deltaSeconds });
    if (result) setMessage({ tone: "good", text: "Timer adjusted." });
    return Boolean(result);
  }

  async function handleResetTimer(categoryId: string) {
    if (!client || !userId) return;

    const result = await transitionFocusRuntime(categoryId, "reset");
    if (result) setMessage({ tone: "good", text: "Timer reset." });
  }

  async function handleDeleteTimer(categoryId: string) {
    if (!client || !userId) return;

    if (!activeSessionsRef.current[categoryId]) return;
    const result = await transitionFocusRuntime(categoryId, "delete");
    if (result) setMessage({ tone: "good", text: "Timer deleted." });
  }

  async function handleManualFocusEntry(data: FocusManualEntryInput) {
    if (!client || !userId) return false;

    const completedAt = data.endedAt !== undefined
      ? data.endedAt
      : completionIsoFromDateTime(data.date, data.completionTime);
    const payload = {
      id: data.id ?? createBrowserUuidV4(),
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
      ...(Object.prototype.hasOwnProperty.call(data, "startedAt") ? { started_at: data.startedAt ?? null } : {}),
    };

    const { data: inserted, error } = await client
      .from("adhdice_focus_sessions")
      .insert(payload)
      .select("*")
      .single();

    if (error) { setMessage({ tone: "warn", text: error.message }); return false; }
    if (!inserted) { setMessage({ tone: "warn", text: "Focus entry saved, but the response was empty." }); return false; }

    const nextEntry = {
      ...mapFocusSessionRow(inserted),
      title: data.title,
      focusType: data.focusType,
      focusSubtype: data.focusSubtype,
      focusSubtype2: data.focusSubtype2,
    };
    const previousHistorySnapshot = focusHistory;
    const nextHistorySnapshot = upsertFocusHistoryEntry(focusHistory, nextEntry);
    setFocusHistory((prev) => {
      const nextHistory = upsertFocusHistoryEntry(prev, nextEntry);
      return nextHistory;
    });
    queueDailySurplusPrompt(previousHistorySnapshot, nextHistorySnapshot, nextEntry);
    setMessage({ tone: "good", text: "Focus entry saved." });
    return true;
  }

  async function handleManualFocusEntries(inputs: FocusManualEntryInput[]) {
    const failure = (error: string) => ({ success: false, rows: inputs.map((_, index) => ({ index, success: false, error })), error });
    if (inputs.length === 0) return { success: true, rows: [] };
    if (!client || !userId || !historyActive) return failure("Focus authority is not ready.");

    const operationGeneration = ++focusHistoryMutationGenerationRef.current;
    const validationErrors = new Map<number, string>();
    const validInputs: Array<{ index: number; input: FocusManualEntryInput }> = [];
    inputs.forEach((input, index) => {
      if (!input.title.trim()) {
        validationErrors.set(index, "Focus title is required.");
        return;
      }
      if (!input.focusType.trim()) {
        validationErrors.set(index, "Focus type is required.");
        return;
      }
      if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
        validationErrors.set(index, "Focus duration must be greater than zero.");
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !completionIsoFromDateTime(input.date, input.completionTime)) {
        validationErrors.set(index, "Choose a valid Focus date and completion time.");
        return;
      }
      if (input.categoryId !== null && !focusCategories.some((category) => category.id === input.categoryId)) {
        validationErrors.set(index, "Choose an existing saved Focus category or No saved category.");
        return;
      }
      validInputs.push({ index, input });
    });

    const payloads = validInputs.map(({ input }) => ({
      id: input.id ?? createBrowserUuidV4(),
      user_id: userId,
      category_id: input.categoryId,
      title_snapshot: sanitizeFocusLabel(input.title, "Untitled Session"),
      focus_type_snapshot: sanitizeFocusLabel(input.focusType, "Work"),
      focus_subtype_snapshot: sanitizeOptionalFocusLabel(input.focusSubtype),
      focus_subtype_2_snapshot: sanitizeOptionalFocusLabel(input.focusSubtype2),
      session_date: input.date,
      duration_seconds: input.durationSeconds,
      notes: input.notes || null,
      ended_at: input.endedAt !== undefined ? input.endedAt : completionIsoFromDateTime(input.date, input.completionTime),
      source: "manual" as const,
      ...(Object.prototype.hasOwnProperty.call(input, "startedAt") ? { started_at: input.startedAt ?? null } : {}),
    }));

    let inserted: DbFocusSession[] = [];
    let batchError: string | undefined;
    if (payloads.length > 0) {
      const response = await client
        .from("adhdice_focus_sessions")
        .upsert(payloads, { onConflict: "id" })
        .select("*");
      if (currentUserIdRef.current !== userId || operationGeneration !== focusHistoryMutationGenerationRef.current || !historyActive) {
        return failure("Focus operation is no longer active.");
      }
      if (response.error) {
        batchError = response.error.message;
        setMessage({ tone: "warn", text: response.error.message });
      } else {
        const responseById = new Map((response.data ?? []).map((row) => [row.id, row as DbFocusSession]));
        const missing = payloads.some((payload) => !responseById.has(payload.id));
        if (missing) {
          batchError = "Focus did not return every row after the batch write.";
          setMessage({ tone: "warn", text: batchError });
        } else {
          inserted = payloads.map((payload) => responseById.get(payload.id!)!).filter(Boolean);
        }
      }
    }

    const rows = inputs.map((_, index) => {
      const validationError = validationErrors.get(index);
      if (validationError) return { index, success: false, error: validationError };
      return { index, success: !batchError, ...(batchError ? { error: batchError } : {}) };
    });
    if (batchError || inserted.length !== validInputs.length) {
      return { success: false, rows, ...(batchError ? { error: batchError } : {}) };
    }

    const previousHistory = focusHistoryRef.current;
    let nextHistory = previousHistory;
    const nextEntries = inserted.map((row, index) => {
      const input = validInputs[index]?.input;
      const nextEntry = {
        ...mapFocusSessionRow(row),
        title: input?.title ?? row.title_snapshot,
        focusType: input?.focusType ?? row.focus_type_snapshot,
        focusSubtype: input?.focusSubtype ?? row.focus_subtype_snapshot ?? undefined,
        focusSubtype2: input?.focusSubtype2 ?? row.focus_subtype_2_snapshot ?? undefined,
      };
      const before = nextHistory;
      nextHistory = upsertFocusHistoryEntry(nextHistory, nextEntry);
      if (input && !isSystemCountdownCategoryId(nextEntry.categoryId)) {
        queueDailySurplusPrompt(before, nextHistory, nextEntry);
      }
      return nextEntry;
    });
    if (currentUserIdRef.current !== userId || operationGeneration !== focusHistoryMutationGenerationRef.current || !historyActive) {
      return failure("Focus operation is no longer active.");
    }
    focusHistoryRef.current = nextHistory;
    setFocusHistory(nextHistory);
    setMessage({ tone: "good", text: `${nextEntries.length} Focus session${nextEntries.length === 1 ? "" : "s"} saved.` });
    if (typeof BroadcastChannel !== "undefined") {
      const broadcast = new BroadcastChannel("adhdice_focus_sync");
      broadcast.postMessage("finish");
      broadcast.close();
    }
    return { success: rows.every((row) => row.success), rows };
  }

  async function handleSaveCategories(categories: FocusCategory[]) {
    if (!client || !userId) return false;

    const uniqueCategories = normalizeFocusCategoriesForPersistence(
      dedupeCategoriesByName(categories),
      createBrowserUuidV4,
    );

    if (uniqueCategories.length === 0) {
      invalidateFocusDomainGeneration();
      setFocusCategories([]);
      saveFocusCategories([]);
      setMessage({ tone: "good", text: "Focus categories updated." });
      return true;
    }

    invalidateFocusDomainGeneration();
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

    invalidateFocusDomainGeneration();
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
      startedAt?: string | null;
      endedAt?: string | null;
      notes: string;
    },
  ): Promise<boolean> {
    if (!client || !userId) return false;

    const completedAt = data.endedAt !== undefined
      ? data.endedAt
      : completionIsoFromDateTime(data.date, data.completionTime);
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
      ...(Object.prototype.hasOwnProperty.call(data, "startedAt") ? { started_at: data.startedAt ?? null } : {}),
    };

    const { data: updated, error } = await client
      .from("adhdice_focus_sessions")
      .update(payload)
      .eq("id", entryId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) { setMessage({ tone: "warn", text: error.message }); return false; }
    if (!updated) { setMessage({ tone: "warn", text: "Focus entry updated, but the response was empty." }); return false; }

    const nextEntry = {
      ...mapFocusSessionRow(updated),
      title: data.title,
      focusType: data.focusType,
      focusSubtype: data.focusSubtype,
      focusSubtype2: data.focusSubtype2,
    };
    let nextHistorySnapshot: HistoricalFocusSession[] = [];
    setFocusHistory((prev) => {
      const nextHistory = prev.map((entry) => (entry.id === entryId ? nextEntry : entry));
      nextHistorySnapshot = nextHistory;
      return nextHistory;
    });
    queueDailySurplusPrompt(focusHistory, nextHistorySnapshot, nextEntry);
    setMessage({ tone: "good", text: "Focus entry updated." });
    return true;
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
    focusReallocationMode,
    setFocusReallocationMode,
    setFocusHistory,
    suppressCategoryReload,
    handleToggleTimer,
    handleSetCountdownTarget,
    handleFinishTimer,
    handleAdjustTimer,
    handleResetTimer,
    handleDeleteTimer,
    handleManualFocusEntry,
    handleManualFocusEntries,
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
