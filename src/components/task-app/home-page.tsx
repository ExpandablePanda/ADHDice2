"use client";

import { ArrowDownToLine, ArrowUpToLine, ChevronDown, ListTodo, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { AdhdCard } from "@/components/ui-system/adhd-card";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdPanel } from "@/components/ui-system/adhd-panel";
import { SortableList } from "@/components/ui/sortable-list";
import { useHomeTodoState } from "@/hooks/useHomeTodoState";
import { TaskStatusCircleRail, formatTaskStatusLabel, renderTaskStatusCircle } from "@/components/task-app/task-status-ui";
import { getSelectableTaskStatuses } from "@/lib/task-complete";
import type { Task, TaskStatus } from "@/lib/database.types";
import type { TaskDisplayStatusByTaskId } from "@/lib/task-display-status";
import type { TaskDraft } from "@/components/task-app/task-editor-model";
import type { TaskListMembership } from "@/lib/task-lists";
import {
  buildHomeTodoHierarchy,
  createHomeTodoTask,
  getHomeTodoSearchText,
  isHomeTodoTaskEligible,
  moveHomeTodoTaskIdToEdge,
  reconcileHomeTodoTaskIds,
  sortHomeTodoSearchResults,
} from "@/lib/home-todo-state";

const HOME_TODO_VISIBLE_LIMIT = 10;

