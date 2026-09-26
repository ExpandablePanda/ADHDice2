"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import { getLogicalDayKey } from "@/lib/logical-day";
import { RECORDS_RULES_VERSION, type PersistedRecordCurrent, type PersistedRecordEvent, type ProvisionalRecordCandidate } from "@/lib/records/types";
import { buildTaskEvidenceByRecordIdentity, type RecordTaskEvidenceByRecordIdentity } from "@/lib/records/evidence";
import {
  isRecordsBusyError,
  isRecordsSetupError,
  loadInvalidatedRecordEvents,
  loadLatestCompletedRecordsRun,
  loadRecordsSourceState,
  loadPersistedRecords,
  RECORDS_BUSY_MESSAGE,
  runRecordsPipeline,
  runRecordsPipelineSingleFlight,
  type LatestCompletedRecordsRun,
} from "@/lib/record-repository";
import { isRecordsFresh, isRecordsInvalidatedAfter, normalizeRecordsLogicalDayStart } from "@/lib/records/freshness";
import { recordsSourceStateFingerprint, recordsSourceStatesMatch, type RecordsSourceState } from "@/lib/records/source-state";
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
  invalidatedEventsLoaded: boolean;
  invalidatedEventsLoading: boolean;
  isLoading: boolean;
  isRecalculating: boolean;
  lastCalculatedAt: string | null;
  progress: string | null;
  provisionalCandidates: ProvisionalRecordCandidate[];
  setupRequired: boolean;
  taskEvidenceByRecordIdentity: RecordTaskEvidenceByRecordIdentity;
  warnings: string[];
};

const INITIAL_STATE: RecordsHookState = { currentRecords: [], error: null, events: [], hasDetailedEvidence: false, hasSuccessfulResult: false, invalidatedEventsLoaded: false, invalidatedEventsLoading: false, isLoading: false, isRecalculating: false, lastCalculatedAt: null, progress: null, provisionalCandidates: [], setupRequired: false, taskEvidenceByRecordIdentity: {}, warnings: [] };
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
    invalidatedEventsLoaded: Boolean(input.snapshot.invalidatedEventsLoaded),
    invalidatedEventsLoading: false,
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

export function restorePersistedRecords(current: RecordsInternalState, input: { currentRecords: PersistedRecordCurrent[]; evaluatedAt: string; events: PersistedRecordEvent[]; hasDetailedEvidence: boolean; invalidatedEventsLoaded?: boolean; ownerUserId: string; provisionalCandidates: ProvisionalRecordCandidate[]; sessionKey: string; taskEvidenceByRecordIdentity: RecordTaskEvidenceByRecordIdentity; warnings: string[] }): RecordsInternalState {
  return {
    ...current,
    currentRecords: input.currentRecords,
    error: null,
    events: input.events,
    hasDetailedEvidence: input.hasDetailedEvidence,
    hasSuccessfulResult: true,
    invalidatedEventsLoaded: Boolean(input.invalidatedEventsLoaded),
    invalidatedEventsLoading: false,
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
    invalidatedEventsLoaded: false,
    invalidatedEventsLoading: false,
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

function mergeRecordEvents(current: PersistedRecordEvent[], additional: PersistedRecordEvent[]) {
  const byId = new Map(current.map((event) => [event.id, event]));
  for (const event of additional) byId.set(event.id, event);
  return [...byId.values()].sort((left, right) => right.credited_date.localeCompare(left.credited_date) || right.created_at.localeCompare(left.created_at));
}

function logRecordsOpenDecision(input: {
  decision: "saved_source_fresh" | "source_changed" | "legacy_uncertified" | "explicit_refresh";
  fullPipelineRan: boolean;
  invalidatedEventsLoaded: boolean;
  owner: string;
  rulesMatch: boolean;
  sourceStateAvailable: boolean;
  sourceStateMatched: boolean;
  currentRowCount: number;
  validEventRowCount: number;
  sourceState?: RecordsSourceState | null;
}) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[records] open decision", {
    owner: input.owner,
    rulesMatch: input.rulesMatch,
    sourceStateAvailable: input.sourceStateAvailable,
    sourceStateMatched: input.sourceStateMatched,
    sourceStateFingerprint: recordsSourceStateFingerprint(input.sourceState),
    persistedCurrentRowCount: input.currentRowCount,
    validEventRowCount: input.validEventRowCount,
    invalidatedEventsLoaded: input.invalidatedEventsLoaded,
    decision: input.decision,
    fullPipelineRan: input.fullPipelineRan,
  });
}

