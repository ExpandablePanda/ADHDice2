"use client";

import { ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import { useLayoutEffect, useRef, useState } from "react";
import { AdhdDropdownPanel } from "@/components/ui-system";
import { TaskTypeIcon } from "@/components/ui/lucide-icon";
import type { TaskTypeSelectionOption } from "@/lib/task-type";
import { resolveTaskTypeAccent, type TaskTypePresentation } from "@/lib/task-type-presentation";

export function TaskTypeIdentity({
  compact = false,
  description,
  dense = false,
  label,
  option,
  selected = false,
}: {
  compact?: boolean;
  description?: string;
  dense?: boolean;
  label?: string;
  option: Pick<TaskTypeSelectionOption, "label" | "iconKey" | "accentKey" | "description">;
  selected?: boolean;
}) {
  const accent = resolveTaskTypeAccent(option.accentKey);
  const detail = description ?? option.description;
  return (
    <span className={`inline-flex min-w-0 items-center ${dense ? "gap-1" : "gap-1.5"} ${compact ? "" : "rounded-[0.7rem] border px-2 py-1"} ${compact ? "text-inherit" : accent.className}`}>
      <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center ${dense ? "h-4 w-4 rounded-[0.25rem]" : "h-5 w-5 rounded-md"} ${selected ? "bg-white/15 text-white" : accent.iconClassName}`}>
        <TaskTypeIcon aria-hidden="true" className={dense ? "h-3 w-3" : "h-3.5 w-3.5"} iconKey={option.iconKey} />
      </span>
      <span className="min-w-0 truncate">{label ?? option.label}</span>
      {!compact && detail ? <span className="ml-1 min-w-0 truncate text-xs opacity-70">{detail}</span> : null}
    </span>
  );
}

export type TaskTypeSelectSize = "default" | "compact";

type TaskTypeSelectMenuPosition = {
  left: number;
  top: number;
  width: number;
};

const TASK_TYPE_SELECT_VIEWPORT_MARGIN = 8;
const TASK_TYPE_SELECT_MENU_GAP = 6;
const TASK_TYPE_SELECT_COMPACT_MENU_WIDTH = 160;
const TASK_TYPE_SELECT_COMPACT_MENU_HEIGHT = 220;
const TASK_TYPE_SELECT_DEFAULT_MENU_HEIGHT = 288;

export function getTaskTypeSelectMenuPosition(
  triggerRect: Pick<DOMRect, "bottom" | "left" | "top" | "width">,
  viewport: { height: number; width: number },
  panel: { height?: number; width?: number } = {},
  size: TaskTypeSelectSize = "default",
): TaskTypeSelectMenuPosition {
  const maxWidth = Math.max(0, viewport.width - TASK_TYPE_SELECT_VIEWPORT_MARGIN * 2);
  const preferredWidth = Math.max(
    triggerRect.width,
    size === "compact" ? TASK_TYPE_SELECT_COMPACT_MENU_WIDTH : triggerRect.width,
  );
  const width = Math.min(panel.width ?? preferredWidth, maxWidth);
  const height = panel.height ?? (size === "compact" ? TASK_TYPE_SELECT_COMPACT_MENU_HEIGHT : TASK_TYPE_SELECT_DEFAULT_MENU_HEIGHT);
  const left = Math.max(
    TASK_TYPE_SELECT_VIEWPORT_MARGIN,
    Math.min(triggerRect.left, viewport.width - width - TASK_TYPE_SELECT_VIEWPORT_MARGIN),
  );
  const belowTop = triggerRect.bottom + TASK_TYPE_SELECT_MENU_GAP;
  const top = belowTop + height <= viewport.height - TASK_TYPE_SELECT_VIEWPORT_MARGIN
    ? belowTop
    : Math.max(TASK_TYPE_SELECT_VIEWPORT_MARGIN, triggerRect.top - height - TASK_TYPE_SELECT_MENU_GAP);
  return { left, top, width };
}

export function TaskTypeSelect({
  ariaLabel,
  className,
  disabled = false,
  label,
  onChange,
  options,
  size = "default",
  value,
}: {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<TaskTypeSelectionOption>;
  size?: TaskTypeSelectSize;
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<TaskTypeSelectMenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  useLayoutEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger || !trigger.isConnected) {
        setIsOpen(false);
        return;
      }
      const rect = trigger.getBoundingClientRect();
      setMenuPosition(getTaskTypeSelectMenuPosition(
        rect,
        { height: window.innerHeight, width: window.innerWidth },
        { height: menuRef.current?.offsetHeight, width: menuRef.current?.offsetWidth },
        size,
      ));
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsOpen(false);
    };

    updatePosition();
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, size]);

  if (!selectedOption) return null;
  const isCompact = size === "compact";
  const triggerClassName = isCompact
    ? "inline-flex min-h-7 min-w-[7rem] max-w-[13rem] w-auto items-center justify-between gap-1.5 rounded-full border border-[#e5e0f5] bg-white px-2 py-1 text-left text-xs font-medium text-[#2f294a] outline-none transition hover:border-[#cfc2fb] focus:border-[#b9a8ff] focus:ring-2 focus:ring-[#d9d0ff]/45 disabled:cursor-not-allowed disabled:opacity-55 dark:border-white/15 dark:bg-white/8 dark:text-white dark:hover:border-white/25 dark:focus:border-[#6d56d6]"
    : "flex min-h-10 w-full items-center justify-between gap-3 rounded-[0.95rem] border border-[#e5e0f5] bg-white px-3 py-2 text-left text-sm text-[#2f294a] outline-none transition hover:border-[#cfc2fb] focus:border-[#b9a8ff] focus:ring-2 focus:ring-[#d9d0ff]/45 disabled:cursor-not-allowed disabled:opacity-55 dark:border-white/15 dark:bg-white/8 dark:text-white dark:hover:border-white/25 dark:focus:border-[#6d56d6]";
  const panel = isOpen && menuPosition && typeof document !== "undefined" ? (
    <AdhdDropdownPanel
      aria-label={`${label} options`}
      className={`${isCompact ? "max-h-64 p-1" : "max-h-72 p-1.5"} z-[160] max-w-[calc(100vw-1rem)] overflow-y-auto`}
      data-task-type-select-menu="true"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      ref={menuRef}
      role="listbox"
      style={{ left: menuPosition.left, position: "fixed", top: menuPosition.top, width: menuPosition.width, zIndex: 160 }}
      widthClassName="w-auto"
    >
      <div className={`grid ${isCompact ? "gap-0.5" : "gap-1"}`}>
        {options.map((option) => (
          <button
            aria-selected={option.value === value}
            className={isCompact
              ? `min-h-7 w-full rounded-[0.55rem] px-2 py-1 text-left text-xs transition hover:bg-[#f1ecff] dark:hover:bg-white/10 ${option.value === value ? "bg-[#f1ecff] dark:bg-white/10" : ""}`
              : `w-full rounded-[0.7rem] px-2.5 py-2 text-left transition hover:bg-[#f1ecff] dark:hover:bg-white/10 ${option.value === value ? "bg-[#f1ecff] dark:bg-white/10" : ""}`}
            key={option.value}
            onClick={() => { onChange(option.value); setIsOpen(false); }}
            role="option"
            type="button"
          >
            <TaskTypeIdentity compact={isCompact} dense={isCompact} option={option} />
          </button>
        ))}
      </div>
    </AdhdDropdownPanel>
  ) : null;

  return (
    <div className={`${isCompact ? "relative mt-1 inline-block max-w-full align-middle" : "relative mt-1"} ${className ?? ""}`} data-task-type-select="true">
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel ?? label}
        className={triggerClassName}
        disabled={disabled}
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
            return;
          }
          setMenuPosition(null);
          setIsOpen(true);
        }}
        ref={triggerRef}
        type="button"
      >
        <TaskTypeIdentity compact dense={isCompact} option={selectedOption} />
        <ChevronDown aria-hidden="true" className={`${isCompact ? "h-3 w-3" : "h-4 w-4"} shrink-0 transition ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {panel ? createPortal(panel, document.body) : null}
    </div>
  );
}

export type { TaskTypePresentation };
