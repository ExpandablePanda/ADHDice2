import type { ActiveFocusSession, FocusCategory } from "@/lib/types";

export const SYSTEM_COUNTDOWN_CATEGORY_ID = "__adhdice_system_countdown__";

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

export function adjustActiveFocusSession(
  session: ActiveFocusSession,
  deltaSeconds: number,
  nowMs: number,
): ActiveFocusSession {
  const elapsedSeconds = session.isRunning && session.startTime
    ? Math.max(0, Math.floor((nowMs - session.startTime) / 1000))
    : 0;
  const adjustedSeconds = Math.max(0, session.accumulatedSeconds + elapsedSeconds + deltaSeconds);

  return {
    ...session,
    accumulatedSeconds: adjustedSeconds,
    startTime: session.isRunning ? nowMs : null,
  };
}

export function isSystemCountdownCategoryId(categoryId: string | null | undefined) {
  return categoryId === SYSTEM_COUNTDOWN_CATEGORY_ID;
}

export function getSystemCountdownCategory(): FocusCategory {
  return {
    id: SYSTEM_COUNTDOWN_CATEGORY_ID,
    title: "Countdown",
    focusType: "Work",
    color: "#6f57f6",
    icon: "Clock3",
    dailyGoalSeconds: null,
    weeklyGoalSeconds: null,
  };
}

export function getDisplayFocusCategories(
  categories: FocusCategory[],
  activeSessions: Record<string, ActiveFocusSession>,
) {
  const visibleCategories = categories.filter((category) => !isSystemCountdownCategoryId(category.id));
  if (!activeSessions[SYSTEM_COUNTDOWN_CATEGORY_ID]) {
    return visibleCategories;
  }
  return [getSystemCountdownCategory(), ...visibleCategories];
}

export function resolveFocusCategory(categoryId: string, categories: FocusCategory[]) {
  if (isSystemCountdownCategoryId(categoryId)) {
    return getSystemCountdownCategory();
  }
  return categories.find((entry) => entry.id === categoryId) ?? null;
}
