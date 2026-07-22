import { ACHIEVEMENT_MVP_CATALOG, getMasteryRequirementSnapshot } from "@/lib/achievements-mvp/catalog";
import {
  ACHIEVEMENT_TIER_IDS,
  type AchievementCollectionId,
  type AchievementMetricUnit,
  type AchievementTierId,
  type AchievementTrackDefinition,
  type AchievementTrackId,
} from "@/lib/achievements-mvp/types";
import type {
  AchievementCollectionAward,
  AchievementNotification,
  AchievementProfile,
  AchievementProgress,
  AchievementTierAward,
  Milestone,
} from "@/lib/database.types";

export const TOTAL_ACHIEVEMENT_TIERS = ACHIEVEMENT_MVP_CATALOG.tracks.length * ACHIEVEMENT_TIER_IDS.length;

export type AchievementRuntimeSnapshot = {
  collectionAwards: AchievementCollectionAward[];
  profile: AchievementProfile | null;
  progress: AchievementProgress[];
  tierAwards: AchievementTierAward[];
};

export type AchievementTierView = {
  earnedAt: string | null;
  id: AchievementTierId;
  isEarned: boolean;
  threshold: number;
};

export type AchievementTrackView = {
  currentValue: number;
  description: string;
  id: AchievementTrackId;
  isComplete: boolean;
  nextThreshold: number | null;
  nextTier: AchievementTierId | null;
  progressPercent: number;
  tiers: AchievementTierView[];
  title: string;
  unit: AchievementMetricUnit;
};

export type AchievementCollectionView = {
  description: string;
  earnedTiers: number;
  id: AchievementCollectionId;
  isMastered: boolean;
  masteredAt: string | null;
  title: string;
  totalTiers: number;
  tracks: AchievementTrackView[];
};

export type AchievementRecentUnlock = {
  earnedAt: string;
  label: string;
};

export type AchievementSummary = {
  completedCollections: number;
  earnedTiers: number;
  mostRecentUnlock: AchievementRecentUnlock | null;
  overallCompletionPercent: number;
  totalTiers: number;
};

export type AchievementProgressModel = {
  collections: AchievementCollectionView[];
  summary: AchievementSummary;
};

export function countAchievementTrophiesByTier(model: AchievementProgressModel): Record<AchievementTierId, number> {
  const counts: Record<AchievementTierId, number> = { bronze: 0, gold: 0, platinum: 0, silver: 0 };
  for (const collection of model.collections) {
    for (const track of collection.tracks) {
      for (const tier of track.tiers) {
        if (tier.isEarned) counts[tier.id] += 1;
      }
    }
  }
  return counts;
}

export type AchievementSnapshotReadiness = "no_user" | "loading" | "loaded" | "error";

export type AchievementSnapshotLoadState = {
  error: string | null;
  ownerUserId: string | null;
  snapshot: AchievementRuntimeSnapshot;
  status: AchievementSnapshotReadiness;
};

export type AchievementSummaryPresentation = {
  completedCollectionsLabel: string;
  completionLabel: string;
  earnedTiersLabel: string;
  isReady: boolean;
  latestUnlockDetail: string;
  latestUnlockLabel: string;
};

export type AchievementCelebration = {
  description: string;
  detail: string;
  id: string;
  isDevelopmentTest?: boolean;
  notification: AchievementNotification;
  tier: AchievementTierId | null;
  title: string;
};

export type ProgressTab = "achievements" | "milestones" | "records";
export type MilestonesTabState = "loading" | "error" | "empty" | "gallery";

const TIER_LABELS: Record<AchievementTierId, string> = {
  bronze: "Bronze",
  gold: "Gold",
  platinum: "Platinum",
  silver: "Silver",
};

const COLLECTION_DESCRIPTIONS: Record<AchievementCollectionId, string> = {
  clocked_in: "Build meaningful Focus time across sessions, days, weeks, and months.",
  one_step_at_a_time: "Recognize steady progress through Steps and completed Step sets.",
  were_going_streaking: "Keep useful task and Focus rhythms moving across consecutive days and weeks.",
  you_can_count_on_me: "Celebrate consistent Task completions from strong days to long-term totals.",
};

const COLLECTION_TITLES: Record<AchievementCollectionId, string> = {
  clocked_in: "Clocked In",
  one_step_at_a_time: "One Step at a Time",
  were_going_streaking: "We’re Going Streaking",
  you_can_count_on_me: "You Can Count On Me",
};

