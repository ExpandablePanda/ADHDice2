"use client";

import type { ReactNode } from "react";
import type { TasksSurface, TaskViewMode } from "@/lib/task-ui-state";

type TaskPageProps = {
  alternateViewPanel: ReactNode;
  flows: ReactNode;
  listViewPanel: ReactNode;
  operationsHeader: ReactNode;
  pathsWorkspacePanel: ReactNode;
  surface: TasksSurface;
  surfaceSwitch: ReactNode;
  view: TaskViewMode;
  tableViewPanel: ReactNode;
};

export function TaskPage({
  alternateViewPanel,
  flows,
  listViewPanel,
  operationsHeader,
  pathsWorkspacePanel,
  surface,
  surfaceSwitch,
  tableViewPanel,
  view,
}: TaskPageProps) {
  return (
    <>
      {flows}
      {surfaceSwitch}
      {surface === "paths" ? (
        pathsWorkspacePanel
      ) : (
        <>
          {operationsHeader}
          {view === "table"
            ? tableViewPanel
            : view === "list"
              ? listViewPanel
              : alternateViewPanel}
        </>
      )}
    </>
  );
}
