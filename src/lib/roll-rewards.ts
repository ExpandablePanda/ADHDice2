import type {
  RollDailyBoardAssignment,
  RollRewardPoolPrize,
} from "@/lib/database.types";

export type RollPrizeTier = "small" | "big" | "master";
export type RollSpecialCell = 1 | 18 | 19 | 20;
export type ChoosePrizeScope = "small" | "big" | "any";

export type MasterRewardAction =
  | { type: "bank_rolls"; amount: number }
  | { type: "conditional_bank_rolls"; amount: number; threshold: number }
  | { type: "choose_pool_prize"; scope: "small" | "big" }
  | { type: "grant_tokens"; amount: number }
  | { type: "conditional_tokens"; amount: number; threshold: number };

export type SystemMasterPrizeDefinition = {
  action: MasterRewardAction;
  description: string;
  id: string;
  name: string;
  sortOrder: number;
};

export type BoardPrizeReward =
  | {
      name: string;
      prizeId: string;
      prizeTier: "small" | "big";
      type: "pool_prize";
    }
  | {
      masterPrize: SystemMasterPrizeDefinition;
      prizeId: string;
      type: "master_reward";
    };

export type ResolvedBoardCell =
  | {
      cellNumber: 1;
      kind: "none";
      label: string;
    }
  | {
      cellNumber: 18 | 19 | 20;
      kind: "special";
      label: string;
      special: "swap" | "double" | "choose_any";
    }
  | {
      cellNumber: number;
      kind: "prize";
      label: string;
      reward: BoardPrizeReward | null;
      tier: RollPrizeTier;
    };

export type ChooseCandidate = {
  id: string;
  key: string;
  name: string;
  source: "board" | "pool";
  tier: RollPrizeTier;
};

const MASTER_CELLS = [2, 3, 4] as const;
const SMALL_CELLS = [5, 6, 7, 8, 9, 10, 11] as const;
const BIG_CELLS = [12, 13, 14, 15, 16, 17] as const;

export const SPECIAL_CELL_LABELS: Record<RollSpecialCell, string> = {
  1: "No Prize",
  18: "Swap Prize",
  19: "Double Next Prize",
  20: "Choose Any Prize",
};

export const SYSTEM_MASTER_PRIZES: SystemMasterPrizeDefinition[] = [
  {
    action: { type: "bank_rolls", amount: 1 },
    description: "Adds one free roll to your bank. Banked rolls are used before points.",
    id: "master-bank-1",
    name: "Bank a free roll",
    sortOrder: 0,
  },
  {
    action: { type: "bank_rolls", amount: 2 },
    description: "Adds two free rolls to your bank.",
    id: "master-bank-2",
    name: "Bank 2 free rolls",
    sortOrder: 1,
  },
  {
    action: { type: "bank_rolls", amount: 3 },
    description: "Adds three free rolls to your bank.",
    id: "master-bank-3",
    name: "Bank 3 free rolls",
    sortOrder: 2,
  },
  {
    action: { type: "conditional_bank_rolls", amount: 5, threshold: 17 },
    description: "Free check roll. If the next roll is over 17, bank 5 free rolls.",
    id: "master-check-bank-5",
    name: "If Next Roll is Over 17 - Bank 5 Rolls",
    sortOrder: 3,
  },
  {
    action: { type: "choose_pool_prize", scope: "small" },
    description: "Open the Small prize pool and choose any prize you want.",
    id: "master-choose-small",
    name: "Choose Any Small Prize",
    sortOrder: 4,
  },
  {
    action: { type: "grant_tokens", amount: 1 },
    description: "Adds 1 token to your economy.",
    id: "master-token-1",
    name: "1 Token",
    sortOrder: 5,
  },
  {
    action: { type: "grant_tokens", amount: 2 },
    description: "Adds 2 tokens to your economy.",
    id: "master-token-2",
    name: "2 Tokens",
    sortOrder: 6,
  },
  {
    action: { type: "grant_tokens", amount: 3 },
    description: "Adds 3 tokens to your economy.",
    id: "master-token-3",
    name: "3 Tokens",
    sortOrder: 7,
  },
  {
    action: { type: "grant_tokens", amount: 4 },
    description: "Adds 4 tokens to your economy.",
    id: "master-token-4",
    name: "4 Tokens",
    sortOrder: 8,
  },
  {
    action: { type: "grant_tokens", amount: 5 },
    description: "Adds 5 tokens to your economy.",
    id: "master-token-5",
    name: "5 Tokens",
    sortOrder: 9,
  },
  {
    action: { type: "choose_pool_prize", scope: "big" },
    description: "Open the Big prize pool and choose any prize you want.",
    id: "master-choose-big",
    name: "Choose Any Big Prize",
    sortOrder: 10,
  },
  {
    action: { type: "conditional_tokens", amount: 10, threshold: 17 },
    description: "Free check roll. If the next roll is over 17, gain 10 tokens.",
    id: "master-check-token-10",
    name: "If Next Roll is Over 17 - 10 Tokens",
    sortOrder: 11,
  },
] as const;

