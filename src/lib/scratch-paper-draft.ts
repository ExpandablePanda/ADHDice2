export type ScratchPaperDraftValues = {
  body: string;
  linkedTaskIds: readonly string[];
  title: string;
};

export type ScratchPaperEditingSessionDraft = ScratchPaperDraftValues;

export function scratchPaperSessionId(noteId: string) {
  return `scratch-note:${noteId}`;
}

export function createScratchPaperRecordId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export function normalizeScratchPaperDraft(draft: ScratchPaperDraftValues): ScratchPaperDraftValues {
  return {
    body: draft.body.trim(),
    linkedTaskIds: [...new Set(draft.linkedTaskIds)],
    title: draft.title.trim(),
  };
}

export function areScratchPaperDraftsEqual(left: ScratchPaperDraftValues, right: ScratchPaperDraftValues) {
  const leftTaskIds = [...new Set(left.linkedTaskIds)].sort();
  const rightTaskIds = [...new Set(right.linkedTaskIds)].sort();
  return left.body.trim() === right.body.trim()
    && left.title.trim() === right.title.trim()
    && leftTaskIds.length === rightTaskIds.length
    && leftTaskIds.every((taskId, index) => taskId === rightTaskIds[index]);
}
