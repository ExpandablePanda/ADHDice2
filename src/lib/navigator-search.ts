import type { HealthTab } from "@/lib/health-utils";
import type { AppPage, TasksSurface, TaskViewMode } from "@/lib/task-ui-state";

export type NavigatorSettingsSection = "appearance" | "day-reset" | "economy" | "import-export";

export type NavigatorSearchAction =
  | { kind: "page"; page: AppPage }
  | { kind: "task"; page: "Tasks"; taskId: string }
  | { kind: "tasks-surface"; page: "Tasks"; surface: TasksSurface }
  | { kind: "tasks-view"; page: "Tasks"; surface: "tasks"; view: TaskViewMode }
  | { kind: "health-tab"; page: "Health"; tab: HealthTab }
  | { kind: "settings-section"; page: "Settings"; section: NavigatorSettingsSection };

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

  return [
    ...topLevelTargets,
    ...taskSurfaceTargets,
    ...taskViewTargets,
    ...healthTargets,
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
