"use client";

import type { ReactNode } from "react";
import type { TasksSurface, TaskViewMode } from "@/lib/task-ui-state";

type TaskPageProps = {
  alternateViewPanel: ReactNode;
  flows: ReactNode;
  listViewPanel: ReactNode;
  onTimeWorkspacePanel: ReactNode;
  showTableOverlayOnTime?: boolean;
  operationsHeader: ReactNode;
  pathsWorkspacePanel: ReactNode;
  reportWorkspacePanel: ReactNode;
  surface: TasksSurface;
  surfaceSwitch: ReactNode;
  tabs: ReactNode;
  view: TaskViewMode;
  tableViewPanel: ReactNode;
};

export function TaskPage({
  alternateViewPanel,
  flows,
  listViewPanel,
  onTimeWorkspacePanel,
  showTableOverlayOnTime = false,
  operationsHeader,
  pathsWorkspacePanel,
  reportWorkspacePanel,
  surface,
  surfaceSwitch,
  tabs,
  tableViewPanel,
  view,
}: TaskPageProps) {
  return (
    <>
      {flows}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {surfaceSwitch}
        {tabs}
      </div>
      {surface === "paths" ? (
        pathsWorkspacePanel
      ) : surface === "report" ? (
        reportWorkspacePanel
      ) : surface === "on_time" ? (
        <>{onTimeWorkspacePanel}{showTableOverlayOnTime ? tableViewPanel : null}</>
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
