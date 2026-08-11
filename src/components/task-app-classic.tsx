"use client";

import { useState } from "react";
import { todayISO } from "@/lib/utils";
import type {
  Task,
  TaskEnergy,
  TaskInsert,
  TaskPriority,
  TaskStatus,
  TaskUpdate,
} from "@/lib/database.types";
import { isTaskStateRuntimeLifecycleTransition } from "@/lib/task-state-runtime-actions";
import { TASK_STATE_CANONICAL_COMMANDS_ENABLED } from "@/lib/task-state-runtime-gate";

type Message = {
  tone: "neutral" | "good" | "warn";
  text: string;
};

type TaskDraft = Omit<TaskInsert, "user_id">;
type PlannerView = "List" | "Board" | "Calendar";

const priorityOptions: TaskPriority[] = ["normal", "high", "low"];
const energyOptions: TaskEnergy[] = ["medium", "low", "high"];

const navItems = [
  { label: "Home", short: "H" },
  { label: "Tasks", short: "T", active: true },
  { label: "Calendar", short: "C" },
  { label: "Projects", short: "P" },
  { label: "Focus", short: "F" },
];

const toolbarTabs = ["All Tasks", "Today", "Upcoming", "Projects"];

const focusAreas = [
  { name: "Admin", count: 16, progress: 68, tone: "blue" },
  { name: "Home", count: 14, progress: 45, tone: "green" },
  { name: "Deep Work", count: 12, progress: 72, tone: "purple" },
  { name: "Errands", count: 18, progress: 31, tone: "amber" },
];

const demoTaskTitles = [
  "Plan the morning priority list",
  "Clear the kitchen counter",
  "Reply to Morgan about the project notes",
  "Book dentist appointment",
  "Review the March receipts",
  "Draft launch checklist",
  "Refill the pill organizer",
  "Move laundry to dryer",
  "Update project roadmap",
  "Schedule car inspection",
  "Write two paragraphs for proposal",
  "Set up weekly budget categories",
  "Water office plants",
  "Send invoice reminder",
  "Prep gym bag",
  "Clean out desktop downloads",
  "Choose dinners for the week",
  "Renew library books",
  "Sketch reward table ideas",
  "Message Jamie about Saturday",
  "Set timer for 25 minute focus block",
  "Archive old screenshots",
  "Compare grocery pickup slots",
  "Create focus playlist",
  "Organize tax documents",
  "Add missing project tasks",
  "Call pharmacy",
  "Plan tomorrow's first step",
  "Tidy nightstand",
  "Read onboarding notes",
  "Update personal CRM reminders",
  "Pick one small admin task",
  "Clean email promotions tab",
  "Check calendar conflicts",
  "Make appointment notes template",
  "Sort mail pile",
  "Review habit streaks",
  "Pack returns by front door",
  "Write status update",
  "Charge headphones",
  "Plan deep work block",
  "Create grocery staples list",
  "Follow up on repair quote",
  "Clean coffee station",
  "Review open loops list",
  "Add rewards to dice table",
  "Pay utility bill",
  "Set out tomorrow's clothes",
  "Update bookmarks folder",
  "Make quick lunch plan",
  "Check subscription renewals",
  "Draft meeting agenda",
  "Run dishwasher",
  "Review focus timer goals",
  "Text family group back",
  "Prepare recycling",
  "Choose next book",
  "Capture loose sticky notes",
  "Plan weekend errands",
  "Close three browser tabs",
];

