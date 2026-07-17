import {
  ACHIEVEMENT_COLLECTION_IDS,
  ACHIEVEMENT_TIER_IDS,
  ACHIEVEMENT_TRACK_IDS,
  type AchievementCatalog,
  type AchievementCollectionDefinition,
  type AchievementCollectionId,
  type AchievementMasteryRequirementSnapshot,
  type AchievementMetricKind,
  type AchievementMetricUnit,
  type AchievementSourceScope,
  type AchievementTierThresholds,
  type AchievementTrackDefinition,
  type AchievementTrackId,
} from "@/lib/achievements-mvp/types";

export const ACHIEVEMENT_MVP_CATALOG_VERSION = "achievements-mvp-v1";
export const ACHIEVEMENT_MVP_LAUNCH_MASTERY_VERSION = "achievements-launch-v1";

const hours = (value: number) => value * 60 * 60;

function thresholds(bronze: number, silver: number, gold: number, platinum: number): AchievementTierThresholds {
  return Object.freeze({ bronze, gold, platinum, silver });
}

function launchTrack(input: {
  collectionId: AchievementCollectionId;
  id: AchievementTrackId;
  metricKind: AchievementMetricKind;
  parameters?: Record<string, number | boolean | string>;
  sourceScope: AchievementSourceScope;
  thresholds: AchievementTierThresholds;
  title: string;
  unit: AchievementMetricUnit;
}): AchievementTrackDefinition {
  return Object.freeze({
    ...input,
    introducedInCatalogVersion: ACHIEVEMENT_MVP_CATALOG_VERSION,
    masteryVersion: ACHIEVEMENT_MVP_LAUNCH_MASTERY_VERSION,
    parameters: Object.freeze({ ...(input.parameters ?? {}) }),
    requiredForMastery: true,
  });
}

export function defineBonusTrack(input: Omit<AchievementTrackDefinition, "masteryVersion" | "requiredForMastery">): AchievementTrackDefinition {
  return Object.freeze({
    ...input,
    masteryVersion: null,
    parameters: Object.freeze({ ...input.parameters }),
    requiredForMastery: false,
    thresholds: Object.freeze({ ...input.thresholds }),
  });
}

