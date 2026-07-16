import {
  addMilestoneCalendarDays,
  compareMilestoneCalendarDates,
  milestoneCalendarDaysBetween,
} from "@/lib/milestones/milestone-dates";
import {
  MILESTONE_QUESTIONS_VERSION,
  MILESTONE_RULES_VERSION,
  type MilestoneAnswersV1,
  type MilestoneComplexity,
  type MilestoneCurrentProgress,
  type MilestoneDifficulty,
  type MilestoneEstimatedDuration,
  type MilestoneMeaning,
  type MilestoneRecommendationV1,
  type MilestoneTargetRecommendation,
  type MilestoneTier,
  type MilestoneTierFactorScores,
  type MilestoneTierRecommendation,
  type MilestoneTimelinePredictability,
  type MilestoneWeeklyCapacity,
  type MilestoneWorkFrequency,
} from "@/lib/milestones/milestone-types";

const DIFFICULTY_SCORES: Record<MilestoneDifficulty, number> = {
  manageable: 0,
  moderately_challenging: 1,
  difficult: 3,
  very_difficult: 4,
  not_sure: 2,
};

const MEANING_SCORES: Record<MilestoneMeaning, number> = {
  meaningful_personal_progress: 1,
  significant_accomplishment: 2,
  major_life_or_project_goal: 4,
  exceptional_or_defining_achievement: 5,
  not_sure: 2,
};

const COMPLEXITY_SCORES: Record<MilestoneComplexity, number> = {
  one_clear_outcome: 0,
  several_manageable_steps: 1,
  many_connected_steps: 3,
  large_multi_stage_project: 4,
  not_sure: 2,
};

const PREDICTABILITY_SCORES: Record<MilestoneTimelinePredictability, number> = {
  very_predictable: 0,
  some_uncertainty: 1,
  highly_variable: 2,
  depends_on_others: 2,
  not_sure: 1,
};

const PROGRESS_MULTIPLIERS: Record<MilestoneCurrentProgress, number> = {
  not_started: 1,
  planning_started: 0.9,
  partly_complete: 0.65,
  more_than_half: 0.4,
  almost_finished: 0.15,
  not_sure: 1,
};

const WORK_FREQUENCY_MULTIPLIERS: Record<MilestoneWorkFrequency, number> = {
  most_days: 1,
  few_days_per_week: 1.15,
  about_once_per_week: 1.4,
  irregularly: 1.6,
  depends_on_others: 1.75,
  not_sure: 1.25,
};

const COMPLEXITY_SCHEDULING_MULTIPLIERS: Record<MilestoneComplexity, number> = {
  one_clear_outcome: 1,
  several_manageable_steps: 1.05,
  many_connected_steps: 1.15,
  large_multi_stage_project: 1.25,
  not_sure: 1.1,
};

const PREDICTABILITY_SCHEDULING_MULTIPLIERS: Record<MilestoneTimelinePredictability, number> = {
  very_predictable: 1,
  some_uncertainty: 1.1,
  highly_variable: 1.25,
  depends_on_others: 1.4,
  not_sure: 1.2,
};

const UNKNOWN_DURATION_DAYS: Record<MilestoneTier, number> = {
  bronze: 14,
  silver: 30,
  gold: 90,
  platinum: 180,
};

const FACTOR_EXPLANATIONS: Record<keyof MilestoneTierFactorScores, string> = {
  duration: "the estimated duration",
  difficulty: "the expected difficulty",
  meaning: "the goal's personal significance",
  complexity: "the number of connected stages",
  predictability: "timeline uncertainty",
};

function assertPositiveFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

function durationScore(duration: MilestoneEstimatedDuration, localDate: string) {
  if (duration.kind === "not_sure") return 1;
  if (duration.kind === "target_date") {
    const days = milestoneCalendarDaysBetween(localDate, duration.targetDate);
    if (days < 1) throw new Error("Milestone target dates must be tomorrow or later.");
    if (days <= 3) return 0;
    if (days <= 14) return 1;
    if (days <= 60) return 2;
    return 3;
  }

  assertPositiveFinite(duration.value, "Estimated duration");
  switch (duration.unit) {
    case "hours":
      if (duration.value <= 8) return 0;
      if (duration.value <= 40) return 1;
      if (duration.value <= 120) return 2;
      return 3;
    case "days":
      if (duration.value <= 3) return 0;
      if (duration.value <= 14) return 1;
      if (duration.value <= 60) return 2;
      return 3;
    case "weeks":
      if (duration.value <= 2) return 1;
      if (duration.value <= 8) return 2;
      return 3;
    case "months":
      return duration.value <= 2 ? 2 : 3;
    case "years":
      return 3;
  }
}

