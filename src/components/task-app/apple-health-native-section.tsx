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

type DiagnosticState = "checking" | "ready" | "requesting" | "reading" | "unavailable" | "error";

function formatNumber(value: number | null | undefined, suffix = "") {
  return value === null || value === undefined ? "—" : `${Math.round(value).toLocaleString()}${suffix}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Apple Health is not available right now.";
}

export function AppleHealthNativeSection() {
  const [availability, setAvailability] = useState<HealthKitAvailability | null>(null);
  const [diagnosticState, setDiagnosticState] = useState<DiagnosticState>("checking");
  const [authorization, setAuthorization] = useState<HealthKitAuthorizationResult | null>(null);
  const [snapshot, setSnapshot] = useState<HealthKitSnapshot | null>(null);
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
      setSnapshot(await readHealthKitSnapshot(getDefaultHealthKitDateRange()));
      setDiagnosticState("ready");
    } catch (caughtError) {
      setError(errorMessage(caughtError));
      setDiagnosticState("error");
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
          ? "Reading the last 7 days from Apple Health..."
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
            <p className="mt-1 text-xs leading-5 text-[#73809c] dark:text-white/50">Read-only preview for the existing Health experience. Nothing is saved to ADHDice.</p>
          </div>
        </div>
        <span className="rounded-full bg-[#f4f6fc] px-3 py-1.5 text-xs font-semibold text-[#68738c] dark:bg-white/8 dark:text-white/60">iOS only</span>
      </div>
      <p className="mt-4 text-sm leading-6 text-[#5f6c88] dark:text-white/65">{statusText}</p>
      {error ? <p className="mt-2 text-xs font-semibold text-[#c54c68] dark:text-[#ffb0c1]">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <AdhdChip disabled={!availability?.available || diagnosticState === "checking" || diagnosticState === "requesting" || diagnosticState === "reading"} onClick={() => { void connectAppleHealth(); }} tone="purple">Connect Apple Health</AdhdChip>
        <AdhdChip disabled={!availability?.available || diagnosticState === "checking" || diagnosticState === "requesting" || diagnosticState === "reading"} onClick={() => { void readAppleHealth(); }}>Read Health Data</AdhdChip>
      </div>
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
