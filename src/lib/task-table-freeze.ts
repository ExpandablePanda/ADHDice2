export type TaskTableFreezeTransition = {
  nextFrozenDisplayedTaskIds: string[] | null;
  shouldDispatch: boolean;
};

export function resolveTaskTableFreezeTransition(
  selectedTaskCount: number,
  displayedTaskIds: readonly string[],
  frozenDisplayedTaskIds: string[] | null,
): TaskTableFreezeTransition {
  if (selectedTaskCount === 0) {
    return frozenDisplayedTaskIds === null
      ? { nextFrozenDisplayedTaskIds: null, shouldDispatch: false }
      : { nextFrozenDisplayedTaskIds: null, shouldDispatch: true };
  }

  return frozenDisplayedTaskIds === null
    ? { nextFrozenDisplayedTaskIds: [...displayedTaskIds], shouldDispatch: true }
    : { nextFrozenDisplayedTaskIds: frozenDisplayedTaskIds, shouldDispatch: false };
}
