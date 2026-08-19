import { useState } from "react";
import type { PointLedgerSource, UserProfileInsert } from "@/lib/database.types";
import { getLevelFromXp, getLevelUpsEarned } from "@/lib/economy-levels";
import type { createBrowserSupabaseClient } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;

export type EconomyState = { level: number; xp: number; points: number; tokens: number };

export type AppendEconomyEventOpts = {
  source: PointLedgerSource;
  refId: string;
  points: number;
  xp: number;
  reason: string;
  taskId?: string;
  eventType?: "completed" | "missed" | "streak_bonus";
};

export function useEconomy(client: SupabaseClient, userId: string | null) {
  const [economy, setEconomy] = useState<EconomyState>({ level: 1, xp: 0, points: 0, tokens: 0 });

  async function appendEconomyEvent(opts: AppendEconomyEventOpts) {
    if (!client || !userId) return;
    try {
      const { data: profile } = await client.from("adhdice_user_profiles").select("points, xp, level, tokens, free_roll_bank").eq("user_id", userId).single();
      const currentPoints = profile?.points ?? 0;
      const currentXp = profile?.xp ?? 0;
      const currentTokens = profile?.tokens ?? 0;
      const currentFreeRollBank = profile?.free_roll_bank ?? 0;
      const newPoints = currentPoints + opts.points;
      const newXp = currentXp + opts.xp;
      const levelUpsEarned = getLevelUpsEarned(currentXp, newXp);
      const newLevel = getLevelFromXp(newXp);
      const profileUpdate: UserProfileInsert = { user_id: userId, level: newLevel, points: newPoints, tokens: currentTokens + levelUpsEarned, xp: newXp };
      if (levelUpsEarned > 0) profileUpdate.free_roll_bank = currentFreeRollBank + levelUpsEarned;
      await client.from("adhdice_user_profiles").upsert(profileUpdate);
      setEconomy({ level: newLevel, xp: newXp, points: newPoints, tokens: profileUpdate.tokens ?? 0 });
      await client.from("adhdice_point_ledger").insert({ user_id: userId, delta: opts.points, reason: opts.reason, balance_after: newPoints, source: opts.source, ref_id: opts.refId });
      if (opts.source === "task" && opts.taskId && opts.eventType) {
        await client.from("adhdice_task_events").insert({ user_id: userId, task_id: opts.taskId, event_type: opts.eventType, awarded_points: opts.points, awarded_xp: opts.xp });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "");
      if (message.includes("Load failed") || message.includes("Failed to fetch") || message.includes("Network request failed")) return;
      throw error;
    }
  }

  async function resetEconomy() {
    if (!client || !userId) return false;
    const { error } = await client.from("adhdice_user_profiles").upsert({ user_id: userId, free_roll_bank: 0, level: 1, xp: 0, points: 0, tokens: 0 });
    if (error) return false;
    setEconomy({ level: 1, xp: 0, points: 0, tokens: 0 });
    return true;
  }

  return { economy, setEconomy, appendEconomyEvent, resetEconomy };
}
