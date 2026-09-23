import type { TaskCurrentProjection } from "./database.types.ts";
import {
  buildCurrentTaskProjection,
  type BuildCurrentTaskProjectionInput,
  type CurrentTaskProjectionSourceFences,
} from "./task-current-projection.ts";
import {
  loadCanonicalTaskProjectionSource,
  type CanonicalReadClient,
  type CanonicalTaskStateReadModel,
} from "./task-state-canonical/read-model.ts";
import {
  isMissingTaskTypeBehaviorProfilesAdditiveSchemaError,
} from "./task-type-behavior-profiles.ts";
import {
  isMissingCustomBehaviorRulesetsAdditiveSchemaError,
} from "./custom-behavior-rulesets.ts";
import {
  normalizeTaskBehaviorPolicyRevisions,
  normalizeTaskBehaviorProfiles,
  normalizeTaskBehaviorProfile,
  type TaskBehaviorPolicyResolutionContext,
  type TaskBehaviorPolicyRevisions,
} from "./task-state-engine/behavior-policy.ts";
import { logicalDateForTimestamp } from "./task-state-engine/calendar.ts";

export type TrustedCurrentTaskProjectionClient = CanonicalReadClient & {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { code?: string | null; message?: string } | null }>;
};

export type CurrentTaskProjectionRebuildResult =
  | {
    status: "written";
    projection: TaskCurrentProjection;
    writerResult: unknown;
  }
  | {
    status: "retryable";
    reason: "stale_projection_fence";
    message: string;
  }
  | {
    status: "repair_required" | "failed";
    reason: string;
    message: string;
  };

export type CurrentTaskProjectionRebuildDependencies = {
  loadCanonicalState: typeof loadCanonicalTaskProjectionSource;
  loadHistoryFence: typeof loadHistoryFence;
  loadBehaviorContext: typeof loadBehaviorContext;
  loadSourceFences: typeof loadSourceFences;
  buildProjection: typeof buildCurrentTaskProjection;
  writeProjection: (
    adminClient: TrustedCurrentTaskProjectionClient,
    userId: string,
    projection: TaskCurrentProjection,
  ) => Promise<{ data: unknown; error: { code?: string | null; message?: string } | null }>;
};

const defaultDependencies: CurrentTaskProjectionRebuildDependencies = {
  loadCanonicalState: loadCanonicalTaskProjectionSource,
  loadHistoryFence,
  loadBehaviorContext,
  loadSourceFences,
  buildProjection: buildCurrentTaskProjection,
  writeProjection: async (adminClient, userId, projection) => adminClient.rpc(
    "adhdice_upsert_task_current_projection",
    { p_user_id: userId, p_projection: projection },
  ),
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function staleFenceError(error: { code?: string | null; message?: string } | null) {
  if (!error) return false;
  return error.code === "40001"
    || /stale|older than the stored projection|revision|frontier|sync epoch|logical date/i.test(error.message ?? "");
}

function projectionLogicalDate(readModel: CanonicalTaskStateReadModel, projectedAt: string | Date) {
  const date = projectedAt instanceof Date ? projectedAt : new Date(projectedAt);
  if (Number.isNaN(date.getTime())) throw new Error("Projection timestamp is malformed.");
  return logicalDateForTimestamp(
    date,
    readModel.logicalDayProfile.timezone,
    readModel.logicalDayProfile.day_start_time,
  );
}

async function loadSourceFences(
  adminClient: TrustedCurrentTaskProjectionClient,
  userId: string,
  readModel: CanonicalTaskStateReadModel,
  projectedAt: string | Date,
): Promise<CurrentTaskProjectionSourceFences> {
  const result = await adminClient.rpc(
    "adhdice_get_task_current_projection_source_fences",
    {
      p_user_id: userId,
      p_entity_id: readModel.task.id,
      p_projected_logical_date: projectionLogicalDate(readModel, projectedAt),
    },
  );
  if (result.error) throw new Error(result.error.message ?? "Trusted projection source fences are unavailable.");
  const candidate = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Trusted projection source fence snapshot is malformed.");
  }
  const source = candidate as { schedule_boundary_revision?: unknown; behavior_policy_revision?: unknown };
  if (typeof source.schedule_boundary_revision !== "string"
    || typeof source.behavior_policy_revision !== "string"
    || !/^sha256:[0-9a-f]{64}$/.test(source.schedule_boundary_revision)
    || !/^sha256:[0-9a-f]{64}$/.test(source.behavior_policy_revision)) {
    throw new Error("Trusted projection source fence snapshot is malformed.");
  }
  return {
    scheduleBoundaryRevision: source.schedule_boundary_revision,
    behaviorPolicyRevision: source.behavior_policy_revision,
  };
}

