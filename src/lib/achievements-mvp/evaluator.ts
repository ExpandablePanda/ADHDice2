import { ACHIEVEMENT_MVP_CATALOG, getMasteryRequirementSnapshot } from "@/lib/achievements-mvp/catalog";
import { ACHIEVEMENT_TIER_IDS, type AchievementCollectionId, type AchievementEvaluationOccurrence, type AchievementTierId, type AchievementTrackId, type AchievementTrackProgress } from "@/lib/achievements-mvp/types";

const DAY_MS = 86_400_000;

function dayNumber(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!) / DAY_MS;
}

function shiftDate(dateKey: string, days: number) {
  return new Date((dayNumber(dateKey) + days) * DAY_MS).toISOString().slice(0, 10);
}

function groupCount(occurrences: readonly AchievementEvaluationOccurrence[], key: "logicalDate" | "monthKey" | "weekKey") {
  const counts = new Map<string, number>();
  for (const occurrence of occurrences) counts.set(occurrence[key], (counts.get(occurrence[key]) ?? 0) + 1);
  return counts;
}

function groupDuration(occurrences: readonly AchievementEvaluationOccurrence[], key: "logicalDate" | "monthKey" | "weekKey") {
  const totals = new Map<string, number>();
  for (const occurrence of occurrences) totals.set(occurrence[key], (totals.get(occurrence[key]) ?? 0) + (occurrence.activeDurationSeconds ?? 0));
  return totals;
}

function maxValue(values: Iterable<number>) {
  let maximum = 0;
  for (const value of values) maximum = Math.max(maximum, value);
  return maximum;
}

type Streak = { end: string; length: number; start: string };

function calculateStreaks(dates: Iterable<string>, asOfLogicalDate: string) {
  const sorted = [...new Set(dates)].sort();
  const runs: Streak[] = [];
  let run: Streak | null = null;
  for (const date of sorted) {
    if (!run || dayNumber(date) !== dayNumber(run.end) + 1) {
      if (run) runs.push(run);
      run = { end: date, length: 1, start: date };
    } else {
      run = { ...run, end: date, length: run.length + 1 };
    }
  }
  if (run) runs.push(run);
  const best = runs.reduce<Streak | null>((winner, candidate) => !winner || candidate.length > winner.length ? candidate : winner, null);
  const latest = runs.at(-1) ?? null;
  const current = latest && dayNumber(latest.end) >= dayNumber(asOfLogicalDate) - 1 ? latest : null;
  return { best, current };
}

function makeProgress(trackId: AchievementTrackId, currentValue: number, evidenceOccurrenceIds: readonly string[] = [], streaks?: ReturnType<typeof calculateStreaks>): AchievementTrackProgress {
  return Object.freeze({
    bestStreak: streaks?.best?.length ?? 0,
    bestStreakEnd: streaks?.best?.end ?? null,
    bestStreakStart: streaks?.best?.start ?? null,
    currentStreak: streaks?.current?.length ?? 0,
    currentStreakEnd: streaks?.current?.end ?? null,
    currentStreakStart: streaks?.current?.start ?? null,
    currentValue,
    evidenceOccurrenceIds: Object.freeze([...evidenceOccurrenceIds]),
    trackId,
  });
}

