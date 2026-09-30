import type { Task } from "@/lib/database.types";
import { getCalendarDayKey } from "@/lib/logical-day";
import type { TaskPriorityLevel } from "@/lib/task-priority";
import type { TaskListMembership } from "@/lib/task-lists";
import { formatDueTimeLabel } from "@/lib/task-cockpit";
import { shiftDateKey } from "@/lib/date-key";
import { buildTaskHierarchyAdapter } from "@/lib/task-hierarchy";

export type HomeTodoStateV1 = {
  clientUpdatedAt: string;
  schemaVersion: 1;
  taskIds: string[];
};

export type HomeTodoStateV4 = {
  clientUpdatedAt: string;
  schemaVersion: 4;
  taskIds: string[];
  taskDayOffsets: Record<string, number>;
  tasksPerDay: HomeTodoTasksPerDay;
  routineTaskIds: string[];
  routinesPerPhase: HomeTodoRoutinesPerSection;
};

export type HomeTodoStateV5 = {
  clientUpdatedAt: string;
  schemaVersion: 5;
  taskIds: string[];
  taskDayOffsets: Record<string, number>;
  tasksPerDay: HomeTodoTasksPerDay;
  routineTaskIds: string[];
  routinesPerSection: HomeTodoRoutinesPerSection;
  routineSectionNames: Record<string, string>;
};

export type HomeRoutineSectionDefinition = {
  id: string;
  name: string;
};

export type HomeTodoStateV6 = {
  clientUpdatedAt: string;
  schemaVersion: 6;
  taskIds: string[];
  taskDayOffsets: Record<string, number>;
  tasksPerDay: HomeTodoTasksPerDay;
  routineTaskIds: string[];
  routineSections: HomeRoutineSectionDefinition[];
  routineSectionIdByTaskId: Record<string, string>;
};

export type HomeTodoStateV2 = HomeTodoStateV4;
export type HomeTodoState = HomeTodoStateV6;

type HomeTodoStateCandidate = {
  clientUpdatedAt?: unknown;
  schemaVersion?: unknown;
  taskIds?: unknown;
  taskDayOffsets?: unknown;
  tasksPerDay?: unknown;
  routineTaskIds?: unknown;
  routinesPerSection?: unknown;
  routinesPerPhase?: unknown;
  routineSectionNames?: unknown;
  routineSections?: unknown;
  routineSectionIdByTaskId?: unknown;
};

export const HOME_TODO_TASKS_PER_DAY_OPTIONS = [10, 11, 12, 13, 14, 15] as const;
export type HomeTodoTasksPerDay = typeof HOME_TODO_TASKS_PER_DAY_OPTIONS[number];
export const DEFAULT_HOME_TODO_TASKS_PER_DAY: HomeTodoTasksPerDay = 10;
export const HOME_ROUTINES_PER_SECTION_OPTIONS = [1, 2, 3, 4, 5, 6] as const;
export type HomeTodoRoutinesPerSection = typeof HOME_ROUTINES_PER_SECTION_OPTIONS[number];
export const DEFAULT_HOME_TODO_ROUTINES_PER_SECTION: HomeTodoRoutinesPerSection = 3;
export type HomeTodoSyncStatus = "loading" | "saving" | "synced" | "local";

export const EMPTY_HOME_TODO_STATE: HomeTodoStateV6 = {
  clientUpdatedAt: new Date(0).toISOString(),
  schemaVersion: 6,
  taskIds: [],
  taskDayOffsets: {},
  tasksPerDay: DEFAULT_HOME_TODO_TASKS_PER_DAY,
  routineTaskIds: [],
  routineSections: [],
  routineSectionIdByTaskId: {},
};

export type HomeTodoDaySection<T = string> = {
  dayIndex: number;
  dateKey: string;
  label: string;
  startIndex: number;
  taskIds: T[];
};

export type HomeRoutineSection<T = string> = {
  id: string;
  groupIds: T[];
  label: string;
  sectionIndex: number;
  startIndex: number;
};

export type HomeRoutineTask = {
  depth: number;
  isAnchor: boolean;
  task: Task;
};

export type HomeRoutineGroup = {
  anchorId: string;
  taskIds: string[];
  tasks: HomeRoutineTask[];
};

