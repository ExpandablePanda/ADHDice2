import type { Task, TaskHistory } from "../database.types.ts";
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
  order(column: string, options: { ascending: boolean }): CanonicalReadQuery<T>;
  maybeSingle(): Promise<CanonicalReadResult<T | null>>;
  then<TResult1 = CanonicalReadResult<T[]>, TResult2 = never>(
    onfulfilled?: ((value: CanonicalReadResult<T[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};

type CanonicalReadTableRows = {
  adhdice_clean_tasks: CanonicalTaskRow;
  adhdice_user_profiles: CanonicalLogicalDayProfile;
  adhdice_task_history: TaskHistory;
  adhdice_task_command_operations: CanonicalTaskCommandOperation;
  adhdice_task_schedule_boundaries: CanonicalTaskScheduleBoundary;
  adhdice_task_occurrences: CanonicalTaskOccurrence;
  adhdice_task_occurrence_effective_overrides: CanonicalTaskOccurrenceEffectiveOverride;
  adhdice_task_history_facts: CanonicalTaskHistoryFact;
  adhdice_task_calendar_overrides: CanonicalTaskCalendarOverride;
  adhdice_task_reward_entitlements: CanonicalTaskRewardEntitlement;
  adhdice_task_reward_grants: CanonicalTaskRewardGrant;
  adhdice_task_reward_claim_consumptions: CanonicalTaskRewardClaimConsumption;
};

/**
 * The canonical read model is shared by browser and Edge callers. Keep its
 * client contract structural so the Edge graph does not resolve the browser
 * Supabase singleton merely to derive a type.
 */
export type CanonicalReadClient = {
  from<T extends keyof CanonicalReadTableRows>(table: T): CanonicalReadQuery<CanonicalReadTableRows[T]>;
};

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
  /** Raw legacy History is retained as migration evidence, never canonical input. */
  legacyHistoryEvidence: TaskHistory[];
  logicalDayProfile: {
    timezone: string;
    day_start_time: string;
    settings_revision: number;
  };
};

export type CanonicalTaskStateReadResult = {
  data: CanonicalTaskStateReadModel | null;
  error: CanonicalReadError | null;
};

function readError(error: { message: string; code?: string } | null): CanonicalReadError | null {
  return error ? { message: error.message, ...(error.code ? { code: error.code } : {}) } : null;
}

export async function loadCanonicalTaskState(
  client: CanonicalReadClient,
  input: { userId: string; taskId: string; includeLegacyHistoryEvidence?: boolean },
): Promise<CanonicalTaskStateReadResult> {
  const taskResult = await client
    .from("adhdice_clean_tasks")
    .select("*")
    .eq("user_id", input.userId)
    .eq("id", input.taskId)
    .maybeSingle();

  if (taskResult.error) return { data: null, error: readError(taskResult.error) };
  if (!taskResult.data) return { data: null, error: { message: "Canonical Task was not found for this owner." } };

  const legacyHistoryEvidenceQuery = input.includeLegacyHistoryEvidence
    ? client.from("adhdice_task_history").select("*").eq("user_id", input.userId).eq("task_id", input.taskId)
      .order("entry_date", { ascending: false })
    : Promise.resolve({ data: [] as TaskHistory[], error: null });
  const [profile, commandOperations, scheduleBoundaries, occurrences, occurrenceEffectiveOverrides, historyFacts, calendarOverrides,
    rewardEntitlements, rewardGrants, rewardClaimConsumptions, legacyHistoryEvidence] = await Promise.all([
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
    legacyHistoryEvidenceQuery,
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
    legacyHistoryEvidence,
  ];
  const failed = results.find((result) => result.error);
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
      legacyHistoryEvidence: legacyHistoryEvidence.data ?? [],
      logicalDayProfile: profile.data,
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
