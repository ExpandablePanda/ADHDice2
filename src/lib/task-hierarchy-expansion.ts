export type RenderedTaskHierarchyExpansion = {
  expanded: boolean;
  taskId: string;
};

export function shouldExpandAllTaskHierarchies(groups: readonly RenderedTaskHierarchyExpansion[]) {
  return groups.some((group) => !group.expanded);
}