const SYSTEM_MASTER_PRIZE_BY_ID = new Map(SYSTEM_MASTER_PRIZES.map((prize) => [prize.id, prize]));

function shuffleWithRandomInt<T>(items: T[], randomInt: (max: number) => number) {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1) - 1;
    const current = next[index];
    next[index] = next[swapIndex] as T;
    next[swapIndex] = current as T;
  }

  return next;
}

function createAssignmentsForTier(
  cellNumbers: readonly number[],
  prizeTier: RollPrizeTier,
  prizeIds: string[],
) {
  if (!prizeIds.length) {
    return [] as RollDailyBoardAssignment[];
  }

  return cellNumbers.map((cellNumber, index) => ({
    cell_number: cellNumber,
    prize_id: prizeIds[index % prizeIds.length] ?? prizeIds[0] ?? "",
    prize_tier: prizeTier,
  }));
}

export function getPrizeKey(tier: RollPrizeTier, prizeId: string) {
  return `${tier}:${prizeId}`;
}

export function getTierForPrizeCell(cellNumber: number): RollPrizeTier | null {
  if (MASTER_CELLS.includes(cellNumber as (typeof MASTER_CELLS)[number])) {
    return "master";
  }

  if (SMALL_CELLS.includes(cellNumber as (typeof SMALL_CELLS)[number])) {
    return "small";
  }

  if (BIG_CELLS.includes(cellNumber as (typeof BIG_CELLS)[number])) {
    return "big";
  }

  return null;
}

export function parseStoredDailyAssignments(value: string | null | undefined) {
  if (!value) {
    return [] as RollDailyBoardAssignment[];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const cellNumber = Number((entry as { cell_number?: unknown }).cell_number);
        const prizeId = typeof (entry as { prize_id?: unknown }).prize_id === "string"
          ? (entry as { prize_id: string }).prize_id
          : "";
        const prizeTier = (entry as { prize_tier?: RollPrizeTier }).prize_tier;

        if (!Number.isInteger(cellNumber) || !prizeId || (prizeTier !== "small" && prizeTier !== "big" && prizeTier !== "master")) {
          return null;
        }

        return {
          cell_number: cellNumber,
          prize_id: prizeId,
          prize_tier: prizeTier,
        } satisfies RollDailyBoardAssignment;
      })
      .filter((entry): entry is RollDailyBoardAssignment => entry !== null);
  } catch {
    return [];
  }
}

export function buildShuffledDailyBoardAssignments({
  bigPrizes,
  masterPrizes = SYSTEM_MASTER_PRIZES,
  randomInt,
  smallPrizes,
}: {
  bigPrizes: RollRewardPoolPrize[];
  masterPrizes?: readonly SystemMasterPrizeDefinition[];
  randomInt: (max: number) => number;
  smallPrizes: RollRewardPoolPrize[];
}) {
  const shuffledMasters = shuffleWithRandomInt([...masterPrizes], randomInt).map((prize) => prize.id);
  const shuffledSmall = shuffleWithRandomInt(smallPrizes, randomInt).map((prize) => prize.id);
  const shuffledBig = shuffleWithRandomInt(bigPrizes, randomInt).map((prize) => prize.id);

  return [
    ...createAssignmentsForTier(MASTER_CELLS, "master", shuffledMasters),
    ...createAssignmentsForTier(SMALL_CELLS, "small", shuffledSmall),
    ...createAssignmentsForTier(BIG_CELLS, "big", shuffledBig),
  ].sort((left, right) => left.cell_number - right.cell_number);
}

