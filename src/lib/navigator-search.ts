import type { HealthTab } from "@/lib/health-utils";
import { getRegisteredPageShellPages } from "@/lib/page-shell-layout";
import type { AppPage, TasksSurface, TaskViewMode } from "@/lib/task-ui-state";

export type NavigatorSettingsSection = "appearance" | "day-reset" | "economy" | "import-export";

export type NavigatorSearchAction =
  | { kind: "page"; page: AppPage }
  | { kind: "task"; page: "Tasks"; taskId: string }
  | { kind: "tasks-surface"; page: "Tasks"; surface: TasksSurface }
  | { kind: "tasks-view"; page: "Tasks"; surface: "tasks"; view: TaskViewMode }
  | { kind: "health-tab"; page: "Health"; tab: HealthTab }
  | { kind: "settings-section"; page: "Settings"; section: NavigatorSettingsSection }
  | {
    kind: "page-shell";
    page: AppPage;
    pageKey: string;
    shellId: string;
    healthTab?: HealthTab;
    tasksSurface?: TasksSurface;
  };

export type NavigatorSearchTarget = {
  action: NavigatorSearchAction;
  breadcrumb: string[];
  id: string;
  keywords?: string[];
  page: AppPage;
  title: string;
};

type TaskSurfaceTarget = {
  keywords?: string[];
  surface: Exclude<TasksSurface, "tasks">;
  title: string;
};

const TASK_SURFACE_TARGETS: TaskSurfaceTarget[] = [
  { surface: "paths", title: "PATHS", keywords: ["path", "projects"] },
  { surface: "report", title: "Report", keywords: ["progress", "summary"] },
  { surface: "on_time", title: "On Time", keywords: ["timer", "timing", "planner"] },
  { surface: "brainstorm", title: "Brainstorm", keywords: ["brain", "ideas", "ideation"] },
  { surface: "completed_milestones", title: "Completed Milestones", keywords: ["milestones", "done"] },
];

const TASK_VIEW_TARGETS: Array<{ title: string; view: TaskViewMode }> = [
  { title: "Table View", view: "table" },
  { title: "List View", view: "list" },
  { title: "Cards View", view: "cards" },
  { title: "Matrix View", view: "matrix" },
  { title: "Grid View", view: "grid" },
  { title: "Calendar View", view: "calendar" },
];

const SETTINGS_SECTION_TARGETS: Array<{ id: NavigatorSettingsSection; title: string; keywords?: string[] }> = [
  { id: "appearance", title: "Appearance", keywords: ["theme", "color", "highlight"] },
  { id: "day-reset", title: "Day Reset", keywords: ["day start", "timezone", "time zone"] },
  { id: "economy", title: "Economy", keywords: ["xp", "points", "tokens", "reset economy"] },
  { id: "import-export", title: "Import / Export", keywords: ["json", "tasks export", "tasks import"] },
];

const SETTINGS_CHILD_TARGETS: Array<{
  id: string;
  keywords?: string[];
  section: NavigatorSettingsSection;
  title: string;
}> = [
  { id: "appearance-theme", section: "appearance", title: "Theme", keywords: ["dark mode", "light mode"] },
  { id: "appearance-highlight-color", section: "appearance", title: "Highlight Color", keywords: ["accent", "color"] },
  { id: "day-reset-day-start", section: "day-reset", title: "Day Starts At", keywords: ["day start", "logical day"] },
  { id: "day-reset-time-zone", section: "day-reset", title: "Time Zone", keywords: ["timezone", "tz"] },
  { id: "economy-reset", section: "economy", title: "Reset Economy", keywords: ["reset xp", "reset points", "free roll"] },
  { id: "import-export-export-tasks", section: "import-export", title: "Export Tasks", keywords: ["export json", "download"] },
  { id: "import-export-import-json", section: "import-export", title: "Import JSON", keywords: ["import tasks", "upload"] },
];

