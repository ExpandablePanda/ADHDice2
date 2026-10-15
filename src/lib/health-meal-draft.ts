import type {
  HealthFoodLibraryItem,
  HealthMealEntry,
  HealthMealEntryInsert,
  HealthMealPlanEntry,
  HealthMealPlanEntryInsert,
  HealthNutritionDetails,
  HealthServingMeasureUnit,
} from "@/lib/database.types";
import type { EditingSessionStore } from "@/lib/editing-session-store";
import { getCurrentHealthDateTimeInputs, normalizeHealthMealTime } from "@/lib/health-utils";
import { buildHealthMealFoodSnapshot, formatHealthConsumedMealLabel, normalizeHealthMealStoredCalories } from "@/lib/health-meal-recalculation";
import { calculateHealthFoodNutrition } from "@/lib/health-nutrition";

export type MealDraft = {
  attribution: string | null;
  barcode: string | null;
  brandName: string;
  calories: string;
  carbs: string;
  date: string;
  fat: string;
  foodName: string;
  nutritionDetails: HealthNutritionDetails | null;
  mealSlot: HealthMealEntry["meal_slot"];
  protein: string;
  provider: string | null;
  providerItemId: string | null;
  quantity: string;
  measurement: string;
  sourceFoodId: string | null;
  foodCategory: string | null;
  servingQuantity: number | null;
  servingUnit: string;
  servingMeasureValue: number | null;
  servingMeasureUnit: HealthServingMeasureUnit | null;
  servingLabel: string;
  time: string;
};

export type MealEditDraft = {
  mode: "legacy" | "structured";
  calories: string;
  carbs: string;
  date: string;
  fat: string;
  mealSlot: HealthMealEntry["meal_slot"];
  protein: string;
  quantity: string;
  measurement: string;
  servingLabel: string;
  time: string;
};

export type HealthFoodNewEntryEditingSessionDraft = {
  kind: "new-entry";
  entryId: string;
  quickFoodId: string;
  mealDraft: MealDraft;
  saveToLibrary: boolean;
};

export type HealthFoodSavedEntryEditingSessionDraft = {
  kind: "saved-entry";
  mealEditDraft: MealEditDraft;
};

export type HealthFoodEditingSessionDraft =
  | HealthFoodNewEntryEditingSessionDraft
  | HealthFoodSavedEntryEditingSessionDraft;

export type HealthFoodEditingSessionSaveResult =
  | { savedDraft: HealthFoodEditingSessionDraft }
  | { error: string };

export function createHealthFoodDraftId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export function healthMealEntrySessionId(entryId: string) {
  return `health-meal-entry:${entryId}`;
}

export function healthMealNewEntrySessionId(draftId: string) {
  return `health-meal-new:${draftId}`;
}

export function createHealthFoodEditingSessionDraft(
  mealDraft: MealDraft,
  ids: { entryId?: string; quickFoodId?: string } = {},
): HealthFoodNewEntryEditingSessionDraft {
  return {
    kind: "new-entry",
    entryId: ids.entryId ?? createHealthFoodDraftId(),
    quickFoodId: ids.quickFoodId ?? createHealthFoodDraftId(),
    mealDraft,
    saveToLibrary: false,
  };
}

