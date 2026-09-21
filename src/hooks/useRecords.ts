"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import { getLogicalDayKey } from "@/lib/logical-day";
import { RECORDS_RULES_VERSION, type PersistedRecordCurrent, type PersistedRecordEvent, type ProvisionalRecordCandidate } from "@/lib/records/types";
import { buildTaskEvidenceByRecordIdentity, type RecordTaskEvidenceByRecordIdentity } from "@/lib/records/evidence";
import {
  isRecordsBusyError,
  isRecordsSetupError,
  loadLatestCompletedRecordsRun,
  loadPersistedRecords,
  RECORDS_BUSY_MESSAGE,
  runRecordsPipeline,
  runRecordsPipelineSingleFlight,
  type LatestCompletedRecordsRun,
} from "@/lib/record-repository";
import { isRecordsFresh, isRecordsInvalidatedAfter, normalizeRecordsLogicalDayStart } from "@/lib/records/freshness";
import {
  clearRecordsInvalidation,
  getRecordsLocalStorage,
  readRecordsInvalidatedAt,
  readRecordsLocalDetailCache,
  writeRecordsLocalDetailCache,
} from "@/lib/records/persistent-cache";
import { buildRecordsSessionCacheKey, getRecordsSessionSnapshot, setRecordsSessionSnapshot, type RecordsSessionRefresh, type RecordsSessionSnapshot } from "@/lib/records/session-cache";

type RecordsClient = ReturnType<typeof createBrowserSupabaseClient>;

export type RecordsHookState = {
  currentRecords: PersistedRecordCurrent[];
  error: string | null;
  events: PersistedRecordEvent[];
  hasDetailedEvidence: boolean;
  hasSuccessfulResult: boolean;
  isLoading: boolean;
  isRecalculating: boolean;
  lastCalculatedAt: string | null;
  progress: string | null;
  provisionalCandidates: ProvisionalRecordCandidate[];
  setupRequired: boolean;
  taskEvidenceByRecordIdentity: RecordTaskEvidenceByRecordIdentity;
  warnings: string[];
};

const INITIAL_STATE: RecordsHookState = { currentRecords: [], error: null, events: [], hasDetailedEvidence: false, hasSuccessfulResult: false, isLoading: false, isRecalculating: false, lastCalculatedAt: null, progress: null, provisionalCandidates: [], setupRequired: false, taskEvidenceByRecordIdentity: {}, warnings: [] };
export type RecordsInternalState = RecordsHookState & { ownerUserId: string | null; sessionKey?: string | null };
const INITIAL_INTERNAL_STATE: RecordsInternalState = { ...INITIAL_STATE, ownerUserId: null, sessionKey: null };

export type RecordsRefreshResult = RecordsSessionRefresh & { ownerUserId: string; sessionKey?: string | null };
export type RecordsRefreshOutcome = { error: string | null; success: boolean };

export function retainRecordsAfterRefreshFailure(current: RecordsInternalState, input: { error: string; ownerUserId: string; setupRequired: boolean }): RecordsInternalState {
  return { ...current, ...input, isLoading: false, isRecalculating: false, progress: null };
}

export function restoreRecordsSessionSnapshot(current: RecordsInternalState, input: { ownerUserId: string; sessionKey: string; snapshot: RecordsSessionSnapshot }): RecordsInternalState {
  return {
    ...current,
    currentRecords: input.snapshot.currentRecords,
    error: null,
    events: input.snapshot.events,
    hasDetailedEvidence: true,
    hasSuccessfulResult: true,
    isLoading: false,
    isRecalculating: false,
    lastCalculatedAt: input.snapshot.lastCalculatedAt,
    ownerUserId: input.ownerUserId,
    progress: null,
    provisionalCandidates: input.snapshot.provisionalCandidates,
    sessionKey: input.sessionKey,
    setupRequired: false,
    taskEvidenceByRecordIdentity: input.snapshot.taskEvidenceByRecordIdentity,
    warnings: input.snapshot.warnings,
  };
}