const PAGE_SHELL_LABELS: Readonly<Record<string, string>> = {
  "today-snapshot": "Today Snapshot",
  "today-quick-log": "Quick Log",
  "today-timeline": "Today Timeline",
  "food-meal-log": "Meal Log",
  "food-daily-totals": "Daily Totals",
  "food-favorites-recent": "Favorites & Recent Foods",
  "food-library": "Custom Nutrition Library",
  "water-log": "Water Log",
  "water-pending": "Pending Water",
  "water-today": "Today's Water",
  "water-history": "Water History",
  "fitness-active-workout": "Active Workout",
  "fitness-today": "Today",
  "fitness-week": "This Week",
  "fitness-goals": "Fitness Goals",
  "fitness-plans": "Fitness Plans",
  "fitness-workout-history": "Workout History",
  "journal-entry-history": "Journal Entry and History",
  "journal-library": "Journal Library",
  "journal-feeling-trends": "Feeling Trends",
  "weight-entry": "Weigh-in",
  "weight-trend": "Recent Trend",
  "sleep-ledger": "Health Sleep Totals",
  "sleep-log": "Log Sleep",
  "sleep-sources": "Sleep Sources",
  "sleep-focus-ledger": "Sleep Ledger",
  "insights-import": "Apple Health Import",
  "insights-trends": "Imported Trends",
  "awards-content": "Awards",
  "settings-content": "Health Settings",
  "stats-overview": "Overview",
  "stats-economy": "Economy",
  "stats-productivity": "7-Day Productivity",
  "stats-achievements": "Achievements",
  "stats-energy": "Active Task Energy",
  "focus-timer-workspace": "Focus Timer Workspace",
  "focus-goals": "Focus Goals",
  "focus-counter-history": "Counter History",
  "focus-activity-summary": "Focus Activity",
  "focus-activity-trend": "Focus Activity Trend",
  "home-todo": "Home To-do List",
  "settings-appearance": "Appearance",
  "settings-day-reset": "Day Reset",
  "settings-economy": "Economy",
  "settings-import-export": "Import / Export",
  "notes-scratch-paper": "Scratch Paper",
  "notes-library": "Notes Library",
  "test-task-table": "Task Table #2",
  "test-d20": "D20 Face Mapper",
  "test-dice-face": "Dice Face Mapper",
  "test-dice-material": "Dice Material Lab",
  "test-task-table-prototype": "Task Table Prototype",
  "test-bucket-tray": "Bucket Tray",
  "test-rule-builder": "Rule Builder",
  "test-d20-sandbox": "D20 Sandbox",
  "test-d20-controls": "Face Mapping Controls",
};

const PAGE_SHELL_KEYWORDS: Readonly<Record<string, string[]>> = {
  "food-library": ["food library", "foods", "nutrition", "custom food"],
};

