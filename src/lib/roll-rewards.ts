import type {
  RollBoardAssignment,
  RollMasterPrize,
  RollRewardPoolPrize,
} from "@/lib/database.types";

export type RollPrizeTier = "small" | "big" | "master";
export type RollSpecialCell = 1 | 18 | 19 | 20;

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
      special: "swap" | "bonus" | "choose";
    }
  | {
      cellNumber: number;
      kind: "prize";
      label: string;
      tier: RollPrizeTier;
      prizeId: string | null;
    };

export type BonusChainResolution = {
  rolls: number[];
  rewards: Array<{ roll: number; cell: ResolvedBoardCell }>;
};

const MASTER_CELLS = [2, 3, 4] as const;
const SMALL_CELLS = [5, 6, 7, 8, 9, 10, 11] as const;
const BIG_CELLS = [12, 13, 14, 15, 16, 17] as const;

export const SPECIAL_CELL_LABELS: Record<RollSpecialCell, string> = {
  1: "No Prize",
  18: "Swap Prize",
  19: "Roll Again",
  20: "Choose Any",
};

function cyclePick<T extends { id: string; name: string }>(items: T[], index: number) {
  if (!items.length) {
    return null;
  }

  return items[index % items.length] ?? null;
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

function getIndexWithinTier(cellNumber: number) {
  if (MASTER_CELLS.includes(cellNumber as (typeof MASTER_CELLS)[number])) {
    return MASTER_CELLS.indexOf(cellNumber as (typeof MASTER_CELLS)[number]);
  }

  if (SMALL_CELLS.includes(cellNumber as (typeof SMALL_CELLS)[number])) {
    return SMALL_CELLS.indexOf(cellNumber as (typeof SMALL_CELLS)[number]);
  }

  if (BIG_CELLS.includes(cellNumber as (typeof BIG_CELLS)[number])) {
    return BIG_CELLS.indexOf(cellNumber as (typeof BIG_CELLS)[number]);
  }

  return -1;
}

export function buildRollRewardBoard({
  assignments,
  bigPrizes,
  masterPrizes,
  smallPrizes,
}: {
  assignments: RollBoardAssignment[];
  bigPrizes: RollRewardPoolPrize[];
  masterPrizes: RollMasterPrize[];
  smallPrizes: RollRewardPoolPrize[];
}) {
  const assignmentMap = new Map(assignments.map((assignment) => [assignment.cell_number, assignment]));
  const byId = new Map<string, { id: string; name: string; tier: RollPrizeTier }>();

  for (const prize of smallPrizes) {
    byId.set(prize.id, { id: prize.id, name: prize.name, tier: "small" });
  }

  for (const prize of bigPrizes) {
    byId.set(prize.id, { id: prize.id, name: prize.name, tier: "big" });
  }

  for (const prize of masterPrizes) {
    byId.set(prize.id, { id: prize.id, name: prize.name, tier: "master" });
  }

  return Array.from({ length: 20 }, (_, idx) => {
    const cellNumber = idx + 1;
    if (cellNumber === 1) {
      return { cellNumber: 1, kind: "none", label: SPECIAL_CELL_LABELS[1] } satisfies ResolvedBoardCell;
    }

    if (cellNumber === 18) {
      return { cellNumber: 18, kind: "special", label: SPECIAL_CELL_LABELS[18], special: "swap" } satisfies ResolvedBoardCell;
    }

    if (cellNumber === 19) {
      return { cellNumber: 19, kind: "special", label: SPECIAL_CELL_LABELS[19], special: "bonus" } satisfies ResolvedBoardCell;
    }

    if (cellNumber === 20) {
      return { cellNumber: 20, kind: "special", label: SPECIAL_CELL_LABELS[20], special: "choose" } satisfies ResolvedBoardCell;
    }

    const tier = getTierForPrizeCell(cellNumber);
    const tierIndex = getIndexWithinTier(cellNumber);
    const defaultPrize = tier === "master"
      ? cyclePick(masterPrizes, tierIndex)
      : tier === "big"
        ? cyclePick(bigPrizes, tierIndex)
        : cyclePick(smallPrizes, tierIndex);
    const override = assignmentMap.get(cellNumber);
    const assignedPrize = override ? byId.get(override.prize_id) ?? null : defaultPrize;

    return {
      cellNumber,
      kind: "prize",
      label: assignedPrize?.name ?? `${tier ? `${tier[0].toUpperCase()}${tier.slice(1)}` : "Prize"} reward`,
      prizeId: assignedPrize?.id ?? null,
      tier: tier ?? "small",
    } satisfies ResolvedBoardCell;
  });
}

export function buildBonusChain({
  board,
  random,
}: {
  board: ResolvedBoardCell[];
  random?: () => number;
}): BonusChainResolution {
  const rng = random ?? Math.random;
  const firstBonus = Math.floor(rng() * 20) + 1;
  const rolls = [firstBonus];
  if (firstBonus >= 16) {
    rolls.push(
      Math.floor(rng() * 20) + 1,
      Math.floor(rng() * 20) + 1,
      Math.floor(rng() * 20) + 1,
    );
  }

  return {
    rolls,
    rewards: rolls.map((roll) => ({
      roll,
      cell: board[roll - 1] ?? { cellNumber: 1, kind: "none", label: SPECIAL_CELL_LABELS[1] },
    })),
  };
}

export function getReplacementCandidates({
  bigPrizes,
  cellNumber,
  currentPrizeId,
  masterPrizes,
  smallPrizes,
}: {
  bigPrizes: RollRewardPoolPrize[];
  cellNumber: number;
  currentPrizeId: string | null;
  masterPrizes: RollMasterPrize[];
  smallPrizes: RollRewardPoolPrize[];
}) {
  const tier = getTierForPrizeCell(cellNumber);
  const source = tier === "master"
    ? masterPrizes.map((prize) => ({ id: prize.id, name: prize.name, tier: "master" as const }))
    : tier === "big"
      ? bigPrizes.map((prize) => ({ id: prize.id, name: prize.name, tier: "big" as const }))
      : smallPrizes.map((prize) => ({ id: prize.id, name: prize.name, tier: "small" as const }));

  return source.filter((candidate) => candidate.id !== currentPrizeId);
}

export function getChooseAnyCandidates({
  bigPrizes,
  smallPrizes,
}: {
  bigPrizes: RollRewardPoolPrize[];
  smallPrizes: RollRewardPoolPrize[];
}) {
  return [
    ...smallPrizes.map((prize) => ({ id: prize.id, name: prize.name, tier: "small" as const })),
    ...bigPrizes.map((prize) => ({ id: prize.id, name: prize.name, tier: "big" as const })),
  ];
}
