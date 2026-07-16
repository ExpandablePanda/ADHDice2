"use client";

import { Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { TaskTableChipButton } from "@/components/ui/task-table-primitives";
import type { Milestone, Task } from "@/lib/database.types";
import { getCompletedMilestones, getMilestoneCompletionPresentation } from "@/lib/milestones";

export function CompletedMilestonesWorkspace({ error, loading, milestones, onOpenTask, tasks }: {
  error: string | null;
  loading: boolean;
  milestones: Milestone[];
  onOpenTask: (taskId: string) => void;
  tasks: Task[];
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const completed = useMemo(() => getCompletedMilestones(milestones), [milestones]);
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  if (loading) return <section className="mx-auto mt-6 max-w-5xl rounded-[1.5rem] border border-[#ece8f8] bg-white p-6 text-sm text-[#7d7597] dark:border-white/10 dark:bg-[#171328]">Loading completed Milestones…</section>;
  if (error) return <section className="mx-auto mt-6 max-w-5xl rounded-[1.5rem] border border-[#f1ccd4] bg-[#fff7f8] p-6 text-sm text-[#a23d52] dark:border-[#5d2b39] dark:bg-[#2a1720]">{error}</section>;
  return (
    <section className="mx-auto mt-6 w-full max-w-6xl px-2 pb-10">
      <div className="mb-5"><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8e88a9]">Tasks collection</p><h1 className="mt-1 text-2xl font-semibold text-[#2d2748] dark:text-white">Completed Milestones</h1></div>
      {completed.length === 0 ? <div className="rounded-[1.5rem] border border-dashed border-[#ddd6ee] bg-white/70 p-8 text-center text-sm text-[#7d7597] dark:border-white/15 dark:bg-white/[0.03]">Completed Milestones will appear here with their preserved trophy records.</div> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {completed.map((milestone) => {
            const task = milestone.task_id ? tasksById.get(milestone.task_id) : null;
            const title = task?.title ?? milestone.task_title_snapshot;
            const presentation = getMilestoneCompletionPresentation(milestone);
            const showDetail = detailId === milestone.id;
            return <article className="rounded-[1.5rem] border border-[#e4dbfa] bg-[#fcfaff] p-5 shadow-[0_16px_40px_rgba(81,61,168,0.10)] dark:border-[#44366f] dark:bg-[#1d1635]" key={milestone.id}>
              <div className="flex items-start gap-3"><span aria-label={`${milestone.current_tier} trophy`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]"><Trophy aria-hidden="true" className="h-5 w-5" /></span><div><h2 className="font-semibold text-[#30284f] dark:text-white">{title}</h2><p className="mt-1 text-sm capitalize text-[#7d7597] dark:text-white/55">{milestone.current_tier} · {presentation.aura}</p></div></div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-[#9b92be]">Completed</dt><dd>{milestone.completion_date_key}</dd></div><div><dt className="text-[#9b92be]">Target</dt><dd>{milestone.current_target_date}</dd></div><div className="col-span-2"><dt className="text-[#9b92be]">Result</dt><dd>{presentation.classification}</dd></div></dl>
              {showDetail ? <p className="mt-3 rounded-[1rem] bg-white/70 p-3 text-sm text-[#6f6788] dark:bg-white/[0.04] dark:text-white/60">Aura deadline {milestone.current_aura_deadline} · {presentation.dayDetail}</p> : null}
              <div className="mt-4">{task ? <TaskTableChipButton onClick={() => onOpenTask(task.id)}>Open task</TaskTableChipButton> : <TaskTableChipButton onClick={() => setDetailId(showDetail ? null : milestone.id)}>{showDetail ? "Hide detail" : "Milestone detail"}</TaskTableChipButton>}</div>
            </article>;
          })}
        </div>
      )}
    </section>
  );
}
