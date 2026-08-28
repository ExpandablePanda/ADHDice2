import { Capacitor, registerPlugin } from "@capacitor/core";

export const HEALTHKIT_READ_TYPES = [
  "Step Count",
  "Active Energy Burned",
  "Apple Exercise Time",
  "Sleep Analysis",
  "Body Mass",
  "Workouts",
] as const;

export type HealthKitDailyMetric = {
  date: string;
  steps: number;
  activeEnergyKcal: number;
  exerciseMinutes: number;
  asleepMinutes: number;
};

export type HealthKitBodyMassSample = {
  id: string;
  timestamp: string;
  weightKg: number;
};

export type HealthKitWorkout = {
  id: string;
  activityType: number;
  activityLabel: string;
  startDate: string;
  endDate: string;
  durationSeconds: number;
  activeCaloriesKcal: number | null;
};

export type HealthKitSnapshot = {
  startDate: string;
  endDate: string;
  dailyMetrics: HealthKitDailyMetric[];
  bodyMass: HealthKitBodyMassSample[];
  workouts: HealthKitWorkout[];
};

export type HealthKitIncrementalTypeResult = {
  added: number;
  deleted: number;
};

export type HealthKitIncrementalResult = {
  initialized: boolean;
  baselineStartDate: string;
  types: {
    steps: HealthKitIncrementalTypeResult;
    activeEnergy: HealthKitIncrementalTypeResult;
    exerciseTime: HealthKitIncrementalTypeResult;
    sleep: HealthKitIncrementalTypeResult;
    bodyMass: HealthKitIncrementalTypeResult;
    workouts: HealthKitIncrementalTypeResult;
  };
  totalAdded: number;
  totalDeleted: number;
  failedTypes: Record<string, string>;
};

export type HealthKitDateRange = {
  startDate: string;
  endDate: string;
};

export type HealthKitAuthorizationResult = {
  authorizationCompleted: boolean;
  requestedReadTypes: readonly string[];
};

export type HealthKitAvailability = {
  available: boolean;
  platform: string;
};

type NativeHealthKitPlugin = {
  isAvailable(): Promise<HealthKitAvailability>;
  requestReadAuthorization(): Promise<HealthKitAuthorizationResult>;
  readHealthSnapshot(options: HealthKitDateRange): Promise<HealthKitSnapshot>;
  readIncrementalHealthChanges(options: { scopeKey: string }): Promise<unknown>;
};

export const NativeHealthKit = registerPlugin<NativeHealthKitPlugin>("ADHDiceHealthKit");

export class HealthKitNormalizationError extends Error {
  readonly code = "HEALTHKIT_INVALID_PAYLOAD";
}

export function isHealthKitNativePlatform(platform = typeof window === "undefined" ? "web" : Capacitor.getPlatform()) {
  return platform === "ios";
}

export function normalizeHealthKitScopeKey(scopeKey: unknown) {
  if (typeof scopeKey !== "string" || !scopeKey.trim()) {
    throw new HealthKitNormalizationError("An ADHDice account scope key is required for incremental Apple Health reads.");
  }
  return scopeKey.trim();
}

export function getHealthKitDateKey(date: Date) {
  if (!Number.isFinite(date.getTime())) {
    throw new HealthKitNormalizationError("HealthKit date is invalid.");
  }
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((value, index) => index === 0 ? String(value).padStart(4, "0") : String(value).padStart(2, "0"))
    .join("-");
}

function toIsoDate(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new HealthKitNormalizationError(`${label} is missing.`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new HealthKitNormalizationError(`${label} is invalid.`);
  }
  return date.toISOString();
}

function nonNegativeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function nonNegativeInteger(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new HealthKitNormalizationError(`${label} must be a non-negative integer.`);
  }
  return value;
}

