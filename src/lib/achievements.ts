import type { HealthAchievementAward, Task, TaskHistory as DbTaskHistory } from "@/lib/database.types";
import { shiftDateKey } from "@/lib/task-grid-layout";
import type { TaskHistoryStats } from "@/lib/task-history";
import type { HistoricalFocusSession } from "@/lib/types";

export type AchievementSetCode =
  | "momentum"
  | "focus"
  | "courage"
  | "recovery"
  | "follow_through"
  | "health";

export type AchievementFaceLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type AchievementUnlockKind = "face" | "charged_die";

export type AchievementDefinition = {
  description: string;
  encouragement: string;
  face: AchievementFaceLevel;
  id: string;
  isSecret?: boolean;
  rewardXp: number;
  setCode: AchievementSetCode;
  title: string;
};

export type AchievementSetMeta = {
  accent: string;
  chargedDieXp: number;
  description: string;
  title: string;
};

export type AchievementMetricSnapshot = {
  bestStreak: number;
  completedTaskCount: number;
  dailyCompletedCounts: Record<string, number>;
  focusDays: number;
  focusMinutes: number;
  focusSessions: number;
  hardTaskCount: number;
  healthAwardCodes: Set<HealthAchievementAward["achievement_code"]>;
  healthAwardCount: number;
  highEnergyCompletedCount: number;
  latestCompletionDate: string | null;
  longHardTaskCount: number;
  maxTasksInDay: number;
  overdueOrUrgentCompletedCount: number;
  recoveryCount: number;
  streak: number;
};

export type AchievementEvaluation = {
  achieved: boolean;
  current: number;
  definition: AchievementDefinition;
  detail: string;
  target: number;
};

export type AchievementUnlockRecord = {
  description: string;
  earnedAt: string;
  encouragement: string;
  face: AchievementFaceLevel | null;
  id: string;
  kind: AchievementUnlockKind;
  rewardXp: number;
  setCode: AchievementSetCode;
  title: string;
};

export type AchievementFaceSummary = AchievementEvaluation & {
  isSecret: boolean;
  isUnlocked: boolean;
};

export type AchievementSetSummary = {
  chargedDieXp: number;
  description: string;
  faces: AchievementFaceSummary[];
  id: AchievementSetCode;
  isCharged: boolean;
  nextFace: AchievementFaceSummary | null;
  title: string;
  unlockedCount: number;
};

export type AchievementUnlockPlan = {
  newChargedRecords: AchievementUnlockRecord[];
  newFaceRecords: AchievementUnlockRecord[];
  nextChargedSetCodes: AchievementSetCode[];
  nextUnlockedFaceIds: string[];
};

export type HealthFaceStatus = "earned" | "ready" | "in_progress";

export type HealthFaceSummary = {
  definition: AchievementDefinition;
  detail: string;
  linkedHealthCodes: string[];
  status: HealthFaceStatus;
};

export const ACHIEVEMENT_SET_ORDER: AchievementSetCode[] = [
  "momentum",
  "focus",
  "courage",
  "recovery",
  "follow_through",
  "health",
];

