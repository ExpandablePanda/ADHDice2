"use client";

import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  ArrowRight,
  CirclePlus,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleX,
  Ellipsis,
  Clock,
  PenLine,
  Star,
} from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";

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
  metadata: Array<{
    label: string;
    value: string;
  }>;
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
  onAddChildSubtask: (parentSubtaskId: string) => Promise<string | null>;
  onClearTaskSelection: () => void;
  onDeleteSelectedTasks: () => void;
  onEditTask: (taskId: string) => void;
  onOpenBatchEdit: () => void;
  onRenameSubtask: (subtaskId: string, title: string) => void;
  onRenameTask: (taskId: string, title: string) => void;
  onSelectBucket: (bucket: string) => void;
  onSelectAllVisible: () => void;
  onSetSubtaskStatus: (subtaskId: string, status: AgentPlanStatus) => void;
  onSetTaskStatus: (taskId: string, status: AgentPlanStatus) => void;
  onToggleTaskSelection: (taskId: string, options?: { additive?: boolean; range?: boolean }) => void;
  selectedBucket: string;
  selectedTaskIds: string[];
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

const SUBTASK_RAIL_WIDTH_CLASS = "grid-cols-[2.25rem_minmax(0,1fr)]";
const SUBTASK_CHILD_LIST_PADDING_CLASS = "pl-[2.25rem]";
const CONNECTOR_ICON_GAP = 22;

type ConnectorLine = {
  x: number;
  y1: number;
  y2: number;
};

function getMetadataValue(task: AgentPlanTaskItem, label: string) {
  return task.metadata.find((item) => item.label === label)?.value ?? "—";
}

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

type SubtaskBranchProps = {
  autofocusSubtaskId: string | null;
  connectorsSettling: boolean;
  onAddChildSubtask: (parentSubtaskId: string) => Promise<string | null>;
  onAutofocusHandled: () => void;
  onConnectorSettled: () => void;
  onRenameSubtask: (subtaskId: string, title: string) => void;
  onSetSubtaskStatus: (subtaskId: string, status: AgentPlanStatus) => void;
  registerAnchor: (subtaskId: string, element: HTMLDivElement | null) => void;
  subtask: AgentPlanSubtaskItem;
};

