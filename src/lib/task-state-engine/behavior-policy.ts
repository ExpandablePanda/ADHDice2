/**
 * A Task Behavior Policy is engine configuration, not persisted Task data.
 *
 * The policy is intentionally resolved outside the Task row so future
 * user-facing TaskType values can select a profile without creating another
 * Task Engine or another source of recurrence, Calendar, streak, rollover,
 * or reward rules.
 *
 * The semantic fields below describe decisions the one Task Engine can
 * consume. Task and Custom are the currently active configurable profiles;
 * Pursuit and Goal retain the Standard fallback until their semantics are
 * approved.
 */
import type { TaskType } from "../task-type.ts";
import { isTaskType } from "../task-type.ts";

export type UnresolvedOccurrenceBehavior = "missed" | "blank";
/**
 * @deprecated Compatibility-only value for persisted pre-7.13.32 rows. The
 * authoritative positive streak invariant always breaks on an unfinished
 * scheduled occurrence, regardless of this value.
 */
export type PositiveStreakUnhandledBehavior = "break" | "preserve";
export type MissedStreakUnhandledBehavior = "increment" | "ignore";
export type RewardBehavior = "enabled" | "disabled";
export type TaskManualAction = "done" | "did_my_best" | "missed" | "delay" | "complete";
export type TaskNeedsActionTrigger = "missed" | "due_today" | "overdue";

/** Stable persisted order for the manual occurrence-action vocabulary. */
export const STANDARD_TASK_AVAILABLE_ACTIONS: readonly TaskManualAction[] = Object.freeze([
  "done",
  "did_my_best",
  "missed",
  "delay",
  "complete",
]);

/** Stable persisted order for the Task Needs Action trigger vocabulary. */
export const STANDARD_TASK_NEEDS_ACTION_TRIGGERS: readonly TaskNeedsActionTrigger[] = Object.freeze([
  "missed",
  "due_today",
  "overdue",
]);

export type TaskBehaviorPolicy = Readonly<{
  id: string;
  unresolvedOccurrence: UnresolvedOccurrenceBehavior;
  /** @deprecated Compatibility-only persistence field; never controls streak behavior. */
  positiveStreakOnUnhandled: PositiveStreakUnhandledBehavior;
  missedStreakOnUnhandled: MissedStreakUnhandledBehavior;
  rewards: RewardBehavior;
  availableActions: readonly TaskManualAction[];
  /** Presentation-only upper bound for Task Needs Action membership. */
  needsActionTriggers: readonly TaskNeedsActionTrigger[];
}>;

export type TaskBehaviorPolicyRevision = Readonly<TaskBehaviorPolicy & {
  effectiveFromLogicalDate: string;
}>;

export type TaskBehaviorPolicyRevisions = readonly TaskBehaviorPolicyRevision[];
export type TaskBehaviorPolicyRevisionMap = Readonly<Partial<Record<TaskType, TaskBehaviorPolicyRevisions>>>;
/** Revisions keyed by the stable identity of a reusable Custom ruleset. */
export type NamedCustomRulesetBehaviorPolicyRevisionMap = Readonly<Record<string, TaskBehaviorPolicyRevisions>>;
/** Complete behavior-selection history keyed by the stable identity of a canonical Task. */
export type TaskBehaviorSelection = Readonly<{
  effectiveFromLogicalDate: string;
  taskType: TaskType;
  customRulesetId: string | null;
}>;
export type TaskBehaviorSelectionMap = Readonly<Record<string, readonly TaskBehaviorSelection[]>>;
export type ActiveTaskBehaviorProfileTaskType = "task" | "custom";

/** User-configurable policy fields. Positive streak preservation is not configurable. */
export type TaskBehaviorPolicyField = Exclude<keyof TaskBehaviorPolicy, "id" | "positiveStreakOnUnhandled">;
export type TaskBehaviorProfiles = Readonly<Partial<Record<TaskType, TaskBehaviorPolicy>>>;

