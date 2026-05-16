"use client";

import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleX,
  Ellipsis,
  Clock,
  Star,
} from "lucide-react";
import { useEffect, useState } from "react";

export type AgentPlanStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "missed"
  | "did_my_best"
  | "upcoming"
  | "not_due";

export type AgentPlanMetaTone = "accent" | "danger" | "neutral" | "success" | "warning";

export type AgentPlanMetaPill = {
  label: string;
  tone?: AgentPlanMetaTone;
};

export type AgentPlanSubtaskItem = {
  children: AgentPlanSubtaskItem[];
  id: string;
  status: AgentPlanStatus;
  title: string;
};

export type AgentPlanTaskItem = {
  description?: string | null;
  id: string;
  metaPills: AgentPlanMetaPill[];
  status: AgentPlanStatus;
  subtasks: AgentPlanSubtaskItem[];
  title: string;
};

export type AgentPlanBucketOption = {
  count: number;
  label: string;
  value: string;
};

type AgentPlanProps = {
  buckets: AgentPlanBucketOption[];
  onEditTask: (taskId: string) => void;
  onSelectBucket: (bucket: string) => void;
  onSetSubtaskStatus: (subtaskId: string, status: AgentPlanStatus) => void;
  onSetTaskStatus: (taskId: string, status: AgentPlanStatus) => void;
  selectedBucket: string;
  tasks: AgentPlanTaskItem[];
};

const STATUS_OPTIONS: AgentPlanStatus[] = [
  "pending",
  "in_progress",
  "done",
  "missed",
  "did_my_best",
  "upcoming",
  "not_due",
];

const STATUS_LABELS: Record<AgentPlanStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  done: "Done",
  missed: "Missed",
  did_my_best: "Did My Best",
  upcoming: "Upcoming",
  not_due: "Not Due",
};

const STATUS_BADGE_STYLES: Record<AgentPlanStatus, string> = {
  pending: "border border-[#f6be96] bg-white text-[#d96b1c]",
  in_progress: "border border-[#b7caf6] bg-white text-[#4473df]",
  done: "border border-[#97dfc1] bg-white text-[#119a69]",
  missed: "border border-[#f4afbc] bg-white text-[#d94e67]",
  did_my_best: "border border-[#f2d36f] bg-white text-[#b28700]",
  upcoming: "border border-[#cfd6e4] bg-white text-[#68738c]",
  not_due: "border border-[#a9daf7] bg-white text-[#3388c9]",
};

const STATUS_DOT_STYLES: Record<AgentPlanStatus, string> = {
  pending: "border border-[#d96b1c] bg-white",
  in_progress: "bg-[#4473df]",
  done: "bg-[#119a69]",
  missed: "bg-[#d94e67]",
  did_my_best: "bg-[#4a5fd3]",
  upcoming: "bg-[#68738c]",
  not_due: "bg-[#3388c9]",
};

const META_PILL_STYLES: Record<AgentPlanMetaTone, string> = {
  accent: "bg-[#f1ecff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]",
  danger: "bg-[#fff1f3] text-[#d94e67] dark:bg-[#44232f] dark:text-[#ff9eaf]",
  neutral: "bg-[#f4f5f8] text-[#68738c] dark:bg-white/8 dark:text-white/60",
  success: "bg-[#e8fbf2] text-[#119a69] dark:bg-[#16352c] dark:text-[#7de4b8]",
  warning: "bg-[#fff6df] text-[#b77900] dark:bg-[#44350d] dark:text-[#ffd56b]",
};

function isClosedStatus(status: AgentPlanStatus) {
  return status === "done" || status === "did_my_best";
}

function StatusIcon({ status }: { status: AgentPlanStatus }) {
  if (status === "pending") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#d96b1c] text-[#d96b1c] dark:border-[#ffbd7a] dark:text-[#ffbd7a]">
        <Ellipsis className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (status === "done") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#12a876] text-[#12a876] dark:border-[#7de4b8] dark:text-[#7de4b8]">
        <span className="text-[11px] font-bold leading-none">✓</span>
      </span>
    );
  }

  if (status === "in_progress") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#4473df] text-[#4473df] dark:border-[#a7c0ff] dark:text-[#a7c0ff]">
        <ArrowRight className="h-3 w-3" />
      </span>
    );
  }

  if (status === "missed") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#d94e67] text-[#d94e67] dark:border-[#ff9eaf] dark:text-[#ff9eaf]">
        <CircleX className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (status === "did_my_best") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#b28700] text-[#b28700] dark:border-[#f2d36f] dark:text-[#f2d36f]">
        <Star className="h-3 w-3" />
      </span>
    );
  }

  if (status === "upcoming") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#8d97b0] text-[#8d97b0] dark:border-[#cfd6e4] dark:text-[#cfd6e4]">
        <Clock className="h-3 w-3" />
      </span>
    );
  }

  if (status === "not_due") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-[#57a9de] text-[#57a9de] dark:border-[#8fd8ff] dark:text-[#8fd8ff]">
        <span className="flex items-center gap-[2px]" aria-hidden="true">
          <span className="block h-2.5 w-[2px] rounded-full bg-current" />
          <span className="block h-2.5 w-[2px] rounded-full bg-current" />
        </span>
      </span>
    );
  }

  return <Circle className="h-4.5 w-4.5 text-[#d96b1c] dark:text-[#ffbd7a]" />;
}

