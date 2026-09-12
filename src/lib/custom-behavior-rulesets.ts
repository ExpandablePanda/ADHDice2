import type {
  CustomBehaviorRuleset,
  CustomBehaviorRulesetRevision,
  TaskBehaviorSelection as PersistedTaskBehaviorSelection,
} from "./database.types.ts";
import {
  normalizeTaskBehaviorProfile,
  normalizeTaskManualActions,
  STANDARD_TASK_BEHAVIOR_POLICY,
  type NamedCustomRulesetBehaviorPolicyRevisionMap,
  type TaskBehaviorPolicy,
  type TaskBehaviorPolicyRevision,
  type TaskBehaviorPolicyRevisions,
  type TaskBehaviorSelection,
  type TaskBehaviorSelectionMap,
  type TaskManualAction,
} from "./task-state-engine/behavior-policy.ts";

type RulesetError = { code?: string; message?: string };
type RulesetQueryResult<T> = { data: T[] | null; error: RulesetError | null };
type CustomBehaviorRulesetNameCandidate = Pick<CustomBehaviorRuleset, "id" | "name"> & {
  /** Optional keeps pre-tombstone test/read fixtures compatible. */
  deleted_at?: string | null;
};

type RulesetSelectQuery<T> = {
  eq(column: string, value: string): Promise<RulesetQueryResult<T>>;
  then<TResult1 = RulesetQueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: RulesetQueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};

type RulesetMutationQuery<T> = {
  eq(column: string, value: string): RulesetMutationQuery<T>;
  select(columns: string): Promise<RulesetQueryResult<T>>;
  then<TResult1 = RulesetQueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: RulesetQueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};

type RulesetIdentityTable = {
  delete(): RulesetMutationQuery<CustomBehaviorRuleset>;
  insert(values: unknown): { select(columns: string): Promise<RulesetQueryResult<CustomBehaviorRuleset>> };
  select(columns: string): RulesetSelectQuery<CustomBehaviorRuleset>;
  update(values: unknown): RulesetMutationQuery<CustomBehaviorRuleset>;
};

type RulesetRevisionTable = {
  select(columns: string): RulesetSelectQuery<PersistedCustomBehaviorRulesetRevision>;
  upsert(values: unknown, options?: { onConflict?: string }): Promise<{ error: RulesetError | null }>;
};

type PersistedCustomBehaviorRulesetRevision = Omit<CustomBehaviorRulesetRevision, "available_actions"> & {
  /** Optional keeps pre-7.13.38 source/test rows compatible. */
  available_actions?: readonly TaskManualAction[] | null;
};

type BehaviorSelectionTable = {
  select(columns: string): RulesetSelectQuery<PersistedTaskBehaviorSelection>;
};

export type CustomBehaviorRulesetClient = {
  from(table: "adhdice_custom_behavior_rulesets"): RulesetIdentityTable;
  from(table: "adhdice_custom_behavior_ruleset_revisions"): RulesetRevisionTable;
  from(table: "adhdice_task_behavior_selections"): BehaviorSelectionTable;
  rpc(
    functionName: "adhdice_delete_custom_behavior_ruleset",
    args: { p_ruleset_id: string },
  ): Promise<{ data: unknown; error: RulesetError | null }>;
};

export type LoadedCustomBehaviorRulesets = {
  data: CustomBehaviorRuleset[];
  revisions: NamedCustomRulesetBehaviorPolicyRevisionMap;
  behaviorSelectionsByTaskId: TaskBehaviorSelectionMap;
  error: RulesetError | null;
  behaviorSelectionError?: RulesetError | null;
};

/** The browser-owned named Custom state that can be refreshed as one unit. */
export type CustomBehaviorRulesetState = Pick<
  LoadedCustomBehaviorRulesets,
  "data" | "revisions" | "behaviorSelectionsByTaskId"
>;

export type CustomBehaviorRulesetMutationResult<T> = {
  data: T | null;
  error: RulesetError | null;
};

export type CustomBehaviorRulesetDeleteActionResult = {
  assignedTaskCount: number | null;
  error: string | null;
  ok: boolean;
};

export function getCustomRulesetAssignedTaskCount(message: string | null | undefined) {
  const match = message?.match(/currently assigned to\s+(\d+)\s+Tasks?\b/i);
  return match ? Number(match[1]) : null;
}

const LOGICAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const POLICY_VALUES = {
  unresolved_occurrence: new Set(["missed", "blank"]),
  positive_streak_on_unhandled: new Set(["break", "preserve"]),
  missed_streak_on_unhandled: new Set(["increment", "ignore"]),
  rewards: new Set(["enabled", "disabled"]),
} as const;

function isValidRevision(row: PersistedCustomBehaviorRulesetRevision) {
  return typeof row.ruleset_id === "string"
    && LOGICAL_DATE.test(row.effective_from_logical_date)
    && POLICY_VALUES.unresolved_occurrence.has(row.unresolved_occurrence)
    && POLICY_VALUES.positive_streak_on_unhandled.has(row.positive_streak_on_unhandled)
    && POLICY_VALUES.missed_streak_on_unhandled.has(row.missed_streak_on_unhandled)
    && POLICY_VALUES.rewards.has(row.rewards);
}

function toPolicyRevision(row: PersistedCustomBehaviorRulesetRevision): TaskBehaviorPolicyRevision {
  const policy = normalizeTaskBehaviorProfile({
    id: `custom-ruleset:${row.ruleset_id}`,
    unresolvedOccurrence: row.unresolved_occurrence,
    positiveStreakOnUnhandled: row.positive_streak_on_unhandled,
    missedStreakOnUnhandled: row.missed_streak_on_unhandled,
    rewards: row.rewards,
    availableActions: row.available_actions,
  }, "custom");
  return {
    ...policy,
    effectiveFromLogicalDate: row.effective_from_logical_date,
  };
}

function toBehaviorSelection(row: PersistedTaskBehaviorSelection, userId: string): TaskBehaviorSelection | null {
  if (row.user_id !== userId
    || typeof row.task_id !== "string"
    || !LOGICAL_DATE.test(row.effective_from_logical_date)
    || !["task", "pursuit", "goal", "custom"].includes(row.task_type)
    || (row.custom_ruleset_id !== null && typeof row.custom_ruleset_id !== "string")
    || (row.custom_ruleset_id !== null && row.task_type !== "custom")) {
    return null;
  }
  return {
    effectiveFromLogicalDate: row.effective_from_logical_date,
    taskType: row.task_type,
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
    positive_streak_on_unhandled: STANDARD_TASK_BEHAVIOR_POLICY.positiveStreakOnUnhandled,
    missed_streak_on_unhandled: policy.missedStreakOnUnhandled,
    rewards: policy.rewards,
    available_actions: [...normalizeTaskManualActions(policy.availableActions)],
  };
}

export function normalizeCustomBehaviorRulesetName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function validateCustomBehaviorRulesetName(
  value: unknown,
  rulesets: readonly CustomBehaviorRulesetNameCandidate[] = [],
  excludedRulesetId?: string | null,
) {
  const name = normalizeCustomBehaviorRulesetName(value);
  if (!name) return { name, error: "Ruleset name cannot be blank." };
  const normalizedName = name.toLocaleLowerCase();
  if (rulesets.some((ruleset) => ruleset.id !== excludedRulesetId
    && ruleset.deleted_at == null
    && normalizeCustomBehaviorRulesetName(ruleset.name).toLocaleLowerCase() === normalizedName)) {
    return { name, error: "A ruleset with that name already exists." };
  }
  return { name, error: null };
}

function rulesetMutationError(message: string): CustomBehaviorRulesetMutationResult<never> {
  return { data: null, error: { message } };
}

function isValidCustomBehaviorRulesetIdentity(row: CustomBehaviorRuleset | null | undefined): row is CustomBehaviorRuleset {
  return Boolean(row)
    && typeof row.id === "string"
    && typeof row.user_id === "string"
    && typeof row.name === "string"
    && row.task_type === "custom"
    && (row.deleted_at === undefined || row.deleted_at === null || typeof row.deleted_at === "string");
}

