import type { HealthMealEntryInsert, HealthWaterEntryInsert, HealthWeightEntryInsert, HealthWeightUnit, TaskStatus } from "@/lib/database.types";
import type {
  BatchIntakeDraft,
  BatchIntakeFocusDraft,
  BatchIntakeMealFoodDraft,
  BatchIntakeMealOccurrenceDraft,
  BatchIntakeTaskDraft,
  BatchIntakeWaterDraft,
  BatchIntakeWeightDraft,
} from "@/lib/home-batch-intake";
import { calculateBatchIntakeMealNutrition, waterDraftAmountInMilliliters, weightDraftInKilograms } from "@/lib/home-batch-intake";
import { buildHealthMealLoggedAt } from "@/lib/health-utils";
import { buildHealthMealEntryInputFromSelection } from "@/lib/health-meal-draft";
import type { FocusManualEntryInput } from "@/lib/types";

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
  mealRows?: Array<{ rowId: string; input: Omit<HealthMealEntryInsert, "user_id"> }>;
  focusRows?: Array<{ rowId: string; input: FocusManualEntryInput }>;
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

function mergeBatchIntakeExecutionEntries<T extends BatchIntakeRowExecution>(
  previous: readonly T[],
  next: readonly T[],
  identity: (entry: T) => string,
) {
  const nextByIdentity = new Map(next.map((entry) => [identity(entry), entry]));
  const merged = previous.map((entry) => {
    const replacement = nextByIdentity.get(identity(entry));
    if (!replacement) return entry;
    return entry.status === "applied" && replacement.status !== "applied" ? entry : replacement;
  });
  const seen = new Set(previous.map(identity));
  for (const entry of next) {
    const entryIdentity = identity(entry);
    if (seen.has(entryIdentity)) continue;
    seen.add(entryIdentity);
    merged.push(entry);
  }
  return merged;
}

export function mergeBatchIntakeExecutionResults(
  previous: BatchIntakeExecutionResult | null,
  next: BatchIntakeExecutionResult,
): BatchIntakeExecutionResult {
  if (!previous) return { rows: [...next.rows], taskGroups: [...next.taskGroups] };
  return {
    rows: mergeBatchIntakeExecutionEntries(previous.rows, next.rows, (entry) => entry.rowId),
    taskGroups: mergeBatchIntakeExecutionEntries(previous.taskGroups, next.taskGroups, (entry) => entry.groupKey),
  };
}

export type BatchIntakeApplyProgress = {
  stage: "tasks" | "water" | "weight" | "meals" | "focus" | "complete";
  processed: number;
  total: number;
  applied: number;
  failed: number;
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
  addMealEntries: (inputs: Array<Omit<HealthMealEntryInsert, "user_id">>) => Promise<BatchHealthWriteResult>;
  handleManualFocusEntries: (inputs: FocusManualEntryInput[]) => Promise<BatchFocusWriteResult>;
};

export type BatchHealthWriteResult = {
  success: boolean;
  rows: Array<{ index: number; success: boolean; error?: string }>;
  error?: string;
};

export type BatchFocusWriteResult = BatchHealthWriteResult;

type BatchIntakeExecutionOptions = {
  onProgress?: (progress: BatchIntakeApplyProgress) => void;
};

