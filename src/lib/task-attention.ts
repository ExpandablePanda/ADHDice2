import type { Task } from "@/lib/database.types";
import { formatTaskCalendarDate } from "@/lib/task-calendar";
import type { TaskDisplayStatus, TaskDisplayStatusByTaskId } from "@/lib/task-display-status";
import { getTaskPriorityLevel } from "@/lib/task-priority";
import { daysBetween } from "@/lib/task-state-engine/calendar";
import { STANDARD_TASK_BEHAVIOR_POLICY, type TaskBehaviorPolicy } from "@/lib/task-state-engine/behavior-policy";

export type AttentionTaskSections = {
  comingUp: Task[];
  inProgress: Task[];
  needsAction: Task[];
};

export type TaskAttentionReason = "missed" | "due_today" | "overdue";
export type TaskAttentionSection = "needs_action" | "in_progress" | "coming_up" | null;
export type TaskAttentionClassification = {
  reason: TaskAttentionReason | null;
  section: TaskAttentionSection;
};
export type TaskAttentionNotification = {
  description: string;
  reason: TaskAttentionReason;
  title: string;
};

const TERMINAL_TASK_STATUSES = new Set<TaskDisplayStatus>([
  "archived",
  "complete",
  "did_my_best",
  "done",
  "trashed",
]);

function compareTasks(left: Task, right: Task, dueOnByTaskId: Record<string, string | null>) {
  const leftDue = dueOnByTaskId[left.id] ?? left.due_on ?? "9999-12-31";
  const rightDue = dueOnByTaskId[right.id] ?? right.due_on ?? "9999-12-31";
  return leftDue.localeCompare(rightDue)
    || getTaskPriorityLevel(right) - getTaskPriorityLevel(left)
    || left.sort_order - right.sort_order
    || left.title.localeCompare(right.title)
    || left.id.localeCompare(right.id);
}

export function classifyTaskForAttention({
  dueOn: dueOnInput,
  policy: policyInput,
  status: statusInput,
  task,
  todayKey,
}: {
  dueOn?: string | null;
  policy?: Pick<TaskBehaviorPolicy, "needsActionTriggers">;
  status?: TaskDisplayStatus;
  task: Task;
  todayKey: string;
}): TaskAttentionClassification {
  const dueOn = dueOnInput === undefined ? task.due_on : dueOnInput;
  const policy = policyInput ?? STANDARD_TASK_BEHAVIOR_POLICY;
  const status = statusInput ?? task.status;
  if (status === "missed") {
    return policy.needsActionTriggers.includes("missed")
      ? { reason: "missed", section: "needs_action" }
      : { reason: null, section: null };
  }
  if (TERMINAL_TASK_STATUSES.has(status) || status === "unscheduled") {
    return { reason: null, section: null };
  }
  if (dueOn === todayKey) {
    if (policy.needsActionTriggers.includes("due_today")) {
      return { reason: "due_today", section: "needs_action" };
    }
  } else if (dueOn !== null && dueOn < todayKey) {
    if (policy.needsActionTriggers.includes("overdue")) {
      return { reason: "overdue", section: "needs_action" };
    }
  }
  if (status === "in_progress") {
    return { reason: null, section: "in_progress" };
  }
  if (
    dueOn !== null
    && dueOn > todayKey
    && (status === "upcoming" || status === "not_due" || status === "pending" || status === "delayed")
  ) {
    return { reason: null, section: "coming_up" };
  }
  return { reason: null, section: null };
}

export type TaskAttentionProjection = {
  classificationByTaskId: Readonly<Record<string, TaskAttentionClassification>>;
  reasonByTaskId: Readonly<Record<string, TaskAttentionReason>>;
  taskIds: ReadonlySet<string>;
};

