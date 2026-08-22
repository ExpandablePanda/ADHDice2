"use client";

import { startTransition, useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { RealtimeChannel, User } from "@supabase/supabase-js";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import type { FocusCategory, HistoricalFocusSession } from "@/lib/types";
import type {
  FocusCategory as DbFocusCategory,
  FocusSession as DbFocusSession,
  Task,
  TaskFocusDay as DbTaskFocusDay,
  TaskGridLayout as DbTaskGridLayout,
  TaskHistory as DbTaskHistory,
  TaskList as DbTaskList,
  TaskListContainer,
  TaskListFolder,
  TaskListRailItem,
  TaskListManualMembership as DbTaskListManualMembership,
} from "@/lib/database.types";
import { loadProfileMedia, setActiveProfileUserId, WORKSPACE_PROFILE_COLUMNS, type WorkspaceProfileRow } from "@/lib/profile-store";
import type { TaskEditorLinkedNote } from "@/lib/task-notes";
import type { CanonicalTaskCalendarOverride, CanonicalTaskCommandOperation, CanonicalTaskHistoryFact, CanonicalTaskScheduleBoundary } from "@/lib/task-state-canonical/types";
import { taskCalendarOverrideFromCanonical } from "@/lib/task-state-canonical/engine-input";
import { projectTasksWithCanonicalScheduleBoundaries } from "@/lib/task-state-canonical/schedule-projection";
import {
  deduplicateTaskHistoryByLogicalDate,
  fetchTaskHistoryForTaskIdsInBatches,
  TASK_HISTORY_ROLLOVER_BATCH_SIZE,
  type TaskHistoryLoadMap,
  type TaskHistoryLoadResult,
  type TaskHistoryStreakEntry,
} from "@/lib/task-history";
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
import {
  buildTaskHistoryStreakSummary,
  buildTaskHistoryStreakSummaryMap,
  updateTaskHistoryStreakSummaryMap,
  type TaskHistoryStreakSummaryMap,
} from "@/lib/task-history-streak-summaries";
import { isWorkspacePerformanceDiagnosticsEnabled } from "@/lib/workspace-performance-diagnostics";
import { mapCanonicalTaskHistoryFacts } from "@/lib/task-state-canonical/history-projection";
import type { TaskCalendarOverride } from "@/lib/task-state-engine/types";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
type ResolvedSupabaseClient = NonNullable<SupabaseClient>;
type TaskGridLayoutItem = { h: number; id: string; type: string; w: number; x: number; y: number };
type OwnedWorkspacePromise<T> = {
  generation: number;
  promise: Promise<T>;
};

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
  setTaskGridLayout: Dispatch<SetStateAction<TTaskGridItem[]>>;
  setTaskHistory: Dispatch<SetStateAction<DbTaskHistory[]>>;
  setTaskListManualMemberships: Dispatch<SetStateAction<TaskListManualMembership[]>>;
  setTaskListContainers: Dispatch<SetStateAction<TaskListContainer[]>>;
  setTaskListFolders: Dispatch<SetStateAction<TaskListFolder[]>>;
  setTaskListRailItems: Dispatch<SetStateAction<TaskListRailItem[]>>;
  setTaskLists: Dispatch<SetStateAction<TaskListDefinition[]>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  suppressCategoryReload: MutableRefObject<boolean>;
  supabase: SupabaseClient;
  tasks: Task[];
  taskGridStarterLayout: TTaskGridItem[];
  taskListDataGeneration: MutableRefObject<number>;
  logicalDayRollover: string;
  now: Date | string;
  todayKey: string;
  timezone: string;
};

const TASK_RESUME_SYNC_COOLDOWN_MS = 1500;
const TASK_HISTORY_PAGE_SIZE = 1000;

function keepCurrentIfStructurallyEqual<T>(current: T, next: T) {
  return JSON.stringify(current) === JSON.stringify(next) ? current : next;
}

type PagedFetchResult<T> = {
  data: T[] | null;
  error: { message?: string } | null;
};

export async function loadCanonicalTaskSnapshot<TaskRow, BoundaryRow>(
  loadTaskRows: () => PromiseLike<PagedFetchResult<TaskRow>>,
  loadScheduleBoundaries: () => PromiseLike<PagedFetchResult<BoundaryRow>>,
) {
  const taskResult = await loadTaskRows();
  if (taskResult.error) {
    return { taskResult, boundaryResult: null };
  }

  const boundaryResult = await loadScheduleBoundaries();
  return { taskResult, boundaryResult };
}

export type TaskHistoryTaskLoadState = {
  error: string | null;
  status: "error" | "loading" | "ready";
};

export type TaskHistoryLoadOptions = {
  force?: boolean;
  silent?: boolean;
};

