import type {
  HealthFoodLibraryItemInsert,
  HealthServingMeasureUnit,
} from "@/lib/database.types";
import {
  composeHealthFoodStructuredServingLabel,
  getHealthFoodIdentityKey,
} from "@/lib/health-library";

export type HealthCustomFoodImportFieldKey =
  | "food_name"
  | "brand_name"
  | "food_category"
  | "serving_quantity"
  | "serving_unit"
  | "serving_measure_value"
  | "serving_measure_unit"
  | "calories"
  | "protein_g"
  | "carbs_g"
  | "fat_g";

export type HealthCustomFoodImportDraft = Record<HealthCustomFoodImportFieldKey, string>;

export type HealthCustomFoodImportField = {
  key: HealthCustomFoodImportFieldKey;
  label: string;
  inputMode: "decimal" | "numeric" | "text";
  required?: boolean;
};

export const HEALTH_CUSTOM_FOOD_IMPORT_FIELDS: readonly HealthCustomFoodImportField[] = [
  { key: "food_name", label: "Name", inputMode: "text", required: true },
  { key: "brand_name", label: "Brand", inputMode: "text" },
  { key: "food_category", label: "Category", inputMode: "text" },
  { key: "serving_quantity", label: "Serving Quantity", inputMode: "decimal", required: true },
  { key: "serving_unit", label: "Serving Unit", inputMode: "text", required: true },
  { key: "serving_measure_value", label: "Serving Measure Value", inputMode: "decimal" },
  { key: "serving_measure_unit", label: "Serving Measure Unit", inputMode: "text" },
  { key: "calories", label: "Calories", inputMode: "numeric", required: true },
  { key: "protein_g", label: "Protein (g)", inputMode: "decimal" },
  { key: "carbs_g", label: "Carbohydrates (g)", inputMode: "decimal" },
  { key: "fat_g", label: "Fat (g)", inputMode: "decimal" },
] as const;

const IMPORT_FIELD_ALIASES: Record<string, HealthCustomFoodImportFieldKey> = {
  "food name": "food_name",
  carbs: "carbs_g",
  "carbs (g)": "carbs_g",
};

export type HealthCustomFoodImportBlock = {
  draft: HealthCustomFoodImportDraft;
  lineStart: number;
  unknownFields: string[];
  warnings: string[];
};

export type HealthCustomFoodImportValidation = {
  errors: string[];
  input: Omit<HealthFoodLibraryItemInsert, "user_id"> | null;
};

export function createEmptyHealthCustomFoodImportDraft(): HealthCustomFoodImportDraft {
  return Object.fromEntries(
    HEALTH_CUSTOM_FOOD_IMPORT_FIELDS.map((field) => [field.key, ""]),
  ) as HealthCustomFoodImportDraft;
}

export function buildHealthCustomFoodImportTemplate() {
  return HEALTH_CUSTOM_FOOD_IMPORT_FIELDS
    .map((field) => `"${field.label}": `)
    .join("\n");
}

export function parseHealthCustomFoodImport(text: string): HealthCustomFoodImportBlock[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const rawBlocks: Array<Array<{ line: string; number: number }>> = [];
  let currentBlock: Array<{ line: string; number: number }> = [];

  const pushCurrentBlock = () => {
    if (currentBlock.length > 0) {
      rawBlocks.push(currentBlock);
      currentBlock = [];
    }
  };

  lines.forEach((line, index) => {
    if (!line.trim() || /^\s*---\s*$/.test(line)) {
      pushCurrentBlock();
      return;
    }
    currentBlock.push({ line, number: index + 1 });
  });
  pushCurrentBlock();

  return rawBlocks.map((block) => {
    const draft = createEmptyHealthCustomFoodImportDraft();
    const unknownFields: string[] = [];
    const warnings: string[] = [];
    const seenFields = new Set<HealthCustomFoodImportFieldKey>();

    block.forEach(({ line, number }) => {
      const match = /^\s*"([^"]+)"\s*:\s?(.*?)\s*$/.exec(line);
      if (!match) {
        warnings.push(`Line ${number} was not recognized as a quoted field.`);
        return;
      }

      const rawLabel = match[1]?.trim() ?? "";
      const fieldKey = getImportFieldKey(rawLabel);
      if (!fieldKey) {
        if (!unknownFields.includes(rawLabel)) {
          unknownFields.push(rawLabel);
        }
        return;
      }
      if (seenFields.has(fieldKey)) {
        warnings.push(`Field "${rawLabel}" appeared more than once; the last value was kept.`);
      }
      seenFields.add(fieldKey);
      draft[fieldKey] = match[2]?.trim() ?? "";
    });

    return {
      draft,
      lineStart: block[0]?.number ?? 0,
      unknownFields,
      warnings,
    };
  });
}