export function restorePersistedRecords(current: RecordsInternalState, input: { currentRecords: PersistedRecordCurrent[]; evaluatedAt: string; events: PersistedRecordEvent[]; hasDetailedEvidence: boolean; ownerUserId: string; provisionalCandidates: ProvisionalRecordCandidate[]; sessionKey: string; taskEvidenceByRecordIdentity: RecordTaskEvidenceByRecordIdentity; warnings: string[] }): RecordsInternalState {
  return {
    ...current,
    currentRecords: input.currentRecords,
    error: null,
    events: input.events,
    hasDetailedEvidence: input.hasDetailedEvidence,
    hasSuccessfulResult: true,
    isLoading: false,
    isRecalculating: false,
    lastCalculatedAt: input.evaluatedAt,
    ownerUserId: input.ownerUserId,
    progress: null,
    provisionalCandidates: input.provisionalCandidates,
    sessionKey: input.sessionKey,
    setupRequired: false,
    taskEvidenceByRecordIdentity: input.taskEvidenceByRecordIdentity,
    warnings: input.warnings,
  };
}

export function completeRecordsRefresh(current: RecordsInternalState, input: RecordsRefreshResult): RecordsInternalState {
  return {
    ...current,
    currentRecords: input.currentRecords,
    error: null,
    events: input.events,
    hasDetailedEvidence: true,
    hasSuccessfulResult: true,
    isLoading: false,
    isRecalculating: false,
    lastCalculatedAt: input.evaluatedAt,
    ownerUserId: input.ownerUserId,
    progress: null,
    provisionalCandidates: input.provisionalCandidates,
    sessionKey: input.sessionKey ?? current.sessionKey ?? null,
    setupRequired: false,
    taskEvidenceByRecordIdentity: input.taskEvidenceByRecordIdentity,
    warnings: input.warnings,
  };
}

export function recordsRunMatchesSettings(run: LatestCompletedRecordsRun, settings: { logicalDayStart: string; timezone: string }) {
  const runLogicalDayStart = normalizeRecordsLogicalDayStart(run.logical_day_start);
  const settingsLogicalDayStart = normalizeRecordsLogicalDayStart(settings.logicalDayStart);
  return Boolean(runLogicalDayStart && settingsLogicalDayStart)
    && run.rules_version === RECORDS_RULES_VERSION
    && run.timezone === settings.timezone
    && runLogicalDayStart === settingsLogicalDayStart;
}

function resolveSavedDetails(sessionKey: string, evaluatedAt: string) {
  const cached = readRecordsLocalDetailCache(getRecordsLocalStorage(), sessionKey, evaluatedAt);
  return cached
    ? {
      hasDetailedEvidence: true,
      provisionalCandidates: cached.provisionalCandidates,
      taskEvidenceByRecordIdentity: cached.taskEvidenceByRecordIdentity,
      warnings: cached.warnings,
    }
    : {
      hasDetailedEvidence: false,
      provisionalCandidates: [],
      taskEvidenceByRecordIdentity: {},
      warnings: [],
    };
}

