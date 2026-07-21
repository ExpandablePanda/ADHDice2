import { ACHIEVEMENT_MVP_CATALOG, getAchievementCollection, getAchievementTrack, getMasteryRequirementSnapshot } from "@/lib/achievements-mvp/catalog";
import { buildAchievementCelebrations, emptyAchievementRuntimeSnapshot, type AchievementCelebration, type AchievementRuntimeSnapshot } from "@/lib/achievement-progress";
import type { AchievementCollectionAward, AchievementNotification, AchievementTierAward } from "@/lib/database.types";

export const DEVELOPMENT_ACHIEVEMENT_TEST_FIXTURE_KINDS = ["parent_task", "steps", "focus", "streak", "collection", "legacy", "gold", "platinum"] as const;
export type DevelopmentAchievementTestFixtureKind = (typeof DEVELOPMENT_ACHIEVEMENT_TEST_FIXTURE_KINDS)[number];

export type DevelopmentAchievementTestFixture = {
  kind: DevelopmentAchievementTestFixtureKind;
  notification: AchievementNotification;
  snapshot: AchievementRuntimeSnapshot;
};

const FIXTURE_CREATED_AT = "2026-07-19T12:00:00.000Z";

function tierFixture(
  kind: Exclude<DevelopmentAchievementTestFixtureKind, "collection" | "legacy">,
  runId: string,
  trackId: "count_on_me" | "first_step" | "broken_clock" | "do_something" | "third_step" | "last_step",
  tier: "bronze" | "silver" | "gold" | "platinum",
): DevelopmentAchievementTestFixture {
  const track = getAchievementTrack(trackId)!;
  const awardId = `development-achievement-test:${runId}:${kind}:award`;
  const notificationId = `development-achievement-test:${runId}:${kind}:notification`;
  const award: AchievementTierAward = {
    award_key: `${track.id}:${tier}`,
    catalog_version: ACHIEVEMENT_MVP_CATALOG.catalogVersion,
    created_at: FIXTURE_CREATED_AT,
    earned_at: FIXTURE_CREATED_AT,
    evaluation_run_id: null,
    evaluator_version: "development-test",
    id: awardId,
    tier,
    track_id: track.id,
    triggering_occurrence_id: null,
    user_id: "development-test-user",
  };
  return {
    kind,
    notification: {
      award_kind: "tier",
      collection_award_id: null,
      created_at: FIXTURE_CREATED_AT,
      dedupe_key: notificationId,
      delivered_at: FIXTURE_CREATED_AT,
      id: notificationId,
      seen_at: null,
      status: "delivered",
      tier_award_id: awardId,
      user_id: "development-test-user",
    },
    snapshot: { ...emptyAchievementRuntimeSnapshot(), tierAwards: [award] },
  };
}

export function createDevelopmentAchievementTestFixtures(runId: string): readonly DevelopmentAchievementTestFixture[] {
  const collection = getAchievementCollection("one_step_at_a_time")!;
  const collectionAwardId = `development-achievement-test:${runId}:collection:award`;
  const collectionNotificationId = `development-achievement-test:${runId}:collection:notification`;
  const mastery = getMasteryRequirementSnapshot(collection.id);
  const collectionAward: AchievementCollectionAward = {
    award_key: collection.id,
    catalog_version: ACHIEVEMENT_MVP_CATALOG.catalogVersion,
    collection_id: collection.id,
    created_at: FIXTURE_CREATED_AT,
    earned_at: FIXTURE_CREATED_AT,
    evaluation_run_id: null,
    id: collectionAwardId,
    mastery_version: mastery.masteryVersion,
    required_track_ids_snapshot: [...mastery.requiredTrackIds],
    required_tracks_fingerprint: "development-test",
    user_id: "development-test-user",
  };
  const legacyAwardId = `development-achievement-test:${runId}:legacy:award`;
  const legacyNotificationId = `development-achievement-test:${runId}:legacy:notification`;
  const legacyAward: AchievementTierAward = {
    award_key: "legacy_unknown:bronze",
    catalog_version: "legacy",
    created_at: FIXTURE_CREATED_AT,
    earned_at: FIXTURE_CREATED_AT,
    evaluation_run_id: null,
    evaluator_version: "development-test",
    id: legacyAwardId,
    tier: "bronze",
    track_id: "legacy_unknown",
    triggering_occurrence_id: null,
    user_id: "development-test-user",
  };
  return [
    tierFixture("parent_task", runId, "count_on_me", "bronze"),
    tierFixture("steps", runId, "first_step", "bronze"),
    tierFixture("focus", runId, "broken_clock", "bronze"),
    tierFixture("streak", runId, "do_something", "silver"),
    {
      kind: "collection",
      notification: {
        award_kind: "collection",
        collection_award_id: collectionAwardId,
        created_at: FIXTURE_CREATED_AT,
        dedupe_key: collectionNotificationId,
        delivered_at: FIXTURE_CREATED_AT,
        id: collectionNotificationId,
        seen_at: null,
        status: "delivered",
        tier_award_id: null,
        user_id: "development-test-user",
      },
      snapshot: { ...emptyAchievementRuntimeSnapshot(), collectionAwards: [collectionAward] },
    },
    {
      kind: "legacy",
      notification: {
        award_kind: "tier",
        collection_award_id: null,
        created_at: FIXTURE_CREATED_AT,
        dedupe_key: legacyNotificationId,
        delivered_at: FIXTURE_CREATED_AT,
        id: legacyNotificationId,
        seen_at: null,
        status: "delivered",
        tier_award_id: legacyAwardId,
        user_id: "development-test-user",
      },
      snapshot: { ...emptyAchievementRuntimeSnapshot(), tierAwards: [legacyAward] },
    },
    tierFixture("gold", runId, "third_step", "gold"),
    tierFixture("platinum", runId, "last_step", "platinum"),
  ];
}

export function buildDevelopmentAchievementTestCelebrations(
  fixtures: readonly DevelopmentAchievementTestFixture[],
): AchievementCelebration[] {
  return fixtures.flatMap((fixture) => buildAchievementCelebrations([fixture.notification], fixture.snapshot)
    .map((celebration) => ({ ...celebration, isDevelopmentTest: true })));
}
