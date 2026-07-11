import type { Dispatch, SetStateAction } from "react";
import type { Task } from "@/lib/database.types";
import type { TaskBucket, TaskRoutingBucket } from "@/lib/task-buckets";
import { buildTaskPriorityUpdate, normalizeTaskPrioritySelectionInput, type TaskPrioritySelectionInput } from "@/lib/task-priority";

type Message = {
  tone: "neutral" | "good" | "warn";
  text: string;
};

type UseTaskPriorityRoutingControllerInput = {
  focusedTaskIds: string[];
  onOpenEditTaskEditor: (task: Task) => void;
  routeTask: (taskId: string, route: TaskRoutingBucket | null) => Promise<void> | void;
  saveFocusSelection: (nextTaskIds: string[]) => Promise<void>;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
};

export function useTaskPriorityRoutingController({
  focusedTaskIds,
  onOpenEditTaskEditor,
  routeTask,
  saveFocusSelection,
  setMessage,
  updateTask,
}: UseTaskPriorityRoutingControllerInput) {
  function selectTaskBucket(task: Task, bucket: TaskBucket) {
    if (bucket === "done") {
      void updateTask(task.id, {
        completed_at: new Date().toISOString(),
        status: "done",
      });
      return;
    }

    if (bucket === "missed") {
      void updateTask(task.id, { status: "missed" });
      return;
    }

    if (bucket === "focus") {
      void saveFocusSelection(Array.from(new Set([...focusedTaskIds, task.id])));
      void routeTask(task.id, "today");
      return;
    }

    if (bucket === "recurring") {
      onOpenEditTaskEditor(task);
      setMessage({ tone: "neutral", text: "Choose a repeat pattern to turn this into a recurring loop." });
      return;
    }

    const routeMap: Partial<Record<TaskBucket, TaskRoutingBucket>> = {
      inbox: "inbox",
      later: "later",
      quick_wins: "quick_wins",
      today: "today",
      waiting: "waiting",
    };
    const nextRoute = routeMap[bucket];
    if (nextRoute) {
      void routeTask(task.id, nextRoute);
      return;
    }

    void routeTask(task.id, null);
  }

  async function setTaskPriority(taskId: string, priority: TaskPrioritySelectionInput) {
    const normalizedPriority = normalizeTaskPrioritySelectionInput(priority);
    if (!normalizedPriority) {
      return;
    }

    if (normalizedPriority.focusAction === "add") {
      await saveFocusSelection(Array.from(new Set([...focusedTaskIds, taskId])));
      void routeTask(taskId, "today");
      return;
    }

    if (normalizedPriority.focusAction === "remove") {
      await saveFocusSelection(focusedTaskIds.filter((id) => id !== taskId));
    }

    if (normalizedPriority.priorityLevel !== null) {
      await updateTask(taskId, buildTaskPriorityUpdate(normalizedPriority.priorityLevel));
    }
  }

  return {
    selectTaskBucket,
    setTaskPriority,
  };
}