export function TaskApp() {
  const [tasks, setTasks] = useState<Task[]>(() => createDemoTasks());
  const [message, setMessage] = useState<Message | null>({
    tone: "neutral",
    text: "Demo mode: 60 premade tasks are loaded locally. Nothing is saved to Supabase.",
  });

  const activeTasks = tasks.filter((task) => task.status === "pending" || task.status === "in_progress");
  const doneTasks = tasks.filter((task) => task.status === "done");
  const todayTasks = activeTasks.filter((task) => isDueToday(task.due_on));
  const overdueTasks = activeTasks.filter((task) => isOverdue(task.due_on));
  const dueSoonTasks = activeTasks
    .filter((task) => task.due_on)
    .sort((a, b) => String(a.due_on).localeCompare(String(b.due_on)))
    .slice(0, 5);

  async function addTask(task: TaskDraft) {
    const now = new Date().toISOString();
    setTasks((current) => [{
      id: `demo-new-${Date.now()}`,
      user_id: "demo-user",
      title: task.title,
      notes: task.notes ?? null,
      status: task.status ?? "pending",
      priority: task.priority ?? "normal",
      energy: task.energy ?? "medium",
      is_urgent: false,
      is_important: false,
      due_on: task.due_on ?? null,
      due_time: null,
      estimated_minutes: null,
      tags: [],
      external_link_label: null,
      external_link_url: null,
      one_step_at_a_time: false,
      subtasks_auto_reset: false,
      repeat_frequency: "none",
      repeat_interval: 1,
      repeat_days_of_week: [],
      repeat_day_of_month: null,
      sort_order: Date.now(),
      completed_at: null,
      actual_seconds: 0,
      created_at: now,
      updated_at: now,
    }, ...current]);

    setMessage({ tone: "good", text: "Task captured in the local demo list." });
  }

  async function importTasks(lines: string[]) {
    if (lines.length === 0) return;

    const now = new Date().toISOString();
    const imported: Task[] = lines.map((title, index) => ({
      id: `demo-import-${Date.now()}-${index}`,
      user_id: "demo-user",
      title,
      notes: "Imported from the planning assistant.",
      status: "pending" as const,
      priority: priorityOptions[index % priorityOptions.length],
      energy: energyOptions[index % energyOptions.length],
      is_urgent: false,
      is_important: false,
      due_on: addDaysISO(index % 8),
      due_time: null,
      estimated_minutes: null,
      tags: [],
      external_link_label: null,
      external_link_url: null,
      one_step_at_a_time: false,
      subtasks_auto_reset: false,
      repeat_frequency: "none",
      repeat_interval: 1,
      repeat_days_of_week: [],
      repeat_day_of_month: null,
      sort_order: Date.now() + index,
      completed_at: null,
      actual_seconds: 0,
      created_at: now,
      updated_at: now,
    }));

    setTasks((current) => [...imported, ...current]);
    setMessage({
      tone: "good",
      text: `${lines.length} task${lines.length === 1 ? "" : "s"} imported into the demo.`,
    });
  }

  async function updateTask(taskId: string, values: TaskUpdate) {
    const currentTask = tasks.find((task) => task.id === taskId);
    if (
      TASK_STATE_CANONICAL_COMMANDS_ENABLED
      && currentTask
      && values.status !== undefined
      && isTaskStateRuntimeLifecycleTransition(currentTask, values.status)
    ) {
      setMessage({ tone: "warn", text: "Canonical lifecycle commands are not yet wired for the classic Task surface; no legacy lifecycle fallback was used." });
      return false;
    }
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, ...values, updated_at: new Date().toISOString() } : task,
      ),
    );
  }

  return (
    <Shell
      status={`${tasks.length} demo tasks / ${activeTasks.length} active`}
    >
      <DashboardHeader
        activeCount={activeTasks.length}
        doneCount={doneTasks.length}
        overdueCount={overdueTasks.length}
        todayCount={todayTasks.length}
      />

      <TaskPlanner
        doneCount={doneTasks.length}
        tasks={activeTasks}
        onAdd={addTask}
        onArchive={(task) => updateTask(task.id, { status: "archived" })}
        onToggle={(task) =>
          updateTask(task.id, {
            status: "done",
            completed_at: new Date().toISOString(),
          })
        }
      />

      <section className="grid gap-4 xl:grid-cols-3">
        <DeadlinesCard tasks={dueSoonTasks} />
        <ProjectsCard activeCount={activeTasks.length} doneCount={doneTasks.length} />
        <AssistantCard
          completedToday={doneTasks.filter((task) => completedToday(task.completed_at)).length}
          message={message}
          onImport={importTasks}
        />
      </section>
    </Shell>
  );
}