export const ACHIEVEMENT_SET_META: Record<AchievementSetCode, AchievementSetMeta> = {
  momentum: {
    accent: "#5b8def",
    chargedDieXp: 180,
    description: "Steady rhythm, earned honestly one day at a time.",
    title: "Momentum",
  },
  focus: {
    accent: "#1ca39a",
    chargedDieXp: 180,
    description: "Quiet sessions that stack into something strong.",
    title: "Focus",
  },
  courage: {
    accent: "#ff7a59",
    chargedDieXp: 200,
    description: "Facing the hard, overdue, or high-friction work.",
    title: "Courage",
  },
  recovery: {
    accent: "#f3b63f",
    chargedDieXp: 220,
    description: "Proof that coming back counts, especially after a miss.",
    title: "Recovery",
  },
  follow_through: {
    accent: "#a46cf4",
    chargedDieXp: 180,
    description: "Closed loops, cleaner queues, and real finishing energy.",
    title: "Follow-Through",
  },
  health: {
    accent: "#4ab072",
    chargedDieXp: 120,
    description: "Gentle self-care signals gathered into a steady picture.",
    title: "Health",
  },
};

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  {
    description: "Complete a day with at least one recorded win.",
    encouragement: "You started the engine. Tiny starts still count.",
    face: 1,
    id: "momentum-1",
    rewardXp: 15,
    setCode: "momentum",
    title: "First Spark",
  },
  {
    description: "Reach a 3-day streak.",
    encouragement: "A rhythm is starting to feel real now.",
    face: 2,
    id: "momentum-2",
    rewardXp: 25,
    setCode: "momentum",
    title: "Rhythm Rising",
  },
  {
    description: "Reach a 7-day streak.",
    encouragement: "A full week of showing up changes the feel of everything.",
    face: 3,
    id: "momentum-3",
    rewardXp: 40,
    setCode: "momentum",
    title: "Week In Motion",
  },
  {
    description: "Reach a 14-day streak.",
    encouragement: "Two weeks of continuity is serious traction.",
    face: 4,
    id: "momentum-4",
    rewardXp: 65,
    setCode: "momentum",
    title: "Two-Week Grip",
  },
  {
    description: "Build a best streak of 30 days.",
    encouragement: "This is no longer luck. It is structure.",
    face: 5,
    id: "momentum-5",
    rewardXp: 100,
    setCode: "momentum",
    title: "Long Run Glow",
  },
  {
    description: "Build a best streak of 60 days.",
    encouragement: "You built an atmosphere around follow-through.",
    face: 6,
    id: "momentum-6",
    isSecret: true,
    rewardXp: 160,
    setCode: "momentum",
    title: "Unbroken Current",
  },
  {
    description: "Finish your first focus session.",
    encouragement: "A focused start is a vote for calmer work.",
    face: 1,
    id: "focus-1",
    rewardXp: 10,
    setCode: "focus",
    title: "Dialed In",
  },
  {
    description: "Log 3 focus sessions.",
    encouragement: "The timer is becoming a familiar ally.",
    face: 2,
    id: "focus-2",
    rewardXp: 20,
    setCode: "focus",
    title: "Timer Friend",
  },
  {
    description: "Reach 120 total focus minutes.",
    encouragement: "Two calm hours is a real block of attention.",
    face: 3,
    id: "focus-3",
    rewardXp: 35,
    setCode: "focus",
    title: "Two-Hour Field",
  },
  {
    description: "Log focus on 5 different days.",
    encouragement: "This is rhythm, not a lucky burst.",
    face: 4,
    id: "focus-4",
    rewardXp: 55,
    setCode: "focus",
    title: "Focus Week",
  },
  {
    description: "Reach 600 total focus minutes.",
    encouragement: "Your attention is building a backbone.",
    face: 5,
    id: "focus-5",
    rewardXp: 85,
    setCode: "focus",
    title: "Deep Work Core",
  },
  {
    description: "Reach 1800 total focus minutes.",
    encouragement: "You can create quiet momentum on command now.",
    face: 6,
    id: "focus-6",
    isSecret: true,
    rewardXp: 140,
    setCode: "focus",
    title: "Quiet Engine",
  },
  {
    description: "Complete your first hard task.",
    encouragement: "You turned toward friction instead of away from it.",
    face: 1,
    id: "courage-1",
    rewardXp: 15,
    setCode: "courage",
    title: "Face The Hard Part",
  },
  {
    description: "Complete 5 hard tasks.",
    encouragement: "You are learning that resistance can be worked with.",
    face: 2,
    id: "courage-2",
    rewardXp: 30,
    setCode: "courage",
    title: "Friction Breaker",
  },
  {
    description: "Complete 10 overdue or urgent tasks.",
    encouragement: "You are meeting pressure with action.",
    face: 3,
    id: "courage-3",
    rewardXp: 50,
    setCode: "courage",
    title: "Deadline Diver",
  },
  {
    description: "Complete 10 high-energy tasks.",
    encouragement: "You are showing up even when the lift is real.",
    face: 4,
    id: "courage-4",
    rewardXp: 70,
    setCode: "courage",
    title: "Heavy Lift",
  },
  {
    description: "Complete 20 hard tasks.",
    encouragement: "This is courage with repetition, not a one-off.",
    face: 5,
    id: "courage-5",
    rewardXp: 105,
    setCode: "courage",
    title: "Mountain Mover",
  },
  {
    description: "Complete 10 hard tasks estimated at 60+ minutes.",
    encouragement: "You kept turning back toward the dragons.",
    face: 6,
    id: "courage-6",
    isSecret: true,
    rewardXp: 160,
    setCode: "courage",
    title: "Dragon Turned",
  },
  {
    description: "Come back strong after the first broken streak or gap.",
    encouragement: "Returning counts. It always counts.",
    face: 1,
    id: "recovery-1",
    rewardXp: 20,
    setCode: "recovery",
    title: "Return Roll",
  },
  {
    description: "Log 3 comeback days.",
    encouragement: "You do not need perfect momentum to keep building it.",
    face: 2,
    id: "recovery-2",
    rewardXp: 35,
    setCode: "recovery",
    title: "Back On The Board",
  },
  {
    description: "Log 5 comeback days.",
    encouragement: "Restarting is becoming part of your real toolkit.",
    face: 3,
    id: "recovery-3",
    rewardXp: 55,
    setCode: "recovery",
    title: "Bounce Pattern",
  },
  {
    description: "Log 8 comeback days.",
    encouragement: "You know how to restart without making it mean too much.",
    face: 4,
    id: "recovery-4",
    rewardXp: 80,
    setCode: "recovery",
    title: "Reset Without Shame",
  },
  {
    description: "Log 12 comeback days.",
    encouragement: "Resilience is starting to feel like an identity.",
    face: 5,
    id: "recovery-5",
    rewardXp: 115,
    setCode: "recovery",
    title: "Resilient Rhythm",
  },
  {
    description: "Log 20 comeback days.",
    encouragement: "Storms still arrive. You have learned to walk through them.",
    face: 6,
    id: "recovery-6",
    isSecret: true,
    rewardXp: 170,
    setCode: "recovery",
    title: "Storm Walker",
  },
  {
    description: "Complete 5 tasks total.",
    encouragement: "Closed loops are starting to stack up.",
    face: 1,
    id: "follow_through-1",
    rewardXp: 10,
    setCode: "follow_through",
    title: "Closed Loop",
  },
  {
    description: "Complete 15 tasks total.",
    encouragement: "You are becoming someone who carries things through.",
    face: 2,
    id: "follow_through-2",
    rewardXp: 20,
    setCode: "follow_through",
    title: "Staying With It",
  },
  {
    description: "Complete 4 tasks in a single day.",
    encouragement: "A strong day can change the whole week.",
    face: 3,
    id: "follow_through-3",
    rewardXp: 35,
    setCode: "follow_through",
    title: "Strong Day",
  },
  {
    description: "Complete 50 tasks total.",
    encouragement: "Your queue is learning to trust you.",
    face: 4,
    id: "follow_through-4",
    rewardXp: 60,
    setCode: "follow_through",
    title: "Queue Cleaner",
  },
  {
    description: "Complete 8 tasks in a single day.",
    encouragement: "That was not chaos. That was follow-through with force.",
    face: 5,
    id: "follow_through-5",
    rewardXp: 90,
    setCode: "follow_through",
    title: "Big Finish",
  },
  {
    description: "Complete 150 tasks total.",
    encouragement: "Your actions are changing the gravity of the backlog.",
    face: 6,
    id: "follow_through-6",
    isSecret: true,
    rewardXp: 150,
    setCode: "follow_through",
    title: "Gravity Shift",
  },
  {
    description: "Earn your first health achievement.",
    encouragement: "Care becomes easier when it is noticed early.",
    face: 1,
    id: "health-1",
    rewardXp: 0,
    setCode: "health",
    title: "Check-In Seed",
  },
  {
    description: "Earn the Seven Gentle Days health achievement.",
    encouragement: "Small care repeated softly is still strong care.",
    face: 2,
    id: "health-2",
    rewardXp: 0,
    setCode: "health",
    title: "Gentle Week",
  },
  {
    description: "Earn a nourishment or weight-tracking health achievement.",
    encouragement: "A clearer picture of your body gives your days more mercy.",
    face: 3,
    id: "health-3",
    rewardXp: 0,
    setCode: "health",
    title: "Care Notes",
  },
  {
    description: "Earn a connected signals health achievement.",
    encouragement: "The more signals you notice, the less you have to guess.",
    face: 4,
    id: "health-4",
    rewardXp: 0,
    setCode: "health",
    title: "Signal Link",
  },
  {
    description: "Earn the Care Week health achievement.",
    encouragement: "A week of balanced care is a real foundation.",
    face: 5,
    id: "health-5",
    rewardXp: 0,
    setCode: "health",
    title: "Care Week",
  },
  {
    description: "Earn the Care Month health achievement.",
    encouragement: "That kind of gentle consistency changes the atmosphere around you.",
    face: 6,
    id: "health-6",
    rewardXp: 0,
    setCode: "health",
    title: "Care Month",
  },
];

