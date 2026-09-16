import type { Task } from "@/lib/database.types";
import { formatTaskCalendarDate } from "@/lib/task-calendar";
import type { TaskDisplayStatus, TaskDisplayStatusByTaskId } from "@/lib/task-display-status";
import { daysBetween } from "@/lib/task-state-engine/calendar";
import type { TaskBehaviorPolicy } from "@/lib/task-state-engine/behavior-policy";
import type { TaskListRuleGroup } from "@/lib/task-lists";

export type TaskAttentionReason = "missed" | "due_today" | "overdue" | "attention_rule";
export type TaskAttentionBehaviorPolicy = Pick<TaskBehaviorPolicy, "missedStreakOnUnhandled">;

export type TaskAttentionProjection = {
  attentionEligibleTaskIds: ReadonlySet<string>;
};

const TERMINAL_TASK_STATUSES = new Set<TaskDisplayStatus>([
  "archived",
  "complete",
  "did_my_best",
  "done",
  "trashed",
  "unscheduled",
]);

/**
 * Project only the policy-derived Attention eligibility gate. Final list
 * membership remains owned by the canonical Task List rule evaluator.
 */
export function buildTaskAttentionProjection({
  behaviorPoliciesByTaskId,
  behaviorPolicyLoading = false,
  statusesByTaskId,
  tasks,
}: {
  behaviorPoliciesByTaskId?: Readonly<Record<string, TaskAttentionBehaviorPolicy>>;
  behaviorPolicyLoading?: boolean;
  statusesByTaskId: TaskDisplayStatusByTaskId;
  tasks: ReadonlyArray<Task>;
}): TaskAttentionProjection {
  if (behaviorPolicyLoading) {
    return { attentionEligibleTaskIds: new Set<string>() };
  }

  const attentionEligibleTaskIds = new Set<string>();
  for (const task of tasks) {
    const policy = behaviorPoliciesByTaskId?.[task.id];
    const status = statusesByTaskId[task.id] ?? task.status;
    if (!policy || policy.missedStreakOnUnhandled !== "ignore" || TERMINAL_TASK_STATUSES.has(status)) {
      continue;
    }
    attentionEligibleTaskIds.add(task.id);
  }
  return { attentionEligibleTaskIds };
}

export function formatTaskAttentionDueDate(dueOn: string) {
  const date = new Date(`${dueOn}T12:00:00`);
  return Number.isNaN(date.getTime()) ? dueOn : formatTaskCalendarDate(date);
}

export function getTaskAttentionNotification(
  reason: TaskAttentionReason,
  dueOn: string | null = null,
) {
  if (reason === "missed") {
    return {
      description: "This task is currently Missed.",
      reason,
      title: "Missed",
    } as const;
  }
  if (reason === "due_today") {
    return {
      description: "This task is due today and is still unresolved.",
      reason,
      title: "Due Today",
    } as const;
  }
  if (reason === "overdue") {
    return {
      description: `This task was due ${dueOn ? formatTaskAttentionDueDate(dueOn) : "an earlier date"} and is still unresolved.`,
      reason,
      title: "Overdue",
    } as const;
  }
  return {
    description: "Matches your Attention list rules.",
    reason,
    title: "Attention Rule",
  } as const;
}

/** Choose copy only after final Attention membership has already been derived. */
export function buildTaskAttentionReasonMap({
  attentionRuleGroup,
  dueOnByTaskId = {},
  listMembershipsByTaskId,
  statusesByTaskId,
  tasks,
  todayKey,
}: {
  /** Used only to avoid claiming a due/missed explanation for another rule. */
  attentionRuleGroup?: TaskListRuleGroup | null;
  dueOnByTaskId?: Record<string, string | null>;
  listMembershipsByTaskId: Readonly<Record<string, ReadonlyArray<{ id: string }>>>;
  statusesByTaskId: TaskDisplayStatusByTaskId;
  tasks: ReadonlyArray<Task>;
  todayKey: string;
}): Readonly<Record<string, TaskAttentionReason>> {
  const reasonByTaskId: Record<string, TaskAttentionReason> = {};
  const canExplainDueFacts = attentionRuleGroup === undefined || attentionRuleGroup.rules.some(({ rule }) =>
    rule.field === "due" && (rule.op === "is_overdue" || rule.op === "is_today"),
  );
  const canExplainMissedFact = attentionRuleGroup === undefined || attentionRuleGroup.rules.some(({ rule }) =>
    rule.field === "status" && rule.op === "is" && (Array.isArray(rule.value) ? rule.value.includes("missed") : rule.value === "missed"),
  );
  for (const task of tasks) {
    if (!listMembershipsByTaskId[task.id]?.some((membership) => membership.id === "attention")) {
      continue;
    }
    const status = statusesByTaskId[task.id] ?? task.status;
    const dueOn = Object.hasOwn(dueOnByTaskId, task.id) ? dueOnByTaskId[task.id] : task.due_on;
    reasonByTaskId[task.id] = canExplainDueFacts && dueOn === todayKey
      ? "due_today"
      : canExplainDueFacts && dueOn !== null && dueOn < todayKey
        ? "overdue"
        : canExplainMissedFact && status === "missed"
          ? "missed"
          : "attention_rule";
  }
  return reasonByTaskId;
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
