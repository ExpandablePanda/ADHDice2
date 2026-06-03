"use client";

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ErrorBoundary } from "../error-boundary";
import type { DicePhase } from "../dice-3d";
import {
  buildTaskRewardResolution,
  TASK_REWARD_TIERS,
  type PendingTaskReward,
  type TaskRewardResolution,
} from "@/lib/task-rewards";

const RewardDice3DCanvas = lazy(() => import("../dice-3d").then((module) => ({ default: module.RewardDice3DCanvas })));

type TaskRewardModalProps = {
  isDark: boolean;
  onClaim: (resolution: TaskRewardResolution) => Promise<boolean>;
  pendingReward: PendingTaskReward;
  variant?: "global" | "table";
};

type RewardStage = "intro" | "base_rolling" | "base_revealed" | "multiplier_rolling" | "multiplier_revealed" | "result";
const BASE_ROLL_DURATION_MS = 1500;
const MULTIPLIER_ROLL_DURATION_MS = 1750;
const REWARD_STEP_COUNT = 4;

function rewardTierClass(selected: boolean, disabled: boolean) {
  if (selected) {
    return "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]";
  }

  if (disabled) {
    return "border-[#ece7f5] bg-[#f7f5fb] text-[#9a93b4] opacity-60 dark:border-white/8 dark:bg-white/[0.045] dark:text-white/34";
  }

  return "border-[#ece7f5] bg-[#f7f5fb] text-[#7a7592] dark:border-white/8 dark:bg-white/[0.045] dark:text-white/58";
}

function getRewardStepIndex(stage: RewardStage) {
  if (stage === "intro") {
    return 0;
  }
  if (stage === "base_rolling" || stage === "base_revealed") {
    return 1;
  }
  if (stage === "multiplier_rolling" || stage === "multiplier_revealed") {
    return 2;
  }
  return 3;
}

