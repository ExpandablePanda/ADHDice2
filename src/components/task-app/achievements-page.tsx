"use client";

import { Award, Check, LockKeyhole, Trophy } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { AdhdCard } from "@/components/ui-system/adhd-card";
import { AdhdPanel } from "@/components/ui-system/adhd-panel";
import { TaskTableChipButton } from "@/components/ui/task-table-primitives";
import type { Milestone, Task } from "@/lib/database.types";
import {
  formatAchievementDate,
  formatAchievementValue,
  formatTierLabel,
  getMilestonesTabState,
  getNextProgressTab,
  type AchievementCollectionView,
  type AchievementProgressModel,
  type AchievementTrackView,
  type ProgressTab,
} from "@/lib/achievement-progress";
import { CompletedMilestonesWorkspace } from "./completed-milestones-workspace";
import { PageShellHeader } from "./page-shell-header";

type AchievementsPageProps = {
  achievementError: string | null;
  achievementLoading: boolean;
  hasActivatedProfile: boolean;
  lowStimulation: boolean;
  milestones: Milestone[];
  milestoneError: string | null;
  milestoneLoading: boolean;
  model: AchievementProgressModel;
  notificationError: string | null;
  onOpenMilestoneTask: (taskId: string) => void;
  onOpenMilestones: () => void;
  tasks: Task[];
  userId: string | null;
};

const TAB_ORDER: ProgressTab[] = ["achievements", "milestones"];

