import type { Dispatch, SetStateAction } from "react";
import type { TaskRoutingBucket } from "@/lib/task-buckets";
import type { TaskUiState } from "@/lib/task-ui-state";

type Message = {
  tone: "neutral" | "good" | "warn";
  text: string;
};

type UseTaskPlannerActionsInput = {
  focusedTaskIds: string[];
  routeTask: (taskId: string, route: TaskRoutingBucket | null) => Promise<void> | void;
  saveFocusSelection: (nextTaskIds: string[]) => Promise<void>;
  setFocusDraftIds: Dispatch<SetStateAction<string[]>>;
  setFocusPlannerStep: Dispatch<SetStateAction<0 | 1 | 2>>;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setShowFocusPlanner: Dispatch<SetStateAction<boolean>>;
  setTaskRouting: Dispatch<SetStateAction<Record<string, TaskRoutingBucket>>>;
  setTaskUiState: Dispatch<SetStateAction<TaskUiState>>;
};

export function useTaskPlannerActions({
  focusedTaskIds,
  routeTask,
  saveFocusSelection,
  setFocusDraftIds,
  setFocusPlannerStep,
  setMessage,
  setShowFocusPlanner,
  setTaskRouting,
  setTaskUiState,
}: UseTaskPlannerActionsInput) {
  function openFocusPlanner() {
    setFocusPlannerStep(0);
    setFocusDraftIds(focusedTaskIds);
    setShowFocusPlanner(true);
  }

  function planTasksForToday(taskIds: string[]) {
    if (taskIds.length === 0) {
      return;
    }

    setTaskRouting((current) => {
      const next = { ...current };
      for (const taskId of taskIds) {
        next[taskId] = "today";
      }
      return next;
    });
    setTaskUiState((prev) => ({ ...prev, selectedBucket: "today" }));
    setMessage({ tone: "good", text: `${taskIds.length} task${taskIds.length === 1 ? "" : "s"} moved into Today.` });
  }

  function focusTask(taskId: string) {
    void saveFocusSelection(Array.from(new Set([...focusedTaskIds, taskId])));
    void routeTask(taskId, "today");
    setTaskUiState((prev) => ({ ...prev, selectedBucket: "focus" }));
    setMessage({ tone: "good", text: "Moved into Focus so it stays visible in today’s plan." });
  }

  function sendTaskToWaiting(taskId: string) {
    void routeTask(taskId, "waiting");
    setMessage({ tone: "neutral", text: "Moved to Waiting. Use this for blocked work and handoffs." });
  }

  function deferTask(taskId: string) {
    void routeTask(taskId, "later");
    setMessage({ tone: "neutral", text: "Moved to Later so it stays out of today’s lane." });
  }

  return {
    deferTask,
    focusTask,
    openFocusPlanner,
    planTasksForToday,
    sendTaskToWaiting,
  };
}
