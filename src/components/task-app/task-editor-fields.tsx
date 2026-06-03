"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function Pill({
  children,
  onClick,
  selected,
}: {
  children: ReactNode;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <button
      className={`rounded-full px-4 py-2 text-base font-semibold ${
        selected
          ? "bg-[#f4efff] text-[#6f57f6] shadow-[0_10px_24px_rgba(81,61,168,0.08)] dark:bg-[#221a42] dark:text-[#cabfff]"
          : "bg-white text-[#5c647d] shadow-[0_10px_24px_rgba(81,61,168,0.05)] dark:bg-white/8 dark:text-white/70"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function TagChipInput({
  allTags,
  onChange,
  values,
}: {
  allTags: string[];
  onChange: (tags: string[]) => void;
  values: string[];
}) {
  const [input, setInput] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showExistingTags, setShowExistingTags] = useState(false);
  const filtered = allTags.filter((tag) => !values.includes(tag) && tag.toLowerCase().includes(input.toLowerCase()));

  function addTag(tag: string) {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput("");
    setShowDropdown(false);
  }

  return (
    <div className="relative grid gap-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map((tag) => (
          <span className="flex items-center gap-1 rounded-full bg-[#ede8ff] px-2.5 py-0.5 text-xs font-semibold text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]" key={tag}>
            {tag}
            <button className="opacity-60 hover:opacity-100" onClick={() => onChange(values.filter((value) => value !== tag))} type="button">x</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-[0.75rem] bg-[#f7f5ff] px-3 py-2 text-sm text-[#1f2642] outline-none placeholder:text-[#9b9fba] dark:bg-white/8 dark:text-white dark:placeholder:text-white/30"
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          onChange={(event) => {
            setInput(event.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTag(input);
            }
          }}
          placeholder="Add tag..."
          value={input}
        />
        <button
          className="shrink-0 rounded-[0.75rem] bg-[#ede8ff] px-3 py-2 text-sm font-semibold text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]"
          onClick={() => addTag(input)}
          type="button"
        >
          Add
        </button>
        <button
          className={`shrink-0 rounded-[0.75rem] px-3 py-2 text-sm font-semibold ${showExistingTags
            ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]"
            : "bg-[#f6f1ff] text-[#6f57f6] dark:bg-white/8 dark:text-[#cabfff]"}`}
          onClick={() => setShowExistingTags((current) => !current)}
          type="button"
        >
          Existing
        </button>
      </div>
      {showDropdown && filtered.length > 0 ? (
        <div className="adhdice-scrollbar absolute left-0 right-0 top-full z-20 mt-1 max-h-36 overflow-y-auto rounded-[1rem] border border-[#ece8f8] bg-white shadow-lg dark:border-white/10 dark:bg-[#1a1230]">
          {filtered.map((tag) => (
            <button
              className="w-full px-4 py-2 text-left text-sm text-[#1f2642] hover:bg-[#f7f5ff] dark:text-white dark:hover:bg-white/8"
              key={tag}
              onMouseDown={() => addTag(tag)}
              type="button"
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}
      {showExistingTags ? (
        <div className="rounded-[1rem] border border-[#ece8f8] bg-[#fcfbff] p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">Existing Tags</p>
          <div className="flex flex-wrap gap-2">
            {allTags.length === 0 ? (
              <span className="text-sm text-[#8d97b0] dark:text-white/45">No saved tags yet.</span>
            ) : (
              allTags.map((tag) => {
                const selected = values.includes(tag);
                return (
                  <button
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${selected
                      ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]"
                      : "bg-[#ede8ff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]"}`}
                    key={tag}
                    onClick={() => selected ? onChange(values.filter((value) => value !== tag)) : addTag(tag)}
                    type="button"
                  >
                    {tag}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function LabeledInput({
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "date" | "email" | "number" | "text" | "time";
  value: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="ui-field-label dark:text-white/40">{label}</span>
      <input
        className="h-12 rounded-[1rem] bg-[#f7f5ff] px-4 text-base text-[#1f2642] outline-none dark:bg-white/8 dark:text-white"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}

export function ToggleField({
  checked,
  compact = false,
  label,
  onChange,
}: {
  checked: boolean;
  compact?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex items-center justify-between gap-3 rounded-[1rem] bg-[#f7f5ff] dark:bg-white/8 ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
      <span className="text-sm font-semibold text-[#27304c] dark:text-white">{label}</span>
      <input
        checked={checked}
        className="h-5 w-5 rounded"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}

export function CompactSelectField<T extends string>({
  label,
  onChange,
  optionButtonClassName,
  options,
  renderOption,
  triggerClassName,
  renderValueLabel,
  renderValueNode,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  optionButtonClassName?: (value: T, selected: boolean) => string;
  options: readonly T[];
  renderOption?: (value: T, selected: boolean) => ReactNode;
  triggerClassName?: (value: T) => string;
  renderValueLabel?: (value: T) => string;
  renderValueNode?: (value: T) => ReactNode;
  value: T;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <div className="grid gap-2" ref={rootRef}>
      <span className="ui-field-label dark:text-white/40">{label}</span>
      <div className="relative">
        <button
          aria-expanded={isOpen}
          className={`flex h-11 w-full items-center justify-between rounded-full border border-[#ddd6fb] bg-white px-4 text-sm font-semibold text-[#1f2642] shadow-[0_10px_24px_rgba(111,87,246,0.08)] transition hover:border-[#c8bcff] dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:border-white/20 ${triggerClassName ? triggerClassName(value) : ""}`}
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <span>{renderValueNode ?? renderValueLabel ? (renderValueNode ? renderValueNode(value) : renderValueLabel?.(value)) : formatOptionLabel(value)}</span>
          <ChevronDown className={`h-4 w-4 text-[#6f57f6] transition-transform dark:text-[#cabfff] ${isOpen ? "rotate-180" : ""}`} />
        </button>
        {isOpen ? (
          <div className="absolute left-0 top-[calc(100%+0.5rem)] z-30 min-w-full overflow-hidden rounded-[1.1rem] border border-[#ddd6fb] bg-white p-2 shadow-[0_22px_60px_rgba(56,42,116,0.18)] dark:border-white/10 dark:bg-[#241d3f]">
            <div className="grid gap-1">
              {options.map((option) => {
                const isSelected = option === value;
                return (
                  <button
                    className={`flex w-full items-center justify-between rounded-[0.9rem] px-3 py-2 text-left text-sm font-semibold transition-colors ${optionButtonClassName
                      ? optionButtonClassName(option, isSelected)
                      : isSelected
                        ? "bg-[#f2edff] text-[#6f57f6] dark:bg-[#312555] dark:text-[#cabfff]"
                        : "text-[#3a4260] hover:bg-[#f7f4ff] dark:text-white/80 dark:hover:bg-white/8"}`}
                    key={option}
                    onClick={() => {
                      onChange(option);
                      setIsOpen(false);
                    }}
                    type="button"
                  >
                    <span>{renderOption ? renderOption(option, isSelected) : renderValueLabel ? renderValueLabel(option) : formatOptionLabel(option)}</span>
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

export function CompactDateTimeField({
  clearLabel,
  label,
  onChange,
  onClear,
  type,
  value,
}: {
  clearLabel: string;
  label: string;
  onChange: (value: string) => void;
  onClear: () => void;
  type: "date" | "time";
  value: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">{label}</span>
      <div className="relative">
        <input
          className={`h-11 w-full rounded-[1rem] border border-[#ece6fb] bg-white px-4 text-sm outline-none ${value ? "text-[#1f2642] dark:text-white" : "text-[#9b9fba] dark:text-white/30"} dark:border-white/10 dark:bg-white/8`}
          onChange={(event) => onChange(event.target.value)}
          type={type}
          value={value}
        />
        {value ? (
          <button
            aria-label={clearLabel}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-xs text-[#9b9fba] hover:text-[#f05566] dark:text-white/30 dark:hover:text-[#ff9eaf]"
            onClick={onClear}
            type="button"
          >
            x
          </button>
        ) : null}
      </div>
    </label>
  );
}

export function EditorCollapsibleSection({
  children,
  defaultOpen = false,
  headerAccessory,
  summary,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  headerAccessory?: ReactNode;
  summary?: string;
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="rounded-[1.25rem] border border-[#ece8f8] bg-[#fcfbff] dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-start gap-3 px-4 py-4">
        <button
          aria-expanded={isOpen}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <div className="min-w-0">
            <p className="ui-display-font text-sm uppercase tracking-[0.18em] text-[#7a63f7] dark:text-[#c9bbff]">{title}</p>
            {summary ? <p className="mt-1 text-sm text-[#7d88a1] dark:text-white/50">{summary}</p> : null}
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f2edff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]">
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>
        {headerAccessory ? <div className="shrink-0">{headerAccessory}</div> : null}
      </div>
      {isOpen ? <div className="grid gap-4 px-4 pb-4">{children}</div> : null}
    </section>
  );
}

function formatOptionLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