export type TaskBehaviorPolicyResolutionContext = {
  behaviorProfiles?: TaskBehaviorProfiles;
  behaviorPolicyRevisions?: TaskBehaviorPolicyRevisionMap;
  namedCustomRulesetBehaviorPolicyRevisions?: NamedCustomRulesetBehaviorPolicyRevisionMap;
  behaviorSelectionsByTaskId?: TaskBehaviorSelectionMap;
};

export type TaskBehaviorProjectionSemantics = {
  activeStatus: {
    profile: Pick<TaskBehaviorPolicy, "unresolvedOccurrence">;
    revisions: readonly Pick<TaskBehaviorPolicyRevision, "effectiveFromLogicalDate" | "unresolvedOccurrence">[];
  };
  streak: {
    profile: Pick<TaskBehaviorPolicy, "unresolvedOccurrence" | "missedStreakOnUnhandled">;
    revisions: readonly Pick<TaskBehaviorPolicyRevision, "effectiveFromLogicalDate" | "unresolvedOccurrence" | "missedStreakOnUnhandled">[];
  };
  rewards: {
    profile: Pick<TaskBehaviorPolicy, "rewards">;
    revisions: readonly Pick<TaskBehaviorPolicyRevision, "effectiveFromLogicalDate" | "rewards">[];
  };
};

const POLICY_VALUES = {
  unresolvedOccurrence: new Set<UnresolvedOccurrenceBehavior>(["missed", "blank"]),
  missedStreakOnUnhandled: new Set<MissedStreakUnhandledBehavior>(["increment", "ignore"]),
  rewards: new Set<RewardBehavior>(["enabled", "disabled"]),
} as const;

const LEGACY_POSITIVE_STREAK_VALUES = new Set<PositiveStreakUnhandledBehavior>(["break", "preserve"]);
const TASK_MANUAL_ACTION_VALUES = new Set<TaskManualAction>(STANDARD_TASK_AVAILABLE_ACTIONS);
const TASK_NEEDS_ACTION_TRIGGER_VALUES = new Set<TaskNeedsActionTrigger>(STANDARD_TASK_NEEDS_ACTION_TRIGGERS);
type ScalarTaskBehaviorPolicyField = Exclude<TaskBehaviorPolicyField, "availableActions" | "needsActionTriggers">;

function areOrderedValuesEqual<T>(left: readonly T[], right: readonly T[]) {
  return left.length === right.length && left.every((action, index) => action === right[index]);
}

/** Normalize persisted/manual action input to valid, unique, canonical order. */
export function normalizeTaskManualActions(input: unknown): readonly TaskManualAction[] {
  // A missing or malformed field is an additive-schema compatibility case. Keep
  // existing behavior until the new column is available and readable.
  if (!Array.isArray(input)) return STANDARD_TASK_AVAILABLE_ACTIONS;
  const requested = new Set(input.filter((value): value is TaskManualAction => TASK_MANUAL_ACTION_VALUES.has(value as TaskManualAction)));
  return Object.freeze(STANDARD_TASK_AVAILABLE_ACTIONS.filter((action) => requested.has(action)));
}

/** Normalize persisted Needs Action input to valid, unique, canonical order. */
export function normalizeTaskNeedsActionTriggers(input: unknown): readonly TaskNeedsActionTrigger[] {
  // A missing or malformed field is an additive-schema compatibility case. Keep
  // existing Attention behavior until the new column is available and readable.
  if (!Array.isArray(input)) return STANDARD_TASK_NEEDS_ACTION_TRIGGERS;
  const requested = new Set(input.filter((value): value is TaskNeedsActionTrigger => TASK_NEEDS_ACTION_TRIGGER_VALUES.has(value as TaskNeedsActionTrigger)));
  return Object.freeze(STANDARD_TASK_NEEDS_ACTION_TRIGGERS.filter((trigger) => requested.has(trigger)));
}

/** The behavior every existing Task uses until a later profile is selected. */
export const STANDARD_TASK_BEHAVIOR_POLICY: TaskBehaviorPolicy = Object.freeze({
  id: "standard-task",
  unresolvedOccurrence: "missed",
  positiveStreakOnUnhandled: "break",
  missedStreakOnUnhandled: "increment",
  rewards: "enabled",
  availableActions: STANDARD_TASK_AVAILABLE_ACTIONS,
  needsActionTriggers: STANDARD_TASK_NEEDS_ACTION_TRIGGERS,
});

