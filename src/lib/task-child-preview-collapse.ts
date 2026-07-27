import type { ChildTaskPreview } from "@/lib/task-app-derived";

export type ChildTaskPreviewVisibility = {
  collapsibleTaskIds: Set<string>;
  visibleItems: ChildTaskPreview[];
};

export type ChildTaskPreviewStepGroups = {
  completedItems: ChildTaskPreview[];
  completedStepCount: number;
  normalItems: ChildTaskPreview[];
};

/**
 * Partitions direct Step branches without changing preorder hierarchy.
 * Every Substep follows its owning direct Step, regardless of its own status.
 */
export function groupChildTaskPreviewItemsByStoredCompletion(
  items: readonly ChildTaskPreview[],
): ChildTaskPreviewStepGroups {
  const completedItems: ChildTaskPreview[] = [];
  const normalItems: ChildTaskPreview[] = [];
  const itemById = new Map(items.map((item) => [item.id, item]));
  const completedStepIds = new Set(
    items
      .filter((item) => item.depth === 1 && item.storedStatus === "complete")
      .map((item) => item.id),
  );

  for (const item of items) {
    let owningStep = item;
    const visitedTaskIds = new Set<string>();
    while (owningStep.depth > 1 && owningStep.parentTaskId && !visitedTaskIds.has(owningStep.id)) {
      visitedTaskIds.add(owningStep.id);
      const parent = itemById.get(owningStep.parentTaskId);
      if (!parent) break;
      owningStep = parent;
    }
    const targetItems = owningStep.depth === 1 && completedStepIds.has(owningStep.id)
      ? completedItems
      : normalItems;
    targetItems.push(item);
  }

  return {
    completedItems,
    completedStepCount: completedStepIds.size,
    normalItems,
  };
}

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
