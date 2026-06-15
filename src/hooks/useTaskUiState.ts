"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import { isMissingHudUiSettingsTableError } from "@/lib/task-db-compat";
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
  const [taskUiState, setTaskUiState] = useState<TaskUiState>(DEFAULT_TASK_UI_STATE);
  const [taskRouting, setTaskRouting] = useState<Record<string, TaskRoutingBucket>>({});
  const [focusedTaskIdsByDate, setFocusedTaskIdsByDate] = useState<Record<string, string[]>>({});
  const [taskGridLayout, setTaskGridLayout] = useState<TTaskGridItem[]>(taskGridStarterLayout);
  const [hudUiState, setHudUiStateState] = useState<HudUiState>(() => (userId ? readStoredHudState(userId) : createDefaultHudState()));
  const [isTaskFiltersOpen, setIsTaskFiltersOpen] = useState(false);
  const [isDailyPlanningCollapsed, setIsDailyPlanningCollapsed] = useState(false);
  const [pendingTaskEditorRestore, setPendingTaskEditorRestore] = useState<PersistedTaskEditorUiState | null>(null);
  const [restoredUserId, setRestoredUserId] = useState<string | null>(null);
  const hudUiStateRef = useRef(hudUiState);
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

  useLayoutEffect(() => {
    if (!userId) {
      setActivePage("Home");
      setTaskUiState(DEFAULT_TASK_UI_STATE);
      setTaskRouting({});
      setFocusedTaskIdsByDate({});
      setTaskGridLayout(taskGridStarterLayout);
      setHudUiStateState(createDefaultHudState());
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
    setHudUiStateState(readStoredHudState(userId));
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
    if (hudSyncMetadataRef.current.updatedAt) {
      window.localStorage.setItem(
        getUserScopedStorageKey(HUD_UI_UPDATED_AT_STORAGE_KEY, userId),
        JSON.stringify(hudSyncMetadataRef.current.updatedAt),
      );
    } else {
      window.localStorage.removeItem(getUserScopedStorageKey(HUD_UI_UPDATED_AT_STORAGE_KEY, userId));
    }
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
    const payloadState = hudUiState;

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
  }, [hudUiState, supabase, userId]);

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

    async function pushLocalHudStateToCloud(updatedAt: string) {
      const currentHudState = hudUiStateRef.current;
      const signature = `${updatedAt}:${JSON.stringify(currentHudState)}`;
      if (hudCloudSignatureRef.current === signature) {
        return;
      }

      const { error } = await client
        .from("adhdice_hud_ui_settings")
        .upsert({
          client_updated_at: updatedAt,
          hud_state: currentHudState as unknown as Record<string, unknown>,
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
      const localStateExists = hasStoredHudState(currentUserId);

      if (!data) {
        hudCloudReadyRef.current = true;
        if (localStateExists) {
          await pushLocalHudStateToCloud(localTimestamp ?? new Date().toISOString());
        }
      } else {
        const remoteTimestamp = normalizeStoredTimestamp(data.client_updated_at ?? data.updated_at);
        const normalizedRemoteState = normalizeHudUiState(data.hud_state ?? DEFAULT_HUD_UI_STATE);
        if (isRemoteNewerThanLocal(remoteTimestamp, localTimestamp)) {
          applyRemoteHudState(normalizedRemoteState, remoteTimestamp);
        } else if (localStateExists) {
          await pushLocalHudStateToCloud(localTimestamp ?? new Date().toISOString());
        } else {
          applyRemoteHudState(normalizedRemoteState, remoteTimestamp);
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
