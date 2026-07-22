"use client";

import { Trophy } from "lucide-react";
import { useEffect, useMemo, useReducer, useState } from "react";
import { TaskTableChipButton } from "@/components/ui/task-table-primitives";
import { useTrophyCaseSettings, type TrophyCaseSettings } from "@/hooks/useTrophyCaseSettings";
import type { MilestoneTier } from "@/lib/milestones";
import {
  classifyTrophyRendererError,
  detectWebGL2Support,
  getReducedMotionPolicy,
  getTrophyTierImageAlt,
  hydrateTrophyRendererFailureState,
  isLikelyWebGLRendererCreationError,
  persistTrophyRendererFailureState,
  resolveTrophyQualityProfile,
  resolveTrophyRendererFallbackReason,
  TROPHY_GALLERY_TIERS,
  trophyRendererFailureReducer,
  type TrophyRendererFailureState,
  type TrophyRendererFallbackReason,
} from "@/lib/trophy-case";
import { TrophyCaseErrorBoundary } from "./trophy-case-error-boundary";
import { TrophyCaseRendererLoader } from "./trophy-case-renderer-loader";

const TROPHY_RENDERER_APP_VERSION = "6.29.36";
const FAILURE_SESSION_PREFIX = "adhdice:trophy-gallery:renderer-failures:v2";

type TrophySettingsController = {
  settings: TrophyCaseSettings;
  updateSettings: (update: Partial<TrophyCaseSettings>) => void;
};

type TrophyCollectionShowcaseProps = {
  counts: Record<MilestoneTier, number>;
  description: string;
  heading: string;
  lowStimulation: boolean;
  onSelectTier?: (tier: MilestoneTier) => void;
  selectedTier?: MilestoneTier | null;
  settingsController: TrophySettingsController;
  titleId: string;
  userId: string | null;
};

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

export function ManagedTrophyCollectionShowcase(props: Omit<TrophyCollectionShowcaseProps, "settingsController">) {
  const settingsController = useTrophyCaseSettings(props.userId);
  return <TrophyCollectionShowcase {...props} settingsController={settingsController} />;
}

