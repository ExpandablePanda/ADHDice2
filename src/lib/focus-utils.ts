import type { FocusCategory } from "@/lib/types";

export function sanitizeFocusLabel(value: string | null | undefined, fallback: string) {
  const trimmed = (value ?? "").trim();
  return trimmed || fallback;
}

export function sanitizeOptionalFocusLabel(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function normalizeCategoryTitle(value: string) {
  return value.trim().toLowerCase();
}

export function preferStoredValue(storedValue: string | null | undefined, currentValue: string | null | undefined) {
  const normalizedStoredValue = sanitizeFocusLabel(storedValue, "");
  const normalizedCurrentValue = sanitizeFocusLabel(currentValue, "");
  return normalizedCurrentValue || normalizedStoredValue;
}

export function preferStoredOptionalValue(storedValue: string | null | undefined, currentValue: string | null | undefined) {
  const normalizedStoredValue = sanitizeFocusLabel(storedValue, "");
  const normalizedCurrentValue = sanitizeFocusLabel(currentValue, "");
  return normalizedCurrentValue || normalizedStoredValue || null;
}

export function dedupeCategoriesByName(categories: FocusCategory[]) {
  return Array.from(
    categories.reduce((accumulator, category) => {
      const normalizedTitle = normalizeCategoryTitle(category.title);
      if (!normalizedTitle) {
        return accumulator;
      }
      accumulator.set(normalizedTitle, category);
      return accumulator;
    }, new Map<string, FocusCategory>()).values(),
  );
}
