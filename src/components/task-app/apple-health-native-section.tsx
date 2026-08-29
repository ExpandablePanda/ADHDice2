"use client";

import { Activity, Apple, Dumbbell, MoonStar, Scale } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { AdhdCard } from "@/components/ui-system/adhd-card";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import {
  checkHealthKitAvailability,
  getDefaultHealthKitDateRange,
  getHealthKitDateKey,
  readHealthKitSnapshot,
  requestHealthKitReadAuthorization,
  type HealthKitAvailability,
  type HealthKitAuthorizationResult,
  type HealthKitSnapshot,
} from "@/lib/healthkit";
import type { HealthKitIncrementalSyncResult, HealthKitSyncResult } from "@/lib/healthkit-sync";

type DiagnosticState = "checking" | "ready" | "requesting" | "reading" | "unavailable" | "error";

type AppleHealthNativeSectionProps = {
  healthKitScopeKey: string | null;
  syncAppleHealthData: (snapshot: HealthKitSnapshot) => Promise<HealthKitSyncResult | null>;
  syncIncrementalAppleHealthData: () => Promise<HealthKitIncrementalSyncResult | null>;
};

function formatNumber(value: number | null | undefined, suffix = "") {
  return value === null || value === undefined ? "—" : `${Math.round(value).toLocaleString()}${suffix}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Apple Health is not available right now.";
}

export function AppleHealthNativeSection({ healthKitScopeKey, syncAppleHealthData, syncIncrementalAppleHealthData }: AppleHealthNativeSectionProps) {
  const [availability, setAvailability] = useState<HealthKitAvailability | null>(null);
  const [diagnosticState, setDiagnosticState] = useState<DiagnosticState>("checking");
  const [authorization, setAuthorization] = useState<HealthKitAuthorizationResult | null>(null);
  const [snapshot, setSnapshot] = useState<HealthKitSnapshot | null>(null);
  const [syncResult, setSyncResult] = useState<HealthKitSyncResult | null>(null);
  const [incrementalResult, setIncrementalResult] = useState<HealthKitIncrementalSyncResult | null>(null);
  const [incrementalError, setIncrementalError] = useState<string | null>(null);
  const [incrementalReading, setIncrementalReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = useMemo(() => getHealthKitDateKey(new Date()), []);

  useEffect(() => {
    let cancelled = false;
    void checkHealthKitAvailability()
      .then((result) => {
        if (cancelled) return;
        setAvailability(result);
        setDiagnosticState(result.available ? "ready" : "unavailable");
      })
      .catch((caughtError) => {
        if (cancelled) return;
        setError(errorMessage(caughtError));
        setDiagnosticState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function connectAppleHealth() {
    setDiagnosticState("requesting");
    setError(null);
    try {
      const result = await requestHealthKitReadAuthorization();
      setAuthorization(result);
      setDiagnosticState("ready");
    } catch (caughtError) {
      setError(errorMessage(caughtError));
      setDiagnosticState("error");
    }
  }

  async function readAppleHealth() {
    setDiagnosticState("reading");
    setError(null);
    try {
      const nextSnapshot = await readHealthKitSnapshot(getDefaultHealthKitDateRange());
      const result = await syncAppleHealthData(nextSnapshot);
      if (!result) {
        setError("Apple Health import did not complete.");
        setDiagnosticState("error");
        return;
      }
      setSnapshot(nextSnapshot);
      setSyncResult(result);
      setDiagnosticState("ready");
    } catch (caughtError) {
      setError(errorMessage(caughtError));
      setDiagnosticState("error");
    }
  }

  async function readIncrementalAppleHealth() {
    if (!healthKitScopeKey) {
      setIncrementalError("Incremental Apple Health reads require a signed-in account.");
      return;
    }
    setIncrementalReading(true);
    setIncrementalError(null);
    try {
      const result = await syncIncrementalAppleHealthData();
      if (!result) {
        setIncrementalError("Incremental Apple Health sync did not complete.");
        return;
      }
      setIncrementalResult(result);
    } catch (caughtError) {
      setIncrementalError(errorMessage(caughtError));
    } finally {
      setIncrementalReading(false);
    }
  }

  // The component is intentionally native-only; the browser never calls or renders HealthKit controls.
  if (typeof window === "undefined" || availability?.platform !== "ios") {
    return null;
  }

  const todayMetrics = snapshot?.dailyMetrics.find((entry) => entry.date === today) ?? null;
  const latestSleep = todayMetrics?.asleepMinutes
    ? todayMetrics
    : [...(snapshot?.dailyMetrics ?? [])].reverse().find((entry) => entry.asleepMinutes > 0) ?? null;
  const latestWeight = snapshot?.bodyMass.at(-1) ?? null;
  const statusText = diagnosticState === "checking"
    ? "Checking Apple Health availability..."
    : diagnosticState === "unavailable"
      ? "Apple Health is unavailable on this device or build."
      : diagnosticState === "requesting"
        ? "Opening Apple Health access request..."
        : diagnosticState === "reading"
            ? "Reading and importing the last 7 days from Apple Health..."
            : diagnosticState === "error"
              ? error ?? "Apple Health sync could not be saved."
              : syncResult
                ? `Apple Health imported: ${syncResult.metrics} metrics · ${syncResult.weights} ${syncResult.weights === 1 ? "weight" : "weights"} · ${syncResult.workouts} ${syncResult.workouts === 1 ? "workout" : "workouts"}.`
                : authorization
                  ? "Access flow completed. Apple may still limit individual read types."
                  : "Apple Health is ready for a read-access request.";

  return (
    <AdhdCard className="xl:col-span-2" padding="md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f1ecff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]"><Apple aria-hidden="true" className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Native diagnostic</p>
            <h2 className="mt-1 text-lg font-black text-[#1e2744] dark:text-white">Apple Health</h2>
            <p className="mt-1 text-xs leading-5 text-[#73809c] dark:text-white/50">Manual seven-day import plus anchored sync through canonical ADHDice Health storage.</p>
          </div>
        </div>
        <span className="rounded-full bg-[#f4f6fc] px-3 py-1.5 text-xs font-semibold text-[#68738c] dark:bg-white/8 dark:text-white/60">iOS only</span>
      </div>
      <p className="mt-4 text-sm leading-6 text-[#5f6c88] dark:text-white/65">{statusText}</p>
      {error ? <p className="mt-2 text-xs font-semibold text-[#c54c68] dark:text-[#ffb0c1]">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <AdhdChip disabled={!availability?.available || diagnosticState === "checking" || diagnosticState === "requesting" || diagnosticState === "reading"} onClick={() => { void connectAppleHealth(); }} tone="purple">Connect Apple Health</AdhdChip>
        <AdhdChip disabled={!availability?.available || diagnosticState === "checking" || diagnosticState === "requesting" || diagnosticState === "reading"} onClick={() => { void readAppleHealth(); }}>Import Recent Apple Health</AdhdChip>
        <AdhdChip disabled={!availability?.available || !healthKitScopeKey || incrementalReading || diagnosticState === "checking" || diagnosticState === "requesting" || diagnosticState === "reading"} onClick={() => { void readIncrementalAppleHealth(); }}>Sync Apple Health</AdhdChip>
      </div>
      {incrementalError ? <p className="mt-2 text-xs font-semibold text-[#c54c68] dark:text-[#ffb0c1]">{incrementalError}</p> : null}
      {incrementalResult ? (
        <div className="mt-3 rounded-[1rem] border border-[#edf0fb] bg-white/80 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-black text-[#1e2744] dark:text-white">
            Incremental sync: {incrementalResult.totalChanges} changes saved
          </p>
          <p className="mt-1 text-[10px] font-semibold text-[#8d87a7] dark:text-white/45">
            {incrementalResult.metrics} metrics · {incrementalResult.weightsAdded} weights added · {incrementalResult.weightsDeleted} weights deleted · {incrementalResult.workoutsAdded} workouts added · {incrementalResult.workoutsDeleted} workouts deleted
          </p>
          {Object.entries(incrementalResult.failedTypes).length > 0 ? (
            <p className="mt-1 text-[10px] font-semibold text-[#c54c68] dark:text-[#ffb0c1]">
              Failed: {Object.keys(incrementalResult.failedTypes).join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
      {snapshot ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <DiagnosticMetric icon={<Activity aria-hidden="true" />} label="Today steps" value={formatNumber(todayMetrics?.steps)} />
          <DiagnosticMetric icon={<Activity aria-hidden="true" />} label="Active calories" value={formatNumber(todayMetrics?.activeEnergyKcal, " kcal")} />
          <DiagnosticMetric icon={<Activity aria-hidden="true" />} label="Exercise" value={formatNumber(todayMetrics?.exerciseMinutes, " min")} />
          <DiagnosticMetric icon={<MoonStar aria-hidden="true" />} label={latestSleep ? `Sleep · ${latestSleep.date}` : "Sleep"} value={formatNumber(latestSleep?.asleepMinutes, " min")} />
          <DiagnosticMetric icon={<Scale aria-hidden="true" />} label="Latest weight" value={latestWeight ? `${latestWeight.weightKg.toFixed(1)} kg` : "—"} />
          <DiagnosticMetric icon={<Dumbbell aria-hidden="true" />} label="Workouts · 7 days" value={String(snapshot.workouts.length)} />
        </div>
      ) : null}
    </AdhdCard>
  );
}

function DiagnosticMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[1rem] border border-[#edf0fb] bg-white/80 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
      <span className="text-[#6f57f6] dark:text-[#cabfff] [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8d87a7] dark:text-white/40">{label}</span>
        <span className="mt-0.5 block text-sm font-black tabular-nums text-[#1e2744] dark:text-white">{value}</span>
      </span>
    </div>
  );
}
