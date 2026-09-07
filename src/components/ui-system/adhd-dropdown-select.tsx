"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { AdhdDropdownPanel } from "./adhd-dropdown-panel";
import { TASK_TABLE_CHIP_BASE_CLASS, TASK_TABLE_CONTROL_FONT_CLASS, TASK_TABLE_LIST_CHIP_CLASS, TASK_TABLE_TEXT_CLASS } from "@/components/ui/task-table-primitives";

export type AdhdDropdownSelectOption<T extends string> = {
  label: string;
  value: T;
};

export function AdhdDropdownSelect<T extends string>({
  ariaLabel,
  disabled = false,
  label,
  onChange,
  options,
  value,
}: {
  ariaLabel?: string;
  disabled?: boolean;
  label: string;
  onChange: (value: T) => void;
  options: ReadonlyArray<AdhdDropdownSelectOption<T>>;
  value: T;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className="relative mt-1">
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel ?? label}
        className={`${TASK_TABLE_CONTROL_FONT_CLASS} ${TASK_TABLE_TEXT_CLASS} flex min-h-10 w-full items-center justify-between gap-3 rounded-[0.95rem] border border-[#e5e0f5] bg-white px-3 py-2 text-left text-[#2f294a] outline-none transition hover:border-[#cfc2fb] focus:border-[#b9a8ff] focus:ring-2 focus:ring-[#d9d0ff]/45 disabled:cursor-not-allowed disabled:opacity-55 dark:border-white/15 dark:bg-white/8 dark:text-white dark:hover:border-white/25 dark:focus:border-[#6d56d6]`}
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="min-w-0 truncate">{selectedOption?.label ?? "Choose"}</span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen ? (
        <AdhdDropdownPanel
          aria-label={`${label} options`}
          className="max-h-64 overflow-y-auto p-1.5"
          role="listbox"
          widthClassName="left-0 right-0 w-auto"
        >
          <div className="grid gap-1">
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  aria-selected={selected}
                  className={`${TASK_TABLE_CHIP_BASE_CLASS} ${selected ? "border-[#ddd2ff] bg-[#6f57f6] text-white dark:border-[#7f67ff] dark:bg-[#7f67ff]" : TASK_TABLE_LIST_CHIP_CLASS} w-full justify-between text-left transition hover:border-[#cfc2fb] hover:bg-[#f1ecff] dark:hover:border-white/20 dark:hover:bg-white/10`}
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  role="option"
                  type="button"
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </AdhdDropdownPanel>
      ) : null}
    </div>
  );
}
