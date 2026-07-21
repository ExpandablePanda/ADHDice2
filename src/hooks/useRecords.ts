"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import { getLogicalDayKey } from "@/lib/logical-day";
import type { PersistedRecordCurrent, PersistedRecordEvent, ProvisionalRecordCandidate } from "@/lib/records/types";
import { isRecordsBusyError, isRecordsSetupError, RECORDS_BUSY_MESSAGE, runRecordsPipeline, runRecordsPipelineSingleFlight } from "@/lib/record-repository";

type RecordsClient = ReturnType<typeof createBrowserSupabaseClient>;

export type RecordsHookState = {
  currentRecords: PersistedRecordCurrent[];
  error: string | null;
  events: PersistedRecordEvent[];
  hasSuccessfulResult: boolean;
  isLoading: boolean;
  isRecalculating: boolean;
  lastCalculatedAt: string | null;
  progress: string | null;
  provisionalCandidates: ProvisionalRecordCandidate[];
  setupRequired: boolean;
  warnings: string[];
};

const INITIAL_STATE: RecordsHookState = { currentRecords: [], error: null, events: [], hasSuccessfulResult: false, isLoading: false, isRecalculating: false, lastCalculatedAt: null, progress: null, provisionalCandidates: [], setupRequired: false, warnings: [] };
export type RecordsInternalState = RecordsHookState & { ownerUserId: string | null };
const INITIAL_INTERNAL_STATE: RecordsInternalState = { ...INITIAL_STATE, ownerUserId: null };

export function retainRecordsAfterRefreshFailure(current: RecordsInternalState, input: { error: string; ownerUserId: string; setupRequired: boolean }): RecordsInternalState {
  return { ...current, ...input, isLoading: false, isRecalculating: false, progress: null };
}

export function completeRecordsRefresh(current: RecordsInternalState, input: {
  currentRecords: PersistedRecordCurrent[];
  evaluatedAt: string;
  events: PersistedRecordEvent[];
  ownerUserId: string;
  provisionalCandidates: ProvisionalRecordCandidate[];
  warnings: string[];
}): RecordsInternalState {
  return { ...current, ...input, error: null, hasSuccessfulResult: true, isLoading: false, isRecalculating: false, lastCalculatedAt: input.evaluatedAt, progress: null, setupRequired: false };
}

export function useRecords({ active, client, logicalDayStart, timezone, userId }: { active: boolean; client: RecordsClient; logicalDayStart: string; timezone: string; userId: string | null }) {
  const [state, setState] = useState<RecordsInternalState>(INITIAL_INTERNAL_STATE);
  const [refreshToken, setRefreshToken] = useState(0);
  const runningRef = useRef(false);
  const generationRef = useRef(0);
  const latestOwnerRef = useRef(userId);

  const refresh = useCallback(() => {
    if (!runningRef.current) setRefreshToken((value) => value + 1);
  }, []);

  useEffect(() => {
    latestOwnerRef.current = userId;
  }, [userId]);

  useEffect(() => {
    if (!active || !client || !userId || runningRef.current) return;
    const generation = ++generationRef.current;
    runningRef.current = true;
    setState((current) => ({ ...current, error: null, isLoading: current.ownerUserId !== userId || current.lastCalculatedAt === null, isRecalculating: true, ownerUserId: userId, progress: "Preparing Records", setupRequired: false }));
    const settings = { dayStartTime: logicalDayStart, timezone };
    const openLogicalDate = getLogicalDayKey(new Date(), settings);
    void (async () => {
      try {
        const evaluatedAt = new Date().toISOString();
        const result = await runRecordsPipelineSingleFlight(userId, () => runRecordsPipeline(client, userId, { evaluatedAt, logicalDayStart, openLogicalDate, timezone }, (progress) => {
          if (generation === generationRef.current && latestOwnerRef.current === userId) setState((current) => ({ ...current, progress }));
        }));
        if (generation !== generationRef.current || latestOwnerRef.current !== userId) return;
        setState((current) => completeRecordsRefresh(current, {
          currentRecords: result.currentRecords,
          evaluatedAt,
          events: result.events,
          ownerUserId: userId,
          provisionalCandidates: result.evaluation.provisionalCandidates,
          warnings: result.evaluation.warnings,
        }));
      } catch (error) {
        if (generation !== generationRef.current || latestOwnerRef.current !== userId) return;
        const detail = error as { code?: string; message?: string };
        const setupRequired = isRecordsSetupError(detail);
        setState((current) => retainRecordsAfterRefreshFailure(current, {
          error: isRecordsBusyError(detail)
            ? RECORDS_BUSY_MESSAGE
            : setupRequired
              ? "Records storage is not installed for this environment yet."
              : (detail.message ?? "Records could not be recalculated."),
          ownerUserId: userId,
          setupRequired,
        }));
      } finally {
        runningRef.current = false;
        if (latestOwnerRef.current !== userId) setRefreshToken((value) => value + 1);
      }
    })();
  }, [active, client, logicalDayStart, refreshToken, timezone, userId]);

  const visibleState = state.ownerUserId === userId ? state : INITIAL_INTERNAL_STATE;
  return { ...visibleState, refresh };
}