export function areHealthFoodEditingSessionDraftsEqual(
  left: HealthFoodEditingSessionDraft,
  right: HealthFoodEditingSessionDraft,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function saveHealthFoodEditingSession({
  store,
  draftId,
  save,
  removeAfterSuccess = false,
}: {
  store: EditingSessionStore<HealthFoodEditingSessionDraft>;
  draftId: string;
  save: (draft: HealthFoodEditingSessionDraft) => Promise<HealthFoodEditingSessionSaveResult>;
  removeAfterSuccess?: boolean;
}) {
  const session = store.getSnapshot(draftId);
  if (!session || session.isSaving) return false;
  const saveRevision = store.beginSave(draftId);
  if (saveRevision === null) return false;
  try {
    const result = await save(session.draft);
    if ("error" in result) {
      store.saveFailed(draftId, saveRevision, result.error);
      return false;
    }
    return removeAfterSuccess
      ? store.removeAfterSave(draftId, saveRevision)
      : store.saveSucceeded(draftId, saveRevision, result.savedDraft);
  } catch (error) {
    store.saveFailed(draftId, saveRevision, error instanceof Error ? error.message : "The meal could not be saved. Your draft is still here.");
    return false;
  }
}

type ParsedDecimal = { coefficient: bigint; exponent: number; negative: boolean };

function parseMealDecimal(value: unknown): ParsedDecimal | null {
  const raw = typeof value === "number"
    ? Number.isFinite(value) ? value.toString() : null
    : typeof value === "string" ? value.trim() : null;
  if (!raw) return null;
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(raw);
  if (!match) return null;
  let coefficient = BigInt(`${match[2]}${match[3] ?? ""}`);
  let exponent = Number(match[4] ?? "0") - (match[3]?.length ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) return null;
  if (coefficient === BigInt(0)) return { coefficient: BigInt(0), exponent: 0, negative: false };
  while (coefficient !== BigInt(0) && coefficient % BigInt(10) === BigInt(0)) {
    coefficient /= BigInt(10);
    exponent += 1;
  }
  return { coefficient, exponent, negative: coefficient !== BigInt(0) && match[1] === "-" };
}

function mealDecimalUnits(value: unknown, scale: number, round: boolean): bigint | null {
  const parsed = parseMealDecimal(value);
  if (!parsed) return null;
  const shift = parsed.exponent + scale;
  if (Math.abs(shift) > 1000) return null;
  let units: bigint;
  if (shift >= 0) {
    units = parsed.coefficient * (BigInt(10) ** BigInt(shift));
  } else {
    const divisor = BigInt(10) ** BigInt(-shift);
    units = parsed.coefficient / divisor;
    const remainder = parsed.coefficient % divisor;
    if (round && remainder * BigInt(2) >= divisor) units += BigInt(1);
    else if (!round && remainder !== BigInt(0)) return null;
  }
  return parsed.negative ? BigInt(-1) * units : units;
}

function mealDecimalsEqual(left: unknown, right: unknown) {
  const leftDecimal = parseMealDecimal(left);
  const rightDecimal = parseMealDecimal(right);
  return leftDecimal !== null
    && rightDecimal !== null
    && leftDecimal.coefficient === rightDecimal.coefficient
    && leftDecimal.exponent === rightDecimal.exponent
    && leftDecimal.negative === rightDecimal.negative;
}

function nullableMealDecimalsEqual(left: unknown, right: unknown) {
  if (left === null || left === undefined) return right === null || right === undefined;
  if (right === null || right === undefined) return false;
  return mealDecimalsEqual(left, right);
}

function mealMacroMatches(actual: unknown, expected: unknown) {
  if (expected === null || expected === undefined) return actual === null || actual === undefined;
  if (actual === null || actual === undefined) return false;
  const expectedStoredValue = mealDecimalUnits(expected, 2, true);
  const actualStoredValue = mealDecimalUnits(actual, 2, false);
  return expectedStoredValue !== null && actualStoredValue !== null && expectedStoredValue === actualStoredValue;
}

function mealTimestampMicroseconds(value: unknown): bigint | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([Zz]|[+-]\d{2}(?::?\d{2})?)$/.exec(value);
  if (!match) return null;
  const [, date, hoursText, minutesText, secondsText, fraction = "", zone] = match;
  const [year, month, day] = date.split("-").map(Number);
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  const seconds = Number(secondsText);
  const monthDays = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1] || hours > 23 || minutes > 59 || seconds > 59) return null;
  let normalizedZone = "Z";
  if (zone.toUpperCase() !== "Z") {
    const zoneParts = /^([+-])(\d{2})(?::?(\d{2}))?$/.exec(zone);
    if (!zoneParts || Number(zoneParts[2]) > 23 || Number(zoneParts[3] ?? "0") > 59) return null;
    normalizedZone = `${zoneParts[1]}${zoneParts[2]}:${zoneParts[3] ?? "00"}`;
  }
  const baseMilliseconds = Date.parse(`${date}T${hoursText}:${minutesText}:${secondsText}${normalizedZone}`);
  if (!Number.isFinite(baseMilliseconds)) return null;
  let fractionalMicroseconds = BigInt(fraction.slice(0, 6).padEnd(6, "0") || "0");
  if (fraction.length > 6 && fraction[6] >= "5") fractionalMicroseconds += BigInt(1);
  return BigInt(baseMilliseconds) * BigInt(1000) + fractionalMicroseconds;
}

