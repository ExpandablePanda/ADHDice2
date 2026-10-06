export type ScratchpadShorthandPrefix = "t" | "w" | "wt" | "f" | "b" | "l" | "d" | "s";

export type ScratchpadShorthandToken = {
  value: string;
  raw: string;
};

export function stripTrailingMarkdownBackslashes(value: string) {
  return value.replace(/[\\]+\s*$/, "").trim();
}

export function tokenizeShorthandCsv(value: string) {
  return tokenizeShorthandCsvTokens(value).map((token) => token.value).filter(Boolean);
}

export function tokenizeShorthandCsvTokens(value: string): ScratchpadShorthandToken[] {
  const tokens: ScratchpadShorthandToken[] = [];
  let raw = "";
  let parsed = "";
  let quoted = false;

  const push = () => {
    const trimmedValue = parsed.trim();
    const trimmedRaw = raw.trim();
    if (trimmedValue || trimmedRaw) tokens.push({ value: trimmedValue, raw: trimmedRaw });
    raw = "";
    parsed = "";
  };

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? "";
    if (character === '"') {
      raw += character;
      if (quoted && value[index + 1] === '"') {
        raw += '"';
        parsed += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === "," && !quoted) {
      push();
      continue;
    }
    raw += character;
    parsed += character;
  }
  push();
  return tokens;
}

export function parseShorthandPrefix(value: string) {
  const match = value.match(/^\s*(wt|t|w|f|b|l|d|s)\s*:\s*(.*?)\s*$/i);
  if (!match) return null;
  return {
    body: match[2] ?? "",
    prefix: (match[1] ?? "").toLocaleLowerCase() as ScratchpadShorthandPrefix,
  };
}

function parseClockTime(value: string) {
  const normalized = value.trim().toLocaleLowerCase().replace(/\s+/g, "");
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = match[3] ?? null;
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  let normalizedHour = hour;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    normalizedHour = hour % 12 + (meridiem === "pm" ? 12 : 0);
  } else if (match[2] === undefined || hour > 23) {
    return null;
  }
  return `${String(normalizedHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function extractTrailingShorthandTime(value: string) {
  const normalized = stripTrailingMarkdownBackslashes(value);
  const match = normalized.match(/^(.*)\s+@\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i);
  if (!match) return { body: normalized, time: null as string | null };
  const time = parseClockTime(match[2] ?? "");
  if (!time) return { body: normalized, time: null as string | null };
  return { body: (match[1] ?? "").trim(), time };
}

export function normalizeShorthandWaterUnit(value: string) {
  const normalized = value.trim().toLocaleLowerCase().replace(/\s+/g, "_");
  if (normalized === "oz" || normalized === "fl_oz" || normalized === "floz") return "fl_oz" as const;
  if (normalized === "cup" || normalized === "cups") return "cup" as const;
  return null;
}

export function normalizeShorthandMealUnit(value: string) {
  const normalized = value.trim().toLocaleLowerCase().replace(/\s+/g, "_");
  switch (normalized) {
    case "g":
    case "gram":
    case "grams": return "g";
    case "oz":
    case "ounce":
    case "ounces": return "oz";
    case "ml":
    case "milliliter":
    case "milliliters": return "ml";
    case "fl_oz":
    case "floz":
    case "fluid_ounce":
    case "fluid_ounces": return "fl_oz";
    case "cup":
    case "cups": return "cup";
    case "serving":
    case "servings": return "serving";
    case "slice":
    case "slices": return "slice";
    case "piece":
    case "pieces": return "piece";
    default: return normalized || null;
  }
}

const MEAL_UNIT_PATTERN = "fl\\s*oz|fl_oz|floz|milliliters?|ml|grams?|g|ounces?|oz|cups?|servings?|slices?|pieces?";

export function parseShorthandMealFoodToken(value: string) {
  const token = value.trim();
  const explicit = token.match(new RegExp(`^(.*?)[\\s,]+(\\d+(?:\\.\\d+)?)\\s*(${MEAL_UNIT_PATTERN})$`, "i"));
  if (explicit && (explicit[1] ?? "").trim()) {
    return {
      proposedFoodName: (explicit[1] ?? "").trim(),
      proposedQuantity: Number(explicit[2]),
      proposedUnit: normalizeShorthandMealUnit(explicit[3] ?? ""),
    };
  }
  const unitless = token.match(/^(.*?)\s+(\d+(?:\.\d+)?)$/);
  if (unitless && (unitless[1] ?? "").trim()) {
    return {
      proposedFoodName: (unitless[1] ?? "").trim(),
      proposedQuantity: Number(unitless[2]),
      proposedUnit: null,
    };
  }
  return { proposedFoodName: token, proposedQuantity: null, proposedUnit: null };
}
