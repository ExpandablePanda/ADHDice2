"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { AdhdDropdownPanel } from "@/components/ui-system/adhd-dropdown-panel";

export const HEALTH_COMPACT_CONTROL_CLASS = "health-input !h-[26px] !min-h-[26px] !rounded-full !px-2 !py-1 !text-[13px] !leading-none";
export const HEALTH_COMPACT_INPUT_CLASS = `${HEALTH_COMPACT_CONTROL_CLASS} max-sm:!text-[16px]`;

export type HealthDropdownOption = {
  label: string;
  value: string;
};

export type HealthAutocompleteSuggestion = {
  label: string;
  value: string;
};

export function HealthAutocomplete({
  ariaLabel,
  id,
  onChange,
  onSelect,
  placeholder,
  suggestions,
  value,
}: {
  ariaLabel: string;
  id?: string;
  onChange: (value: string) => void;
  onSelect?: (suggestion: HealthAutocompleteSuggestion) => void;
  placeholder?: string;
  suggestions: Array<string | HealthAutocompleteSuggestion>;
  value: string;
}) {
  const generatedId = useId();
  const listboxId = id ? `${id}-listbox` : `${generatedId}-listbox`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const highlightedOptionRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const normalizedSuggestions = suggestions.map((suggestion) => typeof suggestion === "string"
    ? { label: suggestion, value: suggestion }
    : suggestion);
  const matchingSuggestions = normalizedSuggestions.filter((suggestion) => suggestion.label.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()));

  useEffect(() => {
    function handleOutsidePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    highlightedOptionRef.current?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex, isOpen, matchingSuggestions.length]);

  function chooseSuggestion(index: number) {
    const suggestion = matchingSuggestions[index];
    if (suggestion === undefined) {
      return;
    }
    onChange(suggestion.label);
    onSelect?.(suggestion);
    setIsOpen(false);
  }

  return (
    <div className="relative w-full" ref={rootRef}>
      <input
        aria-activedescendant={isOpen && matchingSuggestions[highlightedIndex] ? `${listboxId}-option-${highlightedIndex}` : undefined}
        aria-autocomplete="list"
        aria-controls={isOpen ? listboxId : undefined}
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        className={HEALTH_COMPACT_INPUT_CLASS}
        id={id}
        onChange={(event) => {
          onChange(event.target.value);
          setHighlightedIndex(0);
          setIsOpen(true);
        }}
        onFocus={() => {
          setHighlightedIndex(0);
          setIsOpen(true);
        }}
        placeholder={placeholder}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && matchingSuggestions.length > 0) {
            event.preventDefault();
            setIsOpen(true);
            setHighlightedIndex((current) => (current + 1) % matchingSuggestions.length);
          } else if (event.key === "ArrowUp" && matchingSuggestions.length > 0) {
            event.preventDefault();
            setIsOpen(true);
            setHighlightedIndex((current) => (current - 1 + matchingSuggestions.length) % matchingSuggestions.length);
          } else if (event.key === "Enter" && isOpen && matchingSuggestions.length > 0) {
            event.preventDefault();
            chooseSuggestion(highlightedIndex);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setIsOpen(false);
          }
        }}
        role="combobox"
        value={value}
      />
      {isOpen && matchingSuggestions.length > 0 ? (
        <AdhdDropdownPanel
          aria-label={`${ariaLabel} suggestions`}
          className="adhdice-scrollbar max-h-64 overflow-y-auto"
          id={listboxId}
          role="listbox"
          widthClassName="w-full"
        >
          {matchingSuggestions.map((suggestion, index) => (
            <button
              aria-selected={index === highlightedIndex}
              className={`flex w-full items-center rounded-[0.8rem] px-2 py-1.5 text-left text-[13px] leading-5 transition ${index === highlightedIndex ? "bg-[#f1ecff] text-[#5f4bd7] dark:bg-[#2a2148] dark:text-[#d8d0ff]" : "text-[#5f5876] hover:bg-[#f7f5fb] dark:text-white/75 dark:hover:bg-white/8"}`}
              id={`${listboxId}-option-${index}`}
              key={`${suggestion.value}-${index}`}
              onClick={() => chooseSuggestion(index)}
              onMouseEnter={() => setHighlightedIndex(index)}
              ref={index === highlightedIndex ? highlightedOptionRef : undefined}
              role="option"
              type="button"
            >
              {suggestion.label}
            </button>
          ))}
        </AdhdDropdownPanel>
      ) : null}
    </div>
  );
}

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
  const highlightedOptionRef = useRef<HTMLButtonElement | null>(null);
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

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    highlightedOptionRef.current?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex, isOpen, options.length]);

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
        className={`${HEALTH_COMPACT_CONTROL_CLASS} flex items-center justify-between gap-2 text-left ${className ?? ""}`}
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
          className="adhdice-scrollbar max-h-64 overflow-y-auto"
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
              ref={index === highlightedIndex ? highlightedOptionRef : undefined}
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