type ThresholdDefinition = Pick<AchievementDefinition, "description" | "encouragement" | "face" | "id" | "isSecret" | "rewardXp" | "setCode" | "title">;

function evaluateThreshold(
  definition: ThresholdDefinition,
  current: number,
  target: number,
  detailLabel: string,
): AchievementEvaluation {
  return {
    achieved: current >= target,
    current: Math.min(current, target),
    definition,
    detail: `${Math.min(current, target)} / ${target} ${detailLabel}`,
    target,
  };
}

function isFinishedTask(task: Task) {
  return task.status === "done" || task.status === "did_my_best";
}

function isHardTask(task: Task) {
  const isOverdueAtCompletion = Boolean(task.completed_at && task.due_on && task.due_on < task.completed_at.slice(0, 10));
  return task.is_urgent
    || task.energy === "high"
    || isOverdueAtCompletion
    || (task.estimated_minutes ?? 0) >= 60;
}

function isOverdueOrUrgentTask(task: Task) {
  const isOverdueAtCompletion = Boolean(task.completed_at && task.due_on && task.due_on < task.completed_at.slice(0, 10));
  return task.is_urgent || isOverdueAtCompletion;
}

function buildDailyCompletionCounts(taskHistory: DbTaskHistory[]) {
  return taskHistory.reduce<Record<string, number>>((accumulator, entry) => {
    if (!entry.was_completed) {
      return accumulator;
    }
    accumulator[entry.entry_date] = (accumulator[entry.entry_date] ?? 0) + 1;
    return accumulator;
  }, {});
}

