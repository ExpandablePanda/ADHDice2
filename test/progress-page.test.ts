import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { ACHIEVEMENT_MVP_CATALOG, getAchievementTrack } from "../src/lib/achievements-mvp/catalog.ts";
import {
  buildDevelopmentAchievementTestCelebrations,
  createDevelopmentAchievementTestFixtures,
} from "../src/lib/achievement-test-fixtures.ts";
import type { AchievementTierId } from "../src/lib/achievements-mvp/types.ts";
import { AchievementNotificationClaimController } from "../src/hooks/useAchievementProgress.ts";
import {
  buildAchievementCelebrations,
  buildAchievementCollectionAwardDescription,
  buildAchievementProgressModel,
  buildAchievementSummaryPresentation,
  buildAchievementTierAwardDescription,
  emptyAchievementRuntimeSnapshot,
  formatAchievementDate,
  formatAchievementValue,
  getCurrentAndNextTier,
  getMilestonesTabState,
  getNextProgressTab,
  getAchievementSnapshotReadiness,
  isCurrentAchievementLoad,
  mergeCelebrationQueue,
  reserveCelebrationAcknowledgement,
  shouldClaimAchievementNotifications,
  TOTAL_ACHIEVEMENT_TIERS,
  type AchievementRuntimeSnapshot,
  type AchievementSnapshotLoadState,
} from "../src/lib/achievement-progress.ts";
import {
  claimAchievementNotifications,
  markAchievementNotificationSeen,
} from "../src/lib/achievement-progress-repository.ts";
import type {
  AchievementCollectionAward,
  AchievementNotification,
  AchievementProgress,
  AchievementTierAward,
  Milestone,
} from "../src/lib/database.types.ts";

function tierAward(id: string, trackId: string, tier: AchievementTierId, earnedAt: string): AchievementTierAward {
  return {
    award_key: `${trackId}:${tier}`,
    catalog_version: "achievements-mvp-v1",
    created_at: earnedAt,
    earned_at: earnedAt,
    evaluation_run_id: null,
    evaluator_version: "test",
    id,
    tier,
    track_id: trackId,
    triggering_occurrence_id: null,
    user_id: "user-1",
  };
}

function collectionAward(id: string, collectionId: string, earnedAt: string): AchievementCollectionAward {
  return {
    award_key: collectionId,
    catalog_version: "achievements-mvp-v1",
    collection_id: collectionId,
    created_at: earnedAt,
    earned_at: earnedAt,
    evaluation_run_id: null,
    id,
    mastery_version: "achievements-launch-v1",
    required_track_ids_snapshot: [],
    required_tracks_fingerprint: "test",
    user_id: "user-1",
  };
}

function progress(trackId: string, currentValue: number): AchievementProgress {
  return {
    best_streak: 0,
    best_streak_end: null,
    best_streak_start: null,
    catalog_version: "achievements-mvp-v1",
    created_at: "2026-07-17T00:00:00Z",
    current_streak: 0,
    current_streak_end: null,
    current_streak_start: null,
    current_value: currentValue,
    evaluator_version: "test",
    id: `progress-${trackId}`,
    last_recalculated_at: null,
    recalculation_metadata: {},
    source_watermark: {},
    track_id: trackId,
    updated_at: "2026-07-17T00:00:00Z",
    user_id: "user-1",
  };
}