export function evaluateAchievementProgress(
  input: readonly AchievementEvaluationOccurrence[],
  asOfLogicalDate: string,
): Readonly<Record<AchievementTrackId, AchievementTrackProgress>> {
  const occurrences = input.filter((item) => item.isCurrentlyQualifying);
  const parents = occurrences.filter((item) => item.entityKind === "parent_task");
  const steps = occurrences.filter((item) => item.entityKind === "step");
  const focus = occurrences.filter((item) => item.entityKind === "focus_session");
  const stepSets = occurrences.filter((item) => item.entityKind === "parent_step_set");
  const parentDays = groupCount(parents, "logicalDate");
  const parentWeeks = groupCount(parents, "weekKey");
  const parentMonths = groupCount(parents, "monthKey");
  const stepDays = groupCount(steps, "logicalDate");
  const stepWeeks = groupCount(steps, "weekKey");
  const focusDays = groupDuration(focus, "logicalDate");
  const focusWeeks = groupDuration(focus, "weekKey");
  const focusMonths = groupDuration(focus, "monthKey");
  const doSomething = calculateStreaks(parentDays.keys(), asOfLogicalDate);
  const distracted = calculateStreaks([...focusDays].filter(([, seconds]) => seconds >= 1_800).map(([date]) => date), asOfLogicalDate);
  const moving = calculateStreaks(new Set([...parents, ...steps].map((item) => item.logicalDate)), asOfLogicalDate);
  const perfectWeeks = [...parentWeeks.keys()].filter((weekKey) => {
    if (shiftDate(weekKey, 6) >= asOfLogicalDate) return false;
    for (let day = 0; day < 7; day += 1) if (!parentDays.has(shiftDate(weekKey, day))) return false;
    return true;
  });
  const result = {
    i_can_count_to_ten: makeProgress("i_can_count_to_ten", [...parentDays.values()].filter((count) => count >= 10).length),
    fifty_two_each_year: makeProgress("fifty_two_each_year", maxValue(parentWeeks.values())),
    twelve_each_year: makeProgress("twelve_each_year", maxValue(parentMonths.values())),
    count_on_me: makeProgress("count_on_me", parents.length, parents.map((item) => item.id).sort()),
    first_step: makeProgress("first_step", maxValue(stepDays.values())),
    second_step: makeProgress("second_step", maxValue(stepWeeks.values())),
    third_step: makeProgress("third_step", steps.length, steps.map((item) => item.id).sort()),
    last_step: makeProgress("last_step", stepSets.length, stepSets.map((item) => item.id).sort()),
    broken_clock: makeProgress("broken_clock", maxValue(focusDays.values())),
    overtime: makeProgress("overtime", maxValue(focusWeeks.values())),
    february_challenge: makeProgress("february_challenge", maxValue(focusMonths.values())),
    locked_in: makeProgress("locked_in", focus.reduce((sum, item) => sum + (item.activeDurationSeconds ?? 0), 0)),
    staring_contest: makeProgress("staring_contest", maxValue(focus.map((item) => item.activeDurationSeconds ?? 0))),
    session_possible: makeProgress("session_possible", focus.filter((item) => (item.activeDurationSeconds ?? 0) >= 600).length),
    do_something: makeProgress("do_something", doSomething.best?.length ?? 0, [], doSomething),
    dont_get_distracted: makeProgress("dont_get_distracted", distracted.best?.length ?? 0, [], distracted),
    this_week_on_the_streak: makeProgress("this_week_on_the_streak", perfectWeeks.length),
    keep_it_moving: makeProgress("keep_it_moving", moving.best?.length ?? 0, [], moving),
  } satisfies Record<AchievementTrackId, AchievementTrackProgress>;
  return Object.freeze(result);
}

export function getNewTierCrossings(trackId: AchievementTrackId, currentValue: number, existingTiers: readonly AchievementTierId[]) {
  const track = ACHIEVEMENT_MVP_CATALOG.tracks.find((item) => item.id === trackId);
  if (!track) throw new Error(`Unknown Achievement track: ${trackId}`);
  const existing = new Set(existingTiers);
  return ACHIEVEMENT_TIER_IDS.filter((tier) => currentValue >= track.thresholds[tier] && !existing.has(tier));
}

export function isCollectionMastered(collectionId: AchievementCollectionId, platinumTrackIds: readonly AchievementTrackId[]) {
  const platinum = new Set(platinumTrackIds);
  return getMasteryRequirementSnapshot(collectionId).requiredTrackIds.every((trackId) => platinum.has(trackId));
}