function getPageShellTitle(shellId: string) {
  return PAGE_SHELL_LABELS[shellId] ?? shellId.replace(/^[^-]+-/, "").replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function getPageShellRoute(pageKey: string, healthTabs: readonly HealthTab[]) {
  if (pageKey.startsWith("health:")) {
    const tab = healthTabs.find((candidate) => candidate.toLowerCase() === pageKey.slice("health:".length));
    return tab ? { page: "Health" as const, healthTab: tab } : null;
  }
  const pageByKey: Readonly<Record<string, AppPage>> = {
    focus: "Focus",
    home: "Home",
    notes: "Notes",
    settings: "Settings",
    stats: "Stats",
    test: "Test",
    "test:d20": "Test",
  };
  const page = pageByKey[pageKey];
  return page ? { page } : null;
}

function createPageShellTargets(healthTabs: readonly HealthTab[]) {
  return getRegisteredPageShellPages().flatMap(({ canonicalLayout, pageKey }) => {
    const route = getPageShellRoute(pageKey, healthTabs);
    if (!route) return [];
    return canonicalLayout.order.map((shellId) => {
      const title = getPageShellTitle(shellId);
      const breadcrumb = route.healthTab
        ? [route.page, route.healthTab, title]
        : pageKey === "test:d20"
          ? [route.page, "D20 Face Mapper", title]
          : [route.page, title];
      return makeTarget({
        action: {
          kind: "page-shell",
          page: route.page,
          pageKey,
          shellId,
          ...(route.healthTab ? { healthTab: route.healthTab } : {}),
        },
        breadcrumb,
        id: `page-shell-${pageKey.replace(/[^a-z0-9]+/gi, "-")}-${shellId}`,
        keywords: [
          ...(PAGE_SHELL_KEYWORDS[shellId] ?? []),
          pageKey.replace(/[:]/g, " "),
          shellId.replace(/-/g, " "),
        ],
        page: route.page,
        title,
      });
    });
  });
}

function makeTarget(
  target: Omit<NavigatorSearchTarget, "page"> & { page?: AppPage },
): NavigatorSearchTarget {
  return {
    ...target,
    page: target.page ?? target.action.page,
  };
}

export function createNavigatorSearchTargets(
  dockItems: readonly AppPage[],
  healthTabs: readonly HealthTab[],
): NavigatorSearchTarget[] {
  const topLevelTargets = dockItems.map((page) => makeTarget({
    action: { kind: "page", page },
    breadcrumb: [page],
    id: `page-${page.toLowerCase()}`,
    keywords: page === "Focus" ? ["timer", "pomodoro", "focus timer"] : undefined,
    title: page,
  }));

  const taskSurfaceTargets = TASK_SURFACE_TARGETS.map(({ keywords, surface, title }) => makeTarget({
    action: { kind: "tasks-surface", page: "Tasks", surface },
    breadcrumb: ["Tasks", title],
    id: `tasks-surface-${surface}`,
    keywords,
    page: "Tasks",
    title,
  }));

  const taskViewTargets = TASK_VIEW_TARGETS.map(({ title, view }) => makeTarget({
    action: { kind: "tasks-view", page: "Tasks", surface: "tasks", view },
    breadcrumb: ["Tasks", "Tasks", title.replace(/ View$/, "")],
    id: `tasks-view-${view}`,
    keywords: ["view", view],
    page: "Tasks",
    title,
  }));

  const healthTargets = healthTabs.map((tab) => makeTarget({
    action: { kind: "health-tab", page: "Health", tab },
    breadcrumb: ["Health", tab],
    id: `health-tab-${tab.toLowerCase()}`,
    keywords: tab === "Fitness" ? ["workout", "exercise", "training"] : tab === "Food" ? ["meal", "nutrition"] : undefined,
    page: "Health",
    title: tab,
  }));

  const settingsSectionTargets = SETTINGS_SECTION_TARGETS.map(({ id, keywords, title }) => makeTarget({
    action: { kind: "settings-section", page: "Settings", section: id },
    breadcrumb: ["Settings", title],
    id: `settings-section-${id}`,
    keywords,
    page: "Settings",
    title,
  }));

  const settingsChildTargets = SETTINGS_CHILD_TARGETS.map(({ id, keywords, section, title }) => makeTarget({
    action: { kind: "settings-section", page: "Settings", section },
    breadcrumb: ["Settings", SETTINGS_SECTION_TARGETS.find((target) => target.id === section)?.title ?? section, title],
    id: `settings-${id}`,
    keywords,
    page: "Settings",
    title,
  }));
  const pageShellTargets = createPageShellTargets(healthTabs);

  return [
    ...topLevelTargets,
    ...taskSurfaceTargets,
    ...taskViewTargets,
    ...healthTargets,
    ...pageShellTargets,
    ...settingsSectionTargets,
    ...settingsChildTargets,
  ];
}

function normalizeSearchText(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getTargetSearchRank(target: NavigatorSearchTarget, normalizedQuery: string) {
  if (!normalizedQuery) {
    return 0;
  }

  const normalizedTitle = normalizeSearchText(target.title);
  if (normalizedTitle === normalizedQuery) {
    return 0;
  }
  if (normalizedTitle.startsWith(normalizedQuery)) {
    return 1;
  }
  if (normalizedTitle.includes(normalizedQuery)) {
    return 2;
  }

  const secondaryText = [...target.breadcrumb, ...(target.keywords ?? [])]
    .map(normalizeSearchText)
    .join(" ");
  return secondaryText.includes(normalizedQuery) ? 3 : Number.POSITIVE_INFINITY;
}

export function searchNavigatorTargets(query: string, targets: readonly NavigatorSearchTarget[]) {
  const normalizedQuery = normalizeSearchText(query.trim());
  return targets
    .map((target, index) => ({ index, rank: getTargetSearchRank(target, normalizedQuery), target }))
    .filter((entry) => Number.isFinite(entry.rank))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((entry) => entry.target);
}

export function isNavigatorTaskSearchQuery(query: string) {
  return query.trimStart().startsWith("#");
}

export function getNavigatorTaskSearchQuery(query: string) {
  return query.replace(/^\s*#\s*/, "");
}

export function toggleNavigatorTaskSearchQuery(query: string) {
  return isNavigatorTaskSearchQuery(query)
    ? getNavigatorTaskSearchQuery(query)
    : `#${query}`;
}
