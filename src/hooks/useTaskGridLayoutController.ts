import type { Dispatch, SetStateAction } from "react";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  buildTaskGridWidget,
  moveTaskGridItem,
  normalizeTaskGridLayout,
  reorderTaskGridItems,
  type TaskGridLayoutItem,
} from "@/lib/task-grid-layout";

type Message = {
  tone: "neutral" | "good" | "warn";
  text: string;
};

type UseTaskGridLayoutControllerInput<TWidgetType extends string> = {
  currentUserId: string;
  draggedGridWidgetId: string | null;
  isWidgetType: (value: string) => value is TWidgetType;
  maxColumns: number;
  maxDisplayRows: number;
  setDraggedGridWidgetId: Dispatch<SetStateAction<string | null>>;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setSelectedGridWidgetId: Dispatch<SetStateAction<string | null>>;
  setTaskGridLayout: Dispatch<SetStateAction<TaskGridLayoutItem<TWidgetType>[]>>;
  starterLayout: TaskGridLayoutItem<TWidgetType>[];
  supabase: NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
  taskGridLayout: TaskGridLayoutItem<TWidgetType>[];
};

export function useTaskGridLayoutController<TWidgetType extends string>({
  currentUserId,
  draggedGridWidgetId,
  isWidgetType,
  maxColumns,
  maxDisplayRows,
  setDraggedGridWidgetId,
  setMessage,
  setSelectedGridWidgetId,
  setTaskGridLayout,
  starterLayout,
  supabase,
  taskGridLayout,
}: UseTaskGridLayoutControllerInput<TWidgetType>) {
  async function saveTaskGridLayout(nextLayout: TaskGridLayoutItem<TWidgetType>[]) {
    const normalizedLayout = normalizeTaskGridLayout(nextLayout, isWidgetType, maxColumns, maxDisplayRows);
    setTaskGridLayout(normalizedLayout);

    const { error } = await supabase
      .from("adhdice_task_grid_layouts")
      .upsert({
        user_id: currentUserId,
        layout_json: JSON.stringify(normalizedLayout),
      });

    if (error) {
      setMessage({ tone: "warn", text: error.message });
    }
  }

  async function updateGridLayout(updater: (current: TaskGridLayoutItem<TWidgetType>[]) => TaskGridLayoutItem<TWidgetType>[]) {
    const nextLayout = updater(taskGridLayout);
    await saveTaskGridLayout(nextLayout);
  }

  async function handleResizeGridWidget(widgetId: string, nextWidth: number, nextHeight: number) {
    await updateGridLayout((current) => current.map((item) =>
      item.id === widgetId
        ? {
            ...item,
            h: nextHeight,
            w: Math.max(1, Math.min(maxColumns, nextWidth)),
          }
        : item
    ));
  }

  async function handleMoveGridWidget(widgetId: string, direction: "up" | "down") {
    await updateGridLayout((current) => moveTaskGridItem(current, widgetId, direction, isWidgetType, maxColumns, maxDisplayRows));
  }

  async function handleDropGridWidget(targetWidgetId: string) {
    if (!draggedGridWidgetId || draggedGridWidgetId === targetWidgetId) {
      return;
    }

    const draggedId = draggedGridWidgetId;
    setDraggedGridWidgetId(null);
    await updateGridLayout((current) => reorderTaskGridItems(current, draggedId, targetWidgetId, isWidgetType, maxColumns, maxDisplayRows));
  }

  async function handleRemoveGridWidget(widgetId: string) {
    setSelectedGridWidgetId((current) => (current === widgetId ? null : current));
    await updateGridLayout((current) => current.filter((item) => item.id !== widgetId));
  }

  async function handleAddGridWidget(widgetType: TWidgetType) {
    if (taskGridLayout.some((item) => item.type === widgetType)) {
      return;
    }

    const nextWidget = buildTaskGridWidget(widgetType, `grid-${widgetType}-${crypto.randomUUID()}`);
    setSelectedGridWidgetId(nextWidget.id);
    await updateGridLayout((current) => [...current, nextWidget]);
  }

  async function handleResetGridLayout() {
    setSelectedGridWidgetId(null);
    setDraggedGridWidgetId(null);
    await saveTaskGridLayout(starterLayout);
  }

  return {
    handleAddGridWidget,
    handleDropGridWidget,
    handleMoveGridWidget,
    handleRemoveGridWidget,
    handleResetGridLayout,
    handleResizeGridWidget,
  };
}
