import type { HealthFoodLibraryItem, HealthMealSlot, HealthNutritionDetails, HealthServingMeasureUnit, HealthWeightUnit, HealthWaterUnit, TaskStatus } from "@/lib/database.types";
import type { FocusCategory, FocusSubtype, FocusType } from "@/lib/types";
import { displayWeightToKilograms } from "@/lib/health-utils";
import { mealFoodSelectionFromLibraryItem } from "@/lib/health-meal-draft";
import { waterAmountToMilliliters } from "@/lib/health-library";
import { calculateHealthFoodNutrition } from "@/lib/health-nutrition";
import {
  extractTrailingShorthandTime,
  normalizeShorthandMealUnit,
  normalizeShorthandWaterUnit,
  parseShorthandMealFoodToken,
  parseShorthandPrefix,
  stripTrailingMarkdownBackslashes,
  tokenizeShorthandCsvTokens,
  type ScratchpadShorthandPrefix,
} from "@/lib/scratchpad-shorthand";

export type BatchIntakeKind = "task" | "water" | "weight" | "meal" | "focus" | "unsupported";
export type BatchIntakeManualKind = Exclude<BatchIntakeKind, "unsupported">;
export type BatchIntakeConfidence = "high" | "medium" | "low";
export type BatchIntakeTaskOutcome = Extract<TaskStatus, "done" | "did_my_best" | "missed"> | null;
export type BatchIntakeWaterStatus = "pending" | "confirmed" | null;
type TaskDraftPart = number | string;

type BatchIntakeDraftBase = {
  id: string;
  groupId: string;
  sourceText: string;
  sourceLineNumber: number | null;
  included: boolean;
  confidence: BatchIntakeConfidence;
  issues: string[];
};

type BatchIntakeDatedDraftBase = BatchIntakeDraftBase & {
  date: string | null;
};

type BatchIntakeParsedDraftBase = BatchIntakeDatedDraftBase & {
  origin: "parsed";
  sourceLineNumber: number;
};

type BatchIntakeManualDraftBase = BatchIntakeDatedDraftBase & {
  origin: "manual";
  sourceLineNumber: null;
};

export type BatchIntakeParsedTaskDraft = BatchIntakeParsedDraftBase & {
  kind: "task";
  taskTitle: string;
  outcome: BatchIntakeTaskOutcome;
  selectedTaskId: string | null;
};

export type BatchIntakeManualTaskDraft = BatchIntakeManualDraftBase & {
  kind: "task";
  taskTitle: string;
  outcome: BatchIntakeTaskOutcome;
  selectedTaskId: string | null;
};

export type BatchIntakeTaskDraft = BatchIntakeParsedTaskDraft | BatchIntakeManualTaskDraft;

export type BatchIntakeParsedWaterDraft = BatchIntakeParsedDraftBase & {
  kind: "water";
  writeId?: string;
  time?: string;
  amount: number | null;
  unit: HealthWaterUnit;
  status: BatchIntakeWaterStatus;
};

export type BatchIntakeManualWaterDraft = BatchIntakeManualDraftBase & {
  kind: "water";
  writeId: string;
  amount: number | null;
  unit: HealthWaterUnit;
  status: BatchIntakeWaterStatus;
  time: string;
};

export type BatchIntakeWaterDraft = BatchIntakeParsedWaterDraft | BatchIntakeManualWaterDraft;

export type BatchIntakeParsedWeightDraft = BatchIntakeParsedDraftBase & {
  kind: "weight";
  writeId?: string;
  time?: string;
  value: number | null;
  unit: HealthWeightUnit | null;
  unitSource: "explicit" | "profile" | "missing";
};

export type BatchIntakeManualWeightDraft = BatchIntakeManualDraftBase & {
  kind: "weight";
  writeId: string;
  value: number | null;
  unit: HealthWeightUnit | null;
  unitSource: "explicit" | "profile" | "missing";
  time: string;
};

export type BatchIntakeWeightDraft = BatchIntakeParsedWeightDraft | BatchIntakeManualWeightDraft;

type BatchIntakeMealOccurrenceBase = BatchIntakeDatedDraftBase & {
  kind: "meal";
  entryMode: "occurrence";
  mealSlot: HealthMealSlot;
  time: string;
};

export type BatchIntakeParsedMealOccurrenceDraft = BatchIntakeMealOccurrenceBase & {
  origin: "parsed";
  sourceLineNumber: number;
  rawText: string;
};

export type BatchIntakeManualMealOccurrenceDraft = BatchIntakeMealOccurrenceBase & {
  origin: "manual";
  sourceLineNumber: null;
};

export type BatchIntakeMealOccurrenceDraft = BatchIntakeParsedMealOccurrenceDraft | BatchIntakeManualMealOccurrenceDraft;

export type BatchIntakeMealFoodFields = {
  rawToken: string | null;
  foodName: string;
  brandName: string;
  foodCategory: string | null;
  sourceFoodId: string | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  nutritionDetails: HealthNutritionDetails | null;
  barcode: string | null;
  attribution: string | null;
  provider: string | null;
  providerItemId: string | null;
  servingLabel: string;
  servingQuantity: number;
  servingUnit: string;
  servingMeasureValue: number | null;
  servingMeasureUnit: HealthServingMeasureUnit | null;
  consumedQuantity: number | null;
  consumedUnit: string;
};

type BatchIntakeMealFoodBase = BatchIntakeDraftBase & BatchIntakeMealFoodFields & {
  kind: "meal";
  entryMode: "food";
  foodMode: "library" | "manual";
  mealOccurrenceId: string;
  writeId: string;
};

export type BatchIntakeMealFoodProposalDraft = BatchIntakeDraftBase & {
  kind: "meal";
  entryMode: "food_proposal";
  origin: "parsed";
  sourceLineNumber: number;
  mealOccurrenceId: string;
  sourceParsedMealId: string;
  rawToken: string;
  proposedFoodName: string;
  proposedQuantity: number | null;
  proposedUnit: string | null;
  writeId?: string;
};

export type BatchIntakeParsedMealFoodDraft = BatchIntakeMealFoodBase & {
  origin: "parsed";
  sourceLineNumber: number;
  sourceParsedMealId: string;
};

