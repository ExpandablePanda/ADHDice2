import type { Task, TaskHistory as DbTaskHistory, TaskStatus } from "@/lib/database.types";
import { computeTaskSpecificHistoryStats } from "@/lib/task-history";
import { todayISO } from "@/lib/utils";

export type TaskRewardMode = "single" | "batch";

export type TaskRewardTier = {
  diceCount: number;
  id: "on_time" | "two_day" | "three_to_six_day" | "seven_day" | "fourteen_day" | "thirty_plus_day";
  label: string;
  maxStreak: number | null;
  minStreak: number;
};

export type PendingTaskReward = {
  claimRefs: Array<{ subtaskId: string | null; taskId: string; title: string }>;
  createdAt: string;
  diceCount: number;
  mode: TaskRewardMode;
  rewardDate: string;
  streakLength: number;
  tasks: Task[];
  tier: TaskRewardTier | null;
};

export const PENDING_TASK_REWARDS_STORAGE_KEY = "adhdice-pending-task-rewards";

export function getPendingTaskRewardKey(reward: Pick<PendingTaskReward, "claimRefs" | "rewardDate">) {
  const claimKey = reward.claimRefs
    .map((claimRef) => `${claimRef.taskId}:${claimRef.subtaskId ?? "task"}`)
    .sort()
    .join("|");
  return `${reward.rewardDate}:${claimKey}`;
}

export function mergePendingTaskRewards(current: PendingTaskReward[], incoming: PendingTaskReward[]) {
  const existingKeys = new Set(current.map(getPendingTaskRewardKey));
  const additions = incoming.filter((reward) => !existingKeys.has(getPendingTaskRewardKey(reward)));
  return additions.length > 0 ? [...current, ...additions] : current;
}

export function removePendingTaskRewardsByKey(current: PendingTaskReward[], claimedRewards: Array<Pick<PendingTaskReward, "claimRefs" | "rewardDate">>) {
  if (claimedRewards.length === 0) {
    return current;
  }

  const claimedKeys = new Set(claimedRewards.map(getPendingTaskRewardKey));
  const next = current.filter((reward) => !claimedKeys.has(getPendingTaskRewardKey(reward)));
  return next.length === current.length ? current : next;
}

export function parsePendingTaskRewards(rawValue: string | null) {
  if (!rawValue) {
    return [] as PendingTaskReward[];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [] as PendingTaskReward[];
    }

    return parsed.filter((value): value is PendingTaskReward => {
      if (!value || typeof value !== "object") return false;
      const reward = value as Partial<PendingTaskReward>;
      return Array.isArray(reward.claimRefs)
        && reward.claimRefs.length > 0
        && reward.claimRefs.every((claimRef) => (
          claimRef
          && typeof claimRef.taskId === "string"
          && (claimRef.subtaskId === null || typeof claimRef.subtaskId === "string")
          && typeof claimRef.title === "string"
        ))
        && Array.isArray(reward.tasks)
        && reward.tasks.length > 0
        && reward.tasks.every((task) => task && typeof task.id === "string")
        && typeof reward.createdAt === "string"
        && typeof reward.diceCount === "number"
        && reward.diceCount > 0
        && (reward.mode === "single" || reward.mode === "batch")
        && typeof reward.rewardDate === "string"
        && typeof reward.streakLength === "number";
    });
  } catch {
    return [] as PendingTaskReward[];
  }
}

export type TaskRewardResolution = {
  awardedTokens: number;
  basePoints: number;
  baseRolls: number[];
  finalPoints: number;
  mode: TaskRewardMode;
  multiplierRoll: number;
  rewardDate: string;
  claimRefs: Array<{ subtaskId: string | null; taskId: string; title: string }>;
  streakLength: number;
  tasks: Task[];
  tier: TaskRewardTier | null;
  xp: number;
};

export type TaskRewardBankSession = {
  baseRollBatches: number[][];
  diceCount: number;
  resolutions: TaskRewardResolution[];
  totalBasePoints: number;
  totalFinalPoints: number;
  totalTokens: number;
  totalXp: number;
};

export type TaskRewardRollRecord = {
  awarded_tokens: number;
  awarded_xp: number;
  base_points: number;
  base_rolls: number[];
  created_at: string;
  eligible_task_count: number;
  final_points: number;
  id: string;
  mode: TaskRewardMode;
  multiplier_roll: number;
  reward_date: string;
  streak_length: number;
  streak_tier_label: string | null;
  user_id: string;
};

export type TaskRewardClaim = {
  awarded_token: boolean;
  created_at: string;
  id: string;
  reward_date: string;
  reward_roll_id: string;
  task_id: string;
  user_id: string;
};

export type TaskRewardCandidate = {
  canonicalRewardEntitlementId?: string;
  claimRef?: { subtaskId: string | null; taskId: string; title: string };
  engineManaged?: boolean;
  forceRecurringFinalization?: boolean;
  previousStatus: TaskStatus | null;
  rewardEligible?: boolean;
  task: Task;
};

export const TASK_REWARD_TIERS: TaskRewardTier[] = [
  { id: "on_time", label: "On-Time", minStreak: 0, maxStreak: 1, diceCount: 1 },
  { id: "two_day", label: "2 Day Streak", minStreak: 2, maxStreak: 2, diceCount: 2 },
  { id: "three_to_six_day", label: "3-6 Day Streak", minStreak: 3, maxStreak: 6, diceCount: 3 },
  { id: "seven_day", label: "7 Day Streak", minStreak: 7, maxStreak: 13, diceCount: 4 },
  { id: "fourteen_day", label: "14 Day Streak", minStreak: 14, maxStreak: 29, diceCount: 5 },
  { id: "thirty_plus_day", label: "30+ Day Streak", minStreak: 30, maxStreak: null, diceCount: 6 },
];

