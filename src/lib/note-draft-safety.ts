import type { Note } from "./database.types.ts";

export type NoteDraftValues = Pick<Note, "body" | "linked_task_ids" | "tags" | "title">;

export type NotesEditingSessionDraft =
  | { kind: "note"; note: Note }
  | { kind: "quick-capture"; text: string; pendingNoteId: string | null };

export function areNoteDraftsEqual(left: NoteDraftValues, right: NoteDraftValues) {
  return left.title === right.title
    && left.body === right.body
    && left.tags.length === right.tags.length
    && left.tags.every((tag, index) => tag === right.tags[index])
    && left.linked_task_ids.length === right.linked_task_ids.length
    && left.linked_task_ids.every((taskId, index) => taskId === right.linked_task_ids[index]);
}

export function areNotesEditingSessionDraftsEqual(left: NotesEditingSessionDraft, right: NotesEditingSessionDraft) {
  if (left.kind !== right.kind) return false;
  if (left.kind === "quick-capture" && right.kind === "quick-capture") {
    return left.text === right.text && left.pendingNoteId === right.pendingNoteId;
  }
  return left.kind === "note" && right.kind === "note" && areNoteDraftsEqual(left.note, right.note);
}

export function createNoteRecordId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}