const TRACK_TITLES: Record<AchievementTrackId, string> = {
  broken_clock: "Broken Clock",
  count_on_me: "Count on Me",
  do_something: "Do Something",
  dont_get_distracted: "Don’t Get Distracted",
  february_challenge: "February Challenge",
  fifty_two_each_year: "Fifty-Two Each Year",
  first_step: "First Step",
  i_can_count_to_ten: "I Can Count to Ten",
  keep_it_moving: "Keep It Moving",
  last_step: "Last Step",
  locked_in: "Locked In",
  overtime: "Overtime",
  second_step: "Second Step",
  session_possible: "Session Possible",
  staring_contest: "Staring Contest",
  third_step: "Third Step",
  this_week_on_the_streak: "This Week on the Streak",
  twelve_each_year: "Twelve Each Year",
};

const TRACK_DESCRIPTIONS: Record<AchievementTrackId, string> = {
  broken_clock: "Most active Focus time recorded in one day.",
  count_on_me: "Total qualifying parent Task completions.",
  do_something: "Consecutive days with at least one qualifying parent Task completion.",
  dont_get_distracted: "Consecutive days with at least 30 active Focus minutes.",
  february_challenge: "Most active Focus time recorded in one month.",
  fifty_two_each_year: "Most qualifying parent Task completions recorded in one week.",
  first_step: "Most qualifying Step completions recorded in one day.",
  i_can_count_to_ten: "Days with at least ten qualifying parent Task completions.",
  keep_it_moving: "Consecutive days with a qualifying Task or Step completion.",
  last_step: "Parent Tasks whose full Step set was completed.",
  locked_in: "Total active Focus time across all sessions.",
  overtime: "Most active Focus time recorded in one week.",
  second_step: "Most qualifying Step completions recorded in one week.",
  session_possible: "Focus sessions with at least ten active minutes.",
  staring_contest: "Longest active Focus session.",
  third_step: "Total qualifying Step completions.",
  this_week_on_the_streak: "Closed weeks with a qualifying parent Task completion every day.",
  twelve_each_year: "Most qualifying parent Task completions recorded in one month.",
};

export function emptyAchievementRuntimeSnapshot(): AchievementRuntimeSnapshot {
  return { collectionAwards: [], profile: null, progress: [], tierAwards: [] };
}

export function getAchievementSnapshotReadiness(
  state: AchievementSnapshotLoadState,
  currentUserId: string | null,
  hasClient: boolean,
): AchievementSnapshotReadiness {
  if (!currentUserId || !hasClient) return "no_user";
  if (state.ownerUserId !== currentUserId) return "loading";
  return state.status === "loaded" || state.status === "error" ? state.status : "loading";
}

export function isCurrentAchievementLoad(
  requestId: number,
  activeRequestId: number,
  requestedUserId: string,
  currentUserId: string | null,
): boolean {
  return requestId === activeRequestId && requestedUserId === currentUserId;
}

export function shouldClaimAchievementNotifications({
  claimedUserId,
  currentUserId,
  readiness,
  snapshotOwnerUserId,
}: {
  claimedUserId: string | null;
  currentUserId: string | null;
  readiness: AchievementSnapshotReadiness;
  snapshotOwnerUserId: string | null;
}): boolean {
  return Boolean(
    currentUserId
    && readiness === "loaded"
    && snapshotOwnerUserId === currentUserId
    && claimedUserId !== currentUserId,
  );
}

export function buildAchievementSummaryPresentation(
  summary: AchievementSummary,
  isReady: boolean,
): AchievementSummaryPresentation {
  if (!isReady) {
    return {
      completedCollectionsLabel: "—",
      completionLabel: "—",
      earnedTiersLabel: "—",
      isReady: false,
      latestUnlockDetail: "Checking the installed Achievement runtime.",
      latestUnlockLabel: "Loading Achievement progress…",
    };
  }
  return {
    completedCollectionsLabel: `${summary.completedCollections} / 4`,
    completionLabel: `${summary.overallCompletionPercent}%`,
    earnedTiersLabel: `${summary.earnedTiers} / ${summary.totalTiers}`,
    isReady: true,
    latestUnlockDetail: summary.mostRecentUnlock ? "Most recent permanent Achievement award." : "No permanent Achievement awards recorded yet.",
    latestUnlockLabel: summary.mostRecentUnlock?.label ?? "No Achievement unlocks yet",
  };
}

export function formatAchievementDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC", year: "numeric" }).format(date);
}

