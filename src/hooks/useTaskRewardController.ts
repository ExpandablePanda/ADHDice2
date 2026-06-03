"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommitTaskRewardOpts } from "@/hooks/useEconomy";
import type { Task, TaskHistory as DbTaskHistory } from "@/lib/database.types";
import {
  buildBatchTaskReward,
  buildSingleTaskReward,
  isNewRewardCompletion,
  type PendingTaskReward,
  type TaskRewardCandidate,
  type TaskRewardResolution,
} from "@/lib/task-rewards";
import {
  isMissingTaskRewardClaimsTableError,
  isMissingTaskRewardRollsTableError,
} from "@/lib/task-db-compat";
import { todayISO } from "@/lib/utils";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type UseTaskRewardControllerOptions = {
  calcNextDueDate: (task: Task) => string | null;
  client: SupabaseClient;
  commitTaskReward: (opts: CommitTaskRewardOpts) => Promise<boolean>;
  currentUserId: string | null;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  sortTasksForUi: (tasks: Task[]) => Task[];
};

export function useTaskRewardController({
  calcNextDueDate,
  client,
  commitTaskReward,
  currentUserId,
  setMessage,
  setTasks,
  sortTasksForUi,
}: UseTaskRewardControllerOptions) {
  const [pendingRewardQueue, setPendingRewardQueue] = useState<PendingTaskReward[]>([]);
  const [areRewardTablesUnavailable, setAreRewardTablesUnavailable] = useState(false);

  function showRewardMigrationMessage() {
    setAreRewardTablesUnavailable(true);
    setMessage({
      tone: "warn",
      text: "Task rewards need the new database tables first. Run `supabase/add_task_reward_roll_tables.sql`, then try the reward roll again.",
    });
  }

  function isFetchFailure(error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return message.includes("Load failed")
      || message.includes("Failed to fetch")
      || message.includes("Network request failed");
  }

  async function finalizeRecurringTasks(completedTasks: Task[]) {
    if (!client || completedTasks.length === 0) {
      return;
    }

    const updates = await Promise.all(completedTasks.map(async (task) => {
      if (task.repeat_frequency === "none") {
        return null;
      }

      const nextDue = calcNextDueDate(task);
      if (!nextDue) {
        return null;
      }

      const { data, error } = await client
        .from("adhdice_clean_tasks")
        .update({ status: "upcoming", due_on: nextDue, completed_at: null })
        .eq("id", task.id)
        .select("*")
        .single();

      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return null;
      }

      return data;
    }));

    const updatedTasks = updates.filter((task): task is Task => Boolean(task));
    if (updatedTasks.length === 0) {
      return;
    }

    const byId = new Map(updatedTasks.map((task) => [task.id, task]));
    setTasks((current) => sortTasksForUi(current.map((task) => byId.get(task.id) ?? task)));
  }

  async function loadEligibleCandidates(candidates: TaskRewardCandidate[]) {
    if (!client || !currentUserId || candidates.length === 0) {
      return { eligible: [] as TaskRewardCandidate[], ineligible: [] as TaskRewardCandidate[], rewardDate: todayISO() };
    }

    const rewardDate = todayISO();
    const taskIds = candidates.map((candidate) => candidate.task.id);
    const { data, error } = await client
      .from("adhdice_task_reward_claims")
      .select("task_id")
      .eq("user_id", currentUserId)
      .eq("reward_date", rewardDate)
      .in("task_id", taskIds);

    if (error) {
      if (isMissingTaskRewardClaimsTableError(error.message)) {
        showRewardMigrationMessage();
      } else {
        setMessage({ tone: "warn", text: error.message });
      }
      return { eligible: [] as TaskRewardCandidate[], ineligible: candidates, rewardDate };
    }

    const claimedTaskIds = new Set((data ?? []).map((entry) => entry.task_id));
    return {
      eligible: candidates.filter((candidate) => !claimedTaskIds.has(candidate.task.id)),
      ineligible: candidates.filter((candidate) => claimedTaskIds.has(candidate.task.id)),
      rewardDate,
    };
  }

  async function buildPendingReward(candidates: TaskRewardCandidate[], rewardDate: string) {
    if (!client || !currentUserId || candidates.length === 0) {
      return null;
    }

    if (candidates.length === 1) {
      const { data, error } = await client
        .from("adhdice_task_history")
        .select("*")
        .eq("user_id", currentUserId)
        .order("entry_date", { ascending: true });

      if (error) {
        if (isMissingTaskRewardRollsTableError(error.message) || isMissingTaskRewardClaimsTableError(error.message)) {
          showRewardMigrationMessage();
        } else {
          setMessage({ tone: "warn", text: error.message });
        }
        return null;
      }

      return buildSingleTaskReward(candidates.map((candidate) => candidate.task), (data ?? []) as DbTaskHistory[], rewardDate);
    }

    return buildBatchTaskReward(candidates.map((candidate) => candidate.task), rewardDate);
  }

  async function queueTaskRewards(candidates: TaskRewardCandidate[]) {
    const newlyCompleted = candidates.filter((candidate) => isNewRewardCompletion(candidate.previousStatus, candidate.task.status));
    if (newlyCompleted.length === 0) {
      return;
    }

    if (areRewardTablesUnavailable) {
      await finalizeRecurringTasks(newlyCompleted.map((candidate) => candidate.task));
      return;
    }

    const { eligible, ineligible, rewardDate } = await loadEligibleCandidates(newlyCompleted);
    if (ineligible.length > 0) {
      await finalizeRecurringTasks(ineligible.map((candidate) => candidate.task));
    }

    if (eligible.length === 0) {
      return;
    }

    const pendingReward = await buildPendingReward(eligible, rewardDate);
    if (!pendingReward) {
      await finalizeRecurringTasks(eligible.map((candidate) => candidate.task));
      return;
    }

    setPendingRewardQueue((current) => [...current, pendingReward]);
  }

  async function claimPendingReward(resolution: TaskRewardResolution) {
    try {
      if (areRewardTablesUnavailable) {
        await finalizeRecurringTasks(resolution.tasks);
        setPendingRewardQueue((current) => current.slice(1));
        showRewardMigrationMessage();
        return false;
      }

      const primaryTaskId = resolution.tasks[0]?.id ?? null;
      const claimed = await commitTaskReward({
        awardedTokens: resolution.awardedTokens,
        awardedXp: resolution.xp,
        basePoints: resolution.basePoints,
        baseRolls: resolution.baseRolls,
        finalPoints: resolution.finalPoints,
        mode: resolution.mode,
        multiplierRoll: resolution.multiplierRoll,
        reason: resolution.mode === "single"
          ? `Task reward roll: ${resolution.tasks[0]?.title ?? "Completed task"}`
          : `Batch reward roll for ${resolution.tasks.length} tasks`,
        refId: primaryTaskId ?? currentUserId ?? "task-reward",
        rewardDate: resolution.rewardDate,
        streakLength: resolution.streakLength,
        streakTierLabel: resolution.tier?.label ?? null,
        taskIds: resolution.tasks.map((task) => task.id),
      });

      if (!claimed) {
        setMessage({ tone: "warn", text: "Could not save the task reward. Please try again." });
        return false;
      }

      await finalizeRecurringTasks(resolution.tasks);
      setPendingRewardQueue((current) => current.slice(1));
      setMessage({
        tone: "good",
        text: `Reward claimed: +${resolution.finalPoints} points, +${resolution.xp} XP, +${resolution.awardedTokens} token${resolution.awardedTokens === 1 ? "" : "s"}.`,
      });
      return true;
    } catch (error) {
      if (isFetchFailure(error)) {
        setMessage({
          tone: "warn",
          text: "Could not reach Supabase to save the task reward. Please try again.",
        });
        return false;
      }

      throw error;
    }
  }

  const activePendingReward = pendingRewardQueue[0] ?? null;

  return {
    activePendingReward,
    claimPendingReward,
    queueTaskRewards,
  };
}
