import type { CustomBehaviorRuleset } from "./database.types.ts";
import { isTaskType, normalizeTaskType } from "./task-type-domain.ts";
import type { TaskType } from "./task-type-domain.ts";
import { STANDARD_TASK_TYPE_PRESENTATION, normalizeTaskTypePresentation, type TaskTypeAccentKey, type TaskTypeIconKey } from "./task-type-presentation.ts";

export { isTaskType, normalizeTaskType } from "./task-type-domain.ts";
export type { TaskType } from "./task-type-domain.ts";

export type TaskTypeSelection =
  | Readonly<{ customRulesetId: null; taskType: "task" }>
  | Readonly<{ customRulesetId: string; taskType: "custom" }>;

export type TaskTypeSelectionOption = {
  accentKey: TaskTypeAccentKey;
  description: string;
  highlightTaskRows: boolean;
  iconKey: TaskTypeIconKey;
  label: string;
  value: string;
};

export const TASK_TYPE_OPTIONS: ReadonlyArray<{ label: string; value: TaskType }> = [
  { label: "Task", value: "task" },
];

const BASE_TASK_TYPE_SELECTION_OPTIONS: ReadonlyArray<TaskTypeSelectionOption> = [
  { ...STANDARD_TASK_TYPE_PRESENTATION, label: "Task", value: "task" },
];

/** Parse explicit Task Type input without silently translating retired values. */
export function parseTaskType(value: unknown): TaskType | null {
  return isTaskType(value) ? value : null;
}

function isNamedCustomRuleset(
  ruleset: Pick<CustomBehaviorRuleset, "id" | "name" | "task_type"> & Partial<Pick<CustomBehaviorRuleset, "icon_key" | "accent_key" | "description" | "highlight_task_rows">> & { deleted_at?: string | null },
): boolean {
  return ruleset.task_type === "custom"
    && ruleset.deleted_at == null
    && Boolean(ruleset.id.trim())
    && Boolean(ruleset.name.trim());
}

function isRulesetIdentity(
  ruleset: Pick<CustomBehaviorRuleset, "id" | "name" | "task_type"> & Partial<Pick<CustomBehaviorRuleset, "icon_key" | "accent_key" | "description" | "highlight_task_rows">> & { deleted_at?: string | null },
) {
  return ruleset.task_type === "custom" && Boolean(ruleset.id.trim()) && Boolean(ruleset.name.trim());
}

function sortNamedCustomRulesets(
  rulesets: readonly (Pick<CustomBehaviorRuleset, "id" | "name" | "task_type"> & Partial<Pick<CustomBehaviorRuleset, "icon_key" | "accent_key" | "description" | "highlight_task_rows">> & { deleted_at?: string | null })[],
  includeDeleted = false,
) {
  return rulesets
    .filter((ruleset) => (includeDeleted ? isRulesetIdentity(ruleset) : isNamedCustomRuleset(ruleset)))
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) || left.id.localeCompare(right.id));
}

/** Build the one shared user-facing Task Type choice model. */
export function buildTaskTypeSelectionOptions(
  rulesets: readonly (Pick<CustomBehaviorRuleset, "id" | "name" | "task_type"> & Partial<Pick<CustomBehaviorRuleset, "icon_key" | "accent_key" | "description" | "highlight_task_rows">> & { deleted_at?: string | null })[] = [],
): ReadonlyArray<TaskTypeSelectionOption> {
  return [
    ...BASE_TASK_TYPE_SELECTION_OPTIONS,
    ...sortNamedCustomRulesets(rulesets).map((ruleset) => ({
      ...normalizeTaskTypePresentation({
        accentKey: ruleset.accent_key,
        description: ruleset.description,
        highlightTaskRows: ruleset.highlight_task_rows,
        iconKey: ruleset.icon_key,
      }),
      label: ruleset.name.trim(),
      value: ruleset.id,
    })),
  ];
}

