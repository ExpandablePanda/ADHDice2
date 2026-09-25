export type TaskHistorySummaryLoadStatus = "error" | "loading" | "ready";

export function resolveTaskHistorySummaryLabels({
  canLoadOlderTaskHistory,
  hasCompleteSemanticHistory,
  taskHistoryLoadStatus,
}: {
  canLoadOlderTaskHistory: boolean;
  hasCompleteSemanticHistory: boolean;
  taskHistoryLoadStatus: TaskHistorySummaryLoadStatus;
}) {
  const hasCompleteHistoryForSummary = hasCompleteSemanticHistory
    || (taskHistoryLoadStatus === "ready" && !canLoadOlderTaskHistory);

  return {
    bestStreakLabel: hasCompleteHistoryForSummary ? "Best streak" : "Window best streak",
    hasCompleteHistoryForSummary,
    loggedDaysLabel: hasCompleteHistoryForSummary ? "Logged days" : "Window logged days",
  } as const;
}
