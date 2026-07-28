"use client";

import { ArrowDown, ArrowUp, ListTodo, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AdhdCard } from "@/components/ui-system/adhd-card";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdPanel } from "@/components/ui-system/adhd-panel";
import { SortableList } from "@/components/ui/sortable-list";
import { useHomeTodoState } from "@/hooks/useHomeTodoState";
import type { Task } from "@/lib/database.types";
import {
  buildHomeTodoHierarchy,
  isHomeTodoTaskEligible,
  moveHomeTodoTaskId,
  reconcileHomeTodoTaskIds,
} from "@/lib/home-todo-state";

export function HomePage({ tasks, userId }: { tasks: Task[]; userId: string | null }) {
  const { state, syncStatus, updateTaskIds } = useHomeTodoState(userId);
  const [query, setQuery] = useState("");
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const reconciledTaskIds = useMemo(
    () => reconcileHomeTodoTaskIds(state.taskIds, tasks),
    [state.taskIds, tasks],
  );
  const todoTasks = useMemo(
    () => reconciledTaskIds.map((taskId) => taskById.get(taskId)).filter((task): task is Task => Boolean(task)),
    [reconciledTaskIds, taskById],
  );
  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const selected = new Set(reconciledTaskIds);
    return tasks
      .filter((task) => !selected.has(task.id) && isHomeTodoTaskEligible(task, tasks, taskById))
      .map((task) => {
        const hierarchy = buildHomeTodoHierarchy(task, tasks, taskById);
        const searchable = [task.title, task.notes, ...(task.tags ?? []), ...hierarchy]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return { hierarchy, searchable, task };
      })
      .filter((item) => item.searchable.includes(needle))
      .slice(0, 20);
  }, [query, reconciledTaskIds, taskById, tasks]);

  useEffect(() => {
    if (
      reconciledTaskIds.length !== state.taskIds.length
      || reconciledTaskIds.some((taskId, index) => taskId !== state.taskIds[index])
    ) {
      updateTaskIds(() => reconciledTaskIds);
    }
  }, [reconciledTaskIds, state.taskIds, updateTaskIds]);

  return (
    <section className="mx-auto w-full max-w-4xl px-4 pb-32">
      <AdhdPanel
        header={(
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <ListTodo aria-hidden="true" className="mt-0.5 h-5 w-5 text-[#6f57f6]" />
              <div>
                <h1 className="text-xl font-black text-[#27304c] dark:text-white">To-do list</h1>
                <p className="mt-1 text-sm text-[#7d7598] dark:text-white/55">
                  Search your Tasks and arrange the order you want to work through.
                </p>
              </div>
            </div>
            <span className="text-xs text-[#8a82a3] dark:text-white/40">
              {syncStatus === "saving" ? "Saving…" : syncStatus === "loading" ? "Loading…" : syncStatus === "synced" ? "Synced" : "Saved locally"}
            </span>
          </div>
        )}
      >
        <div className="relative mt-4">
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-[#7d7598] dark:text-white/55">Search tasks</span>
            <span className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#938ab8]" />
              <input
                className="health-input pl-9"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Task, Step, Substep, notes, or tags"
                value={query}
              />
            </span>
          </label>
          {query.trim() ? (
            <div className="absolute inset-x-0 top-full z-30 mt-2 max-h-[min(55vh,26rem)] overflow-y-auto rounded-[1.2rem] border border-[#e4def2] bg-white p-2 shadow-xl dark:border-white/15 dark:bg-[#201a35]">
              {searchResults.length ? searchResults.map(({ hierarchy, task }) => (
                <button
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-[#f6f2ff] dark:hover:bg-white/8"
                  key={task.id}
                  onClick={() => {
                    updateTaskIds((taskIds) => [...taskIds, task.id]);
                    setQuery("");
                  }}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-[#443d60] dark:text-white/80">
                      {task.title || "Untitled task"}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[#837b9e] dark:text-white/48">
                      {hierarchy.length ? hierarchy.join(" › ") : "Top-level Task"}
                    </span>
                  </span>
                  <Plus aria-hidden="true" className="h-4 w-4 shrink-0 text-[#6f57f6]" />
                </button>
              )) : (
                <p className="px-3 py-6 text-center text-sm text-[#837b9e]">No matching active tasks</p>
              )}
            </div>
          ) : null}
        </div>

        {todoTasks.length ? (
          <SortableList
            getId={(task) => task.id}
            getLabel={(task) => task.title || "Untitled task"}
            items={todoTasks}
            onReorder={(nextTasks) => updateTaskIds(() => nextTasks.map((task) => task.id))}
          >
            {(task, index, handle) => {
              const hierarchy = buildHomeTodoHierarchy(task, tasks, taskById);
              return (
                <AdhdCard className="flex items-center gap-3" padding="sm">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f1ecff] text-sm font-semibold text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]">
                    {index + 1}
                  </span>
                  {handle}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#26324f] dark:text-white">
                      {task.title || "Untitled task"}
                    </p>
                    {hierarchy.length ? (
                      <p className="mt-1 truncate text-xs text-[#837b9e] dark:text-white/48">{hierarchy.join(" › ")}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    <AdhdChip
                      contentClassName="gap-1.5"
                      disabled={index === 0}
                      icon={<ArrowUp aria-hidden="true" className="h-3 w-3" />}
                      onClick={() => updateTaskIds((taskIds) => moveHomeTodoTaskId(taskIds, task.id, -1))}
                    >
                      Up
                    </AdhdChip>
                    <AdhdChip
                      contentClassName="gap-1.5"
                      disabled={index === todoTasks.length - 1}
                      icon={<ArrowDown aria-hidden="true" className="h-3 w-3" />}
                      onClick={() => updateTaskIds((taskIds) => moveHomeTodoTaskId(taskIds, task.id, 1))}
                    >
                      Down
                    </AdhdChip>
                    <AdhdChip
                      contentClassName="gap-1.5"
                      icon={<Trash2 aria-hidden="true" className="h-3 w-3" />}
                      onClick={() => updateTaskIds((taskIds) => taskIds.filter((taskId) => taskId !== task.id))}
                      tone="danger"
                    >
                      Remove
                    </AdhdChip>
                  </div>
                </AdhdCard>
              );
            }}
          </SortableList>
        ) : (
          <p className="mt-5 rounded-[1.25rem] border border-dashed border-[#ddd6ee] bg-[#fcfbff] px-5 py-8 text-center text-sm text-[#7d7597] dark:border-white/15 dark:bg-white/[0.03] dark:text-white/55">
            Search above to add the first task to your ordered list.
          </p>
        )}
      </AdhdPanel>
    </section>
  );
}
