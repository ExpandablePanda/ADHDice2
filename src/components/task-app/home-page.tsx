"use client";

import type { AppPage } from "@/lib/task-ui-state";
import type { Task } from "@/lib/database.types";
import { formatTaskPriorityLabel, getTaskPriorityLevel } from "@/lib/task-priority";

type HomePageProps = {
  activeCount: number;
  achievementSummary: {
    chargedSetCount: number;
    latestUnlockTitle: string | null;
    nextSetLabel: string | null;
    unlockedFaces: number;
  };
  doneCount: number;
  lowEnergyTasks: Task[];
  momentumPercent: number;
  overdueCount: number;
  setActivePage: (page: AppPage) => void;
  todayCount: number;
  urgentTasks: Task[];
};

export function HomePage({
  activeCount,
  achievementSummary,
  doneCount,
  lowEnergyTasks,
  momentumPercent,
  overdueCount,
  setActivePage,
  todayCount,
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
          description={achievementSummary.latestUnlockTitle
            ? `Latest face: ${achievementSummary.latestUnlockTitle}. ${achievementSummary.chargedSetCount} charged dice so far.`
            : "Your dice-face codex, charged sets, and the next face within reach."}
          onClick={() => setActivePage("Achievements")}
          title="Achievements"
        />
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-center gap-5">
        <HomeMilestonesDirectionCard />
        <HomeAchievementPreview achievementSummary={achievementSummary} onClick={() => setActivePage("Achievements")} />
        <HomeUrgentPreview tasks={urgentTasks.slice(0, 3)} onClick={() => setActivePage("Tasks")} />
        <HomeLowEnergyPreview tasks={lowEnergyTasks} onClick={() => setActivePage("Tasks")} />
      </div>
    </>
  );
}

function HomeMilestonesDirectionCard() {
  return (
    <section className="w-full rounded-[2rem] border border-[#ece8f8] bg-white p-4 shadow-[0_18px_50px_rgba(81,61,168,0.07)] sm:w-fit sm:min-w-[440px] dark:border-white/10 dark:bg-white/6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white">Milestones</h2>
          <p className="mt-2 max-w-[24rem] text-sm leading-6 text-[#6c7590] dark:text-white/55">
            Milestones are being moved out of Home. The safe direction is a task-child model beside Steps and Substeps, not a separate collectible card system here.
          </p>
        </div>
        <span className="rounded-full border border-[#f2df9b] bg-[#fff6df] px-3 py-1 text-sm font-semibold text-[#b77900] dark:border-[#6b5317] dark:bg-[#44350d] dark:text-[#ffd56b]">
          Deferred
        </span>
      </div>
      <div className="mt-4 grid gap-3">
        {[
          "The incorrect Home-local milestone MVP is no longer active.",
          "Milestones need task-level child-item design instead of standalone Home state.",
          "This correction pass keeps the product honest until the task UI model is designed safely.",
        ].map((line) => (
          <div className="rounded-[1.2rem] border border-[#eee9fb] bg-[#fcfbff] px-4 py-3 text-sm text-[#5f5879] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/65" key={line}>
            {line}
          </div>
        ))}
      </div>
    </section>
  );
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
    <section className="w-full rounded-[2rem] border border-[#dfe8ff] bg-[linear-gradient(135deg,#f8fbff_0%,#fdf7ff_55%,#fff8ef_100%)] p-4 shadow-[0_18px_50px_rgba(81,61,168,0.08)] transition hover:-translate-y-0.5 sm:w-fit sm:min-w-[440px] dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(22,28,47,0.98),rgba(31,20,41,0.96))]">
      <div className="flex items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white">
            Dice Codex
          </h2>
          <p className="mt-2 max-w-[24rem] text-sm leading-6 text-[#6c7590] dark:text-white/55">
            {achievementSummary.latestUnlockTitle
              ? `Latest unlock: ${achievementSummary.latestUnlockTitle}.`
              : "Start building your cabinet of momentum, focus, courage, recovery, follow-through, and care."}
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
          <p className="text-lg font-black text-[#21304f] dark:text-white">{achievementSummary.unlockedFaces}</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8390ad] dark:text-white/40">Faces lit</p>
        </div>
        <div className="rounded-[1.2rem] bg-white/75 px-4 py-3 dark:bg-white/[0.05]">
          <p className="text-lg font-black text-[#21304f] dark:text-white">{achievementSummary.chargedSetCount}</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8390ad] dark:text-white/40">Charged dice</p>
        </div>
        <div className="rounded-[1.2rem] bg-white/75 px-4 py-3 dark:bg-white/[0.05]">
          <p className="text-lg font-black text-[#21304f] dark:text-white">{achievementSummary.nextSetLabel ?? "All sets charged"}</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8390ad] dark:text-white/40">Closest set</p>
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
