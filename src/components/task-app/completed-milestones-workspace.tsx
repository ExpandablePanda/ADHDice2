"use client";

import type { Milestone, Task } from "@/lib/database.types";
import { TrophyGalleryWorkspace } from "./trophy-case/trophy-case-workspace";

export function CompletedMilestonesWorkspace({ error, loading, lowStimulation, milestones, onOpenTask, tasks, userId }: {
  error: string | null;
  loading: boolean;
  lowStimulation: boolean;
  milestones: Milestone[];
  onOpenTask: (taskId: string) => void;
  tasks: Task[];
  userId: string | null;
}) {
  if (loading) return <section className="mx-auto mt-6 max-w-5xl rounded-[1.5rem] border border-[#ece8f8] bg-white p-6 text-sm text-[#7d7597] dark:border-white/10 dark:bg-[#171328]">Loading completed Milestones…</section>;
  if (error) return <section className="mx-auto mt-6 max-w-5xl rounded-[1.5rem] border border-[#f1ccd4] bg-[#fff7f8] p-6 text-sm text-[#a23d52] dark:border-[#5d2b39] dark:bg-[#2a1720]">{error}</section>;
  return <section className="mx-auto mt-6 w-full max-w-6xl px-2 pb-10">
    <header className="mb-5"><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8e88a9]">Tasks collection</p><h1 className="mt-1 text-2xl font-semibold text-[#2d2748] dark:text-white">Completed Milestones</h1><p className="mt-1 max-w-2xl text-sm text-[#746d8d] dark:text-white/55">Search, sort, and explore every currently earned Milestone trophy.</p></header>
    <TrophyGalleryWorkspace lowStimulation={lowStimulation} milestones={milestones} onOpenTask={onOpenTask} tasks={tasks} userId={userId} />
  </section>;
}
