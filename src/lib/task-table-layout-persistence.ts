export type TaskTableLayoutSortState = {
  columnId: string;
  optionId: string;
} | null;

export type TaskTableLayoutPreferences = {
  columnOrder?: string[];
  sortState?: TaskTableLayoutSortState;
};

export type TaskUiSettingsSyncMetadata = {
  hudUpdatedAt: string | null;
  taskTableLayoutUpdatedAt: string | null;
};

export type TaskUiSettingsSnapshot = {
  hasHudUiState: boolean;
  hasTaskTableLayout: boolean;
  hudUiStateValue: unknown;
  syncMetadata: TaskUiSettingsSyncMetadata;
  taskTableLayoutPreferences: TaskTableLayoutPreferences;
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

  const leftSortState = left.sortState ?? null;
  const rightSortState = right.sortState ?? null;
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

function normalizeSyncTimestamp(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

export function normalizeTaskUiSettingsSyncMetadata(
  value: unknown,
  fallbackUpdatedAt: string | null = null,
): TaskUiSettingsSyncMetadata {
  const fallback = normalizeSyncTimestamp(fallbackUpdatedAt);
  if (!value || typeof value !== "object") {
    return { hudUpdatedAt: fallback, taskTableLayoutUpdatedAt: fallback };
  }

  const candidate = value as {
    hudUpdatedAt?: unknown;
    taskTableLayoutUpdatedAt?: unknown;
  };
  return {
    hudUpdatedAt: normalizeSyncTimestamp(candidate.hudUpdatedAt) ?? fallback,
    taskTableLayoutUpdatedAt: normalizeSyncTimestamp(candidate.taskTableLayoutUpdatedAt) ?? fallback,
  };
}

export function splitTaskUiSettingsEnvelope(value: unknown, fallbackUpdatedAt: string | null = null): TaskUiSettingsSnapshot {
  if (
    value
    && typeof value === "object"
    && ("hudUiState" in value || "taskTableLayout" in value)
  ) {
    const candidate = value as {
      hudUiState?: unknown;
      taskTableLayout?: unknown;
      syncMetadata?: unknown;
    };
    return {
      hasHudUiState: Object.prototype.hasOwnProperty.call(candidate, "hudUiState"),
      hasTaskTableLayout: Object.prototype.hasOwnProperty.call(candidate, "taskTableLayout"),
      hudUiStateValue: candidate.hudUiState,
      syncMetadata: normalizeTaskUiSettingsSyncMetadata(candidate.syncMetadata, fallbackUpdatedAt),
      taskTableLayoutPreferences: normalizeStoredTaskTableLayoutPreferences(candidate.taskTableLayout),
    };
  }

  return {
    hasHudUiState: true,
    hasTaskTableLayout: false,
    hudUiStateValue: value,
    syncMetadata: normalizeTaskUiSettingsSyncMetadata(null, fallbackUpdatedAt),
    taskTableLayoutPreferences: {},
  };
}

export function buildTaskUiSettingsEnvelope(
  hudUiState: unknown,
  taskTableLayoutPreferences: TaskTableLayoutPreferences,
  syncMetadata: Partial<TaskUiSettingsSyncMetadata> = {},
) {
  return {
    hudUiState,
    taskTableLayout: taskTableLayoutPreferences,
    syncMetadata: normalizeTaskUiSettingsSyncMetadata(syncMetadata),
  };
}

function isNewerTimestamp(remoteTimestamp: string | null, localTimestamp: string | null) {
  if (!remoteTimestamp) {
    return false;
  }
  if (!localTimestamp) {
    return true;
  }
  return Date.parse(remoteTimestamp) > Date.parse(localTimestamp);
}

export function resolveTaskUiSettingsReconciliation({
  local,
  remote,
}: {
  local: TaskUiSettingsSnapshot;
  remote: TaskUiSettingsSnapshot | null;
}) {
  if (!remote) {
    return {
      hasLocalHudUiState: local.hasHudUiState,
      hasLocalTaskTableLayout: local.hasTaskTableLayout,
      hudUiStateValue: local.hudUiStateValue,
      localHudWins: local.hasHudUiState,
      localTaskTableLayoutWins: local.hasTaskTableLayout,
      shouldPush: local.hasHudUiState || local.hasTaskTableLayout,
      syncMetadata: local.syncMetadata,
      taskTableLayoutPreferences: local.taskTableLayoutPreferences,
    };
  }

  const remoteHudWins = remote.hasHudUiState
    && (!local.hasHudUiState || isNewerTimestamp(remote.syncMetadata.hudUpdatedAt, local.syncMetadata.hudUpdatedAt));
  const remoteTaskTableLayoutWins = remote.hasTaskTableLayout
    && (!local.hasTaskTableLayout || isNewerTimestamp(remote.syncMetadata.taskTableLayoutUpdatedAt, local.syncMetadata.taskTableLayoutUpdatedAt));
  const localHudWins = local.hasHudUiState && !remoteHudWins;
  const localTaskTableLayoutWins = local.hasTaskTableLayout && !remoteTaskTableLayoutWins;

  return {
    hasLocalHudUiState: local.hasHudUiState,
    hasLocalTaskTableLayout: local.hasTaskTableLayout,
    hudUiStateValue: remoteHudWins ? remote.hudUiStateValue : local.hudUiStateValue,
    localHudWins,
    localTaskTableLayoutWins,
    shouldPush: localHudWins || localTaskTableLayoutWins,
    syncMetadata: {
      hudUpdatedAt: remoteHudWins ? remote.syncMetadata.hudUpdatedAt : local.syncMetadata.hudUpdatedAt,
      taskTableLayoutUpdatedAt: remoteTaskTableLayoutWins ? remote.syncMetadata.taskTableLayoutUpdatedAt : local.syncMetadata.taskTableLayoutUpdatedAt,
    },
    taskTableLayoutPreferences: remoteTaskTableLayoutWins
      ? remote.taskTableLayoutPreferences
      : local.taskTableLayoutPreferences,
  };
}
