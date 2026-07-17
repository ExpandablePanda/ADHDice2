export const ACHIEVEMENT_TIER_IDS = ["bronze", "silver", "gold", "platinum"] as const;

export type AchievementTierId = typeof ACHIEVEMENT_TIER_IDS[number];

export const ACHIEVEMENT_COLLECTION_IDS = [
  "you_can_count_on_me",
  "one_step_at_a_time",
  "clocked_in",
  "were_going_streaking",
] as const;

export type AchievementCollectionId = typeof ACHIEVEMENT_COLLECTION_IDS[number];

export const ACHIEVEMENT_TRACK_IDS = [
  "i_can_count_to_ten",
  "fifty_two_each_year",
  "twelve_each_year",
  "count_on_me",
  "first_step",
  "second_step",
  "third_step",
  "last_step",
  "broken_clock",
  "overtime",
  "february_challenge",
  "locked_in",
  "staring_contest",
  "session_possible",
  "do_something",
  "dont_get_distracted",
  "this_week_on_the_streak",
  "keep_it_moving",
] as const;

export type AchievementTrackId = typeof ACHIEVEMENT_TRACK_IDS[number];

export type AchievementMetricKind =
  | "closed_perfect_week_count"
  | "completed_parent_step_set_count"
  | "consecutive_qualifying_day_streak"
  | "count_of_days_meeting_occurrence_minimum"
  | "cumulative_active_seconds"
  | "cumulative_occurrence_count"
  | "max_active_seconds_in_day"
  | "max_active_seconds_in_month"
  | "max_active_seconds_in_session"
  | "max_active_seconds_in_week"
  | "max_occurrences_in_day"
  | "max_occurrences_in_month"
  | "max_occurrences_in_week"
  | "qualifying_focus_session_count";

export type AchievementMetricUnit = "days" | "occurrences" | "seconds" | "sessions" | "weeks";

export type AchievementSourceScope = "focus_session" | "parent_or_step" | "parent_step_set" | "parent_task" | "step";

export type AchievementTierThresholds = Readonly<Record<AchievementTierId, number>>;

export type AchievementTrackDefinition = Readonly<{
  collectionId: AchievementCollectionId;
  id: AchievementTrackId;
  introducedInCatalogVersion: string;
  masteryVersion: string | null;
  metricKind: AchievementMetricKind;
  parameters: Readonly<Record<string, number | boolean | string>>;
  requiredForMastery: boolean;
  sourceScope: AchievementSourceScope;
  thresholds: AchievementTierThresholds;
  title: string;
  unit: AchievementMetricUnit;
}>;

export type AchievementCollectionDefinition = Readonly<{
  id: AchievementCollectionId;
  launchMasteryVersion: string;
  title: string;
  trackIds: readonly AchievementTrackId[];
}>;

export type AchievementCatalog = Readonly<{
  catalogVersion: string;
  collections: readonly AchievementCollectionDefinition[];
  launchMasteryVersion: string;
  tracks: readonly AchievementTrackDefinition[];
}>;

export type AchievementMasteryRequirementSnapshot = Readonly<{
  catalogVersion: string;
  collectionId: AchievementCollectionId;
  masteryVersion: string;
  requiredTrackIds: readonly AchievementTrackId[];
}>;

export type AchievementEntityKind = "focus_session" | "parent_step_set" | "parent_task" | "step";

export type AchievementQualifyingOutcome = "complete" | "did_my_best" | "done";

export type AchievementEvaluationOccurrence = Readonly<{
  activeDurationSeconds?: number | null;
  entityKind: AchievementEntityKind;
  firstQualifiedAt: string;
  id: string;
  isCurrentlyQualifying: boolean;
  logicalDate: string;
  monthKey: string;
  weekKey: string;
}>;

export type AchievementTrackProgress = Readonly<{
  bestStreak: number;
  bestStreakEnd: string | null;
  bestStreakStart: string | null;
  currentStreak: number;
  currentStreakEnd: string | null;
  currentStreakStart: string | null;
  currentValue: number;
  evidenceOccurrenceIds: readonly string[];
  trackId: AchievementTrackId;
}>;
