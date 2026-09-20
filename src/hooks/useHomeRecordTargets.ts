"use client";

import { useEffect, useRef, useState } from "react";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import { RECORDS_RULES_VERSION, type PersistedRecordCurrent } from "@/lib/records/types";
import { HOME_RECORD_METRIC_KEYS, type HomeRecordMetricKey } from "@/lib/home-progress";

type HomeRecordTargetRow = Pick<PersistedRecordCurrent, "logical_day_start" | "metric_key" | "timezone" | "value">;
type HomeRecordClient = NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;

export type HomeRecordTargetsState = Readonly<{
  error: string | null;
  loading: boolean;
  settingsMismatch: boolean;
  targets: Readonly<Partial<Record<HomeRecordMetricKey, number>>>;
}>;

const EMPTY_STATE: HomeRecordTargetsState = { error: null, loading: false, settingsMismatch: false, targets: {} };
type HomeRecordTargetsInternalState = { ownerKey: string | null; snapshot: HomeRecordTargetsState };
const EMPTY_INTERNAL_STATE: HomeRecordTargetsInternalState = { ownerKey: null, snapshot: EMPTY_STATE };

function isHomeRecordMetricKey(value: string): value is HomeRecordMetricKey {
  return (HOME_RECORD_METRIC_KEYS as readonly string[]).includes(value);
}

function normalizeStoredDayStart(value: string) {
  const match = value.trim().match(/^(\d{2}:\d{2})(?::(\d{2}))?$/);
  if (!match || (match[2] !== undefined && match[2] !== "00")) return null;
  return match[1];
}

export function homeRecordSettingsMatch(row: Pick<HomeRecordTargetRow, "logical_day_start" | "timezone">, settings: { logicalDayStart: string; timezone: string }) {
  return row.timezone === settings.timezone && normalizeStoredDayStart(row.logical_day_start) === normalizeStoredDayStart(settings.logicalDayStart);
}

export async function loadHomeRecordTargets(
  client: HomeRecordClient,
  userId: string,
  settings: { logicalDayStart: string; timezone: string },
): Promise<Pick<HomeRecordTargetsState, "settingsMismatch" | "targets">> {
  const result = await client
    .from("adhdice_record_current")
    .select("metric_key,value,timezone,logical_day_start")
    .eq("user_id", userId)
    .eq("rules_version", RECORDS_RULES_VERSION)
    .in("metric_key", [...HOME_RECORD_METRIC_KEYS]);
  if (result.error) throw result.error;

  const targets: Partial<Record<HomeRecordMetricKey, number>> = {};
  let settingsMismatch = false;
  for (const row of (result.data ?? []) as HomeRecordTargetRow[]) {
    if (!isHomeRecordMetricKey(row.metric_key)) continue;
    if (!homeRecordSettingsMatch(row, settings)) {
      settingsMismatch = true;
      continue;
    }
    targets[row.metric_key] = row.value;
  }
  return { settingsMismatch, targets };
}

export function useHomeRecordTargets({
  active,
  client,
  logicalDayStart,
  timezone,
  userId,
}: {
  active: boolean;
  client: HomeRecordClient | null;
  logicalDayStart: string;
  timezone: string;
  userId: string | null;
}): HomeRecordTargetsState {
  const [state, setState] = useState<HomeRecordTargetsInternalState>(EMPTY_INTERNAL_STATE);
  const generationRef = useRef(0);
  const ownerKey = active && client && userId ? `${userId}:${timezone}:${logicalDayStart}` : null;

  useEffect(() => {
    const generation = ++generationRef.current;
    if (!active || !client || !userId) {
      return;
    }

    const loadClient = client;
    const loadUserId = userId;
    void (async () => {
      await Promise.resolve();
      if (generation !== generationRef.current) return;
      setState({ ownerKey: `${loadUserId}:${timezone}:${logicalDayStart}`, snapshot: { error: null, loading: true, settingsMismatch: false, targets: {} } });
      try {
        const result = await loadHomeRecordTargets(loadClient, loadUserId, { logicalDayStart, timezone });
        if (generation !== generationRef.current) return;
        setState({ ownerKey: `${loadUserId}:${timezone}:${logicalDayStart}`, snapshot: { ...result, error: null, loading: false } });
      } catch (error: unknown) {
        if (generation !== generationRef.current) return;
        setState({ ownerKey: `${loadUserId}:${timezone}:${logicalDayStart}`, snapshot: { error: error instanceof Error ? error.message : "Record targets could not be loaded.", loading: false, settingsMismatch: false, targets: {} } });
      }
    });
  }, [active, client, logicalDayStart, timezone, userId]);

  if (!ownerKey) return EMPTY_STATE;
  if (state.ownerKey !== ownerKey) return { ...EMPTY_STATE, loading: true };
  return state.snapshot;
}
