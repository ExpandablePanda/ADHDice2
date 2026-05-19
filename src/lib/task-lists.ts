import type { Task, TaskEnergy, TaskRepeatFrequency, TaskStatus } from "@/lib/database.types";

export type BuiltInTaskListId =
  | "inbox"
  | "today"
  | "focus"
  | "urgent"
  | "important"
  | "quick_wins"
  | "recurring"
  | "waiting"
  | "later"
  | "done"
  | "missed";

export type TaskListId = BuiltInTaskListId | `list:${string}`;
export type TaskListType = "system" | "smart" | "custom";
export type TaskListMembershipMode = "hybrid" | "manual" | "rules";

export type TaskListRule =
  | { field: "status"; op: "is" | "is_not"; value: TaskStatus | TaskStatus[] }
  | { field: "is_urgent"; op: "is" | "is_not"; value: boolean }
  | { field: "is_important"; op: "is" | "is_not"; value: boolean }
  | { field: "focus"; op: "is" | "is_not"; value: boolean }
  | { field: "repeat"; op: "is" | "is_not"; value: boolean }
  | { field: "energy"; op: "is" | "is_not"; value: TaskEnergy | TaskEnergy[] }
  | { field: "due"; op: "is_empty" | "is_overdue" | "is_today" | "is_future" | "is_not_today" | "is_not_overdue" }
  | { field: "date_added"; op: "is_today" | "is_not_today" };

export type TaskListRuleGroup = {
  combinator: "all" | "any";
  rules: TaskListRule[];
};

export type TaskListDefinition = {
  description: string;
  id: TaskListId;
  isDeletable: boolean;
  isEditable: boolean;
  isVisible: boolean;
  membershipMode: TaskListMembershipMode;
  name: string;
  rules: TaskListRuleGroup | null;
  sortOrder: number;
  type: TaskListType;
};

export type TaskListManualMembership = {
  created_at: string;
  id: string;
  list_id: TaskListId;
  task_id: string;
  user_id: string;
};

export type TaskListMembership = {
  id: TaskListId;
  isManual: boolean;
  source: "manual" | "rule";
};

export type TaskListEvaluationContext = {
  focusedTaskIds: Set<string>;
  isDueToday: (date: string | null) => boolean;
  isLater: (date: string | null) => boolean;
  isOpen: (task: Task) => boolean;
  isOverdue: (date: string | null) => boolean;
  manualMembershipsByTaskId: Record<string, TaskListId[]>;
};

export const BUILT_IN_TASK_LIST_IDS: BuiltInTaskListId[] = [
  "inbox",
  "today",
  "focus",
  "urgent",
  "important",
  "quick_wins",
  "recurring",
  "waiting",
  "later",
  "done",
  "missed",
];

