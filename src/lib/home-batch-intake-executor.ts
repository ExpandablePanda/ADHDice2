import type { HealthWaterEntryInsert, HealthWeightEntryInsert, HealthWeightUnit, TaskStatus } from "@/lib/database.types";
import type {
  BatchIntakeDraft,
  BatchIntakeTaskDraft,
  BatchIntakeWaterDraft,
  BatchIntakeWeightDraft,
} from "@/lib/home-batch-intake";
import { waterDraftAmountInMilliliters, weightDraftInKilograms } from "@/lib/home-batch-intake";

export type BatchIntakeTaskGroup = {
  key: string;
  taskId: string;
  outcome: Extract<TaskStatus, "done" | "did_my_best" | "missed">;
  dates: string[];
  rowIds: string[];
};

export type BatchIntakeExecutionPlan = {
  taskGroups: BatchIntakeTaskGroup[];
  waterRows: Array<{ rowId: string; input: Omit<HealthWaterEntryInsert, "user_id"> }>;
  weightRows: Array<{ rowId: string; input: Omit<HealthWeightEntryInsert, "user_id"> }>;
};

export type BatchIntakeRowExecution = {
  rowId: string;
  status: "applied" | "failed" | "skipped";
  error?: string;
};

export type BatchIntakeExecutionResult = {
  rows: BatchIntakeRowExecution[];
  taskGroups: Array<BatchIntakeRowExecution & { groupKey: string }>;
};

export type BatchIntakeExecutionAuthorities = {
  syncTaskHistoryEntries: (
    taskId: string,
    outcome: Extract<TaskStatus, "done" | "did_my_best" | "missed">,
    dates: string[],
    options?: { historicalOverride?: boolean },
  ) => Promise<boolean>;
  addWaterEntries: (inputs: Array<Omit<HealthWaterEntryInsert, "user_id">>) => Promise<BatchHealthWriteResult>;
  addWeightEntries: (inputs: Array<Omit<HealthWeightEntryInsert, "user_id">>) => Promise<BatchHealthWriteResult>;
};

export type BatchHealthWriteResult = {
  success: boolean;
  rows: Array<{ index: number; success: boolean; error?: string }>;
  error?: string;
};

export function buildBatchIntakeExecutionPlan(
  drafts: readonly BatchIntakeDraft[],
  options: { preferredWeightUnit?: HealthWeightUnit | null; loggedAtForDate?: (date: string) => string } = {},
): BatchIntakeExecutionPlan {
  const taskGroups = new Map<string, BatchIntakeTaskGroup>();
  const waterRows: BatchIntakeExecutionPlan["waterRows"] = [];
  const weightRows: BatchIntakeExecutionPlan["weightRows"] = [];
  const loggedAtForDate = options.loggedAtForDate ?? ((date) => `${date}T12:00:00`);

  for (const draft of drafts) {
    const blockingIssues = draft.issues.filter((issue) => !(draft.kind === "weight" && issue === "Health preferred weight unit is not ready" && (draft.unit ?? options.preferredWeightUnit)));
    if (!draft.included || !draft.date || blockingIssues.length > 0) continue;
    if (draft.kind === "task") {
      if (!draft.selectedTaskId || !draft.outcome) continue;
      const key = `${draft.selectedTaskId}:${draft.outcome}`;
      const group = taskGroups.get(key) ?? {
        key,
        taskId: draft.selectedTaskId,
        outcome: draft.outcome,
        dates: [],
        rowIds: [],
      };
      if (!group.dates.includes(draft.date)) group.dates.push(draft.date);
      group.rowIds.push(draft.id);
      taskGroups.set(key, group);
      continue;
    }
    if (draft.kind === "water") {
      const amountMl = waterDraftAmountInMilliliters(draft);
      if (amountMl === null || draft.status === null) continue;
      waterRows.push({
        rowId: draft.id,
        input: {
          amount: draft.amount!,
          amount_ml: amountMl,
          confirmed_at: draft.status === "confirmed" ? loggedAtForDate(draft.date) : null,
          entry_date: draft.date,
          ...(draft.writeId ? { id: draft.writeId } : {}),
          logged_at: loggedAtForDate(draft.date),
          unit: draft.unit,
        },
      });
      continue;
    }
    if (draft.kind === "weight") {
      const unit = draft.unit ?? options.preferredWeightUnit ?? null;
      const weightKg = unit ? weightDraftInKilograms({ value: draft.value, unit }) : null;
      if (weightKg === null) continue;
      weightRows.push({
        rowId: draft.id,
        input: {
          entry_date: draft.date,
          ...(draft.writeId ? { id: draft.writeId } : {}),
          logged_at: loggedAtForDate(draft.date),
          source: "manual",
          weight_kg: weightKg,
        },
      });
    }
  }

  return {
    taskGroups: [...taskGroups.values()].map((group) => ({ ...group, dates: [...group.dates].sort() })),
    waterRows,
    weightRows,
  };
}

