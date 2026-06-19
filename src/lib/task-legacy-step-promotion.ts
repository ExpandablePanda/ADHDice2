import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LegacySubtaskPromotion,
  LegacySubtaskPromotionInsert,
  Task,
  TaskInsert,
  TaskStatus,
  TaskSubtask,
  TaskSubtaskStatus,
} from "@/lib/database.types";

export type LegacyStepPromotionSkipReason =
  | "legacy_parent_cycle"
  | "legacy_parent_missing"
  | "legacy_parent_not_promotable"
  | "mapped_task_missing"
  | "missing_required_fields"
  | "parent_task_archived_or_trashed"
  | "parent_task_missing"
  | "stable_task_id_collision"
  | "user_mismatch";

export type LegacyStepPromotionProposedRow = {
  depth: number;
  legacySubtaskId: string;
  parentTaskId: string;
  proposedStatus: TaskStatus;
  sortOrder: number;
  sourceStatus: TaskSubtaskStatus;
  taskId: string;
  title: string;
};

export type LegacyStepPromotionSkippedRow = {
  legacySubtaskId: string;
  reason: LegacyStepPromotionSkipReason;
  title: string;
};

export type LegacyStepPromotionMappedRow = {
  legacySubtaskId: string;
  taskId: string;
  title: string;
};

export type LegacyStepPromotionDryRun = {
  alreadyMappedRows: LegacyStepPromotionMappedRow[];
  proposedRows: LegacyStepPromotionProposedRow[];
  sampleRows: LegacyStepPromotionProposedRow[];
  skippedRows: LegacyStepPromotionSkippedRow[];
  summary: {
    alreadyMapped: number;
    duplicateOrAmbiguous: number;
    eligibleForPromotion: number;
    missingRequiredFields: number;
    skippedBecauseParentTaskArchivedOrTrashed: number;
    skippedBecauseParentTaskMissing: number;
    skippedBecauseLegacyParentMissing: number;
    totalLegacySubtasks: number;
  };
};

export type LegacyStepPromotionResult = {
  dryRun: LegacyStepPromotionDryRun;
  errors: Array<{ legacySubtaskId: string; message: string }>;
  promotedRows: LegacyStepPromotionMappedRow[];
  skippedRows: LegacyStepPromotionSkippedRow[];
};

type BuildLegacyStepPromotionDryRunInput = {
  currentUserId: string;
  mappings: LegacySubtaskPromotion[];
  sampleLimit?: number;
  subtasks: TaskSubtask[];
  tasks: Task[];
};

type ResolvedPromotion =
  | { kind: "already_mapped"; row: LegacyStepPromotionMappedRow }
  | { kind: "eligible"; row: LegacyStepPromotionProposedRow }
  | { kind: "skipped"; row: LegacyStepPromotionSkippedRow };

const DEFAULT_SAMPLE_LIMIT = 10;
const AMBIGUOUS_SKIP_REASONS = new Set<LegacyStepPromotionSkipReason>([
  "legacy_parent_cycle",
  "mapped_task_missing",
  "stable_task_id_collision",
  "user_mismatch",
]);

export function mapLegacyStepStatusToTaskStatus(status: TaskSubtaskStatus): TaskStatus {
  return status;
}

export function filterPromotedLegacySubtasks(
  subtasks: TaskSubtask[],
  mappings: LegacySubtaskPromotion[],
): TaskSubtask[] {
  if (subtasks.length === 0 || mappings.length === 0) {
    return subtasks;
  }

  const promotedSubtaskIds = new Set(mappings.map((mapping) => mapping.legacy_subtask_id));
  const subtasksById = new Map(subtasks.map((subtask) => [subtask.id, subtask]));
  const visibleSubtaskIds = new Set(subtasks.filter((subtask) => !promotedSubtaskIds.has(subtask.id)).map((subtask) => subtask.id));

  function getNearestVisibleParentId(subtask: TaskSubtask) {
    const visitedSubtaskIds = new Set<string>([subtask.id]);
    let parentSubtaskId = subtask.parent_subtask_id ?? null;

    while (parentSubtaskId) {
      if (visibleSubtaskIds.has(parentSubtaskId)) {
        return parentSubtaskId;
      }

      if (visitedSubtaskIds.has(parentSubtaskId)) {
        return null;
      }
      visitedSubtaskIds.add(parentSubtaskId);

      const parentSubtask = subtasksById.get(parentSubtaskId) ?? null;
      parentSubtaskId = parentSubtask?.parent_subtask_id ?? null;
    }

    return null;
  }

  return subtasks
    .filter((subtask) => !promotedSubtaskIds.has(subtask.id))
    .map((subtask) => ({
      ...subtask,
      parent_subtask_id: getNearestVisibleParentId(subtask),
    }));
}

