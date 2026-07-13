import { classifyGoogleFailure, hasBearerToken, isBodySizeAllowed, normalizeGoogleRoutesPayload, routeError, validateEdgeRouteRequest } from "./domain.ts";

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const REQUEST_TIMEOUT_MS = 8_000;

function allowedOrigins() {
  return new Set((Deno.env.get("GOOGLE_MAPS_ALLOWED_ORIGINS") ?? "").split(",").map((origin) => origin.trim()).filter(Boolean));
}

function corsHeaders(origin: string | null) {
  return origin && allowedOrigins().has(origin) ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  } : {};
}

function json(payload: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
}

async function isAuthenticated(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!hasBearerToken(authorization)) return false;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return false;
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, authorization },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const user = await response.json();
    return Boolean(user && typeof user.id === "string" && user.id);
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins().has(origin)) return json(routeError("invalid_request", "Origin is not allowed."), 403, null);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return json(routeError("invalid_request", "Only POST is supported."), 405, origin);
  if (!await isAuthenticated(request)) return json(routeError("authentication_failure", "Valid Supabase authentication is required."), 401, origin);

  const routesKey = Deno.env.get("GOOGLE_MAPS_ROUTES_API_KEY");
  if (!routesKey) return json(routeError("missing_configuration", "Route service is not configured."), 503, origin);

  let text: string;
  try {
    text = await request.text();
  } catch {
    return json(routeError("invalid_request", "Request body could not be read."), 400, origin);
  }
  const actualBytes = new TextEncoder().encode(text).byteLength;
  if (!isBodySizeAllowed(request.headers.get("content-length"), actualBytes)) return json(routeError("invalid_request", "Request body is too large."), 413, origin);

  let body: unknown;
  try { body = JSON.parse(text); } catch { return json(routeError("invalid_request", "Request body must be valid JSON."), 400, origin); }
  const routeRequest = validateEdgeRouteRequest(body);
  if (!routeRequest) return json(routeError("invalid_request", "Route request is invalid."), 400, origin);

  let upstream: Response;
  try {
    upstream = await fetch(ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": routesKey,
        "X-Goog-FieldMask": "routes.duration,routes.staticDuration,routes.distanceMeters",
      },
      body: JSON.stringify({
        origin: { location: { latLng: routeRequest.origin } },
        destination: { placeId: routeRequest.destinationPlaceId },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE_OPTIMAL",
        trafficModel: "BEST_GUESS",
        departureTime: routeRequest.departureAt,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return json(routeError("upstream_unavailable", "Route service is temporarily unavailable."), 503, origin);
  }

  if (!upstream.ok) {
    const failure = classifyGoogleFailure(upstream.status);
    return json(routeError(failure.code, failure.message), failure.status, origin);
  }

  let payload: unknown;
  try { payload = await upstream.json(); } catch { return json(routeError("upstream_unavailable", "Route service returned an invalid response."), 503, origin); }
  const result = normalizeGoogleRoutesPayload(payload, routeRequest.departureAt);
  if (!result) return json(routeError("no_route", "No route was available."), 404, origin);
  return json(result, 200, origin);
});