export function buildRollRewardBoard({
  assignments,
  bigPrizes,
  masterPrizes = SYSTEM_MASTER_PRIZES,
  smallPrizes,
}: {
  assignments: RollDailyBoardAssignment[];
  bigPrizes: RollRewardPoolPrize[];
  masterPrizes?: readonly SystemMasterPrizeDefinition[];
  smallPrizes: RollRewardPoolPrize[];
}) {
  const assignmentMap = new Map(assignments.map((assignment) => [assignment.cell_number, assignment]));
  const smallById = new Map(smallPrizes.map((prize) => [prize.id, prize]));
  const bigById = new Map(bigPrizes.map((prize) => [prize.id, prize]));
  const masterById = new Map(masterPrizes.map((prize) => [prize.id, prize]));

  return Array.from({ length: 20 }, (_, idx) => {
    const cellNumber = idx + 1;

    if (cellNumber === 1) {
      return { cellNumber: 1, kind: "none", label: SPECIAL_CELL_LABELS[1] } satisfies ResolvedBoardCell;
    }

    if (cellNumber === 18) {
      return { cellNumber: 18, kind: "special", label: SPECIAL_CELL_LABELS[18], special: "swap" } satisfies ResolvedBoardCell;
    }

    if (cellNumber === 19) {
      return { cellNumber: 19, kind: "special", label: SPECIAL_CELL_LABELS[19], special: "double" } satisfies ResolvedBoardCell;
    }

    if (cellNumber === 20) {
      return { cellNumber: 20, kind: "special", label: SPECIAL_CELL_LABELS[20], special: "choose_any" } satisfies ResolvedBoardCell;
    }

    const tier = getTierForPrizeCell(cellNumber) ?? "small";
    const assignment = assignmentMap.get(cellNumber);

    if (!assignment) {
      return {
        cellNumber,
        kind: "prize",
        label: `${tier[0].toUpperCase()}${tier.slice(1)} reward`,
        reward: null,
        tier,
      } satisfies ResolvedBoardCell;
    }

    if (assignment.prize_tier === "master") {
      const masterPrize = masterById.get(assignment.prize_id) ?? SYSTEM_MASTER_PRIZE_BY_ID.get(assignment.prize_id) ?? null;
      return {
        cellNumber,
        kind: "prize",
        label: masterPrize?.name ?? "Master reward",
        reward: masterPrize
          ? {
              masterPrize,
              prizeId: masterPrize.id,
              type: "master_reward",
            }
          : null,
        tier: "master",
      } satisfies ResolvedBoardCell;
    }

    const poolPrize = assignment.prize_tier === "big"
      ? bigById.get(assignment.prize_id) ?? null
      : smallById.get(assignment.prize_id) ?? null;

    return {
      cellNumber,
      kind: "prize",
      label: poolPrize?.name ?? `${assignment.prize_tier[0].toUpperCase()}${assignment.prize_tier.slice(1)} reward`,
      reward: poolPrize
        ? {
            name: poolPrize.name,
            prizeId: poolPrize.id,
            prizeTier: assignment.prize_tier,
            type: "pool_prize",
          }
        : null,
      tier: assignment.prize_tier,
    } satisfies ResolvedBoardCell;
  });
}

export function getPlacedPrizeKeys(board: ResolvedBoardCell[]) {
  return board.flatMap((cell) => {
    if (cell.kind !== "prize" || !cell.reward) {
      return [];
    }

    if (cell.reward.type === "master_reward") {
      return [getPrizeKey("master", cell.reward.prizeId)];
    }

    return [getPrizeKey(cell.reward.prizeTier, cell.reward.prizeId)];
  });
}

