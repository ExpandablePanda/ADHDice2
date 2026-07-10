"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { TaskDraft } from "./task-editor-model";
import { renderTaskStatusCircle } from "./task-status-ui";
import { formatActualSecondsLabel, formatRepeatSummary, formatTaskMetaLine } from "@/lib/task-formatting";
import { getSelectableTaskStatuses } from "@/lib/task-complete";
import { formatOptionLabel } from "@/lib/task-label-format";
import { buildTaskPriorityUpdate, formatTaskPriorityLevel, getTaskPriorityLevel, getTaskPriorityToneClass, type TaskPriorityLevelOption, TASK_PRIORITY_LEVEL_OPTIONS } from "@/lib/task-priority";
import { getNextPendingSubtask } from "@/lib/task-subtasks";
import { isTaskUrgent } from "@/lib/task-buckets";
import { formatDueLabel } from "@/lib/task-cockpit";
import type { Task, TaskEnergy, TaskStatus, TaskSubtask as DbTaskSubtask } from "@/lib/database.types";

type SelectProps<T extends string> = {
  label: string;
  onChange: (value: T) => void;
  options: T[];
  showLabel?: boolean;
  value: T;
};

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

const ENERGY_OPTIONS: TaskEnergy[] = ["none", "low", "medium", "high"];
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

function TaskSupplementalMeta({ nextSubtask, task }: { nextSubtask: DbTaskSubtask | null; task: Task }) {
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

export function TaskComposerCardComponent({
  onAdd,
  SelectComponent,
}: {
  onAdd: (draft: { focusToday: boolean; values: TaskDraft }) => Promise<void>;
  SelectComponent: <T extends string>(props: SelectProps<T>) => React.JSX.Element;
}) {
  const [title, setTitle] = useState("");
  const [focusToday, setFocusToday] = useState(false);
  const [priorityLevel, setPriorityLevel] = useState<TaskPriorityLevelOption>("0");
  const [energy, setEnergy] = useState<TaskEnergy>("none");
  const [dueOn, setDueOn] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <section className="rounded-[2rem] border p-5 transition hover:-translate-y-0.5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6">
      <div className="mb-4">
        <h2 className="text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white">Quick Capture</h2>
        <p className="mt-2 text-sm text-[#78829c] dark:text-white/55">Keep the task cards focused. Capture one next action, assign energy, and move on.</p>
      </div>

      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const trimmedTitle = title.trim();
          if (!trimmedTitle) return;
          setIsSubmitting(true);
          await onAdd({
            focusToday,
            values: {
              ...buildTaskPriorityUpdate(Number.parseInt(priorityLevel, 10) as 0 | 1 | 2 | 3 | 4 | 5),
              title: trimmedTitle,
              energy,
              due_on: dueOn || null,
            },
          });
          setFocusToday(false);
          setTitle("");
          setDueOn("");
          setIsSubmitting(false);
        }}
      >
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-[#5f6983] dark:text-white/65">Task title</span>
          <input className="h-14 w-full rounded-[1.25rem] px-4 text-lg outline-none bg-[#f7f5ff] text-[#1f2642] placeholder:text-[#9b9fba] dark:bg-white/8 dark:text-white dark:placeholder:text-white/30" onChange={(event) => setTitle(event.target.value)} placeholder="Drink water, clear email, write first paragraph..." value={title} />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <SelectComponent label="Priority" onChange={setPriorityLevel} options={[...TASK_PRIORITY_LEVEL_OPTIONS]} showLabel value={priorityLevel} />
          <SelectComponent label="Energy" onChange={setEnergy} options={ENERGY_OPTIONS} showLabel value={energy} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={`inline-flex items-center rounded-xl px-3 py-2 text-sm font-semibold transition ${focusToday
              ? "bg-[#f0ebff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]"
              : "bg-[#f3f4f8] text-[#5e6782] dark:bg-white/10 dark:text-white/70"}`}
            onClick={() => setFocusToday((current) => !current)}
            type="button"
          >
            Focus Today
          </button>
        </div>
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-[#5f6983] dark:text-white/65">Due date</span>
          <input className="h-14 w-full rounded-[1.25rem] px-4 text-lg outline-none bg-[#f7f5ff] text-[#1f2642] dark:bg-white/8 dark:text-white" onChange={(event) => setDueOn(event.target.value)} type="date" value={dueOn} />
        </label>
        <button className="ui-pill-button-strong-light w-full" disabled={isSubmitting} type="submit">Add Task</button>
      </form>
    </section>
  );
}

