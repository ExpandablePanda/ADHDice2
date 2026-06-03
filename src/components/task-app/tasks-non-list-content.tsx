"use client";

import type { ReactNode } from "react";
import type { TaskViewMode } from "@/lib/task-ui-state";

type TasksNonListContentProps = {
  cardsNode: ReactNode;
  gridNode: ReactNode;
  matrixNode: ReactNode;
  view: TaskViewMode;
};

export function TasksNonListContent({
  cardsNode,
  gridNode,
  matrixNode,
  view,
}: TasksNonListContentProps) {
  if (view === "grid") {
    return <>{gridNode}</>;
  }

  if (view === "matrix") {
    return <>{matrixNode}</>;
  }

  return <>{cardsNode}</>;
}