function mealTimestampsEqual(left: unknown, right: unknown) {
  const leftInstant = mealTimestampMicroseconds(left);
  const rightInstant = mealTimestampMicroseconds(right);
  return leftInstant !== null && rightInstant !== null && leftInstant === rightInstant;
}

function jsonbSerializationValue(value: unknown) {
  try {
    const serialized = JSON.stringify(value);
    return { ok: true as const, value: serialized === undefined ? undefined : JSON.parse(serialized) as unknown };
  } catch {
    return { ok: false as const, value: undefined };
  }
}

function jsonbValuesEqual(left: unknown, right: unknown): boolean {
  const normalizedLeft = jsonbSerializationValue(left);
  const normalizedRight = jsonbSerializationValue(right);
  if (!normalizedLeft.ok || !normalizedRight.ok) return false;
  const compare = (first: unknown, second: unknown): boolean => {
    if (first === second) return true;
    if (Array.isArray(first) || Array.isArray(second)) {
      return Array.isArray(first)
        && Array.isArray(second)
        && first.length === second.length
        && first.every((value, index) => compare(value, second[index]));
    }
    if (first && second && typeof first === "object" && typeof second === "object") {
      const firstRecord = first as Record<string, unknown>;
      const secondRecord = second as Record<string, unknown>;
      const firstKeys = Object.keys(firstRecord).sort();
      const secondKeys = Object.keys(secondRecord).sort();
      return firstKeys.length === secondKeys.length
        && firstKeys.every((key, index) => key === secondKeys[index] && compare(firstRecord[key], secondRecord[key]));
    }
    return false;
  };
  return compare(normalizedLeft.value, normalizedRight.value);
}

export function healthMealEntryInsertMatches(
  entry: HealthMealEntry,
  input: Omit<HealthMealEntryInsert, "user_id">,
) {
  if (!input.id || entry.id !== input.id) return false;
  const expected: Record<string, unknown> = {
    attribution: input.attribution ?? null,
    barcode: input.barcode ?? null,
    brand_name: input.brand_name ?? null,
    entry_date: input.entry_date,
    food_name: input.food_name,
    meal_slot: input.meal_slot,
    provider: input.provider ?? "manual",
    provider_item_id: input.provider_item_id ?? null,
    serving_label: input.serving_label ?? null,
    consumed_unit: input.consumed_unit ?? null,
    source_food_id: input.source_food_id ?? null,
  };
  const actual = entry as unknown as Record<string, unknown>;
  if (!Object.entries(expected).every(([key, value]) => (actual[key] ?? null) === value)) return false;
  if (normalizeHealthMealStoredCalories(input.calories) !== entry.calories) return false;
  if (!mealMacroMatches(entry.protein_g, input.protein_g ?? null)
    || !mealMacroMatches(entry.carbs_g, input.carbs_g ?? null)
    || !mealMacroMatches(entry.fat_g, input.fat_g ?? null)) return false;
  if (!nullableMealDecimalsEqual(entry.consumed_quantity ?? null, input.consumed_quantity ?? null)
    || !nullableMealDecimalsEqual(entry.serving_fraction ?? null, input.serving_fraction ?? null)) return false;
  if (!mealTimestampsEqual(entry.logged_at, input.logged_at ?? entry.logged_at)) return false;
  return jsonbValuesEqual(entry.food_snapshot ?? null, input.food_snapshot ?? null)
    && jsonbValuesEqual(entry.nutrition_snapshot ?? null, input.nutrition_snapshot ?? null);
}

