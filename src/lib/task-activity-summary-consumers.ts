import { shiftDateKey } from "./date-key";
import type { TaskActivitySummary } from "./task-activity-summary";

export function getStatsTaskActivityMetrics(summary: TaskActivitySummary, todayDateKey: string) {
  const todayEntry = summary.tracked_recent_completed_counts.find((entry) => entry.logical_date === todayDateKey);
  return {
    bestStreak: summary.tracked.best_streak,
    currentStreak: summary.tracked.current_streak,
    doneRate: summary.tracked.done_rate,
    todayDone: todayEntry?.completed_count ?? 0,
    weekDone: summary.tracked_recent_completed_counts.reduce((total, entry) => total + entry.completed_count, 0),
  };
}

export function getStatsProductivityTaskCounts(summary: TaskActivitySummary, todayDateKey: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = shiftDateKey(todayDateKey, -(6 - index));
    return {
      completedCount: summary.tracked_recent_completed_counts.find((entry) => entry.logical_date === date)?.completed_count ?? 0,
      date,
    };
  });
}
