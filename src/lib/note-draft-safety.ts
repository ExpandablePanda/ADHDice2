import type { Note } from "./database.types.ts";

export type NoteDraftValues = Pick<Note, "body" | "linked_task_ids" | "tags" | "title">;

export function areNoteDraftsEqual(left: NoteDraftValues, right: NoteDraftValues) {
  return left.title === right.title
    && left.body === right.body
    && left.tags.length === right.tags.length
    && left.tags.every((tag, index) => tag === right.tags[index])
    && left.linked_task_ids.length === right.linked_task_ids.length
    && left.linked_task_ids.every((taskId, index) => taskId === right.linked_task_ids[index]);
}