export function getDefaultHealthKitDateRange(now = new Date()): HealthKitDateRange {
  if (!Number.isFinite(now.getTime())) {
    throw new HealthKitNormalizationError("The current date is invalid.");
  }
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

export function normalizeHealthKitDateRange(
  range?: Partial<HealthKitDateRange> | null,
  now = new Date(),
): HealthKitDateRange {
  if (!range?.startDate && !range?.endDate) {
    return getDefaultHealthKitDateRange(now);
  }
  if (!range.startDate || !range.endDate) {
    throw new HealthKitNormalizationError("Both HealthKit range dates are required.");
  }
  const start = new Date(range.startDate);
  const end = new Date(range.endDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new HealthKitNormalizationError("HealthKit range dates are invalid.");
  }
  if (end <= start) {
    throw new HealthKitNormalizationError("The HealthKit range must end after it starts.");
  }
  const maximumEnd = new Date(start);
  maximumEnd.setDate(maximumEnd.getDate() + 7);
  if (end > maximumEnd) {
    throw new HealthKitNormalizationError("The HealthKit range cannot exceed seven days.");
  }
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

function normalizeDateKey(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HealthKitNormalizationError("A HealthKit daily metric has an invalid date.");
  }
  const date = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(date.getTime()) || getHealthKitDateKey(date) !== value) {
    throw new HealthKitNormalizationError("A HealthKit daily metric has an invalid date.");
  }
  return value;
}

export function normalizeHealthKitSnapshot(value: unknown): HealthKitSnapshot {
  if (!value || typeof value !== "object") {
    throw new HealthKitNormalizationError("HealthKit returned no snapshot.");
  }
  const candidate = value as Record<string, unknown>;
  const responseRange = normalizeHealthKitDateRange({
    startDate: toIsoDate(candidate.startDate, "HealthKit snapshot startDate"),
    endDate: toIsoDate(candidate.endDate, "HealthKit snapshot endDate"),
  });
  const { startDate, endDate } = responseRange;
  const dailyMetrics = new Map<string, HealthKitDailyMetric>();
  const rawDailyMetrics = Array.isArray(candidate.dailyMetrics) ? candidate.dailyMetrics : [];
  rawDailyMetrics.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const raw = entry as Record<string, unknown>;
    const date = normalizeDateKey(raw.date);
    const normalized = {
      date,
      steps: nonNegativeNumber(raw.steps),
      activeEnergyKcal: nonNegativeNumber(raw.activeEnergyKcal),
      exerciseMinutes: nonNegativeNumber(raw.exerciseMinutes),
      asleepMinutes: nonNegativeNumber(raw.asleepMinutes),
    } satisfies HealthKitDailyMetric;
    const prior = dailyMetrics.get(date);
    dailyMetrics.set(date, prior ? {
      date,
      steps: Math.max(prior.steps, normalized.steps),
      activeEnergyKcal: Math.max(prior.activeEnergyKcal, normalized.activeEnergyKcal),
      exerciseMinutes: Math.max(prior.exerciseMinutes, normalized.exerciseMinutes),
      asleepMinutes: Math.max(prior.asleepMinutes, normalized.asleepMinutes),
    } : normalized);
  });

  const bodyMass = (Array.isArray(candidate.bodyMass) ? candidate.bodyMass : []).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    if (typeof raw.id !== "string" || !raw.id.trim() || typeof raw.weightKg !== "number" || !Number.isFinite(raw.weightKg) || raw.weightKg <= 0) {
      return [];
    }
    return [{ id: raw.id, timestamp: toIsoDate(raw.timestamp, "HealthKit body mass timestamp"), weightKg: raw.weightKg }];
  });

  const workouts = (Array.isArray(candidate.workouts) ? candidate.workouts : []).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    if (typeof raw.id !== "string" || !raw.id.trim() || typeof raw.activityType !== "number" || !Number.isFinite(raw.activityType)) {
      return [];
    }
    const start = toIsoDate(raw.startDate, "HealthKit workout startDate");
    const end = toIsoDate(raw.endDate, "HealthKit workout endDate");
    const durationSeconds = nonNegativeNumber(raw.durationSeconds);
    return [{
      id: raw.id,
      activityType: raw.activityType,
      activityLabel: typeof raw.activityLabel === "string" && raw.activityLabel.trim() ? raw.activityLabel : `Activity ${raw.activityType}`,
      startDate: start,
      endDate: end,
      durationSeconds,
      activeCaloriesKcal: typeof raw.activeCaloriesKcal === "number" && Number.isFinite(raw.activeCaloriesKcal) && raw.activeCaloriesKcal >= 0 ? raw.activeCaloriesKcal : null,
    } satisfies HealthKitWorkout];
  });

  return {
    startDate,
    endDate,
    dailyMetrics: [...dailyMetrics.values()].sort((left, right) => left.date.localeCompare(right.date)),
    bodyMass: bodyMass.sort((left, right) => left.timestamp.localeCompare(right.timestamp)),
    workouts: workouts.sort((left, right) => left.startDate.localeCompare(right.startDate)),
  };
}

