"use client";

import type { ReactNode } from "react";
import type { TaskViewMode } from "@/lib/task-ui-state";

type TasksNonListContentProps = {
  cardsNode: ReactNode;
  gridNode: ReactNode;
  listNode: ReactNode;
  matrixNode: ReactNode;
  view: TaskViewMode;
};

export function TasksNonListContent({
  cardsNode,
  gridNode,
  listNode,
  matrixNode,
  view,
}: TasksNonListContentProps) {
  if (view === "list") {
    return <>{listNode}</>;
  }

  if (view === "grid") {
    return <>{gridNode}</>;
  }

  if (view === "matrix") {
    return <>{matrixNode}</>;
  }

  return <>{cardsNode}</>;
}
