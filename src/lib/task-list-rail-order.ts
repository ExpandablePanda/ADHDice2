export type TaskListRailSiblingDropIntent = "after" | "before";

export type TaskListRailMutationGeneration = {
  generationId: number;
  isCurrent: () => boolean;
  onResult?: (result: "ordinary-error" | "stale-conflict" | "success") => void;
};

export type TaskListRailSiblingMove = {
  destinationIndex: number | null;
  finalStructuralKeys: string[];
  invalidReason: "missing-source" | "missing-target" | "source-is-target" | null;
  reducedStructuralKeys: string[];
  reducedTargetIndex: number | null;
  samePosition: boolean;
  sourceRenderedIndex: number;
  targetRenderedIndex: number;
};

function arraysMatch(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

export function resolveTaskListRailSiblingMove(
  renderedStructuralKeys: readonly string[],
  sourceStructuralKey: string,
  targetStructuralKey: string,
  intent: TaskListRailSiblingDropIntent,
): TaskListRailSiblingMove {
  const sourceRenderedIndex = renderedStructuralKeys.indexOf(sourceStructuralKey);
  const targetRenderedIndex = renderedStructuralKeys.indexOf(targetStructuralKey);
  const invalidReason = sourceRenderedIndex < 0
    ? "missing-source"
    : targetRenderedIndex < 0
      ? "missing-target"
      : sourceStructuralKey === targetStructuralKey
        ? "source-is-target"
        : null;
  if (invalidReason) {
    return {
      destinationIndex: null,
      finalStructuralKeys: [...renderedStructuralKeys],
      invalidReason,
      reducedStructuralKeys: [...renderedStructuralKeys],
      reducedTargetIndex: null,
      samePosition: false,
      sourceRenderedIndex,
      targetRenderedIndex,
    };
  }

  const reducedStructuralKeys = [...renderedStructuralKeys];
  reducedStructuralKeys.splice(sourceRenderedIndex, 1);
  const reducedTargetIndex = reducedStructuralKeys.indexOf(targetStructuralKey);

  const requestedIndex = reducedTargetIndex + (intent === "after" ? 1 : 0);
  const destinationIndex = Math.max(0, Math.min(reducedStructuralKeys.length, requestedIndex));
  const finalStructuralKeys = [...reducedStructuralKeys];
  finalStructuralKeys.splice(destinationIndex, 0, sourceStructuralKey);

  return {
    destinationIndex,
    finalStructuralKeys,
    invalidReason: null,
    reducedStructuralKeys,
    reducedTargetIndex,
    samePosition: arraysMatch(finalStructuralKeys, renderedStructuralKeys),
    sourceRenderedIndex,
    targetRenderedIndex,
  };
}

export function resolveTaskListRailCrossContainerMove(
  destinationStructuralKeys: readonly string[],
  sourceStructuralKey: string,
  targetStructuralKey: string | null,
  intent: TaskListRailSiblingDropIntent,
): TaskListRailSiblingMove {
  const reducedStructuralKeys = destinationStructuralKeys.filter((key) => key !== sourceStructuralKey);
  const targetRenderedIndex = targetStructuralKey === null
    ? reducedStructuralKeys.length
    : reducedStructuralKeys.indexOf(targetStructuralKey);
  const invalidReason = targetStructuralKey !== null && targetRenderedIndex < 0 ? "missing-target" : null;
  if (invalidReason) {
    return {
      destinationIndex: null,
      finalStructuralKeys: [...reducedStructuralKeys],
      invalidReason,
      reducedStructuralKeys,
      reducedTargetIndex: null,
      samePosition: false,
      sourceRenderedIndex: -1,
      targetRenderedIndex,
    };
  }

  const requestedIndex = targetStructuralKey === null
    ? reducedStructuralKeys.length
    : targetRenderedIndex + (intent === "after" ? 1 : 0);
  const destinationIndex = Math.max(0, Math.min(reducedStructuralKeys.length, requestedIndex));
  const finalStructuralKeys = [...reducedStructuralKeys];
  finalStructuralKeys.splice(destinationIndex, 0, sourceStructuralKey);
  return {
    destinationIndex,
    finalStructuralKeys,
    invalidReason: null,
    reducedStructuralKeys,
    reducedTargetIndex: targetRenderedIndex,
    samePosition: false,
    sourceRenderedIndex: -1,
    targetRenderedIndex,
  };
}

export function reorderTaskListRailItemsByStructuralKeys<T>(
  items: readonly T[],
  finalStructuralKeys: readonly string[],
  getStructuralKey: (item: T) => string | null,
) {
  const itemByStructuralKey = new Map(
    items.flatMap((item) => {
      const structuralKey = getStructuralKey(item);
      return structuralKey ? [[structuralKey, item] as const] : [];
    }),
  );
  let structuralIndex = 0;
  return items.map((item) => {
    const structuralKey = getStructuralKey(item);
    if (!structuralKey) return item;
    return itemByStructuralKey.get(finalStructuralKeys[structuralIndex++] ?? "") ?? item;
  });
}

export function getTaskListRailIndicatorLeft(
  targetClientEdge: number,
  railClientLeft: number,
  railScrollLeft: number,
) {
  return targetClientEdge - railClientLeft + railScrollLeft;
}