function Shell({
  children,
  status,
}: {
  children?: React.ReactNode;
  status: string;
}) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ffffff_0,#f6f8fb_34%,#eef2f7_100%)] px-3 py-4 text-slate-900 sm:px-5 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-[94rem] grid-cols-1 rounded-[2rem] border border-white/80 bg-white/90 p-2 shadow-[0_28px_90px_rgba(30,41,59,0.14),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur md:grid-cols-[4.5rem_minmax(0,1fr)]">
        <Sidebar />
        <div className="flex min-w-0 flex-col rounded-[1.5rem] bg-[#f8fafc] p-3 shadow-inner shadow-slate-200/60 sm:p-4 lg:p-5">
          <TopToolbar status={status} />
          <div className="mt-5 space-y-4">{children}</div>
        </div>
      </div>
    </main>
  );
}

function Sidebar() {
  return (
    <aside className="hidden flex-col items-center gap-3 px-2 py-4 md:flex">
      <div className="mb-2 grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-sm font-semibold text-white shadow-lg shadow-slate-300">
        AD
      </div>
      <nav aria-label="Primary" className="flex flex-1 flex-col items-center gap-2">
        {navItems.map((item) => (
          <button
            aria-label={item.label}
            className={`grid h-10 w-10 place-items-center rounded-full border text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-md ${
              item.active
                ? "border-blue-100 bg-blue-50 text-blue-700 shadow-sm"
                : "border-slate-200 bg-white text-slate-500 hover:text-slate-900"
            }`}
            key={item.label}
            title={item.label}
            type="button"
          >
            {item.short}
          </button>
        ))}
      </nav>
      <button
        aria-label="Settings"
        className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-500 transition hover:-translate-y-0.5 hover:text-slate-900 hover:shadow-md"
        title="Settings"
        type="button"
      >
        S
      </button>
    </aside>
  );
}

