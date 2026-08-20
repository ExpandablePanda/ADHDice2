import type { HistoricalFocusSession } from "@/lib/types";

export const ALL_FOCUS_ACTIVITY_FILTER = "__all__";

export function getFocusActivityTypeOptions(history: HistoricalFocusSession[]) {
  return [...new Set(history.map((session) => session.focusType.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

export function getFocusActivitySubtypeOptions(
  history: HistoricalFocusSession[],
  focusType: string = ALL_FOCUS_ACTIVITY_FILTER,
) {
  return [...new Set(history
    .filter((session) => focusType === ALL_FOCUS_ACTIVITY_FILTER || session.focusType === focusType)
    .map((session) => session.focusSubtype?.trim() ?? "")
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

export function filterFocusActivityHistory(
  history: HistoricalFocusSession[],
  focusType: string = ALL_FOCUS_ACTIVITY_FILTER,
  focusSubtype: string = ALL_FOCUS_ACTIVITY_FILTER,
) {
  return history.filter((session) => (
    (focusType === ALL_FOCUS_ACTIVITY_FILTER || session.focusType === focusType)
    && (focusSubtype === ALL_FOCUS_ACTIVITY_FILTER || session.focusSubtype === focusSubtype)
  ));
}
