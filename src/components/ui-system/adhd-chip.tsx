"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  TASK_TABLE_ACTIVE_LIST_CHIP_CLASS,
  TASK_TABLE_CHIP_BASE_CLASS,
  TASK_TABLE_CONTROL_FONT_CLASS,
  TASK_TABLE_ICON_LABEL_GAP_CLASS,
  TASK_TABLE_LIST_CHIP_CLASS,
  TaskTableChipButton,
} from "@/components/ui/task-table-primitives";

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type AdhdChipTone =
  | "default"
  | "purple"
  | "pending"
  | "progress"
  | "delayed"
  | "done"
  | "best"
  | "missed"
  | "upcoming"
  | "notDue"
  | "complete"
  | "archived"
  | "danger";

const ADHD_CHIP_TONE_CLASS: Record<AdhdChipTone, string> = {
  default: TASK_TABLE_LIST_CHIP_CLASS,
  purple: "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]",
  pending: TASK_TABLE_LIST_CHIP_CLASS,
  progress: "border-[#d9e8ff] bg-[#eef5ff] text-[#4f73b8] dark:border-[#2c456f] dark:bg-[#17243a] dark:text-[#b7cdfd]",
  delayed: "border-[#e8defe] bg-[#f3eeff] text-[#7762f3] dark:border-[#3a2e63] dark:bg-[#21183d] dark:text-[#c7bcff]",
  done: "border-[#d8ecd9] bg-[#eef9f0] text-[#3f8b5a] dark:border-[#284a32] dark:bg-[#13281a] dark:text-[#a5ddb6]",
  best: "border-[#ffe2c7] bg-[#fff2e6] text-[#c8701b] dark:border-[#5d3b1a] dark:bg-[#2f2011] dark:text-[#ffd1a6]",
  missed: "border-[#ffd5dc] bg-[#fff0f3] text-[#d65775] dark:border-[#5f2a36] dark:bg-[#32161d] dark:text-[#ffb0c1]",
  upcoming: "border-[#d7ebff] bg-[#eff7ff] text-[#4e84c4] dark:border-[#29476b] dark:bg-[#152638] dark:text-[#bbd8ff]",
  notDue: "border-[#e4deef] bg-[#f4f5f8] text-[#68738c] dark:border-white/10 dark:bg-white/8 dark:text-white/60",
  complete: "border-[#cfe7d7] bg-[#edf8f1] text-[#368155] dark:border-[#284836] dark:bg-[#13261a] dark:text-[#a7d7b8]",
  archived: "border-[#e8e1f2] bg-[#f7f4fb] text-[#7d7597] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/58",
  danger: "border-[#ffd8df] bg-[#fff2f4] text-[#d54d63] dark:border-[#5b2430] dark:bg-[#31141b] dark:text-[#ffb3bf]",
};

export const ADHD_CHIP_SELECTED_CLASS = TASK_TABLE_ACTIVE_LIST_CHIP_CLASS;

export type AdhdChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  count?: ReactNode;
  countClassName?: string;
  icon?: ReactNode;
  selected?: boolean;
  tone?: AdhdChipTone;
  toneClassName?: string;
};

export function AdhdChip({
  children,
  className,
  contentClassName,
  count,
  countClassName,
  icon,
  selected = false,
  tone = "default",
  toneClassName,
  ...props
}: AdhdChipProps) {
  const resolvedToneClassName = selected
    ? ADHD_CHIP_SELECTED_CLASS
    : toneClassName ?? ADHD_CHIP_TONE_CLASS[tone];

  if (!icon && count === undefined && !contentClassName && !countClassName) {
    return (
      <TaskTableChipButton
        className={className}
        toneClassName={resolvedToneClassName}
        {...props}
      >
        {children}
      </TaskTableChipButton>
    );
  }

  return (
    <button
      className={joinClasses(
        TASK_TABLE_CONTROL_FONT_CLASS,
        "inline-flex shrink-0 items-center appearance-none border-0 bg-transparent p-0 shadow-none",
      )}
      type={props.type ?? "button"}
      {...props}
    >
      <span className={joinClasses(TASK_TABLE_CHIP_BASE_CLASS, resolvedToneClassName, icon ? "pl-1.5 pr-2" : null, className)}>
        <span className={joinClasses("inline-flex items-center", icon ? TASK_TABLE_ICON_LABEL_GAP_CLASS : null, contentClassName)}>
          {icon ? <span className="inline-flex items-center justify-center shrink-0">{icon}</span> : null}
          {children}
          {count === undefined ? null : (
            <span className={joinClasses("ml-1 opacity-70", countClassName)}>{count}</span>
          )}
        </span>
      </span>
    </button>
  );
}