export function useRecords({ active, client, logicalDayStart, timezone, userId }: { active: boolean; client: RecordsClient; logicalDayStart: string; timezone: string; userId: string | null }) {
  const sessionKey = userId ? buildRecordsSessionCacheKey({ logicalDayStart, timezone, userId }) : null;
  const cachedSessionSnapshot = active && sessionKey ? getRecordsSessionSnapshot(sessionKey) : null;
  const initialSnapshot = cachedSessionSnapshot ?? null;
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
  const invalidatedEventsRequestRef = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const invalidatedEventsLoadedKeyRef = useRef<string | null>(initialSnapshot?.invalidatedEventsLoaded ? sessionKey : null);

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

  const loadInvalidatedEvents = useCallback((): Promise<void> => {
    if (!client || !sessionKey || !userId) return Promise.resolve();
    if (invalidatedEventsLoadedKeyRef.current === sessionKey) return Promise.resolve();
    if (invalidatedEventsRequestRef.current?.key === sessionKey) return invalidatedEventsRequestRef.current.promise;
    const request = loadInvalidatedRecordEvents(client, userId)
      .then((events) => {
        if (latestOwnerRef.current !== userId || latestSessionKeyRef.current !== sessionKey) return;
        invalidatedEventsLoadedKeyRef.current = sessionKey;
        setState((current) => current.ownerUserId === userId && current.sessionKey === sessionKey
          ? { ...current, error: null, events: mergeRecordEvents(current.events, events), invalidatedEventsLoaded: true, invalidatedEventsLoading: false }
          : current);
      })
      .catch((error: unknown) => {
        if (latestOwnerRef.current === userId && latestSessionKeyRef.current === sessionKey) {
          const detail = error as { message?: string };
          setState((current) => current.ownerUserId === userId && current.sessionKey === sessionKey
            ? { ...current, error: detail.message ?? "Invalidated Record events could not be loaded.", invalidatedEventsLoading: false }
            : current);
        }
      })
      .finally(() => {
        if (invalidatedEventsRequestRef.current?.promise === request) invalidatedEventsRequestRef.current = null;
      });
    invalidatedEventsRequestRef.current = { key: sessionKey, promise: request };
    setState((current) => current.ownerUserId === userId && current.sessionKey === sessionKey
      ? { ...current, invalidatedEventsLoading: true }
      : current);
    return request;
  }, [client, sessionKey, userId]);

  useEffect(() => {
    latestOwnerRef.current = userId;
    latestSessionKeyRef.current = sessionKey;
  }, [sessionKey, userId]);

  useEffect(() => {
    if (invalidatedEventsLoadedKeyRef.current !== sessionKey) {
      invalidatedEventsLoadedKeyRef.current = initialSnapshot?.invalidatedEventsLoaded ? sessionKey : null;
    }
  }, [initialSnapshot?.invalidatedEventsLoaded, sessionKey]);

  useEffect(() => {
    if (!state.invalidatedEventsLoaded || !state.ownerUserId || !state.sessionKey || !state.lastCalculatedAt) return;
    setRecordsSessionSnapshot(state.sessionKey, {
      currentRecords: state.currentRecords,
      evaluatedAt: state.lastCalculatedAt,
      events: state.events,
      invalidatedEventsLoaded: true,
      provisionalCandidates: state.provisionalCandidates,
      taskEvidenceByRecordIdentity: state.taskEvidenceByRecordIdentity,
      warnings: state.warnings,
    });
  }, [state.currentRecords, state.events, state.invalidatedEventsLoaded, state.lastCalculatedAt, state.ownerUserId, state.provisionalCandidates, state.sessionKey, state.taskEvidenceByRecordIdentity, state.warnings]);

  useEffect(() => {
    if (!active || !client || !userId || runningRef.current) return;
    const explicitRefresh = refreshRequestedRef.current && refreshRequestedKeyRef.current === sessionKey;
    refreshRequestedRef.current = false;
    refreshRequestedKeyRef.current = null;
    const cached = sessionKey ? getRecordsSessionSnapshot(sessionKey) : null;
    const invalidatedAt = sessionKey ? readRecordsInvalidatedAt(getRecordsLocalStorage(), sessionKey) : null;

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
      let currentSourceState: RecordsSourceState | null = null;
      let sourceStateAvailable = false;
      let sourceStateMatched = false;
      let rulesMatch = false;
      let decision: "source_changed" | "legacy_uncertified" | "explicit_refresh" = explicitRefresh ? "explicit_refresh" : "legacy_uncertified";
      try {
        if (!explicitRefresh) {
          try {
            durableRun = await loadLatestCompletedRecordsRun(client, { logicalDayStart, timezone });
          } catch {
            durableRun = null;
          }

          try {
            currentSourceState = await loadRecordsSourceState(client);
            sourceStateAvailable = Boolean(currentSourceState);
          } catch {
            currentSourceState = null;
            sourceStateAvailable = false;
          }

          rulesMatch = Boolean(durableRun && recordsRunMatchesSettings(durableRun, { logicalDayStart, timezone }));
          sourceStateMatched = Boolean(currentSourceState && durableRun?.source_state && recordsSourceStatesMatch(durableRun.source_state, currentSourceState));
          const durableIsFresh = sourceStateAvailable
            ? Boolean(durableRun && rulesMatch && durableRun.source_state && sourceStateMatched)
            : Boolean(durableRun
              && rulesMatch
              && isRecordsFresh(durableRun.evaluated_at)
              && !isRecordsInvalidatedAfter(durableRun.evaluated_at, invalidatedAt));
          if (durableIsFresh) {
            if (generation === generationRef.current && latestOwnerRef.current === userId) {
              setState((current) => ({ ...current, error: null, isLoading: true, isRecalculating: false, progress: "Loading saved Records…" }));
            }
            const persisted = await loadPersistedRecords(client, userId);
            const details = resolveSavedDetails(sessionKey!, durableRun!.evaluated_at);
            if (generation !== generationRef.current || latestOwnerRef.current !== userId || latestSessionKeyRef.current !== sessionKey) return;
            clearRecordsInvalidation(getRecordsLocalStorage(), sessionKey!);
            logRecordsOpenDecision({
              currentRowCount: persisted.currentRecords.length,
              decision: sourceStateAvailable ? "saved_source_fresh" : "legacy_uncertified",
              fullPipelineRan: false,
              invalidatedEventsLoaded: invalidatedEventsLoadedKeyRef.current === sessionKey,
              owner: userId,
              rulesMatch,
              sourceStateAvailable,
              sourceStateMatched,
              sourceState: currentSourceState,
              validEventRowCount: persisted.events.filter((event) => event.validity_state === "valid").length,
            });
            setState((current) => {
              const keepInvalidatedEvents = invalidatedEventsLoadedKeyRef.current === sessionKey
                && current.ownerUserId === userId
                && current.sessionKey === sessionKey;
              return restorePersistedRecords(current, {
                ...details,
                currentRecords: persisted.currentRecords,
                evaluatedAt: durableRun!.evaluated_at,
                events: keepInvalidatedEvents
                  ? mergeRecordEvents(persisted.events, current.events.filter((event) => event.validity_state !== "valid"))
                  : persisted.events,
                invalidatedEventsLoaded: keepInvalidatedEvents,
                ownerUserId: userId,
                sessionKey: sessionKey!,
              });
            });
            return;
          }

          decision = sourceStateAvailable && durableRun?.source_state ? "source_changed" : "legacy_uncertified";

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
        logRecordsOpenDecision({
          currentRowCount: refreshResult.currentRecords.length,
          decision,
          fullPipelineRan: true,
          invalidatedEventsLoaded: false,
          owner: userId,
          rulesMatch,
          sourceStateAvailable: sourceStateAvailable || Boolean(result.sourceState),
          sourceStateMatched: sourceStateAvailable ? sourceStateMatched : Boolean(result.sourceState),
          sourceState: result.sourceState,
          validEventRowCount: refreshResult.events.filter((event) => event.validity_state === "valid").length,
        });
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
  return { ...visibleState, loadInvalidatedEvents, refresh };
}
