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
  Ellipsis,
  Footprints,
  Clock,
  PenLine,
  Star,
  X,
} from "lucide-react";
import { Fragment, type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

export type AgentPlanStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "missed"
  | "did_my_best"
  | "upcoming"
  | "not_due"
  | "archived"
  | "trashed";

export type AgentPlanMetaTone = "accent" | "danger" | "neutral" | "success" | "warning";

export type AgentPlanMetaPill = {
  label: string;
  tone?: AgentPlanMetaTone;
};

export type AgentPlanColumnId = "bucket" | "date_added" | "date_completed" | "last_done" | "due" | "energy" | "estimated_time" | "actual_time" | "streak" | "tags" | "link" | "notes" | "priority" | "repeat" | "signal";

const REORDERABLE_COLUMN_IDS: AgentPlanColumnId[] = ["bucket", "date_added", "date_completed", "last_done", "due", "energy", "estimated_time", "actual_time", "streak", "tags", "link", "notes", "priority", "repeat", "signal"];

export type AgentPlanSubtaskItem = {
  children: AgentPlanSubtaskItem[];
  id: string;
  status: AgentPlanStatus;
  title: string;
};

export type AgentPlanTaskItem = {
  actualSeconds: number;
  bucket: string;
  completedAt: string | null;
  dueOn: string | null;
  dueTime: string | null;
  estimatedMinutes: number | null;
  externalLinkLabel: string | null;
  externalLinkUrl: string | null;
  id: string;
  isFocused: boolean;
  isImportant: boolean;
  isUrgent: boolean;
  createdAt: string;
  updatedAt: string;
  linkedNotes: Array<{
    body: string;
    id: string;
    title: string;
    updatedAt: string;
  }>;
  lists: Array<{
    id: string;
    isManual: boolean;
    label: string;
    tone?: AgentPlanMetaTone;
  }>;
  metadata: Array<{
    label: string;
    value: string;
  }>;
  metaPills: AgentPlanMetaPill[];
  notes: string;
  rowChips: AgentPlanMetaPill[];
  currentStreak: number;
  missedStreak: number;
  repeatFrequency: "none" | "daily" | "daily_until_complete" | "weekly" | "monthly" | "custom";
  repeatInterval: number;
  repeatDaysOfWeek: number[];
  repeatDayOfMonth: number | null;
  subtasksAutoReset: boolean;
  status: AgentPlanStatus;
  subtasks: AgentPlanSubtaskItem[];
  tags: string[];
  title: string;
};

export type AgentPlanBucketOption = {
  count: number;
  label: string;
  value: string;
};

type AgentPlanDuePreset = "next_week" | "none" | "today" | "tomorrow";
type AgentPlanEnergyValue = "high" | "low" | "medium" | "none";
type AgentPlanPriorityValue = "focus" | "important" | "none" | "urgent";
type AgentPlanRepeatValue = "custom" | "daily" | "monthly" | "none" | "weekly";
type EditableTaskField = "bucket" | "due" | "energy" | "priority" | "repeat" | "tags" | "link" | "notes";
type OpenTaskFieldMenu = {
  field: EditableTaskField;
  taskId: string;
} | null;

type AgentPlanProps = {
  allNotes: Array<{
    body: string;
    id: string;
    linked_task_ids: string[];
    title: string;
    updated_at: string;
  }>;
  allTags: string[];
  listOptions: AgentPlanBucketOption[];
  manualListOptions: AgentPlanBucketOption[];
  onAddTaskSubtask: (taskId: string) => Promise<string | null>;
  onAddChildSubtask: (parentSubtaskId: string) => Promise<string | null>;
  onClearTaskSelection: () => void;
  onDeleteSubtask: (subtaskId: string) => Promise<boolean>;
  onDeleteSelectedTasks: () => void;
  onEditTask: (taskId: string) => void;
  onOpenTaskActualTime: (taskId: string) => void;
  onOpenBatchEdit: () => void;
  onReorderColumns: (columnId: AgentPlanColumnId, targetColumnId: AgentPlanColumnId) => void;
  onRenameSubtask: (subtaskId: string, title: string) => void;
  onRenameTask: (taskId: string, title: string) => void;
  onSelectSingleTask: (taskId: string) => void;
  onSetTaskEstimatedMinutes: (taskId: string, minutes: number | null) => Promise<void> | void;
  onSetTaskLink: (taskId: string, nextLink: { label: string; url: string }) => Promise<void> | void;
  onSetTaskLinkedNoteIds: (taskId: string, linkedNoteIds: string[]) => Promise<void> | void;
  onSetTaskNotes: (taskId: string, notes: string) => Promise<void> | void;
  onSetSubtaskStatus: (subtaskId: string, status: AgentPlanStatus) => void;
  onSetTaskDuePreset: (taskId: string, preset: AgentPlanDuePreset) => void;
  onSetTaskDueSchedule?: (taskId: string, schedule: { dueOn: string | null; dueTime: string | null }) => void;
  onSetTaskEnergy: (taskId: string, energy: AgentPlanEnergyValue) => void;
  onSetTaskBucket: (taskId: string, bucket: string) => void;
  onSetTaskTags: (taskId: string, tags: string[]) => Promise<void> | void;
  onSetTaskPriority: (taskId: string, priority: AgentPlanPriorityValue) => void;
  onSetTaskRecurringPreset?: (taskId: string, preset: AgentPlanRepeatValue) => void;
  onSelectBucket: (bucket: string) => void;
  onSelectAllVisible: () => void;
  onSetTaskStatus: (taskId: string, status: AgentPlanStatus) => void;
  onToggleTaskSelection: (taskId: string, options?: { additive?: boolean; range?: boolean }) => void;
  selectedBucket: string;
  selectedTaskIds: string[];
  tasks: AgentPlanTaskItem[];
  visibleColumns: AgentPlanColumnId[];
  experimentalMode?: boolean;
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

const DUE_PRESET_OPTIONS: Array<{ label: string; value: AgentPlanDuePreset }> = [
  { label: "No Date", value: "none" },
  { label: "Today", value: "today" },
  { label: "Tomorrow", value: "tomorrow" },
  { label: "Next Week", value: "next_week" },
];

const PRIORITY_OPTIONS: Array<{ label: string; value: AgentPlanPriorityValue }> = [
  { label: "None", value: "none" },
  { label: "Focus", value: "focus" },
  { label: "Important", value: "important" },
  { label: "Urgent", value: "urgent" },
];

const ENERGY_OPTIONS: Array<{ label: string; value: AgentPlanEnergyValue }> = [
  { label: "None", value: "none" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];

const REPEAT_OPTIONS: Array<{ label: string; value: AgentPlanRepeatValue }> = [
  { label: "No Repeat", value: "none" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Custom Cadence", value: "custom" },
];

function getIsoDateOffset(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getDuePresetValueFromLabel(label: string): AgentPlanDuePreset | null {
  if (label === "No date") {
    return "none";
  }
  if (label === "Today") {
    return "today";
  }
  if (label === "Tomorrow") {
    return "tomorrow";
  }
  if (label === getIsoDateOffset(7)) {
    return "next_week";
  }
  return null;
}

const STATUS_LABELS: Record<AgentPlanStatus, string> = {
  archived: "Archived",
  pending: "Pending",
  in_progress: "In Progress",
  done: "Done",
  missed: "Missed",
  did_my_best: "Did My Best",
  upcoming: "Upcoming",
  not_due: "Not Due",
  trashed: "Trash",
};

const STATUS_BADGE_STYLES: Record<AgentPlanStatus, string> = {
  pending: "border border-[#f6be96] bg-white text-[#d96b1c]",
  in_progress: "border border-[#b7caf6] bg-white text-[#4473df]",
  done: "border border-[#97dfc1] bg-white text-[#119a69]",
  missed: "border border-[#f4afbc] bg-white text-[#d94e67]",
  did_my_best: "border border-[#f2d36f] bg-white text-[#b28700]",
  upcoming: "border border-[#cfd6e4] bg-white text-[#68738c]",
  not_due: "border border-[#a9daf7] bg-white text-[#3388c9]",
  archived: "border border-[#b7becd] bg-white text-[#5e687d]",
  trashed: "border border-[#f4afbc] bg-white text-[#d94e67]",
};

const META_PILL_STYLES: Record<AgentPlanMetaTone, string> = {
  accent: "bg-[#f1ecff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]",
  danger: "bg-[#fff1f3] text-[#d94e67] dark:bg-[#44232f] dark:text-[#ff9eaf]",
  neutral: "bg-[#f4f5f8] text-[#68738c] dark:bg-white/8 dark:text-white/60",
  success: "bg-[#e8fbf2] text-[#119a69] dark:bg-[#16352c] dark:text-[#7de4b8]",
  warning: "bg-[#fff6df] text-[#b77900] dark:bg-[#44350d] dark:text-[#ffd56b]",
};
const META_PILL_BASE_CLASS = "inline-flex max-w-full shrink-0 items-center rounded-full px-2.5 py-1 text-[13px] font-semibold leading-none whitespace-nowrap";

const CONNECTOR_ICON_GAP = 22;
const SUBTASK_RAIL_WIDTH_CLASS = "grid-cols-[2.25rem_minmax(0,1fr)]";
const SUBTASK_CHILD_LIST_PADDING_CLASS = "pl-[2.25rem]";
const TASK_CONNECTOR_STROKE = "#d8ccff";
const FOCUS_RING_CLASS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f57f6] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-[#cabfff] dark:focus-visible:ring-offset-[#171328]";
const DEFAULT_COLUMN_WIDTHS: Record<ResizableColumnId, number> = {
  bucket: 150,
  date_added: 168,
  date_completed: 176,
  last_done: 156,
  due: 168,
  energy: 132,
  estimated_time: 156,
  actual_time: 132,
  streak: 112,
  tags: 156,
  link: 156,
  notes: 176,
  priority: 132,
  repeat: 150,
  signal: 176,
  status: 74,
  task: 360,
};
const MIN_COLUMN_WIDTHS: Record<ResizableColumnId, number> = {
  bucket: 84,
  date_added: 112,
  date_completed: 120,
  last_done: 112,
  due: 52,
  energy: 92,
  estimated_time: 92,
  actual_time: 108,
  streak: 76,
  tags: 72,
  link: 68,
  notes: 80,
  priority: 96,
  repeat: 88,
  signal: 122,
  status: 38,
  task: 160,
};
const COLUMN_HEADER_LABELS: Record<ResizableColumnId, string> = {
  bucket: "Lists",
  date_added: "Date Added",
  date_completed: "Date Completed",
  last_done: "Last Done",
  due: "Due",
  energy: "Energy",
  estimated_time: "Est. Time",
  actual_time: "Actual time",
  streak: "Streak",
  tags: "Tags",
  link: "Link",
  notes: "Notes",
  priority: "Priority",
  repeat: "Repeat",
  signal: "Indicators",
  status: "Status",
  task: "Task",
};

type ConnectorLine = {
  x: number;
  y1: number;
  y2: number;
};

type HorizontalScrollIndicator = {
  active: boolean;
  left: number;
  scrollable: boolean;
  width: number;
};

type ResizableColumnId = "bucket" | "date_added" | "date_completed" | "last_done" | "due" | "energy" | "estimated_time" | "actual_time" | "streak" | "tags" | "link" | "notes" | "priority" | "repeat" | "signal" | "status" | "task";

function getPriorityTone(priority: AgentPlanPriorityValue): AgentPlanMetaTone {
  if (priority === "focus") return "accent";
  if (priority === "important") return "warning";
  if (priority === "urgent") return "danger";
  return "neutral";
}

function getEnergyTone(energy: AgentPlanEnergyValue): AgentPlanMetaTone {
  if (energy === "low") return "success";
  if (energy === "medium") return "warning";
  if (energy === "high") return "danger";
  return "neutral";
}

function getMetadataValue(task: AgentPlanTaskItem, label: string) {
  return task.metadata.find((item) => item.label === label)?.value ?? "—";
}

function formatDueDateChipLabel(dueOn: string | null) {
  if (!dueOn) {
    return "No date";
  }
  if (dueOn === getIsoDateOffset(0)) {
    return "Today";
  }
  if (dueOn === getIsoDateOffset(1)) {
    return "Tomorrow";
  }
  return dueOn;
}

function formatDateAddedLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "—";
  }

  return date.toLocaleString([], {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDueTimeChipLabel(dueTime: string | null) {
  if (!dueTime) {
    return null;
  }

  const [hours, minutes] = dueTime.split(":");
  const parsedHours = Number.parseInt(hours ?? "", 10);
  const parsedMinutes = Number.parseInt(minutes ?? "", 10);
  if (!Number.isFinite(parsedHours) || !Number.isFinite(parsedMinutes)) {
    return dueTime;
  }

  const normalizedHours = parsedHours % 24;
  const suffix = normalizedHours >= 12 ? "PM" : "AM";
  const displayHours = normalizedHours % 12 === 0 ? 12 : normalizedHours % 12;
  return `${displayHours}:${String(parsedMinutes).padStart(2, "0")} ${suffix}`;
}

function formatDurationMinutes(minutes: number | null) {
  if (!minutes || minutes <= 0) {
    return null;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0 && remainingMinutes > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${remainingMinutes}m`;
}

function formatDurationSeconds(seconds: number) {
  if (seconds <= 0) {
    return null;
  }

  return formatDurationMinutes(Math.max(1, Math.ceil(seconds / 60)));
}

function isProbablyValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function summarizeTags(tags: string[]) {
  if (tags.length === 0) {
    return "#";
  }
  if (tags.length === 1) {
    return `#${tags[0]}`;
  }
  return `#${tags[0]} +${tags.length - 1}`;
}

function summarizeNotes(task: AgentPlanTaskItem) {
  const hasTaskNotes = task.notes.trim().length > 0;
  const linkedCount = task.linkedNotes.length;
  if (!hasTaskNotes && linkedCount === 0) {
    return "Notes";
  }
  if (hasTaskNotes && linkedCount > 0) {
    return `Note +${linkedCount}`;
  }
  if (hasTaskNotes) {
    return "Note";
  }
  return linkedCount === 1 ? "1 linked" : `${linkedCount} linked`;
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
        <X className="h-3.5 w-3.5 translate-y-[0.5px]" strokeWidth={2.6} />
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
  onDeleteSubtask: (subtaskId: string) => Promise<boolean>;
  onAutofocusHandled: () => void;
  onConnectorSettled: () => void;
  onConnectorSettling: () => void;
  onRenameSubtask: (subtaskId: string, title: string) => void;
  onSetSubtaskStatus: (subtaskId: string, status: AgentPlanStatus) => void;
  registerAnchor: (subtaskId: string, element: HTMLDivElement | null) => void;
  subtask: AgentPlanSubtaskItem;
};

function SubtaskBranch({
  autofocusSubtaskId,
  connectorsSettling,
  onAddChildSubtask,
  onDeleteSubtask,
  onAutofocusHandled,
  onConnectorSettled,
  onConnectorSettling,
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
              className={`shrink-0 rounded-full ${FOCUS_RING_CLASS}`}
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
                  onConnectorSettling();
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
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f3efff] text-[#6f57f6] transition hover:bg-[#e8e0ff] hover:text-[#5a45d1] dark:bg-[#22193f] dark:text-[#cabfff] dark:hover:bg-[#2d2254] dark:hover:text-white ${FOCUS_RING_CLASS}`}
                onClick={async (event) => {
                  event.stopPropagation();
                  const nextSubtaskId = await onAddChildSubtask(subtask.id);
                  if (nextSubtaskId && !isOpen) {
                    onConnectorSettling();
                    setIsOpen(true);
                  }
                }}
                type="button"
              >
                <Footprints className="h-3.5 w-3.5" />
              </button>
              <button
                aria-label="Delete step"
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fff3ea] text-[#d96b1c] transition hover:bg-[#ffe5d1] hover:text-[#bf5d14] dark:bg-[#3a2117] dark:text-[#ffbd7a] dark:hover:bg-[#4a2b1f] dark:hover:text-white ${FOCUS_RING_CLASS}`}
                onClick={async (event) => {
                  event.stopPropagation();
                  await onDeleteSubtask(subtask.id);
                }}
                type="button"
              >
                <CircleX className="h-3.5 w-3.5" />
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
                  onDeleteSubtask={onDeleteSubtask}
                  onAutofocusHandled={onAutofocusHandled}
                  onConnectorSettled={onConnectorSettled}
                  onConnectorSettling={onConnectorSettling}
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
  onDeleteSubtask,
  onAutofocusHandled,
  onConnectorSettled,
  onConnectorSettling,
  onRenameSubtask,
  onSetSubtaskStatus,
  subtasks,
}: {
  autofocusSubtaskId: string | null;
  connectFromParent?: boolean;
  connectorsSettling?: boolean;
  onAddChildSubtask: (parentSubtaskId: string) => Promise<string | null>;
  onDeleteSubtask: (subtaskId: string) => Promise<boolean>;
  onAutofocusHandled: () => void;
  onConnectorSettled: () => void;
  onConnectorSettling: () => void;
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
            stroke={TASK_CONNECTOR_STROKE}
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
              onDeleteSubtask={onDeleteSubtask}
              onAutofocusHandled={onAutofocusHandled}
              onConnectorSettled={onConnectorSettled}
              onConnectorSettling={onConnectorSettling}
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
  allNotes,
  allTags,
  listOptions,
  manualListOptions,
  onAddTaskSubtask,
  onAddChildSubtask,
  onClearTaskSelection,
  onDeleteSubtask,
  onDeleteSelectedTasks,
  onEditTask,
  onOpenTaskActualTime,
  onOpenBatchEdit,
  onReorderColumns,
  onRenameSubtask,
  onRenameTask,
  onSelectSingleTask,
  onSetTaskEstimatedMinutes,
  onSetTaskLink,
  onSetTaskLinkedNoteIds,
  onSetTaskNotes,
  onSetSubtaskStatus,
  onSetTaskDueSchedule,
  onSetTaskDuePreset,
  onSetTaskEnergy,
  onSetTaskBucket,
  onSetTaskTags,
  onSetTaskPriority,
  onSetTaskRecurringPreset,
  onSelectBucket,
  onSelectAllVisible,
  onSetTaskStatus,
  onToggleTaskSelection,
  selectedBucket,
  selectedTaskIds,
  tasks,
  visibleColumns,
  experimentalMode = false,
}: AgentPlanProps) {
  const prefersReducedMotion = useReducedMotion();
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);
  const [autofocusSubtaskId, setAutofocusSubtaskId] = useState<string | null>(null);
  const [connectorsSettling, setConnectorsSettling] = useState(false);
  const [openTaskIconMenuId, setOpenTaskIconMenuId] = useState<string | null>(null);
  const [openTaskFieldMenu, setOpenTaskFieldMenu] = useState<OpenTaskFieldMenu>(null);
  const [openEstimatedTimeMenuTaskId, setOpenEstimatedTimeMenuTaskId] = useState<string | null>(null);
  const [estimatedTimeDrafts, setEstimatedTimeDrafts] = useState<Record<string, { hours: string; minutes: string }>>({});
  const [dueDrafts, setDueDrafts] = useState<Record<string, { dueOn: string; dueTime: string }>>({});
  const [tagInputDrafts, setTagInputDrafts] = useState<Record<string, string>>({});
  const [linkDrafts, setLinkDrafts] = useState<Record<string, { label: string; url: string }>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, { linkedNoteIds: string[]; notes: string }>>({});
  const [draggedHeaderColumnId, setDraggedHeaderColumnId] = useState<AgentPlanColumnId | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<ResizableColumnId, number>>(DEFAULT_COLUMN_WIDTHS);
  const [taskScrollIndicator, setTaskScrollIndicator] = useState<HorizontalScrollIndicator>({
    active: false,
    left: 0,
    scrollable: false,
    width: 0,
  });
  const taskScrollRef = useRef<HTMLDivElement | null>(null);
  const taskRailRef = useRef<HTMLDivElement | null>(null);
  const taskTableRef = useRef<HTMLTableElement | null>(null);
  const taskRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const taskStatusAnchorRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [taskConnectors, setTaskConnectors] = useState<ConnectorLine[]>([]);
  const [taskTitleDraft, setTaskTitleDraft] = useState("");
  const taskScrollIdleTimeoutRef = useRef<number | null>(null);
  const resizeStateRef = useRef<{ columnId: ResizableColumnId; startWidth: number; startX: number } | null>(null);
  const headerDragStateRef = useRef<{ columnId: AgentPlanColumnId; lastTargetId: AgentPlanColumnId | null } | null>(null);
  const isLargeTaskList = tasks.length >= 150;
  const selectedTaskIdSet = new Set(selectedTaskIds);
  const orderedOptionalColumns = useMemo(() => visibleColumns, [visibleColumns]);
  const estimatedTimePresets = useMemo(() => ([
    { label: "5m", minutes: 5 },
    { label: "10m", minutes: 10 },
    { label: "15m", minutes: 15 },
    { label: "30m", minutes: 30 },
    { label: "45m", minutes: 45 },
    { label: "1h", minutes: 60 },
  ]), []);
  const assignableBucketOptions = useMemo(() => manualListOptions, [manualListOptions]);
  const assignableBucketRows = useMemo(
    () => [
      assignableBucketOptions.slice(0, 4),
      assignableBucketOptions.slice(4),
    ].filter((row) => row.length > 0),
    [assignableBucketOptions],
  );
  const duePresetRows = useMemo(
    () => [DUE_PRESET_OPTIONS.slice(0, 2), DUE_PRESET_OPTIONS.slice(2)].filter((row) => row.length > 0),
    [],
  );
  const priorityRows = useMemo(() => [PRIORITY_OPTIONS], []);
  const repeatRows = useMemo(() => [REPEAT_OPTIONS.slice(0, 3), REPEAT_OPTIONS.slice(3)].filter((row) => row.length > 0), []);
  const energyRows = useMemo(() => [ENERGY_OPTIONS], []);
  const taskById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks],
  );
  const allNotesById = useMemo(
    () => new Map(allNotes.map((note) => [note.id, note])),
    [allNotes],
  );
  const totalTableWidth = useMemo(() => {
    let total = columnWidths.status + columnWidths.task;
    for (const columnId of orderedOptionalColumns) {
      total += columnWidths[columnId];
    }
    return total;
  }, [columnWidths, orderedOptionalColumns]);
  const isTaskFieldMenuOpen = (taskId: string, field: EditableTaskField) => (
    openTaskFieldMenu?.taskId === taskId && openTaskFieldMenu.field === field
  );
  const openTaskField = (taskId: string, field: EditableTaskField) => {
    setOpenTaskFieldMenu((current) => current?.taskId === taskId && current.field === field
      ? null
      : { field, taskId });
  };
  const toggleTaskTag = async (task: AgentPlanTaskItem, tag: string) => {
    const normalizedTag = tag.trim().toLowerCase();
    if (!normalizedTag) {
      return;
    }
    const nextTags = task.tags.includes(normalizedTag)
      ? task.tags.filter((value) => value !== normalizedTag)
      : [...task.tags, normalizedTag];
    await onSetTaskTags(task.id, nextTags);
  };
  const addTaskTag = async (task: AgentPlanTaskItem, rawTag: string) => {
    const normalizedTag = rawTag.trim().toLowerCase();
    if (!normalizedTag || task.tags.includes(normalizedTag)) {
      return;
    }
    await onSetTaskTags(task.id, [...task.tags, normalizedTag]);
  };
  const toggleDraftLinkedNote = (taskId: string, noteId: string) => {
    setNoteDrafts((current) => {
      const existing = current[taskId] ?? { linkedNoteIds: [], notes: "" };
      const linkedNoteIds = existing.linkedNoteIds.includes(noteId)
        ? existing.linkedNoteIds.filter((value) => value !== noteId)
        : [...existing.linkedNoteIds, noteId];
      return {
        ...current,
        [taskId]: {
          ...existing,
          linkedNoteIds,
        },
      };
    });
  };

  useEffect(() => {
    setExpandedTaskIds((current) => current.filter((taskId) => tasks.some((task) => task.id === taskId)));
  }, [tasks]);

  useEffect(() => {
    setOpenTaskIconMenuId(null);
    setOpenTaskFieldMenu(null);
    setOpenEstimatedTimeMenuTaskId(null);
  }, [selectedBucket, tasks]);

  useEffect(() => {
    if (!openTaskFieldMenu) {
      return;
    }

    if (openTaskFieldMenu.field === "link") {
      const task = taskById.get(openTaskFieldMenu.taskId);
      setLinkDrafts((current) => ({
        ...current,
        [openTaskFieldMenu.taskId]: {
          label: task?.externalLinkLabel ?? "",
          url: task?.externalLinkUrl ?? "",
        },
      }));
    }

    if (openTaskFieldMenu.field === "notes") {
      const task = taskById.get(openTaskFieldMenu.taskId);
      setNoteDrafts((current) => ({
        ...current,
        [openTaskFieldMenu.taskId]: {
          linkedNoteIds: task?.linkedNotes.map((note) => note.id) ?? [],
          notes: task?.notes ?? "",
        },
      }));
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-task-field-menu]")) {
        setOpenTaskFieldMenu(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openTaskFieldMenu, taskById]);

  useEffect(() => {
    if (!openEstimatedTimeMenuTaskId) {
      return;
    }

    const task = tasks.find((entry) => entry.id === openEstimatedTimeMenuTaskId);
    const currentMinutes = task?.estimatedMinutes ?? 0;
    setEstimatedTimeDrafts((current) => ({
      ...current,
      [openEstimatedTimeMenuTaskId]: {
        hours: currentMinutes > 0 ? String(Math.floor(currentMinutes / 60)) : "",
        minutes: currentMinutes > 0 ? String(currentMinutes % 60) : "",
      },
    }));

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-estimated-time-menu]")) {
        setOpenEstimatedTimeMenuTaskId(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openEstimatedTimeMenuTaskId, tasks]);

  useEffect(() => () => {
    if (taskScrollIdleTimeoutRef.current) {
      window.clearTimeout(taskScrollIdleTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const nextWidth = Math.max(
        MIN_COLUMN_WIDTHS[resizeState.columnId],
        resizeState.startWidth + (event.clientX - resizeState.startX),
      );
      setColumnWidths((current) => ({
        ...current,
        [resizeState.columnId]: nextWidth,
      }));
    };

    const handlePointerUp = () => {
      resizeStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = headerDragStateRef.current;
      if (!dragState) {
        return;
      }

      const targetColumn = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-agent-column-id]");
      const targetColumnId = targetColumn?.dataset.agentColumnId;

      if (
        targetColumnId &&
        REORDERABLE_COLUMN_IDS.includes(targetColumnId as AgentPlanColumnId) &&
        visibleColumns.includes(targetColumnId as AgentPlanColumnId) &&
        targetColumnId !== dragState.columnId &&
        targetColumnId !== dragState.lastTargetId
      ) {
        dragState.lastTargetId = targetColumnId as AgentPlanColumnId;
        onReorderColumns(dragState.columnId, targetColumnId as AgentPlanColumnId);
      }
    };

    const handlePointerUp = () => {
      headerDragStateRef.current = null;
      setDraggedHeaderColumnId(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [onReorderColumns, visibleColumns]);

  function updateTaskScrollIndicator(active = false) {
    const scrollElement = taskScrollRef.current;
    if (!scrollElement) {
      return;
    }

    const { clientWidth, scrollLeft, scrollWidth } = scrollElement;
    const scrollable = scrollWidth > clientWidth + 1;
    const width = scrollable ? Math.max(48, (clientWidth / scrollWidth) * clientWidth) : 0;
    const maxLeft = Math.max(0, clientWidth - width);
    const maxScroll = Math.max(1, scrollWidth - clientWidth);
    const left = scrollable ? (scrollLeft / maxScroll) * maxLeft : 0;

    setTaskScrollIndicator({
      active,
      left,
      scrollable,
      width,
    });
  }

  function handleTaskRailScroll() {
    updateTaskScrollIndicator(true);

    if (taskScrollIdleTimeoutRef.current) {
      window.clearTimeout(taskScrollIdleTimeoutRef.current);
    }

    taskScrollIdleTimeoutRef.current = window.setTimeout(() => {
      updateTaskScrollIndicator(false);
    }, 900);
  }

  useLayoutEffect(() => {
    const scrollElement = taskScrollRef.current;
    if (!scrollElement) {
      return;
    }

    const measure = () => updateTaskScrollIndicator(false);
    measure();
    const frame = window.requestAnimationFrame(measure);
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(scrollElement);

    if (scrollElement.firstElementChild instanceof HTMLElement) {
      resizeObserver.observe(scrollElement.firstElementChild);
    }

    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [orderedOptionalColumns, tasks.length, totalTableWidth]);

  useEffect(() => {
    if (!editingTaskId || tasks.some((task) => task.id === editingTaskId)) {
      return;
    }
    setEditingTaskId(null);
    setTaskTitleDraft("");
  }, [editingTaskId, tasks]);

  useLayoutEffect(() => {
    if (isLargeTaskList) {
      setTaskConnectors([]);
      return;
    }

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
  }, [isLargeTaskList, tasks]);

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

  function focusTaskRow(taskId: string) {
    taskRowRefs.current[taskId]?.focus();
  }

  function moveTaskFocus(taskId: string, direction: "next" | "previous" | "first" | "last") {
    const currentIndex = tasks.findIndex((task) => task.id === taskId);
    if (currentIndex === -1 || tasks.length === 0) {
      return;
    }

    const nextTask = direction === "first"
      ? tasks[0]
      : direction === "last"
        ? tasks.at(-1)
        : direction === "next"
          ? tasks[Math.min(tasks.length - 1, currentIndex + 1)]
          : tasks[Math.max(0, currentIndex - 1)];

    if (!nextTask) {
      return;
    }

    onSelectSingleTask(nextTask.id);
    window.requestAnimationFrame(() => focusTaskRow(nextTask.id));
  }

  function beginColumnResize(event: ReactPointerEvent<HTMLSpanElement>, columnId: ResizableColumnId) {
    event.preventDefault();
    event.stopPropagation();
    resizeStateRef.current = {
      columnId,
      startWidth: columnWidths[columnId],
      startX: event.clientX,
    };
  }

  function getMeasurementDisplay(display: string) {
    if (display.includes("grid")) {
      return "inline-grid";
    }
    if (display.includes("flex")) {
      return "inline-flex";
    }
    return "inline-block";
  }

  function measureColumnContentWidth(cell: HTMLElement, measurementLayer: HTMLDivElement) {
    const measurementTarget = cell.querySelector<HTMLElement>("[data-column-measure]") ?? cell;
    const probe = measurementTarget === cell
      ? document.createElement("div")
      : measurementTarget.cloneNode(true) as HTMLElement;
    const computedStyle = window.getComputedStyle(measurementTarget);

    if (measurementTarget === cell) {
      probe.className = cell.className;
      probe.textContent = cell.textContent?.trim() ?? "";
    }

    probe.style.position = "absolute";
    probe.style.left = "-99999px";
    probe.style.top = "0";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    probe.style.width = "max-content";
    probe.style.maxWidth = "none";
    probe.style.minWidth = "0";
    probe.style.whiteSpace = "nowrap";
    probe.style.display = getMeasurementDisplay(computedStyle.display);
    measurementLayer.appendChild(probe);

    const measuredWidth = Math.ceil(probe.getBoundingClientRect().width);
    measurementLayer.removeChild(probe);
    return measuredWidth;
  }

  function autoFitAllColumns() {
    const table = taskTableRef.current;
    if (!table) {
      return;
    }

    const measurementLayer = document.createElement("div");
    measurementLayer.style.position = "absolute";
    measurementLayer.style.left = "-99999px";
    measurementLayer.style.top = "0";
    measurementLayer.style.width = "0";
    measurementLayer.style.height = "0";
    measurementLayer.style.overflow = "hidden";
    measurementLayer.style.pointerEvents = "none";
    document.body.appendChild(measurementLayer);

    try {
      const columnIds: ResizableColumnId[] = ["status", "task", ...orderedOptionalColumns];
      const nextWidths = { ...columnWidths };

      columnIds.forEach((columnId, columnIndex) => {
        let maxWidth = MIN_COLUMN_WIDTHS[columnId];

        if (columnId !== "status") {
          const headerProbe = document.createElement("span");
          headerProbe.textContent = COLUMN_HEADER_LABELS[columnId];
          headerProbe.style.position = "absolute";
          headerProbe.style.left = "-99999px";
          headerProbe.style.top = "0";
          headerProbe.style.visibility = "hidden";
          headerProbe.style.pointerEvents = "none";
          headerProbe.style.whiteSpace = "nowrap";
          headerProbe.style.fontSize = "11px";
          headerProbe.style.fontWeight = "600";
          headerProbe.style.letterSpacing = "0.18em";
          headerProbe.style.textTransform = "uppercase";
          measurementLayer.appendChild(headerProbe);
          const headerLabelWidth = Math.ceil(headerProbe.getBoundingClientRect().width);
          measurementLayer.removeChild(headerProbe);
          const headerRailWidth = columnId === "task" ? 72 : 40;
          maxWidth = Math.max(maxWidth, headerLabelWidth + headerRailWidth + 11);
        }

        Array.from(table.rows).forEach((row) => {
          if (row.cells.length !== columnIds.length) {
            return;
          }

          const cell = row.cells.item(columnIndex);
          if (!(cell instanceof HTMLElement)) {
            return;
          }

          maxWidth = Math.max(maxWidth, measureColumnContentWidth(cell, measurementLayer) + 3);
        });

        nextWidths[columnId] = maxWidth;
      });

      setColumnWidths(nextWidths);
    } finally {
      document.body.removeChild(measurementLayer);
    }
  }

  function beginColumnHeaderDrag(event: ReactPointerEvent<HTMLTableCellElement>, columnId: ResizableColumnId) {
    if (columnId === "status" || columnId === "task" || (event.target as HTMLElement).closest("[data-resize-handle]")) {
      return;
    }

    const reorderableColumnId = columnId as AgentPlanColumnId;
    event.preventDefault();
    headerDragStateRef.current = {
      columnId: reorderableColumnId,
      lastTargetId: null,
    };
    setDraggedHeaderColumnId(reorderableColumnId);
  }

  function renderColumnHeader(label: string, columnId: ResizableColumnId, extraClassName = "") {
    const canDrag = columnId !== "status" && columnId !== "task";
    const isStatusColumn = columnId === "status";
    const connectorMinWidth = columnId === "task" ? "4rem" : "1.75rem";
    return (
      <th
        key={columnId}
        className={`relative overflow-hidden border-b border-[#f0ebfb] px-[3px] pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9aa3bb] align-middle dark:border-white/10 dark:text-white/30 ${canDrag ? "cursor-grab select-none active:cursor-grabbing" : ""} ${draggedHeaderColumnId === columnId ? "bg-[#f7f3ff] text-[#6f57f6] dark:bg-white/[0.04] dark:text-[#cabfff]" : ""} ${extraClassName}`}
        data-agent-column-id={canDrag ? columnId : undefined}
        onPointerDown={canDrag ? (event) => beginColumnHeaderDrag(event, columnId) : undefined}
      >
        <span
          className={`flex w-full min-w-0 items-center ${isStatusColumn ? "justify-center" : "gap-1.5"}`}
        >
          {isStatusColumn ? <span className="sr-only">Status</span> : <span className="min-w-0 truncate" data-column-measure>{label}</span>}
          <span
            aria-hidden="true"
            className="group/resize cursor-col-resize rounded-full"
            data-resize-handle
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              autoFitAllColumns();
            }}
            onPointerDown={(event) => beginColumnResize(event, columnId)}
            style={{ alignItems: "center", display: "flex", flex: "1 1 auto", height: "1.25rem", minWidth: connectorMinWidth }}
          >
            <span
              className="block rounded-full transition group-hover/resize:h-1.5"
              style={{
                backgroundImage: "repeating-linear-gradient(90deg, #d8ccff 0 8px, transparent 8px 16px)",
                backgroundRepeat: "repeat-x",
                backgroundSize: "16px 4px",
                backgroundPosition: "left center",
                boxShadow: "0 0 0 1px rgba(216, 204, 255, 0.18)",
                height: "0.25rem",
                minWidth: connectorMinWidth,
                width: "100%",
              }}
            />
          </span>
        </span>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      <div className="pb-3">
        <div className="adhdice-scrollbar overflow-x-auto px-1 pt-1">
          <div className="flex min-w-max gap-2">
            {listOptions.map((bucket) => {
              const active = bucket.value === selectedBucket;
              return (
                <button
                  aria-pressed={active}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${FOCUS_RING_CLASS} ${
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
            {selectedBucket === "missed"
              ? "Nothing is missed right now. Keep this list empty on purpose."
              : selectedBucket === "inbox"
                ? "Inbox is clear. New untriaged tasks will land here until something else qualifies them."
                : "No tasks match this list right now."}
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
                    className={`ui-pill-button-light transition ${FOCUS_RING_CLASS}`}
                    onClick={onSelectAllVisible}
                    type="button"
                  >
                    Select all visible
                  </button>
                  <button
                    className={`ui-pill-button-light transition ${FOCUS_RING_CLASS}`}
                    onClick={onClearTaskSelection}
                    type="button"
                  >
                    Clear selection
                  </button>
                  <button
                    className={`ui-pill-button-strong-light transition ${FOCUS_RING_CLASS}`}
                    onClick={onOpenBatchEdit}
                    type="button"
                  >
                    Edit selected
                  </button>
                  <button
                    className={`ui-pill-button-danger-light transition ${FOCUS_RING_CLASS}`}
                    onClick={onDeleteSelectedTasks}
                    type="button"
                  >
                    Delete selected
                  </button>
                </div>
              </div>
            ) : null}
            <div className="relative pb-3">
            <div
              className="adhdice-scrollbar adhdice-scrollbar-overlay overflow-x-auto pb-2"
              onScroll={handleTaskRailScroll}
              ref={taskScrollRef}
            >
              <div className="relative min-w-max" ref={taskRailRef}>
                {!isLargeTaskList ? (
                  <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-0 overflow-visible transition-opacity duration-100"
                    height="100%"
                    preserveAspectRatio="none"
                    width="100%"
                  >
                    {taskConnectors.map((connector) => (
                      <line
                        key={`${connector.x}-${connector.y1}-${connector.y2}`}
                        stroke={TASK_CONNECTOR_STROKE}
                        strokeDasharray="8 8"
                        strokeWidth="2"
                        x1={connector.x}
                        x2={connector.x}
                        y1={connector.y1}
                        y2={connector.y2}
                      />
                    ))}
                  </svg>
                ) : null}
              <table className="relative z-10 border-separate border-spacing-y-1 text-left table-fixed" ref={taskTableRef} style={{ width: `${totalTableWidth}px` }}>
                <colgroup>
                  <col style={{ width: `${columnWidths.status}px` }} />
                  <col style={{ width: `${columnWidths.task}px` }} />
                  {orderedOptionalColumns.map((columnId) => (
                    <col key={columnId} style={{ width: `${columnWidths[columnId]}px` }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="border-b border-[#f0ebfb] dark:border-white/10">
                    {renderColumnHeader("Status", "status")}
                    {renderColumnHeader("Task", "task")}
                    {orderedOptionalColumns.map((columnId) => renderColumnHeader(COLUMN_HEADER_LABELS[columnId], columnId))}
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const expanded = expandedTaskIds.includes(task.id);
                    const isEditingTaskTitle = editingTaskId === task.id;
                    const isDone = isClosedStatus(task.status);
                    const dueValue = getMetadataValue(task, "Due");
                    const estimatedTimeValue = getMetadataValue(task, "Estimated Time");
                    const actualTimeValue = getMetadataValue(task, "Actual Time");
                    const priorityValue = getMetadataValue(task, "Priority");
                    const energyValue = getMetadataValue(task, "Energy");
                    const repeatValue = getMetadataValue(task, "Repeat");
                    const metadataValueByColumn: Partial<Record<AgentPlanColumnId, string>> = {
                      bucket: getMetadataValue(task, "Lists"),
                      date_added: formatDateAddedLabel(task.createdAt),
                      date_completed: task.completedAt ? formatDateAddedLabel(task.completedAt) : "Not completed",
                      last_done: getMetadataValue(task, "Last Done") || "No done yet",
                      due: dueValue,
                      energy: energyValue,
                      estimated_time: estimatedTimeValue,
                      actual_time: actualTimeValue,
                      streak: task.currentStreak > 0 ? String(task.currentStreak) : "",
                      priority: priorityValue,
                      repeat: repeatValue,
                    };

                    return (
                      <Fragment key={task.id}>
                        <motion.tr
                          animate={{ opacity: 1, y: 0 }}
                          className={`group cursor-pointer rounded-[1rem] transition focus-visible:outline-none ${FOCUS_RING_CLASS} ${
                            selectedTaskIdSet.has(task.id)
                              ? "bg-[#f6f2ff] dark:bg-[#261f43]"
                              : ""
                          }`}
                          initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }}
                          ref={(element) => {
                            taskRowRefs.current[task.id] = element;
                          }}
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
                            if (event.key === "ArrowDown") {
                              event.preventDefault();
                              moveTaskFocus(task.id, "next");
                              return;
                            }
                            if (event.key === "ArrowUp") {
                              event.preventDefault();
                              moveTaskFocus(task.id, "previous");
                              return;
                            }
                            if (event.key === "Home") {
                              event.preventDefault();
                              moveTaskFocus(task.id, "first");
                              return;
                            }
                            if (event.key === "End") {
                              event.preventDefault();
                              moveTaskFocus(task.id, "last");
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
                          <td className="relative px-[3px] py-3 align-top">
                            <div className="flex w-10 justify-center" data-column-measure ref={(element) => {
                              taskStatusAnchorRefs.current[task.id] = element;
                            }}>
                              <button
                                aria-label={`Change status for ${task.title}`}
                                className={`shrink-0 rounded-full ${FOCUS_RING_CLASS}`}
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

                          <td className="min-w-0 px-[3px] py-3 align-top">
                            <div className="min-w-0 rounded-[1rem] transition group-focus-within:bg-[#f8f6ff] dark:group-focus-within:bg-white/[0.03]" data-column-measure>
                              <div className="flex items-start gap-2">
                                <div className="relative inline-flex min-w-0 max-w-full items-center gap-2">
                                  {task.subtasks.length > 0 ? (
                                    <button
                                      aria-label={`${expanded ? "Collapse" : "Expand"} steps for ${task.title}`}
                                      className="absolute right-full top-1/2 mr-1 -translate-y-1/2 shrink-0 text-[#8d97b0] transition hover:text-[#6f57f6] dark:text-white/40 dark:hover:text-[#cabfff]"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleToggleTaskExpand(task.id);
                                      }}
                                      type="button"
                                    >
                                      {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                    </button>
                                  ) : null}
                                  {isEditingTaskTitle ? (
                                    <input
                                      autoFocus
                                      className={`min-w-0 w-[min(18rem,100%)] rounded-md border border-[#ddd6f9] bg-white px-2 py-1 text-[15px] font-semibold outline-none dark:border-white/10 dark:bg-white/[0.04] ${isDone ? "text-[#8d97b0] line-through dark:text-white/45" : "text-[#1f2642] dark:text-white"}`}
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
                                      className={`block min-w-0 max-w-full truncate text-left text-[15px] font-semibold transition hover:text-[#6f57f6] dark:hover:text-[#cabfff] ${FOCUS_RING_CLASS} ${isDone ? "text-[#8d97b0] line-through dark:text-white/45" : "text-[#1f2642] dark:text-white"}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        beginTaskRename(task.id, task.title);
                                      }}
                                      type="button"
                                    >
                                      {task.title}
                                    </button>
                                  )}
                                </div>
                                <button
                                  aria-label={`Edit ${task.title}`}
                                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f3efff] text-[#6f57f6] transition hover:bg-[#e8e0ff] hover:text-[#5a45d1] dark:bg-[#22193f] dark:text-[#cabfff] dark:hover:bg-[#2d2254] dark:hover:text-white ${FOCUS_RING_CLASS}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onEditTask(task.id);
                                  }}
                                  type="button"
                                >
                                  <PenLine className="h-4 w-4" />
                                </button>
                                <button
                                  aria-label={`Add step to ${task.title}`}
                                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f3efff] text-[#6f57f6] transition hover:bg-[#e8e0ff] hover:text-[#5a45d1] dark:bg-[#22193f] dark:text-[#cabfff] dark:hover:bg-[#2d2254] dark:hover:text-white ${FOCUS_RING_CLASS}`}
                                  onClick={async (event) => {
                                    event.stopPropagation();
                                    const nextSubtaskId = await onAddTaskSubtask(task.id);
                                    if (nextSubtaskId) {
                                      markConnectorsSettling();
                                      setExpandedTaskIds((current) => current.includes(task.id) ? current : [...current, task.id]);
                                      setAutofocusSubtaskId(nextSubtaskId);
                                    } else if (task.subtasks.length > 0) {
                                      handleToggleTaskExpand(task.id);
                                    }
                                  }}
                                  type="button"
                                >
                                  <Footprints className="h-4 w-4" />
                                </button>
                              </div>
                              {task.rowChips.length > 0 ? (
                                <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                                  {task.rowChips.map((pill, index) => (
                                    <span
                                      className={`${META_PILL_BASE_CLASS} ${META_PILL_STYLES[pill.tone ?? "neutral"]}`}
                                      key={`${task.id}-row-${index}-${pill.label}`}
                                    >
                                      {pill.label}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </td>

                          {orderedOptionalColumns.map((columnId) => {
                            if (columnId === "signal") {
                              return (
                                <td className="px-[3px] py-3 align-top" key={`${task.id}-${columnId}`}>
                                  <div className="flex min-h-[1.75rem] min-w-0 flex-wrap gap-2" data-column-measure>
                                    {task.metaPills.length > 0 ? (
                                      task.metaPills.map((pill) => (
                                        <span
                                          className={`${META_PILL_BASE_CLASS} ${META_PILL_STYLES[pill.tone ?? "neutral"]}`}
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
                              );
                            }

                            if (columnId === "bucket") {
                              const visibleLists = task.lists.slice(0, 2);
                              const hiddenListCount = Math.max(0, task.lists.length - visibleLists.length);
                              return (
                                <td className="relative px-[3px] py-3 align-top" key={`${task.id}-${columnId}`}>
                                  {task.lists.length > 0 ? (
                                    <div className="relative" data-task-field-menu>
                                      <button
                                        aria-expanded={isTaskFieldMenuOpen(task.id, "bucket")}
                                        aria-label={`Change lists for ${task.title}`}
                                        className={`appearance-none border-0 bg-transparent p-0 text-left ${FOCUS_RING_CLASS}`}
                                        data-column-measure
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          openTaskField(task.id, "bucket");
                                        }}
                                        type="button"
                                      >
                                        <span className="flex flex-wrap gap-2">
                                          {visibleLists.map((list) => (
                                            <span className={`${META_PILL_BASE_CLASS} ${META_PILL_STYLES[list.tone ?? "neutral"]}`} key={`${task.id}-list-${list.id}`}>
                                              {list.label}
                                            </span>
                                          ))}
                                          {hiddenListCount > 0 ? (
                                            <span className={`${META_PILL_BASE_CLASS} ${META_PILL_STYLES.neutral}`}>+{hiddenListCount}</span>
                                          ) : null}
                                        </span>
                                      </button>
                                      {isTaskFieldMenuOpen(task.id, "bucket") ? (
                                        <div className="absolute left-0 top-[calc(100%+0.45rem)] z-40 inline-block w-fit rounded-[1.5rem] bg-white/88 px-2 py-2 shadow-[0_24px_60px_rgba(115,88,255,0.14)] ring-1 ring-[#ede6ff] backdrop-blur-md dark:bg-[#1a1230]/92 dark:ring-white/10">
                                          <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(128,100,255,0.35),transparent)] dark:bg-[linear-gradient(90deg,transparent,rgba(202,191,255,0.35),transparent)]" />
                                          <div className="inline-flex flex-col items-start gap-2">
                                            {assignableBucketRows.map((row, rowIndex) => (
                                              <div className="flex items-center gap-2" key={`${task.id}-bucket-row-${rowIndex}`}>
                                                {row.map((bucketOption) => (
                                                  <button
                                                    aria-pressed={task.lists.some((list) => list.id === bucketOption.value && list.isManual)}
                                                    className={`appearance-none border-0 bg-transparent p-0 text-left ${FOCUS_RING_CLASS}`}
                                                    key={`${task.id}-bucket-${bucketOption.value}`}
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      onSetTaskBucket(task.id, bucketOption.value);
                                                      setOpenTaskFieldMenu(null);
                                                    }}
                                                    type="button"
                                                  >
                                                    <span className={`${META_PILL_BASE_CLASS} ${task.lists.some((list) => list.id === bucketOption.value && list.isManual) ? META_PILL_STYLES.accent : META_PILL_STYLES.neutral}`}>
                                                      {bucketOption.label}
                                                    </span>
                                                  </button>
                                                ))}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <span className="text-sm text-[#59627e] dark:text-white/65">—</span>
                                  )}
                                </td>
                              );
                            }

                            if (columnId === "date_added") {
                              return (
                                <td className="relative px-[3px] py-3 align-top" key={`${task.id}-${columnId}`}>
                                  <span className={`${META_PILL_BASE_CLASS} ${META_PILL_STYLES.neutral}`} data-column-measure>
                                    {formatDateAddedLabel(task.createdAt)}
                                  </span>
                                </td>
                              );
                            }

                            if (columnId === "date_completed") {
                              return (
                                <td className="relative px-[3px] py-3 align-top" key={`${task.id}-${columnId}`}>
                                  <span className={`${META_PILL_BASE_CLASS} ${META_PILL_STYLES.neutral}`} data-column-measure>
                                    {task.completedAt ? formatDateAddedLabel(task.completedAt) : "Not completed"}
                                  </span>
                                </td>
                              );
                            }

                            if (columnId === "last_done") {
                              return (
                                <td className="relative px-[3px] py-3 align-top" key={`${task.id}-${columnId}`}>
                                  <span className={`${META_PILL_BASE_CLASS} ${META_PILL_STYLES.neutral}`} data-column-measure>
                                    {getMetadataValue(task, "Last Done") || "No done yet"}
                                  </span>
                                </td>
                              );
                            }

                            if (columnId === "due") {
                              const dueLabel = experimentalMode ? formatDueDateChipLabel(task.dueOn) : (metadataValueByColumn.due ?? "No date");
                              const dueTimeLabel = experimentalMode ? formatDueTimeChipLabel(task.dueTime) : null;
                              const activeDuePreset = getDuePresetValueFromLabel(dueLabel);
                              const dueDraft = experimentalMode ? (dueDrafts[task.id] ?? {
                                dueOn: task.dueOn ?? "",
                                dueTime: task.dueTime ?? "",
                              }) : null;

                              return (
                                <td className="relative px-[3px] py-3 align-top" key={`${task.id}-${columnId}`}>
                                  <div className="relative" data-task-field-menu>
                                    <button
                                      aria-expanded={isTaskFieldMenuOpen(task.id, "due")}
                                      aria-label={`Change due date for ${task.title}`}
                                      className={`appearance-none border-0 bg-transparent p-0 text-left ${FOCUS_RING_CLASS}`}
                                      data-column-measure
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openTaskField(task.id, "due");
                                      }}
                                      type="button"
                                    >
                                      <span className="flex flex-wrap gap-2">
                                        <span className={`${META_PILL_BASE_CLASS} ${META_PILL_STYLES.neutral}`}>
                                          {dueLabel}
                                        </span>
                                        {dueTimeLabel ? (
                                          <span className={`${META_PILL_BASE_CLASS} ${META_PILL_STYLES.neutral}`}>
                                            {dueTimeLabel}
                                          </span>
                                        ) : null}
                                      </span>
                                    </button>
                                    {isTaskFieldMenuOpen(task.id, "due") ? (
                                      <div className="absolute left-0 top-[calc(100%+0.45rem)] z-40 inline-block w-fit rounded-[1.5rem] bg-white/88 px-2 py-2 shadow-[0_24px_60px_rgba(115,88,255,0.14)] ring-1 ring-[#ede6ff] backdrop-blur-md dark:bg-[#1a1230]/92 dark:ring-white/10">
                                        <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(128,100,255,0.35),transparent)] dark:bg-[linear-gradient(90deg,transparent,rgba(202,191,255,0.35),transparent)]" />
                                        <div className="inline-flex flex-col items-start gap-3">
                                          {duePresetRows.map((row, rowIndex) => (
                                            <div className="flex items-center gap-2" key={`${task.id}-due-row-${rowIndex}`}>
                                              {row.map((option) => (
                                                <button
                                                  aria-pressed={activeDuePreset === option.value}
                                                  className={`appearance-none border-0 bg-transparent p-0 text-left ${FOCUS_RING_CLASS}`}
                                                  key={`${task.id}-due-${option.value}`}
                                                  onClick={(event) => {
                                                    event.stopPropagation();
                                                    onSetTaskDuePreset(task.id, option.value);
                                                    setOpenTaskFieldMenu(null);
                                                  }}
                                                  type="button"
                                                >
                                                  <span className={`${META_PILL_BASE_CLASS} ${activeDuePreset === option.value ? META_PILL_STYLES.accent : META_PILL_STYLES.neutral}`}>
                                                    {option.label}
                                                  </span>
                                                </button>
                                              ))}
                                            </div>
                                          ))}
                                          {experimentalMode && onSetTaskDueSchedule && dueDraft ? (
                                            <>
                                              <div className="grid w-full gap-2">
                                                <input
                                                  className="rounded-[0.9rem] border border-[#e5e0f5] bg-[#fbfaff] px-3 py-2 text-sm outline-none placeholder:text-[#b0aac8] focus:border-[#9d8cff] dark:border-white/15 dark:bg-white/8 dark:text-white dark:placeholder:text-white/30"
                                                  onChange={(event) => setDueDrafts((current) => ({
                                                    ...current,
                                                    [task.id]: {
                                                      ...dueDraft,
                                                      dueOn: event.target.value,
                                                    },
                                                  }))}
                                                  onClick={(event) => event.stopPropagation()}
                                                  type="date"
                                                  value={dueDraft.dueOn}
                                                />
                                                <input
                                                  className="rounded-[0.9rem] border border-[#e5e0f5] bg-[#fbfaff] px-3 py-2 text-sm outline-none placeholder:text-[#b0aac8] focus:border-[#9d8cff] dark:border-white/15 dark:bg-white/8 dark:text-white dark:placeholder:text-white/30"
                                                  onChange={(event) => setDueDrafts((current) => ({
                                                    ...current,
                                                    [task.id]: {
                                                      ...dueDraft,
                                                      dueTime: event.target.value,
                                                    },
                                                  }))}
                                                  onClick={(event) => event.stopPropagation()}
                                                  type="time"
                                                  value={dueDraft.dueTime}
                                                />
                                              </div>
                                              <div className="flex w-full items-center justify-between gap-2">
                                                <button
                                                  className="ui-pill-button-light"
                                                  onClick={(event) => {
                                                    event.stopPropagation();
                                                    onSetTaskDueSchedule(task.id, { dueOn: null, dueTime: null });
                                                    setOpenTaskFieldMenu(null);
                                                  }}
                                                  type="button"
                                                >
                                                  Clear
                                                </button>
                                                <button
                                                  className="ui-pill-button-strong-light"
                                                  onClick={(event) => {
                                                    event.stopPropagation();
                                                    onSetTaskDueSchedule(task.id, {
                                                      dueOn: dueDraft.dueOn.trim() || null,
                                                      dueTime: dueDraft.dueTime.trim() || null,
                                                    });
                                                    setOpenTaskFieldMenu(null);
                                                  }}
                                                  type="button"
                                                >
                                                  Save
                                                </button>
                                              </div>
                                            </>
                                          ) : null}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                              );
                            }

                            if (columnId === "estimated_time") {
                              const estimatedLabel = formatDurationMinutes(task.estimatedMinutes) ?? "Add time";
                              const estimatedDraft = estimatedTimeDrafts[task.id] ?? { hours: "", minutes: "" };

                              return (
                                <td className="relative px-[3px] py-3 align-top" key={`${task.id}-${columnId}`}>
                                  <div className="relative" data-estimated-time-menu>
                                    <button
                                      aria-expanded={openEstimatedTimeMenuTaskId === task.id}
                                      aria-label={`Set estimated time for ${task.title}`}
                                      className={task.estimatedMinutes
                                        ? `inline-flex shrink-0 items-center rounded-full bg-[#6f57f6] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#5e49d6] dark:bg-[#cabfff] dark:text-[#1a1431] dark:hover:bg-[#bda9ff] ${FOCUS_RING_CLASS}`
                                        : `inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f3efff] text-[#6f57f6] transition hover:bg-[#e8e0ff] hover:text-[#5a45d1] dark:bg-[#22193f] dark:text-[#cabfff] dark:hover:bg-[#2d2254] dark:hover:text-white ${FOCUS_RING_CLASS}`}
                                      data-column-measure
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setOpenEstimatedTimeMenuTaskId((current) => current === task.id ? null : task.id);
                                      }}
                                      title={estimatedLabel}
                                      type="button"
                                    >
                                      {task.estimatedMinutes ? estimatedLabel : <Clock className="h-4 w-4" />}
                                    </button>
                                    {openEstimatedTimeMenuTaskId === task.id ? (
                                      <div className="absolute left-0 top-[calc(100%+0.45rem)] z-40 w-[min(21rem,calc(100vw-3rem))] rounded-[1.2rem] border border-[#ddd6fb] bg-white p-3 shadow-[0_22px_60px_rgba(56,42,116,0.18)] dark:border-white/10 dark:bg-[#241d3f]">
                                        <div className="flex flex-wrap gap-2">
                                          {estimatedTimePresets.map((preset) => (
                                            <button
                                              className={`rounded-full border px-3 py-2 text-sm font-semibold transition-colors ${task.estimatedMinutes === preset.minutes
                                                ? "border-transparent bg-[#6f57f6] text-white dark:border-transparent dark:bg-[#cabfff] dark:text-[#1a1431]"
                                                : "border-[#e5e0f5] bg-white text-[#5a607a] hover:border-[#c4b8ff] dark:border-white/15 dark:bg-white/8 dark:text-white/70 dark:hover:border-white/30"}`}
                                              key={`${task.id}-estimate-${preset.minutes}`}
                                              onClick={async (event) => {
                                                event.stopPropagation();
                                                await onSetTaskEstimatedMinutes(task.id, task.estimatedMinutes === preset.minutes ? null : preset.minutes);
                                                setOpenEstimatedTimeMenuTaskId(null);
                                              }}
                                              type="button"
                                            >
                                              {preset.label}
                                            </button>
                                          ))}
                                        </div>
                                        <div className="mt-3 flex gap-4">
                                          <label className="grid justify-items-center gap-2">
                                            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8d87a7] dark:text-white/40">Hours</span>
                                            <input
                                              className="h-14 w-14 rounded-full border border-[#e5e0f5] bg-[#fbfaff] px-0 text-center text-base outline-none placeholder:text-[#b0aac8] focus:border-[#9d8cff] dark:border-white/15 dark:bg-white/8 dark:text-white dark:placeholder:text-white/30"
                                              inputMode="numeric"
                                              value={estimatedDraft.hours}
                                              placeholder="0"
                                              type="text"
                                              onChange={(event) => {
                                                const hours = event.target.value.replace(/[^\d]/g, "");
                                                setEstimatedTimeDrafts((current) => ({
                                                  ...current,
                                                  [task.id]: {
                                                    ...estimatedDraft,
                                                    hours,
                                                  },
                                                }));
                                              }}
                                              onClick={(event) => event.stopPropagation()}
                                              onKeyDown={async (event) => {
                                                if (event.key !== "Enter") {
                                                  return;
                                                }
                                                event.preventDefault();
                                                const hours = Number.parseInt(estimatedDraft.hours || "0", 10);
                                                const minutes = Number.parseInt(estimatedDraft.minutes || "0", 10);
                                                const totalMinutes = (Number.isFinite(hours) ? Math.max(0, hours) : 0) * 60 + (Number.isFinite(minutes) ? Math.min(59, Math.max(0, minutes)) : 0);
                                                await onSetTaskEstimatedMinutes(task.id, totalMinutes > 0 ? totalMinutes : null);
                                                setOpenEstimatedTimeMenuTaskId(null);
                                              }}
                                            />
                                          </label>
                                          <label className="grid justify-items-center gap-2">
                                            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8d87a7] dark:text-white/40">Minutes</span>
                                            <input
                                              className="h-14 w-14 rounded-full border border-[#e5e0f5] bg-[#fbfaff] px-0 text-center text-base outline-none placeholder:text-[#b0aac8] focus:border-[#9d8cff] dark:border-white/15 dark:bg-white/8 dark:text-white dark:placeholder:text-white/30"
                                              inputMode="numeric"
                                              value={estimatedDraft.minutes}
                                              placeholder="0"
                                              type="text"
                                              onChange={(event) => {
                                                const minutes = event.target.value.replace(/[^\d]/g, "");
                                                setEstimatedTimeDrafts((current) => ({
                                                  ...current,
                                                  [task.id]: {
                                                    ...estimatedDraft,
                                                    minutes,
                                                  },
                                                }));
                                              }}
                                              onClick={(event) => event.stopPropagation()}
                                              onKeyDown={async (event) => {
                                                if (event.key !== "Enter") {
                                                  return;
                                                }
                                                event.preventDefault();
                                                const minutes = Number.parseInt(estimatedDraft.minutes || "0", 10);
                                                const hours = Number.parseInt(estimatedDraft.hours || "0", 10);
                                                const totalMinutes = (Number.isFinite(hours) ? Math.max(0, hours) : 0) * 60 + (Number.isFinite(minutes) ? Math.min(59, Math.max(0, minutes)) : 0);
                                                await onSetTaskEstimatedMinutes(task.id, totalMinutes > 0 ? totalMinutes : null);
                                                setOpenEstimatedTimeMenuTaskId(null);
                                              }}
                                            />
                                          </label>
                                        </div>
                                        <div className="mt-3 flex items-center justify-end gap-2">
                                          <button
                                            className="ui-pill-button-light"
                                            onClick={async (event) => {
                                              event.stopPropagation();
                                              await onSetTaskEstimatedMinutes(task.id, null);
                                              setOpenEstimatedTimeMenuTaskId(null);
                                            }}
                                            type="button"
                                          >
                                            Clear
                                          </button>
                                          <button
                                            className="ui-pill-button-strong-light"
                                            onClick={async (event) => {
                                              event.stopPropagation();
                                              const hours = Number.parseInt(estimatedDraft.hours || "0", 10);
                                              const minutes = Number.parseInt(estimatedDraft.minutes || "0", 10);
                                              const totalMinutes = (Number.isFinite(hours) ? Math.max(0, hours) : 0) * 60 + (Number.isFinite(minutes) ? Math.min(59, Math.max(0, minutes)) : 0);
                                              await onSetTaskEstimatedMinutes(task.id, totalMinutes > 0 ? totalMinutes : null);
                                              setOpenEstimatedTimeMenuTaskId(null);
                                            }}
                                            type="button"
                                          >
                                            Apply
                                          </button>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                              );
                            }

                            if (columnId === "actual_time") {
                              const actualLabel = formatDurationSeconds(task.actualSeconds) ?? "Log time";
                              return (
                                <td className="relative px-[3px] py-3 align-top" key={`${task.id}-${columnId}`}>
                                  <button
                                    aria-label={`Log actual time for ${task.title}`}
                                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${FOCUS_RING_CLASS} ${task.actualSeconds > 0
                                      ? "bg-[#6f57f6] text-white hover:bg-[#5e49d6] dark:bg-[#cabfff] dark:text-[#1a1431] dark:hover:bg-[#bda9ff]"
                                      : "bg-[#f3efff] text-[#6f57f6] hover:bg-[#e8e0ff] hover:text-[#5a45d1] dark:bg-[#22193f] dark:text-[#cabfff] dark:hover:bg-[#2d2254] dark:hover:text-white"}`}
                                    data-column-measure
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      onOpenTaskActualTime(task.id);
                                    }}
                                    title={actualLabel}
                                    type="button"
                                  >
                                    <Clock className="h-4 w-4" />
                                  </button>
                                </td>
                              );
                            }

                            if (columnId === "tags") {
                              const tagsMenuOpen = isTaskFieldMenuOpen(task.id, "tags");
                              const tagInput = tagInputDrafts[task.id] ?? "";
                              const normalizedTagInput = tagInput.trim().toLowerCase();
                              const availableTagOptions = tagsMenuOpen && normalizedTagInput
                                ? allTags.filter((tag) => tag.includes(normalizedTagInput) && !task.tags.includes(tag))
                                : [];
                              return (
                                <td className="relative px-[3px] py-3 align-top" key={`${task.id}-${columnId}`}>
                                  <div className="relative" data-task-field-menu>
                                    <button
                                      aria-expanded={tagsMenuOpen}
                                      aria-label={`Edit tags for ${task.title}`}
                                      className={`appearance-none border-0 bg-transparent p-0 text-left ${FOCUS_RING_CLASS}`}
                                      data-column-measure
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openTaskField(task.id, "tags");
                                      }}
                                      type="button"
                                    >
                                      <span className={`${META_PILL_BASE_CLASS} ${task.tags.length > 0 ? META_PILL_STYLES.accent : META_PILL_STYLES.neutral}`}>
                                        {summarizeTags(task.tags)}
                                      </span>
                                    </button>
                                    {tagsMenuOpen ? (
                                      <div className="absolute left-0 top-[calc(100%+0.45rem)] z-40 w-[min(20rem,calc(100vw-3rem))] rounded-[1.2rem] border border-[#ddd6fb] bg-white p-3 shadow-[0_22px_60px_rgba(56,42,116,0.18)] dark:border-white/10 dark:bg-[#241d3f]">
                                        <div className="flex flex-wrap gap-2">
                                          {task.tags.map((tag) => (
                                            <button
                                              className={`${META_PILL_BASE_CLASS} ${META_PILL_STYLES.accent}`}
                                              key={`${task.id}-tag-${tag}`}
                                              onClick={async (event) => {
                                                event.stopPropagation();
                                                await toggleTaskTag(task, tag);
                                              }}
                                              type="button"
                                            >
                                              #{tag} ✕
                                            </button>
                                          ))}
                                        </div>
                                        <div className="mt-3 flex gap-2">
                                          <input
                                            className="min-w-0 flex-1 rounded-[0.9rem] border border-[#e5e0f5] bg-[#fbfaff] px-3 py-2 text-sm outline-none placeholder:text-[#b0aac8] focus:border-[#9d8cff] dark:border-white/15 dark:bg-white/8 dark:text-white dark:placeholder:text-white/30"
                                            onChange={(event) => setTagInputDrafts((current) => ({ ...current, [task.id]: event.target.value }))}
                                            onClick={(event) => event.stopPropagation()}
                                            onKeyDown={async (event) => {
                                              if (event.key !== "Enter") {
                                                return;
                                              }
                                              event.preventDefault();
                                              await addTaskTag(task, tagInput);
                                              setTagInputDrafts((current) => ({ ...current, [task.id]: "" }));
                                            }}
                                            placeholder="Add tag…"
                                            value={tagInput}
                                          />
                                          <button
                                            className="ui-pill-button-strong-light"
                                            onClick={async (event) => {
                                              event.stopPropagation();
                                              await addTaskTag(task, tagInput);
                                              setTagInputDrafts((current) => ({ ...current, [task.id]: "" }));
                                            }}
                                            type="button"
                                          >
                                            Add
                                          </button>
                                        </div>
                                        <div className="mt-3 flex max-h-40 flex-wrap gap-2 overflow-y-auto pr-1">
                                          {allTags.length === 0 ? (
                                            <span className="text-sm text-[#8d97b0] dark:text-white/45">No saved tags yet.</span>
                                          ) : (
                                            allTags.map((tag) => {
                                              const selected = task.tags.includes(tag);
                                              return (
                                                <button
                                                  className={`${META_PILL_BASE_CLASS} ${selected ? META_PILL_STYLES.accent : META_PILL_STYLES.neutral}`}
                                                  key={`${task.id}-tag-option-${tag}`}
                                                  onClick={async (event) => {
                                                    event.stopPropagation();
                                                    await toggleTaskTag(task, tag);
                                                  }}
                                                  type="button"
                                                >
                                                  #{tag}
                                                </button>
                                              );
                                            })
                                          )}
                                        </div>
                                        {availableTagOptions.length > 0 ? (
                                          <div className="mt-3 border-t border-[#efe9ff] pt-3 dark:border-white/10">
                                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8d87a7] dark:text-white/40">Matches</p>
                                            <div className="flex flex-wrap gap-2">
                                              {availableTagOptions.slice(0, 8).map((tag) => (
                                                <button
                                                  className={`${META_PILL_BASE_CLASS} ${META_PILL_STYLES.neutral}`}
                                                  key={`${task.id}-tag-match-${tag}`}
                                                  onClick={async (event) => {
                                                    event.stopPropagation();
                                                    await addTaskTag(task, tag);
                                                    setTagInputDrafts((current) => ({ ...current, [task.id]: "" }));
                                                  }}
                                                  type="button"
                                                >
                                                  #{tag}
                                                </button>
                                              ))}
                                            </div>
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                              );
                            }

                            if (columnId === "link") {
                              const linkMenuOpen = isTaskFieldMenuOpen(task.id, "link");
                              const linkDraft = linkDrafts[task.id] ?? {
                                label: task.externalLinkLabel ?? "",
                                url: task.externalLinkUrl ?? "",
                              };
                              const normalizedUrl = linkDraft.url.trim();
                              const hasUrlError = normalizedUrl.length > 0 && !isProbablyValidUrl(normalizedUrl);
                              const linkLabel = task.externalLinkLabel?.trim() || (task.externalLinkUrl ? "Open link" : "Link");
                              return (
                                <td className="relative px-[3px] py-3 align-top" key={`${task.id}-${columnId}`}>
                                  <div className="relative" data-task-field-menu>
                                    <button
                                      aria-expanded={linkMenuOpen}
                                      aria-label={`Edit link for ${task.title}`}
                                      className={`appearance-none border-0 bg-transparent p-0 text-left ${FOCUS_RING_CLASS}`}
                                      data-column-measure
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openTaskField(task.id, "link");
                                      }}
                                      type="button"
                                    >
                                      <span className={`${META_PILL_BASE_CLASS} ${task.externalLinkUrl ? META_PILL_STYLES.accent : META_PILL_STYLES.neutral}`}>
                                        {linkLabel}
                                      </span>
                                    </button>
                                    {linkMenuOpen ? (
                                      <div className="absolute left-0 top-[calc(100%+0.45rem)] z-40 w-[min(22rem,calc(100vw-3rem))] rounded-[1.2rem] border border-[#ddd6fb] bg-white p-3 shadow-[0_22px_60px_rgba(56,42,116,0.18)] dark:border-white/10 dark:bg-[#241d3f]">
                                        {task.externalLinkUrl ? (
                                          <button
                                            className="ui-pill-button-strong-light mb-3 transition"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              window.open(task.externalLinkUrl ?? "", "_blank", "noopener,noreferrer");
                                            }}
                                            type="button"
                                          >
                                            Open link
                                          </button>
                                        ) : null}
                                        <div className="grid gap-2">
                                          <input
                                            className="rounded-[0.9rem] border border-[#e5e0f5] bg-[#fbfaff] px-3 py-2 text-sm outline-none placeholder:text-[#b0aac8] focus:border-[#9d8cff] dark:border-white/15 dark:bg-white/8 dark:text-white dark:placeholder:text-white/30"
                                            onChange={(event) => setLinkDrafts((current) => ({
                                              ...current,
                                              [task.id]: {
                                                ...linkDraft,
                                                label: event.target.value,
                                              },
                                            }))}
                                            onClick={(event) => event.stopPropagation()}
                                            placeholder="Link label"
                                            value={linkDraft.label}
                                          />
                                          <input
                                            className={`rounded-[0.9rem] border bg-[#fbfaff] px-3 py-2 text-sm outline-none placeholder:text-[#b0aac8] focus:border-[#9d8cff] dark:border-white/15 dark:bg-white/8 dark:text-white dark:placeholder:text-white/30 ${hasUrlError ? "border-[#f4afbc] text-[#d94e67] dark:border-[#ff9eaf] dark:text-[#ffb3c0]" : "border-[#e5e0f5]"}`}
                                            onChange={(event) => setLinkDrafts((current) => ({
                                              ...current,
                                              [task.id]: {
                                                ...linkDraft,
                                                url: event.target.value,
                                              },
                                            }))}
                                            onClick={(event) => event.stopPropagation()}
                                            placeholder="https://example.com"
                                            value={linkDraft.url}
                                          />
                                          {hasUrlError ? (
                                            <p className="text-xs font-medium text-[#d94e67] dark:text-[#ff9eaf]">Use a full `http://` or `https://` URL.</p>
                                          ) : null}
                                        </div>
                                        <div className="mt-3 flex items-center justify-end gap-2">
                                          <button
                                            className="ui-pill-button-light"
                                            onClick={async (event) => {
                                              event.stopPropagation();
                                              await onSetTaskLink(task.id, { label: "", url: "" });
                                              setOpenTaskFieldMenu(null);
                                            }}
                                            type="button"
                                          >
                                            Clear
                                          </button>
                                          <button
                                            className="ui-pill-button-strong-light disabled:cursor-not-allowed disabled:opacity-50"
                                            disabled={hasUrlError}
                                            onClick={async (event) => {
                                              event.stopPropagation();
                                              if (hasUrlError) {
                                                return;
                                              }
                                              await onSetTaskLink(task.id, { label: linkDraft.label, url: linkDraft.url });
                                              setOpenTaskFieldMenu(null);
                                            }}
                                            type="button"
                                          >
                                            Save
                                          </button>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                              );
                            }

                            if (columnId === "notes") {
                              const notesMenuOpen = isTaskFieldMenuOpen(task.id, "notes");
                              const noteDraft = noteDrafts[task.id] ?? {
                                linkedNoteIds: task.linkedNotes.map((note) => note.id),
                                notes: task.notes,
                              };
                              const selectedNotes = notesMenuOpen
                                ? noteDraft.linkedNoteIds.map((noteId) => allNotesById.get(noteId)).filter((note): note is NonNullable<typeof note> => Boolean(note))
                                : [];
                              return (
                                <td className="relative px-[3px] py-3 align-top" key={`${task.id}-${columnId}`}>
                                  <div className="relative" data-task-field-menu>
                                    <button
                                      aria-expanded={notesMenuOpen}
                                      aria-label={`Edit notes for ${task.title}`}
                                      className={`appearance-none border-0 bg-transparent p-0 text-left ${FOCUS_RING_CLASS}`}
                                      data-column-measure
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openTaskField(task.id, "notes");
                                      }}
                                      type="button"
                                    >
                                      <span className={`${META_PILL_BASE_CLASS} ${task.notes.trim().length > 0 || task.linkedNotes.length > 0 ? META_PILL_STYLES.accent : META_PILL_STYLES.neutral}`}>
                                        {summarizeNotes(task)}
                                      </span>
                                    </button>
                                    {notesMenuOpen ? (
                                      <div className="absolute left-0 top-[calc(100%+0.45rem)] z-40 w-[min(24rem,calc(100vw-3rem))] rounded-[1.2rem] border border-[#ddd6fb] bg-white p-3 shadow-[0_22px_60px_rgba(56,42,116,0.18)] dark:border-white/10 dark:bg-[#241d3f]">
                                        <label className="block">
                                          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8d87a7] dark:text-white/40">Task note</span>
                                          <textarea
                                            className="min-h-[7rem] w-full rounded-[1rem] border border-[#e5e0f5] bg-[#fbfaff] px-3 py-3 text-sm outline-none placeholder:text-[#b0aac8] focus:border-[#9d8cff] dark:border-white/15 dark:bg-white/8 dark:text-white dark:placeholder:text-white/30"
                                            onChange={(event) => setNoteDrafts((current) => ({
                                              ...current,
                                              [task.id]: {
                                                ...noteDraft,
                                                notes: event.target.value,
                                              },
                                            }))}
                                            onClick={(event) => event.stopPropagation()}
                                            placeholder="Add a quick task note…"
                                            value={noteDraft.notes}
                                          />
                                        </label>
                                        <div className="mt-3">
                                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8d87a7] dark:text-white/40">Linked notes</p>
                                          <div className="mb-2 flex flex-wrap gap-2">
                                            {selectedNotes.map((note) => (
                                              <button
                                                className={`${META_PILL_BASE_CLASS} ${META_PILL_STYLES.accent}`}
                                                key={`${task.id}-linked-note-${note.id}`}
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  toggleDraftLinkedNote(task.id, note.id);
                                                }}
                                                type="button"
                                              >
                                                {note.title.trim() || "Untitled note"} ✕
                                              </button>
                                            ))}
                                          </div>
                                          <div className="adhdice-scrollbar max-h-44 space-y-2 overflow-y-auto pr-1">
                                            {allNotes.length === 0 ? (
                                              <span className="text-sm text-[#8d97b0] dark:text-white/45">No saved notes yet.</span>
                                            ) : (
                                              allNotes.map((note) => {
                                                const selected = noteDraft.linkedNoteIds.includes(note.id);
                                                const preview = note.body.trim().slice(0, 72);
                                                return (
                                                  <button
                                                    className={`flex w-full items-start justify-between gap-3 rounded-[0.95rem] px-3 py-3 text-left transition ${selected
                                                      ? "bg-[#ede8ff] text-[#1f2642] dark:bg-[#22193f] dark:text-white"
                                                      : "bg-[#fbfaff] text-[#1f2642] hover:bg-[#f6f1ff] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/8"}`}
                                                    key={`${task.id}-note-option-${note.id}`}
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      toggleDraftLinkedNote(task.id, note.id);
                                                    }}
                                                    type="button"
                                                  >
                                                    <div className="min-w-0">
                                                      <p className="truncate text-sm font-semibold">{note.title.trim() || "Untitled note"}</p>
                                                      {preview ? <p className="mt-1 text-xs text-[#7d88a1] dark:text-white/50">{preview}</p> : null}
                                                    </div>
                                                    <span className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ${selected ? "bg-[#6f57f6] dark:bg-[#cabfff]" : "bg-[#d8d0ee] dark:bg-white/20"}`} />
                                                  </button>
                                                );
                                              })
                                            )}
                                          </div>
                                        </div>
                                        <div className="mt-3 flex items-center justify-end gap-2">
                                          <button
                                            className="ui-pill-button-light"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setNoteDrafts((current) => ({
                                                ...current,
                                                [task.id]: {
                                                  linkedNoteIds: [],
                                                  notes: "",
                                                },
                                              }));
                                            }}
                                            type="button"
                                          >
                                            Clear draft
                                          </button>
                                          <button
                                            className="ui-pill-button-strong-light"
                                            onClick={async (event) => {
                                              event.stopPropagation();
                                              await onSetTaskNotes(task.id, noteDraft.notes);
                                              await onSetTaskLinkedNoteIds(task.id, noteDraft.linkedNoteIds);
                                              setOpenTaskFieldMenu(null);
                                            }}
                                            type="button"
                                          >
                                            Save
                                          </button>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                              );
                            }

                            if (columnId === "repeat" && experimentalMode && onSetTaskRecurringPreset) {
                              const repeatLabel = metadataValueByColumn.repeat ?? "No Repeat";
                              const activeRepeat = task.repeatFrequency;

                              return (
                                <td className="relative px-[3px] py-3 align-top" key={`${task.id}-${columnId}`}>
                                  <div className="relative" data-task-field-menu>
                                    <button
                                      aria-expanded={isTaskFieldMenuOpen(task.id, "repeat")}
                                      aria-label={`Change repeat for ${task.title}`}
                                      className={`appearance-none border-0 bg-transparent p-0 text-left ${FOCUS_RING_CLASS}`}
                                      data-column-measure
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openTaskField(task.id, "repeat");
                                      }}
                                      type="button"
                                    >
                                      <span className={`${META_PILL_BASE_CLASS} ${activeRepeat === "none" ? META_PILL_STYLES.neutral : META_PILL_STYLES.warning}`}>
                                        {repeatLabel}
                                      </span>
                                    </button>
                                    {isTaskFieldMenuOpen(task.id, "repeat") ? (
                                      <div className="absolute left-0 top-[calc(100%+0.45rem)] z-40 inline-block w-fit rounded-[1.5rem] bg-white/88 px-2 py-2 shadow-[0_24px_60px_rgba(115,88,255,0.14)] ring-1 ring-[#ede6ff] backdrop-blur-md dark:bg-[#1a1230]/92 dark:ring-white/10">
                                        <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(128,100,255,0.35),transparent)] dark:bg-[linear-gradient(90deg,transparent,rgba(202,191,255,0.35),transparent)]" />
                                        <div className="inline-flex flex-col items-start gap-2">
                                          {repeatRows.map((row, rowIndex) => (
                                            <div className="flex items-center gap-2" key={`${task.id}-repeat-row-${rowIndex}`}>
                                              {row.map((option) => (
                                                <button
                                                  aria-pressed={activeRepeat === option.value}
                                                  className={`appearance-none border-0 bg-transparent p-0 text-left ${FOCUS_RING_CLASS}`}
                                                  key={`${task.id}-repeat-${option.value}`}
                                                  onClick={(event) => {
                                                    event.stopPropagation();
                                                    if (option.value === "custom") {
                                                      onEditTask(task.id);
                                                    } else {
                                                      onSetTaskRecurringPreset(task.id, option.value);
                                                    }
                                                    setOpenTaskFieldMenu(null);
                                                  }}
                                                  type="button"
                                                >
                                                  <span className={`${META_PILL_BASE_CLASS} ${activeRepeat === option.value ? META_PILL_STYLES.warning : META_PILL_STYLES.neutral}`}>
                                                    {option.label}
                                                  </span>
                                                </button>
                                              ))}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                              );
                            }

                            if (columnId === "priority") {
                              if (!experimentalMode) {
                                const priorityLabel = metadataValueByColumn.priority ?? "None";
                                const activePriority = priorityLabel.toLowerCase() as AgentPlanPriorityValue;

                                return (
                                  <td className="relative px-[3px] py-3 align-top" key={`${task.id}-${columnId}`}>
                                    <div className="relative" data-task-field-menu>
                                      <button
                                        aria-expanded={isTaskFieldMenuOpen(task.id, "priority")}
                                        aria-label={`Change priority for ${task.title}`}
                                        className={`appearance-none border-0 bg-transparent p-0 text-left ${FOCUS_RING_CLASS}`}
                                        data-column-measure
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          openTaskField(task.id, "priority");
                                        }}
                                        type="button"
                                      >
                                        <span className={`${META_PILL_BASE_CLASS} ${META_PILL_STYLES[getPriorityTone(activePriority)]}`}>
                                          {priorityLabel}
                                        </span>
                                      </button>
                                      {isTaskFieldMenuOpen(task.id, "priority") ? (
                                        <div className="absolute left-0 top-[calc(100%+0.45rem)] z-40 inline-block w-fit rounded-[1.5rem] bg-white/88 px-2 py-2 shadow-[0_24px_60px_rgba(115,88,255,0.14)] ring-1 ring-[#ede6ff] backdrop-blur-md dark:bg-[#1a1230]/92 dark:ring-white/10">
                                          <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(128,100,255,0.35),transparent)] dark:bg-[linear-gradient(90deg,transparent,rgba(202,191,255,0.35),transparent)]" />
                                          <div className="inline-flex flex-col items-start gap-2">
                                            {priorityRows.map((row, rowIndex) => (
                                              <div className="flex items-center gap-2" key={`${task.id}-priority-row-${rowIndex}`}>
                                                {row.map((option) => (
                                                  <button
                                                    aria-pressed={activePriority === option.value}
                                                    className={`appearance-none border-0 bg-transparent p-0 text-left ${FOCUS_RING_CLASS}`}
                                                    key={`${task.id}-priority-${option.value}`}
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      onSetTaskPriority(task.id, option.value);
                                                      setOpenTaskFieldMenu(null);
                                                    }}
                                                    type="button"
                                                  >
                                                    <span className={`${META_PILL_BASE_CLASS} ${activePriority === option.value ? META_PILL_STYLES[getPriorityTone(option.value)] : META_PILL_STYLES.neutral}`}>
                                                      {option.label}
                                                    </span>
                                                  </button>
                                                ))}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  </td>
                                );
                              }

                              const activePriorities: AgentPlanPriorityValue[] = [
                                ...(task.isFocused ? ["focus" as const] : []),
                                ...(task.isImportant ? ["important" as const] : []),
                                ...(task.isUrgent ? ["urgent" as const] : []),
                              ];

                              return (
                                <td className="relative px-[3px] py-3 align-top" key={`${task.id}-${columnId}`}>
                                  <div className="relative" data-task-field-menu>
                                    <button
                                      aria-expanded={isTaskFieldMenuOpen(task.id, "priority")}
                                      aria-label={`Change priority for ${task.title}`}
                                      className={`appearance-none border-0 bg-transparent p-0 text-left ${FOCUS_RING_CLASS}`}
                                      data-column-measure
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openTaskField(task.id, "priority");
                                      }}
                                      type="button"
                                    >
                                      <span className="flex flex-wrap gap-2">
                                        {activePriorities.length === 0 ? (
                                          <span className={`${META_PILL_BASE_CLASS} ${META_PILL_STYLES.neutral}`}>None</span>
                                        ) : (
                                          activePriorities.map((priority) => (
                                            <span className={`${META_PILL_BASE_CLASS} ${META_PILL_STYLES[getPriorityTone(priority)]}`} key={`${task.id}-priority-chip-${priority}`}>
                                              {PRIORITY_OPTIONS.find((option) => option.value === priority)?.label ?? priority}
                                            </span>
                                          ))
                                        )}
                                      </span>
                                    </button>
                                    {isTaskFieldMenuOpen(task.id, "priority") ? (
                                      <div className="absolute left-0 top-[calc(100%+0.45rem)] z-40 inline-block w-fit rounded-[1.5rem] bg-white/88 px-2 py-2 shadow-[0_24px_60px_rgba(115,88,255,0.14)] ring-1 ring-[#ede6ff] backdrop-blur-md dark:bg-[#1a1230]/92 dark:ring-white/10">
                                        <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(128,100,255,0.35),transparent)] dark:bg-[linear-gradient(90deg,transparent,rgba(202,191,255,0.35),transparent)]" />
                                        <div className="inline-flex flex-col items-start gap-2">
                                          {priorityRows.map((row, rowIndex) => (
                                            <div className="flex items-center gap-2" key={`${task.id}-priority-row-${rowIndex}`}>
                                              {row.map((option) => (
                                                <button
                                                  aria-pressed={option.value === "none" ? activePriorities.length === 0 : activePriorities.includes(option.value)}
                                                  className={`appearance-none border-0 bg-transparent p-0 text-left ${FOCUS_RING_CLASS}`}
                                                  key={`${task.id}-priority-${option.value}`}
                                                  onClick={(event) => {
                                                    event.stopPropagation();
                                                    onSetTaskPriority(task.id, option.value);
                                                  }}
                                                  type="button"
                                                >
                                                  <span className={`${META_PILL_BASE_CLASS} ${option.value === "none"
                                                    ? (activePriorities.length === 0 ? META_PILL_STYLES.neutral : META_PILL_STYLES.warning)
                                                    : (activePriorities.includes(option.value) ? META_PILL_STYLES[getPriorityTone(option.value)] : META_PILL_STYLES.neutral)}`}>
                                                    {option.label}
                                                  </span>
                                                </button>
                                              ))}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                              );
                            }

                            if (columnId === "energy") {
                              const energyLabel = metadataValueByColumn.energy ?? "None";
                              const activeEnergy = energyLabel.toLowerCase() as AgentPlanEnergyValue;

                              return (
                                <td className="relative px-[3px] py-3 align-top" key={`${task.id}-${columnId}`}>
                                  <div className="relative" data-task-field-menu>
                                    <button
                                      aria-expanded={isTaskFieldMenuOpen(task.id, "energy")}
                                      aria-label={`Change energy for ${task.title}`}
                                      className={`appearance-none border-0 bg-transparent p-0 text-left ${FOCUS_RING_CLASS}`}
                                      data-column-measure
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openTaskField(task.id, "energy");
                                      }}
                                      type="button"
                                    >
                                      <span className={`${META_PILL_BASE_CLASS} ${META_PILL_STYLES[getEnergyTone(activeEnergy)]}`}>
                                        {energyLabel}
                                      </span>
                                    </button>
                                    {isTaskFieldMenuOpen(task.id, "energy") ? (
                                      <div className="absolute left-0 top-[calc(100%+0.45rem)] z-40 inline-block w-fit rounded-[1.5rem] bg-white/88 px-2 py-2 shadow-[0_24px_60px_rgba(115,88,255,0.14)] ring-1 ring-[#ede6ff] backdrop-blur-md dark:bg-[#1a1230]/92 dark:ring-white/10">
                                        <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(128,100,255,0.35),transparent)] dark:bg-[linear-gradient(90deg,transparent,rgba(202,191,255,0.35),transparent)]" />
                                        <div className="inline-flex flex-col items-start gap-2">
                                          {energyRows.map((row, rowIndex) => (
                                            <div className="flex items-center gap-2" key={`${task.id}-energy-row-${rowIndex}`}>
                                              {row.map((option) => (
                                                <button
                                                  aria-pressed={activeEnergy === option.value}
                                                  className={`appearance-none border-0 bg-transparent p-0 text-left ${FOCUS_RING_CLASS}`}
                                                  key={`${task.id}-energy-${option.value}`}
                                                  onClick={(event) => {
                                                    event.stopPropagation();
                                                    onSetTaskEnergy(task.id, option.value);
                                                    setOpenTaskFieldMenu(null);
                                                  }}
                                                  type="button"
                                                >
                                                  <span className={`${META_PILL_BASE_CLASS} ${activeEnergy === option.value ? META_PILL_STYLES[getEnergyTone(option.value)] : META_PILL_STYLES.neutral}`}>
                                                    {option.label}
                                                  </span>
                                                </button>
                                              ))}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                              );
                            }

                            return (
                              <td className="px-[3px] py-3 align-top text-sm text-[#59627e] dark:text-white/65" key={`${task.id}-${columnId}`}>
                                {metadataValueByColumn[columnId] ?? "—"}
                              </td>
                            );
                          })}
                        </motion.tr>
                        <AnimatePresence initial={false}>
                          {expanded && task.subtasks.length > 0 ? (
                            <motion.tr
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              initial={{ opacity: 0, height: 0 }}
                              onAnimationComplete={markConnectorsSettled}
                              transition={{ duration: 0.22 }}
                            >
                              <td className="px-3 pt-0 pb-2" colSpan={2 + orderedOptionalColumns.length}>
                                <div style={{ paddingLeft: `${columnWidths.status}px` }}>
                                  <div>
                                    <SubtaskList
                                      autofocusSubtaskId={autofocusSubtaskId}
                                      connectFromParent
                                      connectorsSettling={connectorsSettling}
                                      onAddChildSubtask={handleAutofocusSubtask}
                                      onDeleteSubtask={onDeleteSubtask}
                                      onAutofocusHandled={() => setAutofocusSubtaskId(null)}
                                      onConnectorSettled={markConnectorsSettled}
                                      onConnectorSettling={markConnectorsSettling}
                                      onRenameSubtask={onRenameSubtask}
                                      onSetSubtaskStatus={onSetSubtaskStatus}
                                      subtasks={task.subtasks}
                                    />
                                  </div>
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
            {taskScrollIndicator.scrollable ? (
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-4 bottom-0 h-1.5 overflow-hidden rounded-full bg-[#efeaff] transition-opacity duration-200 dark:bg-white/10 ${taskScrollIndicator.active ? "opacity-100" : "opacity-80"}`}
              >
                <span
                  className="absolute left-0 top-0 block h-full rounded-full bg-[#8d78ff] shadow-[0_0_12px_rgba(124,92,255,0.38)]"
                  style={{
                    transform: `translateX(${taskScrollIndicator.left}px)`,
                    width: `${taskScrollIndicator.width}px`,
                  }}
                />
              </div>
            ) : null}
            </div>
          </LayoutGroup>
        )}
      </motion.div>
    </div>
  );
}
