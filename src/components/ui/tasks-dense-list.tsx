"use client";

import {
  Brain,
  CalendarDays,
  Check,
  Circle,
  Clock,
  MoreHorizontal,
  Repeat,
  Target,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TaskStatus } from "@/lib/database.types";

export type DenseTaskQuickAction = "today" | "focus" | "waiting" | "later" | "recurring" | "done";

export type DenseTaskListRow = {
  bucketLabel: string;
  dueLabel: string;
  energyLabel: string;
  focusLabel: string | null;
  id: string;
  isDone: boolean;
  isUrgent: boolean;
  priorityLabel: string;
  repeatLabel: string | null;
  rolloverLabel: string;
  signalLabel: string | null;
  status: TaskStatus;
  title: string;
};

type DenseTaskListProps = {
  onOpenTask: (taskId: string) => void;
  onQuickAction: (taskId: string, action: DenseTaskQuickAction) => void;
  onSelectTask: (taskId: string) => void;
  onToggleComplete: (taskId: string) => void;
  rows: DenseTaskListRow[];
  selectedTaskId: string | null;
};

const DESKTOP_COLUMNS = "md:grid-cols-[2.75rem_minmax(0,2.2fr)_7rem_7rem_6rem_6rem_6rem_8rem_8rem_11rem]";

const STATUS_STYLES: Record<TaskStatus, string> = {
  archived: "border-[#b7becd] bg-white text-[#5e687d] dark:border-white/20 dark:bg-white/[0.04] dark:text-white/55",
  complete: "border-[#5d9b76] bg-white text-[#256947] dark:border-[#2d5847] dark:bg-[#163429] dark:text-[#87ddb7]",
  delayed: "border-[#d8c0ff] bg-white text-[#7d54d1] dark:border-[#4d377f] dark:bg-[#27193f] dark:text-[#d5c2ff]",
  did_my_best: "border-[#f2d36f] bg-white text-[#b28700] dark:border-[#65511a] dark:bg-[#3a2d10] dark:text-[#ffd56b]",
  done: "border-[#97dfc1] bg-white text-[#119a69] dark:border-[#245441] dark:bg-[#14362c] dark:text-[#7de4b8]",
  in_progress: "border-[#a9c2ff] bg-white text-[#4473df] dark:border-[#29437c] dark:bg-[#17253f] dark:text-[#a9c2ff]",
  missed: "border-[#f4afbc] bg-white text-[#d94e67] dark:border-[#60313d] dark:bg-[#44232f] dark:text-[#ff9eaf]",
  not_due: "border-[#a9daf7] bg-white text-[#3388c9] dark:border-[#27516b] dark:bg-[#162434] dark:text-[#8bc4ff]",
  pending: "border-[#f6be96] bg-white text-[#d96b1c] dark:border-[#6b4522] dark:bg-[#392818] dark:text-[#ffcb99]",
  trashed: "border-[#f4afbc] bg-white text-[#d94e67] dark:border-[#60313d] dark:bg-[#44232f] dark:text-[#ff9eaf]",
  upcoming: "border-[#cfd6e4] bg-white text-[#68738c] dark:border-white/15 dark:bg-white/[0.04] dark:text-white/60",
};

function formatStatusLabel(status: TaskStatus) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function QuickActionButton({
  action,
  icon,
  label,
  onAction,
}: {
  action: DenseTaskQuickAction;
  icon: React.ReactNode;
  label: string;
  onAction: (action: DenseTaskQuickAction) => void;
}) {
  return (
    <button
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#ece8f8] bg-white text-[#66718c] transition hover:border-[#d9cffb] hover:bg-[#f7f3ff] hover:text-[#6f57f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f57f6]/30 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60 dark:hover:border-white/20 dark:hover:bg-white/[0.08] dark:hover:text-[#cabfff]"
      onClick={(event) => {
        event.stopPropagation();
        onAction(action);
      }}
      title={label}
      type="button"
    >
      {icon}
    </button>
  );
}

