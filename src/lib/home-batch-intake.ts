import type { HealthMealSlot, HealthWeightUnit, HealthWaterUnit, TaskStatus } from "@/lib/database.types";
import type { FocusSubtype, FocusType } from "@/lib/types";
import { displayWeightToKilograms } from "@/lib/health-utils";
import { waterAmountToMilliliters } from "@/lib/health-library";

export type BatchIntakeKind = "task" | "water" | "weight" | "meal" | "focus" | "unsupported";
export type BatchIntakeManualKind = Exclude<BatchIntakeKind, "unsupported">;
export type BatchIntakeConfidence = "high" | "medium" | "low";
export type BatchIntakeTaskOutcome = Extract<TaskStatus, "done" | "did_my_best" | "missed"> | null;
export type BatchIntakeWaterStatus = "pending" | "confirmed" | null;

type BatchIntakeDraftBase = {
  id: string;
  sourceText: string;
  sourceLineNumber: number | null;
  date: string | null;
  included: boolean;
  confidence: BatchIntakeConfidence;
  issues: string[];
};

type BatchIntakeParsedDraftBase = BatchIntakeDraftBase & {
  origin: "parsed";
  sourceLineNumber: number;
};

type BatchIntakeManualDraftBase = BatchIntakeDraftBase & {
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

export type BatchIntakeParsedMealDraft = BatchIntakeParsedDraftBase & {
  kind: "meal";
  entryMode: "raw";
  mealSlot: HealthMealSlot;
  rawText: string;
};

export type BatchIntakeManualMealDraft = BatchIntakeManualDraftBase & {
  kind: "meal";
  entryMode: "structured";
  writeId: string;
  mealSlot: HealthMealSlot;
  foodName: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  servingLabel: string;
  time: string;
};

export type BatchIntakeMealDraft = BatchIntakeParsedMealDraft | BatchIntakeManualMealDraft;

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

export type BatchIntakeUnsupportedDraft = BatchIntakeParsedDraftBase & {
  kind: "unsupported";
  reason: string;
};

export type BatchIntakeDraft =
  | BatchIntakeTaskDraft
  | BatchIntakeWaterDraft
  | BatchIntakeWeightDraft
  | BatchIntakeMealDraft
  | BatchIntakeManualFocusDraft
  | BatchIntakeUnsupportedDraft;

export type ParseBatchIntakeOptions = {
  referenceDate: string;
  preferredWeightUnit?: HealthWeightUnit | null;
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
  part = 0,
) {
  return {
    id: `batch-intake-${lineNumber}-${part}`,
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

function manualBase(id: string, sourceText: string, date: string) {
  return {
    id,
    sourceText,
    sourceLineNumber: null,
    origin: "manual" as const,
    date,
    included: true,
    confidence: "high" as const,
    issues: [],
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
      entryMode: "structured",
      writeId: options.id,
      mealSlot: "breakfast",
      foodName: "",
      calories: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      servingLabel: "",
      time,
      issues: ["Food name is required", "Calories are required"],
    } satisfies BatchIntakeManualMealDraft;
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
  const suffix = title.match(/\s+(did\s+my\s+best|done)\s*$/i);
  if (!suffix) return { taskTitle: title.trim(), outcome: null };
  return {
    taskTitle: title.slice(0, suffix.index).trim(),
    outcome: suffix[1].replace(/\s+/g, "_").toLowerCase() as BatchIntakeTaskOutcome,
  };
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

function createTaskDraft(line: string, lineNumber: number, date: string | null, title: string, part: number, confidence: BatchIntakeConfidence): BatchIntakeTaskDraft {
  const parsed = parseOutcome(title);
  return {
    ...makeBase(line, lineNumber, date, "task", confidence, parsed.taskTitle ? [] : ["Task title is empty"], part),
    kind: "task",
    taskTitle: parsed.taskTitle,
    outcome: parsed.outcome,
    selectedTaskId: null,
  };
}

export function parseBatchIntake(sourceText: string, options: ParseBatchIntakeOptions): BatchIntakeDraft[] {
  const drafts: BatchIntakeDraft[] = [];
  let currentDate: string | null = null;
  let section: "tasks" | "water" | null = null;

  sourceText.split("\n").forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = normalizeLine(rawLine);
    if (!line) return;
    const headingDate = parseDateHeading(line, options.referenceDate);
    if (headingDate) {
      currentDate = headingDate;
      section = null;
      return;
    }

    const structural = normalizeStructuralLine(line);
    if (structural === "tasks" || structural === "task") {
      section = "tasks";
      return;
    }
    if (structural === "water") {
      section = "water";
      return;
    }

    const meal = parseMeal(line);
    if (meal) {
      drafts.push({
        ...makeBase(line, lineNumber, currentDate, "meal", "high"),
        kind: "meal",
        entryMode: "raw",
        mealSlot: meal.mealSlot,
        rawText: meal.rawText,
      });
      section = null;
      return;
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
      return;
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
      return;
    }

    const deferredReason = isDeferredLine(line);
    if (deferredReason) {
      drafts.push({
        ...makeBase(line, lineNumber, currentDate, "unsupported", "low", [deferredReason]),
        kind: "unsupported",
        reason: deferredReason,
      });
      section = null;
      return;
    }

    const taskTitles = splitTaskCandidates(line);
    if (section === "tasks" || (currentDate && taskTitles.length > 1)) {
      taskTitles.forEach((title, part) => drafts.push(createTaskDraft(line, lineNumber, currentDate, title, part, section === "tasks" ? "high" : "medium")));
      section = section === "tasks" ? "tasks" : null;
      return;
    }

    drafts.push({
      ...makeBase(line, lineNumber, currentDate, "unsupported", "low", [currentDate ? "Unrecognized line" : "Missing date heading"]),
      kind: "unsupported",
      reason: currentDate ? "Unrecognized line" : "Missing date heading",
    });
    section = null;
  });

  return drafts;
}

export function waterDraftAmountInMilliliters(draft: Pick<BatchIntakeWaterDraft, "amount" | "unit">) {
  return draft.amount === null ? null : waterAmountToMilliliters(draft.amount, draft.unit);
}

export function weightDraftInKilograms(draft: Pick<BatchIntakeWeightDraft, "value" | "unit">) {
  return draft.value === null || draft.unit === null ? null : displayWeightToKilograms(draft.value, draft.unit);
}
