import assert from "node:assert/strict";
import test from "node:test";
import { classifyGoogleFailure, hasBearerToken, isBodySizeAllowed, normalizeGoogleRoutesPayload, routeError, validateEdgeRouteRequest } from "../supabase/functions/on-time-route/domain.ts";

const now = Date.parse("2026-07-13T12:00:00Z");
const valid = { origin: { latitude: 40.7, longitude: -74 }, destinationPlaceId: "ChIJ_test-123", departureAt: "2026-07-13T13:00:00Z", travelMode: "DRIVE" };

test("authentication requires a bearer token shape", () => {
  assert.equal(hasBearerToken(null), false);
  assert.equal(hasBearerToken("Basic token"), false);
  assert.equal(hasBearerToken("Bearer token"), true);
});

test("invalid bodies, excess fields, and oversized bodies are rejected", () => {
  assert.equal(validateEdgeRouteRequest(null, now), null);
  assert.equal(validateEdgeRouteRequest({ ...valid, arbitraryUrl: "https://example.com" }, now), null);
  assert.equal(isBodySizeAllowed("4097", 10), false);
  assert.equal(isBodySizeAllowed(null, 4097), false);
});

test("invalid coordinates and departures are rejected", () => {
  assert.equal(validateEdgeRouteRequest({ ...valid, origin: { latitude: 91, longitude: -74 } }, now), null);
  assert.equal(validateEdgeRouteRequest({ ...valid, departureAt: "bad" }, now), null);
  assert.deepEqual(validateEdgeRouteRequest(valid, now), { ...valid, departureAt: "2026-07-13T13:00:00.000Z" });
});

test("Google success is normalized to the narrow result", () => {
  const normalized = normalizeGoogleRoutesPayload({ routes: [{ duration: "1800s", staticDuration: "1500s", distanceMeters: 12000, polyline: "secret" }] }, valid.departureAt, "2026-07-13T12:00:00Z");
  assert.deepEqual(normalized, { durationSeconds: 1800, staticDurationSeconds: 1500, distanceMeters: 12000, fetchedAt: "2026-07-13T12:00:00.000Z", departureAt: "2026-07-13T13:00:00.000Z" });
});

test("upstream errors are classified without exposing raw Google bodies", () => {
  const failure = classifyGoogleFailure(400);
  const response = routeError(failure.code, failure.message);
  assert.deepEqual(response, { error: { code: "google_rejection", message: "Route request was rejected by the route provider." } });
  assert.doesNotMatch(JSON.stringify(response), /Google raw secret/);
  assert.equal(classifyGoogleFailure(429).code, "quota_rate_failure");
  assert.equal(classifyGoogleFailure(503).code, "upstream_unavailable");
});
