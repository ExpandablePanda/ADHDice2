"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  buildTaskUiSettingsEnvelope,
  normalizeStoredTaskTableLayoutPreferences,
  splitTaskUiSettingsEnvelope,
  TASK_TABLE_LAYOUT_STORAGE_KEY,
  taskTableLayoutPreferencesEqual,
  type TaskTableLayoutPreferences,
} from "@/lib/task-table-layout-persistence";
import { isMissingHudUiSettingsTableError } from "@/lib/task-db-compat";
import type { TaskRoutingBucket } from "@/lib/task-buckets";
import {
  ACTIVE_PAGE_STORAGE_KEY,
  DAILY_PLANNING_COLLAPSED_STORAGE_KEY,
  DEFAULT_TASK_UI_STATE,
  DEFAULT_TASK_WORKSPACE_TABS_STATE,
  getUserScopedStorageKey,
  HUD_UI_STORAGE_KEY,
  isAppPage,
  normalizeHudUiState,
  normalizeTaskWorkspaceTabsState,
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
  type TaskWorkspaceTab,
  type TaskWorkspaceTabsState,
  type TaskUiState,
} from "@/lib/task-ui-state";
import { createDefaultHudUiState, DEFAULT_HUD_UI_STATE } from "@/lib/task-hud-layout";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
type HudStateSource = "local" | "remote" | "restore";
type HudSyncRow = {
  client_updated_at: string | null;
  created_at: string;
  hud_state: Record<string, unknown> | null;
  updated_at: string;
  user_id: string;
};
type HudSyncMetadata = {
  source: HudStateSource;
  updatedAt: string | null;
};

const HUD_UI_UPDATED_AT_STORAGE_KEY = "adhdice-hud-ui-updated-at";
const HUD_CLOUD_WRITE_DEBOUNCE_MS = 900;

type UseTaskUiStateOptions<TTaskGridItem> = {
  isTaskEditorOpen: boolean;
  taskEditorMode: PersistedTaskEditorUiState["mode"];
  taskEditorTaskId: string | null;
  normalizeTaskGridLayout: (layout: TTaskGridItem[]) => TTaskGridItem[];
  supabase?: SupabaseClient;
  taskGridStarterLayout: TTaskGridItem[];
  userId: string | null | undefined;
};

