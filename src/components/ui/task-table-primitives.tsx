"use client";

import type { ButtonHTMLAttributes } from "react";

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export const TASK_TABLE_CHIP_TEXT_CLASS = "text-[13px] font-medium leading-none tracking-normal";
export const TASK_TABLE_CHIP_BASE_CLASS = `inline-flex items-center justify-center rounded-full border px-2 py-1 whitespace-nowrap ${TASK_TABLE_CHIP_TEXT_CLASS}`;
export const TASK_TABLE_CONTROL_FONT_CLASS = "[font-family:inherit]";
export const TASK_TABLE_TEXT_CLASS = "text-[14px] font-medium normal-case tracking-normal";
export const TASK_TABLE_HEADER_TEXT_CLASS = `${TASK_TABLE_TEXT_CLASS} text-[#938ab8] dark:text-white/42`;
export const TASK_TABLE_BODY_VALUE_CLASS = `${TASK_TABLE_TEXT_CLASS} text-[#595378] dark:text-white/68`;
export const TASK_TABLE_BODY_MUTED_VALUE_CLASS = `${TASK_TABLE_TEXT_CLASS} text-[#80799c] dark:text-white/52`;
export const TASK_TABLE_TITLE_CELL_CLASS = `${TASK_TABLE_CONTROL_FONT_CLASS} ${TASK_TABLE_CHIP_TEXT_CLASS} text-[#7a7592] dark:text-white/58`;
export const TASK_TABLE_LIST_CHIP_CLASS = "border-[#ece7f5] bg-[#f7f5fb] text-[#7a7592] dark:border-white/8 dark:bg-white/[0.045] dark:text-white/58";
export const TASK_TABLE_ACTIVE_LIST_CHIP_CLASS = "border-[#ddd2ff] bg-[#6f57f6] text-white dark:border-[#7f67ff] dark:bg-[#7f67ff] dark:text-white";
export const TASK_TABLE_TAG_CHIP_CLASS = "border-[#e8defe] bg-[#f3eeff] text-[#7762f3] dark:border-[#3a2e63] dark:bg-[#21183d] dark:text-[#c7bcff]";
export const TASK_TABLE_INACTIVE_CHIP_CLASS = "border border-[#e4deef] bg-[#f4f5f8] text-[#68738c] dark:border-white/10 dark:bg-white/8 dark:text-white/60";
export const TASK_TABLE_INPUT_CLASS = `${TASK_TABLE_CONTROL_FONT_CLASS} ${TASK_TABLE_TEXT_CLASS} w-full rounded-[0.95rem] border border-[#e5e0f5] bg-[#fbfaff] px-3 py-2 text-[#2f294a] outline-none placeholder:text-[#9b92be] dark:border-white/15 dark:bg-white/8 dark:text-white dark:placeholder:text-white/35`;

type TaskTableChipButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  toneClassName?: string;
};

export function TaskTableChipButton({
  children,
  className,
  toneClassName = TASK_TABLE_INACTIVE_CHIP_CLASS,
  type = "button",
  ...props
}: TaskTableChipButtonProps) {
  return (
    <button
      className={joinClasses(
        TASK_TABLE_CONTROL_FONT_CLASS,
        "shrink-0 appearance-none bg-transparent p-0 border-0 shadow-none",
      )}
      type={type}
      {...props}
    >
      <span
        className={joinClasses(
          TASK_TABLE_CHIP_BASE_CLASS,
          toneClassName,
          className,
        )}
      >
        {children}
      </span>
    </button>
  );
}
