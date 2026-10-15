import type { EditingSessionStore } from "./editing-session-store.ts";
import type { ScratchPaperDraftValues, ScratchPaperEditingSessionDraft } from "./scratch-paper-draft.ts";

export function serializeScratchEditor(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? "";

  const element = node.nodeType === 1 ? node as HTMLElement : null;
  if (element?.dataset.taskToken) return element.dataset.taskToken;
  if (element?.tagName === "BR") return "\n";

  return Array.from(node.childNodes).reduce((output, child) => {
    const isBlock = child.nodeType === 1 && ["DIV", "P"].includes((child as HTMLElement).tagName);
    const childOutput = serializeScratchEditor(child);
    const needsBlockBreak = isBlock && output && !output.endsWith("\n") && !childOutput.startsWith("\n");
    return `${output}${needsBlockBreak ? "\n" : ""}${childOutput}`;
  }, "");
}

export function setScratchPaperDraftField<Field extends keyof ScratchPaperDraftValues>(
  sessionStore: EditingSessionStore<ScratchPaperEditingSessionDraft>,
  draftId: string,
  canonicalRecordId: string,
  initialDraft: ScratchPaperDraftValues,
  viewId: string | undefined,
  field: Field,
  next: ScratchPaperDraftValues[Field] | ((current: ScratchPaperDraftValues[Field]) => ScratchPaperDraftValues[Field]),
) {
  sessionStore.ensureSession(draftId, canonicalRecordId, initialDraft);
  if (viewId) sessionStore.attachView(draftId, viewId);
  return sessionStore.updateDraft(draftId, (current) => ({
    ...current,
    [field]: typeof next === "function"
      ? (next as (current: ScratchPaperDraftValues[Field]) => ScratchPaperDraftValues[Field])(current[field])
      : next,
  }));
}
