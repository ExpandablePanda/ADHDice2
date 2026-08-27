"use client";

import { ArrowDownToLine, ArrowUpToLine, ChevronDown, ListTodo, Minus, Plus, Search, Settings2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { AdhdCard } from "@/components/ui-system/adhd-card";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdIconButton } from "@/components/ui-system/adhd-icon-button";
import { AdhdPanel } from "@/components/ui-system/adhd-panel";
import { SortableList } from "@/components/ui/sortable-list";
import { useHomeTodoState } from "@/hooks/useHomeTodoState";
import { TaskStatusCircleRail, formatTaskStatusLabel, renderTaskStatusCircle } from "@/components/task-app/task-status-ui";
import { getSelectableTaskStatusesForTask } from "@/lib/task-complete";
import type { Task, TaskStatus } from "@/lib/database.types";
import type { TaskDisplayStatusByTaskId } from "@/lib/task-display-status";
import type { TaskDraft } from "@/components/task-app/task-editor-model";
import type { TaskListMembership } from "@/lib/task-lists";
import {
  buildHomeTodoHierarchy,
  buildHomeTodoDaySections,
  createHomeTodoTask,
  getHomeTodoSearchText,
  isHomeTodoTaskEligible,
  mergeHomeTodoVisibleTaskIds,
  moveHomeTodoTaskIdToEdge,
  reconcileHomeTodoTaskIds,
  sortHomeTodoSearchResults,
} from "@/lib/home-todo-state";

const HOME_TODO_TITLE_CLASS = "text-sm font-medium text-[#26324f] dark:text-white";
const HOME_TODO_LIST_CLASS = "mt-3 space-y-2 max-sm:-mx-2";
const HOME_TODO_ACTION_CLASS = "max-sm:!h-7 max-sm:!w-7";
const HOME_TODO_ACTION_ICON_CLASS = "max-sm:!h-[12.25px] max-sm:!w-[12.25px]";

