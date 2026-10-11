"use client";

import type { User } from "@supabase/supabase-js";

import type { Note, Task } from "@/lib/database.types";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import type { EditingSessionStore } from "@/lib/editing-session-store";
import type { MasterNotesWorkspaceView } from "@/lib/master-workspace-state";
import type { NotesEditingSessionDraft } from "@/lib/note-draft-safety";

import { NotesPageComponent } from "./notes-page";
import type { ScratchPaperData } from "./scratch-paper";
import type { VoiceMemoData } from "@/hooks/useVoiceMemos";

type NotesPageRouteProps = {
  client: NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
  currentUser: User;
  notes: Note[];
  onNotesChange: (update: (current: Note[]) => Note[]) => void;
  onDraftSafetyChange: (isUnsafe: boolean) => void;
  notesSessionStore?: EditingSessionStore<NotesEditingSessionDraft> | null;
  activeMasterTabId?: string;
  notesView?: MasterNotesWorkspaceView;
  onNotesViewChange?: (notesView: MasterNotesWorkspaceView) => boolean;
  onOpenNoteHandled?: () => void;
  openNoteId?: string | null;
  tasks: Task[];
  scratchPaper: ScratchPaperData;
  voiceMemos: VoiceMemoData;
};

export function NotesPageRoute(props: NotesPageRouteProps) {
  return (
    <NotesPageComponent
      {...props}
    />
  );
}