/** Only these TaskTypes may supply revision timelines to the shared engine. */
export function isActiveTaskBehaviorProfileTaskType(taskType: TaskType): taskType is ActiveTaskBehaviorProfileTaskType {
  return taskType === "task" || taskType === "custom";
}

/**
 * Projection-specific policy inputs. Keep this at the engine boundary so a
 * change to one behavior concern cannot invalidate unrelated projections.
 */
export function selectTaskBehaviorProjectionSemantics(input: {
  behaviorProfiles?: TaskBehaviorProfiles;
  behaviorPolicyRevisions?: TaskBehaviorPolicyRevisionMap;
  customRulesetId?: string | null;
  namedCustomRulesetBehaviorPolicyRevisions?: NamedCustomRulesetBehaviorPolicyRevisionMap;
  behaviorSelectionsByTaskId?: TaskBehaviorSelectionMap;
  logicalDate?: string;
  taskId?: string;
  taskType?: TaskType | null;
}): TaskBehaviorProjectionSemantics {
  const taskType = input.taskType === "task" || input.taskType === undefined || input.taskType === null
    ? "task"
    : input.taskType;
  const resolved = input.logicalDate
    ? resolveTaskBehaviorPolicyForTask({
      behaviorProfiles: input.behaviorProfiles,
      behaviorPolicyRevisions: input.behaviorPolicyRevisions,
      behaviorSelectionsByTaskId: input.behaviorSelectionsByTaskId,
      customRulesetId: input.customRulesetId,
      logicalDate: input.logicalDate,
      namedCustomRulesetBehaviorPolicyRevisions: input.namedCustomRulesetBehaviorPolicyRevisions,
      taskId: input.taskId,
      taskType,
    })
    : null;
  const assignedCustomRulesetRevisions = taskType === "custom" && input.customRulesetId
    ? input.namedCustomRulesetBehaviorPolicyRevisions?.[input.customRulesetId] ?? []
    : [];
  const revisions = resolved?.revisions
    ?? (assignedCustomRulesetRevisions.length > 0
      ? assignedCustomRulesetRevisions
      : isActiveTaskBehaviorProfileTaskType(taskType) && !input.customRulesetId
        ? input.behaviorPolicyRevisions?.[taskType] ?? []
        : []);
  const profile = resolved?.policy
    ?? (assignedCustomRulesetRevisions.length > 0
      ? normalizeTaskBehaviorProfile(assignedCustomRulesetRevisions.at(-1), "custom")
      : isActiveTaskBehaviorProfileTaskType(taskType) && !input.customRulesetId
        ? normalizeTaskBehaviorProfile(input.behaviorProfiles?.[taskType], taskType)
        : STANDARD_TASK_BEHAVIOR_POLICY);
  return {
    activeStatus: {
      profile: { unresolvedOccurrence: profile.unresolvedOccurrence },
      revisions: revisions.map((revision) => ({
        effectiveFromLogicalDate: revision.effectiveFromLogicalDate,
        unresolvedOccurrence: revision.unresolvedOccurrence,
      })),
    },
    streak: {
      profile: {
        missedStreakOnUnhandled: profile.missedStreakOnUnhandled,
        unresolvedOccurrence: profile.unresolvedOccurrence,
      },
      revisions: revisions.map((revision) => ({
        effectiveFromLogicalDate: revision.effectiveFromLogicalDate,
        missedStreakOnUnhandled: revision.missedStreakOnUnhandled,
        unresolvedOccurrence: revision.unresolvedOccurrence,
      })),
    },
    rewards: {
      profile: { rewards: profile.rewards },
      revisions: revisions.map((revision) => ({
        effectiveFromLogicalDate: revision.effectiveFromLogicalDate,
        rewards: revision.rewards,
      })),
    },
  };
}

function isPolicyValue<T extends ScalarTaskBehaviorPolicyField>(field: T, value: unknown): value is TaskBehaviorPolicy[T] {
  return POLICY_VALUES[field].has(value as never);
}

