"use client";

import Image from "next/image";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import {
  AlertCircle,
  ArrowUp,
  BarChart2,
  BookOpen,
  Box,
  Brain,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  ChartPie,
  ChevronDown,
  ChevronUp,
  Clock,
  Code2,
  Coffee,
  Diamond,
  Dice5,
  Dices,
  FlaskConical,
  DollarSign,
  Dumbbell,
  FileText,
  Footprints,
  Gamepad2,
  GripVertical,
  Headphones,
  Heart,
  House,
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
  UserRound,
  Utensils,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import dynamicIconImports from "lucide-react/dynamicIconImports";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FocusPage } from "./focus-page";
const GamesPage = lazy(() => import("./games-page").then((m) => ({ default: m.GamesPage })));
const Dice3DCanvas = lazy(() => import("./dice-3d").then((m) => ({ default: m.Dice3DCanvas })));
import { ModalShell } from "./modal-shell";
import { ErrorBoundary } from "./error-boundary";
import { useEconomy } from "@/hooks/useEconomy";
import { useFocus, mapFocusCategoryRow, mapActiveSessions, mapFocusSessionRow, mergeStoredFocusHistory, mergeStoredFocusCategories, saveFocusCategories, saveFocusHistory } from "@/hooks/useFocus";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  DEFAULT_FOCUS_CATEGORY_TITLES,
  DEFAULT_FOCUS_TITLES,
  DEFAULT_FOCUS_TYPES,
  DEFAULT_PRIMARY_SUBTYPES,
  DEFAULT_SECONDARY_SUBTYPES,
  type ActiveFocusSession,
  type FocusCategory,
  type FocusLabelOptions,
  type FocusSubtype,
  type FocusType,
  type HistoricalFocusSession,
} from "@/lib/types";
import { formatLocalDate, todayISO } from "@/lib/utils";
import { runStorageMigrations } from "@/lib/storage-migrations";
import type {
  FocusCategory as DbFocusCategory,
  Note,
  PrizeCell,
  RollHistoryEntry,
  Task,
  TaskEnergy,
  TaskFocusDay as DbTaskFocusDay,
  TaskGridLayout as DbTaskGridLayout,
  TaskInsert,
  TaskPriority,
  TaskRepeatFrequency,
  TaskStatus,
  TaskSubtask as DbTaskSubtask,
  TaskSubtaskInsert,
  TaskSubtaskStatus,
  TaskUpdate,
  TaskHistory as DbTaskHistory,
  TaskHistoryInsert,
  VaultPrize,
  VaultPrizeInsert,
  VaultPrizeTier,
} from "@/lib/database.types";

type Message = {
  tone: "neutral" | "good" | "warn";
  text: string;
};

type AuthMode = "sign-in" | "sign-up";
type TaskDraft = Omit<TaskInsert, "user_id">;
type TaskEditorMode = "create" | "edit";
type ThemeMode = "light" | "dark";
type FilterChipTone = "purple" | "orange" | "red" | "neutral";
type TaskViewMode = "list" | "cards" | "matrix" | "grid";
type MomentumView = "urgent" | "today" | "focus";
type TaskQuickFilter = "active" | "done" | "urgent" | "today" | "focused";
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
type TaskGridItem = {
  h: number;
  id: string;
  type: TaskGridWidgetType;
  w: number;
  x: number;
  y: number;
};
type ListCardId = "composer" | "import" | "focus-today" | "due-today" | "stats" | "urgent";
type ListCardLayout = { id: ListCardId; colSpan: number; minHeight: number };
type TaskUiState = {
  matchAny: boolean;
  quickFilters: TaskQuickFilter[];
  search: string;
  view: TaskViewMode;
  energyFilters: TaskEnergy[];
};
type TaskEditorDraft = {
  title: string;
  notes: string;
  status: TaskStatus;
  priority: TaskPriority;
  energy: TaskEnergy;
  isUrgent: boolean;
  isImportant: boolean;
  focusToday: boolean;
  dueOn: string;
  dueTime: string;
  estimatedMinutes: string;
  tags: string[];
  externalLinkLabel: string;
  externalLinkUrl: string;
  oneStepAtATime: boolean;
  repeatFrequency: TaskRepeatFrequency;
  repeatInterval: string;
  repeatDaysOfWeek: number[];
  repeatDayOfMonth: string;
  subtasksAutoReset: boolean;
  subtasks: TaskSubtaskDraft[];
};
type TaskSubtaskDraft = {
  id: string;
  title: string;
  status: TaskSubtaskStatus;
  children: TaskSubtaskDraft[];
};
type TaskHistoryStats = {
  bestStreak: number;
  currentStreak: number;
  doneRate: number;
  loggedDays: number;
};
type AppPage =
  | "Home"
  | "Tasks"
  | "Focus"
  | "Roll"
  | "Games"
  | "Stats"
  | "Notes"
  | "Settings"
  | "Test";

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

type UserProfile = {
  avatarSrc: string;
  created: boolean;
  displayName: string;
  email: string;
  logoSrc: string | null;
};

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

const PROFILE_STORAGE_KEY = "adhdice-profile";
const FOCUS_CATEGORIES_STORAGE_KEY = "adhdice_focus_categories";
const FOCUS_ACTIVE_STORAGE_KEY = "adhdice_active_sessions";
const FOCUS_HISTORY_STORAGE_KEY = "adhdice_focus_history";
const TASK_UI_STORAGE_KEY = "adhdice-task-ui";
const TASK_FOCUS_STORAGE_KEY = "adhdice-task-focus";
const DEFAULT_TASK_UI_STATE: TaskUiState = {
  matchAny: true,
  quickFilters: [],
  search: "",
  view: "list",
  energyFilters: [],
};
const DEFAULT_PROFILE: UserProfile = {
  avatarSrc: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
  created: false,
  displayName: "Andrew Schaffer",
  email: "andrew@adhdice.app",
  logoSrc: "/logo.png",
};
let cachedProfileSnapshot: UserProfile = DEFAULT_PROFILE;

const priorityOptions: TaskPriority[] = ["normal", "high", "low"];
const energyOptions: TaskEnergy[] = ["medium", "low", "high"];
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
const OPEN_TASK_STATUSES: TaskStatus[] = ["pending", "in_progress", "upcoming", "not_due"];
const FINISHED_TASK_STATUSES: TaskStatus[] = ["done", "did_my_best"];
const dockItems: AppPage[] = ["Home", "Tasks", "Focus", "Roll", "Games", "Stats", "Notes", "Settings", "Test"];
const dockIcons: Record<AppPage, string> = {
  Home: "Home",
  Tasks: "CheckSquare",
  Focus: "Clock",
  Roll: "Dice",
  Games: "Gamepad",
  Stats: "PieChart",
  Notes: "Book",
  Settings: "Monitor",
  Test: "FlaskConical",
};
const TASK_GRID_STORAGE_KEY = "adhdice-task-grid-layout";
const LIST_CARD_STORAGE_KEY = "adhdice-list-card-layout";
const DAY_RESET_STORAGE_KEY = "adhdice-day-reset";
const LIST_ROW_HEIGHT = 120;
const LIST_DEFAULT_CARD_LAYOUTS: ListCardLayout[] = [
  { id: "composer", colSpan: 2, minHeight: LIST_ROW_HEIGHT * 2 },
  { id: "import", colSpan: 2, minHeight: LIST_ROW_HEIGHT * 2 },
  { id: "focus-today", colSpan: 2, minHeight: LIST_ROW_HEIGHT * 3 },
  { id: "due-today", colSpan: 1, minHeight: LIST_ROW_HEIGHT * 3 },
  { id: "stats", colSpan: 1, minHeight: LIST_ROW_HEIGHT * 3 },
  { id: "urgent", colSpan: 4, minHeight: LIST_ROW_HEIGHT * 2 },
];
const TASK_GRID_MAX_COLUMNS = 4;
const TASK_GRID_TABLET_COLUMNS = 2;
const TASK_GRID_PHONE_COLUMNS = 1;
const TASK_GRID_ROW_HEIGHT = 42;
const TASK_GRID_MAX_DISPLAY_ROWS = 24;
const TASK_GRID_WIDGET_LABELS: Record<TaskGridWidgetType, string> = {
  urgent: "Urgent Tasks",
  focus_today: "Focus Today",
  due_today: "Due Today",
  active_queue: "Active Queue",
  completed: "Completed",
  quick_capture: "Quick Capture",
  import: "Import",
  focus_stats: "Focus Stats",
};
const TASK_GRID_STARTER_LAYOUT: TaskGridItem[] = normalizeTaskGridLayout([
  { h: 9, id: "grid-urgent", type: "urgent", w: 2, x: 0, y: 0 },
  { h: 6, id: "grid-focus-today", type: "focus_today", w: 1, x: 0, y: 0 },
  { h: 8, id: "grid-quick-capture", type: "quick_capture", w: 1, x: 0, y: 0 },
  { h: 6, id: "grid-due-today", type: "due_today", w: 2, x: 0, y: 0 },
  { h: 6, id: "grid-active-queue", type: "active_queue", w: 1, x: 0, y: 0 },
  { h: 6, id: "grid-focus-stats", type: "focus_stats", w: 1, x: 0, y: 0 },
  { h: 8, id: "grid-import", type: "import", w: 2, x: 0, y: 0 },
  { h: 6, id: "grid-completed", type: "completed", w: 2, x: 0, y: 0 },
]);

