import type {
  HealthFoodLibraryItem,
  HealthFoodLibraryItemInsert,
  HealthNutritionDetails,
  HealthServingMeasureUnit,
  HealthServingWeightUnit,
} from "@/lib/database.types";
import type { EditingSessionStore } from "@/lib/editing-session-store";
import {
  composeHealthFoodStructuredServingLabel,
} from "@/lib/health-library";
import {
  HEALTH_NUTRITION_FIELD_REGISTRY,
  normalizeHealthNutritionDetails,
  parseHealthNutritionDetailsInput,
  type HealthNutritionDetailKey,
  type HealthFoodLookupResult,
} from "@/lib/health-nutrition";

export type HealthCustomFoodFormDraft = {
  id: string;
  barcode: string;
  foodName: string;
  brandName: string;
  foodCategory: string;
  servingQuantity: string;
  servingUnit: string;
  servingMeasureValue: string;
  servingMeasureUnit: HealthServingMeasureUnit | "";
  servingWeightAmount: number | null;
  servingWeightUnit: HealthServingWeightUnit | null;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  nutritionDetails: Record<HealthNutritionDetailKey, string>;
  provider: string | null;
  providerItemId: string | null;
  attribution: string | null;
  isFavorite: boolean;
};

export type HealthCustomFoodEditingSessionDraft =
  | { kind: "new"; form: HealthCustomFoodFormDraft }
  | { kind: "saved"; form: HealthCustomFoodFormDraft };

export type HealthCustomFoodSaveInput = Omit<HealthFoodLibraryItemInsert, "user_id">;

export const HEALTH_CUSTOM_FOOD_SAVE_FAILURE_MESSAGE = "Could not save this custom food. Your draft is still here; try again.";
export const HEALTH_CUSTOM_FOOD_IDENTITY_COLLISION_MESSAGE = "This food matches a different library item. Change its name, barcode, brand, or serving details before saving.";

export function createHealthCustomFoodDraftId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export function healthCustomFoodSavedSessionId(foodId: string) {
  return `health-custom-food-definition:${foodId}`;
}

export function healthCustomFoodNewSessionId(tabId: string, draftId: string) {
  return `health-custom-food-new:${tabId}:${draftId}`;
}

export function healthCustomFoodNewCanonicalId(tabId: string, draftId: string) {
  return `health-custom-food-new-record:${tabId}:${draftId}`;
}

export function createEmptyHealthCustomFoodFormDraft(id = "") {
  return {
    id,
    barcode: "",
    foodName: "",
    brandName: "",
    foodCategory: "",
    servingQuantity: "1",
    servingUnit: "serving",
    servingMeasureValue: "",
    servingMeasureUnit: "" as const,
    servingWeightAmount: null,
    servingWeightUnit: null,
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
    nutritionDetails: Object.fromEntries(HEALTH_NUTRITION_FIELD_REGISTRY.map((field) => [field.key, ""])) as Record<HealthNutritionDetailKey, string>,
    provider: "manual",
    providerItemId: null,
    attribution: null,
    isFavorite: false,
  } satisfies HealthCustomFoodFormDraft;
}

export function createHealthCustomFoodNewDraft(recordId: string): HealthCustomFoodEditingSessionDraft {
  return { kind: "new", form: createEmptyHealthCustomFoodFormDraft(recordId) };
}

export function createHealthCustomFoodSavedDraft(food: HealthFoodLibraryItem): HealthCustomFoodEditingSessionDraft {
  const servingMeasureUnit = food.serving_measure_unit ?? "";
  const nutritionDetails = normalizeHealthNutritionDetails(food.nutrition_details);
  return {
    kind: "saved",
    form: {
      id: food.id,
      barcode: food.barcode ?? "",
      brandName: food.brand_name ?? "",
      calories: String(food.calories),
      foodCategory: food.food_category ?? "Uncategorized",
      carbs: food.carbs_g === null ? "" : String(food.carbs_g),
      fat: food.fat_g === null ? "" : String(food.fat_g),
      foodName: food.food_name,
      protein: food.protein_g === null ? "" : String(food.protein_g),
      servingQuantity: String(food.serving_quantity > 0 ? food.serving_quantity : 1),
      servingUnit: food.serving_unit || "serving",
      servingMeasureValue: food.serving_measure_value == null ? "" : String(food.serving_measure_value),
      servingMeasureUnit,
      servingWeightAmount: food.serving_weight_amount ?? null,
      servingWeightUnit: food.serving_weight_unit ?? null,
      nutritionDetails: Object.fromEntries(HEALTH_NUTRITION_FIELD_REGISTRY.map((field) => [
        field.key,
        typeof nutritionDetails?.[field.key] === "number" ? String(nutritionDetails[field.key]) : "",
      ])) as Record<HealthNutritionDetailKey, string>,
      provider: food.provider,
      providerItemId: food.provider_item_id,
      attribution: food.attribution,
      isFavorite: food.is_favorite,
    },
  };
}

