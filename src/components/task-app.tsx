"use client";

import Image from "next/image";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import {
  ArrowUp,
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
  Dice5,
  Dices,
  FlaskConical,
  DollarSign,
  Dumbbell,
  FileText,
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
  Zap,
} from "lucide-react";
import dynamicIconImports from "lucide-react/dynamicIconImports";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FocusPage } from "./focus-page";
import { ModalShell } from "./modal-shell";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type {
  FocusCategory as DbFocusCategory,
  Task,
  TaskEnergy,
  TaskFocusDay as DbTaskFocusDay,
  TaskGridLayout as DbTaskGridLayout,
  TaskInsert,
  TaskPriority,
  TaskUpdate,
} from "@/lib/database.types";

type Message = {
  tone: "neutral" | "good" | "warn";
  text: string;
};

type AuthMode = "sign-in" | "sign-up";
type TaskDraft = Omit<TaskInsert, "user_id">;
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
type TaskUiState = {
  matchAny: boolean;
  quickFilters: TaskQuickFilter[];
  search: string;
  view: TaskViewMode;
  energyFilters: TaskEnergy[];
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

export type FocusType = string;
export type FocusSubtype = string;

export const DEFAULT_FOCUS_TYPES = ["Work", "Personal", "Entertainment", "Sleep"];
export const DEFAULT_PRIMARY_SUBTYPES: string[] = [];
export const DEFAULT_SECONDARY_SUBTYPES: string[] = [];
export const DEFAULT_FOCUS_TITLES = ["Deep Work", "Admin", "Exercise", "Reading"];
export const DEFAULT_FOCUS_CATEGORY_TITLES = ["Coding", "Lamprey Systems", "Sleep"];

export type FocusCategory = {
  id: string;
  title: string;
  focusType: FocusType;
  focusSubtype?: FocusSubtype | null;
  focusSubtype2?: FocusSubtype | null;
  color: string;
  icon: string; // SVG path or icon name
  dailyGoalSeconds?: number | null;
  weeklyGoalSeconds?: number | null;
};

export type ActiveFocusSession = {
  categoryId: string;
  startTime: number | null; // null if paused
  accumulatedSeconds: number;
  isRunning: boolean;
};

export type HistoricalFocusSession = {
  id: string;
  categoryId: string | null;
  title: string;
  date: string; // YYYY-MM-DD
  durationSeconds: number;
  focusType: FocusType;
  focusSubtype?: FocusSubtype | null;
  focusSubtype2?: FocusSubtype | null;
  notes?: string;
  createdAt?: string;
};

export type FocusLabelOptions = {
  titles: string[];
  types: string[];
  primarySubtypes: string[];
  secondarySubtypes: string[];
  allSubtypes: string[];
};

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
const TASK_GRID_MAX_COLUMNS = 4;
const TASK_GRID_TABLET_COLUMNS = 2;
const TASK_GRID_PHONE_COLUMNS = 1;
const TASK_GRID_ROW_HEIGHT = 42;
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
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(supabase !== null);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [message, setMessage] = useState<Message | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [activePage, setActivePage] = useState<AppPage>("Home");
  const [focusCategories, setFocusCategories] = useState<FocusCategory[]>([]);
  const [activeSessions, setActiveSessions] = useState<Record<string, ActiveFocusSession>>({});
  const [focusHistory, setFocusHistory] = useState<HistoricalFocusSession[]>([]);
  const [taskUiState, setTaskUiState] = useState<TaskUiState>(DEFAULT_TASK_UI_STATE);
  const [focusedTaskIdsByDate, setFocusedTaskIdsByDate] = useState<Record<string, string[]>>({});
  const [taskGridLayout, setTaskGridLayout] = useState<TaskGridItem[]>(TASK_GRID_STARTER_LAYOUT);
  const [isGridEditMode, setIsGridEditMode] = useState(false);
  const [selectedGridWidgetId, setSelectedGridWidgetId] = useState<string | null>(null);
  const [draggedGridWidgetId, setDraggedGridWidgetId] = useState<string | null>(null);
  const [showFocusPlanner, setShowFocusPlanner] = useState(false);
  const [focusPlannerStep, setFocusPlannerStep] = useState<FocusPlannerStep>(0);
  const [focusDraftIds, setFocusDraftIds] = useState<string[]>([]);
  const [momentumView, setMomentumView] = useState<MomentumView>("urgent");
  const [isMomentumListOpen, setIsMomentumListOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const profile = useProfileStore();
  const suppressCategoryReload = useRef(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const gridColumns = useResponsiveTaskGridColumns();

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

      const [taskResult, profileResult, categoryResult, activeResult, historyResult, focusDayResult, gridLayoutResult] = await Promise.all([
        client
          .from("adhdice_clean_tasks")
          .select("*")
          .eq("user_id", userId)
          .neq("status", "archived")
          .order("status", { ascending: true })
          .order("sort_order", { ascending: true })
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
      setTaskGridLayout(nextTaskGridLayout);
      saveFocusCategories(nextCategories);
      saveFocusHistory(nextFocusHistory);
      saveProfile(buildProfileSnapshot(profileResult.data, currentUser));
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
      setTaskGridLayout(TASK_GRID_STARTER_LAYOUT);
      setIsGridEditMode(false);
      setSelectedGridWidgetId(null);
      return;
    }

    setTaskUiState({
      ...DEFAULT_TASK_UI_STATE,
      ...parseStoredJson<TaskUiState>(getUserScopedStorageKey(TASK_UI_STORAGE_KEY, userId), DEFAULT_TASK_UI_STATE),
    });
    setFocusedTaskIdsByDate(
      parseStoredJson<Record<string, string[]>>(getUserScopedStorageKey(TASK_FOCUS_STORAGE_KEY, userId), {}),
    );
    setTaskGridLayout(
      normalizeTaskGridLayout(
        parseStoredJson<TaskGridItem[]>(getUserScopedStorageKey(TASK_GRID_STORAGE_KEY, userId), TASK_GRID_STARTER_LAYOUT),
      ),
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

  const lightMode = theme === "light";

  if (!supabase) {
    return <ConfigSplash lightMode={lightMode} />;
  }

  if (loading) {
    return <LoadingSplash lightMode={lightMode} status="Opening ADHDice..." />;
  }

  if (!session?.user) {
    return (
      <AuthSplash
        lightMode={lightMode}
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

  const activeTasks = tasks.filter((task) => task.status === "active");
  const doneTasks = tasks.filter((task) => task.status === "done");
  const overdueTasks = activeTasks.filter((task) => isOverdue(task.due_on));
  const todayTasks = activeTasks.filter((task) => isDueToday(task.due_on));
  const highPriorityTasks = activeTasks.filter((task) => task.priority === "high");
  const lowEnergyTasks = activeTasks.filter((task) => task.energy === "low").slice(0, 4);
  const focusedTasks = activeTasks.filter((task) => focusedTaskIds.includes(task.id));
  const urgentTasks = [...overdueTasks, ...highPriorityTasks.filter((task) => !isOverdue(task.due_on))]
    .slice(0, 6);
  const searchQuery = taskUiState.search.trim().toLowerCase();
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = searchQuery.length === 0 || task.title.toLowerCase().includes(searchQuery);
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
  const filteredActiveTasks = filteredTasks.filter((task) => task.status === "active");
  const filteredDoneTasks = filteredTasks.filter((task) => task.status === "done");
  const filteredUrgentTasks = filteredActiveTasks.filter((task) => isOverdue(task.due_on) || task.priority === "high");
  const filteredFocusTasks = filteredActiveTasks.filter((task) => focusedTaskIds.includes(task.id));
  const filteredLowEnergyTasks = filteredActiveTasks.filter((task) => task.energy === "low").slice(0, 4);
  const filteredHighPriorityTasks = filteredActiveTasks.filter((task) => task.priority === "high");
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

  async function saveFocusSelection(nextTaskIds: string[]) {
    const normalizedTaskIds = normalizeTaskFocusIds(nextTaskIds, tasks);

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
    const { error } = await client.from("adhdice_clean_tasks").insert({
      ...task,
      user_id: currentUser.id,
      sort_order: Date.now(),
    });

    setMessage(
      error
        ? { tone: "warn", text: error.message }
        : { tone: "good", text: "Task captured." },
    );
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

    const { error } = await client.from("adhdice_clean_tasks").insert(payload);

    setMessage(
      error
        ? { tone: "warn", text: error.message }
        : { tone: "good", text: `${lines.length} task${lines.length === 1 ? "" : "s"} imported.` },
    );
  }

  async function updateTask(taskId: string, values: TaskUpdate) {
    const { error } = await client
      .from("adhdice_clean_tasks")
      .update(values)
      .eq("id", taskId);

    if (error) {
      setMessage({ tone: "warn", text: error.message });
    }
  }

  async function handleToggleTimer(categoryId: string) {
    const current = activeSessions[categoryId] ?? {
      categoryId,
      startTime: null,
      accumulatedSeconds: 0,
      isRunning: false,
    };
    const now = Date.now();
    const nextSession = current.isRunning
      ? {
          ...current,
          isRunning: false,
          startTime: null,
          accumulatedSeconds: current.accumulatedSeconds +
            (current.startTime ? Math.floor((now - current.startTime) / 1000) : 0),
        }
      : {
          ...current,
          isRunning: true,
          startTime: now,
        };

    setActiveSessions((prev) => ({
      ...prev,
      [categoryId]: nextSession,
    }));

    const { error } = await client
      .from("adhdice_focus_active_sessions")
      .upsert(
        {
          user_id: currentUser.id,
          category_id: categoryId,
          start_time: nextSession.startTime ? new Date(nextSession.startTime).toISOString() : null,
          accumulated_seconds: nextSession.accumulatedSeconds,
          is_running: nextSession.isRunning,
        },
        { onConflict: "user_id,category_id" },
      );

    if (error) {
      setMessage({ tone: "warn", text: error.message });
    }
  }

  async function handleManualFocusEntry(data: {
    categoryId: string | null;
    title: string;
    focusType: FocusType;
    focusSubtype?: FocusSubtype | null;
    focusSubtype2?: FocusSubtype | null;
    durationSeconds: number;
    date: string;
    notes: string;
  }) {
    const payload = {
      user_id: currentUser.id,
      category_id: data.categoryId,
      title_snapshot: sanitizeFocusLabel(data.title, "Untitled Session"),
      focus_type_snapshot: sanitizeFocusLabel(data.focusType, "Work"),
      focus_subtype_snapshot: sanitizeOptionalFocusLabel(data.focusSubtype),
      focus_subtype_2_snapshot: sanitizeOptionalFocusLabel(data.focusSubtype2),
      session_date: data.date,
      duration_seconds: data.durationSeconds,
      notes: data.notes || null,
      source: "manual" as const,
    };

    let { data: inserted, error } = await client
      .from("adhdice_focus_sessions")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    if (!inserted) {
      setMessage({ tone: "warn", text: "Focus entry saved, but the response was empty." });
      return false;
    }

    const nextEntry = mergeStoredFocusHistory([
      {
        ...mapFocusSessionRow(inserted),
        title: data.title,
        focusType: data.focusType,
        focusSubtype: data.focusSubtype,
        focusSubtype2: data.focusSubtype2,
      },
    ])[0];
    setFocusHistory((prev) => {
      const nextHistory = [nextEntry, ...prev];
      saveFocusHistory(nextHistory);
      return nextHistory;
    });
    setMessage({ tone: "good", text: "Focus entry saved." });
    return true;
  }

  async function handleFinishTimer(
    categoryId: string,
    data?: { title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; notes: string },
  ) {
    const activeSession = activeSessions[categoryId];
    if (!activeSession) {
      return;
    }

    const category = focusCategories.find((entry) => entry.id === categoryId);
    if (!category) {
      return;
    }

    const now = Date.now();
    const elapsed = activeSession.isRunning && activeSession.startTime
      ? Math.floor((now - activeSession.startTime) / 1000)
      : 0;
    const totalSeconds = activeSession.accumulatedSeconds + elapsed;

    if (totalSeconds < 1) {
      return;
    }

    const completedAt = new Date(now).toISOString();
    const payload = {
      user_id: currentUser.id,
      category_id: categoryId,
      title_snapshot: sanitizeFocusLabel(data?.title ?? category.title, "Untitled Session"),
      focus_type_snapshot: sanitizeFocusLabel(data?.focusType ?? category.focusType, "Work"),
      focus_subtype_snapshot: sanitizeOptionalFocusLabel(data?.focusSubtype ?? category.focusSubtype),
      focus_subtype_2_snapshot: sanitizeOptionalFocusLabel(data?.focusSubtype2 ?? category.focusSubtype2),
      session_date: todayISO(),
      duration_seconds: totalSeconds,
      notes: data?.notes || null,
      started_at: activeSession.startTime ? new Date(activeSession.startTime).toISOString() : null,
      ended_at: completedAt,
      source: "timer" as const,
    };

    let { data: inserted, error } = await client
      .from("adhdice_focus_sessions")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return;
    }

    if (!inserted) {
      setMessage({ tone: "warn", text: "Focus session saved, but the response was empty." });
      return;
    }

    const { error: deleteError } = await client
      .from("adhdice_focus_active_sessions")
      .delete()
      .eq("user_id", currentUser.id)
      .eq("category_id", categoryId);

    if (deleteError) {
      setMessage({ tone: "warn", text: deleteError.message });
      return;
    }

    const nextEntry = mergeStoredFocusHistory([
      {
        ...mapFocusSessionRow(inserted),
        title: data?.title ?? category.title,
        focusType: data?.focusType ?? category.focusType,
        focusSubtype: data?.focusSubtype ?? category.focusSubtype,
        focusSubtype2: data?.focusSubtype2 ?? category.focusSubtype2,
      },
    ])[0];
    setFocusHistory((prev) => {
      const nextHistory = [nextEntry, ...prev];
      saveFocusHistory(nextHistory);
      return nextHistory;
    });
    setActiveSessions((prev) => {
      const next = { ...prev };
      delete next[categoryId];
      return next;
    });
    setMessage({ tone: "good", text: "Focus session saved." });
  }

  async function handleAdjustTimer(categoryId: string, deltaSeconds: number) {
    const current = activeSessions[categoryId] ?? {
      categoryId,
      startTime: null,
      accumulatedSeconds: 0,
      isRunning: false,
    };

    const nextAccumulated = Math.max(0, current.accumulatedSeconds + deltaSeconds);
    const nextSession: ActiveFocusSession = {
      ...current,
      accumulatedSeconds: nextAccumulated,
    };

    setActiveSessions((prev) => ({
      ...prev,
      [categoryId]: nextSession,
    }));

    const { error } = await client
      .from("adhdice_focus_active_sessions")
      .upsert(
        {
          user_id: currentUser.id,
          category_id: categoryId,
          start_time: nextSession.startTime ? new Date(nextSession.startTime).toISOString() : null,
          accumulated_seconds: nextSession.accumulatedSeconds,
          is_running: nextSession.isRunning,
        },
        { onConflict: "user_id,category_id" },
      );

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return;
    }

    setMessage({ tone: "good", text: "Timer adjusted." });
  }

  async function handleResetTimer(categoryId: string) {
    const { error } = await client
      .from("adhdice_focus_active_sessions")
      .delete()
      .eq("user_id", currentUser.id)
      .eq("category_id", categoryId);

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return;
    }

    setActiveSessions((prev) => {
      const next = { ...prev };
      delete next[categoryId];
      return next;
    });
    setMessage({ tone: "good", text: "Timer reset." });
  }

  async function handleSaveCategories(categories: FocusCategory[]) {
    const uniqueCategories = dedupeCategoriesByName(categories).map((category) => ({
      ...category,
      id: isUuid(category.id) ? category.id : crypto.randomUUID(),
    }));

    if (uniqueCategories.length === 0) {
      setFocusCategories([]);
      saveFocusCategories([]);
      setMessage({ tone: "good", text: "Focus categories updated." });
      return true;
    }

    // Apply optimistically and suppress the realtime-triggered reload so it
    // can't race and overwrite with stale values while the upsert is in flight.
    setFocusCategories(uniqueCategories);
    saveFocusCategories(uniqueCategories);
    suppressCategoryReload.current = true;

    const payload = uniqueCategories.map((category, index) => ({
      id: category.id,
      user_id: currentUser.id,
      title: sanitizeFocusLabel(category.title, "Untitled Category"),
      focus_type: sanitizeFocusLabel(category.focusType, "Work"),
      focus_subtype: sanitizeOptionalFocusLabel(category.focusSubtype),
      focus_subtype_2: sanitizeOptionalFocusLabel(category.focusSubtype2),
      color: category.color,
      icon: category.icon,
      daily_goal_seconds: category.dailyGoalSeconds ?? null,
      weekly_goal_seconds: category.weeklyGoalSeconds ?? null,
      sort_order: index,
    }));

    let savedCategories, error;
    try {
      ({ data: savedCategories, error } = await client
        .from("adhdice_focus_categories")
        .upsert(payload, { onConflict: "id" })
        .select("*"));
    } finally {
      suppressCategoryReload.current = false;
    }

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    // Reconcile with the DB-assigned fields (sort_order, created_at, etc.)
    const nextCategories = (savedCategories ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(mapFocusCategoryRow);

    setFocusCategories(nextCategories);
    saveFocusCategories(nextCategories);
    setMessage({ tone: "good", text: "Focus categories updated." });
    return true;
  }

  async function handleDeleteFocusCategory(category: FocusCategory) {
    const confirmed = window.confirm(
      `Delete "${category.title}"? Saved focus history will stay in place as one-off historical records, but active timers for this category will be cleared. This cannot be undone.`,
    );

    if (!confirmed) {
      return false;
    }

    const { error } = await client
      .from("adhdice_focus_categories")
      .delete()
      .eq("id", category.id)
      .eq("user_id", currentUser.id);

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    setFocusCategories((prev) => {
      const nextCategories = prev.filter((entry) => entry.id !== category.id);
      saveFocusCategories(nextCategories);
      return nextCategories;
    });
    setFocusHistory((prev) => {
      const nextHistory = prev.map((entry) => (
        entry.categoryId === category.id
          ? { ...entry, categoryId: null }
          : entry
      ));
      saveFocusHistory(nextHistory);
      return nextHistory;
    });
    setActiveSessions((prev) => {
      const next = { ...prev };
      delete next[category.id];
      return next;
    });
    setMessage({ tone: "good", text: "Focus category deleted." });
    return true;
  }

  async function handleUpdateFocusHistoryEntry(
    entryId: string,
    data: {
      categoryId: string | null;
      title: string;
      focusType: FocusType;
      focusSubtype?: FocusSubtype | null;
      focusSubtype2?: FocusSubtype | null;
      durationSeconds: number;
      date: string;
      notes: string;
    },
  ) {
    const payload = {
      category_id: data.categoryId,
      title_snapshot: sanitizeFocusLabel(data.title, "Untitled Session"),
      focus_type_snapshot: sanitizeFocusLabel(data.focusType, "Work"),
      focus_subtype_snapshot: sanitizeOptionalFocusLabel(data.focusSubtype),
      focus_subtype_2_snapshot: sanitizeOptionalFocusLabel(data.focusSubtype2),
      session_date: data.date,
      duration_seconds: data.durationSeconds,
      notes: data.notes || null,
    };

    let { data: updated, error } = await client
      .from("adhdice_focus_sessions")
      .update(payload)
      .eq("id", entryId)
      .eq("user_id", currentUser.id)
      .select("*")
      .single();

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return;
    }

    if (!updated) {
      setMessage({ tone: "warn", text: "Focus entry updated, but the response was empty." });
      return;
    }

    const nextEntry = mergeStoredFocusHistory([
      {
        ...mapFocusSessionRow(updated),
        title: data.title,
        focusType: data.focusType,
        focusSubtype: data.focusSubtype,
        focusSubtype2: data.focusSubtype2,
      },
    ])[0];
    setFocusHistory((prev) => {
      const nextHistory = prev.map((entry) => (entry.id === entryId ? nextEntry : entry));
      saveFocusHistory(nextHistory);
      return nextHistory;
    });
    setMessage({ tone: "good", text: "Focus entry updated." });
  }

  async function handleDeleteFocusHistoryEntry(entryId: string) {
    if (!window.confirm("Delete this focus entry? This cannot be undone.")) {
      return;
    }

    const { error } = await client
      .from("adhdice_focus_sessions")
      .delete()
      .eq("id", entryId)
      .eq("user_id", currentUser.id);

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return;
    }

    setFocusHistory((prev) => {
      const nextHistory = prev.filter((entry) => entry.id !== entryId);
      saveFocusHistory(nextHistory);
      return nextHistory;
    });
    setMessage({ tone: "good", text: "Focus entry deleted." });
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
      className={`min-h-screen px-3 py-4 transition-colors sm:px-5 lg:px-8 xl:px-10 ${
        lightMode
          ? "bg-[linear-gradient(180deg,#ffffff_0%,#faf8ff_100%)] text-[#182033]"
          : "bg-[linear-gradient(180deg,#0d0c17_0%,#141124_100%)] text-white"
      }`}
    >
      <section className="mx-auto w-full max-w-[110rem] pb-28">
        {isAccountOpen ? (
          <AccountModal
            lightMode={lightMode}
            onClose={() => setIsAccountOpen(false)}
            onSave={handleSaveProfile}
            onSignOut={() => void client.auth.signOut()}
            profile={profile}
          />
        ) : null}
        <TopHeader
          doneCount={doneTasks.length}
          lightMode={lightMode}
          onOpenAccount={() => setIsAccountOpen(true)}
          profile={profile}
          theme={theme}
          onThemeChange={setTheme}
        />

        {isWorkspaceLoading ? (
          <div className={`mt-5 rounded-[1.5rem] border px-5 py-4 text-sm font-semibold ${lightMode ? "border-[#ece8f8] bg-white text-[#5f6983]" : "border-white/10 bg-white/6 text-white/70"}`}>
            Syncing your workspace...
          </div>
        ) : null}

        {message ? (
          <div className="mt-5">
            <StatusBanner lightMode={lightMode} message={message} />
          </div>
        ) : null}

        {activePage === "Home" ? (
          <HomePage
            activeCount={activeTasks.length}
            doneCount={doneTasks.length}
            lightMode={lightMode}
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
                lightMode={lightMode}
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
            {isMomentumListOpen ? (
              <MomentumTaskModal
                doneTasks={momentumMetric.doneTasks}
                lightMode={lightMode}
                onClose={() => setIsMomentumListOpen(false)}
                remainingTasks={momentumMetric.remainingTasks}
                title={momentumMetric.label}
              />
            ) : null}
            <TaskHero
              actionLabel={hasFocusedToday ? "Refocus" : "Focus"}
              activeCount={activeTasks.length}
              lightMode={lightMode}
              metric={momentumMetric}
              onCycleMomentum={() => setMomentumView(getNextMomentumView(momentumView))}
              onOpenFocusPlanner={openFocusPlanner}
              onOpenMomentumDetails={() => setIsMomentumListOpen(true)}
              todayCount={todayTasks.length}
            />

            <div className="mt-6">
              <ControlBar
                lightMode={lightMode}
                onOpenComposer={() => scrollToTaskElement("task-composer-card")}
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
                lightMode={lightMode}
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
                lightMode={lightMode}
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
                onResizeWidget={(widgetId, nextWidth, nextHeight) => {
                  void handleResizeGridWidget(widgetId, nextWidth, nextHeight);
                }}
                onSelectWidget={setSelectedGridWidgetId}
                onSetDraggedWidget={setDraggedGridWidgetId}
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
                lightMode={lightMode}
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
                lightMode={lightMode}
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
                <div className="mt-7 grid gap-5 xl:grid-cols-[1.45fr_1.1fr_0.9fr]">
                  <UrgentTasksPanel
                    focusedTaskIds={focusedTaskIds}
                    lightMode={lightMode}
                    tasks={filteredUrgentTasks}
                    onToggle={(task) =>
                      updateTask(task.id, {
                        status: "done",
                        completed_at: new Date().toISOString(),
                      })
                    }
                  />
                  <div className="grid gap-5">
                    <div id="task-composer-card">
                      <TaskComposerCard lightMode={lightMode} onAdd={addTask} />
                    </div>
                    <TaskLane
                      count={filteredFocusTasks.length}
                      defaultExpanded
                      lightMode={lightMode}
                      title="Focus Today"
                      tasks={filteredFocusTasks}
                      tone="purple"
                    />
                  </div>
                  <div id="task-import-panel">
                    <SupportPanel
                      doneCount={filteredDoneTasks.length}
                      lightMode={lightMode}
                      lowEnergyTasks={filteredLowEnergyTasks}
                      message={message}
                      onImport={importTasks}
                    />
                  </div>
                </div>

                <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_1.2fr_0.8fr]">
                  <TaskLane
                    count={filteredTodayTasks.length}
                    lightMode={lightMode}
                    title="Due Today"
                    tasks={filteredTodayTasks}
                    tone="purple"
                  />
                  <TaskLane
                    count={filteredHighPriorityTasks.length}
                    lightMode={lightMode}
                    title="Active Queue"
                    tasks={filteredActiveTasks.slice(0, 8)}
                    tone="soft"
                  />
                  <FocusStatsCard
                    activeCount={filteredActiveTasks.length}
                    doneCount={filteredDoneTasks.length}
                    lightMode={lightMode}
                    overdueCount={filteredUrgentTasks.length}
                  />
                </div>
                {filteredDoneTasks.length > 0 ? (
                  <div className="mt-5">
                    <TaskLane
                      count={filteredDoneTasks.length}
                      lightMode={lightMode}
                      title="Completed"
                      tasks={filteredDoneTasks}
                      tone="soft"
                    />
                  </div>
                ) : null}
              </>
            )}
          </>
        ) : activePage === "Focus" ? (
          <FocusPage
            activeSessions={activeSessions}
            categories={focusCategories}
            history={focusHistory}
            lightMode={lightMode}
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
        ) : (
          <PagePlaceholder
            count={activeTasks.length}
            lightMode={lightMode}
            page={activePage}
            setActivePage={setActivePage}
          />
        )}
      </section>

      <BottomDock
        activePage={activePage}
        lightMode={lightMode}
        onNavigate={setActivePage}
      />
      {showBackToTop ? (
        <button
          aria-label="Back to top"
          className={`fixed bottom-28 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full shadow-[0_18px_40px_rgba(81,61,168,0.24)] transition hover:-translate-y-0.5 sm:bottom-8 sm:right-8 ${
            lightMode
              ? "bg-[linear-gradient(180deg,#7c63f7_0%,#664cf1_100%)] text-white"
              : "bg-[linear-gradient(180deg,#c9bbff_0%,#9b87ff_100%)] text-[#171127]"
          }`}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          type="button"
        >
          <ArrowUp className="h-6 w-6" />
        </button>
      ) : null}
    </main>
  );
}

