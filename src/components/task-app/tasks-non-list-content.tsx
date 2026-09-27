"use client";

import type { ReactNode } from "react";
import type { TaskViewMode } from "@/lib/task-ui-state";

type TasksNonListContentProps = {
  cardsNode: ReactNode;
  calendarNode: ReactNode;
  listNode: ReactNode;
  matrixNode: ReactNode;
  view: TaskViewMode;
};

export function TasksNonListContent({
  cardsNode,
  calendarNode,
  listNode,
  matrixNode,
  view,
}: TasksNonListContentProps) {
  if (view === "list") {
    return <>{listNode}</>;
  }

  if (view === "matrix") {
    return <>{matrixNode}</>;
  }

  if (view === "calendar") {
    return <>{calendarNode}</>;
  }

  return <>{cardsNode}</>;
}
