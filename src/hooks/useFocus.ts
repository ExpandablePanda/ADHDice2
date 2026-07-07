import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import type { FocusCategory, ActiveFocusSession, HistoricalFocusSession, FocusCounter, FocusCounterHistoryEntry, FocusType, FocusSubtype } from "@/lib/types";
import type { FocusCategory as DbFocusCategory, FocusSession as DbFocusSession } from "@/lib/database.types";
import type { AppendEconomyEventOpts } from "@/hooks/useEconomy";
import {
  adjustActiveFocusSession,
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

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
type SetMessage = (msg: { tone: "neutral" | "good" | "warn"; text: string } | null) => void;

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
  return parseStoredJson<FocusCounter[]>(getFocusCountersStorageKey(userId), []);
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
  };
}

export function mapActiveSessions(
  rows: Array<{
    category_id: string;
    start_time: string | null;
    accumulated_seconds: number;
    is_running: boolean;
  }>,
  userId?: string | null,
): Record<string, ActiveFocusSession> {
  const countdownMetadata = readCountdownMetadata();
  const sessions = rows.reduce<Record<string, ActiveFocusSession>>((accumulator, row) => {
    const metadata = countdownMetadata[row.category_id];
    accumulator[row.category_id] = {
      categoryId: row.category_id,
      startTime: row.start_time ? Date.parse(row.start_time) : null,
      accumulatedSeconds: row.accumulated_seconds,
      isRunning: row.is_running,
      mode: metadata?.mode === "countdown" ? "countdown" : "countup",
      countdownTargetSeconds: metadata?.mode === "countdown" ? metadata.targetSeconds ?? null : null,
    };
    return accumulator;
  }, {});
  const localCountdownSession = readLocalActiveSession(userId);
  if (localCountdownSession) {
    sessions[localCountdownSession.categoryId] = localCountdownSession;
  }
  return sessions;
}