function notification(id: string, createdAt: string, tierAwardId: string): AchievementNotification {
  return {
    award_kind: "tier",
    collection_award_id: null,
    created_at: createdAt,
    dedupe_key: id,
    delivered_at: createdAt,
    id,
    seen_at: null,
    status: "delivered",
    tier_award_id: tierAwardId,
    user_id: "user-1",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

test("Progress maps the canonical four collections and all 18 tracks", () => {
  const model = buildAchievementProgressModel(emptyAchievementRuntimeSnapshot());
  assert.equal(model.collections.length, 4);
  assert.equal(model.collections.flatMap((collection) => collection.tracks).length, 18);
  assert.deepEqual(model.collections.map((collection) => collection.title), ["You Can Count On Me", "One Step at a Time", "Clocked In", "We’re Going Streaking"]);
  assert.deepEqual(model.collections.flatMap((collection) => collection.tracks).map((track) => track.title), [
    "I Can Count to Ten", "Fifty-Two Each Year", "Twelve Each Year", "Count on Me",
    "First Step", "Second Step", "Third Step", "Last Step",
    "Broken Clock", "Overtime", "February Challenge", "Locked In", "Staring Contest", "Session Possible",
    "Do Something", "Don’t Get Distracted", "This Week on the Streak", "Keep It Moving",
  ]);
  assert.equal(TOTAL_ACHIEVEMENT_TIERS, 72);
});

test("current and next-tier progress honors permanent awards", () => {
  const track = getAchievementTrack("i_can_count_to_ten")!;
  assert.deepEqual(getCurrentAndNextTier(track, 75, new Set(["bronze"])), {
    currentValue: 75,
    nextThreshold: 100,
    nextTier: "silver",
    progressPercent: 75,
  });
  const awardWithoutProgress = getCurrentAndNextTier(track, 0, new Set(["bronze", "silver"]));
  assert.equal(awardWithoutProgress.currentValue, 100);
  assert.equal(awardWithoutProgress.nextTier, "gold");
});

test("earned, locked, and Platinum-complete tier states are stable", () => {
  const snapshot: AchievementRuntimeSnapshot = {
    ...emptyAchievementRuntimeSnapshot(),
    tierAwards: (["bronze", "silver", "gold", "platinum"] as AchievementTierId[]).map((tier, index) => tierAward(`award-${tier}`, "last_step", tier, `2026-07-${10 + index}T12:00:00Z`)),
  };
  const track = buildAchievementProgressModel(snapshot).collections.flatMap((collection) => collection.tracks).find((candidate) => candidate.id === "last_step")!;
  assert.equal(track.tiers.filter((tier) => tier.isEarned).length, 4);
  assert.equal(track.isComplete, true);
  assert.equal(track.nextTier, null);
  assert.equal(track.progressPercent, 100);
});

test("count, date, duration, and streak units format compactly", () => {
  assert.equal(formatAchievementValue(1_250, "occurrences"), "1,250 completions");
  assert.equal(formatAchievementValue(3, "days"), "3 days");
  assert.equal(formatAchievementValue(1, "weeks"), "1 week");
  assert.equal(formatAchievementValue(7_500, "seconds"), "2 hrs 5 min");
  assert.equal(formatAchievementValue(1, "sessions"), "1 session");
  assert.equal(formatAchievementDate("2026-07-17T23:30:00-04:00"), "Jul 18, 2026");
});

test("award descriptions derive the correct threshold, scope, and units from canonical tracks", () => {
  assert.equal(
    buildAchievementTierAwardDescription(getAchievementTrack("count_on_me")!, "bronze"),
    "Completed 1,000 parent Tasks since Achievements were activated.",
  );
  assert.equal(
    buildAchievementTierAwardDescription(getAchievementTrack("first_step")!, "bronze"),
    "Completed 30 Steps in one logical day.",
  );
  assert.equal(
    buildAchievementTierAwardDescription(getAchievementTrack("broken_clock")!, "bronze"),
    "Logged 4 hrs of qualifying Focus time in one logical day.",
  );
  assert.equal(
    buildAchievementTierAwardDescription(getAchievementTrack("do_something")!, "silver"),
    "Completed at least 1 parent Task on 7 consecutive logical days.",
  );
  assert.equal(
    buildAchievementTierAwardDescription(getAchievementTrack("last_step")!, "bronze"),
    "Completed the full Step set for 1 parent Task since Achievements were activated.",
  );
});

test("every current catalog award has a specific deterministic description", () => {
  for (const track of ACHIEVEMENT_MVP_CATALOG.tracks) {
    for (const tier of ["bronze", "silver", "gold", "platinum"] as AchievementTierId[]) {
      const description = buildAchievementTierAwardDescription(track, tier);
      assert.ok(description.length > 20, `${track.id} ${tier} needs a specific description`);
      const thresholdLabel = track.unit === "seconds"
        ? formatAchievementValue(track.thresholds[tier], track.unit)
        : track.thresholds[tier].toLocaleString("en-US");
      assert.ok(description.includes(thresholdLabel), `${track.id} ${tier} needs its awarded threshold`);
    }
  }
  for (const collection of ACHIEVEMENT_MVP_CATALOG.collections) {
    const description = buildAchievementCollectionAwardDescription(collection.id);
    assert.match(description, /required tracks in this Collection/);
    assert.match(description, /Platinum tier/);
  }
});

test("development Achievement fixtures use canonical thresholds and produce canonical accomplishment copy", () => {
  const fixtures = createDevelopmentAchievementTestFixtures("fixture-proof");
  const byKind = new Map(fixtures.map((fixture) => [fixture.kind, fixture]));
  assert.equal(byKind.get("parent_task")?.snapshot.tierAwards[0]?.track_id, "count_on_me");
  assert.equal(getAchievementTrack("count_on_me")?.thresholds.bronze, 1_000);
  assert.equal(byKind.get("steps")?.snapshot.tierAwards[0]?.track_id, "first_step");
  assert.equal(getAchievementTrack("first_step")?.thresholds.bronze, 30);
  assert.equal(byKind.get("focus")?.snapshot.tierAwards[0]?.track_id, "broken_clock");
  assert.equal(getAchievementTrack("broken_clock")?.thresholds.bronze, 4 * 60 * 60);
  assert.equal(byKind.get("streak")?.snapshot.tierAwards[0]?.track_id, "do_something");
  assert.equal(getAchievementTrack("do_something")?.thresholds.silver, 7);
  assert.equal(byKind.get("collection")?.snapshot.collectionAwards[0]?.collection_id, "one_step_at_a_time");

  const celebrations = buildDevelopmentAchievementTestCelebrations(fixtures);
  assert.deepEqual(celebrations.map((celebration) => celebration.description), [
    "Completed 1,000 parent Tasks since Achievements were activated.",
    "Completed 30 Steps in one logical day.",
    "Logged 4 hrs of qualifying Focus time in one logical day.",
    "Completed at least 1 parent Task on 7 consecutive logical days.",
    buildAchievementCollectionAwardDescription("one_step_at_a_time"),
    "Open Progress for the latest details.",
  ]);
  assert.ok(celebrations.every((celebration) => celebration.isDevelopmentTest));
});

test("development Achievement trigger-all fixtures are deterministic, unique per run, and enter the existing queue API", () => {
  const firstRun = createDevelopmentAchievementTestFixtures("run-one");
  const secondRun = createDevelopmentAchievementTestFixtures("run-two");
  assert.deepEqual(firstRun.map((fixture) => fixture.kind), ["parent_task", "steps", "focus", "streak", "collection", "legacy"]);
  assert.equal(new Set(firstRun.map((fixture) => fixture.notification.id)).size, 6);
  assert.equal(new Set([...firstRun, ...secondRun].map((fixture) => fixture.notification.id)).size, 12);
  const queue = mergeCelebrationQueue([], buildDevelopmentAchievementTestCelebrations(firstRun), new Set());
  assert.deepEqual(queue.map((celebration) => celebration.id), firstRun.map((fixture) => fixture.notification.id));
  assert.equal(mergeCelebrationQueue(queue, buildDevelopmentAchievementTestCelebrations(firstRun), new Set()).length, 6);
});

test("development Achievement harness is gated from production and fixture construction has no persistence path", () => {
  const fixturesSource = readFileSync(new URL("../src/lib/achievement-test-fixtures.ts", import.meta.url), "utf8");
  const hookSource = readFileSync(new URL("../src/hooks/useAchievementProgress.ts", import.meta.url), "utf8");
  const pageSource = readFileSync(new URL("../src/components/task-app/achievements-page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(fixturesSource, /claimAchievementNotifications|markAchievementNotificationSeen|supabase|repository|localStorage/i);
  assert.match(hookSource, /const isDevelopment = process\.env\.NODE_ENV !== "production";/);
  assert.match(hookSource, /if \(process\.env\.NODE_ENV === "production"\) return;/);
  assert.match(hookSource, /if \(current\.isDevelopmentTest\) return;/);
  assert.match(pageSource, /process\.env\.NODE_ENV !== "production".*AchievementTestControls/s);
});

test("summary totals, partial runtime rows, empty data, and recent award selection are correct", () => {
  const empty = buildAchievementProgressModel(emptyAchievementRuntimeSnapshot());
  assert.deepEqual(empty.summary, { completedCollections: 0, earnedTiers: 0, mostRecentUnlock: null, overallCompletionPercent: 0, totalTiers: 72 });

  const partial = buildAchievementProgressModel({
    ...emptyAchievementRuntimeSnapshot(),
    collectionAwards: [collectionAward("collection-1", "you_can_count_on_me", "2026-07-18T12:00:00Z")],
    progress: [progress("i_can_count_to_ten", 75)],
    tierAwards: [
      tierAward("award-1", "i_can_count_to_ten", "bronze", "2026-07-17T12:00:00Z"),
      tierAward("award-2", "count_on_me", "bronze", "2026-07-16T12:00:00Z"),
    ],
  });
  assert.equal(partial.summary.earnedTiers, 2);
  assert.equal(partial.summary.overallCompletionPercent, 3);
  assert.equal(partial.summary.completedCollections, 1);
  assert.equal(partial.summary.mostRecentUnlock?.label, "You Can Count On Me · Collection mastered");
});

test("no-user to authenticated transition waits for that user's loaded snapshot before claiming", async () => {
  const noUserState: AchievementSnapshotLoadState = {
    error: null,
    ownerUserId: null,
    snapshot: emptyAchievementRuntimeSnapshot(),
    status: "no_user",
  };
  assert.equal(getAchievementSnapshotReadiness(noUserState, null, true), "no_user");
  assert.equal(getAchievementSnapshotReadiness(noUserState, "user-1", true), "loading");
  const pendingRow = { ...notification("notification-auth", "2026-07-18T12:01:00Z", "award-auth"), delivered_at: null, status: "pending" as const };
  let claimCalls = 0;
  const claimClient = {
    rpc: async () => {
      claimCalls += 1;
      return { data: [{ ...pendingRow, delivered_at: "2026-07-18T12:02:00Z", status: "delivered" }], error: null };
    },
  } as unknown as Parameters<typeof claimAchievementNotifications>[0];
  if (shouldClaimAchievementNotifications({ claimedUserId: null, currentUserId: "user-1", readiness: "loading", snapshotOwnerUserId: null })) {
    await claimAchievementNotifications(claimClient);
  }
  assert.equal(claimCalls, 0);

  const loadedUserState: AchievementSnapshotLoadState = {
    ...noUserState,
    ownerUserId: "user-1",
    status: "loaded",
  };
  assert.equal(getAchievementSnapshotReadiness(loadedUserState, "user-1", true), "loaded");
  if (shouldClaimAchievementNotifications({ claimedUserId: null, currentUserId: "user-1", readiness: "loaded", snapshotOwnerUserId: "user-1" })) {
    await claimAchievementNotifications(claimClient);
  }
  assert.equal(claimCalls, 1);
});

test("user A load cannot become current after switching to user B", () => {
  assert.equal(isCurrentAchievementLoad(1, 2, "user-a", "user-b"), false);
  assert.equal(isCurrentAchievementLoad(1, 2, "user-a", "user-a"), false);
  assert.equal(isCurrentAchievementLoad(2, 2, "user-b", "user-b"), true);
  const staleUserAState: AchievementSnapshotLoadState = {
    error: null,
    ownerUserId: "user-a",
    snapshot: emptyAchievementRuntimeSnapshot(),
    status: "loaded",
  };
  assert.equal(getAchievementSnapshotReadiness(staleUserAState, "user-b", true), "loading");
});

test("notification queue is deterministic and suppresses duplicates across rerenders", () => {
  const awards = [
    tierAward("award-a", "first_step", "bronze", "2026-07-17T12:00:00Z"),
    tierAward("award-b", "second_step", "silver", "2026-07-17T12:01:00Z"),
  ];
  const rows = [
    notification("notification-b", "2026-07-17T12:01:00Z", "award-b"),
    notification("notification-a", "2026-07-17T12:00:00Z", "award-a"),
    notification("notification-a", "2026-07-17T12:00:00Z", "award-a"),
  ];
  const celebrations = buildAchievementCelebrations(rows, { ...emptyAchievementRuntimeSnapshot(), tierAwards: awards });
  assert.deepEqual(celebrations.map((item) => item.id), ["notification-a", "notification-b"]);
  const firstMerge = mergeCelebrationQueue([], celebrations, new Set());
  const secondMerge = mergeCelebrationQueue(firstMerge, celebrations, new Set());
  assert.equal(secondMerge.length, 2);
  assert.deepEqual(mergeCelebrationQueue([], celebrations, new Set(["notification-a"])).map((item) => item.id), ["notification-b"]);
});

test("actual claim RPC rows enter the queue once their matching snapshot is ready", async () => {
  const award = tierAward("award-claim", "first_step", "bronze", "2026-07-18T12:00:00Z");
  const claimedRow = notification("notification-claim", "2026-07-18T12:01:00Z", award.id);
  const claimClient = { rpc: async () => ({ data: [claimedRow], error: null }) } as unknown as Parameters<typeof claimAchievementNotifications>[0];
  const claimResult = await claimAchievementNotifications(claimClient);
  const celebrations = buildAchievementCelebrations(claimResult.data, { ...emptyAchievementRuntimeSnapshot(), tierAwards: [award] });
  const queue = mergeCelebrationQueue([], celebrations, new Set());
  assert.deepEqual(queue.map((item) => ({ description: item.description, detail: item.detail, id: item.id, title: item.title })), [
    { description: "Completed 30 Steps in one logical day.", detail: "Bronze tier earned", id: claimedRow.id, title: "First Step" },
  ]);
});

test("Collection notifications use the same canonical description field", () => {
  const award = collectionAward("collection-award", "one_step_at_a_time", "2026-07-18T12:00:00Z");
  const claimedRow = {
    ...notification("collection-notification", "2026-07-18T12:01:00Z", "unused"),
    award_kind: "collection" as const,
    collection_award_id: award.id,
    tier_award_id: null,
  };
  const celebration = buildAchievementCelebrations([claimedRow], { ...emptyAchievementRuntimeSnapshot(), collectionAwards: [award] })[0]!;
  assert.equal(celebration.description, buildAchievementCollectionAwardDescription("one_step_at_a_time"));
  assert.equal(celebration.detail, "Collection mastery earned");
});

test("Strict Mode replay preserves one in-flight claim and queues its result exactly once", async () => {
  const controller = new AchievementNotificationClaimController();
  const client = {} as Parameters<AchievementNotificationClaimController["syncOwner"]>[0];
  const pending = deferred<ReturnType<typeof notification>[]>();
  let claimCalls = 0;
  const firstLease = controller.acquireOwner(client, "user-1");
  const firstEffect = controller.claimOnce(client!, "user-1", () => {
    claimCalls += 1;
    return pending.promise;
  });

  controller.releaseOwnerAfterReplayWindow(firstLease);
  controller.acquireOwner(client, "user-1");
  await Promise.resolve();
  const replayEffect = controller.claimOnce(client!, "user-1", () => {
    claimCalls += 1;
    return pending.promise;
  });
  assert.equal(replayEffect, null);
  assert.equal(claimCalls, 1);

  const claimedRow = notification("notification-strict", "2026-07-18T12:01:00Z", "missing-award");
  pending.resolve([claimedRow]);
  const result = await firstEffect;
  const queue = mergeCelebrationQueue([], buildAchievementCelebrations(result ?? [], emptyAchievementRuntimeSnapshot()), new Set());
  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.title, "Achievement unlocked");
  assert.equal(queue[0], queue.at(0));
  assert.equal(controller.claimOnce(client!, "user-1", async () => [claimedRow]), null);
});

test("claim ownership rejects late auth results and permits a later valid session", async () => {
  const controller = new AchievementNotificationClaimController();
  const client = {} as Parameters<AchievementNotificationClaimController["syncOwner"]>[0];
  const userAClaim = deferred<string>();
  controller.syncOwner(client, "user-a");
  const lateUserA = controller.claimOnce(client!, "user-a", () => userAClaim.promise);
  controller.syncOwner(client, "user-b");
  userAClaim.resolve("stale-a");
  assert.equal(await lateUserA, null);

  const userBClaim = controller.claimOnce(client!, "user-b", async () => "accepted-b");
  assert.equal(await userBClaim, "accepted-b");
  controller.syncOwner(client, null);
  const signedOutClaim = deferred<string>();
  controller.syncOwner(client, "user-a");
  const lateAfterSignOut = controller.claimOnce(client!, "user-a", () => signedOutClaim.promise);
  controller.syncOwner(client, null);
  signedOutClaim.resolve("stale-after-sign-out");
  assert.equal(await lateAfterSignOut, null);

  controller.syncOwner(client, "user-a");
  assert.deepEqual(await controller.claimOnce(client!, "user-a", async () => ({ error: "claim unavailable" })), { error: "claim unavailable" });
  controller.syncOwner(client, null);
  controller.syncOwner(client, "user-a");
  assert.deepEqual(await controller.claimOnce(client!, "user-a", async () => ({ error: null })), { error: null });
});

test("changing the notification client invalidates the previous owner's late claim", async () => {
  const controller = new AchievementNotificationClaimController();
  const firstClient = {} as Parameters<AchievementNotificationClaimController["syncOwner"]>[0];
  const secondClient = {} as Parameters<AchievementNotificationClaimController["syncOwner"]>[0];
  const pending = deferred<string>();
  controller.syncOwner(firstClient, "user-1");
  const staleClaim = controller.claimOnce(firstClient!, "user-1", () => pending.promise);
  controller.syncOwner(secondClient, "user-1");
  pending.resolve("stale-client");
  assert.equal(await staleClaim, null);
  assert.equal(await controller.claimOnce(secondClient!, "user-1", async () => "current-client"), "current-client");
});

test("a genuine controller release invalidates its late claim after the replay window", async () => {
  const controller = new AchievementNotificationClaimController();
  const client = {} as Parameters<AchievementNotificationClaimController["syncOwner"]>[0];
  const pending = deferred<string>();
  const lease = controller.acquireOwner(client, "user-1");
  const staleClaim = controller.claimOnce(client!, "user-1", () => pending.promise);
  controller.releaseOwnerAfterReplayWindow(lease);
  await Promise.resolve();
  pending.resolve("stale-controller");
  assert.equal(await staleClaim, null);
});

test("missing award metadata produces a safe fallback celebration instead of dropping a claimed row", () => {
  const claimedRow = notification("notification-missing", "2026-07-18T12:01:00Z", "missing-award");
  const celebrations = buildAchievementCelebrations([claimedRow], emptyAchievementRuntimeSnapshot());
  assert.equal(celebrations.length, 1);
  assert.equal(celebrations[0]?.id, claimedRow.id);
  assert.equal(celebrations[0]?.title, "Achievement unlocked");
  assert.equal(celebrations[0]?.description, "Open Progress for the latest details.");
});

test("the celebration notification modal renders the shared factual description beneath title and tier", () => {
  const modal = readFileSync(new URL("../src/components/task-app/achievement-celebration-modal.tsx", import.meta.url), "utf8");
  assert.match(modal, /\{celebration\.title\}[\s\S]*\{celebration\.detail\}[\s\S]*\{celebration\.description\}/);
});

test("claim failure is non-throwing and seen acknowledgment uses only the RPC", async () => {
  const failingClient = { rpc: async () => ({ data: null, error: { message: "claim unavailable" } }) } as unknown as Parameters<typeof claimAchievementNotifications>[0];
  assert.deepEqual(await claimAchievementNotifications(failingClient), { data: [], error: "claim unavailable" });

  const calls: Array<{ args: Record<string, unknown>; name: string }> = [];
  const seenClient = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ args, name });
      return { data: { result: "seen", success: true }, error: null };
    },
  } as unknown as Parameters<typeof markAchievementNotificationSeen>[0];
  const result = await markAchievementNotificationSeen(seenClient, "notification-1");
  assert.equal(result.error, null);
  assert.deepEqual(calls, [{ args: { p_notification_id: "notification-1" }, name: "adhdice_mark_achievement_notification_seen" }]);
});