export function HomePage({
  listMembershipsByTaskId,
  onCreateTask,
  onOpenTask,
  onSetStatus,
  taskDisplayStatusByTaskId,
  calendarNowMs,
  calendarTimeZone,
  tasks,
  userId,
}: {
  listMembershipsByTaskId: Record<string, TaskListMembership[]>;
  onCreateTask: (draft: TaskDraft) => Promise<Task | null>;
  onOpenTask: (taskId: string) => void;
  onSetStatus: (task: Task, status: TaskStatus) => void;
  taskDisplayStatusByTaskId: TaskDisplayStatusByTaskId;
  calendarNowMs: number;
  calendarTimeZone: string;
  tasks: Task[];
  userId: string | null;
}) {
  const { state, syncStatus, updateTaskDayOffset, updateTaskIds, updateTasksPerDay } = useHomeTodoState(userId);
  const [query, setQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isDoLaterOpen, setIsDoLaterOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [statusMenuTaskId, setStatusMenuTaskId] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const newTaskInputRef = useRef<HTMLInputElement | null>(null);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
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

  const { laterTaskIds, sections: daySections } = useMemo(
    () => buildHomeTodoDaySections(todoTasks.map((task) => task.id), state.tasksPerDay, new Date(calendarNowMs), calendarTimeZone, state.taskDayOffsets),
    [calendarNowMs, calendarTimeZone, state.taskDayOffsets, state.tasksPerDay, todoTasks],
  );
  const dayTaskIds = daySections.flatMap((section) => section.taskIds);
  const sevenDayCapacity = dayTaskIds.length;
  const dayTasks = dayTaskIds.map((taskId) => taskById.get(taskId)).filter((task): task is Task => Boolean(task));
  const doLaterTasks = laterTaskIds.map((taskId) => taskById.get(taskId)).filter((task): task is Task => Boolean(task));
  const visibleTasks = isDoLaterOpen ? [...dayTasks, ...doLaterTasks] : dayTasks;

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

  useEffect(() => {
    if (!isSettingsOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!settingsMenuRef.current?.contains(event.target as Node)) setIsSettingsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsSettingsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSettingsOpen]);

  function renderDaySectionHeader(section: typeof daySections[number]) {
    return (
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#ece8f8] pt-4 first:mt-3 first:border-t-0 dark:border-white/10" data-sortable-drop-id={`day-${section.dayIndex}`} data-sortable-drop-index={section.startIndex} key={`home-day-${section.dayIndex}`}>
        <div>
          <h2 className="text-sm font-bold text-[#4d466d] dark:text-white/85">{section.label}</h2>
          <p className="mt-0.5 text-xs text-[#9a92b1] dark:text-white/42">
            {section.taskIds.length ? `${section.taskIds.length} task${section.taskIds.length === 1 ? "" : "s"}` : "Empty"}
          </p>
        </div>
      </div>
    );
  }

  function renderLaterSectionHeader() {
    return (
      <section className="mt-5 border-t border-[#ece8f8] pt-4 dark:border-white/10" data-sortable-drop-id="later" data-sortable-drop-index={sevenDayCapacity}>
        <AdhdChip
          aria-expanded={isDoLaterOpen}
          contentClassName="gap-1.5"
          icon={<ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${isDoLaterOpen ? "rotate-180" : ""}`} />}
          onClick={() => setIsDoLaterOpen((current) => !current)}
        >
          Later ({doLaterTasks.length})
        </AdhdChip>
      </section>
    );
  }

  function getDayOffsetForInsertion(index: number) {
    if (index >= sevenDayCapacity) return 7;
    return daySections.reduce((dayOffset, section) => section.startIndex <= index ? section.dayIndex : dayOffset, 0);
  }

  function renderTodoTask(task: Task, index: number, handle: ReactNode) {
    const hierarchy = buildHomeTodoHierarchy(task, tasks, taskById);
    const displayStatus = taskDisplayStatusByTaskId[task.id] ?? task.status;
    const statusMenuOpen = statusMenuTaskId === task.id;
    return (
      <AdhdCard className="grid min-w-0 grid-cols-[auto_auto_auto_minmax(0,1fr)_auto] items-center gap-x-0" padding="sm">
        <span className="max-sm:-ml-3 sm:-ml-2 shrink-0">{handle}</span>
        <span className="ml-1 shrink-0 text-sm font-medium leading-5 text-[#26324f] dark:text-white">
          {index + 1}
        </span>
        <div className="relative ml-2 flex h-8 w-8 shrink-0 items-center justify-center" ref={statusMenuOpen ? statusMenuRef : undefined}>
          <button
            aria-expanded={statusMenuOpen}
            aria-label={`Change status: ${formatTaskStatusLabel(displayStatus)}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full"
            onClick={() => setStatusMenuTaskId((current) => current === task.id ? null : task.id)}
            type="button"
          >
            {renderTaskStatusCircle(displayStatus, "sm", { className: "!h-7 !w-7", glyphClassName: "!h-4 !w-4 !text-sm" })}
          </button>
          {statusMenuOpen ? (
            <div className="absolute left-0 top-full z-30 mt-2 rounded-full border border-[#e4def2] bg-white p-1 shadow-lg dark:border-white/15 dark:bg-[#201a35]">
              <TaskStatusCircleRail
                currentStatus={displayStatus}
                onSetStatus={(status) => {
                  onSetStatus(task, status);
                  setStatusMenuTaskId(null);
                }}
                options={getSelectableTaskStatusesForTask({ dueOn: task.due_on, repeatFrequency: task.repeat_frequency, status: displayStatus }).map((status) => ({ label: formatTaskStatusLabel(status), value: status }))}
                statusLabelPrefix="Set task status to"
                wrap={false}
              />
            </div>
          ) : null}
        </div>
        <div className="ml-2 min-w-0">
          <button className="block min-w-0 max-w-full text-left" onClick={() => onOpenTask(task.id)} type="button">
            <p className={`break-words leading-5 ${HOME_TODO_TITLE_CLASS}`}>
              {task.title || "Untitled task"}
            </p>
          </button>
          {hierarchy.length ? (
            <p className="mt-1 break-words text-xs leading-5 text-[#837b9e] dark:text-white/48">{hierarchy.join(" › ")}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {state.taskIds.indexOf(task.id) !== 0 ? (
            <AdhdIconButton
              aria-label={`Move ${task.title || "Untitled task"} to Top`}
              className={HOME_TODO_ACTION_CLASS}
              iconClassName={HOME_TODO_ACTION_ICON_CLASS}
              onClick={() => updateTaskIds((taskIds) => moveHomeTodoTaskIdToEdge(taskIds, task.id, "top"))}
              size="sm"
              title="Move task to Top"
            >
              <ArrowUpToLine aria-hidden="true" />
            </AdhdIconButton>
          ) : null}
          {state.taskIds.indexOf(task.id) !== state.taskIds.length - 1 ? (
            <AdhdIconButton
              aria-label={`Move ${task.title || "Untitled task"} to Bottom`}
              className={HOME_TODO_ACTION_CLASS}
              iconClassName={HOME_TODO_ACTION_ICON_CLASS}
              onClick={() => updateTaskIds((taskIds) => moveHomeTodoTaskIdToEdge(taskIds, task.id, "bottom"))}
              size="sm"
              title="Move task to Bottom"
            >
              <ArrowDownToLine aria-hidden="true" />
            </AdhdIconButton>
          ) : null}
          <AdhdIconButton
            aria-label={`Remove ${task.title || "Untitled task"} from Home To-do`}
            className={HOME_TODO_ACTION_CLASS}
            iconClassName={HOME_TODO_ACTION_ICON_CLASS}
            onClick={() => updateTaskIds((taskIds) => taskIds.filter((taskId) => taskId !== task.id))}
            size="sm"
            title="Remove from Home To-do"
            tone="danger"
          >
            <Minus aria-hidden="true" />
          </AdhdIconButton>
        </div>
      </AdhdCard>
    );
  }

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
    <section className="-mx-[15px] w-auto max-w-4xl px-3 pb-32 pt-6 sm:mx-auto sm:px-4">
      <AdhdPanel
        header={(
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <ListTodo aria-hidden="true" className="mt-0.5 h-5 w-5 text-[#6f57f6]" />
              <div>
                <h1 className="text-xl font-black text-[#27304c] dark:text-white">To-do list</h1>
              </div>
            </div>
            <div className="relative flex items-center gap-2" ref={settingsMenuRef}>
              <AdhdIconButton
                aria-expanded={isSettingsOpen}
                aria-haspopup="dialog"
                aria-label="To-do list settings"
                onClick={() => setIsSettingsOpen((current) => !current)}
                selected={isSettingsOpen}
                size="sm"
                tone="ghost"
              >
                <Settings2 aria-hidden="true" />
              </AdhdIconButton>
              {isSettingsOpen ? (
                <div
                  aria-label="To-do list settings"
                  className="absolute right-0 top-[calc(100%+0.55rem)] z-40 grid w-[min(18rem,calc(100vw-2rem))] gap-3 rounded-[1.1rem] border border-[#ede6ff] bg-white/95 p-3 text-left shadow-[0_20px_60px_rgba(111,87,246,0.16)] backdrop-blur dark:border-white/10 dark:bg-[#1b1530]/95"
                  role="dialog"
                >
                  <div>
                    <h2 className="text-sm font-bold text-[#26324f] dark:text-white">To-do list settings</h2>
                    <p className="mt-1 text-xs text-[#7d7598] dark:text-white/50">Tasks per day</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tasks per day">
                    {[10, 11, 12, 13, 14, 15].map((tasksPerDay) => (
                      <AdhdChip
                        key={tasksPerDay}
                        onClick={() => updateTasksPerDay(tasksPerDay)}
                        selected={state.tasksPerDay === tasksPerDay}
                        type="button"
                      >
                        {tasksPerDay}
                      </AdhdChip>
                    ))}
                  </div>
                </div>
              ) : null}
              <span className="text-xs text-[#8a82a3] dark:text-white/40">
                {syncStatus === "saving" ? "Saving…" : syncStatus === "loading" ? "Loading…" : syncStatus === "synced" ? "Synced" : "Saved locally"}
              </span>
            </div>
          </div>
        )}
      >
        <div className="relative mt-2" ref={searchRef}>
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
                    <span className={`block truncate ${HOME_TODO_TITLE_CLASS}`}>
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

          <SortableList
            className={HOME_TODO_LIST_CLASS}
            getId={(task) => task.id}
            getLabel={(task) => task.title || "Untitled task"}
            items={visibleTasks}
            onReorder={(nextTasks, context) => {
              const sourceTask = visibleTasks[context.sourceIndex];
              updateTaskIds((taskIds) => mergeHomeTodoVisibleTaskIds(
                taskIds,
                visibleTasks.map((task) => task.id),
                nextTasks.map((task) => task.id),
              ));
              if (sourceTask) {
                const targetDayOffset = context.dropZoneId === "later"
                  ? 7
                  : context.dropZoneId?.startsWith("day-")
                    ? Number.parseInt(context.dropZoneId.slice(4), 10)
                    : getDayOffsetForInsertion(context.targetIndex);
                updateTaskDayOffset(sourceTask.id, Number.isInteger(targetDayOffset) ? targetDayOffset : null);
              }
            }}
            renderAfterItems={(
              <>
                {daySections
                  .filter((section) => section.startIndex >= visibleTasks.length)
                  .map(renderDaySectionHeader)}
                {!isDoLaterOpen && doLaterTasks.length ? renderLaterSectionHeader() : null}
              </>
            )}
            renderBeforeItem={(_, index) => (
              <>
                {daySections
                  .filter((section) => section.startIndex === index)
                  .map(renderDaySectionHeader)}
                {isDoLaterOpen && index === sevenDayCapacity && doLaterTasks.length ? renderLaterSectionHeader() : null}
              </>
            )}
          >
            {(task, index, handle) => renderTodoTask(task, index, handle)}
          </SortableList>
          {!todoTasks.length ? (
            <p className="mt-5 rounded-[1.25rem] border border-dashed border-[#ddd6ee] bg-[#fcfbff] px-5 py-6 text-center text-sm text-[#7d7597] dark:border-white/15 dark:bg-white/[0.03] dark:text-white/55">
              Search above to add the first task to your ordered list.
            </p>
          ) : null}
      </AdhdPanel>
    </section>
  );
}