export function getReplacementCandidates({
  board,
  cellNumber,
  claimedPrizeKeys,
  masterPrizes = SYSTEM_MASTER_PRIZES,
  bigPrizes,
  smallPrizes,
}: {
  board: ResolvedBoardCell[];
  cellNumber: number;
  claimedPrizeKeys: string[];
  masterPrizes?: readonly SystemMasterPrizeDefinition[];
  bigPrizes: RollRewardPoolPrize[];
  smallPrizes: RollRewardPoolPrize[];
}) {
  const targetCell = board.find((cell) => cell.cellNumber === cellNumber);
  if (!targetCell || targetCell.kind !== "prize" || !targetCell.reward) {
    return [] as ChooseCandidate[];
  }

  const claimedSet = new Set(claimedPrizeKeys);
  const placedKeys = new Set(getPlacedPrizeKeys(board));
  const currentKey = targetCell.reward.type === "master_reward"
    ? getPrizeKey("master", targetCell.reward.prizeId)
    : getPrizeKey(targetCell.reward.prizeTier, targetCell.reward.prizeId);
  placedKeys.delete(currentKey);

  if (targetCell.reward.type === "master_reward") {
    return masterPrizes
      .map((prize) => ({
        id: prize.id,
        key: getPrizeKey("master", prize.id),
        name: prize.name,
        source: "pool" as const,
        tier: "master" as const,
      }))
      .filter((candidate) => candidate.key !== currentKey && !placedKeys.has(candidate.key) && !claimedSet.has(candidate.key));
  }

  const pool = targetCell.reward.prizeTier === "big" ? bigPrizes : smallPrizes;
  return pool
    .map((prize) => ({
      id: prize.id,
      key: getPrizeKey(targetCell.reward.prizeTier, prize.id),
      name: prize.name,
      source: "pool" as const,
      tier: targetCell.reward.prizeTier,
    }))
    .filter((candidate) => candidate.key !== currentKey && !placedKeys.has(candidate.key) && !claimedSet.has(candidate.key));
}

export function getChooseAnyCandidates({
  board,
  claimedPrizeKeys,
  masterPrizes = SYSTEM_MASTER_PRIZES,
  bigPrizes,
  scope,
  smallPrizes,
}: {
  board: ResolvedBoardCell[];
  claimedPrizeKeys: string[];
  masterPrizes?: readonly SystemMasterPrizeDefinition[];
  bigPrizes: RollRewardPoolPrize[];
  scope: ChoosePrizeScope;
  smallPrizes: RollRewardPoolPrize[];
}) {
  const claimedSet = new Set(claimedPrizeKeys);
  const placedKeys = new Set(getPlacedPrizeKeys(board));
  const boardCandidates = scope === "any"
    ? board.flatMap((cell) => {
        if (cell.kind !== "prize" || !cell.reward) {
          return [];
        }

        if (cell.reward.type === "master_reward") {
          return [{
            id: cell.reward.prizeId,
            key: getPrizeKey("master", cell.reward.prizeId),
            name: cell.reward.masterPrize.name,
            source: "board" as const,
            tier: "master" as const,
          }];
        }

        return [{
          id: cell.reward.prizeId,
          key: getPrizeKey(cell.reward.prizeTier, cell.reward.prizeId),
          name: cell.reward.name,
          source: "board" as const,
          tier: cell.reward.prizeTier,
        }];
      })
    : [];

  const smallPoolCandidates = smallPrizes
    .map((prize) => ({
      id: prize.id,
      key: getPrizeKey("small", prize.id),
      name: prize.name,
      source: "pool" as const,
      tier: "small" as const,
    }))
    .filter((candidate) => scope === "small" || scope === "any")
    .filter((candidate) => scope === "small" || (!placedKeys.has(candidate.key) && !claimedSet.has(candidate.key)));

  const bigPoolCandidates = bigPrizes
    .map((prize) => ({
      id: prize.id,
      key: getPrizeKey("big", prize.id),
      name: prize.name,
      source: "pool" as const,
      tier: "big" as const,
    }))
    .filter((candidate) => scope === "big" || scope === "any")
    .filter((candidate) => scope === "big" || (!placedKeys.has(candidate.key) && !claimedSet.has(candidate.key)));

  const masterPoolCandidates = scope === "any"
    ? masterPrizes
        .map((prize) => ({
          id: prize.id,
          key: getPrizeKey("master", prize.id),
          name: prize.name,
          source: "pool" as const,
          tier: "master" as const,
        }))
        .filter((candidate) => !placedKeys.has(candidate.key) && !claimedSet.has(candidate.key))
    : [];

  return [...boardCandidates, ...smallPoolCandidates, ...bigPoolCandidates, ...masterPoolCandidates];
}
