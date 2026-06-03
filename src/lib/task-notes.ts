import type { Note } from "@/lib/database.types";

export type TaskEditorLinkedNote = Pick<Note, "body" | "id" | "linked_task_ids" | "title" | "updated_at">;