export type HomeTodoTaskMetadata = Pick<
  Task,
  | "due_on"
  | "due_time"
  | "repeat_frequency"
  | "repeat_interval"
  | "repeat_days_of_week"
  | "repeat_day_of_month"
  | "repeat_monthly_mode"
  | "repeat_monthly_ordinal"
  | "repeat_monthly_weekday"
  | "tags"
> & {
  priority_level: TaskPriorityLevel;
};

export type HomeTodoTaskCreator = (
  title: string,
  taskTypeSelectionValue: string,
  metadata: HomeTodoTaskMetadata,
) => Promise<Task | null>;

export function normalizeHomeTodoTasksPerDay(value: unknown): HomeTodoTasksPerDay {
  return HOME_TODO_TASKS_PER_DAY_OPTIONS.includes(value as HomeTodoTasksPerDay)
    ? value as HomeTodoTasksPerDay
    : DEFAULT_HOME_TODO_TASKS_PER_DAY;
}

export function normalizeHomeTodoRoutinesPerSection(value: unknown): HomeTodoRoutinesPerSection {
  return HOME_ROUTINES_PER_SECTION_OPTIONS.includes(value as HomeTodoRoutinesPerSection)
    ? value as HomeTodoRoutinesPerSection
    : DEFAULT_HOME_TODO_ROUTINES_PER_SECTION;
}

function isHomeTodoRoutinesPerSection(value: unknown): value is HomeTodoRoutinesPerSection {
  return HOME_ROUTINES_PER_SECTION_OPTIONS.includes(value as HomeTodoRoutinesPerSection);
}

export function normalizeHomeTodoRoutineSectionNames(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key, name]) => {
    const sectionIndex = Number(key);
    return Number.isSafeInteger(sectionIndex)
      && sectionIndex >= 0
      && String(sectionIndex) === key
      && typeof name === "string"
      && name.trim().length > 0;
  }).map(([key, name]) => [key, (name as string).trim()]));
}

const DEFAULT_HOME_ROUTINE_SECTION_ID = "routine-section-default";

function normalizeHomeRoutineSectionName(value: unknown, fallback: string) {
  const name = typeof value === "string" ? value.trim() : "";
  return name || fallback;
}

export function getHomeRoutineSectionDefaultName(sections: readonly HomeRoutineSectionDefinition[]) {
  const existingNames = new Set(sections.map((section) => section.name));
  if (!existingNames.has("New Section")) return "New Section";
  let suffix = 2;
  while (existingNames.has(`New Section ${suffix}`)) suffix += 1;
  return `New Section ${suffix}`;
}

