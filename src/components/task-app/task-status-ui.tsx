import { ArrowRight, BookOpen, CalendarClock, CalendarDays, Clock, Ellipsis, Star, Trash2, X } from "lucide-react";
import type { MouseEvent } from "react";

import type { TaskStatus, TaskSubtaskStatus } from "@/lib/database.types";
import type { TaskDisplayStatus as UiTaskDisplayStatus } from "@/lib/task-display-status";

export type TaskDisplayStatus = UiTaskDisplayStatus | TaskSubtaskStatus;

export const TASK_TABLE_CURRENT_STATUS_CIRCLE_SIZE = "md" as const;

export const TASK_STATUS_OPTIONS: Array<{ label: string; value: TaskStatus }> = [
  { label: "Open", value: "pending" },
  { label: "In Progress", value: "in_progress" },
  { label: "Delayed", value: "delayed" },
  { label: "Done", value: "done" },
  { label: "Did My Best", value: "did_my_best" },
  { label: "Missed", value: "missed" },
  { label: "Complete", value: "complete" },
  { label: "Upcoming", value: "upcoming" },
  { label: "Not Due", value: "not_due" },
  { label: "Archived", value: "archived" },
];

export const TASK_DISPLAY_STATUS_OPTIONS: Array<{ label: string; value: UiTaskDisplayStatus }> = [
  { label: "Unscheduled", value: "unscheduled" },
  ...TASK_STATUS_OPTIONS,
];

export const TASK_SUBTASK_STATUS_OPTIONS: Array<{ label: string; value: TaskSubtaskStatus }> = TASK_STATUS_OPTIONS.filter(
  (option): option is { label: string; value: TaskSubtaskStatus } => option.value !== "delayed" && option.value !== "complete" && option.value !== "archived",
);

export const TASK_STATUS_CHIP_STYLES: Record<TaskStatus, string> = {
  pending: "border border-[#f6be96] bg-white text-[#d96b1c]",
  in_progress: "border border-[#a9c2ff] bg-white text-[#4473df]",
  done: "border border-[#97dfc1] bg-white text-[#119a69]",
  missed: "border border-[#f4afbc] bg-white text-[#d94e67]",
  did_my_best: "border border-[#f2d36f] bg-white text-[#b28700]",
  complete: "border border-[#5d9b76] bg-white text-[#256947]",
  upcoming: "border border-[#cfd6e4] bg-white text-[#68738c]",
  not_due: "border border-[#a9daf7] bg-white text-[#3388c9]",
  delayed: "border border-[#d8c0ff] bg-white text-[#7d54d1]",
  archived: "border border-[#b7becd] bg-white text-[#5e687d]",
  trashed: "border border-[#f4afbc] bg-white text-[#d94e67]",
};

export const TASK_DISPLAY_STATUS_CHIP_STYLES: Record<UiTaskDisplayStatus, string> = {
  ...TASK_STATUS_CHIP_STYLES,
  unscheduled: "border border-[#b7becd] bg-white text-[#5e687d]",
};

export const TASK_STATUS_INVERTED_CHIP_STYLES: Record<TaskStatus, string> = {
  archived: "border border-[#68738c] bg-[#68738c] text-white dark:border-[#68738c] dark:bg-[#68738c] dark:text-white",
  complete: "border border-[#256947] bg-[#256947] text-white dark:border-[#256947] dark:bg-[#256947] dark:text-white",
  delayed: "border border-[#7d54d1] bg-[#7d54d1] text-white dark:border-[#7d54d1] dark:bg-[#7d54d1] dark:text-white",
  did_my_best: "border border-[#b28700] bg-[#b28700] text-white dark:border-[#b28700] dark:bg-[#b28700] dark:text-white",
  done: "border border-[#119a69] bg-[#119a69] text-white dark:border-[#119a69] dark:bg-[#119a69] dark:text-white",
  in_progress: "border border-[#4473df] bg-[#4473df] text-white dark:border-[#4473df] dark:bg-[#4473df] dark:text-white",
  missed: "border border-[#d94e67] bg-[#d94e67] text-white dark:border-[#d94e67] dark:bg-[#d94e67] dark:text-white",
  not_due: "border border-[#3388c9] bg-[#3388c9] text-white dark:border-[#3388c9] dark:bg-[#3388c9] dark:text-white",
  pending: "border border-[#d96b1c] bg-[#d96b1c] text-white dark:border-[#d96b1c] dark:bg-[#d96b1c] dark:text-white",
  trashed: "border border-[#d94e67] bg-[#d94e67] text-white dark:border-[#d94e67] dark:bg-[#d94e67] dark:text-white",
  upcoming: "border border-[#68738c] bg-[#68738c] text-white dark:border-[#68738c] dark:bg-[#68738c] dark:text-white",
};

