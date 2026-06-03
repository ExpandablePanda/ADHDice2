import type { Dispatch, SetStateAction } from "react";
import type { AgentPlanColumnId } from "@/components/ui/agent-plan";
import type { TaskUiState } from "@/lib/task-ui-state";

type UseTaskListViewStateControllerInput = {
  setTaskUiState: Dispatch<SetStateAction<TaskUiState>>;
};

export function useTaskListViewStateController({
  setTaskUiState,
}: UseTaskListViewStateControllerInput) {
  function setSelectedBucket(bucket: string) {
    setTaskUiState((prev) => ({
      ...prev,
      selectedBucket: bucket,
    }));
  }

  function toggleListColumn(columnId: AgentPlanColumnId) {
    setTaskUiState((prev) => {
      const currentColumns = prev.visibleColumnsByView.list;
      const nextColumns = currentColumns.includes(columnId)
        ? currentColumns.filter((column) => column !== columnId)
        : [...currentColumns, columnId];

      return {
        ...prev,
        visibleColumnsByView: {
          ...prev.visibleColumnsByView,
          list: nextColumns,
        },
      };
    });
  }

  function reorderListColumns(columnId: AgentPlanColumnId, targetColumnId: AgentPlanColumnId) {
    if (columnId === targetColumnId) {
      return;
    }

    setTaskUiState((prev) => {
      const currentColumns = prev.visibleColumnsByView.list;
      const nextColumns = [...currentColumns];
      const fromIndex = nextColumns.indexOf(columnId);
      const toIndex = nextColumns.indexOf(targetColumnId);

      if (fromIndex === -1 || toIndex === -1) {
        return prev;
      }

      const [moved] = nextColumns.splice(fromIndex, 1);
      nextColumns.splice(toIndex, 0, moved);

      return {
        ...prev,
        visibleColumnsByView: {
          ...prev.visibleColumnsByView,
          list: nextColumns,
        },
      };
    });
  }

  return {
    reorderListColumns,
    setSelectedBucket,
    toggleListColumn,
  };
}
