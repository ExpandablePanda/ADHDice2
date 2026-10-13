"use client";

import type { ReactNode } from "react";
import { AdhdCard } from "@/components/ui-system/adhd-card";
import { TASK_TABLE_INPUT_CLASS } from "@/components/ui/task-table-primitives";
import type { Task } from "@/lib/database.types";
import type { TaskDisplayStatusByTaskId } from "@/lib/task-display-status";
import { formatTaskStatusLabel } from "./task-status-ui";

type TasksSplitLayoutProps = {
  active: boolean;
  left: ReactNode;
  right: ReactNode;
  splitRatio: number;
};

export function TasksSplitLayout({ active, left, right, splitRatio }: TasksSplitLayoutProps) {
  if (!active) return <>{left}</>;

  return (
    <div
      className="grid min-w-0 items-start gap-3"
      data-master-workspace-split="tasks"
      style={{ gridTemplateColumns: `minmax(0, ${splitRatio}fr) minmax(0, ${1 - splitRatio}fr)` }}
    >
      <section
        aria-label="Left Tasks panel"
        className="adhdice-scrollbar max-h-[calc(100dvh-18rem)] min-h-64 min-w-0 overflow-y-auto overscroll-contain"
      >
        {left}
      </section>
      <section
        aria-label="Right read-only Tasks panel"
        className="adhdice-scrollbar max-h-[calc(100dvh-18rem)] min-h-64 min-w-0 overflow-y-auto overscroll-contain rounded-[1.5rem] border border-[#ece8f8] bg-white/55 p-3 dark:border-white/10 dark:bg-white/[0.025]"
      >
        {right}
      </section>
    </div>
  );
}

type ReadOnlyTasksPanelProps = {
  displayStatusByTaskId: TaskDisplayStatusByTaskId;
  onSearchChange: (search: string) => void;
  search: string;
  tasks: readonly Task[];
};

export function ReadOnlyTasksPanel({ displayStatusByTaskId, onSearchChange, search, tasks }: ReadOnlyTasksPanelProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[#292443] dark:text-white">Tasks</h2>
          <p className="mt-0.5 text-xs text-[#817b98] dark:text-white/50">Read only · {tasks.length} {tasks.length === 1 ? "Task" : "Tasks"}</p>
        </div>
      </header>
      <label className="block min-w-0">
        <span className="sr-only">Search right Tasks panel</span>
        <input
          aria-label="Search right Tasks panel"
          className={`${TASK_TABLE_INPUT_CLASS} w-full`}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search Tasks"
          type="search"
          value={search}
        />
      </label>
      {tasks.length > 0 ? (
        <div className="grid min-w-0 gap-2">
          {tasks.map((task) => {
            const details = [
              formatTaskStatusLabel(displayStatusByTaskId[task.id] ?? task.status),
              task.due_on ? `Due ${task.due_on}` : null,
            ].filter(Boolean);
            return (
              <AdhdCard className="min-w-0" key={task.id} padding="sm">
                <p className="break-words text-sm font-medium text-[#292443] dark:text-white">{task.title}</p>
                <p className="mt-1 text-xs text-[#817b98] dark:text-white/50">{details.join(" · ")}</p>
              </AdhdCard>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[#d9d3e9] px-3 py-5 text-center text-sm text-[#817b98] dark:border-white/15 dark:text-white/50">
          No Tasks match this presentation.
        </p>
      )}
    </div>
  );
}
