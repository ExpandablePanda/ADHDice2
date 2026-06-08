"use client";

import { useEffect, useState } from "react";
import type { TaskRoutingBucket } from "@/lib/task-buckets";
import {
  ACTIVE_PAGE_STORAGE_KEY,
  DAILY_PLANNING_COLLAPSED_STORAGE_KEY,
  DEFAULT_TASK_UI_STATE,
  getUserScopedStorageKey,
  HUD_UI_STORAGE_KEY,
  isAppPage,
  normalizeHudUiState,
  migrateLegacyTaskUiState,
  normalizePersistedTaskEditorUiState,
  parseStoredJson,
  TASK_EDITOR_UI_STORAGE_KEY,
  TASK_FILTERS_OPEN_STORAGE_KEY,
  TASK_FOCUS_STORAGE_KEY,
  TASK_GRID_STORAGE_KEY,
  TASK_ROUTING_STORAGE_KEY,
  TASK_UI_STORAGE_KEY,
  type AppPage,
  type HudUiState,
  type PersistedTaskEditorUiState,
  type TaskUiState,
} from "@/lib/task-ui-state";
import { DEFAULT_HUD_UI_STATE } from "@/lib/task-hud-layout";

type UseTaskUiStateOptions<TTaskGridItem> = {
  isTaskEditorOpen: boolean;
  taskEditorMode: PersistedTaskEditorUiState["mode"];
  taskEditorTaskId: string | null;
  normalizeTaskGridLayout: (layout: TTaskGridItem[]) => TTaskGridItem[];
  taskGridStarterLayout: TTaskGridItem[];
  userId: string | null | undefined;
};

