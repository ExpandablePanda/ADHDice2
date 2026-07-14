import {
  buildTaskRewardBankSessionFromResolutions,
  getPendingRewardDiceCount,
  getPendingTaskRewardKey,
  parsePendingTaskRewards,
  type PendingTaskReward,
  type TaskRewardBankSession,
  type TaskRewardResolution,
} from "@/lib/task-rewards";

export const PENDING_REWARD_DICE_DEVICE_ID_KEY = "adhdice:pending-reward-dice-device-id";

export type PendingRewardDiceAccountSnapshot = {
  pendingDice: number;
  revision: number;
  updatedAt: string;
};

export type PendingRewardDiceMutationRow = {
  pending_dice: number;
  result_payload: unknown;
  revision: number;
  updated_at: string;
  was_replayed: boolean;
};

export function buildPendingRewardAwardOperationId(reward: PendingTaskReward) {
  return `task-reward:${getPendingTaskRewardKey(reward)}`;
}

export function buildLegacyMigrationOperationId(deviceId: string) {
  return `pending-reward-legacy:${deviceId}`;
}

export function shouldApplyPendingRewardDiceSnapshot(
  current: PendingRewardDiceAccountSnapshot | null,
  incoming: PendingRewardDiceAccountSnapshot,
) {
  if (!current) return true;
  if (incoming.revision !== current.revision) return incoming.revision > current.revision;
  return incoming.updatedAt >= current.updatedAt;
}

export function parsePendingRewardItems(rows: Array<{ reward_payload: unknown }> | null | undefined) {
  return parsePendingTaskRewards(JSON.stringify((rows ?? []).map((row) => row.reward_payload)));
}

export function parseAuthoritativeClaimSession(payload: unknown): TaskRewardBankSession | null {
  if (!payload || typeof payload !== "object") return null;
  const resolutions = (payload as { resolutions?: unknown }).resolutions;
  if (!Array.isArray(resolutions)) return null;

  const parsed = resolutions.filter((value): value is TaskRewardResolution => {
    if (!value || typeof value !== "object") return false;
    const resolution = value as Partial<TaskRewardResolution>;
    return Array.isArray(resolution.baseRolls)
      && resolution.baseRolls.length > 0
      && resolution.baseRolls.every((roll) => Number.isInteger(roll) && roll >= 1 && roll <= 6)
      && Number.isInteger(resolution.basePoints)
      && Number.isInteger(resolution.finalPoints)
      && Number.isInteger(resolution.multiplierRoll)
      && Number.isInteger(resolution.xp)
      && Number.isInteger(resolution.awardedTokens)
      && Array.isArray(resolution.claimRefs)
      && Array.isArray(resolution.tasks)
      && (resolution.mode === "single" || resolution.mode === "batch")
      && typeof resolution.rewardDate === "string"
      && typeof resolution.streakLength === "number";
  });

  return parsed.length === resolutions.length && parsed.length > 0
    ? buildTaskRewardBankSessionFromResolutions(parsed)
    : null;
}

export function getLegacyPendingRewardBalance(rewards: PendingTaskReward[]) {
  return getPendingRewardDiceCount(rewards);
}

export function resolveLegacyPendingRewardBalance(currentServerBalance: number, reportedLegacyBalance: number) {
  return Math.max(Math.max(0, currentServerBalance), Math.max(0, reportedLegacyBalance));
}
