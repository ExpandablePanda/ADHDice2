"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import type {
  Pursuit,
  PursuitActivity,
  PursuitActivityInsert,
  PursuitInsert,
  PursuitUpdate,
} from "@/lib/database.types";
import { getPursuitLogicalDay, getPursuitTimestampForLogicalDay, validatePursuitParentSelection } from "@/lib/pursuit-domain";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
type RequiredSupabaseClient = NonNullable<SupabaseClient>;
type Message = { text: string; tone: "neutral" | "good" | "warn" };

type PursuitCompletionOptions = {
  notes?: string;
};

export type PursuitCreateInput = Pick<PursuitInsert, "notes" | "parent_pursuit_id" | "parent_task_id" | "revisit_interval_days" | "tags" | "title">;
export type PursuitLogicalDaySettings = { dayStartTime: string; timezone: string };

export function isMissingPursuitTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("adhdice_pursuits")
    || message.includes("adhdice_pursuit_activities")
    || message.includes("PGRST205")
    || message.includes("42P01");
}

function getPursuitErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error ?? "Unknown Pursuit error");
}

function getActivityForLogicalDay(
  activities: ReadonlyArray<PursuitActivity>,
  pursuitId: string,
  logicalDaySettings: PursuitLogicalDaySettings,
  logicalDay: string,
) {
  return activities
    .filter((activity) => (
      activity.pursuit_id === pursuitId
      && getPursuitLogicalDay(activity.occurred_at, logicalDaySettings) === logicalDay
    ))
    .sort((left, right) => (
      right.occurred_at.localeCompare(left.occurred_at)
      || right.created_at.localeCompare(left.created_at)
      || right.id.localeCompare(left.id)
    ))[0] ?? null;
}

async function hasOwnedTask(client: RequiredSupabaseClient, userId: string, taskId: string) {
  const result = await client
    .from("adhdice_clean_tasks")
    .select("id")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();
  return !result.error && Boolean(result.data);
}

