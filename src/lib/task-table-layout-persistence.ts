export type TaskTableLayoutSortState = {
  columnId: string;
  optionId: string;
} | null;

export type TaskTableLayoutPreferences = {
  columnOrder?: string[];
  sortState?: TaskTableLayoutSortState;
};

export const TASK_TABLE_LAYOUT_STORAGE_KEY = "adhdice-task-table-layout";

export function normalizeStoredTaskTableLayoutPreferences(value: unknown): TaskTableLayoutPreferences {
  if (!value || typeof value !== "object") {
    return {};
  }

  const candidate = value as {
    columnOrder?: unknown;
    sortState?: unknown;
  };
  const nextPreferences: TaskTableLayoutPreferences = {};

  if (Array.isArray(candidate.columnOrder)) {
    const nextOrder = candidate.columnOrder.filter((columnId): columnId is string => typeof columnId === "string");
    if (nextOrder.length > 0) {
      nextPreferences.columnOrder = nextOrder;
    }
  }

  if (candidate.sortState === null) {
    nextPreferences.sortState = null;
  } else if (candidate.sortState && typeof candidate.sortState === "object") {
    const sortState = candidate.sortState as {
      columnId?: unknown;
      optionId?: unknown;
    };
    if (typeof sortState.columnId === "string" && typeof sortState.optionId === "string") {
      nextPreferences.sortState = {
        columnId: sortState.columnId,
        optionId: sortState.optionId,
      };
    }
  }

  return nextPreferences;
}

export function taskTableLayoutPreferencesEqual(
  left: TaskTableLayoutPreferences,
  right: TaskTableLayoutPreferences,
) {
  const leftOrder = left.columnOrder ?? [];
  const rightOrder = right.columnOrder ?? [];
  if (leftOrder.length !== rightOrder.length) {
    return false;
  }
  if (leftOrder.some((columnId, index) => columnId !== rightOrder[index])) {
    return false;
  }

  const leftSortState = left.sortState;
  const rightSortState = right.sortState;
  if (leftSortState === rightSortState) {
    return true;
  }
  if (!leftSortState || !rightSortState) {
    return false;
  }
  return leftSortState.columnId === rightSortState.columnId
    && leftSortState.optionId === rightSortState.optionId;
}

export function resolveTaskTableLayoutPublishDecision({
  isApplyingPersistedLayout,
  nextPreferences,
  persistedPreferences,
}: {
  isApplyingPersistedLayout: boolean;
  nextPreferences: TaskTableLayoutPreferences;
  persistedPreferences?: TaskTableLayoutPreferences;
}) {
  const matchesPersisted = Boolean(
    persistedPreferences
    && taskTableLayoutPreferencesEqual(persistedPreferences, nextPreferences),
  );

  if (isApplyingPersistedLayout) {
    return {
      isApplyingPersistedLayout: Boolean(persistedPreferences && !matchesPersisted),
      shouldPublish: false,
    };
  }

  return {
    isApplyingPersistedLayout: false,
    shouldPublish: !matchesPersisted,
  };
}

export function splitTaskUiSettingsEnvelope(value: unknown) {
  if (
    value
    && typeof value === "object"
    && ("hudUiState" in value || "taskTableLayout" in value)
  ) {
    const candidate = value as {
      hudUiState?: unknown;
      taskTableLayout?: unknown;
    };
    return {
      hudUiStateValue: candidate.hudUiState,
      taskTableLayoutPreferences: normalizeStoredTaskTableLayoutPreferences(candidate.taskTableLayout),
    };
  }

  return {
    hudUiStateValue: value,
    taskTableLayoutPreferences: {},
  };
}

export function buildTaskUiSettingsEnvelope(
  hudUiState: unknown,
  taskTableLayoutPreferences: TaskTableLayoutPreferences,
) {
  return {
    hudUiState,
    taskTableLayout: taskTableLayoutPreferences,
  };
}