export default function TasksDenseList({
  onOpenTask,
  onQuickAction,
  onSelectTask,
  onToggleComplete,
  rows,
  selectedTaskId,
}: DenseTaskListProps) {
  const [openMenuTaskId, setOpenMenuTaskId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!selectedTaskId || !rows.some((row) => row.id === selectedTaskId)) {
      setOpenMenuTaskId(null);
    }
  }, [rows, selectedTaskId]);

  function focusAdjacentRow(currentTaskId: string, direction: "next" | "prev") {
    const index = rows.findIndex((row) => row.id === currentTaskId);
    if (index === -1) {
      return;
    }
    const nextIndex = direction === "next"
      ? Math.min(rows.length - 1, index + 1)
      : Math.max(0, index - 1);
    const nextRow = rows[nextIndex];
    if (!nextRow) {
      return;
    }
    onSelectTask(nextRow.id);
    rowRefs.current[nextRow.id]?.focus();
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-[1.2rem] border border-dashed border-[#ddd6f9] bg-[#faf8ff] px-4 py-10 text-center text-sm text-[#7b84a0] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55">
        No tasks match this view right now.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[1.45rem] border border-[#ece8f8] bg-white shadow-[0_18px_45px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/[0.04]">
      <div className={`hidden items-center gap-3 border-b border-[#f0ebfb] bg-[#fbfaff] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8e88a9] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/35 md:grid ${DESKTOP_COLUMNS}`}>
        <span className="sr-only">Complete</span>
        <span>Title</span>
        <span>Bucket</span>
        <span>Due</span>
        <span>Priority</span>
        <span>Energy</span>
        <span>Focus</span>
        <span>Repeat</span>
        <span>Signal</span>
        <span>Quick Actions</span>
      </div>

      <ul className="divide-y divide-[#f0ebfb] dark:divide-white/10">
        {rows.map((row) => {
          const isSelected = row.id === selectedTaskId;
          const menuOpen = openMenuTaskId === row.id;

          return (
            <li className="group relative" key={row.id}>
              <div
                className={`grid gap-3 px-3 py-3 outline-none transition md:px-4 ${DESKTOP_COLUMNS} md:items-center ${isSelected ? "bg-[#f8f5ff] dark:bg-[#201733]" : "bg-white dark:bg-transparent"} hover:bg-[#fbf9ff] dark:hover:bg-white/[0.03]`}
                onClick={() => onOpenTask(row.id)}
                onFocus={() => onSelectTask(row.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenTask(row.id);
                    return;
                  }

                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    focusAdjacentRow(row.id, "next");
                    return;
                  }

                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    focusAdjacentRow(row.id, "prev");
                  }
                }}
                ref={(node) => {
                  rowRefs.current[row.id] = node;
                }}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-center justify-center md:justify-start">
                  <button
                    aria-label={row.isDone ? `Reopen ${row.title}` : `Complete ${row.title}`}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f57f6]/30 ${
                      row.isDone
                        ? "border-[#97dfc1] bg-[#e8fbf2] text-[#119a69] dark:border-[#245441] dark:bg-[#14362c] dark:text-[#7de4b8]"
                        : "border-[#d9dff0] bg-white text-[#8d97b0] hover:border-[#6f57f6] hover:text-[#6f57f6] dark:border-white/15 dark:bg-white/[0.04] dark:text-white/45 dark:hover:border-[#cabfff] dark:hover:text-[#cabfff]"
                    }`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleComplete(row.id);
                    }}
                    type="button"
                  >
                    {row.isDone ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                  </button>
                </div>

                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`truncate text-sm font-semibold md:text-[15px] ${row.isDone ? "text-[#8d97b0] line-through dark:text-white/45" : "text-[#1f2642] dark:text-white"}`}>
                      {row.title}
                    </span>
                    {row.isUrgent ? (
                      <span className="hidden rounded-full bg-[#fff1f3] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#d94e67] dark:bg-[#44232f] dark:text-[#ff9eaf] sm:inline-flex">
                        Urgent
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[#7b86a1] dark:text-white/45 md:hidden">
                    <span>{row.bucketLabel}</span>
                    <span>{row.dueLabel}</span>
                    <span>{row.priorityLabel}</span>
                    <span>{row.energyLabel}</span>
                    {row.focusLabel ? <span>{row.focusLabel}</span> : null}
                    {row.repeatLabel ? <span>{row.repeatLabel}</span> : null}
                    <span>{row.rolloverLabel}</span>
                    {row.signalLabel ? <span>{row.signalLabel}</span> : null}
                  </div>
                </div>

                <div className="hidden text-sm text-[#59627e] dark:text-white/65 md:block">{row.bucketLabel}</div>
                <div className="hidden text-sm text-[#59627e] dark:text-white/65 md:block">{row.dueLabel}</div>
                <div className="hidden text-sm text-[#59627e] dark:text-white/65 md:block">{row.priorityLabel}</div>
                <div className="hidden text-sm text-[#59627e] dark:text-white/65 md:block">{row.energyLabel}</div>
                <div className="hidden text-sm text-[#59627e] dark:text-white/65 md:block">{row.focusLabel ?? "—"}</div>
                <div className="hidden truncate text-sm text-[#59627e] dark:text-white/65 md:block">{row.repeatLabel ?? "—"}</div>
                <div className="hidden min-w-0 md:block">
                  <div className="text-sm text-[#59627e] dark:text-white/65">{row.rolloverLabel}</div>
                  {row.signalLabel ? (
                    <div className="truncate text-xs text-[#8e88a9] dark:text-white/35">{row.signalLabel}</div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-2 md:justify-end">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold md:hidden ${STATUS_STYLES[row.status]}`}>
                    {formatStatusLabel(row.status)}
                  </span>
                  <div className={`flex items-center gap-1 transition ${isSelected ? "opacity-100" : "opacity-100 md:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}>
                    <QuickActionButton
                      action="today"
                      icon={<Target className="h-4 w-4" />}
                      label="Plan for Today"
                      onAction={(action) => onQuickAction(row.id, action)}
                    />
                    <QuickActionButton
                      action="focus"
                      icon={<Brain className="h-4 w-4" />}
                      label="Add to Focus"
                      onAction={(action) => onQuickAction(row.id, action)}
                    />
                    <QuickActionButton
                      action="waiting"
                      icon={<Clock className="h-4 w-4" />}
                      label="Move to Waiting"
                      onAction={(action) => onQuickAction(row.id, action)}
                    />
                    <QuickActionButton
                      action="later"
                      icon={<CalendarDays className="h-4 w-4" />}
                      label="Move to Later"
                      onAction={(action) => onQuickAction(row.id, action)}
                    />
                    <div className="relative">
                      <button
                        aria-expanded={menuOpen}
                        aria-label="More quick actions"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#ece8f8] bg-white text-[#66718c] transition hover:border-[#d9cffb] hover:bg-[#f7f3ff] hover:text-[#6f57f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f57f6]/30 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60 dark:hover:border-white/20 dark:hover:bg-white/[0.08] dark:hover:text-[#cabfff]"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenMenuTaskId((current) => current === row.id ? null : row.id);
                        }}
                        type="button"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {menuOpen ? (
                        <div
                          className="absolute right-0 top-10 z-30 min-w-[11rem] rounded-[0.9rem] border border-[#ece8f8] bg-white p-2 shadow-[0_18px_36px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#1a1230]"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {[
                            { action: "recurring" as const, icon: <Repeat className="h-4 w-4" />, label: "Make recurring" },
                            { action: "done" as const, icon: <Check className="h-4 w-4" />, label: "Mark done" },
                          ].map((option) => (
                            <button
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-[#27304c] transition hover:bg-[#f7f3ff] dark:text-white dark:hover:bg-white/[0.08]"
                              key={option.action}
                              onClick={() => {
                                setOpenMenuTaskId(null);
                                onQuickAction(row.id, option.action);
                              }}
                              type="button"
                            >
                              {option.icon}
                              {option.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