export function SupportPanelComponent({ doneCount, lowEnergyTasks, message, onImport }: { doneCount: number; lowEnergyTasks: Task[]; message: Message | null; onImport: (lines: string[]) => Promise<void>; }) {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lines = text.split("\n").map((line) => line.trim().replace(/^[-*]\s+/, "")).filter(Boolean);

  return (
    <div className="grid gap-5">
      <section className="rounded-[2rem] border p-5 transition hover:-translate-y-0.5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6">
        <h2 className="text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white">Low Energy Wins</h2>
        <div className="mt-4 space-y-3">
          {lowEnergyTasks.length === 0 ? <EmptyTaskState text="No low-energy tasks match the current filters." /> : null}
          {lowEnergyTasks.map((task) => (
            <div className="rounded-[1.25rem] px-4 py-3 bg-[#f8f5ff] dark:bg-white/8" key={task.id}>
              <p className="text-base font-semibold text-[#26304c] dark:text-white">{task.title}</p>
              <p className="mt-1 text-sm text-[#7d88a1] dark:text-white/55">{formatDueLabel(task.due_on)} / low effort</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border p-5 transition hover:-translate-y-0.5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6">
        <h2 className="text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white">Import List</h2>
        <p className="mt-2 text-sm text-[#78829c] dark:text-white/55">Paste a rough list and turn it into calm, structured tasks.</p>

        <form className="mt-4 space-y-3" onSubmit={async (event) => { event.preventDefault(); setIsSubmitting(true); await onImport(lines); setText(""); setIsSubmitting(false); }}>
          <textarea className="min-h-36 w-full resize-y rounded-[1.25rem] px-4 py-4 text-base outline-none bg-[#f7f5ff] text-[#1f2642] placeholder:text-[#9b9fba] dark:bg-white/8 dark:text-white dark:placeholder:text-white/30" onChange={(event) => setText(event.target.value)} placeholder={"Call dentist\nDrink water\nChoose dinner"} value={text} />
          <button className="ui-pill-button-strong-light w-full" disabled={lines.length === 0 || isSubmitting} type="submit">Import {lines.length || ""}</button>
        </form>

        <p className="mt-3 text-sm text-[#8c94ac] dark:text-white/45">{message?.text}</p>
      </section>

      <section className="rounded-[2rem] border p-5 transition hover:-translate-y-0.5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/35">Completed</p>
        <p className="mt-2 text-4xl font-black text-[#1f2746] dark:text-white">{doneCount}</p>
      </section>
    </div>
  );
}

export function TaskLaneComponent({ count, defaultExpanded = false, onEditTask, subtasksByTaskId, title, tasks, tone }: { count: number; defaultExpanded?: boolean; onEditTask: (task: Task) => void; subtasksByTaskId: Record<string, DbTaskSubtask[]>; title: string; tasks: Task[]; tone: "purple" | "soft"; }) {
  const DEFAULT_VISIBLE_COUNT = 3;
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const visibleTasks = isExpanded ? tasks : tasks.slice(0, DEFAULT_VISIBLE_COUNT);
  const hiddenCount = Math.max(0, tasks.length - visibleTasks.length);

  return (
    <section className="w-full overflow-hidden rounded-[2rem] border p-5 transition hover:-translate-y-0.5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white">{title}</h2>
        <div className="flex items-center gap-2">
          <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${tone === "purple" ? "bg-[#f2edff] text-[#725af6] dark:bg-[#22193f] dark:text-[#cabfff]" : "bg-[#f6f7fb] text-[#6a738d] dark:bg-white/8 dark:text-white/65"}`}>{count}</span>
          {tasks.length > DEFAULT_VISIBLE_COUNT ? <button aria-label={isExpanded ? `Collapse ${title}` : `Expand ${title}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f6f2ff] text-[#6f57f6] dark:bg-white/8 dark:text-[#cabfff]" onClick={() => setIsExpanded((prev) => !prev)} type="button">{isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button> : null}
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {tasks.length === 0 ? <EmptyTaskState text={`No tasks in ${title.toLowerCase()} right now.`} /> : null}
        {visibleTasks.map((task, index) => (
          <div className="w-full overflow-hidden rounded-[1.25rem] border px-4 py-3 border-[#efeaf9] bg-[#fdfcff] dark:border-white/10 dark:bg-white/[0.04]" key={task.id}>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <button className="truncate text-left text-lg font-semibold text-[#27304c] dark:text-white" onClick={() => onEditTask(task)} type="button">{task.title}</button>
                <p className="mt-1 text-sm text-[#7d88a1] dark:text-white/55">{formatTaskMetaLine(task)}</p>
                <TaskSupplementalMeta nextSubtask={getNextPendingSubtask(task.id, subtasksByTaskId)} task={task} />
              </div>
              <div className="flex items-center gap-2 sm:shrink-0">
                <span className={`self-start rounded-full px-3 py-1 text-xs font-semibold ${index % 2 === 0 ? "bg-[#ede8ff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]" : "bg-[#eef9f4] text-[#12a876] dark:bg-[#17362d] dark:text-[#7de4b8]"}`}>{index % 2 === 0 ? "Visible" : "Queued"}</span>
                <button className="ui-pill-button-strong-light" onClick={() => onEditTask(task)} type="button">Edit</button>
              </div>
            </div>
          </div>
        ))}
        {tasks.length > DEFAULT_VISIBLE_COUNT ? <button className="ui-pill-button-light w-full" onClick={() => setIsExpanded((prev) => !prev)} type="button">{isExpanded ? "Show fewer" : `Show ${hiddenCount} more`}</button> : null}
      </div>
    </section>
  );
}

export function TaskCardGalleryComponent({ focusedTaskIds, onEditTask, onSetStatus, subtasksByTaskId, tasks }: { focusedTaskIds: string[]; onEditTask: (task: Task) => void; onSetStatus: (task: Task, status: TaskStatus) => void; subtasksByTaskId: Record<string, DbTaskSubtask[]>; tasks: Task[]; }) {
  return (
    <section className="mt-7">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tasks.length === 0 ? <EmptyTaskState text="No tasks match the current filters." /> : null}
        {tasks.map((task) => (
          <article className="w-full overflow-hidden rounded-[1.7rem] border p-5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6" key={task.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <button className="text-left text-xl font-bold text-[#1f2746] dark:text-white" onClick={() => onEditTask(task)} type="button">{task.title}</button>
                <p className="mt-2 text-sm text-[#77829f] dark:text-white/55">{formatTaskMetaLine(task)}</p>
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
              {getSelectableTaskStatuses(task).map((status) => {
                const isActive = task.status === status;
                return (
                  <button aria-label={`Set status to ${formatOptionLabel(status)}`} className={`h-7 w-7 rounded-full border-2 transition ${isActive ? "border-[#202844] dark:border-white" : "border-transparent opacity-65 hover:opacity-100"}`} key={status} onClick={() => onSetStatus(task, status)} title={formatOptionLabel(status)} type="button">
                    <span className="flex h-full w-full items-center justify-center">{renderTaskStatusCircle(status, "sm")}</span>
                  </button>
                );
              })}
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

export function TaskMatrixViewComponent({ onEditTask, onSetStatus, subtasksByTaskId, tasks }: { onEditTask: (task: Task) => void; onSetStatus: (task: Task, status: TaskStatus) => void; subtasksByTaskId: Record<string, DbTaskSubtask[]>; tasks: Task[]; }) {
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
              <div className="flex w-full items-center justify-between gap-3 rounded-[1.2rem] border px-4 py-3 border-[#efeaf9] bg-[#fdfcff] dark:border-white/10 dark:bg-white/[0.04]" key={task.id}>
                <div className="min-w-0">
                  <button className="truncate text-left text-base font-semibold text-[#27304c] dark:text-white" onClick={() => onEditTask(task)} type="button">{task.title}</button>
                  <p className="mt-1 text-xs text-[#7d88a1] dark:text-white/55">{formatTaskMetaLine(task)}</p>
                  {task.one_step_at_a_time && getNextPendingSubtask(task.id, subtasksByTaskId) ? <p className="mt-1 text-xs font-semibold text-[#6f57f6] dark:text-[#cabfff]">Next: {getNextPendingSubtask(task.id, subtasksByTaskId)?.title}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  {getSelectableTaskStatuses(task).map((status) => {
                    const isActive = task.status === status;
                    return (
                      <button aria-label={`Set status to ${formatOptionLabel(status)}`} className={`h-6 w-6 rounded-full border-2 transition ${isActive ? "border-[#202844] dark:border-white" : "border-transparent opacity-65 hover:opacity-100"}`} key={status} onClick={() => onSetStatus(task, status)} title={formatOptionLabel(status)} type="button">
                        <span className="flex h-full w-full items-center justify-center">{renderTaskStatusCircle(status, "sm")}</span>
                      </button>
                    );
                  })}
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
