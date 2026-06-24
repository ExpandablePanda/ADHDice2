import type { Task, TaskEnergy, TaskRepeatFrequency, TaskStatus } from "@/lib/database.types";
import { buildEmptyTaskHistoryFacts, type TaskHistoryFacts, type TaskHistoryStreakPreset, type TaskHistoryWindowPreset } from "@/lib/task-history";

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
  | { field: "list"; op: "is" | "is_not"; value: TaskListId }
  | { field: "steps"; op: "is" | "is_not"; value: boolean }
  | { field: "is_urgent"; op: "is" | "is_not"; value: boolean }
  | { field: "is_important"; op: "is" | "is_not"; value: boolean }
  | { field: "focus"; op: "is" | "is_not"; value: boolean }
  | { field: "repeat"; op: "is" | "is_not"; value: boolean }
  | { field: "energy"; op: "is" | "is_not"; value: TaskEnergy | TaskEnergy[] }
  | { field: "streak"; op: "is" | "is_not"; value: "0" | "over_0" | "over_7" | "over_14" | "over_30" }
  | { field: "due"; op: "is_empty" | "is_overdue" | "is_today" | "is_tomorrow" | "is_future" | "is_not_today" | "is_not_overdue" }
  | { field: "date_added"; op: "is_today" | "is_not_today" }
  | { field: "completed_history"; op: "is_today" | "within_last" | "last_within_last" | "has_ever"; value?: TaskHistoryWindowPreset }
  | { field: "missed_history"; op: "is_today" | "within_last" | "last_within_last" | "has_ever"; value?: TaskHistoryWindowPreset }
  | { field: "completed_streak"; op: "equals" | "at_least" | "less_than"; value: TaskHistoryStreakPreset }
  | { field: "missed_streak"; op: "equals" | "at_least" | "less_than"; value: TaskHistoryStreakPreset };

export type TaskListRuleConnector = "and" | "or";
export type TaskListRuleRow = {
  connector?: TaskListRuleConnector;
  rule: TaskListRule;
};

export type TaskListRuleGroup = {
  rules: TaskListRuleRow[];
};

type TaskListRuleStreakValue = Extract<TaskListRule, { field: "streak" }>["value"];

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
  currentStreakByTaskId: Record<string, number>;
  focusedTaskIds: Set<string>;
  hasStepsByTaskId: Record<string, boolean>;
  isDueToday: (date: string | null) => boolean;
  isDueTomorrow: (date: string | null) => boolean;
  isLater: (date: string | null) => boolean;
  isOpen: (task: Task) => boolean;
  isOverdue: (date: string | null) => boolean;
  historyFactsByTaskId: Record<string, TaskHistoryFacts>;
  manualMembershipsByTaskId: Record<string, TaskListId[]>;
};

export type TaskListEvaluationPerf = {
  inboxCheckMs: number;
  manualMembershipCount: number;
  manualMembershipSeedMs: number;
  matchedRuleMemberships: number;
  ruleEvaluationMs: number;
  ruleListChecks: number;
  taskCount: number;
};

