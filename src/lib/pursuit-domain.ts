import type { Pursuit, PursuitActivity, PursuitStatus, Task } from "@/lib/database.types";
import { getLogicalDayKey } from "@/lib/logical-day";
import { daysBetween, shiftDateKey } from "@/lib/task-state-engine/calendar";

export type PursuitAttention = {
  activityCount: number;
  attentionRatio: number | null;
  baselineAt: string;
  baselineKind: "activity" | "created";
  daysSinceBaseline: number;
  lastActivityAt: string | null;
  needsAttention: boolean;
  completionSummary: PursuitCompletionSummary;
  pursuit: Pursuit;
};

export type PursuitAttentionContext = {
  dayStartTime: string;
  now: Date | string;
  timezone: string;
  todayKey?: string;
};

export type PursuitWorkspaceRow = {
  depth: number;
  pursuit: Pursuit;
};

export type PursuitWorkspaceIndex = {
  byTaskId: ReadonlyMap<string, PursuitWorkspaceRow[]>;
  topLevel: PursuitWorkspaceRow[];
};

export type PursuitCompletionContext = Pick<PursuitAttentionContext, "dayStartTime" | "timezone"> & {
  now?: Date | string;
  todayKey?: string;
};

export type PursuitCompletionSummary = {
  bestStreak: number;
  completedToday: boolean;
  completedLogicalDays: string[];
  currentStreak: number;
  daysSinceCompletion: number | null;
  lastCompletedLogicalDay: string | null;
  totalCompletedDays: number;
};

export function filterPursuitsByTitle(pursuits: ReadonlyArray<Pursuit>, query: string): Pursuit[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...pursuits];

  const byId = new Map(pursuits.map((pursuit) => [pursuit.id, pursuit]));
  const visibleIds = new Set(
    pursuits
      .filter((pursuit) => pursuit.title.toLocaleLowerCase().includes(normalizedQuery))
      .map((pursuit) => pursuit.id),
  );

  for (const pursuit of pursuits.filter((candidate) => visibleIds.has(candidate.id))) {
    let parentId = pursuit.parent_pursuit_id;
    const visited = new Set<string>();
    while (parentId) {
      if (visited.has(parentId) || !byId.has(parentId)) break;
      visited.add(parentId);
      visibleIds.add(parentId);
      parentId = byId.get(parentId)?.parent_pursuit_id ?? null;
    }
  }

  return pursuits.filter((pursuit) => visibleIds.has(pursuit.id));
}

function addPursuitDescendants(
  pursuits: ReadonlyArray<Pursuit>,
  parentIds: ReadonlySet<string>,
  visibleIds: Set<string>,
) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const pursuit of pursuits) {
      if (pursuit.parent_pursuit_id && parentIds.has(pursuit.parent_pursuit_id) && !visibleIds.has(pursuit.id)) {
        visibleIds.add(pursuit.id);
        parentIds = new Set([...parentIds, pursuit.id]);
        changed = true;
      }
    }
  }
}

/**
 * Filters the Pursuit projection while preserving Task-match hierarchy context.
 * The Task match IDs are presentation evidence only; Task search remains owned
 * by the canonical Task search projection.
 */
export function filterPursuitsForTaskWorkspace(
  pursuits: ReadonlyArray<Pursuit>,
  query: string,
  directlyMatchedTaskIds: ReadonlySet<string> = new Set(),
): Pursuit[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [...pursuits];

  const visibleIds = new Set(filterPursuitsByTitle(pursuits, normalizedQuery).map((pursuit) => pursuit.id));
  const taskOwnedRootIds = new Set(
    pursuits
      .filter((pursuit) => pursuit.parent_task_id !== null && directlyMatchedTaskIds.has(pursuit.parent_task_id))
      .map((pursuit) => pursuit.id),
  );
  for (const pursuitId of taskOwnedRootIds) visibleIds.add(pursuitId);
  addPursuitDescendants(pursuits, taskOwnedRootIds, visibleIds);
  return pursuits.filter((pursuit) => visibleIds.has(pursuit.id));
}

export function getPursuitSearchContextTaskIds(
  pursuits: ReadonlyArray<Pursuit>,
  query: string,
): string[] {
  if (!query.trim()) return [];

  return Array.from(new Set(
    filterPursuitsByTitle(pursuits, query)
      .map((pursuit) => pursuit.parent_task_id)
      .filter((taskId): taskId is string => taskId !== null),
  ));
}

export function mergeTaskRowsWithPursuitSearchContext(
  tasks: ReadonlyArray<Task>,
  contextTasks: ReadonlyArray<Task>,
): Task[] {
  const taskIds = new Set(tasks.map((task) => task.id));
  return [
    ...tasks,
    ...contextTasks.filter((task) => {
      if (taskIds.has(task.id)) return false;
      taskIds.add(task.id);
      return true;
    }),
  ];
}

