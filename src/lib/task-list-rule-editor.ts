import type { TaskEnergy, TaskStatus } from "@/lib/database.types";
import type { TaskHistoryStreakPreset, TaskHistoryWindowPreset } from "@/lib/task-history";
import type { TaskListId, TaskListRule, TaskListRuleConnector, TaskListRuleGroup, TaskListRuleRow } from "@/lib/task-lists";
import { formatOptionLabel } from "@/lib/task-label-format";

export type TaskListRuleField = TaskListRule["field"];
export type TaskListRuleRowOperator = TaskListRule["op"];
type TaskListRuleStreakValue = Extract<TaskListRule, { field: "streak" }>["value"];
type TaskListHistoryRule = Extract<TaskListRule, { field: "completed_history" | "missed_history" }>;
type TaskListHistoryRuleValue = TaskHistoryWindowPreset;
type TaskListPresetStreakRule = Extract<TaskListRule, { field: "completed_streak" | "missed_streak" }>;

const EMPTY_TASK_LIST_RULE_GROUP: TaskListRuleGroup = { rules: [] };

export function normalizeTaskListRuleGroup(group: TaskListRuleGroup | null): TaskListRuleGroup {
  return group
    ? {
      rules: group.rules.map((entry, index) => ({
        connector: index === 0 ? undefined : entry.connector === "or" ? "or" : "and",
        rule: entry.rule,
      })),
    }
    : { ...EMPTY_TASK_LIST_RULE_GROUP, rules: [] };
}

export function createDefaultTaskListRule(field: TaskListRuleField = "status"): TaskListRule {
  switch (field) {
    case "list":
      return { field: "list", op: "is", value: "inbox" };
    case "steps":
      return { field: "steps", op: "is", value: true };
    case "date_added":
      return { field: "date_added", op: "is_today" };
    case "due":
      return { field: "due", op: "is_today" };
    case "completed_history":
      return { field: "completed_history", op: "is_today" };
    case "missed_history":
      return { field: "missed_history", op: "is_today" };
    case "completed_streak":
      return { field: "completed_streak", op: "at_least", value: "1" };
    case "missed_streak":
      return { field: "missed_streak", op: "at_least", value: "1" };
    case "energy":
      return { field: "energy", op: "is", value: ["medium"] };
    case "streak":
      return { field: "streak", op: "is", value: "over_0" };
    case "focus":
      return { field: "focus", op: "is", value: true };
    case "is_urgent":
      return { field: "is_urgent", op: "is", value: true };
    case "is_important":
      return { field: "is_important", op: "is", value: true };
    case "repeat":
      return { field: "repeat", op: "is", value: true };
    case "status":
    default:
      return { field: "status", op: "is", value: ["pending"] };
  }
}

export function getTaskListRuleOperator(rule: TaskListRule): TaskListRuleRowOperator {
  return rule.op;
}

export function taskListRuleNeedsValue(rule: TaskListRule) {
  if (rule.field === "completed_history" || rule.field === "missed_history") {
    return rule.op === "within_last" || rule.op === "last_within_last";
  }
  return rule.field === "status"
    || rule.field === "energy"
    || rule.field === "streak"
    || rule.field === "list"
    || rule.field === "completed_streak"
    || rule.field === "missed_streak";
}

export function normalizeTaskListRuleValues<T extends string>(value: T | T[]) {
  return Array.isArray(value) ? value : [value];
}

