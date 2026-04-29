"use client";

import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type {
  Task,
  TaskEnergy,
  TaskInsert,
  TaskPriority,
  TaskUpdate,
} from "@/lib/database.types";

type Message = {
  tone: "neutral" | "good" | "warn";
  text: string;
};

const priorityOptions: TaskPriority[] = ["normal", "high", "low"];
const energyOptions: TaskEnergy[] = ["medium", "low", "high"];
type TaskDraft = Omit<TaskInsert, "user_id">;

export function TaskApp() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(supabase !== null);
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, nextSession) => {
      if (!nextSession) {
        setTasks([]);
      }
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !session?.user) {
      return;
    }

    const client = supabase;
    const userId = session.user.id;
    let isActive = true;

    async function loadTasks() {
      const { data, error } = await client
        .from("adhdice_clean_tasks")
        .select("*")
        .eq("user_id", userId)
        .neq("status", "archived")
        .order("status", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (!isActive) return;

      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return;
      }

      setTasks(data ?? []);
    }

    loadTasks();

    const channel = client
      .channel(`adhdice_clean_tasks:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_clean_tasks",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          loadTasks();
        },
      )
      .subscribe();

    return () => {
      isActive = false;
      client.removeChannel(channel);
    };
  }, [session?.user, supabase]);

  if (!supabase) {
    return <MissingConfig />;
  }

  if (loading) {
    return <Shell status="Opening ADHDice..." />;
  }

  if (!session?.user) {
    return (
      <Shell status="Signed out">
        <AuthPanel
          onMessage={setMessage}
          onSignIn={async (email) => {
            const { error } = await supabase.auth.signInWithOtp({
              email,
              options: {
                emailRedirectTo:
                  typeof window === "undefined" ? undefined : window.location.origin,
              },
            });

            setMessage(
              error
                ? { tone: "warn", text: error.message }
                : { tone: "good", text: "Check your email for the sign-in link." },
            );
          }}
        />
        <StatusMessage message={message} />
      </Shell>
    );
  }

  const activeTasks = tasks.filter((task) => task.status === "active");
  const doneTasks = tasks.filter((task) => task.status === "done");

  async function addTask(task: TaskDraft) {
    if (!supabase || !session?.user) return;

    const { error } = await supabase.from("adhdice_clean_tasks").insert({
      ...task,
      user_id: session.user.id,
      sort_order: Date.now(),
    });

    setMessage(
      error
        ? { tone: "warn", text: error.message }
        : { tone: "good", text: "Task captured." },
    );
  }

  async function importTasks(lines: string[]) {
    if (!supabase || !session?.user || lines.length === 0) return;

    const payload = lines.map((title, index) => ({
      title,
      user_id: session.user.id,
      sort_order: Date.now() + index,
    }));

    const { error } = await supabase.from("adhdice_clean_tasks").insert(payload);

    setMessage(
      error
        ? { tone: "warn", text: error.message }
        : { tone: "good", text: `${lines.length} task${lines.length === 1 ? "" : "s"} imported.` },
    );
  }

  async function updateTask(taskId: string, values: TaskUpdate) {
    if (!supabase) return;

    const { error } = await supabase
      .from("adhdice_clean_tasks")
      .update(values)
      .eq("id", taskId);
    if (error) setMessage({ tone: "warn", text: error.message });
  }

  return (
    <Shell
      status={`${activeTasks.length} active / ${doneTasks.length} done`}
      user={session.user}
      onSignOut={() => supabase.auth.signOut()}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="min-w-0 space-y-4">
          <TaskComposer onAdd={addTask} />
          <TaskList
            tasks={activeTasks}
            emptyText="Nothing active. Capture one tiny next step."
            onArchive={(task) => updateTask(task.id, { status: "archived" })}
            onToggle={(task) =>
              updateTask(task.id, {
                status: "done",
                completed_at: new Date().toISOString(),
              })
            }
          />
        </section>

        <aside className="space-y-4">
          <ImportPanel onImport={importTasks} />
          <TaskList
            compact
            tasks={doneTasks}
            emptyText="Finished tasks will land here."
            onArchive={(task) => updateTask(task.id, { status: "archived" })}
            onToggle={(task) =>
              updateTask(task.id, { status: "active", completed_at: null })
            }
          />
          <StatusMessage message={message} />
        </aside>
      </div>
    </Shell>
  );
}

function Shell({
  children,
  status,
  user,
  onSignOut,
}: {
  children?: React.ReactNode;
  status: string;
  user?: User;
  onSignOut?: () => void;
}) {
  return (
    <main className="min-h-screen px-4 py-5 text-slate-900 sm:px-6 lg:px-8 dark:text-stone-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between dark:border-stone-800">
          <div>
            <h1 className="text-3xl font-semibold tracking-normal text-slate-950 dark:text-stone-50">
              ADHDice
            </h1>
            <p className="mt-1 text-base text-slate-600 dark:text-stone-300">
              Capture the next small thing, keep momentum, sync everywhere.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-stone-300">
            <span className="rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-stone-800 dark:bg-stone-950">
              {status}
            </span>
            {user ? (
              <>
                <span className="max-w-[14rem] truncate rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-stone-800 dark:bg-stone-950">
                  {user.email}
                </span>
                <button
                  className="rounded-md bg-slate-900 px-3 py-2 font-medium text-white transition hover:bg-slate-700 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-300"
                  onClick={onSignOut}
                  type="button"
                >
                  Sign out
                </button>
              </>
            ) : null}
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

function AuthPanel({
  onSignIn,
  onMessage,
}: {
  onSignIn: (email: string) => Promise<void>;
  onMessage: (message: Message | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      className="max-w-xl space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-950"
      onSubmit={async (event) => {
        event.preventDefault();
        setIsSubmitting(true);
        onMessage(null);
        await onSignIn(email);
        setIsSubmitting(false);
      }}
    >
      <div>
        <h2 className="text-xl font-semibold">Sign in to sync tasks</h2>
        <p className="mt-1 text-slate-600 dark:text-stone-300">
          Use a magic link for now. The same account will sync Mac Safari and iPhone Safari.
        </p>
      </div>
      <label className="block space-y-2">
        <span className="text-sm font-medium">Email</span>
        <input
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-3 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 dark:border-stone-700 dark:bg-stone-900 dark:focus:border-emerald-400 dark:focus:ring-emerald-950"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
        />
      </label>
      <button
        className="w-full rounded-md bg-emerald-700 px-4 py-3 font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Sending..." : "Send magic link"}
      </button>
    </form>
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
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-950"
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
      <label className="block space-y-2">
        <span className="text-sm font-medium">Quick capture</span>
        <input
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 dark:border-stone-700 dark:bg-stone-900 dark:focus:border-emerald-400 dark:focus:ring-emerald-950"
          onChange={(event) => setTitle(event.target.value)}
          placeholder="One next step..."
          value={title}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select label="Priority" onChange={setPriority} options={priorityOptions} value={priority} />
        <Select label="Energy" onChange={setEnergy} options={energyOptions} value={energy} />
        <label className="block space-y-2">
          <span className="text-sm font-medium">Due</span>
          <input
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 dark:border-stone-700 dark:bg-stone-900 dark:focus:border-emerald-400 dark:focus:ring-emerald-950"
            onChange={(event) => setDueOn(event.target.value)}
            type="date"
            value={dueOn}
          />
        </label>
      </div>
      <button
        className="w-full rounded-md bg-slate-900 px-4 py-3 font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-300"
        disabled={isSubmitting}
        type="submit"
      >
        Add task
      </button>
    </form>
  );
}

function ImportPanel({ onImport }: { onImport: (lines: string[]) => Promise<void> }) {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lines = text
    .split("\n")
    .map((line) => line.trim().replace(/^[-*]\s+/, ""))
    .filter(Boolean);

  return (
    <form
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-950"
      onSubmit={async (event) => {
        event.preventDefault();
        setIsSubmitting(true);
        await onImport(lines);
        setText("");
        setIsSubmitting(false);
      }}
    >
      <label className="block space-y-2">
        <span className="text-sm font-medium">Import pasted lines</span>
        <textarea
          className="min-h-36 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-3 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 dark:border-stone-700 dark:bg-stone-900 dark:focus:border-emerald-400 dark:focus:ring-emerald-950"
          onChange={(event) => setText(event.target.value)}
          placeholder={"Call dentist\nSort receipts\nChoose dinner"}
          value={text}
        />
      </label>
      <button
        className="w-full rounded-md border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 sm:w-auto dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
        disabled={lines.length === 0 || isSubmitting}
        type="submit"
      >
        Import {lines.length || ""} tasks
      </button>
    </form>
  );
}

function TaskList({
  tasks,
  emptyText,
  compact,
  onArchive,
  onToggle,
}: {
  tasks: Task[];
  emptyText: string;
  compact?: boolean;
  onArchive: (task: Task) => void;
  onToggle: (task: Task) => void;
}) {
  return (
    <div className="space-y-3">
      {tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-5 text-slate-600 dark:border-stone-700 dark:bg-stone-950/70 dark:text-stone-300">
          {emptyText}
        </p>
      ) : (
        tasks.map((task) => (
          <article
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-950"
            key={task.id}
          >
            <div className="flex items-start gap-3">
              <button
                aria-label={task.status === "done" ? "Mark active" : "Mark done"}
                className="mt-1 min-w-16 shrink-0 rounded-md border border-slate-300 px-2 py-1 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:border-stone-700 dark:text-emerald-300 dark:hover:bg-stone-900"
                onClick={() => onToggle(task)}
                type="button"
              >
                {task.status === "done" ? "Undo" : "Done"}
              </button>
              <div className="min-w-0 flex-1">
                <h2
                  className={`break-words font-medium ${
                    task.status === "done" ? "text-slate-500 line-through dark:text-stone-400" : ""
                  } ${compact ? "text-base" : "text-lg"}`}
                >
                  {task.title}
                </h2>
                <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-600 dark:text-stone-300">
                  <Badge>{task.priority}</Badge>
                  <Badge>{task.energy} energy</Badge>
                  {task.due_on ? <Badge>Due {task.due_on}</Badge> : null}
                </div>
              </div>
              <button
                className="rounded-md px-2 py-1 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
                onClick={() => onArchive(task)}
                type="button"
              >
                Archive
              </button>
            </div>
          </article>
        ))
      )}
    </div>
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
    <label className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <select
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 capitalize outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 dark:border-stone-700 dark:bg-stone-900 dark:focus:border-emerald-400 dark:focus:ring-emerald-950"
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

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700 dark:bg-stone-900 dark:text-stone-300">
      {children}
    </span>
  );
}

function StatusMessage({ message }: { message: Message | null }) {
  if (!message) return null;

  const className =
    message.tone === "warn"
      ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-950 dark:bg-rose-950/30 dark:text-rose-200"
      : message.tone === "good"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-200"
        : "border-slate-200 bg-white text-slate-700 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300";

  return <p className={`rounded-lg border p-3 text-sm ${className}`}>{message.text}</p>;
}

function MissingConfig() {
  return (
    <Shell status="Configuration needed">
      <div className="max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-950 dark:border-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        <h2 className="text-xl font-semibold">Add Supabase environment variables</h2>
        <p className="mt-2">
          Create a local `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and
          `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then restart the dev server.
        </p>
      </div>
    </Shell>
  );
}
