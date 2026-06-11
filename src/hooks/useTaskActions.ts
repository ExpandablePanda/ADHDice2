"use client";

import { useTaskCrudActions } from "@/hooks/useTaskCrudActions";
import { useTaskCreateAction } from "@/hooks/useTaskCreateAction";
import { useTaskEditorSaveAction } from "@/hooks/useTaskEditorSaveAction";
import { useTaskHistoryActions } from "@/hooks/useTaskHistoryActions";
import { useTaskBatchEditAction } from "@/hooks/useTaskBatchEditAction";
import { useTaskNoteLinkActions } from "@/hooks/useTaskNoteLinkActions";
import { useTaskRoutingActions } from "@/hooks/useTaskRoutingActions";
import { useTaskSubtaskActions } from "@/hooks/useTaskSubtaskActions";
import { useTaskUpdateAction } from "@/hooks/useTaskUpdateAction";
import { useTaskListActions } from "@/hooks/useTaskListActions";
import type { TaskStatus } from "@/lib/database.types";

type UseTaskActionsOptions = {
  crud: Omit<Parameters<typeof useTaskCrudActions>[0], "replaceTaskSubtasks">;
  currentDayKey: string;
  create: Omit<Parameters<typeof useTaskCreateAction>[0], "routeTask">;
  editorSave: Omit<Parameters<typeof useTaskEditorSaveAction>[0], "replaceTaskSubtasks" | "syncTaskHistoryEntry" | "syncTaskNoteLinks">;
  batchEdit: Omit<Parameters<typeof useTaskBatchEditAction>[0], "routeTask" | "saveFocusSelection" | "syncTaskHistoryEntry">;
  list?: Parameters<typeof useTaskListActions>[0];
  history: Parameters<typeof useTaskHistoryActions>[0];
  noteLinks: Parameters<typeof useTaskNoteLinkActions>[0];
  routing: Parameters<typeof useTaskRoutingActions>[0];
  subtask: Parameters<typeof useTaskSubtaskActions>[0];
  update: Omit<Parameters<typeof useTaskUpdateAction>[0], "routeTask" | "syncTaskHistoryEntry">;
};

export function useTaskActions({
  crud,
  currentDayKey,
  create,
  editorSave,
  batchEdit,
  list,
  history,
  noteLinks,
  routing,
  subtask,
  update,
}: UseTaskActionsOptions) {
  const routingActions = useTaskRoutingActions(routing);
  const historyActions = useTaskHistoryActions(history);
  const syncTaskHistoryEntry = (taskId: string, status: TaskStatus) =>
    historyActions.syncTaskHistoryEntry(taskId, status, currentDayKey);
  const noteLinkActions = useTaskNoteLinkActions(noteLinks);
  const subtaskActions = useTaskSubtaskActions(subtask);
  const crudActions = useTaskCrudActions({
    ...crud,
    replaceTaskSubtasks: subtaskActions.replaceTaskSubtasks,
  });
  const createAction = useTaskCreateAction({
    ...create,
    routeTask: routingActions.routeTask,
  });
  const updateAction = useTaskUpdateAction({
    ...update,
    routeTask: routingActions.routeTask,
    syncTaskHistoryEntry,
  });
  const editorSaveAction = useTaskEditorSaveAction({
    ...editorSave,
    replaceTaskSubtasks: subtaskActions.replaceTaskSubtasks,
    syncTaskHistoryEntry,
    syncTaskNoteLinks: noteLinkActions.syncTaskNoteLinks,
  });
  const batchEditAction = useTaskBatchEditAction({
    ...batchEdit,
    routeTask: routingActions.routeTask,
    saveFocusSelection: editorSave.saveFocusSelection,
    syncTaskHistoryEntry,
  });
  const listActions = useTaskListActions(list);

  return {
    ...batchEditAction,
    ...createAction,
    ...crudActions,
    ...editorSaveAction,
    ...historyActions,
    ...listActions,
    ...noteLinkActions,
    ...routingActions,
    ...subtaskActions,
    ...updateAction,
  };
}