type TaskHistoryCacheUpdate = DbTaskHistory[] | ((current: DbTaskHistory[]) => DbTaskHistory[]);

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
  if (!isWorkspacePerformanceDiagnosticsEnabled() || typeof performance === "undefined" || step !== "Startup summary") {
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
  mapTaskListManualMembershipRow,
  mapTaskListRow,
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
  setTaskGridLayout,
  setTaskHistory,
  setTaskListManualMemberships,
  setTaskListContainers,
  setTaskListFolders,
  setTaskListRailItems,
  setTaskLists,
  setTasks,
  suppressCategoryReload,
  supabase,
  tasks,
  taskGridStarterLayout,
  taskListDataGeneration,
  logicalDayRollover,
  now,
  todayKey,
  timezone,
}: UseWorkspaceDataOptions<TTaskGridItem>) {
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [taskHistoryLoadedUserId, setTaskHistoryLoadedUserId] = useState<string | null>(null);
  const [taskHistoryByTaskId, setTaskHistoryByTaskId] = useState<Record<string, DbTaskHistory[]>>({});
  const [taskHistoryLoadStateByTaskId, setTaskHistoryLoadStateByTaskId] = useState<Record<string, TaskHistoryTaskLoadState>>({});
  const [taskHistoryStreakSummaries, setTaskHistoryStreakSummaries] = useState<TaskHistoryStreakSummaryMap>({});
  const [isSoftWorkspaceRefreshing, setIsSoftWorkspaceRefreshing] = useState(false);
  const [isTaskResumeSyncPending, setIsTaskResumeSyncPending] = useState(false);
  const [taskListMembershipDataReadyUserId, setTaskListMembershipDataReadyUserId] = useState<string | null>(null);
  const hasLoadedNotesRef = useRef(false);
  const hasLoadedFullTaskHistoryRef = useRef(false);
  const hasLoadedTaskHistoryRef = useRef(false);
  const fullTaskHistoryRowsRef = useRef<DbTaskHistory[]>([]);
  const taskHistoryLoadInFlightRef = useRef(false);
  const queuedTaskHistoryReloadRef = useRef(false);
  const taskHistoryLoadPromiseRef = useRef<OwnedWorkspacePromise<boolean> | null>(null);
  const taskHistoryByTaskIdRef = useRef<Record<string, DbTaskHistory[]>>({});
  const taskHistoryLoadStateByTaskIdRef = useRef<Record<string, TaskHistoryTaskLoadState>>({});
  const taskHistoryTaskLoadPromisesRef = useRef(new Map<string, OwnedWorkspacePromise<TaskHistoryLoadResult>>());
  const loadTaskHistoryForTasksRef = useRef<((taskIds: string[]) => Promise<TaskHistoryLoadMap>) | null>(null);
  const taskHistoryStreakSummaryLoadPromiseRef = useRef<OwnedWorkspacePromise<boolean> | null>(null);
  const taskHistoryStreakSummaryTaskReloadsRef = useRef(new Map<string, OwnedWorkspacePromise<boolean>>());
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
  const workspaceGenerationRef = useRef(0);
  const activePageRef = useRef(activePage);
  const todayKeyRef = useRef(todayKey);
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
  const loadFullTaskHistoryRef = useRef<(() => Promise<boolean>) | null>(null);
  const loadNotesRef = useRef<(() => Promise<boolean>) | null>(null);
  const loadTaskHistoryForTaskRef = useRef<((taskId: string, options?: TaskHistoryLoadOptions) => Promise<boolean>) | null>(null);
  const refreshTaskHistoryStreakSummaryRef = useRef<((taskId: string, nextTaskHistory?: DbTaskHistory[], nextTask?: Task) => Promise<boolean>) | null>(null);
  const retryTaskHistoryForTaskRef = useRef<((taskId: string) => Promise<boolean>) | null>(null);
  const fetchTaskHistoryForRolloverRef = useRef<((taskIds: string[]) => Promise<TaskHistoryLoadMap>) | null>(null);
  const tasksRef = useRef(tasks);

  const setTaskHistoryTaskLoadState = useCallback((taskId: string, state: TaskHistoryTaskLoadState) => {
    taskHistoryLoadStateByTaskIdRef.current = {
      ...taskHistoryLoadStateByTaskIdRef.current,
      [taskId]: state,
    };
    setTaskHistoryLoadStateByTaskId((current) => (
      current[taskId]?.status === state.status && current[taskId]?.error === state.error
        ? current
        : { ...current, [taskId]: state }
    ));
  }, []);

  const setTaskHistoryCacheForTask = useCallback((taskId: string, rows: DbTaskHistory[]) => {
    const nextRows = deduplicateTaskHistoryByLogicalDate(rows.filter((entry) => entry.task_id === taskId));
    const nextSnapshot = deduplicateTaskHistoryByLogicalDate([
      ...fullTaskHistoryRowsRef.current.filter((entry) => entry.task_id !== taskId),
      ...nextRows,
    ]);
    const nextByTaskId = Object.fromEntries(
      [...new Set([...tasksRef.current.map((task) => task.id), ...nextSnapshot.map((entry) => entry.task_id)])]
        .map((candidateTaskId) => [
          candidateTaskId,
          nextSnapshot.filter((entry) => entry.task_id === candidateTaskId),
        ]),
    );
    fullTaskHistoryRowsRef.current = nextSnapshot;
    taskHistoryByTaskIdRef.current = nextByTaskId;
    setTaskHistory((current) => keepCurrentIfStructurallyEqual(current, nextSnapshot));
    setTaskHistoryByTaskId((current) => keepCurrentIfStructurallyEqual(current, nextByTaskId));
  }, []);

  const updateTaskHistoryForTask = useCallback((taskId: string, update: TaskHistoryCacheUpdate) => {
    if (taskHistoryLoadStateByTaskIdRef.current[taskId]?.status !== "ready" && !Object.hasOwn(taskHistoryByTaskIdRef.current, taskId)) {
      return;
    }
    const currentRows = taskHistoryByTaskIdRef.current[taskId] ?? [];
    setTaskHistoryCacheForTask(taskId, typeof update === "function" ? update(currentRows) : update);
  }, [setTaskHistoryCacheForTask]);

  const clearTaskHistoryTaskCache = useCallback(() => {
    taskHistoryByTaskIdRef.current = {};
    taskHistoryLoadStateByTaskIdRef.current = {};
    taskHistoryTaskLoadPromisesRef.current.clear();
    setTaskHistoryByTaskId({});
    setTaskHistoryLoadStateByTaskId({});
  }, []);

  useEffect(() => {
    activePageRef.current = activePage;
    if (activePage === "Stats" || activePage === "Games" || activePage === "Achievements") {
      void loadFullTaskHistoryRef.current?.();
    }
    if (activePage === "Notes") void loadNotesRef.current?.();
  }, [activePage]);

  useEffect(() => {
    todayKeyRef.current = todayKey;
  }, [todayKey]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    shouldSkipTaskReloadRef.current = shouldSkipTaskReload;
  }, [shouldSkipTaskReload]);

  useEffect(() => {
    const workspaceGeneration = workspaceGenerationRef.current + 1;
    workspaceGenerationRef.current = workspaceGeneration;

    if (!supabase || !currentUser) {
      setActiveProfileUserId(null);
      workspaceStartupRequestRegistry.invalidate(startupRequestUserIdRef.current);
      startupRequestUserIdRef.current = null;
      liveWorkspaceUserIdRef.current = null;
      hasLoadedNotesRef.current = false;
      hasLoadedFullTaskHistoryRef.current = false;
      hasLoadedTaskHistoryRef.current = false;
      fullTaskHistoryRowsRef.current = [];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear the user-scoped History modal cache on sign-out.
      clearTaskHistoryTaskCache();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear the user-scoped display cache on sign-out.
      setTaskHistoryStreakSummaries({});
      setTaskHistoryLoadedUserId(null);
      taskHistoryLoadInFlightRef.current = false;
      queuedTaskHistoryReloadRef.current = false;
      taskHistoryLoadPromiseRef.current = null;
      taskHistoryStreakSummaryLoadPromiseRef.current = null;
      taskHistoryStreakSummaryTaskReloadsRef.current.clear();
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
      loadFullTaskHistoryRef.current = null;
      loadNotesRef.current = null;
      loadTaskHistoryForTaskRef.current = null;
      fetchTaskHistoryForRolloverRef.current = null;
      refreshTaskHistoryStreakSummaryRef.current = null;
      retryTaskHistoryForTaskRef.current = null;
      if (taskResumeSyncTimeoutRef.current !== null) {
        window.clearTimeout(taskResumeSyncTimeoutRef.current);
        taskResumeSyncTimeoutRef.current = null;
      }
      return;
    }

    const client = supabase;
    const user = currentUser;
    const userId = user.id;
    clearTaskHistoryTaskCache();
    setTaskHistoryStreakSummaries((current) => Object.keys(current).length === 0 ? current : {});
    fullTaskHistoryRowsRef.current = [];
    taskHistoryLoadInFlightRef.current = false;
    queuedTaskHistoryReloadRef.current = false;
    taskHistoryLoadPromiseRef.current = null;
    taskHistoryStreakSummaryLoadPromiseRef.current = null;
    taskHistoryStreakSummaryTaskReloadsRef.current.clear();
    setActiveProfileUserId(userId);
    if (startupRequestUserIdRef.current) {
      workspaceStartupRequestRegistry.invalidate(startupRequestUserIdRef.current);
    }
    startupRequestUserIdRef.current = null;
    coreRefreshCoordinatorRef.current = null;
    startupRequestUserIdRef.current = userId;
    liveWorkspaceUserIdRef.current = userId;
    let isActive = true;
    let taskChannel: RealtimeChannel | null = null;
    taskChannelSubscriptionCountRef.current = 0;
    workspaceChannelSubscriptionCountRef.current = 0;
    taskChannelCleanupCountRef.current = 0;
    workspaceChannelCleanupCountRef.current = 0;

    function canonicalHistoryQuery(taskId?: string) {
      let query = client
        .from("adhdice_task_history_facts")
        .select("*")
        .eq("user_id", userId)
        .order("logical_date", { ascending: false })
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });
      if (taskId) query = query.eq("entity_id", taskId);
      return query;
    }

    function mapCanonicalHistoryRows(rows: CanonicalTaskHistoryFact[]) {
      return mapCanonicalTaskHistoryFacts(rows) as DbTaskHistory[];
    }

    async function loadActiveCalendarOverrides(taskId?: string) {
      const result = taskId
        ? await client
          .from("adhdice_task_calendar_overrides")
          .select("*")
          .eq("user_id", userId)
          .eq("entity_id", taskId)
          .eq("is_active", true)
          .order("logical_date", { ascending: false })
        : await client
          .from("adhdice_task_calendar_overrides")
          .select("*")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("logical_date", { ascending: false });
      if (result.error) return null;
      return (result.data ?? []) as CanonicalTaskCalendarOverride[];
    }

    async function loadManualActionCommandOperations(taskId?: string) {
      let query = client
        .from("adhdice_task_command_operations")
        .select("id,user_id,entity_id,command_type,requested_logical_date,state,result_references,source_kind,created_at,completed_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (taskId) query = query.eq("entity_id", taskId);
      const result = await query;
      if (result.error) return [] as CanonicalTaskCommandOperation[];
      return (result.data ?? []) as CanonicalTaskCommandOperation[];
    }

    function indexActiveCalendarOverrides(rows: readonly CanonicalTaskCalendarOverride[]) {
      const byTaskId: Record<string, TaskCalendarOverride[]> = {};
      for (const row of rows) {
        const override = taskCalendarOverrideFromCanonical(row);
        (byTaskId[row.entity_id] ??= []).push(override);
      }
      return byTaskId;
    }

    function createTaskRowsRequest() {
      return client
        .from("adhdice_clean_tasks")
        .select("*")
        .eq("user_id", userId)
        .is("permanently_deleted_at", null)
        .order("status", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
    }

    function createTaskScheduleBoundariesRequest() {
      return client
        .from("adhdice_task_schedule_boundaries")
        .select("*")
        .eq("user_id", userId)
        .order("boundary_sequence", { ascending: false });
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
          const { taskResult, boundaryResult } = await loadCanonicalTaskSnapshot(
            () => createTaskRowsRequest(),
            () => createTaskScheduleBoundariesRequest(),
          );

          if (!isActive) {
            return;
          }

          if (taskResult.error || boundaryResult?.error) {
            if (!silent) {
              setMessage({ tone: "warn", text: taskResult.error?.message ?? boundaryResult?.error?.message ?? "Could not refresh your tasks." });
            }
            return;
          }

          startTransition(() => {
            const nextTasks = projectTasksWithCanonicalScheduleBoundaries(
              taskResult.data ?? [],
              (boundaryResult?.data ?? []) as CanonicalTaskScheduleBoundary[],
            );
            setTasks((current) => keepCurrentIfStructurallyEqual(current, nextTasks));
          });
          if (isWorkspacePerformanceDiagnosticsEnabled() && source === "rollover") {
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
        if (isWorkspacePerformanceDiagnosticsEnabled()) {
          console.info(`[workspace] Task realtime cleanup count=${taskChannelCleanupCountRef.current} userId=${userId}.`);
        }
      } catch {
        // Ignore cleanup races when visibility/focus events overlap.
      }
    }

    async function subscribeTaskChannel() {
      const subscribeStartedAt = isWorkspacePerformanceDiagnosticsEnabled() && typeof performance !== "undefined" ? performance.now() : 0;
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
      if (isWorkspacePerformanceDiagnosticsEnabled()) {
        console.info(`[workspace] Task realtime subscribe count=${taskChannelSubscriptionCountRef.current} userId=${userId}.`);
      }
      taskChannelRemovalPromiseRef.current = null;
      taskChannel = nextTaskChannel;
    }

    async function ensureTaskChannelSubscribed() {
      if (!shouldReconnectTaskChannel()) {
        return;
      }

      const reconnectStartedAt = isWorkspacePerformanceDiagnosticsEnabled() && typeof performance !== "undefined" ? performance.now() : 0;
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
      source?: "rollover" | "secondary" | "startup";
    } = {}) {
      if (!isActive || !canApplyCoreWorkspaceResult()) {
        return false;
      }

      if (taskHistoryLoadInFlightRef.current) {
        queuedTaskHistoryReloadRef.current = true;
        if (isWorkspacePerformanceDiagnosticsEnabled() && source === "rollover") {
          console.info("[workspace] Rollover history reconciliation joined an in-flight history load.");
        }
        return await (taskHistoryLoadPromiseRef.current?.promise ?? Promise.resolve(false));
      }

      taskHistoryLoadInFlightRef.current = true;
      const taskHistoryLoadPromiseOwner = { promise: Promise.resolve(false) };
      const taskHistoryLoadPromise = (async () => {
        try {
          do {
            queuedTaskHistoryReloadRef.current = false;
            const taskHistoryResult = await fetchAllPagedRows<CanonicalTaskHistoryFact>(async (from, to) => await canonicalHistoryQuery().range(from, to));

            if (!isActive || !canApplyCoreWorkspaceResult()) {
              return false;
            }

            if (taskHistoryResult.error) {
              if (!silent) {
                setMessage({ tone: "warn", text: taskHistoryResult.error.message ?? "Could not refresh your task history." });
              }
              return false;
            }

            const nextTaskHistory = deduplicateTaskHistoryByLogicalDate(mapCanonicalHistoryRows((taskHistoryResult.data ?? []) as CanonicalTaskHistoryFact[]));
            const nextByTaskId = Object.fromEntries(
              [...new Set([...tasksRef.current.map((task) => task.id), ...nextTaskHistory.map((entry) => entry.task_id)])]
                .map((taskId) => [taskId, nextTaskHistory.filter((entry) => entry.task_id === taskId)]),
            );
            fullTaskHistoryRowsRef.current = nextTaskHistory;
            taskHistoryByTaskIdRef.current = nextByTaskId;
            setTaskHistory((current) => keepCurrentIfStructurallyEqual(current, nextTaskHistory));
            setTaskHistoryByTaskId((current) => keepCurrentIfStructurallyEqual(current, nextByTaskId));
            setTaskHistoryLoadStateByTaskId((current) => keepCurrentIfStructurallyEqual(
              current,
              Object.fromEntries(Object.keys(nextByTaskId).map((taskId) => [taskId, { error: null, status: "ready" }])),
            ));
            hasLoadedTaskHistoryRef.current = true;
            hasLoadedFullTaskHistoryRef.current = true;
            setTaskHistoryLoadedUserId(userId);
          } while (queuedTaskHistoryReloadRef.current && isActive);
          return true;
        } finally {
          if (taskHistoryLoadPromiseRef.current?.promise === taskHistoryLoadPromiseOwner.promise) {
            taskHistoryLoadInFlightRef.current = false;
            taskHistoryLoadPromiseRef.current = null;
          }
        }
      })();
      taskHistoryLoadPromiseOwner.promise = taskHistoryLoadPromise;
      taskHistoryLoadPromiseRef.current = { generation: workspaceGeneration, promise: taskHistoryLoadPromise };

      return await taskHistoryLoadPromise;
    }

    async function fetchTaskHistoryForRollover(taskIds: string[]) {
      if (!isActive || !canApplyCoreWorkspaceResult()) {
        return Object.fromEntries([...new Set(taskIds)].filter(Boolean).map((taskId) => [taskId, {
          error: "Task History is not available for this workspace.",
          history: null,
          status: "error",
        } satisfies TaskHistoryLoadResult])) as TaskHistoryLoadMap;
      }

      return await fetchTaskHistoryForTaskIdsInBatches(taskIds, async (batchTaskIds) => {
        const result = await fetchAllPagedRows<CanonicalTaskHistoryFact>(async (from, to) => await canonicalHistoryQuery()
          .in("entity_id", batchTaskIds)
          .range(from, to));
        return {
          data: result.data
            ? mapCanonicalHistoryRows(result.data as CanonicalTaskHistoryFact[])
            : null,
          error: result.error,
        };
      }, TASK_HISTORY_ROLLOVER_BATCH_SIZE);
    }

    async function loadTaskHistoryForTask(taskId: string, { force = false, silent = false }: TaskHistoryLoadOptions = {}) {
      if (!isActive || !canApplyCoreWorkspaceResult()) {
        return { status: "error", history: null, error: "Task History is not available for this workspace." } satisfies TaskHistoryLoadResult;
      }
      if (!force && taskHistoryLoadStateByTaskIdRef.current[taskId]?.status === "ready") {
        return {
          error: null,
          history: [...(taskHistoryByTaskIdRef.current[taskId] ?? [])],
          status: "ready",
        } satisfies TaskHistoryLoadResult;
      }
      const existingLoad = taskHistoryTaskLoadPromisesRef.current.get(taskId);
      if (existingLoad?.generation === workspaceGeneration) {
        return await existingLoad.promise;
      }
      if (existingLoad) {
        taskHistoryTaskLoadPromisesRef.current.delete(taskId);
      }

      setTaskHistoryTaskLoadState(taskId, { error: null, status: "loading" });
      const taskLoadPromiseOwner: { promise: Promise<TaskHistoryLoadResult> } = {
        promise: Promise.resolve({ status: "error", history: null, error: "Task History is not available for this workspace." } satisfies TaskHistoryLoadResult),
      };
      const taskLoadPromise = (async () => {
        try {
          const result = await fetchAllPagedRows<CanonicalTaskHistoryFact>(async (from, to) => await canonicalHistoryQuery(taskId).range(from, to));
          if (!isActive || !canApplyCoreWorkspaceResult()) {
            return { status: "error", history: null, error: "Task History is not available for this workspace." } satisfies TaskHistoryLoadResult;
          }
          if (result.error) {
            const error = result.error.message ?? "Could not load task history.";
            setTaskHistoryTaskLoadState(taskId, { error, status: "error" });
            if (!silent) setMessage({ tone: "warn", text: error });
            return { status: "error", history: null, error } satisfies TaskHistoryLoadResult;
          }
          const rows = deduplicateTaskHistoryByLogicalDate(mapCanonicalHistoryRows((result.data ?? []) as CanonicalTaskHistoryFact[]));
          setTaskHistoryCacheForTask(taskId, rows);
          setTaskHistoryTaskLoadState(taskId, { error: null, status: "ready" });
          return { error: null, history: [...rows], status: "ready" } satisfies TaskHistoryLoadResult;
        } finally {
          if (taskHistoryTaskLoadPromisesRef.current.get(taskId)?.promise === taskLoadPromiseOwner.promise) {
            taskHistoryTaskLoadPromisesRef.current.delete(taskId);
          }
        }
      })();
      taskLoadPromiseOwner.promise = taskLoadPromise;
      taskHistoryTaskLoadPromisesRef.current.set(taskId, { generation: workspaceGeneration, promise: taskLoadPromise });
      return await taskLoadPromise;
    }

    async function loadTaskHistoryForTasks(taskIds: string[]) {
      const uniqueTaskIds = [...new Set(taskIds)].filter(Boolean);
      const results = await Promise.all(uniqueTaskIds.map(async (taskId) => [
        taskId,
        await loadTaskHistoryForTask(taskId, { force: true, silent: true }),
      ] as const));
      return Object.fromEntries(results) as TaskHistoryLoadMap;
    }

    async function loadTaskHistoryStreakSummaries(nextTasks: Task[] = tasksRef.current) {
      if (!isActive || !canApplyCoreWorkspaceResult()) {
        return false;
      }

      const existingSummaryLoad = taskHistoryStreakSummaryLoadPromiseRef.current;
      if (existingSummaryLoad?.generation === workspaceGeneration) {
        return await existingSummaryLoad.promise;
      }
      if (existingSummaryLoad) {
        taskHistoryStreakSummaryLoadPromiseRef.current = null;
      }

      const summaryLoadOwner: OwnedWorkspacePromise<boolean> = {
        generation: workspaceGeneration,
        promise: Promise.resolve(false),
      };
      const summaryLoadPromise = Promise.resolve().then(async () => {
        try {
          const fullHistoryLoad = taskHistoryLoadPromiseRef.current;
          if (fullHistoryLoad?.generation === workspaceGeneration && !hasLoadedFullTaskHistoryRef.current) {
            await fullHistoryLoad.promise;
          }
          if (!isActive || !canApplyCoreWorkspaceResult()) {
            return false;
          }

          let compactHistory: TaskHistoryStreakEntry[];
          if (hasLoadedFullTaskHistoryRef.current) {
            compactHistory = fullTaskHistoryRowsRef.current;
          } else {
            const result = await fetchAllPagedRows<CanonicalTaskHistoryFact>(async (from, to) => await canonicalHistoryQuery().range(from, to));
            if (result.error) return false;
            compactHistory = mapCanonicalHistoryRows((result.data ?? []) as CanonicalTaskHistoryFact[]);
          }

          if (!isActive || !canApplyCoreWorkspaceResult()) {
            return false;
          }

          const [activeCalendarOverrides, manualActionCommandOperations] = await Promise.all([
            loadActiveCalendarOverrides(),
            loadManualActionCommandOperations(),
          ]);
          if (!activeCalendarOverrides || !isActive || !canApplyCoreWorkspaceResult()) {
            return false;
          }

          const nextSummaries = buildTaskHistoryStreakSummaryMap(nextTasks, compactHistory, todayKeyRef.current, {
            calendarOverridesByTaskId: indexActiveCalendarOverrides(activeCalendarOverrides),
            logicalDayRollover,
            manualActionCalendarOverrides: activeCalendarOverrides,
            manualActionCommandOperations,
            now,
            timezone,
          });
          setTaskHistoryStreakSummaries((current) => keepCurrentIfStructurallyEqual(current, nextSummaries));
          return true;
        } finally {
          if (taskHistoryStreakSummaryLoadPromiseRef.current === summaryLoadOwner) {
            taskHistoryStreakSummaryLoadPromiseRef.current = null;
          }
        }
      });
      summaryLoadOwner.promise = summaryLoadPromise;
      taskHistoryStreakSummaryLoadPromiseRef.current = summaryLoadOwner;
      return await summaryLoadPromise;
    }

    async function reloadTaskHistoryStreakSummaryForTask(taskId: string, nextTaskHistory?: DbTaskHistory[], nextTask?: Task) {
      if (!isActive || !canApplyCoreWorkspaceResult()) {
        return false;
      }
      const existingReload = taskHistoryStreakSummaryTaskReloadsRef.current.get(taskId);
      if (existingReload?.generation === workspaceGeneration) return await existingReload.promise;
      if (existingReload) taskHistoryStreakSummaryTaskReloadsRef.current.delete(taskId);

      const reloadOwner: OwnedWorkspacePromise<boolean> = {
        generation: workspaceGeneration,
        promise: Promise.resolve(false),
      };
      const reloadPromise = Promise.resolve().then(async () => {
        try {
          const summaryLoad = taskHistoryStreakSummaryLoadPromiseRef.current;
          if (summaryLoad?.generation === workspaceGeneration) {
            await summaryLoad.promise;
          }
          if (!isActive || !canApplyCoreWorkspaceResult()) {
            return false;
          }

          const task = nextTask ?? tasksRef.current.find((candidate) => candidate.id === taskId);
          if (!task) return false;
          const [activeCalendarOverrides, manualActionCommandOperations] = await Promise.all([
            loadActiveCalendarOverrides(taskId),
            loadManualActionCommandOperations(taskId),
          ]);
          if (!activeCalendarOverrides || !isActive || !canApplyCoreWorkspaceResult()) return false;
          const summaryContext = {
            calendarOverrides: activeCalendarOverrides.map(taskCalendarOverrideFromCanonical),
            manualActionCalendarOverrides: activeCalendarOverrides,
            manualActionCommandOperations,
            logicalDayRollover,
            now,
            timezone,
          };
          const hasPrivateTaskHistory = Object.hasOwn(taskHistoryByTaskIdRef.current, taskId);
          if (nextTaskHistory) {
            const taskHistory = deduplicateTaskHistoryByLogicalDate(nextTaskHistory);
            if (hasPrivateTaskHistory) {
              setTaskHistoryCacheForTask(taskId, taskHistory);
            }
            const nextSummary = buildTaskHistoryStreakSummary(task, taskHistory, todayKeyRef.current, summaryContext);
            setTaskHistoryStreakSummaries((current) => (
              JSON.stringify(current[taskId]) === JSON.stringify(nextSummary)
                ? current
                : updateTaskHistoryStreakSummaryMap(current, task, taskHistory, todayKeyRef.current, summaryContext)
            ));
            return true;
          }

          if (hasPrivateTaskHistory) {
            const didReloadPrivateHistory = await loadTaskHistoryForTask(taskId, { force: true, silent: true });
            if (!didReloadPrivateHistory) return false;
            const taskHistory = taskHistoryByTaskIdRef.current[taskId] ?? [];
            if (hasLoadedFullTaskHistoryRef.current) {
              fullTaskHistoryRowsRef.current = deduplicateTaskHistoryByLogicalDate([
                ...fullTaskHistoryRowsRef.current.filter((entry) => entry.task_id !== taskId),
                ...taskHistory,
              ]);
            }
            const nextSummary = buildTaskHistoryStreakSummary(task, taskHistory, todayKeyRef.current, summaryContext);
            setTaskHistoryStreakSummaries((current) => (
              JSON.stringify(current[taskId]) === JSON.stringify(nextSummary)
                ? current
                : updateTaskHistoryStreakSummaryMap(current, task, taskHistory, todayKeyRef.current, summaryContext)
            ));
            return true;
          }
          const result = await fetchAllPagedRows<CanonicalTaskHistoryFact>(async (from, to) => await canonicalHistoryQuery(taskId).range(from, to));
          if (result.error || !isActive || !canApplyCoreWorkspaceResult()) return false;

          const streakRows: TaskHistoryStreakEntry[] = mapCanonicalHistoryRows((result.data ?? []) as CanonicalTaskHistoryFact[]);
          const nextSummary = buildTaskHistoryStreakSummary(task, streakRows, todayKeyRef.current, summaryContext);
          setTaskHistoryStreakSummaries((current) => (
            JSON.stringify(current[taskId]) === JSON.stringify(nextSummary)
              ? current
              : updateTaskHistoryStreakSummaryMap(current, task, streakRows, todayKeyRef.current, summaryContext)
          ));
          return true;
        } finally {
          if (taskHistoryStreakSummaryTaskReloadsRef.current.get(taskId) === reloadOwner) {
            taskHistoryStreakSummaryTaskReloadsRef.current.delete(taskId);
          }
        }
      });
      reloadOwner.promise = reloadPromise;
      taskHistoryStreakSummaryTaskReloadsRef.current.set(taskId, reloadOwner);
      return await reloadPromise;
    }

    async function loadNotes({ silent = false }: { silent?: boolean } = {}) {
      if (hasLoadedNotesRef.current) return true;
      const result = await client.from("adhdice_notes").select("id,title,body,linked_task_ids,updated_at")
        .eq("user_id", userId).order("updated_at", { ascending: false });
      if (result.error) {
        if (!silent) setMessage({ tone: "warn", text: result.error.message ?? "Could not load notes." });
        return false;
      }
      setAvailableTaskNotes((current) => keepCurrentIfStructurallyEqual(current, (result.data ?? []) as TaskEditorLinkedNote[]));
      hasLoadedNotesRef.current = true;
      return true;
    }

    loadFullTaskHistoryRef.current = () => loadTaskHistory({ silent: true, source: "secondary" });
    loadNotesRef.current = () => loadNotes({ silent: true });
    loadTaskHistoryForTaskRef.current = (taskId, options) => loadTaskHistoryForTask(taskId, { ...options, silent: true }).then((result) => result.status === "ready");
    loadTaskHistoryForTasksRef.current = loadTaskHistoryForTasks;
    fetchTaskHistoryForRolloverRef.current = fetchTaskHistoryForRollover;
    refreshTaskHistoryStreakSummaryRef.current = reloadTaskHistoryStreakSummaryForTask;
    retryTaskHistoryForTaskRef.current = (taskId) => loadTaskHistoryForTask(taskId, { force: true }).then((result) => result.status === "ready");

    function canApplyCoreWorkspaceResult() {
      return (
        liveWorkspaceUserIdRef.current === userId
        && workspaceGenerationRef.current === workspaceGeneration
      );
    }

    async function loadCoreWorkspaceData({ silent = false, source = "refresh" }: { silent?: boolean; source?: string } = {}) {
      const taskListLoadGeneration = taskListDataGeneration.current + 1;
      taskListDataGeneration.current = taskListLoadGeneration;
      if (!silent) {
        setIsWorkspaceLoading(true);
      }

      const loadStartedAt = performance.now();
      const criticalCoreStartedAt = isWorkspacePerformanceDiagnosticsEnabled() && typeof performance !== "undefined" ? performance.now() : 0;
      const profileRequest = client
        .from("adhdice_user_profiles")
        .select(WORKSPACE_PROFILE_COLUMNS)
        .eq("user_id", userId)
        .maybeSingle();
      const canonicalTaskSnapshotRequest = loadCanonicalTaskSnapshot(
        () => createTaskRowsRequest(),
        () => createTaskScheduleBoundariesRequest(),
      );
      const criticalCoreRequest = Promise.all([
        canonicalTaskSnapshotRequest,
        profileRequest,
      ]);
      // Focus History is owned by the page-gated Focus hook, never core startup.
      const shouldLoadFocusHistory = false;
      const secondaryCoreRequest = Promise.all([
        client
          .from("adhdice_focus_categories")
          .select("*")
          .eq("user_id", userId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        shouldLoadFocusHistory
          ? client
            .from("adhdice_focus_sessions")
            .select("*")
            .eq("user_id", userId)
            .order("session_date", { ascending: false })
            .order("created_at", { ascending: false })
          : Promise.resolve({ data: null as DbFocusSession[] | null, error: null }),
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
      const [{ taskResult, boundaryResult: taskScheduleBoundariesResult }, profileResult] = await criticalCoreRequest;

      if (!canApplyCoreWorkspaceResult()) {
        if (isWorkspacePerformanceDiagnosticsEnabled()) {
          console.info(`[workspace] Obsolete owner skipped core state application source=${source} userId=${userId}.`);
        }
        return;
      }

      const criticalErrors = [
        taskResult.error,
        taskScheduleBoundariesResult?.error,
        profileResult.error,
      ].filter(Boolean);

      if (criticalErrors.length > 0) {
        setMessage({ tone: "warn", text: criticalErrors[0]?.message ?? "Could not load your tasks." });
        setIsWorkspaceLoading(false);
        return;
      }
      logWorkspaceTiming("Critical workspace core ready", criticalCoreStartedAt, {
        silent,
        tasks: taskResult.data?.length ?? 0,
      });

      const nextTasks = projectTasksWithCanonicalScheduleBoundaries(
        taskResult.data ?? [],
        (taskScheduleBoundariesResult?.data ?? []) as CanonicalTaskScheduleBoundary[],
      );
      tasksRef.current = nextTasks;
      const historyLoaded = await loadTaskHistory({ silent, source: "startup" });
      if (!historyLoaded) {
        setMessage((current) => current ?? { tone: "warn", text: "Could not load canonical task history." });
        setIsWorkspaceLoading(false);
        return;
      }
      startTransition(() => {
        setTasks((current) => keepCurrentIfStructurallyEqual(current, nextTasks));
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
      if (isWorkspacePerformanceDiagnosticsEnabled() && source === "initial") {
        console.info(`[workspace] Live owner applied shared initial result userId=${userId}.`);
      }
      void loadProfileMedia(client, userId);

      if (isWorkspacePerformanceDiagnosticsEnabled()) {
        console.info(`[workspace] Tasks ready in ${Math.round(performance.now() - loadStartedAt)}ms.`);
      }
      void loadTaskHistoryStreakSummaries(nextTasks);

      const secondaryCoreStartedAt = isWorkspacePerformanceDiagnosticsEnabled() && typeof performance !== "undefined" ? performance.now() : 0;
      const [categoryResult, historyResult, focusDayResult, taskListsResult, manualMembershipResult, gridLayoutResult, folderStructureResult] = await secondaryCoreRequest;

      if (!canApplyCoreWorkspaceResult()) {
        if (isWorkspacePerformanceDiagnosticsEnabled()) {
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
      let nextFocusHistory = shouldLoadFocusHistory
        ? mergeStoredFocusHistory((historyResult.data ?? []).map((row) => mapFocusSessionRow(row)))
        : [];
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
        shouldLoadFocusHistory && nextFocusHistory.length === 0
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
      if (shouldLoadFocusHistory) {
        setFocusHistory((current) => keepCurrentIfStructurallyEqual(current, nextFocusHistory));
      }
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
      if (shouldLoadFocusHistory) saveFocusHistory(nextFocusHistory);
      logWorkspaceTiming("Secondary workspace core ready", secondaryCoreStartedAt, {
        categories: nextCategories.length,
        focusDays: Object.keys(nextFocusedTaskIdsByDate).length,
        focusHistory: nextFocusHistory.length,
        manualMemberships: nextTaskListManualMemberships.length,
        listFolders: nextTaskListFolders.length,
        silent,
        taskLists: nextTaskLists.length,
      });
      logWorkspaceTiming("Startup summary", loadStartedAt, {
        canonicalHistoryFacts: fullTaskHistoryRowsRef.current.length,
        focusHistory: shouldLoadFocusHistory ? nextFocusHistory.length : 0,
        tasks: nextTasks.length,
      });
      if (activePageRef.current === "Stats" || activePageRef.current === "Games" || activePageRef.current === "Achievements") {
        void loadFullTaskHistoryRef.current?.();
      }
      if (activePageRef.current === "Notes") void loadNotesRef.current?.();

      if (isWorkspacePerformanceDiagnosticsEnabled()) {
        console.info(`[workspace] Background details ready in ${Math.round(performance.now() - loadStartedAt)}ms.`);
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
            if (isWorkspacePerformanceDiagnosticsEnabled()) {
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

      const refreshStartedAt = isWorkspacePerformanceDiagnosticsEnabled() && typeof performance !== "undefined" ? performance.now() : 0;

      try {
        await ensureTaskChannelSubscribed();
        await requestCoreWorkspaceRefresh({ silent: true, source });

        if (includeSecondaryIfLoaded) {
          if (hasLoadedFullTaskHistoryRef.current) await loadTaskHistory({ silent: true, source: "secondary" });
          if (hasLoadedNotesRef.current) await loadNotes({ silent: true });
        }
      } finally {
        logWorkspaceTiming("Soft workspace refresh complete", refreshStartedAt, {
          includeSecondaryIfLoaded,
          secondaryLoaded: hasLoadedFullTaskHistoryRef.current || hasLoadedNotesRef.current,
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

      if (isWorkspacePerformanceDiagnosticsEnabled()) {
        console.info("[workspace] Rollover targeted task reconciliation requested.");
      }
      await reloadTaskRows({ silent: true, source: "rollover" });

      if (isWorkspacePerformanceDiagnosticsEnabled()) {
        console.info("[workspace] Rollover history reconciliation refreshing the shared canonical snapshot.");
      }
      await loadTaskHistory({ silent: true, source: "rollover" });
      if (isWorkspacePerformanceDiagnosticsEnabled()) {
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
    if (isWorkspacePerformanceDiagnosticsEnabled()) {
      console.info(`[workspace] Initial request ${initialRequest.joined ? "joined existing per-user request" : "started"} userId=${userId}.`);
    }
    void initialRequest.promise.then(
      () => {
        if (isWorkspacePerformanceDiagnosticsEnabled()) {
          console.info(`[workspace] Initial request completed userId=${userId}.`);
        }
      },
      () => {
        if (isWorkspacePerformanceDiagnosticsEnabled()) {
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
        if (isWorkspacePerformanceDiagnosticsEnabled()) {
          console.info(`[workspace] Refresh eligible source=${reason}.`);
        }
        void runSoftWorkspaceRefresh({ includeSecondaryIfLoaded: true, source: "resume" });
      },
      onSkip: (reason) => {
        if (isWorkspacePerformanceDiagnosticsEnabled()) {
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
          if (!hasLoadedNotesRef.current) return;
          hasLoadedNotesRef.current = false;
          void loadNotes({ silent: true });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_task_history_facts",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const taskId = ((payload.new as { task_id?: string; entity_id?: string } | null)?.task_id
            ?? (payload.new as { entity_id?: string } | null)?.entity_id
            ?? (payload.old as { task_id?: string; entity_id?: string } | null)?.task_id
            ?? (payload.old as { entity_id?: string } | null)?.entity_id);
          if (hasLoadedFullTaskHistoryRef.current) {
            void loadTaskHistory({ silent: true, source: "secondary" }).then(() => (
              taskId ? reloadTaskHistoryStreakSummaryForTask(taskId) : loadTaskHistoryStreakSummaries()
            ));
            return;
          }
          if (taskId && Object.hasOwn(taskHistoryByTaskIdRef.current, taskId)) {
            void loadTaskHistoryForTask(taskId, { force: true, silent: true });
            void reloadTaskHistoryStreakSummaryForTask(taskId);
          } else if (taskId) {
            // An ephemeral rollover read does not make this Task a modal-cache owner.
            void reloadTaskHistoryStreakSummaryForTask(taskId);
          } else {
            void loadTaskHistoryStreakSummaries();
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          workspaceChannelSubscriptionCountRef.current += 1;
          if (isWorkspacePerformanceDiagnosticsEnabled()) {
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
      fetchTaskHistoryForRolloverRef.current = null;
      taskChannelRef.current = null;
      taskChannelStatusRef.current = "CLOSED";
      taskChannelRemovalPromiseRef.current = null;
      if (taskChannel) {
        taskChannelRemovalPromiseRef.current = removeTaskChannel(taskChannel);
      }
      if (isWorkspacePerformanceDiagnosticsEnabled()) {
        workspaceChannelCleanupCountRef.current += 1;
        console.info(`[workspace] Workspace realtime cleanup count=${workspaceChannelCleanupCountRef.current} userId=${userId}.`);
      }
      void client.removeChannel(workspaceChannel);
    };
  }, [currentUser?.id, supabase, suppressCategoryReload]);

  useEffect(() => {
    if (!currentUser) {
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
    setTaskGridLayout,
    setTaskHistory,
    setTaskListContainers,
    setTaskListFolders,
    setTaskListRailItems,
    taskGridStarterLayout,
  ]);

  const softRefreshWorkspace = useCallback(async () => {
    await softWorkspaceRefreshRef.current?.();
  }, []);

  const reconcileRolloverWorkspace = useCallback(async () => {
    await rolloverWorkspaceReconciliationRef.current?.();
  }, []);

  const prepareTaskMutation = useCallback(async () => {
    return await prepareTaskMutationRef.current?.() ?? false;
  }, []);

  const loadTaskHistoryForTask = useCallback(
    async (taskId: string, options?: TaskHistoryLoadOptions) => await loadTaskHistoryForTaskRef.current?.(taskId, options) ?? false,
    [],
  );
  const loadTaskHistoryForTasks = useCallback(
    async (taskIds: string[]) => await loadTaskHistoryForTasksRef.current?.(taskIds) ?? {},
    [],
  );
  const fetchTaskHistoryForRollover = useCallback(
    async (taskIds: string[]) => await fetchTaskHistoryForRolloverRef.current?.(taskIds) ?? {},
    [],
  );
  const retryTaskHistoryForTask = useCallback(
    async (taskId: string) => await retryTaskHistoryForTaskRef.current?.(taskId) ?? false,
    [],
  );
  const refreshTaskHistoryStreakSummary = useCallback(
    async (taskId: string, nextTaskHistory?: DbTaskHistory[], nextTask?: Task) => (
      await refreshTaskHistoryStreakSummaryRef.current?.(taskId, nextTaskHistory, nextTask) ?? false
    ),
    [],
  );
  const loadTaskNotes = useCallback(
    async () => await loadNotesRef.current?.() ?? false,
    [],
  );

  return {
    isSoftWorkspaceRefreshing,
    isTaskHistoryLoaded: Boolean(currentUser && taskHistoryLoadedUserId === currentUser.id),
    isTaskListMembershipDataReady: !currentUser || taskListMembershipDataReadyUserId === currentUser.id,
    isTaskResumeSyncPending,
    isWorkspaceLoading,
    workspaceGenerationRef,
    prepareTaskMutation,
    reconcileRolloverWorkspace,
    softRefreshWorkspace,
    loadTaskHistoryForTask,
    loadTaskHistoryForTasks,
    fetchTaskHistoryForRollover,
    retryTaskHistoryForTask,
    loadTaskNotes,
    refreshTaskHistoryStreakSummary,
    taskHistoryByTaskId,
    taskHistoryLoadStateByTaskId,
    taskHistoryStreakSummaries,
    updateTaskHistoryForTask,
  };
}