function ConfigSplash({ lightMode }: { lightMode: boolean }) {
  return (
    <main className={`min-h-screen px-3 py-8 sm:px-5 lg:px-8 ${lightMode ? "bg-[linear-gradient(180deg,#ffffff_0%,#faf8ff_100%)] text-[#182033]" : "bg-[linear-gradient(180deg,#0d0c17_0%,#141124_100%)] text-white"}`}>
      <section className="mx-auto flex min-h-[80vh] max-w-3xl items-center justify-center">
        <div className={`w-full rounded-[2rem] border p-8 text-center ${lightMode ? "border-[#ece8f8] bg-white shadow-[0_24px_70px_rgba(81,61,168,0.1)]" : "border-white/10 bg-white/6"}`}>
          <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${lightMode ? "text-[#8e88a9]" : "text-white/40"}`}>
            Setup Needed
          </p>
          <h1 className={`mt-3 text-4xl font-black ${lightMode ? "text-[#17203a]" : "text-white"}`}>
            Add your Supabase keys
          </h1>
          <p className={`mt-3 text-base ${lightMode ? "text-[#707a95]" : "text-white/55"}`}>
            Create `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then restart the app.
          </p>
        </div>
      </section>
    </main>
  );
}

function LoadingSplash({
  lightMode,
  status,
}: {
  lightMode: boolean;
  status: string;
}) {
  return (
    <main className={`min-h-screen px-3 py-8 sm:px-5 lg:px-8 ${lightMode ? "bg-[linear-gradient(180deg,#ffffff_0%,#faf8ff_100%)] text-[#182033]" : "bg-[linear-gradient(180deg,#0d0c17_0%,#141124_100%)] text-white"}`}>
      <section className="mx-auto flex min-h-[80vh] max-w-3xl items-center justify-center">
        <div className={`w-full rounded-[2rem] border p-8 text-center ${lightMode ? "border-[#ece8f8] bg-white shadow-[0_24px_70px_rgba(81,61,168,0.1)]" : "border-white/10 bg-white/6"}`}>
          <div className={`mx-auto h-14 w-14 animate-pulse rounded-full ${lightMode ? "bg-[#ede8ff]" : "bg-[#22193f]"}`} />
          <h1 className={`mt-5 text-3xl font-black ${lightMode ? "text-[#17203a]" : "text-white"}`}>
            {status}
          </h1>
        </div>
      </section>
    </main>
  );
}

