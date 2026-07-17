"use client";

import { Trophy } from "lucide-react";
import { TaskTableChipButton } from "@/components/ui/task-table-primitives";
import type { EarnedTrophy } from "@/lib/trophy-case";

export function TrophyCaseStaticGallery({ onSelect, selectedId, trophies }: { onSelect: (id: string) => void; selectedId: string | null; trophies: readonly EarnedTrophy[] }) {
  return <div aria-label="Static trophy gallery" className="grid min-h-[20rem] content-start gap-3 rounded-[1.5rem] border border-[#e4dbfa] bg-[linear-gradient(145deg,#fbf9ff,#eee9fb)] p-4 sm:grid-cols-2 lg:grid-cols-3 dark:border-white/10 dark:bg-[linear-gradient(145deg,#1a1530,#100d20)]">
    {trophies.map((trophy) => <article className={`rounded-[1.2rem] border p-4 ${selectedId === trophy.milestoneId ? "border-[#765df6] bg-white shadow-[0_12px_30px_rgba(92,72,188,.16)] dark:bg-white/10" : "border-[#e8e1f7] bg-white/70 dark:border-white/10 dark:bg-white/5"}`} key={trophy.milestoneId}>
      <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ede7ff] text-[#6f57f6] dark:bg-[#2a2050] dark:text-[#d2c8ff]"><Trophy aria-hidden="true" className="h-5 w-5" /></span><div><h3 className="font-semibold text-[#30284f] dark:text-white">{trophy.title}</h3><p className="text-xs capitalize text-[#7d7597] dark:text-white/55">{trophy.tier} · {trophy.auraKind} aura</p></div></div>
      <TaskTableChipButton className="mt-3" onClick={() => onSelect(trophy.milestoneId)}>Select</TaskTableChipButton>
    </article>)}
    {trophies.length === 0 ? <p className="col-span-full py-12 text-center text-sm text-[#7d7597] dark:text-white/55">No trophies match these controls.</p> : null}
  </div>;
}
