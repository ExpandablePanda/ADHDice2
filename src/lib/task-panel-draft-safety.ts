export type TaskPanelDraftSource = "list" | "table" | "workspace";

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

export function hasAnyTaskPanelDraft(ownerKeys: string[]) {
  return ownerKeys.some((key) => !key.endsWith("::search"));
}

export function hasTaskPanelDraftForOwner(ownerKeys: string[], ownerKey: string) {
  const ownerPrefix = `${ownerKey}::`;
  return ownerKeys.some((key) => key === ownerKey || (
    key.startsWith(ownerPrefix) && !key.endsWith("::search")
  ));
}

export function hasTaskPanelDraftOutsideOwner(ownerKeys: string[], ownerKey: string) {
  return ownerKeys.some((key) => key !== ownerKey
    && !key.startsWith(`${ownerKey}::`)
    && !key.endsWith("::search"));
}
