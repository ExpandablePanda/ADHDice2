"use client";

import type { ComponentProps, ReactNode } from "react";
import { TaskPage } from "./task-page";
import { TaskOperationsHeader } from "./tasks-page";
import type { TaskViewMode } from "@/lib/task-ui-state";

type TasksPageOrchestratorProps = {
  flows: ReactNode;
  listViewPanel: ReactNode;
  nonListViewPanel: ReactNode;
  operationsHeaderProps: ComponentProps<typeof TaskOperationsHeader>;
  view: TaskViewMode;
};

export function TasksPageOrchestrator({
  flows,
  listViewPanel,
  nonListViewPanel,
  operationsHeaderProps,
  view,
}: TasksPageOrchestratorProps) {
  return (
    <TaskPage
      flows={flows}
      listViewPanel={listViewPanel}
      nonListViewPanel={nonListViewPanel}
      operationsHeader={<TaskOperationsHeader {...operationsHeaderProps} />}
      view={view}
    />
  );
}