export function getBuiltInTaskLists(): TaskListDefinition[] {
  return [
    {
      description: "Fresh captures and under-specified tasks that still need triage.",
      id: "inbox",
      isDeletable: false,
      isEditable: true,
      isVisible: true,
      membershipMode: "rules",
      name: "Inbox",
      rules: null,
      sortOrder: 0,
      type: "system",
    },
    {
      description: "Work realistically in play today through rules or manual planning.",
      id: "today",
      isDeletable: false,
      isEditable: true,
      isVisible: true,
      membershipMode: "hybrid",
      name: "Today",
      rules: {
        combinator: "any",
        rules: [
          { field: "status", op: "is", value: "in_progress" },
          { field: "due", op: "is_today" },
        ],
      },
      sortOrder: 1,
      type: "system",
    },
    {
      description: "Tasks marked for focus today.",
      id: "focus",
      isDeletable: false,
      isEditable: true,
      isVisible: true,
      membershipMode: "rules",
      name: "Focus",
      rules: {
        combinator: "all",
        rules: [{ field: "focus", op: "is", value: true }],
      },
      sortOrder: 2,
      type: "smart",
    },
    {
      description: "Time-sensitive or consequence-heavy work.",
      id: "urgent",
      isDeletable: false,
      isEditable: true,
      isVisible: true,
      membershipMode: "rules",
      name: "Urgent",
      rules: {
        combinator: "all",
        rules: [{ field: "is_urgent", op: "is", value: true }],
      },
      sortOrder: 3,
      type: "smart",
    },
    {
      description: "Important work that deserves attention even if it is not urgent.",
      id: "important",
      isDeletable: false,
      isEditable: true,
      isVisible: true,
      membershipMode: "rules",
      name: "Important",
      rules: {
        combinator: "all",
        rules: [{ field: "is_important", op: "is", value: true }],
      },
      sortOrder: 4,
      type: "smart",
    },
    {
      description: "Manual list for short, momentum-building tasks.",
      id: "quick_wins",
      isDeletable: false,
      isEditable: true,
      isVisible: true,
      membershipMode: "manual",
      name: "Quick Wins",
      rules: null,
      sortOrder: 5,
      type: "system",
    },
    {
      description: "Tasks that repeat on a cadence.",
      id: "recurring",
      isDeletable: false,
      isEditable: true,
      isVisible: true,
      membershipMode: "rules",
      name: "Recurring",
      rules: {
        combinator: "all",
        rules: [{ field: "repeat", op: "is", value: true }],
      },
      sortOrder: 6,
      type: "system",
    },
    {
      description: "Blocked or waiting on another person or dependency.",
      id: "waiting",
      isDeletable: false,
      isEditable: true,
      isVisible: true,
      membershipMode: "rules",
      name: "Waiting",
      rules: {
        combinator: "all",
        rules: [{ field: "status", op: "is", value: "upcoming" }],
      },
      sortOrder: 7,
      type: "system",
    },
    {
      description: "Manual list for valid work intentionally out of today.",
      id: "later",
      isDeletable: false,
      isEditable: true,
      isVisible: true,
      membershipMode: "manual",
      name: "Later",
      rules: null,
      sortOrder: 8,
      type: "system",
    },
    {
      description: "Completed tasks and closed loops.",
      id: "done",
      isDeletable: false,
      isEditable: true,
      isVisible: true,
      membershipMode: "rules",
      name: "Done",
      rules: {
        combinator: "any",
        rules: [
          { field: "status", op: "is", value: "done" },
          { field: "status", op: "is", value: "did_my_best" },
        ],
      },
      sortOrder: 9,
      type: "system",
    },
    {
      description: "Tasks that slipped and need a new decision.",
      id: "missed",
      isDeletable: false,
      isEditable: true,
      isVisible: true,
      membershipMode: "rules",
      name: "Missed",
      rules: {
        combinator: "all",
        rules: [{ field: "status", op: "is", value: "missed" }],
      },
      sortOrder: 10,
      type: "system",
    },
  ];
}

export function buildManualMembershipMap(
  manualMemberships: TaskListManualMembership[],
  compatibilityRouting: Record<string, BuiltInTaskListId | undefined> = {},
) {
  const next: Record<string, TaskListId[]> = {};

  for (const membership of manualMemberships) {
    if (!next[membership.task_id]) {
      next[membership.task_id] = [];
    }
    if (!next[membership.task_id].includes(membership.list_id)) {
      next[membership.task_id].push(membership.list_id);
    }
  }

  for (const [taskId, listId] of Object.entries(compatibilityRouting)) {
    if (!listId || listId === "inbox") {
      continue;
    }
    if (!next[taskId]) {
      next[taskId] = [];
    }
    if (!next[taskId].includes(listId)) {
      next[taskId].push(listId);
    }
  }

  return next;
}

export function evaluateTaskListMemberships(
  task: Task,
  lists: TaskListDefinition[],
  context: TaskListEvaluationContext,
) {
  const memberships = new Map<TaskListId, TaskListMembership>();
  const manualListIds = context.manualMembershipsByTaskId[task.id] ?? [];

  for (const listId of manualListIds) {
    memberships.set(listId, {
      id: listId,
      isManual: true,
      source: "manual",
    });
  }

  for (const list of lists) {
    if (!list.rules) {
      continue;
    }
    if (!context.isOpen(task) && list.id !== "done") {
      continue;
    }
    if (matchesTaskListRules(task, list.rules, context)) {
      const current = memberships.get(list.id);
      memberships.set(list.id, {
        id: list.id,
        isManual: current?.isManual ?? false,
        source: "rule",
      });
    }
  }

  if (shouldAppearInInbox(task, memberships, context)) {
    const current = memberships.get("inbox");
    memberships.set("inbox", {
      id: "inbox",
      isManual: current?.isManual ?? false,
      source: "rule",
    });
  }

  return Array.from(memberships.values());
}

export function buildTaskListCounts(
  tasks: Task[],
  lists: TaskListDefinition[],
  context: TaskListEvaluationContext,
) {
  const counts = lists.reduce<Record<string, number>>((accumulator, list) => {
    accumulator[list.id] = 0;
    return accumulator;
  }, {});

  for (const task of tasks) {
    for (const membership of evaluateTaskListMemberships(task, lists, context)) {
      counts[membership.id] = (counts[membership.id] ?? 0) + 1;
    }
  }

  return counts;
}

export function taskBelongsToList(
  task: Task,
  selectedListId: string,
  lists: TaskListDefinition[],
  context: TaskListEvaluationContext,
) {
  return evaluateTaskListMemberships(task, lists, context).some((membership) => membership.id === selectedListId);
}

