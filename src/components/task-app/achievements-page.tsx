"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Star, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { EconomyState } from "@/hooks/useEconomy";
import {
  ACHIEVEMENT_SET_META,
  type AchievementFaceLevel,
  type AchievementSetSummary,
  type AchievementUnlockRecord,
} from "@/lib/achievements";

import { DieFaceTile } from "./achievement-dice-ui";
import { PageShellHeader } from "./page-shell-header";

type AchievementsPageProps = {
  chargedSetCount: number;
  completionPercent: number;
  currentStreak: number;
  economy: EconomyState;
  latestUnlock: AchievementUnlockRecord | null;
  nextSet: AchievementSetSummary | null;
  setSummaries: AchievementSetSummary[];
  storageMode: "local" | "remote";
  totalFaces: number;
  unlockedFaceCount: number;
};

type AchievementCelebrationOverlayProps = {
  onDismiss: () => void;
  unlock: AchievementUnlockRecord | null;
};

const pageReveal = {
  animate: { opacity: 1, y: 0 },
  initial: { opacity: 0, y: 20 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
};

export function AchievementsPage({
  chargedSetCount,
  completionPercent,
  currentStreak,
  economy,
  latestUnlock,
  nextSet,
  setSummaries,
  storageMode,
  totalFaces,
  unlockedFaceCount,
}: AchievementsPageProps) {
  const [activeSetId, setActiveSetId] = useState(setSummaries[0]?.id ?? "momentum");
  const activeSet = useMemo(
    () => setSummaries.find((setSummary) => setSummary.id === activeSetId) ?? setSummaries[0] ?? null,
    [activeSetId, setSummaries],
  );

  return (
    <section className="px-4 pb-32">
      <PageShellHeader subtitle="Dice Codex" title="Achievements" />

      <motion.div
        {...pageReveal}
        className="relative overflow-hidden rounded-[2rem] border border-[#e4e9fb] bg-[radial-gradient(circle_at_top_left,rgba(120,155,255,0.24),transparent_38%),radial-gradient(circle_at_top_right,rgba(255,128,105,0.18),transparent_35%),linear-gradient(135deg,#f7fbff_0%,#fcfbff_48%,#fff4eb_100%)] p-5 shadow-[0_28px_80px_rgba(59,91,187,0.16)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_left,rgba(91,141,239,0.28),transparent_42%),radial-gradient(circle_at_top_right,rgba(255,122,89,0.18),transparent_34%),linear-gradient(135deg,rgba(18,22,40,0.96)_0%,rgba(18,18,38,0.98)_44%,rgba(35,24,30,0.98)_100%)]"
      >
        <div className="absolute inset-x-0 top-0 h-28 bg-[linear-gradient(180deg,rgba(255,255,255,0.38),transparent)] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4b5d8c] shadow-[0_8px_22px_rgba(69,88,156,0.1)] backdrop-blur dark:border-white/10 dark:bg-white/[0.06] dark:text-white/70">
              <Sparkles className="h-3.5 w-3.5" />
              Dice-face collection
            </div>
            <h2 className="mt-4 text-[clamp(2rem,4vw,3.8rem)] font-black leading-[0.94] tracking-[-0.04em] text-[#16233f] dark:text-white">
              Build a cabinet of faces that feels like your momentum, not somebody else’s trophy shelf.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5c6988] dark:text-white/65">
              Every set tracks a different kind of strength: momentum, courage, follow-through, focus, recovery, and care.
              Finish all six faces in a set to charge the whole die.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <HeroChip label="Latest unlock" value={latestUnlock ? latestUnlock.title : "Still charging"} />
              <HeroChip label="Current streak" value={`${currentStreak} day${currentStreak === 1 ? "" : "s"}`} />
              <HeroChip label="Charged dice" value={`${chargedSetCount} / 6`} />
              <HeroChip label="Sync mode" value={storageMode === "remote" ? "Cloud" : "Local"} />
            </div>
          </div>

          <div className="w-full max-w-[24rem] rounded-[1.8rem] border border-white/70 bg-white/76 p-4 shadow-[0_18px_48px_rgba(61,88,168,0.16)] backdrop-blur dark:border-white/10 dark:bg-white/[0.06]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6b7393] dark:text-white/45">
                  Collection
                </p>
                <p className="mt-1 text-4xl font-black text-[#16233f] dark:text-white">{completionPercent}%</p>
                <p className="mt-1 text-sm text-[#69748f] dark:text-white/55">
                  {unlockedFaceCount} of {totalFaces} faces lit
                </p>
              </div>
              <DieFaceTile accent="#5b8def" face={Math.min(6, Math.max(1, chargedSetCount || 1)) as AchievementFaceLevel} glow size="md" />
            </div>

            <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#dde7ff] dark:bg-white/10">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#5b8def_0%,#7c65f6_48%,#ff855f_100%)] transition-[width] duration-500"
                style={{ width: `${completionPercent}%` }}
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <HeroStat detail="current level" value={`Lvl ${economy.level}`} />
              <HeroStat detail="xp" value={`${economy.xp}`} />
              <HeroStat detail="next charge" value={nextSet ? `${nextSet.unlockedCount}/6` : "6/6"} />
            </div>
          </div>
        </div>
      </motion.div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(22rem,0.85fr)]">
        <motion.div {...pageReveal} transition={{ ...pageReveal.transition, delay: 0.05 }} className="rounded-[2rem] border border-[#e7ebfb] bg-white/90 p-4 shadow-[0_18px_55px_rgba(70,83,134,0.08)] dark:border-white/10 dark:bg-white/[0.05]">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8890ab] dark:text-white/40">Sets</p>
              <h3 className="mt-1 text-2xl font-black text-[#1c2744] dark:text-white">Choose a die to inspect</h3>
            </div>
            {nextSet ? (
              <div className="rounded-full bg-[#f2f6ff] px-3 py-1 text-xs font-semibold text-[#5676b6] dark:bg-white/8 dark:text-white/65">
                Closest to charged: {nextSet.title}
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {setSummaries.map((setSummary, index) => (
              <button
                className={`group relative overflow-hidden rounded-[1.6rem] border px-4 py-4 text-left transition hover:-translate-y-0.5 ${
                  activeSet?.id === setSummary.id
                    ? "border-transparent shadow-[0_22px_55px_rgba(75,102,191,0.18)]"
                    : "border-[#e7ebfb] bg-[#fcfdff] hover:border-[#ccd8ff] dark:border-white/10 dark:bg-white/[0.03]"
                }`}
                key={setSummary.id}
                onClick={() => setActiveSetId(setSummary.id)}
                style={activeSet?.id === setSummary.id ? {
                  backgroundImage: `linear-gradient(135deg,${setSummary.isCharged ? `${ACHIEVEMENT_SET_META[setSummary.id].accent}22` : "#fcfdff"} 0%,rgba(255,255,255,0.98) 72%)`,
                } : undefined}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8992a8] dark:text-white/40">
                      Set {String(index + 1).padStart(2, "0")}
                    </p>
                    <h4 className="mt-1 text-xl font-black text-[#213050] dark:text-white">{setSummary.title}</h4>
                    <p className="mt-2 text-sm leading-6 text-[#6f7993] dark:text-white/58">{setSummary.description}</p>
                  </div>
                  <DieFaceTile accent={ACHIEVEMENT_SET_META[setSummary.id].accent} face={Math.max(1, setSummary.unlockedCount || 1) as AchievementFaceLevel} glow={setSummary.isCharged} size="sm" />
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#55678f] dark:text-white/55">
                    <Star className="h-3.5 w-3.5" />
                    {setSummary.unlockedCount} / 6 faces
                  </div>
                  <div className={`rounded-full px-3 py-1 text-xs font-semibold ${setSummary.isCharged ? "bg-[#10264b] text-white dark:bg-white dark:text-[#10264b]" : "bg-[#eef4ff] text-[#4d6daa] dark:bg-white/8 dark:text-white/65"}`}>
                    {setSummary.isCharged ? "Charged" : setSummary.nextFace ? `Next: ${setSummary.nextFace.definition.title}` : "Complete"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div {...pageReveal} transition={{ ...pageReveal.transition, delay: 0.1 }} className="rounded-[2rem] border border-[#e7ebfb] bg-white/90 p-4 shadow-[0_18px_55px_rgba(70,83,134,0.08)] dark:border-white/10 dark:bg-white/[0.05]">
          {activeSet ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8992a8] dark:text-white/40">
                    {activeSet.isCharged ? "Charged set" : "Set detail"}
                  </p>
                  <h3 className="mt-1 text-2xl font-black text-[#213050] dark:text-white">{activeSet.title}</h3>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-[#6f7993] dark:text-white/58">{activeSet.description}</p>
                </div>
                <ChargedDieBadge accent={ACHIEVEMENT_SET_META[activeSet.id].accent} isCharged={activeSet.isCharged} />
              </div>

              <div className="mt-5 space-y-3">
                {activeSet.faces.map((face) => (
                  <div
                    className={`rounded-[1.5rem] border px-4 py-4 transition ${
                      face.isUnlocked
                        ? "border-[#dce7ff] bg-[linear-gradient(135deg,#fdfefe_0%,#f5f9ff_100%)] dark:border-white/10 dark:bg-white/[0.05]"
                        : "border-dashed border-[#d8dff5] bg-[#fbfcff] dark:border-white/10 dark:bg-white/[0.025]"
                    }`}
                    key={face.definition.id}
                  >
                    <div className="flex items-start gap-4">
                      <DieFaceTile
                        accent={ACHIEVEMENT_SET_META[activeSet.id].accent}
                        face={face.definition.face}
                        glow={face.isUnlocked}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9097ad] dark:text-white/40">
                              Face {face.definition.face}
                            </p>
                            <h4 className="mt-1 text-lg font-black text-[#213050] dark:text-white">
                              {face.isSecret && !face.isUnlocked ? "Secret Face" : face.definition.title}
                            </h4>
                          </div>
                          <div className={`rounded-full px-3 py-1 text-xs font-semibold ${face.isUnlocked ? "bg-[#eef6f2] text-[#248465] dark:bg-[#173424] dark:text-[#99dfbb]" : "bg-[#eef3ff] text-[#627199] dark:bg-white/8 dark:text-white/55"}`}>
                            {face.isUnlocked ? `${face.definition.rewardXp} XP${face.definition.rewardXp === 0 ? " display" : ""}` : face.detail}
                          </div>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#6f7993] dark:text-white/58">
                          {face.isSecret && !face.isUnlocked ? "This one stays blurred until you surprise yourself with it." : face.definition.description}
                        </p>
                        <p className="mt-2 text-sm font-medium text-[#46608e] dark:text-[#d5dbff]">
                          {face.isUnlocked ? face.definition.encouragement : face.detail}
                        </p>
                        {!face.isUnlocked ? (
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e7eefc] dark:bg-white/10">
                            <div
                              className="h-full rounded-full bg-[linear-gradient(90deg,#5b8def_0%,#7c65f6_52%,#ff855f_100%)]"
                              style={{ width: `${Math.min(100, Math.round((face.current / face.target) * 100))}%` }}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </motion.div>
      </div>
    </section>
  );
}

export function AchievementCelebrationOverlay({
  onDismiss,
  unlock,
}: AchievementCelebrationOverlayProps) {
  useEffect(() => {
    if (!unlock) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      onDismiss();
    }, 4200);

    return () => window.clearTimeout(timeoutId);
  }, [onDismiss, unlock]);

  return (
    <AnimatePresence>
      {unlock ? (
        <motion.div
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="pointer-events-none fixed inset-x-4 bottom-24 z-[160] flex justify-center sm:bottom-28"
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
        >
          <div className="pointer-events-auto w-full max-w-xl overflow-hidden rounded-[1.9rem] border border-[#dbe6ff] bg-[linear-gradient(135deg,rgba(247,250,255,0.98),rgba(255,245,238,0.98))] shadow-[0_28px_85px_rgba(62,82,143,0.28)] dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(18,25,45,0.98),rgba(36,25,33,0.98))]">
            <div className="flex items-center gap-4 p-4">
              <div className="relative">
                <DieFaceTile
                  accent={ACHIEVEMENT_SET_META[unlock.setCode].accent}
                  face={(unlock.face ?? 6) as AchievementFaceLevel}
                  glow
                  size="md"
                />
                <motion.div
                  animate={{ opacity: [0.35, 0.95, 0.35], rotate: [0, 16, 0] }}
                  className="absolute -right-1 -top-1 rounded-full bg-white p-1 text-[#ff7a59] shadow-[0_8px_18px_rgba(255,122,89,0.25)]"
                  transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY }}
                >
                  {unlock.kind === "charged_die" ? <Zap className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                </motion.div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#6d7594] dark:text-white/45">
                  {unlock.kind === "charged_die" ? "Charged die unlocked" : "Face unlocked"}
                </p>
                <h3 className="mt-1 text-2xl font-black text-[#182544] dark:text-white">{unlock.title}</h3>
                <p className="mt-1 text-sm leading-6 text-[#69748f] dark:text-white/62">{unlock.encouragement}</p>
              </div>
              <button
                className="rounded-full bg-[#eef3ff] px-3 py-2 text-sm font-semibold text-[#536fa8] dark:bg-white/10 dark:text-white/70"
                onClick={onDismiss}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function HeroChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-white/60 bg-white/72 px-3 py-1.5 text-sm text-[#5f6c89] shadow-[0_8px_20px_rgba(59,91,187,0.08)] backdrop-blur dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70">
      <span className="font-semibold text-[#1b2747] dark:text-white">{value}</span>
      <span className="ml-2 text-xs uppercase tracking-[0.18em] text-[#8390ad] dark:text-white/40">{label}</span>
    </div>
  );
}

function HeroStat({ detail, value }: { detail: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] bg-[#f2f6ff] px-3 py-3 text-center dark:bg-white/[0.04]">
      <p className="text-xl font-black text-[#182544] dark:text-white">{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8390ad] dark:text-white/40">{detail}</p>
    </div>
  );
}

function ChargedDieBadge({
  accent,
  isCharged,
}: {
  accent: string;
  isCharged: boolean;
}) {
  return (
    <div
      className={`relative flex h-20 w-20 items-center justify-center rounded-[1.8rem] border ${
        isCharged ? "border-transparent shadow-[0_18px_40px_rgba(74,102,179,0.2)]" : "border-[#dbe3fb] bg-[#f9fbff] dark:border-white/10 dark:bg-white/[0.04]"
      }`}
      style={isCharged ? { background: `linear-gradient(135deg,${accent} 0%,#ffffff 110%)` } : undefined}
    >
      <div className={`absolute inset-2 rounded-[1.3rem] ${isCharged ? "bg-white/88" : "bg-white dark:bg-white/[0.03]"}`} />
      <div className="relative">
        <DieFaceTile accent={accent} face={6} glow={isCharged} size="sm" />
      </div>
    </div>
  );
}
