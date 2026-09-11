import type { CustomBehaviorRuleset } from "./database.types.ts";

export type TaskType = "task" | "pursuit" | "goal" | "custom";

export type TaskTypeSelection = Readonly<{
  customRulesetId: string | null;
  taskType: TaskType;
}>;

export type TaskTypeSelectionOption = {
  label: string;
  value: string;
};

export const TASK_TYPE_OPTIONS: ReadonlyArray<{ label: string; value: TaskType }> = [
  { label: "Task", value: "task" },
  { label: "Pursuit", value: "pursuit" },
  { label: "Goal", value: "goal" },
  { label: "Custom Default", value: "custom" },
];

const BASE_TASK_TYPE_SELECTION_OPTIONS: ReadonlyArray<TaskTypeSelectionOption> = [
  { label: "Task", value: "task" },
  { label: "Pursuit", value: "pursuit" },
  { label: "Goal", value: "goal" },
  { label: "Custom Default", value: "custom" },
];

export function isTaskType(value: unknown): value is TaskType {
  return value === "task" || value === "pursuit" || value === "goal" || value === "custom";
}

export function normalizeTaskType(value: unknown): TaskType {
  return isTaskType(value) ? value : "task";
}

function isNamedCustomRuleset(
  ruleset: Pick<CustomBehaviorRuleset, "id" | "name" | "task_type"> & { deleted_at?: string | null },
): boolean {
  return ruleset.task_type === "custom"
    && ruleset.deleted_at == null
    && Boolean(ruleset.id.trim())
    && Boolean(ruleset.name.trim());
}

function isRulesetIdentity(
  ruleset: Pick<CustomBehaviorRuleset, "id" | "name" | "task_type"> & { deleted_at?: string | null },
) {
  return ruleset.task_type === "custom" && Boolean(ruleset.id.trim()) && Boolean(ruleset.name.trim());
}

function sortNamedCustomRulesets(
  rulesets: readonly (Pick<CustomBehaviorRuleset, "id" | "name" | "task_type"> & { deleted_at?: string | null })[],
  includeDeleted = false,
) {
  return rulesets
    .filter((ruleset) => (includeDeleted ? isRulesetIdentity(ruleset) : isNamedCustomRuleset(ruleset)))
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) || left.id.localeCompare(right.id));
}

/** Build the one shared user-facing TaskType/ruleset choice model. */
export function buildTaskTypeSelectionOptions(
  rulesets: readonly (Pick<CustomBehaviorRuleset, "id" | "name" | "task_type"> & { deleted_at?: string | null })[] = [],
): ReadonlyArray<TaskTypeSelectionOption> {
  return [
    ...BASE_TASK_TYPE_SELECTION_OPTIONS,
    ...sortNamedCustomRulesets(rulesets).map((ruleset) => ({ label: ruleset.name.trim(), value: ruleset.id })),
  ];
}

export function taskTypeSelectionValue(
  taskType: unknown,
  customRulesetId: string | null | undefined,
  rulesets: readonly (Pick<CustomBehaviorRuleset, "id" | "name" | "task_type"> & { deleted_at?: string | null })[] = [],
): string {
  const normalizedTaskType = normalizeTaskType(taskType);
  if (normalizedTaskType === "custom" && customRulesetId && sortNamedCustomRulesets(rulesets).some((ruleset) => ruleset.id === customRulesetId)) {
    return customRulesetId;
  }
  return normalizedTaskType;
}

export function resolveTaskTypeSelection(
  value: unknown,
  rulesets: readonly (Pick<CustomBehaviorRuleset, "id" | "name" | "task_type"> & { deleted_at?: string | null })[] = [],
): TaskTypeSelection {
  const namedRuleset = sortNamedCustomRulesets(rulesets).find((ruleset) => ruleset.id === value);
  if (namedRuleset) {
    return { customRulesetId: namedRuleset.id, taskType: "custom" };
  }
  return { customRulesetId: null, taskType: normalizeTaskType(value) };
}

export function formatTaskTypeLabel(
  value: unknown,
  customRulesetId?: string | null,
  rulesets: readonly (Pick<CustomBehaviorRuleset, "id" | "name" | "task_type"> & { deleted_at?: string | null })[] = [],
): string {
  const normalizedTaskType = normalizeTaskType(value);
  if (normalizedTaskType === "custom") {
    const namedRuleset = sortNamedCustomRulesets(rulesets, true).find((ruleset) => ruleset.id === customRulesetId);
    return namedRuleset?.name.trim() || "Custom Default";
  }
  return TASK_TYPE_OPTIONS.find((option) => option.value === normalizedTaskType)?.label ?? "Task";
}