export function formatAchievementValue(value: number, unit: AchievementMetricUnit): string {
  const safeValue = Math.max(0, Math.round(value));
  if (unit === "seconds") {
    const hours = Math.floor(safeValue / 3_600);
    const minutes = Math.floor((safeValue % 3_600) / 60);
    if (hours === 0) return `${minutes} min`;
    if (minutes === 0) return `${hours} hr${hours === 1 ? "" : "s"}`;
    return `${hours} hr${hours === 1 ? "" : "s"} ${minutes} min`;
  }
  const singular = unit === "occurrences" ? "completion" : unit.slice(0, -1);
  const label = safeValue === 1 ? singular : unit === "occurrences" ? "completions" : unit;
  return `${safeValue.toLocaleString("en-US")} ${label}`;
}

function pluralize(value: number, singular: string, plural = `${singular}s`) {
  return value === 1 ? singular : plural;
}

function sourceLabels(track: AchievementTrackDefinition) {
  if (track.sourceScope === "step") return { plural: "Steps", singular: "Step" };
  if (track.sourceScope === "parent_or_step") return { plural: "parent Tasks or Steps", singular: "parent Task or Step" };
  return { plural: "parent Tasks", singular: "parent Task" };
}

/**
 * Builds the factual, replay-safe explanation for a permanent tier award from
 * the canonical catalog definition. This prose is presentation-only and is
 * deliberately never persisted with the award or notification.
 */
export function buildAchievementTierAwardDescription(track: AchievementTrackDefinition, tier: AchievementTierId): string {
  const threshold = track.thresholds[tier];
  const source = sourceLabels(track);
  switch (track.metricKind) {
    case "count_of_days_meeting_occurrence_minimum": {
      const minimum = Number(track.parameters.qualifyingOccurrenceMinimum ?? 1);
      return `Completed at least ${minimum} ${minimum === 1 ? source.singular : source.plural} on ${formatAchievementValue(threshold, "days")} since you started tracking Achievements.`;
    }
    case "cumulative_occurrence_count":
      return `Completed ${threshold.toLocaleString("en-US")} ${threshold === 1 ? source.singular : source.plural} since you started tracking Achievements.`;
    case "max_occurrences_in_day":
      return `Completed ${threshold.toLocaleString("en-US")} ${threshold === 1 ? source.singular : source.plural} in a single day.`;
    case "max_occurrences_in_week":
      return `Completed ${threshold.toLocaleString("en-US")} ${threshold === 1 ? source.singular : source.plural} in a single week.`;
    case "max_occurrences_in_month":
      return `Completed ${threshold.toLocaleString("en-US")} ${threshold === 1 ? source.singular : source.plural} in a single month.`;
    case "completed_parent_step_set_count":
      return `Completed the full Step set for ${threshold.toLocaleString("en-US")} ${pluralize(threshold, "parent Task")} since you started tracking Achievements.`;
    case "cumulative_active_seconds":
      return `Logged ${formatAchievementValue(threshold, "seconds")} of qualifying Focus time since you started tracking Achievements.`;
    case "max_active_seconds_in_day":
      return `Logged ${formatAchievementValue(threshold, "seconds")} of qualifying Focus time in a single day.`;
    case "max_active_seconds_in_week":
      return `Logged ${formatAchievementValue(threshold, "seconds")} of qualifying Focus time in a single week.`;
    case "max_active_seconds_in_month":
      return `Logged ${formatAchievementValue(threshold, "seconds")} of qualifying Focus time in a single month.`;
    case "max_active_seconds_in_session":
      return `Logged ${formatAchievementValue(threshold, "seconds")} in one Focus session.`;
    case "qualifying_focus_session_count": {
      const minimum = Number(track.parameters.minimumActiveSeconds ?? 0);
      return `Completed ${formatAchievementValue(threshold, "sessions")} with at least ${formatAchievementValue(minimum, "seconds")} of active Focus time since you started tracking Achievements.`;
    }
    case "consecutive_qualifying_day_streak": {
      if (track.sourceScope === "focus_session") {
        const minimum = Number(track.parameters.minimumActiveSecondsPerDay ?? 0);
        return `Logged at least ${formatAchievementValue(minimum, "seconds")} of active Focus time for ${threshold.toLocaleString("en-US")} days in a row.`;
      }
      const minimum = Number(track.parameters.minimumOccurrencesPerDay ?? 1);
      const minimumLabel = minimum === 1 ? "one" : minimum.toLocaleString("en-US");
      return `Completed at least ${minimumLabel} qualifying ${minimum === 1 ? source.singular : source.plural} for ${threshold.toLocaleString("en-US")} days in a row.`;
    }
    case "closed_perfect_week_count":
      return `Completed at least one qualifying parent Task every day for ${formatAchievementValue(threshold, "weeks")} full week${threshold === 1 ? "" : "s"}.`;
  }
}

