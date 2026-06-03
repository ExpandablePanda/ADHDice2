import type { Task, TaskHistory as DbTaskHistory, TaskStatus } from "@/lib/database.types";
import { computeTaskHistoryStats } from "@/lib/task-history";
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
  createdAt: string;
  diceCount: number;
  mode: TaskRewardMode;
  rewardDate: string;
  streakLength: number;
  tasks: Task[];
  tier: TaskRewardTier | null;
};

export type TaskRewardResolution = {
  awardedTokens: number;
  basePoints: number;
  baseRolls: number[];
  finalPoints: number;
  mode: TaskRewardMode;
  multiplierRoll: number;
  rewardDate: string;
  streakLength: number;
  tasks: Task[];
  tier: TaskRewardTier | null;
  xp: number;
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
  previousStatus: TaskStatus | null;
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
  return status === "done" || status === "did_my_best";
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

  const streakLength = computeTaskHistoryStats(history, rewardDate).currentStreak;
  const tier = resolveTaskRewardTier(streakLength);

  return {
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
    createdAt: new Date().toISOString(),
    diceCount: tasks.length,
    mode: "batch",
    rewardDate,
    streakLength: 0,
    tasks,
    tier: null,
  };
}

export function rollD6Dice(count: number) {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1);
}

export function buildTaskRewardResolution(pendingReward: PendingTaskReward): TaskRewardResolution {
  const baseRolls = rollD6Dice(pendingReward.diceCount);
  const basePoints = baseRolls.reduce((sum, roll) => sum + roll, 0);
  const multiplierRoll = rollD6Dice(1)[0] ?? 1;
  const finalPoints = basePoints * multiplierRoll;
  const xp = Math.ceil(finalPoints / 2);

  return {
    awardedTokens: pendingReward.tasks.length,
    basePoints,
    baseRolls,
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
