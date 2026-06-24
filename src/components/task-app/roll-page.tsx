"use client";

import { X } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { ErrorBoundary } from "../error-boundary";
import { ModalShell } from "../modal-shell";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type {
  RollDailyBoard,
  RollDailyBoardAssignment,
  RollHistoryEntry,
  RollHistoryInsert,
  RollPrizeBasketEntry,
  RollPrizeBasketEntryInsert,
  RollRewardPoolPrize,
  RollRewardPoolPrizeInsert,
  VaultPrize,
  VaultPrizeInsert,
} from "@/lib/database.types";
import {
  buildShuffledDailyBoardAssignments,
  buildRollRewardBoard,
  getChooseAnyCandidates,
  parseStoredDailyAssignments,
  getReplacementCandidates,
  SYSTEM_MASTER_PRIZES,
  type ChooseCandidate,
  type ChoosePrizeScope,
  type MasterRewardAction,
  type ResolvedBoardCell,
  type RollPrizeTier,
  type SystemMasterPrizeDefinition,
} from "@/lib/roll-rewards";
import { withBasePath } from "@/lib/utils";

const Dice3DCanvas = lazy(() => import("../dice-3d").then((module) => ({ default: module.Dice3DCanvas })));

type RollPhase = "idle" | "rolling" | "settling";
type D20VisualStyle = {
  bodyColor: string;
  bodyEmissive: string;
  bodyEmissiveIntensity: number;
  bodyMetalness: number;
  bodyOpacity: number;
  bodyRoughness: number;
  finish: D20MaterialPreset;
  pipColor: string;
  pipEmissive: string;
  pipEmissiveIntensity: number;
  pipMetalness: number;
  pipOpacity: number;
  pipRoughness: number;
};

const DEFAULT_D20_VISUAL_STYLE: D20VisualStyle = {
  bodyColor: "#8e82f9",
  bodyEmissive: "#6552f1",
  bodyEmissiveIntensity: 0.08,
  bodyMetalness: 0.08,
  bodyOpacity: 1,
  bodyRoughness: 0.38,
  finish: "ceramic",
  pipColor: "#f7f4ff",
  pipEmissive: "#ffffff",
  pipEmissiveIntensity: 0.16,
  pipMetalness: 0.06,
  pipOpacity: 1,
  pipRoughness: 0.2,
};

type RewardResolution =
  | {
      kind: "final";
      title: string;
      detail: string;
      rewardName?: string | null;
    }
  | {
      kind: "swap";
      claimsRemaining: number;
      title: string;
      detail: string;
    }
  | {
      kind: "choose";
      claimsRemaining: number;
      scope: ChoosePrizeScope;
      title: string;
      detail: string;
    }
  | {
      kind: "rolling";
      title: string;
      detail: string;
    };

const UNIVERSAL_ROLL_CONFIG = {
  cost: 100,
  description: "Universal d20 board roll · Free rolls are spent first · 100 pts otherwise",
  layout: "d20" as const,
};

const MANAGER_TABS = ["small", "big", "master"] as const;

function getSecureRandomIntInclusive(max: number) {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const limit = Math.floor(0x100000000 / max) * max;
    const buffer = new Uint32Array(1);
    let value = 0;

    do {
      crypto.getRandomValues(buffer);
      value = buffer[0] ?? 0;
    } while (value >= limit);

    return (value % max) + 1;
  }

  return Math.floor(Math.random() * max) + 1;
}

function parseManualRollValue(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 20) {
    return null;
  }
  return parsed;
}

const ROLL_RESOLVE_FALLBACK_MS = 2400;
const BOARD_RESET_HOUR = 6;

type PendingRollMode =
  | { kind: "board"; multiplier: number }
  | {
      kind: "conditional-check";
      multiplier: number;
      reward: Extract<MasterRewardAction, { type: "conditional_bank_rolls" | "conditional_tokens" }>;
      sourceLabel: string;
    };

function getLocalDateStamp() {
  const now = new Date();
  now.setHours(now.getHours() - BOARD_RESET_HOUR);
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 10);
}

type RollPageProps = {
  client: NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
  currentUser: User;
  isDark: boolean;
  onSpendPoints: (delta: number, reason: string) => void;
};

function rewardTone(cell: ResolvedBoardCell) {
  if (cell.kind === "none") {
    return "text-[#8e88a9] dark:text-white/45";
  }

  if (cell.kind === "special") {
    return "text-[#6f57f6] dark:text-[#cabfff]";
  }

  if (cell.tier === "master") {
    return "text-[#f29d36] dark:text-[#ffd38f]";
  }

  if (cell.tier === "big") {
    return "text-[#1d7c62] dark:text-[#8ff0cc]";
  }

  return "text-[#27304c] dark:text-white/78";
}

