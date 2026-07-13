const MAX_BODY_BYTES = 4_096;

export type EdgeRouteRequest = {
  origin: { latitude: number; longitude: number };
  destinationPlaceId: string;
  departureAt: string;
  travelMode: "DRIVE";
};

export type EdgeRouteResult = {
  durationSeconds: number;
  staticDurationSeconds: number | null;
  distanceMeters: number | null;
  fetchedAt: string;
  departureAt: string;
};

export type RouteErrorCode = "invalid_request" | "authentication_failure" | "missing_configuration" | "no_route" | "google_rejection" | "quota_rate_failure" | "upstream_unavailable";

export function routeError(code: RouteErrorCode, message: string) {
  return { error: { code, message } };
}

export function hasBearerToken(authorization: string | null): authorization is string {
  return Boolean(authorization?.startsWith("Bearer ") && authorization.length > 7);
}

export function isBodySizeAllowed(contentLength: string | null, actualBytes: number) {
  const declared = contentLength === null ? null : Number(contentLength);
  return (declared === null || Number.isInteger(declared) && declared >= 0 && declared <= MAX_BODY_BYTES) && actualBytes <= MAX_BODY_BYTES;
}

function isCoordinate(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isPlaceId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 3 && value.length <= 512 && /^[A-Za-z0-9_-]+$/.test(value);
}

export function validateEdgeRouteRequest(value: unknown, now = Date.now()): EdgeRouteRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body).sort();
  if (keys.join(",") !== "departureAt,destinationPlaceId,origin,travelMode") return null;
  if (!body.origin || typeof body.origin !== "object" || Array.isArray(body.origin)) return null;
  const origin = body.origin as Record<string, unknown>;
  if (Object.keys(origin).sort().join(",") !== "latitude,longitude") return null;
  if (!isCoordinate(origin.latitude, -90, 90) || !isCoordinate(origin.longitude, -180, 180)) return null;
  if (!isPlaceId(body.destinationPlaceId) || body.travelMode !== "DRIVE" || typeof body.departureAt !== "string") return null;
  const departure = Date.parse(body.departureAt);
  if (!Number.isFinite(departure) || departure < now - 5 * 60_000 || departure > now + 366 * 24 * 60 * 60_000) return null;
  return {
    origin: { latitude: origin.latitude as number, longitude: origin.longitude as number },
    destinationPlaceId: body.destinationPlaceId,
    departureAt: new Date(departure).toISOString(),
    travelMode: "DRIVE",
  };
}

function parseDuration(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /^(\d+)(?:\.(\d{1,9}))?s$/.exec(value);
  if (!match) return null;
  const whole = Number(match[1]);
  const seconds = whole + Number(`0.${match[2] ?? "0"}`);
  return Number.isSafeInteger(whole) && Number.isFinite(seconds) ? Math.ceil(seconds) : null;
}

function nullableInteger(value: unknown) {
  return value === undefined || value === null ? null : typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function normalizeGoogleRoutesPayload(value: unknown, departureAt: string, fetchedAt = new Date().toISOString()): EdgeRouteResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const routes = (value as Record<string, unknown>).routes;
  if (!Array.isArray(routes) || !routes[0] || typeof routes[0] !== "object" || Array.isArray(routes[0])) return null;
  const route = routes[0] as Record<string, unknown>;
  const durationSeconds = parseDuration(route.duration);
  const staticDurationSeconds = route.staticDuration === undefined || route.staticDuration === null ? null : parseDuration(route.staticDuration);
  const distanceMeters = nullableInteger(route.distanceMeters);
  if (durationSeconds === null || staticDurationSeconds === undefined || distanceMeters === undefined) return null;
  return { durationSeconds, staticDurationSeconds, distanceMeters, fetchedAt: new Date(fetchedAt).toISOString(), departureAt: new Date(departureAt).toISOString() };
}

export function classifyGoogleFailure(status: number): { code: RouteErrorCode; status: number; message: string } {
  if (status === 429) return { code: "quota_rate_failure", status: 429, message: "Route quota or rate limit reached." };
  if (status >= 500) return { code: "upstream_unavailable", status: 503, message: "Route service is temporarily unavailable." };
  return { code: "google_rejection", status: 502, message: "Route request was rejected by the route provider." };
}