export async function reconcileHealthMealEntryInsert({
  input,
  result,
  lookupById,
}: {
  input: Omit<HealthMealEntryInsert, "user_id">;
  result: { data: HealthMealEntry | null; error: { code?: string; message: string } | null };
  lookupById: (id: string) => Promise<{ row: HealthMealEntry | null; error?: string | null }>;
}): Promise<{ row: HealthMealEntry | null; error: string | null }> {
  if (!result.error && result.data && healthMealEntryInsertMatches(result.data, input)) return { row: result.data, error: null };
  const acknowledgmentMayBeAmbiguous = !result.error
    || result.error.code === "23505"
    || !result.error.code
    || result.error.code.startsWith("08")
    || result.error.code === "40003";
  const mismatchedAcknowledgment = Boolean(result.data);
  if (!acknowledgmentMayBeAmbiguous && !mismatchedAcknowledgment) return { row: null, error: result.error?.message ?? "The meal could not be saved." };
  if (!input.id) {
    return { row: null, error: result.error?.message ?? "The saved meal did not match the draft. Your draft is still available to retry." };
  }
  const lookup = await lookupById(input.id);
  if (lookup.error) return { row: null, error: lookup.error };
  if (lookup.row && healthMealEntryInsertMatches(lookup.row, input)) return { row: lookup.row, error: null };
  if (result.error?.code === "23505") {
    return { row: null, error: "The meal ID is already in use by a different saved entry." };
  }
  if (mismatchedAcknowledgment) {
    return { row: null, error: "The saved meal did not match the draft. Your draft is still available to retry." };
  }
  return { row: null, error: result.error?.message ?? "The meal save could not be confirmed. Retry with the same draft." };
}

export function healthMealPlanEntryInsertMatches(
  plan: HealthMealPlanEntry,
  input: Omit<HealthMealPlanEntryInsert, "user_id">,
) {
  if (!input.id || plan.id !== input.id) return false;
  const expected: Record<string, unknown> = {
    attribution: input.attribution ?? null,
    barcode: input.barcode ?? null,
    brand_name: input.brand_name ?? null,
    food_name: input.food_name,
    meal_slot: input.meal_slot,
    planned_date: input.planned_date,
    provider: input.provider ?? "manual",
    provider_item_id: input.provider_item_id ?? null,
    serving_label: input.serving_label ?? null,
    consumed_unit: input.consumed_unit ?? null,
    source_food_id: input.source_food_id ?? null,
  };
  const actual = plan as unknown as Record<string, unknown>;
  if (!Object.entries(expected).every(([key, value]) => (actual[key] ?? null) === value)) return false;
  const expectedTime = normalizeHealthMealTime(input.planned_time);
  const actualTime = normalizeHealthMealTime(plan.planned_time);
  if (!expectedTime || !actualTime || expectedTime !== actualTime) return false;
  if (normalizeHealthMealStoredCalories(input.calories) !== plan.calories) return false;
  if (!mealMacroMatches(plan.protein_g, input.protein_g ?? null)
    || !mealMacroMatches(plan.carbs_g, input.carbs_g ?? null)
    || !mealMacroMatches(plan.fat_g, input.fat_g ?? null)) return false;
  if (!nullableMealDecimalsEqual(plan.consumed_quantity ?? null, input.consumed_quantity ?? null)
    || !nullableMealDecimalsEqual(plan.serving_fraction ?? null, input.serving_fraction ?? null)) return false;
  if (!mealTimestampsEqual(plan.planned_at, input.planned_at)) return false;
  if (plan.confirmed_at !== null || plan.confirmed_meal_entry_id !== null) return false;
  return jsonbValuesEqual(plan.food_snapshot ?? null, input.food_snapshot ?? null)
    && jsonbValuesEqual(plan.nutrition_snapshot ?? null, input.nutrition_snapshot ?? null);
}