function countRecoveryDays(taskHistory: DbTaskHistory[]) {
  const byDate = taskHistory.reduce<Map<string, boolean>>((accumulator, entry) => {
    accumulator.set(entry.entry_date, (accumulator.get(entry.entry_date) ?? false) || entry.was_completed);
    return accumulator;
  }, new Map());
  const sortedDates = [...byDate.keys()].sort();
  let recoveryCount = 0;
  let previousCompletedDate: string | null = null;

  for (const date of sortedDates) {
    const completed = byDate.get(date) ?? false;
    if (!completed) {
      continue;
    }

    if (previousCompletedDate && shiftDateKey(previousCompletedDate, 1) !== date) {
      recoveryCount += 1;
    }
    previousCompletedDate = date;
  }

  return recoveryCount;
}

export function buildAchievementMetricSnapshot({
  focusHistory,
  healthAwards,
  taskHistory,
  taskHistoryStats,
  tasks,
}: {
  focusHistory: HistoricalFocusSession[];
  healthAwards: HealthAchievementAward[];
  taskHistory: DbTaskHistory[];
  taskHistoryStats: TaskHistoryStats;
  tasks: Task[];
}): AchievementMetricSnapshot {
  const completedTasks = tasks.filter(isFinishedTask);
  const hardTasks = completedTasks.filter(isHardTask);
  const overdueOrUrgentTasks = completedTasks.filter(isOverdueOrUrgentTask);
  const highEnergyTasks = completedTasks.filter((task) => task.energy === "high");
  const longHardTasks = completedTasks.filter((task) => isHardTask(task) && (task.estimated_minutes ?? 0) >= 60);
  const dailyCompletedCounts = buildDailyCompletionCounts(taskHistory);
  const focusDays = new Set(focusHistory.map((entry) => entry.date)).size;
  const focusMinutes = Math.floor(focusHistory.reduce((sum, entry) => sum + entry.durationSeconds, 0) / 60);
  const latestCompletionDate = completedTasks
    .map((task) => task.completed_at?.slice(0, 10) ?? null)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1) ?? null;

  return {
    bestStreak: taskHistoryStats.bestStreak,
    completedTaskCount: taskHistory.filter((entry) => entry.was_completed).length,
    dailyCompletedCounts,
    focusDays,
    focusMinutes,
    focusSessions: focusHistory.length,
    hardTaskCount: hardTasks.length,
    healthAwardCodes: new Set(healthAwards.map((award) => award.achievement_code)),
    healthAwardCount: healthAwards.length,
    highEnergyCompletedCount: highEnergyTasks.length,
    latestCompletionDate,
    longHardTaskCount: longHardTasks.length,
    maxTasksInDay: Math.max(0, ...Object.values(dailyCompletedCounts)),
    overdueOrUrgentCompletedCount: overdueOrUrgentTasks.length,
    recoveryCount: countRecoveryDays(taskHistory),
    streak: taskHistoryStats.currentStreak,
  };
}