function TopToolbar({ status }: { status: string }) {
  return (
    <header className="flex flex-col gap-3 rounded-full border border-white bg-white/90 p-2 shadow-[0_10px_30px_rgba(15,23,42,0.08)] lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-950 text-xs font-semibold text-white md:hidden">
          AD
        </div>
        <div className="flex gap-1 overflow-x-auto rounded-full bg-slate-100 p-1">
          {toolbarTabs.map((tab, index) => (
            <button
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
                index === 0
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-500 hover:bg-white/80 hover:text-slate-900"
              }`}
              key={tab}
              type="button"
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="min-w-0 flex-1 sm:flex-none">
          <span className="sr-only">Search tasks</span>
          <input
            className="h-10 w-full rounded-full border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100 sm:w-48"
            placeholder="Search"
            type="search"
          />
        </label>
        <AvatarStack />
        <button
          className="h-10 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          type="button"
        >
          New Task
        </button>
        <span className="hidden h-10 items-center rounded-full bg-slate-100 px-3 text-xs font-medium text-slate-500 xl:flex">
          {status}
        </span>
        <span
          className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-emerald-500 text-xs font-semibold text-white"
          title="Demo profile"
        >
          DM
        </span>
        <span className="hidden h-10 items-center rounded-full px-3 text-sm font-medium text-slate-500 sm:flex">
          Demo
        </span>
      </div>
    </header>
  );
}

function DashboardHeader({
  activeCount,
  doneCount,
  overdueCount,
  todayCount,
}: {
  activeCount: number;
  doneCount: number;
  overdueCount: number;
  todayCount: number;
}) {
  return (
    <section className="flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-medium text-blue-700">Task planner</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950 sm:text-[1.7rem]">
          My Tasks
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {activeCount} active, {todayCount} due today, {overdueCount} overdue
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:min-w-80">
        <Metric label="Active" value={activeCount} />
        <Metric label="Done" value={doneCount} />
        <Metric label="Overdue" value={overdueCount} warn={overdueCount > 0} />
      </div>
    </section>
  );
}

function Metric({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-white bg-white px-3 py-2 shadow-sm">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold ${warn ? "text-rose-600" : "text-slate-950"}`}>
        {value}
      </p>
    </div>
  );
}

function TaskPlanner({
  tasks,
  doneCount,
  onAdd,
  onArchive,
  onToggle,
}: {
  tasks: Task[];
  doneCount: number;
  onAdd: (task: TaskDraft) => Promise<void>;
  onArchive: (task: Task) => void;
  onToggle: (task: Task) => void;
}) {
  const [view, setView] = useState<PlannerView>("List");
  const today = tasks.filter((task) => isDueToday(task.due_on));
  const next = tasks.filter((task) => !isDueToday(task.due_on) && !isLater(task.due_on));
  const later = tasks.filter((task) => isLater(task.due_on));

  return (
    <section className="rounded-[1.35rem] border border-white bg-white p-3 shadow-[0_16px_45px_rgba(15,23,42,0.08)] sm:p-4 lg:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Today&apos;s Tasks</h2>
          <p className="text-sm text-slate-500">
            Capture fast, then sort by urgency, energy, and due date.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["List", "Board", "Calendar"] as PlannerView[]).map((option) => (
            <button
              className={`rounded-full border px-3 py-2 text-sm font-medium transition ${
                view === option
                  ? "border-blue-100 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-500 hover:text-slate-950"
              }`}
              key={option}
              onClick={() => setView(option)}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <PlanningStrip tasks={tasks} />
      <TaskComposer onAdd={onAdd} />

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0">
          {view === "List" ? (
            <div className="space-y-4">
              <TaskGroup
                emptyText="Nothing due today. Choose one tiny next step."
                label="Today"
                tasks={today}
                onArchive={onArchive}
                onToggle={onToggle}
              />
              <TaskGroup
                emptyText="No unscheduled tasks waiting."
                label="Next"
                tasks={next}
                onArchive={onArchive}
                onToggle={onToggle}
              />
              <TaskGroup
                emptyText="Later is clear."
                label="Later"
                tasks={later}
                onArchive={onArchive}
                onToggle={onToggle}
              />
            </div>
          ) : view === "Board" ? (
            <BoardView tasks={tasks} onArchive={onArchive} onToggle={onToggle} />
          ) : (
            <CalendarView tasks={tasks} onArchive={onArchive} onToggle={onToggle} />
          )}
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-950">Momentum</p>
          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {Array.from({ length: 28 }).map((_, index) => {
              const intensity = index % 6;
              return (
                <span
                  aria-hidden="true"
                  className={`aspect-square rounded-md ${
                    intensity === 0
                      ? "bg-slate-200"
                      : intensity < 3
                        ? "bg-emerald-100"
                        : intensity < 5
                          ? "bg-emerald-300"
                          : "bg-emerald-500"
                  }`}
                  key={index}
                />
              );
            })}
          </div>
          <div className="mt-4 rounded-2xl bg-white p-3">
            <p className="text-2xl font-semibold text-slate-950">{doneCount}</p>
            <p className="text-sm text-slate-500">completed in this workspace</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlanningStrip({ tasks }: { tasks: Task[] }) {
  const days = ["Today", "Tomorrow", "This Week", "Later"];
  const counts = [
    tasks.filter((task) => isDueToday(task.due_on)).length,
    tasks.filter((task) => daysUntil(task.due_on) === 1).length,
    tasks.filter((task) => {
      const daysAway = daysUntil(task.due_on);
      return daysAway !== null && daysAway > 1 && daysAway <= 7;
    }).length,
    tasks.filter((task) => isLater(task.due_on)).length,
  ];

  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-4">
      {days.map((day, index) => (
        <button
          className={`rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
            index === 0
              ? "border-blue-100 bg-blue-50"
              : "border-slate-100 bg-slate-50 hover:bg-white"
          }`}
          key={day}
          type="button"
        >
          <p className="text-sm font-semibold text-slate-950">{day}</p>
          <p className="mt-1 text-xs text-slate-500">{counts[index]} tasks</p>
        </button>
      ))}
    </div>
  );
}

function TaskComposer({ onAdd }: { onAdd: (task: TaskDraft) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [energy, setEnergy] = useState<TaskEnergy>("medium");
  const [dueOn, setDueOn] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      className="mt-4 grid gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-2 sm:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_9rem_auto]"
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmedTitle = title.trim();
        if (!trimmedTitle) return;

        setIsSubmitting(true);
        await onAdd({
          title: trimmedTitle,
          priority,
          energy,
          due_on: dueOn || null,
        });
        setTitle("");
        setDueOn("");
        setIsSubmitting(false);
      }}
    >
      <label className="min-w-0">
        <span className="sr-only">Quick capture</span>
        <input
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          onChange={(event) => setTitle(event.target.value)}
          placeholder="One next step..."
          value={title}
        />
      </label>
      <Select label="Priority" onChange={setPriority} options={priorityOptions} value={priority} />
      <Select label="Energy" onChange={setEnergy} options={energyOptions} value={energy} />
      <label>
        <span className="sr-only">Due date</span>
        <input
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          onChange={(event) => setDueOn(event.target.value)}
          type="date"
          value={dueOn}
        />
      </label>
      <button
        className="h-11 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={isSubmitting}
        type="submit"
      >
        Add
      </button>
    </form>
  );
}

function TaskGroup({
  label,
  tasks,
  emptyText,
  onArchive,
  onToggle,
}: {
  label: string;
  tasks: Task[];
  emptyText: string;
  onArchive: (task: Task) => void;
  onToggle: (task: Task) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-950">{label}</h3>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
          {tasks.length}
        </span>
      </div>
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            {emptyText}
          </p>
        ) : (
          tasks.map((task) => (
            <TaskRow key={task.id} task={task} onArchive={onArchive} onToggle={onToggle} />
          ))
        )}
      </div>
    </section>
  );
}

