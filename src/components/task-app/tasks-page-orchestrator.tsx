"use client";

import type { ComponentProps, ReactNode } from "react";
import { TaskPage } from "./task-page";
import { TaskOperationsHeader } from "./tasks-page";
import type { TaskViewMode } from "@/lib/task-ui-state";

type TasksPageOrchestratorProps = {
  alternateViewPanel: ReactNode;
  flows: ReactNode;
  listViewPanel: ReactNode;
  operationsHeaderProps: ComponentProps<typeof TaskOperationsHeader>;
  tableViewPanel: ReactNode;
  view: TaskViewMode;
};

export function TasksWorkspace({
  alternateViewPanel,
  flows,
  listViewPanel,
  operationsHeaderProps,
  tableViewPanel,
  view,
}: TasksPageOrchestratorProps) {
  return (
    <TaskPage
      alternateViewPanel={alternateViewPanel}
      flows={flows}
      listViewPanel={listViewPanel}
      operationsHeader={<TaskOperationsHeader {...operationsHeaderProps} />}
      tableViewPanel={tableViewPanel}
      view={view}
    />
  );
}

export const TasksPageOrchestrator = TasksWorkspace;