function AuthSplash({
  lightMode,
  message,
  onAuthenticate,
}: {
  lightMode: boolean;
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
    <main className={`min-h-screen px-3 py-8 sm:px-5 lg:px-8 ${lightMode ? "bg-[linear-gradient(180deg,#ffffff_0%,#faf8ff_100%)] text-[#182033]" : "bg-[linear-gradient(180deg,#0d0c17_0%,#141124_100%)] text-white"}`}>
      <section className="mx-auto grid min-h-[80vh] max-w-5xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="text-center lg:text-left">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${lightMode ? "text-[#8e88a9]" : "text-white/40"}`}>
            ADHDice Cloud
          </p>
          <h1 className={`mt-3 text-[clamp(2.8rem,6vw,5rem)] font-black leading-none ${lightMode ? "text-[#17203a]" : "text-white"}`}>
            Sync tasks, focus history, and your account.
          </h1>
          <p className={`mt-4 text-lg ${lightMode ? "text-[#707a95]" : "text-white/55"}`}>
            Create an account with an email and password to save your task list, focus categories, active timers, and imported history to Supabase.
          </p>
        </div>

        <div className={`rounded-[2rem] border p-6 ${lightMode ? "border-[#ece8f8] bg-white shadow-[0_24px_70px_rgba(81,61,168,0.1)]" : "border-white/10 bg-white/6"}`}>
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
              <h2 className={`text-2xl font-black ${lightMode ? "text-[#202844]" : "text-white"}`}>
                {mode === "sign-up" ? "Create your account" : "Sign in"}
              </h2>
              <p className={`mt-2 text-sm ${lightMode ? "text-[#7d88a1]" : "text-white/55"}`}>
                Use the same email and password on Mac, iPhone, and anywhere else you log in.
              </p>
            </div>

            <div className={`grid grid-cols-2 gap-2 rounded-[1rem] p-1 ${lightMode ? "bg-[#f7f5ff]" : "bg-white/8"}`}>
              <button
                className={`rounded-[0.85rem] px-4 py-3 text-sm font-semibold ${mode === "sign-up"
                  ? lightMode ? "bg-white text-[#6f57f6]" : "bg-[#22193f] text-[#cabfff]"
                  : lightMode ? "text-[#7d88a1]" : "text-white/55"}`}
                onClick={() => setMode("sign-up")}
                type="button"
              >
                Create Account
              </button>
              <button
                className={`rounded-[0.85rem] px-4 py-3 text-sm font-semibold ${mode === "sign-in"
                  ? lightMode ? "bg-white text-[#6f57f6]" : "bg-[#22193f] text-[#cabfff]"
                  : lightMode ? "text-[#7d88a1]" : "text-white/55"}`}
                onClick={() => setMode("sign-in")}
                type="button"
              >
                Sign In
              </button>
            </div>

            <label className="grid gap-2">
              <span className={`text-sm font-semibold ${lightMode ? "text-[#5f6983]" : "text-white/65"}`}>Email</span>
              <input
                className={`h-14 rounded-[1rem] px-4 text-base outline-none ${lightMode ? "bg-[#f7f5ff] text-[#1f2642]" : "bg-white/8 text-white"}`}
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={email}
              />
            </label>

            <label className="grid gap-2">
              <span className={`text-sm font-semibold ${lightMode ? "text-[#5f6983]" : "text-white/65"}`}>Password</span>
              <input
                className={`h-14 rounded-[1rem] px-4 text-base outline-none ${lightMode ? "bg-[#f7f5ff] text-[#1f2642]" : "bg-white/8 text-white"}`}
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                required
                type="password"
                value={password}
              />
            </label>

            <button
              className={`w-full rounded-[1rem] px-5 py-4 text-base font-bold ${lightMode ? "bg-[#6f57f6] text-white" : "bg-[#cabfff] text-[#1a1431]"}`}
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
              <StatusBanner lightMode={lightMode} message={message} />
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function StatusBanner({
  lightMode,
  message,
}: {
  lightMode: boolean;
  message: Message;
}) {
  const className = message.tone === "warn"
    ? lightMode
      ? "border-[#ffd5dc] bg-[#fff2f4] text-[#9f364d]"
      : "border-[#4d2130] bg-[#2a1620] text-[#ffb1c0]"
    : message.tone === "good"
      ? lightMode
        ? "border-[#d7f5e9] bg-[#effcf6] text-[#0d8b60]"
        : "border-[#1f4d3d] bg-[#11271f] text-[#8ce8c0]"
      : lightMode
        ? "border-[#ece8f8] bg-white text-[#5f6983]"
        : "border-white/10 bg-white/6 text-white/70";

  return (
    <div className={`rounded-[1.25rem] border px-4 py-3 text-sm font-medium ${className}`}>
      {message.text}
    </div>
  );
}

function TopHeader({
  doneCount,
  lightMode,
  onOpenAccount,
  profile,
  theme,
  onThemeChange,
}: {
  doneCount: number;
  lightMode: boolean;
  onOpenAccount: () => void;
  profile: UserProfile;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}) {
  const accountButton = (
    <button
      className={`flex items-center gap-3 rounded-full px-2 py-2 ${lightMode ? "bg-white shadow-[0_10px_30px_rgba(81,61,168,0.08)]" : "bg-white/10"}`}
      onClick={onOpenAccount}
      type="button"
    >
      <div className="text-right">
        <p className={`text-sm font-semibold ${lightMode ? "text-[#202743]" : "text-white"}`}>
          {profile.displayName}
        </p>
        <p className={`text-xs ${lightMode ? "text-[#8a84a3]" : "text-white/45"}`}>
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
        lightMode ? "border-[#ece8f8]" : "border-white/10"
      }`}
    >
      {/* Row 1 (mobile): logo + account side by side */}
      <div className="flex items-center justify-between gap-4 lg:justify-start">
        <div className="flex items-center gap-1">
          <BrandMark profile={profile} />
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${lightMode ? "bg-[#f1ecff] text-[#7f6af7]" : "bg-white/10 text-[#c5b8ff]"}`}>
            v.6.5.5
          </span>
        </div>
        <div className="lg:hidden">{accountButton}</div>
      </div>

      {/* Row 2 (mobile): stats. On desktop these join row 1 on the right. */}
      <div className="flex flex-wrap items-center gap-3">
        <ThemeToggle lightMode={lightMode} theme={theme} onThemeChange={onThemeChange} />
        <ProgressStat lightMode={lightMode} label="Lvl 7" value="919 / 1135 XP" />
        <MiniStat lightMode={lightMode} label="Focus Gems" value="6436" />
        <MiniStat lightMode={lightMode} label="Streak" value={String(doneCount + 50)} />
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
  lightMode,
  onClose,
  onSave,
  onSignOut,
  profile,
}: {
  lightMode: boolean;
  onClose: () => void;
  onSave: (profile: UserProfile) => Promise<void>;
  onSignOut: () => void;
  profile: UserProfile;
}) {
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [isSaving, setIsSaving] = useState(false);

  return (
    <ModalShell className={`w-full max-w-[34rem] max-h-[82vh] overflow-y-auto rounded-[2rem] border p-6 ${lightMode ? "border-[#ece8f8] bg-white shadow-[0_30px_80px_rgba(81,61,168,0.16)]" : "border-white/10 bg-[#171328]"}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${lightMode ? "text-[#8d87a7]" : "text-white/35"}`}>
              Account
            </p>
            <h2 className={`mt-2 text-3xl font-black ${lightMode ? "text-[#202844]" : "text-white"}`}>
              {draft.created ? "Edit profile" : "Create your account"}
            </h2>
          </div>
          <button
            className={`rounded-full px-4 py-2 text-sm font-semibold ${lightMode ? "bg-[#f1ecff] text-[#6f57f6]" : "bg-[#22193f] text-[#cabfff]"}`}
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-2">
            <span className={`text-sm font-semibold ${lightMode ? "text-[#5f6983]" : "text-white/65"}`}>Display name</span>
            <input
              className={`h-12 rounded-[1rem] px-4 text-base outline-none ${lightMode ? "bg-[#f7f5ff] text-[#1f2642]" : "bg-white/8 text-white"}`}
              onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
              value={draft.displayName}
            />
          </label>

          <label className="grid gap-2">
            <span className={`text-sm font-semibold ${lightMode ? "text-[#5f6983]" : "text-white/65"}`}>Email</span>
            <input
              className={`h-12 rounded-[1rem] px-4 text-base outline-none ${lightMode ? "bg-[#f7f5ff] text-[#1f2642]" : "bg-white/8 text-white"}`}
              onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
              type="email"
              value={draft.email}
            />
          </label>

          <UploadField
            helper="Upload a profile photo."
            label="Profile photo"
            lightMode={lightMode}
            onFile={(value) => setDraft((current) => ({ ...current, avatarSrc: value }))}
          />

          <UploadField
            helper="Upload your transparent logo file to replace the text wordmark."
            label="Transparent logo"
            lightMode={lightMode}
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
                <p className={`text-sm font-semibold ${lightMode ? "text-[#202844]" : "text-white"}`}>{draft.displayName}</p>
                <p className={`text-xs ${lightMode ? "text-[#8a84a3]" : "text-white/45"}`}>{draft.email}</p>
              </div>
            </div>
            <button
              className={`rounded-[1rem] px-5 py-3 text-base font-bold ${lightMode ? "bg-[#6f57f6] text-white" : "bg-[#cabfff] text-[#1a1431]"}`}
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
            className={`mt-2 w-full rounded-[1rem] px-5 py-3 text-sm font-semibold ${lightMode ? "bg-[#fff1f2] text-[#d64b5f]" : "bg-[#351924] text-[#ff9fbc]"}`}
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
  lightMode,
  onFile,
}: {
  helper: string;
  label: string;
  lightMode: boolean;
  onFile: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className={`text-sm font-semibold ${lightMode ? "text-[#5f6983]" : "text-white/65"}`}>{label}</span>
      <input
        className={`rounded-[1rem] px-4 py-3 text-sm outline-none file:mr-3 file:rounded-full file:border-0 file:px-4 file:py-2 file:font-semibold ${lightMode ? "bg-[#f7f5ff] text-[#1f2642] file:bg-[#ede8ff] file:text-[#6f57f6]" : "bg-white/8 text-white file:bg-[#22193f] file:text-[#cabfff]"}`}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const value = await readFileAsDataUrl(file);
          onFile(value);
        }}
        type="file"
      />
      <span className={`text-xs ${lightMode ? "text-[#8a84a3]" : "text-white/45"}`}>{helper}</span>
    </label>
  );
}