export function shouldRenderTaskPursuitChildren(
  isTaskHierarchyExpanded: boolean,
  pursuitRows: ReadonlyArray<PursuitWorkspaceRow>,
) {
  return isTaskHierarchyExpanded && pursuitRows.length > 0;
}

export function getMostRecentPursuitActivity(
  activities: ReadonlyArray<PursuitActivity>,
): PursuitActivity | null {
  return [...activities]
    .filter((activity) => Boolean(activity.occurred_at))
    .sort((left, right) => (
      right.occurred_at.localeCompare(left.occurred_at)
      || right.created_at.localeCompare(left.created_at)
      || right.id.localeCompare(left.id)
    ))[0] ?? null;
}

export function getPursuitLogicalDay(
  timestamp: Date | string,
  context: Pick<PursuitAttentionContext, "dayStartTime" | "timezone">,
) {
  return getLogicalDayKey(
    timestamp instanceof Date ? timestamp : new Date(timestamp),
    { dayStartTime: context.dayStartTime, timezone: context.timezone },
  );
}

function getPursuitCompletionDayKeys(
  activities: ReadonlyArray<PursuitActivity>,
  context: PursuitCompletionContext,
) {
  const todayKey = context.todayKey ?? getPursuitLogicalDay(context.now ?? new Date(), context);
  return Array.from(new Set(
    activities
      .filter((activity) => Boolean(activity.occurred_at))
      .map((activity) => getPursuitLogicalDay(activity.occurred_at, context))
      .filter((dayKey) => dayKey <= todayKey),
  )).sort();
}

export function derivePursuitCompletionSummary(
  activities: ReadonlyArray<PursuitActivity>,
  context: PursuitCompletionContext,
): PursuitCompletionSummary {
  const todayKey = context.todayKey ?? getPursuitLogicalDay(context.now ?? new Date(), context);
  const completedLogicalDays = getPursuitCompletionDayKeys(activities, { ...context, todayKey });
  const completedDaySet = new Set(completedLogicalDays);
  const lastCompletedLogicalDay = completedLogicalDays.at(-1) ?? null;
  const currentStart = completedDaySet.has(todayKey)
    ? todayKey
    : completedDaySet.has(shiftDateKey(todayKey, -1))
      ? shiftDateKey(todayKey, -1)
      : null;
  let currentStreak = 0;
  if (currentStart) {
    for (let cursor = currentStart; completedDaySet.has(cursor); cursor = shiftDateKey(cursor, -1)) {
      currentStreak += 1;
    }
  }

  let bestStreak = 0;
  let runningStreak = 0;
  let previousDay: string | null = null;
  for (const dayKey of completedLogicalDays) {
    runningStreak = previousDay && shiftDateKey(previousDay, 1) === dayKey ? runningStreak + 1 : 1;
    bestStreak = Math.max(bestStreak, runningStreak);
    previousDay = dayKey;
  }

  return {
    bestStreak,
    completedToday: completedDaySet.has(todayKey),
    completedLogicalDays,
    currentStreak,
    daysSinceCompletion: lastCompletedLogicalDay ? Math.max(0, daysBetween(lastCompletedLogicalDay, todayKey)) : null,
    lastCompletedLogicalDay,
    totalCompletedDays: completedLogicalDays.length,
  };
}

export function buildPursuitCompletionSummaryMap(
  pursuits: ReadonlyArray<Pursuit>,
  activities: ReadonlyArray<PursuitActivity>,
  context: PursuitCompletionContext,
) {
  const activitiesByPursuitId = new Map<string, PursuitActivity[]>();
  for (const activity of activities) {
    const current = activitiesByPursuitId.get(activity.pursuit_id) ?? [];
    current.push(activity);
    activitiesByPursuitId.set(activity.pursuit_id, current);
  }
  return new Map(
    pursuits.map((pursuit) => [
      pursuit.id,
      derivePursuitCompletionSummary(activitiesByPursuitId.get(pursuit.id) ?? [], context),
    ]),
  );
}

export function formatPursuitLastCompletion(summary: PursuitCompletionSummary) {
  if (summary.lastCompletedLogicalDay === null) return "Never done";
  if (summary.daysSinceCompletion === 0) return "Done today";
  if (summary.daysSinceCompletion === 1) return "Last done yesterday";
  return `Last done ${summary.daysSinceCompletion} days ago`;
}