export function HomePage({
  listMembershipsByTaskId,
  onCreateTask,
  onOpenTask,
  onSetStatus,
  taskDisplayStatusByTaskId,
  tasks,
  userId,
}: {
  listMembershipsByTaskId: Record<string, TaskListMembership[]>;
  onCreateTask: (draft: TaskDraft) => Promise<Task | null>;
  onOpenTask: (taskId: string) => void;
  onSetStatus: (task: Task, status: TaskStatus) => void;
  taskDisplayStatusByTaskId: TaskDisplayStatusByTaskId;
  tasks: Task[];
  userId: string | null;
}) {
  const { state, syncStatus, updateTaskIds } = useHomeTodoState(userId);
  const [query, setQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isDoLaterOpen, setIsDoLaterOpen] = useState(false);
  const [statusMenuTaskId, setStatusMenuTaskId] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const newTaskInputRef = useRef<HTMLInputElement | null>(null);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);
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
    return sortHomeTodoSearchResults(tasks
      .filter((task) => !selected.has(task.id) && isHomeTodoTaskEligible(task, tasks, taskById))
      .map((task) => {
        const hierarchy = buildHomeTodoHierarchy(task, tasks, taskById);
        const searchable = getHomeTodoSearchText(task, hierarchy, listMembershipsByTaskId[task.id] ?? []);
        return { hierarchy, searchable, task };
      })
      .filter((item) => item.searchable.includes(needle)));
  }, [listMembershipsByTaskId, query, reconciledTaskIds, taskById, tasks]);

  const nowTasks = todoTasks.slice(0, HOME_TODO_VISIBLE_LIMIT);
  const doLaterTasks = todoTasks.slice(HOME_TODO_VISIBLE_LIMIT);

  useEffect(() => {
    if (isCreateOpen) newTaskInputRef.current?.focus();
  }, [isCreateOpen]);

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isCreating) return;

    setIsCreating(true);
    try {
      const createdTask = await createHomeTodoTask(
        newTaskTitle,
        onCreateTask,
        (taskId) => updateTaskIds((taskIds) => [...taskIds, taskId]),
      );
      if (createdTask) {
        setNewTaskTitle("");
        setIsCreateOpen(false);
      }
    } finally {
      setIsCreating(false);
    }
  }

  function cancelCreateTask() {
    if (isCreating) return;
    setNewTaskTitle("");
    setIsCreateOpen(false);
  }

  useEffect(() => {
    if (!statusMenuTaskId) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!statusMenuRef.current?.contains(event.target as Node)) setStatusMenuTaskId(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStatusMenuTaskId(null);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [statusMenuTaskId]);

  function renderTodoTask(task: Task, index: number, handle: ReactNode) {
    const hierarchy = buildHomeTodoHierarchy(task, tasks, taskById);
    const displayStatus = taskDisplayStatusByTaskId[task.id] ?? task.status;
    const statusMenuOpen = statusMenuTaskId === task.id;
    return (
      <AdhdCard className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1.5 sm:flex-nowrap sm:items-center" padding="sm">
        <div className="flex shrink-0 flex-col items-center gap-1 sm:order-1 sm:flex-row">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black bg-white text-sm font-semibold text-black sm:order-2 dark:border-black dark:bg-white dark:text-black">
            {index + 1}
          </span>
          <span className="mt-0.5 shrink-0 sm:order-1">{handle}</span>
        </div>
        <div className="order-2 min-w-0 flex-1 sm:order-2">
          <div className="flex items-start gap-1">
            <div className="relative mt-0.5 shrink-0" ref={statusMenuOpen ? statusMenuRef : undefined}>
              <button
                aria-expanded={statusMenuOpen}
                aria-label={`Change status: ${formatTaskStatusLabel(displayStatus)}`}
                className="rounded-full p-0.5"
                onClick={() => setStatusMenuTaskId((current) => current === task.id ? null : task.id)}
                type="button"
              >
                {renderTaskStatusCircle(displayStatus, "sm")}
              </button>
              {statusMenuOpen ? (
                <div className="absolute left-0 top-full z-30 mt-2 rounded-full border border-[#e4def2] bg-white p-1 shadow-lg dark:border-white/15 dark:bg-[#201a35]">
                  <TaskStatusCircleRail
                    currentStatus={displayStatus}
                    onSetStatus={(status) => {
                      onSetStatus(task, status);
                      setStatusMenuTaskId(null);
                    }}
                    options={getSelectableTaskStatuses(task).map((status) => ({ label: formatTaskStatusLabel(status), value: status }))}
                    statusLabelPrefix="Set task status to"
                    wrap={false}
                  />
                </div>
              ) : null}
            </div>
            <button className="block min-w-0 flex-1 text-left" onClick={() => onOpenTask(task.id)} type="button">
              <p className="break-words text-sm font-semibold leading-5 text-[#26324f] dark:text-white">
                {task.title || "Untitled task"}
              </p>
            </button>
          </div>
          {hierarchy.length ? (
            <p className="mt-1 break-words text-xs leading-5 text-[#837b9e] dark:text-white/48">{hierarchy.join(" › ")}</p>
          ) : null}
        </div>
        <div className="order-3 flex w-full basis-full flex-wrap justify-end gap-1.5 sm:ml-auto sm:w-auto sm:basis-auto sm:shrink-0 sm:self-center">
          <AdhdChip
            contentClassName="gap-1.5"
            disabled={index === 0}
            icon={<ArrowUpToLine aria-hidden="true" className="h-3 w-3" />}
            onClick={() => updateTaskIds((taskIds) => moveHomeTodoTaskIdToEdge(taskIds, task.id, "top"))}
          >
            Top
          </AdhdChip>
          <AdhdChip
            contentClassName="gap-1.5"
            disabled={index === todoTasks.length - 1}
            icon={<ArrowDownToLine aria-hidden="true" className="h-3 w-3" />}
            onClick={() => updateTaskIds((taskIds) => moveHomeTodoTaskIdToEdge(taskIds, task.id, "bottom"))}
          >
            Bottom
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
  }

  useEffect(() => {
    if (
      reconciledTaskIds.length !== state.taskIds.length
      || reconciledTaskIds.some((taskId, index) => taskId !== state.taskIds[index])
    ) {
      updateTaskIds(() => reconciledTaskIds);
    }
  }, [reconciledTaskIds, state.taskIds, updateTaskIds]);

  useEffect(() => {
    if (!isSearchOpen) return;
    function closeSearch(event: PointerEvent) {
      if (!searchRef.current?.contains(event.target as Node)) setIsSearchOpen(false);
    }
    function closeSearchOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsSearchOpen(false);
    }
    window.addEventListener("pointerdown", closeSearch);
    window.addEventListener("keydown", closeSearchOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeSearch);
      window.removeEventListener("keydown", closeSearchOnEscape);
    };
  }, [isSearchOpen]);

  return (
    <section className="mx-auto w-full max-w-4xl px-4 pb-32 pt-6">
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
        <div className="relative mt-4" ref={searchRef}>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <span className="text-xs font-medium text-[#7d7598] dark:text-white/55">Search tasks</span>
            <AdhdChip
              disabled={isCreating}
              onClick={() => {
                setIsSearchOpen(false);
                setIsCreateOpen(true);
              }}
              selected={isCreateOpen}
            >
              New task
            </AdhdChip>
          </div>
          <label className="mt-1.5 grid gap-1.5">
            <span className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#938ab8]" />
              <input
                className="health-input pl-9"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                placeholder="Task, Step, Substep, notes, or tags"
                value={query}
              />
            </span>
          </label>
          {isCreateOpen ? (
            <form
              className="mt-3 flex flex-wrap items-end gap-2 rounded-[1rem] border border-[#e4def2] bg-[#fcfbff] p-2.5 dark:border-white/10 dark:bg-white/[0.03]"
              onSubmit={handleCreateTask}
            >
              <label className="min-w-[min(100%,16rem)] flex-1">
                <span className="sr-only">Task title</span>
                <input
                  autoComplete="off"
                  className="health-input"
                  disabled={isCreating}
                  onChange={(event) => setNewTaskTitle(event.target.value)}
                  placeholder="Task title"
                  ref={newTaskInputRef}
                  value={newTaskTitle}
                />
              </label>
              <div className="flex shrink-0 gap-1.5">
                <AdhdChip disabled={isCreating} selected type="submit">
                  {isCreating ? "Adding…" : "Add"}
                </AdhdChip>
                <AdhdChip disabled={isCreating} onClick={cancelCreateTask}>
                  Cancel
                </AdhdChip>
              </div>
            </form>
          ) : null}
          {isSearchOpen && query.trim() ? (
            <div className="absolute inset-x-0 top-full z-30 mt-2 max-h-[min(55vh,26rem)] overflow-y-auto rounded-[1.2rem] border border-[#e4def2] bg-white p-2 shadow-xl dark:border-white/15 dark:bg-[#201a35]">
              {searchResults.length ? searchResults.map(({ hierarchy, task }) => (
                <button
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-[#f6f2ff] dark:hover:bg-white/8"
                  key={task.id}
                  onClick={() => {
                    updateTaskIds((taskIds) => [...taskIds, task.id]);
                  }}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-[#443d60] dark:text-white/80">
                      {task.title || "Untitled task"}
                    </span>
                    {hierarchy.length ? (
                      <span className="mt-0.5 block truncate text-xs text-[#837b9e] dark:text-white/48">
                        {hierarchy.join(" › ")}
                      </span>
                    ) : null}
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
          <>
          <SortableList
            getId={(task) => task.id}
            getLabel={(task) => task.title || "Untitled task"}
            items={nowTasks}
            onReorder={(nextTasks) => updateTaskIds(() => [...nextTasks, ...doLaterTasks].map((task) => task.id))}
          >
            {(task, index, handle) => renderTodoTask(task, index, handle)}
          </SortableList>
          {doLaterTasks.length ? (
            <section className="mt-5 border-t border-[#ece8f8] pt-4 dark:border-white/10">
              <AdhdChip
                aria-expanded={isDoLaterOpen}
                contentClassName="gap-1.5"
                icon={<ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${isDoLaterOpen ? "rotate-180" : ""}`} />}
                onClick={() => setIsDoLaterOpen((current) => !current)}
              >
                Do later ({doLaterTasks.length})
              </AdhdChip>
              {isDoLaterOpen ? (
                <SortableList
                  getId={(task) => task.id}
                  getLabel={(task) => task.title || "Untitled task"}
                  items={doLaterTasks}
                  onReorder={(nextTasks) => updateTaskIds(() => [...nowTasks, ...nextTasks].map((task) => task.id))}
                >
                  {(task, index, handle) => renderTodoTask(task, index + HOME_TODO_VISIBLE_LIMIT, handle)}
                </SortableList>
              ) : null}
            </section>
          ) : null}
          </>
        ) : (
          <p className="mt-5 rounded-[1.25rem] border border-dashed border-[#ddd6ee] bg-[#fcfbff] px-5 py-8 text-center text-sm text-[#7d7597] dark:border-white/15 dark:bg-white/[0.03] dark:text-white/55">
            Search above to add the first task to your ordered list.
          </p>
        )}
      </AdhdPanel>
    </section>
  );
}
