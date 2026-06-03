import { useState } from "react";
import type {
  PointLedgerSource,
  TaskRewardClaimInsert,
  TaskRewardMode,
  TaskRewardRollInsert,
} from "@/lib/database.types";
import type { createBrowserSupabaseClient } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;

export type EconomyState = {
  level: number;
  xp: number;
  points: number;
  tokens: number;
};

export type AppendEconomyEventOpts = {
  source: PointLedgerSource;
  refId: string;
  points: number;
  xp: number;
  reason: string;
  taskId?: string;
  eventType?: "completed" | "missed" | "streak_bonus";
};

export type CommitTaskRewardOpts = {
  awardedTokens: number;
  awardedXp: number;
  basePoints: number;
  baseRolls: number[];
  finalPoints: number;
  mode: TaskRewardMode;
  multiplierRoll: number;
  reason: string;
  refId: string;
  rewardDate: string;
  streakLength: number;
  streakTierLabel: string | null;
  taskIds: string[];
};

function getLevelFromXp(xp: number) {
  let level = 1;
  while (xp >= level * 100) {
    level += 1;
  }
  return level;
}

function isFetchFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("Load failed")
    || message.includes("Failed to fetch")
    || message.includes("Network request failed");
}

export function useEconomy(client: SupabaseClient, userId: string | null) {
  const [economy, setEconomy] = useState<EconomyState>({
    level: 1,
    xp: 0,
    points: 0,
    tokens: 0,
  });

  async function appendEconomyEvent(opts: AppendEconomyEventOpts) {
    if (!client || !userId) return;

    try {
      const { data: profile } = await client
        .from("adhdice_user_profiles")
        .select("points, xp, level, tokens")
        .eq("user_id", userId)
        .single();

      const currentPoints = profile?.points ?? 0;
      const currentXp = profile?.xp ?? 0;
      const newPoints = currentPoints + opts.points;
      const newXp = currentXp + opts.xp;
      const newLevel = getLevelFromXp(newXp);

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
    } catch (error) {
      if (isFetchFailure(error)) {
        return;
      }
      throw error;
    }
  }

  async function commitTaskReward(opts: CommitTaskRewardOpts) {
    if (!client || !userId) {
      return false;
    }

    try {
      const { data: profile, error: profileError } = await client
        .from("adhdice_user_profiles")
        .select("points, xp, level, tokens")
        .eq("user_id", userId)
        .single();

      if (profileError) {
        return false;
      }

      const currentPoints = profile?.points ?? 0;
      const currentXp = profile?.xp ?? 0;
      const currentTokens = profile?.tokens ?? 0;
      const newPoints = currentPoints + opts.finalPoints;
      const newXp = currentXp + opts.awardedXp;
      const newTokens = currentTokens + opts.awardedTokens;
      const newLevel = getLevelFromXp(newXp);

      const rewardRollPayload: TaskRewardRollInsert = {
        awarded_tokens: opts.awardedTokens,
        awarded_xp: opts.awardedXp,
        base_points: opts.basePoints,
        base_rolls: opts.baseRolls,
        eligible_task_count: opts.taskIds.length,
        final_points: opts.finalPoints,
        mode: opts.mode,
        multiplier_roll: opts.multiplierRoll,
        reward_date: opts.rewardDate,
        streak_length: opts.streakLength,
        streak_tier_label: opts.streakTierLabel,
        user_id: userId,
      };
      const { data: rewardRoll, error: rewardRollError } = await client
        .from("adhdice_task_reward_rolls")
        .insert(rewardRollPayload)
        .select("*")
        .single();

      if (rewardRollError || !rewardRoll) {
        return false;
      }

      const rewardClaimPayload: TaskRewardClaimInsert[] = opts.taskIds.map((taskId) => ({
        awarded_token: true,
        reward_date: opts.rewardDate,
        reward_roll_id: rewardRoll.id,
        task_id: taskId,
        user_id: userId,
      }));

      const [profileUpdate, ledgerInsert, rewardClaimInsert] = await Promise.all([
        client.from("adhdice_user_profiles").upsert({
          user_id: userId,
          level: newLevel,
          points: newPoints,
          tokens: newTokens,
          xp: newXp,
        }),
        client.from("adhdice_point_ledger").insert({
          user_id: userId,
          delta: opts.finalPoints,
          reason: opts.reason,
          balance_after: newPoints,
          source: "task",
          ref_id: opts.refId,
        }),
        client.from("adhdice_task_reward_claims").insert(rewardClaimPayload),
      ]);

      if (profileUpdate.error || ledgerInsert.error || rewardClaimInsert.error) {
        return false;
      }

      setEconomy({ level: newLevel, xp: newXp, points: newPoints, tokens: newTokens });
      return true;
    } catch (error) {
      if (isFetchFailure(error)) {
        return false;
      }
      throw error;
    }
  }

  async function resetEconomy() {
    if (!client || !userId) {
      return false;
    }

    const { error } = await client
      .from("adhdice_user_profiles")
      .upsert({
        user_id: userId,
        level: 1,
        xp: 0,
        points: 0,
        tokens: 0,
      });

    if (error) {
      return false;
    }

    setEconomy({ level: 1, xp: 0, points: 0, tokens: 0 });
    return true;
  }

  return { economy, setEconomy, appendEconomyEvent, commitTaskReward, resetEconomy };
}