export function buildBatchIntakeExecutionPlan(
  drafts: readonly BatchIntakeDraft[],
  options: { preferredWeightUnit?: HealthWeightUnit | null; loggedAtForDate?: (date: string, time?: string | null) => string | null } = {},
): BatchIntakeExecutionPlan {
  const taskGroups = new Map<string, BatchIntakeTaskGroup>();
  const waterRows: BatchIntakeExecutionPlan["waterRows"] = [];
  const weightRows: BatchIntakeExecutionPlan["weightRows"] = [];
  const mealRows: BatchIntakeExecutionPlan["mealRows"] = [];
  const focusRows: BatchIntakeExecutionPlan["focusRows"] = [];
  const loggedAtForDate = options.loggedAtForDate ?? ((date, time) => time?.trim() ? buildHealthMealLoggedAt(date, time) : buildHealthMealLoggedAt(date, "12:00"));
  const mealOccurrences = new Map(
    drafts
      .filter((draft): draft is Extract<BatchIntakeDraft, { kind: "meal"; entryMode: "occurrence" }> => draft.kind === "meal" && draft.entryMode === "occurrence")
      .map((draft) => [draft.id, draft]),
  );

  for (const draft of drafts) {
    const blockingIssues = draft.issues.filter((issue) => !(draft.kind === "weight" && issue === "Health preferred weight unit is not ready" && (draft.unit ?? options.preferredWeightUnit)));
    if (!draft.included || blockingIssues.length > 0) continue;
    if (draft.kind === "meal") {
      if (draft.entryMode === "occurrence") continue;
      const occurrence = mealOccurrences.get(draft.mealOccurrenceId);
      if (!occurrence || !isBatchIntakeMealFoodDraftReady(draft, occurrence)) continue;
      const loggedAt = loggedAtForDate(occurrence.date!, occurrence.time);
      if (!loggedAt) continue;
      mealRows.push({
        rowId: draft.id,
        input: buildHealthMealEntryInputFromSelection({
          attribution: draft.attribution,
          barcode: draft.barcode,
          brandName: draft.brandName,
          calories: draft.calories!,
          carbs: draft.carbsG,
          consumedQuantity: draft.consumedQuantity ?? undefined,
          consumedUnit: draft.consumedUnit,
          fat: draft.fatG,
          foodCategory: draft.foodCategory,
          foodName: draft.foodName,
          nutritionDetails: draft.nutritionDetails,
          provider: draft.provider,
          providerItemId: draft.providerItemId,
          protein: draft.proteinG,
          servingLabel: draft.servingLabel.trim() || null,
          servingMeasureUnit: draft.servingMeasureUnit,
          servingMeasureValue: draft.servingMeasureValue,
          servingQuantity: draft.servingQuantity,
          servingUnit: draft.servingUnit,
          sourceFoodId: draft.sourceFoodId,
        }, { date: occurrence.date!, id: draft.writeId, loggedAt, mealSlot: occurrence.mealSlot }),
      });
      continue;
    }
    if (!draft.date) continue;
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
      const waterLoggedAt = loggedAtForDate(draft.date, "time" in draft ? draft.time : null);
      if (!waterLoggedAt) continue;
      waterRows.push({
        rowId: draft.id,
        input: {
          amount: draft.amount!,
          amount_ml: amountMl,
          confirmed_at: draft.status === "confirmed" ? waterLoggedAt : null,
          entry_date: draft.date,
          ...(draft.writeId ? { id: draft.writeId } : {}),
          logged_at: waterLoggedAt,
          unit: draft.unit,
        },
      });
      continue;
    }
    if (draft.kind === "weight") {
      const unit = draft.unit ?? options.preferredWeightUnit ?? null;
      const weightKg = unit ? weightDraftInKilograms({ value: draft.value, unit }) : null;
      if (weightKg === null) continue;
      const weightLoggedAt = loggedAtForDate(draft.date, "time" in draft ? draft.time : null);
      if (!weightLoggedAt) continue;
      weightRows.push({
        rowId: draft.id,
        input: {
          entry_date: draft.date,
          ...(draft.writeId ? { id: draft.writeId } : {}),
          logged_at: weightLoggedAt,
          source: "manual",
          weight_kg: weightKg,
        },
      });
      continue;
    }
    if (draft.kind === "focus") {
      if (!isBatchIntakeFocusDraftReady(draft)) continue;
      focusRows.push({
        rowId: draft.id,
        input: {
          categoryId: draft.categoryId,
          completionTime: draft.completionTime,
          date: draft.date!,
          durationSeconds: draft.durationSeconds!,
          focusSubtype: draft.focusSubtype,
          focusSubtype2: draft.focusSubtype2,
          focusType: draft.focusType,
          ...(draft.writeId ? { id: draft.writeId } : {}),
          notes: draft.notes,
          title: draft.title,
        },
      });
    }
  }

  return {
    taskGroups: [...taskGroups.values()].map((group) => ({ ...group, dates: [...group.dates].sort() })),
    waterRows,
    weightRows,
    mealRows,
    focusRows,
  };
}

