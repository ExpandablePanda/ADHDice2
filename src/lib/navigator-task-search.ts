import type { TaskSearchEntity } from "@/lib/task-search-selector";
import type { NavigatorSearchTarget } from "@/lib/navigator-search";

function normalizeTaskSearchText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function hasTrashedAncestor(entity: TaskSearchEntity, entitiesById: ReadonlyMap<string, TaskSearchEntity>) {
  return entity.ancestorIds.some((ancestorId) => entitiesById.get(ancestorId)?.task.status === "trashed");
}

function isEligibleGlobalTask(entity: TaskSearchEntity, entitiesById: ReadonlyMap<string, TaskSearchEntity>) {
  return entity.task.status !== "trashed"
    && !entity.task.permanently_deleted_at
    && !hasTrashedAncestor(entity, entitiesById);
}

function getTaskBreadcrumb(entity: TaskSearchEntity, entitiesById: ReadonlyMap<string, TaskSearchEntity>) {
  const ancestors = entity.ancestorIds
    .map((ancestorId) => entitiesById.get(ancestorId)?.task.title.trim())
    .filter((title): title is string => Boolean(title));
  return ancestors.length > 0 ? ancestors : ["Tasks"];
}

function getTaskMatchRank(entity: TaskSearchEntity, normalizedQuery: string) {
  const title = normalizeTaskSearchText(entity.task.title);
  if (title === normalizedQuery) return 0;
  if (title.startsWith(normalizedQuery)) return 1;
  if (title.includes(normalizedQuery)) return 2;
  return entity.searchDocument.toLocaleLowerCase().includes(normalizedQuery) ? 3 : Number.POSITIVE_INFINITY;
}

/** Search the canonical task hierarchy without selected-list or view eligibility filters. */
export function searchNavigatorTasks(query: string, entities: readonly TaskSearchEntity[]): NavigatorSearchTarget[] {
  const normalizedQuery = normalizeTaskSearchText(query);
  if (!normalizedQuery) return [];

  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  return entities
    .map((entity, index) => ({
      entity,
      index,
      rank: isEligibleGlobalTask(entity, entitiesById) ? getTaskMatchRank(entity, normalizedQuery) : Number.POSITIVE_INFINITY,
    }))
    .filter((entry) => Number.isFinite(entry.rank))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ entity }) => ({
      action: { kind: "task", page: "Tasks", taskId: entity.id },
      breadcrumb: getTaskBreadcrumb(entity, entitiesById),
      id: `task-${entity.id}`,
      page: "Tasks",
      title: entity.task.title.trim() || "Untitled task",
    }));
}