export function buildAchievementCollectionAwardDescription(collectionId: AchievementCollectionId): string {
  const requiredTrackCount = getMasteryRequirementSnapshot(collectionId).requiredTrackIds.length;
  return `Earned the Platinum tier in all ${requiredTrackCount.toLocaleString("en-US")} required tracks in this Collection.`;
}

export function getCurrentAndNextTier(
  track: AchievementTrackDefinition,
  currentValue: number,
  earnedTiers: ReadonlySet<AchievementTierId>,
) {
  const highestEarnedThreshold = ACHIEVEMENT_TIER_IDS.reduce(
    (highest, tier) => earnedTiers.has(tier) ? Math.max(highest, track.thresholds[tier]) : highest,
    0,
  );
  const effectiveValue = Math.max(0, currentValue, highestEarnedThreshold);
  const nextTier = ACHIEVEMENT_TIER_IDS.find((tier) => !earnedTiers.has(tier)) ?? null;
  if (!nextTier) return { currentValue: effectiveValue, nextThreshold: null, nextTier: null, progressPercent: 100 };
  const nextThreshold = track.thresholds[nextTier];
  return {
    currentValue: effectiveValue,
    nextThreshold,
    nextTier,
    progressPercent: Math.min(100, Math.round((effectiveValue / nextThreshold) * 100)),
  };
}

function selectMostRecentUnlock(
  tierAwards: readonly AchievementTierAward[],
  collectionAwards: readonly AchievementCollectionAward[],
): AchievementRecentUnlock | null {
  const tierUnlocks = tierAwards.flatMap((award) => {
    const track = ACHIEVEMENT_MVP_CATALOG.tracks.find((candidate) => candidate.id === award.track_id);
    return track ? [{ earnedAt: award.earned_at, label: `${TRACK_TITLES[track.id]} · ${TIER_LABELS[award.tier]}` }] : [];
  });
  const collectionUnlocks = collectionAwards.flatMap((award) => {
    const collection = ACHIEVEMENT_MVP_CATALOG.collections.find((candidate) => candidate.id === award.collection_id);
    return collection ? [{ earnedAt: award.earned_at, label: `${COLLECTION_TITLES[collection.id]} · Collection mastered` }] : [];
  });
  return [...tierUnlocks, ...collectionUnlocks]
    .sort((a, b) => b.earnedAt.localeCompare(a.earnedAt) || a.label.localeCompare(b.label))[0] ?? null;
}

export function buildAchievementProgressModel(snapshot: AchievementRuntimeSnapshot): AchievementProgressModel {
  const progressByTrack = new Map(snapshot.progress.map((row) => [row.track_id, row]));
  const awardsByTrack = new Map<AchievementTrackId, AchievementTierAward[]>();
  for (const award of snapshot.tierAwards) {
    if (!ACHIEVEMENT_MVP_CATALOG.tracks.some((track) => track.id === award.track_id)) continue;
    const trackId = award.track_id as AchievementTrackId;
    awardsByTrack.set(trackId, [...(awardsByTrack.get(trackId) ?? []), award]);
  }
  const collectionAwardsById = new Map(snapshot.collectionAwards.map((award) => [award.collection_id, award]));
  const collections = ACHIEVEMENT_MVP_CATALOG.collections.map((collection): AchievementCollectionView => {
    const tracks = ACHIEVEMENT_MVP_CATALOG.tracks.filter((track) => track.collectionId === collection.id).map((track): AchievementTrackView => {
      const awards = awardsByTrack.get(track.id) ?? [];
      const awardByTier = new Map(awards.map((award) => [award.tier, award]));
      const earnedTiers = new Set(awardByTier.keys());
      const progress = getCurrentAndNextTier(track, progressByTrack.get(track.id)?.current_value ?? 0, earnedTiers);
      return {
        ...progress,
        description: TRACK_DESCRIPTIONS[track.id],
        id: track.id,
        isComplete: progress.nextTier === null,
        tiers: ACHIEVEMENT_TIER_IDS.map((tier) => ({
          earnedAt: awardByTier.get(tier)?.earned_at ?? null,
          id: tier,
          isEarned: awardByTier.has(tier),
          threshold: track.thresholds[tier],
        })),
        title: TRACK_TITLES[track.id],
        unit: track.unit,
      };
    });
    const mastery = collectionAwardsById.get(collection.id);
    return {
      description: COLLECTION_DESCRIPTIONS[collection.id],
      earnedTiers: tracks.reduce((sum, track) => sum + track.tiers.filter((tier) => tier.isEarned).length, 0),
      id: collection.id,
      isMastered: Boolean(mastery),
      masteredAt: mastery?.earned_at ?? null,
      title: COLLECTION_TITLES[collection.id],
      totalTiers: tracks.length * ACHIEVEMENT_TIER_IDS.length,
      tracks,
    };
  });
  const earnedTiers = collections.reduce((sum, collection) => sum + collection.earnedTiers, 0);
  const completedCollections = collections.filter((collection) => collection.isMastered).length;
  return {
    collections,
    summary: {
      completedCollections,
      earnedTiers,
      mostRecentUnlock: selectMostRecentUnlock(snapshot.tierAwards, snapshot.collectionAwards),
      overallCompletionPercent: Math.round((earnedTiers / TOTAL_ACHIEVEMENT_TIERS) * 100),
      totalTiers: TOTAL_ACHIEVEMENT_TIERS,
    },
  };
}

