"use client";

import { Check, Pencil, RotateCcw, Search, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdDropdownSelect } from "@/components/ui-system/adhd-dropdown-select";
import { AdhdPanel } from "@/components/ui-system/adhd-panel";
import type { CustomBehaviorRuleset } from "@/lib/database.types";
import type { CustomBehaviorRulesetDeleteActionResult } from "@/lib/custom-behavior-rulesets";
import {
  STANDARD_TASK_AVAILABLE_ACTIONS,
  STANDARD_TASK_SUCCESS_OUTCOMES,
  normalizeTaskManualActions,
  normalizeTaskSuccessOutcomes,
  type MissedStreakUnhandledBehavior,
  type RewardBehavior,
  type TaskBehaviorPolicy,
  type TaskManualAction,
  type TaskSuccessOutcome,
  type UnresolvedOccurrenceBehavior,
} from "@/lib/task-state-engine/behavior-policy";
import { buildDefaultCustomTaskTypeDraft, taskTypeBehaviorTabDescription, type TaskTypeBehaviorTab } from "@/lib/task-type-behavior-settings";
import { buildTaskTypeSelectionOptions, normalizeTaskType, type TaskType } from "@/lib/task-type";
import { TASK_TABLE_INPUT_CLASS } from "@/components/ui/task-table-primitives";
import { TaskTypeIdentity } from "./task-type-identity";
import { TaskTypeIcon } from "@/components/ui/lucide-icon";
import { DEFAULT_CUSTOM_TASK_TYPE_PRESENTATION, searchTaskTypeIcons, TASK_TYPE_ACCENT_OPTIONS, normalizeTaskTypePresentation, validateTaskTypeDescription, type TaskTypePresentation } from "@/lib/task-type-presentation";

export type BehaviorTab = TaskTypeBehaviorTab;
type ConfigurableField = "availableActions" | "missedStreakOnUnhandled" | "rewards" | "unresolvedOccurrence" | "successOutcomes";

const SECTION_CLASS = "rounded-[1rem] border border-[#eee9f8] bg-[#fbfaff] p-4 dark:border-white/10 dark:bg-white/[0.035]";

type DeleteActionResult = boolean | CustomBehaviorRulesetDeleteActionResult;