export async function reconcileHealthMealPlanEntryInsert({
  input,
  result,
  lookupById,
}: {
  input: Omit<HealthMealPlanEntryInsert, "user_id">;
  result: { data: HealthMealPlanEntry | null; error: { code?: string; message: string } | null };
  lookupById: (id: string) => Promise<{ row: HealthMealPlanEntry | null; error?: string | null }>;
}): Promise<{ row: HealthMealPlanEntry | null; error: string | null }> {
  if (!result.error && result.data && healthMealPlanEntryInsertMatches(result.data, input)) return { row: result.data, error: null };
  const acknowledgmentMayBeAmbiguous = !result.error
    || result.error.code === "23505"
    || !result.error.code
    || result.error.code.startsWith("08")
    || result.error.code === "40003";
  const mismatchedAcknowledgment = Boolean(result.data);
  if (!acknowledgmentMayBeAmbiguous && !mismatchedAcknowledgment) return { row: null, error: result.error?.message ?? "The planned meal could not be saved." };
  if (!input.id) {
    return { row: null, error: result.error?.message ?? "The saved planned meal did not match the draft. Your draft is still available to retry." };
  }
  const lookup = await lookupById(input.id);
  if (lookup.error) return { row: null, error: lookup.error };
  if (lookup.row && healthMealPlanEntryInsertMatches(lookup.row, input)) return { row: lookup.row, error: null };
  if (result.error?.code === "23505") {
    return { row: null, error: "The plan ID is already in use by a different planned meal." };
  }
  if (mismatchedAcknowledgment) {
    return { row: null, error: "The saved planned meal did not match the draft. Your draft is still available to retry." };
  }
  return { row: null, error: result.error?.message ?? "The planned meal save could not be confirmed. Retry with the same draft." };
}

export type MealFoodSelection = {
  sourceFoodId: string | null;
  foodName: string;
  brandName: string;
  foodCategory: string | null;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  nutritionDetails: HealthNutritionDetails | null;
  attribution: string | null;
  barcode: string | null;
  provider: string | null;
  providerItemId: string | null;
  servingLabel: string | null;
  servingQuantity: number;
  servingUnit: string;
  servingMeasureValue: number | null;
  servingMeasureUnit: HealthServingMeasureUnit | null;
  consumedUnit?: string;
  consumedQuantity?: number;
};

function validServingMeasureUnit(value: unknown): HealthServingMeasureUnit | null {
  return value === "g" || value === "oz" || value === "ml" || value === "fl_oz" ? value : null;
}

function positiveFiniteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function mealFoodSelectionFromLibraryItem(item: HealthFoodLibraryItem): MealFoodSelection {
  return {
    attribution: item.attribution,
    barcode: item.barcode,
    brandName: item.brand_name ?? "",
    calories: item.calories,
    carbs: item.carbs_g,
    fat: item.fat_g,
    foodCategory: item.food_category ?? item.category,
    foodName: item.food_name,
    nutritionDetails: item.nutrition_details ?? null,
    provider: item.provider,
    providerItemId: item.provider_item_id ?? item.id,
    protein: item.protein_g,
    servingLabel: item.serving_label,
    servingMeasureUnit: validServingMeasureUnit(item.serving_measure_unit),
    servingMeasureValue: positiveFiniteNumber(item.serving_measure_value),
    servingQuantity: positiveFiniteNumber(item.serving_quantity) ?? 1,
    servingUnit: item.serving_unit?.trim() || "serving",
    sourceFoodId: item.id,
  };
}

