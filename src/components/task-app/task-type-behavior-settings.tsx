"use client";

import { LockKeyhole, RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdDropdownSelect } from "@/components/ui-system/adhd-dropdown-select";
import { AdhdPanel } from "@/components/ui-system/adhd-panel";
import type {
  MissedStreakUnhandledBehavior,
  PositiveStreakUnhandledBehavior,
  RewardBehavior,
  TaskBehaviorPolicy,
  UnresolvedOccurrenceBehavior,
} from "@/lib/task-state-engine/behavior-policy";
import { TASK_TYPE_BEHAVIOR_TABS, taskTypeBehaviorTabDescription, type TaskTypeBehaviorTab } from "@/lib/task-type-behavior-settings";

export type BehaviorTab = TaskTypeBehaviorTab;
type ConfigurableField = "missedStreakOnUnhandled" | "positiveStreakOnUnhandled" | "rewards" | "unresolvedOccurrence";

const SECTION_CLASS = "rounded-[1rem] border border-[#eee9f8] bg-[#fbfaff] p-4 dark:border-white/10 dark:bg-white/[0.035]";

function Selector<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  value: T;
}) {
  return (
    <AdhdDropdownSelect
      ariaLabel={label}
      label={label}
      onChange={(next) => onChange(next as T)}
      options={options}
      value={value}
    />
  );
}

function LockedRule({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-[0.85rem] border border-[#eee9f8] bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.025]">
      <LockKeyhole aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9288b5] dark:text-white/40" />
      <div className="min-w-0 text-sm text-[#4e476f] dark:text-white/75">{children}<span className="ml-2 text-xs text-[#988eb9] dark:text-white/40">System rule</span></div>
    </div>
  );
}