function TaskRow({
  task,
  onArchive,
  onToggle,
}: {
  task: Task;
  onArchive: (task: Task) => void;
  onToggle: (task: Task) => void;
}) {
  return (
    <article className="group rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-md">
      <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
        <button
          aria-label="Mark task done"
          className="h-7 w-7 rounded-full border border-slate-300 bg-white transition hover:border-emerald-400 hover:bg-emerald-50"
          onClick={() => onToggle(task)}
          type="button"
        />
        <div className="min-w-0">
          <h3 className="break-words text-sm font-semibold text-slate-950">{task.title}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
            <Badge tone="neutral">{task.energy} energy</Badge>
            {task.due_on ? (
              <Badge tone={isOverdue(task.due_on) ? "rose" : "blue"}>
                {formatDueLabel(task.due_on)}
              </Badge>
            ) : (
              <Badge tone="neutral">No date</Badge>
            )}
          </div>
        </div>
        <button
          className="justify-self-start rounded-full px-3 py-2 text-xs font-medium text-slate-400 opacity-100 transition hover:bg-slate-100 hover:text-slate-950 sm:justify-self-end sm:opacity-0 sm:group-hover:opacity-100"
          onClick={() => onArchive(task)}
          type="button"
        >
          Archive
        </button>
      </div>
    </article>
  );
}

