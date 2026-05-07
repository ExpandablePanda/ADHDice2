import { useState } from "react";
import type { createBrowserSupabaseClient } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;

export type EconomyState = {
  level: number;
  xp: number;
  points: number;
  tokens: number;
};

export type AppendEconomyEventOpts = {
  source: "task" | "focus" | "roll";
  refId: string;
  points: number;
  xp: number;
  reason: string;
  taskId?: string;
  eventType?: "completed" | "missed" | "streak_bonus";
};

export function useEconomy(client: SupabaseClient, userId: string | null) {
  const [economy, setEconomy] = useState<EconomyState>({
    level: 1,
    xp: 0,
    points: 0,
    tokens: 0,
  });

  async function appendEconomyEvent(opts: AppendEconomyEventOpts) {
    if (!client || !userId) return;

    const { data: profile } = await client
      .from("adhdice_user_profiles")
      .select("points, xp, level, tokens")
      .eq("user_id", userId)
      .single();

    const currentPoints = profile?.points ?? 0;
    const currentXp = profile?.xp ?? 0;
    const currentLevel = profile?.level ?? 1;
    const newPoints = currentPoints + opts.points;
    const newXp = currentXp + opts.xp;
    const xpThreshold = currentLevel * 100;
    const newLevel = newXp >= xpThreshold ? currentLevel + 1 : currentLevel;

    await client.from("adhdice_user_profiles").upsert({
      user_id: userId,
      points: newPoints,
      xp: newXp,
      level: newLevel,
    });

    setEconomy({ level: newLevel, xp: newXp, points: newPoints, tokens: profile?.tokens ?? 0 });

    await client.from("adhdice_point_ledger").insert({
      user_id: userId,
      delta: opts.points,
      reason: opts.reason,
      balance_after: newPoints,
      source: opts.source,
      ref_id: opts.refId,
    });

    if (opts.source === "task" && opts.taskId && opts.eventType) {
      await client.from("adhdice_task_events").insert({
        user_id: userId,
        task_id: opts.taskId,
        event_type: opts.eventType,
        awarded_points: opts.points,
        awarded_xp: opts.xp,
      });
    }
  }

  return { economy, setEconomy, appendEconomyEvent };
}