export const TASK_DISPLAY_STATUS_INVERTED_CHIP_STYLES: Record<UiTaskDisplayStatus, string> = {
  ...TASK_STATUS_INVERTED_CHIP_STYLES,
  unscheduled: "border border-[#68738c] bg-[#68738c] text-white dark:border-[#68738c] dark:bg-[#68738c] dark:text-white",
};

export function getTaskStatusCircleClassName(
  status: TaskDisplayStatus,
  options: { inverted?: boolean } = {},
) {
  const key = (status === "trashed" ? "trashed" : status) as UiTaskDisplayStatus;
  if (options.inverted) {
    return TASK_DISPLAY_STATUS_INVERTED_CHIP_STYLES[key] ?? "border border-[#6b738f] bg-[#6b738f] text-white dark:border-[#6b738f] dark:bg-[#6b738f] dark:text-white";
  }
  return TASK_DISPLAY_STATUS_CHIP_STYLES[key] ?? "border border-[#6b738f] bg-white text-[#6b738f]";
}

export function getTaskStatusCircleHoverInvertedClassName(status: TaskDisplayStatus) {
  const key = (status === "trashed" ? "trashed" : status) as UiTaskDisplayStatus;
  const hoverClassMap: Record<UiTaskDisplayStatus, string> = {
    archived: "group-hover:border-[#68738c] group-hover:bg-[#68738c] group-hover:text-white dark:group-hover:border-[#68738c] dark:group-hover:bg-[#68738c] dark:group-hover:text-white",
    complete: "group-hover:border-[#256947] group-hover:bg-[#256947] group-hover:text-white dark:group-hover:border-[#256947] dark:group-hover:bg-[#256947] dark:group-hover:text-white",
    delayed: "group-hover:border-[#7d54d1] group-hover:bg-[#7d54d1] group-hover:text-white dark:group-hover:border-[#7d54d1] dark:group-hover:bg-[#7d54d1] dark:group-hover:text-white",
    did_my_best: "group-hover:border-[#b28700] group-hover:bg-[#b28700] group-hover:text-white dark:group-hover:border-[#b28700] dark:group-hover:bg-[#b28700] dark:group-hover:text-white",
    done: "group-hover:border-[#119a69] group-hover:bg-[#119a69] group-hover:text-white dark:group-hover:border-[#119a69] dark:group-hover:bg-[#119a69] dark:group-hover:text-white",
    in_progress: "group-hover:border-[#4473df] group-hover:bg-[#4473df] group-hover:text-white dark:group-hover:border-[#4473df] dark:group-hover:bg-[#4473df] dark:group-hover:text-white",
    missed: "group-hover:border-[#d94e67] group-hover:bg-[#d94e67] group-hover:text-white dark:group-hover:border-[#d94e67] dark:group-hover:bg-[#d94e67] dark:group-hover:text-white",
    not_due: "group-hover:border-[#3388c9] group-hover:bg-[#3388c9] group-hover:text-white dark:group-hover:border-[#3388c9] dark:group-hover:bg-[#3388c9] dark:group-hover:text-white",
    pending: "group-hover:border-[#d96b1c] group-hover:bg-[#d96b1c] group-hover:text-white dark:group-hover:border-[#d96b1c] dark:group-hover:bg-[#d96b1c] dark:group-hover:text-white",
    trashed: "group-hover:border-[#d94e67] group-hover:bg-[#d94e67] group-hover:text-white dark:group-hover:border-[#d94e67] dark:group-hover:bg-[#d94e67] dark:group-hover:text-white",
    upcoming: "group-hover:border-[#68738c] group-hover:bg-[#68738c] group-hover:text-white dark:group-hover:border-[#68738c] dark:group-hover:bg-[#68738c] dark:group-hover:text-white",
    unscheduled: "group-hover:border-[#68738c] group-hover:bg-[#68738c] group-hover:text-white dark:group-hover:border-[#68738c] dark:group-hover:bg-[#68738c] dark:group-hover:text-white",
  };
  return hoverClassMap[key] ?? "group-hover:border-[#6b738f] group-hover:bg-[#6b738f] group-hover:text-white dark:group-hover:border-[#6b738f] dark:group-hover:bg-[#6b738f] dark:group-hover:text-white";
}

