"use client";

import type { ReactNode } from "react";
import type { TaskViewMode } from "@/lib/task-ui-state";

type TaskPageProps = {
  alternateViewPanel: ReactNode;
  flows: ReactNode;
  listViewPanel: ReactNode;
  operationsHeader: ReactNode;
  view: TaskViewMode;
  tableViewPanel: ReactNode;
};

export function TaskPage({
  alternateViewPanel,
  flows,
  listViewPanel,
  operationsHeader,
  tableViewPanel,
  view,
}: TaskPageProps) {
  return (
    <>
      {flows}
      {operationsHeader}
      {view === "table"
        ? tableViewPanel
        : view === "list"
          ? listViewPanel
          : alternateViewPanel}
    </>
  );
}
