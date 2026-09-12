"use client";

import { Check, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdDropdownSelect } from "@/components/ui-system/adhd-dropdown-select";
import { AdhdPanel } from "@/components/ui-system/adhd-panel";
import type { CustomBehaviorRuleset } from "@/lib/database.types";
import type { CustomBehaviorRulesetDeleteActionResult } from "@/lib/custom-behavior-rulesets";
import {
  STANDARD_TASK_AVAILABLE_ACTIONS,
  normalizeTaskManualActions,
  type MissedStreakUnhandledBehavior,
  type RewardBehavior,
  type TaskBehaviorPolicy,
  type TaskManualAction,
  type UnresolvedOccurrenceBehavior,
} from "@/lib/task-state-engine/behavior-policy";
import { taskTypeBehaviorTabDescription, type TaskTypeBehaviorTab } from "@/lib/task-type-behavior-settings";
import { buildTaskTypeSelectionOptions, normalizeTaskType, type TaskType } from "@/lib/task-type";
import { TASK_TABLE_INPUT_CLASS } from "@/components/ui/task-table-primitives";

export type BehaviorTab = TaskTypeBehaviorTab;
type ConfigurableField = "availableActions" | "missedStreakOnUnhandled" | "rewards" | "unresolvedOccurrence";

const SECTION_CLASS = "rounded-[1rem] border border-[#eee9f8] bg-[#fbfaff] p-4 dark:border-white/10 dark:bg-white/[0.035]";

type DeleteActionResult = boolean | CustomBehaviorRulesetDeleteActionResult;

function normalizeDeleteActionResult(result: DeleteActionResult): CustomBehaviorRulesetDeleteActionResult {
  return typeof result === "boolean"
    ? { assignedTaskCount: null, error: null, ok: result }
    : result;
}

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

