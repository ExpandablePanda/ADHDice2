import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { focusDropdownControl, revealDropdownOptionWithinPanel, shouldCloseDropdownOnFocusLeave, shouldCloseDropdownOnTab } from "@/lib/dropdown-interaction";

export type FocusSelectOption = {
  label: string;
  value: string;
};

const focusFieldInputClassName = "h-12 rounded-full border border-[#ddd6fb] bg-white px-4 text-sm font-semibold text-[#1f2642] shadow-[0_10px_24px_rgba(111,87,246,0.08)] outline-none transition placeholder:text-[#a59cc7] focus:border-[#c8bcff] dark:border-white/10 dark:bg-white/8 dark:text-white dark:placeholder:text-white/35 dark:focus:border-white/20";

function FocusFieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="ui-field-label dark:text-white/40">{children}</span>;
}

export function FocusSuggestionInput({
  forceSelectedTone = false,
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  forceSelectedTone?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const rootRef = useRef<HTMLLabelElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const highlightedOptionRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = useId();
  const normalizedValue = value.trim().toLowerCase();
  const hasExactMatch = options.some((option) => option.trim().toLowerCase() === normalizedValue);
  const hasSelectedTone = forceSelectedTone || hasExactMatch;
  const filteredOptions = useMemo(
    () =>
      options
        .filter((option) => {
          const normalizedOption = option.trim().toLowerCase();
          if (!normalizedValue) {
            return true;
          }
          return normalizedOption.includes(normalizedValue);
        })
        .slice(0, 8),
    [normalizedValue, options],
  );
  const safeHighlightedIndex = Math.min(highlightedIndex, Math.max(0, filteredOptions.length - 1));

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [normalizedValue]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    revealDropdownOptionWithinPanel(highlightedOptionRef.current, panelRef.current);
  }, [isOpen, filteredOptions.length, normalizedValue, safeHighlightedIndex]);

  const selectOption = (nextValue: string) => {
    onChange(nextValue);
    setIsOpen(false);
    setHighlightedIndex(0);
  };

  return (
    <label
      className="flex flex-col gap-2"
      onBlur={(event) => {
        if (shouldCloseDropdownOnFocusLeave(rootRef.current, event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          if (!filteredOptions.length) {
            return;
          }
          event.preventDefault();
          setIsOpen(true);
          setHighlightedIndex((current) => (current + 1) % filteredOptions.length);
          return;
        }

        if (event.key === "ArrowUp") {
          if (!filteredOptions.length) {
            return;
          }
          event.preventDefault();
          setIsOpen(true);
          setHighlightedIndex((current) => (current - 1 + filteredOptions.length) % filteredOptions.length);
          return;
        }

        if (event.key === "Enter" && isOpen && filteredOptions[safeHighlightedIndex]) {
          event.preventDefault();
          selectOption(filteredOptions[safeHighlightedIndex]);
          return;
        }

        if (shouldCloseDropdownOnTab(event.key, isOpen)) {
          setIsOpen(false);
          return;
        }

        if (event.key === "Escape" && isOpen) {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen(false);
        }
      }}
      ref={rootRef}
    >
      <FocusFieldLabel>{label}</FocusFieldLabel>
      <div className="relative">
        <input
          aria-activedescendant={isOpen && filteredOptions[safeHighlightedIndex] ? `${listboxId}-option-${safeHighlightedIndex}` : undefined}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          className={`w-full pr-11 px-4 py-2 ui-input-light ${focusFieldInputClassName} ${hasSelectedTone ? "text-[#6f57f6] placeholder:text-[#8b70ff] dark:text-[#cabfff] dark:placeholder:text-[#cabfff]/70" : ""}`}
          onChange={(event) => {
            onChange(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          role="combobox"
          ref={inputRef}
          type="text"
          value={value}
        />
        <button
          aria-expanded={isOpen}
          className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center justify-center text-[#6f57f6] dark:text-[#cabfff]"
          onClick={() => {
            if (isOpen) {
              setIsOpen(false);
              return;
            }

            focusDropdownControl(inputRef.current);
            setIsOpen(true);
          }}
          type="button"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
        {isOpen && filteredOptions.length > 0 ? (
          <div
            className="adhdice-scrollbar absolute left-0 top-[calc(100%+0.5rem)] z-30 max-h-64 w-full overflow-y-auto rounded-[1.1rem] border border-[#ddd6fb] bg-white p-2 shadow-[0_22px_60px_rgba(56,42,116,0.18)] dark:border-white/10 dark:bg-[#241d3f]"
            id={listboxId}
            ref={panelRef}
            role="listbox"
          >
            <div className="grid gap-1">
              {filteredOptions.map((option, index) => {
                const isHighlighted = index === safeHighlightedIndex;
                const isSelected = option.trim().toLowerCase() === normalizedValue;
                return (
                  <button
                    aria-selected={isSelected}
                    className={`flex w-full items-center rounded-[0.9rem] px-3 py-2 text-left text-sm font-semibold transition-colors ${
                      isSelected || isHighlighted
                        ? "bg-[#f2edff] text-[#6f57f6] dark:bg-[#312555] dark:text-[#cabfff]"
                        : "text-[#3a4260] hover:bg-[#f7f4ff] dark:text-white/80 dark:hover:bg-white/8"
                    }`}
                    id={`${listboxId}-option-${index}`}
                    key={option}
                    onClick={() => selectOption(option)}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    ref={index === safeHighlightedIndex ? highlightedOptionRef : undefined}
                    role="option"
                    tabIndex={-1}
                    type="button"
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </label>
  );
}

export function FocusPillSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: FocusSelectOption[];
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(() => Math.max(0, options.findIndex((option) => option.value === value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const highlightedOptionRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = useId();
  const selectedLabel = options.find((option) => option.value === value)?.label ?? "";
  const safeHighlightedIndex = Math.min(highlightedIndex, Math.max(0, options.length - 1));

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

  useEffect(() => {
    const selectedIndex = options.findIndex((option) => option.value === value);
    setHighlightedIndex(Math.max(0, selectedIndex));
  }, [options, value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    revealDropdownOptionWithinPanel(highlightedOptionRef.current, panelRef.current);
  }, [isOpen, options.length, safeHighlightedIndex, value]);

  const selectOption = (nextValue: string) => {
    onChange(nextValue);
    setIsOpen(false);
  };

  return (
    <div
      className="grid gap-2"
      onBlur={(event) => {
        if (shouldCloseDropdownOnFocusLeave(rootRef.current, event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (!options.length) {
          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          setIsOpen(true);
          setHighlightedIndex((current) => (current + 1) % options.length);
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          setIsOpen(true);
          setHighlightedIndex((current) => (current - 1 + options.length) % options.length);
          return;
        }

        if (event.key === "Enter" && isOpen && options[safeHighlightedIndex]) {
          event.preventDefault();
          selectOption(options[safeHighlightedIndex].value);
          return;
        }

        if (event.key === "Escape" && isOpen) {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen(false);
          return;
        }

        if (shouldCloseDropdownOnTab(event.key, isOpen)) {
          setIsOpen(false);
        }
      }}
      ref={rootRef}
    >
      <FocusFieldLabel>{label}</FocusFieldLabel>
      <div className="relative">
        <button
          aria-activedescendant={isOpen && options[safeHighlightedIndex] ? `${listboxId}-option-${options[safeHighlightedIndex].value}` : undefined}
          aria-controls={listboxId}
          aria-expanded={isOpen}
          className={`flex h-12 w-full items-center justify-between ${focusFieldInputClassName}`}
          onClick={() => {
            focusDropdownControl(triggerRef.current);
            setIsOpen((current) => !current);
          }}
          role="combobox"
          ref={triggerRef}
          type="button"
        >
          <span className="truncate pr-3 text-left">{selectedLabel}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[#6f57f6] transition-transform dark:text-[#cabfff] ${isOpen ? "rotate-180" : ""}`} />
        </button>
        {isOpen ? (
          <div
            className="adhdice-scrollbar absolute left-0 top-[calc(100%+0.5rem)] z-30 max-h-64 min-w-full overflow-y-auto rounded-[1.1rem] border border-[#ddd6fb] bg-white p-2 shadow-[0_22px_60px_rgba(56,42,116,0.18)] dark:border-white/10 dark:bg-[#241d3f]"
            id={listboxId}
            ref={panelRef}
            role="listbox"
          >
            <div className="grid gap-1">
              {options.map((option, index) => {
                const isHighlighted = index === safeHighlightedIndex;
                const isSelected = option.value === value;
                return (
                  <button
                    aria-selected={isSelected}
                    className={`flex w-full items-center rounded-[0.9rem] px-3 py-2 text-left text-sm font-semibold transition-colors ${
                      isSelected || isHighlighted
                        ? "bg-[#f2edff] text-[#6f57f6] dark:bg-[#312555] dark:text-[#cabfff]"
                        : "text-[#3a4260] hover:bg-[#f7f4ff] dark:text-white/80 dark:hover:bg-white/8"
                    }`}
                    id={`${listboxId}-option-${option.value}`}
                    key={option.value}
                    onClick={() => selectOption(option.value)}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    ref={index === safeHighlightedIndex ? highlightedOptionRef : undefined}
                    role="option"
                    tabIndex={-1}
                    type="button"
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