async function loadHistoryFence(
  adminClient: TrustedCurrentTaskProjectionClient,
  userId: string,
  taskId: string,
): Promise<BuildCurrentTaskProjectionInput["historyFence"]> {
  const [syncStateResult, frontierResult] = await Promise.all([
    adminClient
      .from("adhdice_task_history_sync_state")
      .select("user_id,current_revision,sync_epoch,protocol_version")
      .eq("user_id", userId)
      .maybeSingle(),
    adminClient
      .from("adhdice_task_history_changes")
      .select("*")
      .eq("user_id", userId)
      .eq("entity_id", taskId)
      .order("sequence", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (syncStateResult.error) throw new Error(syncStateResult.error.message ?? "History sync state is unavailable.");
  if (frontierResult.error) throw new Error(frontierResult.error.message ?? "Entity History frontier is unavailable.");

  const syncState = syncStateResult.data;
  if (!syncState
    || syncState.user_id !== userId
    || syncState.protocol_version !== "task-history-sync-v1"
    || typeof syncState.sync_epoch !== "string"
    || syncState.sync_epoch.length === 0
    || !Number.isSafeInteger(syncState.current_revision)
    || syncState.current_revision < 0) {
    throw new Error("History sync state is malformed or belongs to another owner.");
  }

  const frontier = frontierResult.data;
  if (!frontier) {
    return { syncEpoch: syncState.sync_epoch, sourceRevision: 0, frontier: null };
  }
  if (frontier.user_id !== userId || frontier.entity_id !== taskId
    || !Number.isSafeInteger(frontier.sequence) || frontier.sequence < 1
    || typeof frontier.history_fact_id !== "string"
    || typeof frontier.logical_date !== "string"
    || (frontier.operation !== "upsert" && frontier.operation !== "delete")
    || (frontier.row_revision !== null && (!Number.isSafeInteger(frontier.row_revision) || frontier.row_revision < 1))) {
    throw new Error("Entity History frontier is malformed or belongs to another owner.");
  }
  return {
    syncEpoch: syncState.sync_epoch,
    sourceRevision: frontier.sequence,
    frontier: {
      sequence: frontier.sequence,
      historyFactId: frontier.history_fact_id,
      logicalDate: frontier.logical_date,
      operation: frontier.operation,
      rowRevision: frontier.row_revision,
    },
  };
}

async function loadBehaviorContext(
  adminClient: TrustedCurrentTaskProjectionClient,
  userId: string,
  readModel: CanonicalTaskStateReadModel,
): Promise<{ context: TaskBehaviorPolicyResolutionContext; error: string | null }> {
  const taskSelections = (readModel.behaviorSelections ?? []).map((selection) => ({
    effectiveFromLogicalDate: selection.effective_from_logical_date,
    taskType: selection.task_type,
    customRulesetId: selection.custom_ruleset_id,
  }));

  const needsTaskProfile = readModel.task.task_type === "task"
    || taskSelections.some((selection) => selection.taskType === "task");
  let profileRows: unknown[] = [];
  if (needsTaskProfile) {
    const profilesResult = await adminClient
      .from("adhdice_task_type_behavior_profiles")
      .select("*")
      .eq("user_id", userId)
      .eq("task_type", "task");
    if (profilesResult.error && !isMissingTaskTypeBehaviorProfilesAdditiveSchemaError(profilesResult.error)) {
      return { context: {}, error: profilesResult.error.message ?? "Task behavior profile authority is unavailable." };
    }
    profileRows = profilesResult.error ? [] : profilesResult.data ?? [];
  }

  const rulesetIds = new Set<string>();
  if (readModel.task.task_type === "custom" && readModel.task.custom_ruleset_id) {
    rulesetIds.add(readModel.task.custom_ruleset_id);
  }
  for (const selection of taskSelections) {
    if (selection.taskType === "custom" && selection.customRulesetId) rulesetIds.add(selection.customRulesetId);
  }

  const customResults = await Promise.all([...rulesetIds].map(async (rulesetId) => {
    const [identityResult, revisionsResult] = await Promise.all([
      adminClient.from("adhdice_custom_behavior_rulesets").select("id,user_id,task_type,deleted_at").eq("user_id", userId).eq("id", rulesetId).maybeSingle(),
      adminClient.from("adhdice_custom_behavior_ruleset_revisions").select("*").eq("ruleset_id", rulesetId),
    ]);
    return { rulesetId, identityResult, revisionsResult };
  }));

  const customRevisions: Record<string, TaskBehaviorPolicyRevisions> = {};
  for (const result of customResults) {
    if (result.identityResult.error && !isMissingCustomBehaviorRulesetsAdditiveSchemaError(result.identityResult.error)) {
      return { context: {}, error: result.identityResult.error.message ?? "Custom behavior authority is unavailable." };
    }
    if (result.revisionsResult.error && !isMissingCustomBehaviorRulesetsAdditiveSchemaError(result.revisionsResult.error)) {
      return { context: {}, error: result.revisionsResult.error.message ?? "Custom behavior authority is unavailable." };
    }
    if (result.identityResult.error || result.revisionsResult.error) continue;
    const identity = result.identityResult.data;
    if (!identity || identity.user_id !== userId || identity.id !== result.rulesetId || identity.task_type !== "custom") {
      return { context: {}, error: "Named Custom behavior identity is missing, cross-owner, or malformed." };
    }
    customRevisions[result.rulesetId] = (result.revisionsResult.data ?? []).map((row) => {
      const policy = normalizeTaskBehaviorProfile({
        id: `custom-ruleset:${row.ruleset_id}`,
        unresolvedOccurrence: row.unresolved_occurrence,
        positiveStreakOnUnhandled: row.positive_streak_on_unhandled,
        missedStreakOnUnhandled: row.missed_streak_on_unhandled,
        rewards: row.rewards,
        availableActions: row.available_actions,
        needsActionTriggers: row.needs_action_triggers,
        successOutcomes: row.success_outcomes,
      }, "custom");
      return { ...policy, effectiveFromLogicalDate: row.effective_from_logical_date };
    }).sort((left, right) => left.effectiveFromLogicalDate.localeCompare(right.effectiveFromLogicalDate));
  }

  const normalizedProfiles = normalizeTaskBehaviorPolicyRevisions(profileRows);
  const behaviorPolicyRevisions: Record<string, TaskBehaviorPolicyRevisions> = {};
  for (const revision of normalizedProfiles) {
    const { taskType, ...policyRevision } = revision;
    behaviorPolicyRevisions[taskType] = [...(behaviorPolicyRevisions[taskType] ?? []), policyRevision];
  }
  return {
    context: {
      behaviorProfiles: normalizeTaskBehaviorProfiles(profileRows),
      behaviorPolicyRevisions,
      namedCustomRulesetBehaviorPolicyRevisions: customRevisions,
      behaviorSelectionsByTaskId: { [readModel.task.id]: taskSelections },
    },
    error: null,
  };
}

/**
 * Rebuild one trusted current Task projection after canonical commit.
 *
 * This helper is intentionally not imported by task-state-command yet. It
 * never uses a projection as canonical input, creates History, or asks for a
 * whole-user command/History read. A 40001 writer rejection is retryable
 * because a newer canonical source or projection won the race.
 */
export async function rebuildCurrentTaskProjection(input: {
  adminClient: TrustedCurrentTaskProjectionClient;
  userId: string;
  taskId: string;
  projectedAt?: string | Date;
  dependencies?: Partial<CurrentTaskProjectionRebuildDependencies>;
}): Promise<CurrentTaskProjectionRebuildResult> {
  if (!input.userId || !input.taskId) {
    return { status: "failed", reason: "invalid_identity", message: "Projection rebuild requires one owner and one Task." };
  }
  const dependencies = { ...defaultDependencies, ...input.dependencies };

  let readResult: Awaited<ReturnType<typeof loadCanonicalTaskProjectionSource>>;
  try {
    readResult = await dependencies.loadCanonicalState(input.adminClient, {
      userId: input.userId,
      taskId: input.taskId,
    });
  } catch (error) {
    return { status: "failed", reason: "canonical_state_unavailable", message: errorMessage(error, "Canonical Task State is unavailable.") };
  }
  if (readResult.error || !readResult.data) {
    return { status: "failed", reason: "canonical_state_unavailable", message: readResult.error?.message ?? "Canonical Task State is unavailable." };
  }

  let historyFence: BuildCurrentTaskProjectionInput["historyFence"];
  try {
    historyFence = await dependencies.loadHistoryFence(input.adminClient, input.userId, input.taskId);
  } catch (error) {
    return { status: "failed", reason: "history_fence_unavailable", message: errorMessage(error, "Entity History freshness is unavailable.") };
  }

  let behavior: Awaited<ReturnType<typeof loadBehaviorContext>>;
  try {
    behavior = await dependencies.loadBehaviorContext(input.adminClient, input.userId, readResult.data);
  } catch (error) {
    return { status: "failed", reason: "behavior_authority_unavailable", message: errorMessage(error, "Task behavior authority is unavailable.") };
  }
  if (behavior.error) {
    return { status: "failed", reason: "behavior_authority_unavailable", message: behavior.error };
  }

  const projectedAt = input.projectedAt ?? new Date().toISOString();
  let sourceFences: CurrentTaskProjectionSourceFences;
  try {
    sourceFences = await dependencies.loadSourceFences(
      input.adminClient,
      input.userId,
      readResult.data,
      projectedAt,
    );
  } catch (error) {
    return { status: "failed", reason: "source_fence_unavailable", message: errorMessage(error, "Trusted projection source fences are unavailable.") };
  }

  let projection: TaskCurrentProjection;
  try {
    projection = dependencies.buildProjection({
      readModel: readResult.data,
      behaviorContext: behavior.context,
      historyFence,
      projectedAt,
      sourceFences,
      effectiveTrackingExclusion: readResult.data.effectiveTrackingExclusion,
    });
  } catch (error) {
    return { status: "repair_required", reason: "projection_calculation_failed", message: errorMessage(error, "Canonical projection calculation failed safely.") };
  }
  if (projection.validity !== "valid") {
    return {
      status: "repair_required",
      reason: "projection_calculation_not_valid",
      message: `Canonical projection calculator returned ${projection.validity}.`,
    };
  }

  let writeResult: Awaited<ReturnType<CurrentTaskProjectionRebuildDependencies["writeProjection"]>>;
  try {
    writeResult = await dependencies.writeProjection(input.adminClient, input.userId, projection);
  } catch (error) {
    return { status: "failed", reason: "projection_write_failed", message: errorMessage(error, "Trusted projection writer failed.") };
  }
  if (writeResult.error) {
    if (staleFenceError(writeResult.error)) {
      return {
        status: "retryable",
        reason: "stale_projection_fence",
        message: writeResult.error.message ?? "A newer canonical source or projection won the rebuild race.",
      };
    }
    return { status: "failed", reason: "projection_write_failed", message: writeResult.error.message ?? "Trusted projection writer failed." };
  }
  return { status: "written", projection, writerResult: writeResult.data };
}
