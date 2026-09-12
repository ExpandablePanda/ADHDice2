import type { Task } from "@/lib/database.types";
import type { TaskDisplayStatus, TaskDisplayStatusByTaskId } from "@/lib/task-display-status";
import { getTaskPriorityLevel } from "@/lib/task-priority";
import { daysBetween } from "@/lib/task-state-engine/calendar";
import { STANDARD_TASK_BEHAVIOR_POLICY, type TaskBehaviorPolicy } from "@/lib/task-state-engine/behavior-policy";

export type AttentionTaskSections = {
  comingUp: Task[];
  inProgress: Task[];
  needsAction: Task[];
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

function isNeedsActionTask(
  task: Task,
  status: TaskDisplayStatus,
  dueOn: string | null,
  todayKey: string,
  policy: Pick<TaskBehaviorPolicy, "needsActionTriggers"> = STANDARD_TASK_BEHAVIOR_POLICY,
) {
  if (status === "missed") {
    return policy.needsActionTriggers.includes("missed");
  }
  if (TERMINAL_TASK_STATUSES.has(status) || status === "unscheduled") {
    return false;
  }
  if (dueOn === todayKey) return policy.needsActionTriggers.includes("due_today");
  if (dueOn !== null && dueOn < todayKey) return policy.needsActionTriggers.includes("overdue");
  return false;
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
    if (isNeedsActionTask(task, status, dueOn, todayKey, behaviorPoliciesByTaskId?.[task.id])) {
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
