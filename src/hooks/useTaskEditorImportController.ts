import type { Dispatch, SetStateAction } from "react";
import type { Task, TaskEnergy } from "@/lib/database.types";
import { shiftDateKey } from "@/lib/task-grid-layout";
import type { TaskUiState } from "@/lib/task-ui-state";

type UseTaskEditorImportControllerInput = {
  clearListTaskSelection: () => void;
  deleteTasks: (taskIds: string[]) => Promise<boolean>;
  handleAddGridWidget: (widgetType: "import") => Promise<void>;
  selectedListTaskIds: string[];
  setIsBatchDeleteModalOpen: Dispatch<SetStateAction<boolean>>;
  setIsImportWidgetMenuOpen: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<{ tone: "neutral" | "good" | "warn"; text: string } | null>>;
  setSelectedGridWidgetId: Dispatch<SetStateAction<string | null>>;
  setTaskUiState: Dispatch<SetStateAction<TaskUiState>>;
  taskGridLayout: Array<{ id: string; type: string }>;
  taskUiView: TaskUiState["view"];
  tasks: Task[];
  todayDateKey: string;
  updateTask: (taskId: string, updates: Partial<Task>, options?: { manualAction?: "unscheduled_status" }) => Promise<unknown>;
};

export function useTaskEditorImportController({
  clearListTaskSelection,
  deleteTasks,
  handleAddGridWidget,
  selectedListTaskIds,
  setIsBatchDeleteModalOpen,
  setIsImportWidgetMenuOpen,
  setMessage,
  setSelectedGridWidgetId,
  setTaskUiState,
  taskGridLayout,
  taskUiView,
  tasks,
  todayDateKey,
  updateTask,
}: UseTaskEditorImportControllerInput) {
  function setTaskDuePreset(taskId: string, preset: "next_week" | "none" | "today" | "tomorrow") {
    const nextDueOn = preset === "none"
      ? null
      : preset === "today"
        ? todayDateKey
        : shiftDateKey(todayDateKey, preset === "tomorrow" ? 1 : 7);
    void updateTask(
      taskId,
      { due_on: nextDueOn },
      nextDueOn === null ? { manualAction: "unscheduled_status" } : undefined,
    );
  }

  function setTaskEnergy(taskId: string, energy: TaskEnergy) {
    void updateTask(taskId, { energy });
  }

  function setTaskRecurringPreset(taskId: string, preset: "daily" | "weekly" | "monthly") {
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return;
    }

    const baseToday = todayDateKey;
    const anchorDate = task.due_on ? new Date(`${task.due_on}T12:00:00`) : new Date(`${baseToday}T12:00:00`);
    void updateTask(taskId, {
      repeat_frequency: preset,
      repeat_interval: 1,
      repeat_days_of_week: preset === "weekly" ? [anchorDate.getDay()] : [],
      repeat_day_of_month: preset === "monthly" ? anchorDate.getDate() : null,
    });
    setMessage({ tone: "good", text: `${task.title} now repeats ${preset}.` });
  }

  function scrollToTaskElement(elementId: string) {
    if (typeof document === "undefined") {
      return;
    }
    document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function openTaskImportPanel() {
    if (taskUiView === "table" || taskUiView === "list") {
      setIsImportWidgetMenuOpen(true);
      return;
    }

    setTaskUiState((prev) => ({
      ...prev,
      view: "grid",
    }));

    const existingImportWidget = taskGridLayout.find((item) => item.type === "import") ?? null;
    if (existingImportWidget) {
      setSelectedGridWidgetId(existingImportWidget.id);
    } else {
      await handleAddGridWidget("import");
    }

    window.setTimeout(() => {
      scrollToTaskElement("task-import-panel");
    }, 80);
  }

  async function deleteSelectedListTasks() {
    if (selectedListTaskIds.length === 0) {
      return;
    }

    const deleted = await deleteTasks(selectedListTaskIds);
    if (deleted) {
      clearListTaskSelection();
      setIsBatchDeleteModalOpen(false);
    }
  }

  return {
    deleteSelectedListTasks,
    openTaskImportPanel,
    setTaskDuePreset,
    setTaskEnergy,
    setTaskRecurringPreset,
  };
}