function HomePage({
  activeCount,
  doneCount,
  lightMode,
  lowEnergyTasks,
  momentumPercent,
  overdueCount,
  setActivePage,
  todayCount,
  urgentTasks,
}: {
  activeCount: number;
  doneCount: number;
  lightMode: boolean;
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
        <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${lightMode ? "text-[#8e88a9]" : "text-white/40"}`}>
          Home Dashboard
        </p>
        <h1 className={`mt-2 text-[clamp(2.4rem,5vw,4rem)] font-black tracking-tight ${lightMode ? "text-[#17203a]" : "text-white"}`}>
          Your focus overview
        </h1>
        <p className={`mt-1 max-w-3xl text-base ${lightMode ? "text-[#707a95]" : "text-white/55"}`}>
          Start here for momentum, urgent tasks, low-energy wins, and quick jumps into the rest of ADHDice.
        </p>
        <button
          className={`mt-6 rounded-[1.25rem] px-5 py-3 text-lg font-bold transition hover:-translate-y-0.5 ${lightMode ? "bg-[#6f57f6] text-white shadow-[0_14px_32px_rgba(111,87,246,0.24)]" : "bg-[#cabfff] text-[#1a1431]"}`}
          onClick={() => setActivePage("Tasks")}
          type="button"
        >
          Open Tasks
        </button>
      </section>

      <div className="mt-7 flex flex-wrap justify-center gap-5">
        <OverviewStatCard lightMode={lightMode} label="Urgent Momentum" value={`${momentumPercent}%`} detail={`${overdueCount} overdue`} />
        <OverviewStatCard lightMode={lightMode} label="Today Queue" value={String(todayCount)} detail="ready to work" />
        <OverviewStatCard lightMode={lightMode} label="Active Tasks" value={String(activeCount)} detail="current load" />
        <OverviewStatCard lightMode={lightMode} label="Completed" value={String(doneCount)} detail="closed loops" />
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-5">
        <DashboardJumpCard
          className=""
          cta="Go to Tasks"
          description="Refocus, urgent momentum, filters, and your active queue."
          lightMode={lightMode}
          onClick={() => setActivePage("Tasks")}
          title="Task Command"
        />
        <DashboardJumpCard
          className=""
          cta="Open Focus"
          description="Timer sessions, low-friction entry points, and calm starting rituals."
          lightMode={lightMode}
          onClick={() => setActivePage("Focus")}
          title="Focus Mode"
        />
        <DashboardJumpCard
          className=""
          cta="View Stats"
          description="Patterns, streaks, and reward loops without overwhelming density."
          lightMode={lightMode}
          onClick={() => setActivePage("Stats")}
          title="Progress"
        />
      </div>

      <div className="mt-5 flex flex-wrap justify-center items-start gap-5">
        <HomeUrgentPreview lightMode={lightMode} tasks={urgentTasks.slice(0, 3)} onClick={() => setActivePage("Tasks")} />
        <HomeLowEnergyPreview lightMode={lightMode} tasks={lowEnergyTasks} onClick={() => setActivePage("Tasks")} />
      </div>
    </>
  );
}

function OverviewStatCard({
  detail,
  label,
  lightMode,
  value,
}: {
  detail: string;
  label: string;
  lightMode: boolean;
  value: string;
}) {
  return (
    <section className={`flex h-[139px] w-[180px] flex-col items-center justify-center rounded-[1.8rem] border px-5 py-4 text-center transition hover:-translate-y-0.5 ${lightMode ? "border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)]" : "border-white/10 bg-white/6"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${lightMode ? "text-[#8d87a7]" : "text-white/35"}`}>{label}</p>
      <p className={`mt-1 text-4xl font-black leading-none ${lightMode ? "text-[#1f2746]" : "text-white"}`}>{value}</p>
      <p className={`mt-1 text-sm leading-tight ${lightMode ? "text-[#7f88a1]" : "text-white/55"}`}>{detail}</p>
    </section>
  );
}

function DashboardJumpCard({
  className = "",
  cta,
  description,
  lightMode,
  onClick,
  title,
}: {
  className?: string;
  cta: string;
  description: string;
  lightMode: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      className={`self-start w-fit rounded-[2rem] border px-5 py-3 flex flex-col items-center text-center transition hover:-translate-y-0.5 ${className} ${lightMode ? "border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)]" : "border-white/10 bg-white/6"}`}
      onClick={onClick}
      type="button"
    >
      <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${lightMode ? "text-[#8d87a7]" : "text-white/35"}`}>Overview</p>
      <h2 className={`mt-1.5 text-2xl font-black ${lightMode ? "text-[#26304c]" : "text-white"}`}>{title}</h2>
      <p className={`mt-1.5 max-w-[260px] text-sm leading-6 ${lightMode ? "text-[#7a839e]" : "text-white/55"}`}>{description}</p>
      <span className={`mt-3 inline-flex rounded-full px-4 py-2 text-sm font-semibold ${lightMode ? "bg-[#f1ecff] text-[#6f57f6]" : "bg-[#22193f] text-[#cabfff]"}`}>
        {cta}
      </span>
    </button>
  );
}

