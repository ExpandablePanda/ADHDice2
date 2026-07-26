"use client";

import { startTransition, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { RealtimeChannel, User } from "@supabase/supabase-js";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import type { FocusCategory, HistoricalFocusSession } from "@/lib/types";
import type {
  FocusCategory as DbFocusCategory,
  FocusSession as DbFocusSession,
  LegacySubtaskPromotion as DbLegacySubtaskPromotion,
  Task,
  TaskActualTimeEntry as DbTaskActualTimeEntry,
  TaskFocusDay as DbTaskFocusDay,
  TaskGridLayout as DbTaskGridLayout,
  TaskHistory as DbTaskHistory,
  TaskList as DbTaskList,
  TaskListContainer,
  TaskListFolder,
  TaskListRailItem,
  TaskListManualMembership as DbTaskListManualMembership,
  TaskSubtask as DbTaskSubtask,
} from "@/lib/database.types";
import { loadProfileMedia, setActiveProfileUserId, WORKSPACE_PROFILE_COLUMNS, type WorkspaceProfileRow } from "@/lib/profile-store";
import type { TaskEditorLinkedNote } from "@/lib/task-notes";
import { reconcileTaskListRows } from "@/lib/task-list-mappers";
import { loadTaskListFolders } from "@/lib/task-list-folders";
import type { TaskListDefinition, TaskListManualMembership } from "@/lib/task-lists";
import type { AppPage } from "@/lib/task-ui-state";
import {
  createWorkspaceRefreshCoordinator,
  createWorkspaceResumeRefreshCoordinator,
  type WorkspaceResumeRefreshReason,
} from "@/lib/workspace-refresh-coordinator";
import { workspaceStartupRequestRegistry } from "@/lib/workspace-startup-request";

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
  onProfileLoaded: (profileRow: WorkspaceProfileRow | null, user: User) => void;
  resolveTaskGridLayout: (row: DbTaskGridLayout | null) => TTaskGridItem[];
  saveFocusCategories: (categories: FocusCategory[]) => void;
  saveFocusHistory: (history: HistoricalFocusSession[]) => void;
  shouldSkipTaskReload?: (change: { eventType: string; taskId: string | null }) => boolean;
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
  setTaskListContainers: Dispatch<SetStateAction<TaskListContainer[]>>;
  setTaskListFolders: Dispatch<SetStateAction<TaskListFolder[]>>;
  setTaskListRailItems: Dispatch<SetStateAction<TaskListRailItem[]>>;
  setTaskLists: Dispatch<SetStateAction<TaskListDefinition[]>>;
  setTaskLegacySubtaskPromotions: Dispatch<SetStateAction<DbLegacySubtaskPromotion[]>>;
  setTaskSubtasks: Dispatch<SetStateAction<DbTaskSubtask[]>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  suppressCategoryReload: MutableRefObject<boolean>;
  supabase: SupabaseClient;
  taskGridStarterLayout: TTaskGridItem[];
  taskListDataGeneration: MutableRefObject<number>;
};

function shouldLoadSecondaryForPage(activePage: AppPage) {
  return activePage === "Stats" || activePage === "Notes" || activePage === "Focus";
}

const TASK_RESUME_SYNC_COOLDOWN_MS = 1500;
const TASK_HISTORY_PAGE_SIZE = 1000;
const isDevelopment = process.env.NODE_ENV !== "production";

function keepCurrentIfStructurallyEqual<T>(current: T, next: T) {
  return JSON.stringify(current) === JSON.stringify(next) ? current : next;
}

type PagedFetchResult<T> = {
  data: T[] | null;
  error: { message?: string } | null;
};

export async function fetchAllPagedRows<T>(
  fetchPage: (from: number, to: number) => Promise<PagedFetchResult<T>>,
  pageSize = TASK_HISTORY_PAGE_SIZE,
): Promise<PagedFetchResult<T>> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const pageResult = await fetchPage(from, from + pageSize - 1);
    if (pageResult.error) {
      return { data: null, error: pageResult.error };
    }

    const pageRows = pageResult.data ?? [];
    rows.push(...pageRows);

    if (pageRows.length < pageSize) {
      return { data: rows, error: null };
    }
  }
}

function logWorkspaceTiming(step: string, startedAt: number, details: Record<string, boolean | number | string> = {}) {
  if (!isDevelopment || typeof performance === "undefined") {
    return;
  }

  const detailString = Object.entries(details)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  console.info(`[workspace] ${step} in ${Math.round(performance.now() - startedAt)}ms${detailString ? ` ${detailString}` : ""}.`);
}

