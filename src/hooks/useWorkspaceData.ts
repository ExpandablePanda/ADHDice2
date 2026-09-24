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
  TaskHistory as DbTaskHistory,
  TaskContentFolder,
  TaskList as DbTaskList,
  TaskListContainer,
  TaskListFolder,
  TaskListRailItem,
  TaskListManualMembership as DbTaskListManualMembership,
} from "@/lib/database.types";
import { loadProfileMedia, setActiveProfileUserId, WORKSPACE_PROFILE_COLUMNS, type WorkspaceProfileRow } from "@/lib/profile-store";
import type { TaskEditorLinkedNote } from "@/lib/task-notes";
import type { CustomBehaviorRulesetState } from "@/lib/custom-behavior-rulesets";
import type { CanonicalTaskCalendarOverride, CanonicalTaskCommandOperation, CanonicalTaskHistoryFact, CanonicalTaskScheduleBoundary } from "@/lib/task-state-canonical/types";
import { taskCalendarOverrideFromCanonical } from "@/lib/task-state-canonical/engine-input";
import { projectTasksWithCanonicalScheduleBoundaries } from "@/lib/task-state-canonical/schedule-projection";
import {
  deduplicateTaskHistoryByLogicalDate,
  fetchTaskHistoryForTaskIdsInBatches,
  TASK_HISTORY_ROLLOVER_BATCH_SIZE,
  type TaskHistoryLoadMap,
  type TaskHistoryLoadOptions,
  type TaskHistoryLoadResult,
  type TaskHistoryStreakEntry,
} from "@/lib/task-history";
import { reconcileTaskListRows } from "@/lib/task-list-mappers";
import { loadTaskListFolders } from "@/lib/task-list-folders";
import { normalizeTaskContentFolderRow } from "@/lib/task-content-folders";
import type { TaskListDefinition, TaskListManualMembership } from "@/lib/task-lists";
import type { AppPage } from "@/lib/task-ui-state";
import {
  createWorkspaceRefreshCoordinator,
  createWorkspaceResumeRefreshCoordinator,
  createSingleFlightRefreshCoordinator,
  type WorkspaceResumeRefreshReason,
} from "@/lib/workspace-refresh-coordinator";
import { workspaceStartupRequestRegistry } from "@/lib/workspace-startup-request";
import {
  buildTaskHistoryStreakSummary,
  buildTaskHistoryStreakSummaryMapCooperatively,
  updateTaskHistoryStreakSummaryMap,
  type TaskHistoryStreakSummary,
  type TaskHistoryStreakSummaryMap,
} from "@/lib/task-history-streak-summaries";
import { isWorkspacePerformanceDiagnosticsEnabled } from "@/lib/workspace-performance-diagnostics";
import { mapCanonicalTaskHistoryFacts } from "@/lib/task-state-canonical/history-projection";
import type { TaskCalendarOverride } from "@/lib/task-state-engine/types";
import type { TaskBehaviorPolicyResolutionContext } from "@/lib/task-state-engine/behavior-policy";
import {
  applyTaskHistoryDelta,
  createTaskHistoryCacheMetadata,
  fetchTaskHistoryDelta,
  readTaskHistorySyncState,
  TaskHistorySyncError,
} from "@/lib/task-history-sync";
import {
  indexedDbTaskHistoryCache,
  TASK_HISTORY_SYNC_PROTOCOL_VERSION,
  type TaskHistoryCacheSnapshot,
} from "@/lib/task-history-sync-cache";
import {
  CURRENT_TASK_PROJECTION_READ_COLUMNS,
  createCurrentTaskProjectionEventBuffer,
  indexCurrentTaskProjectionRows,
  mergeCurrentTaskProjectionRows,
  type CurrentTaskProjectionReadMap,
  type CurrentTaskProjectionReadRow,
} from "@/lib/task-current-projection-read";
import { isCurrentTaskProjectionFresh } from "@/lib/task-current-projection-freshness";
import { createBoundedTaskProjectionReconciler } from "@/lib/task-current-projection-reconciliation";
import {
  createAdhdiceRealtimeChannelDebugId,
  markAdhdiceRealtimeAuthorityPending,
  recordAdhdiceRealtimeDiagnostic,
  recordAdhdiceTaskPostgresEventDiagnostic,
} from "@/lib/adhdice-realtime-diagnostics";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
type ResolvedSupabaseClient = NonNullable<SupabaseClient>;
type OwnedWorkspacePromise<T> = {
  generation: number;
  promise: Promise<T>;
};

type WorkspaceCoreRefreshSource = "initial" | "manual" | "mutation" | "realtime" | "resume";
type TaskHistoryFullLoadSource = WorkspaceCoreRefreshSource | "rollover" | "secondary";

type TaskHistoryStreakSummaryRefreshOptions = {
  supersede?: boolean;
};

type TaskHistoryStreakSummaryObserver = (summary: TaskHistoryStreakSummary) => void;

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type UseWorkspaceDataOptions = {
  activePage: AppPage;
  behaviorAuthorityReady: boolean;
  behaviorAuthorityLoading: boolean;
  behaviorProfiles: NonNullable<TaskBehaviorPolicyResolutionContext["behaviorProfiles"]>;
  behaviorPolicyRevisions: NonNullable<TaskBehaviorPolicyResolutionContext["behaviorPolicyRevisions"]>;
  namedCustomRulesetBehaviorPolicyRevisions: NonNullable<TaskBehaviorPolicyResolutionContext["namedCustomRulesetBehaviorPolicyRevisions"]>;
  behaviorSelectionStateRef: MutableRefObject<CustomBehaviorRulesetState>;
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
  saveFocusCategories: (categories: FocusCategory[]) => void;
  saveFocusHistory: (history: HistoricalFocusSession[]) => void;
  shouldSkipTaskReload?: (change: { eventType: string; taskId: string | null }) => boolean;
  setAvailableTaskNotes: Dispatch<SetStateAction<TaskEditorLinkedNote[]>>;
  setEconomy: Dispatch<SetStateAction<{ level: number; points: number; tokens: number; xp: number }>>;
  setFocusCategories: Dispatch<SetStateAction<FocusCategory[]>>;
  setFocusHistory: Dispatch<SetStateAction<HistoricalFocusSession[]>>;
  setFocusedTaskIdsByDate: Dispatch<SetStateAction<Record<string, string[]>>>;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTaskHistory: Dispatch<SetStateAction<DbTaskHistory[]>>;
  setTaskListManualMemberships: Dispatch<SetStateAction<TaskListManualMembership[]>>;
  setTaskListContainers: Dispatch<SetStateAction<TaskListContainer[]>>;
  setTaskListFolders: Dispatch<SetStateAction<TaskListFolder[]>>;
  setTaskContentFolders: Dispatch<SetStateAction<TaskContentFolder[]>>;
  setTaskListRailItems: Dispatch<SetStateAction<TaskListRailItem[]>>;
  setTaskLists: Dispatch<SetStateAction<TaskListDefinition[]>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  suppressCategoryReload: MutableRefObject<boolean>;
  supabase: SupabaseClient;
  tasks: Task[];
  taskListDataGeneration: MutableRefObject<number>;
  logicalDayRollover: string;
  now: Date | string;
  todayKey: string;
  timezone: string;
};

const TASK_RESUME_SYNC_COOLDOWN_MS = 1500;
const TASK_HISTORY_PAGE_SIZE = 1000;
const TASK_HISTORY_SYNC_MAX_DELTA_ATTEMPTS = 3;
const TASK_HISTORY_BOOTSTRAP_MAX_ATTEMPTS = 2;

type TaskHistorySyncLoadResult = {
  facts: CanonicalTaskHistoryFact[];
  path: "validated-cache-hit" | "delta-sync" | "full-bootstrap";
  fallbackReason?: string;
  fromRevision?: number;
  toRevision?: number;
  serverFactsReceived: number;
};

export type CurrentTaskProjectionReadContext = {
  historySyncEpoch: string | null;
  logicalDaySettingsRevision: number | null;
};

function keepCurrentIfStructurallyEqual<T>(current: T, next: T) {
  return JSON.stringify(current) === JSON.stringify(next) ? current : next;
}

type PagedFetchResult<T> = {
  data: T[] | null;
  error: { code?: string; message?: string } | null;
};

export function startBackgroundTaskHistoryHydration(
  load: () => Promise<boolean>,
  {
    onFailure,
    onLoaded,
  }: {
    onFailure: (error?: unknown) => void;
    onLoaded?: () => void;
  },
) {
  void load().then((loaded) => {
    if (loaded) {
      onLoaded?.();
      return;
    }
    onFailure();
  }, onFailure);
}

type CanonicalTaskSnapshotRow = {
  id: string;
  canonicalization_status?: string | null;
  terminal_state?: string | null;
  container_state?: string | null;
};

type CanonicalTaskSnapshotBoundaryRow = {
  entity_id: string;
};

function isActiveCanonicalTaskSnapshotRow(task: CanonicalTaskSnapshotRow) {
  return (
    (task.canonicalization_status === "canonical_proven" || task.canonicalization_status === "canonical_runtime")
    && task.terminal_state === "active"
    && task.container_state === "active"
  );
}

export async function loadCanonicalTaskSnapshot<
  TaskRow extends CanonicalTaskSnapshotRow,
  BoundaryRow extends CanonicalTaskSnapshotBoundaryRow,