export function buildLegacyStepPromotionDryRun({
  currentUserId,
  mappings,
  sampleLimit = DEFAULT_SAMPLE_LIMIT,
  subtasks,
  tasks,
}: BuildLegacyStepPromotionDryRunInput): LegacyStepPromotionDryRun {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const subtasksById = new Map(subtasks.map((subtask) => [subtask.id, subtask]));
  const mappingsByLegacySubtaskId = new Map(mappings.map((mapping) => [mapping.legacy_subtask_id, mapping]));
  const resolvedByLegacySubtaskId = new Map<string, ResolvedPromotion>();
  const resolvingSubtaskIds = new Set<string>();

  function skip(subtask: TaskSubtask, reason: LegacyStepPromotionSkipReason): ResolvedPromotion {
    return {
      kind: "skipped",
      row: {
        legacySubtaskId: subtask.id,
        reason,
        title: subtask.title,
      },
    };
  }

  function resolveSubtask(subtask: TaskSubtask): ResolvedPromotion {
    const cached = resolvedByLegacySubtaskId.get(subtask.id);
    if (cached) {
      return cached;
    }

    if (resolvingSubtaskIds.has(subtask.id)) {
      const resolved = skip(subtask, "legacy_parent_cycle");
      resolvedByLegacySubtaskId.set(subtask.id, resolved);
      return resolved;
    }

    resolvingSubtaskIds.add(subtask.id);
    const mapping = mappingsByLegacySubtaskId.get(subtask.id) ?? null;
    if (mapping) {
      const mappedTask = tasksById.get(mapping.task_id) ?? null;
      const resolved: ResolvedPromotion = mappedTask
        ? {
          kind: "already_mapped",
          row: {
            legacySubtaskId: subtask.id,
            taskId: mapping.task_id,
            title: subtask.title,
          },
        }
        : skip(subtask, "mapped_task_missing");
      resolvingSubtaskIds.delete(subtask.id);
      resolvedByLegacySubtaskId.set(subtask.id, resolved);
      return resolved;
    }

    const trimmedTitle = subtask.title.trim();
    if (!trimmedTitle) {
      const resolved = skip(subtask, "missing_required_fields");
      resolvingSubtaskIds.delete(subtask.id);
      resolvedByLegacySubtaskId.set(subtask.id, resolved);
      return resolved;
    }

    if (subtask.user_id !== currentUserId) {
      const resolved = skip(subtask, "user_mismatch");
      resolvingSubtaskIds.delete(subtask.id);
      resolvedByLegacySubtaskId.set(subtask.id, resolved);
      return resolved;
    }

    const rootTask = tasksById.get(subtask.task_id) ?? null;
    if (!rootTask) {
      const resolved = skip(subtask, "parent_task_missing");
      resolvingSubtaskIds.delete(subtask.id);
      resolvedByLegacySubtaskId.set(subtask.id, resolved);
      return resolved;
    }

    if (rootTask.user_id !== currentUserId || rootTask.user_id !== subtask.user_id) {
      const resolved = skip(subtask, "user_mismatch");
      resolvingSubtaskIds.delete(subtask.id);
      resolvedByLegacySubtaskId.set(subtask.id, resolved);
      return resolved;
    }

    if (rootTask.status === "archived" || rootTask.status === "trashed") {
      const resolved = skip(subtask, "parent_task_archived_or_trashed");
      resolvingSubtaskIds.delete(subtask.id);
      resolvedByLegacySubtaskId.set(subtask.id, resolved);
      return resolved;
    }

    const existingStableTask = tasksById.get(subtask.id) ?? null;
    if (existingStableTask) {
      const resolved = skip(subtask, "stable_task_id_collision");
      resolvingSubtaskIds.delete(subtask.id);
      resolvedByLegacySubtaskId.set(subtask.id, resolved);
      return resolved;
    }

    let parentTaskId = subtask.task_id;
    let depth = 1;
    if (subtask.parent_subtask_id) {
      const parentSubtask = subtasksById.get(subtask.parent_subtask_id) ?? null;
      if (!parentSubtask) {
        const resolved = skip(subtask, "legacy_parent_missing");
        resolvingSubtaskIds.delete(subtask.id);
        resolvedByLegacySubtaskId.set(subtask.id, resolved);
        return resolved;
      }

      const parentResolution = resolveSubtask(parentSubtask);
      if (parentResolution.kind === "skipped") {
        const resolved = skip(subtask, "legacy_parent_not_promotable");
        resolvingSubtaskIds.delete(subtask.id);
        resolvedByLegacySubtaskId.set(subtask.id, resolved);
        return resolved;
      }

      parentTaskId = parentResolution.row.taskId;
      depth = parentResolution.kind === "eligible" ? parentResolution.row.depth + 1 : 2;
    }

    const resolved: ResolvedPromotion = {
      kind: "eligible",
      row: {
        depth,
        legacySubtaskId: subtask.id,
        parentTaskId,
        proposedStatus: mapLegacyStepStatusToTaskStatus(subtask.status),
        sortOrder: subtask.sort_order,
        sourceStatus: subtask.status,
        taskId: subtask.id,
        title: trimmedTitle,
      },
    };
    resolvingSubtaskIds.delete(subtask.id);
    resolvedByLegacySubtaskId.set(subtask.id, resolved);
    return resolved;
  }

  const sortedSubtasks = sortLegacySubtasks(subtasks);
  const resolvedRows = sortedSubtasks.map(resolveSubtask);
  const alreadyMappedRows = resolvedRows
    .filter((resolved): resolved is Extract<ResolvedPromotion, { kind: "already_mapped" }> => resolved.kind === "already_mapped")
    .map((resolved) => resolved.row);
  const proposedRows = resolvedRows
    .filter((resolved): resolved is Extract<ResolvedPromotion, { kind: "eligible" }> => resolved.kind === "eligible")
    .map((resolved) => resolved.row)
    .sort((left, right) => left.depth - right.depth || left.sortOrder - right.sortOrder || left.legacySubtaskId.localeCompare(right.legacySubtaskId));
  const skippedRows = resolvedRows
    .filter((resolved): resolved is Extract<ResolvedPromotion, { kind: "skipped" }> => resolved.kind === "skipped")
    .map((resolved) => resolved.row);

  return {
    alreadyMappedRows,
    proposedRows,
    sampleRows: proposedRows.slice(0, sampleLimit),
    skippedRows,
    summary: {
      alreadyMapped: alreadyMappedRows.length,
      duplicateOrAmbiguous: skippedRows.filter((row) => AMBIGUOUS_SKIP_REASONS.has(row.reason)).length,
      eligibleForPromotion: proposedRows.length,
      missingRequiredFields: skippedRows.filter((row) => row.reason === "missing_required_fields").length,
      skippedBecauseParentTaskArchivedOrTrashed: skippedRows.filter((row) => row.reason === "parent_task_archived_or_trashed").length,
      skippedBecauseParentTaskMissing: skippedRows.filter((row) => row.reason === "parent_task_missing").length,
      skippedBecauseLegacyParentMissing: skippedRows.filter((row) => row.reason === "legacy_parent_missing" || row.reason === "legacy_parent_not_promotable").length,
      totalLegacySubtasks: subtasks.length,
    },
  };
}

