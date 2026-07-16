"use client";

import type { TaskRepeatMonthlyMode, TaskRepeatMonthlyOrdinal } from "@/lib/database.types";
import type { ButtonHTMLAttributes, InputHTMLAttributes } from "react";

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export const TASK_TABLE_CHIP_TEXT_CLASS = "text-[13px] font-medium leading-none tracking-normal";
export const TASK_TABLE_CHIP_BASE_CLASS = `inline-flex items-center justify-center rounded-full border px-2 py-1 whitespace-nowrap ${TASK_TABLE_CHIP_TEXT_CLASS}`;
export const TASK_TABLE_ICON_LABEL_GAP_CLASS = "gap-1.5";
export const TASK_TABLE_CONTROL_FONT_CLASS = "[font-family:inherit]";
export const TASK_TABLE_TEXT_CLASS = "text-[14px] font-medium normal-case tracking-normal";
export const TASK_TABLE_HEADER_TEXT_CLASS = `${TASK_TABLE_TEXT_CLASS} text-[#938ab8] dark:text-white/42`;
export const TASK_TABLE_BODY_VALUE_CLASS = `${TASK_TABLE_TEXT_CLASS} text-[#595378] dark:text-white/68`;
export const TASK_TABLE_BODY_MUTED_VALUE_CLASS = `${TASK_TABLE_TEXT_CLASS} text-[#80799c] dark:text-white/52`;
export const TASK_TABLE_TITLE_CELL_CLASS = `${TASK_TABLE_CONTROL_FONT_CLASS} ${TASK_TABLE_CHIP_TEXT_CLASS} text-[#7a7592] dark:text-white/58`;
// Visible task and step titles use the same text size and font treatment as table chips.
export const TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS = `${TASK_TABLE_CONTROL_FONT_CLASS} ${TASK_TABLE_CHIP_TEXT_CLASS} text-[#7a7592] dark:text-white/58`;
export const TASK_TABLE_LIST_CHIP_CLASS = "border-[#ece7f5] bg-[#f7f5fb] text-[#7a7592] dark:border-white/8 dark:bg-white/[0.045] dark:text-white/58";
export const TASK_TABLE_ACTIVE_LIST_CHIP_CLASS = "border-[#ddd2ff] bg-[#6f57f6] text-white dark:border-[#7f67ff] dark:bg-[#7f67ff] dark:text-white";
export const TASK_TABLE_TAG_CHIP_CLASS = "border-[#e8defe] bg-[#f3eeff] text-[#7762f3] dark:border-[#3a2e63] dark:bg-[#21183d] dark:text-[#c7bcff]";
export const TASK_TABLE_INACTIVE_CHIP_CLASS = "border border-[#e4deef] bg-[#f4f5f8] text-[#68738c] dark:border-white/10 dark:bg-white/8 dark:text-white/60";
export const TASK_TABLE_INPUT_CLASS = `${TASK_TABLE_CONTROL_FONT_CLASS} ${TASK_TABLE_TEXT_CLASS} w-full rounded-[0.95rem] border border-[#e5e0f5] bg-[#fbfaff] px-3 py-2 text-[#2f294a] outline-none placeholder:text-[#9b92be] dark:border-white/15 dark:bg-white/8 dark:text-white dark:placeholder:text-white/35`;
export const TASK_TABLE_COMPACT_CADENCE_LABEL_CLASS = `${TASK_TABLE_CONTROL_FONT_CLASS} ${TASK_TABLE_CHIP_TEXT_CLASS} shrink-0 text-[#7a7592] dark:text-white/58`;
export const TASK_TABLE_COMPACT_CADENCE_INPUT_CLASS = `${TASK_TABLE_CONTROL_FONT_CLASS} ${TASK_TABLE_CHIP_TEXT_CLASS} h-[26px] w-[56px] min-w-[56px] max-w-[56px] shrink-0 rounded-full border border-[#e4deef] bg-[#f4f5f8] px-2 text-center text-[#68738c] outline-none transition placeholder:text-[#9b92be] focus:border-[#c9bcff] focus:bg-white focus:text-[#595378] dark:border-white/10 dark:bg-white/8 dark:text-white/60 dark:placeholder:text-white/35 dark:focus:border-[#6d56d6] dark:focus:bg-[#22193f]`;

type TaskTableChipButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  toneClassName?: string;
};

type ScrollUpButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;
type CompactRepeatCadenceControlsProps<TRepeat extends string> = {
  activeToneClassName: string;
  dayInputProps: InputHTMLAttributes<HTMLInputElement>;
  inactiveToneClassName: string;
  intervalInputProps: InputHTMLAttributes<HTMLInputElement>;
  monthlyMode?: TaskRepeatMonthlyMode;
  monthlyModeOptions?: Array<{ label: string; value: TaskRepeatMonthlyMode }>;
  monthlyOrdinal?: TaskRepeatMonthlyOrdinal | null;
  monthlyOrdinalOptions?: Array<{ label: string; value: TaskRepeatMonthlyOrdinal }>;
  monthlyWeekday?: number | null;
  onMonthlyModeClick?: (mode: TaskRepeatMonthlyMode) => void;
  onMonthlyOrdinalClick?: (ordinal: TaskRepeatMonthlyOrdinal) => void;
  onMonthlyWeekdayClick?: (weekday: number) => void;
  onRepeatUnitClick: (repeat: TRepeat) => void;
  onWeekdayClick: (weekday: number) => void;
  repeat: TRepeat;
  repeatDaysOfWeek: number[];
  repeatUnits: Array<{ label: string; value: TRepeat }>;
  showInterval: boolean;
  showMonthDay: boolean;
  showMonthlyMode?: boolean;
  showMonthlyOrdinals?: boolean;
  showMonthlyWeekdays?: boolean;
  showWeekdays: boolean;
  weekdayOptions: Array<{ label: string; value: number }>;
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
        "inline-flex shrink-0 items-center appearance-none bg-transparent p-0 border-0 shadow-none",
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

export function CompactRepeatCadenceControls<TRepeat extends string>({
  activeToneClassName,
  dayInputProps,
  inactiveToneClassName,
  intervalInputProps,
  monthlyMode,
  monthlyModeOptions,
  monthlyOrdinal,
  monthlyOrdinalOptions,
  monthlyWeekday,
  onMonthlyModeClick,
  onMonthlyOrdinalClick,
  onMonthlyWeekdayClick,
  onRepeatUnitClick,
  onWeekdayClick,
  repeat,
  repeatDaysOfWeek,
  repeatUnits,
  showInterval,
  showMonthDay,
  showMonthlyMode,
  showMonthlyOrdinals,
  showMonthlyWeekdays,
  showWeekdays,
  weekdayOptions,
}: CompactRepeatCadenceControlsProps<TRepeat>) {
  return (
    <div className="space-y-2">
      {showInterval ? (
        <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1">
          <span className={TASK_TABLE_COMPACT_CADENCE_LABEL_CLASS}>Every</span>
          <input
            {...intervalInputProps}
            className={joinClasses(TASK_TABLE_COMPACT_CADENCE_INPUT_CLASS, intervalInputProps.className)}
          />
          {repeatUnits.map((repeatUnit) => (
            <TaskTableChipButton
              key={`repeat-unit-${repeatUnit.value}`}
              onClick={() => onRepeatUnitClick(repeatUnit.value)}
              toneClassName={repeat === repeatUnit.value ? activeToneClassName : inactiveToneClassName}
            >
              {repeatUnit.label}
            </TaskTableChipButton>
          ))}
        </div>
      ) : null}
      {showWeekdays ? (
        <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1">
          {weekdayOptions.map((option) => (
            <TaskTableChipButton
              key={`repeat-weekday-${option.value}`}
              onClick={() => onWeekdayClick(option.value)}
              toneClassName={repeatDaysOfWeek.includes(option.value) ? activeToneClassName : inactiveToneClassName}
            >
              {option.label}
            </TaskTableChipButton>
          ))}
        </div>
      ) : null}
      {showMonthlyMode && monthlyModeOptions?.length ? (
        <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1">
          {monthlyModeOptions.map((option) => (
            <TaskTableChipButton
              key={`repeat-monthly-mode-${option.value}`}
              onClick={() => onMonthlyModeClick?.(option.value)}
              toneClassName={monthlyMode === option.value ? activeToneClassName : inactiveToneClassName}
            >
              {option.label}
            </TaskTableChipButton>
          ))}
        </div>
      ) : null}
      {showMonthDay ? (
        <div className="flex flex-nowrap items-center gap-1.5">
          <span className={TASK_TABLE_COMPACT_CADENCE_LABEL_CLASS}>Day</span>
          <input
            {...dayInputProps}
            className={joinClasses(TASK_TABLE_COMPACT_CADENCE_INPUT_CLASS, dayInputProps.className)}
          />
        </div>
      ) : null}
      {showMonthlyOrdinals && monthlyOrdinalOptions?.length ? (
        <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1">
          {monthlyOrdinalOptions.map((option) => (
            <TaskTableChipButton
              key={`repeat-monthly-ordinal-${option.value}`}
              onClick={() => onMonthlyOrdinalClick?.(option.value)}
              toneClassName={monthlyOrdinal === option.value ? activeToneClassName : inactiveToneClassName}
            >
              {option.label}
            </TaskTableChipButton>
          ))}
        </div>
      ) : null}
      {showMonthlyWeekdays ? (
        <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1">
          {weekdayOptions.map((option) => (
            <TaskTableChipButton
              key={`repeat-monthly-weekday-${option.value}`}
              onClick={() => onMonthlyWeekdayClick?.(option.value)}
              toneClassName={monthlyWeekday === option.value ? activeToneClassName : inactiveToneClassName}
            >
              {option.label}
            </TaskTableChipButton>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ScrollUpButton({
  children,
  className,
  type = "button",
  ...props
}: ScrollUpButtonProps) {
  return (
    <button
      className={joinClasses(
        TASK_TABLE_CONTROL_FONT_CLASS,
        "flex h-10 w-10 items-center justify-center rounded-full border border-[#ddd2ff] bg-[linear-gradient(180deg,#faf7ff_0%,#efe8ff_100%)] text-[#6f57f6] shadow-[0_14px_32px_rgba(111,87,246,0.18)] transition hover:-translate-y-0.5 hover:border-[#cbbcff] hover:text-[#5b43dc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b6a7ff] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-[#473a73] dark:bg-[linear-gradient(180deg,#21193d_0%,#19132f_100%)] dark:text-[#cabfff] dark:shadow-[0_14px_32px_rgba(0,0,0,0.24)] dark:hover:border-[#5d4e91] dark:hover:text-white dark:focus-visible:ring-[#7f67ff] dark:focus-visible:ring-offset-[#140f26]",
        className,
      )}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
