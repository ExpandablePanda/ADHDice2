import type { Dispatch, SetStateAction } from "react";
import type { Task, TaskEnergy } from "@/lib/database.types";
import type { TaskUiState } from "@/lib/task-ui-state";

type UseTaskEditorImportControllerInput = {
  clearListTaskSelection: () => void;
  deleteTasks: (taskIds: string[]) => Promise<boolean>;
  handleAddGridWidget: (widgetType: "import") => Promise<void>;
  selectedListTaskIds: string[];
  setIsBatchDeleteModalOpen: Dispatch<SetStateAction<boolean>>;
  setIsImportWidgetMenuOpen: Dispatch<SetStateAction<boolean>>;
  setIsTaskEditorOpen: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<{ tone: "neutral" | "good" | "warn"; text: string } | null>>;
  setSelectedGridWidgetId: Dispatch<SetStateAction<string | null>>;
  setTaskEditorMode: Dispatch<SetStateAction<"create" | "edit">>;
  setTaskEditorTaskId: Dispatch<SetStateAction<string | null>>;
  setTaskUiState: Dispatch<SetStateAction<TaskUiState>>;
  taskGridLayout: Array<{ id: string; type: string }>;
  taskUiView: TaskUiState["view"];
  tasks: Task[];
  todayIso: () => string;
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
};

export function useTaskEditorImportController({
  clearListTaskSelection,
  deleteTasks,
  handleAddGridWidget,
  selectedListTaskIds,
  setIsBatchDeleteModalOpen,
  setIsImportWidgetMenuOpen,
  setIsTaskEditorOpen,
  setMessage,
  setSelectedGridWidgetId,
  setTaskEditorMode,
  setTaskEditorTaskId,
  setTaskUiState,
  taskGridLayout,
  taskUiView,
  tasks,
  todayIso,
  updateTask,
}: UseTaskEditorImportControllerInput) {
  function openNewTaskEditor() {
    setIsImportWidgetMenuOpen(false);
    setTaskEditorMode("create");
    setTaskEditorTaskId(null);
    setIsTaskEditorOpen(true);
  }

  function openEditTaskEditor(task: Task) {
    setIsImportWidgetMenuOpen(false);
    setTaskEditorMode("edit");
    setTaskEditorTaskId(task.id);
    setIsTaskEditorOpen(true);
  }

  function closeTaskEditor() {
    setIsTaskEditorOpen(false);
    setTaskEditorTaskId(null);
  }

  function setTaskDuePreset(taskId: string, preset: "next_week" | "none" | "today" | "tomorrow") {
    const baseDate = new Date(`${todayIso()}T12:00:00`);
    const nextDate = new Date(baseDate);
    if (preset === "tomorrow") {
      nextDate.setDate(baseDate.getDate() + 1);
    } else if (preset === "next_week") {
      nextDate.setDate(baseDate.getDate() + 7);
    }

    const nextDueOn = preset === "none"
      ? null
      : preset === "today"
        ? todayIso()
        : nextDate.toISOString().slice(0, 10);
    void updateTask(taskId, { due_on: nextDueOn });
  }

  function setTaskEnergy(taskId: string, energy: TaskEnergy) {
    void updateTask(taskId, { energy });
  }

  function setTaskRecurringPreset(taskId: string, preset: "daily" | "weekly" | "monthly") {
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return;
    }

    const baseToday = todayIso();
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
    closeTaskEditor,
    deleteSelectedListTasks,
    openEditTaskEditor,
    openNewTaskEditor,
    openTaskImportPanel,
    setTaskDuePreset,
    setTaskEnergy,
    setTaskRecurringPreset,
  };
}
