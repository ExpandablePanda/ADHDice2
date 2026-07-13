import type { OnTimePlanItem } from "@/lib/on-time-plan-state";
import type { RunningTaskTimer } from "@/components/ui/task-management-table-v2";
import type { Task, TaskActualTimeEntry } from "@/lib/database.types";
import { buildTaskOccurrenceIdentity } from "@/lib/task-duration-evidence";

export type OnTimeScheduleState = "ahead" | "on_schedule" | "tight" | "behind" | "leave_now" | "incomplete";

export type OnTimeCalculationInput = {
  now: string | number | Date;
  arriveAt: string | null;
  travelMinutes: number | null;
  arrivalBufferMinutes: number;
  items: OnTimePlanItem[];
  completionByItemId?: Record<string, boolean>;
  elapsedSecondsByItemId?: Record<string, number>;
};

export type OnTimeCalculation = {
  remainingPreparationSeconds: number | null;
  targetArrivalAt: string | null;
  beginPreparingBy: string | null;
  leaveBy: string | null;
  projectedArrivalAt: string | null;
  slackSeconds: number | null;
  scheduleState: OnTimeScheduleState;
  missingDurationItemIds: string[];
  projectionTrusted: boolean;
  leaveNow: boolean;
  invalid: boolean;
  incomplete: boolean;
};

function iso(timestamp: number) { return new Date(timestamp).toISOString(); }

export const ON_TIME_COMPLETE_STATUSES = new Set(["done", "did_my_best", "complete"]);

export function isOnTimeTaskEligible(task: Task, linkedTaskIds: ReadonlySet<string>) {
  return !linkedTaskIds.has(task.id)
    && task.status !== "trashed"
    && task.trashed_at === null
    && task.status !== "archived"
    && task.status !== "complete";
}

export function buildOnTimeHierarchy(task: Task, tasksById: ReadonlyMap<string, Task>) {
  const parts: string[] = [];
  const visited = new Set<string>([task.id]);
  let parentId = task.parent_task_id;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = tasksById.get(parentId);
    if (!parent) break;
    parts.unshift(parent.title || "Untitled task");
    parentId = parent.parent_task_id;
  }
  return parts;
}

export function occurrenceIdentityMatches(
  left: { occurrenceKey?: string | null; occurrenceDueOn?: string | null },
  right: { occurrenceKey?: string | null; occurrenceDueOn?: string | null },
) {
  return Boolean(left.occurrenceKey && right.occurrenceKey
    && left.occurrenceKey === right.occurrenceKey
    && (left.occurrenceDueOn ?? null) === (right.occurrenceDueOn ?? null));
}

export function isLinkedItemOccurrenceCurrent(item: Extract<OnTimePlanItem, { kind: "task" }>, task: Task) {
  return occurrenceIdentityMatches(item, buildTaskOccurrenceIdentity(task));
}

export function getOnTimeElapsedSecondsByItemId({
  entries,
  items,
  now,
  timers,
}: {
  entries: TaskActualTimeEntry[];
  items: OnTimePlanItem[];
  now: number;
  timers: RunningTaskTimer[];
}) {
  const result: Record<string, number> = {};
  for (const item of items) {
    if (item.kind !== "task" || !item.occurrenceKey) continue;
    const saved = entries.reduce((total, entry) => total + (
      entry.task_id === item.taskId
      && entry.source === "task_timer"
      && occurrenceIdentityMatches(item, { occurrenceKey: entry.occurrence_key, occurrenceDueOn: entry.occurrence_due_on })
        ? Math.max(0, entry.duration_seconds) : 0
    ), 0);
    const active = timers.reduce((total, timer) => {
      if (timer.taskId !== item.taskId || !occurrenceIdentityMatches(item, timer)) return total;
      const displayed = timer.baseSeconds + Math.max(0, Math.floor(((timer.pausedAt ?? now) - timer.startedAt) / 1000));
      return total + Math.max(displayed - timer.startedActualSeconds, 0);
    }, 0);
    result[item.id] = saved + active;
  }
  return result;
}

