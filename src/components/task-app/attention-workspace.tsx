"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, CalendarClock, Clock3, ListTodo } from "lucide-react";
import { AdhdCard, AdhdChip, AdhdPanel } from "@/components/ui-system";
import type { Task } from "@/lib/database.types";
import type { TaskDisplayStatus, TaskDisplayStatusByTaskId } from "@/lib/task-display-status";
import { buildAttentionTaskSections, formatAttentionTaskTiming } from "@/lib/task-attention";
import { formatTaskPriorityLabel, getTaskPriorityLevel } from "@/lib/task-priority";
import { formatTaskStatusLabel } from "./task-status-ui";
import { PursuitsWorkspace, type PursuitsWorkspaceProps } from "./pursuits-workspace";

type AttentionWorkspaceProps = PursuitsWorkspaceProps & {
  dueOnByTaskId: Record<string, string | null>;
  onOpenTask: (taskId: string) => void;
  statusesByTaskId: TaskDisplayStatusByTaskId;
  tasks: Task[];
  todayKey: string;
};

export function AttentionWorkspace({
  dueOnByTaskId,
  onOpenTask,
  statusesByTaskId,
  tasks,
  todayKey,
  ...pursuitProps
}: AttentionWorkspaceProps) {
  const sections = useMemo(
    () => buildAttentionTaskSections({ dueOnByTaskId, statusesByTaskId, tasks, todayKey }),
    [dueOnByTaskId, statusesByTaskId, tasks, todayKey],
  );
  const [showAllComingUp, setShowAllComingUp] = useState(false);
  const visibleComingUp = showAllComingUp ? sections.comingUp : sections.comingUp.slice(0, 6);

  return (
    <section className="mt-5 grid min-w-0 gap-4">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#9b92be] dark:text-white/35">Tasks workspace</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#39334b] dark:text-white/88">Attention</h1>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[#7b748e] dark:text-white/55">A compact working view for what needs a decision now and what is coming up.</p>
        </div>
        <AdhdChip icon={<ListTodo className="h-3.5 w-3.5" />} tone="purple">Task + Pursuit view</AdhdChip>
      </div>

      <AttentionTaskSection
        emptyText="Nothing is overdue, missed, or due today."
        icon={<CalendarClock className="h-4 w-4" />}
        title="Needs Action"
        tone="missed"
        tasks={sections.needsAction}
        todayKey={todayKey}
        statusesByTaskId={statusesByTaskId}
        dueOnByTaskId={dueOnByTaskId}
        onOpenTask={onOpenTask}
      />
      <AttentionTaskSection
        emptyText="No Tasks are currently In Progress."
        icon={<ArrowRight className="h-4 w-4" />}
        title="In Progress"
        tone="progress"
        tasks={sections.inProgress}
        todayKey={todayKey}
        statusesByTaskId={statusesByTaskId}
        dueOnByTaskId={dueOnByTaskId}
        onOpenTask={onOpenTask}
      />

      <PursuitsWorkspace {...pursuitProps} />

      <AdhdPanel title="Coming Up" subtitle="Future Tasks remain awareness, not urgency.">
        {visibleComingUp.length === 0 ? (
          <p className="rounded-[1rem] border border-dashed border-[#ded6f3] bg-[#fbfaff] px-4 py-4 text-sm text-[#766f8d] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/58">No upcoming Tasks with a scheduled date.</p>
        ) : (
          <div className="grid gap-2">
            {visibleComingUp.map((task) => (
              <AttentionTaskRow
                dueOn={dueOnByTaskId[task.id] ?? task.due_on}
                key={task.id}
                onOpen={() => onOpenTask(task.id)}
                status={statusesByTaskId[task.id] ?? task.status}
                task={task}
                todayKey={todayKey}
              />
            ))}
            {sections.comingUp.length > 6 ? (
              <button className="justify-self-start px-1 text-xs font-semibold text-[#6f57f6] hover:underline dark:text-[#c9bbff]" onClick={() => setShowAllComingUp((current) => !current)} type="button">
                {showAllComingUp ? "Show fewer" : `Show ${sections.comingUp.length - 6} more`}
              </button>
            ) : null}
          </div>
        )}
      </AdhdPanel>
    </section>
  );
}

function AttentionTaskSection({
  dueOnByTaskId,
  emptyText,
  icon,
  onOpenTask,
  statusesByTaskId,
  tasks,
  title,
  todayKey,
  tone,
}: {
  dueOnByTaskId: Record<string, string | null>;
  emptyText: string;
  icon: ReactNode;
  onOpenTask: (taskId: string) => void;
  statusesByTaskId: TaskDisplayStatusByTaskId;
  tasks: Task[];
  title: string;
  todayKey: string;
  tone: "missed" | "progress";
}) {
  return (
    <AdhdPanel title={title} subtitle={title === "Needs Action" ? "Present decisions from the canonical Task view." : "Tasks already underway, separated from more urgent rows."}>
      {tasks.length === 0 ? (
        <p className="rounded-[1rem] border border-dashed border-[#ded6f3] bg-[#fbfaff] px-4 py-4 text-sm text-[#766f8d] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/58">{emptyText}</p>
      ) : (
        <div className="grid gap-2">
          {tasks.map((task) => (
            <AttentionTaskRow
              dueOn={dueOnByTaskId[task.id] ?? task.due_on}
              icon={icon}
              key={task.id}
              onOpen={() => onOpenTask(task.id)}
              status={statusesByTaskId[task.id] ?? task.status}
              task={task}
              todayKey={todayKey}
              tone={tone}
            />
          ))}
        </div>
      )}
    </AdhdPanel>
  );
}

function AttentionTaskRow({
  dueOn,
  icon = <Clock3 className="h-4 w-4" />,
  onOpen,
  status,
  task,
  todayKey,
  tone = "progress",
}: {
  dueOn: string | null;
  icon?: ReactNode;
  onOpen: () => void;
  status: TaskDisplayStatus;
  task: Task;
  todayKey: string;
  tone?: "missed" | "progress";
}) {
  const priority = getTaskPriorityLevel(task);
  return (
    <AdhdCard className="!rounded-[1rem] !p-3" interactive>
      <button className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9a8ff] focus-visible:ring-offset-2 dark:focus-visible:ring-[#7f67ff] dark:focus-visible:ring-offset-[#1b1530]" onClick={onOpen} type="button">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone === "missed" ? "bg-[#fff0f3] text-[#d65775] dark:bg-[#32161d] dark:text-[#ffb0c1]" : "bg-[#eef5ff] text-[#4f73b8] dark:bg-[#17243a] dark:text-[#b7cdfd]"}`}>
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-[#47415a] dark:text-white/84">{task.title}</span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#7f7893] dark:text-white/55">
              <span>{formatAttentionTaskTiming(task, status, todayKey, dueOn)}</span>
              <span aria-hidden="true">·</span>
              <span>{formatTaskStatusLabel(status)}</span>
              {priority >= 4 ? <><span aria-hidden="true">·</span><span>{formatTaskPriorityLabel(priority)}</span></> : null}
              {task.estimated_minutes && task.estimated_minutes > 0 ? <><span aria-hidden="true">·</span><span>{task.estimated_minutes}m estimate</span></> : null}
            </span>
          </span>
        </div>
      </button>
    </AdhdCard>
  );
}