export function getPursuitTimestampForLogicalDay(
  logicalDay: string,
  context: Pick<PursuitCompletionContext, "dayStartTime" | "timezone">,
) {
  const [year, month, day] = logicalDay.split("-").map(Number);
  const [hour, minute] = context.dayStartTime.split(":").map(Number);
  const desiredLocalMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0) + 60_000;
  let candidate = new Date(desiredLocalMs);
  for (let index = 0; index < 3; index += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone: context.timezone,
      year: "numeric",
    }).formatToParts(candidate);
    const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    const actualLocalMs = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
    candidate = new Date(desiredLocalMs - (actualLocalMs - candidate.getTime()));
  }
  return candidate.toISOString();
}

export function derivePursuitAttention(
  pursuit: Pursuit,
  activities: ReadonlyArray<PursuitActivity>,
  context: PursuitAttentionContext,
): PursuitAttention {
  const completionSummary = derivePursuitCompletionSummary(activities, context);
  const recentActivity = completionSummary.lastCompletedLogicalDay
    ? getMostRecentPursuitActivity(activities.filter((activity) => (
      getPursuitLogicalDay(activity.occurred_at, context) === completionSummary.lastCompletedLogicalDay
    )))
    : null;
  const baselineAt = recentActivity?.occurred_at ?? pursuit.created_at;
  const baselineKind = recentActivity ? "activity" : "created";
  const todayKey = context.todayKey ?? getPursuitLogicalDay(context.now, context);
  const baselineDayKey = getPursuitLogicalDay(baselineAt, context);
  const daysSinceBaseline = Math.max(0, daysBetween(baselineDayKey, todayKey));
  const target = pursuit.revisit_interval_days;
  const needsAttention = pursuit.status === "active"
    && target !== null
    && target > 0
    && daysSinceBaseline > target;

  return {
    activityCount: activities.length,
    attentionRatio: needsAttention && target ? daysSinceBaseline / target : null,
    baselineAt,
    baselineKind,
    daysSinceBaseline,
    lastActivityAt: recentActivity?.occurred_at ?? null,
    needsAttention,
    completionSummary,
    pursuit,
  };
}

export function buildPursuitAttentionMap(
  pursuits: ReadonlyArray<Pursuit>,
  activities: ReadonlyArray<PursuitActivity>,
  context: PursuitAttentionContext,
) {
  const activitiesByPursuitId = new Map<string, PursuitActivity[]>();
  for (const activity of activities) {
    const current = activitiesByPursuitId.get(activity.pursuit_id) ?? [];
    current.push(activity);
    activitiesByPursuitId.set(activity.pursuit_id, current);
  }

  return new Map(
    pursuits.map((pursuit) => [
      pursuit.id,
      derivePursuitAttention(pursuit, activitiesByPursuitId.get(pursuit.id) ?? [], context),
    ]),
  );
}

export function sortPursuitsByAttention(rows: ReadonlyArray<PursuitAttention>) {
  return [...rows]
    .filter((row) => row.needsAttention && row.attentionRatio !== null)
    .sort((left, right) => (
      (right.attentionRatio ?? 0) - (left.attentionRatio ?? 0)
      || left.pursuit.title.localeCompare(right.pursuit.title)
      || left.pursuit.id.localeCompare(right.pursuit.id)
    ));
}

export function formatPursuitAttentionReason(row: PursuitAttention) {
  const daysLabel = `${row.daysSinceBaseline} day${row.daysSinceBaseline === 1 ? "" : "s"}`;
  const baselineLabel = row.baselineKind === "activity" ? "since completion" : "since created";
  const target = row.pursuit.revisit_interval_days;
  return target === null
    ? `${daysLabel} ${baselineLabel}`
    : `${daysLabel} ${baselineLabel} · target ${target} day${target === 1 ? "" : "s"}`;
}

export function formatPursuitLastActivity(row: PursuitAttention, timezone: string) {
  if (!row.completionSummary.lastCompletedLogicalDay) return "Never done";
  if (row.completionSummary.daysSinceCompletion === 0) return "Done today";
  return `Last done ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: timezone,
  }).format(new Date(`${row.completionSummary.lastCompletedLogicalDay}T12:00:00`))}`;
}

export function canSetPursuitParent(
  pursuits: ReadonlyArray<Pursuit>,
  pursuitId: string,
  parentPursuitId: string | null,
) {
  if (parentPursuitId === null) {
    return true;
  }
  if (pursuitId === parentPursuitId) {
    return false;
  }

  const byId = new Map(pursuits.map((pursuit) => [pursuit.id, pursuit]));
  const visited = new Set<string>();
  let cursor: string | null = parentPursuitId;
  while (cursor) {
    if (cursor === pursuitId || visited.has(cursor)) {
      return false;
    }
    visited.add(cursor);
    cursor = byId.get(cursor)?.parent_pursuit_id ?? null;
  }
  return byId.has(parentPursuitId);
}

