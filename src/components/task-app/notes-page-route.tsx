"use client";

import type { User } from "@supabase/supabase-js";

import type { Task } from "@/lib/database.types";
import type { createBrowserSupabaseClient } from "@/lib/supabase";

import { NotesPageComponent } from "./notes-page";
import type { ScratchPaperData } from "./scratch-paper";

type NotesPageRouteProps = {
  client: NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
  currentUser: User;
  onOpenNoteHandled?: () => void;
  openNoteId?: string | null;
  tasks: Task[];
  scratchPaper: ScratchPaperData;
};

export function NotesPageRoute(props: NotesPageRouteProps) {
  return (
    <NotesPageComponent
      {...props}
    />
  );
}
