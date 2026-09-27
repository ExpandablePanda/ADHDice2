import type {
  CustomBehaviorRuleset,
  CustomBehaviorRulesetRevision,
  Task,
  TaskBehaviorSelection,
  TaskHistoryChange,
  TaskHistorySyncState,
  TaskTypeBehaviorProfile,
} from "../database.types.ts";
import type {
  CanonicalTaskCalendarOverride,
  CanonicalTaskCommandOperation,
  CanonicalTaskHistoryFact,
  CanonicalTaskOccurrence,
  CanonicalTaskOccurrenceEffectiveOverride,
  CanonicalTaskRewardClaimConsumption,
  CanonicalTaskRewardEntitlement,
  CanonicalTaskRewardGrant,
  CanonicalTaskScheduleBoundary,
  CanonicalTaskStateColumns,
} from "./types.ts";
import { resolveTaskTrackingExclusion } from "../task-tracking.ts";

export type CanonicalTaskRow = Task & CanonicalTaskStateColumns;

export type CanonicalReadError = {
  message: string;
  code?: string;
};

type CanonicalLogicalDayProfile = {
  timezone: string;
  day_start_time: string;
  settings_revision: number;
};

type CanonicalReadResult<T> = {
  data: T;
  error: CanonicalReadError | null;
};