export function useRecords({ active, client, logicalDayStart, timezone, userId }: { active: boolean; client: RecordsClient; logicalDayStart: string; timezone: string; userId: string | null }) {
  const sessionKey = userId ? buildRecordsSessionCacheKey({ logicalDayStart, timezone, userId }) : null;
  const cachedSessionSnapshot = active && sessionKey ? getRecordsSessionSnapshot(sessionKey) : null;
  const cachedInvalidatedAt = sessionKey ? readRecordsInvalidatedAt(getRecordsLocalStorage(), sessionKey) : null;
  const initialSnapshot = cachedSessionSnapshot
    && isRecordsFresh(cachedSessionSnapshot.lastCalculatedAt)
    && !isRecordsInvalidatedAfter(cachedSessionSnapshot.lastCalculatedAt, cachedInvalidatedAt)
    ? cachedSessionSnapshot
    : null;
  const [state, setState] = useState<RecordsInternalState>(() => initialSnapshot && userId && sessionKey
    ? restoreRecordsSessionSnapshot(INITIAL_INTERNAL_STATE, { ownerUserId: userId, sessionKey, snapshot: initialSnapshot })
    : INITIAL_INTERNAL_STATE);
  const [refreshToken, setRefreshToken] = useState(0);
  const runningRef = useRef(false);
  const generationRef = useRef(0);
  const latestOwnerRef = useRef(userId);
  const latestSessionKeyRef = useRef(sessionKey);
  const refreshRequestedRef = useRef(false);
  const refreshRequestedKeyRef = useRef<string | null>(null);
  const refreshRequestRef = useRef<{
    key: string;
    promise: Promise<RecordsRefreshOutcome>;
    resolve: (outcome: RecordsRefreshOutcome) => void;
  } | null>(null);

  const refresh = useCallback((): Promise<RecordsRefreshOutcome> => {
    if (!sessionKey) return Promise.resolve({ error: "Records cannot refresh without an authenticated user.", success: false });
    if (runningRef.current) return Promise.resolve({ error: RECORDS_BUSY_MESSAGE, success: false });
    if (refreshRequestRef.current?.key === sessionKey) return refreshRequestRef.current.promise;
    refreshRequestedRef.current = true;
    refreshRequestedKeyRef.current = sessionKey;
    let resolveRequest!: (outcome: RecordsRefreshOutcome) => void;
    const promise = new Promise<RecordsRefreshOutcome>((resolve) => { resolveRequest = resolve; });
    refreshRequestRef.current = { key: sessionKey, promise, resolve: resolveRequest };
    setRefreshToken((value) => value + 1);
    return promise;
  }, [sessionKey]);

  useEffect(() => {
    latestOwnerRef.current = userId;
    latestSessionKeyRef.current = sessionKey;
  }, [sessionKey, userId]);

  useEffect(() => {
    if (!active || !client || !userId || runningRef.current) return;
    const explicitRefresh = refreshRequestedRef.current && refreshRequestedKeyRef.current === sessionKey;
    refreshRequestedRef.current = false;
    refreshRequestedKeyRef.current = null;
    const cached = sessionKey ? getRecordsSessionSnapshot(sessionKey) : null;
    const invalidatedAt = sessionKey ? readRecordsInvalidatedAt(getRecordsLocalStorage(), sessionKey) : null;
    const cachedIsFresh = Boolean(cached && isRecordsFresh(cached.lastCalculatedAt) && !isRecordsInvalidatedAfter(cached.lastCalculatedAt, invalidatedAt));
    if (!explicitRefresh && cachedIsFresh) return;

    const generation = ++generationRef.current;
    runningRef.current = true;
    setState((current) => {
      const prior = current.sessionKey === sessionKey && current.ownerUserId === userId
        ? current
        : cached
          ? restoreRecordsSessionSnapshot(current, { ownerUserId: userId, sessionKey: sessionKey!, snapshot: cached })
          : current;
      return { ...prior, error: null, isLoading: !prior.hasSuccessfulResult, isRecalculating: false, ownerUserId: userId, progress: "Loading saved Records…", sessionKey, setupRequired: false };
    });
    const settings = { dayStartTime: logicalDayStart, timezone };
    const openLogicalDate = getLogicalDayKey(new Date(), settings);
    void (async () => {
      let durableRun: LatestCompletedRecordsRun | null = null;
      try {
        if (!explicitRefresh && !cachedIsFresh) {
          try {
            durableRun = await loadLatestCompletedRecordsRun(client, { logicalDayStart, timezone });
          } catch {
            durableRun = null;
          }

          const durableIsFresh = Boolean(durableRun
            && recordsRunMatchesSettings(durableRun, { logicalDayStart, timezone })
            && isRecordsFresh(durableRun.evaluated_at)
            && !isRecordsInvalidatedAfter(durableRun.evaluated_at, invalidatedAt));
          if (durableIsFresh) {
            if (generation === generationRef.current && latestOwnerRef.current === userId) {
              setState((current) => ({ ...current, error: null, isLoading: true, isRecalculating: false, progress: "Loading saved Records…" }));
            }
            const persisted = await loadPersistedRecords(client, userId);
            const details = resolveSavedDetails(sessionKey!, durableRun!.evaluated_at);
            if (generation !== generationRef.current || latestOwnerRef.current !== userId || latestSessionKeyRef.current !== sessionKey) return;
            setState((current) => restorePersistedRecords(current, {
              ...details,
              currentRecords: persisted.currentRecords,
              evaluatedAt: durableRun!.evaluated_at,
              events: persisted.events,
              ownerUserId: userId,
              sessionKey: sessionKey!,
            }));
            return;
          }

          if (durableRun && !cached?.hasSuccessfulResult) {
            try {
              const persisted = await loadPersistedRecords(client, userId);
              const details = resolveSavedDetails(sessionKey!, durableRun.evaluated_at);
              if (generation === generationRef.current && latestOwnerRef.current === userId && latestSessionKeyRef.current === sessionKey) {
                setState((current) => ({
                  ...restorePersistedRecords(current, {
                    ...details,
                    currentRecords: persisted.currentRecords,
                    evaluatedAt: durableRun!.evaluated_at,
                    events: persisted.events,
                    ownerUserId: userId,
                    sessionKey: sessionKey!,
                  }),
                  error: null,
                  isLoading: false,
                  isRecalculating: true,
                  progress: "Preparing Records",
                }));
              }
            } catch {
              // The full pipeline remains the recovery path when the retained saved result cannot be loaded.
            }
          }
        }

        if (generation === generationRef.current && latestOwnerRef.current === userId) {
          setState((current) => ({ ...current, error: null, isLoading: !current.hasSuccessfulResult, isRecalculating: true, progress: "Preparing Records" }));
        }
        const evaluatedAt = new Date().toISOString();
        const result = await runRecordsPipelineSingleFlight(sessionKey ?? userId, () => runRecordsPipeline(client, userId, { evaluatedAt, logicalDayStart, openLogicalDate, timezone }, (progress) => {
          if (generation === generationRef.current && latestOwnerRef.current === userId) setState((current) => ({ ...current, progress }));
        }));
        const refreshResult = {
          currentRecords: result.currentRecords,
          evaluatedAt: result.evaluation.evaluatedAt,
          events: result.events,
          provisionalCandidates: result.evaluation.provisionalCandidates,
          taskEvidenceByRecordIdentity: buildTaskEvidenceByRecordIdentity(result.evaluation.currentRecords),
          warnings: result.evaluation.warnings,
        } satisfies RecordsSessionRefresh;
        if (sessionKey) {
          setRecordsSessionSnapshot(sessionKey, refreshResult);
          const storage = getRecordsLocalStorage();
          clearRecordsInvalidation(storage, sessionKey);
          writeRecordsLocalDetailCache(storage, {
            lastCalculatedAt: refreshResult.evaluatedAt,
            provisionalCandidates: refreshResult.provisionalCandidates,
            sessionKey,
            taskEvidenceByRecordIdentity: refreshResult.taskEvidenceByRecordIdentity,
            warnings: refreshResult.warnings,
          });
        }
        if (generation !== generationRef.current || latestOwnerRef.current !== userId || latestSessionKeyRef.current !== sessionKey) return;
        setState((current) => completeRecordsRefresh(current, { ...refreshResult, ownerUserId: userId, sessionKey }));
        if (refreshRequestRef.current?.key === sessionKey) {
          refreshRequestRef.current.resolve({ error: null, success: true });
          refreshRequestRef.current = null;
        }
      } catch (error) {
        if (generation !== generationRef.current || latestOwnerRef.current !== userId || latestSessionKeyRef.current !== sessionKey) return;
        const detail = error as { code?: string; message?: string };
        const setupRequired = isRecordsSetupError(detail);
        const errorMessage = isRecordsBusyError(detail)
          ? RECORDS_BUSY_MESSAGE
          : setupRequired
            ? "Records storage is not installed for this environment yet."
            : (detail.message ?? "Records could not be recalculated.");
        setState((current) => retainRecordsAfterRefreshFailure(current, {
          error: errorMessage,
          ownerUserId: userId,
          setupRequired,
        }));
        if (refreshRequestRef.current?.key === sessionKey) {
          refreshRequestRef.current.resolve({ error: errorMessage, success: false });
          refreshRequestRef.current = null;
        }
      } finally {
        runningRef.current = false;
        if (refreshRequestRef.current?.key === sessionKey && (generation !== generationRef.current || latestOwnerRef.current !== userId || latestSessionKeyRef.current !== sessionKey)) {
          refreshRequestRef.current.resolve({ error: "Records refresh was interrupted.", success: false });
          refreshRequestRef.current = null;
        }
        if (latestOwnerRef.current !== userId || latestSessionKeyRef.current !== sessionKey) setRefreshToken((value) => value + 1);
      }
    })();
  }, [active, client, logicalDayStart, refreshToken, sessionKey, timezone, userId]);

  const visibleState = state.ownerUserId === userId && state.sessionKey === sessionKey
    ? state
    : initialSnapshot && userId && sessionKey
      ? restoreRecordsSessionSnapshot(state, { ownerUserId: userId, sessionKey, snapshot: initialSnapshot })
      : INITIAL_INTERNAL_STATE;
  return { ...visibleState, refresh };
}
