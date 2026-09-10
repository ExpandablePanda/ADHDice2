import type {
  CustomBehaviorRuleset,
  CustomBehaviorRulesetRevision,
  TaskCustomRulesetAssignment as PersistedTaskCustomRulesetAssignment,
} from "./database.types.ts";
import {
  normalizeTaskBehaviorProfile,
  type NamedCustomRulesetBehaviorPolicyRevisionMap,
  type TaskBehaviorPolicy,
  type TaskBehaviorPolicyRevision,
  type TaskBehaviorPolicyRevisions,
  type TaskCustomRulesetAssignment,
  type TaskCustomRulesetAssignmentMap,
} from "./task-state-engine/behavior-policy.ts";

type RulesetError = { code?: string; message?: string };
type RulesetQueryResult<T> = { data: T[] | null; error: RulesetError | null };

type RulesetSelectQuery<T> = {
  eq(column: string, value: string): Promise<RulesetQueryResult<T>>;
  then<TResult1 = RulesetQueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: RulesetQueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};

export type CustomBehaviorRulesetClient = {
  from(table: "adhdice_custom_behavior_rulesets"): {
    select(columns: string): RulesetSelectQuery<CustomBehaviorRuleset>;
  };
  from(table: "adhdice_custom_behavior_ruleset_revisions"): {
    select(columns: string): RulesetSelectQuery<CustomBehaviorRulesetRevision>;
  };
  from(table: "adhdice_task_custom_ruleset_assignments"): {
    select(columns: string): RulesetSelectQuery<PersistedTaskCustomRulesetAssignment>;
  };
};

export type LoadedCustomBehaviorRulesets = {
  data: CustomBehaviorRuleset[];
  revisions: NamedCustomRulesetBehaviorPolicyRevisionMap;
  assignmentsByTaskId: TaskCustomRulesetAssignmentMap;
  error: RulesetError | null;
  assignmentError?: RulesetError | null;
};

/** The browser-owned named Custom state that can be refreshed as one unit. */
export type CustomBehaviorRulesetState = Pick<
  LoadedCustomBehaviorRulesets,
  "data" | "revisions" | "assignmentsByTaskId"
>;

const LOGICAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const POLICY_VALUES = {
  unresolved_occurrence: new Set(["missed", "blank"]),
  positive_streak_on_unhandled: new Set(["break", "preserve"]),
  missed_streak_on_unhandled: new Set(["increment", "ignore"]),
  rewards: new Set(["enabled", "disabled"]),
} as const;

function isValidRevision(row: CustomBehaviorRulesetRevision) {
  return typeof row.ruleset_id === "string"
    && LOGICAL_DATE.test(row.effective_from_logical_date)
    && POLICY_VALUES.unresolved_occurrence.has(row.unresolved_occurrence)
    && POLICY_VALUES.positive_streak_on_unhandled.has(row.positive_streak_on_unhandled)
    && POLICY_VALUES.missed_streak_on_unhandled.has(row.missed_streak_on_unhandled)
    && POLICY_VALUES.rewards.has(row.rewards);
}

function toPolicyRevision(row: CustomBehaviorRulesetRevision): TaskBehaviorPolicyRevision {
  const policy = normalizeTaskBehaviorProfile({
    id: `custom-ruleset:${row.ruleset_id}`,
    unresolvedOccurrence: row.unresolved_occurrence,
    positiveStreakOnUnhandled: row.positive_streak_on_unhandled,
    missedStreakOnUnhandled: row.missed_streak_on_unhandled,
    rewards: row.rewards,
  }, "custom");
  return {
    ...policy,
    effectiveFromLogicalDate: row.effective_from_logical_date,
  };
}

function toAssignment(row: PersistedTaskCustomRulesetAssignment, userId: string): TaskCustomRulesetAssignment | null {
  if (row.user_id !== userId
    || typeof row.task_id !== "string"
    || !LOGICAL_DATE.test(row.effective_from_logical_date)
    || (row.custom_ruleset_id !== null && typeof row.custom_ruleset_id !== "string")) {
    return null;
  }
  return {
    effectiveFromLogicalDate: row.effective_from_logical_date,
    customRulesetId: row.custom_ruleset_id,
  };
}