export function AchievementsPage({
  achievementError,
  achievementLoading,
  hasActivatedProfile,
  lowStimulation,
  milestones,
  milestoneError,
  milestoneLoading,
  model,
  notificationError,
  onOpenMilestoneTask,
  onOpenMilestones,
  tasks,
  userId,
}: AchievementsPageProps) {
  const [activeTab, setActiveTab] = useState<ProgressTab>("achievements");
  const tabRefs = useRef<Record<ProgressTab, HTMLButtonElement | null>>({ achievements: null, milestones: null });

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const next = getNextProgressTab(activeTab, event.key);
    if (next === activeTab) return;
    event.preventDefault();
    setActiveTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <section className="px-4 pb-32">
      <PageShellHeader subtitle="Achievements and Milestones" title="Progress" />
      <div aria-label="Progress sections" className="mb-5 flex border-b border-[#e4deef] dark:border-white/10" role="tablist">
        {TAB_ORDER.map((tab) => {
          const selected = activeTab === tab;
          const label = tab === "achievements" ? "Achievements" : "Milestones";
          return (
            <button
              aria-controls={`progress-panel-${tab}`}
              aria-selected={selected}
              className={`relative min-h-11 px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8c79f6] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#140f26] ${selected ? "text-[#5b43dc] dark:text-[#cabfff]" : "text-[#77708f] hover:text-[#4f4767] dark:text-white/55 dark:hover:text-white/80"}`}
              id={`progress-tab-${tab}`}
              key={tab}
              onClick={() => setActiveTab(tab)}
              onKeyDown={handleTabKeyDown}
              ref={(node) => { tabRefs.current[tab] = node; }}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              {label}
              <span aria-hidden="true" className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full ${selected ? "bg-[#6f57f6]" : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>

      {activeTab === "achievements" ? (
        <div aria-labelledby="progress-tab-achievements" id="progress-panel-achievements" role="tabpanel">
          <AchievementsTab error={achievementError} hasActivatedProfile={hasActivatedProfile} loading={achievementLoading} model={model} notificationError={notificationError} />
        </div>
      ) : (
        <div aria-labelledby="progress-tab-milestones" id="progress-panel-milestones" role="tabpanel">
          <MilestonesTab
            error={milestoneError}
            loading={milestoneLoading}
            lowStimulation={lowStimulation}
            milestones={milestones}
            onOpenMilestones={onOpenMilestones}
            onOpenTask={onOpenMilestoneTask}
            tasks={tasks}
            userId={userId}
          />
        </div>
      )}
    </section>
  );
}

function AchievementsTab({ error, hasActivatedProfile, loading, model, notificationError }: {
  error: string | null;
  hasActivatedProfile: boolean;
  loading: boolean;
  model: AchievementProgressModel;
  notificationError: string | null;
}) {
  if (loading) return <WorkspaceState tone="neutral" title="Loading Achievement progress…" />;
  if (error) return <WorkspaceState detail={error} tone="error" title="Achievement progress could not load" />;
  if (!hasActivatedProfile) {
    return <WorkspaceState detail="The Achievement runtime has not been activated for this account yet. Existing Tasks, Focus sessions, and awards have not been changed." tone="neutral" title="No activated Achievement profile" />;
  }
  return (
    <div className="space-y-5">
      {notificationError ? (
        <p className="rounded-lg border border-[#efdfbd] bg-[#fffaf0] px-4 py-3 text-sm text-[#8a6628] dark:border-[#604a23] dark:bg-[#2a2417] dark:text-[#e5c77f]">
          Achievement celebrations could not sync right now. Progress remains available and no awards were changed.
        </p>
      ) : null}
      {model.summary.earnedTiers === 0 ? (
        <p className="rounded-lg border border-[#e8e2f2] bg-[#fbfaff] px-4 py-3 text-sm text-[#716a86] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60">
          Your Achievement profile is active. Progress will appear here as the installed runtime records qualifying activity.
        </p>
      ) : null}
      <AchievementSummaryPanel model={model} />
      {model.collections.map((collection) => <CollectionSection collection={collection} key={collection.id} />)}
    </div>
  );
}

function AchievementSummaryPanel({ model }: { model: AchievementProgressModel }) {
  const { summary } = model;
  const items = [
    { label: "Earned tiers", value: `${summary.earnedTiers} / ${summary.totalTiers}` },
    { label: "Completed collections", value: `${summary.completedCollections} / ${model.collections.length}` },
    { label: "Overall completion", value: `${summary.overallCompletionPercent}%` },
    { label: "Most recent unlock", value: summary.mostRecentUnlock?.label ?? "None yet", detail: summary.mostRecentUnlock ? formatAchievementDate(summary.mostRecentUnlock.earnedAt) : undefined },
  ];
  return (
    <AdhdPanel className="!rounded-lg !shadow-none" padding="md" title="Achievement summary">
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div className="rounded-lg border border-[#eee9f7] bg-[#fbfaff] px-3 py-3 dark:border-white/10 dark:bg-white/[0.04]" key={item.label}>
            <dt className="text-xs font-medium text-[#8981a2] dark:text-white/45">{item.label}</dt>
            <dd className="mt-1 text-base font-semibold text-[#30294d] dark:text-white">{item.value}</dd>
            {item.detail ? <dd className="mt-0.5 text-xs text-[#8981a2] dark:text-white/45">{item.detail}</dd> : null}
          </div>
        ))}
      </dl>
    </AdhdPanel>
  );
}

function CollectionSection({ collection }: { collection: AchievementCollectionView }) {
  return (
    <section aria-labelledby={`collection-${collection.id}`} className="rounded-lg border border-[#e9e3f4] bg-[#faf9fc] p-4 dark:border-white/10 dark:bg-white/[0.025]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#30294d] dark:text-white" id={`collection-${collection.id}`}>{collection.title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#766f8b] dark:text-white/55">{collection.description}</p>
        </div>
        <div className="text-right text-sm text-[#766f8b] dark:text-white/55">
          <p>{collection.earnedTiers} of {collection.totalTiers} tiers</p>
          <p className={`mt-1 inline-flex items-center gap-1.5 font-medium ${collection.isMastered ? "text-[#28795e] dark:text-[#9ee0be]" : "text-[#8b849d] dark:text-white/45"}`}>
            {collection.isMastered ? <Trophy aria-hidden="true" className="h-4 w-4" /> : <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" />}
            {collection.isMastered ? `Mastered ${collection.masteredAt ? formatAchievementDate(collection.masteredAt) : ""}` : "Mastery locked"}
          </p>
        </div>
      </header>
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {collection.tracks.map((track) => <TrackCard key={track.id} track={track} />)}
      </div>
    </section>
  );
}

function TrackCard({ track }: { track: AchievementTrackView }) {
  return (
    <AdhdCard className="!rounded-lg !shadow-none" padding="md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[#30294d] dark:text-white">{track.title}</h3>
          <p className="mt-1 text-sm leading-5 text-[#7d7592] dark:text-white/52">{track.description}</p>
        </div>
        {track.isComplete ? <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[#28795e] dark:text-[#9ee0be]"><Award aria-hidden="true" className="h-4 w-4" />Complete</span> : null}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3 text-sm">
        <div>
          <p className="text-xs text-[#8b849d] dark:text-white/42">Current progress</p>
          <p className="mt-0.5 font-semibold tabular-nums text-[#41395c] dark:text-white/85">{formatAchievementValue(track.currentValue, track.unit)}</p>
        </div>
        <p className="text-right text-xs text-[#77708f] dark:text-white/50">
          {track.nextTier && track.nextThreshold !== null ? `Next: ${formatTierLabel(track.nextTier)} at ${formatAchievementValue(track.nextThreshold, track.unit)}` : "Platinum complete"}
        </p>
      </div>
      <div aria-label={`${track.progressPercent}% toward ${track.nextTier ? formatTierLabel(track.nextTier) : "completion"}`} className="mt-2 h-2 overflow-hidden rounded-full bg-[#e8e3f1] dark:bg-white/10" role="progressbar" aria-valuemax={100} aria-valuemin={0} aria-valuenow={track.progressPercent}>
        <div className="h-full rounded-full bg-[#6f57f6] transition-[width]" style={{ width: `${track.progressPercent}%` }} />
      </div>
      <div aria-label={`${track.title} tier states`} className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {track.tiers.map((tier) => (
          <div className={`rounded-lg border px-2 py-2 ${tier.isEarned ? "border-[#cfc4fa] bg-[#f2eeff] text-[#5340ba] dark:border-[#5c4b99] dark:bg-[#2a2148] dark:text-[#d4ccff]" : "border-[#e8e3ef] bg-[#faf9fc] text-[#8a8399] dark:border-white/8 dark:bg-white/[0.025] dark:text-white/42"}`} key={tier.id}>
            <p className="flex items-center gap-1 text-xs font-semibold">{tier.isEarned ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <LockKeyhole aria-hidden="true" className="h-3 w-3" />}{formatTierLabel(tier.id)}</p>
            <p className="mt-1 text-[11px] tabular-nums">{formatAchievementValue(tier.threshold, track.unit)}</p>
            <p className="mt-1 min-h-4 text-[10px]">{tier.earnedAt ? formatAchievementDate(tier.earnedAt) : "Locked"}</p>
          </div>
        ))}
      </div>
    </AdhdCard>
  );
}

function MilestonesTab({ error, loading, lowStimulation, milestones, onOpenMilestones, onOpenTask, tasks, userId }: {
  error: string | null;
  loading: boolean;
  lowStimulation: boolean;
  milestones: Milestone[];
  onOpenMilestones: () => void;
  onOpenTask: (taskId: string) => void;
  tasks: Task[];
  userId: string | null;
}) {
  const state = getMilestonesTabState(milestones, loading, error);
  if (state === "empty") {
    return (
      <AdhdPanel className="!rounded-lg !shadow-none" padding="lg" title="Milestones">
        <div className="flex items-start gap-3">
          <Trophy aria-hidden="true" className="mt-0.5 h-5 w-5 text-[#6f57f6]" />
          <div>
            <h2 className="font-semibold text-[#30294d] dark:text-white">Track larger goals over time</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#766f8b] dark:text-white/55">Create and manage Milestones from Tasks. Completed Milestone trophies will appear here without changing their existing records or lifecycle.</p>
            <TaskTableChipButton className="mt-3" onClick={onOpenMilestones}>Open Milestones in Tasks</TaskTableChipButton>
          </div>
        </div>
      </AdhdPanel>
    );
  }
  return <CompletedMilestonesWorkspace error={error} loading={loading} lowStimulation={lowStimulation} milestones={milestones} onOpenTask={onOpenTask} tasks={tasks} userId={userId} />;
}

function WorkspaceState({ detail, title, tone }: { detail?: string; title: string; tone: "error" | "neutral" }) {
  return (
    <section className={`rounded-lg border p-5 text-sm ${tone === "error" ? "border-[#efccd5] bg-[#fff7f8] text-[#9e3d52] dark:border-[#5d2b39] dark:bg-[#2a1720]" : "border-[#e8e2f2] bg-[#fbfaff] text-[#716a86] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60"}`}>
      <h2 className="font-semibold">{title}</h2>
      {detail ? <p className="mt-1 leading-6">{detail}</p> : null}
    </section>
  );
}