export function usePursuits(
  client: SupabaseClient,
  userId: string | null,
  setMessage?: (value: Message | null) => void,
  active = true,
  logicalDaySettings: PursuitLogicalDaySettings = { dayStartTime: "06:00", timezone: "UTC" },
) {
  const [pursuits, setPursuits] = useState<Pursuit[]>([]);
  const [activities, setActivities] = useState<PursuitActivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completionLocksRef = useRef(new Set<string>());

  const reportError = useCallback((nextError: unknown) => {
    const message = isMissingPursuitTableError(nextError)
      ? "Pursuits are waiting for the 7.13 database migration."
      : getPursuitErrorMessage(nextError);
    setError(message);
    setMessage?.({ tone: "warn", text: message });
    return null;
  }, [setMessage]);

  const refresh = useCallback(async () => {
    if (!client || !userId || !active) {
      if (!userId) {
        setPursuits([]);
        setActivities([]);
      }
      return false;
    }

    setIsLoading(true);
    setError(null);
    const [pursuitsResult, activitiesResult] = await Promise.all([
      client
        .from("adhdice_pursuits")
        .select("*")
        .eq("user_id", userId)
        .order("parent_pursuit_id", { ascending: true, nullsFirst: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      client
        .from("adhdice_pursuit_activities")
        .select("*")
        .eq("user_id", userId)
        .order("occurred_at", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

    if (pursuitsResult.error || activitiesResult.error) {
      reportError(pursuitsResult.error ?? activitiesResult.error);
      setIsLoading(false);
      return false;
    }

    setPursuits((pursuitsResult.data ?? []) as Pursuit[]);
    setActivities((activitiesResult.data ?? []) as PursuitActivity[]);
    setIsLoading(false);
    return true;
  }, [active, client, reportError, userId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        void refresh();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const createPursuit = useCallback(async (input: PursuitCreateInput) => {
    if (!client || !userId) return null;
    const title = input.title.trim();
    if (!title) {
      reportError("A Pursuit title is required.");
      return null;
    }
    const parentPursuitId = input.parent_pursuit_id ?? null;
    const parentTaskId = input.parent_task_id ?? null;
    const validationError = validatePursuitParentSelection(pursuits, "", parentPursuitId, parentTaskId);
    if (validationError) {
      reportError(validationError);
      return null;
    }
    if (parentTaskId && !(await hasOwnedTask(client, userId, parentTaskId))) {
      reportError("That Task parent does not belong to this user or no longer exists.");
      return null;
    }

    const payload: PursuitInsert = {
      user_id: userId,
      parent_pursuit_id: parentPursuitId,
      parent_task_id: parentTaskId,
      title,
      notes: input.notes?.trim() || null,
      tags: input.tags ?? [],
      status: "active",
      revisit_interval_days: input.revisit_interval_days ?? null,
      sort_order: pursuits.length,
    };
    const result = await client.from("adhdice_pursuits").insert(payload).select("*").single();
    if (result.error || !result.data) {
      return reportError(result.error ?? "Pursuit could not be created.");
    }
    const nextPursuit = result.data as Pursuit;
    setPursuits((current) => [...current, nextPursuit]);
    setMessage?.({ tone: "good", text: "Pursuit created." });
    return nextPursuit;
  }, [client, reportError, pursuits, setMessage, userId]);

  const updatePursuit = useCallback(async (pursuitId: string, input: PursuitUpdate) => {
    if (!client || !userId) return null;
    const existing = pursuits.find((pursuit) => pursuit.id === pursuitId);
    if (!existing) return null;
    if (input.title !== undefined && !input.title.trim()) {
      reportError("A Pursuit title is required.");
      return null;
    }
    const nextParentPursuitId = input.parent_pursuit_id !== undefined
      ? input.parent_pursuit_id
      : input.parent_task_id !== undefined ? null : existing.parent_pursuit_id;
    const nextParentTaskId = input.parent_task_id !== undefined
      ? input.parent_task_id
      : input.parent_pursuit_id !== undefined ? null : existing.parent_task_id;
    const validationError = validatePursuitParentSelection(pursuits, pursuitId, nextParentPursuitId, nextParentTaskId);
    if (validationError) {
      reportError(validationError);
      return null;
    }
    if (nextParentTaskId && !(await hasOwnedTask(client, userId, nextParentTaskId))) {
      reportError("That Task parent does not belong to this user or no longer exists.");
      return null;
    }

    const payload: PursuitUpdate = {
      ...input,
      parent_pursuit_id: nextParentPursuitId,
      parent_task_id: nextParentTaskId,
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
    };
    const result = await client
      .from("adhdice_pursuits")
      .update(payload)
      .eq("id", pursuitId)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (result.error || !result.data) {
      return reportError(result.error ?? "Pursuit could not be updated.");
    }
    const nextPursuit = result.data as Pursuit;
    setPursuits((current) => current.map((pursuit) => pursuit.id === pursuitId ? nextPursuit : pursuit));
    setMessage?.({ tone: "good", text: "Pursuit updated." });
    return nextPursuit;
  }, [client, pursuits, reportError, setMessage, userId]);

  const updateExistingCompletion = useCallback(async (existing: PursuitActivity, options: PursuitCompletionOptions) => {
    if (!client || !userId || options.notes === undefined) return existing;
    const nextNotes = options.notes.trim() || null;
    if (existing.notes === nextNotes) return existing;
    const result = await client
      .from("adhdice_pursuit_activities")
      .update({ notes: nextNotes })
      .eq("id", existing.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (result.error || !result.data) {
      reportError(result.error ?? "Pursuit completion note could not be saved.");
      return null;
    }
    const nextActivity = result.data as PursuitActivity;
    setActivities((current) => current.map((activity) => activity.id === nextActivity.id ? nextActivity : activity));
    return nextActivity;
  }, [client, reportError, userId]);

  const insertCompletion = useCallback(async (pursuitId: string, occurredAt: string, options: PursuitCompletionOptions = {}) => {
    if (!client || !userId || !pursuits.some((pursuit) => pursuit.id === pursuitId)) return null;
    const payload: PursuitActivityInsert = {
      user_id: userId,
      pursuit_id: pursuitId,
      occurred_at: occurredAt,
      duration_seconds: null,
      notes: options.notes?.trim() || null,
    };
    const result = await client.from("adhdice_pursuit_activities").insert(payload).select("*").single();
    if (result.error || !result.data) {
      return reportError(result.error ?? "Pursuit completion could not be saved.");
    }
    const nextActivity = result.data as PursuitActivity;
    setActivities((current) => [nextActivity, ...current].sort((left, right) => right.occurred_at.localeCompare(left.occurred_at)));
    setMessage?.({ tone: "good", text: "Pursuit marked done today." });
    return nextActivity;
  }, [client, pursuits, reportError, setMessage, userId]);

  const markDoneToday = useCallback(async (pursuitId: string, notes?: string) => {
    const todayKey = getPursuitLogicalDay(new Date(), logicalDaySettings);
    const lockKey = `${pursuitId}:${todayKey}`;
    const existing = getActivityForLogicalDay(activities, pursuitId, logicalDaySettings, todayKey);
    if (existing) return updateExistingCompletion(existing, { notes });
    if (completionLocksRef.current.has(lockKey)) return null;
    completionLocksRef.current.add(lockKey);
    try {
      return await insertCompletion(pursuitId, new Date().toISOString(), { notes });
    } finally {
      completionLocksRef.current.delete(lockKey);
    }
  }, [activities, insertCompletion, logicalDaySettings, updateExistingCompletion]);

  const markCompletedOnLogicalDay = useCallback(async (pursuitId: string, logicalDay: string, notes?: string) => {
    const existing = getActivityForLogicalDay(activities, pursuitId, logicalDaySettings, logicalDay);
    if (existing) return updateExistingCompletion(existing, { notes });
    const lockKey = `${pursuitId}:${logicalDay}`;
    if (completionLocksRef.current.has(lockKey)) return null;
    completionLocksRef.current.add(lockKey);
    try {
      return await insertCompletion(pursuitId, getPursuitTimestampForLogicalDay(logicalDay, logicalDaySettings), { notes });
    } finally {
      completionLocksRef.current.delete(lockKey);
    }
  }, [activities, insertCompletion, logicalDaySettings, updateExistingCompletion]);

  const removeCompletionOnLogicalDay = useCallback(async (pursuitId: string, logicalDay: string) => {
    if (!client || !userId) return false;
    const activityIds = activities
      .filter((activity) => (
        activity.pursuit_id === pursuitId
        && getPursuitLogicalDay(activity.occurred_at, logicalDaySettings) === logicalDay
      ))
      .map((activity) => activity.id);
    if (activityIds.length === 0) return true;
    const result = await client
      .from("adhdice_pursuit_activities")
      .delete()
      .eq("user_id", userId)
      .eq("pursuit_id", pursuitId)
      .in("id", activityIds);
    if (result.error) {
      reportError(result.error);
      return false;
    }
    const removedIds = new Set(activityIds);
    setActivities((current) => current.filter((activity) => !removedIds.has(activity.id)));
    setMessage?.({ tone: "good", text: "Pursuit completion removed." });
    return true;
  }, [activities, client, logicalDaySettings, reportError, setMessage, userId]);

  return {
    activities,
    createPursuit,
    error,
    isLoading,
    markCompletedOnLogicalDay,
    markDoneToday,
    removeCompletionOnLogicalDay,
    pursuits,
    refresh,
    updatePursuit,
  };
}