export type BatchIntakeManualMealFoodDraft = BatchIntakeMealFoodBase & {
  origin: "manual";
  sourceLineNumber: null;
  sourceParsedMealId: string | null;
};

export type BatchIntakeMealFoodDraft = BatchIntakeParsedMealFoodDraft | BatchIntakeManualMealFoodDraft;
export type BatchIntakeMealDraft = BatchIntakeMealOccurrenceDraft | BatchIntakeMealFoodDraft | BatchIntakeMealFoodProposalDraft;

/** Backward-compatible name for the parsed Meal source occurrence. */
export type BatchIntakeParsedMealDraft = BatchIntakeParsedMealOccurrenceDraft;
/** Backward-compatible name for an executable manual Meal food child. */
export type BatchIntakeManualMealDraft = BatchIntakeManualMealFoodDraft;

export type BatchIntakeParsedFocusDraft = BatchIntakeParsedDraftBase & {
  kind: "focus";
  writeId?: string;
  categoryId: string | null;
  title: string;
  focusType: FocusType;
  focusSubtype: FocusSubtype | null;
  focusSubtype2: FocusSubtype | null;
  durationSeconds: number | null;
  completionTime: string;
  notes: string;
};

export type BatchIntakeManualFocusDraft = BatchIntakeManualDraftBase & {
  kind: "focus";
  writeId: string;
  categoryId: string | null;
  title: string;
  focusType: FocusType;
  focusSubtype: FocusSubtype | null;
  focusSubtype2: FocusSubtype | null;
  durationSeconds: number | null;
  completionTime: string;
  notes: string;
};

export type BatchIntakeFocusDraft = BatchIntakeParsedFocusDraft | BatchIntakeManualFocusDraft;

export type BatchIntakeUnsupportedDraft = BatchIntakeParsedDraftBase & {
  kind: "unsupported";
  reason: string;
};

export type BatchIntakeDraft =
  | BatchIntakeTaskDraft
  | BatchIntakeWaterDraft
  | BatchIntakeWeightDraft
  | BatchIntakeMealDraft
  | BatchIntakeFocusDraft
  | BatchIntakeUnsupportedDraft;

export type BatchIntakeReviewGroup = {
  id: string;
  kind: BatchIntakeKind;
  occurrenceIds: string[];
  drafts: BatchIntakeDraft[];
};

export function batchIntakeCanonicalGroupId(kind: "task" | "focus", identity: string) {
  return `${kind}:${identity}`;
}

export function batchIntakeCanonicalFocusGroupId(categoryId: string | null, categoryCandidate: string, title: string) {
  const categoryIdentity = categoryId ?? `unresolved:${normalizeFocusCategoryTitle(categoryCandidate)}`;
  return batchIntakeCanonicalGroupId("focus", `${categoryIdentity}:${normalizeFocusCategoryTitle(title)}`);
}

export function getBatchIntakeReviewGroups(drafts: readonly BatchIntakeDraft[]): BatchIntakeReviewGroup[] {
  const groups = new Map<string, BatchIntakeReviewGroup>();
  drafts.forEach((draft) => {
    const id = draft.groupId || draft.id;
    const key = `${draft.kind}:${id}`;
    const group = groups.get(key) ?? { id, kind: draft.kind, occurrenceIds: [], drafts: [] };
    if (!(draft.kind === "meal" && draft.entryMode !== "occurrence")) group.occurrenceIds.push(draft.id);
    group.drafts.push(draft);
    groups.set(key, group);
  });
  return [...groups.values()];
}

export type ParseBatchIntakeOptions = {
  referenceDate: string;
  preferredWeightUnit?: HealthWeightUnit | null;
  focusCategories?: readonly FocusCategory[];
};

function normalizeLine(value: string) {
  return value.replace(/\r$/, "").trim();
}

function normalizeStructuralLine(value: string) {
  return value
    .replace(/^\s*\*+\s*/, "")
    .replace(/[\\]+\s*$/, "")
    .replace(/\s*\*+\s*$/, "")
    .trim()
    .toLowerCase();
}

