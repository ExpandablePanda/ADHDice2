"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import {
  createHomeRoutineSectionId,
  deleteHomeRoutineSection,
  EMPTY_HOME_TODO_STATE,
  getHomeRoutineSectionDefaultName,
  HOME_ROUTINE_UNSECTIONED_ID,
  hasMeaningfulHomeTodoState,
  canSyncHomeTodoStateToRemote,
  isHomeTodoHydratedForUser,
  moveHomeScratchpadTextToItems,
  normalizeHomeTodoTasksPerDay,
  normalizeHomeTodoState,
  moveHomeTodoTaskIdToUrgent,
  moveHomeUrgentTaskIdToTodo,
  moveHomeRoutineTaskIdToSection,
  reorderHomeScratchpadItems,
  reconcileHomeRoutineSectionAssignments,
  type HomeTodoState,
  type HomeTodoHydrationReadiness,
  type HomeTodoSyncStatus,
} from "@/lib/home-todo-state";
import {
  homeTodoRecoveryConflictCacheKey,
  parseHomeTodoRecoveryCache,
  shouldPreferRemoteHomeTodoState,
} from "@/lib/home-todo-recovery";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { startSerializedRealtimeChannel } from "@/lib/realtime-channel-lifecycle";
import { createBrowserUuidV4 } from "@/lib/browser-uuid";

const CACHE_PREFIX = "adhdice-home-todo";
const WRITE_DELAY_MS = 650;

function cacheKey(userId: string) {
  return `${CACHE_PREFIX}:${userId}`;
}

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isMissingTableError(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01"
    || error?.code === "PGRST205"
    || /adhdice_home_todo_state.*(not found|schema cache|does not exist)/i.test(error?.message ?? "");
}