export function areHealthCustomFoodEditingSessionDraftsEqual(
  left: HealthCustomFoodEditingSessionDraft,
  right: HealthCustomFoodEditingSessionDraft,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function nullableNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function nullablePositiveNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function getHealthCustomFoodDraftValidationMessage(draft: HealthCustomFoodFormDraft) {
  const calories = Number.parseInt(draft.calories, 10);
  const servingQuantity = nullablePositiveNumber(draft.servingQuantity);
  const servingMeasureValue = nullablePositiveNumber(draft.servingMeasureValue);
  const nutritionDetails = parseHealthNutritionDetailsInput(draft.nutritionDetails);
  const hasInvalidNutritionDetail = HEALTH_NUTRITION_FIELD_REGISTRY.some((field) => {
    const rawValue = draft.nutritionDetails[field.key]?.trim() ?? "";
    return rawValue.length > 0 && typeof nutritionDetails?.[field.key] !== "number";
  });
  const hasMeasureValue = draft.servingMeasureValue.trim().length > 0;
  const hasMeasureUnit = Boolean(draft.servingMeasureUnit);
  if (!draft.foodName.trim()) return "Enter a food name.";
  if (!Number.isFinite(calories) || calories < 0) return "Calories per serving must be a valid non-negative number.";
  if (servingQuantity === null) return "Serving quantity must be greater than 0.";
  if (!draft.servingUnit.trim()) return "Enter a serving unit.";
  if (hasMeasureValue && servingMeasureValue === null) return "Serving measure value must be greater than 0.";
  if (hasMeasureValue && !hasMeasureUnit) return "Choose a serving measure unit or clear the measure value.";
  if (!hasMeasureValue && hasMeasureUnit) return "Enter a serving measure value or choose No measure.";
  if (hasInvalidNutritionDetail) return "Nutrition Details contains an invalid number.";
  return null;
}

export function prepareHealthCustomFoodSaveInput(
  draft: HealthCustomFoodFormDraft,
  canonicalFood?: HealthFoodLibraryItem | null,
): HealthCustomFoodSaveInput {
  const calories = Number.parseInt(draft.calories, 10);
  const servingQuantity = nullablePositiveNumber(draft.servingQuantity)!;
  const servingMeasureValue = nullablePositiveNumber(draft.servingMeasureValue);
  const nutritionDetails = parseHealthNutritionDetailsInput(draft.nutritionDetails);
  const servingMeasureUnit = draft.servingMeasureUnit || null;
  const servingLabel = composeHealthFoodStructuredServingLabel({
    servingQuantity,
    servingUnit: draft.servingUnit,
    servingMeasureValue,
    servingMeasureUnit,
  });
  const isWeightMeasure = servingMeasureUnit === "g" || servingMeasureUnit === "oz" || servingMeasureUnit === "fl_oz";
  return {
    id: draft.id || undefined,
    brand_name: emptyToNull(draft.brandName),
    barcode: emptyToNull(draft.barcode),
    calories,
    category: emptyToNull(draft.foodCategory) ?? "Uncategorized",
    food_category: emptyToNull(draft.foodCategory) ?? "Uncategorized",
    carbs_g: nullableNumber(draft.carbs),
    fat_g: nullableNumber(draft.fat),
    food_name: draft.foodName.trim(),
    protein_g: nullableNumber(draft.protein),
    provider: draft.provider ?? canonicalFood?.provider ?? "manual",
    provider_item_id: draft.providerItemId ?? canonicalFood?.provider_item_id,
    attribution: draft.attribution ?? canonicalFood?.attribution,
    is_favorite: canonicalFood?.is_favorite ?? draft.isFavorite,
    serving_label: servingLabel,
    serving_size: servingLabel,
    serving_quantity: servingQuantity,
    serving_unit: draft.servingUnit.trim(),
    serving_measure_value: servingMeasureValue,
    serving_measure_unit: servingMeasureUnit,
    serving_weight_amount: isWeightMeasure
      ? servingMeasureValue
      : canonicalFood?.serving_weight_amount ?? draft.servingWeightAmount,
    serving_weight_unit: isWeightMeasure
      ? servingMeasureUnit as HealthServingWeightUnit
      : canonicalFood?.serving_weight_unit ?? draft.servingWeightUnit,
    nutrition_details: nutritionDetails as HealthNutritionDetails | null,
  };
}

export function isCurrentHealthCustomFoodBarcodeLookup(input: {
  activeDraftId: string;
  requestDraftId: string;
  currentGeneration: number;
  requestGeneration: number;
}) {
  return input.activeDraftId === input.requestDraftId && input.currentGeneration === input.requestGeneration;
}

export function applyHealthCustomFoodBarcodeLookup({
  activeDraftId,
  currentGeneration,
  draft,
  requestDraftId,
  requestGeneration,
  result,
  scannedBarcode,
}: {
  activeDraftId: string;
  currentGeneration: number;
  draft: HealthCustomFoodFormDraft;
  requestDraftId: string;
  requestGeneration: number;
  result: HealthFoodLookupResult;
  scannedBarcode: string;
}) {
  if (!isCurrentHealthCustomFoodBarcodeLookup({ activeDraftId, requestDraftId, currentGeneration, requestGeneration })) {
    return null;
  }
  const parsedServing = parseBarcodeServingLabel(result.servingLabel);
  const serving = {
    quantity: result.servingQuantity > 0 ? String(result.servingQuantity) : parsedServing.quantity,
    unit: result.servingUnit || parsedServing.unit,
    measureValue: result.servingMeasureValue === null ? parsedServing.measureValue : String(result.servingMeasureValue),
    measureUnit: result.servingMeasureUnit ?? parsedServing.measureUnit,
  };
  const hasEditedServing = draft.servingQuantity.trim() !== "1"
    || draft.servingUnit.trim() !== "serving"
    || draft.servingMeasureValue.trim().length > 0
    || draft.servingMeasureUnit.length > 0;
  return {
    ...draft,
    barcode: result.barcode ?? scannedBarcode,
    brandName: draft.brandName.trim() ? draft.brandName : result.brandName ?? "",
    calories: draft.calories.trim() ? draft.calories : result.calories === null ? "" : String(result.calories),
    carbs: draft.carbs.trim() ? draft.carbs : result.carbs === null ? "" : String(result.carbs),
    foodCategory: draft.foodCategory.trim() ? draft.foodCategory : result.foodCategory ?? "",
    foodName: draft.foodName.trim() ? draft.foodName : result.foodName,
    fat: draft.fat.trim() ? draft.fat : result.fat === null ? "" : String(result.fat),
    protein: draft.protein.trim() ? draft.protein : result.protein === null ? "" : String(result.protein),
    servingQuantity: hasEditedServing ? draft.servingQuantity : serving.quantity,
    servingUnit: hasEditedServing ? draft.servingUnit : serving.unit,
    servingMeasureValue: hasEditedServing ? draft.servingMeasureValue : serving.measureValue,
    servingMeasureUnit: hasEditedServing ? draft.servingMeasureUnit : serving.measureUnit,
    nutritionDetails: Object.fromEntries(HEALTH_NUTRITION_FIELD_REGISTRY.map((field) => {
      const existing = draft.nutritionDetails[field.key]?.trim() ?? "";
      const incoming = result.nutritionDetails?.[field.key];
      return [field.key, existing || (typeof incoming === "number" ? String(incoming) : "")];
    })) as Record<HealthNutritionDetailKey, string>,
    provider: result.provider,
    providerItemId: result.providerItemId,
    attribution: result.attribution,
  };
}

function parseBarcodeServingLabel(label: string | null) {
  const servingMatch = /^\s*(\d+(?:\.\d+)?)\s*([a-z][a-z-]*)?/i.exec(label ?? "");
  const servingUnit = servingMatch?.[2]?.toLowerCase();
  const measureMatch = /(\d+(?:\.\d+)?)\s*(fl\s*oz|g|oz|ml)\b/i.exec(label ?? "");
  const normalizedMeasureUnit = measureMatch?.[2]?.toLowerCase().replace(/\s+/g, "_");
  const measureUnit: HealthServingMeasureUnit | "" = normalizedMeasureUnit === "g"
    || normalizedMeasureUnit === "oz"
    || normalizedMeasureUnit === "ml"
    || normalizedMeasureUnit === "fl_oz"
    ? normalizedMeasureUnit
    : "";
  const isMeasureServingUnit = servingUnit === "g" || servingUnit === "oz" || servingUnit === "ml" || servingUnit === "fl";
  return {
    quantity: servingMatch?.[1] ?? "1",
    unit: isMeasureServingUnit || !servingUnit ? "serving" : servingUnit.replace(/s$/, ""),
    measureValue: measureMatch?.[1] ?? "",
    measureUnit: measureUnit ?? "",
  };
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, stableJsonValue(child)]));
}

