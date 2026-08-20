"use client";

import { useTaskCrudActions } from "@/hooks/useTaskCrudActions";
import { useTaskCreateAction } from "@/hooks/useTaskCreateAction";
import { useTaskEditorSaveAction } from "@/hooks/useTaskEditorSaveAction";
import { useTaskHistoryActions, type TaskHistorySyncOptions } from "@/hooks/useTaskHistoryActions";
import { useTaskBatchEditAction } from "@/hooks/useTaskBatchEditAction";
import { useTaskNoteLinkActions } from "@/hooks/useTaskNoteLinkActions";
import { useTaskRoutingActions } from "@/hooks/useTaskRoutingActions";
import { useTaskSubtaskActions } from "@/hooks/useTaskSubtaskActions";
import { useTaskUpdateAction } from "@/hooks/useTaskUpdateAction";
import { useTaskListActions } from "@/hooks/useTaskListActions";
import type { Task, TaskHistory, TaskHistoryActionInput, TaskStatus } from "@/lib/database.types";

type UseTaskActionsOptions = {
  crud: Omit<Parameters<typeof useTaskCrudActions>[0], "replaceTaskSubtasks">;
  currentDayKey: string;
  create: Omit<Parameters<typeof useTaskCreateAction>[0], "routeTask">;
  editorSave: Omit<Parameters<typeof useTaskEditorSaveAction>[0], "currentDayKey" | "replaceTaskSubtasks" | "syncTaskHistoryEntry" | "syncTaskNoteLinks">;
  batchEdit: Omit<Parameters<typeof useTaskBatchEditAction>[0], "currentDayKey" | "routeTask" | "saveFocusSelection" | "syncTaskHistoryEntry">;
  list?: Parameters<typeof useTaskListActions>[0];
  history: Parameters<typeof useTaskHistoryActions>[0];
  noteLinks: Parameters<typeof useTaskNoteLinkActions>[0];
  routing: Parameters<typeof useTaskRoutingActions>[0];
  subtask: Parameters<typeof useTaskSubtaskActions>[0];
  update: Omit<Parameters<typeof useTaskUpdateAction>[0], "currentDayKey" | "routeTask" | "syncTaskHistoryEntry">;
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
  const syncTaskHistoryEntry = (
    taskId: string,
    status: TaskStatus,
    occurrenceTask?: Task | null,
    options?: { historyEntry?: TaskHistoryActionInput; historySnapshot?: TaskHistory[] },
  ) => historyActions.syncTaskHistoryEntry(taskId, status, occurrenceTask, {
    occurrenceTask,
    historyEntry: options?.historyEntry,
    historySnapshot: options?.historySnapshot,
  });
  const syncTaskHistoryEntries = (
    taskId: string,
    status: TaskStatus,
    entryDates: string[],
    options?: TaskHistorySyncOptions,
  ) => historyActions.syncTaskHistoryEntries(taskId, status, entryDates, {
    ...options,
  });
  const noteLinkActions = useTaskNoteLinkActions(noteLinks);
  const updateAction = useTaskUpdateAction({
    ...update,
    currentDayKey,
    routeTask: routingActions.routeTask,
  });
  const subtaskActions = useTaskSubtaskActions({
    ...subtask,
    canonicalTaskStateUpdate: updateAction.updateTask,
  });
  const crudActions = useTaskCrudActions({
    ...crud,
    replaceTaskSubtasks: subtaskActions.replaceTaskSubtasks,
  });
  const createAction = useTaskCreateAction({
    ...create,
    routeTask: routingActions.routeTask,
  });
  const editorSaveAction = useTaskEditorSaveAction({
    ...editorSave,
    canonicalTaskStateUpdate: updateAction.updateTask,
    currentDayKey,
    replaceTaskSubtasks: subtaskActions.replaceTaskSubtasks,
    syncTaskHistoryEntry,
    syncTaskHistoryEntries,
    syncTaskNoteLinks: noteLinkActions.syncTaskNoteLinks,
  });
  const batchEditAction = useTaskBatchEditAction({
    ...batchEdit,
    currentDayKey,
    routeTask: routingActions.routeTask,
    saveFocusSelection: editorSave.saveFocusSelection,
    syncTaskHistoryEntry,
    syncTaskHistoryEntries,
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