export function evaluateAchievements(metrics: AchievementMetricSnapshot): AchievementEvaluation[] {
  const healthCareNotesCount = Number(metrics.healthAwardCodes.has("nourishment_notes")) + Number(metrics.healthAwardCodes.has("scale_awareness"));
  const healthSignalCount = Number(metrics.healthAwardCodes.has("connected_care"))
    + Number(metrics.healthAwardCodes.has("rest_noticed"))
    + Number(metrics.healthAwardCodes.has("motion_noticed"));

  return ACHIEVEMENT_DEFINITIONS.map((definition) => {
    switch (definition.id) {
      case "momentum-1":
        return evaluateThreshold(definition, metrics.streak > 0 || metrics.bestStreak > 0 ? 1 : 0, 1, "day");
      case "momentum-2":
        return evaluateThreshold(definition, metrics.streak, 3, "days");
      case "momentum-3":
        return evaluateThreshold(definition, metrics.streak, 7, "days");
      case "momentum-4":
        return evaluateThreshold(definition, metrics.streak, 14, "days");
      case "momentum-5":
        return evaluateThreshold(definition, metrics.bestStreak, 30, "days");
      case "momentum-6":
        return evaluateThreshold(definition, metrics.bestStreak, 60, "days");
      case "focus-1":
        return evaluateThreshold(definition, metrics.focusSessions, 1, "sessions");
      case "focus-2":
        return evaluateThreshold(definition, metrics.focusSessions, 3, "sessions");
      case "focus-3":
        return evaluateThreshold(definition, metrics.focusMinutes, 120, "minutes");
      case "focus-4":
        return evaluateThreshold(definition, metrics.focusDays, 5, "days");
      case "focus-5":
        return evaluateThreshold(definition, metrics.focusMinutes, 600, "minutes");
      case "focus-6":
        return evaluateThreshold(definition, metrics.focusMinutes, 1800, "minutes");
      case "courage-1":
        return evaluateThreshold(definition, metrics.hardTaskCount, 1, "hard tasks");
      case "courage-2":
        return evaluateThreshold(definition, metrics.hardTaskCount, 5, "hard tasks");
      case "courage-3":
        return evaluateThreshold(definition, metrics.overdueOrUrgentCompletedCount, 10, "pressure tasks");
      case "courage-4":
        return evaluateThreshold(definition, metrics.highEnergyCompletedCount, 10, "high-energy tasks");
      case "courage-5":
        return evaluateThreshold(definition, metrics.hardTaskCount, 20, "hard tasks");
      case "courage-6":
        return evaluateThreshold(definition, metrics.longHardTaskCount, 10, "long hard tasks");
      case "recovery-1":
        return evaluateThreshold(definition, metrics.recoveryCount, 1, "comebacks");
      case "recovery-2":
        return evaluateThreshold(definition, metrics.recoveryCount, 3, "comebacks");
      case "recovery-3":
        return evaluateThreshold(definition, metrics.recoveryCount, 5, "comebacks");
      case "recovery-4":
        return evaluateThreshold(definition, metrics.recoveryCount, 8, "comebacks");
      case "recovery-5":
        return evaluateThreshold(definition, metrics.recoveryCount, 12, "comebacks");
      case "recovery-6":
        return evaluateThreshold(definition, metrics.recoveryCount, 20, "comebacks");
      case "follow_through-1":
        return evaluateThreshold(definition, metrics.completedTaskCount, 5, "tasks");
      case "follow_through-2":
        return evaluateThreshold(definition, metrics.completedTaskCount, 15, "tasks");
      case "follow_through-3":
        return evaluateThreshold(definition, metrics.maxTasksInDay, 4, "tasks in one day");
      case "follow_through-4":
        return evaluateThreshold(definition, metrics.completedTaskCount, 50, "tasks");
      case "follow_through-5":
        return evaluateThreshold(definition, metrics.maxTasksInDay, 8, "tasks in one day");
      case "follow_through-6":
        return evaluateThreshold(definition, metrics.completedTaskCount, 150, "tasks");
      case "health-1":
        return evaluateThreshold(definition, metrics.healthAwardCount, 1, "health wins");
      case "health-2":
        return evaluateThreshold(definition, Number(metrics.healthAwardCodes.has("seven_gentle_days")), 1, "gentle week");
      case "health-3":
        return evaluateThreshold(definition, healthCareNotesCount, 1, "care notes");
      case "health-4":
        return evaluateThreshold(definition, healthSignalCount, 1, "signal links");
      case "health-5":
        return evaluateThreshold(definition, Number(metrics.healthAwardCodes.has("care_week")), 1, "care week");
      case "health-6":
        return evaluateThreshold(definition, Number(metrics.healthAwardCodes.has("care_month")), 1, "care month");
      default:
        return evaluateThreshold(definition, 0, 1, "steps");
    }
  });
}

