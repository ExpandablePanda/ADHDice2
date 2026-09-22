export type TaskTypeIconKey = string;
export type TaskTypeAccentKey = "neutral" | "purple" | "blue" | "cyan" | "teal" | "green" | "yellow" | "orange" | "red" | "pink";

export type TaskTypePresentation = {
  iconKey: TaskTypeIconKey;
  accentKey: TaskTypeAccentKey;
  description: string;
  highlightTaskRows: boolean;
};

export const DEFAULT_CUSTOM_TASK_TYPE_PRESENTATION: TaskTypePresentation = {
  iconKey: "list-todo",
  accentKey: "purple",
  description: "",
  highlightTaskRows: true,
};

const TASK_TYPE_ACCENT_KEYS = new Set<TaskTypeAccentKey>([
  "neutral", "purple", "blue", "cyan", "teal", "green", "yellow", "orange", "red", "pink",
]);

/** Normalize storage-facing presentation without importing icon-rendering UI. */
export function normalizeStoredTaskTypePresentation(
  value: Partial<Record<"iconKey" | "accentKey" | "description" | "highlightTaskRows", unknown>> | null | undefined,
): TaskTypePresentation {
  const iconKey = typeof value?.iconKey === "string" && value.iconKey.trim()
    ? value.iconKey.trim()
    : DEFAULT_CUSTOM_TASK_TYPE_PRESENTATION.iconKey;
  const accentKey = TASK_TYPE_ACCENT_KEYS.has(value?.accentKey as TaskTypeAccentKey)
    ? value?.accentKey as TaskTypeAccentKey
    : DEFAULT_CUSTOM_TASK_TYPE_PRESENTATION.accentKey;
  const description = typeof value?.description === "string" ? value.description.trim().slice(0, 240) : "";
  const highlightTaskRows = value?.highlightTaskRows !== false;
  return { iconKey, accentKey, description, highlightTaskRows };
}

export function validateTaskTypeDescription(value: unknown) {
  const description = typeof value === "string" ? value.trim() : "";
  return description.length <= 240
    ? { description, error: null }
    : { description: description.slice(0, 240), error: "Description must be 240 characters or fewer." };
}
