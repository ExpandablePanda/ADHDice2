"use client";

import { X } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { ErrorBoundary } from "../error-boundary";
import { ModalShell } from "../modal-shell";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type {
  RollBoardAssignment,
  RollHistoryEntry,
  RollHistoryInsert,
  RollMasterPrize,
  RollRewardPoolPrize,
  RollRewardPoolPrizeInsert,
  Task,
  VaultPrize,
  VaultPrizeInsert,
} from "@/lib/database.types";
import {
  buildBonusChain,
  buildRollRewardBoard,
  getChooseAnyCandidates,
  getReplacementCandidates,
  type ResolvedBoardCell,
  type RollPrizeTier,
} from "@/lib/roll-rewards";
import { getUserScopedStorageKey, parseStoredJson } from "@/lib/task-ui-state";

const Dice3DCanvas = lazy(() => import("../dice-3d").then((module) => ({ default: module.Dice3DCanvas })));

type RollPhase = "idle" | "rolling" | "settling";
type D20MaterialPreset = "ceramic" | "candy" | "glass" | "matte" | "metal";

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
      title: string;
      detail: string;
    }
  | {
      kind: "choose";
      title: string;
      detail: string;
    }
  | {
      kind: "bonus";
      title: string;
      detail: string;
      rolls: number[];
      rewards: Array<{ roll: number; label: string }>;
    };

const UNIVERSAL_ROLL_CONFIG = {
  cost: 0,
  description: "Universal d20 sandbox · Test mode · 0 pts",
  layout: "d20" as const,
};

const MANAGER_TABS = ["small", "big", "master"] as const;
const D20_BODY_COLORS = [
  { bodyEmissive: "#6552f1", label: "Lavender", value: "#8e82f9" },
  { bodyEmissive: "#2860ea", label: "Cobalt", value: "#5b84ff" },
  { bodyEmissive: "#29977a", label: "Mint", value: "#54d6b1" },
  { bodyEmissive: "#c56a27", label: "Amber", value: "#f2a85f" },
  { bodyEmissive: "#a24c91", label: "Rose", value: "#ef86d0" },
  { bodyEmissive: "#59637f", label: "Slate", value: "#9ba8c8" },
] as const;
const D20_PIP_COLORS = [
  { pipEmissive: "#ffffff", label: "White", value: "#f7f4ff" },
  { pipEmissive: "#fff1b8", label: "Gold", value: "#f5cc68" },
  { pipEmissive: "#d7fbff", label: "Aqua", value: "#baf8ff" },
  { pipEmissive: "#ffd8ea", label: "Blush", value: "#ffc7e0" },
  { pipEmissive: "#21253a", label: "Ink", value: "#161a29" },
  { pipEmissive: "#efe5ff", label: "Lilac", value: "#e8d5ff" },
] as const;
const D20_MATERIAL_PRESETS: Array<{ description: string; label: string; value: D20MaterialPreset }> = [
  { description: "Polished and balanced like the default ADHDice feel.", label: "Ceramic", value: "ceramic" },
  { description: "Brighter highlights and a sweeter glossy shell.", label: "Candy", value: "candy" },
  { description: "Softer, more powdery surface response.", label: "Matte", value: "matte" },
  { description: "Translucent-leaning highlight response.", label: "Glass", value: "glass" },
  { description: "Heavier metallic shine across the body and numbers.", label: "Metal", value: "metal" },
] as const;

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

function applyD20MaterialPreset(baseStyle: D20VisualStyle, finish: D20MaterialPreset): D20VisualStyle {
  if (finish === "matte") {
    return {
      ...baseStyle,
      bodyEmissiveIntensity: 0.05,
      bodyMetalness: 0.03,
      bodyOpacity: 1,
      bodyRoughness: 0.7,
      finish,
      pipEmissiveIntensity: 0.08,
      pipMetalness: 0.03,
      pipOpacity: 1,
      pipRoughness: 0.28,
    };
  }

  if (finish === "candy") {
    return {
      ...baseStyle,
      bodyEmissiveIntensity: 0.12,
      bodyMetalness: 0.12,
      bodyOpacity: 1,
      bodyRoughness: 0.28,
      finish,
      pipEmissiveIntensity: 0.18,
      pipMetalness: 0.12,
      pipOpacity: 1,
      pipRoughness: 0.14,
    };
  }

  if (finish === "glass") {
    return {
      ...baseStyle,
      bodyEmissiveIntensity: 0.08,
      bodyMetalness: 0.04,
      bodyOpacity: 0.78,
      bodyRoughness: 0.12,
      finish,
      pipEmissiveIntensity: 0.14,
      pipMetalness: 0.04,
      pipOpacity: 0.94,
      pipRoughness: 0.06,
    };
  }

  if (finish === "metal") {
    return {
      ...baseStyle,
      bodyEmissiveIntensity: 0.04,
      bodyMetalness: 0.82,
      bodyOpacity: 0.96,
      bodyRoughness: 0.24,
      finish,
      pipEmissiveIntensity: 0.1,
      pipMetalness: 0.48,
      pipOpacity: 1,
      pipRoughness: 0.16,
    };
  }

  return {
    ...baseStyle,
    bodyEmissiveIntensity: 0.08,
    bodyMetalness: 0.08,
    bodyOpacity: 1,
    bodyRoughness: 0.38,
    finish,
    pipEmissiveIntensity: 0.16,
    pipMetalness: 0.06,
    pipOpacity: 1,
    pipRoughness: 0.2,
  };
}