export function TrophyCollectionShowcase({ counts, description, heading, lowStimulation, onSelectTier, selectedTier = null, settingsController, titleId, userId }: TrophyCollectionShowcaseProps) {
  const { settings, updateSettings } = settingsController;
  const rendererUserId = userId ?? "guest";
  const [webGLSupported, setWebGLSupported] = useState<boolean | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<MilestoneTier, string> | null>(null);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [renderer, dispatchRenderer] = useReducer(trophyRendererFailureReducer, undefined, () => readRendererFailureState(rendererUserId));
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

  function tryLiveTrophies() {
    dispatchRenderer({ type: "manual-retry" });
    updateSettings({ renderMode: "3d" });
    setWebGLSupported(null);
    window.requestAnimationFrame(() => setWebGLSupported(detectWebGL2Support()));
  }

  return <section aria-labelledby={titleId} className="rounded-[1.5rem] border border-[#e4dbfa] bg-[linear-gradient(145deg,#fcfbff,#f3effd)] p-4 shadow-[0_16px_40px_rgba(81,61,168,0.08)] dark:border-white/10 dark:bg-[linear-gradient(145deg,#1d1832,#141024)]" data-testid="trophy-collection-showcase">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8e88a9]">Trophy Gallery</p><h2 className="mt-1 text-xl font-semibold text-[#30284f] dark:text-white" id={titleId}>{heading}</h2><p className="mt-1 text-sm text-[#746d8d] dark:text-white/55">{description}</p></div>
      <details className="text-xs text-[#6c6483] dark:text-white/60"><summary className="cursor-pointer font-semibold">Graphics</summary><div className="mt-2 flex flex-wrap items-end gap-2 rounded-[1rem] border border-[#e1daef] bg-white/75 p-3 dark:border-white/10 dark:bg-white/5"><label className="font-semibold">Quality<select className="ml-2 rounded-full border border-[#dcd4ed] bg-white px-2 py-1 dark:border-white/15 dark:bg-[#171328]" onChange={(event) => updateSettings({ quality: event.target.value as typeof settings.quality })} value={settings.quality}>{["auto", "high", "balanced", "performance"].map((quality) => <option key={quality} value={quality}>{quality[0].toUpperCase() + quality.slice(1)}</option>)}</select></label>{!useStaticTotals ? <TaskTableChipButton onClick={() => updateSettings({ renderMode: "static" })}>Keep Static Previews</TaskTableChipButton> : null}</div></details>
    </div>

    <div className="mt-4">
      <div className="relative aspect-square overflow-hidden rounded-[1.2rem] border border-[#e6dff4] bg-white/65 shadow-inner sm:aspect-[4/1] dark:border-white/10 dark:bg-white/5" data-testid="trophy-collection-sandbox">
        <div className="grid h-full grid-cols-2 sm:grid-cols-4">
          {TROPHY_GALLERY_TIERS.map((tier) => <span className="relative" data-tier-preview-region={tier} key={tier}>{useStaticTotals ? <TrophyTierVisual className="absolute inset-[12%]" failed={thumbnailFailed} image={thumbnails?.[tier]} tier={tier} /> : null}</span>)}
        </div>
        {!useStaticTotals && webGLSupported ? <div className="pointer-events-none absolute inset-0 z-20" data-testid="shared-trophy-gallery-canvas"><TrophyCaseErrorBoundary onError={(error) => dispatchRenderer({ at: new Date().toISOString(), reason: classifyTrophyRendererError(error), type: "fail" })} resetKey={renderer.retryKey}><TrophyCaseRendererLoader autoRotate={motionPolicy.autoRotate} key={renderer.retryKey} onContextLost={() => dispatchRenderer({ at: new Date().toISOString(), type: "context-lost" })} onContextRestoreFailed={() => dispatchRenderer({ type: "context-restore-timeout" })} onContextRestored={() => dispatchRenderer({ type: "context-restored" })} profile={profile} /></TrophyCaseErrorBoundary></div> : null}
      </div>
      <div aria-label="Trophy tier counts" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TROPHY_GALLERY_TIERS.map((tier) => {
          const selected = selectedTier === tier;
          const className = `rounded-full border px-3 py-2 text-center text-sm font-semibold capitalize transition ${selected ? "border-[#765df6] bg-[#eee9ff] text-[#4e3bb2] dark:bg-white/15 dark:text-white" : "border-[#ddd5ee] bg-white/75 text-[#514968] dark:border-white/10 dark:bg-white/5 dark:text-white/75"}`;
          const label = `${counts[tier]} ${tier[0].toUpperCase() + tier.slice(1)}`;
          return onSelectTier
            ? <button aria-label={`${counts[tier]} ${tier} trophies`} aria-pressed={selected} className={`${className} hover:border-[#b7a7ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#765df6]`} data-tier-count-control={tier} key={tier} onClick={() => onSelectTier(tier)} type="button">{label}</button>
            : <span aria-label={`${counts[tier]} ${tier} achievement trophies`} className={className} data-tier-count-control={tier} key={tier}>{label}</span>;
        })}
      </div>
    </div>
    {useStaticTotals ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[1rem] border border-[#e2daef] bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/5"><p aria-live="polite" className="text-xs text-[#7d7597] dark:text-white/55">{fallbackMessage(fallbackReason)}</p><div className="flex flex-wrap gap-2"><TaskTableChipButton onClick={tryLiveTrophies}>Try Live Trophies</TaskTableChipButton><TaskTableChipButton onClick={() => updateSettings({ renderMode: "static" })}>Keep Static Previews</TaskTableChipButton></div></div> : <p aria-live="polite" className="mt-2 text-xs text-[#7d7597] dark:text-white/55">{renderer.contextLossPending ? "Restoring live trophy rendering…" : webGLSupported === null ? "Checking live trophy support…" : motionPolicy.autoRotate ? "Four collection trophies rotate slowly." : "Trophy rotation is paused for reduced motion."}</p>}
  </section>;
}

export function TrophyTierVisual({ className, failed, image, tier }: { className: string; failed: boolean; image?: string; tier: MilestoneTier }) {
  return <span className={`${className} flex items-center justify-center`}>
    {image && !failed ? <span aria-label={getTrophyTierImageAlt(tier)} className="h-full w-full bg-contain bg-center bg-no-repeat" role="img" style={{ backgroundImage: `url(${image})` }} /> : <Trophy aria-label={getTrophyTierImageAlt(tier)} className="h-10 w-10 text-[#765df6]" role="img" />}
  </span>;
}