export function createHomeRoutineSectionId(existingIds: readonly string[] = []) {
  const existingIdSet = new Set(existingIds);
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let id = `routine-section-${randomId}`;
  let suffix = 2;
  while (existingIdSet.has(id)) {
    id = `routine-section-${randomId}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function normalizeHomeRoutineSectionDefinitions(value: unknown): HomeRoutineSectionDefinition[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const sections: HomeRoutineSectionDefinition[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const candidate = entry as { id?: unknown; name?: unknown };
    if (typeof candidate.id !== "string" || !candidate.id.trim()) continue;
    const id = candidate.id.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    sections.push({
      id,
      name: normalizeHomeRoutineSectionName(candidate.name, `Section ${sections.length + 1}`),
    });
  }
  return sections;
}

function migrateHomeRoutineSections(
  routineTaskIds: readonly string[],
  routinesPerSection: HomeTodoRoutinesPerSection,
  routineSectionNames: Readonly<Record<string, string>>,
) {
  const namedSectionIndexes = Object.keys(routineSectionNames)
    .map((key) => Number(key))
    .filter((index) => Number.isSafeInteger(index) && index >= 0);
  const sectionCount = Math.max(
    routineTaskIds.length ? Math.ceil(routineTaskIds.length / routinesPerSection) : 0,
    namedSectionIndexes.length ? Math.max(...namedSectionIndexes) + 1 : 0,
  );
  const routineSections = Array.from({ length: sectionCount }, (_, sectionIndex) => ({
    id: `routine-section-${sectionIndex}`,
    name: routineSectionNames[String(sectionIndex)] ?? `Section ${sectionIndex + 1}`,
  }));
  const routineSectionIdByTaskId = Object.fromEntries(routineTaskIds.map((taskId, index) => [
    taskId,
    routineSections[Math.floor(index / routinesPerSection)]?.id ?? routineSections[0]?.id ?? DEFAULT_HOME_ROUTINE_SECTION_ID,
  ]));
  return { routineSections, routineSectionIdByTaskId };
}

function ensureRoutineSectionsForTaskIds(
  routineTaskIds: readonly string[],
  routineSections: HomeRoutineSectionDefinition[],
  routineSectionIdByTaskId: Record<string, string>,
  fallbackToLastSection: boolean,
) {
  const sections = routineSections.length || !routineTaskIds.length
    ? routineSections
    : [{ id: DEFAULT_HOME_ROUTINE_SECTION_ID, name: "Section 1" }];
  const validSectionIds = new Set(sections.map((section) => section.id));
  const fallbackSectionId = (fallbackToLastSection ? sections[sections.length - 1] : sections[0])?.id;
  const assignments: Record<string, string> = {};
  for (const taskId of routineTaskIds) {
    const assignedSectionId = routineSectionIdByTaskId[taskId];
    assignments[taskId] = assignedSectionId && validSectionIds.has(assignedSectionId)
      ? assignedSectionId
      : fallbackSectionId ?? DEFAULT_HOME_ROUTINE_SECTION_ID;
  }
  return {
    routineSections: sections,
    routineSectionIdByTaskId: assignments,
  };
}

export function reconcileHomeRoutineSectionAssignments(
  routineSections: readonly HomeRoutineSectionDefinition[],
  routineSectionIdByTaskId: Readonly<Record<string, string>>,
  routineTaskIds: readonly string[],
) {
  return ensureRoutineSectionsForTaskIds(
    routineTaskIds,
    normalizeHomeRoutineSectionDefinitions(routineSections),
    { ...routineSectionIdByTaskId },
    true,
  );
}

export function hasMeaningfulHomeTodoState(state: HomeTodoState) {
  return state.taskIds.length > 0
    || Object.keys(state.taskDayOffsets).length > 0
    || state.tasksPerDay !== DEFAULT_HOME_TODO_TASKS_PER_DAY
    || state.routineTaskIds.length > 0
    || state.routineSections.length > 0
    || Object.keys(state.routineSectionIdByTaskId).length > 0;
}

export function shouldPersistHomeRoutineReconciliation(syncStatus: HomeTodoSyncStatus) {
  return syncStatus !== "loading";
}

function formatOrdinalDay(day: number) {
  const suffix = day % 100 >= 11 && day % 100 <= 13
    ? "th"
    : day % 10 === 1
      ? "st"
      : day % 10 === 2
        ? "nd"
        : day % 10 === 3
          ? "rd"
          : "th";
  return `${day}${suffix}`;
}

export function formatHomeTodoDateLabel(dateKey: string, dayIndex: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const month = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(date);
  const day = Number.parseInt(new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" }).format(date), 10);
  const dateLabel = `${month} ${formatOrdinalDay(day)}`;
  const prefix = dayIndex === 0
    ? "Today"
    : dayIndex === 1
      ? "Tomorrow"
      : new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" }).format(date);
  return `${prefix} · ${dateLabel}`;
}

export function buildHomeTodoDaySections<T>(
  taskIds: readonly T[],
  tasksPerDay: unknown = DEFAULT_HOME_TODO_TASKS_PER_DAY,
  now: Date = new Date(),
  timezone?: string,
  taskDayOffsets: Readonly<Record<string, number>> = {},
) {
  const normalizedTasksPerDay = normalizeHomeTodoTasksPerDay(tasksPerDay);
  const todayDateKey = getCalendarDayKey(now, timezone);
  const sections: HomeTodoDaySection<T>[] = Array.from({ length: 7 }, (_, dayIndex) => ({
    dayIndex,
    dateKey: shiftDateKey(todayDateKey, dayIndex),
    label: formatHomeTodoDateLabel(shiftDateKey(todayDateKey, dayIndex), dayIndex),
    startIndex: 0,
    taskIds: [],
  }));
  const manuallyAssignedTaskIds: Array<{ dayIndex: number; taskId: T }> = [];
  const unassignedTaskIds: T[] = [];
  const laterTaskIds: T[] = [];

  for (const taskId of taskIds) {
    const assignedDayOffset = taskDayOffsets[String(taskId)];
    if (Number.isInteger(assignedDayOffset) && assignedDayOffset >= 0 && assignedDayOffset <= 7) {
      if (assignedDayOffset === 7) laterTaskIds.push(taskId);
      else manuallyAssignedTaskIds.push({ dayIndex: assignedDayOffset, taskId });
    } else {
      unassignedTaskIds.push(taskId);
    }
  }

  function placeTaskAtOrAfter(taskId: T, preferredDayIndex: number) {
    let dayIndex = preferredDayIndex;
    while (dayIndex < sections.length && sections[dayIndex]!.taskIds.length >= normalizedTasksPerDay) {
      dayIndex += 1;
    }
    if (dayIndex >= sections.length) {
      laterTaskIds.push(taskId);
    } else {
      sections[dayIndex]!.taskIds.push(taskId);
    }
  }

  for (const { dayIndex, taskId } of manuallyAssignedTaskIds) {
    placeTaskAtOrAfter(taskId, dayIndex);
  }
  for (const taskId of unassignedTaskIds) {
    placeTaskAtOrAfter(taskId, 0);
  }

  let startIndex = 0;
  for (const section of sections) {
    section.startIndex = startIndex;
    startIndex += section.taskIds.length;
  }
  return { sections, laterTaskIds };
}

export function buildHomeRoutineSections<T>(
  routineTaskIds: readonly T[],
  routineSections: readonly HomeRoutineSectionDefinition[] = [],
  routineSectionIdByTaskId: Readonly<Record<string, string>> = {},
): HomeRoutineSection<T>[] {
  const normalizedSections = ensureRoutineSectionsForTaskIds(
    routineTaskIds.map((taskId) => String(taskId)),
    normalizeHomeRoutineSectionDefinitions(routineSections),
    { ...routineSectionIdByTaskId },
    false,
  ).routineSections;
  const groupIdsBySectionId = new Map(normalizedSections.map((section) => [section.id, [] as T[]]));
  const fallbackSectionId = normalizedSections[0]?.id;
  for (const taskId of routineTaskIds) {
    const sectionId = routineSectionIdByTaskId[String(taskId)] ?? fallbackSectionId;
    const groupIds = sectionId ? groupIdsBySectionId.get(sectionId) ?? groupIdsBySectionId.get(fallbackSectionId ?? "") : undefined;
    groupIds?.push(taskId);
  }
  let startIndex = 0;
  return normalizedSections.map((section, sectionIndex) => {
    const groupIds = groupIdsBySectionId.get(section.id) ?? [];
    const view = { id: section.id, groupIds, label: section.name, sectionIndex, startIndex };
    startIndex += groupIds.length;
    return view;
  });
}

export function formatHomeRoutineDueLabel(task: Pick<Task, "due_on" | "due_time">) {
  if (!task.due_on) return null;
  const [year, month, day] = task.due_on.split("-").map((part) => Number.parseInt(part ?? "", 10));
  const dateLabel = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? `${month}/${day}/${String(year).slice(-2)}`
    : task.due_on;
  const dueTimeLabel = formatDueTimeLabel(task.due_time);
  return dueTimeLabel ? `${dateLabel} · ${dueTimeLabel}` : dateLabel;
}

export function getHomeRoutineStreakMetadata(summary?: { currentStreak: number; missedStreak: number }) {
  const missedStreak = summary?.missedStreak ?? 0;
  const currentStreak = summary?.currentStreak ?? 0;
  if (missedStreak > 0) return { count: missedStreak, kind: "missed" as const };
  if (currentStreak > 0) return { count: currentStreak, kind: "current" as const };
  return null;
}

export async function createHomeTodoTask(
  title: string,
  taskTypeSelectionValue: string,
  onCreateTask: HomeTodoTaskCreator,
  appendTaskId: (taskId: string) => void,
  metadata: HomeTodoTaskMetadata,
) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return null;

  const createdTask = await onCreateTask(trimmedTitle, taskTypeSelectionValue, metadata);
  if (!createdTask) return null;

  appendTaskId(createdTask.id);
  return createdTask;
}

export function normalizeHomeTodoState(value: unknown): HomeTodoStateV6 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_HOME_TODO_STATE };
  }
  const candidate = value as HomeTodoStateCandidate;
  const seen = new Set<string>();
  const taskIds = Array.isArray(candidate.taskIds)
    ? candidate.taskIds.filter((taskId): taskId is string => {
      if (typeof taskId !== "string" || !taskId.trim() || seen.has(taskId)) return false;
      seen.add(taskId);
      return true;
    })
    : [];
  const parsedUpdatedAt = typeof candidate.clientUpdatedAt === "string"
    ? Date.parse(candidate.clientUpdatedAt)
    : Number.NaN;
  const taskIdSet = new Set(taskIds);
  const taskDayOffsets = candidate.taskDayOffsets && typeof candidate.taskDayOffsets === "object" && !Array.isArray(candidate.taskDayOffsets)
    ? Object.fromEntries(Object.entries(candidate.taskDayOffsets as Record<string, unknown>).filter(([taskId, offset]) => (
      taskIdSet.has(taskId) && Number.isInteger(offset) && Number(offset) >= 0 && Number(offset) <= 7
    )).map(([taskId, offset]) => [taskId, Number(offset)]))
    : {};
  const routineTaskIds = Array.isArray(candidate.routineTaskIds)
    ? normalizeHomeRoutineTaskIds(candidate.routineTaskIds)
    : [];
  const routineTaskIdSet = new Set(routineTaskIds);
  const routinesPerSection = isHomeTodoRoutinesPerSection(candidate.routinesPerSection)
    ? candidate.routinesPerSection
    : normalizeHomeTodoRoutinesPerSection(candidate.routinesPerPhase);
  const legacyRoutineSectionNames = normalizeHomeTodoRoutineSectionNames(candidate.routineSectionNames);
  const hasV6RoutinePayload = Array.isArray(candidate.routineSections) || Number(candidate.schemaVersion) >= 6;
  const migratedRoutineSections = hasV6RoutinePayload
    ? {
      routineSections: normalizeHomeRoutineSectionDefinitions(candidate.routineSections),
      routineSectionIdByTaskId: candidate.routineSectionIdByTaskId && typeof candidate.routineSectionIdByTaskId === "object" && !Array.isArray(candidate.routineSectionIdByTaskId)
        ? Object.fromEntries(Object.entries(candidate.routineSectionIdByTaskId as Record<string, unknown>).filter(([taskId, sectionId]) => (
          routineTaskIdSet.has(taskId) && typeof sectionId === "string" && sectionId.trim().length > 0
        )).map(([taskId, sectionId]) => [taskId, (sectionId as string).trim()]))
        : {},
    }
    : migrateHomeRoutineSections(routineTaskIds, routinesPerSection, legacyRoutineSectionNames);
  const normalizedRoutineSections = ensureRoutineSectionsForTaskIds(
    routineTaskIds,
    migratedRoutineSections.routineSections,
    migratedRoutineSections.routineSectionIdByTaskId,
    false,
  );
  return {
    clientUpdatedAt: Number.isFinite(parsedUpdatedAt)
      ? new Date(parsedUpdatedAt).toISOString()
      : EMPTY_HOME_TODO_STATE.clientUpdatedAt,
    schemaVersion: 6,
    taskIds,
    taskDayOffsets,
    tasksPerDay: normalizeHomeTodoTasksPerDay(candidate.tasksPerDay),
    routineTaskIds,
    routineSections: normalizedRoutineSections.routineSections,
    routineSectionIdByTaskId: normalizedRoutineSections.routineSectionIdByTaskId,
  };
}

export function isHomeTodoTaskEligible(
  task: Task,
  tasks: readonly Task[],
  taskById = new Map(tasks.map((item) => [item.id, item])),
) {
  if (
    task.status === "complete"
    || task.status === "archived"
    || task.status === "trashed"
    || task.trashed_at
  ) {
    return false;
  }
  const visited = new Set<string>([task.id]);
  let parentId = task.parent_task_id;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = taskById.get(parentId);
    if (!parent) break;
    if (parent.status === "archived" || parent.status === "trashed" || parent.trashed_at) {
      return false;
    }
    parentId = parent.parent_task_id;
  }
  return true;
}

export function getHomeRoutineTaskIds(
  tasks: readonly Task[],
  listMembershipsByTaskId: Readonly<Record<string, readonly Pick<TaskListMembership, "id">[]>>,
  directMembershipsByTaskId?: Readonly<Record<string, readonly string[]>>,
) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const hierarchy = buildTaskHierarchyAdapter(tasks);
  const directRoutineTaskIds = new Set(tasks
    .filter((task) => directMembershipsByTaskId
      ? (directMembershipsByTaskId[task.id] ?? []).includes("routine")
      : (listMembershipsByTaskId[task.id] ?? []).some((membership) => membership.id === "routine"))
    .map((task) => task.id));
  return tasks
    .filter((task) => directRoutineTaskIds.has(task.id))
    .filter((task) => !hierarchy.getParentChain(task.id).some((ancestor) => directRoutineTaskIds.has(ancestor.id)))
    .filter((task) => isHomeTodoTaskEligible(task, tasks, taskById))
    .map((task) => task.id);
}

export function buildHomeRoutineGroups(
  routineTaskIds: readonly string[],
  tasks: readonly Task[],
) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const hierarchy = buildTaskHierarchyAdapter(tasks);
  const groups: HomeRoutineGroup[] = [];

  for (const anchorId of routineTaskIds) {
    const anchor = taskById.get(anchorId);
    if (!anchor || !isHomeTodoTaskEligible(anchor, tasks, taskById)) continue;
    const anchorDepth = hierarchy.getDepth(anchor.id) ?? 0;
    const groupTasks: HomeRoutineTask[] = [{ depth: 0, isAnchor: true, task: anchor }];
    for (const descendant of hierarchy.getDescendants(anchor.id)) {
      if (!isHomeTodoTaskEligible(descendant, tasks, taskById)) continue;
      groupTasks.push({
        depth: Math.max(0, (hierarchy.getDepth(descendant.id) ?? anchorDepth) - anchorDepth),
        isAnchor: false,
        task: descendant,
      });
    }
    groups.push({
      anchorId,
      taskIds: groupTasks.map(({ task }) => task.id),
      tasks: groupTasks,
    });
  }

  return groups;
}

export function reconcileHomeRoutineTaskIds(
  routineTaskIds: readonly string[],
  routineGroupAnchorIds: readonly string[],
) {
  const eligibleIds = new Set(routineGroupAnchorIds);
  const next: string[] = [];
  const seen = new Set<string>();
  for (const taskId of routineTaskIds) {
    if (!eligibleIds.has(taskId) || seen.has(taskId)) continue;
    seen.add(taskId);
    next.push(taskId);
  }
  for (const taskId of routineGroupAnchorIds) {
    if (seen.has(taskId)) continue;
    seen.add(taskId);
    next.push(taskId);
  }
  return next;
}

export function moveHomeRoutineTaskIdToSection(
  routineTaskIds: readonly string[],
  routineSectionIdByTaskId: Readonly<Record<string, string>>,
  taskId: string,
  destinationSectionId: string,
) {
  const from = routineTaskIds.indexOf(taskId);
  if (from < 0 || routineSectionIdByTaskId[taskId] === destinationSectionId) {
    return {
      routineTaskIds: [...routineTaskIds],
      routineSectionIdByTaskId: { ...routineSectionIdByTaskId },
    };
  }

  const nextRoutineTaskIds = routineTaskIds.filter((candidate) => candidate !== taskId);
  const destinationIndexes = nextRoutineTaskIds
    .map((candidate, index) => routineSectionIdByTaskId[candidate] === destinationSectionId ? index : -1)
    .filter((index) => index >= 0);
  const insertIndex = destinationIndexes.length ? destinationIndexes[destinationIndexes.length - 1]! + 1 : nextRoutineTaskIds.length;
  nextRoutineTaskIds.splice(insertIndex, 0, taskId);
  return {
    routineTaskIds: nextRoutineTaskIds,
    routineSectionIdByTaskId: {
      ...routineSectionIdByTaskId,
      [taskId]: destinationSectionId,
    },
  };
}

function normalizeHomeRoutineTaskIds(value: readonly unknown[]) {
  const seen = new Set<string>();
  return value.filter((taskId): taskId is string => {
    if (typeof taskId !== "string" || !taskId.trim() || seen.has(taskId)) return false;
    seen.add(taskId);
    return true;
  });
}

export function buildHomeTodoHierarchy(
  task: Task,
  tasks: readonly Task[],
  taskById = new Map(tasks.map((item) => [item.id, item])),
) {
  const labels: string[] = [];
  const visited = new Set<string>([task.id]);
  let parentId = task.parent_task_id;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = taskById.get(parentId);
    if (!parent) break;
    labels.unshift(parent.title || "Untitled task");
    parentId = parent.parent_task_id;
  }
  return labels;
}

export function getHomeTodoSearchText(
  task: Pick<Task, "notes" | "pinned_at" | "tags" | "title">,
  hierarchy: readonly string[],
  listMemberships: readonly Pick<TaskListMembership, "id">[],
) {
  return [
    task.title,
    task.notes,
    ...(task.tags ?? []),
    ...hierarchy,
    task.pinned_at ? "pinned" : "",
    ...listMemberships.map((membership) => membership.id),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function reconcileHomeTodoTaskIds(taskIds: readonly string[], tasks: readonly Task[]) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const seen = new Set<string>();
  return taskIds.filter((taskId) => {
    if (seen.has(taskId)) return false;
    seen.add(taskId);
    const task = taskById.get(taskId);
    return Boolean(task && isHomeTodoTaskEligible(task, tasks, taskById));
  });
}

/**
 * Applies a reordered visible subset to the durable flat order without
 * removing IDs that are temporarily unavailable to the current Task read.
 */
export function mergeHomeTodoVisibleTaskIds(
  taskIds: readonly string[],
  visibleTaskIds: readonly string[],
  reorderedVisibleTaskIds: readonly string[],
) {
  const visibleIdSet = new Set(visibleTaskIds);
  const nextVisibleTaskIds: string[] = [];
  const seen = new Set<string>();
  for (const taskId of reorderedVisibleTaskIds) {
    if (!visibleIdSet.has(taskId) || seen.has(taskId) || !taskIds.includes(taskId)) continue;
    seen.add(taskId);
    nextVisibleTaskIds.push(taskId);
  }
  for (const taskId of taskIds) {
    if (visibleIdSet.has(taskId) && !seen.has(taskId)) {
      seen.add(taskId);
      nextVisibleTaskIds.push(taskId);
    }
  }

  let nextVisibleIndex = 0;
  return taskIds.map((taskId) => (
    visibleIdSet.has(taskId)
      ? nextVisibleTaskIds[nextVisibleIndex++]!
      : taskId
  ));
}

export function moveHomeTodoTaskId(taskIds: readonly string[], taskId: string, direction: -1 | 1) {
  const from = taskIds.indexOf(taskId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= taskIds.length) return [...taskIds];
  const next = [...taskIds];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

export function moveHomeTodoTaskIdToEdge(
  taskIds: readonly string[],
  taskId: string,
  edge: "bottom" | "top",
) {
  const from = taskIds.indexOf(taskId);
  if (from < 0) return [...taskIds];
  const next = [...taskIds];
  const [movedTaskId] = next.splice(from, 1);
  if (!movedTaskId) return [...taskIds];
  if (edge === "top") next.unshift(movedTaskId);
  else next.push(movedTaskId);
  return next;
}

export function moveHomeTodoTaskIdToVisibleEdge(
  taskIds: readonly string[],
  visibleTaskIds: readonly string[],
  taskId: string,
  edge: "bottom" | "top",
) {
  return mergeHomeTodoVisibleTaskIds(
    taskIds,
    visibleTaskIds,
    moveHomeTodoTaskIdToEdge(visibleTaskIds, taskId, edge),
  );
}

export function sortHomeTodoSearchResults<T extends {
  hierarchy: readonly string[];
  task: Pick<Task, "id" | "title">;
}>(results: readonly T[]) {
  return [...results].sort((left, right) => {
    const leftPath = [...left.hierarchy, left.task.title || "Untitled task"];
    const rightPath = [...right.hierarchy, right.task.title || "Untitled task"];
    const sharedLength = Math.min(leftPath.length, rightPath.length);
    for (let index = 0; index < sharedLength; index += 1) {
      const comparison = leftPath[index]!.localeCompare(rightPath[index]!, undefined, {
        numeric: true,
        sensitivity: "base",
      });
      if (comparison !== 0) return comparison;
    }
    if (leftPath.length !== rightPath.length) return leftPath.length - rightPath.length;
    return left.task.id.localeCompare(right.task.id);
  });
}