export function buildAchievementCelebrations(
  notifications: readonly AchievementNotification[],
  snapshot: AchievementRuntimeSnapshot,
): AchievementCelebration[] {
  const tierAwards = new Map(snapshot.tierAwards.map((award) => [award.id, award]));
  const collectionAwards = new Map(snapshot.collectionAwards.map((award) => [award.id, award]));
  const seen = new Set<string>();
  return [...notifications]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .flatMap((notification) => {
      if (seen.has(notification.id)) return [];
      seen.add(notification.id);
      if (notification.award_kind === "tier" && notification.tier_award_id) {
        const award = tierAwards.get(notification.tier_award_id);
        const track = award ? ACHIEVEMENT_MVP_CATALOG.tracks.find((candidate) => candidate.id === award.track_id) : null;
        if (award && track) return [{ description: buildAchievementTierAwardDescription(track, award.tier), detail: `${TIER_LABELS[award.tier]} tier earned`, id: notification.id, notification, tier: award.tier, title: TRACK_TITLES[track.id] }];
        return [{ description: "Open Progress for the latest details.", detail: "A permanent Achievement tier was earned.", id: notification.id, notification, tier: null, title: "Achievement unlocked" }];
      }
      if (notification.award_kind === "collection" && notification.collection_award_id) {
        const award = collectionAwards.get(notification.collection_award_id);
        const collection = award ? ACHIEVEMENT_MVP_CATALOG.collections.find((candidate) => candidate.id === award.collection_id) : null;
        if (award && collection) return [{ description: buildAchievementCollectionAwardDescription(collection.id), detail: "Collection mastery earned", id: notification.id, notification, tier: "platinum", title: COLLECTION_TITLES[collection.id] }];
        return [{ description: "Open Progress for the latest details.", detail: "A permanent Achievement Collection was mastered.", id: notification.id, notification, tier: null, title: "Collection mastered" }];
      }
      return [{ description: "Open Progress for the latest details.", detail: "A permanent Achievement award was recorded.", id: notification.id, notification, tier: null, title: "Achievement unlocked" }];
    });
}

export function reserveCelebrationAcknowledgement(notificationId: string, acknowledgedIds: Set<string>): boolean {
  if (acknowledgedIds.has(notificationId)) return false;
  acknowledgedIds.add(notificationId);
  return true;
}

export function mergeCelebrationQueue(
  current: readonly AchievementCelebration[],
  incoming: readonly AchievementCelebration[],
  suppressedIds: ReadonlySet<string>,
): AchievementCelebration[] {
  const known = new Set([...suppressedIds, ...current.map((item) => item.id)]);
  return [...current, ...incoming.filter((item) => !known.has(item.id) && (known.add(item.id), true))];
}

export function getNextProgressTab(current: ProgressTab, key: string): ProgressTab {
  if (key === "Home") return "achievements";
  if (key === "End") return "records";
  if (key === "ArrowRight") return current === "achievements" ? "milestones" : current === "milestones" ? "records" : "achievements";
  if (key === "ArrowLeft") return current === "achievements" ? "records" : current === "records" ? "milestones" : "achievements";
  return current;
}

export function getMilestonesTabState(milestones: readonly Milestone[], loading: boolean, error: string | null): MilestonesTabState {
  if (loading) return "loading";
  if (error) return "error";
  const hasEarnedTrophy = milestones.some((milestone) => milestone.status === "completed" && Boolean(milestone.trophy_awarded_at) && !milestone.trophy_revoked_at);
  return hasEarnedTrophy ? "gallery" : "empty";
}

export function formatTierLabel(tier: AchievementTierId): string {
  return TIER_LABELS[tier];
}
