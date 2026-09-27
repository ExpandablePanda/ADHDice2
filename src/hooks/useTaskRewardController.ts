"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EconomyState } from "@/hooks/useEconomy";
import type { Task } from "@/lib/database.types";
import {
  type PendingTaskReward,
  type TaskRewardCandidate,
} from "@/lib/task-rewards";
import { buildEffectiveTrackingExclusionSet } from "@/lib/task-tracking";
import { createRealtimeSnapshotLifecycle } from "@/lib/realtime-snapshot-lifecycle";
import {
  parseAuthoritativeClaimSession,
  parsePendingRewardItems,
  shouldApplyPendingRewardDiceSnapshot,
  type PendingRewardDiceAccountSnapshot,
  type PendingRewardDiceMutationRow,
} from "@/lib/pending-reward-dice";
import { createBrowserUuidV4 } from "@/lib/browser-uuid";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type UseTaskRewardControllerOptions = {
  client: SupabaseClient;
  currentUserId: string | null;
  tasks: Task[];
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setEconomy: Dispatch<SetStateAction<EconomyState>>;
};

export function useTaskRewardController({
  client,
  currentUserId,
  tasks,
  setMessage,
  setEconomy,
}: UseTaskRewardControllerOptions) {
  const [pendingRewardQueue, setPendingRewardQueue] = useState<PendingTaskReward[]>([]);
  const [pendingRewardDiceCount, setPendingRewardDiceCount] = useState(0);
  const accountSnapshotRef = useRef<PendingRewardDiceAccountSnapshot | null>(null);
  const pendingRewardQueueRef = useRef<PendingTaskReward[]>([]);
  const pendingRewardQueueStaleRef = useRef(true);
  const accountHydrationInFlightRef = useRef<{ client: SupabaseClient; promise: Promise<void>; userId: string } | null>(null);
  const queueLoadInFlightRef = useRef<{ client: SupabaseClient; promise: Promise<PendingTaskReward[] | null>; userId: string } | null>(null);
  const ownerGenerationRef = useRef(0);
  const fetchGenerationRef = useRef(0);
  const claimOperationIdRef = useRef<string | null>(null);
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

  const applyAuthoritativeSnapshot = useCallback((snapshot: PendingRewardDiceAccountSnapshot) => {
    if (!shouldApplyPendingRewardDiceSnapshot(accountSnapshotRef.current, snapshot)) return false;
    const previousSnapshot = accountSnapshotRef.current;
    accountSnapshotRef.current = snapshot;
    setPendingRewardDiceCount(snapshot.pendingDice);
    if (
      !previousSnapshot
      || previousSnapshot.pendingDice !== snapshot.pendingDice
      || previousSnapshot.revision !== snapshot.revision
      || previousSnapshot.updatedAt !== snapshot.updatedAt
    ) {
      pendingRewardQueueStaleRef.current = true;
    }
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

  const refreshPendingRewardAccount = useCallback(() => {
    if (!client || !currentUserId) return;
    const inFlight = accountHydrationInFlightRef.current;
    if (inFlight?.client === client && inFlight.userId === currentUserId) return inFlight.promise;
    const ownerGeneration = ownerGenerationRef.current;
    const generation = ++fetchGenerationRef.current;
    const promise = (async () => {
      const { data, error } = await client
        .from("adhdice_pending_reward_dice")
        .select("pending_dice,revision,updated_at")
        .eq("user_id", currentUserId)
        .maybeSingle();
      if (ownerGenerationRef.current !== ownerGeneration || generation !== fetchGenerationRef.current) return;
      if (error) {
        if (!isFetchFailure(error)) {
          setMessage({ tone: "warn", text: error.message ?? "Could not synchronize pending reward dice." });
        }
        return;
      }
      const row = data;
      applyAuthoritativeSnapshot({
        pendingDice: row?.pending_dice ?? 0,
        revision: Number(row?.revision ?? 0),
        updatedAt: row?.updated_at ?? "",
      });
    })();
    accountHydrationInFlightRef.current = { client, promise, userId: currentUserId };
    void promise.then(
      () => { if (accountHydrationInFlightRef.current?.promise === promise) accountHydrationInFlightRef.current = null; },
      () => { if (accountHydrationInFlightRef.current?.promise === promise) accountHydrationInFlightRef.current = null; },
    );
    return promise;
  }, [applyAuthoritativeSnapshot, client, currentUserId, setMessage]);

  const loadPendingRewardQueue = useCallback(() => {
    if (!client || !currentUserId) return Promise.resolve<PendingTaskReward[] | null>([]);
    const inFlight = queueLoadInFlightRef.current;
    if (inFlight?.client === client && inFlight.userId === currentUserId) return inFlight.promise;
    if (!pendingRewardQueueStaleRef.current) return Promise.resolve(pendingRewardQueueRef.current);

    const ownerGeneration = ownerGenerationRef.current;
    const snapshotAtStart = accountSnapshotRef.current;
    const promise = (async () => {
      const { data, error } = await client
        .from("adhdice_pending_reward_dice_items")
        .select("reward_payload")
        .eq("user_id", currentUserId)
        .is("claimed_operation_id", null)
        .order("created_at");
      if (ownerGenerationRef.current !== ownerGeneration) return null;
      if (error) {
        setMessage({
          tone: "warn",
          text: isFetchFailure(error)
            ? "Could not reach Supabase to load the pending reward bank. Please try again."
            : (error.message ?? "Could not load the pending reward bank."),
        });
        return null;
      }
      const queue = parsePendingRewardItems(data);
      pendingRewardQueueRef.current = queue;
      setPendingRewardQueue(queue);
      const snapshotAfterLoad = accountSnapshotRef.current;
      if (
        snapshotAtStart?.pendingDice === snapshotAfterLoad?.pendingDice
        && snapshotAtStart?.revision === snapshotAfterLoad?.revision
        && snapshotAtStart?.updatedAt === snapshotAfterLoad?.updatedAt
      ) {
        pendingRewardQueueStaleRef.current = false;
      } else {
        pendingRewardQueueStaleRef.current = true;
      }
      return queue;
    })();
    queueLoadInFlightRef.current = { client, promise, userId: currentUserId };
    void promise.then(
      () => { if (queueLoadInFlightRef.current?.promise === promise) queueLoadInFlightRef.current = null; },
      () => { if (queueLoadInFlightRef.current?.promise === promise) queueLoadInFlightRef.current = null; },
    );
    return promise;
  }, [client, currentUserId, setMessage]);

  const clearPendingRewardQueue = useCallback(() => {
    pendingRewardQueueRef.current = [];
    pendingRewardQueueStaleRef.current = true;
    setPendingRewardQueue([]);
  }, []);

  useEffect(() => {
    ownerGenerationRef.current += 1;
    accountSnapshotRef.current = null;
    pendingRewardQueueStaleRef.current = true;
    pendingRewardQueueRef.current = [];
    fetchGenerationRef.current += 1;
    claimOperationIdRef.current = null;
    const resetGeneration = ownerGenerationRef.current;
    queueMicrotask(() => {
      if (ownerGenerationRef.current !== resetGeneration) return;
      setPendingRewardDiceCount(0);
      setPendingRewardQueue([]);
    });
    if (!client || !currentUserId || typeof window === "undefined") return;

    let cancelled = false;
    const snapshotLifecycle = createRealtimeSnapshotLifecycle();

    const requestAccountSnapshot = (shouldRequest: boolean) => {
      if (!shouldRequest) return;
      const promise = refreshPendingRewardAccount();
      if (!promise) {
        snapshotLifecycle.completeHydration(false);
        return;
      }
      void promise.then(
        () => snapshotLifecycle.completeHydration(true),
        () => snapshotLifecycle.completeHydration(false),
      );
    };

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
        fetchGenerationRef.current += 1;
        applyAuthoritativeSnapshot({ pendingDice: row.pending_dice, revision, updatedAt: row.updated_at });
      })
      .subscribe((status) => {
        if (cancelled) return;
        if (status !== "SUBSCRIBED") {
          snapshotLifecycle.handleStatus(status);
          return;
        }
        requestAccountSnapshot(snapshotLifecycle.handleStatus(status));
      });

    const refreshWhenVisible = () => requestAccountSnapshot(snapshotLifecycle.handleVisibilityChange(document.visibilityState));
    const refreshWhenPageShows = (event: PageTransitionEvent) => requestAccountSnapshot(snapshotLifecycle.handlePageShow(event.persisted));
    const refreshWhenOnline = () => requestAccountSnapshot(snapshotLifecycle.handleOnline());
    const refreshWhenOffline = () => { snapshotLifecycle.handleOffline(); };
    window.addEventListener("online", refreshWhenOnline);
    window.addEventListener("offline", refreshWhenOffline);
    window.addEventListener("pageshow", refreshWhenPageShows);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("online", refreshWhenOnline);
      window.removeEventListener("offline", refreshWhenOffline);
      window.removeEventListener("pageshow", refreshWhenPageShows);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      snapshotLifecycle.dispose();
      void client.removeChannel(channel);
    };
  }, [applyAuthoritativeSnapshot, client, currentUserId, refreshPendingRewardAccount]);

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
    if (allFulfilled) await refreshPendingRewardAccount();
  }

  async function queueTaskRewards(candidates: TaskRewardCandidate[]) {
    const excludedTaskIds = buildEffectiveTrackingExclusionSet(tasks);
    await fulfillCanonicalRewardEntitlements(candidates.filter((candidate) => Boolean(candidate.canonicalRewardEntitlementId) && !excludedTaskIds.has(candidate.task.id)));
  }

  async function claimPendingRewardBank() {
    if (!client || !currentUserId || pendingRewardDiceCount <= 0) return null;
    try {
      const operationId = claimOperationIdRef.current ?? createBrowserUuidV4();
      claimOperationIdRef.current = operationId;
      const claim = await client.rpc("adhdice_claim_pending_reward_dice", {
        p_operation_id: operationId,
      });
      const mutationRow = claim.data?.[0] as PendingRewardDiceMutationRow | undefined;
      if (claim.error || !mutationRow) {
        setMessage({ tone: "warn", text: claim.error?.message ?? "Could not claim the pending reward dice. Please try again." });
        await refreshPendingRewardAccount();
        return null;
      }
      const session = parseAuthoritativeClaimSession(mutationRow.result_payload);
      const economyResult = mutationRow.result_payload && typeof mutationRow.result_payload === "object"
        ? (mutationRow.result_payload as { economy?: Partial<EconomyState> }).economy
        : null;
      if (!session || !economyResult || typeof economyResult.points !== "number" || typeof economyResult.xp !== "number" || typeof economyResult.level !== "number" || typeof economyResult.tokens !== "number") {
        setMessage({ tone: "warn", text: "Supabase returned an incomplete reward result. The canonical balance will be refreshed." });
        await refreshPendingRewardAccount();
        return null;
      }
      applyMutationRow(mutationRow);
      clearPendingRewardQueue();
      setEconomy({ level: economyResult.level, points: economyResult.points, tokens: economyResult.tokens, xp: economyResult.xp });
      claimOperationIdRef.current = null;
      setMessage({
        tone: "good",
        text: `Reward claimed: +${session.totalFinalPoints} points, +${session.totalXp} XP, +${session.totalTokens} token${session.totalTokens === 1 ? "" : "s"}.`,
      });
      void refreshPendingRewardAccount();
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
    loadPendingRewardQueue,
    pendingRewardDiceCount,
    pendingRewardQueue,
    queueTaskRewards,
  };
}
