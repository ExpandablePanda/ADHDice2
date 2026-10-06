import {
  buildTaskRewardBankSessionFromResolutions,
  getPendingTaskRewardKey,
  parsePendingTaskRewards,
  type PendingTaskReward,
  type TaskRewardBankSession,
  type TaskRewardResolution,
} from "@/lib/task-rewards";

export type PendingRewardDiceAccountSnapshot = {
  pendingDice: number;
  revision: number;
  updatedAt: string;
};

export type PendingRewardBankSnapshot = PendingRewardDiceAccountSnapshot;

export type PendingRewardBankOpenSession = PendingRewardBankSnapshot & {
  pendingRewards: PendingTaskReward[];
};

export type PendingRewardDiceMutationRow = {
  pending_dice: number;
  result_payload: unknown;
  revision: number;
  updated_at: string;
  was_replayed: boolean;
};

export type PendingRewardDiceResetRow = {
  discarded_dice: number;
  pending_dice: number;
  revision: number;
  updated_at: string;
};

export type PendingRewardBankResetResult = {
  didReset: boolean;
  conflict: boolean;
  refreshedSession: PendingRewardBankOpenSession | null;
};

export const PENDING_REWARD_BANK_CONFLICT_MESSAGE = "Pending rewards changed before reset. Review the updated bank and try again.";

export function isPendingRewardBankConflict(error: unknown) {
  const message = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message ?? "")
    : error instanceof Error ? error.message : String(error ?? "");
  return message.toLowerCase().includes("pending rewards changed before reset");
}

export function buildPendingRewardAwardOperationId(reward: PendingTaskReward) {
  return `task-reward:${getPendingTaskRewardKey(reward)}`;
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