function normalizeStoredTimestamp(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function createDefaultHudState() {
  return createDefaultHudUiState();
}

function readStoredHudState(userId: string) {
  return normalizeHudUiState(
    parseStoredJson<unknown>(
      getUserScopedStorageKey(HUD_UI_STORAGE_KEY, userId),
      DEFAULT_HUD_UI_STATE,
    ),
  );
}

function readStoredHudTimestamp(userId: string) {
  return normalizeStoredTimestamp(
    parseStoredJson<unknown>(
      getUserScopedStorageKey(HUD_UI_UPDATED_AT_STORAGE_KEY, userId),
      null,
    ),
  );
}

function hasStoredHudState(userId: string) {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(getUserScopedStorageKey(HUD_UI_STORAGE_KEY, userId)) !== null;
}

function isRemoteNewerThanLocal(remoteTimestamp: string | null, localTimestamp: string | null) {
  if (!remoteTimestamp) {
    return false;
  }
  if (!localTimestamp) {
    return true;
  }
  return Date.parse(remoteTimestamp) > Date.parse(localTimestamp);
}

export function useTaskUiState<TTaskGridItem>({
  isTaskEditorOpen,
  taskEditorMode,
  taskEditorTaskId,
  normalizeTaskGridLayout,
  supabase,
  taskGridStarterLayout,
  userId,
}: UseTaskUiStateOptions<TTaskGridItem>) {
  const [activePage, setActivePage] = useState<AppPage>("Home");
  const [taskWorkspaceTabsState, setTaskWorkspaceTabsState] = useState<TaskWorkspaceTabsState>(DEFAULT_TASK_WORKSPACE_TABS_STATE);
  const [taskRouting, setTaskRouting] = useState<Record<string, TaskRoutingBucket>>({});
  const [focusedTaskIdsByDate, setFocusedTaskIdsByDate] = useState<Record<string, string[]>>({});
  const [taskGridLayout, setTaskGridLayout] = useState<TTaskGridItem[]>(taskGridStarterLayout);
  const [hudUiState, setHudUiStateState] = useState<HudUiState>(() => (userId ? readStoredHudState(userId) : createDefaultHudState()));
  const [taskTableLayoutPreferences, setTaskTableLayoutPreferencesState] = useState<TaskTableLayoutPreferences>(() => (
    userId
      ? normalizeStoredTaskTableLayoutPreferences(
        parseStoredJson<unknown>(
          getUserScopedStorageKey(TASK_TABLE_LAYOUT_STORAGE_KEY, userId),
          {},
        ),
      )
      : {}
  ));
  const [isTaskFiltersOpen, setIsTaskFiltersOpen] = useState(false);
  const [isDailyPlanningCollapsed, setIsDailyPlanningCollapsed] = useState(false);
  const [pendingTaskEditorRestore, setPendingTaskEditorRestore] = useState<PersistedTaskEditorUiState | null>(null);
  const [restoredUserId, setRestoredUserId] = useState<string | null>(null);
  const hudUiStateRef = useRef(hudUiState);
  const taskTableLayoutPreferencesRef = useRef(taskTableLayoutPreferences);
  const hudSyncMetadataRef = useRef<HudSyncMetadata>({
    source: "restore",
    updatedAt: userId ? readStoredHudTimestamp(userId) : null,
  });
  const hudCloudChannelRef = useRef<RealtimeChannel | null>(null);
  const hudCloudWriteTimeoutRef = useRef<number | null>(null);
  const hudCloudReadyRef = useRef(false);
  const hudCloudSupportedRef = useRef(false);
  const hudMissingTableWarnedRef = useRef(false);
  const hudCloudSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    hudUiStateRef.current = hudUiState;
  }, [hudUiState]);

  useEffect(() => {
    taskTableLayoutPreferencesRef.current = taskTableLayoutPreferences;
  }, [taskTableLayoutPreferences]);

  useLayoutEffect(() => {
    if (!userId) {
      setActivePage("Home");
      setTaskWorkspaceTabsState(DEFAULT_TASK_WORKSPACE_TABS_STATE);
      setTaskRouting({});
      setFocusedTaskIdsByDate({});
      setTaskGridLayout(taskGridStarterLayout);
      setHudUiStateState(createDefaultHudState());
      setTaskTableLayoutPreferencesState({});
      hudSyncMetadataRef.current = { source: "restore", updatedAt: null };
      hudCloudReadyRef.current = false;
      hudCloudSupportedRef.current = false;
      hudCloudSignatureRef.current = null;
      setIsTaskFiltersOpen(false);
      setIsDailyPlanningCollapsed(false);
      setPendingTaskEditorRestore(null);
      setRestoredUserId(null);
      return;
    }

    const storedTaskWorkspaceTabsState = parseStoredJson<unknown>(
      getUserScopedStorageKey(TASK_UI_STORAGE_KEY, userId),
      DEFAULT_TASK_WORKSPACE_TABS_STATE,
    );
    setTaskWorkspaceTabsState(normalizeTaskWorkspaceTabsState(storedTaskWorkspaceTabsState));
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
    setHudUiStateState(readStoredHudState(userId));
    setTaskTableLayoutPreferencesState(
      normalizeStoredTaskTableLayoutPreferences(
        parseStoredJson<unknown>(
          getUserScopedStorageKey(TASK_TABLE_LAYOUT_STORAGE_KEY, userId),
          {},
        ),
      ),
    );
    hudSyncMetadataRef.current = {
      source: "restore",
      updatedAt: readStoredHudTimestamp(userId),
    };

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
      JSON.stringify(taskWorkspaceTabsState),
    );
  }, [taskWorkspaceTabsState, userId]);

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
      getUserScopedStorageKey(TASK_TABLE_LAYOUT_STORAGE_KEY, userId),
      JSON.stringify(taskTableLayoutPreferences),
    );
  }, [taskTableLayoutPreferences, userId]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      getUserScopedStorageKey(HUD_UI_STORAGE_KEY, userId),
      JSON.stringify(hudUiState),
    );
    if (hudSyncMetadataRef.current.updatedAt) {
      window.localStorage.setItem(
        getUserScopedStorageKey(HUD_UI_UPDATED_AT_STORAGE_KEY, userId),
        JSON.stringify(hudSyncMetadataRef.current.updatedAt),
      );
    } else {
      window.localStorage.removeItem(getUserScopedStorageKey(HUD_UI_UPDATED_AT_STORAGE_KEY, userId));
    }
  }, [hudUiState, taskTableLayoutPreferences, userId]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      getUserScopedStorageKey(DAILY_PLANNING_COLLAPSED_STORAGE_KEY, userId),
      JSON.stringify(isDailyPlanningCollapsed),
    );
  }, [isDailyPlanningCollapsed, userId]);

  useEffect(() => {
    return () => {
      if (hudCloudWriteTimeoutRef.current !== null) {
        window.clearTimeout(hudCloudWriteTimeoutRef.current);
        hudCloudWriteTimeoutRef.current = null;
      }
    };
  }, []);

  const setHudUiState = useCallback<Dispatch<SetStateAction<HudUiState>>>((updater) => {
    setHudUiStateState((current) => {
      const next = typeof updater === "function"
        ? (updater as (value: HudUiState) => HudUiState)(current)
        : updater;
      if (Object.is(next, current)) {
        return current;
      }
      hudSyncMetadataRef.current = {
        source: "local",
        updatedAt: new Date().toISOString(),
      };
      return next;
    });
  }, []);

  const setTaskTableLayoutPreferences = useCallback<Dispatch<SetStateAction<TaskTableLayoutPreferences>>>((updater) => {
    setTaskTableLayoutPreferencesState((current) => {
      const next = typeof updater === "function"
        ? (updater as (value: TaskTableLayoutPreferences) => TaskTableLayoutPreferences)(current)
        : updater;
      if (taskTableLayoutPreferencesEqual(next, current)) {
        return current;
      }
      hudSyncMetadataRef.current = {
        source: "local",
        updatedAt: new Date().toISOString(),
      };
      return next;
    });
  }, []);

  const activeTaskWorkspaceTab = taskWorkspaceTabsState.tabs.find((tab) => tab.id === taskWorkspaceTabsState.activeTabId)
    ?? taskWorkspaceTabsState.tabs[0]
    ?? DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0];

  const setTaskUiState = useCallback<Dispatch<SetStateAction<TaskUiState>>>((updater) => {
    setTaskWorkspaceTabsState((current) => {
      const activeTabId = current.activeTabId;
      const nextTabs = current.tabs.map((tab) => {
        if (tab.id !== activeTabId) {
          return tab;
        }
        const nextTaskUiState = typeof updater === "function"
          ? (updater as (value: TaskUiState) => TaskUiState)(tab.taskUiState)
          : updater;
        if (Object.is(nextTaskUiState, tab.taskUiState)) {
          return tab;
        }
        return {
          ...tab,
          taskUiState: nextTaskUiState,
        };
      });

      return {
        ...current,
        tabs: nextTabs,
      };
    });
  }, []);

  const setTaskWorkspaceRailHidden = useCallback((isRailHidden: boolean) => {
    setTaskWorkspaceTabsState((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => (
        tab.id === current.activeTabId
          ? { ...tab, isRailHidden }
          : tab
      )),
    }));
  }, []);

  const setActiveTaskWorkspaceTab = useCallback((tabId: string) => {
    setTaskWorkspaceTabsState((current) => (
      current.tabs.some((tab) => tab.id === tabId)
        ? { ...current, activeTabId: tabId }
        : current
    ));
  }, []);

  const createTaskWorkspaceTab = useCallback((seedState?: Partial<TaskWorkspaceTab>) => {
    setTaskWorkspaceTabsState((current) => {
      const nextIndex = current.tabs.length + 1;
      const id = seedState?.id && seedState.id.trim().length > 0 ? seedState.id : `workspace-${Date.now()}`;
      const nextTab: TaskWorkspaceTab = {
        id,
        isRailHidden: seedState?.isRailHidden === true,
        kind: seedState?.kind === "report" ? "report" : "tasks",
        label: seedState?.label?.trim() ? seedState.label.trim() : `Tab ${nextIndex}`,
        taskUiState: seedState?.taskUiState ?? activeTaskWorkspaceTab.taskUiState,
      };
      return {
        activeTabId: id,
        tabs: [...current.tabs, nextTab],
        uiStateVersion: current.uiStateVersion,
      };
    });
  }, [activeTaskWorkspaceTab.taskUiState]);

  const closeTaskWorkspaceTab = useCallback((tabId: string) => {
    setTaskWorkspaceTabsState((current) => {
      const targetTab = current.tabs.find((tab) => tab.id === tabId);
      if (current.tabs.length <= 1 || !targetTab || targetTab.kind === "report") {
        return current;
      }

      const nextTabs = current.tabs.filter((tab) => tab.id !== tabId);
      const nextActiveTabId = current.activeTabId === tabId
        ? nextTabs[Math.max(0, current.tabs.findIndex((tab) => tab.id === tabId) - 1)]?.id ?? nextTabs[0].id
        : current.activeTabId;

      return {
        ...current,
        activeTabId: nextActiveTabId,
        tabs: nextTabs,
      };
    });
  }, []);

  const renameTaskWorkspaceTab = useCallback((tabId: string, label: string) => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      return;
    }
    setTaskWorkspaceTabsState((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => (
        tab.id === tabId && tab.kind !== "report"
          ? { ...tab, label: trimmedLabel }
          : tab
      )),
    }));
  }, []);

  useEffect(() => {
    if (hudCloudWriteTimeoutRef.current !== null) {
      window.clearTimeout(hudCloudWriteTimeoutRef.current);
      hudCloudWriteTimeoutRef.current = null;
    }

    if (!supabase || !userId || !hudCloudReadyRef.current || !hudCloudSupportedRef.current) {
      return;
    }

    const metadata = hudSyncMetadataRef.current;
    if (metadata.source !== "local" || !metadata.updatedAt) {
      return;
    }

    const payloadTimestamp = metadata.updatedAt;
    const payloadState = buildTaskUiSettingsEnvelope(hudUiState, taskTableLayoutPreferences);

    hudCloudWriteTimeoutRef.current = window.setTimeout(() => {
      void supabase
        .from("adhdice_hud_ui_settings")
        .upsert({
          client_updated_at: payloadTimestamp,
          hud_state: payloadState as unknown as Record<string, unknown>,
          user_id: userId,
        })
        .then(({ error }) => {
          if (error) {
            if (isMissingHudUiSettingsTableError(error.message)) {
              hudCloudSupportedRef.current = false;
              if (!hudMissingTableWarnedRef.current) {
                console.warn("[hud] HUD cloud sync table is unavailable. Falling back to local-only HUD persistence until `supabase/add_hud_ui_settings.sql` is applied.");
                hudMissingTableWarnedRef.current = true;
              }
              return;
            }
            console.warn("[hud] HUD cloud sync write failed. Continuing with local-only HUD persistence.", error.message);
            return;
          }

          hudCloudSignatureRef.current = `${payloadTimestamp}:${JSON.stringify(payloadState)}`;
        });
    }, HUD_CLOUD_WRITE_DEBOUNCE_MS);

    return () => {
      if (hudCloudWriteTimeoutRef.current !== null) {
        window.clearTimeout(hudCloudWriteTimeoutRef.current);
        hudCloudWriteTimeoutRef.current = null;
      }
    };
  }, [hudUiState, supabase, taskTableLayoutPreferences, userId]);

  useEffect(() => {
    if (hudCloudWriteTimeoutRef.current !== null) {
      window.clearTimeout(hudCloudWriteTimeoutRef.current);
      hudCloudWriteTimeoutRef.current = null;
    }
    if (hudCloudChannelRef.current && supabase) {
      void supabase.removeChannel(hudCloudChannelRef.current);
      hudCloudChannelRef.current = null;
    }

    hudCloudReadyRef.current = false;
    hudCloudSupportedRef.current = false;
    hudCloudSignatureRef.current = null;

    if (!userId || !supabase) {
      hudCloudReadyRef.current = true;
      return;
    }

    let isActive = true;
    const client = supabase;
    const currentUserId = userId;

    function applyRemoteHudState(nextState: HudUiState, updatedAt: string | null) {
      hudSyncMetadataRef.current = {
        source: "remote",
        updatedAt,
      };
      setHudUiStateState((current) => {
        const currentSignature = JSON.stringify(current);
        const nextSignature = JSON.stringify(nextState);
        if (currentSignature === nextSignature) {
          return current;
        }
        return nextState;
      });
    }

    function applyRemoteTaskTableLayoutPreferences(nextPreferences: TaskTableLayoutPreferences) {
      setTaskTableLayoutPreferencesState((current) => (
        taskTableLayoutPreferencesEqual(current, nextPreferences) ? current : nextPreferences
      ));
    }

    async function pushLocalHudStateToCloud(updatedAt: string) {
      const currentHudState = hudUiStateRef.current;
      const currentTaskTableLayoutPreferences = taskTableLayoutPreferencesRef.current;
      const payloadState = buildTaskUiSettingsEnvelope(currentHudState, currentTaskTableLayoutPreferences);
      const signature = `${updatedAt}:${JSON.stringify(payloadState)}`;
      if (hudCloudSignatureRef.current === signature) {
        return;
      }

      const { error } = await client
        .from("adhdice_hud_ui_settings")
        .upsert({
          client_updated_at: updatedAt,
          hud_state: payloadState as unknown as Record<string, unknown>,
          user_id: currentUserId,
        });

      if (!isActive) {
        return;
      }

      if (error) {
        if (isMissingHudUiSettingsTableError(error.message)) {
          hudCloudSupportedRef.current = false;
          hudCloudReadyRef.current = true;
          if (!hudMissingTableWarnedRef.current) {
            console.warn("[hud] HUD cloud sync table is unavailable. Falling back to local-only HUD persistence until `supabase/add_hud_ui_settings.sql` is applied.");
            hudMissingTableWarnedRef.current = true;
          }
          return;
        }
        console.warn("[hud] HUD cloud sync seed failed. Continuing with local-only HUD persistence.", error.message);
        hudCloudReadyRef.current = true;
        return;
      }

      hudCloudSignatureRef.current = signature;
    }

    async function loadCloudHudState() {
      const result = await client
        .from("adhdice_hud_ui_settings")
        .select("user_id, hud_state, created_at, updated_at, client_updated_at")
        .eq("user_id", currentUserId)
        .maybeSingle();
      const data = result.data as HudSyncRow | null;
      const error = result.error;

      if (!isActive) {
        return;
      }

      if (error) {
        if (isMissingHudUiSettingsTableError(error.message)) {
          hudCloudSupportedRef.current = false;
          hudCloudReadyRef.current = true;
          if (!hudMissingTableWarnedRef.current) {
            console.warn("[hud] HUD cloud sync table is unavailable. Falling back to local-only HUD persistence until `supabase/add_hud_ui_settings.sql` is applied.");
            hudMissingTableWarnedRef.current = true;
          }
          return;
        }

        console.warn("[hud] HUD cloud sync load failed. Continuing with local-only HUD persistence.", error.message);
        hudCloudReadyRef.current = true;
        return;
      }

      hudCloudSupportedRef.current = true;
      const localTimestamp = hudSyncMetadataRef.current.updatedAt;
      const localStateExists = hasStoredHudState(currentUserId)
        || window.localStorage.getItem(getUserScopedStorageKey(TASK_TABLE_LAYOUT_STORAGE_KEY, currentUserId)) !== null;

      if (!data) {
        hudCloudReadyRef.current = true;
        if (localStateExists) {
          await pushLocalHudStateToCloud(localTimestamp ?? new Date().toISOString());
        }
      } else {
        const remoteTimestamp = normalizeStoredTimestamp(data.client_updated_at ?? data.updated_at);
        const splitRemoteState = splitTaskUiSettingsEnvelope(data.hud_state ?? DEFAULT_HUD_UI_STATE);
        const normalizedRemoteState = normalizeHudUiState(splitRemoteState.hudUiStateValue ?? DEFAULT_HUD_UI_STATE);
        if (isRemoteNewerThanLocal(remoteTimestamp, localTimestamp)) {
          applyRemoteHudState(normalizedRemoteState, remoteTimestamp);
          applyRemoteTaskTableLayoutPreferences(splitRemoteState.taskTableLayoutPreferences);
        } else if (localStateExists) {
          await pushLocalHudStateToCloud(localTimestamp ?? new Date().toISOString());
        } else {
          applyRemoteHudState(normalizedRemoteState, remoteTimestamp);
          applyRemoteTaskTableLayoutPreferences(splitRemoteState.taskTableLayoutPreferences);
        }
        hudCloudReadyRef.current = true;
      }

      if (!isActive) {
        return;
      }
    }

    void loadCloudHudState().then(() => {
      if (!isActive || !hudCloudSupportedRef.current || hudCloudChannelRef.current) {
        return;
      }

      const nextChannel = client
        .channel(`adhdice_hud_ui_settings:${currentUserId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            filter: `user_id=eq.${currentUserId}`,
            schema: "public",
            table: "adhdice_hud_ui_settings",
          },
          () => {
            if (!isActive) {
              return;
            }
            void loadCloudHudState();
          },
        )
        .subscribe((status) => {
          if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && !hudMissingTableWarnedRef.current) {
            console.warn("[hud] HUD realtime sync subscription failed. Continuing with local HUD state.");
          }
        });

      hudCloudChannelRef.current = nextChannel;
    });

    return () => {
      isActive = false;
      if (hudCloudWriteTimeoutRef.current !== null) {
        window.clearTimeout(hudCloudWriteTimeoutRef.current);
        hudCloudWriteTimeoutRef.current = null;
      }
      if (hudCloudChannelRef.current) {
        void client.removeChannel(hudCloudChannelRef.current);
        hudCloudChannelRef.current = null;
      }
    };
  }, [supabase, userId]);

  return {
    activePage,
    focusedTaskIdsByDate,
    hudUiState,
    isDailyPlanningCollapsed,
    isRestoringPersistedUiState,
    isTaskFiltersOpen,
    pendingTaskEditorRestore,
    activeTaskWorkspaceTab,
    closeTaskWorkspaceTab,
    createTaskWorkspaceTab,
    renameTaskWorkspaceTab,
    setActivePage,
    setActiveTaskWorkspaceTab,
    setFocusedTaskIdsByDate,
    setHudUiState,
    setTaskWorkspaceRailHidden,
    setTaskTableLayoutPreferences,
    setIsDailyPlanningCollapsed,
    setIsTaskFiltersOpen,
    setPendingTaskEditorRestore,
    setTaskGridLayout,
    setTaskRouting,
    taskWorkspaceTabsState,
    setTaskUiState,
    taskTableLayoutPreferences,
    taskGridLayout,
    taskRouting,
    taskUiState: activeTaskWorkspaceTab.taskUiState,
  };
}