export function buildTaskAttentionProjection({
  behaviorPoliciesByTaskId,
  behaviorPolicyLoading = false,
  dueOnByTaskId = {},
  statusesByTaskId,
  tasks,
  todayKey,
}: {
  behaviorPoliciesByTaskId?: Readonly<Record<string, Pick<TaskBehaviorPolicy, "needsActionTriggers">>>;
  behaviorPolicyLoading?: boolean;
  dueOnByTaskId?: Record<string, string | null>;
  statusesByTaskId: TaskDisplayStatusByTaskId;
  tasks: ReadonlyArray<Task>;
  todayKey: string;
}): TaskAttentionProjection {
  if (behaviorPolicyLoading) {
    return {
      classificationByTaskId: {},
      reasonByTaskId: {},
      taskIds: new Set<string>(),
    };
  }

  const classificationByTaskId: Record<string, TaskAttentionClassification> = {};
  const reasonByTaskId: Record<string, TaskAttentionReason> = {};
  const taskIds = new Set<string>();
  for (const task of tasks) {
    const classification = classifyTaskForAttention({
      dueOn: Object.hasOwn(dueOnByTaskId, task.id) ? dueOnByTaskId[task.id] : task.due_on,
      policy: behaviorPoliciesByTaskId?.[task.id],
      status: statusesByTaskId[task.id] ?? task.status,
      task,
      todayKey,
    });
    classificationByTaskId[task.id] = classification;
    if (classification.section === "needs_action" && classification.reason) {
      taskIds.add(task.id);
      reasonByTaskId[task.id] = classification.reason;
    }
  }
  return { classificationByTaskId, reasonByTaskId, taskIds };
}

export function formatTaskAttentionDueDate(dueOn: string) {
  const date = new Date(`${dueOn}T12:00:00`);
  return Number.isNaN(date.getTime()) ? dueOn : formatTaskCalendarDate(date);
}

export function getTaskAttentionNotification(
  reason: TaskAttentionReason,
  dueOn: string | null = null,
): TaskAttentionNotification {
  if (reason === "missed") {
    return {
      description: "This task is currently Missed.",
      reason,
      title: "Missed",
    };
  }
  if (reason === "due_today") {
    return {
      description: "This task is due today and is still unresolved.",
      reason,
      title: "Due Today",
    };
  }
  return {
    description: `This task was due ${dueOn ? formatTaskAttentionDueDate(dueOn) : "an earlier date"} and is still unresolved.`,
    reason,
    title: "Overdue",
  };
}

export function buildAttentionTaskSections({
  behaviorPoliciesByTaskId,
  dueOnByTaskId = {},
  statusesByTaskId,
  tasks,
  todayKey,
}: {
  dueOnByTaskId?: Record<string, string | null>;
  behaviorPoliciesByTaskId?: Readonly<Record<string, Pick<TaskBehaviorPolicy, "needsActionTriggers">>>;
  statusesByTaskId: TaskDisplayStatusByTaskId;
  tasks: ReadonlyArray<Task>;
  todayKey: string;
}): AttentionTaskSections {
  const needsAction: Task[] = [];
  const inProgress: Task[] = [];
  const comingUp: Task[] = [];

  for (const task of tasks) {
    const status = statusesByTaskId[task.id] ?? task.status;
    const dueOn = dueOnByTaskId[task.id] ?? task.due_on;
    const classification = classifyTaskForAttention({
      dueOn,
      policy: behaviorPoliciesByTaskId?.[task.id],
      status,
      task,
      todayKey,
    });
    if (classification.section === "needs_action") {
      needsAction.push(task);
      continue;
    }
    if (status === "in_progress") {
      inProgress.push(task);
      continue;
    }
    if (
      !TERMINAL_TASK_STATUSES.has(status)
      && dueOn !== null
      && dueOn > todayKey
      && (status === "upcoming" || status === "not_due" || status === "pending" || status === "delayed")
    ) {
      comingUp.push(task);
    }
  }

  needsAction.sort((left, right) => compareTasks(left, right, dueOnByTaskId));
  inProgress.sort((left, right) => left.sort_order - right.sort_order || left.title.localeCompare(right.title) || left.id.localeCompare(right.id));
  comingUp.sort((left, right) => compareTasks(left, right, dueOnByTaskId));
  return { comingUp, inProgress, needsAction };
}

export function formatAttentionTaskTiming(
  task: Task,
  status: TaskDisplayStatus,
  todayKey: string,
  dueOn: string | null = task.due_on,
) {
  if (status === "missed") return "Missed";
  if (!dueOn) return status === "in_progress" ? "In progress" : "No due date";
  const difference = daysBetween(todayKey, dueOn);
  if (difference < 0) return `${Math.abs(difference)} day${Math.abs(difference) === 1 ? "" : "s"} overdue`;
  if (difference === 0) return "Due today";
  if (difference === 1) return "Due tomorrow";
  return `Due in ${difference} days`;
}