type CanonicalReadQuery<T> = {
  select(columns: string): CanonicalReadQuery<T>;
  eq(column: string, value: string): CanonicalReadQuery<T>;
  is(column: string, value: null): CanonicalReadQuery<T>;
  order(column: string, options: { ascending: boolean }): CanonicalReadQuery<T>;
  limit(count: number): CanonicalReadQuery<T>;
  maybeSingle(): Promise<CanonicalReadResult<T | null>>;
  then<TResult1 = CanonicalReadResult<T[]>, TResult2 = never>(
    onfulfilled?: ((value: CanonicalReadResult<T[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};

type CanonicalReadTableRows = {
  adhdice_clean_tasks: CanonicalTaskRow;
  adhdice_user_profiles: CanonicalLogicalDayProfile;
  adhdice_task_command_operations: CanonicalTaskCommandOperation;
  adhdice_task_schedule_boundaries: CanonicalTaskScheduleBoundary;
  adhdice_task_occurrences: CanonicalTaskOccurrence;
  adhdice_task_occurrence_effective_overrides: CanonicalTaskOccurrenceEffectiveOverride;
  adhdice_task_history_facts: CanonicalTaskHistoryFact;
  adhdice_task_calendar_overrides: CanonicalTaskCalendarOverride;
  adhdice_task_reward_entitlements: CanonicalTaskRewardEntitlement;
  adhdice_task_reward_grants: CanonicalTaskRewardGrant;
  adhdice_task_reward_claim_consumptions: CanonicalTaskRewardClaimConsumption;
  adhdice_task_type_behavior_profiles: TaskTypeBehaviorProfile;
  adhdice_custom_behavior_rulesets: CustomBehaviorRuleset;
  adhdice_custom_behavior_ruleset_revisions: CustomBehaviorRulesetRevision;
  adhdice_task_behavior_selections: TaskBehaviorSelection;
  adhdice_task_history_sync_state: TaskHistorySyncState;
  adhdice_task_history_changes: TaskHistoryChange;
};

/**
 * The canonical read model is shared by browser and Edge callers. Keep its
 * client contract structural so the Edge graph does not resolve the browser
 * Supabase singleton merely to derive a type.
 */
export type CanonicalReadClient = {
  from<T extends keyof CanonicalReadTableRows>(table: T): CanonicalReadQuery<CanonicalReadTableRows[T]>;
};

export async function loadCanonicalTaskScheduleBoundary(
  client: CanonicalReadClient,
  input: { userId: string; taskId: string; boundaryId: string },
): Promise<{ data: CanonicalTaskScheduleBoundary | null; error: CanonicalReadError | null }> {
  const result = await client
    .from("adhdice_task_schedule_boundaries")
    .select("*")
    .eq("user_id", input.userId)
    .eq("entity_id", input.taskId)
    .eq("id", input.boundaryId)
    .maybeSingle();

  if (result.error) return { data: null, error: readError(result.error) };
  const boundary = result.data;
  if (!boundary) return { data: null, error: { message: "The committed canonical schedule boundary was not found." } };
  if (boundary.id !== input.boundaryId || boundary.user_id !== input.userId || boundary.entity_id !== input.taskId) {
    return { data: null, error: { message: "The committed canonical schedule boundary does not belong to this Task and user." } };
  }
  return { data: boundary, error: null };
}

export type CanonicalTaskStateReadModel = {
  task: CanonicalTaskRow;
  commandOperations: CanonicalTaskCommandOperation[];
  scheduleBoundaries: CanonicalTaskScheduleBoundary[];
  occurrences: CanonicalTaskOccurrence[];
  occurrenceEffectiveOverrides: CanonicalTaskOccurrenceEffectiveOverride[];
  historyFacts: CanonicalTaskHistoryFact[];
  calendarOverrides: CanonicalTaskCalendarOverride[];
  rewardEntitlements: CanonicalTaskRewardEntitlement[];
  rewardGrants: CanonicalTaskRewardGrant[];
  rewardClaimConsumptions: CanonicalTaskRewardClaimConsumption[];
  /** Optional for compatibility with pre-7.13.31 read-model fixtures. */
  behaviorSelections?: TaskBehaviorSelection[];
  logicalDayProfile: {
    timezone: string;
    day_start_time: string;
    settings_revision: number;
  };
  /** Set only by the bounded projection-source loader after hierarchy proof. */
  effectiveTrackingExclusion?: boolean;
};

export type CanonicalTaskStateReadResult = {
  data: CanonicalTaskStateReadModel | null;
  error: CanonicalReadError | null;
};

function readError(error: { message: string; code?: string } | null): CanonicalReadError | null {
  return error ? { message: error.message, ...(error.code ? { code: error.code } : {}) } : null;
}

function isMissingBehaviorSelectionsError(error: CanonicalReadError | null) {
  return Boolean(error && (error.code === "42P01" || /adhdice_task_behavior_selections|relation .* does not exist/i.test(error.message)));
}

export async function loadCanonicalTaskState(
  client: CanonicalReadClient,
  input: { userId: string; taskId: string },
): Promise<CanonicalTaskStateReadResult> {
  const taskResult = await client
    .from("adhdice_clean_tasks")
    .select("*")
    .eq("user_id", input.userId)
    .eq("id", input.taskId)
    .is("permanently_deleted_at", null)
    .maybeSingle();

  if (taskResult.error) return { data: null, error: readError(taskResult.error) };
  if (!taskResult.data) return { data: null, error: { message: "Canonical Task was not found for this owner." } };

  const [profile, commandOperations, scheduleBoundaries, occurrences, occurrenceEffectiveOverrides, historyFacts, calendarOverrides,
    rewardEntitlements, rewardGrants, rewardClaimConsumptions, behaviorSelections] = await Promise.all([
    client.from("adhdice_user_profiles").select("timezone,day_start_time,settings_revision").eq("user_id", input.userId).maybeSingle(),
    client.from("adhdice_task_command_operations").select("*").eq("user_id", input.userId).eq("entity_id", input.taskId)
      .order("created_at", { ascending: false }),
    client.from("adhdice_task_schedule_boundaries").select("*").eq("user_id", input.userId).eq("entity_id", input.taskId)
      .order("boundary_sequence", { ascending: false }),
    client.from("adhdice_task_occurrences").select("*").eq("user_id", input.userId).eq("entity_id", input.taskId)
      .order("scheduled_due_on", { ascending: true }),
    client.from("adhdice_task_occurrence_effective_overrides").select("*").eq("user_id", input.userId).eq("entity_id", input.taskId)
      .order("action_logical_date", { ascending: false }),
    client.from("adhdice_task_history_facts").select("*").eq("user_id", input.userId).eq("entity_id", input.taskId)
      .order("logical_date", { ascending: false }),
    client.from("adhdice_task_calendar_overrides").select("*").eq("user_id", input.userId).eq("entity_id", input.taskId)
      .order("logical_date", { ascending: false }),
    client.from("adhdice_task_reward_entitlements").select("*").eq("user_id", input.userId).eq("entity_id", input.taskId)
      .order("logical_date", { ascending: false }),
    client.from("adhdice_task_reward_grants").select("*").eq("user_id", input.userId),
    client.from("adhdice_task_reward_claim_consumptions").select("*").eq("user_id", input.userId),
    client.from("adhdice_task_behavior_selections").select("*").eq("user_id", input.userId).eq("task_id", input.taskId)
      .order("effective_from_logical_date", { ascending: true }),
  ]);

  const results = [
    profile,
    commandOperations,
    scheduleBoundaries,
    occurrences,
    occurrenceEffectiveOverrides,
    historyFacts,
    calendarOverrides,
    rewardEntitlements,
    rewardGrants,
    rewardClaimConsumptions,
    behaviorSelections,
  ];
  const failed = results.find((result, index) => result.error && !(index === results.length - 1 && isMissingBehaviorSelectionsError(readError(result.error))));
  if (failed?.error) return { data: null, error: readError(failed.error) };
  if (!profile.data || typeof profile.data.timezone !== "string" || typeof profile.data.day_start_time !== "string"
    || !Number.isInteger(profile.data.settings_revision) || profile.data.settings_revision < 1) {
    return { data: null, error: { message: "Canonical logical-day profile is unavailable or malformed." } };
  }

  const entitlementIds = new Set((rewardEntitlements.data ?? []).map((row) => row.id));
  const grantRows = (rewardGrants.data ?? []).filter((row) => entitlementIds.has(row.entitlement_id));
  const grantIds = new Set(grantRows.map((row) => row.id));

  return {
    data: {
      task: taskResult.data as CanonicalTaskRow,
      commandOperations: commandOperations.data ?? [],
      scheduleBoundaries: scheduleBoundaries.data ?? [],
      occurrences: occurrences.data ?? [],
      occurrenceEffectiveOverrides: occurrenceEffectiveOverrides.data ?? [],
      historyFacts: historyFacts.data ?? [],
      calendarOverrides: calendarOverrides.data ?? [],
      rewardEntitlements: rewardEntitlements.data ?? [],
      rewardGrants: grantRows,
      rewardClaimConsumptions: (rewardClaimConsumptions.data ?? []).filter((row) => grantIds.has(row.grant_id)),
      behaviorSelections: behaviorSelections.error ? [] : behaviorSelections.data ?? [],
      logicalDayProfile: profile.data,
    },
    error: null,
  };
}

type ProjectionTrackingTask = Pick<Task, "id" | "user_id" | "parent_task_id" | "exclude_from_tracking">;

async function loadProjectionTrackingHierarchy(
  client: CanonicalReadClient,
  input: { userId: string; taskId: string },
  task: ProjectionTrackingTask,
): Promise<{ excluded: boolean; error: CanonicalReadError | null }> {
  const tasks: ProjectionTrackingTask[] = [task];
  const seen = new Set<string>([task.id]);
  let current = task;

  while (current.parent_task_id) {
    const parentId = current.parent_task_id;
    if (seen.has(parentId)) {
      return { excluded: false, error: { message: "Canonical Task hierarchy contains a parent cycle." } };
    }
    seen.add(parentId);
    const parentResult = await client
      .from("adhdice_clean_tasks")
      .select("id,user_id,parent_task_id,exclude_from_tracking")
      .eq("user_id", input.userId)
      .eq("id", parentId)
      .maybeSingle();
    if (parentResult.error) return { excluded: false, error: readError(parentResult.error) };
    const parent = parentResult.data as ProjectionTrackingTask | null;
    if (!parent || parent.id !== parentId || parent.user_id !== input.userId) {
      return { excluded: false, error: { message: "Canonical Task hierarchy is missing, cross-owner, or otherwise ambiguous." } };
    }
    tasks.push(parent);
    current = parent;
  }

  const resolution = resolveTaskTrackingExclusion(
    { id: input.taskId },
    tasks,
  );
  if (resolution.status !== "resolved") {
    return { excluded: false, error: { message: resolution.message } };
  }
  return { excluded: resolution.excluded, error: null };
}

/**
 * Load only the canonical inputs needed to rebuild one current Task
 * projection. The broad canonical loader remains unchanged for command and
 * historical paths that require reward evidence or workspace-wide inputs.
 */
export async function loadCanonicalTaskProjectionSource(
  client: CanonicalReadClient,
  input: { userId: string; taskId: string },
): Promise<CanonicalTaskStateReadResult> {
  const taskResult = await client
    .from("adhdice_clean_tasks")
    .select("*")
    .eq("user_id", input.userId)
    .eq("id", input.taskId)
    .is("permanently_deleted_at", null)
    .maybeSingle();

  if (taskResult.error) return { data: null, error: readError(taskResult.error) };
  if (!taskResult.data) return { data: null, error: { message: "Canonical Task was not found for this owner." } };

  const [profile, commandOperations, scheduleBoundaries, occurrences, occurrenceEffectiveOverrides, historyFacts,
    calendarOverrides, behaviorSelections] = await Promise.all([
    client.from("adhdice_user_profiles").select("timezone,day_start_time,settings_revision").eq("user_id", input.userId).maybeSingle(),
    client.from("adhdice_task_command_operations").select("*").eq("user_id", input.userId).eq("entity_id", input.taskId)
      .order("created_at", { ascending: false }),
    client.from("adhdice_task_schedule_boundaries").select("*").eq("user_id", input.userId).eq("entity_id", input.taskId)
      .order("boundary_sequence", { ascending: false }),
    client.from("adhdice_task_occurrences").select("*").eq("user_id", input.userId).eq("entity_id", input.taskId)
      .order("scheduled_due_on", { ascending: true }),
    client.from("adhdice_task_occurrence_effective_overrides").select("*").eq("user_id", input.userId).eq("entity_id", input.taskId)
      .order("action_logical_date", { ascending: false }),
    client.from("adhdice_task_history_facts").select("*").eq("user_id", input.userId).eq("entity_id", input.taskId)
      .order("logical_date", { ascending: false }),
    client.from("adhdice_task_calendar_overrides").select("*").eq("user_id", input.userId).eq("entity_id", input.taskId)
      .order("logical_date", { ascending: false }),
    client.from("adhdice_task_behavior_selections").select("*").eq("user_id", input.userId).eq("task_id", input.taskId)
      .order("effective_from_logical_date", { ascending: true }),
  ]);

  const results = [profile, commandOperations, scheduleBoundaries, occurrences, occurrenceEffectiveOverrides,
    historyFacts, calendarOverrides, behaviorSelections];
  const failed = results.find((result, index) => result.error
    && !(index === results.length - 1 && isMissingBehaviorSelectionsError(readError(result.error))));
  if (failed?.error) return { data: null, error: readError(failed.error) };
  if (!profile.data || typeof profile.data.timezone !== "string" || typeof profile.data.day_start_time !== "string"
    || !Number.isInteger(profile.data.settings_revision) || profile.data.settings_revision < 1) {
    return { data: null, error: { message: "Canonical logical-day profile is unavailable or malformed." } };
  }

  const scopedRows = [commandOperations.data, scheduleBoundaries.data, occurrences.data,
    occurrenceEffectiveOverrides.data, historyFacts.data, calendarOverrides.data]
    .flat();
  if (scopedRows.some((row) => row.user_id !== input.userId || row.entity_id !== input.taskId)) {
    return { data: null, error: { message: "Canonical projection source rows are not entity scoped." } };
  }

  const tracking = await loadProjectionTrackingHierarchy(client, input, taskResult.data);
  if (tracking.error) return { data: null, error: tracking.error };

  return {
    data: {
      task: taskResult.data as CanonicalTaskRow,
      commandOperations: commandOperations.data ?? [],
      scheduleBoundaries: scheduleBoundaries.data ?? [],
      occurrences: occurrences.data ?? [],
      occurrenceEffectiveOverrides: occurrenceEffectiveOverrides.data ?? [],
      historyFacts: historyFacts.data ?? [],
      calendarOverrides: calendarOverrides.data ?? [],
      // Projection calculation does not consume reward evidence. Keep the
      // broad read-model shape compatible without issuing those queries.
      rewardEntitlements: [],
      rewardGrants: [],
      rewardClaimConsumptions: [],
      behaviorSelections: behaviorSelections.error ? [] : behaviorSelections.data ?? [],
      logicalDayProfile: profile.data,
      effectiveTrackingExclusion: tracking.excluded,
    },
    error: null,
  };
}

export async function loadCanonicalTaskCommandOperations(
  client: CanonicalReadClient,
  input: { userId: string; commandId?: string; taskId?: string },
) {
  let query = client
    .from("adhdice_task_command_operations")
    .select("*")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false });
  if (input.commandId) query = query.eq("command_id", input.commandId);
  if (input.taskId) query = query.eq("entity_id", input.taskId);
  const result = await query;
  return { data: result.data ?? [], error: readError(result.error) };
}

export async function loadCanonicalTaskCommandOperationReplay(
  client: CanonicalReadClient,
  input: { userId: string; idempotenceIdentity: string },
) {
  const result = await client
    .from("adhdice_task_command_operations")
    .select("*")
    .eq("user_id", input.userId)
    .eq("idempotence_identity", input.idempotenceIdentity)
    .maybeSingle();
  return {
    data: (result.data as CanonicalTaskCommandOperation | null) ?? null,
    error: readError(result.error),
  };
}