function tierForScore(score: number): MilestoneTier {
  if (score <= 4) return "bronze";
  if (score <= 8) return "silver";
  if (score <= 14) return "gold";
  return "platinum";
}

export function scoreMilestoneTier(
  answers: MilestoneAnswersV1,
  localDate: string,
): MilestoneTierRecommendation {
  const factorScores: MilestoneTierFactorScores = {
    duration: durationScore(answers.estimatedDuration, localDate),
    difficulty: DIFFICULTY_SCORES[answers.difficulty],
    meaning: MEANING_SCORES[answers.meaning],
    complexity: COMPLEXITY_SCORES[answers.complexity],
    predictability: PREDICTABILITY_SCORES[answers.timelinePredictability],
  };
  const totalScore = Object.values(factorScores).reduce((total, score) => total + score, 0);
  const rankedFactors = (Object.entries(factorScores) as Array<[keyof MilestoneTierFactorScores, number]>)
    .filter(([, score]) => score > 0)
    .sort((left, right) => right[1] - left[1]);
  const highestScore = rankedFactors[0]?.[1] ?? 0;
  const explanationPhrases = rankedFactors
    .filter(([, score], index) => score === highestScore || index < 2)
    .slice(0, 2)
    .map(([factor]) => FACTOR_EXPLANATIONS[factor]);
  const tier = tierForScore(totalScore);
  const explanation = explanationPhrases.length > 0
    ? `${capitalize(tier)} reflects ${joinExplanationPhrases(explanationPhrases)}.`
    : `${capitalize(tier)} reflects a contained, predictable milestone.`;

  return {
    explanation,
    explanationPhrases,
    factorScores,
    tier,
    totalScore,
    version: MILESTONE_RULES_VERSION,
  };
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function joinExplanationPhrases(phrases: string[]) {
  if (phrases.length <= 1) return phrases[0] ?? "the supplied answers";
  return `${phrases[0]} and ${phrases[1]}`;
}

function numericWeeklyCapacity(capacity: MilestoneWeeklyCapacity) {
  if (capacity.kind === "hours_per_week") {
    assertPositiveFinite(capacity.hours, "Weekly capacity");
    return capacity.hours;
  }
  return capacity.kind === "varies" ? 3 : 2;
}

function capacityMultiplier(capacity: MilestoneWeeklyCapacity) {
  if (capacity.kind === "varies") return 1.25;
  if (capacity.kind === "not_sure") return 1.3;
  assertPositiveFinite(capacity.hours, "Weekly capacity");
  if (capacity.hours >= 10) return 1;
  if (capacity.hours >= 5) return 1.1;
  if (capacity.hours >= 2) return 1.25;
  return 1.5;
}

function baseDurationDays(
  duration: MilestoneEstimatedDuration,
  weeklyCapacity: MilestoneWeeklyCapacity,
  tier: MilestoneTier,
  localDate: string,
) {
  if (duration.kind === "not_sure") return UNKNOWN_DURATION_DAYS[tier];
  if (duration.kind === "target_date") {
    const days = milestoneCalendarDaysBetween(localDate, duration.targetDate);
    if (days < 1) throw new Error("Milestone target dates must be tomorrow or later.");
    return days;
  }

  assertPositiveFinite(duration.value, "Estimated duration");
  switch (duration.unit) {
    case "hours":
      return Math.ceil((duration.value / numericWeeklyCapacity(weeklyCapacity)) * 7);
    case "days":
      return duration.value;
    case "weeks":
      return duration.value * 7;
    case "months":
      return duration.value * 30;
    case "years":
      return duration.value * 365;
  }
}

function validateExternalDeadline(answers: MilestoneAnswersV1, localDate: string) {
  if (answers.externalDeadline.kind === "none" || answers.externalDeadline.kind === "not_sure") return null;
  if (compareMilestoneCalendarDates(answers.externalDeadline.date, addMilestoneCalendarDays(localDate, 1)) < 0) {
    throw new Error("External deadlines must be tomorrow or later.");
  }
  return answers.externalDeadline.date;
}

export function calculateMilestoneTargetDate(
  answers: MilestoneAnswersV1,
  tier: MilestoneTier,
  localDate: string,
): MilestoneTargetRecommendation {
  const rawBaseDurationDays = baseDurationDays(answers.estimatedDuration, answers.weeklyCapacity, tier, localDate);
  const progressMultiplier = PROGRESS_MULTIPLIERS[answers.currentProgress];
  const capacityPaceMultiplier = answers.estimatedDuration.kind === "duration" && answers.estimatedDuration.unit === "hours"
    ? 1
    : capacityMultiplier(answers.weeklyCapacity);
  const workFrequencyMultiplier = WORK_FREQUENCY_MULTIPLIERS[answers.workFrequency];
  const paceMultiplier = Math.max(capacityPaceMultiplier, workFrequencyMultiplier);
  const complexityMultiplier = COMPLEXITY_SCHEDULING_MULTIPLIERS[answers.complexity];
  const predictabilityMultiplier = PREDICTABILITY_SCHEDULING_MULTIPLIERS[answers.timelinePredictability];
  const calculatedDurationDays = Math.max(1, Math.ceil(
    rawBaseDurationDays
    * progressMultiplier
    * paceMultiplier
    * complexityMultiplier
    * predictabilityMultiplier,
  ));
  const calculatedTargetDate = addMilestoneCalendarDays(localDate, calculatedDurationDays);
  const externalDeadline = validateExternalDeadline(answers, localDate);
  const externalDistance = externalDeadline ? milestoneCalendarDaysBetween(localDate, externalDeadline) : null;
  const feasibilityThreshold = calculatedDurationDays * 0.85;

  let recommendedTargetDate = calculatedTargetDate;
  let feasibilityWarning: string | null = null;
  if (answers.externalDeadline.kind === "firm" && externalDeadline) {
    recommendedTargetDate = externalDeadline;
    if ((externalDistance ?? 0) < feasibilityThreshold) {
      feasibilityWarning = `The firm deadline allows ${externalDistance} calendar days, below 85% of the calculated ${calculatedDurationDays}-day duration.`;
    }
  } else if (answers.externalDeadline.kind === "preferred" && externalDeadline) {
    if ((externalDistance ?? 0) >= feasibilityThreshold) {
      recommendedTargetDate = externalDeadline;
    } else {
      feasibilityWarning = `The preferred date allows ${externalDistance} calendar days, below 85% of the calculated ${calculatedDurationDays}-day duration, so a later date is recommended.`;
    }
  }

  const recommendedDurationDays = milestoneCalendarDaysBetween(localDate, recommendedTargetDate);
  const extensionDays = Math.min(90, Math.max(7, Math.ceil(recommendedDurationDays * 0.25)));

  return {
    allowedTargetDateMax: addMilestoneCalendarDays(recommendedTargetDate, extensionDays),
    allowedTargetDateMin: addMilestoneCalendarDays(localDate, 1),
    baseDurationDays: rawBaseDurationDays,
    calculatedDurationDays,
    calculatedTargetDate,
    capacityMultiplier: capacityPaceMultiplier,
    complexityMultiplier,
    deadlineKind: answers.externalDeadline.kind === "not_sure" ? "none" : answers.externalDeadline.kind,
    externalDeadline,
    feasibilityWarning,
    paceMultiplier,
    predictabilityMultiplier,
    progressMultiplier,
    recommendedDurationDays,
    recommendedTargetDate,
    version: MILESTONE_RULES_VERSION,
    workFrequencyMultiplier,
  };
}

export function buildMilestoneRecommendation(
  answers: MilestoneAnswersV1,
  localDate: string,
): MilestoneRecommendationV1 {
  const tier = scoreMilestoneTier(answers, localDate);
  const target = calculateMilestoneTargetDate(answers, tier.tier, localDate);
  return {
    answers,
    questionsVersion: MILESTONE_QUESTIONS_VERSION,
    rulesVersion: MILESTONE_RULES_VERSION,
    target,
    tier,
  };
}