export function validateHealthCustomFoodImportDraft(
  draft: HealthCustomFoodImportDraft,
): HealthCustomFoodImportValidation {
  const errors: string[] = [];
  const name = draft.food_name.trim();
  const servingUnit = draft.serving_unit.trim();
  const calories = parseCalories(draft.calories);
  const servingQuantity = parseNumber(draft.serving_quantity);
  const servingMeasureValue = draft.serving_measure_value.trim()
    ? parseNumber(draft.serving_measure_value)
    : null;
  const servingMeasureUnit = normalizeMeasureUnit(draft.serving_measure_unit);

  if (!name) errors.push('"Name" is required.');
  if (calories === null || calories < 0) errors.push('"Calories" must be a non-negative whole number.');
  if (servingQuantity === null || servingQuantity <= 0) errors.push('"Serving Quantity" must be positive.');
  if (!servingUnit) errors.push('"Serving Unit" is required.');
  if (draft.serving_measure_value.trim() && (servingMeasureValue === null || servingMeasureValue <= 0)) {
    errors.push('"Serving Measure Value" must be positive when supplied.');
  }
  if (draft.serving_measure_value.trim() && !servingMeasureUnit) {
    errors.push('"Serving Measure Unit" must be g, oz, ml, or fl_oz when a measure value is supplied.');
  }
  if (!draft.serving_measure_value.trim() && draft.serving_measure_unit.trim()) {
    errors.push('"Serving Measure Value" is required when a measure unit is supplied.');
  }
  for (const field of ["protein_g", "carbs_g", "fat_g"] as const) {
    if (draft[field].trim() && (parseNumber(draft[field]) === null || (parseNumber(draft[field]) ?? -1) < 0)) {
      errors.push(`"${getImportFieldLabel(field)}" must be non-negative when supplied.`);
    }
  }

  if (errors.length > 0) {
    return { errors, input: null };
  }

  const input: Omit<HealthFoodLibraryItemInsert, "user_id"> = {
    brand_name: emptyToNull(draft.brand_name),
    calories: calories ?? 0,
    category: emptyToNull(draft.food_category) ?? "Uncategorized",
    carbs_g: nullableNumber(draft.carbs_g),
    fat_g: nullableNumber(draft.fat_g),
    food_category: emptyToNull(draft.food_category) ?? "Uncategorized",
    food_name: name,
    protein_g: nullableNumber(draft.protein_g),
    provider: "manual",
    serving_label: composeHealthFoodStructuredServingLabel({
      servingMeasureUnit,
      servingMeasureValue,
      servingQuantity: servingQuantity ?? 1,
      servingUnit,
    }),
    serving_measure_unit: servingMeasureUnit,
    serving_measure_value: servingMeasureValue,
    serving_quantity: servingQuantity ?? 1,
    serving_size: composeHealthFoodStructuredServingLabel({
      servingMeasureUnit,
      servingMeasureValue,
      servingQuantity: servingQuantity ?? 1,
      servingUnit,
    }),
    serving_unit: servingUnit,
    serving_weight_amount: isWeightUnit(servingMeasureUnit) ? servingMeasureValue : null,
    serving_weight_unit: isWeightUnit(servingMeasureUnit) ? servingMeasureUnit : null,
  };

  return { errors, input };
}

export function getHealthCustomFoodImportIdentityKey(
  draft: HealthCustomFoodImportDraft,
) {
  const validation = validateHealthCustomFoodImportDraft(draft);
  if (validation.input) {
    return getHealthFoodIdentityKey(validation.input);
  }
  const name = draft.food_name.trim();
  if (!name) return null;
  return getHealthFoodIdentityKey({
    brand_name: draft.brand_name,
    calories: parseCalories(draft.calories) ?? 0,
    carbs_g: nullableNumber(draft.carbs_g),
    fat_g: nullableNumber(draft.fat_g),
    food_name: name,
    protein_g: nullableNumber(draft.protein_g),
    serving_label: composeHealthFoodStructuredServingLabel({
      servingMeasureUnit: normalizeMeasureUnit(draft.serving_measure_unit),
      servingMeasureValue: parseNumber(draft.serving_measure_value),
      servingQuantity: parseNumber(draft.serving_quantity),
      servingUnit: draft.serving_unit,
    }),
  });
}

export function getImportFieldLabel(key: HealthCustomFoodImportFieldKey) {
  return HEALTH_CUSTOM_FOOD_IMPORT_FIELDS.find((field) => field.key === key)?.label ?? key;
}

function getImportFieldKey(label: string): HealthCustomFoodImportFieldKey | null {
  const normalizedLabel = normalizeLabel(label);
  const directMatch = HEALTH_CUSTOM_FOOD_IMPORT_FIELDS.find(
    (field) => normalizeLabel(field.label) === normalizedLabel,
  );
  return directMatch?.key ?? IMPORT_FIELD_ALIASES[normalizedLabel] ?? null;
}

function normalizeLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseCalories(value: string) {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && /^\s*\d+\s*$/.test(value) ? parsed : null;
}

function parseNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && /^\s*\d+(?:\.\d+)?\s*$/.test(value) ? parsed : null;
}

function nullableNumber(value: string) {
  const parsed = parseNumber(value);
  return parsed === null ? null : parsed;
}

function normalizeMeasureUnit(value: string): HealthServingMeasureUnit | null {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  return normalized === "g" || normalized === "oz" || normalized === "ml" || normalized === "fl_oz"
    ? normalized
    : null;
}

function isWeightUnit(value: HealthServingMeasureUnit | null): value is "g" | "oz" | "fl_oz" {
  return value === "g" || value === "oz" || value === "fl_oz";
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
