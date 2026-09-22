"use client";

import type { ReactNode } from "react";
import { renderTaskStatusCircle } from "./task-status-ui";
import { formatActualSecondsLabel, formatRepeatSummary, formatTaskMetaLine } from "@/lib/task-formatting";
import { getSelectableTaskStatusesForTask } from "@/lib/task-complete";
import { preserveCurrentTaskStatusForPresentation } from "@/lib/task-state-engine/action-authority";
import { formatOptionLabel } from "@/lib/task-label-format";
import { formatTaskPriorityLevel, getTaskPriorityLevel, getTaskPriorityToneClass } from "@/lib/task-priority";
import { getNextPendingSubtask } from "@/lib/task-subtasks";
import { isTaskUrgent } from "@/lib/task-buckets";
import type { CustomBehaviorRuleset, Task, TaskStatus } from "@/lib/database.types";
import { TaskCurrentStreakChip } from "@/components/ui/task-table-primitives";
import { getTaskTypeSurfaceClassName } from "@/lib/task-type-presentation";
import { resolveTaskTypeSelectionOption } from "@/lib/task-type";

type CustomTaskTypeIdentity = Pick<CustomBehaviorRuleset, "id" | "name" | "task_type" | "icon_key" | "accent_key" | "description">;

function taskSurfaceClassName(task: Pick<Task, "task_type" | "custom_ruleset_id">, customBehaviorRulesets: readonly CustomTaskTypeIdentity[]) {
  const option = resolveTaskTypeSelectionOption(task.task_type, task.custom_ruleset_id, customBehaviorRulesets);
  return getTaskTypeSurfaceClassName(option.accentKey);
}
function EmptyTaskState({ text }: { text: string }) {
  return (
    <div className="rounded-[1.25rem] border border-dashed px-4 py-5 text-sm border-[#ddd6f9] bg-[#faf8ff] text-[#7b84a0] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55">
      {text}
    </div>
  );
}

function TaskMetaChip({ children, tone }: { children: ReactNode; tone: "blue" | "green" | "neutral" | "orange" | "purple" | "red" | "yellow" }) {
  const toneClasses = tone === "blue"
    ? "bg-[#edf6ff] text-[#3f8bdc] dark:bg-[#162434] dark:text-[#8bc4ff]"
    : tone === "green"
      ? "bg-[#eef9f4] text-[#12a876] dark:bg-[#17362d] dark:text-[#7de4b8]"
      : tone === "orange"
        ? "bg-[#fff1e7] text-[#dc6c1c] dark:bg-[#432712] dark:text-[#ffb37e]"
      : tone === "purple"
        ? "bg-[#f0ebff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]"
        : tone === "red"
          ? "bg-[#fff1f3] text-[#e04f66] dark:bg-[#3a1822] dark:text-[#ff9eaf]"
          : tone === "yellow"
            ? "bg-[#fff8e9] text-[#b98120] dark:bg-[#3a2a12] dark:text-[#ffd189]"
            : "bg-[#f3f4f8] text-[#5e6782] dark:bg-white/10 dark:text-white/70";

  return (
    <span className={`inline-flex shrink-0 whitespace-nowrap rounded-xl px-3 py-1.5 text-sm font-semibold ${toneClasses}`}>
      {children}
    </span>
  );
}

