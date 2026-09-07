"use client";

import { useCallback, useEffect, useState } from "react";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import type {
  Pursuit,
  PursuitActivity,
  PursuitActivityInsert,
  PursuitInsert,
  PursuitUpdate,
} from "@/lib/database.types";
import { canSetPursuitParent } from "@/lib/pursuit-domain";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
type Message = { text: string; tone: "neutral" | "good" | "warn" };

export type PursuitCreateInput = Pick<PursuitInsert, "notes" | "parent_pursuit_id" | "revisit_interval_days" | "title">;
export type PursuitActivityInput = Omit<Pick<PursuitActivityInsert, "duration_seconds" | "notes" | "occurred_at" | "pursuit_id">, "occurred_at"> & {
  occurred_at?: string;
};

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

export function usePursuits(
  client: SupabaseClient,
  userId: string | null,
  setMessage?: (value: Message | null) => void,
  active = true,
) {
  const [pursuits, setPursuits] = useState<Pursuit[]>([]);
  const [activities, setActivities] = useState<PursuitActivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (input.parent_pursuit_id && !canSetPursuitParent(pursuits, "", input.parent_pursuit_id)) {
      reportError("That Pursuit parent would create a hierarchy cycle.");
      return null;
    }

    const payload: PursuitInsert = {
      user_id: userId,
      parent_pursuit_id: input.parent_pursuit_id ?? null,
      title,
      notes: input.notes?.trim() || null,
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
    if (input.parent_pursuit_id !== undefined && !canSetPursuitParent(pursuits, pursuitId, input.parent_pursuit_id)) {
      reportError("A Pursuit cannot be its own parent or a child of its descendants.");
      return null;
    }

    const payload: PursuitUpdate = {
      ...input,
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

  const logActivity = useCallback(async (input: PursuitActivityInput) => {
    if (!client || !userId || !pursuits.some((pursuit) => pursuit.id === input.pursuit_id)) return null;
    const payload: PursuitActivityInsert = {
      user_id: userId,
      pursuit_id: input.pursuit_id,
      occurred_at: input.occurred_at ?? new Date().toISOString(),
      duration_seconds: input.duration_seconds ?? null,
      notes: input.notes?.trim() || null,
    };
    const result = await client.from("adhdice_pursuit_activities").insert(payload).select("*").single();
    if (result.error || !result.data) {
      return reportError(result.error ?? "Pursuit activity could not be logged.");
    }
    const nextActivity = result.data as PursuitActivity;
    setActivities((current) => [nextActivity, ...current].sort((left, right) => right.occurred_at.localeCompare(left.occurred_at)));
    setMessage?.({ tone: "good", text: "Pursuit activity logged." });
    return nextActivity;
  }, [client, pursuits, reportError, setMessage, userId]);

  return {
    activities,
    createPursuit,
    error,
    isLoading,
    logActivity,
    pursuits,
    refresh,
    updatePursuit,
  };
}