function PresentationControls({
  disabled,
  onChange,
  presentation,
}: {
  disabled: boolean;
  onChange: (next: Partial<TaskTypePresentation>) => void;
  presentation: TaskTypePresentation;
}) {
  const [iconQuery, setIconQuery] = useState("");
  const filteredIcons = searchTaskTypeIcons(iconQuery);

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 text-xs font-semibold text-[#655d7d] dark:text-white/65">Icon</p>
        <label className="relative block">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9b92be] dark:text-white/35" />
          <input aria-label="Search icons" className={`${TASK_TABLE_INPUT_CLASS} h-9 rounded-full pl-8 pr-3 text-[13px]`} onChange={(event) => setIconQuery(event.target.value)} placeholder="Search icons..." type="search" value={iconQuery} />
        </label>
        {filteredIcons.length > 0 ? (
          <div aria-label="Custom Task Type icon" className="adhdice-scrollbar mt-2 grid max-h-40 grid-cols-8 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-10" role="group">
          {filteredIcons.map(({ key, label }) => (
            <button
              aria-label={label}
              aria-pressed={presentation.iconKey === key}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${presentation.iconKey === key ? "border-[#6f57f6] bg-[#f1ecff] text-[#6f57f6] dark:border-[#c9bbff] dark:bg-[#42306f] dark:text-[#cabfff]" : "border-[#e5e0f5] bg-white text-[#7d7598] hover:bg-[#f6f2ff] dark:border-white/15 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10"}`}
              disabled={disabled}
              key={key}
              onClick={() => onChange({ iconKey: key })}
              title={label}
              type="button"
            >
              <TaskTypeIcon aria-hidden="true" className="h-4 w-4" iconKey={key} />
            </button>
          ))}
          </div>
        ) : <p className="mt-2 rounded-[0.8rem] border border-dashed border-[#e5e0f5] px-3 py-2 text-xs text-[#7d7598] dark:border-white/10 dark:text-white/45">No icons found.</p>}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold text-[#655d7d] dark:text-white/65">Accent color</p>
        <div aria-label="Custom Task Type accent color" className="flex flex-wrap gap-1.5" role="group">
          {TASK_TYPE_ACCENT_OPTIONS.map(({ className, key, label }) => (
            <button
              aria-label={label}
              aria-pressed={presentation.accentKey === key}
              className={`h-7 min-w-7 rounded-full border px-2 text-[10px] font-semibold transition ${className} ${presentation.accentKey === key ? "ring-2 ring-[#6f57f6]/45 ring-offset-1 dark:ring-offset-[#201a35]" : "opacity-80 hover:opacity-100"}`}
              disabled={disabled}
              key={key}
              onClick={() => onChange({ accentKey: key })}
              title={label}
              type="button"
            >
              <span className="sr-only">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

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

type BehaviorControlProfile = Pick<TaskBehaviorPolicy, "id" | ConfigurableField>;

function BehaviorControls({
  activeProfile,
  disabled,
  onChange,
  onToggleAvailableAction,
  onToggleSuccessOutcome,
}: {
  activeProfile: BehaviorControlProfile;
  disabled: boolean;
  onChange: {
    unresolvedOccurrence: (value: UnresolvedOccurrenceBehavior) => void;
    missedStreakOnUnhandled: (value: MissedStreakUnhandledBehavior) => void;
    rewards: (value: RewardBehavior) => void;
  };
  onToggleAvailableAction: (action: TaskManualAction) => void | Promise<void>;
  onToggleSuccessOutcome: (outcome: TaskSuccessOutcome) => void | Promise<void>;
}) {
  return (
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
              disabled={disabled}
              onClick={() => { void onToggleAvailableAction(action); }}
              selected={activeProfile.availableActions.includes(action)}
              type="button"
            >
              {label}
            </AdhdChip>
          ))}
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#655d7d] dark:text-white/60">Counts as success</h4>
        <p className="mt-2 text-xs leading-5 text-[#7d7598] dark:text-white/50">Selected outcomes advance the positive streak. Other handled outcomes break it.</p>
        <div aria-label="Counts as success" className="mt-3 flex flex-wrap gap-1.5" role="group">
          {([
            ["done", "Done"],
            ["did_my_best", "Did My Best"],
            ["complete", "Complete"],
          ] as const).map(([outcome, label]) => (
            <AdhdChip
              key={outcome}
              disabled={disabled}
              onClick={() => { void onToggleSuccessOutcome(outcome); }}
              selected={activeProfile.successOutcomes.includes(outcome)}
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
          onChange={onChange.unresolvedOccurrence}
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
          onChange={onChange.missedStreakOnUnhandled}
          options={[{ label: "Add to missed streak", value: "increment" }, { label: "Ignore for missed streak", value: "ignore" }]}
          value={activeProfile.missedStreakOnUnhandled}
        />
      </section>

      <section className={SECTION_CLASS}>
        <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#655d7d] dark:text-white/60">Rewards</h4>
        <Selector<RewardBehavior>
          label="Rewards"
          onChange={onChange.rewards}
          options={[{ label: "Enabled", value: "enabled" }, { label: "Disabled", value: "disabled" }]}
          value={activeProfile.rewards}
        />
        <p className="mt-2 text-xs leading-5 text-[#7d7598] dark:text-white/50">Successful outcomes: Done, Did My Best, and Complete. Existing earned rewards remain permanent.</p>
      </section>
    </div>
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
  onUpdateCustomRulesetPresentation,
  onReset,
  onShowCustomRulesetTasks,
  profiles,
}: {
  customBehaviorRulesetProfiles?: Readonly<Record<string, TaskBehaviorPolicy>>;
  customBehaviorRulesets?: readonly CustomBehaviorRuleset[];
  initialTaskType?: TaskType;
  initialCustomRulesetId?: string | null;
  onCreateCustomRuleset?: (name: string, policy: TaskBehaviorPolicy, presentation: Partial<TaskTypePresentation>) => Promise<CustomBehaviorRuleset | null>;
  onDeleteCustomRuleset?: (rulesetId: string) => Promise<DeleteActionResult> | DeleteActionResult;
  onShowCustomRulesetTasks?: (rulesetId: string) => void;
  onMoveCustomRulesetTasksToTaskAndDelete?: (rulesetId: string) => Promise<DeleteActionResult> | DeleteActionResult;
  onChange: (taskType: TaskTypeBehaviorTab, field: ConfigurableField, value: TaskBehaviorPolicy[ConfigurableField]) => Promise<boolean> | boolean;
  onCustomRulesetChange?: (rulesetId: string, field: ConfigurableField, value: TaskBehaviorPolicy[ConfigurableField]) => Promise<boolean> | boolean;
  onRenameCustomRuleset?: (rulesetId: string, name: string) => Promise<boolean> | boolean;
  onUpdateCustomRulesetPresentation?: (rulesetId: string, presentation: Partial<TaskTypePresentation>) => Promise<boolean> | boolean;
  onReset: (taskType: TaskTypeBehaviorTab) => Promise<boolean> | boolean;
  profiles: Partial<Record<TaskType, TaskBehaviorPolicy>>;
}) {
  const [activeSelection, setActiveSelection] = useState(initialCustomRulesetId ?? initialTaskType);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newRulesetName, setNewRulesetName] = useState("");
  const [customTaskTypeDraft, setCustomTaskTypeDraft] = useState<TaskBehaviorPolicy>(buildDefaultCustomTaskTypeDraft);
  const [customTaskTypePresentationDraft, setCustomTaskTypePresentationDraft] = useState<TaskTypePresentation>(DEFAULT_CUSTOM_TASK_TYPE_PRESENTATION);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResolvingDelete, setIsResolvingDelete] = useState(false);
  const [isSavingPolicyArray, setIsSavingPolicyArray] = useState(false);
  const isSavingPolicyArrayRef = useRef(false);
  const [blockedDelete, setBlockedDelete] = useState<{ count: number; name: string; rulesetId: string } | null>(null);
  const [rulesetNameDraft, setRulesetNameDraft] = useState(() => customBehaviorRulesets.find((ruleset) => ruleset.id === initialCustomRulesetId && ruleset.deleted_at == null)?.name ?? "");
  const [rulesetDescriptionDraft, setRulesetDescriptionDraft] = useState(() => customBehaviorRulesets.find((ruleset) => ruleset.id === initialCustomRulesetId && ruleset.deleted_at == null)?.description ?? "");
  const [isSavingPresentation, setIsSavingPresentation] = useState(false);
  const selectionOptions = buildTaskTypeSelectionOptions(customBehaviorRulesets);
  const selectedRuleset = customBehaviorRulesets.find((ruleset) => ruleset.id === activeSelection && ruleset.deleted_at == null) ?? null;
  const selectedRulesetId = selectedRuleset?.id ?? null;
  const selectedRulesetName = selectedRuleset?.name ?? null;
  const activeTab: BehaviorTab = selectedRuleset ? "custom" : normalizeTaskType(activeSelection);
  const selectedOption = selectionOptions.find((option) => option.value === activeSelection) ?? selectionOptions[0];
  const [resetting, setResetting] = useState(false);
  useEffect(() => {
    if (selectedRulesetName && selectedRuleset) {
      // This mirrors the confirmed server-owned identity after a load/rename.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRulesetNameDraft(selectedRulesetName);
      setRulesetDescriptionDraft(selectedRuleset.description ?? "");
    }
  }, [selectedRuleset, selectedRulesetId, selectedRulesetName]);
  const activeProfile: Pick<TaskBehaviorPolicy, "id" | ConfigurableField> = isCreateOpen
    ? customTaskTypeDraft
    : (selectedRuleset ? customBehaviorRulesetProfiles[selectedRuleset.id] : profiles[activeTab]) ?? {
    id: `${activeTab}-standard`,
    availableActions: STANDARD_TASK_AVAILABLE_ACTIONS,
    unresolvedOccurrence: "missed" as const,
    missedStreakOnUnhandled: "increment" as const,
    rewards: "enabled" as const,
    successOutcomes: STANDARD_TASK_SUCCESS_OUTCOMES,
    };

  function openCreate() {
    setNewRulesetName("");
    setCustomTaskTypeDraft(buildDefaultCustomTaskTypeDraft());
    setCustomTaskTypePresentationDraft(DEFAULT_CUSTOM_TASK_TYPE_PRESENTATION);
    setBlockedDelete(null);
    setIsCreateOpen(true);
  }

  function cancelCreate() {
    setIsCreateOpen(false);
    setNewRulesetName("");
    setCustomTaskTypeDraft(buildDefaultCustomTaskTypeDraft());
    setCustomTaskTypePresentationDraft(DEFAULT_CUSTOM_TASK_TYPE_PRESENTATION);
  }

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
      created = await onCreateCustomRuleset(newRulesetName, customTaskTypeDraft, customTaskTypePresentationDraft);
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
    setRulesetDescriptionDraft(created.description);
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

  async function savePresentation() {
    if (!selectedRuleset || !onUpdateCustomRulesetPresentation || isSavingPresentation) return;
    const descriptionValidation = validateTaskTypeDescription(rulesetDescriptionDraft);
    if (descriptionValidation.error) return;
    setIsSavingPresentation(true);
    try {
      const currentPresentation = normalizeTaskTypePresentation({
        accentKey: selectedRuleset.accent_key,
        description: rulesetDescriptionDraft,
        iconKey: selectedRuleset.icon_key,
      });
      await onUpdateCustomRulesetPresentation(selectedRuleset.id, {
        accentKey: currentPresentation.accentKey,
        description: descriptionValidation.description,
        iconKey: currentPresentation.iconKey,
      });
    } finally {
      setIsSavingPresentation(false);
    }
  }

  function updateSelectedPresentation(next: Partial<TaskTypePresentation>) {
    if (!selectedRuleset || !onUpdateCustomRulesetPresentation) return;
    void (async () => {
      setIsSavingPresentation(true);
      try {
        const currentPresentation = normalizeTaskTypePresentation({
          accentKey: selectedRuleset.accent_key,
          description: rulesetDescriptionDraft,
          iconKey: selectedRuleset.icon_key,
        });
        await onUpdateCustomRulesetPresentation(selectedRuleset.id, {
          ...currentPresentation,
          ...next,
        });
      } finally {
        setIsSavingPresentation(false);
      }
    })();
  }

  async function deleteRuleset() {
    if (!selectedRuleset || !onDeleteCustomRuleset || isDeleting) return;
    if (!window.confirm(`Delete “${selectedRuleset.name}”?\n\nIt will disappear from Custom Task Type settings and Task Type selectors. Historical Task behavior that used ${selectedRuleset.name} will remain intact.`)) return;
    setIsDeleting(true);
    let result: CustomBehaviorRulesetDeleteActionResult = { assignedTaskCount: null, error: null, ok: false };
    try {
      result = normalizeDeleteActionResult(await onDeleteCustomRuleset(selectedRuleset.id));
    } catch {
      result = { assignedTaskCount: null, error: "Could not delete the Custom Task Type.", ok: false };
    } finally {
      setIsDeleting(false);
    }
    if (!result.ok) {
      if (result.assignedTaskCount !== null) {
        setBlockedDelete({ count: result.assignedTaskCount, name: selectedRuleset.name, rulesetId: selectedRuleset.id });
      }
      return;
    }
    setActiveSelection("task");
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
    setActiveSelection("task");
    setRulesetNameDraft("");
    setBlockedDelete(null);
  }

  function updateActiveProfile(field: Exclude<ConfigurableField, "availableActions" | "successOutcomes">, value: TaskBehaviorPolicy[typeof field]) {
    if (isSavingPolicyArray || isSavingPolicyArrayRef.current) return;
    if (isCreateOpen) {
      setCustomTaskTypeDraft((current) => ({ ...current, [field]: value }));
      return;
    } else if (selectedRuleset) {
      void onCustomRulesetChange?.(selectedRuleset.id, field, value);
      return;
    }
    void onChange(activeTab, field, value);
  }

  async function toggleAvailableAction(action: TaskManualAction) {
    if (isSavingPolicyArray || isSavingPolicyArrayRef.current) return;
    if (isCreateOpen) {
      const currentActions = normalizeTaskManualActions(customTaskTypeDraft.availableActions);
      const nextActions = currentActions.includes(action)
        ? currentActions.filter((current) => current !== action)
        : [...currentActions, action];
      setCustomTaskTypeDraft((current) => ({ ...current, availableActions: nextActions }));
      return;
    }
    isSavingPolicyArrayRef.current = true;
    const currentActions = normalizeTaskManualActions(activeProfile.availableActions);
    const nextActions = normalizeTaskManualActions(
      currentActions.includes(action)
        ? currentActions.filter((current) => current !== action)
        : [...currentActions, action],
    );
    setIsSavingPolicyArray(true);
    try {
      const saved = selectedRuleset
        ? await onCustomRulesetChange?.(selectedRuleset.id, "availableActions", nextActions)
        : await onChange(activeTab, "availableActions", nextActions);
      if (saved === false) return;
    } finally {
      isSavingPolicyArrayRef.current = false;
      setIsSavingPolicyArray(false);
    }
  }

  async function toggleSuccessOutcome(outcome: TaskSuccessOutcome) {
    if (isSavingPolicyArray || isSavingPolicyArrayRef.current) return;
    const currentOutcomes = normalizeTaskSuccessOutcomes(activeProfile.successOutcomes);
    const nextOutcomes = normalizeTaskSuccessOutcomes(
      currentOutcomes.includes(outcome)
        ? currentOutcomes.filter((current) => current !== outcome)
        : [...currentOutcomes, outcome],
    );
    if (isCreateOpen) {
      setCustomTaskTypeDraft((current) => ({ ...current, successOutcomes: nextOutcomes }));
      return;
    }
    isSavingPolicyArrayRef.current = true;
    setIsSavingPolicyArray(true);
    try {
      const saved = selectedRuleset
        ? await onCustomRulesetChange?.(selectedRuleset.id, "successOutcomes", nextOutcomes)
        : await onChange(activeTab, "successOutcomes", nextOutcomes);
      if (saved === false) return;
    } finally {
      isSavingPolicyArrayRef.current = false;
      setIsSavingPolicyArray(false);
    }
  }

  async function resetDefaults() {
    if (isSavingPolicyArray || isSavingPolicyArrayRef.current) return;
    const label = "Task";
    if (!window.confirm(`Reset ${label} behavior defaults? This changes only the ${label} profile and leaves Task History unchanged.`)) return;
    setResetting(true);
    await onReset("task");
    setResetting(false);
  }

  const behaviorControls = (
    <BehaviorControls
      activeProfile={activeProfile}
      disabled={isSavingPolicyArray}
      onChange={{
        unresolvedOccurrence: (value) => { updateActiveProfile("unresolvedOccurrence", value); },
        missedStreakOnUnhandled: (value) => { updateActiveProfile("missedStreakOnUnhandled", value); },
        rewards: (value) => { updateActiveProfile("rewards", value); },
      }}
      onToggleAvailableAction={toggleAvailableAction}
      onToggleSuccessOutcome={toggleSuccessOutcome}
    />
  );

  return (
    <AdhdPanel
      className="max-h-[min(72vh,44rem)] overflow-y-auto"
      header={(
        <div className="flex items-start justify-between gap-3">
      <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#9b92be] dark:text-white/35">Task Types</p>
            <h3 className="mt-1 text-lg font-semibold text-[#2f294a] dark:text-white">Behavior settings</h3>
            <p className="mt-1 text-sm leading-5 text-[#7d7598] dark:text-white/55">Profiles shape one shared Task Engine. Task uses standard behavior, and named Custom Task Types use saved behavior configurations.</p>
            <p className="mt-2 text-xs leading-5 text-[#988eb9] dark:text-white/45">Custom Task Types keep their own effective-dated behavior revisions.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
          {activeTab === "task" ? (
            <AdhdChip className="gap-1.5" disabled={resetting || isSavingPolicyArray} icon={<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => { void resetDefaults(); }} tone="default">
              {resetting ? "Resetting…" : "Reset Task Defaults"}
            </AdhdChip>
          ) : null}
          <AdhdChip className="gap-1.5" disabled={!onCreateCustomRuleset || isCreating} onClick={openCreate} tone="purple">
            + New Custom Task Type
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
            Custom Task Type name
            <input
              aria-label="Custom Task Type name"
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
          <div className="mt-4 rounded-[1rem] border border-[#eee9f8] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.035]">
            <p className="mb-3 text-xs font-semibold text-[#655d7d] dark:text-white/65">Presentation identity</p>
            <PresentationControls disabled={isCreating} onChange={(next) => setCustomTaskTypePresentationDraft((current) => normalizeTaskTypePresentation({ ...current, ...next }))} presentation={customTaskTypePresentationDraft} />
            <label className="mt-3 grid gap-1.5 text-xs font-semibold text-[#655d7d] dark:text-white/65" htmlFor="new-custom-ruleset-description">
              Short description
              <textarea aria-label="Custom Task Type description" className={`${TASK_TABLE_INPUT_CLASS} min-h-16 resize-y`} disabled={isCreating} id="new-custom-ruleset-description" maxLength={240} onChange={(event) => setCustomTaskTypePresentationDraft((current) => ({ ...current, description: event.target.value }))} placeholder="What is this type for?" value={customTaskTypePresentationDraft.description} />
            </label>
          </div>
          <div className="mt-4">
            <p className="mb-3 text-xs leading-5 text-[#7d7598] dark:text-white/50">Configure the behavior before creating this named Custom Task Type. Nothing is saved until you choose Create.</p>
            {behaviorControls}
          </div>
          <div className="mt-2 flex flex-wrap justify-end gap-1.5">
            <AdhdChip disabled={isCreating} icon={<X aria-hidden="true" className="h-3.5 w-3.5" />} onClick={cancelCreate} tone="default">Cancel</AdhdChip>
            <AdhdChip disabled={isCreating} icon={<Check aria-hidden="true" className="h-3.5 w-3.5" />} type="submit" tone="purple">{isCreating ? "Creating…" : "Create Custom Task Type"}</AdhdChip>
          </div>
        </form>
      ) : null}
      {!isCreateOpen ? <>
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Task Type behavior profiles">
        {selectionOptions.map((option) => (
          <AdhdChip disabled={isSavingPolicyArray} key={option.value} onClick={() => selectProfile(option.value)} selected={activeSelection === option.value} type="button" role="tab" aria-selected={activeSelection === option.value}>
          <TaskTypeIdentity compact option={option} selected={activeSelection === option.value} />
          </AdhdChip>
        ))}
      </div>

      {selectedRuleset ? (
        <div className="mb-4 rounded-[1rem] border border-[#eee9f8] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.035]">
          {selectedOption ? <div className="mb-3"><TaskTypeIdentity option={selectedOption} /></div> : null}
          <label className="grid gap-1.5 text-xs font-semibold text-[#655d7d] dark:text-white/65" htmlFor="selected-custom-ruleset-name">
            Custom Task Type name
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
              <AdhdChip disabled={!onDeleteCustomRuleset || isRenaming || isDeleting || isResolvingDelete} icon={<Trash2 aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => { void deleteRuleset(); }} tone="danger">{isDeleting ? "Deleting…" : "Delete Custom Task Type"}</AdhdChip>
            </div>
          </label>
          <div className="mt-4 border-t border-[#eee9f8] pt-3 dark:border-white/10">
              <PresentationControls disabled={isSavingPresentation || isDeleting} onChange={updateSelectedPresentation} presentation={normalizeTaskTypePresentation({ accentKey: selectedRuleset.accent_key, description: rulesetDescriptionDraft, iconKey: selectedRuleset.icon_key })} />
              <label className="mt-3 grid gap-1.5 text-xs font-semibold text-[#655d7d] dark:text-white/65" htmlFor="selected-custom-ruleset-description">
                Short description
                <textarea aria-label={`Description for ${selectedRuleset.name}`} className={`${TASK_TABLE_INPUT_CLASS} min-h-16 resize-y`} disabled={isSavingPresentation || isDeleting} id="selected-custom-ruleset-description" maxLength={240} onChange={(event) => setRulesetDescriptionDraft(event.target.value)} value={rulesetDescriptionDraft} />
              </label>
              <div className="mt-2 flex justify-end"><AdhdChip disabled={isSavingPresentation || isDeleting} onClick={() => { void savePresentation(); }} tone="default">{isSavingPresentation ? "Saving…" : "Save description"}</AdhdChip></div>
          </div>
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

      {activeTab === "task" || selectedRuleset ? (
        behaviorControls
      ) : (
        <div className="rounded-[1rem] border border-dashed border-[#ddd6f5] bg-white px-4 py-6 text-sm text-[#7d7598] dark:border-white/12 dark:bg-white/[0.025] dark:text-white/55">
          {taskTypeBehaviorTabDescription(activeTab)}
        </div>
      )}
      </> : null}
    </AdhdPanel>
  );
}
