import type {
  AgentPlanMetaPill,
  AgentPlanStatus,
  AgentPlanSubtaskItem,
  AgentPlanTaskItem,
} from "@/components/ui/agent-plan";
import type { Task, TaskHistory as DbTaskHistory, TaskStatus, TaskSubtask as DbTaskSubtask, TaskSubtaskStatus } from "@/lib/database.types";
import type { TaskBucketContext } from "@/lib/task-buckets";
import { getTaskBucket, isTaskOpen } from "@/lib/task-buckets";
import { formatTaskDueLabel, getListPriorityLabel, getTaskDisplayStatus, isOverdue } from "@/lib/task-cockpit";
import type { TaskEditorLinkedNote } from "@/lib/task-notes";
import type { TaskListDefinition } from "@/lib/task-lists";
import { formatActualSecondsLabel, formatRepeatSummary } from "@/lib/task-formatting";
import { computeTaskSpecificHistoryStats } from "@/lib/task-history";

function formatEnergyLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatEstimatedMinutesLabel(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "No estimate";
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function isClosedSubtaskStatus(status: TaskSubtaskStatus) {
  return status === "done" || status === "did_my_best";
}

export function toAgentPlanStatus(status: TaskStatus | TaskSubtaskStatus): AgentPlanStatus {
  if (status === "in_progress" || status === "done" || status === "missed" || status === "did_my_best" || status === "upcoming" || status === "not_due" || status === "archived") {
    return status;
  }

  return "pending";
}

export function buildAgentPlanSubtaskItems(subtasks: DbTaskSubtask[], parentId: string | null = null): AgentPlanSubtaskItem[] {
  return subtasks
    .filter((subtask) => (subtask.parent_subtask_id ?? null) === parentId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((subtask) => ({
      children: buildAgentPlanSubtaskItems(subtasks, subtask.id),
      id: subtask.id,
      status: toAgentPlanStatus(subtask.status),
      title: subtask.title,
    }));
}

function buildAgentPlanMetadata(
  task: Task,
  context: {
    bucketContext: TaskBucketContext;
    bucketLabels: Record<string, string>;
    focusedTaskIdSet: Set<string>;
    listDefinitions: TaskListDefinition[];
    listMemberships: Array<{ id: string; isManual: boolean }>;
  },
) {
  const primaryListLabel = context.listMemberships
    .map((membership) => context.listDefinitions.find((list) => list.id === membership.id)?.name ?? null)
    .filter((value): value is string => Boolean(value))
    .slice(0, 2)
    .join(", ");
  const metadata: AgentPlanTaskItem["metadata"] = [
    {
      label: "Lists",
      value: primaryListLabel || context.bucketLabels[getTaskBucket(task, context.bucketContext)] || "All",
    },
    {
      label: "Due",
      value: formatTaskDueLabel(task),
    },
    {
      label: "Priority",
      value: getListPriorityLabel(task, context.focusedTaskIdSet),
    },
    {
      label: "Energy",
      value: formatEnergyLabel(task.energy),
    },
  ];

  if (task.estimated_minutes) {
    metadata.push({
      label: "Estimated Time",
      value: formatEstimatedMinutesLabel(task.estimated_minutes),
    });
  }

  if (task.actual_seconds > 0) {
    metadata.push({
      label: "Actual Time",
      value: formatActualSecondsLabel(task.actual_seconds),
    });
  }

  const repeatSummary = formatRepeatSummary(task);
  if (repeatSummary) {
    metadata.push({
      label: "Repeat",
      value: repeatSummary,
    });
  }

  return metadata;
}

function buildAgentPlanMetaPills(
  task: Task,
  subtasks: DbTaskSubtask[],
  context: {
    focusedTaskIdSet: Set<string>;
  },
): AgentPlanMetaPill[] {
  const pills: AgentPlanMetaPill[] = [];

  if (subtasks.length > 0) {
    const completedCount = subtasks.filter((subtask) => isClosedSubtaskStatus(subtask.status)).length;
    pills.push({
      label: `${completedCount}/${subtasks.length} steps`,
      tone: completedCount === subtasks.length ? "success" : "neutral",
    });
  }

  if (context.focusedTaskIdSet.has(task.id)) {
    pills.push({ label: "Focus", tone: "accent" });
  }

  if (task.repeat_frequency !== "none") {
    pills.push({ label: "Repeats", tone: "warning" });
  }

  if (task.status === "missed") {
    pills.push({ label: "Missed", tone: "danger" });
  } else if (isTaskOpen(task) && isOverdue(task.due_on)) {
    pills.push({ label: "Overdue", tone: "danger" });
  }

  return pills;
}

function buildAgentPlanRowChips(
  task: Task,
  subtasks: DbTaskSubtask[],
  context: {
    focusedTaskIdSet: Set<string>;
  },
): AgentPlanMetaPill[] {
  const chips: AgentPlanMetaPill[] = [];
  const seenLabels = new Set<string>();
  const dueLabel = formatTaskDueLabel(task);
  const repeatSummary = formatRepeatSummary(task);
  const pushChip = (chip: AgentPlanMetaPill) => {
    if (seenLabels.has(chip.label)) {
      return;
    }
    seenLabels.add(chip.label);
    chips.push(chip);
  };

  if (dueLabel !== "No date") {
    pushChip({
      label: dueLabel,
      tone: isTaskOpen(task) && isOverdue(task.due_on) ? "danger" : "neutral",
    });
  }

  if (task.is_urgent) {
    pushChip({ label: "Urgent", tone: "danger" });
  }

  if (task.is_important) {
    pushChip({ label: "Important", tone: "warning" });
  }

  if (context.focusedTaskIdSet.has(task.id)) {
    pushChip({ label: "Focus", tone: "accent" });
  }

  if (repeatSummary) {
    pushChip({ label: repeatSummary, tone: "warning" });
  }

  if (subtasks.length > 0) {
    const completedCount = subtasks.filter((subtask) => isClosedSubtaskStatus(subtask.status)).length;
    pushChip({
      label: `${completedCount}/${subtasks.length} steps`,
      tone: completedCount === subtasks.length ? "success" : "neutral",
    });
  }

  return chips;
}

export function getTaskListTone(listId: string): AgentPlanMetaPill["tone"] {
  if (listId === "focus") return "accent";
  if (listId === "urgent" || listId === "missed") return "danger";
  if (listId === "important" || listId === "recurring") return "warning";
  if (listId === "done" || listId === "quick_wins") return "success";
  return "neutral";
}

export function buildAgentPlanTaskItem(
  task: Task,
  context: {
    bucketContext: TaskBucketContext;
    bucketLabels: Record<string, string>;
    focusedTaskIdSet: Set<string>;
    linkedNotes: TaskEditorLinkedNote[];
    listDefinitions: TaskListDefinition[];
    listMemberships: Array<{ id: string; isManual: boolean }>;
    subtasks: DbTaskSubtask[];
    taskHistory?: DbTaskHistory[];
    todayDateKey?: string;
  },
): AgentPlanTaskItem {
  const taskHistoryStats = computeTaskSpecificHistoryStats(task, context.taskHistory ?? [], context.todayDateKey ?? "");

  return {
    actualSeconds: task.actual_seconds ?? 0,
    bucket: getTaskBucket(task, context.bucketContext),
    dueOn: task.due_on,
    dueTime: task.due_time,
    estimatedMinutes: task.estimated_minutes ?? null,
    externalLinkLabel: task.external_link_label ?? null,
    externalLinkUrl: task.external_link_url ?? null,
    id: task.id,
    isFocused: context.focusedTaskIdSet.has(task.id),
    isImportant: task.is_important,
    isUrgent: task.is_urgent,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    linkedNotes: context.linkedNotes.map((note) => ({
      body: note.body,
      id: note.id,
      title: note.title,
      updatedAt: note.updated_at,
    })),
    lists: [...context.listDefinitions]
      .flatMap<AgentPlanTaskItem["lists"][number]>((listDefinition) => {
        const membership = context.listMemberships.find((entry) => entry.id === listDefinition.id);
        if (!membership) {
          return [];
        }
        return [{
          id: membership.id,
          isManual: membership.isManual,
          label: listDefinition.name,
          tone: getTaskListTone(membership.id),
        }];
      }),
    metadata: buildAgentPlanMetadata(task, context),
    metaPills: buildAgentPlanMetaPills(task, context.subtasks, context),
    notes: task.notes ?? "",
    rowChips: buildAgentPlanRowChips(task, context.subtasks, context),
    currentStreak: taskHistoryStats.currentStreak,
    missedStreak: taskHistoryStats.missedStreak,
    repeatFrequency: task.repeat_frequency,
    repeatInterval: Math.max(1, task.repeat_interval ?? 1),
    repeatDaysOfWeek: task.repeat_days_of_week ?? [],
    repeatDayOfMonth: task.repeat_day_of_month ?? null,
    subtasksAutoReset: task.subtasks_auto_reset ?? false,
    status: toAgentPlanStatus(getTaskDisplayStatus(task)),
    subtasks: buildAgentPlanSubtaskItems(context.subtasks),
    tags: task.tags ?? [],
    title: task.title,
  };
}