export function matchesTaskListRules(
  task: Task,
  group: TaskListRuleGroup,
  context: TaskListEvaluationContext,
) {
  const matches = group.rules.map((rule) => matchesTaskListRule(task, rule, context));
  return group.combinator === "all" ? matches.every(Boolean) : matches.some(Boolean);
}

export function parseTaskListRules(value: unknown): TaskListRuleGroup | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TaskListRuleGroup>;
  if ((candidate.combinator !== "all" && candidate.combinator !== "any") || !Array.isArray(candidate.rules)) {
    return null;
  }

  const rules = candidate.rules.filter(isTaskListRule);
  if (rules.length !== candidate.rules.length) {
    return null;
  }

  return {
    combinator: candidate.combinator,
    rules,
  };
}

export function isBuiltInTaskListId(value: string): value is BuiltInTaskListId {
  return BUILT_IN_TASK_LIST_IDS.includes(value as BuiltInTaskListId);
}

function shouldAppearInInbox(
  task: Task,
  memberships: Map<TaskListId, TaskListMembership>,
  context: TaskListEvaluationContext,
) {
  if (!context.isOpen(task) || task.status === "archived") {
    return false;
  }

  const hasManualMembership = (context.manualMembershipsByTaskId[task.id] ?? []).length > 0;
  if (hasManualMembership) {
    return false;
  }

  const hasNonInboxRuleMatch = Array.from(memberships.values()).some((membership) =>
    membership.id !== "inbox" && membership.source === "rule",
  );
  return !hasNonInboxRuleMatch;
}

function matchesTaskListRule(
  task: Task,
  rule: TaskListRule,
  context: TaskListEvaluationContext,
) {
  switch (rule.field) {
    case "status": {
      const values = Array.isArray(rule.value) ? rule.value : [rule.value];
      return rule.op === "is" ? values.includes(task.status) : !values.includes(task.status);
    }
    case "is_urgent":
      return rule.op === "is" ? task.is_urgent === rule.value : task.is_urgent !== rule.value;
    case "is_important":
      return rule.op === "is" ? task.is_important === rule.value : task.is_important !== rule.value;
    case "focus":
      return rule.op === "is"
        ? context.focusedTaskIds.has(task.id) === rule.value
        : context.focusedTaskIds.has(task.id) !== rule.value;
    case "repeat":
      return rule.op === "is"
        ? (task.repeat_frequency !== "none") === rule.value
        : (task.repeat_frequency !== "none") !== rule.value;
    case "energy": {
      const values = Array.isArray(rule.value) ? rule.value : [rule.value];
      return rule.op === "is" ? values.includes(task.energy) : !values.includes(task.energy);
    }
    case "due":
      if (rule.op === "is_empty") return !task.due_on;
      if (rule.op === "is_today") return context.isDueToday(task.due_on);
      if (rule.op === "is_not_today") return !context.isDueToday(task.due_on);
      if (rule.op === "is_overdue") return context.isOverdue(task.due_on);
      if (rule.op === "is_not_overdue") return !context.isOverdue(task.due_on);
      return Boolean(task.due_on) && context.isLater(task.due_on);
    case "date_added": {
      const createdDate = task.created_at.slice(0, 10);
      if (rule.op === "is_today") return context.isDueToday(createdDate);
      return !context.isDueToday(createdDate);
    }
    default:
      return false;
  }
}

function isTaskListRule(value: unknown): value is TaskListRule {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TaskListRule>;
  if (candidate.field === "status") {
    return (candidate.op === "is" || candidate.op === "is_not")
      && (typeof candidate.value === "string" || (Array.isArray(candidate.value) && candidate.value.every((item) => typeof item === "string")));
  }
  if (candidate.field === "is_urgent" || candidate.field === "is_important" || candidate.field === "focus" || candidate.field === "repeat") {
    return (candidate.op === "is" || candidate.op === "is_not") && typeof candidate.value === "boolean";
  }
  if (candidate.field === "energy") {
    return (candidate.op === "is" || candidate.op === "is_not")
      && (typeof candidate.value === "string" || (Array.isArray(candidate.value) && candidate.value.every((item) => typeof item === "string")));
  }
  if (candidate.field === "due") {
    return candidate.op === "is_empty"
      || candidate.op === "is_overdue"
      || candidate.op === "is_today"
      || candidate.op === "is_future"
      || candidate.op === "is_not_today"
      || candidate.op === "is_not_overdue";
  }
  if (candidate.field === "date_added") {
    return candidate.op === "is_today" || candidate.op === "is_not_today";
  }
  return false;
}

export function isTaskListRepeatEnabled(frequency: TaskRepeatFrequency) {
  return frequency !== "none";
}