export function useTaskUiState<TTaskGridItem>({
  isTaskEditorOpen,
  taskEditorMode,
  taskEditorTaskId,
  normalizeTaskGridLayout,
  taskGridStarterLayout,
  userId,
}: UseTaskUiStateOptions<TTaskGridItem>) {
  const [activePage, setActivePage] = useState<AppPage>("Home");
  const [taskUiState, setTaskUiState] = useState<TaskUiState>(DEFAULT_TASK_UI_STATE);
  const [taskRouting, setTaskRouting] = useState<Record<string, TaskRoutingBucket>>({});
  const [focusedTaskIdsByDate, setFocusedTaskIdsByDate] = useState<Record<string, string[]>>({});
  const [taskGridLayout, setTaskGridLayout] = useState<TTaskGridItem[]>(taskGridStarterLayout);
  const [hudUiState, setHudUiState] = useState<HudUiState>(DEFAULT_HUD_UI_STATE);
  const [isTaskFiltersOpen, setIsTaskFiltersOpen] = useState(false);
  const [isDailyPlanningCollapsed, setIsDailyPlanningCollapsed] = useState(false);
  const [pendingTaskEditorRestore, setPendingTaskEditorRestore] = useState<PersistedTaskEditorUiState | null>(null);
  const [restoredUserId, setRestoredUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setActivePage("Home");
      setTaskUiState(DEFAULT_TASK_UI_STATE);
      setTaskRouting({});
      setFocusedTaskIdsByDate({});
      setTaskGridLayout(taskGridStarterLayout);
      setHudUiState(DEFAULT_HUD_UI_STATE);
      setIsTaskFiltersOpen(false);
      setIsDailyPlanningCollapsed(false);
      setPendingTaskEditorRestore(null);
      setRestoredUserId(null);
      return;
    }

    const storedTaskUiState = parseStoredJson<TaskUiState>(
      getUserScopedStorageKey(TASK_UI_STORAGE_KEY, userId),
      DEFAULT_TASK_UI_STATE,
    );
    setTaskUiState(migrateLegacyTaskUiState(storedTaskUiState));
    setTaskRouting(
      parseStoredJson<Record<string, TaskRoutingBucket>>(
        getUserScopedStorageKey(TASK_ROUTING_STORAGE_KEY, userId),
        {},
      ),
    );
    setFocusedTaskIdsByDate(
      parseStoredJson<Record<string, string[]>>(
        getUserScopedStorageKey(TASK_FOCUS_STORAGE_KEY, userId),
        {},
      ),
    );
    setTaskGridLayout(
      normalizeTaskGridLayout(
        parseStoredJson<TTaskGridItem[]>(
          getUserScopedStorageKey(TASK_GRID_STORAGE_KEY, userId),
          taskGridStarterLayout,
        ),
      ),
    );
    setHudUiState(
      normalizeHudUiState(
        parseStoredJson<unknown>(
          getUserScopedStorageKey(HUD_UI_STORAGE_KEY, userId),
          DEFAULT_HUD_UI_STATE,
        ),
      ),
    );

    const storedActivePage = parseStoredJson<unknown>(
      getUserScopedStorageKey(ACTIVE_PAGE_STORAGE_KEY, userId),
      "Home",
    );
    setActivePage(isAppPage(storedActivePage) ? storedActivePage : "Home");

    setIsTaskFiltersOpen(
      parseStoredJson<boolean>(
        getUserScopedStorageKey(TASK_FILTERS_OPEN_STORAGE_KEY, userId),
        false,
      ),
    );

    setPendingTaskEditorRestore(
      normalizePersistedTaskEditorUiState(
        parseStoredJson<unknown>(
          getUserScopedStorageKey(TASK_EDITOR_UI_STORAGE_KEY, userId),
          { isOpen: false, mode: "create", taskId: null },
        ),
      ),
    );

    setIsDailyPlanningCollapsed(
      parseStoredJson<boolean>(
        getUserScopedStorageKey(DAILY_PLANNING_COLLAPSED_STORAGE_KEY, userId),
        false,
      ),
    );
    setRestoredUserId(userId);
  }, [normalizeTaskGridLayout, taskGridStarterLayout, userId]);

  const isRestoringPersistedUiState = Boolean(userId) && restoredUserId !== userId;

  useEffect(() => {
    if (!userId || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      getUserScopedStorageKey(ACTIVE_PAGE_STORAGE_KEY, userId),
      JSON.stringify(activePage),
    );
  }, [activePage, userId]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      getUserScopedStorageKey(TASK_FILTERS_OPEN_STORAGE_KEY, userId),
      JSON.stringify(isTaskFiltersOpen),
    );
  }, [isTaskFiltersOpen, userId]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      getUserScopedStorageKey(TASK_EDITOR_UI_STORAGE_KEY, userId),
      JSON.stringify({
        isOpen: isTaskEditorOpen,
        mode: taskEditorMode,
        taskId: taskEditorTaskId,
      } satisfies PersistedTaskEditorUiState),
    );
  }, [isTaskEditorOpen, taskEditorMode, taskEditorTaskId, userId]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      getUserScopedStorageKey(TASK_UI_STORAGE_KEY, userId),
      JSON.stringify(taskUiState),
    );
  }, [taskUiState, userId]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      getUserScopedStorageKey(TASK_ROUTING_STORAGE_KEY, userId),
      JSON.stringify(taskRouting),
    );
  }, [taskRouting, userId]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      getUserScopedStorageKey(TASK_FOCUS_STORAGE_KEY, userId),
      JSON.stringify(focusedTaskIdsByDate),
    );
  }, [focusedTaskIdsByDate, userId]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      getUserScopedStorageKey(TASK_GRID_STORAGE_KEY, userId),
      JSON.stringify(taskGridLayout),
    );
  }, [taskGridLayout, userId]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      getUserScopedStorageKey(HUD_UI_STORAGE_KEY, userId),
      JSON.stringify(hudUiState),
    );
  }, [hudUiState, userId]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      getUserScopedStorageKey(DAILY_PLANNING_COLLAPSED_STORAGE_KEY, userId),
      JSON.stringify(isDailyPlanningCollapsed),
    );
  }, [isDailyPlanningCollapsed, userId]);

  return {
    activePage,
    focusedTaskIdsByDate,
    hudUiState,
    isDailyPlanningCollapsed,
    isRestoringPersistedUiState,
    isTaskFiltersOpen,
    pendingTaskEditorRestore,
    setActivePage,
    setFocusedTaskIdsByDate,
    setHudUiState,
    setIsDailyPlanningCollapsed,
    setIsTaskFiltersOpen,
    setPendingTaskEditorRestore,
    setTaskGridLayout,
    setTaskRouting,
    setTaskUiState,
    taskGridLayout,
    taskRouting,
    taskUiState,
  };
}