export function formatTaskListRule(rule: TaskListRule, resolveListLabel?: (listId: TaskListId) => string) {
  switch (rule.field) {
    case "status":
      return `Status ${rule.op === "is" ? "is" : "isn't"} ${normalizeTaskListRuleValues(rule.value).map((entry) => formatOptionLabel(entry)).join(" or ")}`;
    case "list":
      return `List ${rule.op === "is" ? "is" : "isn't"} ${formatTaskListIdLabel(rule.value, resolveListLabel)}`;
    case "steps":
      return `Steps ${rule.op === "is" ? "has steps" : "doesn't have steps"}`;
    case "energy":
      return `Energy ${rule.op === "is" ? "is" : "isn't"} ${normalizeTaskListRuleValues(rule.value).map((entry) => formatOptionLabel(entry)).join(" or ")}`;
    case "streak": {
      const label = rule.value === "0"
        ? "0"
        : rule.value === "over_0"
          ? "over 0"
          : rule.value === "over_7"
            ? "over 7"
            : rule.value === "over_14"
              ? "over 14"
              : "over 30";
      return `Streak ${rule.op === "is" ? "is" : "isn't"} ${label}`;
    }
    case "focus":
      return `Focus ${rule.op === "is" ? "is on" : "is off"}`;
    case "is_urgent":
      return `Urgent ${rule.op === "is" ? "is on" : "is off"}`;
    case "is_important":
      return `Important ${rule.op === "is" ? "is on" : "is off"}`;
    case "repeat":
      return `Repeats ${rule.op === "is" ? "is on" : "is off"}`;
    case "due":
      if (rule.op === "is_today") return "Due is today";
      if (rule.op === "is_tomorrow") return "Due is tomorrow";
      if (rule.op === "is_not_today") return "Due isn't today";
      if (rule.op === "is_overdue") return "Due is overdue";
      if (rule.op === "is_not_overdue") return "Due isn't overdue";
      if (rule.op === "is_empty") return "Due has no date";
      return "Due has a later date";
    case "date_added":
      return rule.op === "is_today" ? "Date added is today" : "Date added isn't today";
    case "completed_history":
      return formatHistoryRule("Completed", rule);
    case "missed_history":
      return formatHistoryRule("Missed", rule);
    case "completed_streak":
      return `Completed streak is ${formatPresetStreakOperator(rule.op, rule.value)}`;
    case "missed_streak":
      return `Missed streak is ${formatPresetStreakOperator(rule.op, rule.value)}`;
    default:
      return "Rule";
  }
}

export function summarizeTaskListRules(group: TaskListRuleGroup | null, resolveListLabel?: (listId: TaskListId) => string) {
  if (!group || group.rules.length === 0) {
    return "No rules yet.";
  }
  const summary = group.rules
    .slice(0, 2)
    .map((entry, index) => `${index === 0 ? "" : `${entry.connector === "or" ? "or" : "and"} `}${formatTaskListRule(entry.rule, resolveListLabel)}`)
    .join(" ");
  return group.rules.length > 2 ? `${summary}, +${group.rules.length - 2} more` : summary;
}

export function updateTaskListRuleField(rule: TaskListRule, field: TaskListRuleField): TaskListRule {
  if (rule.field === field) {
    return rule;
  }
  return createDefaultTaskListRule(field);
}

export function updateTaskListRuleOperator(rule: TaskListRule, operator: TaskListRuleRowOperator): TaskListRule {
  switch (rule.field) {
    case "status":
      if (operator === "is" || operator === "is_not") {
        return { field: "status", op: operator, value: rule.value };
      }
      return rule;
    case "list":
      if (operator === "is" || operator === "is_not") {
        return { field: "list", op: operator, value: rule.value };
      }
      return rule;
    case "steps":
      if (operator === "is" || operator === "is_not") {
        return { field: "steps", op: operator, value: true };
      }
      return rule;
    case "energy":
      if (operator === "is" || operator === "is_not") {
        return { field: "energy", op: operator, value: rule.value };
      }
      return rule;
    case "streak":
      if (operator === "is" || operator === "is_not") {
        return { field: "streak", op: operator, value: rule.value };
      }
      return rule;
    case "focus":
      if (operator === "is" || operator === "is_not") {
        return { field: "focus", op: operator, value: true };
      }
      return rule;
    case "is_urgent":
      if (operator === "is" || operator === "is_not") {
        return { field: "is_urgent", op: operator, value: true };
      }
      return rule;
    case "is_important":
      if (operator === "is" || operator === "is_not") {
        return { field: "is_important", op: operator, value: true };
      }
      return rule;
    case "repeat":
      if (operator === "is" || operator === "is_not") {
        return { field: "repeat", op: operator, value: true };
      }
      return rule;
    case "due":
      if (
        operator === "is_today"
        || operator === "is_tomorrow"
        || operator === "is_not_today"
        || operator === "is_overdue"
        || operator === "is_not_overdue"
        || operator === "is_empty"
        || operator === "is_future"
      ) {
        return { field: "due", op: operator };
      }
      return rule;
    case "date_added":
      if (operator === "is_today" || operator === "is_not_today") {
        return { field: "date_added", op: operator };
      }
      return rule;
    case "completed_history":
    case "missed_history":
      if (operator === "is_today" || operator === "has_ever") {
        return { field: rule.field, op: operator };
      }
      if (operator === "within_last" || operator === "last_within_last") {
        return { field: rule.field, op: operator, value: rule.value ?? "1" };
      }
      return rule;
    case "completed_streak":
      if (operator === "equals" || operator === "at_least" || operator === "less_than") {
        return { field: "completed_streak", op: operator, value: rule.value };
      }
      return rule;
    case "missed_streak":
      if (operator === "equals" || operator === "at_least" || operator === "less_than") {
        return { field: "missed_streak", op: operator, value: rule.value };
      }
      return rule;
    default:
      return rule;
  }
}