type TaskListLookup = {
  listById: Map<TaskListId, TaskListDefinition>;
  nonInboxRuleLists: TaskListDefinition[];
  ruleLists: TaskListDefinition[];
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
      description: "Tasks that are truly due today and still active.",
      id: "today",
      isDeletable: false,
      isEditable: true,
      isVisible: true,
      membershipMode: "rules",
      name: "Today",
      rules: {
        rules: [
          { rule: { field: "due", op: "is_today" } },
          { connector: "and", rule: { field: "status", op: "is_not", value: "missed" } },
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
        rules: [{ rule: { field: "focus", op: "is", value: true } }],
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
        rules: [{ rule: { field: "is_urgent", op: "is", value: true } }],
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
        rules: [{ rule: { field: "is_important", op: "is", value: true } }],
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
        rules: [{ rule: { field: "repeat", op: "is", value: true } }],
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
        rules: [{ rule: { field: "status", op: "is", value: "upcoming" } }],
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
        rules: [
          { rule: { field: "status", op: "is", value: "done" } },
          { connector: "or", rule: { field: "status", op: "is", value: "did_my_best" } },
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
        rules: [{ rule: { field: "status", op: "is", value: "missed" } }],
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
  perf?: TaskListEvaluationPerf,
) {
  const memberships = new Map<TaskListId, TaskListMembership>();
  const evaluationCache = new Map<string, boolean>();
  const lookup = buildTaskListLookup(lists);
  const manualListIds = context.manualMembershipsByTaskId[task.id] ?? [];
  const canMeasure = Boolean(perf) && typeof performance !== "undefined";

  if (perf) {
    perf.taskCount += 1;
  }

  const manualSeedStartedAt = canMeasure ? performance.now() : 0;
  for (const listId of manualListIds) {
    if (listId === "today") {
      continue;
    }
    memberships.set(listId, {
      id: listId,
      isManual: true,
      source: "manual",
    });
  }
  if (perf) {
    perf.manualMembershipCount += manualListIds.length;
    if (canMeasure) {
      perf.manualMembershipSeedMs += performance.now() - manualSeedStartedAt;
    }
  }

  const manualRuleMembershipCount = memberships.size;
  const ruleEvaluationStartedAt = canMeasure ? performance.now() : 0;
  for (const list of lookup.ruleLists) {
    if (list.id === "inbox") {
      continue;
    }
    const current = memberships.get(list.id);
    if (matchesSpecificListRuleMembership(task, list, lists, context, new Set(), evaluationCache, lookup)) {
      memberships.set(list.id, {
        id: list.id,
        isManual: current?.isManual ?? false,
        source: "rule",
      });
    }
  }
  if (perf) {
    perf.ruleListChecks += lookup.ruleLists.filter((list) => list.id !== "inbox").length;
    perf.matchedRuleMemberships += Math.max(0, memberships.size - manualRuleMembershipCount);
    if (canMeasure) {
      perf.ruleEvaluationMs += performance.now() - ruleEvaluationStartedAt;
    }
  }

  const inboxCheckStartedAt = canMeasure ? performance.now() : 0;
  if (shouldAppearInInbox(task, lists, memberships, context, new Set(["inbox"]), evaluationCache, lookup)) {
    const current = memberships.get("inbox");
    memberships.set("inbox", {
      id: "inbox",
      isManual: current?.isManual ?? false,
      source: "rule",
    });
  }
  if (perf && canMeasure) {
    perf.inboxCheckMs += performance.now() - inboxCheckStartedAt;
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
  return taskBelongsToSpecificList(task, selectedListId as TaskListId, lists, context);
}

export function matchesTaskListRules(
  task: Task,
  group: TaskListRuleGroup,
  lists: TaskListDefinition[],
  context: TaskListEvaluationContext,
  visitedListIds: Set<TaskListId> = new Set(),
  evaluationCache: Map<string, boolean> = new Map(),
  lookup: TaskListLookup = buildTaskListLookup(lists),
): boolean {
  if (group.rules.length === 0) {
    return false;
  }

  let result: boolean = matchesTaskListRule(task, group.rules[0].rule, lists, context, visitedListIds, evaluationCache, lookup);
  for (let index = 1; index < group.rules.length; index += 1) {
    const entry = group.rules[index];
    if (!entry) {
      continue;
    }
    if (entry.connector === "or" ? result : !result) {
      continue;
    }
    const nextValue = matchesTaskListRule(task, entry.rule, lists, context, visitedListIds, evaluationCache, lookup);
    result = entry.connector === "or" ? (result || nextValue) : (result && nextValue);
  }
  return result;
}

export function parseTaskListRules(value: unknown): TaskListRuleGroup | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as { combinator?: "all" | "any"; rules?: unknown[] };
  if (!Array.isArray(candidate.rules)) {
    return null;
  }

  const rowRules = candidate.rules.filter(isTaskListRuleRow);
  if (rowRules.length === candidate.rules.length) {
    return {
      rules: normalizeTaskListRuleRows(rowRules),
    };
  }

  const legacyRules = candidate.rules.filter(isTaskListRule);
  if (legacyRules.length !== candidate.rules.length || (candidate.combinator !== "all" && candidate.combinator !== "any")) {
    return null;
  }

  return {
    rules: legacyRules.map((rule, index) => ({
      connector: index === 0 ? undefined : (candidate.combinator === "any" ? "or" : "and"),
      rule,
    })),
  };
}

export function isBuiltInTaskListId(value: string): value is BuiltInTaskListId {
  return BUILT_IN_TASK_LIST_IDS.includes(value as BuiltInTaskListId);
}

function shouldAppearInInbox(
  task: Task,
  lists: TaskListDefinition[],
  memberships: Map<TaskListId, TaskListMembership>,
  context: TaskListEvaluationContext,
  visitedListIds: Set<TaskListId> = new Set(),
  evaluationCache: Map<string, boolean> = new Map(),
  lookup: TaskListLookup = buildTaskListLookup(lists),
) {
  return matchesInboxMembership(task, lists, context, {
    evaluationCache,
    hasNonInboxRuleMatch: Array.from(memberships.values()).some((membership) =>
      membership.id !== "inbox" && membership.source === "rule",
    ),
    lookup,
    visitedListIds,
  });
}

function matchesTaskListRule(
  task: Task,
  rule: TaskListRule,
  lists: TaskListDefinition[],
  context: TaskListEvaluationContext,
  visitedListIds: Set<TaskListId> = new Set(),
  evaluationCache: Map<string, boolean> = new Map(),
  lookup: TaskListLookup = buildTaskListLookup(lists),
): boolean {
  const matchesStreakThreshold = (value: TaskListRuleStreakValue) => {
    const currentStreak = context.currentStreakByTaskId[task.id] ?? 0;
    if (value === "0") return currentStreak === 0;
    if (value === "over_0") return currentStreak > 0;
    if (value === "over_7") return currentStreak > 7;
    if (value === "over_14") return currentStreak > 14;
    return currentStreak > 30;
  };
  const historyFacts = context.historyFactsByTaskId[task.id] ?? buildEmptyTaskHistoryFacts();
  const matchesPresetStreak = (
    currentValue: number,
    op: Extract<TaskListRule, { field: "completed_streak" | "missed_streak" }>["op"],
    value: TaskHistoryStreakPreset,
  ) => {
    const threshold = Number.parseInt(value, 10);
    if (op === "equals") return currentValue === threshold;
    if (op === "at_least") return currentValue >= threshold;
    return currentValue < threshold;
  };

  switch (rule.field) {
    case "status": {
      const values = Array.isArray(rule.value) ? rule.value : [rule.value];
      return rule.op === "is" ? values.includes(task.status) : !values.includes(task.status);
    }
    case "list": {
      const belongsToList = taskBelongsToSpecificList(task, rule.value, lists, context, visitedListIds, evaluationCache, lookup);
      return rule.op === "is" ? belongsToList : !belongsToList;
    }
    case "steps": {
      const hasSteps = context.hasStepsByTaskId[task.id] === true;
      return rule.op === "is" ? hasSteps === rule.value : hasSteps !== rule.value;
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
    case "streak":
      return rule.op === "is" ? matchesStreakThreshold(rule.value) : !matchesStreakThreshold(rule.value);
    case "due":
      if (rule.op === "is_empty") return !task.due_on;
      if (rule.op === "is_today") return context.isDueToday(task.due_on);
      if (rule.op === "is_tomorrow") return context.isDueTomorrow(task.due_on);
      if (rule.op === "is_not_today") return !context.isDueToday(task.due_on);
      if (rule.op === "is_overdue") return context.isOverdue(task.due_on);
      if (rule.op === "is_not_overdue") return !context.isOverdue(task.due_on);
      return Boolean(task.due_on) && context.isLater(task.due_on);
    case "date_added": {
      const createdDate = task.created_at.slice(0, 10);
      if (rule.op === "is_today") return context.isDueToday(createdDate);
      return !context.isDueToday(createdDate);
    }
    case "completed_history":
      if (rule.op === "is_today") return historyFacts.completedToday;
      if (rule.op === "has_ever") return historyFacts.hasEverCompleted;
      if (!rule.value) return false;
      return rule.op === "within_last"
        ? historyFacts.completedWithinLast[rule.value]
        : historyFacts.lastCompletedWithinLast[rule.value];
    case "missed_history":
      if (rule.op === "is_today") return historyFacts.missedToday;
      if (rule.op === "has_ever") return historyFacts.hasEverMissed;
      if (!rule.value) return false;
      return rule.op === "within_last"
        ? historyFacts.missedWithinLast[rule.value]
        : historyFacts.lastMissedWithinLast[rule.value];
    case "completed_streak":
      return matchesPresetStreak(historyFacts.currentCompletedStreak, rule.op, rule.value);
    case "missed_streak":
      return matchesPresetStreak(historyFacts.currentMissedStreak, rule.op, rule.value);
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
  if (candidate.field === "list") {
    return (candidate.op === "is" || candidate.op === "is_not") && typeof candidate.value === "string";
  }
  if (candidate.field === "steps") {
    return (candidate.op === "is" || candidate.op === "is_not") && typeof candidate.value === "boolean";
  }
  if (candidate.field === "is_urgent" || candidate.field === "is_important" || candidate.field === "focus" || candidate.field === "repeat") {
    return (candidate.op === "is" || candidate.op === "is_not") && typeof candidate.value === "boolean";
  }
  if (candidate.field === "energy") {
    return (candidate.op === "is" || candidate.op === "is_not")
      && (typeof candidate.value === "string" || (Array.isArray(candidate.value) && candidate.value.every((item) => typeof item === "string")));
  }
  if (candidate.field === "streak") {
    return (candidate.op === "is" || candidate.op === "is_not")
      && (
        candidate.value === "0"
        || candidate.value === "over_0"
        || candidate.value === "over_7"
        || candidate.value === "over_14"
        || candidate.value === "over_30"
      );
  }
  if (candidate.field === "due") {
    return candidate.op === "is_empty"
      || candidate.op === "is_overdue"
      || candidate.op === "is_today"
      || candidate.op === "is_tomorrow"
      || candidate.op === "is_future"
      || candidate.op === "is_not_today"
      || candidate.op === "is_not_overdue";
  }
  if (candidate.field === "date_added") {
    return candidate.op === "is_today" || candidate.op === "is_not_today";
  }
  if (candidate.field === "completed_history" || candidate.field === "missed_history") {
    return candidate.op === "is_today"
      || candidate.op === "has_ever"
      || ((candidate.op === "within_last" || candidate.op === "last_within_last")
        && (
          candidate.value === "1"
          || candidate.value === "3"
          || candidate.value === "7"
          || candidate.value === "14"
          || candidate.value === "30"
        ));
  }
  if (candidate.field === "completed_streak" || candidate.field === "missed_streak") {
    return (candidate.op === "equals" || candidate.op === "at_least" || candidate.op === "less_than")
      && (
        candidate.value === "0"
        || candidate.value === "1"
        || candidate.value === "3"
        || candidate.value === "7"
        || candidate.value === "14"
        || candidate.value === "30"
      );
  }
  return false;
}

function isTaskListRuleRow(value: unknown): value is TaskListRuleRow {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TaskListRuleRow>;
  if (!isTaskListRule(candidate.rule)) {
    return false;
  }

  return candidate.connector === undefined || candidate.connector === "and" || candidate.connector === "or";
}

function normalizeTaskListRuleRows(rows: TaskListRuleRow[]): TaskListRuleRow[] {
  return rows.map((entry, index) => ({
    connector: index === 0 ? undefined : (entry.connector === "or" ? "or" : "and"),
    rule: entry.rule,
  }));
}

export function isTaskListRepeatEnabled(frequency: TaskRepeatFrequency) {
  return frequency !== "none";
}

function matchesSpecificListRuleMembership(
  task: Task,
  list: TaskListDefinition,
  lists: TaskListDefinition[],
  context: TaskListEvaluationContext,
  visitedListIds: Set<TaskListId> = new Set(),
  evaluationCache: Map<string, boolean> = new Map(),
  lookup: TaskListLookup = buildTaskListLookup(lists),
): boolean {
  const cacheKey = `rule:${list.id}`;
  const cached = evaluationCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  if (!list.rules) {
    evaluationCache.set(cacheKey, false);
    return false;
  }
  if (!context.isOpen(task) && list.id !== "done" && !ruleGroupUsesSavedHistory(list.rules)) {
    evaluationCache.set(cacheKey, false);
    return false;
  }
  const matches = matchesTaskListRules(task, list.rules, lists, context, visitedListIds, evaluationCache, lookup);
  evaluationCache.set(cacheKey, matches);
  return matches;
}

function matchesInboxMembership(
  task: Task,
  lists: TaskListDefinition[],
  context: TaskListEvaluationContext,
  options: {
    evaluationCache?: Map<string, boolean>;
    hasNonInboxRuleMatch?: boolean;
    lookup?: TaskListLookup;
    visitedListIds?: Set<TaskListId>;
  } = {},
) {
  const {
    evaluationCache = new Map<string, boolean>(),
    hasNonInboxRuleMatch,
    lookup = buildTaskListLookup(lists),
    visitedListIds = new Set<TaskListId>(),
  } = options;

  if (!context.isOpen(task) || task.status === "archived" || task.status === "trashed") {
    return false;
  }

  const manualListIds = context.manualMembershipsByTaskId[task.id] ?? [];
  if (manualListIds.length > 0) {
    return false;
  }

  const matchesBuiltInInbox = hasNonInboxRuleMatch
    ?? lookup.nonInboxRuleLists.some((list) =>
      matchesSpecificListRuleMembership(task, list, lists, context, visitedListIds, evaluationCache, lookup),
    );
  if (matchesBuiltInInbox) {
    return false;
  }

  const inboxList = lookup.listById.get("inbox");
  if (!inboxList?.rules) {
    return true;
  }

  return matchesSpecificListRuleMembership(task, inboxList, lists, context, visitedListIds, evaluationCache, lookup);
}

function taskBelongsToSpecificList(
  task: Task,
  selectedListId: TaskListId,
  lists: TaskListDefinition[],
  context: TaskListEvaluationContext,
  visitedListIds: Set<TaskListId> = new Set(),
  evaluationCache: Map<string, boolean> = new Map(),
  lookup: TaskListLookup = buildTaskListLookup(lists),
): boolean {
  const cacheKey = `membership:${selectedListId}`;
  const cached = evaluationCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  if (visitedListIds.has(selectedListId)) {
    return false;
  }

  const manualListIds = context.manualMembershipsByTaskId[task.id] ?? [];
  const hasManualMembership = selectedListId !== "today" && manualListIds.includes(selectedListId);
  if (hasManualMembership) {
    evaluationCache.set(cacheKey, true);
    return true;
  }

  if (selectedListId === "inbox") {
    const nextVisited = new Set(visitedListIds);
    nextVisited.add("inbox");
    const belongsToInbox = matchesInboxMembership(task, lists, context, {
      evaluationCache,
      lookup,
      visitedListIds: nextVisited,
    });
    evaluationCache.set(cacheKey, belongsToInbox);
    return belongsToInbox;
  }

  const list = lookup.listById.get(selectedListId);
  if (!list) {
    evaluationCache.set(cacheKey, false);
    return false;
  }

  const nextVisited = new Set(visitedListIds);
  nextVisited.add(selectedListId);
  const belongsToList = matchesSpecificListRuleMembership(task, list, lists, context, nextVisited, evaluationCache, lookup);
  evaluationCache.set(cacheKey, belongsToList);
  return belongsToList;
}

function buildTaskListLookup(lists: TaskListDefinition[]): TaskListLookup {
  const listById = new Map<TaskListId, TaskListDefinition>();
  const ruleLists: TaskListDefinition[] = [];
  const nonInboxRuleLists: TaskListDefinition[] = [];

  for (const list of lists) {
    listById.set(list.id, list);
    if (!list.rules) {
      continue;
    }
    ruleLists.push(list);
    if (list.id !== "inbox") {
      nonInboxRuleLists.push(list);
    }
  }

  return {
    listById,
    nonInboxRuleLists,
    ruleLists,
  };
}

function ruleGroupUsesSavedHistory(group: TaskListRuleGroup) {
  return group.rules.some((entry) =>
    entry.rule.field === "completed_history"
    || entry.rule.field === "missed_history"
    || entry.rule.field === "completed_streak"
    || entry.rule.field === "missed_streak",
  );
}