export function TaskApp() {
  runStorageMigrations();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(supabase !== null);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [message, setMessage] = useState<Message | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [lowStim, setLowStim] = useState(false);
  const [activePage, setActivePage] = useState<AppPage>("Home");
  const { economy, setEconomy, appendEconomyEvent } = useEconomy(supabase, session?.user?.id ?? null);
  const {
    focusCategories, setFocusCategories,
    activeSessions, setActiveSessions,
    focusHistory, setFocusHistory,
    suppressCategoryReload,
    handleToggleTimer, handleFinishTimer, handleAdjustTimer, handleResetTimer,
    handleManualFocusEntry, handleSaveCategories, handleDeleteFocusCategory,
    handleUpdateFocusHistoryEntry, handleDeleteFocusHistoryEntry,
  } = useFocus(supabase, session?.user?.id ?? null, setMessage, appendEconomyEvent);
  const [taskUiState, setTaskUiState] = useState<TaskUiState>(DEFAULT_TASK_UI_STATE);
  const [focusedTaskIdsByDate, setFocusedTaskIdsByDate] = useState<Record<string, string[]>>({});
  const [taskHistory, setTaskHistory] = useState<DbTaskHistory[]>([]);
  const [taskSubtasks, setTaskSubtasks] = useState<DbTaskSubtask[]>([]);
  const [taskGridLayout, setTaskGridLayout] = useState<TaskGridItem[]>(TASK_GRID_STARTER_LAYOUT);
  const [isGridEditMode, setIsGridEditMode] = useState(false);
  const [isListLayoutEditMode, setIsListLayoutEditMode] = useState(false);
  const [listCardLayouts, setListCardLayouts] = useState<ListCardLayout[]>(LIST_DEFAULT_CARD_LAYOUTS);
  const [activeListCardId, setActiveListCardId] = useState<ListCardId | null>(null);
  const [draggedListCardId, setDraggedListCardId] = useState<ListCardId | null>(null);
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
  const [isTaskEditorOpen, setIsTaskEditorOpen] = useState(false);
  const [taskEditorMode, setTaskEditorMode] = useState<TaskEditorMode>("create");
  const [taskEditorTaskId, setTaskEditorTaskId] = useState<string | null>(null);
  const [taskHistoryModalTaskId, setTaskHistoryModalTaskId] = useState<string | null>(null);
  const gridColumns = useResponsiveTaskGridColumns();
  const [dayStartTime, setDayStartTime] = useState<string>(() => {
    if (typeof window === "undefined") return "06:00";
    // Restore accent color on first render
    const savedAccent = window.localStorage.getItem("adhdice-accent-color");
    if (savedAccent) {
      document.documentElement.style.setProperty("--accent", savedAccent);
    }
    return window.localStorage.getItem("adhdice-day-start-time") ?? "06:00";
  });
  const lastResetDateRef = useRef<string>(
    typeof window !== "undefined"
      ? (window.localStorage.getItem(DAY_RESET_STORAGE_KEY) ?? "")
      : "",
  );

  useEffect(() => {
    if (!supabase) {
      return;
    }

    supabase.auth.getSession()
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Failed to get session:", error);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, nextSession) => {
      if (event === "SIGNED_OUT") {
        setTasks([]);
        setFocusCategories([]);
        setActiveSessions({});
        setFocusHistory([]);
        setFocusedTaskIdsByDate({});
        setTaskHistory([]);
        setTaskSubtasks([]);
        setTaskGridLayout(TASK_GRID_STARTER_LAYOUT);
        setIsGridEditMode(false);
        setSelectedGridWidgetId(null);
        saveProfile(DEFAULT_PROFILE);
      }
      setSession(nextSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !session?.user) {
      return;
    }

    const client = supabase;
    const currentUser = session.user;
    const userId = currentUser.id;
    let isActive = true;

    async function loadWorkspaceData({ silent = false }: { silent?: boolean } = {}) {
      if (!silent) {
        setIsWorkspaceLoading(true);
      }

      const [taskResult, taskSubtasksResult, taskHistoryResult, profileResult, categoryResult, activeResult, historyResult, focusDayResult, gridLayoutResult] = await Promise.all([
        client
          .from("adhdice_clean_tasks")
          .select("*")
          .eq("user_id", userId)
          .neq("status", "archived")
          .order("status", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false }),
        client
          .from("adhdice_task_subtasks")
          .select("*")
          .eq("user_id", userId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        client
          .from("adhdice_task_history")
          .select("*")
          .eq("user_id", userId)
          .order("entry_date", { ascending: false })
          .order("created_at", { ascending: false }),
        client
          .from("adhdice_user_profiles")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
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
          .from("adhdice_task_grid_layouts")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      if (!isActive) {
        return;
      }

      const errors = [
        taskResult.error,
        taskSubtasksResult.error,
        taskHistoryResult.error,
        profileResult.error,
        categoryResult.error,
        activeResult.error,
        historyResult.error,
        focusDayResult.error,
        gridLayoutResult.error,
      ].filter(Boolean);

      if (errors.length > 0) {
        setMessage({ tone: "warn", text: errors[0]?.message ?? "Could not load your workspace." });
        setIsWorkspaceLoading(false);
        return;
      }

      let nextCategories = mergeStoredFocusCategories((categoryResult.data ?? []).map(mapFocusCategoryRow));
      let nextActiveSessions = mapActiveSessions(activeResult.data ?? []);
      let nextFocusHistory = mergeStoredFocusHistory((historyResult.data ?? []).map(mapFocusSessionRow));
      let nextFocusedTaskIdsByDate = mapTaskFocusDayRows(focusDayResult.data ?? [], taskResult.data ?? []);
      const nextTaskGridLayout = resolveTaskGridLayout(gridLayoutResult.data);
      const nextTaskHistory = (taskHistoryResult.data ?? []).map(mapTaskHistoryRow);
      const nextTaskSubtasks = (taskSubtasksResult.data ?? []).map(mapTaskSubtaskRow);

      if (
        nextCategories.length === 0 &&
        Object.keys(nextActiveSessions).length === 0 &&
        nextFocusHistory.length === 0
      ) {
        const migrated = await migrateLocalFocusState(client, currentUser);

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

          if (!freshCategories.error && !freshActive.error && !freshHistory.error) {
            nextCategories = mergeStoredFocusCategories((freshCategories.data ?? []).map(mapFocusCategoryRow));
            nextActiveSessions = mapActiveSessions(freshActive.data ?? []);
            nextFocusHistory = mergeStoredFocusHistory((freshHistory.data ?? []).map(mapFocusSessionRow));
            setMessage({
              tone: "good",
              text: "Imported your saved local focus data into your account.",
            });
          }
        }
      }

      if (Object.keys(nextFocusedTaskIdsByDate).length === 0) {
        const migratedTaskFocusDays = await migrateLocalTaskFocusDays(client, currentUser);

        if (migratedTaskFocusDays) {
          const freshFocusDays = await client
            .from("adhdice_task_focus_days")
            .select("*")
            .eq("user_id", userId)
            .order("focus_date", { ascending: false });

          if (!freshFocusDays.error) {
            nextFocusedTaskIdsByDate = mapTaskFocusDayRows(freshFocusDays.data ?? [], taskResult.data ?? []);
            setMessage((prev) => prev ?? {
              tone: "good",
              text: "Imported your saved Focus Today selections into your account.",
            });
          }
        }
      }

      setTasks(taskResult.data ?? []);
      setFocusCategories(nextCategories);
      setActiveSessions(nextActiveSessions);
      setFocusHistory(nextFocusHistory);
      setFocusedTaskIdsByDate(nextFocusedTaskIdsByDate);
      setTaskHistory(nextTaskHistory);
      setTaskSubtasks(nextTaskSubtasks);
      setTaskGridLayout(nextTaskGridLayout);
      saveFocusCategories(nextCategories);
      saveFocusHistory(nextFocusHistory);
      saveProfile(buildProfileSnapshot(profileResult.data, currentUser));
      if (profileResult.data) {
        setEconomy({
          level: profileResult.data.level ?? 1,
          xp: profileResult.data.xp ?? 0,
          points: profileResult.data.points ?? 0,
          tokens: profileResult.data.tokens ?? 0,
        });
      }
      setIsWorkspaceLoading(false);
    }

    void loadWorkspaceData();

    const workspaceChannel = client
      .channel(`adhdice_workspace:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_clean_tasks",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadWorkspaceData({ silent: true });
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
          void loadWorkspaceData({ silent: true });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_task_subtasks",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadWorkspaceData({ silent: true });
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
            void loadWorkspaceData({ silent: true });
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
          void loadWorkspaceData({ silent: true });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_focus_sessions",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadWorkspaceData({ silent: true });
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
          void loadWorkspaceData({ silent: true });
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
          void loadWorkspaceData({ silent: true });
        },
      )
      .subscribe();

    return () => {
      isActive = false;
      client.removeChannel(workspaceChannel);
    };
  }, [session?.user, supabase]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setTaskUiState(DEFAULT_TASK_UI_STATE);
      setFocusedTaskIdsByDate({});
      setTaskHistory([]);
      setTaskSubtasks([]);
      setTaskGridLayout(TASK_GRID_STARTER_LAYOUT);
      setIsGridEditMode(false);
      setSelectedGridWidgetId(null);
      return;
    }

    const storedTaskUiState = parseStoredJson<TaskUiState>(
      getUserScopedStorageKey(TASK_UI_STORAGE_KEY, userId),
      DEFAULT_TASK_UI_STATE,
    );

    setTaskUiState({
      ...DEFAULT_TASK_UI_STATE,
      ...migrateLegacyTaskUiState(storedTaskUiState),
    });
    setFocusedTaskIdsByDate(
      parseStoredJson<Record<string, string[]>>(getUserScopedStorageKey(TASK_FOCUS_STORAGE_KEY, userId), {}),
    );
    setTaskGridLayout(
      normalizeTaskGridLayout(
        parseStoredJson<TaskGridItem[]>(getUserScopedStorageKey(TASK_GRID_STORAGE_KEY, userId), TASK_GRID_STARTER_LAYOUT),
      ),
    );
    setListCardLayouts(
      parseStoredJson<ListCardLayout[]>(getUserScopedStorageKey(LIST_CARD_STORAGE_KEY, userId), LIST_DEFAULT_CARD_LAYOUTS),
    );
  }, [session?.user?.id]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      getUserScopedStorageKey(TASK_UI_STORAGE_KEY, userId),
      JSON.stringify(taskUiState),
    );
  }, [session?.user?.id, taskUiState]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      getUserScopedStorageKey(TASK_FOCUS_STORAGE_KEY, userId),
      JSON.stringify(focusedTaskIdsByDate),
    );
  }, [focusedTaskIdsByDate, session?.user?.id]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      getUserScopedStorageKey(TASK_GRID_STORAGE_KEY, userId),
      JSON.stringify(taskGridLayout),
    );
  }, [session?.user?.id, taskGridLayout]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      getUserScopedStorageKey(LIST_CARD_STORAGE_KEY, userId),
      JSON.stringify(listCardLayouts),
    );
  }, [listCardLayouts, session?.user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 720);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (selectedGridWidgetId && !taskGridLayout.some((item) => item.id === selectedGridWidgetId)) {
      setSelectedGridWidgetId(null);
    }
  }, [selectedGridWidgetId, taskGridLayout]);

  useEffect(() => {
    if (taskEditorTaskId && !tasks.some((task) => task.id === taskEditorTaskId)) {
      setTaskEditorTaskId(null);
      setIsTaskEditorOpen(false);
    }
  }, [taskEditorTaskId, tasks]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("adhdice-day-start-time", dayStartTime);
    }
  }, [dayStartTime]);

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

  useEffect(() => {
    if (!supabase || !session?.user) return;
    const userId = session.user.id;

    async function runDayReset() {
      const now = new Date();
      const [startHour, startMinute] = dayStartTime.split(":").map(Number);
      const dayStart = new Date(now);
      dayStart.setHours(startHour, startMinute, 0, 0);
      // Logical "today" starts at dayStartTime; if before that, it's still yesterday's day
      const effectiveDate = now >= dayStart ? formatDateKey(now) : formatDateKey(new Date(now.getTime() - 86400000));

      if (lastResetDateRef.current === effectiveDate) return;
      lastResetDateRef.current = effectiveDate;
      window.localStorage.setItem(DAY_RESET_STORAGE_KEY, effectiveDate);

      const { data, error } = await supabase!
        .from("adhdice_clean_tasks")
        .update({ status: "pending" })
        .eq("user_id", userId)
        .eq("status", "upcoming")
        .lte("due_on", effectiveDate)
        .select("*");

      if (!error && data && data.length > 0) {
        setTasks((current) =>
          sortTasksForUi(current.map((t) => {
            const updated = data.find((d) => d.id === t.id);
            return updated ?? t;
          })),
        );
      }
    }

    void runDayReset();
    const interval = setInterval(() => { void runDayReset(); }, 60_000);
    return () => clearInterval(interval);
  }, [session?.user?.id, dayStartTime, supabase]);

  const taskSubtasksByTaskId = useMemo(() => groupTaskSubtasksByTaskId(taskSubtasks), [taskSubtasks]);
  const taskHistoryStats = useMemo(() => computeTaskHistoryStats(taskHistory), [taskHistory]);


  if (!supabase) {
    return <ConfigSplash />;
  }

  if (loading) {
    return <LoadingSplash status="Opening ADHDice..." />;
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

  const client = supabase;
  const currentUser = session.user;
  const todayKey = getTodayKey();
  const focusedTaskIds = focusedTaskIdsByDate[todayKey] ?? [];

  const activeTasks = tasks.filter(isTaskOpen);
  const doneTasks = tasks.filter(isTaskFinished);
  const overdueTasks = activeTasks.filter((task) => isOverdue(task.due_on));
  const todayTasks = activeTasks.filter((task) => isDueToday(task.due_on));
  const highPriorityTasks = activeTasks.filter(isTaskUrgent);
  const lowEnergyTasks = activeTasks.filter((task) => task.energy === "low").slice(0, 4);
  const focusedTasks = activeTasks.filter((task) => focusedTaskIds.includes(task.id));
  const urgentTasks = [...overdueTasks, ...highPriorityTasks.filter((task) => !isOverdue(task.due_on))]
    .slice(0, 6);
  const searchQuery = taskUiState.search.trim().toLowerCase();
  const filteredTasks = tasks.filter((task) => {
    const subtaskTitles = (taskSubtasksByTaskId[task.id] ?? []).map((subtask) => subtask.title);
    const haystacks = [
      task.title,
      task.notes ?? "",
      task.external_link_label ?? "",
      ...subtaskTitles,
      ...(task.tags ?? []),
    ].map((value) => value.toLowerCase());
    const matchesSearch = searchQuery.length === 0 || haystacks.some((value) => value.includes(searchQuery));
    if (!matchesSearch) {
      return false;
    }

    const quickChecks = taskUiState.quickFilters.map((filter) => matchesTaskQuickFilter(task, filter, focusedTaskIds));
    const matchesQuickFilters = quickChecks.length === 0
      ? true
      : taskUiState.matchAny
        ? quickChecks.some(Boolean)
        : quickChecks.every(Boolean);
    const matchesEnergy = taskUiState.energyFilters.length === 0 || taskUiState.energyFilters.includes(task.energy);
    return matchesQuickFilters && matchesEnergy;
  });
  const filteredActiveTasks = filteredTasks.filter(isTaskOpen);
  const filteredDoneTasks = filteredTasks.filter(isTaskFinished);
  const filteredUrgentTasks = filteredActiveTasks.filter(isTaskUrgent);
  const filteredFocusTasks = filteredActiveTasks.filter((task) => focusedTaskIds.includes(task.id));
  const filteredLowEnergyTasks = filteredActiveTasks.filter((task) => task.energy === "low").slice(0, 4);
  const filteredTodayTasks = filteredActiveTasks.filter((task) => isDueToday(task.due_on));
  const hasFocusedToday = focusedTaskIds.length > 0;
  const momentumPercent = activeTasks.length === 0
    ? 0
    : Math.min(100, Math.round((doneTasks.length / (doneTasks.length + activeTasks.length)) * 100));
  const momentumMetric = getMomentumMetric({
    doneTasks,
    focusedTaskIds,
    tasks,
    todayTasks,
    urgentTasks,
  }, momentumView);
  const selectedGridWidget = taskGridLayout.find((item) => item.id === selectedGridWidgetId) ?? null;
  const missingGridWidgetTypes = getMissingTaskGridWidgetTypes(taskGridLayout);
  const selectedTaskForEditor = taskEditorTaskId
    ? tasks.find((task) => task.id === taskEditorTaskId) ?? null
    : null;

  function openNewTaskEditor() {
    setTaskEditorMode("create");
    setTaskEditorTaskId(null);
    setIsTaskEditorOpen(true);
  }

  function openEditTaskEditor(task: Task) {
    setTaskEditorMode("edit");
    setTaskEditorTaskId(task.id);
    setIsTaskEditorOpen(true);
  }

  function closeTaskEditor() {
    setIsTaskEditorOpen(false);
    setTaskEditorTaskId(null);
  }

  async function saveFocusSelection(nextTaskIds: string[], validTaskIds: Set<string> | Task[] = tasks) {
    const normalizedTaskIds = normalizeTaskFocusIds(nextTaskIds, validTaskIds);

    setFocusedTaskIdsByDate((prev) => updateFocusedTaskIdsByDate(prev, todayKey, normalizedTaskIds));

    if (normalizedTaskIds.length === 0) {
      const { error } = await client
        .from("adhdice_task_focus_days")
        .delete()
        .eq("user_id", currentUser.id)
        .eq("focus_date", todayKey);

      if (error) {
        setMessage({ tone: "warn", text: error.message });
      }

      return;
    }

    const { error } = await client
      .from("adhdice_task_focus_days")
      .upsert(
        {
          user_id: currentUser.id,
          focus_date: todayKey,
          task_ids: normalizedTaskIds,
        },
        { onConflict: "user_id,focus_date" },
      );

    if (error) {
      setMessage({ tone: "warn", text: error.message });
    }
  }

  async function saveTaskGridLayout(nextLayout: TaskGridItem[]) {
    const normalizedLayout = normalizeTaskGridLayout(nextLayout);
    setTaskGridLayout(normalizedLayout);

    const { error } = await client
      .from("adhdice_task_grid_layouts")
      .upsert({
        user_id: currentUser.id,
        layout_json: JSON.stringify(normalizedLayout),
      });

    if (error) {
      setMessage({ tone: "warn", text: error.message });
    }
  }

  async function updateGridLayout(updater: (current: TaskGridItem[]) => TaskGridItem[]) {
    const nextLayout = updater(taskGridLayout);
    await saveTaskGridLayout(nextLayout);
  }

  async function handleResizeGridWidget(widgetId: string, nextWidth: number, nextHeight: number) {
    await updateGridLayout((current) => current.map((item) =>
      item.id === widgetId
        ? {
            ...item,
            h: nextHeight,
            w: Math.max(1, Math.min(TASK_GRID_MAX_COLUMNS, nextWidth)),
          }
        : item
    ));
  }

  async function handleMoveGridWidget(widgetId: string, direction: "up" | "down") {
    await updateGridLayout((current) => moveTaskGridItem(current, widgetId, direction));
  }

  async function handleDropGridWidget(targetWidgetId: string) {
    if (!draggedGridWidgetId || draggedGridWidgetId === targetWidgetId) {
      return;
    }

    const draggedId = draggedGridWidgetId;
    setDraggedGridWidgetId(null);
    await updateGridLayout((current) => reorderTaskGridItems(current, draggedId, targetWidgetId));
  }

  async function handleRemoveGridWidget(widgetId: string) {
    setSelectedGridWidgetId((current) => (current === widgetId ? null : current));
    await updateGridLayout((current) => current.filter((item) => item.id !== widgetId));
  }

  async function handleAddGridWidget(widgetType: TaskGridWidgetType) {
    if (taskGridLayout.some((item) => item.type === widgetType)) {
      return;
    }

    const nextWidget = buildTaskGridWidget(widgetType);
    setSelectedGridWidgetId(nextWidget.id);
    await updateGridLayout((current) => [...current, nextWidget]);
  }

  async function handleResetGridLayout() {
    setSelectedGridWidgetId(null);
    setDraggedGridWidgetId(null);
    await saveTaskGridLayout(TASK_GRID_STARTER_LAYOUT);
  }

  function openFocusPlanner() {
    setFocusPlannerStep(0);
    setFocusDraftIds(focusedTaskIds);
    setShowFocusPlanner(true);
  }

  function scrollToTaskElement(elementId: string) {
    if (typeof document === "undefined") {
      return;
    }
    document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function addTask(task: TaskDraft) {
    const payload = {
      ...task,
      user_id: currentUser.id,
      sort_order: Date.now(),
    };
    const { data, error } = await client
      .from("adhdice_clean_tasks")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return;
    }

    if (data) {
      setTasks((current) => sortTasksForUi([...current, data]));
    }

    setMessage({ tone: "good", text: "Task captured." });
  }

  async function replaceTaskSubtasks(taskId: string, subtasks: TaskSubtaskDraft[]) {
    const { error: deleteError } = await client
      .from("adhdice_task_subtasks")
      .delete()
      .eq("task_id", taskId)
      .eq("user_id", currentUser.id);

    if (deleteError) {
      setMessage({ tone: "warn", text: deleteError.message });
      return false;
    }

    const counter = { n: 0 };
    function flattenRecursive(items: TaskSubtaskDraft[], parentId: string | null): TaskSubtaskInsert[] {
      const result: TaskSubtaskInsert[] = [];
      for (const item of items) {
        const trimmed = item.title.trim();
        if (!trimmed) continue;
        const id = isUuid(item.id) ? item.id : crypto.randomUUID();
        result.push({ id, task_id: taskId, user_id: currentUser.id, title: trimmed, status: item.status, sort_order: counter.n++, parent_subtask_id: parentId });
        result.push(...flattenRecursive(item.children, id));
      }
      return result;
    }
    const cleanedSubtasks = flattenRecursive(subtasks, null);

    if (cleanedSubtasks.length === 0) {
      setTaskSubtasks((current) => current.filter((subtask) => subtask.task_id !== taskId));
      return true;
    }

    const { data, error } = await client
      .from("adhdice_task_subtasks")
      .insert(cleanedSubtasks)
      .select("*");

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    const mappedSubtasks = (data ?? []).map(mapTaskSubtaskRow);
    setTaskSubtasks((current) => [
      ...current.filter((subtask) => subtask.task_id !== taskId),
      ...mappedSubtasks,
    ]);
    return true;
  }

  async function saveTaskEditor(values: TaskDraft, options?: { taskId?: string | null; focusToday?: boolean; subtasks?: TaskSubtaskDraft[] }) {
    const focusToday = options?.focusToday ?? false;
    const taskId = options?.taskId ?? null;
    const subtasks = options?.subtasks ?? [];
    const isEditing = Boolean(taskId);

    if (isEditing && taskId) {
      const { id: _id, ...updateValues } = values;
      const { data, error } = await client
        .from("adhdice_clean_tasks")
        .update(updateValues)
        .eq("id", taskId)
        .select("*")
        .single();

      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }

      if (data) {
        setTasks((current) => sortTasksForUi(current.map((task) => task.id === taskId ? data : task)));
      }

      const historySaved = await syncTaskHistoryEntry(taskId, data.status);
      if (!historySaved) {
        return false;
      }

      const subtasksSaved = await replaceTaskSubtasks(taskId, subtasks);
      if (!subtasksSaved) {
        return false;
      }

      const nextFocusIds = focusToday
        ? Array.from(new Set([...focusedTaskIds, taskId]))
        : focusedTaskIds.filter((id) => id !== taskId);
      await saveFocusSelection(nextFocusIds);
      setMessage({ tone: "good", text: "Task updated." });
      return true;
    }

    const payload = {
      ...values,
      user_id: currentUser.id,
      sort_order: Date.now(),
    };
    const { data, error } = await client
      .from("adhdice_clean_tasks")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    if (data) {
      setTasks((current) => sortTasksForUi([...current, data]));
    }

    if (!data?.id) {
      setMessage({ tone: "warn", text: "Task saved, but the new task id was missing." });
      return false;
    }

    const historySaved = await syncTaskHistoryEntry(data.id, data.status);
    if (!historySaved) {
      return false;
    }

    const subtasksSaved = await replaceTaskSubtasks(data.id, subtasks);
    if (!subtasksSaved) {
      return false;
    }

    if (focusToday) {
      await saveFocusSelection(
        Array.from(new Set([...focusedTaskIds, data.id])),
        new Set([...tasks.map((currentTask) => currentTask.id), data.id]),
      );
    }

    setMessage({ tone: "good", text: "Task saved." });
    return true;
  }

  async function importTasks(lines: string[]) {
    if (lines.length === 0) {
      return;
    }

    const payload = lines.map((title, index) => ({
      title,
      user_id: currentUser.id,
      sort_order: Date.now() + index,
    }));

    const { data, error } = await client
      .from("adhdice_clean_tasks")
      .insert(payload)
      .select("*");

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return;
    }

    if (data) {
      setTasks((current) => sortTasksForUi([...current, ...data]));
    }

    setMessage({ tone: "good", text: `${lines.length} task${lines.length === 1 ? "" : "s"} imported.` });
  }

  async function resetTaskSubtasksToPending(taskId: string) {
    const { data, error } = await client
      .from("adhdice_task_subtasks")
      .update({ status: "pending" })
      .eq("task_id", taskId)
      .eq("user_id", currentUser.id)
      .select("*");

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    const mappedSubtasks = (data ?? []).map(mapTaskSubtaskRow);
    setTaskSubtasks((current) => [
      ...current.filter((subtask) => subtask.task_id !== taskId),
      ...mappedSubtasks,
    ]);
    return true;
  }

  async function syncTaskHistoryEntry(taskId: string, status: TaskStatus, entryDate = todayKey) {
    const shouldKeepEntry = isTaskHistoryStatus(status);

    if (!shouldKeepEntry) {
      const { error } = await client
        .from("adhdice_task_history")
        .delete()
        .eq("task_id", taskId)
        .eq("user_id", currentUser.id)
        .eq("entry_date", entryDate);

      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return false;
      }

      setTaskHistory((current) => current.filter((entry) =>
        !(entry.task_id === taskId && entry.entry_date === entryDate),
      ));
      return true;
    }

    const payload: TaskHistoryInsert = {
      entry_date: entryDate,
      status,
      task_id: taskId,
      user_id: currentUser.id,
      was_completed: isTaskCompletedForHistory(status),
    };
    const { data, error } = await client
      .from("adhdice_task_history")
      .upsert(payload, { onConflict: "user_id,task_id,entry_date" })
      .select("*")
      .single();

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    if (data) {
      const mappedEntry = mapTaskHistoryRow(data);
      setTaskHistory((current) => [
        mappedEntry,
        ...current.filter((entry) =>
          !(entry.task_id === mappedEntry.task_id && entry.entry_date === mappedEntry.entry_date),
        ),
      ]);
    }

    return true;
  }

  async function updateTask(taskId: string, values: TaskUpdate) {
    const { data, error } = await client
      .from("adhdice_clean_tasks")
      .update(values)
      .eq("id", taskId)
      .select("*")
      .single();

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return;
    }

    if (data) {
      setTasks((current) => sortTasksForUi(current.map((task) => task.id === taskId ? data : task)));
      await syncTaskHistoryEntry(taskId, data.status);
      if (data.status === "done") {
        void appendEconomyEvent({
          source: "task",
          refId: taskId,
          taskId,
          eventType: "completed",
          points: 10,
          xp: 15,
          reason: `Completed task: ${data.title}`,
        });

        if (data.repeat_frequency !== "none") {
          const nextDue = calcNextDueDate(data);
          if (nextDue) {
            const { data: recurring, error: recurErr } = await client
              .from("adhdice_clean_tasks")
              .update({ status: "upcoming", due_on: nextDue, completed_at: null })
              .eq("id", taskId)
              .select("*")
              .single();
            if (!recurErr && recurring) {
              setTasks((current) => sortTasksForUi(current.map((t) => t.id === taskId ? recurring : t)));
            }
          }
        }
      }
    }
  }

  async function deleteTasks(taskIds: string[]) {
    const { error } = await client
      .from("adhdice_clean_tasks")
      .delete()
      .in("id", taskIds)
      .eq("user_id", currentUser.id);

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return;
    }

    setTasks((current) => current.filter((task) => !taskIds.includes(task.id)));
    setMessage({ tone: "good", text: `Deleted ${taskIds.length} task${taskIds.length === 1 ? "" : "s"}.` });
  }

  async function handleToggleTaskFromList(task: Task) {
    const reopening = isTaskFinished(task);
    await updateTask(task.id, {
      completed_at: reopening ? null : new Date().toISOString(),
      status: reopening ? "pending" : "done",
    });

    if (reopening && task.subtasks_auto_reset) {
      await resetTaskSubtasksToPending(task.id);
    }
  }


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

  return (
    <main
      data-theme={theme}
      data-lowstim={lowStim ? "" : undefined}
      className="min-h-screen px-3 py-4 transition-colors sm:px-5 lg:px-8 xl:px-10 bg-[linear-gradient(180deg,#ffffff_0%,#faf8ff_100%)] text-[#182033] dark:bg-[linear-gradient(180deg,#0d0c17_0%,#141124_100%)] dark:text-white"
    >
      <section className="mx-auto w-full max-w-[110rem] pb-28">
        {isAccountOpen ? (
          <AccountModal
            onClose={() => setIsAccountOpen(false)}
            onSave={handleSaveProfile}
            onSignOut={() => void client.auth.signOut()}
            profile={profile}
          />
        ) : null}
        <TopHeader
          doneCount={doneTasks.length}
          economy={economy}
          onOpenAccount={() => setIsAccountOpen(true)}
          profile={profile}
          theme={theme}
          onThemeChange={setTheme}
          lowStim={lowStim}
          onLowStimChange={setLowStim}
          currentStreak={taskHistoryStats.currentStreak}
        />

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

        {activePage === "Home" ? (
          <HomePage
            activeCount={activeTasks.length}
            doneCount={doneTasks.length}
            lowEnergyTasks={lowEnergyTasks}
            momentumPercent={momentumPercent}
            overdueCount={overdueTasks.length}
            setActivePage={setActivePage}
            todayCount={todayTasks.length}
            urgentTasks={urgentTasks}
          />
        ) : activePage === "Tasks" ? (
          <>
            {showFocusPlanner ? (
              <FocusPlannerModal
                draftIds={focusDraftIds}
                onClose={() => setShowFocusPlanner(false)}
                onFinish={() => {
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
                }}
                onSetDraftIds={setFocusDraftIds}
                onStepChange={setFocusPlannerStep}
                step={focusPlannerStep}
                tasks={activeTasks}
              />
            ) : null}
            {isTaskEditorOpen ? (
              <TaskEditorModal
                allTags={[...new Set(tasks.flatMap((t) => t.tags ?? []))].sort()}
                focusedToday={focusedTaskIds}
                mode={taskEditorMode}
                onClose={closeTaskEditor}
                onOpenHistory={selectedTaskForEditor ? () => setTaskHistoryModalTaskId(selectedTaskForEditor.id) : undefined}
                onSave={async (draft) => {
                  const success = await saveTaskEditor(draft.values, {
                    focusToday: draft.focusToday,
                    subtasks: draft.subtasks,
                    taskId: selectedTaskForEditor?.id ?? null,
                  });

                  if (success) {
                    closeTaskEditor();
                  }
                }}
                subtasks={selectedTaskForEditor ? taskSubtasksByTaskId[selectedTaskForEditor.id] ?? [] : []}
                task={selectedTaskForEditor}
              />
            ) : null}
            {taskHistoryModalTaskId ? (
              <TaskHistoryModal
                onClose={() => setTaskHistoryModalTaskId(null)}
                taskHistory={taskHistory.filter((h) => h.task_id === taskHistoryModalTaskId)}
                taskTitle={tasks.find((t) => t.id === taskHistoryModalTaskId)?.title ?? ""}
              />
            ) : null}
            {isMomentumListOpen ? (
              <MomentumTaskModal
                doneTasks={momentumMetric.doneTasks}
                onClose={() => setIsMomentumListOpen(false)}
                remainingTasks={momentumMetric.remainingTasks}
                title={momentumMetric.label}
              />
            ) : null}
            <TaskHero
              actionLabel={hasFocusedToday ? "Refocus" : "Focus"}
              activeCount={activeTasks.length}
              metric={momentumMetric}
              onCycleMomentum={() => setMomentumView(getNextMomentumView(momentumView))}
              onOpenFocusPlanner={openFocusPlanner}
              onOpenMomentumDetails={() => setIsMomentumListOpen(true)}
              todayCount={todayTasks.length}
            />

            <div className="mt-6">
              <ControlBar
                onOpenComposer={openNewTaskEditor}
                onOpenImport={() => scrollToTaskElement("task-import-panel")}
                onSearchChange={(search) => setTaskUiState((prev) => ({ ...prev, search }))}
                onViewChange={(view) => setTaskUiState((prev) => ({ ...prev, view }))}
                search={taskUiState.search}
                view={taskUiState.view}
              />
              <FilterRows
                activeCount={activeTasks.length}
                doneCount={doneTasks.length}
                focusedCount={focusedTasks.length}
                matchAny={taskUiState.matchAny}
                onToggleEnergy={(energy) =>
                  setTaskUiState((prev) => ({
                    ...prev,
                    energyFilters: prev.energyFilters.includes(energy)
                      ? prev.energyFilters.filter((value) => value !== energy)
                      : [...prev.energyFilters, energy],
                  }))
                }
                onToggleMatchMode={() => setTaskUiState((prev) => ({ ...prev, matchAny: !prev.matchAny }))}
                onToggleQuickFilter={(filter) =>
                  setTaskUiState((prev) => ({
                    ...prev,
                    quickFilters: prev.quickFilters.includes(filter)
                      ? prev.quickFilters.filter((value) => value !== filter)
                      : [...prev.quickFilters, filter],
                  }))
                }
                overdueCount={overdueTasks.length}
                selectedEnergies={taskUiState.energyFilters}
                selectedQuickFilters={taskUiState.quickFilters}
                todayCount={todayTasks.length}
              />
            </div>

            {taskUiState.view === "grid" ? (
              <TaskGridView
                activeCount={filteredActiveTasks.length}
                currentColumns={gridColumns}
                doneCount={filteredDoneTasks.length}
                draggedWidgetId={draggedGridWidgetId}
                focusedTaskIds={focusedTaskIds}
                gridLayout={taskGridLayout}
                isEditMode={isGridEditMode}
                message={message}
                missingWidgetTypes={missingGridWidgetTypes}
                onAddTask={addTask}
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
                onEditTask={openEditTaskEditor}
                onSelectWidget={setSelectedGridWidgetId}
                onSetDraggedWidget={setDraggedGridWidgetId}
                subtasksByTaskId={taskSubtasksByTaskId}
                taskHistoryStats={taskHistoryStats}
                onToggleEditMode={() => {
                  setIsGridEditMode((prev) => !prev);
                  setSelectedGridWidgetId(null);
                  setDraggedGridWidgetId(null);
                }}
                onToggleTask={(task) =>
                  updateTask(task.id, {
                    status: "done",
                    completed_at: new Date().toISOString(),
                  })
                }
                overdueCount={filteredUrgentTasks.length}
                selectedWidget={selectedGridWidget}
                tasksByWidget={{
                  activeQueue: filteredActiveTasks,
                  completed: filteredDoneTasks,
                  dueToday: filteredTodayTasks,
                  focusToday: filteredFocusTasks,
                  urgent: filteredUrgentTasks,
                }}
              />
            ) : taskUiState.view === "matrix" ? (
              <TaskMatrixView
                onEditTask={openEditTaskEditor}
                subtasksByTaskId={taskSubtasksByTaskId}
                onToggle={(task) =>
                  updateTask(task.id, {
                    status: "done",
                    completed_at: new Date().toISOString(),
                  })
                }
                tasks={filteredActiveTasks}
              />
            ) : taskUiState.view === "cards" ? (
              <TaskCardGallery
                focusedTaskIds={focusedTaskIds}
                onEditTask={openEditTaskEditor}
                subtasksByTaskId={taskSubtasksByTaskId}
                onToggle={(task) =>
                  updateTask(task.id, {
                    status: "done",
                    completed_at: new Date().toISOString(),
                  })
                }
                tasks={filteredTasks}
              />
            ) : (
              <>
                <TaskListView
                  focusedTaskIds={focusedTaskIds}
                  onDelete={(taskIds) => { void deleteTasks(taskIds); }}
                  onEditTask={openEditTaskEditor}
                  onSetStatus={(task, status) => { void updateTask(task.id, { status }); }}
                  subtasksByTaskId={taskSubtasksByTaskId}
                  onToggle={(task) => {
                    void handleToggleTaskFromList(task);
                  }}
                  tasks={filteredTasks}
                />
                <div className="mt-6">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      {isListLayoutEditMode ? (
                        <>
                          <span className={`rounded-full px-3 py-2 text-xs font-semibold bg-[#f3efff] text-[#6f57f6] dark:bg-[#221a42] dark:text-[#cabfff]`}>
                            {listCardLayouts.length} cards
                          </span>
                        </>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      {isListLayoutEditMode ? (
                        <button
                          className={`rounded-full px-4 py-2 text-sm font-semibold bg-white text-[#5c647d] shadow-[0_4px_12px_rgba(81,61,168,0.08)] dark:bg-white/8 dark:text-white/75`}
                          onClick={() => { setListCardLayouts(LIST_DEFAULT_CARD_LAYOUTS); setActiveListCardId(null); }}
                          type="button"
                        >
                          Reset Layout
                        </button>
                      ) : null}
                      <button
                        className={`rounded-full px-4 py-2 text-sm font-semibold ${isListLayoutEditMode
                          ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]"
                          : "bg-[#f3efff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]"}`}
                        onClick={() => { setIsListLayoutEditMode((p) => !p); setActiveListCardId(null); }}
                        type="button"
                      >
                        {isListLayoutEditMode ? "Done Editing" : "Edit Layout"}
                      </button>
                    </div>
                  </div>

                  {isListLayoutEditMode ? (
                    <div className={`mt-3 rounded-[1.25rem] border border-dashed px-4 py-4 text-sm border-[#ddd6f9] bg-[#faf8ff] text-[#7b84a0] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55`}>
                      {activeListCardId
                        ? `${LIST_CARD_LABELS[activeListCardId]} is selected. Resize controls appear on the card below.`
                        : "Tap any card below to select it, then resize or reorder it."}
                    </div>
                  ) : null}

                  <div className="mt-4 grid grid-cols-4 gap-5">
                    {listCardLayouts.map((cardLayout) => {
                      const isActive = activeListCardId === cardLayout.id;
                      const isDragging = draggedListCardId === cardLayout.id;
                      if (cardLayout.id === "urgent" && filteredUrgentTasks.length === 0 && !isListLayoutEditMode) {
                        return null;
                      }
                      return (
                        <div
                          className={`relative min-w-0 ${isListLayoutEditMode ? "cursor-grab" : ""} ${isDragging ? "opacity-60" : ""}`}
                          draggable={isListLayoutEditMode}
                          key={cardLayout.id}
                          onClick={() => { if (isListLayoutEditMode && !isActive) setActiveListCardId(cardLayout.id); }}
                          onDragEnd={() => setDraggedListCardId(null)}
                          onDragOver={(e) => { if (isListLayoutEditMode) e.preventDefault(); }}
                          onDragStart={() => setDraggedListCardId(cardLayout.id)}
                          onDrop={(e) => {
                            if (!isListLayoutEditMode || !draggedListCardId || draggedListCardId === cardLayout.id) return;
                            e.preventDefault();
                            setListCardLayouts((prev) => {
                              const next = [...prev];
                              const fromIdx = next.findIndex((c) => c.id === draggedListCardId);
                              const toIdx = next.findIndex((c) => c.id === cardLayout.id);
                              if (fromIdx === -1 || toIdx === -1) return prev;
                              const [removed] = next.splice(fromIdx, 1);
                              next.splice(toIdx, 0, removed);
                              return next;
                            });
                            setDraggedListCardId(null);
                          }}
                          style={{ gridColumn: `span ${Math.min(cardLayout.colSpan, LIST_MAX_COLUMNS)}`, minHeight: cardLayout.minHeight }}
                        >
                          {isListLayoutEditMode ? (
                            <div className={`pointer-events-none absolute inset-0 z-10 rounded-[2rem] border-2 ${isActive
                              ? "border-[#6f57f6] shadow-[0_0_0_4px_rgba(111,87,246,0.16)] dark:border-[#cabfff] dark:shadow-[0_0_0_4px_rgba(202,191,255,0.12)]"
                              : "border-[#dcd2ff] dark:border-white/15"}`} />
                          ) : null}
                          {isListLayoutEditMode ? (
                            <div className={`absolute left-4 top-4 z-20 rounded-full px-3 py-1 text-xs font-semibold bg-white text-[#6f57f6] shadow-[0_10px_24px_rgba(81,61,168,0.12)] dark:bg-[#171328] dark:text-[#cabfff]`}>
                              <GripVertical className="mr-1 inline h-3.5 w-3.5" />
                              {LIST_CARD_LABELS[cardLayout.id]}
                            </div>
                          ) : null}
                          <div className={`h-full min-h-0 overflow-hidden ${isListLayoutEditMode ? "pointer-events-none" : ""}`}>
                            <div className={`h-full min-h-0 overflow-y-auto ${isListLayoutEditMode && isActive ? "pb-64" : ""}`}>
                              {cardLayout.id === "composer" ? (
                                <div className="h-full" id="task-composer-card">
                                  <TaskComposerCard onAdd={addTask} />
                                </div>
                              ) : cardLayout.id === "import" ? (
                                <div className="h-full" id="task-import-panel">
                                  <ImportWidgetCard message={message} onImport={importTasks} />
                                </div>
                              ) : cardLayout.id === "focus-today" ? (
                                <TaskLane count={filteredFocusTasks.length} defaultExpanded onEditTask={openEditTaskEditor} subtasksByTaskId={taskSubtasksByTaskId} title="Focus Today" tasks={filteredFocusTasks} tone="purple" />
                              ) : cardLayout.id === "due-today" ? (
                                <TaskLane count={filteredTodayTasks.length} onEditTask={openEditTaskEditor} subtasksByTaskId={taskSubtasksByTaskId} title="Due Today" tasks={filteredTodayTasks} tone="purple" />
                              ) : cardLayout.id === "stats" ? (
                                <FocusStatsCard activeCount={filteredActiveTasks.length} doneCount={filteredDoneTasks.length} overdueCount={filteredUrgentTasks.length} taskHistoryStats={taskHistoryStats} />
                              ) : cardLayout.id === "urgent" ? (
                                <UrgentTasksPanel focusedTaskIds={focusedTaskIds} onEditTask={openEditTaskEditor} subtasksByTaskId={taskSubtasksByTaskId} tasks={filteredUrgentTasks} onToggle={(task) => updateTask(task.id, { status: "done", completed_at: new Date().toISOString() })} />
                              ) : null}
                            </div>
                          </div>
                          {isListLayoutEditMode && isActive ? (
                            <ListCardResizeOverlay
                              layout={cardLayout}
                              onClose={() => setActiveListCardId(null)}
                              onResize={(colSpan, minHeight) => setListCardLayouts((prev) => prev.map((c) => c.id === cardLayout.id ? { ...c, colSpan, minHeight } : c))}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
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
        ) : activePage === "Roll" ? (
          <RollPage
            client={client}
            currentUser={currentUser}
            tasks={activeTasks}
            theme={theme}
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
          <StatsPage
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
            tasks={tasks}
          />
        ) : activePage === "Settings" ? (
          <SettingsPage
            dayStartTime={dayStartTime}
            onDayStartTimeChange={setDayStartTime}
            onThemeChange={setTheme}
            tasks={tasks}
            theme={theme}
            userId={currentUser.id}
            lowStim={lowStim}
            onLowStimChange={setLowStim}
          />
        ) : activePage === "Games" ? (
          <ErrorBoundary fallback={<div className="flex h-48 items-center justify-center opacity-40">Games failed to load.</div>}>
            <Suspense fallback={<div className="flex h-48 items-center justify-center opacity-40">Loading…</div>}>
              <GamesPage
                taskHistory={taskHistory}
                onAwardXP={(xp, reason) =>
                  void appendEconomyEvent({ source: "roll", refId: currentUser.id, points: 0, xp, reason })
                }
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <PagePlaceholder
            count={activeTasks.length}
            page={activePage}
            setActivePage={setActivePage}
          />
        )}
      </section>

      <BottomDock
        activePage={activePage}
        onNavigate={setActivePage}
      />
      {showBackToTop ? (
        <button
          aria-label="Back to top"
          className={`fixed right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full shadow-[0_18px_40px_rgba(81,61,168,0.24)] transition hover:-translate-y-0.5 sm:right-8 ${
            "bg-[linear-gradient(180deg,#7c63f7_0%,#664cf1_100%)] text-white dark:bg-[linear-gradient(180deg,#c9bbff_0%,#9b87ff_100%)] dark:text-[#171127]"
          }`}
          style={{ bottom: "calc(7rem + env(safe-area-inset-bottom))" }}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          type="button"
        >
          <ArrowUp className="h-6 w-6" />
        </button>
      ) : null}
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
            Create `.env.2.0.2` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then restart the app.
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

            <div className={`grid grid-cols-2 gap-2 rounded-[1rem] p-1 bg-[#f7f5ff] dark:bg-white/8`}>
              <button
                className={`rounded-[0.85rem] px-4 py-3 text-sm font-semibold ${mode === "sign-up"
                  ? "bg-white text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]"
                  : "text-[#7d88a1] dark:text-white/55"}`}
                onClick={() => setMode("sign-up")}
                type="button"
              >
                Create Account
              </button>
              <button
                className={`rounded-[0.85rem] px-4 py-3 text-sm font-semibold ${mode === "sign-in"
                  ? "bg-white text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]"
                  : "text-[#7d88a1] dark:text-white/55"}`}
                onClick={() => setMode("sign-in")}
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
  const className = message.tone === "warn"
    ? "border-[#ffd5dc] bg-[#fff2f4] text-[#9f364d] dark:border-[#4d2130] dark:bg-[#2a1620] dark:text-[#ffb1c0]"
    : message.tone === "good"
      ? "border-[#d7f5e9] bg-[#effcf6] text-[#0d8b60] dark:border-[#1f4d3d] dark:bg-[#11271f] dark:text-[#8ce8c0]"
      : "border-[#ece8f8] bg-white text-[#5f6983] dark:border-white/10 dark:bg-white/6 dark:text-white/70";

  return (
    <div className={`rounded-[1.25rem] border px-4 py-3 text-sm font-medium ${className}`}>
      {message.text}
    </div>
  );
}

function TopHeader({
  doneCount,
  economy,
  onOpenAccount,
  profile,
  theme,
  onThemeChange,
  lowStim,
  onLowStimChange,
  currentStreak,
}: {
  doneCount: number;
  economy: { level: number; xp: number; points: number; tokens: number };
  onOpenAccount: () => void;
  profile: UserProfile;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  lowStim: boolean;
  onLowStimChange: (v: boolean) => void;
  currentStreak: number;
}) {
  const accountButton = (
    <button
      className={`flex items-center gap-3 rounded-full px-2 py-2 bg-white shadow-[0_10px_30px_rgba(81,61,168,0.08)] dark:bg-white/10`}
      onClick={onOpenAccount}
      type="button"
    >
      <div className="text-right">
        <p className={`text-sm font-semibold text-[#202743] dark:text-white`}>
          {profile.displayName}
        </p>
        <p className={`text-xs text-[#8a84a3] dark:text-white/45`}>
          {profile.created ? "Account" : "Create account"}
        </p>
      </div>
      <div className="relative">
        <Image
          alt="Profile avatar"
          className="h-14 w-14 rounded-full object-cover ring-4 ring-white/70"
          height={56}
          src={profile.avatarSrc}
          unoptimized={profile.avatarSrc.startsWith("data:")}
          width={56}
        />
        <span className="absolute -right-0.5 -top-0.5 grid h-5 w-5 place-items-center rounded-full bg-[#f05566] text-[10px] font-semibold text-white">
          2
        </span>
      </div>
    </button>
  );

  return (
    <header
      className={`flex flex-col gap-3 border-b pb-5 lg:flex-row lg:items-center lg:justify-between ${
        "border-[#ece8f8] dark:border-white/10"
      }`}
    >
      {/* Row 1 (mobile): logo + account side by side */}
      <div className="flex items-center justify-between gap-4 lg:justify-start">
        <div className="flex items-center gap-1">
          <BrandMark profile={profile} />
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold bg-[#f1ecff] text-[#7f6af7] dark:bg-white/10 dark:text-[#c5b8ff]`}>
            v.2.0.2
          </span>
        </div>
        <div className="lg:hidden">{accountButton}</div>
      </div>

      {/* Row 2 (mobile): stats. On desktop these join row 1 on the right. */}
      <div className="flex flex-wrap items-center gap-3">
        <ThemeToggle theme={theme} onThemeChange={onThemeChange} lowStim={lowStim} onLowStimChange={onLowStimChange} />
        <ProgressStat
          label={`Lvl ${economy.level}`}
          value={`${economy.xp} / ${economy.level * 100} XP`}
          percent={(economy.xp / (economy.level * 100)) * 100}
        />
        <MiniStat label="Points" value={String(economy.points)} />
        <MiniStat label="Tokens" value={String(economy.tokens)} />
        {currentStreak > 0 && (
          <div className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold bg-[#fff3e0] text-[#d97706] dark:bg-[#3d2a00] dark:text-[#fbbf24]`}>
            🔥 {currentStreak}d
          </div>
        )}
        <div className="hidden lg:block">{accountButton}</div>
      </div>
    </header>
  );
}

function BrandMark({
  profile,
}: {
  profile: UserProfile;
}) {
  const [errored, setErrored] = useState(false);
  const logoSrc = (!errored && profile.logoSrc) || "/logo.png";

  return (
    <Image
      alt="ADHDice logo"
      className="h-20 w-auto object-contain object-left"
      height={80}
      onError={() => setErrored(true)}
      src={logoSrc}
      unoptimized={logoSrc.startsWith("data:")}
      width={272}
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
            className={`rounded-full px-4 py-2 text-sm font-semibold bg-[#f1ecff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`}
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
              className={`rounded-[1rem] px-5 py-3 text-base font-bold bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]`}
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
            className={`mt-2 w-full rounded-[1rem] px-5 py-3 text-sm font-semibold bg-[#fff1f2] text-[#d64b5f] dark:bg-[#351924] dark:text-[#ff9fbc]`}
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

function HomePage({
  activeCount,
  doneCount,
  lowEnergyTasks,
  momentumPercent,
  overdueCount,
  setActivePage,
  todayCount,
  urgentTasks,
}: {
  activeCount: number;
  doneCount: number;
  lowEnergyTasks: Task[];
  momentumPercent: number;
  overdueCount: number;
  setActivePage: (page: AppPage) => void;
  todayCount: number;
  urgentTasks: Task[];
}) {
  return (
    <>
      <section className="pt-8 flex flex-col items-center text-center">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8e88a9] dark:text-white/40`}>
          Home Dashboard
        </p>
        <h1 className={`mt-2 text-[clamp(2.4rem,5vw,4rem)] font-black tracking-tight text-[#17203a] dark:text-white`}>
          Your focus overview
        </h1>
        <p className={`mt-1 max-w-3xl text-base text-[#707a95] dark:text-white/55`}>
          Start here for momentum, urgent tasks, low-energy wins, and quick jumps into the rest of ADHDice.
        </p>
        <button
          className={`mt-6 rounded-[1.25rem] px-5 py-3 text-lg font-bold transition hover:-translate-y-0.5 bg-[#6f57f6] text-white shadow-[0_14px_32px_rgba(111,87,246,0.24)] dark:bg-[#cabfff] dark:text-[#1a1431]`}
          onClick={() => setActivePage("Tasks")}
          type="button"
        >
          Open Tasks
        </button>
      </section>

      <div className="mt-7 flex flex-wrap justify-center gap-5">
        <OverviewStatCard label="Urgent Momentum" value={`${momentumPercent}%`} detail={`${overdueCount} overdue`} />
        <OverviewStatCard label="Today Queue" value={String(todayCount)} detail="ready to work" />
        <OverviewStatCard label="Active Tasks" value={String(activeCount)} detail="current load" />
        <OverviewStatCard label="Completed" value={String(doneCount)} detail="closed loops" />
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-5">
        <DashboardJumpCard
          className=""
          cta="Go to Tasks"
          description="Refocus, urgent momentum, filters, and your active queue."
          onClick={() => setActivePage("Tasks")}
          title="Task Command"
        />
        <DashboardJumpCard
          className=""
          cta="Open Focus"
          description="Timer sessions, low-friction entry points, and calm starting rituals."
          onClick={() => setActivePage("Focus")}
          title="Focus Mode"
        />
        <DashboardJumpCard
          className=""
          cta="View Stats"
          description="Patterns, streaks, and reward loops without overwhelming density."
          onClick={() => setActivePage("Stats")}
          title="Progress"
        />
      </div>

      <div className="mt-5 flex flex-wrap justify-center items-start gap-5">
        <HomeUrgentPreview tasks={urgentTasks.slice(0, 3)} onClick={() => setActivePage("Tasks")} />
        <HomeLowEnergyPreview tasks={lowEnergyTasks} onClick={() => setActivePage("Tasks")} />
      </div>
    </>
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

function DashboardJumpCard({
  className = "",
  cta,
  description,
  onClick,
  title,
}: {
  className?: string;
  cta: string;
  description: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      className={`self-start w-fit rounded-[2rem] border px-5 py-3 flex flex-col items-center text-center transition hover:-translate-y-0.5 ${className} border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6`}
      onClick={onClick}
      type="button"
    >
      <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/35`}>Overview</p>
      <h2 className={`mt-1.5 text-2xl font-black text-[#26304c] dark:text-white`}>{title}</h2>
      <p className={`mt-1.5 max-w-[260px] text-sm leading-6 text-[#7a839e] dark:text-white/55`}>{description}</p>
      <span className={`mt-3 inline-flex rounded-full px-4 py-2 text-sm font-semibold bg-[#f1ecff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`}>
        {cta}
      </span>
    </button>
  );
}

function HomeUrgentPreview({
  onClick,
  tasks,
}: {
  onClick: () => void;
  tasks: Task[];
}) {
  return (
    <section className={`w-full sm:w-fit sm:min-w-[440px] rounded-[2rem] border p-4 transition hover:-translate-y-0.5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6`}>
      <div className="flex items-center justify-between gap-6">
        <h2 className={`text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white`}>
          Urgent Snapshot
        </h2>
        <button
          className={`min-w-[110px] rounded-full px-4 py-2 text-sm font-semibold transition bg-[#f1ecff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`}
          onClick={onClick}
          type="button"
        >
          Open Tasks
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {tasks.map((task) => (
          <div className={`max-w-[32rem] rounded-[1.2rem] border px-4 py-3 border-[#eee9fb] bg-[#fcfbff] dark:border-white/10 dark:bg-white/[0.04]`} key={task.id}>
            <p className={`text-lg font-semibold text-[#27304c] dark:text-white`}>{task.title}</p>
            <p className={`mt-1 text-sm text-[#7d88a1] dark:text-white/55`}>{formatDueLabel(task.due_on)} / {task.priority} priority</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HomeLowEnergyPreview({
  onClick,
  tasks,
}: {
  onClick: () => void;
  tasks: Task[];
}) {
  return (
    <section className={`w-full sm:w-fit sm:min-w-[440px] rounded-[2rem] border p-4 transition hover:-translate-y-0.5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6`}>
      <div className="flex items-center justify-between gap-6">
        <h2 className={`text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white`}>
          Low Energy Wins
        </h2>
        <button
          className={`min-w-[110px] rounded-full px-4 py-2 text-sm font-semibold transition bg-[#f1ecff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`}
          onClick={onClick}
          type="button"
        >
          Add Task
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {tasks.map((task) => (
          <div className={`max-w-[32rem] rounded-[1.2rem] border px-4 py-3 border-[#eee9fb] bg-[#fcfbff] dark:border-white/10 dark:bg-white/[0.04]`} key={task.id}>
            <p className={`text-base font-semibold text-[#26304c] dark:text-white`}>{task.title}</p>
            <p className={`mt-1 text-sm text-[#7d88a1] dark:text-white/55`}>{formatDueLabel(task.due_on)} / low effort</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Page shells ────────────────────────────────────────────────────────────

function PageShellHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="pt-8 pb-6">
      <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8e88a9] dark:text-white/40`}>
        {subtitle}
      </p>
      <h1 className={`mt-1 text-3xl font-black tracking-tight text-[#17203a] dark:text-white`}>
        {title}
      </h1>
    </div>
  );
}

type RollDifficulty = "easy" | "medium" | "hard";
type RollPhase = "idle" | "rolling" | "settling";

const DIFFICULTY_CONFIG: Record<RollDifficulty, { label: string; cost: number; numD20: number; layout: "d20" | "d20-d6" | "d20-d20-d6"; description: string }> = {
  easy: { label: "Easy", cost: 50, numD20: 1, layout: "d20", description: "1d20 · 50 pts" },
  medium: { label: "Medium", cost: 100, numD20: 2, layout: "d20-d6", description: "Best of 2d20 · 100 pts" },
  hard: { label: "Hard", cost: 150, numD20: 3, layout: "d20-d20-d6", description: "Best of 3d20 · 150 pts" },
};

const VAULT_TIER_CONFIG: Record<VaultPrizeTier, { label: string; defaultCost: number; emoji: string }> = {
  small: { label: "Small", defaultCost: 10, emoji: "🎁" },
  big: { label: "Big", defaultCost: 25, emoji: "🏆" },
  master: { label: "Master", defaultCost: 50, emoji: "👑" },
};

function RollPage({
  client,
  currentUser,
  tasks,
  theme,
  onSpendPoints,
}: {
  client: NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
  currentUser: User;
  tasks: Task[];
  theme: ThemeMode;
  onSpendPoints: (delta: number, reason: string) => void;
}) {
  const [points, setPoints] = useState<number | null>(null);
  const [tokens, setTokens] = useState<number | null>(null);
  const [cells, setCells] = useState<PrizeCell[]>([]);
  const [history, setHistory] = useState<RollHistoryEntry[]>([]);
  const [difficulty, setDifficulty] = useState<RollDifficulty>("easy");
  const [phase, setPhase] = useState<RollPhase>("idle");
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const [editingCell, setEditingCell] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  // Vault
  const [showVault, setShowVault] = useState(false);
  const [vaultPrizes, setVaultPrizes] = useState<VaultPrize[]>([]);
  // Prize manager
  const [showPrizeManager, setShowPrizeManager] = useState(false);
  const [pmTier, setPmTier] = useState<VaultPrizeTier>("small");
  const [pmEditId, setPmEditId] = useState<string | null>(null);
  const [pmName, setPmName] = useState("");
  const [pmCost, setPmCost] = useState("");
  const [pmBulk, setPmBulk] = useState("");

  const pendingResult = useRef<number | null>(null);
  const pendingCost = useRef<number>(0);

  useEffect(() => {
    void (async () => {
      const [profileRes, cellsRes, historyRes, vaultRes] = await Promise.all([
        client.from("adhdice_user_profiles").select("points, tokens").eq("user_id", currentUser.id).single(),
        client.from("adhdice_prize_board").select("*").eq("user_id", currentUser.id).order("cell_number"),
        client.from("adhdice_roll_history").select("*").eq("user_id", currentUser.id).order("rolled_at", { ascending: false }).limit(10),
        client.from("adhdice_vault_prizes").select("*").eq("user_id", currentUser.id).order("created_at"),
      ]);
      if (profileRes.data) { setPoints(profileRes.data.points); setTokens(profileRes.data.tokens ?? 0); }
      if (cellsRes.data) setCells(cellsRes.data);
      if (historyRes.data) setHistory(historyRes.data);
      if (vaultRes.data) setVaultPrizes(vaultRes.data as VaultPrize[]);
    })();
  }, [client, currentUser.id]);

  const cellMap = useMemo(() => {
    const map: Record<number, PrizeCell> = {};
    for (const c of cells) map[c.cell_number] = c;
    return map;
  }, [cells]);

  const cfg = DIFFICULTY_CONFIG[difficulty];
  const canRoll = points !== null && points >= cfg.cost && phase === "idle";

  function handleRoll() {
    if (!canRoll || points === null) return;
    const cost = cfg.cost;
    const rolls = Array.from({ length: cfg.numD20 }, () => Math.floor(Math.random() * 20) + 1);
    const result = Math.max(...rolls);
    pendingResult.current = result;
    pendingCost.current = cost;

    new Audio("/dice-roll.wav").play().catch(() => {});
    setPhase("rolling");
    setLastRoll(null);

    // Persist immediately during animation
    const newBalance = points - cost;
    const prizeLabel = cellMap[result]?.label || null;
    void Promise.all([
      client.from("adhdice_roll_history").insert({ user_id: currentUser.id, roll_result: result, points_spent: cost, prize_label: prizeLabel }),
      client.from("adhdice_user_profiles").update({ points: newBalance }).eq("user_id", currentUser.id),
      client.from("adhdice_point_ledger").insert({ user_id: currentUser.id, delta: -cost, reason: "Dice roll", balance_after: newBalance, source: "roll" }),
    ]);
    setPoints(newBalance);
    onSpendPoints(-cost, "Dice roll");

    // Transition to settling after spin duration
    setTimeout(() => setPhase("settling"), 1100);
  }

  function handleDiceSettled() {
    const result = pendingResult.current;
    if (result === null) return;
    new Audio("/calm-alarm.wav").play().catch(() => {});
    setLastRoll(result);
    setPhase("idle");
    pendingResult.current = null;
    void client.from("adhdice_roll_history").select("*").eq("user_id", currentUser.id).order("rolled_at", { ascending: false }).limit(10)
      .then(({ data }) => { if (data) setHistory(data); });
  }

  async function handleSaveCell(cellNumber: number) {
    const existing = cellMap[cellNumber];
    if (existing) {
      await client.from("adhdice_prize_board").update({ label: editLabel }).eq("id", existing.id);
      setCells((prev) => prev.map((c) => c.cell_number === cellNumber ? { ...c, label: editLabel } : c));
    } else {
      const { data } = await client.from("adhdice_prize_board").insert({ user_id: currentUser.id, cell_number: cellNumber, label: editLabel }).select("*").single();
      if (data) setCells((prev) => [...prev, data]);
    }
    setEditingCell(null);
    setEditLabel("");
  }

  async function handleClaimPrize(prize: VaultPrize) {
    if (tokens === null || tokens < prize.token_cost || prize.is_claimed) return;
    const newTokens = tokens - prize.token_cost;
    await Promise.all([
      client.from("adhdice_vault_prizes").update({ is_claimed: true, claimed_at: new Date().toISOString() }).eq("id", prize.id),
      client.from("adhdice_user_profiles").update({ tokens: newTokens }).eq("user_id", currentUser.id),
      client.from("adhdice_point_ledger").insert({ user_id: currentUser.id, delta: -prize.token_cost, reason: `Claimed: ${prize.name}`, balance_after: newTokens, source: "roll" }),
    ]);
    setTokens(newTokens);
    setVaultPrizes((prev) => prev.map((p) => p.id === prize.id ? { ...p, is_claimed: true } : p));
  }

  async function handleAddVaultPrize() {
    if (!pmName.trim()) return;
    const cost = parseInt(pmCost) || VAULT_TIER_CONFIG[pmTier].defaultCost;
    const ins: VaultPrizeInsert = { user_id: currentUser.id, name: pmName.trim(), tier: pmTier, token_cost: cost };
    const { data } = await client.from("adhdice_vault_prizes").insert(ins).select("*").single();
    if (data) setVaultPrizes((prev) => [...prev, data as VaultPrize]);
    setPmName("");
    setPmCost("");
  }

  async function handleUpdateVaultPrize(id: string) {
    if (!pmName.trim()) return;
    const cost = parseInt(pmCost) || VAULT_TIER_CONFIG[pmTier].defaultCost;
    await client.from("adhdice_vault_prizes").update({ name: pmName.trim(), tier: pmTier, token_cost: cost }).eq("id", id);
    setVaultPrizes((prev) => prev.map((p) => p.id === id ? { ...p, name: pmName.trim(), tier: pmTier, token_cost: cost } : p));
    setPmEditId(null);
    setPmName("");
    setPmCost("");
  }

  async function handleDeleteVaultPrize(id: string) {
    await client.from("adhdice_vault_prizes").delete().eq("id", id);
    setVaultPrizes((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleBulkPaste() {
    const names = pmBulk.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const defaultCost = VAULT_TIER_CONFIG[pmTier].defaultCost;
    const inserts: VaultPrizeInsert[] = names.map((name) => ({ user_id: currentUser.id, name, tier: pmTier, token_cost: defaultCost }));
    const { data } = await client.from("adhdice_vault_prizes").insert(inserts).select("*");
    if (data) setVaultPrizes((prev) => [...prev, ...(data as VaultPrize[])]);
    setPmBulk("");
  }

  return (
    <section className="px-4 pb-32">
      <PageShellHeader title="Roll" subtitle="Prize Board" />

      {/* Balance row */}
      <div className={`mb-4 flex items-center justify-between rounded-2xl px-5 py-3 bg-[#f7f5ff] dark:bg-white/5`}>
        <div className="flex gap-6">
          <div>
            <p className={`text-[10px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40`}>Points</p>
            <p className={`text-2xl font-black tabular-nums text-[#17203a] dark:text-white`}>{points ?? "—"}</p>
          </div>
          <div>
            <p className={`text-[10px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40`}>Tokens</p>
            <p className={`text-2xl font-black tabular-nums text-[#17203a] dark:text-white`}>{tokens ?? "—"}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowVault(true)}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition active:scale-95 bg-[#ede8ff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`}
        >
          Vault
        </button>
      </div>

      {/* Difficulty selector */}
      <div className={`mb-4 flex rounded-2xl p-1 gap-1 bg-[#f7f5ff] dark:bg-white/5`}>
        {(["easy", "medium", "hard"] as RollDifficulty[]).map((d) => (
          <button
            key={d}
            type="button"
            disabled={phase !== "idle"}
            onClick={() => setDifficulty(d)}
            className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
              difficulty === d
                ? `bg-[#6f57f6] dark:bg-[#9b87ff] text-white dark:text-[#171127] shadow-sm`
                : `text-[#8e88a9] dark:text-white/40 hover:opacity-80`
            }`}
          >
            {DIFFICULTY_CONFIG[d].label}
          </button>
        ))}
      </div>
      <p className={`mb-3 text-center text-[11px] text-[#8e88a9] dark:text-white/40`}>{cfg.description}</p>

      {/* 3D Dice Canvas */}
      <div className="mb-4">
        <ErrorBoundary fallback={<div className={`w-full rounded-2xl bg-[#f7f5ff] dark:bg-white/5`} style={{ height: 180 }} />}>
          <Suspense fallback={<div className={`w-full rounded-2xl bg-[#f7f5ff] dark:bg-white/5`} style={{ height: 180 }} />}>
            <Dice3DCanvas
              phase={phase}
              layout={cfg.layout}
              onSettled={handleDiceSettled}
              dark={theme === "dark"}
            />
          </Suspense>
        </ErrorBoundary>
      </div>

      {/* Roll button */}
      <button
        disabled={!canRoll}
        onClick={handleRoll}
        type="button"
        className="mb-4 w-full rounded-2xl py-4 text-base font-black tracking-wide transition active:scale-[0.98] disabled:opacity-40 bg-[linear-gradient(180deg,#7c63f7_0%,#664cf1_100%)] text-white shadow-[0_12px_28px_rgba(111,87,246,0.3)] dark:bg-[linear-gradient(180deg,#c9bbff_0%,#9b87ff_100%)] dark:text-[#171127]"
      >
        {phase === "idle" ? `Roll — ${cfg.cost} pts` : phase === "rolling" ? "Rolling…" : "Settling…"}
      </button>

      {/* Last roll reveal */}
      {lastRoll !== null && phase === "idle" && (
        <div className={`mb-4 rounded-2xl px-5 py-4 text-center bg-[#ede8ff] dark:bg-[#22193f]`}>
          <p className={`text-[11px] font-semibold uppercase tracking-widest mb-1 text-[#8e88a9] dark:text-white/40`}>Result</p>
          <p className={`text-5xl font-black tabular-nums text-[#6f57f6] dark:text-[#cabfff]`}>{lastRoll}</p>
          {cellMap[lastRoll]?.label ? (
            <p className={`mt-1 text-sm font-semibold text-[#27304c] dark:text-white/70`}>{cellMap[lastRoll].label}</p>
          ) : (
            <p className={`mt-1 text-xs text-[#8e88a9] dark:text-white/40`}>No prize set for this roll</p>
          )}
          {tasks.length > 0 && (
            <div className={`mt-3 rounded-xl px-4 py-2 text-left bg-white/60 dark:bg-white/10`}>
              <p className={`text-[10px] font-semibold uppercase tracking-widest mb-0.5 text-[#8e88a9] dark:text-white/40`}>Suggested Task</p>
              <p className={`text-sm font-semibold text-[#27304c] dark:text-white/70`}>{tasks[(lastRoll - 1) % tasks.length].title}</p>
            </div>
          )}
        </div>
      )}

      {/* 20-cell prize grid */}
      <div className="flex items-center justify-between mb-2">
        <p className={`text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40`}>Prize Board</p>
        <button
          type="button"
          onClick={() => setShowPrizeManager(true)}
          className={`text-xs font-semibold text-[#6f57f6] dark:text-[#cabfff]`}
        >
          Manage Prizes
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2 mb-6">
        {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => {
          const cell = cellMap[n];
          const isLit = lastRoll === n;
          const editing = editingCell === n;
          return (
            <div
              key={n}
              className={`relative rounded-xl p-2 transition ${
                isLit
                  ? "bg-[#6f57f6] text-white shadow-[0_0_20px_rgba(111,87,246,0.4)] dark:bg-[#9b87ff] dark:text-[#171127] dark:shadow-[0_0_20px_rgba(155,135,255,0.4)]"
                  : "bg-[#f7f5ff] dark:bg-white/5"
              }`}
            >
              <p className={`text-[10px] font-bold tabular-nums ${isLit ? "opacity-80" : "text-[#8e88a9] dark:text-white/40"}`}>{n}</p>
              {editing ? (
                <div className="mt-1 flex flex-col gap-1">
                  <input
                    autoFocus
                    className={`w-full rounded-lg px-2 py-1 text-xs outline-none bg-white text-[#1e2540] dark:bg-white/10 dark:text-white`}
                    maxLength={40}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleSaveCell(n);
                      if (e.key === "Escape") { setEditingCell(null); setEditLabel(""); }
                    }}
                    placeholder="Prize…"
                    value={editLabel}
                  />
                  <button className={`rounded-lg py-1 text-[10px] font-bold bg-[#6f57f6] dark:bg-[#9b87ff] text-white dark:text-[#171127]`} onClick={() => { void handleSaveCell(n); }} type="button">Save</button>
                </div>
              ) : (
                <button aria-label={cell?.label ? `Edit cell ${n}: ${cell.label}` : `Set prize for cell ${n}`} className="mt-0.5 w-full text-left" onClick={() => { setEditingCell(n); setEditLabel(cell?.label ?? ""); }} type="button">
                  <p className={`truncate text-[11px] leading-tight ${isLit ? "" : "text-[#27304c] dark:text-white/70"}`}>
                    {cell?.label || <span className="opacity-30">+</span>}
                  </p>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Recent rolls */}
      {history.length > 0 && (
        <div className="mb-4">
          <p className={`mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40`}>Recent Rolls</p>
          <div className={`divide-y rounded-2xl overflow-hidden bg-[#f7f5ff] divide-[#e5e0f5] dark:bg-white/5 dark:divide-white/8`}>
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-black bg-[#ede8ff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`}>{h.roll_result}</span>
                  <span className={`text-sm text-[#27304c] dark:text-white/70`}>{h.prize_label || "No prize"}</span>
                </div>
                <span className={`text-xs text-[#8e88a9] dark:text-white/40`}>-{h.points_spent}pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vault Modal */}
      {showVault && (
        <ModalShell className={`w-full max-w-md max-h-[82vh] overflow-y-auto rounded-[2rem] border border-[#ece8f8] bg-white shadow-[0_30px_80px_rgba(81,61,168,0.16)] dark:border-white/10 dark:bg-[#171328]`} label="Vault" onClose={() => setShowVault(false)}>
          <div className="px-5 pb-6">
            <div className="flex items-center justify-between py-4 mb-2">
              <div>
                <h2 className={`text-lg font-black text-[#17203a] dark:text-white`}>Vault</h2>
                <p className={`text-xs text-[#8e88a9] dark:text-white/40`}>{tokens ?? 0} tokens available</p>
              </div>
              <button aria-label="Close vault" type="button" onClick={() => setShowVault(false)} className={`rounded-full p-2 bg-[#f0ecff] dark:bg-white/10`}>
                <X className={`h-4 w-4 text-[#8e88a9] dark:text-white/40`} />
              </button>
            </div>
            {vaultPrizes.length === 0 ? (
              <p className={`py-8 text-center text-sm text-[#8e88a9] dark:text-white/40`}>No prizes yet. Add them in Manage Prizes.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {(["small", "big", "master"] as VaultPrizeTier[]).map((tier) => {
                  const tierPrizes = vaultPrizes.filter((p) => p.tier === tier);
                  if (!tierPrizes.length) return null;
                  const { label, emoji } = VAULT_TIER_CONFIG[tier];
                  return (
                    <div key={tier}>
                      <p className={`mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40`}>{emoji} {label}</p>
                      <div className="flex flex-col gap-2">
                        {tierPrizes.map((prize) => {
                          const progress = Math.min((tokens ?? 0) / prize.token_cost, 1);
                          const canClaim = (tokens ?? 0) >= prize.token_cost && !prize.is_claimed;
                          return (
                            <div key={prize.id} className={`rounded-2xl px-4 py-3 bg-[#f7f5ff] dark:bg-white/5 ${prize.is_claimed ? "opacity-50" : ""}`}>
                              <div className="flex items-center justify-between mb-2">
                                <p className={`font-semibold text-sm text-[#17203a] dark:text-white`}>{prize.name}</p>
                                <button
                                  type="button"
                                  disabled={!canClaim}
                                  onClick={() => { void handleClaimPrize(prize); }}
                                  className={`rounded-xl px-3 py-1 text-xs font-bold transition active:scale-95 disabled:opacity-40 bg-[#6f57f6] dark:bg-[#9b87ff] text-white dark:text-[#171127]`}
                                >
                                  {prize.is_claimed ? "Claimed" : `Claim · ${prize.token_cost}t`}
                                </button>
                              </div>
                              <div className={`h-1.5 rounded-full overflow-hidden bg-[#e5e0f5] dark:bg-white/10`}>
                                <div
                                  className={`h-full rounded-full transition-all bg-[#6f57f6] dark:bg-[#9b87ff]`}
                                  style={{ width: `${progress * 100}%` }}
                                />
                              </div>
                              <p className={`mt-1 text-[10px] text-[#8e88a9] dark:text-white/40`}>{Math.min(tokens ?? 0, prize.token_cost)} / {prize.token_cost} tokens</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ModalShell>
      )}

      {/* Prize Manager Modal */}
      {showPrizeManager && (
        <ModalShell className={`w-full max-w-md max-h-[90vh] overflow-y-auto rounded-[2rem] border border-[#ece8f8] bg-white shadow-[0_30px_80px_rgba(81,61,168,0.16)] dark:border-white/10 dark:bg-[#171328]`} label="Manage Prizes" onClose={() => setShowPrizeManager(false)}>
          <div className="px-5 pb-6">
            <div className="flex items-center justify-between py-4 mb-3">
              <h2 className={`text-lg font-black text-[#17203a] dark:text-white`}>Manage Prizes</h2>
              <button aria-label="Close prize manager" type="button" onClick={() => setShowPrizeManager(false)} className={`rounded-full p-2 bg-[#f0ecff] dark:bg-white/10`}>
                <X className={`h-4 w-4 text-[#8e88a9] dark:text-white/40`} />
              </button>
            </div>

            {/* Tier tabs */}
            <div className={`flex rounded-xl p-1 gap-1 mb-4 bg-[#f0ecff] dark:bg-white/5`}>
              {(["small", "big", "master"] as VaultPrizeTier[]).map((t) => (
                <button key={t} type="button" onClick={() => setPmTier(t)}
                  className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${pmTier === t ? `bg-[#6f57f6] dark:bg-[#9b87ff] text-white dark:text-[#171127]` : "text-[#8e88a9] dark:text-white/40"}`}>
                  {VAULT_TIER_CONFIG[t].emoji} {VAULT_TIER_CONFIG[t].label}
                </button>
              ))}
            </div>

            {/* Add / edit form */}
            <div className={`mb-4 rounded-2xl p-4 bg-[#f7f5ff] dark:bg-white/5`}>
              <p className={`mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40`}>
                {pmEditId ? "Edit Prize" : "Add Prize"}
              </p>
              <div className="flex gap-2 mb-2">
                <input
                  className={`flex-1 rounded-xl px-3 py-2 text-sm outline-none bg-white text-[#1e2540] dark:bg-white/10 dark:text-white`}
                  placeholder="Prize name…"
                  value={pmName}
                  onChange={(e) => setPmName(e.target.value)}
                  maxLength={60}
                />
                <input
                  className={`w-20 rounded-xl px-3 py-2 text-sm outline-none bg-white text-[#1e2540] dark:bg-white/10 dark:text-white`}
                  placeholder="Tokens"
                  value={pmCost}
                  onChange={(e) => setPmCost(e.target.value)}
                  type="number"
                  min="1"
                />
              </div>
              {pmEditId ? (
                <div className="flex gap-2">
                  <button type="button" onClick={() => { void handleUpdateVaultPrize(pmEditId); }}
                    className={`flex-1 rounded-xl py-2 text-sm font-bold bg-[#6f57f6] dark:bg-[#9b87ff] text-white dark:text-[#171127]`}>Save</button>
                  <button type="button" onClick={() => { setPmEditId(null); setPmName(""); setPmCost(""); }}
                    className={`rounded-xl px-4 py-2 text-sm font-bold bg-[#e5e0f5] text-[#8e88a9] dark:bg-white/10 dark:text-white/50`}>Cancel</button>
                </div>
              ) : (
                <button type="button" onClick={() => { void handleAddVaultPrize(); }}
                  className={`w-full rounded-xl py-2 text-sm font-bold bg-[#6f57f6] dark:bg-[#9b87ff] text-white dark:text-[#171127]`}>
                  Add to {VAULT_TIER_CONFIG[pmTier].label}
                </button>
              )}
            </div>

            {/* Bulk paste */}
            <div className={`mb-4 rounded-2xl p-4 bg-[#f7f5ff] dark:bg-white/5`}>
              <p className={`mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40`}>Bulk Paste</p>
              <textarea
                className={`w-full rounded-xl px-3 py-2 text-sm outline-none resize-none bg-white text-[#1e2540] dark:bg-white/10 dark:text-white`}
                placeholder={"One prize per line…\nExtra nap\nFavorite snack"}
                rows={4}
                value={pmBulk}
                onChange={(e) => setPmBulk(e.target.value)}
              />
              <button type="button" onClick={() => { void handleBulkPaste(); }}
                className={`mt-2 w-full rounded-xl py-2 text-sm font-bold bg-[#6f57f6] dark:bg-[#9b87ff] text-white dark:text-[#171127]`}>
                Add All to {VAULT_TIER_CONFIG[pmTier].label}
              </button>
            </div>

            {/* Prize list for current tier */}
            <div>
              <p className={`mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40`}>
                {VAULT_TIER_CONFIG[pmTier].emoji} {VAULT_TIER_CONFIG[pmTier].label} Prizes
              </p>
              {vaultPrizes.filter((p) => p.tier === pmTier).length === 0 ? (
                <p className={`py-4 text-center text-sm text-[#8e88a9] dark:text-white/40`}>None yet</p>
              ) : (
                <div className={`divide-y rounded-2xl overflow-hidden bg-[#f7f5ff] divide-[#e5e0f5] dark:bg-white/5 dark:divide-white/8`}>
                  {vaultPrizes.filter((p) => p.tier === pmTier).map((prize) => (
                    <div key={prize.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className={`text-sm font-semibold text-[#17203a] dark:text-white ${prize.is_claimed ? "line-through opacity-50" : ""}`}>{prize.name}</p>
                        <p className={`text-xs text-[#8e88a9] dark:text-white/40`}>{prize.token_cost} tokens</p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { setPmEditId(prize.id); setPmName(prize.name); setPmCost(String(prize.token_cost)); setPmTier(prize.tier); }}
                          className={`text-xs font-semibold text-[#6f57f6] dark:text-[#cabfff]`}>Edit</button>
                        <button type="button" onClick={() => { void handleDeleteVaultPrize(prize.id); }}
                          className={`text-xs font-semibold text-red-500 dark:text-red-400`}>Del</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ModalShell>
      )}
    </section>
  );
}

function StatsPage({
  economy,
  focusHistory,
  taskHistory,
  taskHistoryStats,
  tasks,
}: {
  economy: { level: number; xp: number; points: number; tokens: number };
  focusHistory: HistoricalFocusSession[];
  taskHistory: DbTaskHistory[];
  taskHistoryStats: TaskHistoryStats;
  tasks: Task[];
}) {
  const today = todayISO();

  // Tasks completed today
  const todayDone = taskHistory.filter((h) => h.entry_date === today && h.was_completed).length;

  // Tasks completed this week (last 7 days)
  const weekDates = Array.from({ length: 7 }, (_, i) => shiftDateKey(today, -i));
  const weekDone = taskHistory.filter((h) => weekDates.includes(h.entry_date) && h.was_completed).length;

  // Focus minutes today
  const todayFocusSeconds = focusHistory
    .filter((s) => s.date === today)
    .reduce((sum, s) => sum + s.durationSeconds, 0);
  const todayFocusMinutes = Math.floor(todayFocusSeconds / 60);

  // 7-day productivity bar chart data: tasks done per day
  const { chartDays, maxScore } = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = shiftDateKey(today, -(6 - i));
      const done = taskHistory.filter((h) => h.entry_date === date && h.was_completed).length;
      const focusSecs = focusHistory.filter((s) => s.date === date).reduce((sum, s) => sum + s.durationSeconds, 0);
      const score = done * 10 + Math.floor(focusSecs / 60);
      return { date, done, score };
    });
    return { chartDays: days, maxScore: Math.max(...days.map((d) => d.score), 1) };
  }, [taskHistory, focusHistory, today]);

  // Energy distribution from active tasks
  const { energyCounts, totalEnergy } = useMemo(() => {
    const counts = { low: 0, medium: 0, high: 0 };
    for (const t of tasks) {
      if (t.status !== "archived" && t.status !== "done") counts[t.energy]++;
    }
    return { energyCounts: counts, totalEnergy: counts.low + counts.medium + counts.high || 1 };
  }, [tasks]);

  const statCard = (label: string, value: string, detail: string) => (
    <div className={`flex-1 rounded-2xl px-4 py-4 bg-[#f7f5ff] dark:bg-white/5`}>
      <p className={`text-[10px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40`}>{label}</p>
      <p className={`mt-1 text-3xl font-black tabular-nums text-[#17203a] dark:text-white`}>{value}</p>
      <p className={`mt-0.5 text-xs text-[#8e88a9] dark:text-white/40`}>{detail}</p>
    </div>
  );

  return (
    <section className="px-4 pb-32">
      <PageShellHeader title="Stats" subtitle="Insights" />

      {/* Hero metrics */}
      <div className="mb-4 flex gap-3">
        {statCard("Today", String(todayDone), "tasks done")}
        {statCard("This Week", String(weekDone), "tasks done")}
      </div>
      <div className="mb-6 flex gap-3">
        {statCard("Streak", String(taskHistoryStats.currentStreak), taskHistoryStats.currentStreak === 1 ? "day" : "days")}
        {statCard("Focus Today", `${todayFocusMinutes}m`, "minutes logged")}
      </div>

      {/* Economy snapshot */}
      <div className={`mb-6 rounded-2xl px-5 py-4 bg-[#f7f5ff] dark:bg-white/5`}>
        <p className={`mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40`}>
          Economy
        </p>
        <div className="flex items-center gap-4">
          <div>
            <p className={`text-xs text-[#8e88a9] dark:text-white/40`}>Level</p>
            <p className={`text-2xl font-black text-[#17203a] dark:text-white`}>{economy.level}</p>
          </div>
          <div className="flex-1">
            <div className="flex justify-between mb-1">
              <p className={`text-xs text-[#8e88a9] dark:text-white/40`}>XP</p>
              <p className={`text-xs tabular-nums text-[#8e88a9] dark:text-white/40`}>{economy.xp} / {economy.level * 100}</p>
            </div>
            <div className={`h-2 rounded-full overflow-hidden bg-[#e5e0f5] dark:bg-white/10`}>
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#7c63f7,#9b87ff)]"
                style={{ width: `${Math.min(100, Math.round((economy.xp / (economy.level * 100)) * 100))}%` }}
              />
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-4">
          <div>
            <p className={`text-xs text-[#8e88a9] dark:text-white/40`}>Points</p>
            <p className={`font-bold tabular-nums text-[#27304c] dark:text-white`}>{economy.points}</p>
          </div>
          <div>
            <p className={`text-xs text-[#8e88a9] dark:text-white/40`}>Tokens</p>
            <p className={`font-bold tabular-nums text-[#27304c] dark:text-white`}>{economy.tokens}</p>
          </div>
          <div>
            <p className={`text-xs text-[#8e88a9] dark:text-white/40`}>Best Streak</p>
            <p className={`font-bold tabular-nums text-[#27304c] dark:text-white`}>{taskHistoryStats.bestStreak}d</p>
          </div>
          <div>
            <p className={`text-xs text-[#8e88a9] dark:text-white/40`}>Done Rate</p>
            <p className={`font-bold tabular-nums text-[#27304c] dark:text-white`}>{taskHistoryStats.doneRate}%</p>
          </div>
        </div>
      </div>

      {/* 7-day productivity chart */}
      <div className={`mb-6 rounded-2xl px-5 py-4 bg-[#f7f5ff] dark:bg-white/5`}>
        <p className={`mb-4 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40`}>
          7-Day Productivity
        </p>
        <div className="flex items-end gap-1.5 h-28">
          {chartDays.map((day) => (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-1 items-end">
                <div
                  className={`w-full rounded-t-lg transition-all ${day.date === today ? "bg-[linear-gradient(180deg,#7c63f7,#9b87ff)]" : "bg-[#cdc6f7] dark:bg-white/20"}`}
                  style={{ height: `${Math.max(4, Math.round((day.score / maxScore) * 100))}%` }}
                />
              </div>
              <p className={`text-[9px] tabular-nums text-[#8e88a9] dark:text-white/40`}>
                {day.date.slice(5).replace("-", "/")}
              </p>
            </div>
          ))}
        </div>
        <p className={`mt-2 text-[10px] text-[#8e88a9] dark:text-white/30`}>
          Score = tasks × 10 + focus minutes
        </p>
      </div>

      {/* Energy distribution */}
      <div className={`rounded-2xl px-5 py-4 bg-[#f7f5ff] dark:bg-white/5`}>
        <p className={`mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40`}>
          Active Task Energy
        </p>
        {(["high", "medium", "low"] as TaskEnergy[]).map((level) => {
          const pct = Math.round((energyCounts[level] / totalEnergy) * 100);
          return (
            <div key={level} className="mb-2">
              <div className="flex justify-between mb-1">
                <p className={`text-xs capitalize text-[#27304c] dark:text-white/80`}>{level}</p>
                <p className={`text-xs tabular-nums text-[#8e88a9] dark:text-white/40`}>{energyCounts[level]}</p>
              </div>
              <div className={`h-1.5 rounded-full overflow-hidden bg-[#e5e0f5] dark:bg-white/10`}>
                <div
                  className={`h-full rounded-full ${level === "high" ? "bg-[#f05566]" : level === "medium" ? "bg-[#f0a030]" : "bg-[#30c060]"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NotesPage({
  client,
  currentUser,
  tasks,
}: {
  client: NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
  currentUser: User;
  tasks: Task[];
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [editing, setEditing] = useState<Note | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [quickCapture, setQuickCapture] = useState("");

  useEffect(() => {
    void client
      .from("adhdice_notes")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("updated_at", { ascending: false })
      .then(({ data }) => { if (data) setNotes(data); });
  }, [client, currentUser.id]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) for (const t of n.tags) set.add(t);
    return [...set].sort();
  }, [notes]);

  const filtered = useMemo(() => notes.filter((n) => {
    const matchSearch = !search || n.title.toLowerCase().includes(search.toLowerCase()) || n.body.toLowerCase().includes(search.toLowerCase());
    const matchTag = !activeTag || n.tags.includes(activeTag);
    return matchSearch && matchTag;
  }), [notes, search, activeTag]);

  async function handleQuickCapture() {
    if (!quickCapture.trim()) return;
    const { data } = await client.from("adhdice_notes").insert({
      user_id: currentUser.id,
      title: quickCapture.trim(),
      body: "",
    }).select("*").single();
    if (data) setNotes((prev) => [data, ...prev]);
    setQuickCapture("");
  }

  async function handleSaveNote(note: Note) {
    if (isNew) {
      const { data } = await client.from("adhdice_notes").insert({
        user_id: currentUser.id,
        title: note.title,
        body: note.body,
        tags: note.tags,
        linked_task_ids: note.linked_task_ids,
      }).select("*").single();
      if (data) setNotes((prev) => [data, ...prev]);
    } else {
      await client.from("adhdice_notes").update({
        title: note.title,
        body: note.body,
        tags: note.tags,
        linked_task_ids: note.linked_task_ids,
      }).eq("id", note.id);
      setNotes((prev) => prev.map((n) => n.id === note.id ? { ...n, ...note, updated_at: new Date().toISOString() } : n));
    }
    setEditing(null);
    setIsNew(false);
  }

  async function handleDeleteNote(id: string) {
    await client.from("adhdice_notes").delete().eq("id", id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setEditing(null);
  }

  function openNew() {
    setEditing({ id: "", user_id: currentUser.id, title: "", body: "", tags: [], linked_task_ids: [], created_at: "", updated_at: "" });
    setIsNew(true);
  }

  if (editing) {
    return (
      <NoteEditor
        isNew={isNew}
        note={editing}
        onClose={() => { setEditing(null); setIsNew(false); }}
        onDelete={handleDeleteNote}
        onSave={handleSaveNote}
        tasks={tasks}
      />
    );
  }

  return (
    <section className="px-4 pb-32">
      <div className="flex items-center justify-between">
        <PageShellHeader title="Notes" subtitle="Knowledge Base" />
        <button
          className={`mb-2 flex h-10 w-10 items-center justify-center rounded-full font-bold text-xl bg-[#6f57f6] text-white dark:bg-[#9b87ff] dark:text-[#171127]`}
          onClick={openNew}
          type="button"
        >
          +
        </button>
      </div>

      {/* Quick capture */}
      <div className={`mb-4 flex gap-2 rounded-2xl px-4 py-3 bg-[#f7f5ff] dark:bg-white/5`}>
        <input
          className={`min-w-0 flex-1 bg-transparent text-sm outline-none text-[#27304c] placeholder:text-[#9b9fba] dark:text-white dark:placeholder:text-white/35`}
          onKeyDown={(e) => { if (e.key === "Enter") void handleQuickCapture(); }}
          onChange={(e) => setQuickCapture(e.target.value)}
          placeholder="Quick capture — press Enter to save…"
          value={quickCapture}
        />
        {quickCapture && (
          <button
            className={`text-xs font-semibold text-[#6f57f6] dark:text-[#cabfff]`}
            onClick={() => { void handleQuickCapture(); }}
            type="button"
          >
            Save
          </button>
        )}
      </div>

      {/* Search */}
      <div className={`mb-3 flex gap-2 rounded-2xl px-4 py-2.5 bg-[#f7f5ff] dark:bg-white/5`}>
        <input
          className={`min-w-0 flex-1 bg-transparent text-sm outline-none text-[#27304c] placeholder:text-[#9b9fba] dark:text-white dark:placeholder:text-white/35`}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes…"
          value={search}
        />
      </div>

      {/* Tag filter chips */}
      {allTags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                activeTag === tag
                  ? "bg-[#6f57f6] text-white dark:bg-[#9b87ff] dark:text-[#171127]"
                  : "bg-[#ede8ff] text-[#6f57f6] dark:bg-white/10 dark:text-[#cabfff]"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* 2-col notes grid */}
      {filtered.length === 0 ? (
        <p className={`mt-8 text-center text-sm text-[#8e88a9] dark:text-white/40`}>
          {notes.length === 0 ? "No notes yet. Use quick capture above." : "No notes match your filter."}
        </p>
      ) : (
        <div className="columns-2 gap-3">
          {filtered.map((note) => (
            <button
              key={note.id}
              className={`mb-3 w-full break-inside-avoid rounded-2xl px-4 py-3 text-left transition hover:opacity-80 bg-[#f7f5ff] dark:bg-white/5`}
              onClick={() => { setEditing(note); setIsNew(false); }}
              type="button"
            >
              {note.title && (
                <p className={`mb-1 text-sm font-semibold leading-snug text-[#17203a] dark:text-white`}>
                  {note.title}
                </p>
              )}
              {note.body && (
                <p className={`text-xs leading-relaxed line-clamp-4 text-[#707a95] dark:text-white/55`}>
                  {note.body}
                </p>
              )}
              {note.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {note.tags.map((t) => (
                    <span key={t} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold bg-[#ede8ff] text-[#6f57f6] dark:bg-white/10 dark:text-[#cabfff]`}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function NoteEditor({
  isNew,
  note,
  onClose,
  onDelete,
  onSave,
  tasks,
}: {
  isNew: boolean;
  note: Note;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
  onSave: (note: Note) => Promise<void>;
  tasks: Task[];
}) {
  const [draft, setDraft] = useState<Note>(note);
  const [tagInput, setTagInput] = useState("");

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (t && !draft.tags.includes(t)) setDraft((d) => ({ ...d, tags: [...d.tags, t] }));
    setTagInput("");
  }

  return (
    <section className="px-4 pb-32">
      <div className="flex items-center gap-3 pt-4 pb-4">
        <button onClick={onClose} type="button" className={`text-sm font-semibold text-[#6f57f6] dark:text-[#cabfff]`}>
          ← Back
        </button>
        <div className="flex-1" />
        {!isNew && (
          <button
            onClick={() => { void onDelete(draft.id); }}
            type="button"
            className={`text-xs font-semibold text-[#f05566] dark:text-[#ff8090]`}
          >
            Delete
          </button>
        )}
        <button
          onClick={() => { void onSave(draft); }}
          type="button"
          className={`rounded-full px-4 py-2 text-sm font-bold bg-[#6f57f6] text-white dark:bg-[#9b87ff] dark:text-[#171127]`}
        >
          Save
        </button>
      </div>

      <input
        autoFocus
        className={`mb-3 w-full border-b-2 bg-transparent pb-2 text-2xl font-bold outline-none border-[#6f57f6] text-[#1e2540] placeholder:text-[#bbb8d0] dark:border-[#cabfff]/50 dark:text-white dark:placeholder:text-white/25`}
        onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        placeholder="Title"
        value={draft.title}
      />

      <textarea
        className={`mb-4 min-h-40 w-full resize-y rounded-2xl px-4 py-3 text-sm outline-none bg-[#f7f5ff] text-[#1f2642] placeholder:text-[#9b9fba] dark:bg-white/5 dark:text-white dark:placeholder:text-white/30`}
        onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
        placeholder="Write something…"
        value={draft.body}
      />

      {/* Tags */}
      <div className="mb-4">
        <p className={`mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#8e88a9] dark:text-white/40`}>Tags</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {draft.tags.map((t) => (
            <button
              key={t}
              onClick={() => setDraft((d) => ({ ...d, tags: d.tags.filter((x) => x !== t) }))}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-semibold bg-[#ede8ff] text-[#6f57f6] dark:bg-white/10 dark:text-[#cabfff]`}
            >
              {t} ×
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className={`flex-1 rounded-xl px-3 py-2 text-sm outline-none bg-[#f7f5ff] text-[#1e2540] dark:bg-white/5 dark:text-white`}
            onKeyDown={(e) => { if (e.key === "Enter") addTag(); }}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Add tag…"
            value={tagInput}
          />
          <button
            className={`rounded-xl px-4 py-2 text-sm font-semibold bg-[#ede8ff] text-[#6f57f6] dark:bg-white/10 dark:text-[#cabfff]`}
            onClick={addTag}
            type="button"
          >
            Add
          </button>
        </div>
      </div>
    </section>
  );
}

const ACCENT_PRESETS = ["#6f57f6", "#e05597", "#e05050", "#e08830", "#22b87a", "#2196c8", "#7b4fe0", "#5070e0"];

function SettingsPage({
  dayStartTime,
  onDayStartTimeChange,
  onThemeChange,
  tasks,
  theme,
  userId,
  lowStim,
  onLowStimChange,
}: {
  dayStartTime: string;
  onDayStartTimeChange: (t: string) => void;
  onThemeChange: (t: ThemeMode) => void;
  tasks: Task[];
  theme: ThemeMode;
  userId: string;
  lowStim: boolean;
  onLowStimChange: (v: boolean) => void;
}) {
  const [accentColor, setAccentColor] = useState<string>(() => {
    if (typeof window === "undefined") return ACCENT_PRESETS[0];
    return window.localStorage.getItem("adhdice-accent-color") ?? ACCENT_PRESETS[0];
  });
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);

  function applyAccent(color: string) {
    setAccentColor(color);
    window.localStorage.setItem("adhdice-accent-color", color);
    document.documentElement.style.setProperty("--accent", color);
    // Derive a darkened strong and a lightened soft
    document.documentElement.style.setProperty("--accent-strong", color);
  }

  function handleExportJSON() {
    const exportable = tasks.map(({ user_id: _uid, ...rest }) => rest);
    const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `adhdice-tasks-${getTodayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportJSON() {
    setImportStatus(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText.trim());
    } catch {
      setImportStatus("Invalid JSON.");
      return;
    }
    if (!Array.isArray(parsed)) {
      setImportStatus("Expected a JSON array.");
      return;
    }
    const rows = (parsed as Task[]).filter((r) => typeof r.title === "string" && r.title.trim());
    if (rows.length === 0) {
      setImportStatus("No valid tasks found.");
      return;
    }
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setImportStatus("Not connected.");
      return;
    }
    const payload = rows.map((r) => ({
      id: r.id ?? undefined,
      user_id: userId,
      title: r.title,
      notes: r.notes ?? null,
      status: (r.status ?? "pending") as TaskStatus,
      priority: (r.priority ?? "normal") as TaskPriority,
      energy: (r.energy ?? "medium") as TaskEnergy,
      is_urgent: r.is_urgent ?? false,
      is_important: r.is_important ?? false,
      due_on: r.due_on ?? null,
      due_time: r.due_time ?? null,
      estimated_minutes: r.estimated_minutes ?? null,
      tags: r.tags ?? [],
      external_link_label: r.external_link_label ?? null,
      external_link_url: r.external_link_url ?? null,
      one_step_at_a_time: r.one_step_at_a_time ?? false,
      subtasks_auto_reset: r.subtasks_auto_reset ?? false,
      repeat_frequency: (r.repeat_frequency ?? "none") as TaskRepeatFrequency,
      repeat_interval: r.repeat_interval ?? 1,
      repeat_days_of_week: r.repeat_days_of_week ?? [],
      repeat_day_of_month: r.repeat_day_of_month ?? null,
    }));
    const { error } = await supabase
      .from("adhdice_clean_tasks")
      .upsert(payload, { onConflict: "id" });
    if (error) {
      setImportStatus(`Error: ${error.message}`);
    } else {
      setImportStatus(`Imported ${payload.length} task${payload.length === 1 ? "" : "s"}.`);
      setImportText("");
    }
  }

  const row = `flex items-center justify-between px-5 py-4`;
  const label = `text-sm font-medium text-[#27304c] dark:text-white`;
  const sectionClass = `rounded-2xl divide-y bg-[#f7f5ff] divide-[#e5e0f5] dark:bg-white/5 dark:divide-white/10`;
  const sectionTitle = `mt-8 mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40`;

  return (
    <section className="px-4 pb-32 max-w-lg mx-auto">
      <PageShellHeader title="Settings" subtitle="Configuration" />

      {/* Appearance */}
      <p className={sectionTitle}>Appearance</p>
      <div className={sectionClass}>
        <div className={row}>
          <span className={label}>Theme</span>
          <ThemeToggle theme={theme} onThemeChange={onThemeChange} lowStim={lowStim} onLowStimChange={onLowStimChange} />
        </div>
        <div className="px-5 py-4">
          <p className={label}>Highlight color</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {ACCENT_PRESETS.map((color) => (
              <button
                aria-label={`Set accent to ${color}`}
                className={`h-8 w-8 rounded-full border-2 transition ${accentColor === color ? "scale-110 border-white shadow-md" : "border-transparent opacity-80"}`}
                key={color}
                onClick={() => applyAccent(color)}
                style={{ backgroundColor: color }}
                type="button"
              />
            ))}
            <input
              aria-label="Custom accent color"
              className="h-8 w-8 cursor-pointer rounded-full border-0 p-0"
              onChange={(e) => applyAccent(e.target.value)}
              title="Custom color"
              type="color"
              value={accentColor}
            />
          </div>
        </div>
      </div>

      {/* Daily schedule */}
      <p className={sectionTitle}>Schedule</p>
      <div className={sectionClass}>
        <div className={`${row} gap-4`}>
          <div>
            <p className={label}>Day start time</p>
            <p className={`mt-0.5 text-xs text-[#8d87a7] dark:text-white/40`}>When "tomorrow" becomes "today" for task resets</p>
          </div>
          <input
            className={`rounded-lg border px-3 py-2 text-sm font-mono border-[#e5e0f5] bg-white text-[#27304c] dark:border-white/15 dark:bg-white/8 dark:text-white`}
            onChange={(e) => onDayStartTimeChange(e.target.value)}
            type="time"
            value={dayStartTime}
          />
        </div>
      </div>

      {/* Data management */}
      <p className={sectionTitle}>Data</p>
      <div className={sectionClass}>
        <div className={`${row} gap-4`}>
          <div>
            <p className={label}>Export tasks</p>
            <p className={`mt-0.5 text-xs text-[#8d87a7] dark:text-white/40`}>Download all tasks as JSON</p>
          </div>
          <button
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold bg-[#f1ecff] text-[#6f57f6] dark:bg-white/10 dark:text-[#cabfff]`}
            onClick={handleExportJSON}
            type="button"
          >
            Export
          </button>
        </div>
        <div className="px-5 py-4">
          <p className={label}>Import tasks (JSON)</p>
          <p className={`mt-0.5 mb-3 text-xs text-[#8d87a7] dark:text-white/40`}>Paste an exported JSON array — existing IDs will be upserted</p>
          <textarea
            className={`w-full rounded-xl border px-3 py-2 font-mono text-xs border-[#e5e0f5] bg-white text-[#27304c] placeholder:text-[#c0b8d8] dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/25`}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='[{"title": "My task", ...}]'
            rows={4}
            value={importText}
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              className={`rounded-full px-4 py-2 text-sm font-bold bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]`}
              disabled={!importText.trim()}
              onClick={() => { void handleImportJSON(); }}
              type="button"
            >
              Import
            </button>
            {importStatus ? (
              <span className={`text-xs ${importStatus.startsWith("Error") ? "text-[#d64b5f] dark:text-[#ff9eaf]" : "text-[#12a876] dark:text-[#7de4b8]"}`}>
                {importStatus}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Page placeholder (Games, Test, unknown) ─────────────────────────────────

function PagePlaceholder({
  count,
  page,
  setActivePage,
}: {
  count: number;
  page: AppPage;
  setActivePage: (page: AppPage) => void;
}) {
  return (
    <section className="pt-8 flex flex-col items-center text-center">
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
          className={`rounded-full px-8 py-4 text-lg font-bold transition hover:-translate-y-0.5 bg-[#6f57f6] text-white shadow-[0_12px_28px_rgba(111,87,246,0.2)] dark:bg-[#cabfff] dark:text-[#1a1431]`}
          onClick={() => setActivePage("Home")}
          type="button"
        >
          Back to Home
        </button>
        <button
          className={`rounded-full px-8 py-4 text-lg font-bold transition hover:-translate-y-0.5 bg-[#f1ecff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`}
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
    </section>
  );
}

function ThemeToggle({
  theme,
  onThemeChange,
  lowStim,
  onLowStimChange,
}: {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  lowStim: boolean;
  onLowStimChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className={`inline-flex rounded-full p-1 bg-[#f1ecff] dark:bg-white/10`}>
        {(["light", "dark"] as ThemeMode[]).map((mode) => (
          <button
            aria-label={`Switch to ${mode} mode`}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
              theme === mode
                ? "bg-white text-[#221d4e] shadow-sm dark:bg-[#c8baff] dark:text-[#181127]"
                : "text-[#746d92] dark:text-white/55"
            }`}
            key={mode}
            onClick={() => onThemeChange(mode)}
            type="button"
          >
            {mode === "light" ? (
              <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="2"
                />
              </svg>
            ) : (
              <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.742 13.045A8.088 8.088 0 0 1 10.955 3.258a.75.75 0 0 0-.822-1.078A9.589 9.589 0 1 0 21.82 13.867a.75.75 0 0 0-1.078-.822Z" />
              </svg>
            )}
          </button>
        ))}
      </div>
      <button
        aria-label={lowStim ? "Disable low stimulation mode" : "Enable low stimulation mode"}
        aria-pressed={lowStim}
        className={`flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
          lowStim
            ? "bg-[#f1ecff] text-[#6f57f6] dark:bg-[#cabfff]/20 dark:text-[#cabfff]"
            : "text-[#8d87a7] hover:bg-[#f1ecff] dark:text-white/40 dark:hover:bg-white/10"
        }`}
        onClick={() => onLowStimChange(!lowStim)}
        type="button"
      >
        <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364-.707.707M6.343 17.657l-.707.707m12.728 0-.707-.707M6.343 6.343l-.707-.707" />
        </svg>
        Calm
      </button>
    </div>
  );
}

function ProgressStat({
  label,
  value,
  percent,
}: {
  label: string;
  value: string;
  percent: number;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-full px-3 py-2 bg-[#f6f2ff] dark:bg-white/10`}>
      <span className={`rounded-full px-3 py-1 text-sm font-bold bg-[#6f57f6] text-white dark:bg-[#c8baff] dark:text-[#191229]`}>
        {label}
      </span>
      <div>
        <p className={`text-sm font-semibold text-[#26304c] dark:text-white`}>{value}</p>
        <div className={`mt-1 h-2 w-24 overflow-hidden rounded-full bg-[#dfdaf3] dark:bg-white/10`}>
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
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className={`rounded-full px-4 py-2 bg-white shadow-[0_10px_30px_rgba(81,61,168,0.08)] dark:bg-white/10`}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a84a3] dark:text-white/40`}>{label}</p>
      <p className={`mt-1 text-lg font-bold text-[#202743] dark:text-white`}>{value}</p>
    </div>
  );
}

function TaskHero({
  actionLabel,
  activeCount,
  metric,
  onCycleMomentum,
  onOpenFocusPlanner,
  onOpenMomentumDetails,
  todayCount,
}: {
  actionLabel: string;
  activeCount: number;
  metric: {
    doneTasks: Task[];
    label: string;
    percent: number;
    remainingTasks: Task[];
    summary: string;
    totalCount: number;
  };
  onCycleMomentum: () => void;
  onOpenFocusPlanner: () => void;
  onOpenMomentumDetails: () => void;
  todayCount: number;
}) {
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleMomentumPressStart = () => {
    clearLongPress();
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      onOpenMomentumDetails();
    }, 450);
  };

  const handleMomentumPressEnd = () => {
    const triggered = longPressTriggeredRef.current;
    clearLongPress();
    if (!triggered) {
      onCycleMomentum();
    }
    longPressTriggeredRef.current = false;
  };

  return (
    <section className="pt-8 w-full flex flex-col items-center text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <h1 className={`text-[clamp(2rem,4vw,3rem)] font-black tracking-tight text-[#17203a] dark:text-white`}>
            Tasks
          </h1>
          <StatusBadge tone="success">Synced</StatusBadge>
        </div>
        <p className={`mt-1 max-w-2xl text-sm text-[#727a95] dark:text-white/55`}>
          A cleaner task cockpit built for focus recovery, energy-aware planning, and visible momentum.
        </p>
      </div>
      <StatusBadge tone="warn">Overstimulated</StatusBadge>

      <button
        className={`mt-6 flex w-full max-w-md items-center justify-center rounded-[1.75rem] px-6 py-5 text-lg font-bold shadow-[0_18px_45px_rgba(116,92,255,0.22)] transition hover:-translate-y-0.5 ${
          "bg-[linear-gradient(90deg,#8f6df8_0%,#7359f5_100%)] text-white dark:bg-[linear-gradient(90deg,#b39dff_0%,#7d68f8_100%)] dark:text-[#171127]"
        }`}
        onClick={onOpenFocusPlanner}
        type="button"
      >
        {actionLabel}
      </button>

      <div className="mt-4 w-full flex flex-col justify-center gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <p className={`text-xl font-bold text-[#1e2642] dark:text-white`}>{metric.label}</p>
              <span className={`rounded-full px-2 py-1 text-xs font-semibold bg-[#ffe3ea] text-[#f05566] dark:bg-[#472436] dark:text-[#ff9aac]`}>
                {metric.percent}%
              </span>
            </div>
            <p className={`text-right text-sm font-bold sm:text-lg text-[#58637f] dark:text-white/65`}>
              {metric.summary}
            </p>
          </div>
          <button
            className={`block h-4 w-full overflow-hidden rounded-full bg-[#eceffa] dark:bg-white/8`}
            onPointerCancel={clearLongPress}
            onPointerDown={handleMomentumPressStart}
            onPointerLeave={clearLongPress}
            onPointerUp={handleMomentumPressEnd}
            type="button"
          >
            <div
              className={`h-full rounded-full bg-[linear-gradient(90deg,#c5b4ff_0%,#7f6af7_100%)] dark:bg-[linear-gradient(90deg,#cabfff_0%,#8e79ff_100%)]`}
              style={{ width: `${Math.max(metric.percent, 10)}%` }}
            />
          </button>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <HeroMetaCard label="Today" value={todayCount} />
          <HeroMetaCard label="In Play" value={activeCount} />
          <HeroMetaCard label="Tracked" value={metric.totalCount} />
        </div>
      </div>

      <p className={`mt-4 text-center text-[11px] font-semibold uppercase tracking-[0.28em] text-[#a2a7b8] dark:text-white/35`}>
        Tap to switch / Long press to see list
      </p>
    </section>
  );
}

function StatusBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "success" | "warn";
}) {
  const className = tone === "success"
    ? "bg-[#e7faf4] text-[#0e9b74] dark:bg-[#103c33] dark:text-[#6ef0c4]"
    : "bg-[#fff1f3] text-[#f05566] dark:bg-[#44232f] dark:text-[#ff9eaf]";

  return (
    <span className={`rounded-full px-4 py-2 text-sm font-bold ${className}`}>
      {children}
    </span>
  );
}

function HeroMetaCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className={`rounded-[1.2rem] px-4 py-3 transition hover:-translate-y-0.5 bg-white shadow-[0_10px_30px_rgba(81,61,168,0.08)] dark:bg-white/8`}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a84a3] dark:text-white/35`}>{label}</p>
      <p className={`mt-1 text-2xl font-bold text-[#1f2846] dark:text-white`}>{value}</p>
    </div>
  );
}

function ControlBar({
  onOpenComposer,
  onOpenImport,
  onSearchChange,
  onViewChange,
  search,
  view,
}: {
  onOpenComposer: () => void;
  onOpenImport: () => void;
  onSearchChange: (search: string) => void;
  onViewChange: (view: TaskViewMode) => void;
  search: string;
  view: TaskViewMode;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <label className={`flex min-w-0 flex-1 items-center gap-3 rounded-[1.4rem] px-4 py-3 bg-white shadow-[0_10px_28px_rgba(81,61,168,0.08)] dark:bg-white/8`}>
        <Search className={`h-5 w-5 shrink-0 text-[#6f57f6] dark:text-[#c9bbff]`} />
        <input
          className={`min-w-0 flex-1 bg-transparent text-base outline-none text-[#27304c] placeholder:text-[#97a0b9] dark:text-white dark:placeholder:text-white/35`}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search tasks..."
          value={search}
        />
      </label>
      <label className={`flex items-center gap-3 rounded-[1.4rem] px-4 py-3 bg-white shadow-[0_10px_28px_rgba(81,61,168,0.08)] dark:bg-white/8`}>
        <span className={`text-sm font-semibold text-[#6b738f] dark:text-white/60`}>View</span>
        <select
          className={`bg-transparent text-base font-semibold outline-none text-[#27304c] dark:text-white`}
          onChange={(event) => onViewChange(event.target.value as TaskViewMode)}
          value={view}
        >
          <option value="list">List</option>
          <option value="cards">Cards</option>
          <option value="matrix">Matrix</option>
          <option value="grid">Grid</option>
        </select>
      </label>
      <button
        className={`rounded-full px-5 py-3 text-base font-semibold bg-white text-[#27304c] shadow-[0_10px_28px_rgba(81,61,168,0.08)] dark:bg-white/8 dark:text-white`}
        onClick={onOpenImport}
        type="button"
      >
        Import
      </button>
      <button
        className={`rounded-full px-6 py-3 text-base font-semibold ${
          "bg-[#6f57f6] text-white shadow-[0_14px_32px_rgba(111,87,246,0.24)] dark:bg-[#c9bbff] dark:text-[#1a1431]"
        }`}
        onClick={onOpenComposer}
        type="button"
      >
        + New
      </button>
    </div>
  );
}

function FilterRows({
  activeCount,
  doneCount,
  focusedCount,
  matchAny,
  onToggleEnergy,
  onToggleMatchMode,
  onToggleQuickFilter,
  overdueCount,
  selectedEnergies,
  selectedQuickFilters,
  todayCount,
}: {
  activeCount: number;
  doneCount: number;
  focusedCount: number;
  matchAny: boolean;
  onToggleEnergy: (energy: TaskEnergy) => void;
  onToggleMatchMode: () => void;
  onToggleQuickFilter: (filter: TaskQuickFilter) => void;
  overdueCount: number;
  selectedEnergies: TaskEnergy[];
  selectedQuickFilters: TaskQuickFilter[];
  todayCount: number;
}) {
  return (
    <div className="mt-5 space-y-3">
      <div className="flex flex-wrap gap-3">
        <FilterChip active={selectedQuickFilters.includes("active")} count={activeCount} onClick={() => onToggleQuickFilter("active")} tone="purple">Active</FilterChip>
        <FilterChip active={selectedQuickFilters.includes("today")} count={todayCount} onClick={() => onToggleQuickFilter("today")} tone="orange">Due Today</FilterChip>
        <FilterChip active={selectedQuickFilters.includes("urgent")} count={overdueCount} onClick={() => onToggleQuickFilter("urgent")} tone="red">Urgent</FilterChip>
        <FilterChip active={selectedQuickFilters.includes("focused")} count={focusedCount} onClick={() => onToggleQuickFilter("focused")} tone="purple">Focused</FilterChip>
        <FilterChip active={selectedQuickFilters.includes("done")} count={doneCount} onClick={() => onToggleQuickFilter("done")} tone="neutral">Done</FilterChip>
      </div>
      <div className="flex flex-wrap gap-3">
        <Pill onClick={onToggleMatchMode} selected>{matchAny ? "OR" : "AND"}</Pill>
        {energyOptions.map((energy) => (
          <Pill
            key={energy}
            onClick={() => onToggleEnergy(energy)}
            selected={selectedEnergies.includes(energy)}
          >
            {energy}
          </Pill>
        ))}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  children,
  count,
  onClick,
  tone,
}: {
  active?: boolean;
  children: React.ReactNode;
  count: number;
  onClick?: () => void;
  tone: FilterChipTone;
}) {
  const className = tone === "purple"
    ? "border-[#d7cbff] bg-[#f7f2ff] text-[#6f57f6] dark:border-[#5b4bad] dark:bg-[#1c1734] dark:text-[#c9bbff]"
    : tone === "orange"
      ? "border-[#ffd7bf] bg-[#fff6ef] text-[#f39a4d] dark:border-[#8c5631] dark:bg-[#2f2016] dark:text-[#ffc393]"
      : tone === "red"
        ? "border-[#ffc6d1] bg-[#fff4f6] text-[#f05566] dark:border-[#7b3646] dark:bg-[#2e161f] dark:text-[#ff9eaf]"
        : "border-[#e1e4ee] bg-white text-[#4b556e] dark:border-white/10 dark:bg-white/6 dark:text-white/75";

  return (
    <button
      className={`rounded-full border px-4 py-2 text-base font-semibold transition ${active ? "ring-2 ring-[#6f57f6]/35" : ""} ${className}`}
      onClick={onClick}
      type="button"
    >
      {children} <span className="opacity-70">{count}</span>
    </button>
  );
}

function Pill({
  children,
  onClick,
  selected,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <button
      className={`rounded-full px-4 py-2 text-base font-semibold ${
        selected
          ? "bg-[#f4efff] text-[#6f57f6] shadow-[0_10px_24px_rgba(81,61,168,0.08)] dark:bg-[#221a42] dark:text-[#cabfff]"
          : "bg-white text-[#5c647d] shadow-[0_10px_24px_rgba(81,61,168,0.05)] dark:bg-white/8 dark:text-white/70"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function TaskGridView({
  activeCount,
  currentColumns,
  doneCount,
  draggedWidgetId,
  focusedTaskIds,
  gridLayout,
  isEditMode,
  message,
  missingWidgetTypes,
  onAddTask,
  onEditTask,
  onAddWidget,
  onImportTasks,
  onMoveWidget,
  onRemoveWidget,
  onReorderWidget,
  onResetLayout,
  onResizeWidget,
  onSelectWidget,
  onSetDraggedWidget,
  subtasksByTaskId,
  taskHistoryStats,
  onToggleEditMode,
  onToggleTask,
  overdueCount,
  selectedWidget,
  tasksByWidget,
}: {
  activeCount: number;
  currentColumns: number;
  doneCount: number;
  draggedWidgetId: string | null;
  focusedTaskIds: string[];
  gridLayout: TaskGridItem[];
  isEditMode: boolean;
  message: Message | null;
  missingWidgetTypes: TaskGridWidgetType[];
  onAddTask: (task: TaskDraft) => Promise<void>;
  onEditTask: (task: Task) => void;
  onAddWidget: (widgetType: TaskGridWidgetType) => void;
  onImportTasks: (lines: string[]) => Promise<void>;
  onMoveWidget: (widgetId: string, direction: "up" | "down") => void;
  onRemoveWidget: (widgetId: string) => void;
  onReorderWidget: (targetWidgetId: string) => void;
  onResetLayout: () => void;
  onResizeWidget: (widgetId: string, nextWidth: number, nextHeight: number) => void;
  onSelectWidget: (widgetId: string | null) => void;
  onSetDraggedWidget: (widgetId: string | null) => void;
  subtasksByTaskId: Record<string, DbTaskSubtask[]>;
  taskHistoryStats: TaskHistoryStats;
  onToggleEditMode: () => void;
  onToggleTask: (task: Task) => void;
  overdueCount: number;
  selectedWidget: TaskGridItem | null;
  tasksByWidget: {
    activeQueue: Task[];
    completed: Task[];
    dueToday: Task[];
    focusToday: Task[];
    urgent: Task[];
  };
}) {
  const widthPresets = getTaskGridWidthPresets(currentColumns);
  const heightPresets = getTaskGridHeightPresets();
  const presentWidgetTypes = new Set(gridLayout.map((item) => item.type));
  const allWidgetTypes = Object.keys(TASK_GRID_WIDGET_LABELS) as TaskGridWidgetType[];
  const hiddenWidgetCount = allWidgetTypes.length - presentWidgetTypes.size;

  return (
    <section className="mt-7 space-y-4">
      <div className={`rounded-[1.7rem] border p-4 border-[#ece8f8] bg-white shadow-[0_16px_40px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className={`text-xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white`}>
              Grid View
            </h2>
            <p className={`mt-1 text-sm text-[#78829c] dark:text-white/55`}>
              A modular tasks layout that keeps mobile in sync with desktop.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isEditMode ? (
              <button
                className={`rounded-full px-4 py-3 text-sm font-semibold bg-[#fff4f6] text-[#d94e67] dark:bg-[#432330] dark:text-[#ffb2bf]`}
                onClick={onResetLayout}
                type="button"
              >
                Reset Layout
              </button>
            ) : null}
            <button
              className={`rounded-full px-5 py-3 text-sm font-semibold ${isEditMode
                ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]"
                : "bg-[#f3efff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]"}`}
              onClick={onToggleEditMode}
              type="button"
            >
              {isEditMode ? "Done Editing" : "Edit Layout"}
            </button>
          </div>
        </div>

        {isEditMode ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-2 text-xs font-semibold bg-[#eef2ff] text-[#5363d3] dark:bg-[#1b2340] dark:text-[#a9b6ff]`}>
                {currentColumns} active column{currentColumns === 1 ? "" : "s"}
              </span>
              <span className={`rounded-full px-3 py-2 text-xs font-semibold bg-[#f3efff] text-[#6f57f6] dark:bg-[#221a42] dark:text-[#cabfff]`}>
                {gridLayout.length} widget{gridLayout.length === 1 ? "" : "s"} on grid
              </span>
              <span className={`rounded-full px-3 py-2 text-xs font-semibold bg-[#f7f7fb] text-[#68738c] dark:bg-white/8 dark:text-white/65`}>
                {hiddenWidgetCount} hidden
              </span>
            </div>
            <div className={`rounded-[1.25rem] px-4 py-3 text-sm bg-[#faf7ff] text-[#6b738f] dark:bg-white/[0.04] dark:text-white/65`}>
              Tap a widget to select it. Each widget also shows a visible delete button while editing. Drag to reorder on desktop, or use move controls anywhere. On mobile, width presets map to the current column count automatically.
            </div>

            <div className={`rounded-[1.25rem] border p-4 border-[#e9e1ff] bg-[#fcfbff] dark:border-white/10 dark:bg-white/[0.04]`}>
              <p className={`text-sm font-black uppercase tracking-[0.18em] text-[#7a63f7] dark:text-[#c9bbff]`}>Add Widgets</p>
              <p className={`mt-1 text-sm text-[#6b738f] dark:text-white/60`}>
                Turn sections on and off here. This list always shows every widget, whether it is currently on the grid or not.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {allWidgetTypes.map((widgetType) => {
                  const isPresent = presentWidgetTypes.has(widgetType);
                  const existingWidget = gridLayout.find((item) => item.type === widgetType) ?? null;

                  return (
                    <div
                      className={`flex items-center justify-between gap-3 rounded-[1rem] px-3 py-3 bg-white shadow-[0_8px_20px_rgba(81,61,168,0.05)] dark:bg-white/[0.04]`}
                      key={widgetType}
                    >
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-semibold text-[#27304c] dark:text-white`}>
                          {TASK_GRID_WIDGET_LABELS[widgetType]}
                        </p>
                        <p className={`mt-0.5 text-xs text-[#8a93aa] dark:text-white/45`}>
                          {isPresent ? "On grid" : "Hidden"}
                        </p>
                      </div>
                      {isPresent && existingWidget ? (
                        <button
                          className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold bg-[#fff1f3] text-[#f05566] dark:bg-[#44232f] dark:text-[#ff9eaf]`}
                          onClick={() => onRemoveWidget(existingWidget.id)}
                          type="button"
                        >
                          Remove
                        </button>
                      ) : (
                        <button
                          className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold bg-[#edf2ff] text-[#4a5fd3] dark:bg-[#182138] dark:text-[#a7b8ff]`}
                          onClick={() => onAddWidget(widgetType)}
                          type="button"
                        >
                          <Plus className="mr-1 inline h-3.5 w-3.5" />
                          Add
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedWidget ? (
              <div className={`rounded-[1.25rem] border border-dashed px-4 py-4 text-sm border-[#ddd6f9] bg-[#faf8ff] text-[#7b84a0] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55`}>
                {TASK_GRID_WIDGET_LABELS[selectedWidget.type]} is selected. Its resize and row controls now appear directly on top of that card.
              </div>
            ) : (
              <div className={`rounded-[1.25rem] border border-dashed px-4 py-4 text-sm border-[#ddd6f9] bg-[#faf8ff] text-[#7b84a0] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55`}>
                Tap any widget card below to resize it, move it, or remove it.
              </div>
            )}
          </div>
        ) : null}
      </div>

      {gridLayout.length === 0 ? (
        <div className={`rounded-[1.8rem] border border-dashed p-8 text-center border-[#dcd2ff] bg-[#faf8ff] text-[#6b738f] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/65`}>
          <p className="text-lg font-bold">Your grid is empty.</p>
          <p className="mt-2 text-sm">Turn on edit mode and add widgets back in any order you want.</p>
        </div>
      ) : null}

      <div
        className="grid gap-4 md:gap-5"
        style={{
          gridAutoRows: `${TASK_GRID_ROW_HEIGHT}px`,
          gridTemplateColumns: `repeat(${currentColumns}, minmax(0, 1fr))`,
        }}
      >
        {gridLayout.map((item) => (
          <TaskGridWidgetShell
            currentColumns={currentColumns}
            draggedWidgetId={draggedWidgetId}
            isEditMode={isEditMode}
            item={item}
            key={item.id}
            onDrop={() => onReorderWidget(item.id)}
            onDragStart={() => onSetDraggedWidget(item.id)}
            onDragEnd={() => onSetDraggedWidget(null)}
            onDeselect={() => onSelectWidget(null)}
            onRemove={() => onRemoveWidget(item.id)}
            onResize={onResizeWidget}
            onMove={onMoveWidget}
            onSelect={() => onSelectWidget(item.id)}
            selected={selectedWidget?.id === item.id}
            widthPresets={widthPresets}
            heightPresets={heightPresets}
          >
            {item.type === "urgent" ? (
              <UrgentTasksPanel
                focusedTaskIds={focusedTaskIds}
                onEditTask={onEditTask}
                onToggle={onToggleTask}
                subtasksByTaskId={subtasksByTaskId}
                tasks={tasksByWidget.urgent}
              />
            ) : item.type === "focus_today" ? (
              <TaskLane
                count={tasksByWidget.focusToday.length}
                defaultExpanded
                onEditTask={onEditTask}
                subtasksByTaskId={subtasksByTaskId}
                tasks={tasksByWidget.focusToday}
                title="Focus Today"
                tone="purple"
              />
            ) : item.type === "due_today" ? (
              <TaskLane
                count={tasksByWidget.dueToday.length}
                onEditTask={onEditTask}
                subtasksByTaskId={subtasksByTaskId}
                tasks={tasksByWidget.dueToday}
                title="Due Today"
                tone="purple"
              />
            ) : item.type === "active_queue" ? (
              <TaskLane
                count={tasksByWidget.activeQueue.length}
                onEditTask={onEditTask}
                subtasksByTaskId={subtasksByTaskId}
                tasks={tasksByWidget.activeQueue}
                title="Active Queue"
                tone="soft"
              />
            ) : item.type === "completed" ? (
              <TaskLane
                count={tasksByWidget.completed.length}
                onEditTask={onEditTask}
                subtasksByTaskId={subtasksByTaskId}
                tasks={tasksByWidget.completed}
                title="Completed"
                tone="soft"
              />
            ) : item.type === "quick_capture" ? (
              <div id="task-composer-card">
                <TaskComposerCard onAdd={onAddTask} />
              </div>
            ) : item.type === "import" ? (
              <div id="task-import-panel">
                <ImportWidgetCard message={message} onImport={onImportTasks} />
              </div>
            ) : (
              <FocusStatsCard
                activeCount={activeCount}
                doneCount={doneCount}
                overdueCount={overdueCount}
                taskHistoryStats={taskHistoryStats}
              />
            )}
          </TaskGridWidgetShell>
        ))}
      </div>
    </section>
  );
}

function TaskGridWidgetShell({
  children,
  currentColumns,
  draggedWidgetId,
  heightPresets,
  isEditMode,
  item,
  onDragEnd,
  onDragStart,
  onDeselect,
  onMove,
  onDrop,
  onRemove,
  onResize,
  onSelect,
  selected,
  widthPresets,
}: {
  children: React.ReactNode;
  currentColumns: number;
  draggedWidgetId: string | null;
  heightPresets: Array<{ label: string; span: number }>;
  isEditMode: boolean;
  item: TaskGridItem;
  onDragEnd: () => void;
  onDragStart: () => void;
  onDeselect: () => void;
  onMove: (widgetId: string, direction: "up" | "down") => void;
  onDrop: () => void;
  onRemove: () => void;
  onResize: (widgetId: string, nextWidth: number, nextHeight: number) => Promise<void> | void;
  onSelect: () => void;
  selected: boolean;
  widthPresets: Array<{ label: string; width: number }>;
}) {
  const widthSpan = Math.max(1, Math.min(item.w, currentColumns));

  return (
    <div
      className={`relative min-w-0 ${isEditMode ? "cursor-grab" : ""} ${draggedWidgetId === item.id ? "opacity-60" : ""}`}
      draggable={isEditMode}
      onClick={() => {
        if (isEditMode && !selected) {
          onSelect();
        }
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (isEditMode) {
          event.preventDefault();
        }
      }}
      onDragStart={onDragStart}
      onDrop={(event) => {
        if (isEditMode) {
          event.preventDefault();
          onDrop();
        }
      }}
      style={{
        gridColumn: currentColumns === TASK_GRID_MAX_COLUMNS
          ? `${Math.min(item.x + 1, TASK_GRID_MAX_COLUMNS)} / span ${widthSpan}`
          : `span ${widthSpan} / span ${widthSpan}`,
        gridRow: currentColumns === TASK_GRID_MAX_COLUMNS
          ? `${item.y + 1} / span ${item.h}`
          : `span ${item.h} / span ${item.h}`,
      }}
    >
      {isEditMode ? (
        <div className={`pointer-events-none absolute inset-0 z-10 rounded-[2rem] border-2 ${selected
          ? "border-[#6f57f6] shadow-[0_0_0_4px_rgba(111,87,246,0.16)] dark:border-[#cabfff] dark:shadow-[0_0_0_4px_rgba(202,191,255,0.12)]"
          : "border-[#dcd2ff] dark:border-white/15"}`} />
      ) : null}
      {isEditMode ? (
        <div className={`absolute left-4 top-4 z-20 rounded-full px-3 py-1 text-xs font-semibold bg-white text-[#6f57f6] shadow-[0_10px_24px_rgba(81,61,168,0.12)] dark:bg-[#171328] dark:text-[#cabfff]`}>
          <GripVertical className="mr-1 inline h-3.5 w-3.5" />
          {TASK_GRID_WIDGET_LABELS[item.type]}
        </div>
      ) : null}
      {isEditMode ? (
        <button
          aria-label={`Remove ${TASK_GRID_WIDGET_LABELS[item.type]}`}
          className={`absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-[#fff1f3] text-[#f05566] shadow-[0_10px_24px_rgba(240,85,102,0.12)] dark:bg-[#44232f] dark:text-[#ff9eaf]`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          type="button"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
      {isEditMode && selected ? (
        <TaskGridSelectedOverlay
          currentColumns={currentColumns}
          heightPresets={heightPresets}
          item={item}
          onClose={onDeselect}
          onMove={onMove}
          onRemove={onRemove}
          onResize={onResize}
          widthPresets={widthPresets}
        />
      ) : null}
      <div className={`h-full min-h-0 overflow-hidden ${isEditMode ? "pointer-events-none" : ""}`}>
        <div className={`h-full min-h-0 overflow-y-auto ${isEditMode && selected ? "pb-56" : ""}`}>
          {children}
        </div>
      </div>
    </div>
  );
}

function TaskGridSelectedOverlay({
  currentColumns,
  heightPresets,
  item,
  onClose,
  onMove,
  onRemove,
  onResize,
  widthPresets,
}: {
  currentColumns: number;
  heightPresets: Array<{ label: string; span: number }>;
  item: TaskGridItem;
  onClose: () => void;
  onMove: (widgetId: string, direction: "up" | "down") => void;
  onRemove: () => void;
  onResize: (widgetId: string, nextWidth: number, nextHeight: number) => Promise<void> | void;
  widthPresets: Array<{ label: string; width: number }>;
}) {
  const [customRowsInput, setCustomRowsInput] = useState(String(getDisplayRowsFromSpan(item.h)));

  useEffect(() => {
    setCustomRowsInput(String(getDisplayRowsFromSpan(item.h)));
  }, [item.h, item.id]);

  const parsedCustomRows = Number.parseInt(customRowsInput, 10);
  const clampedCustomRows = Number.isFinite(parsedCustomRows)
    ? Math.max(1, Math.min(TASK_GRID_MAX_DISPLAY_ROWS, parsedCustomRows))
    : null;

  function stopOverlayEvent(event: React.SyntheticEvent) {
    event.stopPropagation();
  }

  async function applyCustomRows() {
    if (clampedCustomRows === null) {
      return;
    }

    await onResize(item.id, item.w, getSpanFromDisplayRows(clampedCustomRows));
    onClose();
  }

  return (
    <div
      className={`absolute inset-x-3 bottom-3 z-30 rounded-[1.35rem] border p-3 border-[#ddd4ff] bg-white/95 shadow-[0_18px_36px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]/95`}
      draggable={false}
      onClick={stopOverlayEvent}
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={stopOverlayEvent}
      onPointerDown={stopOverlayEvent}
      onTouchStart={stopOverlayEvent}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-xs font-black uppercase tracking-[0.18em] text-[#7a63f7] dark:text-[#c9bbff]`}>
          {TASK_GRID_WIDGET_LABELS[item.type]}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className={`rounded-full px-3 py-1.5 text-xs font-semibold bg-white text-[#5c647d] shadow-[0_8px_20px_rgba(81,61,168,0.06)] dark:bg-white/8 dark:text-white/75`}
            draggable={false}
            onClick={() => onMove(item.id, "up")}
            type="button"
          >
            Up
          </button>
          <button
            className={`rounded-full px-3 py-1.5 text-xs font-semibold bg-white text-[#5c647d] shadow-[0_8px_20px_rgba(81,61,168,0.06)] dark:bg-white/8 dark:text-white/75`}
            draggable={false}
            onClick={() => onMove(item.id, "down")}
            type="button"
          >
            Down
          </button>
          <button
            className={`rounded-full px-3 py-1.5 text-xs font-semibold bg-[#fff1f3] text-[#f05566] dark:bg-[#44232f] dark:text-[#ff9eaf]`}
            draggable={false}
            onClick={onRemove}
            type="button"
          >
            Remove
          </button>
        </div>
      </div>
      <div className="mt-3 space-y-3">
        <div>
          <p className={`mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#8b84a6] dark:text-white/40`}>Width</p>
          <div className="flex flex-wrap gap-2">
            {widthPresets.map((preset) => (
              <button
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${Math.min(item.w, currentColumns) === preset.width
                  ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]"
                  : "bg-white text-[#5c647d] shadow-[0_8px_20px_rgba(81,61,168,0.06)] dark:bg-white/8 dark:text-white/75"}`}
                draggable={false}
                key={preset.label}
                onClick={() => onResize(item.id, preset.width, item.h)}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className={`mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#8b84a6] dark:text-white/40`}>Rows</p>
          <div className="flex flex-wrap gap-2">
            {heightPresets.map((preset) => (
              <button
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${item.h === preset.span
                  ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]"
                  : "bg-white text-[#5c647d] shadow-[0_8px_20px_rgba(81,61,168,0.06)] dark:bg-white/8 dark:text-white/75"}`}
                draggable={false}
                key={preset.label}
                onClick={() => onResize(item.id, item.w, preset.span)}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void applyCustomRows();
          }}
        >
          <label className="min-w-0 flex-1">
            <span className={`mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-[#8b84a6] dark:text-white/40`}>Custom Rows</span>
            <input
              className={`h-11 w-full rounded-[0.9rem] px-3 text-sm outline-none bg-[#f7f5ff] text-[#1f2642] dark:bg-white/8 dark:text-white`}
              draggable={false}
              inputMode="numeric"
              max={String(TASK_GRID_MAX_DISPLAY_ROWS)}
              min="1"
              onChange={(event) => setCustomRowsInput(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter" && clampedCustomRows !== null) {
                  event.preventDefault();
                  void applyCustomRows();
                }
              }}
              type="number"
              value={customRowsInput}
            />
          </label>
          <button
            className={`h-11 rounded-[0.9rem] px-4 text-sm font-semibold bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]`}
            disabled={clampedCustomRows === null}
            draggable={false}
            onClick={(event) => {
              event.stopPropagation();
              void applyCustomRows();
            }}
            type="submit"
          >
            Apply
          </button>
        </form>
      </div>
    </div>
  );
}

function UrgentTasksPanel({
  focusedTaskIds,
  onEditTask,
  tasks,
  subtasksByTaskId,
  onToggle,
}: {
  focusedTaskIds: string[];
  onEditTask: (task: Task) => void;
  tasks: Task[];
  subtasksByTaskId: Record<string, DbTaskSubtask[]>;
  onToggle: (task: Task) => void;
}) {
  const DEFAULT_VISIBLE_COUNT = 4;
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleTasks = isExpanded ? tasks : tasks.slice(0, DEFAULT_VISIBLE_COUNT);
  const hiddenCount = Math.max(0, tasks.length - visibleTasks.length);

  return (
    <section className={`w-full overflow-hidden rounded-[2rem] border p-5 transition hover:-translate-y-0.5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6`}>
      <div className="flex min-w-0 items-center justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full bg-[#f05566] dark:bg-[#ff9eaf]`} />
          <h2 className={`text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white`}>
            Urgent Tasks
          </h2>
        </div>
        <span className={`text-2xl font-bold text-[#939ab0] dark:text-white/45`}>
          {tasks.length}
        </span>
      </div>

      <div className="mt-5 space-y-5">
        {tasks.length === 0 ? (
          <EmptyTaskState text="No urgent tasks match the current filters." />
        ) : null}
        {visibleTasks.map((task, index) => (
          <article
            className={`w-full overflow-hidden rounded-[1.4rem] border p-4 transition border-[#ede8fb] bg-[#fcfbff] dark:border-white/10 dark:bg-white/[0.04]`}
            key={task.id}
          >
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`h-4 w-4 shrink-0 rounded-full ${index < 2 ? "bg-[#f05566]" : "bg-[#12b886]"}`} />
                  <button
                    className={`min-w-0 truncate text-left text-[1.55rem] font-semibold text-[#202844] dark:text-white`}
                    onClick={() => onEditTask(task)}
                    type="button"
                  >
                    {task.title}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {focusedTaskIds.includes(task.id) ? <TaskMetaChip tone="purple">Focus Today</TaskMetaChip> : null}
                  <TaskMetaChip tone="neutral">{task.priority} priority</TaskMetaChip>
                  <TaskMetaChip tone="green">{task.energy}</TaskMetaChip>
                  <TaskMetaChip tone="neutral">{formatDueLabel(task.due_on)}</TaskMetaChip>
                </div>
                <TaskSupplementalMeta nextSubtask={getNextPendingSubtask(task.id, subtasksByTaskId)} task={task} />
              </div>
              <div className="flex w-full gap-2 sm:w-auto sm:shrink-0">
                <button
                  className={`w-full rounded-full px-4 py-2 text-sm font-semibold sm:w-auto bg-[#f2edff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`}
                  onClick={() => onEditTask(task)}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className={`w-full rounded-full px-4 py-2 text-sm font-semibold sm:w-auto bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]`}
                  onClick={() => onToggle(task)}
                  type="button"
                >
                  Done
                </button>
              </div>
            </div>

            <ul className="mt-5 space-y-2">
              {taskChecklist(task.title).map((item, itemIndex) => (
                <li className="flex items-center gap-3" key={`${task.id}-${itemIndex}`}>
                  <span className={`h-3 w-3 rounded-full ${item.done ? "bg-[#18c58f]" : "bg-[#f05566]"}`} />
                  <span className={`${item.done ? "line-through opacity-50" : ""} text-[#525d78] dark:text-white/72`}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
        {tasks.length > DEFAULT_VISIBLE_COUNT ? (
          <button
            className={`flex w-full items-center justify-center gap-2 rounded-[1.1rem] border px-4 py-3 text-sm font-semibold border-[#e6defb] bg-[#faf7ff] text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.04] dark:text-[#cabfff]`}
            onClick={() => setIsExpanded((prev) => !prev)}
            type="button"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {isExpanded ? "Show fewer urgent tasks" : `Show ${hiddenCount} more urgent task${hiddenCount === 1 ? "" : "s"}`}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function TaskMetaChip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "blue" | "purple" | "green" | "neutral";
}) {
  const className = tone === "blue"
    ? "bg-[#edf6ff] text-[#3f8bdc] dark:bg-[#162434] dark:text-[#8bc4ff]"
    : tone === "purple"
      ? "bg-[#f2edff] text-[#7a63f7] dark:bg-[#22193f] dark:text-[#c7b9ff]"
      : tone === "green"
        ? "bg-[#e8fbf2] text-[#0fa774] dark:bg-[#14362c] dark:text-[#7de4b8]"
        : "bg-[#f4f5f8] text-[#68738c] dark:bg-white/8 dark:text-white/60";

  return (
    <span className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${className}`}>
      {children}
    </span>
  );
}

function TaskSupplementalMeta({
  nextSubtask,
  task,
}: {
  nextSubtask: DbTaskSubtask | null;
  task: Task;
}) {
  const repeatSummary = formatRepeatSummary(task);
  const visibleTags = task.tags.slice(0, 3);

  if (
    visibleTags.length === 0 &&
    !repeatSummary &&
    !task.external_link_url &&
    !task.estimated_minutes &&
    !nextSubtask
  ) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {task.one_step_at_a_time && nextSubtask ? (
        <TaskMetaChip tone="purple">Next: {nextSubtask.title}</TaskMetaChip>
      ) : null}
      {visibleTags.map((tag) => (
        <TaskMetaChip key={tag} tone="neutral">#{tag}</TaskMetaChip>
      ))}
      {task.estimated_minutes ? (
        <TaskMetaChip tone="neutral">{task.estimated_minutes} min</TaskMetaChip>
      ) : null}
      {repeatSummary ? (
        <TaskMetaChip tone="blue">{repeatSummary}</TaskMetaChip>
      ) : null}
      {task.external_link_url ? (
        <a
          className={`rounded-xl px-3 py-1.5 text-sm font-semibold bg-[#edf6ff] text-[#3f8bdc] dark:bg-[#162434] dark:text-[#8bc4ff]`}
          href={task.external_link_url}
          rel="noreferrer"
          target="_blank"
        >
          {task.external_link_label || "Open link"}
        </a>
      ) : null}
    </div>
  );
}

function TaskComposerCard({
  onAdd,
}: {
  onAdd: (task: TaskDraft) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [energy, setEnergy] = useState<TaskEnergy>("medium");
  const [dueOn, setDueOn] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <section className={`rounded-[2rem] border p-5 transition hover:-translate-y-0.5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6`}>
      <div className="mb-4">
        <h2 className={`text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white`}>
          Quick Capture
        </h2>
        <p className={`mt-2 text-sm text-[#78829c] dark:text-white/55`}>
          Keep the task cards focused. Capture one next action, assign energy, and move on.
        </p>
      </div>

      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const trimmedTitle = title.trim();
          if (!trimmedTitle) return;

          setIsSubmitting(true);
          await onAdd({
            title: trimmedTitle,
            priority,
            energy,
            due_on: dueOn || null,
          });
          setTitle("");
          setDueOn("");
          setIsSubmitting(false);
        }}
      >
        <label className="block">
          <span className="sr-only">Task title</span>
          <input
            className={`h-14 w-full rounded-[1.25rem] px-4 text-lg outline-none bg-[#f7f5ff] text-[#1f2642] placeholder:text-[#9b9fba] dark:bg-white/8 dark:text-white dark:placeholder:text-white/30`}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Drink water, clear email, write first paragraph..."
            value={title}
          />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <Select label="Priority" onChange={setPriority} options={priorityOptions} value={priority} />
          <Select label="Energy" onChange={setEnergy} options={energyOptions} value={energy} />
        </div>
        <label className="block">
          <span className="sr-only">Due date</span>
          <input
            className={`h-14 w-full rounded-[1.25rem] px-4 text-lg outline-none bg-[#f7f5ff] text-[#1f2642] dark:bg-white/8 dark:text-white`}
            onChange={(event) => setDueOn(event.target.value)}
            type="date"
            value={dueOn}
          />
        </label>
        <button
          className={`w-full rounded-[1.25rem] px-5 py-4 text-lg font-bold bg-[#6f57f6] text-white shadow-[0_14px_32px_rgba(111,87,246,0.24)] dark:bg-[#cabfff] dark:text-[#1a1431]`}
          disabled={isSubmitting}
          type="submit"
        >
          Add Task
        </button>
      </form>
    </section>
  );
}

function SupportPanel({
  doneCount,
  lowEnergyTasks,
  message,
  onImport,
}: {
  doneCount: number;
  lowEnergyTasks: Task[];
  message: Message | null;
  onImport: (lines: string[]) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lines = text
    .split("\n")
    .map((line) => line.trim().replace(/^[-*]\s+/, ""))
    .filter(Boolean);

  return (
    <div className="grid gap-5">
      <section className={`rounded-[2rem] border p-5 transition hover:-translate-y-0.5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6`}>
        <h2 className={`text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white`}>
          Low Energy Wins
        </h2>
        <div className="mt-4 space-y-3">
          {lowEnergyTasks.length === 0 ? (
            <EmptyTaskState text="No low-energy tasks match the current filters." />
          ) : null}
          {lowEnergyTasks.map((task) => (
            <div className={`rounded-[1.25rem] px-4 py-3 bg-[#f8f5ff] dark:bg-white/8`} key={task.id}>
              <p className={`text-base font-semibold text-[#26304c] dark:text-white`}>{task.title}</p>
              <p className={`mt-1 text-sm text-[#7d88a1] dark:text-white/55`}>{formatDueLabel(task.due_on)} / low effort</p>
            </div>
          ))}
        </div>
      </section>

      <section className={`rounded-[2rem] border p-5 transition hover:-translate-y-0.5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6`}>
        <h2 className={`text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white`}>
          Import List
        </h2>
        <p className={`mt-2 text-sm text-[#78829c] dark:text-white/55`}>
          Paste a rough list and turn it into calm, structured tasks.
        </p>

        <form
          className="mt-4 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setIsSubmitting(true);
            await onImport(lines);
            setText("");
            setIsSubmitting(false);
          }}
        >
          <textarea
            className={`min-h-36 w-full resize-y rounded-[1.25rem] px-4 py-4 text-base outline-none bg-[#f7f5ff] text-[#1f2642] placeholder:text-[#9b9fba] dark:bg-white/8 dark:text-white dark:placeholder:text-white/30`}
            onChange={(event) => setText(event.target.value)}
            placeholder={"Call dentist\nDrink water\nChoose dinner"}
            value={text}
          />
          <button
            className={`w-full rounded-[1.25rem] px-5 py-4 text-lg font-bold bg-[#ede8ff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`}
            disabled={lines.length === 0 || isSubmitting}
            type="submit"
          >
            Import {lines.length || ""}
          </button>
        </form>

        <p className={`mt-3 text-sm text-[#8c94ac] dark:text-white/45`}>
          {message?.text}
        </p>
      </section>

      <section className={`rounded-[2rem] border p-5 transition hover:-translate-y-0.5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6`}>
        <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/35`}>Completed</p>
        <p className={`mt-2 text-4xl font-black text-[#1f2746] dark:text-white`}>{doneCount}</p>
      </section>
    </div>
  );
}

function ImportWidgetCard({
  message,
  onImport,
}: {
  message: Message | null;
  onImport: (lines: string[]) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lines = text
    .split("\n")
    .map((line) => line.trim().replace(/^[-*]\s+/, ""))
    .filter(Boolean);

  return (
    <section className={`rounded-[2rem] border p-5 transition hover:-translate-y-0.5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6`}>
      <h2 className={`text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white`}>
        Import List
      </h2>
      <p className={`mt-2 text-sm text-[#78829c] dark:text-white/55`}>
        Paste a rough list and turn it into calm, structured tasks.
      </p>

      <form
        className="mt-4 space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setIsSubmitting(true);
          await onImport(lines);
          setText("");
          setIsSubmitting(false);
        }}
      >
        <textarea
          className={`min-h-40 w-full resize-y rounded-[1.25rem] px-4 py-4 text-base outline-none bg-[#f7f5ff] text-[#1f2642] placeholder:text-[#9b9fba] dark:bg-white/8 dark:text-white dark:placeholder:text-white/30`}
          onChange={(event) => setText(event.target.value)}
          placeholder={"Call dentist\nDrink water\nChoose dinner"}
          value={text}
        />
        <button
          className={`w-full rounded-[1.25rem] px-5 py-4 text-lg font-bold bg-[#ede8ff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`}
          disabled={lines.length === 0 || isSubmitting}
          type="submit"
        >
          Import {lines.length || ""}
        </button>
      </form>

      <p className={`mt-3 text-sm text-[#8c94ac] dark:text-white/45`}>
        {message?.text}
      </p>
    </section>
  );
}

function TaskLane({
  count,
  defaultExpanded = false,
  onEditTask,
  subtasksByTaskId,
  title,
  tasks,
  tone,
}: {
  count: number;
  defaultExpanded?: boolean;
  onEditTask: (task: Task) => void;
  subtasksByTaskId: Record<string, DbTaskSubtask[]>;
  title: string;
  tasks: Task[];
  tone: "purple" | "soft";
}) {
  const DEFAULT_VISIBLE_COUNT = 3;
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const visibleTasks = isExpanded ? tasks : tasks.slice(0, DEFAULT_VISIBLE_COUNT);
  const hiddenCount = Math.max(0, tasks.length - visibleTasks.length);

  return (
    <section className={`w-full overflow-hidden rounded-[2rem] border p-5 transition hover:-translate-y-0.5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6`}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className={`text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white`}>
          {title}
        </h2>
        <div className="flex items-center gap-2">
          <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${tone === "purple"
            ? "bg-[#f2edff] text-[#725af6] dark:bg-[#22193f] dark:text-[#cabfff]"
            : "bg-[#f6f7fb] text-[#6a738d] dark:bg-white/8 dark:text-white/65"}`}>
            {count}
          </span>
          {tasks.length > DEFAULT_VISIBLE_COUNT ? (
            <button
              aria-label={isExpanded ? `Collapse ${title}` : `Expand ${title}`}
              className={`flex h-9 w-9 items-center justify-center rounded-full bg-[#f6f2ff] text-[#6f57f6] dark:bg-white/8 dark:text-[#cabfff]`}
              onClick={() => setIsExpanded((prev) => !prev)}
              type="button"
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {tasks.length === 0 ? (
          <EmptyTaskState text={`No tasks in ${title.toLowerCase()} right now.`} />
        ) : null}
        {visibleTasks.map((task, index) => (
          <div className={`w-full overflow-hidden rounded-[1.25rem] border px-4 py-3 border-[#efeaf9] bg-[#fdfcff] dark:border-white/10 dark:bg-white/[0.04]`} key={task.id}>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <button
                  className={`truncate text-left text-lg font-semibold text-[#27304c] dark:text-white`}
                  onClick={() => onEditTask(task)}
                  type="button"
                >
                  {task.title}
                </button>
                <p className={`mt-1 text-sm text-[#7d88a1] dark:text-white/55`}>
                  {formatTaskMetaLine(task)}
                </p>
                <TaskSupplementalMeta nextSubtask={getNextPendingSubtask(task.id, subtasksByTaskId)} task={task} />
              </div>
              <div className="flex items-center gap-2 sm:shrink-0">
                <span className={`self-start rounded-full px-3 py-1 text-xs font-semibold ${index % 2 === 0
                  ? "bg-[#ede8ff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]"
                  : "bg-[#eef9f4] text-[#12a876] dark:bg-[#17362d] dark:text-[#7de4b8]"}`}>
                  {index % 2 === 0 ? "Visible" : "Queued"}
                </span>
                <button
                  className={`rounded-full px-3 py-1 text-xs font-semibold bg-[#f2edff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`}
                  onClick={() => onEditTask(task)}
                  type="button"
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
        ))}
        {tasks.length > DEFAULT_VISIBLE_COUNT ? (
          <button
            className={`w-full rounded-[1rem] border px-4 py-3 text-sm font-semibold border-[#e6defb] bg-[#faf7ff] text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.04] dark:text-[#cabfff]`}
            onClick={() => setIsExpanded((prev) => !prev)}
            type="button"
          >
            {isExpanded ? "Show fewer" : `Show ${hiddenCount} more`}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function FocusStatsCard({
  activeCount,
  doneCount,
  overdueCount,
  taskHistoryStats,
}: {
  activeCount: number;
  doneCount: number;
  overdueCount: number;
  taskHistoryStats: TaskHistoryStats;
}) {
  const stats = [
    { label: "Active", meter: Math.min(100, 28 + activeCount * 4), value: String(activeCount) },
    { label: "Completed", meter: Math.min(100, 28 + doneCount * 4), value: String(doneCount) },
    { label: "Overdue", meter: Math.min(100, 28 + overdueCount * 4), value: String(overdueCount) },
    { label: "Current Streak", meter: Math.min(100, 28 + taskHistoryStats.currentStreak * 6), value: String(taskHistoryStats.currentStreak) },
    { label: "Best Streak", meter: Math.min(100, 28 + taskHistoryStats.bestStreak * 6), value: String(taskHistoryStats.bestStreak) },
    { label: "Done Rate", meter: taskHistoryStats.doneRate, value: `${taskHistoryStats.doneRate}%` },
  ];

  return (
    <section className={`w-full overflow-hidden rounded-[2rem] border p-5 flex flex-col items-center text-center transition hover:-translate-y-0.5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6`}>
      <h2 className={`text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white`}>
        Focus Stats
      </h2>
      <div className="mt-4 grid w-full gap-3 sm:grid-cols-2">
        {stats.map((stat, index) => (
          <div className={`rounded-[1.25rem] p-4 flex flex-col items-center bg-[#f8f5ff] dark:bg-white/8`} key={stat.label}>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/35`}>{stat.label}</p>
            <p className={`mt-2 text-3xl font-black text-[#1f2746] dark:text-white`}>{stat.value}</p>
            <div className={`mt-2 h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-[#ded7f7] dark:bg-white/10`}>
              <div className={`h-full rounded-full ${index === 2
                ? "bg-[#f05566] dark:bg-[#ff9eaf]"
                : "bg-[#6f57f6] dark:bg-[#cabfff]"}`}
                style={{ width: `${stat.meter}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function newSubtaskDraft(): TaskSubtaskDraft {
  return { id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: "", status: "pending", children: [] };
}

function updateSubtaskTree(items: TaskSubtaskDraft[], id: string, updater: (s: TaskSubtaskDraft) => TaskSubtaskDraft): TaskSubtaskDraft[] {
  return items.map((s) => s.id === id ? updater(s) : { ...s, children: updateSubtaskTree(s.children, id, updater) });
}

function removeSubtaskFromTree(items: TaskSubtaskDraft[], id: string): TaskSubtaskDraft[] {
  return items.filter((s) => s.id !== id).map((s) => ({ ...s, children: removeSubtaskFromTree(s.children, id) }));
}

function addChildToSubtask(items: TaskSubtaskDraft[], parentId: string): TaskSubtaskDraft[] {
  return items.map((s) => s.id === parentId ? { ...s, children: [...s.children, newSubtaskDraft()] } : { ...s, children: addChildToSubtask(s.children, parentId) });
}

function SubtaskRow({ depth, onAddChild, onRemove, onUpdate, subtask }: {
  depth: number;
  onAddChild: (parentId: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updater: (s: TaskSubtaskDraft) => TaskSubtaskDraft) => void;
  subtask: TaskSubtaskDraft;
}) {
  const indent = depth * 20;
  return (
    <div style={{ marginLeft: indent }}>
      <div className={`flex items-center gap-2 rounded-[1rem] border px-3 py-2.5 border-[#ece8f8] bg-white dark:border-white/10 dark:bg-white/[0.04]`}>
        <input
          checked={subtask.status === "done"}
          className="h-4 w-4 shrink-0 accent-[#6f57f6]"
          onChange={(e) => onUpdate(subtask.id, (s) => ({ ...s, status: e.target.checked ? "done" : "pending" }))}
          type="checkbox"
        />
        <input
          className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${subtask.status === "done" ? "line-through opacity-50" : ""} text-[#1f2642] dark:text-white`}
          onChange={(e) => onUpdate(subtask.id, (s) => ({ ...s, title: e.target.value }))}
          placeholder="Step…"
          value={subtask.title}
        />
        <button
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-[#f2edff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`}
          onClick={() => onAddChild(subtask.id)}
          title="Add sub-step"
          type="button"
        >+</button>
        <button
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-[#fff1f3] text-[#f05566] dark:bg-[#44232f] dark:text-[#ff9eaf]`}
          onClick={() => onRemove(subtask.id)}
          type="button"
        >✕</button>
      </div>
      {subtask.children.length > 0 ? (
        <div className="mt-1.5 space-y-1.5">
          {subtask.children.map((child) => (
            <SubtaskRow depth={depth + 1} key={child.id} onAddChild={onAddChild} onRemove={onRemove} onUpdate={onUpdate} subtask={child} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TagChipInput({ allTags, onChange, values }: {
  allTags: string[];
  onChange: (tags: string[]) => void;
  values: string[];
}) {
  const [input, setInput] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const filtered = allTags.filter((t) => !values.includes(t) && t.toLowerCase().includes(input.toLowerCase()));

  function addTag(tag: string) {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput("");
    setShowDropdown(false);
  }

  return (
    <div className="relative grid gap-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map((tag) => (
          <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[#ede8ff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`} key={tag}>
            {tag}
            <button className="opacity-60 hover:opacity-100" onClick={() => onChange(values.filter((v) => v !== tag))} type="button">✕</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className={`min-w-0 flex-1 rounded-[0.75rem] px-3 py-2 text-sm outline-none bg-[#f7f5ff] text-[#1f2642] placeholder:text-[#9b9fba] dark:bg-white/8 dark:text-white dark:placeholder:text-white/30`}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          onChange={(e) => { setInput(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(input); } }}
          placeholder="Add tag…"
          value={input}
        />
        <button
          className={`shrink-0 rounded-[0.75rem] px-3 py-2 text-sm font-semibold bg-[#ede8ff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`}
          onClick={() => addTag(input)}
          type="button"
        >Add</button>
      </div>
      {showDropdown && filtered.length > 0 ? (
        <div className={`absolute left-0 right-0 top-full z-20 mt-1 max-h-36 overflow-y-auto rounded-[1rem] border shadow-lg border-[#ece8f8] bg-white dark:border-white/10 dark:bg-[#1a1230]`}>
          {filtered.map((tag) => (
            <button
              className={`w-full px-4 py-2 text-left text-sm text-[#1f2642] hover:bg-[#f7f5ff] dark:text-white dark:hover:bg-white/8`}
              key={tag}
              onMouseDown={() => addTag(tag)}
              type="button"
            >{tag}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TaskEditorModal({
  allTags,
  focusedToday,
  mode,
  onClose,
  onOpenHistory,
  onSave,
  subtasks,
  task,
}: {
  allTags: string[];
  focusedToday: string[];
  mode: TaskEditorMode;
  onClose: () => void;
  onOpenHistory?: () => void;
  onSave: (draft: { values: TaskDraft; focusToday: boolean; subtasks: TaskSubtaskDraft[] }) => Promise<void>;
  subtasks: DbTaskSubtask[];
  task: Task | null;
}) {
  const [draft, setDraft] = useState<TaskEditorDraft>(() => createTaskEditorDraft(task, task ? focusedToday.includes(task.id) : false, subtasks));
  const [subtaskMultiAdd, setSubtaskMultiAdd] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = mode === "edit" && task !== null;

  useEffect(() => {
    setDraft(createTaskEditorDraft(task, task ? focusedToday.includes(task.id) : false, subtasks));
    setSubtaskMultiAdd("");
  }, [task, mode, focusedToday, subtasks]);

  const trimmedTitle = draft.title.trim();
  const normalizedUrl = draft.externalLinkUrl.trim();
  const hasUrlError = normalizedUrl.length > 0 && !isProbablyValidUrl(normalizedUrl);

  const estimatedTimePresets = [
    { label: "5m", minutes: "5" },
    { label: "10m", minutes: "10" },
    { label: "15m", minutes: "15" },
    { label: "30m", minutes: "30" },
    { label: "45m", minutes: "45" },
    { label: "1h", minutes: "60" },
  ];

  const visibleStatusOptions: TaskStatus[] = ["pending", "in_progress", "done", "missed", "did_my_best", "upcoming", "not_due"];

  return (
    <ModalShell className={`w-full max-w-[42rem] max-h-[92vh] overflow-y-auto rounded-[2rem] border border-[#ece8f8] bg-white shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]`} label="Task editor" onClose={onClose}>
      {/* Header */}
      <div className={`sticky top-0 z-10 flex items-center gap-3 px-5 py-4 bg-white border-b border-[#ece8f8] dark:bg-[#171328] dark:border-b dark:border-white/10`}>
        <button aria-label="Close" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f0ff] text-[#6f57f6] dark:bg-white/8 dark:text-white`} onClick={onClose} type="button">
          <X className="h-4 w-4" />
        </button>
        <span className={`flex-1 text-base font-bold text-[#1e2540] dark:text-white`}>{isEditing ? "Edit Task" : "New Task"}</span>
        <button
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${draft.oneStepAtATime
            ? "border-[#6f57f6] bg-[#f2edff] text-[#6f57f6] dark:border-[#cabfff] dark:bg-[#22193f] dark:text-[#cabfff]"
            : "border-[#e5e0f5] text-[#b0aac8] dark:border-white/15 dark:text-white/35"}`}
          onClick={() => setDraft((c) => ({ ...c, oneStepAtATime: !c.oneStepAtATime }))}
          type="button"
        >
          <Footprints className="mr-1 inline h-3 w-3" />
          ONE STEP AT A TIME
        </button>
        {isEditing && onOpenHistory ? (
          <button
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f0ff] text-[#6f57f6] dark:bg-white/8 dark:text-white/70`}
            onClick={onOpenHistory}
            title="Task history"
            type="button"
          >
            <BarChart2 className="h-4 w-4" />
          </button>
        ) : null}
        {isEditing ? (
          <button
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fff1f3] text-[#f05566]"
            onClick={() => onSave({ focusToday: draft.focusToday, subtasks: [], values: { title: draft.title, notes: null, status: "archived" as TaskStatus, priority: draft.priority, energy: draft.energy, is_urgent: false, is_important: false, due_on: null, due_time: null, estimated_minutes: null, tags: [], external_link_label: null, external_link_url: null, one_step_at_a_time: false, subtasks_auto_reset: false, repeat_frequency: "none", repeat_interval: 1, repeat_days_of_week: [], repeat_day_of_month: null, completed_at: null } })}
            type="button"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <form
        className="space-y-6 px-5 pb-6 pt-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!trimmedTitle || hasUrlError) return;
          setIsSaving(true);
          await onSave({
            focusToday: draft.focusToday,
            subtasks: draft.subtasks,
            values: {
              title: trimmedTitle,
              notes: emptyToNull(draft.notes),
              status: draft.status,
              priority: draft.priority,
              energy: draft.energy,
              is_urgent: draft.isUrgent,
              is_important: draft.isImportant,
              due_on: emptyToNull(draft.dueOn),
              due_time: emptyToNull(draft.dueTime),
              estimated_minutes: parsePositiveInteger(draft.estimatedMinutes),
              tags: draft.tags,
              external_link_label: emptyToNull(draft.externalLinkLabel),
              external_link_url: emptyToNull(normalizedUrl),
              one_step_at_a_time: draft.oneStepAtATime,
              subtasks_auto_reset: draft.subtasksAutoReset,
              repeat_frequency: draft.repeatFrequency,
              repeat_interval: Math.max(1, parsePositiveInteger(draft.repeatInterval) ?? 1),
              repeat_days_of_week: draft.repeatFrequency === "weekly" || draft.repeatFrequency === "custom"
                ? [...draft.repeatDaysOfWeek].sort((a, b) => a - b)
                : [],
              repeat_day_of_month: draft.repeatFrequency === "monthly" || draft.repeatFrequency === "custom"
                ? parseDayOfMonth(draft.repeatDayOfMonth)
                : null,
              completed_at: isTaskFinishedStatusValue(draft.status)
                ? task?.completed_at ?? new Date().toISOString()
                : null,
            },
          });
          setIsSaving(false);
        }}
      >
        {/* Title */}
        <input
          className={`w-full border-b-2 bg-transparent pb-2 text-2xl font-bold outline-none border-[#6f57f6] text-[#1e2540] placeholder:text-[#bbb8d0] dark:border-[#cabfff]/50 dark:text-white dark:placeholder:text-white/25`}
          onChange={(e) => setDraft((c) => ({ ...c, title: e.target.value }))}
          placeholder="Task title"
          value={draft.title}
        />

        {/* STATUS */}
        <div>
          <p className={`mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40`}>Status</p>
          <div className="flex flex-wrap gap-2">
            {visibleStatusOptions.map((s) => (
              <button
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${draft.status === s
                  ? "border-transparent bg-[#f05566] text-white"
                  : "border-[#e5e0f5] text-[#5a607a] hover:border-[#c4b8ff] dark:border-white/15 dark:text-white/70 dark:hover:border-white/30"}`}
                key={s}
                onClick={() => setDraft((c) => ({ ...c, status: s }))}
                type="button"
              >
                {formatOptionLabel(s)}
              </button>
            ))}
          </div>
        </div>

        {/* Urgent / Important / Focus Today */}
        <div className="space-y-2">
          {([
            { key: "isUrgent", label: "Urgent", desc: "Needs attention now", Icon: AlertCircle, color: "text-[#f05566]", bg: "bg-[#fff1f3] dark:bg-[#44232f]" },
            { key: "isImportant", label: "Important", desc: "High value goal", Icon: Diamond, color: "text-[#6f57f6]", bg: "bg-[#f2edff] dark:bg-[#22193f]" },
            { key: "focusToday", label: "Focus Today", desc: "Add to daily priority list", Icon: Star, color: "text-[#8d87a7]", bg: "bg-[#f7f5ff] dark:bg-white/8" },
          ] as const).map(({ key, label, desc, Icon, color, bg }) => {
            const checked = draft[key] as boolean;
            return (
              <div className={`flex items-center gap-3 rounded-[1.1rem] px-4 py-3 bg-[#faf8ff] dark:bg-white/[0.03]`} key={key}>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${bg}`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold text-[#1e2540] dark:text-white`}>{label}</p>
                  <p className={`text-xs text-[#8d97b0] dark:text-white/45`}>{desc}</p>
                </div>
                <button
                  className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${checked
                    ? "bg-[#f05566] text-white"
                    : "border border-[#e5e0f5] text-[#8d97b0] dark:border dark:border-white/15 dark:text-white/50"}`}
                  onClick={() => setDraft((c) => ({ ...c, [key]: !checked }))}
                  type="button"
                >
                  {checked ? "YES" : "No"}
                </button>
              </div>
            );
          })}
        </div>

        {/* REPEAT FREQUENCY */}
        <div>
          <p className={`mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40`}>Repeat Frequency</p>
          <div className="flex flex-wrap gap-2">
            {(["none", "daily", "weekly", "monthly", "custom"] as const).map((freq) => (
              <button
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${draft.repeatFrequency === freq
                  ? "border-transparent bg-[#6f57f6] text-white dark:border-transparent dark:bg-[#cabfff] dark:text-[#1a1431]"
                  : "border-[#e5e0f5] text-[#5a607a] hover:border-[#c4b8ff] dark:border-white/15 dark:text-white/70 dark:hover:border-white/30"}`}
                key={freq}
                onClick={() => setDraft((c) => ({ ...c, repeatFrequency: freq }))}
                type="button"
              >
                {freq === "none" ? "None" : freq === "daily" ? "Daily" : freq === "weekly" ? "Weekly" : freq === "monthly" ? "Monthly" : "Days After"}
              </button>
            ))}
          </div>
          {draft.repeatFrequency !== "none" && draft.repeatFrequency !== "daily" ? (
            <div className="mt-3">
              <LabeledInput label="Interval" onChange={(v) => setDraft((c) => ({ ...c, repeatInterval: v }))} placeholder="1" type="number" value={draft.repeatInterval} />
            </div>
          ) : null}
          {draft.repeatFrequency === "weekly" || draft.repeatFrequency === "custom" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {repeatWeekdayOptions.map((option) => {
                const selected = draft.repeatDaysOfWeek.includes(option.value);
                return (
                  <Pill key={option.value} onClick={() => setDraft((c) => ({ ...c, repeatDaysOfWeek: selected ? c.repeatDaysOfWeek.filter((v) => v !== option.value) : [...c.repeatDaysOfWeek, option.value] }))} selected={selected}>
                    {option.label}
                  </Pill>
                );
              })}
            </div>
          ) : null}
          {draft.repeatFrequency === "monthly" || draft.repeatFrequency === "custom" ? (
            <div className="mt-3">
              <LabeledInput label="Day of month" onChange={(v) => setDraft((c) => ({ ...c, repeatDayOfMonth: v }))} placeholder="15" type="number" value={draft.repeatDayOfMonth} />
            </div>
          ) : null}
        </div>

        {/* ENERGY LEVEL */}
        <div>
          <p className={`mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40`}>Energy Level</p>
          <div className="flex flex-wrap gap-2">
            {(["low", "medium", "high"] as const).map((e) => {
              const active = draft.energy === e;
              const colors = e === "low"
                ? active ? "bg-[#12b76a] text-white border-transparent" : "border-[#e5e0f5] text-[#5a607a] dark:border-white/15 dark:text-white/70"
                : e === "medium"
                  ? active ? "bg-[#6f57f6] text-white border-transparent" : "border-[#e5e0f5] text-[#5a607a] dark:border-white/15 dark:text-white/70"
                  : active ? "bg-[#f79009] text-white border-transparent" : "border-[#e5e0f5] text-[#5a607a] dark:border-white/15 dark:text-white/70";
              return (
                <button className={`rounded-full border px-5 py-2 text-sm font-semibold capitalize transition-colors ${colors}`} key={e} onClick={() => setDraft((c) => ({ ...c, energy: e }))} type="button">
                  {e}
                </button>
              );
            })}
          </div>
        </div>

        {/* ESTIMATED TIME */}
        <div>
          <p className={`mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40`}>Estimated Time</p>
          <div className="flex flex-wrap gap-2">
            {estimatedTimePresets.map((preset) => (
              <button
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${draft.estimatedMinutes === preset.minutes
                  ? "border-transparent bg-[#6f57f6] text-white dark:border-transparent dark:bg-[#cabfff] dark:text-[#1a1431]"
                  : "border-[#e5e0f5] text-[#5a607a] hover:border-[#c4b8ff] dark:border-white/15 dark:text-white/70 dark:hover:border-white/30"}`}
                key={preset.label}
                onClick={() => setDraft((c) => ({ ...c, estimatedMinutes: c.estimatedMinutes === preset.minutes ? "" : preset.minutes }))}
                type="button"
              >
                {preset.label}
              </button>
            ))}
            <div className="flex items-center gap-1">
              <input
                className={`h-9 w-20 rounded-full border px-3 text-sm outline-none border-[#e5e0f5] bg-white text-[#1e2540] placeholder:text-[#b0aac8] dark:border-white/15 dark:bg-white/8 dark:text-white dark:placeholder:text-white/30`}
                min="1"
                onChange={(e) => setDraft((c) => ({ ...c, estimatedMinutes: e.target.value }))}
                placeholder="min"
                type="number"
                value={estimatedTimePresets.some((p) => p.minutes === draft.estimatedMinutes) ? "" : draft.estimatedMinutes}
              />
            </div>
          </div>
        </div>

        {/* SUBTASKS */}
        <section className={`rounded-[1.25rem] border p-4 border-[#ece8f8] bg-[#fcfbff] dark:border-white/10 dark:bg-white/[0.03]`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={`text-sm font-black uppercase tracking-[0.18em] text-[#7a63f7] dark:text-[#c9bbff]`}>Subtasks</p>
            <ToggleField checked={draft.subtasksAutoReset} label="Auto Reset" onChange={(checked) => setDraft((c) => ({ ...c, subtasksAutoReset: checked }))} />
          </div>
          <div className="mt-3 space-y-2">
            {draft.subtasks.length === 0 ? <EmptyTaskState text="No subtasks yet." /> : null}
            {draft.subtasks.map((subtask) => (
              <SubtaskRow
                depth={0}
                key={subtask.id}
                onAddChild={(parentId) => setDraft((c) => ({ ...c, subtasks: addChildToSubtask(c.subtasks, parentId) }))}
                onRemove={(id) => setDraft((c) => ({ ...c, subtasks: removeSubtaskFromTree(c.subtasks, id) }))}
                onUpdate={(id, updater) => setDraft((c) => ({ ...c, subtasks: updateSubtaskTree(c.subtasks, id, updater) }))}
                subtask={subtask}
              />
            ))}
          </div>
          <div className="mt-3 grid gap-2">
            <textarea
              className={`min-h-20 rounded-[1rem] px-4 py-3 text-sm outline-none bg-[#f7f5ff] text-[#1f2642] placeholder:text-[#9b9fba] dark:bg-white/8 dark:text-white dark:placeholder:text-white/30`}
              onChange={(e) => setSubtaskMultiAdd(e.target.value)}
              placeholder={"One step\nAnother step\nFinal step"}
              value={subtaskMultiAdd}
            />
            <button
              className={`self-end rounded-[1rem] px-4 py-2.5 text-sm font-semibold bg-[#ede8ff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`}
              onClick={() => {
                const next = buildDraftSubtasksFromLines(subtaskMultiAdd);
                if (!next.length) return;
                setDraft((c) => ({ ...c, subtasks: [...c.subtasks, ...next] }));
                setSubtaskMultiAdd("");
              }}
              type="button"
            >
              Add Lines
            </button>
          </div>
        </section>

        {/* Due date / time / notes / tags / link */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className={`text-sm font-semibold text-[#5f6983] dark:text-white/65`}>Due date</span>
            <div className="relative">
              <input
                className={`w-full rounded-[1rem] px-4 py-3 text-sm outline-none ${draft.dueOn ? "text-[#1f2642] dark:text-white" : "text-[#9b9fba] dark:text-white/30"} bg-[#f7f5ff] dark:bg-white/8`}
                onChange={(e) => setDraft((c) => ({ ...c, dueOn: e.target.value }))}
                type="date"
                value={draft.dueOn}
              />
              {draft.dueOn ? (
                <button
                  className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-xs text-[#9b9fba] hover:text-[#f05566] dark:text-white/30 dark:hover:text-[#ff9eaf]`}
                  onClick={() => setDraft((c) => ({ ...c, dueOn: "" }))}
                  type="button"
                >✕</button>
              ) : null}
            </div>
          </label>
          <label className="grid gap-2">
            <span className={`text-sm font-semibold text-[#5f6983] dark:text-white/65`}>Due time</span>
            <div className="relative">
              <input
                className={`w-full rounded-[1rem] px-4 py-3 text-sm outline-none ${draft.dueTime ? "text-[#1f2642] dark:text-white" : "text-[#9b9fba] dark:text-white/30"} bg-[#f7f5ff] dark:bg-white/8`}
                onChange={(e) => setDraft((c) => ({ ...c, dueTime: e.target.value }))}
                type="time"
                value={draft.dueTime}
              />
              {draft.dueTime ? (
                <button
                  className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-xs text-[#9b9fba] hover:text-[#f05566] dark:text-white/30 dark:hover:text-[#ff9eaf]`}
                  onClick={() => setDraft((c) => ({ ...c, dueTime: "" }))}
                  type="button"
                >✕</button>
              ) : null}
            </div>
          </label>
        </div>

        <label className="grid gap-2">
          <span className={`text-sm font-semibold text-[#5f6983] dark:text-white/65`}>Notes</span>
          <textarea
            className={`min-h-24 rounded-[1rem] px-4 py-3 text-sm outline-none bg-[#f7f5ff] text-[#1f2642] placeholder:text-[#9b9fba] dark:bg-white/8 dark:text-white dark:placeholder:text-white/30`}
            onChange={(e) => setDraft((c) => ({ ...c, notes: e.target.value }))}
            placeholder="Keep this grounded in the next real step."
            value={draft.notes}
          />
        </label>

        <label className="grid gap-2">
          <span className={`text-sm font-semibold text-[#5f6983] dark:text-white/65`}>Tags</span>
          <TagChipInput allTags={allTags} onChange={(tags) => setDraft((c) => ({ ...c, tags }))} values={draft.tags} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledInput label="External link label" onChange={(v) => setDraft((c) => ({ ...c, externalLinkLabel: v }))} placeholder="Reference" value={draft.externalLinkLabel} />
        </div>
        <div>
          <LabeledInput label="External link URL" onChange={(v) => setDraft((c) => ({ ...c, externalLinkUrl: v }))} placeholder="https://..." value={draft.externalLinkUrl} />
          {hasUrlError ? <p className="mt-1 text-sm text-[#d94e67]">Use a full URL like `https://example.com`.</p> : null}
        </div>

        {/* Save */}
        <button
          className={`w-full rounded-[1.25rem] py-4 text-base font-bold bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431] disabled:opacity-50`}
          disabled={!trimmedTitle || hasUrlError || isSaving}
          type="submit"
        >
          {isSaving ? "Saving..." : isEditing ? "Save Changes" : "Create Task"}
        </button>
      </form>
    </ModalShell>
  );
}

function EmptyTaskState({
  text,
}: {
  text: string;
}) {
  return (
    <div className={`rounded-[1.25rem] border border-dashed px-4 py-5 text-sm border-[#ddd6f9] bg-[#faf8ff] text-[#7b84a0] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55`}>
      {text}
    </div>
  );
}

const LIST_MAX_COLUMNS = 4;
const LIST_WIDTH_PRESETS = [
  { label: "1 Col", colSpan: 1 },
  { label: "2 Cols", colSpan: 2 },
  { label: "3 Cols", colSpan: 3 },
  { label: "4 Cols", colSpan: 4 },
];
const LIST_HEIGHT_PRESETS = [
  { label: "2 Rows", minHeight: LIST_ROW_HEIGHT * 2 },
  { label: "4 Rows", minHeight: LIST_ROW_HEIGHT * 4 },
  { label: "6 Rows", minHeight: LIST_ROW_HEIGHT * 6 },
  { label: "8 Rows", minHeight: LIST_ROW_HEIGHT * 8 },
  { label: "10 Rows", minHeight: LIST_ROW_HEIGHT * 10 },
];

const LIST_CARD_LABELS: Record<ListCardId, string> = {
  composer: "Quick Capture",
  import: "Import",
  "focus-today": "Focus Today",
  "due-today": "Due Today",
  stats: "Focus Stats",
  urgent: "Urgent Tasks",
};

function ListCardResizeOverlay({
  layout,
  onClose,
  onResize,
}: {
  layout: ListCardLayout;
  onClose: () => void;
  onResize: (colSpan: number, minHeight: number) => void;
}) {
  const currentRows = Math.round(layout.minHeight / LIST_ROW_HEIGHT);
  const [customRowsInput, setCustomRowsInput] = useState(String(currentRows));

  useEffect(() => {
    setCustomRowsInput(String(Math.round(layout.minHeight / LIST_ROW_HEIGHT)));
  }, [layout.minHeight, layout.id]);

  const parsedCustomRows = Number.parseInt(customRowsInput, 10);
  const clampedCustomRows = Number.isFinite(parsedCustomRows) ? Math.max(1, Math.min(20, parsedCustomRows)) : null;

  function stopEvent(e: React.SyntheticEvent) { e.stopPropagation(); }

  function applyCustomRows() {
    if (clampedCustomRows === null) return;
    onResize(layout.colSpan, clampedCustomRows * LIST_ROW_HEIGHT);
    onClose();
  }

  return (
    <div
      className={`absolute inset-x-3 bottom-3 z-20 rounded-[1.35rem] border p-3 border-[#ddd4ff] bg-white/95 shadow-[0_18px_36px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]/95`}
      onClick={stopEvent}
      onMouseDown={stopEvent}
      onPointerDown={stopEvent}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-xs font-black uppercase tracking-[0.18em] text-[#7a63f7] dark:text-[#c9bbff]`}>
          {LIST_CARD_LABELS[layout.id]}
        </p>
        <button
          className={`rounded-full px-3 py-1.5 text-xs font-semibold bg-white text-[#5c647d] shadow-[0_8px_20px_rgba(81,61,168,0.06)] dark:bg-white/8 dark:text-white/75`}
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </div>
      <div className="mt-3 space-y-3">
        <div>
          <p className={`mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#8b84a6] dark:text-white/40`}>Width</p>
          <div className="flex flex-wrap gap-2">
            {LIST_WIDTH_PRESETS.map((preset) => (
              <button
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${layout.colSpan === preset.colSpan
                  ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]"
                  : "bg-white text-[#5c647d] shadow-[0_8px_20px_rgba(81,61,168,0.06)] dark:bg-white/8 dark:text-white/75"}`}
                key={preset.label}
                onClick={() => onResize(preset.colSpan, layout.minHeight)}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className={`mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#8b84a6] dark:text-white/40`}>Rows</p>
          <div className="flex flex-wrap gap-2">
            {LIST_HEIGHT_PRESETS.map((preset) => (
              <button
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${layout.minHeight === preset.minHeight
                  ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]"
                  : "bg-white text-[#5c647d] shadow-[0_8px_20px_rgba(81,61,168,0.06)] dark:bg-white/8 dark:text-white/75"}`}
                key={preset.label}
                onClick={() => onResize(layout.colSpan, preset.minHeight)}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); applyCustomRows(); }}
        >
          <label className="min-w-0 flex-1">
            <span className={`mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-[#8b84a6] dark:text-white/40`}>Custom Rows</span>
            <input
              className={`h-11 w-full rounded-[0.9rem] px-3 text-sm outline-none bg-[#f7f5ff] text-[#1f2642] dark:bg-white/8 dark:text-white`}
              inputMode="numeric"
              max="20"
              min="1"
              onChange={(e) => setCustomRowsInput(e.target.value)}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && clampedCustomRows !== null) { e.preventDefault(); applyCustomRows(); } }}
              type="number"
              value={customRowsInput}
            />
          </label>
          <button
            className={`h-11 rounded-[0.9rem] px-4 text-sm font-semibold bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]`}
            disabled={clampedCustomRows === null}
            type="submit"
          >
            Apply
          </button>
        </form>
      </div>
    </div>
  );
}

function TaskListView({
  focusedTaskIds,
  onDelete,
  onEditTask,
  onSetStatus,
  onToggle,
  subtasksByTaskId,
  tasks,
}: {
  focusedTaskIds: string[];
  onDelete: (taskIds: string[]) => void;
  onEditTask: (task: Task) => void;
  onSetStatus: (task: Task, status: TaskStatus) => void;
  onToggle: (task: Task) => void;
  subtasksByTaskId: Record<string, DbTaskSubtask[]>;
  tasks: Task[];
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openStatusTaskId, setOpenStatusTaskId] = useState<string | null>(null);
  const LOAD_MORE_SIZE = 200;
  const [visibleCount, setVisibleCount] = useState(LOAD_MORE_SIZE);

  const allSelected = tasks.length > 0 && tasks.every((t) => selectedIds.has(t.id));
  const someSelected = selectedIds.size > 0;

  const STATUS_OPTIONS: TaskStatus[] = ["pending", "in_progress", "done", "missed", "did_my_best", "upcoming", "not_due"];
  const STATUS_COLORS: Record<TaskStatus, string> = {
    pending:      "bg-orange-500 text-white",
    in_progress:  "bg-yellow-400 text-black",
    done:         "bg-green-500 text-white",
    missed:       "bg-red-500 text-white",
    did_my_best:  "bg-blue-800 text-white",
    upcoming:     "bg-gray-400 text-white",
    not_due:      "bg-sky-300 text-black",
    archived:     "bg-gray-600 text-white",
  };

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tasks.map((t) => t.id)));
    }
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleDeleteSelected() {
    onDelete([...selectedIds]);
    setSelectedIds(new Set());
  }

  return (
    <section className="mt-7">
      {someSelected ? (
        <div className={`mb-3 flex items-center justify-between rounded-2xl px-4 py-2.5 bg-[#f2edff] dark:bg-[#22193f]`}>
          <span className={`text-sm font-semibold text-[#6f57f6] dark:text-[#cabfff]`}>
            {selectedIds.size} selected
          </span>
          <button
            className="rounded-full bg-red-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-600"
            onClick={handleDeleteSelected}
            type="button"
          >
            Delete selected
          </button>
        </div>
      ) : null}
      <div className={`overflow-hidden rounded-[1.8rem] border border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6`}>
        <div className={`grid grid-cols-[auto_minmax(0,1.8fr)_minmax(0,1.2fr)_auto] gap-3 border-b px-5 py-4 text-[11px] font-black uppercase tracking-[0.18em] border-[#ece8f8] text-[#8d87a7] dark:border-white/10 dark:text-white/35`}>
          <input
            aria-label="Select all tasks"
            checked={allSelected}
            className="mt-0.5 cursor-pointer accent-[#6f57f6]"
            onChange={toggleSelectAll}
            type="checkbox"
          />
          <span>Task</span>
          <span>Meta</span>
          <span>Actions</span>
        </div>
        <div>
          {tasks.length === 0 ? (
            <div className="p-4">
              <EmptyTaskState text="No tasks match the current filters." />
            </div>
          ) : null}
          {tasks.slice(0, visibleCount).map((task) => (
            <div
              className={`grid grid-cols-1 gap-3 border-b px-5 py-4 last:border-b-0 md:grid-cols-[auto_minmax(0,1.8fr)_minmax(0,1.2fr)_auto] md:items-center border-[#f0ebfb] dark:border-white/10`}
              key={task.id}
            >
              <input
                aria-label={`Select ${task.title}`}
                checked={selectedIds.has(task.id)}
                className="mt-1 cursor-pointer accent-[#6f57f6] md:mt-0"
                onChange={() => toggleSelectOne(task.id)}
                type="checkbox"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className={`min-w-0 truncate text-left text-lg font-semibold text-[#24304b] dark:text-white`}
                    onClick={() => onEditTask(task)}
                    type="button"
                  >
                    {task.title}
                  </button>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_COLORS[task.status]}`}>
                    {formatOptionLabel(task.status)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {focusedTaskIds.includes(task.id) ? <TaskMetaChip tone="purple">Focus Today</TaskMetaChip> : null}
                  {task.is_urgent ? <TaskMetaChip tone="blue">Urgent</TaskMetaChip> : null}
                  {task.is_important ? <TaskMetaChip tone="purple">Important</TaskMetaChip> : null}
                  {task.one_step_at_a_time ? <TaskMetaChip tone="neutral">One Step</TaskMetaChip> : null}
                </div>
                <TaskSupplementalMeta nextSubtask={getNextPendingSubtask(task.id, subtasksByTaskId)} task={task} />
              </div>
              <div className={`text-sm text-[#6f7892] dark:text-white/60`}>
                {formatTaskMetaLine(task)}
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <button
                  className={`rounded-full px-3 py-2 text-sm font-semibold bg-[#f2edff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`}
                  onClick={() => onEditTask(task)}
                  type="button"
                >
                  Edit
                </button>
                <div className="relative">
                  <button
                    className={`rounded-full px-3 py-2 text-sm font-semibold ${STATUS_COLORS[task.status]}`}
                    onClick={() => setOpenStatusTaskId(openStatusTaskId === task.id ? null : task.id)}
                    type="button"
                  >
                    {formatOptionLabel(task.status)} ▾
                  </button>
                  {openStatusTaskId === task.id ? (
                    <div className={`absolute right-0 top-full z-20 mt-1 min-w-[150px] overflow-hidden rounded-[1rem] border shadow-lg border-[#ece8f8] bg-white dark:border-white/10 dark:bg-[#1a1230]`}>
                      {STATUS_OPTIONS.map((s) => (
                        <button
                          className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium hover:bg-[#f7f5ff] dark:hover:bg-white/8`}
                          key={s}
                          onClick={() => { onSetStatus(task, s); setOpenStatusTaskId(null); }}
                          type="button"
                        >
                          <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_COLORS[s].split(" ")[0]}`} />
                          <span className="text-[#1f2642] dark:text-white">{formatOptionLabel(s)}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {tasks.length > visibleCount ? (
        <button
          className={`mt-4 w-full rounded-2xl py-3 text-sm font-semibold bg-[#f2edff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`}
          onClick={() => setVisibleCount((c) => c + LOAD_MORE_SIZE)}
          type="button"
        >
          Show {Math.min(LOAD_MORE_SIZE, tasks.length - visibleCount)} more ({tasks.length - visibleCount} remaining)
        </button>
      ) : null}
    </section>
  );
}

function TaskCardGallery({
  focusedTaskIds,
  onEditTask,
  onToggle,
  subtasksByTaskId,
  tasks,
}: {
  focusedTaskIds: string[];
  onEditTask: (task: Task) => void;
  onToggle: (task: Task) => void;
  subtasksByTaskId: Record<string, DbTaskSubtask[]>;
  tasks: Task[];
}) {
  return (
    <section className="mt-7">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tasks.length === 0 ? <EmptyTaskState text="No tasks match the current filters." /> : null}
        {tasks.map((task) => (
          <article
            className={`w-full overflow-hidden rounded-[1.7rem] border p-5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6`}
            key={task.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <button
                  className={`text-left text-xl font-bold text-[#1f2746] dark:text-white`}
                  onClick={() => onEditTask(task)}
                  type="button"
                >
                  {task.title}
                </button>
                <p className={`mt-2 text-sm text-[#77829f] dark:text-white/55`}>
                  {formatTaskMetaLine(task)}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold bg-[#f2edff] text-[#725af6] dark:bg-[#22193f] dark:text-[#cabfff]`}>
                {task.priority}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {focusedTaskIds.includes(task.id) ? <TaskMetaChip tone="purple">Focus Today</TaskMetaChip> : null}
              <TaskMetaChip tone={task.energy === "high" ? "blue" : task.energy === "medium" ? "neutral" : "green"}>
                {task.energy}
              </TaskMetaChip>
              {task.is_urgent ? <TaskMetaChip tone="blue">Urgent</TaskMetaChip> : null}
              {task.is_important ? <TaskMetaChip tone="purple">Important</TaskMetaChip> : null}
            </div>
            <TaskSupplementalMeta nextSubtask={getNextPendingSubtask(task.id, subtasksByTaskId)} task={task} />
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                className={`rounded-[1rem] px-4 py-3 text-sm font-bold bg-[#f2edff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`}
                onClick={() => onEditTask(task)}
                type="button"
              >
                Edit
              </button>
              <button
                className={`rounded-[1rem] px-4 py-3 text-sm font-bold bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]`}
                onClick={() => onToggle(task)}
                type="button"
              >
                {isTaskFinished(task) ? "Completed" : "Mark Done"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TaskMatrixView({
  onEditTask,
  onToggle,
  subtasksByTaskId,
  tasks,
}: {
  onEditTask: (task: Task) => void;
  onToggle: (task: Task) => void;
  subtasksByTaskId: Record<string, DbTaskSubtask[]>;
  tasks: Task[];
}) {
  const cells = [
    {
      key: "urgent-high",
      title: "Urgent + Higher Energy",
      tasks: tasks.filter((task) => isTaskUrgent(task) && task.energy !== "low"),
    },
    {
      key: "urgent-low",
      title: "Urgent + Low Energy",
      tasks: tasks.filter((task) => isTaskUrgent(task) && task.energy === "low"),
    },
    {
      key: "later-high",
      title: "Later + Higher Energy",
      tasks: tasks.filter((task) => !isTaskUrgent(task) && task.energy !== "low"),
    },
    {
      key: "later-low",
      title: "Later + Low Energy",
      tasks: tasks.filter((task) => !isTaskUrgent(task) && task.energy === "low"),
    },
  ];

  return (
    <section className="mt-7 grid gap-4 lg:grid-cols-2">
      {cells.map((cell) => (
        <div className={`rounded-[2rem] border p-5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6`} key={cell.key}>
          <div className="flex items-center justify-between gap-3">
            <h2 className={`text-xl font-black text-[#28304a] dark:text-white`}>{cell.title}</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold bg-[#f2edff] text-[#725af6] dark:bg-[#22193f] dark:text-[#cabfff]`}>
              {cell.tasks.length}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {cell.tasks.length === 0 ? <EmptyTaskState text="No tasks in this bucket." /> : null}
            {cell.tasks.map((task) => (
              <div
                className={`flex w-full items-center justify-between gap-3 rounded-[1.2rem] border px-4 py-3 border-[#efeaf9] bg-[#fdfcff] dark:border-white/10 dark:bg-white/[0.04]`}
                key={task.id}
              >
                <div className="min-w-0">
                  <button
                    className={`truncate text-left text-base font-semibold text-[#27304c] dark:text-white`}
                    onClick={() => onEditTask(task)}
                    type="button"
                  >
                    {task.title}
                  </button>
                  <p className={`mt-1 text-xs text-[#7d88a1] dark:text-white/55`}>{formatTaskMetaLine(task)}</p>
                  {task.one_step_at_a_time && getNextPendingSubtask(task.id, subtasksByTaskId) ? (
                    <p className={`mt-1 text-xs font-semibold text-[#6f57f6] dark:text-[#cabfff]`}>
                      Next: {getNextPendingSubtask(task.id, subtasksByTaskId)?.title}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={`rounded-full px-3 py-1 text-xs font-semibold bg-[#f2edff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`}
                    onClick={() => onEditTask(task)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    className={`rounded-full px-3 py-1 text-xs font-semibold bg-[#ede8ff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`}
                    onClick={() => onToggle(task)}
                    type="button"
                  >
                    Done
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function FocusPlannerModal({
  draftIds,
  onClose,
  onFinish,
  onSetDraftIds,
  onStepChange,
  step,
  tasks,
}: {
  draftIds: string[];
  onClose: () => void;
  onFinish: () => void;
  onSetDraftIds: (ids: string[]) => void;
  onStepChange: (step: FocusPlannerStep) => void;
  step: FocusPlannerStep;
  tasks: Task[];
}) {
  const [search, setSearch] = useState("");
  const prompts = [
    "What tasks must be done today?",
    "What tasks are causing you stress?",
    "One task if you had nothing else to do?",
  ] as const;
  const filtered = tasks.filter((task) => {
    const matchesSearch = search.trim().length === 0 || task.title.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStep = step === 0
      ? isDueToday(task.due_on) || isTaskUrgent(task)
      : step === 1
        ? isTaskUrgent(task) || task.energy === "high"
        : true;
    return matchesSearch && matchesStep;
  });

  return (
    <ModalShell className={`w-full max-w-[42rem] rounded-[2rem] border p-5 border-[#ece8f8] bg-white shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]`} label="New task wizard" onClose={onClose}>
      <div className="flex items-center justify-between gap-3">
        <p className={`text-sm font-black uppercase tracking-[0.18em] text-[#7b63f7] dark:text-[#c9bbff]`}>Step {step + 1} of 3</p>
        <button aria-label="Close" className={`text-2xl text-[#8e97af] dark:text-white/55`} onClick={onClose} type="button">×</button>
      </div>
      <h2 className={`mt-4 text-3xl font-black text-[#1f2746] dark:text-white`}>{prompts[step]}</h2>
      <label className={`mt-5 flex items-center gap-3 rounded-[1.3rem] px-4 py-3 bg-[#faf8ff] dark:bg-white/8`}>
        <Search className={`h-5 w-5 text-[#7b63f7] dark:text-[#c9bbff]`} />
        <input
          className={`w-full bg-transparent outline-none text-[#24304b] placeholder:text-[#9aa2bb] dark:text-white dark:placeholder:text-white/35`}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search tasks..."
          value={search}
        />
      </label>
      <div className={`mt-4 max-h-[24rem] overflow-y-auto rounded-[1.5rem] border border-[#ece8f8] bg-[#fcfbff] dark:border-white/10 dark:bg-white/[0.03]`}>
        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyTaskState text="No tasks match this step yet." />
          </div>
        ) : null}
        {filtered.map((task) => {
          const checked = draftIds.includes(task.id);
          return (
            <label className={`flex cursor-pointer items-center gap-3 border-b px-4 py-4 last:border-b-0 border-[#ece8f8] dark:border-white/10`} key={task.id}>
              <input
                checked={checked}
                className="h-5 w-5 rounded"
                onChange={() => onSetDraftIds(checked ? draftIds.filter((id) => id !== task.id) : [...draftIds, task.id])}
                type="checkbox"
              />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-lg font-semibold text-[#24304b] dark:text-white`}>{task.title}</p>
                <p className={`mt-1 text-sm text-[#7b84a0] dark:text-white/55`}>{formatTaskMetaLine(task)}</p>
              </div>
            </label>
          );
        })}
      </div>
      <button
        className={`mt-5 w-full rounded-[1.25rem] px-5 py-4 text-lg font-bold bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]`}
        onClick={() => {
          if (step === 2) {
            onFinish();
            return;
          }
          onStepChange((step + 1) as FocusPlannerStep);
        }}
        type="button"
      >
        {step === 2 ? "Finish" : "Next Question"}
      </button>
    </ModalShell>
  );
}

function MomentumTaskModal({
  doneTasks,
  onClose,
  remainingTasks,
  title,
}: {
  doneTasks: Task[];
  onClose: () => void;
  remainingTasks: Task[];
  title: string;
}) {
  return (
    <ModalShell className={`w-full max-w-[42rem] rounded-[2rem] border p-5 border-[#ece8f8] bg-white shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]`} label={title} onClose={onClose}>
      <div className="flex items-center justify-between gap-3">
        <h2 className={`text-2xl font-black text-[#1f2746] dark:text-white`}>{title}</h2>
        <button aria-label="Close" className={`text-2xl text-[#8e97af] dark:text-white/55`} onClick={onClose} type="button">×</button>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <section>
          <p className={`text-sm font-black uppercase tracking-[0.18em] text-[#0e9b74] dark:text-[#6ef0c4]`}>Finished</p>
          <div className="mt-3 space-y-2">
            {doneTasks.length === 0 ? <EmptyTaskState text="Nothing finished in this group yet." /> : null}
            {doneTasks.map((task) => (
              <div className={`rounded-[1rem] px-4 py-3 bg-[#edf9f4] text-[#23423a] dark:bg-[#103c33] dark:text-[#d7fff2]`} key={task.id}>
                {task.title}
              </div>
            ))}
          </div>
        </section>
        <section>
          <p className={`text-sm font-black uppercase tracking-[0.18em] text-[#f05566] dark:text-[#ff9eaf]`}>Remaining</p>
          <div className="mt-3 space-y-2">
            {remainingTasks.length === 0 ? <EmptyTaskState text="Everything in this group is finished." /> : null}
            {remainingTasks.map((task) => (
              <div className={`rounded-[1rem] px-4 py-3 bg-[#fff4f6] text-[#7c3042] dark:bg-[#44232f] dark:text-[#ffd5dc]`} key={task.id}>
                {task.title}
              </div>
            ))}
          </div>
        </section>
      </div>
    </ModalShell>
  );
}

function TaskHistoryModal({
  onClose,
  taskHistory,
  taskTitle,
}: {
  onClose: () => void;
  taskHistory: DbTaskHistory[];
  taskTitle: string;
}) {
  // Build a 12-week grid (84 days), most recent day last
  const today = getTodayKey();
  const totalDays = 84;
  const days = Array.from({ length: totalDays }, (_, i) => shiftDateKey(today, i - (totalDays - 1)));
  const historyByDate = new Map(taskHistory.map((h) => [h.entry_date, h]));

  // Group into weeks (columns of 7)
  const weeks: string[][] = [];
  for (let w = 0; w < 12; w++) {
    weeks.push(days.slice(w * 7, w * 7 + 7));
  }

  const completedCount = taskHistory.filter((h) => h.was_completed).length;

  function cellColor(dateKey: string) {
    if (dateKey > today) return "bg-transparent";
    const entry = historyByDate.get(dateKey);
    if (!entry) return "bg-[#ece8f8] dark:bg-white/8";
    if (entry.was_completed) return "bg-[#6f57f6] dark:bg-[#8b70ff]";
    return "bg-[#fbd0d5] dark:bg-[#5a2030]";
  }

  return (
    <ModalShell className={`w-full max-w-lg rounded-[2rem] border p-5 border-[#ece8f8] bg-white shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]`} label="Task history" onClose={onClose}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className={`text-lg font-black text-[#1f2746] dark:text-white`}>History</h2>
          <p className={`mt-0.5 text-sm text-[#7d88a1] dark:text-white/50`}>{taskTitle}</p>
        </div>
        <button className={`text-2xl leading-none text-[#8e97af] dark:text-white/55`} onClick={onClose} type="button">×</button>
      </div>

      {/* 12-week heatmap */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {weeks.map((week, wi) => (
          <div className="flex flex-col gap-1" key={wi}>
            {week.map((dateKey) => (
              <div
                className={`h-5 w-5 rounded-sm ${cellColor(dateKey)}`}
                key={dateKey}
                title={dateKey}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Legend + summary */}
      <div className="mt-4 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm bg-[#6f57f6] dark:bg-[#8b70ff]`} />
            <span className="text-[#7d88a1] dark:text-white/50">Done</span>
          </span>
          <span className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm bg-[#fbd0d5] dark:bg-[#5a2030]`} />
            <span className="text-[#7d88a1] dark:text-white/50">Missed</span>
          </span>
        </div>
        <span className="text-[#7d88a1] dark:text-white/50">
          {completedCount} completed in last 12 weeks
        </span>
      </div>
    </ModalShell>
  );
}

function BottomDock({
  activePage,
  onNavigate,
}: {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
}) {
  type DockPlacement = "bottom" | "left" | "right";
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDockCollapsing, setIsDockCollapsing] = useState(false);
  const [dockPlacement, setDockPlacement] = useState<DockPlacement>("bottom");
  const [showPlacementMenu, setShowPlacementMenu] = useState(false);
  const [placementMenuPos, setPlacementMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [isBubbleWhooshing, setIsBubbleWhooshing] = useState(false);
  const [bubblePos, setBubblePos] = useState(() => {
    if (typeof window === "undefined") {
      return { x: 24, y: 24 };
    }
    return { x: window.innerWidth - 96, y: window.innerHeight - 148 };
  });
  const [bubbleRenderPos, setBubbleRenderPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragReady, setIsDragReady] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const dragReadyTimerRef = useRef<number | null>(null);
  const collapseButtonRef = useRef<HTMLButtonElement | null>(null);
  const placementMenuRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clampBubblePos = (x: number, y: number) => {
    if (typeof window === "undefined") {
      return { x, y };
    }
    const minX = 12;
    const minY = 12;
    const maxX = window.innerWidth - 76;
    const maxY = window.innerHeight - 76;
    return {
      x: Math.min(maxX, Math.max(minX, x)),
      y: Math.min(maxY, Math.max(minY, y)),
    };
  };

  useEffect(() => {
    const handleResize = () => {
      setBubblePos((prev) => clampBubblePos(prev.x, prev.y));
      setBubbleRenderPos((prev) => (prev ? clampBubblePos(prev.x, prev.y) : prev));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const clearPlacementMenu = (event: MouseEvent) => {
      if (!showPlacementMenu) {
        return;
      }
      if (collapseButtonRef.current && collapseButtonRef.current.contains(event.target as Node)) {
        return;
      }
      if (placementMenuRef.current && placementMenuRef.current.contains(event.target as Node)) {
        return;
      }
      setShowPlacementMenu(false);
    };
    document.addEventListener("mousedown", clearPlacementMenu);
    return () => document.removeEventListener("mousedown", clearPlacementMenu);
  }, [showPlacementMenu]);

  const getCollapseOrigin = () => {
    const dockElement = collapseButtonRef.current?.parentElement;
    if (dockElement) {
      const rect = dockElement.getBoundingClientRect();
      return clampBubblePos(rect.left + rect.width / 2 - 32, rect.top + rect.height / 2 - 32);
    }
    if (!collapseButtonRef.current) {
      return clampBubblePos(window.innerWidth - 96, window.innerHeight - 148);
    }
    const rect = collapseButtonRef.current.getBoundingClientRect();
    return clampBubblePos(rect.left + rect.width / 2 - 32, rect.top + rect.height / 2 - 32);
  };

  const openPlacementMenu = () => {
    const fallback = { left: 16, top: 16 };
    if (!collapseButtonRef.current || typeof window === "undefined") {
      setPlacementMenuPos(fallback);
      setShowPlacementMenu(true);
      return;
    }

    const rect = collapseButtonRef.current.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 150;
    const gap = 12;
    const left =
      dockPlacement === "left"
        ? rect.right + gap
        : dockPlacement === "right"
          ? rect.left - menuWidth - gap
          : rect.right - menuWidth;
    const top = dockPlacement === "bottom" ? rect.top - menuHeight - gap : rect.top;

    setPlacementMenuPos({
      left: Math.min(window.innerWidth - menuWidth - 12, Math.max(12, left)),
      top: Math.min(window.innerHeight - menuHeight - 12, Math.max(12, top)),
    });
    setShowPlacementMenu(true);
  };

  const collapseDock = () => {
    const target = clampBubblePos(bubblePos.x, bubblePos.y);
    setShowPlacementMenu(false);
    setIsDockCollapsing(true);
    window.setTimeout(() => {
      const origin = getCollapseOrigin();
      setIsDockCollapsing(false);
      setIsCollapsed(true);
      setBubbleRenderPos(origin);
      setIsBubbleWhooshing(false);
      window.setTimeout(() => {
        setIsBubbleWhooshing(true);
        window.requestAnimationFrame(() => {
          setBubbleRenderPos(target);
        });
      }, 90);
      window.setTimeout(() => {
        setIsBubbleWhooshing(false);
        setBubbleRenderPos(target);
      }, 860);
    }, 640);
  };

  const startBubbleDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const el = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = (bubbleRenderPos ?? bubblePos).x;
    const originY = (bubbleRenderPos ?? bubblePos).y;

    // After 400ms hold, activate drag mode
    dragReadyTimerRef.current = window.setTimeout(() => {
      setIsDragReady(true);
      el.setPointerCapture(event.pointerId);
      dragRef.current = { startX, startY, originX, originY, moved: false };

      const handleMove = (moveEvent: PointerEvent) => {
        moveEvent.preventDefault();
        if (!dragRef.current) return;
        const dx = moveEvent.clientX - dragRef.current.startX;
        const dy = moveEvent.clientY - dragRef.current.startY;
        const next = clampBubblePos(dragRef.current.originX + dx, dragRef.current.originY + dy);
        dragRef.current.moved = true;
        setBubblePos(next);
        setBubbleRenderPos(next);
      };

      const handleUp = () => {
        dragRef.current = null;
        setIsDragReady(false);
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove, { passive: false });
      window.addEventListener("pointerup", handleUp);
    }, 400);

    const cancelDragReady = () => {
      if (dragReadyTimerRef.current) {
        window.clearTimeout(dragReadyTimerRef.current);
        dragReadyTimerRef.current = null;
      }
      setIsDragReady(false);
      // Short tap = open nav
      if (!dragRef.current?.moved) {
        setIsBubbleWhooshing(false);
        setIsCollapsed(false);
      }
      window.removeEventListener("pointerup", cancelDragReady);
    };

    window.addEventListener("pointerup", cancelDragReady);
  };

  if (isCollapsed) {
    return (
      <div
        className={`fixed z-20 select-none ${isBubbleWhooshing ? "transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]" : ""}`}
        style={{ left: (bubbleRenderPos ?? bubblePos).x, top: (bubbleRenderPos ?? bubblePos).y, userSelect: "none", WebkitUserSelect: "none", touchAction: isDragReady ? "none" : "auto" }}
      >
        <button
          aria-label="Open navigation"
          className={`flex h-16 w-16 items-center justify-center rounded-full border shadow-[0_16px_36px_rgba(60,44,140,0.22)] transition-all duration-300 ${isDragReady ? "scale-110 ring-4 ring-[#6f57f6]/40" : "hover:scale-105"} ${isBubbleWhooshing ? "duration-500 ease-out" : ""} border-[#ece8f8] bg-white/95 text-[#6f57f6] dark:border-white/10 dark:bg-[#171328]/95 dark:text-[#cabfff]`}
          onPointerDown={startBubbleDrag}
          style={{ WebkitUserDrag: "none", touchAction: "none" } as React.CSSProperties}
          type="button"
        >
          <CategoryIcon name={dockIcons[activePage]} className="h-6 w-6" />
        </button>
      </div>
    );
  }

  const isVertical = dockPlacement !== "bottom";
  const dockPositionClass = dockPlacement === "bottom"
    ? "fixed inset-x-0 z-10 px-4"
    : dockPlacement === "left"
      ? "fixed left-4 top-4 bottom-4 z-10 flex items-center"
      : "fixed right-4 top-4 bottom-4 z-10 flex items-center";
  const dockPositionStyle = dockPlacement === "bottom"
    ? { bottom: "calc(1.25rem + env(safe-area-inset-bottom))" }
    : undefined;
  const dockShapeClass = dockPlacement === "bottom"
    ? "mx-auto flex w-full max-w-[58rem] items-center justify-between gap-1 rounded-[2rem] px-3 py-1 overflow-x-auto sm:overflow-x-visible [&::-webkit-scrollbar]:hidden touch-pan-x"
    : "flex max-h-full w-[5rem] flex-col items-center gap-1 overflow-y-auto rounded-[2rem] px-2 py-3";
  const collapsingStyle = isDockCollapsing
    ? dockPlacement === "bottom"
      ? { maxWidth: "4rem", width: "4rem", height: "4rem", borderRadius: "9999px", padding: "0" }
      : { width: "4rem", height: "4rem", borderRadius: "9999px", padding: "0" }
    : undefined;

  return (
    <div className={`${dockPositionClass} select-none`} style={{ userSelect: "none", WebkitUserSelect: "none", ...dockPositionStyle }}>
      <div
        className={`relative ${isDockCollapsing ? "overflow-hidden" : "overflow-visible"} border shadow-[0_25px_45px_rgba(60,44,140,0.18)] transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${dockShapeClass} border-[#ece8f8] bg-white/92 backdrop-blur dark:border-white/10 dark:bg-[#171328]/92 dark:backdrop-blur`}
        style={collapsingStyle}
      >
        {dockItems.map((item) => (
          <button
            className={`flex ${isVertical ? "w-full" : "min-w-[3rem] shrink-0"} flex-col items-center justify-center rounded-[1.2rem] px-2 py-2.5 transition duration-300 ${isDockCollapsing ? "scale-75 opacity-0" : "scale-100 opacity-100"} ${
              activePage === item
                ? "text-[#6f57f6] dark:text-[#cabfff]"
                : "text-[#8d94ac] dark:text-white/50"
            }`}
            key={item}
            onClick={() => onNavigate(item)}
            type="button"
          >
            <CategoryIcon name={dockIcons[item]} className="h-7 w-7" />
          </button>
        ))}
        <button
          aria-label="Collapse navigation"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition duration-300 hover:scale-105 ${isVertical ? "" : "ml-1"} ${isDockCollapsing ? "scale-90 rounded-full" : ""} bg-[#f1ecff] text-[#6f57f6] dark:bg-[#2a214f] dark:text-[#cabfff]`}
          onClick={() => {
            if (!longPressTriggeredRef.current) {
              collapseDock();
            }
          }}
          onPointerDown={() => {
            longPressTriggeredRef.current = false;
            if (longPressTimerRef.current) {
              window.clearTimeout(longPressTimerRef.current);
            }
            longPressTimerRef.current = window.setTimeout(() => {
              longPressTriggeredRef.current = true;
              openPlacementMenu();
            }, 450);
          }}
          onPointerLeave={() => {
            if (longPressTimerRef.current) {
              window.clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
            }
          }}
          onPointerUp={() => {
            if (longPressTimerRef.current) {
              window.clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
            }
          }}
          ref={collapseButtonRef}
          type="button"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24">
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {showPlacementMenu && placementMenuPos ? (
          <div
            className={`fixed z-30 w-44 rounded-2xl border p-2 shadow-xl border-[#ece8f8] bg-white text-[#1f2746] dark:border-white/10 dark:bg-[#1b1730] dark:text-white`}
            ref={placementMenuRef}
            style={{ left: placementMenuPos.left, top: placementMenuPos.top }}
          >
            <p className={`px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/45`}>
              Dock Position
            </p>
            {([
              { id: "bottom", label: "Bottom Horizontal" },
              { id: "left", label: "Left Vertical" },
              { id: "right", label: "Right Vertical" },
            ] as Array<{ id: DockPlacement; label: string }>).map((option) => (
              <button
                className={`w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${dockPlacement === option.id ? "bg-[#f1ecff] text-[#6f57f6] dark:bg-[#2a214f] dark:text-[#cabfff]" : "hover:bg-[#f7f5ff] dark:hover:bg-white/10"}`}
                key={option.id}
                onClick={() => {
                  setDockPlacement(option.id);
                  setShowPlacementMenu(false);
                }}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
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

function readStoredProfile() {
  if (typeof window === "undefined") return DEFAULT_PROFILE;

  const saved = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!saved) {
    cachedProfileSnapshot = DEFAULT_PROFILE;
    return cachedProfileSnapshot;
  }

  try {
    const parsed = JSON.parse(saved) as UserProfile;
    parsed.logoSrc = normalizeLogoSrc(parsed.logoSrc);
    const nextProfile = {
      ...DEFAULT_PROFILE,
      ...parsed,
    };
    if (profilesEqual(cachedProfileSnapshot, nextProfile)) {
      return cachedProfileSnapshot;
    }
    cachedProfileSnapshot = nextProfile;
    return cachedProfileSnapshot;
  } catch {
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    cachedProfileSnapshot = DEFAULT_PROFILE;
    return cachedProfileSnapshot;
  }
}

function useProfileStore() {
  return useSyncExternalStore(
    subscribeToProfileStore,
    readStoredProfile,
    () => DEFAULT_PROFILE,
  );
}

function subscribeToProfileStore(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (!event.key || event.key === PROFILE_STORAGE_KEY) {
      onStoreChange();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(PROFILE_STORAGE_KEY, onStoreChange as EventListener);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(PROFILE_STORAGE_KEY, onStoreChange as EventListener);
  };
}

function saveProfile(profile: UserProfile) {
  if (typeof window === "undefined") return;
  cachedProfileSnapshot = profile;
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  window.dispatchEvent(new Event(PROFILE_STORAGE_KEY));
}

function profilesEqual(a: UserProfile, b: UserProfile) {
  return (
    a.avatarSrc === b.avatarSrc &&
    a.created === b.created &&
    a.displayName === b.displayName &&
    a.email === b.email &&
    a.logoSrc === b.logoSrc
  );
}

function LabeledInput({
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "date" | "email" | "number" | "text" | "time";
  value: string;
}) {
  return (
    <label className="grid gap-2">
      <span className={`text-sm font-semibold text-[#5f6983] dark:text-white/65`}>{label}</span>
      <input
        className={`h-12 rounded-[1rem] px-4 text-base outline-none bg-[#f7f5ff] text-[#1f2642] dark:bg-white/8 dark:text-white`}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}

function ToggleField({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex items-center justify-between gap-3 rounded-[1rem] px-4 py-3 bg-[#f7f5ff] dark:bg-white/8`}>
      <span className={`text-sm font-semibold text-[#27304c] dark:text-white`}>{label}</span>
      <input
        checked={checked}
        className="h-5 w-5 rounded"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  onChange: (value: T) => void;
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        className={`h-14 w-full rounded-[1.25rem] px-4 text-lg capitalize outline-none bg-[#f7f5ff] text-[#1f2642] dark:bg-white/8 dark:text-white`}
        onChange={(event) => onChange(event.target.value as T)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {formatOptionLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function taskChecklist(title: string) {
  const base = title.includes("Water")
    ? ["1 Cup", "2 Cups", "3 Cups", "4 Cups", "5 Cups", "6 Cups", "7 Cups", "8 Cups", "9 Cups"]
    : ["Open task", "Make first pass", "Ship one small step", "Close the loop"];

  return base.map((label, index) => ({
    label,
    done: index < Math.max(0, Math.floor(base.length / 2) - 1),
  }));
}

function getDefaultFocusCategories(userId: string) {
  return [
    {
      user_id: userId,
      title: "Coding",
      focus_type: "Work",
      focus_subtype: "Productive",
      focus_subtype_2: null,
      color: "#6f57f6",
      icon: "Code",
      daily_goal_seconds: null,
      weekly_goal_seconds: null,
      sort_order: 0,
    },
    {
      user_id: userId,
      title: "Lamprey Systems",
      focus_type: "Work",
      focus_subtype: "Paid",
      focus_subtype_2: null,
      color: "#12a876",
      icon: "Briefcase",
      daily_goal_seconds: null,
      weekly_goal_seconds: null,
      sort_order: 1,
    },
    {
      user_id: userId,
      title: "Sleep",
      focus_type: "Sleep",
      focus_subtype: "Rest",
      focus_subtype_2: null,
      color: "#ea580c",
      icon: "Moon",
      daily_goal_seconds: null,
      weekly_goal_seconds: null,
      sort_order: 2,
    },
  ];
}

function normalizeLogoSrc(src: string | null | undefined): string | null {
  if (!src || src.startsWith("data:")) return src ?? null;
  // Strip any baked-in basePath prefix (e.g. /ADHDice2/logo.png → /logo.png)
  return src.replace(/^\/[^/]+(?=\/logo\.png$)/, "");
}

function buildProfileSnapshot(
  profileRow: {
    display_name: string | null;
    avatar_src: string | null;
    logo_src: string | null;
  } | null,
  user: User,
): UserProfile {
  const fallbackName = user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    DEFAULT_PROFILE.displayName;

  return {
    avatarSrc: profileRow?.avatar_src || DEFAULT_PROFILE.avatarSrc,
    created: Boolean(profileRow),
    displayName: profileRow?.display_name || fallbackName,
    email: user.email || DEFAULT_PROFILE.email,
    logoSrc: normalizeLogoSrc(profileRow?.logo_src) || DEFAULT_PROFILE.logoSrc,
  };
}

function resolveTaskGridLayout(row: DbTaskGridLayout | null) {
  if (!row) {
    return TASK_GRID_STARTER_LAYOUT;
  }

  return normalizeTaskGridLayout(parseTaskGridLayoutJson(row.layout_json));
}

function mapTaskFocusDayRows(rows: DbTaskFocusDay[], tasks: Task[]) {
  const validTaskIds = new Set(tasks.map((task) => task.id));

  return rows.reduce<Record<string, string[]>>((accumulator, row) => {
    const normalizedTaskIds = normalizeTaskFocusIds(row.task_ids, validTaskIds);

    if (normalizedTaskIds.length > 0) {
      accumulator[row.focus_date] = normalizedTaskIds;
    }

    return accumulator;
  }, {});
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

function parseStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    window.localStorage.removeItem(key);
    return fallback;
  }
}

function migrateLegacyTaskUiState(state: TaskUiState): TaskUiState {
  if (state.view === "list") {
    return {
      ...state,
      view: "grid",
    };
  }

  return state;
}

function parseTaskGridLayoutJson(layoutJson: string | null | undefined) {
  if (!layoutJson) {
    return TASK_GRID_STARTER_LAYOUT;
  }

  try {
    const parsed = JSON.parse(layoutJson) as unknown;
    if (!Array.isArray(parsed)) {
      return TASK_GRID_STARTER_LAYOUT;
    }

    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const candidate = item as Partial<TaskGridItem>;
        if (
          typeof candidate.id !== "string" ||
          typeof candidate.type !== "string" ||
          !isTaskGridWidgetType(candidate.type)
        ) {
          return null;
        }

        return {
          h: typeof candidate.h === "number" ? candidate.h : 6,
          id: candidate.id,
          type: candidate.type,
          w: typeof candidate.w === "number" ? candidate.w : 1,
          x: typeof candidate.x === "number" ? candidate.x : 0,
          y: typeof candidate.y === "number" ? candidate.y : 0,
        } satisfies TaskGridItem;
      })
      .filter((item): item is TaskGridItem => item !== null);
  } catch {
    return TASK_GRID_STARTER_LAYOUT;
  }
}

function getUserScopedStorageKey(baseKey: string, userId: string) {
  return `${baseKey}:${userId}`;
}

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function matchesTaskQuickFilter(task: Task, filter: TaskQuickFilter, focusedTaskIds: string[]) {
  switch (filter) {
    case "active":
      return isTaskOpen(task);
    case "done":
      return isTaskFinished(task);
    case "urgent":
      return isTaskUrgent(task);
    case "today":
      return isTaskOpen(task) && isDueToday(task.due_on);
    case "focused":
      return isTaskOpen(task) && focusedTaskIds.includes(task.id);
    default:
      return true;
  }
}

function getNextMomentumView(currentView: MomentumView): MomentumView {
  return currentView === "urgent" ? "today" : currentView === "today" ? "focus" : "urgent";
}

function updateFocusedTaskIdsByDate(
  current: Record<string, string[]>,
  dateKey: string,
  taskIds: string[],
) {
  const next = { ...current };

  if (taskIds.length === 0) {
    delete next[dateKey];
    return next;
  }

  next[dateKey] = taskIds;
  return next;
}

function getMomentumMetric(
  data: {
    doneTasks: Task[];
    focusedTaskIds: string[];
    tasks: Task[];
    todayTasks: Task[];
    urgentTasks: Task[];
  },
  view: MomentumView,
) {
  if (view === "today") {
    const doneTasks = data.doneTasks.filter((task) => isDueToday(task.due_on));
    const remainingTasks = data.todayTasks;
    const totalCount = doneTasks.length + remainingTasks.length;
    const percent = totalCount === 0 ? 0 : Math.round((doneTasks.length / totalCount) * 100);
    return {
      doneTasks,
      label: "Today Momentum",
      percent,
      remainingTasks,
      summary: `${doneTasks.length} / ${totalCount} due today finished`,
      totalCount,
    };
  }

  if (view === "focus") {
    const focusedAllTasks = data.tasks.filter((task) => data.focusedTaskIds.includes(task.id));
    const doneTasks = focusedAllTasks.filter(isTaskFinished);
    const remainingTasks = focusedAllTasks.filter((task) => !isTaskFinished(task));
    const totalCount = focusedAllTasks.length;
    const percent = totalCount === 0 ? 0 : Math.round((doneTasks.length / totalCount) * 100);
    return {
      doneTasks,
      label: "Focus Momentum",
      percent,
      remainingTasks,
      summary: `${doneTasks.length} / ${totalCount} focused tasks finished`,
      totalCount,
    };
  }

  const doneTasks = data.doneTasks.filter(isTaskUrgent);
  const remainingTasks = data.urgentTasks;
  const totalCount = doneTasks.length + remainingTasks.length;
  const percent = totalCount === 0 ? 0 : Math.round((doneTasks.length / totalCount) * 100);
  return {
    doneTasks,
    label: "Urgent Momentum",
    percent,
    remainingTasks,
    summary: `${doneTasks.length} / ${totalCount} urgent tasks finished`,
    totalCount,
  };
}

function normalizeCategoryTitle(value: string) {
  return value.trim().toLowerCase();
}

function normalizeTaskGridLayout(layout: TaskGridItem[]) {
  const sanitized = layout
    .filter((item) => isTaskGridWidgetType(item.type))
    .map((item) => ({
      ...item,
      h: Math.max(4, Math.min(TASK_GRID_MAX_DISPLAY_ROWS * 2, Math.round(item.h))),
      w: Math.max(1, Math.min(TASK_GRID_MAX_COLUMNS, Math.round(item.w))),
    }));

  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  return sanitized.map((item) => {
    if (cursorX + item.w > TASK_GRID_MAX_COLUMNS) {
      cursorY += rowHeight;
      cursorX = 0;
      rowHeight = 0;
    }

    const normalizedItem = {
      ...item,
      x: cursorX,
      y: cursorY,
    };

    cursorX += item.w;
    rowHeight = Math.max(rowHeight, item.h);

    if (cursorX >= TASK_GRID_MAX_COLUMNS) {
      cursorY += rowHeight;
      cursorX = 0;
      rowHeight = 0;
    }

    return normalizedItem;
  });
}

function buildTaskGridWidget(widgetType: TaskGridWidgetType): TaskGridItem {
  const defaultSize = widgetType === "urgent" || widgetType === "due_today" || widgetType === "completed" || widgetType === "import"
    ? { h: 8, w: 2 }
    : widgetType === "focus_stats"
      ? { h: 6, w: 1 }
      : { h: 6, w: 1 };

  return {
    h: defaultSize.h,
    id: `grid-${widgetType}-${crypto.randomUUID()}`,
    type: widgetType,
    w: defaultSize.w,
    x: 0,
    y: 0,
  };
}

function reorderTaskGridItems(layout: TaskGridItem[], sourceId: string, targetId: string) {
  const sourceIndex = layout.findIndex((item) => item.id === sourceId);
  const targetIndex = layout.findIndex((item) => item.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return layout;
  }

  const next = [...layout];
  const [sourceItem] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, sourceItem);
  return normalizeTaskGridLayout(next);
}

function moveTaskGridItem(layout: TaskGridItem[], widgetId: string, direction: "up" | "down") {
  const currentIndex = layout.findIndex((item) => item.id === widgetId);
  if (currentIndex === -1) {
    return layout;
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= layout.length) {
    return layout;
  }

  const next = [...layout];
  const [item] = next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, item);
  return normalizeTaskGridLayout(next);
}

function getMissingTaskGridWidgetTypes(layout: TaskGridItem[]) {
  const usedTypes = new Set(layout.map((item) => item.type));
  return (Object.keys(TASK_GRID_WIDGET_LABELS) as TaskGridWidgetType[]).filter((type) => !usedTypes.has(type));
}

function getTaskGridWidthPresets(currentColumns: number) {
  return [
    { label: "1 Col", width: 1 },
    ...(currentColumns >= 2 ? [{ label: "2 Cols", width: 2 }] : []),
    ...(currentColumns >= 3 ? [{ label: "3 Cols", width: 3 }] : []),
    ...(currentColumns >= 4 ? [{ label: "4 Cols", width: 4 }] : []),
  ];
}

function getTaskGridHeightPresets() {
  return [
    { label: "2 Rows", span: 4 },
    { label: "4 Rows", span: 8 },
    { label: "6 Rows", span: 12 },
    { label: "8 Rows", span: 16 },
    { label: "10 Rows", span: 20 },
  ];
}

function getDisplayRowsFromSpan(span: number) {
  return Math.max(1, Math.round(span / 2));
}

function getSpanFromDisplayRows(rows: number) {
  return Math.max(2, Math.min(TASK_GRID_MAX_DISPLAY_ROWS * 2, rows * 2));
}

function isTaskGridWidgetType(value: string): value is TaskGridWidgetType {
  return value in TASK_GRID_WIDGET_LABELS;
}

function preferStoredValue(storedValue: string | null | undefined, currentValue: string | null | undefined) {
  const normalizedStoredValue = sanitizeFocusLabel(storedValue, "");
  const normalizedCurrentValue = sanitizeFocusLabel(currentValue, "");
  return normalizedCurrentValue || normalizedStoredValue;
}

function preferStoredOptionalValue(storedValue: string | null | undefined, currentValue: string | null | undefined) {
  const normalizedStoredValue = sanitizeFocusLabel(storedValue, "");
  const normalizedCurrentValue = sanitizeFocusLabel(currentValue, "");
  return normalizedCurrentValue || normalizedStoredValue || null;
}

function dedupeCategoriesByName(categories: FocusCategory[]) {
  return Array.from(
    categories.reduce((accumulator, category) => {
      const normalizedTitle = normalizeCategoryTitle(category.title);
      if (!normalizedTitle) {
        return accumulator;
      }
      accumulator.set(normalizedTitle, category);
      return accumulator;
    }, new Map<string, FocusCategory>()).values(),
  );
}

function normalizeTaskFocusIds(
  taskIds: string[] | null | undefined,
  validTaskIds?: Set<string> | Task[],
) {
  const validTaskIdSet = Array.isArray(validTaskIds)
    ? new Set(validTaskIds.map((task) => task.id))
    : validTaskIds;

  return Array.from(
    new Set(
      (taskIds ?? []).filter((taskId): taskId is string => {
        if (typeof taskId !== "string" || !isUuid(taskId)) {
          return false;
        }

        return validTaskIdSet ? validTaskIdSet.has(taskId) : true;
      }),
    ),
  );
}

function isValidDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function calcNextDueDate(task: Task): string | null {
  if (task.repeat_frequency === "none") return null;
  const base = task.due_on ? new Date(`${task.due_on}T12:00:00`) : new Date();
  const interval = Math.max(1, task.repeat_interval ?? 1);

  if (task.repeat_frequency === "daily") {
    base.setDate(base.getDate() + interval);
    return formatDateKey(base);
  }

  if (task.repeat_frequency === "weekly") {
    const days = task.repeat_days_of_week ?? [];
    if (days.length === 0) {
      base.setDate(base.getDate() + 7 * interval);
      return formatDateKey(base);
    }
    // Find next occurrence from days list
    const sortedDays = [...days].sort((a, b) => a - b);
    const baseDow = base.getDay();
    const nextDow = sortedDays.find((d) => d > baseDow) ?? sortedDays[0];
    const daysUntil = nextDow > baseDow
      ? nextDow - baseDow
      : 7 * interval - (baseDow - nextDow);
    base.setDate(base.getDate() + daysUntil);
    return formatDateKey(base);
  }

  if (task.repeat_frequency === "monthly") {
    const targetDay = task.repeat_day_of_month ?? base.getDate();
    base.setMonth(base.getMonth() + interval);
    const maxDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    base.setDate(Math.min(targetDay, maxDay));
    return formatDateKey(base);
  }

  // custom: treat as daily with interval
  base.setDate(base.getDate() + interval);
  return formatDateKey(base);
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function useResponsiveTaskGridColumns() {
  const getColumns = () => {
    if (typeof window === "undefined") {
      return TASK_GRID_MAX_COLUMNS;
    }

    if (window.innerWidth >= 1280) {
      return TASK_GRID_MAX_COLUMNS;
    }

    if (window.innerWidth >= 768) {
      return TASK_GRID_TABLET_COLUMNS;
    }

    return TASK_GRID_PHONE_COLUMNS;
  };

  const [columns, setColumns] = useState(getColumns);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => setColumns(getColumns());
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return columns;
}

function sanitizeFocusLabel(value: string | null | undefined, fallback: string) {
  const trimmed = (value ?? "").trim();
  return trimmed || fallback;
}

function sanitizeOptionalFocusLabel(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function daysUntil(date: string | null) {
  if (!date) return null;
  const start = new Date(`${todayISO()}T00:00:00`);
  const end = new Date(`${date}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function isDueToday(date: string | null) {
  return date === todayISO();
}

function isTaskOpenStatus(status: TaskStatus) {
  return OPEN_TASK_STATUSES.includes(status);
}

function isTaskFinishedStatusValue(status: TaskStatus) {
  return FINISHED_TASK_STATUSES.includes(status);
}

function isTaskOpen(task: Task) {
  return isTaskOpenStatus(task.status);
}

function isTaskFinished(task: Task) {
  return isTaskFinishedStatusValue(task.status);
}

function isTaskUrgent(task: Task) {
  return isTaskOpen(task) && (task.is_urgent || isOverdue(task.due_on) || task.priority === "high");
}

function isTaskImportant(task: Task) {
  return isTaskOpen(task) && (task.is_important || task.priority === "high");
}

function isOverdue(date: string | null) {
  const difference = daysUntil(date);
  return difference !== null && difference < 0;
}

function formatDueLabel(date: string | null) {
  const difference = daysUntil(date);
  if (difference === null) return "No date";
  if (difference === 0) return "Today";
  if (difference === 1) return "Tomorrow";
  if (difference < 0) return `${Math.abs(difference)}d overdue`;
  return `${difference}d`;
}

function formatDueTimeLabel(time: string | null) {
  if (!time) {
    return null;
  }

  const [hours, minutes] = time.split(":");
  const parsedHours = Number.parseInt(hours ?? "", 10);
  const parsedMinutes = Number.parseInt(minutes ?? "", 10);
  if (!Number.isFinite(parsedHours) || !Number.isFinite(parsedMinutes)) {
    return time;
  }

  const normalizedHours = parsedHours % 24;
  const suffix = normalizedHours >= 12 ? "PM" : "AM";
  const displayHours = normalizedHours % 12 === 0 ? 12 : normalizedHours % 12;
  return `${displayHours}:${String(parsedMinutes).padStart(2, "0")} ${suffix}`;
}

function formatTaskMetaLine(task: Task) {
  const parts = [formatDueLabel(task.due_on)];
  const dueTime = formatDueTimeLabel(task.due_time);
  if (dueTime) {
    parts.push(dueTime);
  }
  parts.push(`${task.energy} energy`);
  parts.push(task.is_important ? "important" : `${task.priority} priority`);
  if (task.estimated_minutes) {
    parts.push(`${task.estimated_minutes} min`);
  }
  return parts.join(" · ");
}

function formatRepeatSummary(task: Task) {
  if (task.repeat_frequency === "none") {
    return null;
  }

  if (task.repeat_frequency === "daily") {
    return task.repeat_interval > 1 ? `Every ${task.repeat_interval} days` : "Daily";
  }

  if (task.repeat_frequency === "weekly") {
    const weekdayLabels = task.repeat_days_of_week
      .map((day) => repeatWeekdayOptions.find((option) => option.value === day)?.label)
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    const weekdaySummary = weekdayLabels.length > 0 ? ` (${weekdayLabels.join(", ")})` : "";
    return task.repeat_interval > 1
      ? `Every ${task.repeat_interval} weeks${weekdaySummary}`
      : `Weekly${weekdaySummary}`;
  }

  if (task.repeat_frequency === "monthly") {
    const daySummary = task.repeat_day_of_month ? ` on ${task.repeat_day_of_month}` : "";
    return task.repeat_interval > 1
      ? `Every ${task.repeat_interval} months${daySummary}`
      : `Monthly${daySummary}`;
  }

  return "Custom repeat";
}

function createTaskEditorDraft(task: Task | null, focusToday: boolean, subtasks: DbTaskSubtask[]): TaskEditorDraft {
  return {
    title: task?.title ?? "",
    notes: task?.notes ?? "",
    status: task?.status ?? "pending",
    priority: task?.priority ?? "normal",
    energy: task?.energy ?? "medium",
    isUrgent: task?.is_urgent ?? false,
    isImportant: task?.is_important ?? false,
    focusToday,
    dueOn: task?.due_on ?? "",
    dueTime: task?.due_time ?? "",
    estimatedMinutes: task?.estimated_minutes ? String(task.estimated_minutes) : "",
    tags: task?.tags ?? [],
    externalLinkLabel: task?.external_link_label ?? "",
    externalLinkUrl: task?.external_link_url ?? "",
    oneStepAtATime: task?.one_step_at_a_time ?? false,
    subtasksAutoReset: task?.subtasks_auto_reset ?? false,
    repeatFrequency: task?.repeat_frequency ?? "none",
    repeatInterval: String(task?.repeat_interval ?? 1),
    repeatDaysOfWeek: task?.repeat_days_of_week ?? [],
    repeatDayOfMonth: task?.repeat_day_of_month ? String(task.repeat_day_of_month) : "",
    subtasks: (function buildTree(parentId: string | null): TaskSubtaskDraft[] {
      return subtasks
        .filter((s) => (s.parent_subtask_id ?? null) === parentId)
        .map((s) => ({ id: s.id, status: s.status, title: s.title, children: buildTree(s.id) }));
    })(null),
  };
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parsePositiveInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseDayOfMonth(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 31 ? parsed : null;
}

function parseTagList(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

function isProbablyValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function buildDraftSubtasksFromLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim().replace(/^[-*]\s+/, ""))
    .filter(Boolean)
    .map((title, index) => ({
      id: `draft-subtask-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      status: "pending" as const,
      title,
      children: [],
    }));
}

function moveDraftSubtask(subtasks: TaskSubtaskDraft[], subtaskId: string, direction: "up" | "down") {
  const index = subtasks.findIndex((subtask) => subtask.id === subtaskId);
  if (index === -1) {
    return subtasks;
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= subtasks.length) {
    return subtasks;
  }

  const next = [...subtasks];
  const [item] = next.splice(index, 1);
  next.splice(targetIndex, 0, item);
  return next;
}

function groupTaskSubtasksByTaskId(subtasks: DbTaskSubtask[]) {
  return subtasks.reduce<Record<string, DbTaskSubtask[]>>((accumulator, subtask) => {
    if (!accumulator[subtask.task_id]) {
      accumulator[subtask.task_id] = [];
    }
    accumulator[subtask.task_id].push(subtask);
    return accumulator;
  }, {});
}

function mapTaskSubtaskRow(row: DbTaskSubtask) {
  return row;
}

function getNextPendingSubtask(taskId: string, subtasksByTaskId: Record<string, DbTaskSubtask[]>) {
  return (subtasksByTaskId[taskId] ?? []).find((subtask) => subtask.status !== "done") ?? null;
}

function mapTaskHistoryRow(row: DbTaskHistory) {
  return row;
}

function isTaskCompletedForHistory(status: TaskStatus) {
  return status === "done" || status === "did_my_best";
}

function isTaskHistoryStatus(status: TaskStatus) {
  return status === "done" || status === "did_my_best" || status === "missed";
}

function computeTaskHistoryStats(history: DbTaskHistory[]): TaskHistoryStats {
  const byDate = history.reduce<Map<string, { completed: boolean }>>((accumulator, entry) => {
    const existing = accumulator.get(entry.entry_date);
    accumulator.set(entry.entry_date, {
      completed: (existing?.completed ?? false) || entry.was_completed,
    });
    return accumulator;
  }, new Map());

  const loggedDates = [...byDate.keys()].sort();
  const completedDates = loggedDates.filter((date) => byDate.get(date)?.completed);
  const loggedDays = loggedDates.length;
  const doneRate = loggedDays === 0 ? 0 : Math.round((completedDates.length / loggedDays) * 100);

  let currentStreak = 0;
  let cursor = todayISO();
  while (completedDates.includes(cursor)) {
    currentStreak += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  let bestStreak = 0;
  let runningStreak = 0;
  let previousDate: string | null = null;
  for (const date of completedDates) {
    if (!previousDate) {
      runningStreak = 1;
    } else {
      runningStreak = shiftDateKey(previousDate, 1) === date ? runningStreak + 1 : 1;
    }
    bestStreak = Math.max(bestStreak, runningStreak);
    previousDate = date;
  }

  return {
    bestStreak,
    currentStreak,
    doneRate,
    loggedDays,
  };
}

function formatOptionLabel(value: string) {
  return value.replaceAll("_", " ");
}

function sortTasksForUi(nextTasks: Task[]) {
  return [...nextTasks].sort((left, right) => {
    const leftBucket = isTaskOpen(left) ? 0 : isTaskFinished(left) ? 1 : 2;
    const rightBucket = isTaskOpen(right) ? 0 : isTaskFinished(right) ? 1 : 2;
    if (leftBucket !== rightBucket) {
      return leftBucket - rightBucket;
    }

    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order;
    }

    return right.created_at.localeCompare(left.created_at);
  });
}