>(
  loadTaskRows: () => PromiseLike<PagedFetchResult<TaskRow>>,
  loadScheduleBoundaries: (taskIds: string[]) => PromiseLike<PagedFetchResult<BoundaryRow>>,
) {
  const taskResult = await loadTaskRows();
  if (taskResult.error) {
    return { taskResult, boundaryResult: null };
  }

  const taskRows = taskResult.data ?? [];
  const taskIds = taskRows.map((task) => task.id);
  const boundaryResult = taskIds.length === 0
    ? { data: [] as BoundaryRow[], error: null }
    : await loadScheduleBoundaries(taskIds);
  if (boundaryResult.error) {
    return { taskResult, boundaryResult };
  }

  const boundaryTaskIds = new Set((boundaryResult.data ?? []).map((boundary) => boundary.entity_id));
  const missingBoundaryTaskIds = taskRows
    .filter(isActiveCanonicalTaskSnapshotRow)
    .filter((task) => !boundaryTaskIds.has(task.id))
    .map((task) => task.id);
  if (missingBoundaryTaskIds.length > 0) {
    return {
      taskResult,
      boundaryResult: {
        data: null,
        error: {
          code: "CANONICAL_TASK_SNAPSHOT_INCOMPLETE",
          message: `Incomplete canonical Task snapshot; missing schedule boundaries for active Tasks: ${missingBoundaryTaskIds.join(", ")}`,
        },
      },
    };
  }

  return { taskResult, boundaryResult };
}