const ROLL_REWARD_POOL_STORAGE_KEY = "adhdice-roll-reward-pools";
const ROLL_BOARD_ASSIGNMENT_STORAGE_KEY = "adhdice-roll-board-assignments";
const ROLL_RESOLVE_FALLBACK_MS = 2400;
const FALLBACK_MASTER_PRIZES: RollMasterPrize[] = [
  { id: "master-read-1", name: "Skip one task consequence", sort_order: 0, is_active: true, created_at: "", updated_at: "" },
  { id: "master-read-2", name: "One evening completely off", sort_order: 1, is_active: true, created_at: "", updated_at: "" },
  { id: "master-read-3", name: "Impulse buy allowance", sort_order: 2, is_active: true, created_at: "", updated_at: "" },
  { id: "master-read-4", name: "Pick any premium snack", sort_order: 3, is_active: true, created_at: "", updated_at: "" },
] as const;

type RollPageProps = {
  client: NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
  currentUser: User;
  isDark: boolean;
  onSpendPoints: (delta: number, reason: string) => void;
  tasks: Task[];
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

function CustomizerSection({
  children,
  isOpen,
  onToggle,
  title,
}: {
  children: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <section className="rounded-[1.1rem] border border-[#ece8f8] bg-white/78 p-3 dark:border-white/10 dark:bg-white/[0.04]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between text-left"
      >
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">{title}</p>
        <span className="text-lg font-semibold leading-none text-[#6f57f6] dark:text-[#cabfff]">
          {isOpen ? "−" : "+"}
        </span>
      </button>
      {isOpen ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}

export function RollPageComponent({
  client,
  currentUser,
  isDark,
  onSpendPoints,
  tasks,
}: RollPageProps) {
  const [points, setPoints] = useState<number | null>(null);
  const [tokens, setTokens] = useState<number | null>(null);
  const [history, setHistory] = useState<RollHistoryEntry[]>([]);
  const [phase, setPhase] = useState<RollPhase>("idle");
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const [rollingFace, setRollingFace] = useState<number | null>(null);
  const [showVault, setShowVault] = useState(false);
  const [showPrizeManager, setShowPrizeManager] = useState(false);

  const [vaultPrizes, setVaultPrizes] = useState<VaultPrize[]>([]);
  const [vaultEditId, setVaultEditId] = useState<string | null>(null);
  const [vaultName, setVaultName] = useState("");
  const [vaultCost, setVaultCost] = useState("");

  const [rollRewardPrizes, setRollRewardPrizes] = useState<RollRewardPoolPrize[]>([]);
  const [masterPrizes, setMasterPrizes] = useState<RollMasterPrize[]>([]);
  const [boardAssignments, setBoardAssignments] = useState<RollBoardAssignment[]>([]);
  const [managerTier, setManagerTier] = useState<RollPrizeTier>("small");
  const [poolEditId, setPoolEditId] = useState<string | null>(null);
  const [poolName, setPoolName] = useState("");
  const [poolBulk, setPoolBulk] = useState("");

  const [resolution, setResolution] = useState<RewardResolution | null>(null);
  const [pendingSwapTargetCell, setPendingSwapTargetCell] = useState<number | null>(null);
  const [pendingSwapPrizeId, setPendingSwapPrizeId] = useState<string | null>(null);
  const [pendingChoosePrizeId, setPendingChoosePrizeId] = useState<string | null>(null);
  const [d20Style, setD20Style] = useState<D20VisualStyle>(DEFAULT_D20_VISUAL_STYLE);
  const [d20CustomizerSections, setD20CustomizerSections] = useState({
    material: false,
    pipColor: false,
    sideColor: true,
  });
  const pendingResult = useRef<number | null>(null);
  const pendingCost = useRef<number>(0);
  const pendingNeedsHistory = useRef(false);
  const rollSettleTimeoutRef = useRef<number | null>(null);
  const rollResolveTimeoutRef = useRef<number | null>(null);

  const poolStorageKey = getUserScopedStorageKey(ROLL_REWARD_POOL_STORAGE_KEY, currentUser.id);
  const assignmentStorageKey = getUserScopedStorageKey(ROLL_BOARD_ASSIGNMENT_STORAGE_KEY, currentUser.id);

  useEffect(() => {
    return () => {
      if (rollSettleTimeoutRef.current !== null) {
        window.clearTimeout(rollSettleTimeoutRef.current);
      }
      if (rollResolveTimeoutRef.current !== null) {
        window.clearTimeout(rollResolveTimeoutRef.current);
      }
    };
  }, []);

  function persistRollRewardPrizes(nextPrizes: RollRewardPoolPrize[]) {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(poolStorageKey, JSON.stringify(nextPrizes));
  }

  function persistBoardAssignments(nextAssignments: RollBoardAssignment[]) {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(assignmentStorageKey, JSON.stringify(nextAssignments));
  }

  async function reloadRollRewardPrizes() {
    const { data } = await client
      .from("adhdice_roll_reward_pool_prizes")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("sort_order")
      .order("created_at");
    if (data) {
      setRollRewardPrizes(data as RollRewardPoolPrize[]);
      persistRollRewardPrizes(data as RollRewardPoolPrize[]);
    }
  }

  useEffect(() => {
    void (async () => {
      const storedPools = parseStoredJson<RollRewardPoolPrize[]>(poolStorageKey, []);
      const storedAssignments = parseStoredJson<RollBoardAssignment[]>(assignmentStorageKey, []);
      const [profileRes, historyRes, vaultRes, poolRes, masterRes, assignmentRes] = await Promise.all([
        client.from("adhdice_user_profiles").select("points, tokens").eq("user_id", currentUser.id).single(),
        client.from("adhdice_roll_history").select("*").eq("user_id", currentUser.id).order("rolled_at", { ascending: false }).limit(10),
        client.from("adhdice_vault_prizes").select("*").eq("user_id", currentUser.id).order("created_at"),
        client.from("adhdice_roll_reward_pool_prizes").select("*").eq("user_id", currentUser.id).order("sort_order").order("created_at"),
        client.from("adhdice_roll_master_prizes").select("*").eq("is_active", true).order("sort_order").order("created_at"),
        client.from("adhdice_roll_board_assignments").select("*").eq("user_id", currentUser.id).order("cell_number"),
      ]);

      if (profileRes.data) {
        setPoints(profileRes.data.points);
        setTokens(profileRes.data.tokens ?? 0);
      }
      if (historyRes.data) setHistory(historyRes.data as RollHistoryEntry[]);
      if (vaultRes.data) setVaultPrizes(vaultRes.data as VaultPrize[]);
      if (poolRes.data && poolRes.data.length > 0) {
        setRollRewardPrizes(poolRes.data as RollRewardPoolPrize[]);
        persistRollRewardPrizes(poolRes.data as RollRewardPoolPrize[]);
      } else if (storedPools.length > 0) {
        setRollRewardPrizes(storedPools);
      }
      if (masterRes.data && masterRes.data.length > 0) {
        setMasterPrizes(masterRes.data as RollMasterPrize[]);
      } else {
        setMasterPrizes([...FALLBACK_MASTER_PRIZES]);
      }
      if (assignmentRes.data && assignmentRes.data.length > 0) {
        setBoardAssignments(assignmentRes.data as RollBoardAssignment[]);
        persistBoardAssignments(assignmentRes.data as RollBoardAssignment[]);
      } else if (storedAssignments.length > 0) {
        setBoardAssignments(storedAssignments);
      }
    })();
  }, [assignmentStorageKey, client, currentUser.id, poolStorageKey]);

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
  const canRoll = points !== null && points >= UNIVERSAL_ROLL_CONFIG.cost && phase === "idle";
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
  const pendingSwapCell = pendingSwapTargetCell ? board.find((cell) => cell.cellNumber === pendingSwapTargetCell) ?? null : null;
  const swapCandidates = pendingSwapTargetCell && pendingSwapCell?.kind === "prize"
    ? getReplacementCandidates({
        bigPrizes,
        cellNumber: pendingSwapTargetCell,
        currentPrizeId: pendingSwapCell.prizeId,
        masterPrizes,
        smallPrizes,
      })
    : [];
  const chooseAnyCandidates = useMemo(
    () => getChooseAnyCandidates({ bigPrizes, smallPrizes }),
    [bigPrizes, smallPrizes],
  );
  function resetPendingActions() {
    setPendingSwapTargetCell(null);
    setPendingSwapPrizeId(null);
    setPendingChoosePrizeId(null);
  }

  function toggleD20CustomizerSection(section: keyof typeof d20CustomizerSections) {
    setD20CustomizerSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
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

  function startRoll(cost: number) {
    if (points === null || phase !== "idle") {
      return;
    }

    const result = getSecureRandomIntInclusive(20);
    pendingResult.current = result;
    pendingCost.current = cost;
    pendingNeedsHistory.current = true;
    resetPendingActions();
    setResolution(null);
    setLastRoll(null);
    setRollingFace(result);
    setPhase("rolling");

    if (cost > 0) {
      const newBalance = points - cost;
      void Promise.all([
        client.from("adhdice_user_profiles").update({ points: newBalance }).eq("user_id", currentUser.id),
        client.from("adhdice_point_ledger").insert({
          user_id: currentUser.id,
          delta: -cost,
          reason: "Dice roll",
          balance_after: newBalance,
          source: "roll",
        }),
      ]);
      setPoints(newBalance);
      onSpendPoints(-cost, "Dice roll");
    }

    if (rollSettleTimeoutRef.current !== null) {
      window.clearTimeout(rollSettleTimeoutRef.current);
    }
    if (rollResolveTimeoutRef.current !== null) {
      window.clearTimeout(rollResolveTimeoutRef.current);
    }

    new Audio("/dice-roll.wav").play().catch(() => {});
    rollSettleTimeoutRef.current = window.setTimeout(() => {
      setPhase("settling");
    }, 650);
    rollResolveTimeoutRef.current = window.setTimeout(() => {
      handleDiceSettled();
    }, ROLL_RESOLVE_FALLBACK_MS);
  }

  function handleRoll() {
    if (!canRoll) {
      return;
    }
    startRoll(UNIVERSAL_ROLL_CONFIG.cost);
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

  function handleDiceSettled() {
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

    const cell = board[roll - 1];
    pendingResult.current = null;
    setLastRoll(roll);
    setRollingFace(null);
    setPhase("idle");
    new Audio("/calm-alarm.wav").play().catch(() => {});

    if (!cell) {
      setResolution({
        kind: "final",
        title: "Roll resolved",
        detail: "This roll did not map to a reward cell.",
      });
      void finalizeResolvedHistory({ detail: "Unmapped roll", roll });
      return;
    }

    if (cell.kind === "none") {
      const nextResolution = {
        kind: "final" as const,
        title: "No prize this time",
        detail: "Cell 1 is always No Prize.",
      };
      setResolution(nextResolution);
      void finalizeResolvedHistory({ detail: nextResolution.detail, rewardName: cell.label, roll });
      return;
    }

    if (cell.kind === "prize") {
      const nextResolution = {
        kind: "final" as const,
        title: `${cell.tier[0].toUpperCase()}${cell.tier.slice(1)} reward`,
        detail: `You landed on ${cell.label}.`,
        rewardName: cell.label,
      };
      setResolution(nextResolution);
      void finalizeResolvedHistory({ detail: nextResolution.detail, rewardName: cell.label, roll });
      return;
    }

    if (cell.special === "swap") {
      setResolution({
        kind: "swap",
        title: "Swap a board prize",
        detail: "Choose a prize cell, then replace it with a different prize from that same category.",
      });
      return;
    }

    if (cell.special === "choose") {
      setResolution({
        kind: "choose",
        title: "Choose any Small or Big reward",
        detail: "Pick one reward from the Small or Big pools to claim this roll.",
      });
      return;
    }

    const chain = buildBonusChain({ board });
    const rewards = chain.rewards.map((reward) => ({
      roll: reward.roll,
      label: reward.cell.label,
    }));
    setResolution({
      kind: "bonus",
      title: chain.rolls.length > 1 ? "Roll again unlocked more free rolls" : "Bonus roll awarded",
      detail: chain.rolls.length > 1
        ? `Your first bonus roll was ${chain.rolls[0]}, so you unlocked 3 more free rolls.`
        : `You earned an immediate free bonus roll of ${chain.rolls[0]}.`,
      rolls: chain.rolls,
      rewards,
    });
    pendingNeedsHistory.current = false;
    void Promise.all([
      insertHistoryEntry({
        user_id: currentUser.id,
        roll_result: roll,
        points_spent: pendingCost.current,
        prize_label: "Roll Again",
      }),
      ...chain.rewards.map((reward) =>
        insertHistoryEntry({
          user_id: currentUser.id,
          roll_result: reward.roll,
          points_spent: 0,
          prize_label: reward.cell.label,
        })),
    ]);
  }

  async function handleAddPoolPrize() {
    if (managerTier === "master" || !poolName.trim()) {
      return;
    }

    const insert: RollRewardPoolPrizeInsert = {
      user_id: currentUser.id,
      tier: managerTier,
      name: poolName.trim(),
      sort_order: managerPrizes.length,
    };
    const optimisticPrize: RollRewardPoolPrize = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `local-${Date.now()}`,
      user_id: currentUser.id,
      tier: managerTier,
      name: poolName.trim(),
      sort_order: managerPrizes.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client
      .from("adhdice_roll_reward_pool_prizes")
      .insert(insert)
      .select("*")
      .single();

    if (data) {
      const nextPrizes = [...rollRewardPrizes, data as RollRewardPoolPrize];
      setRollRewardPrizes(nextPrizes);
      persistRollRewardPrizes(nextPrizes);
      await reloadRollRewardPrizes();
    } else if (error) {
      const nextPrizes = [...rollRewardPrizes, optimisticPrize];
      setRollRewardPrizes(nextPrizes);
      persistRollRewardPrizes(nextPrizes);
    }
    setPoolName("");
  }

  async function handleUpdatePoolPrize(id: string) {
    if (managerTier === "master" || !poolName.trim()) {
      return;
    }

    const { error } = await client
      .from("adhdice_roll_reward_pool_prizes")
      .update({ name: poolName.trim(), tier: managerTier })
      .eq("id", id);
    if (error) {
      const nextPrizes = rollRewardPrizes.map((prize) => (
        prize.id === id ? { ...prize, name: poolName.trim(), tier: managerTier } : prize
      ));
      setRollRewardPrizes(nextPrizes);
      persistRollRewardPrizes(nextPrizes);
    } else {
      await reloadRollRewardPrizes();
    }
    setPoolEditId(null);
    setPoolName("");
  }

  async function handleDeletePoolPrize(id: string) {
    const { error } = await client.from("adhdice_roll_reward_pool_prizes").delete().eq("id", id);
    if (error) {
      const nextPrizes = rollRewardPrizes.filter((prize) => prize.id !== id);
      setRollRewardPrizes(nextPrizes);
      persistRollRewardPrizes(nextPrizes);
    } else {
      await reloadRollRewardPrizes();
    }
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
    const optimisticPrizes: RollRewardPoolPrize[] = names.map((name, index) => ({
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `local-${Date.now()}-${index}`,
      user_id: currentUser.id,
      tier: managerTier,
      name,
      sort_order: managerPrizes.length + index,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    const { data, error } = await client
      .from("adhdice_roll_reward_pool_prizes")
      .insert(inserts)
      .select("*");
    if (data) {
      const nextPrizes = [...rollRewardPrizes, ...(data as RollRewardPoolPrize[])];
      setRollRewardPrizes(nextPrizes);
      persistRollRewardPrizes(nextPrizes);
      await reloadRollRewardPrizes();
    } else if (error) {
      const nextPrizes = [...rollRewardPrizes, ...optimisticPrizes];
      setRollRewardPrizes(nextPrizes);
      persistRollRewardPrizes(nextPrizes);
    }
    setPoolBulk("");
  }

  async function handleSaveBoardSwap() {
    if (!pendingSwapTargetCell || !pendingSwapPrizeId || !pendingSwapCell || pendingSwapCell.kind !== "prize") {
      return;
    }

    const chosen = swapCandidates.find((candidate) => candidate.id === pendingSwapPrizeId);
    if (!chosen) {
      return;
    }

    const optimisticAssignment: RollBoardAssignment = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `local-assign-${Date.now()}`,
      user_id: currentUser.id,
      cell_number: pendingSwapTargetCell,
      prize_id: pendingSwapPrizeId,
      prize_tier: chosen.tier,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client
      .from("adhdice_roll_board_assignments")
      .upsert({
        user_id: currentUser.id,
        cell_number: pendingSwapTargetCell,
        prize_id: pendingSwapPrizeId,
        prize_tier: chosen.tier,
      }, { onConflict: "user_id,cell_number" })
      .select("*")
      .single();

    if (data) {
      const nextAssignments = (() => {
        const withoutCell = boardAssignments.filter((entry) => entry.cell_number !== pendingSwapTargetCell);
        return [...withoutCell, data as RollBoardAssignment].sort((a, b) => a.cell_number - b.cell_number);
      })();
      setBoardAssignments(nextAssignments);
      persistBoardAssignments(nextAssignments);
    } else if (error) {
      const nextAssignments = (() => {
        const withoutCell = boardAssignments.filter((entry) => entry.cell_number !== pendingSwapTargetCell);
        return [...withoutCell, optimisticAssignment].sort((a, b) => a.cell_number - b.cell_number);
      })();
      setBoardAssignments(nextAssignments);
      persistBoardAssignments(nextAssignments);
    }

    const detail = `Cell ${pendingSwapTargetCell} now points to ${chosen.name}.`;
    setResolution({
      kind: "final",
      title: "Board updated",
      detail,
      rewardName: chosen.name,
    });
    resetPendingActions();
    await finalizeResolvedHistory({ detail, rewardName: `Swap Prize · ${chosen.name}`, roll: 18 });
  }

  async function handleChooseAnyReward() {
    const chosen = chooseAnyCandidates.find((candidate) => candidate.id === pendingChoosePrizeId);
    if (!chosen) {
      return;
    }

    const detail = `You selected ${chosen.name} from the ${chosen.tier} pool.`;
    setResolution({
      kind: "final",
      title: "Reward chosen",
      detail,
      rewardName: chosen.name,
    });
    resetPendingActions();
    await finalizeResolvedHistory({ detail, rewardName: `Choose Any · ${chosen.name}`, roll: 20 });
  }

  async function handleClaimPrize(prize: VaultPrize) {
    if (tokens === null || tokens < prize.token_cost || prize.is_claimed) {
      return;
    }

    const newTokens = tokens - prize.token_cost;
    await Promise.all([
      client.from("adhdice_vault_prizes").update({ is_claimed: true, claimed_at: new Date().toISOString() }).eq("id", prize.id),
      client.from("adhdice_user_profiles").update({ tokens: newTokens }).eq("user_id", currentUser.id),
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

  return (
    <section className="px-4 pb-32">
      <div className="pb-6">
        <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">
          Dice Roll Rewards
        </p>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-2xl bg-[#f7f5ff] px-5 py-3 dark:bg-white/5">
        <div className="flex gap-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">Points</p>
            <p className="text-2xl font-black tabular-nums text-[#17203a] dark:text-white">{points ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">Tokens</p>
            <p className="text-2xl font-black tabular-nums text-[#17203a] dark:text-white">{tokens ?? "—"}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowVault(true)}
          className="rounded-xl bg-[#ede8ff] px-4 py-2 text-sm font-bold text-[#6f57f6] transition active:scale-95 dark:bg-[#22193f] dark:text-[#cabfff]"
        >
          Vault
        </button>
      </div>

      <p className="mb-7 text-center text-[11px] text-[#8e88a9] dark:text-white/40">{UNIVERSAL_ROLL_CONFIG.description}</p>

      <div className="mb-4 flex justify-center">
        <div className="grid w-full max-w-[calc(24rem+18rem+10px)] items-start gap-y-4 xl:grid-cols-[24rem_18rem] xl:gap-x-[10px]">
          <div className="flex justify-center">
            <ErrorBoundary fallback={<div className="aspect-square w-full max-w-[24rem] rounded-2xl bg-[#f0ecff] dark:bg-[#130e24]" />}>
              <Suspense fallback={<div className="aspect-square w-full max-w-[24rem] rounded-2xl bg-[#f0ecff] dark:bg-[#130e24]" />}>
                <Dice3DCanvas
                  dark={isDark}
                  d20Style={d20Style}
                  faceValue={visibleD20Face}
                  layout="d20"
                  onSettled={handleDiceSettled}
                  phase={phase}
                />
              </Suspense>
            </ErrorBoundary>
          </div>

          <div className="space-y-3 rounded-[1.5rem] border border-[#ece8f8] bg-[#faf8ff] p-4 shadow-[0_12px_30px_rgba(81,61,168,0.05)] dark:border-white/10 dark:bg-white/[0.03]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a63f7] dark:text-[#c9bbff]">Customize D20</p>
              <p className="mt-1 text-sm text-[#5f6785] dark:text-white/60">Tune the side color, number color, and finish right beside the sandbox.</p>
            </div>

          <CustomizerSection
            title="Side Color"
            isOpen={d20CustomizerSections.sideColor}
            onToggle={() => toggleD20CustomizerSection("sideColor")}
          >
            <div className="flex flex-wrap gap-2">
              {D20_BODY_COLORS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setD20Style((current) => ({ ...current, bodyColor: option.value, bodyEmissive: option.bodyEmissive }))}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${
                    d20Style.bodyColor === option.value
                      ? "border-[#cbbcff] bg-[#f5f1ff] text-[#4d4272] dark:border-[#5a4a95] dark:bg-white/[0.08] dark:text-white"
                      : "border-[#e4def6] bg-white text-[#6a628d] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/65"
                  }`}
                >
                  <span className="h-4 w-4 rounded-full border border-black/5" style={{ background: option.value }} />
                  {option.label}
                </button>
              ))}
            </div>
          </CustomizerSection>

          <CustomizerSection
            title="Pip Color"
            isOpen={d20CustomizerSections.pipColor}
            onToggle={() => toggleD20CustomizerSection("pipColor")}
          >
            <div className="flex flex-wrap gap-2">
              {D20_PIP_COLORS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setD20Style((current) => ({ ...current, pipColor: option.value, pipEmissive: option.pipEmissive }))}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${
                    d20Style.pipColor === option.value
                      ? "border-[#cbbcff] bg-[#f5f1ff] text-[#4d4272] dark:border-[#5a4a95] dark:bg-white/[0.08] dark:text-white"
                      : "border-[#e4def6] bg-white text-[#6a628d] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/65"
                  }`}
                >
                  <span className="h-4 w-4 rounded-full border border-black/5" style={{ background: option.value }} />
                  {option.label}
                </button>
              ))}
            </div>
          </CustomizerSection>

          <CustomizerSection
            title="Material"
            isOpen={d20CustomizerSections.material}
            onToggle={() => toggleD20CustomizerSection("material")}
          >
            <div className="space-y-2">
              {D20_MATERIAL_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setD20Style((current) => applyD20MaterialPreset(current, preset.value))}
                  className={`w-full rounded-[1rem] border px-4 py-3 text-left transition ${
                    d20Style.finish === preset.value
                      ? "border-[#cbbcff] bg-[#f5f1ff] dark:border-[#5a4a95] dark:bg-white/[0.08]"
                      : "border-[#e4def6] bg-white dark:border-white/10 dark:bg-white/[0.03]"
                  }`}
                >
                  <p className="text-sm font-semibold text-[#4d4272] dark:text-white">{preset.label}</p>
                  <p className="mt-1 text-xs text-[#726a96] dark:text-white/55">{preset.description}</p>
                </button>
              ))}
            </div>
          </CustomizerSection>

          <button
            disabled={!canRoll}
            onClick={handleRoll}
            type="button"
            className="w-full rounded-2xl bg-[linear-gradient(180deg,#7c63f7_0%,#664cf1_100%)] py-4 text-base font-black tracking-wide text-white shadow-[0_12px_28px_rgba(111,87,246,0.3)] transition active:scale-[0.98] disabled:opacity-40 dark:bg-[linear-gradient(180deg,#c9bbff_0%,#9b87ff_100%)] dark:text-[#171127]"
          >
            {phase === "idle" ? `Roll D20 — ${UNIVERSAL_ROLL_CONFIG.cost} pts` : phase === "rolling" ? "Rolling…" : "Settling…"}
          </button>
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

          {resolution.kind === "bonus" ? (
            <div className="mt-4 rounded-[1.25rem] border border-[#e4dcff] bg-white/80 px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="mb-3 flex flex-wrap gap-2">
                {resolution.rolls.map((roll, index) => (
                  <span key={`${roll}-${index}`} className="rounded-full bg-[#ede8ff] px-3 py-1 text-xs font-bold text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]">
                    Bonus {index + 1}: {roll}
                  </span>
                ))}
              </div>
              <div className="space-y-2">
                {resolution.rewards.map((reward, index) => (
                  <div key={`${reward.roll}-${reward.label}-${index}`} className="flex items-center justify-between rounded-xl bg-[#f7f5ff] px-3 py-2 dark:bg-white/[0.03]">
                    <span className="text-sm font-semibold text-[#27304c] dark:text-white/75">Roll {reward.roll}</span>
                    <span className="text-sm text-[#5f6785] dark:text-white/55">{reward.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {resolution.kind === "swap" ? (
            <div className="mt-4 space-y-4 rounded-[1.25rem] border border-[#e4dcff] bg-white/80 px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
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
                      className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                        pendingSwapTargetCell === cell.cellNumber
                          ? "bg-[#6f57f6] text-white dark:bg-[#9b87ff] dark:text-[#171127]"
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
                        key={candidate.id}
                        type="button"
                        onClick={() => setPendingSwapPrizeId(candidate.id)}
                        className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                          pendingSwapPrizeId === candidate.id
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
                className="w-full rounded-xl bg-[#6f57f6] py-2 text-sm font-bold text-white disabled:opacity-40 dark:bg-[#9b87ff] dark:text-[#171127]"
              >
                Save board swap
              </button>
            </div>
          ) : null}

          {resolution.kind === "choose" ? (
            <div className="mt-4 space-y-4 rounded-[1.25rem] border border-[#e4dcff] bg-white/80 px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex flex-wrap gap-2">
                {chooseAnyCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setPendingChoosePrizeId(candidate.id)}
                    className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                      pendingChoosePrizeId === candidate.id
                        ? "bg-[#6f57f6] text-white dark:bg-[#9b87ff] dark:text-[#171127]"
                        : "bg-[#f4f1ff] text-[#6f57f6] dark:bg-white/[0.05] dark:text-[#cabfff]"
                    }`}
                  >
                    {candidate.name}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={!pendingChoosePrizeId}
                onClick={() => { void handleChooseAnyReward(); }}
                className="w-full rounded-xl bg-[#6f57f6] py-2 text-sm font-bold text-white disabled:opacity-40 dark:bg-[#9b87ff] dark:text-[#171127]"
              >
                Claim selected reward
              </button>
            </div>
          ) : null}

          {tasks.length > 0 && lastRoll !== null && resolution.kind === "final" ? (
            <div className="mt-4 rounded-xl bg-white/70 px-4 py-3 dark:bg-white/10">
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">Suggested Task</p>
              <p className="text-sm font-semibold text-[#27304c] dark:text-white/70">{tasks[(lastRoll - 1) % tasks.length].title}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="relative mb-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">Prize Board</p>
          <button
            type="button"
            onClick={() => setShowPrizeManager(true)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold bg-[#f5f1ff] text-[#6f57f6] transition hover:opacity-80 dark:bg-white/[0.06] dark:text-[#cabfff]"
          >
            Manage Prizes
          </button>
        </div>

        <div className="mb-6 grid grid-cols-4 gap-2">
          {board.map((cell) => {
            const isLit = lastRoll === cell.cellNumber;
            return (
              <div
                key={cell.cellNumber}
                className={`relative rounded-xl px-3 py-3 transition ${
                  isLit
                    ? "bg-[#6f57f6] text-white shadow-[0_0_20px_rgba(111,87,246,0.4)] dark:bg-[#9b87ff] dark:text-[#171127]"
                    : "bg-[#f7f5ff] dark:bg-white/5"
                }`}
              >
                <p className={`text-[10px] font-bold tabular-nums ${isLit ? "opacity-80" : "text-[#8e88a9] dark:text-white/40"}`}>
                  {cell.cellNumber}
                </p>
                <p className={`mt-1 text-[11px] font-semibold leading-tight ${isLit ? "text-white dark:text-[#171127]" : rewardTone(cell)}`}>
                  {cell.label}
                </p>
              </div>
            );
          })}
        </div>

        {history.length > 0 ? (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">Recent Rolls</p>
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
                            className="rounded-xl bg-[#6f57f6] px-4 py-2 text-sm font-bold text-white dark:bg-[#9b87ff] dark:text-[#171127]"
                          >
                            Save
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { void handleAddPoolPrize(); }}
                            className="rounded-xl bg-[#6f57f6] px-4 py-2 text-sm font-bold text-white dark:bg-[#9b87ff] dark:text-[#171127]"
                          >
                            Add
                          </button>
                        )}
                      </div>
                      {poolEditId ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPoolEditId(null);
                            setPoolName("");
                          }}
                          className="mt-2 text-xs font-semibold text-[#8e88a9] dark:text-white/40"
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
                        className="mt-3 rounded-xl bg-[#6f57f6] px-4 py-2 text-sm font-bold text-white dark:bg-[#9b87ff] dark:text-[#171127]"
                      >
                        Add all to {managerTier}
                      </button>
                    </section>
                  </>
                ) : (
                  <section className="rounded-[1.5rem] border border-[#ece8f8] bg-white p-4 shadow-[0_12px_30px_rgba(81,61,168,0.05)] dark:border-white/10 dark:bg-white/[0.03]">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">System master prizes</p>
                    <p className="text-sm text-[#5f6785] dark:text-white/60">
                      Master prizes are system-authored and read-only here.
                    </p>
                  </section>
                )}

                <section className="rounded-[1.5rem] border border-[#ece8f8] bg-white p-4 shadow-[0_12px_30px_rgba(81,61,168,0.05)] dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">
                    {managerTier[0].toUpperCase()}{managerTier.slice(1)} prizes
                  </p>
                  {managerTier === "master" ? (
                    masterPrizes.length === 0 ? (
                      <p className="text-sm text-[#8e88a9] dark:text-white/40">No master prizes found in the database yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {masterPrizes.map((prize) => (
                          <div key={prize.id} className="flex items-center justify-between rounded-xl bg-[#faf8ff] px-3 py-3 dark:bg-white/[0.03]">
                            <p className="text-sm font-semibold text-[#17203a] dark:text-white">{prize.name}</p>
                            <span className="text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40">
                              System
                            </span>
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
                              className="text-xs font-semibold text-[#6f57f6] dark:text-[#cabfff]"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => { void handleDeletePoolPrize(prize.id); }}
                              className="text-xs font-semibold text-red-500 dark:text-red-400"
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
                  className="flex-1 rounded-xl bg-[#6f57f6] py-2 text-sm font-bold text-white dark:bg-[#9b87ff] dark:text-[#171127]"
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
                    className="rounded-xl bg-[#e5e0f5] px-4 py-2 text-sm font-bold text-[#8e88a9] dark:bg-white/10 dark:text-white/50"
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
                          className="rounded-xl bg-[#6f57f6] px-3 py-1 text-xs font-bold text-white transition active:scale-95 disabled:opacity-40 dark:bg-[#9b87ff] dark:text-[#171127]"
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
                            className="text-xs font-semibold text-[#6f57f6] dark:text-[#cabfff]"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => { void handleDeleteVaultPrize(prize.id); }}
                            className="text-xs font-semibold text-red-500 dark:text-red-400"
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
