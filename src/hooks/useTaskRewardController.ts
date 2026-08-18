"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EconomyState } from "@/hooks/useEconomy";
import {
  parsePendingTaskRewards,
  PENDING_TASK_REWARDS_STORAGE_KEY,
  type PendingTaskReward,
  type TaskRewardCandidate,
} from "@/lib/task-rewards";
import {
  buildLegacyMigrationOperationId,
  getLegacyPendingRewardBalance,
  parseAuthoritativeClaimSession,
  parsePendingRewardItems,
  PENDING_REWARD_DICE_DEVICE_ID_KEY,
  shouldApplyPendingRewardDiceSnapshot,
  type PendingRewardDiceAccountSnapshot,
  type PendingRewardDiceMutationRow,
} from "@/lib/pending-reward-dice";
import { createBrowserUuidV4 } from "@/lib/browser-uuid";

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
  client: SupabaseClient;
  currentUserId: string | null;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setEconomy: Dispatch<SetStateAction<EconomyState>>;
};

export function useTaskRewardController({
  client,
  currentUserId,
  setMessage,
  setEconomy,
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

  async function fulfillCanonicalRewardEntitlements(candidates: TaskRewardCandidate[]) {
    if (!client || !currentUserId || candidates.length === 0) return;
    let allFulfilled = true;
    for (const candidate of candidates) {
      const entitlementId = candidate.canonicalRewardEntitlementId;
      if (!entitlementId) continue;
      let fulfillment = await client.rpc("adhdice_fulfill_canonical_reward_entitlement", {
        p_entitlement_id: entitlementId,
      });
      if (fulfillment.error && isFetchFailure(fulfillment.error)) {
        fulfillment = await client.rpc("adhdice_fulfill_canonical_reward_entitlement", {
          p_entitlement_id: entitlementId,
        });
      }
      const mutationRow = fulfillment.data?.[0] as PendingRewardDiceMutationRow | undefined;
      if (fulfillment.error || !mutationRow) {
        allFulfilled = false;
        setMessage({ tone: "warn", text: fulfillment.error?.message ?? "Could not fulfill the canonical reward entitlement." });
        continue;
      }
      applyMutationRow(mutationRow);
    }
    if (allFulfilled) await refreshPendingRewards();
  }

  async function queueTaskRewards(candidates: TaskRewardCandidate[]) {
    await fulfillCanonicalRewardEntitlements(candidates.filter((candidate) => Boolean(candidate.canonicalRewardEntitlementId)));
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
  };
}
