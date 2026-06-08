import { ArrowRight, BookOpen, Clock, Ellipsis, Star, X } from "lucide-react";

import type { TaskStatus, TaskSubtaskStatus } from "@/lib/database.types";

export const TASK_STATUS_CHIP_STYLES: Record<TaskStatus, string> = {
  pending: "border border-[#f6be96] bg-white text-[#d96b1c]",
  in_progress: "border border-[#a9c2ff] bg-white text-[#4473df]",
  done: "border border-[#97dfc1] bg-white text-[#119a69]",
  missed: "border border-[#f4afbc] bg-white text-[#d94e67]",
  did_my_best: "border border-[#f2d36f] bg-white text-[#b28700]",
  upcoming: "border border-[#cfd6e4] bg-white text-[#68738c]",
  not_due: "border border-[#a9daf7] bg-white text-[#3388c9]",
  archived: "border border-[#b7becd] bg-white text-[#5e687d]",
};

export function formatTaskStatusLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function renderTaskStatusGlyph(
  status: TaskStatus | TaskSubtaskStatus,
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

  return <BookOpen className={iconSize} />;
}

export function renderTaskStatusCircle(
  status: TaskStatus | TaskSubtaskStatus,
  size: "sm" | "md" = "md",
) {
  const sizeClasses = size === "sm" ? "h-5 w-5" : "h-5.5 w-5.5";
  const statusLabel = formatTaskStatusLabel(status);
  const badgeProps = {
    "aria-label": statusLabel,
    title: statusLabel,
  };

  if (status === "pending") {
    return (
      <span {...badgeProps} className={`flex ${sizeClasses} items-center justify-center rounded-full border border-[#d96b1c] text-[#d96b1c]`}>
        {renderTaskStatusGlyph(status, size)}
      </span>
    );
  }

  if (status === "in_progress") {
    return (
      <span {...badgeProps} className={`flex ${sizeClasses} items-center justify-center rounded-full border border-[#4473df] text-[#4473df]`}>
        {renderTaskStatusGlyph(status, size)}
      </span>
    );
  }

  if (status === "done") {
    return (
      <span {...badgeProps} className={`flex ${sizeClasses} items-center justify-center rounded-full border border-[#12a876] text-[#12a876]`}>
        {renderTaskStatusGlyph(status, size)}
      </span>
    );
  }

  if (status === "missed") {
    return (
      <span {...badgeProps} className={`flex ${sizeClasses} items-center justify-center rounded-full border border-[#d94e67] text-[#d94e67]`}>
        {renderTaskStatusGlyph(status, size)}
      </span>
    );
  }

  if (status === "did_my_best") {
    return (
      <span {...badgeProps} className={`flex ${sizeClasses} items-center justify-center rounded-full border border-[#b28700] text-[#b28700]`}>
        {renderTaskStatusGlyph(status, size)}
      </span>
    );
  }

  if (status === "upcoming") {
    return (
      <span {...badgeProps} className={`flex ${sizeClasses} items-center justify-center rounded-full border border-[#8d97b0] text-[#8d97b0]`}>
        {renderTaskStatusGlyph(status, size)}
      </span>
    );
  }

  if (status === "not_due") {
    return (
      <span {...badgeProps} className={`flex ${sizeClasses} items-center justify-center rounded-full border border-dashed border-[#57a9de] text-[#57a9de]`}>
        {renderTaskStatusGlyph(status, size)}
      </span>
    );
  }

  return (
    <span {...badgeProps} className={`flex ${sizeClasses} items-center justify-center rounded-full border border-[#6b738f] text-[#6b738f]`}>
      {renderTaskStatusGlyph(status, size)}
    </span>
  );
}

export function renderTaskStatusChip(
  status: TaskStatus | TaskSubtaskStatus,
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