function isLegacyPositiveStreakValue(value: unknown): value is PositiveStreakUnhandledBehavior {
  return LEGACY_POSITIVE_STREAK_VALUES.has(value as PositiveStreakUnhandledBehavior);
}

function isStandardPolicyValues(input: Pick<TaskBehaviorPolicy, "unresolvedOccurrence" | "positiveStreakOnUnhandled" | "missedStreakOnUnhandled" | "rewards" | "availableActions" | "needsActionTriggers">) {
  return input.unresolvedOccurrence === STANDARD_TASK_BEHAVIOR_POLICY.unresolvedOccurrence
    && input.positiveStreakOnUnhandled === STANDARD_TASK_BEHAVIOR_POLICY.positiveStreakOnUnhandled
    && input.missedStreakOnUnhandled === STANDARD_TASK_BEHAVIOR_POLICY.missedStreakOnUnhandled
    && input.rewards === STANDARD_TASK_BEHAVIOR_POLICY.rewards
    && areOrderedValuesEqual(input.availableActions, STANDARD_TASK_AVAILABLE_ACTIONS)
    && areOrderedValuesEqual(input.needsActionTriggers, STANDARD_TASK_NEEDS_ACTION_TRIGGERS);
}

/** Normalize untrusted database/profile data to one complete engine policy. */
export function normalizeTaskBehaviorProfile(input: unknown, taskType: TaskType = "task"): TaskBehaviorPolicy {
  if (typeof input !== "object" || input === null) return STANDARD_TASK_BEHAVIOR_POLICY;
  const candidate = input as Partial<TaskBehaviorPolicy> & { availableActions?: unknown; needsActionTriggers?: unknown };
  const positiveStreakOnUnhandled = candidate.positiveStreakOnUnhandled ?? "break";
  if (typeof candidate.id === "string"
    && candidate.id.trim()
    && "unresolvedOccurrence" in candidate
    && "positiveStreakOnUnhandled" in candidate
    && "missedStreakOnUnhandled" in candidate
    && "rewards" in candidate
    && Array.isArray(candidate.availableActions)
    && Array.isArray(candidate.needsActionTriggers)
    && isPolicyValue("unresolvedOccurrence", candidate.unresolvedOccurrence)
    && isLegacyPositiveStreakValue(candidate.positiveStreakOnUnhandled)
    && isPolicyValue("missedStreakOnUnhandled", candidate.missedStreakOnUnhandled)
    && isPolicyValue("rewards", candidate.rewards)
    && areOrderedValuesEqual(normalizeTaskManualActions(candidate.availableActions), candidate.availableActions as TaskManualAction[])
    && areOrderedValuesEqual(normalizeTaskNeedsActionTriggers(candidate.needsActionTriggers), candidate.needsActionTriggers as TaskNeedsActionTrigger[])) {
    return candidate as TaskBehaviorPolicy;
  }
  if (!isPolicyValue("unresolvedOccurrence", candidate.unresolvedOccurrence)
    || !isLegacyPositiveStreakValue(positiveStreakOnUnhandled)
    || !isPolicyValue("missedStreakOnUnhandled", candidate.missedStreakOnUnhandled)
    || !isPolicyValue("rewards", candidate.rewards)) {
    return STANDARD_TASK_BEHAVIOR_POLICY;
  }
  const values: Pick<TaskBehaviorPolicy, TaskBehaviorPolicyField> = {
    unresolvedOccurrence: candidate.unresolvedOccurrence as UnresolvedOccurrenceBehavior,
    missedStreakOnUnhandled: candidate.missedStreakOnUnhandled as MissedStreakUnhandledBehavior,
    rewards: candidate.rewards as RewardBehavior,
    availableActions: normalizeTaskManualActions(candidate.availableActions),
    needsActionTriggers: normalizeTaskNeedsActionTriggers(candidate.needsActionTriggers),
  };
  const completeValues = {
    ...values,
    positiveStreakOnUnhandled,
  } as Pick<TaskBehaviorPolicy, "unresolvedOccurrence" | "positiveStreakOnUnhandled" | "missedStreakOnUnhandled" | "rewards" | "availableActions" | "needsActionTriggers">;
  if (isStandardPolicyValues(completeValues)) return STANDARD_TASK_BEHAVIOR_POLICY;
  return Object.freeze({
    id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : `${taskType}-behavior-profile`,
    ...completeValues,
  });
}

