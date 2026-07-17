"use client";

import { Trophy } from "lucide-react";
import { useEffect, useMemo, useReducer, useState } from "react";
import { TaskTableChipButton } from "@/components/ui/task-table-primitives";
import { useTrophyCaseSettings } from "@/hooks/useTrophyCaseSettings";
import type { Milestone, Task } from "@/lib/database.types";
import { formatMilestoneDisplayDate, type MilestoneAuraKind, type MilestoneTier } from "@/lib/milestones";
import {
  adaptCurrentlyEarnedTrophies,
  classifyTrophyRendererError,
  countEarnedTrophies,
  detectWebGL2Support,
  filterAndSortTrophies,
  getReducedMotionPolicy,
  getTrophyTierImageAlt,
  hydrateTrophyRendererFailureState,
  isLikelyWebGLRendererCreationError,
  persistTrophyRendererFailureState,
  resolveTrophyQualityProfile,
  resolveTrophyRendererFallbackReason,
  toggleSingleTrophyFilter,
  TROPHY_GALLERY_AURAS,
  TROPHY_GALLERY_TIERS,
  trophyRendererFailureReducer,
  type EarnedTrophy,
  type TrophyRendererFailureState,
  type TrophyRendererFallbackReason,
} from "@/lib/trophy-case";
import { TrophyCaseErrorBoundary } from "./trophy-case-error-boundary";
import { TrophyCaseRendererLoader } from "./trophy-case-renderer-loader";

const AURA_LABELS: Record<MilestoneAuraKind, string> = { diamond: "Diamond Aura", none: "No Aura", standard: "Standard Aura" };
const TROPHY_RENDERER_APP_VERSION = "6.29.36";
const FAILURE_SESSION_PREFIX = "adhdice:trophy-gallery:renderer-failures:v2";

function rendererFailureSessionKey(userId: string) {
  return `${FAILURE_SESSION_PREFIX}:${userId}:${TROPHY_RENDERER_APP_VERSION}`;
}

function readRendererFailureState(userId: string): TrophyRendererFailureState {
  if (typeof window === "undefined") return hydrateTrophyRendererFailureState(null, userId, TROPHY_RENDERER_APP_VERSION);
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(rendererFailureSessionKey(userId)) ?? "null");
    return hydrateTrophyRendererFailureState(value, userId, TROPHY_RENDERER_APP_VERSION);
  } catch { return hydrateTrophyRendererFailureState(null, userId, TROPHY_RENDERER_APP_VERSION); }
}

function fallbackMessage(reason: TrophyRendererFallbackReason) {
  if (reason === "explicit-static") return "Live trophy rendering is disabled. Static trophy previews are shown.";
  if (reason === "detection-failed") return "Live trophy rendering is unavailable in this browser session. Static previews remain available.";
  return "Live trophy rendering stopped unexpectedly. Static previews remain available.";
}

