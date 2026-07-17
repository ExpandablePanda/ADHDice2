import type { ChildTaskPreview } from "@/lib/task-app-derived";

export type ChildTaskPreviewVisibility = {
  collapsibleTaskIds: Set<string>;
  visibleItems: ChildTaskPreview[];
};

/** Keeps matching Steps/Substeps plus only their ancestor context. */
export function filterChildTaskPreviewItemsToMatchingHierarchy(
  items: readonly ChildTaskPreview[],
  matchingTaskIds: ReadonlySet<string>,
) {
  if (matchingTaskIds.size === 0) {
    return [] as ChildTaskPreview[];
  }

  const includedTaskIds = new Set<string>();
  const ancestorStack: ChildTaskPreview[] = [];
  for (const item of items) {
    while (ancestorStack.length > 0 && ancestorStack[ancestorStack.length - 1]!.depth >= item.depth) {
      ancestorStack.pop();
    }
    if (matchingTaskIds.has(item.id)) {
      for (const ancestor of ancestorStack) includedTaskIds.add(ancestor.id);
      includedTaskIds.add(item.id);
    }
    ancestorStack.push(item);
  }

  return items.filter((item) => includedTaskIds.has(item.id));
}

export function buildChildTaskPreviewVisibility(
  items: readonly ChildTaskPreview[],
  collapsedTaskIds: ReadonlySet<string>,
): ChildTaskPreviewVisibility {
  const collapsibleTaskIds = new Set<string>();
  for (const item of items) {
    if (item.parentTaskId) {
      collapsibleTaskIds.add(item.parentTaskId);
    }
  }

  const visibleItems: ChildTaskPreview[] = [];
  const ancestorStack: ChildTaskPreview[] = [];

  for (const item of items) {
    while (ancestorStack.length > 0 && ancestorStack[ancestorStack.length - 1]!.depth >= item.depth) {
      ancestorStack.pop();
    }

    const hiddenByCollapsedAncestor = ancestorStack.some((ancestor) => collapsedTaskIds.has(ancestor.id));
    if (!hiddenByCollapsedAncestor) {
      visibleItems.push(item);
    }

    ancestorStack.push(item);
  }

  return {
    collapsibleTaskIds,
    visibleItems,
  };
}
