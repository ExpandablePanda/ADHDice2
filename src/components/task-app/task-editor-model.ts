import type {
  Task,
  TaskEnergy,
  TaskInsert,
  TaskRepeatFrequency,
  TaskRepeatMonthlyMode,
  TaskRepeatMonthlyOrdinal,
  TaskStatus,
  TaskSubtask as DbTaskSubtask,
  TaskSubtaskStatus,
} from "@/lib/database.types";
import { formatTaskPriorityLevel, getTaskPriorityLevel, type TaskPriorityLevelOption } from "@/lib/task-priority";

export type TaskDraft = Omit<TaskInsert, "user_id">;
export type TaskEditorMode = "create" | "edit";

export type VerticalScrollIndicator = {
  active: boolean;
  height: number;
  scrollable: boolean;
  top: number;
};

export type TaskEditorDraft = {
  title: string;
  notes: string;
  linkedNoteIds: string[];
  status: TaskStatus;
  priorityLevel: TaskPriorityLevelOption;
  energy: TaskEnergy;
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
  repeatMonthlyMode: TaskRepeatMonthlyMode;
  repeatMonthlyOrdinal: TaskRepeatMonthlyOrdinal | null;
  repeatMonthlyWeekday: number | null;
  subtasksAutoReset: boolean;
  subtasks: TaskSubtaskDraft[];
};

export type TaskSubtaskDraft = {
  id: string;
  title: string;
  status: TaskSubtaskStatus;
  children: TaskSubtaskDraft[];
};

export function formatEstimatedMinutesLabel(value: string) {
  const minutes = parsePositiveInteger(value);
  if (!minutes) {
    return "Time";
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0 && remainingMinutes > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${remainingMinutes}m`;
}

export function createTaskEditorDraft(task: Task | null, focusToday: boolean, subtasks: DbTaskSubtask[]): TaskEditorDraft {
  function buildTree(parentId: string | null): TaskSubtaskDraft[] {
    return subtasks
      .filter((subtask) => (subtask.parent_subtask_id ?? null) === parentId)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((subtask) => ({
        children: buildTree(subtask.id),
        id: subtask.id,
        status: subtask.status,
        title: subtask.title,
      }));
  }

  return {
    title: task?.title ?? "",
    notes: task?.notes ?? "",
    linkedNoteIds: [],
    status: task?.status ?? "pending",
    priorityLevel: formatTaskPriorityLevel(task ? getTaskPriorityLevel(task) : 0),
    energy: task?.energy ?? "none",
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
    repeatMonthlyMode: task?.repeat_monthly_mode ?? "day_of_month",
    repeatMonthlyOrdinal: task?.repeat_monthly_ordinal ?? null,
    repeatMonthlyWeekday: task?.repeat_monthly_weekday ?? null,
    subtasks: buildTree(null),
  };
}

export function applyTaskEditorDraftOverrides(
  draft: TaskEditorDraft,
  overrides?: Partial<TaskEditorDraft> | null,
) {
  if (!overrides) {
    return draft;
  }

  return {
    ...draft,
    ...overrides,
    linkedNoteIds: overrides.linkedNoteIds ?? draft.linkedNoteIds,
    repeatDaysOfWeek: overrides.repeatDaysOfWeek ?? draft.repeatDaysOfWeek,
    repeatMonthlyOrdinal: overrides.repeatMonthlyOrdinal ?? draft.repeatMonthlyOrdinal,
    subtasks: overrides.subtasks ?? draft.subtasks,
    tags: overrides.tags ?? draft.tags,
  };
}

export function serializeTaskEditorDraft(draft: TaskEditorDraft) {
  return JSON.stringify({
    ...draft,
    linkedNoteIds: [...draft.linkedNoteIds].sort(),
    subtasks: serializeTaskSubtaskDrafts(draft.subtasks),
  });
}

function serializeTaskSubtaskDrafts(subtasks: TaskSubtaskDraft[]): Array<{ children: ReturnType<typeof serializeTaskSubtaskDrafts>; status: TaskSubtaskStatus; title: string }> {
  return subtasks.map((subtask) => ({
    children: serializeTaskSubtaskDrafts(subtask.children),
    status: subtask.status,
    title: subtask.title.trim(),
  }));
}

export function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function parsePositiveInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseDayOfMonth(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 31 ? parsed : null;
}

export function buildDraftSubtasksFromLines(value: string) {
  const roots: TaskSubtaskDraft[] = [];
  const stack: TaskSubtaskDraft[] = [];

  for (const line of value.split("\n")) {
    const rawTitle = line.replace(/^(\s*)[-*]\s+/, "$1").replace(/\s+$/, "");
    const trimmedTitle = rawTitle.trim();
    if (!trimmedTitle) {
      continue;
    }

    const leadingWhitespace = rawTitle.match(/^\s*/)?.[0] ?? "";
    const depth = Math.floor(leadingWhitespace.replace(/\t/g, "  ").length / 2);
    const nextDraft = {
      children: [],
      id: `draft-subtask-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      status: "pending" as const,
      title: trimmedTitle,
    };

    if (depth <= 0 || stack.length === 0) {
      roots.push(nextDraft);
      stack.length = 0;
      stack.push(nextDraft);
      continue;
    }

    while (stack.length > depth) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (!parent) {
      roots.push(nextDraft);
      stack.length = 0;
      stack.push(nextDraft);
      continue;
    }

    parent.children.push(nextDraft);
    stack.push(nextDraft);
  }

  return roots;
}

export function mergeDraftSubtasksWithLines(subtasks: TaskSubtaskDraft[], value: string) {
  const next = buildDraftSubtasksFromLines(value);
  return next.length > 0 ? [...subtasks, ...next] : subtasks;
}
