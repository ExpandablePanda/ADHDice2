"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { AdhdDropdownPanel } from "@/components/ui-system";
import { TaskTypeIcon } from "@/components/ui/lucide-icon";
import type { TaskTypeSelectionOption } from "@/lib/task-type";
import { resolveTaskTypeAccent, type TaskTypePresentation } from "@/lib/task-type-presentation";

export function TaskTypeIdentity({
  compact = false,
  description,
  label,
  option,
  selected = false,
}: {
  compact?: boolean;
  description?: string;
  label?: string;
  option: Pick<TaskTypeSelectionOption, "label" | "iconKey" | "accentKey" | "description">;
  selected?: boolean;
}) {
  const accent = resolveTaskTypeAccent(option.accentKey);
  const detail = description ?? option.description;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${compact ? "" : "rounded-[0.7rem] border px-2 py-1"} ${compact ? "text-inherit" : accent.className}`}>
      <span aria-hidden="true" className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${selected ? "bg-white/15 text-white" : accent.iconClassName}`}>
        <TaskTypeIcon aria-hidden="true" className="h-3.5 w-3.5" iconKey={option.iconKey} />
      </span>
      <span className="min-w-0 truncate">{label ?? option.label}</span>
      {!compact && detail ? <span className="ml-1 min-w-0 truncate text-xs opacity-70">{detail}</span> : null}
    </span>
  );
}

export function TaskTypeSelect({
  ariaLabel,
  className,
  disabled = false,
  label,
  onChange,
  options,
  value,
}: {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<TaskTypeSelectionOption>;
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  if (!selectedOption) return null;
  return (
    <div className={`relative mt-1 ${className ?? ""}`} data-task-type-select="true">
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel ?? label}
        className="flex min-h-10 w-full items-center justify-between gap-3 rounded-[0.95rem] border border-[#e5e0f5] bg-white px-3 py-2 text-left text-sm text-[#2f294a] outline-none transition hover:border-[#cfc2fb] focus:border-[#b9a8ff] focus:ring-2 focus:ring-[#d9d0ff]/45 disabled:cursor-not-allowed disabled:opacity-55 dark:border-white/15 dark:bg-white/8 dark:text-white dark:hover:border-white/25 dark:focus:border-[#6d56d6]"
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <TaskTypeIdentity compact option={selectedOption} />
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen ? (
        <AdhdDropdownPanel aria-label={`${label} options`} className="max-h-72 overflow-y-auto p-1.5" role="listbox" widthClassName="left-0 right-0 w-auto">
          <div className="grid gap-1">
            {options.map((option) => (
              <button
                aria-selected={option.value === value}
                className={`w-full rounded-[0.7rem] px-2.5 py-2 text-left transition hover:bg-[#f1ecff] dark:hover:bg-white/10 ${option.value === value ? "bg-[#f1ecff] dark:bg-white/10" : ""}`}
                key={option.value}
                onClick={() => { onChange(option.value); setIsOpen(false); }}
                role="option"
                type="button"
              >
                <TaskTypeIdentity option={option} />
              </button>
            ))}
          </div>
        </AdhdDropdownPanel>
      ) : null}
    </div>
  );
}

export type { TaskTypePresentation };