export function getAchievedFaceIds(evaluations: AchievementEvaluation[]) {
  return evaluations.filter((entry) => entry.achieved).map((entry) => entry.definition.id);
}

export function getChargedSetCodes(unlockedFaceIds: string[]) {
  const unlocked = new Set(unlockedFaceIds);
  return ACHIEVEMENT_SET_ORDER.filter((setCode) =>
    ACHIEVEMENT_DEFINITIONS
      .filter((definition) => definition.setCode === setCode)
      .every((definition) => unlocked.has(definition.id)),
  );
}

export function buildAchievementSetSummaries({
  chargedSetCodes,
  evaluations,
  unlockedFaceIds,
}: {
  chargedSetCodes: AchievementSetCode[];
  evaluations: AchievementEvaluation[];
  unlockedFaceIds: string[];
}): AchievementSetSummary[] {
  const unlocked = new Set(unlockedFaceIds);
  const charged = new Set(chargedSetCodes);

  return ACHIEVEMENT_SET_ORDER.map((setCode) => {
    const faces = evaluations
      .filter((entry) => entry.definition.setCode === setCode)
      .sort((left, right) => left.definition.face - right.definition.face)
      .map((entry) => ({
        ...entry,
        isSecret: entry.definition.isSecret === true,
        isUnlocked: unlocked.has(entry.definition.id),
      }));
    const unlockedCount = faces.filter((face) => face.isUnlocked).length;
    const nextFace = faces.find((face) => !face.isUnlocked) ?? null;
    return {
      chargedDieXp: ACHIEVEMENT_SET_META[setCode].chargedDieXp,
      description: ACHIEVEMENT_SET_META[setCode].description,
      faces,
      id: setCode,
      isCharged: charged.has(setCode),
      nextFace,
      title: ACHIEVEMENT_SET_META[setCode].title,
      unlockedCount,
    };
  });
}