export function normalizeTaskBehaviorProfiles(rows: readonly unknown[], logicalDate?: string): TaskBehaviorProfiles {
  const revisions = normalizeTaskBehaviorPolicyRevisions(rows);
  const profiles: Partial<Record<TaskType, TaskBehaviorPolicy>> = {};
  const targetDate = logicalDate ?? revisions.map((revision) => revision.effectiveFromLogicalDate).sort().at(-1) ?? "0000-00-00";
  for (const taskType of ["task", "pursuit", "goal", "custom"] as const) {
    const taskRevision = revisions
      .filter((candidate) => candidate.taskType === taskType && candidate.effectiveFromLogicalDate <= targetDate)
      .at(-1);
    if (taskRevision) {
      profiles[taskType] = normalizeTaskBehaviorProfile({
        id: `${taskType}-behavior-profile`,
        unresolvedOccurrence: taskRevision.unresolvedOccurrence,
        positiveStreakOnUnhandled: taskRevision.positiveStreakOnUnhandled,
        missedStreakOnUnhandled: taskRevision.missedStreakOnUnhandled,
        rewards: taskRevision.rewards,
        availableActions: taskRevision.availableActions,
        needsActionTriggers: taskRevision.needsActionTriggers,
      }, taskType);
    }
  }
  return profiles;
}

export type NormalizedTaskBehaviorPolicyRevision = TaskBehaviorPolicyRevision & { taskType: TaskType };

function isLogicalDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Normalize and deterministically order the user-scoped revision timeline. */
export function normalizeTaskBehaviorPolicyRevisions(rows: readonly unknown[]): NormalizedTaskBehaviorPolicyRevision[] {
  const revisions: NormalizedTaskBehaviorPolicyRevision[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const candidate = row as { task_type?: unknown; effective_from_logical_date?: unknown };
    if (!isTaskType(candidate.task_type)) continue;
    if (!isLogicalDate(candidate.effective_from_logical_date)) continue;
    const policy = normalizeTaskBehaviorProfile({
      id: `${candidate.task_type}-behavior-profile`,
      unresolvedOccurrence: (row as { unresolved_occurrence?: unknown }).unresolved_occurrence,
      positiveStreakOnUnhandled: (row as { positive_streak_on_unhandled?: unknown }).positive_streak_on_unhandled,
      missedStreakOnUnhandled: (row as { missed_streak_on_unhandled?: unknown }).missed_streak_on_unhandled,
      rewards: (row as { rewards?: unknown }).rewards,
      availableActions: (row as { available_actions?: unknown }).available_actions,
      needsActionTriggers: (row as { needs_action_triggers?: unknown }).needs_action_triggers,
    }, candidate.task_type);
    if (policy === STANDARD_TASK_BEHAVIOR_POLICY && !(
      (row as { unresolved_occurrence?: unknown }).unresolved_occurrence === "missed"
      && (row as { positive_streak_on_unhandled?: unknown }).positive_streak_on_unhandled === "break"
      && (row as { missed_streak_on_unhandled?: unknown }).missed_streak_on_unhandled === "increment"
      && (row as { rewards?: unknown }).rewards === "enabled"
    )) continue;
    revisions.push({
      ...policy,
      effectiveFromLogicalDate: candidate.effective_from_logical_date,
      taskType: candidate.task_type,
    });
  }
  return revisions.sort((left, right) => left.taskType.localeCompare(right.taskType)
    || left.effectiveFromLogicalDate.localeCompare(right.effectiveFromLogicalDate)
    || left.id.localeCompare(right.id));
}

/**
 * Resolve the policy effective on an ADHDice logical date. The earliest
 * revision is the profile baseline until a later effective-dated revision
 * supersedes it.
 */