function normalizeHealthKitIncrementalTypeResult(value: unknown, label: string): HealthKitIncrementalTypeResult {
  if (!value || typeof value !== "object") {
    throw new HealthKitNormalizationError(`${label} is missing.`);
  }
  const candidate = value as Record<string, unknown>;
  return {
    added: nonNegativeInteger(candidate.added, `${label} added`),
    deleted: nonNegativeInteger(candidate.deleted, `${label} deleted`),
  };
}

export function normalizeHealthKitIncrementalResult(value: unknown): HealthKitIncrementalResult {
  if (!value || typeof value !== "object") {
    throw new HealthKitNormalizationError("HealthKit returned no incremental result.");
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.initialized !== "boolean") {
    throw new HealthKitNormalizationError("HealthKit incremental initialized status is missing.");
  }
  if (!candidate.types || typeof candidate.types !== "object") {
    throw new HealthKitNormalizationError("HealthKit incremental type counts are missing.");
  }
  const rawTypes = candidate.types as Record<string, unknown>;
  const types = {
    steps: normalizeHealthKitIncrementalTypeResult(rawTypes.steps, "HealthKit incremental steps"),
    activeEnergy: normalizeHealthKitIncrementalTypeResult(rawTypes.activeEnergy, "HealthKit incremental active energy"),
    exerciseTime: normalizeHealthKitIncrementalTypeResult(rawTypes.exerciseTime, "HealthKit incremental exercise time"),
    sleep: normalizeHealthKitIncrementalTypeResult(rawTypes.sleep, "HealthKit incremental sleep"),
    bodyMass: normalizeHealthKitIncrementalTypeResult(rawTypes.bodyMass, "HealthKit incremental body mass"),
    workouts: normalizeHealthKitIncrementalTypeResult(rawTypes.workouts, "HealthKit incremental workouts"),
  } satisfies HealthKitIncrementalResult["types"];
  const totalAdded = nonNegativeInteger(candidate.totalAdded, "HealthKit incremental total added");
  const totalDeleted = nonNegativeInteger(candidate.totalDeleted, "HealthKit incremental total deleted");
  const calculatedAdded = Object.values(types).reduce((total, result) => total + result.added, 0);
  const calculatedDeleted = Object.values(types).reduce((total, result) => total + result.deleted, 0);
  if (totalAdded !== calculatedAdded || totalDeleted !== calculatedDeleted) {
    throw new HealthKitNormalizationError("HealthKit incremental totals do not match the per-type counts.");
  }
  const failedTypes: Record<string, string> = {};
  if (candidate.failedTypes !== undefined) {
    if (!candidate.failedTypes || typeof candidate.failedTypes !== "object" || Array.isArray(candidate.failedTypes)) {
      throw new HealthKitNormalizationError("HealthKit incremental failures are invalid.");
    }
    Object.entries(candidate.failedTypes as Record<string, unknown>).forEach(([type, message]) => {
      if (typeof message !== "string" || !message.trim()) {
        throw new HealthKitNormalizationError(`HealthKit incremental failure for ${type} is invalid.`);
      }
      failedTypes[type] = message;
    });
  }
  return {
    initialized: candidate.initialized,
    baselineStartDate: toIsoDate(candidate.baselineStartDate, "HealthKit incremental baselineStartDate"),
    types,
    totalAdded,
    totalDeleted,
    failedTypes,
  };
}

type HealthKitSleepInterval = {
  startDate: string;
  endDate: string;
  stage?: string | number | null;
  value?: string | number | null;
};

function isAsleepStage(stage: HealthKitSleepInterval["stage"] | HealthKitSleepInterval["value"]) {
  if (typeof stage === "number") {
    return [1, 3, 4, 5, 6].includes(stage);
  }
  if (typeof stage !== "string") return false;
  const normalized = stage.toLowerCase().replace(/[^a-z]/g, "");
  return normalized.endsWith("asleep")
    || normalized.endsWith("asleepcore")
    || normalized.endsWith("asleepdeep")
    || normalized.endsWith("asleeprem")
    || normalized.endsWith("asleepunspecified")
    || normalized === "core"
    || normalized === "deep"
    || normalized === "rem";
}

