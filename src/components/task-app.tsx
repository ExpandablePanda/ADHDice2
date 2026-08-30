"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { Capacitor } from "@capacitor/core";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import {
  AlertCircle,
  ArrowRight,
  ArrowUp,
  BarChart2,
  Bell,
  BookOpen,
  Box,
  Brain,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  ChartPie,
  ChevronUp,
  Clock,
  CirclePause,
  CirclePlay,
  CircleX,
  Code2,
  Coffee,
  Dice5,
  Dices,
  FlaskConical,
  DollarSign,
  Dumbbell,
  Ellipsis,
  FileText,
  Footprints,
  Gamepad2,
  GripVertical,
  Headphones,
  Heart,
  House,
  Keyboard,
  Layers,
  Lock,
  LucideIcon,
  MonitorSmartphone,
  MoonStar,
  Music,
  Palette,
  PenLine,
  Plane,
  Plus,
  Rocket,
  Search,
  Server,
  Shield,
  Sparkles,
  SquareCheckBig,
  Star,
  Sun,
  Target,
  Trash2,
  Trophy,
  UserRound,
  Utensils,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import dynamicIconImports from "lucide-react/dynamicIconImports";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import {
  BottomDockAdapter as BottomDock,
  FilterRowsAdapter as FilterRows,
  ImportWidgetCardAdapter as ImportWidgetCard,
  TaskCardGalleryAdapter as TaskCardGallery,
  TaskGridViewAdapter as TaskGridView,
  TaskMatrixViewAdapter as TaskMatrixView,
} from "./task-app/task-view-adapters";
import { DailyPlanningPanel } from "./task-app/daily-planning-panel";
import { TaskEditFlows } from "./task-app/task-edit-flows";
import { TaskListSettingsModal } from "./task-app/task-list-settings-modal";
import { TaskListRuleRowEditor } from "./task-app/task-list-rule-row-editor";
import { PathsWorkspace } from "./task-app/paths-workspace";
import { TaskReportWorkspace } from "./task-app/task-report-workspace";
import { OnTimePlannerWorkspace } from "./task-app/on-time-planner-workspace";
import { BrainstormWorkspace } from "./task-app/brainstorm-workspace";
import { TaskRewardModal } from "./task-app/task-reward-modal";
import { DetachAndPromoteMilestoneModal, MilestoneCorrectionModal, MilestoneSetupModal } from "./task-app/milestone-setup-modal";
import { MilestoneInspectorSection } from "./task-app/milestone-detail-section";
import { MilestoneLifecycleModal, type MilestoneLifecycleAction } from "./task-app/milestone-lifecycle-modal";
import { CompletedMilestonesWorkspace } from "./task-app/completed-milestones-workspace";
import { DuplicateTaskGroupsAdapter, TasksListAdapter, TasksTableAdapter } from "./task-app/tasks-list-adapter";
import { TasksNonListShell } from "./task-app/tasks-non-list-shell";
import { HudCommandCenter, HudRuntimeClock } from "./task-app/hud-command-center";
import { FocusAlarmWidget } from "./task-app/focus-alarm-widget";
import { TaskActiveTimersTray } from "./task-app/task-active-timers-tray";
import { ScratchPaperWidget, type ScratchPaperData } from "./task-app/scratch-paper";
import { formatTaskStatusLabel } from "./task-app/task-status-ui";
import {
  applyTaskEditorDraftOverrides,
  buildNewTaskDraft,
  createTaskEditorDraft,
  emptyToNull,
  parseDayOfMonth,
  parsePositiveInteger,
  type TaskDraft,
  type TaskEditorDraft,
  type TaskEditorMode,
  type TaskSubtaskDraft,
} from "./task-app/task-editor-model";
import { CalmModeButton, DarkModeToggleButton } from "./task-app/theme-toggle";
import type { AgentPlanColumnId } from "@/components/ui/agent-plan";
import { TaskManagementTableV2, type RunningTaskTimer, type TaskEditorFocusRequest, type TaskEditorInitialField } from "@/components/ui/task-management-table-v2";
import { ModalShell } from "./modal-shell";
import { ErrorBoundary } from "./error-boundary";
import { WorkspaceLoadingScreen } from "./workspace-loading-screen";
import {
  ScrollUpButton,
  TASK_TABLE_ACTIVE_LIST_CHIP_CLASS,
  TASK_TABLE_CHIP_BASE_CLASS,
  TASK_TABLE_INPUT_CLASS,
  TASK_TABLE_INACTIVE_CHIP_CLASS,
  TaskTableChipButton,
} from "@/components/ui/task-table-primitives";
import { buildChildTaskCreationDraft } from "@/lib/task-child-creation";
import { useEconomy } from "@/hooks/useEconomy";
import { useAchievementNotifications, useAchievementProgress } from "@/hooks/useAchievementProgress";
import { useFocus, mapFocusCategoryRow, mapFocusSessionRow, mergeStoredFocusHistory, mergeStoredFocusCategories, saveFocusCategories, saveFocusHistory } from "@/hooks/useFocus";
import { useHealth } from "@/hooks/useHealth";
import { useFitnessGoals } from "@/hooks/useFitnessGoals";
import { useFitnessPlans } from "@/hooks/useFitnessPlans";
import { useFitnessSessionDetails } from "@/hooks/useFitnessSessionDetails";
import { useScratchNotes } from "@/hooks/useScratchNotes";
import { useTaskActions } from "@/hooks/useTaskActions";
import type { TaskCanonicalMutationState } from "@/hooks/useTaskUpdateAction";
import { useTaskRewardController } from "@/hooks/useTaskRewardController";
import { useTaskUiState } from "@/hooks/useTaskUiState";
import { useWorkspaceData } from "@/hooks/useWorkspaceData";
import { useTaskListFolderActions } from "@/hooks/useTaskListFolderActions";
import { useResponsiveTaskGridColumns } from "@/hooks/useResponsiveTaskGridColumns";
import { useTaskListSelection } from "@/hooks/useTaskListSelection";
import { useTaskListViewStateController } from "@/hooks/useTaskListViewStateController";
import { useTaskPlannerActions } from "@/hooks/useTaskPlannerActions";
import { useTaskGridLayoutController } from "@/hooks/useTaskGridLayoutController";
import { useFocusSelectionPersistence } from "@/hooks/useFocusSelectionPersistence";
import { useTaskPriorityRoutingController } from "@/hooks/useTaskPriorityRoutingController";
import { useTaskEditorImportController } from "@/hooks/useTaskEditorImportController";
import { useTaskTimers } from "@/hooks/useTaskTimers";
import { useOnTimePlan } from "@/hooks/useOnTimePlan";
import { useMilestoneData } from "@/hooks/useMilestoneData";
import { getHomeMilestoneNavigationState } from "@/lib/milestones";
import { buildAchievementSummaryPresentation } from "@/lib/achievement-progress";
import { createBrowserUuidV4 } from "@/lib/browser-uuid";
import {
  formatBatchEditProgressDetail,
  formatBatchEditProgressText,
  type BatchEditProgress,
} from "@/lib/task-batch-edit-progress";
import { clearMatchingOnTimeExecution, reconcileOnTimeManualDurationsFromTasks, recordMatchingOnTimeStoppedProgress, type OnTimeLinkedItemOrigin } from "@/lib/on-time-plan-state";
import { buildTaskOccurrenceIdentity, occurrenceIdentityMatches } from "@/lib/on-time-planner";
import { useBrainstormState } from "@/hooks/useBrainstormState";
import {
  getDisplayFocusCategories,
  isSystemCountdownCategoryId,
  sanitizeFocusLabel,
  sanitizeOptionalFocusLabel,
} from "@/lib/focus-utils";
import { isSleepCategory } from "@/lib/focus-goals";
import { createBrowserSupabaseClient, subscribeToBrowserAuth } from "@/lib/supabase";
import { persistHealthTabPreference, readHealthTabPreference, subscribeToHealthTabPreference } from "@/lib/health-tab-preference";
import { taskRolloverCoordinator } from "@/lib/task-rollover-coordinator";
import { getLevelProgress } from "@/lib/economy-levels";
import { buildHealthReminderTemplate, HEALTH_TABS, type HealthReminderTemplateKey, type HealthSleepKind } from "@/lib/health-utils";
import { isTaskOpen, shouldRouteTaskToInbox, type TaskBucket, type TaskRoutingBucket } from "@/lib/task-buckets";
import type { TaskEditorLinkedNote } from "@/lib/task-notes";
import { sortTasksForUi } from "@/lib/task-sorting";
import { hasActiveTaskFilters, resetTaskFiltersPreservingView } from "@/lib/task-filter-state";
import {
  createNavigatorSearchTargets,
  type NavigatorSearchAction,
  type NavigatorSearchTarget,
  type NavigatorSettingsSection,
} from "@/lib/navigator-search";
import { appendTaskListRuleRow, removeTaskListRuleRow, summarizeTaskListRules, updateTaskListRuleRow, updateTaskListRuleRowConnector } from "@/lib/task-list-rule-editor";
import {
  normalizeTaskGridLayout,
  shiftDateKey,
  type TaskGridLayoutItem,
} from "@/lib/task-grid-layout";
import { buildWidgetTypeGuard, resolveTaskGridLayout } from "@/lib/task-grid-parser";
import {
  isDueToday,
  isLater,
  isOverdue,
  sortTasksForCockpit,
} from "@/lib/task-cockpit";
import {
  createEngineRolloverPlan,
  engineRolloverPlanTaskMutationCandidates,
  evaluateTaskActionAuthority,
  taskStateHistoryRowToCanonicalIntent,
  projectTasksForActiveStatusRead,
  resolveActiveTaskStatuses,
} from "@/lib/task-state-engine";
import {
  getMomentumMetric,
  getNextMomentumView,
  type MomentumView,
} from "@/lib/task-momentum";
import {
  type ActiveFocusSession,
  type FocusCategory,
  type FocusLabelOptions,
  type FocusSubtype,
  type FocusType,
  type HistoricalFocusSession,
} from "@/lib/types";
import { formatLocalDate, todayISO, withBasePath } from "@/lib/utils";
import { formatDateKeyInTimeZone, getBrowserTimeZone, getLogicalDayKey, saveLogicalDaySettings } from "@/lib/logical-day";
import { runStorageMigrations } from "@/lib/storage-migrations";
import { buildProfileSnapshot, DEFAULT_PROFILE, markProfileMediaCachedForSession, saveProfile, setActiveProfileUserId, type UserProfile, useProfileStore } from "@/lib/profile-store";
import {
  isMissingTaskActualSecondsColumnError,
  isMissingTaskEnergyNoneEnumError,
  isMissingTaskListManualMembershipsTableError,
  isMissingTaskListsTableError,
} from "@/lib/task-db-compat";
import {
  buildTaskUpdateConflictMessage,
  deleteTaskRow,
  insertTaskRowWithCanonicalCreation,
  markTaskRowsPermanentlyDeleted,
  updateTaskRowWithLegacyEnergyFallback,
  type TaskRowUpdateOptions,
} from "@/lib/task-db-mutations";
import { mergeTaskWithCanonicalScheduleProjection } from "@/lib/task-state-canonical/schedule-projection";
import { isValidDateKey, mapTaskFocusDayRows, normalizeTaskFocusIds } from "@/lib/task-focus-days";
import { getDefaultFocusCategories } from "@/lib/task-focus-labels";
import { formatActualSecondsLabel } from "@/lib/task-formatting";
import { buildTaskHierarchyAdapter } from "@/lib/task-hierarchy";
import { buildTaskPriorityUpdate, getTaskPriorityLevel, type TaskPriorityLevelOption } from "@/lib/task-priority";
import { classifyTaskStateRuntimeAction, createTaskStateReplayIdentity, isTaskStateRuntimeLifecycleTransition, TASK_STATE_OWNED_UPDATE_FIELDS, type TaskStateRuntimeCanonicalIntent } from "@/lib/task-state-runtime-actions";
import type { TaskStateRuntimeLocalTask } from "@/lib/task-state-runtime-executor";
import type { TaskCalendarOverride } from "@/lib/task-state-engine/types";
import type { CanonicalTaskCalendarOverride } from "@/lib/task-state-canonical/types";
import { loadCanonicalTaskScheduleBoundary, type CanonicalReadClient } from "@/lib/task-state-canonical/read-model";
import { buildTaskSiblingReorderPlan, type TaskSiblingReorderInstruction } from "@/lib/task-sibling-reorder";
import type { HudWidgetType } from "@/lib/task-hud-layout";
import { calcNextDueDateFromDate } from "@/lib/task-repeat";
import {
  buildStableCanonicalTaskIndex,
  buildTaskAppStructuralData,
  buildTaskAppWorkspaceFacts,
  computeTaskAppDerivedData,
  type ChildTaskPreviewLookup,
} from "@/lib/task-app-derived";
import { buildStableTaskSearchScope, queryTaskSearch, shouldRunTaskSearch } from "@/lib/task-search-selector";
import { createPendingTaskMutationTracker } from "@/lib/task-pending-mutations";
import { createStableTaskRowModelCache } from "@/lib/task-table-row";
import {
  createTaskRolloverReplayIdentity,
  createTaskRolloverSettingsKey,
  persistProcessedTaskRolloverKey,
  shouldAttemptTaskRollover,
} from "@/lib/task-rollover-gate";
import {
  createDevelopmentComputationTracker,
  isWorkspacePerformanceDiagnosticsEnabled,
} from "@/lib/workspace-performance-diagnostics";
import {
  combineProjectionRevisions,
  createProjectionDomainRevision,
  createStableTaskProjectionCache,
  createTaskDerivationRevisionKey,
} from "@/lib/stable-task-projection";
import {
  buildCompleteHistoryPayload,
  canTaskDelay,
  canTaskBeMarkedComplete,
  COMPLETE_BLOCKED_MESSAGE,
  getTaskCompleteConfirmationDescription,
} from "@/lib/task-complete";
import { buildMilestoneLifecycleArgs, canDetachAndPromoteTaskToMilestone, canPromoteTaskToMilestone, formatMilestoneRpcError, getMilestoneEligibility, mergeAuthoritativeMilestoneTask, shouldReverseCompletedMilestoneForStatusChange } from "@/lib/milestones";
import { DUPLICATE_TITLE_SEARCH_OPERATORS, parseTaskSearchInput } from "@/lib/task-search";
import { filterManualListTaskCandidates } from "@/lib/manual-list-task-search";
import {
  buildTaskHistoryFacts,
  computeTaskHistoryStats,
  deduplicateTaskHistoryByLogicalDate,
  isTaskCompletedForHistory,
  isTaskHistoryStatus,
  mapTaskHistoryRow,
  type TaskHistoryStats,
} from "@/lib/task-history";
import { groupTaskSubtasksByTaskId } from "@/lib/task-subtasks";
import {
  buildManualMembershipMap,
  getBuiltInTaskLists,
  isBuiltInTaskListId,
  isManualTaskListDestination,
  isTaskListSettingsEligible,
  type BuiltInTaskListId,
  type TaskListDefinition,
  type TaskListEvaluationContext,
  type TaskListId,
  type TaskListManualMembership,
  type TaskListRule,
  type TaskListRuleGroup,
} from "@/lib/task-lists";
import {
  type TaskListRuleField,
  type TaskListRuleRowOperator,
} from "@/lib/task-list-rule-editor";
import { mapTaskListManualMembershipRow, mapTaskListRow } from "@/lib/task-list-mappers";
import {
  buildTaskListFolderBreadcrumbs,
  buildTaskListFolderCounts,
  buildTaskListFolderTree,
  canMoveFolderInto,
  getTaskListContainerKey,
  getTaskListContainerRevision,
  resolveCurrentTaskListFolder,
} from "@/lib/task-list-folders";
import {
  buildCanonicalTaskListRailTree,
  buildCanonicalTaskListRailDirectory,
  buildTaskListRailManifest,
  reconcileTaskListRailPlacements,
} from "@/lib/task-list-rail-placement";
import type { TaskListRailMutationGeneration } from "@/lib/task-list-rail-order";
import { DEFAULT_LIST_SORT_PREFERENCE, getListSortSurfaceId } from "@/lib/task-list-sort";
import {
  DEFAULT_TASK_UI_STATE,
  getUserScopedStorageKey,
  isReportTaskWorkspaceTab,
  parseStoredJson,
  TASK_FOCUS_STORAGE_KEY,
  type AppPage,
  type TaskUiState,
} from "@/lib/task-ui-state";

import type {
  FocusCategory as DbFocusCategory,
  Milestone,
  Note,
  Task,
  TaskEnergy,
  TaskFocusDay as DbTaskFocusDay,
  TaskGridLayout as DbTaskGridLayout,
  TaskInsert,
  TaskRepeatFrequency,
  TaskStatus,
  TaskUpdate,
  TaskHistory as DbTaskHistory,
  TaskListContainer as DbTaskListContainer,
  TaskListFolder as DbTaskListFolder,
  TaskListRailItem as DbTaskListRailItem,
} from "@/lib/database.types";

function PageLoadingFallback() {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-[1.5rem] border border-[#ece8f8] bg-white/70 px-5 py-8 text-sm font-semibold text-[#7d88a1] dark:border-white/10 dark:bg-white/6 dark:text-white/60">
      Loading workspace...
    </div>
  );
}

const TaskHomePage = dynamic(() => import("./task-app/home-page").then((module) => module.HomePage), { loading: PageLoadingFallback });
const AchievementsPage = dynamic(() => import("./task-app/achievements-page").then((module) => module.AchievementsPage), { loading: PageLoadingFallback });
const AchievementCelebrationModal = dynamic(() => import("./task-app/achievement-celebration-modal").then((module) => module.AchievementCelebrationModal));
const TasksWorkspace = dynamic(() => import("./task-app/tasks-page-orchestrator").then((module) => module.TasksWorkspace), { loading: PageLoadingFallback });
const FocusPage = dynamic(() => import("./focus-page").then((module) => module.FocusPage), { loading: PageLoadingFallback });
const TaskHealthPage = dynamic(() => import("./task-app/health-page").then((module) => module.HealthPage), { loading: PageLoadingFallback });
const RollPage = dynamic(() => import("./task-app/roll-page-route").then((module) => module.RollPageRoute), { loading: PageLoadingFallback });
const TaskStatsPage = dynamic(() => import("./task-app/stats-page").then((module) => module.StatsPage), { loading: PageLoadingFallback });
const NotesPage = dynamic(() => import("./task-app/notes-page-route").then((module) => module.NotesPageRoute), { loading: PageLoadingFallback });
const TaskSettingsPage = dynamic(() => import("./task-app/settings-page").then((module) => module.SettingsPage), { loading: PageLoadingFallback });
const GamesPage = dynamic(() => import("./games-page").then((module) => module.GamesPage), { loading: PageLoadingFallback });
const TestD20FaceMapper = dynamic(() => import("./task-app/test-d20-face-mapper").then((module) => module.TestD20FaceMapper), { loading: PageLoadingFallback });
const TestDiceFaceMapper = dynamic(() => import("./task-app/test-dice-face-mapper").then((module) => module.TestDiceFaceMapper), { loading: PageLoadingFallback });
const TestDiceMaterialLab = dynamic(() => import("./task-app/test-dice-material-lab").then((module) => module.TestDiceMaterialLab), { loading: PageLoadingFallback });
const TestTaskTablePrototype = dynamic(() => import("./task-app/test-task-table-prototype").then((module) => module.TestTaskTablePrototype), { loading: PageLoadingFallback });

type Message = {
  tone: "neutral" | "good" | "warn";
  text: string;
};

type PendingCompleteAction = {
  focusToday?: boolean;
  linkedNoteIds?: string[];
  onTimeOrigin?: OnTimeLinkedItemOrigin;
  source: "editor" | "status";
  subtasks?: TaskSubtaskDraft[];
  taskId: string;
  values?: TaskUpdate;
};

type HudNotificationItem = {
  detail: string;
  id: string;
  title: string;
  tone: "accent" | "danger" | "neutral" | "success" | "warning";
};

type AuthMode = "sign-in" | "sign-up";
const AUTH_MODE_STORAGE_KEY = "adhdice-auth-mode";
type ThemeMode = "light" | "dark";
type FocusPlannerStep = 0 | 1 | 2;
type TaskGridWidgetType =
  | "urgent"
  | "focus_today"
  | "due_today"
  | "active_queue"
  | "completed"
  | "quick_capture"
  | "import"
  | "focus_stats";

const MOBILE_ZOOM_LEVELS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2] as const;
const EMPTY_TASK_IDS: string[] = [];
type TaskGridItem = TaskGridLayoutItem<TaskGridWidgetType>;
type TaskKeyboardShortcut = {
  action: string;
  alternateKeys?: string[];
  keys: string[];
};

function getTaskTimerDisplaySeconds(timer: RunningTaskTimer, now: number) {
  const endTime = timer.pausedAt ?? now;
  return timer.baseSeconds + Math.max(0, Math.floor((endTime - timer.startedAt) / 1000));
}

function getFocusSessionDisplaySeconds(activeSession: ActiveFocusSession | undefined, nowMs: number) {
  if (!activeSession) {
    return 0;
  }

  if (activeSession.isRunning && activeSession.startTime) {
    const elapsed = Math.max(0, Math.floor((nowMs - activeSession.startTime) / 1000));
    if (activeSession.mode === "countdown" && activeSession.countdownTargetSeconds) {
      return Math.max(0, activeSession.countdownTargetSeconds - activeSession.accumulatedSeconds - elapsed);
    }
    return Math.max(0, activeSession.accumulatedSeconds + elapsed);
  }

  if (activeSession.mode === "countdown" && activeSession.countdownTargetSeconds) {
    return Math.max(0, activeSession.countdownTargetSeconds - activeSession.accumulatedSeconds);
  }

  return Math.max(0, activeSession.accumulatedSeconds);
}

function doesTaskHighlightTextMatch(value: string | null | undefined, normalizedQuery: string) {
  return (value ?? "").toLowerCase().includes(normalizedQuery);
}

function doesTaskHighlightTagMatch(values: readonly string[] | null | undefined, normalizedQuery: string) {
  return Array.isArray(values) && values.some((value) => doesTaskHighlightTextMatch(value, normalizedQuery));
}

function collectMatchingSourceSubtaskIds(
  subtasks: Task[],
  normalizedQuery: string,
  matches: string[],
) {
  for (const subtask of subtasks) {
    if (doesTaskHighlightTextMatch(subtask.title, normalizedQuery)) {
      matches.push(subtask.id);
    }
  }
}

function buildTaskHighlightMatchState({
  childTaskPreviewByParentTaskId,
  query,
  selectedBucketTasks,
  taskSubtasksByTaskId,
}: {
  childTaskPreviewByParentTaskId: ChildTaskPreviewLookup;
  query: string;
  selectedBucketTasks: Task[];
  taskSubtasksByTaskId: Record<string, Task[]>;
}) {
  if (query.length === 0) {
    return {
      matchedRowIds: [] as string[],
      matchedStepParentTaskIds: [] as string[],
    };
  }

  const matchedRowIds: string[] = [];
  const matchedRowIdSet = new Set<string>();
  const matchedStepParentTaskIdSet = new Set<string>();
  const addMatch = (taskId: string) => {
    if (!matchedRowIdSet.has(taskId)) {
      matchedRowIdSet.add(taskId);
      matchedRowIds.push(taskId);
    }
  };

  for (const task of selectedBucketTasks) {
    if (doesTaskHighlightTextMatch(task.title, query) || doesTaskHighlightTagMatch(task.tags, query)) {
      addMatch(task.id);
    }

    const previewMatches = childTaskPreviewByParentTaskId[task.id]?.items.filter((item) => (
      doesTaskHighlightTextMatch(item.title, query) || doesTaskHighlightTagMatch(item.tags, query)
    )) ?? [];
    if (previewMatches.length > 0) {
      matchedStepParentTaskIdSet.add(task.id);
      for (const item of previewMatches) {
        addMatch(item.id);
      }
    }

    const sourceSubtaskMatches: string[] = [];
    collectMatchingSourceSubtaskIds(taskSubtasksByTaskId[task.id] ?? [], query, sourceSubtaskMatches);
    if (sourceSubtaskMatches.length > 0) {
      matchedStepParentTaskIdSet.add(task.id);
      for (const subtaskId of sourceSubtaskMatches) {
        addMatch(subtaskId);
      }
    }
  }

  return {
    matchedRowIds,
    matchedStepParentTaskIds: Array.from(matchedStepParentTaskIdSet),
  };
}

type StatusChangeScrollAnchorState = {
  candidateTaskIds: string[];
  previousVisibleTaskIds: string[];
  sourceTaskId: string;
  token: number;
};

function resolveCollapsedHudFocusTimer(
  categories: FocusCategory[],
  activeSessions: Record<string, ActiveFocusSession>,
  nowMs: number,
) {
  const displayCategories = getDisplayFocusCategories(categories, activeSessions);
  for (const category of displayCategories) {
    const activeSession = activeSessions[category.id];
    if (activeSession?.isRunning) {
      return {
        categoryId: category.id,
        isPaused: false,
        seconds: getFocusSessionDisplaySeconds(activeSession, nowMs),
        title: category.title,
      };
    }
  }

  for (const category of displayCategories) {
    const activeSession = activeSessions[category.id];
    if (activeSession && getFocusSessionDisplaySeconds(activeSession, nowMs) > 0) {
      return {
        categoryId: category.id,
        isPaused: true,
        seconds: getFocusSessionDisplaySeconds(activeSession, nowMs),
        title: category.title,
      };
    }
  }

  return null;
}

function formatCollapsedHudTimerLabel(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatHudDateTime(nowMs: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(nowMs));
}

const FOCUS_ALARM_STORAGE_KEY_PREFIX = "adhdice:focus-alarm";
const FOCUS_ALARM_BLOCKED_MESSAGE = "Focus alarm sound was blocked. Tap the alarm widget again to re-arm audio.";
const APP_VERSION = "7.12.15";
const HUD_VERSION = APP_VERSION;
const APP_VERSION_ENDPOINT = "/app-version.json";
const OPEN_TASK_QUERY_PARAM = "openTask";
const TASK_DERIVATION_SCOPE = "Tasks";
const APP_UPDATE_ATTEMPT_STORAGE_KEY = "adhdice:app-update-attempt";
const APP_UPDATE_ATTEMPT_TTL_MS = 45_000;

type AppUpdateAttempt = {
  attemptedAt: number;
  version: string;
};

type RefreshStatus = "idle" | "syncing" | "updating";

function formatPendingDiceChipLabel(diceCount: number) {
  return `${diceCount} ${diceCount === 1 ? "Die" : "Dice"} Ready`;
}

function readAppUpdateAttempt(): AppUpdateAttempt | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(APP_UPDATE_ATTEMPT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<AppUpdateAttempt>;
    if (typeof parsed.version !== "string" || typeof parsed.attemptedAt !== "number") {
      return null;
    }
    return {
      attemptedAt: parsed.attemptedAt,
      version: parsed.version,
    };
  } catch {
    return null;
  }
}

function clearAppUpdateAttempt() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(APP_UPDATE_ATTEMPT_STORAGE_KEY);
}

function shouldAttemptAppUpdate(version: string, now = Date.now()) {
  const priorAttempt = readAppUpdateAttempt();
  if (priorAttempt && priorAttempt.version === version && now - priorAttempt.attemptedAt < APP_UPDATE_ATTEMPT_TTL_MS) {
    return false;
  }

  if (typeof window !== "undefined") {
    const nextAttempt: AppUpdateAttempt = { attemptedAt: now, version };
    window.sessionStorage.setItem(APP_UPDATE_ATTEMPT_STORAGE_KEY, JSON.stringify(nextAttempt));
  }
  return true;
}

function isKeyboardEventFromEditableTarget(
  target: EventTarget | null,
  options?: { isTextEditingActive?: boolean },
) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable || target.closest('[contenteditable=""], [contenteditable="true"]')) {
    return true;
  }

  const editableRoleSelector = '[role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"], [aria-multiline="true"]';
  if (target.matches(editableRoleSelector) || target.closest(editableRoleSelector)) {
    return true;
  }

  const formFieldSelector = "input, textarea, select";
  if (target.matches(formFieldSelector) || target.closest(formFieldSelector)) {
    return true;
  }

  if (options?.isTextEditingActive && (target.tagName === "BUTTON" || Boolean(target.closest("button")))) {
    return true;
  }

  return false;
}

declare global {
  interface Window {
    __ADHDICE_TASK_DERIVE_LOGS__?: string[];
    __ADHDICE_TASK_LIST_SWITCH_LOGS__?: string[];
    clearAdhdiceTaskDeriveLogs?: () => void;
    clearAdhdiceTaskListSwitchLogs?: () => void;
    copyAdhdiceTaskDeriveLogs?: () => Promise<void>;
    copyAdhdiceTaskListSwitchLogs?: () => Promise<void>;
  }
}

function getTaskDeriveLogsStore() {
  if (typeof window === "undefined") {
    return null;
  }

  window.__ADHDICE_TASK_DERIVE_LOGS__ ??= [];
  return window.__ADHDICE_TASK_DERIVE_LOGS__;
}

function getTaskListSwitchLogsStore() {
  if (typeof window === "undefined") {
    return null;
  }

  window.__ADHDICE_TASK_LIST_SWITCH_LOGS__ ??= [];
  return window.__ADHDICE_TASK_LIST_SWITCH_LOGS__;
}

function logTaskListSwitchTiming(message: string) {
  console.info(message);
  getTaskListSwitchLogsStore()?.push(message);
}

type PersistedFocusAlarmState = {
  enabled: boolean;
  intervalMinutes: number;
  nextRingAt: number | null;
};

function getFocusAlarmStorageKey(userId: string) {
  return `${FOCUS_ALARM_STORAGE_KEY_PREFIX}:${userId}`;
}

function normalizeFocusAlarmNextRingAt(nextRingAt: number | null, now: number, intervalMinutes: number) {
  const intervalMs = Math.max(1, intervalMinutes) * 60_000;
  if (!Number.isFinite(nextRingAt) || nextRingAt === null) {
    return now + intervalMs;
  }
  if (nextRingAt > now) {
    return nextRingAt;
  }
  const elapsedIntervals = Math.floor((now - nextRingAt) / intervalMs) + 1;
  return nextRingAt + elapsedIntervals * intervalMs;
}

function formatFocusAlarmRemaining(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function readPersistedFocusAlarmState(userId: string): PersistedFocusAlarmState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getFocusAlarmStorageKey(userId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<PersistedFocusAlarmState>;
    return {
      enabled: parsed.enabled === true,
      intervalMinutes: typeof parsed.intervalMinutes === "number" ? parsed.intervalMinutes : DEFAULT_FOCUS_ALARM_INTERVAL_MINUTES,
      nextRingAt: typeof parsed.nextRingAt === "number" ? parsed.nextRingAt : null,
    };
  } catch {
    return null;
  }
}

function writePersistedFocusAlarmState(userId: string, state: PersistedFocusAlarmState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getFocusAlarmStorageKey(userId), JSON.stringify(state));
}
export type {
  ActiveFocusSession,
  FocusCategory,
  FocusLabelOptions,
  FocusSubtype,
  FocusType,
  HistoricalFocusSession,
} from "@/lib/types";
export {
  DEFAULT_FOCUS_CATEGORY_TITLES,
  DEFAULT_FOCUS_TITLES,
  DEFAULT_FOCUS_TYPES,
  DEFAULT_PRIMARY_SUBTYPES,
  DEFAULT_SECONDARY_SUBTYPES,
} from "@/lib/types";

function BasketballIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M2 12 Q12 5 22 12" />
      <path d="M2 12 Q12 19 22 12" />
    </svg>
  );
}

const ICONS_MAP: Record<string, LucideIcon> = {
  Code: Code2,
  Briefcase: BriefcaseBusiness,
  Moon: MoonStar,
  Coffee,
  Book: BookOpen,
  Brain,
  Calendar: CalendarDays,
  Camera,
  CheckSquare: SquareCheckBig,
  Dice: Dice5,
  FileText,
  Music,
  Gamepad: Gamepad2,
  Dumbbell,
  Headphones,
  Home: House,
  Rocket,
  Target,
  Zap,
  Palette,
  Pen: PenLine,
  Plane,
  Monitor: MonitorSmartphone,
  Smartphone: MonitorSmartphone,
  Sparkles,
  Sun,
  Utensils,
  Wifi,
  Heart,
  Star,
  Shield,
  Search,
  DollarSign,
  PieChart: ChartPie,
  Trophy,
  Layers,
  Server,
  Lock,
  User: UserRound,
  Box,
  Dices,
  Clock,
  FlaskConical,
  basketball: BasketballIcon as unknown as LucideIcon,
};

type RawLucideIconName = keyof typeof dynamicIconImports;
const LUCIDE_ICON_NAME_SET = new Set<string>(Object.keys(dynamicIconImports));

function RawLucideIcon({
  name,
  ...props
}: {
  name: RawLucideIconName;
} & React.SVGProps<SVGSVGElement>) {
  const [IconComponent, setIconComponent] = useState<LucideIcon | null>(null);

  useEffect(() => {
    let cancelled = false;

    void dynamicIconImports[name]().then((module) => {
      if (!cancelled) {
        setIconComponent(() => module.default);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [name]);

  if (!IconComponent) {
    return <Code2 {...props} />;
  }

  return <IconComponent {...props} />;
}

export function CategoryIcon({ name, ...props }: { name: string } & React.SVGProps<SVGSVGElement>) {
  const aliasedIcon = ICONS_MAP[name];
  if (aliasedIcon) {
    const AliasedIcon = aliasedIcon;
    return <AliasedIcon {...props} />;
  }

  if (LUCIDE_ICON_NAME_SET.has(name)) {
    return <RawLucideIcon name={name as RawLucideIconName} {...props} />;
  }

  return <Code2 {...props} />;
}

const FOCUS_CATEGORIES_STORAGE_KEY = "adhdice_focus_categories";
const FOCUS_ACTIVE_STORAGE_KEY = "adhdice_active_sessions";
const FOCUS_HISTORY_STORAGE_KEY = "adhdice_focus_history";
const DEFAULT_FOCUS_ALARM_INTERVAL_MINUTES = 20;
const MIN_FOCUS_ALARM_INTERVAL_MINUTES = 5;
const MAX_FOCUS_ALARM_INTERVAL_MINUTES = 120;
const FOCUS_ALARM_INTERVAL_STEP_MINUTES = 5;
const LIST_COLUMN_LABELS: Record<AgentPlanColumnId, string> = {
  bucket: "Lists",
  date_added: "Date Added",
  date_completed: "Date Completed",
  last_done: "Last Done",
  last_handled: "Last Handled",
  due: "Due",
  energy: "Energy",
  estimated_time: "Estimated Time",
  actual_time: "Actual Time",
  streak: "Streak",
  tags: "Tags",
  link: "Link",
  notes: "Notes",
  priority: "Priority",
  repeat: "Repeat",
  signal: "Indicators",
};
const LIST_COLUMN_PICKER_ORDER: AgentPlanColumnId[] = ["bucket", "date_added", "last_done", "last_handled", "due", "estimated_time", "actual_time", "streak", "tags", "link", "notes", "priority", "energy", "repeat", "signal"];
const TASK_KEYBOARD_SHORTCUTS: TaskKeyboardShortcut[] = [
  { action: "Search tasks", keys: ["/"] },
  { action: "New task", keys: ["N"], alternateKeys: ["A"] },
  { action: "Open selected task", keys: ["E"] },
  { action: "Complete selected task", keys: ["C"] },
  { action: "Move selected to Today", keys: ["T"] },
  { action: "Move selected to Focus", keys: ["F"] },
  { action: "Open Focus Planner", keys: ["Shift", "F"] },
  { action: "Move selected to Waiting", keys: ["W"] },
  { action: "Move selected to Later", keys: ["L"] },
  { action: "Move row selection", keys: ["Up", "Down"] },
  { action: "Jump to first / last row", keys: ["Home", "End"] },
];
const TASK_BUCKET_LABELS: Record<TaskBucket, string> = {
  all: "All",
  inbox: "Inbox",
  today: "Today",
  focus: "Focus",
  urgent: "Urgent",
  quick_wins: "Quick Wins",
  recurring: "Recurring",
  waiting: "Waiting",
  later: "Later",
  done: "Done",
  missed: "Missed",
  archive: "Archive",
  trash: "Trash",
};

function isTaskPinned(task: Task) {
  return Boolean(task.pinned_at);
}

const TASK_LIST_RULE_FIELD_OPTIONS: Array<{ label: string; value: TaskListRuleField }> = [
  { label: "Status", value: "status" },
  { label: "List", value: "list" },
  { label: "Steps", value: "steps" },
  { label: "Completed", value: "completed_history" },
  { label: "Missed", value: "missed_history" },
  { label: "Completed Streak", value: "completed_streak" },
  { label: "Missed Streak", value: "missed_streak" },
  { label: "Date Added", value: "date_added" },
  { label: "History Status", value: "history_status" },
  { label: "Due", value: "due" },
  { label: "Priority", value: "priority_level" },
  { label: "Energy", value: "energy" },
  { label: "Focus", value: "focus" },
  { label: "Urgent", value: "is_urgent" },
  { label: "Important", value: "is_important" },
  { label: "Repeats", value: "repeat" },
];
const TASK_LIST_RULE_OPERATOR_OPTIONS: Record<TaskListRuleField, Array<{ label: string; value: TaskListRuleRowOperator }>> = {
  list: [
    { label: "is", value: "is" },
    { label: "isn't", value: "is_not" },
  ],
  steps: [
    { label: "has steps", value: "is" },
    { label: "doesn't have steps", value: "is_not" },
  ],
  date_added: [
    { label: "is today", value: "is_today" },
    { label: "isn't today", value: "is_not_today" },
  ],
  history_status: [
    { label: "is", value: "is" },
    { label: "isn't", value: "is_not" },
  ],
  due: [
    { label: "is today", value: "is_today" },
    { label: "is tomorrow", value: "is_tomorrow" },
    { label: "isn't today", value: "is_not_today" },
    { label: "is overdue", value: "is_overdue" },
    { label: "isn't overdue", value: "is_not_overdue" },
    { label: "has no date", value: "is_empty" },
    { label: "has a later date", value: "is_future" },
  ],
  completed_history: [
    { label: "is today", value: "is_today" },
    { label: "within last", value: "within_last" },
    { label: "last within last", value: "last_within_last" },
    { label: "has ever", value: "has_ever" },
  ],
  missed_history: [
    { label: "is today", value: "is_today" },
    { label: "within last", value: "within_last" },
    { label: "last within last", value: "last_within_last" },
    { label: "has ever", value: "has_ever" },
  ],
  completed_streak: [
    { label: "equals", value: "equals" },
    { label: "at least", value: "at_least" },
    { label: "less than", value: "less_than" },
  ],
  missed_streak: [
    { label: "equals", value: "equals" },
    { label: "at least", value: "at_least" },
    { label: "less than", value: "less_than" },
  ],
  energy: [
    { label: "is", value: "is" },
    { label: "isn't", value: "is_not" },
  ],
  priority_level: [
    { label: "is", value: "is" },
    { label: "isn't", value: "is_not" },
  ],
  streak: [
    { label: "is", value: "is" },
    { label: "isn't", value: "is_not" },
  ],
  focus: [
    { label: "is", value: "is" },
    { label: "isn't", value: "is_not" },
  ],
  is_important: [
    { label: "is", value: "is" },
    { label: "isn't", value: "is_not" },
  ],
  is_urgent: [
    { label: "is", value: "is" },
    { label: "isn't", value: "is_not" },
  ],
  repeat: [
    { label: "is", value: "is" },
    { label: "isn't", value: "is_not" },
  ],
  status: [
    { label: "is", value: "is" },
    { label: "isn't", value: "is_not" },
  ],
};
const priorityOptions: TaskPriorityLevelOption[] = ["0", "1", "2", "3", "4", "5"];
const energyOptions: TaskEnergy[] = ["none", "low", "medium", "high"];
const taskStatusOptions: TaskStatus[] = ["pending", "in_progress", "delayed", "done", "did_my_best", "missed", "complete", "upcoming", "not_due", "archived", "trashed"];
const repeatFrequencyOptions: TaskRepeatFrequency[] = ["none", "daily", "daily_until_complete", "weekly", "monthly", "custom"];
const repeatWeekdayOptions = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
] as const;
const dockItems: AppPage[] = ["Home", "Tasks", "Focus", "Health", "Roll", "Achievements", "Games", "Stats", "Notes", "Settings", "Test"];
const dockIcons: Record<AppPage, string> = {
  Home: "Home",
  Tasks: "CheckSquare",
  Focus: "Clock",
  Roll: "Dice",
  Achievements: "Trophy",
  Health: "Heart",
  Games: "Gamepad",
  Stats: "PieChart",
  Notes: "Book",
  Settings: "Monitor",
  Test: "FlaskConical",
};
const navigatorSearchTargets = createNavigatorSearchTargets(dockItems, HEALTH_TABS);
const TASK_GRID_MAX_COLUMNS = 4;
const TASK_GRID_TABLET_COLUMNS = 2;
const TASK_GRID_PHONE_COLUMNS = 1;
const TASK_GRID_ROW_HEIGHT = 42;
const TASK_GRID_MAX_DISPLAY_ROWS = 24;
const TASK_GRID_WIDGET_LABELS: Record<TaskGridWidgetType, string> = {
  urgent: "Urgent Tasks",
  focus_today: "Focus",
  due_today: "Due Today",
  active_queue: "Active Queue",
  completed: "Completed",
  quick_capture: "Quick Capture",
  import: "Import",
  focus_stats: "Focus Stats",
};
const isTaskGridWidgetType = buildWidgetTypeGuard(TASK_GRID_WIDGET_LABELS);
const TASK_GRID_STARTER_LAYOUT: TaskGridItem[] = normalizeTaskGridLayout([
  { h: 9, id: "grid-urgent", type: "urgent", w: 2, x: 0, y: 0 },
  { h: 6, id: "grid-focus-today", type: "focus_today", w: 1, x: 0, y: 0 },
  { h: 8, id: "grid-quick-capture", type: "quick_capture", w: 1, x: 0, y: 0 },
  { h: 6, id: "grid-due-today", type: "due_today", w: 2, x: 0, y: 0 },
  { h: 6, id: "grid-active-queue", type: "active_queue", w: 1, x: 0, y: 0 },
  { h: 6, id: "grid-focus-stats", type: "focus_stats", w: 1, x: 0, y: 0 },
  { h: 8, id: "grid-import", type: "import", w: 2, x: 0, y: 0 },
  { h: 6, id: "grid-completed", type: "completed", w: 2, x: 0, y: 0 },
], isTaskGridWidgetType, TASK_GRID_MAX_COLUMNS, TASK_GRID_MAX_DISPLAY_ROWS);

function isSupabaseSessionLockError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("Lock was stolen by another request")
    || message.includes("Lock was not released within 5000ms");
}

function isSupabaseLoadFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("Load failed")
    || message.includes("Failed to fetch")
    || message.includes("Network request failed");
}

function getCountdownAlertSessionKey(session: ActiveFocusSession | null) {
  if (!session || session.mode !== "countdown" || !session.countdownTargetSeconds) {
    return null;
  }
  return `${session.categoryId}:${session.startTime ?? "idle"}:${session.countdownTargetSeconds}`;
}

function getCountdownRemainingSeconds(session: ActiveFocusSession, nowMs: number) {
  if (session.mode !== "countdown" || !session.countdownTargetSeconds) {
    return null;
  }

  if (session.isRunning && session.startTime) {
    const elapsed = Math.max(0, Math.floor((nowMs - session.startTime) / 1000));
    return Math.max(0, session.countdownTargetSeconds - session.accumulatedSeconds - elapsed);
  }

  return Math.max(0, session.countdownTargetSeconds - session.accumulatedSeconds);
}

function findFinishedCountdownSession(activeSessions: Record<string, ActiveFocusSession>, nowMs: number) {
  return Object.values(activeSessions).find((session) => (
    isSystemCountdownCategoryId(session.categoryId)
      && session.mode === "countdown"
      && Boolean(session.countdownTargetSeconds)
      && getCountdownRemainingSeconds(session, nowMs) === 0
  )) ?? null;
}

function useNativeIosPlatform() {
  return useSyncExternalStore(
    subscribeToPlatformChanges,
    getNativeIosPlatformSnapshot,
    getWebPlatformSnapshot,
  );
}

function subscribeToPlatformChanges() {
  return () => {};
}

function getNativeIosPlatformSnapshot() {
  return typeof window !== "undefined" && Capacitor.getPlatform() === "ios";
}

function getWebPlatformSnapshot() {
  return false;
}

export function TaskApp() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const isNativeIosPlatform = useNativeIosPlatform();
  const profileSettingsHydratedRef = useRef(false);
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const canonicalTasksRef = useRef<Task[]>([]);
  const taskStatusMutationInFlightRef = useRef(new Map<string, Promise<boolean | undefined>>());
  useEffect(() => {
    canonicalTasksRef.current = tasks;
  }, [tasks]);
  const [message, setMessage] = useState<Message | null>(null);
  const [batchEditProgress, setBatchEditProgress] = useState<BatchEditProgress | null>(null);
  const [hudNotificationEvents, setHudNotificationEvents] = useState<HudNotificationItem[]>([]);
  const [activeRewardBankSession, setActiveRewardBankSession] = useState<import("@/lib/task-rewards").PendingTaskReward[] | null>(null);
  const lastHudNotificationMessageRef = useRef<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [lowStim, setLowStim] = useState(false);
  const [accentColor, setAccentColor] = useState("#6f57f6");
  const [focusAlarmEnabled, setFocusAlarmEnabled] = useState(false);
  const [focusAlarmIntervalMinutes, setFocusAlarmIntervalMinutes] = useState(DEFAULT_FOCUS_ALARM_INTERVAL_MINUTES);
  const [focusAlarmNextRingAt, setFocusAlarmNextRingAt] = useState<number | null>(null);
  const [activeCountdownAlertSessionKey, setActiveCountdownAlertSessionKey] = useState<string | null>(null);
  const [dismissedCountdownAlertSessionKey, setDismissedCountdownAlertSessionKey] = useState<string | null>(null);
  const [mobileZoom, setMobileZoom] = useState<(typeof MOBILE_ZOOM_LEVELS)[number]>(1);
  const [isHudAppearanceReady, setIsHudAppearanceReady] = useState(false);
  const [hasCompletedInitialAppBoot, setHasCompletedInitialAppBoot] = useState(false);
  const countdownAlarmAudioContextRef = useRef<AudioContext | null>(null);
  const countdownAlarmGainRef = useRef<GainNode | null>(null);
  const countdownAlarmOscillatorRef = useRef<OscillatorNode | null>(null);
  const countdownAlarmPulseIntervalRef = useRef<number | null>(null);
  const [isTaskEditorOpen, setIsTaskEditorOpen] = useState(false);
  const [taskEditorMode, setTaskEditorMode] = useState<TaskEditorMode>("create");
  const [taskEditorTaskId, setTaskEditorTaskId] = useState<string | null>(null);
  const [taskEditorInitialDraft, setTaskEditorInitialDraft] = useState<Partial<TaskEditorDraft> | null>(null);
  const normalizePersistedTaskGridLayout = useMemo(
    () => (layout: TaskGridItem[]) =>
      normalizeTaskGridLayout(layout, isTaskGridWidgetType, TASK_GRID_MAX_COLUMNS, TASK_GRID_MAX_DISPLAY_ROWS),
    [],
  );
  const {
    activeTaskWorkspaceTab,
    activePage,
    closeTaskWorkspaceTab,
    createTaskWorkspaceTab,
    focusedTaskIdsByDate,
    hudUiState,
    isDailyPlanningCollapsed,
    isRestoringPersistedUiState,
    isTaskFiltersOpen,
    pendingTaskEditorRestore,
    renameTaskWorkspaceTab,
    reorderTaskWorkspaceTab,
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
    setTaskUiState,
    taskTableLayoutPreferences,
    taskGridLayout,
    taskRouting,
    taskWorkspaceTabsState,
    taskUiState,
  } = useTaskUiState({
    isTaskEditorOpen,
    normalizeTaskGridLayout: normalizePersistedTaskGridLayout,
    supabase,
    taskGridStarterLayout: TASK_GRID_STARTER_LAYOUT,
    taskEditorMode,
    taskEditorTaskId,
    userId: session?.user?.id,
  });
  const { economy, setEconomy, appendEconomyEvent, resetEconomy } = useEconomy(supabase, session?.user?.id ?? null);
  const {
    focusCategories, setFocusCategories,
    focusCounters,
    focusCounterHistory,
    activeSessions, setActiveSessions, refreshFocusRuntimes, refreshFocusCounters,
    focusHistory, setFocusHistory,
    focusDailyGoalAdjustments,
    pendingDailyGoalSurplus,
    setPendingDailyGoalSurplus,
    focusReallocationMode,
    setFocusReallocationMode,
    suppressCategoryReload,
    handleToggleTimer, handleSetCountdownTarget, handleFinishTimer, handleAdjustTimer, handleResetTimer, handleDeleteTimer,
    handleManualFocusEntry, handleSaveCategories, handleDeleteFocusCategory, handleSaveDailyGoalAdjustment,
    handleUpdateFocusHistoryEntry, handleDeleteFocusHistoryEntry,
    handleAdjustFocusCounter, handleCreateFocusCounter, handleDeleteFocusCounter, handleUpdateFocusCounter,
  } = useFocus(supabase, session?.user?.id ?? null, setMessage, activePage === "Focus" || activePage === "Stats" || activePage === "Health");
  const {
    awards: healthAwards,
    checkIns: healthCheckIns,
    deleteFavoriteFood,
    deleteMealEntry,
    deleteRecipe: deleteHealthRecipe,
    deleteSavedMeal: deleteHealthSavedMeal,
    deleteWaterEntry: deleteHealthWaterEntry,
    deleteWorkout: deleteHealthWorkout,
    deleteWeightEntry,
    favorites: healthFavorites,
    importAudits: healthImportAudits,
    isLoading: isHealthLoading,
    importAppleHealthData,
    mealEntries: healthMealEntries,
    mealPlanEntries: healthMealPlanEntries,
    symptoms: healthSymptoms,
    symptomEntries: healthSymptomEntries,
    createSymptom: createHealthSymptom,
    renameSymptom: renameHealthSymptom,
    archiveSymptom: archiveHealthSymptom,
    addSymptomEntry: addHealthSymptomEntry,
    updateSymptomEntry: updateHealthSymptomEntry,
    deleteSymptomEntry: deleteHealthSymptomEntry,
    addMealPlanEntry: addHealthMealPlanEntry,
    updateMealPlanEntry: updateHealthMealPlanEntry,
    deleteMealPlanEntry: deleteHealthMealPlanEntry,
    confirmMealPlanEntry: confirmHealthMealPlanEntry,
    metricEntries: healthMetricEntries,
    profile: healthProfile,
    recipes: healthRecipes,
    saveCheckIn,
    saveFavoriteFood,
    setFavoriteFoodStatus,
    saveRecipe: saveHealthRecipe,
    savedMeals: healthSavedMeals,
    saveSavedMeal: saveHealthSavedMeal,
    saveProfile: saveHealthProfile,
    addMealEntry: addHealthMealEntry,
    addWaterEntry: addHealthWaterEntry,
    addWeightEntry: addHealthWeightEntry,
    addWorkout: addHealthWorkout,
    updateMealEntry: updateHealthMealEntry,
    updateWaterEntry: updateHealthWaterEntry,
    updateWorkout: updateHealthWorkout,
    storageMode: healthStorageMode,
    weightEntries: healthWeightEntries,
    waterEntries: healthWaterEntries,
    workouts: healthWorkouts,
  } = useHealth(supabase, session?.user?.id ?? null, setMessage, appendEconomyEvent, setEconomy, activePage === "Health");
  const activeHealthTab = useSyncExternalStore(subscribeToHealthTabPreference, readHealthTabPreference, () => "Today");
  const fitnessHooksActive = activePage === "Health" && activeHealthTab === "Fitness";
  const {
    archiveGoal: archiveFitnessGoal,
    createGoal: createFitnessGoal,
    createLevel: createFitnessGoalLevel,
    deleteLevel: deleteFitnessGoalLevel,
    error: fitnessGoalsError,
    goals: fitnessGoals,
    isLoading: fitnessGoalsLoading,
    levels: fitnessGoalLevels,
    restoreGoal: restoreFitnessGoal,
    updateGoal: updateFitnessGoal,
    updateLevel: updateFitnessGoalLevel,
  } = useFitnessGoals(supabase, session?.user?.id ?? null, setMessage, fitnessHooksActive);
  const {
    archivePlan: archiveFitnessPlan,
    archivePlanItem: archiveFitnessPlanItem,
    createPlan: createFitnessPlan,
    createPlanItem: createFitnessPlanItem,
    error: fitnessPlanError,
    isLoading: fitnessPlansLoading,
    planItems: fitnessPlanItems,
    plans: fitnessPlans,
    saveWorkoutPlanItemLinks,
    updatePlan: updateFitnessPlan,
    updatePlanItem: updateFitnessPlanItem,
    workoutPlanItemLinks,
  } = useFitnessPlans(supabase, session?.user?.id ?? null, setMessage, fitnessHooksActive);
  const {
    archiveExercise,
    createExercise,
    error: fitnessSessionError,
    exerciseLibrary,
    getWorkoutSessionDetails,
    isLoaded: fitnessSessionLoaded,
    isLoading: fitnessSessionLoading,
    removeLocalWorkoutSessionDetails,
    reorderExercises,
    saveWorkoutSessionDetails,
    updateExercise,
    workoutExercises,
    workoutSets,
  } = useFitnessSessionDetails(supabase, session?.user?.id ?? null, setMessage, fitnessHooksActive);
  async function deleteHealthWorkoutWithStructuredDetails(workoutId: string) {
    const deleted = await deleteHealthWorkout(workoutId);
    if (deleted) {
      removeLocalWorkoutSessionDetails(workoutId);
    }
    return deleted;
  }
  const currentUserId = session?.user?.id ?? null;
  const scratchNotes = useScratchNotes(supabase, currentUserId);
  const sleepCategory = useMemo(
    () => focusCategories.find((category) => isSleepCategory(category)) ?? null,
    [focusCategories],
  );
  const sleepActiveSession = sleepCategory ? activeSessions[sleepCategory.id] ?? null : null;
  const onToggleSleepClock = useCallback(() => {
    if (!sleepCategory) {
      setMessage({ tone: "warn", text: "Create a Sleep Focus category first, then start the clock." });
      return;
    }
    void handleToggleTimer(sleepCategory.id, sleepActiveSession ? undefined : { mode: "countup" });
  }, [handleToggleTimer, sleepActiveSession, sleepCategory, setMessage]);
  const onFinishSleepClock = useCallback((kind: HealthSleepKind) => {
    if (!sleepCategory || !sleepActiveSession) return;
    void handleFinishTimer(sleepCategory.id, {
      title: sleepCategory.title,
      focusType: sleepCategory.focusType,
      focusSubtype: kind,
      focusSubtype2: sleepCategory.focusSubtype2,
      notes: "",
      date: sleepActiveSession.startTime ? getLogicalDayKey(new Date(sleepActiveSession.startTime)) : todayISO(),
    });
  }, [handleFinishTimer, sleepActiveSession, sleepCategory]);
  const onLogManualSleep = useCallback(async (input: {
    date: string;
    durationSeconds: number;
    endedAt: string;
    kind: HealthSleepKind;
    startedAt: string;
  }) => {
    if (!sleepCategory) {
      setMessage({ tone: "warn", text: "Create a Sleep Focus category first, then log sleep." });
      return false;
    }
    return handleManualFocusEntry({
      categoryId: sleepCategory.id,
      title: sleepCategory.title,
      focusType: sleepCategory.focusType,
      focusSubtype: input.kind,
      focusSubtype2: sleepCategory.focusSubtype2,
      durationSeconds: input.durationSeconds,
      date: input.date,
      notes: "",
      startedAt: input.startedAt,
      endedAt: input.endedAt,
    });
  }, [handleManualFocusEntry, setMessage, sleepCategory]);
  const onUpdateSleepSession = useCallback(async (entryId: string, input: {
    date: string;
    durationSeconds: number;
    endedAt: string;
    kind: HealthSleepKind;
    startedAt: string;
  }) => {
    if (!sleepCategory) {
      setMessage({ tone: "warn", text: "Create a Sleep Focus category first, then edit sleep." });
      return;
    }
    const existing = focusHistory.find((entry) => entry.id === entryId);
    await handleUpdateFocusHistoryEntry(entryId, {
      categoryId: existing ? existing.categoryId : sleepCategory.id,
      title: existing ? existing.title : sleepCategory.title,
      focusType: existing ? existing.focusType : sleepCategory.focusType,
      focusSubtype: input.kind,
      focusSubtype2: existing ? existing.focusSubtype2 : sleepCategory.focusSubtype2,
      durationSeconds: input.durationSeconds,
      date: input.date,
      notes: existing?.notes ?? "",
      startedAt: input.startedAt,
      endedAt: input.endedAt,
    });
  }, [focusHistory, handleUpdateFocusHistoryEntry, setMessage, sleepCategory]);
  const {
    reorderListColumns,
    setSelectedBucket,
    toggleListColumn,
  } = useTaskListViewStateController({ setTaskUiState });
  const lastNonPinnedBucketRef = useRef(taskUiState.selectedBucket === "pinned" ? DEFAULT_TASK_UI_STATE.selectedBucket : taskUiState.selectedBucket);
  const [taskLists, setTaskLists] = useState<TaskListDefinition[]>([]);
  const [taskListFolders, setTaskListFolders] = useState<DbTaskListFolder[]>([]);
  const [taskListContainers, setTaskListContainers] = useState<DbTaskListContainer[]>([]);
  const [taskListRailItems, setTaskListRailItems] = useState<DbTaskListRailItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const previousTaskListFoldersRef = useRef<DbTaskListFolder[]>([]);
  const [taskListManualMemberships, setTaskListManualMemberships] = useState<TaskListManualMembership[]>([]);
  const [taskHistory, setTaskHistory] = useState<DbTaskHistory[]>([]);
  const [taskCalendarOverridesByTaskId, setTaskCalendarOverridesByTaskId] = useState<Record<string, TaskCalendarOverride[]>>({});
  const taskSubtasks = tasks;
  const [availableTaskNotes, setAvailableTaskNotes] = useState<TaskEditorLinkedNote[]>([]);
  const [isGridEditMode, setIsGridEditMode] = useState(false);

  useEffect(() => {
    if (taskUiState.selectedBucket !== "pinned") {
      lastNonPinnedBucketRef.current = taskUiState.selectedBucket;
    }
  }, [taskUiState.selectedBucket]);

  useEffect(() => {
    const checkFinishedCountdown = () => {
      for (const session of Object.values(activeSessions)) {
        if (
          session.mode === "countdown"
          && session.isRunning
          && Boolean(session.countdownTargetSeconds)
          && getCountdownRemainingSeconds(session, Date.now()) === 0
        ) {
          void handleFinishTimer(session.categoryId);
        }
      }
      const finishedSession = findFinishedCountdownSession(activeSessions, Date.now());
      const nextSessionKey = getCountdownAlertSessionKey(finishedSession);
      if (!nextSessionKey) {
        return;
      }
      if (nextSessionKey === dismissedCountdownAlertSessionKey) {
        setActiveCountdownAlertSessionKey(null);
        return;
      }
      setActiveCountdownAlertSessionKey((current) => current ?? nextSessionKey);
    };

    checkFinishedCountdown();

    const hasRunningCountdown = Object.values(activeSessions).some((session) => (
      isSystemCountdownCategoryId(session.categoryId)
        && session.mode === "countdown"
        && session.isRunning
        && Boolean(session.countdownTargetSeconds)
    ));
    if (!hasRunningCountdown) {
      return;
    }

    const intervalId = window.setInterval(checkFinishedCountdown, 250);
    return () => window.clearInterval(intervalId);
  }, [activeSessions, dismissedCountdownAlertSessionKey]);

  useEffect(() => {
    if (!activeCountdownAlertSessionKey) {
      if (countdownAlarmPulseIntervalRef.current !== null) {
        window.clearInterval(countdownAlarmPulseIntervalRef.current);
        countdownAlarmPulseIntervalRef.current = null;
      }
      if (countdownAlarmOscillatorRef.current) {
        countdownAlarmOscillatorRef.current.stop();
        countdownAlarmOscillatorRef.current.disconnect();
        countdownAlarmOscillatorRef.current = null;
      }
      if (countdownAlarmGainRef.current) {
        countdownAlarmGainRef.current.disconnect();
        countdownAlarmGainRef.current = null;
      }
      if (countdownAlarmAudioContextRef.current) {
        void countdownAlarmAudioContextRef.current.close();
        countdownAlarmAudioContextRef.current = null;
      }
      return;
    }

    const audioWindow = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const AudioContextCtor = window.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    const audioContext = new AudioContextCtor();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    void audioContext.resume();

    let pulseOn = false;
    const pulse = () => {
      pulseOn = !pulseOn;
      const atTime = audioContext.currentTime;
      oscillator.frequency.cancelScheduledValues(atTime);
      oscillator.frequency.setValueAtTime(pulseOn ? 880 : 660, atTime);
      gainNode.gain.cancelScheduledValues(atTime);
      gainNode.gain.setValueAtTime(pulseOn ? 0.18 : 0.0001, atTime);
    };

    pulse();
    countdownAlarmAudioContextRef.current = audioContext;
    countdownAlarmOscillatorRef.current = oscillator;
    countdownAlarmGainRef.current = gainNode;
    countdownAlarmPulseIntervalRef.current = window.setInterval(pulse, 450);

    return () => {
      if (countdownAlarmPulseIntervalRef.current !== null) {
        window.clearInterval(countdownAlarmPulseIntervalRef.current);
        countdownAlarmPulseIntervalRef.current = null;
      }
      oscillator.stop();
      oscillator.disconnect();
      gainNode.disconnect();
      void audioContext.close();
      if (countdownAlarmOscillatorRef.current === oscillator) {
        countdownAlarmOscillatorRef.current = null;
      }
      if (countdownAlarmGainRef.current === gainNode) {
        countdownAlarmGainRef.current = null;
      }
      if (countdownAlarmAudioContextRef.current === audioContext) {
        countdownAlarmAudioContextRef.current = null;
      }
    };
  }, [activeCountdownAlertSessionKey]);

  const dismissCountdownFinishedAlert = useCallback(() => {
    setDismissedCountdownAlertSessionKey(activeCountdownAlertSessionKey);
    setActiveCountdownAlertSessionKey(null);
  }, [activeCountdownAlertSessionKey]);
  const [selectedGridWidgetId, setSelectedGridWidgetId] = useState<string | null>(null);
  const [draggedGridWidgetId, setDraggedGridWidgetId] = useState<string | null>(null);
  const [showFocusPlanner, setShowFocusPlanner] = useState(false);
  const [focusPlannerStep, setFocusPlannerStep] = useState<FocusPlannerStep>(0);
  const [focusDraftIds, setFocusDraftIds] = useState<string[]>([]);
  const [momentumView, setMomentumView] = useState<MomentumView>("urgent");
  const [isMomentumListOpen, setIsMomentumListOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const profile = useProfileStore();
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [requestedSettingsSection, setRequestedSettingsSection] = useState<NavigatorSettingsSection | null>(null);
  const [isListColumnMenuOpen, setIsListColumnMenuOpen] = useState(false);
  const [isKeyboardShortcutsMenuOpen, setIsKeyboardShortcutsMenuOpen] = useState(false);
  const [isTaskListSettingsOpen, setIsTaskListSettingsOpen] = useState(false);
  const [isImportWidgetMenuOpen, setIsImportWidgetMenuOpen] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>("idle");
  const [draggedListColumnId, setDraggedListColumnId] = useState<AgentPlanColumnId | null>(null);
  const [expandAllColumnsToken, setExpandAllColumnsToken] = useState(0);
  const [shrinkAllColumnsToken, setShrinkAllColumnsToken] = useState(0);
  const [isBatchEditModalOpen, setIsBatchEditModalOpen] = useState(false);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);
  const [pendingCompleteAction, setPendingCompleteAction] = useState<PendingCompleteAction | null>(null);
  const setTaskUpdateMessage = useCallback<typeof setMessage>((value) => {
    setMessage(value);
  }, []);
  const [taskEditorStatusResetSignal, setTaskEditorStatusResetSignal] = useState<{
    status: TaskStatus;
    taskId: string;
    token: number;
  } | null>(null);
  const [taskHistoryModalTaskId, setTaskHistoryModalTaskId] = useState<string | null>(null);
  const [requestedListOverlayTaskId, setRequestedListOverlayTaskId] = useState<string | null>(null);
  const [sharedTaskEditorOverlayTaskId, setSharedTaskEditorOverlayTaskId] = useState<string | null>(null);
  const [milestoneSetupTaskId, setMilestoneSetupTaskId] = useState<string | null>(null);
  const [milestoneCorrectionId, setMilestoneCorrectionId] = useState<string | null>(null);
  const [pendingDetachMilestoneTaskId, setPendingDetachMilestoneTaskId] = useState<string | null>(null);
  const [isDetachingMilestoneTask, setIsDetachingMilestoneTask] = useState(false);
  const [pendingMilestoneLifecycle, setPendingMilestoneLifecycle] = useState<{ action: MilestoneLifecycleAction; milestoneId: string } | null>(null);
  const [isMilestoneLifecyclePending, setIsMilestoneLifecyclePending] = useState(false);
  const milestoneOperationIdsRef = useRef(new Map<string, string>());
  const [taskEditorFocusRequest, setTaskEditorFocusRequest] = useState<TaskEditorFocusRequest | null>(null);
  const taskEditorFocusTokenRef = useRef(0);
  const [suppressDetachedListNoticeTaskId, setSuppressDetachedListNoticeTaskId] = useState<string | null>(null);
  const [activeTaskTimerIndex, setActiveTaskTimerIndex] = useState(0);
  const [isActiveTimersTrayOpen, setIsActiveTimersTrayOpen] = useState(false);
  const [pendingTaskTimerDiscardId, setPendingTaskTimerDiscardId] = useState<string | null>(null);
  const [logicalDayNow, setLogicalDayNow] = useState(() => Date.now());
  const [notePageOpenNoteId, setNotePageOpenNoteId] = useState<string | null>(null);
  const {
    runningTaskTimers,
    startTaskTimer: persistTaskTimer,
    pauseTaskTimer: persistPausedTaskTimer,
    resumeTaskTimer: persistResumedTaskTimer,
    stopTaskTimer: persistStoppedTaskTimer,
    discardTaskTimer: persistDiscardedTaskTimer,
  } = useTaskTimers(supabase, session?.user?.id ?? null, setMessage);
  const milestoneData = useMilestoneData(supabase, session?.user?.id ?? null, setMessage);
  const achievementProgress = useAchievementProgress(
    supabase,
    session?.user?.id ?? null,
    activePage === "Achievements" || (activePage === "Tasks" && taskUiState.tasksSurface === "report"),
  );
  const achievementNotifications = useAchievementNotifications({
    client: supabase,
    readiness: achievementProgress.readiness,
    snapshot: achievementProgress.snapshot,
    snapshotOwnerUserId: achievementProgress.snapshotOwnerUserId,
    userId: session?.user?.id ?? null,
  });
  const achievementSummaryPresentation = buildAchievementSummaryPresentation(
    achievementProgress.model.summary,
    achievementProgress.isReadyForUser,
  );
  const gridColumns = useResponsiveTaskGridColumns({
    maxColumns: TASK_GRID_MAX_COLUMNS,
    phoneColumns: TASK_GRID_PHONE_COLUMNS,
    tabletColumns: TASK_GRID_TABLET_COLUMNS,
  });
  const [dayStartTime, setDayStartTime] = useState<string>("06:00");
  const [userTimeZone, setUserTimeZone] = useState<string>(getBrowserTimeZone());
  const onTimePlan = useOnTimePlan(
    currentUserId,
    userTimeZone,
    activePage === "Tasks" && taskUiState.tasksSurface === "on_time",
  );
  useEffect(() => {
    onTimePlan.updatePlanFromCurrent((current) => reconcileOnTimeManualDurationsFromTasks(current, tasks));
  }, [onTimePlan.updatePlanFromCurrent, tasks]);
  const brainstormState = useBrainstormState(
    currentUserId,
    activePage === "Tasks" && taskUiState.tasksSurface === "brainstorm",
  );
  const [focusAlarmAudioBlocked, setFocusAlarmAudioBlocked] = useState(false);
  const focusAlarmAudioRef = useRef<HTMLAudioElement | null>(null);
  const focusAlarmHydratedUserIdRef = useRef<string | null>(null);
  const focusAlarmPreviousSettingsRef = useRef<{ enabled: boolean; intervalMinutes: number } | null>(null);
  const focusAlarmSkipNextPersistRef = useRef(false);
  const pendingTaskMutationTrackerRef = useRef(createPendingTaskMutationTracker());
  const canonicalTaskMutationStateRef = useRef<TaskCanonicalMutationState>({
    mutationsInFlight: new Map(),
    taskSnapshots: new Map(),
  });

  function clampFocusAlarmInterval(minutes: number) {
    return Math.max(MIN_FOCUS_ALARM_INTERVAL_MINUTES, Math.min(MAX_FOCUS_ALARM_INTERVAL_MINUTES, minutes));
  }

  async function playFocusAlarmSound(options?: { rearmOnly?: boolean }) {
    const audio = focusAlarmAudioRef.current ?? new Audio(withBasePath("/calm-alarm.wav"));
    focusAlarmAudioRef.current = audio;
    audio.currentTime = 0;
    try {
      await audio.play();
      if (options?.rearmOnly) {
        audio.pause();
        audio.currentTime = 0;
      }
      setFocusAlarmAudioBlocked(false);
      setMessage((previous) => previous?.text === FOCUS_ALARM_BLOCKED_MESSAGE ? null : previous);
      return true;
    } catch {
      setFocusAlarmAudioBlocked(true);
      setMessage({ tone: "warn", text: FOCUS_ALARM_BLOCKED_MESSAGE });
      return false;
    }
  }

  const markPendingTaskMutations = useCallback((taskIds: string[]) => {
    pendingTaskMutationTrackerRef.current.markPendingTaskMutations(taskIds);
  }, []);

  const clearPendingTaskMutations = useCallback((taskIds: string[]) => {
    pendingTaskMutationTrackerRef.current.clearPendingTaskMutations(taskIds);
  }, []);

  const beginPendingTaskMutationScope = useCallback((taskIds: string[]) => {
    pendingTaskMutationTrackerRef.current.beginPendingTaskMutationScope(taskIds);
  }, []);

  const endPendingTaskMutationScope = useCallback((taskIds: string[]) => {
    pendingTaskMutationTrackerRef.current.endPendingTaskMutationScope(taskIds);
  }, []);

  const shouldSkipTaskReload = useCallback((change: { eventType: string; taskId: string | null }) => {
    return pendingTaskMutationTrackerRef.current.shouldSkipTaskReload(change);
  }, []);
  const listColumnMenuRef = useRef<HTMLDivElement | null>(null);
  const keyboardShortcutsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") {
      return;
    }

    getTaskDeriveLogsStore();
    getTaskListSwitchLogsStore();
    window.copyAdhdiceTaskDeriveLogs = async () => {
      const joinedLogs = (window.__ADHDICE_TASK_DERIVE_LOGS__ ?? []).join("\n");
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(joinedLogs);
          return;
        } catch {
          console.info(joinedLogs);
          return;
        }
      }

      console.info(joinedLogs);
    };
    window.clearAdhdiceTaskDeriveLogs = () => {
      getTaskDeriveLogsStore()?.splice(0);
    };
    window.copyAdhdiceTaskListSwitchLogs = async () => {
      const joinedLogs = (window.__ADHDICE_TASK_LIST_SWITCH_LOGS__ ?? []).join("\n");
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(joinedLogs);
          return;
        } catch {
          console.info(joinedLogs);
          return;
        }
      }

      console.info(joinedLogs);
    };
    window.clearAdhdiceTaskListSwitchLogs = () => {
      getTaskListSwitchLogsStore()?.splice(0);
    };

    return () => {
      delete window.copyAdhdiceTaskDeriveLogs;
      delete window.clearAdhdiceTaskDeriveLogs;
      delete window.copyAdhdiceTaskListSwitchLogs;
      delete window.clearAdhdiceTaskListSwitchLogs;
    };
  }, []);

  useEffect(() => {
    runStorageMigrations();
  }, []);

  useEffect(() => {
    const pendingAttempt = readAppUpdateAttempt();
    if (pendingAttempt?.version === APP_VERSION) {
      clearAppUpdateAttempt();
    }
  }, []);

  useEffect(() => {
    setIsHudAppearanceReady(false);
    setHasCompletedInitialAppBoot(false);
  }, [session?.user?.id]);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accentColor);
    document.documentElement.style.setProperty("--accent-strong", accentColor);
  }, [accentColor]);

  const resolveTaskGridLayoutFromRow = (row: DbTaskGridLayout | null) =>
    resolveTaskGridLayout(
      row,
      TASK_GRID_STARTER_LAYOUT,
      isTaskGridWidgetType,
      TASK_GRID_MAX_COLUMNS,
      TASK_GRID_MAX_DISPLAY_ROWS,
  );
  const taskListDataGeneration = useRef(0);
  const todayKey = useMemo(
    () => getLogicalDayKey(new Date(logicalDayNow), { dayStartTime, timezone: userTimeZone }),
    [dayStartTime, logicalDayNow, userTimeZone],
  );

  const {
    isSoftWorkspaceRefreshing,
    isTaskHistoryLoaded,
    isTaskListMembershipDataReady,
    isTaskResumeSyncPending,
    isWorkspaceLoading,
    fetchTaskHistoryForRollover,
    loadTaskHistoryForTask,
    loadTaskHistoryForTasks,
    loadTaskNotes,
    prepareTaskMutation,
    reconcileRolloverWorkspace,
    retryTaskHistoryForTask,
    refreshTaskHistoryStreakSummary,
    softRefreshWorkspace,
    taskHistoryByTaskId: sharedTaskHistoryByTaskId,
    taskHistoryLoadStateByTaskId,
    taskHistoryStreakSummaries,
    updateTaskHistoryForTask,
    workspaceGenerationRef,
  } = useWorkspaceData({
    activePage,
    currentUser: session?.user,
    isMissingTaskListManualMembershipsTableError,
    isMissingTaskListsTableError,
    mapFocusCategoryRow,
    mapFocusSessionRow,
    mapTaskFocusDayRows,
    mapTaskHistoryRow,
    mapTaskListManualMembershipRow,
    mapTaskListRow,
    mergeStoredFocusCategories,
    mergeStoredFocusHistory,
    migrateLocalFocusState,
    migrateLocalTaskFocusDays,
    onProfileLoaded: (profileRow, user) => {
      const persistedFocusAlarmState = readPersistedFocusAlarmState(user.id);
      const nextFocusAlarmEnabled = persistedFocusAlarmState?.enabled
        ?? (profileRow?.focus_alarm_enabled ?? false);
      const nextFocusAlarmIntervalMinutes = clampFocusAlarmInterval(
        persistedFocusAlarmState?.intervalMinutes
          ?? profileRow?.focus_alarm_interval_minutes
          ?? DEFAULT_FOCUS_ALARM_INTERVAL_MINUTES,
      );

      saveProfile(buildProfileSnapshot(profileRow, user), user.id);
      if (profileRow) {
        const nextDayStartTime = profileRow.day_start_time ?? "06:00";
        const nextTimeZone = profileRow.timezone ?? getBrowserTimeZone();
        setTheme(profileRow.theme_preference ?? "light");
        setLowStim(profileRow.low_stim_mode ?? false);
        setAccentColor(profileRow.accent_color ?? "#6f57f6");
        setDayStartTime(nextDayStartTime);
        setUserTimeZone(nextTimeZone);
        saveLogicalDaySettings({ dayStartTime: nextDayStartTime, timezone: nextTimeZone });
      } else {
        const browserTimeZone = getBrowserTimeZone();
        setTheme("light");
        setLowStim(false);
        setAccentColor("#6f57f6");
        setDayStartTime("06:00");
        setUserTimeZone(browserTimeZone);
        saveLogicalDaySettings({ dayStartTime: "06:00", timezone: browserTimeZone });
      }
      setFocusAlarmEnabled(nextFocusAlarmEnabled);
      setFocusAlarmIntervalMinutes(nextFocusAlarmIntervalMinutes);
      profileSettingsHydratedRef.current = true;
      setIsHudAppearanceReady(true);
    },
    resolveTaskGridLayout: resolveTaskGridLayoutFromRow,
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
    taskGridStarterLayout: TASK_GRID_STARTER_LAYOUT,
    taskListDataGeneration,
    logicalDayRollover: dayStartTime,
    now: new Date(logicalDayNow),
    todayKey,
    timezone: userTimeZone,
  });
  const actionWorkspaceGeneration = workspaceGenerationRef.current;

  const reconcileTaskHistoryMutation = useCallback((taskId: string, nextTaskHistory: DbTaskHistory[], nextTask?: Task) => {
    updateTaskHistoryForTask(taskId, nextTaskHistory);
    return refreshTaskHistoryStreakSummary(taskId, nextTaskHistory, nextTask);
  }, [refreshTaskHistoryStreakSummary, updateTaskHistoryForTask]);

  useEffect(() => {
    if (isTaskEditorOpen) void loadTaskNotes();
  }, [isTaskEditorOpen, loadTaskNotes]);

  const isRefreshBusy = refreshStatus === "updating" || isSoftWorkspaceRefreshing;

  async function fetchDeployedAppVersion() {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      const versionUrl = new URL(withBasePath(APP_VERSION_ENDPOINT), window.location.origin);
      versionUrl.searchParams.set("t", String(Date.now()));
      const response = await fetch(versionUrl.toString(), {
        cache: "no-store",
        headers: {
          "cache-control": "no-cache",
          pragma: "no-cache",
        },
      });
      if (!response.ok) {
        return null;
      }
      const payload = await response.json() as Partial<{ version: unknown }>;
      return typeof payload.version === "string" && payload.version.trim().length > 0
        ? payload.version.trim()
        : null;
    } catch {
      return null;
    }
  }

  async function updateActiveServiceWorkers() {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.update().catch(() => undefined)));
    } catch {
      // Ignore service-worker update failures and fall back to a normal reload path.
    }
  }

  async function handleHudRefresh() {
    if (isRefreshBusy) {
      return;
    }

    setRefreshStatus("syncing");
    try {
      const deployedVersion = await fetchDeployedAppVersion();
      if (deployedVersion && deployedVersion !== APP_VERSION) {
        if (!shouldAttemptAppUpdate(deployedVersion)) {
          setMessage({
            tone: "neutral",
            text: `ADHDice ${deployedVersion} update was already attempted recently, so Refresh skipped another reload to avoid a loop.`,
          });
          await Promise.all([softRefreshWorkspace(), refreshFocusRuntimes(), refreshFocusCounters()]);
          return;
        }

        setRefreshStatus("updating");
        setMessage({ tone: "neutral", text: `Updating ADHDice to ${deployedVersion}...` });
        await updateActiveServiceWorkers();
        window.location.reload();
        return;
      }

      await Promise.all([softRefreshWorkspace(), refreshFocusRuntimes(), refreshFocusCounters()]);
    } finally {
      setRefreshStatus("idle");
    }
  }

  useEffect(() => {
    if (!supabase) {
      return;
    }

    function handleSessionLockRejection(event: PromiseRejectionEvent) {
      if (!isSupabaseSessionLockError(event.reason)) {
        if (!isAuthResolved && isSupabaseLoadFailure(event.reason)) {
          event.preventDefault();
          setSession(null);
          setIsAuthResolved(true);
          setMessage((current) => current ?? {
            tone: "warn",
            text: "Could not reach Supabase to restore your session. Check your connection and Supabase settings, then try again.",
          });
        }
        return;
      }

      event.preventDefault();
    }

    window.addEventListener("unhandledrejection", handleSessionLockRejection);

    const unsubscribe = subscribeToBrowserAuth((event: AuthChangeEvent, nextSession) => {
      if (event === "SIGNED_OUT") {
        setActiveProfileUserId(null);
        setSession(null);
        setIsAuthResolved(true);
        setTasks([]);
        setFocusCategories([]);
        setActiveSessions({});
        setFocusHistory([]);
        setTaskHistory([]);
        setTaskCalendarOverridesByTaskId({});
        setAvailableTaskNotes([]);
        setIsGridEditMode(false);
        setSelectedGridWidgetId(null);
        setIsTaskEditorOpen(false);
        setTaskEditorMode("create");
        setTaskEditorTaskId(null);
        setPendingTaskEditorRestore(null);
        saveProfile(DEFAULT_PROFILE);
      }
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED" || event === "PASSWORD_RECOVERY") {
        setActiveProfileUserId(nextSession?.user.id ?? null);
        setIsAuthResolved(true);
        setSession((currentSession) => {
          if (
            currentSession?.access_token === nextSession?.access_token
            && currentSession?.user.id === nextSession?.user.id
          ) {
            return currentSession;
          }
          return nextSession;
        });
      }
    });

    return () => {
      window.removeEventListener("unhandledrejection", handleSessionLockRejection);
      unsubscribe();
    };
  }, [isAuthResolved, supabase]);

  useEffect(() => {
    if (!message || message.tone !== "good") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setMessage((current) => (current === message ? null : current));
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  useEffect(() => {
    if (!message) {
      return;
    }

    const messageKey = `${message.tone}:${message.text}`;
    if (lastHudNotificationMessageRef.current === messageKey) {
      return;
    }
    lastHudNotificationMessageRef.current = messageKey;

    const nextItem: HudNotificationItem = {
      detail: message.text,
      id: `message-${Date.now()}`,
      title: message.tone === "good" ? "Update saved" : message.tone === "warn" ? "Needs attention" : "Task update",
      tone: message.tone === "good" ? "success" : message.tone === "warn" ? "warning" : "neutral",
    };
    setHudNotificationEvents((current) => [nextItem, ...current].slice(0, 8));
  }, [message]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleScroll = () => {
      const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
      const hasMeaningfulPageScroll = documentHeight > 300;
      setShowBackToTop(hasMeaningfulPageScroll && window.scrollY > 300);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!isListColumnMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-list-columns-menu]") && !listColumnMenuRef.current?.contains(event.target as Node)) {
        setIsListColumnMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isListColumnMenuOpen]);

  useEffect(() => {
    if (!isKeyboardShortcutsMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-keyboard-shortcuts-menu]") && !keyboardShortcutsMenuRef.current?.contains(event.target as Node)) {
        setIsKeyboardShortcutsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isKeyboardShortcutsMenuOpen]);

  useEffect(() => {
    if (selectedGridWidgetId && !taskGridLayout.some((item) => item.id === selectedGridWidgetId)) {
      setSelectedGridWidgetId(null);
    }
  }, [selectedGridWidgetId, taskGridLayout]);

  useEffect(() => {
    if (isWorkspaceLoading || !taskEditorTaskId || taskEditorMode !== "edit") {
      return;
    }

    if (!tasks.some((task) => task.id === taskEditorTaskId)) {
      setTaskEditorTaskId(null);
      setIsTaskEditorOpen(false);
      setTaskEditorMode("create");
    }
  }, [isWorkspaceLoading, taskEditorMode, taskEditorTaskId, tasks]);

  useEffect(() => {
    if (!pendingTaskEditorRestore || isWorkspaceLoading) {
      return;
    }

    if (!pendingTaskEditorRestore.isOpen) {
      setIsTaskEditorOpen(false);
      setTaskEditorMode("create");
      setTaskEditorTaskId(null);
      setPendingTaskEditorRestore(null);
      return;
    }

    if (pendingTaskEditorRestore.mode === "edit") {
      if (!pendingTaskEditorRestore.taskId || !tasks.some((task) => task.id === pendingTaskEditorRestore.taskId)) {
        setPendingTaskEditorRestore(null);
        return;
      }
    }

    setTaskEditorMode(pendingTaskEditorRestore.mode);
    setTaskEditorTaskId(pendingTaskEditorRestore.taskId);
    setIsTaskEditorOpen(true);
    setPendingTaskEditorRestore(null);
  }, [isWorkspaceLoading, pendingTaskEditorRestore, tasks]);

  useEffect(() => {
    if (!session?.user?.id) {
      profileSettingsHydratedRef.current = false;
      return;
    }

    if (!supabase || !profileSettingsHydratedRef.current) {
      return;
    }

    void supabase
      .from("adhdice_user_profiles")
      .upsert({
        user_id: session.user.id,
        accent_color: accentColor,
        day_start_time: dayStartTime,
        timezone: userTimeZone,
        focus_alarm_enabled: focusAlarmEnabled,
        focus_alarm_interval_minutes: focusAlarmIntervalMinutes,
        low_stim_mode: lowStim,
        theme_preference: theme,
      });
  }, [accentColor, dayStartTime, focusAlarmEnabled, focusAlarmIntervalMinutes, lowStim, session?.user?.id, supabase, theme, userTimeZone]);

  useEffect(() => {
    saveLogicalDaySettings({ dayStartTime, timezone: userTimeZone });
  }, [dayStartTime, userTimeZone]);

  useEffect(() => {
    if (typeof window === "undefined" || isRestoringPersistedUiState) {
      return;
    }
    const requestedTaskId = new URLSearchParams(window.location.search).get(OPEN_TASK_QUERY_PARAM);
    if (!requestedTaskId) {
      return;
    }
    const nextTaskWorkspaceTabId = taskWorkspaceTabsState.tabs.find((tab) => !isReportTaskWorkspaceTab(tab))?.id
      ?? taskWorkspaceTabsState.activeTabId;
    setActivePage("Tasks");
    setActiveTaskWorkspaceTab(nextTaskWorkspaceTabId);
    setTaskUiState((current) => (
      current.tasksSurface === "tasks"
        ? current
        : { ...current, tasksSurface: "tasks" }
    ));
    setSuppressDetachedListNoticeTaskId(null);
    setRequestedListOverlayTaskId(requestedTaskId);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete(OPEN_TASK_QUERY_PARAM);
    window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  }, [isRestoringPersistedUiState, setActivePage, setActiveTaskWorkspaceTab, setTaskUiState, taskWorkspaceTabsState.activeTabId, taskWorkspaceTabsState.tabs]);

  useEffect(() => {
    focusAlarmAudioRef.current = new Audio(withBasePath("/calm-alarm.wav"));
    return () => {
      focusAlarmAudioRef.current?.pause();
      focusAlarmAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const userId = session?.user?.id ?? null;
    if (!userId || !profileSettingsHydratedRef.current) {
      focusAlarmHydratedUserIdRef.current = null;
      focusAlarmPreviousSettingsRef.current = null;
      return;
    }

    if (focusAlarmHydratedUserIdRef.current === userId) {
      return;
    }

    const now = Date.now();
    const persistedState = readPersistedFocusAlarmState(userId);
    const normalizedNextRingAt = focusAlarmEnabled
      ? normalizeFocusAlarmNextRingAt(
          persistedState?.enabled
            && persistedState.intervalMinutes === focusAlarmIntervalMinutes
            ? persistedState.nextRingAt
            : null,
          now,
          focusAlarmIntervalMinutes,
        )
      : null;

    focusAlarmSkipNextPersistRef.current = true;
    setFocusAlarmNextRingAt(normalizedNextRingAt);
    focusAlarmHydratedUserIdRef.current = userId;
    focusAlarmPreviousSettingsRef.current = {
      enabled: focusAlarmEnabled,
      intervalMinutes: focusAlarmIntervalMinutes,
    };
  }, [focusAlarmEnabled, focusAlarmIntervalMinutes, session?.user?.id]);

  useEffect(() => {
    const userId = session?.user?.id ?? null;
    if (!userId || focusAlarmHydratedUserIdRef.current !== userId) {
      return;
    }

    const previousSettings = focusAlarmPreviousSettingsRef.current;
    if (!previousSettings) {
      focusAlarmPreviousSettingsRef.current = {
        enabled: focusAlarmEnabled,
        intervalMinutes: focusAlarmIntervalMinutes,
      };
      return;
    }

    const settingsChanged = previousSettings.enabled !== focusAlarmEnabled
      || previousSettings.intervalMinutes !== focusAlarmIntervalMinutes;

    if (!settingsChanged) {
      return;
    }

    const now = Date.now();
    const persistedState = readPersistedFocusAlarmState(userId);
    const restoredNextRingAt = persistedState?.enabled
      && persistedState.intervalMinutes === focusAlarmIntervalMinutes
      ? persistedState.nextRingAt
      : null;
    setFocusAlarmNextRingAt(
      focusAlarmEnabled
        ? normalizeFocusAlarmNextRingAt(restoredNextRingAt, now, focusAlarmIntervalMinutes)
        : null,
    );
    focusAlarmPreviousSettingsRef.current = {
      enabled: focusAlarmEnabled,
      intervalMinutes: focusAlarmIntervalMinutes,
    };
  }, [focusAlarmEnabled, focusAlarmIntervalMinutes, session?.user?.id]);

  useEffect(() => {
    const userId = session?.user?.id ?? null;
    if (!userId || focusAlarmHydratedUserIdRef.current !== userId) {
      return;
    }

    if (focusAlarmSkipNextPersistRef.current) {
      focusAlarmSkipNextPersistRef.current = false;
      return;
    }

    const persistedState: PersistedFocusAlarmState = {
      enabled: focusAlarmEnabled,
      intervalMinutes: focusAlarmIntervalMinutes,
      nextRingAt: focusAlarmEnabled ? focusAlarmNextRingAt : null,
    };

    writePersistedFocusAlarmState(userId, persistedState);

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== getFocusAlarmStorageKey(userId) || !event.newValue) {
        return;
      }

      try {
        const parsed = JSON.parse(event.newValue) as PersistedFocusAlarmState;
        const nextEnabled = parsed.enabled === true;
        const nextIntervalMinutes = clampFocusAlarmInterval(parsed.intervalMinutes);
        const now = Date.now();
        setFocusAlarmEnabled(nextEnabled);
        setFocusAlarmIntervalMinutes(nextIntervalMinutes);
        setFocusAlarmNextRingAt(
          nextEnabled
            ? normalizeFocusAlarmNextRingAt(parsed.nextRingAt, now, nextIntervalMinutes)
            : null,
        );
        focusAlarmPreviousSettingsRef.current = {
          enabled: nextEnabled,
          intervalMinutes: nextIntervalMinutes,
        };
      } catch {
        // Ignore malformed cross-tab sync payloads.
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [focusAlarmEnabled, focusAlarmIntervalMinutes, focusAlarmNextRingAt, session?.user?.id]);

  useEffect(() => {
    if (!focusAlarmEnabled || focusAlarmNextRingAt === null) {
      return;
    }

    const delay = Math.max(0, focusAlarmNextRingAt - Date.now());
    const timeout = window.setTimeout(() => {
      const now = Date.now();
      void playFocusAlarmSound();
      setMessage({ tone: "neutral", text: "Focus alarm. Time to switch tasks or check in." });
      setFocusAlarmNextRingAt(now + focusAlarmIntervalMinutes * 60_000);
    }, Math.min(delay, 2_147_483_647));

    return () => window.clearTimeout(timeout);
  }, [focusAlarmEnabled, focusAlarmIntervalMinutes, focusAlarmNextRingAt]);

  const milestoneLocalDate = useMemo(
    () => formatDateKeyInTimeZone(new Date(logicalDayNow), userTimeZone),
    [logicalDayNow, userTimeZone],
  );
  const nextTaskStateHistory = taskHistory;
  const taskStateHistoryContentRevision = createProjectionDomainRevision("task-state-history", nextTaskStateHistory);
  const [stabilizeTaskStateHistory] = useState(() => {
    let cached = { revision: "", value: nextTaskStateHistory };
    return (revision: string, value: typeof nextTaskStateHistory) => {
      if (cached.revision !== revision) cached = { revision, value };
      return cached.value;
    };
  });
  const taskStateHistory = stabilizeTaskStateHistory(taskStateHistoryContentRevision, nextTaskStateHistory);
  const rolloverInputsRef = useRef({
    dayStartTime,
    isTaskHistoryLoaded,
    isTasksReady: !isWorkspaceLoading,
    taskHistory: taskStateHistory,
    tasks,
    todayKey,
    userTimeZone,
  });
  rolloverInputsRef.current = { dayStartTime, isTaskHistoryLoaded, isTasksReady: !isWorkspaceLoading, taskHistory: taskStateHistory, tasks, todayKey, userTimeZone };
  const wasDocumentVisibleRef = useRef(typeof document === "undefined" || document.visibilityState === "visible");

  useEffect(() => {
    taskRolloverCoordinator.setOwner(supabase, session?.user?.id ?? null);
  }, [session?.user?.id, supabase]);

  const runDayReset = useCallback(async (source: "initial_load" | "visibility" | "pageshow" | "timer") => {
    if (source !== "initial_load") await prepareTaskMutation();
    const inputs = rolloverInputsRef.current;
    const client = supabase;
    const userId = session?.user?.id;
    if (!client || !userId) return;
    // The canonical plan is authoritative only after both independently loaded inputs exist.
    if (!inputs.isTasksReady || !inputs.isTaskHistoryLoaded) return;
    const rolloverSettingsKey = createTaskRolloverSettingsKey({
      logicalDayKey: inputs.todayKey,
      rolloverTime: inputs.dayStartTime,
      timezone: inputs.userTimeZone,
      userId,
    });
    if (typeof window !== "undefined" && !shouldAttemptTaskRollover(window.localStorage, rolloverSettingsKey, userId)) return;
    const diagnosticsEnabled = process.env.NODE_ENV === "development"
      && typeof window !== "undefined"
      && (window as Window & { __ADHDICE_TASK_STATE_ROLLOVER_DIAGNOSTICS_ENABLED__?: boolean })
        .__ADHDICE_TASK_STATE_ROLLOVER_DIAGNOSTICS_ENABLED__ === true;
    let didMutate = false;
    const authority = "canonical" as const;
    let tasksEvaluated = 0;
    let plannedTaskPatches = 0;
    let committedTaskPatches = 0;
    let remainingTaskPatchSummaries: ReturnType<typeof createEngineRolloverPlan>["remainingPatchSummaries"] = [];
    const startedAt = performance.now();
    await taskRolloverCoordinator.run({
      client,
      logicalDayKey: rolloverSettingsKey,
      userId,
      execute: async ({ settledTaskIds }) => {
        const rolloverTasks = inputs.tasks.filter((candidate) => candidate.status !== "archived" && candidate.status !== "trashed");
        const rolloverTaskIds = rolloverTasks.map((candidate) => candidate.id);
        const scopedRolloverHistory = await fetchTaskHistoryForRollover(rolloverTaskIds);
        const historyLoadFailureTaskId = rolloverTaskIds.find((taskId) => {
            const result = scopedRolloverHistory[taskId];
            return !result || result.status !== "ready";
        });
        if (historyLoadFailureTaskId) {
            const historyLoadFailure = scopedRolloverHistory[historyLoadFailureTaskId];
            return { error: { message: historyLoadFailure?.status === "error" ? historyLoadFailure.error : "Could not load task history for canonical rollover." } };
        }
        const rolloverHistory = deduplicateTaskHistoryByLogicalDate([
            ...inputs.taskHistory,
            ...Object.values(scopedRolloverHistory).flatMap((result) => result.status === "ready" ? result.history : []),
        ]);
        const plan = createEngineRolloverPlan({
            allowCanonicalAutomaticMissed: true,
            history: rolloverHistory,
            includeDiagnostics: diagnosticsEnabled,
            now: new Date(),
            rolloverTime: inputs.dayStartTime,
            tasks: rolloverTasks,
            timezone: inputs.userTimeZone,
        });
        const taskById = new Map(rolloverTasks.map((task) => [task.id, task]));
        const mutationCandidates = engineRolloverPlanTaskMutationCandidates(plan, rolloverTasks);
        tasksEvaluated = plan.tasksEvaluated;
        plannedTaskPatches = mutationCandidates.length;
        remainingTaskPatchSummaries = plan.remainingPatchSummaries;
        let canonicalCommitted = 0;
        let canonicalFailures = 0;
        const settledTaskIdsThisRun: string[] = [];
        for (const candidate of mutationCandidates) {
            if (settledTaskIds.has(candidate.taskId)) continue;
            const task = taskById.get(candidate.taskId);
            if (!task) {
              canonicalFailures += 1;
              continue;
            }
            const canonicalRevision = (task as Partial<TaskStateRuntimeLocalTask>).canonical_revision;
            if (typeof canonicalRevision !== "number" || !Number.isInteger(canonicalRevision) || canonicalRevision < 1) {
              canonicalFailures += 1;
              continue;
            }
            const committed = await updateTask(task.id, {}, {
              canonicalIntent: { type: "reconcile_rollover" } satisfies TaskStateRuntimeCanonicalIntent,
              expectedTask: task,
              replayIdentity: createTaskRolloverReplayIdentity({
                canonicalRevision,
                logicalDayKey: rolloverSettingsKey,
                patch: candidate.patch,
                taskId: task.id,
              }),
            });
            if (committed) {
              canonicalCommitted += 1;
              settledTaskIdsThisRun.push(candidate.taskId);
            }
            else canonicalFailures += 1;
        }
        committedTaskPatches = canonicalCommitted;
        didMutate = canonicalCommitted > 0;
        return {
            error: canonicalFailures > 0 ? { message: `${canonicalFailures} Task State rollover command${canonicalFailures === 1 ? "" : "s"} failed.` } : null,
            settledTaskIds: settledTaskIdsThisRun,
        };
      },
      onOwnedSettled: async ({ error, settledTaskIds = [] }) => {
        const diagnostics = {
          authority, errorSummary: error?.message ?? null,
          executionMs: Math.round(performance.now() - startedAt), lastLogicalDateEvaluated: inputs.todayKey, lastRunSource: source,
          plannedTaskPatches,
          remainingTaskPatchSummaries,
          committedTaskPatches: error && settledTaskIds.length === 0 ? 0 : committedTaskPatches,
          tasksEvaluated,
        };
        if (!error && typeof window !== "undefined") {
          persistProcessedTaskRolloverKey(window.localStorage, rolloverSettingsKey, userId);
        }
        if (diagnosticsEnabled && typeof window !== "undefined") {
          (window as Window & { __ADHDICE_TASK_STATE_ROLLOVER_DIAGNOSTICS__?: typeof diagnostics }).__ADHDICE_TASK_STATE_ROLLOVER_DIAGNOSTICS__ = diagnostics;
          console.info(`[rollover] Remaining task patch summary count=${remainingTaskPatchSummaries.length}`);
          if (remainingTaskPatchSummaries.length > 0) {
            console.info("[rollover] Remaining task patch summaries", JSON.stringify(remainingTaskPatchSummaries));
          }
        }
        if (error) setMessage((previous) => previous ?? { tone: "warn", text: error.message });
        if (!didMutate) return;
        if (diagnosticsEnabled) console.info("[rollover] Rollover completed; requesting targeted workspace reconciliation.");
        await reconcileRolloverWorkspace();
      },
    });
  }, [fetchTaskHistoryForRollover, prepareTaskMutation, reconcileRolloverWorkspace, session?.user?.id, supabase]);

  useEffect(() => {
    const client = supabase;
    if (!client || !session?.user) return;
    void runDayReset("initial_load");
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === "visible";
      const wasVisible = wasDocumentVisibleRef.current;
      wasDocumentVisibleRef.current = isVisible;
      if (!wasVisible && isVisible) {
        void runDayReset("visibility");
      }
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void runDayReset("pageshow");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    const intervalId = window.setInterval(() => { void runDayReset("timer"); }, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.clearInterval(intervalId);
    };
  }, [isTaskHistoryLoaded, runDayReset, session?.user?.id, supabase]);
  const taskSubtasksByTaskId = useMemo(() => groupTaskSubtasksByTaskId(tasks), [tasks]);
  const rawTaskSubtasksByTaskId = taskSubtasksByTaskId;
  const hasStepsByTaskId = useMemo(
    () => {
      const sameTableChildrenByParentId = buildTaskHierarchyAdapter(tasks).childrenByParentId;
      return tasks.reduce<Record<string, boolean>>((accumulator, task) => {
        const sameTableStepCount = sameTableChildrenByParentId.get(task.id)?.length ?? 0;
        accumulator[task.id] = (taskSubtasksByTaskId[task.id]?.length ?? 0) > 0 || sameTableStepCount > 0;
        return accumulator;
      }, {});
    },
    [taskSubtasksByTaskId, tasks],
  );
  const taskHistoryStats = useMemo(() => computeTaskHistoryStats(taskHistory, todayKey), [taskHistory, todayKey]);
  const { saveFocusSelection } = useFocusSelectionPersistence({
    currentUserId,
    defaultValidTaskIds: tasks,
    setFocusedTaskIdsByDate,
    setMessage,
    supabase,
    todayKey,
  });
  const focusedTaskIds = focusedTaskIdsByDate[todayKey] ?? EMPTY_TASK_IDS;
  const focusedTaskIdsRef = useRef(focusedTaskIds);
  focusedTaskIdsRef.current = focusedTaskIds;
  const focusedTaskIdSet = useMemo(() => new Set(focusedTaskIds), [focusedTaskIds]);
  const milestonePromotionTaskIds = useMemo(
    () => new Set(tasks.filter((task) => canPromoteTaskToMilestone(task, milestoneData.milestoneByTaskId)).map((task) => task.id)),
    [milestoneData.milestoneByTaskId, tasks],
  );
  const milestoneDetachPromotionTaskIds = useMemo(
    () => new Set(tasks.filter((task) => canDetachAndPromoteTaskToMilestone(task, milestoneData.milestoneByTaskId)).map((task) => task.id)),
    [milestoneData.milestoneByTaskId, tasks],
  );
  const toggleFocusTodayForTask = useCallback((taskId: string) => {
    if (focusedTaskIds.includes(taskId)) {
      void saveFocusSelection(focusedTaskIds.filter((id) => id !== taskId));
      return;
    }
    void saveFocusSelection([...focusedTaskIds, taskId]);
  }, [focusedTaskIds, saveFocusSelection]);
  const builtInTaskLists = useMemo(() => getBuiltInTaskLists(), []);
  const availableTaskLists = useMemo(() => {
    const byId = new Map<TaskListId, TaskListDefinition>();
    for (const list of builtInTaskLists) {
      byId.set(list.id, list);
    }
    for (const list of taskLists) {
      if (list.id === "routine" || list.id === "milestones") {
        continue;
      }
      byId.set(list.id, list);
    }
    return Array.from(byId.values()).sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  }, [builtInTaskLists, taskLists]);
  const taskListRailManifest = useMemo(
    () => buildTaskListRailManifest(availableTaskLists, taskListFolders),
    [availableTaskLists, taskListFolders],
  );
  const taskListRailManifestFingerprint = useMemo(
    () => JSON.stringify(taskListRailManifest),
    [taskListRailManifest],
  );
  const reconciledTaskListRailManifestRef = useRef<string | null>(null);
  useEffect(() => {
    const userId = session?.user?.id;
    if (!supabase || !userId || reconciledTaskListRailManifestRef.current === taskListRailManifestFingerprint) return;
    reconciledTaskListRailManifestRef.current = taskListRailManifestFingerprint;
    void reconcileTaskListRailPlacements(supabase, taskListRailManifest).then(
      (items) => setTaskListRailItems(items),
      (error) => {
        reconciledTaskListRailManifestRef.current = null;
        setMessage({ tone: "warn", text: error instanceof Error ? error.message : "List organization could not be loaded." });
      },
    );
  }, [session?.user?.id, supabase, taskListRailManifest, taskListRailManifestFingerprint]);
  const canonicalTaskListRailTree = useMemo(
    () => buildCanonicalTaskListRailTree(
      availableTaskLists,
      taskListFolders,
      taskListRailItems,
      session?.user?.id ?? "",
    ),
    [availableTaskLists, session?.user?.id, taskListFolders, taskListRailItems],
  );
  const taskListFolderTree = useMemo(
    () => buildTaskListFolderTree(taskListFolders, availableTaskLists),
    [availableTaskLists, taskListFolders],
  );
  const taskListFolderBreadcrumbs = useMemo(
    () => buildTaskListFolderBreadcrumbs(taskListFolderTree, currentFolderId),
    [currentFolderId, taskListFolderTree],
  );
  useEffect(() => {
    const resolvedFolderId = resolveCurrentTaskListFolder(
      currentFolderId,
      previousTaskListFoldersRef.current,
      taskListFolderTree,
    );
    previousTaskListFoldersRef.current = taskListFolders;
    if (resolvedFolderId === currentFolderId) return;
    const timeoutId = window.setTimeout(() => setCurrentFolderId(resolvedFolderId), 0);
    return () => window.clearTimeout(timeoutId);
  }, [currentFolderId, taskListFolderTree, taskListFolders]);
  const taskListFolderActions = useTaskListFolderActions({
    client: supabase as NonNullable<ReturnType<typeof createBrowserSupabaseClient>> | null,
    containers: taskListContainers,
    folders: taskListFolders,
    lists: availableTaskLists,
    placements: taskListRailItems,
    refresh: softRefreshWorkspace,
    setMessage,
  });
  const compatibilityRoutingMemberships = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(taskRouting).map(([taskId, route]) => [taskId, route as BuiltInTaskListId]),
      ) as Record<string, BuiltInTaskListId | undefined>,
    [taskRouting],
  );
  const manualMembershipsByTaskId = useMemo(
    () => buildManualMembershipMap(taskListManualMemberships, compatibilityRoutingMemberships),
    [compatibilityRoutingMemberships, taskListManualMemberships],
  );
  const taskHistoryByTaskId = sharedTaskHistoryByTaskId;
  const taskHistoryFactsByTaskId = useMemo(
    () => Object.fromEntries(
      tasks.map((task) => [
        task.id,
        (() => {
          const facts = buildTaskHistoryFacts(taskHistoryByTaskId[task.id] ?? [], todayKey);
          const summary = taskHistoryStreakSummaries[task.id];
          return {
            ...facts,
            currentCompletedStreak: summary?.currentStreak ?? 0,
            currentMissedStreak: summary?.missedStreak ?? 0,
          };
        })(),
      ]),
    ),
    [taskHistoryByTaskId, taskHistoryStreakSummaries, tasks, todayKey],
  );
  const currentStreakByTaskId = useMemo(
    () => Object.fromEntries(
      tasks.map((task) => [
        task.id,
        taskHistoryStreakSummaries[task.id]?.currentStreak ?? 0,
      ]),
    ),
    [taskHistoryStreakSummaries, tasks],
  );
  const taskDomainRevision = useMemo(
    () => createProjectionDomainRevision("tasks", tasks),
    [tasks],
  );
  const taskHistoryRevision = useMemo(
    () => createProjectionDomainRevision("task-history-authoritative", taskHistoryByTaskId),
    [taskHistoryByTaskId],
  );
  const taskHistoryStreakSummaryRevision = useMemo(
    () => createProjectionDomainRevision("task-history-streak-summary", taskHistoryStreakSummaries),
    [taskHistoryStreakSummaries],
  );
  const persistedTaskDisplayStatusByTaskId = useMemo(
    () => Object.fromEntries(tasks.map((task) => [task.id, task.status])),
    [tasks],
  );
  const taskHistoryReadinessRevision = useMemo(
    () => createProjectionDomainRevision("task-history-readiness", isTaskHistoryLoaded),
    [isTaskHistoryLoaded],
  );
  const taskStatusSettingsRevision = useMemo(
    () => createProjectionDomainRevision("task-status-settings", {
      dayStartTime,
      timezone: userTimeZone,
      todayKey,
    }),
    [dayStartTime, todayKey, userTimeZone],
  );
  const [projectionCache] = useState(createStableTaskProjectionCache);
  const activeStatusInputRevision = combineProjectionRevisions(
    taskDomainRevision,
    taskHistoryRevision,
    taskStatusSettingsRevision,
    taskHistoryReadinessRevision,
  );
  const activeStatusRead = useMemo(
    () => {
      if (!isTaskHistoryLoaded) return null;
      return projectionCache.getOrCreate("active-status", activeStatusInputRevision, () => resolveActiveTaskStatuses({
        historyByTaskId: taskHistoryByTaskId,
        logicalDayRollover: dayStartTime,
        now: new Date(logicalDayNow),
        tasks,
        timezone: userTimeZone,
      }));
    },
    // Status evaluation is logical-day based. The minute clock must not clone
    // or replace the canonical Task collection while the logical day is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeStatusInputRevision, isTaskHistoryLoaded, projectionCache],
  );
  const taskDisplayStatusByTaskId = activeStatusRead?.statusesByTaskId ?? persistedTaskDisplayStatusByTaskId;
  const activeStatusRevision = useMemo(
    () => createProjectionDomainRevision("active-status", taskDisplayStatusByTaskId),
    [taskDisplayStatusByTaskId],
  );
  const canonicalEntityRevision = combineProjectionRevisions(taskDomainRevision, activeStatusRevision);
  const tasksForActiveStatusRead = useMemo(
    () => projectionCache.getOrCreate(
      "canonical-entities",
      canonicalEntityRevision,
      () => projectTasksForActiveStatusRead(tasks, taskDisplayStatusByTaskId),
    ),
    // Equivalent Task/status revisions deliberately retain canonical entity identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canonicalEntityRevision, projectionCache],
  );
  useEffect(() => {
    if (isTaskHistoryLoaded && activeStatusRead && process.env.NODE_ENV === "development" && typeof window !== "undefined") {
      window.__ADHDICE_TASK_STATE_ACTIVE_STATUS_AUTHORITY__ = activeStatusRead.authority;
    }
  }, [activeStatusRead, isTaskHistoryLoaded]);
  const client = supabase as NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
  const runGuardedTaskRowUpdate = useCallback(async (
    taskId: string,
    values: TaskUpdate,
    options?: TaskRowUpdateOptions,
  ) => {
    const refreshedBeforeMutation = await prepareTaskMutation();
    let nextOptions = options;

    if (refreshedBeforeMutation) {
      const latestTaskResult = await client
        .from("adhdice_clean_tasks")
        .select("*")
        .eq("id", taskId)
        .is("permanently_deleted_at", null)
        .maybeSingle();

      if (!latestTaskResult.error) {
        nextOptions = {
          ...options,
          expectedTask: latestTaskResult.data ?? null,
        };
      }
    }

    return updateTaskRowWithLegacyEnergyFallback(
      client,
      taskId,
      values,
      isMissingTaskActualSecondsColumnError,
      isMissingTaskEnergyNoneEnumError,
      nextOptions,
    );
  }, [client, prepareTaskMutation]);
  const currentUserIdText = session?.user?.id ?? "";
  const loadTaskCalendarOverridesForTask = useCallback(async (taskId: string) => {
    if (!currentUserIdText) return null;
    const result = await client
      .from("adhdice_task_calendar_overrides")
      .select("*")
      .eq("user_id", currentUserIdText)
      .eq("entity_id", taskId)
      .eq("is_active", true)
      .order("logical_date", { ascending: false });
    if (result.error) {
      setMessage({ tone: "warn", text: result.error.message ?? "Could not refresh the task Calendar overrides." });
      return null;
    }
    const activeOverrides = (result.data ?? []).map((row) => {
      const override = row as CanonicalTaskCalendarOverride;
      return {
        id: override.id,
        logicalDate: override.logical_date,
        overrideState: override.override_state,
        revision: override.revision,
        source: override.source,
        provenance: override.provenance_kind,
        createdAt: override.created_at,
      } satisfies TaskCalendarOverride;
    });
    setTaskCalendarOverridesByTaskId((current) => ({ ...current, [taskId]: activeOverrides }));
    return activeOverrides;
  }, [client, currentUserIdText, setMessage]);
  const {
    handleAddGridWidget,
    handleDropGridWidget,
    handleMoveGridWidget,
    handleRemoveGridWidget,
    handleResetGridLayout,
    handleResizeGridWidget,
  } = useTaskGridLayoutController({
    currentUserId: currentUserIdText,
    draggedGridWidgetId,
    isWidgetType: isTaskGridWidgetType,
    maxColumns: TASK_GRID_MAX_COLUMNS,
    maxDisplayRows: TASK_GRID_MAX_DISPLAY_ROWS,
    setDraggedGridWidgetId,
    setMessage,
    setSelectedGridWidgetId,
    setTaskGridLayout,
    starterLayout: TASK_GRID_STARTER_LAYOUT,
    supabase: client,
    taskGridLayout,
  });
  const taskListEvaluationContext = useMemo<TaskListEvaluationContext>(() => ({
    activeMilestoneTaskIds: milestoneData.activeMilestoneTaskIds,
    milestoneTaskIds: milestoneData.milestoneTaskIds,
    currentStreakByTaskId,
    focusedTaskIds: focusedTaskIdSet,
    hasStepsByTaskId,
    isDueToday: (date) => date === todayKey,
    isDueTomorrow: (date) => date === shiftDateKey(todayKey, 1),
    isLater: (date) => Boolean(date && date > shiftDateKey(todayKey, 1)),
    isOpen: isTaskOpen,
    isOverdue: (date) => Boolean(date && date < todayKey),
    isTaskHistoryLoaded,
    historyFactsByTaskId: taskHistoryFactsByTaskId,
    manualMembershipsByTaskId,
    taskDisplayStatusByTaskId,
    taskHistoryByTaskId,
    todayDateKey: todayKey,
  }), [currentStreakByTaskId, focusedTaskIdSet, hasStepsByTaskId, isTaskHistoryLoaded, manualMembershipsByTaskId, milestoneData.activeMilestoneTaskIds, milestoneData.milestoneTaskIds, taskDisplayStatusByTaskId, taskHistoryByTaskId, taskHistoryFactsByTaskId, todayKey]);
  const parsedTaskSearch = useMemo(
    () => parseTaskSearchInput(taskUiState.search, taskUiState.duplicateTitleMode),
    [taskUiState.duplicateTitleMode, taskUiState.search],
  );
  const effectiveSearchQuery = parsedTaskSearch.cleanedQuery;
  const duplicateTitleModeActive = parsedTaskSearch.duplicateTitleMode;
  const taskUiStateForDerivedData = useMemo(() => ({
    duplicateTitleMode: duplicateTitleModeActive,
    energyFilters: taskUiState.energyFilters,
    includeStepsByView: taskUiState.includeStepsByView,
    matchAny: taskUiState.matchAny,
    quickFilters: taskUiState.quickFilters,
    selectedBucket: taskUiState.selectedBucket,
    statusFilters: taskUiState.statusFilters,
    tableColumnFilters: taskUiState.tableColumnFilters,
    view: taskUiState.view,
  }), [
    duplicateTitleModeActive,
    taskUiState.energyFilters,
    taskUiState.includeStepsByView,
    taskUiState.matchAny,
    taskUiState.quickFilters,
    taskUiState.selectedBucket,
    taskUiState.statusFilters,
    taskUiState.tableColumnFilters,
    taskUiState.view,
  ]);
  const bucketContext = useMemo(() => ({
    focusedTaskIds: focusedTaskIdSet,
    routing: taskRouting,
    todayDateKey: todayKey,
  }), [focusedTaskIdSet, taskRouting, todayKey]);
  const listMembershipRevision = useMemo(
    () => createProjectionDomainRevision("lists-memberships", {
      lists: availableTaskLists,
      manualMembershipsByTaskId,
      taskSubtasksByTaskId,
    }),
    [availableTaskLists, manualMembershipsByTaskId, taskSubtasksByTaskId],
  );
  const statusSettingsRevision = useMemo(
    () => createProjectionDomainRevision("status-settings", {
      focusedTaskIds,
      taskStatusSettingsRevision,
    }),
    [focusedTaskIds, taskStatusSettingsRevision],
  );
  const milestoneProjectionRevision = useMemo(
    () => createProjectionDomainRevision("milestones", {
      searchTokens: Array.from(milestoneData.milestoneSearchTokensByTaskId.entries()),
      taskIds: Array.from(milestoneData.milestoneTaskIds).sort(),
    }),
    [milestoneData.milestoneSearchTokensByTaskId, milestoneData.milestoneTaskIds],
  );
  const hierarchyStatusRevision = combineProjectionRevisions(
    taskDomainRevision,
    taskHistoryRevision,
    taskHistoryStreakSummaryRevision,
    statusSettingsRevision,
    activeStatusRevision,
    taskHistoryReadinessRevision,
  );
  const canonicalIndexRevision = combineProjectionRevisions(
    hierarchyStatusRevision,
    listMembershipRevision,
    milestoneProjectionRevision,
  );
  const [structuralDiagnosticTracker] = useState(() => createDevelopmentComputationTracker("task structural projection", "TaskApp"));
  const [canonicalDiagnosticTracker] = useState(() => createDevelopmentComputationTracker("stable canonical task index", "TaskApp"));
  const [derivedDiagnosticTracker] = useState(() => createDevelopmentComputationTracker("complete task derivation", "TaskApp"));
  const taskAppStructuralData = useMemo(
    () => projectionCache.getOrCreate("hierarchy-status", hierarchyStatusRevision, () => {
      const diagnostic = process.env.NODE_ENV === "development" ? structuralDiagnosticTracker.capture({
        activePage,
        dependencies: { activeStatusRevision, statusSettingsRevision, taskDomainRevision, taskHistoryRevision, taskHistoryStreakSummaryRevision },
        revisionSources: {
          history: { taskHistoryRevision, taskHistoryStreakSummaryRevision },
          list: {},
          settings: { statusSettingsRevision },
          task: { activeStatusRevision, taskDomainRevision },
        },
      }) : undefined;
      return buildTaskAppStructuralData({
        diagnosticDetails: diagnostic,
        focusedTaskIds,
        taskHistoryByTaskId,
        taskHistoryStreakSummaryByTaskId: taskHistoryStreakSummaries,
        taskDisplayStatusByTaskId,
        tasks: tasksForActiveStatusRead,
        todayDateKey: todayKey,
      });
    }),
    // activePage is diagnostic context, not a projection invalidator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hierarchyStatusRevision, projectionCache],
  );
  const stableCanonicalTaskIndex = useMemo(
    () => projectionCache.getOrCreate("memberships-search", canonicalIndexRevision, () => {
      const diagnostic = process.env.NODE_ENV === "development" ? canonicalDiagnosticTracker.capture({
        activePage,
        dependencies: { hierarchyStatusRevision, listMembershipRevision, milestoneProjectionRevision },
        revisionSources: {
          history: { taskHistoryRevision },
          list: { listMembershipRevision },
          settings: { milestoneProjectionRevision, statusSettingsRevision },
          task: { activeStatusRevision, taskDomainRevision },
        },
      }) : undefined;
      const result = buildStableCanonicalTaskIndex({
        availableTaskLists,
        diagnosticDetails: diagnostic,
        focusedTaskIds,
        hierarchy: taskAppStructuralData.hierarchy,
        milestoneSearchTokensByTaskId: milestoneData.milestoneSearchTokensByTaskId,
        taskHistoryByTaskId,
        taskListEvaluationContext,
        taskSubtasksByTaskId,
        taskDisplayStatusByTaskId,
        tasks: tasksForActiveStatusRead,
        todayDateKey: todayKey,
      });
      return result;
    }),
    // Equivalent domain revisions intentionally reuse the prior payload even
    // when hydration supplies newly allocated arrays and objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canonicalIndexRevision, projectionCache, taskAppStructuralData],
  );
  const stableTaskSearchScope = useMemo(() => buildStableTaskSearchScope(
    Array.from(stableCanonicalTaskIndex.entityFactsById.values()).map((fact) => ({
      ancestorIds: fact.ancestorIds,
      displayStatus: fact.displayStatus,
      id: fact.id,
      listIds: fact.listMemberships.map((membership) => membership.id),
      rootParentId: fact.rootParentId,
      searchDocument: fact.searchDocument,
      task: fact.task,
    })),
    {
      energyFilters: taskUiStateForDerivedData.energyFilters,
      focusedTaskIds,
      listNameById: stableCanonicalTaskIndex.listNameById,
      matchAny: taskUiStateForDerivedData.matchAny,
      quickFilters: taskUiStateForDerivedData.quickFilters,
      selectedBucket: taskUiStateForDerivedData.selectedBucket,
      statusFilters: taskUiStateForDerivedData.statusFilters,
      tableColumnFilters: taskUiStateForDerivedData.tableColumnFilters,
    },
  ), [focusedTaskIds, stableCanonicalTaskIndex, taskUiStateForDerivedData]);
  const taskSearchSelection = useMemo(() => {
    if (!shouldRunTaskSearch(activePage)) return null;
    const result = queryTaskSearch(
      effectiveSearchQuery,
      stableTaskSearchScope,
      taskUiStateForDerivedData.includeStepsByView[taskUiStateForDerivedData.view] === true,
    );
    const visibleTasks = sortTasksForCockpit(
      result.visibleRootTaskIds
        .map((taskId) => stableCanonicalTaskIndex.taskById.get(taskId))
        .filter((task): task is NonNullable<typeof task> => Boolean(task)),
      bucketContext,
    );
    return { ...result, visibleTasks };
  }, [activePage, bucketContext, effectiveSearchQuery, stableCanonicalTaskIndex, stableTaskSearchScope, taskUiStateForDerivedData]);
  const taskSearchMeasurementRef = useRef<{ inputPublishedAt: number; query: string; searchStartedAt: number } | null>(null);
  useEffect(() => {
    if (!taskSearchSelection || !isWorkspacePerformanceDiagnosticsEnabled() || typeof performance === "undefined") return;
    const measurement = taskSearchMeasurementRef.current;
    if (!measurement || measurement.query !== taskUiState.search) return;
    const reactCommitAt = performance.now();
    console.info(
      `[tasks:search] query=${JSON.stringify(measurement.query)} inputPublicationMs=0 searchStartMs=0`
        + ` searchCompleteMs=${Math.round(reactCommitAt - measurement.searchStartedAt)}`
        + ` reactCommitMs=0 totalElapsedMs=${Math.round(reactCommitAt - measurement.inputPublishedAt)}`,
    );
    taskSearchMeasurementRef.current = null;
  }, [taskSearchSelection, taskUiState.search]);
  const taskNotesRevision = useMemo(
    () => createProjectionDomainRevision("task-notes", availableTaskNotes),
    [availableTaskNotes],
  );
  const workspaceFactsRevision = combineProjectionRevisions(
    canonicalIndexRevision,
    taskNotesRevision,
    createProjectionDomainRevision("bucket-context", {
      focusedTaskIds,
      routing: taskRouting,
    }),
  );
  const taskAppWorkspaceFacts = useMemo(
    () => projectionCache.getOrCreate("workspace-facts", workspaceFactsRevision, () => buildTaskAppWorkspaceFacts({
      availableTaskNotes,
      bucketContext,
      focusedTaskIds,
      stableCanonicalTaskIndex,
      structuralData: taskAppStructuralData,
      taskDisplayStatusByTaskId,
      tasks: tasksForActiveStatusRead,
    })),
    // Search, view/editor state, menus, and overlays are not workspace facts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectionCache, workspaceFactsRevision],
  );
  const derivationViewRevision = createProjectionDomainRevision("view", taskUiStateForDerivedData);
  const derivationSettingsRevision = createProjectionDomainRevision("view-settings", {
    grid: taskGridLayout,
    listVisibleColumns: taskUiState.visibleColumnsByView.table,
  });
  const taskDerivationRevision = createTaskDerivationRevisionKey({
    historyRevision: taskHistoryRevision,
    listRevision: workspaceFactsRevision,
    settingsRevision: derivationSettingsRevision,
    taskRevision: taskDomainRevision,
    viewRevision: derivationViewRevision,
  });
  // These projections also feed Home and page-independent editors. Keep the
  // task workspace result warm so unrelated page navigation cannot retrigger it.
  const derivedData = useMemo(
    () => projectionCache.getOrCreate("complete-derived", taskDerivationRevision, () => {
      const diagnostic = process.env.NODE_ENV === "development" ? derivedDiagnosticTracker.capture({
        activePage,
        dependencies: {
          availableTaskLists,
          availableTaskNotes,
          bucketContext,
          effectiveSearchQuery,
          focusedTaskIds,
          milestoneSearchTokensByTaskId: milestoneData.milestoneSearchTokensByTaskId,
          milestoneTaskIds: milestoneData.milestoneTaskIds,
          taskAppStructuralData,
          taskEditorTaskId: null,
          taskGridLayout,
          taskHistoryByTaskId,
          taskListEvaluationContext,
          taskSubtasksByTaskId,
          taskUiStateForDerivedData,
          todayKey,
          tasksForActiveStatusRead,
        },
        revisionSources: {
          history: { taskHistoryByTaskId },
          list: { availableTaskLists, bucketContext, taskListEvaluationContext },
          settings: {
            focusedTaskIds,
            milestoneSearchTokensByTaskId: milestoneData.milestoneSearchTokensByTaskId,
            milestoneTaskIds: milestoneData.milestoneTaskIds,
            taskEditorTaskId,
            taskGridLayout,
            taskUiStateForDerivedData,
            todayKey,
          },
          task: { taskAppStructuralData, taskSubtasksByTaskId, tasksForActiveStatusRead },
        },
      }) : undefined;
      const result = computeTaskAppDerivedData({
      activePage: TASK_DERIVATION_SCOPE,
      availableTaskLists,
      availableTaskNotes,
      bucketContext,
      deferredSearchQuery: "",
      focusedTaskIds,
      listColumnPickerOrder: LIST_COLUMN_PICKER_ORDER,
      listVisibleColumns: taskUiState.visibleColumnsByView.table,
      milestoneSearchTokensByTaskId: milestoneData.milestoneSearchTokensByTaskId,
      milestoneTaskIds: milestoneData.milestoneTaskIds,
      taskEditorTaskId: null,
      taskGridLayout,
      taskGridWidgetTypes: Object.keys(TASK_GRID_WIDGET_LABELS) as TaskGridWidgetType[],
      taskHistoryByTaskId,
      taskHistoryStreakSummaryByTaskId: taskHistoryStreakSummaries,
      todayDateKey: todayKey,
      taskListEvaluationContext,
      taskSubtasksByTaskId,
      taskUiState: taskUiStateForDerivedData,
      taskDisplayStatusByTaskId,
      tasks: tasksForActiveStatusRead,
      structuralData: taskAppStructuralData,
      stableCanonicalTaskIndex,
      workspaceFacts: taskAppWorkspaceFacts,
      diagnosticDetails: diagnostic,
      });
      return result;
    }),
    // activePage is diagnostic context, not a projection invalidator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      projectionCache,
      taskDerivationRevision,
    ],
  );
  const {
    activeTasks,
    allTaskTags,
    childTaskPreviewByParentTaskId,
    canonicalEntityProjection,
    canonicalVisibleRootTasksSorted,
    collections: {
      filteredActiveTasks,
      filteredDoneTasks,
      filteredFocusTasks,
      filteredOverdueTasks,
      filteredTodayTasks,
      filteredUrgentTasks,
      inboxTasks,
      missedTasks,
      recurringTasks,
      waitingTasks,
    },
    doneTasks,
    duplicateTitleGroups,
    focusPlannerTasks,
    filteredTasksSorted,
    archiveFilteredTasksSorted,
    trashFilteredTasksSorted,
    listColumnPickerColumns,
    manualListOptions,
    milestoneFilteredTasksSorted,
    planningCandidates,
    searchMatchedStepParentTaskIds: derivedSearchMatchedStepParentTaskIds,
    searchMatchedChildTaskIds: derivedSearchMatchedChildTaskIds,
    statusMatchedChildTaskIds,
    statusMatchedStepParentTaskIds,
    taskHierarchyDiagnostics,
    taskLinkedNotesByTaskId,
    taskListMembershipsByTaskId,
    tableStatusCounts,
    todayTasks,
    todayQueueTaskCount,
    urgentTasks,
    visibleListCounts,
  } = derivedData;
  const [sharedEditorRowModelCache] = useState(createStableTaskRowModelCache);
  const selectedTaskForEditor = useMemo(
    () => taskEditorTaskId ? tasksForActiveStatusRead.find((task) => task.id === taskEditorTaskId) ?? null : null,
    [taskEditorTaskId, tasksForActiveStatusRead],
  );
  const sharedTaskEditorRows = useMemo(
    () => sharedTaskEditorOverlayTaskId
      ? tasksForActiveStatusRead.map((task) => sharedEditorRowModelCache.getOrCreate(task, {
        displayStatus: taskDisplayStatusByTaskId[task.id],
        focusedTaskIdSet,
        linkedNotes: taskLinkedNotesByTaskId[task.id] ?? [],
        listDefinitions: availableTaskLists,
        listMemberships: taskListMembershipsByTaskId[task.id] ?? [],
        subtasks: taskSubtasksByTaskId[task.id] ?? [],
        taskHistory: taskHistoryByTaskId[task.id] ?? [],
        taskHistoryStreakSummary: taskHistoryStreakSummaries[task.id],
        todayDateKey: todayKey,
      }))
      : [],
    [
      availableTaskLists,
      focusedTaskIdSet,
      sharedEditorRowModelCache,
      sharedTaskEditorOverlayTaskId,
      taskHistoryByTaskId,
      taskHistoryStreakSummaries,
      taskDisplayStatusByTaskId,
      taskLinkedNotesByTaskId,
      taskListMembershipsByTaskId,
      taskSubtasksByTaskId,
      tasksForActiveStatusRead,
      todayKey,
    ],
  );
  const activeListFacetCounts = taskSearchSelection?.listFacetCounts ?? canonicalEntityProjection.listFacetCounts;
  const activePrimaryFacetVisibleEntityIds = taskSearchSelection?.primaryFacetVisibleEntityIds
    ?? canonicalEntityProjection.primaryFacetVisibleEntityIds;
  const taskListFolderCounts = useMemo(
    () => buildTaskListFolderCounts(
      canonicalTaskListRailTree,
      Array.from(canonicalEntityProjection.entityFactsById.values())
        .filter((fact) => isTaskOpen(fact.task))
        .map((fact) => ({
          id: fact.id,
          listMemberships: fact.listMemberships,
          task: fact.task,
        })),
      activePrimaryFacetVisibleEntityIds,
      todayKey,
    ),
    [activePrimaryFacetVisibleEntityIds, canonicalEntityProjection.entityFactsById, canonicalTaskListRailTree, todayKey],
  );
  const taskListRailStructureOptions = useMemo(() => {
    const rootContainerRevision = getTaskListContainerRevision(taskListContainers, null);
    const buildStructureOptions = (
      folderId: string | null,
      items = canonicalTaskListRailTree.mixedChildrenByFolderId.get(folderId) ?? [],
    ) => (
      items
        .map((item, containerIndex) => ({ containerIndex, item }))
        .filter(({ item }) => (
          item.kind === "folder"
          || item.entity.isVisible
          || item.id === taskUiState.selectedBucket
        ))
        .map(({ containerIndex, item }) => {
          if (item.kind === "folder") {
            const counts = taskListFolderCounts.get(item.id) ?? {
              containedListCount: 0,
              dueTodayCount: 0,
              overdueCount: 0,
              visibleTaskCount: 0,
            };
            return {
              containerId: folderId,
              containerKey: getTaskListContainerKey(folderId),
              containerIndex,
              count: counts.visibleTaskCount,
              description: taskListFolderTree.folderPathById.get(item.id) ?? item.entity.name,
              draggableEligible: true,
              expectedContainerRevision: folderId === null
                ? rootContainerRevision
                : getTaskListContainerRevision(taskListContainers, folderId),
              folderCounts: counts,
              id: item.id,
              entityId: item.id,
              entityType: "folder" as const,
              isCustom: true,
              label: item.entity.name,
              destinationAppendIndex: canonicalTaskListRailTree.mixedChildrenByFolderId.get(item.id)?.length ?? 0,
              persistedParentValue: item.placement.container_folder_id,
              sortOrder: item.sortOrder,
              structuralKey: item.itemKey,
              structureKind: "folder" as const,
            };
          }
          return {
            containerId: folderId,
            containerKey: getTaskListContainerKey(folderId),
            containerIndex,
            count: activeListFacetCounts[item.id] ?? 0,
            description: taskListFolderTree.listPathById.get(item.id) ?? item.entity.name,
            draggableEligible: true,
            entityId: item.entityId ?? undefined,
            entityType: "list" as const,
            expectedContainerRevision: folderId === null
              ? rootContainerRevision
              : getTaskListContainerRevision(taskListContainers, folderId),
            id: item.id,
            isCustom: item.entity.type === "custom",
            label: item.entity.name,
            listSubtype: item.listSubtype,
            persistedParentValue: item.placement.container_folder_id,
            sortOrder: item.sortOrder,
            structuralKey: item.itemKey,
            structureKind: "list" as const,
          };
        })
    );
    return {
      primaryRail: buildStructureOptions(null),
      openFolderRails: taskListFolderBreadcrumbs.map((folder) => ({
        folderId: folder.id,
        lists: buildStructureOptions(folder.id),
      })),
    };
  }, [
    activeListFacetCounts,
    canonicalTaskListRailTree,
    currentFolderId,
    taskListFolderBreadcrumbs,
    taskListFolderCounts,
    taskListContainers,
    taskUiState.selectedBucket,
  ]);
  const allTaskListDirectoryEntries = useMemo(
    () => buildCanonicalTaskListRailDirectory(canonicalTaskListRailTree),
    [canonicalTaskListRailTree],
  );
  const hasFocusedToday = focusedTaskIds.length > 0;
  const momentumMetric = getMomentumMetric({
    doneTasks,
    focusedTaskIds,
    tasks,
    todayDateKey: todayKey,
    todayTasks,
    urgentTasks,
  }, momentumView);
  const selectedBucketTasks = taskSearchSelection?.visibleTasks ?? canonicalVisibleRootTasksSorted;
  const searchMatchedChildTaskIds = taskSearchSelection
    ? Array.from(taskSearchSelection.matchingDescendantIdsByRootParentId.values())
      .flatMap((descendantIds) => Array.from(descendantIds))
    : derivedSearchMatchedChildTaskIds;
  const searchMatchedStepParentTaskIds = taskSearchSelection
    ? taskSearchSelection.visibleRootTaskIds
    : derivedSearchMatchedStepParentTaskIds;
  const hierarchyStatusFilterActive = effectiveSearchQuery.length === 0 && (
    taskUiState.statusFilters.length > 0
    || taskUiState.energyFilters.length > 0
    || taskUiState.quickFilters.length > 0
    || taskUiState.tableColumnFilters.priority.length > 0
    || taskUiState.tableColumnFilters.repeat.length > 0
    || Object.values(taskUiState.tableColumnFilters.text).some((value) => Boolean(value?.trim()))
  );
  const selectedGridWidget = taskGridLayout.find((item) => item.id === selectedGridWidgetId) ?? null;
  const visiblePinnedTaskCount = taskSearchSelection
    ? activeListFacetCounts.pinned ?? 0
    : visibleListCounts.pinned ?? 0;
  const allOpenPinnedTaskCount = useMemo(
    () => tasks.filter((task) => isTaskPinned(task) && task.status !== "archived" && task.status !== "trashed").length,
    [tasks],
  );
  const visibleRoutineTaskCount = taskSearchSelection
    ? activeListFacetCounts.routine ?? 0
    : visibleListCounts.routine ?? 0;
  const listVisibleColumns = taskUiState.visibleColumnsByView.table;
  const listSelectionResetKey = JSON.stringify({
    duplicateTitleMode: duplicateTitleModeActive,
    energyFilters: taskUiState.energyFilters,
    matchAny: taskUiState.matchAny,
    quickFilters: taskUiState.quickFilters,
    search: effectiveSearchQuery,
    selectedBucket: taskUiState.selectedBucket,
    statusFilters: taskUiState.statusFilters,
    view: taskUiState.view,
  });
  const visibleListTaskIds = useMemo(
    () => selectedBucketTasks.map((task) => task.id),
    [selectedBucketTasks],
  );
  const taskRowContext = useMemo(() => ({
    focusedTaskIdSet,
    linkedNotesByTaskId: taskLinkedNotesByTaskId,
    listDefinitions: availableTaskLists,
    listMembershipsByTaskId: taskListMembershipsByTaskId,
    manualMembershipsByTaskId,
    subtasksByTaskId: taskSubtasksByTaskId,
    taskDisplayStatusByTaskId,
    taskHistoryByTaskId,
    taskHistoryStreakSummaryByTaskId: taskHistoryStreakSummaries,
    todayDateKey: todayKey,
  }), [
    availableTaskLists,
    focusedTaskIdSet,
    manualMembershipsByTaskId,
    taskHistoryByTaskId,
    taskHistoryStreakSummaries,
    taskLinkedNotesByTaskId,
    taskListMembershipsByTaskId,
    taskSubtasksByTaskId,
    taskDisplayStatusByTaskId,
    todayKey,
  ]);
  const taskHighlightMatches = useMemo(
    () => buildTaskHighlightMatchState({
      childTaskPreviewByParentTaskId,
      query: effectiveSearchQuery,
      selectedBucketTasks,
      taskSubtasksByTaskId,
    }),
    [childTaskPreviewByParentTaskId, effectiveSearchQuery, selectedBucketTasks, taskSubtasksByTaskId],
  );
  const selectedBucketLabel = useMemo(() => {
    if (taskUiState.selectedBucket === "pinned") {
      return "Pinned";
    }
    if (taskUiState.selectedBucket in TASK_BUCKET_LABELS) {
      return TASK_BUCKET_LABELS[taskUiState.selectedBucket as TaskBucket];
    }
    return availableTaskLists.find((list) => list.id === taskUiState.selectedBucket)?.name ?? taskUiState.selectedBucket;
  }, [availableTaskLists, taskUiState.selectedBucket]);
  const listSortSurfaceId = getListSortSurfaceId(taskUiState.tasksSurface, taskUiState.selectedBucket);
  const activeListSortPreference = taskUiState.listSortBySurface[listSortSurfaceId] ?? DEFAULT_LIST_SORT_PREFERENCE;
  const selectedManualList = useMemo(
    () => availableTaskLists.find((list) =>
      list.id === taskUiState.selectedBucket
      && isManualTaskListDestination(list)
      && !list.rules,
    ) ?? null,
    [availableTaskLists, taskUiState.selectedBucket],
  );
  const [manualListAddTaskSearch, setManualListAddTaskSearch] = useState("");
  const manualListAddTaskMatches = useMemo(() => {
    if (!selectedManualList) {
      return [];
    }
    return filterManualListTaskCandidates(
      activeTasks,
      manualListAddTaskSearch,
      selectedManualList.id,
      manualMembershipsByTaskId,
    );
  }, [activeTasks, manualListAddTaskSearch, manualMembershipsByTaskId, selectedManualList]);
  const [tableVisibleSearchMatchIds, setTableVisibleSearchMatchIds] = useState<string[] | null>(null);
  const [statusChangeScrollAnchor, setStatusChangeScrollAnchor] = useState<StatusChangeScrollAnchorState | null>(null);
  const handleTableVisibleSearchMatchIdsChange = useCallback((taskIds: string[]) => {
    setTableVisibleSearchMatchIds((current) => {
      if (current && current.length === taskIds.length && current.every((taskId, index) => taskId === taskIds[index])) {
        return current;
      }
      return taskIds;
    });
  }, []);
  const queueStatusChangeScrollAnchor = useCallback((taskId: string, candidateTaskIds?: string[]) => {
    const fallbackTaskIds = selectedBucketTasks.map((task) => task.id);
    const nextCandidateTaskIds = Array.from(new Set(
      candidateTaskIds && candidateTaskIds.length > 0
        ? candidateTaskIds
        : [taskId, ...fallbackTaskIds.filter((visibleTaskId) => visibleTaskId !== taskId)],
    ));
    setStatusChangeScrollAnchor((current) => ({
      candidateTaskIds: nextCandidateTaskIds,
      previousVisibleTaskIds: fallbackTaskIds,
      sourceTaskId: taskId,
      token: (current?.token ?? 0) + 1,
    }));
  }, [selectedBucketTasks]);
  const activeTaskHighlightMatchIds = taskUiState.view === "table" && !duplicateTitleModeActive
    ? (tableVisibleSearchMatchIds ?? taskHighlightMatches.matchedRowIds)
    : taskHighlightMatches.matchedRowIds;
  const [taskHighlightActiveMatchIndex, setTaskHighlightActiveMatchIndex] = useState(0);
  const [taskHighlightScrollToken, setTaskHighlightScrollToken] = useState<number | null>(null);
  const [taskHighlightShouldFocusResult, setTaskHighlightShouldFocusResult] = useState(false);
  const taskHighlightScrollSequenceRef = useRef(0);
  const [taskRevealRequest, setTaskRevealRequest] = useState<{ taskId: string; token: number } | null>(null);
  const taskRevealSequenceRef = useRef(0);
  const requestTaskReveal = useCallback((taskId: string) => {
    taskRevealSequenceRef.current += 1;
    setTaskRevealRequest({ taskId, token: taskRevealSequenceRef.current });
  }, []);
  const pendingTaskHighlightCommittedSearchRef = useRef<string | null>(null);
  const pendingTaskHighlightSubmitSearchRef = useRef<string | null>(null);
  const queueTaskHighlightScrollIntent = useCallback((shouldFocusResult = false) => {
    taskHighlightScrollSequenceRef.current += 1;
    setTaskHighlightShouldFocusResult(shouldFocusResult);
    setTaskHighlightScrollToken(taskHighlightScrollSequenceRef.current);
  }, []);
  const advanceTaskHighlightMatch = useCallback(() => {
    if (activeTaskHighlightMatchIds.length === 0) {
      return;
    }
    setTaskHighlightActiveMatchIndex((current) => (
      current + 1 >= activeTaskHighlightMatchIds.length ? 0 : current + 1
    ));
    queueTaskHighlightScrollIntent(true);
  }, [activeTaskHighlightMatchIds.length, queueTaskHighlightScrollIntent]);
  useEffect(() => {
    setTaskHighlightActiveMatchIndex(0);
  }, [effectiveSearchQuery]);
  useEffect(() => {
    if (effectiveSearchQuery.length === 0 || activeTaskHighlightMatchIds.length === 0) {
      setTaskHighlightActiveMatchIndex(0);
      return;
    }

    setTaskHighlightActiveMatchIndex((current) => (
      current >= activeTaskHighlightMatchIds.length ? 0 : current
    ));
  }, [activeTaskHighlightMatchIds.length, effectiveSearchQuery]);
  useEffect(() => {
    if (taskHighlightScrollToken === null) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setTaskHighlightScrollToken((current) => (current === taskHighlightScrollToken ? null : current));
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [taskHighlightScrollToken]);
  useEffect(() => {
    if (!taskRevealRequest) {
      return;
    }

    let remainingFrames = 4;
    let frameId = 0;
    const clearRequest = () => {
      if (remainingFrames > 0) {
        remainingFrames -= 1;
        frameId = window.requestAnimationFrame(clearRequest);
        return;
      }
      setTaskRevealRequest((current) => current?.token === taskRevealRequest.token ? null : current);
    };
    frameId = window.requestAnimationFrame(clearRequest);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [taskRevealRequest]);
  useEffect(() => {
    if (pendingTaskHighlightCommittedSearchRef.current !== taskUiState.search) {
      return;
    }
    pendingTaskHighlightCommittedSearchRef.current = null;
    if (taskUiState.search.length === 0) {
      return;
    }
    queueTaskHighlightScrollIntent();
  }, [queueTaskHighlightScrollIntent, taskUiState.search]);
  useEffect(() => {
    if (pendingTaskHighlightSubmitSearchRef.current !== taskUiState.search) {
      return;
    }
    pendingTaskHighlightSubmitSearchRef.current = null;
    advanceTaskHighlightMatch();
  }, [advanceTaskHighlightMatch, taskUiState.search]);
  const activeHighlightedTaskId = taskRevealRequest?.taskId ?? (effectiveSearchQuery.length > 0
    ? (activeTaskHighlightMatchIds[taskHighlightActiveMatchIndex] ?? activeTaskHighlightMatchIds[0] ?? null)
    : null);
  const activeTaskRevealScrollToken = taskRevealRequest?.token ?? taskHighlightScrollToken;
  const activeTaskRevealShouldFocus = taskRevealRequest ? false : taskHighlightShouldFocusResult;
  const highlightedSearchMatchedStepParentTaskIds = Array.from(
    new Set([...searchMatchedStepParentTaskIds, ...taskHighlightMatches.matchedStepParentTaskIds]),
  );
  const visibleTaskListOrder = useMemo(
    () => new Map(
      availableTaskLists
        .filter((list) => list.isVisible)
        .map((list, index) => [list.id, index] as const),
    ),
    [availableTaskLists],
  );
  const getFollowTaskDestination = useCallback((taskId: string) => {
    const memberships = taskListMembershipsByTaskId[taskId] ?? [];
    const nextMembership = memberships
      .filter((membership) => membership.id !== taskUiState.selectedBucket && visibleTaskListOrder.has(membership.id))
      .sort((left, right) => {
        if (left.isManual !== right.isManual) {
          return left.isManual ? -1 : 1;
        }
        return (visibleTaskListOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER)
          - (visibleTaskListOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER);
      })[0];

    if (!nextMembership) {
      return null;
    }

    const destination = availableTaskLists.find((list) => list.id === nextMembership.id);
    if (!destination) {
      return null;
    }

    return {
      id: destination.id,
      label: destination.name,
    };
  }, [availableTaskLists, taskListMembershipsByTaskId, taskUiState.selectedBucket, visibleTaskListOrder]);
  const followDetachedTask = useCallback((taskId: string) => {
    const destination = getFollowTaskDestination(taskId);
    if (!destination) {
      setMessage({ tone: "neutral", text: "That task no longer has another visible list to follow right now." });
      return;
    }

    setTaskUiState((prev) => ({
      ...prev,
      selectedBucket: destination.id,
    }));
    setSuppressDetachedListNoticeTaskId(null);
    setRequestedListOverlayTaskId(taskId);
  }, [getFollowTaskDestination, setTaskUiState]);
  const dismissDetachedTask = useCallback((taskId: string) => {
    const destination = getFollowTaskDestination(taskId);
    if (!destination) {
      setMessage({ tone: "neutral", text: "That task left the current list and does not have another visible list right now." });
    }
  }, [getFollowTaskDestination]);
  const {
    clearListTaskSelection,
    lastSelectedListTaskId,
    selectAllVisibleListTasks,
    selectSingleListTask,
    selectedListTaskIds,
    toggleListTaskSelection,
  } = useTaskListSelection({
    resetKey: listSelectionResetKey,
    tasks,
    visibleListTaskIds,
  });
  const selectedListTasks = tasks.filter((task) => selectedListTaskIds.includes(task.id));
  const {
    claimPendingRewardBank,
    pendingRewardDiceCount,
    pendingRewardQueue,
    queueTaskRewards,
  } = useTaskRewardController({
    client,
    currentUserId: session?.user?.id ?? null,
    setMessage,
    setEconomy,
  });
  const openPendingRewardBank = useCallback(() => {
    if (pendingRewardQueue.length === 0) {
      return;
    }

    setActiveRewardBankSession([...pendingRewardQueue]);
  }, [pendingRewardQueue]);
  const hudNotificationBaseItems = useMemo<HudNotificationItem[]>(() => {
    const currentItems: HudNotificationItem[] = [];
    if (pendingRewardDiceCount > 0) {
      currentItems.push({
        detail: `${formatPendingDiceChipLabel(pendingRewardDiceCount)}. Tap the pending-roll chip when you're ready.`,
        id: "pending-reward",
        title: "Pending rolls",
        tone: "success",
      });
    }
    if (missedTasks.length > 0) {
      currentItems.push({
        detail: `${missedTasks.length} missed task${missedTasks.length === 1 ? "" : "s"} need review.`,
        id: "missed-tasks",
        title: "Missed tasks",
        tone: "danger",
      });
    }
    if (filteredTodayTasks.length > 0) {
      currentItems.push({
        detail: `${filteredTodayTasks.length} task${filteredTodayTasks.length === 1 ? "" : "s"} due today.`,
        id: "due-today",
        title: "Due today",
        tone: "accent",
      });
    }
    return currentItems;
  }, [filteredTodayTasks.length, missedTasks.length, pendingRewardDiceCount]);
  const {
    addTask,
    addChildTaskSubtask,
    addTaskSubtask,
    applyBatchTaskEdit,
    createCustomTaskList,
    deleteTaskList,
    deleteTaskSubtask,
    deleteTasks,
    importTasks,
    renameTaskSubtask,
    replaceTaskSubtasks,
    routeTask,
    saveTaskEditor,
    saveTaskListDefinition,
    syncTaskHistoryEntries,
    syncTaskHistoryEntry,
    syncTaskNoteLinks,
    toggleTaskManualListMembership,
    updateTask,
    updateTaskSubtaskStatus,
  } = useTaskActions({
    currentDayKey: todayKey,
    crud: {
      client,
      clearPendingTaskMutations,
      currentUserId: currentUserIdText,
      deleteTaskRow: (taskId, expectedTask) => deleteTaskRow(client, taskId, { expectedTask }),
      isMilestoneTask: (task) => milestoneData.milestoneByTaskId.has(task.id),
      markPendingTaskMutations,
      onTaskRevealRequested: requestTaskReveal,
      runMilestoneTaskTrash,
      setMessage,
      setTaskRouting,
      setTasks,
      shouldRouteTaskToInbox,
      sortTasksForUi,
      tasks,
    },
    create: {
      client,
      currentUserId: currentUserIdText,
      onTaskRevealRequested: requestTaskReveal,
      setMessage,
      setTasks,
      shouldRouteTaskToInbox,
      sortTasksForUi,
    },
    batchEdit: {
      clearListTaskSelection,
      dayStartTime,
      focusedTaskIds,
      loadTaskHistoryForTasks,
      loadCanonicalScheduleBoundary: async (taskId, boundaryId) => {
        const result = await loadCanonicalTaskScheduleBoundary(client as unknown as CanonicalReadClient, {
          boundaryId,
          taskId,
          userId: currentUserIdText,
        });
        if (result.error || !result.data) {
          throw new Error(result.error?.message ?? "The committed canonical schedule boundary could not be loaded.");
        }
        return result.data;
      },
      logicalDayNow: new Date(logicalDayNow),
      onTaskHistoryMutation: reconcileTaskHistoryMutation,
      onTasksCompleted: queueTaskRewards,
      parseDayOfMonth,
      parsePositiveInteger,
      selectedListTasks,
      setBatchEditProgress,
      setIsBatchEditModalOpen,
      setMessage,
      setTasks,
      sortTasksForUi,
      taskHistory,
      tasks,
      timezone: userTimeZone,
      updateTaskRowWithLegacyEnergyFallback: runGuardedTaskRowUpdate,
    },
    list: {
      availableTaskLists,
      builtInTaskLists,
      client,
      currentUserId: currentUserIdText,
      isBuiltInTaskListId,
      isMissingTaskListsTableError,
      mapTaskListRow,
      setMessage,
      setTaskListManualMemberships,
      setTaskLists,
      taskListDataGeneration,
      taskLists,
    },
    editorSave: {
      canonicalTaskCreator: (payload, source) => insertTaskRowWithCanonicalCreation(client, payload, source),
      currentUserId: currentUserIdText,
      dayStartTime,
      focusedTaskIds,
      onTasksCompleted: queueTaskRewards,
      loadTaskHistoryForTasks,
      logicalDayNow: new Date(logicalDayNow),
      onTaskHistoryMutation: reconcileTaskHistoryMutation,
      saveFocusSelection,
      setMessage,
      setTasks,
      sortTasksForUi,
      taskHistory,
      tasks,
      timezone: userTimeZone,
      updateTaskRowWithLegacyEnergyFallback: runGuardedTaskRowUpdate,
    },
    history: {
      client,
      currentUserId: currentUserIdText,
      currentDayKey: todayKey,
      loadTaskHistoryForTasks,
      onHistoryMutation: reconcileTaskHistoryMutation,
      onTasksCompleted: queueTaskRewards,
      setMessage,
      setTaskHistory,
      setTasks,
      sortTasksForUi,
      taskHistory,
      tasks,
      timezone: userTimeZone,
    },
    noteLinks: {
      client,
      currentUserId: currentUserIdText,
      setAvailableTaskNotes,
      setMessage,
    },
    routing: {
      client,
      currentUserId: currentUserIdText,
      isMissingTaskListManualMembershipsTableError,
      manualMembershipsByTaskId,
      mapTaskListManualMembershipRow,
      setMessage,
      setTaskListManualMemberships,
      setTaskRouting,
      taskListManualMemberships,
    },
    subtask: {
      canonicalTaskCreator: (payload, source) => insertTaskRowWithCanonicalCreation(client, payload, source),
      client,
      currentUserId: currentUserIdText,
      setMessage,
      setTasks,
      tasks,
    },
    update: {
      canonicalTaskMutationState: canonicalTaskMutationStateRef.current,
      clearPendingTaskMutations,
      markPendingTaskMutations,
      onTasksCompleted: queueTaskRewards,
      dayStartTime,
      logicalDayNow: new Date(logicalDayNow),
      loadTaskHistoryForTasks,
      loadCanonicalScheduleBoundary: async (taskId, boundaryId) => {
        const result = await loadCanonicalTaskScheduleBoundary(client as unknown as CanonicalReadClient, {
          boundaryId,
          taskId,
          userId: currentUserIdText,
        });
        if (result.error || !result.data) {
          throw new Error(result.error?.message ?? "The committed canonical schedule boundary could not be loaded.");
        }
        return result.data;
      },
      onTaskHistoryMutation: reconcileTaskHistoryMutation,
      setMessage: setTaskUpdateMessage,
      setTasks,
      sortTasksForUi,
      taskHistory,
      tasks,
      timezone: userTimeZone,
      updateTaskRowWithLegacyEnergyFallback: runGuardedTaskRowUpdate,
    },
  });
  async function reorderChildTask(taskId: string, instruction: TaskSiblingReorderInstruction) {
    const plan = buildTaskSiblingReorderPlan(tasks, taskId, instruction);
    if (!plan.ok) {
      if (plan.reason !== "boundary") {
        setMessage({ tone: "warn", text: "This Step could not be reordered because its hierarchy is no longer valid." });
      }
      return;
    }

    if (plan.updates.length === 0) {
      return;
    }

    const updatedTaskIdSet = new Set(plan.updates.map((update) => update.id));
    const expectedTaskById = new Map(
      tasks
        .filter((task) => updatedTaskIdSet.has(task.id))
        .map((task) => [task.id, task] as const),
    );
    const sortOrderByTaskId = new Map(plan.updates.map((update) => [update.id, update.sortOrder] as const));
    const updatedTaskIds = Array.from(updatedTaskIdSet);

    setTasks((current) => sortTasksForUi(current.map((task) => {
      const nextSortOrder = sortOrderByTaskId.get(task.id);
      return typeof nextSortOrder === "number"
        ? { ...task, sort_order: nextSortOrder }
        : task;
    })));

    markPendingTaskMutations(updatedTaskIds);
    let results;
    try {
      results = await Promise.all(
        plan.updates.map((siblingUpdate) => runGuardedTaskRowUpdate(
          siblingUpdate.id,
          { sort_order: siblingUpdate.sortOrder },
          { expectedTask: expectedTaskById.get(siblingUpdate.id) ?? null },
        )),
      );
    } finally {
      clearPendingTaskMutations(updatedTaskIds);
    }

    const persistedTasksById = new Map<string, Task>();
    let conflictCount = 0;
    let firstErrorMessage: string | null = null;
    let needsRefresh = false;

    for (const result of results) {
      if (result.error) {
        firstErrorMessage ??= result.error.message;
        needsRefresh = true;
        continue;
      }

      if (result.conflict) {
        conflictCount += 1;
        needsRefresh = true;
        if (result.conflict.latestTask) {
          persistedTasksById.set(result.conflict.latestTask.id, result.conflict.latestTask);
        }
        continue;
      }

      if (result.data) {
        persistedTasksById.set(result.data.id, result.data);
      }
    }

    if (persistedTasksById.size > 0) {
      setTasks((current) => sortTasksForUi(current.map((task) => {
        const persistedTask = persistedTasksById.get(task.id);
        return persistedTask
          ? mergeTaskWithCanonicalScheduleProjection(task, persistedTask)
          : task;
      })));
    }

    if (!needsRefresh) {
      return;
    }

    await softRefreshWorkspace();
    if (firstErrorMessage) {
      setMessage({
        tone: "warn",
        text: `Step reorder was refreshed from the cloud after a save error. ${firstErrorMessage}`,
      });
      return;
    }

    if (conflictCount > 0) {
      setMessage({
        tone: "warn",
        text: `${conflictCount} reordered step${conflictCount === 1 ? "" : "s"} changed in the cloud first, so the latest order was reloaded.`,
      });
    }
  }
  const {
    closeTaskEditor,
    deleteSelectedListTasks,
    openNewTaskEditor,
    openTaskImportPanel,
    setTaskDuePreset,
    setTaskEnergy,
    setTaskRecurringPreset,
  } = useTaskEditorImportController({
    clearListTaskSelection,
    deleteTasks,
    handleAddGridWidget,
    selectedListTaskIds,
    setIsBatchDeleteModalOpen,
    setIsImportWidgetMenuOpen,
    setIsTaskEditorOpen,
    setMessage,
    setSelectedGridWidgetId,
    setTaskEditorMode,
    setTaskEditorTaskId,
    setTaskUiState,
    taskGridLayout,
    taskUiView: taskUiState.view,
    tasks,
    todayDateKey: todayKey,
    updateTask: async (taskId, updates) => {
      await updateTask(taskId, updates);
    },
  });
  const applyTaskPriorityChange = useCallback((taskId: string, priorities: TaskPriorityLevelOption[]) => {
    const nextPriorityLevel = priorities[0] ? Number.parseInt(priorities[0], 10) as 0 | 1 | 2 | 3 | 4 | 5 : 0;
    void updateTask(taskId, {
      ...buildTaskPriorityUpdate(nextPriorityLevel),
    });
  }, [updateTask]);

  const openTaskInNewWorkspaceTab = useCallback((taskId: string) => {
    const task = tasks.find((entry) => entry.id === taskId);
    const nextLabel = task?.title.trim() ? task.title.trim() : "Task";
    const nextTaskUiState = {
      ...activeTaskWorkspaceTab.taskUiState,
      tasksSurface: "tasks" as const,
      view: taskUiState.view === "list" ? "list" : "table",
    };

    setActivePage("Tasks");
    setSuppressDetachedListNoticeTaskId(null);
    setRequestedListOverlayTaskId(taskId);
    createTaskWorkspaceTab({
      isRailHidden: activeTaskWorkspaceTab.isRailHidden,
      label: nextLabel,
      taskUiState: nextTaskUiState,
    });
  }, [activeTaskWorkspaceTab.isRailHidden, activeTaskWorkspaceTab.taskUiState, createTaskWorkspaceTab, setActivePage, taskUiState.view, tasks]);

  const handleTaskWorkspaceSurfaceChange = useCallback((surface: TaskUiState["tasksSurface"]) => {
    if (surface === "report") {
      const existingReportTab = taskWorkspaceTabsState.tabs.find((tab) => isReportTaskWorkspaceTab(tab));
      if (existingReportTab) {
        setActiveTaskWorkspaceTab(existingReportTab.id);
        return;
      }

      createTaskWorkspaceTab({
        isRailHidden: activeTaskWorkspaceTab.isRailHidden,
        label: "Report",
        taskUiState: {
          ...activeTaskWorkspaceTab.taskUiState,
          tasksSurface: "report",
        },
      });
      return;
    }

    if (isReportTaskWorkspaceTab(activeTaskWorkspaceTab)) {
      const existingNonReportTab = taskWorkspaceTabsState.tabs.find((tab) => !isReportTaskWorkspaceTab(tab));
      if (existingNonReportTab) {
        setActiveTaskWorkspaceTab(existingNonReportTab.id);
        setTaskUiState((prev) => ({ ...prev, tasksSurface: surface }));
        return;
      }

      createTaskWorkspaceTab({
        isRailHidden: activeTaskWorkspaceTab.isRailHidden,
        taskUiState: {
          ...activeTaskWorkspaceTab.taskUiState,
          tasksSurface: surface,
        },
      });
      return;
    }

    setTaskUiState((prev) => ({ ...prev, tasksSurface: surface }));
  }, [activeTaskWorkspaceTab, createTaskWorkspaceTab, setActiveTaskWorkspaceTab, setTaskUiState, taskWorkspaceTabsState.tabs]);

  const handleNavigatorSearchTarget = useCallback((target: NavigatorSearchTarget) => {
    const action: NavigatorSearchAction = target.action;
    if (action.kind === "page") {
      setRequestedSettingsSection(null);
      setActivePage(action.page);
    } else if (action.kind === "tasks-surface") {
      setRequestedSettingsSection(null);
      setActivePage("Tasks");
      handleTaskWorkspaceSurfaceChange(action.surface);
    } else if (action.kind === "tasks-view") {
      setRequestedSettingsSection(null);
      setActivePage("Tasks");
      handleTaskWorkspaceSurfaceChange("tasks");
      setTaskUiState((prev) => ({ ...prev, view: action.view }));
    } else if (action.kind === "health-tab") {
      setRequestedSettingsSection(null);
      setActivePage("Health");
      persistHealthTabPreference(action.tab);
    } else {
      setActivePage("Settings");
      setRequestedSettingsSection(action.section);
    }
  }, [handleTaskWorkspaceSurfaceChange, setActivePage, setTaskUiState]);

  const openBlankTaskEditor = useCallback(() => {
    setSuppressDetachedListNoticeTaskId(null);
    setTaskEditorInitialDraft(null);
    openNewTaskEditor();
  }, [openNewTaskEditor]);

  const openExistingTaskEditor = useCallback((task: Task) => {
    setSuppressDetachedListNoticeTaskId(null);
    setSharedTaskEditorOverlayTaskId(task.id);
    setTaskEditorFocusRequest(null);
  }, []);

  const openInlineNewListTaskComposer = useCallback(async () => {
    const createdTask = await addTask(buildNewTaskDraft("New Task"));

    if (!createdTask) {
      return;
    }

    if (
      taskUiState.selectedBucket === "inbox"
      || taskUiState.selectedBucket === "today"
      || taskUiState.selectedBucket === "quick_wins"
      || taskUiState.selectedBucket === "waiting"
      || taskUiState.selectedBucket === "later"
    ) {
      routeTask(createdTask.id, taskUiState.selectedBucket);
    }

    openExistingTaskEditor(createdTask);
  }, [addTask, openExistingTaskEditor, routeTask, taskUiState.selectedBucket]);

  const duplicateTaskInPlace = useCallback(async (task: Task) => {
    const duplicateValues: TaskDraft = {
      actual_seconds: 0,
      completed_at: null,
      due_on: task.due_on,
      due_time: task.due_time,
      energy: task.energy,
      estimated_minutes: task.estimated_minutes,
      external_link_label: task.external_link_label,
      external_link_url: task.external_link_url,
      notes: task.notes,
      one_step_at_a_time: task.one_step_at_a_time,
      ...buildTaskPriorityUpdate(getTaskPriorityLevel(task)),
      repeat_day_of_month: task.repeat_day_of_month,
      repeat_days_of_week: [...task.repeat_days_of_week],
      repeat_frequency: task.repeat_frequency,
      repeat_interval: task.repeat_interval,
      status: "pending",
      subtasks_auto_reset: task.subtasks_auto_reset,
      tags: [...task.tags],
      title: task.title.trim() ? `Copy of ${task.title.trim()}` : "Copy of task",
    };

    const duplicateTask = await saveTaskEditor(duplicateValues, {
      focusToday: false,
      linkedNoteIds: (taskLinkedNotesByTaskId[task.id] ?? []).map((note) => note.id),
      sortOrder: task.sort_order + 1,
      subtasks: createTaskEditorDraft(task, false, taskSubtasksByTaskId[task.id] ?? []).subtasks,
    });

    if (!duplicateTask) {
      return;
    }

    const manualListIds = (taskListMembershipsByTaskId[task.id] ?? [])
      .filter((membership) => membership.isManual)
      .map((membership) => membership.id);
    for (const listId of manualListIds) {
      await toggleTaskManualListMembership(duplicateTask.id, listId);
    }
  }, [saveTaskEditor, taskLinkedNotesByTaskId, taskListMembershipsByTaskId, taskSubtasksByTaskId, toggleTaskManualListMembership]);

  const closeTaskEditorWithReset = useCallback(() => {
    setTaskEditorInitialDraft(null);
    closeTaskEditor();
  }, [closeTaskEditor]);

  const openHealthReminderTemplate = useCallback((templateKey: HealthReminderTemplateKey) => {
    const template = buildHealthReminderTemplate(templateKey, todayISO());
    setTaskEditorInitialDraft({
      estimatedMinutes: template.estimatedMinutes ? String(template.estimatedMinutes) : "",
      focusToday: false,
      notes: template.notes,
      priorityLevel: "0",
      repeatDayOfMonth: template.repeatDayOfMonth ? String(template.repeatDayOfMonth) : "",
      repeatDaysOfWeek: template.repeatDaysOfWeek,
      repeatFrequency: template.repeatFrequency,
      repeatInterval: String(template.repeatInterval),
      tags: template.tags,
      title: template.title,
    });
    openNewTaskEditor();
  }, [openNewTaskEditor]);

  const openScratchLinkedTaskTemplate = useCallback((title: string) => {
    setTaskEditorInitialDraft({ title });
    openNewTaskEditor();
  }, [openNewTaskEditor]);

  const {
    deferTask,
    focusTask,
    openFocusPlanner,
    planTasksForToday,
    sendTaskToWaiting,
  } = useTaskPlannerActions({
    focusedTaskIds,
    routeTask,
    saveFocusSelection,
    setFocusDraftIds,
    setFocusPlannerStep,
    setMessage,
    setShowFocusPlanner,
    setTaskRouting,
    setTaskUiState,
  });
  const { setTaskPriority } = useTaskPriorityRoutingController({
    focusedTaskIds,
    onOpenEditTaskEditor: openExistingTaskEditor,
    routeTask,
    saveFocusSelection,
    setMessage,
    updateTask: async (taskId, updates) => {
      await updateTask(taskId, updates);
    },
  });
  useEffect(() => {
    if (typeof window === "undefined" || activePage !== "Tasks") {
      return;
    }

    const primarySelectedTaskId = selectedListTaskIds.includes(lastSelectedListTaskId ?? "")
      ? lastSelectedListTaskId
      : selectedListTaskIds[0] ?? null;
    const primarySelectedTask = primarySelectedTaskId
      ? tasks.find((task) => task.id === primarySelectedTaskId) ?? null
      : null;

    const isInsideDialog = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      return Boolean(target.closest('[role="dialog"]'));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented
        || isKeyboardEventFromEditableTarget(event.target)
        || isInsideDialog(event.target)
      ) {
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        document.getElementById("task-search-input")?.focus();
        return;
      }

      if (event.key.toLowerCase() === "a" || event.key.toLowerCase() === "n") {
        event.preventDefault();
        void openInlineNewListTaskComposer();
        return;
      }

      if (event.key === "F") {
        event.preventDefault();
        openFocusPlanner();
        return;
      }

      if (!primarySelectedTask) {
        return;
      }

      if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        openExistingTaskEditor(primarySelectedTask);
        return;
      }

      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        void updateTask(primarySelectedTask.id, {
          completed_at: primarySelectedTask.status === "done" ? null : new Date().toISOString(),
          status: primarySelectedTask.status === "done" ? "pending" : "done",
        });
        return;
      }

      if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        planTasksForToday([primarySelectedTask.id]);
        return;
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        focusTask(primarySelectedTask.id);
        return;
      }

      if (event.key.toLowerCase() === "w") {
        event.preventDefault();
        sendTaskToWaiting(primarySelectedTask.id);
        return;
      }

      if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        deferTask(primarySelectedTask.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePage, deferTask, focusTask, lastSelectedListTaskId, openExistingTaskEditor, openFocusPlanner, openInlineNewListTaskComposer, planTasksForToday, selectedListTaskIds, sendTaskToWaiting, tasks, updateTask]);

  const shellZoomStyle = useMemo<CSSProperties | undefined>(() => {
    if (mobileZoom === 1) {
      return undefined;
    }

    return {
      position: "relative",
      left: "50%",
      transform: `translateX(-50%) scale(${mobileZoom})`,
      transformOrigin: "top center",
      width: `${100 / mobileZoom}%`,
    };
  }, [mobileZoom]);

  const mobileChromeZoomStyle = useMemo<CSSProperties | undefined>(() => {
    if (mobileZoom === 1) {
      return undefined;
    }

    return {
      transform: `scale(${mobileZoom})`,
      transformOrigin: "bottom center",
    };
  }, [mobileZoom]);

  const mobileBackToTopZoomStyle = useMemo<CSSProperties>(() => ({
    bottom: "calc(7rem + env(safe-area-inset-bottom))",
    ...(mobileZoom === 1
      ? {}
      : {
          transform: `scale(${mobileZoom})`,
          transformOrigin: "bottom right",
        }),
  }), [mobileZoom]);

  const decreaseMobileZoom = () => {
    setMobileZoom((current) => {
      const index = MOBILE_ZOOM_LEVELS.indexOf(current);
      return MOBILE_ZOOM_LEVELS[Math.max(0, index - 1)];
    });
  };

  const increaseMobileZoom = () => {
    setMobileZoom((current) => {
      const index = MOBILE_ZOOM_LEVELS.indexOf(current);
      return MOBILE_ZOOM_LEVELS[Math.min(MOBILE_ZOOM_LEVELS.length - 1, index + 1)];
    });
  };

  const canDecreaseMobileZoom = mobileZoom > MOBILE_ZOOM_LEVELS[0];
  const canIncreaseMobileZoom = mobileZoom < MOBILE_ZOOM_LEVELS[MOBILE_ZOOM_LEVELS.length - 1];

  const activeHudTaskTimer = runningTaskTimers.length > 0
    ? runningTaskTimers[Math.min(activeTaskTimerIndex, runningTaskTimers.length - 1)] ?? null
    : null;

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLogicalDayNow(Date.now());
    }, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setActiveTaskTimerIndex((current) => {
      if (runningTaskTimers.length === 0) {
        return 0;
      }
      return Math.max(0, Math.min(current, runningTaskTimers.length - 1));
    });
  }, [runningTaskTimers.length]);

  const shouldDeferPageRender = isRestoringPersistedUiState;
  const isAuthenticatedAppBootReady = isHudAppearanceReady && !isWorkspaceLoading && !isTaskResumeSyncPending && !shouldDeferPageRender;
  const shouldBlockAuthenticatedAppBody = !hasCompletedInitialAppBoot && !isAuthenticatedAppBootReady;
  const childTaskCreationBlockedTaskIds = taskHierarchyDiagnostics.cycleTaskIds;
  const createChildTaskFromPreview = useCallback(async (parentTaskId: string, title: string) => {
    const result = buildChildTaskCreationDraft({
      blockedParentTaskIds: childTaskCreationBlockedTaskIds,
      parentTaskId,
      title,
    });

    if (!result.ok) {
      const text = result.error === "empty_title"
        ? "Enter a child task title."
        : result.error === "blocked_parent"
          ? "Child task creation is blocked for this task until its hierarchy issue is fixed."
          : "Choose a parent task before adding a child.";
      setMessage({ tone: "warn", text });
      return { error: text, taskId: null };
    }

    const createdTask = await addTask(result.draft);
    return createdTask
      ? { error: null, taskId: createdTask.id }
      : { error: "Child task was not created.", taskId: null };
  }, [addTask, childTaskCreationBlockedTaskIds, setMessage]);
  const openChildTaskFromPreview = useCallback((taskId: string) => {
    setSuppressDetachedListNoticeTaskId(null);
    setRequestedListOverlayTaskId(taskId);
  }, []);
  const handleTaskOperationsSearchChange = useCallback((search: string) => {
    pendingTaskHighlightSubmitSearchRef.current = null;
    pendingTaskHighlightCommittedSearchRef.current = search.length > 0 ? search : null;
    if (search.length === 0) {
      setTaskHighlightShouldFocusResult(false);
      setTaskHighlightScrollToken(null);
    }
    if (isWorkspacePerformanceDiagnosticsEnabled() && typeof performance !== "undefined" && taskSearchMeasurementRef.current?.query !== search) {
      const now = performance.now();
      taskSearchMeasurementRef.current = { inputPublishedAt: now, query: search, searchStartedAt: now };
    }
    setTaskUiState((prev) => (prev.search === search ? prev : { ...prev, search }));
  }, [setTaskUiState]);
  const handleTaskOperationsSearchSubmit = useCallback((search: string) => {
    if (search !== taskUiState.search) {
      pendingTaskHighlightCommittedSearchRef.current = null;
      pendingTaskHighlightSubmitSearchRef.current = search;
      setTaskUiState((prev) => (prev.search === search ? prev : { ...prev, search }));
      return;
    }
    advanceTaskHighlightMatch();
  }, [advanceTaskHighlightMatch, setTaskUiState, taskUiState.search]);

  useEffect(() => {
    if (!session?.user) {
      return;
    }

    if (isAuthenticatedAppBootReady) {
      setHasCompletedInitialAppBoot(true);
    }
  }, [isAuthenticatedAppBootReady, session?.user]);

  const unlinkSameTableTask = useCallback(async (taskId: string) => {
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task || !task.parent_task_id) {
      return false;
    }

    const didUnlink = await applyTaskMutationWithoutHistory(
      taskId,
      { parent_task_id: null },
      { expectedTask: task },
    );
    if (!didUnlink) {
      return false;
    }

    setMessage({
      tone: "good",
      text: `"${task.title}" is now a top-level task.`,
    });
    return true;
  }, [applyTaskMutationWithoutHistory, setMessage, tasks]);
  const openMilestoneSetup = useCallback((taskId: string) => {
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task || !canPromoteTaskToMilestone(task, milestoneData.milestoneByTaskId)) {
      setMessage({ tone: "warn", text: "This task is no longer eligible for Milestone promotion." });
      return;
    }
    setMilestoneSetupTaskId(taskId);
  }, [milestoneData.milestoneByTaskId, setMessage, tasks]);
  const requestDetachAndPromoteMilestone = useCallback((taskId: string) => {
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task || !canDetachAndPromoteTaskToMilestone(task, milestoneData.milestoneByTaskId)) {
      setMessage({ tone: "warn", text: "This Step or Substep can no longer be detached for Milestone promotion." });
      return;
    }
    setPendingDetachMilestoneTaskId(taskId);
  }, [milestoneData.milestoneByTaskId, setMessage, tasks]);
  const confirmDetachAndPromoteMilestone = useCallback(async () => {
    const taskId = pendingDetachMilestoneTaskId;
    if (!taskId || isDetachingMilestoneTask) return;
    setIsDetachingMilestoneTask(true);
    const didDetach = await unlinkSameTableTask(taskId);
    setIsDetachingMilestoneTask(false);
    if (!didDetach) return;
    setPendingDetachMilestoneTaskId(null);
    setMilestoneSetupTaskId(taskId);
  }, [isDetachingMilestoneTask, pendingDetachMilestoneTaskId, unlinkSameTableTask]);
  function renderMilestoneInspectorExtension(taskId: string) {
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task) return null;
    const milestone = milestoneData.milestoneByTaskId.get(taskId) ?? null;
    const eligibility = getMilestoneEligibility(task);
    const promotionBlockedReason = milestone ? null
      : eligibility.reason === "child_task" ? "Steps and Substeps must be detached into parent tasks before Milestone promotion."
      : eligibility.reason === "indefinitely_recurring" ? "A Milestone requires a finite endpoint. Indefinitely recurring tasks are not eligible."
      : eligibility.reason === "closed_task" ? "Complete, archived, and trashed tasks cannot be promoted to Milestones."
      : null;
    return (
      <MilestoneInspectorSection
        localDate={milestoneLocalDate}
        milestone={milestone}
        nowMs={logicalDayNow}
        onAbandon={() => milestone && setPendingMilestoneLifecycle({ action: "abandon", milestoneId: milestone.id })}
        onComplete={() => requestTaskComplete(task, { source: "status" })}
        onCorrect={() => milestone && setMilestoneCorrectionId(milestone.id)}
        onPromote={() => openMilestoneSetup(task.id)}
        onReverse={() => milestone && setPendingMilestoneLifecycle({ action: "reverse", milestoneId: milestone.id })}
        promotionBlockedReason={promotionBlockedReason}
        task={task}
      />
    );
  }
  const moveTaskIntoParent = useCallback(async (taskId: string, parentTaskId: string) => {
    const task = tasks.find((entry) => entry.id === taskId);
    const parentTask = tasks.find((entry) => entry.id === parentTaskId);
    if (!task || !parentTask) {
      return false;
    }
    if (task.id === parentTask.id) {
      setMessage({ tone: "warn", text: "A task cannot become its own parent." });
      return false;
    }

    const hierarchy = buildTaskHierarchyAdapter(tasks);
    if (hierarchy.invalidTaskIds.has(task.id) || hierarchy.invalidTaskIds.has(parentTask.id)) {
      setMessage({ tone: "warn", text: "This task move is blocked until the current hierarchy issues are fixed." });
      return false;
    }

    const descendantIds = new Set(hierarchy.getDescendants(task.id).map((entry) => entry.id));
    if (descendantIds.has(parentTask.id)) {
      setMessage({ tone: "warn", text: "A task cannot move into one of its own descendants." });
      return false;
    }

    const didMove = await applyTaskMutationWithoutHistory(
      taskId,
      { parent_task_id: parentTaskId },
      { expectedTask: task },
    );
    if (!didMove) {
      return false;
    }

    setMessage({
      tone: "good",
      text: `"${task.title}" now lives under "${parentTask.title}".`,
    });
    return true;
  }, [applyTaskMutationWithoutHistory, setMessage, tasks]);

  // Delay is a user action, so it is always anchored to its logical action day
  // rather than a future (or stale) scheduled occurrence.
  const getTaskDelayAnchorDate = useCallback((_task: Task) => todayKey, [todayKey]);

  const delayTaskToDate = useCallback(async (taskId: string, nextDueOn: string | null) => {
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task || !canTaskDelay({ dueOn: task.due_on, status: task.status })) {
      return false;
    }

    const delayAnchorDate = getTaskDelayAnchorDate(task);
    if (nextDueOn !== null && nextDueOn <= delayAnchorDate) {
      return false;
    }

    {
      if (!nextDueOn) {
        setMessage({ tone: "warn", text: "Canonical Delay requires a future effective date; no legacy due_on fallback was used." });
        return false;
      }
      const didDelay = await updateTask(taskId, {}, {
        canonicalIntent: {
          type: "delay_occurrence",
          logical_date: delayAnchorDate,
          effective_due_on: nextDueOn,
        },
        expectedTask: task,
        replayIdentity: `delay:${task.id}:${delayAnchorDate}:${nextDueOn}`,
      });
      if (!didDelay) return false;
      setMessage({ tone: "good", text: `"${task.title}" was delayed until ${nextDueOn}.` });
      return true;
    }

  }, [currentUserId, dayStartTime, getTaskDelayAnchorDate, loadTaskHistoryForTasks, logicalDayNow, setMessage, supabase, tasks, todayKey, updateTask, userTimeZone]);

  const delaySameTableTask = useCallback(async (taskId: string, days: number) => {
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task || days <= 0) {
      return false;
    }

    return delayTaskToDate(taskId, shiftDateKey(getTaskDelayAnchorDate(task), days));
  }, [delayTaskToDate, getTaskDelayAnchorDate, tasks]);

  if (!supabase) {
    return <ConfigSplash />;
  }

  if (!isAuthResolved) {
    return <WorkspaceLoadingScreen theme={theme} />;
  }

  if (!session?.user) {
    return (
      <AuthSplash
        message={message}
        onOpenLocalQa={process.env.NODE_ENV !== "production" ? async ({ resetFixtures = false } = {}) => {
          try {
            const response = await fetch("/api/local-qa-session", {
              body: JSON.stringify({ resetFixtures }),
              headers: { "Content-Type": "application/json" },
              method: "POST",
            });
            const payload = await response.json() as {
              accessToken?: string;
              error?: string;
              refreshToken?: string;
              seeded?: boolean;
            };
            if (!response.ok || !payload.accessToken || !payload.refreshToken) {
              throw new Error(payload.error ?? "Local QA profile could not be loaded.");
            }

            const sessionResult = await supabase.auth.setSession({
              access_token: payload.accessToken,
              refresh_token: payload.refreshToken,
            });
            if (sessionResult.error || !sessionResult.data.session) {
              throw new Error(sessionResult.error?.message ?? "Local QA session could not be started.");
            }

            setSession(sessionResult.data.session);
            setIsAuthResolved(true);
            setMessage({
              tone: "good",
              text: resetFixtures
                ? "Local QA fixture data was restored."
                : payload.seeded
                  ? "Local QA profile was created and loaded."
                  : "Local QA profile loaded.",
            });
          } catch (error) {
            setMessage({
              tone: "warn",
              text: error instanceof Error ? error.message : "Local QA profile could not be loaded.",
            });
          }
        } : undefined}
        onAuthenticate={async ({ email, mode, password }) => {
          const response = mode === "sign-up"
            ? await supabase.auth.signUp({
                email,
                password,
              })
            : await supabase.auth.signInWithPassword({
                email,
                password,
              });

          const error = response.error;
          const needsEmailConfirmation = mode === "sign-up" && !response.data.session;

          if (response.data.session) {
            setIsAuthResolved(true);
            setSession(response.data.session);
          }

          setMessage(
            error
              ? { tone: "warn", text: error.message }
              : needsEmailConfirmation
                ? { tone: "good", text: "Account created. Check your email to confirm your address, then sign in." }
                : {
                    tone: "good",
                    text: mode === "sign-up" ? "Account created and signed in." : "Signed in successfully.",
                  },
          );
        }}
      />
    );
  }

  if (shouldBlockAuthenticatedAppBody) {
    return <WorkspaceLoadingScreen theme={theme} />;
  }

  const currentUser = session.user;

  async function handleSaveProfile(profileDraft: UserProfile) {
    const nextProfile = {
      ...profileDraft,
      email: currentUser.email ?? profileDraft.email,
      created: true,
    };

    const { error } = await client
      .from("adhdice_user_profiles")
      .upsert({
        user_id: currentUser.id,
        display_name: nextProfile.displayName,
        avatar_src: nextProfile.avatarSrc,
        logo_src: nextProfile.logoSrc,
      });

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return;
    }

    saveProfile(nextProfile, currentUser.id);
    markProfileMediaCachedForSession(currentUser.id);
    setIsAccountOpen(false);
    setMessage({ tone: "good", text: "Account profile saved." });
  }

  async function startHudTaskTimer(timer: RunningTaskTimer) {
    const task = tasks.find((candidate) => candidate.id === timer.taskId);
    const occurrence = task ? buildTaskOccurrenceIdentity(task) : null;
    const existingIndex = runningTaskTimers.findIndex((entry) => entry.taskId === timer.taskId);
    if (existingIndex >= 0) {
      const existing = runningTaskTimers[existingIndex];
      if (!existing || !occurrence || !occurrenceIdentityMatches(existing, occurrence)) {
        setMessage({ tone: "warn", text: "A task timer from another occurrence is already active. Stop or save it before starting this deadline." });
        return false;
      }
      setActiveTaskTimerIndex(existingIndex);
      return true;
    }
    setActiveTaskTimerIndex(runningTaskTimers.length);
    const started = await persistTaskTimer({
      ...timer,
      occurrenceDueOn: occurrence?.occurrenceDueOn ?? null,
      occurrenceKey: occurrence?.occurrenceKey ?? null,
      pausedAt: null,
      startedActualSeconds: timer.startedActualSeconds ?? timer.baseSeconds,
    });
    if (started) {
      setIsActiveTimersTrayOpen(true);
    }
    return Boolean(started);
  }

  function pauseHudTaskTimer(taskId: string) {
    void persistPausedTaskTimer(taskId);
  }

  function resumeHudTaskTimer(taskId: string) {
    void persistResumedTaskTimer(taskId);
  }

  function clearOnTimeExecution(origin: OnTimeLinkedItemOrigin | null | undefined) {
    if (!origin) return;
    onTimePlan.updatePlanFromCurrent((current) => clearMatchingOnTimeExecution(current, origin));
  }

  function recordOnTimeStoppedProgress(
    stoppedTimer: NonNullable<Awaited<ReturnType<typeof persistStoppedTaskTimer>>>,
    origin: OnTimeLinkedItemOrigin | null | undefined,
  ) {
    if (!origin) return;
    onTimePlan.updatePlanFromCurrent((current) => recordMatchingOnTimeStoppedProgress(current, origin, stoppedTimer.elapsedSeconds, stoppedTimer.pausedAt));
  }

  async function recordStoppedTaskTimer(stoppedTimer: Awaited<ReturnType<typeof persistStoppedTaskTimer>>) {
    if (!stoppedTimer) return false;
    const task = tasks.find((candidate) => candidate.id === stoppedTimer.taskId);
    if (!task) {
      setMessage({ tone: "warn", text: "The stopped task timer could not find its task." });
      return false;
    }
    const nextActualSeconds = (task.actual_seconds ?? 0) + Math.max(0, stoppedTimer.elapsedSeconds);
    setTasks((current) => sortTasksForUi(current.map((currentTask) => currentTask.id === task.id ? { ...currentTask, actual_seconds: nextActualSeconds } : currentTask)));
    return await updateTask(task.id, { actual_seconds: nextActualSeconds });
  }

  function stopHudTaskTimer(taskId: string, onTimeOrigin?: OnTimeLinkedItemOrigin) {
    void (async () => {
      const stoppedTimer = await persistStoppedTaskTimer(taskId);
      if (!stoppedTimer) return;
      if (await recordStoppedTaskTimer(stoppedTimer)) recordOnTimeStoppedProgress(stoppedTimer, onTimeOrigin);
    })();
  }

  async function stageTimedTaskCompletion(
    task: Task,
    _action: { kind: "complete" } | { kind: "status"; status: "done" | "did_my_best" },
    onTimeOrigin?: OnTimeLinkedItemOrigin,
  ): Promise<"none" | "staged" | "failed"> {
    const activeTimer = runningTaskTimers.find((timer) => timer.taskId === task.id);
    if (!activeTimer) {
      return "none";
    }
    const stoppedTimer = await persistStoppedTaskTimer(task.id);
    if (!stoppedTimer || !await recordStoppedTaskTimer(stoppedTimer)) return "failed";
    recordOnTimeStoppedProgress(stoppedTimer, onTimeOrigin);
    return "none";
  }

  function requestTaskTimerDiscard(taskId: string) {
    setPendingTaskTimerDiscardId(taskId);
    setIsActiveTimersTrayOpen(true);
  }

  function openSharedTaskEditor(taskId: string, options?: { initialField?: TaskEditorInitialField; preserveActivePage?: boolean; timer?: RunningTaskTimer | null }) {
    const task = tasks.find((entry) => entry.id === taskId) ?? null;
    const timer = options?.timer ?? null;
    const taskOccurrence = task ? buildTaskOccurrenceIdentity(task) : null;
    const occurrenceIsClearlyStale = Boolean(timer?.occurrenceKey && taskOccurrence?.occurrenceKey
      && !occurrenceIdentityMatches(timer, taskOccurrence));
    if (!task || task.status === "trashed" || task.status === "archived" || occurrenceIsClearlyStale) {
      setMessage({ tone: "warn", text: "Task unavailable." });
      return false;
    }

    setSuppressDetachedListNoticeTaskId(null);
    setSharedTaskEditorOverlayTaskId(taskId);
    setTaskEditorFocusRequest(options?.initialField
      ? { field: options.initialField, taskId, token: ++taskEditorFocusTokenRef.current }
      : null);
    return true;
  }

  function goToActiveTimerTask(taskId: string) {
    const timer = runningTaskTimers.find((entry) => entry.taskId === taskId) ?? null;
    if (openSharedTaskEditor(taskId, { preserveActivePage: true, timer })) {
      setIsActiveTimersTrayOpen(false);
    }
  }

  function cycleHudTaskTimer(direction: "next" | "previous") {
    setActiveTaskTimerIndex((current) => {
      if (runningTaskTimers.length <= 1) {
        return current;
      }
      return direction === "next"
        ? (current + 1) % runningTaskTimers.length
        : (current - 1 + runningTaskTimers.length) % runningTaskTimers.length;
    });
  }

  const gridContentNode = (
    <TaskGridView
      activeCount={filteredActiveTasks.length}
      currentColumns={gridColumns}
      doneCount={filteredDoneTasks.length}
      draggedWidgetId={draggedGridWidgetId}
      focusedTaskIds={focusedTaskIds}
      gridAutoRowHeight={TASK_GRID_ROW_HEIGHT}
      gridLayout={taskGridLayout}
      isEditMode={isGridEditMode}
      labelsByWidgetType={TASK_GRID_WIDGET_LABELS}
      maxColumns={TASK_GRID_MAX_COLUMNS}
      maxDisplayRows={TASK_GRID_MAX_DISPLAY_ROWS}
      message={message}
      onAddTask={async ({ focusToday, values }) => {
        await saveTaskEditor(values, { focusToday });
      }}
      onAddWidget={(widgetType) => {
        void handleAddGridWidget(widgetType);
      }}
      onImportTasks={importTasks}
      onMoveWidget={(widgetId, direction) => {
        void handleMoveGridWidget(widgetId, direction);
      }}
      onRemoveWidget={(widgetId) => {
        void handleRemoveGridWidget(widgetId);
      }}
      onReorderWidget={(targetWidgetId) => {
        void handleDropGridWidget(targetWidgetId);
      }}
      onResetLayout={() => {
        void handleResetGridLayout();
      }}
      onResizeWidget={(widgetId, nextWidth, nextHeight) => {
        void handleResizeGridWidget(widgetId, nextWidth, nextHeight);
      }}
      onEditTask={openExistingTaskEditor}
      onSelectWidget={setSelectedGridWidgetId}
      onSetStatus={(task, status) => { void updateTaskStatus(task, status); }}
      onSetSubtaskStatus={(subtaskId, status) => { void updateTaskSubtaskStatus(subtaskId, status); }}
      onSetDraggedWidget={setDraggedGridWidgetId}
      overdueCount={filteredOverdueTasks.length}
      selectedWidgetId={selectedGridWidget?.id ?? null}
      subtasksByTaskId={taskSubtasksByTaskId}
      taskHistoryStats={taskHistoryStats}
      tasksByWidget={{
        activeQueue: filteredActiveTasks,
        completed: filteredDoneTasks,
        dueToday: filteredTodayTasks,
        focusToday: filteredFocusTasks,
        urgent: filteredUrgentTasks,
      }}
      onToggleEditMode={() => {
        setIsGridEditMode((prev) => !prev);
        setSelectedGridWidgetId(null);
        setDraggedGridWidgetId(null);
      }}
    />
  );
  const matrixContentNode = (
    <TaskMatrixView
      onEditTask={openExistingTaskEditor}
      onSetStatus={(task, status) => { void updateTaskStatus(task, status); }}
      subtasksByTaskId={taskSubtasksByTaskId}
      tasks={selectedBucketTasks.filter(isTaskOpen)}
    />
  );
  const cardsContentNode = (
    <TaskCardGallery
      focusedTaskIds={focusedTaskIds}
      onEditTask={openExistingTaskEditor}
      onSetStatus={(task, status) => { void updateTaskStatus(task, status); }}
      subtasksByTaskId={taskSubtasksByTaskId}
      tasks={selectedBucketTasks}
    />
  );
  const requestedOpenListTask = requestedListOverlayTaskId
    ? tasks.find((task) => task.id === requestedListOverlayTaskId) ?? null
    : null;
  const requestedSharedTaskRow = sharedTaskEditorOverlayTaskId
    ? sharedTaskEditorRows.find((task) => task.id === sharedTaskEditorOverlayTaskId) ?? null
    : null;
  const effectiveTaskUiState = { ...taskUiState, duplicateTitleMode: duplicateTitleModeActive };
  const toggleDuplicateTitleMode = () => {
    setTaskUiState((prev) => {
      if (!duplicateTitleModeActive) {
        return {
          ...prev,
          duplicateTitleMode: true,
        };
      }

      const cleanedSearch = prev.search
        .split(/\s+/)
        .filter((token) => !DUPLICATE_TITLE_SEARCH_OPERATORS.includes(token.toLowerCase() as (typeof DUPLICATE_TITLE_SEARCH_OPERATORS)[number]))
        .join(" ")
        .trim();

      return {
        ...prev,
        duplicateTitleMode: false,
        search: cleanedSearch,
      };
    });
  };
  const nonListDailyPlanningNode = (
    <DailyPlanningPanel
      focusCount={filteredFocusTasks.length}
      inboxCount={inboxTasks.length}
      isCollapsed={isDailyPlanningCollapsed}
      missedCount={missedTasks.length}
      onOpenFocusPlanner={openFocusPlanner}
      onSetTaskRecurring={setTaskRecurringPreset}
      onToggleCollapsed={() => setIsDailyPlanningCollapsed((current) => !current)}
      onSelectBucket={setSelectedBucket}
      planningCandidates={planningCandidates}
      recurringCount={recurringTasks.length}
      routeTaskToToday={(taskId) => planTasksForToday([taskId])}
      sendTaskToLater={deferTask}
      sendTaskToWaiting={sendTaskToWaiting}
      todayCount={todayQueueTaskCount}
      waitingCount={waitingTasks.length}
    />
  );
  const clearTableColumnFilter = (dimension: "priority" | "repeat" | "title" | "lists" | "tags" | "link" | "notes") => {
    setTaskUiState((prev) => {
      if (dimension === "priority" || dimension === "repeat") {
        return {
          ...prev,
          tableColumnFilters: { ...prev.tableColumnFilters, [dimension]: [] },
        };
      }
      const nextTextFilters = { ...prev.tableColumnFilters.text };
      delete nextTextFilters[dimension];
      return {
        ...prev,
        tableColumnFilters: { ...prev.tableColumnFilters, text: nextTextFilters },
      };
    });
  };

  const nonListFilterRowsNode = (
    <FilterRows
      duplicateTitleMode={duplicateTitleModeActive}
      includeSteps={taskUiState.includeStepsByView[taskUiState.view]}
      hasActiveFilters={hasActiveTaskFilters(effectiveTaskUiState)}
      isOpen={isTaskFiltersOpen}
      matchAny={taskUiState.matchAny}
      pinnedCount={visiblePinnedTaskCount}
      pinnedFilterActive={taskUiState.selectedBucket === "pinned"}
      routineCount={visibleRoutineTaskCount}
      routineFilterActive={taskUiState.selectedBucket === "routine"}
      onReset={() => setTaskUiState((prev) => resetTaskFiltersPreservingView(prev))}
      onTogglePinnedFilter={togglePinnedFilter}
      onToggleRoutineFilter={toggleRoutineFilter}
      onToggleDuplicateTitleMode={toggleDuplicateTitleMode}
      onToggleIncludeSteps={() => setTaskUiState((prev) => ({ ...prev, includeStepsByView: { ...prev.includeStepsByView, [prev.view]: !prev.includeStepsByView[prev.view] } }))}
      onToggleEnergy={(energy) =>
        setTaskUiState((prev) => ({
          ...prev,
          energyFilters: prev.energyFilters.includes(energy)
            ? prev.energyFilters.filter((value) => value !== energy)
            : [...prev.energyFilters, energy],
        }))
      }
      onToggleMatchMode={() => setTaskUiState((prev) => ({ ...prev, matchAny: !prev.matchAny }))}
      onToggleOpen={() => setIsTaskFiltersOpen((current) => !current)}
      onToggleStatusFilter={(status) =>
        setTaskUiState((prev) => ({
          ...prev,
          statusFilters: prev.statusFilters.includes(status)
            ? prev.statusFilters.filter((value) => value !== status)
            : [...prev.statusFilters, status],
        }))
      }
      statusCounts={tableStatusCounts}
      selectedStatuses={taskUiState.statusFilters}
      selectedEnergies={taskUiState.energyFilters}
      tableColumnFilters={taskUiState.tableColumnFilters}
      onClearTableColumnFilter={clearTableColumnFilter}
    />
  );

  function handleFocusPlannerFinish() {
    void saveFocusSelection(focusDraftIds);
    setShowFocusPlanner(false);
    setMessage({
      tone: "good",
      text: focusDraftIds.length === 0
        ? "Focus list cleared for today."
        : hasFocusedToday
          ? "Focus list updated."
          : "Focus list set for today.",
    });
  }

  async function handleTaskEditorSave(draft: {
    focusToday: boolean;
    linkedNoteIds: string[];
    subtasks: TaskSubtaskDraft[];
    values: Parameters<typeof saveTaskEditor>[0];
  }) {
    if (selectedTaskForEditor && draft.values.status === "complete") {
      requestTaskComplete(selectedTaskForEditor, {
        focusToday: draft.focusToday,
        linkedNoteIds: draft.linkedNoteIds,
        source: "editor",
        subtasks: draft.subtasks,
        values: draft.values,
      });
      return;
    }

    if (
      selectedTaskForEditor
      && draft.values.status !== undefined
      && draft.values.status !== selectedTaskForEditor.status
      && isTaskStateRuntimeLifecycleTransition(selectedTaskForEditor, draft.values.status)
    ) {
      const lifecycleAction = classifyTaskStateRuntimeAction({
        task: selectedTaskForEditor as TaskStateRuntimeLocalTask,
        values: draft.values,
      });
      if (lifecycleAction.kind !== "canonical_action"
        || !["archive_task", "trash_task", "restore_task"].includes(lifecycleAction.actionType)) {
        setMessage({ tone: "warn", text: lifecycleAction.kind === "unsupported_state_mutation"
          ? lifecycleAction.reason
          : "The canonical editor lifecycle action could not be classified." });
        return;
      }
      const updated = await updateTaskStatus(selectedTaskForEditor, draft.values.status);
      if (updated) closeTaskEditorWithReset();
      return;
    }

    const requestedEngineOutcome = selectedTaskForEditor
      && draft.values.status !== selectedTaskForEditor.status
      && (draft.values.status === "done" || draft.values.status === "did_my_best" || draft.values.status === "missed")
      ? draft.values.status
      : null;
    const values = requestedEngineOutcome && selectedTaskForEditor
      ? { ...draft.values, status: selectedTaskForEditor.status }
      : draft.values;

    const savedTask = await saveTaskEditor(values, {
      focusToday: draft.focusToday,
      linkedNoteIds: draft.linkedNoteIds,
      subtasks: draft.subtasks,
      taskId: selectedTaskForEditor?.id ?? null,
    });

    if (savedTask && requestedEngineOutcome) {
      const updated = await updateTaskStatus(savedTask, requestedEngineOutcome);
      if (updated) closeTaskEditorWithReset();
      return;
    }

    if (savedTask) {
      closeTaskEditorWithReset();
    }
  }

  function openSelectedTaskHistory() {
    if (selectedTaskForEditor) {
      setTaskHistoryModalTaskId(selectedTaskForEditor.id);
      void loadTaskHistoryForTask(selectedTaskForEditor.id, { force: true });
      void loadTaskCalendarOverridesForTask(selectedTaskForEditor.id);
    }
  }

  function openTaskHistoryForTask(taskId: string) {
    setTaskHistoryModalTaskId(taskId);
    void loadTaskHistoryForTask(taskId, { force: true });
    void loadTaskCalendarOverridesForTask(taskId);
    const task = tasks.find((entry) => entry.id === taskId);
  }

  function openBatchDeleteModal() {
    setIsBatchDeleteModalOpen(true);
  }

  async function emptyTrash() {
    if (taskUiState.selectedBucket !== "trash") {
      return;
    }

    const trashTasks = tasks.filter((task) => task.status === "trashed" && task.permanently_deleted_at == null);
    if (trashTasks.length === 0) {
      return;
    }

    const taskLabel = trashTasks.length === 1 ? "task" : "tasks";
    if (!window.confirm(`Permanently delete ${trashTasks.length} ${taskLabel} from Trash? This cannot be undone.`)) {
      return;
    }

    const taskIds = trashTasks.map((task) => task.id);
    markPendingTaskMutations(taskIds);
    try {
      const result = await markTaskRowsPermanentlyDeleted(client, taskIds);
      if (result.error) {
        setMessage({ tone: "warn", text: result.error.message });
        return;
      }

      const deletedTaskIds = new Set(result.deletedTaskIds);
      if (deletedTaskIds.size > 0) {
        setTasks((current) => current.filter((task) => !deletedTaskIds.has(task.id)));
        setTaskRouting((current) => {
          const next = { ...current };
          for (const taskId of deletedTaskIds) delete next[taskId];
          return next;
        });
        clearListTaskSelection();
      }

      const skippedCount = taskIds.length - deletedTaskIds.size;
      if (deletedTaskIds.size === 0) {
        setMessage({ tone: "warn", text: "No Trash tasks were deleted because they changed before the action completed." });
      } else if (skippedCount > 0) {
        setMessage({
          tone: "warn",
          text: `Deleted ${deletedTaskIds.size} task${deletedTaskIds.size === 1 ? "" : "s"} permanently. ${skippedCount} task${skippedCount === 1 ? " was" : "s were"} left alone because it changed before deletion.`,
        });
      } else {
        setMessage({ tone: "good", text: `Deleted ${deletedTaskIds.size} task${deletedTaskIds.size === 1 ? "" : "s"} permanently.` });
      }
    } finally {
      clearPendingTaskMutations(taskIds);
    }
  }

  function restoreTaskSnapshot(task: Task, routingBucket: TaskRoutingBucket | undefined) {
    setTasks((current) => {
      const alreadyPresent = current.some((entry) => entry.id === task.id);
      const nextTasks = alreadyPresent
        ? current.map((entry) => (entry.id === task.id ? task : entry))
        : [...current, task];
      return sortTasksForUi(nextTasks);
    });
    setTaskRouting((current) => {
      const next = { ...current };
      if (routingBucket) {
        next[task.id] = routingBucket;
      } else {
        delete next[task.id];
      }
      return next;
    });
  }

  function buildCompleteTaskUpdateValues(task: Task, values?: TaskUpdate) {
    return {
      ...values,
      completed_at: values?.completed_at ?? task.completed_at ?? new Date().toISOString(),
      repeat_day_of_month: null,
      repeat_days_of_week: [],
      repeat_frequency: "none" as const,
      repeat_interval: 1,
      status: "complete" as const,
      active_occurrence_due_on: null,
      active_status_logical_date: null,
      trashed_at: null,
    } satisfies TaskUpdate;
  }

  function requestTaskComplete(
    task: Task,
    options?: {
      focusToday?: boolean;
      linkedNoteIds?: string[];
      onTimeOrigin?: OnTimeLinkedItemOrigin;
      source?: "editor" | "status";
      subtasks?: TaskSubtaskDraft[];
      values?: TaskUpdate;
    },
  ) {
    const eligibility = canTaskBeMarkedComplete(task.id, tasks);
    if (!eligibility.canComplete) {
      if (options?.source === "editor") {
        setTaskEditorStatusResetSignal({
          status: task.status,
          taskId: task.id,
          token: Date.now(),
        });
      }
      setMessage({ tone: "warn", text: COMPLETE_BLOCKED_MESSAGE });
      return false;
    }

    setPendingCompleteAction({
      focusToday: options?.focusToday,
      linkedNoteIds: options?.linkedNoteIds,
      onTimeOrigin: options?.onTimeOrigin,
      source: options?.source ?? "status",
      subtasks: options?.subtasks,
      taskId: task.id,
      values: options?.values,
    });
    return true;
  }

  async function confirmPendingTaskComplete(bypassTimedCompletion = false, authoritativeTask?: Task, actionOverride?: PendingCompleteAction | null) {
    const completeAction = actionOverride ?? pendingCompleteAction;
    const fail = (text: string) => {
      setMessage({ tone: "warn", text });
      return false;
    };
    if (!completeAction || !session?.user?.id) {
      return false;
    }

    const task = authoritativeTask ?? tasks.find((entry) => entry.id === completeAction.taskId);
    if (!task) {
      setPendingCompleteAction(null);
      return false;
    }

    const eligibility = canTaskBeMarkedComplete(task.id, tasks);
    if (!eligibility.canComplete) {
      setPendingCompleteAction(null);
      return fail(COMPLETE_BLOCKED_MESSAGE);
    }

    if (!bypassTimedCompletion) {
      const staged = await stageTimedTaskCompletion(task, { kind: "complete" }, completeAction.onTimeOrigin);
      if (staged !== "none") {
        return false;
      }
    }

    if (!milestoneData.milestoneByTaskId.has(task.id)) {
      const canonicalCommitted = await updateTask(task.id, { status: "complete" }, { expectedTask: task });
      if (!canonicalCommitted) return false;

      const linkedNoteIds = completeAction.linkedNoteIds ?? [];
      const subtasks = completeAction.subtasks ?? [];
      if (subtasks.length > 0) {
        const subtasksResult = await replaceTaskSubtasks(task.id, subtasks);
        if (!subtasksResult.saved) return fail("Task was completed canonically, but its Steps could not be saved.");
      }
      if (completeAction.source === "editor") {
        const linkedNotesSaved = await syncTaskNoteLinks(task.id, linkedNoteIds);
        if (!linkedNotesSaved) return fail("Task was completed canonically, but its linked notes could not be saved.");
        closeTaskEditorWithReset();
      }
      routeTask(task.id, null);
      if (focusedTaskIds.includes(task.id)) void saveFocusSelection(focusedTaskIds.filter((id) => id !== task.id));
      setPendingCompleteAction(null);
      clearOnTimeExecution(completeAction.onTimeOrigin);
      setMessage({ tone: "good", text: task.parent_task_id ? `"${task.title}" marked Complete and kept with its parent.` : `"${task.title}" marked Complete and moved to Archive.` });
      return true;
    }

    const activeMilestone = milestoneData.milestoneByTaskId.get(task.id);
    if (activeMilestone?.status === "active" && activeMilestone.task_trashed_at === null) {
      if (isMilestoneLifecyclePending) return false;
      const operationKey = `complete:${activeMilestone.id}`;
      const operationId = milestoneOperationIdsRef.current.get(operationKey) ?? createBrowserUuidV4();
      milestoneOperationIdsRef.current.set(operationKey, operationId);
      setIsMilestoneLifecyclePending(true);
      markPendingTaskMutations([task.id]);
      const completion = await milestoneData.completeMilestone(buildMilestoneLifecycleArgs(task, activeMilestone, operationId));
      clearPendingTaskMutations([task.id]);
      setIsMilestoneLifecyclePending(false);
      if (completion.error || !completion.result?.task_row) {
        return fail(formatMilestoneRpcError(completion.error ?? "No completed task row was returned."));
      }
      milestoneOperationIdsRef.current.delete(operationKey);
      const completedTask = completion.result.task_row;
      setTasks((current) => sortTasksForUi(mergeAuthoritativeMilestoneTask(current, completedTask)));
      const linkedNoteIds = completeAction.linkedNoteIds ?? [];
      const subtasks = completeAction.subtasks ?? [];
      if (subtasks.length > 0) {
        const subtasksResult = await replaceTaskSubtasks(task.id, subtasks);
        if (!subtasksResult.saved) return fail("The Milestone completed, but its Steps could not be saved.");
      }
      if (completeAction.source === "editor") {
        const linkedNotesSaved = await syncTaskNoteLinks(task.id, linkedNoteIds);
        if (!linkedNotesSaved) return fail("The Milestone completed, but its linked notes could not be saved.");
      }
      if (completion.result.canonicalHistoryFactId) {
        const historyLoad = (await loadTaskHistoryForTasks([task.id]))[task.id];
        if (!historyLoad || historyLoad.status !== "ready") {
          setMessage({ tone: "warn", text: historyLoad?.error ?? "Milestone committed, but History could not be refreshed." });
        } else {
          await reconcileTaskHistoryMutation(task.id, historyLoad.history, completedTask);
        }
      }
      routeTask(task.id, null);
      if (focusedTaskIds.includes(task.id)) void saveFocusSelection(focusedTaskIds.filter((id) => id !== task.id));
      if (completion.result.canonicalRewardEntitlementId) {
        await queueTaskRewards([{
          canonicalRewardEntitlementId: completion.result.canonicalRewardEntitlementId,
          previousStatus: task.status,
          task: completedTask,
        }]);
      }
      if (completeAction.source === "editor") closeTaskEditorWithReset();
      if (selectedListTaskIds.includes(task.id)) clearListTaskSelection();
      setPendingCompleteAction(null);
      setMessage({ tone: "good", text: `“${completedTask.title}” completed. ${activeMilestone.current_tier[0]!.toUpperCase() + activeMilestone.current_tier.slice(1)} trophy awarded.` });
      clearOnTimeExecution(completeAction.onTimeOrigin);
      return true;
    }

    const historyLoad = (await loadTaskHistoryForTasks([task.id]))[task.id];
    if (!historyLoad || historyLoad.status !== "ready") {
      return fail(historyLoad?.error ?? "Could not load task history. The task was not completed.");
    }
    const scopedHistory = historyLoad.history;
    const completeAuthority = evaluateTaskActionAuthority({
      history: scopedHistory,
      logicalDayRollover: dayStartTime,
      now: new Date(logicalDayNow),
      outcome: "complete",
      task,
      timezone: userTimeZone,
    });
    if (completeAuthority?.validationErrors.length) {
      return fail(completeAuthority.validationErrors[0] ?? "This task cannot be completed.");
    }
    const completeUpdateValues: TaskUpdate = {
      ...buildCompleteTaskUpdateValues(task, completeAction.values),
      ...(completeAuthority?.persistableTaskPatch.status ? { status: completeAuthority.persistableTaskPatch.status } : {}),
      ...(Object.hasOwn(completeAuthority?.persistableTaskPatch ?? {}, "dueOn") ? { due_on: completeAuthority!.persistableTaskPatch.dueOn } : {}),
      ...(Object.hasOwn(completeAuthority?.persistableTaskPatch ?? {}, "completedAt") ? { completed_at: completeAuthority!.persistableTaskPatch.completedAt } : {}),
    };
    const { conflict, data, error } = await runGuardedTaskRowUpdate(task.id, completeUpdateValues, {
      expectedTask: task,
    });

    if (error) {
      return fail(error.message);
    }

    if (conflict) {
      if (conflict.latestTask) {
        setTasks((current) => sortTasksForUi(current.map((currentTask) => currentTask.id === task.id ? conflict.latestTask ?? currentTask : currentTask)));
      }
      return fail(buildTaskUpdateConflictMessage(conflict));
    }

    if (!data) {
      return fail("Task completion succeeded, but no updated task row came back from Supabase.");
    }

    const linkedNoteIds = completeAction.linkedNoteIds ?? [];
    const subtasks = completeAction.subtasks ?? [];
    const historyEntries = completeAuthority?.mutationPlan.historyIntents.length
      ? completeAuthority.mutationPlan.historyIntents
      : [buildCompleteHistoryPayload({
        due_on: completeUpdateValues.due_on ?? task.due_on,
        id: task.id,
        repeat_frequency: task.repeat_frequency,
      }, todayKey, session.user.id)];
    const historySaved = await syncTaskHistoryEntries(
      task.id,
      "complete",
      historyEntries.map((entry) => entry.entry_date),
      { historyEntries, historySnapshot: scopedHistory },
    );

    if (!historySaved) {
      await runGuardedTaskRowUpdate(task.id, {
        completed_at: task.completed_at,
        repeat_day_of_month: task.repeat_day_of_month,
        repeat_days_of_week: task.repeat_days_of_week,
        repeat_frequency: task.repeat_frequency,
        repeat_interval: task.repeat_interval,
        status: task.status,
        trashed_at: task.trashed_at,
      }, { expectedTask: data });
      return fail("Task was updated, but its History could not be saved.");
    }

    if (subtasks.length > 0) {
      const subtasksResult = await replaceTaskSubtasks(task.id, subtasks);
      if (!subtasksResult.saved) {
        return fail("Task was marked Complete, but its Steps could not be saved.");
      }
    }

    if (completeAction.source === "editor") {
      const linkedNotesSaved = await syncTaskNoteLinks(task.id, linkedNoteIds);
      if (!linkedNotesSaved) {
        return fail("Task was marked Complete, but its linked notes could not be saved.");
      }
    }

    setTasks((current) => sortTasksForUi(current.map((currentTask) => currentTask.id === task.id ? data : currentTask)));
    routeTask(task.id, null);
    if (focusedTaskIds.includes(task.id)) {
      void saveFocusSelection(focusedTaskIds.filter((id) => id !== task.id));
    }

    await queueTaskRewards([{
      engineManaged: Boolean(completeAuthority),
      previousStatus: task.status,
      rewardEligible: completeAuthority?.rewardEligibility.eligible,
      task: data,
    }]);

    if (completeAction.source === "editor") {
      closeTaskEditorWithReset();
    }
    if (selectedListTaskIds.includes(task.id)) {
      clearListTaskSelection();
    }
    setPendingCompleteAction(null);
    setMessage({
      tone: "good",
      text: task.parent_task_id
        ? `"${data.title}" marked Complete and kept with its parent.`
        : `"${data.title}" marked Complete and moved to Archive.`,
    });
    clearOnTimeExecution(completeAction.onTimeOrigin);
    return true;
  }

  function buildTaskStatusUpdate(task: Task, status: TaskStatus) {
    const now = new Date().toISOString();

    if (status === "trashed") {
      return {
        completed_at: null,
        status,
        trashed_at: now,
      };
    }

    if (status === "archived") {
      return {
        completed_at: null,
        status,
        trashed_at: null,
      };
    }

    if (task.status === "archived" || task.status === "trashed") {
      return {
        completed_at: status === "done" || status === "did_my_best" ? task.completed_at : null,
        status,
        trashed_at: null,
      };
    }

    return { status };
  }

  async function updateTaskStatus(task: Task, status: TaskStatus, bypassTimedCompletion = false, onTimeOrigin?: OnTimeLinkedItemOrigin) {
    const canonicalTask = canonicalTasksRef.current.find((candidate) => candidate.id === task.id) ?? null;
    if (workspaceGenerationRef.current !== actionWorkspaceGeneration) {
      setMessage({ tone: "warn", text: "This task action was discarded because the workspace changed. Please try again." });
      return false;
    }
    if (!canonicalTask) {
      setMessage({ tone: "warn", text: "This task is no longer available in the current workspace." });
      return false;
    }
    if (
      task.user_id !== canonicalTask.user_id
      || task.id !== canonicalTask.id
      || task.revision !== canonicalTask.revision
    ) {
      setMessage({ tone: "warn", text: "This task changed before the action started. Please try again from the current task." });
      return false;
    }

    const activeMutation = taskStatusMutationInFlightRef.current.get(canonicalTask.id);
    if (activeMutation) {
      return await activeMutation;
    }

    const mutationPromise = Promise.resolve().then(() => runTaskStatusMutation(
      canonicalTask,
      status,
      bypassTimedCompletion,
      onTimeOrigin,
    ));
    taskStatusMutationInFlightRef.current.set(canonicalTask.id, mutationPromise);
    try {
      return await mutationPromise;
    } finally {
      if (taskStatusMutationInFlightRef.current.get(canonicalTask.id) === mutationPromise) {
        taskStatusMutationInFlightRef.current.delete(canonicalTask.id);
      }
    }
  }

  async function runTaskStatusMutation(task: Task, status: TaskStatus, bypassTimedCompletion = false, onTimeOrigin?: OnTimeLinkedItemOrigin) {
    const milestone = milestoneData.milestoneByTaskId.get(task.id);
    if ((isTaskStateRuntimeLifecycleTransition(task, status) && !milestone
      || status === "done"
      || status === "did_my_best"
      || status === "missed")) {
      if (status === "done" || status === "did_my_best") {
        if (!bypassTimedCompletion) {
          const staged = await stageTimedTaskCompletion(task, { kind: "status", status }, onTimeOrigin);
          if (staged !== "none") return false;
        }
      }
      return await updateTask(task.id, buildTaskStatusUpdate(task, status), { expectedTask: task });
    }
    if (shouldReverseCompletedMilestoneForStatusChange(task, milestone, status)) {
      setPendingMilestoneLifecycle({ action: "reverse", milestoneId: milestone!.id });
      return false;
    }
    if (status === "complete") {
      requestTaskComplete(task, { onTimeOrigin, source: "status" });
      return false;
    }

    if (status === "done" || status === "did_my_best") {
      if (!bypassTimedCompletion) {
        const staged = await stageTimedTaskCompletion(task, { kind: "status", status }, onTimeOrigin);
        if (staged !== "none") {
          return false;
        }
      }
    }

    const historyLoad = (await loadTaskHistoryForTasks([task.id]))[task.id];
    if (!historyLoad || historyLoad.status !== "ready") {
      setMessage({ tone: "warn", text: historyLoad?.error ?? "Could not load task history. The task action was not saved." });
      return false;
    }
    const scopedHistory = historyLoad.history;
    const action = status === "done" || status === "did_my_best" || status === "missed" || status === "delayed"
      ? evaluateTaskActionAuthority({
        history: scopedHistory,
        logicalDayRollover: dayStartTime,
        now: new Date(logicalDayNow),
        outcome: status,
        task,
        timezone: userTimeZone,
      })
      : null;
    if (action?.validationErrors.length) {
      setMessage({ tone: "warn", text: action.validationErrors[0] ?? "This task action is not available." });
      return false;
    }
    const values: TaskUpdate = action
      ? action.mutationPlan.taskUpdate
      : buildTaskStatusUpdate(task, status);
    const optimisticActionHistoryRows = action
      ? action.mutationPlan.history.filter((row) => row.logicalDate === action.logicalDate && row.outcome === status)
      : [];
    const actionHistoryStatus = action?.mutationPlan.historyOutcome ?? status;
    if (action) {
      const optimisticTask = { ...task, ...values } as Task;
      setTasks((current) => sortTasksForUi(current.map((candidate) => candidate.id === task.id ? optimisticTask : candidate)));
      if (optimisticActionHistoryRows.length > 0) {
        setTaskHistory((current) => {
          const next = new Map(current.map((entry) => [`${entry.task_id}:${entry.entry_date}`, entry] as const));
          for (const row of optimisticActionHistoryRows) {
            const historyInsert = taskStateHistoryRowToCanonicalIntent(row, currentUserIdText);
            next.set(`${row.taskId}:${row.logicalDate}`, {
              ...historyInsert,
              created_at: row.occurredAt,
              entry_date: row.logicalDate,
              id: row.id,
              occurrence_key: historyInsert.occurrence_key ?? null,
              occurrence_due_on: historyInsert.occurrence_due_on ?? null,
              event_type: historyInsert.event_type ?? "status",
              counted_as_due_occurrence: historyInsert.counted_as_due_occurrence ?? false,
              was_completed: historyInsert.was_completed ?? false,
              updated_at: row.occurredAt,
            });
          }
          return [...next.values()];
        });
        updateTaskHistoryForTask(task.id, (current) => {
          const next = new Map(current.map((entry) => [`${entry.task_id}:${entry.entry_date}`, entry] as const));
          for (const row of optimisticActionHistoryRows) {
            const historyInsert = taskStateHistoryRowToCanonicalIntent(row, currentUserIdText);
            next.set(`${row.taskId}:${row.logicalDate}`, {
              ...historyInsert,
              created_at: row.occurredAt,
              entry_date: row.logicalDate,
              id: row.id,
              occurrence_key: historyInsert.occurrence_key ?? null,
              occurrence_due_on: historyInsert.occurrence_due_on ?? null,
              event_type: historyInsert.event_type ?? "status",
              counted_as_due_occurrence: historyInsert.counted_as_due_occurrence ?? false,
              was_completed: historyInsert.was_completed ?? false,
              updated_at: row.occurredAt,
            });
          }
          return [...next.values()];
        });
      }
    }
    const updated = await updateTask(
      task.id,
      values,
      action || bypassTimedCompletion || status === "archived" || status === "trashed"
        ? {
          expectedTask: task,
          ...(action ? {
            engineManaged: true,
            historyStatus: actionHistoryStatus,
            historyEntry: action.mutationPlan.historyIntents.find((entry) => entry.status === status),
            historyEntries: action.mutationPlan.historyIntents,
            historySnapshot: scopedHistory,
            rewardEligible: action.rewardEligibility.eligible,
          } : {}),
        }
        : undefined,
    );
    if (action && updated !== true) {
      const optimisticIds = new Set(optimisticActionHistoryRows.map((row) => row.id));
      setTaskHistory((current) => current.filter((entry) => !optimisticIds.has(entry.id)));
      updateTaskHistoryForTask(task.id, (current) => current.filter((entry) => !optimisticIds.has(entry.id)));
      if (updated === false) {
        setTasks((current) => sortTasksForUi(current.map((candidate) => (
          candidate.id === task.id && candidate.revision === task.revision ? task : candidate
        ))));
      }
    }
    if (updated && status !== "missed" && (status === "done" || status === "did_my_best")) {
      clearOnTimeExecution(onTimeOrigin);
    }
    return updated;
  }

  async function toggleTaskPinned(taskId: string) {
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return false;
    }

    const nextPinnedAt = task.pinned_at ? null : new Date().toISOString();
    return applyTaskMutationWithoutHistory(taskId, {
      pin_order: nextPinnedAt ? task.pin_order ?? null : null,
      pinned_at: nextPinnedAt,
    }, { expectedTask: task });
  }

  async function applyTaskMutationWithoutHistory(taskId: string, values: TaskUpdate, options?: { expectedTask?: Task | null }) {
    markPendingTaskMutations?.([taskId]);
    const previousTask = options?.expectedTask ?? tasks.find((task) => task.id === taskId) ?? null;
    if (Object.keys(values).some((field) => (TASK_STATE_OWNED_UPDATE_FIELDS as readonly string[]).includes(field))) {
      const committed = await updateTask(taskId, values, { expectedTask: previousTask });
      clearPendingTaskMutations?.([taskId]);
      return committed === true;
    }
    const result = await runGuardedTaskRowUpdate(taskId, values, { expectedTask: previousTask });
    clearPendingTaskMutations?.([taskId]);

    if (result.error) {
      setMessage({ tone: "warn", text: result.error.message });
      return false;
    }

    if (result.conflict) {
      if (result.conflict.latestTask) {
        setTasks((current) => sortTasksForUi(current.map((task) => task.id === taskId ? result.conflict.latestTask ?? task : task)));
        if (
          result.conflict.latestTask.status === "done"
          || result.conflict.latestTask.status === "did_my_best"
          || result.conflict.latestTask.status === "complete"
          || result.conflict.latestTask.status === "archived"
          || result.conflict.latestTask.status === "trashed"
        ) {
          routeTask(taskId, null);
        }
      }
      setMessage({ tone: "warn", text: buildTaskUpdateConflictMessage(result.conflict) });
      return false;
    }

    if (!result.data) {
      return false;
    }

    const nextData = result.usedActualSecondsFallback && typeof values.actual_seconds === "number"
      ? { ...result.data, actual_seconds: values.actual_seconds }
      : result.data;
    setTasks((current) => sortTasksForUi(current.map((task) => task.id === taskId ? nextData : task)));
    if (
      nextData.status === "done"
      || nextData.status === "did_my_best"
      || nextData.status === "complete"
      || nextData.status === "archived"
      || nextData.status === "trashed"
    ) {
      routeTask(taskId, null);
    }

    return true;
  }

  function optimisticallyRemoveTask(taskId: string) {
    setTasks((current) => current.filter((task) => task.id !== taskId));
    setTaskRouting((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }

  async function runMilestoneTaskTrash(task: Task) {
    const milestone = milestoneData.milestoneByTaskId.get(task.id);
    if (!milestone) return { error: null, handled: false, task: null };
    const operationKey = `trash:${milestone.id}`;
    const operationId = milestoneOperationIdsRef.current.get(operationKey) ?? createBrowserUuidV4();
    milestoneOperationIdsRef.current.set(operationKey, operationId);
    const mutation = await milestoneData.trashMilestoneTask(buildMilestoneLifecycleArgs(task, milestone, operationId));
    if (mutation.error || !mutation.result) {
      return { error: formatMilestoneRpcError(mutation.error ?? "No Milestone task result was returned."), handled: true, task: null };
    }
    milestoneOperationIdsRef.current.delete(operationKey);
    return { error: null, handled: true, task: mutation.result.task_row };
  }

  async function openSingleTaskDeleteModal(taskId: string) {
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return;
    }
    const previousRoutingBucket = taskRouting[taskId];

    if (task.status === "trashed") {
      optimisticallyRemoveTask(taskId);
      const didDelete = await deleteTasks([taskId], {
        expectedTasks: new Map([[taskId, task]]),
      });
      if (!didDelete) {
        restoreTaskSnapshot(task, previousRoutingBucket);
      }
      if (selectedListTaskIds.includes(taskId)) {
        clearListTaskSelection();
      }
      return;
    }

    const milestone = milestoneData.milestoneByTaskId.get(taskId);
    if (milestone) {
      markPendingTaskMutations([taskId]);
      const mutation = await runMilestoneTaskTrash(task);
      clearPendingTaskMutations([taskId]);
      if (mutation.error || !mutation.task) {
        restoreTaskSnapshot(task, previousRoutingBucket);
        setMessage({ tone: "warn", text: mutation.error ?? "Could not move the Milestone task to Trash." });
        return;
      }
      setTasks((current) => sortTasksForUi(mergeAuthoritativeMilestoneTask(current, mutation.task)));
      setMessage({ tone: "good", text: "Task moved to trash. Its Milestone dates continue unchanged." });
      if (focusedTaskIds.includes(taskId)) void saveFocusSelection(focusedTaskIds.filter((id) => id !== taskId));
      if (selectedListTaskIds.includes(taskId)) clearListTaskSelection();
      return;
    }

    const didTrash = await updateTask(taskId, buildTaskStatusUpdate(task, "trashed"), { expectedTask: task });
    if (!didTrash) {
      restoreTaskSnapshot(task, previousRoutingBucket);
      return;
    }

    if (focusedTaskIds.includes(taskId)) {
      void saveFocusSelection(focusedTaskIds.filter((id) => id !== taskId));
    }

    if (selectedListTaskIds.includes(taskId)) {
      clearListTaskSelection();
    }
  }

  async function restoreTaskFromTrash(taskId: string) {
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return;
    }
    const previousRoutingBucket = taskRouting[taskId];
    const milestone = milestoneData.milestoneByTaskId.get(taskId);
    if (milestone) {
      const operationKey = `restore:${milestone.id}`;
      const operationId = milestoneOperationIdsRef.current.get(operationKey) ?? createBrowserUuidV4();
      milestoneOperationIdsRef.current.set(operationKey, operationId);
      markPendingTaskMutations([taskId]);
      const mutation = await milestoneData.restoreMilestoneTask(buildMilestoneLifecycleArgs(task, milestone, operationId));
      clearPendingTaskMutations([taskId]);
      if (mutation.error || !mutation.result?.task_row) {
        restoreTaskSnapshot(task, previousRoutingBucket);
        setMessage({ tone: "warn", text: formatMilestoneRpcError(mutation.error ?? "No restored task row was returned.") });
        return;
      }
      milestoneOperationIdsRef.current.delete(operationKey);
      setTasks((current) => sortTasksForUi(mergeAuthoritativeMilestoneTask(current, mutation.result!.task_row)));
      setMessage({ tone: "good", text: "Task restored. Only future Milestone reminders were recreated." });
      if (selectedListTaskIds.includes(taskId)) clearListTaskSelection();
      return;
    }
    const didRestore = await updateTask(taskId, buildTaskStatusUpdate(task, "pending"), { expectedTask: task });
    if (!didRestore) {
      restoreTaskSnapshot(task, previousRoutingBucket);
      return;
    }

    if (focusedTaskIds.includes(taskId)) {
      void saveFocusSelection(focusedTaskIds.filter((id) => id !== taskId));
    }

    if (selectedListTaskIds.includes(taskId)) {
      clearListTaskSelection();
    }
  }

  async function confirmMilestoneLifecycle(reason: string | null) {
    if (!pendingMilestoneLifecycle || isMilestoneLifecyclePending) return;
    const milestone = milestoneData.milestones.find((entry) => entry.id === pendingMilestoneLifecycle.milestoneId);
    if (!milestone) {
      setPendingMilestoneLifecycle(null);
      return;
    }
    const operationKey = `${pendingMilestoneLifecycle.action}:${milestone.id}`;
    const operationId = milestoneOperationIdsRef.current.get(operationKey) ?? createBrowserUuidV4();
    milestoneOperationIdsRef.current.set(operationKey, operationId);
    setIsMilestoneLifecyclePending(true);
    if (pendingMilestoneLifecycle.action === "abandon") {
      const mutation = await milestoneData.abandonMilestone({
        p_expected_milestone_revision: milestone.revision,
        p_milestone_id: milestone.id,
        p_operation_id: operationId,
        p_reason: reason,
      });
      setIsMilestoneLifecyclePending(false);
      if (mutation.error) {
        setMessage({ tone: "warn", text: formatMilestoneRpcError(mutation.error) });
        return;
      }
      milestoneOperationIdsRef.current.delete(operationKey);
      setPendingMilestoneLifecycle(null);
      setMessage({ tone: "good", text: "Milestone abandoned. The task was not changed." });
      return;
    }
    const task = milestone.task_id ? tasks.find((entry) => entry.id === milestone.task_id) : null;
    if (!task) {
      setIsMilestoneLifecyclePending(false);
      setMessage({ tone: "warn", text: "The attached task is no longer available." });
      return;
    }
    const mutation = await milestoneData.reverseMilestoneCompletion(buildMilestoneLifecycleArgs(task, milestone, operationId));
    setIsMilestoneLifecyclePending(false);
    milestoneOperationIdsRef.current.delete(operationKey);
    setMessage({ tone: "warn", text: formatMilestoneRpcError(mutation.error) });
  }

  function closeBatchDeleteModal() {
    setIsBatchDeleteModalOpen(false);
  }

  function confirmBatchDelete() {
    void deleteSelectedListTasks();
  }

  function openBatchEditModal() {
    setIsBatchEditModalOpen(true);
  }

  function closeBatchEditModal() {
    setIsBatchEditModalOpen(false);
  }

  function closeFocusPlanner() {
    setShowFocusPlanner(false);
  }

  function openMomentumDetails() {
    setIsMomentumListOpen(true);
  }

  function closeMomentumDetails() {
    setIsMomentumListOpen(false);
  }

  function closeTaskHistoryModal() {
    setTaskHistoryModalTaskId(null);
  }

  const batchDeleteFlow = isBatchDeleteModalOpen ? {
    count: selectedListTaskIds.length,
    onClose: closeBatchDeleteModal,
    onConfirm: confirmBatchDelete,
    previewTasks: selectedListTasks.map((task) => ({ id: task.id, title: task.title })),
  } : null;

  const batchEditFlow = isBatchEditModalOpen ? {
    allTags: allTaskTags,
    count: selectedListTaskIds.length,
    energyOptions,
    onClose: closeBatchEditModal,
    onSave: applyBatchTaskEdit,
    priorityOptions,
    repeatFrequencyOptions,
    repeatWeekdayOptions,
  } : null;

  const focusPlannerFlow = showFocusPlanner ? {
    draftIds: focusDraftIds,
    onClose: closeFocusPlanner,
    onFinish: handleFocusPlannerFinish,
    onSetDraftIds: setFocusDraftIds,
    onStepChange: setFocusPlannerStep,
    step: focusPlannerStep,
    tasks: focusPlannerTasks.length > 0 ? focusPlannerTasks : activeTasks,
    todayDateKey: todayKey,
  } : null;

  const momentumFlow = isMomentumListOpen ? {
    doneTasks: momentumMetric.doneTasks,
    onClose: closeMomentumDetails,
    remainingTasks: momentumMetric.remainingTasks,
    title: momentumMetric.label,
  } : null;

  const taskEditorFlow = isTaskEditorOpen ? {
    allTags: allTaskTags,
    client,
    currentUser,
    focusedToday: focusedTaskIds,
    mode: taskEditorMode,
    initialDraftOverride: taskEditorInitialDraft,
    onClose: closeTaskEditorWithReset,
    onOpenHistory: selectedTaskForEditor ? openSelectedTaskHistory : undefined,
    onSave: handleTaskEditorSave,
    statusResetSignal: taskEditorStatusResetSignal,
    subtasks: selectedTaskForEditor ? rawTaskSubtasksByTaskId[selectedTaskForEditor.id] ?? [] : [],
    task: selectedTaskForEditor,
    todayDateKey: todayKey,
  } : null;

  const taskHistoryModalTask = taskHistoryModalTaskId
    ? tasks.find((task) => task.id === taskHistoryModalTaskId) ?? null
    : null;
  const replaceableTaskHistoryOutcomes = new Set<TaskStatus>(["done", "did_my_best", "missed"]);
  type HistoryCalendarClearResult = {
    history: DbTaskHistory[];
    task: TaskStateRuntimeLocalTask | null;
  };
  async function clearTaskHistoryCalendarDate(
    taskId: string,
    logicalDate: string,
    replacementLabel: string,
    options?: { clearReplaceableOutcome?: boolean; currentTask?: TaskStateRuntimeLocalTask | null },
  ): Promise<HistoryCalendarClearResult | null> {
    const historySnapshot = taskHistoryByTaskId[taskId] ?? [];
    const existingEntry = historySnapshot.find((entry) => entry.entry_date === logicalDate) ?? null;
    const activeOverride = (taskCalendarOverridesByTaskId[taskId] ?? []).some((override) => override.logicalDate === logicalDate);
    const hasReplaceableOutcome = Boolean(
      options?.clearReplaceableOutcome
      && existingEntry
      && replaceableTaskHistoryOutcomes.has(existingEntry.status),
    );
    const currentTask = (options?.currentTask
      ?? canonicalTasksRef.current.find((candidate) => candidate.id === taskId)
      ?? tasks.find((candidate) => candidate.id === taskId)
      ?? null) as TaskStateRuntimeLocalTask | null;
    if (!activeOverride && !hasReplaceableOutcome) {
      return { history: historySnapshot, task: currentTask };
    }

    if (!currentTask) {
      setMessage({ tone: "warn", text: `Task wasn't updated: Could not replace the existing History status with ${replacementLabel}.` });
      return null;
    }
    let committedTask: TaskStateRuntimeLocalTask | null = null;
    const cleared = await updateTask(taskId, {}, {
      canonicalIntent: {
        type: "clear_outcome",
        logical_date: logicalDate,
        ...(existingEntry?.occurrence_key ? { occurrence_key: existingEntry.occurrence_key } : {}),
        ...(existingEntry?.occurrence_due_on ? { scheduled_due_on: existingEntry.occurrence_due_on } : {}),
      },
      expectedTask: currentTask,
      onCanonicalTaskCommitted: (nextTask) => {
        committedTask = nextTask;
      },
      replayIdentity: createTaskStateReplayIdentity(),
    });
    if (!cleared) {
      setMessage({ tone: "warn", text: `Task wasn't updated: Could not replace the existing History status with ${replacementLabel}.` });
      return null;
    }
    if (!committedTask) {
      setMessage({ tone: "warn", text: `Task was saved, but the canonical Task revision could not be carried into the replacement with ${replacementLabel}.` });
      return null;
    }

    const refreshedHistory = (await loadTaskHistoryForTasks([taskId]))[taskId];
    const refreshedOverrides = await loadTaskCalendarOverridesForTask(taskId);
    if (!refreshedHistory || refreshedHistory.status !== "ready" || refreshedOverrides === null) {
      setMessage({ tone: "warn", text: `Task was saved, but History could not be reconciled while replacing the existing status with ${replacementLabel}.` });
      return null;
    }
    await reconcileTaskHistoryMutation(taskId, refreshedHistory.history, committedTask);
    if (refreshedOverrides.some((override) => override.logicalDate === logicalDate)) {
      setMessage({ tone: "warn", text: `Task was saved, but the existing Calendar status could not be cleared while replacing it with ${replacementLabel}.` });
      return null;
    }
    return { history: refreshedHistory.history, task: committedTask };
  }

  async function setTaskHistoryNotDue(taskId: string, logicalDate: string): Promise<boolean> {
    const historySnapshot = taskHistoryByTaskId[taskId] ?? [];
    const existingEntry = historySnapshot.find((entry) => entry.entry_date === logicalDate) ?? null;
    let currentTask = canonicalTasksRef.current.find((candidate) => candidate.id === taskId)
      ?? tasks.find((candidate) => candidate.id === taskId)
      ?? null;
    if (existingEntry && replaceableTaskHistoryOutcomes.has(existingEntry.status)) {
      const clearedHistory = await clearTaskHistoryCalendarDate(taskId, logicalDate, "Not Due", { clearReplaceableOutcome: true });
      if (!clearedHistory) return false;
      currentTask = clearedHistory.task ?? currentTask;
    }

    if (!currentTask) {
      setMessage({ tone: "warn", text: "Task wasn't updated: Could not replace the existing History status with Not Due." });
      return false;
    }
    const committed = await updateTask(taskId, {}, {
      canonicalIntent: {
        type: "calendar_override",
        logical_date: logicalDate,
        override_state: "not_due",
      },
      expectedTask: currentTask,
      replayIdentity: createTaskStateReplayIdentity(),
    });
    if (!committed) {
      setMessage({ tone: "warn", text: "Task was saved, but the requested History change to Not Due did not finish correctly." });
      return false;
    }

    const refreshedHistory = (await loadTaskHistoryForTasks([taskId]))[taskId];
    const refreshedOverrides = await loadTaskCalendarOverridesForTask(taskId);
    if (!refreshedHistory || refreshedHistory.status !== "ready" || refreshedOverrides === null) {
      setMessage({ tone: "warn", text: "Task was saved, but the requested History change to Not Due could not be reconciled." });
      return false;
    }
    await reconcileTaskHistoryMutation(taskId, refreshedHistory.history);
    const conflictingEntry = refreshedHistory.history.find((entry) => entry.entry_date === logicalDate && replaceableTaskHistoryOutcomes.has(entry.status));
    const activeNotDue = refreshedOverrides.some((override) => override.logicalDate === logicalDate && override.overrideState === "not_due");
    if (conflictingEntry || !activeNotDue) {
      setMessage({ tone: "warn", text: "Task was saved, but the requested History change to Not Due could not be reconciled." });
      return false;
    }
    return true;
  }

  const taskHistoryFlow = taskHistoryModalTaskId && taskHistoryModalTask ? {
    onClose: closeTaskHistoryModal,
    onSetCalendarOverride: async (logicalDate: string, overrideState: "not_due" | "due_open"): Promise<boolean> => {
      if (!taskHistoryModalTaskId) return false;
      if (overrideState === "not_due") {
        return setTaskHistoryNotDue(taskHistoryModalTaskId, logicalDate);
      }
      const currentTask = canonicalTasksRef.current.find((candidate) => candidate.id === taskHistoryModalTaskId) ?? taskHistoryModalTask;
      const committed = await updateTask(taskHistoryModalTaskId, {}, {
        canonicalIntent: {
          type: "calendar_override",
          logical_date: logicalDate,
          override_state: overrideState,
        },
        expectedTask: currentTask,
        replayIdentity: createTaskStateReplayIdentity(),
      });
      if (committed) {
        const refreshed = await loadTaskCalendarOverridesForTask(taskHistoryModalTaskId);
        if (refreshed) {
          await refreshTaskHistoryStreakSummary(taskHistoryModalTaskId);
        }
      }
      return committed;
    },
    onSetStatuses: async (entryDates: string[], status: "clear" | "complete" | "did_my_best" | "done" | "missed"): Promise<boolean> => {
      if (!taskHistoryModalTaskId) {
        return false;
      }
      if (status === "complete") {
        if (entryDates.length !== 1) return false;
        return (await updateTaskStatus(taskHistoryModalTask, "complete")) === true;
      }
      const pendingTaskIds = [taskHistoryModalTaskId];
      beginPendingTaskMutationScope(pendingTaskIds);
      try {
        if (status !== "clear") {
          const saved = await syncTaskHistoryEntries(
            taskHistoryModalTaskId,
            status,
            entryDates,
            {
              historicalOverride: true,
              historySnapshot: taskHistoryByTaskId[taskHistoryModalTaskId] ?? [],
              syncLiveTask: true,
            },
          );
          if (!saved) {
            setMessage({ tone: "warn", text: `Task was saved, but the requested History change to ${formatTaskStatusLabel(status)} did not finish correctly.` });
            return false;
          }
          return true;
        }
        return await syncTaskHistoryEntries(
          taskHistoryModalTaskId,
          "pending",
          entryDates,
          {
            historicalOverride: status !== "clear",
            historySnapshot: taskHistoryByTaskId[taskHistoryModalTaskId] ?? [],
            syncLiveTask: true,
          },
        );
      } finally {
        endPendingTaskMutationScope(pendingTaskIds);
      }
    },
    onSetDelayedStatus: async (entryDate: string, nextDueOn: string) => {
      if (!taskHistoryModalTaskId) {
        return;
      }
      if (entryDate === todayKey) {
        const didDelay = await delayTaskToDate(taskHistoryModalTaskId, nextDueOn);
        if (!didDelay) {
          return;
        }
        return;
      }
      await syncTaskHistoryEntries(
        taskHistoryModalTaskId,
        "delayed",
        [entryDate],
        {
          historicalOverride: true,
          historicalOverrideDelayUntilDate: nextDueOn,
          historySnapshot: taskHistoryByTaskId[taskHistoryModalTaskId] ?? [],
          syncLiveTask: true,
        },
      );
    },
    task: taskHistoryModalTask,
    taskHistory: taskHistoryByTaskId[taskHistoryModalTaskId] ?? [],
    calendarOverrides: taskCalendarOverridesByTaskId[taskHistoryModalTaskId] ?? [],
    taskTitle: taskHistoryModalTask.title,
    taskHistoryLoadError: taskHistoryLoadStateByTaskId[taskHistoryModalTaskId]?.error ?? null,
    taskHistoryLoadStatus: taskHistoryLoadStateByTaskId[taskHistoryModalTaskId]?.status ?? "loading",
    onRetryTaskHistoryLoad: () => retryTaskHistoryForTask(taskHistoryModalTaskId),
    todayDateKey: todayKey,
    stateEngineContext: { logicalDayRollover: dayStartTime, now: new Date(logicalDayNow), timezone: userTimeZone },
  } : null;
  function togglePinnedFilter() {
    setTaskUiState((prev) => ({
      ...prev,
      selectedBucket: prev.selectedBucket === "pinned"
        ? (lastNonPinnedBucketRef.current === "pinned" ? DEFAULT_TASK_UI_STATE.selectedBucket : lastNonPinnedBucketRef.current)
        : "pinned",
    }));
  }
  function toggleRoutineFilter() {
    setTaskUiState((prev) => ({
      ...prev,
      selectedBucket: prev.selectedBucket === "routine"
        ? (lastNonPinnedBucketRef.current === "routine" ? DEFAULT_TASK_UI_STATE.selectedBucket : lastNonPinnedBucketRef.current)
        : "routine",
    }));
  }
  const pinnedEmptyStateMessage = taskUiState.selectedBucket === "pinned"
    ? (allOpenPinnedTaskCount === 0 ? "No pinned tasks yet." : "No pinned tasks match this view right now.")
    : "No tasks match this view right now.";
  const taskFilterRowsNode = (
    <div className="space-y-2">
      <FilterRows
        compact
        duplicateTitleMode={duplicateTitleModeActive}
        includeSteps={taskUiState.includeStepsByView[taskUiState.view]}
        hasActiveFilters={hasActiveTaskFilters(effectiveTaskUiState)}
        isOpen={isTaskFiltersOpen}
        matchAny={taskUiState.matchAny}
        pinnedCount={visiblePinnedTaskCount}
        pinnedFilterActive={taskUiState.selectedBucket === "pinned"}
        routineCount={visibleRoutineTaskCount}
        routineFilterActive={taskUiState.selectedBucket === "routine"}
        onReset={() => setTaskUiState((prev) => resetTaskFiltersPreservingView(prev))}
        onTogglePinnedFilter={togglePinnedFilter}
        onToggleRoutineFilter={toggleRoutineFilter}
        onToggleDuplicateTitleMode={toggleDuplicateTitleMode}
        onToggleIncludeSteps={() => setTaskUiState((prev) => ({ ...prev, includeStepsByView: { ...prev.includeStepsByView, [prev.view]: !prev.includeStepsByView[prev.view] } }))}
        onToggleEnergy={(energy) =>
          setTaskUiState((prev) => ({
            ...prev,
            energyFilters: prev.energyFilters.includes(energy)
              ? prev.energyFilters.filter((value) => value !== energy)
              : [...prev.energyFilters, energy],
          }))
        }
        onToggleMatchMode={() => setTaskUiState((prev) => ({ ...prev, matchAny: !prev.matchAny }))}
        onToggleOpen={() => setIsTaskFiltersOpen((current) => !current)}
        onToggleStatusFilter={(status) =>
          setTaskUiState((prev) => ({
            ...prev,
            statusFilters: prev.statusFilters.includes(status)
              ? prev.statusFilters.filter((value) => value !== status)
              : [...prev.statusFilters, status],
          }))
        }
        statusCounts={tableStatusCounts}
        selectedStatuses={taskUiState.statusFilters}
        selectedEnergies={taskUiState.energyFilters}
        tableColumnFilters={taskUiState.tableColumnFilters}
        onClearTableColumnFilter={clearTableColumnFilter}
        listSortPreference={taskUiState.view === "list" && !duplicateTitleModeActive ? activeListSortPreference : undefined}
        onListSortPreferenceChange={taskUiState.view === "list" && !duplicateTitleModeActive ? (preference) => setTaskUiState((current) => ({
          ...current,
          listSortBySurface: {
            ...current.listSortBySurface,
            [listSortSurfaceId]: preference,
          },
        })) : undefined}
      />
      {selectedManualList ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[1rem] border border-[#ece7f5] bg-[#fbfaff] px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
          <Search className="h-3.5 w-3.5 shrink-0 text-[#6f57f6] dark:text-[#c9bbff]" />
          <input
            className={`${TASK_TABLE_INPUT_CLASS} h-8 min-w-[12rem] flex-1 rounded-full py-1 text-[13px]`}
            onChange={(event) => setManualListAddTaskSearch(event.target.value)}
            placeholder={`Add existing task to ${selectedManualList.name}`}
            value={manualListAddTaskSearch}
          />
          {manualListAddTaskMatches.map((task) => (
            <TaskTableChipButton
              key={task.id}
              onClick={() => {
                void toggleTaskManualListMembership(task.id, selectedManualList.id);
                setManualListAddTaskSearch("");
              }}
              toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}
            >
              Add {task.title}
            </TaskTableChipButton>
          ))}
          {manualListAddTaskSearch.trim() && manualListAddTaskMatches.length === 0 ? (
            <span className="text-xs font-medium text-[#8a93aa] dark:text-white/45">No active tasks found</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
  const listPanelProps = {
    draggedListColumnId,
    isKeyboardShortcutsMenuOpen,
    isListColumnMenuOpen,
    keyboardShortcutsMenuRef,
    listColumnLabels: LIST_COLUMN_LABELS,
    listColumnMenuRef,
    listColumnPickerColumns: listColumnPickerColumns as AgentPlanColumnId[],
    listVisibleColumns,
    onOpenComposer: openInlineNewListTaskComposer,
    onOpenImport: () => { void openTaskImportPanel(); },
    onOpenListSettings: () => setIsTaskListSettingsOpen(true),
    onOpenCompletedMilestones: () => {
      setTaskUiState((prev) => ({ ...prev, tasksSurface: "completed_milestones" }));
    },
    onSelectBucket: setSelectedBucket,
    onReorderListColumns: reorderListColumns,
    onSetDraggedListColumnId: setDraggedListColumnId,
    onSetView: (view: TaskUiState["view"]) => setTaskUiState((prev) => ({ ...prev, view })),
    onToggleKeyboardShortcutsMenu: () => setIsKeyboardShortcutsMenuOpen((current) => !current),
    onToggleListColumn: toggleListColumn,
    onToggleListColumnMenu: () => setIsListColumnMenuOpen((current) => !current),
    onOpenArchive: () => setTaskUiState((prev) => ({ ...prev, selectedBucket: "archive" })),
    onOpenTrash: () => setTaskUiState((prev) => ({ ...prev, selectedBucket: "trash" })),
    onUpdateSearch: handleTaskOperationsSearchChange,
    search: taskUiState.search,
    selectedBucket: taskUiState.selectedBucket,
    expandAllColumnsToken,
    shrinkAllColumnsToken,
    shortcuts: TASK_KEYBOARD_SHORTCUTS,
    archiveCount: archiveFilteredTasksSorted.length,
    trashCount: trashFilteredTasksSorted.length,
    view: taskUiState.view,
  };
  const openTaskEditorFromId = (taskId: string) => {
    openSharedTaskEditor(taskId, { preserveActivePage: true });
  };
  const openTaskInSharedTasksEditorFromPaths = (taskId: string) => {
    openSharedTaskEditor(taskId, { preserveActivePage: true });
  };
  const openTaskInSharedTasksEditorFromOnTime = (taskId: string) => {
    openSharedTaskEditor(taskId, { initialField: "estimated_time" });
  };
  const closeSharedTaskEditorOverlay = () => {
    setSharedTaskEditorOverlayTaskId(null);
    setTaskEditorFocusRequest(null);
  };
  const scratchPaperData: ScratchPaperData = {
    error: scratchNotes.error,
    isLoading: scratchNotes.isLoading,
    links: scratchNotes.links,
    notes: scratchNotes.notes,
    onCreate: scratchNotes.createNote,
    onCreateTask: openScratchLinkedTaskTemplate,
    onOpenTask: openTaskEditorFromId,
    onSetStatus: scratchNotes.setNoteStatus,
    onSetTaskStatus: (taskId, status) => {
      const task = tasks.find((entry) => entry.id === taskId);
      if (!task) {
        return;
      }
      void updateTaskStatus(task, status);
    },
    onUpdate: scratchNotes.updateNote,
    tasks,
  };

  const taskOperationsHeaderProps = {
    actionLabel: hasFocusedToday ? "Refocus" : "Focus",
    activeCount: filteredActiveTasks.length,
    allListDirectoryEntries: allTaskListDirectoryEntries,
    appVersion: APP_VERSION,
    filterRowsNode: taskFilterRowsNode,
    hideSearch: duplicateTitleModeActive,
    isKeyboardShortcutsMenuOpen,
    isRailHidden: activeTaskWorkspaceTab.isRailHidden,
    isListColumnMenuOpen,
    keyboardShortcutsMenuRef,
    listColumnLabels: LIST_COLUMN_LABELS,
    listColumnMenuRef,
    listColumnPickerColumns: listColumnPickerColumns as AgentPlanColumnId[],
    listVisibleColumns,
    lists: taskListRailStructureOptions.primaryRail,
    openFolderRails: taskListRailStructureOptions.openFolderRails,
    metric: momentumMetric,
    onCycleMomentum: () => setMomentumView(getNextMomentumView(momentumView)),
    onOpenComposer: openInlineNewListTaskComposer,
    onOpenFocusPlanner: openFocusPlanner,
    onOpenImport: () => { void openTaskImportPanel(); },
    onOpenListSettings: () => setIsTaskListSettingsOpen(true),
    onOpenMomentumDetails: openMomentumDetails,
    canMoveStructureInto: (sourceItemKey: string, sourceEntityType: "folder" | "list", destinationFolderId: string) => (
      sourceEntityType === "list"
      || canMoveFolderInto(taskListFolderTree, sourceItemKey.replace(/^folder:/, ""), destinationFolderId)
    ),
    currentFolderBreadcrumbs: taskListFolderBreadcrumbs,
    currentFolderId,
    onMoveStructure: (sourceItemKey: string, sourceEntityType: "folder" | "list", destinationFolderId: string | null, targetIndex: number, generation: TaskListRailMutationGeneration) =>
      taskListFolderActions.moveItem(sourceItemKey, sourceEntityType, destinationFolderId, targetIndex, generation),
    onNavigateFolder: setCurrentFolderId,
    onOpenArchive: () => setTaskUiState((prev) => ({ ...prev, selectedBucket: "archive" })),
    onOpenTrash: () => setTaskUiState((prev) => ({ ...prev, selectedBucket: "trash" })),
    onEmptyTrash: () => { void emptyTrash(); },
    onSelectBucket: setSelectedBucket,
    onSelectDirectoryEntry: (entry: typeof allTaskListDirectoryEntries[number]) => {
      if (entry.kind === "folder") {
        setCurrentFolderId(entry.id);
        return;
      }
      setCurrentFolderId(entry.kind === "list" ? entry.folderId : null);
      setSelectedBucket(entry.id);
    },
    onToggleRail: () => setTaskWorkspaceRailHidden(!activeTaskWorkspaceTab.isRailHidden),
    onSearchSubmit: handleTaskOperationsSearchSubmit,
    onExpandAllColumns: () => setExpandAllColumnsToken((current) => current + 1),
    onShrinkAllColumns: () => setShrinkAllColumnsToken((current) => current + 1),
    onSearchChange: handleTaskOperationsSearchChange,
    onViewChange: (view: TaskUiState["view"]) => setTaskUiState((prev) => ({ ...prev, view })),
    onToggleKeyboardShortcutsMenu: () => setIsKeyboardShortcutsMenuOpen((current) => !current),
    onToggleListColumn: toggleListColumn,
    onToggleListColumnMenu: () => setIsListColumnMenuOpen((current) => !current),
    search: taskUiState.search,
    selectedBucket: taskUiState.selectedBucket,
    shortcuts: TASK_KEYBOARD_SHORTCUTS,
    archiveCount: archiveFilteredTasksSorted.length,
    trashCount: trashFilteredTasksSorted.length,
    todayCount: filteredTodayTasks.length,
    view: taskUiState.view,
  };

  const handleRenameTaskWorkspaceTab = (tabId: string, nextLabel: string) => {
    renameTaskWorkspaceTab(tabId, nextLabel);
  };
  const milestoneSetupTask = milestoneSetupTaskId ? tasks.find((task) => task.id === milestoneSetupTaskId) ?? null : null;
  const milestoneCorrection = milestoneCorrectionId ? milestoneData.milestones.find((milestone) => milestone.id === milestoneCorrectionId) ?? null : null;
  const pendingMilestoneLifecycleRecord = pendingMilestoneLifecycle
    ? milestoneData.milestones.find((milestone) => milestone.id === pendingMilestoneLifecycle.milestoneId) ?? null
    : null;
  const pendingDetachMilestoneTask = pendingDetachMilestoneTaskId ? tasks.find((task) => task.id === pendingDetachMilestoneTaskId) ?? null : null;
  const handleSharedTaskRepeatChange: NonNullable<ComponentProps<typeof TaskManagementTableV2>["onTaskRepeatChange"]> = (taskId, repeat, cadence) => {
    void updateTask(taskId, {
      repeat_frequency: repeat,
      repeat_day_of_month: repeat === "monthly" && cadence?.repeatMonthlyMode !== "ordinal_weekday"
        ? cadence?.repeatDayOfMonth ?? null
        : null,
      repeat_days_of_week: repeat === "weekly" || repeat === "custom"
        ? cadence?.repeatDaysOfWeek ?? []
        : [],
      repeat_interval: repeat === "none" ? 1 : Math.max(1, cadence?.repeatInterval ?? 1),
      repeat_monthly_mode: repeat === "monthly"
        ? cadence?.repeatMonthlyMode ?? "day_of_month"
        : "day_of_month",
      repeat_monthly_ordinal: repeat === "monthly" && cadence?.repeatMonthlyMode === "ordinal_weekday"
        ? cadence.repeatMonthlyOrdinal ?? "first"
        : null,
      repeat_monthly_weekday: repeat === "monthly" && cadence?.repeatMonthlyMode === "ordinal_weekday"
        ? cadence.repeatMonthlyWeekday ?? 1
        : null,
    });
  };

  const taskWorkspaceFlowLayer = (
    <>
      <TaskEditFlows
        batchDeleteFlow={batchDeleteFlow}
        batchEditFlow={batchEditFlow}
        completeFlow={(() => {
          if (!pendingCompleteAction) {
            return null;
          }
          const pendingCompleteTask = tasks.find((task) => task.id === pendingCompleteAction.taskId) ?? null;
          const completeFlowTask = pendingCompleteTask ?? { parent_task_id: null };
          const pendingCompleteMilestone = pendingCompleteTask ? milestoneData.milestoneByTaskId.get(pendingCompleteTask.id) : null;
          const isMilestoneComplete = pendingCompleteMilestone?.status === "active" && pendingCompleteMilestone.task_trashed_at === null;
          return {
            confirmLabel: isMilestoneComplete ? "Complete Milestone" : "Mark Complete",
            description: isMilestoneComplete
              ? "The task will be permanently completed. The locked trophy will be awarded. Aura eligibility depends on the locked target and grace dates."
              : getTaskCompleteConfirmationDescription(completeFlowTask),
            modalLabel: (pendingCompleteTask?.parent_task_id ?? null)
              ? "Mark step complete"
              : "Mark task permanently complete",
            onClose: () => setPendingCompleteAction(null),
            onConfirm: () => { void confirmPendingTaskComplete(); },
            pending: isMilestoneComplete && isMilestoneLifecyclePending,
            taskTitle: pendingCompleteTask?.title ?? "Task",
            title: isMilestoneComplete
              ? "Complete Milestone and award trophy?"
              : (pendingCompleteTask?.parent_task_id ?? null)
              ? "Mark this Step Complete?"
              : "Mark permanently Complete?",
          };
        })()}
        focusPlannerFlow={focusPlannerFlow}
        momentumFlow={momentumFlow}
        taskEditorFlow={taskEditorFlow}
        taskHistoryFlow={taskHistoryFlow}
      />
      {milestoneSetupTask ? (
        <MilestoneSetupModal
          localDate={milestoneLocalDate}
          onClose={() => setMilestoneSetupTaskId(null)}
          onLock={milestoneData.lockMilestone}
          onSuccess={(milestone) => {
            setMilestoneSetupTaskId(null);
            setMessage({ tone: "good", text: `“${milestone.task_title_snapshot}” is now a Milestone.` });
            if (milestone.task_id) openSharedTaskEditor(milestone.task_id);
          }}
          task={milestoneSetupTask}
          timezone={userTimeZone}
        />
      ) : null}
      {milestoneCorrection ? (
        <MilestoneCorrectionModal
          milestone={milestoneCorrection}
          onClose={() => setMilestoneCorrectionId(null)}
          onCorrect={milestoneData.correctMilestone}
          onSuccess={() => {
            setMilestoneCorrectionId(null);
            setMessage({ tone: "good", text: "Milestone setup corrected." });
          }}
        />
      ) : null}
      {pendingDetachMilestoneTask ? (
        <DetachAndPromoteMilestoneModal
          onCancel={() => setPendingDetachMilestoneTaskId(null)}
          onConfirm={() => { void confirmDetachAndPromoteMilestone(); }}
          pending={isDetachingMilestoneTask}
          task={pendingDetachMilestoneTask}
        />
      ) : null}
      {pendingMilestoneLifecycle && pendingMilestoneLifecycleRecord ? (
        <MilestoneLifecycleModal
          action={pendingMilestoneLifecycle.action}
          milestone={pendingMilestoneLifecycleRecord}
          onCancel={() => setPendingMilestoneLifecycle(null)}
          onConfirm={(reason) => { void confirmMilestoneLifecycle(reason); }}
          pending={isMilestoneLifecyclePending}
        />
      ) : null}
    </>
  );

  return (
    <main
      data-theme={theme}
      data-lowstim={lowStim ? "" : undefined}
      className="min-h-screen px-[15px] pb-4 pt-0 transition-colors bg-[linear-gradient(180deg,#ffffff_0%,#faf8ff_100%)] text-[#182033] dark:bg-[linear-gradient(180deg,#0d0c17_0%,#141124_100%)] dark:text-white"
    >
      {sharedTaskEditorOverlayTaskId && requestedSharedTaskRow ? (
        <TaskManagementTableV2
          allListOptions={availableTaskLists.filter(isManualTaskListDestination).map((list) => ({ id: list.id, label: list.name }))}
          allNoteOptions={availableTaskNotes.map((note) => ({ id: note.id, title: note.title }))}
          allRows={sharedTaskEditorRows}
          allTagOptions={allTaskTags}
          childTaskCreationBlockedTaskIds={childTaskCreationBlockedTaskIds}
          childTaskPreviewByParentTaskId={childTaskPreviewByParentTaskId}
          className="m-0 max-w-none p-0"
          enableInspector
          getFollowTaskDestination={getFollowTaskDestination}
          milestoneDetachPromotionTaskIds={milestoneDetachPromotionTaskIds}
          milestonePromotionTaskIds={milestonePromotionTaskIds}
          onCreateChildTask={createChildTaskFromPreview}
          onCreateTaskList={async (name) => createCustomTaskList({ membershipMode: "manual", name, rules: null })}
          onDetachAndPromoteTaskToMilestone={requestDetachAndPromoteMilestone}
          onDiscardTaskTimer={requestTaskTimerDiscard}
          onDuplicateTask={(taskId) => {
            const task = tasks.find((entry) => entry.id === taskId);
            if (task) void duplicateTaskInPlace(task);
          }}
          onFollowDetachedTask={followDetachedTask}
          onInspectorClose={closeSharedTaskEditorOverlay}
          onMoveTaskIntoParent={moveTaskIntoParent}
          onNextTaskTimer={() => cycleHudTaskTimer("next")}
          onOpenDeleteTask={(taskId) => { void openSingleTaskDeleteModal(taskId); }}
          onOpenNote={(noteId) => {
            closeSharedTaskEditorOverlay();
            setNotePageOpenNoteId(noteId);
            setActivePage("Notes");
          }}
          onOpenTaskHistory={openTaskHistoryForTask}
          onPauseTaskTimer={pauseHudTaskTimer}
          onPreviousTaskTimer={() => cycleHudTaskTimer("previous")}
          onPromoteTaskToMilestone={openMilestoneSetup}
          onReorderChildTask={(taskId, direction) => { void reorderChildTask(taskId, direction); }}
          onRequestedEditorFocusHandled={(token) => {
            setTaskEditorFocusRequest((current) => current?.token === token ? null : current);
          }}
          onRestoreTask={(taskId) => { void restoreTaskFromTrash(taskId); }}
          onResumeTaskTimer={resumeHudTaskTimer}
          onStartTaskTimer={startHudTaskTimer}
          onStopTaskTimer={stopHudTaskTimer}
          onTaskActualSecondsChange={(taskId, seconds) => { void updateTask(taskId, { actual_seconds: seconds }); }}
          onTaskDueChange={(taskId, schedule, options) => {
            const manualAction = options?.manualAction ?? (schedule.dueOn ? undefined : "unscheduled_status");
            let didPersist = false;
            const didFullyReconcile = updateTask(taskId, { due_on: schedule.dueOn || null, due_time: schedule.dueTime || null }, {
              ...(manualAction ? { manualAction } : {}),
              onCanonicalMutationPersisted: () => {
                didPersist = true;
              },
            });
            return didFullyReconcile.then((didReconcile) => didPersist || didReconcile);
          }}
          onTaskEnergyChange={(taskId, energy) => { void updateTask(taskId, { energy }); }}
          onTaskEstimatedMinutesChange={(taskId, minutes) => { void updateTask(taskId, { estimated_minutes: minutes }); }}
          onTaskLinkChange={(taskId, nextLink) => { void updateTask(taskId, { external_link_label: nextLink.label || null, external_link_url: nextLink.url || null }); }}
          onTaskLinkedNoteIdsChange={(taskId, linkedNoteIds) => { void syncTaskNoteLinks(taskId, linkedNoteIds); }}
          onTaskNotesChange={(taskId, notes) => { void updateTask(taskId, { notes: notes || null }); }}
          onTaskPinToggle={(taskId) => { void toggleTaskPinned(taskId); }}
          onTaskPriorityChange={applyTaskPriorityChange}
          onTaskRepeatChange={handleSharedTaskRepeatChange}
          onTaskStatusChange={(taskId, status) => {
            const task = tasks.find((entry) => entry.id === taskId);
            if (task) void updateTaskStatus(task, status);
          }}
          onTaskSubtaskAdd={addTaskSubtask}
          onTaskSubtaskAddChild={addChildTaskSubtask}
          onTaskSubtaskDelete={(subtaskId) => { void deleteTaskSubtask(subtaskId); }}
          onTaskSubtaskRename={(subtaskId, title) => { void renameTaskSubtask(subtaskId, title); }}
          onTaskSubtasksAutoResetChange={(taskId, subtasksAutoReset) => { void updateTask(taskId, { subtasks_auto_reset: subtasksAutoReset }); }}
          onTaskSubtaskStatusChange={(subtaskId, status) => { void updateTaskSubtaskStatus(subtaskId, status); }}
          onTaskTagsChange={(taskId, tags) => { void updateTask(taskId, { tags }); }}
          onTaskTitleChange={(taskId, title) => { void updateTask(taskId, { title }); }}
          onToggleTaskList={(taskId, listId) => { void toggleTaskManualListMembership(taskId, listId); }}
          onUnlinkTask={unlinkSameTableTask}
          overlayOnly
          renderFullInspectorExtension={renderMilestoneInspectorExtension}
          requestedEditorFocus={taskEditorFocusRequest}
          requestedOpenTask={requestedSharedTaskRow}
          requestedOpenTaskId={sharedTaskEditorOverlayTaskId}
          rows={sharedTaskEditorRows}
          runningTaskTimers={runningTaskTimers}
          selectedTaskIds={[]}
          showHeader={false}
        />
      ) : null}
      {isAccountOpen ? (
        <AccountModal
          onClose={() => setIsAccountOpen(false)}
          onSave={handleSaveProfile}
          onSignOut={() => void client.auth.signOut()}
          profile={profile}
        />
      ) : null}
      {isTaskListSettingsOpen ? (
        <TaskListSettingsModal
          currentFolderId={currentFolderId}
          energyOptions={energyOptions}
          fieldOptions={TASK_LIST_RULE_FIELD_OPTIONS}
          folders={taskListFolders}
          listCounts={visibleListCounts}
          lists={availableTaskLists.filter(isTaskListSettingsEligible)}
          onClose={() => setIsTaskListSettingsOpen(false)}
          onCreateCustomList={createCustomTaskList}
          onCreateFolder={taskListFolderActions.createFolder}
          onDeleteFolder={taskListFolderActions.deleteFolder}
          onDeleteList={deleteTaskList}
          onRenameFolder={taskListFolderActions.renameFolder}
          onSaveList={saveTaskListDefinition}
          operatorOptionsByField={TASK_LIST_RULE_OPERATOR_OPTIONS}
          taskStatusOptions={taskStatusOptions}
        />
      ) : null}
      {isImportWidgetMenuOpen ? (
        <ModalShell className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-[#ece8f8] bg-white p-6 shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]" label="Import list" onClose={() => setIsImportWidgetMenuOpen(false)}>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-[#7a63f7] dark:text-[#c9bbff]">Import</p>
                <h2 className="mt-2 text-2xl font-black text-[#1f2642] dark:text-white">Import list</h2>
                <p className="mt-2 text-sm text-[#7d88a1] dark:text-white/55">
                  Paste a rough list and turn it into calm, structured tasks without leaving list view.
                </p>
              </div>
              <button
                aria-label="Close"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f0ff] text-[#6f57f6] dark:bg-white/8 dark:text-white"
                onClick={() => setIsImportWidgetMenuOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
              <ImportWidgetCard
                embeddedInModal
                message={message}
                onImport={async (lines) => {
                  const result = await importTasks(lines);
                  if (result && result.importedCount > 0 && result.warningCount === 0 && result.errorCount === 0) {
                    setIsImportWidgetMenuOpen(false);
                  }
                }}
              />
            </div>
          </div>
        </ModalShell>
      ) : null}
      {activeRewardBankSession ? (
        <TaskRewardModal
          isDark={theme === "dark"}
          onClaim={claimPendingRewardBank}
          onClose={() => setActiveRewardBankSession(null)}
          pendingRewards={activeRewardBankSession}
        />
      ) : null}
      <div className="adhdice-hud-safe-area sticky top-0 z-30 -mx-[15px] w-[calc(100%+30px)] border-b border-[#ece8f8] bg-[var(--hud-surface)] shadow-[0_14px_34px_rgba(81,61,168,0.06)] [--hud-surface:#fff] dark:border-white/10 dark:[--hud-surface:#131021]">
        <div className="w-full">
          <div className={`w-full bg-[var(--hud-surface)] px-0 ${hudUiState.isHudCollapsed ? "py-1.5" : "py-2"}`}>
              <HudRuntimeClock active>
                {(hudNow) => {
                  const focusAlarmRemainingMs = focusAlarmEnabled && focusAlarmNextRingAt ? Math.max(0, focusAlarmNextRingAt - hudNow) : null;
                  const notificationInboxItems = [
                    ...hudNotificationBaseItems,
                    ...(focusAlarmRemainingMs !== null
                      ? [{
                          detail: `Next check-in in ${formatFocusAlarmRemaining(focusAlarmRemainingMs)}.`,
                          id: "focus-alarm",
                          title: "Focus alarm armed",
                          tone: "neutral" as const,
                        }]
                      : []),
                    ...hudNotificationEvents,
                  ].slice(0, 8);

                  return (
                    <CommandCenterHeader
                      activeHudTaskTimer={activeHudTaskTimer}
                      activeSessions={activeSessions}
                      activeTaskCount={filteredActiveTasks.length}
                      currentHudPageId={hudUiState.activeHudPageId}
                      economy={economy}
                      focusCategories={focusCategories}
                      hudUiState={hudUiState}
                      urgentTaskCount={filteredUrgentTasks.length}
                      onOpenAccount={() => setIsAccountOpen(true)}
                      onOpenComposer={openInlineNewListTaskComposer}
                      onOpenFocusPlanner={openFocusPlanner}
                      onOpenQuickCapture={() => { void openTaskImportPanel(); }}
                      onViewScratchPaper={() => setActivePage("Notes")}
                      onNextTaskTimer={() => cycleHudTaskTimer("next")}
                      onPauseTaskTimer={pauseHudTaskTimer}
                      onPreviousTaskTimer={() => cycleHudTaskTimer("previous")}
                      onResumeTaskTimer={resumeHudTaskTimer}
                      onStopTaskTimer={stopHudTaskTimer}
                      onToggleFocusTimer={(categoryId) => {
                        void handleToggleTimer(categoryId);
                      }}
                      profile={profile}
                      runningTaskTimers={runningTaskTimers}
                      setHudUiState={setHudUiState}
                      hudNow={hudNow}
                      taskTimerNow={hudNow}
                      theme={theme}
                      todayTaskCount={filteredTodayTasks.length}
                      onThemeChange={setTheme}
                      lowStim={lowStim}
                      onLowStimChange={setLowStim}
                      currentStreak={taskHistoryStats.currentStreak}
                      notificationInboxItems={notificationInboxItems}
                      isNativeIosPlatform={isNativeIosPlatform}
                      focusAlarmEnabled={focusAlarmEnabled}
                      focusAlarmIntervalMinutes={focusAlarmIntervalMinutes}
                      focusAlarmRemainingMs={focusAlarmRemainingMs}
                      onDecreaseFocusAlarmInterval={() => setFocusAlarmIntervalMinutes((current) => clampFocusAlarmInterval(current - FOCUS_ALARM_INTERVAL_STEP_MINUTES))}
                      onIncreaseFocusAlarmInterval={() => setFocusAlarmIntervalMinutes((current) => clampFocusAlarmInterval(current + FOCUS_ALARM_INTERVAL_STEP_MINUTES))}
                      onToggleFocusAlarmEnabled={() => {
                        if (focusAlarmAudioBlocked && focusAlarmEnabled) {
                          void playFocusAlarmSound({ rearmOnly: true });
                          return;
                        }

                        setFocusAlarmEnabled((current) => !current);
                        if (focusAlarmEnabled) {
                          setFocusAlarmAudioBlocked(false);
                        }
                      }}
                      mobileZoom={mobileZoom}
                      onRefreshWorkspace={() => { void handleHudRefresh(); }}
                      onDecreaseMobileZoom={decreaseMobileZoom}
                      onIncreaseMobileZoom={increaseMobileZoom}
                      refreshStatus={refreshStatus === "updating" ? "updating" : (isSoftWorkspaceRefreshing || refreshStatus === "syncing") ? "syncing" : "idle"}
                      canDecreaseMobileZoom={canDecreaseMobileZoom}
                      canIncreaseMobileZoom={canIncreaseMobileZoom}
                      onOpenPendingRewardBank={openPendingRewardBank}
                      pendingRewardDiceCount={pendingRewardDiceCount}
                      scratchPaper={scratchPaperData}
                    />
                  );
                }}
              </HudRuntimeClock>
          </div>
        </div>
      </div>
      <div className="mx-auto w-full" style={shellZoomStyle}>
        <section className="w-full pb-28">

        {batchEditProgress ? <BatchEditProgressBanner onDismiss={() => setBatchEditProgress(null)} progress={batchEditProgress} /> : message ? <StatusBanner message={message} /> : null}

        <ErrorBoundary
          key={shouldDeferPageRender ? "restoring-page" : activePage}
          fallback={<div className="flex min-h-48 items-center justify-center rounded-[1.5rem] border border-[#ece8f8] bg-white/70 px-5 py-8 text-sm font-semibold text-[#7d88a1] dark:border-white/10 dark:bg-white/6 dark:text-white/60">This workspace could not load. Switch pages and try again.</div>}
        >
        {shouldDeferPageRender ? (
          <div className="flex min-h-48 items-center justify-center rounded-[1.5rem] border border-[#ece8f8] bg-white/70 px-5 py-8 text-sm font-semibold text-[#7d88a1] dark:border-white/10 dark:bg-white/6 dark:text-white/60">
            Restoring your last page...
          </div>
        ) : activePage === "Home" ? (
          <TaskHomePage
            listMembershipsByTaskId={taskListMembershipsByTaskId}
            onCreateTask={addTask}
            onOpenTask={openTaskEditorFromId}
            onSetStatus={(task, status) => { void updateTaskStatus(task, status); }}
            taskDisplayStatusByTaskId={taskDisplayStatusByTaskId}
            calendarNowMs={logicalDayNow}
            calendarTimeZone={userTimeZone}
            tasks={tasks}
            userId={currentUserId}
          />
        ) : activePage === "Achievements" ? (
          <AchievementsPage
            achievementError={achievementProgress.error}
            achievementLoading={achievementProgress.isLoading}
            hasActivatedProfile={Boolean(achievementProgress.snapshot.profile)}
            lowStimulation={lowStim}
            logicalDayStart={dayStartTime}
            milestones={milestoneData.milestones}
            milestoneError={milestoneData.loadError}
            milestoneLoading={milestoneData.isLoading}
            model={achievementProgress.model}
            notificationError={achievementNotifications.claimError ?? achievementNotifications.seenError}
            onTriggerDevelopmentAchievementTest={achievementNotifications.enqueueDevelopmentTestAchievements}
            onOpenMilestones={() => {
              setActivePage("Tasks");
              handleTaskWorkspaceSurfaceChange("tasks");
              setTaskUiState((current) => getHomeMilestoneNavigationState("active", current));
            }}
            onOpenMilestoneTask={(taskId) => {
              setActivePage("Tasks");
              openTaskInSharedTasksEditorFromPaths(taskId);
            }}
            tasks={tasks}
            recordsClient={supabase}
            timezone={userTimeZone}
            userId={session?.user?.id ?? null}
          />
        ) : activePage === "Tasks" ? (
          <>
            {taskWorkspaceFlowLayer}
            <TasksWorkspace
              activeTabId={taskWorkspaceTabsState.activeTabId}
            onAddTab={() => createTaskWorkspaceTab({
              isRailHidden: false,
              taskUiState: {
                ...taskUiState,
                tasksSurface: "tasks",
              },
            })}
            brainstormWorkspacePanel={(
              <BrainstormWorkspace
                appVersion={APP_VERSION}
                error={brainstormState.error}
                remoteUpdateNotice={brainstormState.remoteUpdateNotice}
                state={brainstormState.state}
                syncState={brainstormState.syncState}
                updateState={brainstormState.updateState}
              />
            )}
            completedMilestonesWorkspacePanel={(
              <CompletedMilestonesWorkspace
                error={milestoneData.loadError}
                loading={milestoneData.isLoading}
                lowStimulation={lowStim}
                milestones={milestoneData.milestones}
                onOpenTask={openTaskInSharedTasksEditorFromPaths}
                tasks={tasks}
                userId={session?.user?.id ?? null}
              />
            )}
            onCloseTab={closeTaskWorkspaceTab}
            onTimeWorkspacePanel={(
              <OnTimePlannerWorkspace
                error={onTimePlan.error}
                onOpenTask={openTaskInSharedTasksEditorFromOnTime}
                onSetTaskStatus={(task, status, origin) => { void updateTaskStatus(task, status, false, origin); }}
                onPauseTimer={pauseHudTaskTimer}
                onResumeTimer={resumeHudTaskTimer}
                onStartTimer={(task, startedAt) => startHudTaskTimer({ baseSeconds: task.actual_seconds, pausedAt: null, startedActualSeconds: task.actual_seconds, startedAt, taskId: task.id, title: task.title })}
                onStopAndSaveTimer={(taskId, origin) => stopHudTaskTimer(taskId, origin)}
                plan={onTimePlan.plan}
                remoteUpdateNotice={onTimePlan.remoteUpdateNotice}
                resetPlan={onTimePlan.resetPlan}
                syncState={onTimePlan.syncState}
                taskDisplayStatusByTaskId={taskDisplayStatusByTaskId}
                tasks={tasks}
                timers={runningTaskTimers}
                updatePlan={onTimePlan.updatePlan}
                updatePlanFromCurrent={onTimePlan.updatePlanFromCurrent}
              />
            )}
            showSharedTaskEditorOverlay={false}
            onReorderTab={reorderTaskWorkspaceTab}
            onRenameTab={handleRenameTaskWorkspaceTab}
            onSurfaceChange={handleTaskWorkspaceSurfaceChange}
            onTabChange={setActiveTaskWorkspaceTab}
            operationsHeaderProps={taskOperationsHeaderProps}
            pathsWorkspacePanel={(
              <PathsWorkspace
                availableTaskLists={availableTaskLists}
                listMembershipsByTaskId={taskListMembershipsByTaskId}
                onOpenTask={openTaskInSharedTasksEditorFromPaths}
                onSetTaskStatus={(taskId, status) => {
                  const task = tasks.find((entry) => entry.id === taskId);
                  if (!task) {
                    return;
                  }
                  void updateTaskStatus(task, status);
                }}
                taskDisplayStatusByTaskId={taskDisplayStatusByTaskId}
                tasks={tasks}
                userId={currentUserId}
              />
            )}
            reportWorkspacePanel={(
              <TaskReportWorkspace
                achievementModel={achievementProgress.model}
                achievementWarning={achievementProgress.isReadyForUser ? null : achievementProgress.error ?? "Current Achievement progress is not ready for this account."}
                appVersion={APP_VERSION}
                availableTaskLists={availableTaskLists}
                focusCategories={focusCategories}
                focusDailyGoalAdjustments={focusDailyGoalAdjustments}
                focusHistory={focusHistory}
                isMembershipProjectionReady={isTaskListMembershipDataReady}
                listMembershipsByTaskId={taskListMembershipsByTaskId}
                milestones={milestoneData.milestones}
                taskHistory={taskHistory}
                tasks={tasksForActiveStatusRead}
                todayDateKey={todayKey}
                userId={currentUserId}
              />
            )}
            surface={taskUiState.tasksSurface}
            tabs={taskWorkspaceTabsState.tabs}
            view={duplicateTitleModeActive ? "table" : taskUiState.view}
            tableViewPanel={(
              duplicateTitleModeActive ? (
                <DuplicateTaskGroupsAdapter
                  duplicateGroups={duplicateTitleGroups}
                  filterRowsNode={taskFilterRowsNode}
                  listDefinitions={availableTaskLists}
                  listMembershipsByTaskId={taskListMembershipsByTaskId}
                  onClearSelection={clearListTaskSelection}
                  onOpenBatchDelete={openBatchDeleteModal}
                  onOpenBatchEdit={openBatchEditModal}
                  onOpenDeleteTask={(taskId) => { void openSingleTaskDeleteModal(taskId); }}
                  onOpenTaskEditor={openTaskEditorFromId}
                  onSelectTaskIds={selectAllVisibleListTasks}
                  onToggleTaskSelection={toggleListTaskSelection}
                  panelProps={listPanelProps}
                  selectedTaskIds={selectedListTaskIds}
                />
              ) : (
                <TasksTableAdapter
                tableProps={{
                  allListOptions: availableTaskLists.filter(isManualTaskListDestination).map((list) => ({ id: list.id, label: list.name })),
                  allNoteOptions: availableTaskNotes,
                  allTagOptions: allTaskTags,
                  allTasks: tasksForActiveStatusRead,
                  childTaskPreviewByParentTaskId,
                  hierarchyScopeKey: canonicalEntityProjection.hierarchyScopeKey,
                  columnFilters: taskUiState.tableColumnFilters,
                  energyColumnFilters: taskUiState.energyFilters,
                  statusColumnFilters: taskUiState.statusFilters,
                  onColumnFiltersChange: (tableColumnFilters) => setTaskUiState((prev) => ({ ...prev, tableColumnFilters })),
                  onEnergyColumnFiltersChange: (energyFilters) => setTaskUiState((prev) => ({ ...prev, energyFilters })),
                  onStatusColumnFiltersChange: (statusFilters) => setTaskUiState((prev) => ({ ...prev, statusFilters })),
                  childTaskCreationBlockedTaskIds,
                  highlightedActiveTaskId: activeHighlightedTaskId,
                  highlightedRevealShouldFocus: activeTaskRevealShouldFocus,
                  highlightedScrollToken: activeTaskRevealScrollToken,
                  highlightedTaskIds: taskHighlightMatches.matchedRowIds,
                  onVisibleSearchMatchIdsChange: handleTableVisibleSearchMatchIdsChange,
                  searchMatchedStepParentTaskIds: highlightedSearchMatchedStepParentTaskIds,
                  searchMatchedChildTaskIds,
                  statusMatchedChildTaskIds,
                  statusMatchedStepParentTaskIds,
                  statusFilterActive: hierarchyStatusFilterActive,
                  activeTaskTimerIndex,
                  currentListLabel: selectedBucketLabel,
                  currentListId: taskUiState.selectedBucket,
                  getFollowTaskDestination,
                  overlayNode: null,
                  onCreateTaskList: async (name) => createCustomTaskList({ membershipMode: "manual", name, rules: null }),
                  onCreateChildTask: createChildTaskFromPreview,
                  onClearSelection: clearListTaskSelection,
                  onNextTaskTimer: () => cycleHudTaskTimer("next"),
                  onOpenBatchDelete: openBatchDeleteModal,
                  onOpenBatchEdit: openBatchEditModal,
                  onOpenDeleteTask: (taskId) => { void openSingleTaskDeleteModal(taskId); },
                  onRestoreTask: (taskId) => { void restoreTaskFromTrash(taskId); },
                  onOpenTaskHistory: openTaskHistoryForTask,
                  onPauseTaskTimer: pauseHudTaskTimer,
                  onPreviousTaskTimer: () => cycleHudTaskTimer("previous"),
                  onResumeTaskTimer: resumeHudTaskTimer,
                  onSelectAllVisible: selectAllVisibleListTasks,
                  onStartTaskTimer: startHudTaskTimer,
                  onStopTaskTimer: stopHudTaskTimer,
                  onDiscardTaskTimer: requestTaskTimerDiscard,
                  onOpenNote: (noteId) => {
                    setNotePageOpenNoteId(noteId);
                    setActivePage("Notes");
                  },
                  onSetDue: (taskId, schedule, options) => {
                    const manualAction = options?.manualAction ?? (schedule.dueOn ? undefined : "unscheduled_status");
                    let didPersist = false;
                    const didFullyReconcile = updateTask(taskId, { due_on: schedule.dueOn || null, due_time: schedule.dueTime || null }, {
                      ...(manualAction ? { manualAction } : {}),
                      onCanonicalMutationPersisted: () => {
                        didPersist = true;
                      },
                    });
                    return didFullyReconcile.then((didReconcile) => didPersist || didReconcile);
                  },
                  onSetEnergy: (taskId, energy) => { void updateTask(taskId, { energy }); },
                  onSetEstimatedMinutes: (taskId, minutes) => { void updateTask(taskId, { estimated_minutes: minutes }); },
                  onSetActualSeconds: (taskId, seconds) => { void updateTask(taskId, { actual_seconds: seconds }); },
                  onSetLink: (taskId, nextLink) => { void updateTask(taskId, { external_link_label: nextLink.label || null, external_link_url: nextLink.url || null }); },
                  onOpenTaskEditor: openSharedTaskEditor,
                  onOpenTaskInNewTab: openTaskInNewWorkspaceTab,
                  onOpenChildTask: openChildTaskFromPreview,
                  onMoveTaskIntoParent: moveTaskIntoParent,
                  onReorderChildTask: (taskId, direction) => { void reorderChildTask(taskId, direction); },
                  onFollowDetachedTask: followDetachedTask,
                  onDismissDetachedTask: dismissDetachedTask,
                  onDuplicateTask: (taskId) => {
                    const task = tasks.find((entry) => entry.id === taskId);
                    if (task) {
                      void duplicateTaskInPlace(task);
                    }
                  },
                  onDelayTask: (taskId, days) => delaySameTableTask(taskId, days),
                  onDelayTaskUntil: (taskId, dueOn) => delayTaskToDate(taskId, dueOn),
                  onRequestedOpenTaskHandled: (taskId) => {
                    setRequestedListOverlayTaskId((current) => (current === taskId ? null : current));
                  },
                  requestedEditorFocus: taskEditorFocusRequest,
                  onRequestedEditorFocusHandled: (token) => {
                    setTaskEditorFocusRequest((current) => current?.token === token ? null : current);
                  },
                  onRequestedOpenTaskOverlayClose: closeSharedTaskEditorOverlay,
                  onSetLinkedNoteIds: (taskId, linkedNoteIds) => { void syncTaskNoteLinks(taskId, linkedNoteIds); },
                  onSetNotes: (taskId, notes) => { void updateTask(taskId, { notes: notes || null }); },
                  onSetPriority: applyTaskPriorityChange,
                  onTogglePinned: (taskId) => { void toggleTaskPinned(taskId); },
                  onSetRepeat: (taskId, repeat, cadence) => {
                    void updateTask(taskId, {
                      repeat_frequency: repeat,
                      ...(cadence
                        ? {
                          repeat_day_of_month: repeat === "monthly" && cadence.repeatMonthlyMode !== "ordinal_weekday"
                            ? cadence.repeatDayOfMonth
                            : null,
                          repeat_days_of_week: repeat === "weekly" || repeat === "custom" ? cadence.repeatDaysOfWeek : [],
                          repeat_interval: repeat === "none" ? 1 : Math.max(1, cadence.repeatInterval),
                          repeat_monthly_mode: repeat === "monthly"
                            ? (cadence.repeatMonthlyMode ?? "day_of_month")
                            : "day_of_month",
                          repeat_monthly_ordinal: repeat === "monthly" && cadence.repeatMonthlyMode === "ordinal_weekday"
                            ? (cadence.repeatMonthlyOrdinal ?? "first")
                            : null,
                          repeat_monthly_weekday: repeat === "monthly" && cadence.repeatMonthlyMode === "ordinal_weekday"
                            ? (cadence.repeatMonthlyWeekday ?? 1)
                            : null,
                        }
                        : {
                          repeat_monthly_mode: repeat === "monthly" ? "day_of_month" : "day_of_month",
                          repeat_monthly_ordinal: null,
                          repeat_monthly_weekday: null,
                        }),
                    });
                  },
                  onSetStatus: (taskId, status, expectedTask, scrollAnchorTaskIds, options) => {
                    const task = expectedTask ?? tasks.find((entry) => entry.id === taskId);
                    if (!task) {
                      return;
                    }
                    if (!options?.suppressSharedScrollAnchor) {
                      queueStatusChangeScrollAnchor(taskId, scrollAnchorTaskIds);
                    }
                    void updateTaskStatus(task, status);
                  },
                  onAddTaskSubtask: (taskId) => addTaskSubtask(taskId),
                  onAddChildTaskSubtask: (subtaskId) => addChildTaskSubtask(subtaskId),
                  onDeleteTaskSubtask: (subtaskId) => { void deleteTaskSubtask(subtaskId); },
                  onRenameTaskSubtask: (subtaskId, title) => { void renameTaskSubtask(subtaskId, title); },
                  onSetTaskSubtaskStatus: (subtaskId, status) => { void updateTaskSubtaskStatus(subtaskId, status); },
                  onSetTaskSubtasksAutoReset: (taskId, subtasksAutoReset) => { void updateTask(taskId, { subtasks_auto_reset: subtasksAutoReset }); },
                  onSetTags: (taskId, tags) => { void updateTask(taskId, { tags }); },
                  onSetTitle: (taskId, title) => { void updateTask(taskId, { title }); },
                  onToggleTaskSelection: toggleListTaskSelection,
                  onToggleTaskList: (taskId, listId) => { void toggleTaskManualListMembership(taskId, listId); },
                  onUnlinkTask: (taskId) => unlinkSameTableTask(taskId),
                  onPromoteTaskToMilestone: openMilestoneSetup,
                  onDetachAndPromoteTaskToMilestone: requestDetachAndPromoteMilestone,
                  milestonePromotionTaskIds,
                  milestoneDetachPromotionTaskIds,
                  renderFullInspectorExtension: renderMilestoneInspectorExtension,
                  requestedOpenTask: requestedOpenListTask,
                  requestedOpenTaskId: requestedListOverlayTaskId,
                  overlayOnly: false,
                  suppressDetachedNoticeTaskId: suppressDetachedListNoticeTaskId,
                  runningTaskTimers,
                  selectedTaskIds: selectedListTaskIds,
                  tasks: selectedBucketTasks,
                  rowContext: taskRowContext,
                  taskTableLayoutPreferences,
                  onTaskTableLayoutPreferencesChange: setTaskTableLayoutPreferences,
                  emptyStateMessage: pinnedEmptyStateMessage,
                }}
                filterRowsNode={taskFilterRowsNode}
                panelProps={listPanelProps}
              />
              )
            )}
            listViewPanel={(
              <TasksListAdapter
                currentListLabel={selectedBucketLabel}
                filterRowsNode={taskFilterRowsNode}
                listSortPreference={activeListSortPreference}
                onToggleFocusToday={toggleFocusTodayForTask}
                panelProps={listPanelProps}
                selectedBucket={taskUiState.selectedBucket}
                tableProps={{
                  currentListId: taskUiState.selectedBucket,
                  allListOptions: availableTaskLists.filter(isManualTaskListDestination).map((list) => ({ id: list.id, label: list.name })),
                  allNoteOptions: availableTaskNotes,
                  allTagOptions: allTaskTags,
                  allTasks: tasksForActiveStatusRead,
                  childTaskPreviewByParentTaskId,
                  hierarchyScopeKey: canonicalEntityProjection.hierarchyScopeKey,
                  columnFilters: taskUiState.tableColumnFilters,
                  energyColumnFilters: taskUiState.energyFilters,
                  statusColumnFilters: taskUiState.statusFilters,
                  onColumnFiltersChange: (tableColumnFilters) => setTaskUiState((prev) => ({ ...prev, tableColumnFilters })),
                  onEnergyColumnFiltersChange: (energyFilters) => setTaskUiState((prev) => ({ ...prev, energyFilters })),
                  onStatusColumnFiltersChange: (statusFilters) => setTaskUiState((prev) => ({ ...prev, statusFilters })),
                  childTaskCreationBlockedTaskIds,
                  highlightedActiveTaskId: activeHighlightedTaskId,
                  highlightedRevealShouldFocus: activeTaskRevealShouldFocus,
                  highlightedScrollToken: activeTaskRevealScrollToken,
                  highlightedTaskIds: taskHighlightMatches.matchedRowIds,
                  searchMatchedStepParentTaskIds: highlightedSearchMatchedStepParentTaskIds,
                  searchMatchedChildTaskIds,
                  statusMatchedChildTaskIds,
                  statusMatchedStepParentTaskIds,
                  statusFilterActive: hierarchyStatusFilterActive,
                  activeTaskTimerIndex,
                  currentListLabel: selectedBucketLabel,
                  getFollowTaskDestination,
                  overlayNode: null,
                  onCreateTaskList: async (name) => createCustomTaskList({ membershipMode: "manual", name, rules: null }),
                  onCreateChildTask: createChildTaskFromPreview,
                  onClearSelection: clearListTaskSelection,
                  onNextTaskTimer: () => cycleHudTaskTimer("next"),
                  onOpenBatchDelete: openBatchDeleteModal,
                  onOpenBatchEdit: openBatchEditModal,
                  onOpenDeleteTask: (taskId) => { void openSingleTaskDeleteModal(taskId); },
                  onRestoreTask: (taskId) => { void restoreTaskFromTrash(taskId); },
                  onOpenTaskHistory: openTaskHistoryForTask,
                  onPauseTaskTimer: pauseHudTaskTimer,
                  onPreviousTaskTimer: () => cycleHudTaskTimer("previous"),
                  onResumeTaskTimer: resumeHudTaskTimer,
                  onSelectAllVisible: selectAllVisibleListTasks,
                  onStartTaskTimer: startHudTaskTimer,
                  onStopTaskTimer: stopHudTaskTimer,
                  onDiscardTaskTimer: requestTaskTimerDiscard,
                  onOpenNote: (noteId) => {
                    setNotePageOpenNoteId(noteId);
                    setActivePage("Notes");
                  },
                  onSetDue: (taskId, schedule, options) => {
                    const manualAction = options?.manualAction ?? (schedule.dueOn ? undefined : "unscheduled_status");
                    let didPersist = false;
                    const didFullyReconcile = updateTask(taskId, { due_on: schedule.dueOn || null, due_time: schedule.dueTime || null }, {
                      ...(manualAction ? { manualAction } : {}),
                      onCanonicalMutationPersisted: () => {
                        didPersist = true;
                      },
                    });
                    return didFullyReconcile.then((didReconcile) => didPersist || didReconcile);
                  },
                  onSetEnergy: (taskId, energy) => { void updateTask(taskId, { energy }); },
                  onSetEstimatedMinutes: (taskId, minutes) => { void updateTask(taskId, { estimated_minutes: minutes }); },
                  onSetActualSeconds: (taskId, seconds) => { void updateTask(taskId, { actual_seconds: seconds }); },
                  onSetLink: (taskId, nextLink) => { void updateTask(taskId, { external_link_label: nextLink.label || null, external_link_url: nextLink.url || null }); },
                  onOpenTaskEditor: (taskId) => setRequestedListOverlayTaskId(taskId),
                  onOpenTaskInNewTab: openTaskInNewWorkspaceTab,
                  onOpenChildTask: openChildTaskFromPreview,
                  onMoveTaskIntoParent: moveTaskIntoParent,
                  onReorderChildTask: (taskId, direction) => { void reorderChildTask(taskId, direction); },
                  onFollowDetachedTask: followDetachedTask,
                  onDismissDetachedTask: dismissDetachedTask,
                  onDuplicateTask: (taskId) => {
                    const task = tasks.find((entry) => entry.id === taskId);
                    if (task) {
                      void duplicateTaskInPlace(task);
                    }
                  },
                  onDelayTask: (taskId, days) => delaySameTableTask(taskId, days),
                  onDelayTaskUntil: (taskId, dueOn) => delayTaskToDate(taskId, dueOn),
                  onRequestedOpenTaskHandled: (taskId) => {
                    setRequestedListOverlayTaskId((current) => (current === taskId ? null : current));
                  },
                  onSetLinkedNoteIds: (taskId, linkedNoteIds) => { void syncTaskNoteLinks(taskId, linkedNoteIds); },
                  onSetNotes: (taskId, notes) => { void updateTask(taskId, { notes: notes || null }); },
                  onSetPriority: applyTaskPriorityChange,
                  onTogglePinned: (taskId) => { void toggleTaskPinned(taskId); },
                  onSetRepeat: (taskId, repeat, cadence) => {
                    void updateTask(taskId, {
                      repeat_frequency: repeat,
                      ...(cadence
                        ? {
                          repeat_day_of_month: repeat === "monthly" && cadence.repeatMonthlyMode !== "ordinal_weekday"
                            ? cadence.repeatDayOfMonth
                            : null,
                          repeat_days_of_week: repeat === "weekly" || repeat === "custom" ? cadence.repeatDaysOfWeek : [],
                          repeat_interval: repeat === "none" ? 1 : Math.max(1, cadence.repeatInterval),
                          repeat_monthly_mode: repeat === "monthly"
                            ? (cadence.repeatMonthlyMode ?? "day_of_month")
                            : "day_of_month",
                          repeat_monthly_ordinal: repeat === "monthly" && cadence.repeatMonthlyMode === "ordinal_weekday"
                            ? (cadence.repeatMonthlyOrdinal ?? "first")
                            : null,
                          repeat_monthly_weekday: repeat === "monthly" && cadence.repeatMonthlyMode === "ordinal_weekday"
                            ? (cadence.repeatMonthlyWeekday ?? 1)
                            : null,
                        }
                        : {
                          repeat_monthly_mode: repeat === "monthly" ? "day_of_month" : "day_of_month",
                          repeat_monthly_ordinal: null,
                          repeat_monthly_weekday: null,
                        }),
                    });
                  },
                  onSetStatus: (taskId, status, expectedTask, scrollAnchorTaskIds, options) => {
                    const task = expectedTask ?? tasks.find((entry) => entry.id === taskId);
                    if (!task) {
                      return;
                    }
                    if (!options?.suppressSharedScrollAnchor) {
                      queueStatusChangeScrollAnchor(taskId, scrollAnchorTaskIds);
                    }
                    void updateTaskStatus(task, status);
                  },
                  onAddTaskSubtask: (taskId) => addTaskSubtask(taskId),
                  onAddChildTaskSubtask: (subtaskId) => addChildTaskSubtask(subtaskId),
                  onDeleteTaskSubtask: (subtaskId) => { void deleteTaskSubtask(subtaskId); },
                  onRenameTaskSubtask: (subtaskId, title) => { void renameTaskSubtask(subtaskId, title); },
                  onSetTaskSubtaskStatus: (subtaskId, status) => { void updateTaskSubtaskStatus(subtaskId, status); },
                  onSetTaskSubtasksAutoReset: (taskId, subtasksAutoReset) => { void updateTask(taskId, { subtasks_auto_reset: subtasksAutoReset }); },
                  onSetTags: (taskId, tags) => { void updateTask(taskId, { tags }); },
                  onSetTitle: (taskId, title) => { void updateTask(taskId, { title }); },
                  onToggleTaskSelection: toggleListTaskSelection,
                  onToggleTaskList: (taskId, listId) => { void toggleTaskManualListMembership(taskId, listId); },
                  onUnlinkTask: (taskId) => unlinkSameTableTask(taskId),
                  onPromoteTaskToMilestone: openMilestoneSetup,
                  onDetachAndPromoteTaskToMilestone: requestDetachAndPromoteMilestone,
                  milestonePromotionTaskIds,
                  milestoneDetachPromotionTaskIds,
                  renderFullInspectorExtension: renderMilestoneInspectorExtension,
                  requestedOpenTask: requestedOpenListTask,
                  requestedOpenTaskId: requestedListOverlayTaskId,
                  suppressDetachedNoticeTaskId: suppressDetachedListNoticeTaskId,
                  runningTaskTimers,
                  selectedTaskIds: selectedListTaskIds,
                  tasks: selectedBucketTasks,
                  rowContext: taskRowContext,
                  taskTableLayoutPreferences,
                  onTaskTableLayoutPreferencesChange: setTaskTableLayoutPreferences,
                  emptyStateMessage: pinnedEmptyStateMessage,
                  statusChangeScrollAnchorTaskIds: statusChangeScrollAnchor?.candidateTaskIds,
                  statusChangeScrollPreviousVisibleTaskIds: statusChangeScrollAnchor?.previousVisibleTaskIds,
                  statusChangeScrollSourceTaskId: statusChangeScrollAnchor?.sourceTaskId ?? null,
                  statusChangeScrollToken: statusChangeScrollAnchor?.token ?? null,
                }}
              />
            )}
            alternateViewPanel={(
              <TasksNonListShell
                cardsNode={cardsContentNode}
                dailyPlanningNode={nonListDailyPlanningNode}
                filterRowsNode={nonListFilterRowsNode}
                gridNode={gridContentNode}
                listNode={null}
                matrixNode={matrixContentNode}
                view={taskUiState.view}
              />
            )}
            />
          </>
        ) : activePage === "Focus" ? (
          <FocusPage
            activeSessions={activeSessions}
            adjustments={focusDailyGoalAdjustments}
            categories={getDisplayFocusCategories(focusCategories, activeSessions)}
            counters={focusCounters}
            counterHistory={focusCounterHistory}
            history={focusHistory}
            onAdjustCounter={handleAdjustFocusCounter}
            onAdjustTimer={handleAdjustTimer}
            onCreateCounter={handleCreateFocusCounter}
            onDeleteCounter={handleDeleteFocusCounter}
            onDeleteTimer={(categoryId) => {
              if (isSystemCountdownCategoryId(categoryId) && activeCountdownAlertSessionKey) {
                dismissCountdownFinishedAlert();
              }
              void handleDeleteTimer(categoryId);
            }}
            onResetTimer={(categoryId) => {
              if (isSystemCountdownCategoryId(categoryId) && activeCountdownAlertSessionKey) {
                dismissCountdownFinishedAlert();
              }
              return handleResetTimer(categoryId);
            }}
            onFinishTimer={handleFinishTimer}
            onLogManual={handleManualFocusEntry}
            onSetCountdownTarget={(categoryId, targetSeconds, options) => {
              void handleSetCountdownTarget(categoryId, targetSeconds, options);
            }}
            onToggleTimer={(categoryId, options) => {
              return handleToggleTimer(categoryId, options);
            }}
            onUpdateCounter={handleUpdateFocusCounter}
            onUpdateHistoryEntry={handleUpdateFocusHistoryEntry}
            onDeleteHistoryEntry={handleDeleteFocusHistoryEntry}
            onDeleteCategory={handleDeleteFocusCategory}
            onDismissDailyGoalSurplus={() => setPendingDailyGoalSurplus(null)}
            onSaveDailyGoalAdjustment={handleSaveDailyGoalAdjustment}
            onUpdateCategories={handleSaveCategories}
            pendingDailyGoalSurplus={pendingDailyGoalSurplus}
            focusReallocationMode={focusReallocationMode}
            onSetFocusReallocationMode={setFocusReallocationMode}
          />
        ) : activePage === "Health" ? (
          <TaskHealthPage
            awards={healthAwards}
            archiveGoal={archiveFitnessGoal}
            archivePlan={archiveFitnessPlan}
            archivePlanItem={archiveFitnessPlanItem}
            checkIns={healthCheckIns}
            createPlan={createFitnessPlan}
            createPlanItem={createFitnessPlanItem}
            createGoal={createFitnessGoal}
            createLevel={createFitnessGoalLevel}
            deleteFavoriteFood={deleteFavoriteFood}
            deleteMealEntry={deleteMealEntry}
            deleteRecipe={deleteHealthRecipe}
            deleteSavedMeal={deleteHealthSavedMeal}
            deleteWaterEntry={deleteHealthWaterEntry}
            deleteWorkout={deleteHealthWorkoutWithStructuredDetails}
            deleteLevel={deleteFitnessGoalLevel}
            archiveExercise={archiveExercise}
            createExercise={createExercise}
            reorderExercises={reorderExercises}
            fitnessSessionError={fitnessSessionError}
            fitnessSessionLoaded={fitnessSessionLoaded}
            fitnessSessionLoading={fitnessSessionLoading}
            exerciseLibrary={exerciseLibrary}
            getWorkoutSessionDetails={getWorkoutSessionDetails}
            saveWorkoutSessionDetails={saveWorkoutSessionDetails}
            updateExercise={updateExercise}
            updateGoal={updateFitnessGoal}
            updateLevel={updateFitnessGoalLevel}
            workoutExercises={workoutExercises}
            workoutSets={workoutSets}
            deleteWeightEntry={deleteWeightEntry}
            favorites={healthFavorites}
            fitnessPlanError={fitnessPlanError}
            fitnessPlansLoading={fitnessPlansLoading}
            fitnessGoalsError={fitnessGoalsError}
            fitnessGoalsLoading={fitnessGoalsLoading}
            fitnessGoals={fitnessGoals}
            fitnessGoalLevels={fitnessGoalLevels}
            planItems={fitnessPlanItems}
            plans={fitnessPlans}
            focusCategories={focusCategories}
            focusHistory={focusHistory}
            importAudits={healthImportAudits}
            isLoading={isHealthLoading}
            importAppleHealthData={importAppleHealthData}
            mealEntries={healthMealEntries}
            mealPlanEntries={healthMealPlanEntries}
            symptoms={healthSymptoms}
            symptomEntries={healthSymptomEntries}
            createSymptom={createHealthSymptom}
            renameSymptom={renameHealthSymptom}
            archiveSymptom={archiveHealthSymptom}
            addSymptomEntry={addHealthSymptomEntry}
            updateSymptomEntry={updateHealthSymptomEntry}
            deleteSymptomEntry={deleteHealthSymptomEntry}
            metricEntries={healthMetricEntries}
            onOpenReminderTemplate={openHealthReminderTemplate}
            sleepCategory={sleepCategory}
            sleepActiveSession={sleepActiveSession}
            onToggleSleepClock={onToggleSleepClock}
            onFinishSleepClock={onFinishSleepClock}
            onLogManualSleep={onLogManualSleep}
            onUpdateSleepSession={onUpdateSleepSession}
            profile={healthProfile}
            recipes={healthRecipes}
            saveCheckIn={saveCheckIn}
            saveFavoriteFood={saveFavoriteFood}
            setFavoriteFoodStatus={setFavoriteFoodStatus}
            saveRecipe={saveHealthRecipe}
            savedMeals={healthSavedMeals}
            saveSavedMeal={saveHealthSavedMeal}
            saveProfile={saveHealthProfile}
            saveWorkoutPlanItemLinks={saveWorkoutPlanItemLinks}
            addMealEntry={addHealthMealEntry}
            addMealPlanEntry={addHealthMealPlanEntry}
            updateMealPlanEntry={updateHealthMealPlanEntry}
            deleteMealPlanEntry={deleteHealthMealPlanEntry}
            confirmMealPlanEntry={confirmHealthMealPlanEntry}
            addWaterEntry={addHealthWaterEntry}
            addWeightEntry={addHealthWeightEntry}
            addWorkout={addHealthWorkout}
            storageMode={healthStorageMode}
            updateMealEntry={updateHealthMealEntry}
            updateWaterEntry={updateHealthWaterEntry}
            updateWorkout={updateHealthWorkout}
            updatePlan={updateFitnessPlan}
            updatePlanItem={updateFitnessPlanItem}
            restoreGoal={restoreFitnessGoal}
            weightEntries={healthWeightEntries}
            waterEntries={healthWaterEntries}
            workouts={healthWorkouts}
            workoutPlanItemLinks={workoutPlanItemLinks}
          />
        ) : activePage === "Roll" ? (
          <RollPage
            client={client}
            currentUser={currentUser}
            isDark={theme === "dark"}
          />
        ) : activePage === "Stats" ? (
          <TaskStatsPage
            achievementSummary={achievementSummaryPresentation}
            economy={economy}
            focusHistory={focusHistory}
            taskHistory={taskHistory}
            taskHistoryStats={taskHistoryStats}
            tasks={tasksForActiveStatusRead}
            todayDateKey={todayKey}
          />
        ) : activePage === "Notes" ? (
          <NotesPage
            client={client}
            currentUser={currentUser}
            onOpenNoteHandled={() => setNotePageOpenNoteId(null)}
            openNoteId={notePageOpenNoteId}
            scratchPaper={scratchPaperData}
            tasks={tasks}
          />
        ) : activePage === "Settings" ? (
          <TaskSettingsPage
            accentColor={accentColor}
            dayStartTime={dayStartTime}
            timeZone={userTimeZone}
            onAccentColorChange={setAccentColor}
            onDayStartTimeChange={setDayStartTime}
            onTimeZoneChange={setUserTimeZone}
            onResetEconomy={resetEconomy}
            onSectionRequestHandled={(section) => setRequestedSettingsSection((current) => (current === section ? null : current))}
            onWorkspaceRefresh={softRefreshWorkspace}
            onThemeChange={setTheme}
            requestedSection={requestedSettingsSection}
            tasks={tasks}
            theme={theme}
            userId={currentUser.id}
            lowStim={lowStim}
            onLowStimChange={setLowStim}
          />
        ) : activePage === "Games" ? (
          <GamesPage
            taskHistory={taskHistory}
            onAwardXP={(xp, reason) =>
              void appendEconomyEvent({ source: "roll", refId: currentUser.id, points: 0, xp, reason })
            }
          />
        ) : (
          <PagePlaceholder
            count={activeTasks.length}
            isDark={theme === "dark"}
            page={activePage}
            setActivePage={setActivePage}
          />
        )}
        </ErrorBoundary>
        </section>
      </div>

      <div style={mobileChromeZoomStyle}>
        <BottomDock
          activePage={activePage}
          dockIcons={dockIcons}
          dockItems={dockItems}
          onNavigate={setActivePage}
          onNavigateSearchTarget={handleNavigatorSearchTarget}
          renderIcon={(name) => <CategoryIcon className="h-6 w-6" name={name} />}
          searchTargets={navigatorSearchTargets}
        />
      </div>
      <TaskActiveTimersTray
        isOpen={isActiveTimersTrayOpen}
        onDiscard={(taskId) => { void persistDiscardedTaskTimer(taskId); }}
        onGoToTask={goToActiveTimerTask}
        onPause={pauseHudTaskTimer}
        onPendingDiscardHandled={() => setPendingTaskTimerDiscardId(null)}
        onResume={resumeHudTaskTimer}
        onStopAndSave={stopHudTaskTimer}
        onToggle={() => setIsActiveTimersTrayOpen((current) => !current)}
        pendingDiscardTaskId={pendingTaskTimerDiscardId}
        timers={runningTaskTimers}
      />
      {showBackToTop ? (
        <ScrollUpButton
          aria-label="Scroll to top"
          className="fixed right-4 bottom-0 z-20 sm:right-8"
          style={mobileBackToTopZoomStyle}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <ArrowUp className="h-4 w-4" />
        </ScrollUpButton>
      ) : null}
      {activeCountdownAlertSessionKey ? (
        <CountdownFinishedAlertOverlay onDismiss={dismissCountdownFinishedAlert} />
      ) : null}
      <AchievementCelebrationModal celebration={achievementNotifications.activeCelebration} onAcknowledge={() => { void achievementNotifications.acknowledgeCurrent(); }} />
    </main>
  );
}

function CountdownFinishedAlertOverlay({
  onDismiss,
}: {
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-auto fixed inset-0 z-[140] flex items-center justify-center">
      <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-[rgba(255,88,110,0.22)] dark:bg-[rgba(255,120,150,0.22)]" />
      <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-white/35 mix-blend-screen dark:bg-white/12" />
      <div className="relative z-10 mx-4 flex w-full max-w-sm flex-col items-center gap-4 rounded-[2rem] border border-[#ffd6dc] bg-white px-6 py-7 text-center shadow-[0_30px_90px_rgba(214,75,95,0.28)] dark:border-[#5a2432] dark:bg-[#1a1220]">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#fff1f2] text-[#d64b5f] dark:bg-[#311b23] dark:text-[#ffb0be]">
          <Bell className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#d64b5f] dark:text-[#ffb0be]">
            Countdown Finished
          </p>
          <p className="text-lg font-semibold text-[#1f2746] dark:text-white">
            Time&apos;s up.
          </p>
        </div>
        <button
          className="min-w-[10rem] rounded-full border border-[#f4b7c0] bg-[#d64b5f] px-5 py-3 text-sm font-black text-white transition hover:scale-[1.02] dark:border-[#7a3042] dark:bg-[#ff8ea2] dark:text-[#2b1120]"
          onClick={onDismiss}
          type="button"
        >
          Stop Alarm
        </button>
      </div>
    </div>
  );
}

function ConfigSplash() {
  return (
    <main className={`adhdice-root-safe-area min-h-screen px-3 py-8 sm:px-5 lg:px-8 bg-[linear-gradient(180deg,#ffffff_0%,#faf8ff_100%)] text-[#182033] dark:bg-[linear-gradient(180deg,#0d0c17_0%,#141124_100%)] dark:text-white`}>
      <section className="mx-auto flex min-h-[80vh] max-w-3xl items-center justify-center">
        <div className={`w-full rounded-[2rem] border p-8 text-center border-[#ece8f8] bg-white shadow-[0_24px_70px_rgba(81,61,168,0.1)] dark:border-white/10 dark:bg-white/6`}>
          <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8e88a9] dark:text-white/40`}>
            Setup Needed
          </p>
          <h1 className={`mt-3 text-4xl font-black text-[#17203a] dark:text-white`}>
            Add your Supabase keys
          </h1>
          <p className={`mt-3 text-base text-[#707a95] dark:text-white/55`}>
            Create `.env.3.0.0` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then restart the app.
          </p>
        </div>
      </section>
    </main>
  );
}

function AuthSplash({
  message,
  onAuthenticate,
  onOpenLocalQa,
}: {
  message: Message | null;
  onAuthenticate: (credentials: {
    email: string;
    password: string;
    mode: AuthMode;
  }) => Promise<void>;
  onOpenLocalQa?: (options?: { resetFixtures?: boolean }) => Promise<void>;
}) {
  const [mode, setMode] = useState<AuthMode>("sign-up");
  const [hasHydratedMode, setHasHydratedMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localQaAction, setLocalQaAction] = useState<"open" | "restore" | null>(null);

  useEffect(() => {
    const persistedMode = window.localStorage.getItem(AUTH_MODE_STORAGE_KEY);
    if (persistedMode === "sign-in" || persistedMode === "sign-up") {
      setMode(persistedMode);
    }
    setHasHydratedMode(true);
  }, []);

  useEffect(() => {
    if (!hasHydratedMode) {
      return;
    }

    window.localStorage.setItem(AUTH_MODE_STORAGE_KEY, mode);
  }, [hasHydratedMode, mode]);

  return (
    <main className={`adhdice-root-safe-area min-h-screen px-3 py-8 sm:px-5 lg:px-8 bg-[linear-gradient(180deg,#ffffff_0%,#faf8ff_100%)] text-[#182033] dark:bg-[linear-gradient(180deg,#0d0c17_0%,#141124_100%)] dark:text-white`}>
      <section className="mx-auto grid min-h-[80vh] max-w-5xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="text-center lg:text-left">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8e88a9] dark:text-white/40`}>
            ADHDice Cloud
          </p>
          <h1 className={`mt-3 text-[clamp(2.8rem,6vw,5rem)] font-black leading-none text-[#17203a] dark:text-white`}>
            Sync tasks, focus history, and your account.
          </h1>
          <p className={`mt-4 text-lg text-[#707a95] dark:text-white/55`}>
            Create an account with an email and password to save your task list, focus categories, active timers, and imported history to Supabase.
          </p>
        </div>

        <div className={`rounded-[2rem] border p-6 border-[#ece8f8] bg-white shadow-[0_24px_70px_rgba(81,61,168,0.1)] dark:border-white/10 dark:bg-white/6`}>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setIsSubmitting(true);
              await onAuthenticate({ email, password, mode });
              setIsSubmitting(false);
            }}
          >
            <div>
              <h2 className={`text-2xl font-black text-[#202844] dark:text-white`}>
                {mode === "sign-up" ? "Create your account" : "Sign in"}
              </h2>
              <p className={`mt-2 text-sm text-[#7d88a1] dark:text-white/55`}>
                Use the same email and password on Mac, iPhone, and anywhere else you log in.
              </p>
            </div>

            <div
              aria-label="Authentication mode"
              className="flex rounded-[1rem] bg-[#f7f5ff] p-1 dark:bg-white/8"
              role="tablist"
            >
              <button
                aria-pressed={mode === "sign-up"}
                className={`relative z-10 flex-1 appearance-none rounded-full px-4 py-2 text-center text-sm font-semibold transition ${
                  mode === "sign-up"
                    ? "border border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#4b3d77] dark:bg-white/14 dark:text-[#cabfff]"
                    : "border border-transparent bg-transparent text-[#6f7895] dark:text-white/60"
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setMode("sign-up");
                }}
                onClick={() => setMode("sign-up")}
                role="tab"
                tabIndex={mode === "sign-up" ? 0 : -1}
                type="button"
              >
                Create Account
              </button>
              <button
                aria-pressed={mode === "sign-in"}
                className={`relative z-10 flex-1 appearance-none rounded-full px-4 py-2 text-center text-sm font-semibold transition ${
                  mode === "sign-in"
                    ? "border border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#4b3d77] dark:bg-white/14 dark:text-[#cabfff]"
                    : "border border-transparent bg-transparent text-[#6f7895] dark:text-white/60"
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setMode("sign-in");
                }}
                onClick={() => setMode("sign-in")}
                role="tab"
                tabIndex={mode === "sign-in" ? 0 : -1}
                type="button"
              >
                Sign In
              </button>
            </div>

            <label className="grid gap-2">
              <span className={`text-sm font-semibold text-[#5f6983] dark:text-white/65`}>Email</span>
              <input
                className={`h-14 rounded-[1rem] px-4 text-base outline-none bg-[#f7f5ff] text-[#1f2642] dark:bg-white/8 dark:text-white`}
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={email}
              />
            </label>

            <label className="grid gap-2">
              <span className={`text-sm font-semibold text-[#5f6983] dark:text-white/65`}>Password</span>
              <input
                className={`h-14 rounded-[1rem] px-4 text-base outline-none bg-[#f7f5ff] text-[#1f2642] dark:bg-white/8 dark:text-white`}
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                required
                type="password"
                value={password}
              />
            </label>

            <button
              className={`w-full rounded-[1rem] px-5 py-4 text-base font-bold bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]`}
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting
                ? mode === "sign-up" ? "Creating account..." : "Signing in..."
                : mode === "sign-up" ? "Create Account" : "Sign In"}
            </button>

            <button
              className="w-full rounded-[1rem] border border-[#e2daf9] bg-transparent px-5 py-3 text-sm font-semibold text-[#6f57f6] transition hover:bg-[#f7f5ff] dark:border-white/12 dark:text-[#cabfff] dark:hover:bg-white/6"
              onClick={() => setMode((current) => current === "sign-up" ? "sign-in" : "sign-up")}
              type="button"
            >
              {mode === "sign-up" ? "Already have an account? Switch to Sign In" : "Need an account? Switch to Create Account"}
            </button>

            {onOpenLocalQa ? (
              <div className="border-t border-[#ece8f8] pt-4 dark:border-white/10">
                <TaskTableChipButton
                  className="w-full justify-center"
                  disabled={localQaAction !== null || isSubmitting}
                  onClick={async () => {
                    setLocalQaAction("open");
                    await onOpenLocalQa();
                    setLocalQaAction(null);
                  }}
                  toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}
                >
                  {localQaAction === "open" ? "Loading Local QA…" : "Continue as Local QA"}
                </TaskTableChipButton>
                <div className="mt-2 flex justify-center">
                  <TaskTableChipButton
                    disabled={localQaAction !== null || isSubmitting}
                    onClick={async () => {
                      setLocalQaAction("restore");
                      await onOpenLocalQa({ resetFixtures: true });
                      setLocalQaAction(null);
                    }}
                    toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}
                  >
                    {localQaAction === "restore" ? "Restoring fixtures…" : "Restore QA fixtures"}
                  </TaskTableChipButton>
                </div>
                <p className="mt-2 text-center text-xs text-[#8a91a7] dark:text-white/45">
                  Development only. Uses the complete app with an isolated QA account.
                </p>
              </div>
            ) : null}
          </form>

          {message ? <StatusBanner message={message} /> : null}
        </div>
      </section>
    </main>
  );
}

function StatusBanner({
  detail,
  message,
  onDismiss,
  showDismiss = true,
}: {
  detail?: string | null;
  message: Message;
  onDismiss?: () => void;
  showDismiss?: boolean;
}) {
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    setIsDismissed(false);
  }, [message.text]);

  const className = message.tone === "warn"
    ? "border-[#ffd5dc] bg-[#fff2f4] text-[#9f364d] dark:border-[#4d2130] dark:bg-[#2a1620] dark:text-[#ffb1c0]"
    : message.tone === "good"
      ? "border-[#d7f5e9] bg-[#effcf6] text-[#0d8b60] dark:border-[#1f4d3d] dark:bg-[#11271f] dark:text-[#8ce8c0]"
      : "border-[#ece8f8] bg-white text-[#5f6983] dark:border-white/10 dark:bg-white/6 dark:text-white/70";

  if (isDismissed) {
    return null;
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      aria-live={message.tone === "warn" ? "assertive" : "polite"}
      className={`fixed right-3 top-[calc(env(safe-area-inset-top)+1rem)] z-[160] flex w-[calc(100vw-1.5rem)] max-w-xl items-center justify-between gap-3 rounded-[1.25rem] border px-4 py-3 text-sm font-medium shadow-[0_18px_48px_rgba(39,28,89,0.18)] sm:right-4 sm:w-auto sm:min-w-80 ${className}`}
      role={message.tone === "warn" ? "alert" : "status"}
    >
      <span className="min-w-0 flex-1">
        <span className="block">{message.text}</span>
        {detail ? <span className="mt-1 block text-xs font-normal opacity-80">{detail}</span> : null}
      </span>
      {showDismiss && !onDismiss ? (
        <TaskTableChipButton
          className="shrink-0"
          onClick={() => setIsDismissed(true)}
          toneClassName="border-current/20 bg-transparent text-current"
        >
          Dismiss
        </TaskTableChipButton>
      ) : showDismiss ? (
        <TaskTableChipButton
          className="shrink-0"
          onClick={() => {
            setIsDismissed(true);
            onDismiss?.();
          }}
          toneClassName="border-current/20 bg-transparent text-current"
        >
          Dismiss
        </TaskTableChipButton>
      ) : null}
    </div>,
    document.body,
  );
}

function BatchEditProgressBanner({
  onDismiss,
  progress,
}: {
  onDismiss: () => void;
  progress: BatchEditProgress;
}) {
  const tone = progress.phase === "running"
    ? "neutral"
    : progress.phase === "warning" || progress.failed > 0 || progress.fallbackCount > 0
      ? "warn"
      : "good";

  return (
    <StatusBanner
      detail={formatBatchEditProgressDetail(progress)}
      message={{ tone, text: formatBatchEditProgressText(progress) }}
      onDismiss={progress.phase === "running" ? undefined : onDismiss}
      showDismiss={progress.phase !== "running"}
    />
  );
}

function TopHeader({
  activeHudTaskTimer,
  activeTaskCount,
  currentHudPageId,
  economy,
  hudUiState,
  urgentTaskCount,
  onOpenAccount,
  onOpenComposer,
  onOpenFocusPlanner,
  onOpenQuickCapture,
  onNextTaskTimer,
  onPauseTaskTimer,
  onPreviousTaskTimer,
  onResumeTaskTimer,
  onStopTaskTimer,
  profile,
  runningTaskTimers,
  setHudUiState,
  taskTimerNow,
  theme,
  todayTaskCount,
  onThemeChange,
  lowStim,
  onLowStimChange,
  currentStreak,
  focusAlarmEnabled,
  focusAlarmIntervalMinutes,
  focusAlarmRemainingMs,
  onDecreaseFocusAlarmInterval,
  onIncreaseFocusAlarmInterval,
  onToggleFocusAlarmEnabled,
  mobileZoom,
  onDecreaseMobileZoom,
  onIncreaseMobileZoom,
  canDecreaseMobileZoom,
  canIncreaseMobileZoom,
}: {
  activeHudTaskTimer: RunningTaskTimer | null;
  activeTaskCount: number;
  currentHudPageId: "overview" | "command";
  economy: { level: number; xp: number; points: number; tokens: number };
  hudUiState: import("@/lib/task-hud-layout").HudUiState;
  urgentTaskCount: number;
  onOpenAccount: () => void;
  onOpenComposer: () => void;
  onOpenFocusPlanner: () => void;
  onOpenQuickCapture: () => void;
  onNextTaskTimer: () => void;
  onPauseTaskTimer: (taskId: string) => void;
  onPreviousTaskTimer: () => void;
  onResumeTaskTimer: (taskId: string) => void;
  onStopTaskTimer: (taskId: string) => void;
  profile: UserProfile;
  runningTaskTimers: RunningTaskTimer[];
  setHudUiState: Dispatch<SetStateAction<import("@/lib/task-hud-layout").HudUiState>>;
  taskTimerNow: number;
  theme: ThemeMode;
  todayTaskCount: number;
  onThemeChange: (theme: ThemeMode) => void;
  lowStim: boolean;
  onLowStimChange: (v: boolean) => void;
  currentStreak: number;
  focusAlarmEnabled: boolean;
  focusAlarmIntervalMinutes: number;
  focusAlarmRemainingMs: number | null;
  onDecreaseFocusAlarmInterval: () => void;
  onIncreaseFocusAlarmInterval: () => void;
  onToggleFocusAlarmEnabled: () => void;
  mobileZoom: number;
  onDecreaseMobileZoom: () => void;
  onIncreaseMobileZoom: () => void;
  canDecreaseMobileZoom: boolean;
  canIncreaseMobileZoom: boolean;
}) {
  const accountButton = (
    <button
      className="relative mr-[3px] rounded-full bg-[var(--hud-surface)] transition-transform hover:scale-[1.02]"
      onClick={onOpenAccount}
      type="button"
    >
      <ProfileAvatarImage avatarSrc={profile.avatarSrc} />
    </button>
  );

  const timerSeconds = activeHudTaskTimer ? getTaskTimerDisplaySeconds(activeHudTaskTimer, taskTimerNow) : 0;

  function renderHudWidget(widgetType: HudWidgetType) {
    if (widgetType === "dark_mode") {
      return (
        <div className="flex h-full items-center justify-center">
          <DarkModeToggleButton theme={theme} onThemeChange={onThemeChange} />
        </div>
      );
    }

    if (widgetType === "calm") {
      return (
        <div className="flex h-full items-center justify-center">
          <CalmModeButton lowStim={lowStim} onLowStimChange={onLowStimChange} />
        </div>
      );
    }

    if (widgetType === "xp") {
      const xpProgress = getLevelProgress(economy.xp);
      return <ProgressStat label={`Lvl ${economy.level}`} value={`${xpProgress.xpIntoLevel} / ${xpProgress.xpNeededForLevel} XP`} percent={xpProgress.percentToNextLevel} />;
    }

    if (widgetType === "sync_status") {
      return (
        <div className="flex h-full flex-col justify-center rounded-[1.2rem] bg-[#e7faf4] px-2 text-[#0e9b74] dark:bg-[#103c33] dark:text-[#6ef0c4]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Status</p>
          <p className="mt-1 text-2xl font-black">Synced</p>
        </div>
      );
    }

    if (widgetType === "points") {
      return <MiniStat label="Points" value={String(economy.points)} compact />;
    }

    if (widgetType === "tokens") {
      return <MiniStat label="Tokens" value={String(economy.tokens)} compact />;
    }

    if (widgetType === "streak") {
      return (
        <div className="flex h-full flex-col justify-center rounded-[1.2rem] bg-[#fff3e0] px-2 text-[#d97706] dark:bg-[#3d2a00] dark:text-[#fbbf24]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Streak</p>
          <p className="mt-1 text-2xl font-black">{currentStreak > 0 ? `${currentStreak}d` : "0d"}</p>
        </div>
      );
    }

    if (widgetType === "focus_alarm") {
      return (
        <FocusAlarmWidget
          compact
          enabled={focusAlarmEnabled}
          intervalMinutes={focusAlarmIntervalMinutes}
          onDecreaseInterval={onDecreaseFocusAlarmInterval}
          onIncreaseInterval={onIncreaseFocusAlarmInterval}
          onToggleEnabled={onToggleFocusAlarmEnabled}
          remainingMs={focusAlarmRemainingMs}
        />
      );
    }

    if (widgetType === "zoom") {
      return (
        <div className="flex h-full flex-col justify-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/35">Zoom</p>
          <div className="mt-2 flex items-center gap-1 rounded-full border border-[#ddd6fb] bg-white/90 px-1 py-1 text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.05] dark:text-[#cabfff]">
            <button aria-label="Zoom out" className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold transition disabled:cursor-not-allowed disabled:opacity-35" disabled={!canDecreaseMobileZoom} onClick={onDecreaseMobileZoom} type="button">-</button>
            <span className="min-w-[3rem] text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7f769f] dark:text-white/55">{Math.round(mobileZoom * 100)}%</span>
            <button aria-label="Zoom in" className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold transition disabled:cursor-not-allowed disabled:opacity-35" disabled={!canIncreaseMobileZoom} onClick={onIncreaseMobileZoom} type="button">+</button>
          </div>
        </div>
      );
    }

    if (widgetType === "new_task" || widgetType === "refocus" || widgetType === "quick_capture") {
      const action = widgetType === "new_task"
        ? { label: "New Task", onClick: onOpenComposer }
        : widgetType === "refocus"
          ? { label: "Refocus", onClick: onOpenFocusPlanner }
          : { label: "Quick Capture", onClick: onOpenQuickCapture };
      return (
        <div className="flex h-full w-full items-center justify-center">
          <TaskTableChipButton
            aria-label={action.label}
            className="max-w-full text-[#6f57f6] dark:text-[#cabfff]"
            onClick={action.onClick}
            toneClassName="border-[#ddd6fb] bg-white/90 dark:border-white/10 dark:bg-white/[0.06]"
          >
            <span className="truncate">{action.label}</span>
          </TaskTableChipButton>
        </div>
      );
    }

    if (widgetType === "task_counts") {
      return (
        <div className="grid h-full grid-cols-3 gap-2">
          {[
            { label: "Active", value: activeTaskCount },
            { label: "Today", value: todayTaskCount },
            { label: "Urgent", value: urgentTaskCount },
          ].map((item, itemIndex) => (
            <div className="rounded-[1rem] bg-[#faf8ff] px-3 py-2 text-center dark:bg-white/[0.04]" key={`${item.label || "task-count"}-${itemIndex}`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/35">{item.label}</p>
              <p className="mt-1 text-lg font-black text-[#2f294a] dark:text-white">{item.value}</p>
            </div>
          ))}
        </div>
      );
    }

    if (widgetType === "focus_timer") {
      return (
        <div className="flex h-full items-center gap-3">
          <div className="relative flex h-[5.1rem] w-[5.1rem] items-center justify-center">
            <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" fill="transparent" r="54" stroke="currentColor" strokeWidth="6" className="text-[#f0ecfc] dark:text-white/[0.06]" />
              <circle
                cx="60"
                cy="60"
                fill="transparent"
                r="54"
                stroke="#6f57f6"
                strokeDasharray={2 * Math.PI * 54}
                strokeDashoffset={(2 * Math.PI * 54) * (1 - (((timerSeconds % 60) / 60) || 0))}
                strokeLinecap="round"
                strokeWidth="6"
                style={{ transition: "stroke-dashoffset 1s linear", filter: "drop-shadow(0 0 8px rgba(111,87,246,0.45))" }}
              />
            </svg>
            <div className="relative z-10 flex h-[4.15rem] w-[4.15rem] flex-col items-center justify-center rounded-full border border-white/45 bg-white/55 shadow-[0_8px_24px_rgba(31,38,135,0.08)] backdrop-blur-[8px] dark:border-white/8 dark:bg-white/[0.03]">
              {activeHudTaskTimer ? (
                <p className="text-[1.3rem] font-black leading-none text-[#1f2746] dark:text-white">{formatActualSecondsLabel(timerSeconds)}</p>
              ) : (
                <Clock className="h-5 w-5 text-[#6f57f6] dark:text-[#cabfff]" />
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-center text-sm font-medium text-[#2f294a] dark:text-white">{activeHudTaskTimer?.title ?? "No active timer"}</p>
            {activeHudTaskTimer ? (
              <div className="mt-2 flex items-center justify-center gap-2">
                {runningTaskTimers.length > 1 ? (
                  <>
                    <button className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e2daf8] bg-white text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.05] dark:text-[#cabfff]" onClick={onPreviousTaskTimer} type="button"><ChevronUp className="h-4 w-4 -rotate-90" /></button>
                    <button className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e2daf8] bg-white text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.05] dark:text-[#cabfff]" onClick={onNextTaskTimer} type="button"><ChevronUp className="h-4 w-4 rotate-90" /></button>
                  </>
                ) : null}
                <button
                  aria-label={activeHudTaskTimer.pausedAt ? "Continue timer" : "Pause timer"}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e2daf8] bg-white text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.05] dark:text-[#cabfff]"
                  onClick={() => activeHudTaskTimer.pausedAt ? onResumeTaskTimer(activeHudTaskTimer.taskId) : onPauseTaskTimer(activeHudTaskTimer.taskId)}
                  title={activeHudTaskTimer.pausedAt ? "Continue timer" : "Pause timer"}
                  type="button"
                >
                  {activeHudTaskTimer.pausedAt ? <CirclePlay className="h-4 w-4" /> : <CirclePause className="h-4 w-4" />}
                </button>
                <button
                  aria-label="Stop timer"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[#ffd8be] bg-[#fff1e7] text-[#dc6c1c] dark:border-[#65401d] dark:bg-[#432712] dark:text-[#ffb37e]"
                  onClick={() => activeHudTaskTimer && onStopTaskTimer(activeHudTaskTimer.taskId)}
                  title="Stop timer"
                  type="button"
                >
                  <CircleX className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-[#8a84a3] dark:text-white/48">Start a task timer from the table to pin it here.</p>
            )}
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <header
      className="flex flex-col gap-2 px-3 lg:flex-row lg:items-center lg:justify-between"
    >
      {/* Row 1 (mobile): logo + account side by side */}
      <div className="flex items-center justify-between gap-3 lg:w-[13rem] lg:shrink-0 lg:justify-start">
        <div className="flex items-center gap-1">
          <BrandMark profile={profile} />
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold bg-[#f1ecff] text-[#7f6af7] dark:bg-white/10 dark:text-[#c5b8ff]`}>
            v{HUD_VERSION}
          </span>
        </div>
        <div className="lg:hidden">{accountButton}</div>
      </div>

      <HudCommandCenter
        hudUiState={hudUiState}
        renderWidget={renderHudWidget}
        setHudUiState={setHudUiState}
      />
      <div className="hidden lg:block">{accountButton}</div>
      {currentHudPageId === "command" && runningTaskTimers.length > 0 ? (
        <div className="sr-only">{activeHudTaskTimer?.title}</div>
      ) : null}
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block" />
      <div className="hidden lg:block">{/* keep layout stable */}</div>
    </header>
  );
}

function CommandCenterHeader({
  activeHudTaskTimer,
  activeSessions,
  activeTaskCount,
  currentHudPageId,
  economy,
  focusCategories,
  hudUiState,
  urgentTaskCount,
  onOpenAccount,
  onOpenComposer,
  onOpenFocusPlanner,
  onOpenQuickCapture,
  onViewScratchPaper,
  onNextTaskTimer,
  onPauseTaskTimer,
  onPreviousTaskTimer,
  onResumeTaskTimer,
  onStopTaskTimer,
  onToggleFocusTimer,
  profile,
  runningTaskTimers,
  setHudUiState,
  hudNow,
  taskTimerNow,
  theme,
  todayTaskCount,
  onThemeChange,
  lowStim,
  onLowStimChange,
  currentStreak,
  notificationInboxItems,
  isNativeIosPlatform,
  focusAlarmEnabled,
  focusAlarmIntervalMinutes,
  focusAlarmRemainingMs,
  onDecreaseFocusAlarmInterval,
  onIncreaseFocusAlarmInterval,
  onToggleFocusAlarmEnabled,
  mobileZoom,
  onRefreshWorkspace,
  onDecreaseMobileZoom,
  onIncreaseMobileZoom,
  refreshStatus,
  canDecreaseMobileZoom,
  canIncreaseMobileZoom,
  onOpenPendingRewardBank,
  pendingRewardDiceCount,
  scratchPaper,
}: {
  activeHudTaskTimer: RunningTaskTimer | null;
  activeSessions: Record<string, ActiveFocusSession>;
  activeTaskCount: number;
  currentHudPageId: "overview" | "command";
  economy: { level: number; xp: number; points: number; tokens: number };
  focusCategories: FocusCategory[];
  hudUiState: import("@/lib/task-hud-layout").HudUiState;
  urgentTaskCount: number;
  onOpenAccount: () => void;
  onOpenComposer: () => void;
  onOpenFocusPlanner: () => void;
  onOpenQuickCapture: () => void;
  onViewScratchPaper: () => void;
  onNextTaskTimer: () => void;
  onPauseTaskTimer: (taskId: string) => void;
  onPreviousTaskTimer: () => void;
  onResumeTaskTimer: (taskId: string) => void;
  onStopTaskTimer: (taskId: string) => void;
  onToggleFocusTimer: (categoryId: string) => void;
  profile: UserProfile;
  runningTaskTimers: RunningTaskTimer[];
  setHudUiState: Dispatch<SetStateAction<import("@/lib/task-hud-layout").HudUiState>>;
  hudNow: number;
  taskTimerNow: number;
  theme: ThemeMode;
  todayTaskCount: number;
  onThemeChange: (theme: ThemeMode) => void;
  lowStim: boolean;
  onLowStimChange: (v: boolean) => void;
  currentStreak: number;
  notificationInboxItems: HudNotificationItem[];
  isNativeIosPlatform: boolean;
  focusAlarmEnabled: boolean;
  focusAlarmIntervalMinutes: number;
  focusAlarmRemainingMs: number | null;
  onDecreaseFocusAlarmInterval: () => void;
  onIncreaseFocusAlarmInterval: () => void;
  onToggleFocusAlarmEnabled: () => void;
  mobileZoom: number;
  onRefreshWorkspace: () => void;
  onDecreaseMobileZoom: () => void;
  onIncreaseMobileZoom: () => void;
  refreshStatus: RefreshStatus;
  canDecreaseMobileZoom: boolean;
  canIncreaseMobileZoom: boolean;
  onOpenPendingRewardBank: () => void;
  pendingRewardDiceCount: number;
  scratchPaper: ScratchPaperData;
}) {
  const isHudCollapsed = hudUiState.isHudCollapsed;
  const isWorkspaceRefreshing = refreshStatus !== "idle";
  const accountButton = (
    <button className="relative mr-[3px] rounded-full bg-[var(--hud-surface)] transition-transform hover:scale-[1.02]" onClick={onOpenAccount} type="button">
      <ProfileAvatarImage avatarSrc={profile.avatarSrc} />
    </button>
  );

  const timerSeconds = activeHudTaskTimer ? getTaskTimerDisplaySeconds(activeHudTaskTimer, taskTimerNow) : 0;
  const collapsedHudFocusTimer = resolveCollapsedHudFocusTimer(focusCategories, activeSessions, taskTimerNow);
  const collapsedHudTaskTimer = activeHudTaskTimer ?? runningTaskTimers[0] ?? null;
  const activeHudPageTitle = hudUiState.hudPages.find((page) => page.id === currentHudPageId)?.title ?? "HUD";
  const hudDateTime = isNativeIosPlatform ? null : formatHudDateTime(hudNow);
  const [isNotificationInboxOpen, setIsNotificationInboxOpen] = useState(false);

  function setHudCollapsed(isCollapsed: boolean) {
    setHudUiState((current) => ({
      ...current,
      isHudCollapsed: isCollapsed,
      isHudEditMode: isCollapsed ? false : current.isHudEditMode,
      selectedHudWidgetId: isCollapsed ? null : current.selectedHudWidgetId,
    }));
  }

  function renderHudWidget(widgetType: HudWidgetType) {
    if (widgetType === "dark_mode") {
      return (
        <div className="flex h-full items-center justify-center">
          <DarkModeToggleButton theme={theme} onThemeChange={onThemeChange} />
        </div>
      );
    }

    if (widgetType === "calm") {
      return (
        <div className="flex h-full items-center justify-center">
          <CalmModeButton lowStim={lowStim} onLowStimChange={onLowStimChange} />
        </div>
      );
    }
    if (widgetType === "xp") {
      const xpProgress = getLevelProgress(economy.xp);
      return <ProgressStat compact label="XP" percent={xpProgress.percentToNextLevel} value={`${xpProgress.xpIntoLevel}/${xpProgress.xpNeededForLevel}`} />;
    }
    if (widgetType === "sync_status") {
      return <MiniStat compact label="Status" value="Synced" />;
    }
    if (widgetType === "points") {
      return <MiniStat compact label="Points" value={String(economy.points)} />;
    }
    if (widgetType === "tokens") {
      return <MiniStat compact label="Tokens" value={String(economy.tokens)} />;
    }
    if (widgetType === "streak") {
      return <MiniStat compact label="Streak" value={currentStreak > 0 ? `${currentStreak}d` : "0d"} />;
    }
    if (widgetType === "notification_inbox") {
      const count = notificationInboxItems.length;
      return (
        <div className="relative flex h-full items-center justify-center">
          <button
            className="relative flex h-full w-full items-center justify-center gap-2 rounded-[0.9rem] bg-transparent px-3 text-sm font-bold text-[#6f57f6] transition hover:bg-white/[0.18] dark:bg-transparent dark:text-[#cabfff] dark:hover:bg-white/[0.06]"
            onClick={() => setIsNotificationInboxOpen((current) => !current)}
            type="button"
          >
            <Bell className="h-4 w-4" />
            <span>{count}</span>
          </button>
          {isNotificationInboxOpen ? (
            <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[18rem] rounded-[1.1rem] border border-[#ede6ff] bg-white/96 p-3 text-left shadow-[0_24px_70px_rgba(111,87,246,0.18)] backdrop-blur dark:border-white/10 dark:bg-[#1b1530]/96">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Inbox</p>
                <TaskTableChipButton onClick={() => setIsNotificationInboxOpen(false)} toneClassName="border-[#e4deef] bg-[#f4f5f8] text-[#68738c] dark:border-white/10 dark:bg-white/8 dark:text-white/60">Close</TaskTableChipButton>
              </div>
              {notificationInboxItems.length > 0 ? (
                <div className="space-y-2">
                  {notificationInboxItems.map((item) => (
                    <div className="rounded-[0.85rem] border border-[#f0ebfb] bg-[#fbfaff] px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]" key={item.id}>
                      <p className={`text-sm font-bold ${
                        item.tone === "danger"
                          ? "text-[#d94e67]"
                          : item.tone === "success"
                            ? "text-[#119a69]"
                            : item.tone === "warning"
                              ? "text-[#dc6c1c]"
                              : "text-[#6f57f6]"
                      }`}>{item.title}</p>
                      <p className="mt-1 text-xs font-medium leading-snug text-[#7d7597] dark:text-white/55">{item.detail}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-[0.85rem] border border-[#f0ebfb] bg-[#fbfaff] px-3 py-2 text-xs font-medium text-[#7d7597] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/55">
                  No task notifications right now.
                </p>
              )}
            </div>
          ) : null}
        </div>
      );
    }
    if (widgetType === "focus_alarm") {
      return (
        <FocusAlarmWidget
          compact
          enabled={focusAlarmEnabled}
          intervalMinutes={focusAlarmIntervalMinutes}
          onDecreaseInterval={onDecreaseFocusAlarmInterval}
          onIncreaseInterval={onIncreaseFocusAlarmInterval}
          onToggleEnabled={onToggleFocusAlarmEnabled}
          remainingMs={focusAlarmRemainingMs}
        />
      );
    }
    if (widgetType === "zoom") {
      return (
        <div className="flex h-full items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/35">Zoom</p>
          <div className="flex items-center gap-1 rounded-full border border-white/35 bg-transparent px-1 py-0.5 text-[#6f57f6] dark:border-white/10 dark:bg-transparent dark:text-[#cabfff]">
            <button aria-label="Zoom out" className="flex h-7 w-7 items-center justify-center rounded-full text-base font-bold transition disabled:cursor-not-allowed disabled:opacity-35" disabled={!canDecreaseMobileZoom} onClick={onDecreaseMobileZoom} type="button">-</button>
            <span className="min-w-[3rem] text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7f769f] dark:text-white/55">{Math.round(mobileZoom * 100)}%</span>
            <button aria-label="Zoom in" className="flex h-7 w-7 items-center justify-center rounded-full text-base font-bold transition disabled:cursor-not-allowed disabled:opacity-35" disabled={!canIncreaseMobileZoom} onClick={onIncreaseMobileZoom} type="button">+</button>
          </div>
        </div>
      );
    }
    if (widgetType === "new_task" || widgetType === "refocus" || widgetType === "quick_capture") {
      const action = widgetType === "new_task"
        ? { label: "New Task", onClick: onOpenComposer }
        : widgetType === "refocus"
          ? { label: "Refocus", onClick: onOpenFocusPlanner }
          : { label: "Quick Capture", onClick: onOpenQuickCapture };
      return (
        <div className="flex h-full w-full items-center justify-center">
          <TaskTableChipButton
            aria-label={action.label}
            className="max-w-full text-[#6f57f6] dark:text-[#cabfff]"
            onClick={action.onClick}
            toneClassName="border-[#ddd6fb] bg-white/90 dark:border-white/10 dark:bg-white/[0.06]"
          >
            <span className="truncate">{action.label}</span>
          </TaskTableChipButton>
        </div>
      );
    }
    if (widgetType === "task_counts") {
      return (
        <div className="grid h-full grid-cols-3 gap-1.5">
          {[
            { label: "Active", value: activeTaskCount },
            { label: "Today", value: todayTaskCount },
            { label: "Urgent", value: urgentTaskCount },
          ].map((item, itemIndex) => (
            <div className="rounded-[0.85rem] bg-transparent px-2 py-1 text-center" key={`${item.label || "task-count"}-${itemIndex}`}>
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8d87a7] dark:text-white/35">{item.label}</p>
              <p className="text-sm font-black text-[#2f294a] dark:text-white">{item.value}</p>
            </div>
          ))}
        </div>
      );
    }
    if (widgetType === "scratch_paper") {
      return <ScratchPaperWidget {...scratchPaper} onViewNotes={onViewScratchPaper} />;
    }
    if (widgetType === "focus_timer") {
      return (
        <div className="flex h-full items-center gap-2">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
            <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 120 120">
              <circle className="text-[#f0ecfc] dark:text-white/[0.06]" cx="60" cy="60" fill="transparent" r="54" stroke="currentColor" strokeWidth="6" />
              <circle
                cx="60"
                cy="60"
                fill="transparent"
                r="54"
                stroke="#6f57f6"
                strokeDasharray={2 * Math.PI * 54}
                strokeDashoffset={(2 * Math.PI * 54) * (1 - (((timerSeconds % 60) / 60) || 0))}
                strokeLinecap="round"
                strokeWidth="6"
                style={{ transition: "stroke-dashoffset 1s linear", filter: "drop-shadow(0 0 8px rgba(111,87,246,0.45))" }}
              />
            </svg>
            <div className="relative z-10 flex h-10 w-10 flex-col items-center justify-center rounded-full border border-white/35 bg-transparent backdrop-blur-[8px] dark:border-white/8 dark:bg-transparent">
              {activeHudTaskTimer ? (
                <p className="text-xs font-black leading-none text-[#1f2746] dark:text-white">{formatActualSecondsLabel(timerSeconds)}</p>
              ) : (
                <Clock className="h-4 w-4 text-[#6f57f6] dark:text-[#cabfff]" />
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-center text-xs font-medium text-[#2f294a] dark:text-white">{activeHudTaskTimer?.title ?? "No active timer"}</p>
            {activeHudTaskTimer ? (
              <div className="mt-1 flex items-center justify-center gap-1.5">
                {runningTaskTimers.length > 1 ? (
                  <>
                    <button className="flex h-7 w-7 items-center justify-center rounded-full border border-white/35 bg-transparent text-[#6f57f6] dark:border-white/10 dark:bg-transparent dark:text-[#cabfff]" onClick={onPreviousTaskTimer} type="button"><ChevronUp className="h-3.5 w-3.5 -rotate-90" /></button>
                    <button className="flex h-7 w-7 items-center justify-center rounded-full border border-white/35 bg-transparent text-[#6f57f6] dark:border-white/10 dark:bg-transparent dark:text-[#cabfff]" onClick={onNextTaskTimer} type="button"><ChevronUp className="h-3.5 w-3.5 rotate-90" /></button>
                  </>
                ) : null}
                <button
                  aria-label={activeHudTaskTimer.pausedAt ? "Continue timer" : "Pause timer"}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/35 bg-transparent text-[#6f57f6] dark:border-white/10 dark:bg-transparent dark:text-[#cabfff]"
                  onClick={() => activeHudTaskTimer.pausedAt ? onResumeTaskTimer(activeHudTaskTimer.taskId) : onPauseTaskTimer(activeHudTaskTimer.taskId)}
                  title={activeHudTaskTimer.pausedAt ? "Continue timer" : "Pause timer"}
                  type="button"
                >
                  {activeHudTaskTimer.pausedAt ? <CirclePlay className="h-3.5 w-3.5" /> : <CirclePause className="h-3.5 w-3.5" />}
                </button>
                <button
                  aria-label="Stop timer"
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/35 bg-transparent text-[#6f57f6] dark:border-white/10 dark:bg-transparent dark:text-[#cabfff]"
                  onClick={() => onStopTaskTimer(activeHudTaskTimer.taskId)}
                  title="Stop timer"
                  type="button"
                >
                  <CircleX className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <p className="mt-1 text-[11px] text-[#8a84a3] dark:text-white/48">Start a timer from the table.</p>
            )}
          </div>
        </div>
      );
    }
    return null;
  }

  if (isHudCollapsed) {
    return (
      <header className={isNativeIosPlatform ? "pl-2 pr-0" : "px-3"}>
        <div className={isNativeIosPlatform
          ? "adhdice-scrollbar flex w-full justify-start overflow-x-auto overflow-y-hidden touch-pan-x"
          : "adhdice-scrollbar w-full overflow-x-auto overflow-y-hidden touch-pan-x"}
        >
          <div className={isNativeIosPlatform
            ? "grid w-max shrink-0 grid-flow-col grid-rows-[min-content_min-content] items-center gap-x-2 gap-y-0 rounded-[1.15rem] bg-[var(--hud-surface)] px-0 py-1"
            : "mx-auto flex w-max items-center gap-2 rounded-[1.15rem] bg-[var(--hud-surface)] px-2 py-1"}
          >
            <button
              aria-label="Expand HUD"
              className={isNativeIosPlatform
                ? "row-span-2 flex min-h-11 shrink-0 flex-col items-center justify-center gap-0 rounded-full bg-[var(--hud-surface)] px-0 py-0 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f57f6]/45"
                : "shrink-0 flex min-h-11 items-center gap-2 rounded-full bg-[var(--hud-surface)] px-2.5 py-1.5 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f57f6]/45"}
              onClick={() => setHudCollapsed(!isHudCollapsed)}
              type="button"
            >
              <span className="pointer-events-none flex items-center">
                <BrandMark compact profile={profile} />
              </span>
              <span className={isNativeIosPlatform
                ? "pointer-events-none rounded-full bg-[var(--hud-surface)] px-1 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-[0.16em] text-[#7f6af7] dark:text-[#c5b8ff]"
                : "pointer-events-none rounded-full bg-[var(--hud-surface)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f6af7] dark:text-[#c5b8ff]"}
              >
                {HUD_VERSION}
              </span>
            </button>
            {collapsedHudFocusTimer ? (
              <TaskTableChipButton
                aria-label={`${collapsedHudFocusTimer.isPaused ? "Resume" : "Pause"} timer for ${collapsedHudFocusTimer.title}`}
                className="shrink-0 gap-1.5 text-[#5f4ac9] dark:text-[#d6cdff]"
                onClick={() => onToggleFocusTimer(collapsedHudFocusTimer.categoryId)}
                toneClassName="border-[#ddd2ff] bg-[#f5f1ff] dark:border-[#42306f] dark:bg-[#241c42]"
              >
                {collapsedHudFocusTimer.isPaused ? <CirclePlay className="h-3.5 w-3.5 shrink-0" /> : <CirclePause className="h-3.5 w-3.5 shrink-0" />}
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[#5f4ac9] dark:text-[#d6cdff]">
                  {formatCollapsedHudTimerLabel(collapsedHudFocusTimer.seconds)}
                </span>
                <span className="hidden max-w-28 truncate text-[11px] font-medium sm:inline">{collapsedHudFocusTimer.title}</span>
              </TaskTableChipButton>
            ) : collapsedHudTaskTimer ? (
              <TaskTableChipButton
                aria-label={`${collapsedHudTaskTimer.pausedAt ? "Resume" : "Pause"} timer for ${collapsedHudTaskTimer.title}`}
                className="shrink-0 gap-1.5 text-[#5f4ac9] dark:text-[#d6cdff]"
                onClick={() => collapsedHudTaskTimer.pausedAt ? onResumeTaskTimer(collapsedHudTaskTimer.taskId) : onPauseTaskTimer(collapsedHudTaskTimer.taskId)}
                toneClassName="border-[#ddd2ff] bg-[#f5f1ff] dark:border-[#42306f] dark:bg-[#241c42]"
              >
                {collapsedHudTaskTimer.pausedAt ? <CirclePlay className="h-3.5 w-3.5 shrink-0" /> : <CirclePause className="h-3.5 w-3.5 shrink-0" />}
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[#5f4ac9] dark:text-[#d6cdff]">
                  {formatCollapsedHudTimerLabel(getTaskTimerDisplaySeconds(collapsedHudTaskTimer, taskTimerNow))}
                </span>
                <span className="hidden max-w-28 truncate text-[11px] font-medium sm:inline">{collapsedHudTaskTimer.title}</span>
              </TaskTableChipButton>
            ) : null}
            {currentHudPageId !== "overview" ? (
              <span className="hidden shrink-0 sm:inline">
                <span className={`${TASK_TABLE_CHIP_BASE_CLASS}${isNativeIosPlatform ? " -translate-y-0.5" : ""} border-[#ddd2ff] bg-[#f1ecff] text-[#7f6af7] dark:border-[#42306f] dark:bg-white/10 dark:text-[#c5b8ff]`}>
                  {activeHudPageTitle}
                </span>
              </span>
            ) : null}
            <span className={`${TASK_TABLE_CHIP_BASE_CLASS}${isNativeIosPlatform ? " -translate-y-0.5" : ""} shrink-0 border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]`}>
              Points {economy.points}
            </span>
            {pendingRewardDiceCount > 0 ? (
              <TaskTableChipButton
                aria-label={formatPendingDiceChipLabel(pendingRewardDiceCount)}
                className="shrink-0 gap-1.5 text-[#119a69] dark:text-[#8ff0cc]"
                onClick={onOpenPendingRewardBank}
                toneClassName="border-[#cfeedd] bg-[#ecfbf3] dark:border-[#1e5a42] dark:bg-[#103726]"
              >
                <Dice5 className="h-3.5 w-3.5" />
                {formatPendingDiceChipLabel(pendingRewardDiceCount)}
              </TaskTableChipButton>
            ) : null}
            <TaskTableChipButton
              aria-label="Refresh workspace"
              className={`${isNativeIosPlatform ? "-translate-y-0.5 " : ""}shrink-0 gap-1.5 text-[#5f56a6] dark:text-white/72`}
              disabled={isWorkspaceRefreshing}
              onClick={onRefreshWorkspace}
              toneClassName="border-[#e4deef] bg-[#f8f5ff] dark:border-white/10 dark:bg-white/[0.05]"
            >
              <Wifi className={`h-3.5 w-3.5 ${isWorkspaceRefreshing ? "animate-pulse" : ""}`} />
              {refreshStatus === "updating" ? "Updating" : isWorkspaceRefreshing ? "Syncing" : "Refresh"}
            </TaskTableChipButton>
            <TaskTableChipButton
              aria-label="Open Scratch Paper notes"
              className="shrink-0 text-[#6f57f6] dark:text-[#cabfff]"
              onClick={onViewScratchPaper}
              toneClassName="border-[#ddd6fb] bg-white/90 dark:border-white/10 dark:bg-white/[0.06]"
            >
              Scratch Paper
            </TaskTableChipButton>
            <TaskTableChipButton
              aria-label="Expand HUD"
              className={`${isNativeIosPlatform ? "-translate-y-0.5 " : ""}shrink-0 gap-1.5 text-[#6f57f6] dark:text-[#cabfff]`}
              onClick={() => setHudCollapsed(false)}
              toneClassName="border-[#ddd6fb] bg-white/90 dark:border-white/10 dark:bg-white/[0.06]"
            >
              <ChevronUp className="h-3.5 w-3.5" />
              Open
            </TaskTableChipButton>
            <div className={isNativeIosPlatform ? "row-span-2 shrink-0" : "shrink-0"}>{accountButton}</div>
          </div>
        </div>
        {hudDateTime ? <span className="mt-1 block text-left text-[11px] font-medium leading-none tabular-nums text-[#817a9d] dark:text-white/55">{hudDateTime}</span> : null}
      </header>
    );
  }

  return (
    <header className="px-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center justify-between gap-3 lg:mr-[5px] lg:shrink-0 lg:justify-start">
          <button
            aria-label="Collapse HUD"
            className={isNativeIosPlatform
              ? "flex min-h-12 flex-col items-center justify-center gap-0 rounded-full bg-[var(--hud-surface)] px-2 py-1.5 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f57f6]/45"
              : "flex min-h-12 items-center gap-1 rounded-full bg-[var(--hud-surface)] px-2 py-1.5 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f57f6]/45"}
            onClick={() => setHudCollapsed(true)}
            type="button"
          >
            <span className="pointer-events-none flex items-center">
              <BrandMark profile={profile} />
            </span>
            <span className={isNativeIosPlatform
              ? "pointer-events-none rounded-full bg-[var(--hud-surface)] px-1 py-0.5 text-[11px] font-semibold leading-none text-[#7f6af7] dark:text-[#c5b8ff]"
              : "pointer-events-none rounded-full bg-[var(--hud-surface)] px-2 py-0.5 text-[11px] font-semibold text-[#7f6af7] dark:text-[#c5b8ff]"}
            >
              {HUD_VERSION}
            </span>
          </button>
          <div className="lg:hidden">{accountButton}</div>
        </div>
        <HudCommandCenter
          hudUiState={hudUiState}
          renderWidget={renderHudWidget}
          setHudUiState={setHudUiState}
        />
        <div className="flex items-center justify-end gap-2 lg:shrink-0">
          {pendingRewardDiceCount > 0 ? (
            <TaskTableChipButton
              aria-label={formatPendingDiceChipLabel(pendingRewardDiceCount)}
              className="gap-1.5 text-[#119a69] dark:text-[#8ff0cc]"
              onClick={onOpenPendingRewardBank}
              toneClassName="border-[#cfeedd] bg-[#ecfbf3] dark:border-[#1e5a42] dark:bg-[#103726]"
            >
              <Dice5 className="h-3.5 w-3.5" />
              {formatPendingDiceChipLabel(pendingRewardDiceCount)}
            </TaskTableChipButton>
          ) : null}
          <TaskTableChipButton
            aria-label="Open Scratch Paper notes"
            className="text-[#6f57f6] dark:text-[#cabfff]"
            onClick={onViewScratchPaper}
            toneClassName="border-[#ddd6fb] bg-white/90 dark:border-white/10 dark:bg-white/[0.06]"
          >
            Scratch Paper
          </TaskTableChipButton>
          <TaskTableChipButton
            aria-label="Collapse HUD"
            className="gap-1.5 text-[#6f57f6] dark:text-[#cabfff]"
            onClick={() => setHudCollapsed(true)}
            toneClassName="border-[#ddd6fb] bg-white/90 dark:border-white/10 dark:bg-white/[0.06]"
          >
            <ChevronUp className="h-3.5 w-3.5 rotate-180" />
            Collapse
          </TaskTableChipButton>
          <div className="hidden lg:block">{accountButton}</div>
        </div>
      </div>
      {hudDateTime ? <span className="mt-1 block text-left text-[11px] font-medium leading-none tabular-nums text-[#817a9d] dark:text-white/55">{hudDateTime}</span> : null}
    </header>
  );
}

function ProfileAvatarImage({ avatarSrc }: { avatarSrc: string }) {
  return (
    <Image
      alt="Profile avatar"
      className="h-11 w-11 rounded-full bg-[var(--hud-surface)] object-cover ring-[3px] ring-white/70 shadow-[0_8px_22px_rgba(81,61,168,0.12)]"
      height={44}
      key={avatarSrc}
      priority
      src={avatarSrc}
      unoptimized={avatarSrc.startsWith("data:")}
      width={44}
    />
  );
}

function BrandMark({
  compact = false,
  profile,
}: {
  compact?: boolean;
  profile: UserProfile;
}) {
  const [errored, setErrored] = useState(false);
  const logoSrc = (!errored && profile.logoSrc) || "/logo.png";

  return (
    <Image
      alt="ADHDice logo"
      className="max-w-none object-contain object-left pl-[3px]"
      height={compact ? 36 : 50}
      onError={() => setErrored(true)}
      priority
      src={withBasePath(logoSrc)}
      unoptimized={logoSrc.startsWith("data:")}
      width={compact ? 122 : 170}
    />
  );
}

function AccountModal({
  onClose,
  onSave,
  onSignOut,
  profile,
}: {
  onClose: () => void;
  onSave: (profile: UserProfile) => Promise<void>;
  onSignOut: () => void;
  profile: UserProfile;
}) {
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [isSaving, setIsSaving] = useState(false);

  return (
    <ModalShell className={`w-full max-w-[34rem] max-h-[82vh] overflow-y-auto rounded-[2rem] border p-6 border-[#ece8f8] bg-white shadow-[0_30px_80px_rgba(81,61,168,0.16)] dark:border-white/10 dark:bg-[#171328]`} label="Account" onClose={onClose}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/35`}>
              Account
            </p>
            <h2 className={`mt-2 text-3xl font-black text-[#202844] dark:text-white`}>
              {draft.created ? "Edit profile" : "Create your account"}
            </h2>
          </div>
          <button
            className="ui-pill-button-light"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-2">
            <span className={`text-sm font-semibold text-[#5f6983] dark:text-white/65`}>Display name</span>
            <input
              className={`h-12 rounded-[1rem] px-4 text-base outline-none bg-[#f7f5ff] text-[#1f2642] dark:bg-white/8 dark:text-white`}
              onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
              value={draft.displayName}
            />
          </label>

          <label className="grid gap-2">
            <span className={`text-sm font-semibold text-[#5f6983] dark:text-white/65`}>Email</span>
            <input
              className={`h-12 rounded-[1rem] px-4 text-base outline-none bg-[#f7f5ff] text-[#1f2642] dark:bg-white/8 dark:text-white`}
              onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
              type="email"
              value={draft.email}
            />
          </label>

          <UploadField
            helper="Upload a profile photo."
            label="Profile photo"
            onFile={(value) => setDraft((current) => ({ ...current, avatarSrc: value }))}
          />

          <UploadField
            helper="Upload your transparent logo file to replace the text wordmark."
            label="Transparent logo"
            onFile={(value) => setDraft((current) => ({ ...current, logoSrc: value }))}
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Image
                alt="Profile preview"
                className="h-12 w-12 rounded-full object-cover"
                height={48}
                src={draft.avatarSrc}
                unoptimized={draft.avatarSrc.startsWith("data:")}
                width={48}
              />
              <div>
                <p className={`text-sm font-semibold text-[#202844] dark:text-white`}>{draft.displayName}</p>
                <p className={`text-xs text-[#8a84a3] dark:text-white/45`}>{draft.email}</p>
              </div>
            </div>
            <button
              className="ui-pill-button-strong-light"
              disabled={isSaving}
              onClick={async () => {
                setIsSaving(true);
                await onSave({
                  ...draft,
                  created: true,
                });
                setIsSaving(false);
              }}
              type="button"
            >
              {isSaving ? "Saving..." : draft.created ? "Save Profile" : "Create Account"}
            </button>
          </div>
          <button
            className="ui-pill-button-danger-light mt-2 w-full"
            onClick={onSignOut}
            type="button"
          >
            Sign Out
          </button>
        </div>
    </ModalShell>
  );
}

function UploadField({
  helper,
  label,
  onFile,
}: {
  helper: string;
  label: string;
  onFile: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className={`text-sm font-semibold text-[#5f6983] dark:text-white/65`}>{label}</span>
      <input
        className={`rounded-[1rem] px-4 py-3 text-sm outline-none file:mr-3 file:rounded-full file:border-0 file:px-4 file:py-2 file:font-semibold bg-[#f7f5ff] text-[#1f2642] file:bg-[#ede8ff] file:text-[#6f57f6] dark:bg-white/8 dark:text-white dark:file:bg-[#22193f] dark:file:text-[#cabfff]`}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const value = await readFileAsDataUrl(file);
          onFile(value);
        }}
        type="file"
      />
      <span className={`text-xs text-[#8a84a3] dark:text-white/45`}>{helper}</span>
    </label>
  );
}

function OverviewStatCard({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <section className={`flex h-[139px] w-[180px] flex-col items-center justify-center rounded-[1.8rem] border px-5 py-4 text-center transition hover:-translate-y-0.5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6`}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/35`}>{label}</p>
      <p className={`mt-1 text-4xl font-black leading-none text-[#1f2746] dark:text-white`}>{value}</p>
      <p className={`mt-1 text-sm leading-tight text-[#7f88a1] dark:text-white/55`}>{detail}</p>
    </section>
  );
}

// ─── Page placeholder (Games, Test, unknown) ─────────────────────────────────

const TEST_LIST_TRAY_PREVIEW_OPTIONS = ["Inbox", "Today", "Focus", "Recurring", "Waiting", "Later", "Done", "Missed"];
const TEST_LIST_TRAY_PREVIEW_ROWS = [
  ["Inbox", "Today", "Focus", "Recurring"],
  ["Waiting", "Later", "Done", "Missed"],
];

function TestBucketTrayPreview() {
  const [activeBucketPreview, setActiveBucketPreview] = useState("Inbox");
  const [isTrayOpen, setIsTrayOpen] = useState(true);
  const previewChipClass = "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none whitespace-nowrap";

  return (
    <div className="mx-auto mt-10 w-full max-w-6xl rounded-[2rem] border border-[#eee7ff] bg-[linear-gradient(180deg,#fcfbff_0%,#f8f4ff_100%)] p-6 text-left shadow-[0_28px_80px_rgba(116,88,255,0.12)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(35,28,58,0.95)_0%,rgba(25,20,43,0.98)_100%)]">
      <div className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9b92be] dark:text-white/35">
          Lists Menu Preview
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#342d56] dark:text-white">
          Boxed dropdown vs floating chip tray
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#726a96] dark:text-white/60">
          Same trigger chip, two different expanded states. The left version behaves like a dropdown panel. The right version feels lighter, softer, and more like a tray made of chips.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-[1.75rem] border border-[#ede6ff] bg-white/82 p-5 shadow-[0_18px_40px_rgba(121,93,255,0.08)] backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#b19bc8] dark:text-white/35">
            Before
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[#3a335c] dark:text-white">
            Boxed dropdown panel
          </h3>
          <p className="mt-1 text-sm leading-6 text-[#7c739f] dark:text-white/55">
            Reads like a menu card first, chips second.
          </p>
          <div className="mt-5">
            <button className="appearance-none border-0 bg-transparent p-0 text-left" type="button">
              <span className="inline-flex items-center rounded-full bg-[#f4f5f8] px-2.5 py-1 text-[11px] font-semibold leading-none text-[#68738c] whitespace-nowrap dark:bg-white/8 dark:text-white/60">
                Inbox
              </span>
            </button>
            <div className="mt-3 w-full max-w-[20rem] rounded-[1.1rem] border border-[#ece8f8] bg-white p-3 shadow-[0_18px_36px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#1a1230]">
              <div className="flex flex-wrap gap-2">
                {TEST_LIST_TRAY_PREVIEW_OPTIONS.map((bucket) => (
                  <button className="appearance-none border-0 bg-transparent p-0 text-left" key={`boxed-${bucket}`} type="button">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1.5 text-[13px] font-semibold leading-none whitespace-nowrap ${
                        bucket === "Inbox"
                          ? "bg-[#efe9ff] text-[#6f57f6] dark:bg-[#2b214d] dark:text-[#cabfff]"
                          : "bg-[#f4f5f8] text-[#7c86a1] dark:bg-white/8 dark:text-white/60"
                      }`}
                    >
                      {bucket}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-[#ede6ff] bg-white/82 p-5 shadow-[0_18px_40px_rgba(121,93,255,0.08)] backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8f7cff] dark:text-[#cabfff]">
            After
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[#3a335c] dark:text-white">
            Floating chip tray
          </h3>
          <p className="mt-1 text-sm leading-6 text-[#7c739f] dark:text-white/55">
            Reads like a small floating surface made from chips, and every tray chip stays the exact same size as the trigger chip.
          </p>
          <div className="mt-5">
            <button
              className="appearance-none border-0 bg-transparent p-0 text-left"
              onClick={() => setIsTrayOpen((current) => !current)}
              type="button"
            >
              <span className={`${previewChipClass} bg-[#f4f5f8] text-[#68738c] dark:bg-white/8 dark:text-white/60`}>
                {activeBucketPreview}
              </span>
            </button>
            {isTrayOpen ? (
              <div className="relative mt-3 inline-block w-fit rounded-[1.5rem] bg-white/78 px-2 py-2 shadow-[0_24px_60px_rgba(115,88,255,0.14)] ring-1 ring-[#ede6ff] backdrop-blur-md dark:bg-white/[0.05] dark:ring-white/10">
                <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(128,100,255,0.35),transparent)] dark:bg-[linear-gradient(90deg,transparent,rgba(202,191,255,0.35),transparent)]" />
                <div className="inline-flex flex-col items-start gap-2">
                  {TEST_LIST_TRAY_PREVIEW_ROWS.map((row, rowIndex) => (
                    <div className="flex items-center gap-2" key={`tray-row-${rowIndex}`}>
                      {row.map((bucket) => (
                        <button
                          className="appearance-none border-0 bg-transparent p-0 text-left"
                          key={`tray-${bucket}`}
                          onClick={() => setActiveBucketPreview(bucket)}
                          type="button"
                        >
                          <span
                            className={`${previewChipClass} ${
                              bucket === activeBucketPreview
                                ? "bg-[#efe9ff] text-[#6f57f6] shadow-[0_6px_18px_rgba(111,87,246,0.18)] dark:bg-[#2b214d] dark:text-[#cabfff]"
                                : "bg-[#f4f5f8] text-[#7c86a1] dark:bg-white/8 dark:text-white/60"
                            }`}
                          >
                            {bucket}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function TestRuleBuilderPreview() {
  const previewLists = useMemo(() => getBuiltInTaskLists(), []);
  const previewListOptions = useMemo(() => previewLists.map((list) => ({ label: list.name, value: list.id })), [previewLists]);
  const previewListLabelById = useMemo(
    () => Object.fromEntries(previewListOptions.map((list) => [list.value, list.label])) as Record<string, string>,
    [previewListOptions],
  );
  const [rules, setRules] = useState<TaskListRuleGroup>({
    rules: [
      { rule: { field: "status", op: "is", value: "in_progress" } },
      { connector: "and", rule: { field: "energy", op: "is", value: "medium" } },
      { connector: "or", rule: { field: "due", op: "is_today" } },
    ],
  });

  return (
    <div className="mx-auto mt-10 w-full max-w-6xl rounded-[2rem] border border-[#eee7ff] bg-[linear-gradient(180deg,#fcfbff_0%,#f8f4ff_100%)] p-6 text-left shadow-[0_28px_80px_rgba(116,88,255,0.12)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(35,28,58,0.95)_0%,rgba(25,20,43,0.98)_100%)]">
      <div className="max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9b92be] dark:text-white/35">
          Rules Builder Preview
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#342d56] dark:text-white">
          Chip-based rule rows
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#726a96] dark:text-white/60">
          This built-in test page previews the list settings rule builder with chip controls instead of system dropdowns.
        </p>
      </div>

      <div className="mt-6 rounded-[1.75rem] border border-[#ede6ff] bg-white/82 p-5 shadow-[0_18px_40px_rgba(121,93,255,0.08)] backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8f7cff] dark:text-[#cabfff]">
            Preview state
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {rules.rules.map((row, ruleIndex) => (
            <div className="space-y-2" key={`test-rule-${ruleIndex}`}>
              {ruleIndex > 0 ? (
                <div className="flex items-center gap-2 px-2">
                  {(["and", "or"] as const).map((connector) => (
                    <TaskTableChipButton
                      className="transition"
                      key={`test-${ruleIndex}-${connector}`}
                      onClick={() => setRules((current) => updateTaskListRuleRowConnector(current, ruleIndex, connector))}
                      toneClassName={row.connector === connector ? "border-[#e8defe] bg-[#f3eeff] text-[#7762f3] dark:border-[#3a2e63] dark:bg-[#21183d] dark:text-[#c7bcff]" : "border-[#e4deef] bg-[#f4f5f8] text-[#68738c] dark:border-white/10 dark:bg-white/8 dark:text-white/60"}
                    >
                      {connector === "and" ? "And" : "Or"}
                    </TaskTableChipButton>
                  ))}
                </div>
              ) : null}
              <TaskListRuleRowEditor
                energyOptions={energyOptions}
                fieldOptions={TASK_LIST_RULE_FIELD_OPTIONS}
                key={`test-row-${ruleIndex}`}
                listLabelById={previewListLabelById}
                listOptions={previewListOptions}
                onChange={(nextRule) => setRules((current) => updateTaskListRuleRow(current, ruleIndex, nextRule))}
                onRemove={() => setRules((current) => removeTaskListRuleRow(current, ruleIndex))}
                operatorOptionsByField={TASK_LIST_RULE_OPERATOR_OPTIONS}
                rule={row.rule}
                taskStatusOptions={taskStatusOptions}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <button
            className="ui-pill-button-light inline-flex items-center gap-2 transition"
            onClick={() => setRules((current) => appendTaskListRuleRow(current))}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Add preview rule
          </button>
          <p className="text-sm text-[#726a96] dark:text-white/60">
            {summarizeTaskListRules(rules, (listId) => previewListLabelById[listId] ?? "")}
          </p>
        </div>
      </div>
    </div>
  );
}

function PagePlaceholder({
  count,
  isDark,
  page,
  setActivePage,
}: {
  count: number;
  isDark: boolean;
  page: AppPage;
  setActivePage: (page: AppPage) => void;
}) {
  return (
    <section className="flex flex-col items-center pt-[5px] text-center">
      <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8e88a9] dark:text-white/40`}>
        {page}
      </p>
      <h1 className={`mt-2 text-[clamp(2.2rem,5vw,3.6rem)] font-black tracking-tight text-[#17203a] dark:text-white`}>
        {page} Page
      </h1>
      <p className={`mt-1 max-w-lg text-base leading-relaxed text-[#707a95] dark:text-white/55`}>
        This section is currently being refined to match the new high-fidelity ADHDice design system. Your focus overview and task cockpit are live!
      </p>
      <div className="mt-12 flex flex-wrap justify-center gap-6">
        <button
          className="ui-pill-button-strong-light transition hover:-translate-y-0.5"
          onClick={() => setActivePage("Home")}
          type="button"
        >
          Back to Home
        </button>
        <button
          className="ui-pill-button-strong-light transition hover:-translate-y-0.5"
          onClick={() => setActivePage("Tasks")}
          type="button"
        >
          Open Tasks
        </button>
      </div>
      <div className="mt-12 flex flex-wrap justify-center gap-6">
        <OverviewStatCard detail="available in queue" label="Active Tasks" value={String(count)} />
        <OverviewStatCard detail="next page candidate" label="Current Section" value={page} />
        <OverviewStatCard detail="stays in bottom dock" label="Navigation" value="Persistent" />
      </div>
      {page === "Test" ? (
        <div className="w-full space-y-10">
          <div className="rounded-[32px] border border-[#e9e1ff] bg-white/90 p-5 shadow-[0_18px_50px_rgba(109,82,237,0.08)] dark:border-white/10 dark:bg-[#120f1d]/85">
            <div className="flex flex-wrap items-center justify-between gap-3 px-3 pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8e84b7] dark:text-white/45">
                  Table #2 Test
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-[#2a3250] dark:text-white">
                  Server-style task management table
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#727a93] dark:text-white/60">
                  Prototype sandbox for the richer task table treatment. This stays isolated to the Test page so we can
                  tune layout, chips, and row actions without disrupting the real Tasks view.
                </p>
              </div>
          </div>
          <TaskManagementTableV2 className="max-w-none p-0" title="Task Table #2" />
          </div>
          <ErrorBoundary fallback={<div className="rounded-[1.5rem] border border-[#ece8f8] bg-white p-5 text-sm font-medium text-[#7d88a1] dark:border-white/10 dark:bg-white/6 dark:text-white/60">Test tools failed to load.</div>}>
            <TestD20FaceMapper dark={isDark} />
            <TestDiceFaceMapper dark={isDark} />
            <TestDiceMaterialLab dark={isDark} />
            <TestTaskTablePrototype />
          </ErrorBoundary>
          <TestBucketTrayPreview />
          <TestRuleBuilderPreview />
        </div>
      ) : null}
    </section>
  );
}

function ProgressStat({
  compact = false,
  label,
  value,
  percent,
}: {
  compact?: boolean;
  label: string;
  value: string;
  percent: number;
}) {
  return (
    <div className={`flex h-full w-full items-center gap-2 rounded-full ${compact ? "bg-transparent px-1 py-0 dark:bg-transparent" : "bg-[#f6f2ff] px-3 py-2 dark:bg-white/10"}`}>
      <span className={`shrink-0 whitespace-nowrap rounded-full leading-none ${compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1 text-sm"} font-bold bg-[#6f57f6] text-white dark:bg-[#c8baff] dark:text-[#191229]`}>
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`${compact ? "truncate text-[11px]" : "text-sm"} font-semibold text-[#26304c] dark:text-white`}>{value}</p>
        <div className={`mt-1 ${compact ? "h-1.5 w-full" : "h-2 w-24"} overflow-hidden rounded-full bg-[#dfdaf3] dark:bg-white/10`}>
          <div
            className={`h-full rounded-full transition-all duration-700 bg-[#6f57f6] dark:bg-[#c8baff]`}
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  compact = false,
  label,
  value,
}: {
  compact?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className={`flex h-full w-full ${compact ? "items-center justify-between gap-2 px-1" : "flex-col justify-center rounded-full px-4 py-2 bg-white shadow-[0_10px_30px_rgba(81,61,168,0.08)] dark:bg-white/10"}`}>
      <p className={`${compact ? "truncate text-[10px]" : "text-[11px]"} font-semibold uppercase tracking-[0.16em] text-[#8a84a3] dark:text-white/40`}>{label}</p>
      <p className={`${compact ? "text-sm" : "mt-1 text-lg"} font-bold text-[#202743] dark:text-white`}>{value}</p>
    </div>
  );
}


async function readFileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

async function migrateLocalFocusState(
  supabase: NonNullable<ReturnType<typeof createBrowserSupabaseClient>>,
  user: User,
) {
  const storedCategories = parseStoredJson<FocusCategory[]>(FOCUS_CATEGORIES_STORAGE_KEY, []);
  const storedActiveSessions = parseStoredJson<Record<string, ActiveFocusSession>>(FOCUS_ACTIVE_STORAGE_KEY, {});
  const storedHistory = parseStoredJson<HistoricalFocusSession[]>(FOCUS_HISTORY_STORAGE_KEY, []);

  const hasLocalData = storedCategories.length > 0 ||
    Object.keys(storedActiveSessions).length > 0 ||
    storedHistory.length > 0;

  if (!hasLocalData) {
    return false;
  }

  const fallbackCategories = storedCategories.length > 0
    ? storedCategories
    : getDefaultFocusCategories(user.id).map((category, index) => ({
        id: `legacy-${index + 1}`,
        title: category.title,
        focusType: category.focus_type,
        focusSubtype: category.focus_subtype ?? null,
        focusSubtype2: category.focus_subtype_2 ?? null,
        color: category.color,
        icon: category.icon,
        dailyGoalSeconds: category.daily_goal_seconds ?? null,
        weeklyGoalSeconds: category.weekly_goal_seconds ?? null,
      }));

  const categoryIdMap = new Map<string, string>();
  const categoryPayload = fallbackCategories.map((category, index) => {
    const nextId = crypto.randomUUID();
    categoryIdMap.set(category.id, nextId);

    return {
      id: nextId,
      user_id: user.id,
      title: sanitizeFocusLabel(category.title, "Untitled Category"),
      focus_type: sanitizeFocusLabel(category.focusType, "Work"),
      focus_subtype: sanitizeOptionalFocusLabel(category.focusSubtype),
      focus_subtype_2: sanitizeOptionalFocusLabel(category.focusSubtype2),
      color: category.color,
      icon: category.icon,
      daily_goal_seconds: category.dailyGoalSeconds ?? null,
      weekly_goal_seconds: category.weeklyGoalSeconds ?? null,
      sort_order: index,
    };
  });

  const { error: categoryError } = await supabase
    .from("adhdice_focus_categories")
    .insert(categoryPayload);

  if (categoryError) {
    return false;
  }

  const activePayload = Object.values(storedActiveSessions)
    .map((entry) => {
      const categoryId = categoryIdMap.get(entry.categoryId);
      if (!categoryId) {
        return null;
      }

      return {
        user_id: user.id,
        category_id: categoryId,
        start_time: entry.startTime ? new Date(entry.startTime).toISOString() : null,
        accumulated_seconds: entry.accumulatedSeconds,
        is_running: entry.isRunning,
      };
    })
    .filter((entry): entry is {
      user_id: string;
      category_id: string;
      start_time: string | null;
      accumulated_seconds: number;
      is_running: boolean;
    } => entry !== null);

  if (activePayload.length > 0) {
    await supabase
      .from("adhdice_focus_active_sessions")
      .insert(activePayload);
  }

  const historyPayload = storedHistory
    .map((entry) => {
      const categoryId = entry.categoryId ? categoryIdMap.get(entry.categoryId) ?? null : null;
      if (entry.categoryId && !categoryId) {
        return null;
      }

      return {
        user_id: user.id,
        category_id: categoryId,
        title_snapshot: sanitizeFocusLabel(entry.title, "Untitled Session"),
        focus_type_snapshot: sanitizeFocusLabel(entry.focusType, "Work"),
        focus_subtype_snapshot: sanitizeOptionalFocusLabel(entry.focusSubtype),
        focus_subtype_2_snapshot: sanitizeOptionalFocusLabel(entry.focusSubtype2),
        session_date: entry.date,
        duration_seconds: entry.durationSeconds,
        notes: entry.notes ?? null,
        source: "import" as const,
      };
    })
    .filter((entry): entry is {
      user_id: string;
      category_id: string;
      title_snapshot: string;
      focus_type_snapshot: string;
      focus_subtype_snapshot: string | null;
      focus_subtype_2_snapshot: string | null;
      session_date: string;
      duration_seconds: number;
      notes: string | null;
      source: "import";
    } => entry !== null);

  if (historyPayload.length > 0) {
    await supabase
      .from("adhdice_focus_sessions")
      .insert(historyPayload);
  }

  return true;
}

async function migrateLocalTaskFocusDays(
  supabase: NonNullable<ReturnType<typeof createBrowserSupabaseClient>>,
  user: User,
) {
  const storedSelections = parseStoredJson<Record<string, string[]>>(
    getUserScopedStorageKey(TASK_FOCUS_STORAGE_KEY, user.id),
    {},
  );

  const payload = Object.entries(storedSelections)
    .map(([focusDate, taskIds]) => {
      const normalizedTaskIds = normalizeTaskFocusIds(taskIds);

      if (!isValidDateKey(focusDate) || normalizedTaskIds.length === 0) {
        return null;
      }

      return {
        user_id: user.id,
        focus_date: focusDate,
        task_ids: normalizedTaskIds,
      };
    })
    .filter((entry): entry is {
      user_id: string;
      focus_date: string;
      task_ids: string[];
    } => entry !== null);

  if (payload.length === 0) {
    return false;
  }

  const { error } = await supabase
    .from("adhdice_task_focus_days")
    .upsert(payload, { onConflict: "user_id,focus_date" });

  return !error;
}
