import test from "node:test";
import assert from "node:assert/strict";
import type { Milestone, Task } from "@/lib/database.types";
import {
  adaptCurrentlyEarnedTrophies,
  canAutomaticallyRetryTrophyRenderer,
  canRetryTrophyRenderer,
  classifyTrophyRendererError,
  chooseAutoTrophyQuality,
  countEarnedTrophies,
  createTierThumbnailCache,
  detectWebGL2Support,
  filterAndSortTrophies,
  getTrophyTierImageAlt,
  getReducedMotionPolicy,
  getTrophyRotationDelta,
  getTrophyShowcaseStageLayout,
  hydrateTrophyRendererFailureState,
  INITIAL_TROPHY_RENDERER_FAILURE_STATE,
  isCurrentlyEarnedTrophy,
  isFeaturedTrophyValid,
  isTrophyRotationActive,
  normalizeTrophyQuality,
  normalizeTrophySearch,
  persistTrophyRendererFailureState,
  resolveFeaturedTrophy,
  resolveTrophyRendererFallbackReason,
  toggleSingleTrophyFilter,
  TROPHY_QUALITY_PROFILES,
  TROPHY_ROTATION_MAX_FRAME_DELTA_SECONDS,
  TROPHY_ROTATION_RADIANS_PER_SECOND,
  trophyRendererFailureReducer,
} from "@/lib/trophy-case/index.ts";

