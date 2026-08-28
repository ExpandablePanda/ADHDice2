import type {
  HealthMetricEntryInsert,
  HealthWeightEntry,
  HealthWorkoutInsert,
} from "@/lib/database.types";
import {
  getHealthKitDateKey,
  type HealthKitIncrementalMetricChange,
  type HealthKitIncrementalResult,
  type HealthKitBodyMassSample,
  type HealthKitSnapshot,
} from "@/lib/healthkit";

export const APPLE_HEALTH_SOURCE = "apple_health" as const;

const HEALTHKIT_METRIC_MAPPINGS = [
  { metricType: "steps", valueKey: "steps" },
  { metricType: "active_energy_kcal", valueKey: "activeEnergyKcal" },
  { metricType: "exercise_minutes", valueKey: "exerciseMinutes" },
  { metricType: "sleep_minutes", valueKey: "asleepMinutes" },
] as const;

export type HealthKitSyncMetricInput = Omit<HealthMetricEntryInsert, "user_id">;

export type HealthKitSyncWeightInput = {
  entry_date: string;
  logged_at: string;
  note: string | null;
  source: typeof APPLE_HEALTH_SOURCE;
  source_external_id: string;
  weight_kg: number;
};

export type HealthKitSyncWorkoutInput = Omit<HealthWorkoutInsert, "user_id" | "id"> & {
  source: typeof APPLE_HEALTH_SOURCE;
  source_external_id: string;
};

export type HealthKitSyncResult = {
  metrics: number;
  weights: number;
  workouts: number;
};

export type HealthKitIncrementalSyncResult = {
  metrics: number;
  weightsAdded: number;
  weightsDeleted: number;
  workoutsAdded: number;
  workoutsDeleted: number;
  failedTypes: Record<string, string>;
  totalChanges: number;
};

export function healthKitMetricFingerprint(metricType: HealthKitSyncMetricInput["metric_type"], date: string) {
  return `${APPLE_HEALTH_SOURCE}:v1:daily:${metricType}:${date}`;
}

export function buildHealthKitMetricInputs(snapshot: HealthKitSnapshot): HealthKitSyncMetricInput[] {
  return snapshot.dailyMetrics.flatMap((dailyMetric) => HEALTHKIT_METRIC_MAPPINGS.flatMap(({ metricType, valueKey }) => {
    const metricValue = dailyMetric[valueKey];
    if (!Number.isFinite(metricValue) || metricValue <= 0) return [];
    return [{
      metric_date: dailyMetric.date,
      metric_type: metricType,
      metric_value: metricValue,
      source: APPLE_HEALTH_SOURCE,
      source_fingerprint: healthKitMetricFingerprint(metricType, dailyMetric.date),
    }];
  }));
}

export function buildHealthKitIncrementalMetricInputs(
  changes: readonly HealthKitIncrementalMetricChange[],
): HealthKitSyncMetricInput[] {
  return changes.map((change) => ({
    metric_date: change.date,
    metric_type: change.metricType,
    metric_value: change.value,
    source: APPLE_HEALTH_SOURCE,
    source_fingerprint: healthKitMetricFingerprint(change.metricType, change.date),
  }));
}

export function buildHealthKitIncrementalWeightInputs(result: HealthKitIncrementalResult) {
  return buildHealthKitWeightInputs({
    startDate: result.baselineStartDate,
    endDate: result.baselineStartDate,
    dailyMetrics: [],
    bodyMass: result.bodyMass,
    workouts: [],
  });
}

export function buildHealthKitIncrementalWorkoutInputs(result: HealthKitIncrementalResult) {
  return buildHealthKitWorkoutInputs({
    startDate: result.baselineStartDate,
    endDate: result.baselineStartDate,
    dailyMetrics: [],
    bodyMass: [],
    workouts: result.workouts,
  });
}

export function buildHealthKitWeightInputs(snapshot: HealthKitSnapshot): HealthKitSyncWeightInput[] {
  return snapshot.bodyMass.map((sample) => ({
    entry_date: getHealthKitDateKey(new Date(sample.timestamp)),
    logged_at: sample.timestamp,
    note: "Synced from Apple Health",
    source: APPLE_HEALTH_SOURCE,
    source_external_id: sample.id,
    weight_kg: sample.weightKg,
  }));
}

export function buildHealthKitWorkoutInputs(snapshot: HealthKitSnapshot): HealthKitSyncWorkoutInput[] {
  return snapshot.workouts.flatMap((workout) => {
    if (!Number.isFinite(workout.durationSeconds) || workout.durationSeconds <= 0) return [];
    return [{
      active_calories: workout.activeCaloriesKcal,
      ended_at: workout.endDate,
      duration_seconds: Math.max(1, Math.round(workout.durationSeconds)),
      notes: "",
      source: APPLE_HEALTH_SOURCE,
      source_external_id: workout.id,
      started_at: workout.startDate,
      title: workout.activityLabel,
      workout_date: getHealthKitDateKey(new Date(workout.startDate)),
      workout_type: workout.activityLabel,
    }];
  });
}

export function findLegacyWeightAdoptionCandidate(
  entries: readonly HealthWeightEntry[],
  sample: HealthKitBodyMassSample,
) {
  const matches = entries.filter((entry) => entry.source === "apple_health_import" && entry.logged_at === sample.timestamp);
  return matches.length === 1 ? matches[0] : null;
}
