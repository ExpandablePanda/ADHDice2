"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { AdhdDropdownPanel } from "@/components/ui-system/adhd-dropdown-panel";

export const HEALTH_COMPACT_INPUT_CLASS = "health-input !h-[26px] !min-h-[26px] !rounded-full !px-2 !py-1 !text-[13px] !leading-none";

export type HealthDropdownOption = {
  label: string;
  value: string;
};

export function HealthDropdown({
  ariaLabel,
  className,
  disabled = false,
  id,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  onChange: (value: string) => void;
  options: HealthDropdownOption[];
  value: string;
}) {
  const generatedId = useId();
  const listboxId = id ?? `${generatedId}-listbox`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const selectedOption = options[selectedIndex] ?? options[0];

  useEffect(() => {
    function handleOutsidePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, []);

  function moveHighlight(direction: 1 | -1) {
    if (options.length === 0) {
      return;
    }
    const startIndex = isOpen ? highlightedIndex : selectedIndex;
    setIsOpen(true);
    setHighlightedIndex((startIndex + direction + options.length) % options.length);
  }

  function chooseOption(index: number) {
    const option = options[index];
    if (!option) {
      return;
    }
    onChange(option.value);
    setHighlightedIndex(index);
    setIsOpen(false);
  }

  return (
    <div className="relative w-full" ref={rootRef}>
      <button
        aria-controls={isOpen ? listboxId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-activedescendant={isOpen ? `${listboxId}-option-${highlightedIndex}` : undefined}
        className={`${HEALTH_COMPACT_INPUT_CLASS} flex items-center justify-between gap-2 text-left ${className ?? ""}`}
        disabled={disabled}
        id={id}
        onClick={() => {
          setHighlightedIndex(selectedIndex);
          setIsOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            moveHighlight(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            moveHighlight(-1);
          } else if (event.key === "Home") {
            event.preventDefault();
            setIsOpen(true);
            setHighlightedIndex(0);
          } else if (event.key === "End") {
            event.preventDefault();
            setIsOpen(true);
            setHighlightedIndex(Math.max(0, options.length - 1));
          } else if ((event.key === "Enter" || event.key === " ") && isOpen) {
            event.preventDefault();
            chooseOption(highlightedIndex);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setIsOpen(false);
          }
        }}
        role="combobox"
        type="button"
      >
        <span className="min-w-0 flex-1 truncate">{selectedOption?.label ?? "Select"}</span>
        <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 text-[#8d87a7] transition-transform dark:text-white/45 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen ? (
        <AdhdDropdownPanel
          aria-label={ariaLabel}
          className="max-h-64 overflow-y-auto"
          id={listboxId}
          role="listbox"
          widthClassName="w-full"
        >
          {options.map((option, index) => (
            <button
              aria-selected={option.value === value}
              className={`flex w-full items-center rounded-[0.8rem] px-2 py-1.5 text-left text-[13px] leading-5 transition ${index === highlightedIndex ? "bg-[#f1ecff] text-[#5f4bd7] dark:bg-[#2a2148] dark:text-[#d8d0ff]" : "text-[#5f5876] hover:bg-[#f7f5fb] dark:text-white/75 dark:hover:bg-white/8"}`}
              id={`${listboxId}-option-${index}`}
              key={option.value}
              onClick={() => chooseOption(index)}
              onMouseEnter={() => setHighlightedIndex(index)}
              role="option"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </AdhdDropdownPanel>
      ) : null}
    </div>
  );
}
