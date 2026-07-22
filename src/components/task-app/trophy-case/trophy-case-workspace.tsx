"use client";

import { useEffect, useMemo, useState } from "react";
import { TaskTableChipButton } from "@/components/ui/task-table-primitives";
import { useTrophyCaseSettings } from "@/hooks/useTrophyCaseSettings";
import type { Milestone, Task } from "@/lib/database.types";
import { formatMilestoneDisplayDate, type MilestoneAuraKind, type MilestoneTier } from "@/lib/milestones";
import {
  adaptCurrentlyEarnedTrophies,
  countEarnedTrophies,
  filterAndSortTrophies,
  toggleSingleTrophyFilter,
  TROPHY_GALLERY_AURAS,
  type EarnedTrophy,
} from "@/lib/trophy-case";
import { TrophyCollectionShowcase, TrophyTierVisual } from "./trophy-collection-showcase";

const AURA_LABELS: Record<MilestoneAuraKind, string> = { diamond: "Diamond Aura", none: "No Aura", standard: "Standard Aura" };

export function TrophyGalleryWorkspace({ lowStimulation, milestones, onOpenTask, tasks, userId }: {
  lowStimulation: boolean;
  milestones: Milestone[];
  onOpenTask: (taskId: string) => void;
  tasks: Task[];
  userId: string | null;
}) {
  const settingsController = useTrophyCaseSettings(userId);
  const { settings, updateSettings } = settingsController;
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<MilestoneTier, string> | null>(null);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const trophies = useMemo(() => adaptCurrentlyEarnedTrophies(milestones, tasks), [milestones, tasks]);
  const counts = useMemo(() => countEarnedTrophies(trophies), [trophies]);
  const filtered = useMemo(() => filterAndSortTrophies(trophies, {
    auras: new Set(settings.auraFilters),
    search,
    tiers: new Set(settings.tierFilters),
  }, settings.sort), [search, settings.auraFilters, settings.sort, settings.tierFilters, trophies]);
  useEffect(() => {
    let active = true;
    void import("./trophy-thumbnail-generator").then(({ getTierTrophyThumbnails }) => getTierTrophyThumbnails()).then((images) => {
      if (active) setThumbnails(images);
    }).catch(() => {
      if (active) setThumbnailFailed(true);
    });
    return () => { active = false; };
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

  return <div className="space-y-5">
    <TrophyCollectionShowcase
      counts={counts.tiers}
      description={`${counts.total} currently earned trophies`}
      heading="Trophy Collection"
      lowStimulation={lowStimulation}
      onSelectTier={selectTier}
      selectedTier={settings.tierFilters.length === 1 ? settings.tierFilters[0] : null}
      settingsController={settingsController}
      titleId="trophy-collection-title"
      userId={userId}
    />

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
      <div className={`relative flex aspect-square h-20 w-20 shrink-0 items-center justify-center sm:h-24 sm:w-24 ${trophy.auraKind === "diamond" ? "bg-[linear-gradient(135deg,rgba(224,244,255,.75),rgba(239,226,255,.7),rgba(255,249,219,.65))]" : trophy.auraKind === "standard" ? "rounded-full bg-[#f5f1ff] dark:bg-white/5" : ""}`}><TrophyTierVisual className="h-full w-full p-1" failed={thumbnailFailed} image={thumbnail} tier={trophy.tier} /></div>
      <div className="min-w-0 flex-1"><h3 className="break-words text-base font-semibold text-[#30284f] dark:text-white">{trophy.title}</h3><p className="mt-1 text-sm capitalize text-[#7d7597] dark:text-white/55">{trophy.tier} · {AURA_LABELS[trophy.auraKind]}</p><dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm"><div><dt className="text-[#9b92be]">Completed</dt><dd>{formatMilestoneDisplayDate(trophy.completionDate)}</dd></div><div><dt className="text-[#9b92be]">Target</dt><dd>{formatMilestoneDisplayDate(trophy.targetDate)}</dd></div><div className="col-span-2"><dt className="text-[#9b92be]">Timing</dt><dd className="capitalize">{trophy.completionTiming.replace("_", " ")}</dd></div></dl></div>
    </div>
    {detailOpen ? <p className="mt-3 rounded-[1rem] bg-[#f8f6fd] p-3 text-sm text-[#6f6788] dark:bg-white/[0.04] dark:text-white/60">Preserved Milestone: {trophy.title} · earned {formatMilestoneDisplayDate(trophy.completionDate)} · {trophy.taskId ? "linked task available" : "original task deleted; snapshot retained"}.</p> : null}
    <div className="mt-4 flex flex-wrap gap-2">{trophy.taskId ? <TaskTableChipButton onClick={() => onOpenTask(trophy.taskId!)}>Open full Milestone details</TaskTableChipButton> : <TaskTableChipButton aria-expanded={detailOpen} onClick={onToggleDetail}>{detailOpen ? "Hide Milestone details" : "Open full Milestone details"}</TaskTableChipButton>}</div>
  </article>;
}