function HomeUrgentPreview({
  lightMode,
  onClick,
  tasks,
}: {
  lightMode: boolean;
  onClick: () => void;
  tasks: Task[];
}) {
  return (
    <section className={`w-full sm:w-fit sm:min-w-[440px] rounded-[2rem] border p-4 transition hover:-translate-y-0.5 ${lightMode ? "border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)]" : "border-white/10 bg-white/6"}`}>
      <div className="flex items-center justify-between gap-6">
        <h2 className={`text-2xl font-black uppercase tracking-[0.08em] ${lightMode ? "text-[#28304a]" : "text-white"}`}>
          Urgent Snapshot
        </h2>
        <button
          className={`min-w-[110px] rounded-full px-4 py-2 text-sm font-semibold transition ${lightMode ? "bg-[#f1ecff] text-[#6f57f6]" : "bg-[#22193f] text-[#cabfff]"}`}
          onClick={onClick}
          type="button"
        >
          Open Tasks
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {tasks.map((task) => (
          <div className={`max-w-[32rem] rounded-[1.2rem] border px-4 py-3 ${lightMode ? "border-[#eee9fb] bg-[#fcfbff]" : "border-white/10 bg-white/[0.04]"}`} key={task.id}>
            <p className={`text-lg font-semibold ${lightMode ? "text-[#27304c]" : "text-white"}`}>{task.title}</p>
            <p className={`mt-1 text-sm ${lightMode ? "text-[#7d88a1]" : "text-white/55"}`}>{formatDueLabel(task.due_on)} / {task.priority} priority</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HomeLowEnergyPreview({
  lightMode,
  onClick,
  tasks,
}: {
  lightMode: boolean;
  onClick: () => void;
  tasks: Task[];
}) {
  return (
    <section className={`w-full sm:w-fit sm:min-w-[440px] rounded-[2rem] border p-4 transition hover:-translate-y-0.5 ${lightMode ? "border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)]" : "border-white/10 bg-white/6"}`}>
      <div className="flex items-center justify-between gap-6">
        <h2 className={`text-2xl font-black uppercase tracking-[0.08em] ${lightMode ? "text-[#28304a]" : "text-white"}`}>
          Low Energy Wins
        </h2>
        <button
          className={`min-w-[110px] rounded-full px-4 py-2 text-sm font-semibold transition ${lightMode ? "bg-[#f1ecff] text-[#6f57f6]" : "bg-[#22193f] text-[#cabfff]"}`}
          onClick={onClick}
          type="button"
        >
          Add Task
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {tasks.map((task) => (
          <div className={`max-w-[32rem] rounded-[1.2rem] border px-4 py-3 ${lightMode ? "border-[#eee9fb] bg-[#fcfbff]" : "border-white/10 bg-white/[0.04]"}`} key={task.id}>
            <p className={`text-base font-semibold ${lightMode ? "text-[#26304c]" : "text-white"}`}>{task.title}</p>
            <p className={`mt-1 text-sm ${lightMode ? "text-[#7d88a1]" : "text-white/55"}`}>{formatDueLabel(task.due_on)} / low effort</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PagePlaceholder({
  count,
  lightMode,
  page,
  setActivePage,
}: {
  count: number;
  lightMode: boolean;
  page: AppPage;
  setActivePage: (page: AppPage) => void;
}) {
  return (
    <section className="pt-8 flex flex-col items-center text-center">
      <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${lightMode ? "text-[#8e88a9]" : "text-white/40"}`}>
        {page}
      </p>
      <h1 className={`mt-2 text-[clamp(2.2rem,5vw,3.6rem)] font-black tracking-tight ${lightMode ? "text-[#17203a]" : "text-white"}`}>
        {page} Page
      </h1>
      <p className={`mt-1 max-w-lg text-base leading-relaxed ${lightMode ? "text-[#707a95]" : "text-white/55"}`}>
        This section is currently being refined to match the new high-fidelity ADHDice design system. Your focus overview and task cockpit are live!
      </p>
      <div className="mt-12 flex flex-wrap justify-center gap-6">
        <button
          className={`rounded-full px-8 py-4 text-lg font-bold transition hover:-translate-y-0.5 ${lightMode ? "bg-[#6f57f6] text-white shadow-[0_12px_28px_rgba(111,87,246,0.2)]" : "bg-[#cabfff] text-[#1a1431]"}`}
          onClick={() => setActivePage("Home")}
          type="button"
        >
          Back to Home
        </button>
        <button
          className={`rounded-full px-8 py-4 text-lg font-bold transition hover:-translate-y-0.5 ${lightMode ? "bg-[#f1ecff] text-[#6f57f6]" : "bg-[#22193f] text-[#cabfff]"}`}
          onClick={() => setActivePage("Tasks")}
          type="button"
        >
          Open Tasks
        </button>
      </div>
      <div className="mt-12 flex flex-wrap justify-center gap-6">
        <OverviewStatCard detail="available in queue" label="Active Tasks" lightMode={lightMode} value={String(count)} />
        <OverviewStatCard detail="next page candidate" label="Current Section" lightMode={lightMode} value={page} />
        <OverviewStatCard detail="stays in bottom dock" label="Navigation" lightMode={lightMode} value="Persistent" />
      </div>
    </section>
  );
}

function ThemeToggle({
  lightMode,
  theme,
  onThemeChange,
}: {
  lightMode: boolean;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}) {
  return (
    <div className={`inline-flex rounded-full p-1 ${lightMode ? "bg-[#f1ecff]" : "bg-white/10"}`}>
      {(["light", "dark"] as ThemeMode[]).map((mode) => (
        <button
          aria-label={`Switch to ${mode} mode`}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
            theme === mode
              ? lightMode
                ? "bg-white text-[#221d4e] shadow-sm"
                : "bg-[#c8baff] text-[#181127]"
              : lightMode
                ? "text-[#746d92]"
                : "text-white/55"
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
  );
}

function ProgressStat({
  lightMode,
  label,
  value,
}: {
  lightMode: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-full px-3 py-2 ${lightMode ? "bg-[#f6f2ff]" : "bg-white/10"}`}>
      <span className={`rounded-full px-3 py-1 text-sm font-bold ${lightMode ? "bg-[#6f57f6] text-white" : "bg-[#c8baff] text-[#191229]"}`}>
        {label}
      </span>
      <div>
        <p className={`text-sm font-semibold ${lightMode ? "text-[#26304c]" : "text-white"}`}>{value}</p>
        <div className={`mt-1 h-2 w-24 overflow-hidden rounded-full ${lightMode ? "bg-[#dfdaf3]" : "bg-white/10"}`}>
          <div className={`h-full w-[82%] rounded-full ${lightMode ? "bg-[#6f57f6]" : "bg-[#c8baff]"}`} />
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  lightMode,
  label,
  value,
}: {
  lightMode: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className={`rounded-full px-4 py-2 ${lightMode ? "bg-white shadow-[0_10px_30px_rgba(81,61,168,0.08)]" : "bg-white/10"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${lightMode ? "text-[#8a84a3]" : "text-white/40"}`}>{label}</p>
      <p className={`mt-1 text-lg font-bold ${lightMode ? "text-[#202743]" : "text-white"}`}>{value}</p>
    </div>
  );
}

function TaskHero({
  actionLabel,
  activeCount,
  lightMode,
  metric,
  onCycleMomentum,
  onOpenFocusPlanner,
  onOpenMomentumDetails,
  todayCount,
}: {
  actionLabel: string;
  activeCount: number;
  lightMode: boolean;
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
          <h1 className={`text-[clamp(2rem,4vw,3rem)] font-black tracking-tight ${lightMode ? "text-[#17203a]" : "text-white"}`}>
            Tasks
          </h1>
          <StatusBadge lightMode={lightMode} tone="success">Synced</StatusBadge>
        </div>
        <p className={`mt-1 max-w-2xl text-sm ${lightMode ? "text-[#727a95]" : "text-white/55"}`}>
          A cleaner task cockpit built for focus recovery, energy-aware planning, and visible momentum.
        </p>
      </div>
      <StatusBadge lightMode={lightMode} tone="warn">Overstimulated</StatusBadge>

      <button
        className={`mt-6 flex w-full max-w-md items-center justify-center rounded-[1.75rem] px-6 py-5 text-lg font-bold shadow-[0_18px_45px_rgba(116,92,255,0.22)] transition hover:-translate-y-0.5 ${
          lightMode
            ? "bg-[linear-gradient(90deg,#8f6df8_0%,#7359f5_100%)] text-white"
            : "bg-[linear-gradient(90deg,#b39dff_0%,#7d68f8_100%)] text-[#171127]"
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
              <p className={`text-xl font-bold ${lightMode ? "text-[#1e2642]" : "text-white"}`}>{metric.label}</p>
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${lightMode ? "bg-[#ffe3ea] text-[#f05566]" : "bg-[#472436] text-[#ff9aac]"}`}>
                {metric.percent}%
              </span>
            </div>
            <p className={`text-right text-sm font-bold sm:text-lg ${lightMode ? "text-[#58637f]" : "text-white/65"}`}>
              {metric.summary}
            </p>
          </div>
          <button
            className={`block h-4 w-full overflow-hidden rounded-full ${lightMode ? "bg-[#eceffa]" : "bg-white/8"}`}
            onPointerCancel={clearLongPress}
            onPointerDown={handleMomentumPressStart}
            onPointerLeave={clearLongPress}
            onPointerUp={handleMomentumPressEnd}
            type="button"
          >
            <div
              className={`h-full rounded-full ${lightMode ? "bg-[linear-gradient(90deg,#c5b4ff_0%,#7f6af7_100%)]" : "bg-[linear-gradient(90deg,#cabfff_0%,#8e79ff_100%)]"}`}
              style={{ width: `${Math.max(metric.percent, 10)}%` }}
            />
          </button>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <HeroMetaCard lightMode={lightMode} label="Today" value={todayCount} />
          <HeroMetaCard lightMode={lightMode} label="In Play" value={activeCount} />
          <HeroMetaCard lightMode={lightMode} label="Tracked" value={metric.totalCount} />
        </div>
      </div>

      <p className={`mt-4 text-center text-[11px] font-semibold uppercase tracking-[0.28em] ${lightMode ? "text-[#a2a7b8]" : "text-white/35"}`}>
        Tap to switch / Long press to see list
      </p>
    </section>
  );
}

function StatusBadge({
  children,
  lightMode,
  tone,
}: {
  children: React.ReactNode;
  lightMode: boolean;
  tone: "success" | "warn";
}) {
  const className = tone === "success"
    ? lightMode
      ? "bg-[#e7faf4] text-[#0e9b74]"
      : "bg-[#103c33] text-[#6ef0c4]"
    : lightMode
      ? "bg-[#fff1f3] text-[#f05566]"
      : "bg-[#44232f] text-[#ff9eaf]";

  return (
    <span className={`rounded-full px-4 py-2 text-sm font-bold ${className}`}>
      {children}
    </span>
  );
}

function HeroMetaCard({
  lightMode,
  label,
  value,
}: {
  lightMode: boolean;
  label: string;
  value: number;
}) {
  return (
    <div className={`rounded-[1.2rem] px-4 py-3 transition hover:-translate-y-0.5 ${lightMode ? "bg-white shadow-[0_10px_30px_rgba(81,61,168,0.08)]" : "bg-white/8"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${lightMode ? "text-[#8a84a3]" : "text-white/35"}`}>{label}</p>
      <p className={`mt-1 text-2xl font-bold ${lightMode ? "text-[#1f2846]" : "text-white"}`}>{value}</p>
    </div>
  );
}

function ControlBar({
  lightMode,
  onOpenComposer,
  onOpenImport,
  onSearchChange,
  onViewChange,
  search,
  view,
}: {
  lightMode: boolean;
  onOpenComposer: () => void;
  onOpenImport: () => void;
  onSearchChange: (search: string) => void;
  onViewChange: (view: TaskViewMode) => void;
  search: string;
  view: TaskViewMode;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <label className={`flex min-w-0 flex-1 items-center gap-3 rounded-[1.4rem] px-4 py-3 ${lightMode ? "bg-white shadow-[0_10px_28px_rgba(81,61,168,0.08)]" : "bg-white/8"}`}>
        <Search className={`h-5 w-5 shrink-0 ${lightMode ? "text-[#6f57f6]" : "text-[#c9bbff]"}`} />
        <input
          className={`min-w-0 flex-1 bg-transparent text-base outline-none ${lightMode ? "text-[#27304c] placeholder:text-[#97a0b9]" : "text-white placeholder:text-white/35"}`}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search tasks..."
          value={search}
        />
      </label>
      <label className={`flex items-center gap-3 rounded-[1.4rem] px-4 py-3 ${lightMode ? "bg-white shadow-[0_10px_28px_rgba(81,61,168,0.08)]" : "bg-white/8"}`}>
        <span className={`text-sm font-semibold ${lightMode ? "text-[#6b738f]" : "text-white/60"}`}>View</span>
        <select
          className={`bg-transparent text-base font-semibold outline-none ${lightMode ? "text-[#27304c]" : "text-white"}`}
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
        className={`rounded-full px-5 py-3 text-base font-semibold ${lightMode ? "bg-white text-[#27304c] shadow-[0_10px_28px_rgba(81,61,168,0.08)]" : "bg-white/8 text-white"}`}
        onClick={onOpenImport}
        type="button"
      >
        Import
      </button>
      <button
        className={`rounded-full px-6 py-3 text-base font-semibold ${
          lightMode
            ? "bg-[#6f57f6] text-white shadow-[0_14px_32px_rgba(111,87,246,0.24)]"
            : "bg-[#c9bbff] text-[#1a1431]"
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
  lightMode,
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
  lightMode: boolean;
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
        <FilterChip active={selectedQuickFilters.includes("active")} count={activeCount} lightMode={lightMode} onClick={() => onToggleQuickFilter("active")} tone="purple">Active</FilterChip>
        <FilterChip active={selectedQuickFilters.includes("today")} count={todayCount} lightMode={lightMode} onClick={() => onToggleQuickFilter("today")} tone="orange">Due Today</FilterChip>
        <FilterChip active={selectedQuickFilters.includes("urgent")} count={overdueCount} lightMode={lightMode} onClick={() => onToggleQuickFilter("urgent")} tone="red">Urgent</FilterChip>
        <FilterChip active={selectedQuickFilters.includes("focused")} count={focusedCount} lightMode={lightMode} onClick={() => onToggleQuickFilter("focused")} tone="purple">Focused</FilterChip>
        <FilterChip active={selectedQuickFilters.includes("done")} count={doneCount} lightMode={lightMode} onClick={() => onToggleQuickFilter("done")} tone="neutral">Done</FilterChip>
      </div>
      <div className="flex flex-wrap gap-3">
        <Pill lightMode={lightMode} onClick={onToggleMatchMode} selected>{matchAny ? "OR" : "AND"}</Pill>
        {energyOptions.map((energy) => (
          <Pill
            key={energy}
            lightMode={lightMode}
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
  lightMode,
  onClick,
  tone,
}: {
  active?: boolean;
  children: React.ReactNode;
  count: number;
  lightMode: boolean;
  onClick?: () => void;
  tone: FilterChipTone;
}) {
  const className = tone === "purple"
    ? lightMode
      ? "border-[#d7cbff] bg-[#f7f2ff] text-[#6f57f6]"
      : "border-[#5b4bad] bg-[#1c1734] text-[#c9bbff]"
    : tone === "orange"
      ? lightMode
        ? "border-[#ffd7bf] bg-[#fff6ef] text-[#f39a4d]"
        : "border-[#8c5631] bg-[#2f2016] text-[#ffc393]"
      : tone === "red"
        ? lightMode
          ? "border-[#ffc6d1] bg-[#fff4f6] text-[#f05566]"
          : "border-[#7b3646] bg-[#2e161f] text-[#ff9eaf]"
        : lightMode
          ? "border-[#e1e4ee] bg-white text-[#4b556e]"
          : "border-white/10 bg-white/6 text-white/75";

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
  lightMode,
  onClick,
  selected,
}: {
  children: React.ReactNode;
  lightMode: boolean;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <button
      className={`rounded-full px-4 py-2 text-base font-semibold ${
        selected
          ? lightMode
            ? "bg-[#f4efff] text-[#6f57f6] shadow-[0_10px_24px_rgba(81,61,168,0.08)]"
            : "bg-[#221a42] text-[#cabfff]"
          : lightMode
            ? "bg-white text-[#5c647d] shadow-[0_10px_24px_rgba(81,61,168,0.05)]"
            : "bg-white/8 text-white/70"
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
  lightMode,
  message,
  missingWidgetTypes,
  onAddTask,
  onAddWidget,
  onImportTasks,
  onMoveWidget,
  onRemoveWidget,
  onReorderWidget,
  onResizeWidget,
  onSelectWidget,
  onSetDraggedWidget,
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
  lightMode: boolean;
  message: Message | null;
  missingWidgetTypes: TaskGridWidgetType[];
  onAddTask: (task: TaskDraft) => Promise<void>;
  onAddWidget: (widgetType: TaskGridWidgetType) => void;
  onImportTasks: (lines: string[]) => Promise<void>;
  onMoveWidget: (widgetId: string, direction: "up" | "down") => void;
  onRemoveWidget: (widgetId: string) => void;
  onReorderWidget: (targetWidgetId: string) => void;
  onResizeWidget: (widgetId: string, nextWidth: number, nextHeight: number) => void;
  onSelectWidget: (widgetId: string | null) => void;
  onSetDraggedWidget: (widgetId: string | null) => void;
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

  return (
    <section className="mt-7 space-y-4">
      <div className={`rounded-[1.7rem] border p-4 ${lightMode ? "border-[#ece8f8] bg-white shadow-[0_16px_40px_rgba(81,61,168,0.07)]" : "border-white/10 bg-white/6"}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className={`text-xl font-black uppercase tracking-[0.08em] ${lightMode ? "text-[#28304a]" : "text-white"}`}>
              Grid View
            </h2>
            <p className={`mt-1 text-sm ${lightMode ? "text-[#78829c]" : "text-white/55"}`}>
              A modular tasks layout that keeps mobile in sync with desktop.
            </p>
          </div>
          <button
            className={`rounded-full px-5 py-3 text-sm font-semibold ${isEditMode
              ? lightMode
                ? "bg-[#6f57f6] text-white"
                : "bg-[#cabfff] text-[#1a1431]"
              : lightMode
                ? "bg-[#f3efff] text-[#6f57f6]"
                : "bg-[#22193f] text-[#cabfff]"}`}
            onClick={onToggleEditMode}
            type="button"
          >
            {isEditMode ? "Done Editing" : "Edit Layout"}
          </button>
        </div>

        {isEditMode ? (
          <div className="mt-4 space-y-3">
            <div className={`rounded-[1.25rem] px-4 py-3 text-sm ${lightMode ? "bg-[#faf7ff] text-[#6b738f]" : "bg-white/[0.04] text-white/65"}`}>
              Tap a widget to select it. Each widget also shows a visible delete button while editing. Drag to reorder on desktop, or use move controls anywhere. On mobile, width presets map to the current column count automatically.
            </div>

            <div className={`rounded-[1.25rem] border p-4 ${lightMode ? "border-[#e9e1ff] bg-[#fcfbff]" : "border-white/10 bg-white/[0.04]"}`}>
              <p className={`text-sm font-black uppercase tracking-[0.18em] ${lightMode ? "text-[#7a63f7]" : "text-[#c9bbff]"}`}>Add Widgets</p>
              <p className={`mt-1 text-sm ${lightMode ? "text-[#6b738f]" : "text-white/60"}`}>
                Turn sections on and off here. This list always shows every widget, whether it is currently on the grid or not.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {allWidgetTypes.map((widgetType) => {
                  const isPresent = presentWidgetTypes.has(widgetType);
                  const existingWidget = gridLayout.find((item) => item.type === widgetType) ?? null;

                  return (
                    <div
                      className={`flex items-center justify-between gap-3 rounded-[1rem] px-3 py-3 ${lightMode ? "bg-white shadow-[0_8px_20px_rgba(81,61,168,0.05)]" : "bg-white/[0.04]"}`}
                      key={widgetType}
                    >
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-semibold ${lightMode ? "text-[#27304c]" : "text-white"}`}>
                          {TASK_GRID_WIDGET_LABELS[widgetType]}
                        </p>
                        <p className={`mt-0.5 text-xs ${lightMode ? "text-[#8a93aa]" : "text-white/45"}`}>
                          {isPresent ? "On grid" : "Hidden"}
                        </p>
                      </div>
                      {isPresent && existingWidget ? (
                        <button
                          className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${lightMode ? "bg-[#fff1f3] text-[#f05566]" : "bg-[#44232f] text-[#ff9eaf]"}`}
                          onClick={() => onRemoveWidget(existingWidget.id)}
                          type="button"
                        >
                          Remove
                        </button>
                      ) : (
                        <button
                          className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${lightMode ? "bg-[#edf2ff] text-[#4a5fd3]" : "bg-[#182138] text-[#a7b8ff]"}`}
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
              <div className={`rounded-[1.3rem] border p-4 ${lightMode ? "border-[#e7ddff] bg-[#fcfbff]" : "border-white/10 bg-white/[0.04]"}`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className={`text-sm font-black uppercase tracking-[0.18em] ${lightMode ? "text-[#7a63f7]" : "text-[#c9bbff]"}`}>Selected Widget</p>
                    <p className={`mt-1 text-lg font-bold ${lightMode ? "text-[#27304c]" : "text-white"}`}>{TASK_GRID_WIDGET_LABELS[selectedWidget.type]}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${lightMode ? "bg-white text-[#5c647d] shadow-[0_8px_20px_rgba(81,61,168,0.06)]" : "bg-white/8 text-white/75"}`}
                      onClick={() => onMoveWidget(selectedWidget.id, "up")}
                      type="button"
                    >
                      Move Up
                    </button>
                    <button
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${lightMode ? "bg-white text-[#5c647d] shadow-[0_8px_20px_rgba(81,61,168,0.06)]" : "bg-white/8 text-white/75"}`}
                      onClick={() => onMoveWidget(selectedWidget.id, "down")}
                      type="button"
                    >
                      Move Down
                    </button>
                    <button
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${lightMode ? "bg-[#fff1f3] text-[#f05566]" : "bg-[#44232f] text-[#ff9eaf]"}`}
                      onClick={() => onRemoveWidget(selectedWidget.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    {widthPresets.map((preset) => (
                      <button
                        className={`rounded-full px-4 py-2 text-sm font-semibold ${Math.min(selectedWidget.w, currentColumns) === preset.width
                          ? lightMode
                            ? "bg-[#6f57f6] text-white"
                            : "bg-[#cabfff] text-[#1a1431]"
                          : lightMode
                            ? "bg-white text-[#5c647d] shadow-[0_8px_20px_rgba(81,61,168,0.06)]"
                            : "bg-white/8 text-white/75"}`}
                        key={preset.label}
                        onClick={() => onResizeWidget(selectedWidget.id, preset.width, selectedWidget.h)}
                        type="button"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {heightPresets.map((preset) => (
                      <button
                        className={`rounded-full px-4 py-2 text-sm font-semibold ${selectedWidget.h === preset.height
                          ? lightMode
                            ? "bg-[#6f57f6] text-white"
                            : "bg-[#cabfff] text-[#1a1431]"
                          : lightMode
                            ? "bg-white text-[#5c647d] shadow-[0_8px_20px_rgba(81,61,168,0.06)]"
                            : "bg-white/8 text-white/75"}`}
                        key={preset.label}
                        onClick={() => onResizeWidget(selectedWidget.id, selectedWidget.w, preset.height)}
                        type="button"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className={`rounded-[1.25rem] border border-dashed px-4 py-4 text-sm ${lightMode ? "border-[#ddd6f9] bg-[#faf8ff] text-[#7b84a0]" : "border-white/10 bg-white/[0.03] text-white/55"}`}>
                Tap any widget card below to resize it, move it, or remove it.
              </div>
            )}
          </div>
        ) : null}
      </div>

      {gridLayout.length === 0 ? (
        <div className={`rounded-[1.8rem] border border-dashed p-8 text-center ${lightMode ? "border-[#dcd2ff] bg-[#faf8ff] text-[#6b738f]" : "border-white/10 bg-white/[0.03] text-white/65"}`}>
          <p className="text-lg font-bold">Your grid is empty.</p>
          <p className="mt-2 text-sm">Turn on edit mode and add widgets back in any order you want.</p>
        </div>
      ) : null}

      <div
        className="grid gap-4 md:gap-5"
        style={{
          gridAutoRows: `minmax(${TASK_GRID_ROW_HEIGHT}px, auto)`,
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
            lightMode={lightMode}
            onDrop={() => onReorderWidget(item.id)}
            onDragStart={() => onSetDraggedWidget(item.id)}
            onDragEnd={() => onSetDraggedWidget(null)}
            onRemove={() => onRemoveWidget(item.id)}
            onSelect={() => onSelectWidget(item.id)}
            selected={selectedWidget?.id === item.id}
          >
            {item.type === "urgent" ? (
              <UrgentTasksPanel
                focusedTaskIds={focusedTaskIds}
                lightMode={lightMode}
                onToggle={onToggleTask}
                tasks={tasksByWidget.urgent}
              />
            ) : item.type === "focus_today" ? (
              <TaskLane
                count={tasksByWidget.focusToday.length}
                defaultExpanded
                lightMode={lightMode}
                tasks={tasksByWidget.focusToday}
                title="Focus Today"
                tone="purple"
              />
            ) : item.type === "due_today" ? (
              <TaskLane
                count={tasksByWidget.dueToday.length}
                lightMode={lightMode}
                tasks={tasksByWidget.dueToday}
                title="Due Today"
                tone="purple"
              />
            ) : item.type === "active_queue" ? (
              <TaskLane
                count={tasksByWidget.activeQueue.length}
                lightMode={lightMode}
                tasks={tasksByWidget.activeQueue}
                title="Active Queue"
                tone="soft"
              />
            ) : item.type === "completed" ? (
              <TaskLane
                count={tasksByWidget.completed.length}
                lightMode={lightMode}
                tasks={tasksByWidget.completed}
                title="Completed"
                tone="soft"
              />
            ) : item.type === "quick_capture" ? (
              <div id="task-composer-card">
                <TaskComposerCard lightMode={lightMode} onAdd={onAddTask} />
              </div>
            ) : item.type === "import" ? (
              <div id="task-import-panel">
                <ImportWidgetCard lightMode={lightMode} message={message} onImport={onImportTasks} />
              </div>
            ) : (
              <FocusStatsCard
                activeCount={activeCount}
                doneCount={doneCount}
                lightMode={lightMode}
                overdueCount={overdueCount}
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
  isEditMode,
  item,
  lightMode,
  onDragEnd,
  onDragStart,
  onDrop,
  onRemove,
  onSelect,
  selected,
}: {
  children: React.ReactNode;
  currentColumns: number;
  draggedWidgetId: string | null;
  isEditMode: boolean;
  item: TaskGridItem;
  lightMode: boolean;
  onDragEnd: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onRemove: () => void;
  onSelect: () => void;
  selected: boolean;
}) {
  const widthSpan = Math.max(1, Math.min(item.w, currentColumns));

  return (
    <div
      className={`relative min-w-0 ${isEditMode ? "cursor-grab" : ""} ${draggedWidgetId === item.id ? "opacity-60" : ""}`}
      draggable={isEditMode}
      onClick={() => {
        if (isEditMode) {
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
          ? lightMode
            ? "border-[#6f57f6] shadow-[0_0_0_4px_rgba(111,87,246,0.16)]"
            : "border-[#cabfff] shadow-[0_0_0_4px_rgba(202,191,255,0.12)]"
          : lightMode
            ? "border-[#dcd2ff]"
            : "border-white/15"}`} />
      ) : null}
      {isEditMode ? (
        <div className={`absolute left-4 top-4 z-20 rounded-full px-3 py-1 text-xs font-semibold ${lightMode ? "bg-white text-[#6f57f6] shadow-[0_10px_24px_rgba(81,61,168,0.12)]" : "bg-[#171328] text-[#cabfff]"}`}>
          <GripVertical className="mr-1 inline h-3.5 w-3.5" />
          {TASK_GRID_WIDGET_LABELS[item.type]}
        </div>
      ) : null}
      {isEditMode ? (
        <button
          aria-label={`Remove ${TASK_GRID_WIDGET_LABELS[item.type]}`}
          className={`absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full ${lightMode ? "bg-[#fff1f3] text-[#f05566] shadow-[0_10px_24px_rgba(240,85,102,0.12)]" : "bg-[#44232f] text-[#ff9eaf]"}`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          type="button"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
      <div className={`h-full min-h-0 ${isEditMode ? "pointer-events-none" : ""}`}>{children}</div>
    </div>
  );
}

function UrgentTasksPanel({
  focusedTaskIds,
  lightMode,
  tasks,
  onToggle,
}: {
  focusedTaskIds: string[];
  lightMode: boolean;
  tasks: Task[];
  onToggle: (task: Task) => void;
}) {
  const DEFAULT_VISIBLE_COUNT = 4;
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleTasks = isExpanded ? tasks : tasks.slice(0, DEFAULT_VISIBLE_COUNT);
  const hiddenCount = Math.max(0, tasks.length - visibleTasks.length);

  return (
    <section className={`w-full overflow-hidden rounded-[2rem] border p-5 transition hover:-translate-y-0.5 ${lightMode ? "border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)]" : "border-white/10 bg-white/6"}`}>
      <div className="flex min-w-0 items-center justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${lightMode ? "bg-[#f05566]" : "bg-[#ff9eaf]"}`} />
          <h2 className={`text-2xl font-black uppercase tracking-[0.08em] ${lightMode ? "text-[#28304a]" : "text-white"}`}>
            Urgent Tasks
          </h2>
        </div>
        <span className={`text-2xl font-bold ${lightMode ? "text-[#939ab0]" : "text-white/45"}`}>
          {tasks.length}
        </span>
      </div>

      <div className="mt-5 space-y-5">
        {tasks.length === 0 ? (
          <EmptyTaskState lightMode={lightMode} text="No urgent tasks match the current filters." />
        ) : null}
        {visibleTasks.map((task, index) => (
          <article
            className={`w-full overflow-hidden rounded-[1.4rem] border p-4 transition ${lightMode ? "border-[#ede8fb] bg-[#fcfbff]" : "border-white/10 bg-white/[0.04]"}`}
            key={task.id}
          >
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`h-4 w-4 shrink-0 rounded-full ${index < 2 ? "bg-[#f05566]" : "bg-[#12b886]"}`} />
                  <h3 className={`min-w-0 truncate text-[1.55rem] font-semibold ${lightMode ? "text-[#202844]" : "text-white"}`}>
                    {task.title}
                  </h3>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {focusedTaskIds.includes(task.id) ? <TaskMetaChip lightMode={lightMode} tone="purple">Focus Today</TaskMetaChip> : null}
                  <TaskMetaChip lightMode={lightMode} tone="neutral">{task.priority} priority</TaskMetaChip>
                  <TaskMetaChip lightMode={lightMode} tone="green">{task.energy}</TaskMetaChip>
                  <TaskMetaChip lightMode={lightMode} tone="neutral">{formatDueLabel(task.due_on)}</TaskMetaChip>
                </div>
              </div>
              <button
                className={`w-full rounded-full px-4 py-2 text-sm font-semibold sm:w-auto sm:shrink-0 ${lightMode ? "bg-[#6f57f6] text-white" : "bg-[#cabfff] text-[#1a1431]"}`}
                onClick={() => onToggle(task)}
                type="button"
              >
                Done
              </button>
            </div>

            <ul className="mt-5 space-y-2">
              {taskChecklist(task.title).map((item, itemIndex) => (
                <li className="flex items-center gap-3" key={`${task.id}-${itemIndex}`}>
                  <span className={`h-3 w-3 rounded-full ${item.done ? "bg-[#18c58f]" : "bg-[#f05566]"}`} />
                  <span className={`${item.done ? "line-through opacity-50" : ""} ${lightMode ? "text-[#525d78]" : "text-white/72"}`}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
        {tasks.length > DEFAULT_VISIBLE_COUNT ? (
          <button
            className={`flex w-full items-center justify-center gap-2 rounded-[1.1rem] border px-4 py-3 text-sm font-semibold ${lightMode ? "border-[#e6defb] bg-[#faf7ff] text-[#6f57f6]" : "border-white/10 bg-white/[0.04] text-[#cabfff]"}`}
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
  lightMode,
  tone,
}: {
  children: React.ReactNode;
  lightMode: boolean;
  tone: "blue" | "purple" | "green" | "neutral";
}) {
  const className = tone === "blue"
    ? lightMode
      ? "bg-[#edf6ff] text-[#3f8bdc]"
      : "bg-[#162434] text-[#8bc4ff]"
    : tone === "purple"
      ? lightMode
        ? "bg-[#f2edff] text-[#7a63f7]"
        : "bg-[#22193f] text-[#c7b9ff]"
      : tone === "green"
        ? lightMode
          ? "bg-[#e8fbf2] text-[#0fa774]"
          : "bg-[#14362c] text-[#7de4b8]"
        : lightMode
          ? "bg-[#f4f5f8] text-[#68738c]"
          : "bg-white/8 text-white/60";

  return (
    <span className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${className}`}>
      {children}
    </span>
  );
}

function TaskComposerCard({
  lightMode,
  onAdd,
}: {
  lightMode: boolean;
  onAdd: (task: TaskDraft) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [energy, setEnergy] = useState<TaskEnergy>("medium");
  const [dueOn, setDueOn] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <section className={`rounded-[2rem] border p-5 transition hover:-translate-y-0.5 ${lightMode ? "border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)]" : "border-white/10 bg-white/6"}`}>
      <div className="mb-4">
        <h2 className={`text-2xl font-black uppercase tracking-[0.08em] ${lightMode ? "text-[#28304a]" : "text-white"}`}>
          Quick Capture
        </h2>
        <p className={`mt-2 text-sm ${lightMode ? "text-[#78829c]" : "text-white/55"}`}>
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
            className={`h-14 w-full rounded-[1.25rem] px-4 text-lg outline-none ${lightMode ? "bg-[#f7f5ff] text-[#1f2642] placeholder:text-[#9b9fba]" : "bg-white/8 text-white placeholder:text-white/30"}`}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Drink water, clear email, write first paragraph..."
            value={title}
          />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <Select lightMode={lightMode} label="Priority" onChange={setPriority} options={priorityOptions} value={priority} />
          <Select lightMode={lightMode} label="Energy" onChange={setEnergy} options={energyOptions} value={energy} />
        </div>
        <label className="block">
          <span className="sr-only">Due date</span>
          <input
            className={`h-14 w-full rounded-[1.25rem] px-4 text-lg outline-none ${lightMode ? "bg-[#f7f5ff] text-[#1f2642]" : "bg-white/8 text-white"}`}
            onChange={(event) => setDueOn(event.target.value)}
            type="date"
            value={dueOn}
          />
        </label>
        <button
          className={`w-full rounded-[1.25rem] px-5 py-4 text-lg font-bold ${lightMode ? "bg-[#6f57f6] text-white shadow-[0_14px_32px_rgba(111,87,246,0.24)]" : "bg-[#cabfff] text-[#1a1431]"}`}
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
  lightMode,
  lowEnergyTasks,
  message,
  onImport,
}: {
  doneCount: number;
  lightMode: boolean;
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
      <section className={`rounded-[2rem] border p-5 transition hover:-translate-y-0.5 ${lightMode ? "border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)]" : "border-white/10 bg-white/6"}`}>
        <h2 className={`text-2xl font-black uppercase tracking-[0.08em] ${lightMode ? "text-[#28304a]" : "text-white"}`}>
          Low Energy Wins
        </h2>
        <div className="mt-4 space-y-3">
          {lowEnergyTasks.length === 0 ? (
            <EmptyTaskState lightMode={lightMode} text="No low-energy tasks match the current filters." />
          ) : null}
          {lowEnergyTasks.map((task) => (
            <div className={`rounded-[1.25rem] px-4 py-3 ${lightMode ? "bg-[#f8f5ff]" : "bg-white/8"}`} key={task.id}>
              <p className={`text-base font-semibold ${lightMode ? "text-[#26304c]" : "text-white"}`}>{task.title}</p>
              <p className={`mt-1 text-sm ${lightMode ? "text-[#7d88a1]" : "text-white/55"}`}>{formatDueLabel(task.due_on)} / low effort</p>
            </div>
          ))}
        </div>
      </section>

      <section className={`rounded-[2rem] border p-5 transition hover:-translate-y-0.5 ${lightMode ? "border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)]" : "border-white/10 bg-white/6"}`}>
        <h2 className={`text-2xl font-black uppercase tracking-[0.08em] ${lightMode ? "text-[#28304a]" : "text-white"}`}>
          Import List
        </h2>
        <p className={`mt-2 text-sm ${lightMode ? "text-[#78829c]" : "text-white/55"}`}>
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
            className={`min-h-36 w-full resize-y rounded-[1.25rem] px-4 py-4 text-base outline-none ${lightMode ? "bg-[#f7f5ff] text-[#1f2642] placeholder:text-[#9b9fba]" : "bg-white/8 text-white placeholder:text-white/30"}`}
            onChange={(event) => setText(event.target.value)}
            placeholder={"Call dentist\nDrink water\nChoose dinner"}
            value={text}
          />
          <button
            className={`w-full rounded-[1.25rem] px-5 py-4 text-lg font-bold ${lightMode ? "bg-[#ede8ff] text-[#6f57f6]" : "bg-[#22193f] text-[#cabfff]"}`}
            disabled={lines.length === 0 || isSubmitting}
            type="submit"
          >
            Import {lines.length || ""}
          </button>
        </form>

        <p className={`mt-3 text-sm ${lightMode ? "text-[#8c94ac]" : "text-white/45"}`}>
          {message?.text}
        </p>
      </section>

      <section className={`rounded-[2rem] border p-5 transition hover:-translate-y-0.5 ${lightMode ? "border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)]" : "border-white/10 bg-white/6"}`}>
        <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${lightMode ? "text-[#8d87a7]" : "text-white/35"}`}>Completed</p>
        <p className={`mt-2 text-4xl font-black ${lightMode ? "text-[#1f2746]" : "text-white"}`}>{doneCount}</p>
      </section>
    </div>
  );
}

function ImportWidgetCard({
  lightMode,
  message,
  onImport,
}: {
  lightMode: boolean;
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
    <section className={`rounded-[2rem] border p-5 transition hover:-translate-y-0.5 ${lightMode ? "border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)]" : "border-white/10 bg-white/6"}`}>
      <h2 className={`text-2xl font-black uppercase tracking-[0.08em] ${lightMode ? "text-[#28304a]" : "text-white"}`}>
        Import List
      </h2>
      <p className={`mt-2 text-sm ${lightMode ? "text-[#78829c]" : "text-white/55"}`}>
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
          className={`min-h-40 w-full resize-y rounded-[1.25rem] px-4 py-4 text-base outline-none ${lightMode ? "bg-[#f7f5ff] text-[#1f2642] placeholder:text-[#9b9fba]" : "bg-white/8 text-white placeholder:text-white/30"}`}
          onChange={(event) => setText(event.target.value)}
          placeholder={"Call dentist\nDrink water\nChoose dinner"}
          value={text}
        />
        <button
          className={`w-full rounded-[1.25rem] px-5 py-4 text-lg font-bold ${lightMode ? "bg-[#ede8ff] text-[#6f57f6]" : "bg-[#22193f] text-[#cabfff]"}`}
          disabled={lines.length === 0 || isSubmitting}
          type="submit"
        >
          Import {lines.length || ""}
        </button>
      </form>

      <p className={`mt-3 text-sm ${lightMode ? "text-[#8c94ac]" : "text-white/45"}`}>
        {message?.text}
      </p>
    </section>
  );
}

function TaskLane({
  count,
  defaultExpanded = false,
  lightMode,
  title,
  tasks,
  tone,
}: {
  count: number;
  defaultExpanded?: boolean;
  lightMode: boolean;
  title: string;
  tasks: Task[];
  tone: "purple" | "soft";
}) {
  const DEFAULT_VISIBLE_COUNT = 3;
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const visibleTasks = isExpanded ? tasks : tasks.slice(0, DEFAULT_VISIBLE_COUNT);
  const hiddenCount = Math.max(0, tasks.length - visibleTasks.length);

  return (
    <section className={`w-full overflow-hidden rounded-[2rem] border p-5 transition hover:-translate-y-0.5 ${lightMode ? "border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)]" : "border-white/10 bg-white/6"}`}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className={`text-2xl font-black uppercase tracking-[0.08em] ${lightMode ? "text-[#28304a]" : "text-white"}`}>
          {title}
        </h2>
        <div className="flex items-center gap-2">
          <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${tone === "purple"
            ? lightMode ? "bg-[#f2edff] text-[#725af6]" : "bg-[#22193f] text-[#cabfff]"
            : lightMode ? "bg-[#f6f7fb] text-[#6a738d]" : "bg-white/8 text-white/65"}`}>
            {count}
          </span>
          {tasks.length > DEFAULT_VISIBLE_COUNT ? (
            <button
              aria-label={isExpanded ? `Collapse ${title}` : `Expand ${title}`}
              className={`flex h-9 w-9 items-center justify-center rounded-full ${lightMode ? "bg-[#f6f2ff] text-[#6f57f6]" : "bg-white/8 text-[#cabfff]"}`}
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
          <EmptyTaskState lightMode={lightMode} text={`No tasks in ${title.toLowerCase()} right now.`} />
        ) : null}
        {visibleTasks.map((task, index) => (
          <div className={`w-full overflow-hidden rounded-[1.25rem] border px-4 py-3 ${lightMode ? "border-[#efeaf9] bg-[#fdfcff]" : "border-white/10 bg-white/[0.04]"}`} key={task.id}>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className={`truncate text-lg font-semibold ${lightMode ? "text-[#27304c]" : "text-white"}`}>{task.title}</p>
                <p className={`mt-1 text-sm ${lightMode ? "text-[#7d88a1]" : "text-white/55"}`}>
                  {formatDueLabel(task.due_on)} / {task.energy} energy / {task.priority} priority
                </p>
              </div>
              <span className={`self-start rounded-full px-3 py-1 text-xs font-semibold sm:shrink-0 ${index % 2 === 0
                ? lightMode ? "bg-[#ede8ff] text-[#6f57f6]" : "bg-[#22193f] text-[#cabfff]"
                : lightMode ? "bg-[#eef9f4] text-[#12a876]" : "bg-[#17362d] text-[#7de4b8]"}`}>
                {index % 2 === 0 ? "Visible" : "Queued"}
              </span>
            </div>
          </div>
        ))}
        {tasks.length > DEFAULT_VISIBLE_COUNT ? (
          <button
            className={`w-full rounded-[1rem] border px-4 py-3 text-sm font-semibold ${lightMode ? "border-[#e6defb] bg-[#faf7ff] text-[#6f57f6]" : "border-white/10 bg-white/[0.04] text-[#cabfff]"}`}
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
  lightMode,
  overdueCount,
}: {
  activeCount: number;
  doneCount: number;
  lightMode: boolean;
  overdueCount: number;
}) {
  const stats = [
    { label: "Active", value: activeCount },
    { label: "Completed", value: doneCount },
    { label: "Overdue", value: overdueCount },
  ];

  return (
    <section className={`w-full overflow-hidden rounded-[2rem] border p-5 flex flex-col items-center text-center transition hover:-translate-y-0.5 ${lightMode ? "border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)]" : "border-white/10 bg-white/6"}`}>
      <h2 className={`text-2xl font-black uppercase tracking-[0.08em] ${lightMode ? "text-[#28304a]" : "text-white"}`}>
        Focus Stats
      </h2>
      <div className="mt-4 w-full space-y-3">
        {stats.map((stat, index) => (
          <div className={`rounded-[1.25rem] p-4 flex flex-col items-center ${lightMode ? "bg-[#f8f5ff]" : "bg-white/8"}`} key={stat.label}>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${lightMode ? "text-[#8d87a7]" : "text-white/35"}`}>{stat.label}</p>
            <p className={`mt-2 text-3xl font-black ${lightMode ? "text-[#1f2746]" : "text-white"}`}>{stat.value}</p>
            <div className={`mt-2 h-1.5 w-full max-w-[120px] overflow-hidden rounded-full ${lightMode ? "bg-[#ded7f7]" : "bg-white/10"}`}>
              <div className={`h-full rounded-full ${index === 2
                ? lightMode ? "bg-[#f05566]" : "bg-[#ff9eaf]"
                : lightMode ? "bg-[#6f57f6]" : "bg-[#cabfff]"}`}
                style={{ width: `${Math.min(100, 28 + stat.value * 4)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyTaskState({
  lightMode,
  text,
}: {
  lightMode: boolean;
  text: string;
}) {
  return (
    <div className={`rounded-[1.25rem] border border-dashed px-4 py-5 text-sm ${lightMode ? "border-[#ddd6f9] bg-[#faf8ff] text-[#7b84a0]" : "border-white/10 bg-white/[0.03] text-white/55"}`}>
      {text}
    </div>
  );
}

function TaskCardGallery({
  focusedTaskIds,
  lightMode,
  onToggle,
  tasks,
}: {
  focusedTaskIds: string[];
  lightMode: boolean;
  onToggle: (task: Task) => void;
  tasks: Task[];
}) {
  return (
    <section className="mt-7">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tasks.length === 0 ? <EmptyTaskState lightMode={lightMode} text="No tasks match the current filters." /> : null}
        {tasks.map((task) => (
          <article
            className={`w-full overflow-hidden rounded-[1.7rem] border p-5 ${lightMode ? "border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)]" : "border-white/10 bg-white/6"}`}
            key={task.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className={`text-xl font-bold ${lightMode ? "text-[#1f2746]" : "text-white"}`}>{task.title}</h3>
                <p className={`mt-2 text-sm ${lightMode ? "text-[#77829f]" : "text-white/55"}`}>
                  {formatDueLabel(task.due_on)} · {task.energy} energy
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${lightMode ? "bg-[#f2edff] text-[#725af6]" : "bg-[#22193f] text-[#cabfff]"}`}>
                {task.priority}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {focusedTaskIds.includes(task.id) ? <TaskMetaChip lightMode={lightMode} tone="purple">Focus Today</TaskMetaChip> : null}
              <TaskMetaChip lightMode={lightMode} tone={task.energy === "high" ? "blue" : task.energy === "medium" ? "neutral" : "green"}>
                {task.energy}
              </TaskMetaChip>
            </div>
            <button
              className={`mt-5 w-full rounded-[1rem] px-4 py-3 text-sm font-bold ${lightMode ? "bg-[#6f57f6] text-white" : "bg-[#cabfff] text-[#1a1431]"}`}
              onClick={() => onToggle(task)}
              type="button"
            >
              {task.status === "done" ? "Completed" : "Mark Done"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function TaskMatrixView({
  lightMode,
  onToggle,
  tasks,
}: {
  lightMode: boolean;
  onToggle: (task: Task) => void;
  tasks: Task[];
}) {
  const cells = [
    {
      key: "urgent-high",
      title: "Urgent + Higher Energy",
      tasks: tasks.filter((task) => (isOverdue(task.due_on) || task.priority === "high") && task.energy !== "low"),
    },
    {
      key: "urgent-low",
      title: "Urgent + Low Energy",
      tasks: tasks.filter((task) => (isOverdue(task.due_on) || task.priority === "high") && task.energy === "low"),
    },
    {
      key: "later-high",
      title: "Later + Higher Energy",
      tasks: tasks.filter((task) => !(isOverdue(task.due_on) || task.priority === "high") && task.energy !== "low"),
    },
    {
      key: "later-low",
      title: "Later + Low Energy",
      tasks: tasks.filter((task) => !(isOverdue(task.due_on) || task.priority === "high") && task.energy === "low"),
    },
  ];

  return (
    <section className="mt-7 grid gap-4 lg:grid-cols-2">
      {cells.map((cell) => (
        <div className={`rounded-[2rem] border p-5 ${lightMode ? "border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)]" : "border-white/10 bg-white/6"}`} key={cell.key}>
          <div className="flex items-center justify-between gap-3">
            <h2 className={`text-xl font-black ${lightMode ? "text-[#28304a]" : "text-white"}`}>{cell.title}</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${lightMode ? "bg-[#f2edff] text-[#725af6]" : "bg-[#22193f] text-[#cabfff]"}`}>
              {cell.tasks.length}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {cell.tasks.length === 0 ? <EmptyTaskState lightMode={lightMode} text="No tasks in this bucket." /> : null}
            {cell.tasks.map((task) => (
              <button
                className={`flex w-full items-center justify-between rounded-[1.2rem] border px-4 py-3 text-left ${lightMode ? "border-[#efeaf9] bg-[#fdfcff]" : "border-white/10 bg-white/[0.04]"}`}
                key={task.id}
                onClick={() => onToggle(task)}
                type="button"
              >
                <div className="min-w-0">
                  <p className={`truncate text-base font-semibold ${lightMode ? "text-[#27304c]" : "text-white"}`}>{task.title}</p>
                  <p className={`mt-1 text-xs ${lightMode ? "text-[#7d88a1]" : "text-white/55"}`}>{formatDueLabel(task.due_on)} · {task.energy}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${lightMode ? "bg-[#ede8ff] text-[#6f57f6]" : "bg-[#22193f] text-[#cabfff]"}`}>
                  Done
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function FocusPlannerModal({
  draftIds,
  lightMode,
  onClose,
  onFinish,
  onSetDraftIds,
  onStepChange,
  step,
  tasks,
}: {
  draftIds: string[];
  lightMode: boolean;
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
      ? isDueToday(task.due_on) || task.priority === "high"
      : step === 1
        ? isOverdue(task.due_on) || task.energy === "high"
        : true;
    return matchesSearch && matchesStep;
  });

  return (
    <ModalShell className={`w-full max-w-[42rem] rounded-[2rem] border p-5 ${lightMode ? "border-[#ece8f8] bg-white shadow-[0_30px_80px_rgba(81,61,168,0.18)]" : "border-white/10 bg-[#171328]"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className={`text-sm font-black uppercase tracking-[0.18em] ${lightMode ? "text-[#7b63f7]" : "text-[#c9bbff]"}`}>Step {step + 1} of 3</p>
        <button className={`text-2xl ${lightMode ? "text-[#8e97af]" : "text-white/55"}`} onClick={onClose} type="button">×</button>
      </div>
      <h2 className={`mt-4 text-3xl font-black ${lightMode ? "text-[#1f2746]" : "text-white"}`}>{prompts[step]}</h2>
      <label className={`mt-5 flex items-center gap-3 rounded-[1.3rem] px-4 py-3 ${lightMode ? "bg-[#faf8ff]" : "bg-white/8"}`}>
        <Search className={`h-5 w-5 ${lightMode ? "text-[#7b63f7]" : "text-[#c9bbff]"}`} />
        <input
          className={`w-full bg-transparent outline-none ${lightMode ? "text-[#24304b] placeholder:text-[#9aa2bb]" : "text-white placeholder:text-white/35"}`}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search tasks..."
          value={search}
        />
      </label>
      <div className={`mt-4 max-h-[24rem] overflow-y-auto rounded-[1.5rem] border ${lightMode ? "border-[#ece8f8] bg-[#fcfbff]" : "border-white/10 bg-white/[0.03]"}`}>
        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyTaskState lightMode={lightMode} text="No tasks match this step yet." />
          </div>
        ) : null}
        {filtered.map((task) => {
          const checked = draftIds.includes(task.id);
          return (
            <label className={`flex cursor-pointer items-center gap-3 border-b px-4 py-4 last:border-b-0 ${lightMode ? "border-[#ece8f8]" : "border-white/10"}`} key={task.id}>
              <input
                checked={checked}
                className="h-5 w-5 rounded"
                onChange={() => onSetDraftIds(checked ? draftIds.filter((id) => id !== task.id) : [...draftIds, task.id])}
                type="checkbox"
              />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-lg font-semibold ${lightMode ? "text-[#24304b]" : "text-white"}`}>{task.title}</p>
                <p className={`mt-1 text-sm ${lightMode ? "text-[#7b84a0]" : "text-white/55"}`}>{formatDueLabel(task.due_on)} · {task.energy} energy · {task.priority} priority</p>
              </div>
            </label>
          );
        })}
      </div>
      <button
        className={`mt-5 w-full rounded-[1.25rem] px-5 py-4 text-lg font-bold ${lightMode ? "bg-[#6f57f6] text-white" : "bg-[#cabfff] text-[#1a1431]"}`}
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
  lightMode,
  onClose,
  remainingTasks,
  title,
}: {
  doneTasks: Task[];
  lightMode: boolean;
  onClose: () => void;
  remainingTasks: Task[];
  title: string;
}) {
  return (
    <ModalShell className={`w-full max-w-[42rem] rounded-[2rem] border p-5 ${lightMode ? "border-[#ece8f8] bg-white shadow-[0_30px_80px_rgba(81,61,168,0.18)]" : "border-white/10 bg-[#171328]"}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className={`text-2xl font-black ${lightMode ? "text-[#1f2746]" : "text-white"}`}>{title}</h2>
        <button className={`text-2xl ${lightMode ? "text-[#8e97af]" : "text-white/55"}`} onClick={onClose} type="button">×</button>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <section>
          <p className={`text-sm font-black uppercase tracking-[0.18em] ${lightMode ? "text-[#0e9b74]" : "text-[#6ef0c4]"}`}>Finished</p>
          <div className="mt-3 space-y-2">
            {doneTasks.length === 0 ? <EmptyTaskState lightMode={lightMode} text="Nothing finished in this group yet." /> : null}
            {doneTasks.map((task) => (
              <div className={`rounded-[1rem] px-4 py-3 ${lightMode ? "bg-[#edf9f4] text-[#23423a]" : "bg-[#103c33] text-[#d7fff2]"}`} key={task.id}>
                {task.title}
              </div>
            ))}
          </div>
        </section>
        <section>
          <p className={`text-sm font-black uppercase tracking-[0.18em] ${lightMode ? "text-[#f05566]" : "text-[#ff9eaf]"}`}>Remaining</p>
          <div className="mt-3 space-y-2">
            {remainingTasks.length === 0 ? <EmptyTaskState lightMode={lightMode} text="Everything in this group is finished." /> : null}
            {remainingTasks.map((task) => (
              <div className={`rounded-[1rem] px-4 py-3 ${lightMode ? "bg-[#fff4f6] text-[#7c3042]" : "bg-[#44232f] text-[#ffd5dc]"}`} key={task.id}>
                {task.title}
              </div>
            ))}
          </div>
        </section>
      </div>
    </ModalShell>
  );
}

function BottomDock({
  activePage,
  lightMode,
  onNavigate,
}: {
  activePage: AppPage;
  lightMode: boolean;
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
          className={`flex h-16 w-16 items-center justify-center rounded-full border shadow-[0_16px_36px_rgba(60,44,140,0.22)] transition-all duration-300 ${isDragReady ? "scale-110 ring-4 ring-[#6f57f6]/40" : "hover:scale-105"} ${isBubbleWhooshing ? "duration-500 ease-out" : ""} ${lightMode ? "border-[#ece8f8] bg-white/95 text-[#6f57f6]" : "border-white/10 bg-[#171328]/95 text-[#cabfff]"}`}
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
    ? "fixed inset-x-0 bottom-5 z-10 px-4"
    : dockPlacement === "left"
      ? "fixed left-4 top-4 bottom-4 z-10 flex items-center"
      : "fixed right-4 top-4 bottom-4 z-10 flex items-center";
  const dockShapeClass = dockPlacement === "bottom"
    ? "mx-auto flex w-full max-w-[58rem] items-center justify-between gap-1 rounded-[2rem] px-3 py-1 overflow-x-auto sm:overflow-x-visible [&::-webkit-scrollbar]:hidden touch-pan-x"
    : "flex max-h-full w-[5rem] flex-col items-center gap-1 overflow-y-auto rounded-[2rem] px-2 py-3";
  const collapsingStyle = isDockCollapsing
    ? dockPlacement === "bottom"
      ? { maxWidth: "4rem", width: "4rem", height: "4rem", borderRadius: "9999px", padding: "0" }
      : { width: "4rem", height: "4rem", borderRadius: "9999px", padding: "0" }
    : undefined;

  return (
    <div className={`${dockPositionClass} select-none`} style={{ userSelect: "none", WebkitUserSelect: "none" }}>
      <div
        className={`relative ${isDockCollapsing ? "overflow-hidden" : "overflow-visible"} border shadow-[0_25px_45px_rgba(60,44,140,0.18)] transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${dockShapeClass} ${lightMode ? "border-[#ece8f8] bg-white/92 backdrop-blur" : "border-white/10 bg-[#171328]/92 backdrop-blur"}`}
        style={collapsingStyle}
      >
        {dockItems.map((item) => (
          <button
            className={`flex ${isVertical ? "w-full" : "min-w-[3rem] shrink-0"} flex-col items-center justify-center rounded-[1.2rem] px-2 py-1.5 transition duration-300 ${isDockCollapsing ? "scale-75 opacity-0" : "scale-100 opacity-100"} ${
              activePage === item
                ? lightMode
                  ? "text-[#6f57f6]"
                  : "text-[#cabfff]"
                : lightMode
                  ? "text-[#8d94ac]"
                  : "text-white/50"
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
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition duration-300 hover:scale-105 ${isVertical ? "" : "ml-1"} ${isDockCollapsing ? "scale-90 rounded-full" : ""} ${lightMode ? "bg-[#f1ecff] text-[#6f57f6]" : "bg-[#2a214f] text-[#cabfff]"}`}
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
            className={`fixed z-30 w-44 rounded-2xl border p-2 shadow-xl ${lightMode ? "border-[#ece8f8] bg-white text-[#1f2746]" : "border-white/10 bg-[#1b1730] text-white"}`}
            ref={placementMenuRef}
            style={{ left: placementMenuPos.left, top: placementMenuPos.top }}
          >
            <p className={`px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] ${lightMode ? "text-[#8d87a7]" : "text-white/45"}`}>
              Dock Position
            </p>
            {([
              { id: "bottom", label: "Bottom Horizontal" },
              { id: "left", label: "Left Vertical" },
              { id: "right", label: "Right Vertical" },
            ] as Array<{ id: DockPlacement; label: string }>).map((option) => (
              <button
                className={`w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${dockPlacement === option.id ? lightMode ? "bg-[#f1ecff] text-[#6f57f6]" : "bg-[#2a214f] text-[#cabfff]" : lightMode ? "hover:bg-[#f7f5ff]" : "hover:bg-white/10"}`}
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

function saveFocusCategories(categories: FocusCategory[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FOCUS_CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
}

function saveFocusHistory(history: HistoricalFocusSession[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FOCUS_HISTORY_STORAGE_KEY, JSON.stringify(history));
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

function Select<T extends string>({
  lightMode,
  label,
  value,
  options,
  onChange,
}: {
  lightMode: boolean;
  label: string;
  value: T;
  options: T[];
  onChange: (value: T) => void;
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        className={`h-14 w-full rounded-[1.25rem] px-4 text-lg capitalize outline-none ${lightMode ? "bg-[#f7f5ff] text-[#1f2642]" : "bg-white/8 text-white"}`}
        onChange={(event) => onChange(event.target.value as T)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
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

function mapFocusCategoryRow(row: DbFocusCategory): FocusCategory {
  return {
    id: row.id,
    title: row.title,
    focusType: row.focus_type,
    focusSubtype: row.focus_subtype,
    focusSubtype2: row.focus_subtype_2,
    color: row.color,
    icon: row.icon,
    dailyGoalSeconds: row.daily_goal_seconds,
    weeklyGoalSeconds: row.weekly_goal_seconds,
  };
}

function mapActiveSessions(
  rows: Array<{
    category_id: string;
    start_time: string | null;
    accumulated_seconds: number;
    is_running: boolean;
  }>,
) {
  return rows.reduce<Record<string, ActiveFocusSession>>((accumulator, row) => {
    accumulator[row.category_id] = {
      categoryId: row.category_id,
      startTime: row.start_time ? Date.parse(row.start_time) : null,
      accumulatedSeconds: row.accumulated_seconds,
      isRunning: row.is_running,
    };
    return accumulator;
  }, {});
}

function mapFocusSessionRow(row: {
    id: string;
    category_id: string | null;
    title_snapshot: string;
    focus_type_snapshot: FocusType;
    focus_subtype_snapshot?: FocusSubtype | null;
    focus_subtype_2_snapshot?: FocusSubtype | null;
    session_date: string;
    duration_seconds: number;
    notes: string | null;
    created_at?: string;
}) {
  return {
    id: row.id,
    categoryId: row.category_id,
    title: row.title_snapshot,
    date: row.session_date,
    durationSeconds: row.duration_seconds,
    focusType: row.focus_type_snapshot,
    focusSubtype: row.focus_subtype_snapshot ?? undefined,
    focusSubtype2: row.focus_subtype_2_snapshot ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

function mergeStoredFocusCategories(categories: FocusCategory[]) {
  const storedCategories = parseStoredJson<FocusCategory[]>(FOCUS_CATEGORIES_STORAGE_KEY, []);
  if (storedCategories.length === 0) {
    return categories;
  }

  const storedById = new Map(storedCategories.map((category) => [category.id, category]));
  const storedByTitle = new Map(storedCategories.map((category) => [normalizeCategoryTitle(category.title), category]));

  return categories.map((category) => {
    const storedCategory = storedById.get(category.id) ?? storedByTitle.get(normalizeCategoryTitle(category.title));
    if (!storedCategory) {
      return category;
    }

    return {
      ...category,
      title: preferStoredValue(storedCategory.title, category.title),
      focusType: preferStoredValue(storedCategory.focusType, category.focusType),
      focusSubtype: preferStoredOptionalValue(storedCategory.focusSubtype, category.focusSubtype),
      focusSubtype2: preferStoredOptionalValue(storedCategory.focusSubtype2, category.focusSubtype2),
    };
  });
}

function mergeStoredFocusHistory(history: HistoricalFocusSession[]) {
  const storedHistory = parseStoredJson<HistoricalFocusSession[]>(FOCUS_HISTORY_STORAGE_KEY, []);
  if (storedHistory.length === 0) {
    return history;
  }

  const storedById = new Map(storedHistory.map((entry) => [entry.id, entry]));

  return history.map((entry) => {
    const storedEntry = storedById.get(entry.id);
    if (!storedEntry) {
      return entry;
    }

    return {
      ...entry,
      title: preferStoredValue(storedEntry.title, entry.title),
      focusType: preferStoredValue(storedEntry.focusType, entry.focusType),
      focusSubtype: preferStoredOptionalValue(storedEntry.focusSubtype, entry.focusSubtype),
      focusSubtype2: preferStoredOptionalValue(storedEntry.focusSubtype2, entry.focusSubtype2),
    };
  });
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
      return task.status === "active";
    case "done":
      return task.status === "done";
    case "urgent":
      return task.status === "active" && (isOverdue(task.due_on) || task.priority === "high");
    case "today":
      return task.status === "active" && isDueToday(task.due_on);
    case "focused":
      return task.status === "active" && focusedTaskIds.includes(task.id);
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
    const doneTasks = focusedAllTasks.filter((task) => task.status === "done");
    const remainingTasks = focusedAllTasks.filter((task) => task.status !== "done");
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

  const doneTasks = data.doneTasks.filter((task) => isOverdue(task.due_on) || task.priority === "high");
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
      h: Math.max(4, Math.min(12, Math.round(item.h))),
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
    ...(currentColumns >= 2 ? [{ label: currentColumns >= 4 ? "2 Cols" : "Full Width", width: 2 }] : []),
    ...(currentColumns >= 4 ? [{ label: "Full Width", width: 4 }] : []),
  ];
}

function getTaskGridHeightPresets() {
  return [
    { height: 4, label: "Short" },
    { height: 6, label: "Medium" },
    { height: 9, label: "Tall" },
  ];
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

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayISO() {
  return formatLocalDate(new Date());
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