const tracks: readonly AchievementTrackDefinition[] = Object.freeze([
  launchTrack({ collectionId: "you_can_count_on_me", id: "i_can_count_to_ten", metricKind: "count_of_days_meeting_occurrence_minimum", parameters: { qualifyingOccurrenceMinimum: 10 }, sourceScope: "parent_task", thresholds: thresholds(50, 100, 150, 200), title: "I Can Count to Ten", unit: "days" }),
  launchTrack({ collectionId: "you_can_count_on_me", id: "fifty_two_each_year", metricKind: "max_occurrences_in_week", sourceScope: "parent_task", thresholds: thresholds(100, 150, 200, 250), title: "Fifty-Two Each Year", unit: "occurrences" }),
  launchTrack({ collectionId: "you_can_count_on_me", id: "twelve_each_year", metricKind: "max_occurrences_in_month", sourceScope: "parent_task", thresholds: thresholds(500, 600, 800, 1_000), title: "Twelve Each Year", unit: "occurrences" }),
  launchTrack({ collectionId: "you_can_count_on_me", id: "count_on_me", metricKind: "cumulative_occurrence_count", sourceScope: "parent_task", thresholds: thresholds(1_000, 2_000, 3_000, 6_000), title: "Count On Me", unit: "occurrences" }),

  launchTrack({ collectionId: "one_step_at_a_time", id: "first_step", metricKind: "max_occurrences_in_day", sourceScope: "step", thresholds: thresholds(30, 60, 90, 100), title: "First Step", unit: "occurrences" }),
  launchTrack({ collectionId: "one_step_at_a_time", id: "second_step", metricKind: "max_occurrences_in_week", sourceScope: "step", thresholds: thresholds(100, 200, 300, 500), title: "Second Step", unit: "occurrences" }),
  launchTrack({ collectionId: "one_step_at_a_time", id: "third_step", metricKind: "cumulative_occurrence_count", sourceScope: "step", thresholds: thresholds(1_000, 2_000, 3_000, 5_000), title: "Third Step", unit: "occurrences" }),
  launchTrack({ collectionId: "one_step_at_a_time", id: "last_step", metricKind: "completed_parent_step_set_count", sourceScope: "parent_step_set", thresholds: thresholds(1, 50, 75, 150), title: "Last Step", unit: "occurrences" }),

  launchTrack({ collectionId: "clocked_in", id: "broken_clock", metricKind: "max_active_seconds_in_day", sourceScope: "focus_session", thresholds: thresholds(hours(4), hours(8), hours(10), hours(12)), title: "Broken Clock", unit: "seconds" }),
  launchTrack({ collectionId: "clocked_in", id: "overtime", metricKind: "max_active_seconds_in_week", sourceScope: "focus_session", thresholds: thresholds(hours(20), hours(30), hours(40), hours(50)), title: "Overtime", unit: "seconds" }),
  launchTrack({ collectionId: "clocked_in", id: "february_challenge", metricKind: "max_active_seconds_in_month", sourceScope: "focus_session", thresholds: thresholds(hours(80), hours(120), hours(160), hours(180)), title: "February Challenge", unit: "seconds" }),
  launchTrack({ collectionId: "clocked_in", id: "locked_in", metricKind: "cumulative_active_seconds", sourceScope: "focus_session", thresholds: thresholds(hours(100), hours(250), hours(500), hours(1_000)), title: "Locked In", unit: "seconds" }),
  launchTrack({ collectionId: "clocked_in", id: "staring_contest", metricKind: "max_active_seconds_in_session", sourceScope: "focus_session", thresholds: thresholds(hours(2), hours(3), hours(4), hours(5)), title: "Staring Contest", unit: "seconds" }),
  launchTrack({ collectionId: "clocked_in", id: "session_possible", metricKind: "qualifying_focus_session_count", parameters: { minimumActiveSeconds: 10 * 60 }, sourceScope: "focus_session", thresholds: thresholds(100, 250, 500, 1_000), title: "Session Possible", unit: "sessions" }),

  launchTrack({ collectionId: "were_going_streaking", id: "do_something", metricKind: "consecutive_qualifying_day_streak", parameters: { minimumOccurrencesPerDay: 1 }, sourceScope: "parent_task", thresholds: thresholds(3, 7, 30, 90), title: "Do Something", unit: "days" }),
  launchTrack({ collectionId: "were_going_streaking", id: "dont_get_distracted", metricKind: "consecutive_qualifying_day_streak", parameters: { minimumActiveSecondsPerDay: 30 * 60 }, sourceScope: "focus_session", thresholds: thresholds(3, 7, 30, 90), title: "Don't Get Distracted", unit: "days" }),
  launchTrack({ collectionId: "were_going_streaking", id: "this_week_on_the_streak", metricKind: "closed_perfect_week_count", parameters: { minimumOccurrencesPerDay: 1, onlyClosedWeeks: true, requireEveryDay: true }, sourceScope: "parent_task", thresholds: thresholds(1, 2, 3, 4), title: "This Week on The Streak...", unit: "weeks" }),
  launchTrack({ collectionId: "were_going_streaking", id: "keep_it_moving", metricKind: "consecutive_qualifying_day_streak", parameters: { minimumOccurrencesPerDay: 1 }, sourceScope: "parent_or_step", thresholds: thresholds(7, 14, 30, 90), title: "Keep It Moving!", unit: "days" }),
]);

const collections: readonly AchievementCollectionDefinition[] = Object.freeze([
  Object.freeze({ id: "you_can_count_on_me", launchMasteryVersion: ACHIEVEMENT_MVP_LAUNCH_MASTERY_VERSION, title: "You Can Count On Me", trackIds: Object.freeze(["i_can_count_to_ten", "fifty_two_each_year", "twelve_each_year", "count_on_me"]) }),
  Object.freeze({ id: "one_step_at_a_time", launchMasteryVersion: ACHIEVEMENT_MVP_LAUNCH_MASTERY_VERSION, title: "One Step At a Time", trackIds: Object.freeze(["first_step", "second_step", "third_step", "last_step"]) }),
  Object.freeze({ id: "clocked_in", launchMasteryVersion: ACHIEVEMENT_MVP_LAUNCH_MASTERY_VERSION, title: "Clocked In", trackIds: Object.freeze(["broken_clock", "overtime", "february_challenge", "locked_in", "staring_contest", "session_possible"]) }),
  Object.freeze({ id: "were_going_streaking", launchMasteryVersion: ACHIEVEMENT_MVP_LAUNCH_MASTERY_VERSION, title: "We're Going Streaking!", trackIds: Object.freeze(["do_something", "dont_get_distracted", "this_week_on_the_streak", "keep_it_moving"]) }),
]);