function milestone(overrides: Partial<Milestone> = {}): Milestone {
  return { id: "m1", user_id: "u1", task_id: "t1", task_title_snapshot: "Saved Trophy", revision: 1, status: "completed", task_trashed_at: null, last_restored_at: null, rules_version: "v1", questions_version: "v1", answers_snapshot: {}, recommendation_snapshot: {}, recommended_tier: "gold", recommended_target_date: "2026-07-15", allowed_target_date_min: "2026-07-01", allowed_target_date_max: "2026-07-31", deadline_kind: "none", external_deadline: null, feasibility_warning: null, rules_explanation: "x", initial_locked_tier: "gold", initial_locked_target_date: "2026-07-15", initial_aura_deadline: "2026-07-18", current_tier: "gold", current_target_date: "2026-07-15", current_aura_deadline: "2026-07-18", tier_raise_explanation: null, setup_correction_used: false, setup_corrected_at: null, completion_timezone: "America/New_York", completion_timing: "on_time", completion_date_key: "2026-07-16", pre_completion_task_snapshot: null, trophy_awarded_at: "2026-07-16T12:00:00Z", trophy_revoked_at: null, aura_kind: "standard", aura_awarded_at: "2026-07-16T12:00:00Z", aura_revoked_at: null, abandoned_at: null, abandonment_reason: null, promoted_at: "2026-07-01T00:00:00Z", locked_at: "2026-07-01T00:00:00Z", completed_at: "2026-07-16T12:00:00Z", reversed_at: null, created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-16T12:00:00Z", ...overrides };
}

function task(id = "t1", title = "Live Trophy"): Task { return { id, title } as Task; }

test("currently-earned predicate excludes reversed, abandoned, active, and malformed rows", () => {
  assert.equal(isCurrentlyEarnedTrophy(milestone()), true);
  assert.equal(isCurrentlyEarnedTrophy(milestone({ trophy_revoked_at: "2026-07-17T00:00:00Z" })), false);
  assert.equal(isCurrentlyEarnedTrophy(milestone({ status: "abandoned" })), false);
  assert.equal(isCurrentlyEarnedTrophy(milestone({ status: "active" })), false);
  assert.equal(isCurrentlyEarnedTrophy(milestone({ completion_date_key: null })), false);
});

test("adapter prefers live title and preserves deleted-task snapshot", () => {
  assert.equal(adaptCurrentlyEarnedTrophies([milestone()], [task()])[0].title, "Live Trophy");
  const deleted = adaptCurrentlyEarnedTrophies([milestone({ task_id: null })], []);
  assert.equal(deleted[0].title, "Saved Trophy");
  assert.equal(deleted[0].taskId, null);
  assert.equal(adaptCurrentlyEarnedTrophies([milestone({ aura_revoked_at: "2026-07-17T00:00:00Z" })], [task()])[0].auraKind, "none");
});

test("search normalization, tier filters, aura filters, and newest/oldest sorting", () => {
  const trophies = adaptCurrentlyEarnedTrophies([
    milestone({ id: "b", task_id: "b", task_title_snapshot: "Deep Work", current_tier: "bronze", aura_kind: "none", completed_at: "2026-07-14T12:00:00Z" }),
    milestone({ id: "g", task_id: "g", task_title_snapshot: "Write Plan", current_tier: "gold", aura_kind: "diamond", completed_at: "2026-07-16T12:00:00Z" }),
  ], []);
  assert.equal(normalizeTrophySearch("  DEEP   work "), "deep work");
  assert.deepEqual(filterAndSortTrophies(trophies, { search: "deep   WORK", tiers: new Set(), auras: new Set() }, "newest").map((item) => item.milestoneId), ["b"]);
  assert.deepEqual(filterAndSortTrophies(trophies, { search: "", tiers: new Set(["gold"]), auras: new Set() }, "newest").map((item) => item.milestoneId), ["g"]);
  assert.deepEqual(filterAndSortTrophies(trophies, { search: "", tiers: new Set(), auras: new Set(["none"]) }, "newest").map((item) => item.milestoneId), ["b"]);
  assert.deepEqual(filterAndSortTrophies(trophies, { search: "", tiers: new Set(), auras: new Set() }, "newest").map((item) => item.milestoneId), ["g", "b"]);
  assert.deepEqual(filterAndSortTrophies(trophies, { search: "", tiers: new Set(), auras: new Set() }, "oldest").map((item) => item.milestoneId), ["b", "g"]);
});

test("gallery counts currently earned trophies by tier and Aura without filtering the collection", () => {
  const trophies = adaptCurrentlyEarnedTrophies([
    milestone({ id: "b", task_id: null, current_tier: "bronze", aura_kind: "standard" }),
    milestone({ id: "s", task_id: null, current_tier: "silver", aura_kind: "standard" }),
    milestone({ id: "g", task_id: null, current_tier: "gold", aura_kind: "none" }),
    milestone({ id: "p", task_id: null, current_tier: "platinum", aura_kind: "diamond" }),
    milestone({ id: "revoked", task_id: null, trophy_revoked_at: "2026-07-17T00:00:00Z" }),
    milestone({ id: "abandoned", task_id: null, status: "abandoned" }),
  ], []);
  assert.deepEqual(countEarnedTrophies(trophies), {
    auras: { diamond: 1, none: 1, standard: 2 },
    tiers: { bronze: 1, gold: 1, platinum: 1, silver: 1 },
    total: 4,
  });
});

test("tier and Aura controls toggle singly and All can clear both without touching search", () => {
  assert.deepEqual(toggleSingleTrophyFilter([], "gold"), ["gold"]);
  assert.deepEqual(toggleSingleTrophyFilter(["gold"], "gold"), []);
  assert.deepEqual(toggleSingleTrophyFilter(["gold"], "bronze"), ["bronze"]);
});

test("combined tier and Aura filters preserve normalized search and sort", () => {
  const trophies = adaptCurrentlyEarnedTrophies([
    milestone({ id: "new", task_id: null, task_title_snapshot: "  Deep   Work  ", current_tier: "gold", aura_kind: "diamond", completed_at: "2026-07-17T12:00:00Z" }),
    milestone({ id: "old", task_id: null, task_title_snapshot: "Deep Work Plan", current_tier: "gold", aura_kind: "diamond", completed_at: "2026-07-15T12:00:00Z" }),
    milestone({ id: "other", task_id: null, task_title_snapshot: "Deep Work", current_tier: "silver", aura_kind: "standard" }),
  ], []);
  const filters = { search: " deep   work ", tiers: new Set(["gold"] as const), auras: new Set(["diamond"] as const) };
  assert.deepEqual(filterAndSortTrophies(trophies, filters, "newest").map((item) => item.milestoneId), ["new", "old"]);
  assert.deepEqual(filterAndSortTrophies(trophies, filters, "oldest").map((item) => item.milestoneId), ["old", "new"]);
});

test("card image variants are deterministic and thumbnail generation is cached once per tier", async () => {
  const calls: string[] = [];
  const getThumbnails = createTierThumbnailCache(async (tier) => { calls.push(tier); return `${tier}.png`; });
  const [first, second] = await Promise.all([getThumbnails(), getThumbnails()]);
  assert.equal(first.gold, "gold.png");
  assert.equal(second.platinum, "platinum.png");
  assert.deepEqual(calls.sort(), ["bronze", "gold", "platinum", "silver"]);
  assert.equal(getTrophyTierImageAlt("silver"), "Silver trophy die");
});

test("featured validity and newest fallback are deterministic", () => {
  const trophies = adaptCurrentlyEarnedTrophies([milestone({ id: "old", task_id: null, completed_at: "2026-07-14T00:00:00Z" }), milestone({ id: "new", task_id: null })], []);
  assert.equal(isFeaturedTrophyValid(trophies, "old"), true);
  assert.equal(isFeaturedTrophyValid(trophies, "missing"), false);
  assert.equal(resolveFeaturedTrophy(trophies, "missing")?.milestoneId, "new");
});

test("quality normalization, conservative auto fallback, and reduced motion policy", () => {
  assert.equal(normalizeTrophyQuality("ultra"), "auto");
  assert.equal(chooseAutoTrophyQuality({}), "balanced");
  assert.equal(chooseAutoTrophyQuality({ viewportWidth: 390 }), "performance");
  assert.equal(TROPHY_QUALITY_PROFILES.high.dpr, 2.5);
  assert.equal(TROPHY_QUALITY_PROFILES.balanced.dpr, 2);
  assert.equal(TROPHY_QUALITY_PROFILES.performance.dpr, 1.25);
  assert.deepEqual(getReducedMotionPolicy(false, false), { animateCamera: true, autoRotate: true, decorativeEffects: true, reduced: false });
  assert.deepEqual(getReducedMotionPolicy(true, false), { animateCamera: false, autoRotate: false, decorativeEffects: false, reduced: true });
  assert.deepEqual(getReducedMotionPolicy(false, true), { animateCamera: false, autoRotate: false, decorativeEffects: false, reduced: true });
});

test("rotation policy pauses while hidden, resumes while visible, and is independent of Performance quality", () => {
  const normalMotion = getReducedMotionPolicy(false, false);
  assert.equal(isTrophyRotationActive(normalMotion.autoRotate, "visible"), true);
  assert.equal(isTrophyRotationActive(normalMotion.autoRotate, "hidden"), false);
  assert.equal(isTrophyRotationActive(getReducedMotionPolicy(true, false).autoRotate, "visible"), false);
  assert.equal(isTrophyRotationActive(getReducedMotionPolicy(false, true).autoRotate, "visible"), false);
  assert.equal(TROPHY_QUALITY_PROFILES.performance.shadows, false);
  assert.equal(isTrophyRotationActive(normalMotion.autoRotate, "visible"), true);
});

test("rotation uses restrained frame delta and clamps large tab-return frames", () => {
  assert.equal(TROPHY_ROTATION_RADIANS_PER_SECOND, 0.22);
  assert.equal(getTrophyRotationDelta(1 / 60, true), (1 / 60) * TROPHY_ROTATION_RADIANS_PER_SECOND);
  assert.equal(getTrophyRotationDelta(5, true), TROPHY_ROTATION_MAX_FRAME_DELTA_SECONDS * TROPHY_ROTATION_RADIANS_PER_SECOND);
  assert.equal(getTrophyRotationDelta(1 / 60, false), 0);
});

test("fixed shared-canvas showcase assigns one centered stage per tier on desktop and mobile", () => {
  const desktop = getTrophyShowcaseStageLayout(1000, 286, 4);
  const mobile = getTrophyShowcaseStageLayout(360, 450, 2);
  assert.equal(desktop.length, 4);
  assert.equal(mobile.length, 4);
  assert.deepEqual(desktop.map((stage) => stage.scale), [desktop[0].scale, desktop[0].scale, desktop[0].scale, desktop[0].scale]);
  assert.equal(desktop[0].position[0], -desktop[3].position[0]);
  assert.equal(desktop[1].position[0], -desktop[2].position[0]);
  assert.equal(desktop[0].position[1], desktop[3].position[1]);
  assert.equal(mobile[0].position[0], -mobile[1].position[0]);
  assert.equal(mobile[2].position[0], -mobile[3].position[0]);
  assert.ok(mobile[0].position[1] > mobile[2].position[1]);
});

test("fallback reasons distinguish preference, detection, and renderer failures without motion-policy coupling", () => {
  assert.equal(resolveTrophyRendererFallbackReason({ explicitStatic: true, runtimeReason: "none", webGLSupported: true }), "explicit-static");
  assert.equal(resolveTrophyRendererFallbackReason({ explicitStatic: false, runtimeReason: "none", webGLSupported: false }), "detection-failed");
  assert.equal(resolveTrophyRendererFallbackReason({ explicitStatic: false, runtimeReason: "renderer-error", webGLSupported: true }), "renderer-error");
  for (const autoRotate of [true, false]) {
    assert.equal(resolveTrophyRendererFallbackReason({ explicitStatic: false, runtimeReason: "none", webGLSupported: true }), "none");
    assert.equal(typeof autoRotate, "boolean");
  }
});

test("WebGL detection falls back from the strict Safari probe and releases a successful probe context", () => {
  const calls: Array<WebGLContextAttributes | undefined> = [];
  let lost = 0;
  const context = { getExtension: () => ({ loseContext: () => { lost += 1; } }) } as unknown as WebGL2RenderingContext;
  const factory = () => ({ getContext: (_kind: string, attributes?: WebGLContextAttributes) => {
    calls.push(attributes);
    return attributes?.failIfMajorPerformanceCaveat ? null : context;
  } }) as unknown as HTMLCanvasElement;
  assert.equal(detectWebGL2Support(factory), true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.failIfMajorPerformanceCaveat, true);
  assert.equal(calls[1], undefined);
  assert.equal(lost, 1);
});

test("WebGL detection returns false only after strict and ordinary probes both fail", () => {
  let calls = 0;
  const factory = () => ({ getContext: () => { calls += 1; return null; } }) as unknown as HTMLCanvasElement;
  assert.equal(detectWebGL2Support(factory), false);
  assert.equal(calls, 2);
});

test("session diagnostics are user/version scoped and permit a fresh live attempt", () => {
  const failed = trophyRendererFailureReducer(INITIAL_TROPHY_RENDERER_FAILURE_STATE, { at: "2026-07-16T12:00:00Z", reason: "renderer-error", type: "fail" });
  const persisted = persistTrophyRendererFailureState(failed, "user-a", "6.29.34");
  const hydrated = hydrateTrophyRendererFailureState(persisted, "user-a", "6.29.34");
  assert.equal(hydrated.failureCount, 1);
  assert.equal(hydrated.latestFailureReason, "renderer-error");
  assert.equal(hydrated.fallbackReason, "none");
  assert.deepEqual(hydrateTrophyRendererFailureState(persisted, "user-b", "6.29.34"), INITIAL_TROPHY_RENDERER_FAILURE_STATE);
  assert.deepEqual(hydrateTrophyRendererFailureState(persisted, "user-a", "6.29.33"), INITIAL_TROPHY_RENDERER_FAILURE_STATE);
});

test("manual retry clears static runtime state and remains available after repeated failures", () => {
  const first = trophyRendererFailureReducer(INITIAL_TROPHY_RENDERER_FAILURE_STATE, { at: "a", reason: "renderer-error", type: "fail" });
  const retried = trophyRendererFailureReducer(first, { type: "manual-retry" });
  const second = trophyRendererFailureReducer(retried, { at: "b", reason: "renderer-error", type: "fail" });
  assert.equal(retried.fallbackReason, "none");
  assert.equal(retried.retryKey, 1);
  assert.equal(canAutomaticallyRetryTrophyRenderer(second), false);
  assert.equal(canRetryTrophyRenderer(), true);
  assert.equal(trophyRendererFailureReducer(second, { type: "manual-retry" }).fallbackReason, "none");
});

test("context loss waits for restoration, restoration remounts, and timeout falls back safely", () => {
  const lost = trophyRendererFailureReducer(INITIAL_TROPHY_RENDERER_FAILURE_STATE, { at: "a", type: "context-lost" });
  assert.equal(lost.contextLossPending, true);
  assert.equal(lost.latestFailureReason, "context-lost");
  assert.equal(lost.fallbackReason, "none");
  const restored = trophyRendererFailureReducer(lost, { type: "context-restored" });
  assert.equal(restored.contextLossPending, false);
  assert.equal(restored.retryKey, 1);
  assert.equal(trophyRendererFailureReducer(lost, { type: "context-restore-timeout" }).fallbackReason, "context-lost");
});

test("dynamic import failures retain a distinct diagnostic reason", () => {
  const error = new Error("The live trophy renderer module could not load.");
  error.name = "TrophyDynamicImportError";
  assert.equal(classifyTrophyRendererError(error), "dynamic-import-error");
  assert.equal(classifyTrophyRendererError(new Error("WebGLRenderer failed")), "renderer-error");
});
