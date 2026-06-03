"use client";

import type { ReactNode } from "react";
import type { TaskViewMode } from "@/lib/task-ui-state";

type TaskPageProps = {
  flows: ReactNode;
  nonListViewPanel: ReactNode;
  operationsHeader: ReactNode;
  view: TaskViewMode;
  listViewPanel: ReactNode;
};

export function TaskPage({
  flows,
  listViewPanel,
  nonListViewPanel,
  operationsHeader,
  view,
}: TaskPageProps) {
  return (
    <>
      {flows}
      {operationsHeader}
      {view === "list" ? listViewPanel : nonListViewPanel}
    </>
  );
}