export function TaskTypeBehaviorSettings({
  customBehaviorRulesetProfiles = {},
  customBehaviorRulesets = [],
  initialTaskType = "task",
  initialCustomRulesetId = null,
  onCreateCustomRuleset,
  onDeleteCustomRuleset,
  onMoveCustomRulesetTasksToTaskAndDelete,
  onChange,
  onCustomRulesetChange,
  onRenameCustomRuleset,
  onReset,
  onShowCustomRulesetTasks,
  profiles,
}: {
  customBehaviorRulesetProfiles?: Readonly<Record<string, TaskBehaviorPolicy>>;
  customBehaviorRulesets?: readonly CustomBehaviorRuleset[];
  initialTaskType?: TaskType;
  initialCustomRulesetId?: string | null;
  onCreateCustomRuleset?: (name: string) => Promise<CustomBehaviorRuleset | null>;
  onDeleteCustomRuleset?: (rulesetId: string) => Promise<DeleteActionResult> | DeleteActionResult;
  onShowCustomRulesetTasks?: (rulesetId: string) => void;
  onMoveCustomRulesetTasksToTaskAndDelete?: (rulesetId: string) => Promise<DeleteActionResult> | DeleteActionResult;
  onChange: (taskType: TaskTypeBehaviorTab, field: ConfigurableField, value: TaskBehaviorPolicy[ConfigurableField]) => Promise<boolean> | boolean;
  onCustomRulesetChange?: (rulesetId: string, field: ConfigurableField, value: TaskBehaviorPolicy[ConfigurableField]) => Promise<boolean> | boolean;
  onRenameCustomRuleset?: (rulesetId: string, name: string) => Promise<boolean> | boolean;
  onReset: (taskType: TaskTypeBehaviorTab) => Promise<boolean> | boolean;
  profiles: Partial<Record<TaskType, TaskBehaviorPolicy>>;
}) {
  const [activeSelection, setActiveSelection] = useState(initialCustomRulesetId ?? initialTaskType);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newRulesetName, setNewRulesetName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResolvingDelete, setIsResolvingDelete] = useState(false);
  const [isSavingAvailableActions, setIsSavingAvailableActions] = useState(false);
  const isSavingAvailableActionsRef = useRef(false);
  const [blockedDelete, setBlockedDelete] = useState<{ count: number; name: string; rulesetId: string } | null>(null);
  const [rulesetNameDraft, setRulesetNameDraft] = useState(() => customBehaviorRulesets.find((ruleset) => ruleset.id === initialCustomRulesetId && ruleset.deleted_at == null)?.name ?? "");
  const selectionOptions = buildTaskTypeSelectionOptions(customBehaviorRulesets);
  const selectedRuleset = customBehaviorRulesets.find((ruleset) => ruleset.id === activeSelection && ruleset.deleted_at == null) ?? null;
  const selectedRulesetId = selectedRuleset?.id ?? null;
  const selectedRulesetName = selectedRuleset?.name ?? null;
  const activeTab: BehaviorTab = selectedRuleset ? "custom" : normalizeTaskType(activeSelection);
  const [resetting, setResetting] = useState(false);
  useEffect(() => {
    if (selectedRulesetName) {
      // This mirrors the confirmed server-owned identity after a load/rename.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRulesetNameDraft(selectedRulesetName);
    }
  }, [selectedRulesetId, selectedRulesetName]);
  const activeProfile: Pick<TaskBehaviorPolicy, "id" | ConfigurableField> = (selectedRuleset ? customBehaviorRulesetProfiles[selectedRuleset.id] : profiles[activeTab]) ?? {
    id: `${activeTab}-standard`,
    availableActions: STANDARD_TASK_AVAILABLE_ACTIONS,
    unresolvedOccurrence: "missed" as const,
    missedStreakOnUnhandled: "increment" as const,
    rewards: "enabled" as const,
  };

  function selectProfile(value: string) {
    setActiveSelection(value);
    setBlockedDelete(null);
    const nextRuleset = customBehaviorRulesets.find((ruleset) => ruleset.id === value && ruleset.deleted_at == null);
    if (nextRuleset) setRulesetNameDraft(nextRuleset.name);
  }

  async function createRuleset() {
    if (!onCreateCustomRuleset || isCreating) return;
    setIsCreating(true);
    let created: CustomBehaviorRuleset | null = null;
    try {
      created = await onCreateCustomRuleset(newRulesetName);
    } catch {
      created = null;
    } finally {
      setIsCreating(false);
    }
    if (!created) return;
    setNewRulesetName("");
    setIsCreateOpen(false);
    setActiveSelection(created.id);
    setRulesetNameDraft(created.name);
  }

  async function renameRuleset() {
    if (!selectedRuleset || !onRenameCustomRuleset || isRenaming) return;
    setIsRenaming(true);
    let renamed = false;
    try {
      renamed = await onRenameCustomRuleset(selectedRuleset.id, rulesetNameDraft);
    } catch {
      renamed = false;
    } finally {
      setIsRenaming(false);
    }
    setRulesetNameDraft(renamed ? rulesetNameDraft.trim() : selectedRuleset.name);
  }

  async function deleteRuleset() {
    if (!selectedRuleset || !onDeleteCustomRuleset || isDeleting) return;
    if (!window.confirm(`Delete “${selectedRuleset.name}”?\n\nIt will disappear from ruleset settings and Task selectors. Historical Task behavior that used ${selectedRuleset.name} will remain intact.`)) return;
    setIsDeleting(true);
    let result: CustomBehaviorRulesetDeleteActionResult = { assignedTaskCount: null, error: null, ok: false };
    try {
      result = normalizeDeleteActionResult(await onDeleteCustomRuleset(selectedRuleset.id));
    } catch {
      result = { assignedTaskCount: null, error: "Could not delete the Custom ruleset.", ok: false };
    } finally {
      setIsDeleting(false);
    }
    if (!result.ok) {
      if (result.assignedTaskCount !== null) {
        setBlockedDelete({ count: result.assignedTaskCount, name: selectedRuleset.name, rulesetId: selectedRuleset.id });
      }
      return;
    }
    setActiveSelection("custom");
    setRulesetNameDraft("");
    setBlockedDelete(null);
  }

  async function moveAssignedTasksToTaskAndDelete() {
    if (!blockedDelete || !onMoveCustomRulesetTasksToTaskAndDelete || isResolvingDelete) return;
    setIsResolvingDelete(true);
    let result: CustomBehaviorRulesetDeleteActionResult = { assignedTaskCount: null, error: null, ok: false };
    try {
      result = normalizeDeleteActionResult(await onMoveCustomRulesetTasksToTaskAndDelete(blockedDelete.rulesetId));
    } catch {
      result = { assignedTaskCount: null, error: "Could not move the assigned Tasks.", ok: false };
    } finally {
      setIsResolvingDelete(false);
    }
    if (!result.ok) {
      if (result.assignedTaskCount !== null) {
        setBlockedDelete((current) => current ? { ...current, count: result.assignedTaskCount ?? current.count } : current);
      }
      return;
    }
    setActiveSelection("custom");
    setRulesetNameDraft("");
    setBlockedDelete(null);
  }

  function updateActiveProfile(field: Exclude<ConfigurableField, "availableActions">, value: TaskBehaviorPolicy[typeof field]) {
    if (isSavingAvailableActions || isSavingAvailableActionsRef.current) return;
    if (selectedRuleset) {
      void onCustomRulesetChange?.(selectedRuleset.id, field, value);
      return;
    }
    void onChange(activeTab, field, value);
  }

  async function toggleAvailableAction(action: TaskManualAction) {
    if (isSavingAvailableActions || isSavingAvailableActionsRef.current) return;
    isSavingAvailableActionsRef.current = true;
    const currentActions = normalizeTaskManualActions(activeProfile.availableActions);
    const nextActions = normalizeTaskManualActions(
      currentActions.includes(action)
        ? currentActions.filter((current) => current !== action)
        : [...currentActions, action],
    );
    setIsSavingAvailableActions(true);
    try {
      const saved = selectedRuleset
        ? await onCustomRulesetChange?.(selectedRuleset.id, "availableActions", nextActions)
        : await onChange(activeTab, "availableActions", nextActions);
      if (saved === false) return;
    } finally {
      isSavingAvailableActionsRef.current = false;
      setIsSavingAvailableActions(false);
    }
  }

  async function resetDefaults() {
    if (isSavingAvailableActions || isSavingAvailableActionsRef.current) return;
    const label = activeTab === "custom" ? "Custom Default" : "Task";
    if (!window.confirm(`Reset ${label} behavior defaults? This changes only the ${label} profile and leaves Task History unchanged.`)) return;
    setResetting(true);
    await onReset(activeTab);
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
            <p className="mt-1 text-sm leading-5 text-[#7d7598] dark:text-white/55">Profiles shape one shared Task Engine. Custom behavior can use the default profile or a named ruleset.</p>
            <p className="mt-2 text-xs leading-5 text-[#988eb9] dark:text-white/45">Named rulesets keep their own effective-dated behavior revisions.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
          {activeTab === "task" || (activeTab === "custom" && !selectedRuleset) ? (
            <AdhdChip className="gap-1.5" disabled={resetting || isSavingAvailableActions} icon={<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => { void resetDefaults(); }} tone="default">
              {resetting ? "Resetting…" : `Reset ${activeTab === "custom" ? "Custom Default" : "Task"} Defaults`}
            </AdhdChip>
          ) : null}
          <AdhdChip className="gap-1.5" disabled={!onCreateCustomRuleset || isCreating} onClick={() => setIsCreateOpen(true)} tone="purple">
            + New Ruleset
          </AdhdChip>
          </div>
        </div>
      )}
      padding="md"
      variant="subpanel"
    >
      {isCreateOpen ? (
        <form className="mb-4 rounded-[1rem] border border-[#ddd6f5] bg-white p-3 dark:border-white/12 dark:bg-white/[0.025]" onSubmit={(event) => { event.preventDefault(); void createRuleset(); }}>
          <label className="grid gap-1.5 text-xs font-semibold text-[#655d7d] dark:text-white/65" htmlFor="new-custom-ruleset-name">
            New ruleset name
            <input
              aria-label="New ruleset name"
              autoFocus
              className={TASK_TABLE_INPUT_CLASS}
              disabled={isCreating}
              id="new-custom-ruleset-name"
              onChange={(event) => setNewRulesetName(event.target.value)}
              placeholder="Practice"
              required
              type="text"
              value={newRulesetName}
            />
          </label>
          <div className="mt-2 flex flex-wrap justify-end gap-1.5">
            <AdhdChip disabled={isCreating} icon={<X aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => { setIsCreateOpen(false); setNewRulesetName(""); }} tone="default">Cancel</AdhdChip>
            <AdhdChip disabled={isCreating} icon={<Check aria-hidden="true" className="h-3.5 w-3.5" />} type="submit" tone="purple">{isCreating ? "Creating…" : "Create ruleset"}</AdhdChip>
          </div>
        </form>
      ) : null}
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="TaskType behavior profiles">
        {selectionOptions.map((option) => (
          <AdhdChip disabled={isSavingAvailableActions} key={option.value} onClick={() => selectProfile(option.value)} selected={activeSelection === option.value} type="button" role="tab" aria-selected={activeSelection === option.value}>
            {option.label}
          </AdhdChip>
        ))}
      </div>

      {selectedRuleset ? (
        <div className="mb-4 rounded-[1rem] border border-[#eee9f8] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.035]">
          <label className="grid gap-1.5 text-xs font-semibold text-[#655d7d] dark:text-white/65" htmlFor="selected-custom-ruleset-name">
            Ruleset name
            <div className="flex flex-wrap gap-2">
              <input
                aria-label={`Rename ${selectedRuleset.name}`}
                className={`${TASK_TABLE_INPUT_CLASS} min-w-[12rem] flex-1`}
                disabled={isRenaming || isDeleting}
                id="selected-custom-ruleset-name"
                onChange={(event) => setRulesetNameDraft(event.target.value)}
                type="text"
                value={rulesetNameDraft}
              />
              <AdhdChip disabled={isRenaming || isDeleting || isResolvingDelete} icon={<Pencil aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => { void renameRuleset(); }} tone="default">{isRenaming ? "Saving…" : "Rename"}</AdhdChip>
              <AdhdChip disabled={!onDeleteCustomRuleset || isRenaming || isDeleting || isResolvingDelete} icon={<Trash2 aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => { void deleteRuleset(); }} tone="danger">{isDeleting ? "Deleting…" : "Delete Ruleset"}</AdhdChip>
            </div>
          </label>
        </div>
      ) : null}

      {blockedDelete ? (
        <div className="mb-4 rounded-[1rem] border border-[#f1d7a2] bg-[#fffaf0] p-3 dark:border-[#6e5724] dark:bg-[#3b2d12]/45" role="alert">
          <p className="text-sm font-semibold text-[#6d531b] dark:text-[#f3d38a]">
            {blockedDelete.name} is currently assigned to {blockedDelete.count} Task{blockedDelete.count === 1 ? "" : "s"}.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <AdhdChip disabled={isResolvingDelete} onClick={() => { onShowCustomRulesetTasks?.(blockedDelete.rulesetId); setBlockedDelete(null); }} tone="default">Show Tasks</AdhdChip>
            {onMoveCustomRulesetTasksToTaskAndDelete ? (
              <AdhdChip disabled={isResolvingDelete} onClick={() => { void moveAssignedTasksToTaskAndDelete(); }} tone="purple">
                {isResolvingDelete ? "Moving…" : `Move ${blockedDelete.count} Task${blockedDelete.count === 1 ? "" : "s"} to Task & Delete`}
              </AdhdChip>
            ) : null}
            <AdhdChip disabled={isResolvingDelete} onClick={() => setBlockedDelete(null)} icon={<X aria-hidden="true" className="h-3.5 w-3.5" />} tone="default">Cancel</AdhdChip>
          </div>
        </div>
      ) : null}

      {activeTab !== "task" && activeTab !== "custom" ? (
        <div className="rounded-[1rem] border border-dashed border-[#ddd6f5] bg-white px-4 py-6 text-sm text-[#7d7598] dark:border-white/12 dark:bg-white/[0.025] dark:text-white/55">
          {taskTypeBehaviorTabDescription(activeTab)}
        </div>
      ) : (
        <div className="space-y-3">
          <section className={SECTION_CLASS}>
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#655d7d] dark:text-white/60">Available Actions</h4>
            <p className="mt-2 text-xs leading-5 text-[#7d7598] dark:text-white/50">Choose which manual actions are available for Tasks using this profile. Task schedule and state can further limit which actions appear.</p>
            <div aria-label="Available Actions" className="mt-3 flex flex-wrap gap-1.5" role="group">
              {([
                ["done", "Done"],
                ["did_my_best", "Did My Best"],
                ["missed", "Missed"],
                ["delay", "Delay"],
                ["complete", "Complete"],
              ] as const).map(([action, label]) => (
                <AdhdChip
                  key={action}
                  disabled={isSavingAvailableActions}
                  onClick={() => { void toggleAvailableAction(action); }}
                  selected={activeProfile.availableActions.includes(action)}
                  type="button"
                >
                  {label}
                </AdhdChip>
              ))}
            </div>
          </section>

          <section className={SECTION_CLASS}>
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#655d7d] dark:text-white/60">Scheduled occurrences</h4>
            <Selector<UnresolvedOccurrenceBehavior>
              label="Unfinished scheduled occurrence"
              onChange={(value) => { updateActiveProfile("unresolvedOccurrence", value); }}
              options={[{ label: "Mark Missed", value: "missed" }, { label: "Leave scheduled occurrence blank", value: "blank" }]}
              value={activeProfile.unresolvedOccurrence}
            />
            <p className="mt-2 text-xs leading-5 text-[#7d7598] dark:text-white/50">
              {activeProfile.unresolvedOccurrence === "missed"
                ? "When a scheduled Task passes without a handled outcome, ADHDice records it as Missed."
                : "When a scheduled Task passes without a handled outcome, ADHDice leaves a scheduled-but-blank obligation."}
            </p>
            <div className="mt-3 space-y-2 text-xs text-[#6f6887] dark:text-white/55">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9b92be] dark:text-white/35">Derived effects</p>
              {activeProfile.unresolvedOccurrence === "missed" ? (
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
            <Selector<MissedStreakUnhandledBehavior>
              label="Missed streak when scheduled occurrence is unfinished"
              onChange={(value) => { updateActiveProfile("missedStreakOnUnhandled", value); }}
              options={[{ label: "Add to missed streak", value: "increment" }, { label: "Ignore for missed streak", value: "ignore" }]}
              value={activeProfile.missedStreakOnUnhandled}
            />
          </section>

          <section className={SECTION_CLASS}>
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#655d7d] dark:text-white/60">Rewards</h4>
            <Selector<RewardBehavior>
              label="Rewards"
              onChange={(value) => { updateActiveProfile("rewards", value); }}
              options={[{ label: "Enabled", value: "enabled" }, { label: "Disabled", value: "disabled" }]}
              value={activeProfile.rewards}
            />
            <p className="mt-2 text-xs leading-5 text-[#7d7598] dark:text-white/50">Successful outcomes: Done, Did My Best, and Complete. Existing earned rewards remain permanent.</p>
          </section>
        </div>
      )}
    </AdhdPanel>
  );
}
