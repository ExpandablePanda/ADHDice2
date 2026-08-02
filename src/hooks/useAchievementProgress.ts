"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  buildAchievementCelebrations,
  buildAchievementProgressModel,
  emptyAchievementRuntimeSnapshot,
  getAchievementSnapshotReadiness,
  isCurrentAchievementLoad,
  mergeCelebrationQueue,
  reserveCelebrationAcknowledgement,
  shouldClaimAchievementNotifications,
  type AchievementCelebration,
  type AchievementRuntimeSnapshot,
  type AchievementSnapshotLoadState,
  type AchievementSnapshotReadiness,
} from "@/lib/achievement-progress";
import {
  buildDevelopmentAchievementTestCelebrations,
  createDevelopmentAchievementTestFixtures,
  type DevelopmentAchievementTestFixtureKind,
} from "@/lib/achievement-test-fixtures";
import {
  claimAchievementNotifications,
  loadAchievementRuntime,
  markAchievementNotificationSeen,
} from "@/lib/achievement-progress-repository";

type AchievementClient = ReturnType<typeof createBrowserSupabaseClient>;

type AchievementNotificationClaimToken = {
  client: AchievementClient;
  generation: number;
  userId: string;
};

export class AchievementNotificationClaimController {
  private client: AchievementClient | null = null;
  private generation = 0;
  private hasClaimed = false;
  private leaseId = 0;
  private userId: string | null = null;

  acquireOwner(client: AchievementClient | null, userId: string | null): number {
    this.syncOwner(client, userId);
    this.leaseId += 1;
    return this.leaseId;
  }

  releaseOwnerAfterReplayWindow(leaseId: number): void {
    queueMicrotask(() => {
      if (this.leaseId !== leaseId) return;
      this.client = null;
      this.userId = null;
      this.generation += 1;
      this.hasClaimed = false;
    });
  }

  syncOwner(client: AchievementClient | null, userId: string | null): number {
    if (this.client === client && this.userId === userId) return this.generation;
    this.client = client;
    this.userId = userId;
    this.generation += 1;
    this.hasClaimed = false;
    return this.generation;
  }

  get claimedUserId(): string | null {
    return this.hasClaimed ? this.userId : null;
  }

  claimOnce<TResult>(
    client: AchievementClient,
    userId: string,
    claim: () => Promise<TResult>,
  ): Promise<TResult | null> | null {
    if (this.client !== client || this.userId !== userId || this.hasClaimed) return null;
    this.hasClaimed = true;
    const token: AchievementNotificationClaimToken = { client, generation: this.generation, userId };
    return claim().then((result) => this.isCurrent(token) ? result : null);
  }

  private isCurrent(token: AchievementNotificationClaimToken): boolean {
    return this.client === token.client
      && this.userId === token.userId
      && this.generation === token.generation;
  }
}

const EMPTY_SNAPSHOT = emptyAchievementRuntimeSnapshot();
const INITIAL_LOAD_STATE: AchievementSnapshotLoadState = {
  error: null,
  ownerUserId: null,
  snapshot: EMPTY_SNAPSHOT,
  status: "no_user",
};

export function useAchievementProgress(client: AchievementClient, userId: string | null, active = true) {
  const [loadState, setLoadState] = useState<AchievementSnapshotLoadState>(INITIAL_LOAD_STATE);
  const loadRequestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++loadRequestIdRef.current;
    const requestedUserId = userId;
    if (!client || !requestedUserId || !active) {
      return () => {
        if (loadRequestIdRef.current === requestId) loadRequestIdRef.current += 1;
      };
    }
    const loadClient = client;
    const loadUserId = requestedUserId;

    async function loadForCurrentUser() {
      await Promise.resolve();
      if (!isCurrentAchievementLoad(requestId, loadRequestIdRef.current, loadUserId, loadUserId)) return;
      setLoadState({ error: null, ownerUserId: loadUserId, snapshot: EMPTY_SNAPSHOT, status: "loading" });
      const result = await loadAchievementRuntime(loadClient, loadUserId);
      if (!isCurrentAchievementLoad(requestId, loadRequestIdRef.current, loadUserId, loadUserId)) return;
      setLoadState({
        error: result.error,
        ownerUserId: loadUserId,
        snapshot: result.data,
        status: result.error ? "error" : "loaded",
      });
    }

    void loadForCurrentUser();
    return () => {
      if (loadRequestIdRef.current === requestId) loadRequestIdRef.current += 1;
    };
  }, [active, client, userId]);

  const readiness = getAchievementSnapshotReadiness(loadState, userId, Boolean(client));
  const isReadyForUser = readiness === "loaded" && loadState.ownerUserId === userId;
  const snapshot = isReadyForUser ? loadState.snapshot : EMPTY_SNAPSHOT;

  return {
    error: readiness === "error" ? loadState.error : null,
    isLoading: readiness === "loading",
    isReadyForUser,
    model: useMemo(() => buildAchievementProgressModel(snapshot), [snapshot]),
    readiness,
    snapshot,
    snapshotOwnerUserId: isReadyForUser ? loadState.ownerUserId : null,
  };
}

