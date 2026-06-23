"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommitTaskRewardOpts, CommitTaskRewardResult } from "@/hooks/useEconomy";
import type { Task, TaskHistory as DbTaskHistory, TaskSubtask as DbTaskSubtask, TaskUpdate } from "@/lib/database.types";
import { buildTaskUpdateConflictMessage, type TaskRowUpdateOptions, type UpdateTaskRowResult } from "@/lib/task-db-mutations";
import {
  getRecurringFinalizationTasksForRewardClaims,
  mergePendingTaskRewards,
  removePendingTaskRewardsByKey,
  getPendingRewardDiceCount,
  parsePendingTaskRewards,
  PENDING_TASK_REWARDS_STORAGE_KEY,
  buildSingleTaskReward,
  isNewRewardCompletion,
  type PendingTaskReward,
  type TaskRewardCandidate,
  type TaskRewardResolution,
} from "@/lib/task-rewards";
import { filterMissingTaskHistoryDateKeys, resolveRecurringLiveStatusFromNextDueDate } from "@/lib/task-repeat";
import { buildOverdueTaskMissedDateKeys } from "@/lib/task-history";
import {
  isMissingTaskRewardClaimSubtaskColumnError,
  isMissingTaskRewardClaimsTableError,
  isMissingTaskRewardRollsTableError,
} from "@/lib/task-db-compat";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

function getPendingRewardStorageKey(userId: string) {
  return `${PENDING_TASK_REWARDS_STORAGE_KEY}:${userId}`;
}

function readPendingRewardQueue(userId: string) {
  try {
    return parsePendingTaskRewards(window.localStorage.getItem(getPendingRewardStorageKey(userId)));
  } catch {
    return [] as PendingTaskReward[];
  }
}

type UseTaskRewardControllerOptions = {
  calcNextDueDateFromDate: (task: Task, referenceDateKey: string) => string | null;
  client: SupabaseClient;
  commitTaskReward: (opts: CommitTaskRewardOpts) => Promise<CommitTaskRewardResult>;
  currentDayKey: string;
  currentUserId: string | null;
  dayStartTime: string;
  logicalDayNow: number;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTaskHistory: Dispatch<SetStateAction<DbTaskHistory[]>>;
  setTaskSubtasks: Dispatch<SetStateAction<DbTaskSubtask[]>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  sortTasksForUi: (tasks: Task[]) => Task[];
  timezone: string;
  updateTaskRowWithLegacyEnergyFallback: (taskId: string, values: TaskUpdate, options?: TaskRowUpdateOptions) => Promise<UpdateTaskRowResult>;
};