export function resolveTaskBehaviorPolicyForLogicalDate(input: {
  revisions?: readonly Pick<TaskBehaviorPolicyRevision, "effectiveFromLogicalDate" | "unresolvedOccurrence" | "positiveStreakOnUnhandled" | "missedStreakOnUnhandled" | "rewards" | "availableActions" | "needsActionTriggers">[];
  logicalDate: string;
}): TaskBehaviorPolicy {
  const orderedRevisions = [...(input.revisions ?? [])]
    .sort((left, right) => left.effectiveFromLogicalDate.localeCompare(right.effectiveFromLogicalDate));
  const revision = orderedRevisions
    .filter((candidate) => candidate.effectiveFromLogicalDate <= input.logicalDate)
    .at(-1)
    ?? orderedRevisions[0];
  if (!revision) return STANDARD_TASK_BEHAVIOR_POLICY;
  return normalizeTaskBehaviorProfile({
    ...revision,
    id: "effective-task-behavior-policy",
  });
}

/** Resolve a persisted TaskType, or a compatibility policy input, to the current profile. */
export function resolveTaskBehaviorPolicy(
  input?: TaskType | TaskBehaviorPolicy | null,
  profiles?: TaskBehaviorProfiles,
  revisions?: TaskBehaviorPolicyRevisionMap,
  logicalDate?: string,
): TaskBehaviorPolicy {
  if (input && typeof input === "object") {
    return normalizeTaskBehaviorProfile(input);
  }
  if (isTaskType(input)) {
    if (isActiveTaskBehaviorProfileTaskType(input)) {
      if (logicalDate && revisions?.[input]?.length) {
        return resolveTaskBehaviorPolicyForLogicalDate({ revisions: revisions[input], logicalDate });
      }
      if (profiles?.[input]) return normalizeTaskBehaviorProfile(profiles[input], input);
    }
    return STANDARD_TASK_BEHAVIOR_POLICY;
  }
  if (profiles?.task) return normalizeTaskBehaviorProfile(profiles.task, "task");
  return STANDARD_TASK_BEHAVIOR_POLICY;
}

/**
 * Resolve the policy selected by one stored Task. A behavior selection is the
 * complete TaskType + optional named-ruleset pair, so historical TaskType
 * transitions never fall through to the current Task projection.
 */
export function resolveTaskBehaviorPolicyForTask(input: TaskBehaviorPolicyResolutionContext & {
  customRulesetId?: string | null;
  logicalDate: string;
  taskId?: string;
  taskType: TaskType;
}) {
  const selectionRows = input.taskId
    ? [...(input.behaviorSelectionsByTaskId?.[input.taskId] ?? [])]
      .filter((selection) => isTaskTypeSelection(selection))
      .sort((left, right) => left.effectiveFromLogicalDate.localeCompare(right.effectiveFromLogicalDate))
    : [];
  if (selectionRows.length === 0) {
    const currentNamedRulesetRevisions = input.taskType === "custom" && input.customRulesetId
      ? input.namedCustomRulesetBehaviorPolicyRevisions?.[input.customRulesetId] ?? []
      : [];
    if (input.taskType === "custom" && input.customRulesetId) {
      return {
        policy: resolveTaskBehaviorPolicyForLogicalDate({
          revisions: currentNamedRulesetRevisions,
          logicalDate: input.logicalDate,
        }),
        revisions: currentNamedRulesetRevisions,
      };
    }
    const revisions = isActiveTaskBehaviorProfileTaskType(input.taskType)
      ? input.behaviorPolicyRevisions?.[input.taskType] ?? []
      : [];
    return {
      policy: isActiveTaskBehaviorProfileTaskType(input.taskType)
        ? resolveTaskBehaviorPolicy(input.taskType, input.behaviorProfiles, input.behaviorPolicyRevisions, input.logicalDate)
        : STANDARD_TASK_BEHAVIOR_POLICY,
      revisions,
    };
  }
  const selections = selectionRows;
  const revisions = buildBehaviorSelectionPolicyRevisions({
    selections,
    behaviorProfiles: input.behaviorProfiles,
    behaviorPolicyRevisions: input.behaviorPolicyRevisions,
    namedCustomRulesetBehaviorPolicyRevisions: input.namedCustomRulesetBehaviorPolicyRevisions,
  });
  const effectiveSelection = selections
    .filter((selection) => selection.effectiveFromLogicalDate <= input.logicalDate)
    .at(-1) ?? selections[0];
  const resolvedPolicy = resolveTaskBehaviorPolicyForLogicalDate({ revisions, logicalDate: input.logicalDate });
  return {
    policy: effectiveSelection && !isActiveTaskBehaviorProfileTaskType(effectiveSelection.taskType)
      ? STANDARD_TASK_BEHAVIOR_POLICY
      : resolvedPolicy,
    revisions,
  };
}