function numericMatches(actual: number | null, expected: number | null, scale = 0) {
  if (actual === null || expected === null) return actual === expected;
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  if (scale <= 0) return actual === expected;
  const factor = 10 ** scale;
  const postgresRounded = (value: number) => Math.round(value * factor + Math.sign(value) * Number.EPSILON * factor);
  return postgresRounded(actual) === postgresRounded(expected);
}

export function healthCustomFoodWriteMatchesCanonicalRow(
  actual: HealthFoodLibraryItem,
  expected: HealthFoodLibraryItem,
  userId: string,
) {
  return actual.id === expected.id
    && actual.user_id === userId
    && actual.food_name === expected.food_name
    && actual.brand_name === expected.brand_name
    && actual.category === expected.category
    && actual.food_category === expected.food_category
    && actual.serving_label === expected.serving_label
    && actual.serving_size === expected.serving_size
    && numericMatches(actual.serving_quantity, expected.serving_quantity)
    && actual.serving_unit === expected.serving_unit
    && numericMatches(actual.serving_measure_value, expected.serving_measure_value)
    && actual.serving_measure_unit === expected.serving_measure_unit
    && numericMatches(actual.serving_weight_amount, expected.serving_weight_amount, 2)
    && actual.serving_weight_unit === expected.serving_weight_unit
    && actual.calories === expected.calories
    && numericMatches(actual.protein_g, expected.protein_g, 2)
    && numericMatches(actual.carbs_g, expected.carbs_g, 2)
    && numericMatches(actual.fat_g, expected.fat_g, 2)
    && JSON.stringify(stableJsonValue(normalizeHealthNutritionDetails(actual.nutrition_details)))
      === JSON.stringify(stableJsonValue(normalizeHealthNutritionDetails(expected.nutrition_details)))
    && actual.barcode === expected.barcode
    && actual.provider === expected.provider
    && actual.provider_item_id === expected.provider_item_id
    && actual.attribution === expected.attribution
    && actual.is_favorite === expected.is_favorite;
}