export function TrophyGalleryWorkspace({ lowStimulation, milestones, onOpenTask, tasks, userId }: {
  lowStimulation: boolean;
  milestones: Milestone[];
  onOpenTask: (taskId: string) => void;
  tasks: Task[];
  userId: string | null;
}) {
  const rendererUserId = userId ?? "guest";
  const { settings, updateSettings } = useTrophyCaseSettings(userId);
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [webGLSupported, setWebGLSupported] = useState<boolean | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<MilestoneTier, string> | null>(null);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [renderer, dispatchRenderer] = useReducer(trophyRendererFailureReducer, undefined, () => readRendererFailureState(rendererUserId));
  const trophies = useMemo(() => adaptCurrentlyEarnedTrophies(milestones, tasks), [milestones, tasks]);
  const counts = useMemo(() => countEarnedTrophies(trophies), [trophies]);
  const filtered = useMemo(() => filterAndSortTrophies(trophies, {
    auras: new Set(settings.auraFilters),
    search,
    tiers: new Set(settings.tierFilters),
  }, settings.sort), [search, settings.auraFilters, settings.sort, settings.tierFilters, trophies]);
  const profile = useMemo(() => resolveTrophyQualityProfile(settings.quality, typeof window === "undefined" ? {} : {
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    devicePixelRatio: window.devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency,
    viewportWidth: window.innerWidth,
  }), [settings.quality]);
  const osReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const motionPolicy = getReducedMotionPolicy(osReducedMotion, lowStimulation);
  const fallbackReason = resolveTrophyRendererFallbackReason({ explicitStatic: settings.renderMode === "static", runtimeReason: renderer.fallbackReason, webGLSupported });
  const useStaticTotals = fallbackReason !== "none";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setWebGLSupported(detectWebGL2Support()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let active = true;
    void import("./trophy-thumbnail-generator").then(({ getTierTrophyThumbnails }) => getTierTrophyThumbnails()).then((images) => {
      if (active) setThumbnails(images);
    }).catch(() => {
      if (active) setThumbnailFailed(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    try { window.sessionStorage.setItem(rendererFailureSessionKey(rendererUserId), JSON.stringify(persistTrophyRendererFailureState(renderer, rendererUserId, TROPHY_RENDERER_APP_VERSION))); } catch { /* crash protection is best effort */ }
  }, [renderer, rendererUserId]);

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isLikelyWebGLRendererCreationError(event.reason)) return;
      event.preventDefault();
      dispatchRenderer({ at: new Date().toISOString(), reason: "renderer-error", type: "fail" });
    };
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  }, []);

  function selectTier(tier: MilestoneTier) {
    updateSettings({ tierFilters: toggleSingleTrophyFilter(settings.tierFilters, tier) });
  }

  function selectAura(aura: MilestoneAuraKind) {
    updateSettings({ auraFilters: toggleSingleTrophyFilter(settings.auraFilters, aura) });
  }

  function clearCollectionFilters() {
    updateSettings({ auraFilters: [], tierFilters: [] });
  }

  function tryLiveTrophies() {
    dispatchRenderer({ type: "manual-retry" });
    updateSettings({ renderMode: "3d" });
    setWebGLSupported(null);
    window.requestAnimationFrame(() => setWebGLSupported(detectWebGL2Support()));
  }

  return <div className="space-y-5">
    <section aria-labelledby="trophy-collection-title" className="rounded-[1.5rem] border border-[#e4dbfa] bg-[linear-gradient(145deg,#fcfbff,#f3effd)] p-4 shadow-[0_16px_40px_rgba(81,61,168,0.08)] dark:border-white/10 dark:bg-[linear-gradient(145deg,#1d1832,#141024)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8e88a9]">Trophy Gallery</p><h2 className="mt-1 text-xl font-semibold text-[#30284f] dark:text-white" id="trophy-collection-title">Trophy Collection</h2><p className="mt-1 text-sm text-[#746d8d] dark:text-white/55">{counts.total} currently earned trophies</p></div>
        <details className="text-xs text-[#6c6483] dark:text-white/60"><summary className="cursor-pointer font-semibold">Graphics</summary><div className="mt-2 flex flex-wrap items-end gap-2 rounded-[1rem] border border-[#e1daef] bg-white/75 p-3 dark:border-white/10 dark:bg-white/5"><label className="font-semibold">Quality<select className="ml-2 rounded-full border border-[#dcd4ed] bg-white px-2 py-1 dark:border-white/15 dark:bg-[#171328]" onChange={(event) => updateSettings({ quality: event.target.value as typeof settings.quality })} value={settings.quality}>{["auto", "high", "balanced", "performance"].map((quality) => <option key={quality} value={quality}>{quality[0].toUpperCase() + quality.slice(1)}</option>)}</select></label>{!useStaticTotals ? <TaskTableChipButton onClick={() => updateSettings({ renderMode: "static" })}>Keep Static Previews</TaskTableChipButton> : null}</div></details>
      </div>

      <div className="mt-4">
        <div className="relative aspect-square overflow-hidden rounded-[1.2rem] border border-[#e6dff4] bg-white/65 shadow-inner sm:aspect-[4/1] dark:border-white/10 dark:bg-white/5" data-testid="trophy-collection-sandbox">
          <div className="grid h-full grid-cols-2 sm:grid-cols-4">
            {TROPHY_GALLERY_TIERS.map((tier) => <span className="relative" data-tier-preview-region={tier} key={tier}>{useStaticTotals ? <TrophyVisual className="absolute inset-[12%]" failed={thumbnailFailed} image={thumbnails?.[tier]} tier={tier} /> : null}</span>)}
          </div>
          {!useStaticTotals && webGLSupported ? <div className="pointer-events-none absolute inset-0 z-20" data-testid="shared-trophy-gallery-canvas"><TrophyCaseErrorBoundary onError={(error) => dispatchRenderer({ at: new Date().toISOString(), reason: classifyTrophyRendererError(error), type: "fail" })} resetKey={renderer.retryKey}><TrophyCaseRendererLoader autoRotate={motionPolicy.autoRotate} key={renderer.retryKey} onContextLost={() => dispatchRenderer({ at: new Date().toISOString(), type: "context-lost" })} onContextRestoreFailed={() => dispatchRenderer({ type: "context-restore-timeout" })} onContextRestored={() => dispatchRenderer({ type: "context-restored" })} profile={profile} /></TrophyCaseErrorBoundary></div> : null}
        </div>
        <div aria-label="Trophy tier counts" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TROPHY_GALLERY_TIERS.map((tier) => {
            const selected = settings.tierFilters.length === 1 && settings.tierFilters[0] === tier;
            return <button aria-label={`${counts.tiers[tier]} ${tier} trophies`} aria-pressed={selected} className={`rounded-full border px-3 py-2 text-center text-sm font-semibold capitalize transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#765df6] ${selected ? "border-[#765df6] bg-[#eee9ff] text-[#4e3bb2] dark:bg-white/15 dark:text-white" : "border-[#ddd5ee] bg-white/75 text-[#514968] hover:border-[#b7a7ed] dark:border-white/10 dark:bg-white/5 dark:text-white/75"}`} data-tier-count-control={tier} key={tier} onClick={() => selectTier(tier)} type="button">{counts.tiers[tier]} {tier[0].toUpperCase() + tier.slice(1)}</button>;
          })}
        </div>
      </div>
      {useStaticTotals ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[1rem] border border-[#e2daef] bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/5"><p aria-live="polite" className="text-xs text-[#7d7597] dark:text-white/55">{fallbackMessage(fallbackReason)}</p><div className="flex flex-wrap gap-2"><TaskTableChipButton onClick={tryLiveTrophies}>Try Live Trophies</TaskTableChipButton><TaskTableChipButton onClick={() => updateSettings({ renderMode: "static" })}>Keep Static Previews</TaskTableChipButton></div></div> : <p aria-live="polite" className="mt-2 text-xs text-[#7d7597] dark:text-white/55">{renderer.contextLossPending ? "Restoring live trophy rendering…" : webGLSupported === null ? "Checking live trophy support…" : motionPolicy.autoRotate ? "Four collection trophies rotate slowly." : "Trophy rotation is paused for reduced motion."}</p>}
    </section>

    <section aria-label="Trophy filters" className="space-y-3 rounded-[1.4rem] border border-[#e7e0f7] bg-white p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap gap-2"><TaskTableChipButton aria-pressed={settings.tierFilters.length === 0 && settings.auraFilters.length === 0} onClick={clearCollectionFilters}>All Trophies: {counts.total}</TaskTableChipButton>{TROPHY_GALLERY_AURAS.map((aura) => <TaskTableChipButton aria-pressed={settings.auraFilters.length === 1 && settings.auraFilters[0] === aura} key={aura} onClick={() => selectAura(aura)}>{AURA_LABELS[aura]}: {counts.auras[aura]}</TaskTableChipButton>)}</div>
      <div className="flex flex-wrap items-end gap-3"><label className="min-w-[13rem] flex-1 text-xs font-semibold text-[#6c6483] dark:text-white/60">Search trophies<input className="mt-1 w-full rounded-full border border-[#dcd4ed] bg-white px-4 py-2 text-sm text-[#30284f] outline-none focus:border-[#765df6] dark:border-white/15 dark:bg-[#171328] dark:text-white" onChange={(event) => setSearch(event.target.value)} type="search" value={search} /></label><label className="text-xs font-semibold text-[#6c6483] dark:text-white/60">Sort<select className="mt-1 block rounded-full border border-[#dcd4ed] bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-[#171328]" onChange={(event) => updateSettings({ sort: event.target.value === "oldest" ? "oldest" : "newest" })} value={settings.sort}><option value="newest">Newest</option><option value="oldest">Oldest</option></select></label></div>
      <p aria-live="polite" className="text-sm text-[#746d8d] dark:text-white/55">Showing {filtered.length} of {counts.total} earned trophies</p>
    </section>

    <section aria-label="Completed Milestone trophies">
      {filtered.length === 0 ? <div className="rounded-[1.5rem] border border-dashed border-[#ddd6ee] bg-white/70 p-8 text-center text-sm text-[#7d7597] dark:border-white/15 dark:bg-white/[0.03]">No completed trophies match these filters.</div> : <div className="grid gap-4 lg:grid-cols-2">
        {filtered.map((trophy) => <TrophyCard detailOpen={detailId === trophy.milestoneId} key={trophy.milestoneId} onOpenTask={onOpenTask} onToggleDetail={() => setDetailId(detailId === trophy.milestoneId ? null : trophy.milestoneId)} thumbnailFailed={thumbnailFailed} thumbnail={thumbnails?.[trophy.tier]} trophy={trophy} />)}
      </div>}
    </section>
  </div>;
}

function TrophyVisual({ className, failed, image, tier }: { className: string; failed: boolean; image?: string; tier: MilestoneTier }) {
  return <span className={`${className} flex items-center justify-center`}>
    {image && !failed ? <span aria-label={getTrophyTierImageAlt(tier)} className="h-full w-full bg-contain bg-center bg-no-repeat" role="img" style={{ backgroundImage: `url(${image})` }} /> : <Trophy aria-label={getTrophyTierImageAlt(tier)} className="h-10 w-10 text-[#765df6]" role="img" />}
  </span>;
}

function TrophyCard({ detailOpen, onOpenTask, onToggleDetail, thumbnail, thumbnailFailed, trophy }: {
  detailOpen: boolean;
  onOpenTask: (taskId: string) => void;
  onToggleDetail: () => void;
  thumbnail?: string;
  thumbnailFailed: boolean;
  trophy: EarnedTrophy;
}) {
  const auraClass = trophy.auraKind === "diamond" ? "border-[#b9c8ff] shadow-[0_0_0_3px_rgba(171,211,255,.24),0_16px_35px_rgba(118,93,246,.12)]" : trophy.auraKind === "standard" ? "border-[#cbbcf4] shadow-[0_0_0_2px_rgba(118,93,246,.12)]" : "border-[#e7e0f2]";
  return <article className={`rounded-[1.4rem] border bg-white p-4 dark:bg-[#1d1832] ${auraClass}`} data-aura={trophy.auraKind} data-tier-image={trophy.tier}>
    <div className="flex items-start gap-4">
      <div className={`relative flex aspect-square h-20 w-20 shrink-0 items-center justify-center sm:h-24 sm:w-24 ${trophy.auraKind === "diamond" ? "bg-[linear-gradient(135deg,rgba(224,244,255,.75),rgba(239,226,255,.7),rgba(255,249,219,.65))]" : trophy.auraKind === "standard" ? "rounded-full bg-[#f5f1ff] dark:bg-white/5" : ""}`}><TrophyVisual className="h-full w-full p-1" failed={thumbnailFailed} image={thumbnail} tier={trophy.tier} /></div>
      <div className="min-w-0 flex-1"><h3 className="break-words text-base font-semibold text-[#30284f] dark:text-white">{trophy.title}</h3><p className="mt-1 text-sm capitalize text-[#7d7597] dark:text-white/55">{trophy.tier} · {AURA_LABELS[trophy.auraKind]}</p><dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm"><div><dt className="text-[#9b92be]">Completed</dt><dd>{formatMilestoneDisplayDate(trophy.completionDate)}</dd></div><div><dt className="text-[#9b92be]">Target</dt><dd>{formatMilestoneDisplayDate(trophy.targetDate)}</dd></div><div className="col-span-2"><dt className="text-[#9b92be]">Timing</dt><dd className="capitalize">{trophy.completionTiming.replace("_", " ")}</dd></div></dl></div>
    </div>
    {detailOpen ? <p className="mt-3 rounded-[1rem] bg-[#f8f6fd] p-3 text-sm text-[#6f6788] dark:bg-white/[0.04] dark:text-white/60">Preserved Milestone: {trophy.title} · earned {formatMilestoneDisplayDate(trophy.completionDate)} · {trophy.taskId ? "linked task available" : "original task deleted; snapshot retained"}.</p> : null}
    <div className="mt-4 flex flex-wrap gap-2">{trophy.taskId ? <TaskTableChipButton onClick={() => onOpenTask(trophy.taskId!)}>Open full Milestone details</TaskTableChipButton> : <TaskTableChipButton aria-expanded={detailOpen} onClick={onToggleDetail}>{detailOpen ? "Hide Milestone details" : "Open full Milestone details"}</TaskTableChipButton>}</div>
  </article>;
}
