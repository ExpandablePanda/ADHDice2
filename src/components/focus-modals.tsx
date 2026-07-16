import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { type FocusCategory, type FocusType, type FocusSubtype, type FocusLabelOptions } from "@/lib/types";
import { getLogicalDayKey } from "@/lib/logical-day";
import { CategoryIcon } from "./task-app";
import { ModalShell } from "./modal-shell";

const manualInputClassName = "h-12 rounded-full border border-[#ddd6fb] bg-white px-4 text-sm font-semibold text-[#1f2642] shadow-[0_10px_24px_rgba(111,87,246,0.08)] outline-none transition placeholder:text-[#a59cc7] focus:border-[#c8bcff] dark:border-white/10 dark:bg-white/8 dark:text-white dark:placeholder:text-white/35 dark:focus:border-white/20";

type ManualSelectOption = {
  label: string;
  value: string;
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="ui-field-label dark:text-white/40">{children}</span>;
}

function ManualSuggestionInput({
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
  const rootRef = useRef<HTMLLabelElement>(null);
  const normalizedValue = value.trim().toLowerCase();
  const hasExactMatch = options.some((option) => option.trim().toLowerCase() === normalizedValue);
  const hasSelectedTone = forceSelectedTone || hasExactMatch;
  const filteredOptions = options.filter((option) => {
    const normalizedOption = option.trim().toLowerCase();
    if (!normalizedValue) {
      return true;
    }
    return normalizedOption.includes(normalizedValue);
  }).slice(0, 8);

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

  return (
    <label
      className="flex flex-col gap-2"
      onKeyDown={(event) => {
        if (event.key === "Escape" && isOpen) {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen(false);
        }
      }}
      ref={rootRef}
    >
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <input
          className={`w-full pr-11 px-4 py-2 ui-input-light ${manualInputClassName} ${hasSelectedTone ? "text-[#6f57f6] placeholder:text-[#8b70ff] dark:text-[#cabfff] dark:placeholder:text-[#cabfff]/70" : ""}`}
          onChange={(event) => {
            onChange(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          type="text"
          value={value}
        />
        <button
          aria-expanded={isOpen}
          className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center justify-center text-[#6f57f6] dark:text-[#cabfff]"
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
        {isOpen && filteredOptions.length > 0 ? (
          <div className="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-full overflow-hidden rounded-[1.1rem] border border-[#ddd6fb] bg-white p-2 shadow-[0_22px_60px_rgba(56,42,116,0.18)] dark:border-white/10 dark:bg-[#241d3f]">
            <div className="grid gap-1">
              {filteredOptions.map((option) => {
                const isSelected = option.trim().toLowerCase() === normalizedValue;
                return (
                  <button
                    className={`flex w-full items-center rounded-[0.9rem] px-3 py-2 text-left text-sm font-semibold transition-colors ${isSelected
                      ? "bg-[#f2edff] text-[#6f57f6] dark:bg-[#312555] dark:text-[#cabfff]"
                      : "text-[#3a4260] hover:bg-[#f7f4ff] dark:text-white/80 dark:hover:bg-white/8"}`}
                    key={option}
                    onClick={() => {
                      onChange(option);
                      setIsOpen(false);
                    }}
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

function ManualPillSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: ManualSelectOption[];
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? "";

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

  return (
    <div
      className="grid gap-2"
      onKeyDown={(event) => {
        if (event.key === "Escape" && isOpen) {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen(false);
        }
      }}
      ref={rootRef}
    >
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <button
          aria-expanded={isOpen}
          className="flex h-12 w-full items-center justify-between rounded-full border border-[#ddd6fb] bg-white px-4 text-sm font-semibold text-[#1f2642] shadow-[0_10px_24px_rgba(111,87,246,0.08)] transition hover:border-[#c8bcff] dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:border-white/20"
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <span className="truncate pr-3 text-left">{selectedLabel}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[#6f57f6] transition-transform dark:text-[#cabfff] ${isOpen ? "rotate-180" : ""}`} />
        </button>
        {isOpen ? (
          <div className="absolute left-0 top-[calc(100%+0.5rem)] z-30 min-w-full overflow-hidden rounded-[1.1rem] border border-[#ddd6fb] bg-white p-2 shadow-[0_22px_60px_rgba(56,42,116,0.18)] dark:border-white/10 dark:bg-[#241d3f]">
            <div className="grid gap-1">
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    className={`flex w-full items-center rounded-[0.9rem] px-3 py-2 text-left text-sm font-semibold transition-colors ${isSelected
                      ? "bg-[#f2edff] text-[#6f57f6] dark:bg-[#312555] dark:text-[#cabfff]"
                      : "text-[#3a4260] hover:bg-[#f7f4ff] dark:text-white/80 dark:hover:bg-white/8"}`}
                    key={option.value}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
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

function SearchableManualPillSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: ManualSelectOption[];
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? "";
  const filteredOptions = options.filter((option) => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  return (
    <div className="grid gap-2" ref={rootRef}>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <input
          aria-expanded={isOpen}
          aria-label={label}
          className={`w-full pr-11 ${manualInputClassName}`}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setIsOpen(true);
          }}
          onFocus={() => {
            setQuery("");
            setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
            setIsOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setIsOpen(false);
              return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const direction = event.key === "ArrowDown" ? 1 : -1;
              setActiveIndex((current) => Math.max(0, Math.min(filteredOptions.length - 1, current + direction)));
              return;
            }
            if (event.key === "Enter" && isOpen && filteredOptions[activeIndex]) {
              event.preventDefault();
              onChange(filteredOptions[activeIndex].value);
              setQuery("");
              setIsOpen(false);
            }
          }}
          placeholder={selectedLabel}
          value={query}
        />
        <ChevronDown className={`pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6f57f6] transition-transform dark:text-[#cabfff] ${isOpen ? "rotate-180" : ""}`} />
        {isOpen ? (
          <div className="absolute left-0 top-[calc(100%+0.5rem)] z-30 max-h-64 w-full overflow-y-auto rounded-[1.1rem] border border-[#ddd6fb] bg-white p-2 shadow-[0_22px_60px_rgba(56,42,116,0.18)] dark:border-white/10 dark:bg-[#241d3f]">
            {filteredOptions.map((option, index) => (
              <button
                className={`flex w-full items-center rounded-[0.9rem] px-3 py-2 text-left text-sm font-semibold ${index === activeIndex || option.value === value ? "bg-[#f2edff] text-[#6f57f6] dark:bg-[#312555] dark:text-[#cabfff]" : "text-[#3a4260] hover:bg-[#f7f4ff] dark:text-white/80 dark:hover:bg-white/8"}`}
                key={option.value}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  onChange(option.value);
                  setQuery("");
                  setIsOpen(false);
                }}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function todayLocalISO() {
  return getLogicalDayKey();
}

function currentTimeValue() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function resolveSessionLogDate(sessionStartTime: number | null) {
  if (sessionStartTime) {
    return getLogicalDayKey(new Date(sessionStartTime));
  }

  return getLogicalDayKey();
}

export function SessionFinishModal({
  category,
  durationSeconds,
  labelOptions,
  onConfirm,
  onCancel,
  sessionStartTime,
}: {
  category: FocusCategory;
  durationSeconds: number;
  labelOptions: FocusLabelOptions;
  onConfirm: (data: { title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; notes: string; date: string; completionTime?: string }) => void;
  onCancel: () => void;
  sessionStartTime: number | null;
}) {
  const [title, setTitle] = useState(category.title);
  const [focusType, setFocusType] = useState<FocusType>(category.focusType);
  const [focusSubtype, setFocusSubtype] = useState<FocusSubtype>(category.focusSubtype ?? "");
  const [focusSubtype2, setFocusSubtype2] = useState(category.focusSubtype2 ?? "");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(resolveSessionLogDate(sessionStartTime));
  const [completionTime, setCompletionTime] = useState(currentTimeValue());

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return `${m}m ${rs}s`;
  };

  return (
    <ModalShell className="flex w-full max-w-lg max-h-[82vh] flex-col overflow-hidden rounded-[var(--radius-modal)] border p-8 shadow-[var(--shadow-modal)] border-[var(--border-soft)] bg-[var(--surface-elevated)] dark:border-white/10 dark:bg-[#171329]" onClose={onCancel}>
        <div className="flex shrink-0 flex-col items-center text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl" style={{ backgroundColor: category.color + "20", color: category.color }}>
            <CategoryIcon name={category.icon} className="h-10 w-10" />
          </div>
          <h2 className="text-3xl font-black text-[var(--text-primary)]">Session Complete</h2>
          <p className="mt-2 text-lg font-bold text-[var(--accent)]">
            {category.title} • {formatTime(durationSeconds)}
          </p>
        </div>

        <div className="adhdice-scrollbar mt-8 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="space-y-6">
          <ManualSuggestionInput
            label="Session Title"
            onChange={setTitle}
            options={labelOptions.titles}
            value={title}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ManualSuggestionInput
              label="Focus Type"
              onChange={(value) => setFocusType(value as FocusType)}
              options={labelOptions.types}
              value={focusType}
            />
            <ManualSuggestionInput
              label="Subtype"
              onChange={(value) => setFocusSubtype(value as FocusSubtype)}
              options={labelOptions.primarySubtypes}
              value={focusSubtype}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <FieldLabel>Completion Date</FieldLabel>
              <input
                className={`px-4 py-3 ui-input-light ${manualInputClassName}`}
                onChange={(e) => setDate(e.target.value)}
                type="date"
                value={date}
              />
            </label>
            <label className="flex flex-col gap-2">
              <FieldLabel>Completion Time</FieldLabel>
              <input
                className={`px-4 py-3 ui-input-light ${manualInputClassName}`}
                onChange={(e) => setCompletionTime(e.target.value)}
                type="time"
                value={completionTime}
              />
            </label>
          </div>

          <ManualSuggestionInput
            label="Subtype 2"
            onChange={setFocusSubtype2}
            options={labelOptions.secondarySubtypes}
            placeholder="Optional"
            value={focusSubtype2}
          />

          <label className="flex flex-col gap-2">
            <FieldLabel>Session Notes</FieldLabel>
            <textarea
              className="min-h-[100px] resize-none rounded-[1.25rem] border border-[#ddd6fb] bg-white px-4 py-3 text-sm font-semibold text-[#1f2642] shadow-[0_10px_24px_rgba(111,87,246,0.08)] outline-none transition placeholder:text-[#a59cc7] focus:border-[#c8bcff] dark:border-white/10 dark:bg-white/8 dark:text-white dark:placeholder:text-white/35 dark:focus:border-white/20"
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What did you accomplish?"
              value={notes}
            />
          </label>
          </div>
        </div>

        <div className="mt-8 flex shrink-0 gap-4">
          <button
            className="ui-pill-button-light transition hover:bg-white/5 dark:bg-transparent dark:text-white dark:rounded-full"
            onClick={onCancel}
            type="button"
          >
            Discard
          </button>
          <button
            className="ui-pill-button-strong-light transition hover:scale-105 dark:rounded-full dark:bg-[#6f57f6] dark:text-white dark:shadow-xl dark:shadow-[#6f57f6]/30"
            onClick={() => onConfirm({ title, focusType, focusSubtype: focusSubtype.trim() || null, focusSubtype2: focusSubtype2.trim() || null, notes, date, completionTime })}
            type="button"
          >
            Save Session
          </button>
        </div>
    </ModalShell>
  );
}

export function ManualEntryModal({
  categories,
  completionError = null,
  initialDurationSeconds,
  initialTitle,
  labelOptions,
  mode = "entry",
  onClear,
  onRetryCompletion,
  onSave,
  onClose,
}: {
  categories: FocusCategory[];
  completionError?: string | null;
  initialDurationSeconds?: number;
  initialTitle?: string;
  labelOptions: FocusLabelOptions;
  mode?: "entry" | "saving_evidence" | "completing" | "failed_completion";
  onClear?: () => Promise<boolean> | boolean;
  onRetryCompletion?: () => Promise<boolean> | boolean;
  onSave: (data: { categoryId: string | null; title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; durationSeconds: number; date: string; completionTime?: string; notes: string }) => Promise<boolean>;
  onClose: () => void;
}) {
  const initialTotalMinutes = initialDurationSeconds ? Math.max(0, Math.round(initialDurationSeconds / 60)) : 0;
  const [catId, setCatId] = useState(categories[0]?.id ?? "__none__");
  const [hours, setHours] = useState(String(Math.floor(initialTotalMinutes / 60)));
  const [minutes, setMinutes] = useState(String(initialTotalMinutes % 60));
  const [date, setDate] = useState(todayLocalISO());
  const [completionTime, setCompletionTime] = useState(currentTimeValue());
  const [title, setTitle] = useState(initialTitle ?? categories[0]?.title ?? "");
  const [focusType, setFocusType] = useState<FocusType>(categories[0]?.focusType ?? "Work");
  const [focusSubtype, setFocusSubtype] = useState<FocusSubtype>(categories[0]?.focusSubtype ?? "");
  const [focusSubtype2, setFocusSubtype2] = useState(categories[0]?.focusSubtype2 ?? "");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const evidenceSaved = mode === "completing" || mode === "failed_completion";

  const handleCategoryChange = (id: string) => {
    setCatId(id);
    if (id === "__none__") {
      return;
    }

    const cat = categories.find((c) => c.id === id);
    if (cat) {
      setTitle(cat.title);
      setFocusType(cat.focusType);
      setFocusSubtype(cat.focusSubtype ?? "");
      setFocusSubtype2(cat.focusSubtype2 ?? "");
    }
  };

  const submit = async () => {
    if (mode !== "entry") return;
    const totalSeconds = (parseInt(hours) || 0) * 3600 + (parseInt(minutes) || 0) * 60;
    if (totalSeconds <= 0 || !title.trim() || !focusType.trim()) return;
    setIsSaving(true);
    try {
      await onSave({
        categoryId: catId === "__none__" ? null : catId,
        title,
        focusType,
        focusSubtype: focusSubtype.trim() || null,
        focusSubtype2: focusSubtype2.trim() || null,
        durationSeconds: totalSeconds,
        date,
        completionTime,
        notes,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const clear = async () => {
    if (!onClear) {
      return;
    }
    setIsClearing(true);
    try {
      await onClear();
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <ModalShell className="adhdice-scrollbar w-full max-w-2xl max-h-[82vh] overflow-y-auto rounded-[var(--radius-modal)] border p-8 shadow-[var(--shadow-modal)] border-[var(--border-soft)] bg-[var(--surface-elevated)] dark:border-white/10 dark:bg-[#171329]" onClose={mode === "entry" ? onClose : () => undefined}>
        <h2 className="ui-display-font text-center text-3xl tracking-[0.08em] text-[#6f57f6] dark:text-[#cabfff]">{evidenceSaved ? "Actual Time Saved" : "Manual Entry"}</h2>
        {evidenceSaved ? <div className={`mt-6 rounded-[1.25rem] border px-4 py-3 text-sm font-semibold ${mode === "failed_completion" ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200" : "border-[#ddd2ff] bg-[#f5f1ff] text-[#5b46cf] dark:border-white/10 dark:bg-white/[0.05] dark:text-[#cabfff]"}`}>{mode === "failed_completion" ? completionError : "Actual-time evidence is saved. Finishing the task now…"}</div> : null}

        <div className="mt-10 space-y-6">
          <SearchableManualPillSelect
            label="Saved Category"
            onChange={handleCategoryChange}
            options={[
              { label: "No saved category", value: "__none__" },
              ...categories
                .map((category) => ({ label: category.title, value: category.id }))
                .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" })),
            ]}
            value={catId}
          />

          <ManualSuggestionInput
            label="Session Title"
            onChange={setTitle}
            options={labelOptions.titles}
            placeholder="Deep Work"
            value={title}
          />

          <div className="grid gap-4 sm:grid-cols-[minmax(0,7rem)_minmax(0,7rem)_minmax(0,1fr)_minmax(0,1fr)]">
            <label className="flex flex-col gap-2">
              <FieldLabel>Hours</FieldLabel>
              <input className={`px-4 py-2 ui-input-light ${manualInputClassName}`} min="0" onChange={(e) => setHours(e.target.value)} type="number" value={hours} />
            </label>
            <label className="flex flex-col gap-2">
              <FieldLabel>Minutes</FieldLabel>
              <input className={`px-4 py-2 ui-input-light ${manualInputClassName}`} max="59" min="0" onChange={(e) => setMinutes(e.target.value)} type="number" value={minutes} />
            </label>
            <label className="flex flex-col gap-2">
              <FieldLabel>Date</FieldLabel>
              <input className={`px-4 py-3 ui-input-light ${manualInputClassName}`} onChange={(e) => setDate(e.target.value)} type="date" value={date} />
            </label>
            <label className="flex flex-col gap-2">
              <FieldLabel>Time</FieldLabel>
              <input className={`px-4 py-3 ui-input-light ${manualInputClassName}`} onChange={(e) => setCompletionTime(e.target.value)} type="time" value={completionTime} />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ManualSuggestionInput
              label="Focus Type"
              onChange={(value) => setFocusType(value as FocusType)}
              options={labelOptions.types}
              placeholder="Work"
              value={focusType}
            />

            <ManualSuggestionInput
              label="Subtype"
              onChange={(value) => setFocusSubtype(value as FocusSubtype)}
              options={labelOptions.primarySubtypes}
              placeholder="Productive"
              value={focusSubtype}
            />
            <ManualSuggestionInput
              forceSelectedTone
              label="Subtype 2"
              onChange={setFocusSubtype2}
              options={labelOptions.secondarySubtypes}
              placeholder="Optional"
              value={focusSubtype2}
            />
          </div>

          <label className="flex flex-col gap-2">
            <FieldLabel>Notes</FieldLabel>
            <textarea
              className="min-h-[80px] resize-none rounded-[1.25rem] border border-[#ddd6fb] bg-white px-4 py-3 text-sm font-semibold text-[#1f2642] shadow-[0_10px_24px_rgba(111,87,246,0.08)] outline-none transition placeholder:text-[#a59cc7] focus:border-[#c8bcff] dark:border-white/10 dark:bg-white/8 dark:text-white dark:placeholder:text-white/35 dark:focus:border-white/20"
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What happened during this time?"
              value={notes}
            />
          </label>
        </div>

        <div className="mt-10 flex gap-4">
          {onClear && !evidenceSaved ? (
            <button
              className="ui-pill-button-danger-light transition hover:bg-[#ffe6ea] dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf]"
              disabled={isSaving || isClearing}
              onClick={() => void clear()}
              type="button"
            >
              {isClearing ? "Clearing..." : "Clear Actual Time"}
            </button>
          ) : null}
          {!evidenceSaved ? <button
            className="ui-pill-button-light transition hover:bg-white/5 dark:bg-transparent dark:text-white dark:rounded-full"
            onClick={onClose}
            type="button"
            disabled={isSaving || isClearing}
          >
            Cancel
          </button> : null}
          {mode === "failed_completion" ? <button
            className="ui-pill-button-strong-light transition hover:scale-105 dark:rounded-full dark:bg-[#6f57f6] dark:text-white dark:shadow-xl dark:shadow-[#6f57f6]/30"
            onClick={() => { void onRetryCompletion?.(); }}
            type="button"
          >
            Retry completion
          </button> : <button
            className="ui-pill-button-strong-light transition hover:scale-105 dark:rounded-full dark:bg-[#6f57f6] dark:text-white dark:shadow-xl dark:shadow-[#6f57f6]/30"
            disabled={mode !== "entry" || isSaving || isClearing || !title.trim() || !focusType.trim()}
            onClick={() => void submit()}
            type="button"
          >
            {mode === "completing" ? "Completing task…" : mode === "saving_evidence" ? "Saving evidence…" : isSaving ? "Saving..." : "Log Entry"}
          </button>}
        </div>
    </ModalShell>
  );
}