export function TaskTypeBehaviorSettings({
  onChange,
  onReset,
  profile,
}: {
  onChange: (field: ConfigurableField, value: TaskBehaviorPolicy[ConfigurableField]) => Promise<boolean> | boolean;
  onReset: () => Promise<boolean> | boolean;
  profile: TaskBehaviorPolicy;
}) {
  const [activeTab, setActiveTab] = useState<BehaviorTab>("task");
  const [resetting, setResetting] = useState(false);

  async function resetDefaults() {
    if (!window.confirm("Reset Task behavior defaults? This changes only the Task profile and leaves Task History unchanged.")) return;
    setResetting(true);
    await onReset();
    setResetting(false);
  }

  return (
    <AdhdPanel
      className="max-h-[min(72vh,44rem)] overflow-y-auto"
      header={(
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#9b92be] dark:text-white/35">TaskType</p>
            <h3 className="mt-1 text-lg font-semibold text-[#2f294a] dark:text-white">Behavior settings</h3>
            <p className="mt-1 text-sm leading-5 text-[#7d7598] dark:text-white/55">Profiles shape one shared Task Engine. Rules are per user and per TaskType.</p>
            <p className="mt-2 text-xs leading-5 text-[#988eb9] dark:text-white/45">Configurable rules use controls. Derived effects are informational; System rules are locked.</p>
          </div>
          {activeTab === "task" ? (
            <AdhdChip className="gap-1.5" disabled={resetting} icon={<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => { void resetDefaults(); }} tone="default">
              {resetting ? "Resetting…" : "Reset Task Defaults"}
            </AdhdChip>
          ) : null}
        </div>
      )}
      padding="md"
      variant="subpanel"
    >
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="TaskType behavior profiles">
        {TASK_TYPE_BEHAVIOR_TABS.map((tab) => (
          <AdhdChip key={tab.value} onClick={() => setActiveTab(tab.value)} selected={activeTab === tab.value} type="button" role="tab" aria-selected={activeTab === tab.value}>
            {tab.label}
          </AdhdChip>
        ))}
      </div>

      {activeTab !== "task" ? (
        <div className="rounded-[1rem] border border-dashed border-[#ddd6f5] bg-white px-4 py-6 text-sm text-[#7d7598] dark:border-white/12 dark:bg-white/[0.025] dark:text-white/55">
          {taskTypeBehaviorTabDescription(activeTab)}
        </div>
      ) : (
        <div className="space-y-3">
          <section className={SECTION_CLASS}>
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#655d7d] dark:text-white/60">Scheduled occurrences</h4>
            <Selector<UnresolvedOccurrenceBehavior>
              label="Unfinished scheduled occurrence"
              onChange={(value) => { void onChange("unresolvedOccurrence", value); }}
              options={[{ label: "Mark Missed", value: "missed" }, { label: "Leave scheduled occurrence blank", value: "blank" }]}
              value={profile.unresolvedOccurrence}
            />
            <p className="mt-2 text-xs leading-5 text-[#7d7598] dark:text-white/50">
              {profile.unresolvedOccurrence === "missed"
                ? "When a scheduled Task passes without a handled outcome, ADHDice records it as Missed."
                : "When a scheduled Task passes without a handled outcome, ADHDice leaves a scheduled-but-blank obligation."}
            </p>
            <div className="mt-3 space-y-2 text-xs text-[#6f6887] dark:text-white/55">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9b92be] dark:text-white/35">Derived effects</p>
              {profile.unresolvedOccurrence === "missed" ? (
                <>
                  <div>Mark Missed → Calendar displays Missed</div>
                  <div>Mark Missed → Missed History fact is recorded</div>
                  <div>Mark Missed → obligation remains unresolved</div>
                </>
              ) : (
                <>
                  <div>Leave blank → Calendar preserves the scheduled distinction</div>
                  <div>Leave blank → no Missed History fact is recorded</div>
                  <div>Leave blank → obligation remains unresolved</div>
                </>
              )}
            </div>
          </section>

          <section className={SECTION_CLASS}>
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#655d7d] dark:text-white/60">Streaks</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <Selector<PositiveStreakUnhandledBehavior>
                label="Positive streak when scheduled occurrence is unfinished"
                onChange={(value) => { void onChange("positiveStreakOnUnhandled", value); }}
                options={[{ label: "Break streak", value: "break" }, { label: "Preserve streak", value: "preserve" }]}
                value={profile.positiveStreakOnUnhandled}
              />
              <Selector<MissedStreakUnhandledBehavior>
                label="Missed streak when scheduled occurrence is unfinished"
                onChange={(value) => { void onChange("missedStreakOnUnhandled", value); }}
                options={[{ label: "Add to missed streak", value: "increment" }, { label: "Ignore for missed streak", value: "ignore" }]}
                value={profile.missedStreakOnUnhandled}
              />
            </div>
            <div className="mt-3"><LockedRule>Delayed → Preserve positive streak</LockedRule></div>
          </section>

          <section className={SECTION_CLASS}>
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#655d7d] dark:text-white/60">Success &amp; recurrence</h4>
            <div className="mt-3 space-y-2">
              <LockedRule>Done · counts as success · advances recurrence</LockedRule>
              <LockedRule>Did My Best · counts as success · advances recurrence</LockedRule>
              <LockedRule>Missed · does not complete the occurrence · does not advance recurrence as a success</LockedRule>
              <LockedRule>Complete · permanently completes the Task</LockedRule>
            </div>
          </section>

          <section className={SECTION_CLASS}>
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#655d7d] dark:text-white/60">Rollover</h4>
            <div className="mt-3 space-y-2">
              <LockedRule>Old In Progress → Did My Best</LockedRule>
              <LockedRule>Past unfinished scheduled occurrences → automatically reconciled</LockedRule>
            </div>
          </section>

          <section className={SECTION_CLASS}>
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#655d7d] dark:text-white/60">Rewards</h4>
            <Selector<RewardBehavior>
              label="Rewards"
              onChange={(value) => { void onChange("rewards", value); }}
              options={[{ label: "Enabled", value: "enabled" }, { label: "Disabled", value: "disabled" }]}
              value={profile.rewards}
            />
            <p className="mt-2 text-xs leading-5 text-[#7d7598] dark:text-white/50">Successful outcomes: Done, Did My Best, and Complete. Existing earned rewards remain permanent.</p>
          </section>
        </div>
      )}
    </AdhdPanel>
  );
}
