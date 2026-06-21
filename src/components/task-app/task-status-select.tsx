"use client";

import { ArrowRight, BookOpen, Clock, Ellipsis, Star, Trash2, X } from "lucide-react";
import type { TaskStatus } from "@/lib/database.types";
import { formatOptionLabel } from "@/lib/task-label-format";

export function renderTaskStatusIcon(status: TaskStatus) {
  const iconClassName = "h-4 w-4";
  switch (status) {
    case "pending":
      return <Ellipsis className={iconClassName} />;
    case "in_progress":
      return <ArrowRight className={iconClassName} />;
    case "done":
      return <span className="text-sm font-bold leading-none">✓</span>;
    case "missed":
      return <X className={`${iconClassName} translate-y-[0.5px]`} strokeWidth={2.6} />;
    case "did_my_best":
      return <Star className={iconClassName} />;
    case "complete":
      return <span className="text-sm font-bold leading-none">✓</span>;
    case "upcoming":
      return <Clock className={iconClassName} />;
    case "not_due":
      return (
        <span className="flex items-center gap-[2px]" aria-hidden="true">
          <span className="block h-3 w-[2px] rounded-full bg-current" />
          <span className="block h-3 w-[2px] rounded-full bg-current" />
        </span>
      );
    case "archived":
      return <BookOpen className={iconClassName} />;
    case "trashed":
      return <Trash2 className={iconClassName} />;
    default:
      return <Ellipsis className={iconClassName} />;
  }
}

export function Select<T extends string>({
  label,
  onChange,
  options,
  showLabel = false,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: T[];
  showLabel?: boolean;
  value: T;
}) {
  return (
    <label className="grid gap-2">
      <span className={showLabel ? "text-sm font-semibold text-[#5f6983] dark:text-white/65" : "sr-only"}>{label}</span>
      <select
        className="h-14 w-full rounded-[1.25rem] px-4 text-lg capitalize outline-none bg-[#f7f5ff] text-[#1f2642] dark:bg-white/8 dark:text-white"
        onChange={(event) => onChange(event.target.value as T)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {formatOptionLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
