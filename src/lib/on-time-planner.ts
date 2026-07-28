import type { OnTimeExecutionSnapshot, OnTimePlanItem } from "@/lib/on-time-plan-state";
import type { RunningTaskTimer } from "@/components/ui/task-management-table-v2";
import type { Task, TaskActualTimeEntry } from "@/lib/database.types";
import { buildTaskOccurrenceIdentity } from "@/lib/task-duration-evidence";
import { reorderListItems } from "@/lib/list-reorder";

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

export type OnTimeExecutionTiming = {
  elapsedSeconds: number;
  estimatedFinishAt: string;
  estimatedFinishMs: number;
  remainingSeconds: number;
};

export function createOnTimeExecutionSnapshot(plannedSeconds: number | null, startedAt: string | number | Date = new Date()): OnTimeExecutionSnapshot | null {
  const startedAtMs = new Date(startedAt).getTime();
  const capturedSeconds = plannedSeconds === null ? 0 : Math.round(plannedSeconds);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(capturedSeconds) || capturedSeconds <= 0) return null;
  return { startedAt: iso(startedAtMs), plannedSeconds: capturedSeconds };
}

export function createElapsedAwareOnTimeExecutionSnapshot({
  elapsedSeconds,
  intent,
  plannedSeconds,
  startedAt,
}: {
  elapsedSeconds: number;
  intent: "start" | "restart";
  plannedSeconds: number | null;
  startedAt: string | number | Date;
}): OnTimeExecutionSnapshot | null {
  const startedAtMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startedAtMs)) return null;
  const matchingElapsedSeconds = intent === "start" && Number.isFinite(elapsedSeconds)
    ? Math.max(0, Math.floor(elapsedSeconds))
    : 0;
  return createOnTimeExecutionSnapshot(plannedSeconds, startedAtMs - matchingElapsedSeconds * 1000);
}

export function getOnTimeExecutionTiming(execution: OnTimeExecutionSnapshot | null, now: string | number | Date): OnTimeExecutionTiming | null {
  if (!execution) return null;
  const startedAtMs = Date.parse(execution.startedAt);
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs) || !Number.isFinite(execution.plannedSeconds) || execution.plannedSeconds <= 0) return null;
  const elapsedSeconds = Math.floor((nowMs - startedAtMs) / 1000);
  const estimatedFinishMs = startedAtMs + execution.plannedSeconds * 1000;
  return {
    elapsedSeconds,
    estimatedFinishAt: iso(estimatedFinishMs),
    estimatedFinishMs,
    remainingSeconds: execution.plannedSeconds - elapsedSeconds,
  };
}

