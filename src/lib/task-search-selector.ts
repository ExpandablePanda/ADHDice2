import type { Task, TaskStatus } from "@/lib/database.types";
import { isArchiveLikeTask } from "@/lib/task-complete";
import { isTaskVisibleInPrimaryViews } from "@/lib/task-buckets";
import { isTaskInRecentTrash } from "@/lib/task-trash";
import type { TaskQuickFilter, TaskTableColumnFilters } from "@/lib/task-ui-state";

export type TaskSearchEntity = {
  ancestorIds: readonly string[];
  displayStatus: TaskStatus;
  id: string;
  listIds: readonly string[];
  rootParentId: string;
  searchDocument: string;
  task: Task;
};

export type StableTaskSearchScope = {
  eligibleEntityIds: ReadonlySet<string>;
  entitiesById: ReadonlyMap<string, TaskSearchEntity>;
  hierarchyById: ReadonlyMap<string, Pick<TaskSearchEntity, "ancestorIds" | "rootParentId">>;
};

export type TaskSearchQueryResult = {
  ancestorContextIds: ReadonlySet<string>;
  matchingEntityIds: ReadonlySet<string>;
  matchingStepIds: ReadonlySet<string>;
  visibleRootTaskIds: readonly string[];
  highlightNavigationIds: readonly string[];
};

export type TaskSearchScopeFilters = {
  energyFilters: readonly Task["energy"][];
  focusedTaskIds: readonly string[];
  matchAny: boolean;
  quickFilters: readonly TaskQuickFilter[];
  listNameById?: ReadonlyMap<string, string>;
  selectedBucket: string;
  statusFilters: readonly TaskStatus[];
  tableColumnFilters: TaskTableColumnFilters;
};

function hasTrashedAncestor(entity: TaskSearchEntity, entitiesById: ReadonlyMap<string, TaskSearchEntity>) {
  return entity.ancestorIds.some((ancestorId) => entitiesById.get(ancestorId)?.task.status === "trashed");
}

function matchesQuickFilter(task: Task, filter: TaskQuickFilter, focusedTaskIds: ReadonlySet<string>) {
  if (filter === "active") return task.status !== "complete" && task.status !== "archived" && task.status !== "trashed";
  if (filter === "done") return task.status === "done" || task.status === "complete";
  if (filter === "urgent") return task.is_urgent;
  if (filter === "focused") return focusedTaskIds.has(task.id);
  return task.due_on !== null;
}

function matchesTableFilters(task: Task, filters: TaskTableColumnFilters, listIds: readonly string[] = [], listNameById?: ReadonlyMap<string, string>) {
  if (filters.priority.length > 0 && !filters.priority.includes(task.priority)) return false;
  if (filters.repeat.length > 0 && !filters.repeat.includes(task.repeat_frequency)) return false;
  return Object.entries(filters.text).every(([columnId, query]) => {
    const normalized = query?.trim().toLowerCase();
    if (!normalized) return true;
    const value = columnId === "title"
      ? task.title
      : columnId === "lists"
        ? listIds.map((listId) => listNameById?.get(listId) ?? listId).join(" ")
      : columnId === "tags"
        ? (task.tags ?? []).join(" ")
        : columnId === "link"
          ? [task.external_link_label, task.external_link_url].filter(Boolean).join(" ")
          : columnId === "notes" ? task.notes ?? "" : "";
    return value.toLowerCase().includes(normalized);
  });
}

function isInSelectedBucket(entity: TaskSearchEntity, filters: TaskSearchScopeFilters, entitiesById: ReadonlyMap<string, TaskSearchEntity>) {
  const { task } = entity;
  if (filters.selectedBucket === "trash") return isTaskInRecentTrash(task);
  if (filters.selectedBucket === "archive") return isArchiveLikeTask(task);
  if (task.status === "trashed" || hasTrashedAncestor(entity, entitiesById)) return false;
  if (filters.selectedBucket === "all") return isTaskVisibleInPrimaryViews(task);
  if (filters.selectedBucket === "pinned") return isTaskVisibleInPrimaryViews(task) && Boolean(task.pinned_at);
  return isTaskVisibleInPrimaryViews(task) && entity.listIds.includes(filters.selectedBucket);
}

export function buildStableTaskSearchScope(
  entities: readonly TaskSearchEntity[],
  filters: TaskSearchScopeFilters,
): StableTaskSearchScope {
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  const focusedTaskIds = new Set(filters.focusedTaskIds);
  const eligibleEntityIds = new Set<string>();
  for (const entity of entities) {
    if (!isInSelectedBucket(entity, filters, entitiesById)) continue;
    const quickChecks = filters.quickFilters.map((filter) => matchesQuickFilter(entity.task, filter, focusedTaskIds));
    const matchesQuick = quickChecks.length === 0 || (filters.matchAny ? quickChecks.some(Boolean) : quickChecks.every(Boolean));
    if (!matchesQuick) continue;
    if (filters.energyFilters.length > 0 && !filters.energyFilters.includes(entity.task.energy)) continue;
    if (!matchesTableFilters(entity.task, filters.tableColumnFilters, entity.listIds, filters.listNameById)) continue;
    if (filters.statusFilters.length > 0 && !filters.statusFilters.includes(entity.displayStatus)) continue;
    eligibleEntityIds.add(entity.id);
  }
  return {
    eligibleEntityIds,
    entitiesById,
    hierarchyById: new Map(entities.map((entity) => [entity.id, entity])),
  };
}

export function queryTaskSearch(
  normalizedQuery: string,
  scope: StableTaskSearchScope,
  includeSteps: boolean,
): TaskSearchQueryResult {
  const matchingEntityIds = new Set<string>();
  const matchingStepIds = new Set<string>();
  const ancestorContextIds = new Set<string>();
  const query = normalizedQuery.trim().toLowerCase();
  for (const id of scope.eligibleEntityIds) {
    const entity = scope.entitiesById.get(id);
    if (!entity || (query.length > 0 && !entity.searchDocument.includes(query))) continue;
    matchingEntityIds.add(id);
  }
  const directlyMatchingIds = new Set(matchingEntityIds);
  if (includeSteps && directlyMatchingIds.size > 0) {
    const matchingRootIds = new Set(
      Array.from(directlyMatchingIds)
        .map((id) => scope.hierarchyById.get(id)?.rootParentId ?? id),
    );
    for (const id of scope.eligibleEntityIds) {
      const entity = scope.hierarchyById.get(id);
      if (entity && matchingRootIds.has(entity.rootParentId)) matchingEntityIds.add(id);
    }
  }
  for (const id of matchingEntityIds) {
    const entity = scope.hierarchyById.get(id);
    if (!entity) continue;
    for (const ancestorId of entity.ancestorIds) ancestorContextIds.add(ancestorId);
    if (entity.rootParentId !== id) matchingStepIds.add(id);
  }
  const visibleRootTaskIds = Array.from(new Set(
    Array.from(matchingEntityIds).map((id) => scope.hierarchyById.get(id)?.rootParentId ?? id),
  )).filter((id) => includeSteps || matchingEntityIds.has(id));
  const highlightNavigationIds = Array.from(matchingEntityIds);
  return { ancestorContextIds, matchingEntityIds, matchingStepIds, visibleRootTaskIds, highlightNavigationIds };
}

export function shouldRunTaskSearch(activePage: string) {
  return activePage === "Tasks";
}
