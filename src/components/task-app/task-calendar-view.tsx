"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { Task } from "@/lib/database.types";
import type { TaskDisplayStatus } from "@/lib/task-display-status";
import {
  formatTaskCalendarDate,
  formatTaskCalendarMonth,
  formatTaskCalendarTime,
  getCalendarDateKey,
  getTaskCalendarMonth,
  getTaskCalendarMonthGrid,
  groupTasksByCalendarDate,
  shiftTaskCalendarMonth,
  TASK_CALENDAR_WEEKDAY_LABELS,
  type TaskCalendarMonth,
} from "@/lib/task-calendar";
import { AdhdChip, AdhdDropdownPanel, AdhdIconButton } from "@/components/ui-system";
import { renderTaskStatusCircle } from "./task-status-ui";

const CALENDAR_VISIBLE_TASK_CAP = 3;

type TaskCalendarViewProps = {
  onAddTask: (dueOn: string) => void;
  onOpenTask: (task: Task) => void;
  taskDisplayStatusByTaskId?: Readonly<Record<string, TaskDisplayStatus>>;
  tasks: Task[];
};

function getTaskDepth(task: Task, taskById: ReadonlyMap<string, Task>) {
  let depth = 0;
  let parentTaskId = task.parent_task_id;
  const visitedTaskIds = new Set<string>();
  while (parentTaskId && !visitedTaskIds.has(parentTaskId)) {
    visitedTaskIds.add(parentTaskId);
    depth += 1;
    parentTaskId = taskById.get(parentTaskId)?.parent_task_id ?? null;
  }
  return depth;
}

function CalendarTaskButton({
  onOpenTask,
  task,
  taskById,
  taskDisplayStatusByTaskId,
}: {
  onOpenTask: (task: Task) => void;
  task: Task;
  taskById: ReadonlyMap<string, Task>;
  taskDisplayStatusByTaskId?: Readonly<Record<string, TaskDisplayStatus>>;
}) {
  const depth = getTaskDepth(task, taskById);
  const status = taskDisplayStatusByTaskId?.[task.id] ?? task.status;
  const timeLabel = formatTaskCalendarTime(task.due_time);
  const dateLabel = task.due_on ? formatTaskCalendarDate(new Date(`${task.due_on}T12:00:00`)) : "No Due Date";
  const accessibleLabel = `${task.title || "Untitled task"}, ${dateLabel}${timeLabel ? ` at ${timeLabel}` : ""}${depth > 0 ? `, ${depth > 1 ? "Substep" : "Step"}` : ""}`;

  return (
    <button
      aria-label={accessibleLabel}
      className="group flex min-w-0 w-full items-center gap-1.5 rounded-[0.45rem] px-1 py-1 text-left text-[11px] leading-4 text-[#3f4660] transition hover:bg-[#f4efff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9bbff] dark:text-white/78 dark:hover:bg-white/[0.08] dark:focus-visible:ring-[#6d56d6]"
      onClick={() => onOpenTask(task)}
      title={accessibleLabel}
      type="button"
    >
      <span className="shrink-0" style={{ marginLeft: Math.min(depth, 2) * 6 }}>
        {renderTaskStatusCircle(status, "sm", { className: "h-4 w-4", glyphClassName: "scale-90" })}
      </span>
      {depth > 0 ? <span aria-hidden="true" className="shrink-0 text-[10px] text-[#9c8dde] dark:text-[#b9aaff]">↳</span> : null}
      <span className="min-w-0 flex-1 truncate">
        {timeLabel ? <span className="mr-1 text-[#8176ad] dark:text-[#bfb3f0]">{timeLabel}</span> : null}
        <span className={status === "done" || status === "complete" ? "line-through opacity-65" : ""}>{task.title || "Untitled task"}</span>
      </span>
    </button>
  );
}