export function mapFocusSessionRow(row: DbFocusSession): HistoricalFocusSession {
  return {
    id: row.id,
    categoryId: row.category_id,
    title: row.title_snapshot,
    date: row.session_date,
    durationSeconds: row.duration_seconds,
    focusType: row.focus_type_snapshot as FocusType,
    focusSubtype: row.focus_subtype_snapshot ? row.focus_subtype_snapshot as FocusSubtype : undefined,
    focusSubtype2: row.focus_subtype_2_snapshot ? row.focus_subtype_2_snapshot as FocusSubtype : undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
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
    };
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFocus(
  client: SupabaseClient,
  userId: string | null,
  setMessage: SetMessage,
  appendEconomyEvent: (opts: AppendEconomyEventOpts) => Promise<void>,
) {
  const [focusCategories, setFocusCategories] = useState<FocusCategory[]>([]);
  const [activeSessions, setActiveSessions] = useState<Record<string, ActiveFocusSession>>({});
  const [focusHistory, setFocusHistory] = useState<HistoricalFocusSession[]>([]);
  const [focusCounterState, setFocusCounterState] = useState<FocusCounterState>({ counters: [], history: [], ownerUserId: null });
  const suppressCategoryReload = useRef(false);
  const focusCounters = focusCounterState.ownerUserId === userId ? focusCounterState.counters : [];
  const focusCounterHistory = focusCounterState.ownerUserId === userId ? focusCounterState.history : [];

  const setFocusCounters: Dispatch<SetStateAction<FocusCounter[]>> = (updater) => {
    setFocusCounterState((current) => {
      const nextCounters = typeof updater === "function"
        ? updater(current.counters)
        : updater;
      saveFocusCounters(userId, nextCounters);
      return {
        ...current,
        counters: nextCounters,
      };
    });
  };

  useEffect(() => {
    const nextState = !userId
      ? { counters: [], history: [], ownerUserId: null }
      : {
          counters: readFocusCounters(userId),
          history: readFocusCounterHistory(userId),
          ownerUserId: userId,
        };
    const timeoutId = window.setTimeout(() => {
      setFocusCounterState(nextState);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [userId]);

  async function persistActiveSession(categoryId: string, nextSession: ActiveFocusSession) {
    if (!client || !userId) return false;

    if (isSystemCountdownCategoryId(categoryId)) {
      writeLocalActiveSession(userId, nextSession);
      persistCountdownMetadata(categoryId, nextSession);
      if (typeof BroadcastChannel !== "undefined") {
        new BroadcastChannel("adhdice_focus_sync").postMessage("toggle");
      }
      return true;
    }

    const { error } = await client
      .from("adhdice_focus_active_sessions")
      .upsert(
        {
          user_id: userId,
          category_id: categoryId,
          start_time: nextSession.startTime ? new Date(nextSession.startTime).toISOString() : null,
          accumulated_seconds: nextSession.accumulatedSeconds,
          is_running: nextSession.isRunning,
        },
        { onConflict: "user_id,category_id" },
      );

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }
    persistCountdownMetadata(categoryId, nextSession);
    if (typeof BroadcastChannel !== "undefined") {
      new BroadcastChannel("adhdice_focus_sync").postMessage("toggle");
    }
    return true;
  }

  async function handleToggleTimer(categoryId: string, options?: { countdownTargetSeconds?: number | null; mode?: "countdown" | "countup" }) {
    if (!client || !userId) return;

    const current = activeSessions[categoryId] ?? {
      categoryId,
      startTime: null,
      accumulatedSeconds: 0,
      isRunning: false,
      mode: options?.mode ?? "countup",
      countdownTargetSeconds: options?.countdownTargetSeconds ?? null,
    };
    const now = Date.now();
    const shouldCreateCountdown = !activeSessions[categoryId] && options?.mode === "countdown";
    const nextSession = shouldCreateCountdown
      ? {
          ...current,
          isRunning: false,
          startTime: null,
          mode: "countdown" as const,
          countdownTargetSeconds: options?.countdownTargetSeconds ?? null,
        }
      : current.isRunning
      ? {
          ...current,
          isRunning: false,
          startTime: null,
          accumulatedSeconds: current.accumulatedSeconds +
            (current.startTime ? Math.floor((now - current.startTime) / 1000) : 0),
        }
      : {
          ...current,
          isRunning: true,
          startTime: now,
          mode: shouldCreateCountdown ? "countdown" : current.mode ?? "countup",
          countdownTargetSeconds: shouldCreateCountdown ? options.countdownTargetSeconds ?? null : current.countdownTargetSeconds ?? null,
        };

    setActiveSessions((prev) => ({ ...prev, [categoryId]: nextSession }));
    await persistActiveSession(categoryId, nextSession);
  }

  async function handleSetCountdownTarget(categoryId: string, targetSeconds: number, options?: { start?: boolean }) {
    if (!client || !userId) return;

    const current = activeSessions[categoryId];
    if (!current) return;

    const nextTargetSeconds = Math.max(60, targetSeconds);
    const shouldStart = options?.start === true;
    const nextStartTime = shouldStart ? Date.now() : current.isRunning ? Date.now() : null;
    const nextSession: ActiveFocusSession = {
      ...current,
      mode: "countdown",
      countdownTargetSeconds: nextTargetSeconds,
      accumulatedSeconds: shouldStart
        ? 0
        : current.mode === "countdown"
        ? Math.min(current.accumulatedSeconds, nextTargetSeconds)
        : 0,
      isRunning: shouldStart ? true : current.isRunning,
      startTime: nextStartTime,
    };

    setActiveSessions((prev) => ({ ...prev, [categoryId]: nextSession }));
    const persisted = await persistActiveSession(categoryId, nextSession);
    if (persisted) {
      setMessage({ tone: "good", text: "Countdown updated." });
    }
  }

  async function handleFinishTimer(
    categoryId: string,
    data?: { title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; notes: string; date: string },
  ) {
    if (!client || !userId) return;
    if (isSystemCountdownCategoryId(categoryId)) return;

    const activeSession = activeSessions[categoryId];
    if (!activeSession) return;

    const category = resolveFocusCategory(categoryId, focusCategories);
    if (!category) return;

    const now = Date.now();
    const elapsed = activeSession.isRunning && activeSession.startTime
      ? Math.floor((now - activeSession.startTime) / 1000)
      : 0;
    const elapsedTotalSeconds = activeSession.accumulatedSeconds + elapsed;
    const totalSeconds = activeSession.mode === "countdown" && activeSession.countdownTargetSeconds
      ? Math.min(elapsedTotalSeconds, activeSession.countdownTargetSeconds)
      : elapsedTotalSeconds;
    if (totalSeconds < 1) return;

    const completedAt = new Date(now).toISOString();
    const payload = {
      user_id: userId,
      category_id: isSystemCountdownCategoryId(categoryId) ? null : categoryId,
      title_snapshot: sanitizeFocusLabel(data?.title ?? category.title, "Untitled Session"),
      focus_type_snapshot: sanitizeFocusLabel(data?.focusType ?? category.focusType, "Work"),
      focus_subtype_snapshot: sanitizeOptionalFocusLabel(data?.focusSubtype ?? category.focusSubtype),
      focus_subtype_2_snapshot: sanitizeOptionalFocusLabel(data?.focusSubtype2 ?? category.focusSubtype2),
      session_date: data?.date ?? (activeSession.startTime ? getLogicalDayKey(new Date(activeSession.startTime)) : todayISO()),
      duration_seconds: totalSeconds,
      notes: data?.notes || null,
      started_at: activeSession.startTime ? new Date(activeSession.startTime).toISOString() : null,
      ended_at: completedAt,
      source: "timer" as const,
    };

    const { data: inserted, error } = await client
      .from("adhdice_focus_sessions")
      .insert(payload)
      .select("*")
      .single();

    if (error) { setMessage({ tone: "warn", text: error.message }); return; }
    if (!inserted) { setMessage({ tone: "warn", text: "Focus session saved, but the response was empty." }); return; }

    let deleteError: { message: string } | null = null;
    if (!isSystemCountdownCategoryId(categoryId)) {
      const deleteResult = await client
        .from("adhdice_focus_active_sessions")
        .delete()
        .eq("user_id", userId)
        .eq("category_id", categoryId);
      deleteError = deleteResult.error;
    }

    if (deleteError) { setMessage({ tone: "warn", text: deleteError.message }); return; }
    persistCountdownMetadata(categoryId, null);
    if (isSystemCountdownCategoryId(categoryId)) {
      writeLocalActiveSession(userId, null);
    }

    const nextEntry = mergeStoredFocusHistory([
      {
        ...mapFocusSessionRow(inserted),
        title: data?.title ?? category.title,
        focusType: data?.focusType ?? category.focusType,
        focusSubtype: data?.focusSubtype ?? category.focusSubtype,
        focusSubtype2: data?.focusSubtype2 ?? category.focusSubtype2,
      },
    ])[0];

    setFocusHistory((prev) => {
      const nextHistory = [nextEntry, ...prev];
      saveFocusHistory(nextHistory);
      return nextHistory;
    });
    setActiveSessions((prev) => {
      const next = { ...prev };
      delete next[categoryId];
      return next;
    });
    setMessage({ tone: "good", text: "Focus session saved." });

    const focusMinutes = Math.floor(totalSeconds / 60);
    if (focusMinutes >= 1) {
      void appendEconomyEvent({
        source: "focus",
        refId: inserted.id,
        points: 0,
        xp: Math.floor(focusMinutes * 1.5),
        reason: `Focus session: ${focusMinutes}m`,
      });
    }

    if (typeof BroadcastChannel !== "undefined") {
      new BroadcastChannel("adhdice_focus_sync").postMessage("finish");
    }
  }

  async function handleAdjustTimer(categoryId: string, deltaSeconds: number) {
    if (!client || !userId) return;

    const current = activeSessions[categoryId] ?? {
      categoryId,
      startTime: null,
      accumulatedSeconds: 0,
      isRunning: false,
    };
    if (current.mode === "countdown" && current.countdownTargetSeconds) {
      const now = Date.now();
      const elapsed = current.isRunning && current.startTime
        ? Math.max(0, Math.floor((now - current.startTime) / 1000))
        : 0;
      const nextSession: ActiveFocusSession = {
        ...current,
        accumulatedSeconds: current.accumulatedSeconds + elapsed,
        countdownTargetSeconds: Math.max(60, current.countdownTargetSeconds + deltaSeconds),
        startTime: current.isRunning ? now : null,
      };
      setActiveSessions((prev) => ({ ...prev, [categoryId]: nextSession }));
      const persisted = await persistActiveSession(categoryId, nextSession);
      if (persisted) {
        setMessage({ tone: "good", text: "Timer adjusted." });
      }
      return;
    }

    const nextSession = adjustActiveFocusSession(current, deltaSeconds, Date.now());

    setActiveSessions((prev) => ({ ...prev, [categoryId]: nextSession }));

    const { error } = await client
      .from("adhdice_focus_active_sessions")
      .upsert(
        {
          user_id: userId,
          category_id: categoryId,
          start_time: nextSession.startTime ? new Date(nextSession.startTime).toISOString() : null,
          accumulated_seconds: nextSession.accumulatedSeconds,
          is_running: nextSession.isRunning,
        },
        { onConflict: "user_id,category_id" },
      );

    if (error) { setMessage({ tone: "warn", text: error.message }); return; }
    persistCountdownMetadata(categoryId, nextSession);

    setMessage({ tone: "good", text: "Timer adjusted." });
    if (typeof BroadcastChannel !== "undefined") {
      new BroadcastChannel("adhdice_focus_sync").postMessage("adjust");
    }
  }

  async function handleResetTimer(categoryId: string) {
    if (!client || !userId) return;

    if (isSystemCountdownCategoryId(categoryId)) {
      const current = activeSessions[categoryId];
      if (!current) return;

      const nextSession: ActiveFocusSession = {
        ...current,
        accumulatedSeconds: 0,
        isRunning: current.mode === "countdown" && Boolean(current.countdownTargetSeconds),
        startTime: current.mode === "countdown" && current.countdownTargetSeconds ? Date.now() : null,
      };
      setActiveSessions((prev) => ({ ...prev, [categoryId]: nextSession }));
      const persisted = await persistActiveSession(categoryId, nextSession);
      if (persisted) {
        setMessage({ tone: "good", text: "Timer reset." });
      }
      return;
    }

    const { error } = await client
      .from("adhdice_focus_active_sessions")
      .delete()
      .eq("user_id", userId)
      .eq("category_id", categoryId);

    if (error) { setMessage({ tone: "warn", text: error.message }); return; }

    setActiveSessions((prev) => {
      const next = { ...prev };
      delete next[categoryId];
      return next;
    });
    persistCountdownMetadata(categoryId, null);
    setMessage({ tone: "good", text: "Timer reset." });
  }

  async function handleDeleteTimer(categoryId: string) {
    if (!client || !userId) return;

    if (isSystemCountdownCategoryId(categoryId)) {
      setActiveSessions((prev) => {
        const next = { ...prev };
        delete next[categoryId];
        return next;
      });
      persistCountdownMetadata(categoryId, null);
      writeLocalActiveSession(userId, null);
      setMessage({ tone: "good", text: "Timer deleted." });
      if (typeof BroadcastChannel !== "undefined") {
        new BroadcastChannel("adhdice_focus_sync").postMessage("toggle");
      }
      return;
    }
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
  }) {
    if (!client || !userId) return false;

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
    setFocusHistory((prev) => {
      const nextHistory = [nextEntry, ...prev];
      saveFocusHistory(nextHistory);
      return nextHistory;
    });
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

    const nextCategories = (savedCategories ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(mapFocusCategoryRow);

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
      notes: string;
    },
  ) {
    if (!client || !userId) return;

    const payload = {
      category_id: data.categoryId,
      title_snapshot: sanitizeFocusLabel(data.title, "Untitled Session"),
      focus_type_snapshot: sanitizeFocusLabel(data.focusType, "Work"),
      focus_subtype_snapshot: sanitizeOptionalFocusLabel(data.focusSubtype),
      focus_subtype_2_snapshot: sanitizeOptionalFocusLabel(data.focusSubtype2),
      session_date: data.date,
      duration_seconds: data.durationSeconds,
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
    setFocusHistory((prev) => {
      const nextHistory = prev.map((entry) => (entry.id === entryId ? nextEntry : entry));
      saveFocusHistory(nextHistory);
      return nextHistory;
    });
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

  function handleCreateFocusCounter(input: {
    color: string;
    goal: number;
    icon: string;
    initialValue: number;
    step: number;
    title: string;
  }) {
    const timestamp = new Date().toISOString();
    const nextCounter: FocusCounter = {
      color: input.color,
      createdAt: timestamp,
      goal: Math.max(1, Math.floor(input.goal)),
      icon: input.icon.trim() || "Hash",
      id: createClientSideId("focus-counter"),
      step: Math.max(1, Math.floor(input.step)),
      title: input.title.trim() || "Counter",
      updatedAt: timestamp,
      value: Math.floor(input.initialValue),
    };
    setFocusCounters((prev) => {
      const nextCounters = [nextCounter, ...prev];
      saveFocusCounters(userId, nextCounters);
      return nextCounters;
    });
    setMessage({ tone: "good", text: "Counter created." });
  }

  function handleUpdateFocusCounter(counterId: string, updates: Partial<Pick<FocusCounter, "color" | "goal" | "icon" | "step" | "title" | "value">>) {
    setFocusCounters((prev) => {
      const nextCounters = prev.map((counter) => (
        counter.id === counterId
          ? {
              ...counter,
              ...updates,
              goal: updates.goal !== undefined ? Math.max(1, Math.floor(updates.goal)) : counter.goal,
              step: updates.step !== undefined ? Math.max(1, Math.floor(updates.step)) : counter.step,
              title: updates.title !== undefined ? (updates.title.trim() || counter.title) : counter.title,
              value: updates.value !== undefined ? Math.floor(updates.value) : counter.value,
              updatedAt: new Date().toISOString(),
            }
          : counter
      ));
      saveFocusCounters(userId, nextCounters);
      return nextCounters;
    });
    setMessage({ tone: "good", text: "Counter updated." });
  }

  function handleDeleteFocusCounter(counterId: string) {
    const targetCounter = focusCounters.find((counter) => counter.id === counterId);
    if (!targetCounter) {
      return;
    }
    if (!window.confirm(`Delete "${targetCounter.title}"? This cannot be undone.`)) {
      return;
    }
    setFocusCounterState((current) => {
      if (current.ownerUserId !== userId) {
        return current;
      }
      const nextCounters = current.counters.filter((counter) => counter.id !== counterId);
      const nextHistory = current.history.filter((entry) => entry.counterId !== counterId);
      saveFocusCounters(userId, nextCounters);
      saveFocusCounterHistory(userId, nextHistory);
      return {
        counters: nextCounters,
        history: nextHistory,
        ownerUserId: current.ownerUserId,
      };
    });
    setMessage({ tone: "good", text: "Counter deleted." });
  }

  function handleAdjustFocusCounter(counterId: string, direction: 1 | -1) {
    setFocusCounterState((current) => {
      if (current.ownerUserId !== userId) {
        return current;
      }
      const targetCounter = current.counters.find((counter) => counter.id === counterId);
      if (!targetCounter) {
        return current;
      }

      const delta = targetCounter.step * direction;
      const nextValue = targetCounter.value + delta;
      const timestamp = new Date().toISOString();
      const nextCounters = current.counters.map((counter) => (
        counter.id === counterId
          ? { ...counter, updatedAt: timestamp, value: nextValue }
          : counter
      ));
      const historyEntry: FocusCounterHistoryEntry = {
        counterId,
        counterTitleSnapshot: targetCounter.title,
        createdAt: timestamp,
        delta,
        id: createClientSideId("focus-counter-history"),
        nextValue,
        stepSnapshot: targetCounter.step,
      };
      const nextHistory = [historyEntry, ...current.history].slice(0, 120);
      saveFocusCounters(userId, nextCounters);
      saveFocusCounterHistory(userId, nextHistory);
      return {
        counters: nextCounters,
        history: nextHistory,
        ownerUserId: current.ownerUserId,
      };
    });
  }

  return {
    focusCategories,
    focusCounters,
    focusCounterHistory,
    setFocusCategories,
    setFocusCounters,
    activeSessions,
    setActiveSessions,
    focusHistory,
    setFocusHistory,
    suppressCategoryReload,
    handleToggleTimer,
    handleSetCountdownTarget,
    handleFinishTimer,
    handleAdjustTimer,
    handleResetTimer,
    handleDeleteTimer,
    handleManualFocusEntry,
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