function StatusChip({ status }: { status: AgentPlanStatus }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${STATUS_BADGE_STYLES[status]}`}>
      <StatusIcon status={status} />
      <span>{STATUS_LABELS[status]}</span>
    </span>
  );
}

function SubtaskBranch({
  depth = 0,
  onSetSubtaskStatus,
  subtask,
}: {
  depth?: number;
  onSetSubtaskStatus: (subtaskId: string, status: AgentPlanStatus) => void;
  subtask: AgentPlanSubtaskItem;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasChildren = subtask.children.length > 0;

  return (
    <li className="relative">
      <div className="flex items-start gap-2 py-1" style={{ marginLeft: `${depth * 1.4}rem` }}>
        <div className="relative mt-0.5 shrink-0">
          <button
            className="shrink-0"
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((current) => !current);
            }}
            type="button"
          >
            <StatusIcon status={subtask.status} />
          </button>
          {menuOpen ? (
            <div className="absolute left-full top-0 z-40 ml-3 min-w-[180px] rounded-[0.9rem] border border-[#ece8f8] bg-white p-2 shadow-[0_18px_36px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#1a1230]">
              {STATUS_OPTIONS.map((status) => (
                <button
                  className="flex w-full justify-start px-1 py-1 text-left"
                  key={status}
                  onClick={() => {
                    onSetSubtaskStatus(subtask.id, status);
                    setMenuOpen(false);
                  }}
                  type="button"
                >
                  <StatusChip status={status} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            {hasChildren ? (
              <button
                className="mt-0.5 shrink-0 text-[#8d97b0] transition hover:text-[#6f57f6] dark:text-white/40 dark:hover:text-[#cabfff]"
                onClick={() => setIsOpen((current) => !current)}
                type="button"
              >
                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <span className="mt-1 h-3.5 w-3.5 shrink-0" />
            )}
            <span className={`text-sm ${isClosedStatus(subtask.status) ? "line-through opacity-50" : "text-[#38415e] dark:text-white/75"}`}>
              {subtask.title}
            </span>
          </div>
        </div>
      </div>

      {hasChildren ? (
        <AnimatePresence initial={false}>
          {isOpen ? (
            <motion.ul
              animate={{ height: "auto", opacity: 1 }}
              className="overflow-visible border-l-2 border-dashed border-[#ddd6f9] dark:border-white/10"
              exit={{ height: 0, opacity: 0 }}
              initial={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {subtask.children.map((child) => (
                <SubtaskBranch
                  depth={depth + 1}
                  key={child.id}
                  onSetSubtaskStatus={onSetSubtaskStatus}
                  subtask={child}
                />
              ))}
            </motion.ul>
          ) : null}
        </AnimatePresence>
      ) : null}
    </li>
  );
}

export default function AgentPlan({
  buckets,
  onEditTask,
  onSelectBucket,
  onSetSubtaskStatus,
  onSetTaskStatus,
  selectedBucket,
  tasks,
}: AgentPlanProps) {
  const prefersReducedMotion = useReducedMotion();
  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);
  const [openTaskIconMenuId, setOpenTaskIconMenuId] = useState<string | null>(null);
  const [openStatusTaskId, setOpenStatusTaskId] = useState<string | null>(null);

  useEffect(() => {
    setExpandedTaskIds((current) => current.filter((taskId) => tasks.some((task) => task.id === taskId)));
  }, [tasks]);

  useEffect(() => {
    if (tasks.length === 0) {
      return;
    }

    setExpandedTaskIds((current) => (current.length === 0 ? [tasks[0].id] : current));
  }, [tasks]);

  useEffect(() => {
    setOpenTaskIconMenuId(null);
    setOpenStatusTaskId(null);
  }, [selectedBucket, tasks]);

  return (
    <div className="space-y-4">
      <div className="pb-3">
        <div className="overflow-x-auto px-1 pt-1 [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max gap-2">
            {buckets.map((bucket) => {
              const active = bucket.value === selectedBucket;
              return (
                <button
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]"
                    : "bg-white text-[#64708a] hover:bg-[#faf8ff] dark:bg-white/[0.06] dark:text-white/70 dark:hover:bg-white/[0.09]"
                }`}
                  key={bucket.value}
                  onClick={() => onSelectBucket(bucket.value)}
                  type="button"
                >
                  {bucket.label}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${active ? "bg-white/20 text-white dark:bg-[#1a1431]/12 dark:text-[#1a1431]" : "bg-[#f3efff] text-[#6f57f6] dark:bg-white/8 dark:text-[#cabfff]"}`}>
                    {bucket.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="overflow-visible rounded-[1.8rem] border border-[#ece8f8] bg-white px-4 py-4 shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/[0.04]"
        initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
        transition={{ duration: 0.24 }}
      >
        {tasks.length === 0 ? (
          <div className="rounded-[1.2rem] border border-dashed border-[#ddd6f9] bg-[#faf8ff] px-4 py-8 text-center text-sm text-[#7b84a0] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55">
            No tasks match this bucket right now.
          </div>
        ) : (
          <LayoutGroup>
            <ul className="space-y-1">
              {tasks.map((task) => {
                const expanded = expandedTaskIds.includes(task.id);
                const isDone = isClosedStatus(task.status);

                return (
                  <motion.li
                    animate={{ opacity: 1, y: 0 }}
                    className="overflow-visible"
                    initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }}
                    key={task.id}
                    layout
                    transition={{ duration: 0.18 }}
                  >
                    <motion.div
                      className="group rounded-[1rem] px-3 py-2.5 transition hover:bg-[#f8f6ff] dark:hover:bg-white/[0.03]"
                      layout
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative mt-0.5 shrink-0">
                          <button
                            className="shrink-0"
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenTaskIconMenuId((current) => (current === task.id ? null : task.id));
                            }}
                            type="button"
                          >
                            <StatusIcon status={task.status} />
                          </button>
                          {openTaskIconMenuId === task.id ? (
                            <div className="absolute left-full top-0 z-40 ml-3 min-w-[190px] rounded-[0.9rem] border border-[#ece8f8] bg-white p-2 shadow-[0_18px_36px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#1a1230]">
                              {STATUS_OPTIONS.map((status) => (
                                <button
                                  className="flex w-full justify-start px-1 py-1 text-left"
                                  key={status}
                                  onClick={() => {
                                    onSetTaskStatus(task.id, status);
                                    setOpenTaskIconMenuId(null);
                                  }}
                                  type="button"
                                >
                                  <StatusChip status={status} />
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div
                          className="min-w-0 flex-1"
                          onClick={() =>
                            setExpandedTaskIds((current) =>
                              current.includes(task.id)
                                ? current.filter((taskId) => taskId !== task.id)
                                : [...current, task.id],
                            )}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setExpandedTaskIds((current) =>
                                current.includes(task.id)
                                  ? current.filter((taskId) => taskId !== task.id)
                                  : [...current, task.id],
                              );
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <button
                                  className={`min-w-0 truncate text-left text-[15px] font-semibold transition hover:text-[#6f57f6] dark:hover:text-[#cabfff] ${isDone ? "text-[#8d97b0] line-through dark:text-white/45" : "text-[#1f2642] dark:text-white"}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onEditTask(task.id);
                                  }}
                                  type="button"
                                >
                                  {task.title}
                                </button>
                              </div>
                              {task.description ? (
                                <p className="mt-1 line-clamp-1 text-sm text-[#7d88a1] dark:text-white/45">
                                  {task.description}
                                </p>
                              ) : null}
                            </div>

                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                              {task.metaPills.map((pill) => (
                                <span
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${META_PILL_STYLES[pill.tone ?? "neutral"]}`}
                                  key={`${task.id}-${pill.label}`}
                                >
                                  {pill.label}
                                </span>
                              ))}
                              <div className="relative">
                                <button
                                  className="p-0 text-left"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setOpenStatusTaskId((current) => (current === task.id ? null : task.id));
                                  }}
                                  type="button"
                                >
                                  <StatusChip status={task.status} />
                                </button>
                                {openStatusTaskId === task.id ? (
                                  <div className="absolute right-0 top-7 z-30 min-w-[190px] rounded-[0.9rem] border border-[#ece8f8] bg-white p-2 shadow-[0_18px_36px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#1a1230]">
                                    {STATUS_OPTIONS.map((status) => (
                                      <button
                                        className="flex w-full justify-start px-1 py-1 text-left"
                                        key={status}
                                        onClick={() => {
                                          onSetTaskStatus(task.id, status);
                                          setOpenStatusTaskId(null);
                                        }}
                                        type="button"
                                      >
                                        <StatusChip status={status} />
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <AnimatePresence initial={false}>
                        {expanded ? (
                          <motion.div
                            animate={{ height: "auto", opacity: 1 }}
                            className="overflow-visible"
                            exit={{ height: 0, opacity: 0 }}
                            initial={{ height: 0, opacity: 0 }}
                            layout
                            transition={{ duration: 0.22 }}
                          >
                            {task.subtasks.length > 0 || task.description ? (
                              <div className="mt-3">
                                {task.subtasks.length > 0 ? (
                                  <div className="relative ml-[0.6rem] border-l-2 border-dashed border-[#ddd6f9] pl-4 dark:border-white/10">
                                    <ul className="space-y-1">
                                      {task.subtasks.map((subtask) => (
                                        <SubtaskBranch
                                          key={subtask.id}
                                          onSetSubtaskStatus={onSetSubtaskStatus}
                                          subtask={subtask}
                                        />
                                      ))}
                                    </ul>
                                  </div>
                                ) : (
                                  <div className="rounded-[1rem] border border-dashed border-[#ddd6f9] bg-[#faf8ff] px-4 py-4 text-sm text-[#7b84a0] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/50">
                                    No subtasks yet.
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </motion.div>
                  </motion.li>
                );
              })}
            </ul>
          </LayoutGroup>
        )}
      </motion.div>
    </div>
  );
}
