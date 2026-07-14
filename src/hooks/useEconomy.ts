import { useState } from "react";
import type {
  PointLedgerSource,
  TaskRewardClaimInsert,
  TaskRewardMode,
  TaskRewardRollInsert,
  UserProfileInsert,
} from "@/lib/database.types";
import { getLevelFromXp, getLevelUpsEarned } from "@/lib/economy-levels";
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
  claimRefs: Array<{ subtaskId: string | null; taskId: string }>;
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

export type CommitTaskRewardResult = "claimed" | "already_claimed" | "failed";

function isFetchFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("Load failed")
    || message.includes("Failed to fetch")
    || message.includes("Network request failed");
}

function isTaskRewardClaimConflict(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as {
    code?: string;
    details?: string | null;
    message?: string;
    status?: number;
  };
  const details = maybeError.details ?? "";
  const message = maybeError.message ?? "";
  return maybeError.code === "23505"
    || maybeError.status === 409
    || details.includes("adhdice_task_reward_claims_task_day_unique")
    || details.includes("adhdice_task_reward_claims_subtask_day_unique")
    || message.includes("duplicate key value violates unique constraint");
}

export function useEconomy(client: SupabaseClient, userId: string | null) {
  const [economy, setEconomy] = useState<EconomyState>({
    level: 1,
    xp: 0,
    points: 0,
    tokens: 0,
  });

  async function hasExistingTaskRewardClaims(claimRefs: CommitTaskRewardOpts["claimRefs"], rewardDate: string) {
    if (!client || !userId || claimRefs.length === 0) {
      return false;
    }

    const taskIds = Array.from(new Set(claimRefs.map((claimRef) => claimRef.taskId)));
    const { data, error } = await client
      .from("adhdice_task_reward_claims")
      .select("task_id,subtask_id")
      .eq("user_id", userId)
      .eq("reward_date", rewardDate)
      .in("task_id", taskIds);

    if (error) {
      return false;
    }

    const parentClaimTaskIds = new Set((data ?? []).filter((entry) => !entry.subtask_id).map((entry) => entry.task_id));
    const subtaskClaimIds = new Set((data ?? []).map((entry) => entry.subtask_id).filter((value): value is string => Boolean(value)));
    return claimRefs.every((claimRef) =>
      claimRef.subtaskId
        ? subtaskClaimIds.has(claimRef.subtaskId)
        : parentClaimTaskIds.has(claimRef.taskId),
    );
  }

  async function appendEconomyEvent(opts: AppendEconomyEventOpts) {
    if (!client || !userId) return;

    try {
      const { data: profile } = await client
        .from("adhdice_user_profiles")
        .select("points, xp, level, tokens, free_roll_bank")
        .eq("user_id", userId)
        .single();

      const currentPoints = profile?.points ?? 0;
      const currentXp = profile?.xp ?? 0;
      const currentTokens = profile?.tokens ?? 0;
      const currentFreeRollBank = profile?.free_roll_bank ?? 0;
      const newPoints = currentPoints + opts.points;
      const newXp = currentXp + opts.xp;
      const newLevel = getLevelFromXp(newXp);
      const levelUpsEarned = getLevelUpsEarned(currentXp, newXp);
      const newTokens = currentTokens + levelUpsEarned;
      const newFreeRollBank = currentFreeRollBank + levelUpsEarned;

      const profileUpdate: UserProfileInsert = {
        user_id: userId,
        points: newPoints,
        xp: newXp,
        level: newLevel,
        tokens: newTokens,
      };
      if (levelUpsEarned > 0) {
        profileUpdate.free_roll_bank = newFreeRollBank;
      }
      await client.from("adhdice_user_profiles").upsert(profileUpdate);

      setEconomy({ level: newLevel, xp: newXp, points: newPoints, tokens: newTokens });

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

  async function commitTaskReward(opts: CommitTaskRewardOpts): Promise<CommitTaskRewardResult> {
    if (!client || !userId) {
      return "failed";
    }

    try {
      const alreadyClaimed = await hasExistingTaskRewardClaims(opts.claimRefs, opts.rewardDate);
      if (alreadyClaimed) {
        return "already_claimed";
      }

      const { data: profile, error: profileError } = await client
        .from("adhdice_user_profiles")
        .select("points, xp, level, tokens, free_roll_bank")
        .eq("user_id", userId)
        .single();

      if (profileError) {
        return "failed";
      }

      const currentPoints = profile?.points ?? 0;
      const currentXp = profile?.xp ?? 0;
      const currentTokens = profile?.tokens ?? 0;
      const currentFreeRollBank = profile?.free_roll_bank ?? 0;
      const newPoints = currentPoints + opts.finalPoints;
      const newXp = currentXp + opts.awardedXp;
      const newLevel = getLevelFromXp(newXp);
      const levelUpsEarned = getLevelUpsEarned(currentXp, newXp);
      const newTokens = currentTokens + opts.awardedTokens + levelUpsEarned;
      const newFreeRollBank = currentFreeRollBank + levelUpsEarned;

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
        return "failed";
      }

      const rewardClaimPayload: TaskRewardClaimInsert[] = opts.claimRefs.map((claimRef) => {
        const basePayload: TaskRewardClaimInsert = {
          awarded_token: true,
          reward_date: opts.rewardDate,
          reward_roll_id: rewardRoll.id,
          task_id: claimRef.taskId,
          user_id: userId,
        };

        return claimRef.subtaskId
          ? { ...basePayload, subtask_id: claimRef.subtaskId }
          : basePayload;
      });

      const nextProfileUpdate: UserProfileInsert = {
          user_id: userId,
          level: newLevel,
          points: newPoints,
          tokens: newTokens,
          xp: newXp,
      };
      if (levelUpsEarned > 0) {
        nextProfileUpdate.free_roll_bank = newFreeRollBank;
      }

      const [profileUpdate, ledgerInsert, rewardClaimInsert] = await Promise.all([
        client.from("adhdice_user_profiles").upsert(nextProfileUpdate),
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

      if (rewardClaimInsert.error && isTaskRewardClaimConflict(rewardClaimInsert.error)) {
        return "already_claimed";
      }

      if (profileUpdate.error || ledgerInsert.error || rewardClaimInsert.error) {
        return "failed";
      }

      setEconomy({ level: newLevel, xp: newXp, points: newPoints, tokens: newTokens });
      return "claimed";
    } catch (error) {
      if (isFetchFailure(error)) {
        return "failed";
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
        free_roll_bank: 0,
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