export function useWorkspaceData<TTaskGridItem extends TaskGridLayoutItem>({
  activePage,
  currentUser,
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
  setTaskListContainers,
  setTaskListFolders,
  setTaskListRailItems,
  setTaskLists,
  setTaskLegacySubtaskPromotions,
  setTaskSubtasks,
  setTasks,
  suppressCategoryReload,
  supabase,
  taskGridStarterLayout,
  taskListDataGeneration,
}: UseWorkspaceDataOptions<TTaskGridItem>) {
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [isSoftWorkspaceRefreshing, setIsSoftWorkspaceRefreshing] = useState(false);
  const [isTaskResumeSyncPending, setIsTaskResumeSyncPending] = useState(false);
  const [taskListMembershipDataReadyUserId, setTaskListMembershipDataReadyUserId] = useState<string | null>(null);
  const hasLoadedSecondaryDataRef = useRef(false);
  const hasLoadedTaskHistoryRef = useRef(false);
  const secondaryLoadInFlightRef = useRef(false);
  const taskHistoryLoadInFlightRef = useRef(false);
  const queuedTaskHistoryReloadRef = useRef(false);
  const taskHistoryLoadPromiseRef = useRef<Promise<boolean> | null>(null);
  const taskReloadInFlightRef = useRef(false);
  const queuedTaskReloadRef = useRef(false);
  const taskReloadPromiseRef = useRef<Promise<void> | null>(null);
  const taskChannelRef = useRef<RealtimeChannel | null>(null);
  const taskChannelStatusRef = useRef<string>("CLOSED");
  const taskChannelRemovalPromiseRef = useRef<Promise<void> | null>(null);
  const taskResumeSyncTimeoutRef = useRef<number | null>(null);
  const taskResumeSyncQueuedRef = useRef(false);
  const lastTaskResumeSyncAtRef = useRef(0);
  const taskResumeSyncInFlightRef = useRef(false);
  const activePageRef = useRef(activePage);
  const shouldSkipTaskReloadRef = useRef(shouldSkipTaskReload);
  const coreRefreshCoordinatorRef = useRef<{
    isRunning: () => boolean;
    request: (request: { silent: boolean; source: "initial" | "manual" | "mutation" | "realtime" | "resume" }) => Promise<void>;
  } | null>(null);
  const lastCoreRefreshCompletedAtRef = useRef(0);
  const initialCoreLoadActiveRef = useRef(false);
  const startupRequestUserIdRef = useRef<string | null>(null);
  const liveWorkspaceUserIdRef = useRef<string | null>(null);
  const taskChannelSubscriptionCountRef = useRef(0);
  const workspaceChannelSubscriptionCountRef = useRef(0);
  const taskChannelCleanupCountRef = useRef(0);
  const workspaceChannelCleanupCountRef = useRef(0);
  const softWorkspaceRefreshRef = useRef<(() => Promise<void>) | null>(null);
  const rolloverWorkspaceReconciliationRef = useRef<(() => Promise<void>) | null>(null);
  const prepareTaskMutationRef = useRef<(() => Promise<boolean>) | null>(null);

  useEffect(() => {
    activePageRef.current = activePage;
  }, [activePage]);

  useEffect(() => {
    shouldSkipTaskReloadRef.current = shouldSkipTaskReload;
  }, [shouldSkipTaskReload]);

  useEffect(() => {
    if (!supabase || !currentUser) {
      setActiveProfileUserId(null);
      workspaceStartupRequestRegistry.invalidate(startupRequestUserIdRef.current);
      startupRequestUserIdRef.current = null;
      liveWorkspaceUserIdRef.current = null;
      hasLoadedSecondaryDataRef.current = false;
      hasLoadedTaskHistoryRef.current = false;
      secondaryLoadInFlightRef.current = false;
      taskHistoryLoadInFlightRef.current = false;
      queuedTaskHistoryReloadRef.current = false;
      taskHistoryLoadPromiseRef.current = null;
      taskReloadInFlightRef.current = false;
      queuedTaskReloadRef.current = false;
      taskReloadPromiseRef.current = null;
      taskChannelRef.current = null;
      taskChannelStatusRef.current = "CLOSED";
      taskChannelRemovalPromiseRef.current = null;
      taskResumeSyncQueuedRef.current = false;
      lastTaskResumeSyncAtRef.current = 0;
      taskResumeSyncInFlightRef.current = false;
      coreRefreshCoordinatorRef.current = null;
      lastCoreRefreshCompletedAtRef.current = 0;
      initialCoreLoadActiveRef.current = false;
      softWorkspaceRefreshRef.current = null;
      rolloverWorkspaceReconciliationRef.current = null;
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
    setActiveProfileUserId(userId);
    if (startupRequestUserIdRef.current && startupRequestUserIdRef.current !== userId) {
      workspaceStartupRequestRegistry.invalidate(startupRequestUserIdRef.current);
      coreRefreshCoordinatorRef.current = null;
    }
    startupRequestUserIdRef.current = userId;
    liveWorkspaceUserIdRef.current = userId;
    let isActive = true;
    let taskChannel: RealtimeChannel | null = null;
    taskChannelSubscriptionCountRef.current = 0;
    workspaceChannelSubscriptionCountRef.current = 0;
    taskChannelCleanupCountRef.current = 0;
    workspaceChannelCleanupCountRef.current = 0;

    function createTaskRowsRequest() {
      return client
        .from("adhdice_clean_tasks")
        .select("*")
        .eq("user_id", userId)
        .order("status", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
    }

    async function reloadTaskRows({ silent = false, source = "realtime" }: { silent?: boolean; source?: string } = {}) {
      if (!isActive) {
        return;
      }

      if (taskReloadInFlightRef.current) {
        queuedTaskReloadRef.current = true;
        await taskReloadPromiseRef.current;
        return;
      }

      taskReloadInFlightRef.current = true;
      const taskReloadPromise = (async () => {
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
            const nextTasks = taskResult.data ?? [];
            setTasks((current) => keepCurrentIfStructurallyEqual(current, nextTasks));
          });
          if (isDevelopment && source === "rollover") {
            console.info("[workspace] Task rows reloaded source=rollover.");
          }
        } while (queuedTaskReloadRef.current && isActive);
        } finally {
          taskReloadInFlightRef.current = false;
          taskReloadPromiseRef.current = null;
        }
      })();
      taskReloadPromiseRef.current = taskReloadPromise;
      await taskReloadPromise;
    }

    function shouldReconnectTaskChannel() {
      return (
        taskChannelRef.current === null
        || taskChannelStatusRef.current === "CLOSED"
        || taskChannelStatusRef.current === "TIMED_OUT"
        || taskChannelStatusRef.current === "CHANNEL_ERROR"
      );
    }

    async function removeTaskChannel(channel: RealtimeChannel) {
      try {
        await client.removeChannel(channel);
        taskChannelCleanupCountRef.current += 1;
        if (isDevelopment) {
          console.info(`[workspace] Task realtime cleanup count=${taskChannelCleanupCountRef.current} userId=${userId}.`);
        }
      } catch {
        // Ignore cleanup races when visibility/focus events overlap.
      }
    }

    async function subscribeTaskChannel() {
      const subscribeStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
      const previousRemoval = taskChannelRemovalPromiseRef.current ?? Promise.resolve();
      await previousRemoval;

      if (!isActive) {
        return;
      }

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
            if (shouldSkipTaskReloadRef.current?.({ eventType: payload.eventType, taskId })) {
              return;
            }
            void reloadTaskRows({ silent: true });
          },
        )
        .subscribe((status) => {
          taskChannelStatusRef.current = status;
          if (status === "SUBSCRIBED") {
            logWorkspaceTiming("Task realtime subscribed", subscribeStartedAt, {
              userId,
            });
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn(
              "[workspace] Task realtime subscription failed. If cross-client task sync stays stale, confirm Realtime is enabled and `adhdice_clean_tasks` is included in the Supabase realtime publication.",
            );
          }
        });

      taskChannelRef.current = nextTaskChannel;
      taskChannelSubscriptionCountRef.current += 1;
      if (isDevelopment) {
        console.info(`[workspace] Task realtime subscribe count=${taskChannelSubscriptionCountRef.current} userId=${userId}.`);
      }
      taskChannelRemovalPromiseRef.current = null;
      taskChannel = nextTaskChannel;
    }

    async function ensureTaskChannelSubscribed() {
      if (!shouldReconnectTaskChannel()) {
        return;
      }

      const reconnectStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
      const previousStatus = taskChannelStatusRef.current;

      const previousChannel = taskChannelRef.current;
      taskChannelRef.current = null;
      taskChannelStatusRef.current = "CLOSED";
      if (previousChannel) {
        taskChannelRemovalPromiseRef.current = removeTaskChannel(previousChannel);
        if (taskChannel === previousChannel) {
          taskChannel = null;
        }
      }
      await subscribeTaskChannel();
      logWorkspaceTiming("Task channel reconnect path", reconnectStartedAt, {
        previousStatus,
      });
    }

    async function loadTaskHistory({
      silent = false,
      source = "secondary",
    }: {
      silent?: boolean;
      source?: "rollover" | "secondary";
    } = {}) {
      if ((!isActive && !canApplyCoreWorkspaceResult())) {
        return false;
      }

      if (taskHistoryLoadInFlightRef.current) {
        queuedTaskHistoryReloadRef.current = true;
        if (isDevelopment && source === "rollover") {
          console.info("[workspace] Rollover history reconciliation joined an in-flight history load.");
        }
        return await (taskHistoryLoadPromiseRef.current ?? Promise.resolve(false));
      }

      taskHistoryLoadInFlightRef.current = true;
      const taskHistoryLoadPromise = (async () => {
        try {
          do {
            queuedTaskHistoryReloadRef.current = false;
            const taskHistoryResult = await fetchAllPagedRows<DbTaskHistory>((from, to) => client
              .from("adhdice_task_history")
              .select("*")
              .eq("user_id", userId)
              .order("entry_date", { ascending: false })
              .order("created_at", { ascending: false })
              .range(from, to));

            if (!isActive && !canApplyCoreWorkspaceResult()) {
              return false;
            }

            if (taskHistoryResult.error) {
              if (!silent) {
                setMessage({ tone: "warn", text: taskHistoryResult.error.message ?? "Could not refresh your task history." });
              }
              return false;
            }

            const nextTaskHistory = (taskHistoryResult.data ?? []).map(mapTaskHistoryRow);
            setTaskHistory((current) => keepCurrentIfStructurallyEqual(current, nextTaskHistory));
            hasLoadedTaskHistoryRef.current = true;
          } while (queuedTaskHistoryReloadRef.current && isActive);
          return true;
        } finally {
          taskHistoryLoadInFlightRef.current = false;
          taskHistoryLoadPromiseRef.current = null;
        }
      })();
      taskHistoryLoadPromiseRef.current = taskHistoryLoadPromise;

      return await taskHistoryLoadPromise;
    }

    async function loadSecondaryWorkspaceData({ silent = false }: { silent?: boolean } = {}) {
      if ((!isActive && !canApplyCoreWorkspaceResult()) || secondaryLoadInFlightRef.current) {
        return;
      }

      secondaryLoadInFlightRef.current = true;
      const secondaryStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
      if (isDevelopment) {
        console.info("[workspace] Secondary loader skips Focus sessions; core owns Focus history.");
      }
      const [taskHistoryLoaded, taskActualTimeEntriesResult, noteResult] = await Promise.all([
        loadTaskHistory({ silent, source: "secondary" }),
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
      ]);
      secondaryLoadInFlightRef.current = false;

      if (!isActive && !canApplyCoreWorkspaceResult()) {
        return;
      }

      const errors = [
        !taskHistoryLoaded ? { message: "Could not refresh your task history." } : null,
        taskActualTimeEntriesResult.error,
        noteResult.error,
      ].filter(Boolean);
      if (errors.length > 0) {
        if (!silent) {
          setMessage({ tone: "warn", text: errors[0]?.message ?? "Could not finish loading workspace details." });
        }
        return;
      }

      const nextTaskActualTimeEntries = taskActualTimeEntriesResult.data ?? [];
      const nextAvailableTaskNotes = (noteResult.data ?? []) as TaskEditorLinkedNote[];
      setTaskActualTimeEntries((current) => keepCurrentIfStructurallyEqual(current, nextTaskActualTimeEntries));
      setAvailableTaskNotes((current) => keepCurrentIfStructurallyEqual(current, nextAvailableTaskNotes));
      hasLoadedSecondaryDataRef.current = true;
      logWorkspaceTiming("Secondary workspace details ready", secondaryStartedAt, {
        notes: nextAvailableTaskNotes.length,
        silent,
        taskActualTimeEntries: nextTaskActualTimeEntries.length,
        taskHistoryLoaded: hasLoadedTaskHistoryRef.current,
      });
    }

    function canApplyCoreWorkspaceResult() {
      return liveWorkspaceUserIdRef.current === userId;
    }

    async function loadCoreWorkspaceData({ silent = false, source = "refresh" }: { silent?: boolean; source?: string } = {}) {
      const taskListLoadGeneration = taskListDataGeneration.current + 1;
      taskListDataGeneration.current = taskListLoadGeneration;
      if (!silent) {
        setIsWorkspaceLoading(true);
      }

      const loadStartedAt = performance.now();
      const criticalCoreStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
      const taskRequest = createTaskRowsRequest();
      const taskSubtasksRequest = client
        .from("adhdice_task_subtasks")
        .select("*")
        .eq("user_id", userId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      const taskLegacySubtaskPromotionsRequest = client
        .from("adhdice_legacy_subtask_promotions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      const profileRequest = client
        .from("adhdice_user_profiles")
        .select(WORKSPACE_PROFILE_COLUMNS)
        .eq("user_id", userId)
        .maybeSingle();
      const criticalCoreRequest = Promise.all([
        taskRequest,
        taskSubtasksRequest,
        taskLegacySubtaskPromotionsRequest,
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
        loadTaskListFolders(client, userId)
          .then((data) => ({ data, error: null }))
          .catch((error: { message?: string }) => ({ data: null, error })),
      ]);
      const [taskResult, taskSubtasksResult, taskLegacySubtaskPromotionsResult, profileResult] = await criticalCoreRequest;

      if (!canApplyCoreWorkspaceResult()) {
        if (isDevelopment) {
          console.info(`[workspace] Obsolete owner skipped core state application source=${source} userId=${userId}.`);
        }
        return;
      }

      const criticalErrors = [
        taskResult.error,
        taskSubtasksResult.error,
        taskLegacySubtaskPromotionsResult.error,
        profileResult.error,
      ].filter(Boolean);

      if (criticalErrors.length > 0) {
        setMessage({ tone: "warn", text: criticalErrors[0]?.message ?? "Could not load your tasks." });
        setIsWorkspaceLoading(false);
        return;
      }
      logWorkspaceTiming("Critical workspace core ready", criticalCoreStartedAt, {
        promotions: taskLegacySubtaskPromotionsResult.data?.length ?? 0,
        silent,
        subtasks: taskSubtasksResult.data?.length ?? 0,
        tasks: taskResult.data?.length ?? 0,
      });

      const nextTaskSubtasks = (taskSubtasksResult.data ?? []).map(mapTaskSubtaskRow);
      const nextTaskLegacySubtaskPromotions = taskLegacySubtaskPromotionsResult.data ?? [];
      startTransition(() => {
        const nextTasks = taskResult.data ?? [];
        setTasks((current) => keepCurrentIfStructurallyEqual(current, nextTasks));
        setTaskSubtasks((current) => keepCurrentIfStructurallyEqual(current, nextTaskSubtasks));
        setTaskLegacySubtaskPromotions((current) => keepCurrentIfStructurallyEqual(current, nextTaskLegacySubtaskPromotions));
        onProfileLoaded(profileResult.data ?? null, user);
        if (profileResult.data) {
          const nextEconomy = {
            level: profileResult.data.level ?? 1,
            xp: profileResult.data.xp ?? 0,
            points: profileResult.data.points ?? 0,
            tokens: profileResult.data.tokens ?? 0,
          };
          setEconomy((current) => keepCurrentIfStructurallyEqual(current, nextEconomy));
        }
        setIsWorkspaceLoading(false);
      });
      if (isDevelopment && source === "initial") {
        console.info(`[workspace] Live owner applied shared initial result userId=${userId}.`);
      }
      void loadProfileMedia(client, userId);

      if (process.env.NODE_ENV !== "production") {
        console.info(`[workspace] Tasks ready in ${Math.round(performance.now() - loadStartedAt)}ms.`);
      }

      const secondaryCoreStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
      const [categoryResult, historyResult, focusDayResult, taskListsResult, manualMembershipResult, gridLayoutResult, folderStructureResult] = await secondaryCoreRequest;

      if (!canApplyCoreWorkspaceResult()) {
        if (isDevelopment) {
          console.info(`[workspace] Obsolete owner skipped core state application source=${source} userId=${userId}.`);
        }
        return;
      }

      const secondaryErrors = [
        categoryResult.error,
        historyResult.error,
        focusDayResult.error,
        taskListsResult.error && !isMissingTaskListsTableError(taskListsResult.error.message) ? taskListsResult.error : null,
        manualMembershipResult.error && !isMissingTaskListManualMembershipsTableError(manualMembershipResult.error.message) ? manualMembershipResult.error : null,
        gridLayoutResult.error,
        folderStructureResult.error,
      ].filter(Boolean);

      if (secondaryErrors.length > 0) {
        setMessage({ tone: "warn", text: secondaryErrors[0]?.message ?? "Could not finish loading workspace details." });
        return;
      }

      let nextCategories = mergeStoredFocusCategories((categoryResult.data ?? []).map(mapFocusCategoryRow));
      let nextFocusHistory = mergeStoredFocusHistory((historyResult.data ?? []).map((row) => mapFocusSessionRow(row)));
      let nextFocusedTaskIdsByDate = mapTaskFocusDayRows(focusDayResult.data ?? [], taskResult.data ?? []);
      const nextTaskLists = (taskListsResult.error && isMissingTaskListsTableError(taskListsResult.error.message))
        ? []
        : reconcileTaskListRows(taskListsResult.data ?? [], mapTaskListRow);
      const nextTaskListManualMemberships = (manualMembershipResult.error && isMissingTaskListManualMembershipsTableError(manualMembershipResult.error.message))
        ? []
        : (manualMembershipResult.data ?? []).map(mapTaskListManualMembershipRow);
      const nextTaskGridLayout = resolveTaskGridLayout(gridLayoutResult.data);
      const nextTaskListFolders = folderStructureResult.data?.folders ?? [];
      const nextTaskListContainers = folderStructureResult.data?.containers ?? [];
      const nextTaskListRailItems = folderStructureResult.data?.railItems ?? [];

      if (
        nextCategories.length === 0 &&
        nextFocusHistory.length === 0
      ) {
        const migrated = await migrateLocalFocusState(client, user);
        if (migrated) {
          const [freshCategories, freshHistory] = await Promise.all([
            client
              .from("adhdice_focus_categories")
              .select("*")
              .eq("user_id", userId)
              .order("sort_order", { ascending: true })
              .order("created_at", { ascending: true }),
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
          if (!freshHistory.error && freshHistory.data) {
            nextFocusHistory = mergeStoredFocusHistory(freshHistory.data.map((row) => mapFocusSessionRow(row)));
          }
          if (!freshCategories.error && !freshHistory.error) {
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

      setFocusCategories((current) => keepCurrentIfStructurallyEqual(current, nextCategories));
      setFocusHistory((current) => keepCurrentIfStructurallyEqual(current, nextFocusHistory));
      setFocusedTaskIdsByDate((current) => keepCurrentIfStructurallyEqual(current, nextFocusedTaskIdsByDate));
      if (taskListLoadGeneration === taskListDataGeneration.current) {
        setTaskLists((current) => keepCurrentIfStructurallyEqual(current, nextTaskLists));
        setTaskListFolders((current) => keepCurrentIfStructurallyEqual(current, nextTaskListFolders));
        setTaskListContainers((current) => keepCurrentIfStructurallyEqual(current, nextTaskListContainers));
        setTaskListRailItems((current) => keepCurrentIfStructurallyEqual(current, nextTaskListRailItems));
      }
      setTaskListManualMemberships((current) => keepCurrentIfStructurallyEqual(current, nextTaskListManualMemberships));
      setTaskListMembershipDataReadyUserId(userId);
      setTaskGridLayout((current) => keepCurrentIfStructurallyEqual(current, nextTaskGridLayout));
      saveFocusCategories(nextCategories);
      saveFocusHistory(nextFocusHistory);
      logWorkspaceTiming("Secondary workspace core ready", secondaryCoreStartedAt, {
        categories: nextCategories.length,
        focusDays: Object.keys(nextFocusedTaskIdsByDate).length,
        focusHistory: nextFocusHistory.length,
        manualMemberships: nextTaskListManualMemberships.length,
        listFolders: nextTaskListFolders.length,
        silent,
        taskLists: nextTaskLists.length,
      });

      if (process.env.NODE_ENV !== "production") {
        console.info(`[workspace] Background details ready in ${Math.round(performance.now() - loadStartedAt)}ms.`);
      }

      if (shouldLoadSecondaryForPage(activePageRef.current)) {
        void loadSecondaryWorkspaceData({ silent: true });
      } else {
        window.setTimeout(() => {
          void loadSecondaryWorkspaceData({ silent: true });
        }, 0);
      }
    }

    const requestCoreWorkspaceRefresh = (request: { silent: boolean; source: "initial" | "manual" | "mutation" | "realtime" | "resume" }) => {
      if (!coreRefreshCoordinatorRef.current) {
        coreRefreshCoordinatorRef.current = createWorkspaceRefreshCoordinator(
          async (nextRequest) => {
            await loadCoreWorkspaceData({ silent: nextRequest.silent, source: nextRequest.source });
            lastCoreRefreshCompletedAtRef.current = Date.now();
          },
          (decision, nextRequest) => {
            if (isDevelopment) {
              console.info(`[workspace] Refresh ${decision} source=${nextRequest.source}.`);
            }
          },
        );
      }
      return coreRefreshCoordinatorRef.current.request(request);
    };

    async function runSoftWorkspaceRefresh({
      includeSecondaryIfLoaded = false,
      source,
    }: {
      includeSecondaryIfLoaded?: boolean;
      source: "manual" | "mutation" | "resume";
    }) {
      if (!isActive) {
        return;
      }

      taskResumeSyncInFlightRef.current = true;
      const shouldExposeRefreshState = source !== "resume";
      if (shouldExposeRefreshState) {
        setIsSoftWorkspaceRefreshing(true);
      }
      if (source === "mutation") {
        setIsTaskResumeSyncPending(true);
      }

      const refreshStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;

      try {
        await ensureTaskChannelSubscribed();
        await requestCoreWorkspaceRefresh({ silent: true, source });

        if (includeSecondaryIfLoaded && (hasLoadedSecondaryDataRef.current || shouldLoadSecondaryForPage(activePageRef.current))) {
          await loadSecondaryWorkspaceData({ silent: true });
        }
      } finally {
        logWorkspaceTiming("Soft workspace refresh complete", refreshStartedAt, {
          includeSecondaryIfLoaded,
          secondaryLoaded: hasLoadedSecondaryDataRef.current,
          source,
        });
        taskResumeSyncInFlightRef.current = false;
        taskResumeSyncQueuedRef.current = false;
        if (shouldExposeRefreshState) {
          setIsSoftWorkspaceRefreshing(false);
        }
        setIsTaskResumeSyncPending(false);
      }
    }

    softWorkspaceRefreshRef.current = () => runSoftWorkspaceRefresh({
      includeSecondaryIfLoaded: true,
      source: "manual",
    });

    rolloverWorkspaceReconciliationRef.current = async () => {
      if (!isActive) {
        return;
      }

      if (isDevelopment) {
        console.info("[workspace] Rollover targeted task reconciliation requested.");
      }
      await reloadTaskRows({ silent: true, source: "rollover" });

      if (!hasLoadedTaskHistoryRef.current) {
        if (isDevelopment) {
          console.info("[workspace] Rollover history reconciliation skipped because startup history is pending.");
        }
      } else {
        if (isDevelopment) {
          console.info("[workspace] Rollover history reconciliation requested after already-loaded history.");
        }
        await loadTaskHistory({ silent: true, source: "rollover" });
      }
      if (isDevelopment) {
        console.info("[workspace] Rollover targeted task reconciliation completed.");
      }
    };

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

    initialCoreLoadActiveRef.current = true;
    const initialRequest = workspaceStartupRequestRegistry.request(userId, () => requestCoreWorkspaceRefresh({ silent: false, source: "initial" }));
    if (isDevelopment) {
      console.info(`[workspace] Initial request ${initialRequest.joined ? "joined existing per-user request" : "started"} userId=${userId}.`);
    }
    void initialRequest.promise.then(
      () => {
        if (isDevelopment) {
          console.info(`[workspace] Initial request completed userId=${userId}.`);
        }
      },
      () => {
        if (isDevelopment) {
          console.info(`[workspace] Initial request failed userId=${userId}.`);
        }
      },
    ).finally(() => {
      initialCoreLoadActiveRef.current = false;
    });
    void subscribeTaskChannel();

    const resumeRefreshCoordinator = createWorkspaceResumeRefreshCoordinator({
      isInitialLoadActive: () => initialCoreLoadActiveRef.current,
      isRecentCoreLoad: () => Date.now() - lastCoreRefreshCompletedAtRef.current < TASK_RESUME_SYNC_COOLDOWN_MS,
      onRefresh: (reason: WorkspaceResumeRefreshReason) => {
        if (!isActive) {
          return;
        }
        taskResumeSyncQueuedRef.current = true;
        lastTaskResumeSyncAtRef.current = Date.now();
        setIsTaskResumeSyncPending(true);
        if (isDevelopment) {
          console.info(`[workspace] Refresh eligible source=${reason}.`);
        }
        void runSoftWorkspaceRefresh({ includeSecondaryIfLoaded: true, source: "resume" });
      },
      onSkip: (reason) => {
        if (isDevelopment) {
          console.info(`[workspace] Refresh skipped source=resume reason=${reason}.`);
        }
        setIsTaskResumeSyncPending(false);
      },
    });

    function handleDocumentVisibilityChange() {
      if (document.visibilityState === "hidden") {
        resumeRefreshCoordinator.documentHidden();
      } else if (document.visibilityState === "visible") {
        resumeRefreshCoordinator.documentVisible();
      }
    }

    function handlePageShow(event: PageTransitionEvent) {
      resumeRefreshCoordinator.pageShow(event.persisted);
    }

    function handleWindowFocus() {
      resumeRefreshCoordinator.focus();
    }

    function handleWindowOnline() {
      resumeRefreshCoordinator.online();
    }

    function handleWindowOffline() {
      resumeRefreshCoordinator.offline();
    }

    document.addEventListener("visibilitychange", handleDocumentVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("online", handleWindowOnline);
    window.addEventListener("offline", handleWindowOffline);

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
          void requestCoreWorkspaceRefresh({ silent: true, source: "realtime" });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_task_list_folders",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void requestCoreWorkspaceRefresh({ silent: true, source: "realtime" });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_task_list_containers",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void requestCoreWorkspaceRefresh({ silent: true, source: "realtime" });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_task_list_rail_items",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void requestCoreWorkspaceRefresh({ silent: true, source: "realtime" });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_legacy_subtask_promotions",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void requestCoreWorkspaceRefresh({ silent: true, source: "realtime" });
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
            void requestCoreWorkspaceRefresh({ silent: true, source: "realtime" });
          }
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
          void requestCoreWorkspaceRefresh({ silent: true, source: "realtime" });
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
          void requestCoreWorkspaceRefresh({ silent: true, source: "realtime" });
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
          void requestCoreWorkspaceRefresh({ silent: true, source: "realtime" });
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
          void requestCoreWorkspaceRefresh({ silent: true, source: "realtime" });
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
          if (hasLoadedSecondaryDataRef.current || shouldLoadSecondaryForPage(activePageRef.current)) {
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
          if (hasLoadedSecondaryDataRef.current || shouldLoadSecondaryForPage(activePageRef.current)) {
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
          if (hasLoadedSecondaryDataRef.current || shouldLoadSecondaryForPage(activePageRef.current)) {
            void loadSecondaryWorkspaceData({ silent: true });
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          workspaceChannelSubscriptionCountRef.current += 1;
          if (isDevelopment) {
            console.info(`[workspace] Workspace realtime subscribe count=${workspaceChannelSubscriptionCountRef.current} userId=${userId}.`);
          }
        }
      });

    return () => {
      isActive = false;
      document.removeEventListener("visibilitychange", handleDocumentVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("online", handleWindowOnline);
      window.removeEventListener("offline", handleWindowOffline);
      resumeRefreshCoordinator.dispose();
      if (taskResumeSyncTimeoutRef.current !== null) {
        window.clearTimeout(taskResumeSyncTimeoutRef.current);
        taskResumeSyncTimeoutRef.current = null;
      }
      taskResumeSyncQueuedRef.current = false;
      taskResumeSyncInFlightRef.current = false;
      initialCoreLoadActiveRef.current = false;
      if (liveWorkspaceUserIdRef.current === userId) {
        liveWorkspaceUserIdRef.current = null;
      }
      softWorkspaceRefreshRef.current = null;
      rolloverWorkspaceReconciliationRef.current = null;
      prepareTaskMutationRef.current = null;
      taskChannelRef.current = null;
      taskChannelStatusRef.current = "CLOSED";
      taskChannelRemovalPromiseRef.current = null;
      if (taskChannel) {
        taskChannelRemovalPromiseRef.current = removeTaskChannel(taskChannel);
      }
      if (isDevelopment) {
        workspaceChannelCleanupCountRef.current += 1;
        console.info(`[workspace] Workspace realtime cleanup count=${workspaceChannelCleanupCountRef.current} userId=${userId}.`);
      }
      void client.removeChannel(workspaceChannel);
    };
  }, [currentUser?.id, supabase, suppressCategoryReload]);

  useEffect(() => {
    if (!currentUser) {
      setTaskActualTimeEntries([]);
      setTaskHistory([]);
      setTaskListContainers([]);
      setTaskListFolders([]);
      setTaskListRailItems([]);
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
    setTaskListContainers,
    setTaskListFolders,
    setTaskListRailItems,
    setTaskLegacySubtaskPromotions,
    taskGridStarterLayout,
  ]);

  async function softRefreshWorkspace() {
    await softWorkspaceRefreshRef.current?.();
  }

  async function reconcileRolloverWorkspace() {
    await rolloverWorkspaceReconciliationRef.current?.();
  }

  async function prepareTaskMutation() {
    return await prepareTaskMutationRef.current?.() ?? false;
  }

  return {
    isSoftWorkspaceRefreshing,
    isTaskListMembershipDataReady: !currentUser || taskListMembershipDataReadyUserId === currentUser.id,
    isTaskResumeSyncPending,
    isWorkspaceLoading,
    prepareTaskMutation,
    reconcileRolloverWorkspace,
    softRefreshWorkspace,
  };
}