export function TaskRewardModal({
  isDark,
  onClaim,
  pendingReward,
  variant = "global",
}: TaskRewardModalProps) {
  const [resolution, setResolution] = useState<TaskRewardResolution | null>(null);
  const [stage, setStage] = useState<RewardStage>("intro");
  const [isClaiming, setIsClaiming] = useState(false);

  const basePhase: DicePhase = stage === "base_rolling" ? "rolling" : stage === "base_revealed" || stage === "multiplier_rolling" || stage === "multiplier_revealed" || stage === "result" ? "settling" : "idle";
  const multiplierPhase: DicePhase = stage === "multiplier_rolling" ? "rolling" : stage === "multiplier_revealed" || stage === "result" ? "settling" : "idle";
  const tier = pendingReward.tier;
  const selectedTierId = tier?.id ?? null;
  const baseRolls = resolution?.baseRolls ?? [];
  const multiplierRolls = resolution ? [resolution.multiplierRoll] : [];
  const baseRollSummary = useMemo(() => baseRolls.join(" + "), [baseRolls]);
  const activeStepIndex = getRewardStepIndex(stage);

  useEffect(() => {
    if (stage !== "base_rolling" && stage !== "multiplier_rolling") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStage((current) => {
        if (current === "base_rolling") {
          return "base_revealed";
        }
        if (current === "multiplier_rolling") {
          return "multiplier_revealed";
        }
        return current;
      });
    }, stage === "base_rolling" ? BASE_ROLL_DURATION_MS : MULTIPLIER_ROLL_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [stage]);

  function startRewardRoll() {
    const nextResolution = buildTaskRewardResolution(pendingReward);
    setResolution(nextResolution);
    setStage("base_rolling");
  }

  async function handleClaim() {
    if (!resolution || isClaiming) {
      return;
    }

    setIsClaiming(true);
    const claimed = await onClaim(resolution);
    if (!claimed) {
      setIsClaiming(false);
    }
  }

  const rootClassName = variant === "table"
    ? "absolute inset-0 bg-white/36 backdrop-blur-md dark:bg-[#0f0b1d]/52"
    : "fixed inset-x-3 bottom-24 top-[8.75rem] z-[140] bg-white/36 backdrop-blur-md sm:inset-x-5 sm:top-[8.5rem] lg:inset-x-8 lg:top-[8.25rem] dark:bg-[#0f0b1d]/52";

  return (
    <div className={rootClassName}>
      <div
        aria-label="Task reward"
        aria-modal="true"
        className="relative flex h-full w-full flex-col overflow-hidden rounded-[2rem] border border-[#ece8f8] bg-white/90 shadow-[0_30px_80px_rgba(81,61,168,0.16)] dark:border-white/10 dark:bg-[#171328]/94"
        role="dialog"
      >
        <div className="min-h-0 flex-1 overflow-hidden">
          <div
            className="flex h-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ transform: `translateX(-${activeStepIndex * (100 / REWARD_STEP_COUNT)}%)`, width: `${REWARD_STEP_COUNT * 100}%` }}
          >
            <section className="h-full w-full shrink-0 overflow-y-auto px-6 py-6" style={{ width: `${100 / REWARD_STEP_COUNT}%` }}>
              {pendingReward.mode === "single" ? (
                <div>
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <h2 className="text-3xl font-black text-[#17203a] dark:text-white">
                      Task Completion Reward Roll
                    </h2>
                    <div className="flex items-center gap-2 pt-1">
                      {Array.from({ length: REWARD_STEP_COUNT }, (_, index) => (
                        <div
                          className={`h-2.5 w-10 rounded-full transition-colors ${index <= activeStepIndex ? "bg-[#7a63f7] dark:bg-[#cabfff]" : "bg-[#e8e2fb] dark:bg-white/12"}`}
                          key={index}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="-mx-1 flex items-stretch gap-2 overflow-x-auto px-1 pb-1">
                    {TASK_REWARD_TIERS.map((candidateTier) => {
                      const selected = candidateTier.id === selectedTierId;
                      return (
                        <div
                          className={`min-w-[9.5rem] shrink-0 rounded-[1rem] border px-4 py-3 text-sm font-semibold ${rewardTierClass(selected, !selected)}`}
                          key={candidateTier.id}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span>{candidateTier.label}</span>
                            <span>{candidateTier.diceCount}d6</span>
                          </div>
                        </div>
                      );
                    })}
                    <button
                      className="shrink-0 rounded-[1.35rem] bg-[linear-gradient(180deg,#7c63f7_0%,#664cf1_100%)] px-6 py-3.5 text-sm font-black text-white shadow-[0_18px_36px_rgba(111,87,246,0.24)] dark:bg-[linear-gradient(180deg,#c9bbff_0%,#9b87ff_100%)] dark:text-[#171127]"
                      onClick={startRewardRoll}
                      type="button"
                    >
                      Roll For Points
                    </button>
                  </div>
                  <p className="mt-4 text-xs text-[#8e88a9] dark:text-white/40">
                    Current streak: {pendingReward.streakLength} day{pendingReward.streakLength === 1 ? "" : "s"}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e88a9] dark:text-white/35">Batch reward</p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-[#7d7698] dark:text-white/50">Newly completed tasks</p>
                      <p className="mt-1 text-4xl font-black text-[#17203a] dark:text-white">{pendingReward.tasks.length}</p>
                    </div>
                    <div className="rounded-full bg-[#f1ecff] px-5 py-3 text-sm font-bold text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]">
                      Roll {pendingReward.diceCount}d6, then 1 multiplier d6
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="h-full w-full shrink-0 overflow-y-auto px-6 py-6" style={{ width: `${100 / REWARD_STEP_COUNT}%` }}>
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e88a9] dark:text-white/35">Base die</p>
                    <h3 className="mt-2 text-2xl font-black text-[#17203a] dark:text-white">
                      {stage === "base_rolling" ? "Rolling for points..." : "Base points locked in"}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    {Array.from({ length: REWARD_STEP_COUNT }, (_, index) => (
                      <div
                        className={`h-2.5 w-10 rounded-full transition-colors ${index <= activeStepIndex ? "bg-[#7a63f7] dark:bg-[#cabfff]" : "bg-[#e8e2fb] dark:bg-white/12"}`}
                        key={index}
                      />
                    ))}
                  </div>
                </div>
                <div className="mt-5 flex justify-center">
                  <div className="w-full max-w-[44rem] overflow-hidden rounded-[1.5rem] bg-[#f5f1ff] p-4 dark:bg-white/[0.02]">
                    <ErrorBoundary fallback={<div className="h-[220px] w-full rounded-2xl bg-[#f0ecff] dark:bg-[#130e24]" />}>
                      <Suspense fallback={<div className="h-[220px] w-full rounded-2xl bg-[#f0ecff] dark:bg-[#130e24]" />}>
                        <RewardDice3DCanvas
                          dark={isDark}
                          height={220}
                          onSettled={() => {}}
                          phase={basePhase}
                          results={baseRolls}
                          speedScale={0.94}
                        />
                      </Suspense>
                    </ErrorBoundary>
                    <div className="mt-4 flex flex-wrap items-end justify-center gap-5">
                      <div className="flex items-end justify-center gap-6 text-center">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e88a9] dark:text-white/35">Base die</p>
                          <p className="mt-2 text-2xl font-black text-[#17203a] dark:text-white">
                            {stage === "base_rolling" ? "Rolling..." : baseRollSummary}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e88a9] dark:text-white/35">Base points</p>
                          <p className="mt-2 text-2xl font-black text-[#17203a] dark:text-white">
                            {resolution?.basePoints ?? "?"}
                          </p>
                        </div>
                      </div>
                      {stage === "base_revealed" && resolution ? (
                        <button
                          className="rounded-[1.2rem] bg-[#6f57f6] px-5 py-3 text-sm font-black text-white dark:bg-[#cabfff] dark:text-[#171127]"
                          onClick={() => setStage("multiplier_rolling")}
                          type="button"
                        >
                          Roll Multiplier
                        </button>
                      ) : (
                        <div className="rounded-[1.2rem] border border-[#e1daf8] px-5 py-3 text-sm font-semibold text-[#9a90c2] dark:border-white/10 dark:text-white/35">
                          Multiplier unlocks after the base roll settles
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="h-full w-full shrink-0 overflow-y-auto px-6 py-6" style={{ width: `${100 / REWARD_STEP_COUNT}%` }}>
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e88a9] dark:text-white/35">Multiplier die</p>
                    <h3 className="mt-2 text-2xl font-black text-[#17203a] dark:text-white">
                      {stage === "multiplier_rolling" ? "Rolling multiplier..." : "Multiplier locked in"}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    {Array.from({ length: REWARD_STEP_COUNT }, (_, index) => (
                      <div
                        className={`h-2.5 w-10 rounded-full transition-colors ${index <= activeStepIndex ? "bg-[#7a63f7] dark:bg-[#cabfff]" : "bg-[#e8e2fb] dark:bg-white/12"}`}
                        key={index}
                      />
                    ))}
                  </div>
                </div>
                <div className="mt-5 flex justify-center">
                  <div className="w-full max-w-[44rem] overflow-hidden rounded-[1.5rem] bg-[#f5f1ff] p-4 dark:bg-white/[0.02]">
                    <ErrorBoundary fallback={<div className="h-[220px] w-full rounded-2xl bg-[#f0ecff] dark:bg-[#130e24]" />}>
                      <Suspense fallback={<div className="h-[220px] w-full rounded-2xl bg-[#f0ecff] dark:bg-[#130e24]" />}>
                        <RewardDice3DCanvas
                          dark={isDark}
                          height={220}
                          onSettled={() => {}}
                          phase={multiplierPhase}
                          results={multiplierRolls}
                          speedScale={0.78}
                        />
                      </Suspense>
                    </ErrorBoundary>
                    <div className="mt-4 flex flex-wrap items-end justify-center gap-5">
                      <div className="flex items-end justify-center gap-6 text-center">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e88a9] dark:text-white/35">Multiplier die</p>
                          <p className="mt-2 text-2xl font-black text-[#17203a] dark:text-white">
                            {stage === "multiplier_rolling" ? "Rolling..." : `x${resolution?.multiplierRoll ?? "?"}`}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e88a9] dark:text-white/35">Base points</p>
                          <p className="mt-2 text-2xl font-black text-[#17203a] dark:text-white">
                            {resolution?.basePoints ?? "?"}
                          </p>
                        </div>
                      </div>
                      {stage === "multiplier_revealed" ? (
                        <button
                          className="rounded-[1.2rem] bg-[#6f57f6] px-5 py-3 text-sm font-black text-white dark:bg-[#cabfff] dark:text-[#171127]"
                          onClick={() => setStage("result")}
                          type="button"
                        >
                          Continue To Final Points
                        </button>
                      ) : (
                        <div className="rounded-[1.2rem] border border-[#e1daf8] px-5 py-3 text-sm font-semibold text-[#9a90c2] dark:border-white/10 dark:text-white/35">
                          Final points appear after the multiplier lands
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="h-full w-full shrink-0 overflow-y-auto px-6 py-6" style={{ width: `${100 / REWARD_STEP_COUNT}%` }}>
              {stage === "result" && resolution ? (
                <div className="space-y-5">
                  <div className="text-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e88a9] dark:text-white/35">Final reward</p>
                    <h3 className="mt-2 text-4xl font-black text-[#6f57f6] dark:text-[#cabfff]">{resolution.finalPoints} points</h3>
                    <p className="mt-2 text-sm text-[#7d7698] dark:text-white/50">
                      {resolution.basePoints} base points x {resolution.multiplierRoll} multiplier
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[1rem] bg-white/80 px-4 py-4 text-center dark:bg-white/[0.05]">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e88a9] dark:text-white/35">Base dice</p>
                      <p className="mt-2 text-xl font-black text-[#17203a] dark:text-white">{resolution.baseRolls.join(" + ")}</p>
                    </div>
                    <div className="rounded-[1rem] bg-white/80 px-4 py-4 text-center dark:bg-white/[0.05]">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e88a9] dark:text-white/35">XP</p>
                      <p className="mt-2 text-3xl font-black text-[#17203a] dark:text-white">{resolution.xp}</p>
                    </div>
                    <div className="rounded-[1rem] bg-white/80 px-4 py-4 text-center dark:bg-white/[0.05]">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e88a9] dark:text-white/35">Tokens</p>
                      <p className="mt-2 text-3xl font-black text-[#17203a] dark:text-white">{resolution.awardedTokens}</p>
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <button
                      className="rounded-[1.35rem] bg-[linear-gradient(180deg,#7c63f7_0%,#664cf1_100%)] px-6 py-3.5 text-sm font-black text-white shadow-[0_18px_36px_rgba(111,87,246,0.24)] disabled:opacity-60 dark:bg-[linear-gradient(180deg,#c9bbff_0%,#9b87ff_100%)] dark:text-[#171127]"
                      disabled={isClaiming}
                      onClick={() => { void handleClaim(); }}
                      type="button"
                    >
                      {isClaiming ? "Claiming reward..." : "Claim Reward"}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