export function formatOnTimeCountdown(seconds: number) {
  if (!Number.isFinite(seconds)) return "00:00";
  const rounded = Math.trunc(seconds);
  if (rounded === 0) return "00:00";
  const sign = rounded < 0 ? "-" : "";
  const absolute = Math.abs(rounded);
  const hours = Math.floor(absolute / 3600);
  const minutes = Math.floor((absolute % 3600) / 60);
  const remainingSeconds = absolute % 60;
  return hours > 0
    ? `${sign}${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${sign}${Math.floor(absolute / 60)}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function formatOnTimeEstimatedFinish(value: string | number | Date, locale?: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Not available";
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(timestamp);
}

function getItemFutureSeconds(item: OnTimePlanItem, now: string | number | Date, elapsedSeconds: number) {
  const execution = getOnTimeExecutionTiming(item.execution, now);
  if (execution) return Math.max(execution.remainingSeconds, 0);
  return item.plannedSeconds === null ? null : Math.max(0, item.plannedSeconds - elapsedSeconds);
}

export const ON_TIME_COMPLETE_STATUSES = new Set(["done", "did_my_best", "complete"]);

export type OnTimeRowState = {
  scheduleResolved: boolean;
  semanticallyCompleted: boolean;
  visibleLabel: string | null;
  renderActiveTiming: boolean;
};

const ON_TIME_LINKED_TERMINAL_LABELS: Partial<Record<Task["status"], string>> = {
  done: "Done",
  did_my_best: "Did My Best",
  complete: "Complete",
  missed: "Missed",
};

export function classifyOnTimeRowState(item: OnTimePlanItem, status?: Task["status"]): OnTimeRowState {
  if (item.kind === "temporary") {
    return {
      scheduleResolved: item.completed,
      semanticallyCompleted: item.completed,
      visibleLabel: item.completed ? "Completed" : null,
      renderActiveTiming: !item.completed,
    };
  }
  const visibleLabel = status ? ON_TIME_LINKED_TERMINAL_LABELS[status] ?? null : null;
  const scheduleResolved = status === "done" || status === "did_my_best" || status === "complete";
  return {
    scheduleResolved,
    semanticallyCompleted: status === "done" || status === "did_my_best" || status === "complete",
    visibleLabel,
    renderActiveTiming: !scheduleResolved,
  };
}

export function formatOnTimeArrivalDetail(slackSeconds: number | null) {
  if (slackSeconds === null || !Number.isFinite(slackSeconds)) return null;
  if (Math.abs(slackSeconds) < 30) return "Arriving on time";
  const minutes = Math.round(Math.abs(slackSeconds) / 60);
  return slackSeconds > 0 ? `Arriving ${minutes} min early` : `Arriving ${minutes} min late`;
}

export function formatUnsignedOperationalDuration(seconds: number) {
  const absolute = Math.max(0, Math.trunc(Math.abs(seconds)));
  const hours = Math.floor(absolute / 3600);
  const minutes = Math.floor((absolute % 3600) / 60);
  const remainingSeconds = absolute % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${Math.floor(absolute / 60)}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function formatOnTimeOperationalCountdown(calculation: OnTimeCalculation, nowMs: number) {
  if (!calculation.projectionTrusted || calculation.incomplete || !calculation.beginPreparingBy || !calculation.leaveBy || !calculation.targetArrivalAt) return null;
  const beginMs = Date.parse(calculation.beginPreparingBy);
  const leaveMs = Date.parse(calculation.leaveBy);
  const targetMs = Date.parse(calculation.targetArrivalAt);
  if (![beginMs, leaveMs, targetMs, nowMs].every(Number.isFinite)) return null;
  const future = (deadlineMs: number) => formatUnsignedOperationalDuration(Math.ceil((deadlineMs - nowMs) / 1000));
  const overdue = (deadlineMs: number) => formatUnsignedOperationalDuration(Math.floor((nowMs - deadlineMs) / 1000));
  if (calculation.remainingPreparationSeconds === 0 && nowMs < leaveMs) return `Leave in ${future(leaveMs)}`;
  if (nowMs < beginMs) return `Begin preparing in ${future(beginMs)}`;
  if (nowMs < leaveMs) return `Leave in ${future(leaveMs)}`;
  if (nowMs < leaveMs + 1000) return "Leave now";
  if (nowMs < targetMs) return `${overdue(leaveMs)} past leave time`;
  if (nowMs < targetMs + 1000) return "Target arrival now";
  return `${overdue(targetMs)} past target arrival`;
}

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
  return reorderListItems(items, from, to);
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
    const execution = getOnTimeExecutionTiming(item.execution, now);
    if (blocked || (!execution && (item.plannedSeconds === null || !Number.isFinite(item.plannedSeconds) || item.plannedSeconds < 0))) {
      blocked = true;
      finishes[item.id] = { estimatedFinishAt: null, state: "unavailable" };
      continue;
    }
    const elapsed = elapsedSecondsByItemId[item.id] ?? 0;
    const futureSeconds = getItemFutureSeconds(item, now, Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0);
    cursor += (futureSeconds ?? 0) * 1000;
    finishes[item.id] = { estimatedFinishAt: execution?.estimatedFinishAt ?? iso(cursor), state: "estimated" };
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
    const execution = getOnTimeExecutionTiming(item.execution, input.now);
    if (!execution && (item.plannedSeconds === null || !Number.isFinite(item.plannedSeconds) || item.plannedSeconds < 0)) {
      missing.push(item.id);
      continue;
    }
    const elapsed = input.elapsedSecondsByItemId?.[item.id] ?? 0;
    remaining += getItemFutureSeconds(item, input.now, Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0) ?? 0;
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