export function useAchievementNotifications({
  client,
  readiness,
  snapshot,
  snapshotOwnerUserId,
  userId,
}: {
  client: AchievementClient;
  readiness: AchievementSnapshotReadiness;
  snapshot: AchievementRuntimeSnapshot;
  snapshotOwnerUserId: string | null;
  userId: string | null;
}) {
  const isDevelopment = process.env.NODE_ENV !== "production";
  const [claimController] = useState(() => new AchievementNotificationClaimController());
  const owner = useMemo(() => ({ client, userId }), [client, userId]);
  const [queueState, setQueueState] = useState<{ items: AchievementCelebration[]; owner: typeof owner | null }>({ items: [], owner: null });
  const [claimErrorState, setClaimErrorState] = useState<{ error: string | null; owner: typeof owner | null }>({ error: null, owner: null });
  const [seenErrorState, setSeenErrorState] = useState<{ error: string | null; owner: typeof owner | null }>({ error: null, owner: null });
  const acknowledgedIdsRef = useRef<{ ids: Set<string>; owner: typeof owner | null }>({ ids: new Set(), owner: null });
  const developmentRunIdRef = useRef(0);

  useEffect(() => {
    const leaseId = claimController.acquireOwner(client, userId);
    return () => claimController.releaseOwnerAfterReplayWindow(leaseId);
  }, [claimController, client, userId]);

  useEffect(() => {
    if (!client || !shouldClaimAchievementNotifications({
      claimedUserId: claimController.claimedUserId,
      currentUserId: userId,
      readiness,
      snapshotOwnerUserId,
    })) return;
    const claimingUserId = userId!;
    const claim = claimController.claimOnce(
      client,
      claimingUserId,
      () => claimAchievementNotifications(client),
    );
    if (!claim) return;
    void claim.then((result) => {
      if (!result) return;
      setClaimErrorState({ error: result.error, owner });
      if (result.error) return;
      if (acknowledgedIdsRef.current.owner !== owner) {
        acknowledgedIdsRef.current = { ids: new Set(), owner };
      }
      const incoming = buildAchievementCelebrations(result.data, snapshot);
      setQueueState((current) => ({
        items: mergeCelebrationQueue(
          current.owner === owner ? current.items : [],
          incoming,
          acknowledgedIdsRef.current.ids,
        ),
        owner,
      }));
    });
  }, [claimController, client, owner, readiness, snapshot, snapshotOwnerUserId, userId]);

  const ownedQueue = useMemo(() => queueState.owner === owner ? queueState.items : [], [owner, queueState]);
  const acknowledgeCurrent = useCallback(async () => {
    const current = ownedQueue[0];
    if (acknowledgedIdsRef.current.owner !== owner) {
      acknowledgedIdsRef.current = { ids: new Set(), owner };
    }
    if (!current || !reserveCelebrationAcknowledgement(current.id, acknowledgedIdsRef.current.ids)) return;
    setQueueState((state) => ({
      ...state,
      items: state.items.filter((item) => item.id !== current.id),
    }));
    if (current.isDevelopmentTest) return;
    if (!client) return;
    const result = await markAchievementNotificationSeen(client, current.id);
    setSeenErrorState({ error: result.error, owner });
  }, [client, ownedQueue, owner]);

  const enqueueDevelopmentTestAchievements = useCallback((kind?: DevelopmentAchievementTestFixtureKind) => {
    if (process.env.NODE_ENV === "production") return;
    const runId = `run-${++developmentRunIdRef.current}`;
    const fixtures = createDevelopmentAchievementTestFixtures(runId);
    const selected = kind ? fixtures.filter((fixture) => fixture.kind === kind) : fixtures;
    const incoming = buildDevelopmentAchievementTestCelebrations(selected);
    setQueueState((current) => ({
      items: mergeCelebrationQueue(current.owner === owner ? current.items : [], incoming, new Set()),
      owner,
    }));
  }, [owner]);

  return {
    acknowledgeCurrent,
    activeCelebration: ownedQueue[0] ?? null,
    claimError: claimErrorState.owner === owner ? claimErrorState.error : null,
    enqueueDevelopmentTestAchievements: isDevelopment ? enqueueDevelopmentTestAchievements : undefined,
    queueLength: ownedQueue.length,
    seenError: seenErrorState.owner === owner ? seenErrorState.error : null,
  };
}
