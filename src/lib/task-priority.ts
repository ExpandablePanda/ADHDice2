import type { Task, TaskInsert, TaskPriority, TaskUpdate } from "@/lib/database.types";

export type TaskPriorityLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type TaskPriorityLevelOption = "0" | "1" | "2" | "3" | "4" | "5";
export type LegacyTaskPrioritySelection = "focus" | "important" | "none" | "urgent";
export type TaskPrioritySelectionInput = LegacyTaskPrioritySelection | TaskPriorityLevelOption;

export const TASK_PRIORITY_LEVEL_OPTIONS = ["0", "1", "2", "3", "4", "5"] as const satisfies readonly TaskPriorityLevelOption[];

const TASK_PRIORITY_TONE_CLASS: Record<TaskPriorityLevel, string> = {
  0: "border-[#e4deef] bg-white text-[#8a93aa] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/45",
  1: "border-[#e4deef] bg-[#f4f5f8] text-[#68738c] dark:border-white/10 dark:bg-white/8 dark:text-white/60",
  2: "border-[#cfe4ff] bg-[#eef6ff] text-[#3e7bd6] dark:border-[#284978] dark:bg-[#15243b] dark:text-[#8dc0ff]",
  3: "border-[#f2df9b] bg-[#fff6df] text-[#b77900] dark:border-[#6b5317] dark:bg-[#44350d] dark:text-[#ffd56b]",
  4: "border-[#ffd8be] bg-[#fff1e7] text-[#dc6c1c] dark:border-[#65401d] dark:bg-[#432712] dark:text-[#ffb37e]",
  5: "border-[#ffd6de] bg-[#fff1f3] text-[#d94e67] dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf]",
};

const TASK_PRIORITY_LABELS: Record<TaskPriorityLevel, string> = {
  0: "0",
  1: "1",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
};

const TASK_PRIORITY_MENU_LABELS: Record<TaskPriorityLevel, string> = {
  0: "0 - Unsorted",
  1: "1 - Light",
  2: "2 - Low",
  3: "3 - Normal",
  4: "4 - Important",
  5: "5 - Urgent",
};

export function coerceTaskPriorityLevel(value: number | string | null | undefined): TaskPriorityLevel | null {
  const numericValue = typeof value === "string" ? Number.parseInt(value, 10) : value;
  if (numericValue === 0 || numericValue === 1 || numericValue === 2 || numericValue === 3 || numericValue === 4 || numericValue === 5) {
    return numericValue;
  }
  return null;
}

export function inferLegacyTaskPriorityLevel(task: Pick<Task, "is_important" | "is_urgent" | "priority"> | Pick<TaskInsert, "is_important" | "is_urgent" | "priority"> | Pick<TaskUpdate, "is_important" | "is_urgent" | "priority">): TaskPriorityLevel {
  if (task.is_urgent === true) {
    return 5;
  }
  if (task.is_important === true) {
    return 4;
  }
  if (task.priority === "high") {
    return 4;
  }
  if (task.priority === "low") {
    return 2;
  }
  return 3;
}

export function getTaskPriorityLevel(task: Pick<Task, "is_important" | "is_urgent" | "priority" | "priority_level">): TaskPriorityLevel {
  return coerceTaskPriorityLevel(task.priority_level) ?? inferLegacyTaskPriorityLevel(task);
}

export function mapTaskPriorityLevelToLegacyFields(level: TaskPriorityLevel) {
  return {
    is_important: level === 4,
    is_urgent: level === 5,
    priority: level <= 2 ? "low" as TaskPriority : level === 3 ? "normal" as TaskPriority : "high" as TaskPriority,
  };
}

export function buildTaskPriorityUpdate(level: TaskPriorityLevel) {
  return {
    priority_level: level,
    ...mapTaskPriorityLevelToLegacyFields(level),
  };
}

export function getTaskPrioritySelection(priorities: readonly TaskPriorityLevelOption[]) {
  return priorities[0] ?? null;
}

export function normalizeTaskPriorityFields<T extends Partial<Pick<Task, "is_important" | "is_urgent" | "priority" | "priority_level">>>(values: T) {
  const level = coerceTaskPriorityLevel(values.priority_level) ?? inferLegacyTaskPriorityLevel(values);
  return {
    ...values,
    ...buildTaskPriorityUpdate(level),
  };
}

export function formatTaskPriorityLevel(level: TaskPriorityLevel) {
  return TASK_PRIORITY_LABELS[level];
}

export function formatTaskPriorityLabel(level: TaskPriorityLevel) {
  return `Priority ${TASK_PRIORITY_LABELS[level]}`;
}

export function formatTaskPriorityMenuLabel(level: TaskPriorityLevel) {
  return TASK_PRIORITY_MENU_LABELS[level];
}

export function getTaskPriorityToneClass(level: TaskPriorityLevel | TaskPriorityLevelOption) {
  const normalizedLevel = typeof level === "string" ? Number.parseInt(level, 10) : level;
  return TASK_PRIORITY_TONE_CLASS[normalizedLevel as TaskPriorityLevel] ?? TASK_PRIORITY_TONE_CLASS[1];
}

export function getSelectedTaskPriorityToneClass(level: TaskPriorityLevel | TaskPriorityLevelOption) {
  return `${getTaskPriorityToneClass(level)} ring-2 ring-current/15`;
}

export function normalizeTaskPrioritySelectionInput(value: string | null | undefined) {
  if (value === "focus") {
    return { focusAction: "add" as const, priorityLevel: null };
  }
  if (value === "important") {
    return { focusAction: "remove" as const, priorityLevel: 4 as TaskPriorityLevel };
  }
  if (value === "urgent") {
    return { focusAction: "remove" as const, priorityLevel: 5 as TaskPriorityLevel };
  }
  if (value === "none") {
    return { focusAction: "remove" as const, priorityLevel: 0 as TaskPriorityLevel };
  }

  const priorityLevel = coerceTaskPriorityLevel(value);
  if (priorityLevel !== null) {
    return { focusAction: "preserve" as const, priorityLevel };
  }

  return null;
}