export function formatTaskStatusLabel(value: string) {
  if (value === "pending") {
    return "Open";
  }
  if (value === "archived") {
    return "Archived";
  }

  if (value === "trashed") {
    return "Trash";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function renderTaskStatusGlyph(
  status: TaskDisplayStatus,
  size: "sm" | "md" = "md",
) {
  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.25 w-3.25";

  if (status === "pending") {
    return <Ellipsis className={iconSize} />;
  }

  if (status === "in_progress") {
    return <ArrowRight className={iconSize} />;
  }

  if (status === "done") {
    return <span className={`${size === "sm" ? "text-[11px]" : "text-xs"} font-bold leading-none`}>✓</span>;
  }

  if (status === "missed") {
    return <X className={`${iconSize} translate-y-[0.5px]`} strokeWidth={2.6} />;
  }

  if (status === "did_my_best") {
    return <Star className={iconSize} />;
  }

  if (status === "complete") {
    return <span className={`${size === "sm" ? "text-[11px]" : "text-xs"} font-bold leading-none`}>✓</span>;
  }

  if (status === "upcoming") {
    return <Clock className={iconSize} />;
  }

  if (status === "not_due") {
    return (
      <span className={`flex items-center gap-[2px] ${size === "sm" ? "scale-90" : ""}`} aria-hidden="true">
        <span className={`block rounded-full bg-current ${size === "sm" ? "h-2.5 w-[2px]" : "h-3 w-[2px]"}`} />
        <span className={`block rounded-full bg-current ${size === "sm" ? "h-2.5 w-[2px]" : "h-3 w-[2px]"}`} />
      </span>
    );
  }

  if (status === "delayed") {
    return <CalendarClock className={iconSize} />;
  }

  if (status === "unscheduled") {
    return <CalendarDays className={iconSize} />;
  }

  if (status === "trashed") {
    return <Trash2 className={iconSize} />;
  }

  return <BookOpen className={iconSize} />;
}

export function renderTaskStatusCircle(
  status: TaskDisplayStatus,
  size: "sm" | "md" = "md",
  options: { className?: string; inverted?: boolean } = {},
) {
  const sizeClasses = size === "sm" ? "h-5 w-5" : "h-5.5 w-5.5";
  const statusLabel = formatTaskStatusLabel(status);
  const badgeProps = {
    "aria-label": statusLabel,
    title: statusLabel,
  };
  return (
    <span
      {...badgeProps}
      className={[
        "flex items-center justify-center rounded-full transition-colors",
        sizeClasses,
        getTaskStatusCircleClassName(status, { inverted: options.inverted }),
        options.className ?? "",
      ].join(" ").trim()}
    >
      {renderTaskStatusGlyph(status, size)}
    </span>
  );
}

export function TaskStatusCircleRail<Status extends TaskDisplayStatus>({
  className = "",
  currentStatus,
  onSetStatus,
  options,
  statusLabelPrefix = "Set status to",
  wrap = true,
}: {
  className?: string;
  currentStatus: Status;
  onSetStatus: (status: Status, event: MouseEvent<HTMLButtonElement>) => void;
  options: Array<{ label: string; value: Status }>;
  statusLabelPrefix?: string;
  wrap?: boolean;
}) {
  return (
    <div className={["flex gap-1.5", wrap ? "flex-wrap" : "flex-nowrap", className].join(" ").trim()}>
      {options.map((option) => (
        <button
          aria-label={`${statusLabelPrefix} ${option.label}`}
          className={`inline-flex items-center justify-center rounded-full p-0.5 transition ${currentStatus === option.value ? "" : "opacity-78 hover:opacity-100"}`}
          key={option.value}
          onClick={(event) => {
            event.stopPropagation();
            onSetStatus(option.value, event);
          }}
          type="button"
        >
          {renderTaskStatusCircle(option.value, "sm", { inverted: currentStatus === option.value })}
        </button>
      ))}
    </div>
  );
}

export function renderTaskStatusChip(
  status: TaskDisplayStatus,
  options: { count?: number; size?: "sm" | "md" } = {},
) {
  return (
    <span className="inline-flex items-center gap-2">
      {renderTaskStatusCircle(status, options.size ?? "sm")}
      <span>{formatOptionLabel(status)}</span>
      {typeof options.count === "number" ? <span className="opacity-80">{options.count}</span> : null}
    </span>
  );
}

function formatOptionLabel(value: string) {
  return formatTaskStatusLabel(value);
}
