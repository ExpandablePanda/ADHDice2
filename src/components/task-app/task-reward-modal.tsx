"use client";

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { ErrorBoundary } from "../error-boundary";
import type { DicePhase } from "../dice-3d";
import { ModalShell } from "../modal-shell";
import {
  chunkDiceRolls,
  getPendingRewardDiceCount,
  type PendingTaskReward,
  type TaskRewardBankSession,
} from "@/lib/task-rewards";

const RewardDice3DCanvas = lazy(() => import("../dice-3d").then((module) => ({ default: module.RewardDice3DCanvas })));

type TaskRewardModalProps = {
  isDark: boolean;
  onClaim: () => Promise<TaskRewardBankSession | null>;
  onClose: () => void;
  pendingRewards: PendingTaskReward[];
  variant?: "global" | "table";
};

type RewardStage = "intro" | "batch_wait" | "batch_rolling" | "batch_revealed" | "result";

const BATCH_START_DELAY_MS = 1000;
const BASE_ROLL_DURATION_MS = 1500;
const BATCH_AUTO_ADVANCE_DELAY_MS = 2000;

function formatPendingDiceLabel(diceCount: number) {
  return `${diceCount} ${diceCount === 1 ? "die" : "dice"} ready`;
}

export function TaskRewardModal({
  isDark,
  onClaim,
  onClose,
  pendingRewards,
}: TaskRewardModalProps) {
  const [stage, setStage] = useState<RewardStage>("intro");
  const [batchIndex, setBatchIndex] = useState(0);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isAutoAdvancePaused, setIsAutoAdvancePaused] = useState(false);
  const [session, setSession] = useState<TaskRewardBankSession | null>(null);
  const pendingDiceCount = getPendingRewardDiceCount(pendingRewards);
  const previewBatches = chunkDiceRolls(Array.from({ length: pendingDiceCount }, () => 1), 6);

  const baseRollBatches = session?.baseRollBatches ?? previewBatches;
  const batchCount = baseRollBatches.length;
  const activeBatch = baseRollBatches[batchIndex] ?? [];
  const activeBatchNumber = batchCount === 0 ? 0 : batchIndex + 1;
  const breakdownEntries = useMemo(() =>
    (session?.resolutions ?? []).map((resolution) => ({
      baseExpression: resolution.baseRolls.join(" + "),
      claimTitle: resolution.claimRefs[0]?.title ?? resolution.tasks[0]?.title ?? "Completed task",
      finalPoints: resolution.finalPoints,
      multiplierRoll: resolution.multiplierRoll,
    })),
  [session]);
  const activeBatchSummary = useMemo(() => activeBatch.join(" + "), [activeBatch]);
  const totalDiceLabel = formatPendingDiceLabel(session?.diceCount ?? pendingDiceCount);
  const batchPhase: DicePhase = stage === "batch_rolling" ? "rolling" : stage === "batch_revealed" || stage === "result" ? "settling" : "idle";

  useEffect(() => {
    setSession(null);
    setStage("intro");
    setBatchIndex(0);
    setIsClaiming(false);
    setIsAutoAdvancePaused(false);
  }, [pendingRewards]);

  useEffect(() => {
    if (stage !== "batch_wait") {
      return;
    }

    const timeoutId = window.setTimeout(() => setStage("batch_rolling"), BATCH_START_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [stage]);

  useEffect(() => {
    if (stage !== "batch_rolling") {
      return;
    }

    const timeoutId = window.setTimeout(() => setStage("batch_revealed"), BASE_ROLL_DURATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [stage]);

  useEffect(() => {
    if (isAutoAdvancePaused) {
      return;
    }

    if (stage === "batch_revealed") {
      const timeoutId = window.setTimeout(() => {
        if (batchIndex + 1 < batchCount) {
          setBatchIndex((current) => current + 1);
          setStage("batch_wait");
          return;
        }
        setStage("result");
      }, BATCH_AUTO_ADVANCE_DELAY_MS);
      return () => window.clearTimeout(timeoutId);
    }

    if (stage === "result" && !isClaiming) {
      const timeoutId = window.setTimeout(() => {
        void handleClaim();
      }, BATCH_AUTO_ADVANCE_DELAY_MS);
      return () => window.clearTimeout(timeoutId);
    }
  }, [batchCount, batchIndex, isAutoAdvancePaused, isClaiming, stage]);

  async function startRewardRoll() {
    if (isClaiming) return;
    setIsClaiming(true);
    const authoritativeSession = await onClaim();
    setIsClaiming(false);
    if (!authoritativeSession) return;
    setSession(authoritativeSession);
    setBatchIndex(0);
    setIsAutoAdvancePaused(false);
    setStage("batch_wait");
  }

  async function handleClaim() {
    if (isClaiming) {
      return;
    }

    setIsClaiming(true);
    try {
      setIsClaiming(false);
      onClose();
    } catch (error) {
      setIsClaiming(false);
      throw error;
    }
  }

  return (
    <ModalShell
      className="h-[min(46rem,calc(100vh-2rem))] w-[min(64rem,calc(100vw-2rem))]"
      label="Task reward"
      onClose={onClose}
    >
      <div
        className="relative flex h-full w-full flex-col overflow-hidden rounded-[2rem] border border-[#ece8f8] bg-white/90 shadow-[0_30px_80px_rgba(81,61,168,0.16)] dark:border-white/10 dark:bg-[#171328]/94"
        onFocusCapture={() => {
          if (stage !== "intro") {
            setIsAutoAdvancePaused(true);
          }
        }}
        onPointerDownCapture={() => {
          if (stage !== "intro") {
            setIsAutoAdvancePaused(true);
          }
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#ece8f8] px-6 py-5 dark:border-white/10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e88a9] dark:text-white/35">Pending roll bank</p>
            <h2 className="mt-2 text-3xl font-black text-[#17203a] dark:text-white">{totalDiceLabel}</h2>
            <p className="mt-2 text-sm text-[#7d7698] dark:text-white/50">
              {pendingRewards.length} reward{pendingRewards.length === 1 ? "" : "s"} queued from completed tasks. Rolls animate in batches of up to 6 dice.
            </p>
          </div>
          <button
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f3f0ff] text-[#6f57f6] dark:bg-white/8 dark:text-white"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {stage === "intro" ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1rem] bg-white/80 px-4 py-4 text-center dark:bg-white/[0.05]">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e88a9] dark:text-white/35">Pending dice</p>
                  <p className="mt-2 text-3xl font-black text-[#17203a] dark:text-white">{session?.diceCount ?? pendingDiceCount}</p>
                </div>
                <div className="rounded-[1rem] bg-white/80 px-4 py-4 text-center dark:bg-white/[0.05]">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e88a9] dark:text-white/35">Visual batches</p>
                  <p className="mt-2 text-3xl font-black text-[#17203a] dark:text-white">{batchCount}</p>
                </div>
                <div className="rounded-[1rem] bg-white/80 px-4 py-4 text-center dark:bg-white/[0.05]">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e88a9] dark:text-white/35">Queued rewards</p>
                  <p className="mt-2 text-3xl font-black text-[#17203a] dark:text-white">{pendingRewards.length}</p>
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-[#ece7f5] bg-[#fbfaff] p-4 dark:border-white/10 dark:bg-white/[0.04]">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e88a9] dark:text-white/35">What will roll</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {pendingRewards.map((reward) => (
                    <div className="rounded-full bg-[#f1ecff] px-3 py-1 text-xs font-semibold text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]" key={`${reward.rewardDate}:${reward.claimRefs[0]?.taskId ?? reward.createdAt}:${reward.createdAt}`}>
                      {reward.claimRefs[0]?.title ?? reward.tasks[0]?.title ?? "Completed task"} · {reward.diceCount}d6
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-center">
                <button
                  className="ui-pill-button-strong-light"
                  disabled={isClaiming}
                  onClick={() => { void startRewardRoll(); }}
                  type="button"
                >
                  {isClaiming ? "Preparing roll..." : "Roll banked dice"}
                </button>
              </div>
            </div>
          ) : null}

          {stage === "batch_wait" || stage === "batch_rolling" || stage === "batch_revealed" ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e88a9] dark:text-white/35">Batch {activeBatchNumber} of {batchCount}</p>
                  <h3 className="mt-2 text-2xl font-black text-[#17203a] dark:text-white">
                    {stage === "batch_wait"
                      ? "Get ready..."
                      : stage === "batch_rolling"
                        ? "Rolling batch..."
                        : "Batch settled"}
                  </h3>
                </div>
                <div className="rounded-full bg-[#f1ecff] px-4 py-2 text-sm font-bold text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]">
                  {activeBatch.length} {activeBatch.length === 1 ? "die" : "dice"} on screen
                </div>
              </div>

              <div className="overflow-hidden rounded-[1.5rem] bg-[#f5f1ff] p-6 dark:bg-white/[0.02]">
                <ErrorBoundary fallback={<div className="h-[220px] w-full rounded-2xl bg-[#f0ecff] dark:bg-[#130e24]" />}>
                  <Suspense fallback={<div className="h-[220px] w-full rounded-2xl bg-[#f0ecff] dark:bg-[#130e24]" />}>
                    <RewardDice3DCanvas
                      dark={isDark}
                      height={320}
                      onSettled={() => {}}
                      phase={batchPhase}
                      results={activeBatch}
                      speedScale={0.94}
                    />
                  </Suspense>
                </ErrorBoundary>
                <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e88a9] dark:text-white/35">Batch dice</p>
                    <p className="mt-2 text-2xl font-black text-[#17203a] dark:text-white">
                      {stage === "batch_wait" || stage === "batch_rolling" ? "Rolling..." : activeBatchSummary}
                    </p>
                  </div>
                  {stage === "batch_revealed" ? (
                    <button
                      className="ui-pill-button-strong-light"
                      onClick={() => {
                        if (batchIndex + 1 < batchCount) {
                          setBatchIndex((current) => current + 1);
                          setStage("batch_wait");
                          return;
                        }
                        setStage("result");
                      }}
                      type="button"
                    >
                      {batchIndex + 1 < batchCount ? "Next batch now" : "Show totals now"}
                    </button>
                  ) : (
                    <div className="rounded-[1.2rem] border border-[#e1daf8] px-5 py-3 text-sm font-semibold text-[#9a90c2] dark:border-white/10 dark:text-white/35">
                      {isAutoAdvancePaused ? "Auto-advance paused while you inspect the roll." : "Next step starts automatically after the batch settles"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {stage === "result" ? (
            <div className="space-y-5">
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e88a9] dark:text-white/35">Final reward</p>
                <h3 className="mt-2 text-4xl font-black text-[#6f57f6] dark:text-[#cabfff]">{session?.totalFinalPoints ?? 0} points</h3>
                <p className="mt-2 text-sm text-[#7d7698] dark:text-white/50">
                  {session?.totalBasePoints ?? 0} base points across {session?.diceCount ?? 0} dice, with existing reward multipliers preserved per completed task.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1rem] bg-white/80 px-4 py-4 text-center dark:bg-white/[0.05]">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e88a9] dark:text-white/35">Base total</p>
                  <p className="mt-2 text-3xl font-black text-[#17203a] dark:text-white">{session?.totalBasePoints ?? 0}</p>
                </div>
                <div className="rounded-[1rem] bg-white/80 px-4 py-4 text-center dark:bg-white/[0.05]">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e88a9] dark:text-white/35">XP</p>
                  <p className="mt-2 text-3xl font-black text-[#17203a] dark:text-white">{session?.totalXp ?? 0}</p>
                </div>
                <div className="rounded-[1rem] bg-white/80 px-4 py-4 text-center dark:bg-white/[0.05]">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e88a9] dark:text-white/35">Tokens</p>
                  <p className="mt-2 text-3xl font-black text-[#17203a] dark:text-white">{session?.totalTokens ?? 0}</p>
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-[#ece7f5] bg-[#fbfaff] p-4 dark:border-white/10 dark:bg-white/[0.04]">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e88a9] dark:text-white/35">Reward breakdown</p>
                <div className="mt-3 space-y-2">
                  {breakdownEntries.map((entry, index) => (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1rem] bg-white/80 px-3 py-3 dark:bg-white/[0.05]" key={`${entry.claimTitle}-${index}`}>
                      <div>
                        <p className="text-sm font-bold text-[#17203a] dark:text-white">{entry.claimTitle}</p>
                        <p className="mt-1 text-xs text-[#7d7698] dark:text-white/50">
                          {entry.baseExpression} x {entry.multiplierRoll}
                        </p>
                      </div>
                      <div className="text-sm font-black text-[#6f57f6] dark:text-[#cabfff]">
                        {entry.finalPoints} pts
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-center">
                <button
                  className="ui-pill-button-strong-light disabled:opacity-60"
                  disabled={isClaiming}
                  onClick={() => { void handleClaim(); }}
                  type="button"
                >
                  {isClaiming ? "Claiming reward..." : isAutoAdvancePaused ? "Claim Reward" : "Claim reward now"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}
