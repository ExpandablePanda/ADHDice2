const HEALTHKIT_CONNECTION_MARKER_PREFIX = "adhdice-healthkit-connected:";

type HealthKitConnectionStorage = Pick<Storage, "getItem" | "setItem">;

export type HealthKitConnectionEvidence = {
  metricEntries?: readonly { source?: string | null }[];
  weightEntries?: readonly { source?: string | null }[];
  workouts?: readonly { source?: string | null }[];
};

function getLocalStorage(): HealthKitConnectionStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function healthKitConnectionMarkerKey(userId: string) {
  return `${HEALTHKIT_CONNECTION_MARKER_PREFIX}${userId}`;
}

export function hasHealthKitConnectionMarker(userId: string, storage: HealthKitConnectionStorage | null = getLocalStorage()) {
  if (!userId || !storage) return false;
  try {
    return storage.getItem(healthKitConnectionMarkerKey(userId)) === "true";
  } catch {
    return false;
  }
}

export function markHealthKitConnected(userId: string, storage: HealthKitConnectionStorage | null = getLocalStorage()) {
  if (!userId || !storage) return false;
  try {
    storage.setItem(healthKitConnectionMarkerKey(userId), "true");
    return true;
  } catch {
    return false;
  }
}

export function hasTrustedAppleHealthEvidence({ metricEntries = [], weightEntries = [], workouts = [] }: HealthKitConnectionEvidence) {
  return [...metricEntries, ...weightEntries, ...workouts].some((entry) => entry.source === "apple_health");
}

export function isHealthKitConnectionEstablished(
  userId: string,
  evidence: HealthKitConnectionEvidence,
  storage: HealthKitConnectionStorage | null = getLocalStorage(),
) {
  if (hasHealthKitConnectionMarker(userId, storage)) return true;
  if (!hasTrustedAppleHealthEvidence(evidence)) return false;

  // Existing canonical live rows are trusted backward-compatible evidence.
  // Persisting this result is local-only and remains keyed to this account.
  markHealthKitConnected(userId, storage);
  return true;
}