function selectionPolicyRevisions(
  selection: TaskBehaviorSelection,
  context: Pick<TaskBehaviorPolicyResolutionContext, "behaviorPolicyRevisions" | "namedCustomRulesetBehaviorPolicyRevisions">,
) {
  if (selection.taskType === "custom" && selection.customRulesetId) {
    return context.namedCustomRulesetBehaviorPolicyRevisions?.[selection.customRulesetId] ?? [];
  }
  return isActiveTaskBehaviorProfileTaskType(selection.taskType)
    ? context.behaviorPolicyRevisions?.[selection.taskType] ?? []
    : [];
}

/**
 * Convert behavior-selection segments into the one effective-dated revision
 * stream consumed by the existing engine. The first selection is deliberately
 * emitted as the stream baseline, so dates before it retain that selection.
 */
function buildBehaviorSelectionPolicyRevisions(input: {
  selections: readonly TaskBehaviorSelection[];
  behaviorProfiles?: TaskBehaviorProfiles;
  behaviorPolicyRevisions?: TaskBehaviorPolicyRevisionMap;
  namedCustomRulesetBehaviorPolicyRevisions?: NamedCustomRulesetBehaviorPolicyRevisionMap;
}): TaskBehaviorPolicyRevision[] {
  const selections = [...input.selections]
    .sort((left, right) => left.effectiveFromLogicalDate.localeCompare(right.effectiveFromLogicalDate));
  const dates = new Set<string>();
  for (let index = 0; index < selections.length; index += 1) {
    const selection = selections[index];
    const nextEffectiveDate = selections[index + 1]?.effectiveFromLogicalDate ?? null;
    dates.add(selection.effectiveFromLogicalDate);
    for (const revision of selectionPolicyRevisions(selection, input)) {
      if (revision.effectiveFromLogicalDate >= selection.effectiveFromLogicalDate
        && (!nextEffectiveDate || revision.effectiveFromLogicalDate < nextEffectiveDate)) {
        dates.add(revision.effectiveFromLogicalDate);
      }
    }
  }
  return [...dates].sort().map((logicalDate) => {
    const selection = selections
      .filter((candidate) => candidate.effectiveFromLogicalDate <= logicalDate)
      .at(-1) ?? selections[0];
    const sourceRevisions = selectionPolicyRevisions(selection, input);
    const isNamedCustomSelection = selection.taskType === "custom" && selection.customRulesetId !== null;
    const policy = isNamedCustomSelection
      ? resolveTaskBehaviorPolicyForLogicalDate({ revisions: sourceRevisions, logicalDate })
      : sourceRevisions.length > 0
      ? resolveTaskBehaviorPolicyForLogicalDate({ revisions: sourceRevisions, logicalDate })
      : resolveTaskBehaviorPolicy(selection.taskType, input.behaviorProfiles, input.behaviorPolicyRevisions, logicalDate);
    return {
      ...policy,
      id: policy === STANDARD_TASK_BEHAVIOR_POLICY
        ? policy.id
        : `behavior-selection:${selection.taskType}:${selection.customRulesetId ?? "generic"}:${logicalDate}`,
      effectiveFromLogicalDate: logicalDate,
    };
  });
}

function isTaskTypeSelection(value: TaskBehaviorSelection): value is TaskBehaviorSelection {
  return isTaskType(value.taskType)
    && /^\d{4}-\d{2}-\d{2}$/.test(value.effectiveFromLogicalDate)
    && (value.customRulesetId === null || typeof value.customRulesetId === "string")
    && (value.customRulesetId === null || value.taskType === "custom");
}