export function useHomeTodoState(userId: string | null) {
  const [state, setState] = useState<HomeTodoState>({ ...EMPTY_HOME_TODO_STATE });
  const [syncStatusState, setSyncStatusState] = useState<{ ownerId: string | null; status: HomeTodoSyncStatus }>({ ownerId: userId, status: userId ? "loading" : "local" });
  const [hydrationState, setHydrationState] = useState<HomeTodoHydrationReadiness>({
    generation: 0,
    ownerId: null,
    remoteReady: false,
    status: "inactive",
  });
  const [stateOwnerId, setStateOwnerId] = useState<string | null>(null);
  const stateRef = useRef(state);
  const stateOwnerRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const remoteSupportedRef = useRef(true);
  const writeTimerRef = useRef<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const channelRemovalPromiseRef = useRef<Promise<void> | null>(null);
  const ownerGenerationRef = useRef(0);
  const renderedUserIdRef = useRef(userId);
  const hydrationRef = useRef<HomeTodoHydrationReadiness>(hydrationState);
  const pendingRemoteRef = useRef<{
    ownerId: string;
    generation: number;
    state: unknown;
    updatedAt: string | null;
    stateRevision: number;
    restoreGeneration: number;
  } | null>(null);
  const stateRevisionRef = useRef(0);
  const restoreGenerationRef = useRef(0);

  const canMutateForOwner = useCallback((ownerId: string | null) => Boolean(
    ownerId
    && renderedUserIdRef.current === ownerId
    && stateOwnerRef.current === ownerId
    && isHomeTodoHydratedForUser(hydrationRef.current, ownerId),
  ), []);

  const canSyncForOwner = useCallback((ownerId: string, generation: number) => Boolean(
    canMutateForOwner(ownerId)
    && ownerGenerationRef.current === generation
    && canSyncHomeTodoStateToRemote(hydrationRef.current, ownerId, generation)
    && remoteSupportedRef.current
    && dirtyRef.current
  ), [canMutateForOwner]);

  const visibleState = stateOwnerId === userId ? state : { ...EMPTY_HOME_TODO_STATE };
  const syncStatus = syncStatusState.ownerId === userId
    ? syncStatusState.status
    : userId ? "loading" : "local";
  const hydrationReady = isHomeTodoHydratedForUser(hydrationState, userId);

  useLayoutEffect(() => {
    if (renderedUserIdRef.current === userId) return;
    renderedUserIdRef.current = userId;
    ownerGenerationRef.current += 1;
    if (writeTimerRef.current !== null) window.clearTimeout(writeTimerRef.current);
    writeTimerRef.current = null;
    dirtyRef.current = false;
    pendingRemoteRef.current = null;
    stateRevisionRef.current = 0;
    restoreGenerationRef.current = 0;
    hydrationRef.current = {
      generation: ownerGenerationRef.current,
      ownerId: userId,
      remoteReady: false,
      status: userId ? "loading" : "inactive",
    };
  }, [userId]);

  const persistCache = useCallback((next: HomeTodoState, ownerId: string) => {
    if (!canMutateForOwner(ownerId)) return;
    try {
      window.localStorage.setItem(cacheKey(ownerId), JSON.stringify({
        cacheVersion: 1,
        state: next,
        stateRevision: stateRevisionRef.current,
        restoreGeneration: restoreGenerationRef.current,
      }));
    } catch {
      // Cache is best effort.
    }
  }, [canMutateForOwner]);

  const preserveSupersededCache = useCallback((
    ownerId: string,
    localGeneration: number,
    remoteGeneration: number,
    snapshot: HomeTodoState,
  ) => {
    if (!hasMeaningfulHomeTodoState(snapshot)) return;
    const key = homeTodoRecoveryConflictCacheKey(ownerId, localGeneration, remoteGeneration);
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, JSON.stringify({
        cacheVersion: 1,
        state: snapshot,
        stateRevision: stateRevisionRef.current,
        restoreGeneration: localGeneration,
      }));
    } catch {
      // Preserve the server restore even when localStorage is unavailable.
    }
  }, []);

  const setOwnerSyncStatus = useCallback((ownerId: string | null, status: HomeTodoSyncStatus) => {
    setSyncStatusState({ ownerId, status });
  }, []);

  const flush = useCallback(async (ownerId: string, generation: number) => {
    if (!canSyncForOwner(ownerId, generation) || stateOwnerRef.current !== ownerId) return;
    const client = createBrowserSupabaseClient();
    if (!client) {
      setOwnerSyncStatus(ownerId, "local");
      return;
    }
    const outgoing = stateRef.current;
    const expectedRestoreGeneration = restoreGenerationRef.current;
    setOwnerSyncStatus(ownerId, "saving");
    const { data, error } = await client.rpc("save_home_todo_state", {
      p_client_updated_at: outgoing.clientUpdatedAt,
      p_expected_restore_generation: expectedRestoreGeneration,
      p_state: outgoing,
    });
    if (ownerGenerationRef.current !== generation || renderedUserIdRef.current !== ownerId) return;
    if (error) {
      if (isMissingTableError(error) || error.code === "PGRST202") remoteSupportedRef.current = false;
      setOwnerSyncStatus(ownerId, "local");
      return;
    }
    const result = data && typeof data === "object" ? data as Record<string, unknown> : null;
    if (result?.status === "restore_conflict") {
      const remoteGeneration = Number.isSafeInteger(result.restore_generation)
        ? Number(result.restore_generation)
        : expectedRestoreGeneration;
      if (result.state && typeof result.state === "object") {
        preserveSupersededCache(ownerId, expectedRestoreGeneration, remoteGeneration, stateRef.current);
        const remote = normalizeHomeTodoState(result.state);
        const remoteUpdatedAt = typeof result.client_updated_at === "string"
          ? result.client_updated_at
          : remote.clientUpdatedAt;
        if (timestamp(remoteUpdatedAt) > timestamp(remote.clientUpdatedAt)) {
          remote.clientUpdatedAt = new Date(remoteUpdatedAt).toISOString();
        }
        restoreGenerationRef.current = remoteGeneration;
        stateRevisionRef.current = Number.isSafeInteger(result.state_revision) ? Number(result.state_revision) : 0;
        dirtyRef.current = false;
        stateRef.current = remote;
        stateOwnerRef.current = ownerId;
        setState(remote);
        setStateOwnerId(ownerId);
        persistCache(remote, ownerId);
        setOwnerSyncStatus(ownerId, "synced");
      } else {
        preserveSupersededCache(ownerId, expectedRestoreGeneration, remoteGeneration, stateRef.current);
        remoteSupportedRef.current = false;
        setOwnerSyncStatus(ownerId, "local");
      }
      return;
    }
    if (result?.status !== "saved") {
      setOwnerSyncStatus(ownerId, "local");
      return;
    }
    const savedGeneration = Number.isSafeInteger(result.restore_generation)
      ? Number(result.restore_generation)
      : expectedRestoreGeneration;
    if (savedGeneration === restoreGenerationRef.current) {
      stateRevisionRef.current = Number.isSafeInteger(result.state_revision)
        ? Number(result.state_revision)
        : stateRevisionRef.current;
    }
    if (stateOwnerRef.current === ownerId && stateRef.current.clientUpdatedAt === outgoing.clientUpdatedAt) {
      dirtyRef.current = false;
      persistCache(outgoing, ownerId);
      setOwnerSyncStatus(ownerId, "synced");
    }
  }, [canSyncForOwner, persistCache, preserveSupersededCache, setOwnerSyncStatus]);

  const scheduleWrite = useCallback((ownerId: string) => {
    const generation = ownerGenerationRef.current;
    if (!canSyncForOwner(ownerId, generation)) return;
    if (writeTimerRef.current !== null) window.clearTimeout(writeTimerRef.current);
    writeTimerRef.current = window.setTimeout(() => {
      writeTimerRef.current = null;
      void flush(ownerId, generation);
    }, WRITE_DELAY_MS);
  }, [canSyncForOwner, flush]);

  const commitState = useCallback((value: unknown) => {
    if (!userId || !canMutateForOwner(userId)) return false;
    const current = stateRef.current;
    const normalized = normalizeHomeTodoState(value);
    const nextTimestamp = new Date(Math.max(Date.now(), timestamp(current.clientUpdatedAt) + 1)).toISOString();
    const next = normalizeHomeTodoState({
      ...normalized,
      clientUpdatedAt: nextTimestamp,
      schemaVersion: 8,
    });
    dirtyRef.current = hydrationRef.current.remoteReady;
    stateRef.current = next;
    stateOwnerRef.current = userId;
    setState(next);
    setStateOwnerId(userId);
    persistCache(next, userId);
    setOwnerSyncStatus(userId, hydrationRef.current.remoteReady && remoteSupportedRef.current ? "saving" : "local");
    scheduleWrite(userId);
    return true;
  }, [canMutateForOwner, persistCache, scheduleWrite, setOwnerSyncStatus, userId]);

  const applyRemote = useCallback((
    value: unknown,
    remoteClientUpdatedAt: string | null,
    ownerId: string,
    generation: number,
    remoteRestoreGeneration: number,
    remoteStateRevision: number,
  ) => {
    if (ownerGenerationRef.current !== generation || renderedUserIdRef.current !== ownerId) return;
    if (!isHomeTodoHydratedForUser(hydrationRef.current, ownerId)) {
      pendingRemoteRef.current = {
        generation,
        ownerId,
        state: value,
        updatedAt: remoteClientUpdatedAt,
        stateRevision: remoteStateRevision,
        restoreGeneration: remoteRestoreGeneration,
      };
      return;
    }
    const remote = normalizeHomeTodoState(value);
    if (remoteClientUpdatedAt && timestamp(remoteClientUpdatedAt) > timestamp(remote.clientUpdatedAt)) {
      remote.clientUpdatedAt = new Date(remoteClientUpdatedAt).toISOString();
    }
    if (stateOwnerRef.current !== ownerId) return;
    if (remoteRestoreGeneration !== restoreGenerationRef.current) {
      preserveSupersededCache(ownerId, restoreGenerationRef.current, remoteRestoreGeneration, stateRef.current);
      restoreGenerationRef.current = remoteRestoreGeneration;
      stateRevisionRef.current = remoteStateRevision;
      hydrationRef.current = { ...hydrationRef.current, remoteReady: true, status: "ready-remote" };
      setHydrationState(hydrationRef.current);
      dirtyRef.current = false;
      stateRef.current = remote;
      stateOwnerRef.current = ownerId;
      setState(remote);
      setStateOwnerId(ownerId);
      persistCache(remote, ownerId);
      setOwnerSyncStatus(ownerId, "synced");
      return;
    }
    if (timestamp(remote.clientUpdatedAt) <= timestamp(stateRef.current.clientUpdatedAt)) {
      stateRevisionRef.current = Math.max(stateRevisionRef.current, remoteStateRevision);
      hydrationRef.current = { ...hydrationRef.current, remoteReady: true, status: "ready-remote" };
      setHydrationState(hydrationRef.current);
      if (timestamp(stateRef.current.clientUpdatedAt) > timestamp(remote.clientUpdatedAt) && hasMeaningfulHomeTodoState(stateRef.current)) {
        dirtyRef.current = true;
        setOwnerSyncStatus(ownerId, "saving");
        scheduleWrite(ownerId);
      }
      return;
    }
    hydrationRef.current = { ...hydrationRef.current, remoteReady: true, status: "ready-remote" };
    setHydrationState(hydrationRef.current);
    stateRevisionRef.current = remoteStateRevision;
    restoreGenerationRef.current = remoteRestoreGeneration;
    dirtyRef.current = false;
    stateRef.current = remote;
    stateOwnerRef.current = ownerId;
    setState(remote);
    setStateOwnerId(ownerId);
    persistCache(remote, ownerId);
    setOwnerSyncStatus(ownerId, "synced");
  }, [persistCache, preserveSupersededCache, scheduleWrite, setOwnerSyncStatus]);

  useEffect(() => {
    const ownerGeneration = ownerGenerationRef.current + 1;
    ownerGenerationRef.current = ownerGeneration;
    hydrationRef.current = {
      generation: ownerGeneration,
      ownerId: userId,
      remoteReady: false,
      status: userId ? "loading" : "inactive",
    };
    setHydrationState(hydrationRef.current);
    pendingRemoteRef.current = null;
    if (!userId) {
      stateRef.current = { ...EMPTY_HOME_TODO_STATE };
      stateOwnerRef.current = null;
      window.queueMicrotask(() => {
          if (ownerGenerationRef.current !== ownerGeneration) return;
          setState({ ...EMPTY_HOME_TODO_STATE });
          setStateOwnerId(null);
        setOwnerSyncStatus(null, "local");
      });
      return;
    }
    remoteSupportedRef.current = true;
    dirtyRef.current = false;
    let cached = { ...EMPTY_HOME_TODO_STATE };
    let cachedGeneration = 0;
    let cachedRevision = 0;
    try {
      const cache = parseHomeTodoRecoveryCache(JSON.parse(window.localStorage.getItem(cacheKey(userId)) ?? "null"));
      cached = cache.state;
      cachedGeneration = cache.restoreGeneration;
      cachedRevision = cache.stateRevision;
    } catch {
      // Invalid cache normalizes to empty.
    }
    restoreGenerationRef.current = cachedGeneration;
    stateRevisionRef.current = cachedRevision;
    stateRef.current = cached;
    stateOwnerRef.current = userId;

    const client = createBrowserSupabaseClient();
    window.queueMicrotask(() => {
      if (ownerGenerationRef.current !== ownerGeneration || renderedUserIdRef.current !== userId) return;
      setState(cached);
      setStateOwnerId(userId);
      setOwnerSyncStatus(userId, client ? "loading" : "local");
    });
    if (!client) {
      hydrationRef.current = { ...hydrationRef.current, status: "ready-local" };
      setHydrationState(hydrationRef.current);
      return () => {
        if (ownerGenerationRef.current === ownerGeneration) {
          hydrationRef.current = { ...hydrationRef.current, status: "loading" };
          ownerGenerationRef.current += 1;
        }
      };
    }
    let alive = true;
    const isCurrentOwnerGeneration = () => alive
      && ownerGenerationRef.current === ownerGeneration
      && renderedUserIdRef.current === userId;
    const finishRemoteRead = (status: "local" | "synced" | "saving", dirty: boolean) => {
      if (!isCurrentOwnerGeneration()) return;
      dirtyRef.current = dirty;
      hydrationRef.current = { ...hydrationRef.current, remoteReady: true, status: "ready-remote" };
      setHydrationState(hydrationRef.current);
      setOwnerSyncStatus(userId, status);
      if (dirty) scheduleWrite(userId);
      const pending = pendingRemoteRef.current;
      pendingRemoteRef.current = null;
      if (pending?.ownerId === userId && pending.generation === ownerGeneration) {
        applyRemote(
          pending.state,
          pending.updatedAt,
          userId,
          ownerGeneration,
          pending.restoreGeneration,
          pending.stateRevision,
        );
      }
    };
    void client
      .from("adhdice_home_todo_state")
      .select("state,client_updated_at,state_revision,restore_generation")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!isCurrentOwnerGeneration()) return;
        if (error) {
          if (isMissingTableError(error)) remoteSupportedRef.current = false;
          hydrationRef.current = { ...hydrationRef.current, status: "ready-local" };
          setHydrationState(hydrationRef.current);
          setOwnerSyncStatus(userId, "local");
          const pending = pendingRemoteRef.current;
          pendingRemoteRef.current = null;
          if (pending?.ownerId === userId && pending.generation === ownerGeneration) {
            applyRemote(
              pending.state,
              pending.updatedAt,
              userId,
              ownerGeneration,
              pending.restoreGeneration,
              pending.stateRevision,
            );
          }
          return;
        }
        let hydratedState = cached;
        let syncStatusAfterRead: HomeTodoSyncStatus = "synced";
        let isDirty = false;
        let shouldPersistHydratedState = false;
        if (data) {
          const remote = normalizeHomeTodoState(data.state);
          const remoteGeneration = Number.isSafeInteger(data.restore_generation) ? data.restore_generation : 0;
          const remoteRevision = Number.isSafeInteger(data.state_revision) ? data.state_revision : 0;
          const remoteTimestamp = timestamp(data.client_updated_at ?? remote.clientUpdatedAt);
          const preferRemote = shouldPreferRemoteHomeTodoState(
            { state: cached, restoreGeneration: cachedGeneration },
            { state: remote, restoreGeneration: remoteGeneration },
          );
          if (preferRemote) {
            if (cachedGeneration !== remoteGeneration) {
              preserveSupersededCache(userId, cachedGeneration, remoteGeneration, cached);
            }
            if (data.client_updated_at && timestamp(data.client_updated_at) > timestamp(remote.clientUpdatedAt)) {
              remote.clientUpdatedAt = new Date(data.client_updated_at).toISOString();
            }
            hydratedState = remote;
            shouldPersistHydratedState = true;
            restoreGenerationRef.current = remoteGeneration;
            stateRevisionRef.current = remoteRevision;
          } else if (timestamp(cached.clientUpdatedAt) > remoteTimestamp) {
            syncStatusAfterRead = "saving";
            isDirty = true;
          } else {
            restoreGenerationRef.current = remoteGeneration;
            stateRevisionRef.current = remoteRevision;
          }
        } else if (hasMeaningfulHomeTodoState(cached)) {
          if (cachedGeneration === 0) {
            syncStatusAfterRead = "saving";
            isDirty = true;
          } else {
            remoteSupportedRef.current = false;
            syncStatusAfterRead = "local";
          }
        }
        stateRef.current = hydratedState;
        stateOwnerRef.current = userId;
        setState(hydratedState);
        setStateOwnerId(userId);
        finishRemoteRead(syncStatusAfterRead, isDirty);
        if (shouldPersistHydratedState) persistCache(stateRef.current, userId);
      });

    const stopRealtimeChannel = startSerializedRealtimeChannel({
      channelRef,
      channelRemovalPromiseRef,
      createChannel: () => client.channel(`adhdice_home_todo_state:${userId}:${createBrowserUuidV4()}`),
      subscribe: (thisChannel) => {
        const isCurrentChannel = () => alive
          && ownerGenerationRef.current === ownerGeneration
          && channelRef.current === thisChannel;
        thisChannel
          .on("postgres_changes", {
            event: "*",
            filter: `user_id=eq.${userId}`,
            schema: "public",
            table: "adhdice_home_todo_state",
          }, (payload) => {
            if (!isCurrentChannel()) return;
            const row = payload.new as {
              client_updated_at?: string;
              restore_generation?: number;
              state?: unknown;
              state_revision?: number;
            };
            if (row.state) {
              applyRemote(
                row.state,
                row.client_updated_at ?? null,
                userId,
                ownerGeneration,
                Number.isSafeInteger(row.restore_generation) ? row.restore_generation! : 0,
                Number.isSafeInteger(row.state_revision) ? row.state_revision! : 0,
              );
            }
          })
          .subscribe();
      },
      removeChannel: (thisChannel) => client.removeChannel(thisChannel),
    });

    return () => {
      alive = false;
      if (writeTimerRef.current !== null) window.clearTimeout(writeTimerRef.current);
      if (dirtyRef.current && ownerGenerationRef.current === ownerGeneration) void flush(userId, ownerGeneration);
      if (hydrationRef.current.generation === ownerGeneration) {
        hydrationRef.current = { ...hydrationRef.current, remoteReady: false, status: "loading" };
      }
      ownerGenerationRef.current += 1;
      stopRealtimeChannel();
    };
  }, [applyRemote, flush, persistCache, preserveSupersededCache, scheduleWrite, setOwnerSyncStatus, userId]);

  const updateTaskIds = useCallback((updater: (taskIds: string[]) => string[]) => {
    if (!canMutateForOwner(userId)) return;
    const current = stateRef.current;
    const taskIds = normalizeHomeTodoState({ ...current, taskIds: updater(current.taskIds) }).taskIds;
    if (taskIds.length === current.taskIds.length && taskIds.every((taskId, index) => taskId === current.taskIds[index])) {
      return;
    }
    commitState({ ...current, taskIds });
  }, [canMutateForOwner, commitState, userId]);

  const updateTasksPerDay = useCallback((tasksPerDay: unknown) => {
    if (!canMutateForOwner(userId)) return;
    const current = stateRef.current;
    const nextTasksPerDay = normalizeHomeTodoTasksPerDay(tasksPerDay);
    if (nextTasksPerDay === current.tasksPerDay) return;
    commitState({ ...current, tasksPerDay: nextTasksPerDay });
  }, [canMutateForOwner, commitState, userId]);

  const updateTaskDayOffset = useCallback((taskId: string, dayOffset: number | null) => {
    if (!canMutateForOwner(userId)) return;
    const current = stateRef.current;
    const taskDayOffsets = { ...current.taskDayOffsets };
    if (dayOffset === null) delete taskDayOffsets[taskId];
    else taskDayOffsets[taskId] = dayOffset;
    const currentTaskDayOffset = current.taskDayOffsets[taskId] ?? null;
    if (currentTaskDayOffset === dayOffset) return;
    commitState({ ...current, taskDayOffsets });
  }, [canMutateForOwner, commitState, userId]);

  const updateRoutineTaskIds = useCallback((updater: (taskIds: string[]) => string[]) => {
    if (!canMutateForOwner(userId)) return;
    const current = stateRef.current;
    const routineTaskIds = updater(current.routineTaskIds);
    const routineSectionState = reconcileHomeRoutineSectionAssignments(
      current.routineSections,
      current.routineSectionIdByTaskId,
      routineTaskIds,
    );
    const normalized = normalizeHomeTodoState({
      ...current,
      ...routineSectionState,
      routineTaskIds,
    });
    if (
      normalized.routineTaskIds.length === current.routineTaskIds.length
      && normalized.routineTaskIds.every((taskId, index) => taskId === current.routineTaskIds[index])
      && JSON.stringify(normalized.routineSections) === JSON.stringify(current.routineSections)
      && JSON.stringify(normalized.routineSectionIdByTaskId) === JSON.stringify(current.routineSectionIdByTaskId)
    ) {
      return;
    }
    commitState(normalized);
  }, [canMutateForOwner, commitState, userId]);

  const createRoutineSection = useCallback(() => {
    if (!canMutateForOwner(userId)) return;
    const current = stateRef.current;
    const section = {
      id: createHomeRoutineSectionId(current.routineSections.map((entry) => entry.id)),
      name: getHomeRoutineSectionDefaultName(current.routineSections),
    };
    commitState({ ...current, routineSections: [...current.routineSections, section] });
  }, [canMutateForOwner, commitState, userId]);

  const deleteRoutineSection = useCallback((sectionId: string) => {
    if (!canMutateForOwner(userId)) return false;
    const current = stateRef.current;
    const nextRoutineState = deleteHomeRoutineSection(
      current.routineSections,
      current.routineSectionIdByTaskId,
      current.routineTaskIds,
      sectionId,
    );
    if (!nextRoutineState) return false;
    commitState({ ...current, ...nextRoutineState });
    return true;
  }, [canMutateForOwner, commitState, userId]);

  const updateRoutineSectionName = useCallback((sectionId: string, name: string) => {
    if (!canMutateForOwner(userId)) return;
    const current = stateRef.current;
    const sectionIndex = current.routineSections.findIndex((section) => section.id === sectionId);
    if (sectionIndex < 0) return;
    const routineSections = current.routineSections.map((section, index) => index === sectionIndex
      ? { ...section, name: name.trim() || `Section ${index + 1}` }
      : section);
    if (JSON.stringify(routineSections) === JSON.stringify(current.routineSections)) return;
    commitState({ ...current, routineSections });
  }, [canMutateForOwner, commitState, userId]);

  const updateRoutineTaskSection = useCallback((taskId: string, sectionId: string) => {
    if (!canMutateForOwner(userId)) return;
    const current = stateRef.current;
    if (sectionId !== HOME_ROUTINE_UNSECTIONED_ID && !current.routineSections.some((section) => section.id === sectionId)) return;
    const currentRoutineState = reconcileHomeRoutineSectionAssignments(
      current.routineSections,
      current.routineSectionIdByTaskId,
      current.routineTaskIds,
    );
    const nextRoutineState = moveHomeRoutineTaskIdToSection(
      current.routineTaskIds,
      currentRoutineState.routineSectionIdByTaskId,
      taskId,
      sectionId,
    );
    if (
      JSON.stringify(nextRoutineState.routineTaskIds) === JSON.stringify(current.routineTaskIds)
      && JSON.stringify(nextRoutineState.routineSectionIdByTaskId) === JSON.stringify(currentRoutineState.routineSectionIdByTaskId)
    ) return;
    commitState({ ...current, ...nextRoutineState });
  }, [canMutateForOwner, commitState, userId]);

  const updateUrgentTaskIds = useCallback((updater: (taskIds: string[]) => string[]) => {
    if (!canMutateForOwner(userId)) return;
    const current = stateRef.current;
    const urgentTaskIds = normalizeHomeTodoState({ ...current, urgentTaskIds: updater(current.urgentTaskIds) }).urgentTaskIds;
    if (urgentTaskIds.length === current.urgentTaskIds.length && urgentTaskIds.every((taskId, index) => taskId === current.urgentTaskIds[index])) return;
    commitState({ ...current, urgentTaskIds });
  }, [canMutateForOwner, commitState, userId]);

  const moveUrgentTaskToTodo = useCallback((taskId: string, dayOffset: number) => {
    if (!canMutateForOwner(userId)) return;
    const current = stateRef.current;
    const nextMembership = moveHomeUrgentTaskIdToTodo(current, taskId, dayOffset);
    if (
      JSON.stringify(nextMembership.urgentTaskIds) === JSON.stringify(current.urgentTaskIds)
      && JSON.stringify(nextMembership.taskIds) === JSON.stringify(current.taskIds)
      && JSON.stringify(nextMembership.taskDayOffsets) === JSON.stringify(current.taskDayOffsets)
    ) return;
    commitState({ ...current, ...nextMembership });
  }, [canMutateForOwner, commitState, userId]);

  const moveTodoTaskToUrgent = useCallback((taskId: string) => {
    if (!canMutateForOwner(userId)) return;
    const current = stateRef.current;
    const nextMembership = moveHomeTodoTaskIdToUrgent(current, taskId);
    if (
      JSON.stringify(nextMembership.urgentTaskIds) === JSON.stringify(current.urgentTaskIds)
      && JSON.stringify(nextMembership.taskIds) === JSON.stringify(current.taskIds)
      && JSON.stringify(nextMembership.taskDayOffsets) === JSON.stringify(current.taskDayOffsets)
    ) return;
    commitState({ ...current, ...nextMembership });
  }, [canMutateForOwner, commitState, userId]);

  const saveScratchpadText = useCallback((text: string) => {
    if (!canMutateForOwner(userId)) return false;
    const current = stateRef.current;
    if (current.scratchpadText === text) return true;
    commitState({ ...current, scratchpadText: text });
    return true;
  }, [canMutateForOwner, commitState, userId]);

  const moveScratchpadTextToItems = useCallback((text: string) => {
    if (!canMutateForOwner(userId)) return false;
    const current = stateRef.current;
    const nextScratchpadState = moveHomeScratchpadTextToItems(current, text);
    if (!nextScratchpadState) return false;
    commitState({ ...current, ...nextScratchpadState });
    return true;
  }, [canMutateForOwner, commitState, userId]);

  const updateScratchpadItem = useCallback((itemId: string, text: string) => {
    if (!canMutateForOwner(userId)) return false;
    const normalizedText = text.trim();
    if (!normalizedText) return false;
    const current = stateRef.current;
    const itemIndex = current.scratchpadItems.findIndex((item) => item.id === itemId);
    if (itemIndex < 0) return false;
    if (current.scratchpadItems[itemIndex]!.text === normalizedText) return true;
    const scratchpadItems = current.scratchpadItems.map((item, index) => index === itemIndex ? { ...item, text: normalizedText } : item);
    commitState({ ...current, scratchpadItems });
    return true;
  }, [canMutateForOwner, commitState, userId]);

  const deleteScratchpadItem = useCallback((itemId: string) => {
    if (!canMutateForOwner(userId)) return;
    const current = stateRef.current;
    const scratchpadItems = current.scratchpadItems.filter((item) => item.id !== itemId);
    if (scratchpadItems.length === current.scratchpadItems.length) return;
    commitState({ ...current, scratchpadItems });
  }, [canMutateForOwner, commitState, userId]);

  const reorderScratchpadItems = useCallback((orderedIds: readonly string[]) => {
    if (!canMutateForOwner(userId)) return;
    const current = stateRef.current;
    const scratchpadItems = reorderHomeScratchpadItems(current.scratchpadItems, orderedIds);
    if (JSON.stringify(scratchpadItems) === JSON.stringify(current.scratchpadItems)) return;
    commitState({ ...current, scratchpadItems });
  }, [canMutateForOwner, commitState, userId]);

  const hydration: HomeTodoHydrationReadiness = hydrationState.ownerId === userId ? hydrationState : {
    generation: hydrationState.generation,
    ownerId: userId,
    remoteReady: false,
    status: userId ? "loading" : "inactive",
  };

  return {
    createRoutineSection,
    deleteRoutineSection,
    deleteScratchpadItem,
    moveTodoTaskToUrgent,
    moveUrgentTaskToTodo,
    reorderScratchpadItems,
    moveScratchpadTextToItems,
    saveScratchpadText,
    hydrationReady,
    hydration,
    state: visibleState,
    syncStatus,
    updateRoutineSectionName,
    updateRoutineTaskIds,
    updateRoutineTaskSection,
    updateScratchpadItem,
    updateTaskDayOffset,
    updateTaskIds,
    updateTasksPerDay,
    updateUrgentTaskIds,
  };
}
