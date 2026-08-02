export const TASK_ROLLOVER_KEY_STORAGE_PREFIX = "adhdice:task-rollover-key";

export function createTaskRolloverSettingsKey(input: {
  logicalDayKey: string;
  rolloverTime: string;
  timezone: string;
  userId: string;
}) {
  return [input.userId, input.logicalDayKey, input.timezone, input.rolloverTime].join("|");
}

export function getTaskRolloverStorageKey(userId: string) {
  return `${TASK_ROLLOVER_KEY_STORAGE_PREFIX}:${userId}`;
}

export function shouldAttemptTaskRollover(storage: Pick<Storage, "getItem">, key: string, userId: string) {
  return storage.getItem(getTaskRolloverStorageKey(userId)) !== key;
}

export function persistProcessedTaskRolloverKey(storage: Pick<Storage, "setItem">, key: string, userId: string) {
  storage.setItem(getTaskRolloverStorageKey(userId), key);
}