test("dismissal reserves one seen RPC exactly once", async () => {
  const acknowledgedIds = new Set<string>();
  let seenCalls = 0;
  const seenClient = {
    rpc: async () => {
      seenCalls += 1;
      return { data: { result: "seen", success: true }, error: null };
    },
  } as unknown as Parameters<typeof markAchievementNotificationSeen>[0];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (reserveCelebrationAcknowledgement("notification-1", acknowledgedIds)) {
      await markAchievementNotificationSeen(seenClient, "notification-1");
    }
  }
  assert.equal(seenCalls, 1);
});

test("Home and Stats presentation stays unknown while authenticated Achievement data loads", () => {
  const emptySummary = buildAchievementProgressModel(emptyAchievementRuntimeSnapshot()).summary;
  const loading = buildAchievementSummaryPresentation(emptySummary, false);
  assert.deepEqual(loading, {
    completedCollectionsLabel: "—",
    completionLabel: "—",
    earnedTiersLabel: "—",
    isReady: false,
    latestUnlockDetail: "Checking the installed Achievement runtime.",
    latestUnlockLabel: "Loading Achievement progress…",
  });
  assert.equal(Object.values(loading).some((value) => value === "0 / 72" || value === "0%" || value === "No Achievement unlocks yet"), false);
});

test("Progress tab selection supports arrows, Home, and End", () => {
  assert.equal(getNextProgressTab("achievements", "ArrowRight"), "milestones");
  assert.equal(getNextProgressTab("milestones", "ArrowLeft"), "achievements");
  assert.equal(getNextProgressTab("milestones", "Home"), "achievements");
  assert.equal(getNextProgressTab("achievements", "End"), "milestones");
  assert.equal(getNextProgressTab("achievements", "Enter"), "achievements");
});

test("Milestones tab reuses the gallery only for earned trophies and otherwise shows its foundation states", () => {
  assert.equal(getMilestonesTabState([], true, null), "loading");
  assert.equal(getMilestonesTabState([], false, "offline"), "error");
  assert.equal(getMilestonesTabState([], false, null), "empty");
  assert.equal(getMilestonesTabState([{ status: "active" } as Milestone], false, null), "empty");
  assert.equal(getMilestonesTabState([{ status: "completed", trophy_awarded_at: "2026-07-17T12:00:00Z", trophy_revoked_at: null } as Milestone], false, null), "gallery");
});
