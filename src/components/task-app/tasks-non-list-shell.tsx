"use client";

import type { ReactNode } from "react";
import { TasksNonListContent } from "./tasks-non-list-content";
import { TasksNonListViewPanel } from "./tasks-page";
import type { TaskViewMode } from "@/lib/task-ui-state";

type TasksNonListShellProps = {
  cardsNode: ReactNode;
  dailyPlanningNode: ReactNode;
  filterRowsNode: ReactNode;
  gridNode: ReactNode;
  listNode: ReactNode;
  matrixNode: ReactNode;
  view: TaskViewMode;
};

export function TasksNonListShell({
  cardsNode,
  dailyPlanningNode,
  filterRowsNode,
  gridNode,
  listNode,
  matrixNode,
  view,
}: TasksNonListShellProps) {
  return (
    <TasksNonListViewPanel
      contentNode={(
        <TasksNonListContent
          cardsNode={cardsNode}
          gridNode={gridNode}
          listNode={listNode}
          matrixNode={matrixNode}
          view={view}
        />
      )}
      dailyPlanningNode={dailyPlanningNode}
      filterRowsNode={filterRowsNode}
    />
  );
}
