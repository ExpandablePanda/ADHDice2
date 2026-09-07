import type { Pursuit, PursuitActivity, PursuitStatus, Task } from "@/lib/database.types";
import { getLogicalDayKey } from "@/lib/logical-day";
import { daysBetween } from "@/lib/task-state-engine/calendar";

export type PursuitAttention = {
  activityCount: number;
  attentionRatio: number | null;
  baselineAt: string;
  baselineKind: "activity" | "created";
  daysSinceBaseline: number;
  lastActivityAt: string | null;
  needsAttention: boolean;
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

export function derivePursuitAttention(
  pursuit: Pursuit,
  activities: ReadonlyArray<PursuitActivity>,
  context: PursuitAttentionContext,
): PursuitAttention {
  const recentActivity = getMostRecentPursuitActivity(activities);
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
  const baselineLabel = row.baselineKind === "activity" ? "since activity" : "since created";
  const target = row.pursuit.revisit_interval_days;
  return target === null
    ? `${daysLabel} ${baselineLabel}`
    : `${daysLabel} ${baselineLabel} · target ${target} day${target === 1 ? "" : "s"}`;
}

export function formatPursuitLastActivity(row: PursuitAttention, timezone: string) {
  if (!row.lastActivityAt) {
    return "No activity yet";
  }
  return `Last activity ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: timezone,
  }).format(new Date(row.lastActivityAt))}`;
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