/** Build a ruleset row without embedding user-created names into TaskType. */
export function customBehaviorRulesetUpsertPayload(userId: string, name: string) {
  return { user_id: userId, name: name.trim(), task_type: "custom" as const };
}

/** Build one independent effective-dated revision for a named ruleset. */
export function customBehaviorRulesetRevisionUpsertPayload(
  rulesetId: string,
  effectiveFromLogicalDate: string,
  policy: TaskBehaviorPolicy,
) {
  return {
    ruleset_id: rulesetId,
    effective_from_logical_date: effectiveFromLogicalDate,
    unresolved_occurrence: policy.unresolvedOccurrence,
    positive_streak_on_unhandled: policy.positiveStreakOnUnhandled,
    missed_streak_on_unhandled: policy.missedStreakOnUnhandled,
    rewards: policy.rewards,
  };
}

export function isMissingCustomBehaviorRulesetsTableError(error: RulesetError | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "42P01"
    || /adhdice_custom_behavior_ruleset|relation .* does not exist/i.test(message);
}

/** Load the named Custom identity rows and their separate revision timelines. */
export async function loadCustomBehaviorRulesets(
  client: CustomBehaviorRulesetClient,
  userId: string,
): Promise<LoadedCustomBehaviorRulesets> {
  if (!userId) return { data: [], revisions: {}, assignmentsByTaskId: {}, error: null, assignmentError: null };
  const [rulesetsResult, revisionsResult, assignmentsResult] = await Promise.all([
    client
      .from("adhdice_custom_behavior_rulesets")
      .select("id,user_id,name,task_type,created_at,updated_at")
      .eq("user_id", userId),
    client
      .from("adhdice_custom_behavior_ruleset_revisions")
      .select("ruleset_id,effective_from_logical_date,unresolved_occurrence,positive_streak_on_unhandled,missed_streak_on_unhandled,rewards,created_at,updated_at"),
    client
      .from("adhdice_task_custom_ruleset_assignments")
      .select("id,user_id,task_id,effective_from_logical_date,custom_ruleset_id,created_at,updated_at")
      .eq("user_id", userId),
  ]);
  if (rulesetsResult.error) return { data: [], revisions: {}, assignmentsByTaskId: {}, error: rulesetsResult.error, assignmentError: null };
  if (revisionsResult.error) return { data: [], revisions: {}, assignmentsByTaskId: {}, error: revisionsResult.error, assignmentError: null };

  const rulesets = (rulesetsResult.data ?? []).filter((ruleset) => ruleset.task_type === "custom");
  const rulesetIds = new Set(rulesets.map((ruleset) => ruleset.id));
  const revisions: Record<string, TaskBehaviorPolicyRevisions> = {};
  for (const row of revisionsResult.data ?? []) {
    if (!rulesetIds.has(row.ruleset_id) || !isValidRevision(row)) continue;
    const next = [...(revisions[row.ruleset_id] ?? []), toPolicyRevision(row)];
    revisions[row.ruleset_id] = next.sort((left, right) => left.effectiveFromLogicalDate.localeCompare(right.effectiveFromLogicalDate));
  }
  const assignmentsByTaskId: Record<string, TaskCustomRulesetAssignment[]> = {};
  for (const row of assignmentsResult.data ?? []) {
    const assignment = toAssignment(row, userId);
    if (!assignment) continue;
    assignmentsByTaskId[row.task_id] = [...(assignmentsByTaskId[row.task_id] ?? []), assignment]
      .sort((left, right) => left.effectiveFromLogicalDate.localeCompare(right.effectiveFromLogicalDate));
  }
  return {
    data: rulesets,
    revisions,
    assignmentsByTaskId,
    // A missing assignment table is a compatibility boundary: keep the 7.13.27
    // ruleset data usable and let callers treat the assignment map as empty.
    error: null,
    assignmentError: assignmentsResult.error ?? null,
  };
}
