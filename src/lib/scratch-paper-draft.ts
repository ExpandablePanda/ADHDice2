export type ScratchPaperDraftValues = {
  body: string;
  linkedTaskIds: readonly string[];
  title: string;
};

export function areScratchPaperDraftsEqual(left: ScratchPaperDraftValues, right: ScratchPaperDraftValues) {
  const leftTaskIds = [...new Set(left.linkedTaskIds)].sort();
  const rightTaskIds = [...new Set(right.linkedTaskIds)].sort();
  return left.body.trim() === right.body.trim()
    && left.title.trim() === right.title.trim()
    && leftTaskIds.length === rightTaskIds.length
    && leftTaskIds.every((taskId, index) => taskId === rightTaskIds[index]);
}