export function validatePursuitParentSelection(
  pursuits: ReadonlyArray<Pursuit>,
  pursuitId: string,
  parentPursuitId: string | null,
  parentTaskId: string | null,
  ownedTaskIds?: ReadonlySet<string>,
) {
  if (parentPursuitId !== null && parentTaskId !== null) {
    return "A Pursuit can have a Pursuit parent or a Task parent, not both.";
  }
  if (parentTaskId !== null && ownedTaskIds && !ownedTaskIds.has(parentTaskId)) {
    return "That Task parent does not belong to this user or no longer exists.";
  }
  if (parentPursuitId !== null && !canSetPursuitParent(pursuits, pursuitId, parentPursuitId)) {
    return "A Pursuit cannot be its own parent or a child of its descendants.";
  }
  return null;
}

export function buildPursuitWorkspaceRows(
  pursuits: ReadonlyArray<Pursuit>,
  parentTaskId: string | null,
) {
  const byParentPursuitId = new Map<string | null, Pursuit[]>();
  for (const pursuit of pursuits) {
    const current = byParentPursuitId.get(pursuit.parent_pursuit_id) ?? [];
    current.push(pursuit);
    byParentPursuitId.set(pursuit.parent_pursuit_id, current);
  }

  const rows: PursuitWorkspaceRow[] = [];
  const visited = new Set<string>();
  const visit = (parentPursuitId: string | null, depth: number) => {
    const children = [...(byParentPursuitId.get(parentPursuitId) ?? [])].sort((left, right) => (
      left.sort_order - right.sort_order
      || left.title.localeCompare(right.title)
      || left.id.localeCompare(right.id)
    ));
    for (const pursuit of children) {
      if (visited.has(pursuit.id)) continue;
      visited.add(pursuit.id);
      rows.push({ depth, pursuit });
      visit(pursuit.id, depth + 1);
    }
  };

  const roots = [...(byParentPursuitId.get(null) ?? [])].filter((pursuit) => pursuit.parent_task_id === parentTaskId);
  for (const root of roots.sort((left, right) => (
    left.sort_order - right.sort_order
    || left.title.localeCompare(right.title)
    || left.id.localeCompare(right.id)
  ))) {
    if (visited.has(root.id)) continue;
    visited.add(root.id);
    rows.push({ depth: 0, pursuit: root });
    visit(root.id, 1);
  }
  return rows;
}

export function buildPursuitWorkspaceIndex(pursuits: ReadonlyArray<Pursuit>): PursuitWorkspaceIndex {
  const byTaskId = new Map<string, PursuitWorkspaceRow[]>();
  const topLevel = buildPursuitWorkspaceRows(pursuits, null);
  const taskIds = new Set(pursuits.map((pursuit) => pursuit.parent_task_id).filter((id): id is string => id !== null));
  for (const taskId of taskIds) {
    byTaskId.set(taskId, buildPursuitWorkspaceRows(pursuits, taskId));
  }
  return { byTaskId, topLevel };
}

export function getPursuitDepth(
  pursuit: Pursuit,
  pursuitsById: ReadonlyMap<string, Pursuit>,
) {
  let depth = 0;
  let cursor = pursuit.parent_pursuit_id;
  const visited = new Set<string>();
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    depth += 1;
    cursor = pursuitsById.get(cursor)?.parent_pursuit_id ?? null;
  }
  return depth;
}

export function sortPursuitsForManagement(pursuits: ReadonlyArray<Pursuit>) {
  const byParent = new Map<string | null, Pursuit[]>();
  for (const pursuit of pursuits) {
    const current = byParent.get(pursuit.parent_pursuit_id) ?? [];
    current.push(pursuit);
    byParent.set(pursuit.parent_pursuit_id, current);
  }
  const result: Pursuit[] = [];
  const visited = new Set<string>();
  const visit = (parentId: string | null) => {
    const children = [...(byParent.get(parentId) ?? [])].sort((left, right) => (
      left.sort_order - right.sort_order
      || left.title.localeCompare(right.title)
      || left.id.localeCompare(right.id)
    ));
    for (const child of children) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      result.push(child);
      visit(child.id);
    }
  };
  visit(null);
  for (const pursuit of pursuits) {
    if (!result.some((entry) => entry.id === pursuit.id)) {
      result.push(pursuit);
    }
  }
  return result;
}

export function isPursuitStatus(value: unknown): value is PursuitStatus {
  return value === "active" || value === "paused" || value === "archived";
}
