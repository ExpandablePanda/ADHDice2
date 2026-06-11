"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
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
import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
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
import { TaskRewardModal } from "./task-app/task-reward-modal";
import { DuplicateTaskGroupsAdapter, TasksListAdapter } from "./task-app/tasks-list-adapter";
import { TasksNonListShell } from "./task-app/tasks-non-list-shell";
import { HudCommandCenter, HudRuntimeClock } from "./task-app/hud-command-center";
import { FocusAlarmWidget } from "./task-app/focus-alarm-widget";
import {
  applyTaskEditorDraftOverrides,
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
import { TaskManagementTableV2, type RunningTaskTimer } from "@/components/ui/task-management-table-v2";
import { ModalShell } from "./modal-shell";
import { ErrorBoundary } from "./error-boundary";
import { ScrollUpButton, TaskTableChipButton } from "@/components/ui/task-table-primitives";
import { useEconomy } from "@/hooks/useEconomy";
import { useAchievements } from "@/hooks/useAchievements";
import { useFocus, mapFocusCategoryRow, mapActiveSessions, mapFocusSessionRow, mergeStoredFocusHistory, mergeStoredFocusCategories, saveFocusCategories, saveFocusHistory } from "@/hooks/useFocus";
import { useHealth } from "@/hooks/useHealth";
import { useTaskActions } from "@/hooks/useTaskActions";
import { useTaskRewardController } from "@/hooks/useTaskRewardController";
import { useTaskUiState } from "@/hooks/useTaskUiState";
import { useWorkspaceData } from "@/hooks/useWorkspaceData";
import { useResponsiveTaskGridColumns } from "@/hooks/useResponsiveTaskGridColumns";
import { useTaskListSelection } from "@/hooks/useTaskListSelection";
import { useTaskListViewStateController } from "@/hooks/useTaskListViewStateController";
import { useTaskPlannerActions } from "@/hooks/useTaskPlannerActions";
import { useTaskGridLayoutController } from "@/hooks/useTaskGridLayoutController";
import { useFocusSelectionPersistence } from "@/hooks/useFocusSelectionPersistence";
import { useTaskPriorityRoutingController } from "@/hooks/useTaskPriorityRoutingController";
import { useTaskEditorImportController } from "@/hooks/useTaskEditorImportController";
import { useTaskTimers } from "@/hooks/useTaskTimers";
import {
  sanitizeFocusLabel,
  sanitizeOptionalFocusLabel,
} from "@/lib/focus-utils";
import { createBrowserSupabaseClient, subscribeToBrowserAuth } from "@/lib/supabase";
import { getLevelProgress } from "@/lib/economy-levels";
import { buildHealthReminderTemplate, type HealthReminderTemplateKey } from "@/lib/health-utils";
import { isTaskOpen, shouldRouteTaskToInbox, type TaskBucket, type TaskRoutingBucket } from "@/lib/task-buckets";
import type { TaskEditorLinkedNote } from "@/lib/task-notes";
import { sortTasksForUi } from "@/lib/task-sorting";
import { hasActiveTaskFilters, resetTaskFiltersPreservingView } from "@/lib/task-filter-state";
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
} from "@/lib/task-cockpit";
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
import { getBrowserTimeZone, getLogicalDayKey, saveLogicalDaySettings } from "@/lib/logical-day";
import { runStorageMigrations } from "@/lib/storage-migrations";
import { buildProfileSnapshot, DEFAULT_PROFILE, saveProfile, type UserProfile, useProfileStore } from "@/lib/profile-store";
import {
  isMissingParentSubtaskColumnError,
  isMissingTaskActualSecondsColumnError,
  isMissingTaskEnergyNoneEnumError,
  isMissingTaskListManualMembershipsTableError,
  isMissingTaskListsTableError,
} from "@/lib/task-db-compat";
import {
  insertTaskRowWithLegacyEnergyFallback,
  updateTaskRowWithLegacyEnergyFallback,
} from "@/lib/task-db-mutations";
import { isValidDateKey, mapTaskFocusDayRows, normalizeTaskFocusIds } from "@/lib/task-focus-days";
import { buildFocusLabelOptions, getDefaultFocusCategories } from "@/lib/task-focus-labels";
import { formatActualSecondsLabel } from "@/lib/task-formatting";
import type { HudWidgetType } from "@/lib/task-hud-layout";
import { calcNextDueDateFromDate } from "@/lib/task-repeat";
import { computeTaskAppDerivedData } from "@/lib/task-app-derived";
import { DUPLICATE_TITLE_SEARCH_OPERATORS, parseTaskSearchInput } from "@/lib/task-search";
import {
  buildTaskHistoryFacts,
  computeTaskHistoryStats,
  computeTaskSpecificHistoryStats,
  isTaskCompletedForHistory,
  isTaskHistoryStatus,
  mapTaskHistoryRow,
  type TaskHistoryStats,
} from "@/lib/task-history";
import { groupTaskSubtasksByTaskId, mapTaskSubtaskRow } from "@/lib/task-subtasks";
import {
  buildManualMembershipMap,
  getBuiltInTaskLists,
  isBuiltInTaskListId,
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
  getUserScopedStorageKey,
  parseStoredJson,
  TASK_FOCUS_STORAGE_KEY,
  type AppPage,
  type TaskUiState,
} from "@/lib/task-ui-state";

