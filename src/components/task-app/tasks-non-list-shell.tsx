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
  lists: Array<{ count: number; description: string; id: string; label: string }>;
  matrixNode: ReactNode;
  onSelectBucket: (bucket: string) => void;
  selectedBucket: string;
  view: TaskViewMode;
};

export function TasksNonListShell({
  cardsNode,
  dailyPlanningNode,
  filterRowsNode,
  gridNode,
  listNode,
  lists,
  matrixNode,
  onSelectBucket,
  selectedBucket,
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
      lists={lists}
      onSelectBucket={onSelectBucket}
      selectedBucket={selectedBucket}
    />
  );
}