export function buildHealthMealEntryInputFromSelection(
  selection: MealFoodSelection,
  options: {
    date: string;
    id: string;
    loggedAt: string;
    mealSlot: HealthMealEntry["meal_slot"];
  },
): Omit<HealthMealEntryInsert, "user_id"> {
  const servingQuantity = Number.isFinite(selection.servingQuantity) && selection.servingQuantity > 0 ? selection.servingQuantity : 1;
  const servingUnit = selection.servingUnit.trim() || "serving";
  const consumedQuantity = selection.consumedQuantity ?? servingQuantity;
  const consumedUnit = selection.consumedUnit ?? servingUnit;
  const calculation = selection.consumedQuantity === undefined ? null : calculateHealthFoodNutrition({
    consumedQuantity,
    consumedUnit,
    nutritionPerServing: {
      calories: selection.calories,
      carbs_g: selection.carbs,
      fat_g: selection.fat,
      nutrition_details: selection.nutritionDetails,
      protein_g: selection.protein,
    },
    servingMeasureUnit: selection.servingMeasureUnit,
    servingMeasureValue: selection.servingMeasureValue,
    servingQuantity,
    servingUnit,
  });
  const nutritionSnapshot = calculation?.nutrientTotals ?? {
    calories: Math.round(selection.calories),
    carbs_g: selection.carbs,
    fat_g: selection.fat,
    nutrition_details: selection.nutritionDetails,
    protein_g: selection.protein,
  };
  const storedCalories = normalizeHealthMealStoredCalories(nutritionSnapshot.calories);
  if (storedCalories === null) throw new Error("Calories must be a non-negative number.");
  return {
    attribution: selection.attribution,
    barcode: selection.barcode,
    brand_name: selection.brandName.trim() || null,
    calories: storedCalories,
    carbs_g: nutritionSnapshot.carbs_g,
    consumed_quantity: consumedQuantity,
    consumed_unit: consumedUnit,
    entry_date: options.date,
    fat_g: nutritionSnapshot.fat_g,
    food_name: selection.foodName.trim(),
    food_snapshot: buildHealthMealFoodSnapshot({
      attribution: selection.attribution,
      barcode: selection.barcode,
      brandName: selection.brandName,
      calories: selection.calories,
      carbs: selection.carbs,
      fat: selection.fat,
      foodCategory: selection.foodCategory,
      foodName: selection.foodName,
      nutritionDetails: selection.nutritionDetails,
      provider: selection.provider,
      providerItemId: selection.providerItemId,
      protein: selection.protein,
      servingLabel: selection.servingLabel,
      servingMeasureUnit: selection.servingMeasureUnit,
      servingMeasureValue: selection.servingMeasureValue,
      servingQuantity,
      servingUnit,
      sourceFoodId: selection.sourceFoodId,
    }),
    id: options.id,
    logged_at: options.loggedAt,
    meal_slot: options.mealSlot,
    nutrition_snapshot: nutritionSnapshot,
    provider: selection.provider ?? "manual",
    provider_item_id: selection.providerItemId,
    protein_g: nutritionSnapshot.protein_g,
    serving_fraction: calculation?.servingFraction ?? 1,
    serving_label: calculation ? formatHealthConsumedMealLabel(calculation, selection.servingLabel) : selection.servingLabel,
    source_food_id: selection.sourceFoodId,
  };
}

export function prepareHealthMealEntryFromDraft(
  draft: MealDraft,
  options: { date: string; id: string; loggedAt: string; mealSlot: HealthMealEntry["meal_slot"]; sourceFoodId?: string | null },
) {
  const calories = Number(draft.calories);
  const servingQuantity = positiveFiniteNumber(draft.servingQuantity);
  const consumedQuantity = positiveFiniteNumber(draft.quantity);
  const servingUnit = draft.servingUnit.trim() || "serving";
  if (!draft.foodName.trim() || !Number.isFinite(calories) || calories < 0 || !servingQuantity || !consumedQuantity) return null;
  const nullableDraftNumber = (value: string) => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const selection: MealFoodSelection = {
    attribution: draft.attribution,
    barcode: draft.barcode,
    brandName: draft.brandName,
    calories,
    carbs: nullableDraftNumber(draft.carbs),
    fat: nullableDraftNumber(draft.fat),
    foodCategory: draft.foodCategory,
    foodName: draft.foodName,
    nutritionDetails: draft.nutritionDetails,
    provider: draft.provider,
    providerItemId: draft.providerItemId,
    protein: nullableDraftNumber(draft.protein),
    servingLabel: draft.servingLabel,
    servingMeasureUnit: draft.servingMeasureUnit,
    servingMeasureValue: draft.servingMeasureValue,
    servingQuantity,
    servingUnit,
    sourceFoodId: options.sourceFoodId === undefined ? draft.sourceFoodId : options.sourceFoodId,
  };
  let calculation: ReturnType<typeof calculateHealthFoodNutrition>;
  try {
    calculation = calculateHealthFoodNutrition({
      consumedQuantity,
      consumedUnit: draft.measurement,
      nutritionPerServing: {
        calories: selection.calories,
        carbs_g: selection.carbs,
        fat_g: selection.fat,
        nutrition_details: selection.nutritionDetails,
        protein_g: selection.protein,
      },
      servingMeasureUnit: selection.servingMeasureUnit,
      servingMeasureValue: selection.servingMeasureValue,
      servingQuantity: selection.servingQuantity,
      servingUnit: selection.servingUnit,
    });
  } catch {
    return null;
  }
  const nutritionSnapshot = calculation.nutrientTotals;
  if (normalizeHealthMealStoredCalories(nutritionSnapshot.calories) === null) return null;
  const input = buildHealthMealEntryInputFromSelection({
    ...selection,
    consumedQuantity,
    consumedUnit: draft.measurement,
  }, options);
  return { calculation, input };
}

