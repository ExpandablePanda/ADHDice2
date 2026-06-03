import { useMemo, useState } from "react";
import type { Task } from "@/lib/database.types";

type ToggleSelectionOptions = {
  additive?: boolean;
  range?: boolean;
  visibleTaskIds?: string[];
};

type UseTaskListSelectionInput = {
  resetKey: string;
  tasks: Task[];
  visibleListTaskIds: string[];
};

export function useTaskListSelection({
  resetKey,
  tasks,
  visibleListTaskIds,
}: UseTaskListSelectionInput) {
  const [selectionState, setSelectionState] = useState<{
    lastSelectedListTaskId: string | null;
    resetKey: string;
    selectedListTaskIds: string[];
  }>({
    lastSelectedListTaskId: null,
    resetKey,
    selectedListTaskIds: [],
  });

  const validTaskIds = useMemo(() => new Set(tasks.map((task) => task.id)), [tasks]);
  const isSelectionStale = selectionState.resetKey !== resetKey;
  const selectedListTaskIds = useMemo(
    () => (isSelectionStale ? [] : selectionState.selectedListTaskIds.filter((taskId) => validTaskIds.has(taskId))),
    [isSelectionStale, selectionState.selectedListTaskIds, validTaskIds],
  );
  const lastSelectedListTaskId = useMemo(
    () => (isSelectionStale || !selectionState.lastSelectedListTaskId || !validTaskIds.has(selectionState.lastSelectedListTaskId)
      ? null
      : selectionState.lastSelectedListTaskId),
    [isSelectionStale, selectionState.lastSelectedListTaskId, validTaskIds],
  );

  function clearListTaskSelection() {
    setSelectionState({
      lastSelectedListTaskId: null,
      resetKey,
      selectedListTaskIds: [],
    });
  }

  function selectAllVisibleListTasks(taskIds: string[] = visibleListTaskIds) {
    setSelectionState({
      lastSelectedListTaskId: taskIds.at(-1) ?? null,
      resetKey,
      selectedListTaskIds: taskIds.filter((taskId) => validTaskIds.has(taskId)),
    });
  }

  function selectSingleListTask(taskId: string) {
    setSelectionState({
      lastSelectedListTaskId: taskId,
      resetKey,
      selectedListTaskIds: [taskId],
    });
  }

  function toggleListTaskSelection(taskId: string, options?: ToggleSelectionOptions) {
    setSelectionState((currentState) => {
      const visibleTaskIds = options?.visibleTaskIds?.filter((visibleTaskId) => validTaskIds.has(visibleTaskId)) ?? visibleListTaskIds;
      const baseSelectedTaskIds = currentState.resetKey === resetKey
        ? currentState.selectedListTaskIds.filter((currentTaskId) => validTaskIds.has(currentTaskId))
        : [];
      const baseLastSelectedTaskId = currentState.resetKey === resetKey
        ? currentState.lastSelectedListTaskId
        : null;

      let nextSelectedTaskIds: string[];
      if (options?.range && baseLastSelectedTaskId && visibleTaskIds.includes(baseLastSelectedTaskId)) {
        const startIndex = visibleTaskIds.indexOf(baseLastSelectedTaskId);
        const endIndex = visibleTaskIds.indexOf(taskId);
        if (startIndex !== -1 && endIndex !== -1) {
          const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
          const rangeIds = visibleTaskIds.slice(from, to + 1);
          nextSelectedTaskIds = Array.from(new Set([...baseSelectedTaskIds, ...rangeIds]));
          return {
            lastSelectedListTaskId: taskId,
            resetKey,
            selectedListTaskIds: nextSelectedTaskIds,
          };
        }
      }

      if (!options?.additive) {
        nextSelectedTaskIds = [taskId];
      } else if (baseSelectedTaskIds.includes(taskId)) {
        nextSelectedTaskIds = baseSelectedTaskIds.filter((currentTaskId) => currentTaskId !== taskId);
      } else {
        nextSelectedTaskIds = [...baseSelectedTaskIds, taskId];
      }

      return {
        lastSelectedListTaskId: taskId,
        resetKey,
        selectedListTaskIds: nextSelectedTaskIds,
      };
    });
  }

  return {
    clearListTaskSelection,
    lastSelectedListTaskId,
    selectAllVisibleListTasks,
    selectSingleListTask,
    selectedListTaskIds,
    toggleListTaskSelection,
  };
}