export function RollPageComponent({
  client,
  currentUser,
  isDark,
  onSpendPoints,
}: RollPageProps) {
  const [points, setPoints] = useState<number | null>(null);
  const [tokens, setTokens] = useState<number | null>(null);
  const [freeRollBank, setFreeRollBank] = useState<number | null>(null);
  const [history, setHistory] = useState<RollHistoryEntry[]>([]);
  const [prizeBasket, setPrizeBasket] = useState<RollPrizeBasketEntry[]>([]);
  const [phase, setPhase] = useState<RollPhase>("idle");
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const [rollingFace, setRollingFace] = useState<number | null>(null);
  const [showVault, setShowVault] = useState(false);
  const [showPrizeManager, setShowPrizeManager] = useState(false);
  const [manualRollValue, setManualRollValue] = useState("");
  const [showManualRollInput, setShowManualRollInput] = useState(false);

  const [vaultPrizes, setVaultPrizes] = useState<VaultPrize[]>([]);
  const [vaultEditId, setVaultEditId] = useState<string | null>(null);
  const [vaultName, setVaultName] = useState("");
  const [vaultCost, setVaultCost] = useState("");

  const [rollRewardPrizes, setRollRewardPrizes] = useState<RollRewardPoolPrize[]>([]);
  const [boardAssignments, setBoardAssignments] = useState<RollDailyBoardAssignment[]>([]);
  const [claimedPrizeKeys, setClaimedPrizeKeys] = useState<string[]>([]);
  const [managerTier, setManagerTier] = useState<RollPrizeTier>("small");
  const [poolEditId, setPoolEditId] = useState<string | null>(null);
  const [poolName, setPoolName] = useState("");
  const [poolBulk, setPoolBulk] = useState("");
  const [isFillingBoard, setIsFillingBoard] = useState(false);
  const [managerFeedback, setManagerFeedback] = useState<{ text: string; tone: "good" | "warn" } | null>(null);

  const [resolution, setResolution] = useState<RewardResolution | null>(null);
  const [pendingSwapTargetCell, setPendingSwapTargetCell] = useState<number | null>(null);
  const [pendingSwapPrizeId, setPendingSwapPrizeId] = useState<string | null>(null);
  const [pendingChoosePrizeKey, setPendingChoosePrizeKey] = useState<string | null>(null);
  const [d20Style] = useState<D20VisualStyle>(DEFAULT_D20_VISUAL_STYLE);
  const masterPrizes = SYSTEM_MASTER_PRIZES;
  const pendingResult = useRef<number | null>(null);
  const pendingCost = useRef<number>(0);
  const pendingNeedsHistory = useRef(false);
  const pendingRollModeRef = useRef<PendingRollMode>({ kind: "board", multiplier: 1 });
  const rollSettleTimeoutRef = useRef<number | null>(null);
  const rollResolveTimeoutRef = useRef<number | null>(null);
  const autoRollTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rollSettleTimeoutRef.current !== null) {
        window.clearTimeout(rollSettleTimeoutRef.current);
      }
      if (rollResolveTimeoutRef.current !== null) {
        window.clearTimeout(rollResolveTimeoutRef.current);
      }
      if (autoRollTimeoutRef.current !== null) {
        window.clearTimeout(autoRollTimeoutRef.current);
      }
    };
  }, []);

  async function persistProfileValues(updates: { free_roll_bank?: number; points?: number; tokens?: number }) {
    await client.from("adhdice_user_profiles").update(updates).eq("user_id", currentUser.id);
  }

  async function persistDailyBoardState({
    claimedKeys,
    nextAssignments,
  }: {
    claimedKeys?: string[];
    nextAssignments?: RollDailyBoardAssignment[];
  }) {
    const assignmentsToSave = nextAssignments ?? boardAssignments;
    const claimedKeysToSave = claimedKeys ?? claimedPrizeKeys;
    const payload = {
      assignments_json: JSON.stringify(assignmentsToSave),
      board_date: getLocalDateStamp(),
      claimed_prize_keys: claimedKeysToSave,
      user_id: currentUser.id,
    };
    const { data } = await client
      .from("adhdice_roll_daily_boards")
      .upsert(payload, { onConflict: "user_id,board_date" })
      .select("*")
      .single();

    setBoardAssignments(assignmentsToSave);
    setClaimedPrizeKeys(claimedKeysToSave);
    if (data) {
      setDailyBoard(data as RollDailyBoard);
    }
  }

  const createAndPersistDailyBoard = useCallback(async ({
    bigPrizeList,
    boardDate,
    claimedKeys = [],
    smallPrizeList,
  }: {
    bigPrizeList: RollRewardPoolPrize[];
    boardDate: string;
    claimedKeys?: string[];
    smallPrizeList: RollRewardPoolPrize[];
  }) => {
    const nextAssignments = buildShuffledDailyBoardAssignments({
      bigPrizes: bigPrizeList,
      masterPrizes,
      randomInt: getSecureRandomIntInclusive,
      smallPrizes: smallPrizeList,
    });
    const nextPayload = {
      assignments_json: JSON.stringify(nextAssignments),
      board_date: boardDate,
      claimed_prize_keys: claimedKeys,
      user_id: currentUser.id,
    };
    const { data } = await client
      .from("adhdice_roll_daily_boards")
      .upsert(nextPayload, { onConflict: "user_id,board_date" })
      .select("*")
      .single();

    setBoardAssignments(nextAssignments);
    setClaimedPrizeKeys(claimedKeys);
    if (data) {
    } else {
    }
  }, [client, currentUser.id, masterPrizes]);

  async function reloadRollRewardPrizes() {
    const { data } = await client
      .from("adhdice_roll_reward_pool_prizes")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("sort_order")
      .order("created_at");
    if (data) {
      setRollRewardPrizes(data as RollRewardPoolPrize[]);
    }
  }

  async function awardPrizeToBasket({
    prizeName,
    prizeTier,
    quantity,
    rollResult,
    sourceLabel,
  }: {
    prizeName: string;
    prizeTier: "big" | "master" | "small";
    quantity: number;
    rollResult: number | null;
    sourceLabel: string;
  }) {
    const insert: RollPrizeBasketEntryInsert = {
      user_id: currentUser.id,
      prize_name: prizeName,
      prize_tier: prizeTier,
      quantity,
      roll_result: rollResult,
      source_label: sourceLabel,
    };
    const { data, error } = await client
      .from("adhdice_roll_prize_basket")
      .insert(insert)
      .select("*")
      .single();

    if (error) {
      return false;
    }

    if (data) {
      setPrizeBasket((current) => [data as RollPrizeBasketEntry, ...current]);
    }
    return true;
  }

  async function handleClaimBasketPrize(entry: RollPrizeBasketEntry) {
    if (entry.is_claimed) {
      return;
    }

    const claimedAt = new Date().toISOString();
    const { error } = await client
      .from("adhdice_roll_prize_basket")
      .update({ claimed_at: claimedAt, is_claimed: true })
      .eq("id", entry.id);

    if (error) {
      return;
    }

    setPrizeBasket((current) => current.map((basketEntry) => (
      basketEntry.id === entry.id
        ? { ...basketEntry, claimed_at: claimedAt, is_claimed: true }
        : basketEntry
    )));
  }

  function replacePoolPrizeLocally(nextPrize: RollRewardPoolPrize) {
    setRollRewardPrizes((current) => {
      const existingIndex = current.findIndex((prize) => prize.id === nextPrize.id);
      if (existingIndex === -1) {
        return [...current, nextPrize].sort((left, right) => {
          if (left.tier !== right.tier) {
            return left.tier.localeCompare(right.tier);
          }
          if (left.sort_order !== right.sort_order) {
            return left.sort_order - right.sort_order;
          }
          return left.created_at.localeCompare(right.created_at);
        });
      }

      const next = [...current];
      next[existingIndex] = nextPrize;
      return next;
    });
  }

  useEffect(() => {
    void (async () => {
      const today = getLocalDateStamp();
      const [profileRes, historyRes, vaultRes, basketRes, poolRes, dailyBoardRes] = await Promise.all([
        client.from("adhdice_user_profiles").select("points, tokens, free_roll_bank").eq("user_id", currentUser.id).single(),
        client.from("adhdice_roll_history").select("*").eq("user_id", currentUser.id).order("rolled_at", { ascending: false }).limit(10),
        client.from("adhdice_vault_prizes").select("*").eq("user_id", currentUser.id).order("created_at"),
        client.from("adhdice_roll_prize_basket").select("*").eq("user_id", currentUser.id).order("created_at", { ascending: false }),
        client.from("adhdice_roll_reward_pool_prizes").select("*").eq("user_id", currentUser.id).order("sort_order").order("created_at"),
        client.from("adhdice_roll_daily_boards").select("*").eq("user_id", currentUser.id).eq("board_date", today).maybeSingle(),
      ]);

      if (profileRes.data) {
        setPoints(profileRes.data.points);
        setTokens(profileRes.data.tokens ?? 0);
        setFreeRollBank(profileRes.data.free_roll_bank ?? 0);
      }
      if (historyRes.data) setHistory(historyRes.data as RollHistoryEntry[]);
      if (vaultRes.data) setVaultPrizes(vaultRes.data as VaultPrize[]);
      if (basketRes.data) setPrizeBasket(basketRes.data as RollPrizeBasketEntry[]);
      const resolvedPoolPrizes = (poolRes.data as RollRewardPoolPrize[] | null) ?? [];
      setRollRewardPrizes(resolvedPoolPrizes);

      const resolvedSmallPrizes = resolvedPoolPrizes.filter((prize) => prize.tier === "small");
      const resolvedBigPrizes = resolvedPoolPrizes.filter((prize) => prize.tier === "big");
      const existingBoard = dailyBoardRes.data as RollDailyBoard | null;

      if (existingBoard) {
        const parsedAssignments = parseStoredDailyAssignments(existingBoard.assignments_json);
        const resolvedExistingBoard = buildRollRewardBoard({
          assignments: parsedAssignments,
          bigPrizes: resolvedBigPrizes,
          masterPrizes,
          smallPrizes: resolvedSmallPrizes,
        });
        const needsReseed = resolvedExistingBoard.some((cell) =>
          cell.kind === "prize"
          && cell.reward === null
          && (
            (cell.tier === "master" && masterPrizes.length > 0)
            || (cell.tier === "small" && resolvedSmallPrizes.length > 0)
            || (cell.tier === "big" && resolvedBigPrizes.length > 0)
          ),
        );

        if (needsReseed) {
          await createAndPersistDailyBoard({
            bigPrizeList: resolvedBigPrizes,
            boardDate: today,
            claimedKeys: [],
            smallPrizeList: resolvedSmallPrizes,
          });
        } else {
          setBoardAssignments(parsedAssignments);
          setClaimedPrizeKeys(existingBoard.claimed_prize_keys ?? []);
        }
      } else {
        await createAndPersistDailyBoard({
          bigPrizeList: resolvedBigPrizes,
          boardDate: today,
          claimedKeys: [],
          smallPrizeList: resolvedSmallPrizes,
        });
      }
    })();
  }, [client, createAndPersistDailyBoard, currentUser.id, masterPrizes]);

  const smallPrizes = useMemo(
    () => rollRewardPrizes.filter((prize) => prize.tier === "small"),
    [rollRewardPrizes],
  );
  const bigPrizes = useMemo(
    () => rollRewardPrizes.filter((prize) => prize.tier === "big"),
    [rollRewardPrizes],
  );
  const board = useMemo(
    () => buildRollRewardBoard({ assignments: boardAssignments, bigPrizes, masterPrizes, smallPrizes }),
    [bigPrizes, boardAssignments, masterPrizes, smallPrizes],
  );
  const hasUnassignedPrizeSlots = useMemo(
    () => board.some((cell) => cell.kind === "prize" && cell.reward === null),
    [board],
  );
  const canFillBoardFully = smallPrizes.length > 0 && bigPrizes.length > 0;
  const boardNotice = hasUnassignedPrizeSlots
    ? canFillBoardFully
      ? "Today's board has open prize slots. Fill Board will reshuffle everything using your current Small and Big prize pools."
      : "Today's board is missing prize assignments. Add at least one Small prize and one Big prize, then press Fill Board."
    : "Boards reshuffle daily at 6:00 AM. You can also press Fill Board after editing prizes to rebuild today's board.";
  const canRoll = phase === "idle"
    && points !== null
    && freeRollBank !== null
    && (
      UNIVERSAL_ROLL_CONFIG.cost <= 0
      || points >= UNIVERSAL_ROLL_CONFIG.cost
      || freeRollBank > 0
    );
  const visibleD20Face = phase === "idle"
    ? lastRoll ?? undefined
    : phase === "rolling" || phase === "settling"
      ? rollingFace ?? undefined
      : undefined;
  const managerPrizes = managerTier === "small"
    ? smallPrizes
    : managerTier === "big"
      ? bigPrizes
      : [];
  const vaultCustomPrizes = useMemo(
    () => [...vaultPrizes].sort((a, b) => Number(a.is_claimed) - Number(b.is_claimed) || a.created_at.localeCompare(b.created_at)),
    [vaultPrizes],
  );
  const activePrizeBasket = useMemo(
    () => prizeBasket.filter((entry) => !entry.is_claimed),
    [prizeBasket],
  );
  const activePrizeBasketCount = useMemo(
    () => activePrizeBasket.reduce((sum, entry) => sum + entry.quantity, 0),
    [activePrizeBasket],
  );
  const pendingSwapCell = pendingSwapTargetCell ? board.find((cell) => cell.cellNumber === pendingSwapTargetCell) ?? null : null;
  const swapCandidates = pendingSwapTargetCell && pendingSwapCell?.kind === "prize"
    ? getReplacementCandidates({
        board,
        bigPrizes,
        cellNumber: pendingSwapTargetCell,
        claimedPrizeKeys,
        masterPrizes,
        smallPrizes,
      })
    : [];
  const chooseAnyCandidates = useMemo(
    () => resolution?.kind === "choose"
      ? getChooseAnyCandidates({
          bigPrizes,
          board,
          claimedPrizeKeys,
          masterPrizes,
          scope: resolution.scope,
          smallPrizes,
        })
      : [],
    [bigPrizes, board, claimedPrizeKeys, masterPrizes, resolution, smallPrizes],
  );
  function resetPendingActions() {
    setPendingSwapTargetCell(null);
    setPendingSwapPrizeId(null);
    setPendingChoosePrizeKey(null);
  }

  function pushHistory(entry: RollHistoryEntry) {
    setHistory((prev) => [entry, ...prev.filter((item) => item.id !== entry.id)].slice(0, 10));
  }

  async function insertHistoryEntry(entry: RollHistoryInsert) {
    const { data } = await client
      .from("adhdice_roll_history")
      .insert(entry)
      .select("*")
      .single();
    if (data) {
      pushHistory(data as RollHistoryEntry);
    }
  }

  async function spendRoll(cost: number) {
    if (points === null || freeRollBank === null || cost <= 0) {
      return 0;
    }

    if (freeRollBank > 0) {
      const nextBank = freeRollBank - 1;
      setFreeRollBank(nextBank);
      await persistProfileValues({ free_roll_bank: nextBank });
      return 0;
    }

    const newBalance = Math.max(0, points - cost);
    setPoints(newBalance);
    onSpendPoints(-cost, "Dice roll");
    return cost;
  }

  function startRoll({
    cost,
    forcedResult,
    mode = { kind: "board", multiplier: 1 },
  }: {
    cost: number;
    forcedResult?: number;
    mode?: PendingRollMode;
  }) {
    if (points === null || phase !== "idle") {
      return;
    }

    const result = forcedResult ?? getSecureRandomIntInclusive(20);
    pendingResult.current = result;
    pendingRollModeRef.current = mode;
    pendingNeedsHistory.current = true;
    resetPendingActions();
    setResolution(null);
    setLastRoll(null);
    setRollingFace(result);
    setPhase("rolling");

    if (rollSettleTimeoutRef.current !== null) {
      window.clearTimeout(rollSettleTimeoutRef.current);
    }
    if (rollResolveTimeoutRef.current !== null) {
      window.clearTimeout(rollResolveTimeoutRef.current);
    }
    if (autoRollTimeoutRef.current !== null) {
      window.clearTimeout(autoRollTimeoutRef.current);
      autoRollTimeoutRef.current = null;
    }

    void spendRoll(cost).then((actualCost) => {
      pendingCost.current = actualCost;
    });

    new Audio(withBasePath("/dice-roll.wav")).play().catch(() => {});
    rollSettleTimeoutRef.current = window.setTimeout(() => {
      setPhase("settling");
    }, 650);
    rollResolveTimeoutRef.current = window.setTimeout(() => {
      void handleDiceSettled();
    }, ROLL_RESOLVE_FALLBACK_MS);
  }

  function handleRoll() {
    if (!canRoll) {
      return;
    }
    startRoll({ cost: UNIVERSAL_ROLL_CONFIG.cost });
  }

  function handleManualRollSubmit() {
    const parsed = parseManualRollValue(manualRollValue);
    if (!canRoll || parsed === null) {
      return;
    }

    setShowManualRollInput(false);
    setManualRollValue("");
    startRoll({ cost: UNIVERSAL_ROLL_CONFIG.cost, forcedResult: parsed });
  }

  async function finalizeResolvedHistory({
    detail,
    rewardName,
    roll,
  }: {
    detail: string;
    rewardName?: string | null;
    roll: number;
  }) {
    if (!pendingNeedsHistory.current) {
      return;
    }

    pendingNeedsHistory.current = false;
    await insertHistoryEntry({
      user_id: currentUser.id,
      roll_result: roll,
      points_spent: pendingCost.current,
      prize_label: rewardName ?? detail,
    });
  }

  async function scheduleFollowUpRoll({
    detail,
    mode,
    title,
  }: {
    detail: string;
    mode: PendingRollMode;
    title: string;
  }) {
    setResolution({
      kind: "rolling",
      title,
      detail,
    });
    autoRollTimeoutRef.current = window.setTimeout(() => {
      startRoll({ cost: 0, mode });
    }, 800);
  }

  async function awardFreeRolls(amount: number) {
    const nextBank = (freeRollBank ?? 0) + amount;
    setFreeRollBank(nextBank);
    await persistProfileValues({ free_roll_bank: nextBank });
  }

  async function awardTokens(amount: number) {
    const nextTokens = (tokens ?? 0) + amount;
    setTokens(nextTokens);
    await persistProfileValues({ tokens: nextTokens });
  }

  async function consumePoolChoiceIfNeeded(candidate: ChooseCandidate, scope: ChoosePrizeScope) {
    if (scope !== "any" || candidate.source !== "pool") {
      return;
    }

    const nextClaimedKeys = Array.from(new Set([...claimedPrizeKeys, candidate.key]));
    await persistDailyBoardState({ claimedKeys: nextClaimedKeys });
  }

  async function resolveMasterReward({
    multiplier,
    reward,
    roll,
  }: {
    multiplier: number;
    reward: SystemMasterPrizeDefinition;
    roll: number;
  }) {
    const action = reward.action;
    if (action.type === "bank_rolls") {
      const totalAmount = action.amount * multiplier;
      await awardFreeRolls(totalAmount);
      const detail = `Added ${totalAmount} free roll${totalAmount === 1 ? "" : "s"} to your bank.`;
      setResolution({
        kind: "final",
        title: "Free rolls banked",
        detail,
        rewardName: reward.name,
      });
      await finalizeResolvedHistory({ detail, rewardName: `Master · ${reward.name}`, roll });
      return;
    }

    if (action.type === "grant_tokens") {
      const totalAmount = action.amount * multiplier;
      await awardTokens(totalAmount);
      const detail = `Added ${totalAmount} token${totalAmount === 1 ? "" : "s"} to your economy.`;
      setResolution({
        kind: "final",
        title: "Tokens awarded",
        detail,
        rewardName: reward.name,
      });
      await finalizeResolvedHistory({ detail, rewardName: `Master · ${reward.name}`, roll });
      return;
    }

    if (action.type === "choose_pool_prize") {
      setResolution({
        kind: "choose",
        claimsRemaining: multiplier,
        detail: action.scope === "small"
          ? "Choose any prize from your Small prize pool."
          : "Choose any prize from your Big prize pool.",
        scope: action.scope,
        title: action.scope === "small" ? "Choose Any Small Prize" : "Choose Any Big Prize",
      });
      await finalizeResolvedHistory({ detail: reward.description, rewardName: `Master · ${reward.name}`, roll });
      return;
    }

    await finalizeResolvedHistory({ detail: reward.description, rewardName: `Master · ${reward.name}`, roll });
    await scheduleFollowUpRoll({
      detail: action.type === "conditional_bank_rolls"
        ? `Free check roll: if the next roll is over ${action.threshold}, bank ${action.amount * multiplier} rolls.`
        : `Free check roll: if the next roll is over ${action.threshold}, gain ${action.amount * multiplier} tokens.`,
      mode: {
        kind: "conditional-check",
        multiplier,
        reward: action,
        sourceLabel: reward.name,
      },
      title: reward.name,
    });
  }

  async function resolveBoardCell({
    multiplier,
    roll,
  }: {
    multiplier: number;
    roll: number;
  }) {
    const cell = board[roll - 1];
    if (!cell) {
      setResolution({
        kind: "final",
        title: "Roll resolved",
        detail: "This roll did not map to a reward cell.",
      });
      await finalizeResolvedHistory({ detail: "Unmapped roll", roll });
      return;
    }

    if (cell.kind === "none") {
      const nextResolution = {
        kind: "final" as const,
        title: "No prize this time",
        detail: "Cell 1 is always No Prize.",
      };
      setResolution(nextResolution);
      await finalizeResolvedHistory({ detail: nextResolution.detail, rewardName: cell.label, roll });
      return;
    }

    if (cell.kind === "special") {
      if (cell.special === "swap") {
        setResolution({
          kind: "swap",
          claimsRemaining: multiplier,
          title: "Swap a board prize",
          detail: "Choose a board cell, then replace it with a different prize from that same category.",
        });
        await finalizeResolvedHistory({ detail: "Swap Prize opened", rewardName: multiplier > 1 ? `Swap Prize ×${multiplier}` : "Swap Prize", roll });
        return;
      }

      if (cell.special === "choose_any") {
        setResolution({
          kind: "choose",
          claimsRemaining: multiplier,
          scope: "any",
          title: "Choose Any Prize",
          detail: "Choose any prize on the board, or any unclaimed prize left in the pools.",
        });
        await finalizeResolvedHistory({ detail: "Choose Any Prize opened", rewardName: multiplier > 1 ? `Choose Any Prize ×${multiplier}` : "Choose Any Prize", roll });
        return;
      }

      await finalizeResolvedHistory({ detail: "Double Next Prize armed", rewardName: multiplier > 1 ? `Double Next Prize ×${multiplier}` : "Double Next Prize", roll });
      await scheduleFollowUpRoll({
        detail: multiplier > 1
          ? `Free follow-up roll. The next prize will be claimed ${multiplier * 2} times.`
          : "Free follow-up roll. The next prize will be claimed twice.",
        mode: { kind: "board", multiplier: multiplier * 2 },
        title: "Double Next Prize",
      });
      return;
    }

    if (!cell.reward) {
      setResolution({
        kind: "final",
        title: "Prize slot not ready",
        detail: `Cell ${cell.cellNumber} does not have an assigned reward yet.`,
      });
      await finalizeResolvedHistory({ detail: "Unassigned prize cell", rewardName: cell.label, roll });
      return;
    }

    if (cell.reward.type === "master_reward") {
      await resolveMasterReward({ multiplier, reward: cell.reward.masterPrize, roll });
      return;
    }

    const rewardName = multiplier > 1 ? `${cell.reward.name} ×${multiplier}` : cell.reward.name;
    const savedToBasket = await awardPrizeToBasket({
      prizeName: cell.reward.name,
      prizeTier: cell.tier,
      quantity: multiplier,
      rollResult: roll,
      sourceLabel: `Board cell ${cell.cellNumber}`,
    });
    const detail = savedToBasket
      ? multiplier > 1
        ? `You landed on ${cell.reward.name}. Added ${multiplier} to your prize basket.`
        : `You landed on ${cell.reward.name}. Added it to your prize basket.`
      : multiplier > 1
        ? `You landed on ${cell.reward.name} and won ${multiplier}, but the prize basket could not save them.`
        : `You landed on ${cell.reward.name}, but the prize basket could not save it.`;
    setResolution({
      kind: "final",
      title: `${cell.tier[0].toUpperCase()}${cell.tier.slice(1)} reward`,
      detail,
      rewardName,
    });
    await finalizeResolvedHistory({
      detail,
      rewardName: multiplier > 1 ? `Double Next Prize · ${rewardName}` : cell.reward.name,
      roll,
    });
  }

  async function handleDiceSettled() {
    const roll = pendingResult.current;
    if (roll === null) {
      return;
    }

    if (rollSettleTimeoutRef.current !== null) {
      window.clearTimeout(rollSettleTimeoutRef.current);
      rollSettleTimeoutRef.current = null;
    }
    if (rollResolveTimeoutRef.current !== null) {
      window.clearTimeout(rollResolveTimeoutRef.current);
      rollResolveTimeoutRef.current = null;
    }

    const rollMode = pendingRollModeRef.current;
    pendingResult.current = null;
    setLastRoll(roll);
    setRollingFace(null);
    setPhase("idle");
    new Audio(withBasePath("/calm-alarm.wav")).play().catch(() => {});

    if (rollMode.kind === "conditional-check") {
      const totalAmount = rollMode.reward.amount * rollMode.multiplier;
      const didWin = roll > rollMode.reward.threshold;
      if (didWin) {
        if (rollMode.reward.type === "conditional_bank_rolls") {
          await awardFreeRolls(totalAmount);
          const detail = `Check roll ${roll} beat ${rollMode.reward.threshold}. Banked ${totalAmount} free rolls.`;
          setResolution({
            kind: "final",
            title: "Conditional reward won",
            detail,
            rewardName: `${rollMode.sourceLabel} · Success`,
          });
          await finalizeResolvedHistory({
            detail,
            rewardName: `Master Check · ${rollMode.sourceLabel} · Bank ${totalAmount} rolls`,
            roll,
          });
          return;
        }

        await awardTokens(totalAmount);
        const detail = `Check roll ${roll} beat ${rollMode.reward.threshold}. Added ${totalAmount} tokens to your economy.`;
        setResolution({
          kind: "final",
          title: "Conditional reward won",
          detail,
          rewardName: `${rollMode.sourceLabel} · Success`,
        });
        await finalizeResolvedHistory({
          detail,
          rewardName: `Master Check · ${rollMode.sourceLabel} · ${totalAmount} Tokens`,
          roll,
        });
        return;
      }

      const detail = `Check roll ${roll} did not beat ${rollMode.reward.threshold}, so no bonus was awarded.`;
      setResolution({
        kind: "final",
        title: "Conditional reward missed",
        detail,
        rewardName: `${rollMode.sourceLabel} · Miss`,
      });
      await finalizeResolvedHistory({
        detail,
        rewardName: `Master Check · ${rollMode.sourceLabel} · Miss`,
        roll,
      });
      return;
    }

    await resolveBoardCell({
      multiplier: rollMode.multiplier,
      roll,
    });
  }

  async function handleAddPoolPrize() {
    if (managerTier === "master" || !poolName.trim()) {
      return;
    }

    const trimmedName = poolName.trim();
    const insert: RollRewardPoolPrizeInsert = {
      user_id: currentUser.id,
      tier: managerTier,
      name: trimmedName,
      sort_order: managerPrizes.length,
    };
    const { data, error } = await client
      .from("adhdice_roll_reward_pool_prizes")
      .insert(insert)
      .select("*")
      .single();

    if (error) {
      setManagerFeedback({ text: error.message, tone: "warn" });
      return;
    }

    if (data) {
      replacePoolPrizeLocally(data as RollRewardPoolPrize);
      setManagerFeedback({ text: `Added "${trimmedName}" to ${managerTier}.`, tone: "good" });
    } else {
      await reloadRollRewardPrizes();
      setManagerFeedback({ text: `Added "${trimmedName}" to ${managerTier}.`, tone: "good" });
    }

    setPoolName("");
  }

  async function handleUpdatePoolPrize(id: string) {
    if (managerTier === "master" || !poolName.trim()) {
      return;
    }

    const trimmedName = poolName.trim();
    const { data, error } = await client
      .from("adhdice_roll_reward_pool_prizes")
      .update({ name: trimmedName, tier: managerTier })
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      setManagerFeedback({ text: error.message, tone: "warn" });
      return;
    }
    if (data) {
      replacePoolPrizeLocally(data as RollRewardPoolPrize);
    } else {
      await reloadRollRewardPrizes();
    }
    setManagerFeedback({ text: `Updated "${trimmedName}".`, tone: "good" });
    setPoolEditId(null);
    setPoolName("");
  }

  async function handleDeletePoolPrize(id: string) {
    const { error } = await client.from("adhdice_roll_reward_pool_prizes").delete().eq("id", id);
    if (error) {
      setManagerFeedback({ text: error.message, tone: "warn" });
      return;
    }
    setRollRewardPrizes((current) => current.filter((prize) => prize.id !== id));
    setManagerFeedback({ text: "Prize removed from the pool.", tone: "good" });
  }

  async function handleBulkPoolPaste() {
    if (managerTier === "master") {
      return;
    }
    const names = poolBulk.split("\n").map((entry) => entry.trim()).filter(Boolean);
    if (!names.length) {
      return;
    }

    const inserts: RollRewardPoolPrizeInsert[] = names.map((name, index) => ({
      user_id: currentUser.id,
      tier: managerTier,
      name,
      sort_order: managerPrizes.length + index,
    }));
    const { data, error } = await client
      .from("adhdice_roll_reward_pool_prizes")
      .insert(inserts)
      .select("*");
    if (error) {
      setManagerFeedback({ text: error.message, tone: "warn" });
      return;
    }
    if (data) {
      setRollRewardPrizes((current) => [...current, ...(data as RollRewardPoolPrize[])]);
      setManagerFeedback({ text: `Added ${data.length} prize${data.length === 1 ? "" : "s"} to ${managerTier}.`, tone: "good" });
    } else {
      await reloadRollRewardPrizes();
      setManagerFeedback({ text: `Added ${names.length} prize${names.length === 1 ? "" : "s"} to ${managerTier}.`, tone: "good" });
    }
    setPoolBulk("");
  }

  async function handleSaveBoardSwap() {
    if (!pendingSwapTargetCell || !pendingSwapPrizeId || !pendingSwapCell || pendingSwapCell.kind !== "prize") {
      return;
    }

    const chosen = swapCandidates.find((candidate) => candidate.key === pendingSwapPrizeId);
    const currentResolution = resolution?.kind === "swap" ? resolution : null;
    if (!chosen || !currentResolution) {
      return;
    }

    const nextAssignments = boardAssignments
      .filter((entry) => entry.cell_number !== pendingSwapTargetCell)
      .concat({
        cell_number: pendingSwapTargetCell,
        prize_id: chosen.id,
        prize_tier: chosen.tier,
      })
      .sort((a, b) => a.cell_number - b.cell_number);

    await persistDailyBoardState({ nextAssignments });

    const detail = `Cell ${pendingSwapTargetCell} now points to ${chosen.name}.`;
    if (currentResolution.claimsRemaining > 1) {
      await insertHistoryEntry({
        user_id: currentUser.id,
        roll_result: 18,
        points_spent: 0,
        prize_label: `Swap Prize · ${chosen.name}`,
      });
      setResolution({
        ...currentResolution,
        claimsRemaining: currentResolution.claimsRemaining - 1,
        detail: `${detail} ${currentResolution.claimsRemaining - 1} swap${currentResolution.claimsRemaining - 1 === 1 ? "" : "s"} left.`,
      });
      setPendingSwapPrizeId(null);
      setPendingSwapTargetCell(null);
      return;
    }

    setResolution({
      kind: "final",
      title: "Board updated",
      detail,
      rewardName: chosen.name,
    });
    resetPendingActions();
    await insertHistoryEntry({
      user_id: currentUser.id,
      roll_result: 18,
      points_spent: 0,
      prize_label: `Swap Prize · ${chosen.name}`,
    });
  }

  async function handleChooseAnyReward() {
    const chosen = chooseAnyCandidates.find((candidate) => candidate.key === pendingChoosePrizeKey);
    const currentResolution = resolution?.kind === "choose" ? resolution : null;
    if (!chosen || !currentResolution) {
      return;
    }

    await consumePoolChoiceIfNeeded(chosen, currentResolution.scope);
    const basketSaved = await awardPrizeToBasket({
      prizeName: chosen.name,
      prizeTier: chosen.tier,
      quantity: 1,
      rollResult: lastRoll ?? null,
      sourceLabel: currentResolution.title,
    });
    const detail = basketSaved
      ? chosen.source === "board"
        ? `You selected ${chosen.name} from the current board and added it to your prize basket.`
        : `You selected ${chosen.name} from the ${chosen.tier} prize pool and added it to your prize basket.`
      : chosen.source === "board"
        ? `You selected ${chosen.name} from the current board, but the prize basket could not save it.`
        : `You selected ${chosen.name} from the ${chosen.tier} prize pool, but the prize basket could not save it.`;

    if (currentResolution.claimsRemaining > 1) {
      await insertHistoryEntry({
        user_id: currentUser.id,
        roll_result: lastRoll ?? 20,
        points_spent: 0,
        prize_label: `Choose Any · ${chosen.name}`,
      });
      setResolution({
        ...currentResolution,
        claimsRemaining: currentResolution.claimsRemaining - 1,
        detail: `${detail} ${currentResolution.claimsRemaining - 1} claim${currentResolution.claimsRemaining - 1 === 1 ? "" : "s"} left.`,
      });
      setPendingChoosePrizeKey(null);
      return;
    }

    setResolution({
      kind: "final",
      title: "Reward chosen",
      detail,
      rewardName: chosen.name,
    });
    resetPendingActions();
    await insertHistoryEntry({
      user_id: currentUser.id,
      roll_result: lastRoll ?? 20,
      points_spent: 0,
      prize_label: `Choose Any · ${chosen.name}`,
    });
  }

  async function handleClaimPrize(prize: VaultPrize) {
    if (tokens === null || tokens < prize.token_cost || prize.is_claimed) {
      return;
    }

    const newTokens = tokens - prize.token_cost;
    await Promise.all([
      client.from("adhdice_vault_prizes").update({ is_claimed: true, claimed_at: new Date().toISOString() }).eq("id", prize.id),
      persistProfileValues({ tokens: newTokens }),
      client.from("adhdice_point_ledger").insert({
        user_id: currentUser.id,
        delta: -prize.token_cost,
        reason: `Claimed: ${prize.name}`,
        balance_after: newTokens,
        source: "roll",
      }),
    ]);

    setTokens(newTokens);
    setVaultPrizes((prev) => prev.map((entry) => (
      entry.id === prize.id ? { ...entry, is_claimed: true } : entry
    )));
  }

  async function handleSaveVaultPrize() {
    if (!vaultName.trim()) {
      return;
    }

    const tokenCost = Math.max(1, parseInt(vaultCost, 10) || 10);
    if (vaultEditId) {
      await client.from("adhdice_vault_prizes")
        .update({ name: vaultName.trim(), token_cost: tokenCost })
        .eq("id", vaultEditId);
      setVaultPrizes((prev) => prev.map((prize) => (
        prize.id === vaultEditId
          ? { ...prize, name: vaultName.trim(), token_cost: tokenCost }
          : prize
      )));
    } else {
      const insert: VaultPrizeInsert = {
        user_id: currentUser.id,
        name: vaultName.trim(),
        token_cost: tokenCost,
        tier: "small",
      };
      const { data } = await client.from("adhdice_vault_prizes").insert(insert).select("*").single();
      if (data) {
        setVaultPrizes((prev) => [...prev, data as VaultPrize]);
      }
    }

    setVaultEditId(null);
    setVaultName("");
    setVaultCost("");
  }

  async function handleDeleteVaultPrize(id: string) {
    await client.from("adhdice_vault_prizes").delete().eq("id", id);
    setVaultPrizes((prev) => prev.filter((prize) => prize.id !== id));
    if (vaultEditId === id) {
      setVaultEditId(null);
      setVaultName("");
      setVaultCost("");
    }
  }

  async function handleFillBoard() {
    setIsFillingBoard(true);
    try {
      await createAndPersistDailyBoard({
        bigPrizeList: bigPrizes,
        boardDate: getLocalDateStamp(),
        claimedKeys: [],
        smallPrizeList: smallPrizes,
      });
      setResolution(null);
      setLastRoll(null);
      setPendingSwapPrizeId(null);
      setPendingSwapTargetCell(null);
      setPendingChoosePrizeKey(null);
    } finally {
      setIsFillingBoard(false);
    }
  }

  return (
    <section className="px-4 pb-32">
      <div className="mb-5 flex justify-center">
        <div className="flex w-full max-w-4xl items-center justify-center gap-3 rounded-2xl border border-[#ece8f8] bg-white/82 px-4 py-3 shadow-[0_12px_30px_rgba(81,61,168,0.05)] dark:border-white/10 dark:bg-white/[0.03]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">Points</p>
            <p className="text-xl font-black tabular-nums text-[#17203a] dark:text-white">{points ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">Tokens</p>
            <p className="text-xl font-black tabular-nums text-[#17203a] dark:text-white">{tokens ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">Free Roll Bank</p>
            <p className="text-xl font-black tabular-nums text-[#17203a] dark:text-white">{freeRollBank ?? "—"}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowVault(true)}
            className="ui-pill-button-strong-light transition active:scale-95"
          >
            Vault
          </button>
        </div>
      </div>

      <div className="mb-4 flex justify-center">
        <div className="grid w-full max-w-[calc(23rem+12rem+12px)] items-start gap-y-4 xl:grid-cols-[23rem_12rem] xl:gap-x-3">
          <div className="flex justify-center">
            <ErrorBoundary fallback={<div className="aspect-square w-full max-w-[24rem] rounded-2xl bg-[#f0ecff] dark:bg-[#130e24]" />}>
              <Suspense fallback={<div className="aspect-square w-full max-w-[24rem] rounded-2xl bg-[#f0ecff] dark:bg-[#130e24]" />}>
                <Dice3DCanvas
                  dark={isDark}
                  d20Style={d20Style}
                  faceValue={visibleD20Face}
                  layout="d20"
                  onClick={canRoll ? handleRoll : undefined}
                  onSettled={handleDiceSettled}
                  phase={phase}
                />
              </Suspense>
            </ErrorBoundary>
          </div>

          <div className="w-full space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <button
                disabled={!canRoll}
                onClick={handleRoll}
                type="button"
                className="ui-pill-button-strong-light w-full transition active:scale-[0.98] disabled:opacity-40"
              >
                {phase === "idle"
                  ? `Roll D20${UNIVERSAL_ROLL_CONFIG.cost > 0 ? ` — ${UNIVERSAL_ROLL_CONFIG.cost} pts` : ""}`
                  : phase === "rolling"
                    ? "Rolling…"
                    : "Settling…"}
              </button>
              <button
                disabled={!canRoll}
                onClick={() => setShowManualRollInput((current) => !current)}
                type="button"
                className="ui-pill-button-light w-full transition active:scale-[0.98] disabled:opacity-40"
              >
                Manual Roll
              </button>
            </div>

            {showManualRollInput ? (
              <div className="rounded-[1.25rem] border border-[#e4dcff] bg-white/85 px-4 py-4 dark:border-white/10 dark:bg-white/[0.04]">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">Use your real d20</p>
                <p className="mt-1 text-sm text-[#5f6785] dark:text-white/60">Enter the number you rolled in real life. The sandbox will animate to that result and award the same prize.</p>
                <div className="mt-3 flex gap-2">
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={manualRollValue}
                    onChange={(event) => setManualRollValue(event.target.value)}
                    placeholder="1-20"
                    className="w-24 rounded-xl bg-[#faf8ff] px-3 py-2 text-sm font-semibold text-[#1e2540] outline-none dark:bg-white/10 dark:text-white"
                  />
                  <button
                    type="button"
                    disabled={!canRoll || parseManualRollValue(manualRollValue) === null}
                    onClick={handleManualRollSubmit}
                    className="ui-pill-button-strong-light disabled:opacity-40"
                  >
                    Use Roll
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {resolution ? (
        <div className="mb-5 rounded-[1.6rem] border border-[#ece8f8] bg-[#faf8ff] px-5 py-4 shadow-[0_16px_40px_rgba(81,61,168,0.08)] dark:border-white/10 dark:bg-white/[0.04]">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">Roll result</p>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-black text-[#17203a] dark:text-white">{resolution.title}</p>
              <p className="mt-1 text-sm text-[#5f6785] dark:text-white/60">{resolution.detail}</p>
            </div>
            {lastRoll !== null ? (
              <span className="rounded-full bg-[#ede8ff] px-3 py-1 text-sm font-black tabular-nums text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]">
                {lastRoll}
              </span>
            ) : null}
          </div>

          {resolution.kind === "final" && resolution.rewardName ? (
            <p className="mt-4 text-sm font-semibold text-[#27304c] dark:text-white/75">
              Reward: {resolution.rewardName}
            </p>
          ) : null}

          {resolution.kind === "swap" ? (
            <div className="mt-4 space-y-4 rounded-[1.25rem] border border-[#e4dcff] bg-white/80 px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">
                {resolution.claimsRemaining} swap{resolution.claimsRemaining === 1 ? "" : "s"} available
              </p>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">Choose a board cell</p>
                <div className="flex flex-wrap gap-2">
                  {board.filter((cell) => cell.kind === "prize").map((cell) => (
                    <button
                      key={cell.cellNumber}
                      type="button"
                      onClick={() => {
                        setPendingSwapTargetCell(cell.cellNumber);
                        setPendingSwapPrizeId(null);
                      }}
                      className={`ui-pill-button-light text-xs transition ${
                        pendingSwapTargetCell === cell.cellNumber
                          ? "border-transparent bg-[#6f57f6] text-white dark:bg-[#9b87ff] dark:text-[#171127]"
                          : "bg-[#ede8ff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]"
                      }`}
                    >
                      Cell {cell.cellNumber}
                    </button>
                  ))}
                </div>
              </div>

              {pendingSwapCell?.kind === "prize" && pendingSwapTargetCell ? (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">
                    Replace cell {pendingSwapTargetCell}
                  </p>
                  <p className="mb-3 text-sm text-[#5f6785] dark:text-white/60">
                    Current reward: {pendingSwapCell.label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {swapCandidates.map((candidate) => (
                      <button
                        key={candidate.key}
                        type="button"
                        onClick={() => setPendingSwapPrizeId(candidate.key)}
                        className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                          pendingSwapPrizeId === candidate.key
                            ? "bg-[#6f57f6] text-white dark:bg-[#9b87ff] dark:text-[#171127]"
                            : "bg-[#f4f1ff] text-[#6f57f6] dark:bg-white/[0.05] dark:text-[#cabfff]"
                        }`}
                      >
                        {candidate.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                disabled={!pendingSwapTargetCell || !pendingSwapPrizeId}
                onClick={() => { void handleSaveBoardSwap(); }}
                className="ui-pill-button-strong-light w-full disabled:opacity-40"
              >
                Save board swap
              </button>
            </div>
          ) : null}

          {resolution.kind === "choose" ? (
            <div className="mt-4 space-y-4 rounded-[1.25rem] border border-[#e4dcff] bg-white/80 px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">
                {resolution.claimsRemaining} claim{resolution.claimsRemaining === 1 ? "" : "s"} available
              </p>
              <div className="flex flex-wrap gap-2">
                {chooseAnyCandidates.map((candidate) => (
                  <button
                    key={candidate.key}
                    type="button"
                    onClick={() => setPendingChoosePrizeKey(candidate.key)}
                    className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                      pendingChoosePrizeKey === candidate.key
                        ? "bg-[#6f57f6] text-white dark:bg-[#9b87ff] dark:text-[#171127]"
                        : "bg-[#f4f1ff] text-[#6f57f6] dark:bg-white/[0.05] dark:text-[#cabfff]"
                    }`}
                  >
                    {candidate.name}
                    <span className="ml-1 opacity-60">
                      {candidate.source === "board" ? "· board" : `· ${candidate.tier}`}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={!pendingChoosePrizeKey}
                onClick={() => { void handleChooseAnyReward(); }}
                className="ui-pill-button-strong-light w-full disabled:opacity-40"
              >
                Claim selected reward
              </button>
            </div>
          ) : null}

        </div>
      ) : null}

      <div className="relative mb-4">
        <div className="mx-auto grid max-w-[74rem] gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-stretch">
          <div className="rounded-[1.75rem] border border-[#ece8f8] bg-white/82 p-4 shadow-[0_12px_30px_rgba(81,61,168,0.05)] dark:border-white/10 dark:bg-white/[0.03]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">Prize Board</p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isFillingBoard || !canFillBoardFully}
                  onClick={() => { void handleFillBoard(); }}
                  className="ui-pill-button-strong-light transition hover:opacity-90 disabled:opacity-40"
                >
                  {isFillingBoard ? "Filling…" : "Fill Board"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrizeManager(true)}
                  className="ui-pill-button-light transition hover:opacity-80"
                >
                  Manage Prizes
                </button>
              </div>
            </div>

            <div className={`mb-4 rounded-[1.25rem] border px-4 py-3 text-sm ${
              hasUnassignedPrizeSlots
                ? "border-[#f2d59f] bg-[#fff7e8] text-[#8a6522] dark:border-[#5b4420] dark:bg-[#2c2212] dark:text-[#ffd38f]"
                : "border-[#e7e1fb] bg-[#faf8ff] text-[#6d6a86] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/55"
            }`}>
              {boardNotice}
            </div>

            <div className="mx-auto mb-2 grid max-w-[56rem] grid-cols-5 gap-2">
              {board.map((cell) => {
                const isLit = lastRoll === cell.cellNumber;
                return (
                  <div
                    key={cell.cellNumber}
                    className={`relative min-h-[4.8rem] rounded-xl px-2.5 py-2.5 transition ${
                      isLit
                        ? "bg-[#6f57f6] text-white shadow-[0_0_20px_rgba(111,87,246,0.4)] dark:bg-[#9b87ff] dark:text-[#171127]"
                        : "bg-[#f7f5ff] dark:bg-white/5"
                    }`}
                  >
                    <p className={`text-[10px] font-bold tabular-nums ${isLit ? "opacity-80" : "text-[#8e88a9] dark:text-white/40"}`}>
                      {cell.cellNumber}
                    </p>
                    <p className={`mt-1 text-[10px] font-semibold leading-tight ${isLit ? "text-white dark:text-[#171127]" : rewardTone(cell)}`}>
                      {cell.label}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex h-full min-h-[29.75rem] flex-col rounded-[1.75rem] border border-[#ece8f8] bg-white/82 p-4 shadow-[0_12px_30px_rgba(81,61,168,0.05)] dark:border-white/10 dark:bg-white/[0.03]">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">Prize Basket</p>
                <p className="mt-1 text-xs text-[#8e88a9] dark:text-white/40">
                  {activePrizeBasketCount} unclaimed reward{activePrizeBasketCount === 1 ? "" : "s"}
                </p>
              </div>
              <span className="rounded-full bg-[#ede8ff] px-2.5 py-1 text-[11px] font-black text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]">
                {activePrizeBasketCount}
              </span>
            </div>

            {activePrizeBasket.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-[1.25rem] border border-dashed border-[#ddd4ff] bg-[#faf8ff] px-4 text-center text-sm text-[#8e88a9] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/40">
                No saved rewards yet. Win a prize roll and it will stay here until you claim it.
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="flex flex-col gap-3">
                  {activePrizeBasket.map((entry) => (
                    <div key={entry.id} className="rounded-2xl bg-[#f7f5ff] px-4 py-3 dark:bg-white/5">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#17203a] dark:text-white">{entry.prize_name}</p>
                          <p className="text-xs text-[#8e88a9] dark:text-white/40">
                            {entry.quantity > 1 ? `${entry.quantity}x` : "1x"} · {entry.prize_tier} · {entry.source_label ?? "roll reward"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => { void handleClaimBasketPrize(entry); }}
                          className="ui-pill-button-strong-light transition active:scale-95"
                        >
                          Claim
                        </button>
                      </div>
                      {entry.roll_result ? (
                        <p className="text-[11px] text-[#8e88a9] dark:text-white/40">Won on roll {entry.roll_result}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {history.length > 0 ? (
          <div className="mx-auto mt-4 max-w-[42rem] rounded-[1.75rem] border border-[#ece8f8] bg-white/82 p-4 shadow-[0_12px_30px_rgba(81,61,168,0.05)] dark:border-white/10 dark:bg-white/[0.03]">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">Recent Rolls</p>
            <div className="divide-y overflow-hidden rounded-2xl bg-[#f7f5ff] divide-[#e5e0f5] dark:bg-white/5 dark:divide-white/8">
              {history.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ede8ff] text-sm font-black text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]">
                      {entry.roll_result}
                    </span>
                    <span className="text-sm text-[#27304c] dark:text-white/70">{entry.prize_label || "No prize"}</span>
                  </div>
                  <span className="text-xs text-[#8e88a9] dark:text-white/40">
                    {entry.points_spent > 0 ? `-${entry.points_spent}pts` : "free"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {showPrizeManager ? (
          <div className="absolute inset-0 z-20 overflow-hidden rounded-[1.75rem]">
            <button
              aria-label="Close prize manager"
              className="absolute inset-0 h-full w-full bg-white/80 backdrop-blur-sm dark:bg-[#140f26]/90"
              onClick={() => setShowPrizeManager(false)}
              type="button"
            />
            <div className="relative h-full overflow-y-auto px-5 py-4 sm:px-6">
              <div className="mx-auto flex w-full max-w-[42rem] flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a63f7] dark:text-[#c9bbff]">Edit Roll Rewards</p>
                    <h2 className="mt-1 text-2xl font-black text-[#17203a] dark:text-white">Manage Prizes</h2>
                  </div>
                  <button
                    aria-label="Close prize manager"
                    type="button"
                    onClick={() => setShowPrizeManager(false)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f0ff] text-[#6f57f6] dark:bg-white/8 dark:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <section className="rounded-[1.5rem] border border-[#ece8f8] bg-white p-4 shadow-[0_12px_30px_rgba(81,61,168,0.05)] dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="flex gap-1 rounded-xl bg-[#f0ecff] p-1 dark:bg-white/5">
                    {MANAGER_TABS.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => {
                          setManagerTier(tab);
                          setPoolEditId(null);
                          setPoolName("");
                          setManagerFeedback(null);
                        }}
                        className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                          managerTier === tab
                            ? "bg-[#6f57f6] text-white dark:bg-[#9b87ff] dark:text-[#171127]"
                            : "text-[#8e88a9] dark:text-white/40"
                        }`}
                      >
                        {tab[0].toUpperCase()}{tab.slice(1)}
                      </button>
                    ))}
                  </div>
                </section>

                {managerTier !== "master" ? (
                  <>
                    <section className="rounded-[1.5rem] border border-[#ece8f8] bg-white p-4 shadow-[0_12px_30px_rgba(81,61,168,0.05)] dark:border-white/10 dark:bg-white/[0.03]">
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">
                        {poolEditId ? "Edit prize" : "Add prize"}
                      </p>
                      <div className="flex gap-2">
                        <input
                          className="flex-1 rounded-xl bg-[#faf8ff] px-3 py-2 text-sm text-[#1e2540] outline-none dark:bg-white/10 dark:text-white"
                          maxLength={60}
                          onChange={(event) => setPoolName(event.target.value)}
                          placeholder="Prize name…"
                          value={poolName}
                        />
                      {poolEditId ? (
                        <button
                          type="button"
                          onClick={() => { void handleUpdatePoolPrize(poolEditId); }}
                          className="ui-pill-button-strong-light"
                          >
                            Save
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { void handleAddPoolPrize(); }}
                            className="ui-pill-button-strong-light"
                          >
                            Add
                          </button>
                        )}
                      </div>
                      {managerFeedback ? (
                        <p className={`mt-2 text-xs font-semibold ${
                          managerFeedback.tone === "warn"
                            ? "text-[#d64b5f] dark:text-[#ff9eaf]"
                            : "text-[#2f8a66] dark:text-[#87ddb7]"
                        }`}>
                          {managerFeedback.text}
                        </p>
                      ) : null}
                      {poolEditId ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPoolEditId(null);
                            setPoolName("");
                            setManagerFeedback(null);
                          }}
                          className="ui-pill-button-light mt-2"
                        >
                          Cancel edit
                        </button>
                      ) : null}
                    </section>

                    <section className="rounded-[1.5rem] border border-[#ece8f8] bg-white p-4 shadow-[0_12px_30px_rgba(81,61,168,0.05)] dark:border-white/10 dark:bg-white/[0.03]">
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">Bulk paste</p>
                      <textarea
                        className="w-full resize-none rounded-xl bg-[#faf8ff] px-3 py-2 text-sm text-[#1e2540] outline-none dark:bg-white/10 dark:text-white"
                        placeholder={"One prize per line…\nExtra nap\nFavorite snack"}
                        rows={4}
                        value={poolBulk}
                        onChange={(event) => setPoolBulk(event.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => { void handleBulkPoolPaste(); }}
                        className="ui-pill-button-strong-light mt-3"
                      >
                        Add all to {managerTier}
                      </button>
                    </section>
                  </>
                ) : (
                  <section className="rounded-[1.5rem] border border-[#ece8f8] bg-white p-4 shadow-[0_12px_30px_rgba(81,61,168,0.05)] dark:border-white/10 dark:bg-white/[0.03]">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">System master prizes</p>
                    <p className="text-sm text-[#5f6785] dark:text-white/60">
                      Master prizes are system-authored, behavior-based, and shuffled into cells 2-4 each day.
                    </p>
                  </section>
                )}

                <section className="rounded-[1.5rem] border border-[#ece8f8] bg-white p-4 shadow-[0_12px_30px_rgba(81,61,168,0.05)] dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">
                    {managerTier[0].toUpperCase()}{managerTier.slice(1)} prizes
                  </p>
                  {managerTier === "master" ? (
                    masterPrizes.length === 0 ? (
                      <p className="text-sm text-[#8e88a9] dark:text-white/40">No master prizes are configured yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {masterPrizes.map((prize) => (
                          <div key={prize.id} className="rounded-xl bg-[#faf8ff] px-3 py-3 dark:bg-white/[0.03]">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-[#17203a] dark:text-white">{prize.name}</p>
                              <span className="text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">
                                System
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-[#726a96] dark:text-white/55">{prize.description}</p>
                          </div>
                        ))}
                      </div>
                    )
                  ) : managerPrizes.length === 0 ? (
                    <p className="text-sm text-[#8e88a9] dark:text-white/40">No prizes in this pool yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {managerPrizes.map((prize) => (
                        <div key={prize.id} className="flex items-center justify-between rounded-xl bg-[#faf8ff] px-3 py-3 dark:bg-white/[0.03]">
                          <p className="text-sm font-semibold text-[#17203a] dark:text-white">{prize.name}</p>
                          <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setPoolEditId(prize.id);
                              setPoolName(prize.name);
                            }}
                            className="ui-pill-button-light"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => { void handleDeletePoolPrize(prize.id); }}
                            className="ui-pill-button-danger-light"
                          >
                            Del
                          </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {showVault ? (
        <ModalShell
          className="w-full max-w-md max-h-[82vh] overflow-y-auto rounded-[2rem] border border-[#ece8f8] bg-white shadow-[0_30px_80px_rgba(81,61,168,0.16)] dark:border-white/10 dark:bg-[#171328]"
          label="Vault"
          onClose={() => setShowVault(false)}
        >
          <div className="px-5 pb-6">
            <div className="mb-2 flex items-center justify-between py-4">
              <div>
                <h2 className="text-lg font-black text-[#17203a] dark:text-white">Vault</h2>
                <p className="text-xs text-[#8e88a9] dark:text-white/40">{tokens ?? 0} tokens available for custom prizes</p>
              </div>
              <button aria-label="Close vault" type="button" onClick={() => setShowVault(false)} className="rounded-full bg-[#f0ecff] p-2 dark:bg-white/10">
                <X className="h-4 w-4 text-[#8e88a9] dark:text-white/40" />
              </button>
            </div>

            <div className="mb-4 rounded-2xl bg-[#f7f5ff] p-4 dark:bg-white/5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">
                {vaultEditId ? "Edit custom prize" : "Add custom prize"}
              </p>
              <div className="mb-2 flex gap-2">
                <input
                  className="flex-1 rounded-xl bg-white px-3 py-2 text-sm text-[#1e2540] outline-none dark:bg-white/10 dark:text-white"
                  placeholder="Prize name…"
                  value={vaultName}
                  onChange={(event) => setVaultName(event.target.value)}
                />
                <input
                  className="w-24 rounded-xl bg-white px-3 py-2 text-sm text-[#1e2540] outline-none dark:bg-white/10 dark:text-white"
                  placeholder="Tokens"
                  value={vaultCost}
                  onChange={(event) => setVaultCost(event.target.value)}
                  type="number"
                  min="1"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { void handleSaveVaultPrize(); }}
                  className="ui-pill-button-strong-light flex-1"
                >
                  {vaultEditId ? "Save" : "Add prize"}
                </button>
                {vaultEditId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setVaultEditId(null);
                      setVaultName("");
                      setVaultCost("");
                    }}
                    className="ui-pill-button-light"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>

            {vaultCustomPrizes.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#8e88a9] dark:text-white/40">No custom token prizes yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {vaultCustomPrizes.map((prize) => {
                  const progress = Math.min((tokens ?? 0) / prize.token_cost, 1);
                  const canClaimPrize = (tokens ?? 0) >= prize.token_cost && !prize.is_claimed;
                  return (
                    <div key={prize.id} className={`rounded-2xl bg-[#f7f5ff] px-4 py-3 dark:bg-white/5 ${prize.is_claimed ? "opacity-50" : ""}`}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#17203a] dark:text-white">{prize.name}</p>
                          <p className="text-xs text-[#8e88a9] dark:text-white/40">{prize.token_cost} tokens</p>
                        </div>
                        <button
                          type="button"
                          disabled={!canClaimPrize}
                          onClick={() => { void handleClaimPrize(prize); }}
                          className="ui-pill-button-strong-light transition active:scale-95 disabled:opacity-40"
                        >
                          {prize.is_claimed ? "Claimed" : `Claim · ${prize.token_cost}t`}
                        </button>
                      </div>
                      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-[#e5e0f5] dark:bg-white/10">
                        <div className="h-full rounded-full bg-[#6f57f6] transition-all dark:bg-[#9b87ff]" style={{ width: `${progress * 100}%` }} />
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-[#8e88a9] dark:text-white/40">
                          {Math.min(tokens ?? 0, prize.token_cost)} / {prize.token_cost} tokens
                        </p>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setVaultEditId(prize.id);
                              setVaultName(prize.name);
                              setVaultCost(String(prize.token_cost));
                            }}
                            className="ui-pill-button-light"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => { void handleDeleteVaultPrize(prize.id); }}
                            className="ui-pill-button-danger-light"
                          >
                            Del
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ModalShell>
      ) : null}

    </section>
  );
}
