"use client";

import { Trophy } from "lucide-react";
import { useMemo } from "react";
import { TaskTableChipButton } from "@/components/ui/task-table-primitives";
import type { AppPage } from "@/lib/task-ui-state";
import type { Milestone, Task } from "@/lib/database.types";
import type { AchievementSummaryPresentation } from "@/lib/achievement-progress";
import { buildHomeMilestoneDashboard, formatMilestoneDisplayDate, getMilestoneCompletionPresentation } from "@/lib/milestones";
import { formatTaskPriorityLabel, getTaskPriorityLevel } from "@/lib/task-priority";

type HomePageProps = {
  activeCount: number;
  achievementSummary: AchievementSummaryPresentation;
  doneCount: number;
  lowEnergyTasks: Task[];
  momentumPercent: number;
  milestoneError: string | null;
  milestoneLoading: boolean;
  milestones: Milestone[];
  onOpenCompletedMilestones: () => void;
  onOpenMilestoneTask: (taskId: string) => void;
  onOpenMilestones: () => void;
  onOpenTrophyGallery: () => void;
  overdueCount: number;
  setActivePage: (page: AppPage) => void;
  tasks: Task[];
  todayCount: number;
  todayDateKey: string;
  urgentTasks: Task[];
};

export function HomePage({
  activeCount,
  achievementSummary,
  doneCount,
  lowEnergyTasks,
  momentumPercent,
  milestoneError,
  milestoneLoading,
  milestones,
  onOpenCompletedMilestones,
  onOpenMilestoneTask,
  onOpenMilestones,
  onOpenTrophyGallery,
  overdueCount,
  setActivePage,
  tasks,
  todayCount,
  todayDateKey,
  urgentTasks,
}: HomePageProps) {
  return (
    <>
      <section className="flex flex-col items-center pt-[5px] text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8e88a9] dark:text-white/40">
          Home Dashboard
        </p>
        <h1 className="mt-2 text-[clamp(2.4rem,5vw,4rem)] font-black tracking-tight text-[#17203a] dark:text-white">
          Your focus overview
        </h1>
        <p className="mt-1 max-w-3xl text-base text-[#707a95] dark:text-white/55">
          Start here for momentum, urgent tasks, low-energy wins, and quick jumps into the rest of ADHDice.
        </p>
        <button
          className="ui-pill-button-strong-light mt-6 transition hover:-translate-y-0.5"
          onClick={() => setActivePage("Tasks")}
          type="button"
        >
          Open Tasks
        </button>
      </section>

      <div className="mt-7 flex flex-wrap justify-center gap-5">
        <OverviewStatCard label="Urgent Momentum" value={`${momentumPercent}%`} detail={`${overdueCount} overdue`} />
        <OverviewStatCard label="Today Queue" value={String(todayCount)} detail="ready to work" />
        <OverviewStatCard label="Active Tasks" value={String(activeCount)} detail="current load" />
        <OverviewStatCard label="Completed" value={String(doneCount)} detail="closed loops" />
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-5">
        <DashboardJumpCard
          cta="Go to Tasks"
          description="Refocus, urgent momentum, filters, and your active queue."
          onClick={() => setActivePage("Tasks")}
          title="Task Command"
        />
        <DashboardJumpCard
          cta="Open Focus"
          description="Timer sessions, low-friction entry points, and calm starting rituals."
          onClick={() => setActivePage("Focus")}
          title="Focus Mode"
        />
        <DashboardJumpCard
          cta="View Stats"
          description="Patterns, streaks, and reward loops without overwhelming density."
          onClick={() => setActivePage("Stats")}
          title="Progress"
        />
        <DashboardJumpCard
          cta="Open Achievements"
          description={!achievementSummary.isReady
            ? "Achievement progress is loading."
            : achievementSummary.latestUnlockLabel === "No Achievement unlocks yet"
              ? "See progress across the installed Achievement collections and tiers."
              : `Latest unlock: ${achievementSummary.latestUnlockLabel}.`}
          onClick={() => setActivePage("Achievements")}
          title="Achievements"
        />
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-center gap-5">
        <HomeMilestoneDashboardCard
          error={milestoneError}
          loading={milestoneLoading}
          milestones={milestones}
          onOpenCompleted={onOpenCompletedMilestones}
          onOpenMilestoneTask={onOpenMilestoneTask}
          onOpenMilestones={onOpenMilestones}
          onOpenTrophyGallery={onOpenTrophyGallery}
          onOpenTasks={() => setActivePage("Tasks")}
          tasks={tasks}
          todayDateKey={todayDateKey}
        />
        <HomeAchievementPreview achievementSummary={achievementSummary} onClick={() => setActivePage("Achievements")} />
        <HomeUrgentPreview tasks={urgentTasks.slice(0, 3)} onClick={() => setActivePage("Tasks")} />
        <HomeLowEnergyPreview tasks={lowEnergyTasks} onClick={() => setActivePage("Tasks")} />
      </div>
    </>
  );
}