export async function executeBatchIntakePlan(
  plan: BatchIntakeExecutionPlan,
  authorities: BatchIntakeExecutionAuthorities,
): Promise<BatchIntakeExecutionResult> {
  const taskGroups: BatchIntakeExecutionResult["taskGroups"] = [];
  const rows: BatchIntakeRowExecution[] = [];

  for (const group of plan.taskGroups) {
    const success = await authorities.syncTaskHistoryEntries(group.taskId, group.outcome, group.dates, { historicalOverride: true });
    const error = success ? undefined : "Canonical Task History did not commit this group.";
    taskGroups.push({ groupKey: group.key, rowId: group.rowIds[0], status: success ? "applied" : "failed", ...(error ? { error } : {}) });
    rows.push(...group.rowIds.map((rowId) => ({ rowId, status: success ? "applied" as const : "failed" as const, ...(error ? { error } : {}) })));
  }

  if (plan.waterRows.length > 0) {
    const result = await authorities.addWaterEntries(plan.waterRows.map(({ input }) => input));
    rows.push(...plan.waterRows.map(({ rowId }, index) => ({
      rowId,
      status: result.rows[index]?.success ? "applied" as const : "failed" as const,
      ...(result.rows[index]?.success ? {} : { error: result.rows[index]?.error ?? result.error ?? "Water batch write failed." }),
    })));
  }

  if (plan.weightRows.length > 0) {
    const result = await authorities.addWeightEntries(plan.weightRows.map(({ input }) => input));
    rows.push(...plan.weightRows.map(({ rowId }, index) => ({
      rowId,
      status: result.rows[index]?.success ? "applied" as const : "failed" as const,
      ...(result.rows[index]?.success ? {} : { error: result.rows[index]?.error ?? result.error ?? "Weight batch write failed." }),
    })));
  }

  return { rows, taskGroups };
}

export function getBatchIntakeApplyCount(drafts: readonly BatchIntakeDraft[], options?: { preferredWeightUnit?: HealthWeightUnit | null }) {
  const plan = buildBatchIntakeExecutionPlan(drafts, options);
  return plan.taskGroups.reduce((count, group) => count + group.rowIds.length, 0)
    + plan.waterRows.length
    + plan.weightRows.length;
}

export function isBatchIntakeTaskDraftReady(draft: BatchIntakeTaskDraft) {
  return draft.included && draft.date !== null && draft.selectedTaskId !== null && draft.outcome !== null && draft.issues.length === 0;
}

export function isBatchIntakeWaterDraftReady(draft: BatchIntakeWaterDraft) {
  return draft.included && draft.date !== null && draft.amount !== null && draft.status !== null && draft.issues.length === 0;
}

export function isBatchIntakeWeightDraftReady(draft: BatchIntakeWeightDraft, preferredWeightUnit?: HealthWeightUnit | null) {
  return draft.included && draft.date !== null && draft.value !== null && Boolean(draft.unit ?? preferredWeightUnit) && draft.issues.length === 0;
}