/** Persist a named identity and its first revision without publishing a partial browser state. */
export async function createCustomBehaviorRuleset(
  client: CustomBehaviorRulesetClient,
  userId: string,
  nameInput: string,
  policy: TaskBehaviorPolicy,
  effectiveFromLogicalDate: string,
  loadedRulesets: readonly CustomBehaviorRulesetNameCandidate[] = [],
): Promise<CustomBehaviorRulesetMutationResult<CustomBehaviorRuleset>> {
  const validation = validateCustomBehaviorRulesetName(nameInput, loadedRulesets);
  if (validation.error) return rulesetMutationError(validation.error);
  if (!userId) return rulesetMutationError("Ruleset creation requires an authenticated user.");

  let identityResult: RulesetQueryResult<CustomBehaviorRuleset>;
  try {
    identityResult = await client
      .from("adhdice_custom_behavior_rulesets")
      .insert(customBehaviorRulesetUpsertPayload(userId, validation.name))
      .select("id,user_id,name,task_type,deleted_at,created_at,updated_at");
  } catch (error) {
    return rulesetMutationError(error instanceof Error ? error.message : "Could not create the Custom ruleset.");
  }
  if (identityResult.error) return { data: null, error: identityResult.error };
  const identity = identityResult.data?.[0];
  if (!isValidCustomBehaviorRulesetIdentity(identity) || identity.user_id !== userId) {
    return rulesetMutationError("Custom ruleset creation returned an unusable identity.");
  }

  let revisionResult: { error: RulesetError | null };
  try {
    revisionResult = await client
      .from("adhdice_custom_behavior_ruleset_revisions")
      .upsert(customBehaviorRulesetRevisionUpsertPayload(identity.id, effectiveFromLogicalDate, policy), {
        onConflict: "ruleset_id,effective_from_logical_date",
      });
  } catch (error) {
    revisionResult = { error: { message: error instanceof Error ? error.message : "Could not save the Custom ruleset policy." } };
  }
  if (revisionResult.error) {
    // No Task or assignment can reference this just-created identity yet. Remove
    // only this failed creation so an identity without its first policy cannot
    // become a browser-visible orphans through a later refresh.
    try {
      await client
        .from("adhdice_custom_behavior_rulesets")
        .delete()
        .eq("id", identity.id)
        .eq("user_id", userId);
    } catch {
      // Preserve the original persistence error; the browser still publishes no
      // speculative state and the next refresh will reveal any server residue.
    }
    return { data: null, error: revisionResult.error };
  }
  return { data: identity, error: null };
}

/** Replace only the current logical-date revision for one named ruleset. */
export async function upsertCustomBehaviorRulesetRevision(
  client: CustomBehaviorRulesetClient,
  rulesetId: string,
  effectiveFromLogicalDate: string,
  policy: TaskBehaviorPolicy,
) {
  try {
    const result = await client
      .from("adhdice_custom_behavior_ruleset_revisions")
      .upsert(customBehaviorRulesetRevisionUpsertPayload(rulesetId, effectiveFromLogicalDate, policy), {
        onConflict: "ruleset_id,effective_from_logical_date",
      });
    return result.error;
  } catch (error) {
    return { message: error instanceof Error ? error.message : "Could not save the Custom ruleset policy." };
  }
}

/** Tombstone a named identity through the owner-checked database authority. */
export async function deleteCustomBehaviorRuleset(
  client: CustomBehaviorRulesetClient,
  rulesetId: string,
) {
  if (!rulesetId.trim()) return { message: "Custom ruleset identity is required." };
  try {
    const result = await client.rpc("adhdice_delete_custom_behavior_ruleset", { p_ruleset_id: rulesetId });
    if (result.error) return result.error;
    if (!Array.isArray(result.data) || result.data.length !== 1) {
      return { message: "Custom ruleset deletion returned an unusable result." };
    }
    return null;
  } catch (error) {
    return { message: error instanceof Error ? error.message : "Could not delete the Custom ruleset." };
  }
}

/** Rename identity metadata only; no behavior revision or assignment is touched. */
export async function renameCustomBehaviorRuleset(
  client: CustomBehaviorRulesetClient,
  userId: string,
  rulesetId: string,
  nameInput: string,
  loadedRulesets: readonly CustomBehaviorRulesetNameCandidate[] = [],
): Promise<CustomBehaviorRulesetMutationResult<CustomBehaviorRuleset>> {
  const current = loadedRulesets.find((ruleset) => ruleset.id === rulesetId);
  if (current?.deleted_at != null) return rulesetMutationError("The Custom ruleset has already been deleted.");
  const validation = validateCustomBehaviorRulesetName(nameInput, loadedRulesets, rulesetId);
  if (validation.error) return rulesetMutationError(validation.error);
  let result: RulesetQueryResult<CustomBehaviorRuleset>;
  try {
    result = await client
      .from("adhdice_custom_behavior_rulesets")
      .update({ name: validation.name, updated_at: new Date().toISOString() })
      .eq("id", rulesetId)
      .eq("user_id", userId)
      .select("id,user_id,name,task_type,deleted_at,created_at,updated_at");
  } catch (error) {
    return rulesetMutationError(error instanceof Error ? error.message : "Could not rename the Custom ruleset.");
  }
  if (result.error) return { data: null, error: result.error };
  const updated = result.data?.[0];
  if (!isValidCustomBehaviorRulesetIdentity(updated) || updated.id !== rulesetId || updated.user_id !== userId) {
    return rulesetMutationError("Custom ruleset rename did not return the updated identity.");
  }
  return { data: updated, error: null };
}