export async function executeBatchIntakePlan(
  plan: BatchIntakeExecutionPlan,
  authorities: BatchIntakeExecutionAuthorities,
  options: BatchIntakeExecutionOptions = {},
): Promise<BatchIntakeExecutionResult> {
  const taskGroups: BatchIntakeExecutionResult["taskGroups"] = [];
  const rows: BatchIntakeRowExecution[] = [];
  const mealRowsPlan = plan.mealRows ?? [];
  const focusRowsPlan = plan.focusRows ?? [];
  const total = getBatchIntakePlanApplyCount(plan);
  let processed = 0;
  let applied = 0;
  let failed = 0;
  const emitProgress = (stage: BatchIntakeApplyProgress["stage"]) => {
    options.onProgress?.({ stage, processed, total, applied, failed });
  };
  const initialStage: BatchIntakeApplyProgress["stage"] = plan.taskGroups.length > 0
    ? "tasks"
    : plan.waterRows.length > 0
      ? "water"
      : plan.weightRows.length > 0
        ? "weight"
        : mealRowsPlan.length > 0
          ? "meals"
          : focusRowsPlan.length > 0
            ? "focus"
        : "complete";

  emitProgress(initialStage);

  for (const group of plan.taskGroups) {
    const success = await authorities.syncTaskHistoryEntries(group.taskId, group.outcome, group.dates, { historicalOverride: true });
    const error = success ? undefined : "Canonical Task History did not commit this group.";
    taskGroups.push({ groupKey: group.key, rowId: group.rowIds[0], status: success ? "applied" : "failed", ...(error ? { error } : {}) });
    rows.push(...group.rowIds.map((rowId) => ({ rowId, status: success ? "applied" as const : "failed" as const, ...(error ? { error } : {}) })));
    processed += group.rowIds.length;
    if (success) applied += group.rowIds.length;
    else failed += group.rowIds.length;
    emitProgress("tasks");
  }

  if (plan.waterRows.length > 0) {
    if (initialStage !== "water") emitProgress("water");
    const result = await authorities.addWaterEntries(plan.waterRows.map(({ input }) => input));
    const waterRows = plan.waterRows.map(({ rowId }, index) => ({
      rowId,
      status: result.rows[index]?.success ? "applied" as const : "failed" as const,
      ...(result.rows[index]?.success ? {} : { error: result.rows[index]?.error ?? result.error ?? "Water batch write failed." }),
    }));
    rows.push(...waterRows);
    processed += waterRows.length;
    applied += waterRows.filter((row) => row.status === "applied").length;
    failed += waterRows.filter((row) => row.status === "failed").length;
    emitProgress("water");
  }

  if (plan.weightRows.length > 0) {
    if (initialStage !== "weight") emitProgress("weight");
    const result = await authorities.addWeightEntries(plan.weightRows.map(({ input }) => input));
    const weightRows = plan.weightRows.map(({ rowId }, index) => ({
      rowId,
      status: result.rows[index]?.success ? "applied" as const : "failed" as const,
      ...(result.rows[index]?.success ? {} : { error: result.rows[index]?.error ?? result.error ?? "Weight batch write failed." }),
    }));
    rows.push(...weightRows);
    processed += weightRows.length;
    applied += weightRows.filter((row) => row.status === "applied").length;
    failed += weightRows.filter((row) => row.status === "failed").length;
    emitProgress("weight");
  }

  if (mealRowsPlan.length > 0) {
    if (initialStage !== "meals") emitProgress("meals");
    const result = await authorities.addMealEntries(mealRowsPlan.map(({ input }) => input));
    const mealRows = mealRowsPlan.map(({ rowId }, index) => ({
      rowId,
      status: result.rows[index]?.success ? "applied" as const : "failed" as const,
      ...(result.rows[index]?.success ? {} : { error: result.rows[index]?.error ?? result.error ?? "Meal batch write failed." }),
    }));
    rows.push(...mealRows);
    processed += mealRows.length;
    applied += mealRows.filter((row) => row.status === "applied").length;
    failed += mealRows.filter((row) => row.status === "failed").length;
    emitProgress("meals");
  }

  if (focusRowsPlan.length > 0) {
    if (initialStage !== "focus") emitProgress("focus");
    const result = await authorities.handleManualFocusEntries(focusRowsPlan.map(({ input }) => input));
    const focusRows = focusRowsPlan.map(({ rowId }, index) => ({
      rowId,
      status: result.rows[index]?.success ? "applied" as const : "failed" as const,
      ...(result.rows[index]?.success ? {} : { error: result.rows[index]?.error ?? result.error ?? "Focus batch write failed." }),
    }));
    rows.push(...focusRows);
    processed += focusRows.length;
    applied += focusRows.filter((row) => row.status === "applied").length;
    failed += focusRows.filter((row) => row.status === "failed").length;
    emitProgress("focus");
  }

  emitProgress("complete");
  return { rows, taskGroups };
}

