import assert from "node:assert/strict";
import test from "node:test";

import {
  ACHIEVEMENT_MVP_CATALOG,
  ACHIEVEMENT_MVP_CATALOG_VERSION,
  ACHIEVEMENT_MVP_LAUNCH_MASTERY_VERSION,
  defineBonusTrack,
  getAchievementTrack,
  getMasteryRequirementSnapshot,
  validateAchievementCatalog,
} from "../src/lib/achievements-mvp/catalog.ts";
import {
  buildAchievementGroupingSnapshot,
  getCalendarMonthGrouping,
  getMondayWeekGrouping,
} from "../src/lib/achievements-mvp/calendar.ts";
import {
  buildAchievementCollectionAwardKey,
  buildAchievementNotificationDedupeKey,
  buildTaskAchievementLogicalDedupeKey,
  buildAchievementTierAwardKey,
  planPermanentAwardReconciliation,
} from "../src/lib/achievements-mvp/identity.ts";
import {
  ACHIEVEMENT_COLLECTION_IDS,
  ACHIEVEMENT_TIER_IDS,
  ACHIEVEMENT_TRACK_IDS,
  type AchievementCatalog,
  type AchievementTrackDefinition,
  type AchievementTrackId,
} from "../src/lib/achievements-mvp/types.ts";

const expectedThresholds = {
  i_can_count_to_ten: [50, 100, 150, 200],
  fifty_two_each_year: [100, 150, 200, 250],
  twelve_each_year: [500, 600, 800, 1_000],
  count_on_me: [1_000, 2_000, 3_000, 6_000],
  first_step: [30, 60, 90, 100],
  second_step: [100, 200, 300, 500],
  third_step: [1_000, 2_000, 3_000, 5_000],
  last_step: [1, 50, 75, 150],
  broken_clock: [4, 8, 10, 12].map((hours) => hours * 3_600),
  overtime: [20, 30, 40, 50].map((hours) => hours * 3_600),
  february_challenge: [80, 120, 160, 180].map((hours) => hours * 3_600),
  locked_in: [100, 250, 500, 1_000].map((hours) => hours * 3_600),
  staring_contest: [2, 3, 4, 5].map((hours) => hours * 3_600),
  session_possible: [100, 250, 500, 1_000],
  do_something: [3, 7, 30, 90],
  dont_get_distracted: [3, 7, 30, 90],
  this_week_on_the_streak: [1, 2, 3, 4],
  keep_it_moving: [7, 14, 30, 90],
} satisfies Record<AchievementTrackId, number[]>;

test("Achievement MVP catalog has stable unique IDs and the exact launch shape", () => {
  assert.deepEqual(ACHIEVEMENT_COLLECTION_IDS, ["you_can_count_on_me", "one_step_at_a_time", "clocked_in", "were_going_streaking"]);
  assert.equal(new Set(ACHIEVEMENT_COLLECTION_IDS).size, 4);
  assert.equal(new Set(ACHIEVEMENT_TRACK_IDS).size, 18);
  assert.equal(new Set(ACHIEVEMENT_TIER_IDS).size, 4);
  assert.equal(ACHIEVEMENT_MVP_CATALOG.collections.length, 4);
  assert.equal(ACHIEVEMENT_MVP_CATALOG.tracks.length, 18);
  assert.equal(ACHIEVEMENT_MVP_CATALOG.catalogVersion, ACHIEVEMENT_MVP_CATALOG_VERSION);
  assert.deepEqual(validateAchievementCatalog(ACHIEVEMENT_MVP_CATALOG), []);
});

test("Achievement MVP thresholds exactly match the approved four tiers", () => {
  for (const trackId of ACHIEVEMENT_TRACK_IDS) {
    const track = getAchievementTrack(trackId);
    assert.ok(track);
    assert.deepEqual(ACHIEVEMENT_TIER_IDS.map((tier) => track.thresholds[tier]), expectedThresholds[trackId]);
  }
  assert.equal(getAchievementTrack("i_can_count_to_ten")?.parameters.qualifyingOccurrenceMinimum, 10);
  assert.equal(getAchievementTrack("session_possible")?.parameters.minimumActiveSeconds, 600);
  assert.equal(getAchievementTrack("last_step")?.sourceScope, "parent_step_set");
  assert.equal(getAchievementTrack("dont_get_distracted")?.parameters.minimumActiveSecondsPerDay, 1_800);
  assert.equal(getAchievementTrack("this_week_on_the_streak")?.parameters.onlyClosedWeeks, true);
});

test("launch mastery snapshots are immutable and future tracks default to bonus", () => {
  for (const collection of ACHIEVEMENT_MVP_CATALOG.collections) {
    const snapshot = getMasteryRequirementSnapshot(collection.id);
    assert.equal(snapshot.masteryVersion, ACHIEVEMENT_MVP_LAUNCH_MASTERY_VERSION);
    assert.deepEqual(snapshot.requiredTrackIds, collection.trackIds);
    assert.ok(Object.isFrozen(snapshot));
    assert.ok(Object.isFrozen(snapshot.requiredTrackIds));
    assert.throws(() => (snapshot.requiredTrackIds as AchievementTrackId[]).push("count_on_me"));
  }

  const source = ACHIEVEMENT_MVP_CATALOG.tracks[0]!;
  const bonus = defineBonusTrack({
    ...source,
    id: "future_bonus_track" as AchievementTrackId,
    introducedInCatalogVersion: "achievements-mvp-v2",
  });
  assert.equal(bonus.requiredForMastery, false);
  assert.equal(bonus.masteryVersion, null);
  const futureCatalog: AchievementCatalog = {
    ...ACHIEVEMENT_MVP_CATALOG,
    catalogVersion: "achievements-mvp-v2",
    tracks: [...ACHIEVEMENT_MVP_CATALOG.tracks, bonus],
  };
  assert.deepEqual(
    getMasteryRequirementSnapshot("you_can_count_on_me", futureCatalog).requiredTrackIds,
    getMasteryRequirementSnapshot("you_can_count_on_me").requiredTrackIds,
  );
});