export function moveOnTimeItem(items: OnTimePlanItem[], itemId: string, direction: -1 | 1) {
  const from = items.findIndex((item) => item.id === itemId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

export function reorderOnTimeItems(items: OnTimePlanItem[], from: number, to: number) {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** Resolves a stable insertion index from fixed row midpoints without reordering while dragged. */
export function getOnTimeDropIndex(midpoints: number[], pointerY: number, sourceIndex: number) {
  const rawIndex = midpoints.filter((midpoint) => pointerY >= midpoint).length;
  const withoutSourceIndex = rawIndex > sourceIndex ? rawIndex - 1 : rawIndex;
  return Math.max(0, Math.min(midpoints.length - 1, withoutSourceIndex));
}

export type OnTimeSequentialFinish = { estimatedFinishAt: string | null; state: "completed" | "estimated" | "unavailable" };

export function calculateOnTimeSequentialFinishes({
  completionByItemId = {},
  elapsedSecondsByItemId = {},
  items,
  now,
}: Pick<OnTimeCalculationInput, "completionByItemId" | "elapsedSecondsByItemId" | "items" | "now">) {
  let cursor = new Date(now).getTime();
  let blocked = !Number.isFinite(cursor);
  const finishes: Record<string, OnTimeSequentialFinish> = {};
  for (const item of items) {
    const completed = completionByItemId[item.id] ?? (item.kind === "temporary" && item.completed);
    if (completed) {
      finishes[item.id] = { estimatedFinishAt: null, state: "completed" };
      continue;
    }
    if (blocked || item.plannedSeconds === null || !Number.isFinite(item.plannedSeconds) || item.plannedSeconds < 0) {
      blocked = true;
      finishes[item.id] = { estimatedFinishAt: null, state: "unavailable" };
      continue;
    }
    const elapsed = elapsedSecondsByItemId[item.id] ?? 0;
    cursor += Math.max(0, item.plannedSeconds - (Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0)) * 1000;
    finishes[item.id] = { estimatedFinishAt: iso(cursor), state: "estimated" };
  }
  return finishes;
}

export function calculateOnTimeSchedule(input: OnTimeCalculationInput): OnTimeCalculation {
  const now = new Date(input.now).getTime();
  const arrival = input.arriveAt ? Date.parse(input.arriveAt) : Number.NaN;
  const travelMinutes = input.travelMinutes;
  const invalid = !Number.isFinite(now) || !Number.isFinite(arrival)
    || travelMinutes === null || !Number.isFinite(travelMinutes) || travelMinutes < 0
    || !Number.isFinite(input.arrivalBufferMinutes) || input.arrivalBufferMinutes < 0;
  const empty = (missingDurationItemIds: string[] = []): OnTimeCalculation => ({
    remainingPreparationSeconds: null, targetArrivalAt: null, beginPreparingBy: null, leaveBy: null,
    projectedArrivalAt: null, slackSeconds: null, scheduleState: "incomplete", missingDurationItemIds,
    projectionTrusted: false, leaveNow: false, invalid, incomplete: true,
  });
  if (invalid) return empty();
  const validTravelMinutes = travelMinutes as number;

  let remaining = 0;
  const missing: string[] = [];
  for (const item of input.items) {
    const completed = input.completionByItemId?.[item.id] ?? (item.kind === "temporary" && item.completed);
    if (completed) continue;
    if (item.plannedSeconds === null || !Number.isFinite(item.plannedSeconds) || item.plannedSeconds < 0) {
      missing.push(item.id);
      continue;
    }
    const elapsed = input.elapsedSecondsByItemId?.[item.id] ?? 0;
    remaining += Math.max(0, item.plannedSeconds - (Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0));
  }

  const target = arrival - input.arrivalBufferMinutes * 60_000;
  const leaveBy = target - validTravelMinutes * 60_000;
  if (missing.length) {
    const result = empty(missing);
    return { ...result, targetArrivalAt: iso(target), leaveBy: iso(leaveBy), invalid: false };
  }
  const begin = leaveBy - remaining * 1000;
  const projected = now + (remaining + validTravelMinutes * 60) * 1000;
  const slack = Math.round((target - projected) / 1000);
  const deadlinePassed = now > arrival;
  const leaveNow = remaining === 0 && now >= leaveBy && !deadlinePassed;
  let scheduleState: OnTimeScheduleState;
  if (deadlinePassed || (remaining > 0 && slack < 0)) scheduleState = "behind";
  else if (leaveNow) scheduleState = "leave_now";
  else if (slack < 0) scheduleState = "behind";
  else if (slack <= 300) scheduleState = "tight";
  else if (slack <= 900) scheduleState = "on_schedule";
  else scheduleState = "ahead";
  return {
    remainingPreparationSeconds: remaining, targetArrivalAt: iso(target), beginPreparingBy: iso(begin), leaveBy: iso(leaveBy),
    projectedArrivalAt: iso(projected), slackSeconds: slack, scheduleState, missingDurationItemIds: [],
    projectionTrusted: true, leaveNow, invalid: false, incomplete: false,
  };
}