export const ACHIEVEMENT_MVP_CATALOG: AchievementCatalog = Object.freeze({
  catalogVersion: ACHIEVEMENT_MVP_CATALOG_VERSION,
  collections,
  launchMasteryVersion: ACHIEVEMENT_MVP_LAUNCH_MASTERY_VERSION,
  tracks,
});

export function getAchievementCollection(collectionId: AchievementCollectionId, catalog: AchievementCatalog = ACHIEVEMENT_MVP_CATALOG) {
  return catalog.collections.find((collection) => collection.id === collectionId) ?? null;
}

export function getAchievementTrack(trackId: AchievementTrackId, catalog: AchievementCatalog = ACHIEVEMENT_MVP_CATALOG) {
  return catalog.tracks.find((track) => track.id === trackId) ?? null;
}

export function getAchievementTracksForCollection(collectionId: AchievementCollectionId, catalog: AchievementCatalog = ACHIEVEMENT_MVP_CATALOG) {
  return catalog.tracks.filter((track) => track.collectionId === collectionId);
}

export function getMasteryRequirementSnapshot(
  collectionId: AchievementCollectionId,
  catalog: AchievementCatalog = ACHIEVEMENT_MVP_CATALOG,
): AchievementMasteryRequirementSnapshot {
  const collection = getAchievementCollection(collectionId, catalog);
  if (!collection) throw new Error(`Unknown Achievement Collection: ${collectionId}`);
  const requiredTrackIds = catalog.tracks
    .filter((track) => track.collectionId === collectionId
      && track.requiredForMastery
      && track.masteryVersion === collection.launchMasteryVersion)
    .map((track) => track.id);
  return Object.freeze({
    catalogVersion: catalog.catalogVersion,
    collectionId,
    masteryVersion: collection.launchMasteryVersion,
    requiredTrackIds: Object.freeze(requiredTrackIds),
  });
}

export function validateAchievementCatalog(catalog: AchievementCatalog): string[] {
  const errors: string[] = [];
  const collectionIds = catalog.collections.map((collection) => collection.id);
  const trackIds = catalog.tracks.map((track) => track.id);
  if (new Set(collectionIds).size !== collectionIds.length) errors.push("Collection IDs must be unique.");
  if (new Set(trackIds).size !== trackIds.length) errors.push("Track IDs must be unique.");
  if (new Set(ACHIEVEMENT_COLLECTION_IDS).size !== ACHIEVEMENT_COLLECTION_IDS.length) errors.push("System Collection IDs must be unique.");
  if (new Set(ACHIEVEMENT_TRACK_IDS).size !== ACHIEVEMENT_TRACK_IDS.length) errors.push("System track IDs must be unique.");

  for (const collection of catalog.collections) {
    if (new Set(collection.trackIds).size !== collection.trackIds.length) errors.push(`Collection ${collection.id} repeats a track ID.`);
    for (const trackId of collection.trackIds) {
      const track = catalog.tracks.find((candidate) => candidate.id === trackId);
      if (!track) errors.push(`Collection ${collection.id} references unknown track ${trackId}.`);
      else if (track.collectionId !== collection.id) errors.push(`Track ${trackId} belongs to the wrong Collection.`);
    }
  }

  for (const track of catalog.tracks) {
    const values = ACHIEVEMENT_TIER_IDS.map((tier) => track.thresholds[tier]);
    if (values.some((value) => !Number.isSafeInteger(value) || value <= 0)) errors.push(`Track ${track.id} has an invalid threshold.`);
    if (values.some((value, index) => index > 0 && value <= values[index - 1]!)) errors.push(`Track ${track.id} thresholds must increase by tier.`);
    if (track.requiredForMastery && !track.masteryVersion) errors.push(`Required track ${track.id} must name its mastery version.`);
    if (!track.requiredForMastery && track.masteryVersion !== null) errors.push(`Bonus track ${track.id} cannot enter a mastery version.`);
  }
  return errors;
}

export function assertValidAchievementCatalog(catalog: AchievementCatalog = ACHIEVEMENT_MVP_CATALOG) {
  const errors = validateAchievementCatalog(catalog);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return catalog;
}

assertValidAchievementCatalog();
