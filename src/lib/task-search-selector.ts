import type { Task, TaskStatus } from "@/lib/database.types";
import { isArchiveLikeTask } from "@/lib/task-complete";
import { isTaskVisibleInPrimaryViews } from "@/lib/task-buckets";
import { getTaskRepeatCategory } from "@/lib/task-repeat";
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
  primaryFacetEligibleEntityIds: ReadonlySet<string>;
  selectedBucket: string;
  selectedScopeEligibleEntityIds: ReadonlySet<string>;
  statusFilters: readonly TaskStatus[];
  /** @deprecated Use selectedScopeEligibleEntityIds. */
  eligibleEntityIds: ReadonlySet<string>;
  entitiesById: ReadonlyMap<string, TaskSearchEntity>;
  hierarchyById: ReadonlyMap<string, Pick<TaskSearchEntity, "ancestorIds" | "rootParentId">>;
};

export type TaskSearchQueryResult = {
  ancestorContextIds: ReadonlySet<string>;
  contextRootParentIds: ReadonlySet<string>;
  directSearchMatchedEntityIds: ReadonlySet<string>;
  listFacetCounts: Readonly<Record<string, number>>;
  matchingDescendantIdsByRootParentId: ReadonlyMap<string, ReadonlySet<string>>;
  matchingEntityIds: ReadonlySet<string>;
  matchingStepIds: ReadonlySet<string>;
  primaryFacetVisibleEntityIds: ReadonlySet<string>;
  searchExpandedDescendantIds: ReadonlySet<string>;
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
  if (
    filters.repeat.length > 0
    && !filters.repeat.includes(getTaskRepeatCategory(task.repeat_frequency, task.repeat_days_of_week, task.repeat_interval))
  ) return false;
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

function isEligibleSelectedScopeDescendant(entity: TaskSearchEntity, filters: TaskSearchScopeFilters, entitiesById: ReadonlyMap<string, TaskSearchEntity>) {
  return filters.selectedBucket === "trash"
    || (entity.task.status !== "trashed" && !hasTrashedAncestor(entity, entitiesById));
}

function isInPrimaryFacetScope(entity: TaskSearchEntity, entitiesById: ReadonlyMap<string, TaskSearchEntity>) {
  return entity.task.status !== "trashed"
    && !hasTrashedAncestor(entity, entitiesById)
    && isTaskVisibleInPrimaryViews(entity.task);
}

function matchesScopeFilters(
  entity: TaskSearchEntity,
  filters: TaskSearchScopeFilters,
  focusedTaskIds: ReadonlySet<string>,
  options: { ignoreStatus?: boolean } = {},
) {
  const quickChecks = filters.quickFilters.map((filter) => matchesQuickFilter(entity.task, filter, focusedTaskIds));
  const matchesQuick = quickChecks.length === 0 || (filters.matchAny ? quickChecks.some(Boolean) : quickChecks.every(Boolean));
  return matchesQuick
    && (filters.energyFilters.length === 0 || filters.energyFilters.includes(entity.task.energy))
    && matchesTableFilters(entity.task, filters.tableColumnFilters, entity.listIds, filters.listNameById)
    && (options.ignoreStatus === true || filters.statusFilters.length === 0 || filters.statusFilters.includes(entity.displayStatus));
}

export function buildStableTaskSearchScope(
  entities: readonly TaskSearchEntity[],
  filters: TaskSearchScopeFilters,
): StableTaskSearchScope {
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  const focusedTaskIds = new Set(filters.focusedTaskIds);
  const selectedScopeEligibleEntityIds = new Set<string>();
  const selectedScopeRootIds = new Set<string>();
  const primaryFacetEligibleEntityIds = new Set<string>();
  const isPinnedBucket = filters.selectedBucket === "pinned";
  for (const entity of entities) {
    if (!matchesScopeFilters(entity, filters, focusedTaskIds, { ignoreStatus: true })) continue;
    if (isInSelectedBucket(entity, filters, entitiesById)) {
      selectedScopeEligibleEntityIds.add(entity.id);
      if (!isPinnedBucket && entity.id === entity.rootParentId) selectedScopeRootIds.add(entity.id);
    }
    if (isInPrimaryFacetScope(entity, entitiesById)) primaryFacetEligibleEntityIds.add(entity.id);
  }
  for (const entity of entities) {
    if (
      !isPinnedBucket
      && !selectedScopeEligibleEntityIds.has(entity.id)
      && selectedScopeRootIds.has(entity.rootParentId)
      && isEligibleSelectedScopeDescendant(entity, filters, entitiesById)
      && matchesScopeFilters(entity, filters, focusedTaskIds, { ignoreStatus: true })
    ) {
      selectedScopeEligibleEntityIds.add(entity.id);
    }
  }
  return {
    eligibleEntityIds: selectedScopeEligibleEntityIds,
    entitiesById,
    hierarchyById: new Map(entities.map((entity) => [entity.id, entity])),
    primaryFacetEligibleEntityIds,
    selectedBucket: filters.selectedBucket,
    selectedScopeEligibleEntityIds,
    statusFilters: filters.statusFilters,
  };
}

export function queryTaskSearch(
  normalizedQuery: string,
  scope: StableTaskSearchScope,
  includeSteps: boolean,
): TaskSearchQueryResult {
  const matchingEntityIds = new Set<string>();
  const ancestorContextIds = new Set<string>();
  const query = normalizedQuery.trim().toLowerCase();
  const matchesSelectedStatus = (entity: TaskSearchEntity) => (
    scope.statusFilters.length === 0 || scope.statusFilters.includes(entity.displayStatus)
  );
  for (const id of scope.selectedScopeEligibleEntityIds) {
    const entity = scope.entitiesById.get(id);
    if (!entity || !matchesSelectedStatus(entity) || (query.length > 0 && !entity.searchDocument.includes(query))) continue;
    matchingEntityIds.add(id);
  }
  const directlyMatchingIds = new Set(matchingEntityIds);
  const directSearchMatchedEntityIds = new Set(directlyMatchingIds);
  const searchExpandedDescendantIds = new Set<string>();
  const matchedHierarchyEntityIds = new Set(directlyMatchingIds);
  if (includeSteps && directlyMatchingIds.size > 0 && scope.selectedBucket !== "pinned") {
    const directlyMatchingRootIds = new Set(
      Array.from(directlyMatchingIds)
        .filter((id) => (scope.hierarchyById.get(id)?.rootParentId ?? id) === id),
    );
    for (const id of scope.selectedScopeEligibleEntityIds) {
      const entity = scope.hierarchyById.get(id);
      if (
        entity
        && matchesSelectedStatus(entity)
        && entity.id !== entity.rootParentId
        && directlyMatchingRootIds.has(entity.rootParentId)
      ) {
        matchingEntityIds.add(id);
        matchedHierarchyEntityIds.add(id);
        searchExpandedDescendantIds.add(id);
      }
    }
  }
  if (query.length > 0) {
    for (const id of directlyMatchingIds) {
      const entity = scope.hierarchyById.get(id);
      if (!entity) continue;
      for (const ancestorId of entity.ancestorIds) matchingEntityIds.add(ancestorId);
    }
  }
  const matchingDescendantIdsByRootParentId = new Map<string, Set<string>>();
  const visibleRootParentIds = new Set<string>();
  for (const id of matchedHierarchyEntityIds) {
    const entity = scope.hierarchyById.get(id);
    if (!entity) continue;
    visibleRootParentIds.add(entity.rootParentId);
    if (entity.id !== entity.rootParentId) {
      const descendantIds = matchingDescendantIdsByRootParentId.get(entity.rootParentId) ?? new Set<string>();
      descendantIds.add(entity.id);
      matchingDescendantIdsByRootParentId.set(entity.rootParentId, descendantIds);
    }
    for (const ancestorId of entity.ancestorIds) ancestorContextIds.add(ancestorId);
  }
  const contextRootParentIds = new Set(
    Array.from(visibleRootParentIds).filter((rootId) => (
      !directSearchMatchedEntityIds.has(rootId)
      && (matchingDescendantIdsByRootParentId.get(rootId)?.size ?? 0) > 0
    )),
  );
  const matchingStepIds = new Set<string>();
  for (const id of matchedHierarchyEntityIds) {
    const entity = scope.hierarchyById.get(id);
    if (!entity) continue;
    if (entity.rootParentId !== id) matchingStepIds.add(id);
  }
  const visibleRootTaskIds = Array.from(visibleRootParentIds).filter((id) => (
    query.length > 0 || includeSteps || matchingEntityIds.has(id) || scope.selectedBucket === "pinned"
  ));
  const primaryDirectMatchIds = new Set<string>();
  for (const id of scope.primaryFacetEligibleEntityIds) {
    const entity = scope.entitiesById.get(id);
    if (entity && matchesSelectedStatus(entity) && (query.length === 0 || entity.searchDocument.includes(query))) primaryDirectMatchIds.add(id);
  }
  const primaryFacetVisibleEntityIds = new Set<string>();
  if (includeSteps) {
    const directlyMatchingRootIds = new Set(
      Array.from(primaryDirectMatchIds)
        .filter((id) => (scope.hierarchyById.get(id)?.rootParentId ?? id) === id),
    );
    for (const id of scope.primaryFacetEligibleEntityIds) {
      const entity = scope.hierarchyById.get(id);
      if (
        entity
        && matchesSelectedStatus(entity)
        && (
          primaryDirectMatchIds.has(id)
          || (entity.id !== entity.rootParentId && directlyMatchingRootIds.has(entity.rootParentId))
        )
      ) primaryFacetVisibleEntityIds.add(id);
    }
  } else {
    for (const id of primaryDirectMatchIds) {
      const entity = scope.hierarchyById.get(id);
      if (entity && entity.rootParentId === id) primaryFacetVisibleEntityIds.add(id);
    }
  }
  const pinnedFacetVisibleEntityIds = new Set(
    Array.from(scope.primaryFacetEligibleEntityIds).filter((id) => {
      const entity = scope.entitiesById.get(id);
      return Boolean(
        entity
        && entity.task.pinned_at
        && matchesSelectedStatus(entity)
        && (query.length === 0 || entity.searchDocument.includes(query)),
      );
    }),
  );
  const listFacetCounts: Record<string, number> = {
    all: primaryFacetVisibleEntityIds.size,
    pinned: pinnedFacetVisibleEntityIds.size,
  };
  for (const id of primaryFacetVisibleEntityIds) {
    const entity = scope.entitiesById.get(id);
    if (!entity) continue;
    for (const listId of entity.listIds) listFacetCounts[listId] = (listFacetCounts[listId] ?? 0) + 1;
  }
  const highlightNavigationIds = Array.from(matchingEntityIds);
  return {
    ancestorContextIds,
    contextRootParentIds,
    directSearchMatchedEntityIds,
    highlightNavigationIds,
    listFacetCounts,
    matchingDescendantIdsByRootParentId,
    matchingEntityIds,
    matchingStepIds,
    primaryFacetVisibleEntityIds,
    searchExpandedDescendantIds,
    visibleRootTaskIds,
  };
}

export function shouldRunTaskSearch(activePage: string) {
  return activePage === "Tasks";
}