function SubtaskBranch({
  autofocusSubtaskId,
  connectorsSettling,
  onAddChildSubtask,
  onAutofocusHandled,
  onConnectorSettled,
  onRenameSubtask,
  onSetSubtaskStatus,
  registerAnchor,
  subtask,
}: SubtaskBranchProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(subtask.title);
  const hasChildren = subtask.children.length > 0;

  useEffect(() => {
    setTitleDraft(subtask.title);
  }, [subtask.title]);

  useEffect(() => {
    if (autofocusSubtaskId !== subtask.id) {
      return;
    }
    setTitleDraft(subtask.title);
    setIsEditingTitle(true);
    onAutofocusHandled();
  }, [autofocusSubtaskId, onAutofocusHandled, subtask.id, subtask.title]);

  function finishRename(shouldSave: boolean) {
    if (!shouldSave) {
      setTitleDraft(subtask.title);
      setIsEditingTitle(false);
      return;
    }

    const trimmedTitle = titleDraft.trim();
    if (!trimmedTitle) {
      setTitleDraft(subtask.title);
      setIsEditingTitle(false);
      return;
    }

    if (trimmedTitle !== subtask.title) {
      onRenameSubtask(subtask.id, trimmedTitle);
    }
    setIsEditingTitle(false);
  }

  return (
    <li className="relative">
      <div className={`grid ${SUBTASK_RAIL_WIDTH_CLASS} items-start gap-2 py-1`}>
        <div className="relative flex min-h-[2.4rem] justify-center">
          <div className="relative pt-0.5" ref={(element) => registerAnchor(subtask.id, element)}>
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
        </div>
        <div className="relative min-w-0">
          <div className="flex min-w-0 items-start gap-2">
            {hasChildren ? (
              <button
                className="mt-0.5 shrink-0 text-[#8d97b0] transition hover:text-[#6f57f6] dark:text-white/40 dark:hover:text-[#cabfff]"
                onClick={() => {
                  markConnectorsSettling();
                  setIsOpen((current) => !current);
                }}
                type="button"
              >
                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <span className="mt-1 h-3.5 w-3.5 shrink-0" />
            )}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {isEditingTitle ? (
                <input
                  autoFocus
                  className={`min-w-0 w-full max-w-[28rem] rounded-md border border-[#ddd6f9] bg-white px-2 py-1 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04] ${isClosedStatus(subtask.status) ? "line-through opacity-50" : "text-[#38415e] dark:text-white/75"}`}
                  onBlur={() => finishRename(true)}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      finishRename(true);
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      finishRename(false);
                    }
                  }}
                  value={titleDraft}
                />
              ) : (
                <button
                  className={`min-w-0 max-w-[28rem] truncate text-left text-sm ${isClosedStatus(subtask.status) ? "line-through opacity-50" : "text-[#38415e] dark:text-white/75"}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsEditingTitle(true);
                  }}
                  type="button"
                >
                  {subtask.title}
                </button>
              )}
              <button
                aria-label="Add child step"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#6f57f6] transition hover:bg-[#f1ecff] hover:text-[#5a45d1] dark:text-[#cabfff] dark:hover:bg-white/[0.08] dark:hover:text-white"
                onClick={async (event) => {
                  event.stopPropagation();
                  const nextSubtaskId = await onAddChildSubtask(subtask.id);
                  if (nextSubtaskId && !isOpen) {
                    markConnectorsSettling();
                    setIsOpen(true);
                  }
                }}
                type="button"
              >
                <CirclePlus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {hasChildren ? (
        <AnimatePresence initial={false}>
          {isOpen ? (
            <motion.div
              animate={{ height: "auto", opacity: 1 }}
              className="overflow-hidden"
              exit={{ height: 0, opacity: 0 }}
              initial={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onAnimationComplete={onConnectorSettled}
            >
              <div className={SUBTASK_CHILD_LIST_PADDING_CLASS}>
                <SubtaskList
                  autofocusSubtaskId={autofocusSubtaskId}
                  connectFromParent
                  connectorsSettling={connectorsSettling}
                  onAddChildSubtask={onAddChildSubtask}
                  onAutofocusHandled={onAutofocusHandled}
                  onConnectorSettled={onConnectorSettled}
                  onRenameSubtask={onRenameSubtask}
                  onSetSubtaskStatus={onSetSubtaskStatus}
                  subtasks={subtask.children}
                />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      ) : null}
    </li>
  );
}

function SubtaskList({
  autofocusSubtaskId,
  connectFromParent = false,
  connectorsSettling = false,
  onAddChildSubtask,
  onAutofocusHandled,
  onConnectorSettled,
  onRenameSubtask,
  onSetSubtaskStatus,
  subtasks,
}: {
  autofocusSubtaskId: string | null;
  connectFromParent?: boolean;
  connectorsSettling?: boolean;
  onAddChildSubtask: (parentSubtaskId: string) => Promise<string | null>;
  onAutofocusHandled: () => void;
  onConnectorSettled: () => void;
  onRenameSubtask: (subtaskId: string, title: string) => void;
  onSetSubtaskStatus: (subtaskId: string, status: AgentPlanStatus) => void;
  subtasks: AgentPlanSubtaskItem[];
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const anchorRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [connectors, setConnectors] = useState<ConnectorLine[]>([]);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const measure = () => {
      const wrapperRect = wrapper.getBoundingClientRect();
      const siblingConnectors = subtasks.flatMap((subtask, index) => {
        const currentAnchor = anchorRefs.current[subtask.id];
        const nextAnchor = anchorRefs.current[subtasks[index + 1]?.id ?? ""];
        if (!currentAnchor || !nextAnchor) {
          return [];
        }

        const currentRect = currentAnchor.getBoundingClientRect();
        const nextRect = nextAnchor.getBoundingClientRect();
        const x = currentRect.left + (currentRect.width / 2) - wrapperRect.left;
        const y1 = currentRect.top + (currentRect.height / 2) - wrapperRect.top + CONNECTOR_ICON_GAP;
        const y2 = nextRect.top + (nextRect.height / 2) - wrapperRect.top - CONNECTOR_ICON_GAP;
        return [{ x, y1, y2 }];
      });

      const firstAnchor = subtasks.length > 0 ? anchorRefs.current[subtasks[0].id] : null;
      const parentConnector = connectFromParent && firstAnchor
        ? (() => {
            const firstRect = firstAnchor.getBoundingClientRect();
            const x = firstRect.left + (firstRect.width / 2) - wrapperRect.left;
            const y2 = firstRect.top + (firstRect.height / 2) - wrapperRect.top - CONNECTOR_ICON_GAP;
            return [{ x, y1: 0, y2 }];
          })()
        : [];

      setConnectors([...parentConnector, ...siblingConnectors]);
    };

    measure();
    const frame = window.requestAnimationFrame(measure);
    const resizeObserver = new ResizeObserver(() => measure());
    resizeObserver.observe(wrapper);
    Object.values(anchorRefs.current).forEach((anchor) => {
      if (anchor) {
        resizeObserver.observe(anchor);
      }
    });
    window.addEventListener("resize", measure);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [autofocusSubtaskId, connectFromParent, subtasks]);

  return (
    <div className="relative">
      <svg
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 overflow-visible transition-opacity duration-100 ${connectorsSettling ? "opacity-0" : "opacity-100"}`}
        height="100%"
        preserveAspectRatio="none"
        width="100%"
      >
        {connectors.map((connector) => (
          <line
            key={`${connector.x}-${connector.y1}-${connector.y2}`}
            stroke="#ddd6f9"
            strokeDasharray="8 8"
            strokeWidth="2"
            x1={connector.x}
            x2={connector.x}
            y1={connector.y1}
            y2={connector.y2}
          />
        ))}
      </svg>
      <div ref={wrapperRef}>
        <ul className="space-y-1">
          {subtasks.map((subtask) => (
            <SubtaskBranch
              autofocusSubtaskId={autofocusSubtaskId}
              connectorsSettling={connectorsSettling}
              key={subtask.id}
              onAddChildSubtask={onAddChildSubtask}
              onAutofocusHandled={onAutofocusHandled}
              onConnectorSettled={onConnectorSettled}
              onRenameSubtask={onRenameSubtask}
              onSetSubtaskStatus={onSetSubtaskStatus}
              registerAnchor={(subtaskId, element) => {
                anchorRefs.current[subtaskId] = element;
              }}
              subtask={subtask}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function AgentPlan({
  buckets,
  onAddChildSubtask,
  onClearTaskSelection,
  onDeleteSelectedTasks,
  onEditTask,
  onOpenBatchEdit,
  onRenameSubtask,
  onRenameTask,
  onSelectBucket,
  onSelectAllVisible,
  onSetSubtaskStatus,
  onSetTaskStatus,
  onToggleTaskSelection,
  selectedBucket,
  selectedTaskIds,
  tasks,
}: AgentPlanProps) {
  const prefersReducedMotion = useReducedMotion();
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);
  const [autofocusSubtaskId, setAutofocusSubtaskId] = useState<string | null>(null);
  const [connectorsSettling, setConnectorsSettling] = useState(false);
  const [openTaskIconMenuId, setOpenTaskIconMenuId] = useState<string | null>(null);
  const [openStatusTaskId, setOpenStatusTaskId] = useState<string | null>(null);
  const taskRailRef = useRef<HTMLDivElement | null>(null);
  const taskStatusAnchorRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [taskConnectors, setTaskConnectors] = useState<ConnectorLine[]>([]);
  const [taskTitleDraft, setTaskTitleDraft] = useState("");
  const selectedTaskIdSet = new Set(selectedTaskIds);

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

  useEffect(() => {
    if (!editingTaskId || tasks.some((task) => task.id === editingTaskId)) {
      return;
    }
    setEditingTaskId(null);
    setTaskTitleDraft("");
  }, [editingTaskId, tasks]);

  useLayoutEffect(() => {
    const wrapper = taskRailRef.current;
    if (!wrapper) {
      return;
    }

    const measure = () => {
      const wrapperRect = wrapper.getBoundingClientRect();
      const nextConnectors = tasks.flatMap((task, index) => {
        const currentAnchor = taskStatusAnchorRefs.current[task.id];
        const nextAnchor = taskStatusAnchorRefs.current[tasks[index + 1]?.id ?? ""];
        if (!currentAnchor || !nextAnchor) {
          return [];
        }

        const currentRect = currentAnchor.getBoundingClientRect();
        const nextRect = nextAnchor.getBoundingClientRect();
        const x = currentRect.left + (currentRect.width / 2) - wrapperRect.left;
        const y1 = currentRect.top + (currentRect.height / 2) - wrapperRect.top + CONNECTOR_ICON_GAP;
        const y2 = nextRect.top + (nextRect.height / 2) - wrapperRect.top - CONNECTOR_ICON_GAP;
        return [{ x, y1, y2 }];
      });

      setTaskConnectors(nextConnectors);
    };

    measure();
    const frame = window.requestAnimationFrame(measure);
    const resizeObserver = new ResizeObserver(() => measure());
    resizeObserver.observe(wrapper);
    Object.values(taskStatusAnchorRefs.current).forEach((anchor) => {
      if (anchor) {
        resizeObserver.observe(anchor);
      }
    });
    window.addEventListener("resize", measure);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [expandedTaskIds, tasks]);

  function beginTaskRename(taskId: string, title: string) {
    setEditingTaskId(taskId);
    setTaskTitleDraft(title);
  }

  function finishTaskRename(task: AgentPlanTaskItem, shouldSave: boolean) {
    if (!shouldSave) {
      setEditingTaskId(null);
      setTaskTitleDraft("");
      return;
    }

    const trimmedTitle = taskTitleDraft.trim();
    if (!trimmedTitle) {
      setEditingTaskId(null);
      setTaskTitleDraft(task.title);
      return;
    }

    if (trimmedTitle !== task.title) {
      onRenameTask(task.id, trimmedTitle);
    }
    setEditingTaskId(null);
    setTaskTitleDraft("");
  }

  async function handleAutofocusSubtask(parentSubtaskId: string) {
    const nextSubtaskId = await onAddChildSubtask(parentSubtaskId);
    if (nextSubtaskId) {
      setAutofocusSubtaskId(nextSubtaskId);
    }
    return nextSubtaskId;
  }

  function markConnectorsSettling() {
    setConnectorsSettling(true);
  }

  function markConnectorsSettled() {
    window.requestAnimationFrame(() => setConnectorsSettling(false));
  }

  function handleToggleTaskExpand(taskId: string) {
    markConnectorsSettling();
    setExpandedTaskIds((current) =>
      current.includes(taskId)
        ? current.filter((currentTaskId) => currentTaskId !== taskId)
        : [...current, taskId],
    );
  }

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
            {selectedTaskIds.length > 0 ? (
              <div className="sticky top-2 z-20 mb-4 flex flex-wrap items-center gap-3 rounded-[1.25rem] border border-[#ddd6fb] bg-[#faf8ff]/95 px-4 py-3 shadow-[0_16px_40px_rgba(81,61,168,0.10)] backdrop-blur dark:border-white/10 dark:bg-[#1f1836]/95">
                <span className="rounded-full bg-[#ede8ff] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#6f57f6] dark:bg-[#2a2148] dark:text-[#cabfff]">
                  {selectedTaskIds.length} selected
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="rounded-full border border-[#ddd6fb] bg-white px-3 py-1.5 text-sm font-semibold text-[#5c6684] transition hover:border-[#c9bcff] hover:text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70 dark:hover:text-[#cabfff]"
                    onClick={onSelectAllVisible}
                    type="button"
                  >
                    Select all visible
                  </button>
                  <button
                    className="rounded-full border border-[#ddd6fb] bg-white px-3 py-1.5 text-sm font-semibold text-[#5c6684] transition hover:border-[#c9bcff] hover:text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70 dark:hover:text-[#cabfff]"
                    onClick={onClearTaskSelection}
                    type="button"
                  >
                    Clear selection
                  </button>
                  <button
                    className="rounded-full bg-[#6f57f6] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#5e49d6] dark:bg-[#cabfff] dark:text-[#1a1431] dark:hover:bg-[#bda9ff]"
                    onClick={onOpenBatchEdit}
                    type="button"
                  >
                    Edit selected
                  </button>
                  <button
                    className="rounded-full bg-[#fff1f3] px-3 py-1.5 text-sm font-semibold text-[#d94e67] transition hover:bg-[#ffe4e9] dark:bg-[#44232f] dark:text-[#ff9eaf] dark:hover:bg-[#56303c]"
                    onClick={onDeleteSelectedTasks}
                    type="button"
                  >
                    Delete selected
                  </button>
                </div>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <div className="relative min-w-[75rem]" ref={taskRailRef}>
                <svg
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-0 z-0 overflow-visible transition-opacity duration-100 ${connectorsSettling ? "opacity-0" : "opacity-100"}`}
                  height="100%"
                  preserveAspectRatio="none"
                  width="100%"
                >
                  {taskConnectors.map((connector) => (
                    <line
                      key={`${connector.x}-${connector.y1}-${connector.y2}`}
                      stroke="#ddd6f9"
                      strokeDasharray="8 8"
                      strokeWidth="2"
                      x1={connector.x}
                      x2={connector.x}
                      y1={connector.y1}
                      y2={connector.y2}
                    />
                  ))}
                </svg>
              <table className="relative z-10 w-full table-fixed border-separate border-spacing-y-1 text-left">
                <colgroup>
                  <col className="w-24" />
                  <col className="w-[24rem]" />
                  <col className="w-32" />
                  <col className="w-36" />
                  <col className="w-28" />
                  <col className="w-28" />
                  <col className="w-28" />
                  <col className="w-36" />
                  <col className="w-44" />
                </colgroup>
                <thead>
                  <tr className="border-b border-[#f0ebfb] dark:border-white/10">
                    <th className="border-b border-[#f0ebfb] px-3 pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9aa3bb] dark:border-white/10 dark:text-white/30">
                      Status
                    </th>
                    {["Task", "Bucket", "Due", "Priority", "Energy", "Focus", "Repeat", "Signal"].map((label) => (
                      <th
                        className="border-b border-[#f0ebfb] px-3 pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9aa3bb] dark:border-white/10 dark:text-white/30"
                        key={label}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const expanded = expandedTaskIds.includes(task.id);
                    const isEditingTaskTitle = editingTaskId === task.id;
                    const isDone = isClosedStatus(task.status);
                    const bucketValue = getMetadataValue(task, "Bucket");
                    const dueValue = getMetadataValue(task, "Due");
                    const priorityValue = getMetadataValue(task, "Priority");
                    const energyValue = getMetadataValue(task, "Energy");
                    const focusValue = getMetadataValue(task, "Focus");
                    const repeatValue = getMetadataValue(task, "Repeat");

                    return (
                      <Fragment key={task.id}>
                        <motion.tr
                          animate={{ opacity: 1, y: 0 }}
                          className={`group cursor-pointer rounded-[1rem] transition ${
                            selectedTaskIdSet.has(task.id)
                              ? "bg-[#f6f2ff] dark:bg-[#261f43]"
                              : "hover:bg-[#fbf9ff] dark:hover:bg-white/[0.03]"
                          }`}
                          initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }}
                          onClick={(event) => {
                            onToggleTaskSelection(task.id, {
                              additive: event.metaKey || event.ctrlKey,
                              range: event.shiftKey,
                            });
                          }}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) {
                              return;
                            }
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onToggleTaskSelection(task.id, {
                                additive: event.metaKey || event.ctrlKey,
                                range: event.shiftKey,
                              });
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          transition={{ duration: 0.18 }}
                        >
                          <td className="relative px-3 py-3 align-top">
                            <div className="flex w-10 justify-center" ref={(element) => {
                              taskStatusAnchorRefs.current[task.id] = element;
                            }}>
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
                            </div>
                            {openTaskIconMenuId === task.id ? (
                              <div className="absolute left-full top-2 z-40 ml-3 min-w-[190px] rounded-[0.9rem] border border-[#ece8f8] bg-white p-2 shadow-[0_18px_36px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#1a1230]">
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
                          </td>

                          <td className="min-w-0 px-3 py-3 align-top">
                            <div className="min-w-0 rounded-[1rem] transition group-hover:bg-[#f8f6ff] group-focus-within:bg-[#f8f6ff] dark:group-hover:bg-white/[0.03] dark:group-focus-within:bg-white/[0.03]">
                              <div className="flex items-center gap-2">
                                {(task.subtasks.length > 0 || task.description) ? (
                                  <button
                                    aria-label={expanded ? `Collapse ${task.title}` : `Expand ${task.title}`}
                                    className="shrink-0 text-[#8d97b0] transition hover:text-[#6f57f6] dark:text-white/40 dark:hover:text-[#cabfff]"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleToggleTaskExpand(task.id);
                                    }}
                                    type="button"
                                  >
                                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                  </button>
                                ) : (
                                  <span className="h-4 w-4 shrink-0" />
                                )}
                                {isEditingTaskTitle ? (
                                  <input
                                    autoFocus
                                    className={`min-w-0 flex-1 rounded-md border border-[#ddd6f9] bg-white px-2 py-1 text-[15px] font-semibold outline-none dark:border-white/10 dark:bg-white/[0.04] ${isDone ? "text-[#8d97b0] line-through dark:text-white/45" : "text-[#1f2642] dark:text-white"}`}
                                    onBlur={() => finishTaskRename(task, true)}
                                    onChange={(event) => setTaskTitleDraft(event.target.value)}
                                    onClick={(event) => event.stopPropagation()}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        finishTaskRename(task, true);
                                      }
                                      if (event.key === "Escape") {
                                        event.preventDefault();
                                        finishTaskRename(task, false);
                                      }
                                    }}
                                    value={taskTitleDraft}
                                  />
                                ) : (
                                  <button
                                    className={`min-w-0 max-w-full truncate text-left text-[15px] font-semibold transition hover:text-[#6f57f6] dark:hover:text-[#cabfff] ${isDone ? "text-[#8d97b0] line-through dark:text-white/45" : "text-[#1f2642] dark:text-white"}`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      beginTaskRename(task.id, task.title);
                                    }}
                                    type="button"
                                  >
                                    {task.title}
                                  </button>
                                )}
                                <button
                                  aria-label={`Edit ${task.title}`}
                                  className="shrink-0 text-[#8d97b0] transition hover:text-[#6f57f6] dark:text-white/40 dark:hover:text-[#cabfff]"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onEditTask(task.id);
                                  }}
                                  type="button"
                                >
                                  <PenLine className="h-4 w-4" />
                                </button>
                              </div>
                              {task.description ? (
                                <p className="mt-1 line-clamp-1 text-sm text-[#7d88a1] dark:text-white/45">
                                  {task.description}
                                </p>
                              ) : null}
                            </div>
                          </td>

                          <td className="px-3 py-3 align-top text-sm text-[#59627e] dark:text-white/65">{bucketValue}</td>
                          <td className="px-3 py-3 align-top text-sm text-[#59627e] dark:text-white/65">{dueValue}</td>
                          <td className="px-3 py-3 align-top text-sm text-[#59627e] dark:text-white/65">{priorityValue}</td>
                          <td className="px-3 py-3 align-top text-sm text-[#59627e] dark:text-white/65">{energyValue}</td>
                          <td className="px-3 py-3 align-top text-sm text-[#59627e] dark:text-white/65">{focusValue}</td>
                          <td className="px-3 py-3 align-top text-sm text-[#59627e] dark:text-white/65">{repeatValue}</td>
                          <td className="px-3 py-3 align-top">
                            <div className="flex min-h-[1.75rem] min-w-0 flex-wrap gap-2">
                              {task.metaPills.length > 0 ? (
                                task.metaPills.map((pill) => (
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${META_PILL_STYLES[pill.tone ?? "neutral"]}`}
                                    key={`${task.id}-${pill.label}`}
                                  >
                                    {pill.label}
                                  </span>
                                ))
                              ) : (
                                <span className="text-sm text-[#59627e] dark:text-white/65">—</span>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                        <AnimatePresence initial={false}>
                          {expanded && (task.subtasks.length > 0 || task.description) ? (
                            <motion.tr
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              initial={{ opacity: 0, height: 0 }}
                              onAnimationComplete={markConnectorsSettled}
                              transition={{ duration: 0.22 }}
                            >
                              <td className="px-3 pt-0 pb-2" colSpan={9}>
                                <div>
                                  {task.description ? (
                                    <div className="mb-3 rounded-[1rem] border border-dashed border-[#ddd6f9] bg-[#faf8ff] px-4 py-4 text-sm text-[#59627e] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/65">
                                      {task.description}
                                    </div>
                                  ) : null}
                                  {task.subtasks.length > 0 ? (
                                    <div className={SUBTASK_CHILD_LIST_PADDING_CLASS}>
                                      <SubtaskList
                                        autofocusSubtaskId={autofocusSubtaskId}
                                        connectFromParent
                                        connectorsSettling={connectorsSettling}
                                        onAddChildSubtask={handleAutofocusSubtask}
                                        onAutofocusHandled={() => setAutofocusSubtaskId(null)}
                                        onConnectorSettled={markConnectorsSettled}
                                        onRenameSubtask={onRenameSubtask}
                                        onSetSubtaskStatus={onSetSubtaskStatus}
                                        subtasks={task.subtasks}
                                      />
                                    </div>
                                  ) : !task.description ? (
                                    <div className="rounded-[1rem] border border-dashed border-[#ddd6f9] bg-[#faf8ff] px-4 py-4 text-sm text-[#7b84a0] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/50">
                                      No subtasks yet.
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                            </motion.tr>
                          ) : null}
                        </AnimatePresence>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          </LayoutGroup>
        )}
      </motion.div>
    </div>
  );
}
