"use client";

import { startTransition, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { RealtimeChannel, User } from "@supabase/supabase-js";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import type { FocusCategory, HistoricalFocusSession } from "@/lib/types";
import type {
  FocusCategory as DbFocusCategory,
  FocusSession as DbFocusSession,
  Task,
  TaskActualTimeEntry as DbTaskActualTimeEntry,
  TaskFocusDay as DbTaskFocusDay,
  TaskGridLayout as DbTaskGridLayout,
  TaskHistory as DbTaskHistory,
  TaskList as DbTaskList,
  TaskListManualMembership as DbTaskListManualMembership,
  TaskSubtask as DbTaskSubtask,
  UserProfile as DbUserProfile,
} from "@/lib/database.types";
import type { TaskEditorLinkedNote } from "@/lib/task-notes";
import type { TaskListDefinition, TaskListManualMembership } from "@/lib/task-lists";
import type { AppPage } from "@/lib/task-ui-state";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
type ResolvedSupabaseClient = NonNullable<SupabaseClient>;
type TaskGridLayoutItem = { h: number; id: string; type: string; w: number; x: number; y: number };

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type UseWorkspaceDataOptions<TTaskGridItem extends TaskGridLayoutItem> = {
  activePage: AppPage;
  currentUser: User | null | undefined;
  mapActiveSessions: (rows: Array<{ accumulated_seconds: number; category_id: string; is_running: boolean; start_time: string | null }>) => Record<string, {
    accumulatedSeconds: number;
    categoryId: string;
    isRunning: boolean;
    startTime: number | null;
  }>;
  mapFocusCategoryRow: (row: DbFocusCategory) => FocusCategory;
  mapFocusSessionRow: (row: DbFocusSession) => HistoricalFocusSession;
  mapTaskFocusDayRows: (rows: DbTaskFocusDay[], tasks: Task[]) => Record<string, string[]>;
  mapTaskHistoryRow: (row: DbTaskHistory) => DbTaskHistory;
  mapTaskListManualMembershipRow: (row: DbTaskListManualMembership) => TaskListManualMembership;
  mapTaskListRow: (row: DbTaskList) => TaskListDefinition | null;
  mapTaskSubtaskRow: (row: DbTaskSubtask) => DbTaskSubtask;
  mergeStoredFocusCategories: (categories: FocusCategory[]) => FocusCategory[];
  mergeStoredFocusHistory: (history: HistoricalFocusSession[]) => HistoricalFocusSession[];
  migrateLocalFocusState: (client: ResolvedSupabaseClient, user: User) => Promise<boolean>;
  migrateLocalTaskFocusDays: (client: ResolvedSupabaseClient, user: User) => Promise<boolean>;
  isMissingTaskListManualMembershipsTableError: (message: string) => boolean;
  isMissingTaskListsTableError: (message: string) => boolean;
  onProfileLoaded: (profileRow: DbUserProfile | null, user: User) => void;
  resolveTaskGridLayout: (row: DbTaskGridLayout | null) => TTaskGridItem[];
  saveFocusCategories: (categories: FocusCategory[]) => void;
  saveFocusHistory: (history: HistoricalFocusSession[]) => void;
  shouldSkipTaskReload?: (change: { eventType: string; taskId: string | null }) => boolean;
  setActiveSessions: Dispatch<SetStateAction<Record<string, {
    accumulatedSeconds: number;
    categoryId: string;
    isRunning: boolean;
    startTime: number | null;
  }>>>;
  setAvailableTaskNotes: Dispatch<SetStateAction<TaskEditorLinkedNote[]>>;
  setEconomy: Dispatch<SetStateAction<{ level: number; points: number; tokens: number; xp: number }>>;
  setFocusCategories: Dispatch<SetStateAction<FocusCategory[]>>;
  setFocusHistory: Dispatch<SetStateAction<HistoricalFocusSession[]>>;
  setFocusedTaskIdsByDate: Dispatch<SetStateAction<Record<string, string[]>>>;
  setIsGridEditMode: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setSelectedGridWidgetId: Dispatch<SetStateAction<string | null>>;
  setTaskActualTimeEntries: Dispatch<SetStateAction<DbTaskActualTimeEntry[]>>;
  setTaskGridLayout: Dispatch<SetStateAction<TTaskGridItem[]>>;
  setTaskHistory: Dispatch<SetStateAction<DbTaskHistory[]>>;
  setTaskListManualMemberships: Dispatch<SetStateAction<TaskListManualMembership[]>>;
  setTaskLists: Dispatch<SetStateAction<TaskListDefinition[]>>;
  setTaskSubtasks: Dispatch<SetStateAction<DbTaskSubtask[]>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  suppressCategoryReload: MutableRefObject<boolean>;
  supabase: SupabaseClient;
  taskGridStarterLayout: TTaskGridItem[];
};

function shouldLoadSecondaryForPage(activePage: AppPage) {
  return activePage === "Stats" || activePage === "Notes" || activePage === "Focus";
}

const TASK_RESUME_SYNC_DEBOUNCE_MS = 450;
const TASK_RESUME_SYNC_COOLDOWN_MS = 1500;

export function useWorkspaceData<TTaskGridItem extends TaskGridLayoutItem>({
  activePage,
  currentUser,
  mapActiveSessions,
  mapFocusCategoryRow,
  mapFocusSessionRow,
  mapTaskFocusDayRows,
  mapTaskHistoryRow,
  mapTaskListManualMembershipRow,
  mapTaskListRow,
  mapTaskSubtaskRow,
  mergeStoredFocusCategories,
  mergeStoredFocusHistory,
  migrateLocalFocusState,
  migrateLocalTaskFocusDays,
  isMissingTaskListManualMembershipsTableError,
  isMissingTaskListsTableError,
  onProfileLoaded,
  resolveTaskGridLayout,
  saveFocusCategories,
  saveFocusHistory,
  shouldSkipTaskReload,
  setActiveSessions,
  setAvailableTaskNotes,
  setEconomy,
  setFocusCategories,
  setFocusHistory,
  setFocusedTaskIdsByDate,
  setIsGridEditMode,
  setMessage,
  setSelectedGridWidgetId,
  setTaskActualTimeEntries,
  setTaskGridLayout,
  setTaskHistory,
  setTaskListManualMemberships,
  setTaskLists,
  setTaskSubtasks,
  setTasks,
  suppressCategoryReload,
  supabase,
  taskGridStarterLayout,
}: UseWorkspaceDataOptions<TTaskGridItem>) {
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [isSoftWorkspaceRefreshing, setIsSoftWorkspaceRefreshing] = useState(false);
  const [isTaskResumeSyncPending, setIsTaskResumeSyncPending] = useState(false);
  const hasLoadedSecondaryDataRef = useRef(false);
  const secondaryLoadInFlightRef = useRef(false);
  const taskReloadInFlightRef = useRef(false);
  const queuedTaskReloadRef = useRef(false);
  const taskChannelRef = useRef<RealtimeChannel | null>(null);
  const taskChannelStatusRef = useRef<string>("CLOSED");
  const taskResumeSyncTimeoutRef = useRef<number | null>(null);
  const taskResumeSyncQueuedRef = useRef(false);
  const lastTaskResumeSyncAtRef = useRef(0);
  const taskResumeSyncInFlightRef = useRef(false);
  const softWorkspaceRefreshRef = useRef<(() => Promise<void>) | null>(null);
  const prepareTaskMutationRef = useRef<(() => Promise<boolean>) | null>(null);

  useEffect(() => {
    if (!supabase || !currentUser) {
      hasLoadedSecondaryDataRef.current = false;
      secondaryLoadInFlightRef.current = false;
      taskReloadInFlightRef.current = false;
      queuedTaskReloadRef.current = false;
      taskChannelRef.current = null;
      taskChannelStatusRef.current = "CLOSED";
      taskResumeSyncQueuedRef.current = false;
      lastTaskResumeSyncAtRef.current = 0;
      taskResumeSyncInFlightRef.current = false;
      softWorkspaceRefreshRef.current = null;
      prepareTaskMutationRef.current = null;
      if (taskResumeSyncTimeoutRef.current !== null) {
        window.clearTimeout(taskResumeSyncTimeoutRef.current);
        taskResumeSyncTimeoutRef.current = null;
      }
      return;
    }

    const client = supabase;
    const user = currentUser;
    const userId = user.id;
    let isActive = true;
    let taskChannel: RealtimeChannel | null = null;

    function createTaskRowsRequest() {
      return client
        .from("adhdice_clean_tasks")
        .select("*")
        .eq("user_id", userId)
        .order("status", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
    }

    async function reloadTaskRows({ silent = false }: { silent?: boolean } = {}) {
      if (!isActive) {
        return;
      }

      if (taskReloadInFlightRef.current) {
        queuedTaskReloadRef.current = true;
        return;
      }

      taskReloadInFlightRef.current = true;

      try {
        do {
          queuedTaskReloadRef.current = false;
          const taskResult = await createTaskRowsRequest();

          if (!isActive) {
            return;
          }

          if (taskResult.error) {
            if (!silent) {
              setMessage({ tone: "warn", text: taskResult.error.message ?? "Could not refresh your tasks." });
            }
            return;
          }

          startTransition(() => {
            setTasks(taskResult.data ?? []);
          });
        } while (queuedTaskReloadRef.current && isActive);
      } finally {
        taskReloadInFlightRef.current = false;
      }
    }

    function shouldReconnectTaskChannel() {
      return (
        taskChannelRef.current === null
        || taskChannelStatusRef.current === "CLOSED"
        || taskChannelStatusRef.current === "TIMED_OUT"
        || taskChannelStatusRef.current === "CHANNEL_ERROR"
      );
    }

    function subscribeTaskChannel() {
      taskChannelStatusRef.current = "SUBSCRIBING";
      const nextTaskChannel = client
        .channel(`adhdice_tasks:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "adhdice_clean_tasks",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const taskId = ((payload.new as { id?: string } | null)?.id ?? (payload.old as { id?: string } | null)?.id ?? null);
            if (shouldSkipTaskReload?.({ eventType: payload.eventType, taskId })) {
              return;
            }
            void reloadTaskRows({ silent: true });
          },
        )
        .subscribe((status) => {
          taskChannelStatusRef.current = status;
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn(
              "[workspace] Task realtime subscription failed. If cross-client task sync stays stale, confirm Realtime is enabled and `adhdice_clean_tasks` is included in the Supabase realtime publication.",
            );
          }
        });

      taskChannelRef.current = nextTaskChannel;
      taskChannel = nextTaskChannel;
    }

    function ensureTaskChannelSubscribed() {
      if (!shouldReconnectTaskChannel()) {
        return;
      }

      const previousChannel = taskChannelRef.current;
      taskChannelRef.current = null;
      taskChannelStatusRef.current = "CLOSED";
      if (previousChannel) {
        void client.removeChannel(previousChannel);
        if (taskChannel === previousChannel) {
          taskChannel = null;
        }
      }
      subscribeTaskChannel();
    }

    function scheduleTaskResumeSync() {
      if (!isActive) {
        return;
      }

      taskResumeSyncQueuedRef.current = true;
      setIsTaskResumeSyncPending(true);
      const now = Date.now();
      const msSinceLastResumeSync = now - lastTaskResumeSyncAtRef.current;
      const delay = msSinceLastResumeSync >= TASK_RESUME_SYNC_COOLDOWN_MS
        ? TASK_RESUME_SYNC_DEBOUNCE_MS
        : Math.max(TASK_RESUME_SYNC_DEBOUNCE_MS, TASK_RESUME_SYNC_COOLDOWN_MS - msSinceLastResumeSync);

      if (taskResumeSyncTimeoutRef.current !== null) {
        window.clearTimeout(taskResumeSyncTimeoutRef.current);
      }

      taskResumeSyncTimeoutRef.current = window.setTimeout(() => {
        taskResumeSyncTimeoutRef.current = null;

        if (!isActive || !taskResumeSyncQueuedRef.current) {
          return;
        }

        taskResumeSyncQueuedRef.current = false;
        lastTaskResumeSyncAtRef.current = Date.now();
        void runSoftWorkspaceRefresh({ includeSecondaryIfLoaded: true, source: "resume" });
      }, delay);
    }

    async function loadSecondaryWorkspaceData({ silent = false }: { silent?: boolean } = {}) {
      if (!isActive || secondaryLoadInFlightRef.current) {
        return;
      }

      secondaryLoadInFlightRef.current = true;
      const [taskHistoryResult, taskActualTimeEntriesResult, noteResult, historyResult] = await Promise.all([
        client
          .from("adhdice_task_history")
          .select("*")
          .eq("user_id", userId)
          .order("entry_date", { ascending: false })
          .order("created_at", { ascending: false }),
        client
          .from("adhdice_task_actual_time_entries")
          .select("*")
          .eq("user_id", userId)
          .order("entry_date", { ascending: false })
          .order("created_at", { ascending: false }),
        client
          .from("adhdice_notes")
          .select("id,title,body,linked_task_ids,updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false }),
        client
          .from("adhdice_focus_sessions")
          .select("*")
          .eq("user_id", userId)
          .order("session_date", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);
      secondaryLoadInFlightRef.current = false;

      if (!isActive) {
        return;
      }

      const errors = [taskHistoryResult.error, taskActualTimeEntriesResult.error, noteResult.error, historyResult.error].filter(Boolean);
      if (errors.length > 0) {
        if (!silent) {
          setMessage({ tone: "warn", text: errors[0]?.message ?? "Could not finish loading workspace details." });
        }
        return;
      }

      const nextFocusHistory = mergeStoredFocusHistory((historyResult.data ?? []).map((row) => mapFocusSessionRow(row)));
      setTaskHistory((taskHistoryResult.data ?? []).map(mapTaskHistoryRow));
      setTaskActualTimeEntries(taskActualTimeEntriesResult.data ?? []);
      setAvailableTaskNotes((noteResult.data ?? []) as TaskEditorLinkedNote[]);
      setFocusHistory(nextFocusHistory);
      saveFocusHistory(nextFocusHistory);
      hasLoadedSecondaryDataRef.current = true;
    }

    async function loadCoreWorkspaceData({ silent = false }: { silent?: boolean } = {}) {
      if (!silent) {
        setIsWorkspaceLoading(true);
      }

      const loadStartedAt = performance.now();
      const taskRequest = createTaskRowsRequest();
      const taskSubtasksRequest = client
        .from("adhdice_task_subtasks")
        .select("*")
        .eq("user_id", userId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      const profileRequest = client
        .from("adhdice_user_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      const criticalCoreRequest = Promise.all([
        taskRequest,
        taskSubtasksRequest,
        profileRequest,
      ]);
      const secondaryCoreRequest = Promise.all([
        client
          .from("adhdice_focus_categories")
          .select("*")
          .eq("user_id", userId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        client
          .from("adhdice_focus_active_sessions")
          .select("*")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false }),
        client
          .from("adhdice_focus_sessions")
          .select("*")
          .eq("user_id", userId)
          .order("session_date", { ascending: false })
          .order("created_at", { ascending: false }),
        client
          .from("adhdice_task_focus_days")
          .select("*")
          .eq("user_id", userId)
          .order("focus_date", { ascending: false }),
        client
          .from("adhdice_task_lists")
          .select("*")
          .eq("user_id", userId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        client
          .from("adhdice_task_list_manual_memberships")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
        client
          .from("adhdice_task_grid_layouts")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      const [taskResult, taskSubtasksResult, profileResult] = await criticalCoreRequest;

      if (!isActive) {
        return;
      }

      const criticalErrors = [
        taskResult.error,
        taskSubtasksResult.error,
        profileResult.error,
      ].filter(Boolean);

      if (criticalErrors.length > 0) {
        setMessage({ tone: "warn", text: criticalErrors[0]?.message ?? "Could not load your tasks." });
        setIsWorkspaceLoading(false);
        return;
      }

      const nextTaskSubtasks = (taskSubtasksResult.data ?? []).map(mapTaskSubtaskRow);
      setIsWorkspaceLoading(false);
      startTransition(() => {
        setTasks(taskResult.data ?? []);
        setTaskSubtasks(nextTaskSubtasks);
        onProfileLoaded(profileResult.data ?? null, user);
        if (profileResult.data) {
          setEconomy({
            level: profileResult.data.level ?? 1,
            xp: profileResult.data.xp ?? 0,
            points: profileResult.data.points ?? 0,
            tokens: profileResult.data.tokens ?? 0,
          });
        }
      });

      if (process.env.NODE_ENV !== "production") {
        console.info(`[workspace] Tasks ready in ${Math.round(performance.now() - loadStartedAt)}ms.`);
      }

      const [categoryResult, activeResult, historyResult, focusDayResult, taskListsResult, manualMembershipResult, gridLayoutResult] = await secondaryCoreRequest;

      if (!isActive) {
        return;
      }

      const secondaryErrors = [
        categoryResult.error,
        activeResult.error,
        historyResult.error,
        focusDayResult.error,
        taskListsResult.error && !isMissingTaskListsTableError(taskListsResult.error.message) ? taskListsResult.error : null,
        manualMembershipResult.error && !isMissingTaskListManualMembershipsTableError(manualMembershipResult.error.message) ? manualMembershipResult.error : null,
        gridLayoutResult.error,
      ].filter(Boolean);

      if (secondaryErrors.length > 0) {
        setMessage({ tone: "warn", text: secondaryErrors[0]?.message ?? "Could not finish loading workspace details." });
        return;
      }

      let nextCategories = mergeStoredFocusCategories((categoryResult.data ?? []).map(mapFocusCategoryRow));
      let nextActiveSessions = mapActiveSessions(activeResult.data ?? []);
      let nextFocusHistory = mergeStoredFocusHistory((historyResult.data ?? []).map((row) => mapFocusSessionRow(row)));
      let nextFocusedTaskIdsByDate = mapTaskFocusDayRows(focusDayResult.data ?? [], taskResult.data ?? []);
      const nextTaskLists = (taskListsResult.error && isMissingTaskListsTableError(taskListsResult.error.message))
        ? []
        : (taskListsResult.data ?? []).map(mapTaskListRow).filter((list): list is TaskListDefinition => list !== null);
      const nextTaskListManualMemberships = (manualMembershipResult.error && isMissingTaskListManualMembershipsTableError(manualMembershipResult.error.message))
        ? []
        : (manualMembershipResult.data ?? []).map(mapTaskListManualMembershipRow);
      const nextTaskGridLayout = resolveTaskGridLayout(gridLayoutResult.data);

      if (
        nextCategories.length === 0 &&
        Object.keys(nextActiveSessions).length === 0 &&
        nextFocusHistory.length === 0
      ) {
        const migrated = await migrateLocalFocusState(client, user);
        if (migrated) {
          const [freshCategories, freshActive, freshHistory] = await Promise.all([
            client
              .from("adhdice_focus_categories")
              .select("*")
              .eq("user_id", userId)
              .order("sort_order", { ascending: true })
              .order("created_at", { ascending: true }),
            client
              .from("adhdice_focus_active_sessions")
              .select("*")
              .eq("user_id", userId)
              .order("updated_at", { ascending: false }),
            client
              .from("adhdice_focus_sessions")
              .select("*")
              .eq("user_id", userId)
              .order("session_date", { ascending: false })
              .order("created_at", { ascending: false }),
          ]);

          if (!freshCategories.error && freshCategories.data) {
            nextCategories = mergeStoredFocusCategories(freshCategories.data.map(mapFocusCategoryRow));
          }
          if (!freshActive.error && freshActive.data) {
            nextActiveSessions = mapActiveSessions(freshActive.data);
          }
          if (!freshHistory.error && freshHistory.data) {
            nextFocusHistory = mergeStoredFocusHistory(freshHistory.data.map((row) => mapFocusSessionRow(row)));
          }
          if (!freshCategories.error && !freshActive.error && !freshHistory.error) {
            setMessage({
              tone: "good",
              text: "Imported your saved local focus data into your account.",
            });
          }
        }
      }

      if (Object.keys(nextFocusedTaskIdsByDate).length === 0) {
        const migratedTaskFocusDays = await migrateLocalTaskFocusDays(client, user);
        if (migratedTaskFocusDays) {
          const freshFocusDays = await client
            .from("adhdice_task_focus_days")
            .select("*")
            .eq("user_id", userId)
            .order("focus_date", { ascending: false });

          if (!freshFocusDays.error) {
            nextFocusedTaskIdsByDate = mapTaskFocusDayRows(freshFocusDays.data ?? [], taskResult.data ?? []);
            setMessage((previous) => previous ?? {
              tone: "good",
              text: "Imported your saved Focus Today selections into your account.",
            });
          }
        }
      }

      setFocusCategories(nextCategories);
      setActiveSessions(nextActiveSessions);
      setFocusHistory(nextFocusHistory);
      setFocusedTaskIdsByDate(nextFocusedTaskIdsByDate);
      setTaskLists(nextTaskLists);
      setTaskListManualMemberships(nextTaskListManualMemberships);
      setTaskGridLayout(nextTaskGridLayout);
      saveFocusCategories(nextCategories);
      saveFocusHistory(nextFocusHistory);

      if (process.env.NODE_ENV !== "production") {
        console.info(`[workspace] Background details ready in ${Math.round(performance.now() - loadStartedAt)}ms.`);
      }

      if (shouldLoadSecondaryForPage(activePage)) {
        void loadSecondaryWorkspaceData({ silent: true });
      } else {
        window.setTimeout(() => {
          void loadSecondaryWorkspaceData({ silent: true });
        }, 0);
      }
    }

    async function runSoftWorkspaceRefresh({
      includeSecondaryIfLoaded = false,
      source,
    }: {
      includeSecondaryIfLoaded?: boolean;
      source: "manual" | "mutation" | "resume";
    }) {
      if (!isActive || taskResumeSyncInFlightRef.current) {
        return;
      }

      taskResumeSyncInFlightRef.current = true;
      setIsSoftWorkspaceRefreshing(true);
      if (source === "resume" || source === "mutation") {
        setIsTaskResumeSyncPending(true);
      }

      try {
        ensureTaskChannelSubscribed();
        await loadCoreWorkspaceData({ silent: true });

        if (includeSecondaryIfLoaded && (hasLoadedSecondaryDataRef.current || shouldLoadSecondaryForPage(activePage))) {
          await loadSecondaryWorkspaceData({ silent: true });
        }
      } finally {
        taskResumeSyncInFlightRef.current = false;
        taskResumeSyncQueuedRef.current = false;
        setIsSoftWorkspaceRefreshing(false);
        setIsTaskResumeSyncPending(false);
      }
    }

    softWorkspaceRefreshRef.current = () => runSoftWorkspaceRefresh({
      includeSecondaryIfLoaded: true,
      source: "manual",
    });

    prepareTaskMutationRef.current = async () => {
      if (
        !taskResumeSyncQueuedRef.current
        && taskResumeSyncTimeoutRef.current === null
        && !taskResumeSyncInFlightRef.current
      ) {
        return false;
      }

      if (taskResumeSyncTimeoutRef.current !== null) {
        window.clearTimeout(taskResumeSyncTimeoutRef.current);
        taskResumeSyncTimeoutRef.current = null;
      }

      taskResumeSyncQueuedRef.current = false;
      lastTaskResumeSyncAtRef.current = Date.now();
      await runSoftWorkspaceRefresh({ includeSecondaryIfLoaded: false, source: "mutation" });
      return true;
    };

    void loadCoreWorkspaceData();
    subscribeTaskChannel();

    function handleDocumentVisibilityChange() {
      if (document.visibilityState === "visible") {
        scheduleTaskResumeSync();
      }
    }

    function handlePageShow() {
      scheduleTaskResumeSync();
    }

    function handleWindowFocus() {
      scheduleTaskResumeSync();
    }

    function handleWindowOnline() {
      scheduleTaskResumeSync();
    }

    function handlePageHide() {
      taskResumeSyncQueuedRef.current = true;
      setIsTaskResumeSyncPending(true);
    }

    document.addEventListener("visibilitychange", handleDocumentVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("online", handleWindowOnline);
    window.addEventListener("pagehide", handlePageHide);

    const workspaceChannel = client
      .channel(`adhdice_workspace:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_task_subtasks",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadCoreWorkspaceData({ silent: true });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_focus_categories",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          if (!suppressCategoryReload.current) {
            void loadCoreWorkspaceData({ silent: true });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_focus_active_sessions",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadCoreWorkspaceData({ silent: true });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_task_focus_days",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadCoreWorkspaceData({ silent: true });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_task_lists",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadCoreWorkspaceData({ silent: true });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_task_list_manual_memberships",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadCoreWorkspaceData({ silent: true });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_task_grid_layouts",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadCoreWorkspaceData({ silent: true });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_notes",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          if (hasLoadedSecondaryDataRef.current || shouldLoadSecondaryForPage(activePage)) {
            void loadSecondaryWorkspaceData({ silent: true });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_task_actual_time_entries",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          if (hasLoadedSecondaryDataRef.current || shouldLoadSecondaryForPage(activePage)) {
            void loadSecondaryWorkspaceData({ silent: true });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_task_history",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          if (hasLoadedSecondaryDataRef.current || shouldLoadSecondaryForPage(activePage)) {
            void loadSecondaryWorkspaceData({ silent: true });
          }
        },
      )
      .subscribe();

    return () => {
      isActive = false;
      document.removeEventListener("visibilitychange", handleDocumentVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("online", handleWindowOnline);
      window.removeEventListener("pagehide", handlePageHide);
      if (taskResumeSyncTimeoutRef.current !== null) {
        window.clearTimeout(taskResumeSyncTimeoutRef.current);
        taskResumeSyncTimeoutRef.current = null;
      }
      taskResumeSyncQueuedRef.current = false;
      taskResumeSyncInFlightRef.current = false;
      softWorkspaceRefreshRef.current = null;
      prepareTaskMutationRef.current = null;
      taskChannelRef.current = null;
      taskChannelStatusRef.current = "CLOSED";
      if (taskChannel) {
        void client.removeChannel(taskChannel);
      }
      void client.removeChannel(workspaceChannel);
    };
  }, [activePage, currentUser?.id, shouldSkipTaskReload, supabase, suppressCategoryReload]);

  useEffect(() => {
    if (!currentUser) {
      setTaskActualTimeEntries([]);
      setTaskHistory([]);
      setAvailableTaskNotes([]);
      setTaskGridLayout(taskGridStarterLayout);
      setIsGridEditMode(false);
      setSelectedGridWidgetId(null);
    }
  }, [
    currentUser,
    setAvailableTaskNotes,
    setIsGridEditMode,
    setSelectedGridWidgetId,
    setTaskActualTimeEntries,
    setTaskGridLayout,
    setTaskHistory,
    taskGridStarterLayout,
  ]);

  async function softRefreshWorkspace() {
    await softWorkspaceRefreshRef.current?.();
  }

  async function prepareTaskMutation() {
    return await prepareTaskMutationRef.current?.() ?? false;
  }

  return {
    isSoftWorkspaceRefreshing,
    isTaskResumeSyncPending,
    isWorkspaceLoading,
    prepareTaskMutation,
    softRefreshWorkspace,
  };
}