import type {
  FocusCategory as DbFocusCategory,
  Note,
  Task,
  TaskEnergy,
  TaskFocusDay as DbTaskFocusDay,
  TaskGridLayout as DbTaskGridLayout,
  TaskInsert,
  TaskActualTimeEntry,
  TaskPriority,
  TaskRepeatFrequency,
  TaskStatus,
  TaskSubtask as DbTaskSubtask,
  TaskSubtaskStatus,
  TaskUpdate,
  TaskHistory as DbTaskHistory,
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
const AchievementCelebrationOverlay = dynamic(() => import("./task-app/achievements-page").then((module) => module.AchievementCelebrationOverlay));
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

const FOCUS_ALARM_STORAGE_KEY_PREFIX = "adhdice:focus-alarm";
const FOCUS_ALARM_BLOCKED_MESSAGE = "Focus alarm sound was blocked. Tap the alarm widget again to re-arm audio.";
const HUD_VERSION = "5.5.5";
const HUD_LOADING_SHELL_HEIGHT = 96;

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
  due: "Due",
  energy: "Energy",
  estimated_time: "Estimated Time",
  actual_time: "Actual Time",
  tags: "Tags",
  link: "Link",
  notes: "Notes",
  priority: "Priority",
  repeat: "Repeat",
  signal: "Indicators",
};
const LIST_COLUMN_PICKER_ORDER: AgentPlanColumnId[] = ["bucket", "date_added", "due", "estimated_time", "actual_time", "tags", "link", "notes", "priority", "energy", "repeat", "signal"];
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
  trash: "Trash",
};
const TASK_LIST_RULE_FIELD_OPTIONS: Array<{ label: string; value: TaskListRuleField }> = [
  { label: "Status", value: "status" },
  { label: "List", value: "list" },
  { label: "Steps", value: "steps" },
  { label: "Completed", value: "completed_history" },
  { label: "Missed", value: "missed_history" },
  { label: "Completed Streak", value: "completed_streak" },
  { label: "Missed Streak", value: "missed_streak" },
  { label: "Date Added", value: "date_added" },
  { label: "Due", value: "due" },
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
const priorityOptions: TaskPriority[] = ["normal", "high", "low"];
const energyOptions: TaskEnergy[] = ["none", "low", "medium", "high"];
const taskStatusOptions: TaskStatus[] = ["pending", "in_progress", "done", "did_my_best", "missed", "upcoming", "not_due", "archived"];
const repeatFrequencyOptions: TaskRepeatFrequency[] = ["none", "daily", "weekly", "monthly", "custom"];
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

export function TaskApp() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const hudShellRef = useRef<HTMLDivElement | null>(null);
  const profileSettingsHydratedRef = useRef(false);
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [message, setMessage] = useState<Message | null>(null);
  const [hudNotificationEvents, setHudNotificationEvents] = useState<HudNotificationItem[]>([]);
  const lastHudNotificationMessageRef = useRef<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [lowStim, setLowStim] = useState(false);
  const [accentColor, setAccentColor] = useState("#6f57f6");
  const [focusAlarmEnabled, setFocusAlarmEnabled] = useState(false);
  const [focusAlarmIntervalMinutes, setFocusAlarmIntervalMinutes] = useState(DEFAULT_FOCUS_ALARM_INTERVAL_MINUTES);
  const [focusAlarmNextRingAt, setFocusAlarmNextRingAt] = useState<number | null>(null);
  const [mobileZoom, setMobileZoom] = useState<(typeof MOBILE_ZOOM_LEVELS)[number]>(1);
  const [isHudAppearanceReady, setIsHudAppearanceReady] = useState(false);
  const { economy, setEconomy, appendEconomyEvent, commitTaskReward, resetEconomy } = useEconomy(supabase, session?.user?.id ?? null);
  const {
    focusCategories, setFocusCategories,
    activeSessions, setActiveSessions,
    focusHistory, setFocusHistory,
    suppressCategoryReload,
    handleToggleTimer, handleFinishTimer, handleAdjustTimer, handleResetTimer,
    handleManualFocusEntry, handleSaveCategories, handleDeleteFocusCategory,
    handleUpdateFocusHistoryEntry, handleDeleteFocusHistoryEntry,
  } = useFocus(supabase, session?.user?.id ?? null, setMessage, appendEconomyEvent);
  const {
    awards: healthAwards,
    checkIns: healthCheckIns,
    deleteFavoriteFood,
    deleteMealEntry,
    deleteWeightEntry,
    favorites: healthFavorites,
    importAudits: healthImportAudits,
    isLoading: isHealthLoading,
    importAppleHealthData,
    mealEntries: healthMealEntries,
    metricEntries: healthMetricEntries,
    profile: healthProfile,
    saveCheckIn,
    saveFavoriteFood,
    saveProfile: saveHealthProfile,
    addMealEntry: addHealthMealEntry,
    addWeightEntry: addHealthWeightEntry,
    storageMode: healthStorageMode,
    weightEntries: healthWeightEntries,
  } = useHealth(supabase, session?.user?.id ?? null, setMessage, appendEconomyEvent, setEconomy);
  const currentUserId = session?.user?.id ?? null;
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
  } = useTaskUiState({
    isTaskEditorOpen,
    normalizeTaskGridLayout: normalizePersistedTaskGridLayout,
    taskGridStarterLayout: TASK_GRID_STARTER_LAYOUT,
    taskEditorMode,
    taskEditorTaskId,
    userId: session?.user?.id,
  });
  const {
    reorderListColumns,
    setSelectedBucket,
    toggleListColumn,
  } = useTaskListViewStateController({ setTaskUiState });
  const [taskLists, setTaskLists] = useState<TaskListDefinition[]>([]);
  const [taskListManualMemberships, setTaskListManualMemberships] = useState<TaskListManualMembership[]>([]);
  const [taskHistory, setTaskHistory] = useState<DbTaskHistory[]>([]);
  const [taskActualTimeEntries, setTaskActualTimeEntries] = useState<TaskActualTimeEntry[]>([]);
  const [taskSubtasks, setTaskSubtasks] = useState<DbTaskSubtask[]>([]);
  const [availableTaskNotes, setAvailableTaskNotes] = useState<TaskEditorLinkedNote[]>([]);
  const [supportsNestedSubtasks, setSupportsNestedSubtasks] = useState(true);
  const [isGridEditMode, setIsGridEditMode] = useState(false);
  const [selectedGridWidgetId, setSelectedGridWidgetId] = useState<string | null>(null);
  const [draggedGridWidgetId, setDraggedGridWidgetId] = useState<string | null>(null);
  const [showFocusPlanner, setShowFocusPlanner] = useState(false);
  const [focusPlannerStep, setFocusPlannerStep] = useState<FocusPlannerStep>(0);
  const [focusDraftIds, setFocusDraftIds] = useState<string[]>([]);
  const [momentumView, setMomentumView] = useState<MomentumView>("urgent");
  const [isMomentumListOpen, setIsMomentumListOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [hudHeight, setHudHeight] = useState(140);
  const profile = useProfileStore();
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isListColumnMenuOpen, setIsListColumnMenuOpen] = useState(false);
  const [isKeyboardShortcutsMenuOpen, setIsKeyboardShortcutsMenuOpen] = useState(false);
  const [isTaskListSettingsOpen, setIsTaskListSettingsOpen] = useState(false);
  const [isImportWidgetMenuOpen, setIsImportWidgetMenuOpen] = useState(false);
  const [draggedListColumnId, setDraggedListColumnId] = useState<AgentPlanColumnId | null>(null);
  const [isBatchEditModalOpen, setIsBatchEditModalOpen] = useState(false);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);
  const [taskHistoryModalTaskId, setTaskHistoryModalTaskId] = useState<string | null>(null);
  const [taskActualTimeEntryTaskId, setTaskActualTimeEntryTaskId] = useState<string | null>(null);
  const [taskActualTimeEntryPrefill, setTaskActualTimeEntryPrefill] = useState<{ durationSeconds: number; title: string } | null>(null);
  const [requestedListOverlayTaskId, setRequestedListOverlayTaskId] = useState<string | null>(null);
  const [suppressDetachedListNoticeTaskId, setSuppressDetachedListNoticeTaskId] = useState<string | null>(null);
  const [activeTaskTimerIndex, setActiveTaskTimerIndex] = useState(0);
  const [logicalDayNow, setLogicalDayNow] = useState(() => Date.now());
  const [notePageOpenNoteId, setNotePageOpenNoteId] = useState<string | null>(null);
  const {
    runningTaskTimers,
    startTaskTimer: persistTaskTimer,
    pauseTaskTimer: persistPausedTaskTimer,
    resumeTaskTimer: persistResumedTaskTimer,
    stopTaskTimer: persistStoppedTaskTimer,
  } = useTaskTimers(supabase, session?.user?.id ?? null, setMessage);
  const gridColumns = useResponsiveTaskGridColumns({
    maxColumns: TASK_GRID_MAX_COLUMNS,
    phoneColumns: TASK_GRID_PHONE_COLUMNS,
    tabletColumns: TASK_GRID_TABLET_COLUMNS,
  });
  const [dayStartTime, setDayStartTime] = useState<string>("06:00");
  const [userTimeZone, setUserTimeZone] = useState<string>(getBrowserTimeZone());
  const [focusAlarmAudioBlocked, setFocusAlarmAudioBlocked] = useState(false);
  const lastResetDateRef = useRef<string>("");
  const focusAlarmAudioRef = useRef<HTMLAudioElement | null>(null);
  const focusAlarmHydratedUserIdRef = useRef<string | null>(null);
  const focusAlarmPreviousSettingsRef = useRef<{ enabled: boolean; intervalMinutes: number } | null>(null);
  const focusAlarmSkipNextPersistRef = useRef(false);
  const pendingTaskMutationExpirationsRef = useRef<Map<string, number>>(new Map());

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
    const expiresAt = Date.now() + 10_000;
    for (const taskId of taskIds) {
      pendingTaskMutationExpirationsRef.current.set(taskId, expiresAt);
    }
  }, []);

  const clearPendingTaskMutations = useCallback((taskIds: string[]) => {
    for (const taskId of taskIds) {
      pendingTaskMutationExpirationsRef.current.delete(taskId);
    }
  }, []);

  const shouldSkipTaskReload = useCallback((change: { eventType: string; taskId: string | null }) => {
    const taskId = change.taskId;
    if (!taskId) {
      return false;
    }

    const expiresAt = pendingTaskMutationExpirationsRef.current.get(taskId);
    if (!expiresAt) {
      return false;
    }

    if (expiresAt < Date.now()) {
      pendingTaskMutationExpirationsRef.current.delete(taskId);
      return false;
    }

    pendingTaskMutationExpirationsRef.current.delete(taskId);
    return true;
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
    setIsHudAppearanceReady(false);
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

  const { isWorkspaceLoading } = useWorkspaceData({
    activePage,
    currentUser: session?.user,
    isMissingTaskListManualMembershipsTableError,
    isMissingTaskListsTableError,
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
    onProfileLoaded: (profileRow, user) => {
      const persistedFocusAlarmState = readPersistedFocusAlarmState(user.id);
      const nextFocusAlarmEnabled = persistedFocusAlarmState?.enabled
        ?? (profileRow?.focus_alarm_enabled ?? false);
      const nextFocusAlarmIntervalMinutes = clampFocusAlarmInterval(
        persistedFocusAlarmState?.intervalMinutes
          ?? profileRow?.focus_alarm_interval_minutes
          ?? DEFAULT_FOCUS_ALARM_INTERVAL_MINUTES,
      );

      saveProfile(buildProfileSnapshot(profileRow, user));
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
    taskGridStarterLayout: TASK_GRID_STARTER_LAYOUT,
  });

  useEffect(() => {
    if (!supabase) {
      return;
    }

    function handleSessionLockRejection(event: PromiseRejectionEvent) {
      if (!isSupabaseSessionLockError(event.reason)) {
        return;
      }

      event.preventDefault();
    }

    window.addEventListener("unhandledrejection", handleSessionLockRejection);

    const unsubscribe = subscribeToBrowserAuth((event: AuthChangeEvent, nextSession) => {
      if (event === "SIGNED_OUT") {
        setSession(null);
        setIsAuthResolved(true);
        setTasks([]);
        setFocusCategories([]);
        setActiveSessions({});
        setFocusHistory([]);
        setTaskHistory([]);
        setTaskSubtasks([]);
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
  }, [supabase]);

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
    if (typeof window !== "undefined") {
      lastResetDateRef.current = "";
    }
    saveLogicalDaySettings({ dayStartTime, timezone: userTimeZone });
  }, [dayStartTime, userTimeZone]);

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

  useEffect(() => {
    if (!supabase || !session?.user) return;
    const userId = session.user.id;

    async function refetchActiveSessions() {
      const { data, error } = await supabase!
        .from("adhdice_focus_active_sessions")
        .select("*")
        .eq("user_id", userId);
      if (!error && data) {
        setActiveSessions(mapActiveSessions(data));
      }
    }

    const channel = typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel("adhdice_focus_sync")
      : null;

    if (channel) {
      channel.onmessage = () => { void refetchActiveSessions(); };
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refetchActiveSessions();
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void refetchActiveSessions();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      channel?.close();
    };
  }, [session?.user?.id, supabase]);

  const todayKey = useMemo(
    () => getLogicalDayKey(new Date(logicalDayNow), { dayStartTime, timezone: userTimeZone }),
    [dayStartTime, logicalDayNow, userTimeZone],
  );

  useEffect(() => {
    const client = supabase;
    if (!client || !session?.user) return;
    const userId = session.user.id;

    async function runDayReset() {
      if (lastResetDateRef.current === todayKey) return;

      const { error } = await ((client as unknown) as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      }).rpc("adhdice_reconcile_task_rollover", {
        p_now: new Date().toISOString(),
        p_user_id: userId,
      });

      if (error) {
        setMessage((previous) => previous ?? { tone: "warn", text: error.message });
        return;
      }

      lastResetDateRef.current = todayKey;
    }

    void runDayReset();
    const interval = setInterval(() => { void runDayReset(); }, 60_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void runDayReset();
      }
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void runDayReset();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [session?.user?.id, supabase, todayKey]);
  const taskSubtasksByTaskId = useMemo(() => groupTaskSubtasksByTaskId(taskSubtasks), [taskSubtasks]);
  const hasStepsByTaskId = useMemo(
    () => tasks.reduce<Record<string, boolean>>((accumulator, task) => {
      accumulator[task.id] = (taskSubtasksByTaskId[task.id]?.length ?? 0) > 0;
      return accumulator;
    }, {}),
    [taskSubtasksByTaskId, tasks],
  );
  const taskHistoryStats = useMemo(() => computeTaskHistoryStats(taskHistory, todayKey), [taskHistory, todayKey]);
  const {
    activeCelebration: activeAchievementCelebration,
    chargedSetCodes,
    completionPercent: achievementCompletionPercent,
    dismissCelebration: dismissAchievementCelebration,
    latestUnlock: latestAchievementUnlock,
    nextSet: nextAchievementSet,
    setSummaries: achievementSetSummaries,
    storageMode: achievementStorageMode,
    totalFaces: totalAchievementFaces,
    unlockedFaceCount: unlockedAchievementFaces,
  } = useAchievements({
    appendEconomyEvent,
    client: supabase,
    currentUserId,
    focusHistory,
    healthAwards,
    setMessage,
    taskHistory,
    taskHistoryStats,
    tasks,
  });
  const { saveFocusSelection } = useFocusSelectionPersistence({
    currentUserId,
    defaultValidTaskIds: tasks,
    setFocusedTaskIdsByDate,
    setMessage,
    supabase,
    todayKey,
  });
  const focusedTaskIds = focusedTaskIdsByDate[todayKey] ?? EMPTY_TASK_IDS;
  const focusedTaskIdSet = useMemo(() => new Set(focusedTaskIds), [focusedTaskIds]);
  const builtInTaskLists = useMemo(() => getBuiltInTaskLists(), []);
  const availableTaskLists = useMemo(() => {
    const byId = new Map<TaskListId, TaskListDefinition>();
    for (const list of builtInTaskLists) {
      byId.set(list.id, list);
    }
    for (const list of taskLists) {
      byId.set(list.id, list);
    }
    return Array.from(byId.values()).sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  }, [builtInTaskLists, taskLists]);
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
  const taskHistoryByTaskId = useMemo(
    () => taskHistory.reduce<Record<string, typeof taskHistory>>((accumulator, entry) => {
      if (!accumulator[entry.task_id]) {
        accumulator[entry.task_id] = [];
      }
      accumulator[entry.task_id].push(entry);
      return accumulator;
    }, {}),
    [taskHistory],
  );
  const taskHistoryFactsByTaskId = useMemo(
    () => Object.fromEntries(
      tasks.map((task) => [
        task.id,
        buildTaskHistoryFacts(taskHistoryByTaskId[task.id] ?? [], todayKey),
      ]),
    ),
    [taskHistoryByTaskId, tasks, todayKey],
  );
  const currentStreakByTaskId = useMemo(
    () => Object.fromEntries(
      tasks.map((task) => [
        task.id,
        computeTaskSpecificHistoryStats(
          task,
          taskHistoryByTaskId[task.id] ?? [],
          todayKey,
        ).currentStreak,
      ]),
    ),
    [taskHistoryByTaskId, tasks, todayKey],
  );
  const client = supabase as NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
  const currentUserIdText = session?.user?.id ?? "";
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
    currentStreakByTaskId,
    focusedTaskIds: focusedTaskIdSet,
    hasStepsByTaskId,
    isDueToday,
    isDueTomorrow: (date) => date === shiftDateKey(todayKey, 1),
    isLater,
    isOpen: isTaskOpen,
    isOverdue,
    historyFactsByTaskId: taskHistoryFactsByTaskId,
    manualMembershipsByTaskId,
  }), [currentStreakByTaskId, focusedTaskIdSet, hasStepsByTaskId, manualMembershipsByTaskId, taskHistoryFactsByTaskId, todayKey]);
  const parsedTaskSearch = useMemo(
    () => parseTaskSearchInput(taskUiState.search, taskUiState.duplicateTitleMode),
    [taskUiState.duplicateTitleMode, taskUiState.search],
  );
  const deferredSearchQuery = useDeferredValue(parsedTaskSearch.cleanedQuery);
  const duplicateTitleModeActive = parsedTaskSearch.duplicateTitleMode;
  const taskUiStateForDerivedData = useMemo(() => ({
    duplicateTitleMode: duplicateTitleModeActive,
    energyFilters: taskUiState.energyFilters,
    matchAny: taskUiState.matchAny,
    quickFilters: taskUiState.quickFilters,
    statusFilters: taskUiState.statusFilters,
  }), [
    duplicateTitleModeActive,
    taskUiState.energyFilters,
    taskUiState.matchAny,
    taskUiState.quickFilters,
    taskUiState.statusFilters,
  ]);
  const bucketContext = useMemo(() => ({
    focusedTaskIds: focusedTaskIdSet,
    routing: taskRouting,
  }), [focusedTaskIdSet, taskRouting]);
  const derivedData = useMemo(
    () => {
      const startedAt = performance.now();
      const result = computeTaskAppDerivedData({
      activePage,
      availableTaskLists,
      availableTaskNotes,
      bucketContext,
      deferredSearchQuery,
      focusedTaskIds,
      listColumnPickerOrder: LIST_COLUMN_PICKER_ORDER,
      listVisibleColumns: taskUiState.visibleColumnsByView.list,
      taskActualTimeEntryTaskId,
      taskEditorTaskId,
      taskGridLayout,
      taskGridWidgetTypes: Object.keys(TASK_GRID_WIDGET_LABELS) as TaskGridWidgetType[],
      taskListEvaluationContext,
      taskSubtasksByTaskId,
      taskUiState: taskUiStateForDerivedData,
      tasks,
      });
      if (process.env.NODE_ENV !== "production") {
        console.info(`[tasks] Derived data ready in ${Math.round(performance.now() - startedAt)}ms for ${tasks.length} tasks.`);
      }
      return result;
    },
    [
      activePage,
      availableTaskLists,
      availableTaskNotes,
      bucketContext,
      deferredSearchQuery,
      focusedTaskIds,
      taskActualTimeEntryTaskId,
      taskEditorTaskId,
      taskGridLayout,
      taskListEvaluationContext,
      taskSubtasksByTaskId,
      taskUiStateForDerivedData,
      tasks,
    ],
  );
  const {
    activeTasks,
    allTaskTags,
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
    trashFilteredTasksSorted,
    listColumnPickerColumns,
    listRailOptions,
    lowEnergyTasks,
    manualListOptions,
    momentumPercent,
    overdueTasks,
    planningCandidates,
    selectedTaskForEditor,
    taskForActualTimeEntry,
    taskLinkedNotesByTaskId,
    taskListMembershipsByTaskId,
    taskStatusCounts,
    todayTasks,
    urgentTasks,
    visibleListCounts,
  } = derivedData;
  const taskFocusLabelOptions = useMemo(
    () => buildFocusLabelOptions(focusCategories, focusHistory),
    [focusCategories, focusHistory],
  );
  const taskActualTimeEntriesByTaskId = useMemo(
    () => taskActualTimeEntries.reduce<Record<string, TaskActualTimeEntry[]>>((accumulator, entry) => {
      if (!accumulator[entry.task_id]) {
        accumulator[entry.task_id] = [];
      }
      accumulator[entry.task_id].push(entry);
      return accumulator;
    }, {}),
    [taskActualTimeEntries],
  );
  const hasFocusedToday = focusedTaskIds.length > 0;
  const momentumMetric = getMomentumMetric({
    doneTasks,
    focusedTaskIds,
    tasks,
    todayTasks,
    urgentTasks,
  }, momentumView);
  const selectedBucketTasks = useMemo(() => {
    const startedAt = process.env.NODE_ENV !== "production" ? performance.now() : 0;
    let nextTasks: typeof filteredTasksSorted;
    if (activePage !== "Tasks") {
      nextTasks = [];
    } else if (taskUiState.selectedBucket === "trash") {
      nextTasks = trashFilteredTasksSorted;
    } else if (taskUiState.selectedBucket === "all") {
      nextTasks = filteredTasksSorted;
    } else {
      nextTasks = filteredTasksSorted.filter((task) =>
        (taskListMembershipsByTaskId[task.id] ?? []).some((membership) => membership.id === taskUiState.selectedBucket),
      );
    }

    if (process.env.NODE_ENV !== "production") {
      logTaskListSwitchTiming(
        `[tasks:list-switch] selectedBucketTasks filtered in ${Math.round(performance.now() - startedAt)}ms for ${nextTasks.length} tasks`,
      );
    }

    return nextTasks;
  }, [activePage, filteredTasksSorted, taskListMembershipsByTaskId, taskUiState.selectedBucket, trashFilteredTasksSorted]);
  const selectedGridWidget = taskGridLayout.find((item) => item.id === selectedGridWidgetId) ?? null;
  const listVisibleColumns = taskUiState.visibleColumnsByView.list;
  const listSelectionResetKey = JSON.stringify({
    duplicateTitleMode: duplicateTitleModeActive,
    energyFilters: taskUiState.energyFilters,
    matchAny: taskUiState.matchAny,
    quickFilters: taskUiState.quickFilters,
    search: deferredSearchQuery,
    selectedBucket: taskUiState.selectedBucket,
    statusFilters: taskUiState.statusFilters,
    view: taskUiState.view,
  });
  const visibleListTaskIds = useMemo(
    () => selectedBucketTasks.map((task) => task.id),
    [selectedBucketTasks],
  );
  const selectedBucketLabel = useMemo(() => {
    if (taskUiState.selectedBucket in TASK_BUCKET_LABELS) {
      return TASK_BUCKET_LABELS[taskUiState.selectedBucket as TaskBucket];
    }
    return availableTaskLists.find((list) => list.id === taskUiState.selectedBucket)?.name ?? taskUiState.selectedBucket;
  }, [availableTaskLists, taskUiState.selectedBucket]);
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
    activePendingReward,
    claimPendingReward,
    queueTaskRewards,
  } = useTaskRewardController({
    calcNextDueDateFromDate,
    client,
    commitTaskReward,
    currentDayKey: todayKey,
    currentUserId: session?.user?.id ?? null,
    dayStartTime,
    logicalDayNow,
    setMessage,
    setTaskSubtasks,
    setTasks,
    sortTasksForUi,
    timezone: userTimeZone,
  });
  const hudNotificationBaseItems = useMemo<HudNotificationItem[]>(() => {
    const currentItems: HudNotificationItem[] = [];
    if (activePendingReward) {
      currentItems.push({
        detail: "A completed task or subtask has points waiting to claim.",
        id: "pending-reward",
        title: "Reward waiting",
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
  }, [activePendingReward, filteredTodayTasks.length, missedTasks.length]);
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
    routeTask,
    saveTaskEditor,
    saveTaskListDefinition,
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
      markPendingTaskMutations,
      setMessage,
      setTaskRouting,
      setTasks,
      shouldRouteTaskToInbox,
      sortTasksForUi,
    },
    create: {
      client,
      currentUserId: currentUserIdText,
      setMessage,
      setTasks,
      shouldRouteTaskToInbox,
      sortTasksForUi,
    },
    batchEdit: {
      clearListTaskSelection,
      focusedTaskIds,
      onTasksCompleted: queueTaskRewards,
      parseDayOfMonth,
      parsePositiveInteger,
      selectedListTasks,
      setIsBatchEditModalOpen,
      setMessage,
      setTasks,
      sortTasksForUi,
      tasks,
      updateTaskRowWithLegacyEnergyFallback: (taskId, values, options) => updateTaskRowWithLegacyEnergyFallback(
        client,
        taskId,
        values,
        isMissingTaskActualSecondsColumnError,
        isMissingTaskEnergyNoneEnumError,
        options,
      ),
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
      taskLists,
    },
    editorSave: {
      currentUserId: currentUserIdText,
      focusedTaskIds,
      insertTaskRowWithLegacyEnergyFallback: (payload) => insertTaskRowWithLegacyEnergyFallback(
        client,
        payload,
        isMissingTaskEnergyNoneEnumError,
      ),
      onTasksCompleted: queueTaskRewards,
      saveFocusSelection,
      setMessage,
      setTasks,
      sortTasksForUi,
      tasks,
      updateTaskRowWithLegacyEnergyFallback: (taskId, values, options) => updateTaskRowWithLegacyEnergyFallback(
        client,
        taskId,
        values,
        isMissingTaskActualSecondsColumnError,
        isMissingTaskEnergyNoneEnumError,
        options,
      ),
    },
    history: {
      client,
      currentUserId: currentUserIdText,
      currentDayKey: todayKey,
      dayStartTime,
      isTaskCompletedForHistory,
      isTaskHistoryStatus,
      mapTaskHistoryRow,
      now: new Date(logicalDayNow),
      setMessage,
      setTaskHistory,
      setTasks,
      sortTasksForUi,
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
      client,
      currentUserId: currentUserIdText,
      isMissingParentSubtaskColumnError,
      mapTaskSubtaskRow,
      onSubtaskCompletedReward: queueTaskRewards,
      setMessage,
      setSupportsNestedSubtasks,
      setTaskSubtasks,
      supportsNestedSubtasks,
      tasks,
      taskSubtasks,
    },
    update: {
      clearPendingTaskMutations,
      markPendingTaskMutations,
      onTasksCompleted: queueTaskRewards,
      setMessage,
      setTasks,
      sortTasksForUi,
      tasks,
      updateTaskRowWithLegacyEnergyFallback: (taskId, values, options) => updateTaskRowWithLegacyEnergyFallback(
        client,
        taskId,
        values,
        isMissingTaskActualSecondsColumnError,
        isMissingTaskEnergyNoneEnumError,
        options,
      ),
    },
  });
  const {
    closeTaskEditor,
    deleteSelectedListTasks,
    openEditTaskEditor,
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
    todayIso: todayISO,
    updateTask: async (taskId, updates) => {
      await updateTask(taskId, updates);
    },
  });

  const openBlankTaskEditor = useCallback(() => {
    setSuppressDetachedListNoticeTaskId(null);
    setTaskEditorInitialDraft(null);
    openNewTaskEditor();
  }, [openNewTaskEditor]);

  const openInlineNewListTaskComposer = useCallback(async () => {
    const createdTask = await addTask({
      actual_seconds: 0,
      completed_at: null,
      due_on: null,
      due_time: null,
      energy: "none",
      estimated_minutes: null,
      external_link_label: null,
      external_link_url: null,
      is_important: false,
      is_urgent: false,
      notes: null,
      one_step_at_a_time: false,
      priority: "normal",
      repeat_day_of_month: null,
      repeat_days_of_week: [],
      repeat_frequency: "none",
      repeat_interval: 1,
      status: "pending",
      subtasks_auto_reset: false,
      tags: [],
      title: "New Task",
    });

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

    setSuppressDetachedListNoticeTaskId(createdTask.id);
    setRequestedListOverlayTaskId(createdTask.id);
  }, [addTask, routeTask, taskUiState.selectedBucket]);

  const openExistingTaskEditor = useCallback((task: Task) => {
    setSuppressDetachedListNoticeTaskId(null);
    setTaskEditorInitialDraft(null);
    openEditTaskEditor(task);
  }, [openEditTaskEditor]);

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
      is_important: task.is_important,
      is_urgent: task.is_urgent,
      notes: task.notes,
      one_step_at_a_time: task.one_step_at_a_time,
      priority: task.priority,
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
      isImportant: false,
      isUrgent: false,
      notes: template.notes,
      repeatDayOfMonth: template.repeatDayOfMonth ? String(template.repeatDayOfMonth) : "",
      repeatDaysOfWeek: template.repeatDaysOfWeek,
      repeatFrequency: template.repeatFrequency,
      repeatInterval: String(template.repeatInterval),
      tags: template.tags,
      title: template.title,
    });
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const headerNode = hudShellRef.current;
    if (!headerNode) {
      return;
    }

    const updateHudHeight = () => {
      setHudHeight(Math.ceil(headerNode.getBoundingClientRect().height));
    };

    updateHudHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateHudHeight);
      return () => window.removeEventListener("resize", updateHudHeight);
    }

    const observer = new ResizeObserver(() => {
      updateHudHeight();
    });
    observer.observe(headerNode);
    window.addEventListener("resize", updateHudHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHudHeight);
    };
  }, [hudUiState.activeHudPageId, hudUiState.isHudCollapsed, lowStim, mobileZoom, theme]);

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

  if (!supabase) {
    return <ConfigSplash />;
  }

  if (!isAuthResolved) {
    return <LoadingSplash status="Restoring your workspace..." />;
  }

  if (!session?.user) {
    return (
      <AuthSplash
        message={message}
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

  const currentUser = session.user;
  const shouldDeferPageRender = isRestoringPersistedUiState;
  const shouldShowHudLoadingShell = !isHudAppearanceReady || isWorkspaceLoading || shouldDeferPageRender;

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

    saveProfile(nextProfile);
    setIsAccountOpen(false);
    setMessage({ tone: "good", text: "Account profile saved." });
  }

  function startHudTaskTimer(timer: RunningTaskTimer) {
    const existingIndex = runningTaskTimers.findIndex((entry) => entry.taskId === timer.taskId);
    if (existingIndex >= 0) {
      setActiveTaskTimerIndex(existingIndex);
      return;
    }
    setActiveTaskTimerIndex(runningTaskTimers.length);
    void persistTaskTimer({
      ...timer,
      pausedAt: null,
      startedActualSeconds: timer.startedActualSeconds ?? timer.baseSeconds,
    });
  }

  function pauseHudTaskTimer(taskId: string) {
    void persistPausedTaskTimer(taskId);
  }

  function resumeHudTaskTimer(taskId: string) {
    void persistResumedTaskTimer(taskId);
  }

  function stopHudTaskTimer(taskId: string) {
    void (async () => {
      const stoppedTimer = await persistStoppedTaskTimer(taskId);
      if (!stoppedTimer) {
        return;
      }
      setTaskActualTimeEntryTaskId(taskId);
      setTaskActualTimeEntryPrefill({
        durationSeconds: Math.max(0, stoppedTimer.elapsedSeconds),
        title: stoppedTimer.title,
      });
    })();
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
      onSetStatus={(task, status) => { void updateTask(task.id, { status }); }}
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
      onSetStatus={(task, status) => { void updateTask(task.id, { status }); }}
      subtasksByTaskId={taskSubtasksByTaskId}
      tasks={selectedBucketTasks.filter(isTaskOpen)}
    />
  );
  const cardsContentNode = (
    <TaskCardGallery
      focusedTaskIds={focusedTaskIds}
      onEditTask={openExistingTaskEditor}
      onSetStatus={(task, status) => { void updateTask(task.id, { status }); }}
      subtasksByTaskId={taskSubtasksByTaskId}
      tasks={selectedBucketTasks}
    />
  );
  const requestedOpenListTask = requestedListOverlayTaskId
    ? tasks.find((task) => task.id === requestedListOverlayTaskId) ?? null
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
      todayCount={(visibleListCounts.today ?? 0) + (visibleListCounts.focus ?? 0) + (visibleListCounts.urgent ?? 0)}
      waitingCount={waitingTasks.length}
    />
  );

  const nonListFilterRowsNode = (
    <FilterRows
      duplicateTitleMode={duplicateTitleModeActive}
      hasActiveFilters={hasActiveTaskFilters(effectiveTaskUiState)}
      isOpen={isTaskFiltersOpen}
      matchAny={taskUiState.matchAny}
      onReset={() => setTaskUiState((prev) => resetTaskFiltersPreservingView(prev))}
      onToggleDuplicateTitleMode={toggleDuplicateTitleMode}
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
      statusCounts={taskStatusCounts}
      selectedStatuses={taskUiState.statusFilters}
      selectedEnergies={taskUiState.energyFilters}
    />
  );

  async function logActualTimeForTask(
    task: Task,
    entry: { date: string; durationSeconds: number; notes: string; title: string },
  ) {
    if (!currentUser || !supabase) {
      return false;
    }

    const success = await handleManualFocusEntry({
      categoryId: null,
      date: entry.date,
      durationSeconds: entry.durationSeconds,
      focusType: "Work",
      notes: entry.notes,
      title: entry.title,
    });

    if (!success) {
      return false;
    }

    const { data: insertedEntry, error: actualTimeEntryError } = await supabase
      .from("adhdice_task_actual_time_entries")
      .insert({
        task_id: task.id,
        user_id: currentUser.id,
        entry_date: entry.date,
        title_snapshot: entry.title,
        duration_seconds: entry.durationSeconds,
        notes: entry.notes || null,
      })
      .select("*")
      .single();

    if (actualTimeEntryError) {
      setMessage({ tone: "warn", text: actualTimeEntryError.message });
      return false;
    }

    if (insertedEntry) {
      setTaskActualTimeEntries((current) => [insertedEntry, ...current]);
    }

    const nextActualSeconds = (task.actual_seconds ?? 0) + entry.durationSeconds;
    setTasks((current) => sortTasksForUi(current.map((currentTask) => (
      currentTask.id === task.id
        ? { ...currentTask, actual_seconds: nextActualSeconds }
        : currentTask
    ))));
    await updateTask(task.id, {
      actual_seconds: nextActualSeconds,
    });

    return true;
  }

  async function handleActualTimeEntrySave(entry: { date: string; durationSeconds: number; notes: string; title: string }) {
    if (!taskForActualTimeEntry) {
      return false;
    }

    const success = await logActualTimeForTask(taskForActualTimeEntry, entry);
    if (success) {
      setTaskActualTimeEntryTaskId(null);
    }
    return success;
  }

  async function clearActualTimeForTask(task: Task) {
    setTasks((current) => sortTasksForUi(current.map((currentTask) => (
      currentTask.id === task.id
        ? { ...currentTask, actual_seconds: 0 }
        : currentTask
    ))));
    await updateTask(task.id, {
      actual_seconds: 0,
    });
    setMessage({ tone: "good", text: "Task actual time cleared." });
    return true;
  }

  async function handleActualTimeEntryClear() {
    if (!taskForActualTimeEntry) {
      return false;
    }

    const success = await clearActualTimeForTask(taskForActualTimeEntry);
    if (success) {
      closeActualTimeEntry();
    }
    return success;
  }

  async function deleteTaskActualTimeEntry(entryId: string) {
    if (!supabase || !currentUser) {
      return false;
    }

    const entry = taskActualTimeEntries.find((currentEntry) => currentEntry.id === entryId);
    if (!entry) {
      return false;
    }

    const task = tasks.find((currentTask) => currentTask.id === entry.task_id);
    if (!task) {
      return false;
    }

    const { error } = await supabase
      .from("adhdice_task_actual_time_entries")
      .delete()
      .eq("id", entryId)
      .eq("user_id", currentUser.id);

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    setTaskActualTimeEntries((current) => current.filter((currentEntry) => currentEntry.id !== entryId));
    const nextActualSeconds = Math.max(0, (task.actual_seconds ?? 0) - entry.duration_seconds);
    setTasks((current) => sortTasksForUi(current.map((currentTask) => (
      currentTask.id === task.id
        ? { ...currentTask, actual_seconds: nextActualSeconds }
        : currentTask
    ))));
    await updateTask(task.id, { actual_seconds: nextActualSeconds });
    setMessage({ tone: "good", text: "Saved actual-time entry deleted." });
    return true;
  }

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

  async function handleTaskEditorActualTimeLog(entry: { date: string; durationSeconds: number; notes: string; title: string }) {
    if (!selectedTaskForEditor) {
      return false;
    }

    return await logActualTimeForTask(selectedTaskForEditor, entry);
  }

  async function handleTaskEditorSave(draft: {
    focusToday: boolean;
    linkedNoteIds: string[];
    subtasks: TaskSubtaskDraft[];
    values: Parameters<typeof saveTaskEditor>[0];
  }) {
    const savedTask = await saveTaskEditor(draft.values, {
      focusToday: draft.focusToday,
      linkedNoteIds: draft.linkedNoteIds,
      subtasks: draft.subtasks,
      taskId: selectedTaskForEditor?.id ?? null,
    });

    if (savedTask) {
      closeTaskEditorWithReset();
    }
  }

  function openSelectedTaskHistory() {
    if (selectedTaskForEditor) {
      setTaskHistoryModalTaskId(selectedTaskForEditor.id);
    }
  }

  function openTaskHistoryForTask(taskId: string) {
    setTaskHistoryModalTaskId(taskId);
  }

  function closeActualTimeEntry() {
    setTaskActualTimeEntryTaskId(null);
    setTaskActualTimeEntryPrefill(null);
  }

  function openBatchDeleteModal() {
    setIsBatchDeleteModalOpen(true);
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

  function optimisticallyMoveTaskToTrash(taskId: string) {
    const nextUpdatedAt = new Date().toISOString();
    setTasks((current) => sortTasksForUi(current.map((task) => (
      task.id === taskId
        ? { ...task, completed_at: null, status: "archived", updated_at: nextUpdatedAt }
        : task
    ))));
    setTaskRouting((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }

  function optimisticallyRestoreTaskToInbox(taskId: string) {
    const nextUpdatedAt = new Date().toISOString();
    setTasks((current) => sortTasksForUi(current.map((task) => (
      task.id === taskId
        ? { ...task, completed_at: null, status: "pending", updated_at: nextUpdatedAt }
        : task
    ))));
    setTaskRouting((current) => ({
      ...current,
      [taskId]: "inbox",
    }));
  }

  function optimisticallyRemoveTask(taskId: string) {
    setTasks((current) => current.filter((task) => task.id !== taskId));
    setTaskRouting((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }

  async function openSingleTaskDeleteModal(taskId: string) {
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return;
    }
    const previousRoutingBucket = taskRouting[taskId];

    if (task.status === "archived") {
      optimisticallyRemoveTask(taskId);
      const didDelete = await deleteTasks([taskId]);
      if (!didDelete) {
        restoreTaskSnapshot(task, previousRoutingBucket);
      }
      if (selectedListTaskIds.includes(taskId)) {
        clearListTaskSelection();
      }
      return;
    }

    optimisticallyMoveTaskToTrash(taskId);

    const didArchive = await updateTask(taskId, {
      completed_at: null,
      status: "archived",
    });
    if (!didArchive) {
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
    optimisticallyRestoreTaskToInbox(taskId);
    routeTask(taskId, "inbox");
    const didRestore = await updateTask(taskId, {
      completed_at: null,
      status: "pending",
    });
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

  const actualTimeEntryFlow = taskForActualTimeEntry ? {
    categories: focusCategories,
    initialDurationSeconds: taskActualTimeEntryPrefill?.durationSeconds,
    initialTitle: taskActualTimeEntryPrefill?.title || taskForActualTimeEntry.title,
    onClear: handleActualTimeEntryClear,
    labelOptions: taskFocusLabelOptions,
    onClose: closeActualTimeEntry,
    onSave: handleActualTimeEntrySave,
  } : null;

  const batchDeleteFlow = isBatchDeleteModalOpen ? {
    count: selectedListTaskIds.length,
    onClose: closeBatchDeleteModal,
    onConfirm: confirmBatchDelete,
    previewTitles: selectedListTasks.map((task) => task.title),
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
    focusCategories,
    focusedToday: focusedTaskIds,
    focusLabelOptions: taskFocusLabelOptions,
    mode: taskEditorMode,
    initialDraftOverride: taskEditorInitialDraft,
    onClose: closeTaskEditorWithReset,
    onLogActualTime: handleTaskEditorActualTimeLog,
    onOpenHistory: selectedTaskForEditor ? openSelectedTaskHistory : undefined,
    onSave: handleTaskEditorSave,
    subtasks: selectedTaskForEditor ? taskSubtasksByTaskId[selectedTaskForEditor.id] ?? [] : [],
    task: selectedTaskForEditor,
  } : null;

  const taskHistoryModalTask = taskHistoryModalTaskId
    ? tasks.find((task) => task.id === taskHistoryModalTaskId) ?? null
    : null;
  const taskHistoryFlow = taskHistoryModalTaskId && taskHistoryModalTask ? {
    onClose: closeTaskHistoryModal,
    onSetStatus: async (entryDate: string, status: "clear" | "did_my_best" | "done" | "missed") => {
      if (!taskHistoryModalTaskId) {
        return;
      }
      await syncTaskHistoryEntry(
        taskHistoryModalTaskId,
        status === "clear" ? "pending" : status,
        entryDate,
        { syncLiveTask: true },
      );
    },
    task: taskHistoryModalTask,
    taskHistory: taskHistory.filter((entry) => entry.task_id === taskHistoryModalTaskId),
    taskTitle: taskHistoryModalTask.title,
    todayDateKey: todayKey,
  } : null;
  const taskFilterRowsNode = (
    <FilterRows
      compact
      duplicateTitleMode={duplicateTitleModeActive}
      hasActiveFilters={hasActiveTaskFilters(effectiveTaskUiState)}
      isOpen={isTaskFiltersOpen}
      matchAny={taskUiState.matchAny}
      onReset={() => setTaskUiState((prev) => resetTaskFiltersPreservingView(prev))}
      onToggleDuplicateTitleMode={toggleDuplicateTitleMode}
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
      statusCounts={taskStatusCounts}
      selectedStatuses={taskUiState.statusFilters}
      selectedEnergies={taskUiState.energyFilters}
    />
  );
  const listPanelProps = {
    draggedListColumnId,
    isKeyboardShortcutsMenuOpen,
    isListColumnMenuOpen,
    keyboardShortcutsMenuRef,
    listColumnLabels: LIST_COLUMN_LABELS,
    listColumnMenuRef,
    listColumnPickerColumns: listColumnPickerColumns as AgentPlanColumnId[],
    lists: listRailOptions,
    listVisibleColumns,
    onOpenComposer: openInlineNewListTaskComposer,
    onOpenImport: () => { void openTaskImportPanel(); },
    onOpenListSettings: () => setIsTaskListSettingsOpen(true),
    onSelectBucket: setSelectedBucket,
    onReorderListColumns: reorderListColumns,
    onSetDraggedListColumnId: setDraggedListColumnId,
    onSetView: (view: TaskUiState["view"]) => setTaskUiState((prev) => ({ ...prev, view })),
    onToggleKeyboardShortcutsMenu: () => setIsKeyboardShortcutsMenuOpen((current) => !current),
    onToggleListColumn: toggleListColumn,
    onToggleListColumnMenu: () => setIsListColumnMenuOpen((current) => !current),
    onOpenTrash: () => setTaskUiState((prev) => ({ ...prev, selectedBucket: "trash" })),
    onUpdateSearch: (search: string) => setTaskUiState((prev) => ({ ...prev, search })),
    search: taskUiState.search,
    selectedBucket: taskUiState.selectedBucket,
    shortcuts: TASK_KEYBOARD_SHORTCUTS,
    trashCount: listRailOptions.find((list) => list.id === "trash")?.count ?? 0,
    view: taskUiState.view,
  };
  const openTaskEditorFromId = (taskId: string) => {
    const task = tasks.find((entry) => entry.id === taskId);
    if (task) {
      openExistingTaskEditor(task);
    }
  };

  const taskOperationsHeaderProps = {
    actionLabel: hasFocusedToday ? "Refocus" : "Focus",
    activeCount: filteredActiveTasks.length,
    hideSearch: taskUiState.view === "list" || duplicateTitleModeActive,
    metric: momentumMetric,
    onCycleMomentum: () => setMomentumView(getNextMomentumView(momentumView)),
    onOpenComposer: openInlineNewListTaskComposer,
    onOpenFocusPlanner: openFocusPlanner,
    onOpenImport: () => { void openTaskImportPanel(); },
    onOpenMomentumDetails: openMomentumDetails,
    onOpenTrash: () => setTaskUiState((prev) => ({ ...prev, selectedBucket: "trash" })),
    onSearchChange: (search: string) => setTaskUiState((prev) => ({ ...prev, search })),
    onViewChange: (view: TaskUiState["view"]) => setTaskUiState((prev) => ({ ...prev, view })),
    search: taskUiState.search,
    selectedBucket: taskUiState.selectedBucket,
    trashCount: listRailOptions.find((list) => list.id === "trash")?.count ?? 0,
    todayCount: filteredTodayTasks.length,
    view: taskUiState.view,
  };

  return (
    <main
      data-theme={theme}
      data-lowstim={lowStim ? "" : undefined}
      className="min-h-screen px-[15px] pb-4 pt-0 transition-colors bg-[linear-gradient(180deg,#ffffff_0%,#faf8ff_100%)] text-[#182033] dark:bg-[linear-gradient(180deg,#0d0c17_0%,#141124_100%)] dark:text-white"
    >
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
          energyOptions={energyOptions}
          fieldOptions={TASK_LIST_RULE_FIELD_OPTIONS}
          listCounts={visibleListCounts}
          lists={availableTaskLists}
          onClose={() => setIsTaskListSettingsOpen(false)}
          onCreateCustomList={createCustomTaskList}
          onDeleteList={deleteTaskList}
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
      {activePendingReward && (activePage !== "Tasks" || taskUiState.view !== "list") ? (
        <TaskRewardModal
          isDark={theme === "dark"}
          onClaim={claimPendingReward}
          pendingReward={activePendingReward}
        />
      ) : null}
      <div className="fixed inset-x-0 top-0 z-30 border-b border-[#ece8f8]/70 bg-[linear-gradient(180deg,rgba(244,240,255,0.96),rgba(239,244,255,0.9))] shadow-[0_14px_34px_rgba(81,61,168,0.07)] backdrop-blur-xl dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(19,16,33,0.94),rgba(14,12,27,0.9))]" ref={hudShellRef}>
        <div className="w-full">
          {shouldShowHudLoadingShell ? (
            <HudLoadingShell />
          ) : (
            <div className={`w-full border-white/70 bg-white/[0.46] px-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-[12px] dark:border-white/10 dark:bg-white/[0.05] ${hudUiState.isHudCollapsed ? "py-1.5" : "py-2"}`}>
              <HudRuntimeClock active={runningTaskTimers.length > 0 || (focusAlarmEnabled && focusAlarmNextRingAt !== null)}>
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
                      activeTaskCount={filteredActiveTasks.length}
                      currentHudPageId={hudUiState.activeHudPageId}
                      economy={economy}
                      hudUiState={hudUiState}
                      urgentTaskCount={filteredUrgentTasks.length}
                      onOpenAccount={() => setIsAccountOpen(true)}
                      onOpenComposer={openInlineNewListTaskComposer}
                      onOpenFocusPlanner={openFocusPlanner}
                      onOpenQuickCapture={() => { void openTaskImportPanel(); }}
                      onNextTaskTimer={() => cycleHudTaskTimer("next")}
                      onPauseTaskTimer={pauseHudTaskTimer}
                      onPreviousTaskTimer={() => cycleHudTaskTimer("previous")}
                      onResumeTaskTimer={resumeHudTaskTimer}
                      onStopTaskTimer={stopHudTaskTimer}
                      profile={profile}
                      runningTaskTimers={runningTaskTimers}
                      setHudUiState={setHudUiState}
                      taskTimerNow={hudNow}
                      theme={theme}
                      todayTaskCount={filteredTodayTasks.length}
                      onThemeChange={setTheme}
                      lowStim={lowStim}
                      onLowStimChange={setLowStim}
                      currentStreak={taskHistoryStats.currentStreak}
                      notificationInboxItems={notificationInboxItems}
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
                      onDecreaseMobileZoom={decreaseMobileZoom}
                      onIncreaseMobileZoom={increaseMobileZoom}
                      canDecreaseMobileZoom={canDecreaseMobileZoom}
                      canIncreaseMobileZoom={canIncreaseMobileZoom}
                    />
                  );
                }}
              </HudRuntimeClock>
            </div>
          )}
        </div>
      </div>
      <div aria-hidden="true" className="w-full" style={{ height: shouldShowHudLoadingShell ? HUD_LOADING_SHELL_HEIGHT : hudHeight }} />
      <div className="mx-auto w-full" style={shellZoomStyle}>
        <section className="w-full pb-28">

        {isWorkspaceLoading ? (
          <div className={`mt-5 rounded-[1.5rem] border px-5 py-4 text-sm font-semibold border-[#ece8f8] bg-white text-[#5f6983] dark:border-white/10 dark:bg-white/6 dark:text-white/70`}>
            Syncing your workspace...
          </div>
        ) : null}

        {message ? (
          <div className="mt-5">
            <StatusBanner message={message} />
          </div>
        ) : null}

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
            activeCount={activeTasks.length}
            achievementSummary={{
              chargedSetCount: chargedSetCodes.length,
              latestUnlockTitle: latestAchievementUnlock?.title ?? null,
              nextSetLabel: nextAchievementSet?.title ?? null,
              unlockedFaces: unlockedAchievementFaces,
            }}
            doneCount={doneTasks.length}
            lowEnergyTasks={lowEnergyTasks}
            momentumPercent={momentumPercent}
            overdueCount={overdueTasks.length}
            setActivePage={setActivePage}
            todayCount={todayTasks.length}
            urgentTasks={urgentTasks}
          />
        ) : activePage === "Achievements" ? (
          <AchievementsPage
            chargedSetCount={chargedSetCodes.length}
            completionPercent={achievementCompletionPercent}
            currentStreak={taskHistoryStats.currentStreak}
            economy={economy}
            latestUnlock={latestAchievementUnlock}
            nextSet={nextAchievementSet}
            setSummaries={achievementSetSummaries}
            storageMode={achievementStorageMode}
            totalFaces={totalAchievementFaces}
            unlockedFaceCount={unlockedAchievementFaces}
          />
        ) : activePage === "Tasks" ? (
          <TasksWorkspace
            flows={(
              <TaskEditFlows
                actualTimeEntryFlow={actualTimeEntryFlow}
                batchDeleteFlow={batchDeleteFlow}
                batchEditFlow={batchEditFlow}
                focusPlannerFlow={focusPlannerFlow}
                momentumFlow={momentumFlow}
                taskEditorFlow={taskEditorFlow}
                taskHistoryFlow={taskHistoryFlow}
              />
            )}
            operationsHeaderProps={taskOperationsHeaderProps}
            view={duplicateTitleModeActive ? "list" : taskUiState.view}
            listViewPanel={(
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
                <TasksListAdapter
                tableProps={{
                  allListOptions: availableTaskLists.map((list) => ({ id: list.id, label: list.name })),
                  allNoteOptions: availableTaskNotes,
                  allTagOptions: allTaskTags,
                  activeTaskTimerIndex,
                  currentListLabel: selectedBucketLabel,
                  getFollowTaskDestination,
                  overlayNode: activePendingReward ? (
                    <TaskRewardModal
                      isDark={theme === "dark"}
                      onClaim={claimPendingReward}
                      pendingReward={activePendingReward}
                      variant="table"
                    />
                  ) : null,
                  onCreateTaskList: async (name) => createCustomTaskList({ membershipMode: "manual", name, rules: null }),
                  onClearSelection: clearListTaskSelection,
                  onNextTaskTimer: () => cycleHudTaskTimer("next"),
                  onDeleteTaskActualTimeEntry: (entryId) => { void deleteTaskActualTimeEntry(entryId); },
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
                  onOpenTaskActualTime: (taskId, options) => {
                    setTaskActualTimeEntryPrefill(options?.durationSeconds && options.durationSeconds > 0
                      ? {
                          durationSeconds: options.durationSeconds,
                          title: options.title ?? tasks.find((entry) => entry.id === taskId)?.title ?? "",
                        }
                      : null);
                    setTaskActualTimeEntryTaskId(taskId);
                  },
                  onOpenNote: (noteId) => {
                    setNotePageOpenNoteId(noteId);
                    setActivePage("Notes");
                  },
                  onSetDue: (taskId, schedule) => { void updateTask(taskId, { due_on: schedule.dueOn || null, due_time: schedule.dueTime || null }); },
                  onSetEnergy: (taskId, energy) => { void updateTask(taskId, { energy }); },
                  onSetEstimatedMinutes: (taskId, minutes) => { void updateTask(taskId, { estimated_minutes: minutes }); },
                  onSetActualSeconds: (taskId, seconds) => { void updateTask(taskId, { actual_seconds: seconds }); },
                  taskActualTimeEntriesByTaskId,
                  onSetLink: (taskId, nextLink) => { void updateTask(taskId, { external_link_label: nextLink.label || null, external_link_url: nextLink.url || null }); },
                  onOpenTaskEditor: openTaskEditorFromId,
                  onFollowDetachedTask: followDetachedTask,
                  onDismissDetachedTask: dismissDetachedTask,
                  onDuplicateTask: (taskId) => {
                    const task = tasks.find((entry) => entry.id === taskId);
                    if (task) {
                      void duplicateTaskInPlace(task);
                    }
                  },
                  onRequestedOpenTaskHandled: (taskId) => {
                    setRequestedListOverlayTaskId((current) => (current === taskId ? null : current));
                  },
                  onSetLinkedNoteIds: (taskId, linkedNoteIds) => { void syncTaskNoteLinks(taskId, linkedNoteIds); },
                  onSetNotes: (taskId, notes) => { void updateTask(taskId, { notes: notes || null }); },
                  onSetPriority: (taskId, priorities) => {
                    void updateTask(taskId, {
                      is_important: priorities.includes("important"),
                      is_urgent: priorities.includes("urgent"),
                    });
                    const nextFocusedTaskIds = priorities.includes("focus")
                      ? Array.from(new Set([...focusedTaskIds, taskId]))
                      : focusedTaskIds.filter((id) => id !== taskId);
                    void saveFocusSelection(nextFocusedTaskIds);
                  },
                  onSetRepeat: (taskId, repeat, cadence) => {
                    void updateTask(taskId, {
                      repeat_frequency: repeat,
                      ...(cadence
                        ? {
                          repeat_day_of_month: cadence.repeatDayOfMonth,
                          repeat_days_of_week: repeat === "weekly" || repeat === "custom" ? cadence.repeatDaysOfWeek : [],
                          repeat_interval: repeat === "none" ? 1 : Math.max(1, cadence.repeatInterval),
                        }
                        : {}),
                    });
                  },
                  onSetStatus: (taskId, status) => { void updateTask(taskId, { status }); },
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
                  requestedOpenTask: requestedOpenListTask,
                  requestedOpenTaskId: requestedListOverlayTaskId,
                  suppressDetachedNoticeTaskId: suppressDetachedListNoticeTaskId,
                  runningTaskTimers,
                  selectedTaskIds: selectedListTaskIds,
                  tasks: selectedBucketTasks,
                  rowContext: {
                    focusedTaskIdSet,
                    linkedNotesByTaskId: taskLinkedNotesByTaskId,
                    listDefinitions: availableTaskLists,
                    listMembershipsByTaskId: taskListMembershipsByTaskId,
                    subtasksByTaskId: taskSubtasksByTaskId,
                    taskHistoryByTaskId,
                    todayDateKey: todayKey,
                  },
                }}
                filterRowsNode={taskFilterRowsNode}
                panelProps={listPanelProps}
              />
              )
            )}
            nonListViewPanel={(
              <TasksNonListShell
                cardsNode={cardsContentNode}
                dailyPlanningNode={nonListDailyPlanningNode}
                filterRowsNode={nonListFilterRowsNode}
                gridNode={gridContentNode}
                lists={listRailOptions}
                matrixNode={matrixContentNode}
                onSelectBucket={setSelectedBucket}
                selectedBucket={taskUiState.selectedBucket}
                view={taskUiState.view}
              />
            )}
          />
        ) : activePage === "Focus" ? (
          <FocusPage
            activeSessions={activeSessions}
            categories={focusCategories}
            history={focusHistory}
            onAdjustTimer={(categoryId, deltaSeconds) => {
              void handleAdjustTimer(categoryId, deltaSeconds);
            }}
            onResetTimer={(categoryId) => {
              void handleResetTimer(categoryId);
            }}
            onFinishTimer={handleFinishTimer}
            onLogManual={handleManualFocusEntry}
            onToggleTimer={(categoryId) => {
              void handleToggleTimer(categoryId);
            }}
            onUpdateHistoryEntry={handleUpdateFocusHistoryEntry}
            onDeleteHistoryEntry={handleDeleteFocusHistoryEntry}
            onDeleteCategory={handleDeleteFocusCategory}
            onUpdateCategories={handleSaveCategories}
          />
        ) : activePage === "Health" ? (
          <TaskHealthPage
            awards={healthAwards}
            checkIns={healthCheckIns}
            deleteFavoriteFood={deleteFavoriteFood}
            deleteMealEntry={deleteMealEntry}
            deleteWeightEntry={deleteWeightEntry}
            favorites={healthFavorites}
            importAudits={healthImportAudits}
            isLoading={isHealthLoading}
            importAppleHealthData={importAppleHealthData}
            mealEntries={healthMealEntries}
            metricEntries={healthMetricEntries}
            onOpenReminderTemplate={openHealthReminderTemplate}
            profile={healthProfile}
            saveCheckIn={saveCheckIn}
            saveFavoriteFood={saveFavoriteFood}
            saveProfile={saveHealthProfile}
            addMealEntry={addHealthMealEntry}
            addWeightEntry={addHealthWeightEntry}
            storageMode={healthStorageMode}
            weightEntries={healthWeightEntries}
          />
        ) : activePage === "Roll" ? (
          <RollPage
            client={client}
            currentUser={currentUser}
            isDark={theme === "dark"}
            onSpendPoints={(delta, reason) =>
              void appendEconomyEvent({
                source: "roll",
                refId: currentUser.id,
                points: delta,
                xp: 0,
                reason,
              })
            }
          />
        ) : activePage === "Stats" ? (
          <TaskStatsPage
            achievementSummary={{
              chargedSetCount: chargedSetCodes.length,
              completionPercent: achievementCompletionPercent,
              latestUnlock: latestAchievementUnlock,
              nextSetTitle: nextAchievementSet?.title ?? null,
              unlockedFaceCount: unlockedAchievementFaces,
            }}
            economy={economy}
            focusHistory={focusHistory}
            taskHistory={taskHistory}
            taskHistoryStats={taskHistoryStats}
            tasks={tasks}
          />
        ) : activePage === "Notes" ? (
          <NotesPage
            client={client}
            currentUser={currentUser}
            onOpenNoteHandled={() => setNotePageOpenNoteId(null)}
            openNoteId={notePageOpenNoteId}
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
            onThemeChange={setTheme}
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
          renderIcon={(name) => <CategoryIcon className="h-6 w-6" name={name} />}
        />
      </div>
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
      <AchievementCelebrationOverlay onDismiss={dismissAchievementCelebration} unlock={activeAchievementCelebration} />
    </main>
  );
}

function ConfigSplash() {
  return (
    <main className={`min-h-screen px-3 py-8 sm:px-5 lg:px-8 bg-[linear-gradient(180deg,#ffffff_0%,#faf8ff_100%)] text-[#182033] dark:bg-[linear-gradient(180deg,#0d0c17_0%,#141124_100%)] dark:text-white`}>
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

function LoadingSplash({
  status,
}: {
  status: string;
}) {
  return (
    <main className={`min-h-screen px-3 py-8 sm:px-5 lg:px-8 bg-[linear-gradient(180deg,#ffffff_0%,#faf8ff_100%)] text-[#182033] dark:bg-[linear-gradient(180deg,#0d0c17_0%,#141124_100%)] dark:text-white`}>
      <section className="mx-auto flex min-h-[80vh] max-w-3xl items-center justify-center">
        <div className={`w-full rounded-[2rem] border p-8 text-center border-[#ece8f8] bg-white shadow-[0_24px_70px_rgba(81,61,168,0.1)] dark:border-white/10 dark:bg-white/6`}>
          <div className={`mx-auto h-14 w-14 animate-pulse rounded-full bg-[#ede8ff] dark:bg-[#22193f]`} />
          <h1 className={`mt-5 text-3xl font-black text-[#17203a] dark:text-white`}>
            {status}
          </h1>
        </div>
      </section>
    </main>
  );
}

function HudLoadingShell() {
  return (
    <div className="w-full border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,244,255,0.96))] px-0 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
      <header aria-label="Loading HUD" className="flex flex-col gap-2 px-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center justify-between gap-3 lg:w-[13rem] lg:shrink-0 lg:justify-start">
          <div className="flex items-center gap-1">
            <BrandMark profile={DEFAULT_PROFILE} />
            <span className="rounded-full bg-[#f1ecff] px-2 py-0.5 text-[11px] font-semibold text-[#7f6af7]">
              {HUD_VERSION}
            </span>
          </div>
          <div className="h-11 w-11 rounded-full bg-[#f3efff]" />
        </div>
        <div className="grid min-h-[56px] flex-1 grid-cols-2 gap-2 rounded-[1.25rem] border border-[#e8e1fb] bg-white/92 px-2 py-2 shadow-[0_10px_30px_rgba(81,61,168,0.06)] sm:grid-cols-4 lg:min-h-[64px]">
          <div className="rounded-[1rem] bg-[#faf8ff]" />
          <div className="rounded-[1rem] bg-[#f7f4ff]" />
          <div className="rounded-[1rem] bg-[#faf8ff]" />
          <div className="rounded-[1rem] bg-[#f7f4ff]" />
        </div>
        <div className="flex items-center justify-end gap-2 lg:shrink-0">
          <div className="rounded-full border border-[#ddd6fb] bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7]">
            Loading workspace
          </div>
        </div>
      </header>
    </div>
  );
}

function AuthSplash({
  message,
  onAuthenticate,
}: {
  message: Message | null;
  onAuthenticate: (credentials: {
    email: string;
    password: string;
    mode: AuthMode;
  }) => Promise<void>;
}) {
  const [mode, setMode] = useState<AuthMode>("sign-up");
  const [hasHydratedMode, setHasHydratedMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    <main className={`min-h-screen px-3 py-8 sm:px-5 lg:px-8 bg-[linear-gradient(180deg,#ffffff_0%,#faf8ff_100%)] text-[#182033] dark:bg-[linear-gradient(180deg,#0d0c17_0%,#141124_100%)] dark:text-white`}>
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
          </form>

          {message ? (
            <div className="mt-4">
              <StatusBanner message={message} />
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function StatusBanner({
  message,
}: {
  message: Message;
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

  return (
    <div className={`flex items-center justify-between gap-3 rounded-[1.25rem] border px-4 py-3 text-sm font-medium ${className}`}>
      <span className="min-w-0 flex-1">{message.text}</span>
      <TaskTableChipButton
        className="shrink-0"
        onClick={() => setIsDismissed(true)}
        toneClassName="border-current/20 bg-transparent text-current"
      >
        Dismiss
      </TaskTableChipButton>
    </div>
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
      className="relative mr-[3px] rounded-full transition-transform hover:scale-[1.02]"
      onClick={onOpenAccount}
      type="button"
    >
      <Image
        alt="Profile avatar"
        className="h-11 w-11 rounded-full object-cover ring-[3px] ring-white/70 shadow-[0_8px_22px_rgba(81,61,168,0.12)]"
        height={44}
        src={profile.avatarSrc}
        unoptimized={profile.avatarSrc.startsWith("data:")}
        width={44}
      />
      <span className="absolute -right-0.5 -top-0.5 grid h-5 w-5 place-items-center rounded-full bg-[#f05566] text-[10px] font-semibold text-white">
        2
      </span>
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
        <div className="flex h-full flex-col justify-center rounded-[1.2rem] bg-[#e7faf4] px-4 text-[#0e9b74] dark:bg-[#103c33] dark:text-[#6ef0c4]">
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
        <div className="flex h-full flex-col justify-center rounded-[1.2rem] bg-[#fff3e0] px-4 text-[#d97706] dark:bg-[#3d2a00] dark:text-[#fbbf24]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Streak</p>
          <p className="mt-1 text-2xl font-black">{currentStreak > 0 ? `${currentStreak}d` : "0d"}</p>
        </div>
      );
    }

    if (widgetType === "focus_alarm") {
      return (
        <FocusAlarmWidget
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
        <button className="flex h-full w-full flex-col items-start justify-center rounded-[1.15rem] bg-[#f5f1ff] px-4 text-[#6f57f6] transition hover:bg-[#eee8ff] dark:bg-[#22193f] dark:text-[#cabfff]" onClick={action.onClick} type="button">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{action.label}</p>
          <p className="mt-1 text-lg font-black">{action.label}</p>
        </button>
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
  notificationInboxItems,
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
  notificationInboxItems: HudNotificationItem[];
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
  const isHudCollapsed = hudUiState.isHudCollapsed;
  const accountButton = (
    <button className="relative mr-[3px] rounded-full transition-transform hover:scale-[1.02]" onClick={onOpenAccount} type="button">
      <Image
        alt="Profile avatar"
        className="h-11 w-11 rounded-full object-cover ring-[3px] ring-white/70 shadow-[0_8px_22px_rgba(81,61,168,0.12)]"
        height={44}
        src={profile.avatarSrc}
        unoptimized={profile.avatarSrc.startsWith("data:")}
        width={44}
      />
      <span className="absolute -right-0.5 -top-0.5 grid h-5 w-5 place-items-center rounded-full bg-[#f05566] text-[10px] font-semibold text-white">
        2
      </span>
    </button>
  );

  const timerSeconds = activeHudTaskTimer ? getTaskTimerDisplaySeconds(activeHudTaskTimer, taskTimerNow) : 0;
  const activeHudPageTitle = hudUiState.hudPages.find((page) => page.id === currentHudPageId)?.title ?? "HUD";
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
        <button className="flex h-full w-full items-center justify-center rounded-[0.9rem] bg-transparent px-3 text-sm font-bold text-[#6f57f6] transition hover:bg-white/[0.18] dark:bg-transparent dark:text-[#cabfff] dark:hover:bg-white/[0.06]" onClick={action.onClick} type="button">
          <span className="truncate">{action.label}</span>
        </button>
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
      <header className="flex items-center gap-2 px-3">
        <div className="min-w-0 flex flex-1 items-center gap-2 rounded-[1.15rem] border border-white/70 bg-white/[0.34] px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex min-w-0 items-center gap-1.5">
            <BrandMark compact profile={profile} />
            <span className="rounded-full bg-[#f1ecff] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f6af7] dark:bg-white/10 dark:text-[#c5b8ff]">
              {HUD_VERSION}
            </span>
          </div>
          <span className="hidden rounded-full bg-[#f1ecff] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f6af7] sm:inline-flex dark:bg-white/10 dark:text-[#c5b8ff]">
            {activeHudPageTitle}
          </span>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
            {activeHudTaskTimer ? (
              <div className="hidden min-w-0 items-center gap-2 rounded-full bg-[#f5f1ff] px-2.5 py-1 text-[#5f4ac9] sm:flex dark:bg-[#241c42] dark:text-[#d6cdff]">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate text-[11px] font-semibold">{activeHudTaskTimer.title}</span>
                <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.16em]">
                  {formatActualSecondsLabel(timerSeconds)}
                </span>
              </div>
            ) : null}
            <div className="rounded-full bg-[#faf7ff] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7c73a0] dark:bg-white/[0.05] dark:text-white/55">
              Today {todayTaskCount}
            </div>
            <div className="rounded-full bg-[#fff5eb] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#c06b1c] dark:bg-[#3b2714] dark:text-[#ffbe87]">
              Urgent {urgentTaskCount}
            </div>
            <TaskTableChipButton
              aria-label="Expand HUD"
              className="gap-1.5 text-[#6f57f6] dark:text-[#cabfff]"
              onClick={() => setHudCollapsed(false)}
              toneClassName="border-[#ddd6fb] bg-white/90 dark:border-white/10 dark:bg-white/[0.06]"
            >
              <ChevronUp className="h-3.5 w-3.5" />
              Open
            </TaskTableChipButton>
          </div>
        </div>
        <div className="shrink-0">{accountButton}</div>
      </header>
    );
  }

  return (
    <header className="flex flex-col gap-2 px-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center justify-between gap-3 lg:mr-[5px] lg:shrink-0 lg:justify-start">
        <div className="flex items-center gap-1">
          <BrandMark profile={profile} />
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold bg-[#f1ecff] text-[#7f6af7] dark:bg-white/10 dark:text-[#c5b8ff]`}>
            {HUD_VERSION}
          </span>
        </div>
        <div className="lg:hidden">{accountButton}</div>
      </div>
      <HudCommandCenter
        hudUiState={hudUiState}
        renderWidget={renderHudWidget}
        setHudUiState={setHudUiState}
      />
      <div className="flex items-center justify-end gap-2 lg:shrink-0">
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
    </header>
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
      className={compact
        ? "h-9 w-auto max-w-none object-contain object-left pl-[3px]"
        : "h-[50px] w-auto max-w-none object-contain object-left pl-[3px]"}
      height={compact ? 36 : 56}
      onError={() => setErrored(true)}
      src={withBasePath(logoSrc)}
      unoptimized={logoSrc.startsWith("data:")}
      width={compact ? 122 : 190}
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
      <span className={`rounded-full ${compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1 text-sm"} font-bold bg-[#6f57f6] text-white dark:bg-[#c8baff] dark:text-[#191229]`}>
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
