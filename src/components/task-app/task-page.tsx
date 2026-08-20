"use client";

import type { ReactNode } from "react";
import type { TasksSurface, TaskViewMode } from "@/lib/task-ui-state";

type TaskPageProps = {
  alternateViewPanel: ReactNode;
  brainstormWorkspacePanel: ReactNode;
  completedMilestonesWorkspacePanel: ReactNode;
  listViewPanel: ReactNode;
  onTimeWorkspacePanel: ReactNode;
  showSharedTaskEditorOverlay?: boolean;
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
  brainstormWorkspacePanel,
  completedMilestonesWorkspacePanel,
  listViewPanel,
  onTimeWorkspacePanel,
  showSharedTaskEditorOverlay = false,
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
      <div className="mt-4 flex min-w-0 max-w-full flex-wrap items-center justify-center gap-2">
        {surfaceSwitch}
        {tabs}
      </div>
      {surface === "paths" ? (
        pathsWorkspacePanel
      ) : surface === "report" ? (
        reportWorkspacePanel
      ) : surface === "on_time" ? (
        onTimeWorkspacePanel
      ) : surface === "brainstorm" ? (
        brainstormWorkspacePanel
      ) : surface === "completed_milestones" ? (
        completedMilestonesWorkspacePanel
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
      {showSharedTaskEditorOverlay && !(surface === "tasks" && view === "table") ? tableViewPanel : null}
    </>
  );
}