function getBatchIntakePlanApplyCount(plan: BatchIntakeExecutionPlan) {
  return plan.taskGroups.reduce((count, group) => count + group.rowIds.length, 0)
    + plan.waterRows.length
    + plan.weightRows.length
    + (plan.mealRows?.length ?? 0)
    + (plan.focusRows?.length ?? 0);
}

export function getBatchIntakeApplyCount(drafts: readonly BatchIntakeDraft[], options?: { preferredWeightUnit?: HealthWeightUnit | null }) {
  const plan = buildBatchIntakeExecutionPlan(drafts, options);
  return getBatchIntakePlanApplyCount(plan);
}

export function isBatchIntakeTaskDraftReady(draft: BatchIntakeTaskDraft) {
  return draft.included && draft.date !== null && draft.selectedTaskId !== null && draft.outcome !== null && draft.issues.length === 0;
}

export function isBatchIntakeWaterDraftReady(draft: BatchIntakeWaterDraft) {
  return draft.included && draft.date !== null && draft.amount !== null && draft.status !== null && draft.issues.length === 0 && (!("time" in draft) || !draft.time || buildHealthMealLoggedAt(draft.date, draft.time) !== null);
}

export function isBatchIntakeWeightDraftReady(draft: BatchIntakeWeightDraft, preferredWeightUnit?: HealthWeightUnit | null) {
  return draft.included && draft.date !== null && draft.value !== null && Boolean(draft.unit ?? preferredWeightUnit) && draft.issues.length === 0 && (!("time" in draft) || !draft.time || buildHealthMealLoggedAt(draft.date, draft.time) !== null);
}

export function isBatchIntakeMealFoodDraftReady(
  draft: BatchIntakeMealFoodDraft,
  occurrence: BatchIntakeMealOccurrenceDraft | null | undefined,
) {
  const optionalMacros = [draft.proteinG, draft.carbsG, draft.fatG];
  return draft.included
    && occurrence !== null
    && occurrence !== undefined
    && occurrence.included
    && occurrence.date !== null
    && draft.entryMode === "food"
    && draft.foodName.trim().length > 0
    && draft.calories !== null
    && Number.isFinite(draft.calories)
    && draft.calories >= 0
    && optionalMacros.every((value) => value === null || (Number.isFinite(value) && value >= 0))
    && draft.consumedQuantity !== null
    && Number.isFinite(draft.consumedQuantity)
    && draft.consumedQuantity > 0
    && draft.consumedUnit.trim().length > 0
    && calculateBatchIntakeMealNutrition(draft) !== null
    && occurrence.issues.length === 0
    && buildHealthMealLoggedAt(occurrence.date, occurrence.time) !== null
    && draft.issues.length === 0;
}

export const isBatchIntakeMealDraftReady = isBatchIntakeMealFoodDraftReady;

export function isBatchIntakeFocusDraftReady(draft: BatchIntakeFocusDraft) {
  return draft.included
    && draft.date !== null
    && draft.title.trim().length > 0
    && draft.focusType.trim().length > 0
    && draft.durationSeconds !== null
    && Number.isFinite(draft.durationSeconds)
    && draft.durationSeconds > 0
    && buildHealthMealLoggedAt(draft.date, draft.completionTime) !== null
    && draft.issues.length === 0;
}
