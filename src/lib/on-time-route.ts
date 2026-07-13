export type OnTimeRouteRequest = {
  origin: { latitude: number; longitude: number };
  destinationPlaceId: string;
  departureAt: string;
  travelMode: "DRIVE";
};

export type OnTimeRouteResult = {
  durationSeconds: number;
  staticDurationSeconds: number | null;
  distanceMeters: number | null;
  fetchedAt: string;
  departureAt: string;
};

export const ON_TIME_TRAFFIC_NEAR_FRESHNESS_MS = 15 * 60_000;
export const ON_TIME_TRAFFIC_LATER_FRESHNESS_MS = 30 * 60_000;
export const ON_TIME_DEPARTURE_SHIFT_MS = 5 * 60_000;
export const ON_TIME_AUTOMATIC_REQUEST_INTERVAL_MS = 10 * 60_000;
export const ON_TIME_DEPARTURE_BUCKET_MS = 5 * 60_000;
export const ON_TIME_ORIGIN_QUANTIZATION_DECIMALS = 4;

export function isValidLatitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidGooglePlaceId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 3 && value.length <= 512 && /^[A-Za-z0-9_-]+$/.test(value);
}

export function isReasonableDepartureTimestamp(value: unknown, now = Date.now()): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= now - 5 * 60_000 && timestamp <= now + 366 * 24 * 60 * 60_000;
}

export function parseGoogleDurationSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+)(?:\.(\d{1,9}))?s$/.exec(value);
  if (!match) return null;
  const seconds = Number(match[1]) + Number(`0.${match[2] ?? "0"}`);
  return Number.isSafeInteger(Number(match[1])) && Number.isFinite(seconds) ? Math.ceil(seconds) : null;
}

function nullableNonNegativeInteger(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function normalizeOnTimeRouteResult(value: unknown): OnTimeRouteResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  const durationSeconds = nullableNonNegativeInteger(result.durationSeconds);
  const staticDurationSeconds = nullableNonNegativeInteger(result.staticDurationSeconds);
  const distanceMeters = nullableNonNegativeInteger(result.distanceMeters);
  if (durationSeconds === null || durationSeconds === undefined || staticDurationSeconds === undefined || distanceMeters === undefined) return null;
  if (typeof result.fetchedAt !== "string" || !Number.isFinite(Date.parse(result.fetchedAt))) return null;
  if (typeof result.departureAt !== "string" || !Number.isFinite(Date.parse(result.departureAt))) return null;
  return {
    durationSeconds,
    staticDurationSeconds,
    distanceMeters,
    fetchedAt: new Date(result.fetchedAt).toISOString(),
    departureAt: new Date(result.departureAt).toISOString(),
  };
}

export function getOnTimeTrafficFreshnessMs(projectedDepartureAt: string, now = Date.now()) {
  const departure = Date.parse(projectedDepartureAt);
  if (!Number.isFinite(departure)) return 0;
  return departure - now <= 2 * 60 * 60_000 ? ON_TIME_TRAFFIC_NEAR_FRESHNESS_MS : ON_TIME_TRAFFIC_LATER_FRESHNESS_MS;
}

export function isOnTimeTrafficResultFresh(result: OnTimeRouteResult, projectedDepartureAt: string, now = Date.now()) {
  const fetchedAt = Date.parse(result.fetchedAt);
  const freshnessMs = getOnTimeTrafficFreshnessMs(projectedDepartureAt, now);
  return freshnessMs > 0 && Number.isFinite(fetchedAt) && fetchedAt <= now && now - fetchedAt <= freshnessMs;
}

export function resolveEffectiveOnTimeTravelDuration(input: {
  selectedSource: "manual" | "traffic";
  manualDurationSeconds: number | null;
  trafficResult: OnTimeRouteResult | null;
  projectedDepartureAt: string;
  now?: number;
}) {
  if (input.selectedSource === "traffic" && input.trafficResult && isOnTimeTrafficResultFresh(input.trafficResult, input.projectedDepartureAt, input.now)) {
    return input.trafficResult.durationSeconds;
  }
  return input.manualDurationSeconds;
}

export function hasOnTimeDepartureShifted(previous: string | null, next: string | null) {
  if (!previous || !next) return previous !== next;
  const previousTime = Date.parse(previous);
  const nextTime = Date.parse(next);
  return !Number.isFinite(previousTime) || !Number.isFinite(nextTime) || Math.abs(nextTime - previousTime) >= ON_TIME_DEPARTURE_SHIFT_MS;
}

export function canMakeAutomaticOnTimeRouteRequest(lastAutomaticRequestAt: string | null, now = Date.now()) {
  if (!lastAutomaticRequestAt) return true;
  const previous = Date.parse(lastAutomaticRequestAt);
  return !Number.isFinite(previous) || now - previous >= ON_TIME_AUTOMATIC_REQUEST_INTERVAL_MS;
}

export function quantizeOnTimeOrigin(origin: OnTimeRouteRequest["origin"]) {
  const scale = 10 ** ON_TIME_ORIGIN_QUANTIZATION_DECIMALS;
  return {
    latitude: Math.round(origin.latitude * scale) / scale,
    longitude: Math.round(origin.longitude * scale) / scale,
  };
}

export function getOnTimeDepartureBucket(departureAt: string) {
  const timestamp = Date.parse(departureAt);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / ON_TIME_DEPARTURE_BUCKET_MS) * ON_TIME_DEPARTURE_BUCKET_MS : null;
}

export function buildOnTimeRouteRequestSignature(request: OnTimeRouteRequest) {
  if (!isValidLatitude(request.origin.latitude) || !isValidLongitude(request.origin.longitude) || !isValidGooglePlaceId(request.destinationPlaceId)) return null;
  const departureBucket = getOnTimeDepartureBucket(request.departureAt);
  if (departureBucket === null || request.travelMode !== "DRIVE") return null;
  const origin = quantizeOnTimeOrigin(request.origin);
  return JSON.stringify({ destinationPlaceId: request.destinationPlaceId, origin, travelMode: request.travelMode, departureBucket });
}

export function isDuplicateOnTimeRouteRequest(signature: string, inFlightSignatures: ReadonlySet<string>) {
  return inFlightSignatures.has(signature);
}

export function buildGoogleMapsDirectionsUrl(input: {
  destinationLabel: string;
  destinationPlaceId?: string | null;
  origin?: { latitude: number; longitude: number } | null;
}) {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", input.destinationLabel);
  if (input.destinationPlaceId && isValidGooglePlaceId(input.destinationPlaceId)) url.searchParams.set("destination_place_id", input.destinationPlaceId);
  url.searchParams.set("travelmode", "driving");
  if (input.origin && isValidLatitude(input.origin.latitude) && isValidLongitude(input.origin.longitude)) {
    url.searchParams.set("origin", `${input.origin.latitude},${input.origin.longitude}`);
  }
  return url.toString();
}
