export type TaskPanelDraftSource = "list" | "search" | "table" | "workspace";

export function getTaskPanelDraftSourceKey(ownerKey: string, source: TaskPanelDraftSource) {
  return `${ownerKey}::${source}`;
}

export function updateTaskPanelDraftOwnerKeys(current: string[], ownerSourceKey: string, isEditing: boolean) {
  const alreadyReported = current.includes(ownerSourceKey);
  if (alreadyReported === isEditing) return current;
  return isEditing
    ? [...current, ownerSourceKey]
    : current.filter((ownerKey) => ownerKey !== ownerSourceKey);
}

export function hasTaskPanelDraftForOwner(ownerKeys: string[], ownerKey: string) {
  return ownerKeys.some((key) => key === ownerKey || key.startsWith(`${ownerKey}::`));
}

export function hasTaskPanelDraftOutsideOwner(ownerKeys: string[], ownerKey: string) {
  return ownerKeys.some((key) => key !== ownerKey && !key.startsWith(`${ownerKey}::`));
}