function parseDateHeading(value: string, referenceDate: string) {
  const normalized = normalizeStructuralLine(value);
  const match = normalized.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const reference = new Date(`${referenceDate}T12:00:00Z`);
  if (!Number.isFinite(reference.getTime())) return null;
  let year = match[3] ? Number(match[3]) : reference.getUTCFullYear();
  if (year < 100) year += 2000;
  let candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    !match[3]
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day
    && candidate.getTime() > reference.getTime()
  ) {
    candidate = new Date(Date.UTC(year - 1, month - 1, day));
  }
  if (candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  return `${candidate.getUTCFullYear()}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function issueForDate(date: string | null) {
  return date ? [] : ["Missing date heading"];
}

function makeBase(
  line: string,
  lineNumber: number,
  date: string | null,
  kind: BatchIntakeKind,
  confidence: BatchIntakeConfidence,
  issues: string[] = [],
  part: TaskDraftPart = 0,
) {
  const id = `batch-intake-${lineNumber}-${part}`;
  return {
    id,
    groupId: kind === "meal" ? id : `batch-intake-${kind}-${lineNumber}-${part}`,
    sourceText: line,
    sourceLineNumber: lineNumber,
    origin: "parsed" as const,
    date,
    kind,
    included: true,
    confidence,
    issues: [...issueForDate(date), ...issues],
  };
}

function currentLocalTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function manualBase(id: string, sourceText: string, date: string | null) {
  return {
    id,
    groupId: id,
    sourceText,
    sourceLineNumber: null,
    origin: "manual" as const,
    date,
    included: true,
    confidence: "high" as const,
    issues: [...issueForDate(date)],
  };
}

function mealFoodBase(
  occurrence: BatchIntakeMealOccurrenceDraft,
  options: { id: string; origin: "manual" | "parsed"; sourceParsedMealId: string | null },
) {
  return {
    id: options.id,
    groupId: occurrence.id,
    sourceText: occurrence.sourceText,
    sourceLineNumber: options.origin === "parsed" ? occurrence.sourceLineNumber : null,
    origin: options.origin,
    included: true,
    confidence: occurrence.confidence,
    issues: [] as string[],
    mealOccurrenceId: occurrence.id,
    sourceParsedMealId: options.sourceParsedMealId,
  };
}

function emptyManualMealFood(
  occurrence: BatchIntakeMealOccurrenceDraft,
  options: { id: string; writeId: string },
): BatchIntakeManualMealFoodDraft {
  return {
    ...mealFoodBase(occurrence, {
      id: options.id,
      origin: "manual",
      sourceParsedMealId: occurrence.origin === "parsed" ? occurrence.id : null,
    }),
    origin: "manual",
    sourceLineNumber: null,
    rawToken: null,
    issues: ["Food name is required", "Calories are required"],
    attribution: null,
    barcode: null,
    brandName: "",
    calories: null,
    carbsG: null,
    consumedQuantity: 1,
    consumedUnit: "serving",
    fatG: null,
    foodCategory: null,
    foodMode: "manual",
    foodName: "",
    kind: "meal",
    entryMode: "food",
    nutritionDetails: null,
    provider: "manual",
    providerItemId: null,
    proteinG: null,
    servingLabel: "",
    servingMeasureUnit: null,
    servingMeasureValue: null,
    servingQuantity: 1,
    servingUnit: "serving",
    sourceFoodId: null,
    writeId: options.writeId,
  };
}

export function createManualBatchIntakeDraft(
  kind: BatchIntakeManualKind,
  options: { id: string; date: string; preferredWeightUnit?: HealthWeightUnit | null; time?: string },
): BatchIntakeDraft {
  const time = options.time ?? currentLocalTime();
  const base = manualBase(options.id, `Manual ${kind === "focus" ? "Focus Session" : kind[0].toUpperCase() + kind.slice(1)} entry`, options.date);
  if (kind === "task") {
    return {
      ...base,
      kind,
      taskTitle: "",
      outcome: null,
      selectedTaskId: null,
      issues: ["Select an existing canonical Task", "Choose an outcome"],
    } satisfies BatchIntakeManualTaskDraft;
  }
  if (kind === "water") {
    return {
      ...base,
      kind,
      writeId: options.id,
      amount: null,
      unit: "fl_oz",
      status: null,
      time: "",
      issues: ["Choose a positive water amount", "Choose Pending or Confirmed"],
    } satisfies BatchIntakeManualWaterDraft;
  }
  if (kind === "weight") {
    const unit = options.preferredWeightUnit ?? null;
    return {
      ...base,
      kind,
      writeId: options.id,
      value: null,
      unit,
      unitSource: unit ? "profile" : "missing",
      time: "",
      issues: ["Choose a positive weight value"],
    } satisfies BatchIntakeManualWeightDraft;
  }
  if (kind === "meal") {
    return {
      ...base,
      kind,
      entryMode: "occurrence",
      mealSlot: "breakfast",
      time,
    } satisfies BatchIntakeManualMealOccurrenceDraft;
  }
  return {
    ...base,
    kind: "focus",
    writeId: options.id,
    categoryId: null,
    title: "",
    focusType: "Work",
    focusSubtype: null,
    focusSubtype2: null,
    durationSeconds: null,
    completionTime: time,
    notes: "",
    issues: ["Focus title is required", "Focus duration must be greater than zero"],
  } satisfies BatchIntakeManualFocusDraft;
}

function splitTaskCandidates(line: string) {
  return line.split(",").map((part) => part.trim()).filter(Boolean);
}

function parseOutcome(title: string): { taskTitle: string; outcome: BatchIntakeTaskOutcome } {
  const suffix = title.match(/\s+(did\s+my\s+best|dmb|done|missed)\s*$/i);
  if (!suffix) return { taskTitle: title.trim(), outcome: null };
  const normalizedOutcome = suffix[1].toLocaleLowerCase().replace(/\s+/g, "_");
  return {
    taskTitle: title.slice(0, suffix.index).trim(),
    outcome: (normalizedOutcome === "dmb" ? "did_my_best" : normalizedOutcome) as BatchIntakeTaskOutcome,
  };
}

function parseShorthandWaterToken(value: string) {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(fl\s*oz|floz|fl_oz|oz|cups?|cup)(?:\s+(done|confirmed|pending))?$/i);
  if (!match) return { amount: null, status: null as BatchIntakeWaterStatus, issues: ["Could not parse Water shorthand"] };
  const amount = Number(match[1]);
  const statusText = match[3]?.toLocaleLowerCase() ?? "";
  const status: BatchIntakeWaterStatus = statusText === "pending"
    ? "pending"
    : statusText === "done" || statusText === "confirmed"
      ? "confirmed"
      : null;
  const issues = amount > 0 && Number.isFinite(amount) ? [] : ["Choose a positive water amount"];
  if (!status) issues.push("Choose Pending or Confirmed");
  return {
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    status,
    unit: normalizeShorthandWaterUnit(match[2] ?? "") ?? "fl_oz",
    issues,
  };
}

function parseShorthandWeightToken(value: string, preferredWeightUnit?: HealthWeightUnit | null) {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(?:\s*(lb|lbs|kg))?$/i);
  if (!match) return { value: null, unit: null, unitSource: "missing" as const, issues: ["Could not parse Weight shorthand"] };
  const explicitUnit = match[2]?.toLocaleLowerCase();
  const unit = explicitUnit === "lbs" ? "lb" : explicitUnit as HealthWeightUnit | undefined;
  const resolvedUnit = unit ?? preferredWeightUnit ?? null;
  return {
    value: Number(match[1]),
    unit: resolvedUnit,
    unitSource: unit ? "explicit" as const : resolvedUnit ? "profile" as const : "missing" as const,
    issues: resolvedUnit ? [] : ["Health preferred weight unit is not ready"],
  };
}

function shorthandFocusDurationPattern() {
  return /^(.*?)(?:\s+)(\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes)(?:\s*\d+(?:\.\d+)?\s*(?:m|min|mins|minute|minutes))?)$/i;
}

function extractTrailingShorthandDate(value: string, referenceDate: string) {
  const normalized = stripTrailingMarkdownBackslashes(value);
  const match = normalized.match(/^(.*)\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)$/);
  if (!match) return { body: normalized, date: null as string | null, issue: null as string | null };
  const dateToken = match[2] ?? "";
  const date = parseDateHeading(dateToken, referenceDate);
  return {
    body: (match[1] ?? "").trim(),
    date,
    issue: date ? null : `Invalid Focus shorthand date: ${dateToken}`,
  };
}

function splitFocusCategoryAndTitle(value: string) {
  const tokens = tokenizeShorthandCsvTokens(value);
  const categoryCandidate = tokens[0]?.value ?? value.trim();
  if (tokens.length < 2) {
    return { categoryCandidate, sessionTitle: null as string | null };
  }
  const sessionTitle = tokens.slice(1).map((token) => token.value).join(", ").trim();
  return { categoryCandidate, sessionTitle: sessionTitle || null };
}

function focusGroupId(category: FocusCategory | null, categoryCandidate: string, title: string) {
  return batchIntakeCanonicalFocusGroupId(category?.id ?? null, categoryCandidate, title);
}

function createShorthandFocusDraft(
  line: string,
  lineNumber: number,
  date: string | null,
  body: string,
  categories: readonly FocusCategory[] | undefined,
  referenceDate: string,
): BatchIntakeParsedFocusDraft {
  const inlineDate = extractTrailingShorthandDate(body, referenceDate);
  const timed = extractTrailingShorthandTime(inlineDate.body);
  const match = timed.body.match(shorthandFocusDurationPattern());
  const titleAndCategory = splitFocusCategoryAndTitle((match?.[1] ?? timed.body).trim());
  const durationSeconds = match ? parseBatchIntakeDuration(match[2] ?? "") : null;
  const category = exactFocusCategoryForTitle(titleAndCategory.categoryCandidate, categories);
  const title = titleAndCategory.sessionTitle ?? category?.title ?? titleAndCategory.categoryCandidate;
  const resolvedDate = inlineDate.date ?? (inlineDate.issue ? null : date);
  const issues = [
    ...(inlineDate.issue ? [inlineDate.issue] : []),
    ...(category ? [] : ["No exact saved Focus category match"]),
    ...(timed.time ? [] : ["Choose a Focus completion time"]),
    ...(durationSeconds === null ? ["Focus duration must be greater than zero"] : []),
  ];
  return {
    ...makeBase(line, lineNumber, resolvedDate, "focus", "high", issues),
    categoryId: category?.id ?? null,
    completionTime: timed.time ?? "",
    durationSeconds,
    focusSubtype: category?.focusSubtype ?? null,
    focusSubtype2: category?.focusSubtype2 ?? null,
    focusType: category?.focusType ?? "Work",
    kind: "focus",
    notes: "",
    title,
    writeId: undefined,
    groupId: focusGroupId(category, titleAndCategory.categoryCandidate, title),
  };
}

function createShorthandMealDrafts(
  line: string,
  lineNumber: number,
  date: string | null,
  prefix: ScratchpadShorthandPrefix,
  body: string,
  time: string | null,
) {
  const slot: HealthMealSlot = prefix === "b" ? "breakfast" : prefix === "l" ? "lunch" : prefix === "d" ? "dinner" : "snack";
  const occurrence = {
    ...makeBase(line, lineNumber, date, "meal", "high"),
    entryMode: "occurrence" as const,
    kind: "meal" as const,
    mealSlot: slot,
    rawText: body,
    time: time ?? "12:00",
  } satisfies BatchIntakeParsedMealOccurrenceDraft;
  const tokens = tokenizeShorthandCsvTokens(body);
  const proposals: BatchIntakeMealFoodProposalDraft[] = tokens.map((token, index) => {
    const parsed = parseShorthandMealFoodToken(token.value);
    const issues = parsed.proposedFoodName ? ["Resolve food in Custom Nutrition Library"] : ["Food name is required"];
    return {
      ...makeBase(line, lineNumber, date, "meal", "high", issues, index + 1),
      entryMode: "food_proposal" as const,
      kind: "meal" as const,
      mealOccurrenceId: occurrence.id,
      sourceParsedMealId: occurrence.id,
      rawToken: token.raw,
      proposedFoodName: parsed.proposedFoodName,
      proposedQuantity: parsed.proposedQuantity,
      proposedUnit: parsed.proposedUnit,
      writeId: undefined,
      groupId: occurrence.id,
    };
  });
  if (tokens.length === 0) occurrence.issues.push("At least one food proposal is required");
  return [occurrence, ...proposals] satisfies BatchIntakeMealDraft[];
}

function parseMeal(line: string) {
  const match = line.match(/^(breakfast|break|lunch|dinner|din|snack)\b\s*[-,:]?\s*(.*)$/i);
  if (!match) return null;
  const alias = match[1].toLowerCase();
  const mealSlot: HealthMealSlot = alias === "break" || alias === "breakfast"
    ? "breakfast"
    : alias === "lunch"
      ? "lunch"
      : alias === "din" || alias === "dinner"
        ? "dinner"
        : "snack";
  return { mealSlot, rawText: match[2].trim() };
}

function parseWater(line: string, inWaterSection: boolean) {
  const match = line.match(
    /^(?:(\d+(?:\.\d+)?)\s*(fl\s*oz|oz)?\s+water|water\s+(\d+(?:\.\d+)?)\s*(fl\s*oz|oz)?|(\d+(?:\.\d+)?)\s*(fl\s*oz|oz))\b(?:\s+([a-z]+))?/i,
  );
  if (!match && !inWaterSection) return null;
  if (!match) {
    return {
      amount: null,
      status: null as BatchIntakeWaterStatus,
      issues: ["Could not parse a water amount"],
    };
  }
  const amountText = match[1] ?? match[3] ?? match[5];
  const statusText = match[7]?.toLowerCase() ?? "";
  const amount = Number(amountText);
  const status: BatchIntakeWaterStatus = statusText === "pending"
    ? "pending"
    : statusText === "done" || statusText === "confirmed"
      ? "confirmed"
      : null;
  const issues: string[] = [];
  if (!Number.isFinite(amount) || amount <= 0) issues.push("Choose a positive water amount");
  if (statusText && !["pending", "done", "confirmed"].includes(statusText)) {
    issues.push("Choose Pending or Confirmed");
  } else if (!statusText) {
    issues.push("Choose Pending or Confirmed");
  }
  return { amount: Number.isFinite(amount) && amount > 0 ? amount : null, status, issues };
}

function parseWeight(line: string, preferredWeightUnit?: HealthWeightUnit | null) {
  const match = line.match(/^(?:weigh|weight)\s+(\d+(?:\.\d+)?)(?:\s*(lb|kg))?\s*$/i);
  if (!match) return null;
  const explicitUnit = match[2]?.toLowerCase() as HealthWeightUnit | undefined;
  const unit = explicitUnit ?? preferredWeightUnit ?? null;
  const issues = unit ? [] : ["Health preferred weight unit is not ready"];
  return {
    value: Number(match[1]),
    unit,
    unitSource: explicitUnit ? "explicit" as const : unit ? "profile" as const : "missing" as const,
    issues,
  };
}

function normalizeFocusCategoryTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function exactFocusCategoryForTitle(title: string, categories: readonly FocusCategory[] | undefined) {
  const normalizedTitle = normalizeFocusCategoryTitle(title);
  if (!normalizedTitle || !categories) return null;
  return categories.find((category) => normalizeFocusCategoryTitle(category.title) === normalizedTitle) ?? null;
}

export function parseBatchIntakeDuration(value: string): number | null {
  const normalized = value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const hourMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)(?:\s*(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes))?$/);
  const minuteMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)$/);
  if (!hourMatch && !minuteMatch) return null;

  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = hourMatch ? (hourMatch[2] ? Number(hourMatch[2]) : 0) : Number(minuteMatch?.[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || minutes < 0 || (hourMatch && minutes >= 60)) return null;
  const durationSeconds = Math.round(hours * 3600 + minutes * 60);
  return durationSeconds > 0 ? durationSeconds : null;
}

function parseInlineFocusPair(line: string, categories: readonly FocusCategory[] | undefined) {
  const match = line.match(/^(.+?)\s*(?:-|:)\s*(\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes)(?:\s*\d+(?:\.\d+)?\s*(?:m|min|mins|minute|minutes))?)$/i)
    ?? line.match(/^(.+?)\s+(\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes)(?:\s*\d+(?:\.\d+)?\s*(?:m|min|mins|minute|minutes))?)$/i);
  if (!match) return null;
  const category = exactFocusCategoryForTitle(match[1] ?? "", categories);
  const durationSeconds = parseBatchIntakeDuration(match[2] ?? "");
  return category && durationSeconds !== null ? { category, durationSeconds } : null;
}

function createParsedFocusDraft(
  sourceText: string,
  sourceLineNumber: number,
  date: string | null,
  category: FocusCategory,
  durationSeconds: number,
  completionTime: string | null = null,
): BatchIntakeParsedFocusDraft {
  return {
    ...makeBase(sourceText, sourceLineNumber, date, "focus", "high", completionTime ? [] : ["Choose a Focus completion time"]),
    categoryId: category.id,
    completionTime: completionTime ?? "",
    durationSeconds,
    focusSubtype: category.focusSubtype ?? null,
    focusSubtype2: category.focusSubtype2 ?? null,
    focusType: category.focusType,
    kind: "focus",
    notes: "",
    title: category.title,
    writeId: undefined,
    groupId: focusGroupId(category, category.title, category.title),
  };
}

function isDeferredLine(line: string) {
  const lower = line.toLowerCase();
  if (/\bcpap\b|\bno\s+pap\b|\bsleep\b|\bnap\b/.test(lower)) {
    return "Sleep/CPAP parsing deferred";
  }
  if (/^coding\b|^\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/i.test(line)) {
    return "Activity duration parsing deferred";
  }
  return null;
}

function createTaskDraftFromParts(
  line: string,
  lineNumber: number,
  date: string | null,
  taskTitle: string,
  outcome: BatchIntakeTaskOutcome,
  part: TaskDraftPart,
  confidence: BatchIntakeConfidence,
  issues: string[] = [],
  suppressMissingDateIssue = false,
): BatchIntakeTaskDraft {
  const base = makeBase(line, lineNumber, date, "task", confidence, issues, part);
  return {
    ...base,
    kind: "task",
    taskTitle,
    outcome,
    selectedTaskId: null,
    issues: [
      ...(suppressMissingDateIssue ? base.issues.filter((issue) => issue !== "Missing date heading") : base.issues),
      ...(taskTitle ? [] : ["Task title is empty"]),
    ],
  };
}

function createTaskDraft(line: string, lineNumber: number, date: string | null, title: string, part: TaskDraftPart, confidence: BatchIntakeConfidence): BatchIntakeTaskDraft {
  const parsed = parseOutcome(title);
  return createTaskDraftFromParts(line, lineNumber, date, parsed.taskTitle, parsed.outcome, part, confidence);
}

function normalizeTaskOutcome(value: string): BatchIntakeTaskOutcome {
  const normalizedOutcome = value.toLocaleLowerCase().replace(/\s+/g, "_");
  return (normalizedOutcome === "dmb" ? "did_my_best" : normalizedOutcome) as BatchIntakeTaskOutcome;
}

function parseMultiDateTaskExpression(value: string) {
  const match = value.match(/^(.+?)\s+-\s+(did\s+my\s+best|dmb|done|missed)(?:\s+(.*))?$/i);
  if (!match) return null;
  return {
    dateTokens: match[3]?.trim() ? match[3].trim().split(/\s+/) : [],
    outcome: normalizeTaskOutcome(match[2] ?? ""),
    taskTitle: (match[1] ?? "").trim(),
  };
}

function createMultiDateTaskDrafts(
  line: string,
  lineNumber: number,
  fallbackDate: string | null,
  value: string,
  referenceDate: string,
  part: TaskDraftPart,
) {
  const parsed = parseMultiDateTaskExpression(value);
  if (!parsed) return null;
  if (parsed.dateTokens.length === 0) {
    return [createTaskDraftFromParts(line, lineNumber, fallbackDate, parsed.taskTitle, parsed.outcome, `${part}-0`, "high")];
  }

  const seenDates = new Set<string>();
  const drafts: BatchIntakeTaskDraft[] = [];
  parsed.dateTokens.forEach((dateToken, dateIndex) => {
    const resolvedDate = parseDateHeading(dateToken, referenceDate);
    const draftPart = `${part}-${dateIndex}`;
    if (resolvedDate) {
      if (seenDates.has(resolvedDate)) return;
      seenDates.add(resolvedDate);
      drafts.push(createTaskDraftFromParts(line, lineNumber, resolvedDate, parsed.taskTitle, parsed.outcome, draftPart, "high"));
      return;
    }
    drafts.push(createTaskDraftFromParts(
      line,
      lineNumber,
      null,
      parsed.taskTitle,
      parsed.outcome,
      draftPart,
      "medium",
      [`Invalid Task shorthand date: ${dateToken}`],
      true,
    ));
  });
  return drafts;
}

function createTaskShorthandDrafts(
  line: string,
  lineNumber: number,
  date: string | null,
  body: string,
  referenceDate: string,
) {
  const tokens = tokenizeShorthandCsvTokens(body);
  const drafts: BatchIntakeTaskDraft[] = [];
  tokens.forEach((token, part) => {
    const multiDateDrafts = createMultiDateTaskDrafts(line, lineNumber, date, token.value, referenceDate, part);
    if (multiDateDrafts) drafts.push(...multiDateDrafts);
    else drafts.push(createTaskDraft(line, lineNumber, date, token.value, part, "high"));
  });
  if (tokens.length === 0) drafts.push(createTaskDraft(line, lineNumber, date, "", 0, "high"));
  return drafts;
}

export function parseBatchIntake(sourceText: string, options: ParseBatchIntakeOptions): BatchIntakeDraft[] {
  const drafts: BatchIntakeDraft[] = [];
  let currentDate: string | null = null;
  let section: "tasks" | "water" | null = null;

  const lines = sourceText.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const lineNumber = index + 1;
    const line = normalizeLine(rawLine);
    if (!line) continue;
    const headingDate = parseDateHeading(line, options.referenceDate);
    if (headingDate) {
      currentDate = headingDate;
      section = null;
      continue;
    }

    const structural = normalizeStructuralLine(line);
    if (structural === "tasks" || structural === "task") {
      section = "tasks";
      continue;
    }
    if (structural === "water") {
      section = "water";
      continue;
    }

    const shorthandLine = stripTrailingMarkdownBackslashes(line);
    const shorthand = parseShorthandPrefix(shorthandLine);
    if (shorthand) {
      if (shorthand.prefix === "f") {
        drafts.push(createShorthandFocusDraft(line, lineNumber, currentDate, shorthand.body, options.focusCategories, options.referenceDate));
        continue;
      }
      const timed = shorthand.prefix === "t" ? { body: shorthand.body, time: null as string | null } : extractTrailingShorthandTime(shorthand.body);
      if (shorthand.prefix === "t") {
        drafts.push(...createTaskShorthandDrafts(line, lineNumber, currentDate, timed.body, options.referenceDate));
        continue;
      }
      if (shorthand.prefix === "w") {
        const tokens = tokenizeShorthandCsvTokens(timed.body);
        (tokens.length ? tokens : [{ value: "", raw: "" }]).forEach((token, part) => {
          const water = parseShorthandWaterToken(token.value);
          drafts.push({
            ...makeBase(line, lineNumber, currentDate, "water", water.issues.length ? "medium" : "high", water.issues, part),
            amount: water.amount,
            kind: "water",
            status: water.status,
            time: timed.time ?? "",
            unit: water.unit ?? "fl_oz",
          });
        });
        continue;
      }
      if (shorthand.prefix === "wt") {
        const tokens = tokenizeShorthandCsvTokens(timed.body);
        (tokens.length ? tokens : [{ value: "", raw: "" }]).forEach((token, part) => {
          const weight = parseShorthandWeightToken(token.value, options.preferredWeightUnit);
          drafts.push({
            ...makeBase(line, lineNumber, currentDate, "weight", "high", weight.issues, part),
            kind: "weight",
            time: timed.time ?? "",
            unit: weight.unit,
            unitSource: weight.unitSource,
            value: weight.value,
          });
        });
        continue;
      }
      drafts.push(...createShorthandMealDrafts(line, lineNumber, currentDate, shorthand.prefix, timed.body, timed.time));
      continue;
    }

    if (section === "tasks") {
      const taskTitles = splitTaskCandidates(line);
      taskTitles.forEach((title, part) => drafts.push(createTaskDraft(line, lineNumber, currentDate, title, part, "high")));
      continue;
    }

    const meal = parseMeal(line);
    if (meal) {
      drafts.push({
        ...makeBase(line, lineNumber, currentDate, "meal", "high"),
        kind: "meal",
        entryMode: "occurrence",
        mealSlot: meal.mealSlot,
        rawText: meal.rawText,
        time: "12:00",
      } satisfies BatchIntakeParsedMealOccurrenceDraft);
      section = null;
      continue;
    }

    const weight = parseWeight(line, options.preferredWeightUnit);
    if (weight) {
      drafts.push({
        ...makeBase(line, lineNumber, currentDate, "weight", "high", weight.issues),
        kind: "weight",
        value: weight.value,
        unit: weight.unit,
        unitSource: weight.unitSource,
      });
      section = null;
      continue;
    }

    const water = parseWater(line, section === "water");
    if (water) {
      drafts.push({
        ...makeBase(line, lineNumber, currentDate, "water", water.issues.length ? "medium" : "high", water.issues),
        kind: "water",
        amount: water.amount,
        unit: "fl_oz",
        status: water.status,
      });
      section = "water";
      continue;
    }

    const inlineFocus = parseInlineFocusPair(line, options.focusCategories);
    if (inlineFocus) {
      drafts.push(createParsedFocusDraft(line, lineNumber, currentDate, inlineFocus.category, inlineFocus.durationSeconds));
      section = null;
      continue;
    }

    const nextLine = index + 1 < lines.length ? normalizeLine(lines[index + 1] ?? "") : "";
    const pairedCategory = exactFocusCategoryForTitle(line, options.focusCategories);
    const pairedDuration = pairedCategory && nextLine ? parseBatchIntakeDuration(nextLine) : null;
    if (pairedCategory && pairedDuration !== null) {
      drafts.push(createParsedFocusDraft(`${line} / ${nextLine}`, lineNumber, currentDate, pairedCategory, pairedDuration));
      index += 1;
      section = null;
      continue;
    }

    const deferredReason = isDeferredLine(line);
    if (deferredReason) {
      drafts.push({
        ...makeBase(line, lineNumber, currentDate, "unsupported", "low", [deferredReason]),
        kind: "unsupported",
        reason: deferredReason,
      });
      section = null;
      continue;
    }

    const taskTitles = splitTaskCandidates(line);
    if (currentDate && taskTitles.length > 1) {
      taskTitles.forEach((title, part) => drafts.push(createTaskDraft(line, lineNumber, currentDate, title, part, "medium")));
      section = null;
      continue;
    }

    drafts.push({
      ...makeBase(line, lineNumber, currentDate, "unsupported", "low", [currentDate ? "Unrecognized line" : "Missing date heading"]),
      kind: "unsupported",
      reason: currentDate ? "Unrecognized line" : "Missing date heading",
    });
    section = null;
  }

  return drafts.map((draft) => {
    if (draft.kind === "water" && draft.origin === "parsed") return { ...draft, groupId: "parsed:water" };
    if (draft.kind === "weight" && draft.origin === "parsed") return { ...draft, groupId: "parsed:weight" };
    return draft;
  });
}

export function duplicateManualBatchIntakeDraft(
  draft: Exclude<BatchIntakeDraft, BatchIntakeUnsupportedDraft | BatchIntakeMealFoodDraft | BatchIntakeMealFoodProposalDraft>,
  options: { id: string; writeId: string },
): Exclude<BatchIntakeDraft, BatchIntakeUnsupportedDraft | BatchIntakeMealFoodDraft | BatchIntakeMealFoodProposalDraft> {
  const base = {
    id: options.id,
    groupId: draft.groupId,
    sourceText: draft.sourceText,
    sourceLineNumber: null,
    origin: "manual" as const,
    date: draft.date,
    included: true,
    confidence: draft.confidence,
    issues: [...draft.issues],
  };
  if (draft.kind === "task") {
    return {
      ...base,
      kind: "task",
      selectedTaskId: draft.selectedTaskId,
      taskTitle: draft.taskTitle,
      outcome: draft.outcome,
    } satisfies BatchIntakeManualTaskDraft;
  }
  if (draft.kind === "water") {
    return {
      ...base,
      kind: "water",
      amount: draft.amount,
      status: draft.status,
      time: "time" in draft ? draft.time : "",
      unit: draft.unit,
      writeId: options.writeId,
    } satisfies BatchIntakeManualWaterDraft;
  }
  if (draft.kind === "weight") {
    return {
      ...base,
      kind: "weight",
      time: "time" in draft ? draft.time : "",
      unit: draft.unit,
      unitSource: draft.unitSource,
      value: draft.value,
      writeId: options.writeId,
    } satisfies BatchIntakeManualWeightDraft;
  }
  if (draft.kind === "meal") {
    return {
      ...base,
      kind: "meal",
      groupId: options.id,
      entryMode: "occurrence",
      mealSlot: draft.mealSlot,
      time: draft.time,
    } satisfies BatchIntakeManualMealOccurrenceDraft;
  }
  return {
    ...draft,
    ...base,
    kind: "focus",
    writeId: options.writeId,
  } satisfies BatchIntakeManualFocusDraft;
}

function mealFoodFromLibrarySelection(
  occurrence: BatchIntakeMealOccurrenceDraft,
  food: HealthFoodLibraryItem,
  options: { id: string; writeId: string; origin: "manual" | "parsed"; sourceParsedMealId: string | null; rawToken?: string | null },
): BatchIntakeMealFoodDraft {
  const selection = mealFoodSelectionFromLibraryItem(food);
  return {
    ...mealFoodBase(occurrence, options),
    rawToken: options.rawToken ?? null,
    attribution: selection.attribution,
    barcode: selection.barcode,
    brandName: selection.brandName,
    calories: selection.calories,
    carbsG: selection.carbs,
    entryMode: "food",
    fatG: selection.fat,
    foodName: selection.foodName,
    foodCategory: selection.foodCategory,
    kind: "meal",
    nutritionDetails: selection.nutritionDetails,
    provider: selection.provider,
    providerItemId: selection.providerItemId,
    proteinG: selection.protein,
    servingLabel: selection.servingLabel ?? "",
    servingMeasureUnit: selection.servingMeasureUnit,
    servingMeasureValue: selection.servingMeasureValue,
    servingQuantity: selection.servingQuantity,
    servingUnit: selection.servingUnit,
    consumedQuantity: selection.servingQuantity,
    consumedUnit: selection.servingUnit,
    sourceFoodId: selection.sourceFoodId,
    foodMode: "library",
    writeId: options.writeId,
    origin: options.origin,
    sourceLineNumber: options.origin === "parsed" ? occurrence.sourceLineNumber : null,
  } as BatchIntakeMealFoodDraft;
}

export function createManualMealFood(
  occurrence: BatchIntakeMealOccurrenceDraft,
  options: { id: string; writeId: string },
) {
  return emptyManualMealFood(occurrence, options);
}

export function addMealFromLibraryFood(
  occurrence: BatchIntakeManualMealOccurrenceDraft,
  food: HealthFoodLibraryItem,
  options: { id: string; writeId: string },
): BatchIntakeManualMealFoodDraft;
export function addMealFromLibraryFood(
  occurrence: BatchIntakeParsedMealOccurrenceDraft,
  food: HealthFoodLibraryItem,
  options: { id: string; writeId: string },
): BatchIntakeParsedMealFoodDraft;
export function addMealFromLibraryFood(
  occurrence: BatchIntakeMealOccurrenceDraft,
  food: HealthFoodLibraryItem,
  options: { id: string; writeId: string },
): BatchIntakeMealFoodDraft;
export function addMealFromLibraryFood(
  occurrence: BatchIntakeMealOccurrenceDraft,
  food: HealthFoodLibraryItem,
  options: { id: string; writeId: string },
): BatchIntakeMealFoodDraft {
  return mealFoodFromLibrarySelection(occurrence, food, {
    ...options,
    origin: occurrence.origin,
    sourceParsedMealId: occurrence.origin === "parsed" ? occurrence.id : null,
  });
}

export function addMealFromParsedFood(
  parsedMeal: BatchIntakeParsedMealOccurrenceDraft,
  food: HealthFoodLibraryItem,
  options: { id: string; writeId: string },
): BatchIntakeParsedMealFoodDraft {
  return addMealFromLibraryFood(parsedMeal, food, options);
}

export function normalizeBatchIntakeFoodName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function proposalIssue(draft: BatchIntakeMealFoodProposalDraft, issue: string) {
  return {
    ...draft,
    issues: [...draft.issues.filter((candidate) => !candidate.includes("Custom Food") && !candidate.includes("food in Custom")), issue],
  } satisfies BatchIntakeMealFoodProposalDraft;
}

export function resolveBatchIntakeMealFoodProposal(
  proposal: BatchIntakeMealFoodProposalDraft,
  occurrence: BatchIntakeMealOccurrenceDraft,
  food: HealthFoodLibraryItem,
  options: { id?: string; writeId: string },
): BatchIntakeMealFoodDraft {
  const resolved = mealFoodFromLibrarySelection(occurrence, food, {
    id: options.id ?? proposal.id,
    origin: "parsed",
    rawToken: proposal.rawToken,
    sourceParsedMealId: proposal.sourceParsedMealId,
    writeId: options.writeId,
  });
  resolved.included = proposal.included;
  resolved.consumedQuantity = proposal.proposedQuantity ?? resolved.servingQuantity;
  const requestedUnit = proposal.proposedUnit ?? resolved.servingUnit;
  resolved.consumedUnit = proposal.proposedUnit && normalizeShorthandMealUnit(proposal.proposedUnit) === normalizeShorthandMealUnit(resolved.servingUnit)
    ? resolved.servingUnit
    : requestedUnit;
  const calculation = calculateBatchIntakeMealNutrition(resolved);
  resolved.issues = calculation ? [] : ["Consumed quantity is incompatible with the stored serving"];
  return resolved;
}

export function createManualMealFoodFromProposal(
  occurrence: BatchIntakeMealOccurrenceDraft,
  proposal: BatchIntakeMealFoodProposalDraft,
  options: { id?: string; writeId: string },
): BatchIntakeManualMealFoodDraft {
  const manual = emptyManualMealFood(occurrence, { id: options.id ?? proposal.id, writeId: options.writeId });
  return {
    ...manual,
    consumedQuantity: proposal.proposedQuantity ?? 1,
    consumedUnit: proposal.proposedUnit ?? "serving",
    foodName: proposal.proposedFoodName,
    issues: ["Calories are required"],
    rawToken: proposal.rawToken,
  };
}

export function reconcileBatchIntakeMealFoodProposals(
  drafts: readonly BatchIntakeDraft[],
  foods: readonly HealthFoodLibraryItem[],
  options: { createWriteId?: (proposal: BatchIntakeMealFoodProposalDraft) => string } = {},
) {
  const occurrences = new Map(
    drafts
      .filter((draft): draft is BatchIntakeMealOccurrenceDraft => draft.kind === "meal" && draft.entryMode === "occurrence")
      .map((draft) => [draft.id, draft]),
  );
  return drafts.flatMap((draft) => {
    if (draft.kind !== "meal" || draft.entryMode !== "food_proposal") return [draft];
    const occurrence = occurrences.get(draft.mealOccurrenceId);
    const matches = foods.filter((food) => normalizeBatchIntakeFoodName(food.food_name) === normalizeBatchIntakeFoodName(draft.proposedFoodName));
    if (!occurrence || matches.length !== 1) {
      return [proposalIssue(draft, matches.length > 1 ? "Multiple exact Custom Food matches require review" : "No exact Custom Food match; choose a Custom Food or use manual food")];
    }
    return [resolveBatchIntakeMealFoodProposal(draft, occurrence, matches[0], {
      writeId: draft.writeId ?? options.createWriteId?.(draft) ?? draft.id,
    })];
  });
}

export function calculateBatchIntakeMealNutrition(draft: Pick<BatchIntakeMealFoodDraft, "calories" | "carbsG" | "fatG" | "nutritionDetails" | "proteinG" | "servingMeasureUnit" | "servingMeasureValue" | "servingQuantity" | "servingUnit" | "consumedQuantity" | "consumedUnit">) {
  if (draft.calories === null || draft.consumedQuantity === null || !draft.consumedUnit.trim()) return null;
  try {
    return calculateHealthFoodNutrition({
      consumedQuantity: draft.consumedQuantity,
      consumedUnit: draft.consumedUnit,
      nutritionPerServing: {
        calories: draft.calories,
        carbs_g: draft.carbsG,
        fat_g: draft.fatG,
        nutrition_details: draft.nutritionDetails,
        protein_g: draft.proteinG,
      },
      servingMeasureUnit: draft.servingMeasureUnit,
      servingMeasureValue: draft.servingMeasureValue,
      servingQuantity: draft.servingQuantity,
      servingUnit: draft.servingUnit,
    });
  } catch {
    return null;
  }
}

export function waterDraftAmountInMilliliters(draft: Pick<BatchIntakeWaterDraft, "amount" | "unit">) {
  return draft.amount === null ? null : waterAmountToMilliliters(draft.amount, draft.unit);
}

export function weightDraftInKilograms(draft: Pick<BatchIntakeWeightDraft, "value" | "unit">) {
  return draft.value === null || draft.unit === null ? null : displayWeightToKilograms(draft.value, draft.unit);
}