export function unionHealthKitSleepIntervals(
  intervals: readonly HealthKitSleepInterval[],
  range?: Partial<HealthKitDateRange> | null,
) {
  const normalizedRange = range ? normalizeHealthKitDateRange(range) : null;
  const lowerBound = normalizedRange ? new Date(normalizedRange.startDate).getTime() : Number.NEGATIVE_INFINITY;
  const upperBound = normalizedRange ? new Date(normalizedRange.endDate).getTime() : Number.POSITIVE_INFINITY;
  const valid = intervals.flatMap((interval) => {
    if (!isAsleepStage(interval.stage ?? interval.value)) return [];
    const start = new Date(interval.startDate).getTime();
    const end = new Date(interval.endDate).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    const clippedStart = Math.max(start, lowerBound);
    const clippedEnd = Math.min(end, upperBound);
    return clippedEnd > clippedStart ? [{ start: clippedStart, end: clippedEnd }] : [];
  }).sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: Array<{ start: number; end: number }> = [];
  valid.forEach((interval) => {
    const prior = merged[merged.length - 1];
    if (prior && interval.start <= prior.end) {
      prior.end = Math.max(prior.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  });
  return merged.map((interval) => ({ startDate: new Date(interval.start).toISOString(), endDate: new Date(interval.end).toISOString() }));
}

export function sumHealthKitSleepMinutes(
  intervals: readonly HealthKitSleepInterval[],
  range?: Partial<HealthKitDateRange> | null,
) {
  return unionHealthKitSleepIntervals(intervals, range).reduce((total, interval) => total + (new Date(interval.endDate).getTime() - new Date(interval.startDate).getTime()) / 60_000, 0);
}

function nativeHealthKitError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

export async function checkHealthKitAvailability(): Promise<HealthKitAvailability> {
  if (!isHealthKitNativePlatform()) {
    return { available: false, platform: "web" };
  }
  if (!Capacitor.isPluginAvailable("ADHDiceHealthKit")) {
    return { available: false, platform: "ios" };
  }
  return NativeHealthKit.isAvailable();
}

export async function requestHealthKitReadAuthorization() {
  if (!isHealthKitNativePlatform() || !Capacitor.isPluginAvailable("ADHDiceHealthKit")) {
    throw new HealthKitNormalizationError("Apple Health is available only in the native iOS app.");
  }
  try {
    return await NativeHealthKit.requestReadAuthorization();
  } catch (error) {
    throw new HealthKitNormalizationError(nativeHealthKitError(error, "Apple Health read access could not be requested."));
  }
}

export async function readHealthKitSnapshot(range?: Partial<HealthKitDateRange> | null) {
  if (!isHealthKitNativePlatform() || !Capacitor.isPluginAvailable("ADHDiceHealthKit")) {
    throw new HealthKitNormalizationError("Apple Health is available only in the native iOS app.");
  }
  const normalizedRange = normalizeHealthKitDateRange(range);
  try {
    return normalizeHealthKitSnapshot(await NativeHealthKit.readHealthSnapshot(normalizedRange));
  } catch (error) {
    if (error instanceof HealthKitNormalizationError) throw error;
    throw new HealthKitNormalizationError(nativeHealthKitError(error, "Apple Health data could not be read."));
  }
}

export async function readHealthKitIncrementalChanges(scopeKey: string) {
  if (!isHealthKitNativePlatform() || !Capacitor.isPluginAvailable("ADHDiceHealthKit")) {
    throw new HealthKitNormalizationError("Apple Health is available only in the native iOS app.");
  }
  const normalizedScopeKey = normalizeHealthKitScopeKey(scopeKey);
  try {
    return normalizeHealthKitIncrementalResult(await NativeHealthKit.readIncrementalHealthChanges({ scopeKey: normalizedScopeKey }));
  } catch (error) {
    if (error instanceof HealthKitNormalizationError) throw error;
    throw new HealthKitNormalizationError(nativeHealthKitError(error, "Apple Health incremental data could not be read."));
  }
}