test("catalog validation rejects duplicate IDs and invalid thresholds", () => {
  const duplicateCatalog: AchievementCatalog = {
    ...ACHIEVEMENT_MVP_CATALOG,
    tracks: [...ACHIEVEMENT_MVP_CATALOG.tracks, ACHIEVEMENT_MVP_CATALOG.tracks[0]!],
  };
  assert.match(validateAchievementCatalog(duplicateCatalog).join(" "), /Track IDs must be unique/);

  const invalidTrack: AchievementTrackDefinition = {
    ...ACHIEVEMENT_MVP_CATALOG.tracks[0]!,
    thresholds: { bronze: 50, silver: 50, gold: 40, platinum: 200 },
  };
  const invalidCatalog: AchievementCatalog = {
    ...ACHIEVEMENT_MVP_CATALOG,
    tracks: [invalidTrack, ...ACHIEVEMENT_MVP_CATALOG.tracks.slice(1)],
  };
  assert.match(validateAchievementCatalog(invalidCatalog).join(" "), /thresholds must increase/);
});

test("logical-day grouping honors the 06:00 boundary through DST changes", () => {
  const settings = { logicalDayStart: "06:00", timezone: "America/New_York" };
  assert.equal(buildAchievementGroupingSnapshot("2026-03-08T09:59:59Z", settings).logicalDate, "2026-03-07");
  assert.equal(buildAchievementGroupingSnapshot("2026-03-08T10:00:00Z", settings).logicalDate, "2026-03-08");
  assert.equal(buildAchievementGroupingSnapshot("2026-11-01T10:59:59Z", settings).logicalDate, "2026-10-31");
  assert.equal(buildAchievementGroupingSnapshot("2026-11-01T11:00:00Z", settings).logicalDate, "2026-11-01");
});

test("week and month groupings use Monday-Sunday and local calendar boundaries", () => {
  assert.deepEqual(getMondayWeekGrouping("2026-07-17"), {
    key: "2026-07-13",
    startDate: "2026-07-13",
    endDate: "2026-07-19",
  });
  assert.deepEqual(getMondayWeekGrouping("2026-07-19"), {
    key: "2026-07-13",
    startDate: "2026-07-13",
    endDate: "2026-07-19",
  });
  assert.deepEqual(getCalendarMonthGrouping("2024-02-29"), {
    key: "2024-02",
    startDate: "2024-02-01",
    endDate: "2024-02-29",
  });
});

test("occurrence, award, mastery, and notification identities are stable and scoped", () => {
  const occurrence = buildTaskAchievementLogicalDedupeKey({ entityKind: "parent_task", entryDate: "2026-07-17", occurrenceKey: "occurrence:2026-07-17", taskId: "task:1" });
  assert.equal(occurrence, buildTaskAchievementLogicalDedupeKey({ entityKind: "parent_task", entryDate: "2026-07-18", occurrenceKey: "occurrence:2026-07-17", taskId: "task:1" }));
  assert.notEqual(occurrence, buildTaskAchievementLogicalDedupeKey({ entityKind: "parent_task", entryDate: "2026-07-18", occurrenceKey: "occurrence:2026-07-18", taskId: "task:1" }));
  assert.notEqual(occurrence, buildTaskAchievementLogicalDedupeKey({ entityKind: "step", entryDate: "2026-07-17", occurrenceKey: "occurrence:2026-07-17", taskId: "task:1" }));

  const tierAward = buildAchievementTierAwardKey("count_on_me", "bronze");
  const masteryAward = buildAchievementCollectionAwardKey("you_can_count_on_me", ACHIEVEMENT_MVP_LAUNCH_MASTERY_VERSION);
  assert.notEqual(tierAward, buildAchievementTierAwardKey("count_on_me", "silver"));
  assert.notEqual(masteryAward, buildAchievementCollectionAwardKey("you_can_count_on_me", "achievements-launch-v2"));
  assert.equal(buildAchievementNotificationDedupeKey(tierAward), buildAchievementNotificationDedupeKey(tierAward));
  assert.notEqual(buildAchievementNotificationDedupeKey(tierAward), buildAchievementNotificationDedupeKey(masteryAward));
});

test("recalculation is monotonic and never plans award deletion", () => {
  const plan = planPermanentAwardReconciliation(["bronze", "silver"], ["bronze", "silver", "gold", "gold"]);
  assert.deepEqual(plan.awardsToInsert, ["gold"]);
  assert.deepEqual(plan.awardsToDelete, []);
  assert.ok(Object.isFrozen(plan.awardsToDelete));
});