export function isRewardCompletionStatus(status: TaskStatus | null | undefined) {
  return status === "done" || status === "did_my_best" || status === "complete";
}

export function isNewRewardCompletion(previousStatus: TaskStatus | null | undefined, nextStatus: TaskStatus) {
  return isRewardCompletionStatus(nextStatus) && !isRewardCompletionStatus(previousStatus);
}

export function resolveTaskRewardTier(streakLength: number) {
  return TASK_REWARD_TIERS.find((tier) =>
    streakLength >= tier.minStreak && (tier.maxStreak === null || streakLength <= tier.maxStreak),
  ) ?? TASK_REWARD_TIERS[0];
}

export function buildSingleTaskReward(tasks: Task[], history: DbTaskHistory[], rewardDate = todayISO()): PendingTaskReward | null {
  const task = tasks[0] ?? null;
  if (!task) {
    return null;
  }

  const streakLength = computeTaskSpecificHistoryStats(
    task,
    history.filter((entry) => entry.task_id === task.id),
    rewardDate,
  ).currentStreak;
  const tier = resolveTaskRewardTier(streakLength);

  return {
    claimRefs: [{ subtaskId: null, taskId: task.id, title: task.title }],
    createdAt: new Date().toISOString(),
    diceCount: tier.diceCount,
    mode: "single",
    rewardDate,
    streakLength,
    tasks: [task],
    tier,
  };
}

export function buildBatchTaskReward(tasks: Task[], rewardDate = todayISO()): PendingTaskReward | null {
  if (tasks.length === 0) {
    return null;
  }

  return {
    claimRefs: tasks.map((task) => ({ subtaskId: null, taskId: task.id, title: task.title })),
    createdAt: new Date().toISOString(),
    diceCount: tasks.length,
    mode: "batch",
    rewardDate,
    streakLength: 0,
    tasks,
    tier: null,
  };
}

export function getPendingRewardDiceCount(pendingRewards: PendingTaskReward[]) {
  return pendingRewards.reduce((sum, reward) => sum + reward.diceCount, 0);
}

export function getRecurringFinalizationTasksForRewardClaims(
  tasks: Task[],
  claimRefs: Array<{ subtaskId: string | null; taskId: string }>,
) {
  const finalizableTaskIds = new Set(
    claimRefs
      .filter((claimRef) => !claimRef.subtaskId)
      .map((claimRef) => claimRef.taskId),
  );

  if (finalizableTaskIds.size === 0) {
    return [];
  }

  return tasks.filter((task) => finalizableTaskIds.has(task.id));
}

export function rollD6Dice(count: number) {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1);
}

export function chunkDiceRolls(rolls: number[], batchSize = 6) {
  if (batchSize <= 0) {
    return [rolls];
  }

  const batches: number[][] = [];
  for (let index = 0; index < rolls.length; index += batchSize) {
    batches.push(rolls.slice(index, index + batchSize));
  }
  return batches;
}

export function buildTaskRewardResolution(
  pendingReward: PendingTaskReward,
  rollDice: (count: number) => number[] = rollD6Dice,
): TaskRewardResolution {
  const baseRolls = rollDice(pendingReward.diceCount);
  const basePoints = baseRolls.reduce((sum, roll) => sum + roll, 0);
  const multiplierRoll = rollDice(1)[0] ?? 1;
  const finalPoints = basePoints * multiplierRoll;
  const xp = Math.ceil(finalPoints / 2);

  return {
    awardedTokens: pendingReward.tasks.length,
    basePoints,
    baseRolls,
    claimRefs: pendingReward.claimRefs,
    finalPoints,
    mode: pendingReward.mode,
    multiplierRoll,
    rewardDate: pendingReward.rewardDate,
    streakLength: pendingReward.streakLength,
    tasks: pendingReward.tasks,
    tier: pendingReward.tier,
    xp,
  };
}

export function buildTaskRewardBankSession(
  pendingRewards: PendingTaskReward[],
  rollDice: (count: number) => number[] = rollD6Dice,
): TaskRewardBankSession {
  const resolutions = pendingRewards.map((pendingReward) => buildTaskRewardResolution(pendingReward, rollDice));
  return buildTaskRewardBankSessionFromResolutions(resolutions);
}

export function buildTaskRewardBankSessionFromResolutions(
  resolutions: TaskRewardResolution[],
): TaskRewardBankSession {
  const allBaseRolls = resolutions.flatMap((resolution) => resolution.baseRolls);

  return {
    baseRollBatches: chunkDiceRolls(allBaseRolls, 6),
    diceCount: allBaseRolls.length,
    resolutions,
    totalBasePoints: resolutions.reduce((sum, resolution) => sum + resolution.basePoints, 0),
    totalFinalPoints: resolutions.reduce((sum, resolution) => sum + resolution.finalPoints, 0),
    totalTokens: resolutions.reduce((sum, resolution) => sum + resolution.awardedTokens, 0),
    totalXp: resolutions.reduce((sum, resolution) => sum + resolution.xp, 0),
  };
}