export function buildPromotedStepTaskInsert(row: LegacyStepPromotionProposedRow, currentUserId: string): TaskInsert {
  return {
    actual_seconds: 0,
    completed_at: null,
    due_on: null,
    due_time: null,
    energy: "none",
    estimated_minutes: null,
    external_link_label: null,
    external_link_url: null,
    id: row.taskId,
    is_important: false,
    is_urgent: false,
    notes: null,
    one_step_at_a_time: false,
    parent_task_id: row.parentTaskId,
    priority: "normal",
    repeat_day_of_month: null,
    repeat_days_of_week: [],
    repeat_frequency: "none",
    repeat_interval: 1,
    scheduled_on: null,
    sort_order: row.sortOrder,
    status: row.proposedStatus,
    subtasks_auto_reset: false,
    tags: [],
    title: row.title,
    trashed_at: null,
    user_id: currentUserId,
  };
}

export async function dryRunLegacyStepPromotion(client: SupabaseClient, currentUserId: string) {
  const inputResult = await fetchLegacyStepPromotionInputs(client, currentUserId);
  if (inputResult.error) {
    return { data: null, error: inputResult.error };
  }

  return {
    data: buildLegacyStepPromotionDryRun({
      currentUserId,
      mappings: inputResult.mappings,
      subtasks: inputResult.subtasks,
      tasks: inputResult.tasks,
    }),
    error: null,
  };
}

