"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EconomyState } from "@/hooks/useEconomy";
import type { Task, TaskHistory as DbTaskHistory, TaskSubtask as DbTaskSubtask, TaskUpdate } from "@/lib/database.types";
import { buildTaskUpdateConflictMessage, type TaskRowUpdateOptions, type UpdateTaskRowResult } from "@/lib/task-db-mutations";
import {
  parsePendingTaskRewards,
  PENDING_TASK_REWARDS_STORAGE_KEY,
  buildSingleTaskReward,
  isNewRewardCompletion,
  type PendingTaskReward,
  type TaskRewardCandidate,
} from "@/lib/task-rewards";
import {
  buildLegacyMigrationOperationId,
  buildPendingRewardAwardOperationId,
  getLegacyPendingRewardBalance,
  parseAuthoritativeClaimSession,
  parsePendingRewardItems,
  PENDING_REWARD_DICE_DEVICE_ID_KEY,
  shouldApplyPendingRewardDiceSnapshot,
  type PendingRewardDiceAccountSnapshot,
  type PendingRewardDiceMutationRow,
} from "@/lib/pending-reward-dice";
import { filterMissingTaskHistoryDateKeys, resolveRecurringLiveStatusFromNextDueDate } from "@/lib/task-repeat";
import { buildOverdueTaskMissedDateKeys } from "@/lib/task-history";
import { createBrowserUuidV4 } from "@/lib/browser-uuid";
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
  currentDayKey: string;
  currentUserId: string | null;
  dayStartTime: string;
  logicalDayNow: number;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setEconomy: Dispatch<SetStateAction<EconomyState>>;
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
  currentDayKey,
  currentUserId,
  dayStartTime,
  logicalDayNow,
  setMessage,
  setEconomy,
  setTaskHistory,
  setTaskSubtasks,
  setTasks,
  sortTasksForUi,
  timezone,
  updateTaskRowWithLegacyEnergyFallback,
}: UseTaskRewardControllerOptions) {
  const [pendingRewardQueue, setPendingRewardQueue] = useState<PendingTaskReward[]>([]);
  const [pendingRewardDiceCount, setPendingRewardDiceCount] = useState(0);
  const accountSnapshotRef = useRef<PendingRewardDiceAccountSnapshot | null>(null);
  const fetchGenerationRef = useRef(0);
  const claimOperationIdRef = useRef<string | null>(null);
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
    const message = error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error ?? "");
    return message.includes("Load failed")
      || message.includes("Failed to fetch")
      || message.includes("Network request failed");
  }

  const applyAuthoritativeSnapshot = useCallback((
    snapshot: PendingRewardDiceAccountSnapshot,
    queue?: PendingTaskReward[],
  ) => {
    if (!shouldApplyPendingRewardDiceSnapshot(accountSnapshotRef.current, snapshot)) return false;
    accountSnapshotRef.current = snapshot;
    setPendingRewardDiceCount(snapshot.pendingDice);
    if (queue) setPendingRewardQueue(queue);
    return true;
  }, []);

  const applyMutationRow = useCallback((row: PendingRewardDiceMutationRow) => {
    fetchGenerationRef.current += 1;
    if (row.was_replayed) return false;
    return applyAuthoritativeSnapshot({
      pendingDice: row.pending_dice,
      revision: Number(row.revision),
      updatedAt: row.updated_at,
    });
  }, [applyAuthoritativeSnapshot]);

  const refreshPendingRewards = useCallback(async () => {
    if (!client || !currentUserId) return;
    const generation = ++fetchGenerationRef.current;
    const [accountResult, itemsResult] = await Promise.all([
      client.from("adhdice_pending_reward_dice").select("pending_dice,revision,updated_at").eq("user_id", currentUserId).maybeSingle(),
      client.from("adhdice_pending_reward_dice_items").select("reward_payload").eq("user_id", currentUserId).is("claimed_operation_id", null).order("created_at"),
    ]);
    if (generation !== fetchGenerationRef.current) return;
    if (accountResult.error || itemsResult.error) {
      const error = accountResult.error ?? itemsResult.error;
      if (!isFetchFailure(error)) {
        setMessage({ tone: "warn", text: error?.message ?? "Could not synchronize pending reward dice." });
      }
      return;
    }
    const row = accountResult.data;
    const snapshot = {
      pendingDice: row?.pending_dice ?? 0,
      revision: Number(row?.revision ?? 0),
      updatedAt: row?.updated_at ?? "",
    };
    applyAuthoritativeSnapshot(snapshot, parsePendingRewardItems(itemsResult.data));
  }, [applyAuthoritativeSnapshot, client, currentUserId, setMessage]);

  useEffect(() => {
    accountSnapshotRef.current = null;
    fetchGenerationRef.current += 1;
    claimOperationIdRef.current = null;
    setPendingRewardDiceCount(0);
    setPendingRewardQueue([]);
    if (!client || !currentUserId || typeof window === "undefined") return;

    let cancelled = false;
    const migrateAndHydrate = async () => {
      const legacyRewards = readPendingRewardQueue(currentUserId);
      let deviceId = window.localStorage.getItem(PENDING_REWARD_DICE_DEVICE_ID_KEY);
      if (!deviceId) {
        try {
          deviceId = createBrowserUuidV4();
        } catch (error) {
          setMessage({
            tone: "warn",
            text: error instanceof Error ? error.message : "Could not create a secure pending-reward migration ID.",
          });
          return;
        }
        window.localStorage.setItem(PENDING_REWARD_DICE_DEVICE_ID_KEY, deviceId);
      }
      const migration = await client.rpc("adhdice_migrate_pending_reward_dice", {
        p_legacy_rewards: legacyRewards,
        p_operation_id: buildLegacyMigrationOperationId(deviceId),
        p_reported_legacy_balance: getLegacyPendingRewardBalance(legacyRewards),
      });
      if (cancelled) return;
      if (migration.error) {
        if (!isFetchFailure(migration.error)) {
          setMessage({ tone: "warn", text: "Pending reward dice need the 6.29.7 Supabase migration before they can synchronize." });
        }
        return;
      }
      const mutationRow = migration.data?.[0] as PendingRewardDiceMutationRow | undefined;
      if (mutationRow) applyMutationRow(mutationRow);
      window.localStorage.removeItem(getPendingRewardStorageKey(currentUserId));
      window.localStorage.setItem(`${getPendingRewardStorageKey(currentUserId)}:migrated`, "true");
      await refreshPendingRewards();
    };
    void migrateAndHydrate();

    const channel = client
      .channel(`pending-reward-dice:${currentUserId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "adhdice_pending_reward_dice",
        filter: `user_id=eq.${currentUserId}`,
      }, (payload) => {
        if (cancelled) return;
        const row = payload.new as { pending_dice?: number; revision?: number; updated_at?: string };
        const revision = Number(row.revision);
        if (typeof row.pending_dice !== "number" || !Number.isFinite(revision) || typeof row.updated_at !== "string") return;
        const applied = applyAuthoritativeSnapshot({ pendingDice: row.pending_dice, revision, updatedAt: row.updated_at });
        if (applied) void refreshPendingRewards();
      })
      .subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          void refreshPendingRewards();
        }
      });

    const refresh = () => { void refreshPendingRewards(); };
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("online", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("online", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void client.removeChannel(channel);
    };
  }, [applyAuthoritativeSnapshot, applyMutationRow, client, currentUserId, refreshPendingRewards, setMessage]);

  function getRecurringFinalizationCandidates(candidates: TaskRewardCandidate[]) {
    return candidates
      .filter((candidate) =>
        !candidate.claimRef?.subtaskId
        && candidate.task.repeat_frequency !== "none"
        && (
          isNewRewardCompletion(candidate.previousStatus, candidate.task.status)
          || candidate.forceRecurringFinalization === true
        ),
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

      // Completion may happen before its scheduled occurrence (for example, a
      // Sunday weekly task completed on Wednesday). Advance from the canonical
      // occurrence, not the action day, so the same occurrence cannot remain due.
      const currentOccurrenceDueOn = task.active_occurrence_due_on ?? task.due_on ?? currentDayKey;
      const nextDueReferenceDate = (
        (task.status === "done" || task.status === "did_my_best")
        && currentOccurrenceDueOn < currentDayKey
      )
        ? currentDayKey
        : currentOccurrenceDueOn;
      const nextDue = calcNextDueDateFromDate(task, nextDueReferenceDate);
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

    let allAwardsSaved = true;
    for (const pendingReward of pendingRewards) {
      const claimRef = pendingReward.claimRefs[0];
      const awardArgs = {
        p_operation_id: buildPendingRewardAwardOperationId(pendingReward),
        p_reward_date: pendingReward.rewardDate,
        p_reward_payload: pendingReward,
        p_streak_length: pendingReward.streakLength,
        p_subtask_id: claimRef?.subtaskId ?? null,
        p_task_id: claimRef?.taskId ?? pendingReward.tasks[0]!.id,
      };
      let award = await client.rpc("adhdice_award_pending_reward_dice", awardArgs);
      if (award.error && isFetchFailure(award.error)) {
        award = await client.rpc("adhdice_award_pending_reward_dice", awardArgs);
      }
      const mutationRow = award.data?.[0] as PendingRewardDiceMutationRow | undefined;
      if (award.error || !mutationRow) {
        allAwardsSaved = false;
        setMessage({ tone: "warn", text: award.error?.message ?? "Could not bank the task reward dice. Please try again." });
        continue;
      }
      applyMutationRow(mutationRow);
    }
    if (allAwardsSaved) await refreshPendingRewards();

    if (recurringTasksToFinalize.length > 0) {
      await finalizeRecurringTasks(recurringTasksToFinalize);
    }
  }

  async function claimPendingRewardBank() {
    if (!client || !currentUserId || pendingRewardDiceCount <= 0) return null;
    try {
      const operationId = claimOperationIdRef.current ?? createBrowserUuidV4();
      claimOperationIdRef.current = operationId;
      if (areRewardTablesUnavailable) {
        showRewardMigrationMessage();
        return null;
      }
      const claim = await client.rpc("adhdice_claim_pending_reward_dice", {
        p_operation_id: operationId,
      });
      const mutationRow = claim.data?.[0] as PendingRewardDiceMutationRow | undefined;
      if (claim.error || !mutationRow) {
        setMessage({ tone: "warn", text: claim.error?.message ?? "Could not claim the pending reward dice. Please try again." });
        await refreshPendingRewards();
        return null;
      }
      const session = parseAuthoritativeClaimSession(mutationRow.result_payload);
      const economyResult = mutationRow.result_payload && typeof mutationRow.result_payload === "object"
        ? (mutationRow.result_payload as { economy?: Partial<EconomyState> }).economy
        : null;
      if (!session || !economyResult || typeof economyResult.points !== "number" || typeof economyResult.xp !== "number" || typeof economyResult.level !== "number" || typeof economyResult.tokens !== "number") {
        setMessage({ tone: "warn", text: "Supabase returned an incomplete reward result. The canonical balance will be refreshed." });
        await refreshPendingRewards();
        return null;
      }
      const appliedClaimBalance = applyMutationRow(mutationRow);
      if (appliedClaimBalance) setPendingRewardQueue([]);
      setEconomy({ level: economyResult.level, points: economyResult.points, tokens: economyResult.tokens, xp: economyResult.xp });
      claimOperationIdRef.current = null;
      setMessage({
        tone: "good",
        text: `Reward claimed: +${session.totalFinalPoints} points, +${session.totalXp} XP, +${session.totalTokens} token${session.totalTokens === 1 ? "" : "s"}.`,
      });
      void refreshPendingRewards();
      return session;
    } catch (error) {
      if (isFetchFailure(error)) {
        setMessage({
          tone: "warn",
          text: "Could not reach Supabase to save the task reward. Please try again.",
        });
        return null;
      }
      setMessage({
        tone: "warn",
        text: error instanceof Error ? error.message : "Could not create a secure reward operation ID. Please update or use a browser with Web Crypto support.",
      });
      return null;
    }
  }

  return {
    claimPendingRewardBank,
    pendingRewardDiceCount,
    pendingRewardQueue,
    queueTaskRewards,
    reconcileOverdueTaskMisses,
  };
}
