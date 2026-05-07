import { useState, useRef } from "react";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import type { FocusCategory, ActiveFocusSession, HistoricalFocusSession, FocusType, FocusSubtype } from "@/lib/types";
import type { FocusCategory as DbFocusCategory } from "@/lib/database.types";
import type { AppendEconomyEventOpts } from "@/hooks/useEconomy";
import { todayISO } from "@/lib/utils";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
type SetMessage = (msg: { tone: "neutral" | "good" | "warn"; text: string } | null) => void;

// ─── Storage keys ─────────────────────────────────────────────────────────────

const FOCUS_CATEGORIES_STORAGE_KEY = "adhdice_focus_categories";
const FOCUS_HISTORY_STORAGE_KEY = "adhdice_focus_history";

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

export function saveFocusCategories(categories: FocusCategory[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FOCUS_CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
}

export function saveFocusHistory(history: HistoricalFocusSession[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FOCUS_HISTORY_STORAGE_KEY, JSON.stringify(history));
}

function sanitizeFocusLabel(value: string | null | undefined, fallback: string) {
  const trimmed = (value ?? "").trim();
  return trimmed || fallback;
}

function sanitizeOptionalFocusLabel(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeCategoryTitle(value: string) {
  return value.trim().toLowerCase();
}

function preferStoredValue(storedValue: string | null | undefined, currentValue: string | null | undefined) {
  const normalizedStoredValue = sanitizeFocusLabel(storedValue, "");
  const normalizedCurrentValue = sanitizeFocusLabel(currentValue, "");
  return normalizedCurrentValue || normalizedStoredValue;
}

function preferStoredOptionalValue(storedValue: string | null | undefined, currentValue: string | null | undefined) {
  const normalizedStoredValue = sanitizeFocusLabel(storedValue, "");
  const normalizedCurrentValue = sanitizeFocusLabel(currentValue, "");
  return normalizedCurrentValue || normalizedStoredValue || null;
}

function dedupeCategoriesByName(categories: FocusCategory[]) {
  return Array.from(
    categories.reduce((accumulator, category) => {
      const normalizedTitle = normalizeCategoryTitle(category.title);
      if (!normalizedTitle) return accumulator;
      accumulator.set(normalizedTitle, category);
      return accumulator;
    }, new Map<string, FocusCategory>()).values(),
  );
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
): Record<string, ActiveFocusSession> {
  return rows.reduce<Record<string, ActiveFocusSession>>((accumulator, row) => {
    accumulator[row.category_id] = {
      categoryId: row.category_id,
      startTime: row.start_time ? Date.parse(row.start_time) : null,
      accumulatedSeconds: row.accumulated_seconds,
      isRunning: row.is_running,
    };
    return accumulator;
  }, {});
}

export function mapFocusSessionRow(row: {
  id: string;
  category_id: string | null;
  title_snapshot: string;
  focus_type_snapshot: FocusType;
  focus_subtype_snapshot?: FocusSubtype | null;
  focus_subtype_2_snapshot?: FocusSubtype | null;
  session_date: string;
  duration_seconds: number;
  notes: string | null;
  created_at?: string;
}): HistoricalFocusSession {
  return {
    id: row.id,
    categoryId: row.category_id,
    title: row.title_snapshot,
    date: row.session_date,
    durationSeconds: row.duration_seconds,
    focusType: row.focus_type_snapshot,
    focusSubtype: row.focus_subtype_snapshot ?? undefined,
    focusSubtype2: row.focus_subtype_2_snapshot ?? undefined,
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
  const suppressCategoryReload = useRef(false);

  async function handleToggleTimer(categoryId: string) {
    if (!client || !userId) return;

    const current = activeSessions[categoryId] ?? {
      categoryId,
      startTime: null,
      accumulatedSeconds: 0,
      isRunning: false,
    };
    const now = Date.now();
    const nextSession = current.isRunning
      ? {
          ...current,
          isRunning: false,
          startTime: null,
          accumulatedSeconds: current.accumulatedSeconds +
            (current.startTime ? Math.floor((now - current.startTime) / 1000) : 0),
        }
      : { ...current, isRunning: true, startTime: now };

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

    if (error) {
      setMessage({ tone: "warn", text: error.message });
    } else if (typeof BroadcastChannel !== "undefined") {
      new BroadcastChannel("adhdice_focus_sync").postMessage("toggle");
    }
  }

  async function handleFinishTimer(
    categoryId: string,
    data?: { title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; notes: string },
  ) {
    if (!client || !userId) return;

    const activeSession = activeSessions[categoryId];
    if (!activeSession) return;

    const category = focusCategories.find((entry) => entry.id === categoryId);
    if (!category) return;

    const now = Date.now();
    const elapsed = activeSession.isRunning && activeSession.startTime
      ? Math.floor((now - activeSession.startTime) / 1000)
      : 0;
    const totalSeconds = activeSession.accumulatedSeconds + elapsed;
    if (totalSeconds < 1) return;

    const completedAt = new Date(now).toISOString();
    const payload = {
      user_id: userId,
      category_id: categoryId,
      title_snapshot: sanitizeFocusLabel(data?.title ?? category.title, "Untitled Session"),
      focus_type_snapshot: sanitizeFocusLabel(data?.focusType ?? category.focusType, "Work"),
      focus_subtype_snapshot: sanitizeOptionalFocusLabel(data?.focusSubtype ?? category.focusSubtype),
      focus_subtype_2_snapshot: sanitizeOptionalFocusLabel(data?.focusSubtype2 ?? category.focusSubtype2),
      session_date: todayISO(),
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

    const { error: deleteError } = await client
      .from("adhdice_focus_active_sessions")
      .delete()
      .eq("user_id", userId)
      .eq("category_id", categoryId);

    if (deleteError) { setMessage({ tone: "warn", text: deleteError.message }); return; }

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
        points: focusMinutes,
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
    const nextAccumulated = Math.max(0, current.accumulatedSeconds + deltaSeconds);
    const nextSession: ActiveFocusSession = { ...current, accumulatedSeconds: nextAccumulated };

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

    setMessage({ tone: "good", text: "Timer adjusted." });
    if (typeof BroadcastChannel !== "undefined") {
      new BroadcastChannel("adhdice_focus_sync").postMessage("adjust");
    }
  }

  async function handleResetTimer(categoryId: string) {
    if (!client || !userId) return;

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
    setMessage({ tone: "good", text: "Timer reset." });
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
      id: isUuid(category.id) ? category.id : crypto.randomUUID(),
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

  return {
    focusCategories,
    setFocusCategories,
    activeSessions,
    setActiveSessions,
    focusHistory,
    setFocusHistory,
    suppressCategoryReload,
    handleToggleTimer,
    handleFinishTimer,
    handleAdjustTimer,
    handleResetTimer,
    handleManualFocusEntry,
    handleSaveCategories,
    handleDeleteFocusCategory,
    handleUpdateFocusHistoryEntry,
    handleDeleteFocusHistoryEntry,
  };
}
