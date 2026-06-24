"use client";

import type { ComponentProps, ReactNode } from "react";
import { TaskPage } from "./task-page";
import { TaskOperationsHeader } from "./tasks-page";
import { TasksSurfaceSwitch } from "./tasks-surface-switch";
import type { TasksSurface, TaskViewMode } from "@/lib/task-ui-state";

type TasksPageOrchestratorProps = {
  alternateViewPanel: ReactNode;
  flows: ReactNode;
  listViewPanel: ReactNode;
  onSurfaceChange: (surface: TasksSurface) => void;
  operationsHeaderProps: ComponentProps<typeof TaskOperationsHeader>;
  pathsWorkspacePanel: ReactNode;
  surface: TasksSurface;
  tableViewPanel: ReactNode;
  view: TaskViewMode;
};

export function TasksWorkspace({
  alternateViewPanel,
  flows,
  listViewPanel,
  onSurfaceChange,
  operationsHeaderProps,
  pathsWorkspacePanel,
  surface,
  tableViewPanel,
  view,
}: TasksPageOrchestratorProps) {
  return (
    <TaskPage
      alternateViewPanel={alternateViewPanel}
      flows={flows}
      listViewPanel={listViewPanel}
      operationsHeader={<TaskOperationsHeader {...operationsHeaderProps} />}
      pathsWorkspacePanel={pathsWorkspacePanel}
      surface={surface}
      surfaceSwitch={<TasksSurfaceSwitch onChange={onSurfaceChange} value={surface} />}
      tableViewPanel={tableViewPanel}
      view={view}
    />
  );
}

export const TasksPageOrchestrator = TasksWorkspace;