function BoardView({
  tasks,
  onArchive,
  onToggle,
}: {
  tasks: Task[];
  onArchive: (task: Task) => void;
  onToggle: (task: Task) => void;
}) {
  const columns = [
    {
      label: "Today",
      tasks: tasks.filter((task) => isDueToday(task.due_on)),
      tone: "blue" as const,
    },
    {
      label: "This Week",
      tasks: tasks.filter((task) => {
        const difference = daysUntil(task.due_on);
        return difference !== null && difference > 0 && difference <= 7;
      }),
      tone: "amber" as const,
    },
    {
      label: "Later",
      tasks: tasks.filter((task) => isLater(task.due_on)),
      tone: "purple" as const,
    },
    {
      label: "No Date",
      tasks: tasks.filter((task) => !task.due_on),
      tone: "green" as const,
    },
  ];

  return (
    <div className="grid gap-3 xl:grid-cols-4">
      {columns.map((column) => (
        <section
          className="rounded-2xl border border-slate-100 bg-slate-50 p-3"
          key={column.label}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${toneDot(column.tone)}`} />
              <h3 className="text-sm font-semibold text-slate-950">{column.label}</h3>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500">
              {column.tasks.length}
            </span>
          </div>
          <div className="space-y-2">
            {column.tasks.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                Nothing parked here.
              </p>
            ) : (
              column.tasks.map((task) => (
                <TaskRow key={task.id} task={task} onArchive={onArchive} onToggle={onToggle} />
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function CalendarView({
  tasks,
  onArchive,
  onToggle,
}: {
  tasks: Task[];
  onArchive: (task: Task) => void;
  onToggle: (task: Task) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    const iso = date.toISOString().slice(0, 10);
    return {
      iso,
      label: date.toLocaleDateString("en-US", { weekday: "short" }),
      dayNumber: date.getDate(),
      tasks: tasks
        .filter((task) => task.due_on === iso)
        .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)),
    };
  });

  const overdue = tasks.filter((task) => isOverdue(task.due_on)).slice(0, 4);

  return (
    <div className="space-y-3">
      {overdue.length > 0 ? (
        <section className="rounded-2xl border border-rose-100 bg-rose-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-rose-900">Overdue</h3>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-rose-600">
              {overdue.length}
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {overdue.map((task) => (
              <TaskRow key={task.id} task={task} onArchive={onArchive} onToggle={onToggle} />
            ))}
          </div>
        </section>
      ) : null}
      <div className="grid gap-3 xl:grid-cols-7">
        {days.map((day) => (
          <section className="rounded-2xl border border-slate-100 bg-slate-50 p-3" key={day.iso}>
            <div className="mb-3 border-b border-slate-200 pb-3">
              <p className="text-xs font-medium text-slate-400">{day.label}</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{day.dayNumber}</p>
            </div>
            <div className="space-y-2">
              {day.tasks.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-3 text-sm text-slate-400">
                  Open
                </p>
              ) : (
                day.tasks.map((task) => (
                  <article
                    className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm"
                    key={task.id}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold text-slate-950">{task.title}</h4>
                      <button
                        aria-label="Mark task done"
                        className="h-6 w-6 shrink-0 rounded-full border border-slate-300 bg-white transition hover:border-emerald-400 hover:bg-emerald-50"
                        onClick={() => onToggle(task)}
                        type="button"
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
                      <Badge tone="neutral">{task.energy}</Badge>
                    </div>
                    <button
                      className="mt-3 rounded-full px-2.5 py-1 text-xs font-medium text-slate-400 transition hover:bg-slate-100 hover:text-slate-950"
                      onClick={() => onArchive(task)}
                      type="button"
                    >
                      Archive
                    </button>
                  </article>
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function DeadlinesCard({ tasks }: { tasks: Task[] }) {
  return (
    <Card title="Upcoming" action="View all">
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            No dated tasks yet.
          </p>
        ) : (
          tasks.map((task, index) => (
            <div
              className={`rounded-2xl border p-3 ${
                index === 0
                  ? "border-amber-100 bg-amber-50"
                  : "border-slate-100 bg-white"
              }`}
              key={task.id}
            >
              <p className="text-sm font-semibold text-slate-950">{task.title}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Badge tone={isOverdue(task.due_on) ? "rose" : "blue"}>
                  {formatDueLabel(task.due_on)}
                </Badge>
                <span>{task.priority} priority</span>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function ProjectsCard({
  activeCount,
  doneCount,
}: {
  activeCount: number;
  doneCount: number;
}) {
  const total = activeCount + doneCount;
  const completion = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  return (
    <Card title="Focus Areas" action={`${completion}% done`}>
      <div className="grid grid-cols-2 gap-2">
        {focusAreas.map((area) => (
          <div className="rounded-2xl border border-slate-100 bg-white p-3" key={area.name}>
            <div
              className={`mb-3 h-2 w-8 rounded-full ${
                area.tone === "blue"
                  ? "bg-blue-400"
                  : area.tone === "green"
                    ? "bg-emerald-400"
                    : area.tone === "purple"
                      ? "bg-violet-400"
                      : "bg-amber-400"
              }`}
            />
            <p className="text-sm font-semibold text-slate-950">{area.name}</p>
            <p className="text-xs text-slate-500">{area.count} tasks</p>
            <div className="mt-3 h-2 rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-slate-900"
                style={{ width: `${area.progress}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AssistantCard({
  completedToday,
  message,
  onImport,
}: {
  completedToday: number;
  message: Message | null;
  onImport: (lines: string[]) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lines = text
    .split("\n")
    .map((line) => line.trim().replace(/^[-*]\s+/, ""))
    .filter(Boolean);

  return (
    <Card title="Plan Your Day" action={`${completedToday} done today`}>
      <div className="flex flex-col items-center rounded-2xl border border-blue-100 bg-gradient-to-b from-blue-50 to-white p-4 text-center">
        <div className="relative grid h-24 w-24 place-items-center rounded-full bg-white shadow-[inset_0_0_24px_rgba(37,99,235,0.18),0_18px_35px_rgba(37,99,235,0.18)]">
          <div className="h-14 w-14 rounded-full bg-gradient-to-br from-blue-200 via-white to-emerald-100" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-slate-950">Clear the next hour</h3>
        <p className="mt-1 text-sm text-slate-500">
          Paste a messy list and turn it into calm, sortable tasks.
        </p>
      </div>

      <form
        className="mt-3 space-y-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setIsSubmitting(true);
          await onImport(lines);
          setText("");
          setIsSubmitting(false);
        }}
      >
        <label>
          <span className="sr-only">Paste tasks</span>
          <textarea
            className="min-h-24 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
            onChange={(event) => setText(event.target.value)}
            placeholder={"Call dentist\nSort receipts\nChoose dinner"}
            value={text}
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5">
            <Badge tone="blue">Create</Badge>
            <Badge tone="green">Prioritize</Badge>
          </div>
          <button
            className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={lines.length === 0 || isSubmitting}
            type="submit"
          >
            Import {lines.length || ""}
          </button>
        </div>
      </form>
      <StatusMessage message={message} />
    </Card>
  );
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  onChange: (value: T) => void;
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm capitalize outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
        onChange={(event) => onChange(event.target.value as T)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.35rem] border border-white bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.08)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {action ? (
          <button
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-950"
            type="button"
          >
            {action}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "blue" | "green" | "purple" | "amber" | "rose";
}) {
  const className =
    tone === "blue"
      ? "bg-blue-50 text-blue-700"
      : tone === "green"
        ? "bg-emerald-50 text-emerald-700"
        : tone === "purple"
          ? "bg-violet-50 text-violet-700"
          : tone === "amber"
            ? "bg-amber-50 text-amber-700"
            : tone === "rose"
              ? "bg-rose-50 text-rose-700"
              : "bg-slate-100 text-slate-600";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${className}`}>
      {children}
    </span>
  );
}

function AvatarStack() {
  const avatars = ["AM", "JS", "KL"];

  return (
    <div className="hidden items-center pl-1 sm:flex">
      {avatars.map((avatar, index) => (
        <span
          className="-ml-1 grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-slate-200 text-[0.65rem] font-semibold text-slate-600"
          key={avatar}
          style={{ zIndex: avatars.length - index }}
        >
          {avatar}
        </span>
      ))}
      <span className="-ml-1 grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-slate-950 text-[0.65rem] font-semibold text-white">
        8+
      </span>
    </div>
  );
}

function StatusMessage({ message }: { message: Message | null }) {
  if (!message) return null;

  const className =
    message.tone === "warn"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : message.tone === "good"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-slate-200 bg-white text-slate-700";

  return <p className={`mt-3 rounded-2xl border p-3 text-sm ${className}`}>{message.text}</p>;
}

function createDemoTasks(): Task[] {
  const now = new Date();
  const priorities: TaskPriority[] = ["high", "normal", "low", "normal"];
  const energies: TaskEnergy[] = ["low", "medium", "high", "medium"];
  const dateOffsets = [-3, -1, 0, 0, 1, 2, 4, 6, 9, 14, null, 21];
  const notes = [
    "Keep this to one visible next action.",
    "Good candidate for a short timer.",
    "Pair with a reward after completion.",
    "Can be batched with similar admin work.",
  ];

  return demoTaskTitles.map((title, index) => {
    const status: TaskStatus = index % 5 === 0 ? "done" : "pending";
    const completedAt = status === "done" ? addDaysISO(-Math.max(0, index % 4)) : null;
    const createdAt = new Date(now.getTime() - index * 3_600_000).toISOString();
    const offset = dateOffsets[index % dateOffsets.length];

    return {
      id: `demo-task-${String(index + 1).padStart(2, "0")}`,
      user_id: "demo-user",
      title,
      notes: notes[index % notes.length],
      status,
      priority: priorities[index % priorities.length],
      energy: energies[index % energies.length],
      is_urgent: false,
      is_important: false,
      due_on: typeof offset === "number" ? addDaysISO(offset) : null,
      due_time: null,
      estimated_minutes: null,
      tags: [],
      external_link_label: null,
      external_link_url: null,
      one_step_at_a_time: false,
      subtasks_auto_reset: false,
      repeat_frequency: "none" as const,
      repeat_interval: 1,
      repeat_days_of_week: [],
      repeat_day_of_month: null,
      sort_order: index + 1,
      completed_at: completedAt,
      actual_seconds: 0,
      created_at: createdAt,
      updated_at: createdAt,
    };
  });
}

function addDaysISO(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysUntil(date: string | null) {
  if (!date) return null;
  const start = new Date(`${todayISO()}T00:00:00`);
  const end = new Date(`${date}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function isDueToday(date: string | null) {
  return date === todayISO();
}

function isOverdue(date: string | null) {
  const difference = daysUntil(date);
  return difference !== null && difference < 0;
}

function isLater(date: string | null) {
  const difference = daysUntil(date);
  return difference !== null && difference > 7;
}

function completedToday(date: string | null) {
  return Boolean(date?.startsWith(todayISO()));
}

function formatDueLabel(date: string | null) {
  const difference = daysUntil(date);
  if (difference === null) return "No date";
  if (difference === 0) return "Today";
  if (difference === 1) return "Tomorrow";
  if (difference < 0) return `${Math.abs(difference)}d overdue`;
  return `${difference}d`;
}

function priorityTone(priority: TaskPriority): "neutral" | "purple" | "green" {
  if (priority === "high") return "purple";
  if (priority === "low") return "green";
  return "neutral";
}

function priorityRank(priority: TaskPriority) {
  if (priority === "high") return 0;
  if (priority === "normal") return 1;
  return 2;
}

function toneDot(tone: "blue" | "green" | "purple" | "amber") {
  if (tone === "blue") return "bg-blue-400";
  if (tone === "green") return "bg-emerald-400";
  if (tone === "purple") return "bg-violet-400";
  return "bg-amber-400";
}
