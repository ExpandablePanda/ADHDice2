import type { ChildTaskPreview } from "@/lib/task-app-derived";

export type ChildTaskPreviewVisibility = {
  collapsibleTaskIds: Set<string>;
  visibleItems: ChildTaskPreview[];
};

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