export function updateTaskListRuleValue(rule: TaskListRule, value: string): TaskListRule {
  if (rule.field === "status") {
    const currentValues = normalizeTaskListRuleValues(rule.value);
    const nextValue = value as TaskStatus;
    const nextValues = currentValues.includes(nextValue)
      ? currentValues.filter((entry) => entry !== nextValue)
      : [...currentValues, nextValue];
    return { ...rule, value: nextValues.length > 0 ? nextValues : [nextValue] };
  }
  if (rule.field === "energy") {
    const currentValues = normalizeTaskListRuleValues(rule.value);
    const nextValue = value as TaskEnergy;
    const nextValues = currentValues.includes(nextValue)
      ? currentValues.filter((entry) => entry !== nextValue)
      : [...currentValues, nextValue];
    return { ...rule, value: nextValues.length > 0 ? nextValues : [nextValue] };
  }
  if (rule.field === "streak") {
    return { ...rule, value: value as TaskListRuleStreakValue };
  }
  if (rule.field === "completed_history" || rule.field === "missed_history") {
    return { ...rule, value: value as TaskListHistoryRuleValue } satisfies TaskListHistoryRule;
  }
  if (rule.field === "completed_streak" || rule.field === "missed_streak") {
    return { ...rule, value: value as TaskHistoryStreakPreset } satisfies TaskListPresetStreakRule;
  }
  if (rule.field === "list") {
    return { ...rule, value: value as TaskListId };
  }
  return rule;
}

function formatHistoryRule(prefix: string, rule: TaskListHistoryRule) {
  if (rule.op === "is_today") {
    return `${prefix} today`;
  }
  if (rule.op === "has_ever") {
    return `Has ever ${prefix.toLowerCase()}`;
  }
  const dayLabel = formatWindowLabel(rule.value ?? "1");
  return rule.op === "within_last"
    ? `${prefix} within last ${dayLabel}`
    : `Last ${prefix.toLowerCase()} within last ${dayLabel}`;
}

function formatPresetStreakOperator(op: TaskListPresetStreakRule["op"], value: TaskHistoryStreakPreset) {
  if (op === "equals") return `${value}`;
  if (op === "at_least") return `at least ${value}`;
  return `less than ${value}`;
}

function formatWindowLabel(value: TaskHistoryWindowPreset) {
  return `${value} day${value === "1" ? "" : "s"}`;
}

function formatTaskListIdLabel(listId: TaskListId, resolveListLabel?: (listId: TaskListId) => string) {
  const resolvedLabel = resolveListLabel?.(listId);
  if (resolvedLabel) {
    return resolvedLabel;
  }
  if (listId.startsWith("list:")) {
    return "Custom list";
  }
  return listId
    .split("_")
    .map((entry) => entry.charAt(0).toUpperCase() + entry.slice(1))
    .join(" ");
}

export function createTaskListRuleRow(rule: TaskListRule = createDefaultTaskListRule()): TaskListRuleRow {
  return {
    rule,
  };
}

export function appendTaskListRuleRow(group: TaskListRuleGroup, connector: TaskListRuleConnector = "and") {
  const nextRule = createTaskListRuleRow();
  return {
    rules: [
      ...group.rules,
      group.rules.length === 0 ? nextRule : { connector, rule: nextRule.rule },
    ],
  } satisfies TaskListRuleGroup;
}

export function updateTaskListRuleRow(group: TaskListRuleGroup, rowIndex: number, rule: TaskListRule) {
  return {
    rules: group.rules.map((entry, index) => index === rowIndex ? { ...entry, rule } : entry),
  } satisfies TaskListRuleGroup;
}

export function updateTaskListRuleRowConnector(group: TaskListRuleGroup, rowIndex: number, connector: TaskListRuleConnector) {
  return {
    rules: group.rules.map((entry, index) => {
      if (index !== rowIndex) {
        return entry;
      }
      return {
        ...entry,
        connector: index === 0 ? undefined : connector,
      };
    }),
  } satisfies TaskListRuleGroup;
}

export function removeTaskListRuleRow(group: TaskListRuleGroup, rowIndex: number) {
  return normalizeTaskListRuleGroup({
    rules: group.rules.filter((_, index) => index !== rowIndex),
  });
}