export function isMissingCustomBehaviorRulesetsTableError(error: RulesetError | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "42P01"
    || /adhdice_(?:custom_behavior_ruleset|task_behavior_selection)|relation .* does not exist|column .*available_actions.* does not exist/i.test(message);
}

/**
 * Trusted orchestration may use only a known additive-schema absence as its
 * pre-deployment compatibility boundary. Other ruleset/selection failures
 * must remain visible to manual-action authorization.
 */
export function isMissingCustomBehaviorRulesetsAdditiveSchemaError(error: unknown) {
  const candidate = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const missingRelation = /relation .* does not exist|could not find the table .* in the schema cache/i.test(message);
  const missingAvailableActionsColumn = /available_actions.*(?:does not exist|not found)|could not find the ['"]available_actions['"] column/i.test(message);
  return (code === "42P01" && (!message || missingRelation))
    || missingAvailableActionsColumn
    || missingRelation;
}

/** Load the named Custom identity rows and their separate revision timelines. */
export async function loadCustomBehaviorRulesets(
  client: CustomBehaviorRulesetClient,
  userId: string,
): Promise<LoadedCustomBehaviorRulesets> {
  if (!userId) return { data: [], revisions: {}, behaviorSelectionsByTaskId: {}, error: null, behaviorSelectionError: null };
  const [rulesetsResult, revisionsResult, behaviorSelectionsResult] = await Promise.all([
    client
      .from("adhdice_custom_behavior_rulesets")
      .select("id,user_id,name,task_type,deleted_at,created_at,updated_at")
      .eq("user_id", userId),
    client
      .from("adhdice_custom_behavior_ruleset_revisions")
      .select("ruleset_id,effective_from_logical_date,unresolved_occurrence,positive_streak_on_unhandled,missed_streak_on_unhandled,rewards,available_actions,created_at,updated_at"),
    client
      .from("adhdice_task_behavior_selections")
      .select("id,user_id,task_id,effective_from_logical_date,task_type,custom_ruleset_id,created_at,updated_at")
      .eq("user_id", userId),
  ]);
  if (rulesetsResult.error) return { data: [], revisions: {}, behaviorSelectionsByTaskId: {}, error: rulesetsResult.error, behaviorSelectionError: null };
  if (revisionsResult.error) return { data: [], revisions: {}, behaviorSelectionsByTaskId: {}, error: revisionsResult.error, behaviorSelectionError: null };

  const rulesets = (rulesetsResult.data ?? []).filter(isValidCustomBehaviorRulesetIdentity);
  const rulesetIds = new Set(rulesets.map((ruleset) => ruleset.id));
  const revisions: Record<string, TaskBehaviorPolicyRevisions> = {};
  for (const row of revisionsResult.data ?? []) {
    if (!rulesetIds.has(row.ruleset_id) || !isValidRevision(row)) continue;
    const next = [...(revisions[row.ruleset_id] ?? []), toPolicyRevision(row)];
    revisions[row.ruleset_id] = next.sort((left, right) => left.effectiveFromLogicalDate.localeCompare(right.effectiveFromLogicalDate));
  }
  const behaviorSelectionsByTaskId: Record<string, TaskBehaviorSelection[]> = {};
  for (const row of behaviorSelectionsResult.data ?? []) {
    const selection = toBehaviorSelection(row, userId);
    if (!selection) continue;
    behaviorSelectionsByTaskId[row.task_id] = [...(behaviorSelectionsByTaskId[row.task_id] ?? []), selection]
      .sort((left, right) => left.effectiveFromLogicalDate.localeCompare(right.effectiveFromLogicalDate));
  }
  return {
    data: rulesets,
    revisions,
    behaviorSelectionsByTaskId,
    // A missing selection table is a compatibility boundary: keep the 7.13.30
    // ruleset data usable and let callers treat the selection map as empty.
    error: null,
    behaviorSelectionError: behaviorSelectionsResult.error ?? null,
  };
}
