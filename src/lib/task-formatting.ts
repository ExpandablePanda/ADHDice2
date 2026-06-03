import type { Task } from "@/lib/database.types";
import { formatDueLabel, formatDueTimeLabel } from "@/lib/task-cockpit";
import { formatRepeatSummary } from "@/lib/task-repeat";

function formatEstimatedMinutesLabel(minutes: string) {
  const parsedMinutes = Number.parseInt(minutes, 10);
  if (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0) {
    return "No estimate";
  }

  if (parsedMinutes < 60) {
    return `${parsedMinutes}m`;
  }

  const hours = Math.floor(parsedMinutes / 60);
  const remainder = parsedMinutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

export function formatActualSecondsLabel(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) {
    return "Time";
  }

  const roundedMinutes = Math.max(1, Math.ceil(seconds / 60));
  return formatEstimatedMinutesLabel(String(roundedMinutes));
}

export function formatTaskMetaLine(task: Task) {
  const parts = [formatDueLabel(task.due_on)];
  const dueTime = formatDueTimeLabel(task.due_time);
  if (dueTime) {
    parts.push(dueTime);
  }
  parts.push(`${task.energy} energy`);
  parts.push(task.is_important ? "important" : `${task.priority} priority`);
  if (task.estimated_minutes) {
    parts.push(`${task.estimated_minutes} min`);
  }
  if (task.actual_seconds > 0) {
    parts.push(formatActualSecondsLabel(task.actual_seconds));
  }
  return parts.join(" · ");
}

export { formatRepeatSummary };