export function canDeleteHealthCustomFoodSession(
  session: { dirty: boolean; isSaving: boolean } | null | undefined,
) {
  return !session?.dirty && !session?.isSaving;
}

export async function saveHealthCustomFoodEditingSession({
  store,
  draftId,
  save,
}: {
  store: EditingSessionStore<HealthCustomFoodEditingSessionDraft>;
  draftId: string;
  save: (draft: HealthCustomFoodEditingSessionDraft) => Promise<HealthFoodLibraryItem | null>;
}): Promise<{ saved: HealthFoodLibraryItem } | { error: string }> {
  const session = store.getSnapshot(draftId);
  if (!session) return { error: "This custom food draft is no longer available. Reopen it and try again." };
  if (session.isSaving) return { error: "This custom food is already being saved." };
  const saveRevision = store.beginSave(draftId);
  if (saveRevision === null) return { error: "This custom food is already being saved." };

  try {
    const saved = await save(session.draft);
    if (!saved) {
      store.saveFailed(draftId, saveRevision, HEALTH_CUSTOM_FOOD_SAVE_FAILURE_MESSAGE);
      return { error: HEALTH_CUSTOM_FOOD_SAVE_FAILURE_MESSAGE };
    }
    if (saved.id !== session.draft.form.id) {
      store.saveFailed(draftId, saveRevision, HEALTH_CUSTOM_FOOD_IDENTITY_COLLISION_MESSAGE);
      return { error: HEALTH_CUSTOM_FOOD_IDENTITY_COLLISION_MESSAGE };
    }

    const savedSessionId = healthCustomFoodSavedSessionId(saved.id);
    const savedDraft = createHealthCustomFoodSavedDraft(saved);
    if (session.draft.kind === "new") {
      store.ensureSession(savedSessionId, savedSessionId, savedDraft);
      if (!store.removeAfterSave(draftId, saveRevision)) {
        return { error: "The food was saved, but its shared draft could not be reconciled. Reopen it to continue." };
      }
    } else if (!store.saveSucceeded(draftId, saveRevision, savedDraft)) {
      return { error: "The food was saved, but its shared draft could not be reconciled. Reopen it to continue." };
    }
    return { saved };
  } catch (error) {
    const message = error instanceof Error ? error.message : HEALTH_CUSTOM_FOOD_SAVE_FAILURE_MESSAGE;
    store.saveFailed(draftId, saveRevision, message);
    return { error: message };
  }
}

export function discardHealthCustomFoodDraft({
  store,
  draftId,
  canonicalRecordId,
  latestBaseline,
}: {
  store: EditingSessionStore<HealthCustomFoodEditingSessionDraft>;
  draftId: string;
  canonicalRecordId: string;
  latestBaseline: HealthCustomFoodEditingSessionDraft;
}) {
  store.discardDraft(draftId);
  return store.ensureSession(draftId, canonicalRecordId, latestBaseline);
}