const DEFAULT_MEAL_DRAFT: MealDraft = {
  attribution: null,
  barcode: null,
  brandName: "",
  calories: "",
  carbs: "",
  date: "",
  fat: "",
  foodName: "",
  nutritionDetails: null,
  mealSlot: "breakfast",
  protein: "",
  provider: null,
  providerItemId: null,
  quantity: "1",
  measurement: "serving",
  sourceFoodId: null,
  foodCategory: null,
  servingQuantity: null,
  servingUnit: "serving",
  servingMeasureValue: null,
  servingMeasureUnit: null,
  servingLabel: "",
  time: "",
};

function isValidMealTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function createDefaultMealDraft(
  mealSlot: HealthMealEntry["meal_slot"] = "breakfast",
  now?: Date,
): MealDraft {
  return {
    ...DEFAULT_MEAL_DRAFT,
    ...getCurrentHealthDateTimeInputs(now),
    mealSlot,
  };
}

export function resetMealDraftForNextItem(currentDraft: MealDraft, now?: Date): MealDraft {
  const currentInputs = getCurrentHealthDateTimeInputs(now);
  return {
    ...DEFAULT_MEAL_DRAFT,
    date: currentDraft.date || currentInputs.date,
    mealSlot: currentDraft.mealSlot,
    time: isValidMealTime(currentDraft.time) ? currentDraft.time : currentInputs.time,
  };
}

export function prepareMealDraftForSelectedSlot(
  currentDraft: MealDraft,
  foodHistoryDate: string,
  mealSlot: HealthMealEntry["meal_slot"],
  now?: Date,
): MealDraft {
  return {
    ...resetMealDraftForNextItem(currentDraft, now),
    date: foodHistoryDate,
    mealSlot,
  };
}

export function hasMeaningfulMealDraft(currentDraft: MealDraft) {
  const hasFoodData = [
    currentDraft.attribution,
    currentDraft.barcode,
    currentDraft.brandName,
    currentDraft.calories,
    currentDraft.carbs,
    currentDraft.fat,
    currentDraft.foodName,
    currentDraft.nutritionDetails,
    currentDraft.protein,
    currentDraft.provider,
    currentDraft.providerItemId,
    currentDraft.sourceFoodId,
    currentDraft.foodCategory,
    currentDraft.servingLabel,
  ].some((value) => typeof value === "string" && value.trim().length > 0);
  return hasFoodData
    || currentDraft.nutritionDetails !== null
    || currentDraft.servingMeasureValue !== null
    || currentDraft.servingMeasureUnit !== null
    || currentDraft.quantity !== "1"
    || currentDraft.measurement !== "serving";
}

export function hasUnsafeUnconvertedHealthFoodDraft({
  activeMealSlot,
  editingMealPlanId,
  mealDraft,
  mealEditorMode,
  isSaving,
}: {
  activeMealSlot: HealthMealEntry["meal_slot"] | null;
  editingMealPlanId: string | null;
  mealDraft: MealDraft;
  mealEditorMode: "actual" | "plan";
  isSaving: boolean;
}) {
  return Boolean(isSaving || (mealEditorMode === "plan" && (
    (activeMealSlot && hasMeaningfulMealDraft(mealDraft)) || editingMealPlanId
  )));
}