const MILESTONE_TIMING_LABELS = {
  grace_period: "In grace",
  on_track: "On track",
  past_aura_window: "Past aura window",
  target_today: "Target today",
} as const;

function HomeMilestoneDashboardCard({
  error,
  loading,
  milestones,
  onOpenCompleted,
  onOpenMilestoneTask,
  onOpenMilestones,
  onOpenTrophyGallery,
  onOpenTasks,
  tasks,
  todayDateKey,
}: {
  error: string | null;
  loading: boolean;
  milestones: Milestone[];
  onOpenCompleted: () => void;
  onOpenMilestoneTask: (taskId: string) => void;
  onOpenMilestones: () => void;
  onOpenTrophyGallery: () => void;
  onOpenTasks: () => void;
  tasks: Task[];
  todayDateKey: string;
}) {
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const dashboard = useMemo(() => buildHomeMilestoneDashboard(milestones, tasksById, todayDateKey), [milestones, tasksById, todayDateKey]);
  const recent = dashboard.recentCompletion;
  const recentTitle = recent?.task_id ? tasksById.get(recent.task_id)?.title ?? recent.task_title_snapshot : recent?.task_title_snapshot;

  return (
    <section className="w-full max-w-[920px] rounded-[2rem] border border-[#e7e0f7] bg-white p-5 shadow-[0_18px_50px_rgba(81,61,168,0.08)] dark:border-white/10 dark:bg-white/6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white">Milestones</h2>
          <p className="mt-2 max-w-[24rem] text-sm leading-6 text-[#6c7590] dark:text-white/55">
            Keep the next meaningful target close while preserving every earned trophy.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TaskTableChipButton onClick={onOpenMilestones}>View Milestones</TaskTableChipButton>
          <TaskTableChipButton onClick={onOpenCompleted}>View Completed</TaskTableChipButton>
          <TaskTableChipButton onClick={onOpenTrophyGallery}>View Trophy Gallery</TaskTableChipButton>
        </div>
      </div>

      {loading ? <HomeMilestoneState>Loading synchronized Milestones…</HomeMilestoneState> : null}
      {!loading && error ? <HomeMilestoneState tone="error">Milestones could not load: {error}</HomeMilestoneState> : null}
      {!loading && !error && milestones.length === 0 ? (
        <HomeMilestoneState>
          <p>No Milestones yet. Promote an eligible finite task from Tasks when you are ready.</p>
          <TaskTableChipButton className="mt-3" onClick={onOpenTasks}>Open Tasks</TaskTableChipButton>
        </HomeMilestoneState>
      ) : null}

      {!loading && !error && milestones.length > 0 ? (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MilestoneStat label="Active" value={dashboard.activeCount} />
            <MilestoneStat label="Completed" value={dashboard.completedCount} />
            <MilestoneStat label="In Grace" value={dashboard.gracePeriodCount} />
            <MilestoneStat label="Past Aura Window" value={dashboard.pastAuraWindowCount} />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            <div className="rounded-[1.4rem] border border-[#eee9fb] bg-[#fcfbff] p-4 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-[#30284f] dark:text-white">Nearest active Milestones</h3><TaskTableChipButton onClick={onOpenMilestones}>View all</TaskTableChipButton></div>
              {dashboard.nearestActive.length === 0 ? <p className="mt-4 text-sm text-[#7d7597] dark:text-white/55">No currently active goals. Your completed trophies remain safely recorded.</p> : (
                <div className="mt-3 space-y-3">
                  {dashboard.nearestActive.map((preview) => (
                    <article className="rounded-[1rem] border border-[#e8e0f7] bg-white px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={preview.milestone.id}>
                      <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[#2e2948] dark:text-white">{preview.task.title}</p><p className="mt-1 text-xs capitalize text-[#81799d] dark:text-white/50">{preview.milestone.current_tier} trophy · Target {formatMilestoneDisplayDate(preview.milestone.current_target_date)}</p></div><TaskTableChipButton onClick={() => onOpenMilestoneTask(preview.task.id)}>Open</TaskTableChipButton></div>
                      <p className="mt-2 text-sm text-[#675e83] dark:text-white/60"><span className="font-semibold">{MILESTONE_TIMING_LABELS[preview.timingState]}</span> · {preview.timingDetail}</p>
                    </article>
                  ))}
                  {dashboard.remainingActiveCount > 0 ? <p className="text-xs text-[#81799d] dark:text-white/50">+{dashboard.remainingActiveCount} more active Milestone{dashboard.remainingActiveCount === 1 ? "" : "s"}</p> : null}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-[1.4rem] border border-[#eee9fb] bg-[#fcfbff] p-4 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-[#30284f] dark:text-white">Recently completed</h3><TaskTableChipButton onClick={onOpenCompleted}>View Completed</TaskTableChipButton></div>
                {recent ? <div className="mt-3"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f1ecff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]"><Trophy aria-hidden="true" className="h-4 w-4" /></span><div><p className="font-semibold text-[#30284f] dark:text-white">{recentTitle}</p><p className="text-xs capitalize text-[#81799d] dark:text-white/50">{recent.current_tier} · {getMilestoneCompletionPresentation(recent).aura}</p></div></div><p className="mt-2 text-sm text-[#675e83] dark:text-white/60">{formatMilestoneDisplayDate(recent.completion_date_key!)} · {getMilestoneCompletionPresentation(recent).classification}</p></div> : <p className="mt-3 text-sm text-[#7d7597] dark:text-white/55">No completed Milestones yet. Active goals will appear here when completed.</p>}
              </div>

              <div className="rounded-[1.4rem] border border-[#eee9fb] bg-[#fcfbff] p-4 dark:border-white/10 dark:bg-white/[0.04]">
                <h3 className="font-semibold text-[#30284f] dark:text-white">Earned trophy distribution</h3>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  {(["bronze", "silver", "gold", "platinum"] as const).map((tier) => <MilestoneNumericRow key={tier} label={tier} value={dashboard.earnedTierCounts[tier]} />)}
                  <MilestoneNumericRow label="Standard Aura" value={dashboard.standardAuraCount} />
                  <MilestoneNumericRow label="Diamond Aura" value={dashboard.diamondAuraCount} />
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function HomeMilestoneState({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "error" | "neutral" }) {
  return <div className={`mt-5 rounded-[1.4rem] border border-dashed p-6 text-center text-sm ${tone === "error" ? "border-[#f1ccd4] bg-[#fff7f8] text-[#a23d52] dark:border-[#5d2b39] dark:bg-[#2a1720]" : "border-[#ddd6ee] bg-[#fcfbff] text-[#7d7597] dark:border-white/15 dark:bg-white/[0.03] dark:text-white/55"}`}>{children}</div>;
}

function MilestoneStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-[1.2rem] bg-[#f8f6ff] px-4 py-3 text-center dark:bg-white/[0.04]"><p className="text-2xl font-black text-[#2b3150] dark:text-white">{value}</p><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8a82a3] dark:text-white/40">{label}</p></div>;
}

function MilestoneNumericRow({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between rounded-full border border-[#e7e0f5] bg-white px-3 py-1.5 capitalize text-[#6b6384] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60"><span>{label}</span><strong className="text-[#30284f] dark:text-white">{value}</strong></div>;
}

function OverviewStatCard({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <section className="flex h-[139px] w-[180px] flex-col items-center justify-center rounded-[1.8rem] border border-[#ece8f8] bg-white px-5 py-4 text-center shadow-[0_18px_50px_rgba(81,61,168,0.07)] transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/35">{label}</p>
      <p className="mt-1 text-4xl font-black leading-none text-[#1f2746] dark:text-white">{value}</p>
      <p className="mt-1 text-sm leading-tight text-[#7f88a1] dark:text-white/55">{detail}</p>
    </section>
  );
}

function DashboardJumpCard({
  cta,
  description,
  onClick,
  title,
}: {
  cta: string;
  description: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <section className="flex w-fit self-start rounded-[2rem] border border-[#ece8f8] bg-white px-5 py-3 text-center shadow-[0_18px_50px_rgba(81,61,168,0.07)] transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/6">
      <div className="flex flex-col items-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/35">Overview</p>
        <h2 className="mt-1.5 text-2xl font-black text-[#26304c] dark:text-white">{title}</h2>
        <p className="mt-1.5 max-w-[260px] text-sm leading-6 text-[#7a839e] dark:text-white/55">{description}</p>
        <button className="ui-pill-button-strong-light mt-3" onClick={onClick} type="button">
          {cta}
        </button>
      </div>
    </section>
  );
}

function HomeUrgentPreview({
  onClick,
  tasks,
}: {
  onClick: () => void;
  tasks: Task[];
}) {
  return (
    <section className="w-full rounded-[2rem] border border-[#ece8f8] bg-white p-4 shadow-[0_18px_50px_rgba(81,61,168,0.07)] transition hover:-translate-y-0.5 sm:w-fit sm:min-w-[440px] dark:border-white/10 dark:bg-white/6">
      <div className="flex items-center justify-between gap-6">
        <h2 className="text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white">
          Urgent Snapshot
        </h2>
        <button
          className="ui-pill-button-strong-light min-w-[110px] transition"
          onClick={onClick}
          type="button"
        >
          Open Tasks
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {tasks.map((task) => (
          <div className="max-w-[32rem] rounded-[1.2rem] border border-[#eee9fb] bg-[#fcfbff] px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={task.id}>
            <p className="text-lg font-semibold text-[#27304c] dark:text-white">{task.title}</p>
            <p className="mt-1 text-sm text-[#7d88a1] dark:text-white/55">{formatDueLabel(task.due_on)} / {formatTaskPriorityLabel(getTaskPriorityLevel(task))}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HomeAchievementPreview({
  achievementSummary,
  onClick,
}: {
  achievementSummary: HomePageProps["achievementSummary"];
  onClick: () => void;
}) {
  return (
    <section className="w-full rounded-lg border border-[#e8e2f2] bg-white p-4 shadow-[0_12px_30px_rgba(81,61,168,0.06)] transition hover:-translate-y-0.5 sm:w-fit sm:min-w-[440px] dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-center justify-between gap-6">
        <div>
          <h2 className="text-xl font-semibold text-[#28304a] dark:text-white">
            Achievement Progress
          </h2>
          <p className="mt-2 max-w-[24rem] text-sm leading-6 text-[#6c7590] dark:text-white/55">
            {achievementSummary.isReady
              ? achievementSummary.latestUnlockDetail
              : "Loading your authenticated Achievement progress…"}
          </p>
        </div>
        <button
          className="ui-pill-button-strong-light min-w-[140px] transition"
          onClick={onClick}
          type="button"
        >
          Open Achievements
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[1.2rem] bg-white/75 px-4 py-3 dark:bg-white/[0.05]">
          <p className="text-lg font-black text-[#21304f] dark:text-white">{achievementSummary.earnedTiersLabel}</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8390ad] dark:text-white/40">Earned tiers</p>
        </div>
        <div className="rounded-[1.2rem] bg-white/75 px-4 py-3 dark:bg-white/[0.05]">
          <p className="text-lg font-black text-[#21304f] dark:text-white">{achievementSummary.completedCollectionsLabel}</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8390ad] dark:text-white/40">Mastered collections</p>
        </div>
        <div className="rounded-[1.2rem] bg-white/75 px-4 py-3 dark:bg-white/[0.05]">
          <p className="text-lg font-black text-[#21304f] dark:text-white">{achievementSummary.completionLabel}</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8390ad] dark:text-white/40">Completion</p>
        </div>
      </div>
    </section>
  );
}

function HomeLowEnergyPreview({
  onClick,
  tasks,
}: {
  onClick: () => void;
  tasks: Task[];
}) {
  return (
    <section className="w-full rounded-[2rem] border border-[#ece8f8] bg-white p-4 shadow-[0_18px_50px_rgba(81,61,168,0.07)] transition hover:-translate-y-0.5 sm:w-fit sm:min-w-[440px] dark:border-white/10 dark:bg-white/6">
      <div className="flex items-center justify-between gap-6">
        <h2 className="text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white">
          Low Energy Wins
        </h2>
        <button
          className="ui-pill-button-strong-light min-w-[110px] transition"
          onClick={onClick}
          type="button"
        >
          Add Task
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {tasks.map((task) => (
          <div className="max-w-[32rem] rounded-[1.2rem] border border-[#eee9fb] bg-[#fcfbff] px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={task.id}>
            <p className="text-base font-semibold text-[#26304c] dark:text-white">{task.title}</p>
            <p className="mt-1 text-sm text-[#7d88a1] dark:text-white/55">{formatDueLabel(task.due_on)} / low effort</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatDueLabel(date: string | null) {
  const difference = daysUntil(date);
  if (difference === null) return "No date";
  if (difference === 0) return "Today";
  if (difference === 1) return "Tomorrow";
  if (difference < 0) return `${Math.abs(difference)}d overdue`;
  return `${difference}d`;
}

function daysUntil(date: string | null) {
  if (!date) {
    return null;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(`${date}T12:00:00`);
  if (Number.isNaN(target.getTime())) {
    return null;
  }

  const differenceMs = target.getTime() - today.getTime();
  return Math.round(differenceMs / 86400000);
}