export function buildFaceUnlockRecord(definition: AchievementDefinition, earnedAt: string): AchievementUnlockRecord {
  return {
    description: definition.description,
    earnedAt,
    encouragement: definition.encouragement,
    face: definition.face,
    id: definition.id,
    kind: "face",
    rewardXp: definition.rewardXp,
    setCode: definition.setCode,
    title: definition.title,
  };
}

export function planAchievementUnlocks({
  evaluations,
  existingChargedSetCodes,
  existingUnlockedFaceIds,
  earnedAt,
}: {
  earnedAt: string;
  evaluations: AchievementEvaluation[];
  existingChargedSetCodes: AchievementSetCode[];
  existingUnlockedFaceIds: string[];
}): AchievementUnlockPlan {
  const unlockedSet = new Set(existingUnlockedFaceIds);
  const newFaceRecords = evaluations
    .filter((entry) => entry.achieved && !unlockedSet.has(entry.definition.id))
    .map((entry) => buildFaceUnlockRecord(entry.definition, earnedAt));
  const nextUnlockedFaceIds = Array.from(new Set([
    ...existingUnlockedFaceIds,
    ...newFaceRecords.map((entry) => entry.id),
  ]));
  const nextChargedSetCodes = getChargedSetCodes(nextUnlockedFaceIds);
  const chargedSetSet = new Set(existingChargedSetCodes);
  const newChargedRecords = nextChargedSetCodes
    .filter((setCode) => !chargedSetSet.has(setCode))
    .map((setCode) => buildChargedDieUnlockRecord(setCode, earnedAt));

  return {
    newChargedRecords,
    newFaceRecords,
    nextChargedSetCodes,
    nextUnlockedFaceIds,
  };
}

export function buildHealthFaceSummaries({
  earnedCodes,
  readyCodes,
}: {
  earnedCodes: string[];
  readyCodes: string[];
}): HealthFaceSummary[] {
  const earned = new Set(earnedCodes);
  const ready = new Set(readyCodes);
  const linkedCodesByFace: Record<AchievementFaceLevel, string[]> = {
    1: ["first_check_in"],
    2: ["seven_gentle_days"],
    3: ["nourishment_notes", "scale_awareness"],
    4: ["connected_care", "rest_noticed", "motion_noticed"],
    5: ["care_week"],
    6: ["care_month"],
  };

  return ACHIEVEMENT_DEFINITIONS
    .filter((definition) => definition.setCode === "health")
    .sort((left, right) => left.face - right.face)
    .map((definition) => {
      const linkedHealthCodes = linkedCodesByFace[definition.face];
      const status: HealthFaceStatus = linkedHealthCodes.some((code) => earned.has(code))
        ? "earned"
        : linkedHealthCodes.some((code) => ready.has(code))
          ? "ready"
          : "in_progress";
      return {
        definition,
        detail: linkedHealthCodes.length === 1 ? linkedHealthCodes[0] ?? "" : `${linkedHealthCodes.length} care routes`,
        linkedHealthCodes,
        status,
      };
    });
}

export function buildChargedDieUnlockRecord(setCode: AchievementSetCode, earnedAt: string): AchievementUnlockRecord {
  return {
    description: `Complete all six faces in ${ACHIEVEMENT_SET_META[setCode].title}.`,
    earnedAt,
    encouragement: "A whole set humming at once changes the feel of the room.",
    face: null,
    id: `charged:${setCode}`,
    kind: "charged_die",
    rewardXp: ACHIEVEMENT_SET_META[setCode].chargedDieXp,
    setCode,
    title: `${ACHIEVEMENT_SET_META[setCode].title} Charged Die`,
  };
}
