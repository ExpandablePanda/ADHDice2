import { formatDateKey } from "@/lib/task-grid-layout";
import type { Task } from "@/lib/database.types";

const REPEAT_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function calcNextDueDate(task: Task): string | null {
  return calcNextDueDateFromDate(task, task.due_on ?? formatDateKey(new Date()));
}

export function calcNextDueDateFromDate(task: Task, referenceDateKey: string): string | null {
  if (task.repeat_frequency === "none") return null;
  const base = new Date(`${referenceDateKey}T12:00:00`);
  const interval = Math.max(1, task.repeat_interval ?? 1);

  if (task.repeat_frequency === "daily") {
    base.setDate(base.getDate() + interval);
    return formatDateKey(base);
  }

  if (task.repeat_frequency === "weekly") {
    const days = task.repeat_days_of_week ?? [];
    if (days.length === 0) {
      base.setDate(base.getDate() + 7 * interval);
      return formatDateKey(base);
    }
    const sortedDays = [...days].sort((a, b) => a - b);
    const baseDow = base.getDay();
    const nextDow = sortedDays.find((d) => d > baseDow) ?? sortedDays[0];
    const daysUntil = nextDow > baseDow ? nextDow - baseDow : 7 * interval - (baseDow - nextDow);
    base.setDate(base.getDate() + daysUntil);
    return formatDateKey(base);
  }

  if (task.repeat_frequency === "monthly") {
    const targetDay = task.repeat_day_of_month ?? base.getDate();
    base.setMonth(base.getMonth() + interval);
    const maxDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    base.setDate(Math.min(targetDay, maxDay));
    return formatDateKey(base);
  }

  base.setDate(base.getDate() + interval);
  return formatDateKey(base);
}

export function formatRepeatSummary(task: Task) {
  if (task.repeat_frequency === "none") return null;

  if (task.repeat_frequency === "daily") {
    return task.repeat_interval > 1 ? `Every ${task.repeat_interval} days` : "Daily";
  }

  if (task.repeat_frequency === "weekly") {
    const weekdayLabels = (task.repeat_days_of_week ?? [])
      .map((day) => REPEAT_WEEKDAY_LABELS[day] ?? null)
      .filter((value): value is (typeof REPEAT_WEEKDAY_LABELS)[number] => value !== null);
    const weekdaySummary = weekdayLabels.length > 0 ? ` (${weekdayLabels.join(", ")})` : "";
    return task.repeat_interval > 1
      ? `Every ${task.repeat_interval} weeks${weekdaySummary}`
      : `Weekly${weekdaySummary}`;
  }

  if (task.repeat_frequency === "monthly") {
    const daySummary = task.repeat_day_of_month ? ` on ${task.repeat_day_of_month}` : "";
    return task.repeat_interval > 1
      ? `Every ${task.repeat_interval} months${daySummary}`
      : `Monthly${daySummary}`;
  }

  return "Custom repeat";
}