function CalendarDayCell({
  day,
  onAddTask,
  onOpenTask,
  expandedOverflowDateKey,
  onToggleOverflow,
  tasks,
  taskById,
  taskDisplayStatusByTaskId,
  todayDateKey,
}: {
  day: ReturnType<typeof getTaskCalendarMonthGrid>[number];
  expandedOverflowDateKey: string | null;
  onAddTask: (dueOn: string) => void;
  onOpenTask: (task: Task) => void;
  onToggleOverflow: (dateKey: string) => void;
  taskById: ReadonlyMap<string, Task>;
  taskDisplayStatusByTaskId?: Readonly<Record<string, TaskDisplayStatus>>;
  tasks: Task[];
  todayDateKey: string;
}) {
  const visibleTasks = tasks.slice(0, CALENDAR_VISIBLE_TASK_CAP);
  const overflowTasks = tasks.slice(CALENDAR_VISIBLE_TASK_CAP);
  const isToday = day.dateKey === todayDateKey;
  const isExpanded = expandedOverflowDateKey === day.dateKey;

  return (
    <div
      aria-label={`${formatTaskCalendarDate(day.date)}${isToday ? ", today" : ""}`}
      className={`group relative flex min-h-[8.25rem] min-w-0 flex-col border-t border-[#e9e4f4] p-1.5 dark:border-white/10 ${day.isCurrentMonth ? "bg-white dark:bg-white/[0.025]" : "bg-[#faf9fd] text-[#a2a3b5] dark:bg-white/[0.012] dark:text-white/35"} ${isToday ? "bg-[#fbf9ff] dark:bg-[#21183e]" : ""}`}
      role="gridcell"
    >
      <div className="flex items-center justify-between gap-1">
        <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold ${isToday ? "bg-[#eee8ff] text-[#6f57f6] ring-1 ring-[#cfc3ff] dark:bg-[#3b2f68] dark:text-[#d7ceff] dark:ring-[#6d56d6]" : day.isCurrentMonth ? "text-[#4b526e] dark:text-white/75" : "text-[#a6a6b5] dark:text-white/35"}`}>
          {day.dayOfMonth}
        </span>
        {day.isCurrentMonth ? (
          <button
            aria-label={`Add task due ${formatTaskCalendarDate(day.date)}`}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[#a198bd] opacity-0 transition hover:bg-[#eee8ff] hover:text-[#6f57f6] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9bbff] group-hover:opacity-100 dark:text-white/38 dark:hover:bg-white/10 dark:hover:text-[#cabfff]"
            onClick={() => onAddTask(day.dateKey)}
            title={`Add task due ${formatTaskCalendarDate(day.date)}`}
            type="button"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <div className="mt-1 min-h-0 space-y-0.5">
        {visibleTasks.map((task) => (
          <CalendarTaskButton
            key={task.id}
            onOpenTask={onOpenTask}
            task={task}
            taskById={taskById}
            taskDisplayStatusByTaskId={taskDisplayStatusByTaskId}
          />
        ))}
        {overflowTasks.length > 0 ? (
          <button
            aria-expanded={isExpanded}
            aria-label={`Show ${overflowTasks.length} more tasks for ${formatTaskCalendarDate(day.date)}`}
            className="w-full truncate rounded-[0.45rem] px-1 py-1 text-left text-[11px] font-semibold text-[#7865cf] transition hover:bg-[#f4efff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9bbff] dark:text-[#c9bbff] dark:hover:bg-white/[0.08]"
            onClick={() => onToggleOverflow(day.dateKey)}
            type="button"
          >
            +{overflowTasks.length} more
          </button>
        ) : null}
      </div>
      {isExpanded ? (
        <AdhdDropdownPanel className="absolute left-1 right-1 top-14 max-h-52 overflow-y-auto p-1.5" widthClassName="w-auto">
          <div className="space-y-0.5">
            {overflowTasks.map((task) => (
              <CalendarTaskButton
                key={task.id}
                onOpenTask={onOpenTask}
                task={task}
                taskById={taskById}
                taskDisplayStatusByTaskId={taskDisplayStatusByTaskId}
              />
            ))}
          </div>
        </AdhdDropdownPanel>
      ) : null}
    </div>
  );
}

export function TaskCalendarView({
  onAddTask,
  onOpenTask,
  taskDisplayStatusByTaskId,
  tasks,
}: TaskCalendarViewProps) {
  const [displayedMonth, setDisplayedMonth] = useState<TaskCalendarMonth>(() => getTaskCalendarMonth(new Date()));
  const [expandedOverflowDateKey, setExpandedOverflowDateKey] = useState<string | null>(null);
  const [isNoDueDateExpanded, setIsNoDueDateExpanded] = useState(false);
  const monthGrid = useMemo(() => getTaskCalendarMonthGrid(displayedMonth), [displayedMonth]);
  const tasksByDate = useMemo(() => groupTasksByCalendarDate(tasks), [tasks]);
  const noDueDateTasks = useMemo(() => tasks.filter((task) => task.due_on === null), [tasks]);
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task] as const)), [tasks]);
  const todayDateKey = getCalendarDateKey(new Date());

  const toggleOverflow = (dateKey: string) => {
    setExpandedOverflowDateKey((current) => current === dateKey ? null : dateKey);
  };

  return (
    <section aria-label="Tasks calendar" className="min-w-0 rounded-[1.25rem] border border-[#e7e1f2] bg-white dark:border-white/10 dark:bg-white/[0.035]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e9e4f4] px-3 py-2.5 dark:border-white/10">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-[#6f57f6] dark:text-[#cabfff]" />
          <h2 className="truncate text-sm font-semibold text-[#343b58] dark:text-white/85">{formatTaskCalendarMonth(displayedMonth)}</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <AdhdIconButton aria-label="Previous month" onClick={() => setDisplayedMonth((current) => shiftTaskCalendarMonth(current, -1))} size="sm" tone="ghost">
            <ChevronLeft />
          </AdhdIconButton>
          <AdhdChip className="px-3" onClick={() => setDisplayedMonth(getTaskCalendarMonth(new Date()))} toneClassName="border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]">
            Today
          </AdhdChip>
          <AdhdIconButton aria-label="Next month" onClick={() => setDisplayedMonth((current) => shiftTaskCalendarMonth(current, 1))} size="sm" tone="ghost">
            <ChevronRight />
          </AdhdIconButton>
        </div>
      </div>
      <div className="adhdice-scrollbar overflow-x-auto">
        <div className="min-w-[52rem]">
          <div className="grid grid-cols-7 border-b border-[#e9e4f4] bg-[#fbfaff] dark:border-white/10 dark:bg-white/[0.02]" role="row">
            {TASK_CALENDAR_WEEKDAY_LABELS.map((label) => (
              <div className="px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8c86a8] dark:text-white/42" key={label} role="columnheader">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 border-l border-[#e9e4f4] dark:border-white/10" role="grid">
            {monthGrid.map((day) => (
              <CalendarDayCell
                day={day}
                expandedOverflowDateKey={expandedOverflowDateKey}
                key={day.dateKey}
                onAddTask={onAddTask}
                onOpenTask={onOpenTask}
                onToggleOverflow={toggleOverflow}
                taskById={taskById}
                taskDisplayStatusByTaskId={taskDisplayStatusByTaskId}
                tasks={tasksByDate.get(day.dateKey) ?? []}
                todayDateKey={todayDateKey}
              />
            ))}
          </div>
        </div>
      </div>
      {noDueDateTasks.length > 0 ? (
        <div className="border-t border-[#e9e4f4] dark:border-white/10">
          <button
            aria-controls="tasks-calendar-no-due-date"
            aria-expanded={isNoDueDateExpanded}
            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs font-semibold text-[#4d456d] transition hover:bg-[#fbfaff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9bbff] dark:text-white/75 dark:hover:bg-white/[0.03]"
            onClick={() => setIsNoDueDateExpanded((current) => !current)}
            type="button"
          >
            <span>No Due Date · {noDueDateTasks.length}</span>
            <span aria-hidden="true" className="text-[#8f82d3]">{isNoDueDateExpanded ? "−" : "+"}</span>
          </button>
          {isNoDueDateExpanded ? (
            <div className="space-y-0.5 px-2 pb-2" id="tasks-calendar-no-due-date">
              {noDueDateTasks.map((task) => (
                <CalendarTaskButton
                  key={task.id}
                  onOpenTask={onOpenTask}
                  task={task}
                  taskById={taskById}
                  taskDisplayStatusByTaskId={taskDisplayStatusByTaskId}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