export type TaskHistoryTaskLoadState = {
  error: string | null;
  status: "error" | "loading" | "ready";
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

export function useWorkspaceData({
  activePage,
  behaviorAuthorityReady,
  behaviorAuthorityLoading,
  behaviorProfiles,
  behaviorPolicyRevisions,
  namedCustomRulesetBehaviorPolicyRevisions,
  behaviorSelectionStateRef,
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
  saveFocusCategories,
  saveFocusHistory,
  shouldSkipTaskReload,
  setAvailableTaskNotes,
  setEconomy,
  setFocusCategories,
  setFocusHistory,
  setFocusedTaskIdsByDate,
  setMessage,
  setTaskHistory,
  setTaskListManualMemberships,
  setTaskListContainers,
  setTaskListFolders,
  setTaskContentFolders,
  setTaskListRailItems,
  setTaskLists,
  setTasks,
  suppressCategoryReload,
  supabase,
  tasks,
  taskListDataGeneration,
  logicalDayRollover,
  now,
  todayKey,
  timezone,
}: UseWorkspaceDataOptions) {
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [fullTaskHistoryLoadedUserId, setFullTaskHistoryLoadedUserId] = useState<string | null>(null);
  const [taskHistoryByTaskId, setTaskHistoryByTaskId] = useState<Record<string, DbTaskHistory[]>>({});
  const [taskHistoryLoadStateByTaskId, setTaskHistoryLoadStateByTaskId] = useState<Record<string, TaskHistoryTaskLoadState>>({});
  const [taskHistoryStreakSummaries, setTaskHistoryStreakSummaries] = useState<TaskHistoryStreakSummaryMap>({});
  const [currentTaskProjectionsByTaskId, setCurrentTaskProjectionsByTaskId] = useState<CurrentTaskProjectionReadMap>({});
  const [currentTaskProjectionReadContext, setCurrentTaskProjectionReadContext] = useState<CurrentTaskProjectionReadContext>({
    historySyncEpoch: null,
    logicalDaySettingsRevision: null,
  });
  const [isCurrentTaskProjectionReadReady, setIsCurrentTaskProjectionReadReady] = useState(false);
  const [isSoftWorkspaceRefreshing, setIsSoftWorkspaceRefreshing] = useState(false);
  const [isTaskResumeSyncPending, setIsTaskResumeSyncPending] = useState(false);
  const [taskListMembershipDataReadyUserId, setTaskListMembershipDataReadyUserId] = useState<string | null>(null);
  const hasLoadedNotesRef = useRef(false);
  const hasLoadedFullTaskHistoryRef = useRef(false);
  const fullTaskHistoryRowsRef = useRef<DbTaskHistory[]>([]);
  const taskHistoryLoadPromiseRef = useRef<OwnedWorkspacePromise<boolean> | null>(null);
  const taskHistoryByTaskIdRef = useRef<Record<string, DbTaskHistory[]>>({});
  const taskHistoryLoadStateByTaskIdRef = useRef<Record<string, TaskHistoryTaskLoadState>>({});
  const taskHistoryTaskLoadPromisesRef = useRef(new Map<string, OwnedWorkspacePromise<TaskHistoryLoadResult>>());
  const loadTaskHistoryForTasksRef = useRef<((taskIds: string[], options?: TaskHistoryLoadOptions) => Promise<TaskHistoryLoadMap>) | null>(null);
  const loadTaskHistoryStreakSummariesRef = useRef<((nextTasks?: Task[], options?: TaskHistoryStreakSummaryRefreshOptions) => Promise<boolean>) | null>(null);
  const taskHistoryStreakSummaryLoadPromiseRef = useRef<OwnedWorkspacePromise<boolean> | null>(null);
  const taskHistoryStreakSummaryCalculationTokenRef = useRef(0);
  const taskHistoryStreakSummaryTaskReloadsRef = useRef(new Map<string, OwnedWorkspacePromise<boolean>>());
  const taskReloadInFlightRef = useRef(false);
  const queuedTaskReloadRef = useRef(false);
  const taskReloadPromiseRef = useRef<Promise<void> | null>(null);
  const taskReloadTriggerTaskIdRef = useRef<string | null>(null);
  const taskChannelRef = useRef<RealtimeChannel | null>(null);
  const taskChannelDebugIdsRef = useRef(new Map<RealtimeChannel, string>());
  const taskChannelStatusRef = useRef<string>("CLOSED");
  const taskChannelRemovalPromiseRef = useRef<Promise<void> | null>(null);
  const projectionChannelRef = useRef<RealtimeChannel | null>(null);
  const projectionChannelDebugIdsRef = useRef(new Map<RealtimeChannel, string>());
  const projectionChannelStatusRef = useRef<string>("CLOSED");
  const projectionChannelRemovalPromiseRef = useRef<Promise<void> | null>(null);
  const projectionChannelSubscriptionPromiseRef = useRef<Promise<void> | null>(null);
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
    request: (request: { silent: boolean; source: WorkspaceCoreRefreshSource }) => Promise<void>;
  } | null>(null);
  const lastCoreRefreshCompletedAtRef = useRef(0);
  const initialCoreLoadActiveRef = useRef(false);
  const startupRequestUserIdRef = useRef<string | null>(null);
  const liveWorkspaceUserIdRef = useRef<string | null>(null);
  const taskChannelSubscriptionCountRef = useRef(0);
  const workspaceChannelSubscriptionCountRef = useRef(0);
  const taskChannelCleanupCountRef = useRef(0);
  const workspaceChannelCleanupCountRef = useRef(0);
  const projectionChannelSubscriptionCountRef = useRef(0);
  const projectionChannelCleanupCountRef = useRef(0);
  const currentTaskProjectionReadContextRef = useRef<CurrentTaskProjectionReadContext>({
    historySyncEpoch: null,
    logicalDaySettingsRevision: null,
  });
  const softWorkspaceRefreshRef = useRef<(() => Promise<void>) | null>(null);
  const rolloverWorkspaceReconciliationRef = useRef<(() => Promise<void>) | null>(null);
  const prepareTaskMutationRef = useRef<(() => Promise<boolean>) | null>(null);
  const loadFullTaskHistoryRef = useRef<(() => Promise<boolean>) | null>(null);
  const loadNotesRef = useRef<(() => Promise<boolean>) | null>(null);
  const loadTaskHistoryForTaskRef = useRef<((taskId: string, options?: TaskHistoryLoadOptions) => Promise<boolean>) | null>(null);
  const refreshTaskHistoryStreakSummaryRef = useRef<((taskId: string, nextTaskHistory?: DbTaskHistory[], nextTask?: Task, onSummary?: TaskHistoryStreakSummaryObserver) => Promise<boolean>) | null>(null);
  const retryTaskHistoryForTaskRef = useRef<((taskId: string) => Promise<boolean>) | null>(null);
  const fetchTaskHistoryForRolloverRef = useRef<((taskIds: string[]) => Promise<TaskHistoryLoadMap>) | null>(null);
  const tasksRef = useRef(tasks);
  const behaviorAuthorityOwnerUserIdRef = useRef<string | null>(currentUser?.id ?? null);
  const behaviorAuthorityReadyRef = useRef(behaviorAuthorityReady);
  const behaviorAuthorityLoadingRef = useRef(behaviorAuthorityLoading);
  const behaviorProfilesRef = useRef(behaviorProfiles);
  const behaviorPolicyRevisionsRef = useRef(behaviorPolicyRevisions);
  const namedCustomRulesetBehaviorPolicyRevisionsRef = useRef(namedCustomRulesetBehaviorPolicyRevisions);

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
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    if (todayKeyRef.current === todayKey) return;
    todayKeyRef.current = todayKey;
    if (!hasLoadedFullTaskHistoryRef.current) return;
    void loadTaskHistoryStreakSummariesRef.current?.(tasksRef.current, { supersede: true });
  }, [todayKey]);

  useEffect(() => {
    behaviorProfilesRef.current = behaviorProfiles;
  }, [behaviorProfiles]);

  useEffect(() => {
    behaviorAuthorityReadyRef.current = behaviorAuthorityReady;
    behaviorAuthorityLoadingRef.current = behaviorAuthorityLoading;
    // These refs feed long-lived workspace callbacks; they intentionally mirror the current owner inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [behaviorAuthorityLoading, behaviorAuthorityReady]);

  useEffect(() => {
    behaviorPolicyRevisionsRef.current = behaviorPolicyRevisions;
  }, [behaviorPolicyRevisions]);

  useEffect(() => {
    namedCustomRulesetBehaviorPolicyRevisionsRef.current = namedCustomRulesetBehaviorPolicyRevisions;
  }, [namedCustomRulesetBehaviorPolicyRevisions]);

  useEffect(() => {
    shouldSkipTaskReloadRef.current = shouldSkipTaskReload;
  }, [shouldSkipTaskReload]);

  useEffect(() => {
    const workspaceGeneration = workspaceGenerationRef.current + 1;
    workspaceGenerationRef.current = workspaceGeneration;

    if (!supabase || !currentUser) {
      behaviorAuthorityOwnerUserIdRef.current = null;
      behaviorAuthorityReadyRef.current = false;
      behaviorAuthorityLoadingRef.current = false;
      setActiveProfileUserId(null);
      workspaceStartupRequestRegistry.invalidate(startupRequestUserIdRef.current);
      startupRequestUserIdRef.current = null;
      liveWorkspaceUserIdRef.current = null;
      hasLoadedNotesRef.current = false;
      hasLoadedFullTaskHistoryRef.current = false;
      fullTaskHistoryRowsRef.current = [];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear the user-scoped History modal cache on sign-out.
      clearTaskHistoryTaskCache();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear the user-scoped display cache on sign-out.
      setTaskHistoryStreakSummaries({});
      setCurrentTaskProjectionsByTaskId({});
      setCurrentTaskProjectionReadContext({ historySyncEpoch: null, logicalDaySettingsRevision: null });
      currentTaskProjectionReadContextRef.current = { historySyncEpoch: null, logicalDaySettingsRevision: null };
      setIsCurrentTaskProjectionReadReady(false);
      setFullTaskHistoryLoadedUserId(null);
      taskHistoryLoadPromiseRef.current = null;
      loadTaskHistoryStreakSummariesRef.current = null;
      taskHistoryStreakSummaryLoadPromiseRef.current = null;
      taskHistoryStreakSummaryCalculationTokenRef.current += 1;
      taskHistoryStreakSummaryTaskReloadsRef.current.clear();
      taskReloadInFlightRef.current = false;
      queuedTaskReloadRef.current = false;
      taskReloadPromiseRef.current = null;
      taskChannelRef.current = null;
      taskChannelStatusRef.current = "CLOSED";
      taskChannelRemovalPromiseRef.current = null;
      projectionChannelRef.current = null;
      projectionChannelStatusRef.current = "CLOSED";
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
    if (behaviorAuthorityOwnerUserIdRef.current !== userId) {
      behaviorAuthorityOwnerUserIdRef.current = userId;
      behaviorAuthorityReadyRef.current = false;
      behaviorAuthorityLoadingRef.current = true;
    }
    clearTaskHistoryTaskCache();
    setTaskHistoryStreakSummaries((current) => Object.keys(current).length === 0 ? current : {});
    setCurrentTaskProjectionsByTaskId({});
    setCurrentTaskProjectionReadContext({ historySyncEpoch: null, logicalDaySettingsRevision: null });
    currentTaskProjectionReadContextRef.current = { historySyncEpoch: null, logicalDaySettingsRevision: null };
    setIsCurrentTaskProjectionReadReady(false);
    hasLoadedFullTaskHistoryRef.current = false;
    fullTaskHistoryRowsRef.current = [];
    setFullTaskHistoryLoadedUserId(null);
    taskHistoryLoadPromiseRef.current = null;
    loadTaskHistoryStreakSummariesRef.current = null;
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
    let projectionChannel: RealtimeChannel | null = null;
    let broadManualActionCommandOperationReads = 0;
    const taskHistoryRefreshCoordinator = createSingleFlightRefreshCoordinator<boolean>();
    let taskHistoryRevisionReconciliationScheduled = false;
    taskChannelSubscriptionCountRef.current = 0;
    workspaceChannelSubscriptionCountRef.current = 0;
    taskChannelCleanupCountRef.current = 0;
    workspaceChannelCleanupCountRef.current = 0;
    projectionChannelSubscriptionCountRef.current = 0;
    projectionChannelCleanupCountRef.current = 0;

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

    function historySyncErrorReason(error: unknown) {
      return error instanceof TaskHistorySyncError ? error.code : "unknown-sync-error";
    }

    function logTaskHistorySync(result: TaskHistorySyncLoadResult) {
      if (!isWorkspacePerformanceDiagnosticsEnabled()) return;
      console.info(
        `[workspace:history-sync] path=${result.path}`
          + ` facts=${result.serverFactsReceived}`
          + `${result.fromRevision === undefined ? "" : ` from=${result.fromRevision}`}`
          + `${result.toRevision === undefined ? "" : ` to=${result.toRevision}`}`
          + `${result.fallbackReason ? ` reason=${result.fallbackReason}` : ""}`,
      );
    }

    async function fetchFullCanonicalHistoryFacts() {
      const taskHistoryResult = await fetchAllPagedRows<CanonicalTaskHistoryFact>(
        async (from, to) => await canonicalHistoryQuery().range(from, to),
      );
      if (taskHistoryResult.error) return { data: null, error: taskHistoryResult.error };
      return { data: (taskHistoryResult.data ?? []) as CanonicalTaskHistoryFact[], error: null };
    }

    async function fullCanonicalHistoryBootstrap(fallbackReason: string): Promise<TaskHistorySyncLoadResult | null> {
      let lastReason = fallbackReason;
      for (let attempt = 0; attempt < TASK_HISTORY_BOOTSTRAP_MAX_ATTEMPTS; attempt += 1) {
        let beforeState;
        try {
          beforeState = await readTaskHistorySyncState(client, userId);
        } catch (error) {
          const factsResult = await fetchFullCanonicalHistoryFacts();
          if (factsResult.error || !factsResult.data) return null;
          return {
            facts: factsResult.data,
            path: "full-bootstrap",
            fallbackReason: `${lastReason}:${historySyncErrorReason(error)}`,
            serverFactsReceived: factsResult.data.length,
          };
        }

        const factsResult = await fetchFullCanonicalHistoryFacts();
        if (factsResult.error || !factsResult.data) return null;
        if (!beforeState) {
          return {
            facts: factsResult.data,
            path: "full-bootstrap",
            fallbackReason: `${lastReason}:sync-state-missing`,
            serverFactsReceived: factsResult.data.length,
          };
        }

        let afterState;
        try {
          afterState = await readTaskHistorySyncState(client, userId);
        } catch (error) {
          return {
            facts: factsResult.data,
            path: "full-bootstrap",
            fallbackReason: `${lastReason}:post-watermark-${historySyncErrorReason(error)}`,
            serverFactsReceived: factsResult.data.length,
          };
        }
        if (!afterState) {
          return {
            facts: factsResult.data,
            path: "full-bootstrap",
            fallbackReason: `${lastReason}:post-sync-state-missing`,
            serverFactsReceived: factsResult.data.length,
          };
        }
        if (beforeState.protocol_version !== TASK_HISTORY_SYNC_PROTOCOL_VERSION
          || afterState.protocol_version !== TASK_HISTORY_SYNC_PROTOCOL_VERSION
          || beforeState.sync_epoch !== afterState.sync_epoch
          || beforeState.current_revision !== afterState.current_revision) {
          lastReason = "bootstrap-revision-raced";
          continue;
        }

        const metadata = createTaskHistoryCacheMetadata(userId, afterState, factsResult.data.length);
        try {
          const snapshot: TaskHistoryCacheSnapshot = { metadata, facts: factsResult.data };
          await indexedDbTaskHistoryCache.replaceSnapshot(snapshot);
          return {
            facts: factsResult.data,
            path: "full-bootstrap",
            fallbackReason: fallbackReason === "cache-miss" ? undefined : fallbackReason,
            fromRevision: afterState.current_revision,
            toRevision: afterState.current_revision,
            serverFactsReceived: factsResult.data.length,
          };
        } catch {
          return {
            facts: factsResult.data,
            path: "full-bootstrap",
            fallbackReason: `${lastReason}:cache-write-failed`,
            fromRevision: afterState.current_revision,
            toRevision: afterState.current_revision,
            serverFactsReceived: factsResult.data.length,
          };
        }
      }
      return null;
    }

    async function synchronizeCanonicalHistory(): Promise<TaskHistorySyncLoadResult | null> {
      let serverState;
      try {
        serverState = await readTaskHistorySyncState(client, userId);
      } catch (error) {
        return await fullCanonicalHistoryBootstrap(`watermark-${historySyncErrorReason(error)}`);
      }
      if (!serverState) return await fullCanonicalHistoryBootstrap("sync-state-missing");

      const cache = await indexedDbTaskHistoryCache.read(userId);
      if (cache.status !== "hit") {
        return await fullCanonicalHistoryBootstrap(cache.status === "miss" ? "cache-miss" : `${cache.status}-${cache.reason}`);
      }
      if (cache.snapshot.metadata.protocolVersion !== TASK_HISTORY_SYNC_PROTOCOL_VERSION) {
        return await fullCanonicalHistoryBootstrap("cache-protocol-mismatch");
      }
      if (cache.snapshot.metadata.syncEpoch !== serverState.sync_epoch) {
        return await fullCanonicalHistoryBootstrap("sync-epoch-mismatch");
      }
      if (cache.snapshot.metadata.validatedRevision > serverState.current_revision) {
        return await fullCanonicalHistoryBootstrap("server-revision-behind-cache");
      }
      if (cache.snapshot.metadata.validatedRevision === serverState.current_revision) {
        return {
          facts: cache.snapshot.facts,
          path: "validated-cache-hit",
          fromRevision: serverState.current_revision,
          toRevision: serverState.current_revision,
          serverFactsReceived: 0,
        };
      }

      let facts = cache.snapshot.facts;
      let fromRevision = cache.snapshot.metadata.validatedRevision;
      let currentServerState = serverState;
      for (let attempt = 0; attempt < TASK_HISTORY_SYNC_MAX_DELTA_ATTEMPTS; attempt += 1) {
        let delta;
        try {
          delta = await fetchTaskHistoryDelta(client, userId, currentServerState, fromRevision);
        } catch (error) {
          return await fullCanonicalHistoryBootstrap(`delta-${historySyncErrorReason(error)}`);
        }
        if (delta.syncEpoch !== currentServerState.sync_epoch || delta.fromRevision !== fromRevision) {
          return await fullCanonicalHistoryBootstrap("delta-fence-mismatch");
        }
        try {
          facts = applyTaskHistoryDelta(facts, delta, userId);
          await indexedDbTaskHistoryCache.applyDelta(
            userId,
            delta.changes,
            createTaskHistoryCacheMetadata(userId, {
              current_revision: delta.toRevision,
              sync_epoch: delta.syncEpoch,
            }, facts.length),
            fromRevision,
          );
        } catch (error) {
          return await fullCanonicalHistoryBootstrap(`delta-apply-${historySyncErrorReason(error)}`);
        }

        let afterState;
        try {
          afterState = await readTaskHistorySyncState(client, userId);
        } catch (error) {
          return await fullCanonicalHistoryBootstrap(`delta-post-watermark-${historySyncErrorReason(error)}`);
        }
        if (!afterState || afterState.sync_epoch !== delta.syncEpoch || afterState.current_revision < delta.toRevision) {
          return await fullCanonicalHistoryBootstrap("delta-post-fence-mismatch");
        }
        if (afterState.current_revision === delta.toRevision) {
          return {
            facts,
            path: "delta-sync",
            fromRevision: cache.snapshot.metadata.validatedRevision,
            toRevision: delta.toRevision,
            serverFactsReceived: delta.changes.length,
          };
        }
        fromRevision = delta.toRevision;
        currentServerState = afterState;
      }
      return await fullCanonicalHistoryBootstrap("delta-reconciliation-bounded");
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
      if (!taskId) broadManualActionCommandOperationReads += 1;
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

    function createTaskScheduleBoundariesRequest(taskIds: string[]) {
      return client
        .from("adhdice_task_schedule_boundaries")
        .select("*")
        .eq("user_id", userId)
        .in("entity_id", taskIds)
        .order("boundary_sequence", { ascending: false })
        .order("id", { ascending: true });
    }

    function loadTaskScheduleBoundaries(taskIds: string[]) {
      return fetchAllPagedRows<CanonicalTaskScheduleBoundary>(
        async (from, to) => await createTaskScheduleBoundariesRequest(taskIds).range(from, to),
      );
    }

    async function reloadTaskRows({
      silent = false,
      source = "realtime",
    }: { silent?: boolean; source?: string } = {}) {
      const triggerTaskId = taskReloadTriggerTaskIdRef.current;
      taskReloadTriggerTaskIdRef.current = null;
      const channelDebugId = taskChannelRef.current
        ? taskChannelDebugIdsRef.current.get(taskChannelRef.current)
        : undefined;
      recordAdhdiceRealtimeDiagnostic({
        channel: "task",
        channelDebugId,
        kind: "task_reload_requested",
        source,
        taskId: triggerTaskId,
      });
      if (!isActive) {
        recordAdhdiceRealtimeDiagnostic({
          channel: "task",
          channelDebugId,
          kind: "task_reload_early_return",
          reason: "inactive",
          source,
          taskId: triggerTaskId,
        });
        return;
      }

      if (taskReloadInFlightRef.current) {
        queuedTaskReloadRef.current = true;
        recordAdhdiceRealtimeDiagnostic({
          channel: "task",
          channelDebugId,
          kind: "task_reload_queued",
          reason: "in_flight",
          source,
          taskId: triggerTaskId,
        });
        await taskReloadPromiseRef.current;
        return;
      }

      taskReloadInFlightRef.current = true;
      recordAdhdiceRealtimeDiagnostic({
        channel: "task",
        channelDebugId,
        kind: "task_reload_started",
        source,
        taskId: triggerTaskId,
      });
      const taskReloadPromise = (async () => {
        try {
        do {
          queuedTaskReloadRef.current = false;
          const { taskResult, boundaryResult } = await loadCanonicalTaskSnapshot(
            () => createTaskRowsRequest(),
            (taskIds) => loadTaskScheduleBoundaries(taskIds),
          );

          if (!isActive) {
            recordAdhdiceRealtimeDiagnostic({
              channel: "task",
              channelDebugId,
              kind: "task_reload_early_return",
              reason: "inactive_after_fetch",
              source,
              taskId: triggerTaskId,
            });
            return;
          }

          if (taskResult.error || boundaryResult?.error) {
            const snapshotError = taskResult.error ?? boundaryResult?.error;
            recordAdhdiceRealtimeDiagnostic({
              channel: "task",
              channelDebugId,
              kind: "task_reload_error",
              reason: snapshotError?.code ?? "snapshot_error",
              source,
              taskId: triggerTaskId,
            });
            if (!silent || snapshotError?.code === "CANONICAL_TASK_SNAPSHOT_INCOMPLETE") {
              setMessage({ tone: "warn", text: snapshotError?.message ?? "Could not refresh your tasks." });
            }
            return;
          }

          const nextTasks = projectTasksWithCanonicalScheduleBoundaries(
            taskResult.data ?? [],
            (boundaryResult?.data ?? []) as CanonicalTaskScheduleBoundary[],
          );
          const fetchedTriggerTask = triggerTaskId
            ? nextTasks.find((task) => task.id === triggerTaskId)
            : undefined;
          if (fetchedTriggerTask) {
            recordAdhdiceRealtimeDiagnostic({
              channel: "task",
              channelDebugId,
              kind: "task_reload_fetched_trigger_task",
              newCanonicalRevision: fetchedTriggerTask.canonical_revision,
              newRevision: fetchedTriggerTask.revision,
              taskId: fetchedTriggerTask.id,
              updatedAt: fetchedTriggerTask.updated_at,
            });
          }
          tasksRef.current = nextTasks;
          startTransition(() => {
            setTasks((current) => keepCurrentIfStructurallyEqual(current, nextTasks));
          });
          if (isWorkspacePerformanceDiagnosticsEnabled() && source === "rollover") {
            console.info("[workspace] Task rows reloaded source=rollover.");
          }
        } while (queuedTaskReloadRef.current && isActive);
        } finally {
          recordAdhdiceRealtimeDiagnostic({
            channel: "task",
            channelDebugId,
            kind: "task_reload_completed",
            source,
            taskId: triggerTaskId,
          });
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
      const channelDebugId = taskChannelDebugIdsRef.current.get(channel);
      recordAdhdiceRealtimeDiagnostic({
        channel: "task",
        channelDebugId,
        kind: "channel_cleanup_requested",
      });
      try {
        await client.removeChannel(channel);
        taskChannelDebugIdsRef.current.delete(channel);
        recordAdhdiceRealtimeDiagnostic({
          channel: "task",
          channelDebugId,
          kind: "channel_cleanup_completed",
        });
        taskChannelCleanupCountRef.current += 1;
        if (isWorkspacePerformanceDiagnosticsEnabled()) {
          console.info(`[workspace] Task realtime cleanup count=${taskChannelCleanupCountRef.current} userId=${userId}.`);
        }
      } catch {
        recordAdhdiceRealtimeDiagnostic({
          channel: "task",
          channelDebugId,
          kind: "channel_cleanup_ignored_error",
        });
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
      const channelDebugId = createAdhdiceRealtimeChannelDebugId("task");
      const nextTaskChannel = client.channel(`adhdice_tasks:${userId}`);
      taskChannelDebugIdsRef.current.set(nextTaskChannel, channelDebugId);
      recordAdhdiceRealtimeDiagnostic({
        channel: "task",
        channelDebugId,
        kind: "channel_created",
      });
      nextTaskChannel
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
            const remoteCanonicalRevision = (payload.new as { canonical_revision?: number | null } | null)?.canonical_revision ?? null;
            const previousTaskCanonicalRevision = taskId
              ? tasksRef.current.find((task) => task.id === taskId)?.canonical_revision ?? null
              : null;
            recordAdhdiceTaskPostgresEventDiagnostic({ channelDebugId, eventType: payload.eventType, taskId, newRow: payload.new });
            if (taskId) markAdhdiceRealtimeAuthorityPending(taskId);
            const shouldSkip = shouldSkipTaskReloadRef.current?.({ eventType: payload.eventType, taskId }) ?? false;
            recordAdhdiceRealtimeDiagnostic({
              channel: "task",
              channelDebugId,
              eventType: payload.eventType,
              kind: "task_should_skip_reload",
              shouldSkip,
              taskId,
            });
            if (shouldSkip) {
              return;
            }
            taskReloadTriggerTaskIdRef.current = taskId;
            void reloadTaskRows({ silent: true }).then(() => {
              const reloadedTask = taskId ? tasksRef.current.find((task) => task.id === taskId) : undefined;
              if (
                !reloadedTask
                || typeof remoteCanonicalRevision !== "number"
                || typeof reloadedTask.canonical_revision !== "number"
                || reloadedTask.canonical_revision < remoteCanonicalRevision
                || (typeof previousTaskCanonicalRevision === "number" && remoteCanonicalRevision <= previousTaskCanonicalRevision)
              ) {
                return;
              }
              void requestTaskProjectionReconciliation(taskId!);
            });
          },
        )
        .subscribe((status) => {
          recordAdhdiceRealtimeDiagnostic({
            channel: "task",
            channelDebugId,
            kind: "channel_subscribe_status",
            status,
          });
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
      refreshAfterCurrent = false,
    }: {
      silent?: boolean;
      source?: TaskHistoryFullLoadSource;
      refreshAfterCurrent?: boolean;
    } = {}) {
      if (!isActive || !canApplyCoreWorkspaceResult()) {
        return false;
      }

      const joinedInFlight = taskHistoryRefreshCoordinator.isRunning();
      if (joinedInFlight && isWorkspacePerformanceDiagnosticsEnabled() && source === "rollover") {
        console.info(
          refreshAfterCurrent
            ? "[workspace] Rollover history reconciliation queued a fresh canonical snapshot after the in-flight load."
            : "[workspace] Rollover history reconciliation joined an in-flight history load.",
        );
      }

      const taskHistoryLoadPromise = taskHistoryRefreshCoordinator.request(
        async () => {
          if (!isActive || !canApplyCoreWorkspaceResult()) {
            return false;
          }

          const synchronizedHistory = await synchronizeCanonicalHistory();
          if (!synchronizedHistory) {
            if (!silent) {
              setMessage({ tone: "warn", text: "Could not validate canonical task history." });
            }
            return false;
          }
          const nextTaskHistory = deduplicateTaskHistoryByLogicalDate(mapCanonicalHistoryRows(synchronizedHistory.facts));
          const nextByTaskId = Object.fromEntries(
            [...new Set([...tasksRef.current.map((task) => task.id), ...nextTaskHistory.map((entry) => entry.task_id)])]
              .map((taskId) => [taskId, nextTaskHistory.filter((entry) => entry.task_id === taskId)]),
          );
          fullTaskHistoryRowsRef.current = nextTaskHistory;
          taskHistoryByTaskIdRef.current = nextByTaskId;
          setTaskHistory((current) => keepCurrentIfStructurallyEqual(current, nextTaskHistory));
          setTaskHistoryByTaskId((current) => keepCurrentIfStructurallyEqual(current, nextByTaskId));
          const nextTaskHistoryLoadStateByTaskId = Object.fromEntries(
            Object.keys(nextByTaskId).map((taskId) => [taskId, { error: null, status: "ready" }]),
          ) as Record<string, TaskHistoryTaskLoadState>;
          taskHistoryLoadStateByTaskIdRef.current = nextTaskHistoryLoadStateByTaskId;
          setTaskHistoryLoadStateByTaskId((current) => keepCurrentIfStructurallyEqual(
            current,
            nextTaskHistoryLoadStateByTaskId,
          ));
          hasLoadedFullTaskHistoryRef.current = true;
          setFullTaskHistoryLoadedUserId(userId);
          logTaskHistorySync(synchronizedHistory);
          return true;
        },
        { refreshAfterCurrent },
      );
      taskHistoryLoadPromiseRef.current = { generation: workspaceGeneration, promise: taskHistoryLoadPromise };

      try {
        return await taskHistoryLoadPromise;
      } finally {
        if (taskHistoryLoadPromiseRef.current?.promise === taskHistoryLoadPromise) {
          taskHistoryLoadPromiseRef.current = null;
        }
      }
    }

    function scheduleTaskHistoryRevisionReconciliation() {
      if (taskHistoryRevisionReconciliationScheduled) return;
      if (!hasLoadedFullTaskHistoryRef.current) return;
      taskHistoryRevisionReconciliationScheduled = true;
      void loadTaskHistory({ silent: true, source: "realtime", refreshAfterCurrent: true })
        .then((loaded) => loaded ? loadTaskHistoryStreakSummaries() : false)
        .finally(() => { taskHistoryRevisionReconciliationScheduled = false; });
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

    async function loadTaskHistoryForTasks(taskIds: string[], options: TaskHistoryLoadOptions = {}) {
      const uniqueTaskIds = [...new Set(taskIds)].filter(Boolean);
      const results = await Promise.all(uniqueTaskIds.map(async (taskId) => [
        taskId,
        await loadTaskHistoryForTask(taskId, { ...options, silent: true }),
      ] as const));
      return Object.fromEntries(results) as TaskHistoryLoadMap;
    }

    async function loadTaskHistoryStreakSummaries(
      nextTasks: Task[] = tasksRef.current,
      options: TaskHistoryStreakSummaryRefreshOptions = {},
    ) {
      if (!isActive || !canApplyCoreWorkspaceResult()) {
        return false;
      }
      if (!canApplyBehaviorAuthorityProjection()) {
        return false;
      }
      if (!hasLoadedFullTaskHistoryRef.current) {
        return false;
      }

      if (options.supersede) {
        taskHistoryStreakSummaryCalculationTokenRef.current += 1;
        taskHistoryStreakSummaryLoadPromiseRef.current = null;
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
      const calculationToken = taskHistoryStreakSummaryCalculationTokenRef.current + 1;
      taskHistoryStreakSummaryCalculationTokenRef.current = calculationToken;
      const canApplySummaryCalculation = () => (
        isActive
        && canApplyCoreWorkspaceResult()
        && canApplyBehaviorAuthorityProjection()
        && taskHistoryStreakSummaryCalculationTokenRef.current === calculationToken
      );
      const summaryLoadPromise = Promise.resolve().then(async () => {
        try {
          if (!canApplySummaryCalculation()) {
            return false;
          }

          const compactHistory: TaskHistoryStreakEntry[] = fullTaskHistoryRowsRef.current;

          if (!canApplySummaryCalculation()) {
            return false;
          }

          const [activeCalendarOverrides, manualActionCommandOperations] = await Promise.all([
            loadActiveCalendarOverrides(),
            loadManualActionCommandOperations(),
          ]);
          if (!activeCalendarOverrides || !canApplySummaryCalculation()) {
            return false;
          }

          const nextSummaries = await buildTaskHistoryStreakSummaryMapCooperatively(nextTasks, compactHistory, todayKeyRef.current, {
            behaviorProfiles: behaviorProfilesRef.current,
            behaviorPolicyRevisions: behaviorPolicyRevisionsRef.current,
            namedCustomRulesetBehaviorPolicyRevisions: namedCustomRulesetBehaviorPolicyRevisionsRef.current,
            behaviorSelectionsByTaskId: behaviorSelectionStateRef.current.behaviorSelectionsByTaskId,
            calendarOverridesByTaskId: indexActiveCalendarOverrides(activeCalendarOverrides),
            logicalDayRollover,
            manualActionCalendarOverrides: activeCalendarOverrides,
            manualActionCommandOperations,
            now,
            timezone,
          }, {
            budgetMs: 10,
            isCurrent: canApplySummaryCalculation,
          });
          if (!nextSummaries.completed || !canApplySummaryCalculation()) return false;
          setTaskHistoryStreakSummaries((current) => keepCurrentIfStructurallyEqual(current, nextSummaries.summaries));
          if (options.supersede && isWorkspacePerformanceDiagnosticsEnabled()) {
            console.info(`[workspace:streak-summary] mode=bulk-chunked reason=behavior-policy tasks=${nextTasks.length} chunks=${nextSummaries.chunks}`);
          }
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

    async function reloadTaskHistoryStreakSummaryForTask(taskId: string, nextTaskHistory?: DbTaskHistory[], nextTask?: Task, onSummary?: TaskHistoryStreakSummaryObserver) {
      if (!isActive || !canApplyCoreWorkspaceResult()) {
        return false;
      }
      if (!canApplyBehaviorAuthorityProjection()) {
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
          if (!isActive || !canApplyCoreWorkspaceResult() || !canApplyBehaviorAuthorityProjection()) {
            return false;
          }

          const task = nextTask ?? tasksRef.current.find((candidate) => candidate.id === taskId);
          if (!task) return false;
          const [activeCalendarOverrides, manualActionCommandOperations] = await Promise.all([
            loadActiveCalendarOverrides(taskId),
            loadManualActionCommandOperations(taskId),
          ]);
          if (!activeCalendarOverrides || !isActive || !canApplyCoreWorkspaceResult() || !canApplyBehaviorAuthorityProjection()) return false;
          const summaryContext = {
            behaviorProfiles: behaviorProfilesRef.current,
            behaviorPolicyRevisions: behaviorPolicyRevisionsRef.current,
            namedCustomRulesetBehaviorPolicyRevisions: namedCustomRulesetBehaviorPolicyRevisionsRef.current,
            behaviorSelectionsByTaskId: behaviorSelectionStateRef.current.behaviorSelectionsByTaskId,
            calendarOverrides: activeCalendarOverrides.map(taskCalendarOverrideFromCanonical),
            manualActionCalendarOverrides: activeCalendarOverrides,
            manualActionCommandOperations,
            logicalDayRollover,
            now,
            timezone,
          };
          if (nextTaskHistory) {
            const taskHistory = deduplicateTaskHistoryByLogicalDate(nextTaskHistory);
            if (Object.hasOwn(taskHistoryByTaskIdRef.current, taskId)) {
              setTaskHistoryCacheForTask(taskId, taskHistory);
            }
            const nextSummary = buildTaskHistoryStreakSummary(task, taskHistory, todayKeyRef.current, summaryContext);
            onSummary?.(nextSummary);
            setTaskHistoryStreakSummaries((current) => (
              JSON.stringify(current[taskId]) === JSON.stringify(nextSummary)
                ? current
                : updateTaskHistoryStreakSummaryMap(current, task, taskHistory, todayKeyRef.current, summaryContext)
            ));
            return true;
          }

          const hasAuthoritativeTaskHistory = taskHistoryLoadStateByTaskIdRef.current[taskId]?.status === "ready"
            && Object.hasOwn(taskHistoryByTaskIdRef.current, taskId);
          let taskHistory: DbTaskHistory[];
          if (hasAuthoritativeTaskHistory) {
            taskHistory = [...(taskHistoryByTaskIdRef.current[taskId] ?? [])];
          } else {
            const historyLoad = await loadTaskHistoryForTask(taskId, { silent: true });
            if (historyLoad.status !== "ready" || !canApplyBehaviorAuthorityProjection()) return false;
            taskHistory = historyLoad.history;
          }
          if (!canApplyBehaviorAuthorityProjection()) return false;
          if (hasAuthoritativeTaskHistory && hasLoadedFullTaskHistoryRef.current) {
            fullTaskHistoryRowsRef.current = deduplicateTaskHistoryByLogicalDate([
              ...fullTaskHistoryRowsRef.current.filter((entry) => entry.task_id !== taskId),
              ...taskHistory,
            ]);
          }
          const nextSummary = buildTaskHistoryStreakSummary(task, taskHistory, todayKeyRef.current, summaryContext);
          onSummary?.(nextSummary);
          setTaskHistoryStreakSummaries((current) => (
            JSON.stringify(current[taskId]) === JSON.stringify(nextSummary)
              ? current
              : updateTaskHistoryStreakSummaryMap(current, task, taskHistory, todayKeyRef.current, summaryContext)
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
    loadTaskHistoryStreakSummariesRef.current = loadTaskHistoryStreakSummaries;
    fetchTaskHistoryForRolloverRef.current = fetchTaskHistoryForRollover;
    refreshTaskHistoryStreakSummaryRef.current = reloadTaskHistoryStreakSummaryForTask;
    retryTaskHistoryForTaskRef.current = (taskId) => loadTaskHistoryForTask(taskId, { force: true }).then((result) => result.status === "ready");

    function canApplyCoreWorkspaceResult() {
      return (
        liveWorkspaceUserIdRef.current === userId
        && workspaceGenerationRef.current === workspaceGeneration
      );
    }

    function canApplyBehaviorAuthorityProjection() {
      return behaviorAuthorityReadyRef.current && !behaviorAuthorityLoadingRef.current;
    }

    async function loadCoreWorkspaceData({ silent = false, source = "initial" }: { silent?: boolean; source?: WorkspaceCoreRefreshSource } = {}) {
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
      const currentTaskProjectionRequest = client
        .from("adhdice_task_current_projections")
        .select(CURRENT_TASK_PROJECTION_READ_COLUMNS)
        .eq("user_id", userId);
      const historySyncStateRequest = client
        .from("adhdice_task_history_sync_state")
        .select("sync_epoch,protocol_version")
        .eq("user_id", userId)
        .maybeSingle();
      const canonicalTaskSnapshotRequest = loadCanonicalTaskSnapshot(
        () => createTaskRowsRequest(),
        (taskIds) => loadTaskScheduleBoundaries(taskIds),
      );
      const criticalCoreRequest = Promise.all([
        canonicalTaskSnapshotRequest,
        profileRequest,
        currentTaskProjectionRequest,
        historySyncStateRequest,
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
        loadTaskListFolders(client, userId)
          .then((data) => ({ data, error: null }))
          .catch((error: { message?: string }) => ({ data: null, error })),
        client
          .from("adhdice_task_content_folders")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
      ]);
      const [
        { taskResult, boundaryResult: taskScheduleBoundariesResult },
        profileResult,
        currentTaskProjectionResult,
        historySyncStateResult,
      ] = await criticalCoreRequest;

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

      const projectionRows = currentTaskProjectionResult.error
        ? []
        : (currentTaskProjectionResult.data ?? []) as unknown as CurrentTaskProjectionReadRow[];
      const historySyncEpoch = historySyncStateResult.error
        || historySyncStateResult.data?.protocol_version !== TASK_HISTORY_SYNC_PROTOCOL_VERSION
        ? null
        : historySyncStateResult.data.sync_epoch;
      const logicalDaySettingsRevision = profileResult.data && Number.isInteger(profileResult.data.settings_revision)
        ? profileResult.data.settings_revision
        : null;
      const nextCurrentTaskProjectionReadContext = { historySyncEpoch, logicalDaySettingsRevision };
      if (currentTaskProjectionResult.error && isWorkspacePerformanceDiagnosticsEnabled()) {
        console.info(`[workspace:current-projection] read failed: ${currentTaskProjectionResult.error.message}`);
      }
      if ((historySyncStateResult.error || !historySyncEpoch) && isWorkspacePerformanceDiagnosticsEnabled()) {
        console.info(`[workspace:current-projection] History sync fence unavailable: ${historySyncStateResult.error?.message ?? "unsupported or missing sync state"}`);
      }

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
      startTransition(() => {
        setTasks((current) => keepCurrentIfStructurallyEqual(current, nextTasks));
        setCurrentTaskProjectionsByTaskId((current) => mergeCurrentTaskProjectionRows(
          indexCurrentTaskProjectionRows(projectionRows),
          Object.values(current),
        ));
        currentTaskProjectionReadContextRef.current = nextCurrentTaskProjectionReadContext;
        setCurrentTaskProjectionReadContext(nextCurrentTaskProjectionReadContext);
        setIsCurrentTaskProjectionReadReady(true);
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
      const secondaryCoreStartedAt = isWorkspacePerformanceDiagnosticsEnabled() && typeof performance !== "undefined" ? performance.now() : 0;
      const [categoryResult, historyResult, focusDayResult, taskListsResult, manualMembershipResult, folderStructureResult, taskContentFolderResult] = await secondaryCoreRequest;

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
        folderStructureResult.error,
        taskContentFolderResult.error,
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
      const nextTaskListFolders = folderStructureResult.data?.folders ?? [];
      const nextTaskListContainers = folderStructureResult.data?.containers ?? [];
      const nextTaskListRailItems = folderStructureResult.data?.railItems ?? [];
      const nextTaskContentFolders = (taskContentFolderResult.data ?? [])
        .map((row) => normalizeTaskContentFolderRow(row))
        .filter((row): row is TaskContentFolder => row !== null);

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
        setTaskContentFolders((current) => keepCurrentIfStructurallyEqual(current, nextTaskContentFolders));
        setTaskListContainers((current) => keepCurrentIfStructurallyEqual(current, nextTaskListContainers));
        setTaskListRailItems((current) => keepCurrentIfStructurallyEqual(current, nextTaskListRailItems));
      }
      setTaskListManualMemberships((current) => keepCurrentIfStructurallyEqual(current, nextTaskListManualMemberships));
      setTaskListMembershipDataReadyUserId(userId);
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
        currentProjectionsLoaded: projectionRows.length,
        fullHistoryLoaded: hasLoadedFullTaskHistoryRef.current,
        fullHistoryFacts: hasLoadedFullTaskHistoryRef.current ? fullTaskHistoryRowsRef.current.length : 0,
        scopedHistoryTasks: Object.values(taskHistoryLoadStateByTaskIdRef.current).filter((state) => state.status === "ready").length,
        broadManualActionCommandOperationReads,
        focusHistory: shouldLoadFocusHistory ? nextFocusHistory.length : 0,
        tasks: nextTasks.length,
      });
      if (
        !hasLoadedFullTaskHistoryRef.current
        && (activePageRef.current === "Stats" || activePageRef.current === "Games" || activePageRef.current === "Achievements")
      ) {
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
        await ensureProjectionChannelSubscribed();
        await requestCoreWorkspaceRefresh({ silent: true, source });

        if (includeSecondaryIfLoaded) {
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

      if (hasLoadedFullTaskHistoryRef.current) {
        if (isWorkspacePerformanceDiagnosticsEnabled()) {
          console.info("[workspace] Rollover history reconciliation refreshing the explicitly loaded canonical snapshot.");
        }
        const didRefreshHistory = await loadTaskHistory({ silent: true, source: "rollover", refreshAfterCurrent: true });
        if (didRefreshHistory) {
          await loadTaskHistoryStreakSummaries(tasksRef.current, { supersede: true });
        }
      }
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
        void ensureProjectionChannelSubscribed();
        resumeRefreshCoordinator.documentVisible();
      }
    }

    function handlePageShow(event: PageTransitionEvent) {
      void ensureProjectionChannelSubscribed();
      resumeRefreshCoordinator.pageShow(event.persisted);
    }

    function handleWindowFocus() {
      void ensureProjectionChannelSubscribed();
      resumeRefreshCoordinator.focus();
    }

    function handleWindowOnline() {
      void ensureProjectionChannelSubscribed();
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

    const workspaceChannelDebugId = createAdhdiceRealtimeChannelDebugId("workspace");

    function projectionChannelDebugId() {
      return projectionChannelRef.current
        ? projectionChannelDebugIdsRef.current.get(projectionChannelRef.current)
        : undefined;
    }

    function isFreshProjectionForTask(row: CurrentTaskProjectionReadRow | null, taskId: string) {
      const task = tasksRef.current.find((candidate) => candidate.id === taskId);
      const context = currentTaskProjectionReadContextRef.current;
      return Boolean(
        row
        && task
        && typeof task.canonical_revision === "number"
        && typeof context.logicalDaySettingsRevision === "number"
        && context.historySyncEpoch
        && typeof todayKeyRef.current === "string"
        && isCurrentTaskProjectionFresh(row, {
          userId,
          entityId: task.id,
          entityKind: task.entity_kind as CurrentTaskProjectionReadRow["entity_kind"],
          canonicalTaskRevision: task.canonical_revision,
          historySyncEpoch: context.historySyncEpoch,
          logicalDaySettingsRevision: context.logicalDaySettingsRevision,
          projectedLogicalDate: todayKeyRef.current,
        }),
      );
    }

    function mergeProjectionRows(
      rows: readonly CurrentTaskProjectionReadRow[],
      source: "event" | "reconcile",
      channelDebugId = projectionChannelDebugId(),
    ) {
      if (source === "event") {
        recordAdhdiceRealtimeDiagnostic({
          channel: "projection",
          channelDebugId,
          count: rows.length,
          entityIds: rows.map((row) => row.entity_id),
          kind: "projection_event_buffer_flush",
        });
      }
      if (!isActive) return;
      setCurrentTaskProjectionsByTaskId((current) => {
        const next = mergeCurrentTaskProjectionRows(current, rows);
        for (const row of rows) {
          const previous = current[row.entity_id];
          recordAdhdiceRealtimeDiagnostic({
            accepted: next[row.entity_id] === row,
            channel: "projection",
            channelDebugId,
            entityId: row.entity_id,
            incomingCanonicalTaskRevision: row.canonical_task_revision,
            incomingUpdatedAt: row.updated_at,
            kind: "projection_merge_decision",
            previousCanonicalTaskRevision: previous?.canonical_task_revision ?? null,
            previousUpdatedAt: previous?.updated_at ?? null,
            source,
          });
          markAdhdiceRealtimeAuthorityPending(row.entity_id);
          if (source === "event" && isFreshProjectionForTask(row, row.entity_id)) {
            projectionReconciler.cancel(row.entity_id);
          }
        }
        return next;
      });
    }

    async function loadCurrentTaskProjectionForTask(entityId: string) {
      const result = await client
        .from("adhdice_task_current_projections")
        .select(CURRENT_TASK_PROJECTION_READ_COLUMNS)
        .eq("user_id", userId)
        .eq("entity_id", entityId)
        .maybeSingle();
      if (result.error) return null;
      return (result.data ?? null) as unknown as CurrentTaskProjectionReadRow | null;
    }

    const projectionReconciler = createBoundedTaskProjectionReconciler<CurrentTaskProjectionReadRow>({
      isCurrentGeneration: (generation) => isActive && workspaceGenerationRef.current === generation,
      isFresh: (projection, entityId) => isFreshProjectionForTask(projection, entityId),
      load: loadCurrentTaskProjectionForTask,
      onCancelled: (entityId, generation) => {
        recordAdhdiceRealtimeDiagnostic({
          channel: "projection",
          channelDebugId: projectionChannelDebugId(),
          entityId,
          generation,
          kind: "projection_reconcile_cancelled",
        });
      },
      onCompleted: (entityId, generation) => {
        recordAdhdiceRealtimeDiagnostic({
          channel: "projection",
          channelDebugId: projectionChannelDebugId(),
          entityId,
          generation,
          kind: "projection_reconcile_completed",
        });
      },
      onReconcileStarted: (entityId, generation) => {
        recordAdhdiceRealtimeDiagnostic({
          channel: "projection",
          channelDebugId: projectionChannelDebugId(),
          entityId,
          generation,
          kind: "projection_reconcile_started",
        });
      },
      onResult: ({ attempt, entityId, fresh, projection }, generation) => {
        if (projection) mergeProjectionRows([projection], "reconcile");
        recordAdhdiceRealtimeDiagnostic({
          attempt,
          channel: "projection",
          channelDebugId: projectionChannelDebugId(),
          entityId,
          freshness: fresh,
          generation,
          kind: "projection_reconcile_result",
          returnedCanonicalRevision: projection?.canonical_task_revision ?? null,
          validity: projection?.validity ?? null,
        });
      },
      onRetryScheduled: (entityId, generation, delayMs) => {
        recordAdhdiceRealtimeDiagnostic({
          channel: "projection",
          channelDebugId: projectionChannelDebugId(),
          delayMs,
          entityId,
          generation,
          kind: "projection_reconcile_retry_scheduled",
        });
      },
      retryDelayMs: 4500,
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancel: (handle) => window.clearTimeout(handle as number),
    });

    function requestTaskProjectionReconciliation(entityId: string) {
      if (!isActive || !tasksRef.current.some((task) => task.id === entityId)) return Promise.resolve();
      recordAdhdiceRealtimeDiagnostic({
        channel: "projection",
        channelDebugId: projectionChannelDebugId(),
        entityId,
        generation: workspaceGeneration,
        kind: "projection_reconcile_requested",
      });
      return projectionReconciler.request(entityId, workspaceGeneration);
    }

    const projectionEventBuffer = createCurrentTaskProjectionEventBuffer(
      (rows) => mergeProjectionRows(rows, "event"),
      {
        cancel: (handle) => window.clearTimeout(handle as number),
        schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      },
    );

    function enqueueProjectionRealtimePayload(value: unknown, channelDebugId?: string) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const row = value as Partial<CurrentTaskProjectionReadRow>;
      if (row.user_id !== userId || typeof row.entity_id !== "string" || typeof row.updated_at !== "string") return;
      recordAdhdiceRealtimeDiagnostic({
        channel: "projection",
        channelDebugId,
        entityId: row.entity_id,
        kind: "projection_event_buffer_enqueue",
        incomingCanonicalTaskRevision: row.canonical_task_revision ?? null,
        incomingUpdatedAt: row.updated_at,
      });
      projectionEventBuffer.enqueue(row as CurrentTaskProjectionReadRow);
    }

    function shouldReconnectProjectionChannel() {
      return (
        projectionChannelRef.current === null
        || projectionChannelStatusRef.current === "CLOSED"
        || projectionChannelStatusRef.current === "TIMED_OUT"
        || projectionChannelStatusRef.current === "CHANNEL_ERROR"
      );
    }

    async function removeProjectionChannel(channel: RealtimeChannel) {
      const channelDebugId = projectionChannelDebugIdsRef.current.get(channel);
      recordAdhdiceRealtimeDiagnostic({
        channel: "projection",
        channelDebugId,
        kind: "channel_cleanup_requested",
      });
      try {
        await client.removeChannel(channel);
        projectionChannelDebugIdsRef.current.delete(channel);
        recordAdhdiceRealtimeDiagnostic({
          channel: "projection",
          channelDebugId,
          kind: "channel_cleanup_completed",
        });
        projectionChannelCleanupCountRef.current += 1;
        if (isWorkspacePerformanceDiagnosticsEnabled()) {
          console.info(`[workspace] Projection realtime cleanup count=${projectionChannelCleanupCountRef.current} userId=${userId}.`);
        }
      } catch {
        recordAdhdiceRealtimeDiagnostic({
          channel: "projection",
          channelDebugId,
          kind: "channel_cleanup_ignored_error",
        });
      }
    }

    async function subscribeProjectionChannel() {
      const previousRemoval = projectionChannelRemovalPromiseRef.current ?? Promise.resolve();
      await previousRemoval;
      if (!isActive || workspaceGenerationRef.current !== workspaceGeneration || !shouldReconnectProjectionChannel()) return;

      projectionChannelStatusRef.current = "SUBSCRIBING";
      const subscribeStartedAt = isWorkspacePerformanceDiagnosticsEnabled() && typeof performance !== "undefined" ? performance.now() : 0;
      const channelDebugId = createAdhdiceRealtimeChannelDebugId("projection");
      const nextProjectionChannel = client.channel(`adhdice_task_current_projections:${userId}`);
      projectionChannel = nextProjectionChannel;
      projectionChannelRef.current = nextProjectionChannel;
      projectionChannelDebugIdsRef.current.set(nextProjectionChannel, channelDebugId);
      recordAdhdiceRealtimeDiagnostic({
        channel: "projection",
        channelDebugId,
        generation: workspaceGeneration,
        kind: "channel_created",
      });
      const isCurrentProjectionChannel = () => (
        isActive
        && workspaceGenerationRef.current === workspaceGeneration
        && projectionChannelRef.current === nextProjectionChannel
      );
      nextProjectionChannel
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "adhdice_task_current_projections",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (!isCurrentProjectionChannel()) return;
            const row = payload.new as Partial<CurrentTaskProjectionReadRow>;
            recordAdhdiceRealtimeDiagnostic({
              channel: "projection",
              channelDebugId,
              canonicalTaskRevision: row.canonical_task_revision ?? null,
              currentPositiveStreak: row.current_positive_streak ?? null,
              entityId: row.entity_id ?? null,
              eventType: payload.eventType,
              kind: "projection_postgres_event_received",
              updatedAt: row.updated_at ?? null,
              validity: row.validity ?? null,
            });
            enqueueProjectionRealtimePayload(payload.new, channelDebugId);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "adhdice_task_current_projections",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (!isCurrentProjectionChannel()) return;
            const row = payload.new as Partial<CurrentTaskProjectionReadRow>;
            recordAdhdiceRealtimeDiagnostic({
              channel: "projection",
              channelDebugId,
              canonicalTaskRevision: row.canonical_task_revision ?? null,
              currentPositiveStreak: row.current_positive_streak ?? null,
              entityId: row.entity_id ?? null,
              eventType: payload.eventType,
              kind: "projection_postgres_event_received",
              updatedAt: row.updated_at ?? null,
              validity: row.validity ?? null,
            });
            enqueueProjectionRealtimePayload(payload.new, channelDebugId);
          },
        )
        .subscribe((status) => {
          if (!isCurrentProjectionChannel()) return;
          recordAdhdiceRealtimeDiagnostic({
            channel: "projection",
            channelDebugId,
            generation: workspaceGeneration,
            kind: "channel_subscribe_status",
            status,
          });
          projectionChannelStatusRef.current = status;
          if (status === "SUBSCRIBED") {
            projectionChannelSubscriptionCountRef.current += 1;
            logWorkspaceTiming("Projection realtime subscribed", subscribeStartedAt, { userId });
            if (isWorkspacePerformanceDiagnosticsEnabled()) {
              console.info(`[workspace] Projection realtime subscribe count=${projectionChannelSubscriptionCountRef.current} userId=${userId}.`);
            }
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[workspace] Projection realtime subscription failed; bounded Task reconciliation remains available.");
          }
        });
    }

    async function ensureProjectionChannelSubscribed() {
      if (!shouldReconnectProjectionChannel()) return;
      const existingSubscription = projectionChannelSubscriptionPromiseRef.current;
      if (existingSubscription) {
        await existingSubscription;
        if (projectionChannelSubscriptionPromiseRef.current === existingSubscription) {
          projectionChannelSubscriptionPromiseRef.current = null;
        }
        if (isActive && shouldReconnectProjectionChannel()) await ensureProjectionChannelSubscribed();
        return;
      }

      const previousChannel = projectionChannelRef.current;
      projectionChannelRef.current = null;
      projectionChannelStatusRef.current = "CLOSED";
      if (previousChannel) {
        projectionChannelRemovalPromiseRef.current = removeProjectionChannel(previousChannel);
        if (projectionChannel === previousChannel) projectionChannel = null;
      }

      const subscription = subscribeProjectionChannel();
      projectionChannelSubscriptionPromiseRef.current = subscription;
      try {
        await subscription;
      } finally {
        if (projectionChannelSubscriptionPromiseRef.current === subscription) {
          projectionChannelSubscriptionPromiseRef.current = null;
        }
      }
    }

    const workspaceChannel = client.channel(`adhdice_workspace:${userId}`);
    recordAdhdiceRealtimeDiagnostic({
      channel: "workspace",
      channelDebugId: workspaceChannelDebugId,
      kind: "channel_created",
    });
    workspaceChannel
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
          table: "adhdice_task_content_folders",
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
          if (taskId) {
            void loadTaskHistoryForTask(taskId, { force: true, silent: true }).then((result) => (
              result.status === "ready"
                ? reloadTaskHistoryStreakSummaryForTask(taskId, result.history ?? undefined)
                : false
            ));
          }
          if (hasLoadedFullTaskHistoryRef.current) {
            scheduleTaskHistoryRevisionReconciliation();
            return;
          }
          // A task-scoped refresh above is sufficient when no historical
          // consumer has requested the full snapshot. Do not turn a History
          // notification into a workspace-wide bootstrap.
        },
      )
      .subscribe((status) => {
        recordAdhdiceRealtimeDiagnostic({
          channel: "workspace",
          channelDebugId: workspaceChannelDebugId,
          kind: "channel_subscribe_status",
          status,
        });
        if (status === "SUBSCRIBED") {
          workspaceChannelSubscriptionCountRef.current += 1;
          if (isWorkspacePerformanceDiagnosticsEnabled()) {
            console.info(`[workspace] Workspace realtime subscribe count=${workspaceChannelSubscriptionCountRef.current} userId=${userId}.`);
          }
        }
      });

    void subscribeTaskChannel();
    void ensureProjectionChannelSubscribed();

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
      loadTaskHistoryStreakSummariesRef.current = null;
      taskChannelRef.current = null;
      taskChannelStatusRef.current = "CLOSED";
      taskChannelRemovalPromiseRef.current = null;
      if (taskChannel) {
        taskChannelRemovalPromiseRef.current = removeTaskChannel(taskChannel);
      }
      projectionReconciler.dispose();
      projectionChannelRef.current = null;
      projectionChannelStatusRef.current = "CLOSED";
      if (projectionChannel) {
        projectionChannelRemovalPromiseRef.current = removeProjectionChannel(projectionChannel);
        projectionChannel = null;
      }
      projectionEventBuffer.dispose();
      recordAdhdiceRealtimeDiagnostic({
        channel: "workspace",
        channelDebugId: workspaceChannelDebugId,
        kind: "channel_cleanup_requested",
      });
      if (isWorkspacePerformanceDiagnosticsEnabled()) {
        workspaceChannelCleanupCountRef.current += 1;
        console.info(`[workspace] Workspace realtime cleanup count=${workspaceChannelCleanupCountRef.current} userId=${userId}.`);
      }
      void client.removeChannel(workspaceChannel).then(() => {
        recordAdhdiceRealtimeDiagnostic({
          channel: "workspace",
          channelDebugId: workspaceChannelDebugId,
          kind: "channel_cleanup_completed",
        });
      });
    };
  }, [currentUser?.id, behaviorSelectionStateRef, supabase, suppressCategoryReload]);

  useEffect(() => {
    if (!currentUser) {
      setTaskHistory([]);
      setTaskListContainers([]);
      setTaskListFolders([]);
      setTaskContentFolders([]);
      setTaskListRailItems([]);
      setAvailableTaskNotes([]);
    }
  }, [
    currentUser,
    setAvailableTaskNotes,
    setTaskHistory,
    setTaskListContainers,
    setTaskListFolders,
    setTaskContentFolders,
    setTaskListRailItems,
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
    async (taskIds: string[], options?: TaskHistoryLoadOptions) => await loadTaskHistoryForTasksRef.current?.(taskIds, options) ?? {},
    [],
  );
  const refreshTaskHistoryStreakSummaries = useCallback(
    async (nextTasks?: Task[], options?: TaskHistoryStreakSummaryRefreshOptions) => await loadTaskHistoryStreakSummariesRef.current?.(nextTasks, options) ?? false,
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
    async (taskId: string, nextTaskHistory?: DbTaskHistory[], nextTask?: Task, onSummary?: TaskHistoryStreakSummaryObserver) => (
      await refreshTaskHistoryStreakSummaryRef.current?.(taskId, nextTaskHistory, nextTask, onSummary) ?? false
    ),
    [],
  );
  const loadTaskNotes = useCallback(
    async () => await loadNotesRef.current?.() ?? false,
    [],
  );

  return {
    isSoftWorkspaceRefreshing,
    isFullTaskHistoryLoaded: Boolean(currentUser && fullTaskHistoryLoadedUserId === currentUser.id),
    isTaskListMembershipDataReady: !currentUser || taskListMembershipDataReadyUserId === currentUser.id,
    isTaskResumeSyncPending,
    isWorkspaceLoading,
    workspaceGenerationRef,
    prepareTaskMutation,
    reconcileRolloverWorkspace,
    softRefreshWorkspace,
    loadTaskHistoryForTask,
    loadTaskHistoryForTasks,
    refreshTaskHistoryStreakSummaries,
    fetchTaskHistoryForRollover,
    retryTaskHistoryForTask,
    loadTaskNotes,
    refreshTaskHistoryStreakSummary,
    taskHistoryByTaskId,
    taskHistoryLoadStateByTaskId,
    taskHistoryStreakSummaries,
    currentTaskProjectionReadContext,
    currentTaskProjectionsByTaskId,
    isCurrentTaskProjectionReadReady,
    updateTaskHistoryForTask,
  };
}
