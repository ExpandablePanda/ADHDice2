import assert from "node:assert/strict";
import test from "node:test";
import { ON_TIME_AUTOMATIC_REQUEST_INTERVAL_MS, buildGoogleMapsDirectionsUrl, buildOnTimeRouteRequestSignature, canMakeAutomaticOnTimeRouteRequest, getOnTimeTrafficFreshnessMs, hasOnTimeDepartureShifted, isDuplicateOnTimeRouteRequest, isOnTimeTrafficResultFresh, isReasonableDepartureTimestamp, isValidGooglePlaceId, isValidLatitude, isValidLongitude, normalizeOnTimeRouteResult, parseGoogleDurationSeconds, quantizeOnTimeOrigin, resolveEffectiveOnTimeTravelDuration, type OnTimeRouteRequest, type OnTimeRouteResult } from "../src/lib/on-time-route.ts";

const now = Date.parse("2026-07-13T12:00:00Z");
const request: OnTimeRouteRequest = { origin: { latitude: 40.71281234, longitude: -74.00601234 }, destinationPlaceId: "ChIJ_test-123", departureAt: "2026-07-13T13:02:00Z", travelMode: "DRIVE" };
const result: OnTimeRouteResult = { durationSeconds: 1800, staticDurationSeconds: 1500, distanceMeters: 12000, fetchedAt: "2026-07-13T11:50:00.000Z", departureAt: "2026-07-13T13:02:00.000Z" };

test("coordinate, place ID, and departure validation is conservative", () => {
  assert.equal(isValidLatitude(90), true);
  assert.equal(isValidLatitude(90.1), false);
  assert.equal(isValidLongitude(-180), true);
  assert.equal(isValidLongitude(Infinity), false);
  assert.equal(isValidGooglePlaceId("ChIJ_test-123"), true);
  assert.equal(isValidGooglePlaceId("bad place id"), false);
  assert.equal(isReasonableDepartureTimestamp(request.departureAt, now), true);
  assert.equal(isReasonableDepartureTimestamp("2024-01-01T00:00:00Z", now), false);
});

test("Google duration parsing is safe", () => {
  assert.equal(parseGoogleDurationSeconds("123s"), 123);
  assert.equal(parseGoogleDurationSeconds("123.4s"), 124);
  assert.equal(parseGoogleDurationSeconds("-1s"), null);
  assert.equal(parseGoogleDurationSeconds("123"), null);
});

test("Edge Function results normalize without extra fields", () => {
  assert.deepEqual(normalizeOnTimeRouteResult({ ...result, ignored: "value" }), result);
  assert.equal(normalizeOnTimeRouteResult({ ...result, durationSeconds: -1 }), null);
});

test("effective duration uses fresh Traffic and otherwise falls back to Manual", () => {
  const input = { selectedSource: "traffic" as const, manualDurationSeconds: 2400, trafficResult: result, projectedDepartureAt: request.departureAt, now };
  assert.equal(resolveEffectiveOnTimeTravelDuration(input), 1800);
  assert.equal(resolveEffectiveOnTimeTravelDuration({ ...input, now: Date.parse("2026-07-13T12:20:01Z") }), 2400);
  assert.equal(resolveEffectiveOnTimeTravelDuration({ ...input, selectedSource: "manual" }), 2400);
});

test("Traffic freshness is 15 minutes within two hours and 30 minutes later", () => {
  assert.equal(getOnTimeTrafficFreshnessMs("2026-07-13T14:00:00Z", now), 15 * 60_000);
  assert.equal(getOnTimeTrafficFreshnessMs("2026-07-13T14:00:01Z", now), 30 * 60_000);
  assert.equal(isOnTimeTrafficResultFresh(result, request.departureAt, now), true);
});

test("departure movement threshold is five minutes", () => {
  assert.equal(hasOnTimeDepartureShifted("2026-07-13T13:00:00Z", "2026-07-13T13:04:59Z"), false);
  assert.equal(hasOnTimeDepartureShifted("2026-07-13T13:00:00Z", "2026-07-13T13:05:00Z"), true);
});

test("automatic requests enforce a ten-minute minimum interval", () => {
  assert.equal(canMakeAutomaticOnTimeRouteRequest(null, now), true);
  assert.equal(canMakeAutomaticOnTimeRouteRequest(new Date(now - ON_TIME_AUTOMATIC_REQUEST_INTERVAL_MS + 1).toISOString(), now), false);
  assert.equal(canMakeAutomaticOnTimeRouteRequest(new Date(now - ON_TIME_AUTOMATIC_REQUEST_INTERVAL_MS).toISOString(), now), true);
});

test("origin quantization and five-minute request signatures are deterministic", () => {
  assert.deepEqual(quantizeOnTimeOrigin(request.origin), { latitude: 40.7128, longitude: -74.006 });
  const signature = buildOnTimeRouteRequestSignature(request);
  assert.equal(signature, buildOnTimeRouteRequestSignature({ ...request, origin: { latitude: 40.71284, longitude: -74.00604 }, departureAt: "2026-07-13T13:04:59Z" }));
  assert.notEqual(signature, buildOnTimeRouteRequestSignature({ ...request, departureAt: "2026-07-13T13:05:00Z" }));
});

test("duplicate in-flight request signatures are suppressed", () => {
  const signature = buildOnTimeRouteRequestSignature(request)!;
  assert.equal(isDuplicateOnTimeRouteRequest(signature, new Set([signature])), true);
  assert.equal(isDuplicateOnTimeRouteRequest(signature, new Set()), false);
});

test("Maps URL supports place-ID destinations and optional device-memory origin", () => {
  const url = new URL(buildGoogleMapsDirectionsUrl({ destinationLabel: "JFK Airport", destinationPlaceId: "ChIJ_test-123", origin: request.origin }));
  assert.equal(url.searchParams.get("destination"), "JFK Airport");
  assert.equal(url.searchParams.get("destination_place_id"), "ChIJ_test-123");
  assert.equal(url.searchParams.get("origin"), "40.71281234,-74.00601234");
  assert.equal(url.searchParams.get("travelmode"), "driving");
  assert.equal(url.searchParams.has("dir_action"), false);
});

test("Maps URL safely encodes manual destinations and omits unavailable origin", () => {
  const url = new URL(buildGoogleMapsDirectionsUrl({ destinationLabel: "A&B / Main?" }));
  assert.equal(url.searchParams.get("destination"), "A&B / Main?");
  assert.equal(url.searchParams.has("destination_place_id"), false);
  assert.equal(url.searchParams.has("origin"), false);
});