function TaskSupplementalMeta({ nextSubtask, task }: { nextSubtask: Task | null; task: Task }) {
  const visibleTags = task.tags.slice(0, 3);
  const repeatSummary = formatRepeatSummary(task);

  if (!task.one_step_at_a_time && visibleTags.length === 0 && !task.estimated_minutes && !repeatSummary && !task.external_link_url) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {task.one_step_at_a_time && nextSubtask ? <TaskMetaChip tone="purple">Next: {nextSubtask.title}</TaskMetaChip> : null}
      {visibleTags.map((tag) => <TaskMetaChip key={tag} tone="neutral">#{tag}</TaskMetaChip>)}
      {task.estimated_minutes ? <TaskMetaChip tone="neutral">{task.estimated_minutes} min</TaskMetaChip> : null}
      {repeatSummary ? <TaskMetaChip tone="blue">{repeatSummary}</TaskMetaChip> : null}
      {task.actual_seconds && task.actual_seconds > 0 ? <TaskMetaChip tone="green">{formatActualSecondsLabel(task.actual_seconds)}</TaskMetaChip> : null}
      {task.external_link_url ? (
        <a
          className="inline-flex shrink-0 whitespace-nowrap rounded-xl px-3 py-1.5 text-sm font-semibold bg-[#edf6ff] text-[#3f8bdc] dark:bg-[#162434] dark:text-[#8bc4ff]"
          href={task.external_link_url}
          rel="noreferrer"
          target="_blank"
        >
          {task.external_link_label || "Open link"}
        </a>
      ) : null}
    </div>
  );
}

export function TaskCardGalleryComponent({ currentStreakByTaskId, customBehaviorRulesets = [], focusedTaskIds, getTaskStatusOptions, onEditTask, onSetStatus, subtasksByTaskId, tasks }: { currentStreakByTaskId: Readonly<Record<string, number>>; customBehaviorRulesets?: readonly CustomTaskTypeIdentity[]; focusedTaskIds: string[]; getTaskStatusOptions?: (task: Task, currentStatus?: TaskStatus) => readonly TaskStatus[]; onEditTask: (task: Task) => void; onSetStatus: (task: Task, status: TaskStatus) => void; subtasksByTaskId: Record<string, Task[]>; tasks: Task[]; }) {
  return (
    <section className="mt-7">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tasks.length === 0 ? <EmptyTaskState text="No tasks match the current filters." /> : null}
        {tasks.map((task) => (
          <article className={`w-full overflow-hidden rounded-[1.7rem] border p-5 shadow-[0_18px_50px_rgba(81,61,168,0.07)] ${taskSurfaceClassName(task, customBehaviorRulesets)}`} key={task.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <button className="text-left text-xl font-bold text-[#1f2746] dark:text-white" onClick={() => onEditTask(task)} type="button">{task.title}</button>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="text-sm text-[#77829f] dark:text-white/55">{formatTaskMetaLine(task)}</p>
                  <TaskCurrentStreakChip currentStreak={currentStreakByTaskId[task.id] ?? 0} />
                </div>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getTaskPriorityToneClass(getTaskPriorityLevel(task))}`}>{formatTaskPriorityLevel(getTaskPriorityLevel(task))}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {focusedTaskIds.includes(task.id) ? <TaskMetaChip tone="purple">Focus</TaskMetaChip> : null}
              <TaskMetaChip tone={task.energy === "high" ? "blue" : task.energy === "medium" ? "neutral" : "green"}>{task.energy}</TaskMetaChip>
              <TaskMetaChip tone={getTaskPriorityLevel(task) === 5 ? "red" : getTaskPriorityLevel(task) === 4 ? "orange" : getTaskPriorityLevel(task) === 3 ? "yellow" : getTaskPriorityLevel(task) === 2 ? "blue" : "neutral"}>
                {`Priority ${formatTaskPriorityLevel(getTaskPriorityLevel(task))}`}
              </TaskMetaChip>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(() => {
                const availableStatuses = getTaskStatusOptions?.(task, task.status);
                const statusOptions = availableStatuses
                  ? preserveCurrentTaskStatusForPresentation(availableStatuses, task.status)
                  : getSelectableTaskStatusesForTask({ dueOn: task.due_on, repeatFrequency: task.repeat_frequency, status: task.status });
                return statusOptions.map((status) => {
                  const isActive = task.status === status;
                  const presentationOnly = Boolean(availableStatuses && !availableStatuses.includes(status));
                  return (
                    <button aria-label={`${presentationOnly ? "Current status" : "Set status to"} ${formatOptionLabel(status)}`} className={`h-7 w-7 rounded-full border-2 transition ${presentationOnly ? "cursor-default opacity-45" : isActive ? "border-[#202844] dark:border-white" : "border-transparent opacity-65 hover:opacity-100"}`} disabled={presentationOnly} key={status} onClick={() => onSetStatus(task, status)} title={formatOptionLabel(status)} type="button">
                      <span className="flex h-full w-full items-center justify-center">{renderTaskStatusCircle(status, "sm")}</span>
                    </button>
                  );
                });
              })()}
            </div>
            <TaskSupplementalMeta nextSubtask={getNextPendingSubtask(task.id, subtasksByTaskId)} task={task} />
            <div className="mt-5">
              <button className="ui-pill-button-strong-light" onClick={() => onEditTask(task)} type="button">Edit</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function TaskMatrixViewComponent({ currentStreakByTaskId, customBehaviorRulesets = [], getTaskStatusOptions, onEditTask, onSetStatus, subtasksByTaskId, tasks }: { currentStreakByTaskId: Readonly<Record<string, number>>; customBehaviorRulesets?: readonly CustomTaskTypeIdentity[]; getTaskStatusOptions?: (task: Task, currentStatus?: TaskStatus) => readonly TaskStatus[]; onEditTask: (task: Task) => void; onSetStatus: (task: Task, status: TaskStatus) => void; subtasksByTaskId: Record<string, Task[]>; tasks: Task[]; }) {
  const cells = [
    { key: "urgent-high", title: "Urgent + Higher Energy", tasks: tasks.filter((task) => isTaskUrgent(task) && task.energy !== "low") },
    { key: "urgent-low", title: "Urgent + Low Energy", tasks: tasks.filter((task) => isTaskUrgent(task) && task.energy === "low") },
    { key: "later-high", title: "Later + Higher Energy", tasks: tasks.filter((task) => !isTaskUrgent(task) && task.energy !== "low") },
    { key: "later-low", title: "Later + Low Energy", tasks: tasks.filter((task) => !isTaskUrgent(task) && task.energy === "low") },
  ];

  return (
    <section className="mt-7 grid gap-4 lg:grid-cols-2">
      {cells.map((cell) => (
        <div className="rounded-[2rem] border p-5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6" key={cell.key}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-[#28304a] dark:text-white">{cell.title}</h2>
            <span className="rounded-full px-3 py-1 text-xs font-semibold bg-[#f2edff] text-[#725af6] dark:bg-[#22193f] dark:text-[#cabfff]">{cell.tasks.length}</span>
          </div>
          <div className="mt-4 space-y-3">
            {cell.tasks.length === 0 ? <EmptyTaskState text="No tasks in this bucket." /> : null}
            {cell.tasks.map((task) => (
              <div className={`flex w-full items-center justify-between gap-3 rounded-[1.2rem] border px-4 py-3 ${taskSurfaceClassName(task, customBehaviorRulesets)}`} key={task.id}>
                <div className="min-w-0">
                  <button className="truncate text-left text-base font-semibold text-[#27304c] dark:text-white" onClick={() => onEditTask(task)} type="button">{task.title}</button>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="text-xs text-[#7d88a1] dark:text-white/55">{formatTaskMetaLine(task)}</p>
                    <TaskCurrentStreakChip currentStreak={currentStreakByTaskId[task.id] ?? 0} />
                  </div>
                  {task.one_step_at_a_time && getNextPendingSubtask(task.id, subtasksByTaskId) ? <p className="mt-1 text-xs font-semibold text-[#6f57f6] dark:text-[#cabfff]">Next: {getNextPendingSubtask(task.id, subtasksByTaskId)?.title}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const availableStatuses = getTaskStatusOptions?.(task, task.status);
                    const statusOptions = availableStatuses
                      ? preserveCurrentTaskStatusForPresentation(availableStatuses, task.status)
                      : getSelectableTaskStatusesForTask({ dueOn: task.due_on, repeatFrequency: task.repeat_frequency, status: task.status });
                    return statusOptions.map((status) => {
                      const isActive = task.status === status;
                      const presentationOnly = Boolean(availableStatuses && !availableStatuses.includes(status));
                      return (
                        <button aria-label={`${presentationOnly ? "Current status" : "Set status to"} ${formatOptionLabel(status)}`} className={`h-6 w-6 rounded-full border-2 transition ${presentationOnly ? "cursor-default opacity-45" : isActive ? "border-[#202844] dark:border-white" : "border-transparent opacity-65 hover:opacity-100"}`} disabled={presentationOnly} key={status} onClick={() => onSetStatus(task, status)} title={formatOptionLabel(status)} type="button">
                          <span className="flex h-full w-full items-center justify-center">{renderTaskStatusCircle(status, "sm")}</span>
                        </button>
                      );
                    });
                  })()}
                  <button className="ui-pill-button-strong-light" onClick={() => onEditTask(task)} type="button">Edit</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