export async function promoteLegacySteps(client: SupabaseClient, currentUserId: string): Promise<{ data: LegacyStepPromotionResult | null; error: { message: string } | null }> {
  const inputResult = await fetchLegacyStepPromotionInputs(client, currentUserId);
  if (inputResult.error) {
    return { data: null, error: inputResult.error };
  }

  const dryRun = buildLegacyStepPromotionDryRun({
    currentUserId,
    mappings: inputResult.mappings,
    subtasks: inputResult.subtasks,
    tasks: inputResult.tasks,
  });
  const promotedRows: LegacyStepPromotionMappedRow[] = [];
  const errors: Array<{ legacySubtaskId: string; message: string }> = [];

  for (const row of dryRun.proposedRows) {
    const taskPayload = buildPromotedStepTaskInsert(row, currentUserId);
    const taskInsertResult = await client
      .from("adhdice_clean_tasks")
      .insert(taskPayload)
      .select("*")
      .single();

    if (taskInsertResult.error) {
      errors.push({ legacySubtaskId: row.legacySubtaskId, message: taskInsertResult.error.message });
      continue;
    }

    const mappingPayload: LegacySubtaskPromotionInsert = {
      legacy_subtask_id: row.legacySubtaskId,
      task_id: row.taskId,
      user_id: currentUserId,
    };
    const mappingInsertResult = await client
      .from("adhdice_legacy_subtask_promotions")
      .insert(mappingPayload)
      .select("*")
      .single();

    if (mappingInsertResult.error) {
      await client
        .from("adhdice_clean_tasks")
        .delete()
        .eq("id", row.taskId)
        .eq("user_id", currentUserId);
      errors.push({ legacySubtaskId: row.legacySubtaskId, message: mappingInsertResult.error.message });
      continue;
    }

    promotedRows.push({
      legacySubtaskId: row.legacySubtaskId,
      taskId: row.taskId,
      title: row.title,
    });
  }

  return {
    data: {
      dryRun,
      errors,
      promotedRows,
      skippedRows: dryRun.skippedRows,
    },
    error: null,
  };
}

async function fetchLegacyStepPromotionInputs(client: SupabaseClient, currentUserId: string) {
  const [taskResult, subtaskResult, mappingResult] = await Promise.all([
    client
      .from("adhdice_clean_tasks")
      .select("*")
      .eq("user_id", currentUserId),
    client
      .from("adhdice_task_subtasks")
      .select("*")
      .eq("user_id", currentUserId)
      .order("task_id", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    client
      .from("adhdice_legacy_subtask_promotions")
      .select("*")
      .eq("user_id", currentUserId),
  ]);

  const firstError = taskResult.error ?? subtaskResult.error ?? mappingResult.error ?? null;
  if (firstError) {
    return {
      error: { message: firstError.message },
      mappings: [],
      subtasks: [],
      tasks: [],
    };
  }

  return {
    error: null,
    mappings: mappingResult.data ?? [],
    subtasks: subtaskResult.data ?? [],
    tasks: taskResult.data ?? [],
  };
}

function sortLegacySubtasks(subtasks: TaskSubtask[]) {
  return [...subtasks].sort((left, right) => {
    if (left.task_id !== right.task_id) {
      return left.task_id.localeCompare(right.task_id);
    }
    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order;
    }
    if (left.created_at !== right.created_at) {
      return left.created_at.localeCompare(right.created_at);
    }
    return left.id.localeCompare(right.id);
  });
}