export function taskTypeSelectionValue(
  taskType: unknown,
  customRulesetId: string | null | undefined,
  rulesets: readonly (Pick<CustomBehaviorRuleset, "id" | "name" | "task_type"> & Partial<Pick<CustomBehaviorRuleset, "icon_key" | "accent_key" | "description" | "highlight_task_rows">> & { deleted_at?: string | null })[] = [],
): string {
  const normalizedTaskType = normalizeTaskType(taskType);
  if (normalizedTaskType === "custom" && customRulesetId && sortNamedCustomRulesets(rulesets).some((ruleset) => ruleset.id === customRulesetId)) {
    return customRulesetId;
  }
  return normalizedTaskType;
}

export function resolveTaskTypeSelection(
  value: unknown,
  rulesets: readonly (Pick<CustomBehaviorRuleset, "id" | "name" | "task_type"> & Partial<Pick<CustomBehaviorRuleset, "icon_key" | "accent_key" | "description" | "highlight_task_rows">> & { deleted_at?: string | null })[] = [],
): TaskTypeSelection | null {
  const namedRuleset = sortNamedCustomRulesets(rulesets).find((ruleset) => ruleset.id === value);
  if (namedRuleset) {
    return { customRulesetId: namedRuleset.id, taskType: "custom" };
  }
  const taskType = parseTaskType(value);
  return taskType === "task" ? { customRulesetId: null, taskType } : null;
}

export function formatTaskTypeLabel(
  value: unknown,
  customRulesetId?: string | null,
  rulesets: readonly (Pick<CustomBehaviorRuleset, "id" | "name" | "task_type"> & Partial<Pick<CustomBehaviorRuleset, "icon_key" | "accent_key" | "description" | "highlight_task_rows">> & { deleted_at?: string | null })[] = [],
): string {
  const normalizedTaskType = normalizeTaskType(value);
  if (normalizedTaskType === "custom") {
    const namedRuleset = sortNamedCustomRulesets(rulesets, true).find((ruleset) => ruleset.id === customRulesetId);
    return namedRuleset?.name.trim() || "Custom Task Type (legacy)";
  }
  return TASK_TYPE_OPTIONS.find((option) => option.value === normalizedTaskType)?.label ?? "Task";
}

export function resolveTaskTypeSelectionOption(
  taskType: unknown,
  customRulesetId: string | null | undefined,
  rulesets: readonly (Pick<CustomBehaviorRuleset, "id" | "name" | "task_type"> & Partial<Pick<CustomBehaviorRuleset, "icon_key" | "accent_key" | "description" | "highlight_task_rows">> & { deleted_at?: string | null })[] = [],
): TaskTypeSelectionOption {
  const normalizedTaskType = normalizeTaskType(taskType);
  if (normalizedTaskType === "custom") {
    const namedRuleset = sortNamedCustomRulesets(rulesets, true).find((ruleset) => ruleset.id === customRulesetId);
    if (namedRuleset) {
      const presentation = namedRuleset.deleted_at != null
        ? STANDARD_TASK_TYPE_PRESENTATION
        : normalizeTaskTypePresentation({ accentKey: namedRuleset.accent_key, description: namedRuleset.description, highlightTaskRows: namedRuleset.highlight_task_rows, iconKey: namedRuleset.icon_key });
      return {
        ...presentation,
        label: namedRuleset.name.trim(),
        value: namedRuleset.id,
      };
    }
    return { ...STANDARD_TASK_TYPE_PRESENTATION, label: "Custom Task Type (legacy)", value: "custom" };
  }
  return BASE_TASK_TYPE_SELECTION_OPTIONS[0];
}

export function matchesTaskTypeSelection(
  taskType: unknown,
  customRulesetId: string | null | undefined,
  selectionValue: string,
): boolean {
  const normalizedTaskType = normalizeTaskType(taskType);
  const normalizedCustomRulesetId = customRulesetId ?? null;
  if (selectionValue === "custom") return false;
  if (isTaskType(selectionValue)) {
    return normalizedTaskType === selectionValue;
  }
  return normalizedTaskType === "custom" && normalizedCustomRulesetId === selectionValue;
}

export function matchesTaskTypeSelections(
  taskType: unknown,
  customRulesetId: string | null | undefined,
  selectionValues: readonly string[],
): boolean {
  return selectionValues.length === 0 || selectionValues.some((selectionValue) => (
    matchesTaskTypeSelection(taskType, customRulesetId, selectionValue)
  ));
}