export function useTaskRewardController({
  calcNextDueDateFromDate,
  client,
  commitTaskReward,
  currentDayKey,
  currentUserId,
  dayStartTime,
  logicalDayNow,
  setMessage,
  setTaskHistory,
  setTaskSubtasks,
  setTasks,
  sortTasksForUi,
  timezone,
  updateTaskRowWithLegacyEnergyFallback,
}: UseTaskRewardControllerOptions) {
  const [pendingRewardQueue, setPendingRewardQueue] = useState<PendingTaskReward[]>([]);
  const pendingRewardQueueRef = useRef<PendingTaskReward[]>([]);
  const [areRewardTablesUnavailable, setAreRewardTablesUnavailable] = useState(false);

  function showRewardMigrationMessage() {
    setAreRewardTablesUnavailable(true);
    setMessage({
      tone: "warn",
      text: "Task rewards need the new database tables first. Run `supabase/add_task_reward_roll_tables.sql`, then try the reward roll again.",
    });
  }

  function showSubtaskRewardMigrationMessage() {
    setMessage({
      tone: "warn",
      text: "Subtask reward claims need the new subtask claim column first. Run `supabase/add_task_reward_claim_subtask_id.sql`, then try again.",
    });
  }

  function isFetchFailure(error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return message.includes("Load failed")
      || message.includes("Failed to fetch")
      || message.includes("Network request failed");
  }

  function updatePendingRewardQueue(updater: (current: PendingTaskReward[]) => PendingTaskReward[]) {
    const current = pendingRewardQueueRef.current;
    const next = updater(current);
    if (next === current) {
      return;
    }

    pendingRewardQueueRef.current = next;
    setPendingRewardQueue(next);
    if (typeof window !== "undefined" && currentUserId) {
      try {
        window.localStorage.setItem(getPendingRewardStorageKey(currentUserId), JSON.stringify(next));
      } catch {
        setMessage({ tone: "warn", text: "Banked rolls are available now, but this browser could not save them for refresh." });
      }
    }
  }

  useEffect(() => {
    pendingRewardQueueRef.current = [];
    const hydratedQueue = currentUserId && typeof window !== "undefined"
      ? readPendingRewardQueue(currentUserId)
      : [];
    const timeout = window.setTimeout(() => {
      const nextQueue = mergePendingTaskRewards(hydratedQueue, pendingRewardQueueRef.current);
      pendingRewardQueueRef.current = nextQueue;
      setPendingRewardQueue(nextQueue);
      if (currentUserId) {
        try {
          window.localStorage.setItem(getPendingRewardStorageKey(currentUserId), JSON.stringify(nextQueue));
        } catch {
          // The interactive update path reports storage failures when rewards change.
        }
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [currentUserId]);

  function getRecurringFinalizationCandidates(candidates: TaskRewardCandidate[]) {
    return candidates
      .filter((candidate) =>
        !candidate.claimRef?.subtaskId
        && candidate.task.repeat_frequency !== "none"
        && isNewRewardCompletion(candidate.previousStatus, candidate.task.status),
      )
      .map((candidate) => candidate.task);
  }

  async function reconcileOverdueTaskMisses(task: Task) {
    const missedDates = buildOverdueTaskMissedDateKeys(task, currentDayKey);
    if (missedDates.length === 0) {
      return true;
    }

    const { data: existingRows, error: existingRowsError } = await client
      .from("adhdice_task_history")
      .select("*")
      .eq("user_id", currentUserId)
      .eq("task_id", task.id)
      .in("entry_date", missedDates);

    if (existingRowsError) {
      setMessage({ tone: "warn", text: existingRowsError.message });
      return false;
    }

    const normalizedMissedDates = filterMissingTaskHistoryDateKeys(
      missedDates,
      (existingRows ?? []).map((entry) => entry.entry_date),
    );
    if (normalizedMissedDates.length === 0) {
      return true;
    }

    const payload = normalizedMissedDates.map((entryDate) => ({
      counted_as_due_occurrence: false,
      entry_date: entryDate,
      event_type: "status" as const,
      status: "missed" as const,
      task_id: task.id,
      user_id: currentUserId,
      was_completed: false,
    }));

    const { data, error } = await client
      .from("adhdice_task_history")
      .upsert(payload, { onConflict: "user_id,task_id,entry_date" })
      .select("*");

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    if ((data ?? []).length > 0) {
      setTaskHistory((current) => {
        const nextByKey = new Map(current.map((entry) => [`${entry.task_id}:${entry.entry_date}`, entry] as const));
        for (const entry of data ?? []) {
          nextByKey.set(`${entry.task_id}:${entry.entry_date}`, entry);
        }
        return [...nextByKey.values()];
      });
    }

    return true;
  }

  async function finalizeRecurringTasks(completedTasks: Task[]) {
    if (!client || !currentUserId || completedTasks.length === 0) {
      return;
    }

    const updates = await Promise.all(completedTasks.map(async (task) => {
      if (task.repeat_frequency === "none") {
        return { resetSubtasks: null as DbTaskSubtask[] | null, task: null as Task | null };
      }

      const historySaved = await reconcileOverdueTaskMisses(task);
      if (!historySaved) {
        return { resetSubtasks: null as DbTaskSubtask[] | null, task: null as Task | null };
      }

      const nextDue = calcNextDueDateFromDate(task, currentDayKey);
      if (!nextDue) {
        return { resetSubtasks: null as DbTaskSubtask[] | null, task: null as Task | null };
      }

      const nextStatus = resolveRecurringLiveStatusFromNextDueDate(task, {
        currentDayKey,
        dayStartTime,
        nextDueDate: nextDue,
        now: new Date(logicalDayNow),
        timezone,
      });

      const { conflict, data, error } = await updateTaskRowWithLegacyEnergyFallback(
        task.id,
        { completed_at: null, due_on: nextDue, status: nextStatus },
        { expectedTask: task },
      );

      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return { resetSubtasks: null as DbTaskSubtask[] | null, task: null as Task | null };
      }

      if (conflict) {
        setMessage({
          tone: "warn",
          text: `A recurring task changed in the cloud before ADHDice could finalize it. ${buildTaskUpdateConflictMessage(conflict)}`,
        });
        return { resetSubtasks: null as DbTaskSubtask[] | null, task: conflict.latestTask };
      }

      let resetSubtasks: DbTaskSubtask[] | null = null;
      if (task.subtasks_auto_reset) {
        const subtaskReset = await client
          .from("adhdice_task_subtasks")
          .update({ status: "pending" })
          .eq("task_id", task.id)
          .eq("user_id", currentUserId)
          .select("*");

        if (subtaskReset.error) {
          setMessage({ tone: "warn", text: subtaskReset.error.message });
        } else {
          resetSubtasks = subtaskReset.data ?? [];
        }
      }

      return { resetSubtasks, task: data };
    }));

    const updatedTasks = updates
      .map((entry) => entry.task)
      .filter((task): task is Task => Boolean(task));
    if (updatedTasks.length === 0) {
      return;
    }

    const byId = new Map(updatedTasks.map((task) => [task.id, task]));
    setTasks((current) => sortTasksForUi(current.map((task) => byId.get(task.id) ?? task)));
    const nextSubtasks = updates.flatMap((entry) => entry.resetSubtasks ?? []);
    if (nextSubtasks.length > 0) {
      const resetTaskIdSet = new Set(nextSubtasks.map((subtask) => subtask.task_id));
      setTaskSubtasks((current) => [
        ...current.filter((subtask) => !resetTaskIdSet.has(subtask.task_id)),
        ...nextSubtasks,
      ]);
    }
  }

  async function loadEligibleCandidates(candidates: TaskRewardCandidate[]) {
    if (!client || !currentUserId || candidates.length === 0) {
      return { eligible: [] as TaskRewardCandidate[], ineligible: [] as TaskRewardCandidate[], rewardDate: currentDayKey };
    }

    const rewardDate = currentDayKey;
    const taskIds = candidates.map((candidate) => candidate.task.id);
    const hasSubtaskCandidates = candidates.some((candidate) => Boolean(candidate.claimRef?.subtaskId));
    let data: Array<{ subtask_id?: string | null; task_id: string }> | null = null;
    let error: { message: string } | null = null;

    const primaryQuery = await client
      .from("adhdice_task_reward_claims")
      .select("task_id,subtask_id")
      .eq("user_id", currentUserId)
      .eq("reward_date", rewardDate)
      .in("task_id", taskIds);
    data = primaryQuery.data;
    error = primaryQuery.error;

    if (error && isMissingTaskRewardClaimSubtaskColumnError(error.message) && !hasSubtaskCandidates) {
      const fallbackQuery = await client
        .from("adhdice_task_reward_claims")
        .select("task_id")
        .eq("user_id", currentUserId)
        .eq("reward_date", rewardDate)
        .in("task_id", taskIds);
      data = fallbackQuery.data;
      error = fallbackQuery.error;
    }

    if (error) {
      if (isMissingTaskRewardClaimSubtaskColumnError(error.message)) {
        showSubtaskRewardMigrationMessage();
      } else if (isMissingTaskRewardClaimsTableError(error.message)) {
        showRewardMigrationMessage();
      } else {
        setMessage({ tone: "warn", text: error.message });
      }
      return { eligible: [] as TaskRewardCandidate[], ineligible: candidates, rewardDate };
    }

    const claimedTaskIds = new Set((data ?? []).filter((entry) => !entry.subtask_id).map((entry) => entry.task_id));
    const claimedSubtaskIds = new Set((data ?? []).map((entry) => entry.subtask_id).filter((value): value is string => Boolean(value)));
    return {
      eligible: candidates.filter((candidate) => {
        const subtaskId = candidate.claimRef?.subtaskId ?? null;
        if (subtaskId) {
          return !claimedSubtaskIds.has(subtaskId);
        }
        return !claimedTaskIds.has(candidate.task.id);
      }),
      ineligible: candidates.filter((candidate) => {
        const subtaskId = candidate.claimRef?.subtaskId ?? null;
        if (subtaskId) {
          return claimedSubtaskIds.has(subtaskId);
        }
        return claimedTaskIds.has(candidate.task.id);
      }),
      rewardDate,
    };
  }

  async function buildPendingRewards(candidates: TaskRewardCandidate[], rewardDate: string) {
    if (!client || !currentUserId || candidates.length === 0) {
      return [] as PendingTaskReward[];
    }

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
      return [];
    }

    const history = (data ?? []) as DbTaskHistory[];
    return candidates.flatMap((candidate) => {
      const pendingReward = buildSingleTaskReward([candidate.task], history, rewardDate);
      if (!pendingReward) {
        return [];
      }

      return [{
        ...pendingReward,
        claimRefs: [candidate.claimRef ?? pendingReward.claimRefs[0]!],
      }];
    });
  }

  async function queueTaskRewards(candidates: TaskRewardCandidate[]) {
    const newlyCompleted = candidates.filter((candidate) =>
      candidate.claimRef?.subtaskId
        ? true
        : isNewRewardCompletion(candidate.previousStatus, candidate.task.status),
    );
    if (newlyCompleted.length === 0) {
      return;
    }

    const recurringTasksToFinalize = getRecurringFinalizationCandidates(newlyCompleted);

    if (areRewardTablesUnavailable) {
      await finalizeRecurringTasks(recurringTasksToFinalize);
      return;
    }

    const { eligible, ineligible, rewardDate } = await loadEligibleCandidates(newlyCompleted);
    if (ineligible.length > 0) {
      await finalizeRecurringTasks(getRecurringFinalizationCandidates(ineligible));
    }

    if (eligible.length === 0) {
      return;
    }

    const pendingRewards = await buildPendingRewards(eligible, rewardDate);
    if (pendingRewards.length === 0) {
      await finalizeRecurringTasks(getRecurringFinalizationCandidates(eligible));
      return;
    }

    updatePendingRewardQueue((current) => mergePendingTaskRewards(current, pendingRewards));

    if (recurringTasksToFinalize.length > 0) {
      await finalizeRecurringTasks(recurringTasksToFinalize);
    }
  }

  async function claimPendingReward(resolution: TaskRewardResolution) {
    try {
      const recurringFinalizationTasks = getRecurringFinalizationTasksForRewardClaims(
        resolution.tasks,
        resolution.claimRefs,
      );

      if (areRewardTablesUnavailable) {
        await finalizeRecurringTasks(recurringFinalizationTasks);
        showRewardMigrationMessage();
        return false;
      }

      const primaryTaskId = resolution.tasks[0]?.id ?? null;
      const claimResult = await commitTaskReward({
        awardedTokens: resolution.awardedTokens,
        awardedXp: resolution.xp,
        basePoints: resolution.basePoints,
        baseRolls: resolution.baseRolls,
        claimRefs: resolution.claimRefs.map((claimRef) => ({ subtaskId: claimRef.subtaskId, taskId: claimRef.taskId })),
        finalPoints: resolution.finalPoints,
        mode: resolution.mode,
        multiplierRoll: resolution.multiplierRoll,
        reason: resolution.mode === "single"
          ? `Task reward roll: ${resolution.claimRefs[0]?.title ?? resolution.tasks[0]?.title ?? "Completed task"}`
          : `Batch reward roll for ${resolution.tasks.length} tasks`,
        refId: primaryTaskId ?? currentUserId ?? "task-reward",
        rewardDate: resolution.rewardDate,
        streakLength: resolution.streakLength,
        streakTierLabel: resolution.tier?.label ?? null,
        taskIds: resolution.tasks.map((task) => task.id),
      });

      if (claimResult === "already_claimed") {
        updatePendingRewardQueue((current) => removePendingTaskRewardsByKey(current, [resolution]));
        await finalizeRecurringTasks(recurringFinalizationTasks);
        setMessage({
          tone: "neutral",
          text: "This reward was already claimed, so the duplicate claim window was cleared.",
        });
        return true;
      }

      if (claimResult !== "claimed") {
        setMessage({ tone: "warn", text: "Could not save the task reward. Please try again." });
        return false;
      }

      updatePendingRewardQueue((current) => removePendingTaskRewardsByKey(current, [resolution]));
      await finalizeRecurringTasks(recurringFinalizationTasks);
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

  async function claimPendingRewardBank(resolutions: TaskRewardResolution[]) {
    for (const resolution of resolutions) {
      const claimed = await claimPendingReward(resolution);
      if (!claimed) {
        return false;
      }
    }

    return true;
  }

  return {
    claimPendingRewardBank,
    pendingRewardDiceCount: getPendingRewardDiceCount(pendingRewardQueue),
    pendingRewardQueue,
    queueTaskRewards,
    reconcileOverdueTaskMisses,
  };
}
